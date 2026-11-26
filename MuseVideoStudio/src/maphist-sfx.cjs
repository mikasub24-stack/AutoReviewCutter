// Tab «Bản đồ lịch sử»: hiệu ứng âm thanh kiểu hoạt hình, TỰ TỔNG HỢP bằng mã (không dùng file âm thanh có bản quyền).
//   Nhận danh sách tín hiệu từ Plan.cuesOf (whoosh khi máy quay bay, tick khi số năm lăn, swell khi lãnh thổ mọc, pop khi mắt mở/ký hiệu hiện,
//   boom cho trận đánh, ding cho thủ đô, splash cho tàu, coin ở huy hiệu mới, tada ở màn kết) và trả về một file WAV 16-bit stereo dài bằng cả video.
const RATE = 32000;

function createVoice(rate) {
  let seed = 987654321;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
  const TAU = Math.PI * 2, exp = Math.exp, sin = Math.sin;
  const bandNoise = (u, lo, hi, q = .35, state = { low: 0, band: 0 }) => {
    const fc = lo + (hi - lo) * u, f = 2 * sin(Math.PI * Math.min(fc, rate * .2) / rate), x = rnd();
    const high = x - state.low - q * state.band; state.band += f * high; state.low += f * state.band; return state.band;
  };
  // Mỗi âm: fn(t giây, u 0..1, state) → mẫu mono; dur giây; pan -1..1 (số hoặc hàm của u); gain.
  return {
    whoosh: () => { const st = { low: 0, band: 0 }; return { dur: .95, gain: .24, pan: u => -.6 + 1.2 * u, fn: (t, u) => bandNoise(Math.pow(u, 1.4), 260, 3200, .35, st) * Math.pow(sin(Math.PI * u), 1.6) * 3.2 }; },
    tick: () => ({ dur: .02, gain: .39, pan: 0, fn: t => sin(TAU * 2600 * t) * exp(-t * 650) }),
    swell: () => { const st = { low: 0, band: 0 }; return { dur: .9, gain: .28, pan: 0, fn: (t, u) => bandNoise(u, 500, 1900, .7, st) * Math.pow(u, 2) * (1 - Math.pow(u, 6)) * 3 }; },
    pop: () => ({ dur: .22, gain: .97, pan: 0, fn: t => sin(TAU * 480 * (exp(t * 17) - 1) / 17) * exp(-t * 30) }),
    ding: () => ({ dur: 1.2, gain: .62, pan: 0, fn: t => (sin(TAU * 1318.5 * t) * exp(-t * 4.5) + .45 * sin(TAU * 1975.5 * t) * exp(-t * 6.5) + .2 * sin(TAU * 2637 * t) * exp(-t * 9)) }),
    coin: () => ({ dur: 1, gain: .8, pan: 0, fn: t => (t < .08 ? sin(TAU * 987.8 * t) * exp(-t * 14) : sin(TAU * 1318.5 * (t - .08)) * exp(-(t - .08) * 5) + .35 * sin(TAU * 2637 * (t - .08)) * exp(-(t - .08) * 8)) }),
    boom: () => { const st = { low: 0, band: 0 }; return { dur: 1.5, gain: 1.5, pan: 0, fn: t => sin(TAU * (46 + 120 * exp(-t * 7) * 1) * t) * exp(-t * 3) * .9 + bandNoise(.05 + .1 * exp(-t * 6), 80, 900, .9, st) * exp(-t * 7) * 1.8 }; },
    splash: () => { const st = { low: 0, band: 0 }; return { dur: .6, gain: .14, pan: 0, fn: t => bandNoise(.6, 1800, 6500, .5, st) * exp(-t * 9) * 3 + (t > .1 ? sin(TAU * 640 * (exp((t - .1) * 15) - 1) / 15) * exp(-(t - .1) * 26) * .45 : 0) }; },
    bam: () => { const st = { low: 0, band: 0 }; return { dur: .4, gain: .6, pan: 0, fn: t => sin(TAU * (180 + 520 * exp(-t * 22)) * t) * exp(-t * 11) + bandNoise(.4, 400, 3000, .6, st) * exp(-t * 28) * 1.5 }; },
    // Hiệu ứng theo cảnh của tab «So sánh song song»: gõ cửa, chuông báo điện thoại, chuông ngân (vui), bước chân, gõ phím.
    knock: () => ({ dur: .5, gain: .7, pan: 0, fn: t => { const hit = (x, f) => x < 0 ? 0 : (sin(TAU * f * x) * .8 + sin(TAU * f * 2.1 * x) * .25) * exp(-x * 38) * Math.min(1, x / .002); return hit(t, 170) + hit(t - .17, 160) + .6 * hit(t - .36, 150); } }),
    notify: () => ({ dur: .8, gain: .5, pan: 0, fn: t => { const tone = (x, f) => x < 0 ? 0 : sin(TAU * f * x) * exp(-x * 7) * Math.min(1, x / .004); return tone(t, 880) + .85 * tone(t - .13, 1318.5) + .15 * tone(t, 1760); } }),
    chime: () => ({ dur: 1.6, gain: .55, pan: 0, fn: t => { let v = 0; [[523.25, 0], [659.25, .11], [783.99, .22], [1046.5, .33]].forEach(([f, at]) => { const x = t - at; if (x < 0) return; v += (sin(TAU * f * x) + .3 * sin(TAU * 2 * f * x)) * exp(-x * 3.2) * Math.min(1, x / .004); }); return v * .45; } }),
    steps: () => { const st = { low: 0, band: 0 }; return { dur: 1.5, gain: .6, pan: 0, fn: t => { let v = 0; for (let i = 0; i < 4; i++) { const x = t - i * .36; if (x >= 0) v += (bandNoise(.06, 90, 420, .6, st) * 2.2 + sin(TAU * 78 * x) * .6) * exp(-x * 26) * Math.min(1, x / .003) * (i % 2 ? .8 : 1); } return v; } }; },
    typing: () => ({ dur: 1.3, gain: .45, pan: 0, fn: t => { let v = 0; [0, .13, .21, .38, .47, .55, .74, .83, .98, 1.07].forEach((at, i) => { const x = t - at; if (x >= 0) v += sin(TAU * (1900 + (i % 3) * 260) * x) * exp(-x * 380); }); return v; } }),
    tada: () => ({ dur: 1.9, gain: .87, pan: 0, fn: t => {
      let v = 0;
      [[523.25, 0], [659.25, .1], [783.99, .2], [1046.5, .3]].forEach(([f, at], i) => { const x = t - at; if (x < 0) return; const e = exp(-x * (i === 3 ? 1.6 : 4.5)); v += (sin(TAU * f * x) + .5 * sin(TAU * f * 2 * x) + .2 * sin(TAU * f * 3 * x)) * e * .45; });
      return v;
    } })
  };
}

// cues: [{ t, kind, gain? }]; total: giây. Trả về Buffer WAV.
function synth(cues, total, { rate = RATE } = {}) {
  const n = Math.max(1, Math.ceil(total * rate)), L = new Float32Array(n), R = new Float32Array(n), voices = createVoice(rate);
  const kinds = { sticker: 'bam' };
  for (const cue of cues || []) {
    const make = voices[kinds[cue.kind] || cue.kind];
    if (!make || !(cue.t >= 0)) continue;
    const v = make(), i0 = Math.floor(cue.t * rate), len = Math.floor(v.dur * rate), gain = v.gain * (cue.gain == null ? 1 : cue.gain);
    for (let i = 0; i < len && i0 + i < n; i++) {
      const u = i / len, s = v.fn(i / rate, u) * gain, p = cue.pan != null ? cue.pan : typeof v.pan === 'function' ? v.pan(u) : v.pan, a = (p + 1) * Math.PI / 4;
      L[i0 + i] += s * Math.cos(a) * 1.414; R[i0 + i] += s * Math.sin(a) * 1.414;
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) { const m = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (m > peak) peak = m; }
  const scale = peak > .85 ? .85 / peak : 1, out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i] * scale)), r = Math.max(-1, Math.min(1, R[i] * scale));
    out.writeInt16LE(Math.round(l * 32767), 44 + i * 4); out.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  return out;
}

module.exports = { synth, RATE };
