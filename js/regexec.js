// SPDX-License-Identifier: BSD-2-Clause
//
// A JavaScript translation of TRE as Apple Libc ships it.
// Copyright (c) 2001-2009 Ville Laurikari <vl@iki.fi>. All rights reserved.
// Distributed under the licence in licenses/TRE-LICENSE.txt.
//
// regexec.js -- Apple Libc regex/TRE/lib/regexec.c (tag Libc-1752.120.2)
// tre_regexec() and tre_match(), which macOS exports as regexec(). See
// js/tre_internal.js for the source and the configuration this port keeps.
//
// sys/share/posixregex.c regex_match() calls
// regexec(&re->re, s, 0, NULL, 0). In the "C" locale the text is read as
// bytes (STR_BYTE). A pattern compiled without back references, which an
// extended regex cannot write, goes to the parallel matcher
// (js/tre_match_parallel.js); with REG_NOSUB nothing fills pmatch.
import { tre_tnfa_run_parallel } from './tre_match_parallel.js';

/**
 * regexec(preg, text, 0, NULL, 0) for a byte string: 0 (REG_OK) if the
 * compiled pattern matches some part of text, else REG_NOMATCH.
 */
export function regexec(preg, text) {
    const bytes = new Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return tre_tnfa_run_parallel(preg, bytes);
}
