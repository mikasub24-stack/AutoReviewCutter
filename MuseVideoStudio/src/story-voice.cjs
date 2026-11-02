// Giọng đọc miễn phí cho tab «Kể chuyện». Không dùng key, không dịch vụ trả phí.
//   windows : giọng có sẵn trong Windows (SAPI), chạy offline
//   edge    : giọng Microsoft Edge (miễn phí, cần mạng), qua Python riêng của app
//   clone   : nhân bản giọng bằng VieNeu (miễn phí, chạy trên máy), qua Python riêng của app
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { command } = require('./merge.cjs');

const ENGINES = ['none', 'windows', 'edge', 'clone'];
// Giọng Microsoft Edge miễn phí (edge-tts), theo ngôn ngữ. Giọng nào hợp ngôn ngữ kịch bản sẽ được chọn trước.
const EDGE_VOICES = [
  { id: 'vi-VN-HoaiMyNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Hoài My (nữ)' },
  { id: 'vi-VN-NamMinhNeural', lang: 'vi', language: 'Tiếng Việt', name: 'Nam Minh (nam)' },
  { id: 'en-US-AriaNeural', lang: 'en', language: 'Tiếng Anh', name: 'Aria (nữ)' },
  { id: 'en-US-GuyNeural', lang: 'en', language: 'Tiếng Anh', name: 'Guy (nam)' },
  { id: 'en-US-JennyNeural', lang: 'en', language: 'Tiếng Anh', name: 'Jenny (nữ)' },
  { id: 'en-GB-SoniaNeural', lang: 'en', language: 'Tiếng Anh', name: 'Sonia (Anh) (nữ)' },
  { id: 'en-GB-RyanNeural', lang: 'en', language: 'Tiếng Anh', name: 'Ryan (Anh) (nam)' },
  { id: 'zh-CN-XiaoxiaoNeural', lang: 'zh', language: 'Tiếng Trung', name: 'Xiaoxiao (nữ)' },
  { id: 'zh-CN-YunxiNeural', lang: 'zh', language: 'Tiếng Trung', name: 'Yunxi (nam)' },
  { id: 'ja-JP-NanamiNeural', lang: 'ja', language: 'Tiếng Nhật', name: 'Nanami (nữ)' },
  { id: 'ja-JP-KeitaNeural', lang: 'ja', language: 'Tiếng Nhật', name: 'Keita (nam)' },
  { id: 'ko-KR-SunHiNeural', lang: 'ko', language: 'Tiếng Hàn', name: 'SunHi (nữ)' },
  { id: 'ko-KR-InJoonNeural', lang: 'ko', language: 'Tiếng Hàn', name: 'InJoon (nam)' },
  { id: 'es-ES-ElviraNeural', lang: 'es', language: 'Tiếng Tây Ban Nha', name: 'Elvira (nữ)' },
  { id: 'es-ES-AlvaroNeural', lang: 'es', language: 'Tiếng Tây Ban Nha', name: 'Alvaro (nam)' },
  { id: 'fr-FR-DeniseNeural', lang: 'fr', language: 'Tiếng Pháp', name: 'Denise (nữ)' },
  { id: 'fr-FR-HenriNeural', lang: 'fr', language: 'Tiếng Pháp', name: 'Henri (nam)' },
  { id: 'de-DE-KatjaNeural', lang: 'de', language: 'Tiếng Đức', name: 'Katja (nữ)' },
  { id: 'de-DE-ConradNeural', lang: 'de', language: 'Tiếng Đức', name: 'Conrad (nam)' },
  { id: 'pt-BR-FranciscaNeural', lang: 'pt', language: 'Tiếng Bồ Đào Nha', name: 'Francisca (nữ)' },
  { id: 'pt-BR-AntonioNeural', lang: 'pt', language: 'Tiếng Bồ Đào Nha', name: 'Antonio (nam)' },
  { id: 'it-IT-ElsaNeural', lang: 'it', language: 'Tiếng Ý', name: 'Elsa (nữ)' },
  { id: 'it-IT-DiegoNeural', lang: 'it', language: 'Tiếng Ý', name: 'Diego (nam)' },
  { id: 'ru-RU-SvetlanaNeural', lang: 'ru', language: 'Tiếng Nga', name: 'Svetlana (nữ)' },
  { id: 'ru-RU-DmitryNeural', lang: 'ru', language: 'Tiếng Nga', name: 'Dmitry (nam)' },
  { id: 'th-TH-PremwadeeNeural', lang: 'th', language: 'Tiếng Thái', name: 'Premwadee (nữ)' },
  { id: 'th-TH-NiwatNeural', lang: 'th', language: 'Tiếng Thái', name: 'Niwat (nam)' },
  { id: 'id-ID-GadisNeural', lang: 'id', language: 'Tiếng Indonesia', name: 'Gadis (nữ)' },
  { id: 'id-ID-ArdiNeural', lang: 'id', language: 'Tiếng Indonesia', name: 'Ardi (nam)' },
  { id: 'hi-IN-SwaraNeural', lang: 'hi', language: 'Tiếng Hindi', name: 'Swara (nữ)' },
  { id: 'hi-IN-MadhurNeural', lang: 'hi', language: 'Tiếng Hindi', name: 'Madhur (nam)' },
  { id: 'ar-SA-ZariyahNeural', lang: 'ar', language: 'Tiếng Ả Rập', name: 'Zariyah (nữ)' },
  { id: 'ar-SA-HamedNeural', lang: 'ar', language: 'Tiếng Ả Rập', name: 'Hamed (nam)' }
];
const TEMPOS = [0.9, 1, 1.15, 1.3];
const CLONE_SECONDS = { min: 3, max: 15 };
const PY_MIN = [3, 10], PY_MAX = [3, 13];

const SAPI_SCRIPT = `param([string]$Job)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$j = Get-Content -Raw -Encoding UTF8 -LiteralPath $Job | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($j.voice) { $s.SelectVoice([string]$j.voice) }
foreach ($it in $j.items) {
  $s.SetOutputToWaveFile([string]$it.out)
  $s.Speak([string]$it.text)
  $s.SetOutputToNull()
  Write-Output ('{"done":"' + $it.id + '"}')
}
Write-Output '{"ok":true}'
`;
const SAPI_LIST = `Add-Type -AssemblyName System.Speech
(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name + '|' + $_.VoiceInfo.Gender }
`;

const MISSING_PYTHON = 'Chưa thấy Python 3.10–3.13 trên máy. Cài Python 3.12 (python.org/downloads), nhớ tick «Add python.exe to PATH», rồi bấm Cài giọng miễn phí lại. Giọng Windows có sẵn vẫn dùng được không cần Python.';

function tail(text, n = 600) { return String(text || '').trim().slice(-n); }

// Chạy một lệnh, đọc từng dòng đầu ra. Dừng được bằng AbortSignal.
function exec(file, args, { timeout = 600000, onLine = () => {}, signal, env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(file, args, { windowsHide: true, shell: false, env: { ...process.env, ...env }, cwd }); }
    catch (error) { reject(error); return; }
    let out = '', err = '', pending = '', timedOut = false, aborted = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    const abort = () => { aborted = true; child.kill(); };
    if (signal) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); }
    const feed = chunk => {
      pending += chunk;
      let at;
      while ((at = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, at).replace(/\r$/, ''); pending = pending.slice(at + 1); if (line.trim()) onLine(line); }
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => { out = (out + d).slice(-200000); feed(d); });
    child.stderr.on('data', d => { err = (err + d).slice(-20000); });
    child.once('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(error); });
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (pending.trim()) onLine(pending.trim());
      if (aborted) reject(Object.assign(Error('Đã dừng.'), { name: 'AbortError' }));
      else if (timedOut) reject(Error('Quá thời gian chờ.'));
      else resolve({ code, out, err });
    });
  });
}

function parseVersion(text) {
  const m = /Python\s+(\d+)\.(\d+)\.?(\d*)/i.exec(text || '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}
const inRange = v => v && (v[0] > PY_MIN[0] || (v[0] === PY_MIN[0] && v[1] >= PY_MIN[1])) && (v[0] < PY_MAX[0] || (v[0] === PY_MAX[0] && v[1] <= PY_MAX[1]));

function slug(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D').replace(/đ/g, 'd').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'giong';
}

function createVoiceService({ dataDir, getFfmpeg = () => 'ffmpeg', platform = process.platform, notify = () => {}, runner = exec, helperSource = path.join(__dirname, 'voice_helper.py') }) {
  const envDir = path.join(dataDir, 'voice-env');
  const voicesDir = path.join(dataDir, 'voices');
  const helperFile = path.join(dataDir, 'voice_helper.py');
  const readyFile = path.join(dataDir, 'voice-ready.json');
  const win = platform === 'win32';
  const venvPython = win ? path.join(envDir, 'Scripts', 'python.exe') : path.join(envDir, 'bin', 'python');
  const state = { setupBusy: false, setupMessage: '', setupError: '', ready: { edge: false, clone: false }, clones: [], windowsVoices: [], loadedModel: false };
  let setupController = null;

  const ffprobe = () => {
    const f = getFfmpeg();
    return path.dirname(f) === '.' ? (win ? 'ffprobe.exe' : 'ffprobe') : path.join(path.dirname(f), win ? 'ffprobe.exe' : 'ffprobe');
  };
  async function durationOf(file) {
    const info = JSON.parse(await command(ffprobe(), ['-v', 'error', '-show_format', '-of', 'json', file], 60000));
    const d = Number(info.format?.duration);
    if (!(d > 0)) throw Error('File giọng đọc rỗng.');
    return d;
  }

  async function load() {
    try { state.ready = { edge: false, clone: false, ...(JSON.parse(await fs.readFile(readyFile, 'utf8')).engines || {}) }; } catch { state.ready = { edge: false, clone: false }; }
    try { state.clones = JSON.parse(await fs.readFile(path.join(voicesDir, 'index.json'), 'utf8')).filter(v => v && v.key && v.name); } catch { state.clones = []; }
    return status();
  }
  function status() {
    return {
      setupBusy: state.setupBusy, setupMessage: state.setupMessage, setupError: state.setupError,
      ready: { ...state.ready }, platform, edgeVoices: EDGE_VOICES,
      windowsVoices: state.windowsVoices, clones: state.clones.map(({ key, name }) => ({ key, name }))
    };
  }
  const say = message => { state.setupMessage = message; notify(); };

  async function findPython() {
    const names = win ? [['py', '-3.12'], ['py', '-3.11'], ['py', '-3.10'], ['py', '-3.13'], ['python'], ['python3']] : [['python3.12'], ['python3.11'], ['python3.10'], ['python3.13'], ['python3'], ['python']];
    for (const [file, ...extra] of names) {
      try {
        const r = await runner(file, [...extra, '--version'], { timeout: 15000 });
        const v = parseVersion(r.out + ' ' + r.err);
        if (r.code === 0 && inRange(v)) return { file, args: extra, version: v.join('.') };
      } catch { /* thử tên khác */ }
    }
    return null;
  }

  // Tạo môi trường Python riêng và cài thư viện giọng miễn phí. Chạy một lần.
  async function setup() {
    if (state.setupBusy) throw Error('Đang cài giọng, chờ xong đã.');
    state.setupBusy = true; state.setupError = ''; setupController = new AbortController();
    const { signal } = setupController;
    const log = [];
    const onLine = line => { log.push(line); if (/Collecting|Downloading|Installing|Successfully|Building/i.test(line)) say(line.slice(0, 140)); };
    try {
      say('Đang tìm Python…');
      const py = await findPython();
      if (!py) throw Error(MISSING_PYTHON);
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(helperFile, await fs.readFile(helperSource, 'utf8'), 'utf8');
      const engines = { edge: false, clone: false };
      try { await fs.access(venvPython); } catch {
        say(`Tạo môi trường giọng (Python ${py.version})…`);
        const r = await runner(py.file, [...py.args, '-m', 'venv', envDir], { timeout: 300000, signal, onLine });
        if (r.code !== 0) throw Error('Không tạo được môi trường Python: ' + tail(r.err || r.out));
      }
      const pip = (packages, timeout) => runner(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--upgrade', ...packages], { timeout, signal, onLine });
      say('Cài giọng Microsoft (edge-tts)…');
      let r = await pip(['edge-tts'], 600000);
      engines.edge = r.code === 0;
      const problems = [];
      if (!engines.edge) problems.push('edge-tts: ' + tail(r.err || r.out, 300));
      say('Cài giọng clone VieNeu (có thể vài phút)…');
      r = await pip(['vieneu'], 1800000);
      engines.clone = r.code === 0;
      if (!engines.clone) problems.push('vieneu: ' + tail(r.err || r.out, 400));
      if (engines.edge) { const t = await runner(venvPython, ['-c', 'import edge_tts'], { timeout: 60000, signal }); engines.edge = t.code === 0; if (!engines.edge) problems.push('import edge_tts: ' + tail(t.err, 300)); }
      if (engines.clone) { const t = await runner(venvPython, ['-c', 'import vieneu'], { timeout: 180000, signal }); engines.clone = t.code === 0; if (!engines.clone) problems.push('import vieneu: ' + tail(t.err, 400)); }
      await fs.writeFile(readyFile, JSON.stringify({ engines, python: py.version, at: new Date().toISOString() }));
      state.ready = engines;
      if (!engines.edge && !engines.clone) throw Error('Cài giọng chưa được. ' + problems.join(' | '));
      say(engines.clone ? 'Đã cài xong giọng miễn phí. Lần nghe/clone đầu sẽ tải mô hình nên lâu hơn.' : 'Đã cài giọng Microsoft; giọng clone chưa cài được (' + problems.join(' | ') + ').');
    } catch (error) {
      state.setupError = error.name === 'AbortError' ? 'Đã dừng cài giọng.' : error.message;
      state.setupMessage = '';
      throw error;
    } finally {
      state.setupBusy = false; setupController = null; notify();
    }
    return status();
  }
  function cancelSetup() { setupController?.abort(); }

  async function listWindowsVoices() {
    if (!win) { state.windowsVoices = []; return []; }
    const file = path.join(dataDir, 'sapi-list.ps1');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(file, SAPI_LIST, 'utf8');
    const r = await runner('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { timeout: 30000 });
    state.windowsVoices = r.out.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const [name, culture, gender] = l.split('|'); return { name, culture: culture || '', gender: gender || '' }; });
    notify();
    return state.windowsVoices;
  }

  async function addClone({ name, source, consent }) {
    if (consent !== true) throw Error('Tick xác nhận đây là giọng của bạn hoặc của người đã đồng ý cho bạn nhân bản.');
    const label = String(name || '').trim().slice(0, 40);
    if (!label) throw Error('Đặt tên cho giọng clone.');
    if (typeof source !== 'string' || !source) throw Error('Chọn file ghi âm mẫu.');
    await fs.access(source);
    await fs.mkdir(voicesDir, { recursive: true });
    let key = slug(label);
    for (let n = 2; state.clones.some(v => v.key === key); n++) key = slug(label) + '-' + n;
    const file = path.join(voicesDir, key + '.wav');
    const ff = getFfmpeg();
    await command(ff, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source, '-vn', '-t', String(CLONE_SECONDS.max), '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', file], 120000);
    try {
      const seconds = await durationOf(file);
      if (seconds < CLONE_SECONDS.min) throw Error(`Mẫu quá ngắn (${seconds.toFixed(1)} giây). Cần ít nhất ${CLONE_SECONDS.min} giây tiếng nói rõ, tốt nhất 6–15 giây, một người nói, không nhạc nền.`);
      const probe = await runner(ff, ['-hide_banner', '-nostdin', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { timeout: 60000 });
      const peak = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(probe.err);
      if (!peak || peak[1] === '-inf' || Number(peak[1]) < -45) throw Error('Mẫu gần như im lặng. Chọn đoạn ghi âm có tiếng nói rõ.');
    } catch (error) { await fs.rm(file, { force: true }); throw error; }
    state.clones.push({ key, name: label, file, createdAt: new Date().toISOString() });
    await fs.writeFile(path.join(voicesDir, 'index.json'), JSON.stringify(state.clones, null, 2));
    notify();
    return { key, name: label };
  }
  async function removeClone(key) {
    const found = state.clones.find(v => v.key === key);
    if (!found) throw Error('Không thấy giọng này.');
    await fs.rm(found.file, { force: true });
    state.clones = state.clones.filter(v => v.key !== key);
    await fs.writeFile(path.join(voicesDir, 'index.json'), JSON.stringify(state.clones, null, 2));
    notify();
  }

  async function slow(file, tempo) {
    if (!tempo || Math.abs(tempo - 1) < 0.01) return file;
    const out = file.replace(/\.[^.]+$/, '') + '-t.wav';
    await command(getFfmpeg(), ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', file, '-filter:a', `atempo=${tempo}`, '-ar', '48000', out], 120000);
    return out;
  }

  // items: [{id, text}] → [{id, file, seconds}]
  async function synth({ engine, voice, items, tempo = 1, dir, signal, onProgress = () => {} }) {
    if (!ENGINES.includes(engine) || engine === 'none') throw Error('Chưa chọn giọng đọc.');
    if (!Array.isArray(items) || !items.length) return [];
    if (!TEMPOS.includes(Number(tempo))) tempo = 1;
    await fs.mkdir(dir, { recursive: true });
    const extension = engine === 'edge' ? '.mp3' : '.wav';
    const jobs = items.map(item => ({ id: String(item.id), text: String(item.text || '').trim(), out: path.join(dir, `${String(item.id).replace(/[^\w-]/g, '')}-${randomUUID().slice(0, 6)}${extension}`) })).filter(j => j.text);
    if (!jobs.length) return [];
    const jobFile = path.join(dir, `job-${randomUUID().slice(0, 6)}.json`);
    let run, ref = '';
    if (engine === 'windows') {
      if (!win) throw Error('Giọng Windows chỉ có trên Windows.');
      await fs.writeFile(jobFile, JSON.stringify({ voice: voice || '', items: jobs }), 'utf8');
      const script = path.join(dataDir, 'sapi-speak.ps1');
      await fs.writeFile(script, SAPI_SCRIPT, 'utf8');
      run = { file: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Job', jobFile] };
    } else {
      if (!state.ready[engine]) throw Error(engine === 'clone' ? 'Chưa cài giọng clone. Bấm «Cài giọng miễn phí» trước.' : 'Chưa cài giọng Microsoft. Bấm «Cài giọng miễn phí» trước.');
      if (engine === 'clone') {
        const found = state.clones.find(v => v.key === voice);
        if (!found) throw Error('Chưa chọn giọng clone. Thêm file giọng mẫu trước.');
        ref = found.file;
      } else if (!EDGE_VOICES.some(v => v.id === voice)) throw Error('Chọn một giọng Microsoft trong danh sách.');
      await fs.writeFile(jobFile, JSON.stringify({ engine, voice, ref, items: jobs }), 'utf8');
      run = { file: venvPython, args: [helperFile, jobFile] };
    }
    const done = new Set();
    let failure = '';
    const result = await runner(run.file, run.args, {
      timeout: 3600000, signal,
      env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HUB_DISABLE_XET: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1', HF_HUB_DISABLE_TELEMETRY: '1', TOKENIZERS_PARALLELISM: 'false' },
      onLine: line => {
        let msg; try { msg = JSON.parse(line); } catch { return; }
        if (msg.error) failure = msg.error;
        else if (msg.event === 'loading') { state.loadedModel = false; onProgress('Đang nạp mô hình giọng (lần đầu phải tải nên lâu, vài phút)…'); }
        else if (msg.event === 'loaded') { state.loadedModel = true; onProgress('Đã nạp mô hình giọng.'); }
        else if (msg.done !== undefined) { done.add(String(msg.done)); onProgress(`Đã đọc ${done.size}/${jobs.length} cảnh`); }
      }
    }).catch(error => { if (error.name === 'AbortError') throw error; throw Error('Không chạy được giọng đọc: ' + error.message); });
    await fs.rm(jobFile, { force: true });
    if (failure) throw Error(failure);
    if (result.code !== 0) throw Error('Giọng đọc thất bại (' + result.code + '): ' + tail(result.err || result.out));
    const out = [];
    for (const job of jobs) {
      if (!done.has(job.id)) throw Error(`Giọng đọc chưa tạo xong cảnh ${job.id}.`);
      const file = await slow(job.out, Number(tempo));
      out.push({ id: job.id, file, seconds: await durationOf(file) });
    }
    return out;
  }

  // Nghe thử: đọc một câu, trả về đường dẫn file để phát.
  async function preview({ engine, voice, text, tempo, signal }) {
    const dir = path.join(dataDir, 'preview');
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Xin chào, đây là giọng kể chuyện của bạn.';
    const [first] = await synth({ engine, voice, items: [{ id: 'nghe', text: clean }], tempo, dir, signal });
    return first.file;
  }

  return { load, status, setup, cancelSetup, findPython, listWindowsVoices, addClone, removeClone, synth, preview, venvPython, helperFile };
}

module.exports = { createVoiceService, exec, parseVersion, inRange, slug, ENGINES, EDGE_VOICES, TEMPOS, CLONE_SECONDS, MISSING_PYTHON };
