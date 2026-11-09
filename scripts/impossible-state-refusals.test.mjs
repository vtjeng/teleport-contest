// Refusals the port removed because no production caller can reach them: each
// stood for a state the game never creates or a call shape no C caller makes.
//
// - js/unported_monster_actions.js assertSimpleActionState(): a monster with
//   both mcanmove and mfrozen (every writer of a nonzero mfrozen clears
//   mcanmove, and every writer of mcanmove = 1 clears mfrozen), and a tame
//   non-minion without dog.c's edog extension (tamedog() and initedog() add
//   it before any monster becomes tame).
// - js/unported_monster_actions.js admitSimpleDestinationAndRegion(): a
//   destination that mon.c mfndpos() selected but no terrain arm admits.
//   m_move() and dog_move() take every destination from mfndpos(), and with
//   m_move()'s can_tunnel and can_unlock each terrain type mfndpos() can
//   select has an arm.
// - js/shk.js shk_move(): a shopkeeper without its eshk extension; every
//   writer of isshk = true creates it first.
//
// This check fails when one of those refusals returns.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

const REMOVED_REFUSALS = {
    'unported_monster_actions.js': [
        'inconsistent frozen monster state',
        'a tame pet without dog state',
        'mfndpos() door or special terrain movement',
    ],
    'shk.js': ['shk_move without eshk extension'],
};

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function read(file) {
    return stripComments(readFileSync(`${JS_DIR}${file}`, 'utf8'));
}

test('no removed impossible-state refusal returns', () => {
    const findings = [];
    for (const [file, texts] of Object.entries(REMOVED_REFUSALS)) {
        const code = read(file);
        for (const text of texts) {
            if (code.includes(text)) findings.push(`${file}: ${text}`);
        }
    }
    assert.deepEqual(findings, []);
});
