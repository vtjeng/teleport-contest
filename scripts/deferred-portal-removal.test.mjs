import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAGIC_PORTAL,
    PIT,
    UTOTYPE_NONE,
    UTOTYPE_PORTAL,
    UTOTYPE_RMPORTAL,
} from '../js/const.js';
import { deferred_goto } from '../js/do.js';
import { GameMap } from '../js/game.js';

// C quest.c:expulsion() schedules UTOTYPE_RMPORTAL when the Quest is sealed.
// do.c:deferred_goto() completes the level change, then deletes the trap at
// the arrival square. The injected transition models only that completed
// goto_level boundary; all portal removal remains under test in deferred_goto.
function scheduledExpulsion(removePortal, trapAtArrival = true) {
    const destination = { dnum: 0, dlevel: 2 };
    const state = {
        u: {
            uz: { dnum: 1, dlevel: 1 },
            utolev: destination,
            utotype: UTOTYPE_PORTAL
                | (removePortal ? UTOTYPE_RMPORTAL : 0),
            ux: 4,
            uy: 4,
        },
        gd: { dfr_pre_msg: null, dfr_post_msg: null },
        level: new GameMap(),
        program_state: { gameover: false },
    };
    const arrivedLevel = new GameMap();
    const portal = { tx: 10, ty: 10, ttyp: MAGIC_PORTAL };
    const unrelated = { tx: 11, ty: 10, ttyp: PIT };
    arrivedLevel.traps = trapAtArrival
        ? [portal, unrelated] : [unrelated];
    const events = [];
    const env = {
        async gotoLevel(dest, stairs, falling, viaPortal, target) {
            assert.deepEqual(dest, destination);
            assert.deepEqual([stairs, falling, viaPortal], [false, false, true]);
            assert.equal(target, state);
            events.push('level change');
            state.level = arrivedLevel;
            state.u.uz = { ...destination };
            state.u.ux = 10;
            state.u.uy = 10;
            state.u.utotype = UTOTYPE_NONE;
        },
        newsym(x, y) {
            events.push(['redraw', x, y]);
        },
    };
    return { state, arrivedLevel, portal, unrelated, events, env };
}

test('sealed Quest expulsion removes only the destination portal after arrival',
    async () => {
        const { state, arrivedLevel, unrelated, events, env }
            = scheduledExpulsion(true);
        await deferred_goto(state, env);
        assert.deepEqual(arrivedLevel.traps, [unrelated]);
        assert.deepEqual(events, ['level change', ['redraw', 10, 10]]);
        assert.equal(state.u.utotype, UTOTYPE_NONE);
        assert.deepEqual(state.gd, {
            dfr_pre_msg: null,
            dfr_post_msg: null,
        });
    });

test('ordinary portal arrival and a portal-free sealed arrival preserve traps',
    async () => {
        const ordinary = scheduledExpulsion(false);
        await deferred_goto(ordinary.state, ordinary.env);
        assert.deepEqual(ordinary.arrivedLevel.traps,
            [ordinary.portal, ordinary.unrelated]);
        assert.deepEqual(ordinary.events, ['level change']);

        const noPortal = scheduledExpulsion(true, false);
        await deferred_goto(noPortal.state, noPortal.env);
        assert.deepEqual(noPortal.arrivedLevel.traps, [noPortal.unrelated]);
        assert.deepEqual(noPortal.events, ['level change']);
    });
