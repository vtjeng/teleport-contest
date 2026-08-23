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
    if (close < 0) {
        const tail = pattern.slice(start + 1);
        // regcomp.c parse_dup_op() reports REG_BADBR when fetch_number()
        // reaches invalid comma-form content before the missing close.  A
        // syntactically viable prefix that merely ends first is REG_EBRACE.
        return { error: /(?:[^0-9,].*|,,+)$/.test(tail) && tail.endsWith(',')
            ? 'Invalid content of \\{\\}' : 'Unmatched \\{' };
    }
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

// ECMAScript regular expressions do not have the recorder libc's repetition,
// anchor, or capture semantics. All ASCII patterns therefore use this
// source-shaped ERE tree. Each node below owns one grammar operation;
// regex_match() owns finite sets of input positions and referenced values.
function parseAsciiExtendedRegexp(pattern) {
    let groupCount = 0;
    const referencedGroups = new Set();

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
                    const group = Number(escaped);
                    referencedGroups.add(group);
                    atom = { type: 'reference', group };
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

    const root = parsePart(0, false).node;

    let nextNodeId = 0;
    function annotate(node) {
        node.nodeId = nextNodeId++;
        let groups = new Set();
        let containsRepeat = node.type === 'repeat';
        if (node.type === 'group') groups.add(node.id);
        const children = node.type === 'sequence' || node.type === 'alternative'
            ? node.nodes : node.child ? [node.child] : [];
        for (const child of children) {
            annotate(child);
            groups = new Set([...groups, ...child.captureGroups]);
            containsRepeat ||= child.containsRepeat;
        }
        node.captureGroups = groups;
        node.containsRepeat = containsRepeat;
        if (node.type === 'literal') node.minimumWidth = node.value.length;
        else if (node.type === 'dot' || node.type === 'class')
            node.minimumWidth = 1;
        else if (node.type === 'group')
            node.minimumWidth = node.child.minimumWidth;
        else if (node.type === 'sequence') {
            node.minimumWidth = node.nodes.reduce(
                (total, child) => total + child.minimumWidth, 0,
            );
        } else if (node.type === 'alternative') {
            node.minimumWidth = Math.min(
                ...node.nodes.map((child) => child.minimumWidth),
            );
        } else if (node.type === 'repeat') {
            node.minimumWidth = node.minimum * node.child.minimumWidth;
        } else node.minimumWidth = 0;
    }
    annotate(root);
    return { root, groupCount, referencedGroups };
}

function captureStateKey(state) {
    // Capture arrays never mutate after entering a state. Position plus every
    // referenced capture value is therefore the complete future-equivalence
    // key: merging equal keys cannot change a later reference or assertion.
    return `${state.position}:${JSON.stringify(state.captures)}`;
}

function uniqueCaptureStates(states) {
    const unique = new Map();
    for (const state of states) unique.set(captureStateKey(state), state);
    return [...unique.values()];
}

function isAsciiWord(character) {
    return character !== undefined && /[A-Za-z0-9_]/u.test(character);
}

function anchorMatches(node, input, position, matchStart) {
    if (node.edge === 'end') {
        return position === input.length || (!node.absolute
            && input[position] === '\n');
    }
    return position === 0 || (!node.absolute && position > matchStart
        && input[position - 1] === '\n');
}

function uniquePositions(positions) {
    return [...new Set(positions)];
}

// Reference-free patterns use position sets, the Thompson-NFA state for the
// REG_NOSUB boolean consumed by NetHack. Memoizing node/position pairs bounds
// matching by the parsed tree and the 256 possible BUFSZ input positions; it
// does not inherit ECMAScript's exponential backtracking behavior.
function evaluateDirectNode(node, input, position, matchStart, memo) {
    const key = `${node.nodeId}:${position}`;
    const cached = memo.get(key);
    if (cached) return cached;

    let results;
    switch (node.type) {
    case 'literal':
        results = input.startsWith(node.value, position)
            ? [position + node.value.length] : [];
        break;
    case 'dot':
        results = position < input.length ? [position + 1] : [];
        break;
    case 'class':
        results = position < input.length && node.matcher.test(input[position])
            ? [position + 1] : [];
        break;
    case 'anchor':
        results = anchorMatches(node, input, position, matchStart)
            ? [position] : [];
        break;
    case 'word-boundary': {
        const boundary = isAsciiWord(input[position - 1])
            !== isAsciiWord(input[position]);
        results = boundary !== node.invert ? [position] : [];
        break;
    }
    case 'word-edge': {
        const before = isAsciiWord(input[position - 1]);
        const after = isAsciiWord(input[position]);
        const matches = node.edge === '<' ? !before && after : before && !after;
        results = matches ? [position] : [];
        break;
    }
    case 'group':
        results = evaluateDirectNode(
            node.child, input, position, matchStart, memo,
        );
        break;
    case 'sequence': {
        let positions = [position];
        for (const child of node.nodes) {
            positions = uniquePositions(positions.flatMap((current) => (
                evaluateDirectNode(child, input, current, matchStart, memo)
            )));
            if (!positions.length) break;
        }
        results = positions;
        break;
    }
    case 'alternative':
        results = uniquePositions(node.nodes.flatMap((child) => (
            evaluateDirectNode(child, input, position, matchStart, memo)
        )));
        break;
    case 'repeat': {
        let count = 0;
        let frontier = [position];
        const accepted = [];
        const seen = new Set();
        while (frontier.length && count <= node.maximum) {
            if (count >= node.minimum) accepted.push(...frontier);
            if (count === node.maximum) break;
            const next = uniquePositions(frontier.flatMap((current) => (
                evaluateDirectNode(node.child, input, current, matchStart, memo)
            )));
            ++count;
            if (count < node.minimum) {
                frontier = next;
                continue;
            }
            frontier = next.filter((candidate) => !seen.has(candidate));
            for (const candidate of frontier) seen.add(candidate);
        }
        results = uniquePositions(accepted);
        break;
    }
    case 'reference':
        throw new Error('reference reached the direct ERE evaluator');
    default:
        throw new Error(`invalid direct ERE node: ${node.type}`);
    }
    memo.set(key, results);
    return results;
}

function evaluateReferenceNode(node, input, state, evaluator) {
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
        const matches = anchorMatches(
            node, input, state.position, state.matchStart,
        );
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
        if (capture === undefined) return [];
        return input.startsWith(capture, state.position)
            ? [{ ...state, position: state.position + capture.length }]
            : [];
    }
    case 'group': {
        const start = state.position;
        return evaluateReferenceNode(
            node.child, input, state, evaluator,
        ).map((result) => {
            if (!evaluator.referencedGroups.has(node.id)) return result;
            const captures = [...result.captures];
            // Only the enclosing span changes. Descendant entries retain the
            // last participating value when this path used a sibling, which
            // is the recorder glibc repeated-subexpression rule.
            captures[node.id] = input.slice(start, result.position);
            return { ...result, captures };
        });
    }
    case 'sequence': {
        let states = [state];
        for (const child of node.nodes) {
            states = uniqueCaptureStates(states.flatMap(
                (current) => evaluateReferenceNode(
                    child, input, current, evaluator,
                ),
            ));
            if (!states.length) break;
        }
        return states;
    }
    case 'alternative':
        return uniqueCaptureStates(node.nodes.flatMap(
            (child) => evaluateReferenceNode(child, input, state, evaluator),
        ));
    case 'repeat': {
        let count = 0;
        let frontier = [state];
        const results = [];
        const firstNestedCapture = !Number.isFinite(node.maximum)
            && node.child.type === 'group'
            && evaluator.referencedGroups.has(node.child.id)
            && node.child.child.containsRepeat
            && node.child.minimumWidth > 0;
        // Before minimum, repeated states still matter: an empty atom can
        // satisfy `{32767}` without changing position or captures. At and
        // above minimum, the state key is the complete future input, so a
        // fixed point closes an unbounded repetition without a pattern limit.
        while (frontier.length && count <= node.maximum) {
            if (count >= node.minimum) results.push(...frontier);
            if (count === node.maximum || (firstNestedCapture && count === 1))
                break;
            let next = uniqueCaptureStates(frontier.flatMap(
                (current) => evaluateReferenceNode(
                    node.child, input, current, evaluator,
                ),
            ));
            ++count;
            // get_subexp() caches the first viable open/close path for a
            // quantified referenced group at one backreference node. When
            // that group's nonempty body is itself quantified, later
            // decompositions do not create independent capture candidates.
            if (firstNestedCapture && count === 1 && next.length > 1)
                next = [next[0]];
            if (Number.isFinite(node.maximum)
                && count > node.minimum && count < node.maximum) {
                next = next.map((candidate) => {
                    const captures = [...candidate.captures];
                    for (const group of node.child.captureGroups) {
                        if (evaluator.referencedGroups.has(group))
                            captures[group] = undefined;
                    }
                    return { ...candidate, captures };
                });
            }
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
            matchStart: start,
            // Sparse ids are intentional: unreferenced groups never enter the
            // state key, even when a 255-byte pattern declares many of them.
            captures: [],
        };
        if (evaluateReferenceNode(
            evaluator.root, input, state, evaluator,
        ).length)
            return true;
    }
    return false;
}

function matchDirectExtendedRegexp(input, evaluator) {
    for (let start = 0; start <= input.length; ++start) {
        if (evaluateDirectNode(
            evaluator.root, input, start, start, new Map(),
        ).length) return true;
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
        regex.evaluator = parseAsciiExtendedRegexp(text);
        if (!regex.evaluator.referencedGroups.size) {
            regex.kind = 'direct';
        } else {
            regex.kind = 'reference-aware';
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
    if (regex.kind === 'direct') {
        return matchDirectExtendedRegexp(text, regex.evaluator);
    }
    if (regex.kind !== 'reference-aware')
        throw new Error(`invalid compiled regex state: ${String(regex.kind)}`);

    return matchReferenceExtendedRegexp(text, regex.evaluator);
}
