// SPDX-License-Identifier: LGPL-2.1-or-later
//
// This file is a JavaScript translation of glibc 2.39 posix/regex_internal.c.
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
// regex_internal.js -- glibc 2.39 posix/regex_internal.h and regex_internal.c.
//
// The recorder links glibc's regcomp()/regexec() (sys/share/posixregex.c),
// and NetHack never calls setlocale(), so libc runs in the "C" locale:
// MB_CUR_MAX is 1, there is no translate table, no REG_ICASE and no
// REG_NEWLINE. This file keeps only those paths. Strings are byte strings:
// one JS character from U+0000 to U+00FF per C byte.
//
// glibc's node sets are sorted arrays that can hold a duplicate element
// when a caller inserts one already present (regexec.c
// check_arrival_add_next_nodes() does), and the hashing, comparison and
// merge code then sees it. The set operations below therefore copy the C
// array algorithms literally instead of using an abstract set.

// regex.h error codes.
export const REG_NOERROR = 0;
export const REG_NOMATCH = 1;
export const REG_BADPAT = 2;
export const REG_ECOLLATE = 3;
export const REG_ECTYPE = 4;
export const REG_EESCAPE = 5;
export const REG_ESUBREG = 6;
export const REG_EBRACK = 7;
export const REG_EPAREN = 8;
export const REG_EBRACE = 9;
export const REG_BADBR = 10;
export const REG_ERANGE = 11;
export const REG_ESPACE = 12;
export const REG_BADRPT = 13;
export const REG_EEND = 14;
export const REG_ESIZE = 15;
export const REG_ERPAREN = 16;

// regex.h syntax bits.
export const RE_BACKSLASH_ESCAPE_IN_LISTS = 1;
export const RE_BK_PLUS_QM = RE_BACKSLASH_ESCAPE_IN_LISTS * 2;
export const RE_CHAR_CLASSES = RE_BK_PLUS_QM * 2;
export const RE_CONTEXT_INDEP_ANCHORS = RE_CHAR_CLASSES * 2;
export const RE_CONTEXT_INDEP_OPS = RE_CONTEXT_INDEP_ANCHORS * 2;
export const RE_CONTEXT_INVALID_OPS = RE_CONTEXT_INDEP_OPS * 2;
export const RE_DOT_NEWLINE = RE_CONTEXT_INVALID_OPS * 2;
export const RE_DOT_NOT_NULL = RE_DOT_NEWLINE * 2;
export const RE_HAT_LISTS_NOT_NEWLINE = RE_DOT_NOT_NULL * 2;
export const RE_INTERVALS = RE_HAT_LISTS_NOT_NEWLINE * 2;
export const RE_LIMITED_OPS = RE_INTERVALS * 2;
export const RE_NEWLINE_ALT = RE_LIMITED_OPS * 2;
export const RE_NO_BK_BRACES = RE_NEWLINE_ALT * 2;
export const RE_NO_BK_PARENS = RE_NO_BK_BRACES * 2;
export const RE_NO_BK_REFS = RE_NO_BK_PARENS * 2;
export const RE_NO_BK_VBAR = RE_NO_BK_REFS * 2;
export const RE_NO_EMPTY_RANGES = RE_NO_BK_VBAR * 2;
export const RE_UNMATCHED_RIGHT_PAREN_ORD = RE_NO_EMPTY_RANGES * 2;
export const RE_NO_POSIX_BACKTRACKING = RE_UNMATCHED_RIGHT_PAREN_ORD * 2;
export const RE_NO_GNU_OPS = RE_NO_POSIX_BACKTRACKING * 2;
export const RE_DEBUG = RE_NO_GNU_OPS * 2;
export const RE_INVALID_INTERVAL_ORD = RE_DEBUG * 2;
export const RE_ICASE = RE_INVALID_INTERVAL_ORD * 2;
export const RE_CARET_ANCHORS_HERE = RE_ICASE * 2;
export const RE_CONTEXT_INVALID_DUP = RE_CARET_ANCHORS_HERE * 2;
export const RE_NO_SUB = RE_CONTEXT_INVALID_DUP * 2;
export const RE_SYNTAX_POSIX_EXTENDED = RE_CHAR_CLASSES | RE_DOT_NEWLINE
    | RE_DOT_NOT_NULL | RE_INTERVALS | RE_NO_EMPTY_RANGES
    | RE_CONTEXT_INDEP_ANCHORS | RE_CONTEXT_INDEP_OPS | RE_NO_BK_BRACES
    | RE_NO_BK_PARENS | RE_NO_BK_VBAR | RE_CONTEXT_INVALID_OPS
    | RE_UNMATCHED_RIGHT_PAREN_ORD;
// limits.h RE_DUP_MAX.
export const RE_DUP_MAX = 0x7fff;

export const SBC_MAX = 256;
export const NEWLINE_CHAR = 0x0a;
// bitset_word_t is unsigned long, 64 bits on the recorder's x86-64.
export const BITSET_WORD_BITS = 64;

// Context constraints.
export const PREV_WORD_CONSTRAINT = 0x0001;
export const PREV_NOTWORD_CONSTRAINT = 0x0002;
export const NEXT_WORD_CONSTRAINT = 0x0004;
export const NEXT_NOTWORD_CONSTRAINT = 0x0008;
export const PREV_NEWLINE_CONSTRAINT = 0x0010;
export const NEXT_NEWLINE_CONSTRAINT = 0x0020;
export const PREV_BEGBUF_CONSTRAINT = 0x0040;
export const NEXT_ENDBUF_CONSTRAINT = 0x0080;
export const WORD_DELIM_CONSTRAINT = 0x0100;
export const NOT_WORD_DELIM_CONSTRAINT = 0x0200;
export const INSIDE_WORD = PREV_WORD_CONSTRAINT | NEXT_WORD_CONSTRAINT;
export const WORD_FIRST = PREV_NOTWORD_CONSTRAINT | NEXT_WORD_CONSTRAINT;
export const WORD_LAST = PREV_WORD_CONSTRAINT | NEXT_NOTWORD_CONSTRAINT;
export const INSIDE_NOTWORD = PREV_NOTWORD_CONSTRAINT
    | NEXT_NOTWORD_CONSTRAINT;
export const LINE_FIRST = PREV_NEWLINE_CONSTRAINT;
export const LINE_LAST = NEXT_NEWLINE_CONSTRAINT;
export const BUF_FIRST = PREV_BEGBUF_CONSTRAINT;
export const BUF_LAST = NEXT_ENDBUF_CONSTRAINT;
export const WORD_DELIM = WORD_DELIM_CONSTRAINT;
export const NOT_WORD_DELIM = NOT_WORD_DELIM_CONSTRAINT;

// re_token_type_t.
export const NON_TYPE = 0;
export const CHARACTER = 1;
export const END_OF_RE = 2;
export const SIMPLE_BRACKET = 3;
export const OP_BACK_REF = 4;
export const OP_PERIOD = 5;
export const EPSILON_BIT = 8;
export const OP_OPEN_SUBEXP = EPSILON_BIT | 0;
export const OP_CLOSE_SUBEXP = EPSILON_BIT | 1;
export const OP_ALT = EPSILON_BIT | 2;
export const OP_DUP_ASTERISK = EPSILON_BIT | 3;
export const ANCHOR = EPSILON_BIT | 4;
export const CONCAT = 16;
export const SUBEXP = 17;
export const OP_DUP_PLUS = 18;
export const OP_DUP_QUESTION = 19;
export const OP_OPEN_BRACKET = 20;
export const OP_CLOSE_BRACKET = 21;
export const OP_CHARSET_RANGE = 22;
export const OP_OPEN_DUP_NUM = 23;
export const OP_CLOSE_DUP_NUM = 24;
export const OP_NON_MATCH_LIST = 25;
export const OP_OPEN_COLL_ELEM = 26;
export const OP_CLOSE_COLL_ELEM = 27;
export const OP_OPEN_EQUIV_CLASS = 28;
export const OP_CLOSE_EQUIV_CLASS = 29;
export const OP_OPEN_CHAR_CLASS = 30;
export const OP_CLOSE_CHAR_CLASS = 31;
export const OP_WORD = 32;
export const OP_NOTWORD = 33;
export const OP_SPACE = 34;
export const OP_NOTSPACE = 35;
export const BACK_SLASH = 36;

export const CONTEXT_WORD = 1;
export const CONTEXT_NEWLINE = CONTEXT_WORD << 1;
export const CONTEXT_BEGBUF = CONTEXT_NEWLINE << 1;
export const CONTEXT_ENDBUF = CONTEXT_BEGBUF << 1;

export function IS_EPSILON_NODE(type) {
    return (type & EPSILON_BIT) !== 0;
}

export function IS_WORD_CONTEXT(c) { return (c & CONTEXT_WORD) !== 0; }
export function IS_NEWLINE_CONTEXT(c) { return (c & CONTEXT_NEWLINE) !== 0; }
export function IS_BEGBUF_CONTEXT(c) { return (c & CONTEXT_BEGBUF) !== 0; }
export function IS_ENDBUF_CONTEXT(c) { return (c & CONTEXT_ENDBUF) !== 0; }
export function IS_ORDINARY_CONTEXT(c) { return c === 0; }

export function NOT_SATISFY_PREV_CONSTRAINT(constraint, context) {
    return ((constraint & PREV_WORD_CONSTRAINT) && !IS_WORD_CONTEXT(context))
        || ((constraint & PREV_NOTWORD_CONSTRAINT) && IS_WORD_CONTEXT(context))
        || ((constraint & PREV_NEWLINE_CONSTRAINT)
            && !IS_NEWLINE_CONTEXT(context))
        || ((constraint & PREV_BEGBUF_CONSTRAINT)
            && !IS_BEGBUF_CONTEXT(context));
}

export function NOT_SATISFY_NEXT_CONSTRAINT(constraint, context) {
    return ((constraint & NEXT_WORD_CONSTRAINT) && !IS_WORD_CONTEXT(context))
        || ((constraint & NEXT_NOTWORD_CONSTRAINT) && IS_WORD_CONTEXT(context))
        || ((constraint & NEXT_NEWLINE_CONSTRAINT)
            && !IS_NEWLINE_CONTEXT(context))
        || ((constraint & NEXT_ENDBUF_CONSTRAINT)
            && !IS_ENDBUF_CONTEXT(context));
}

// <ctype.h> in the "C" locale: ASCII only.
export function isalnum(ch) { return isalpha(ch) || isdigit(ch); }
export function isalpha(ch) { return isupper(ch) || islower(ch); }
export function isupper(ch) { return ch >= 0x41 && ch <= 0x5a; }
export function islower(ch) { return ch >= 0x61 && ch <= 0x7a; }
export function isdigit(ch) { return ch >= 0x30 && ch <= 0x39; }
export function isxdigit(ch) {
    return isdigit(ch) || (ch >= 0x41 && ch <= 0x46)
        || (ch >= 0x61 && ch <= 0x66);
}
export function iscntrl(ch) { return ch < 0x20 || ch === 0x7f; }
export function isprint(ch) { return ch >= 0x20 && ch <= 0x7e; }
export function isgraph(ch) { return ch >= 0x21 && ch <= 0x7e; }
export function ispunct(ch) { return isgraph(ch) && !isalnum(ch); }
export function isspace(ch) { return ch === 0x20 || (ch >= 0x09 && ch <= 0x0d); }
export function isblank(ch) { return ch === 0x20 || ch === 0x09; }
export function IS_WORD_CHAR(ch) { return isalnum(ch) || ch === 0x5f; }

// bitset_t of SBC_MAX bits, one byte per bit.
export function bitset_new() { return new Uint8Array(SBC_MAX); }

// re_node_set: elems[0..nelem) sorted ascending.
export function re_node_set_init_empty() {
    return { alloc: 0, nelem: 0, elems: [] };
}

export function re_node_set_alloc(size) {
    return { alloc: size, nelem: 0, elems: [] };
}

export function re_node_set_init_1(elem) {
    return { alloc: 1, nelem: 1, elems: [elem] };
}

export function re_node_set_init_2(elem1, elem2) {
    if (elem1 === elem2) return { alloc: 2, nelem: 1, elems: [elem1] };
    return {
        alloc: 2,
        nelem: 2,
        elems: elem1 < elem2 ? [elem1, elem2] : [elem2, elem1],
    };
}

export function re_node_set_init_copy(src) {
    if (src.nelem > 0) {
        return {
            alloc: src.nelem,
            nelem: src.nelem,
            elems: src.elems.slice(0, src.nelem),
        };
    }
    return re_node_set_init_empty();
}

// Merge the intersection of SRC1 and SRC2 into DEST (regex_internal.c
// re_node_set_add_intersect()).
export function re_node_set_add_intersect(dest, src1, src2) {
    if (src1.nelem === 0 || src2.nelem === 0) return;
    if (src1.nelem + src2.nelem + dest.nelem > dest.alloc)
        dest.alloc = src1.nelem + src2.nelem + dest.alloc;
    const e = dest.elems;
    let sbase = dest.nelem + src1.nelem + src2.nelem;
    let i1 = src1.nelem - 1;
    let i2 = src2.nelem - 1;
    let id = dest.nelem - 1;
    for (;;) {
        if (src1.elems[i1] === src2.elems[i2]) {
            while (id >= 0 && e[id] > src1.elems[i1]) --id;
            if (id < 0 || e[id] !== src1.elems[i1])
                e[--sbase] = src1.elems[i1];
            if (--i1 < 0 || --i2 < 0) break;
        } else if (src1.elems[i1] < src2.elems[i2]) {
            if (--i2 < 0) break;
        } else if (--i1 < 0) {
            break;
        }
    }
    id = dest.nelem - 1;
    let is = dest.nelem + src1.nelem + src2.nelem - 1;
    let delta = is - sbase + 1;
    dest.nelem += delta;
    if (delta > 0 && id >= 0) {
        for (;;) {
            if (e[is] > e[id]) {
                e[id + delta--] = e[is--];
                if (delta === 0) break;
            } else {
                e[id + delta] = e[id];
                if (--id < 0) break;
            }
        }
    }
    for (let k = 0; k < delta; ++k) e[k] = e[sbase + k];
}

// Return the union of SRC1 and SRC2 (re_node_set_init_union()).
export function re_node_set_init_union(src1, src2) {
    if (src1 && src1.nelem > 0 && src2 && src2.nelem > 0) {
        const dest = {
            alloc: src1.nelem + src2.nelem, nelem: 0, elems: [],
        };
        let i1 = 0;
        let i2 = 0;
        let id = 0;
        while (i1 < src1.nelem && i2 < src2.nelem) {
            if (src1.elems[i1] > src2.elems[i2]) {
                dest.elems[id++] = src2.elems[i2++];
                continue;
            }
            if (src1.elems[i1] === src2.elems[i2]) ++i2;
            dest.elems[id++] = src1.elems[i1++];
        }
        if (i1 < src1.nelem) {
            while (i1 < src1.nelem) dest.elems[id++] = src1.elems[i1++];
        } else if (i2 < src2.nelem) {
            while (i2 < src2.nelem) dest.elems[id++] = src2.elems[i2++];
        }
        dest.nelem = id;
        return dest;
    }
    if (src1 && src1.nelem > 0) return re_node_set_init_copy(src1);
    if (src2 && src2.nelem > 0) return re_node_set_init_copy(src2);
    return re_node_set_init_empty();
}

// Merge SRC into DEST (re_node_set_merge()).
export function re_node_set_merge(dest, src) {
    if (!src || src.nelem === 0) return;
    if (dest.alloc < 2 * src.nelem + dest.nelem)
        dest.alloc = 2 * (src.nelem + dest.alloc);
    const e = dest.elems;
    if (dest.nelem === 0) {
        dest.nelem = src.nelem;
        for (let k = 0; k < src.nelem; ++k) e[k] = src.elems[k];
        return;
    }
    let sbase = dest.nelem + 2 * src.nelem;
    let is = src.nelem - 1;
    let id = dest.nelem - 1;
    while (is >= 0 && id >= 0) {
        if (e[id] === src.elems[is]) {
            is--;
            id--;
        } else if (e[id] < src.elems[is]) {
            e[--sbase] = src.elems[is--];
        } else {
            --id;
        }
    }
    if (is >= 0) {
        sbase -= is + 1;
        for (let k = 0; k <= is; ++k) e[sbase + k] = src.elems[k];
    }
    id = dest.nelem - 1;
    is = dest.nelem + 2 * src.nelem - 1;
    let delta = is - sbase + 1;
    if (delta === 0) return;
    dest.nelem += delta;
    for (;;) {
        if (e[is] > e[id]) {
            e[id + delta--] = e[is--];
            if (delta === 0) break;
        } else {
            e[id + delta] = e[id];
            if (--id < 0) {
                for (let k = 0; k < delta; ++k) e[k] = e[sbase + k];
                break;
            }
        }
    }
}

// Insert ELEM into SET (re_node_set_insert()). The caller is supposed not
// to pass an element SET already holds; when one does, the C code inserts
// a second copy, and so does this.
export function re_node_set_insert(set, elem) {
    if (set.alloc === 0) {
        set.alloc = 1;
        set.nelem = 1;
        set.elems = [elem];
        return true;
    }
    const e = set.elems;
    if (set.nelem === 0) {
        e[0] = elem;
        ++set.nelem;
        return true;
    }
    if (set.alloc === set.nelem) set.alloc *= 2;
    let idx;
    if (elem < e[0]) {
        for (idx = set.nelem; idx > 0; idx--) e[idx] = e[idx - 1];
    } else {
        for (idx = set.nelem; e[idx - 1] > elem; idx--) e[idx] = e[idx - 1];
    }
    e[idx] = elem;
    ++set.nelem;
    return true;
}

export function re_node_set_insert_last(set, elem) {
    if (set.alloc === set.nelem) set.alloc = (set.alloc + 1) * 2;
    set.elems[set.nelem++] = elem;
    return true;
}

export function re_node_set_compare(set1, set2) {
    if (!set1 || !set2 || set1.nelem !== set2.nelem) return false;
    for (let i = set1.nelem; --i >= 0;) {
        if (set1.elems[i] !== set2.elems[i]) return false;
    }
    return true;
}

// Return index + 1 of ELEM in SET, or 0.
export function re_node_set_contains(set, elem) {
    if (set.nelem <= 0) return 0;
    let idx = 0;
    let right = set.nelem - 1;
    while (idx < right) {
        const mid = (idx + right) >>> 1;
        if (set.elems[mid] < elem) idx = mid + 1;
        else right = mid;
    }
    return set.elems[idx] === elem ? idx + 1 : 0;
}

export function re_node_set_remove_at(set, idx) {
    if (idx < 0 || idx >= set.nelem) return;
    --set.nelem;
    for (; idx < set.nelem; idx++) set.elems[idx] = set.elems[idx + 1];
}

export function re_node_set_remove(set, id) {
    re_node_set_remove_at(set, re_node_set_contains(set, id) - 1);
}

export function re_node_set_empty(set) {
    set.nelem = 0;
}

// Add TOKEN to dfa.nodes and return its index (re_dfa_add_node()).
export function re_dfa_add_node(dfa, token) {
    const node = { ...token, constraint: 0 };
    dfa.nodes[dfa.nodes_len] = node;
    dfa.nexts[dfa.nodes_len] = -1;
    dfa.edests[dfa.nodes_len] = re_node_set_init_empty();
    dfa.eclosures[dfa.nodes_len] = re_node_set_init_empty();
    return dfa.nodes_len++;
}

function calc_state_hash(nodes, context) {
    let hash = nodes.nelem + context;
    for (let i = 0; i < nodes.nelem; i++) hash += nodes.elems[i];
    return hash;
}

// The C state table scans a hash bucket in insertion order and returns the
// first state that passes the lookup's test: re_acquire_state() wants the
// same hash and node set, re_acquire_state_context() the same hash, context
// and entrance node set. The buckets here are keyed by a hash of C's hash
// and the set the test compares, which equal sets share, so a scan meets
// the same passing states in the same order and returns the state C does.
// A context-dependent state can pass the first test too (when its context is
// 0 and it dropped no node), as in C.
function bucketKey(hash, set) {
    let h = hash | 0;
    for (let i = 0; i < set.nelem; i++)
        h = (Math.imul(h, 0x9e3779b1) + set.elems[i] + 1) | 0;
    return h;
}

function bucket(index, key) {
    let spot = index.get(key);
    if (!spot) {
        spot = [];
        index.set(key, spot);
    }
    return spot;
}

// Find or create the state whose node set is NODES (re_acquire_state()).
export function re_acquire_state(dfa, nodes) {
    if (nodes.nelem === 0) return null;
    const hash = calc_state_hash(nodes, 0);
    const spot = dfa.state_table.ci.get(bucketKey(hash, nodes));
    if (spot) {
        for (const state of spot) {
            if (hash !== state.hash) continue;
            if (re_node_set_compare(state.nodes, nodes)) return state;
        }
    }
    return create_ci_newstate(dfa, nodes, hash);
}

// Find or create the state whose entrance node set is NODES in CONTEXT
// (re_acquire_state_context()).
export function re_acquire_state_context(dfa, nodes, context) {
    if (nodes.nelem === 0) return null;
    const hash = calc_state_hash(nodes, context);
    const spot = dfa.state_table.cd.get(bucketKey(hash, nodes));
    if (spot) {
        for (const state of spot) {
            if (state.hash === hash && state.context === context
                && re_node_set_compare(state.entrance_nodes, nodes))
                return state;
        }
    }
    return create_cd_newstate(dfa, nodes, context, hash);
}

function newState(nodes) {
    const state = {
        hash: 0,
        nodes: re_node_set_init_copy(nodes),
        non_eps_nodes: null,
        inveclosure: re_node_set_init_empty(),
        entrance_nodes: null,
        trtable: null,
        word_trtable: null,
        context: 0,
        halt: false,
        accept_mb: false,
        has_backref: false,
        has_constraint: false,
    };
    state.entrance_nodes = state.nodes;
    return state;
}

function register_state(dfa, newstate, hash) {
    newstate.hash = hash;
    newstate.non_eps_nodes = re_node_set_alloc(newstate.nodes.nelem);
    for (let i = 0; i < newstate.nodes.nelem; i++) {
        const elem = newstate.nodes.elems[i];
        if (!IS_EPSILON_NODE(dfa.nodes[elem].type))
            re_node_set_insert_last(newstate.non_eps_nodes, elem);
    }
    bucket(dfa.state_table.ci, bucketKey(hash, newstate.nodes))
        .push(newstate);
    bucket(dfa.state_table.cd, bucketKey(hash, newstate.entrance_nodes))
        .push(newstate);
}

function create_ci_newstate(dfa, nodes, hash) {
    const newstate = newState(nodes);
    for (let i = 0; i < nodes.nelem; i++) {
        const node = dfa.nodes[nodes.elems[i]];
        const type = node.type;
        if (type === CHARACTER && !node.constraint) continue;
        if (type === END_OF_RE) newstate.halt = true;
        else if (type === OP_BACK_REF) newstate.has_backref = true;
        else if (type === ANCHOR || node.constraint)
            newstate.has_constraint = true;
    }
    register_state(dfa, newstate, hash);
    return newstate;
}

function create_cd_newstate(dfa, nodes, context, hash) {
    const newstate = newState(nodes);
    let nctx_nodes = 0;
    newstate.context = context;
    for (let i = 0; i < nodes.nelem; i++) {
        const node = dfa.nodes[nodes.elems[i]];
        const type = node.type;
        const constraint = node.constraint;
        if (type === CHARACTER && !constraint) continue;
        if (type === END_OF_RE) newstate.halt = true;
        else if (type === OP_BACK_REF) newstate.has_backref = true;
        if (constraint) {
            if (newstate.entrance_nodes === newstate.nodes) {
                newstate.entrance_nodes = re_node_set_init_copy(nodes);
                nctx_nodes = 0;
                newstate.has_constraint = true;
            }
            if (NOT_SATISFY_PREV_CONSTRAINT(constraint, context)) {
                re_node_set_remove_at(newstate.nodes, i - nctx_nodes);
                ++nctx_nodes;
            }
        }
    }
    register_state(dfa, newstate, hash);
    return newstate;
}

// The matcher's re_string_t: in the C locale with no translation, MBS is the
// caller's string starting at RAW_MBS_IDX, and VALID_LEN equals LEN.
export function re_string_byte_at(pstr, idx) {
    return pstr.raw.charCodeAt(pstr.raw_mbs_idx + idx);
}

export function re_string_context_at(input, idx, eflags) {
    if (idx < 0) return input.tip_context;
    if (idx === input.len) {
        return (eflags & 2 /* REG_NOTEOL */) ? CONTEXT_ENDBUF
            : CONTEXT_NEWLINE | CONTEXT_ENDBUF;
    }
    const c = re_string_byte_at(input, idx);
    if (input.word_char[c]) return CONTEXT_WORD;
    return c === NEWLINE_CHAR && input.newline_anchor ? CONTEXT_NEWLINE : 0;
}
