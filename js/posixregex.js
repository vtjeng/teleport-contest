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
const INVALID_BACK_REFERENCE = 'Invalid back reference';

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
    const match = /^(?:([0-9]+)(?:,([0-9]*))?|,([0-9]*))$/u.exec(body);
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
    let repeatable = false;
    let groupCount = 0;
    let pathAvailableGroups = new Set();
    const frames = [{
        branchStartGroups: new Set(),
        subtreeGroups: [],
    }];

    while (index < pattern.length) {
        const character = pattern[index];
        if (character === '\\') {
            if (index + 1 >= pattern.length) return 'Trailing backslash';
            const escaped = pattern[index + 1];
            if (escaped >= '1' && escaped <= '9') {
                if (!pathAvailableGroups.has(Number(escaped))) {
                    return INVALID_BACK_REFERENCE;
                }
                repeatable = true;
            } else if (['b', 'B', '<', '>', '`', "'"].includes(escaped)) {
                repeatable = false;
            } else {
                repeatable = true;
            }
            index += 2;
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
            const id = ++groupCount;
            frames.push({
                branchStartGroups: new Set(pathAvailableGroups),
                subtreeGroups: [id],
            });
            ++index;
            repeatable = false;
            continue;
        }
        if (character === ')' && frames.length > 1) {
            const frame = frames.pop();
            frames.at(-1).subtreeGroups.push(...frame.subtreeGroups);
            for (const id of frame.subtreeGroups)
                pathAvailableGroups.add(id);
            ++index;
            repeatable = true;
            continue;
        }
        if (character === '|') {
            // A capture from one sibling is unavailable on every other
            // sibling path. glibc therefore rejects `(a)|\1`, even though
            // the first branch owns group 1.
            pathAvailableGroups = new Set(
                frames.at(-1).branchStartGroups,
            );
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

    return frames.length > 1 ? 'Unmatched ( or \\(' : null;
}

export function regex_init() {
    return {
        kind: 'uncompiled',
        error: null,
        matcher: null,
        alternatives: null,
        pattern: null,
    };
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

function splitTopLevelAlternatives(source) {
    const alternatives = [];
    let start = 0;
    let depth = 0;
    let inBracket = false;
    for (let index = 0; index < source.length; ++index) {
        const character = source[index];
        if (character === '\\') {
            ++index;
        } else if (inBracket) {
            if (character === ']') inBracket = false;
        } else if (character === '[') {
            inBracket = true;
        } else if (character === '(') {
            ++depth;
        } else if (character === ')') {
            --depth;
        } else if (character === '|' && depth === 0) {
            alternatives.push(source.slice(start, index));
            start = index + 1;
        }
    }
    alternatives.push(source.slice(start));
    return alternatives;
}

// Translate only after validateExtendedRegexp() has accepted the pattern.
// Non-capturing wrappers make source-accepted adjacent duplication operators
// explicit: `a+?` is `(?:a+)?`, rather than JavaScript's lazy `a+?`.
function translateAsciiExtendedRegexp(pattern, references) {
    let groupCount = 0;

    function translatePart(start, stopAtClose) {
        let index = start;
        let source = '';
        let branchStart = true;
        while (index < pattern.length) {
            const character = pattern[index];
            if (stopAtClose && character === ')') {
                return { index: index + 1, source };
            }
            if (character === '|') {
                source += '|';
                ++index;
                branchStart = true;
                continue;
            }
            if (character === '^') {
                // glibc makes a branch-leading caret absolute. Elsewhere it
                // also admits the position after a newline, even without
                // REG_NEWLINE; absolute beginning remains valid.
                source += branchStart ? '^' : '(?:^|(?<=\n))';
                ++index;
                branchStart = false;
                continue;
            }
            if (character === '$') {
                const branchEnd = index + 1 >= pattern.length
                    || pattern[index + 1] === '|'
                    || (stopAtClose && pattern[index + 1] === ')');
                // A branch-final dollar is absolute. An internal dollar also
                // admits the position before a newline.
                source += branchEnd
                    ? '(?![\\s\\S])'
                    : '(?:(?![\\s\\S])|(?=\n))';
                ++index;
                branchStart = false;
                continue;
            }

            let atom;
            if (character === '\\') {
                const escaped = pattern[index + 1];
                if (escaped >= '1' && escaped <= '9') {
                    const reference = {
                        group: `posixGroup${escaped}`,
                        marker: `posixReference${references.length + 1}`,
                    };
                    references.push(reference);
                    // The wrapper keeps a following source digit separate:
                    // glibc reads `\\10` as backreference 1 plus literal 0,
                    // while ECMAScript can read it as reference 10 or octal.
                    // Its marker also records whether this reference's path
                    // participated, so references in other alternatives do
                    // not require their groups in the chosen match.
                    atom = `(?<${reference.marker}>`
                        + `\\k<${reference.group}>)`;
                } else if (escaped === 'b' || escaped === 'B') {
                    atom = `\\${escaped}`;
                } else if (escaped === '<') {
                    atom = '(?<![A-Za-z0-9_])(?=[A-Za-z0-9_])';
                } else if (escaped === '>') {
                    atom = '(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])';
                } else if (escaped === '`') {
                    atom = '^';
                } else if (escaped === "'") {
                    atom = '(?![\\s\\S])';
                } else if (escaped === 'w') {
                    atom = '[A-Za-z0-9_]';
                } else if (escaped === 'W') {
                    atom = '[^A-Za-z0-9_]';
                } else if (escaped === 's') {
                    atom = '[\\t-\\r ]';
                } else if (escaped === 'S') {
                    atom = '[^\\t-\\r ]';
                } else {
                    atom = escapeRegexpLiteral(escaped);
                }
                index += 2;
            } else if (character === '[') {
                const bracket = translateBracketExpression(pattern, index);
                atom = bracket.source;
                index = bracket.index;
            } else if (character === '(') {
                const groupName = `posixGroup${++groupCount}`;
                const group = translatePart(index + 1, true);
                atom = `(?<${groupName}>${group.source})`;
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
            branchStart = false;
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
    regex.alternatives = null;
    if (regex.error) {
        regex.kind = 'rejected';
    } else if (/[^\x00-\x7F]/u.test(text)) {
        regex.kind = 'locale-boundary';
    } else {
        const references = [];
        const source = translateAsciiExtendedRegexp(text, references);
        if (!references.length) {
            regex.kind = 'direct';
            regex.matcher = new RegExp(source, 's');
        } else {
            regex.kind = 'reference-aware';
            regex.alternatives = splitTopLevelAlternatives(source).map(
                (alternative) => ({
                    source: alternative,
                    references: references.filter(({ marker }) => (
                        alternative.includes(`?<${marker}>`)
                    )),
                }),
            );
        }
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
    if (!regex || regex.kind === 'uncompiled' || regex.kind === 'rejected')
        return false;
    const text = String(value);
    if (regex.kind === 'locale-boundary' || /[^\x00-\x7F]/u.test(text)) {
        throw new UnsupportedPosixLocaleMatchError();
    }
    if (regex.kind === 'direct') return regex.matcher.test(text);
    if (regex.kind !== 'reference-aware')
        throw new Error(`invalid compiled regex state: ${String(regex.kind)}`);

    // ECMAScript accepts a backreference whose group did not participate as
    // empty. glibc rejects that candidate. Scan again one byte later for an
    // overlap, and separately disable each bad reference marker so the JS
    // engine can backtrack into a valid nested alternative at the same start.
    for (const { source, references } of regex.alternatives) {
        const queue = [new Set()];
        const queued = new Set(['']);
        while (queue.length) {
            const blocked = queue.shift();
            let candidateSource = source;
            for (const { group, marker } of references) {
                if (!blocked.has(marker)) continue;
                candidateSource = candidateSource.replace(
                    `(?<${marker}>\\k<${group}>)`,
                    `(?<${marker}>(?!))`,
                );
            }
            const matcher = new RegExp(candidateSource, 'dgs');
            for (;;) {
                const match = matcher.exec(text);
                if (!match) break;
                const invalid = references.filter(({ group, marker }) => (
                    match.indices.groups[marker] !== undefined
                    && match.indices.groups[group] === undefined
                ));
                if (!invalid.length) return true;
                for (const { marker } of invalid) {
                    const next = new Set(blocked);
                    next.add(marker);
                    const key = [...next].sort().join(',');
                    if (!queued.has(key)) {
                        queued.add(key);
                        queue.push(next);
                    }
                }
                matcher.lastIndex = match.index + 1;
            }
        }
    }
    return false;
}
