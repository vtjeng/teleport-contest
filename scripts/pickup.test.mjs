import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AUTOSELECT_SINGLE,
    BLINDED,
    BY_NEXTHERE,
    CORR,
    EXT_ENCUMBER,
    FUMBLING,
    HVY_ENCUMBER,
    INCLUDE_HERO,
    MOAT,
    MOD_ENCUMBER,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_MINVENT,
    OBJ_DELETED,
    PIT,
    DUST,
    ROOM,
    ROOMOFFSET,
    SHOPBASE,
    SIGNAL_NOMENU,
    SLT_ENCUMBER,
    STAIRS,
    STONE,
    STONE_RES,
    W_WEP,
    st_all,
    st_corpse,
    st_gloves,
    st_petrifies,
    st_resists,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import {
    calc_capacity,
    inv_cnt,
    inv_weight,
    weight_cap,
} from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import {
    M1_NOTAKE,
    PM_COCKATRICE,
    PM_DEATH,
    PM_KOBOLD_ZOMBIE,
    PM_LICHEN,
} from '../js/monsters.js';
import { mksobj_at } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { addinv, obj_extract_self } from '../js/invent.js';
import { make_engr_at } from '../js/engrave.js';
import {
    encumber_msg,
    describe_decor,
    observe_pickup_object,
    pickup,
    preflight_describe_decor_at,
    preflight_initial_pickup,
    query_objlist,
    rider_corpse_revival,
    u_safe_from_fatal_corpse,
    UnsupportedPickupError,
} from '../js/pickup.js';
import { clearTtyMessageWindow, ttyPline } from '../js/tty_message.js';
import {
    COIN_CLASS,
    CORPSE,
    ELVEN_DAGGER,
    FIGURINE,
    LEATHER_GLOVES,
    GOLD_PIECE,
    LUCKSTONE,
    SACK,
    SCR_IDENTIFY,
    SCR_SCARE_MONSTER,
    TOOL_CLASS,
    WEAPON_CLASS,
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
async function heroOnAnEmptySquare(extraOptions = '') {
    await runSegment({
        seed: 5501234,
        datetime: '20330607081011',
        nethackrc: 'OPTIONS=name:Picker,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup'
            + extraOptions,
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
    // Autopickup takes the early empty-square return at pickup.c:702-707.
    assert.equal(await pickup(1, state), 0);
    // pickup.c:1069, the `n == 0` return: query_objlist() counts nothing
    // allowed and pickup() answers 0 without a menu. In a running game only a
    // punished hero reaches it, because hack.c pickup_checks() keeps
    // dopickup() off an empty square and uchain is the one object
    // all_but_uchain() rejects.
    state.invent.pickup_prev = true;
    assert.equal(await pickup(0, state), 0);
    // pickup.c:780 guards reset_justpicked() with `n > 0`, so a selection of
    // nothing leaves every carried object's pickup_prev alone.
    assert.equal(state.invent.pickup_prev, true);
    // A counted pickup is the other interactive arm, "Pick %d of what?" with
    // the n_or_more selector, which this port stops at pickup.c:763 instead
    // of entering.
    await assert.rejects(
        () => pickup(-1, state),
        (error) => error instanceof UnsupportedPickupError
            && /counted subset/u.test(error.message),
    );
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

test('the initial pickup reads an engraving under the hero', async () => {
    const state = await heroOnAnEmptySquare();
    // engrave.c make_engr_at(). DUST is the type mklev.c:768 leaves beside a
    // trapped niche, the only engraving a new hero can start on.
    make_engr_at(
        state.u.ux,
        state.u.uy,
        'ad aerarium',
        'ad aerarium',
        0,
        DUST,
        objectGenerationEnv({ state }),
    );
    quiet(state);

    // allmain.c:73-75 runs the admission above before pickup(1). An engraving
    // is not one of the families it holds back, because pickup.c:702-709 ends
    // its no-object arm in read_engr_at().
    assert.doesNotThrow(() => preflight_initial_pickup(state));
    assert.equal(await pickup(1, state), 0);

    // engrave.c:332-333 and 396-397. Both lines fit one top line, so the pair
    // asks for no --More--; "ad aerarium" ends in a letter, which is why
    // read_engr_at() supplies the closing period itself.
    assert.equal(
        state._ttyToplines,
        'Something is written here in the dust.'
        + '  You read: "ad aerarium".',
    );
    assert.deepEqual(
        [state.head_engr.eread, state.head_engr.erevealed],
        [true, true],
    );
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

test('pickup projects merged-gold weight with carry_count rounding', async () => {
    const state = await heroOnAnEmptySquare();
    state.flags.pickup = true;
    state.flags.pickup_burden = EXT_ENCUMBER;
    const carriedGold = carryGeneratedObject(state, GOLD_PIECE);
    // pickup.c GOLD_WT rounds each 50-coin stack to one unit, while their
    // combined 100 coins still weigh one; merging therefore adds zero weight.
    carriedGold.quan = 50;
    carriedGold.owt = 1;
    const floorGold = typedObjectUnderHero(state, GOLD_PIECE);
    floorGold.quan = 50;
    floorGold.owt = 1;
    // One unit below the absolute lift boundary distinguishes C's zero delta
    // from the rejected full floor-stack weight used by the old planner.
    const filler = state.invent.nobj;
    filler.owt += 2 * weight_cap(state) - inv_weight(state) - 1;
    quiet(state);

    assert.equal(inv_weight(state), 2 * weight_cap(state) - 1);
    assert.equal(await pickup(1, state), 1);
    assert.equal(carriedGold.quan, 100);
    assert.equal(floorGold.where, OBJ_DELETED);
    assert.equal(inv_weight(state), 2 * weight_cap(state) - 1);
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

// pickup_object() is one C function and both arms reach it, so narrowing the
// corpse refusal opened the corpse arm for autopickup as well as for `,`.
// The interactive half is covered by the recorded matrix; this is the
// autopickup half, which otherwise has no test at all -- the only corpse case
// on this arm is a cockatrice arrival, which refuses.
test('autopickup lifts a corpse that cannot petrify on touch', async () => {
    const state = await heroOnAnEmptySquare();
    const corpse = typedObjectUnderHero(state, CORPSE);
    // A lichen fails mondata.h touch_petrifies(), so
    // u_safe_from_fatal_corpse() answers TRUE on its st_petrifies term and
    // both fatal_corpse_mistake() and rider_corpse_revival() return FALSE.
    corpse.corpsenm = PM_LICHEN;
    state.flags.pickup = true;

    assert.equal(await pickup(1, state), 1);
    assert.equal(corpse.where, OBJ_INVENT);
    assert.equal(state.level.objects[state.u.ux][state.u.uy], null);
    assert.equal(state._ttyToplines, `${corpse.invlet} - a lichen corpse.`);
});

// C ref: pickup.c autopick_testobj():956-957.  When pickup_types is non-empty,
// objects whose oclass is not in the list go to remaining instead of being
// selected for autopickup.  check_here() then prints "You see here ...".
test('autopickup excludes objects whose class is not in pickup_types',
    async () => {
        const state = await heroOnAnEmptySquare();
        // An elven dagger is WEAPON_CLASS.  Set pickup_types to COIN_CLASS
        // only, which excludes WEAPON_CLASS.
        const dagger = objectUnderHero(state);
        state.flags.pickup = true;
        state.flags.pickup_types = [COIN_CLASS];
        // The hero stands on the D:1 upstairs, whose dfeature_at() line
        // would precede the object message and ask for a --More--.
        state.stairs = null;
        quiet(state);

        assert.equal(await pickup(1, state), 0);
        // The dagger remains on the floor because autopick_testobj() excluded
        // it.
        assert.equal(dagger.where, OBJ_FLOOR);
        assert.equal(
            state.level.objects[state.u.ux][state.u.uy],
            dagger,
        );
        // check_here(false) printed the look_here message.
        assert.match(state._ttyToplines ?? '', /elven dagger/u);
    });

test('autopickup includes objects whose class is in pickup_types',
    async () => {
        const state = await heroOnAnEmptySquare();
        // An elven dagger is WEAPON_CLASS.  Set pickup_types to include it.
        const dagger = objectUnderHero(state);
        state.flags.pickup = true;
        state.flags.pickup_types = [WEAPON_CLASS];

        assert.equal(await pickup(1, state), 1);
        // The dagger was picked up.
        assert.equal(dagger.where, OBJ_INVENT);
        assert.equal(state.level.objects[state.u.ux][state.u.uy], null);
    });

test('autopickup picks up everything when pickup_types is empty',
    async () => {
        const state = await heroOnAnEmptySquare();
        // Empty pickup_types means all classes are eligible.
        const dagger = objectUnderHero(state);
        state.flags.pickup = true;
        state.flags.pickup_types = [];

        assert.equal(await pickup(1, state), 1);
        assert.equal(dagger.where, OBJ_INVENT);
        assert.equal(state.level.objects[state.u.ux][state.u.uy], null);
    });

// pickup.c u_safe_from_fatal_corpse() (272-281). Each row names the term
// that answers TRUE, or the state in which every term is FALSE. The species
// come from mondata.h:200-201, where touch_petrifies() is a species identity
// test -- `ptr == &mons[PM_COCKATRICE] || ptr == &mons[PM_CHICKATRICE]` -- and
// not a flag test, so a cockatrice passes it and a lichen does not. Anyone
// extending this table should read the C comment at :202: Medusa fails
// touch_petrifies() and petrifies only when eaten, through flesh_petrifies().
const STONING_ROWS = [
    ['gloves stop the touch whatever the corpse is',
        { gloves: true, otyp: CORPSE, corpsenm: PM_COCKATRICE }, true],
    ['a non-corpse object is never a stoning risk',
        { gloves: false, otyp: ELVEN_DAGGER, corpsenm: PM_COCKATRICE }, true],
    ['a species that does not petrify on touch is safe bare-handed',
        { gloves: false, otyp: CORPSE, corpsenm: PM_LICHEN }, true],
    ['stoning resistance survives the bare-handed touch',
        { gloves: false, otyp: CORPSE, corpsenm: PM_COCKATRICE,
            resistant: true }, true],
    ['a bare hand on a petrifying corpse fails every term',
        { gloves: false, otyp: CORPSE, corpsenm: PM_COCKATRICE }, false],
];

test('u_safe_from_fatal_corpse answers each stoning check', async () => {
    for (const [label, row, expected] of STONING_ROWS) {
        const state = await heroOnAnEmptySquare();
        state.uarmg = row.gloves ? { otyp: LEATHER_GLOVES } : null;
        state.u.uprops[STONE_RES].intrinsic = row.resistant ? 1 : 0;
        const object = { otyp: row.otyp, corpsenm: row.corpsenm };
        assert.equal(
            u_safe_from_fatal_corpse(object, st_all, state), expected, label,
        );
    }
});

test('u_safe_from_fatal_corpse reads only the terms its mask names',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.uarmg = { otyp: LEATHER_GLOVES };
        state.u.uprops[STONE_RES].intrinsic = 0;
        const corpse = { otyp: CORPSE, corpsenm: PM_COCKATRICE };
        // st_gloves alone is the term the gloves answer.
        assert.equal(u_safe_from_fatal_corpse(corpse, st_gloves, state), true);
        // Without it, the same hero and corpse fail the other three.
        assert.equal(
            u_safe_from_fatal_corpse(
                corpse, st_corpse | st_petrifies | st_resists, state,
            ),
            false,
        );
    });

test('pickup refuses the corpses its helpers cannot carry through',
    async () => {
        // fatal_corpse_mistake(): bare hands on a petrifying corpse reach
        // instapetrify() or a stone-golem polymorph, neither of them ported.
        const petrifying = await heroOnAnEmptySquare();
        petrifying.uarmg = null;
        const cockatrice = typedObjectUnderHero(petrifying, CORPSE);
        cockatrice.corpsenm = PM_COCKATRICE;
        cockatrice.dknown = false;
        petrifying.invent.pickup_prev = true;
        await assert.rejects(
            () => pickup(0, petrifying),
            (error) => error instanceof UnsupportedPickupError
                && /petrifying corpse/u.test(error.message),
        );
        assert.equal(cockatrice.where, OBJ_FLOOR);
        // The refusal is a preflight one, so it lands before
        // reset_justpicked() and before pickup_object()'s observe_object().
        assert.equal(petrifying.invent.pickup_prev, true);
        assert.equal(cockatrice.dknown, false);
        // The same corpse under gloves is the st_gloves term of the live
        // path, and the pickup goes through.
        petrifying.uarmg = { otyp: LEATHER_GLOVES };
        quiet(petrifying);
        assert.equal(await pickup(0, petrifying), 1);
        assert.equal(cockatrice.where, OBJ_INVENT);

        // rider_corpse_revival(): a Rider's corpse calls revive_corpse().
        // The hero's own hands lift it, so the refusal names C's "touch"
        // phrasing rather than the telekinetic one.
        const rider = await heroOnAnEmptySquare();
        rider.uarmg = { otyp: LEATHER_GLOVES };
        const death = typedObjectUnderHero(rider, CORPSE);
        death.corpsenm = PM_DEATH;
        death.dknown = false;
        rider.invent.pickup_prev = true;
        await assert.rejects(
            () => pickup(0, rider),
            (error) => error instanceof UnsupportedPickupError
                && /Rider's corpse reviving at your touch$/u
                    .test(error.message),
        );
        assert.equal(death.where, OBJ_FLOOR);
        assert.equal(rider.invent.pickup_prev, true);
        assert.equal(death.dknown, false);
        // Called directly the way zap.c and dothrow.c call it, with a NULL
        // object and with the remote phrasing.
        assert.equal(rider_corpse_revival(null, false, rider), false);
        assert.throws(
            () => rider_corpse_revival(death, true, rider),
            /attempted acquisition$/u,
        );
    });

test('pickup refuses a stack that would merge into the wielded weapon',
    async () => {
        const state = await heroOnAnEmptySquare();
        const wielded = state.invent;
        state.uwep = wielded;
        wielded.owornmask = W_WEP;
        const incoming = objectUnderHero(state);
        matchStackTraits(incoming, wielded);
        incoming.owornmask = 0;
        // pickup.c:1881 raises gm.mrg_to_wielded so pickup_prinv() drops the
        // "(weapon in hand)" suffix objnam.c:1561 would otherwise add.
        await assert.rejects(
            () => pickup(0, state),
            (error) => error instanceof UnsupportedPickupError
                && /wielded weapon/u.test(error.message),
        );
        assert.equal(incoming.where, OBJ_FLOOR);
        assert.equal(wielded.quan, 1);
    });

test('query_objlist counts what the callback allows', async () => {
    const state = await heroOnAnEmptySquare();
    const first = objectUnderHero(state);
    const second = objectUnderHero(state);
    const flags = BY_NEXTHERE | AUTOSELECT_SINGLE;
    const head = state.level.objects[state.u.ux][state.u.uy];

    // Two allowed objects fall past both early returns into the menu.
    assert.throws(
        () => query_objlist(head, flags, () => true, state),
        (error) => error instanceof UnsupportedPickupError
            && /query_objlist\(\) menu/u.test(error.message),
    );
    // One allowed object returns through pickup.c:1072 with its own quantity.
    const single = query_objlist(head, flags, (obj) => obj === first, state);
    assert.equal(single.n, 1);
    assert.deepEqual(single.pick_list, [{ obj: first, count: first.quan }]);
    // Without AUTOSELECT_SINGLE the same list reaches the menu instead.
    assert.throws(
        () => query_objlist(head, BY_NEXTHERE, (obj) => obj === second, state),
        (error) => error instanceof UnsupportedPickupError
            && /query_objlist\(\) menu/u.test(error.message),
    );
    // pickup.c:1069, where SIGNAL_NOMENU picks -1 over 0. dopickup() never
    // sets it, so only this test separates the two returns.
    assert.deepEqual(
        query_objlist(head, flags, () => false, state),
        { n: 0, pick_list: [] },
    );
    assert.deepEqual(
        query_objlist(head, flags | SIGNAL_NOMENU, () => false, state),
        { n: -1, pick_list: [] },
    );
    // An empty square answers before the counting loop runs.
    assert.deepEqual(
        query_objlist(null, flags | SIGNAL_NOMENU, () => true, state),
        { n: 0, pick_list: [] },
    );
});

test('query_objlist refuses the lists this port does not walk', async () => {
    const state = await heroOnAnEmptySquare();
    const object = objectUnderHero(state);
    const flags = BY_NEXTHERE | AUTOSELECT_SINGLE;
    // INCLUDE_HERO adds the swallowed hero as a fake extra entry.
    assert.throws(
        () => query_objlist(object, flags | INCLUDE_HERO, () => true, state),
        (error) => error instanceof UnsupportedPickupError
            && /engulfed hero/u.test(error.message),
    );
    // An engulfer's inventory is walked by nobj and can clear
    // AUTOSELECT_SINGLE for a worn item.
    object.where = OBJ_MINVENT;
    assert.throws(
        () => query_objlist(object, flags, () => true, state),
        (error) => error instanceof UnsupportedPickupError
            && /engulfer's inventory/u.test(error.message),
    );
});

// The smallest level shape shk.c costly_spot() calls billable: a shop room
// whose resident keeps its own room number, with the hero on an interior
// square and the shopkeeper standing one square west of her.
function makeShopUnderHero(state) {
    const roomno = ROOMOFFSET;
    const room = state.level.rooms[0];
    room.rtype = SHOPBASE;
    state.level.flags.has_shop = true;
    const interior = [[state.u.ux, state.u.uy], [state.u.ux - 1, state.u.uy]];
    for (const [x, y] of interior) {
        Object.assign(state.level.at(x, y), { typ: ROOM, roomno, edge: false });
    }
    room.resident = {
        isshk: true,
        mpeaceful: true,
        mx: state.u.ux - 1,
        my: state.u.uy,
        mextra: {
            eshk: {
                shoproom: roomno,
                shoplevel: { ...state.u.uz },
                shk: { x: state.u.ux - 1, y: state.u.uy },
            },
        },
    };
    return room;
}

test('the interactive arm refuses a shop square', async () => {
    const state = await heroOnAnEmptySquare();
    const stock = objectUnderHero(state);
    makeShopUnderHero(state);
    // all_but_uchain() allows the stock, and pick_obj() would then bill it
    // through addtobill() and remote_burglary().
    await assert.rejects(
        () => pickup(0, state),
        (error) => error instanceof UnsupportedPickupError
            && /shop floor/u.test(error.message),
    );
    assert.equal(stock.where, OBJ_FLOOR);

    // The same square with the shopkeeper standing on it is not costly, which
    // is the second conjunct of shk.c costly_spot().
    const keeper = state.level.rooms[0].resident;
    Object.assign(keeper, { mx: state.u.ux, my: state.u.uy });
    Object.assign(keeper.mextra.eshk.shk, { x: state.u.ux, y: state.u.uy });
    assert.equal(await pickup(0, state), 1);
    assert.equal(stock.where, OBJ_INVENT);
});

test('an autopickup that lifts nothing leaves the pile described as untouched',
    async () => {
        const state = await heroOnAnEmptySquare();
        state.flags.pickup = true;
        // invent.c look_here() skips naming a pile at or above the limit and
        // counts it instead, which is the one output that reads
        // LOOKHERE_PICKED_SOME without also pricing shop stock.
        state.flags.pile_limit = 2;
        // The hero still stands on the D:1 upstairs, whose dfeature_at() line
        // would precede the count and ask for a --More-- no key answers.
        state.stairs = null;
        objectUnderHero(state);
        objectUnderHero(state);
        makeShopUnderHero(state);
        quiet(state);

        // Every object on the square is stock, so autopick() selected none of
        // them and pickup.c:903 passes check_here() a FALSE picked_some.
        assert.equal(await pickup(1, state), 0);
        assert.equal(state._ttyToplines, 'There are two objects here.');
    });


// pickup.c:1757-1758 raises the burden limit to flags.pickup_burden, and
// options.c optfn_pickup_burden() is what a configuration file writes there.
// The tests above set that field directly; this one drives it from the rc
// statement a player would write, which is the only route the running game
// has to it.
test('a configured pickup_burden raises the limit pickup admits', async () => {
    // The switch reads lowc(*op), so 'n' is the straiNed arm, HVY_ENCUMBER.
    // One weight lands on that threshold exactly, which is one step above the
    // MOD_ENCUMBER an rc that never names the option leaves behind.
    const configured = await heroOnAnEmptySquare(
        '\nOPTIONS=pickup_burden:n',
    );
    assert.equal(configured.flags.pickup_burden, HVY_ENCUMBER);
    const heavy = objectUnderHero(configured);
    heavy.owt = weightForCapacity(configured, HVY_ENCUMBER);
    configured.flags.pickup = true;
    quiet(configured);
    assert.equal(await pickup(1, configured), 1);
    assert.equal(heavy.where, OBJ_INVENT);
    assert.match(
        configured._ttyToplines ?? '', /^You have much trouble lifting/u,
    );

    // The same weight on the same hero without the statement: the limit is
    // MOD_ENCUMBER, the lift crosses it, and C would ask ynq() -- which this
    // port refuses rather than answers.
    const stock = await heroOnAnEmptySquare();
    assert.equal(stock.flags.pickup_burden, MOD_ENCUMBER);
    const same = objectUnderHero(stock);
    same.owt = weightForCapacity(stock, HVY_ENCUMBER);
    stock.flags.pickup = true;
    quiet(stock);
    await assert.rejects(
        () => pickup(1, stock),
        (error) => error instanceof UnsupportedPickupError
            && /requiring a burden prompt/u.test(error.message),
    );
    assert.equal(same.where, OBJ_FLOOR);
});

test('pickup refuses the object types it never learned to lift', async () => {
    // pickup.c:1826 hands an artifact to touch_artifact(), which prints and
    // can blast the hero.
    const artifact = await heroOnAnEmptySquare();
    const blade = objectUnderHero(artifact);
    blade.oartifact = 1;
    await assert.rejects(
        () => pickup(0, artifact),
        (error) => error instanceof UnsupportedPickupError
            && /of an artifact/u.test(error.message),
    );
    assert.equal(blade.where, OBJ_FLOOR);

    // pickup.c:1832-1862 rewrites obj->spe, unblesses, or turns the whole
    // stack to dust before it ever reaches lift_object().
    const scare = await heroOnAnEmptySquare();
    const scroll = typedObjectUnderHero(scare, SCR_SCARE_MONSTER);
    await assert.rejects(
        () => pickup(0, scare),
        (error) => error instanceof UnsupportedPickupError
            && /scroll of scare monster/u.test(error.message),
    );
    assert.equal(scroll.where, OBJ_FLOOR);
    assert.equal(scroll.spe, 0);
});

test('a punished hero finds only the chain on the square', async () => {
    const state = await heroOnAnEmptySquare();
    const chain = objectUnderHero(state);
    // all_but_uchain() is the one query_objlist() callback that rejects
    // anything, and the ball and chain is the only thing it rejects. Nothing
    // ported punishes the hero, so this is the sole route to pickup.c:1069.
    state.uchain = chain;
    assert.equal(await pickup(0, state), 0);
    assert.equal(chain.where, OBJ_FLOOR);
    assert.equal(state._ttyToplines, '');
});

test('the interactive arm leaves the engraving unread', async () => {
    const state = await heroOnAnEmptySquare();
    const object = objectUnderHero(state);
    make_engr_at(
        state.u.ux,
        state.u.uy,
        'Elbereth',
        'Elbereth',
        0,
        DUST,
        objectGenerationEnv({ state }),
    );
    quiet(state);

    // pickup.c:903 guards check_here() with `if (autopickup)`, and
    // check_here() is what reads the engraving once the square is bare.
    assert.equal(await pickup(0, state), 1);
    assert.equal(object.where, OBJ_INVENT);
    assert.match(state._ttyToplines ?? '', /elven dagger/u);
});
