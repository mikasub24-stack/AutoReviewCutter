package com.autoreview.cutter;

import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFmpegKitConfig;
import com.arthenica.ffmpegkit.FFmpegSession;
import com.arthenica.ffmpegkit.FFprobeKit;
import com.arthenica.ffmpegkit.MediaInformationSession;
import com.arthenica.ffmpegkit.ReturnCode;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Auto Review Cutter+ : ghép video nguồn cho vừa đoạn lời đọc, có thêm
 *  - cắt theo chỗ đổi cảnh (không cắt ngang giữa hai cảnh),
 *  - bỏ đoạn đen / đứng hình.
 * Phần tính toán nằm ở Scenes.java (chạy thử được trên máy tính).
 */
public class MainActivity extends Activity {
    static final int REQ_VIDEO = 10, REQ_AUDIO = 11, REQ_SAVE = 12;

    final ArrayList<File> videos = new ArrayList<>();
    final ArrayList<File> audios = new ArrayList<>();
    TextView status, counter, percent, stage, report;
    ProgressBar bar;
    Button go;
    CheckBox cbScene, cbBad;
    File pending;
    boolean optScene, optBad;

    // theo dõi tiến độ lúc quét cảnh (cập nhật từ thống kê của FFmpegKit)
    volatile boolean scanning;
    volatile double scanDuration;
    volatile int scanBase, scanSpan;
    volatile String scanLabel = "";

    // ------------------------------------------------------------------ giao diện
    @Override
    public void onCreate(Bundle b) {
        super.onCreate(b);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0xff101421, 0xff242039, 0xff141925});
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackground(bg);
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(32, 45, 32, 36);
        scroll.addView(l);

        TextView title = text("AUTO REVIEW\nCUTTER+", 0xfff7f5ff, 30, true);
        l.addView(title);
        TextView sub = text("STUDIO  •  ANDROID  •  1080P  •  NHẬN DIỆN CẢNH", 0xffb9a4ff, 12, false);
        sub.setPadding(0, 8, 0, 30);
        l.addView(sub);

        l.addView(text("01   NGUỒN DỮ LIỆU", 0xffe9e0ff, 16, true));
        button(l, "＋   THÊM VIDEO NGUỒN", () -> pick("video/*", REQ_VIDEO));
        button(l, "＋   THÊM FILE ÂM THANH", () -> pick("audio/*", REQ_AUDIO));
        counter = text("0 video   •   0 audio", 0xffd4c9ec, 14, false);
        counter.setPadding(0, 12, 0, 25);
        l.addView(counter);

        TextView spec = text("02   THIẾT LẬP XUẤT\n\n16:9  •  1920×1080  •  30 FPS\nÂm lượng +10 dB  •  H.264 / AAC  •  MP4",
                0xffe8e2f5, 15, false);
        spec.setPadding(0, 0, 0, 14);
        l.addView(spec);

        cbScene = check("Cắt theo đổi cảnh (không cắt ngang giữa hai cảnh)");
        cbBad = check("Bỏ đoạn đen / đứng hình");
        l.addView(cbScene);
        l.addView(cbBad);
        TextView hint = text("Hai tuỳ chọn cần quét video trước khi cắt nên lâu hơn một chút. Tắt cả hai thì cắt đều mỗi đoạn khoảng 4 giây.",
                0xffa99fc4, 12, false);
        hint.setPadding(0, 6, 0, 22);
        l.addView(hint);

        go = button(l, "▶   BẮT ĐẦU TẠO VIDEO", this::start);

        TextView ph = text("03   TIẾN TRÌNH XỬ LÝ", 0xffe9e0ff, 16, true);
        ph.setPadding(0, 28, 0, 14);
        l.addView(ph);
        percent = text("0%", 0xffb9a4ff, 32, true);
        l.addView(percent);
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(ColorStateList.valueOf(0xffac86ff));
        l.addView(bar, new LinearLayout.LayoutParams(-1, 24));
        stage = text("Đang chờ", 0xffc8b6f7, 14, false);
        stage.setPadding(0, 15, 0, 8);
        l.addView(stage);
        status = text("Chọn video và audio để bắt đầu", 0xffffffff, 14, false);
        l.addView(status);
        report = text("", 0xffcfc6e8, 12, false);
        report.setPadding(0, 18, 0, 0);
        l.addView(report);

        setContentView(scroll);

        FFmpegKitConfig.enableStatisticsCallback(st -> {
            if (!scanning || scanDuration <= 0) return;
            double sec = st.getTime() / 1000.0;
            double frac = Math.max(0, Math.min(1, sec / scanDuration));
            progress(scanBase + (int) (scanSpan * frac), scanLabel + " (" + (int) (frac * 100) + "%)");
        });
    }

    TextView text(String s, int color, int size, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(size);
        if (bold) t.setTypeface(null, android.graphics.Typeface.BOLD);
        return t;
    }

    CheckBox check(String s) {
        CheckBox c = new CheckBox(this);
        c.setText(s);
        c.setChecked(true);
        c.setTextColor(0xffe8e2f5);
        c.setTextSize(15);
        c.setButtonTintList(ColorStateList.valueOf(0xffac86ff));
        return c;
    }

    Button button(LinearLayout l, String s, Runnable r) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setTextColor(0xfff8f4ff);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(0xff59428d);
        shape.setCornerRadius(24);
        shape.setStroke(2, 0xff9775d5);
        b.setBackground(shape);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 120);
        lp.bottomMargin = 16;
        l.addView(b, lp);
        b.setOnClickListener(v -> r.run());
        return b;
    }

    void progress(int p, String phase) {
        final int pp = Math.max(0, Math.min(100, p));
        runOnUiThread(() -> {
            bar.setProgress(pp);
            percent.setText(pp + "%");
            stage.setText(phase);
        });
    }

    void say(String s) { runOnUiThread(() -> status.setText(s)); }

    void setReport(String s) { runOnUiThread(() -> report.setText(s)); }

    // ------------------------------------------------------------------ chọn / lưu tệp
    void pick(String type, int req) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.setType(type);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(i, req);
    }

    static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        if (result != RESULT_OK || data == null) return;
        try {
            if (req == REQ_SAVE) {
                try (InputStream in = new FileInputStream(pending);
                     OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    copy(in, out);
                }
                say("Đã lưu Review_Final.mp4");
                return;
            }
            ArrayList<Uri> list = new ArrayList<>();
            if (data.getClipData() != null) {
                for (int j = 0; j < data.getClipData().getItemCount(); j++) list.add(data.getClipData().getItemAt(j).getUri());
            } else {
                list.add(data.getData());
            }
            for (Uri uri : list) {
                File f = new File(getCacheDir(), "input" + System.nanoTime() + (req == REQ_VIDEO ? ".mp4" : ".audio"));
                try (InputStream in = getContentResolver().openInputStream(uri);
                     OutputStream out = new FileOutputStream(f)) {
                    copy(in, out);
                }
                (req == REQ_VIDEO ? videos : audios).add(f);
            }
            say("Video: " + videos.size() + " | Audio: " + audios.size());
            runOnUiThread(() -> counter.setText(videos.size() + " video   •   " + audios.size() + " audio"));
        } catch (Exception e) {
            say("Lỗi đọc/lưu: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------ FFmpeg
    /** Đường dẫn trong tệp danh sách của bộ nối (concat demuxer). */
    static String q(File f) { return "'" + f.getAbsolutePath().replace("'", "'\\''") + "'"; }

    FFmpegSession ff(String... args) throws Exception {
        FFmpegSession s = FFmpegKit.executeWithArguments(args);
        if (!ReturnCode.isSuccess(s.getReturnCode())) {
            String logs = s.getAllLogsAsString();
            if (logs == null) logs = "";
            if (logs.length() > 1500) logs = logs.substring(logs.length() - 1500);
            throw new Exception("FFmpeg thất bại: " + logs);
        }
        return s;
    }

    double duration(File f) throws Exception {
        MediaInformationSession s = FFprobeKit.getMediaInformation(f.getAbsolutePath());
        if (s.getMediaInformation() == null || s.getMediaInformation().getDuration() == null) {
            throw new Exception("Không đọc được thời lượng");
        }
        try {
            return Double.parseDouble(s.getMediaInformation().getDuration());
        } catch (NumberFormatException e) {
            throw new Exception("Không đọc được thời lượng");
        }
    }

    // ------------------------------------------------------------------ xử lý
    void start() {
        if (videos.isEmpty() || audios.isEmpty()) {
            say("Cần chọn video và audio");
            return;
        }
        optScene = cbScene.isChecked();
        optBad = cbBad.isChecked();
        go.setEnabled(false);
        progress(0, "Chuẩn bị xử lý...");
        new Thread(() -> {
            try {
                render();
            } catch (Exception e) {
                say("Lỗi: " + e.getMessage());
            } finally {
                scanning = false;
                runOnUiThread(() -> go.setEnabled(true));
            }
        }).start();
    }

    static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    void cleanOldWork() {
        File[] olds = getCacheDir().listFiles((d, n) -> n.startsWith("work"));
        if (olds != null) for (File o : olds) deleteTree(o);
    }

    /** Quét 1 video: chỗ đổi cảnh + đoạn đen/đứng hình. */
    Scenes.Analysis scan(int idx, int count, File f, double len) throws Exception {
        scanDuration = len;
        scanBase = 15 + 20 * idx / count;
        scanSpan = Math.max(1, 20 / count);
        scanLabel = "Phân tích cảnh video " + (idx + 1) + "/" + count;
        scanning = true;
        try {
            progress(scanBase, scanLabel);
            FFmpegSession s = ff(Scenes.analysisArgs(f.getAbsolutePath()));
            return Scenes.parse(s.getAllLogsAsString(), len);
        } finally {
            scanning = false;
        }
    }

    void render() throws Exception {
        final boolean byScene = optScene, dropBad = optBad;
        progress(1, "Đang chuẩn bị dữ liệu...");
        cleanOldWork();
        setReport("");
        File dir = new File(getCacheDir(), "work" + System.currentTimeMillis());
        dir.mkdirs();

        // 1. âm thanh: đổi định dạng, nối, tăng âm lượng
        ArrayList<File> audioParts = new ArrayList<>();
        for (int i = 0; i < audios.size(); i++) {
            File out = new File(dir, "a" + i + ".wav");
            ff("-y", "-i", audios.get(i).getAbsolutePath(), "-vn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", out.getAbsolutePath());
            audioParts.add(out);
            progress(2 + (int) (10.0 * (i + 1) / audios.size()), "Chuyển đổi audio " + (i + 1) + "/" + audios.size());
        }
        File alist = new File(dir, "audio.txt");
        try (PrintWriter w = new PrintWriter(alist, "UTF-8")) {
            for (File f : audioParts) w.println("file " + q(f));
        }
        File merged = new File(dir, "Audio_Merged.m4a");
        say("Đang nối audio...");
        progress(14, "Đang ghép âm thanh...");
        ff("-y", "-f", "concat", "-safe", "0", "-i", alist.getAbsolutePath(),
                "-af", "volume=10dB,alimiter=limit=0.95", "-c:a", "aac", "-b:a", "192k", merged.getAbsolutePath());
        double total = duration(merged);
        if (total < 0.1) throw new Exception("Audio quá ngắn");

        // 2. phân tích từng video -> các đoạn dùng được
        int vcount = videos.size();
        ArrayList<List<Scenes.Seg>> pieces = new ArrayList<>();
        StringBuilder rep = new StringBuilder();
        for (int j = 0; j < vcount; j++) {
            File vf = videos.get(j);
            double len = duration(vf);
            List<Scenes.Seg> segs;
            if (!byScene && !dropBad) {
                segs = Scenes.whole(len);
            } else {
                try {
                    Scenes.Analysis a = scan(j, vcount, vf, len);
                    segs = Scenes.usable(a, byScene, dropBad);
                    rep.append(String.format(Locale.US, "Video %d: %d cảnh • dùng được %.0f/%.0f giây", j + 1, a.cuts.size() + 1, Scenes.total(segs), len));
                    if (dropBad && !a.bad.isEmpty()) rep.append(" • phát hiện ").append(a.bad.size()).append(" đoạn đen/đứng hình");
                    rep.append('\n');
                } catch (Exception e) {
                    segs = Scenes.whole(len);
                    rep.append("Video ").append(j + 1).append(": không quét được, cắt đều\n");
                }
            }
            pieces.add(Scenes.split(segs));
            setReport(rep.toString());
        }

        // 3. xếp lịch cho đủ thời lượng lời đọc
        progress(35, "Đang lên danh sách đoạn cắt...");
        List<Scenes.Clip> clips = Scenes.plan(pieces, total);
        if (clips.isEmpty()) {
            // quá khắt khe (vd. video toàn đứng hình): dùng cả video
            ArrayList<List<Scenes.Seg>> all = new ArrayList<>();
            for (int j = 0; j < vcount; j++) all.add(Scenes.split(Scenes.whole(duration(videos.get(j)))));
            clips = Scenes.plan(all, total);
            if (!clips.isEmpty()) rep.append("Không còn đoạn nào dùng được sau khi lọc, đã dùng toàn bộ video.\n");
            setReport(rep.toString());
        }
        if (clips.isEmpty()) throw new Exception("Video nguồn quá ngắn");

        // 4. cắt từng đoạn
        ArrayList<File> parts = new ArrayList<>();
        int n = clips.size();
        for (int i = 0; i < n; i++) {
            Scenes.Clip c = clips.get(i);
            File part = new File(dir, String.format(Locale.US, "v%05d.mp4", i));
            ff(Scenes.clipArgs(videos.get(c.video).getAbsolutePath(), c.start, c.len, part.getAbsolutePath()));
            parts.add(part);
            progress(35 + (int) ((i + 1) * 55.0 / n), "Cắt cảnh " + (i + 1) + "/" + n);
            say("Đang cắt cảnh " + (i + 1) + "/" + n);
        }

        // 5. nối + ghép tiếng
        File vlist = new File(dir, "video.txt");
        try (PrintWriter w = new PrintWriter(vlist, "UTF-8")) {
            for (File f : parts) w.println("file " + q(f));
        }
        progress(92, "Đang nối các cảnh...");
        File video = new File(dir, "video.mp4");
        ff("-y", "-f", "concat", "-safe", "0", "-i", vlist.getAbsolutePath(), "-c", "copy", video.getAbsolutePath());
        progress(96, "Đang ghép video với âm thanh...");
        File output = new File(dir, "Review_Final.mp4");
        ff("-y", "-i", video.getAbsolutePath(), "-i", merged.getAbsolutePath(),
                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                "-t", String.format(Locale.US, "%.3f", total), "-movflags", "+faststart", output.getAbsolutePath());
        for (File f : parts) f.delete();   // bớt chiếm bộ nhớ

        pending = output;
        progress(100, "Hoàn thành! Chọn nơi lưu MP4");
        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.setType("video/mp4");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.putExtra(Intent.EXTRA_TITLE, "Review_Final.mp4");
            startActivityForResult(intent, REQ_SAVE);
        });
    }
}
