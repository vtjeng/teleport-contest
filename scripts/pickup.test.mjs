import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    EXT_ENCUMBER,
    HVY_ENCUMBER,
    MOAT,
    MOD_ENCUMBER,
    OBJ_FLOOR,
    OBJ_INVENT,
    PIT,
    ROOM,
    SLT_ENCUMBER,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { calc_capacity } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { M1_NOTAKE, PM_KOBOLD_ZOMBIE } from '../js/monsters.js';
import { mksobj_at } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    encumber_msg,
    observe_pickup_object,
    pickup,
} from '../js/pickup.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    ELVEN_DAGGER,
    FIGURINE,
    LUCKSTONE,
    SACK,
    SCR_IDENTIFY,
    TOOL_CLASS,
} from '../js/objects.js';

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
    return mksobj_at(
        ELVEN_DAGGER,
        state.u.ux,
        state.u.uy,
        true,
        false,
        objectGenerationEnv({ state }),
    );
}

function typedObjectUnderHero(state, otyp) {
    return mksobj_at(
        otyp,
        state.u.ux,
        state.u.uy,
        true,
        false,
        objectGenerationEnv({ state }),
    );
}

function assertStillOnBothFloorChains(state, object, links) {
    assert.equal(object.where, OBJ_FLOOR);
    assert.equal(state.level.objects[state.u.ux][state.u.uy], object);
    assert.equal(state.level.objlist, object);
    assert.equal(object.nexthere, links.nexthere);
    assert.equal(object.nobj, links.nobj);
}

test('pickup answers an empty square without taking anything', async () => {
    const state = await heroOnAnEmptySquare();
    // Autopickup takes the early empty-square return; a count pickup reaches
    // query_objlist() with an empty chain and also answers zero.
    assert.equal(await pickup(1, state), 0);
    assert.equal(await pickup(-1, state), 0);
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

    // With the option on, the ordinary object follows autopick(),
    // pickup_object() and pick_obj() into inventory.
    quiet(state);
    state.flags.pickup = true;
    const object = state.level.objects[state.u.ux][state.u.uy];
    object.dknown = false;
    const previouslyCarried = state.invent;
    previouslyCarried.pickup_prev = true;
    assert.equal(await pickup(1, state), 1);
    assert.equal(object.where, OBJ_INVENT);
    assert.equal(state.level.objects[state.u.ux][state.u.uy], null);
    assert.equal(object.dknown, true);
    assert.equal(previouslyCarried.pickup_prev, false);
    assert.match(state._ttyToplines ?? '', /elven dagger/u);
});

test('blind pickup does not observe the object before carrying it',
    async () => {
        const state = await heroOnAnEmptySquare();
        const object = objectUnderHero(state);
        state.flags.pickup = true;
        state.u.uprops[BLINDED].intrinsic = 1;
        object.dknown = false;

        assert.equal(await pickup(1, state), 1);
        assert.equal(object.where, OBJ_INVENT);
        assert.equal(object.dknown, false);
    });

test('pickup_object observes before naming only when the hero can see',
    async () => {
        const state = await heroOnAnEmptySquare();
        const object = objectUnderHero(state);
        object.dknown = false;
        observe_pickup_object(object, state);
        assert.equal(object.dknown, true);

        object.dknown = false;
        state.u.uprops[BLINDED].intrinsic = 1;
        observe_pickup_object(object, state);
        assert.equal(object.dknown, false);
    });

test('pickup preflights every reachable addinv dependency before unlinking',
    async () => {
        const cases = [
            {
                name: 'luckstone recalculation',
                otyp: LUCKSTONE,
                expected: /recalculateLuck is not available/u,
            },
            {
                name: 'cursed figurine timer',
                otyp: FIGURINE,
                expected: /isDeadSpecies is not available/u,
                prepare(object) {
                    object.cursed = true;
                    object.corpsenm = PM_KOBOLD_ZOMBIE;
                },
            },
            {
                name: 'Archeologist scroll label',
                otyp: SCR_IDENTIFY,
                expected: /archeologistDeciphersScroll is not available/u,
                prepare(object, state) {
                    state.urole = { ...state.urole, filecode: 'Arc' };
                    state.objects[object.otyp].oc_name_known = 0;
                },
            },
            {
                name: 'permanent inventory refresh',
                otyp: ELVEN_DAGGER,
                expected: /updateInventory is not available/u,
                prepare(_object, state) {
                    state.program_state.in_moveloop = true;
                    state.iflags.perm_invent = true;
                },
            },
        ];

        for (const specimen of cases) {
            const state = await heroOnAnEmptySquare();
            state.flags.pickup = true;
            const object = typedObjectUnderHero(state, specimen.otyp);
            specimen.prepare?.(object, state);
            const links = { nobj: object.nobj, nexthere: object.nexthere };

            await assert.rejects(
                () => pickup(1, state),
                specimen.expected,
                specimen.name,
            );
            assertStillOnBothFloorChains(state, object, links);
            assert.equal(state.invent === object, false, specimen.name);
        }
    });

function weightForCapacity(state, target) {
    for (let weight = 1; weight < 5000; ++weight) {
        if (calc_capacity(weight, state) === target) return weight;
    }
    throw new Error(`no object weight reaches capacity ${target}`);
}

test('pickup admits its exact burden limit and uses inclusive prefix thresholds',
    async () => {
        const prefixes = [
            [SLT_ENCUMBER, 'You have a little trouble lifting'],
            [MOD_ENCUMBER, 'You have trouble lifting'],
            [HVY_ENCUMBER, 'You have much trouble lifting'],
            [EXT_ENCUMBER, 'You have extreme difficulty lifting'],
        ];
        for (const [capacity, prefix] of prefixes) {
            const state = await heroOnAnEmptySquare();
            state.flags.pickup = true;
            state.flags.pickup_burden = capacity;
            const object = objectUnderHero(state);
            object.owt = weightForCapacity(state, capacity);
            quiet(state);

            assert.equal(
                calc_capacity(object.owt, state),
                capacity,
                'fixture sits exactly on the source threshold',
            );
            assert.equal(await pickup(1, state), 1);
            assert.equal(object.where, OBJ_INVENT);
            assert.match(state._ttyToplines ?? '', new RegExp(`^${prefix}`, 'u'));
        }
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
    const first = objectUnderHero(state);
    state.flags.pickup = true;
    state.context.run = 1;
    state.multi = 1;

    assert.equal(await pickup(1, state), 1);
    assert.equal(first.where, OBJ_INVENT);
    // hack.c nomul(0) ends the run before the selection begins.
    assert.equal(state.context.run, 0);

    // svc.context.run == 8 is the travel command, which pickup() leaves
    // running.
    quiet(state);
    const second = objectUnderHero(state);
    state.context.run = 8;
    assert.equal(await pickup(1, state), 1);
    assert.equal(second.where, OBJ_INVENT);
    assert.equal(state.context.run, 8);
});
