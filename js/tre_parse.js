// SPDX-License-Identifier: BSD-2-Clause
//
// A JavaScript translation of TRE as Apple Libc ships it.
// Copyright (c) 2001-2009 Ville Laurikari <vl@iki.fi>. All rights reserved.
// Distributed under the licence in licenses/TRE-LICENSE.txt. The
// character-name table is FreeBSD regex's cname.h, Copyright (c) 1992, 1993,
// 1994 Henry Spencer and The Regents of the University of California,
// under licenses/FreeBSD-regex-LICENSE.txt.
//
// tre_parse.js -- Apple Libc regex/TRE/lib/tre-parse.c (tag
// Libc-1752.120.2), with the character-name table from
// regex/FreeBSD/cname.h: the recursive-descent parser that turns a pattern
// into a syntax tree, or into the error code that regerror() describes.
// See js/tre_internal.js for the source and the configuration this port
// keeps.
//
// posixregex.c regex_compile() passes REG_EXTENDED | REG_NOSUB, so the
// parser runs as an extended regex without REG_ENHANCED, REG_ICASE,
// REG_NEWLINE or REG_LITERAL. That decides most of what differs from glibc:
// - A backslash before any character makes that character literal
//   ("unenhanced_backslash" in tre_parse()): \w, \s, \b, \<, \( and \1 are
//   the characters w, s, b, <, ( and 1. glibc reads several as operators.
// - An empty branch is REG_EMPTY: "a|", "|a", "a||b", "(a|)", and an empty
//   pattern.
// - A repetition operator straight after another (a**, a+?, a{1}{2},
//   a{1}*) is REG_BADRPT, as is one with nothing to repeat (*a, ^*, (+a)).
// - In an extended regex, "{" not followed by a digit is a literal brace
//   (ERE_LITERAL_LBRACE_ON_NON_NUMERIC_BOUND): "a{,2}" is the text "a{,2}".
// - [[:<:]] and [[:>:]] are the start and end of a word.
// - [[.name.]] and [[=name=]] accept the names in cname.h, such as space.
// The parser keeps C's explicit stack and statement order, because the
// order in which it meets problems decides which error it reports.
//
// The "C" locale removes the multi-character collating-element path:
// __collate_equiv_value() answers 0 for any name longer than one character
// there (locale/FreeBSD/collate.c), so tre_parse_bracket_items() reports
// REG_ECOLLATE before it would collect one, and tre_parse_bracket() never
// re-parses. The macro expansion (\w as [[:alnum:]_]) and the (?i) and \Q
// extensions need REG_ENHANCED and are left out too.
import {
    tre_ast_new_catenation,
    tre_ast_new_iter,
    tre_ast_new_literal,
    tre_ast_new_union,
} from './tre_ast.js';
import {
    ASSERTION,
    ASSERT_AT_BOL,
    ASSERT_AT_BOW,
    ASSERT_AT_EOL,
    ASSERT_AT_EOW,
    EMPTY,
    ITERATION,
    LITERAL,
    REG_BADBR,
    REG_BADMAX,
    REG_BADRPT,
    REG_EBRACE,
    REG_EBRACK,
    REG_ECOLLATE,
    REG_ECTYPE,
    REG_EESCAPE,
    REG_EMPTY,
    REG_ENHANCED,
    REG_EPAREN,
    REG_ERANGE,
    REG_ESPACE,
    REG_EXTENDED,
    REG_NOMATCH,
    REG_OK,
    RE_DUP_MAX,
    SUBMATCH_ID_INVISIBLE_START,
    TRE_BRACKET_MATCH_FLAG_NEGATE,
    TRE_BRACKET_MATCH_TYPE_CHAR,
    TRE_BRACKET_MATCH_TYPE_CLASS,
    TRE_BRACKET_MATCH_TYPE_EQUIVALENCE,
    TRE_BRACKET_MATCH_TYPE_RANGE_BEGIN,
    TRE_BRACKET_MATCH_TYPE_RANGE_END,
    TRE_CHAR_MAX,
    TRE_INT_MAX,
    tre_ctype,
} from './tre_internal.js';

// Characters with special meanings in regexp syntax.
const CHAR_PIPE = 0x7c;
const CHAR_LPAREN = 0x28;
const CHAR_RPAREN = 0x29;
const CHAR_LBRACE = 0x7b;
const CHAR_RBRACE = 0x7d;
const CHAR_LBRACKET = 0x5b;
const CHAR_RBRACKET = 0x5d;
const CHAR_MINUS = 0x2d;
const CHAR_STAR = 0x2a;
const CHAR_QUESTIONMARK = 0x3f;
const CHAR_PLUS = 0x2b;
const CHAR_PERIOD = 0x2e;
const CHAR_COLON = 0x3a;
const CHAR_EQUAL = 0x3d;
const CHAR_COMMA = 0x2c;
const CHAR_CARET = 0x5e;
const CHAR_DOLLAR = 0x24;
const CHAR_BACKSLASH = 0x5c;
const CHAR_LESS = 0x3c;
const CHAR_GREATER = 0x3e;

// regex/FreeBSD/cname.h cnames[], in its order, which the binary search in
// tre_search_cnames() relies on. Index 0 is the sentinel.
const CNAMES = [
    ['', -1],
    ['ACK', 0o6], ['BEL', 0o7], ['BS', 0o10], ['CAN', 0o30], ['CR', 0o15],
    ['DC1', 0o21], ['DC2', 0o22], ['DC3', 0o23], ['DC4', 0o24], ['DEL', 0o177],
    ['DLE', 0o20], ['EM', 0o31], ['ENQ', 0o5], ['EOT', 0o4], ['ESC', 0o33],
    ['ETB', 0o27], ['ETX', 0o3], ['FF', 0o14], ['FS', 0o34], ['GS', 0o35],
    ['HT', 0o11], ['IS1', 0o37], ['IS2', 0o36], ['IS3', 0o35], ['IS4', 0o34],
    ['LF', 0o12], ['NAK', 0o25], ['NUL', 0], ['RS', 0o36], ['SI', 0o17],
    ['SO', 0o16], ['SOH', 0o1], ['STX', 0o2], ['SUB', 0o32], ['SYN', 0o26],
    ['US', 0o37], ['VT', 0o13],
    ['alert', 0o7], ['ampersand', 0x26], ['apostrophe', 0x27],
    ['asterisk', 0x2a], ['backslash', 0x5c], ['backspace', 0o10],
    ['carriage-return', 0o15], ['circumflex', 0x5e],
    ['circumflex-accent', 0x5e], ['colon', 0x3a], ['comma', 0x2c],
    ['commercial-at', 0x40], ['dollar-sign', 0x24], ['eight', 0x38],
    ['equals-sign', 0x3d], ['exclamation-mark', 0x21], ['five', 0x35],
    ['form-feed', 0o14], ['four', 0x34], ['full-stop', 0x2e],
    ['grave-accent', 0x60], ['greater-than-sign', 0x3e], ['hyphen', 0x2d],
    ['hyphen-minus', 0x2d], ['left-brace', 0x7b], ['left-curly-bracket', 0x7b],
    ['left-parenthesis', 0x28], ['left-square-bracket', 0x5b],
    ['less-than-sign', 0x3c], ['low-line', 0x5f], ['newline', 0o12],
    ['nine', 0x39], ['number-sign', 0x23], ['one', 0x31],
    ['percent-sign', 0x25], ['period', 0x2e], ['plus-sign', 0x2b],
    ['question-mark', 0x3f], ['quotation-mark', 0x22],
    ['reverse-solidus', 0x5c], ['right-brace', 0x7d],
    ['right-curly-bracket', 0x7d], ['right-parenthesis', 0x29],
    ['right-square-bracket', 0x5d], ['semicolon', 0x3b], ['seven', 0x37],
    ['six', 0x36], ['slash', 0x2f], ['solidus', 0x2f], ['space', 0x20],
    ['tab', 0o11], ['three', 0x33], ['tilde', 0x7e], ['two', 0x32],
    ['underscore', 0x5f], ['vertical-line', 0x7c], ['vertical-tab', 0o13],
    ['zero', 0x30],
];

// wcsncmp(name, cname, len) for the pattern codes s[start..start+len):
// the sign of the first difference, stopping at a NUL in either string.
function wcsncmp(s, start, name, len) {
    for (let i = 0; i < len; i++) {
        const a = s[start + i];
        const b = i < name.length ? name.charCodeAt(i) : 0;
        if (a !== b) return a < b ? -1 : 1;
        if (a === 0) return 0;
    }
    return 0;
}

// tre_search_cnames(): the binary search over cnames[]. A name that
// matches an entry's first len characters but is shorter sorts before it,
// so the search moves down. The sentinel "" at index 0 compares below every
// non-empty name, so `high` never drops below 0 (C's size_t would wrap).
function tre_search_cnames(s, start, len) {
    let low = 0;
    let high = CNAMES.length - 1;
    while (low <= high) {
        const cur = Math.floor((low + high) / 2);
        const cmp = wcsncmp(s, start, CNAMES[cur][0], len);
        if (cmp === 0 && CNAMES[cur][0].length === len) return CNAMES[cur][1];
        if (cmp > 0) low = cur + 1;
        else high = cur - 1;
    }
    return -1;
}

// locale/FreeBSD/collate.c __collate_equiv_value() in the "C" locale
// (__collate_load_error set): a one-character symbol's own code, else 0.
// COLLATE_STR_LEN does not matter: any name longer than one character
// already answers 0.
function collate_equiv_value(s, start, len) {
    return len === 1 && s[start] <= 0xff ? s[start] : 0;
}

// __collate_range_cmp() in the "C" locale: strcoll() of two one-character
// strings is strcmp(), which compares the bytes as unsigned char.
function collate_range_cmp(c1, c2) {
    return (c1 & 0xff) - (c2 & 0xff);
}

// tre_new_item(): append one item. The list starts with room for 32 and
// doubles, but gives up with REG_ESPACE once it would pass 1024.
function tre_new_item(items, type, value) {
    if (items.bracket_matches.length >= items.max_i) {
        if (items.max_i >= 1024) return REG_ESPACE;
        items.max_i *= 2;
    }
    items.bracket_matches.push({ type, value });
    return REG_OK;
}

// tre_parse_bracket_items(): read a bracket expression's items, after its
// "[" and any "^", up to and including the closing "]".
function tre_parse_bracket_items(ctx, items) {
    const s = ctx.s;
    let re = ctx.re;
    const re_end = ctx.re_end;
    let status;
    // range: -1 unset, 0 begin range set, +1 end range expected.
    let range = -1;
    let min = 0;
    let c = 0;

    for (; re < re_end; re++) {
        // Where C jumps with goto: process_single_character tests range
        // itself; process_end_range and process_begin_range skip the test.
        let process = null;
        switch (s[re]) {
        case CHAR_MINUS:
            // A first hyphen.
            if (re === ctx.re) {
                min = CHAR_MINUS;
                range = 0;
                break;
            }
            // The hyphen is the end range.
            if (range > 0) {
                c = CHAR_MINUS;
                process = 'end';
                break;
            }
            if (re + 1 >= re_end) return REG_EBRACK;
            // The hyphen is at the end.
            if (s[re + 1] === CHAR_RBRACKET) {
                c = CHAR_MINUS;
                process = 'begin';
                break;
            }
            // Two ranges are not allowed to share an endpoint, or begin
            // range is illegal.
            if (range < 0) return REG_ERANGE;
            range = 1; // Expect end range.
            break;

        case CHAR_LBRACKET:
            if (re + 1 >= re_end) return REG_EBRACK;
            switch (s[re + 1]) {
            case CHAR_PERIOD: {
                re += 2;
                const start = re;
                for (;; re++) {
                    if (re >= re_end) return REG_ECOLLATE;
                    if (s[re] !== CHAR_PERIOD) continue;
                    if (re + 1 >= re_end) return REG_ECOLLATE;
                    if (s[re + 1] !== CHAR_RBRACKET) continue;
                    // Found end. Empty name.
                    if (re === start) return REG_ECOLLATE;
                    // BSD compatibility: a name in cnames[] is that
                    // character.
                    c = tre_search_cnames(s, start, re - start);
                    if (c !== -1) {
                        re++;
                        process = 'single';
                        break;
                    }
                    // Verify this is a known sequence. In the "C" locale
                    // only a single character is, so the multi-character
                    // path after this is never reached.
                    if (collate_equiv_value(s, start, re - start) === 0) return REG_ECOLLATE;
                    c = s[start];
                    re++;
                    process = 'single';
                    break;
                }
                break;
            }

            case CHAR_EQUAL:
            case CHAR_COLON: {
                // Process equivalence and character classes.
                const kind = s[re + 1];
                const kindError = kind === CHAR_EQUAL ? REG_ECOLLATE : REG_ECTYPE;
                // Can't have a class as an endpoint to a range.
                if (range > 0) return REG_ERANGE;
                if (range === 0) {
                    status = tre_new_item(items, TRE_BRACKET_MATCH_TYPE_CHAR, min);
                    if (status !== REG_OK) return status;
                }
                range = -1;
                re += 2;
                const start = re;
                for (;; re++) {
                    if (re >= re_end) return kindError;
                    if (s[re] !== kind) continue;
                    if (re + 1 >= re_end) return kindError;
                    if (s[re + 1] !== CHAR_RBRACKET) continue;
                    // Found end. Empty class name.
                    if (re === start) return kindError;
                    if (kind === CHAR_EQUAL) {
                        const equiv = collate_equiv_value(s, start, re - start);
                        if (equiv === 0) {
                            // BSD compatibility: a name in cnames[] is
                            // that character.
                            c = tre_search_cnames(s, start, re - start);
                            if (c !== -1) {
                                re++;
                                process = 'single';
                                break;
                            }
                            return REG_ECOLLATE;
                        }
                        status = tre_new_item(items, TRE_BRACKET_MATCH_TYPE_EQUIVALENCE, equiv);
                        if (status !== REG_OK) return status;
                    } else {
                        // At most 63 characters of the name reach
                        // wctype_l(); wcsrtombs_l() in the "C" locale
                        // converts each code up to 0xff to its byte.
                        const len = Math.min(re - start, 63);
                        const name = String.fromCharCode(...s.slice(start, start + len));
                        const mask = tre_ctype(name);
                        if (!mask) return REG_ECTYPE;
                        status = tre_new_item(items, TRE_BRACKET_MATCH_TYPE_CLASS, mask);
                        if (status !== REG_OK) return status;
                    }
                    re++;
                    break;
                }
                break;
            }

            default:
                c = CHAR_LBRACKET;
                process = 'single';
                break;
            }
            break;

        case CHAR_RBRACKET:
            // A first right bracket.
            if (re === ctx.re) {
                min = CHAR_RBRACKET;
                range = 0;
                break;
            }
            // Done. range > 0 is not possible, since we did a lookahead
            // after the hyphen.
            if (range === 0) {
                status = tre_new_item(items, TRE_BRACKET_MATCH_TYPE_CHAR, min);
                if (status !== REG_OK) return status;
            }
            ctx.re = re + 1;
            return REG_OK;

        default:
            c = s[re];
            process = 'single';
            break;
        }

        if (process === 'single') process = range > 0 ? 'end' : 'begin';
        if (process === 'end') {
            // process_end_range: get collation equivalence values.
            if (collate_range_cmp(min, c) > 0) return REG_ERANGE;
            status = tre_new_item(items, TRE_BRACKET_MATCH_TYPE_RANGE_BEGIN, min);
            if (status !== REG_OK) return status;
            status = tre_new_item(items, TRE_BRACKET_MATCH_TYPE_RANGE_END, c);
            if (status !== REG_OK) return status;
            range = -1;
        } else if (process === 'begin') {
            // process_begin_range
            if (range === 0) {
                status = tre_new_item(items, TRE_BRACKET_MATCH_TYPE_CHAR, min);
                if (status !== REG_OK) return status;
            }
            min = c;
            range = 0;
        }
    }
    return REG_EBRACK;
}

// tre_parse_bracket(): a bracket expression, with ctx.re just past "[".
function tre_parse_bracket(ctx) {
    const s = ctx.s;
    // Handle special cases [[:<:]] and [[:>:]].
    if (ctx.re_end - ctx.re >= 6 && s[ctx.re] === CHAR_LBRACKET
        && s[ctx.re + 1] === CHAR_COLON
        && (s[ctx.re + 2] === CHAR_LESS || s[ctx.re + 2] === CHAR_GREATER)
        && s[ctx.re + 3] === CHAR_COLON && s[ctx.re + 4] === CHAR_RBRACKET
        && s[ctx.re + 5] === CHAR_RBRACKET) {
        const result = tre_ast_new_literal(ASSERTION,
            s[ctx.re + 2] === CHAR_LESS ? ASSERT_AT_BOW : ASSERT_AT_EOW);
        ctx.re += 6;
        return { status: REG_OK, result };
    }

    // Start off with an array of 32 elements.
    const items = { flags: 0, max_i: 32, bracket_matches: [] };
    // At the end of the pattern this reads C's terminating NUL.
    if (s[ctx.re] === CHAR_CARET) {
        items.flags |= TRE_BRACKET_MATCH_FLAG_NEGATE;
        ctx.re++;
    }
    const status = tre_parse_bracket_items(ctx, items);
    if (status !== REG_OK) return { status, result: null };

    const node = tre_ast_new_literal(0, TRE_CHAR_MAX);
    node.obj.bracket_match_list = {
        flags: items.flags,
        bracket_matches: items.bracket_matches,
    };
    return { status: REG_OK, result: node };
}

// tre_parse_int(): a decimal number at s[r], capped at INT_MAX, or -1 when
// there is no digit. Returns [value, next index].
function tre_parse_int(s, r, re_end) {
    let num = 0;
    let overflow = false;
    const start = r;
    while (r < re_end && s[r] >= 0x30 && s[r] <= 0x39) {
        if (!overflow) {
            num = num * 10 + s[r] - 0x30;
            if (num > TRE_INT_MAX) overflow = true;
        }
        r++;
    }
    if (r === start) return [-1, r];
    return [overflow ? TRE_INT_MAX : num, r];
}

// tre_parse_bound(): a bound after "{", with ctx.re just past the brace.
// With an operand (`result` not null) it wraps it in an iteration; without
// one it only checks the bound. REG_NOMATCH means the brace is a literal.
function tre_parse_bound(ctx, result) {
    const s = ctx.s;
    let r = ctx.re;
    let min = -1;
    let max;

    // Parse number (minimum repetition count). In an extended regex a "{"
    // not followed by a digit is a literal (BSD compatibility).
    if (r >= ctx.re_end) return { status: REG_NOMATCH, result };
    if (s[r] >= 0x30 && s[r] <= 0x39) [min, r] = tre_parse_int(s, r, ctx.re_end);
    else return { status: REG_NOMATCH, result };

    // Parse comma and second number (maximum repetition count).
    max = min;
    if (r < ctx.re_end && s[r] === CHAR_COMMA) {
        if (min < 0) min = 0;
        r++;
        [max, r] = tre_parse_int(s, r, ctx.re_end);
    }

    // Check that the repeat counts are sane.
    if (max >= 0 && min > max) return { status: REG_BADBR, result };
    if (min > RE_DUP_MAX || max > RE_DUP_MAX) return { status: REG_BADMAX, result };

    // Missing }.
    if (r >= ctx.re_end) return { status: REG_EBRACE, result };
    // Empty contents of {}.
    if (r === ctx.re) return { status: REG_BADBR, result };

    // Parse the ending '}'.
    if (s[r] !== CHAR_RBRACE) return { status: REG_BADBR, result };
    r++;
    if (r < ctx.re_end) {
        // A '?' marks minimal repetition only with REG_ENHANCED; '*' and
        // '+' are reserved for future extensions.
        if (s[r] === CHAR_QUESTIONMARK || s[r] === CHAR_STAR || s[r] === CHAR_PLUS)
            return { status: REG_BADRPT, result };
    }

    if (result) {
        // tre_expand_ast() replaces {0,0} with EMPTY later.
        result = tre_ast_new_iter(result, min, max, 0);
    }
    ctx.re = r;
    return { status: REG_OK, result };
}

// The parser's stack symbols.
const PARSE_RE = 0;
const PARSE_ATOM = 1;
const PARSE_MARK_FOR_SUBMATCH = 2;
const PARSE_BRANCH = 3;
const PARSE_PIECE = 4;
const PARSE_CATENATION = 5;
const PARSE_POST_CATENATION = 6;
const PARSE_UNION = 7;
const PARSE_POST_UNION = 8;
const PARSE_POSTFIX = 9;

function isRawAssertion(node) {
    return node.type === LITERAL && node.submatch_id < 0
        && node.obj.code_min === ASSERTION;
}

/**
 * tre_parse(): parse ctx.s[ctx.re .. ctx.re + ctx.len) into ctx.result.
 * ctx holds s (the pattern's codes, with C's terminating 0 after them), re,
 * len, cflags, submatch_id, submatch_id_invisible, nofirstsub and stack.
 * Returns REG_OK or the error code.
 */
export function tre_parse(ctx) {
    const s = ctx.s;
    const stack = ctx.stack;
    const bottom = stack.length;
    let result = null;
    let status = REG_OK;
    let depth = 0;
    const extended = (ctx.cflags & REG_EXTENDED) !== 0;

    if (ctx.len <= 0) return REG_EMPTY;
    if (!ctx.nofirstsub) {
        stack.push(ctx.cflags, ctx.submatch_id, PARSE_MARK_FOR_SUBMATCH);
        ctx.submatch_id++;
    }
    stack.push(0, PARSE_RE); // bre_branch_begin
    ctx.re_start = ctx.re;
    ctx.re_end = ctx.re + ctx.len;

    // The C parser uses an explicit stack rather than recursion; so does
    // this port, so that statements run in C's order.
    while (stack.length > bottom && status === REG_OK) {
        const symbol = stack.pop();
        switch (symbol) {
        case PARSE_RE: {
            // A full regexp: one or more branches separated by '|'.
            const bre_branch_begin = stack.pop();
            if (ctx.cflags & (REG_EXTENDED | REG_ENHANCED)) stack.push(PARSE_UNION);
            stack.push(bre_branch_begin, PARSE_BRANCH);
            break;
        }

        case PARSE_BRANCH: {
            // A branch: one or more pieces, concatenated.
            const bre_branch_begin = stack.pop();
            stack.push(PARSE_CATENATION, bre_branch_begin, PARSE_PIECE);
            break;
        }

        case PARSE_PIECE: {
            // A piece: an atom possibly followed by a postfix operator.
            const bre_branch_begin = stack.pop();
            stack.push(PARSE_POSTFIX, bre_branch_begin, PARSE_ATOM);
            break;
        }

        case PARSE_CATENATION: {
            // If the expression has not ended, parse another piece.
            if (ctx.re >= ctx.re_end) break;
            const c = s[ctx.re];
            if (extended && c === CHAR_PIPE) break;
            if (extended && c === CHAR_RPAREN && depth > 0) {
                depth--;
                break;
            }
            // Right-associative concatenation.
            stack.push(result, PARSE_POST_CATENATION, PARSE_CATENATION, 0, PARSE_PIECE);
            break;
        }

        case PARSE_POST_CATENATION: {
            const tree = stack.pop();
            result = tre_ast_new_catenation(tree, result);
            break;
        }

        case PARSE_UNION:
            if (ctx.re >= ctx.re_end) break;
            switch (s[ctx.re]) {
            case CHAR_PIPE:
                stack.push(PARSE_UNION, ctx.re, result, PARSE_POST_UNION,
                    // bre_branch_begin: only for an enhanced basic regex.
                    0, PARSE_BRANCH);
                ctx.re++;
                break;
            case CHAR_RPAREN:
                ctx.re++;
                break;
            default:
                break;
            }
            break;

        case PARSE_POST_UNION: {
            const tree = stack.pop();
            const pipechar = stack.pop();
            // Error on an empty expression at the end of a union.
            if (pipechar === ctx.re - 1) return REG_EMPTY;
            result = tre_ast_new_union(tree, result);
            break;
        }

        case PARSE_POSTFIX: {
            // Postfix operators. Only one is read: a second is an error
            // caught by the next atom or by the checks below.
            if (ctx.re >= ctx.re_end) break;
            const c = s[ctx.re];
            if (c === CHAR_PLUS || c === CHAR_QUESTIONMARK || c === CHAR_STAR) {
                // Error on iteration of a raw assertion (not in a
                // subexpression).
                if (isRawAssertion(result)) return REG_BADRPT;
                const rep_min = c === CHAR_PLUS ? 1 : 0;
                const rep_max = c === CHAR_QUESTIONMARK ? 1 : -1;
                if (ctx.re + 1 < ctx.re_end) {
                    // A '?' after the operator marks minimal repetition
                    // only with REG_ENHANCED; '*' and '+' are reserved.
                    const next = s[ctx.re + 1];
                    if (next === CHAR_QUESTIONMARK || next === CHAR_STAR || next === CHAR_PLUS)
                        return REG_BADRPT;
                }
                if (result === null) return REG_BADRPT;
                ctx.re++;
                result = tre_ast_new_iter(result, rep_min, rep_max, 0);
                // An iterator gets a submatch id in the invisible range.
                result.submatch_id = ctx.submatch_id_invisible++;
            } else if (c === CHAR_LBRACE) {
                // Error on iteration of a raw assertion, but only after
                // the bound parses.
                const raw_assertion = isRawAssertion(result);
                ctx.re++;
                const bound = tre_parse_bound(ctx, result);
                status = bound.status;
                result = bound.result;
                if (status === REG_NOMATCH) {
                    // The brace is a literal.
                    status = REG_OK;
                    ctx.re--;
                    break;
                }
                if (status !== REG_OK) return status;
                if (raw_assertion) return REG_BADRPT;
                if (result.type === ITERATION)
                    result.submatch_id = ctx.submatch_id_invisible++;
            }
            // A backslash starts no postfix operator in an extended regex.
            break;
        }

        case PARSE_ATOM: {
            // An atom: a parenthesized regexp, (), a bracket expression,
            // '.', '^', '$', a '\' and a character, or one character.
            stack.pop(); // bre_branch_begin, which only a basic regex reads
            let literal = ctx.re >= ctx.re_end;
            if (!literal) {
                switch (s[ctx.re]) {
                case CHAR_LPAREN:
                    // Parse a whole RE, then mark the tree for submatching.
                    // The "(?" extensions need REG_ENHANCED.
                    ctx.re++;
                    stack.push(ctx.cflags, ctx.submatch_id, PARSE_MARK_FOR_SUBMATCH,
                        0, PARSE_RE);
                    ctx.submatch_id++;
                    depth++;
                    break;

                case CHAR_RPAREN:
                    // The subexpression closes where an atom was expected:
                    // an empty expression. With no group open, ')' is a
                    // literal.
                    if (extended && depth > 0) result = tre_ast_new_literal(EMPTY, -1);
                    else literal = true;
                    break;

                case CHAR_LBRACKET: {
                    ctx.re++;
                    const bracket = tre_parse_bracket(ctx);
                    if (bracket.status !== REG_OK) return bracket.status;
                    result = bracket.result;
                    break;
                }

                case CHAR_BACKSLASH:
                    // Trailing backslash.
                    if (ctx.re + 1 >= ctx.re_end) return REG_EESCAPE;
                    // Without REG_ENHANCED ("unenhanced_backslash"), and in
                    // an extended regex, where a digit is no back
                    // reference, the next character is literal.
                    ctx.re++;
                    result = tre_ast_new_literal(s[ctx.re], s[ctx.re]);
                    ctx.re++;
                    break;

                case CHAR_PERIOD:
                    // The any-symbol; REG_NEWLINE would exclude '\n'.
                    result = tre_ast_new_literal(0, TRE_CHAR_MAX);
                    ctx.re++;
                    break;

                case CHAR_CARET:
                    // Beginning of line: special everywhere in an extended
                    // regex.
                    result = tre_ast_new_literal(ASSERTION, ASSERT_AT_BOL);
                    ctx.re++;
                    break;

                case CHAR_DOLLAR:
                    // End of line: special everywhere in an extended regex.
                    result = tre_ast_new_literal(ASSERTION, ASSERT_AT_EOL);
                    ctx.re++;
                    break;

                default:
                    literal = true;
                    break;
                }
            }
            if (!literal) break;

            // parse_literal: the regexp or subexpression ending here would
            // be an empty expression, which is an error, as is a union or
            // iteration of one.
            if (ctx.re >= ctx.re_end) return depth > 0 ? REG_EPAREN : REG_EMPTY;
            if (s[ctx.re] === CHAR_PIPE) return REG_EMPTY;
            if (s[ctx.re] === CHAR_LBRACE) {
                ctx.re++;
                // Parse the bound first and return any error before
                // REG_BADRPT. REG_NOMATCH makes the brace a literal.
                status = tre_parse_bound(ctx, null).status;
                if (status !== REG_NOMATCH) {
                    if (status !== REG_OK) return status;
                    return REG_BADRPT;
                }
                status = REG_OK;
                ctx.re--;
            } else if (s[ctx.re] === CHAR_STAR || s[ctx.re] === CHAR_PLUS
                || s[ctx.re] === CHAR_QUESTIONMARK) {
                return REG_BADRPT;
            }
            result = tre_ast_new_literal(s[ctx.re], s[ctx.re]);
            ctx.re++;
            break;
        }

        case PARSE_MARK_FOR_SUBMATCH: {
            const submatch_id = stack.pop();
            ctx.cflags = stack.pop(); // restore cflags
            if (result.submatch_id >= 0 && result.submatch_id < SUBMATCH_ID_INVISIBLE_START) {
                if (submatch_id >= SUBMATCH_ID_INVISIBLE_START) break;
                const tmp_node = tre_ast_new_catenation(tre_ast_new_literal(EMPTY, -1), result);
                tmp_node.num_submatches = result.num_submatches;
                result = tmp_node;
            }
            result.submatch_id = submatch_id;
            if (submatch_id < SUBMATCH_ID_INVISIBLE_START) result.num_submatches++;
            break;
        }

        default:
            // C asserts that the stack holds no other symbol.
            break;
        }
    }

    if (status !== REG_OK) return status;
    // Check for missing closing parentheses.
    if (depth > 0) return REG_EPAREN;
    ctx.result = result;
    return REG_OK;
}
