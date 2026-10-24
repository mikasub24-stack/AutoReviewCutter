package vn.mika.capkey;

import java.math.BigInteger;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * Ed25519 (RFC 8032) thuần Java — cổng 1-1 từ ed25519.py của công cụ tạo key trên máy tính,
 * để key tạo trên điện thoại GIỐNG HỆT key tạo bằng tao_key.py. Chữ ký Ed25519 là tất định
 * (cùng khóa + cùng nội dung => cùng chữ ký) nên có thể đối chiếu từng ký tự.
 * Không dùng thư viện ngoài, không dùng java.security.Signature("Ed25519") (chỉ có từ Android 13).
 */
final class Ed25519 {
    private Ed25519() {}

    private static final BigInteger ONE = BigInteger.ONE;
    private static final BigInteger TWO = BigInteger.valueOf(2);
    static final BigInteger P = ONE.shiftLeft(255).subtract(BigInteger.valueOf(19));
    static final BigInteger Q = ONE.shiftLeft(252).add(new BigInteger("27742317777372353535851937790883648493"));
    private static final BigInteger D = BigInteger.valueOf(-121665).multiply(inv(BigInteger.valueOf(121666))).mod(P);
    private static final BigInteger SQRT_M1 = TWO.modPow(P.subtract(ONE).shiftRight(2), P);
    private static final BigInteger[] G;

    static {
        BigInteger gy = BigInteger.valueOf(4).multiply(inv(BigInteger.valueOf(5))).mod(P);
        BigInteger gx = recoverX(gy, 0);
        G = new BigInteger[]{gx, gy, ONE, gx.multiply(gy).mod(P)};
    }

    private static BigInteger inv(BigInteger x) {
        return x.modPow(P.subtract(TWO), P);
    }

    private static byte[] sha512(byte[]... parts) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-512");
            for (byte[] p : parts) md.update(p);
            return md.digest();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** little-endian -> số không âm */
    private static BigInteger fromLE(byte[] b) {
        byte[] r = new byte[b.length];
        for (int i = 0; i < b.length; i++) r[i] = b[b.length - 1 - i];
        return new BigInteger(1, r);
    }

    /** số không âm -> little-endian đúng n byte */
    private static byte[] toLE(BigInteger v, int n) {
        byte[] be = v.toByteArray();                 // big-endian có thể thừa byte 0 đầu
        byte[] out = new byte[n];
        for (int i = 0; i < n; i++) {
            int src = be.length - 1 - i;
            out[i] = src >= 0 ? be[src] : 0;
        }
        return out;
    }

    private static BigInteger[] add(BigInteger[] a, BigInteger[] b) {
        BigInteger A = a[1].subtract(a[0]).multiply(b[1].subtract(b[0])).mod(P);
        BigInteger B = a[1].add(a[0]).multiply(b[1].add(b[0])).mod(P);
        BigInteger C = TWO.multiply(a[3]).multiply(b[3]).multiply(D).mod(P);
        BigInteger Dd = TWO.multiply(a[2]).multiply(b[2]).mod(P);
        BigInteger E = B.subtract(A), F = Dd.subtract(C), Gg = Dd.add(C), H = B.add(A);
        return new BigInteger[]{E.multiply(F).mod(P), Gg.multiply(H).mod(P), F.multiply(Gg).mod(P), E.multiply(H).mod(P)};
    }

    private static BigInteger[] mul(BigInteger s, BigInteger[] pt) {
        BigInteger[] r = new BigInteger[]{BigInteger.ZERO, ONE, ONE, BigInteger.ZERO};
        for (int i = 0, n = s.bitLength(); i < n; i++) {
            if (s.testBit(i)) r = add(r, pt);
            pt = add(pt, pt);
        }
        return r;
    }

    private static boolean equal(BigInteger[] a, BigInteger[] b) {
        if (a[0].multiply(b[2]).subtract(b[0].multiply(a[2])).mod(P).signum() != 0) return false;
        return a[1].multiply(b[2]).subtract(b[1].multiply(a[2])).mod(P).signum() == 0;
    }

    private static BigInteger recoverX(BigInteger y, int sign) {
        if (y.compareTo(P) >= 0) return null;
        BigInteger x2 = y.multiply(y).subtract(ONE).multiply(inv(D.multiply(y).multiply(y).add(ONE))).mod(P);
        if (x2.signum() == 0) return sign != 0 ? null : BigInteger.ZERO;
        BigInteger x = x2.modPow(P.add(BigInteger.valueOf(3)).shiftRight(3), P);
        if (x.multiply(x).subtract(x2).mod(P).signum() != 0) x = x.multiply(SQRT_M1).mod(P);
        if (x.multiply(x).subtract(x2).mod(P).signum() != 0) return null;
        if ((x.testBit(0) ? 1 : 0) != sign) x = P.subtract(x);
        return x;
    }

    private static byte[] compress(BigInteger[] pt) {
        BigInteger zi = inv(pt[2]);
        BigInteger x = pt[0].multiply(zi).mod(P), y = pt[1].multiply(zi).mod(P);
        BigInteger v = y.or(x.testBit(0) ? ONE.shiftLeft(255) : BigInteger.ZERO);
        return toLE(v, 32);
    }

    private static BigInteger[] decompress(byte[] s) {
        if (s.length != 32) return null;
        BigInteger y = fromLE(s);
        int sign = y.testBit(255) ? 1 : 0;
        y = y.clearBit(255);
        BigInteger x = recoverX(y, sign);
        if (x == null) return null;
        return new BigInteger[]{x, y, ONE, x.multiply(y).mod(P)};
    }

    private static BigInteger scalarA(byte[] h) {
        BigInteger a = fromLE(Arrays.copyOfRange(h, 0, 32));
        a = a.and(ONE.shiftLeft(254).subtract(BigInteger.valueOf(8)));
        return a.or(ONE.shiftLeft(254));
    }

    private static BigInteger modq(byte[]... parts) {
        return fromLE(sha512(parts)).mod(Q);
    }

    /** 32 byte khóa riêng -> 32 byte khóa công khai */
    static byte[] publicKey(byte[] secret) {
        if (secret.length != 32) throw new IllegalArgumentException("khóa riêng phải 32 byte");
        return compress(mul(scalarA(sha512(secret)), G));
    }

    /** Ký msg bằng khóa riêng 32 byte -> chữ ký 64 byte */
    static byte[] sign(byte[] secret, byte[] msg) {
        byte[] h = sha512(secret);
        BigInteger a = scalarA(h);
        byte[] prefix = Arrays.copyOfRange(h, 32, 64);
        byte[] A = compress(mul(a, G));
        BigInteger r = modq(prefix, msg);
        byte[] Rs = compress(mul(r, G));
        BigInteger hh = modq(Rs, A, msg);
        BigInteger s = r.add(hh.multiply(a)).mod(Q);
        byte[] out = new byte[64];
        System.arraycopy(Rs, 0, out, 0, 32);
        System.arraycopy(toLE(s, 32), 0, out, 32, 32);
        return out;
    }

    /** true nếu chữ ký 64 byte đúng với khóa công khai 32 byte (sai định dạng -> false) */
    static boolean verify(byte[] pub, byte[] msg, byte[] sig) {
        try {
            if (pub.length != 32 || sig.length != 64) return false;
            BigInteger[] A = decompress(pub);
            if (A == null) return false;
            byte[] Rs = Arrays.copyOfRange(sig, 0, 32);
            BigInteger[] R = decompress(Rs);
            if (R == null) return false;
            BigInteger s = fromLE(Arrays.copyOfRange(sig, 32, 64));
            if (s.compareTo(Q) >= 0) return false;
            BigInteger h = modq(Rs, pub, msg);
            return equal(mul(s, G), add(R, mul(h, A)));
        } catch (Exception e) {
            return false;
        }
    }
}
