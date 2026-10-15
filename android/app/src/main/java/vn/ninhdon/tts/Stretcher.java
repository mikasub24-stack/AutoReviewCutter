package vn.ninhdon.tts;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;

/**
 * Đổi tốc độ giọng đọc mà không đổi cao độ (WSOLA: ghép-cộng các khung chồng nhau, mỗi khung được
 * chọn ở chỗ khớp pha nhất với đoạn "tự nhiên" kế tiếp của khung trước).
 *
 * Chạy theo dòng: đẩy PCM 16-bit mono vào bằng {@link #push}, kết thúc bằng {@link #finish};
 * kết quả trả về dần qua {@link Sink}. Bộ nhớ dùng chỉ cỡ vài giây âm thanh, nên bài dài cả giờ cũng được.
 * Kết quả không phụ thuộc cách chia nhỏ đầu vào. Không dùng Android nên thử được trên máy tính.
 *
 * speed > 1: nhanh hơn (ngắn đi), speed < 1: chậm hơn (dài ra). Giới hạn 0.5 .. 2.0.
 */
public final class Stretcher {
    public static final double MIN_SPEED = 0.5;
    public static final double MAX_SPEED = 2.0;

    public interface Sink {
        void write(short[] pcm, int len) throws IOException;
    }

    private final Sink sink;
    private final double speed;
    private final int hop;          // H: bước tổng hợp (khoảng 16 ms)
    private final int frame;        // N = 2H
    private final int seek;         // S: nửa độ rộng vùng tìm khớp (khoảng 10 ms)
    private final int dec;          // D: hệ số giảm mẫu khi tìm khớp thô
    private final int decRef;       // H / D
    private final float[] win;
    private final float[] acc;      // phần đầu ra đang chồng nhau
    private final short[] outBuf;

    private short[] in = new short[1 << 16];
    private int[] low = new int[(1 << 16) / 6 + 8];   // bản giảm mẫu (trung bình mỗi D mẫu)
    private long inBase = 0;        // chỉ số tuyệt đối của in[0] (bội của D)
    private int inLen = 0;
    private int lowLen = 0;
    private long totalIn = 0;
    private boolean finished = false;

    private long k = 0;             // số khung đã làm
    private long prev = -1;         // vị trí bắt đầu (tuyệt đối) của khung trước
    private long emitted = 0;
    private long outTarget = Long.MAX_VALUE;

    public Stretcher(int sampleRate, double speed, Sink sink) {
        this.sink = sink;
        this.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
        this.dec = Math.max(1, (int) Math.round(sampleRate / 8000.0));
        this.hop = dec * Math.max(8, (int) Math.round(0.016 * sampleRate / dec));
        this.frame = 2 * hop;
        this.seek = dec * Math.max(4, (int) Math.round(0.010 * sampleRate / dec));
        this.decRef = hop / dec;
        this.win = new float[frame];
        for (int i = 0; i < frame; i++) win[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / frame));
        this.acc = new float[frame];
        this.outBuf = new short[hop];
        this.low = new int[in.length / dec + 8];
    }

    /** Dùng khi cả đoạn đã nằm sẵn trong bộ nhớ. */
    public static short[] stretch(short[] pcm, int sampleRate, double speed) {
        if (Math.abs(speed - 1.0) < 0.005) return pcm;
        final ByteArrayOutputStream bo = new ByteArrayOutputStream(pcm.length * 2 + 16);
        try {
            Stretcher s = new Stretcher(sampleRate, speed, (p, n) -> {
                for (int i = 0; i < n; i++) {
                    bo.write(p[i] & 0xff);
                    bo.write((p[i] >> 8) & 0xff);
                }
            });
            s.push(pcm, pcm.length);
            s.finish();
        } catch (IOException e) {
            throw new IllegalStateException(e);   // ByteArrayOutputStream không bao giờ ném lỗi
        }
        byte[] b = bo.toByteArray();
        short[] out = new short[b.length / 2];
        for (int i = 0; i < out.length; i++) out[i] = (short) ((b[2 * i] & 0xff) | (b[2 * i + 1] << 8));
        return out;
    }

    // ------------------------------------------------------------------ đầu vào

    public void push(short[] pcm, int len) throws IOException {
        if (finished) throw new IllegalStateException("đã finish()");
        append(pcm, len);
        totalIn += len;
        pump();
    }

    public void finish() throws IOException {
        if (finished) return;
        finished = true;
        outTarget = Math.round(totalIn / speed);
        append(new short[frame + seek + 4 * dec + hop], frame + seek + 4 * dec + hop);   // đệm số 0 cho khung cuối
        pump();
    }

    private void append(short[] pcm, int len) {
        if (inLen + len > in.length) {
            int cap = Math.max(in.length * 2, inLen + len + 16);
            in = Arrays.copyOf(in, cap);
            low = Arrays.copyOf(low, cap / dec + 8);
        }
        System.arraycopy(pcm, 0, in, inLen, len);
        inLen += len;
        while ((lowLen + 1) * dec <= inLen) {
            int s = 0;
            int base = lowLen * dec;
            for (int i = 0; i < dec; i++) s += in[base + i];
            low[lowLen++] = s / dec;
        }
    }

    // ------------------------------------------------------------------ xử lý

    private void pump() throws IOException {
        while (true) {
            long t = Math.round(k * (double) hop * speed);          // vị trí lý tưởng của khung k trong đầu vào
            if (finished) {
                if (k * (long) hop >= outTarget) return;
            } else {
                long need = (k == 0) ? frame : t + seek + frame + dec;
                if (totalIn < need) return;                          // chưa đủ dữ liệu
            }
            long c = (k == 0) ? 0 : bestStart(t);
            overlapAdd(c);
            prev = c;
            k++;
            compact(Math.round(k * (double) hop * speed));
        }
    }

    /** Vị trí bắt đầu của khung kế tiếp: chỗ trong [t-S, t+S] khớp nhất với đoạn tiếp nối tự nhiên của khung trước. */
    private long bestStart(long t) {
        final long nat = prev + hop;
        long lo = Math.max(0, t - seek);
        long hi = t + seek;
        long cdLo = (lo + dec - 1) / dec;
        long cdHi = hi / dec;
        int ref = (int) (nat / dec - inBase / dec);
        long best = Long.MAX_VALUE;
        long bestCd = cdLo;
        for (long cd = cdLo; cd <= cdHi; cd++) {
            int cand = (int) (cd - inBase / dec);
            long penalty = Math.abs(cd * dec - t) / dec;         // ưu tiên chỗ gần vị trí lý tưởng khi hoà
            long limit = best == Long.MAX_VALUE ? Long.MAX_VALUE : (best - penalty + 15) / 16;
            long amdf = 0;
            for (int i = 0; i < decRef; i++) {
                int d = low[cand + i] - low[ref + i];
                amdf += d < 0 ? -d : d;
                if (amdf >= limit) break;                         // đã không thể tốt hơn
            }
            long sum = amdf * 16 + penalty;
            if (sum < best) {
                best = sum;
                bestCd = cd;
            }
        }
        // tinh chỉnh ở tần số gốc quanh kết quả thô
        long from = Math.max(lo, bestCd * dec - dec);
        long to = Math.min(hi, bestCd * dec + dec);
        long bestC = Math.max(lo, Math.min(hi, bestCd * dec));
        long bestFull = Long.MAX_VALUE;
        int natRel = (int) (nat - inBase);
        for (long c = from; c <= to; c++) {
            int cr = (int) (c - inBase);
            long a = 0;
            for (int i = 0; i < hop; i += 2) {
                int d = in[cr + i] - in[natRel + i];
                a += d < 0 ? -d : d;
            }
            if (a < bestFull) {
                bestFull = a;
                bestC = c;
            }
        }
        return bestC;
    }

    private void overlapAdd(long c) throws IOException {
        int cr = (int) (c - inBase);
        if (k == 0) {
            for (int i = 0; i < hop; i++) acc[i] += in[cr + i];                      // đầu bài: không làm mờ dần
            for (int i = hop; i < frame; i++) acc[i] += win[i] * in[cr + i];
        } else {
            for (int i = 0; i < frame; i++) acc[i] += win[i] * in[cr + i];
        }
        int n = hop;
        if (finished) n = (int) Math.min(n, outTarget - emitted);
        if (n > 0) {
            for (int i = 0; i < n; i++) {
                float v = acc[i];
                int r = Math.round(v);
                outBuf[i] = (short) (r > 32767 ? 32767 : (r < -32768 ? -32768 : r));
            }
            sink.write(outBuf, n);
            emitted += n;
        }
        System.arraycopy(acc, hop, acc, 0, frame - hop);
        Arrays.fill(acc, frame - hop, frame, 0f);
    }

    /** Bỏ phần đầu vào không còn cần đến. */
    private void compact(long nextTarget) {
        long keep = Math.min(prev + hop, nextTarget - seek) - 2L * dec;
        if (keep <= inBase) return;
        long newBase = (keep / dec) * dec;
        int drop = (int) (newBase - inBase);
        if (drop < (1 << 15)) return;                    // gom lại cho đỡ chép nhiều lần
        System.arraycopy(in, drop, in, 0, inLen - drop);
        inLen -= drop;
        int lowDrop = drop / dec;
        System.arraycopy(low, lowDrop, low, 0, lowLen - lowDrop);
        lowLen -= lowDrop;
        inBase = newBase;
    }
}
