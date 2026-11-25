// SPDX-License-Identifier: BSD-2-Clause
//
// A JavaScript translation of TRE as Apple Libc ships it.
// Copyright (c) 2001-2009 Ville Laurikari <vl@iki.fi>. All rights reserved.
// Distributed under the licence in licenses/TRE-LICENSE.txt.
//
// tre_internal.js -- the constants and C-locale character tables that the
// port of macOS's regex shares: js/tre_parse.js, js/tre_compile.js,
// js/tre_match_parallel.js, js/regcomp.js, js/regexec.js and
// js/regerror.js.
//
// The judge's recorder ran on macOS, where sys/share/posixregex.c reaches
// Apple Libc's regcomp(), regexec() and regerror(): TRE (Ville Laurikari's
// regex library, as Apple adapted it) for the first two and FreeBSD's
// regerror.c for the third. The source is
// https://github.com/apple-oss-distributions/Libc, tag Libc-1752.120.2.
// Each constant below names the header it comes from. Only the values
// NetHack's configuration reaches are kept: regcomp() flags
// REG_EXTENDED | REG_NOSUB, regexec() flags 0, and the "C" locale, because
// NetHack never calls setlocale() on the Unix tty path.

// include/_regex.h: regcomp() and regexec() results. Codes 1 to 13 equal
// glibc's; 14 to 18 are BSD's.
export const REG_OK = 0;
export const REG_NOMATCH = REG_OK + 1;
export const REG_BADPAT = REG_NOMATCH + 1;
export const REG_ECOLLATE = REG_BADPAT + 1;
export const REG_ECTYPE = REG_ECOLLATE + 1;
export const REG_EESCAPE = REG_ECTYPE + 1;
export const REG_ESUBREG = REG_EESCAPE + 1;
export const REG_EBRACK = REG_ESUBREG + 1;
export const REG_EPAREN = REG_EBRACK + 1;
export const REG_EBRACE = REG_EPAREN + 1;
export const REG_BADBR = REG_EBRACE + 1;
export const REG_ERANGE = REG_BADBR + 1;
export const REG_ESPACE = REG_ERANGE + 1;
export const REG_BADRPT = REG_ESPACE + 1;
export const REG_EMPTY = REG_BADRPT + 1;
export const REG_ASSERT = REG_EMPTY + 1;
export const REG_INVARG = REG_ASSERT + 1;
export const REG_ILLSEQ = REG_INVARG + 1;
export const REG_BADMAX = REG_ILLSEQ + 1;

// include/_regex.h: the regcomp() flags posixregex.c passes, and
// REG_ENHANCED, which it does not. tre-parse.c tests REG_ENHANCED at every
// GNU-style extension (\w, \b, \1, (?i), minimal repetition); without it
// those are literal characters or errors.
export const REG_EXTENDED = 0o1;
export const REG_NOSUB = 0o4;
export const REG_ENHANCED = 0o400;

// tre.h: RE_DUP_MAX is redefined as 255, the largest bound in {m,n}.
export const RE_DUP_MAX = 255;

// tre-internal.h: TRE_CHAR_MAX is WCHAR_MAX, and macOS's wchar_t is a
// 32-bit int.
export const TRE_CHAR_MAX = 0x7fffffff;
// <limits.h>: INT_MAX, which tre_parse_int() caps a bound at.
export const TRE_INT_MAX = 0x7fffffff;

// tre-ast.h: node types and the special literal codes.
export const LITERAL = 0;
export const CATENATION = 1;
export const ITERATION = 2;
export const UNION = 3;
export const EMPTY = -1;
export const ASSERTION = -2;
// tre-ast.h: SUBMATCH_ID_INVISIBLE_START is INT_MAX / 2 + 1.
export const SUBMATCH_ID_INVISIBLE_START = 0x40000000;

// tre-internal.h: assertion bits on positions and transitions. ASSERT_AT_WB,
// ASSERT_AT_WB_NEG and ASSERT_BACKREF come only from REG_ENHANCED (\b, \B)
// or a back reference, which an extended regex without REG_ENHANCED cannot
// write, so they are left out.
export const ASSERT_AT_BOL = 1;
export const ASSERT_AT_EOL = 2;
export const ASSERT_BRACKET_MATCH = 4;
export const ASSERT_AT_BOW = 8;
export const ASSERT_AT_EOW = 16;

// tre-internal.h: tre_bracket_match_type_t and the negation flag.
export const TRE_BRACKET_MATCH_TYPE_CHAR = 1;
export const TRE_BRACKET_MATCH_TYPE_RANGE_BEGIN = TRE_BRACKET_MATCH_TYPE_CHAR + 1;
export const TRE_BRACKET_MATCH_TYPE_RANGE_END = TRE_BRACKET_MATCH_TYPE_RANGE_BEGIN + 1;
export const TRE_BRACKET_MATCH_TYPE_CLASS = TRE_BRACKET_MATCH_TYPE_RANGE_END + 1;
export const TRE_BRACKET_MATCH_TYPE_EQUIVALENCE = TRE_BRACKET_MATCH_TYPE_CLASS + 1;
export const TRE_BRACKET_MATCH_FLAG_NEGATE = 1;

// include/_ctype.h: the rune-type bits that wctype_l() returns.
const CTYPE_A = 0x100; // alpha
const CTYPE_C = 0x200; // control
const CTYPE_D = 0x400; // digit
const CTYPE_G = 0x800; // graph
const CTYPE_L = 0x1000; // lower
const CTYPE_P = 0x2000; // punct
const CTYPE_S = 0x4000; // space
const CTYPE_U = 0x8000; // upper
const CTYPE_X = 0x10000; // xdigit
const CTYPE_B = 0x20000; // blank
const CTYPE_R = 0x40000; // print
const CTYPE_I = 0x80000; // ideogram
const CTYPE_T = 0x100000; // special
const CTYPE_Q = 0x200000; // phonogram

// locale/FreeBSD/table.c: _DefaultRuneLocale.__runetype[], the "C"
// locale's classes. The table lists bytes 0x00 to 0x7f, each run below
// sharing one value (the low bits holding a digit's value are left out,
// since no class mask covers them); bytes 0x80 to 0xff are zero and so
// belong to no class.
const RUNETYPE = new Int32Array(256);
for (const [first, last, bits] of [
    [0x00, 0x08, CTYPE_C],
    [0x09, 0x09, CTYPE_C | CTYPE_S | CTYPE_B],
    [0x0a, 0x0d, CTYPE_C | CTYPE_S],
    [0x0e, 0x1f, CTYPE_C],
    [0x20, 0x20, CTYPE_S | CTYPE_B | CTYPE_R],
    [0x21, 0x2f, CTYPE_P | CTYPE_R | CTYPE_G],
    [0x30, 0x39, CTYPE_D | CTYPE_R | CTYPE_G | CTYPE_X],
    [0x3a, 0x40, CTYPE_P | CTYPE_R | CTYPE_G],
    [0x41, 0x46, CTYPE_U | CTYPE_X | CTYPE_R | CTYPE_G | CTYPE_A],
    [0x47, 0x5a, CTYPE_U | CTYPE_R | CTYPE_G | CTYPE_A],
    [0x5b, 0x60, CTYPE_P | CTYPE_R | CTYPE_G],
    [0x61, 0x66, CTYPE_L | CTYPE_X | CTYPE_R | CTYPE_G | CTYPE_A],
    [0x67, 0x7a, CTYPE_L | CTYPE_R | CTYPE_G | CTYPE_A],
    [0x7b, 0x7e, CTYPE_P | CTYPE_R | CTYPE_G],
    [0x7f, 0x7f, CTYPE_C],
]) {
    for (let c = first; c <= last; c++) RUNETYPE[c] = bits;
}

// locale/FreeBSD/wctype.c wctype_l(): a class name's mask, or 0 for a name
// it does not know. The "C" locale defines no extra classes, so the lookup
// ends at this table. "rune" is 0xFFFFFF00 in C; as a signed 32-bit value
// it is -256, and its bits still cover every class bit above.
const WCTYPE_PROPS = new Map([
    ['alnum', CTYPE_A | CTYPE_D],
    ['alpha', CTYPE_A],
    ['blank', CTYPE_B],
    ['cntrl', CTYPE_C],
    ['digit', CTYPE_D],
    ['graph', CTYPE_G],
    ['lower', CTYPE_L],
    ['print', CTYPE_R],
    ['punct', CTYPE_P],
    ['space', CTYPE_S],
    ['upper', CTYPE_U],
    ['xdigit', CTYPE_X],
    ['ideogram', CTYPE_I],
    ['special', CTYPE_T],
    ['phonogram', CTYPE_Q],
    ['rune', 0xffffff00 | 0],
]);

/** wctype_l(name, C locale): the class mask, or 0 if the name is unknown. */
export function tre_ctype(name) {
    return WCTYPE_PROPS.get(name) ?? 0;
}

/** iswctype_l(c, mask, C locale) for a byte value c. */
export function tre_isctype(c, mask) {
    return c >= 0 && c < 256 && (RUNETYPE[c] & mask) !== 0;
}

/** iswalnum_l(c, C locale). */
export function tre_isalnum(c) {
    return tre_isctype(c, CTYPE_A | CTYPE_D);
}
