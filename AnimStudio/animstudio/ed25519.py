# -*- coding: utf-8 -*-
"""Ed25519 (RFC 8032) thuan Python - khong can thu vien ngoai (de dong goi / kiem tra chu ky key ban quyen).
Cai dat theo ma tham chieu trong RFC 8032 muc 6; da doi chieu voi cac vector kiem tra cua RFC (xem selftest.py va devtools/test_license.py).
Chi dung cho kiem tra chu ky key (cham ~vai chuc mili giay), khong dung de ma hoa du lieu."""
import hashlib

P = 2 ** 255 - 19
Q = 2 ** 252 + 27742317777372353535851937790883648493


def _sha512(s):
    return hashlib.sha512(s).digest()


def _inv(x):
    return pow(x, P - 2, P)


D = -121665 * _inv(121666) % P
_SQRT_M1 = pow(2, (P - 1) // 4, P)


def _add(a, b):
    A, B = (a[1] - a[0]) * (b[1] - b[0]) % P, (a[1] + a[0]) * (b[1] + b[0]) % P
    C, Dd = 2 * a[3] * b[3] * D % P, 2 * a[2] * b[2] % P
    E, F, G, H = B - A, Dd - C, Dd + C, B + A
    return (E * F % P, G * H % P, F * G % P, E * H % P)


def _mul(s, pt):
    r = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            r = _add(r, pt)
        pt = _add(pt, pt)
        s >>= 1
    return r


def _equal(a, b):
    if (a[0] * b[2] - b[0] * a[2]) % P != 0:
        return False
    if (a[1] * b[2] - b[1] * a[2]) % P != 0:
        return False
    return True


def _recover_x(y, sign):
    if y >= P:
        return None
    x2 = (y * y - 1) * _inv(D * y * y + 1) % P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (P + 3) // 8, P)
    if (x * x - x2) % P != 0:
        x = x * _SQRT_M1 % P
    if (x * x - x2) % P != 0:
        return None
    if (x & 1) != sign:
        x = P - x
    return x


_GY = 4 * _inv(5) % P
_GX = _recover_x(_GY, 0)
G = (_GX, _GY, 1, _GX * _GY % P)


def _compress(pt):
    zi = _inv(pt[2])
    x, y = pt[0] * zi % P, pt[1] * zi % P
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _decompress(s):
    if len(s) != 32:
        return None
    y = int.from_bytes(s, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % P)


def _expand(secret):
    h = _sha512(secret)
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    return a, h[32:]


def _modq(s):
    return int.from_bytes(_sha512(s), "little") % Q


def public_key(secret):
    """32 byte khoa rieng -> 32 byte khoa cong khai."""
    if len(secret) != 32:
        raise ValueError("khoa rieng phai 32 byte")
    a, _ = _expand(secret)
    return _compress(_mul(a, G))


def sign(secret, msg):
    """Ky msg bang khoa rieng 32 byte -> chu ky 64 byte."""
    a, prefix = _expand(secret)
    A = _compress(_mul(a, G))
    r = _modq(prefix + msg)
    Rs = _compress(_mul(r, G))
    h = _modq(Rs + A + msg)
    s = (r + h * a) % Q
    return Rs + int.to_bytes(s, 32, "little")


def verify(public, msg, signature):
    """True neu chu ky 64 byte dung voi khoa cong khai 32 byte; sai dinh dang -> False (khong nem loi)."""
    try:
        if len(public) != 32 or len(signature) != 64:
            return False
        A = _decompress(public)
        if A is None:
            return False
        Rs = signature[:32]
        R = _decompress(Rs)
        if R is None:
            return False
        s = int.from_bytes(signature[32:], "little")
        if s >= Q:
            return False
        h = _modq(Rs + public + msg)
        return _equal(_mul(s, G), _add(R, _mul(h, A)))
    except Exception:
        return False


# Vector kiem tra cua RFC 8032 muc 7.1 (khoa rieng, khoa cong khai, thong diep, chu ky)
RFC_VECTORS = [
    ("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
     "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
     "",
     "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
    ("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
     "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
     "72",
     "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
]


def selfcheck():
    """Doi chieu voi cac vector RFC 8032 (khoa cong khai, chu ky). Tra ve None neu dung, nguoc lai la chuoi mo ta loi."""
    for sk, pk, msg, sg in RFC_VECTORS:
        sk, pk, msg, sg = bytes.fromhex(sk), bytes.fromhex(pk), bytes.fromhex(msg), bytes.fromhex(sg)
        if public_key(sk) != pk:
            return "khoa cong khai sai"
        if sign(sk, msg) != sg:
            return "chu ky sai"
        if not verify(pk, msg, sg):
            return "kiem tra chu ky that bai"
        bad = bytearray(sg)
        bad[5] ^= 1
        if verify(pk, msg, bytes(bad)):
            return "chap nhan chu ky bi sua"
    return None
