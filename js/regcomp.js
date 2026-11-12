// SPDX-License-Identifier: LGPL-2.1-or-later
//
// This file is a JavaScript translation of glibc 2.39 posix/regcomp.c.
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
// regcomp.js -- glibc 2.39 posix/regcomp.c: regcomp(), regerror() and the
// parser and NFA construction they use.
//
// Only the recorder's configuration is kept: the "C" locale (MB_CUR_MAX 1,
// no collation rules, byte-valued ranges), no translate table, and the
// cflags NetHack's sys/share/posixregex.c passes, REG_EXTENDED | REG_NOSUB.
// Functions keep their C names and statement order; parts that only serve
// multibyte locales, REG_ICASE, REG_NEWLINE, register reporting or memory
// management are left out.

import {
    ANCHOR,
    BACK_SLASH,
    BITSET_WORD_BITS,
    BUF_FIRST,
    BUF_LAST,
    CHARACTER,
    CONCAT,
    CONTEXT_BEGBUF,
    CONTEXT_NEWLINE,
    CONTEXT_WORD,
    END_OF_RE,
    INSIDE_NOTWORD,
    INSIDE_WORD,
    IS_EPSILON_NODE,
    IS_WORD_CHAR,
    LINE_FIRST,
    LINE_LAST,
    NOT_WORD_DELIM,
    OP_ALT,
    OP_BACK_REF,
    OP_CHARSET_RANGE,
    OP_CLOSE_BRACKET,
    OP_CLOSE_DUP_NUM,
    OP_CLOSE_SUBEXP,
    OP_DUP_ASTERISK,
    OP_DUP_PLUS,
    OP_DUP_QUESTION,
    OP_NON_MATCH_LIST,
    OP_NOTSPACE,
    OP_NOTWORD,
    OP_OPEN_BRACKET,
    OP_OPEN_CHAR_CLASS,
    OP_OPEN_COLL_ELEM,
    OP_OPEN_DUP_NUM,
    OP_OPEN_EQUIV_CLASS,
    OP_OPEN_SUBEXP,
    OP_PERIOD,
    OP_SPACE,
    OP_WORD,
    RE_BACKSLASH_ESCAPE_IN_LISTS,
    RE_BK_PLUS_QM,
    RE_CARET_ANCHORS_HERE,
    RE_CHAR_CLASSES,
    RE_CONTEXT_INDEP_ANCHORS,
    RE_CONTEXT_INDEP_OPS,
    RE_CONTEXT_INVALID_DUP,
    RE_CONTEXT_INVALID_OPS,
    RE_DUP_MAX,
    RE_HAT_LISTS_NOT_NEWLINE,
    RE_ICASE,
    RE_INTERVALS,
    RE_INVALID_INTERVAL_ORD,
    RE_LIMITED_OPS,
    RE_NEWLINE_ALT,
    RE_NO_BK_BRACES,
    RE_NO_BK_PARENS,
    RE_NO_BK_REFS,
    RE_NO_BK_VBAR,
    RE_NO_EMPTY_RANGES,
    RE_NO_GNU_OPS,
    RE_SYNTAX_POSIX_EXTENDED,
    RE_UNMATCHED_RIGHT_PAREN_ORD,
    REG_BADBR,
    REG_BADPAT,
    REG_BADRPT,
    REG_EBRACE,
    REG_EBRACK,
    REG_ECOLLATE,
    REG_ECTYPE,
    REG_EESCAPE,
    REG_EPAREN,
    REG_ERANGE,
    REG_ERPAREN,
    REG_ESIZE,
    REG_ESUBREG,
    REG_NOERROR,
    SBC_MAX,
    SIMPLE_BRACKET,
    SUBEXP,
    WORD_DELIM,
    WORD_FIRST,
    WORD_LAST,
    bitset_new,
    isalnum,
    isalpha,
    isblank,
    iscntrl,
    isdigit,
    isgraph,
    islower,
    isprint,
    ispunct,
    isspace,
    isupper,
    isxdigit,
    re_acquire_state_context,
    re_dfa_add_node,
    re_node_set_contains,
    re_node_set_empty,
    re_node_set_init_1,
    re_node_set_init_2,
    re_node_set_init_copy,
    re_node_set_init_empty,
    re_node_set_insert,
    re_node_set_insert_last,
    re_node_set_merge,
} from './regex_internal.js';

export const REG_EXTENDED = 1;
export const REG_NOSUB = 1 << 3;

// regcomp.c __re_error_msgid, indexed by error code.
const RE_ERROR_MSGID = Object.freeze([
    'Success',
    'No match',
    'Invalid regular expression',
    'Invalid collation character',
    'Invalid character class name',
    'Trailing backslash',
    'Invalid back reference',
    'Unmatched [, [^, [:, [., or [=',
    'Unmatched ( or \\(',
    'Unmatched \\{',
    'Invalid content of \\{\\}',
    'Invalid range end',
    'Memory exhausted',
    'Invalid preceding regular expression',
    'Premature end of regular expression',
    'Regular expression too big',
    'Unmatched ) or \\)',
]);

// Size of the names for collating symbol/equivalence_class/character_class.
const BRACKET_NAME_BUF_SIZE = 32;

// bracket_elem_type.
const SB_CHAR = 0;
const EQUIV_CLASS = 2;
const COLL_SYM = 3;
const CHAR_CLASS = 4;

export function regerror(errcode) {
    return RE_ERROR_MSGID[errcode];
}

// The pattern's re_string_t. In the "C" locale MBS is the pattern itself.
function re_string_construct(pattern) {
    return { mbs: pattern, cur_idx: 0, len: pattern.length,
        stop: pattern.length };
}

function re_string_eoi(pstr) { return pstr.stop <= pstr.cur_idx; }
function re_string_peek_byte(pstr, offset) {
    return pstr.mbs.charCodeAt(pstr.cur_idx + offset);
}
function re_string_fetch_byte(pstr) {
    return pstr.mbs.charCodeAt(pstr.cur_idx++);
}
function re_string_skip_bytes(pstr, idx) { pstr.cur_idx += idx; }

function newToken(type = 0) {
    // re_token_t. The C union opr holds c, idx, ctx_type and sbcset in one
    // place; every reader here reads the member last written for its type.
    return {
        type,
        c: 0,
        idx: 0,
        ctx_type: 0,
        sbcset: null,
        constraint: 0,
        duplicated: 0,
        opt_subexp: 0,
        word_char: 0,
    };
}

// Compile PATTERN, a byte string, with cflags REG_EXTENDED | REG_NOSUB.
// Return { err, preg }; preg is null when err is not REG_NOERROR.
export function regcomp(pattern) {
    const preg = {
        buffer: null,
        syntax: RE_SYNTAX_POSIX_EXTENDED,
        newline_anchor: 0,
        no_sub: 1,
        re_nsub: 0,
        fastmap: null,
        fastmap_accurate: 0,
        can_be_null: 0,
        used: 0,
    };
    // regcomp() hands strlen(pattern) bytes to the compiler.
    const nul = pattern.indexOf('\0');
    const text = nul < 0 ? pattern : pattern.slice(0, nul);
    let ret = re_compile_internal(preg, text, text.length, preg.syntax);
    if (ret === REG_ERPAREN) ret = REG_EPAREN;
    if (ret === REG_NOERROR) {
        preg.fastmap = new Uint8Array(SBC_MAX);
        re_compile_fastmap(preg);
    }
    return { err: ret, preg: ret === REG_NOERROR ? preg : null };
}

function re_compile_fastmap(bufp) {
    const dfa = bufp.buffer;
    const fastmap = bufp.fastmap;
    fastmap.fill(0);
    re_compile_fastmap_iter(bufp, dfa.init_state, fastmap);
    if (dfa.init_state !== dfa.init_state_word)
        re_compile_fastmap_iter(bufp, dfa.init_state_word, fastmap);
    if (dfa.init_state !== dfa.init_state_nl)
        re_compile_fastmap_iter(bufp, dfa.init_state_nl, fastmap);
    if (dfa.init_state !== dfa.init_state_begbuf)
        re_compile_fastmap_iter(bufp, dfa.init_state_begbuf, fastmap);
    bufp.fastmap_accurate = 1;
}

function re_compile_fastmap_iter(bufp, init_state, fastmap) {
    const dfa = bufp.buffer;
    for (let node_cnt = 0; node_cnt < init_state.nodes.nelem; ++node_cnt) {
        const node = init_state.nodes.elems[node_cnt];
        const type = dfa.nodes[node].type;
        if (type === CHARACTER) {
            fastmap[dfa.nodes[node].c] = 1;
        } else if (type === SIMPLE_BRACKET) {
            for (let ch = 0; ch < SBC_MAX; ++ch) {
                if (dfa.nodes[node].sbcset[ch]) fastmap[ch] = 1;
            }
        } else if (type === OP_PERIOD || type === END_OF_RE) {
            fastmap.fill(1);
            if (type === END_OF_RE) bufp.can_be_null = 1;
            return;
        }
    }
}

function re_compile_internal(preg, pattern, length, syntax) {
    preg.fastmap_accurate = 0;
    preg.syntax = syntax;
    preg.used = 0;
    preg.re_nsub = 0;
    preg.can_be_null = 0;
    const dfa = init_dfa(length);
    preg.buffer = dfa;
    preg.used = 1;
    const regexp = re_string_construct(pattern);
    const err = { value: REG_NOERROR };
    preg.re_nsub = 0;
    dfa.str_tree = parse(regexp, preg, syntax, err);
    if (dfa.str_tree == null) {
        preg.buffer = null;
        return err.value;
    }
    let ret = analyze(preg);
    if (ret !== REG_NOERROR) {
        preg.buffer = null;
        return ret;
    }
    ret = create_initial_state(dfa);
    dfa.str_tree = null;
    dfa.org_indices = null;
    if (ret !== REG_NOERROR) preg.buffer = null;
    return ret;
}

function init_dfa(pat_len) {
    return {
        nodes: [],
        nodes_alloc: pat_len + 1,
        nodes_len: 0,
        nexts: [],
        org_indices: [],
        edests: [],
        eclosures: [],
        inveclosures: null,
        // Every DFA state this compiled pattern creates, here and in each
        // later regexec(); glibc keeps them for the life of the regex_t.
        state_table: { ci: new Map(), cd: new Map() },
        init_state: null,
        init_state_word: null,
        init_state_nl: null,
        init_state_begbuf: null,
        str_tree: null,
        init_node: 0,
        nbackref: 0,
        used_bkref_map: 0,
        completed_bkref_map: 0,
        has_plural_match: 0,
        has_mb_node: 0,
        word_ops_used: 0,
        mb_cur_max: 1,
        // Zero until init_word_char(); regexec then sees no word context.
        word_char: bitset_new(),
        syntax: 0,
        subexp_map: null,
    };
}

function init_word_char(dfa) {
    dfa.word_ops_used = 1;
    for (let ch = 0; ch < SBC_MAX; ++ch) {
        if (isalnum(ch) || ch === 0x5f) dfa.word_char[ch] = 1;
    }
}

function create_initial_state(dfa) {
    const first = dfa.str_tree.first.node_idx;
    dfa.init_node = first;
    const init_nodes = re_node_set_init_copy(dfa.eclosures[first]);
    // The back-references in the initial state can epsilon transit, since
    // all of the subexpressions can be null there.
    if (dfa.nbackref > 0) {
        for (let i = 0; i < init_nodes.nelem; ++i) {
            const node_idx = init_nodes.elems[i];
            const type = dfa.nodes[node_idx].type;
            if (type !== OP_BACK_REF) continue;
            let clexp_idx;
            for (clexp_idx = 0; clexp_idx < init_nodes.nelem; ++clexp_idx) {
                const clexp_node = dfa.nodes[init_nodes.elems[clexp_idx]];
                if (clexp_node.type === OP_CLOSE_SUBEXP
                    && clexp_node.idx === dfa.nodes[node_idx].idx) break;
            }
            if (clexp_idx === init_nodes.nelem) continue;
            if (type === OP_BACK_REF) {
                const dest_idx = dfa.edests[node_idx].elems[0];
                if (!re_node_set_contains(init_nodes, dest_idx)) {
                    re_node_set_merge(init_nodes, dfa.eclosures[dest_idx]);
                    // The loop's ++i then resumes at index 1, as in C.
                    i = 0;
                }
            }
        }
    }
    dfa.init_state = re_acquire_state_context(dfa, init_nodes, 0);
    if (dfa.init_state.has_constraint) {
        dfa.init_state_word = re_acquire_state_context(dfa, init_nodes,
            CONTEXT_WORD);
        dfa.init_state_nl = re_acquire_state_context(dfa, init_nodes,
            CONTEXT_NEWLINE);
        dfa.init_state_begbuf = re_acquire_state_context(dfa, init_nodes,
            CONTEXT_NEWLINE | CONTEXT_BEGBUF);
    } else {
        dfa.init_state_word = dfa.init_state_nl
            = dfa.init_state_begbuf = dfa.init_state;
    }
    return REG_NOERROR;
}

// Analyze the structure tree, and calculate "first", "next", "edest",
// "eclosure", and "inveclosure".
function analyze(preg) {
    const dfa = preg.buffer;
    dfa.org_indices = [];
    // glibc's malloc(0) is non-NULL, so the map exists even with no groups.
    dfa.subexp_map = [];
    for (let i = 0; i < preg.re_nsub; i++) dfa.subexp_map[i] = i;
    preorder(dfa.str_tree, optimize_subexps, dfa);
    let i;
    for (i = 0; i < preg.re_nsub; i++) {
        if (dfa.subexp_map[i] !== i) break;
    }
    if (i === preg.re_nsub) dfa.subexp_map = null;

    let ret = postorder(dfa.str_tree, lower_subexps, preg);
    if (ret !== REG_NOERROR) return ret;
    ret = postorder(dfa.str_tree, calc_first, dfa);
    if (ret !== REG_NOERROR) return ret;
    preorder(dfa.str_tree, calc_next, dfa);
    ret = preorder(dfa.str_tree, link_nfa_nodes, dfa);
    if (ret !== REG_NOERROR) return ret;
    ret = calc_eclosure(dfa);
    if (ret !== REG_NOERROR) return ret;
    if ((!preg.no_sub && preg.re_nsub > 0 && dfa.has_plural_match)
        || dfa.nbackref) {
        dfa.inveclosures = [];
        ret = calc_inveclosure(dfa);
    }
    return ret;
}

// The parse trees are very unbalanced, so the visits walk parent pointers
// instead of recursing.
function postorder(root, fn, extra) {
    let node = root;
    for (;;) {
        while (node.left || node.right) node = node.left ? node.left : node.right;
        let prev;
        do {
            const err = fn(extra, node);
            if (err !== REG_NOERROR) return err;
            if (node.parent == null) return REG_NOERROR;
            prev = node;
            node = node.parent;
        } while (node.right === prev || node.right == null);
        node = node.right;
    }
}

function preorder(root, fn, extra) {
    let node = root;
    for (;;) {
        const err = fn(extra, node);
        if (err !== REG_NOERROR) return err;
        if (node.left) {
            node = node.left;
        } else {
            let prev = null;
            while (node.right === prev || node.right == null) {
                prev = node;
                node = node.parent;
                if (!node) return REG_NOERROR;
            }
            node = node.right;
        }
    }
}

// If a SUBEXP is entirely contained, strip it and map the inner one's index
// to this one's; adjust backreferences as well. Requires a preorder visit.
function optimize_subexps(dfa, node) {
    if (node.token.type === OP_BACK_REF && dfa.subexp_map) {
        const idx = node.token.idx;
        node.token.idx = dfa.subexp_map[idx];
        dfa.used_bkref_map |= 1 << node.token.idx;
    } else if (node.token.type === SUBEXP
               && node.left && node.left.token.type === SUBEXP) {
        const other_idx = node.left.token.idx;
        node.left = node.left.left;
        if (node.left) node.left.parent = node;
        dfa.subexp_map[other_idx] = dfa.subexp_map[node.token.idx];
        if (other_idx < 31) dfa.used_bkref_map &= ~(1 << other_idx);
    }
    return REG_NOERROR;
}

// Turn each SUBEXP node into the concatenation of OP_OPEN_SUBEXP, the body
// of the SUBEXP (if any) and OP_CLOSE_SUBEXP.
function lower_subexps(preg, node) {
    if (node.left && node.left.token.type === SUBEXP) {
        node.left = lower_subexp(preg, node.left);
        if (node.left) node.left.parent = node;
    }
    if (node.right && node.right.token.type === SUBEXP) {
        node.right = lower_subexp(preg, node.right);
        if (node.right) node.right.parent = node;
    }
    return REG_NOERROR;
}

function usedBackref(dfa, idx) {
    // used_bkref_map only ever holds the bits for \1 to \9.
    return idx < BITSET_WORD_BITS && idx < 31
        && (dfa.used_bkref_map & (1 << idx)) !== 0;
}

function lower_subexp(preg, node) {
    const dfa = preg.buffer;
    const body = node.left;
    // REG_NOSUB drops a group no backreference uses. An empty group stays,
    // so no CONCAT gets a NULL child.
    if (preg.no_sub && node.left != null && !usedBackref(dfa, node.token.idx))
        return node.left;
    const op = create_tree(dfa, null, null, OP_OPEN_SUBEXP);
    const cls = create_tree(dfa, null, null, OP_CLOSE_SUBEXP);
    const tree1 = body ? create_tree(dfa, body, cls, CONCAT) : cls;
    const tree = create_tree(dfa, op, tree1, CONCAT);
    op.token.idx = cls.token.idx = node.token.idx;
    op.token.opt_subexp = cls.token.opt_subexp = node.token.opt_subexp;
    return tree;
}

// Pass 1 in building the NFA: compute FIRST and create unlinked automaton
// nodes. Requires a postorder visit.
function calc_first(dfa, node) {
    if (node.token.type === CONCAT) {
        node.first = node.left.first;
        node.node_idx = node.left.node_idx;
    } else {
        node.first = node;
        node.node_idx = re_dfa_add_node(dfa, node.token);
        if (node.token.type === ANCHOR)
            dfa.nodes[node.node_idx].constraint = node.token.ctx_type;
    }
    return REG_NOERROR;
}

// Pass 2: compute NEXT on the tree. Preorder visit.
function calc_next(_extra, node) {
    switch (node.token.type) {
    case OP_DUP_ASTERISK:
        node.left.next = node;
        break;
    case CONCAT:
        node.left.next = node.right.first;
        node.right.next = node.next;
        break;
    default:
        if (node.left) node.left.next = node.next;
        if (node.right) node.right.next = node.next;
        break;
    }
    return REG_NOERROR;
}

// Pass 3: link all DFA nodes to their NEXT node.
function link_nfa_nodes(dfa, node) {
    const idx = node.node_idx;
    switch (node.token.type) {
    case CONCAT:
        break;
    case END_OF_RE:
        break;
    case OP_DUP_ASTERISK:
    case OP_ALT: {
        dfa.has_plural_match = 1;
        const left = node.left != null ? node.left.first.node_idx
            : node.next.node_idx;
        const right = node.right != null ? node.right.first.node_idx
            : node.next.node_idx;
        dfa.edests[idx] = re_node_set_init_2(left, right);
        break;
    }
    case ANCHOR:
    case OP_OPEN_SUBEXP:
    case OP_CLOSE_SUBEXP:
        dfa.edests[idx] = re_node_set_init_1(node.next.node_idx);
        break;
    case OP_BACK_REF:
        dfa.nexts[idx] = node.next.node_idx;
        dfa.edests[idx] = re_node_set_init_1(dfa.nexts[idx]);
        break;
    default:
        dfa.nexts[idx] = node.next.node_idx;
        break;
    }
    return REG_NOERROR;
}

// Duplicate the epsilon closure of the node ROOT_NODE. Duplicated nodes
// have constraint INIT_CONSTRAINT in addition to their own constraint.
function duplicate_node_closure(dfa, top_org_node, top_clone_node, root_node,
    init_constraint) {
    let constraint = init_constraint;
    let org_node = top_org_node;
    let clone_node = top_clone_node;
    for (;;) {
        let org_dest;
        let clone_dest;
        if (dfa.nodes[org_node].type === OP_BACK_REF) {
            // If the back reference epsilon-transits, its destination must
            // also have the constraint.
            org_dest = dfa.nexts[org_node];
            re_node_set_empty(dfa.edests[clone_node]);
            clone_dest = duplicate_node(dfa, org_dest, constraint);
            dfa.nexts[clone_node] = dfa.nexts[org_node];
            re_node_set_insert(dfa.edests[clone_node], clone_dest);
        } else if (dfa.edests[org_node].nelem === 0) {
            // The node can't epsilon-transit: keep the original destination.
            dfa.nexts[clone_node] = dfa.nexts[org_node];
            break;
        } else if (dfa.edests[org_node].nelem === 1) {
            org_dest = dfa.edests[org_node].elems[0];
            re_node_set_empty(dfa.edests[clone_node]);
            // A loop back to root_node: tie it to root_node's destination.
            if (org_node === root_node && clone_node !== org_node) {
                re_node_set_insert(dfa.edests[clone_node], org_dest);
                break;
            }
            constraint |= dfa.nodes[org_node].constraint;
            clone_dest = duplicate_node(dfa, org_dest, constraint);
            re_node_set_insert(dfa.edests[clone_node], clone_dest);
        } else {
            // Two destinations: '|' and '*'.
            org_dest = dfa.edests[org_node].elems[0];
            re_node_set_empty(dfa.edests[clone_node]);
            clone_dest = search_duplicated_node(dfa, org_dest, constraint);
            if (clone_dest === -1) {
                clone_dest = duplicate_node(dfa, org_dest, constraint);
                re_node_set_insert(dfa.edests[clone_node], clone_dest);
                const err = duplicate_node_closure(dfa, org_dest, clone_dest,
                    root_node, constraint);
                if (err !== REG_NOERROR) return err;
            } else {
                re_node_set_insert(dfa.edests[clone_node], clone_dest);
            }
            org_dest = dfa.edests[org_node].elems[1];
            clone_dest = duplicate_node(dfa, org_dest, constraint);
            re_node_set_insert(dfa.edests[clone_node], clone_dest);
        }
        org_node = org_dest;
        clone_node = clone_dest;
    }
    return REG_NOERROR;
}

// Search for a node duplicated from ORG_NODE with CONSTRAINT. The scan stops
// at END_OF_RE, the last node calc_first() made, so it only reads
// org_indices entries duplicate_node() set.
function search_duplicated_node(dfa, org_node, constraint) {
    for (let idx = dfa.nodes_len - 1; dfa.nodes[idx].duplicated && idx > 0;
        --idx) {
        if (org_node === dfa.org_indices[idx]
            && constraint === dfa.nodes[idx].constraint) return idx;
    }
    return -1;
}

function duplicate_node(dfa, org_idx, constraint) {
    const dup_idx = re_dfa_add_node(dfa, dfa.nodes[org_idx]);
    dfa.nodes[dup_idx].constraint = constraint;
    dfa.nodes[dup_idx].constraint |= dfa.nodes[org_idx].constraint;
    dfa.nodes[dup_idx].duplicated = 1;
    dfa.org_indices[dup_idx] = org_idx;
    return dup_idx;
}

function calc_inveclosure(dfa) {
    for (let idx = 0; idx < dfa.nodes_len; ++idx)
        dfa.inveclosures[idx] = re_node_set_init_empty();
    for (let src = 0; src < dfa.nodes_len; ++src) {
        const elems = dfa.eclosures[src].elems;
        for (let idx = 0; idx < dfa.eclosures[src].nelem; ++idx)
            re_node_set_insert_last(dfa.inveclosures[elems[idx]], src);
    }
    return REG_NOERROR;
}

function calc_eclosure(dfa) {
    let incomplete = false;
    for (let node_idx = 0; ; ++node_idx) {
        if (node_idx === dfa.nodes_len) {
            if (!incomplete) break;
            incomplete = false;
            node_idx = 0;
        }
        // If we have already calculated, skip it.
        if (dfa.eclosures[node_idx].nelem !== 0) continue;
        calc_eclosure_iter(dfa, node_idx, true);
        if (dfa.eclosures[node_idx].nelem === 0) incomplete = true;
    }
    return REG_NOERROR;
}

// Calculate the epsilon closure of NODE. dfa.eclosures[node].nelem is -1
// while it is in progress and 0 until it is complete.
function calc_eclosure_iter(dfa, node, root) {
    let incomplete = false;
    const eclosure = { alloc: dfa.edests[node].nelem + 1, nelem: 0, elems: [] };
    // An epsilon closure includes itself.
    eclosure.elems[eclosure.nelem++] = node;
    dfa.eclosures[node].nelem = -1;
    // If the current node has constraints, duplicate all nodes since they
    // must inherit the constraints.
    if (dfa.nodes[node].constraint
        && dfa.edests[node].nelem
        && !dfa.nodes[dfa.edests[node].elems[0]].duplicated) {
        const err = duplicate_node_closure(dfa, node, node, node,
            dfa.nodes[node].constraint);
        if (err !== REG_NOERROR) return err;
    }
    if (IS_EPSILON_NODE(dfa.nodes[node].type)) {
        for (let i = 0; i < dfa.edests[node].nelem; ++i) {
            const edest = dfa.edests[node].elems[i];
            if (dfa.eclosures[edest].nelem === -1) {
                incomplete = true;
                continue;
            }
            let eclosure_elem;
            if (dfa.eclosures[edest].nelem === 0)
                eclosure_elem = calc_eclosure_iter(dfa, edest, false);
            else
                eclosure_elem = dfa.eclosures[edest];
            re_node_set_merge(eclosure, eclosure_elem);
            if (dfa.eclosures[edest].nelem === 0) incomplete = true;
        }
    }
    if (incomplete && !root) dfa.eclosures[node].nelem = 0;
    else dfa.eclosures[node] = eclosure;
    return eclosure;
}

// Fetch a token from INPUT. Not for use inside bracket expressions.
function fetch_token(result, input, syntax) {
    re_string_skip_bytes(input, peek_token(result, input, syntax));
}

// Peek a token from INPUT, and return the length of the token.
function peek_token(token, input, syntax) {
    if (re_string_eoi(input)) {
        token.type = END_OF_RE;
        return 0;
    }
    const c = re_string_peek_byte(input, 0);
    token.c = c;
    token.word_char = 0;
    if (c === 0x5c /* '\\' */) {
        if (input.cur_idx + 1 >= input.len) {
            token.type = BACK_SLASH;
            return 1;
        }
        const c2 = re_string_peek_byte(input, 1);
        token.c = c2;
        token.type = CHARACTER;
        token.word_char = IS_WORD_CHAR(c2) ? 1 : 0;
        switch (String.fromCharCode(c2)) {
        case '|':
            if (!(syntax & RE_LIMITED_OPS) && !(syntax & RE_NO_BK_VBAR))
                token.type = OP_ALT;
            break;
        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9':
            if (!(syntax & RE_NO_BK_REFS)) {
                token.type = OP_BACK_REF;
                token.idx = c2 - 0x31;
            }
            break;
        case '<':
            if (!(syntax & RE_NO_GNU_OPS)) {
                token.type = ANCHOR;
                token.ctx_type = WORD_FIRST;
            }
            break;
        case '>':
            if (!(syntax & RE_NO_GNU_OPS)) {
                token.type = ANCHOR;
                token.ctx_type = WORD_LAST;
            }
            break;
        case 'b':
            if (!(syntax & RE_NO_GNU_OPS)) {
                token.type = ANCHOR;
                token.ctx_type = WORD_DELIM;
            }
            break;
        case 'B':
            if (!(syntax & RE_NO_GNU_OPS)) {
                token.type = ANCHOR;
                token.ctx_type = NOT_WORD_DELIM;
            }
            break;
        case 'w':
            if (!(syntax & RE_NO_GNU_OPS)) token.type = OP_WORD;
            break;
        case 'W':
            if (!(syntax & RE_NO_GNU_OPS)) token.type = OP_NOTWORD;
            break;
        case 's':
            if (!(syntax & RE_NO_GNU_OPS)) token.type = OP_SPACE;
            break;
        case 'S':
            if (!(syntax & RE_NO_GNU_OPS)) token.type = OP_NOTSPACE;
            break;
        case '`':
            if (!(syntax & RE_NO_GNU_OPS)) {
                token.type = ANCHOR;
                token.ctx_type = BUF_FIRST;
            }
            break;
        case '\'':
            if (!(syntax & RE_NO_GNU_OPS)) {
                token.type = ANCHOR;
                token.ctx_type = BUF_LAST;
            }
            break;
        case '(':
            if (!(syntax & RE_NO_BK_PARENS)) token.type = OP_OPEN_SUBEXP;
            break;
        case ')':
            if (!(syntax & RE_NO_BK_PARENS)) token.type = OP_CLOSE_SUBEXP;
            break;
        case '+':
            if (!(syntax & RE_LIMITED_OPS) && (syntax & RE_BK_PLUS_QM))
                token.type = OP_DUP_PLUS;
            break;
        case '?':
            if (!(syntax & RE_LIMITED_OPS) && (syntax & RE_BK_PLUS_QM))
                token.type = OP_DUP_QUESTION;
            break;
        case '{':
            if ((syntax & RE_INTERVALS) && !(syntax & RE_NO_BK_BRACES))
                token.type = OP_OPEN_DUP_NUM;
            break;
        case '}':
            if ((syntax & RE_INTERVALS) && !(syntax & RE_NO_BK_BRACES))
                token.type = OP_CLOSE_DUP_NUM;
            break;
        default:
            break;
        }
        return 2;
    }
    token.type = CHARACTER;
    token.word_char = IS_WORD_CHAR(token.c) ? 1 : 0;
    switch (String.fromCharCode(c)) {
    case '\n':
        if (syntax & RE_NEWLINE_ALT) token.type = OP_ALT;
        break;
    case '|':
        if (!(syntax & RE_LIMITED_OPS) && (syntax & RE_NO_BK_VBAR))
            token.type = OP_ALT;
        break;
    case '*':
        token.type = OP_DUP_ASTERISK;
        break;
    case '+':
        if (!(syntax & RE_LIMITED_OPS) && !(syntax & RE_BK_PLUS_QM))
            token.type = OP_DUP_PLUS;
        break;
    case '?':
        if (!(syntax & RE_LIMITED_OPS) && !(syntax & RE_BK_PLUS_QM))
            token.type = OP_DUP_QUESTION;
        break;
    case '{':
        if ((syntax & RE_INTERVALS) && (syntax & RE_NO_BK_BRACES))
            token.type = OP_OPEN_DUP_NUM;
        break;
    case '}':
        if ((syntax & RE_INTERVALS) && (syntax & RE_NO_BK_BRACES))
            token.type = OP_CLOSE_DUP_NUM;
        break;
    case '(':
        if (syntax & RE_NO_BK_PARENS) token.type = OP_OPEN_SUBEXP;
        break;
    case ')':
        if (syntax & RE_NO_BK_PARENS) token.type = OP_CLOSE_SUBEXP;
        break;
    case '[':
        token.type = OP_OPEN_BRACKET;
        break;
    case '.':
        token.type = OP_PERIOD;
        break;
    case '^':
        if (!(syntax & (RE_CONTEXT_INDEP_ANCHORS | RE_CARET_ANCHORS_HERE))
            && input.cur_idx !== 0) {
            const prev = re_string_peek_byte(input, -1);
            if (!(syntax & RE_NEWLINE_ALT) || prev !== 0x0a) break;
        }
        token.type = ANCHOR;
        token.ctx_type = LINE_FIRST;
        break;
    case '$':
        if (!(syntax & RE_CONTEXT_INDEP_ANCHORS)
            && input.cur_idx + 1 !== input.len) {
            const next = newToken();
            re_string_skip_bytes(input, 1);
            peek_token(next, input, syntax);
            re_string_skip_bytes(input, -1);
            if (next.type !== OP_ALT && next.type !== OP_CLOSE_SUBEXP) break;
        }
        token.type = ANCHOR;
        token.ctx_type = LINE_LAST;
        break;
    default:
        break;
    }
    return 1;
}

// Peek a token from INPUT inside a bracket expression.
function peek_token_bracket(token, input, syntax) {
    if (re_string_eoi(input)) {
        token.type = END_OF_RE;
        return 0;
    }
    const c = re_string_peek_byte(input, 0);
    token.c = c;
    if (c === 0x5c && (syntax & RE_BACKSLASH_ESCAPE_IN_LISTS)
        && input.cur_idx + 1 < input.len) {
        re_string_skip_bytes(input, 1);
        token.c = re_string_peek_byte(input, 0);
        token.type = CHARACTER;
        return 1;
    }
    if (c === 0x5b /* '[' */) {
        const c2 = input.cur_idx + 1 < input.len
            ? re_string_peek_byte(input, 1) : 0;
        token.c = c2;
        let token_len = 2;
        switch (String.fromCharCode(c2)) {
        case '.':
            token.type = OP_OPEN_COLL_ELEM;
            break;
        case '=':
            token.type = OP_OPEN_EQUIV_CLASS;
            break;
        case ':':
            if (syntax & RE_CHAR_CLASSES) {
                token.type = OP_OPEN_CHAR_CLASS;
                break;
            }
            // FALLTHROUGH
        default:
            token.type = CHARACTER;
            token.c = c;
            token_len = 1;
            break;
        }
        return token_len;
    }
    switch (String.fromCharCode(c)) {
    case '-':
        token.type = OP_CHARSET_RANGE;
        break;
    case ']':
        token.type = OP_CLOSE_BRACKET;
        break;
    case '^':
        token.type = OP_NON_MATCH_LIST;
        break;
    default:
        token.type = CHARACTER;
    }
    return 1;
}

// Entry point of the parser: build CAT(<reg_exp>, END_OF_RE).
function parse(regexp, preg, syntax, err) {
    const dfa = preg.buffer;
    dfa.syntax = syntax;
    const current_token = newToken();
    fetch_token(current_token, regexp, syntax | RE_CARET_ANCHORS_HERE);
    const tree = parse_reg_exp(regexp, preg, current_token, syntax, 0, err);
    if (err.value !== REG_NOERROR && tree == null) return null;
    const eor = create_tree(dfa, null, null, END_OF_RE);
    return tree != null ? create_tree(dfa, tree, eor, CONCAT) : eor;
}

// <branch1>|<branch2> becomes ALT(<branch1>, <branch2>).
function parse_reg_exp(regexp, preg, token, syntax, nest, err) {
    const dfa = preg.buffer;
    const initial_bkref_map = dfa.completed_bkref_map;
    let tree = parse_branch(regexp, preg, token, syntax, nest, err);
    if (err.value !== REG_NOERROR && tree == null) return null;
    while (token.type === OP_ALT) {
        let branch;
        fetch_token(token, regexp, syntax | RE_CARET_ANCHORS_HERE);
        if (token.type !== OP_ALT && token.type !== END_OF_RE
            && (nest === 0 || token.type !== OP_CLOSE_SUBEXP)) {
            const accumulated_bkref_map = dfa.completed_bkref_map;
            dfa.completed_bkref_map = initial_bkref_map;
            branch = parse_branch(regexp, preg, token, syntax, nest, err);
            if (err.value !== REG_NOERROR && branch == null) return null;
            dfa.completed_bkref_map |= accumulated_bkref_map;
        } else {
            branch = null;
        }
        tree = create_tree(dfa, tree, branch, OP_ALT);
    }
    return tree;
}

// <exp1><exp2> becomes CAT(<exp1>, <exp2>).
function parse_branch(regexp, preg, token, syntax, nest, err) {
    const dfa = preg.buffer;
    let tree = parse_expression(regexp, preg, token, syntax, nest, err);
    if (err.value !== REG_NOERROR && tree == null) return null;
    while (token.type !== OP_ALT && token.type !== END_OF_RE
           && (nest === 0 || token.type !== OP_CLOSE_SUBEXP)) {
        const expr = parse_expression(regexp, preg, token, syntax, nest, err);
        if (err.value !== REG_NOERROR && expr == null) return null;
        if (tree != null && expr != null) tree = create_tree(dfa, tree, expr, CONCAT);
        else if (tree == null) tree = expr;
    }
    return tree;
}

function parse_expression(regexp, preg, token, syntax, nest, err) {
    const dfa = preg.buffer;
    let tree;
    switch (token.type) {
    case CHARACTER:
        tree = create_token_tree(dfa, null, null, token);
        break;
    case OP_OPEN_SUBEXP:
        tree = parse_sub_exp(regexp, preg, token, syntax, nest + 1, err);
        if (err.value !== REG_NOERROR && tree == null) return null;
        break;
    case OP_OPEN_BRACKET:
        tree = parse_bracket_exp(regexp, dfa, token, syntax, err);
        if (err.value !== REG_NOERROR && tree == null) return null;
        break;
    case OP_BACK_REF:
        if (!(dfa.completed_bkref_map & (1 << token.idx))) {
            err.value = REG_ESUBREG;
            return null;
        }
        dfa.used_bkref_map |= 1 << token.idx;
        tree = create_token_tree(dfa, null, null, token);
        ++dfa.nbackref;
        dfa.has_mb_node = 1;
        break;
    case OP_OPEN_DUP_NUM:
        if (syntax & RE_CONTEXT_INVALID_DUP) {
            err.value = REG_BADRPT;
            return null;
        }
        // FALLTHROUGH
    case OP_DUP_ASTERISK:
    case OP_DUP_PLUS:
    case OP_DUP_QUESTION:
        if (syntax & RE_CONTEXT_INVALID_OPS) {
            err.value = REG_BADRPT;
            return null;
        } else if (syntax & RE_CONTEXT_INDEP_OPS) {
            fetch_token(token, regexp, syntax);
            return parse_expression(regexp, preg, token, syntax, nest, err);
        }
        // FALLTHROUGH
    case OP_CLOSE_SUBEXP:
        if (token.type === OP_CLOSE_SUBEXP
            && !(syntax & RE_UNMATCHED_RIGHT_PAREN_ORD)) {
            err.value = REG_ERPAREN;
            return null;
        }
        // FALLTHROUGH
    case OP_CLOSE_DUP_NUM:
        // Treat it as a normal character.
        token.type = CHARACTER;
        tree = create_token_tree(dfa, null, null, token);
        break;
    case ANCHOR:
        if ((token.ctx_type
             & (WORD_DELIM | NOT_WORD_DELIM | WORD_FIRST | WORD_LAST))
            && dfa.word_ops_used === 0) init_word_char(dfa);
        if (token.ctx_type === WORD_DELIM
            || token.ctx_type === NOT_WORD_DELIM) {
            let tree_first;
            if (token.ctx_type === WORD_DELIM) {
                token.ctx_type = WORD_FIRST;
                tree_first = create_token_tree(dfa, null, null, token);
                token.ctx_type = WORD_LAST;
            } else {
                token.ctx_type = INSIDE_WORD;
                tree_first = create_token_tree(dfa, null, null, token);
                token.ctx_type = INSIDE_NOTWORD;
            }
            const tree_last = create_token_tree(dfa, null, null, token);
            tree = create_tree(dfa, tree_first, tree_last, OP_ALT);
        } else {
            tree = create_token_tree(dfa, null, null, token);
        }
        // ANCHORs can't be followed by repetition operators: "^*" is
        // <ANCHOR(^)><CHAR(*)>.
        fetch_token(token, regexp, syntax);
        return tree;
    case OP_PERIOD:
        tree = create_token_tree(dfa, null, null, token);
        break;
    case OP_WORD:
    case OP_NOTWORD:
        tree = build_charclass_op(dfa, 'alnum', '_',
            token.type === OP_NOTWORD, err);
        if (err.value !== REG_NOERROR && tree == null) return null;
        break;
    case OP_SPACE:
    case OP_NOTSPACE:
        tree = build_charclass_op(dfa, 'space', '',
            token.type === OP_NOTSPACE, err);
        if (err.value !== REG_NOERROR && tree == null) return null;
        break;
    case OP_ALT:
    case END_OF_RE:
        return null;
    case BACK_SLASH:
        err.value = REG_EESCAPE;
        return null;
    default:
        return null;
    }
    fetch_token(token, regexp, syntax);
    while (token.type === OP_DUP_ASTERISK || token.type === OP_DUP_PLUS
           || token.type === OP_DUP_QUESTION || token.type === OP_OPEN_DUP_NUM) {
        const dup_tree = parse_dup_op(tree, regexp, dfa, token, syntax, err);
        if (err.value !== REG_NOERROR && dup_tree == null) return null;
        tree = dup_tree;
        if ((syntax & RE_CONTEXT_INVALID_DUP)
            && (token.type === OP_DUP_ASTERISK
                || token.type === OP_OPEN_DUP_NUM)) {
            err.value = REG_BADRPT;
            return null;
        }
    }
    return tree;
}

// (<reg_exp>) becomes SUBEXP(<reg_exp>).
function parse_sub_exp(regexp, preg, token, syntax, nest, err) {
    const dfa = preg.buffer;
    const cur_nsub = preg.re_nsub++;
    let tree;
    fetch_token(token, regexp, syntax | RE_CARET_ANCHORS_HERE);
    // The subexpression may be a null string.
    if (token.type === OP_CLOSE_SUBEXP) {
        tree = null;
    } else {
        tree = parse_reg_exp(regexp, preg, token, syntax, nest, err);
        if (err.value === REG_NOERROR && token.type !== OP_CLOSE_SUBEXP)
            err.value = REG_EPAREN;
        if (err.value !== REG_NOERROR) return null;
    }
    if (cur_nsub <= 8) dfa.completed_bkref_map |= 1 << cur_nsub;
    tree = create_tree(dfa, tree, null, SUBEXP);
    tree.token.idx = cur_nsub;
    return tree;
}

// Parse repetition operators like "*", "+", "{1,3}".
function parse_dup_op(elem, regexp, dfa, token, syntax, err) {
    let tree = null;
    let old_tree = null;
    let start;
    let end;
    const start_idx = regexp.cur_idx;
    const start_token = { ...token };
    if (token.type === OP_OPEN_DUP_NUM) {
        end = 0;
        start = fetch_number(regexp, token, syntax);
        if (start === -1) {
            if (token.type === CHARACTER && token.c === 0x2c /* ',' */) {
                start = 0; // "{,m}" is "{0,m}".
            } else {
                err.value = REG_BADBR; // <re>{} is invalid.
                return null;
            }
        }
        if (start !== -2) {
            // "{n}" is "{n,n}".
            end = token.type === OP_CLOSE_DUP_NUM ? start
                : token.type === CHARACTER && token.c === 0x2c
                    ? fetch_number(regexp, token, syntax) : -2;
        }
        if (start === -2 || end === -2) {
            if (!(syntax & RE_INVALID_INTERVAL_ORD)) {
                err.value = token.type === END_OF_RE ? REG_EBRACE : REG_BADBR;
                return null;
            }
            regexp.cur_idx = start_idx;
            Object.assign(token, start_token);
            token.type = CHARACTER;
            return elem;
        }
        if ((end !== -1 && start > end) || token.type !== OP_CLOSE_DUP_NUM) {
            err.value = REG_BADBR;
            return null;
        }
        if (RE_DUP_MAX < (end === -1 ? start : end)) {
            err.value = REG_ESIZE;
            return null;
        }
    } else {
        start = token.type === OP_DUP_PLUS ? 1 : 0;
        end = token.type === OP_DUP_QUESTION ? 1 : -1;
    }
    fetch_token(token, regexp, syntax);
    if (elem == null) return null;
    if (start === 0 && end === 0) return null;

    // Extract "<re>{n,m}" to "<re><re>...<re><re>{0,<m-n>}".
    if (start > 0) {
        tree = elem;
        for (let i = 2; i <= start; ++i) {
            elem = duplicate_tree(elem, dfa);
            tree = create_tree(dfa, tree, elem, CONCAT);
        }
        if (start === end) return tree;
        // Duplicate ELEM before it is marked optional.
        elem = duplicate_tree(elem, dfa);
        old_tree = tree;
    } else {
        old_tree = null;
    }
    if (elem.token.type === SUBEXP)
        postorder(elem, mark_opt_subexp, elem.token.idx);
    tree = create_tree(dfa, elem, null,
        end === -1 ? OP_DUP_ASTERISK : OP_ALT);
    // Rewrite <re>{0,n} as (<re>(<re>...<re>?)?)?...
    for (let i = start + 2; i <= end; ++i) {
        elem = duplicate_tree(elem, dfa);
        tree = create_tree(dfa, tree, elem, CONCAT);
        tree = create_tree(dfa, tree, null, OP_ALT);
    }
    if (old_tree) tree = create_tree(dfa, old_tree, tree, CONCAT);
    return tree;
}

// build_range_exp() for the "C" locale: no collation rules, and the
// collation sequence of a byte is the byte (C-collate.c collseqmb).
function build_range_exp(sbcset, start_elem, end_elem, syntax) {
    if (start_elem.type === EQUIV_CLASS || start_elem.type === CHAR_CLASS
        || end_elem.type === EQUIV_CLASS || end_elem.type === CHAR_CLASS)
        return REG_ERANGE;
    const start_collseq = lookup_collation_sequence_value(start_elem);
    const end_collseq = lookup_collation_sequence_value(end_elem);
    if (start_collseq === -1 || end_collseq === -1) return REG_ECOLLATE;
    if ((syntax & RE_NO_EMPTY_RANGES) && start_collseq > end_collseq)
        return REG_ERANGE;
    for (let ch = 0; ch < SBC_MAX; ch++) {
        if (start_collseq <= ch && ch <= end_collseq) sbcset[ch] = 1;
    }
    return REG_NOERROR;
}

// lookup_collation_sequence_value() with nrules == 0; -1 stands for
// UINT_MAX.
function lookup_collation_sequence_value(br_elem) {
    if (br_elem.type === SB_CHAR) return br_elem.ch;
    if (br_elem.type === COLL_SYM && br_elem.name.length === 1)
        return br_elem.name.charCodeAt(0);
    return -1;
}

// build_collating_symbol() with nrules == 0.
function build_collating_symbol(sbcset, name) {
    if (name.length !== 1) return REG_ECOLLATE;
    sbcset[name.charCodeAt(0)] = 1;
    return REG_NOERROR;
}

// Parse a bracket expression like "[abc]", "[a-c]", "[[.a-a.]]".
function parse_bracket_exp(regexp, dfa, token, syntax, err) {
    const sbcset = bitset_new();
    let non_match = false;
    let first_round = true;
    let token_len = peek_token_bracket(token, regexp, syntax);
    if (token.type === END_OF_RE) {
        err.value = REG_BADPAT;
        return null;
    }
    if (token.type === OP_NON_MATCH_LIST) {
        non_match = true;
        if (syntax & RE_HAT_LISTS_NOT_NEWLINE) sbcset[0x0a] = 1;
        re_string_skip_bytes(regexp, token_len);
        token_len = peek_token_bracket(token, regexp, syntax);
        if (token.type === END_OF_RE) {
            err.value = REG_BADPAT;
            return null;
        }
    }
    // The first ']' is a normal character.
    if (token.type === OP_CLOSE_BRACKET) token.type = CHARACTER;
    for (;;) {
        const start_elem = { type: COLL_SYM, ch: 0, name: '' };
        let token_len2 = 0;
        let is_range_exp = false;
        const token2 = newToken();
        let ret = parse_bracket_element(start_elem, regexp, token, token_len,
            syntax, first_round);
        if (ret !== REG_NOERROR) {
            err.value = ret;
            return null;
        }
        first_round = false;
        // Get information about the next token. We need it in any case.
        token_len = peek_token_bracket(token, regexp, syntax);
        // Do not check for ranges if we know they are not allowed.
        if (start_elem.type !== CHAR_CLASS && start_elem.type !== EQUIV_CLASS) {
            if (token.type === END_OF_RE) {
                err.value = REG_EBRACK;
                return null;
            }
            if (token.type === OP_CHARSET_RANGE) {
                re_string_skip_bytes(regexp, token_len); // Skip '-'.
                token_len2 = peek_token_bracket(token2, regexp, syntax);
                if (token2.type === END_OF_RE) {
                    err.value = REG_EBRACK;
                    return null;
                }
                if (token2.type === OP_CLOSE_BRACKET) {
                    // The last '-' is a normal character.
                    re_string_skip_bytes(regexp, -token_len);
                    token.type = CHARACTER;
                } else {
                    is_range_exp = true;
                }
            }
        }
        if (is_range_exp) {
            const end_elem = { type: COLL_SYM, ch: 0, name: '' };
            ret = parse_bracket_element(end_elem, regexp, token2, token_len2,
                syntax, true);
            if (ret !== REG_NOERROR) {
                err.value = ret;
                return null;
            }
            token_len = peek_token_bracket(token, regexp, syntax);
            err.value = build_range_exp(sbcset, start_elem, end_elem, syntax);
            if (err.value !== REG_NOERROR) return null;
        } else {
            switch (start_elem.type) {
            case SB_CHAR:
                sbcset[start_elem.ch] = 1;
                break;
            case EQUIV_CLASS:
                err.value = build_equiv_class(sbcset, start_elem.name);
                if (err.value !== REG_NOERROR) return null;
                break;
            case COLL_SYM:
                err.value = build_collating_symbol(sbcset, start_elem.name);
                if (err.value !== REG_NOERROR) return null;
                break;
            case CHAR_CLASS:
                err.value = build_charclass(sbcset, start_elem.name, syntax);
                if (err.value !== REG_NOERROR) return null;
                break;
            default:
                break;
            }
        }
        if (token.type === END_OF_RE) {
            err.value = REG_EBRACK;
            return null;
        }
        if (token.type === OP_CLOSE_BRACKET) break;
    }
    re_string_skip_bytes(regexp, token_len); // Skip a token.
    if (non_match) {
        for (let ch = 0; ch < SBC_MAX; ++ch) sbcset[ch] = sbcset[ch] ? 0 : 1;
    }
    const br_token = newToken(SIMPLE_BRACKET);
    br_token.sbcset = sbcset;
    return create_token_tree(dfa, null, null, br_token);
}

// Parse an element in the bracket expression.
function parse_bracket_element(elem, regexp, token, token_len, syntax,
    accept_hyphen) {
    re_string_skip_bytes(regexp, token_len); // Skip a token.
    if (token.type === OP_OPEN_COLL_ELEM || token.type === OP_OPEN_CHAR_CLASS
        || token.type === OP_OPEN_EQUIV_CLASS)
        return parse_bracket_symbol(elem, regexp, token);
    if (token.type === OP_CHARSET_RANGE && !accept_hyphen) {
        // A '-' must only appear as anything but a range indicator before
        // the closing bracket.
        const token2 = newToken();
        peek_token_bracket(token2, regexp, syntax);
        if (token2.type !== OP_CLOSE_BRACKET) return REG_ERANGE;
    }
    elem.type = SB_CHAR;
    elem.ch = token.c;
    return REG_NOERROR;
}

// Parse [:<character_class>:], [.<collating_element>.] or
// [=<equivalent_class>=].
function parse_bracket_symbol(elem, regexp, token) {
    const delim = token.c;
    let name = '';
    if (re_string_eoi(regexp)) return REG_EBRACK;
    for (let i = 0; ; ++i) {
        if (i >= BRACKET_NAME_BUF_SIZE) return REG_EBRACK;
        const ch = re_string_fetch_byte(regexp);
        if (re_string_eoi(regexp)) return REG_EBRACK;
        if (ch === delim && re_string_peek_byte(regexp, 0) === 0x5d) break;
        name += String.fromCharCode(ch);
    }
    re_string_skip_bytes(regexp, 1);
    // A NUL ends the C name buffer.
    const nul = name.indexOf('\0');
    elem.name = nul < 0 ? name : name.slice(0, nul);
    switch (token.type) {
    case OP_OPEN_COLL_ELEM:
        elem.type = COLL_SYM;
        break;
    case OP_OPEN_EQUIV_CLASS:
        elem.type = EQUIV_CLASS;
        break;
    case OP_OPEN_CHAR_CLASS:
        elem.type = CHAR_CLASS;
        break;
    default:
        break;
    }
    return REG_NOERROR;
}

// build_equiv_class() with nrules == 0.
function build_equiv_class(sbcset, name) {
    if (name.length !== 1) return REG_ECOLLATE;
    sbcset[name.charCodeAt(0)] = 1;
    return REG_NOERROR;
}

const CHARCLASS_FUNCTIONS = Object.freeze({
    alnum: isalnum,
    cntrl: iscntrl,
    lower: islower,
    space: isspace,
    alpha: isalpha,
    digit: isdigit,
    print: isprint,
    upper: isupper,
    blank: isblank,
    graph: isgraph,
    punct: ispunct,
    xdigit: isxdigit,
});

function build_charclass(sbcset, class_name, syntax) {
    let name = class_name;
    if ((syntax & RE_ICASE) && (name === 'upper' || name === 'lower'))
        name = 'alpha';
    if (!Object.hasOwn(CHARCLASS_FUNCTIONS, name)) return REG_ECTYPE;
    const ctype_func = CHARCLASS_FUNCTIONS[name];
    for (let i = 0; i < SBC_MAX; ++i) {
        if (ctype_func(i)) sbcset[i] = 1;
    }
    return REG_NOERROR;
}

function build_charclass_op(dfa, class_name, extra, non_match, err) {
    const sbcset = bitset_new();
    const ret = build_charclass(sbcset, class_name, 0);
    if (ret !== REG_NOERROR) {
        err.value = ret;
        return null;
    }
    // \w matches '_' also.
    for (const ch of extra) sbcset[ch.charCodeAt(0)] = 1;
    if (non_match) {
        for (let ch = 0; ch < SBC_MAX; ++ch) sbcset[ch] = sbcset[ch] ? 0 : 1;
    }
    const br_token = newToken(SIMPLE_BRACKET);
    br_token.sbcset = sbcset;
    return create_token_tree(dfa, null, null, br_token);
}

// Fetch a number for "a{1,3}". Return -1 for an empty field such as
// "{,1}", RE_DUP_MAX + 1 for a too-large one, and -2 on error.
function fetch_number(input, token, syntax) {
    let num = -1;
    for (;;) {
        fetch_token(token, input, syntax);
        const c = token.c;
        if (token.type === END_OF_RE) return -2;
        if (token.type === OP_CLOSE_DUP_NUM || c === 0x2c) break;
        num = token.type !== CHARACTER || c < 0x30 || c > 0x39 || num === -2
            ? -2
            : num === -1
                ? c - 0x30
                : Math.min(RE_DUP_MAX + 1, num * 10 + c - 0x30);
    }
    return num;
}

function create_tree(dfa, left, right, type) {
    return create_token_tree(dfa, left, right, newToken(type));
}

function create_token_tree(_dfa, left, right, token) {
    const tree = {
        parent: null,
        left,
        right,
        token: { ...token, duplicated: 0, opt_subexp: 0 },
        first: null,
        next: null,
        node_idx: -1,
    };
    if (left != null) left.parent = tree;
    if (right != null) right.parent = tree;
    return tree;
}

// Mark the tree SRC as an optional subexpression.
function mark_opt_subexp(idx, node) {
    if (node.token.type === SUBEXP && node.token.idx === idx)
        node.token.opt_subexp = 1;
    return REG_NOERROR;
}

// Duplicate the tree ROOT; a preorder walk that keeps two parallel trees.
function duplicate_tree(root, dfa) {
    let dup_root = null;
    let setNew = (tree) => { dup_root = tree; };
    let dup_node = root.parent;
    let node = root;
    for (;;) {
        const created = create_token_tree(dfa, null, null, node.token);
        setNew(created);
        created.parent = dup_node;
        created.token.duplicated = 1;
        dup_node = created;
        if (node.left) {
            node = node.left;
            const parent = dup_node;
            setNew = (tree) => { parent.left = tree; };
        } else {
            let prev = null;
            while (node.right === prev || node.right == null) {
                prev = node;
                node = node.parent;
                dup_node = dup_node.parent;
                if (!node) return dup_root;
            }
            node = node.right;
            const parent = dup_node;
            setNew = (tree) => { parent.right = tree; };
        }
    }
}
