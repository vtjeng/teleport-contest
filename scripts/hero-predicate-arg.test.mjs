// Enforces the argument convention of the hero-property predicates. C's
// youprop.h macros (Blind, Levitation, ...) and you.h's Upolyd read the
// hero struct `u`; their JavaScript counterparts in js/youprop.js and
// js/const.js take that struct (state.u) as their first parameter. Passing
// the whole game state instead reads fields that do not exist there, so the
// predicate silently answers false: Upolyd(state) compared two undefined
// monster indexes. The scan found three such sites, all Upolyd(state):
// trap.js trapname()'s role-trap gender (trap.c 7137) and artifacts.js
// artifact_hit()'s Tsurugi and Vorpal Blade fatal damage (artifact.c 1590,
// 1637).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { Upolyd } from '../js/const.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Exported predicates whose first parameter is the hero struct.
const HERO_PARAMETER = /^export function ([A-Za-z_]\w*)\((?:u|player|you)\b/gmu;
// A first argument that names a game state rather than its hero struct.
const STATE_ARGUMENT = /^(?:state|game|normalized|env|context|\w+\.state)$/u;

function heroPredicates() {
    const names = new Set();
    for (const file of ['youprop.js', 'const.js']) {
        const source = readFileSync(join(ROOT, 'js', file), 'utf8');
        for (const match of source.matchAll(HERO_PARAMETER))
            names.add(match[1]);
    }
    return names;
}

// The text of a call's first argument, up to its top-level comma or the
// closing parenthesis.
function firstArgument(source, open) {
    let depth = 0;
    for (let index = open + 1; index < source.length; ++index) {
        const ch = source[index];
        if (ch === '(' || ch === '[' || ch === '{') ++depth;
        else if (ch === ')' || ch === ']' || ch === '}') {
            if (depth === 0) return source.slice(open + 1, index).trim();
            --depth;
        } else if (ch === ',' && depth === 0) {
            return source.slice(open + 1, index).trim();
        }
    }
    return '';
}

export function stateArgumentFindings(source, names) {
    const findings = [];
    // A file may define its own helper with a predicate's name (js/sit.js
    // Underwater(state)); its calls refer to that helper.
    const local = new Set(
        [...source.matchAll(/^(?:export )?(?:async )?function ([A-Za-z_]\w*)\(/gmu)]
            .map((match) => match[1]),
    );
    for (const match of source.matchAll(/(?<![\w.$])([A-Za-z_]\w*)\(/gu)) {
        const name = match[1];
        if (!names.has(name) || local.has(name)) continue;
        const argument = firstArgument(source, match.index + name.length);
        if (!STATE_ARGUMENT.test(argument)) continue;
        const line = source.slice(0, match.index).split('\n').length;
        findings.push({ name, argument, line });
    }
    return findings;
}

test('hero-property predicates receive the hero struct, not the game state', () => {
    const names = heroPredicates();
    // Upolyd from const.js and Blind from youprop.js are both in the set.
    assert.ok(names.has('Upolyd') && names.has('Blind'));
    const findings = [];
    for (const file of readdirSync(join(ROOT, 'js')).sort()) {
        if (!file.endsWith('.js')) continue;
        const source = readFileSync(join(ROOT, 'js', file), 'utf8');
        for (const { name, argument, line } of stateArgumentFindings(source, names))
            findings.push(`js/${file}:${line} ${name}(${argument})`);
    }
    assert.deepEqual(findings, []);
});

test('the scan flags a state argument and accepts state.u and local helpers', () => {
    const names = new Set(['Upolyd', 'Underwater']);
    // Line 1 passes the state and line 3 a normalized state: both flagged.
    // Line 2 passes the hero struct; line 4 calls a file-local helper.
    const source = [
        'const a = Upolyd(state) ? 1 : 0;',
        'const b = Upolyd(state.u);',
        'const c = Upolyd(normalized.state);',
        'function Underwater(state) { return state.u.uinwater; }',
        'const d = Underwater(state);',
    ].join('\n');
    assert.deepEqual(
        stateArgumentFindings(source, names).map(({ line }) => line),
        [1, 3],
    );
});

test('Upolyd() of the game state is false even for a polymorphed hero', () => {
    // The defect this check prevents: a hero struct whose current form (an
    // arbitrary index 271) differs from her own (an arbitrary 300) is
    // polymorphed, but the state that holds her has neither field.
    const u = { umonnum: 271, umonster: 300 };
    assert.equal(Upolyd(u), true);
    assert.equal(Upolyd({ u }), false);
});
