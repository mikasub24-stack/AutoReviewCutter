package vn.ninhdon.tts;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends AppCompatActivity {

    private Store store;
    private List<Store.Voice> voices = new ArrayList<>();

    private View panelSetup, panelMain, panelResult;
    private TextView tvSetupInfo, tvDownload, tvProgress, tvResult, tvVersion;
    private ProgressBar progressDownload, progress;
    private Button btnDownload, btnGo, btnStop, btnPlay, btnSave, btnShare;
    private Spinner spVoice;
    private EditText etText, etSentPause, etParaPause;

    private final AtomicBoolean cancelDownload = new AtomicBoolean(false);
    private final AtomicBoolean cancelJob = new AtomicBoolean(false);
    private volatile boolean downloading = false;
    private volatile boolean working = false;
    private volatile boolean converting = false;

    private static final int SPEED_STEPS = 30;      // 0.50× .. 2.00×, mỗi nấc 0.05
    private static final int SPEED_DEFAULT = 10;    // 1.00×
    private SharedPreferences prefs;
    private SeekBar sbSpeed;
    private TextView tvSpeed;
    private boolean touchingSpeed = false;
    private File origFile;          // bản đọc ở tốc độ gốc (chưa đổi)
    private String resultNote = "";

    private File lastFile;
    private Uri savedUri;
    private MediaPlayer player;

    private final ActivityResultLauncher<String> pickText =
            registerForActivityResult(new ActivityResultContracts.GetContent(), this::onTextPicked);

    // ------------------------------------------------------------------ vòng đời

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new Store(this);
        Logger.init(store.log);
        final Thread.UncaughtExceptionHandler old = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            Logger.log("SẬP APP trong luồng " + t.getName(), e);
            if (old != null) old.uncaughtException(t, e);
        });
        Logger.log("Mở app");
        setContentView(R.layout.activity_main);

        panelSetup = findViewById(R.id.panelSetup);
        panelMain = findViewById(R.id.panelMain);
        panelResult = findViewById(R.id.panelResult);
        tvSetupInfo = findViewById(R.id.tvSetupInfo);
        tvDownload = findViewById(R.id.tvDownload);
        tvProgress = findViewById(R.id.tvProgress);
        tvResult = findViewById(R.id.tvResult);
        tvVersion = findViewById(R.id.tvVersion);
        progressDownload = findViewById(R.id.progressDownload);
        progress = findViewById(R.id.progress);
        btnDownload = findViewById(R.id.btnDownload);
        btnGo = findViewById(R.id.btnGo);
        btnStop = findViewById(R.id.btnStop);
        btnPlay = findViewById(R.id.btnPlay);
        btnSave = findViewById(R.id.btnSave);
        btnShare = findViewById(R.id.btnShare);
        spVoice = findViewById(R.id.spVoice);
        etText = findViewById(R.id.etText);
        etSentPause = findViewById(R.id.etSentPause);
        etParaPause = findViewById(R.id.etParaPause);
        sbSpeed = findViewById(R.id.sbSpeed);
        tvSpeed = findViewById(R.id.tvSpeed);
        prefs = getSharedPreferences("settings", MODE_PRIVATE);

        btnDownload.setOnClickListener(v -> startDownload());
        btnGo.setOnClickListener(v -> startJob());
        btnStop.setOnClickListener(v -> {
            cancelJob.set(true);
            btnStop.setEnabled(false);
            tvProgress.setText("Đang dừng…");
        });
        findViewById(R.id.btnPaste).setOnClickListener(v -> pasteText());
        findViewById(R.id.btnOpen).setOnClickListener(v -> pickText.launch("text/*"));
        findViewById(R.id.btnClear).setOnClickListener(v -> etText.setText(""));
        btnPlay.setOnClickListener(v -> togglePlay());
        btnSave.setOnClickListener(v -> saveToDownloads(false));
        btnShare.setOnClickListener(v -> saveToDownloads(true));
        findViewById(R.id.btnLog).setOnClickListener(v -> sendLog());

        sbSpeed.setMax(SPEED_STEPS);
        sbSpeed.setProgress(Math.max(0, Math.min(SPEED_STEPS, prefs.getInt("speed", SPEED_DEFAULT))));
        showSpeedLabel();
        sbSpeed.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int p, boolean fromUser) {
                showSpeedLabel();
                if (fromUser && !touchingSpeed) commitSpeed();     // chỉnh bằng bàn phím / trợ năng
            }

            @Override public void onStartTrackingTouch(SeekBar sb) { touchingSpeed = true; }

            @Override public void onStopTrackingTouch(SeekBar sb) {
                touchingSpeed = false;
                commitSpeed();
            }
        });
        findViewById(R.id.btnSpeedReset).setOnClickListener(v -> {
            sbSpeed.setProgress(SPEED_DEFAULT);
            commitSpeed();
        });

        String ver = "?";
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            ver = pi.versionName;
        } catch (Exception ignored) {
            // bỏ qua
        }
        tvVersion.setText("Ninh Đôn TTS " + ver + " · CPU " + Engine.bigCores() + " lõi mạnh");

        store.installVoices();
        voices = store.voiceList();
        List<String> labels = new ArrayList<>();
        for (Store.Voice v : voices) labels.add(v.label);
        ArrayAdapter<String> ad = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, labels);
        ad.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spVoice.setAdapter(ad);

        refresh();
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ trạng thái

    private void refresh() {
        boolean ready = store.modelsReady();
        panelSetup.setVisibility(ready ? View.GONE : View.VISIBLE);
        panelMain.setVisibility(ready ? View.VISIBLE : View.GONE);
        if (!ready) {
            double mb = store.totalDownloadBytes() / 1048576.0;
            tvSetupInfo.setText(String.format(Locale.ROOT,
                    "Lần đầu dùng cần tải mô hình giọng nói (khoảng %.0f MB) về máy. Chỉ tải một lần, sau đó đọc hoàn toàn ngoại tuyến. Nên dùng Wi‑Fi.", mb));
            boolean busy = downloading;
            btnDownload.setEnabled(!busy);
            btnDownload.setText(busy ? "Đang tải…" : "Tải dữ liệu giọng nói");
        }
        if (voices.isEmpty() && ready) {
            tvProgress.setText("Không thấy giọng nào trong ứng dụng. Hãy gửi nhật ký lỗi cho người hỗ trợ.");
        }
    }

    private void ui(Runnable r) {
        runOnUiThread(r);
    }

    // ------------------------------------------------------------------ tải dữ liệu

    private void startDownload() {
        if (downloading) return;
        downloading = true;
        cancelDownload.set(false);
        progressDownload.setProgress(0);
        refresh();
        new Thread(() -> {
            final List<Downloader.Entry> entries = store.manifest();
            long total = 0;
            for (Downloader.Entry e : entries) total += e.size;
            final long grand = total;
            final long[] before = {0};
            String error = null;
            try {
                for (Downloader.Entry e : entries) {
                    final long base = before[0];
                    Downloader.download(e, store.models, (en, done, tot) -> ui(() -> {
                        long all = base + done;
                        progressDownload.setProgress(grand > 0 ? (int) (1000L * all / grand) : 0);
                        tvDownload.setText(String.format(Locale.ROOT, "Đang tải %s: %.0f / %.0f MB",
                                en.name, all / 1048576.0, grand / 1048576.0));
                    }), cancelDownload);
                    before[0] += e.size;
                }
                Logger.log("Tải dữ liệu xong");
            } catch (InterruptedIOException ie) {
                error = "Đã dừng tải. Bấm tải lại để tiếp tục từ chỗ dở.";
            } catch (IOException ex) {
                Logger.log("Lỗi tải", ex);
                error = "Lỗi tải: " + ex.getMessage() + "\nBấm tải lại để tiếp tục từ chỗ dở.";
            }
            final String err = error;
            downloading = false;
            ui(() -> {
                refresh();
                if (err != null) tvDownload.setText(err);
            });
        }, "download").start();
    }

    // ------------------------------------------------------------------ đọc văn bản

    private static double parseSec(EditText et, double def) {
        try {
            double v = Double.parseDouble(et.getText().toString().trim().replace(',', '.'));
            if (v < 0) return 0;
            return Math.min(v, 30);
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private void setBusy(boolean busy) {
        working = busy;
        btnGo.setVisibility(busy ? View.GONE : View.VISIBLE);
        btnStop.setVisibility(busy ? View.VISIBLE : View.GONE);
        btnStop.setEnabled(true);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        etText.setEnabled(!busy);
        spVoice.setEnabled(!busy);
        if (busy) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    private void startJob() {
        if (working || converting) return;
        final String text = etText.getText().toString();
        if (Plan.strip(text).isEmpty()) {
            Toast.makeText(this, "Hãy nhập văn bản cần đọc.", Toast.LENGTH_SHORT).show();
            return;
        }
        if (voices.isEmpty()) {
            Toast.makeText(this, "Không có giọng đọc.", Toast.LENGTH_SHORT).show();
            return;
        }
        final Store.Voice voice = voices.get(Math.max(0, spVoice.getSelectedItemPosition()));
        final double sentPause = parseSec(etSentPause, 0.35);
        final double paraPause = parseSec(etParaPause, 0.8);
        cancelJob.set(false);
        releasePlayer();
        panelResult.setVisibility(View.GONE);
        savedUri = null;
        setBusy(true);
        progress.setProgress(0);
        tvProgress.setText("Đang nạp mô hình… (lần đầu mất vài giây). Hãy để ứng dụng mở trong lúc đọc.");

        new Thread(() -> {
            PowerManager.WakeLock wl = null;
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ninhdon:tts");
                    wl.acquire(4L * 60 * 60 * 1000);
                }
            } catch (Exception e) {
                Logger.log("Không lấy được wakelock", e);
            }
            try {
                String err = Engine.ensure(store);
                if (err != null) {
                    final String m = "Không nạp được mô hình:\n" + err;
                    ui(() -> {
                        setBusy(false);
                        tvProgress.setText(m);
                    });
                    return;
                }
                String base = Plan.firstSentenceName(text, 60);
                if (base.isEmpty()) base = "giong_doc";
                File out = uniqueFile(store.out, base, ".wav");
                Logger.log("Bắt đầu đọc " + text.length() + " ký tự, giọng " + voice.id + " -> " + out.getName());
                Synthesizer.Result r = Synthesizer.run(text, voice.codes.getAbsolutePath(), voice.embedding.getAbsolutePath(),
                        sentPause, paraPause, new LoggingBackend(Native.INSTANCE), out,
                        (done, total, frac, elapsed, eta) -> ui(() -> {
                            progress.setProgress((int) (frac * 1000));
                            String etaTxt = eta >= 0 ? " · còn khoảng " + fmtTime(eta) : "";
                            tvProgress.setText(String.format(Locale.ROOT, "Đã đọc %d/%d đoạn · %s%s", done, total, fmtTime(elapsed), etaTxt));
                        }), cancelJob);
                Logger.log("Kết thúc: " + r.chunksDone + "/" + r.chunksTotal + " đoạn, "
                        + String.format(Locale.ROOT, "%.1f", r.seconds) + " giây âm thanh, lỗi=" + r.error + ", hủy=" + r.cancelled);
                ui(() -> showResult(r));
            } catch (Throwable t) {
                Logger.log("Lỗi không mong đợi", t);
                final String m = "Lỗi: " + t;
                ui(() -> {
                    setBusy(false);
                    tvProgress.setText(m);
                });
            } finally {
                if (wl != null && wl.isHeld()) wl.release();
            }
        }, "synth").start();
    }

    private void showResult(Synthesizer.Result r) {
        setBusy(false);
        boolean haveResult = false;
        if (r.file != null && r.seconds > 0) {
            origFile = r.file;
            resultNote = r.cancelled ? " (đã dừng, giữ phần đã đọc)" : "";
            panelResult.setVisibility(View.VISIBLE);
            useResultFile(r.file, 1.0);
            haveResult = true;
        }
        if (r.error != null) {
            tvProgress.setText(r.error + "\n(Phần đã đọc được giữ lại. Có thể gửi nhật ký lỗi bên dưới.)");
        } else if (r.cancelled) {
            tvProgress.setText("Đã dừng.");
        } else {
            tvProgress.setText("Xong.");
        }
        if (haveResult && r.error == null) applySpeed();      // áp tốc độ đang chọn lên bản vừa đọc xong
    }

    // ------------------------------------------------------------------ tốc độ đọc

    private double currentSpeed() {
        return Math.round((0.5 + sbSpeed.getProgress() * 0.05) * 100) / 100.0;
    }

    private void showSpeedLabel() {
        double sp = currentSpeed();
        String how = sp < 0.95 ? " (chậm hơn)" : (sp > 1.05 ? " (nhanh hơn)" : " (bình thường)");
        tvSpeed.setText(String.format(Locale.ROOT, "Tốc độ đọc: %.2f×%s", sp, how));
    }

    private void commitSpeed() {
        prefs.edit().putInt("speed", sbSpeed.getProgress()).apply();
        showSpeedLabel();
        applySpeed();
    }

    private static File speedFile(File orig, double sp) {
        String n = orig.getName();
        if (n.endsWith(".wav")) n = n.substring(0, n.length() - 4);
        return new File(orig.getParentFile(), n + " (x" + String.format(Locale.ROOT, "%.2f", sp) + ").wav");
    }

    /** Làm cho tệp dùng để nghe/lưu/chia sẻ khớp với tốc độ đang chọn (đổi từ bản gốc, không đọc lại). */
    private void applySpeed() {
        if (origFile == null || !origFile.isFile() || working || converting) return;
        final double sp = currentSpeed();
        if (Math.abs(sp - 1.0) < 0.005) {
            if (lastFile != origFile) useResultFile(origFile, 1.0);
            return;
        }
        final File dst = speedFile(origFile, sp);
        if (dst.isFile() && dst.length() > 44) {
            if (!dst.equals(lastFile)) useResultFile(dst, sp);
            return;
        }
        startConversion(origFile, dst, sp);
    }

    private void setActionsEnabled(boolean on) {
        btnPlay.setEnabled(on);
        btnSave.setEnabled(on);
        btnShare.setEnabled(on);
        btnGo.setEnabled(on);
    }

    private void startConversion(final File src, final File dst, final double sp) {
        converting = true;
        setActionsEnabled(false);
        progress.setVisibility(View.VISIBLE);
        progress.setProgress(0);
        tvProgress.setText(String.format(Locale.ROOT, "Đang đổi tốc độ sang %.2f×…", sp));
        Logger.log(String.format(Locale.ROOT, "Đổi tốc độ %s sang %.2f×", src.getName(), sp));
        new Thread(() -> {
            File tmp = new File(dst.getParentFile(), dst.getName() + ".part");
            String err = null;
            try {
                WavSpeed.convert(src, tmp, sp, fr -> ui(() -> progress.setProgress((int) (fr * 1000))), null);
                if (!tmp.renameTo(dst)) throw new IOException("Không đổi tên được tệp tạm");
                deleteOtherSpeedFiles(src, dst);
            } catch (Throwable t) {
                Logger.log("Lỗi đổi tốc độ", t);
                err = t.getMessage() == null ? t.toString() : t.getMessage();
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            }
            final String e = err;
            ui(() -> {
                converting = false;
                progress.setVisibility(View.GONE);
                setActionsEnabled(true);
                if (e != null) {
                    tvProgress.setText("Không đổi được tốc độ: " + e + "\nĐang dùng bản tốc độ gốc.");
                    useResultFile(origFile, 1.0);
                } else {
                    tvProgress.setText("Xong.");
                    useResultFile(dst, sp);
                    if (Math.abs(currentSpeed() - sp) > 0.005) applySpeed();    // trong lúc đổi, người dùng kéo sang tốc độ khác
                }
            });
        }, "speed").start();
    }

    /** Xoá các bản tốc độ cũ của cùng một bài (giữ bản gốc và bản mới). */
    private static void deleteOtherSpeedFiles(File orig, File keep) {
        String n = orig.getName();
        if (n.endsWith(".wav")) n = n.substring(0, n.length() - 4);
        final String prefix = n + " (x";
        File[] all = orig.getParentFile().listFiles();
        if (all == null) return;
        for (File f : all) {
            if (f.getName().startsWith(prefix) && f.getName().endsWith(".wav") && !f.equals(keep)) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }

    /** Chọn tệp để nghe / lưu / chia sẻ và cập nhật dòng mô tả. */
    private void useResultFile(File f, double sp) {
        releasePlayer();
        lastFile = f;
        savedUri = null;
        btnPlay.setText("Nghe");
        String dur = "";
        try {
            dur = " — " + fmtTime(WavSpeed.info(f).seconds());
        } catch (IOException ex) {
            Logger.log("Không đọc được thông tin WAV", ex);
        }
        String spd = Math.abs(sp - 1.0) < 0.005 ? "" : String.format(Locale.ROOT, " · tốc độ %.2f×", sp);
        tvResult.setText(f.getName() + dur + spd + resultNote);
    }

    private static String fmtTime(double sec) {
        int s = (int) Math.round(sec);
        if (s >= 3600) return String.format(Locale.ROOT, "%d giờ %02d phút", s / 3600, (s % 3600) / 60);
        if (s >= 60) return String.format(Locale.ROOT, "%d phút %02d giây", s / 60, s % 60);
        return s + " giây";
    }

    private static File uniqueFile(File dir, String base, String ext) {
        File f = new File(dir, base + ext);
        int k = 2;
        while (f.exists()) f = new File(dir, base + " (" + (k++) + ")" + ext);
        return f;
    }

    /** Ghi nhật ký trước/sau mỗi lần gọi lõi C++, để biết chỗ sập nếu có. */
    private static final class LoggingBackend implements Synthesizer.Backend {
        private final Synthesizer.Backend inner;

        LoggingBackend(Synthesizer.Backend inner) { this.inner = inner; }

        @Override public short[] synth(String text, String codesFile, String embeddingFile) {
            String head = text.length() > 40 ? text.substring(0, 40) + "…" : text;
            Logger.log("đọc: " + head);
            long t0 = System.nanoTime();
            short[] pcm = inner.synth(text, codesFile, embeddingFile);
            Logger.log(String.format(Locale.ROOT, "  -> %s trong %.1f giây", pcm == null ? "LỖI " + inner.lastError() : (pcm.length / 48000.0) + " giây âm thanh",
                    (System.nanoTime() - t0) / 1e9));
            return pcm;
        }

        @Override public int sampleRate() { return inner.sampleRate(); }

        @Override public String lastError() { return inner.lastError(); }
    }

    // ------------------------------------------------------------------ nhập văn bản

    private void pasteText() {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip() != null && cm.getPrimaryClip().getItemCount() > 0) {
            ClipData.Item it = cm.getPrimaryClip().getItemAt(0);
            CharSequence t = it.coerceToText(this);
            if (t != null && t.length() > 0) {
                etText.setText(t.toString());
                return;
            }
        }
        Toast.makeText(this, "Bộ nhớ tạm đang trống.", Toast.LENGTH_SHORT).show();
    }

    private void onTextPicked(Uri uri) {
        if (uri == null) return;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[1 << 14];
            int n;
            while ((n = in.read(b)) > 0) {
                bo.write(b, 0, n);
                if (bo.size() > 5_000_000) break;
            }
            etText.setText(new String(bo.toByteArray(), "UTF-8"));
        } catch (IOException e) {
            Logger.log("Không mở được tệp văn bản", e);
            Toast.makeText(this, "Không mở được tệp.", Toast.LENGTH_SHORT).show();
        }
    }

    // ------------------------------------------------------------------ nghe / lưu / chia sẻ

    private void releasePlayer() {
        if (player != null) {
            try {
                player.release();
            } catch (Exception ignored) {
                // bỏ qua
            }
            player = null;
        }
    }

    private void togglePlay() {
        if (lastFile == null) return;
        try {
            if (player != null && player.isPlaying()) {
                player.pause();
                btnPlay.setText("Nghe tiếp");
                return;
            }
            if (player != null) {
                player.start();
                btnPlay.setText("Tạm dừng");
                return;
            }
            player = new MediaPlayer();
            player.setDataSource(lastFile.getAbsolutePath());
            player.setOnCompletionListener(mp -> {
                releasePlayer();
                btnPlay.setText("Nghe");
            });
            player.prepare();
            player.start();
            btnPlay.setText("Tạm dừng");
        } catch (Exception e) {
            Logger.log("Lỗi phát", e);
            releasePlayer();
            btnPlay.setText("Nghe");
            Toast.makeText(this, "Không phát được: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    /** Chép tệp vào Tải xuống/NinhDonTTS (MediaStore); nếu share thì mở bảng chia sẻ. */
    private void saveToDownloads(boolean share) {
        if (lastFile == null || !lastFile.isFile()) return;
        try {
            if (savedUri == null) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, lastFile.getName());
                cv.put(MediaStore.MediaColumns.MIME_TYPE, "audio/wav");
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/NinhDonTTS");
                ContentResolver cr = getContentResolver();
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IOException("Không tạo được tệp trong Tải xuống");
                try (OutputStream os = cr.openOutputStream(uri); FileInputStream in = new FileInputStream(lastFile)) {
                    if (os == null) throw new IOException("Không ghi được vào Tải xuống");
                    byte[] b = new byte[1 << 16];
                    int n;
                    while ((n = in.read(b)) > 0) os.write(b, 0, n);
                }
                savedUri = uri;
                Toast.makeText(this, "Đã lưu vào Tải xuống/NinhDonTTS", Toast.LENGTH_LONG).show();
            } else if (!share) {
                Toast.makeText(this, "Đã lưu rồi: Tải xuống/NinhDonTTS", Toast.LENGTH_SHORT).show();
            }
            if (share) {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("audio/wav");
                send.putExtra(Intent.EXTRA_STREAM, savedUri);
                send.setClipData(ClipData.newRawUri("", savedUri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(send, "Chia sẻ âm thanh"));
            }
        } catch (Exception e) {
            Logger.log("Lỗi lưu/chia sẻ", e);
            Toast.makeText(this, "Lỗi: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void sendLog() {
        String text = "Ninh Đôn TTS — nhật ký lỗi\n" + Logger.tail(12000);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        startActivity(Intent.createChooser(send, "Gửi nhật ký"));
    }
}
