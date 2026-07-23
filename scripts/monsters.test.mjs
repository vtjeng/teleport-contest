import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import * as monsterExports from '../js/monsters.js';
import {
    AT_WEAP,
    G_NOCORPSE,
    M1_ANIMAL,
    M1_CARNIVORE,
    M1_HERBIVORE,
    M1_HUMANOID,
    M1_METALLIVORE,
    M1_MINDLESS,
    M1_NOHANDS,
    M1_UNSOLID,
    M2_GREEDY,
    M3_INFRAVISION,
    MZ_MEDIUM,
    MZ_SMALL,
    MONSTER_CLASSES,
    MONSTER_TEMPLATES,
    MS_GUARDIAN,
    NUMMONS,
    PM_APPRENTICE,
    PM_GIANT_ANT,
    S_ANT,
    S_HUMAN,
    SPECIAL_PM,
    monsterClassSymbol,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';

test('generated monster catalog matches the complete pinned C export', () => {
    assert.equal(NUMMONS, 383);
    assert.equal(SPECIAL_PM, 330);
    assert.equal(PM_GIANT_ANT, 0);
    assert.equal(PM_APPRENTICE, NUMMONS - 1);
    assert.equal(MONSTER_TEMPLATES.length, NUMMONS + 1);
    assert.equal(MONSTER_CLASSES.length, 60);
    assert.equal(monsterClassSymbol(S_ANT), 'a');
    assert.equal(monsterClassSymbol(S_HUMAN), '@');
    assert.equal(MONSTER_TEMPLATES[NUMMONS].pmidx, -1);
    assert.equal(MONSTER_TEMPLATES[NUMMONS].pmnames[2], '');
    // These source constants sample attack, body-shape, behavior, size,
    // extended-behavior, and sound categories from the generated set.
    assert.equal(AT_WEAP, 254);
    assert.equal(monsterExports.AT_HUGS, 7);
    assert.equal(monsterExports.AT_ENGL, 11);
    assert.equal(monsterExports.AD_STCK, 19);
    assert.equal(monsterExports.AD_WRAP, 28);
    assert.equal(monsterExports.M1_CLING, 0x00000010);
    assert.equal(monsterExports.M1_HIDE, 0x00000100);
    assert.equal(M1_NOHANDS, 0x00002000);
    assert.equal(M1_MINDLESS, 0x00010000);
    assert.equal(M1_HUMANOID, 0x00020000);
    assert.equal(M1_ANIMAL, 0x00040000);
    assert.equal(M1_UNSOLID, 0x00100000);
    assert.equal(M1_CARNIVORE, 0x20000000);
    assert.equal(M1_HERBIVORE, 0x40000000);
    assert.equal(M1_METALLIVORE, 0x80000000);
    assert.equal(M2_GREEDY, 0x10000000);
    assert.equal(M3_INFRAVISION, 0x0100);
    assert.equal(MZ_SMALL, 1);
    assert.equal(MZ_MEDIUM, 2);
    assert.equal(monsterExports.MZ_HUGE, 4);
    assert.equal(MS_GUARDIAN, 38);

    const numericExports = Object.entries(monsterExports)
        .filter(([name, value]) => /^[A-Z][A-Z0-9_]*$/u.test(name)
            && Number.isInteger(value))
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    const digest = createHash('sha256')
        .update(JSON.stringify([
            numericExports,
            MONSTER_CLASSES,
            MONSTER_TEMPLATES,
        ]))
        .digest('hex');
    // This digest covers every exported monster and class enum plus every
    // name, attack, generation flag, level, weight, resistance, and color.
    assert.equal(
        digest,
        '5e30c38fe6b3683bd831c67397d47fbc2ebdc5e234f84d4662fc92c2630fdc81',
    );
});

test('monster globals clone mutable records before new-game vital reset', () => {
    const first = {};
    const second = {};
    monst_globals_init(first);
    monst_globals_init(second);
    assert.equal(first.mvitals, undefined);
    reset_mvitals(first);
    reset_mvitals(second);

    assert.equal(first.mons.length, NUMMONS + 1);
    assert.equal(first.mvitals.length, NUMMONS);
    assert.equal(first.svm.mvitals, first.mvitals);
    for (let index = 0; index < NUMMONS; ++index) {
        assert.deepEqual(first.mvitals[index], {
            born: 0,
            died: 0,
            mvflags: first.mons[index].geno & G_NOCORPSE,
            photographed: 0,
            seen_close: 0,
        });
    }

    assert.notEqual(first.mons[0], second.mons[0]);
    assert.notEqual(first.mons[0].pmnames, second.mons[0].pmnames);
    assert.notEqual(first.mons[0].mattk, second.mons[0].mattk);
    assert.notEqual(first.mons[0].mattk[0], second.mons[0].mattk[0]);
    first.mons[0].pmnames[2] = 'changed';
    first.mons[0].mattk[0].damd = 99;
    first.mvitals[0].died = 7;
    assert.deepEqual(second.mons[0], MONSTER_TEMPLATES[0]);
    assert.deepEqual(second.mvitals[0], {
        born: 0,
        died: 0,
        mvflags: MONSTER_TEMPLATES[0].geno & G_NOCORPSE,
        photographed: 0,
        seen_close: 0,
    });
});

test('vital reset preserves catalog mutations and existing life counts', () => {
    const state = {};
    monst_globals_init(state);
    const questIndex = PM_APPRENTICE;
    state.mons[questIndex].msound = 37;
    state.mvitals = Array.from({ length: NUMMONS }, () => ({
        born: 2,
        died: 1,
        photographed: 1,
        seen_close: 1,
        mvflags: 0xff,
    }));
    const originalVitals = state.mvitals;
    const originalQuestVital = state.mvitals[questIndex];

    reset_mvitals(state);

    assert.equal(state.mons[questIndex].msound, 37);
    assert.equal(state.mvitals, originalVitals);
    assert.equal(state.mvitals[questIndex], originalQuestVital);
    assert.deepEqual(state.mvitals[questIndex], {
        born: 2,
        died: 1,
        mvflags: state.mons[questIndex].geno & G_NOCORPSE,
        photographed: 1,
        seen_close: 1,
    });
    assert.equal(state.svm.mvitals, state.mvitals);
});

test('generated monster templates are deeply immutable', () => {
    assert.equal(Object.isFrozen(MONSTER_TEMPLATES), true);
    assert.equal(Object.isFrozen(MONSTER_TEMPLATES[0]), true);
    assert.equal(Object.isFrozen(MONSTER_TEMPLATES[0].pmnames), true);
    assert.equal(Object.isFrozen(MONSTER_TEMPLATES[0].mattk), true);
    assert.equal(Object.isFrozen(MONSTER_TEMPLATES[0].mattk[0]), true);
    assert.equal(Object.isFrozen(MONSTER_CLASSES), true);
    assert.equal(Object.isFrozen(MONSTER_CLASSES[0]), true);
});
