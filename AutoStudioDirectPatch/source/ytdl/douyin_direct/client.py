"""Cookie-authenticated Douyin read API, with pinned local request signing.

No browser/extension, CAPTCHA solver, session rotation or proxy rotation.
Real acceptance of a_bogus must be tested on the user's connection.
"""
import http.cookiejar
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from .signing import NativeSigner
from .vendor.native import websign
from .vendor.token_template import TOKEN_PAYLOAD

SIGNER_VERSION = 'native-3c045e1-bdms119-websign140'
API_ORIGIN = 'https://www.douyin.com'
TOKEN_URL = 'https://mssdk.bytedance.com/web/r/token?ms_appid=6383'


class NoTokenRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise DouyinError('session_redirect', 'Dịch vụ token chuyển hướng ngoài dự kiến; đã dừng.')

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
FINGERPRINT = '1920|1080|1920|1080|0|0|0|0|1920|1080|1920|1040|1920|1080|24|24|Win32'


class DouyinError(RuntimeError):
    def __init__(self, kind, message, retry_after=0):
        super().__init__(message)
        self.kind = kind
        self.retry_after = retry_after


class ScanStopped(Exception):
    pass


def checked_url(text):
    match = re.search(r'https?://[^\s<>"\']+', str(text))
    if not match:
        raise DouyinError('invalid_url', 'Chưa có link Douyin hợp lệ.')
    url = match.group().rstrip('，。；),]')
    if len(url) > 4096:
        raise DouyinError('invalid_url', 'Link Douyin quá dài.')
    p = urllib.parse.urlparse(url)
    host = (p.hostname or '').lower()
    if p.scheme != 'https' or p.username or p.password or not (host == 'douyin.com' or host.endswith('.douyin.com') or host == 'iesdouyin.com' or host.endswith('.iesdouyin.com')):
        raise DouyinError('invalid_url', 'Chỉ nhận link HTTPS chính thức của Douyin/iesdouyin.com.')
    return url


class ScopedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url = checked_url(urllib.parse.urljoin(req.full_url, newurl))
        if re.search(r'(?:captcha|verifycenter|verify_center)', urllib.parse.urlparse(url).path, re.I):
            raise DouyinError('verification', 'Douyin chuyển sang trang xác minh. Đã dừng, không tự vượt CAPTCHA.')
        return super().redirect_request(req, fp, code, msg, headers, url)


def load_cookies(path):
    jar = http.cookiejar.MozillaCookieJar()
    try:
        jar.load(str(path), ignore_discard=True, ignore_expires=True)
    except FileNotFoundError:
        raise DouyinError('cookie_missing', 'Chưa có cookies.txt. Sang thẻ Tải video để nạp cookie Douyin rồi quét lại.') from None
    except (OSError, http.cookiejar.LoadError):
        raise DouyinError('cookie_format', 'Không đọc được cookies.txt dạng Netscape. Nạp lại file ở thẻ Tải video.') from None
    scoped = http.cookiejar.CookieJar()
    now = time.time()
    had_douyin = False
    for cookie in jar:
        domain = cookie.domain.lstrip('.').lower()
        if domain != 'douyin.com' and not domain.endswith('.douyin.com'):
            continue
        had_douyin = True
        if cookie.expires not in (None, 0) and cookie.expires <= now:
            continue
        if cookie.expires == 0:
            cookie.expires = None
            cookie.discard = True
        scoped.set_cookie(cookie)
    if not list(scoped):
        raise DouyinError('cookie_expired' if had_douyin else 'cookie_missing',
                           'Cookie Douyin đã hết hạn.' if had_douyin else 'File chưa có cookie Douyin. Nạp cookie tại thẻ Tải video.')
    return scoped


def target_from_url(url):
    p = urllib.parse.urlparse(checked_url(url))
    for kind, pattern in [('profile', r'^/user/([A-Za-z0-9_-]{1,256})(?:/|$)'),
                          ('collection', r'^/(?:collection|mix/detail)/(\d{1,25})(?:/|$)'),
                          ('video', r'/(?:video|note)/(\d{1,25})(?:/|$)')]:
        match = re.search(pattern, p.path)
        if match:
            return kind, match.group(1)
    for key in ('modal_id', 'aweme_id'):
        value = urllib.parse.parse_qs(p.query).get(key, [''])[0]
        if value.isdigit():
            return 'video', value
    return None


def author_of(record):
    return str((record.get('author') or {}).get('sec_uid') or '')


def direct_urls(record):
    video = record.get('video') or {}
    addresses = [video.get('play_addr') or {}]
    addresses += [br.get('play_addr') or {} for br in sorted([b for b in video.get('bit_rate') or [] if isinstance(b, dict)], key=lambda b: b.get('bit_rate') or 0, reverse=True) if isinstance(br, dict)]
    urls = []
    for addr in addresses:
        for value in addr.get('url_list') or []:
            if not isinstance(value, str) or any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
                continue
            value = 'https:' + value if value.startswith('//') else value
            parsed = urllib.parse.urlparse(value)
            if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password and value not in urls:
                urls.append(value)  # Preserve signed bytes; never rewrite playwm/play or query order.
    return urls


def cover_url(record):
    video = record.get('video') or {}
    for key in ('origin_cover', 'cover', 'dynamic_cover'):
        for value in (video.get(key) or {}).get('url_list') or []:
            if isinstance(value, str) and value.startswith('https://'):
                return value
    return ''


class DouyinClient:
    def __init__(self, cookie_file, stop=None, progress=None, gap=2.0, opener=None, signer=None, user_agent=UA, pace_state=None, session_opener=None, session_state=None):
        self.stop = stop or threading.Event()
        self.progress = progress or (lambda *a: None)
        self.user_agent = user_agent
        self.referer = API_ORIGIN + "/"
        self.jar = load_cookies(cookie_file)
        self.opener = opener or urllib.request.build_opener(ScopedRedirect(), urllib.request.HTTPCookieProcessor(self.jar))
        self.session_opener = session_opener or urllib.request.build_opener(NoTokenRedirect())
        self.session_state = session_state if session_state is not None else {}
        self.session_ready = False
        self.signer = signer or NativeSigner(user_agent)
        self.gap = max(0, float(gap))
        self.pace_state = pace_state if pace_state is not None else {"next": 0.0, "lock": threading.Lock()}
        self.last_items = []
        self.complete = False
        self.diagnostic = {'signer': SIGNER_VERSION, 'live_verified': False, 'requests': 0,
                           'cookie_count': len(list(self.jar)), 'has_msToken': bool(self.cookie('msToken'))}

    def check(self):
        if self.stop.is_set():
            raise ScanStopped()

    def cookie(self, name):
        # Only cookies applicable to the actual API origin, not another Douyin subdomain.
        request = urllib.request.Request(API_ORIGIN + '/')
        self.jar.add_cookie_header(request)
        for part in (request.get_header('Cookie') or '').split(';'):
            key, sep, value = part.strip().partition('=')
            if sep and key == name:
                return value
        return ''

    def pace(self):
        self.check()
        with self.pace_state['lock']:
            now = time.monotonic()
            scheduled = max(now, self.pace_state['next'])
            self.pace_state['next'] = scheduled + self.gap
        delay = max(0, scheduled - now)
        if delay and self.stop.wait(delay):
            raise ScanStopped()
        self.check()

    def resolve_target(self, url):
        url = checked_url(url)
        parsed = target_from_url(url)
        if parsed:
            self.referer = API_ORIGIN + urllib.parse.urlparse(url).path
            return parsed
        host = urllib.parse.urlparse(url).hostname
        if host != 'v.douyin.com':
            raise DouyinError('invalid_url', 'Cần link kênh /user/…, bộ /collection/… hoặc video Douyin.')
        self.pace()
        try:
            with self.opener.open(urllib.request.Request(url, headers={'User-Agent': self.user_agent}), timeout=20) as response:
                result = checked_url(response.geturl())
        except (urllib.error.URLError, OSError):
            raise DouyinError('network', 'Không mở được link rút gọn Douyin. Thử dán link đầy đủ của kênh hoặc bộ.') from None
        self.check()
        parsed = target_from_url(result)
        if not parsed:
            raise DouyinError('invalid_url', 'Link rút gọn chưa dẫn đến kênh/bộ/video hỗ trợ.')
        return parsed

    def params(self, extra):
        browser = re.search(r'Chrome/([\d.]+)', self.user_agent)
        version = browser.group(1) if browser else '131.0.0.0'
        data = {'device_platform': 'webapp', 'aid': '6383', 'channel': 'channel_pc_web',
                **extra, 'update_version_code': '170400', 'pc_client_type': '1', 'pc_libra_divert': 'Windows',
                'support_h265': '1', 'support_dash': '1', 'version_code': '290100', 'version_name': '29.1.0',
                'cookie_enabled': 'true', 'screen_width': '1920', 'screen_height': '1080',
                'browser_language': 'vi', 'browser_platform': 'Win32', 'browser_name': 'Chrome',
                'browser_version': version, 'browser_online': 'true', 'engine_name': 'Blink',
                'engine_version': version, 'os_name': 'Windows', 'os_version': '10',
                'cpu_core_num': str(os.cpu_count() or 8), 'device_memory': '32', 'platform': 'PC',
                'downlink': '10', 'effective_type': '4g', 'round_trip_time': '100'}
        # Reuse the identity held by this API's cookie jar, never a captured user's value.
        for key in ('ttwidinfo_webid', '_tea_web_id', 'webid', 'tt_webid', 'tt_webid_v2'):
            value = self.cookie(key)
            if value.isdigit():
                data['webid'] = value
                break
        uifid = next((self.cookie(name) for name in websign.UIFID_COOKIE_NAMES if self.cookie(name)), '')
        if uifid:
            data['uifid'] = uifid
        token = self.cookie('msToken')
        if token:
            data['msToken'] = token
        # Reuse only identifiers present in this imported session; never fabricate them.
        verification_fp = self.cookie('s_v_web_id')
        if verification_fp:
            data['verifyFp'] = verification_fp
            data['fp'] = verification_fp
        return data

    def ensure_session(self):
        self.check()
        if self.session_ready:
            return
        token = self.cookie('msToken')
        if token:
            self.diagnostic.update(session_stage='ready', token_source='imported_cookie', has_msToken=True)
            self.session_ready = True
            return
        cached = self.session_state.get('token', '')
        if cached and time.monotonic() < self.session_state.get('expires', 0):
            self._set_session_token(cached)
            self.diagnostic.update(session_stage='ready', token_source='server_cached', has_msToken=True)
            self.session_ready = True
            return
        self.diagnostic.update(session_stage='token_request', token_source='none', token_requests=1)
        self.progress('Đang xin token phiên từ máy chủ Douyin…', {'stage': 'session'})
        self.pace()
        payload = dict(TOKEN_PAYLOAD)
        payload['tspFromClient'] = int(time.time() * 1000)
        # Separate opener: never send imported login cookies to the SDK host.
        request = urllib.request.Request(TOKEN_URL, data=json.dumps(payload).encode('utf-8'),
                    headers={'User-Agent': self.user_agent, 'Content-Type': 'application/json; charset=utf-8',
                             'Accept': 'application/json', 'Origin': API_ORIGIN, 'Referer': API_ORIGIN + '/'}, method='POST')
        try:
            with self.session_opener.open(request, timeout=20) as response:
                status = getattr(response, 'status', 200)
                self.diagnostic['token_http_status'] = status
                response.read(65536)  # No response body or header values go to diagnostics.
                headers = response.headers
                token = headers.get('X-Ms-Token', '')
                if not token:
                    values = headers.get_all('Set-Cookie', []) if hasattr(headers, 'get_all') else [headers.get('Set-Cookie', '')]
                    for value in values:
                        parsed = SimpleCookie()
                        try: parsed.load(value)
                        except Exception: continue
                        if 'msToken' in parsed:
                            token = parsed['msToken'].value
                            break
        except urllib.error.HTTPError as error:
            self.diagnostic.update(token_http_status=error.code, session_stage='token_http_error', result='session_error')
            kind = 'rate_limit' if error.code in (429, 412) else 'session_http'
            raise DouyinError(kind, 'Không khởi tạo được phiên: dịch vụ token trả HTTP %s. Chưa gửi yêu cầu quét danh sách.' % error.code,
                              30 if kind == 'rate_limit' else 0) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            self.diagnostic.update(session_stage='token_network_error', result='session_error')
            raise DouyinError('session_network', 'Không kết nối được dịch vụ token Douyin. Chưa gửi yêu cầu quét danh sách.') from None
        self.check()
        if not 200 <= status < 300 or not isinstance(token, str) or not 32 <= len(token) <= 4096 or any(ord(c) <= 32 or ord(c) >= 127 or c in ';,' for c in token):
            self.diagnostic.update(session_stage='token_missing', result='session_error')
            raise DouyinError('session_token_missing', 'Dịch vụ phiên chưa cấp msToken hợp lệ. Đã dừng trước khi quét; mẫu SDK có thể không còn được máy chủ chấp nhận.')
        self._set_session_token(token)
        self.session_state.update(token=token, expires=time.monotonic() + 300)
        self.diagnostic.update(session_stage='ready', token_source='server', has_msToken=True)
        self.session_ready = True

    def _set_session_token(self, token):
        # A token returned by the SDK service is used only for the Douyin API session.
        cookie = http.cookiejar.Cookie(0, 'msToken', token, None, False, '.douyin.com', True, True,
                                      '/', True, True, None, True, None, None, {}, False)
        self.jar.set_cookie(cookie)

    def request(self, path, extra):
        self.ensure_session()
        self.pace()
        params = self.params(extra)
        uifid = params.get('uifid', '')
        self.diagnostic['has_uifid'] = bool(uifid)
        if not uifid:
            self.diagnostic['result'] = 'identity_missing'
            raise DouyinError('identity_missing', 'Cookie chưa có uifid/UIFID_TEMP để ký API bài đăng. Cần nạp cookie đầy đủ của phiên Douyin; không dùng định danh mẫu.')
        pairs = [(str(key), str(value)) for key, value in params.items()]
        query = websign.encode_pairs(pairs)
        try:
            signed = self.signer.generate_abogus(query, '')
            signature, signed_ua = signed[1], signed[2]
            if not signature or signed_ua != self.user_agent:
                raise ValueError()
        except Exception:
            raise DouyinError('signer', 'Bộ ký a_bogus không tạo được chữ ký phù hợp. Cần cập nhật mô-đun ký, không mở trình duyệt tự động.') from None
        # WebSign covers the SAME ordered parameters plus a_bogus and timestamp.
        # Let one serializer produce both the signed and transmitted query bytes.
        signed_query, _, signature_headers = websign.sign(pairs + [('a_bogus', signature)], uifid)
        self.diagnostic['websign_added'] = True
        url = API_ORIGIN + path + '?' + signed_query
        self.diagnostic.update(request_path=path, requests=self.diagnostic['requests'] + 1,
                               has_msToken=bool(self.cookie('msToken')), result='requesting')
        self.progress('Đang gọi API Douyin…', {'requests': self.diagnostic['requests'], 'path': path})
        request = urllib.request.Request(url, headers={'User-Agent': self.user_agent, 'Accept': 'application/json',
                    'Referer': self.referer, 'Accept-Encoding': 'identity', 'Accept-Language': 'vi,en;q=0.8',
                    **signature_headers})
        # Check the actual API URL: a cookie for another path/subdomain must not
        # make a request look authenticated. Never put cookie values in diagnostics.
        self.jar.add_cookie_header(request)
        sent_names = {part.strip().partition('=')[0] for part in
                      (request.get_header('Cookie') or '').split(';') if '=' in part}
        self.diagnostic.update(cookie_sent_count=len(sent_names),
                               login_cookie_sent=bool(sent_names & {'sessionid', 'sessionid_ss', 'sid_tt'}),
                               verification_fp_sent=bool(self.cookie('s_v_web_id')),
                               signature_method='GET', signature_scheme='native-a_bogus+secsdk-websign')
        try:
            with self.opener.open(request, timeout=20) as response:
                code = getattr(response, 'status', 200)
                ctype = response.headers.get('Content-Type', '').split(';', 1)[0]
                raw = response.read(12 * 1024 * 1024 + 1)
        except urllib.error.HTTPError as e:
            self.diagnostic.update(http_status=e.code, result='http_error')
            if e.code in (429, 412):
                try:
                    seconds = min(300, max(5, int(e.headers.get('Retry-After', '30'))))
                except (ValueError, TypeError):
                    seconds = 30
                raise DouyinError('rate_limit', 'Douyin đang hạn chế yêu cầu (HTTP %s). Đã dừng; nghỉ một lúc rồi quét lại, không thử dồn.' % e.code, seconds) from None
            if e.code in (401, 403):
                # Keep only recognized reason labels; never retain arbitrary server bodies.
                try: reason_body = e.read(8192).decode('utf-8', 'replace')
                except Exception: reason_body = ''
                for pattern, label in [(r'uifid\s+not\s+found', 'uifid_missing'),
                                       (r'signature\s+not\s+found', 'signature_missing'),
                                       (r'signature\s+(?:not\s+match|mismatch|invalid)', 'signature_invalid')]:
                    if re.search(pattern, reason_body, re.I):
                        self.diagnostic['denial_reason'] = label
                        break
                raise DouyinError('access_denied', 'Douyin từ chối truy cập (HTTP %s). Có thể do quyền/cookie/chữ ký/IP; chưa kết luận là CAPTCHA.' % e.code) from None
            raise DouyinError('http', 'API Douyin trả HTTP %s.' % e.code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            self.diagnostic['result'] = 'network'
            raise DouyinError('network', 'Không kết nối được API Douyin hoặc hết thời gian chờ. Không tự đổi IP hay cookie.') from None
        self.check()
        self.diagnostic.update(http_status=code, content_type=ctype)
        if len(raw) > 12 * 1024 * 1024:
            raise DouyinError('response_too_large', 'API trả dữ liệu quá lớn; đã dừng.')
        text = raw.decode('utf-8-sig', 'replace')
        if re.search(r'(?:id=["\'](?:captcha_container|captcha-verify-container)["\']|<title>[^<]*(?:验证|驗證))', text, re.I):
            self.diagnostic['result'] = 'verification'
            raise DouyinError('verification', 'Douyin trả trang xác minh. Đã dừng; cần xác minh thủ công, không tự vượt CAPTCHA.')
        try:
            data = json.loads(text)
        except ValueError:
            self.diagnostic['result'] = 'non_json'
            raise DouyinError('non_json', 'Douyin không trả JSON hợp lệ. Có thể API/chữ ký bị thay đổi hoặc yêu cầu bị hạn chế; không tự gán là CAPTCHA.') from None
        if not isinstance(data, dict):
            raise DouyinError('schema', 'Phản hồi API không đúng cấu trúc mong đợi.')
        if data.get('verify_ticket') or data.get('verify_data') or data.get('verify_info'):
            self.diagnostic['result'] = 'verification'
            raise DouyinError('verification', 'API Douyin yêu cầu xác minh. Đã dừng, không tự giải CAPTCHA.')
        status = data.get('status_code', 0)
        safe_status = status if isinstance(status, int) or (isinstance(status, str) and status.isdigit() and len(status) < 16) else 'unknown'
        self.diagnostic['api_status'] = safe_status
        if status not in (0, '0'):
            self.diagnostic['result'] = 'api_error'
            raise DouyinError('api_error', 'API Douyin trả mã %s. Kiểm tra quyền/cookie hoặc cập nhật bộ ký; chưa kết luận là CAPTCHA.' % safe_status)
        self.diagnostic['result'] = 'json_ok'
        return data

    def detail(self, video_id):
        data = self.request('/aweme/v1/web/aweme/detail/', {'aweme_id': str(video_id)})
        record = data.get('aweme_detail')
        if not isinstance(record, dict) or str(record.get('aweme_id', '')) != str(video_id):
            raise DouyinError('identity_mismatch', 'API chưa trả đúng ID video đã yêu cầu; không lấy clip khác để thay thế.')
        return record

    @staticmethod
    def _more_flag(value):
        if isinstance(value, bool):
            return value
        if isinstance(value, int) and value in (0, 1):
            return bool(value)
        if isinstance(value, str) and value.strip().lower() in ('0', '1', 'false', 'true'):
            return value.strip().lower() in ('1', 'true')
        raise DouyinError('incomplete', 'API trả cờ has_more không hợp lệ; giữ kết quả, chưa xác nhận đủ.')

    @staticmethod
    def _next_cursor(data, primary, current, visited):
        candidates = []
        for key in dict.fromkeys((primary, 'cursor', 'max_cursor')):
            value = data.get(key)
            if isinstance(value, bool) or value is None:
                continue
            text = str(value).strip()
            if text.isdigit() and len(text) <= 64:
                candidates.append((key, text))
        forward = next(((key, value) for key, value in candidates if value != current and value not in visited), None)
        return forward or (candidates[0] if candidates else ('', None))

    def records(self, kind, identity, on_page=None, max_pages=500):
        self.last_items = []
        self.complete = False
        if kind == 'video':
            self.last_items = [self.detail(identity)]
            self.complete = True
            if on_page: on_page(list(self.last_items))
            return self.last_items
        if kind == 'profile':
            path, extra, cursor_key = '/aweme/v1/web/aweme/post/', {'sec_user_id': identity, 'locate_query': 'false', 'show_live_replay_strategy': '1',
                'need_time_list': '1', 'time_list_query': '0', 'whale_cut_token': '', 'cut_version': '1',
                'count': 18, 'publish_video_strategy_type': '2', 'from_user_page': '1'}, 'max_cursor'
        elif kind == 'collection':
            path, extra, cursor_key = '/aweme/v1/web/mix/aweme/', {'mix_id': identity, 'count': 18}, 'cursor'
        else:
            raise DouyinError('invalid_url', 'Loại link không hỗ trợ.')
        cursor, ids, cursors = '0', set(), set()
        page, stalled, empty_streak = 0, 0, 0
        while page < max_pages:
            self.check()
            data = self.request(path, {**extra, cursor_key: cursor})
            batch = data.get('aweme_list')
            if not isinstance(batch, list) or 'has_more' not in data:
                raise DouyinError('incomplete', 'API thiếu danh sách video hoặc cờ phân trang. Giữ kết quả đã nhận; chưa thể báo quét đủ.')
            rejected, before = 0, len(self.last_items)
            for record in batch:
                if not isinstance(record, dict): continue
                video_id = str(record.get('aweme_id') or '')
                if not video_id.isdigit(): continue
                author = author_of(record)
                mix = str((record.get('mix_info') or {}).get('mix_id') or '')
                if (kind == 'profile' and author and author != identity) or (kind == 'collection' and mix and mix != identity):
                    rejected += 1; continue
                if video_id not in ids:
                    if kind == 'collection':
                        # Preserve playlist order from the mix endpoint, not user-post chronology.
                        record = dict(record)
                        record['_collection_id'] = identity
                        record['_collection_position'] = len(self.last_items) + 1
                    ids.add(video_id); self.last_items.append(record)
            self.diagnostic.update(pages=page+1, accepted=len(self.last_items), rejected=rejected)
            self.progress('Đã đọc %d trang, %d video đúng nguồn.' % (page+1, len(self.last_items)), {'found': len(self.last_items), 'pages': page+1})
            if on_page: on_page(list(self.last_items))
            more = self._more_flag(data.get('has_more'))
            field, next_cursor = self._next_cursor(data, cursor_key, cursor, cursors)
            forward = next_cursor is not None and next_cursor != cursor and next_cursor not in cursors
            self.diagnostic.update(pagination={'has_more': more, 'batch_count': len(batch),
                'new_count': len(self.last_items)-before, 'cursor_field': field,
                'cursor_present': next_cursor is not None, 'cursor_changed': next_cursor is not None and next_cursor != cursor,
                'cursor_repeated': next_cursor in cursors, 'stalled_rechecks': stalled,
                'empty_page_streak': empty_streak})
            if not more:
                if rejected and not self.last_items:
                    raise DouyinError('identity_mismatch', 'Danh sách trả về thuộc tài khoản/bộ khác; không dùng làm kết quả quét.')
                self.complete = True
                return self.last_items
            if not forward:
                # Recheck only a successful, structurally valid page once. HTTP/access/
                # verification errors raised by request() never reach this retry path.
                if stalled == 0:
                    stalled = 1
                    self.diagnostic['pagination']['stalled_rechecks'] = 1
                    self.progress('Douyin chưa trả con trỏ mới; đang kiểm tra lại trang một lần…',
                                  {'found': len(self.last_items), 'pages': page+1})
                    continue
                self.diagnostic['pagination']['stop_reason'] = 'cursor_stalled'
                raise DouyinError('incomplete', 'Douyin vẫn không trả con trỏ mới sau khi kiểm tra lại một lần. Đã giữ %d video để dùng; chưa xác nhận quét đủ.' % len(self.last_items))
            empty_streak = empty_streak + 1 if not batch else 0
            self.diagnostic['pagination']['empty_page_streak'] = empty_streak
            if empty_streak > 3:
                self.diagnostic['pagination']['stop_reason'] = 'too_many_empty_pages'
                raise DouyinError('incomplete', 'API trả nhiều trang rỗng dù còn con trỏ. Đã giữ %d video; chưa xác nhận đủ.' % len(self.last_items))
            cursors.add(cursor)
            cursor = str(next_cursor)
            page += 1
            stalled = 0
        raise DouyinError('incomplete', 'Đã tới giới hạn số trang an toàn; giữ kết quả nhưng chưa báo quét đủ.')
