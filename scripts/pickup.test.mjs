import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    CORR,
    EXT_ENCUMBER,
    FUMBLING,
    HVY_ENCUMBER,
    MOAT,
    MOD_ENCUMBER,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_DELETED,
    PIT,
    ROOM,
    SLT_ENCUMBER,
    STAIRS,
    STONE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import {
    calc_capacity,
    inv_cnt,
    inv_weight,
    weight_cap,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { M1_NOTAKE, PM_KOBOLD_ZOMBIE } from '../js/monsters.js';
import { mksobj_at } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { addinv, obj_extract_self } from '../js/invent.js';
import {
    encumber_msg,
    describe_decor,
    observe_pickup_object,
    pickup,
    preflight_describe_decor_at,
    preflight_initial_pickup,
    UnsupportedPickupError,
} from '../js/pickup.js';
import { clearTtyMessageWindow, ttyPline } from '../js/tty_message.js';
import {
    COIN_CLASS,
    ELVEN_DAGGER,
    FIGURINE,
    GOLD_PIECE,
    LUCKSTONE,
    SACK,
    SCR_IDENTIFY,
    TOOL_CLASS,
} from '../js/objects.js';

function inventoryOfSize(state, count, { withCoins = false } = {}) {
    const template = state.invent;
    let head = withCoins ? {
        ...template,
        oclass: COIN_CLASS,
        invlet: '$',
        o_id: 90_000,
        nobj: null,
        owt: 0,
        quan: 100,
    } : null;
    for (let index = 0; index < count; ++index) {
        head = {
            ...template,
            o_id: 91_000 + index,
            spe: index,
            nobj: head,
            quan: 1,
            where: OBJ_INVENT,
        };
    }
    state.invent = head;
}

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

async function heroOnStartingStair() {
    const state = await heroOnAnEmptySquare();
    state.level.at(state.u.ux, state.u.uy).typ = STAIRS;
    state.flags.mention_decor = true;
    state.flags.verbose = true;
    state.iflags.prev_decor = STONE;
    state.u.uz = { dnum: 0, dlevel: 1 };
    state.u.uhave = { amulet: false };
    // The synthetic stair leads out of the main dungeon and has already been
    // traversed, which selects stairs.c's D:1 exit wording.
    state.stairs = {
        sx: state.u.ux,
        sy: state.u.uy,
        up: true,
        isladder: false,
        tolev: { dnum: 1, dlevel: 1 },
        u_traversed: true,
        next: null,
    };
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

function carryGeneratedObject(state, otyp) {
    const object = typedObjectUnderHero(state, otyp);
    const env = objectGenerationEnv({ state });
    obj_extract_self(object, env);
    return addinv(object, env);
}

function matchStackTraits(object, target) {
    const ownership = {
        o_id: object.o_id,
        where: object.where,
        nobj: object.nobj,
        nexthere: object.nexthere,
        ox: object.ox,
        oy: object.oy,
    };
    Object.assign(object, {
        ...target,
        ...ownership,
        oextra: target.oextra ? { ...target.oextra } : target.oextra,
        pickup_prev: false,
        quan: 1,
    });
    return object;
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

test('pickup describes the traversed D:1 staircase before returning',
    async () => {
        const state = await heroOnStartingStair();
        const position = [state.u.ux, state.u.uy];
        const inventory = state.invent;

        assert.equal(await pickup(1, state), 0);
        assert.equal(
            state._ttyToplines,
            'There is a staircase up out of the dungeon here.',
        );
        assert.equal(state.iflags.prev_decor, STAIRS);
        assert.deepEqual([state.u.ux, state.u.uy], position);
        assert.equal(state.invent, inventory);
        assert.equal(state.level.objects[state.u.ux][state.u.uy], null);
    });

test('nonverbose startup decor uses the source article and terse sentence',
    async () => {
        const state = await heroOnStartingStair();
        state.flags.verbose = false;

        assert.equal(await pickup(1, state), 0);
        assert.equal(
            state._ttyToplines,
            'A staircase up out of the dungeon.',
        );
        assert.equal(state.iflags.prev_decor, STAIRS);
    });

test('bounded describe_decor reports that it printed the staircase',
    async () => {
        const state = await heroOnStartingStair();
        assert.equal(
            preflight_describe_decor_at(state.u.ux, state.u.uy, state),
            true,
        );
        assert.equal(await describe_decor(state), true);
        assert.equal(state.iflags.prev_decor, STAIRS);
    });

test('decor preflight rejects either changed coordinate before mutation',
    async () => {
        const state = await heroOnStartingStair();
        const remembered = state.iflags.prev_decor;
        for (const [label, x, y] of [
            // One changed x coordinate pins the first half of C's location
            // equality, while one changed y coordinate pins the second.
            ['x', state.u.ux + 1, state.u.uy],
            ['y', state.u.ux, state.u.uy + 1],
        ]) {
            // STONE bypasses the owned ordinary-terrain plan so this test
            // reaches the destination-coordinate guard itself.
            state.level.at(x, y).typ = STONE;
            assert.throws(
                () => preflight_describe_decor_at(x, y, state),
                /outside silent ordinary terrain/u,
                label,
            );
            assert.equal(state.iflags.prev_decor, remembered, label);
            assert.equal(state._ttyToplines ?? '', '', label);
        }
    });

test('describe_decor remembers silent ordinary terrain transitions',
    async () => {
        for (const terrain of [ROOM, CORR]) {
            const state = await heroOnAnEmptySquare();
            state.flags.mention_decor = true;
            state.iflags.prev_decor = STAIRS;
            state.level.at(state.u.ux, state.u.uy).typ = terrain;
            state.stairs = null;

            assert.equal(await describe_decor(state), true);
            assert.equal(state.iflags.prev_decor, terrain);
            assert.equal(state._ttyToplines ?? '', '');

            assert.equal(await describe_decor(state), false);
            assert.equal(state.iflags.prev_decor, terrain);
            assert.equal(state._ttyToplines ?? '', '');
        }
    });

test('ordinary describe_decor exclusions preserve terrain memory and output',
    async () => {
        const cases = [
            {
                // STONE is neither the startup staircase nor the preceding
                // STAIRS terrain owned by the silent transition.
                name: 'unowned prior terrain',
                alter: (state) => { state.iflags.prev_decor = STONE; },
            },
            {
                // Underwater suppresses dfeature output and belongs to the
                // water transition owner.
                name: 'underwater hero',
                alter: (state) => { state.u.uinwater = true; },
            },
            {
                // Fumbling with one timeout turn can defer the description.
                name: 'fumbling hero',
                alter: (state) => {
                    state.u.uprops[FUMBLING].intrinsic = 1;
                },
            },
            {
                // deferred_decor() changes when the feedback is emitted.
                name: 'deferred decor',
                alter: (state) => { state.iflags.defer_decor = true; },
            },
            {
                // force_decor() changes the fumble feedback gate.
                name: 'fumble override',
                alter: (state) => { state.decor_fumble_override = true; },
            },
            {
                // Probing can override levitation-sensitive decor details.
                name: 'levitation override',
                alter: (state) => { state.decor_levitate_override = true; },
            },
        ];

        for (const entry of cases) {
            const state = await heroOnAnEmptySquare();
            state.flags.mention_decor = true;
            state.iflags.prev_decor = STAIRS;
            state.stairs = null;
            entry.alter(state);
            const remembered = state.iflags.prev_decor;

            await assert.rejects(
                () => describe_decor(state),
                UnsupportedPickupError,
                entry.name,
            );
            assert.equal(state.iflags.prev_decor, remembered, entry.name);
            assert.equal(state._ttyToplines ?? '', '', entry.name);
        }
    });

test('initial pickup rejects every excluded startup family atomically',
    async () => {
        const cases = [
            {
                // One ordinary floor object would enter autopickup or
                // check_here(), both beyond the selected empty-square arm.
                name: 'floor object',
                expected: /initial floor object/u,
                alter: (state) => { objectUnderHero(state); },
            },
            {
                // Any engraving would let read_engr_at() print after decor.
                name: 'engraving',
                expected: /initial engraving/u,
                alter: (state) => {
                    state.head_engr = {
                        engr_x: state.u.ux,
                        engr_y: state.u.uy,
                        engr_txt: 'x',
                        nxt_engr: null,
                    };
                },
            },
            {
                // ROOM selects describe_decor()'s no-feature arm.
                name: 'other terrain',
                expected: /outside the initial D:1 staircase/u,
                alter: (state) => {
                    state.level.at(state.u.ux, state.u.uy).typ = ROOM;
                },
            },
            {
                // Underwater suppresses the ordinary stair feature.
                name: 'underwater hero',
                expected: /exceptional initial decor/u,
                alter: (state) => { state.u.uinwater = true; },
            },
            {
                // Fumbling can defer feedback when its timeout reaches one.
                name: 'fumbling hero',
                expected: /exceptional initial decor/u,
                alter: (state) => {
                    state.u.uprops[FUMBLING].intrinsic = 1;
                },
            },
            {
                // force_decor() may override the ordinary fumble deferral;
                // that probing path lies outside initial startup.
                name: 'fumble override',
                expected: /exceptional initial decor/u,
                alter: (state) => { state.decor_fumble_override = true; },
            },
            {
                // force_decor() also owns a levitation override during
                // probing, which an initial startup call never sets.
                name: 'levitation override',
                expected: /exceptional initial decor/u,
                alter: (state) => { state.decor_levitate_override = true; },
            },
            {
                // Carrying the Amulet selects the endgame staircase name.
                name: 'endgame staircase',
                expected: /outside the initial D:1 staircase/u,
                alter: (state) => { state.u.uhave.amulet = true; },
            },
            {
                // A remembered staircase belongs to a later decor call.
                name: 'repeated decor',
                expected: /repeated initial decor/u,
                alter: (state) => { state.iflags.prev_decor = STAIRS; },
            },
        ];

        for (const entry of cases) {
            const state = await heroOnStartingStair();
            const inventory = state.invent;
            inventory.pickup_prev = true;
            const position = [state.u.ux, state.u.uy];
            const toplines = state._ttyToplines;
            entry.alter(state);
            const previousDecor = state.iflags.prev_decor;

            assert.throws(
                () => preflight_initial_pickup(state),
                entry.expected,
                entry.name,
            );
            assert.equal(inventory.pickup_prev, true, entry.name);
            assert.equal(state.invent, inventory, entry.name);
            assert.equal(state.iflags.prev_decor, previousDecor, entry.name);
            assert.equal(state._ttyToplines, toplines, entry.name);
            assert.deepEqual([state.u.ux, state.u.uy], position, entry.name);
        }
    });

test('initial staircase decor is independent of autopickup', async () => {
    const outputs = [];
    for (const pickupEnabled of [false, true]) {
        const state = await heroOnStartingStair();
        state.flags.pickup = pickupEnabled;
        assert.equal(await pickup(1, state), 0);
        outputs.push({
            line: state._ttyToplines,
            previousDecor: state.iflags.prev_decor,
            floor: state.level.objects[state.u.ux][state.u.uy],
        });
    }
    assert.deepEqual(outputs[0], outputs[1]);
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

test('pickup preflights the whole pile before any state or floor mutation',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        const failing = typedObjectUnderHero(state, LUCKSTONE);
        const ordinary = objectUnderHero(state);
        ordinary.dknown = false;
        failing.dknown = false;
        const previouslyCarried = state.invent;
        previouslyCarried.pickup_prev = true;
        quiet(state);

        const ordinaryLinks = {
            nobj: ordinary.nobj,
            nexthere: ordinary.nexthere,
        };
        const failingLinks = {
            nobj: failing.nobj,
            nexthere: failing.nexthere,
        };
        const beforeToplines = state._ttyToplines;
        const beforeLootReset = state.loot_reset_justpicked;

        await assert.rejects(
            () => pickup(1, state),
            /recalculateLuck is not available/u,
        );
        assertStillOnBothFloorChains(state, ordinary, ordinaryLinks);
        assert.equal(ordinary.nexthere, failing);
        assert.equal(ordinary.nobj, failing);
        assert.deepEqual({ nobj: failing.nobj, nexthere: failing.nexthere },
            failingLinks);
        assert.equal(ordinary.dknown, false);
        assert.equal(failing.dknown, false);
        assert.equal(state.invent, previouslyCarried);
        assert.equal(previouslyCarried.pickup_prev, true);
        assert.equal(state.loot_reset_justpicked, beforeLootReset);
        assert.equal(state.gp.pickup_encumbrance, 0);
        assert.equal(state._ttyToplines, beforeToplines);
    });

test('pickup validates each independent floor-object shape term', async () => {
    const cases = [
        ['floor ownership', (object) => { object.where = OBJ_FREE; }],
        ['integer quantity', (object) => { object.quan = 1.5; }],
        ['positive quantity', (object) => { object.quan = 0; }],
    ];
    for (const [name, prepare] of cases) {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        const object = objectUnderHero(state);
        prepare(object);
        await assert.rejects(
            () => pickup(1, state),
            (error) => error instanceof UnsupportedPickupError
                && /malformed floor object/u.test(error.message),
            name,
        );
    }
});

test('pickup full-pack counting excludes coins and preserves exact 52 slots',
    async () => {
        for (const specimen of [
            { count: 51, withCoins: false, accepted: true },
            { count: 51, withCoins: true, accepted: true },
            { count: 52, withCoins: false, accepted: false },
        ]) {
            const state = await heroOnAnEmptySquare();
            state.flags.pickup = true;
            inventoryOfSize(state, specimen.count, specimen);
            const object = objectUnderHero(state);
            quiet(state);
            if (specimen.accepted) {
                assert.equal(await pickup(1, state), 1);
                assert.equal(object.where, OBJ_INVENT);
            } else {
                await assert.rejects(
                    () => pickup(1, state),
                    (error) => error instanceof UnsupportedPickupError
                        && /full pack/u.test(error.message),
                );
                assert.equal(object.where, OBJ_FLOOR);
            }
        }
    });

test('pickup applies the 52-slot limit after source-ordered merge projection',
    async () => {
        // A compatible object uses no new letter even when all 52 are held.
        {
            const state = await heroOnAnEmptySquare();
            state.flags.pickup = true;
            inventoryOfSize(state, 52);
            const target = state.invent;
            target.owornmask = 0;
            target.worn = 0;
            target.lamplit = false;
            const incoming = objectUnderHero(state);
            matchStackTraits(incoming, target);
            quiet(state);

            assert.equal(await pickup(1, state), 1);
            assert.equal(incoming.where, OBJ_DELETED);
            assert.equal(target.quan, 2);
            assert.equal(inv_cnt(false, state), 52);
        }

        // Gold is exempt from the ordinary inventory-letter limit.
        {
            const state = await heroOnAnEmptySquare();
            state.flags.pickup = true;
            inventoryOfSize(state, 52);
            const gold = typedObjectUnderHero(state, GOLD_PIECE);
            quiet(state);

            assert.equal(await pickup(1, state), 1);
            assert.equal(gold.where, OBJ_INVENT);
            assert.equal(inv_cnt(false, state), 52);
        }

        // The first floor object takes slot 52 and the second merges into its
        // projected stack, so the aggregate pile has only one slot effect.
        {
            const state = await heroOnAnEmptySquare();
            state.flags.pickup = true;
            inventoryOfSize(state, 51);
            const first = objectUnderHero(state);
            const second = objectUnderHero(state);
            matchStackTraits(first, second);
            quiet(state);
            state.nhDisplay.pushKey(' '.charCodeAt(0));

            assert.equal(await pickup(1, state), 1);
            assert.equal(inv_cnt(false, state), 52);
            assert.equal(first.where === OBJ_DELETED
                || second.where === OBJ_DELETED, true);
        }
    });

test('pickup projects sight-created merge dependencies before observation',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        const target = carryGeneratedObject(state, ELVEN_DAGGER);
        const incoming = objectUnderHero(state);
        matchStackTraits(incoming, target);
        target.dknown = true;
        incoming.dknown = false;
        target.lamplit = true;
        incoming.lamplit = true;
        target.pickup_prev = true;
        const links = { nobj: incoming.nobj, nexthere: incoming.nexthere };
        const beforeDisco = [...state.svd.disco];
        const beforeToplines = state._ttyToplines;
        const beforeLootReset = state.loot_reset_justpicked;

        await assert.rejects(
            () => pickup(1, state),
            /mergeLightSources is not available/u,
        );
        assertStillOnBothFloorChains(state, incoming, links);
        assert.equal(incoming.dknown, false);
        assert.equal(target.quan, 1);
        assert.equal(target.pickup_prev, true);
        assert.deepEqual(state.svd.disco, beforeDisco);
        assert.equal(state._ttyToplines, beforeToplines);
        assert.equal(state.loot_reset_justpicked, beforeLootReset);
    });

test('sighted pickup discovers a merge and prints comparison before prinv',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        const target = carryGeneratedObject(state, ELVEN_DAGGER);
        const incoming = objectUnderHero(state);
        matchStackTraits(incoming, target);
        target.dknown = true;
        incoming.dknown = false;
        target.known = true;
        incoming.known = false;
        quiet(state);
        await ttyPline('An earlier message.', state);

        let reachedInput;
        const inputBoundary = new Promise((resolve) => {
            reachedInput = resolve;
        });
        let releaseInput;
        const inputGate = new Promise((resolve) => {
            releaseInput = resolve;
        });
        state._preNhgetchHook = async () => {
            state._preNhgetchHook = null;
            reachedInput();
            await inputGate;
        };
        const pendingPickup = pickup(1, state);
        await inputBoundary;
        assert.equal(target.quan, 2);
        assert.equal(target.known, true);
        assert.equal(incoming.where, OBJ_FREE);
        assert.equal(target.pickup_prev, false);

        // The comparison message dismisses the earlier line; prinv then
        // dismisses the comparison before replacing it with pickup feedback.
        state.nhDisplay.pushKey(' '.charCodeAt(0));
        state.nhDisplay.pushKey(' '.charCodeAt(0));
        releaseInput();

        assert.equal(await pendingPickup, 1);
        assert.equal(target.quan, 2);
        assert.equal(incoming.where, OBJ_DELETED);
        assert.equal(state.nhDisplay.inputQueueLength, 0);
        assert.match(
            state._ttyToplines ?? '',
            /^e - a \+0 elven dagger \(2 in total\)\.$/u,
        );
    });

test('pickup projects an earlier selected object as the later merge target',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        const later = objectUnderHero(state);
        const earlier = objectUnderHero(state);
        matchStackTraits(later, earlier);
        earlier.lamplit = true;
        later.lamplit = true;
        earlier.dknown = false;
        later.dknown = false;
        const floorHead = state.level.objects[state.u.ux][state.u.uy];
        const levelHead = state.level.objlist;
        const firstLinks = { nobj: earlier.nobj, nexthere: earlier.nexthere };
        const secondLinks = { nobj: later.nobj, nexthere: later.nexthere };
        const carriedHead = state.invent;
        carriedHead.pickup_prev = true;
        const beforeToplines = state._ttyToplines;

        await assert.rejects(
            () => pickup(1, state),
            /mergeLightSources is not available/u,
        );
        assert.equal(state.level.objects[state.u.ux][state.u.uy], floorHead);
        assert.equal(state.level.objlist, levelHead);
        assert.deepEqual(
            { nobj: earlier.nobj, nexthere: earlier.nexthere },
            firstLinks,
        );
        assert.deepEqual(
            { nobj: later.nobj, nexthere: later.nexthere },
            secondLinks,
        );
        assert.equal(earlier.where, OBJ_FLOOR);
        assert.equal(later.where, OBJ_FLOOR);
        assert.equal(earlier.dknown, false);
        assert.equal(later.dknown, false);
        assert.equal(state.invent, carriedHead);
        assert.equal(carriedHead.pickup_prev, true);
        assert.equal(state._ttyToplines, beforeToplines);
    });

test('pickup commits a selected pile in source order and merges later items',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        quiet(state);
        const later = objectUnderHero(state);
        const earlier = objectUnderHero(state);
        matchStackTraits(later, earlier);
        earlier.dknown = false;
        later.dknown = false;
        const previouslyCarried = state.invent;
        previouslyCarried.pickup_prev = true;
        const beforeLootReset = state.loot_reset_justpicked;

        assert.equal(await pickup(1, state), 1);
        assert.equal(state.level.objects[state.u.ux][state.u.uy], null);
        assert.equal(state.level.objlist === earlier, false);
        assert.equal(state.level.objlist === later, false);
        assert.equal(earlier.where, OBJ_INVENT);
        assert.equal(later.where, OBJ_DELETED);
        assert.equal(earlier.quan, 2);
        assert.equal(earlier.dknown, true);
        assert.equal(earlier.pickup_prev, true);
        assert.equal(previouslyCarried.pickup_prev, false);
        assert.equal(state.loot_reset_justpicked, beforeLootReset);
        assert.match(state._ttyToplines ?? '', /elven dagger \(2 in total\)/u);
    });

test('pickup finishes prinv through reassign when inventory letters move',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        state.flags.invlet_constant = false;
        const object = objectUnderHero(state);
        object.dknown = false;
        quiet(state);

        assert.equal(await pickup(1, state), 1);
        assert.equal(object.where, OBJ_INVENT);
        let expected = 'a';
        for (let carried = state.invent; carried; carried = carried.nobj) {
            if (carried.oclass === COIN_CLASS) continue;
            assert.equal(carried.invlet, expected);
            if (expected === 'z') expected = 'A';
            else expected = String.fromCharCode(expected.charCodeAt(0) + 1);
        }
        assert.match(
            state._ttyToplines ?? '',
            new RegExp(`^${object.invlet} - .*elven dagger`, 'u'),
        );
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

test('pickup refuses exact maximum-capacity equality before floor mutation',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        const object = objectUnderHero(state);
        object.dknown = false;
        object.owt = 2 * weight_cap(state) - inv_weight(state);
        const links = { nobj: object.nobj, nexthere: object.nexthere };
        const beforeLootReset = state.loot_reset_justpicked;

        assert.equal(
            inv_weight(state) + object.owt,
            2 * weight_cap(state),
        );
        await assert.rejects(
            () => pickup(1, state),
            (error) => error instanceof UnsupportedPickupError
                && /partial or failed lift/u.test(error.message),
        );
        assertStillOnBothFloorChains(state, object, links);
        assert.equal(object.dknown, false);
        assert.equal(state.loot_reset_justpicked, beforeLootReset);
    });

test('pickup admits one weight unit below the maximum-capacity refusal',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        state.flags.pickup_burden = EXT_ENCUMBER;
        const object = objectUnderHero(state);
        object.owt = 2 * weight_cap(state) - inv_weight(state) - 1;
        quiet(state);

        assert.equal(await pickup(1, state), 1);
        assert.equal(object.where, OBJ_INVENT);
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
    state.stairs = null;
    await assert.rejects(() => pickup(1, state), /unowned prior terrain/u);
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
