"""Cookie-authenticated Douyin read API, with pinned local request signing.

No browser/extension, CAPTCHA solver, session rotation or proxy rotation.
Real acceptance of a_bogus must be tested on the user's connection.
"""
import http.cookiejar
import json
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from .vendor.abogus import ABogus

SIGNER_VERSION = 'f2-7dab3e2-stdlib-sm3'
API_ORIGIN = 'https://www.douyin.com'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
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
    def __init__(self, cookie_file, stop=None, progress=None, gap=2.0, opener=None, signer=None, user_agent=UA, pace_state=None):
        self.stop = stop or threading.Event()
        self.progress = progress or (lambda *a: None)
        self.user_agent = user_agent
        self.jar = load_cookies(cookie_file)
        self.opener = opener or urllib.request.build_opener(ScopedRedirect(), urllib.request.HTTPCookieProcessor(self.jar))
        self.signer = signer or ABogus(fp=FINGERPRINT, user_agent=user_agent)
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
                **extra, 'pc_client_type': '1', 'version_code': '290100', 'version_name': '29.1.0',
                'cookie_enabled': 'true', 'screen_width': '1920', 'screen_height': '1080',
                'browser_language': 'zh-CN', 'browser_platform': 'Win32', 'browser_name': 'Chrome',
                'browser_version': version, 'browser_online': 'true', 'engine_name': 'Blink',
                'engine_version': version, 'os_name': 'Windows', 'os_version': '10',
                'cpu_core_num': '8', 'device_memory': '8', 'platform': 'PC'}
        token = self.cookie('msToken')
        if token:
            data['msToken'] = token
        return data

    def request(self, path, extra):
        self.pace()
        query = urllib.parse.urlencode(self.params(extra), quote_via=urllib.parse.quote)
        try:
            signed = self.signer.generate_abogus(query, '')
            signature, signed_ua = signed[1], signed[2]
            if not signature or signed_ua != self.user_agent:
                raise ValueError()
        except Exception:
            raise DouyinError('signer', 'Bộ ký a_bogus không tạo được chữ ký phù hợp. Cần cập nhật mô-đun ký, không mở trình duyệt tự động.') from None
        url = API_ORIGIN + path + '?' + query + '&a_bogus=' + urllib.parse.quote(signature, safe='')
        self.diagnostic.update(request_path=path, requests=self.diagnostic['requests'] + 1,
                               has_msToken=bool(self.cookie('msToken')), result='requesting')
        self.progress('Đang gọi API Douyin…', {'requests': self.diagnostic['requests'], 'path': path})
        request = urllib.request.Request(url, headers={'User-Agent': self.user_agent, 'Accept': 'application/json',
                    'Referer': API_ORIGIN + '/', 'Accept-Encoding': 'identity', 'Accept-Language': 'zh-CN,zh;q=0.9'})
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

    def records(self, kind, identity, on_page=None, max_pages=500):
        self.last_items = []
        self.complete = False
        if kind == 'video':
            self.last_items = [self.detail(identity)]
            self.complete = True
            if on_page: on_page(list(self.last_items))
            return self.last_items
        if kind == 'profile':
            path, extra, cursor_key = '/aweme/v1/web/aweme/post/', {'sec_user_id': identity, 'count': 18}, 'max_cursor'
        elif kind == 'collection':
            path, extra, cursor_key = '/aweme/v1/web/mix/aweme/', {'mix_id': identity, 'count': 18}, 'cursor'
        else:
            raise DouyinError('invalid_url', 'Loại link không hỗ trợ.')
        cursor, ids, cursors = '0', set(), set()
        for page in range(max_pages):
            self.check()
            data = self.request(path, {**extra, cursor_key: cursor})
            batch = data.get('aweme_list')
            if not isinstance(batch, list) or 'has_more' not in data:
                raise DouyinError('incomplete', 'API thiếu danh sách video hoặc cờ phân trang. Giữ kết quả đã nhận; chưa thể báo quét đủ.')
            rejected = 0
            for record in batch:
                if not isinstance(record, dict): continue
                video_id = str(record.get('aweme_id') or '')
                if not video_id.isdigit(): continue
                author = author_of(record)
                mix = str((record.get('mix_info') or {}).get('mix_id') or '')
                if (kind == 'profile' and author and author != identity) or (kind == 'collection' and mix and mix != identity):
                    rejected += 1; continue
                if video_id not in ids:
                    ids.add(video_id); self.last_items.append(record)
            self.diagnostic.update(pages=page+1, accepted=len(self.last_items), rejected=rejected)
            self.progress('Đã đọc %d trang, %d video đúng nguồn.' % (page+1, len(self.last_items)), {'found': len(self.last_items), 'pages': page+1})
            if on_page: on_page(list(self.last_items))
            more = data.get('has_more')
            if more in (False, 0, '0'):
                if rejected and not self.last_items:
                    raise DouyinError('identity_mismatch', 'Danh sách trả về thuộc tài khoản/bộ khác; không dùng làm kết quả quét.')
                self.complete = True
                return self.last_items
            next_cursor = data.get(cursor_key, data.get('cursor', data.get('max_cursor')))
            if not batch or next_cursor is None or str(next_cursor) == cursor or str(next_cursor) in cursors:
                raise DouyinError('incomplete', 'Douyin ngừng phân trang hoặc lặp con trỏ khi vẫn báo còn video. Đã giữ phần quét được, không báo đủ.')
            cursors.add(cursor)
            cursor = str(next_cursor)
        raise DouyinError('incomplete', 'Đã tới giới hạn số trang an toàn; giữ kết quả nhưng chưa báo quét đủ.')
