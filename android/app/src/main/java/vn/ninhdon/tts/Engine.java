package vn.ninhdon.tts;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;

/** Nạp mô hình một lần cho cả app. */
final class Engine {
    private Engine() {}

    /** @return null nếu sẵn sàng, ngược lại là thông báo lỗi (tiếng Việt). */
    static synchronized String ensure(Store st) {
        if (Native.INSTANCE.isReady()) return null;
        if (!st.modelsReady()) return "Chưa tải xong dữ liệu mô hình.";
        int threads = bigCores();
        Logger.log("Nạp mô hình, " + threads + " luồng");
        long t0 = System.nanoTime();
        String err = Native.INSTANCE.init(st.model().getAbsolutePath(), st.dict().getAbsolutePath(), st.g2pLibrary(), threads);
        Logger.log("Nạp mô hình xong sau " + String.format(java.util.Locale.ROOT, "%.1f", (System.nanoTime() - t0) / 1e9) + " giây: "
                + (err == null ? "OK" : err));
        return err;
    }

    /** Số lõi "to" của CPU (lõi có xung tối đa >= 70% lõi nhanh nhất); lõi nhỏ làm chậm cả nhóm nên bỏ ra. */
    static int bigCores() {
        int n = Math.max(1, Runtime.getRuntime().availableProcessors());
        long[] freq = new long[n];
        long max = 0;
        for (int i = 0; i < n; i++) {
            File f = new File("/sys/devices/system/cpu/cpu" + i + "/cpufreq/cpuinfo_max_freq");
            try (BufferedReader r = new BufferedReader(new FileReader(f))) {
                freq[i] = Long.parseLong(r.readLine().trim());
            } catch (Exception e) {
                freq[i] = 0;
            }
            max = Math.max(max, freq[i]);
        }
        if (max <= 0) return Math.max(2, n / 2);
        int c = 0;
        for (long v : freq) {
            if (v >= max * 0.7) c++;
        }
        return Math.min(8, Math.max(2, c));
    }
}
