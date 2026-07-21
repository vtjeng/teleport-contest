import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BURN_OBJECT,
    LS_MONSTER,
    LS_NONE,
    LS_OBJECT,
    NUM_LS_SOURCES,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    ROT_CORPSE,
    TIMER_OBJECT,
} from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import {
    UnsupportedLightOperationError,
    candle_light_range,
    del_light_source,
    light_globals_init,
} from '../js/light.js';
import {
    BRASS_LANTERN,
    OIL_LAMP,
    TALLOW_CANDLE,
    WAX_CANDLE,
} from '../js/objects.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    UnsupportedBurnObjectError,
    UnsupportedTimerCleanupError,
    begin_burn,
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

function burnState(moves = 10) {
    const state = {
        moves,
        gl: { retained: true },
        gt: { retained: true },
        svt: { retained: true },
        u: { ux: 4, uy: 5 },
    };
    timeout_globals_init(state);
    light_globals_init(state);
    return state;
}

function candle(otyp, overrides = {}) {
    return {
        otyp,
        // Quantity one exercises the minimum ordinary-candle radius of two.
        quan: 1,
        // Age 200 is a freshly generated tallow candle's fuel amount.
        age: 200,
        spe: 1,
        lamplit: false,
        timed: 0,
        where: OBJ_FLOOR,
        ox: 7,
        oy: 8,
        ...overrides,
    };
}

function timers(state) {
    const result = [];
    for (let current = state.gt.timer_base; current; current = current.next)
        result.push(current);
    return result;
}

test('light and timeout globals reset their source-owned heads', () => {
    const state = burnState();
    assert.equal(state.gl.retained, true);
    assert.equal(state.gt.retained, true);
    assert.equal(state.svt.retained, true);
    assert.equal(state.gl.light_base, null);
    assert.equal(state.gt.timer_base, null);
    assert.deepEqual(
        [LS_NONE, LS_OBJECT, LS_MONSTER, NUM_LS_SOURCES],
        [0, 1, 2, 3],
    );
});

test('fresh tallow and wax candles schedule their first warning segment', () => {
    const cases = [
        {
            otyp: TALLOW_CANDLE,
            // Fresh tallow fuel is 20 turns times its cost of 10.
            age: 200,
            // A single candle uses the minimum light radius.
            quan: 1,
            delay: 125,
            radius: 2,
        },
        {
            otyp: WAX_CANDLE,
            // Fresh wax fuel is 20 turns times its cost of 20.
            age: 400,
            // Nine candles cross the radius-four square threshold.
            quan: 9,
            delay: 325,
            radius: 4,
        },
    ];

    for (const entry of cases) {
        const state = burnState(10);
        const obj = candle(entry.otyp, {
            age: entry.age,
            quan: entry.quan,
            // A conspicuous value verifies begin_burn leaves candle spe alone.
            spe: -3,
        });

        begin_burn(obj, false, { state });

        assert.equal(obj.age, 75);
        assert.equal(obj.spe, -3);
        assert.equal(obj.quan, entry.quan);
        assert.equal(obj.lamplit, true);
        assert.equal(obj.timed, 1);
        assert.equal(peek_timer(BURN_OBJECT, obj, state), 10 + entry.delay);
        assert.deepEqual(
            timers(state).map(({ timeout, kind, func_index, arg }) => (
                [timeout, kind, func_index, arg]
            )),
            [[10 + entry.delay, TIMER_OBJECT, BURN_OBJECT, obj]],
        );
        assert.deepEqual(state.gl.light_base, {
            next: null,
            x: 7,
            y: 8,
            range: entry.radius,
            type: LS_OBJECT,
            id: obj,
            flags: 0,
        });
        assert.equal(state.vision_full_recalc, 1);
    }
});

test('begin_burn consumes no core PRNG draws', () => {
    const state = resetGame();
    state.moves = 1;
    state.u = { ux: 4, uy: 5 };
    timeout_globals_init(state);
    light_globals_init(state);
    initRng(0x5eed);
    enableRngLog();

    begin_burn(candle(TALLOW_CANDLE), false, { state: game });

    assert.deepEqual(getRngLog(), []);
});

test('candle warning boundaries preserve the source timer arithmetic', () => {
    const cases = [
        // One turn above 75 schedules just enough fuel to reach 75.
        { age: 76, delay: 1, remaining: 75 },
        // At 75, the next warning boundary is 15.
        { age: 75, delay: 60, remaining: 15 },
        // One turn above 15 schedules just enough fuel to reach 15.
        { age: 16, delay: 1, remaining: 15 },
        // At or below 15, the whole remaining age is scheduled.
        { age: 15, delay: 15, remaining: 0 },
        { age: 1, delay: 1, remaining: 0 },
    ];

    for (const entry of cases) {
        const state = burnState(40);
        const obj = candle(WAX_CANDLE, { age: entry.age, quan: 3, spe: 6 });
        begin_burn(obj, false, { state });
        assert.equal(peek_timer(BURN_OBJECT, obj, state), 40 + entry.delay);
        assert.equal(obj.age, entry.remaining);
        assert.equal(obj.spe, 6);
        assert.equal(obj.quan, 3);
    }

    const exhaustedState = burnState(40);
    const exhausted = candle(TALLOW_CANDLE, { age: 0, spe: 5, quan: 2 });
    begin_burn(exhausted, false, { state: exhaustedState });
    assert.equal(exhausted.age, 0);
    assert.equal(exhausted.spe, 5);
    assert.equal(exhausted.quan, 2);
    assert.equal(exhausted.lamplit, false);
    assert.equal(exhausted.timed, 0);
    assert.equal(exhaustedState.gt.timer_base, null);
    assert.equal(exhaustedState.gl.light_base, null);
});

test('ordinary candle stack radius changes only at square thresholds', () => {
    const cases = [
        // 1..3 candles have minimum radius two.
        [1, 2], [3, 2],
        // 4..8 candles have radius three.
        [4, 3], [8, 3],
        // 9..15 candles have radius four.
        [9, 4], [15, 4],
        // Sixteen candles cross the next square threshold.
        [16, 5],
        // Radius is capped at the source MAX_RADIUS value of 15.
        [225, 15],
    ];
    for (const otyp of [TALLOW_CANDLE, WAX_CANDLE]) {
        for (const [quan, expected] of cases)
            assert.equal(candle_light_range(candle(otyp, { quan })), expected);
    }
});

test('already-lit continuation keeps its existing light and adds only a timer', () => {
    const state = burnState(30);
    const obj = candle(WAX_CANDLE, {
        // Age 75 continues to the next warning at age 15.
        age: 75,
        // Four candles give the pre-existing source radius three.
        quan: 4,
        lamplit: true,
    });
    begin_burn(obj, false, { state });
    const source = state.gl.light_base;

    // Model burn_object() consuming the old timer while retaining the source.
    state.gt.timer_base = null;
    obj.timed = 0;
    obj.age = 75;
    state.vision_full_recalc = 0;
    begin_burn(obj, true, { state });

    assert.equal(obj.age, 15);
    assert.equal(obj.lamplit, true);
    assert.equal(obj.timed, 1);
    assert.equal(peek_timer(BURN_OBJECT, obj, state), 90);
    assert.equal(state.gl.light_base, source);
    assert.equal(source.next, null);
    assert.equal(state.vision_full_recalc, 0);
});

test('equal-expiry burn timer is inserted before the older queue entry', () => {
    const state = burnState(20);
    const older = { timed: 0 };
    // Both timers expire at move 21; the later insertion must be first.
    start_timer(1, TIMER_OBJECT, ROT_CORPSE, older, state);
    const obj = candle(TALLOW_CANDLE, { age: 16 });
    begin_burn(obj, false, { state });

    assert.deepEqual(
        timers(state).map(({ timeout, func_index, arg }) => (
            [timeout, func_index, arg]
        )),
        [
            [21, BURN_OBJECT, obj],
            [21, ROT_CORPSE, older],
        ],
    );
});

test('object light deletion follows identity and preserves other owners', () => {
    const state = burnState();
    const tallow = candle(TALLOW_CANDLE, { ox: 2, oy: 3 });
    const wax = candle(WAX_CANDLE, { ox: 6, oy: 7 });
    begin_burn(tallow, false, { state });
    begin_burn(wax, false, { state });
    const tallowSource = state.gl.light_base.next;
    assert.equal(state.gl.light_base.id, wax);
    assert.equal(tallowSource.id, tallow);

    state.vision_full_recalc = 0;
    del_light_source(LS_OBJECT, wax, state);

    assert.equal(state.gl.light_base, tallowSource);
    assert.equal(tallowSource.next, null);
    assert.equal(state.vision_full_recalc, 1);
});

test('oil lamps and brass lanterns use every source warning boundary', () => {
    const boundaries = [
        // Each pair covers one turn above a source threshold, then equality;
        // equality advances to the next warning segment rather than zero.
        { age: 151, delay: 1, remaining: 150 },
        { age: 150, delay: 50, remaining: 100 },
        { age: 101, delay: 1, remaining: 100 },
        { age: 100, delay: 50, remaining: 50 },
        { age: 51, delay: 1, remaining: 50 },
        { age: 50, delay: 25, remaining: 25 },
        { age: 26, delay: 1, remaining: 25 },
        { age: 25, delay: 25, remaining: 0 },
    ];

    for (const otyp of [OIL_LAMP, BRASS_LANTERN]) {
        for (const { age, delay, remaining } of boundaries) {
            const state = burnState();
            const lamp = candle(otyp, { age });
            begin_burn(lamp, false, { state });

            assert.equal(lamp.age, remaining, `${otyp} age ${age}`);
            assert.equal(lamp.lamplit, true, `${otyp} age ${age}`);
            assert.equal(lamp.timed, 1, `${otyp} age ${age}`);
            assert.equal(
                peek_timer(BURN_OBJECT, lamp, state),
                10 + delay,
                `${otyp} age ${age}`,
            );
            assert.equal(state.gl.light_base.range, 3, `${otyp} age ${age}`);
            assert.equal(state.gl.light_base.id, lamp, `${otyp} age ${age}`);
        }
    }
});

test('unsupported burn and light paths fail before claiming ownership', () => {
    const state = burnState();
    const unsupported = candle(-1);
    assert.throws(
        () => begin_burn(unsupported, false, { state }),
        (error) => error instanceof UnsupportedBurnObjectError
            && error.otyp === -1,
    );
    assert.equal(state.gt.timer_base, null);
    assert.equal(state.gl.light_base, null);

    assert.throws(
        () => del_light_source(LS_MONSTER, {}, state),
        (error) => error instanceof UnsupportedLightOperationError,
    );
});

test('begin_burn refreshes carried candle state before creating its light', () => {
    const state = burnState(10);
    state.iflags = { perm_invent: true, suppress_price: 7 };
    state.program_state = { in_moveloop: 1 };
    const obj = candle(TALLOW_CANDLE, { where: OBJ_INVENT });
    let refreshes = 0;

    begin_burn(obj, false, {
        state,
        hooks: {
            updateInventory(currentState) {
                ++refreshes;
                assert.equal(currentState, state);
                assert.equal(currentState.iflags.suppress_price, 0);
                assert.equal(currentState.gl.light_base, null);
                assert.equal(obj.age, 75);
                assert.equal(obj.lamplit, true);
                assert.equal(obj.timed, 1);
            },
        },
    });

    assert.equal(refreshes, 1);
    assert.equal(state.iflags.suppress_price, 7);
    assert.deepEqual(
        [state.gl.light_base.x, state.gl.light_base.y],
        // A carried light is attached to the hero's current coordinates.
        [4, 5],
    );
});

test('begin_burn preflights live integration before claiming ownership', () => {
    const cases = [
        {
            name: 'a free candle has no map position',
            state: burnState(),
            obj: candle(TALLOW_CANDLE, { where: OBJ_FREE }),
            run(state, obj) {
                assert.throws(
                    () => begin_burn(obj, false, { state }),
                    /can't get object position/,
                );
            },
        },
        {
            name: 'permanent inventory requires its display hook',
            state: Object.assign(burnState(), {
                iflags: { perm_invent: true },
                program_state: { in_moveloop: 1 },
            }),
            obj: candle(WAX_CANDLE, { where: OBJ_INVENT }),
            run(state, obj) {
                assert.throws(
                    () => begin_burn(obj, false, { state }),
                    (error) => error instanceof UnsupportedTimerCleanupError
                        && error.operation === 'updateInventory',
                );
            },
        },
        {
            name: 'the light-source globals must be initialized',
            state: (() => {
                const state = burnState();
                delete state.gl.light_base;
                return state;
            })(),
            obj: candle(TALLOW_CANDLE),
            run(state, obj) {
                assert.throws(
                    () => begin_burn(obj, false, { state }),
                    /light_globals_init/,
                );
            },
        },
    ];

    for (const { name, state, obj, run } of cases) {
        const original = {
            age: obj.age,
            lamplit: obj.lamplit,
            timed: obj.timed,
            timerId: state.svt.timer_id,
        };
        run(state, obj);
        assert.deepEqual(
            {
                age: obj.age,
                lamplit: obj.lamplit,
                timed: obj.timed,
                timerId: state.svt.timer_id,
            },
            original,
            name,
        );
        assert.equal(state.gt.timer_base, null, name);
        assert.equal(state.gl.light_base ?? null, null, name);
    }
});
