// tre_compile.js -- Apple Libc regex/TRE/lib/tre-compile.c (tag
// Libc-1752.120.2): tre_compile(), which parses a pattern and builds the
// tagged NFA (TNFA) that js/tre_match_parallel.js runs. See
// js/tre_internal.js for the source and the configuration this port keeps.
//
// The TNFA is a position automaton: every character literal of the
// expanded syntax tree is a state, and a transition from position p1 to p2
// consumes p1's character. Assertions (^, $, [[:<:]], [[:>:]]) are not
// states; tre_compute_npfl() attaches them to the positions next to them,
// and the matcher checks them on the transitions. That attachment follows
// one empty path through a nullable subexpression (tre_match_empty()), the
// leftmost of a union, so "(^|x*)a" requires the start of the line before
// "a" even where x* could match nothing. The port keeps this.
//
// posixregex.c compiles with REG_NOSUB and an extended regex has no back
// references, so tre_compile() skips tre_add_tags(): no transition carries
// tags, and the parallel matcher needs none. The port leaves out tags,
// approximate-matching parameters and the back-reference fields.
//
// tre_expand_ast() copies an iterated expression once per repetition, so
// nested bounds multiply: "((a{255}){255}){255}" is 16,581,375 positions.
// What stops such a pattern on macOS is memory: on the GitHub macOS runner
// of run 44628090866 (experiments/host-parity/regex-oracle/) regcomp()
// returned REG_ESPACE for it after 10.6 seconds, and compiled
// "(a{0,255}){0,255}", 65,025 positions, in 9.3 seconds. The port refuses
// an expansion past MAX_POSITIONS with REG_ESPACE rather than build it; a
// Mac with more memory might compile patterns between the two sizes that
// the port refuses.
import {
    tre_ast_new_catenation,
    tre_ast_new_iter,
    tre_ast_new_literal,
    tre_ast_new_union,
} from './tre_ast.js';
import { tre_parse } from './tre_parse.js';
import {
    ASSERTION,
    ASSERT_BRACKET_MATCH,
    CATENATION,
    EMPTY,
    ITERATION,
    LITERAL,
    REG_ESPACE,
    REG_OK,
    SUBMATCH_ID_INVISIBLE_START,
    UNION,
} from './tre_internal.js';

// The port's limit on positions after tre_expand_ast(); see above.
export const MAX_POSITIONS = 1 << 20;

// A literal that is a character (or bracket), not EMPTY or ASSERTION
// (IS_SPECIAL() is code_min < 0).
function isSpecial(lit) {
    return lit.code_min < 0;
}

// tre_copy_ast(): a copy of `ast` with new nodes. Bracket lists are shared,
// as in C. Only the flags that touch tags differ between C's calls, and an
// untagged tree has none. `budget.positions` counts the character literals
// made, for MAX_POSITIONS.
function tre_copy_ast(ast, budget) {
    switch (ast.type) {
    case LITERAL: {
        const lit = ast.obj;
        if (!isSpecial(lit)) budget.positions++;
        const copy = tre_ast_new_literal(lit.code_min, lit.code_max);
        if (!isSpecial(lit)) copy.obj.bracket_match_list = lit.bracket_match_list;
        return copy;
    }
    case UNION:
        return tre_ast_new_union(tre_copy_ast(ast.obj.left, budget),
            tre_copy_ast(ast.obj.right, budget));
    case CATENATION:
        return tre_ast_new_catenation(tre_copy_ast(ast.obj.left, budget),
            tre_copy_ast(ast.obj.right, budget));
    case ITERATION: {
        const iter = ast.obj;
        return tre_ast_new_iter(tre_copy_ast(iter.arg, budget), iter.min, iter.max,
            iter.minimal);
    }
    default:
        throw new Error(`tre_copy_ast: node type ${ast.type}`);
    }
}

// Character literals in a tree.
function countPositions(node) {
    switch (node.type) {
    case LITERAL: return isSpecial(node.obj) ? 0 : 1;
    case UNION:
    case CATENATION: return countPositions(node.obj.left) + countPositions(node.obj.right);
    case ITERATION: return countPositions(node.obj.arg);
    default: throw new Error(`countPositions: node type ${node.type}`);
    }
}

// tre_expand_ast(): expand, innermost first, each iteration node with a
// finite count above 1 into a catenation of copies, and replace {0,0} with
// EMPTY. The iterations left are *, +, ? and {1}. C assigns provisional
// positions here; tre_compute_npfl() renumbers every literal, so the port
// does not. Returns REG_OK or REG_ESPACE.
function tre_expand_ast(node, budget) {
    switch (node.type) {
    case LITERAL:
        return REG_OK;
    case UNION:
    case CATENATION: {
        const status = tre_expand_ast(node.obj.left, budget);
        return status === REG_OK ? tre_expand_ast(node.obj.right, budget) : status;
    }
    case ITERATION: {
        const iter = node.obj;
        const status = tre_expand_ast(iter.arg, budget);
        if (status !== REG_OK) return status;
        if (iter.min === 0 && iter.max === 0) {
            const empty = tre_ast_new_literal(EMPTY, -1);
            node.obj = empty.obj;
            node.type = empty.type;
        } else if (iter.min > 1 || iter.max > 1) {
            // Each copy adds the argument's positions; refuse before
            // building past the limit.
            const copies = iter.max === -1 ? iter.min + 1 : iter.max;
            if (budget.positions + copies * countPositions(iter.arg) > MAX_POSITIONS)
                return REG_ESPACE;
            let seq1 = null;
            let seq2 = null;
            // Create a catenated sequence of copies of the node.
            for (let j = 0; j < iter.min; j++) {
                const copy = tre_copy_ast(iter.arg, budget);
                seq1 = seq1 !== null ? tre_ast_new_catenation(seq1, copy) : copy;
            }
            if (iter.max === -1) {
                // No upper limit.
                seq2 = tre_ast_new_iter(tre_copy_ast(iter.arg, budget), 0, -1, 0);
            } else {
                for (let j = iter.min; j < iter.max; j++) {
                    const copy = tre_copy_ast(iter.arg, budget);
                    seq2 = seq2 !== null ? tre_ast_new_catenation(copy, seq2) : copy;
                    seq2 = tre_ast_new_union(tre_ast_new_literal(EMPTY, -1), seq2);
                }
            }
            if (seq1 === null) seq1 = seq2;
            else if (seq2 !== null) seq1 = tre_ast_new_catenation(seq1, seq2);
            node.obj = seq1.obj;
            node.type = seq1.type;
        }
        return REG_OK;
    }
    default:
        throw new Error(`tre_expand_ast: node type ${node.type}`);
    }
}

// A position set (tre_pos_and_tags_t[]): entries { position, code_min,
// code_max, assertions, bracket_match_list }. C ends each array with
// position -1; the port uses the array length.

// tre_set_one(): one position. firstpos entries carry no bracket list;
// lastpos entries do, because a transition takes its character test from
// its source position.
function tre_set_one(position, code_min, code_max, bracket_match_list) {
    return [{ position, code_min, code_max, assertions: 0, bracket_match_list }];
}

// tre_set_union(): set1's entries with `assertions` added, then set2's
// unchanged ("XXX - why not | assertions here as well?" in C).
function tre_set_union(set1, set2, assertions) {
    const out = [];
    for (const p of set1) {
        out.push(assertions ? { ...p, assertions: p.assertions | assertions } : p);
    }
    for (const p of set2) out.push(p);
    return out;
}

// tre_match_empty(): the assertions on the empty path through a nullable
// node that POSIX prefers: a union's left side when it is nullable, both
// sides of a catenation, and an iteration's argument when it is nullable.
function tre_match_empty(node) {
    let assertions = 0;
    const stack = [node];
    while (stack.length) {
        node = stack.pop();
        switch (node.type) {
        case LITERAL:
            if (node.obj.code_min === ASSERTION) assertions |= node.obj.code_max;
            break;
        case UNION:
            if (node.obj.left.nullable) stack.push(node.obj.left);
            else if (node.obj.right.nullable) stack.push(node.obj.right);
            break;
        case CATENATION:
            stack.push(node.obj.left, node.obj.right);
            break;
        case ITERATION:
            if (node.obj.arg.nullable) stack.push(node.obj.arg);
            break;
        default:
            throw new Error(`tre_match_empty: node type ${node.type}`);
        }
    }
    return assertions;
}

// tre_compute_npfl(): nullable, firstpos and lastpos for every node, and a
// position for every character literal, numbered left to right as C's
// stack walk does. Returns the number of positions.
function tre_compute_npfl(node, nextpos) {
    switch (node.type) {
    case LITERAL: {
        const lit = node.obj;
        if (lit.code_min < 0) {
            // Empty strings and zero-width assertions: nullable, no
            // positions.
            node.nullable = 1;
            node.firstpos = [];
            node.lastpos = [];
        } else {
            node.nullable = 0;
            lit.position = nextpos++;
            node.firstpos = tre_set_one(lit.position, lit.code_min, lit.code_max, null);
            node.lastpos = tre_set_one(lit.position, lit.code_min, lit.code_max,
                lit.bracket_match_list);
        }
        return nextpos;
    }
    case UNION: {
        const uni = node.obj;
        nextpos = tre_compute_npfl(uni.left, nextpos);
        nextpos = tre_compute_npfl(uni.right, nextpos);
        node.nullable = uni.left.nullable || uni.right.nullable ? 1 : 0;
        node.firstpos = tre_set_union(uni.left.firstpos, uni.right.firstpos, 0);
        node.lastpos = tre_set_union(uni.left.lastpos, uni.right.lastpos, 0);
        return nextpos;
    }
    case ITERATION: {
        const iter = node.obj;
        nextpos = tre_compute_npfl(iter.arg, nextpos);
        // lastpos of a nullable argument also carries the assertions of its
        // empty path (C's comment cites \(a*\)*b\(\1\)).
        if (iter.min === 0 || iter.arg.nullable) {
            node.nullable = 1;
            if (iter.arg.nullable) {
                const assertions = tre_match_empty(iter.arg);
                node.lastpos = tre_set_union(iter.arg.lastpos, iter.arg.lastpos, assertions);
            } else {
                node.lastpos = iter.arg.lastpos;
            }
        } else {
            node.nullable = 0;
            node.lastpos = iter.arg.lastpos;
        }
        node.firstpos = iter.arg.firstpos;
        return nextpos;
    }
    case CATENATION: {
        const cat = node.obj;
        nextpos = tre_compute_npfl(cat.left, nextpos);
        nextpos = tre_compute_npfl(cat.right, nextpos);
        node.nullable = cat.left.nullable && cat.right.nullable ? 1 : 0;
        // Compute firstpos.
        node.firstpos = cat.left.nullable
            ? tre_set_union(cat.right.firstpos, cat.left.firstpos, tre_match_empty(cat.left))
            : cat.left.firstpos;
        // Compute lastpos.
        node.lastpos = cat.right.nullable
            ? tre_set_union(cat.left.lastpos, cat.right.lastpos, tre_match_empty(cat.right))
            : cat.right.lastpos;
        return nextpos;
    }
    default:
        throw new Error(`tre_compute_npfl: node type ${node.type}`);
    }
}

// tre_make_trans(): a transition from each position in p1 to each in p2,
// with p1's character range and bracket list and both entries'
// assertions. Consecutive entries of p2 at one position add one
// transition.
function tre_make_trans(p1set, p2set, transitions) {
    for (const p1 of p1set) {
        let prev_p2_pos = -1;
        for (const p2 of p2set) {
            if (p2.position === prev_p2_pos) continue;
            prev_p2_pos = p2.position;
            transitions[p1.position].push({
                code_min: p1.code_min,
                code_max: p1.code_max,
                state_id: p2.position,
                assertions: p1.assertions | p2.assertions
                    | (p1.bracket_match_list !== null ? ASSERT_BRACKET_MATCH : 0),
                bracket_match_list: p1.bracket_match_list,
            });
        }
    }
}

// tre_ast_to_tnfa(): the transitions of every catenation and loop.
function tre_ast_to_tnfa(node, transitions) {
    switch (node.type) {
    case LITERAL:
        break;
    case UNION:
        tre_ast_to_tnfa(node.obj.left, transitions);
        tre_ast_to_tnfa(node.obj.right, transitions);
        break;
    case CATENATION:
        tre_make_trans(node.obj.left.lastpos, node.obj.right.firstpos, transitions);
        tre_ast_to_tnfa(node.obj.left, transitions);
        tre_ast_to_tnfa(node.obj.right, transitions);
        break;
    case ITERATION:
        // After tre_expand_ast() the maximum is 1 or unbounded.
        if (node.obj.max === -1)
            tre_make_trans(node.obj.arg.lastpos, node.obj.arg.firstpos, transitions);
        tre_ast_to_tnfa(node.obj.arg, transitions);
        break;
    default:
        throw new Error(`tre_ast_to_tnfa: node type ${node.type}`);
    }
}

/**
 * tre_compile(): compile the pattern codes s[0..n) (s[n] is C's
 * terminating 0) with `cflags`. Returns { err, tnfa }; tnfa holds
 * transitions[state] (each state's list of transitions), initial (the
 * transitions into the first positions), final (the accepting state),
 * num_states and first_char.
 */
export function tre_compile(s, n, cflags) {
    const ctx = {
        s,
        re: 0,
        len: n,
        cflags,
        submatch_id: 0,
        submatch_id_invisible: SUBMATCH_ID_INVISIBLE_START,
        nofirstsub: 0,
        stack: [],
        result: null,
    };
    // Parse the regexp. An extended regex without REG_ENHANCED writes no
    // back reference, so the back-reference checks after this cannot fail.
    const errcode = tre_parse(ctx);
    if (errcode !== REG_OK) return { err: errcode, tnfa: null };
    let tree = ctx.result;

    // Expand iteration nodes.
    const budget = { positions: countPositions(tree) };
    const expanded = tre_expand_ast(tree, budget);
    if (expanded !== REG_OK) return { err: expanded, tnfa: null };

    // Add a dummy node for the final state.
    const user_tree = tree;
    tree = tre_ast_new_catenation(user_tree, tre_ast_new_literal(0, 0));
    const numpos = tre_compute_npfl(tree, 0);

    const transitions = Array.from({ length: numpos }, () => []);
    tre_ast_to_tnfa(tree, transitions);

    // Set first_char only if there is only one character that can be the
    // first character of a match: a single transition, on one character,
    // leaves the first positions.
    let first_char = -1;
    if (!user_tree.nullable) {
        let scanning = true;
        for (const p of tree.firstpos) {
            if (!scanning) break;
            for (const j of transitions[p.position]) {
                if (j.code_min <= j.code_max) {
                    if (j.code_max !== j.code_min || j.code_min === -1 || first_char !== -1) {
                        first_char = -1;
                        scanning = false;
                        break;
                    }
                    first_char = j.code_min;
                }
            }
        }
    }

    const initial = tree.firstpos.map((p) => ({
        state_id: p.position,
        assertions: p.assertions,
    }));
    return {
        err: REG_OK,
        tnfa: {
            transitions,
            initial,
            final: tree.lastpos[0].position,
            num_states: numpos,
            first_char,
            cflags,
        },
    };
}
