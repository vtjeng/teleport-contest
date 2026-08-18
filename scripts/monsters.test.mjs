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
    assert.equal(monsterExports.AT_BREA, 12);
    assert.equal(monsterExports.AT_MAGC, 255);
    assert.equal(monsterExports.AD_ANY, -1);
    assert.equal(monsterExports.AD_PHYS, 0);
    assert.equal(monsterExports.AD_FIRE, 2);
    assert.equal(monsterExports.AD_COLD, 3);
    assert.equal(monsterExports.AD_SLEE, 4);
    assert.equal(monsterExports.AD_ELEC, 6);
    assert.equal(monsterExports.AD_ACID, 8);
    assert.equal(monsterExports.AD_DRST, 7);
    // mon.c monkilled():3398 tests both of these to decide whether the death
    // leaves a corpse, and reads AD_RBRE negated.
    assert.equal(monsterExports.AD_DGST, 26);
    assert.equal(monsterExports.AD_RBRE, 242);
    assert.equal(monsterExports.AD_STCK, 19);
    assert.equal(monsterExports.AD_WRAP, 28);
    assert.equal(monsterExports.AD_POLY, 43);
    // monattk.h:56, :78, :82, :83 and :32. mhitu.c getmattk() reads the first
    // four to decide whether to substitute an attack and mattacku()'s loop
    // reads AD_DRIN; muse.c find_offensive():1435 reads AD_HEAL.
    assert.equal(monsterExports.AD_DREN, 16);
    assert.equal(monsterExports.AD_DRIN, 32);
    assert.equal(monsterExports.AD_DISE, 33);
    assert.equal(monsterExports.AD_PEST, 38);
    assert.equal(monsterExports.AD_FAMN, 39);
    assert.equal(monsterExports.AD_HEAL, 27);
    // monattk.h:55-56, :59, :62-63, :65, :67, :79, :83 and :91-92. Every one
    // of these names an arm of uhitm.c mhitm_adtyping() (4786-4831), the
    // switch js/uhitm.js dispatches a landed melee hit through; each arm the
    // port has not reached refuses under the constant that selects it.
    assert.equal(monsterExports.AD_SLOW, 13);
    assert.equal(monsterExports.AD_PLYS, 14);
    assert.equal(monsterExports.AD_LEGS, 17);
    assert.equal(monsterExports.AD_SGLD, 20);
    assert.equal(monsterExports.AD_SITM, 21);
    assert.equal(monsterExports.AD_TLPT, 23);
    assert.equal(monsterExports.AD_CONF, 25);
    assert.equal(monsterExports.AD_DETH, 37);
    assert.equal(monsterExports.AD_ENCH, 41);
    assert.equal(monsterExports.AD_SAMU, 252);
    assert.equal(monsterExports.AD_CURS, 253);
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
    assert.equal(monsterExports.M2_PNAME, 0x00080000);
    assert.equal(M3_INFRAVISION, 0x0100);
    // monflag.h:177-183. The six sizes insight.c size_str() names, including
    // the two whose values are not their position in the list: MZ_TINY is the
    // zero the catalog stores for a newt, and MZ_GIGANTIC skips 5 and 6.
    assert.equal(monsterExports.MZ_TINY, 0);
    assert.equal(MZ_SMALL, 1);
    assert.equal(MZ_MEDIUM, 2);
    assert.equal(monsterExports.MZ_LARGE, 3);
    assert.equal(monsterExports.MZ_HUGE, 4);
    assert.equal(monsterExports.MZ_GIGANTIC, 7);
    assert.equal(MS_GUARDIAN, 38);
    assert.equal(monsterExports.MR_SLEEP, 4);
    assert.equal(monsterExports.MR_DISINT, 8);
    assert.equal(monsterExports.MR_ELEC, 16);
    assert.equal(monsterExports.MR_POISON, 32);
    assert.equal(monsterExports.MR_ACID, 64);
    assert.equal(monsterExports.MR_STONE, 128);

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
        'fb6504245adb6828b6b4a5fc6a1119e2008695778323dfcb3e6427a579994a60',
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
