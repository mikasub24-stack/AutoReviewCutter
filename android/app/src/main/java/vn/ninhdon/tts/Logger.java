package vn.ninhdon.tts;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Nhật ký đơn giản ra tệp, để người dùng gửi lại khi gặp lỗi. */
public final class Logger {
    private static File file;
    private static final SimpleDateFormat FMT = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.ROOT);

    private Logger() {}

    public static synchronized void init(File f) {
        file = f;
        if (f.length() > 300_000) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    public static synchronized void log(String msg) {
        if (file == null) return;
        try (FileWriter w = new FileWriter(file, true)) {
            w.write(FMT.format(new Date()) + "  " + msg + "\n");
        } catch (IOException ignored) {
            // không làm app hỏng vì nhật ký
        }
    }

    public static void log(String msg, Throwable t) {
        StringWriter sw = new StringWriter();
        t.printStackTrace(new PrintWriter(sw));
        log(msg + "\n" + sw);
    }

    /** Phần cuối của nhật ký (tối đa maxChars ký tự). */
    public static synchronized String tail(int maxChars) {
        if (file == null || !file.isFile()) return "";
        try (FileInputStream in = new FileInputStream(file)) {
            long len = file.length();
            long skip = Math.max(0, len - maxChars * 2L);
            //noinspection ResultOfMethodCallIgnored
            in.skip(skip);
            byte[] b = new byte[(int) (len - skip)];
            int n = in.read(b);
            String s = new String(b, 0, Math.max(0, n), "UTF-8");
            return s.length() > maxChars ? s.substring(s.length() - maxChars) : s;
        } catch (IOException e) {
            return "";
        }
    }
}
