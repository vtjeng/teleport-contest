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
        evaluator: null,
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

// ECMAScript backreferences do not have the recorder libc's capture state:
// they match empty for a nonparticipating group and clear a subgroup when a
// later repetition does not enter it. Reference-bearing patterns therefore
// use this source-shaped ERE tree. Each node below owns one grammar operation;
// regex_match() owns the finite set of input positions and capture ranges.
function parseReferenceExtendedRegexp(pattern) {
    let groupCount = 0;

    function parsePart(start, stopAtClose) {
        let index = start;
        const alternatives = [];
        let sequence = [];
        while (index < pattern.length) {
            const character = pattern[index];
            if (stopAtClose && character === ')') {
                alternatives.push({ type: 'sequence', nodes: sequence });
                return {
                    index: index + 1,
                    node: alternatives.length === 1
                        ? alternatives[0]
                        : { type: 'alternative', nodes: alternatives },
                };
            }
            if (character === '|') {
                alternatives.push({ type: 'sequence', nodes: sequence });
                sequence = [];
                ++index;
                continue;
            }

            let atom;
            if (character === '\\') {
                const escaped = pattern[index + 1];
                if (escaped >= '1' && escaped <= '9') {
                    atom = { type: 'reference', group: Number(escaped) };
                } else if (escaped === 'b' || escaped === 'B') {
                    atom = { type: 'word-boundary', invert: escaped === 'B' };
                } else if (escaped === '<' || escaped === '>') {
                    atom = { type: 'word-edge', edge: escaped };
                } else if (escaped === '`' || escaped === "'") {
                    atom = {
                        type: 'anchor',
                        edge: escaped === '`' ? 'start' : 'end',
                        absolute: true,
                    };
                } else if (escaped === 'w' || escaped === 'W'
                           || escaped === 's' || escaped === 'S') {
                    const source = escaped === 'w' ? '[A-Za-z0-9_]'
                        : escaped === 'W' ? '[^A-Za-z0-9_]'
                            : escaped === 's' ? '[\\t-\\r ]'
                                : '[^\\t-\\r ]';
                    atom = { type: 'class', matcher: new RegExp(source, 's') };
                } else {
                    atom = { type: 'literal', value: escaped };
                }
                index += 2;
            } else if (character === '[') {
                const bracket = translateBracketExpression(pattern, index);
                atom = {
                    type: 'class',
                    matcher: new RegExp(`^(?:${bracket.source})$`, 's'),
                };
                index = bracket.index;
            } else if (character === '(') {
                const id = ++groupCount;
                const group = parsePart(index + 1, true);
                atom = { type: 'group', id, child: group.node };
                index = group.index;
            } else if (character === ')') {
                atom = { type: 'literal', value: ')' };
                ++index;
            } else if (character === '.') {
                atom = { type: 'dot' };
                ++index;
            } else if (character === '^') {
                atom = {
                    type: 'anchor',
                    edge: 'start',
                    absolute: sequence.length === 0,
                };
                ++index;
            } else if (character === '$') {
                atom = {
                    type: 'anchor',
                    edge: 'end',
                    absolute: index + 1 >= pattern.length
                        || pattern[index + 1] === '|'
                        || (stopAtClose && pattern[index + 1] === ')'),
                };
                ++index;
            } else {
                atom = { type: 'literal', value: character };
                ++index;
            }

            while (index < pattern.length) {
                let minimum;
                let maximum;
                if (pattern[index] === '*') {
                    minimum = 0;
                    maximum = Infinity;
                    ++index;
                } else if (pattern[index] === '+') {
                    minimum = 1;
                    maximum = Infinity;
                    ++index;
                } else if (pattern[index] === '?') {
                    minimum = 0;
                    maximum = 1;
                    ++index;
                } else if (pattern[index] === '{') {
                    const close = pattern.indexOf('}', index + 1);
                    const body = pattern.slice(index + 1, close);
                    const [lower, upper] = body.split(',');
                    minimum = lower === '' ? 0 : Number(lower);
                    maximum = !body.includes(',') ? minimum
                        : upper === '' ? Infinity : Number(upper);
                    index = close + 1;
                } else {
                    break;
                }
                atom = { type: 'repeat', child: atom, minimum, maximum };
            }
            sequence.push(atom);
        }
        alternatives.push({ type: 'sequence', nodes: sequence });
        return {
            index,
            node: alternatives.length === 1
                ? alternatives[0]
                : { type: 'alternative', nodes: alternatives },
        };
    }

    return { root: parsePart(0, false).node, groupCount };
}

function captureStateKey(state) {
    return `${state.position}:` + Array.from(state.captures, (capture) => (
        capture ? `${capture.start}-${capture.end}` : '_'
    )).join(',');
}

function uniqueCaptureStates(states) {
    const unique = new Map();
    for (const state of states) unique.set(captureStateKey(state), state);
    return [...unique.values()];
}

function isAsciiWord(character) {
    return character !== undefined && /[A-Za-z0-9_]/u.test(character);
}

function evaluateReferenceNode(node, input, state) {
    switch (node.type) {
    case 'literal':
        return input.startsWith(node.value, state.position)
            ? [{ ...state, position: state.position + node.value.length }]
            : [];
    case 'dot':
        return state.position < input.length
            ? [{ ...state, position: state.position + 1 }] : [];
    case 'class':
        return state.position < input.length
            && node.matcher.test(input[state.position])
            ? [{ ...state, position: state.position + 1 }] : [];
    case 'anchor': {
        const matches = node.edge === 'start'
            ? state.position === 0 || (!node.absolute
                && input[state.position - 1] === '\n')
            : state.position === input.length || (!node.absolute
                && input[state.position] === '\n');
        return matches ? [state] : [];
    }
    case 'word-boundary': {
        const boundary = isAsciiWord(input[state.position - 1])
            !== isAsciiWord(input[state.position]);
        return boundary !== node.invert ? [state] : [];
    }
    case 'word-edge': {
        const before = isAsciiWord(input[state.position - 1]);
        const after = isAsciiWord(input[state.position]);
        const matches = node.edge === '<' ? !before && after : before && !after;
        return matches ? [state] : [];
    }
    case 'reference': {
        const capture = state.captures[node.group];
        if (!capture) return [];
        const value = input.slice(capture.start, capture.end);
        return input.startsWith(value, state.position)
            ? [{ ...state, position: state.position + value.length }]
            : [];
    }
    case 'group': {
        const start = state.position;
        return evaluateReferenceNode(node.child, input, state).map((result) => {
            const captures = [...result.captures];
            captures[node.id] = { start, end: result.position };
            return { ...result, captures };
        });
    }
    case 'sequence': {
        let states = [state];
        for (const child of node.nodes) {
            states = uniqueCaptureStates(states.flatMap(
                (current) => evaluateReferenceNode(child, input, current),
            ));
            if (!states.length) break;
        }
        return states;
    }
    case 'alternative':
        return uniqueCaptureStates(node.nodes.flatMap(
            (child) => evaluateReferenceNode(child, input, state),
        ));
    case 'repeat': {
        let count = 0;
        let frontier = [state];
        const results = [];
        // Before minimum, repeated states still matter: an empty atom can
        // satisfy `{32767}` without changing position or captures. At and
        // above minimum, the state key is the complete future input, so a
        // fixed point closes an unbounded repetition without a pattern limit.
        while (frontier.length && count <= node.maximum) {
            if (count >= node.minimum) results.push(...frontier);
            if (count === node.maximum) break;
            const next = uniqueCaptureStates(frontier.flatMap(
                (current) => evaluateReferenceNode(node.child, input, current),
            ));
            ++count;
            if (count < node.minimum) {
                frontier = next;
                continue;
            }
            const priorKeys = new Set(results.map(captureStateKey));
            frontier = next.filter((candidate) => (
                !priorKeys.has(captureStateKey(candidate))
            ));
        }
        return uniqueCaptureStates(results);
    }
    default:
        throw new Error(`invalid reference-aware ERE node: ${node.type}`);
    }
}

function matchReferenceExtendedRegexp(input, evaluator) {
    // regexec() is unanchored unless the tree's own anchors reject a start.
    // Check starts in leftmost order; only existence is observable under
    // REG_NOSUB, so no later submatch-selection detail leaves this function.
    for (let start = 0; start <= input.length; ++start) {
        const state = {
            position: start,
            captures: Array(evaluator.groupCount + 1),
        };
        if (evaluateReferenceNode(evaluator.root, input, state).length)
            return true;
    }
    return false;
}

export function regex_compile(pattern, regex) {
    if (!regex) return false;
    const text = String(pattern);
    regex.error = validateExtendedRegexp(text);
    regex.pattern = regex.error ? null : text;
    regex.matcher = null;
    regex.evaluator = null;
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
            regex.evaluator = parseReferenceExtendedRegexp(text);
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

    return matchReferenceExtendedRegexp(text, regex.evaluator);
}
