// Exact BUFSZ-boundary inputs shared by the recorder-libc oracle and the
// JavaScript resource runner. Keep this module dependency-free so neither
// runner imports the other's timing, process, or compiler machinery.

export const REGEX_EXACT_BOUNDARY_BYTES = 255;

const DIRECT_WIDE_FRONTIER_PATTERN = '(a|aa)*'
    + 'a?'.repeat(123) + 'b$';
const REFERENCE_WIDE_FRONTIER_PATTERN = '(a'
    + 'a?'.repeat(124) + String.raw`)\1b$`;
const CORRELATED_REFERENCE_PATTERN = String.raw`^((a+)|(a+)|(a+)|(a+))*\2\3\4\5`
    + '()'.repeat(108) + 'c{235}b$';

function exactCase(name, pattern, input, expected, budgetMs,
    budgetMaxRssKiB) {
    return Object.freeze({
        kind: 'exact-boundary',
        name,
        pattern,
        input,
        expected,
        budgetMs,
        budgetMaxRssKiB,
    });
}

export const EXACT_BOUNDARY_REGEX_CASES = Object.freeze([
    exactCase(
        'literal-suffix-guard',
        DIRECT_WIDE_FRONTIER_PATTERN,
        'a'.repeat(REGEX_EXACT_BOUNDARY_BYTES),
        false,
        1000,
        96 * 1024,
    ),
    exactCase(
        'suffix-reaching-direct-memo',
        DIRECT_WIDE_FRONTIER_PATTERN,
        'a'.repeat(253) + 'cb',
        true,
        1000,
        96 * 1024,
    ),
    exactCase(
        'suffix-reaching-reference-memo',
        REFERENCE_WIDE_FRONTIER_PATTERN,
        'a'.repeat(254) + 'b',
        true,
        2000,
        128 * 1024,
    ),
    exactCase(
        'suffix-reaching-zero-minimum',
        String.raw`^(a+)*\1` + '()'.repeat(123) + '$',
        'a'.repeat(REGEX_EXACT_BOUNDARY_BYTES),
        true,
        2000,
        128 * 1024,
    ),
    exactCase(
        'suffix-reaching-correlated-frontier',
        CORRELATED_REFERENCE_PATTERN,
        'a'.repeat(18) + 'd' + 'c'.repeat(235) + 'b',
        false,
        2000,
        128 * 1024,
    ),
]);

export const FIXED_POINT_REGEX_RESOURCE_CASE = Object.freeze({
    kind: 'fixed-point',
    name: 'adjacent-repeat-fixed-point',
    budgetMs: 1000,
    budgetMaxRssKiB: 96 * 1024,
    cases: Object.freeze([
        Object.freeze({
            pattern: '^a**$',
            matches: Object.freeze(['', 'a', 'aa']),
            misses: Object.freeze(['b']),
        }),
        Object.freeze({
            pattern: '^a?+$',
            matches: Object.freeze(['', 'a', 'aa']),
            misses: Object.freeze(['b']),
        }),
    ]),
});

export const FINITE_ZERO_WIDTH_REGEX_RESOURCE_CASE = Object.freeze({
    kind: 'finite-zero-width-fixed-point',
    name: 'finite-zero-width-repeat-fixed-point',
    budgetMs: 1000,
    budgetMaxRssKiB: 96 * 1024,
    pattern: String.raw`^(()|()|()|()|()|()|()|()){1,32767}\1\2\3\4\5\6\7\8\9[b]$`,
    input: 'a'.repeat(REGEX_EXACT_BOUNDARY_BYTES),
    expected: false,
});

export const REGEX_RESOURCE_CASES = Object.freeze([
    ...EXACT_BOUNDARY_REGEX_CASES,
    FIXED_POINT_REGEX_RESOURCE_CASE,
    FINITE_ZERO_WIDTH_REGEX_RESOURCE_CASE,
]);

export const REGEX_RESOURCE_OUTPUT_NAMES = Object.freeze(
    REGEX_RESOURCE_CASES.map(({ name }) => name),
);
