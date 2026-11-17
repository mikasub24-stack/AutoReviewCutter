import copy
import hashlib
import http.cookiejar
import io
import json
from pathlib import Path
import random
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ytdl.douyin_direct.client import *
from ytdl.douyin_direct.vendor.sm3 import sm3_python
from ytdl.douyin_direct.vendor.abogus import ABogus
from ytdl import directscan


class Response:
    def __init__(self, data, content='application/json', url=API_ORIGIN):
        self.body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
        self.headers = {'Content-Type': content}
        self.status = 200
        self.url = url
    def read(self, limit=-1): return self.body[:limit] if limit >= 0 else self.body
    def geturl(self): return self.url
    def __enter__(self): return self
    def __exit__(self, *a): pass


class Transport:
    def __init__(self, replies): self.replies, self.calls = list(replies), []
    def open(self, request, timeout=0):
        self.calls.append(request)
        if not self.replies: raise AssertionError('Unexpected request')
        value = self.replies.pop(0)
        if isinstance(value, Exception): raise value
        return value if isinstance(value, Response) else Response(value)


class SigningStub:
    def __init__(self, ua=UA): self.ua, self.queries = ua, []
    def generate_abogus(self, query, body):
        self.queries.append(query)
        return query, 'TEST+SIGNATURE/=', self.ua, body


def record(video_id, owner='OWNER_A', title='第1集', mix=None, direct=True):
    data = {'aweme_id': str(video_id), 'desc': title, 'create_time': int(video_id),
            'author': {'sec_uid': owner, 'nickname': '测试作者'},
            'video': {'play_addr': {'url_list': ['https://v3.douyinvod.com/video.mp4?signature=TEST%2B&x=2'] if direct else []}}}
    if mix: data['mix_info'] = {'mix_id': mix, 'mix_name': '同一部'}
    return data


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self.tmp.name)
        self.cookies = self.folder / 'cookies.txt'
        self.cookies.write_text('# Netscape HTTP Cookie File\n.douyin.com\tTRUE\t/\tTRUE\t0\tmsToken\tTEST_TOKEN+A==\n.douyin.com\tTRUE\t/\tTRUE\t0\tsessionid\tTEST_SESSION\n.evil-douyin.com\tTRUE\t/\tTRUE\t0\tSECRET\tFOREIGN_SECRET\n.google.com\tTRUE\t/\tTRUE\t0\tGOOGLE\tGOOGLE_SECRET\n', encoding='utf-8')
    def tearDown(self): self.tmp.cleanup()
    def client(self, replies):
        transport, signer = Transport(replies), SigningStub()
        return DouyinClient(self.cookies, opener=transport, signer=signer, gap=0), transport, signer
    def test_production_get_signer_uses_get_options(self):
        c = DouyinClient(self.cookies, gap=0)
        self.assertEqual(c.signer.options, [0, 1, 8])
        from ytdl.douyin_direct.vendor import abogus
        with patch.object(abogus.time, 'time', return_value=1700000000.0):
            random.seed(77); actual = c.signer.generate_abogus('aid=6383', '')
            random.seed(77); expected = ABogus(fp=FINGERPRINT, user_agent=UA, options=[0,1,8]).generate_abogus('aid=6383', '')
            random.seed(77); wrong_post = ABogus(fp=FINGERPRINT, user_agent=UA, options=[0,1,14]).generate_abogus('aid=6383', '')
        self.assertEqual(actual, expected)
        self.assertNotEqual(actual[1], wrong_post[1])

    def test_existing_session_fingerprint_reused_not_generated(self):
        with self.cookies.open('a') as f:
            f.write('.douyin.com\tTRUE\t/\tTRUE\t0\ts_v_web_id\tverify_TEST_ONLY\n')
        c, transport, signer = self.client([{'aweme_detail':record(126)}])
        c.detail('126')
        params = urllib.parse.parse_qs(signer.queries[0])
        self.assertEqual(params['verifyFp'], ['verify_TEST_ONLY'])
        self.assertEqual(params['fp'], ['verify_TEST_ONLY'])
        self.assertNotIn('verify_TEST_ONLY', json.dumps(c.diagnostic))

    def test_diagnostic_checks_cookies_actually_sent_without_secrets(self):
        c, transport, signer = self.client([{'aweme_detail':record(126)}])
        c.detail('126')
        self.assertTrue(c.diagnostic['login_cookie_sent'])
        self.assertEqual(c.diagnostic['cookie_sent_count'], 2)
        self.assertIn('sessionid=TEST_SESSION', transport.calls[0].get_header('Cookie'))
        self.assertNotIn('TEST_SESSION', json.dumps(c.diagnostic))
        self.assertNotIn('TEST_TOKEN', json.dumps(c.diagnostic))
        self.cookies.write_text('# Netscape HTTP Cookie File\nother.douyin.com\tFALSE\t/\tTRUE\t0\tsessionid\tTEST_SUBDOMAIN\n')
        c, transport, signer = self.client([{'aweme_detail':record(126)}])
        c.detail('126')
        self.assertFalse(c.diagnostic['login_cookie_sent'])
        self.assertEqual(c.diagnostic['cookie_sent_count'], 0)

    def test_uploaded_widget_layout_is_unchanged(self):
        import ast
        source=(Path(__file__).resolve().parents[1]/'ytdl/scantab.py').read_text(encoding='utf-8')
        baseline=json.loads((Path(__file__).parent/'ui_layout_baseline.json').read_text())
        cls=next(n for n in ast.parse(source).body if isinstance(n,ast.ClassDef) and n.name=='Page')
        for name,digest in baseline.items():
            node=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name==name)
            self.assertEqual(hashlib.sha256(ast.get_source_segment(source,node).encode()).hexdigest(),digest,name)

    def test_sm3_standard_abc(self):
        self.assertEqual(sm3_python(b'abc'), '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0')
    def test_sm3_standard_multiblock(self):
        self.assertEqual(sm3_python(b'abcd' * 16), 'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732')
    def test_sm3_padding_boundaries_match_openssl(self):
        if 'sm3' not in hashlib.algorithms_available: self.skipTest('OpenSSL does not expose SM3')
        for size in (0, 1, 55, 56, 63, 64, 65, 128, 1024):
            data = bytes(i % 251 for i in range(size))
            self.assertEqual(sm3_python(data), hashlib.new('sm3', data).hexdigest())
    def test_upstream_signer_port_matches_with_and_without_openssl(self):
        from ytdl.douyin_direct.vendor import abogus
        with patch.object(abogus.time, 'time', return_value=1700000000.0):
            random.seed(7); fast = ABogus(fp=FINGERPRINT, user_agent=UA).generate_abogus('aid=6383&aweme_id=123', '')
            with patch.object(abogus, 'sm3_hex', side_effect=sm3_python):
                random.seed(7); pure = ABogus(fp=FINGERPRINT, user_agent=UA).generate_abogus('aid=6383&aweme_id=123', '')
        self.assertEqual(fast, pure)
        self.assertGreater(len(pure[1]), 100)
    def test_signs_exact_encoded_query_sent_and_same_ua(self):
        c, transport, signer = self.client([{'aweme_detail': record(126)}])
        c.detail('126')
        request = transport.calls[0]
        query = urllib.parse.urlparse(request.full_url).query
        unsigned, signature = query.rsplit('&a_bogus=', 1)
        self.assertEqual(unsigned, signer.queries[0])
        self.assertIn('msToken=TEST_TOKEN%2BA%3D%3D', unsigned)
        self.assertEqual(urllib.parse.unquote(signature), 'TEST+SIGNATURE/=')
        self.assertEqual(request.get_header('User-agent'), UA)
    def test_only_douyin_cookies_and_session_expiry_zero(self):
        c, _, _ = self.client([])
        self.assertEqual(c.cookie('sessionid'), 'TEST_SESSION')
        self.assertEqual(c.cookie('SECRET'), '')
        self.assertEqual(c.cookie('GOOGLE'), '')
        self.assertEqual(len(list(c.jar)), 2)
    def test_expired_cookies_not_silently_reused(self):
        self.cookies.write_text('# Netscape HTTP Cookie File\n.douyin.com\tTRUE\t/\tTRUE\t1\tsessionid\tEXPIRED\n')
        with self.assertRaises(DouyinError) as caught: DouyinClient(self.cookies)
        self.assertEqual(caught.exception.kind, 'cookie_expired')
    def test_missing_cookie_no_network(self):
        with self.assertRaises(DouyinError) as caught: DouyinClient(self.folder/'missing.txt')
        self.assertEqual(caught.exception.kind, 'cookie_missing')
    def test_fake_hosts_and_credentials_rejected(self):
        for value in ('https://douyin.com.evil.test/user/A', 'https://user:pass@www.douyin.com/user/A', 'http://www.douyin.com/user/A', 'https://evil.test/?x=https://douyin.com/'):
            with self.assertRaises(DouyinError): checked_url(value)
    def test_profile_query_video_parameter_does_not_change_scan_owner(self):
        self.assertEqual(target_from_url('https://www.douyin.com/user/OWNER_A?modal_id=123'), ('profile','OWNER_A'))
    def test_detail_never_takes_recommended_video(self):
        c, _, _ = self.client([{'aweme_detail': record(999), 'aweme_list': [record(126)]}])
        with self.assertRaises(DouyinError) as caught: c.detail('126')
        self.assertEqual(caught.exception.kind, 'identity_mismatch')
    def test_native_post_pages_exclude_foreign_author_and_duplicate(self):
        c, transport, _ = self.client([
            {'aweme_list': [record(1),record(2),record(99,owner='FOREIGN')], 'has_more':1, 'max_cursor':100},
            {'aweme_list': [record(2),record(3)], 'has_more':0, 'max_cursor':200}])
        items = c.records('profile','OWNER_A')
        self.assertEqual([r['aweme_id'] for r in items], ['1','2','3'])
        self.assertTrue(c.complete)
        self.assertTrue(all('/aweme/post/' in req.full_url for req in transport.calls))
        self.assertFalse(any('favorite' in req.full_url for req in transport.calls))
    def test_native_collection_rejects_other_mix(self):
        c, _, _ = self.client([{'aweme_list': [record(1,mix='12'),record(2,mix='88')], 'has_more':0,'cursor':0}])
        self.assertEqual([r['aweme_id'] for r in c.records('collection','12')], ['1'])
    def test_repeated_cursor_keeps_partial_and_does_not_claim_complete(self):
        c, _, _ = self.client([{'aweme_list':[record(1)], 'has_more':1, 'max_cursor':0}])
        with self.assertRaises(DouyinError) as caught: c.records('profile','OWNER_A')
        self.assertEqual(caught.exception.kind, 'incomplete')
        self.assertEqual(len(c.last_items),1)
        self.assertFalse(c.complete)
    def test_empty_json_is_not_classified_as_captcha(self):
        c, _, _ = self.client([{}])
        with self.assertRaises(DouyinError) as caught: c.records('profile','OWNER_A')
        self.assertEqual(caught.exception.kind, 'incomplete')
    def test_html_without_challenge_is_not_captcha(self):
        c, transport, _ = self.client([Response(b'<html>empty</html>','text/html')])
        with self.assertRaises(DouyinError) as caught: c.detail('1')
        self.assertEqual(caught.exception.kind,'non_json')
        self.assertEqual(len(transport.calls),1)
    def test_actual_challenge_stops_without_retry(self):
        c, transport, _ = self.client([Response(b'<div id="captcha_container"></div>','text/html')])
        with self.assertRaises(DouyinError) as caught: c.detail('1')
        self.assertEqual(caught.exception.kind,'verification')
        self.assertEqual(len(transport.calls),1)
    def test_429_is_throttling_and_retry_after_preserved(self):
        error = urllib.error.HTTPError(API_ORIGIN,429,'Too many',{'Retry-After':'60'},None)
        c, transport, _ = self.client([error])
        with self.assertRaises(DouyinError) as caught: c.detail('1')
        self.assertEqual(caught.exception.kind,'rate_limit')
        self.assertEqual(caught.exception.retry_after,60)
        self.assertEqual(len(transport.calls),1)
    def test_403_does_not_claim_cookie_expired_or_captcha(self):
        c, _, _ = self.client([urllib.error.HTTPError(API_ORIGIN,403,'Denied',{},None)])
        with self.assertRaises(DouyinError) as caught:c.detail('1')
        self.assertEqual(caught.exception.kind,'access_denied')
    def test_request_pacing_is_shared_between_scan_jobs(self):
        shared={'next':0.0,'lock':threading.Lock()}
        stop_a=threading.Event();stop_b=threading.Event()
        a=DouyinClient(self.cookies,stop=stop_a,pace_state=shared,gap=2)
        b=DouyinClient(self.cookies,stop=stop_b,pace_state=shared,gap=2)
        with patch('time.monotonic',return_value=100),patch.object(stop_b,'wait',return_value=False) as wait:
            a.pace();b.pace()
        wait.assert_called_once_with(2)

    def test_cancellation_before_signing_makes_no_request(self):
        c, transport, signer = self.client([]);c.stop.set()
        with self.assertRaises(ScanStopped):c.detail('1')
        self.assertEqual(transport.calls,[]);self.assertEqual(signer.queries,[])
    def test_diagnostics_never_export_cookie_or_signature_values(self):
        c, _, _ = self.client([{'aweme_detail':record(1)}]);c.detail('1')
        diagnostic=json.dumps(c.diagnostic)
        for secret in ('TEST_TOKEN','TEST_SESSION','TEST+SIGNATURE','FOREIGN_SECRET','GOOGLE_SECRET'):
            self.assertNotIn(secret,diagnostic)
    def test_signed_media_url_preserved_exactly(self):
        self.assertEqual(direct_urls(record(1))[0],'https://v3.douyinvod.com/video.mp4?signature=TEST%2B&x=2')
    def test_redirect_to_non_douyin_cannot_forward_session(self):
        handler=ScopedRedirect()
        with self.assertRaises(DouyinError):handler.redirect_request(urllib.request.Request(API_ORIGIN),None,302,'',{},'https://evil.test/')
    def test_never_generate_episode_159_from_unknown_titles(self):
        data=[record(1,title='吃声亭126集何大清'),record(2,title='第135集结尾')]
        data += [record(100+i,title='没有集数') for i in range(24)]
        items,_=directscan.ordered_items(data,'Series',{'merged':True})
        self.assertEqual([it['episode'] for it in items[:2]],[126,135])
        self.assertEqual(sum(it['episode'] is None for it in items),24)
        self.assertTrue(all('Chưa rõ tập' in it['name'] for it in items[2:]))
        self.assertFalse(any('Tập 159' in it['name'] for it in items))
    def test_episode_and_aggregate_title_parsing(self):
        for title, expected in [('第一百三十五集',135),('吃声亭126集',126),('Tập 07',7),('第１２６集',126),('第135集大结局',135)]:
            self.assertEqual(directscan.title_info(title)[0],expected)
        self.assertEqual(directscan.title_info('共135集一口气看完')[1],'merged')
        self.assertIsNone(directscan.title_info('超前观看后20集')[0])
        self.assertEqual(directscan.title_info('超前观看后20集')[1],'ads')
    def test_duplicate_episode_names_cannot_overwrite_each_other(self):
        items,_=directscan.ordered_items([record(1),record(2)],'Series')
        self.assertEqual(len({item['name'] for item in items}),2)
    def test_no_cover_or_title_similarity_grouping(self):
        data=[record(1,title='第一集'),record(2,title='第126集'),record(3,title='不同名字')]
        groups=directscan.grouped(data,'profile','OWNER_A')
        self.assertEqual(len(groups),1)
        self.assertEqual(groups[0]['n'],3)
    def test_only_explicit_mix_ids_create_collection_groups(self):
        groups=directscan.grouped([record(1,mix='12'),record(2,mix='12'),record(3)],'profile','OWNER_A')
        self.assertEqual({g['key'] for g in groups},{'mix:12','posts:OWNER_A'})

def _scanner_fixture(self, replies):
    transports=[]
    def factory(cookie_file, **kwargs):
        transport=Transport(replies);transports.append(transport)
        return DouyinClient(cookie_file,opener=transport,signer=SigningStub(),gap=0,**kwargs)
    return directscan.Scanner(self.cookies, factory),transports


def test_scanner_reuses_owned_list_for_links_without_requery(self):
    service, transports=_scanner_fixture(self,[{'aweme_list':[record(1),record(2,title='第2集')],'has_more':0,'max_cursor':0}])
    job=service.submit('https://www.douyin.com/user/OWNER_A',kind='list');service.thread.join(3)
    self.assertEqual(job.state,'done')
    group=job.groups[0]
    job=service.submit(group['url'],{'group_key':group['key'],'name':group['name'],'merged':True},'scan');service.thread.join(3)
    self.assertEqual(job.state,'done');self.assertEqual(job.direct_count(),2)
    self.assertEqual(sum(len(t.calls) for t in transports),1)
    self.assertTrue(all(ln.count('\t')==2 for ln in job.lines))


def test_partial_group_scope_does_not_mix_other_series(self):
    data={'aweme_list':[record(1),record(2,mix='12')],'has_more':1,'max_cursor':0}
    service,_=_scanner_fixture(self,[data])
    job=service.submit('https://www.douyin.com/user/OWNER_A',{'group_key':'posts:OWNER_A','name':'Own','merged':True},'scan');service.thread.join(3)
    self.assertEqual(job.state,'error');self.assertEqual(job.error_kind,'incomplete')
    self.assertEqual([it['id'] for it in job.items],['1'])


def test_scanner_rate_limit_blocks_immediate_user_retry(self):
    error=urllib.error.HTTPError(API_ORIGIN,429,'Too many',{'Retry-After':'60'},None)
    service,transports=_scanner_fixture(self,[error])
    job=service.submit('https://www.douyin.com/user/OWNER_A',kind='list');service.thread.join(3)
    self.assertEqual(job.error_kind,'rate_limit')
    job=service.submit('https://www.douyin.com/user/OWNER_A',kind='list');service.thread.join(3)
    self.assertEqual(job.error_kind,'rate_limit');self.assertEqual(len(transports),1)


# The scan adapter uses the same cookie fixture, without inheriting API test cases.
class ScannerTests(unittest.TestCase):
    setUp=ApiTests.setUp
    tearDown=ApiTests.tearDown
    test_scanner_reuses_owned_list_for_links_without_requery=test_scanner_reuses_owned_list_for_links_without_requery
    test_partial_group_scope_does_not_mix_other_series=test_partial_group_scope_does_not_mix_other_series
    test_scanner_rate_limit_blocks_immediate_user_retry=test_scanner_rate_limit_blocks_immediate_user_retry

def test_detail_owner_contradiction_stops(self):
    data={'aweme_list':[record(1,direct=False)],'has_more':0,'max_cursor':0}
    service,_=_scanner_fixture(self,[data,{'aweme_detail':record(1,owner='FOREIGN')}])
    job=service.submit('https://www.douyin.com/user/OWNER_A',{'merged':True},'scan');service.thread.join(3)
    self.assertEqual(job.state,'error')
    self.assertEqual(job.error_kind,'identity_mismatch')
    self.assertEqual(job.direct_count(),0)
ScannerTests.test_detail_owner_contradiction_stops=test_detail_owner_contradiction_stops

if __name__=='__main__':unittest.main(verbosity=2)
