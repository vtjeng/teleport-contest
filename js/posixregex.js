// posixregex.js -- sys/share/posixregex.c: NetHack's nhregex interface over
// libc regcomp()/regexec().
//
// The recorder links glibc 2.39, and regex_compile() calls regcomp() with
// REG_EXTENDED | REG_NOSUB. js/regcomp.js and js/regexec.js port glibc's
// implementation, so a pattern compiles, fails or matches exactly as it
// does there, backreferences included.
//
// NetHack never calls setlocale() on the Unix tty path, so libc runs in the
// "C" locale: one byte is one character, the character classes and \w hold
// ASCII bytes only, and a bracket range compares byte values. The pattern
// and text are therefore passed as byte strings, one UTF-8 byte per JS
// character (toByteString()).

import { encodeUtf8ByteString } from './hacklib.js';
import { regcomp, regerror } from './regcomp.js';
import { regexec } from './regexec.js';

// The C string's bytes, each as one JS character from U+0000 to U+00FF.
function toByteString(value) {
    return String.fromCharCode(...encodeUtf8ByteString(value));
}

// struct nhregex: the compiled regex_t and the last error code.
export function regex_init() {
    return { re: null, err: 0 };
}

export function regex_compile(s, re) {
    if (!re) return false;
    const { err, preg } = regcomp(toByteString(s));
    re.err = err;
    re.re = preg;
    return !err;
}

export function regex_error_desc(re) {
    if (!re) return 'no regexp';
    if (!re.err) return 'no explanation';
    return regerror(re.err) || 'unspecified regexp error';
}

export function regex_match(s, re) {
    // A regex_t that regcomp() rejected is never matched by NetHack's
    // callers; report no match rather than dereference it.
    if (!re || s == null || !re.re) return false;
    return regexec(re.re, toByteString(s)) === 0;
}
