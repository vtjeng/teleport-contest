// Exhaustive ownership coverage for objnam.c the()/The() call sites which
// format a name from a supplied game state. Runtime tests in objnam.test.mjs,
// eat-occupation.test.mjs, and sit-command.test.mjs prove the behavior with
// foreign monster, fruit, and artifact catalogs. This test covers the other
// reachable callers, including fixed-text and private-helper paths where a
// second constructed execution would not independently exercise the article
// decision.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const OWNERSHIP_EDGES = Object.freeze([
    ['js/objnam.js', 'Tobjnam', 'The', 1],
    ['js/eat.js', 'food_xname', 'the', 1],
    ['js/sit.js', 'dosit', 'the', 2],
    ['js/dothrow.js', 'throwit', 'the', 1],
    ['js/do_wear.js', 'on_msg', 'the', 1],
    ['js/do_wear.js', 'select_off', 'the', 1],
    ['js/hack.js', 'dopush', 'the', 1],
    ['js/hack.js', 'domove_fight_empty', 'the', 1],
    ['js/zap.js', 'dozap', 'The', 1],
    ['js/zap.js', 'makewish', 'The', 1],
    ['js/zap.js', 'dobuzz', 'The', 2],
    ['js/zap_destroy_items.js', 'maybe_destroy_item', 'The', 1],
]);

function isIdentifierStart(character) {
    return /[A-Za-z_$]/u.test(character ?? '');
}

function isIdentifierPart(character) {
    return /[A-Za-z0-9_$]/u.test(character ?? '');
}

// This lexer skips comments and quoted text but descends into ${...}
// expressions, where most message-formatting calls live. It intentionally
// returns only identifiers and punctuation: the contract needs call shape,
// not a second implementation of the naming behavior.
function tokensFrom(source) {
    const tokens = [];
    let index = 0;

    function skipQuoted(quote) {
        index++;
        while (index < source.length) {
            if (source[index] === '\\') {
                index += 2;
            } else if (source[index++] === quote) {
                return;
            }
        }
        throw new Error(`unterminated ${quote} string`);
    }

    function scanTemplate() {
        index++; // opening backtick
        while (index < source.length) {
            if (source[index] === '\\') {
                index += 2;
            } else if (source[index] === '`') {
                index++;
                return;
            } else if (source[index] === '$' && source[index + 1] === '{') {
                index += 2;
                scanCode(true);
            } else {
                index++;
            }
        }
        throw new Error('unterminated template literal');
    }

    function scanCode(stopAtTemplateBrace) {
        let braceDepth = 0;
        while (index < source.length) {
            const character = source[index];
            if (/\s/u.test(character)) {
                index++;
                continue;
            }
            if (character === '/' && source[index + 1] === '/') {
                index += 2;
                while (index < source.length && source[index] !== '\n')
                    index++;
                continue;
            }
            if (character === '/' && source[index + 1] === '*') {
                const end = source.indexOf('*/', index + 2);
                if (end < 0) throw new Error('unterminated block comment');
                index = end + 2;
                continue;
            }
            if (character === "'" || character === '"') {
                skipQuoted(character);
                continue;
            }
            if (character === '`') {
                scanTemplate();
                continue;
            }
            if (isIdentifierStart(character)) {
                const start = index++;
                while (isIdentifierPart(source[index])) index++;
                tokens.push({ value: source.slice(start, index), start });
                continue;
            }
            if (character === '{') {
                braceDepth++;
            } else if (character === '}') {
                if (stopAtTemplateBrace && braceDepth === 0) {
                    index++;
                    return;
                }
                braceDepth--;
            }
            tokens.push({ value: character, start: index++ });
        }
        if (stopAtTemplateBrace)
            throw new Error('unterminated template expression');
    }

    scanCode(false);
    return tokens;
}

function matchingToken(tokens, openingIndex, opening, closing) {
    let depth = 0;
    for (let index = openingIndex; index < tokens.length; index++) {
        if (tokens[index].value === opening) depth++;
        if (tokens[index].value === closing && --depth === 0) return index;
    }
    throw new Error(`unmatched ${opening} token`);
}

function functionRegions(tokens) {
    const regions = [];
    for (let index = 0; index < tokens.length; index++) {
        if (tokens[index].value !== 'function') continue;
        let nameIndex = index + 1;
        if (tokens[nameIndex]?.value === '*') nameIndex++;
        const name = tokens[nameIndex]?.value;
        if (!isIdentifierStart(name?.[0])) continue;
        const paramsIndex = nameIndex + 1;
        if (tokens[paramsIndex]?.value !== '(') continue;
        const paramsEnd = matchingToken(tokens, paramsIndex, '(', ')');
        const bodyIndex = paramsEnd + 1;
        if (tokens[bodyIndex]?.value !== '{') continue;
        const bodyEnd = matchingToken(tokens, bodyIndex, '{', '}');
        regions.push({
            bodyEnd,
            bodyIndex,
            name,
        });
    }
    return regions;
}

function callArguments(tokens, openingIndex) {
    const args = [];
    let current = [];
    let parentheses = 0;
    let brackets = 0;
    let braces = 0;
    for (let index = openingIndex + 1; index < tokens.length; index++) {
        const value = tokens[index].value;
        if (value === ')' && parentheses === 0
            && brackets === 0 && braces === 0) {
            if (current.length) args.push(current);
            return args;
        }
        if (value === ',' && parentheses === 0
            && brackets === 0 && braces === 0) {
            args.push(current);
            current = [];
            continue;
        }
        current.push(tokens[index]);
        if (value === '(') parentheses++;
        else if (value === ')') parentheses--;
        else if (value === '[') brackets++;
        else if (value === ']') brackets--;
        else if (value === '{') braces++;
        else if (value === '}') braces--;
    }
    throw new Error('unterminated call');
}

function ownerAt(callIndex, regions) {
    const containing = regions.filter(
        ({ bodyIndex, bodyEnd }) => bodyIndex < callIndex && callIndex < bodyEnd,
    );
    containing.sort(
        (left, right) => (left.bodyEnd - left.bodyIndex)
            - (right.bodyEnd - right.bodyIndex),
    );
    return containing[0]?.name ?? null;
}

test('every corrected the()/The() caller forwards its supplied state', () => {
    const byFile = Map.groupBy(OWNERSHIP_EDGES, ([file]) => file);
    for (const [file, edges] of byFile) {
        const tokens = tokensFrom(readFileSync(file, 'utf8'));
        const regions = functionRegions(tokens);
        for (const [, expectedOwner, callee, expectedCount] of edges) {
            const calls = [];
            for (let index = 0; index < tokens.length - 1; index++) {
                if (tokens[index].value !== callee
                    || tokens[index + 1].value !== '('
                    || ownerAt(index, regions) !== expectedOwner) {
                    continue;
                }
                calls.push(callArguments(tokens, index + 1));
            }
            const label = `${file} ${expectedOwner}() ${callee}()`;
            assert.equal(calls.length, expectedCount, `${label} call count`);
            for (const args of calls) {
                assert.deepEqual(
                    args.at(-1)?.map(({ value }) => value),
                    ['state'],
                    `${label} must pass state as its final argument`,
                );
            }
        }
    }
});
