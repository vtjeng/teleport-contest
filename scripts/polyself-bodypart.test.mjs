// Pin polyself.c's mbodypart(). It is a chain of `mlet == S_foo` and
// `pmidx == PM_foo` tests, so a species fabricated from the port's own class
// letter would select its branch even if that export were missing or wrong:
// `undefined === undefined` is true. Each mlet below is therefore the number
// defsym.h assigns the class, cited at its use.
//
// The `pmidx` values stay as PM_ constants. C generates those from the row
// order of monsters.h and writes no numeral for any of them, so there is
// nothing to transcribe; scripts/check-namespace-members.mjs is what catches a
// missing one.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARM,
    HAIR,
    HAND,
    HANDED,
    HEAD,
    NOSE,
} from '../js/const.js';
import * as M from '../js/monsters.js';
import { mbodypart } from '../js/polyself.js';

// Monster class letters, from the MONSYM() rows of include/defsym.h. The
// number is the first MONSYM() argument; the line is where that row sits.
const S_DOG = 4;         // defsym.h:298
const S_EYE = 5;         // defsym.h:299
const S_HUMANOID = 8;    // defsym.h:303
const S_JELLY = 10;      // defsym.h:306
const S_ORC = 15;        // defsym.h:311
const S_QUADRUPED = 17;  // defsym.h:314
const S_SPIDER = 19;     // defsym.h:316
const S_UNICORN = 21;    // defsym.h:319
const S_VORTEX = 22;     // defsym.h:320
const S_WORM = 23;       // defsym.h:321
const S_LIGHT = 25;      // defsym.h:324
const S_ELEMENTAL = 31;  // defsym.h:331
const S_FUNGUS = 32;     // defsym.h:332
const S_SNAKE = 45;      // defsym.h:346
const S_YETI = 51;       // defsym.h:354
const S_HUMAN = 53;      // defsym.h:356
const S_EEL = 57;        // defsym.h:362

// Attack and body flags mbodypart() reads, from include/monattk.h and
// include/monflag.h.
const AT_CLAW = 1;               // monattk.h:13
const AD_PHYS = 0;               // monattk.h:42
const M1_SLITHY = 0x00080000;    // monflag.h:104
const M1_HUMANOID = 0x00020000;  // monflag.h:102

function monster(species) {
    return { data: species };
}

function species(mlet, overrides = {}) {
    return {
        mattk: [],
        mflags1: 0,
        mlet,
        pmidx: -1,
        ...overrides,
    };
}

test('invalid body-part indices retain the source diagnostic fallback', () => {
    assert.equal(mbodypart(null, -1), 'mystery part');
    assert.equal(mbodypart(null, 19), 'mystery part');
});

test('dogs and yetis preserve their source limb exceptions', () => {
    const dog = monster(species(S_DOG));
    const yeti = monster(species(S_YETI));

    assert.equal(mbodypart(dog, ARM), 'foreleg');
    assert.equal(mbodypart(dog, HAND), 'paw');
    assert.equal(mbodypart(dog, HANDED), 'pawed');
    assert.equal(mbodypart(yeti, ARM), 'arm');
});

test('unusual humanoid claw attacks exclude source named classes', () => {
    const claw = { aatyp: AT_CLAW, adtyp: AD_PHYS };
    const clawed = monster(species(S_HUMANOID, {
        mattk: [claw],
        mflags1: M1_HUMANOID,
    }));
    const orc = monster(species(S_ORC, {
        mattk: [claw],
        mflags1: M1_HUMANOID,
    }));

    assert.equal(mbodypart(clawed, HAND), 'claw');
    assert.equal(mbodypart(clawed, HANDED), 'clawed');
    assert.equal(mbodypart(orc, HAND), 'hand');
});

test('named species keep trunk, skin, and tentacle exceptions', () => {
    const mumak = monster(species(S_QUADRUPED, { pmidx: M.PM_MUMAK }));
    const shark = monster(species(S_EEL, { pmidx: M.PM_SHARK }));
    const kraken = monster(species(S_EEL, { pmidx: M.PM_KRAKEN }));

    assert.equal(mbodypart(mumak, NOSE), 'trunk');
    assert.equal(mbodypart(shark, HAIR), 'skin');
    assert.equal(mbodypart(kraken, ARM), 'tentacle');
});

test('horse, light, and stalker dispatch precedes generic anatomy', () => {
    const unicorn = monster(species(S_UNICORN));
    const light = monster(species(S_LIGHT));
    const stalker = monster(species(S_ELEMENTAL, {
        pmidx: M.PM_STALKER,
    }));

    assert.equal(mbodypart(unicorn, ARM), 'foreleg');
    assert.equal(mbodypart(light, ARM), 'ray');
    assert.equal(mbodypart(light, HEAD), 'beam');
    assert.equal(mbodypart(stalker, HEAD), 'head');
});

test('remaining monster classes select their complete source tables', () => {
    const cases = [
        [S_EEL, HEAD, 'head', 0],
        [S_WORM, HEAD, 'anterior segment', 0],
        [S_SPIDER, HEAD, 'cephalothorax', 0],
        [S_SNAKE, NOSE, 'forked tongue', M1_SLITHY],
        [S_EYE, HEAD, 'body', 0],
        [S_JELLY, HEAD, 'cerebral area', 0],
        [S_VORTEX, HEAD, 'central core', 0],
        [S_FUNGUS, HEAD, 'cap area', 0],
        [S_HUMAN, HEAD, 'head', M1_HUMANOID],
        [S_QUADRUPED, ARM, 'forelimb', 0],
    ];
    for (const [mlet, part, expected, flags] of cases) {
        assert.equal(
            mbodypart(monster(species(mlet, { mflags1: flags })), part),
            expected,
        );
    }
});
