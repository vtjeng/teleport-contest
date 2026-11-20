// posixregex.js -- sys/share/posixregex.c: NetHack's nhregex interface over
// libc regcomp()/regexec()/regerror().
//
// NetHack hands MENUCOLOR, MSGTYPE and AUTOPICKUP_EXCEPTION patterns, from
// the config file or typed in the options menu, to these functions:
// coloratt.c add_menu_coloring_parsed(), options.c msgtype_add(),
// test_regex_pattern() and add_autopickup_exception(), and the matches in
// windows.c get_menu_coloring(), options.c msgtype_type() and pickup.c
// check_autopickup_exceptions().
// The judge's recorder ran on macOS, so the port follows macOS's C
// library: Apple Libc's TRE regex (js/regcomp.js, js/regexec.js) and
// FreeBSD's regerror() (js/regerror.js). js/tre_internal.js names the
// source. Where macOS and glibc differ, in error texts, in the patterns
// each accepts and in what \w, \1 or {,n} mean, this follows macOS;
// docs/testing.md, "The regex difference", lists the differences.
//
// NetHack never calls setlocale() on the Unix tty path, so libc runs in the
// "C" locale: one byte is one character, the character classes hold ASCII
// bytes only, and a bracket range compares byte values. The pattern and
// text are therefore passed as byte strings, one UTF-8 byte per JS
// character (toByteString()).

import { textBytes } from './hacklib.js';
import { regcomp } from './regcomp.js';
import { regerror } from './regerror.js';
import { regexec } from './regexec.js';

// The C string's bytes, each as one JS character from U+0000 to U+00FF.
function toByteString(value) {
    return String.fromCharCode(...textBytes(value));
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
