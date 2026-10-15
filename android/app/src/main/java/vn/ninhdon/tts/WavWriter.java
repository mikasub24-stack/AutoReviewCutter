package vn.ninhdon.tts;

import java.io.Closeable;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;

/** Ghi WAV PCM 16-bit mono theo dòng (không giữ cả bài trong RAM); sửa phần đầu tệp khi đóng. */
public final class WavWriter implements Closeable {
    private final RandomAccessFile raf;
    private final int sampleRate;
    private long dataBytes = 0;
    private boolean closed = false;
    private final byte[] buf = new byte[1 << 16];

    public WavWriter(File file, int sampleRate) throws IOException {
        this.sampleRate = sampleRate;
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IOException("Khong tao duoc thu muc: " + parent);
        }
        this.raf = new RandomAccessFile(file, "rw");
        raf.setLength(0);
        raf.write(header(0));
    }

    public int sampleRate() { return sampleRate; }

    public double seconds() { return dataBytes / 2.0 / sampleRate; }

    public long frames() { return dataBytes / 2; }

    public void write(short[] pcm, int len) throws IOException {
        int i = 0;
        while (i < len) {
            int n = Math.min(len - i, buf.length / 2);
            for (int k = 0; k < n; k++) {
                short s = pcm[i + k];
                buf[2 * k] = (byte) (s & 0xff);
                buf[2 * k + 1] = (byte) ((s >> 8) & 0xff);
            }
            raf.write(buf, 0, n * 2);
            dataBytes += n * 2L;
            i += n;
        }
    }

    public void write(short[] pcm) throws IOException { write(pcm, pcm.length); }

    /** Chèn khoảng lặng. */
    public void silence(double seconds) throws IOException {
        long frames = Math.round(seconds * sampleRate);
        short[] zeros = new short[1 << 15];
        while (frames > 0) {
            int n = (int) Math.min(frames, zeros.length);
            write(zeros, n);
            frames -= n;
        }
    }

    @Override public void close() throws IOException {
        if (closed) return;
        closed = true;
        raf.seek(0);
        raf.write(header(dataBytes));
        raf.close();
    }

    private byte[] header(long dataLen) {
        byte[] h = new byte[44];
        put(h, 0, "RIFF");
        le32(h, 4, 36 + dataLen);
        put(h, 8, "WAVE");
        put(h, 12, "fmt ");
        le32(h, 16, 16);
        le16(h, 20, 1);          // PCM
        le16(h, 22, 1);          // mono
        le32(h, 24, sampleRate);
        le32(h, 28, sampleRate * 2L);
        le16(h, 32, 2);
        le16(h, 34, 16);
        put(h, 36, "data");
        le32(h, 40, dataLen);
        return h;
    }

    private static void put(byte[] h, int off, String s) {
        for (int i = 0; i < s.length(); i++) h[off + i] = (byte) s.charAt(i);
    }

    private static void le16(byte[] h, int off, int v) {
        h[off] = (byte) (v & 0xff);
        h[off + 1] = (byte) ((v >> 8) & 0xff);
    }

    private static void le32(byte[] h, int off, long v) {
        h[off] = (byte) (v & 0xff);
        h[off + 1] = (byte) ((v >> 8) & 0xff);
        h[off + 2] = (byte) ((v >> 16) & 0xff);
        h[off + 3] = (byte) ((v >> 24) & 0xff);
    }
}
