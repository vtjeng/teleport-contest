// C refs: strutil.c.

import { LARGEST_INT } from './const.js';
import { eos, encodeUtf8ByteString } from './hacklib.js';

// C ref: strutil.c Strlen_() (82-101). Unlike hacklib.c:eos(), this bounded
// byte count panics when no NUL appears before LARGEST_INT bytes. JavaScript
// strings are immutable, so eos supplies the byte count without a pointer.
export function Strlen_(str, file, line) {
    const length = eos(str);
    if (length >= LARGEST_INT)
        throw new RangeError(`${file}:${line} string too long`);
    return length;
}

// C lowc(): ASCII uppercase bytes alone change case.
function lowercaseAscii(byte) {
    return byte >= 65 && byte <= 90 ? byte + 32 : byte;
}

// C ref: strutil.c pmatch_internal() (105-142) and pmatchi() (152-155).
// Dynamic programming implements the same whole-string wildcard branches
// without recursion. C advances char pointers, so '?' consumes one UTF-8
// byte, and both operands stop at their first NUL.
export function pmatchi(pattern, text) {
    const patternBytes = encodeUtf8ByteString(pattern);
    const textBytes = encodeUtf8ByteString(text);
    const patternEnd = patternBytes.indexOf(0);
    const textEnd = textBytes.indexOf(0);
    const patternLength = patternEnd < 0 ? patternBytes.length : patternEnd;
    const textLength = textEnd < 0 ? textBytes.length : textEnd;
    let previous = new Array(textLength + 1).fill(false);
    previous[0] = true;
    for (let p = 0; p < patternLength; ++p) {
        const patternByte = patternBytes[p];
        const current = new Array(textLength + 1).fill(false);
        if (patternByte === 42) current[0] = previous[0]; // '*'
        for (let index = 1; index <= textLength; ++index) {
            if (patternByte === 42) {
                current[index] = previous[index] || current[index - 1];
            } else if (patternByte === 63 // '?'
                || lowercaseAscii(patternByte) === lowercaseAscii(textBytes[index - 1])) {
                current[index] = previous[index - 1];
            }
        }
        previous = current;
    }
    return previous[textLength];
}
