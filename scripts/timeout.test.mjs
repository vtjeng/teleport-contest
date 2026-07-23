import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BURN_OBJECT,
    FIG_TRANSFORM,
    HATCH_EGG,
    NUM_TIME_FUNCS,
    NUM_TIMER_KINDS,
    OBJ_FREE,
    OBJ_INVENT,
    REVIVE_MON,
    ROT_CORPSE,
    SHRINK_GLOB,
    TIMER_NONE,
    TIMER_LEVEL,
    TIMER_OBJECT,
    ZOMBIFY_MON,
} from '../js/const.js';
import {
    PM_DEATH,
    PM_FAMINE,
    PM_KOBOLD,
    PM_LICHEN,
    PM_LIZARD,
    PM_TROLL,
    monst_globals_init,
} from '../js/monsters.js';
import {
    UnsupportedTimerCleanupError,
    attach_egg_hatch_timeout,
    attach_fig_transform_timeout,
    nh_timeout_fresh_turn,
    obj_has_timer,
    obj_stop_timers,
    peek_timer,
    spot_stop_timers,
    start_timer,
    start_glob_timeout,
    start_corpse_timeout,
    stop_timer,
    timeout_globals_init,
} from '../js/timeout.js';

function timerState(moves = 10) {
    const state = { moves, gt: { other: true }, svt: { other: true } };
    timeout_globals_init(state);
    return state;
}

function monsterTimerState(moves = 1) {
    const state = timerState(moves);
    monst_globals_init(state);
    return state;
}

function queue(state) {
    const result = [];
    for (let timer = state.gt.timer_base; timer; timer = timer.next)
        result.push(timer);
    return result;
}

test('timeout globals reset source-owned fields without replacing owners', () => {
    const state = timerState();
    assert.equal(state.gt.other, true);
    assert.equal(state.svt.other, true);
    assert.equal(state.gt.timer_base, null);
    assert.equal(state.svt.timer_id, 1);
});

test('fresh-turn timeout upkeep admits only source-inert timeout state', () => {
    const state = timerState(2);
    state.u = {
        uinvulnerable: false,
        mtimedone: 0,
        ucreamed: 0,
        usptime: 0,
        ugallop: 0,
        uprops: [{ intrinsic: 0 }, { intrinsic: 0x01000000 }],
    };
    start_timer(100, TIMER_OBJECT, ROT_CORPSE, { timed: 0 }, state);
    assert.doesNotThrow(() => nh_timeout_fresh_turn(state));

    state.u.uprops[0].intrinsic = 3;
    assert.throws(
        () => nh_timeout_fresh_turn(state),
        /no active property timeout at index 0/u,
    );
    state.u.uprops[0].intrinsic = 0;
    state.gt.timer_base.timeout = 2;
    assert.throws(
        () => nh_timeout_fresh_turn(state),
        /no timer due by move 2/u,
    );
});

test('fresh-turn timeout upkeep preserves invulnerability short circuit', () => {
    const state = timerState(2);
    state.u = { uinvulnerable: true, mtimedone: 5, uprops: [] };
    assert.doesNotThrow(() => nh_timeout_fresh_turn(state));
});

test('start_timer orders expiries and puts equal expiries newest first', () => {
    const state = timerState(20);
    const later = { timed: 0 };
    const equalOld = { timed: 0 };
    const sooner = { timed: 0 };
    const equalNew = { timed: 0 };

    assert.equal(start_timer(8, TIMER_OBJECT, ROT_CORPSE, later, state), true);
    assert.equal(start_timer(5, TIMER_OBJECT, HATCH_EGG, equalOld, state), true);
    assert.equal(start_timer(2, TIMER_OBJECT, BURN_OBJECT, sooner, state), true);
    assert.equal(start_timer(5, TIMER_OBJECT, ROT_CORPSE, equalNew, state), true);

    assert.deepEqual(
        queue(state).map(({ timeout, tid, arg }) => [timeout, tid, arg]),
        [
            [22, 3, sooner],
            [25, 4, equalNew],
            [25, 2, equalOld],
            [28, 1, later],
        ],
    );
    assert.deepEqual(
        [later.timed, equalOld.timed, sooner.timed, equalNew.timed],
        [1, 1, 1, 1],
    );
});

test('duplicate object timers are rejected without consuming an id', () => {
    const state = timerState();
    const obj = { timed: 0 };
    assert.equal(start_timer(5, TIMER_OBJECT, ROT_CORPSE, obj, state), true);
    assert.equal(start_timer(7, TIMER_OBJECT, ROT_CORPSE, obj, state), false);
    assert.equal(state.svt.timer_id, 2);
    assert.equal(obj.timed, 1);
    assert.equal(peek_timer(ROT_CORPSE, obj, state), 15);
});

test('stop_timer returns remaining time and decrements object count', () => {
    const state = timerState(4);
    const obj = { timed: 0 };
    start_timer(9, TIMER_OBJECT, HATCH_EGG, obj, state);
    state.moves = 7;
    assert.equal(stop_timer(HATCH_EGG, obj, state), 6);
    assert.equal(obj.timed, 0);
    assert.equal(stop_timer(HATCH_EGG, obj, state), 0);
});

test('obj_stop_timers removes all and only the target object timers', () => {
    const state = timerState();
    const target = { timed: 0 };
    const other = { timed: 0 };
    start_timer(5, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(6, TIMER_OBJECT, HATCH_EGG, target, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, other, state);

    obj_stop_timers(target, state);
    assert.equal(target.timed, 0);
    assert.equal(other.timed, 1);
    assert.equal(obj_has_timer(target, ROT_CORPSE, state), false);
    assert.equal(obj_has_timer(target, HATCH_EGG, state), false);
    assert.equal(obj_has_timer(other, ROT_CORPSE, state), true);
});

test('spot_stop_timers removes only the matching packed-coordinate timer', () => {
    const state = timerState();
    const target = 3 * 0x10000 + 4;
    const other = 4 * 0x10000 + 3;
    start_timer(5, TIMER_LEVEL, REVIVE_MON, target, state);
    start_timer(6, TIMER_LEVEL, ROT_CORPSE, target, state);
    start_timer(7, TIMER_LEVEL, REVIVE_MON, other, state);

    spot_stop_timers(3, 4, REVIVE_MON, state);

    assert.deepEqual(
        queue(state).map(({ func_index, arg }) => [func_index, arg]),
        [
            [ROT_CORPSE, target],
            [REVIVE_MON, other],
        ],
    );
});

test('start_timer validates the numeric source enum ranges', () => {
    const state = timerState();
    assert.throws(
        () => start_timer(1, TIMER_NONE, ROT_CORPSE, {}, state),
        /invalid timer kind/,
    );
    assert.throws(
        () => start_timer(1, NUM_TIMER_KINDS, ROT_CORPSE, {}, state),
        /invalid timer kind/,
    );
    assert.throws(
        () => start_timer(1, TIMER_OBJECT, NUM_TIME_FUNCS, {}, state),
        /invalid timer function/,
    );
});

test('queue operations fail closed when early initialization was skipped', () => {
    assert.throws(
        () => start_timer(1, TIMER_OBJECT, ROT_CORPSE, {}, {}),
        /timeout_globals_init/,
    );
});

test('egg hatch timing preserves the per-age rnd bounds', () => {
    const state = timerState(1);
    const egg = { timed: 0 };
    const bounds = [];
    attach_egg_hatch_timeout(egg, 0, {
        state,
        random: {
            rn2: () => assert.fail('egg hatch timing does not use rn2'),
            rnd: (bound) => {
                bounds.push(bound);
                return bound === 153 ? 151 : 150;
            },
        },
    });
    assert.deepEqual(bounds, [151, 152, 153]);
    assert.equal(peek_timer(HATCH_EGG, egg, state), 154);
    assert.equal(egg.timed, 1);
});

test('explicit egg hatch timing replaces the old timer without a draw', () => {
    const state = timerState(5);
    const egg = { timed: 0 };
    start_timer(20, TIMER_OBJECT, HATCH_EGG, egg, state);
    attach_egg_hatch_timeout(egg, 7, {
        state,
        random: {
            rn2: () => assert.fail('explicit hatch delay does not draw'),
            rnd: () => assert.fail('explicit hatch delay does not draw'),
        },
    });
    assert.equal(peek_timer(HATCH_EGG, egg, state), 12);
    assert.equal(egg.timed, 1);
});

test('failed egg hatch search removes the old timer across all 50 bounds', () => {
    const state = timerState(5);
    const egg = { timed: 0 };
    start_timer(20, TIMER_OBJECT, HATCH_EGG, egg, state);
    const bounds = [];
    attach_egg_hatch_timeout(egg, 0, {
        state,
        random: {
            rn2: () => assert.fail('egg hatch timing does not use rn2'),
            rnd: (bound) => {
                bounds.push(bound);
                return 150;
            },
        },
    });
    assert.deepEqual(bounds,
        Array.from({ length: 50 }, (_, index) => 151 + index));
    assert.equal(egg.timed, 0);
    assert.equal(peek_timer(HATCH_EGG, egg, state), 0);
    assert.equal(state.svt.timer_id, 2);
});

test('figurine and glob helpers preserve source delay calculations', () => {
    const state = timerState(3);
    const figurine = { timed: 0 };
    const glob = { globby: true, timed: 0 };
    attach_fig_transform_timeout(figurine, {
        state,
        random: { rn2: () => 0, rnd: (bound) => {
            assert.equal(bound, 9000);
            return 17;
        } },
    });
    start_glob_timeout(glob, 0, {
        state,
        random: { rnd: () => 1, rn2: (bound) => {
            assert.equal(bound, 5);
            return 4;
        } },
    });
    assert.equal(peek_timer(FIG_TRANSFORM, figurine, state), 220);
    assert.equal(peek_timer(SHRINK_GLOB, glob, state), 30);
});

test('ordinary corpse decay uses the source age and rnz adjustment', () => {
    const state = monsterTimerState(1);
    const body = { age: 1, corpsenm: PM_KOBOLD, timed: 0, norevive: false };
    start_corpse_timeout(body, {
        state,
        random: {
            rn1: () => assert.fail('ordinary decay does not use rn1'),
            rn2: () => assert.fail('ordinary decay does not use rn2 directly'),
            rnz: (bound) => {
                assert.equal(bound, 10);
                return 13;
            },
        },
    });
    assert.equal(peek_timer(ROT_CORPSE, body, state), 254);
});

test('level creation uses rnz(25) for corpse decay', () => {
    const state = monsterTimerState(1);
    state.in_mklev = true;
    const body = { age: 1, corpsenm: PM_KOBOLD, timed: 0, norevive: false };
    start_corpse_timeout(body, {
        state,
        random: {
            rn1: () => assert.fail('ordinary decay does not use rn1'),
            rn2: () => assert.fail('ordinary decay does not use rn2 directly'),
            rnz: (bound) => {
                assert.equal(bound, 25);
                return bound;
            },
        },
    });
    assert.equal(peek_timer(ROT_CORPSE, body, state), 251);
});

test('Rider revival consumes ordinary decay randomness before its loop', () => {
    const state = monsterTimerState(1);
    const body = { age: 1, corpsenm: PM_DEATH, timed: 0, norevive: false };
    const calls = [];
    start_corpse_timeout(body, {
        state,
        random: {
            rn1: () => assert.fail('Rider revival does not use rn1'),
            rnz: (bound) => {
                calls.push(['rnz', bound]);
                return bound;
            },
            rn2: (bound) => {
                calls.push(['rn2', bound]);
                return calls.length === 2 ? 1 : 0;
            },
        },
    });
    assert.deepEqual(calls, [['rnz', 10], ['rn2', 3], ['rn2', 3]]);
    assert.equal(peek_timer(REVIVE_MON, body, state), 8);
});

test('troll and zombification overrides select their source timer actions', () => {
    const trollState = monsterTimerState(1);
    const troll = { age: 1, corpsenm: PM_TROLL, timed: 0, norevive: false };
    start_corpse_timeout(troll, {
        state: trollState,
        random: { rnz: (n) => n, rn2: () => 0, rn1: () => 5 },
    });
    assert.equal(peek_timer(REVIVE_MON, troll, trollState), 3);

    const zombieState = monsterTimerState(1);
    zombieState.gz = { zombify: true };
    const victim = { age: 1, corpsenm: PM_KOBOLD, timed: 0, norevive: false };
    start_corpse_timeout(victim, {
        state: zombieState,
        random: {
            rnz: (n) => n,
            rn2: () => assert.fail('zombification does not use rn2 directly'),
            rn1: (range, base) => {
                assert.deepEqual([range, base], [15, 5]);
                return 8;
            },
        },
    });
    assert.equal(peek_timer(ZOMBIFY_MON, victim, zombieState), 9);
});

test('norevive suppresses zombification after the ordinary rnz draw', () => {
    const state = monsterTimerState(1);
    state.gz = { zombify: true };
    const victim = { age: 1, corpsenm: PM_KOBOLD, timed: 0, norevive: true };
    let rnzCalls = 0;
    start_corpse_timeout(victim, {
        state,
        random: {
            rnz: (bound) => {
                ++rnzCalls;
                return bound;
            },
            rn2: () => assert.fail('ordinary corpse does not use rn2 directly'),
            rn1: () => assert.fail('norevive suppresses zombification'),
        },
    });
    assert.equal(rnzCalls, 1);
    assert.equal(peek_timer(ROT_CORPSE, victim, state), 251);
    assert.equal(peek_timer(ZOMBIFY_MON, victim, state), 0);
});

test('lizard and lichen corpses never draw or receive a timer', () => {
    for (const corpsenm of [PM_LIZARD, PM_LICHEN]) {
        const state = monsterTimerState(1);
        const body = { age: 1, corpsenm, timed: 0, norevive: false };
        start_corpse_timeout(body, {
            state,
            random: {
                rnz: () => assert.fail('nonrotting corpse does not draw'),
                rn2: () => assert.fail('nonrotting corpse does not draw'),
                rn1: () => assert.fail('nonrotting corpse does not draw'),
            },
        });
        assert.equal(state.gt.timer_base, null);
    }
});

test('Rider minimums and cap match the source loop endpoints', () => {
    for (const [corpsenm, firstDelay] of [[PM_DEATH, 6], [PM_FAMINE, 12]]) {
        const state = monsterTimerState(1);
        const body = { age: 1, corpsenm, timed: 0, norevive: false };
        start_corpse_timeout(body, {
            state,
            random: { rnz: (n) => n, rn1: () => 5, rn2: () => 0 },
        });
        assert.equal(peek_timer(REVIVE_MON, body, state), firstDelay + 1);
    }

    const cappedState = monsterTimerState(1);
    const capped = {
        age: 1,
        corpsenm: PM_FAMINE,
        timed: 0,
        norevive: false,
    };
    let draws = 0;
    start_corpse_timeout(capped, {
        state: cappedState,
        random: {
            rnz: (n) => n,
            rn1: () => 5,
            rn2: (bound) => {
                assert.equal(bound, 3);
                ++draws;
                return 1;
            },
        },
    });
    assert.equal(draws, 55);
    assert.equal(peek_timer(REVIVE_MON, capped, cappedState), 68);
});

test('timer lookup uses argument identity and intentionally ignores kind', () => {
    const state = timerState(10);
    const first = { timed: 0, value: 1 };
    const equalButDistinct = { timed: 0, value: 1 };
    start_timer(8, TIMER_OBJECT, ROT_CORPSE, first, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, equalButDistinct, state);
    assert.equal(stop_timer(ROT_CORPSE, first, state), 8);
    assert.equal(obj_has_timer(equalButDistinct, ROT_CORPSE, state), true);

    start_timer(3, TIMER_LEVEL, HATCH_EGG, first, state);
    start_timer(6, TIMER_OBJECT, HATCH_EGG, first, state);
    assert.equal(stop_timer(HATCH_EGG, first, state), 3);
    assert.equal(first.timed, 1);
    assert.equal(stop_timer(HATCH_EGG, first, state), 6);
    assert.equal(first.timed, 0);
});

test('stop_timer performs burning-object cleanup in source order', () => {
    const state = timerState(10);
    state.iflags = { perm_invent: true, suppress_price: 7 };
    state.program_state = { in_moveloop: 1 };
    const lamp = {
        // Age 40 and a seven-turn timer make five unused fuel turns remain
        // when the timer is stopped two moves later.
        age: 40,
        lamplit: true,
        timed: 0,
        where: OBJ_INVENT,
    };
    start_timer(7, TIMER_OBJECT, BURN_OBJECT, lamp, state);
    state.moves = 12;
    const calls = [];

    assert.equal(stop_timer(BURN_OBJECT, lamp, state, {
        hooks: {
            deleteObjectLightSource(obj) {
                calls.push('light');
                assert.equal(obj, lamp);
                assert.equal(obj.timed, 0);
                assert.equal(peek_timer(BURN_OBJECT, obj, state), 0);
            },
            updateInventory(currentState) {
                calls.push('inventory');
                assert.equal(currentState, state);
                assert.equal(currentState.iflags.suppress_price, 0);
                assert.equal(lamp.age, 45);
                assert.equal(lamp.lamplit, false);
            },
        },
    }), 5);

    assert.deepEqual(calls, ['light', 'inventory']);
    assert.equal(lamp.timed, 0);
    assert.equal(lamp.age, 45);
    assert.equal(lamp.lamplit, false);
    assert.equal(state.iflags.suppress_price, 7);
});

test('burn cleanup completes local state before rethrowing hook errors', () => {
    for (const failingHook of ['deleteObjectLightSource', 'updateInventory']) {
        const state = timerState(10);
        state.iflags = { perm_invent: true, suppress_price: 7 };
        state.program_state = { in_moveloop: 1 };
        const lamp = {
            age: 40,
            lamplit: true,
            timed: 0,
            where: OBJ_INVENT,
        };
        start_timer(7, TIMER_OBJECT, BURN_OBJECT, lamp, state);
        state.moves = 12;
        const failure = new Error(failingHook);
        const calls = [];

        assert.throws(
            () => stop_timer(BURN_OBJECT, lamp, state, {
                hooks: {
                    deleteObjectLightSource() {
                        calls.push('light');
                        if (failingHook === 'deleteObjectLightSource')
                            throw failure;
                    },
                    updateInventory() {
                        calls.push('inventory');
                        if (failingHook === 'updateInventory') throw failure;
                    },
                },
            }),
            (error) => error === failure,
        );
        assert.deepEqual(calls, ['light', 'inventory']);
        assert.equal(peek_timer(BURN_OBJECT, lamp, state), 0);
        assert.equal(lamp.timed, 0);
        assert.equal(lamp.age, 45);
        assert.equal(lamp.lamplit, false);
        assert.equal(state.iflags.suppress_price, 7);
    }
});

test('burn cleanup preserves the first thrown value even when it is falsy', () => {
    const state = timerState(10);
    state.iflags = { perm_invent: true, suppress_price: 7 };
    state.program_state = { in_moveloop: 1 };
    const lamp = {
        age: 40,
        lamplit: true,
        timed: 0,
        where: OBJ_INVENT,
    };
    start_timer(7, TIMER_OBJECT, BURN_OBJECT, lamp, state);
    state.moves = 12;
    const calls = [];
    let didThrow = false;
    let thrown;

    try {
        stop_timer(BURN_OBJECT, lamp, state, {
            hooks: {
                deleteObjectLightSource() {
                    calls.push('light');
                    throw false;
                },
                updateInventory() {
                    calls.push('inventory');
                    throw new Error('later inventory failure');
                },
            },
        });
    } catch (error) {
        didThrow = true;
        thrown = error;
    }
    assert.equal(didThrow, true);
    assert.equal(thrown, false);
    assert.deepEqual(calls, ['light', 'inventory']);
    assert.equal(peek_timer(BURN_OBJECT, lamp, state), 0);
    assert.equal(lamp.timed, 0);
    assert.equal(lamp.age, 45);
    assert.equal(lamp.lamplit, false);
    assert.equal(state.iflags.suppress_price, 7);
});

test('burn cleanup preflights every required seam before queue mutation', () => {
    const state = timerState(10);
    state.iflags = { perm_invent: true };
    state.program_state = { in_moveloop: 1 };
    const lamp = {
        age: 40,
        lamplit: true,
        timed: 0,
        where: OBJ_INVENT,
    };
    start_timer(5, TIMER_OBJECT, BURN_OBJECT, lamp, state);

    assert.throws(
        () => stop_timer(BURN_OBJECT, lamp, state),
        (error) => error instanceof UnsupportedTimerCleanupError
            && error.operation === 'deleteObjectLightSource',
    );
    assert.throws(
        () => stop_timer(BURN_OBJECT, lamp, state, {
            hooks: { deleteObjectLightSource() {} },
        }),
        (error) => error instanceof UnsupportedTimerCleanupError
            && error.operation === 'updateInventory',
    );
    assert.equal(lamp.timed, 1);
    assert.equal(peek_timer(BURN_OBJECT, lamp, state), 15);
    assert.equal(lamp.age, 40);
    assert.equal(lamp.lamplit, true);
});

test('burn cleanup uses the optional live inventory seam without perm_invent', () => {
    for (const active of [false, true]) {
        const state = timerState(10);
        if (active) {
            state.iflags = { perm_invent: false };
            state.program_state = { in_moveloop: 1 };
        }
        const lamp = {
            age: 40,
            lamplit: true,
            timed: 0,
            where: OBJ_INVENT,
        };
        start_timer(5, TIMER_OBJECT, BURN_OBJECT, lamp, state);

        let refreshes = 0;
        assert.equal(stop_timer(BURN_OBJECT, lamp, state, {
            hooks: {
                deleteObjectLightSource() {},
                updateInventory() { ++refreshes; },
            },
        }), 5);
        assert.equal(refreshes, active ? 1 : 0);
        assert.equal(lamp.timed, 0);
        assert.equal(lamp.age, 45);
        assert.equal(lamp.lamplit, false);
    }
});

test('obj_stop_timers preflights all cleanup before removing any timer', () => {
    const state = timerState(20);
    const target = {
        age: 30,
        lamplit: true,
        timed: 0,
        where: OBJ_FREE,
    };
    // ROT expires first, before the later BURN timer whose cleanup hook is
    // missing. Global preflight must reject without removing either timer.
    start_timer(4, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(8, TIMER_OBJECT, BURN_OBJECT, target, state);
    const timers = queue(state);

    assert.throws(
        () => obj_stop_timers(target, state),
        (error) => error instanceof UnsupportedTimerCleanupError
            && error.operation === 'deleteObjectLightSource',
    );
    assert.deepEqual(queue(state), timers);
    assert.equal(target.timed, 2);
    assert.equal(target.age, 30);
    assert.equal(target.lamplit, true);
});

test('obj_stop_timers cleans burn state and preserves unrelated queue order', () => {
    const state = timerState(20);
    const target = {
        // A five-turn burn timer stopped immediately restores all five turns.
        age: 30,
        lamplit: true,
        timed: 0,
        where: OBJ_FREE,
    };
    const firstOther = { timed: 0 };
    const secondOther = { timed: 0 };
    // Expiries interleave target and unrelated timers: BURN(target),
    // HATCH(firstOther), ROT(target), ROT(secondOther). Removing both target
    // timers must preserve the two survivors in that order.
    start_timer(8, TIMER_OBJECT, ROT_CORPSE, secondOther, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(6, TIMER_OBJECT, HATCH_EGG, firstOther, state);
    start_timer(5, TIMER_OBJECT, BURN_OBJECT, target, state);
    const survivingTimers = queue(state).filter(({ arg }) => arg !== target);
    const calls = [];

    obj_stop_timers(target, state, {
        hooks: {
            deleteObjectLightSource(obj) {
                calls.push(obj);
                assert.equal(obj.timed, 2);
            },
        },
    });

    assert.deepEqual(calls, [target]);
    assert.deepEqual(queue(state), survivingTimers);
    assert.deepEqual(queue(state).map(({ arg }) => arg), [firstOther, secondOther]);
    assert.equal(target.timed, 0);
    assert.equal(target.age, 35);
    assert.equal(target.lamplit, false);
    assert.equal(firstOther.timed, 1);
    assert.equal(secondOther.timed, 1);
});

test('obj_stop_timers finishes its sweep before rethrowing cleanup errors', () => {
    const state = timerState(20);
    const target = {
        age: 30,
        lamplit: true,
        timed: 0,
        where: OBJ_FREE,
    };
    const firstOther = { timed: 0 };
    const secondOther = { timed: 0 };
    start_timer(8, TIMER_OBJECT, ROT_CORPSE, secondOther, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(6, TIMER_OBJECT, HATCH_EGG, firstOther, state);
    start_timer(5, TIMER_OBJECT, BURN_OBJECT, target, state);
    const survivingTimers = queue(state).filter(({ arg }) => arg !== target);
    const failure = new Error('light cleanup failed');

    assert.throws(
        () => obj_stop_timers(target, state, {
            hooks: {
                deleteObjectLightSource() { throw failure; },
            },
        }),
        (error) => error === failure,
    );
    assert.deepEqual(queue(state), survivingTimers);
    assert.equal(target.timed, 0);
    assert.equal(target.age, 35);
    assert.equal(target.lamplit, false);
    assert.equal(firstOther.timed, 1);
    assert.equal(secondOther.timed, 1);
});

test('obj_stop_timers rethrows a falsy value after completing its sweep', () => {
    const state = timerState(20);
    const target = {
        age: 30,
        lamplit: true,
        timed: 0,
        where: OBJ_FREE,
    };
    const other = { timed: 0 };
    start_timer(8, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, other, state);
    start_timer(5, TIMER_OBJECT, BURN_OBJECT, target, state);
    const survivingTimers = queue(state).filter(({ arg }) => arg !== target);
    let didThrow = false;
    let thrown;

    try {
        obj_stop_timers(target, state, {
            hooks: {
                deleteObjectLightSource() { throw undefined; },
            },
        });
    } catch (error) {
        didThrow = true;
        thrown = error;
    }
    assert.equal(didThrow, true);
    assert.equal(thrown, undefined);
    assert.deepEqual(queue(state), survivingTimers);
    assert.equal(target.timed, 0);
    assert.equal(target.age, 35);
    assert.equal(target.lamplit, false);
    assert.equal(other.timed, 1);
});
