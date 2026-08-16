// hacklib.js — Utility functions.
// C ref: hacklib.c

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

// Cut a string at a byte offset, the unit every fixed C buffer and every
// "%.Ns" precision counts.  A cut inside a multibyte sequence keeps the bytes
// it leaves behind, because decodeUtf8ByteString() escapes each one.
export function truncateByteString(value, limit) {
    return decodeUtf8ByteString(encodeUtf8ByteString(value).slice(0, limit));
}

// hacklib.c's string helpers edit a caller-supplied buffer in place and return
// it.  JavaScript strings are immutable, so each one below takes a string and
// returns the edited string; callers use the returned buffer either way.  The
// ones returning a rotating static buffer in C (s_suffix, ing_suffix, visctrl,
// sitoa) return a fresh string, which is what their callers read immediately.
//
// Not ported, because they exist only to manipulate C pointers and have no
// behavior to reproduce: eos(), c_eos(), strkitten(), and copynchars().
// strcasecpy() takes the offset its callers reach by pointer arithmetic.

// C ref: hacklib.c BUFSZ truncation limit for tabexpand() and stripchars().
// Duplicated rather than imported, matching this file's existing avoidance of a
// const.js import cycle.
const BUFSZ = 256;

// C ref: hacklib.c digit().
export function digit(c) {
    return c >= '0' && c <= '9';
}

// C ref: hacklib.c letter().  '@' counts as a letter, so the first range runs
// '@' through 'Z' and excludes '[' through '_'.
export function letter(c) {
    return (c >= '@' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

// C ref: hacklib.c highc().  Clears bit 040 only for 'a'-'z'.
export function highc(c) {
    return (c >= 'a' && c <= 'z')
        ? String.fromCharCode(c.charCodeAt(0) & ~0o40) : c;
}

// C ref: hacklib.c lowc().  Sets bit 040 only for 'A'-'Z'.
export function lowc(c) {
    return (c >= 'A' && c <= 'Z')
        ? String.fromCharCode(c.charCodeAt(0) | 0o40) : c;
}

// C ref: hacklib.c lcase().
export function lcase(s) {
    let out = '';
    for (const ch of s) out += (ch >= 'A' && ch <= 'Z') ? lowc(ch) : ch;
    return out;
}

// C ref: hacklib.c ucase().
export function ucase(s) {
    let out = '';
    for (const ch of s) out += (ch >= 'a' && ch <= 'z') ? highc(ch) : ch;
    return out;
}

// C ref: hacklib.c upstart().
export function upstart(s) {
    if (!s) return s;
    return highc(s[0]) + s.slice(1);
}

// C ref: hacklib.c upwords().  Only a space starts a new word, and only a
// letter() is capitalized, so "it's" keeps its lowercase 's'.
export function upwords(s) {
    let out = '';
    let space = true;
    for (const ch of s) {
        if (ch === ' ') {
            space = true;
            out += ch;
        } else if (space && letter(ch)) {
            out += highc(ch);
            space = false;
        } else {
            out += ch;
            space = false;
        }
    }
    return out;
}

// C ref: hacklib.c mungspaces().  Collapses each run of spaces or tabs to one
// space, drops a leading and a trailing one, and truncates at the first
// newline.  C edits its buffer in place; this returns the shortened string.
export function mungspaces(bp) {
    let out = '';
    let was_space = true;
    for (const raw of bp) {
        if (raw === '\n') break; /* treat newline the same as end-of-string */
        const c = raw === '\t' ? ' ' : raw;
        if (c !== ' ' || !was_space) out += c;
        was_space = (c === ' ');
    }
    if (was_space && out.length > 0) out = out.slice(0, -1);
    return out;
}

// C ref: hacklib.c trimspaces().  Drops leading and trailing spaces and tabs.
export function trimspaces(txt) {
    let start = 0;
    while (start < txt.length
           && (txt[start] === ' ' || txt[start] === '\t')) ++start;
    let end = txt.length;
    while (end > start
           && (txt[end - 1] === ' ' || txt[end - 1] === '\t')) --end;
    return txt.slice(start, end);
}

// C ref: hacklib.c strip_newline().  Truncates at the LAST newline, taking a
// preceding carriage return with it.  Text after that newline is discarded.
export function strip_newline(str) {
    const at = str.lastIndexOf('\n');
    if (at < 0) return str;
    const cut = (at > 0 && str[at - 1] === '\r') ? at - 1 : at;
    return str.slice(0, cut);
}

// C ref: hacklib.c str_start_is().  True when chkstr is a prefix of str: when
// chkstr is the shorter of the two, because C returns TRUE the moment chkstr
// runs out, and when the two are equal, because C's `if (!*str) return
// (*chkstr == 0)` runs first and finds chkstr exhausted too.  A str shorter
// than chkstr answers FALSE from that same arm, so a truncated statement such
// as "cond" does not start with "cond_".
export function str_start_is(str, chkstr, caseblind) {
    for (let index = 0; ; ++index) {
        if (index >= str.length) return index >= chkstr.length;
        if (index >= chkstr.length) return true;
        const t1 = caseblind ? lowc(str[index]) : str[index];
        const t2 = caseblind ? lowc(chkstr[index]) : chkstr[index];
        if (t1 !== t2) return false;
    }
}

// C ref: hacklib.c str_end_is().
export function str_end_is(str, chkstr) {
    if (str.length < chkstr.length) return false;
    return str.slice(str.length - chkstr.length) === chkstr;
}

// C ref: hacklib.c str_lines_maxlen().  Longest newline-separated run.
export function str_lines_maxlen(str) {
    let maxLen = 0;
    let start = 0;
    while (start < str.length) {
        const at = str.indexOf('\n', start);
        const len = at < 0 ? str.length - start : at - start;
        if (len > maxLen) maxLen = len;
        if (at < 0) break;
        start = at + 1;
    }
    return maxLen;
}

// C ref: hacklib.c chrcasecpy().  Return nc in oc's case, leaving nc alone
// when oc is not a letter.
export function chrcasecpy(oc, nc) {
    if (oc >= 'a' && oc <= 'z') return (nc >= 'A' && nc <= 'Z') ? lowc(nc) : nc;
    if (oc >= 'A' && oc <= 'Z') return (nc >= 'a' && nc <= 'z') ? highc(nc) : nc;
    return nc;
}

// C ref: hacklib.c strcasecpy(). C's caller passes a pointer into dst; this
// port passes dst and that offset. Each character of src takes the case of the
// character it overwrites; once dst runs out, src takes the case of the last
// character written, which is what C's dst[-1] reads. C terminates the result
// where src ends, so anything after it in dst is dropped.
export function strcasecpy(dst, offset, src) {
    let out = dst.slice(0, offset);
    let exhausted = false;
    for (let index = 0; index < src.length; ++index) {
        const at = offset + index;
        if (!exhausted && at >= dst.length) exhausted = true;
        const oc = exhausted ? out[out.length - 1] : dst[at];
        out += chrcasecpy(oc ?? '', src[index]);
    }
    return out;
}

// C ref: hacklib.c s_suffix().  "it" and "you" are special-cased case-blind;
// a trailing 's' takes a bare apostrophe.
export function s_suffix(s) {
    if (s.toLowerCase() === 'it') return `${s}s`;
    if (s.toLowerCase() === 'you') return `${s}r`;
    if (s.slice(-1) === 's') return `${s}'`;
    return `${s}'s`;
}

// C ref: hacklib.c ing_suffix().  A trailing " on", " off", or " with" is set
// aside, the stem is adjusted, then "ing" and the preposition are reattached.
export function ing_suffix(s) {
    const vowel = 'aeiouwy';
    let buf = s;
    let onoff = '';
    for (const tail of [' on', ' off', ' with']) {
        if (buf.length >= tail.length
            && buf.slice(-tail.length).toLowerCase() === tail) {
            const at = buf.lastIndexOf(' ');
            onoff = buf.slice(at);
            buf = buf.slice(0, at);
            break;
        }
    }
    const n = buf.length;
    if (n >= 2 && buf.slice(-2).toLowerCase() === 'er') {
        // slither -> slithering; no stem change.
    } else if (n >= 3 && !vowel.includes(buf[n - 1])
               && vowel.includes(buf[n - 2])
               && !vowel.includes(buf[n - 3])) {
        buf += buf[n - 1]; // tip -> tipp
    } else if (n >= 2 && buf.slice(-2).toLowerCase() === 'ie') {
        buf = `${buf.slice(0, n - 2)}y`; // vie -> vy
    } else if (n >= 1 && buf[n - 1] === 'e') {
        buf = buf.slice(0, n - 1); // grease -> greas
    }
    return `${buf}ing${onoff}`;
}

// C ref: hacklib.c onlyspace().
export function onlyspace(s) {
    for (const ch of s) if (ch !== ' ' && ch !== '\t') return false;
    return true;
}

// C ref: hacklib.c tabexpand().  Tabs advance to the next multiple of 8, and
// the result is truncated to BUFSZ-1 characters.
export function tabexpand(sbuf) {
    if (!sbuf) return sbuf;
    let out = '';
    let idx = 0;
    for (const ch of sbuf) {
        if (ch === '\t') {
            do {
                out += ' ';
            } while (++idx % 8);
        } else {
            out += ch;
            ++idx;
        }
        if (idx >= BUFSZ) return out.slice(0, BUFSZ - 1);
    }
    return out;
}

// C ref: hacklib.c visctrl().  Renders a control byte as ^X, meta as M-, and
// 0177 as ^?.
export function visctrl(c) {
    let byte = typeof c === 'string' ? c.charCodeAt(0) : c;
    let out = '';
    if (byte & 0o200) out += 'M-';
    byte &= 0o177;
    if (byte < 0o40) out += `^${String.fromCharCode(byte | 0o100)}`;
    else if (byte === 0o177) out += `^${String.fromCharCode(byte & ~0o100)}`;
    else out += String.fromCharCode(byte);
    return out;
}

// C ref: hacklib.c stripchars().  Keeps at most BUFSZ-1 characters.
export function stripchars(stuffToStrip, orig) {
    let out = '';
    for (const ch of orig) {
        if (out.length >= BUFSZ - 1) break;
        if (!stuffToStrip.includes(ch)) out += ch;
    }
    return out;
}

// C ref: hacklib.c stripdigits().
export function stripdigits(s) {
    let out = '';
    for (const ch of s) if (ch < '0' || ch > '9') out += ch;
    return out;
}

// C ref: hacklib.c strsubst().  Replaces only the first occurrence.
export function strsubst(bp, orig, replacement) {
    const at = bp.indexOf(orig);
    if (at < 0) return bp;
    return bp.slice(0, at) + replacement + bp.slice(at + orig.length);
}

// C ref: hacklib.c strstri().  Case-insensitive substring search, answering
// the offset of the match rather than C's pointer to it, and -1 for no match.
// C's nibble-count tables are a shortcut that rejects impossible matches
// early; they change no answer, so the port keeps only the comparison loop.
export function strstri(str, sub) {
    if (!sub) return 0;
    // lcase() rather than toLowerCase(): C folds with lowc(), which touches
    // 'A'-'Z' and nothing else, so a non-ASCII byte must compare unchanged.
    return lcase(str).indexOf(lcase(sub));
}

// C ref: hacklib.c fuzzymatch().  Two strings match when they run out
// together, once every character of `ignore_chars` is skipped in both.
export function fuzzymatch(s1, s2, ignore_chars, caseblind) {
    let i = 0;
    let j = 0;
    let c1;
    let c2;
    do {
        // Indexing past the end answers undefined, which stands for the '\0'
        // C stops at; `?? ''` makes that sentinel the empty string the tests
        // below read.
        do {
            c1 = s1[i++] ?? '';
        } while (c1 !== '' && ignore_chars.includes(c1));
        do {
            c2 = s2[j++] ?? '';
        } while (c2 !== '' && ignore_chars.includes(c2));
        // Redundant with the `c1 === c2` test below whenever exactly one
        // string has run out, but it is what stops the loop when both have.
        if (!c1 || !c2) break; /* stop when end of either string is reached */

        if (caseblind) {
            c1 = lowc(c1);
            c2 = lowc(c2);
        }
    } while (c1 === c2);

    /* match occurs only when the end of both strings has been reached */
    return !c1 && !c2;
}

// C ref: hacklib.c ordin().  The teens all take "th".
export function ordin(n) {
    const dd = n % 10;
    if (dd === 0 || dd > 3 || Math.trunc((n % 100) / 10) === 1) return 'th';
    return dd === 1 ? 'st' : dd === 2 ? 'nd' : 'rd';
}

// C ref: hacklib.c sitoa().  Non-negative values carry an explicit '+'.
export function sitoa(n) {
    return n < 0 ? `${n}` : `+${n}`;
}

// C ref: hacklib.c sgn().
export function sgn(n) {
    return n < 0 ? -1 : (n !== 0 ? 1 : 0);
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

export function distmin(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

export function dist2(x1, y1, x2, y2) {
    return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
}

// C ref: hacklib.c isqrt().  Integer square root by repeated subtraction of
// the odd numbers, which is exactly how C computes it; a floating-point
// Math.sqrt() would round differently for a perfect square near the limit of
// double precision.
export function isqrt(val) {
    let rt = 0;
    let odd = 1;
    let remaining = val;
    while (remaining >= odd) {
        remaining -= odd;
        odd += 2;
        rt += 1;
    }
    return rt;
}

// C ref: hacklib.c online2(). Orthogonal and 45-degree diagonal lines count.
export function online2(x0, y0, x1, y1) {
    const dx = x0 - x1;
    const dy = y0 - y1;
    return !dy || !dx || dy === dx || dy === -dx;
}

// C ref: rn2(x) already in rng.js — re-export not needed
