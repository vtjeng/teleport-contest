// js/trap.js trapname() draws from the display RNG of the `state` it is
// given (trap.c trapname() calls rn2_on_display_rng() while the hero
// hallucinates). A monster-turn planning clone must advance its own copy of
// that stream, so trapname() has no `state = game` default and every caller
// passes the state it holds. A caller that left `state` out once spent the
// live game's display RNG from a planned knockback's hurtle_step(), which
// shifted every later hallucinated name. This test fails when a call leaves
// `state` out again.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BEAR_TRAP } from '../js/const.js';
import { trapname } from '../js/trap.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Count the top-level arguments of the call whose opening parenthesis is at
// `open`. Strings and template literals are skipped whole; a template's
// `${...}` holes cannot hold a comma at this call's level.
function argumentCount(source, open) {
    let depth = 0;
    let count = 0;
    let sawToken = false;
    for (let i = open; i < source.length; i++) {
        const ch = source[i];
        if (ch === '\'' || ch === '"' || ch === '`') {
            i = skipString(source, i);
            sawToken = true;
            continue;
        }
        if (ch === '(' || ch === '[' || ch === '{') {
            depth++;
            if (depth > 1) sawToken = true;
            continue;
        }
        if (ch === ')' || ch === ']' || ch === '}') {
            depth--;
            if (depth === 0) return count + (sawToken ? 1 : 0);
            continue;
        }
        if (depth === 1 && ch === ',') {
            count++;
            sawToken = false;
            continue;
        }
        if (!/\s/u.test(ch)) sawToken = true;
    }
    throw new Error(`unterminated call at offset ${open}`);
}

function skipString(source, start) {
    const quote = source[start];
    for (let i = start + 1; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
            let depth = 0;
            for (i += 1; i < source.length; i++) {
                if (source[i] === '\'' || source[i] === '"' || source[i] === '`') {
                    i = skipString(source, i);
                } else if (source[i] === '{') depth++;
                else if (source[i] === '}' && --depth === 0) break;
            }
            continue;
        }
        if (source[i] === quote) return i;
    }
    throw new Error(`unterminated string at offset ${start}`);
}

// Calls of trapname() with fewer than three arguments, as file:line.
export function callsWithoutState(source, file = '<source>') {
    const findings = [];
    for (const match of source.matchAll(/(?<![\w.$])trapname\(/gu)) {
        const before = source.slice(Math.max(0, match.index - 9), match.index);
        if (/function\s*$/u.test(before)) continue;
        const lineStart = source.lastIndexOf('\n', match.index) + 1;
        if (/^\s*(?:\/\/|\*)/u.test(source.slice(lineStart, match.index))) continue;
        const open = match.index + match[0].length - 1;
        if (argumentCount(source, open) < 3) {
            const line = source.slice(0, match.index).split('\n').length;
            findings.push(`${file}:${line}`);
        }
    }
    return findings;
}

test('every trapname() call in js/ passes its state', () => {
    const findings = [];
    for (const name of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort())
        findings.push(...callsWithoutState(readFileSync(join(JS_DIR, name), 'utf8'), name));
    assert.deepEqual(findings, []);
});

test('the scan finds calls that leave state out', () => {
    // Each numbered line holds one call; lines 1, 2 and 4 leave state out.
    assert.deepEqual(callsWithoutState([
        'const a = trapname(trap.ttyp);', // 1: type only
        "msg(`You pass over ${an(trapname(t.ttyp, false))}.`);", // 2: inside a template
        'const b = trapname(t.ttyp, false, state);', // 3: passes state
        'const c = trapname(', // 4: multi-line call
        '    u.utraptype === TT_WEB ? WEB : f(PIT, BEAR_TRAP),',
        ');',
        'const d = trapname(ttyp, true, state, { rn2: random.rn2 });', // 7
        'export function trapname(ttyp, override, state, random) {}', // 8: the definition
        '// trapname(x) in a comment', // 9
    ].join('\n')), ['<source>:1', '<source>:2', '<source>:4']);
});

test('trapname() needs a state to read', () => {
    // BEAR_TRAP is an arbitrary real trap type; without a state the
    // hallucination check has nothing to read, so the call must throw rather
    // than fall back to the live game.
    assert.throws(() => trapname(BEAR_TRAP, false), TypeError);
});
