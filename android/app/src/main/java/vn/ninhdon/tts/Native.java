package vn.ninhdon.tts;

/** Cầu nối tới libninhdon.so (JNI) -> audio.cpp. Chỉ dùng được trên Android (hoặc JVM có đủ thư viện). */
public final class Native implements Synthesizer.Backend {
    public static final Native INSTANCE = new Native();

    private static boolean loaded = false;
    private static String loadError = null;

    private Native() {}

    /** Nạp các thư viện theo đúng thứ tự phụ thuộc. @return null nếu ổn, ngược lại là thông báo lỗi. */
    public static synchronized String load() {
        if (loaded) return null;
        if (loadError != null) return loadError;
        // Ba thư viện đầu là tuỳ chọn (tuỳ cách dựng audio.cpp có tách ggml ra hay không):
        // nếu thiếu thật thì lần nạp "audiocpp"/"ninhdon" phía sau sẽ báo lỗi rõ ràng.
        String[] libs = {"c++_shared", "ggml-base", "ggml", "audiocpp", "sea_g2p_rs", "ninhdon"};
        String current = "";
        try {
            for (int i = 0; i < libs.length; i++) {
                current = libs[i];
                try {
                    System.loadLibrary(current);
                } catch (UnsatisfiedLinkError e) {
                    if (i >= 3) throw e;
                    Logger.log("Bỏ qua thư viện tuỳ chọn «" + current + "»: " + e.getMessage());
                }
            }
            loaded = true;
            return null;
        } catch (Throwable t) {
            loadError = "Không nạp được thư viện «" + current + "»: " + t;
            Logger.log(loadError);
            return loadError;
        }
    }

    // ---- JNI (khớp ninhdon_jni.cpp)
    private native String nativeInit(String model, String dict, String g2pLib, int threads, int talkerMb, int predictorMb, int decoderMb);
    private native short[] nativeSynth(String text, String codes, String emb, long seed);
    private native String nativeLastError();
    private native int nativeSampleRate();
    private native void nativeRelease();
    private native String nativeVersion();

    private boolean ready = false;

    /** @return null nếu ổn, ngược lại là thông báo lỗi. */
    public synchronized String init(String model, String dict, String g2pLib, int threads) {
        String err = load();
        if (err != null) return err;
        if (ready) return null;
        String e = nativeInit(model, dict, g2pLib, threads, 512, 256, 256);
        if (e != null && !e.isEmpty()) return e;
        ready = true;
        return null;
    }

    public synchronized boolean isReady() { return ready; }

    public synchronized void release() {
        if (loaded && ready) nativeRelease();
        ready = false;
    }

    public synchronized String version() { return loaded ? nativeVersion() : "?"; }

    @Override public short[] synth(String text, String codesFile, String embeddingFile) {
        return nativeSynth(text, codesFile, embeddingFile, -1L);
    }

    @Override public int sampleRate() { return nativeSampleRate(); }

    @Override public String lastError() { return nativeLastError(); }
}
