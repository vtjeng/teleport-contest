// SPDX-License-Identifier: BSD-2-Clause
//
// A JavaScript translation of TRE as Apple Libc ships it.
// Copyright (c) 2001-2009 Ville Laurikari <vl@iki.fi>. All rights reserved.
// Distributed under the licence in licenses/TRE-LICENSE.txt.
//
// tre_ast.js -- Apple Libc regex/TRE/lib/tre-ast.c (tag Libc-1752.120.2):
// the syntax-tree nodes that js/tre_parse.js builds and js/tre_compile.js
// turns into an automaton. See js/tre_internal.js for the source and the
// configuration this port keeps.
//
// A node is { type, obj, nullable, submatch_id, num_submatches, firstpos,
// lastpos }, as tre_ast_node_t; obj holds the type's own fields. The fields
// that only tags, approximate matching or the last-matched-branch
// bookkeeping use are left out: posixregex.c compiles with REG_NOSUB, so
// tre_compile() never adds tags.
import { CATENATION, ITERATION, LITERAL, UNION } from './tre_internal.js';

// tre_ast_new_node(): nullable and submatch_id start at -1.
function tre_ast_new_node(type, obj) {
    return {
        type,
        obj,
        nullable: -1,
        submatch_id: -1,
        num_submatches: 0,
        firstpos: null,
        lastpos: null,
    };
}

// tre_ast_new_literal(): a character range, or a special code (EMPTY,
// ASSERTION) in code_min. A bracket expression is the range 0 to
// TRE_CHAR_MAX plus its bracket_match_list.
export function tre_ast_new_literal(code_min, code_max) {
    return tre_ast_new_node(LITERAL, {
        code_min,
        code_max,
        position: -1,
        bracket_match_list: null,
    });
}

export function tre_ast_new_iter(arg, min, max, minimal) {
    const node = tre_ast_new_node(ITERATION, { arg, min, max, minimal });
    node.num_submatches = arg.num_submatches;
    return node;
}

export function tre_ast_new_union(left, right) {
    const node = tre_ast_new_node(UNION, { left, right });
    node.num_submatches = left.num_submatches + right.num_submatches;
    return node;
}

export function tre_ast_new_catenation(left, right) {
    const node = tre_ast_new_node(CATENATION, { left, right });
    node.num_submatches = left.num_submatches + right.num_submatches;
    return node;
}
