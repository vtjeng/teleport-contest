// Exact BUFSZ-boundary inputs shared by the recorder-libc oracle and the
// JavaScript resource runner. Keep this module dependency-free so neither
// runner imports the other's timing, process, or compiler machinery.

export const REGEX_EXACT_BOUNDARY_BYTES = 255;

function exactCase(name, pattern,
    input = 'a'.repeat(REGEX_EXACT_BOUNDARY_BYTES)) {
    return Object.freeze({
        name,
        pattern,
        input,
        expected: false,
    });
}

export const EXACT_BOUNDARY_REGEX_CASES = Object.freeze([
    exactCase(
        'correlated-reference',
        String.raw`^((a+)|(a+)|(a+)|(a+))*\2\3\4\5`
            + '()'.repeat(108) + 'c{235}b$',
        'a'.repeat(19) + 'c'.repeat(235) + 'a',
    ),
    exactCase(
        'unanchored-direct',
        '(a|aa)*' + 'a?'.repeat(123) + 'b$',
    ),
    exactCase(
        'unanchored-reference',
        '(a' + 'a?'.repeat(124) + String.raw`)\1b$`,
    ),
]);

export const ADJACENT_REPEAT_CASES = Object.freeze([
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
]);
