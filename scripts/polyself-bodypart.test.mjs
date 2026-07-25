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
    const dog = monster(species(M.S_DOG));
    const yeti = monster(species(M.S_YETI));

    assert.equal(mbodypart(dog, ARM), 'foreleg');
    assert.equal(mbodypart(dog, HAND), 'paw');
    assert.equal(mbodypart(dog, HANDED), 'pawed');
    assert.equal(mbodypart(yeti, ARM), 'arm');
});

test('unusual humanoid claw attacks exclude source named classes', () => {
    const claw = { aatyp: M.AT_CLAW, adtyp: M.AD_PHYS };
    const clawed = monster(species(M.S_HUMANOID, {
        mattk: [claw],
        mflags1: M.M1_HUMANOID,
    }));
    const orc = monster(species(M.S_ORC, {
        mattk: [claw],
        mflags1: M.M1_HUMANOID,
    }));

    assert.equal(mbodypart(clawed, HAND), 'claw');
    assert.equal(mbodypart(clawed, HANDED), 'clawed');
    assert.equal(mbodypart(orc, HAND), 'hand');
});

test('named species keep trunk, skin, and tentacle exceptions', () => {
    const mumak = monster(species(M.S_QUADRUPED, { pmidx: M.PM_MUMAK }));
    const shark = monster(species(M.S_EEL, { pmidx: M.PM_SHARK }));
    const kraken = monster(species(M.S_EEL, { pmidx: M.PM_KRAKEN }));

    assert.equal(mbodypart(mumak, NOSE), 'trunk');
    assert.equal(mbodypart(shark, HAIR), 'skin');
    assert.equal(mbodypart(kraken, ARM), 'tentacle');
});

test('horse, light, and stalker dispatch precedes generic anatomy', () => {
    const unicorn = monster(species(M.S_UNICORN));
    const light = monster(species(M.S_LIGHT));
    const stalker = monster(species(M.S_ELEMENTAL, {
        pmidx: M.PM_STALKER,
    }));

    assert.equal(mbodypart(unicorn, ARM), 'foreleg');
    assert.equal(mbodypart(light, ARM), 'ray');
    assert.equal(mbodypart(light, HEAD), 'beam');
    assert.equal(mbodypart(stalker, HEAD), 'head');
});

test('remaining monster classes select their complete source tables', () => {
    const cases = [
        [M.S_EEL, HEAD, 'head', 0],
        [M.S_WORM, HEAD, 'anterior segment', 0],
        [M.S_SPIDER, HEAD, 'cephalothorax', 0],
        [M.S_SNAKE, NOSE, 'forked tongue', M.M1_SLITHY],
        [M.S_EYE, HEAD, 'body', 0],
        [M.S_JELLY, HEAD, 'cerebral area', 0],
        [M.S_VORTEX, HEAD, 'central core', 0],
        [M.S_FUNGUS, HEAD, 'cap area', 0],
        [M.S_HUMAN, HEAD, 'head', M.M1_HUMANOID],
        [M.S_QUADRUPED, ARM, 'forelimb', 0],
    ];
    for (const [mlet, part, expected, flags] of cases) {
        assert.equal(
            mbodypart(monster(species(mlet, { mflags1: flags })), part),
            expected,
        );
    }
});
