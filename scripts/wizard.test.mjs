import assert from 'node:assert/strict';
import test from 'node:test';

import {
    RLOC_MSG,
    STRAT_HEAL,
    STRAT_PLAYER,
} from '../js/const.js';
import {
    choose_stairs,
    mon_has_arti,
    on_ground,
    other_mon_has_arti,
    strategy,
    tactics,
    target_on,
    you_have,
    which_arti,
} from '../js/wizard.js';
import {
    AMULET_OF_YENDOR,
    BELL_OF_OPENING,
} from '../js/objects.js';

const M3_WANTSBELL = 0x0002;
const M3_WANTSARTI = 0x0010;
const M3_WIZARD = 31;

function stateForWizard() {
    return {
        context: {},
        dungeons: [{ num_dunlevs: 2, entry_lev: 2 }],
        branches: [],
        stairs: null,
        level: { monlist: null, objlist: null },
        u: {
            ux: 10,
            uy: 11,
            uz: { dnum: 0, dlevel: 1 },
            uhave: {},
            uevent: { invoked: false },
        },
    };
}

function covetousMonster(mflags3 = M3_WIZARD) {
    return {
        data: { mflags3, pmidx: 999 },
        mhp: 10,
        mhpmax: 10,
        m_id: 2,
        mx: 4,
        my: 4,
        mgoal: { x: 0, y: 0 },
        mstrategy: 0,
        minvent: null,
        iswiz: false,
        isshk: false,
        ispriest: false,
        mflee: false,
    };
}

test('wizard artifact selectors preserve C object masks and list order', () => {
    assert.equal(which_arti(M3_WANTSBELL), BELL_OF_OPENING);
    assert.equal(which_arti(M3_WANTSARTI), 0);

    const state = stateForWizard();
    const quest = { oartifact: 21, nobj: null };
    state.level.objlist = quest;
    assert.equal(on_ground(0, state), quest);
    assert.equal(mon_has_arti({ minvent: quest }, 0, state), true);
    assert.equal(mon_has_arti({ minvent: null }, AMULET_OF_YENDOR, state), false);
});

test('other_mon_has_arti scans the linked monster list without the subject', () => {
    const state = stateForWizard();
    const subject = covetousMonster(M3_WANTSBELL);
    const carrier = covetousMonster(M3_WANTSBELL);
    const bell = { otyp: BELL_OF_OPENING, nobj: null };
    carrier.minvent = bell;
    subject.nmon = carrier;
    state.level.monlist = subject;

    assert.equal(other_mon_has_arti(subject, BELL_OF_OPENING, state), carrier);
    carrier.minvent = null;
    assert.equal(other_mon_has_arti(subject, BELL_OF_OPENING, state), null);
});

test('you_have maps each source possession flag', () => {
    const state = stateForWizard();
    state.u.uhave.bell = true;
    assert.equal(you_have(M3_WANTSBELL, state), true);
    assert.equal(you_have(M3_WANTSARTI, state), false);
    state.u.uhave.questart = true;
    assert.equal(you_have(M3_WANTSARTI, state), true);
});

test('target_on prefers hero possession and writes the source goal', () => {
    const state = stateForWizard();
    state.u.uhave.bell = true;
    const monster = covetousMonster(M3_WANTSBELL);
    assert.equal(
        target_on(M3_WANTSBELL, monster, state),
        STRAT_PLAYER | M3_WANTSBELL,
    );
    assert.deepEqual(monster.mgoal, { x: 10, y: 11 });
});

test('strategy chooses healing before artifact targets at the source ratio', () => {
    const state = stateForWizard();
    const monster = covetousMonster(M3_WANTSARTI);
    monster.mhp = 2;
    monster.mhpmax = 10;
    assert.equal(strategy(monster, state), STRAT_HEAL);
});

test('strategy default ratio keeps the source panic fallback', () => {
    const state = stateForWizard();
    const monster = covetousMonster();
    monster.mhp = 20;
    monster.mhpmax = 10;
    assert.equal(strategy(monster, state), STRAT_HEAL);
});

test('tactics keeps cached tower coordinates for post-relocation healing',
    async () => {
        const state = stateForWizard();
        state.u.uz = { dnum: 9, dlevel: 2 };
        state.dungeons = Array.from({ length: 10 }, () => ({
            num_dunlevs: 3,
            entry_lev: 1,
        }));
        state.wiz1_level = { dnum: 9, dlevel: 2 };
        state.dndest = { nlx: 30, nly: 4, nhx: 40, nhy: 12 };
        const monster = covetousMonster();
        monster.iswiz = true;
        monster.mx = 35;
        monster.my = 8;
        monster.mhp = 2;
        monster.mhpmax = 10;
        const calls = [];
        const result = await tactics(monster, {
            state,
            random: {
                rn2(bound) {
                    calls.push(`rn2(${bound})`);
                    return 0;
                },
                rnd(bound) {
                    calls.push(`rnd(${bound})`);
                    return 1;
                },
            },
            noteleportLevel: () => false,
            rloc: (subject) => {
                subject.mx = 10;
                subject.my = 11;
            },
            healmon: () => calls.push('heal'),
        });
        assert.equal(result, 1);
        assert.deepEqual(calls, ['rn2(3)', 'rnd(8)', 'heal']);
    });

test('choose_stairs prefers a regular stair in the requested direction', () => {
    const state = stateForWizard();
    state.stairs = {
        sx: 3,
        sy: 4,
        up: false,
        isladder: false,
        tolev: { dnum: 0, dlevel: 2 },
        next: null,
    };
    assert.deepEqual(choose_stairs(false, state), { x: 3, y: 4 });
});

test('tactics keeps STRAT_NONE harassment order and relocation flags', async () => {
    const state = stateForWizard();
    const monster = covetousMonster(M3_WANTSBELL);
    const calls = [];
    const result = await tactics(monster, {
        state,
        random: {
            rn2(bound) {
                assert.equal(bound, 5);
                return 0;
            },
            rnd() {
                throw new Error('STRAT_NONE must not call rnd');
            },
        },
        noteleportLevel: () => false,
        mnexto(subject, flags) {
            calls.push([subject, flags]);
        },
    });
    assert.equal(result, 0);
    assert.deepEqual(calls, [[monster, RLOC_MSG]]);
});
