package vn.mika.capkey;

import java.time.LocalDate;
import java.util.Arrays;

/**
 * Chạy thử phần tính toán trên máy chủ (không cần Android):
 *  - Ed25519 khớp các vector RFC 8032;
 *  - key tạo ra GIỐNG TỪNG KÝ TỰ với key do tao_key.py (Python) tạo cùng khóa/mã máy/gói/seri.
 * Khóa thử = 32 byte 0..31 (KHÔNG phải khóa thật; khóa thật không bao giờ nằm trong repo).
 */
public final class HostTest {
    static int ok = 0, bad = 0;

    static void check(boolean c, String what) {
        if (c) ok++;
        else {
            bad++;
            System.out.println("SAI: " + what);
        }
    }

    static byte[] hex(String s) {
        return License.hex(s);
    }

    public static void main(String[] a) throws Exception {
        // ---- RFC 8032 mục 7.1
        String[][] rfc = {
                {"9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
                        "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"},
                {"4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb", "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
                        "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"},
        };
        for (String[] v : rfc) {
            byte[] sk = hex(v[0]), pk = hex(v[1]), msg = hex(v[2]), sg = hex(v[3]);
            check(Arrays.equals(Ed25519.publicKey(sk), pk), "khóa công khai RFC");
            check(Arrays.equals(Ed25519.sign(sk, msg), sg), "chữ ký RFC");
            check(Ed25519.verify(pk, msg, sg), "kiểm tra chữ ký RFC");
            byte[] x = sg.clone();
            x[5] ^= 1;
            check(!Ed25519.verify(pk, msg, x), "chữ ký bị sửa phải bị từ chối");
        }

        // ---- đối chiếu với tao_key.py
        byte[] sk = new byte[32];
        for (int i = 0; i < 32; i++) sk[i] = (byte) i;
        byte[] pub = Ed25519.publicKey(sk);
        check(License.toHex(pub).equals("03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8"), "khóa công khai thử");
        byte[] mach = License.parseMachineCode("ABCD-EFGH-IJKL-MNOP");
        check(License.toHex(mach).equals("00443214c74254b635cf"), "mã máy -> 10 byte");
        check(License.machineCode(mach).equals("ABCD-EFGH-IJKL-MNOP"), "10 byte -> mã máy");
        check(License.parseMachineCode("abcd efgh ijkl mnop") != null, "mã máy chữ thường/cách");
        check(License.parseMachineCode("ABCD-EFGH-IJKL-MNO1") == null, "mã máy có ký tự lạ");
        check(License.parseMachineCode("ABCD-EFGH") == null, "mã máy thiếu");

        String kYear = "AN1-AEBQJEIA-IQZBJR2C-KS3DLTYB-AIBQIEKJ-FD3NTX7B-62OCC3UU-VAISVUTU-5OYXFCLO-T6KINSSM-SKOM622D-TGJFEKKY-MCQPU3YQ-2WA7V5MB-N7BT2FU4-NJTBPEQH-6ZQIEWFV-BQAQ";
        String kLife = "AN1-AEE777YA-AAAAAAAA-AAAAAAG6-VW7O74PJ-CYTXWEPJ-4EEU6F57-CH25B6TC-YZJQQGJI-7BUSZBDA-LRDYHR3W-E2L7YOAF-DUXESXBF-LD4PVYZR-LGMN5FA5-OTQQEQJ4-3MLVFX2I-OYGA";
        String kMonth = "AS1-AEAQIIQA-IQZBJR2C-KS3DLTYA-AAAAPAQC-GXDOY2Z7-WCEUQN23-F7K2RS5P-YA2UBI2G-PISOBWFI-WX4EHT4D-GSVAZQ37-KPIZQXVX-XX6PQDZQ-G3NT7TFQ-2BH7LDTX-N5H7FM7K-MAHA";
        String kCustom = "AS1-AEAAIMGW-WWW6667H-HHHPPPP7-77777FWW-K2AUU3IX-AFLW3IAB-F2WNI2WV-T2ZLYE7Q-II6PYHJ2-OFYO3FLF-C4MVF6LJ-SXVYIM3P-JQRGMBVY-L5E7VBEH-YTU4EOTD-JPGK57P7-JQHQ";

        check(License.makeKey(License.ANIM, sk, 3, LocalDate.of(2027, 3, 15), mach, hex("01020304")).equals(kYear), "AnimStudio gói năm == Python");
        check(License.makeKey(License.ANIM, sk, 9, null, new byte[10], hex("deadbeef")).equals(kLife), "AnimStudio vĩnh viễn mọi máy == Python");
        check(License.makeKey(License.AUTO, sk, 1, LocalDate.of(2026, 11, 24), mach, hex("00000007")).equals(kMonth), "Auto Studio gói tháng == Python");
        check(License.makeKey(License.AUTO, sk, 0, LocalDate.of(2026, 12, 8), License.parseMachineCode("2222-3333-4444-5555"), hex("ffffffff")).equals(kCustom), "Auto Studio tự nhập == Python");

        // issue() đầy đủ (ngày cấp 15/03/2026 + 365 ngày = 15/03/2027)
        License.Issued r = License.issue(License.ANIM, sk, "abcd-efgh-ijkl-mnop", License.PLANS[2], 0, " Khách A ", LocalDate.of(2026, 3, 15), hex("01020304"));
        check(r.key.equals(kYear), "issue() gói năm == Python");
        check(r.expiry.equals(LocalDate.of(2027, 3, 15)) && r.name.equals("Khách A") && r.machineText.equals("ABCD-EFGH-IJKL-MNOP"), "issue() thông tin");
        r = License.issue(License.AUTO, sk, "2222-3333-4444-5555", License.PLANS[4], 45, "", LocalDate.of(2026, 10, 24), hex("ffffffff"));
        check(r.key.equals(kCustom), "issue() tự nhập 45 ngày == Python");
        r = License.issue(License.ANIM, sk, "", License.PLANS[3], 0, "", LocalDate.of(2026, 1, 1), hex("deadbeef"));
        check(r.key.equals(kLife) && r.expiry == null && r.machineText.equals("MỌI MÁY"), "issue() vĩnh viễn mọi máy == Python");

        // ---- parseKey (kiểm tra như chương trình khi khách dán key)
        try {
            License.Info in = License.parseKey(License.ANIM, kYear.toLowerCase().replace("-", " "), pub);
            check(in.expiry.equals(LocalDate.of(2027, 3, 15)) && in.plan == 3 && in.serial == 0x01020304 && Arrays.equals(in.machine, mach), "parseKey đọc đúng trường");
        } catch (Exception e) {
            check(false, "parseKey ném lỗi: " + e);
        }
        try {
            License.parseKey(License.ANIM, kMonth, pub);
            check(false, "key Auto Studio không được dùng cho AnimStudio");
        } catch (License.KeyErr e) {
            check(true, "");
        }
        try {
            License.parseKey(License.AUTO, kMonth.replace("IQZBJR2C", "IQZBJR2D"), pub);
            check(false, "key bị sửa phải bị từ chối");
        } catch (License.KeyErr e) {
            check(true, "");
        }
        try {                                   // cùng nội dung nhưng ký bằng miền khác => không dùng chéo
            License.parseKey(License.AUTO, kYear.replace("AN1", "AS1"), pub);
            check(false, "đổi tiền tố AN1->AS1 phải bị từ chối");
        } catch (License.KeyErr e) {
            check(true, "");
        }

        // ---- đầu vào sai
        for (Object[] bad : new Object[][]{{"ABCD", License.PLANS[0], 0}, {"", License.PLANS[4], 0}, {"", License.PLANS[4], -3}}) {
            try {
                License.issue(License.ANIM, sk, (String) bad[0], (License.Plan) bad[1], (Integer) bad[2], "", LocalDate.of(2026, 1, 1), null);
                check(false, "đầu vào sai phải báo lỗi: " + bad[0] + "/" + bad[2]);
            } catch (IllegalArgumentException e) {
                check(true, "");
            }
        }
        // seri ngẫu nhiên: hai lần cấp cho cùng khách phải khác key nhưng đều hợp lệ
        License.Issued x1 = License.issue(License.ANIM, sk, "ABCD-EFGH-IJKL-MNOP", License.PLANS[0], 0, "", LocalDate.of(2026, 1, 1), null);
        License.Issued x2 = License.issue(License.ANIM, sk, "ABCD-EFGH-IJKL-MNOP", License.PLANS[0], 0, "", LocalDate.of(2026, 1, 1), null);
        check(!x1.key.equals(x2.key), "seri ngẫu nhiên");

        // ---- (tuỳ chọn) khóa thật: java HostTest <đường-dẫn private.key> -> in vài key để đối chiếu bằng Python
        if (a.length > 0) {
            String h = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(a[0])), "US-ASCII").trim();
            byte[] real = hex(h);
            check(Arrays.equals(Ed25519.publicKey(real), License.PUBLIC_KEY), "private.key thật khớp khóa công khai trong chương trình");
            License.Issued k1 = License.issue(License.ANIM, real, "ABCD-EFGH-IJKL-MNOP", License.PLANS[0], 0, "thu", LocalDate.now(), null);
            License.Issued k2 = License.issue(License.AUTO, real, "", License.PLANS[3], 0, "thu", LocalDate.now(), null);
            System.out.println("REALKEY " + k1.key);
            System.out.println("REALKEY " + k2.key);
        }

        System.out.println(bad == 0 ? "HOST TEST OK (" + ok + " kiểm tra)" : "HOST TEST LỖI (" + bad + " sai / " + (ok + bad) + ")");
        System.exit(bad == 0 ? 0 : 1);
    }
}
