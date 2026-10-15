package vn.ninhdon.tts;

import java.io.File;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.io.RandomAccessFile;
import java.util.concurrent.atomic.AtomicBoolean;

/** Đổi tốc độ cả tệp WAV (PCM 16-bit mono, đúng định dạng WavWriter ghi ra) theo dòng, giữ nguyên cao độ. */
public final class WavSpeed {
    private WavSpeed() {}

    public interface Progress {
        void onProgress(double fraction);
    }

    /** Thông tin tệp WAV. */
    public static final class Info {
        public final int sampleRate;
        public final long dataOffset;
        public final long dataBytes;

        Info(int sampleRate, long dataOffset, long dataBytes) {
            this.sampleRate = sampleRate;
            this.dataOffset = dataOffset;
            this.dataBytes = dataBytes;
        }

        public double seconds() { return dataBytes / 2.0 / sampleRate; }
    }

    public static Info info(File f) throws IOException {
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            return info(raf);
        }
    }

    private static Info info(RandomAccessFile raf) throws IOException {
        long len = raf.length();
        byte[] h = new byte[12];
        raf.seek(0);
        if (len < 12 || raf.read(h) != 12 || !tag(h, 0, "RIFF") || !tag(h, 8, "WAVE")) {
            throw new IOException("Không phải tệp WAV");
        }
        int rate = 0;
        boolean fmtOk = false;
        long pos = 12;
        byte[] c = new byte[8];
        while (pos + 8 <= len) {
            raf.seek(pos);
            if (raf.read(c) != 8) break;
            long size = le32(c, 4);
            long body = pos + 8;
            if (tag(c, 0, "fmt ")) {
                byte[] f = new byte[16];
                raf.seek(body);
                if (raf.read(f) != 16) throw new IOException("Phần fmt bị cắt");
                int format = le16(f, 0);
                int ch = le16(f, 2);
                rate = (int) le32(f, 4);
                int bits = le16(f, 14);
                if (format != 1 || ch != 1 || bits != 16) {
                    throw new IOException("Chỉ hỗ trợ WAV PCM 16-bit mono (tệp này: định dạng " + format + ", " + ch + " kênh, " + bits + " bit)");
                }
                fmtOk = true;
            } else if (tag(c, 0, "data")) {
                if (!fmtOk) throw new IOException("Thiếu phần fmt trước data");
                long avail = len - body;
                long n = (size > avail || size == 0) ? avail : size;
                return new Info(rate, body, n - (n % 2));
            }
            pos = body + size + (size & 1);
        }
        throw new IOException("Không thấy dữ liệu âm thanh trong WAV");
    }

    /**
     * Ghi bản đổi tốc độ của {@code src} ra {@code dst}.
     * @throws InterruptedIOException nếu bị huỷ (tệp dst dở dang sẽ bị xoá)
     */
    public static void convert(File src, File dst, double speed, Progress progress, AtomicBoolean cancel) throws IOException {
        boolean ok = false;
        try (RandomAccessFile raf = new RandomAccessFile(src, "r")) {
            Info inf = info(raf);
            final WavWriter w = new WavWriter(dst, inf.sampleRate);
            try {
                Stretcher st = new Stretcher(inf.sampleRate, speed, w::write);
                raf.seek(inf.dataOffset);
                byte[] buf = new byte[1 << 16];
                short[] pcm = new short[buf.length / 2];
                long left = inf.dataBytes;
                long done = 0;
                while (left > 0) {
                    if (cancel != null && cancel.get()) throw new InterruptedIOException("đã huỷ");
                    int n = raf.read(buf, 0, (int) Math.min(buf.length, left));
                    if (n <= 0) break;
                    n -= n % 2;
                    for (int i = 0; i < n / 2; i++) pcm[i] = (short) ((buf[2 * i] & 0xff) | (buf[2 * i + 1] << 8));
                    st.push(pcm, n / 2);
                    left -= n;
                    done += n;
                    if (progress != null) progress.onProgress(inf.dataBytes > 0 ? (double) done / inf.dataBytes : 1.0);
                }
                st.finish();
            } finally {
                w.close();
            }
            ok = true;
        } finally {
            if (!ok) {
                //noinspection ResultOfMethodCallIgnored
                dst.delete();
            }
        }
        if (progress != null) progress.onProgress(1.0);
    }

    private static boolean tag(byte[] b, int off, String s) {
        for (int i = 0; i < 4; i++) if (b[off + i] != (byte) s.charAt(i)) return false;
        return true;
    }

    private static int le16(byte[] b, int off) {
        return (b[off] & 0xff) | ((b[off + 1] & 0xff) << 8);
    }

    private static long le32(byte[] b, int off) {
        return (b[off] & 0xffL) | ((b[off + 1] & 0xffL) << 8) | ((b[off + 2] & 0xffL) << 16) | ((b[off + 3] & 0xffL) << 24);
    }
}
