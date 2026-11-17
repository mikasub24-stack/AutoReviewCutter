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
        self.cookies.write_text('# Netscape HTTP Cookie File\n.douyin.com\tTRUE\t/\tTRUE\t0\tmsToken\tTEST_TOKEN+A==\n.douyin.com\tTRUE\t/\tTRUE\t0\tsessionid\tTEST_SESSION\n.douyin.com\tTRUE\t/\tTRUE\t0\tuifid\tTEST_UIFID\n.evil-douyin.com\tTRUE\t/\tTRUE\t0\tSECRET\tFOREIGN_SECRET\n.google.com\tTRUE\t/\tTRUE\t0\tGOOGLE\tGOOGLE_SECRET\n', encoding='utf-8')
    def tearDown(self): self.tmp.cleanup()
    def client(self, replies):
        transport, signer = Transport(replies), SigningStub()
        return DouyinClient(self.cookies, opener=transport, signer=signer, gap=0), transport, signer
    def test_production_signer_uses_current_native_format(self):
        from ytdl.douyin_direct.vendor.native.abogus import decode, structure_error
        c = DouyinClient(self.cookies, gap=0)
        query = 'aid=6383&aweme_id=126'
        signed = c.signer.generate_abogus(query, '')
        self.assertIsNone(structure_error(signed[1]))
        decoded = decode(signed[1])
        self.assertEqual(c.signer.native.page_id,6241)
        self.assertEqual(c.signer.native.aid,6383)
        self.assertEqual(signed[2],UA)

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
        self.assertEqual(c.diagnostic['cookie_sent_count'], 3)
        self.assertIn('sessionid=TEST_SESSION', transport.calls[0].get_header('Cookie'))
        self.assertNotIn('TEST_SESSION', json.dumps(c.diagnostic))
        self.assertNotIn('TEST_TOKEN', json.dumps(c.diagnostic))
        self.cookies.write_text('# Netscape HTTP Cookie File\nother.douyin.com\tFALSE\t/\tTRUE\t0\tsessionid\tTEST_SUBDOMAIN\n.douyin.com\tTRUE\t/\tTRUE\t0\tmsToken\tTEST_SCOPE_TOKEN\n.douyin.com\tTRUE\t/\tTRUE\t0\tuifid\tTEST_SCOPE_UIFID\n')
        c, transport, signer = self.client([{'aweme_detail':record(126)}])
        c.detail('126')
        self.assertFalse(c.diagnostic['login_cookie_sent'])
        self.assertEqual(c.diagnostic['cookie_sent_count'], 2)

    def _without_token(self):
        self.cookies.write_text('# Netscape HTTP Cookie File\n.douyin.com\tTRUE\t/\tTRUE\t0\tsessionid\tTEST_SESSION\n.douyin.com\tTRUE\t/\tTRUE\t0\tuifid\tTEST_UIFID\n')

    def _sdk_response(self, cookie=True, token='TEST_SERVER_TOKEN_' + 'A'*160):
        from email.message import Message
        response = Response({})
        response.headers = Message()
        response.headers['Content-Type'] = 'application/json'
        if token:
            response.headers['Set-Cookie' if cookie else 'X-Ms-Token'] = ('msToken='+token+'; Path=/; Secure; HttpOnly') if cookie else token
        return response

    def test_sdk_token_cookie_precedes_signing_no_login_cookies_to_sdk(self):
        self._without_token()
        api, sdk, signer = Transport([{'aweme_detail':record(126)}]), Transport([self._sdk_response()]), SigningStub()
        c = DouyinClient(self.cookies, opener=api, session_opener=sdk, signer=signer, gap=0)
        original = self.cookies.read_bytes()
        c.detail('126')
        self.assertEqual(len(sdk.calls),1)
        req = sdk.calls[0]
        self.assertEqual(req.get_method(), 'POST')
        self.assertEqual(req.full_url, TOKEN_URL)
        self.assertIsNone(req.get_header('Cookie'))
        self.assertNotIn('msToken=', req.full_url)
        payload=json.loads(req.data)
        self.assertTrue(abs(payload['tspFromClient'] - time.time()*1000) < 5000)
        self.assertEqual(payload['magic'],538969122)
        self.assertIn('msToken=TEST_SERVER_TOKEN_', signer.queries[0])
        self.assertEqual(c.diagnostic['token_source'],'server')
        self.assertEqual(c.diagnostic['requests'],1)
        self.assertTrue(c.diagnostic['login_cookie_sent'])
        self.assertNotIn('TEST_SERVER_TOKEN',json.dumps(c.diagnostic))
        self.assertNotIn('TEST_SESSION',json.dumps(c.diagnostic))
        self.assertEqual(self.cookies.read_bytes(),original)

    def test_sdk_header_token_supported(self):
        self._without_token()
        api,sdk=Transport([{'aweme_detail':record(126)}]),Transport([self._sdk_response(cookie=False)])
        c=DouyinClient(self.cookies,opener=api,session_opener=sdk,signer=SigningStub(),gap=0)
        c.detail('126')
        self.assertEqual(c.diagnostic['session_stage'],'ready')
        self.assertTrue(c.cookie('msToken').startswith('TEST_SERVER_TOKEN'))

    def test_sdk_missing_token_never_sends_scan_or_fake_token(self):
        self._without_token()
        api,sdk,signer=Transport([]),Transport([self._sdk_response(token='')]),SigningStub()
        c=DouyinClient(self.cookies,opener=api,session_opener=sdk,signer=signer,gap=0)
        with self.assertRaises(DouyinError) as caught:c.detail('126')
        self.assertEqual(caught.exception.kind,'session_token_missing')
        self.assertEqual(c.diagnostic['requests'],0)
        self.assertEqual(api.calls,[])
        self.assertEqual(signer.queries,[])
        self.assertEqual(c.cookie('msToken'),'')

    def test_sdk_http_403_distinct_from_api_403_no_retry(self):
        self._without_token()
        api,sdk=Transport([]),Transport([urllib.error.HTTPError(TOKEN_URL,403,'denied',{},None)])
        c=DouyinClient(self.cookies,opener=api,session_opener=sdk,signer=SigningStub(),gap=0)
        with self.assertRaises(DouyinError) as caught:c.detail('126')
        self.assertEqual(caught.exception.kind,'session_http')
        self.assertEqual(c.diagnostic['token_http_status'],403)
        self.assertEqual(c.diagnostic['requests'],0)
        self.assertEqual(len(sdk.calls),1)
        self.assertFalse(api.calls)

    def test_sdk_does_not_run_if_imported_token_exists(self):
        api,sdk=Transport([{'aweme_detail':record(126)}]),Transport([])
        c=DouyinClient(self.cookies,opener=api,session_opener=sdk,signer=SigningStub(),gap=0)
        c.detail('126')
        self.assertFalse(sdk.calls)
        self.assertEqual(c.diagnostic['token_source'],'imported_cookie')

    def test_sdk_server_token_reused_only_in_memory_with_expiry(self):
        self._without_token();shared={}
        sdk=Transport([self._sdk_response()])
        for index in range(2):
            c=DouyinClient(self.cookies,opener=Transport([{'aweme_detail':record(126)}]),session_opener=sdk,session_state=shared,signer=SigningStub(),gap=0)
            c.detail('126')
        self.assertEqual(len(sdk.calls),1)
        self.assertEqual(c.diagnostic['token_source'],'server_cached')
        shared['expires']=0
        with self.assertRaises(AssertionError):
            DouyinClient(self.cookies,opener=Transport([]),session_opener=sdk,session_state=shared,signer=SigningStub(),gap=0).detail('126')

    def test_sdk_redirect_never_forwards_payload(self):
        with self.assertRaises(DouyinError) as caught:
            NoTokenRedirect().redirect_request(None,None,302,'',{},'https://evil.test/')
        self.assertEqual(caught.exception.kind,'session_redirect')

    def test_sdk_invalid_token_never_sent(self):
        self._without_token()
        api=Transport([])
        c=DouyinClient(self.cookies,opener=api,session_opener=Transport([self._sdk_response(cookie=False,token='TEST;TOKEN'+'A'*160)]),signer=SigningStub(),gap=0)
        with self.assertRaises(DouyinError) as caught:c.detail('126')
        self.assertEqual(caught.exception.kind,'session_token_missing')
        self.assertFalse(api.calls)

    def test_websign_covers_exact_sent_order_encoding_and_abogus(self):
        from ytdl.douyin_direct.vendor.native.websign import SALT
        c, transport, signer = self.client([{'aweme_detail':record(126)}])
        c.detail('126')
        req=transport.calls[0]
        query=urllib.parse.urlparse(req.full_url).query
        covered, digest=query.rsplit('&x-secsdk-web-signature=',1)
        params=urllib.parse.parse_qs(covered)
        stamp=params['timestamp'][0]
        expected=hashlib.md5(('TEST_UIFID_'+stamp+'_'+SALT+'_'+covered).encode()).hexdigest()
        self.assertEqual(digest,expected)
        self.assertEqual(params['a_bogus'],['TEST+SIGNATURE/='])
        self.assertEqual(params['uifid'],['TEST_UIFID'])
        self.assertEqual(req.get_header('X-secsdk-web-signature'),digest)
        self.assertEqual(req.get_header('X-secsdk-web-expire'),stamp)
        self.assertEqual(req.get_header('Uifid'),'TEST_UIFID')
        self.assertEqual(covered.split('&a_bogus=',1)[0],signer.queries[0])
        self.assertEqual(covered.count('uifid='),1)
        self.assertTrue(c.diagnostic['websign_added'])
        self.assertNotIn(digest,json.dumps(c.diagnostic))
        self.assertNotIn('TEST_UIFID',json.dumps(c.diagnostic))

    def test_native_real_signer_and_websign_together_without_browser(self):
        from ytdl.douyin_direct.vendor.native.abogus import decode, structure_error
        from ytdl.douyin_direct.vendor.native.websign import SALT
        transport=Transport([{'aweme_detail':record(126)}])
        c=DouyinClient(self.cookies,opener=transport,gap=0)
        c.detail('126')
        query=urllib.parse.urlparse(transport.calls[0].full_url).query
        covered,digest=query.rsplit('&x-secsdk-web-signature=',1)
        values=urllib.parse.parse_qs(covered)
        ab=values['a_bogus'][0]
        self.assertIsNone(structure_error(ab))
        self.assertEqual(decode(ab)['page_id'],6241)
        self.assertEqual(decode(ab)['aid'],6383)
        self.assertEqual(digest,hashlib.md5(('TEST_UIFID_'+values['timestamp'][0]+'_'+SALT+'_'+covered).encode()).hexdigest())

    def test_uifid_temp_alias_is_read_from_own_cookie(self):
        self.cookies.write_text(self.cookies.read_text().replace('\tuifid\tTEST_UIFID','\tUIFID_TEMP\tTEST_TEMP_UIFID'))
        c, transport, signer=self.client([{'aweme_detail':record(126)}])
        c.detail('126')
        self.assertEqual(urllib.parse.parse_qs(signer.queries[0])['uifid'],['TEST_TEMP_UIFID'])

    def test_missing_uifid_stops_before_unsigned_protected_api(self):
        self.cookies.write_text(self.cookies.read_text().replace('.douyin.com\tTRUE\t/\tTRUE\t0\tuifid\tTEST_UIFID\n',''))
        c, transport, signer=self.client([])
        with self.assertRaises(DouyinError) as caught:c.detail('126')
        self.assertEqual(caught.exception.kind,'identity_missing')
        self.assertFalse(transport.calls)
        self.assertFalse(signer.queries)
        self.assertFalse(c.diagnostic['has_uifid'])

    def test_post_request_business_fields_and_cookie_webid(self):
        with self.cookies.open('a') as f:f.write('.douyin.com\tTRUE\t/\tTRUE\t0\tttwidinfo_webid\t1234567890123456789\n')
        c, transport, signer=self.client([{'aweme_list':[record(126)],'has_more':0,'max_cursor':0}])
        c.resolve_target('https://www.douyin.com/user/OWNER_A?from_tab_name=main')
        c.records('profile','OWNER_A')
        values=urllib.parse.parse_qs(signer.queries[0],keep_blank_values=True)
        for key,value in {'locate_query':'false','show_live_replay_strategy':'1','need_time_list':'1','time_list_query':'0','whale_cut_token':'','cut_version':'1','publish_video_strategy_type':'2','from_user_page':'1','update_version_code':'170400','pc_libra_divert':'Windows','support_h265':'1','support_dash':'1','webid':'1234567890123456789','browser_version':'154.0.0.0','browser_language':'vi'}.items():
            self.assertEqual(values[key],[value],key)
        self.assertEqual(transport.calls[0].get_header('Referer'),'https://www.douyin.com/user/OWNER_A')
        self.assertNotIn('1234567890123456789',json.dumps(c.diagnostic))

    def test_http_403_known_reason_only_not_arbitrary_body(self):
        e=urllib.error.HTTPError(API_ORIGIN,403,'denied',{},io.BytesIO(b'Blocked by ArgusSecurityPlugin Uifid Not Found TEST_SECRET_RESPONSE'))
        c,_,_=self.client([e])
        with self.assertRaises(DouyinError):c.detail('126')
        self.assertEqual(c.diagnostic['denial_reason'],'uifid_missing')
        self.assertNotIn('TEST_SECRET_RESPONSE',json.dumps(c.diagnostic))

    def test_native_sm3_matches_standard_vectors(self):
        from ytdl.douyin_direct.vendor.native.sm3 import sm3_hexdigest
        for raw, expected in [(b'abc','66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0'),(b'abcd'*16,'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732')]:
            self.assertEqual(sm3_hexdigest(raw),expected)

    def test_collection_endpoint_preserves_playlist_not_post_chronology(self):
        raw=[record(90,title='Không có số',mix='12'),record(3,title='Không có số',mix='12'),record(70,title='Không có số',mix='12')]
        c, transport, _=self.client([{'aweme_list':raw[:2],'has_more':1,'cursor':2},{'aweme_list':[raw[1],raw[2]],'has_more':0,'cursor':3}])
        result=c.records('collection','12')
        items,_=directscan.ordered_items(result,'Tên bộ')
        self.assertEqual([i['id'] for i in items],['90','3','70'])
        self.assertEqual([i['episode'] for i in items],[1,2,3])
        self.assertEqual([i['name'] for i in items],['Tập 001 - Tên bộ','Tập 002 - Tên bộ','Tập 003 - Tên bộ'])
        self.assertTrue(all(i['episode_source']=='douyin_collection_order' for i in items))
        self.assertTrue(all('/mix/aweme/' in r.full_url for r in transport.calls))

    def test_collection_native_episode_metadata_controls_numbers(self):
        rows=[]
        for index,ep in enumerate([3,1,2],1):
            r=record(index,title='Không có số',mix='12')
            r.update(_collection_id='12',_collection_position=index)
            r['mix_info']['statis']={'current_episode':ep}
            rows.append(r)
        items,_=directscan.ordered_items(rows,'Bộ')
        self.assertEqual([i['id'] for i in items],['2','3','1'])
        self.assertEqual([i['episode'] for i in items],[1,2,3])
        self.assertTrue(all(i['episode_source']=='douyin_episode_metadata' for i in items))

    def test_repeated_collection_total_is_not_every_video_episode(self):
        rows=[]
        for index in [1,2,3]:
            r=record(index,title='Không có số',mix='12')
            r.update(_collection_id='12',_collection_position=index)
            r['mix_info']['statis']={'current_episode':18}
            rows.append(r)
        items,_=directscan.ordered_items(rows,'Bộ')
        self.assertEqual([i['episode'] for i in items],[1,2,3])
        self.assertTrue(all(i['episode_source']=='douyin_collection_order' for i in items))

    def test_user_post_unknowns_never_become_collection_numbers(self):
        rows=[record(99,title='Không có số',mix='12'),record(5,title='Không có số',mix='12')]
        for r in rows:r['mix_info']['statis']={'current_episode':18}
        items,_=directscan.ordered_items(rows,'Bộ')
        self.assertTrue(all(i['episode'] is None for i in items))
        self.assertTrue(all('Chưa rõ tập' in i['name'] for i in items))

    def test_partial_collection_keeps_received_episode_positions(self):
        c,_,_=self.client([{'aweme_list':[record(90,title='Không số',mix='12'),record(3,title='Không số',mix='12')],'has_more':1,'cursor':0}])
        with self.assertRaises(DouyinError):c.records('collection','12')
        items,_=directscan.ordered_items(c.last_items,'Bộ')
        self.assertEqual([i['episode'] for i in items],[1,2])
        self.assertFalse(c.complete)

    def test_collection_selected_episodes_keep_numbers_and_direct_urls(self):
        rows=[]
        for index in range(1,19):
            r=record(index,title='Không số',mix='12');r.update(_collection_id='12',_collection_position=index)
            r['video']['play_addr']['url_list']=['https://v3.douyinvod.com/%d.mp4?sig=TEST%%2B'%index]
            rows.append(r)
        items,_=directscan.ordered_items(rows,'Bộ')
        from ytdl.bridge import items_lines
        lines=items_lines([items[1],items[4],items[17]])
        self.assertEqual([line.split('\t')[1] for line in lines],['Tập 002 - Bộ','Tập 005 - Bộ','Tập 018 - Bộ'])
        self.assertEqual([line.split('\t')[2] for line in lines],[rows[index]['video']['play_addr']['url_list'][0] for index in (1,4,17)])

    def test_download_reconcile_names_existing_idle_rows_only_and_orders_scope(self):
        from ytdl.download_order import reconcile
        from types import SimpleNamespace
        refresh=[]
        engine=SimpleNamespace(order=['other1','ep3','ep1','other2','ep2'],lock=threading.Lock(),items={})
        for iid in engine.order:
            engine.items[iid]={'url':'https://example.test/'+iid,'title':'Old '+iid,'status':'Chờ','edited':False,'fetching':True}
        engine.items['ep3']['status']='Đang tải'
        dl=SimpleNamespace(eng=engine,refresh=refresh.append,rebuild_tree=lambda:None)
        lines=['https://example.test/ep%d\tTập %03d - Bộ\thttps://cdn.test/%d.mp4'%(ep,ep,ep) for ep in (1,2,3)]
        self.assertEqual(reconcile(dl,lines),2)
        self.assertEqual(engine.order,['other1','ep1','ep2','other2','ep3'])
        self.assertEqual(engine.items['ep1']['title'],'Tập 001 - Bộ')
        self.assertEqual(engine.items['ep2']['title'],'Tập 002 - Bộ')
        self.assertEqual(engine.items['ep3']['title'],'Old ep3')
        self.assertEqual(engine.items['other1']['title'],'Old other1')
        self.assertTrue(engine.items['ep1']['edited'])
        self.assertFalse(engine.items['ep1']['fetching'])
        self.assertEqual(engine.items['ep2']['direct'],'https://cdn.test/2.mp4')
        self.assertEqual(refresh,['ep1','ep2'])

    def test_download_reconcile_does_not_touch_completed_or_queued_rows(self):
        from ytdl.download_order import reconcile
        from types import SimpleNamespace
        engine=SimpleNamespace(order=['one','two'],lock=threading.Lock(),items={
            'one':{'url':'https://example.test/1','title':'Finished','status':'Hoàn tất'},
            'two':{'url':'https://example.test/2','title':'Queued','status':'Hàng đợi'}})
        dl=SimpleNamespace(eng=engine,refresh=lambda iid:self.fail('Must not refresh protected download'))
        self.assertEqual(reconcile(dl,['https://example.test/1\tTập 001','https://example.test/2\tTập 002']),0)
        self.assertEqual(engine.items['one']['title'],'Finished')
        self.assertEqual(engine.items['two']['title'],'Queued')

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
        unsigned, signature = query.split('&a_bogus=', 1)
        signature = signature.split('&', 1)[0]
        self.assertEqual(unsigned, signer.queries[0])
        self.assertIn('msToken=TEST_TOKEN%2BA%3D%3D', unsigned)
        self.assertEqual(urllib.parse.unquote(signature), 'TEST+SIGNATURE/=')
        self.assertEqual(request.get_header('User-agent'), UA)
    def test_only_douyin_cookies_and_session_expiry_zero(self):
        c, _, _ = self.client([])
        self.assertEqual(c.cookie('sessionid'), 'TEST_SESSION')
        self.assertEqual(c.cookie('SECRET'), '')
        self.assertEqual(c.cookie('GOOGLE'), '')
        self.assertEqual(len(list(c.jar)), 3)
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


def test_collection_fetch_ignores_post_cache_then_reuses_native_order(self):
    all_transports=[]
    profile=[record(3,title='Không số',mix='12'),record(2,title='Không số',mix='12'),record(1,title='Không số',mix='12')]
    playlist=[profile[2],profile[1],profile[0]]
    def factory(cookie_file,**kwargs):
        replies=[{'aweme_list':profile,'has_more':0,'max_cursor':0}] if not all_transports else [{'aweme_list':playlist,'has_more':0,'cursor':0}]
        transport=Transport(replies);all_transports.append(transport)
        return DouyinClient(cookie_file,opener=transport,signer=SigningStub(),gap=0,**kwargs)
    service=directscan.Scanner(self.cookies,factory)
    job=service.submit('https://www.douyin.com/user/OWNER_A',kind='list');service.thread.join(3)
    self.assertEqual(job.state,'done')
    group=job.groups[0]
    for index in range(2):
        job=service.submit(group['url'],{'group_key':group['key'],'name':group['name'],'merged':True},'scan');service.thread.join(3)
        self.assertEqual(job.state,'done')
        self.assertEqual([i['id'] for i in job.items],['1','2','3'])
        self.assertEqual([i['episode'] for i in job.items],[1,2,3])
    self.assertIn('/mix/aweme/',all_transports[1].calls[0].full_url)
    self.assertEqual(len(all_transports[2].calls),0)

ScannerTests.test_collection_fetch_ignores_post_cache_then_reuses_native_order=test_collection_fetch_ignores_post_cache_then_reuses_native_order

if __name__=='__main__':unittest.main(verbosity=2)
