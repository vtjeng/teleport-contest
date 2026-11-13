// hacklib.js — Utility functions.
// C refs: hacklib.c.

import { recordArgumentMisuse } from './gstate.js';

const utf8Encoder = new TextEncoder();

// C keeps many lists as chains and links each new record onto the front,
// `x->next = head; head = x;`, so whatever walks the list meets the newest
// record first. Where the port keeps such a list as an array, its head is
// index 0 and this is the one way to add a record, so a forward walk of the
// array meets the records in C's order. scripts/front-pushed-lists.test.mjs
// fails when a port of a C front push builds its list another way, or when
// js/ calls unshift() anywhere but here.
export function push_front(list, item) {
    list.unshift(item);
    return list;
}

// C integer.h AppendLongDigit for the recorded signed 64-bit-long profile.
// Callers decide how to reset a count when the source reports overflow.
export function appendLongDigit(value, digitValue) {
    const appended = value * 10n + BigInt(digitValue);
    return appended > 9223372036854775807n ? -1n : appended;
}

// Text the game reads or builds is a byte string: one JavaScript code unit
// per C char, each from 0 to 0xFF, the way C holds it in a char array. The
// player's typed keys arrive one byte each, and nethackrc lines, getlin()
// answers and data-file text all become byte strings where they enter, so
// .length, indexing, slice() and comparisons count and order C's bytes.
// Unicode appears only on its way to the screen, where a UTF-8 capture
// decodes it (tty_rawprint.js), or as a symbol set's display glyph.
// scripts/byte-text.test.mjs keeps every source of text on this convention.

// The UTF-8 bytes of a JavaScript string, as the recorder writes a nethackrc
// and as wintty.c prints a Unicode glyph. Only the nethackrc reader and the
// glyph writers call it; text already held as bytes goes through
// textBytes() instead.
export function encodeUtf8Text(value) {
    return Array.from(utf8Encoder.encode(String(value)));
}

// The byte string of a Unicode string's UTF-8 form. A symbol set's display
// glyph (a DECgraphics box character, a UTF8 or IBM symbol) is Unicode, and
// C's mixed_to_utf8() puts its utf8str bytes into the text it passes to
// tty_putstr(); tests also write typed or configured text this way.
export function utf8Text(text) {
    return bytesText(encodeUtf8Text(text));
}

// The byte string holding C's bytes.
export function bytesText(bytes) {
    let text = '';
    for (const byte of bytes) {
        if (!Number.isInteger(byte) || byte < 0 || byte > 0xFF)
            throw new RangeError(`bytesText(): ${byte} is not a byte`);
        text += String.fromCharCode(byte);
    }
    return text;
}

// The C bytes a byte string holds. A code unit above 0xFF is decoded text
// that reached a C byte operation and has no byte value. Tests and local
// replays throw on it (js/gstate.js recordArgumentMisuse()); a game the judge
// drives records it, so the local scorers fail that game, and goes on with
// the character's UTF-8 bytes.
export function textBytes(value) {
    const text = String(value);
    const bytes = [];
    for (let index = 0; index < text.length; ++index) {
        const unit = text.charCodeAt(index);
        if (unit <= 0xFF) {
            bytes.push(unit);
            continue;
        }
        const ch = String.fromCodePoint(text.codePointAt(index));
        recordArgumentMisuse('byteText',
            `textBytes(): code unit 0x${unit.toString(16)} is not a byte`,
            (detail) => new RangeError(detail));
        bytes.push(...encodeUtf8Text(ch));
        index += ch.length - 1;
    }
    return bytes;
}

// Cut a byte string at a byte offset, the unit every fixed C buffer and
// every "%.Ns" precision counts.
export function truncateByteString(value, limit) {
    return String(value).slice(0, limit);
}

// hacklib.c's string helpers edit a caller-supplied buffer in place and return
// it.  JavaScript strings are immutable, so each one below takes a string and
// returns the edited string; callers use the returned buffer either way.  The
// ones returning a rotating static buffer in C (s_suffix, ing_suffix, visctrl,
// sitoa) return a fresh string, which is what their callers read immediately.
//
// c_eos(), strkitten(), and copynchars() only expose C pointer operations
// whose selected callers are still outside this port. strcasecpy() takes the
// offset its callers reach by pointer arithmetic.

// C ref: hacklib.c eos() (194-199). JS strings are immutable, so return the
// byte offset of the first NUL terminator rather than a pointer.
export function eos(value) {
    const bytes = textBytes(value);
    let offset = 0;
    while (offset < bytes.length && bytes[offset] !== 0) ++offset;
    return offset;
}
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

// Game code changes and compares letter case only through this file:
// lowc(), highc(), lcase(), ucase(), upstart(), strcmpi(), strncmpi(),
// strstri() and fuzzymatch(), and the "C" locale's <ctype.h> isupper() and
// islower(). C never calls setlocale(), so these change the bytes 'A'-'Z'
// and 'a'-'z' and nothing else, while JavaScript's toLowerCase(),
// toUpperCase(), localeCompare() and the /i regular-expression flag also
// change other letters: the byte 0xC9 is 'É' to them, and
// 'ß'.toUpperCase() is "SS". scripts/ascii-case.test.mjs fails when js/
// uses one of those outside its allowlist.

// C ref: hacklib.c lcase().
export function lcase(s) {
    return s.replace(/[A-Z]/gu, lowc);
}

// C ref: hacklib.c ucase().
export function ucase(s) {
    return s.replace(/[a-z]/gu, highc);
}

// <ctype.h> isupper() in the "C" locale.
export function isupper(c) {
    return c >= 'A' && c <= 'Z';
}

// <ctype.h> islower() in the "C" locale.
export function islower(c) {
    return c >= 'a' && c <= 'z';
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
    if (strcmpi(s, 'it') === 0) return `${s}s`;
    if (strcmpi(s, 'you') === 0) return `${s}r`;
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
            && lcase(buf.slice(-tail.length)) === tail) {
            const at = buf.lastIndexOf(' ');
            onoff = buf.slice(at);
            buf = buf.slice(0, at);
            break;
        }
    }
    const n = buf.length;
    if (n >= 2 && lcase(buf.slice(-2)) === 'er') {
        // slither -> slithering; no stem change.
    } else if (n >= 3 && !vowel.includes(buf[n - 1])
               && vowel.includes(buf[n - 2])
               && !vowel.includes(buf[n - 3])) {
        buf += buf[n - 1]; // tip -> tipp
    } else if (n >= 2 && lcase(buf.slice(-2)) === 'ie') {
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

// C ref: hacklib.c strncmpi(). Compare at most `n` source characters,
// stopping at either NUL terminator, with lowc()'s ASCII-only case fold.
// strcmpi() passes -1, which keeps C's while(n--) running through NUL.
export function strncmpi(s1, s2, n) {
    let remaining = Math.trunc(n);
    let index = 0;
    while (remaining-- !== 0) {
        const c1 = s1?.[index] ?? '\0';
        const c2 = s2?.[index] ?? '\0';
        if (c2 === '\0') return c1 === '\0' ? 0 : 1;
        if (c1 === '\0') return -1;
        const t1 = lowc(c1);
        const t2 = lowc(c2);
        if (t1 !== t2) return t1 > t2 ? 1 : -1;
        index++;
    }
    return 0;
}

// C ref: global.h strcmpi(), which is strncmpi() with a count of -1.
export function strcmpi(s1, s2) {
    return strncmpi(s1, s2, -1);
}

// C ref: hacklib.c swapbits(). Swaps bit a with bit b in val.
export function swapbits(val, bita, bitb) {
    const tmp = ((val >> bita) & 1) ^ ((val >> bitb) & 1);
    return val ^ ((tmp << bita) | (tmp << bitb));
}

// C ref: nethack-c/patches/002-deterministic-qsort.patch, hacklib.c
// nh_deterministic_qsort(). The patched program replaces every qsort() with
// this wrapper: it sorts an array of element indexes with the C library's
// qsort(), breaking comparator ties by original index, then permutes the
// elements. The recorder's glibc qsort() is msort.c's top-down merge sort
// (msort_with_tmp(): sort the first n/2, then the rest, then merge, taking
// the left element while the comparison is <= 0). A comparator with side
// effects, such as invent.c sortloot_cmp(), whose lazy loot_classify()
// marks objects encountered, therefore runs in that merge order; this
// reproduces both the sorted result and the order of comparator calls.
// Sorts `array` in place and returns it.
export function nh_deterministic_qsort(array, compar) {
    const n = array.length;
    if (n < 2) return array;
    const order = Array.from({ length: n }, (_, i) => i);
    const tmp = new Array(n);
    const idxCmp = (a, b) => {
        const c = compar(array[a], array[b]);
        if (c) return c;
        return a < b ? -1 : (a > b ? 1 : 0);
    };
    const msort = (lo, count) => {
        if (count <= 1) return;
        let n1 = count >> 1;
        let n2 = count - n1;
        msort(lo, n1);
        msort(lo + n1, n2);
        let b1 = lo;
        let b2 = lo + n1;
        let k = 0;
        while (n1 > 0 && n2 > 0) {
            if (idxCmp(order[b1], order[b2]) <= 0) {
                tmp[k++] = order[b1++];
                --n1;
            } else {
                tmp[k++] = order[b2++];
                --n2;
            }
        }
        while (n1-- > 0) tmp[k++] = order[b1++];
        // Whatever remains of the second run is already in place.
        for (let i = 0; i < k; ++i) order[lo + i] = tmp[i];
    };
    msort(0, n);
    const sorted = order.map((i) => array[i]);
    for (let i = 0; i < n; ++i) array[i] = sorted[i];
    return array;
}

// C ref: rn2(x) already in rng.js — re-export not needed
