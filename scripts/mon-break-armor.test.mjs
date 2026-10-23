import assert from 'node:assert/strict';
import test from 'node:test';

import { GameMap } from '../js/game.js';
import { BLINDED, HALLUC, OBJ_MINVENT, W_ARM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newObject } from '../js/obj.js';
import { ARMOR_CLASS, LEATHER_ARMOR } from '../js/objects.js';
import { mon_break_armor } from '../js/worn.js';
import { newcham } from '../js/mon.js';
import * as M from '../js/monsters.js';
import { newMonster } from '../js/monst.js';

function levelConstructionState() {
    const state = {
        level: new GameMap(),
        u: {
            ux: 5,
            uy: 5,
            uz: { dnum: 0, dlevel: 1 },
            uprops: [],
        },
        dungeons: [{
            depth_start: 1,
            ledger_start: 0,
            num_dunlevs: 29,
            entry_lev: 1,
            flags: { hellish: false },
        }],
    };
    M.monst_globals_init(state);
    M.reset_mvitals(state);
    state.in_mklev = true;
    state.youmonst = { data: state.mons[M.PM_HUMAN] };
    return state;
}

test('newcham remains synchronous during level construction without armor effects', () => {
    const state = levelConstructionState();
    const monster = newMonster({
        data: state.mons[M.PM_GIANT_EEL],
        mnum: M.PM_GIANT_EEL,
        cham: M.PM_CHAMELEON,
        mcan: true,
        mcanmove: true,
        mhp: 4,
        mhpmax: 4,
        mx: 4,
        my: 4,
    });
    const target = state.mons[M.PM_SEWER_RAT];

    const result = newcham(monster, target, {
        state,
        random: {
            d: () => 1,
            rn1: () => 1,
            rn2: () => 0,
            rnd: () => 1,
            rne: () => 1,
            rnz: () => 1,
        },
        canSpotMonster: () => false,
        message: () => assert.fail('level construction has no shape message'),
        redrawSquare: () => {},
    });

    assert.equal(result, true);
    assert.equal(monster.data, target);
});

for (const equipped of [false, true]) {
    for (const planning of [false, true]) {
        test('unchanged monster armor evaluates entry pronouns synchronously: equipped=' + equipped + ', planning=' + planning, () => {
            const state = levelConstructionState();
            state.u.uprops[HALLUC] = { intrinsic: 8 };
            const monster = newMonster({ data: state.mons[M.PM_VAMPIRE_LEADER],
                mnum: M.PM_VAMPIRE_LEADER, mx: 4, my: 4, mhp: 30, mhpmax: 30 });
            const armor = equipped ? newObject({ otyp: LEATHER_ARMOR,
                oclass: ARMOR_CLASS, owornmask: W_ARM, where: OBJ_MINVENT,
                ocarry: monster }) : null;
            monster.minvent = armor;
            monster.misc_worn_check = equipped ? W_ARM : 0;
            const draws = [];
            const values = [0, 1];
            const result = mon_break_armor(monster, false, { state, planning,
                random: { rn2(n) { draws.push(n); assert.equal(n, 4);
                    assert.ok(values.length); return values.shift(); } },
                message: () => assert.fail('unchanged equipment emits no message') });
            assert.equal(result, undefined, 'the construction fast path remains synchronous');
            assert.deepEqual(draws, [4, 4]);
            assert.deepEqual(values, []);
            assert.equal(monster.minvent, armor);
            if (armor) assert.equal(armor.owornmask, W_ARM);
        });
    }
}

for (const overrideVisibility of [false, true]) {
    test('ordinary armor entry preserves perception owner and spends no RNG, override=' + overrideVisibility, () => {
        const state = levelConstructionState();
        const monster = newMonster({ data: state.mons[M.PM_VAMPIRE_LEADER],
            mnum: M.PM_VAMPIRE_LEADER, mx: 4, my: 4, mhp: 30, mhpmax: 30 });
        let seen = 0;
        const env = { state, random: { rn2: () => assert.fail('ordinary pronoun drew RNG') } };
        if (overrideVisibility) env.canSpotMonster = (subject, owner) => {
            assert.equal(subject, monster);
            assert.equal(owner, state);
            seen++;
            return false;
        };
        assert.equal(mon_break_armor(monster, false, env), undefined);
        assert.equal(seen, overrideVisibility ? 2 : 0);
    });
}

test('effectful armor drop uses captured pronouns without drawing them again', async () => {
    await runSegment({ seed: 8432120, datetime: '20261104103000',
        nethackrc: 'OPTIONS=name:ArmorPronouns,role:Valkyrie,race:human,gender:female,align:neutral,playmode:debug,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',
        moves: '' });
    game.u.uprops[HALLUC].intrinsic = 8;
    game.u.uprops[BLINDED].intrinsic = 8;
    const x = game.u.ux, y = game.u.uy;
    game.viz_array[y][x] = 0; // Unseen armor drops use the source sound line.
    const monster = newMonster({ data: game.mons[M.PM_FOG_CLOUD],
        mnum: M.PM_FOG_CLOUD, mx: x, my: y, mhp: 30, mhpmax: 30 });
    const armor = newObject({ otyp: LEATHER_ARMOR, oclass: ARMOR_CLASS,
        quan: 1, owornmask: W_ARM, where: OBJ_MINVENT, ocarry: monster });
    monster.minvent = armor;
    monster.misc_worn_check = W_ARM;
    const draws = [], messages = [], values = [0, 1];
    const result = mon_break_armor(monster, false, { state: game,
        random: { rn2(n) { draws.push(n); assert.equal(n, 4);
            assert.ok(values.length); return values.shift(); } },
        message: async line => { messages.push(line); } });
    assert.ok(result instanceof Promise);
    assert.deepEqual(draws, [4, 4]);
    await result;
    assert.deepEqual(draws, [4, 4]);
    assert.equal(monster.minvent, null);
    assert.equal(armor.owornmask, 0);
    assert.equal(game.level.objects[x][y], armor);
    assert.deepEqual(messages, ['You hear a thud.']);
});
