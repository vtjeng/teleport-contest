// Port of options.c:escapes() and its local digit decoding.

import { encodeUtf8ByteString } from './hacklib.js';

function digitValue(byte, radix) {
    if (byte >= 0x30 && byte <= 0x39) {
        const value = byte - 0x30;
        return value < radix ? value : -1;
    }
    if (radix === 16 && byte >= 0x41 && byte <= 0x46) return byte - 0x37;
    if (radix === 16 && byte >= 0x61 && byte <= 0x66) return byte - 0x57;
    return -1;
}

// The source mutates a C string in place; a byte array preserves the same
// expansion without losing embedded NUL or bytes above ASCII. Callers which
// consume a C string still stop at the first NUL.
export function escapes(value) {
    const bytes = Array.isArray(value)
        ? value.map((byte) => byte & 0xFF)
        : encodeUtf8ByteString(String(value ?? ''));
    const expanded = [];
    let index = 0;

    while (index < bytes.length && bytes[index] !== 0) {
        let meta = false;
        if (bytes[index] === 0x5C
            && (bytes[index + 1] === 0x6D || bytes[index + 1] === 0x4D)
            && bytes[index + 2]) {
            meta = true;
            index += 2;
        }

        let valueByte = 0;
        const prefix = bytes[index];
        const next = bytes[index + 1];
        if ((prefix !== 0x5C && prefix !== 0x5E) || !next) {
            valueByte = prefix;
            ++index;
        } else if (prefix === 0x5E) {
            valueByte = next & 0x1F;
            index += 2;
        } else {
            let radix = 0;
            let digitIndex = index + 1;
            let digitLimit = 0;
            if (digitValue(next, 10) >= 0) {
                radix = 10;
                digitLimit = 3;
            } else if ((next === 0x6F || next === 0x4F)
                       && digitValue(bytes[index + 2], 8) >= 0) {
                radix = 8;
                digitIndex = index + 2;
                digitLimit = 3;
            } else if ((next === 0x78 || next === 0x58)
                       && digitValue(bytes[index + 2], 16) >= 0) {
                radix = 16;
                digitIndex = index + 2;
                digitLimit = 2;
            }
            if (radix) {
                let digits = 0;
                while (digits < digitLimit && digitIndex < bytes.length) {
                    const digit = digitValue(bytes[digitIndex], radix);
                    if (digit < 0) break;
                    valueByte = valueByte * radix + digit;
                    ++digitIndex;
                    ++digits;
                }
                index = digitIndex;
            } else {
                valueByte = {
                    0x6E: 0x0A,
                    0x74: 0x09,
                    0x62: 0x08,
                    0x72: 0x0D,
                }[next] ?? next;
                index += 2;
            }
        }
        if (meta) valueByte |= 0x80;
        expanded.push(valueByte & 0xFF);
    }
    return expanded;
}
