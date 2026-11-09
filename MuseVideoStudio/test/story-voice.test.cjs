const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const v = require('../src/story-voice.cjs');
const { command } = require('../src/merge.cjs');

const has = (cmd, args = ['--version']) => spawnSync(cmd, args).status === 0;
const hasFfmpeg = has('ffmpeg', ['-version']) && has('ffprobe', ['-version']);
const hasNumpy = process.platform !== 'win32' && has('python3', ['-c', 'import numpy']);
const temp = async t => { const d = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-voice-')); t.after(() => fs.rm(d, { recursive: true, force: true })); return d; };

test('nhận Python 3.10–3.13, bỏ bản cũ/mới; tên giọng clone thành khóa ASCII', () => {
  assert.deepEqual(v.parseVersion('Python 3.12.4'), [3, 12]);
  assert.equal(v.parseVersion('không phải python'), null);
  assert.ok(v.inRange([3, 10]) && v.inRange([3, 13]) && !v.inRange([3, 9]) && !v.inRange([3, 14]) && !v.inRange(null));
  assert.equal(v.slug('Giọng Đức Mạnh!'), 'Giong-Duc-Manh');
  assert.equal(v.slug('???'), 'giong');
});

function fakeRunner(plan) {
  const calls = [];
  const run = async (file, args, options = {}) => {
    calls.push([file, ...args].join(' '));
    for (const [pattern, reply] of plan) if (pattern.test(calls.at(-1))) { const r = typeof reply === 'function' ? await reply(file, args, options) : reply; return { code: 0, out: '', err: '', ...r }; }
    return { code: 0, out: '', err: '' };
  };
  run.calls = calls;
  return run;
}

test('cài giọng: tìm Python, tạo môi trường, cài edge-tts + vieneu, ghi trạng thái sẵn sàng', async t => {
  const dir = await temp(t);
  const messages = [];
  const runner = fakeRunner([[/python3\.12 --version/, { out: 'Python 3.12.4' }], [/-m venv/, async (_f, args) => { const target = args.at(-1); await fs.mkdir(path.join(target, 'bin'), { recursive: true }); await fs.writeFile(path.join(target, 'bin', 'python'), ''); return {}; }]]);
  const svc = v.createVoiceService({ dataDir: dir, platform: 'linux', runner, notify: () => messages.push(svc.status().setupMessage) });
  const status = await svc.setup();
  assert.deepEqual(status.ready, { edge: true, clone: true });
  assert.ok(runner.calls.some(c => /-m pip install .*edge-tts/.test(c)));
  assert.ok(runner.calls.some(c => /-m pip install .*vieneu/.test(c)));
  assert.ok(runner.calls.some(c => /-c import vieneu/.test(c)));
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'voice-ready.json'), 'utf8')).engines.clone, true);
  assert.ok((await fs.readFile(path.join(dir, 'voice_helper.py'), 'utf8')).includes('def run_clone'));
  const again = v.createVoiceService({ dataDir: dir, platform: 'linux', runner });
  assert.deepEqual((await again.load()).ready, { edge: true, clone: true });
});

test('cài giọng: thiếu Python thì báo cách cài; clone lỗi vẫn giữ giọng Microsoft', async t => {
  const dir = await temp(t);
  const none = v.createVoiceService({ dataDir: dir, platform: 'linux', runner: async () => ({ code: 1, out: '', err: 'not found' }) });
  await assert.rejects(() => none.setup(), /Cài Python 3\.12.*Add python\.exe to PATH/);
  assert.match(none.status().setupError, /Python 3\.10/);
  assert.equal(none.status().setupBusy, false);
  const dir2 = await temp(t);
  const runner = fakeRunner([[/python3\.12 --version/, { out: 'Python 3.12.1' }], [/-m venv/, async (_f, args) => { await fs.mkdir(path.join(args.at(-1), 'bin'), { recursive: true }); await fs.writeFile(path.join(args.at(-1), 'bin', 'python'), ''); return {}; }], [/pip install .*vieneu/, { code: 1, err: 'ERROR: No matching distribution found for vieneu' }]]);
  const partial = v.createVoiceService({ dataDir: dir2, platform: 'linux', runner });
  const status = await partial.setup();
  assert.deepEqual(status.ready, { edge: true, clone: false });
  assert.match(status.setupMessage, /clone chưa cài được.*No matching distribution/);
});

// Thư viện giả cho edge_tts / vieneu để chạy THẬT voice_helper.py (giao thức, chia câu, thử lại, lỗi).
async function fakeLibs(dir) {
  const libs = path.join(dir, 'fakelibs');
  await fs.mkdir(libs, { recursive: true });
  await fs.writeFile(path.join(libs, 'edge_tts.py'), `
import wave, struct, os
async def list_voices():
    if os.environ.get('FAKE_VOICES_FAIL'):
        raise RuntimeError('mạng lỗi')
    rows = [dict(ShortName='vi-VN-HoaiMyNeural', Gender='Female', Locale='vi-VN', Status='GA'), dict(ShortName='vi-VN-NamMinhNeural', Gender='Male', Locale='vi-VN', Status='GA'),
            dict(ShortName='fr-CA-SylvieNeural', Gender='Female', Locale='fr-CA', Status='GA'), dict(ShortName='zh-TW-HsiaoChenNeural', Gender='Female', Locale='zh-TW', Status='GA'),
            dict(ShortName='en-US-AvaMultilingualNeural', Gender='Female', Locale='en-US', Status='GA'), dict(ShortName='xx-YY-CuNeural', Gender='Male', Locale='xx-YY', Status='Deprecated')]
    rows += [dict(ShortName='en-GB-Fake%dNeural' % i, Gender='Male' if i % 2 else 'Female', Locale='en-GB', Status='GA') for i in range(25)]
    return rows
class Communicate:
    def __init__(self, text, voice):
        self.text, self.voice = text, voice
    async def save(self, path):
        if 'LOI' in self.text:
            raise RuntimeError('403 Invalid response status')
        with wave.open(path, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
            w.writeframes(struct.pack('<h', 1000) * int(16000 * 0.04 * len(self.text)))
`);
  await fs.writeFile(path.join(libs, 'vieneu.py'), `
import wave, numpy as np, os
class Vieneu:
    sample_rate = 48000
    def __init__(self, *a, **k):
        self.voices = {}
        self.mode = k.get('mode')
    def add_voice(self, name, ref):
        if not os.path.exists(ref): raise FileNotFoundError(ref)
        self.voices[name] = ref
    def infer(self, text, voice=None, ref_audio=None, denoise=False):
        assert voice in self.voices or ref_audio or (self.mode == 'v3turbo' and voice in ('Thiện Minh', 'Mai Anh', 'Adam bựa')), 'thiếu giọng'
        assert len(text) <= 200, 'đoạn quá dài: %d' % len(text)
        return np.full(int(48000 * 0.03 * len(text)), 0.2, dtype=np.float32)
    def save(self, audio, path):
        pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
        with wave.open(path, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(pcm)
`);
  return libs;
}
async function readyService(dir, libs) {
  const venv = path.join(dir, 'voice-env', 'bin');
  await fs.mkdir(venv, { recursive: true });
  await fs.symlink(spawnSync('which', ['python3']).stdout.toString().trim(), path.join(venv, 'python'));
  await fs.writeFile(path.join(dir, 'voice_helper.py'), await fs.readFile(path.join(__dirname, '../src/voice_helper.py'), 'utf8'));
  await fs.writeFile(path.join(dir, 'voice-ready.json'), JSON.stringify({ engines: { edge: true, clone: true } }));
  process.env.PYTHONPATH = libs; process.env.VOICE_RETRY_SECONDS = '0';
  const svc = v.createVoiceService({ dataDir: dir, platform: 'linux' });
  await svc.load();
  return svc;
}

test('giọng Microsoft (edge): đọc nhiều cảnh, báo tiến độ, thử lại rồi báo lỗi thật', { skip: !(hasFfmpeg && hasNumpy) && 'cần ffmpeg + python3 + numpy' }, async t => {
  const dir = await temp(t);
  const svc = await readyService(dir, await fakeLibs(dir));
  const progress = [];
  const out = await svc.synth({ engine: 'edge', voice: 'vi-VN-HoaiMyNeural', items: [{ id: '1', text: 'Xin chào các bạn' }, { id: '2', text: 'Hôm nay trời đẹp lắm' }], dir: path.join(dir, 'run'), onProgress: m => progress.push(m) });
  assert.deepEqual(out.map(o => o.id), ['1', '2']);
  assert.ok(Math.abs(out[0].seconds - 0.04 * 'Xin chào các bạn'.length) < 0.1);
  assert.ok(progress.includes('Đã đọc 2/2 cảnh'));
  await assert.rejects(() => svc.synth({ engine: 'edge', voice: 'vi-VN-HoaiMyNeural', items: [{ id: '1', text: 'LOI' }], dir: path.join(dir, 'run2') }), /Microsoft không trả giọng đọc.*403/);
  await assert.rejects(() => svc.synth({ engine: 'edge', voice: 'giong-la', items: [{ id: '1', text: 'a' }], dir: path.join(dir, 'run3') }), /Chọn một giọng Microsoft/);
});

test('giọng Microsoft: bản dự phòng có hơn 70 ngôn ngữ, Việt rồi Anh đứng đầu; danh sách thật được lọc và xếp theo ngôn ngữ', () => {
  assert.ok(v.EDGE_VOICES.length >= 190, 'số giọng dự phòng: ' + v.EDGE_VOICES.length);
  assert.ok(new Set(v.EDGE_VOICES.map(x => x.language)).size >= 70, 'số nhóm ngôn ngữ');
  assert.deepEqual(v.EDGE_VOICES.slice(0, 2).map(x => [x.id, x.name, x.lang, x.language]), [['vi-VN-HoaiMyNeural', 'Hoài My (nữ)', 'vi', 'Tiếng Việt'], ['vi-VN-NamMinhNeural', 'Nam Minh (nam)', 'vi', 'Tiếng Việt']]);
  assert.ok(v.EDGE_VOICES.some(x => x.id === 'en-US-AriaNeural' && x.lang === 'en'));
  assert.ok(v.EDGE_VOICES.some(x => x.id === 'zh-TW-HsiaoChenNeural' && x.lang === 'zh' && /phồn thể/.test(x.language)), 'Trung phồn thể so khớp với tiếng Trung');
  assert.ok(v.EDGE_VOICES.some(x => x.lang === '*' && /Multilingual/.test(x.id)), 'có nhóm giọng đa ngôn ngữ');
  assert.equal(new Set(v.EDGE_VOICES.map(x => x.id)).size, v.EDGE_VOICES.length, 'không trùng giọng');
  const rows = [
    { ShortName: 'en-US-AvaMultilingualNeural', Gender: 'Female', Locale: 'en-US', Status: 'GA' }, { ShortName: 'fr-CA-SylvieNeural', Gender: 'Female', Locale: 'fr-CA', Status: 'GA' },
    { ShortName: 'zh-TW-HsiaoChenNeural', Gender: 'Female', Locale: 'zh-TW', Status: 'GA' }, { ShortName: 'vi-VN-NamMinhNeural', Gender: 'Male', Locale: 'vi-VN', Status: 'GA' },
    { ShortName: 'xx-YY-CuNeural', Gender: 'Male', Locale: 'xx-YY', Status: 'Deprecated' }, { ShortName: 'sw-KE-ZuriNeural', Gender: 'Female', Locale: 'sw-KE', Status: 'GA' },
    { ShortName: 'zz-ZZ-LaNeural', Gender: 'Male', Locale: 'zz-ZZ' }, { ShortName: 'hỏng', Gender: 'Male', Locale: 'en-US' }, { ShortName: 'en-US-NoGender', Locale: 'en-US' },
    ...Array.from({ length: 25 }, (_, i) => ({ ShortName: `en-GB-Fake${i}Neural`, Gender: i % 2 ? 'Male' : 'Female', Locale: 'en-GB', Status: 'GA' }))
  ];
  const list = v.buildEdgeVoices([...rows, rows[3]]);
  assert.equal(list[0].id, 'vi-VN-NamMinhNeural', 'tiếng Việt đứng đầu');
  assert.equal(list[1].lang, 'en', 'rồi tiếng Anh');
  assert.equal(list.at(-1).id, 'en-US-AvaMultilingualNeural', 'nhóm đa ngôn ngữ xếp cuối cùng');
  assert.equal(list.at(-1).lang, '*');
  assert.equal(list.at(-2).id, 'zz-ZZ-LaNeural', 'ngôn ngữ lạ xếp trước nhóm đa ngôn ngữ');
  assert.ok(!list.some(x => x.id === 'xx-YY-CuNeural'), 'giọng ngừng hỗ trợ bị bỏ');
  assert.ok(!list.some(x => x.id === 'hỏng' || x.id === 'en-US-NoGender'), 'dòng hỏng bị bỏ');
  assert.equal(list.filter(x => x.id === 'vi-VN-NamMinhNeural').length, 1, 'không trùng');
  const fr = list.find(x => x.id === 'fr-CA-SylvieNeural');
  assert.deepEqual([fr.lang, fr.language, fr.name], ['fr', 'Tiếng Pháp', 'Sylvie (nữ) · fr-CA']);
  assert.equal(list.find(x => x.id === 'zz-ZZ-LaNeural').language, 'zz-ZZ', 'ngôn ngữ chưa có tên thì ghi mã vùng');
  assert.deepEqual(v.buildEdgeVoices(rows.slice(0, 6)), [], 'danh sách quá ngắn (lỗi tải) không được tin');
  assert.deepEqual(v.buildEdgeVoices(null), []);
});

test('danh sách giọng thật từ Microsoft: tải, lưu, dùng được giọng chỉ có trong danh sách thật; lỗi thì giữ danh sách cũ', { skip: !(hasFfmpeg && hasNumpy) && 'cần ffmpeg + python3 + numpy' }, async t => {
  const dir = await temp(t);
  const svc = await readyService(dir, await fakeLibs(dir));
  assert.deepEqual([svc.status().catalog.live, svc.status().edgeVoices.length], [false, v.EDGE_VOICES.length], 'chưa tải thì dùng bản dự phòng');
  await assert.rejects(() => svc.synth({ engine: 'edge', voice: 'fr-CA-SylvieNeural', items: [{ id: '1', text: 'a' }], dir: path.join(dir, 'a') }), /Chọn một giọng Microsoft/);
  await svc.refreshCatalog({ force: true });
  const st = svc.status();
  assert.equal(st.catalog.live, true); assert.equal(st.catalog.busy, false); assert.equal(st.catalog.error, '');
  assert.equal(st.catalog.count, st.edgeVoices.length);
  assert.ok(st.edgeVoices.some(x => x.id === 'fr-CA-SylvieNeural'), 'giọng mới từ Microsoft có trong danh sách');
  assert.equal(st.edgeVoices[0].lang, 'vi');
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'ms-voices.json'), 'utf8'));
  assert.ok(saved.rows.length >= 30 && saved.at > 0, 'danh sách đã lưu');
  const [one] = await svc.synth({ engine: 'edge', voice: 'fr-CA-SylvieNeural', items: [{ id: '1', text: 'Bonjour tout le monde' }], dir: path.join(dir, 'b') });
  assert.ok(one.seconds > 0.3);
  const again = v.createVoiceService({ dataDir: dir, platform: 'linux' });
  const loaded = await again.load();
  assert.equal(loaded.catalog.live, true, 'mở lại app vẫn dùng danh sách đã lưu');
  assert.ok(loaded.edgeVoices.some(x => x.id === 'fr-CA-SylvieNeural'));
  // Không ép tải khi danh sách còn mới: không chạy gì (đặt lỗi giả mà vẫn không báo lỗi).
  process.env.FAKE_VOICES_FAIL = '1';
  t.after(() => { delete process.env.FAKE_VOICES_FAIL; });
  const fresh = await svc.refreshCatalog();
  assert.equal(fresh.catalog.error, '', 'còn mới nên không tải lại');
  await assert.rejects(() => svc.refreshCatalog({ force: true }), /Chưa tải được danh sách giọng Microsoft \(.*mạng lỗi.*\)\. Đang dùng danh sách có sẵn\./);
  assert.match(svc.status().catalog.error, /Chưa tải được danh sách giọng Microsoft/);
  assert.equal(svc.status().catalog.live, true, 'lỗi tải thì giữ danh sách đã có');
  assert.equal(svc.status().catalog.busy, false);
});

test('danh sách giọng thật: chưa cài giọng Microsoft thì không tải (ép tải báo rõ)', async t => {
  const dir = await temp(t);
  const svc = v.createVoiceService({ dataDir: dir, platform: 'linux', runner: async () => { throw Error('không được chạy'); } });
  await svc.load();
  assert.equal((await svc.refreshCatalog()).catalog.live, false);
  await assert.rejects(() => svc.refreshCatalog({ force: true }), /Chưa cài giọng Microsoft/);
});

test('giọng Việt có sẵn VieNeu: 25 giọng, đọc không cần file mẫu, nghe thử, chọn sai hoặc chưa cài thì báo; helper luôn là bản mới', { skip: !(hasFfmpeg && hasNumpy) && 'cần ffmpeg + python3 + numpy' }, async t => {
  const dir = await temp(t);
  const svc = await readyService(dir, await fakeLibs(dir));
  const presets = svc.status().presets;
  assert.equal(presets.length, 25);
  assert.deepEqual(presets[0], { name: 'Adam bựa', desc: 'Nam · Bắc · Phong cách tự nhiên', gender: 'm', region: 'Bắc' });
  assert.deepEqual([...new Set(presets.map(p => p.region))].sort(), ['Bắc', 'Nam', 'Trung']);
  assert.ok(presets.some(p => p.name === 'Thiện Minh') && presets.some(p => p.name === 'Mai Anh'));
  await fs.writeFile(path.join(dir, 'voice_helper.py'), 'raise SystemExit(5)\n');   // bản cũ của lần cài trước
  const progress = [];
  const [one] = await svc.synth({ engine: 'preset', voice: 'Thiện Minh', items: [{ id: '1', text: 'Xin chào các bạn. Hôm nay trời đẹp lắm.' }], dir: path.join(dir, 'p'), onProgress: m => progress.push(m) });
  assert.ok(one.seconds > 0.5); assert.match(one.file, /\.wav$/);
  assert.ok(progress.includes('Đã nạp mô hình giọng.') && progress.includes('Đã đọc 1/1 cảnh'));
  assert.match(await fs.readFile(path.join(dir, 'voice_helper.py'), 'utf8'), /def run_preset/, 'helper được chép lại từ bản của app');
  const file = await svc.preview({ engine: 'preset', voice: 'Mai Anh', text: 'Xin chào' });
  assert.match(file, /nghe-.*\.wav$/); await fs.access(file);
  await assert.rejects(() => svc.synth({ engine: 'preset', voice: 'Giọng không có', items: [{ id: '1', text: 'a' }], dir: path.join(dir, 'x') }), /Chọn một giọng Việt có sẵn/);
  await assert.rejects(() => svc.synth({ engine: 'preset', voice: '', items: [{ id: '1', text: 'a' }], dir: path.join(dir, 'y') }), /Chọn một giọng Việt có sẵn/);
  // Giọng có trong danh sách của app nhưng thư viện VieNeu không có: báo đúng tên giọng, không đổi sang giọng khác.
  await assert.rejects(() => svc.synth({ engine: 'preset', voice: 'Ngọc Trân', items: [{ id: '1', text: 'a' }], dir: path.join(dir, 'z') }), /Giọng VieNeu «Ngọc Trân» chưa đọc được/);
  // Chưa cài VieNeu (clone chưa sẵn sàng) thì báo cài.
  const dir2 = await temp(t);
  await fs.writeFile(path.join(dir2, 'voice-ready.json'), JSON.stringify({ engines: { edge: true, clone: false } }));
  const bare = v.createVoiceService({ dataDir: dir2, platform: 'linux' }); await bare.load();
  await assert.rejects(() => bare.synth({ engine: 'preset', voice: 'Thiện Minh', items: [{ id: '1', text: 'a' }], dir: path.join(dir2, 'p') }), /Chưa cài giọng VieNeu/);
});

test('tốc độ đọc: tempo 0.9 làm lời dài hơn đúng tỉ lệ', { skip: !(hasFfmpeg && hasNumpy) && 'cần ffmpeg + python3 + numpy' }, async t => {
  const dir = await temp(t);
  const svc = await readyService(dir, await fakeLibs(dir));
  const text = 'Một hai ba bốn năm sáu bảy tám chín mười';
  const [normal] = await svc.synth({ engine: 'edge', voice: 'vi-VN-NamMinhNeural', items: [{ id: 'a', text }], dir: path.join(dir, 'n') });
  const [slowed] = await svc.synth({ engine: 'edge', voice: 'vi-VN-NamMinhNeural', items: [{ id: 'a', text }], tempo: 0.9, dir: path.join(dir, 's') });
  assert.ok(Math.abs(slowed.seconds / normal.seconds - 1 / 0.9) < 0.05, `${normal.seconds} → ${slowed.seconds}`);
});

test('tốc độ đọc chỉnh mịn 0.5×–2× (ngoài khoảng thì kẹp lại) và âm lượng giọng 0–200%', { skip: !(hasFfmpeg && hasNumpy) && 'cần ffmpeg + python3 + numpy' }, async t => {
  const dir = await temp(t);
  const svc = await readyService(dir, await fakeLibs(dir));
  const text = 'Một hai ba bốn năm sáu bảy tám chín mười';
  const make = async (name, extra) => (await svc.synth({ engine: 'edge', voice: 'vi-VN-NamMinhNeural', items: [{ id: 'a', text }], dir: path.join(dir, name), ...extra }))[0];
  const level = async file => { const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr); return m[1] === '-inf' ? -200 : Number(m[1]); };
  const normal = await make('n', {});
  const fast = await make('f', { tempo: 1.5 }), slow = await make('s', { tempo: 0.6 });
  assert.ok(Math.abs(normal.seconds / fast.seconds - 1.5) < 0.06, `1.5×: ${normal.seconds} → ${fast.seconds}`);
  assert.ok(Math.abs(slow.seconds / normal.seconds - 1 / 0.6) < 0.06, `0.6×: ${normal.seconds} → ${slow.seconds}`);
  const fastest = await make('x', { tempo: 9 }), slowest = await make('y', { tempo: 0.1 }), junk = await make('j', { tempo: 'abc' });
  assert.ok(Math.abs(normal.seconds / fastest.seconds - 2) < 0.08, 'tempo quá lớn bị kẹp ở 2×');
  assert.ok(Math.abs(slowest.seconds / normal.seconds - 2) < 0.08, 'tempo quá nhỏ bị kẹp ở 0.5×');
  assert.ok(Math.abs(junk.seconds - normal.seconds) < 0.05, 'giá trị lạ → 1×');
  const base = await level(normal.file), half = await level((await make('h', { volume: 0.5 })).file), twice = await level((await make('d', { volume: 2 })).file);
  assert.ok(Math.abs(base - half - 6.02) < 0.6, `50% phải nhỏ hơn ~6 dB: ${base} → ${half}`);
  assert.ok(twice - base > 3 && twice - base < 6.5, `200% phải to hơn tới ~6 dB (có chặn đỉnh): ${base} → ${twice}`);
  const mute = await level((await make('m', { volume: 0 })).file);
  assert.ok(mute < -80 || Number.isNaN(mute), `0% là im lặng: ${mute}`);
  const same = await make('k', { volume: 1, tempo: 1 });
  assert.equal(same.file.endsWith('-t.wav'), false, '1× và 100% không đụng tới file gốc');
  assert.deepEqual([v.normTempo(0.3), v.normTempo(1.234), v.normTempo(5), v.normTempo('x'), v.normTempo(0)], [0.5, 1.23, 2, 1, 1]);
  assert.deepEqual([v.normVolume(-3), v.normVolume(0), v.normVolume(1.254), v.normVolume(9), v.normVolume(undefined), v.normVolume('')], [0, 0, 1.25, 2, 1, 1]);
});

test('clone miễn phí: thêm giọng mẫu (có tick đồng ý), nghe thử, đọc câu dài chia đoạn ≤200 ký tự, xóa giọng', { skip: !(hasFfmpeg && hasNumpy) && 'cần ffmpeg + python3 + numpy' }, async t => {
  const dir = await temp(t);
  const svc = await readyService(dir, await fakeLibs(dir));
  const sample = path.join(dir, 'mau.wav'), quiet = path.join(dir, 'im.wav'), brief = path.join(dir, 'ngan.wav');
  const ff = (...a) => command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], 60000);
  await ff('-f', 'lavfi', '-i', 'sine=f=220:d=6', sample);
  await ff('-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '6', quiet);
  await ff('-f', 'lavfi', '-i', 'sine=f=220:d=1', brief);
  await assert.rejects(() => svc.addClone({ name: 'Tôi', source: sample, consent: false }), /Tick xác nhận/);
  await assert.rejects(() => svc.addClone({ name: '', source: sample, consent: true }), /Đặt tên/);
  await assert.rejects(() => svc.addClone({ name: 'Ngắn', source: brief, consent: true }), /quá ngắn/);
  await assert.rejects(() => svc.addClone({ name: 'Im', source: quiet, consent: true }), /im lặng/);
  assert.deepEqual(svc.status().clones, []);
  const added = await svc.addClone({ name: 'Giọng của Mạnh', source: sample, consent: true });
  assert.deepEqual(added, { key: 'Giong-cua-Manh', name: 'Giọng của Mạnh' });
  assert.deepEqual(svc.status().clones, [added]);
  const again = v.createVoiceService({ dataDir: dir, platform: 'linux' });
  assert.deepEqual((await again.load()).clones, [added], 'giọng clone còn sau khi mở lại app');
  const long = 'Đây là một câu khá dài để thử việc chia đoạn. '.repeat(12).trim();
  const [one] = await svc.synth({ engine: 'clone', voice: added.key, items: [{ id: '1', text: long }], dir: path.join(dir, 'c') });
  assert.ok(one.seconds > 5);
  const file = await svc.preview({ engine: 'clone', voice: added.key, text: 'Xin chào' });
  assert.match(file, /nghe-.*\.wav$/);
  await fs.access(file);
  await assert.rejects(() => svc.synth({ engine: 'clone', voice: 'khong-co', items: [{ id: '1', text: 'a' }], dir: path.join(dir, 'x') }), /Chưa chọn giọng clone/);
  await svc.removeClone(added.key);
  assert.deepEqual(svc.status().clones, []);
});

test('chưa cài giọng thì báo rõ; giọng Windows chỉ chạy trên Windows', async t => {
  const dir = await temp(t);
  const svc = v.createVoiceService({ dataDir: dir, platform: 'linux' });
  await svc.load();
  await assert.rejects(() => svc.synth({ engine: 'clone', voice: 'x', items: [{ id: '1', text: 'a' }], dir }), /Bấm «Cài giọng miễn phí»/);
  await assert.rejects(() => svc.synth({ engine: 'windows', voice: '', items: [{ id: '1', text: 'a' }], dir }), /chỉ có trên Windows/);
  await assert.rejects(() => svc.synth({ engine: 'none', items: [{ id: '1', text: 'a' }], dir }), /Chưa chọn giọng/);
  assert.deepEqual(await svc.listWindowsVoices(), []);
});

test('giọng Windows: gọi PowerShell với file lệnh UTF-8, đọc danh sách giọng', async t => {
  const dir = await temp(t);
  const calls = [];
  const runner = async (file, args, options) => {
    calls.push({ file, args });
    if (args.some(a => /sapi-list\.ps1$/.test(a))) return { code: 0, out: 'Microsoft An|vi-VN|Male\r\nMicrosoft Zira|en-US|Female\r\n', err: '' };
    const job = JSON.parse(await fs.readFile(args.at(-1), 'utf8'));
    assert.equal(job.voice, 'Microsoft An');
    assert.equal(job.items[0].text, 'Xin chào Việt Nam');
    for (const item of job.items) await fs.writeFile(item.out, 'wav');
    for (const item of job.items) options.onLine(JSON.stringify({ done: item.id }));
    return { code: 0, out: '', err: '' };
  };
  const svc = v.createVoiceService({ dataDir: dir, platform: 'win32', runner, getFfmpeg: () => 'ffmpeg' });
  const voices = await svc.listWindowsVoices();
  assert.deepEqual(voices.map(x => x.name), ['Microsoft An', 'Microsoft Zira']);
  assert.equal(voices[0].culture, 'vi-VN');
  assert.match(await fs.readFile(path.join(dir, 'sapi-speak.ps1'), 'utf8').catch(() => ''), /^$/, 'chưa đọc thì chưa có file lệnh');
  // synth cần ffprobe thật để đo giờ; ở đây chỉ kiểm tra phần gọi PowerShell nên chặn ở bước đo.
  await assert.rejects(() => svc.synth({ engine: 'windows', voice: 'Microsoft An', items: [{ id: '1', text: 'Xin chào Việt Nam' }], dir: path.join(dir, 'w') }));
  assert.ok(calls.some(c => c.file === 'powershell.exe' && c.args.includes('-ExecutionPolicy') && c.args.includes('Bypass') && c.args.some(a => /sapi-speak\.ps1$/.test(a))));
  assert.match(await fs.readFile(path.join(dir, 'sapi-speak.ps1'), 'utf8'), /System\.Speech/);
});
