// posixregex.js -- POSIX extended-regexp validation and ASCII matching.
// C ref: sys/share/posixregex.c regex_init(), regex_compile(), and
// regex_match(). The recorder links this implementation and calls libc
// regcomp() with REG_EXTENDED | REG_NOSUB, then regexec() without REG_NEWLINE.
//
// Bracket ranges compare ordinary characters by code point. Matching is exact
// for the ASCII part of the recorder's C.UTF-8 locale. Non-ASCII matching is a
// named fail-closed boundary because libc character classes and collation are
// locale behavior that ECMAScript RegExp does not supply.

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

const ASCII_POSIX_CHARACTER_CLASSES = Object.freeze({
    alnum: 'A-Za-z0-9',
    alpha: 'A-Za-z',
    blank: ' \\t',
    cntrl: '\\x00-\\x1F\\x7F',
    digit: '0-9',
    graph: '\\x21-\\x7E',
    lower: 'a-z',
    print: '\\x20-\\x7E',
    punct: '!-/:-@\\[-`{-~',
    space: '\\t-\\r ',
    upper: 'A-Z',
    xdigit: 'A-Fa-f0-9',
});

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
    // POSIX bracket expressions do not give backslash an escaping role. glibc
    // follows that rule: `[\]]` is a backslash class followed by literal `]`,
    // and `[a\-c]` contains the range from backslash through `c`.
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
    return { error: null, matcher: null, pattern: null };
}

function escapeRegexpLiteral(character) {
    return /[\\^$.*+?()[\]{}|]/u.test(character)
        ? `\\${character}` : character;
}

function escapeBracketCharacter(character) {
    if (character === '\\' || character === ']' || character === '['
        || character === '^' || character === '-') {
        return `\\${character}`;
    }
    const code = character.codePointAt(0);
    if (code < 0x20 || code === 0x7F) {
        return `\\x${code.toString(16).padStart(2, '0')}`;
    }
    return character;
}

function escapeBracketRangeEndpoint(character) {
    const code = character.codePointAt(0);
    if (code < 0x20 || code === 0x7F
        || ['\\', ']', '[', '^', '-'].includes(character)) {
        return `\\x${code.toString(16).padStart(2, '0')}`;
    }
    return character;
}

function translatedBracketToken(pattern, index) {
    const special = bracketSpecial(pattern, index);
    if (special) {
        const marker = pattern[index + 1];
        const value = pattern.slice(index + 2, special.index - 2);
        if (marker === ':') {
            return {
                index: special.index,
                source: ASCII_POSIX_CHARACTER_CLASSES[value],
                rangeCharacter: null,
            };
        }
        return {
            index: special.index,
            source: escapeBracketCharacter(value),
            rangeCharacter: value,
        };
    }
    const character = pattern[index];
    return {
        index: index + 1,
        source: escapeBracketCharacter(character),
        rangeCharacter: character,
    };
}

function translateBracketExpression(pattern, start) {
    let index = start + 1;
    let source = '[';
    if (pattern[index] === '^') {
        source += '^';
        ++index;
    }
    let first = true;
    if (pattern[index] === ']') {
        source += '\\]';
        ++index;
        first = false;
    }

    while (index < pattern.length) {
        if (pattern[index] === ']' && !first) {
            return { index: index + 1, source: `${source}]` };
        }
        const item = translatedBracketToken(pattern, index);
        index = item.index;
        first = false;
        if (index < pattern.length && pattern[index] === '-'
            && pattern[index + 1] !== ']' && index + 1 < pattern.length) {
            const end = translatedBracketToken(pattern, index + 1);
            source += `${escapeBracketRangeEndpoint(item.rangeCharacter)}`
                + `-${escapeBracketRangeEndpoint(end.rangeCharacter)}`;
            index = end.index;
        } else {
            source += item.source;
        }
    }
    throw new Error('validated POSIX bracket expression did not close');
}

function translateInterval(pattern, start) {
    const close = pattern.indexOf('}', start + 1);
    const body = pattern.slice(start + 1, close);
    if (body.startsWith(',')) return `{0${body}}`;
    return `{${body}}`;
}

// Translate only after validateExtendedRegexp() has accepted the pattern.
// Non-capturing wrappers make source-accepted adjacent duplication operators
// explicit: `a+?` is `(?:a+)?`, rather than JavaScript's lazy `a+?`.
function translateAsciiExtendedRegexp(pattern) {
    function translatePart(start, stopAtClose) {
        let index = start;
        let source = '';
        while (index < pattern.length) {
            const character = pattern[index];
            if (stopAtClose && character === ')') {
                return { index: index + 1, source };
            }
            if (character === '|') {
                source += '|';
                ++index;
                continue;
            }
            if (character === '^') {
                source += '^';
                ++index;
                continue;
            }
            if (character === '$') {
                // ECMAScript `$` also matches before a final newline. libc
                // regexec() without REG_NEWLINE matches only absolute end.
                source += '(?![\\s\\S])';
                ++index;
                continue;
            }

            let atom;
            if (character === '\\') {
                atom = escapeRegexpLiteral(pattern[index + 1]);
                index += 2;
            } else if (character === '[') {
                const bracket = translateBracketExpression(pattern, index);
                atom = bracket.source;
                index = bracket.index;
            } else if (character === '(') {
                const group = translatePart(index + 1, true);
                atom = `(?:${group.source})`;
                index = group.index;
            } else if (character === ')') {
                // glibc treats an unmatched close parenthesis as ordinary.
                atom = '\\)';
                ++index;
            } else if (character === '.') {
                atom = '.';
                ++index;
            } else {
                atom = escapeRegexpLiteral(character);
                ++index;
            }

            let duplicated = false;
            while (index < pattern.length) {
                let duplication;
                if (['*', '+', '?'].includes(pattern[index])) {
                    duplication = pattern[index++];
                } else if (pattern[index] === '{') {
                    duplication = translateInterval(pattern, index);
                    index = pattern.indexOf('}', index + 1) + 1;
                } else {
                    break;
                }
                atom = duplicated
                    ? `(?:${atom})${duplication}`
                    : `${atom}${duplication}`;
                duplicated = true;
            }
            source += atom;
        }
        return { index, source };
    }

    return translatePart(0, false).source;
}

export function regex_compile(pattern, regex) {
    if (!regex) return false;
    const text = String(pattern);
    regex.error = validateExtendedRegexp(text);
    regex.pattern = regex.error ? null : text;
    regex.matcher = null;
    if (!regex.error && !/[^\x00-\x7F]/u.test(text)) {
        regex.matcher = new RegExp(translateAsciiExtendedRegexp(text), 's');
    }
    return !regex.error;
}

export function regex_error_desc(regex) {
    if (!regex) return 'no regexp';
    if (!regex.error) return 'no explanation';
    return regex.error;
}

export class UnsupportedPosixLocaleMatchError extends Error {
    constructor() {
        super('posixregex.c regex_match() with non-ASCII C.UTF-8 input');
        this.name = 'UnsupportedPosixLocaleMatchError';
    }
}

export function regex_match(value, regex) {
    if (!regex || regex.pattern == null) return false;
    const text = String(value);
    if (/[^\x00-\x7F]/u.test(regex.pattern)
        || /[^\x00-\x7F]/u.test(text)) {
        throw new UnsupportedPosixLocaleMatchError();
    }
    return regex.matcher.test(text);
}
