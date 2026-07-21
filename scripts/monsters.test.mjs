import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import * as monsterExports from '../js/monsters.js';
import {
    G_NOCORPSE,
    MONSTER_CLASSES,
    MONSTER_TEMPLATES,
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
        'd23f399372f2410884ed151a3255bcd7b1e33703f5c30568b2b2f98f8d384b67',
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
