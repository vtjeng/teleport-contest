// SPDX-License-Identifier: BSD-2-Clause
//
// A JavaScript translation of TRE as Apple Libc ships it.
// Copyright (c) 2001-2009 Ville Laurikari <vl@iki.fi>. All rights reserved.
// Distributed under the licence in licenses/TRE-LICENSE.txt.
//
// regcomp.js -- Apple Libc regex/TRE/lib/regcomp.c (tag Libc-1752.120.2)
// tre_regcomp(), which macOS exports as regcomp(). See js/tre_internal.js
// for the source and the configuration this port keeps.
//
// sys/share/posixregex.c regex_compile() calls
// regcomp(&re->re, s, REG_EXTENDED | REG_NOSUB). In the "C" locale
// (MB_CUR_MAX 1) tre_regncomp_l() widens each byte of the pattern to one
// character without decoding it, and tre_compile() (js/tre_compile.js)
// parses and compiles the result.
import { tre_compile } from './tre_compile.js';
import { REG_EXTENDED, REG_NOSUB } from './tre_internal.js';

/**
 * regcomp(pattern, REG_EXTENDED | REG_NOSUB) for a byte string (one byte,
 * U+0000 to U+00FF, per character). Returns { err, preg }: err is 0 or the
 * regcomp() error code, and preg the compiled automaton when err is 0.
 */
export function regcomp(pattern) {
    // tre_regcomp_l(): the pattern ends at its first NUL (strlen()).
    const codes = [];
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern.charCodeAt(i);
        if (c === 0) break;
        codes.push(c);
    }
    const n = codes.length;
    // tre_regncomp_l() terminates the widened copy with a NUL.
    codes.push(0);
    const { err, tnfa } = tre_compile(codes, n, REG_EXTENDED | REG_NOSUB);
    return { err, preg: tnfa };
}
