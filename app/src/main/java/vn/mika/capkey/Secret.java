package vn.mika.capkey;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Lưu KHÓA RIÊNG (32 byte) trên máy: mã hóa AES-256-GCM bằng khóa nằm trong Android Keystore
 * (khóa này không xuất ra khỏi máy được, nhiều máy giữ trong phần cứng).
 * App không có quyền Internet, tắt sao lưu đám mây — khóa riêng không rời khỏi điện thoại.
 */
final class Secret {
    private Secret() {}

    private static final String ALIAS = "capkey_wrap_v1";
    private static final String PREFS = "capkey_secret";
    private static final String ENTRY = "blob";

    private static SecretKey wrapKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return g.generateKey();
    }

    static boolean has(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains(ENTRY);
    }

    static void save(Context c, byte[] secret32) throws Exception {
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, wrapKey());
        byte[] iv = ci.getIV(), ct = ci.doFinal(secret32);
        byte[] all = new byte[1 + iv.length + ct.length];
        all[0] = (byte) iv.length;
        System.arraycopy(iv, 0, all, 1, iv.length);
        System.arraycopy(ct, 0, all, 1 + iv.length, ct.length);
        SharedPreferences.Editor e = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.putString(ENTRY, Base64.encodeToString(all, Base64.NO_WRAP));
        if (!e.commit()) throw new IllegalStateException("Không ghi được khóa vào bộ nhớ máy.");
    }

    /** null nếu chưa có hoặc không giải mã được (vd. đã xóa dữ liệu ứng dụng) */
    static byte[] load(Context c) {
        try {
            String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ENTRY, null);
            if (s == null) return null;
            byte[] all = Base64.decode(s, Base64.NO_WRAP);
            int n = all[0] & 0xFF;
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, wrapKey(), new GCMParameterSpec(128, all, 1, n));
            return ci.doFinal(all, 1 + n, all.length - 1 - n);
        } catch (Exception e) {
            return null;
        }
    }

    static void clear(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            ks.deleteEntry(ALIAS);
        } catch (Exception ignore) {
        }
    }
}
