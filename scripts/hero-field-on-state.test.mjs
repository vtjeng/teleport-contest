// Fails when game code reads a field of the hero struct (C's `u`) off the
// game state instead of off state.u. mhitu.js doseduce() and mayberem()
// tested `state.utotype`, which is always undefined, at four sites where C
// tests u.utotype (mhitu.c 2095, 2103, 2136 and 2319), so a seducer kept
// going after removed levitation boots dropped the hero through a trap
// door. js/u_init.js zeroHero() defines the hero's fields; this scan takes
// every u-prefixed field name from it, so a new hero field is covered
// without editing this file.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function heroFieldNames(source) {
    const body = /function zeroHero\(roleplay\) \{\s*return \{([\s\S]*?)\n {4}\};/u
        .exec(source);
    if (!body) throw new Error('js/u_init.js zeroHero() not found');
    return [...body[1].matchAll(/^\s+(u[a-z]\w*):/gmu)].map((m) => m[1]);
}

// Reads of `state.<field>`, `game.<field>` or `g.<field>`, optionally with
// `?.`, for each hero field, outside comments.
export function heroFieldReads(source, fields) {
    const code = source.replace(/\/\/.*$/gmu, '');
    const pattern = new RegExp(
        `\\b(?:state|game|g)\\??\\.(${fields.join('|')})\\b`, 'gu');
    return [...code.matchAll(pattern)].map((m) => ({
        field: m[1],
        line: code.slice(0, m.index).split('\n').length,
    }));
}

test('game code reads hero fields from state.u, not from the state', () => {
    const fields = heroFieldNames(readFileSync(join(ROOT, 'js', 'u_init.js'), 'utf8'));
    // A floor on the field list: zeroHero() defined 84 u-prefixed fields
    // when this check was written, so a much smaller number means the
    // pattern above stopped matching it.
    assert.ok(fields.length > 60, `only ${fields.length} hero fields found`);
    const found = [];
    for (const name of readdirSync(join(ROOT, 'js')).sort()) {
        if (!name.endsWith('.js')) continue;
        const source = readFileSync(join(ROOT, 'js', name), 'utf8');
        for (const { field, line } of heroFieldReads(source, fields))
            found.push(`js/${name}:${field}:${line}`);
    }
    // One exception, js/youprop.js stateOf(): `state.uprops === undefined`
    // tells the game state from the hero when a macro is given the wrong
    // one. The count must change only when a justified exception is added
    // here; the line is not pinned, so edits above the site do not break it.
    assert.deepEqual(found.map((site) => site.replace(/:\d+$/u, '')),
        ['js/youprop.js:uprops']);
});

test('the scan flags state.utotype and accepts state.u.utotype', () => {
    // Line 1 is the defect; line 2 is C's u.utotype; line 3 is a comment.
    const source = [
        'if (state.utotype || !m_next2u(mon, state)) return 1;',
        'if (state.u.utotype || !m_next2u(mon, state)) return 1;',
        '// state.utotype in a comment is not a read',
    ].join('\n');
    assert.deepEqual(heroFieldReads(source, ['utotype', 'ux']),
        [{ field: 'utotype', line: 1 }]);
});
