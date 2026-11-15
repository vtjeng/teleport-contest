// Enforces js/cmd.js cmdq_add_key()'s key type rule: a CMDQ_KEY node holds
// C's char as its code, whatever form the producer passed, and no game code
// reads a queued key as a string. Batch 18 found the mixed form break two
// readers: spell.c getspell() ran spell_let_to_idx() on a numeric key and
// threw, and getpos.c's `key & 0xFF` would have turned a string key into 0.
// The first tests pin the stored form; the scan pins what it finds.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmdq_add_key, cmdq_key_char, cmdq_pop } from '../js/cmd.js';
import { CMDQ_KEY, CQ_CANNED } from '../js/const.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('cmdq_add_key() stores the key code for a code and for a letter', () => {
    const state = { iflags: {}, context: {} };
    // 'i' (105) is iactions.c's #adjust key, pushed as a string; '-' (45)
    // is HANDS_SYM; 0x1B is Escape, which only a key read produces.
    cmdq_add_key(CQ_CANNED, 'i', state);
    cmdq_add_key(CQ_CANNED, 'i'.charCodeAt(0), state);
    cmdq_add_key(CQ_CANNED, '-', state);
    cmdq_add_key(CQ_CANNED, 0x1B, state);
    const nodes = [];
    for (let node = cmdq_pop(state); node; node = cmdq_pop(state)) nodes.push(node);
    assert.deepEqual(nodes, [
        { typ: CMDQ_KEY, key: 105 },
        { typ: CMDQ_KEY, key: 105 },
        { typ: CMDQ_KEY, key: 45 },
        { typ: CMDQ_KEY, key: 0x1B },
    ]);
    assert.deepEqual(nodes.map(cmdq_key_char), ['i', 'i', '-', '\x1b']);
});

// Returns the 1-based line of every use of a popped or peeked queue node's
// key as a string: a comparison with a string literal or a string method.
export function stringKeyFindings(source) {
    const names = new Set();
    const binding = /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?cmdq_(?:pop|peek)\(/gu;
    for (const match of source.matchAll(binding)) names.add(match[1]);
    if (!names.size) return [];
    const node = String.raw`\b(?:${[...names].join('|')})\??\.key\b`;
    const literal = String.raw`(?:'[^']*'|"[^"]*"|\x60[^\x60]*\x60)`;
    const misuse = new RegExp(
        String.raw`${node}\s*[!=]==?\s*${literal}|${literal}\s*[!=]==?\s*${node}`
            + String.raw`|${node}\??\.(?:charCodeAt|codePointAt|toLowerCase|toUpperCase)\b`,
        'gu',
    );
    const lines = new Set();
    for (const match of source.matchAll(misuse))
        lines.add(source.slice(0, match.index).split('\n').length);
    return [...lines].sort((a, b) => a - b);
}

test('no game code reads a queued key as a string', () => {
    const dir = join(PROJECT_ROOT, 'js');
    const findings = [];
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.js')).sort()) {
        const source = readFileSync(join(dir, name), 'utf8');
        for (const line of stringKeyFindings(source)) findings.push(`js/${name}:${line}`);
    }
    assert.deepEqual(findings, []);
});

test('the scan finds string comparisons and string methods on a queued key', () => {
    // Each line whose comment gives a number holds one mistake.
    assert.deepEqual(stringKeyFindings([
        'const queued = cmdq_pop(state);',
        "if (queued.key !== '-') return;", // 2: do_wear.c remarm_swapwep()
        'const cq = cmdq_pop(state);',
        'const idx = cq.key.charCodeAt(0);', // 4: spell.c spell_let_to_idx()
        "if ('y' === queued?.key) f();", // 5: literal on the left
        'const ok = queued.key === 0x2D;',
        'const c = cmdq_key_char(queued);',
    ].join('\n')), [2, 4, 5]);
});
