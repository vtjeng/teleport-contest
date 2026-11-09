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
// - js/makemon_create.js preflightCreation() and its helpers: makemon() call
//   shapes and markers no C caller produces.
//
// This check fails when one of those refusals returns, and pins the
// makemon() admission refusals that C can still reach.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

const REMOVED_REFUSALS = {
    'unported_monster_actions.js': [
        'inconsistent frozen monster state',
        'a tame pet without dog state',
        'mfndpos() door or special terrain movement',
    ],
    'shk.js': ['shk_move without eshk extension'],
    'makemon_create.js': [
        'mmflags 0x',
        'random coordinates outside mklev',
        'runtime creation without its async tail owner',
        'shopkeeper extension outside shkinit',
        "'outside mklev'",
        'edog creation during mklev',
        'random monster groups',
        'monster record outside the mutable catalog',
        'waiting-vampire reversion state',
        'waiting-vampire target',
        'revival doppelganger shape change',
        'runtime creation without an unused async continuation',
    ],
};

// UnsupportedMonsterCreationError throws js/makemon_create.js keeps, pinned
// both ways. Each is a call C makes and the port does not yet: the species
// allowlist in assertSupportedSpecies() (stone to flesh on a figurine of an
// unlisted species), a shopkeeper outside shkinit() (stone to flesh on a
// statue of a shopkeeper), and an initial chameleon on the Rogue level
// (#wizgenesis there).
const REMAINING_CREATION_REFUSALS = 3;

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

test('the reachable makemon() admission refusals are pinned', () => {
    const throws = [...read('makemon_create.js')
        .matchAll(/new UnsupportedMonsterCreationError\(/gu)].length;
    assertExceptionCount(throws, REMAINING_CREATION_REFUSALS, {
        what: 'UnsupportedMonsterCreationError throw sites in js/makemon_create.js',
        pin: 'REMAINING_CREATION_REFUSALS in scripts/impossible-state-refusals.test.mjs',
    });
});
