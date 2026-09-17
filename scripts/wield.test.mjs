// wield.c doquiver_core() (512-678), including its ordinary item and weapon
// slot paths. Assertions pin source-visible slot, result, and message effects
// rather than relying on a recorded session's object serialization.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CQ_CANNED,
    ECMD_OK,
    ECMD_TIME,
    LAST_PROP,
    OBJ_INVENT,
    RIGHT_HANDED,
    W_QUIVER,
    W_SWAPWEP,
    W_WEP,
} from '../js/const.js';
import { cmdq_add_key } from '../js/cmd.js';
import { GameDisplay } from '../js/game_display.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import {
    BOW,
    DAGGER,
    objects_globals_init,
} from '../js/objects.js';
import { monst_globals_init, PM_SAMURAI } from '../js/monsters.js';
import { roles } from '../js/roles.js';
import { doquiver_core } from '../js/wield.js';
import { scanSession } from './scan-sessions.mjs';

function makeState() {
    const state = {
        invent: null,
        uwep: null,
        uswapwep: null,
        uquiver: null,
        uarms: null,
        uarmg: null,
        flags: {
            verbose: true,
            invlet_constant: true,
            pushweapon: false,
        },
        iflags: { cbreak: true },
        disp: {},
        multi: 0,
        context: { ident: 1 },
        urole: roles[9],
        u: {
            twoweap: false,
            acurr: { a: [] },
            umonnum: PM_SAMURAI,
            umonster: PM_SAMURAI,
            uprops: Array.from(
                { length: LAST_PROP + 1 },
                () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
            ),
            uroleplay: {},
            uhandedness: RIGHT_HANDED,
        },
    };
    monst_globals_init(state);
    objects_globals_init(state);
    init_objects(state, () => 0);
    state.youmonst = { data: state.mons[PM_SAMURAI] };
    const display = new GameDisplay(null);
    display.readKey = async () => ' '.charCodeAt(0);
    state.nhDisplay = display;
    state.program_state = {};
    return state;
}

function item(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: 0,
        dknown: 1,
        known: 1,
        invlet: 'a',
        where: OBJ_INVENT,
        ...overrides,
    });
}

function queueItem(state, object) {
    state.invent = object;
    cmdq_add_key(CQ_CANNED, object.invlet, state);
}

function answerWith(state, answer) {
    state.nhDisplay.readKey = async () => answer.charCodeAt(0);
}

function pending(state) {
    const message = state._pending_message;
    delete state._pending_message;
    return message;
}

test('doquiver_core readies an ordinary inventory item', async () => {
    const state = makeState();
    const arrow = item(state, DAGGER);
    queueItem(state, arrow);

    // wield.c:648-660 reaches quivering for an item in neither weapon slot;
    // setuqwep() then precedes prinv() for the "ready" verb.
    assert.equal(await doquiver_core('ready', state), ECMD_OK);
    assert.equal(state.uquiver, arrow);
    assert.equal(arrow.owornmask & W_QUIVER, W_QUIVER);
    assert.match(pending(state), /at the ready/u);
});

test('doquiver_core confirms the singleton alternate weapon', async () => {
    const state = makeState();
    const bow = item(state, BOW, { owornmask: W_SWAPWEP });
    queueItem(state, bow);
    state.uswapwep = bow;
    answerWith(state, 'y');

    // wield.c:632-650 asks the alternate-weapon confirmation, clears
    // uswapwep, and enters the common quivering label with no RNG call.
    assert.equal(await doquiver_core('ready', state), ECMD_OK);
    assert.equal(state.uswapwep, null);
    assert.equal(state.uquiver, bow);
    assert.equal(bow.owornmask & W_SWAPWEP, 0);
    assert.equal(bow.owornmask & W_QUIVER, W_QUIVER);
    assert.match(pending(state), /at the ready/u);
});

test('doquiver_core can decline a singleton primary weapon', async () => {
    const state = makeState();
    const dagger = item(state, DAGGER, { owornmask: W_WEP });
    queueItem(state, dagger);
    state.uwep = dagger;
    answerWith(state, 'n');

    // wield.c:596-605 answers ECMD_OK after Shk_Your()/pline() and leaves
    // the primary weapon untouched when the confirmation is declined.
    assert.equal(await doquiver_core('ready', state), ECMD_OK);
    assert.equal(state.uwep, dagger);
    assert.equal(state.uquiver, null);
    assert.match(pending(state), /remains wielded\.$/u);
});

test('doquiver_core unwields a confirmed primary weapon for ECMD_TIME',
    async () => {
        const state = makeState();
        const dagger = item(state, DAGGER, { owornmask: W_WEP });
        queueItem(state, dagger);
        state.uwep = dagger;
        answerWith(state, 'y');

        // wield.c:651-678 sets was_uwep, reports empty_handed(), and returns
        // ECMD_TIME after moving the former primary into the quiver.
        assert.equal(await doquiver_core('ready', state), ECMD_TIME);
        assert.equal(state.uwep, null);
        assert.equal(state.uquiver, dagger);
        assert.equal(dagger.owornmask & W_WEP, 0);
        assert.equal(dagger.owornmask & W_QUIVER, W_QUIVER);
        assert.match(pending(state), /bare handed/u);
    });

test('seed0101 quiver witness completes after quivering and throwing', async () => {
    const row = await scanSession(
        'holdout/seed0101-ranger-quiver-throw-travel-engrave.session.json',
    );
    // The subsequent hand-thrown arrow now runs through dothrow.c throwit;
    // preserve the complete replay as coverage for the quiver-to-throw caller.
    assert.equal(row.boundary, null);
    assert.equal(row.divergence, null);
    assert.equal(row.screensEmitted, row.recordedSteps);
});
