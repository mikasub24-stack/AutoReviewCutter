"""One-shot SM3, implemented from the public algorithm specification.

Pure Python fallback for Windows Python builds whose OpenSSL does not expose SM3.
No external crypto package or browser runtime is required.
"""
import hashlib
import struct

_MASK = 0xffffffff
_IV = (0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
       0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e)


def _rol(x, n):
    n %= 32
    return ((x << n) | (x >> ((32 - n) % 32))) & _MASK


def sm3_python(data):
    data = bytes(data)
    length = len(data)
    data += b'\x80' + b'\0' * ((55 - length) % 64) + struct.pack('>Q', length * 8)
    state = _IV
    for offset in range(0, len(data), 64):
        words = list(struct.unpack('>16I', data[offset:offset + 64]))
        for j in range(16, 68):
            temp = words[j-16] ^ words[j-9] ^ _rol(words[j-3], 15)
            words.append((temp ^ _rol(temp, 15) ^ _rol(temp, 23) ^ _rol(words[j-13], 7) ^ words[j-6]) & _MASK)
        a, b, c, d, e, f, g, h = state
        for j in range(64):
            first = j < 16
            ff = a ^ b ^ c if first else (a & b) | (a & c) | (b & c)
            gg = e ^ f ^ g if first else (e & f) | ((~e) & g)
            ss1 = _rol((_rol(a, 12) + e + _rol(0x79cc4519 if first else 0x7a879d8a, j)) & _MASK, 7)
            tt1 = (ff + d + (ss1 ^ _rol(a, 12)) + (words[j] ^ words[j+4])) & _MASK
            tt2 = (gg + h + ss1 + words[j]) & _MASK
            a, b, c, d, e, f, g, h = (tt1, a, _rol(b, 9), c,
                                     tt2 ^ _rol(tt2, 9) ^ _rol(tt2, 17), e, _rol(f, 19), g)
        state = tuple(x ^ y for x, y in zip(state, (a, b, c, d, e, f, g, h)))
    return struct.pack('>8I', *state).hex()


def sm3_hex(data):
    try:
        return hashlib.new('sm3', bytes(data)).hexdigest()
    except ValueError:
        return sm3_python(data)
