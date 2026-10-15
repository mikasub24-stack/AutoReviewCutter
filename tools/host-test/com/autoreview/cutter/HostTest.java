package com.autoreview.cutter;

import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * Chạy thử phần tính toán của Scenes trên máy tính với ffmpeg thật (không cần điện thoại).
 * ffmpeg được gọi bằng mảng đối số (giống FFmpegKit.executeWithArguments) nên cách viết bộ lọc
 * ở đây chính là cách app dùng.
 *
 * Cách chạy: tools/host-test/run.sh
 */
public class HostTest {
    static int fails = 0, checks = 0;

    static void check(boolean ok, String msg) {
        checks++;
        if (!ok) fails++;
        System.out.println((ok ? "  [ok]   " : "  [HỎNG] ") + msg);
    }

    // ------------------------------------------------------------------ chạy lệnh
    static String run(List<String> args) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(args);
        pb.redirectErrorStream(true);
        Process p = pb.start();
        p.getOutputStream().close();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        try (InputStream in = p.getInputStream()) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) != -1) bo.write(buf, 0, n);
        }
        int code = p.waitFor();
        String out = bo.toString("UTF-8");
        if (code != 0) {
            throw new IOException(args.get(0) + " thoát mã " + code + "\n"
                    + (out.length() > 3000 ? out.substring(out.length() - 3000) : out));
        }
        return out;
    }

    static String ffmpeg(String... a) throws Exception {
        List<String> l = new ArrayList<>();
        l.add("ffmpeg");
        l.addAll(Arrays.asList(a));
        return run(l);
    }

    static String probe(Path f, String entries) throws Exception {
        return run(Arrays.asList("ffprobe", "-v", "error", "-show_entries", entries,
                "-of", "default=nw=1:nk=1", f.toString())).trim();
    }

    static double duration(Path f) throws Exception {
        return Double.parseDouble(probe(f, "format=duration"));
    }

    static Scenes.Analysis analyze(Path f) throws Exception {
        return Scenes.parse(ffmpeg(Scenes.analysisArgs(f.toString())), duration(f));
    }

    /** Nối các nguồn lavfi thành 1 video, biết trước chỗ cắt. */
    static void makeVideo(Path out, int w, int h, int fps, String[] srcs, double[] durs) throws Exception {
        List<String> a = new ArrayList<>(Arrays.asList("-y", "-hide_banner", "-loglevel", "error"));
        StringBuilder g = new StringBuilder();
        for (int i = 0; i < srcs.length; i++) {
            a.add("-t");
            a.add(String.format(Locale.US, "%.3f", durs[i]));
            a.add("-f");
            a.add("lavfi");
            a.add("-i");
            a.add(String.format(Locale.US, "%s%ssize=%dx%d:rate=%d",
                    srcs[i], srcs[i].contains("=") ? ":" : "=", w, h, fps));
            g.append("[").append(i).append(":v]format=yuv420p,setsar=1[s").append(i).append("];");
        }
        for (int i = 0; i < srcs.length; i++) g.append("[s").append(i).append("]");
        g.append("concat=n=").append(srcs.length).append(":v=1:a=0[o]");
        a.addAll(Arrays.asList("-filter_complex", g.toString(), "-map", "[o]", "-c:v", "libx264",
                "-preset", "ultrafast", "-crf", "18", "-g", "60", out.toString()));
        ffmpeg(a.toArray(new String[0]));
    }

    // ------------------------------------------------------------------ tiện ích kiểm tra
    static boolean hasCutNear(List<Double> cuts, double c) {
        for (double t : cuts) if (t >= c - 0.05 && t <= c + 0.30) return true;
        return false;
    }

    static boolean covered(List<double[]> bad, double from, double to) {
        for (double t = from; t <= to + 1e-9; t += 0.05) {
            boolean in = false;
            for (double[] b : bad) if (t >= b[0] - 1e-9 && t <= b[1] + 1e-9) { in = true; break; }
            if (!in) return false;
        }
        return true;
    }

    static boolean noOverlap(List<Scenes.Seg> segs, double from, double to) {
        for (Scenes.Seg s : segs) if (s.start < to && s.end > from) return false;
        return true;
    }

    static boolean noCross(List<Scenes.Seg> segs, double cut) {
        for (Scenes.Seg s : segs) if (s.start < cut && s.end > cut) return false;
        return true;
    }

    static String fmt(List<Scenes.Seg> l) {
        StringBuilder sb = new StringBuilder();
        for (Scenes.Seg s : l) sb.append(s).append(' ');
        return sb.toString().trim();
    }

    // ------------------------------------------------------------------ chương trình
    public static void main(String[] argv) throws Exception {
        Path work = Files.createTempDirectory("arcplus");
        System.out.println("Thư mục tạm: " + work);

        // ===== A: ngang 640x360 30 fps; cắt thật 6, 13, 15, 19, 22; đen 13-15; đứng hình 15-22
        System.out.println("\n== Video A (ngang, 30 fps)");
        Path va = work.resolve("a.mp4");
        makeVideo(va, 640, 360, 30,
                new String[]{"testsrc2", "mandelbrot", "color=c=black", "smptebars", "color=c=0x5b6fa0", "testsrc2"},
                new double[]{6, 7, 2, 4, 3, 5});
        Scenes.Analysis aa = analyze(va);
        System.out.println("  cuts=" + aa.cuts + " bad=" + Arrays.deepToString(aa.bad.toArray()));
        for (double c : new double[]{6, 13, 15, 19, 22}) check(hasCutNear(aa.cuts, c), "tìm thấy chỗ cắt ~" + c);
        check(aa.cuts.size() == 5, "đúng 5 chỗ cắt, không báo thừa (có " + aa.cuts.size() + ")");
        check(covered(aa.bad, 13.3, 21.7), "đoạn đen/đứng hình phủ 13.3 → 21.7");

        List<Scenes.Seg> both = Scenes.usable(aa, true, true);
        System.out.println("  usable(cảnh+bỏ xấu) = " + fmt(both));
        check(!both.isEmpty(), "có đoạn dùng được");
        check(noOverlap(both, 13.0, 22.0), "không đoạn nào chạm vùng đen/đứng hình 13-22");
        check(noCross(both, 6.0), "không đoạn nào vắt qua chỗ cắt 6");
        check(noCross(both, 22.0), "không đoạn nào vắt qua chỗ cắt 22");

        List<Scenes.Seg> sceneOnly = Scenes.usable(aa, true, false);
        System.out.println("  usable(chỉ cảnh)     = " + fmt(sceneOnly));
        for (double c : new double[]{6, 13, 15, 19, 22}) check(noCross(sceneOnly, c), "(chỉ cảnh) không vắt qua " + c);
        check(Scenes.total(sceneOnly) > Scenes.total(both), "(chỉ cảnh) giữ lại nhiều hơn khi không bỏ đoạn xấu");

        List<Scenes.Seg> badOnly = Scenes.usable(aa, false, true);
        System.out.println("  usable(chỉ bỏ xấu)   = " + fmt(badOnly));
        check(noOverlap(badOnly, 13.0, 22.0), "(chỉ bỏ xấu) không chạm vùng 13-22");
        check(badOnly.stream().anyMatch(s -> s.start < 6 && s.end > 6), "(chỉ bỏ xấu) được phép vắt qua chỗ cắt 6");

        // ===== B: dọc 360x640 25 fps; cắt thật 5, 9; đen kéo dài tới hết video (9-12)
        System.out.println("\n== Video B (dọc, 25 fps, đen tới hết video)");
        Path vb = work.resolve("b.mp4");
        makeVideo(vb, 360, 640, 25, new String[]{"testsrc2", "mandelbrot", "color=c=black"}, new double[]{5, 4, 3});
        Scenes.Analysis ab = analyze(vb);
        System.out.println("  cuts=" + ab.cuts + " bad=" + Arrays.deepToString(ab.bad.toArray()));
        check(hasCutNear(ab.cuts, 5) && hasCutNear(ab.cuts, 9), "tìm thấy chỗ cắt ~5 và ~9");
        check(covered(ab.bad, 9.3, 11.9), "đen cuối video được ghi nhận (9.3 → 11.9)");
        List<Scenes.Seg> ub = Scenes.usable(ab, true, true);
        System.out.println("  usable = " + fmt(ub));
        check(noOverlap(ub, 9.0, 12.0), "không đoạn nào chạm đoạn đen cuối");
        check(noCross(ub, 5.0), "không vắt qua chỗ cắt 5");

        // ===== C: không có chỗ cắt
        System.out.println("\n== Video C (1 cảnh liền 20 giây)");
        Path vc = work.resolve("c.mp4");
        makeVideo(vc, 640, 360, 30, new String[]{"testsrc2"}, new double[]{20});
        Scenes.Analysis ac = analyze(vc);
        System.out.println("  cuts=" + ac.cuts + " bad=" + Arrays.deepToString(ac.bad.toArray()));
        check(ac.cuts.isEmpty() && ac.bad.isEmpty(), "không báo cắt/đoạn xấu giả");
        List<Scenes.Seg> uc = Scenes.split(Scenes.usable(ac, true, true));
        System.out.println("  usable+split = " + fmt(uc));
        check(uc.size() == 5, "chia 20 giây thành 5 đoạn (có " + uc.size() + ")");

        // ===== kế hoạch
        System.out.println("\n== Xếp lịch");
        List<List<Scenes.Seg>> pieces = Arrays.asList(
                Scenes.split(both), Scenes.split(ub), uc);
        double total = 45.0;
        List<Scenes.Clip> clips = Scenes.plan(pieces, total);
        System.out.println("  " + clips.size() + " đoạn: " + clips);
        double sum = 0;
        for (Scenes.Clip c : clips) sum += c.len;
        check(Math.abs(sum - total) <= 1.0 / 60 + 1e-6, String.format(Locale.US, "tổng độ dài %.3f ≈ %.1f", sum, total));
        check(clips.get(clips.size() - 1).len >= Scenes.MIN_TAIL - 1e-9, "đoạn cuối không quá ngắn (" + clips.get(clips.size() - 1).len + ")");
        check(clips.get(0).video == 0 && clips.get(1).video == 1 && clips.get(2).video == 2, "ba đoạn đầu lần lượt từ 3 video");
        boolean inside = true;
        for (Scenes.Clip c : clips) {
            boolean ok = false;
            for (Scenes.Seg s : pieces.get(c.video)) {
                if (c.start >= s.start - 1e-6 && c.start + c.len <= s.end + 1.0 / 30) { ok = true; break; }
            }
            if (!ok) { inside = false; System.out.println("   nằm ngoài đoạn dùng được: " + c); }
        }
        check(inside, "mọi đoạn cắt nằm trong đoạn dùng được của video tương ứng");

        // các trường hợp biên
        List<Scenes.Clip> tiny = Scenes.plan(pieces, 0.4);
        check(tiny.size() == 1 && Math.abs(tiny.get(0).len - 0.4) < 0.04, "lời đọc 0,4 giây → 1 đoạn ngắn");
        List<Scenes.Clip> one = Scenes.plan(Arrays.asList(Arrays.asList(new Scenes.Seg(0, 10)), new ArrayList<Scenes.Seg>()), 35);
        double s1 = 0;
        for (Scenes.Clip c : one) s1 += c.len;
        check(Math.abs(s1 - 35) <= 1.0 / 60 + 1e-6 && one.size() > 3, "quay vòng khi hết đoạn (" + one.size() + " đoạn, tổng " + s1 + ")");
        check(Scenes.plan(Arrays.asList(new ArrayList<Scenes.Seg>(), new ArrayList<Scenes.Seg>()), 10).isEmpty(), "không có đoạn nào → danh sách rỗng");
        boolean tailOk = true;
        for (double t = 1.0; t < 60; t += 0.137) {
            List<Scenes.Clip> cl = Scenes.plan(pieces, t);
            double ss = 0;
            for (Scenes.Clip c : cl) ss += c.len;
            if (Math.abs(ss - t) > 1.0 / 60 + 1e-6) { tailOk = false; System.out.println("   lệch tổng ở t=" + t + ": " + ss); }
            if (t >= 2 && cl.get(cl.size() - 1).len < Scenes.MIN_TAIL - 1e-9) { tailOk = false; System.out.println("   đoạn cuối ngắn ở t=" + t); }
        }
        check(tailOk, "quét 400+ độ dài lời đọc: tổng đúng, đoạn cuối không quá ngắn");

        // ===== chạy thật: cắt → nối → ghép tiếng, rồi soi lại từng đoạn
        System.out.println("\n== Dựng thật bằng ffmpeg");
        Path[] srcs = {va, vb, vc};
        Path audio = work.resolve("audio.m4a");
        ffmpeg("-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=" + total,
                "-c:a", "aac", "-b:a", "128k", audio.toString());
        double atotal = duration(audio);
        List<Scenes.Clip> real = Scenes.plan(pieces, atotal);
        List<Path> parts = new ArrayList<>();
        for (int i = 0; i < real.size(); i++) {
            Scenes.Clip c = real.get(i);
            Path out = work.resolve(String.format("v%05d.mp4", i));
            ffmpeg(prepend(Scenes.clipArgs(srcs[c.video].toString(), c.start, c.len, out.toString()), "-hide_banner", "-loglevel", "error"));
            parts.add(out);
        }
        Path list = work.resolve("video.txt");
        StringBuilder sb = new StringBuilder();
        for (Path p : parts) sb.append("file '").append(p).append("'\n");
        Files.write(list, sb.toString().getBytes("UTF-8"));
        Path video = work.resolve("video.mp4");
        ffmpeg("-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list.toString(), "-c", "copy", video.toString());
        Path fin = work.resolve("Review_Final.mp4");
        ffmpeg("-y", "-hide_banner", "-loglevel", "error", "-i", video.toString(), "-i", audio.toString(),
                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-t", Scenes.num(atotal),
                "-movflags", "+faststart", fin.toString());
        double fd = duration(fin);
        System.out.println("  kết quả: " + fd + " giây, " + probe(fin, "stream=width,height,r_frame_rate"));
        check(Math.abs(fd - atotal) < 0.12, String.format(Locale.US, "video xuất dài %.3f ≈ lời đọc %.3f", fd, atotal));
        check(probe(fin, "stream=width").contains("1920") && probe(fin, "stream=height").contains("1080"), "độ phân giải 1920x1080");
        check(probe(fin, "stream=codec_type").contains("audio") && probe(fin, "stream=codec_type").contains("video"), "có cả hình và tiếng");

        int bad = 0;
        for (int i = 0; i < parts.size(); i++) {
            Scenes.Analysis ca = analyze(parts.get(i));
            if (!ca.cuts.isEmpty() || !ca.bad.isEmpty()) {
                bad++;
                System.out.println("   đoạn " + i + " " + real.get(i) + " còn dính: cuts=" + ca.cuts + " bad=" + Arrays.deepToString(ca.bad.toArray()));
            }
        }
        check(bad == 0, "soi lại " + parts.size() + " đoạn đã cắt: không đoạn nào còn đổi cảnh / đen / đứng hình (hỏng " + bad + ")");

        System.out.println("\n" + (checks - fails) + "/" + checks + " kiểm tra đạt");
        System.exit(fails == 0 ? 0 : 1);
    }

    static String[] prepend(String[] a, String... pre) {
        String[] r = new String[pre.length + a.length];
        System.arraycopy(pre, 0, r, 0, pre.length);
        System.arraycopy(a, 0, r, pre.length, a.length);
        return r;
    }
}
