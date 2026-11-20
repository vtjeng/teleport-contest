// Regex inputs that stress the port of macOS's regex (js/tre_compile.js and
// js/tre_match_parallel.js), run by scripts/run-startup-regex-resource.mjs
// each in its own process under a CPU and memory budget. Keep this module
// dependency-free so the runner's children import nothing else.
//
// TRE builds a position automaton: each character of the expanded pattern
// is a state, and a nullable piece links every position before it to every
// position after it, so the work grows with the square of the pattern.
// NetHack reads a pattern into a BUFSZ buffer, so the exact-boundary cases
// use 255-byte patterns and texts, the most a pattern or message can hold.
// Bounds multiply instead: tre_expand_ast() copies the iterated piece once
// per repetition. Each expected value restates what macOS answered for the
// same pattern in experiments/host-parity/regex-oracle/ (run 44628090866)
// or follows from it, as noted.

export const REGEX_EXACT_BOUNDARY_BYTES = 255;

// 123 optional characters after a loop: every state reaches every later
// one. In the oracle macOS matched this pattern against "b" and "ab" and
// against no text without a final "b".
const WIDE_FRONTIER_PATTERN = '(a|aa)*' + 'a?'.repeat(123) + 'b$';
// Fifty nested nullable loops, each linking to all the others, then a
// literal suffix that no text below contains. The oracle has "(a*)*" alone
// and 255 bytes of "(a*)*".
const NULLABLE_LOOP_CHAIN_PATTERN = '(a*)*'.repeat(50) + 'xyzb$';

function exactCase(name, pattern, input, expected, budgetCpuMs,
    budgetMaxRssKiB) {
    return Object.freeze({
        kind: 'exact-boundary',
        name,
        pattern,
        input,
        expected,
        budgetCpuMs,
        budgetMaxRssKiB,
    });
}

export const EXACT_BOUNDARY_REGEX_CASES = Object.freeze([
    // No "b" at the end, so every start position runs to the end of the
    // text and fails.
    exactCase(
        'wide-frontier-miss',
        WIDE_FRONTIER_PATTERN,
        'a'.repeat(REGEX_EXACT_BOUNDARY_BYTES),
        false,
        1000,
        128 * 1024,
    ),
    // The final "b" matches through the empty loop and empty options.
    exactCase(
        'wide-frontier-match',
        WIDE_FRONTIER_PATTERN,
        'a'.repeat(253) + 'cb',
        true,
        1000,
        128 * 1024,
    ),
    exactCase(
        'nullable-loop-chain-miss',
        NULLABLE_LOOP_CHAIN_PATTERN,
        'a'.repeat(REGEX_EXACT_BOUNDARY_BYTES),
        false,
        1000,
        128 * 1024,
    ),
]);

// Patterns whose cost is in tre_expand_ast(), not the text.
function boundCase(name, pattern, input, expected, budgetCpuMs,
    budgetMaxRssKiB) {
    return Object.freeze({
        kind: 'nested-bound',
        name,
        pattern,
        input,
        expected,
        budgetCpuMs,
        budgetMaxRssKiB,
    });
}

export const NESTED_BOUND_REGEX_CASES = Object.freeze([
    // 65,025 positions. macOS compiled it and matched it against the oracle
    // texts in 9.3 seconds (oracle case 17688); it matched every text, the
    // empty one included, so it matches anything. The port needs about
    // 1.1 GB for its transitions.
    boundCase(
        'nested-bound-65025-positions',
        '(a{0,255}){0,255}',
        'b',
        true,
        10_000,
        1536 * 1024,
    ),
    // 520,200 positions, under js/tre_compile.js MAX_POSITIONS, but past
    // MAX_WORK: the port refuses it as out of memory after building the
    // positions. Its macOS answer was not measured.
    boundCase(
        'nested-bound-work-limit',
        '((a{0,8}){0,255}){0,255}',
        'a',
        { error: 'out of memory' },
        10_000,
        1536 * 1024,
    ),
    // 16,581,375 positions: macOS returned REG_ESPACE (oracle case 17692),
    // and the port refuses past js/tre_compile.js MAX_POSITIONS before
    // building anything.
    boundCase(
        'nested-bound-position-limit',
        '((a{255}){255}){255}',
        'a',
        { error: 'out of memory' },
        1000,
        128 * 1024,
    ),
]);

// Patterns that loop on nullable pieces, to show the automaton has no
// fixed-point search that could fail to end. macOS rejects stacked
// operators such as "a**" (REG_BADRPT), so these nest them in groups. The
// oracle has the unanchored "(a*)*" and "(a?)*", which macOS matched
// against every text; the anchored answers below follow from them.
export const FIXED_POINT_REGEX_RESOURCE_CASE = Object.freeze({
    kind: 'fixed-point',
    name: 'nested-nullable-fixed-point',
    budgetCpuMs: 1000,
    budgetMaxRssKiB: 96 * 1024,
    cases: Object.freeze([
        Object.freeze({
            pattern: '^(a*)*$',
            matches: Object.freeze(['', 'a', 'aa']),
            misses: Object.freeze(['b']),
        }),
        Object.freeze({
            pattern: '^(a?)+$',
            matches: Object.freeze(['', 'a', 'aa']),
            misses: Object.freeze(['b']),
        }),
    ]),
});

export const REGEX_RESOURCE_CASES = Object.freeze([
    ...EXACT_BOUNDARY_REGEX_CASES,
    ...NESTED_BOUND_REGEX_CASES,
    FIXED_POINT_REGEX_RESOURCE_CASE,
]);

export const REGEX_RESOURCE_OUTPUT_NAMES = Object.freeze(
    REGEX_RESOURCE_CASES.map(({ name }) => name),
);
