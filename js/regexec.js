// SPDX-License-Identifier: LGPL-2.1-or-later
//
// This file is a JavaScript translation of glibc 2.39 posix/regexec.c.
// Copyright (C) 2002-2024 Free Software Foundation, Inc.
// The original is part of the GNU C Library, contributed by Isamu Hasegawa.
//
// This file is free software; you can redistribute it and/or modify it
// under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation; either version 2.1 of the License, or (at
// your option) any later version. It is distributed in the hope that it will
// be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser
// General Public License for more details. A copy of the license is in
// licenses/LGPL-2.1.txt.
//
// regexec.js -- glibc 2.39 posix/regexec.c: regexec() for a pattern that
// sys/share/posixregex.c compiled with REG_EXTENDED | REG_NOSUB, called with
// nmatch 0 and eflags 0, in the "C" locale.
//
// glibc does not decide backreferences by trying every capture. Its forward
// pass logs DFA states per input position, get_subexp() records candidate
// group spans for each backreference, and prune_impossible_nodes() sifts the
// log backwards (sift_states_backward(), sift_states_bkref()) to confirm a
// match. Some patterns therefore match where the ideal POSIX semantics would
// not, and the reverse. This file reproduces that algorithm function by
// function, so regex_match() gives the recorder's answer.
//
// Left out: set_regs() and its helpers (REG_NOSUB reports no registers),
// multibyte and translate paths, and buffer reallocation (in the "C" locale
// the whole input is valid from the start).

import {
    CHARACTER,
    CONTEXT_BEGBUF,
    CONTEXT_NEWLINE,
    CONTEXT_WORD,
    END_OF_RE,
    IS_BEGBUF_CONTEXT,
    IS_EPSILON_NODE,
    IS_NEWLINE_CONTEXT,
    IS_ORDINARY_CONTEXT,
    IS_WORD_CONTEXT,
    NEWLINE_CHAR,
    NEXT_ENDBUF_CONSTRAINT,
    NEXT_NEWLINE_CONSTRAINT,
    NEXT_NOTWORD_CONSTRAINT,
    NEXT_WORD_CONSTRAINT,
    NOT_SATISFY_NEXT_CONSTRAINT,
    OP_BACK_REF,
    OP_CLOSE_SUBEXP,
    OP_OPEN_SUBEXP,
    OP_PERIOD,
    RE_DOT_NEWLINE,
    RE_DOT_NOT_NULL,
    REG_NOERROR,
    REG_NOMATCH,
    SBC_MAX,
    SIMPLE_BRACKET,
    bitset_new,
    re_acquire_state,
    re_acquire_state_context,
    re_node_set_add_intersect,
    re_node_set_alloc,
    re_node_set_contains,
    re_node_set_empty,
    re_node_set_init_1,
    re_node_set_init_copy,
    re_node_set_init_empty,
    re_node_set_init_union,
    re_node_set_insert,
    re_node_set_merge,
    re_node_set_remove,
    re_node_set_remove_at,
    re_string_byte_at,
    re_string_context_at,
} from './regex_internal.js';

// A backreference cache entry's eps_reachable_subexps_map is an unsigned
// long; it is held as two 32-bit halves, eps_lo and eps_hi. Callers pass
// subexp_idx < 64.
function epsReachable(ent, subexp_idx) {
    return subexp_idx < 32 ? ((ent.eps_lo >>> subexp_idx) & 1) !== 0
        : ((ent.eps_hi >>> (subexp_idx - 32)) & 1) !== 0;
}

function clearEpsReachable(ent, subexp_idx) {
    if (subexp_idx < 32) ent.eps_lo &= ~(1 << subexp_idx);
    else ent.eps_hi &= ~(1 << (subexp_idx - 32));
}

// Match STRING, a byte string, against PREG from regcomp(). Return 0 for a
// match and REG_NOMATCH otherwise, as regexec() does.
export function regexec(preg, string) {
    // regexec() takes strlen(string) bytes.
    const nul = string.indexOf('\0');
    const text = nul < 0 ? string : string.slice(0, nul);
    const length = text.length;
    const err = re_search_internal(preg, text, length, 0, length, length, 0,
        null, 0);
    return err !== REG_NOERROR ? REG_NOMATCH : 0;
}

function re_search_internal(preg, string, length, start, last_start, stop,
    nmatch, _pmatch, eflags) {
    const dfa = preg.buffer;
    let match_last = -1;
    const fastmap = preg.fastmap != null && preg.fastmap_accurate
        && start !== last_start && !preg.can_be_null ? preg.fastmap : null;
    const mctx = {
        input: null,
        dfa,
        eflags: 0,
        match_last: -1,
        last_node: 0,
        state_log: null,
        state_log_top: 0,
        nbkref_ents: 0,
        bkref_ents: [],
        max_mb_elem_len: 0,
        nsub_tops: 0,
        sub_tops: [],
    };

    if (dfa.init_state == null || dfa.init_state_word == null
        || dfa.init_state_nl == null || dfa.init_state_begbuf == null)
        return REG_NOMATCH;

    // If initial states with non-begbuf contexts have no elements, the
    // regex must be anchored.
    if (dfa.init_state.nodes.nelem === 0
        && dfa.init_state_word.nodes.nelem === 0
        && (dfa.init_state_nl.nodes.nelem === 0 || !preg.newline_anchor)) {
        if (start !== 0 && last_start !== 0) return REG_NOMATCH;
        start = last_start = 0;
    }

    // We must check the longest matching, if nmatch > 0.
    const fl_longest_match = nmatch !== 0 || dfa.nbackref !== 0;

    mctx.input = {
        raw: string,
        raw_mbs_idx: 0,
        len: length,
        raw_len: length,
        stop,
        cur_idx: 0,
        tip_context: 0,
        newline_anchor: preg.newline_anchor,
        word_char: dfa.word_char,
    };
    match_ctx_init(mctx, eflags, dfa.nbackref * 2);

    // The state log is kept only with a "multibyte node", which in the "C"
    // locale means a backreference.
    if (nmatch > 1 || dfa.has_mb_node) mctx.state_log = [];

    let match_first = start;
    mctx.input.tip_context = CONTEXT_NEWLINE | CONTEXT_BEGBUF;

    const incr = last_start < start ? -1 : 1;
    const left_lim = last_start < start ? last_start : start;
    const right_lim = last_start < start ? start : last_start;
    const match_kind = fastmap ? 4 | (start <= last_start ? 2 : 0) : 8;

    let err;
    for (;; match_first += incr) {
        err = REG_NOMATCH;
        if (match_first < left_lim || right_lim < match_first) return err;

        // Advance through the string to a plausible place to start matching.
        switch (match_kind) {
        case 8:
            break;
        case 6:
            while (match_first < right_lim
                   && !fastmap[string.charCodeAt(match_first)]) ++match_first;
            if (match_first === right_lim) {
                const ch = match_first >= length
                    ? 0 : string.charCodeAt(match_first);
                if (!fastmap[ch]) return err;
            }
            break;
        default:
            // Fastmap without multi-byte translation, match backwards.
            while (match_first >= left_lim) {
                const ch = match_first >= length
                    ? 0 : string.charCodeAt(match_first);
                if (fastmap[ch]) break;
                --match_first;
            }
            if (match_first < left_lim) return err;
            break;
        }

        // Reconstruct the buffers so that the matcher can assume that the
        // matching starts from the beginning of the buffer.
        re_string_reconstruct(mctx.input, match_first, eflags);

        mctx.state_log_top = mctx.nbkref_ents = mctx.max_mb_elem_len = 0;
        const first = { value: match_first };
        match_last = check_matching(mctx, fl_longest_match,
            start <= last_start ? first : null);
        match_first = first.value;
        if (match_last !== -1) {
            mctx.match_last = match_last;
            if ((!preg.no_sub && nmatch > 1) || dfa.nbackref) {
                const pstate = mctx.state_log[match_last];
                mctx.last_node = check_halt_state_context(mctx, pstate,
                    match_last);
            }
            if ((!preg.no_sub && nmatch > 1 && dfa.has_plural_match)
                || dfa.nbackref) {
                err = prune_impossible_nodes(mctx);
                if (err === REG_NOERROR) break;
                match_last = -1;
            } else {
                break; // We found a match.
            }
        }
        match_ctx_clean(mctx);
    }
    return REG_NOERROR;
}

// regex_internal.c re_string_reconstruct() for the "C" locale with no
// translation: slide the buffer to IDX and take the context of the byte
// before it.
function re_string_reconstruct(pstr, idx, eflags) {
    let offset;
    if (pstr.raw_mbs_idx <= idx) {
        offset = idx - pstr.raw_mbs_idx;
    } else {
        pstr.len = pstr.raw_len;
        pstr.stop = pstr.raw_len;
        pstr.raw_mbs_idx = 0;
        pstr.tip_context = (eflags & 1 /* REG_NOTBOL */) ? CONTEXT_BEGBUF
            : CONTEXT_NEWLINE | CONTEXT_BEGBUF;
        offset = idx;
    }
    if (offset !== 0) {
        if (offset < pstr.len) {
            pstr.tip_context = re_string_context_at(pstr, offset - 1, eflags);
        } else {
            const c = pstr.raw.charCodeAt(pstr.raw_mbs_idx + offset - 1);
            pstr.tip_context = pstr.word_char[c] ? CONTEXT_WORD
                : c === NEWLINE_CHAR && pstr.newline_anchor
                    ? CONTEXT_NEWLINE : 0;
        }
    }
    pstr.raw_mbs_idx = idx;
    pstr.len -= offset;
    pstr.stop -= offset;
    pstr.cur_idx = 0;
}

function re_string_eoi(pstr) { return pstr.stop <= pstr.cur_idx; }

function prune_impossible_nodes(mctx) {
    const dfa = mctx.dfa;
    let match_last = mctx.match_last;
    let halt_node = mctx.last_node;
    const sifted_states = [];
    if (dfa.nbackref) {
        const lim_states = [];
        for (;;) {
            lim_states.length = 0;
            for (let i = 0; i <= match_last; ++i) lim_states[i] = null;
            const sctx = sift_ctx_init(sifted_states, lim_states, halt_node,
                match_last);
            sift_states_backward(mctx, sctx);
            if (sifted_states[0] != null || lim_states[0] != null) break;
            do {
                --match_last;
                if (match_last < 0) return REG_NOMATCH;
            } while (mctx.state_log[match_last] == null
                     || !mctx.state_log[match_last].halt);
            halt_node = check_halt_state_context(mctx,
                mctx.state_log[match_last], match_last);
        }
        merge_state_array(dfa, sifted_states, lim_states, match_last + 1);
    } else {
        const sctx = sift_ctx_init(sifted_states, null, halt_node, match_last);
        sift_states_backward(mctx, sctx);
        if (sifted_states[0] == null) return REG_NOMATCH;
    }
    mctx.state_log = sifted_states;
    mctx.last_node = halt_node;
    mctx.match_last = match_last;
    return REG_NOERROR;
}

// Select the initial state for the context before IDX.
function acquire_init_state_context(mctx, idx) {
    const dfa = mctx.dfa;
    if (dfa.init_state.has_constraint) {
        const context = re_string_context_at(mctx.input, idx - 1, mctx.eflags);
        if (IS_WORD_CONTEXT(context)) return dfa.init_state_word;
        if (IS_ORDINARY_CONTEXT(context)) return dfa.init_state;
        if (IS_BEGBUF_CONTEXT(context) && IS_NEWLINE_CONTEXT(context))
            return dfa.init_state_begbuf;
        if (IS_NEWLINE_CONTEXT(context)) return dfa.init_state_nl;
        if (IS_BEGBUF_CONTEXT(context)) {
            return re_acquire_state_context(dfa,
                dfa.init_state.entrance_nodes, context);
        }
        return dfa.init_state;
    }
    return dfa.init_state;
}

// Run the DFA from the current index and return where the (longest, with
// FL_LONGEST_MATCH) match ends, or -1. P_MATCH_FIRST, when given, advances
// past input the initial state consumed without leaving it.
function check_matching(mctx, fl_longest_match, p_match_first) {
    const dfa = mctx.dfa;
    let match = 0;
    let match_last = -1;
    const cur_str_idx = mctx.input.cur_idx;
    let at_init_state = p_match_first != null;
    let next_start_idx = cur_str_idx;

    let cur_state = acquire_init_state_context(mctx, cur_str_idx);
    if (mctx.state_log != null) {
        mctx.state_log[cur_str_idx] = cur_state;
        // Check OP_OPEN_SUBEXP in the initial state for later
        // backreferences.
        if (dfa.nbackref) {
            at_init_state = false;
            check_subexp_matching_top(mctx, cur_state.nodes, 0);
            if (cur_state.has_backref)
                transit_state_bkref(mctx, cur_state.nodes);
        }
    }

    // If the RE accepts NULL string.
    if (cur_state.halt) {
        if (!cur_state.has_constraint
            || check_halt_state_context(mctx, cur_state, cur_str_idx)) {
            if (!fl_longest_match) return cur_str_idx;
            match_last = cur_str_idx;
            match = 1;
        }
    }

    while (!re_string_eoi(mctx.input)) {
        const old_state = cur_state;
        const next_char_idx = mctx.input.cur_idx + 1;
        cur_state = transit_state(mctx, cur_state);
        if (mctx.state_log != null)
            cur_state = merge_state_with_log(mctx, cur_state);
        if (cur_state == null) {
            // Reached the invalid state. Try to recover a valid state using
            // the state log.
            if (mctx.state_log == null
                || (match && !fl_longest_match)
                || (cur_state = find_recover_state(mctx)) == null) break;
        }
        if (at_init_state) {
            if (old_state === cur_state) next_start_idx = next_char_idx;
            else at_init_state = false;
        }
        if (cur_state.halt) {
            // Check the halt state can satisfy the current context.
            if (!cur_state.has_constraint
                || check_halt_state_context(mctx, cur_state,
                    mctx.input.cur_idx)) {
                match_last = mctx.input.cur_idx;
                match = 1;
                // We found a match, do not modify match_first below.
                p_match_first = null;
                if (!fl_longest_match) break;
            }
        }
    }
    if (p_match_first) p_match_first.value += next_start_idx;
    return match_last;
}

function check_halt_node_context(dfa, node, context) {
    const type = dfa.nodes[node].type;
    const constraint = dfa.nodes[node].constraint;
    if (type !== END_OF_RE) return false;
    if (!constraint) return true;
    if (NOT_SATISFY_NEXT_CONSTRAINT(constraint, context)) return false;
    return true;
}

// Return the halt node of STATE that suits the context at IDX, or 0.
function check_halt_state_context(mctx, state, idx) {
    const context = re_string_context_at(mctx.input, idx, mctx.eflags);
    for (let i = 0; i < state.nodes.nelem; ++i) {
        if (check_halt_node_context(mctx.dfa, state.nodes.elems[i], context))
            return state.nodes.elems[i];
    }
    return 0;
}

function STATE_NODE_CONTAINS(state, node) {
    return state != null && re_node_set_contains(state.nodes, node) !== 0;
}

// Sift the state log from SCTX.last_str_idx back to 0, keeping in each
// state only the nodes that can still reach the last node.
function sift_states_backward(mctx, sctx) {
    let null_cnt = 0;
    let str_idx = sctx.last_str_idx;
    const cur_dest = re_node_set_init_1(sctx.last_node);
    update_cur_sifted_state(mctx, sctx, str_idx, cur_dest);
    while (str_idx > 0) {
        null_cnt = sctx.sifted_states[str_idx] == null ? null_cnt + 1 : 0;
        if (null_cnt > mctx.max_mb_elem_len) {
            for (let i = 0; i < str_idx; ++i) sctx.sifted_states[i] = null;
            return REG_NOERROR;
        }
        re_node_set_empty(cur_dest);
        --str_idx;
        if (mctx.state_log[str_idx])
            build_sifted_states(mctx, sctx, str_idx, cur_dest);
        update_cur_sifted_state(mctx, sctx, str_idx, cur_dest);
    }
    return REG_NOERROR;
}

function build_sifted_states(mctx, sctx, str_idx, cur_dest) {
    const dfa = mctx.dfa;
    const cur_src = mctx.state_log[str_idx].non_eps_nodes;
    for (let i = 0; i < cur_src.nelem; i++) {
        const prev_node = cur_src.elems[i];
        let naccepted = 0;
        // Backreferences are checked in update_cur_sifted_state().
        if (check_node_accept(mctx, dfa.nodes[prev_node], str_idx)
            && STATE_NODE_CONTAINS(sctx.sifted_states[str_idx + 1],
                dfa.nexts[prev_node])) naccepted = 1;
        if (naccepted === 0) continue;
        if (sctx.limits.nelem) {
            const to_idx = str_idx + naccepted;
            if (check_dst_limits(mctx, sctx.limits, dfa.nexts[prev_node],
                to_idx, prev_node, str_idx)) continue;
        }
        re_node_set_insert(cur_dest, prev_node);
    }
    return REG_NOERROR;
}

function clean_state_log_if_needed(mctx, next_state_log_idx) {
    const top = mctx.state_log_top;
    if (top < next_state_log_idx) {
        for (let i = top + 1; i <= next_state_log_idx; ++i)
            mctx.state_log[i] = null;
        mctx.state_log_top = next_state_log_idx;
    }
    return REG_NOERROR;
}

function merge_state_array(dfa, dst, src, num) {
    for (let st_idx = 0; st_idx < num; ++st_idx) {
        if (dst[st_idx] == null) {
            dst[st_idx] = src[st_idx];
        } else if (src[st_idx] != null) {
            const merged_set = re_node_set_init_union(dst[st_idx].nodes,
                src[st_idx].nodes);
            dst[st_idx] = re_acquire_state(dfa, merged_set);
        }
    }
    return REG_NOERROR;
}

function update_cur_sifted_state(mctx, sctx, str_idx, dest_nodes) {
    const dfa = mctx.dfa;
    const candidates = mctx.state_log[str_idx] == null ? null
        : mctx.state_log[str_idx].nodes;
    if (dest_nodes.nelem === 0) {
        sctx.sifted_states[str_idx] = null;
    } else {
        if (candidates) {
            // Add the nodes which can epsilon transit to a node in
            // DEST_NODE.
            add_epsilon_src_nodes(dfa, dest_nodes, candidates);
            // Then check the limitations in the current sift_context.
            if (sctx.limits.nelem) {
                check_subexp_limits(dfa, dest_nodes, candidates, sctx.limits,
                    mctx.bkref_ents, str_idx);
            }
        }
        sctx.sifted_states[str_idx] = re_acquire_state(dfa, dest_nodes);
    }
    if (candidates && mctx.state_log[str_idx].has_backref)
        sift_states_bkref(mctx, sctx, str_idx, candidates);
    return REG_NOERROR;
}

function add_epsilon_src_nodes(dfa, dest_nodes, candidates) {
    const state = re_acquire_state(dfa, dest_nodes);
    if (!state.inveclosure.alloc) {
        state.inveclosure = re_node_set_alloc(dest_nodes.nelem);
        for (let i = 0; i < dest_nodes.nelem; i++) {
            re_node_set_merge(state.inveclosure,
                dfa.inveclosures[dest_nodes.elems[i]]);
        }
    }
    re_node_set_add_intersect(dest_nodes, candidates, state.inveclosure);
    return REG_NOERROR;
}

function sub_epsilon_src_nodes(dfa, node, dest_nodes, candidates) {
    const inv_eclosure = dfa.inveclosures[node];
    const except_nodes = re_node_set_init_empty();
    for (let ecl_idx = 0; ecl_idx < inv_eclosure.nelem; ++ecl_idx) {
        const cur_node = inv_eclosure.elems[ecl_idx];
        if (cur_node === node) continue;
        if (IS_EPSILON_NODE(dfa.nodes[cur_node].type)) {
            const edst1 = dfa.edests[cur_node].elems[0];
            const edst2 = dfa.edests[cur_node].nelem > 1
                ? dfa.edests[cur_node].elems[1] : -1;
            if ((!re_node_set_contains(inv_eclosure, edst1)
                 && re_node_set_contains(dest_nodes, edst1))
                || (edst2 > 0
                    && !re_node_set_contains(inv_eclosure, edst2)
                    && re_node_set_contains(dest_nodes, edst2))) {
                re_node_set_add_intersect(except_nodes, candidates,
                    dfa.inveclosures[cur_node]);
            }
        }
    }
    for (let ecl_idx = 0; ecl_idx < inv_eclosure.nelem; ++ecl_idx) {
        const cur_node = inv_eclosure.elems[ecl_idx];
        if (!re_node_set_contains(except_nodes, cur_node)) {
            const idx = re_node_set_contains(dest_nodes, cur_node) - 1;
            re_node_set_remove_at(dest_nodes, idx);
        }
    }
    return REG_NOERROR;
}

function check_dst_limits(mctx, limits, dst_node, dst_idx, src_node,
    src_idx) {
    const dfa = mctx.dfa;
    const dst_bkref_idx = search_cur_bkref_entry(mctx, dst_idx);
    const src_bkref_idx = search_cur_bkref_entry(mctx, src_idx);
    for (let lim_idx = 0; lim_idx < limits.nelem; ++lim_idx) {
        const ent = mctx.bkref_ents[limits.elems[lim_idx]];
        const subexp_idx = dfa.nodes[ent.node].idx;
        const dst_pos = check_dst_limits_calc_pos(mctx, limits.elems[lim_idx],
            subexp_idx, dst_node, dst_idx, dst_bkref_idx);
        const src_pos = check_dst_limits_calc_pos(mctx, limits.elems[lim_idx],
            subexp_idx, src_node, src_idx, src_bkref_idx);
        // <src> <dst> ( <subexp> ), ( <subexp> ) <src> <dst>, or
        // ( <subexp1> <src> <subexp2> <dst> <subexp3> ).
        if (src_pos === dst_pos) continue;
        return true;
    }
    return false;
}

function check_dst_limits_calc_pos_1(mctx, boundaries, subexp_idx, from_node,
    bkref_idx) {
    const dfa = mctx.dfa;
    const eclosures = dfa.eclosures[from_node];
    for (let node_idx = 0; node_idx < eclosures.nelem; ++node_idx) {
        const node = eclosures.elems[node_idx];
        switch (dfa.nodes[node].type) {
        case OP_BACK_REF:
            if (bkref_idx !== -1) {
                let entIdx = bkref_idx;
                let ent;
                do {
                    ent = mctx.bkref_ents[entIdx];
                    if (ent.node !== node) continue;
                    if (subexp_idx < 64 && !epsReachable(ent, subexp_idx))
                        continue;
                    // Recurse toward the OP_OPEN_SUBEXP and OP_CLOSE_SUBEXP
                    // cases below, except for a loop such as ()\1*\1*.
                    const dst = dfa.edests[node].elems[0];
                    if (dst === from_node) {
                        if (boundaries & 1) return -1;
                        return 0;
                    }
                    const cpos = check_dst_limits_calc_pos_1(mctx, boundaries,
                        subexp_idx, dst, bkref_idx);
                    if (cpos === -1) return -1;
                    if (cpos === 0 && (boundaries & 2)) return 0;
                    if (subexp_idx < 64) clearEpsReachable(ent, subexp_idx);
                } while (mctx.bkref_ents[entIdx++].more);
            }
            break;
        case OP_OPEN_SUBEXP:
            if ((boundaries & 1) && subexp_idx === dfa.nodes[node].idx)
                return -1;
            break;
        case OP_CLOSE_SUBEXP:
            if ((boundaries & 2) && subexp_idx === dfa.nodes[node].idx)
                return 0;
            break;
        default:
            break;
        }
    }
    return (boundaries & 2) ? 1 : 0;
}

function check_dst_limits_calc_pos(mctx, limit, subexp_idx, from_node,
    str_idx, bkref_idx) {
    const lim = mctx.bkref_ents[limit];
    // Outside the range of the subexpression: -1 or 1.
    if (str_idx < lim.subexp_from) return -1;
    if (lim.subexp_to < str_idx) return 1;
    // Within the subexpression: 0.
    let boundaries = str_idx === lim.subexp_from ? 1 : 0;
    boundaries |= (str_idx === lim.subexp_to ? 1 : 0) << 1;
    if (boundaries === 0) return 0;
    // Else, examine epsilon closure.
    return check_dst_limits_calc_pos_1(mctx, boundaries, subexp_idx,
        from_node, bkref_idx);
}

// Remove from DEST_NODES the nodes against the limitations LIMITS.
function check_subexp_limits(dfa, dest_nodes, candidates, limits, bkref_ents,
    str_idx) {
    for (let lim_idx = 0; lim_idx < limits.nelem; ++lim_idx) {
        const ent = bkref_ents[limits.elems[lim_idx]];
        if (str_idx <= ent.subexp_from || ent.str_idx < str_idx) continue;
        const subexp_idx = dfa.nodes[ent.node].idx;
        if (ent.subexp_to === str_idx) {
            let ops_node = -1;
            let cls_node = -1;
            for (let node_idx = 0; node_idx < dest_nodes.nelem; ++node_idx) {
                const node = dest_nodes.elems[node_idx];
                const type = dfa.nodes[node].type;
                if (type === OP_OPEN_SUBEXP && subexp_idx === dfa.nodes[node].idx)
                    ops_node = node;
                else if (type === OP_CLOSE_SUBEXP
                         && subexp_idx === dfa.nodes[node].idx)
                    cls_node = node;
            }
            // Check the limitation of the open subexpression.
            if (ops_node >= 0)
                sub_epsilon_src_nodes(dfa, ops_node, dest_nodes, candidates);
            // Check the limitation of the close subexpression.
            if (cls_node >= 0) {
                for (let node_idx = 0; node_idx < dest_nodes.nelem; ++node_idx) {
                    const node = dest_nodes.elems[node_idx];
                    if (!re_node_set_contains(dfa.inveclosures[node], cls_node)
                        && !re_node_set_contains(dfa.eclosures[node], cls_node)) {
                        // It is against this limitation.
                        sub_epsilon_src_nodes(dfa, node, dest_nodes, candidates);
                        --node_idx;
                    }
                }
            }
        } else {
            for (let node_idx = 0; node_idx < dest_nodes.nelem; ++node_idx) {
                const node = dest_nodes.elems[node_idx];
                const type = dfa.nodes[node].type;
                if (type === OP_CLOSE_SUBEXP || type === OP_OPEN_SUBEXP) {
                    if (subexp_idx !== dfa.nodes[node].idx) continue;
                    // It is against this limitation.
                    sub_epsilon_src_nodes(dfa, node, dest_nodes, candidates);
                }
            }
        }
    }
    return REG_NOERROR;
}

function sift_states_bkref(mctx, sctx, str_idx, candidates) {
    const dfa = mctx.dfa;
    const first_idx = search_cur_bkref_entry(mctx, str_idx);
    if (first_idx === -1) return REG_NOERROR;
    // local_sctx is a struct copy of SCTX: it shares SIFTED_STATES and
    // LIMITED_STATES with it and owns a copy of LIMITS.
    let local_sctx = null;
    for (let node_idx = 0; node_idx < candidates.nelem; ++node_idx) {
        const node = candidates.elems[node_idx];
        const type = dfa.nodes[node].type;
        // Avoid infinite loop for the REs like "()\1+".
        if (node === sctx.last_node && str_idx === sctx.last_str_idx) continue;
        if (type !== OP_BACK_REF) continue;
        let enabled_idx = first_idx;
        let entry;
        do {
            entry = mctx.bkref_ents[enabled_idx];
            if (entry.node !== node) continue;
            const subexp_len = entry.subexp_to - entry.subexp_from;
            const to_idx = str_idx + subexp_len;
            const dst_node = subexp_len ? dfa.nexts[node]
                : dfa.edests[node].elems[0];
            if (to_idx > sctx.last_str_idx
                || sctx.sifted_states[to_idx] == null
                || !STATE_NODE_CONTAINS(sctx.sifted_states[to_idx], dst_node)
                || check_dst_limits(mctx, sctx.limits, node, str_idx,
                    dst_node, to_idx)) continue;
            if (local_sctx == null) {
                local_sctx = { ...sctx, limits: re_node_set_init_copy(sctx.limits) };
            }
            local_sctx.last_node = node;
            local_sctx.last_str_idx = str_idx;
            re_node_set_insert(local_sctx.limits, enabled_idx);
            const cur_state = local_sctx.sifted_states[str_idx];
            sift_states_backward(mctx, local_sctx);
            if (sctx.limited_states != null) {
                merge_state_array(dfa, sctx.limited_states,
                    local_sctx.sifted_states, str_idx + 1);
            }
            local_sctx.sifted_states[str_idx] = cur_state;
            re_node_set_remove(local_sctx.limits, enabled_idx);
        } while (enabled_idx++, mctx.bkref_ents[enabled_idx - 1].more);
    }
    return REG_NOERROR;
}

// Return the state STATE moves to on the current input byte, and update
// the state log if necessary.
function transit_state(mctx, state) {
    const ch = re_string_byte_at(mctx.input, mctx.input.cur_idx++);
    for (;;) {
        let trtable = state.trtable;
        if (trtable != null) return trtable[ch];
        trtable = state.word_trtable;
        if (trtable != null) {
            const context = re_string_context_at(mctx.input,
                mctx.input.cur_idx - 1, mctx.eflags);
            if (IS_WORD_CONTEXT(context)) return trtable[ch + SBC_MAX];
            return trtable[ch];
        }
        build_trtable(mctx.dfa, state);
    }
}

// Update the state_log if we need.
function merge_state_with_log(mctx, next_state) {
    const dfa = mctx.dfa;
    const cur_idx = mctx.input.cur_idx;
    if (cur_idx > mctx.state_log_top) {
        mctx.state_log[cur_idx] = next_state;
        mctx.state_log_top = cur_idx;
    } else if (mctx.state_log[cur_idx] == null) {
        mctx.state_log[cur_idx] = next_state;
    } else {
        // state_log[cur_idx] is the destination of a backreference: the
        // next state is the union of those nodes and the transition's.
        const pstate = mctx.state_log[cur_idx];
        const log_nodes = pstate.entrance_nodes;
        let next_nodes;
        if (next_state != null) {
            const table_nodes = next_state.entrance_nodes;
            next_nodes = re_node_set_init_union(table_nodes, log_nodes);
        } else {
            next_nodes = log_nodes;
        }
        const context = re_string_context_at(mctx.input,
            mctx.input.cur_idx - 1, mctx.eflags);
        next_state = mctx.state_log[cur_idx]
            = re_acquire_state_context(dfa, next_nodes, context);
    }
    if (dfa.nbackref && next_state != null) {
        // Register OP_OPEN_SUBEXP in the current state for backreferences
        // in the next state.
        check_subexp_matching_top(mctx, next_state.nodes, cur_idx);
        if (next_state.has_backref) {
            transit_state_bkref(mctx, next_state.nodes);
            next_state = mctx.state_log[cur_idx];
        }
    }
    return next_state;
}

// Skip input to the next logged state and restart matching from it.
function find_recover_state(mctx) {
    let cur_state;
    do {
        const max = mctx.state_log_top;
        let cur_str_idx = mctx.input.cur_idx;
        do {
            if (++cur_str_idx > max) return null;
            mctx.input.cur_idx += 1;
        } while (mctx.state_log[cur_str_idx] == null);
        cur_state = merge_state_with_log(mctx, null);
    } while (cur_state == null);
    return cur_state;
}

// Register the OP_OPEN_SUBEXP nodes in CUR_NODES that some backreference
// uses.
function check_subexp_matching_top(mctx, cur_nodes, str_idx) {
    const dfa = mctx.dfa;
    for (let node_idx = 0; node_idx < cur_nodes.nelem; ++node_idx) {
        const node = cur_nodes.elems[node_idx];
        if (dfa.nodes[node].type === OP_OPEN_SUBEXP
            && dfa.nodes[node].idx < 31
            && (dfa.used_bkref_map & (1 << dfa.nodes[node].idx)))
            match_ctx_add_subtop(mctx, node, str_idx);
    }
    return REG_NOERROR;
}

function transit_state_bkref(mctx, nodes) {
    const dfa = mctx.dfa;
    const cur_str_idx = mctx.input.cur_idx;
    for (let i = 0; i < nodes.nelem; ++i) {
        const node_idx = nodes.elems[i];
        const node = dfa.nodes[node_idx];
        if (node.type !== OP_BACK_REF) continue;
        if (node.constraint) {
            const context = re_string_context_at(mctx.input, cur_str_idx,
                mctx.eflags);
            if (NOT_SATISFY_NEXT_CONSTRAINT(node.constraint, context)) continue;
        }
        // Check the substring which the subexpression matched.
        let bkc_idx = mctx.nbkref_ents;
        get_subexp(mctx, node_idx, cur_str_idx);
        // Add the epsilon closures of the backreference to the state log.
        for (; bkc_idx < mctx.nbkref_ents; ++bkc_idx) {
            const bkref_ent = mctx.bkref_ents[bkc_idx];
            if (bkref_ent.node !== node_idx || bkref_ent.str_idx !== cur_str_idx)
                continue;
            const subexp_len = bkref_ent.subexp_to - bkref_ent.subexp_from;
            const new_dest_nodes = subexp_len === 0
                ? dfa.eclosures[dfa.edests[node_idx].elems[0]]
                : dfa.eclosures[dfa.nexts[node_idx]];
            const dest_str_idx = cur_str_idx + bkref_ent.subexp_to
                - bkref_ent.subexp_from;
            const context = re_string_context_at(mctx.input, dest_str_idx - 1,
                mctx.eflags);
            const dest_state = mctx.state_log[dest_str_idx];
            const prev_nelem = mctx.state_log[cur_str_idx] == null ? 0
                : mctx.state_log[cur_str_idx].nodes.nelem;
            if (dest_state == null) {
                mctx.state_log[dest_str_idx] = re_acquire_state_context(dfa,
                    new_dest_nodes, context);
            } else {
                const dest_nodes = re_node_set_init_union(
                    dest_state.entrance_nodes, new_dest_nodes);
                mctx.state_log[dest_str_idx] = re_acquire_state_context(dfa,
                    dest_nodes, context);
            }
            // Check recursively whether the backreference can epsilon
            // transit.
            if (subexp_len === 0
                && mctx.state_log[cur_str_idx].nodes.nelem > prev_nelem) {
                check_subexp_matching_top(mctx, new_dest_nodes, cur_str_idx);
                transit_state_bkref(mctx, new_dest_nodes);
            }
        }
    }
    return REG_NOERROR;
}

// Register every candidate span the backreference BKREF_NODE can match at
// BKREF_STR_IDX. Inappropriate candidates are pruned later, by
// prune_impossible_nodes().
function get_subexp(mctx, bkref_node, bkref_str_idx) {
    const dfa = mctx.dfa;
    const input = mctx.input;
    // Return if we have already checked BKREF_NODE at BKREF_STR_IDX.
    const cache_idx = search_cur_bkref_entry(mctx, bkref_str_idx);
    if (cache_idx !== -1) {
        let entIdx = cache_idx;
        do {
            if (mctx.bkref_ents[entIdx].node === bkref_node) return REG_NOERROR;
        } while (mctx.bkref_ents[entIdx++].more);
    }
    const subexp_num = dfa.nodes[bkref_node].idx;
    // For each subexpression.
    for (let sub_top_idx = 0; sub_top_idx < mctx.nsub_tops; ++sub_top_idx) {
        const sub_top = mctx.sub_tops[sub_top_idx];
        if (dfa.nodes[sub_top.node].idx !== subexp_num) continue;
        let sl_str = sub_top.str_idx;
        let bkref_str_off = bkref_str_idx;
        // First, check the last nodes of subexpressions already evaluated.
        let sub_last_idx;
        for (sub_last_idx = 0; sub_last_idx < sub_top.nlasts; ++sub_last_idx) {
            const sub_last = sub_top.lasts[sub_last_idx];
            const sl_str_diff = sub_last.str_idx - sl_str;
            // Does the substring the subexpression matched match the one at
            // the backreference?
            if (sl_str_diff > 0) {
                if (bkref_str_off + sl_str_diff > input.len) break;
                let same = true;
                for (let k = 0; k < sl_str_diff; ++k) {
                    if (re_string_byte_at(input, bkref_str_off + k)
                        !== re_string_byte_at(input, sl_str + k)) {
                        same = false;
                        break;
                    }
                }
                // We don't need to search this subexpression any more.
                if (!same) break;
            }
            bkref_str_off += sl_str_diff;
            sl_str += sl_str_diff;
            get_subexp_sub(mctx, sub_top, sub_last, bkref_node, bkref_str_idx);
        }
        if (sub_last_idx < sub_top.nlasts) continue;
        if (sub_last_idx > 0) ++sl_str;
        // Then, search for the other last nodes of the subexpression.
        for (; sl_str <= bkref_str_idx; ++sl_str) {
            const sl_str_off = sl_str - sub_top.str_idx;
            if (sl_str_off > 0) {
                // At the end of the input, we cannot match.
                if (bkref_str_off >= input.len) break;
                if (re_string_byte_at(input, bkref_str_off++)
                    !== re_string_byte_at(input, sl_str - 1)) break;
            }
            if (mctx.state_log[sl_str] == null) continue;
            // Does this state have a ')' of the subexpression?
            const nodes = mctx.state_log[sl_str].nodes;
            const cls_node = find_subexp_node(dfa, nodes, subexp_num,
                OP_CLOSE_SUBEXP);
            if (cls_node === -1) continue;
            if (sub_top.path == null)
                sub_top.path = { next_idx: 0, alloc: 0, array: [] };
            // Can the OP_OPEN_SUBEXP node arrive at the OP_CLOSE_SUBEXP node
            // in the current context?
            const err = check_arrival(mctx, sub_top.path, sub_top.node,
                sub_top.str_idx, cls_node, sl_str, OP_CLOSE_SUBEXP);
            if (err === REG_NOMATCH) continue;
            const sub_last = match_ctx_add_sublast(sub_top, cls_node, sl_str);
            get_subexp_sub(mctx, sub_top, sub_last, bkref_node, bkref_str_idx);
        }
    }
    return REG_NOERROR;
}

// If SUB_LAST can arrive at the backreference BKREF_NODE at BKREF_STR,
// register the span SUB_TOP to SUB_LAST.
function get_subexp_sub(mctx, sub_top, sub_last, bkref_node, bkref_str) {
    const err = check_arrival(mctx, sub_last.path, sub_last.node,
        sub_last.str_idx, bkref_node, bkref_str, OP_OPEN_SUBEXP);
    if (err !== REG_NOERROR) return err;
    match_ctx_add_entry(mctx, bkref_node, bkref_str, sub_top.str_idx,
        sub_last.str_idx);
    const to_idx = bkref_str + sub_last.str_idx - sub_top.str_idx;
    return clean_state_log_if_needed(mctx, to_idx);
}

// Find the first '(' or ')' node (by TYPE) whose index is SUBEXP_IDX.
function find_subexp_node(dfa, nodes, subexp_idx, type) {
    for (let cls_idx = 0; cls_idx < nodes.nelem; ++cls_idx) {
        const cls_node = nodes.elems[cls_idx];
        const node = dfa.nodes[cls_node];
        if (node.type === type && node.idx === subexp_idx) return cls_node;
    }
    return -1;
}

// Can TOP_NODE at TOP_STR arrive at LAST_NODE at LAST_STR? PATH records
// the walk; a later call resumes it from path.next_idx.
function check_arrival(mctx, path, top_node, top_str, last_node, last_str,
    type) {
    const dfa = mctx.dfa;
    const subexp_num = dfa.nodes[top_node].idx;
    let cur_state = null;
    let next_nodes;

    // Extend the buffer if we need. glibc zeroes the new entries; an unset
    // JS array entry reads as undefined, which every reader treats as NULL.
    if (path.alloc < last_str + mctx.max_mb_elem_len + 1)
        path.alloc += last_str + mctx.max_mb_elem_len + 1;
    let str_idx = path.next_idx ? path.next_idx : top_str;

    // Temporarily modify MCTX.
    const backup_state_log = mctx.state_log;
    const backup_cur_idx = mctx.input.cur_idx;
    mctx.state_log = path.array;
    mctx.input.cur_idx = str_idx;

    // Set up the initial node set.
    let context = re_string_context_at(mctx.input, str_idx - 1, mctx.eflags);
    if (str_idx === top_str) {
        next_nodes = re_node_set_init_1(top_node);
        check_arrival_expand_ecl(dfa, next_nodes, subexp_num, type);
    } else {
        cur_state = mctx.state_log[str_idx];
        if (cur_state && cur_state.has_backref)
            next_nodes = re_node_set_init_copy(cur_state.nodes);
        else
            next_nodes = re_node_set_init_empty();
    }
    if (str_idx === top_str || (cur_state && cur_state.has_backref)) {
        if (next_nodes.nelem)
            expand_bkref_cache(mctx, next_nodes, str_idx, subexp_num, type);
        cur_state = re_acquire_state_context(dfa, next_nodes, context);
        mctx.state_log[str_idx] = cur_state;
    }

    for (let null_cnt = 0;
        str_idx < last_str && null_cnt <= mctx.max_mb_elem_len;) {
        re_node_set_empty(next_nodes);
        if (mctx.state_log[str_idx + 1])
            re_node_set_merge(next_nodes, mctx.state_log[str_idx + 1].nodes);
        if (cur_state) {
            check_arrival_add_next_nodes(mctx, str_idx,
                cur_state.non_eps_nodes, next_nodes);
        }
        ++str_idx;
        if (next_nodes.nelem) {
            check_arrival_expand_ecl(dfa, next_nodes, subexp_num, type);
            expand_bkref_cache(mctx, next_nodes, str_idx, subexp_num, type);
        }
        context = re_string_context_at(mctx.input, str_idx - 1, mctx.eflags);
        cur_state = re_acquire_state_context(dfa, next_nodes, context);
        mctx.state_log[str_idx] = cur_state;
        null_cnt = cur_state == null ? null_cnt + 1 : 0;
    }
    const cur_nodes = mctx.state_log[last_str] == null ? null
        : mctx.state_log[last_str].nodes;
    path.next_idx = str_idx;

    // Fix MCTX.
    mctx.state_log = backup_state_log;
    mctx.input.cur_idx = backup_cur_idx;

    // Then check the current node set has the node LAST_NODE.
    if (cur_nodes != null && re_node_set_contains(cur_nodes, last_node))
        return REG_NOERROR;
    return REG_NOMATCH;
}

// Append to NEXT_NODES the destinations of CUR_NODES at STR_IDX.
function check_arrival_add_next_nodes(mctx, str_idx, cur_nodes, next_nodes) {
    const dfa = mctx.dfa;
    for (let cur_idx = 0; cur_idx < cur_nodes.nelem; ++cur_idx) {
        const cur_node = cur_nodes.elems[cur_idx];
        if (check_node_accept(mctx, dfa.nodes[cur_node], str_idx))
            re_node_set_insert(next_nodes, dfa.nexts[cur_node]);
    }
    return REG_NOERROR;
}

// Add to CUR_NODES the epsilon closures of its nodes, excluding the nodes
// inside subexpression EX_SUBEXP for OP_OPEN_SUBEXP, or outside it for
// OP_CLOSE_SUBEXP.
function check_arrival_expand_ecl(dfa, cur_nodes, ex_subexp, type) {
    const new_nodes = re_node_set_alloc(cur_nodes.nelem);
    for (let idx = 0; idx < cur_nodes.nelem; ++idx) {
        const cur_node = cur_nodes.elems[idx];
        const eclosure = dfa.eclosures[cur_node];
        const outside_node = find_subexp_node(dfa, eclosure, ex_subexp, type);
        if (outside_node === -1) {
            // There are no problematic nodes, just merge them.
            re_node_set_merge(new_nodes, eclosure);
        } else {
            // There are problematic nodes, re-calculate incrementally.
            check_arrival_expand_ecl_sub(dfa, new_nodes, cur_node, ex_subexp,
                type);
        }
    }
    cur_nodes.alloc = new_nodes.alloc;
    cur_nodes.nelem = new_nodes.nelem;
    cur_nodes.elems = new_nodes.elems;
    return REG_NOERROR;
}

function check_arrival_expand_ecl_sub(dfa, dst_nodes, target, ex_subexp,
    type) {
    for (let cur_node = target; !re_node_set_contains(dst_nodes, cur_node);) {
        if (dfa.nodes[cur_node].type === type
            && dfa.nodes[cur_node].idx === ex_subexp) {
            if (type === OP_CLOSE_SUBEXP) re_node_set_insert(dst_nodes, cur_node);
            break;
        }
        re_node_set_insert(dst_nodes, cur_node);
        if (dfa.edests[cur_node].nelem === 0) break;
        if (dfa.edests[cur_node].nelem === 2) {
            check_arrival_expand_ecl_sub(dfa, dst_nodes,
                dfa.edests[cur_node].elems[1], ex_subexp, type);
        }
        cur_node = dfa.edests[cur_node].elems[0];
    }
    return REG_NOERROR;
}

// For the backreferences in CUR_NODES, add their destinations from the
// backreference cache to the state log.
function expand_bkref_cache(mctx, cur_nodes, cur_str, subexp_num, type) {
    const dfa = mctx.dfa;
    const cache_idx_start = search_cur_bkref_entry(mctx, cur_str);
    if (cache_idx_start === -1) return REG_NOERROR;
    restart: for (;;) {
        let entIdx = cache_idx_start;
        let ent;
        do {
            ent = mctx.bkref_ents[entIdx];
            if (!re_node_set_contains(cur_nodes, ent.node)) continue;
            const to_idx = cur_str + ent.subexp_to - ent.subexp_from;
            if (to_idx === cur_str) {
                // The backreference did epsilon transit: re-check all the
                // nodes in the current state.
                const next_node = dfa.edests[ent.node].elems[0];
                if (re_node_set_contains(cur_nodes, next_node)) continue;
                const new_dests = re_node_set_init_1(next_node);
                check_arrival_expand_ecl(dfa, new_dests, subexp_num, type);
                re_node_set_merge(cur_nodes, new_dests);
                continue restart;
            } else {
                const next_node = dfa.nexts[ent.node];
                let union_set;
                if (mctx.state_log[to_idx]) {
                    if (re_node_set_contains(mctx.state_log[to_idx].nodes,
                        next_node)) continue;
                    union_set = re_node_set_init_copy(
                        mctx.state_log[to_idx].nodes);
                    re_node_set_insert(union_set, next_node);
                } else {
                    union_set = re_node_set_init_1(next_node);
                }
                mctx.state_log[to_idx] = re_acquire_state(dfa, union_set);
            }
        } while (mctx.bkref_ents[entIdx++].more);
        return REG_NOERROR;
    }
}

// Build the transition table of STATE (build_trtable()). With MB_CUR_MAX 1
// the word-context table is never needed.
function build_trtable(dfa, state) {
    state.word_trtable = state.trtable = null;
    const dests_node = [];
    const dests_ch = [];
    const ndests = group_nodes_into_DFAstates(dfa, state, dests_node, dests_ch);
    if (ndests <= 0) {
        state.trtable = new Array(SBC_MAX).fill(null);
        return true;
    }
    const dest_states = [];
    const dest_states_word = [];
    const dest_states_nl = [];
    const acceptable = bitset_new();
    const follows = re_node_set_alloc(ndests + 1);
    // Build the states for all destinations.
    for (let i = 0; i < ndests; ++i) {
        re_node_set_empty(follows);
        for (let j = 0; j < dests_node[i].nelem; ++j) {
            const next_node = dfa.nexts[dests_node[i].elems[j]];
            if (next_node !== -1) re_node_set_merge(follows, dfa.eclosures[next_node]);
        }
        dest_states[i] = re_acquire_state_context(dfa, follows, 0);
        // If the new state has context constraint, build appropriate states
        // for these contexts.
        if (dest_states[i].has_constraint) {
            dest_states_word[i] = re_acquire_state_context(dfa, follows,
                CONTEXT_WORD);
            dest_states_nl[i] = re_acquire_state_context(dfa, follows,
                CONTEXT_NEWLINE);
        } else {
            dest_states_word[i] = dest_states[i];
            dest_states_nl[i] = dest_states[i];
        }
        for (let ch = 0; ch < SBC_MAX; ++ch) {
            if (dests_ch[i][ch]) acceptable[ch] = 1;
        }
    }
    const trtable = state.trtable = new Array(SBC_MAX).fill(null);
    for (let ch = 0; ch < SBC_MAX; ++ch) {
        if (!acceptable[ch]) continue;
        // Exactly one destination accepts ch.
        let j;
        for (j = 0; !dests_ch[j][ch]; ++j);
        trtable[ch] = dfa.word_char[ch] ? dest_states_word[j] : dest_states[j];
    }
    // new line
    if (acceptable[NEWLINE_CHAR]) {
        for (let j = 0; j < ndests; ++j) {
            if (dests_ch[j][NEWLINE_CHAR]) {
                trtable[NEWLINE_CHAR] = dest_states_nl[j];
                break;
            }
        }
    }
    return true;
}

// Group the nodes of STATE into destinations: DESTS_NODE[i] holds the nodes
// of the i-th destination and DESTS_CH[i] the bytes that lead to it.
function group_nodes_into_DFAstates(dfa, state, dests_node, dests_ch) {
    const accepts = bitset_new();
    const cur_nodes = state.nodes;
    let ndests = 0;
    for (let i = 0; i < cur_nodes.nelem; ++i) {
        const node = dfa.nodes[cur_nodes.elems[i]];
        const type = node.type;
        const constraint = node.constraint;
        // Enumerate all single byte characters this node can accept.
        if (type === CHARACTER) {
            accepts[node.c] = 1;
        } else if (type === SIMPLE_BRACKET) {
            for (let ch = 0; ch < SBC_MAX; ++ch) {
                if (node.sbcset[ch]) accepts[ch] = 1;
            }
        } else if (type === OP_PERIOD) {
            accepts.fill(1);
            if (!(dfa.syntax & RE_DOT_NEWLINE)) accepts[0x0a] = 0;
            if (dfa.syntax & RE_DOT_NOT_NULL) accepts[0] = 0;
        } else {
            continue;
        }
        // Remove the characters which do not match the context.
        if (constraint) {
            if (constraint & NEXT_NEWLINE_CONSTRAINT) {
                const accepts_newline = accepts[NEWLINE_CHAR];
                accepts.fill(0);
                if (accepts_newline) accepts[NEWLINE_CHAR] = 1;
                else continue;
            }
            if (constraint & NEXT_ENDBUF_CONSTRAINT) {
                accepts.fill(0);
                continue;
            }
            if (constraint & NEXT_WORD_CONSTRAINT) {
                if (type === CHARACTER && !node.word_char) {
                    accepts.fill(0);
                    continue;
                }
                let any_set = false;
                for (let ch = 0; ch < SBC_MAX; ++ch) {
                    accepts[ch] &= dfa.word_char[ch];
                    if (accepts[ch]) any_set = true;
                }
                if (!any_set) continue;
            }
            if (constraint & NEXT_NOTWORD_CONSTRAINT) {
                if (type === CHARACTER && node.word_char) {
                    accepts.fill(0);
                    continue;
                }
                let any_set = false;
                for (let ch = 0; ch < SBC_MAX; ++ch) {
                    accepts[ch] &= dfa.word_char[ch] ? 0 : 1;
                    if (accepts[ch]) any_set = true;
                }
                if (!any_set) continue;
            }
        }
        // Then divide 'accepts' into DFA states, or create a new state.
        let j;
        for (j = 0; j < ndests; ++j) {
            // Optimization, skip if this state doesn't accept the character.
            if (type === CHARACTER && !dests_ch[j][node.c]) continue;
            const intersec = bitset_new();
            const remains = bitset_new();
            let has_intersec = false;
            for (let ch = 0; ch < SBC_MAX; ++ch) {
                intersec[ch] = accepts[ch] & dests_ch[j][ch];
                if (intersec[ch]) has_intersec = true;
            }
            if (!has_intersec) continue;
            let not_subset = false;
            let not_consumed = false;
            for (let ch = 0; ch < SBC_MAX; ++ch) {
                remains[ch] = accepts[ch] ? 0 : dests_ch[j][ch];
                if (remains[ch]) not_subset = true;
                accepts[ch] = dests_ch[j][ch] ? 0 : accepts[ch];
                if (accepts[ch]) not_consumed = true;
            }
            // If this state isn't a subset of 'accepts', create a new group
            // state, which has the 'remains'.
            if (not_subset) {
                dests_ch[ndests] = remains;
                dests_ch[j] = intersec;
                dests_node[ndests] = re_node_set_init_copy(dests_node[j]);
                ++ndests;
            }
            // Put the position in the current group.
            re_node_set_insert(dests_node[j], cur_nodes.elems[i]);
            // If all characters are consumed, go to next node.
            if (!not_consumed) break;
        }
        // Some characters remain, create a new group.
        if (j === ndests) {
            dests_ch[ndests] = accepts.slice();
            dests_node[ndests] = re_node_set_init_1(cur_nodes.elems[i]);
            ++ndests;
            accepts.fill(0);
        }
    }
    return ndests;
}

// Does NODE accept the byte at IDX of the input?
function check_node_accept(mctx, node, idx) {
    const ch = re_string_byte_at(mctx.input, idx);
    switch (node.type) {
    case CHARACTER:
        if (node.c !== ch) return false;
        break;
    case SIMPLE_BRACKET:
        if (!node.sbcset[ch]) return false;
        break;
    case OP_PERIOD:
        if ((ch === 0x0a && !(mctx.dfa.syntax & RE_DOT_NEWLINE))
            || (ch === 0 && (mctx.dfa.syntax & RE_DOT_NOT_NULL))) return false;
        break;
    default:
        return false;
    }
    if (node.constraint) {
        // The node has constraints: check the current context.
        const context = re_string_context_at(mctx.input, idx, mctx.eflags);
        if (NOT_SATISFY_NEXT_CONSTRAINT(node.constraint, context)) return false;
    }
    return true;
}

function match_ctx_init(mctx, eflags, _n) {
    mctx.eflags = eflags;
    mctx.match_last = -1;
    mctx.max_mb_elem_len = 1;
}

// Clean the entries which depend on the current input.
function match_ctx_clean(mctx) {
    mctx.sub_tops.length = 0;
    mctx.nsub_tops = 0;
    mctx.nbkref_ents = 0;
    mctx.bkref_ents.length = 0;
}

// Add a backreference entry. Callers pass nondecreasing STR_IDX values and
// no duplicate entry.
function match_ctx_add_entry(mctx, node, str_idx, from, to) {
    if (mctx.nbkref_ents > 0
        && mctx.bkref_ents[mctx.nbkref_ents - 1].str_idx === str_idx)
        mctx.bkref_ents[mctx.nbkref_ents - 1].more = 1;
    // eps_reachable_subexps_map caches negative results of
    // check_dst_limits_calc_pos(); a nonempty backreference does not
    // epsilon transit, so it starts empty.
    mctx.bkref_ents[mctx.nbkref_ents++] = {
        node,
        str_idx,
        subexp_from: from,
        subexp_to: to,
        eps_lo: from === to ? -1 : 0,
        eps_hi: from === to ? -1 : 0,
        more: 0,
    };
    if (mctx.max_mb_elem_len < to - from) mctx.max_mb_elem_len = to - from;
    return REG_NOERROR;
}

// Return the first entry with STR_IDX, or -1. The entries are sorted by
// str_idx.
function search_cur_bkref_entry(mctx, str_idx) {
    let left = 0;
    let right = mctx.nbkref_ents;
    const last = right;
    while (left < right) {
        const mid = (left + right) >>> 1;
        if (mctx.bkref_ents[mid].str_idx < str_idx) left = mid + 1;
        else right = mid;
    }
    if (left < last && mctx.bkref_ents[left].str_idx === str_idx) return left;
    return -1;
}

// Register NODE, an OP_OPEN_SUBEXP matching at STR_IDX.
function match_ctx_add_subtop(mctx, node, str_idx) {
    mctx.sub_tops[mctx.nsub_tops++] = {
        str_idx,
        node,
        path: null,
        nlasts: 0,
        lasts: [],
    };
    return REG_NOERROR;
}

// Register NODE, an OP_CLOSE_SUBEXP matching at STR_IDX, for SUBTOP.
function match_ctx_add_sublast(subtop, node, str_idx) {
    const new_entry = {
        node,
        str_idx,
        path: { next_idx: 0, alloc: 0, array: [] },
    };
    subtop.lasts[subtop.nlasts++] = new_entry;
    return new_entry;
}

function sift_ctx_init(sifted_sts, limited_sts, last_node, last_str_idx) {
    return {
        sifted_states: sifted_sts,
        limited_states: limited_sts,
        last_node,
        last_str_idx,
        limits: re_node_set_init_empty(),
    };
}

