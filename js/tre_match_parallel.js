// SPDX-License-Identifier: BSD-2-Clause
//
// A JavaScript translation of TRE as Apple Libc ships it.
// Copyright (c) 2001-2009 Ville Laurikari <vl@iki.fi>. All rights reserved.
// Distributed under the licence in licenses/TRE-LICENSE.txt.
//
// tre_match_parallel.js -- Apple Libc regex/TRE/lib/tre-match-parallel.c
// (tag Libc-1752.120.2) tre_tnfa_run_parallel(), with the macros and
// tre_bracket_match() it uses from tre-match-utils.h. See
// js/tre_internal.js for the source and the configuration this port keeps.
//
// The matcher runs every state of the TNFA in parallel over the text,
// adding the initial states at each position until a match is found, and
// reports whether the final state was reached. posixregex.c asks only
// whether a pattern matches (REG_NOSUB, no pmatch), so no transition carries
// tags and the first match found ends the run. The text is one byte per
// character (STR_BYTE: MB_CUR_MAX is 1 in the "C" locale) and ends at its
// first NUL, as a C string does.
import {
    ASSERT_AT_BOL,
    ASSERT_AT_BOW,
    ASSERT_AT_EOL,
    ASSERT_AT_EOW,
    ASSERT_BRACKET_MATCH,
    REG_NOMATCH,
    REG_OK,
    TRE_BRACKET_MATCH_FLAG_NEGATE,
    TRE_BRACKET_MATCH_TYPE_CHAR,
    TRE_BRACKET_MATCH_TYPE_CLASS,
    TRE_BRACKET_MATCH_TYPE_EQUIVALENCE,
    TRE_BRACKET_MATCH_TYPE_RANGE_BEGIN,
    tre_isalnum,
    tre_isctype,
} from './tre_internal.js';

// IS_WORD_CHAR(): '_' or iswalnum_l() in the "C" locale.
function IS_WORD_CHAR(c) {
    return c === 0x5f || tre_isalnum(c);
}

// tre_bracket_match(): whether byte wc is in the bracket expression. In the
// "C" locale a range compares byte values (__collate_range_cmp() is
// strcmp() of one-byte strings) and an equivalence class holds only its
// own character (__collate_equiv_wchar()). REG_ICASE is never set.
function tre_bracket_match(list, wc) {
    let match = false;
    const items = list.bracket_matches;
    for (let i = 0; i < items.length; i++) {
        const b = items[i];
        switch (b.type) {
        case TRE_BRACKET_MATCH_TYPE_CHAR:
            match = b.value === wc;
            break;
        case TRE_BRACKET_MATCH_TYPE_RANGE_BEGIN: {
            // A range is a RANGE_BEGIN item followed by its RANGE_END.
            const start = b.value;
            const end = items[++i].value;
            match = (start & 0xff) <= wc && (end & 0xff) >= wc;
            break;
        }
        case TRE_BRACKET_MATCH_TYPE_CLASS:
            match = tre_isctype(wc, b.value);
            break;
        case TRE_BRACKET_MATCH_TYPE_EQUIVALENCE:
            match = wc === b.value;
            break;
        default:
            throw new Error(`tre_bracket_match: item type ${b.type}`);
        }
        if (match) break;
    }
    if (list.flags & TRE_BRACKET_MATCH_FLAG_NEGATE) match = !match;
    return match;
}

/**
 * tre_tnfa_run_parallel() with no tags: REG_OK if the TNFA matches some
 * part of `bytes` (an array of byte values), else REG_NOMATCH. eflags are
 * 0: REG_NOTBOL and REG_NOTEOL are clear, and REG_NEWLINE was not compiled.
 */
export function tre_tnfa_run_parallel(tnfa, bytes) {
    // The C string ends at its first NUL.
    let length = bytes.indexOf(0);
    if (length < 0) length = bytes.length;
    let prev_c = 0;
    let next_c = 0;
    let str_byte = 0;
    let pos = -1;

    // GET_NEXT_WCHAR() for STR_BYTE with an unknown length: past the end it
    // reads the NUL.
    const GET_NEXT_WCHAR = () => {
        prev_c = next_c;
        pos++;
        next_c = str_byte < length ? bytes[str_byte++] : 0;
    };

    // CHECK_ASSERTIONS(): true when an assertion fails here.
    const CHECK_ASSERTIONS = (assertions) => (
        ((assertions & ASSERT_AT_BOL) && pos > 0)
        || ((assertions & ASSERT_AT_EOL) && next_c !== 0)
        || ((assertions & ASSERT_AT_BOW) && (IS_WORD_CHAR(prev_c) || !IS_WORD_CHAR(next_c)))
        || ((assertions & ASSERT_AT_EOW) && (!IS_WORD_CHAR(prev_c) || IS_WORD_CHAR(next_c)))
    );

    // reach_pos[state]: the last position at which the state was reached.
    const reach_pos = new Int32Array(tnfa.num_states).fill(-1);

    // If only one character can start a match, find it first.
    if (tnfa.first_char >= 0) {
        let found = -1;
        for (let k = 0; k < length; k++) {
            if (bytes[k] === tnfa.first_char) {
                found = k;
                break;
            }
        }
        if (found < 0) return REG_NOMATCH;
        if (found >= 1) prev_c = bytes[found - 1];
        next_c = bytes[found];
        pos = found;
        str_byte = found + 1;
    } else {
        GET_NEXT_WCHAR();
        pos = 0;
    }

    let match_eo = -1;
    let reach_next = [];
    for (;;) {
        // If no match found yet, add the initial states to `reach_next'.
        if (match_eo < 0) {
            for (const trans of tnfa.initial) {
                if (reach_pos[trans.state_id] < pos) {
                    if (trans.assertions && CHECK_ASSERTIONS(trans.assertions)) continue;
                    reach_next.push(trans.state_id);
                    if (trans.state_id === tnfa.final) match_eo = pos;
                    reach_pos[trans.state_id] = pos;
                }
            }
        } else {
            // We have found a match; with no tags there is no better one
            // to look for.
            break;
        }

        // Check for end of string.
        if (next_c === 0) break;

        GET_NEXT_WCHAR();

        // For each state in `reach', add the destination of each transition
        // on the current character to `reach_next'.
        const reach = reach_next;
        reach_next = [];
        for (const state of reach) {
            for (const trans of tnfa.transitions[state]) {
                if (trans.code_min > prev_c || trans.code_max < prev_c) continue;
                if (trans.assertions
                    && (CHECK_ASSERTIONS(trans.assertions)
                        || ((trans.assertions & ASSERT_BRACKET_MATCH)
                            && !tre_bracket_match(trans.bracket_match_list, prev_c)))) {
                    continue;
                }
                if (reach_pos[trans.state_id] < pos) {
                    reach_next.push(trans.state_id);
                    reach_pos[trans.state_id] = pos;
                    if (trans.state_id === tnfa.final && match_eo === -1) match_eo = pos;
                }
                // A state already reached at this position keeps its first
                // path: tre_tag_order() of zero tags prefers neither.
            }
        }
    }
    return match_eo >= 0 ? REG_OK : REG_NOMATCH;
}
