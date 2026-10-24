package vn.mika.capkey;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Locale;

/**
 * Định dạng key bản quyền — cổng từ licensing.py / licensing_anim.py / tao_key.py.
 * Key = PREFIX + base32( ver(1) gói(1) hạn(2, ngày kể từ 2024-01-01, 0xFFFF = vĩnh viễn) máy(10) seri(4) + chữ ký ed25519(64) ).
 * Không dùng Android API để chạy thử được trên máy chủ (tools/host-test).
 */
final class License {
    private License() {}

    /** Khóa công khai đã nằm trong Auto Studio và AnimStudio (chung 1 khóa ký, khác "miền" nên key không dùng chéo). */
    static final String PUBLIC_KEY_HEX = "d38b3e54395d83bbf66f9353024654dad5a6a03baebd11911a6be39ae3fb1a1c";
    static final byte[] PUBLIC_KEY = hex(PUBLIC_KEY_HEX);

    static final LocalDate EPOCH = LocalDate.of(2024, 1, 1);
    static final int LIFETIME = 0xFFFF;
    private static final int PAYLOAD_LEN = 18;       // ver(1) gói(1) hạn(2) máy(10) seri(4)
    private static final int KEY_LEN = PAYLOAD_LEN + 64;

    static final class App {
        final String id, name, prefix;
        final byte[] domain;

        App(String id, String name, String prefix, String domain) {
            this.id = id;
            this.name = name;
            this.prefix = prefix;
            this.domain = domain.getBytes(StandardCharsets.US_ASCII);
        }
    }

    static final App AUTO = new App("auto", "Auto Studio", "AS1", "AutoStudio-license-v1|");
    static final App ANIM = new App("anim", "AnimStudio", "AN1", "AnimStudio-license-v1|");
    static final App[] APPS = {ANIM, AUTO};

    static final class Plan {
        final String id, label;
        final int code;
        final int days;            // >0 số ngày, 0 = vĩnh viễn, -1 = tự nhập

        Plan(String id, String label, int code, int days) {
            this.id = id;
            this.label = label;
            this.code = code;
            this.days = days;
        }
    }

    static final Plan[] PLANS = {
            new Plan("month", "Gói tháng (30 ngày)", 1, 30),
            new Plan("quarter", "Gói 3 tháng (90 ngày)", 2, 90),
            new Plan("year", "Gói năm (365 ngày)", 3, 365),
            new Plan("lifetime", "Vĩnh viễn", 9, 0),
            new Plan("custom", "Tự nhập số ngày", 0, -1),
    };

    static final class Issued {
        String key, appName, planLabel, machineText, name;
        LocalDate issued, expiry;       // expiry == null: vĩnh viễn
    }

    static final class Info {
        int plan, serial;
        LocalDate expiry;
        byte[] machine;
    }

    static final class KeyErr extends Exception {
        KeyErr(String m) {
            super(m);
        }
    }

    // ------------------------------------------------------------------ base32 (RFC 4648, A-Z 2-7)
    private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    static String b32encode(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int buf = 0, bits = 0;
        for (byte b : data) {
            buf = (buf << 8) | (b & 0xFF);
            bits += 8;
            while (bits >= 5) {
                sb.append(B32.charAt((buf >> (bits - 5)) & 31));
                bits -= 5;
            }
            buf &= (1 << bits) - 1;
        }
        if (bits > 0) sb.append(B32.charAt((buf << (5 - bits)) & 31));
        return sb.toString();                         // không có dấu '=' đệm
    }

    /** null nếu có ký tự lạ */
    static byte[] b32decode(String s) {
        int buf = 0, bits = 0;
        byte[] out = new byte[s.length() * 5 / 8];
        int n = 0;
        for (int i = 0; i < s.length(); i++) {
            int v = B32.indexOf(s.charAt(i));
            if (v < 0) return null;
            buf = (buf << 5) | v;
            bits += 5;
            if (bits >= 8) {
                out[n++] = (byte) ((buf >> (bits - 8)) & 0xFF);
                bits -= 8;
                buf &= (1 << bits) - 1;
            }
        }
        return Arrays.copyOf(out, n);
    }

    static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    static String toHex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x & 0xFF));
        return sb.toString();
    }

    private static String alnumUpper(String t) {
        StringBuilder sb = new StringBuilder();
        if (t != null) for (char c : t.toUpperCase(Locale.ROOT).toCharArray()) if (c >= 'A' && c <= 'Z' || c >= '0' && c <= '9') sb.append(c);
        return sb.toString();
    }

    // ------------------------------------------------------------------ mã máy
    /** 'xxxx-xxxx-xxxx-xxxx' (không phân biệt hoa thường, bỏ cách/gạch) -> 10 byte, hoặc null nếu sai */
    static byte[] parseMachineCode(String text) {
        String s = alnumUpper(text);
        if (s.length() != 16) return null;
        byte[] b = b32decode(s);
        return b != null && b.length == 10 ? b : null;
    }

    static String machineCode(byte[] b10) {
        String s = b32encode(b10);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i += 4) {
            if (i > 0) sb.append('-');
            sb.append(s, i, Math.min(i + 4, s.length()));
        }
        return sb.toString();
    }

    // ------------------------------------------------------------------ key
    static String makeKey(App app, byte[] secret, int plan, LocalDate expiry, byte[] machine10, byte[] serial4) {
        int days;
        if (expiry == null) {
            days = LIFETIME;
        } else {
            long d = ChronoUnit.DAYS.between(EPOCH, expiry);
            if (d < 0 || d >= LIFETIME) throw new IllegalArgumentException("Ngày hết hạn ngoài phạm vi.");
            days = (int) d;
        }
        if (machine10.length != 10) throw new IllegalArgumentException("Mã máy phải 10 byte.");
        if (serial4.length != 4) throw new IllegalArgumentException("Số seri phải 4 byte.");
        byte[] payload = new byte[PAYLOAD_LEN];
        payload[0] = 1;
        payload[1] = (byte) plan;
        payload[2] = (byte) (days >> 8);
        payload[3] = (byte) days;
        System.arraycopy(machine10, 0, payload, 4, 10);
        System.arraycopy(serial4, 0, payload, 14, 4);
        byte[] msg = new byte[app.domain.length + PAYLOAD_LEN];
        System.arraycopy(app.domain, 0, msg, 0, app.domain.length);
        System.arraycopy(payload, 0, msg, app.domain.length, PAYLOAD_LEN);
        byte[] sig = Ed25519.sign(secret, msg);
        byte[] raw = new byte[KEY_LEN];
        System.arraycopy(payload, 0, raw, 0, PAYLOAD_LEN);
        System.arraycopy(sig, 0, raw, PAYLOAD_LEN, 64);
        String b32 = b32encode(raw);
        StringBuilder sb = new StringBuilder(app.prefix);
        for (int i = 0; i < b32.length(); i += 8) sb.append('-').append(b32, i, Math.min(i + 8, b32.length()));
        return sb.toString();
    }

    /** Kiểm tra lại key đúng như chương trình sẽ làm khi khách dán vào. */
    static Info parseKey(App app, String text, byte[] pub) throws KeyErr {
        String s = alnumUpper(text);
        if (!s.startsWith(app.prefix)) throw new KeyErr("Key không đúng định dạng (phải bắt đầu bằng «" + app.prefix + "-»).");
        byte[] raw = b32decode(s.substring(app.prefix.length()));
        if (raw == null) throw new KeyErr("Key có ký tự lạ.");
        if (raw.length != KEY_LEN) throw new KeyErr("Key thiếu hoặc thừa ký tự.");
        byte[] payload = Arrays.copyOfRange(raw, 0, PAYLOAD_LEN), sig = Arrays.copyOfRange(raw, PAYLOAD_LEN, KEY_LEN);
        byte[] msg = new byte[app.domain.length + PAYLOAD_LEN];
        System.arraycopy(app.domain, 0, msg, 0, app.domain.length);
        System.arraycopy(payload, 0, msg, app.domain.length, PAYLOAD_LEN);
        if (!Ed25519.verify(pub, msg, sig)) throw new KeyErr("Key không hợp lệ (sai chữ ký).");
        if (payload[0] != 1) throw new KeyErr("Key thuộc phiên bản mới hơn.");
        Info in = new Info();
        in.plan = payload[1] & 0xFF;
        int days = ((payload[2] & 0xFF) << 8) | (payload[3] & 0xFF);
        in.expiry = days == LIFETIME ? null : EPOCH.plusDays(days);
        in.machine = Arrays.copyOfRange(payload, 4, 14);
        in.serial = ((payload[14] & 0xFF) << 24) | ((payload[15] & 0xFF) << 16) | ((payload[16] & 0xFF) << 8) | (payload[17] & 0xFF);
        return in;
    }

    static boolean isAnyMachine(String text) {
        String t = text == null ? "" : text.trim().toLowerCase(Locale.ROOT);
        return t.isEmpty() || t.equals("any") || t.equals("all");
    }

    /** Cấp key — giống hàm issue() của tao_key.py. customDays chỉ dùng khi plan.days == -1. */
    static Issued issue(App app, byte[] secret, String machineText, Plan plan, int customDays, String name, LocalDate today, byte[] serial4) {
        byte[] m;
        if (!isAnyMachine(machineText)) {
            m = parseMachineCode(machineText);
            if (m == null) throw new IllegalArgumentException("Mã máy không đúng (phải đủ 16 ký tự A-Z / 2-7, ví dụ ABCD-EFGH-IJKL-MNOP).");
        } else {
            m = new byte[10];
        }
        int d = plan.days;
        if (d == -1) {
            d = customDays;
            if (d <= 0) throw new IllegalArgumentException("Số ngày phải lớn hơn 0.");
        }
        LocalDate expiry = d == 0 ? null : today.plusDays(d);
        if (serial4 == null) {
            serial4 = new byte[4];
            new SecureRandom().nextBytes(serial4);
        }
        String key = makeKey(app, secret, plan.code, expiry, m, serial4);
        try {                                           // kiểm tra lại bằng chính hàm kiểm tra của chương trình
            Info in = parseKey(app, key, Ed25519.publicKey(secret));
            boolean ok = (in.expiry == null ? expiry == null : in.expiry.equals(expiry)) && Arrays.equals(in.machine, m);
            if (!ok) throw new IllegalStateException("Key tạo ra không khớp dữ liệu nhập.");
        } catch (KeyErr e) {
            throw new IllegalStateException("Key tạo ra không qua kiểm tra: " + e.getMessage());
        }
        Issued r = new Issued();
        r.key = key;
        r.appName = app.name;
        r.planLabel = plan.code == 0 ? "Tự nhập " + d + " ngày" : plan.label;
        r.machineText = Arrays.equals(m, new byte[10]) ? "MỌI MÁY" : machineCode(m);
        r.name = name == null ? "" : name.trim();
        r.issued = today;
        r.expiry = expiry;
        return r;
    }
}
