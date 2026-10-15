package vn.ninhdon.tts;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/** Điều phối một lượt đọc: chia đoạn -> đọc từng đoạn -> chèn khoảng nghỉ -> ghi WAV. Không phụ thuộc Android. */
public final class Synthesizer {

    /** Phần xử lý giọng thật (JNI) hoặc giả (khi thử). */
    public interface Backend {
        /** @return PCM mono 16-bit, hoặc null nếu lỗi (xem lastError()). */
        short[] synth(String text, String codesFile, String embeddingFile);
        int sampleRate();
        String lastError();
    }

    public interface Listener {
        /** @param fraction 0..1 theo số ký tự đã đọc; @param etaSec ước lượng còn lại (-1 = chưa biết) */
        void onProgress(int doneChunks, int totalChunks, double fraction, double elapsedSec, double etaSec);
    }

    public static final class Result {
        public final File file;
        public final double seconds;
        public final boolean cancelled;
        public final String error;     // null nếu không lỗi
        public final int chunksDone;
        public final int chunksTotal;

        Result(File file, double seconds, boolean cancelled, String error, int done, int total) {
            this.file = file;
            this.seconds = seconds;
            this.cancelled = cancelled;
            this.error = error;
            this.chunksDone = done;
            this.chunksTotal = total;
        }
    }

    public static final int CHUNK_LIMIT = 320;

    private Synthesizer() {}

    public static Result run(String text, String codesFile, String embeddingFile, double sentPause, double paraPause,
                             Backend backend, File outFile, Listener listener, AtomicBoolean cancel) {
        List<Plan.Item> plan = Plan.build(text, sentPause, paraPause, CHUNK_LIMIT);
        int total = 0;
        long totalChars = 0;
        for (Plan.Item it : plan) {
            if (!it.pause) {
                total++;
                totalChars += it.text.length();
            }
        }
        if (total == 0) {
            return new Result(null, 0, false, "Chưa có văn bản để đọc.", 0, 0);
        }

        long start = System.nanoTime();
        long doneChars = 0;
        int done = 0;
        WavWriter wav = null;
        String error = null;
        boolean cancelled = false;
        try {
            for (Plan.Item it : plan) {
                if (cancel.get()) {
                    cancelled = true;
                    break;
                }
                if (it.pause) {
                    if (wav != null) wav.silence(it.seconds);   // kế hoạch không bao giờ bắt đầu bằng khoảng nghỉ
                    continue;
                }
                short[] pcm = backend.synth(it.text, codesFile, embeddingFile);
                if (pcm == null) {                                // thử lại một lần
                    pcm = backend.synth(it.text, codesFile, embeddingFile);
                }
                if (pcm == null || pcm.length == 0) {
                    error = "Lỗi khi đọc đoạn " + (done + 1) + "/" + total + ": " + backend.lastError();
                    break;
                }
                if (wav == null) wav = new WavWriter(outFile, backend.sampleRate());
                wav.write(pcm);
                done++;
                doneChars += it.text.length();
                if (listener != null) {
                    double elapsed = (System.nanoTime() - start) / 1e9;
                    double frac = totalChars > 0 ? (double) doneChars / totalChars : 1.0;
                    double eta = frac > 0.02 ? elapsed * (1.0 - frac) / frac : -1;
                    listener.onProgress(done, total, frac, elapsed, eta);
                }
            }
        } catch (IOException e) {
            error = "Lỗi ghi tệp: " + e.getMessage();
        } catch (RuntimeException e) {
            error = "Lỗi: " + e;
        }
        double sec = 0;
        if (wav != null) {
            sec = wav.seconds();
            try {
                wav.close();
            } catch (IOException e) {
                if (error == null) error = "Lỗi đóng tệp: " + e.getMessage();
            }
        }
        return new Result(wav != null ? outFile : null, sec, cancelled, error, done, total);
    }
}
