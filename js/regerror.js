// SPDX-License-Identifier: BSD-3-Clause
//
// A JavaScript translation of FreeBSD regex's regerror.c as Apple Libc
// ships it. Copyright (c) 1992, 1993, 1994 Henry Spencer. Copyright (c)
// 1992, 1993, 1994 The Regents of the University of California. All rights
// reserved. Distributed under the licence in
// licenses/FreeBSD-regex-LICENSE.txt.
//
// regerror.js -- Apple Libc regex/FreeBSD/regerror.c (tag
// Libc-1752.120.2) regerror(), which macOS uses with TRE. See
// js/tre_internal.js for the source.
//
// sys/share/posixregex.c regex_error_desc() calls
// regerror(re->err, &re->re, errbuf, BUFSZ); every text below is shorter
// than BUFSZ, so none is cut. The REG_ATOI and REG_ITOA requests are never
// made.
import {
    REG_ASSERT,
    REG_BADBR,
    REG_BADMAX,
    REG_BADPAT,
    REG_BADRPT,
    REG_EBRACE,
    REG_EBRACK,
    REG_ECOLLATE,
    REG_ECTYPE,
    REG_EESCAPE,
    REG_EMPTY,
    REG_EPAREN,
    REG_ERANGE,
    REG_ESPACE,
    REG_ESUBREG,
    REG_ILLSEQ,
    REG_INVARG,
    REG_NOMATCH,
    RE_DUP_MAX,
} from './tre_internal.js';

// rerrs[]: each code's explanation. REG_BADMAX's text ends with
// xstr(RE_DUP_MAX), which <limits.h> on macOS defines as 255.
const RERRS = new Map([
    [REG_NOMATCH, 'regexec() failed to match'],
    [REG_BADPAT, 'invalid regular expression'],
    [REG_ECOLLATE, 'invalid collating element'],
    [REG_ECTYPE, 'invalid character class'],
    [REG_EESCAPE, 'trailing backslash (\\)'],
    [REG_ESUBREG, 'invalid backreference number'],
    [REG_EBRACK, 'brackets ([ ]) not balanced'],
    [REG_EPAREN, 'parentheses not balanced'],
    [REG_EBRACE, 'braces not balanced'],
    [REG_BADBR, 'invalid repetition count(s)'],
    [REG_ERANGE, 'invalid character range'],
    [REG_ESPACE, 'out of memory'],
    [REG_BADRPT, 'repetition-operator operand invalid'],
    [REG_EMPTY, 'empty (sub)expression'],
    [REG_ASSERT, '"can\'t happen" -- you found a bug'],
    [REG_INVARG, 'invalid argument to regex routine'],
    [REG_ILLSEQ, 'illegal byte sequence'],
    [REG_BADMAX, `maximum repetition exceeds ${RE_DUP_MAX}`],
]);

/** regerror(errcode, preg, errbuf, BUFSZ)'s text. */
export function regerror(errcode) {
    return RERRS.get(errcode) ?? '*** unknown regexp error code ***';
}
