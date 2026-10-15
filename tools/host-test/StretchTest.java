import vn.ninhdon.tts.Stretcher;
import vn.ninhdon.tts.WavSpeed;
import vn.ninhdon.tts.WavWriter;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.util.Arrays;
import java.util.Random;
import java.util.concurrent.atomic.AtomicBoolean;

/** Thử bộ đổi tốc độ (không cần Android): java -cp ... StretchTest [thư_mục_tạm] */
public class StretchTest {
    static int fails = 0, checks = 0;

    static void check(boolean ok, String msg) {
        checks++;
        if (!ok) fails++;
        System.out.println((ok ? "  [ok]   " : "  [HỎNG] ") + msg);
    }

    /** Tiếng "giống nói": hài của f0 thay đổi chậm, biên độ nhấp nhô, xen đoạn lặng. */
    static short[] voiceLike(int sr, double seconds, long seed) {
        Random rnd = new Random(seed);
        int n = (int) (seconds * sr);
        short[] x = new short[n];
        double phase = 0;
        for (int i = 0; i < n; i++) {
            double t = (double) i / sr;
            double f0 = 130 + 40 * Math.sin(2 * Math.PI * 0.7 * t);
            phase += 2 * Math.PI * f0 / sr;
            double env = Math.max(0, Math.sin(2 * Math.PI * 1.3 * t));     // âm tiết
            double v = 0;
            for (int h = 1; h <= 12; h++) v += Math.sin(h * phase) / h;
            v = v * env * 9000 + (rnd.nextDouble() - 0.5) * 300;
            x[i] = (short) Math.max(-32768, Math.min(32767, v));
        }
        return x;
    }

    static short[] run(short[] in, int sr, double speed, int[] chunkSizes, long seed) throws IOException {
        final ByteArrayOutputStream bo = new ByteArrayOutputStream();
        Stretcher s = new Stretcher(sr, speed, (p, n) -> {
            for (int i = 0; i < n; i++) {
                bo.write(p[i] & 0xff);
                bo.write((p[i] >> 8) & 0xff);
            }
        });
        Random rnd = new Random(seed);
        int pos = 0;
        while (pos < in.length) {
            int n = chunkSizes == null ? in.length : chunkSizes[rnd.nextInt(chunkSizes.length)];
            n = Math.min(n, in.length - pos);
            s.push(Arrays.copyOfRange(in, pos, pos + n), n);
            pos += n;
        }
        s.finish();
        byte[] b = bo.toByteArray();
        short[] out = new short[b.length / 2];
        for (int i = 0; i < out.length; i++) out[i] = (short) ((b[2 * i] & 0xff) | (b[2 * i + 1] << 8));
        return out;
    }

    /** Tần số cơ bản trung vị (tự tương quan, khung 40 ms), chỉ tính khung đủ to. */
    static double medianF0(short[] x, int sr) {
        int win = (int) (0.04 * sr), hop = win / 2;
        int lagMin = sr / 400, lagMax = sr / 70;
        double maxAbs = 1;
        for (short v : x) maxAbs = Math.max(maxAbs, Math.abs(v));
        double[] f = new double[x.length / hop];
        int cnt = 0;
        for (int s = 0; s + win + lagMax < x.length; s += hop) {
            double e = 0;
            for (int i = 0; i < win; i++) e += (double) x[s + i] * x[s + i];
            if (Math.sqrt(e / win) < 0.08 * maxAbs) continue;
            double best = -1;
            int bestLag = 0;
            for (int lag = lagMin; lag <= lagMax; lag++) {
                double c = 0, e2 = 0;
                for (int i = 0; i < win; i++) {
                    c += (double) x[s + i] * x[s + i + lag];
                    e2 += (double) x[s + i + lag] * x[s + i + lag];
                }
                double nc = c / Math.sqrt(e * e2 + 1);
                if (nc > best) { best = nc; bestLag = lag; }
            }
            if (best > 0.6) f[cnt++] = (double) sr / bestLag;
        }
        if (cnt == 0) return 0;
        double[] g = Arrays.copyOf(f, cnt);
        Arrays.sort(g);
        return g[cnt / 2];
    }

    static double rms(short[] x) {
        double e = 0;
        for (short v : x) e += (double) v * v;
        return Math.sqrt(e / Math.max(1, x.length));
    }

    static int maxStep(short[] x) {
        int m = 0;
        for (int i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
        return m;
    }

    public static void main(String[] args) throws Exception {
        File tmp = new File(args.length > 0 ? args[0] : System.getProperty("java.io.tmpdir"), "stretch_test_" + System.nanoTime());
        tmp.mkdirs();
        double[] speeds = {0.5, 0.7, 0.85, 1.15, 1.3, 1.5, 2.0};

        for (int sr : new int[]{24000, 48000}) {
            System.out.println("\n== Tiếng giống nói 20 giây, " + sr + " Hz");
            short[] x = voiceLike(sr, 20, 7);
            double f0 = medianF0(x, sr), r0 = rms(x);
            int step0 = maxStep(x);
            System.out.printf("  gốc: f0=%.1f Hz, rms=%.0f, bước nhảy lớn nhất=%d%n", f0, r0, step0);
            for (double sp : speeds) {
                long t0 = System.nanoTime();
                short[] y = run(x, sr, sp, null, 1);
                double ms = (System.nanoTime() - t0) / 1e6;
                double lenRatio = (double) y.length / (x.length / sp);
                double f1 = medianF0(y, sr);
                check(Math.abs(lenRatio - 1) < 0.002, String.format("%.2f×: độ dài đúng (tỉ lệ %.4f), %.0f ms xử lý", sp, lenRatio, ms));
                check(Math.abs(f1 / f0 - 1) < 0.03, String.format("%.2f×: cao độ giữ nguyên (%.1f → %.1f Hz)", sp, f0, f1));
                check(Math.abs(rms(y) / r0 - 1) < 0.12, String.format("%.2f×: âm lượng giữ nguyên (rms %.0f → %.0f)", sp, r0, rms(y)));
                check(maxStep(y) < step0 * 1.5 + 200, String.format("%.2f×: không có tiếng lụp bụp (bước nhảy lớn nhất %d, gốc %d)", sp, maxStep(y), step0));
            }
            // kết quả không phụ thuộc cách chia đầu vào
            short[] a = run(x, sr, 1.3, null, 1);
            short[] b = run(x, sr, 1.3, new int[]{1, 7, 300, 4096, 65536, 100000}, 5);
            check(Arrays.equals(a, b), "đẩy từng mảnh lẻ cho kết quả y hệt đẩy một lần");
            short[] c = run(x, sr, 0.8, null, 1);
            short[] d = run(x, sr, 0.8, new int[]{513, 1000, 31, 70000}, 9);
            check(Arrays.equals(c, d), "như trên với tốc độ 0.8");
        }

        System.out.println("\n== Trường hợp biên");
        for (int len : new int[]{0, 1, 100, 700, 1500, 5000}) {
            short[] x = voiceLike(24000, 1, 3);
            x = Arrays.copyOf(x, len);
            short[] y = run(x, 24000, 1.5, null, 1);
            check(Math.abs(y.length - Math.round(len / 1.5)) <= 1, "đầu vào " + len + " mẫu → " + y.length + " mẫu (mong " + Math.round(len / 1.5) + ")");
        }
        short[] zero = new short[48000];
        short[] yz = run(zero, 24000, 1.7, null, 1);
        boolean allZero = true;
        for (short v : yz) if (v != 0) allZero = false;
        check(allZero && Math.abs(yz.length - 48000 / 1.7) <= 1, "im lặng vẫn im lặng");
        short[] loud = new short[24000 * 3];
        for (int i = 0; i < loud.length; i++) loud[i] = (short) (i % 100 < 50 ? 32767 : -32768);
        short[] yl = run(loud, 24000, 0.6, null, 1);
        check(yl.length > 0 && maxStep(yl) <= 65535, "biên độ tối đa không tràn số");
        short[] same = Stretcher.stretch(voiceLike(24000, 1, 3), 24000, 1.0);
        check(same.length == 24000, "tốc độ 1.0 trả nguyên bản");
        short[] clamp = run(voiceLike(24000, 2, 3), 24000, 9.0, null, 1);
        check(Math.abs(clamp.length - 24000) <= 2, "tốc độ quá lớn bị kẹp ở 2.0×");

        System.out.println("\n== Tệp WAV (qua WavWriter / WavSpeed)");
        File in = new File(tmp, "in.wav");
        short[] voice = voiceLike(48000, 30, 11);
        try (WavWriter w = new WavWriter(in, 48000)) {
            w.write(voice);
        }
        File out = new File(tmp, "out.wav");
        final double[] last = {0};
        long t0 = System.nanoTime();
        WavSpeed.convert(in, out, 1.25, fr -> last[0] = fr, new AtomicBoolean(false));
        double ms = (System.nanoTime() - t0) / 1e6;
        WavSpeed.Info oi = WavSpeed.info(out);
        check(oi.sampleRate == 48000 && Math.abs(oi.seconds() - 30 / 1.25) < 0.01, String.format("WAV 30 giây → %.3f giây (%.0f ms), tần số mẫu giữ %d", oi.seconds(), ms, oi.sampleRate));
        check(last[0] == 1.0, "báo tiến độ tới 100%");
        File cancelled = new File(tmp, "cancel.wav");
        boolean threw = false;
        try {
            WavSpeed.convert(in, cancelled, 1.25, null, new AtomicBoolean(true));
        } catch (InterruptedIOException e) {
            threw = true;
        }
        check(threw && !cancelled.exists(), "huỷ giữa chừng: ném lỗi và xoá tệp dở");
        File bad = new File(tmp, "bad.wav");
        java.nio.file.Files.write(bad.toPath(), "không phải wav".getBytes("UTF-8"));
        threw = false;
        try {
            WavSpeed.convert(bad, new File(tmp, "bad_out.wav"), 1.25, null, null);
        } catch (IOException e) {
            threw = true;
        }
        check(threw && !new File(tmp, "bad_out.wav").exists(), "tệp không phải WAV: báo lỗi, không để lại tệp");

        System.out.println("\n== Bài dài: 60 phút ở 48 kHz đi qua bộ đổi tốc độ theo dòng");
        final long[] outSamples = {0};
        Stretcher st = new Stretcher(48000, 1.4, (p, n) -> outSamples[0] += n);
        short[] block = voiceLike(48000, 10, 21);
        Runtime rt = Runtime.getRuntime();
        long mem0 = rt.totalMemory() - rt.freeMemory();
        t0 = System.nanoTime();
        for (int i = 0; i < 360; i++) st.push(block, block.length);
        st.finish();
        ms = (System.nanoTime() - t0) / 1e6;
        long mem1 = rt.totalMemory() - rt.freeMemory();
        double expect = 360.0 * block.length / 1.4;
        check(Math.abs(outSamples[0] - expect) <= 1, String.format("đủ độ dài (%d mẫu), mất %.1f giây (%.0f× thời gian thực)", outSamples[0], ms / 1000, 3600 / (ms / 1000)));
        check(mem1 - mem0 < 64L << 20, String.format("bộ nhớ tăng %.1f MB (không giữ cả bài)", (mem1 - mem0) / 1048576.0));

        System.out.println("\n" + (checks - fails) + "/" + checks + " kiểm tra đạt");
        System.exit(fails == 0 ? 0 : 1);
    }
}
