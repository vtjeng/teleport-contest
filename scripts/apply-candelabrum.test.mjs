import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BLINDED, OBJ_INVENT } from '../js/const.js';
import { use_candelabrum } from '../js/apply.js';
import { game, resetGame } from '../js/gstate.js';
import {
    CANDELABRUM_OF_INVOCATION,
    TALLOW_CANDLE,
    WAX_CANDLE,
    objects_globals_init,
} from '../js/objects.js';
import { init_objects } from '../js/o_init.js';
import { runSegment } from '../js/jsmain.js';
import { light_globals_init } from '../js/light.js';
import { timeout_globals_init } from '../js/timeout.js';

const APPLY_C = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const LightAndSnuffRecipe = JSON.parse(readFileSync(new URL(
    '../recipes/apply.c/candelabrum-light-and-snuff-independent-b60.session.json',
    import.meta.url,
), 'utf8'));

function candelabrumState({ blind = false, underwater = false, swallowed = false } = {}) {
    const state = resetGame();
    state.youmonst = { data: { pmidx: 0, mflags1: 0, mflags2: 0 } };
    state.u = {
        // This interior square is an ordinary non-invocation location unless
        // the focused invocation test below configures the matching level.
        ux: 5,
        uy: 5,
        uz: { dnum: 0, dlevel: 1 },
        uinwater: Number(underwater),
        uswallow: swallowed ? {} : null,
        uprops: {
            [BLINDED]: {
                intrinsic: Number(blind),
                extrinsic: 0,
                blocked: 0,
            },
        },
    };
    objects_globals_init(state);
    init_objects(state, () => 0);
    return state;
}

function makeCandelabrum(state, overrides = {}) {
    // The positive default fuel reaches begin_burn in lighting fixtures;
    // zero candles still take the empty branch before inspecting this fuel.
    return {
        age: 100,
        cursed: false,
        dknown: true,
        known: true,
        lamplit: false,
        nobj: null,
        oclass: state.objects[CANDELABRUM_OF_INVOCATION].oc_class,
        otyp: CANDELABRUM_OF_INVOCATION,
        quan: 1,
        spe: 0,
        where: OBJ_INVENT,
        ...overrides,
    };
}

function makeCandle(state, otyp = WAX_CANDLE) {
    return {
        age: 100,
        dknown: true,
        lamplit: false,
        nobj: null,
        oclass: state.objects[otyp].oc_class,
        otyp,
        quan: 1,
        spe: 1,
        where: OBJ_INVENT,
    };
}

function candelabrumSourceFunction() {
    const start = APPLY_C.indexOf('use_candelabrum(struct obj *obj)\n{');
    assert.notEqual(start, -1);
    const end = APPLY_C.indexOf('\n}\n', start) + 2;
    return APPLY_C.slice(start, end);
}

test('use_candelabrum preserves every source branch in order', () => {
    const source = candelabrumSourceFunction();
    const branches = [
        'if (obj->lamplit)',
        'if (obj->spe <= 0)',
        'if (Underwater)',
        'if (u.uswallow || obj->cursed)',
        'if (obj->spe < 7)',
        'if (!invocation_pos(u.ux, u.uy) || On_stairs(u.ux, u.uy))',
        'begin_burn(obj, FALSE)',
    ];
    let previous = -1;
    for (const branch of branches) {
        const index = source.indexOf(branch);
        assert.ok(index > previous, `${branch} follows the prior C branch`);
        previous = index;
    }
    assert.match(source, /obj->age = \(obj->age \+ 1L\) \/ 2L;/u);
    assert.match(source, /obj->known = 1;/u);
    assert.match(
        source,
        /\} else \{\s*if \(obj->spe == 7\)[\s\S]*?\}\s*obj->known = 1;/u,
    );
});

test('an empty candelabrum reports candles and scans inventory for the tip',
    async () => {
        const state = candelabrumState();
        const candelabrum = makeCandelabrum(state);
        const unrelated = { nobj: null, otyp: 0 }; // Non-candle chain entry.
        const tallow = makeCandle(state, TALLOW_CANDLE);
        candelabrum.nobj = unrelated;
        unrelated.nobj = tallow;
        state.invent = candelabrum;
        const messages = [];
        let randomCalls = 0;

        await use_candelabrum(candelabrum, state, {
            message: async (line) => messages.push(line),
            random: { rn2: () => { randomCalls += 1; return 0; } },
        });

        // These are the source's exact empty-candelabrum and inventory-tip
        // messages; the non-candle chain entry proves the scan continues.
        assert.deepEqual(messages, [
            'This candelabrum has no candles.',
            'To attach candles, apply them instead of the candelabrum.',
        ]);
        assert.equal(randomCalls, 0);
        assert.deepEqual(
            [candelabrum.spe, candelabrum.age, candelabrum.lamplit],
            [0, 100, false],
        );
        assert.equal(state.invent, candelabrum);
    });

test('an empty candelabrum without candles has no attachment tip', async () => {
    const state = candelabrumState();
    const candelabrum = makeCandelabrum(state);
    state.invent = candelabrum;
    const messages = [];

    await use_candelabrum(candelabrum, state, {
        message: async (line) => messages.push(line),
    });

    assert.deepEqual(messages, ['This candelabrum has no candles.']);
});

test('water blocks positive-spe lighting before curse and burn effects', async () => {
    const state = candelabrumState({ underwater: true });
    const candelabrum = makeCandelabrum(state, { spe: 2, cursed: true });
    const messages = [];

    await use_candelabrum(candelabrum, state, {
        message: async (line) => messages.push(line),
    });

    assert.deepEqual(messages, ['You cannot make fire under water.']);
    assert.equal(candelabrum.lamplit, false);
});

test('swallowed or cursed lighting only reports the visible failure', async () => {
    const state = candelabrumState();
    const candelabrum = makeCandelabrum(state, { spe: 1, cursed: true });
    const messages = [];

    await use_candelabrum(candelabrum, state, {
        message: async (line) => messages.push(line),
    });
    assert.deepEqual(messages, [
        'The candle flickers for a moment, then dies.',
    ]);

    state.u.uswallow = {};
    candelabrum.cursed = false;
    messages.length = 0;
    await use_candelabrum(candelabrum, state, {
        message: async (line) => messages.push(line),
    });
    assert.deepEqual(messages, [
        'The candle flickers for a moment, then dies.',
    ]);

    state.u.uprops[BLINDED].intrinsic = 1;
    messages.length = 0;
    await use_candelabrum(candelabrum, state, {
        message: async (line) => messages.push(line),
    });
    assert.deepEqual(messages, []);
});

test('invocation position identifies fewer than seven candles', async () => {
    const state = candelabrumState();
    const candelabrum = makeCandelabrum(state, {
        age: 100,
        known: false,
        spe: 3,
    });
    state.invent = candelabrum;
    // Invocation_lev is the bottom floor of a hellish dungeon in the C source.
    state.dungeons = [{ flags: { hellish: true }, num_dunlevs: 2 }];
    state.inv_pos = { x: 5, y: 5 };
    timeout_globals_init(state);
    light_globals_init(state);
    const messages = [];

    await use_candelabrum(candelabrum, state, {
        message: async (line) => messages.push(line),
    });

    assert.match(messages[0], /^There are only 3 candles in /u);
    assert.match(messages[1], /dimly\.$/u);
    assert.equal(messages.some((line) => /rapidly consumed/u.test(line)), false);
    assert.equal(messages.some((line) => /strange (?:light|warmth)/u.test(line)), false);
    assert.equal(candelabrum.known, true);
    assert.equal(candelabrum.lamplit, true);
    // begin_burn's 25-turn candelabrum segment leaves 75 units from this fuel.
    assert.equal(candelabrum.age, 75);
});

test('seven candles glow at the invocation position', async () => {
    const state = candelabrumState();
    const candelabrum = makeCandelabrum(state, {
        age: 100,
        known: false,
        spe: 7,
    });
    state.invent = candelabrum;
    // Invocation_lev is the bottom floor of a hellish dungeon in the C source.
    state.dungeons = [{ flags: { hellish: true }, num_dunlevs: 2 }];
    state.inv_pos = { x: 5, y: 5 };
    timeout_globals_init(state);
    light_globals_init(state);
    const messages = [];

    await use_candelabrum(candelabrum, state, {
        message: async (line) => messages.push(line),
    });

    assert.match(messages[0], /burn brightly!$/u);
    assert.match(messages[1], /with a strange light!$/u);
    assert.equal(candelabrum.known, true);
    assert.equal(candelabrum.lamplit, true);
});

test('the production apply command attaches, lights, and snuffs the candelabrum',
    async () => {
        assert.equal(LightAndSnuffRecipe.segments.length, 1);
        const replay = await runSegment(LightAndSnuffRecipe.segments[0]);
        const screens = replay.getScreens().join('\n');

        assert.match(screens, /This candelabrum has no candles\./u);
        assert.match(screens,
            /To attach candles, apply them instead of the candelabrum\./u);
        assert.match(screens,
            /You attach 1 candle to the candelabrum\./u);
        assert.match(screens,
            /There is only 1 candle in the candelabrum\./u);
        assert.match(screens,
            /The candle is being rapidly consumed!/u);
        assert.match(screens, /You snuff the candle\./u);

        const carried = [];
        for (let obj = game.invent; obj; obj = obj.nobj) carried.push(obj);
        const candelabrum = carried.find((obj) =>
            obj.otyp === CANDELABRUM_OF_INVOCATION,
        );
        assert.ok(candelabrum);
        assert.equal(candelabrum.spe, 1);
        assert.equal(candelabrum.lamplit, false);
    });
