// posixregex.js -- Configuration-time POSIX extended-regexp validation.
// C ref: sys/share/posixregex.c regex_init(), regex_compile(), and
// regex_error_desc(). The recorder links this implementation and calls libc
// regcomp() with REG_EXTENDED | REG_NOSUB.
//
// This module owns compile-time syntax only. It deliberately does not expose a
// matcher: pickup.c check_autopickup_exceptions() is outside the startup slice
// that first consumes this validator. Bracket ranges compare ordinary
// characters by code point. That matches the fresh ASCII C.UTF-8 cases, but it
// does not claim to reproduce locale-specific collation for non-ASCII ranges.

const POSIX_CHARACTER_CLASSES = Object.freeze(new Set([
    'alnum',
    'alpha',
    'blank',
    'cntrl',
    'digit',
    'graph',
    'lower',
    'print',
    'punct',
    'space',
    'upper',
    'xdigit',
]));

const INVALID_REGEXP = 'Invalid regular expression';
const UNMATCHED_BRACKET = 'Unmatched [, [^, [:, [., or [=';
const INVALID_RANGE = 'Invalid range end';
const INVALID_COLLATION = 'Invalid collation character';

function bracketError(pattern, bodyStart) {
    return bodyStart >= pattern.length || (
        pattern[bodyStart] === '^' && bodyStart + 1 >= pattern.length
    ) ? INVALID_REGEXP : UNMATCHED_BRACKET;
}

function bracketSpecial(pattern, index) {
    const marker = pattern[index + 1];
    if (pattern[index] !== '[' || ![':', '.', '='].includes(marker)) {
        return null;
    }
    const close = pattern.indexOf(`${marker}]`, index + 2);
    if (close < 0) return { error: UNMATCHED_BRACKET };
    const value = pattern.slice(index + 2, close);
    if (marker === ':' && !POSIX_CHARACTER_CLASSES.has(value)) {
        return { error: 'Invalid character class name' };
    }
    // C.UTF-8 has one-character collating and equivalence elements. The
    // syntax is still recognized separately so `[.x.]` (without the outer
    // bracket-expression pair) remains ordinary bracket content as in libc.
    if (marker !== ':' && [...value].length !== 1) {
        return { error: INVALID_COLLATION };
    }
    return {
        index: close + 2,
        rangeCharacter: marker === ':' ? null : value,
    };
}

function bracketItem(pattern, index) {
    const special = bracketSpecial(pattern, index);
    if (special) return special;
    if (pattern[index] === '\\' && index + 1 < pattern.length) {
        return { index: index + 2, rangeCharacter: pattern[index + 1] };
    }
    return { index: index + 1, rangeCharacter: pattern[index] };
}

function bracketExpression(pattern, start) {
    let index = start + 1;
    const bodyStart = index;
    if (pattern[index] === '^') ++index;

    let first = true;
    if (pattern[index] === ']') {
        ++index;
        first = false;
    }

    while (index < pattern.length) {
        if (pattern[index] === ']' && !first) {
            return { index: index + 1 };
        }
        const item = bracketItem(pattern, index);
        if (item.error) return item;
        index = item.index;
        first = false;

        if (index < pattern.length && pattern[index] === '-'
            && pattern[index + 1] !== ']' && index + 1 < pattern.length) {
            const end = bracketItem(pattern, index + 1);
            if (end.error) return end;
            if (item.rangeCharacter == null || end.rangeCharacter == null
                || item.rangeCharacter.codePointAt(0)
                    > end.rangeCharacter.codePointAt(0)) {
                return { error: INVALID_RANGE };
            }
            index = end.index;
            if (pattern[index] === '-' && pattern[index + 1] !== ']') {
                return { error: INVALID_RANGE };
            }
        }
    }
    return { error: bracketError(pattern, bodyStart) };
}

function decimalCount(text) {
    try {
        return BigInt(text || '0');
    } catch {
        return null;
    }
}

function intervalExpression(pattern, start) {
    const close = pattern.indexOf('}', start + 1);
    if (close < 0) return { error: 'Unmatched \\{' };
    const body = pattern.slice(start + 1, close);
    const match = /^(?:([0-9]+)(?:,([0-9]*))?|,([0-9]+))$/u.exec(body);
    if (!match) return { error: 'Invalid content of \\{\\}' };

    const lower = decimalCount(match[1] ?? '0');
    const upperText = match[3] ?? match[2];
    const upper = upperText === '' || upperText === undefined
        ? null : decimalCount(upperText);
    const maximum = 32767n; // limits.h RE_DUP_MAX, used by glibc regcomp().
    if (lower > maximum || (upper != null && upper > maximum)) {
        return { error: 'Regular expression too big' };
    }
    if (upper != null && lower > upper) {
        return { error: 'Invalid content of \\{\\}' };
    }
    return { index: close + 1 };
}

function validateExtendedRegexp(pattern) {
    let index = 0;
    let openGroups = 0;
    let repeatable = false;

    while (index < pattern.length) {
        const character = pattern[index];
        if (character === '\\') {
            if (index + 1 >= pattern.length) return 'Trailing backslash';
            index += 2;
            repeatable = true;
            continue;
        }
        if (character === '[') {
            const bracket = bracketExpression(pattern, index);
            if (bracket.error) return bracket.error;
            index = bracket.index;
            repeatable = true;
            continue;
        }
        if (character === '(') {
            ++openGroups;
            ++index;
            repeatable = false;
            continue;
        }
        if (character === ')' && openGroups > 0) {
            --openGroups;
            ++index;
            repeatable = true;
            continue;
        }
        if (character === '|') {
            ++index;
            repeatable = false;
            continue;
        }
        if (character === '^' || character === '$') {
            ++index;
            repeatable = false;
            continue;
        }
        if (character === '*' || character === '+' || character === '?') {
            if (!repeatable) return 'Invalid preceding regular expression';
            ++index;
            // glibc accepts adjacent duplication operators (`a+?`, `a**`).
            repeatable = true;
            continue;
        }
        if (character === '{') {
            if (!repeatable) return 'Invalid preceding regular expression';
            const interval = intervalExpression(pattern, index);
            if (interval.error) return interval.error;
            index = interval.index;
            repeatable = true;
            continue;
        }

        ++index;
        repeatable = true;
    }

    return openGroups ? 'Unmatched ( or \\(' : null;
}

export function regex_init() {
    return { error: null, pattern: null };
}

// The compiled representation is intentionally just the validated pattern
// until pickup.c's regex_match() consumer is ported. Returning C's boolean and
// storing the diagnostic preserves add_autopickup_exception()'s live branch.
export function regex_compile(pattern, regex) {
    if (!regex) return false;
    regex.error = validateExtendedRegexp(String(pattern));
    regex.pattern = regex.error ? null : String(pattern);
    return !regex.error;
}

export function regex_error_desc(regex) {
    if (!regex) return 'no regexp';
    if (!regex.error) return 'no explanation';
    return regex.error;
}
