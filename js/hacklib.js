// hacklib.js — Utility functions.
// C ref: hacklib.c, dungeon.c helpers

import { game } from './gstate.js';

const utf8Encoder = new TextEncoder();

// Contest inputs are JavaScript strings which the recorder writes as UTF-8.
export function encodeUtf8Text(value) {
    return Array.from(utf8Encoder.encode(String(value)));
}

// Fixed C buffers can truncate a UTF-8 sequence.  Preserve each malformed
// byte as a low-surrogate escape so later byte-oriented operations can copy it
// without silently substituting U+FFFD.
export function decodeUtf8ByteString(bytes) {
    let decoded = '';
    for (let index = 0; index < bytes.length;) {
        const first = bytes[index];
        let length = 0;
        let codePoint = 0;
        if (first <= 0x7F) {
            length = 1;
            codePoint = first;
        } else if (first >= 0xC2 && first <= 0xDF
                   && bytes[index + 1] >= 0x80
                   && bytes[index + 1] <= 0xBF) {
            length = 2;
            codePoint = ((first & 0x1F) << 6)
                | (bytes[index + 1] & 0x3F);
        } else if (first >= 0xE0 && first <= 0xEF) {
            const second = bytes[index + 1];
            const third = bytes[index + 2];
            const validSecond = second >= 0x80 && second <= 0xBF
                && (first !== 0xE0 || second >= 0xA0)
                && (first !== 0xED || second <= 0x9F);
            if (validSecond && third >= 0x80 && third <= 0xBF) {
                length = 3;
                codePoint = ((first & 0x0F) << 12)
                    | ((second & 0x3F) << 6)
                    | (third & 0x3F);
            }
        } else if (first >= 0xF0 && first <= 0xF4) {
            const second = bytes[index + 1];
            const third = bytes[index + 2];
            const fourth = bytes[index + 3];
            const validSecond = second >= 0x80 && second <= 0xBF
                && (first !== 0xF0 || second >= 0x90)
                && (first !== 0xF4 || second <= 0x8F);
            if (validSecond
                && third >= 0x80 && third <= 0xBF
                && fourth >= 0x80 && fourth <= 0xBF) {
                length = 4;
                codePoint = ((first & 0x07) << 18)
                    | ((second & 0x3F) << 12)
                    | ((third & 0x3F) << 6)
                    | (fourth & 0x3F);
            }
        }

        if (length > 0) {
            decoded += String.fromCodePoint(codePoint);
            index += length;
        } else {
            decoded += String.fromCharCode(0xDC00 + first);
            index += 1;
        }
    }
    return decoded;
}

// Re-encode a string returned by decodeUtf8ByteString(), restoring its raw
// byte escapes while handling ordinary Unicode like TextEncoder.
export function encodeUtf8ByteString(value) {
    const text = String(value);
    const bytes = [];
    for (let index = 0; index < text.length; ++index) {
        const first = text.charCodeAt(index);
        if (first >= 0xDC80 && first <= 0xDCFF) {
            bytes.push(first - 0xDC00);
            continue;
        }

        let codePoint = first;
        if (first >= 0xD800 && first <= 0xDBFF
            && index + 1 < text.length) {
            const second = text.charCodeAt(index + 1);
            if (second >= 0xDC00 && second <= 0xDFFF) {
                codePoint = 0x10000
                    + ((first - 0xD800) << 10)
                    + (second - 0xDC00);
                index += 1;
            } else {
                codePoint = 0xFFFD;
            }
        } else if (first >= 0xD800 && first <= 0xDFFF) {
            codePoint = 0xFFFD;
        }

        if (codePoint <= 0x7F) {
            bytes.push(codePoint);
        } else if (codePoint <= 0x7FF) {
            bytes.push(
                0xC0 | (codePoint >> 6),
                0x80 | (codePoint & 0x3F),
            );
        } else if (codePoint <= 0xFFFF) {
            bytes.push(
                0xE0 | (codePoint >> 12),
                0x80 | ((codePoint >> 6) & 0x3F),
                0x80 | (codePoint & 0x3F),
            );
        } else {
            bytes.push(
                0xF0 | (codePoint >> 18),
                0x80 | ((codePoint >> 12) & 0x3F),
                0x80 | ((codePoint >> 6) & 0x3F),
                0x80 | (codePoint & 0x3F),
            );
        }
    }
    return bytes;
}

// C ref: hacklib.c xcrypt().  The five-bit mask advances for every byte,
// including bytes which are not transformed, and resets for each call.
export function xcrypt(text) {
    let bitmask = 1;
    let result = '';
    for (let index = 0; index < text.length; ++index) {
        let byte = text.charCodeAt(index);
        if (byte & (32 | 64)) byte ^= bitmask;
        bitmask <<= 1;
        if (bitmask >= 32) bitmask = 1;
        result += String.fromCharCode(byte);
    }
    return result;
}

export function isok(x, y) {
    const { COLNO, ROWNO } = await_const();
    return x >= 1 && x <= COLNO - 1 && y >= 0 && y <= ROWNO - 1;
}

// Lazy import to avoid circular deps
let _const = null;
function await_const() {
    if (!_const) _const = { COLNO: 80, ROWNO: 21 };
    return _const;
}

export function distmin(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

export function dist2(x1, y1, x2, y2) {
    return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
}

// C ref: hacklib.c online2(). Orthogonal and 45-degree diagonal lines count.
export function online2(x0, y0, x1, y1) {
    const dx = x0 - x1;
    const dy = y0 - y1;
    return !dy || !dx || dy === dx || dy === -dx;
}

export function depth(uz) {
    const dnum = uz?.dnum ?? 0;
    const dlevel = uz?.dlevel ?? 1;
    const dungeon = game?.dungeons?.[dnum];
    if (!dungeon) return dlevel;
    return (dungeon.depth_start || 1) + dlevel - 1;
}

// C ref: rn2(x) already in rng.js — re-export not needed
