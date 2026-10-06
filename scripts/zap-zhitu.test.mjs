// Source-pinned branches of zap.c zhitu(); recordings establish its callers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { zhitu, ubreatheu } from '../js/zap.js';
import { preflightSimpleMonsterActions } from '../js/unported_monster_actions.js';
import { HeroDeathPlanningError } from '../js/hack.js';
import {
    ACID_RES, ANTIMAGIC, COLD_RES, DISINT_RES, FIRE_RES, FROMOUTSIDE,
    DIED, KILLED_BY_AN, POISON_RES, SHOCK_RES,
    SLEEP_RES, W_ARM, ROOM, OBJ_INVENT,
} from '../js/const.js';
import { PM_FLESH_GOLEM, PM_IRON_GOLEM, PM_HUMAN, NON_PM, AD_DRST, PM_BLACK_DRAGON } from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { breamm } from '../js/mthrowu.js';
import { mksobj } from '../js/obj.js';
import { TOWEL, POT_BOOZE } from '../js/objects.js';
import { enableRngLog, getRngLog } from '../js/rng.js';

async function hero() {
    // Independent Wizard startup supplies canonical property, attribute,
    // inventory and map state. Large HP keeps nonfatal branch tests local.
    await runSegment({ seed: 1160610, datetime: '20000711120509',
        nethackrc: 'OPTIONS=name:Zhitu,role:Wizard,race:human,gender:female,align:neutral,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '' });
    for (const property of [ACID_RES, ANTIMAGIC, COLD_RES, DISINT_RES,
        FIRE_RES, POISON_RES, SHOCK_RES, SLEEP_RES])
        game.u.uprops[property] = { intrinsic: 0, extrinsic: 0 };
    game.u.uhp = game.u.uhpmax = 100;
    game.flags.sparkle = false;
    return game;
}

function scripted({ dice = 7, gate = 1, poison = 9 } = {}) {
    // Odd seven damage distinguishes C's integer half damage; gate one
    // avoids optional inventory destruction. Poison nine selects HP loss.
    const calls = [];
    return { calls,
        d: (...args) => { calls.push(['d', ...args]); return dice; },
        rn2: (bound) => { calls.push(['rn2', bound]); return bound === 15 ? poison : gate; },
        rn1: (...args) => { calls.push(['rn1', ...args]); return 9; },
        rnd: (bound) => { calls.push(['rnd', bound]); return 1; },
    };
}

const quiet = { planning: true, message: async () => {}, statusRefresh: () => {} };

test('zhitu translates every beam type and shared losehp tail in source order', async () => {
    // ZT enum is missile, fire, cold, sleep, death, lightning, poison, acid.
    const rows = [
        [0, 93, [['d', 2, 6], ['rn2', 2]]],
        [1, 93, [['d', 2, 6], ['rn2', 5], ['rn2', 3], ['rn2', 3]]],
        [2, 93, [['d', 2, 6], ['rn2', 3]]],
        [3, 100, [['d', 2, 25]]],
        [4, 100, []],
        [5, 93, [['d', 2, 6], ['rn2', 2], ['rn2', 3]]],
        [6, 91, [['rn2', 15], ['rn1', 10, 6]]],
        [7, 93, [['d', 2, 6], ['rn2', 2], ['rn2', 6], ['rn2', 6]]],
    ];
    for (const [type, hp, calls] of rows) {
        const state = await hero();
        if (type === 4) state.u.uprops[ANTIMAGIC].intrinsic = FROMOUTSIDE;
        const random = scripted();
        await zhitu(type, 2, 'ray', state.u.ux, state.u.uy, state, random, quiet);
        assert.equal(state.u.uhp, hp, `beam ${type}`);
        assert.deepEqual(random.calls, calls, `beam ${type}`);
        assert.equal(state.disp.botl, true, 'even zero damage enters losehp');
        if (type === 3) {
            assert.equal(state.multi, -7, 'sleep duration comes from d(nd,25)');
            assert.equal(state.multi_reason, 'sleeping');
            assert.equal(state.u.usleep, state.moves);
        }
    }
});

test('resistance suppresses only the source damage and retains mandatory draws', async () => {
    const rows = [
        [0, ANTIMAGIC, [], 'The missiles bounce off!'],
        [1, FIRE_RES, [['d', 2, 6], ['rn2', 5], ['rn2', 3], ['rn2', 3]], "You don't feel hot!"],
        [2, COLD_RES, [['d', 2, 6], ['rn2', 3]], "You don't feel cold."],
        [3, SLEEP_RES, [], "You don't feel sleepy."],
        [4, ANTIMAGIC, [], "You aren't affected."],
        [5, SHOCK_RES, [['d', 2, 6], ['rn2', 3]], "You aren't affected."],
        [6, POISON_RES, [], "The poison doesn't seem to affect you."],
        [7, ACID_RES, [['rn2', 6], ['rn2', 6]], "The acid doesn't hurt."],
    ];
    for (const [type, property, calls, message] of rows) {
        const state = await hero();
        state.u.uprops[property].extrinsic = FROMOUTSIDE;
        const random = scripted();
        const messages = [];
        await zhitu(type, 2, 'ray', state.u.ux, state.u.uy, state, random,
            { ...quiet, message: async (line) => messages.push(line) });
        assert.equal(state.u.uhp, 100);
        assert.deepEqual(random.calls, calls);
        assert.ok(messages.includes(message), `beam ${type}`);
    }
});

test('fatal death rays hand off exact killer and grave state without losehp', async () => {
    // Both positive and negative breath types are fatal, but only -24
    // suppresses the corpse. Direct death does not subtract hit points.
    for (const type of [4, -34, 24, -24]) {
        const state = await hero();
        state.uarmc = state.uarmu = state.uarm = state.uarms = null;
        const random = scripted();
        await assert.rejects(() => zhitu(type, 2, 'death ray', 1, 1,
            state, random, quiet), (error) => {
            assert.ok(error instanceof HeroDeathPlanningError);
            assert.equal(error.killerName, 'death ray');
            assert.equal(error.killerFormat, KILLED_BY_AN);
            assert.equal(error.fromMonster, type < 0);
            return true;
        });
        assert.equal(state.u.ugrave_arise, type === -24 ? -3 : NON_PM);
        assert.equal(state.u.uhp, 100);
        assert.deepEqual(random.calls, []);
    }
});

test('disintegration tests inventory protection before personal resistance', async () => {
    const state = await hero();
    state.u.uprops[DISINT_RES].extrinsic = W_ARM;
    const random = scripted({ gate: 99 }); // 99 misses 99% inventory protection.
    await zhitu(-24, 2, 'blast', 1, 1, state, random, quiet);
    assert.deepEqual(random.calls, [['rn2', 100]]);
    assert.equal(state.u.uhp, 100);
});

test('unprotected disintegration armor removal crosses the live input seam', async () => {
    const state = await hero();
    // Shield takes priority even with a suit and cloak; no inner slot runs.
    state.uarms = { o_id: 116 };
    state.uarm = { o_id: 117 };
    const boundary = new Error('live armor removal');
    const operations = [];
    await assert.rejects(() => zhitu(-24, 2, 'blast', 1, 1, state, scripted(), {
        ...quiet, requestPlanningInput: (operation) => {
            operations.push(operation); throw boundary;
        },
    }), (error) => error === boundary);
    assert.deepEqual(operations, ['do_wear.c disintegrate_arm']);
    assert.equal(state.uarms.o_id, 116);
    assert.equal(state.killer?.name ?? '', '');
});

test('golem healing on resistant fire/lightning uses clone-owned RNG', async () => {
    for (const [type, property, form] of [
        [1, FIRE_RES, PM_IRON_GOLEM], [5, SHOCK_RES, PM_FLESH_GOLEM],
    ]) {
        const state = await hero();
        state.u.umonnum = form;
        state.u.umonster = PM_HUMAN;
        state.youmonst.data = state.mons[form];
        state.u.mh = 20; state.u.mhmax = 40;
        state.u.uprops[property].intrinsic = FROMOUTSIDE;
        enableRngLog();
        const before = getRngLog().slice();
        await zhitu(type, 2, 'ray', 1, 1, state, scripted(), quiet);
        assert.equal(state.u.mh, type === 1 ? 27 : 22);
        assert.deepEqual(getRngLog(), before, 'planning touches no live RNG');
    }
});

test('poison blast halves HP loss only for a worn wet towel', async () => {
    for (const wetness of [0, 1]) {
        const state = await hero();
        state.ublindf = { otyp: TOWEL, spe: wetness };
        await zhitu(26, 2, 'gas', 1, 1, state, scripted(), quiet);
        assert.equal(state.u.uhp, wetness ? 95 : 91);
    }
});


test('production elapsed preflight carries direct ray death without live writes', async () => {
    const state = await hero();
    for (const column of state.level.monsters) column.fill(null);
    state.level.monlist = null;
    state.u.umovement = 0;
    state.uarmc = state.uarmu = state.uarm = state.uarms = null;
    state.killer = { name: 'previous cause', format: KILLED_BY_AN };
    const snapshot = {
        killer: { ...state.killer }, grave: state.u.ugrave_arise,
        hp: state.u.uhp, queue: state.nhDisplay.inputQueueLength,
        grid: structuredClone(state.nhDisplay.grid),
    };
    enableRngLog();
    const rngBefore = getRngLog().slice();
    const result = await preflightSimpleMonsterActions(state, {
        consumeHeroRation: false,
        advanceRound: async (planned, random) => {
            await zhitu(-24, 2, 'blast of disintegration', planned.u.ux,
                planned.u.uy, planned, random, quiet);
        },
    });
    assert.deepEqual(result.heroDeath, {
        monsterId: null, how: DIED, killerName: 'blast of disintegration',
        killerFormat: KILLED_BY_AN, fromMonster: true,
    });
    assert.deepEqual(state.killer, snapshot.killer);
    assert.equal(state.u.ugrave_arise, snapshot.grave);
    assert.equal(state.u.uhp, snapshot.hp);
    assert.equal(state.nhDisplay.inputQueueLength, snapshot.queue);
    assert.deepEqual(state.nhDisplay.grid, snapshot.grid);
    assert.deepEqual(getRngLog(), rngBefore);
});

test('ubreatheu forwards its caller environment into poison gas', async () => {
    const state = await hero();
    const random = scripted();
    await ubreatheu({ adtyp: AD_DRST, damn: 2 }, state, random, quiet);
    assert.equal(state.u.uhp, 91);
    assert.deepEqual(random.calls, [['rn2', 15], ['rn1', 10, 6]]);
});


test('monster breath reaches planned direct death through dobuzz and zhitu', async () => {
    const state = await hero();
    state.uarmc = state.uarmu = state.uarm = state.uarms = null;
    for (const column of state.level.monsters) column.fill(null);
    state.level.monlist = null;
    state.u.umovement = 0;
    const random = scripted();
    const oldKiller = structuredClone(state.killer);
    const result = await preflightSimpleMonsterActions(state, {
        consumeHeroRation: false,
        advanceRound: async (planned) => {
            // Three squares separate attacker and hero: a genuine directed
            // beam traverses floor before zap_hit() selects the hero.
            const dragon = newMonster({ data: planned.mons[PM_BLACK_DRAGON],
                mnum: PM_BLACK_DRAGON, m_id: 116,
                mx: planned.u.ux - 3, my: planned.u.uy,
                mux: planned.u.ux, muy: planned.u.uy,
                mcansee: true, mcanmove: true, m_lev: 15,
                mhp: 80, mhpmax: 80,
            });
            for (let x = dragon.mx; x <= planned.u.ux; ++x) {
                planned.level.at(x, dragon.my).typ = ROOM;
                planned.level.at(x, dragon.my).doormask = 0;
            }
            await breamm(dragon, dragon.data.mattk[0], planned.youmonst, {
                state: planned, random, ...quiet,
            });
        },
    });
    assert.equal(result.heroDeath?.killerName, 'blast of disintegration');
    assert.equal(result.heroDeath?.fromMonster, true);
    // linedup()'s boulder fallback draws rn2(2) before the breath gate.
    assert.deepEqual(random.calls, [['rn2', 2], ['rn2', 3],
        ['rn1', 7, 7], ['rn2', 20]]);
    assert.deepEqual(state.killer, oldKiller);
});


test('a cold ray shattered-potion death retains the planner environment', async () => {
    const state = await hero();
    // Cold resistance suppresses ray damage, but C still applies rnd(4)
    // shattered-potion damage. One HP and rnd(4)=1 make this fatal.
    state.u.uprops[COLD_RES].intrinsic = FROMOUTSIDE;
    state.u.uhp = 1;
    state.invent = mksobj(POT_BOOZE, false, false, { state });
    state.invent.quan = 1;
    state.invent.where = OBJ_INVENT;
    state.invent.nobj = null;
    const random = scripted({ gate: 0, dice: 5 });
    await assert.rejects(() => zhitu(2, 1, 'bolt of cold', 1, 1,
        state, random, quiet), (error) => {
        assert.ok(error instanceof HeroDeathPlanningError, error.stack);
        assert.equal(error.killerName, 'shattered potion');
        return true;
    });
    assert.equal(state.u.uhp, 0);
    assert.deepEqual(random.calls, [
        ['d', 1, 6], ['rn2', 3], ['rn2', 5], ['rnd', 4], ['rn2', 3],
    ]);
});
