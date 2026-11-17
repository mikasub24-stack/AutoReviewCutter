"""Direct API adapter for the existing scan tab's Job contract.

Runs in one worker thread. Does not launch a browser or talk to the extension bridge.
"""
import base64
from collections import Counter
import io
import re
import threading
import time
import urllib.parse
import urllib.request

from .bridge import Job, Busy, items_lines
from .douyin_direct.client import (DouyinClient, DouyinError, ScanStopped, direct_urls, cover_url, author_of, SIGNER_VERSION)

STOP_KINDS = {'verification', 'rate_limit', 'access_denied', 'signer', 'non_json', 'api_error', 'identity_mismatch', 'incomplete', 'schema'}
DIGITS = dict(zip('零〇一二两兩三四五六七八九', [0, 0, 1, 2, 2, 2, 3, 4, 5, 6, 7, 8, 9]))


def cn_number(value):
    value = value.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
    if value.isdigit():
        return int(value)
    if not any(ch in value for ch in '十百千'):
        return int(''.join(str(DIGITS[ch]) for ch in value))
    total, current = 0, 0
    for ch in value:
        if ch in DIGITS:
            current = DIGITS[ch]
        else:
            total += (current or 1) * {'十': 10, '百': 100, '千': 1000}[ch]
            current = 0
    return total + current


def title_info(title):
    text = str(title or '').translate(str.maketrans('０１２３４５６７８９', '0123456789'))
    number = r'[0-9零〇一二两兩三四五六七八九十百千]+'
    ranged = re.search(r'(?:第\s*)?(' + number + r')\s*[-~～至到–—]\s*(' + number + r')\s*[集话話]', text)
    episodes = []
    for match in re.finditer(r'(?:第\s*)?(' + number + r')\s*[集话話]', text):
        before = text[max(0, match.start()-14):match.start()]
        if re.search(r'(?:共|全|更新至|更新到|已更新|后|後|最后|最後|提前看|超前看|还有|還有)\s*$', before):
            continue
        try:
            ep = cn_number(match.group(1))
        except (KeyError, ValueError):
            continue
        if 1 <= ep <= 9999:
            episodes.append(ep)
    for match in re.finditer(r'\b(?:tập|tap|episode|ep\.?)[\s:#-]*(\d{1,4})\b', text, re.I):
        if int(match.group(1)) > 0:
            episodes.append(int(match.group(1)))
    ep = episodes[0] if len(set(episodes)) == 1 and not ranged else None
    kind, suffix = 'ep', ''
    if ranged or (ep is None and re.search(r'合集|全集|一口气看完|(?:共|全)\s*\d+\s*集', text)):
        kind = 'merged'
        if ranged:
            try: suffix = 'Gộp %02d-%02d' % (cn_number(ranged.group(1)), cn_number(ranged.group(2)))
            except (KeyError, ValueError): suffix = 'Gộp'
        else:
            suffix = 'Gộp'
    elif ep is None and re.search(r'^\s*(?:超前温馨提示|温馨提示|温馨提醒|预告|預告|trailer|teaser|超前观看|提前观看)', text, re.I):
        kind = 'ads'
    return ep, kind, suffix


def clean_name(value):
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]+', ' ', str(value)).strip()[:120] or 'Douyin'


def ordered_items(records, name, options=None):
    options = options or {}
    output, skipped = [], {'merged': 0, 'ads': 0, 'non_video': 0}
    for record in records:
        video_id = str(record.get('aweme_id') or '')
        if not video_id.isdigit(): continue
        if record.get('images') and not record.get('video'):
            skipped['non_video'] += 1; continue
        ep, kind, suffix = title_info(record.get('desc'))
        if kind == 'ads' and not options.get('ads'):
            skipped['ads'] += 1; continue
        if kind == 'merged' and not options.get('merged'):
            skipped['merged'] += 1; continue
        tail = ('Tập %03d' % ep) if ep is not None else (suffix + ' - video ' + video_id if kind == 'merged' else 'Chưa rõ tập - video ' + video_id)
        urls = direct_urls(record)
        output.append({'id': video_id, 'url': 'https://www.douyin.com/video/' + video_id,
                       'name': clean_name(name) + (' - video ' + video_id + ' - ' + suffix if kind == 'merged' else ' - ' + tail), 'direct': urls[0] if urls else '',
                       'kind': kind, 'thumb': '', 'episode': ep, 'timestamp': record.get('create_time') or 0,
                       '_record': record})
    duplicates = Counter(it['episode'] for it in output if it['episode'] is not None)
    for item in output:
        if item['episode'] is not None and duplicates[item['episode']] > 1:
            item['name'] += ' [video ' + item['id'] + ']'
    output.sort(key=lambda item: (item['kind'] == 'merged', item['episode'] is None,
                                 item['episode'] if item['episode'] is not None else item['timestamp'], item['id']))
    return output, skipped


def grouped(records, kind, identity, requested_name=''):
    """Groups are based only on native mix membership, never cover/title similarity."""
    buckets = {}
    for record in records:
        mix = record.get('mix_info') or {}
        mix_id = str(mix.get('mix_id') or '')
        if kind == 'collection':
            key = 'mix:' + identity
            name = requested_name or mix.get('mix_name') or 'Bộ ' + identity
            url = 'https://www.douyin.com/collection/' + identity
        elif kind == 'video':
            key, name, url = 'video:' + identity, requested_name or 'Video ' + identity, 'https://www.douyin.com/video/' + identity
        elif mix_id:
            key, name, url = 'mix:' + mix_id, mix.get('mix_name') or 'Bộ ' + mix_id, 'https://www.douyin.com/collection/' + mix_id
        else:
            author_name = (record.get('author') or {}).get('nickname') or 'kênh'
            key, name, url = 'posts:' + identity, 'Bài đăng của ' + author_name, 'https://www.douyin.com/user/' + identity
        if key not in buckets:
            buckets[key] = {'key': key, 'name': clean_name(name), 'n': 0, 'url': url,
                            'cover': '', 'cover_url': cover_url(record), '_records': []}
        buckets[key]['_records'].append(record)
        buckets[key]['n'] += 1
    counts = Counter(g['name'] for g in buckets.values())
    for key, group in buckets.items():
        if counts[group['name']] > 1:
            group['name'] += ' [' + key.rsplit(':', 1)[-1][-6:] + ']'
    return list(buckets.values())


_CDN_SUFFIXES = ('douyinpic.com', 'byteimg.com', 'pstatp.com', 'ibytedtos.com', 'douyin.com', 'bytecdn.cn', 'bytedance.com')


def _cover_ok(url):
    p = urllib.parse.urlparse(url)
    host = (p.hostname or '').lower()
    return p.scheme == 'https' and not p.username and not p.password and any(host == d or host.endswith('.' + d) for d in _CDN_SUFFIXES)


class _CoverRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url = urllib.parse.urljoin(req.full_url, newurl)
        if not _cover_ok(url):
            raise ValueError('Unsupported cover host')
        return super().redirect_request(req, fp, code, msg, headers, url)


def load_cover(url, stop):
    if not _cover_ok(url) or stop.is_set():
        return ''
    try:
        # A separate opener has no CookieProcessor; login cookies never go to the CDN.
        opener = urllib.request.build_opener(_CoverRedirect())
        with opener.open(urllib.request.Request(url, headers={'User-Agent': 'AutoStudio-DirectScan/1'}), timeout=6) as response:
            data = response.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024 or stop.is_set():
            return ''
        try:
            from PIL import Image
        except ImportError:
            return 'data:image/png;base64,' + base64.b64encode(data).decode() if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data) < 150 * 1024 else ''
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > 16_000_000:
                return ''
            source.thumbnail((96, 128))
            output = io.BytesIO()
            source.convert('RGB').save(output, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()
    except Exception:
        return ''  # Cover errors must not discard a valid scan list.


class Scanner:
    def __init__(self, cookie_file, client_factory=DouyinClient):
        self.cookie_file = cookie_file
        self.client_factory = client_factory
        self.job = None
        self.thread = None
        self.lock = threading.Lock()
        self.cache = {}
        self.cache_at = 0
        self.cooldown_until = 0
        self.cookie_stamp = None
        self.pace_state = {"next": 0.0, "lock": threading.Lock()}

    def start(self):
        return True, ''

    def submit(self, url, opts=None, kind='scan'):
        with self.lock:
            if self.thread is not None and self.thread.is_alive():
                raise Busy('API đang hoàn tất yêu cầu trước. Chờ tối đa một lượt timeout trước khi quét mới.')
            job = Job(url, opts, kind)
            job.engine = 'direct'
            job.error_kind = ''
            job.diagnostic = {'signer': SIGNER_VERSION, 'live_verified': False}
            job.stop_event = threading.Event()
            job.opts.update(group_key=(opts or {}).get('group_key', ''))
            job.msg = 'Chuẩn bị quét API trực tiếp; không mở trình duyệt.'
            self.job = job
            self.thread = threading.Thread(target=self._run, args=(job,), daemon=True)
            self.thread.start()
            return job

    def check(self, job):
        return None  # Network timeouts belong to the worker, not extension heartbeat timeouts.

    def hint(self, job):
        return ''

    def cancel(self, job):
        job.cancel = True
        job.stop_event.set()
        job.state = 'cancelled'
        job.msg = 'Đã hủy quét API. Phần đã nhận vẫn được giữ.'

    def _progress(self, job, message, values):
        if job.cancel: raise ScanStopped()
        job.msg = message
        job.updated = time.time()
        if 'found' in values: job.found = values['found']

    def _cached(self, group_key):
        return self.cache.get(group_key) if time.monotonic() - self.cache_at < 300 else None

    def _run(self, job):
        client = None
        try:
            if time.monotonic() < self.cooldown_until:
                raise DouyinError('rate_limit', 'API đang nghỉ sau khi bị giới hạn. Chờ thêm %d giây rồi quét lại.' % max(1, int(self.cooldown_until-time.monotonic())))
            job.state = 'running'
            from pathlib import Path
            stat = Path(self.cookie_file).stat() if Path(self.cookie_file).exists() else None
            stamp = (stat.st_mtime_ns, stat.st_size) if stat else None
            if stamp != self.cookie_stamp:
                self.cache.clear(); self.cookie_stamp = stamp
            client = self.client_factory(self.cookie_file, stop=job.stop_event, pace_state=self.pace_state,
                        progress=lambda text, values: self._progress(job, text, values))
            kind, identity = client.resolve_target(job.url)
            group_key = job.opts.get('group_key', '')
            cached = self._cached(group_key) if job.kind == 'scan' and group_key else None
            if cached:
                records = list(cached['_records'])
            else:
                def page(records):
                    groups = grouped(records, kind, identity, job.opts.get('name', ''))
                    job.groups = groups
                    if job.kind == 'scan':
                        scoped = next((g['_records'] for g in groups if g['key'] == group_key), []) if group_key else records
                        self._publish_items(job, scoped, job.opts.get('name') or (groups[0]['name'] if groups else 'Douyin'))
                records = client.records(kind, identity, on_page=page)
                groups = grouped(records, kind, identity, job.opts.get('name', ''))
                for group in groups:
                    self.cache[group['key']] = group
                self.cache_at = time.monotonic()
                if job.kind == 'list':
                    for group in groups:
                        client.check()
                        job.msg = 'Đang lấy ảnh bìa nhóm «%s»…' % group['name']
                        group['cover'] = load_cover(group.get('cover_url', ''), job.stop_event)
                    job.groups = groups
                    job.found = len(records)
                elif group_key:
                    group = next((g for g in groups if g['key'] == group_key), None)
                    if group is None:
                        raise DouyinError('identity_mismatch', 'API chưa trả đúng nhóm đã chọn. Không ghép video từ bộ khác.')
                    records = group['_records']
            if job.kind == 'scan':
                name = job.opts.get('name') or (grouped(records, kind, identity)[0]['name'] if records else 'Douyin')
                self._publish_items(job, records, name)
                job.total = len(job.items)
                for item in job.items:
                    client.check()
                    if not item['direct']:
                        job.msg = 'Đang lấy chi tiết video %s (%d/%d)…' % (item['id'], job.done_n, job.total)
                        record = client.detail(item['id'])
                        expected_owner = author_of(item['_record'])
                        returned_owner = author_of(record)
                        if expected_owner and returned_owner and expected_owner != returned_owner:
                            raise DouyinError('identity_mismatch', 'Chi tiết video trả tác giả khác dữ liệu đã quét. Đã dừng để tránh lấy nhầm.')
                        urls = direct_urls(record)
                        item['direct'] = urls[0] if urls else ''
                    job.done_n += 1
                    job.lines = items_lines(job.items)
                job.blocked = sum(not it['direct'] for it in job.items)
            client.check()
            job.msg = ('Đã quét %d nhóm nguồn từ %d bài đăng.' % (len(job.groups), job.found)) if job.kind == 'list' else 'Đã xử lý %d video; %d có link trực tiếp.' % (len(job.items), job.direct_count())
            job.state = 'done'
        except ScanStopped:
            job.state = 'cancelled'
        except DouyinError as error:
            job.error_kind = error.kind
            job.error = str(error)
            if error.kind == 'rate_limit' and error.retry_after:
                self.cooldown_until = max(self.cooldown_until, time.monotonic() + error.retry_after)
            job.state = 'error'
        except Exception:
            job.error_kind = 'internal'
            job.error = 'Không hoàn tất quét API. Sao chép chẩn đoán để kiểm tra; cookie và chữ ký không được đưa vào chẩn đoán.'
            job.state = 'error'
        finally:
            if job.cancel:
                job.state = 'cancelled'
            if client:
                job.diagnostic = dict(client.diagnostic)
            job.diagnostic.update(error_kind=job.error_kind, state=job.state,
                                  found=job.found, processed=job.done_n, direct=job.direct_count())
            if job.cancel:
                job.state = 'cancelled'
            job.updated = time.time()

    @staticmethod
    def _publish_items(job, records, name):
        items, skipped = ordered_items(records, name, job.opts)
        job.items = items
        job.lines = items_lines(items)
        job.skipped = skipped
        job.found = len(records)
        job.total = len(items)
