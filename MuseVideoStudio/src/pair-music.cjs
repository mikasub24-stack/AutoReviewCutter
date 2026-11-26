// Tab «So sánh song song»: nhạc nền MIỄN BẢN QUYỀN, TỰ TỔNG HỢP bằng mã (không dùng bài hát hay file nhạc nào).
//   Ba phong cách (ấm áp, trầm lắng, lo-fi nhẹ), mỗi bản dài 16 ô nhịp và lặp liền mạch (đuôi âm và vang được cuộn về đầu bản),
//   nên ghép vào video bất kỳ độ dài nào cũng không bị giật. Mặc định video tự dùng một bản (chọn theo mã video), người dùng không phải chọn gì.
const fs = require('node:fs/promises');
const path = require('node:path');

const RATE = 32000;
const KINDS = ['warm', 'calm', 'lofi'];
const TAU = Math.PI * 2;
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

// Hợp âm: bass (MIDI) + các nốt giữa (MIDI).
const CHORDS = {
  C: { bass: 36, tones: [60, 64, 67, 71] }, Am: { bass: 33, tones: [57, 60, 64, 67] }, F: { bass: 41, tones: [57, 60, 65, 69] },
  G: { bass: 43, tones: [59, 62, 67, 69] }, Em: { bass: 40, tones: [59, 62, 64, 67] }, Dm: { bass: 38, tones: [57, 62, 65, 69] },
  Cmaj7: { bass: 36, tones: [60, 64, 67, 71] }, Am7: { bass: 33, tones: [60, 64, 67, 69] }, Dm7: { bass: 38, tones: [60, 62, 65, 69] },
  Em7: { bass: 40, tones: [59, 62, 64, 67] }, Fmaj7: { bass: 41, tones: [60, 64, 65, 69] }, G7: { bass: 43, tones: [59, 62, 65, 67] }
};
const STYLES = {
  warm: { bpm: 76, bars: 'C Am F G C Am F G Am F C G Am F G C', seed: 11 },
  calm: { bpm: 58, bars: 'Am F C G Am F C G Dm Am F C Dm Em F G', seed: 23 },
  lofi: { bpm: 82, bars: 'Cmaj7 Am7 Dm7 G7 Cmaj7 Am7 Fmaj7 G7 Em7 Am7 Dm7 G7 Fmaj7 Em7 Dm7 Cmaj7', seed: 37 }
};

function pickKind(seed) {
  let h = 2166136261;
  for (const ch of String(seed || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return KINDS[h % KINDS.length];
}

function render(kind, { rate = RATE } = {}) {
  const style = STYLES[kind];
  if (!style) throw Error('Phong cách nhạc nền không có: ' + kind);
  const beat = 60 / style.bpm, bars = style.bars.split(' '), total = bars.length * 4 * beat;
  const n = Math.round(total * rate), L = new Float32Array(n), R = new Float32Array(n);
  let seed = style.seed * 7919;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const exp = Math.exp, sin = Math.sin;
  // Một nốt: fn(t giây) → mẫu mono; đuôi âm cuộn quanh đầu bản để vòng lặp liền mạch.
  const note = (t0, dur, gain, pan, fn) => {
    const i0 = Math.round(t0 * rate), len = Math.round(dur * rate), a = (pan + 1) * Math.PI / 4, gl = gain * Math.cos(a) * 1.414, gr = gain * Math.sin(a) * 1.414;
    for (let k = 0; k < len; k++) {
      const s = fn(k / rate), i = (i0 + k) % n;
      L[i] += s * gl; R[i] += s * gr;
    }
  };
  const ramp = (t, attack, dur, release) => Math.min(1, t / attack) * Math.min(1, Math.max(0, (dur - t) / release));
  const pad = (t0, midi, dur, gain, pan, attack, release) => {
    const f = hz(midi);
    note(t0, dur, gain, pan, t => ramp(t, attack, dur, release) * (sin(TAU * f * 1.0012 * t) + sin(TAU * f * 0.9988 * t) + .3 * sin(TAU * f * 2 * t)) * .5);
  };
  const pluck = (t0, midi, gain, pan, decay = 2.6) => {
    const f = hz(midi);
    note(t0, decay * 1.6, gain, pan, t => Math.min(1, t / .004) * exp(-t * decay) * (sin(TAU * f * t) + .35 * sin(TAU * 2 * f * t) * exp(-t * 3) + .12 * sin(TAU * 3 * f * t) * exp(-t * 5)));
  };
  const bell = (t0, midi, gain, pan, decay = 1.6) => {
    const f = hz(midi);
    note(t0, decay * 2.4, gain, pan, t => Math.min(1, t / .006) * exp(-t * decay) * sin(TAU * f * t + 1.4 * exp(-t * 5) * sin(TAU * f * 2 * t)));
  };
  const bass = (t0, midi, dur, gain, tri = false) => {
    const f = hz(midi);
    note(t0, dur, gain, 0, t => ramp(t, .02, dur, .35) * exp(-t * .9) * (tri ? (2 / Math.PI) * Math.asin(sin(TAU * f * t)) : sin(TAU * f * t) + .25 * sin(TAU * 2 * f * t)));
  };
  const noiseState = { low: 0, band: 0 };
  const noiseBurst = (t0, dur, gain, lo, hi, pan = 0) => {
    const f = 2 * sin(Math.PI * Math.min((lo + hi) / 2, rate * .2) / rate), q = (hi - lo) / ((lo + hi) / 2);
    note(t0, dur, gain, pan, t => {
      const x = rnd() * 2 - 1, high = x - noiseState.low - q * noiseState.band;
      noiseState.band += f * high; noiseState.low += f * noiseState.band;
      return noiseState.band * exp(-t * (6 / dur));
    });
  };
  const kick = (t0, gain) => note(t0, .35, gain, 0, t => sin(TAU * (48 + 90 * exp(-t * 22)) * t) * exp(-t * 11));

  bars.forEach((name, b) => {
    const chord = CHORDS[name], t0 = b * 4 * beat, tones = chord.tones;
    if (kind === 'warm') {
      tones.forEach((m, i) => pad(t0, m, 4 * beat + .9, .04, (i - 1.5) * .4, .6, 1.1));
      for (let k = 0; k < 8; k++) {
        if (rnd() < .14) continue;
        const idx = [0, 1, 2, 3, 2, 1, 2, 3][k], m = tones[idx] + (k === 7 && rnd() < .5 ? 12 : 0);
        pluck(t0 + k * beat / 2, m, .12, ((k % 4) - 1.5) * .35);
      }
      bass(t0, chord.bass, 1.9 * beat, .085); bass(t0 + 2 * beat, chord.bass + (rnd() < .5 ? 7 : 0), 1.9 * beat, .07);
      if (b % 2 === 1) bell(t0 + (2 + Math.floor(rnd() * 2)) * beat, tones[Math.floor(rnd() * 4)] + 12, .05, rnd() * 1.4 - .7);
    } else if (kind === 'calm') {
      tones.forEach((m, i) => pad(t0, m, 4 * beat + 1.6, .05, (i - 1.5) * .5, 1.3, 1.8));
      bass(t0, chord.bass, 4 * beat, .07);
      bell(t0 + .02, tones[Math.floor(rnd() * 4)] + 12, .06, rnd() * 1.2 - .6, 1.1);
      if (rnd() < .6) bell(t0 + 2 * beat, tones[Math.floor(rnd() * 4)] + 12, .045, rnd() * 1.2 - .6, 1.3);
      if (rnd() < .3) bell(t0 + 3 * beat, tones[Math.floor(rnd() * 4)] + 24, .025, rnd() * 1.4 - .7, 1.8);
    } else {
      const swing = beat / 2 * 1.22;
      const stab = (t, dur, g) => tones.forEach((m, i) => bell(t, m, g, (i - 1.5) * .35, 2.2));
      stab(t0, 1.6 * beat, .05); stab(t0 + beat + swing, 1.2 * beat, .04);
      if (rnd() < .6) stab(t0 + 3 * beat + swing, beat, .022);
      bass(t0, chord.bass, 1.7 * beat, .1, true); bass(t0 + 2 * beat + swing, chord.bass + (rnd() < .5 ? 7 : 0), 1.4 * beat, .075, true);
      kick(t0, .3); kick(t0 + 2 * beat, .24);
      noiseBurst(t0 + beat, .12, .12, 900, 2600); noiseBurst(t0 + 3 * beat, .12, .12, 900, 2600);
      for (let k = 0; k < 8; k++) noiseBurst(t0 + Math.floor(k / 2) * beat + (k % 2 ? swing : 0), .05, .05 + (k % 2 ? 0 : .025), 5200, 9000, (k % 2 ? .3 : -.3));
      if (rnd() < .5) bell(t0 + (1 + Math.floor(rnd() * 3)) * beat + swing, tones[Math.floor(rnd() * 4)] + 12, .04, rnd() - .5, 1.8);
    }
  });

  // Vang (Schroeder) chạy trên 3 bản nối nhau, lấy bản giữa: đuôi vang của cuối bản chảy liền vào đầu bản.
  const delays = [1117, 1188, 1277, 1356, 1422, 1491].map(d => Math.round(d * rate / 44100));
  const reverb = (src, offset) => {
    const m = src.length * 3, dry = new Float32Array(m), wet = new Float32Array(m);
    for (let r = 0; r < 3; r++) dry.set(src, r * src.length);
    delays.slice(offset, offset + 4).forEach(d => {
      const buf = new Float32Array(d); let damp = 0, p = 0;
      for (let i = 0; i < m; i++) { const y = buf[p]; damp = y * .55 + damp * .45; buf[p] = dry[i] + damp * .8; wet[i] += y * .25; p = (p + 1) % d; }
    });
    for (const d of [Math.round(225 * rate / 44100), Math.round(556 * rate / 44100)]) {
      const buf = new Float32Array(d); let p = 0;
      for (let i = 0; i < m; i++) { const x = wet[i], y = buf[p]; buf[p] = x + y * .5; wet[i] = y - x * .5; p = (p + 1) % d; }
    }
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = src[i] * .8 + wet[src.length + i] * .75;
    return out;
  };
  const outL = reverb(L, 0), outR = reverb(R, 2);
  // Làm ấm (cắt bớt tần số cao), bỏ thành phần một chiều, rồi đưa về mức nghe vừa phải; khuất bằng tanh nên không bao giờ rè.
  const warm = a => { let lp = 0, dc = 0, prev = 0; const k = 1 - exp(-TAU * 5200 / rate); for (let i = 0; i < a.length * 2; i++) { const j = i % a.length, x = a[j]; lp += k * (x - lp); dc = lp - prev + .995 * dc; prev = lp; if (i >= a.length) a[j] = dc; } };
  warm(outL); warm(outR);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += outL[i] * outL[i] + outR[i] * outR[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1, scale = .12 / rms;
  const wav = Buffer.alloc(44 + n * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    wav.writeInt16LE(Math.round(Math.tanh(outL[i] * scale * .9) / .9 * 32767 * .9), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.tanh(outR[i] * scale * .9) / .9 * 32767 * .9), 46 + i * 4);
  }
  return { wav, seconds: n / rate, kind };
}

// Ghi bản nhạc vào thư mục của video (một lần; lần sau dùng lại). Trả về đường dẫn file WAV.
async function ensureTrack(dir, kind) {
  if (!KINDS.includes(kind)) throw Error('Phong cách nhạc nền không có: ' + kind);
  const file = path.join(dir, `nhac-nen-tu-dong-${kind}.wav`);
  const have = await fs.stat(file).then(s => s.isFile() && s.size > 1e5, () => false);
  if (!have) {
    await fs.mkdir(dir, { recursive: true });
    const temp = file + '.tmp';
    await fs.writeFile(temp, render(kind).wav);
    await fs.rename(temp, file);
  }
  return file;
}

module.exports = { KINDS, STYLES, RATE, pickKind, render, ensureTrack };
