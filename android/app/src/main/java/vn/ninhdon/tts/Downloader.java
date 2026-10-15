package vn.ninhdon.tts;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** Tải tệp lớn có tiếp tục (Range), kiểm tra kích thước + SHA-256. Không phụ thuộc Android. */
public final class Downloader {
    private Downloader() {}

    public static final class Entry {
        public final String name;
        public final String url;
        public final long size;
        public final String sha256;   // có thể rỗng = bỏ qua kiểm tra mã

        public Entry(String name, String url, long size, String sha256) {
            this.name = name;
            this.url = url;
            this.size = size;
            this.sha256 = sha256 == null ? "" : sha256.toLowerCase(Locale.ROOT);
        }
    }

    public interface Progress {
        void onBytes(Entry entry, long done, long total);
    }

    /** Đọc danh sách "tên|url|kích thước|sha256" mỗi dòng một tệp; dòng bắt đầu bằng # là chú thích. */
    public static List<Entry> parseManifest(String text) {
        List<Entry> out = new ArrayList<>();
        for (String raw : text.split("\n")) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String[] f = line.split("\\|", -1);
            if (f.length < 4) continue;
            long size = 0;
            try {
                size = Long.parseLong(f[2].trim());
            } catch (NumberFormatException ignored) {
                size = 0;
            }
            out.add(new Entry(f[0].trim(), f[1].trim(), size, f[3].trim()));
        }
        return out;
    }

    private static File marker(File dir, Entry e) { return new File(dir, e.name + ".ok"); }

    /** Đã tải xong và đã kiểm tra? (dựa vào tệp đánh dấu, không băm lại mỗi lần mở app) */
    public static boolean isReady(File dir, Entry e) {
        File f = new File(dir, e.name);
        return f.isFile() && (e.size <= 0 || f.length() == e.size) && marker(dir, e).isFile();
    }

    public static void download(Entry e, File dir, Progress progress, AtomicBoolean cancel) throws IOException {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Không tạo được thư mục " + dir);
        if (isReady(dir, e)) return;
        File target = new File(dir, e.name);
        File part = new File(dir, e.name + ".part");
        File mark = marker(dir, e);
        //noinspection ResultOfMethodCallIgnored
        mark.delete();

        IOException last = null;
        for (int attempt = 0; attempt < 8; attempt++) {
            if (cancel.get()) throw new InterruptedIOException("Đã dừng");
            try {
                fetch(e, part, progress, cancel);
                last = null;
                break;
            } catch (InterruptedIOException ie) {
                throw ie;
            } catch (IOException ex) {
                last = ex;
                try {
                    Thread.sleep(Math.min(8000L, 1000L * (attempt + 1)));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new InterruptedIOException("Đã dừng");
                }
            }
        }
        if (last != null) throw last;

        if (e.size > 0 && part.length() != e.size) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            throw new IOException("Tệp " + e.name + " tải về sai kích thước (" + part.length() + " thay vì " + e.size + ").");
        }
        if (!e.sha256.isEmpty()) {
            String got = sha256(part);
            if (!got.equals(e.sha256)) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                throw new IOException("Tệp " + e.name + " tải về bị lỗi (sai mã kiểm tra). Hãy bấm tải lại.");
            }
        }
        //noinspection ResultOfMethodCallIgnored
        target.delete();
        if (!part.renameTo(target)) throw new IOException("Không đổi tên được tệp tải về.");
        try (FileOutputStream fo = new FileOutputStream(mark)) {
            fo.write(e.sha256.getBytes("UTF-8"));
        }
    }

    private static void fetch(Entry e, File part, Progress progress, AtomicBoolean cancel) throws IOException {
        long have = part.exists() ? part.length() : 0;
        if (e.size > 0 && have > e.size) {          // tệp dở dang hỏng
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            have = 0;
        }
        if (e.size > 0 && have == e.size) {          // đã đủ byte, chỉ còn bước kiểm tra
            if (progress != null) progress.onBytes(e, have, e.size);
            return;
        }
        HttpURLConnection c = (HttpURLConnection) new URL(e.url).openConnection();
        try {
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("User-Agent", "NinhDonTTS/1.0");
            if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
            int code = c.getResponseCode();
            boolean append;
            if (code == 206) {
                append = true;
            } else if (code == 200) {
                append = false;          // máy chủ bỏ qua Range -> tải lại từ đầu
                have = 0;
            } else if (code == 416) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                throw new IOException("Máy chủ từ chối đoạn tiếp tục, sẽ tải lại từ đầu.");
            } else {
                throw new IOException("Máy chủ trả về mã " + code + " cho " + e.name);
            }
            long total = e.size > 0 ? e.size : (c.getContentLengthLong() > 0 ? have + c.getContentLengthLong() : 0);
            long done = have;
            byte[] buf = new byte[1 << 16];
            long lastReport = 0;
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part, append)) {
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancel.get()) throw new InterruptedIOException("Đã dừng");
                    out.write(buf, 0, n);
                    done += n;
                    long now = System.nanoTime();
                    if (progress != null && now - lastReport > 150_000_000L) {
                        lastReport = now;
                        progress.onBytes(e, done, total);
                    }
                }
            }
            if (progress != null) progress.onBytes(e, done, total);
            if (e.size > 0 && done < e.size) throw new IOException("Kết nối bị ngắt giữa chừng (" + done + "/" + e.size + ").");
        } finally {
            c.disconnect();
        }
    }

    public static String sha256(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IOException(ex);
        }
    }
}
