// Source-pinned tests for do_wear.c:Amulet_off() (1090-1189) and its
// implemented direct callers. The production path has a matching v15 replay;
// these cases pin state writes that the reflection-amulet replay does not use.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FLYING,
    FROMOUTSIDE,
    I_SPECIAL,
    MAGICAL_BREATHING,
    SLEEPY,
    STRANGLED,
    TIMEOUT,
    W_AMUL,
    WORN_AMUL,
} from '../js/const.js';
import { _doWearInternals } from '../js/do_wear.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { getRngLog } from '../js/rng.js';
import { remove_worn_item } from '../js/steal.js';
import { planningState } from '../js/unported_monster_actions.js';
import { setworn } from '../js/worn.js';
import {
    AMULET_CLASS,
    AMULET_OF_CHANGE,
    AMULET_OF_ESP,
    AMULET_OF_FLYING,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_MAGICAL_BREATHING,
    AMULET_OF_REFLECTION,
    AMULET_OF_RESTFUL_SLEEP,
    AMULET_OF_STRANGULATION,
    AMULET_OF_UNCHANGING,
    AMULET_OF_YENDOR,
    AMULET_VERSUS_POISON,
    FAKE_AMULET_OF_YENDOR,
} from '../js/objects.js';
import { TAKEOFF_KEY, WAIT, loadTakeOffRecipe } from './run-take-off-armor.mjs';

const {
    Amulet_off,
    do_takeoff,
    takeoffContext,
    setwornEnv,
} = _doWearInternals;

// This existing Wizard fixture supplies a valid initialized game. The test
// replaces its input with one wait so each source branch starts from fresh
// ordinary state instead of replaying the fixture's armor-removal command.
const BASE_SEGMENT = loadTakeOffRecipe().segments.find(
    (segment) => segment.moves === `${WAIT}${TAKEOFF_KEY}${WAIT}`,
);
assert.ok(BASE_SEGMENT, 'the take-off matrix has its ordinary one-item case');

async function initialize() {
    await runSegment({ ...BASE_SEGMENT, moves: WAIT });
    game._pending_message = '';
    game.flags.verbose = false;
    takeoffContext(game);
}

function makeAmulet(otyp, overrides = {}) {
    // C sees one uncursed amulet instance: zero means unworn/inactive, while
    // dknown and the description fields let donameFresh() use the real object
    // catalog without adding a second object or changing the tested branch.
    return {
        oclass: AMULET_CLASS,
        otyp,
        owornmask: 0,
        dknown: true,
        known: false,
        bknown: true,
        cursed: 0,
        spe: 0,
        quan: 1,
        where: 0,
        in_use: 0,
        ...overrides,
    };
}

async function wear(otyp, overrides = {}) {
    await initialize();
    const amulet = makeAmulet(otyp, overrides);
    setworn(amulet, W_AMUL, setwornEnv(game));
    return amulet;
}

test('Amulet_off removes every plain-break amulet and preserves I_SPECIAL',
    async () => {
    // These are the C switch arms that only break: do_wear.c:1109-1114 and
    // :1184. Each still reaches the common setworn/off_msg tail.
    const plainBreakTypes = [
        AMULET_OF_LIFE_SAVING,
        AMULET_VERSUS_POISON,
        AMULET_OF_REFLECTION,
        AMULET_OF_CHANGE,
        AMULET_OF_UNCHANGING,
        FAKE_AMULET_OF_YENDOR,
        AMULET_OF_YENDOR,
    ];

    for (const otyp of plainBreakTypes) {
        const amulet = await wear(otyp);
        // C first removes W_AMUL from the shared mask and must leave the
        // caller's I_SPECIAL cancellation bit for do_takeoff() to clear.
        game.context.takeoff.mask = W_AMUL | I_SPECIAL;
        const rngBefore = getRngLog().length;

        await Amulet_off(game);

        assert.equal(game.uamul, null, `otyp ${otyp} clears uamul`);
        assert.equal(amulet.owornmask & W_AMUL, 0, `otyp ${otyp} clears W_AMUL`);
        assert.equal(game.context.takeoff.mask, I_SPECIAL, `otyp ${otyp}`);
        assert.equal(getRngLog().length, rngBefore, `otyp ${otyp} makes no draws`);
    }
});

test('Amulet_off ESP updates the map after clearing the amulet slot', async () => {
    const amulet = await wear(AMULET_OF_ESP);
    game.context.takeoff.mask = W_AMUL;

    await Amulet_off(game);

    assert.equal(game.uamul, null, 'the ESP source is gone before map refresh');
    assert.equal(amulet.owornmask & W_AMUL, 0, 'the object is no longer worn');
    assert.equal(game.context.takeoff.mask & W_AMUL, 0, 'C clears the amulet mask');
});

test('Amulet_off magical breathing removes its source before region checks',
    async () => {
    const amulet = await wear(AMULET_OF_MAGICAL_BREATHING);
    game.u.uinwater = false;

    await Amulet_off(game);

    assert.equal(game.uamul, null, 'the early slot clear is retained');
    assert.equal(amulet.owornmask & W_AMUL, 0);
    assert.equal(game.objects[AMULET_OF_MAGICAL_BREATHING].oc_name_known, 0,
        'no drowning or gas branch ran in dry ordinary terrain');
});

test('Amulet_off clears Strangled and uses Breathless wording',
    async () => {
    const amulet = await wear(AMULET_OF_STRANGULATION);
    // C sets the entire Strangled intrinsic to zero, not just its timeout.
    // Four is a live countdown value chosen to distinguish a clear from a no-op.
    game.u.uprops[STRANGLED].intrinsic = 4;
    // This property makes youprop.h:Breathless true for the source branch.
    game.u.uprops[MAGICAL_BREATHING].intrinsic = 1;

    await Amulet_off(game);

    assert.equal(game.u.uprops[STRANGLED].intrinsic, 0);
    assert.match(game._pending_message, /Your neck is no longer constricted!/);
    assert.equal(game.objects[AMULET_OF_STRANGULATION].oc_name_known, 1);
    assert.equal(game.uamul, null);
    assert.equal(amulet.owornmask & W_AMUL, 0);
});

test('Amulet_off restful sleep preserves other source bits and clears a lone timeout', async () => {
    await wear(AMULET_OF_RESTFUL_SLEEP);
    // TIMEOUT marks the expiring part; FROMOUTSIDE is the independent source
    // whose presence makes C leave the whole intrinsic unchanged at
    // do_wear.c:1140-1142.
    game.u.uprops[SLEEPY].intrinsic = TIMEOUT | FROMOUTSIDE;
    game.u.uprops[SLEEPY].extrinsic = 0;

    await Amulet_off(game);

    assert.equal(game.u.uprops[SLEEPY].intrinsic, TIMEOUT | FROMOUTSIDE);
    assert.equal(game.u.uprops[SLEEPY].extrinsic, 0);

    // With only the timeout bit set, C's same condition clears it entirely.
    await wear(AMULET_OF_RESTFUL_SLEEP);
    game.u.uprops[SLEEPY].intrinsic = TIMEOUT;
    game.u.uprops[SLEEPY].extrinsic = 0;
    await Amulet_off(game);
    assert.equal(game.u.uprops[SLEEPY].intrinsic, 0);
});

test('Amulet_off flying updates status, runs spot effects, and learns the type',
    async () => {
    const amulet = await wear(AMULET_OF_FLYING);
    // The amulet is the only flight source; clearing these property terms
    // keeps float_vs_flight() from changing the source comparison.
    game.u.uprops[FLYING].intrinsic = 0;
    game.u.uprops[FLYING].extrinsic = W_AMUL;
    game.u.uprops[FLYING].blocked = 0;
    game.unported = new Set();

    await Amulet_off(game);

    assert.equal(game.uamul, null);
    assert.equal(game.u.uprops[FLYING].extrinsic & W_AMUL, 0);
    assert.equal(game.objects[AMULET_OF_FLYING].oc_name_known, 1);
    assert.equal(game.unported.has('hack.c spoteffects'), false,
        'the source-discarded void call still runs all spot effects');
    assert.match(game._pending_message, /You land\./);
    assert.equal(amulet.owornmask & W_AMUL, 0);
});

test('Amulet_off flying classifies planes from its supplied state', async () => {
    await initialize();
    const state = planningState(game);
    const amulet = makeAmulet(AMULET_OF_FLYING);
    // Use an isolated level identity so the singleton game topology cannot
    // accidentally make this supplied-state water-plane check pass.
    const waterPlane = { dnum: 987, dlevel: 1 };
    state.u.uz = { ...waterPlane };
    state.water_level = { ...waterPlane };
    state.air_level = { dnum: 987, dlevel: 2 };
    state._pending_message = '';
    state.unported = new Set();

    // The amulet is the only flight source; removing it must use the plane
    // fields belonging to `state`, even though global game has another level.
    setworn(amulet, W_AMUL, setwornEnv(state));
    state.u.uprops[FLYING].intrinsic = 0;
    state.u.uprops[FLYING].extrinsic = W_AMUL;
    state.u.uprops[FLYING].blocked = 0;

    await Amulet_off(state);

    assert.match(state._pending_message, /You stop flying\./);
    assert.equal(state.uamul, null);
    assert.equal(amulet.owornmask & W_AMUL, 0);
});

test('do_takeoff wires the WORN_AMUL arm and clears I_SPECIAL afterwards',
    async () => {
    const amulet = await wear(AMULET_OF_ESP);
    game.context.takeoff.what = WORN_AMUL;
    game.context.takeoff.mask = WORN_AMUL;

    await do_takeoff(game);

    assert.equal(game.uamul, null);
    assert.equal(amulet.owornmask & W_AMUL, 0);
    assert.equal(game.context.takeoff.mask, 0);
});

test('remove_worn_item awaits Amulet_off and restores the in_use field',
    async () => {
    const amulet = await wear(AMULET_OF_REFLECTION, { in_use: 4 });
    game.unported = new Set();

    await remove_worn_item(amulet, false, game);

    assert.equal(game.uamul, null);
    assert.equal(amulet.owornmask & W_AMUL, 0);
    assert.equal(amulet.in_use, 4,
        'steal.c restores the caller-owned in_use value after its awaited helper');
    assert.equal(game.unported.has('do_wear.c Amulet_off'), false);
});

test('remove_worn_item forwards planning message and redraw callbacks to Amulet_off',
    async () => {
    await initialize();
    const state = planningState(game);
    const amulet = makeAmulet(AMULET_OF_ESP);
    const messages = [];
    const redraws = [];
    // C's verbose off_msg() (do_wear.c:68-72) runs inside the theft removal;
    // the planning caller must supply its silent message and map callbacks.
    state.flags.verbose = true;
    setworn(amulet, W_AMUL, setwornEnv(state));

    await remove_worn_item(amulet, false, state, {
        message: async (text, suppliedState) => {
            assert.equal(suppliedState, state);
            messages.push(text);
        },
        redraw: (x, y, suppliedState) => {
            assert.equal(suppliedState, state);
            redraws.push([x, y]);
        },
    });

    // The fixture is an unidentified, uncursed ESP instance, so C's doname()
    // uses its generated `uncursed octagonal amulet` description here.
    assert.deepEqual(messages, ['You were wearing an uncursed octagonal amulet.']);
    assert.ok(redraws.length > 0,
        'C see_monsters() redraws after the ESP source is removed');
    assert.equal(state.uamul, null,
        'Amulet_off clears the supplied clone before its callbacks finish');
    assert.equal(amulet.owornmask & W_AMUL, 0);
    assert.equal(game._pending_message, '',
        'the callback keeps planning output off the live game');
});
