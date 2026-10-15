package vn.ninhdon.tts;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/** Vị trí tệp của app + danh sách giọng + danh sách tệp cần tải. */
final class Store {
    static final String MODEL_NAME = "vieneu-v3-turbo-q8_0.gguf";
    static final String DICT_NAME = "sea_g2p.bin";

    static final class Voice {
        final String id;
        final String label;
        final File codes;
        final File embedding;

        Voice(String id, String label, File codes, File embedding) {
            this.id = id;
            this.label = label;
            this.codes = codes;
            this.embedding = embedding;
        }
    }

    final Context ctx;
    final File models;
    final File voices;
    final File out;
    final File log;

    Store(Context c) {
        ctx = c.getApplicationContext();
        File root = ctx.getFilesDir();
        models = new File(root, "models");
        voices = new File(root, "voices");
        out = new File(root, "out");
        log = new File(root, "log.txt");
        //noinspection ResultOfMethodCallIgnored
        models.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        voices.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        out.mkdirs();
    }

    File model() { return new File(models, MODEL_NAME); }

    File dict() { return new File(models, DICT_NAME); }

    String g2pLibrary() { return ctx.getApplicationInfo().nativeLibraryDir + "/libsea_g2p_rs.so"; }

    /** Các tệp cần tải (mô hình, từ điển) - do CI sinh ra trong assets/files.txt. */
    List<Downloader.Entry> manifest() {
        try {
            return Downloader.parseManifest(new String(readAsset("files.txt"), "UTF-8"));
        } catch (IOException e) {
            Logger.log("Không đọc được files.txt", e);
            return new ArrayList<>();
        }
    }

    boolean modelsReady() {
        List<Downloader.Entry> es = manifest();
        if (es.isEmpty()) return false;
        for (Downloader.Entry e : es) {
            if (!Downloader.isReady(models, e)) return false;
        }
        return true;
    }

    long totalDownloadBytes() {
        long t = 0;
        for (Downloader.Entry e : manifest()) t += e.size;
        return t;
    }

    // ------------------------------------------------------------------ giọng

    /** Chép giọng từ assets ra thư mục ghi được (mỗi lần cập nhật app). */
    void installVoices() {
        try {
            String ver = new String(readAsset("voices/version.txt"), "UTF-8").trim();
            File stamp = new File(voices, ".version");
            if (stamp.isFile() && new String(readAll(stamp), "UTF-8").trim().equals(ver)) return;
            AssetManager am = ctx.getAssets();
            String[] ids = am.list("voices");
            if (ids == null) return;
            for (String id : ids) {
                String[] files = am.list("voices/" + id);
                if (files == null || files.length == 0) continue;     // tệp lẻ (voices.txt, version.txt)
                File dir = new File(voices, id);
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                for (String f : files) {
                    try (InputStream in = am.open("voices/" + id + "/" + f); FileOutputStream o = new FileOutputStream(new File(dir, f))) {
                        byte[] b = new byte[1 << 14];
                        int n;
                        while ((n = in.read(b)) > 0) o.write(b, 0, n);
                    }
                }
            }
            try (FileOutputStream o = new FileOutputStream(stamp)) {
                o.write(ver.getBytes("UTF-8"));
            }
        } catch (IOException e) {
            Logger.log("Không chép được giọng", e);
        }
    }

    List<Voice> voiceList() {
        List<Voice> out = new ArrayList<>();
        try {
            String txt = new String(readAsset("voices/voices.txt"), "UTF-8");
            for (String raw : txt.split("\n")) {
                String line = raw.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                String[] f = line.split("\\|", 2);
                if (f.length < 2) continue;
                File d = new File(voices, f[0].trim());
                File codes = new File(d, "ref_codes.txt");
                File emb = new File(d, "speaker.emb.txt");
                if (codes.isFile() && emb.isFile()) out.add(new Voice(f[0].trim(), f[1].trim(), codes, emb));
            }
        } catch (IOException e) {
            Logger.log("Không đọc được danh sách giọng", e);
        }
        return out;
    }

    // ------------------------------------------------------------------ tiện ích

    private byte[] readAsset(String name) throws IOException {
        try (InputStream in = ctx.getAssets().open(name)) {
            return readAll(in);
        }
    }

    private static byte[] readAll(File f) throws IOException {
        try (InputStream in = new java.io.FileInputStream(f)) {
            return readAll(in);
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[1 << 14];
        int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        return bo.toByteArray();
    }
}
