package com.autoreview.cutter;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Phần tính toán thuần Java (không dùng Android, không dùng FFmpegKit) của bản "Auto Review Cutter+":
 * đọc nhật ký FFmpeg -> tìm chỗ đổi cảnh + đoạn đen/đứng hình -> chia thành các đoạn dùng được
 * -> xếp lịch cắt cho cả đoạn lời đọc.
 *
 * Tách riêng để chạy thử được trên máy tính (xem tools/host-test).
 *
 * Về độ chính xác: FFmpeg quét ở 4 khung/giây nên mốc đổi cảnh t báo ra có thể lệch tới ~0,27 giây
 * so với chỗ cắt thật c (c nằm trong khoảng (t-0,27 ; t+0,02]). Vì vậy:
 *   - đoạn bắt đầu SAU chỗ cắt thì lùi vào START_PAD (0,05 s) kể từ t  -> chắc chắn không dính cảnh cũ;
 *   - đoạn kết thúc TRƯỚC chỗ cắt thì kết thúc sớm END_PAD (0,30 s) so với t -> không dính cảnh mới.
 */
final class Scenes {
    private Scenes() {}

    // ------------------------------------------------------------------ tham số
    static final double SCENE_THRESHOLD = 0.30;   // ngưỡng điểm đổi cảnh của FFmpeg (0..1)
    static final double START_PAD = 0.05;
    static final double END_PAD = 0.30;
    static final double BAD_BEFORE = 0.30;        // nới đoạn đen/đứng hình về phía trước (do lấy mẫu 4 khung/giây)
    static final double BAD_AFTER = 0.05;
    static final double TAIL_TRIM = 0.05;         // bỏ chút xíu cuối video (thời lượng khai báo hay dư)
    static final double MIN_LEN = 1.5;            // đoạn ngắn hơn thì bỏ
    static final double MAX_LEN = 5.5;            // đoạn dài hơn thì chia nhỏ
    static final double TARGET_LEN = 4.0;         // độ dài mong muốn khi chia nhỏ
    static final double MIN_TAIL = 0.8;           // đoạn cuối không được ngắn hơn mức này
    static final double FPS = 30.0;               // video xuất ra
    static final int MAX_CLIPS = 5000;

    static final String VIDEO_FILTER =
            "scale=1920:1080:force_original_aspect_ratio=decrease,"
            + "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p";

    // ------------------------------------------------------------------ kiểu dữ liệu
    static final class Seg {
        final double start, end;
        Seg(double start, double end) { this.start = start; this.end = end; }
        double len() { return end - start; }
        @Override public String toString() { return String.format(Locale.US, "[%.2f..%.2f]", start, end); }
    }

    static final class Analysis {
        double duration;
        final List<Double> cuts = new ArrayList<>();       // mốc bắt đầu của mỗi cảnh mới (giây)
        final List<double[]> bad = new ArrayList<>();      // {từ, đến} đoạn đen hoặc đứng hình
    }

    static final class Clip {
        final int video;
        final double start, len;
        Clip(int video, double start, double len) { this.video = video; this.start = start; this.len = len; }
        @Override public String toString() { return String.format(Locale.US, "v%d@%.2f+%.2f", video, start, len); }
    }

    // ------------------------------------------------------------------ lệnh FFmpeg (dạng mảng đối số, không qua dấu nháy)
    /** Quét video 1 lần: nhánh 1 chọn khung đổi cảnh + showinfo, nhánh 2 dò đen và đứng hình. */
    static String[] analysisArgs(String src) {
        String graph = "[0:v:0]fps=4,scale=320:-2,split=2[a][b];"
                + "[a]select='gt(scene," + SCENE_THRESHOLD + ")',showinfo[o1];"
                + "[b]blackdetect=d=0.3:pix_th=0.1,freezedetect=n=-55dB:d=1.5[o2]";
        return new String[]{
                "-hide_banner", "-loglevel", "info",
                "-i", src,
                "-filter_complex", graph,
                "-map", "[o1]", "-an", "-f", "null", "-",
                "-map", "[o2]", "-an", "-f", "null", "-"};
    }

    /** Cắt 1 đoạn, đổi về 1920x1080 30 fps, không tiếng. */
    static String[] clipArgs(String src, double start, double len, String out) {
        return new String[]{
                "-y", "-ss", num(start), "-i", src, "-t", num(len), "-an",
                "-vf", VIDEO_FILTER,
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", out};
    }

    static String num(double v) { return String.format(Locale.US, "%.3f", v); }

    // ------------------------------------------------------------------ đọc nhật ký
    private static final String NUM = "(-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)";
    private static final Pattern P_SHOW = Pattern.compile("\\bn:\\s*\\d+\\s+pts:\\s*-?\\d+\\s+pts_time:\\s*" + NUM);
    private static final Pattern P_BLACK = Pattern.compile("black_start:\\s*" + NUM + "\\s+black_end:\\s*" + NUM);
    private static final Pattern P_FREEZE = Pattern.compile("freeze_(start|end):\\s*" + NUM);

    /** Đọc nhật ký FFmpeg (toàn bộ văn bản) của lần quét. */
    static Analysis parse(String log, double duration) {
        Analysis a = new Analysis();
        a.duration = duration;
        if (log == null) log = "";

        ArrayList<Double> cuts = new ArrayList<>();
        Matcher m = P_SHOW.matcher(log);
        while (m.find()) {
            double t = Double.parseDouble(m.group(1));
            if (t > 0.1 && t < duration - 0.1) cuts.add(t);   // khung đầu tiên của video không phải "đổi cảnh"
        }
        Collections.sort(cuts);
        for (double t : cuts) {
            if (a.cuts.isEmpty() || t - a.cuts.get(a.cuts.size() - 1) > 1e-6) a.cuts.add(t);
        }

        m = P_BLACK.matcher(log);
        while (m.find()) addBad(a, Double.parseDouble(m.group(1)), Double.parseDouble(m.group(2)));

        double open = Double.NaN;
        m = P_FREEZE.matcher(log);
        while (m.find()) {
            double t = Double.parseDouble(m.group(2));
            if (m.group(1).equals("start")) {
                open = t;
            } else if (!Double.isNaN(open)) {
                addBad(a, open, t);
                open = Double.NaN;
            }
        }
        if (!Double.isNaN(open)) addBad(a, open, duration);   // đứng hình kéo dài tới hết video
        return a;
    }

    private static void addBad(Analysis a, double from, double to) {
        if (Double.isNaN(from) || Double.isNaN(to) || to <= from) return;
        a.bad.add(new double[]{from, to});
    }

    // ------------------------------------------------------------------ các đoạn dùng được
    /**
     * @param byScene  true: cắt ở mỗi chỗ đổi cảnh (không đoạn nào vắt qua 2 cảnh)
     * @param dropBad  true: bỏ đoạn đen / đứng hình
     */
    static List<Seg> usable(Analysis a, boolean byScene, boolean dropBad) {
        double duration = a.duration;
        ArrayList<Double> bounds = new ArrayList<>();
        bounds.add(0.0);
        if (byScene) bounds.addAll(a.cuts);
        bounds.add(duration);

        ArrayList<double[]> bads = new ArrayList<>();
        if (dropBad) {
            ArrayList<double[]> raw = new ArrayList<>();
            for (double[] b : a.bad) {
                raw.add(new double[]{Math.max(0, b[0] - BAD_BEFORE), Math.min(duration, b[1] + BAD_AFTER)});
            }
            Collections.sort(raw, (x, y) -> Double.compare(x[0], y[0]));
            for (double[] b : raw) {
                if (!bads.isEmpty() && b[0] <= bads.get(bads.size() - 1)[1]) {
                    double[] last = bads.get(bads.size() - 1);
                    last[1] = Math.max(last[1], b[1]);
                } else {
                    bads.add(new double[]{b[0], b[1]});
                }
            }
        }

        ArrayList<Seg> out = new ArrayList<>();
        int n = bounds.size() - 1;
        for (int i = 0; i < n; i++) {
            double s = bounds.get(i), e = bounds.get(i + 1);
            double start = (i == 0) ? s : s + START_PAD;
            double end = (i == n - 1) ? e - TAIL_TRIM : e - END_PAD;
            double cur = start;
            for (double[] b : bads) {
                if (b[1] <= cur || b[0] >= end) continue;
                if (b[0] > cur) addPiece(out, cur, b[0]);
                cur = Math.max(cur, b[1]);
            }
            if (cur < end) addPiece(out, cur, end);
        }
        return out;
    }

    private static void addPiece(List<Seg> out, double s, double e) {
        if (e - s >= MIN_LEN) out.add(new Seg(s, e));
    }

    /** Chia nhỏ đoạn dài hơn MAX_LEN thành các phần bằng nhau, mỗi phần khoảng TARGET_LEN. */
    static List<Seg> split(List<Seg> in) {
        ArrayList<Seg> out = new ArrayList<>();
        for (Seg s : in) {
            double len = s.len();
            if (len <= MAX_LEN) {
                out.add(s);
                continue;
            }
            int n = Math.max(2, (int) Math.round(len / TARGET_LEN));
            double piece = len / n;
            for (int k = 0; k < n; k++) out.add(new Seg(s.start + k * piece, s.start + (k + 1) * piece));
        }
        return out;
    }

    /** Cả video, không phân tích (dùng khi không bật tuỳ chọn nào hoặc quét lỗi). */
    static List<Seg> whole(double duration) {
        ArrayList<Seg> out = new ArrayList<>();
        if (duration - TAIL_TRIM >= MIN_LEN) out.add(new Seg(0, duration - TAIL_TRIM));
        return out;
    }

    static double total(List<Seg> segs) {
        double t = 0;
        for (Seg s : segs) t += s.len();
        return t;
    }

    // ------------------------------------------------------------------ xếp lịch
    /**
     * Xếp các đoạn của mọi video luân phiên nhau (đoạn kế tiếp theo thứ tự thời gian của từng video)
     * cho đủ {@code total} giây lời đọc. Hết đoạn thì quay lại từ đầu. Độ dài mỗi đoạn làm tròn theo khung hình.
     *
     * @return danh sách rỗng nếu không video nào có đoạn dùng được
     */
    static List<Clip> plan(List<List<Seg>> pieces, double total) {
        ArrayList<Clip> clips = new ArrayList<>();
        int v = pieces.size();
        boolean any = false;
        for (List<Seg> l : pieces) if (!l.isEmpty()) any = true;
        if (!any) return clips;

        int[] cursor = new int[v];
        int turn = 0;
        double remaining = total;
        final double half = 0.5 / FPS;
        while (remaining >= half + 1e-9) {
            if (clips.size() >= MAX_CLIPS) throw new IllegalStateException("Audio quá dài");
            int chosen = -1;
            for (int attempt = 0; attempt < 2 && chosen < 0; attempt++) {
                for (int j = 0; j < v; j++) {
                    int k = (turn + j) % v;
                    if (cursor[k] < pieces.get(k).size()) { chosen = k; break; }
                }
                if (chosen < 0) Arrays.fill(cursor, 0);   // hết đoạn: quay lại từ đầu
            }
            turn = chosen + 1;
            Seg p = pieces.get(chosen).get(cursor[chosen]++);
            double avail = Math.floor(p.len() * FPS + 1e-6) / FPS;
            double len;
            if (remaining <= avail + 1e-6) len = remaining;                 // đoạn cuối: vừa đủ
            else if (remaining - avail < MIN_TAIL) len = remaining / 2;     // tránh đoạn cuối quá ngắn
            else len = avail;
            len = Math.round(len * FPS) / FPS;
            if (len <= 0) len = 1 / FPS;
            clips.add(new Clip(chosen, p.start, len));
            remaining -= len;
        }
        return clips;
    }
}
