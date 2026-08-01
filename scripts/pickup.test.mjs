import assert from 'node:assert/strict';
import test from 'node:test';

import { MOAT, PIT, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { M1_NOTAKE } from '../js/monsters.js';
import { mksobj } from '../js/obj.js';
import { encumber_msg, pickup } from '../js/pickup.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { ELVEN_DAGGER, SACK, TOOL_CLASS } from '../js/objects.js';

function burdenState() {
    return {
        disp: {},
        go: { oldcap: 0 },
        gw: {},
        invent: {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: 530,
            nobj: null,
        },
        u: {
            abon: [0, 0, 0, 0, 0, 0],
            acurr: { a: [10, 10, 10, 10, 10, 10] },
            atemp: [0, 0, 0, 0, 0, 0],
        },
    };
}

test('encumber_msg reports the live weakness capacity transition once',
    async () => {
        const state = burdenState();
        const messages = [];
        const env = { message: (text) => messages.push(text) };

        assert.equal(await encumber_msg(state, env), 0);
        state.u.atemp[0] = -1;
        assert.equal(await encumber_msg(state, env), 1);
        assert.equal(await encumber_msg(state, env), 1);

        assert.deepEqual(messages, [
            'Your movements are slowed slightly because of your load.',
        ]);
        assert.equal(state.go.oldcap, 1);
        assert.equal(state.disp.botl, true);
    });


// pickup.c pickup() (672-910), the two arms goto_level()'s pickup(1) reaches.
// The state each case fabricates is the one term of a source condition that
// separates it from the case above it.
async function heroOnAnEmptySquare() {
    await runSegment({
        seed: 5501234,
        datetime: '20330607081011',
        nethackrc: 'OPTIONS=name:Picker,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup',
        moves: '',
    });
    const state = game;
    state.multi = 0;
    state.context.run = 0;
    state.context.nopick = 0;
    state.level.objects[state.u.ux][state.u.uy] = null;
    state.level.at(state.u.ux, state.u.uy).typ = ROOM;
    quiet(state);
    return state;
}

// Drop the pending message so look_here()'s next pline() starts a fresh top
// line rather than asking for a --More-- no keystroke is left to answer.
function quiet(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
}

function objectUnderHero(state) {
    const object = mksobj(ELVEN_DAGGER, true, false, { state });
    object.nexthere = null;
    object.ox = state.u.ux;
    object.oy = state.u.uy;
    state.level.objects[state.u.ux][state.u.uy] = object;
    return object;
}

test('pickup answers an empty square without taking anything', async () => {
    const state = await heroOnAnEmptySquare();
    // The early return needs `autopickup`: a count pickup falls past it.
    assert.equal(await pickup(1, state), 0);
    await assert.rejects(() => pickup(-1, state), /selecting objects/u);
});

test('pickup describes a square it is not allowed to take from', async () => {
    const state = await heroOnAnEmptySquare();
    objectUnderHero(state);
    state.flags.pickup = false;

    // !flags.pickup is the `autopickup` option turned off, which sends the
    // square to check_here() instead of autopick(). look_here() prints the
    // object and read_engr_at() follows it, so the pair asks for a --More--
    // that a space dismisses.
    state.nhDisplay.pushKey(' '.charCodeAt(0));
    assert.equal(await pickup(1, state), 0);
    assert.match(state._ttyToplines ?? '', /You see here/u);

    // With the option on the same square reaches the selection half.
    quiet(state);
    state.flags.pickup = true;
    await assert.rejects(() => pickup(1, state), /selecting objects/u);
    assert.equal(state._ttyToplines ?? '', '');
});

test('pickup takes the early return for each thing that hides the square',
    async () => {
    const state = await heroOnAnEmptySquare();
    objectUnderHero(state);
    state.flags.pickup = false;

    // Each of these on its own sends an occupied square down the arm that
    // answers without describing it, so none of them prints "You see here".
    for (const set of [
        () => { state.context.nopick = 1; },
        () => { state.level.at(state.u.ux, state.u.uy).typ = MOAT; },
    ]) {
        state.context.nopick = 0;
        state.level.at(state.u.ux, state.u.uy).typ = ROOM;
        quiet(state);
        set();
        assert.equal(await pickup(1, state), 0);
        assert.equal(state._ttyToplines ?? '', '');
    }

    // A hero standing in the water she is swimming in still reaches the floor,
    // which is the `!Underwater` half of the pool term.
    state.context.nopick = 0;
    state.level.at(state.u.ux, state.u.uy).typ = MOAT;
    state.u.uinwater = 1;
    quiet(state);
    assert.equal(await pickup(1, state), 0);
    assert.match(state._ttyToplines ?? '', /You see here/u);
    state.u.uinwater = 0;
});

test('pickup stops on each state it has no answer for', async () => {
    const state = await heroOnAnEmptySquare();

    state.u.uswallow = 1;
    await assert.rejects(() => pickup(1, state), /inside a monster/u);
    state.u.uswallow = 0;

    // multi < 0 is a helpless hero, and only autopickup checks it.
    state.multi = -3;
    await assert.rejects(() => pickup(1, state), /while helpless/u);
    state.multi = 0;

    state.flags.mention_decor = true;
    await assert.rejects(() => pickup(1, state), /mention_decor/u);
    state.flags.mention_decor = false;

    // can_reach_floor() answers FALSE for a swallowed hero, which is the one
    // of its arms this fixture can set without an unported property.
    state.u.uswallow = 1;
    state.u.ustuck = { data: state.youmonst.data };
    await assert.rejects(() => pickup(1, state), /inside a monster/u);
    state.u.uswallow = 0;
    state.u.ustuck = null;

    // Both arms below sit past the empty-square return, so the square needs
    // something on it before either can be reached.
    objectUnderHero(state);

    // The pit argument is what a hero teetering on a seen pit passes.
    state.level.traps.push({
        tx: state.u.ux, ty: state.u.uy, ttyp: PIT, tseen: 1,
    });
    await assert.rejects(() => pickup(1, state), /cannot reach the floor/u);
    state.level.traps.pop();

    state.youmonst.data = { ...state.youmonst.data };
    state.youmonst.data.mflags1 |= M1_NOTAKE;
    await assert.rejects(() => pickup(1, state), /cannot take objects/u);
});

test('pickup stops a run before it selects anything', async () => {
    const state = await heroOnAnEmptySquare();
    objectUnderHero(state);
    state.flags.pickup = true;
    state.context.run = 1;
    state.multi = 1;

    await assert.rejects(() => pickup(1, state), /selecting objects/u);
    // hack.c nomul(0) ends the run before the selection begins.
    assert.equal(state.context.run, 0);

    // svc.context.run == 8 is the travel command, which pickup() leaves
    // running.
    state.context.run = 8;
    await assert.rejects(() => pickup(1, state), /selecting objects/u);
    assert.equal(state.context.run, 8);
});
