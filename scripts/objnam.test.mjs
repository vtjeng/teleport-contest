import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ART_EXCALIBUR,
    ART_EYES_OF_THE_OVERWORLD,
    ART_GIANTSLAYER,
    ART_GRIMTOOTH,
    ART_HEART_OF_AHRIMAN,
    ART_ORB_OF_DETECTION,
    ART_SUNSWORD,
    init_artifacts,
} from '../js/artifacts.js';
import {
    BEAR_TRAP,
    BLINDED,
    COLNO,
    CORR,
    CXN_ARTICLE,
    CXN_NOCORPSE,
    CXN_NORMAL,
    CXN_PFX_THE,
    CXN_SINGULAR,
    DOOR,
    IN_SIGHT,
    LAVAPOOL,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    MSGTYP_MASK_REP_SHOW,
    MSGTYP_NOREP,
    MSGTYP_NOSHOW,
    OBJ_FLOOR,
    OBJ_CONTAINED,
    OBJ_FREE,
    OBJ_INVENT,
    NON_PM,
    PLNMSG_ONE_ITEM_HERE,
    PIT,
    ROOM,
    ROWNO,
    GLIB,
    ICE,
    LEVITATION,
    W_WEP,
    W_AMUL,
    W_ARM,
    W_ARMG,
    W_ARMH,
    W_BALL,
    W_CHAIN,
    W_TOOL,
    W_SWAPWEP,
    W_QUIVER,
    BURN_OBJECT,
    TIMER_OBJECT,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import {
    dolook,
    look_here,
    preflight_look_here,
} from '../js/invent.js';
import { init_objects } from '../js/o_init.js';
import { append_price_quote } from '../js/shk.js';
import { LEFT_HANDED, RIGHT_HANDED } from '../js/u_init.js';
import { newObject } from '../js/obj.js';
import {
    An,
    The,
    Tobjnam,
    an,
    aobjnam,
    cloak_simple_name,
    cxname,
    cxname_singular,
    corpse_xname,
    otense,
    gloves_simple_name,
    helm_simple_name,
    distant_name,
    doname_with_price,
    isPoisonable,
    killer_xname,
    just_an,
    is_plural,
    not_fully_identified,
    obj_typename,
    simpleonames,
    simple_typename,
    suit_simple_name,
    donameFresh,
    concatFormatNameBody,
    concatNameBody,
    erosion_matters,
    vtense,
    xnameFresh,
    yname,
    Yname2,
    Yobjnam2,
    obj_is_pname,
} from '../js/objnam.js';

import {
    MZ_MEDIUM,
    PM_ARCHON,
    PM_CLERIC,
    PM_COCKATRICE,
    PM_MEDUSA,
    PM_NEWT,
    PM_SAMURAI,
    PM_WIZARD_OF_YENDOR,
    monst_globals_init,
    PM_FOX,
    M1_HUMANOID,
} from '../js/monsters.js';
import { create_region } from '../js/region.js';
import {
    ALCHEMY_SMOCK,
    CHEST,
    CHAIN_MAIL,
    CORPSE,
    CRYSTAL_BALL,
    OIL_LAMP,
    DART,
    DWARVISH_IRON_HELM,
    ELVEN_LEATHER_HELM,
    FIGURINE,
    FOOD_RATION,
    GLOB_OF_GRAY_OOZE,
    GAUNTLETS_OF_POWER,
    GOLD_PIECE,
    HELM_OF_BRILLIANCE,
    LEATHER_ARMOR,
    LEATHER_GLOVES,
    LEATHER_JACKET,
    LENSES,
    LONG_SWORD,
    MUMMY_WRAPPING,
    OBJ_DESCR,
    ORCISH_DAGGER,
    POT_HEALING,
    POT_WATER,
    RED_DRAGON_SCALE_MAIL,
    RED_DRAGON_SCALES,
    ROBE,
    SLIME_MOLD,
    STATUE,
    TALLOW_CANDLE,
    WAN_SLEEP,
    objects_globals_init,
    RIN_PROTECTION,
    SACK,
    LARGE_BOX,
    TIN,
    T_SHIRT,
    AMULET_OF_ESP,
    BLINDFOLD,
    AKLYS,
    ARROW,
    ATHAME,
    GRAPPLING_HOOK,
    MAGIC_MARKER,
    PICK_AXE,
    TWO_HANDED_SWORD,
    UNICORN_HORN,
    DAGGER,
    DIAMOND,
    CROSSBOW_BOLT,
    AMULET_OF_YENDOR,
    BAG_OF_TRICKS,
    EGG,
    FAKE_AMULET_OF_YENDOR,
    RIN_ADORNMENT,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    LUCKSTONE,
} from '../js/objects.js';
import { roles } from '../js/roles.js';
import { start_timer, timeout_globals_init } from '../js/timeout.js';
import { CASES, loadWornGloveNameRecipe } from './run-worn-glove-name.mjs';

const OBJNAM_SOURCE = readFileSync('nethack-c/upstream/src/objnam.c', 'utf8');
const OBJNAM_JS_SOURCE = readFileSync('js/objnam.js', 'utf8');
const ARTIFACT_SOURCE = readFileSync('nethack-c/upstream/src/artifact.c', 'utf8');
const ARTIFACT_JS_SOURCE = readFileSync('js/artifacts.js', 'utf8');

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}

function namingState() {
    const archeologist = roles.find((role) => role.filecode === 'Arc');
    const state = {
        context: {
            // Object and monster id 1 is reserved; startup begins from 2.
            ident: 2,
            current_fruit: 1,
        },
        flags: {
            implicit_uncursed: true,
            initalign: 0,
        },
        gf: {
            ffruit: {
                fid: 1,
                fname: 'slime mold',
                nextf: null,
            },
        },
        iflags: {
            override_ID: false,
            pricequotes: false,
        },
        program_state: {
            gameover: false,
            in_moveloop: false,
        },
        u: {
            uprops: [],
        },
        urole: {
            ...archeologist,
        },
    };
    objects_globals_init(state);
    // Zero choices deterministically initialize every randomized description.
    init_objects(state, () => 0);
    timeout_globals_init(state);
    monst_globals_init(state);
    init_artifacts(state);
    return state;
}

function objectOf(state, otyp, overrides = {}) {
    const type = state.objects[otyp];
    return newObject({
        corpsenm: NON_PM,
        oclass: type.oc_class,
        otyp,
        // One item exercises doname()'s article branch by default.
        quan: 1,
        ...overrides,
    });
}

test('An capitalizes the C article helper result for valid nonempty names', () => {
    assert.equal(An('ogre'), 'An ogre');
    assert.equal(An('troll'), 'A troll');
});

test('simple_typename drops the description and the user-assigned name', () => {
    const state = namingState();
    // objnam.c simple_typename() over obj_typename(). An undiscovered ring's
    // full type name carries its randomized appearance in parentheses; the
    // simple name stops at the " ". init_objects(state, () => 0) above picks
    // the first description of each shuffled class, which for RING_CLASS is
    // "black onyx".
    assert.equal(obj_typename(RIN_PROTECTION, state), 'ring (black onyx)');
    assert.equal(simple_typename(RIN_PROTECTION, state), 'ring');

    // Discovered, the actual name arrives and the description is still cut.
    state.objects[RIN_PROTECTION].oc_name_known = 1;
    assert.equal(
        obj_typename(RIN_PROTECTION, state), 'ring of protection (black onyx)',
    );
    assert.equal(simple_typename(RIN_PROTECTION, state), 'ring of protection');

    // C suppresses the player's alias in the simple name and restores it.
    state.objects[RIN_PROTECTION].oc_uname = 'zappy';
    assert.equal(
        obj_typename(RIN_PROTECTION, state),
        'ring of protection called zappy (black onyx)',
    );
    assert.equal(simple_typename(RIN_PROTECTION, state), 'ring of protection');
    assert.equal(state.objects[RIN_PROTECTION].oc_uname, 'zappy');

    // A type whose name is its whole answer passes through unchanged. CHEST
    // is what dat/themerms.lua's Storeroom dresses its mimics in, and
    // apply.c:435 prints this string verbatim.
    assert.equal(simple_typename(CHEST, state), 'chest');
    // obj_typename() appends " gem" to a gem's description inside the same
    // arm, with no parentheses, so the strip leaves the suffix standing.
    assert.equal(simple_typename(DIAMOND, state), 'white gem');
});

test('simpleonames preserves a named-fruit disguise', () => {
    const state = namingState();
    state.gf = {
        ffruit: { fname: 'slice of pizza', fid: 7, nextf: null },
    };
    const fruit = objectOf(state, SLIME_MOLD, { spe: 7 });

    assert.equal(simpleonames(fruit, state), 'slice of pizza');
    fruit.quan = 2;
    assert.equal(simpleonames(fruit, state), 'slices of pizza');
});

test('simple suit names preserve dragon, suffix, and fallback categories',
    () => {
        const state = namingState();
        assert.equal(
            suit_simple_name(objectOf(state, RED_DRAGON_SCALE_MAIL), state),
            'dragon mail',
        );
        assert.equal(
            suit_simple_name(objectOf(state, RED_DRAGON_SCALES), state),
            'dragon scales',
        );
        assert.equal(
            suit_simple_name(objectOf(state, CHAIN_MAIL), state),
            'mail',
        );
        assert.equal(
            suit_simple_name(objectOf(state, LEATHER_JACKET), state),
            'jacket',
        );
        assert.equal(
            suit_simple_name(objectOf(state, LEATHER_ARMOR), state),
            'suit',
        );
        assert.equal(suit_simple_name(null, state), 'suit');
    });

test('simple cloak names retain the discovery-sensitive smock branch', () => {
    const state = namingState();
    assert.equal(cloak_simple_name(objectOf(state, ROBE), state), 'robe');
    assert.equal(
        cloak_simple_name(objectOf(state, MUMMY_WRAPPING), state),
        'wrapping',
    );
    const smock = objectOf(state, ALCHEMY_SMOCK, { dknown: true });
    assert.equal(cloak_simple_name(smock, state), 'apron');
    state.objects[ALCHEMY_SMOCK].oc_name_known = true;
    assert.equal(cloak_simple_name(smock, state), 'smock');
    assert.equal(cloak_simple_name(null, state), 'cloak');
});

test('simple helm names distinguish hard headgear from hats', () => {
    const state = namingState();
    assert.equal(
        helm_simple_name(objectOf(state, DWARVISH_IRON_HELM), state),
        'helm',
    );
    assert.equal(
        helm_simple_name(objectOf(state, HELM_OF_BRILLIANCE), state),
        'helm',
    );
    assert.equal(
        helm_simple_name(objectOf(state, ELVEN_LEATHER_HELM), state),
        'hat',
    );
    assert.equal(helm_simple_name(null, state), 'hat');
});

test('simple glove names use only the currently discoverable text', () => {
    const state = namingState();
    const gauntlets = objectOf(state, GAUNTLETS_OF_POWER, { dknown: true });
    assert.equal(gloves_simple_name(gauntlets, state), 'gloves');
    state.objects[GAUNTLETS_OF_POWER].oc_name_known = true;
    assert.equal(gloves_simple_name(gauntlets, state), 'gauntlets');
    assert.equal(
        gloves_simple_name(objectOf(state, LEATHER_GLOVES, {
            dknown: true,
        }), state),
        'gloves',
    );
    assert.equal(gloves_simple_name(null, state), 'gloves');
});

test('xname observes sighted objects but preserves blind descriptions', () => {
    const sighted = namingState();
    const visiblePotion = objectOf(sighted, POT_HEALING);
    const description = OBJ_DESCR(sighted.objects[POT_HEALING], sighted);

    assert.equal(xnameFresh(visiblePotion, sighted), `${description} potion`);
    assert.equal(visiblePotion.dknown, true);
    assert.equal(sighted.objects[POT_HEALING].oc_encountered, 1);

    const blind = namingState();
    blind.u.uprops[BLINDED] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    const unseenPotion = objectOf(blind, POT_HEALING, {
        // Instance knowledge does not reveal an undiscovered type.
        known: true,
    });

    assert.equal(xnameFresh(unseenPotion, blind), 'potion');
    assert.equal(unseenPotion.dknown, false);
    assert.equal(blind.objects[POT_HEALING].oc_encountered, 0);
});

test('objnam source helpers retain searchable C names in the immutable adapter', () => {
    assert.match(OBJNAM_SOURCE,
        /nextobuf\(void\)[\s\S]*?obufidx[\s\S]*?return obufs\[obufidx\]/u);
    assert.match(OBJNAM_SOURCE,
        /char \*\nxname\(struct obj \*obj\)[\s\S]*?return xname_flags\(obj, CXN_NORMAL\)/u);
    assert.match(OBJNAM_SOURCE, /xname_flags\([\s\S]*?CXN_SINGULAR/u);
    assert.match(OBJNAM_SOURCE,
        /Japanese_item_name\(int i, const char \*ordinaryname\)/u);
    assert.equal(
        [...OBJNAM_SOURCE.matchAll(/Japanese_item_name\((?:otyp|typ), actualn\)/gu)].length,
        2,
    );
    assert.equal(
        [...OBJNAM_JS_SOURCE.matchAll(/JAPANESE_ITEM_NAMES\.get\(/gu)].length,
        1,
    );
    assert.match(OBJNAM_JS_SOURCE, /function nextobuf\(value = ''\)/u);
    assert.match(OBJNAM_JS_SOURCE, /export function xname_flags\(/u);
    assert.match(OBJNAM_JS_SOURCE, /export function xname\(/u);
    assert.match(OBJNAM_JS_SOURCE, /function Japanese_item_name\(otyp, ordinaryName\)/u);
    assert.match(OBJNAM_JS_SOURCE, /actualn = Japanese_item_name\(otyp, actualn\)/u);
    assert.match(OBJNAM_JS_SOURCE, /actual = Japanese_item_name\(obj\.otyp, actual\)/u);
    assert.match(OBJNAM_JS_SOURCE, /base = nextobuf\(base\)/u);
});

// C objnam.c xname_flags() default arm formats numeric oclass/otyp/spe and
// then calls the discarded pline.c:impossible() diagnostic.
test('xname preserves the numeric invalid-class diagnostic result', () => {
    const state = namingState();
    game.unported = new Set();
    const invalid = objectOf(state, FOOD_RATION, {
        oclass: '?',
        spe: 3,
    });
    assert.equal(xnameFresh(invalid, state),
        `glorkum ${'?'.charCodeAt(0)} ${FOOD_RATION} 3`);
    assert.ok(game.unported.has('pline.c impossible'));
});

test('type discovery and holy water follow class branches', () => {
    const state = namingState();
    state.objects[POT_HEALING].oc_name_known = 1;
    assert.equal(
        donameFresh(objectOf(state, POT_HEALING), state),
        'a potion of healing',
    );

    state.objects[POT_WATER].oc_name_known = 1;
    assert.equal(
        donameFresh(objectOf(state, POT_WATER, {
            bknown: true,
            blessed: true,
        }), state),
        'a potion of holy water',
    );
});

// look_here() reads more of the level than the naming helpers do: the object
// under the hero, the region and trap lists, the stairway list, and
// flags.pile_limit. This builds the smallest state that satisfies all of them
// for a hero standing on one ordinary square.
function lookState(typ, otmp, { blind = false } = {}) {
    const state = namingState();
    state.u.ux = state.u.uy = 1;
    state.u.uz = { dnum: 0, dlevel: 1 };
    state.flags.pile_limit = 5;
    state.stairs = null;
    state.level = {
        at: () => ({ typ }),
        objects: [[null, null], [null, otmp]],
        regions: [],
        traps: [],
    };
    if (blind) {
        state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
        // can_reach_floor() needs a hero form; an unpolymorphed Archeologist
        // stands on the floor and can reach it.
        // MZ_MEDIUM is monsters.h's MZ_HUMAN, the unpolymorphed hero size.
        state.youmonst = { data: { mflags1: 0, msize: MZ_MEDIUM, mattk: [] } };
    }
    return state;
}

function pileLookState({
    blind = false,
    count = 2,
    first = DART,
    firstOverrides = {},
    typ = ROOM,
} = {}) {
    const state = lookState(typ, null, { blind });
    const types = [first, FOOD_RATION, DAGGER, ARROW, POT_HEALING];
    let head = null;
    for (let index = count - 1; index >= 0; --index) {
        // Reuse the five ordinary nameable types when a wording boundary
        // needs a longer synthetic chain. The caller supplies `count` as
        // check_here()'s obj_cnt, while look_here() traverses this chain only
        // to enforce the port's supported menu window. The fixture bypasses
        // floor-stack merging so those two values remain equal.
        head = objectOf(state, types[index % types.length], {
            dknown: false,
            nexthere: head,
            ...(index === 0 ? firstOverrides : {}),
        });
    }
    state.level.objects[1][1] = head;
    return { head, state };
}

test('single-object look_here reports the item and records its message kind',
    async () => {
        const dart = objectOf(namingState(), DART);
        const state = lookState(ROOM, dart);
        const events = [];

        await look_here(0, LOOKHERE_NOFLAGS, state, {
            message: async (text, owner) =>
                events.push(['message', text, owner]),
            readEngraving: async () => events.push(['engraving']),
        });

        assert.deepEqual(events, [
            ['engraving'],
            ['message', 'You see here a dart.', state],
        ]);
    assert.equal(state.iflags.last_msg, PLNMSG_ONE_ITEM_HERE);
});

test('a sighted hero does not force-touch a petrifying corpse', async () => {
    const corpse = objectOf(namingState(), CORPSE, {
        corpsenm: PM_COCKATRICE,
    });
    const state = lookState(ROOM, corpse);
    const events = [];

    await look_here(0, LOOKHERE_NOFLAGS, state, {
        message: async (text) => events.push(text),
        readEngraving: async () => events.push('engraving'),
    });

    assert.deepEqual(events, [
        'engraving',
        'You see here a cockatrice corpse.',
    ]);
});

test('blind single-object look_here uses the source surface and output order',
    async () => {
        for (const [typ, surfaceName] of [
            [ROOM, 'floor'],
            [CORR, 'ground'],
        ]) {
            const dart = objectOf(namingState(), DART);
            const state = lookState(typ, dart, { blind: true });
            const events = [];

            await look_here(0, LOOKHERE_NOFLAGS, state, {
                message: async (text) => events.push(text),
                readEngraving: async () => events.push('read engraving'),
            });

            assert.deepEqual(events, [
                `You try to feel what is lying here on the ${surfaceName}.`,
                'read engraving',
                'You feel here a dart.',
            ]);
            assert.equal(state.iflags.last_msg, PLNMSG_ONE_ITEM_HERE);
        }
    });

test('blind ICE forces decor before the tactile line', async () => {
    const dart = objectOf(namingState(), DART);
    const state = lookState(ICE, dart, { blind: true });
    state.flags.mention_decor = false;
    state.iflags.prev_decor = ROOM;
    state.decor_fumble_override = true;
    state.gd = {};
    state.gd.decor_levitate_override = true;
    state.u.uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const events = [];
    await look_here(0, LOOKHERE_NOFLAGS, state, {
        message: async (text) => events.push(text),
        readEngraving: async () => events.push('read engraving'),
    });
    assert.ok(events.some((text) => /ice/u.test(text)));
    assert.ok(events.indexOf('You try to feel what is on it.')
        > events.findIndex((text) => /ice/u.test(text)));
    assert.equal(
        state.level.lastseentyp[state.u.ux][state.u.uy], ICE,
    );
    assert.equal(state.decor_fumble_override, false);
    assert.equal(state.gd.decor_levitate_override, false);
});

test('swallowed look_here admission returns before floor object names', () => {
    const { state } = pileLookState({ count: 1 });
    state.u.uswallow = true;
    state.u.ustuck = { data: {} };
    const plan = preflight_look_here(0, LOOKHERE_NOFLAGS, state);
    assert.deepEqual(plan.objectList, []);
    assert.equal(plan.otmp, null);
    assert.equal(plan.hasPile, false);
});

test('look_here admission skips names before blind unreachable return', () => {
    // invent.c:4218-4235 returns after the tactile reach check. An object's
    // name and discovery flags must remain untouched before that return.
    const state = lookState(ROOM, objectOf(namingState(), BAG_OF_TRICKS), {
        blind: true,
    });
    state.iflags.override_ID = 1;
    state.u.uprops[LEVITATION] = { intrinsic: 1, extrinsic: 0, blocked: 0 };

    const plan = preflight_look_here(0, LOOKHERE_NOFLAGS, state);

    assert.equal(plan.cannotReachObjects, true);
    assert.equal(plan.otmp.otyp, BAG_OF_TRICKS);
});

test('look_here admission skips names on inaccessible liquid', () => {
    // invent.c:4242-4248 returns for lava and an out-of-water pool before any
    // doname_with_price() call, even when the floor chain is nonempty.
    const state = lookState(LAVAPOOL,
        objectOf(namingState(), BAG_OF_TRICKS), { blind: false });
    state.iflags.override_ID = 1;

    const plan = preflight_look_here(0, LOOKHERE_NOFLAGS, state);

    assert.equal(plan.otmp.otyp, BAG_OF_TRICKS);
});

test('pile admission stops naming after the first tactile cockatrice', () => {
    // invent.c:4299-4304 breaks immediately after the ordinary doname() for
    // the first tactile cockatrice; later pile entries are not priced/named.
    const built = pileLookState({
        blind: true,
        count: 2,
        first: CORPSE,
        firstOverrides: { corpsenm: PM_COCKATRICE },
    });
    const second = objectOf(built.state, BAG_OF_TRICKS, { bknown: true });
    built.state.iflags.override_ID = 1;
    built.head.nexthere = second;

    const plan = preflight_look_here(2, LOOKHERE_NOFLAGS, built.state);

    assert.equal(plan.objectList.length, 2);
    assert.equal(plan.objectList[1], second);
});

test('blind single-object look_here awaits each output owner in source order',
    async () => {
        const dart = objectOf(namingState(), DART);
        const state = lookState(ROOM, dart, { blind: true });
        const tactile = deferred();
        const engraving = deferred();
        const item = deferred();
        const events = [];

        const output = look_here(0, LOOKHERE_NOFLAGS, state, {
            message: (text) => {
                events.push(text);
                return text.startsWith('You try') ? tactile.promise
                    : item.promise;
            },
            readEngraving: () => {
                events.push('read engraving');
                return engraving.promise;
            },
        });

        await Promise.resolve();
        assert.deepEqual(events, [
            'You try to feel what is lying here on the floor.',
        ]);
        assert.notEqual(state.iflags.last_msg, PLNMSG_ONE_ITEM_HERE);

        tactile.resolve();
        await Promise.resolve();
        assert.deepEqual(events, [
            'You try to feel what is lying here on the floor.',
            'read engraving',
        ]);
        assert.notEqual(state.iflags.last_msg, PLNMSG_ONE_ITEM_HERE);

        engraving.resolve();
        await Promise.resolve();
        assert.deepEqual(events, [
            'You try to feel what is lying here on the floor.',
            'read engraving',
            'You feel here a dart.',
        ]);
        assert.notEqual(state.iflags.last_msg, PLNMSG_ONE_ITEM_HERE);

        item.resolve();
        await output;
        assert.equal(state.iflags.last_msg, PLNMSG_ONE_ITEM_HERE);
    });

test('single-object look_here requires its engraving owner before output',
    async () => {
        const dart = objectOf(namingState(), DART);
        const state = lookState(ROOM, dart);
        const messages = [];
        await assert.rejects(
            look_here(0, LOOKHERE_NOFLAGS, state, {
                message: (text) => messages.push(text),
            }),
            /engraving owners/u,
        );
        assert.deepEqual(messages, []);
    });

test('ordinary object piles display every name before reading the engraving',
    async () => {
        const { head, state } = pileLookState({ count: 3 });
        const events = [];

        const output = await look_here(3, LOOKHERE_NOFLAGS, state, {
            message: async (text) => events.push(['message', text]),
            displayObjectPile: async (lines, owner) => {
                events.push(['display', lines, owner]);
            },
            readEngraving: async () => events.push(['engraving']),
        });

        assert.equal(output, false);
        assert.deepEqual(events, [
            [
                'display',
                [
                    'Things that are here:',
                    'a dart',
                    'a food ration',
                    'a dagger',
                ],
                state,
            ],
            ['engraving'],
        ]);
        assert.equal(head.dknown, true);
    });

test('caller obj_cnt keeps dolook and check_here pile limits distinct',
    async () => {
        const render = async (invoke) => {
            const { state } = pileLookState({ count: 2 });
            state.flags.pile_limit = 2;
            const events = [];
            await invoke(state, {
                message: async (text) => events.push(['message', text]),
                displayObjectPile: async (lines) =>
                    events.push(['display', lines]),
                readEngraving: async () => events.push(['engraving']),
            });
            return events;
        };

        assert.deepEqual(await render((state, hooks) => dolook(state, hooks)), [
            ['display', [
                'Things that are here:',
                'a dart',
                'a food ration',
            ]],
            ['engraving'],
        ]);
        assert.deepEqual(
            await render((state, hooks) =>
                look_here(2, LOOKHERE_NOFLAGS, state, hooks)),
            [
                ['engraving'],
                ['message', 'There are two objects here.'],
            ],
        );
    });

test('dolook hides only REP/SHOW message rules and restores them', async () => {
    const { state } = pileLookState({ count: 2 });
    state.gp = {
        plinemsg_types: {
            msgtype: MSGTYP_NOREP,
            next: {
                msgtype: MSGTYP_NOSHOW,
                next: { msgtype: 0, next: null },
            },
        },
    };
    const original = state.gp.plinemsg_types;
    const events = [];
    await dolook(state, {
        message: async (text) => events.push(text),
        displayObjectPile: async () => events.push('menu'),
        readEngraving: async () => events.push('engraving'),
    });
    assert.ok(events.includes('menu'));
    assert.equal(original.msgtype, MSGTYP_NOREP);
    assert.equal(original.next.msgtype, MSGTYP_NOSHOW);
    assert.equal(original.next.next.msgtype, 0);
    assert.equal(MSGTYP_MASK_REP_SHOW & (1 << MSGTYP_NOREP),
        1 << MSGTYP_NOREP);
});

test('an equal ordinary mention-decor terrain retains the object-pile menu',
    async () => {
        const { state } = pileLookState({ count: 2 });
        state.flags.mention_decor = true;
        state.iflags.prev_decor = ROOM;
        const events = [];

        await look_here(2, LOOKHERE_NOFLAGS, state, {
            message: async (text) => events.push(['message', text]),
            displayObjectPile: async (lines) => events.push(['display', lines]),
            readEngraving: async () => events.push(['engraving']),
        });

        assert.deepEqual(events, [
            ['display', [
                'Things that are here:',
                'a dart',
                'a food ration',
            ]],
            ['engraving'],
        ]);
    });

test('object naming preserves ordinary and multibyte instance names', () => {
    const state = namingState();
    // C objnam.c xname() names this ordinary object directly as a dart.
    assert.equal(xnameFresh(objectOf(state, DART), state), 'dart');
    const named = objectOf(state, DART, {
        // The accented byte distinguishes UTF-8 byte width from JavaScript's
        // code-unit length while C appends the user-assigned name.
        dknown: true,
        oextra: { oname: 'caf\u00e9' },
    });
    assert.equal(xnameFresh(named, state), 'dart named caf\u00e9');
});

test('decorated object piles put terrain and a separator before the heading',
    async () => {
        const { state } = pileLookState({ count: 2, typ: DOOR });
        const events = [];

        await look_here(2, LOOKHERE_NOFLAGS, state, {
            message: async (text) => events.push(['message', text]),
            displayObjectPile: async (lines) => events.push(['display', lines]),
            readEngraving: async () => events.push(['engraving']),
        });

        assert.deepEqual(events, [
            ['display', [
                'There is a doorway here.',
                '',
                'Things that are here:',
                'a dart',
                'a food ration',
            ]],
            ['engraving'],
        ]);
    });

test('decorated pile-limit counts report terrain before the count',
    async () => {
        const { state } = pileLookState({ count: 2, typ: DOOR });
        // Equality selects the count arm while preserving the terrain line.
        state.flags.pile_limit = 2;
        const events = [];

        await look_here(2, LOOKHERE_NOFLAGS, state, {
            message: async (text) => events.push(['message', text]),
            displayObjectPile: async (lines) => events.push(['display', lines]),
            readEngraving: async () => events.push(['engraving']),
        });

        assert.deepEqual(events, [
            ['message', 'There is a doorway here.'],
            ['engraving'],
            ['message', 'There are two objects here.'],
        ]);
    });

test('pile-limit counts bypass names and use source count partitions',
    async () => {
        for (const [count, expected] of [
            // Two has its own source word.
            [2, 'two'],
            // Three and four are the lower and upper edges of "a few".
            [3, 'a few'],
            [4, 'a few'],
            // Five and nine are the lower and upper edges of "several".
            [5, 'several'],
            [9, 'several'],
            // Ten is the lower edge of the unbounded "many" partition;
            // twelve shows that values above the edge remain there.
            [10, 'many'],
            [12, 'many'],
        ]) {
            const { head, state } = pileLookState({ count });
            // Equality selects the count arm and pins the inclusive
            // `obj_cnt >= pile_limit` edge for every source partition.
            state.flags.pile_limit = count;
            const events = [];

            const output = await look_here(count, LOOKHERE_NOFLAGS, state, {
                message: async (text, owner) =>
                    events.push(['message', text, owner]),
                displayObjectPile: async (lines) =>
                    events.push(['display', lines]),
                readEngraving: async () => events.push(['engraving']),
            });

            assert.equal(output, false);
            assert.deepEqual(events, [
                ['engraving'],
                ['message', `There are ${expected} objects here.`, state],
            ]);
            for (let object = head; object; object = object.nexthere)
                assert.equal(object.dknown, false, `count ${count}`);
        }
    });

test('object-pile source branches continue through their output owners',
    async () => {
        const cases = [
            {
                name: 'picked-some pile-limit count',
                // Two is the smallest pile, and an equal threshold selects
                // the excluded picked-some wording.
                build: () => pileLookState({ count: 2 }),
                prepare: ({ state }) => { state.flags.pile_limit = 2; },
                flags: LOOKHERE_PICKED_SOME,
            },
            {
                name: 'non-triggering five-object pile',
                // Five is the first count outside the preceding menu slice;
                // zero disables the count shortcut.
                build: () => pileLookState({ count: 5 }),
                prepare: ({ state }) => { state.flags.pile_limit = 0; },
            },
            {
                name: 'mention-decor pile',
                build: () => pileLookState(),
                prepare: ({ state }) => { state.flags.mention_decor = true; },
            },
            {
                name: 'mention-decor pile-limit count',
                build: () => pileLookState(),
                prepare: ({ state }) => {
                    state.flags.mention_decor = true;
                    state.flags.pile_limit = 2;
                    state.iflags.prev_decor = ROOM;
                },
            },
            {
                // invent.c look_here() (4162-4178) is the only place a trap
                // is named, and 4170-4171 drops one the hero has not seen.
                // tseen is therefore what decides this stop; the companion
                // test below pins the unseen half, which used to be refused
                // here and kept the hero off every pile hiding a trap.
                name: 'seen trap under pile',
                build: () => pileLookState(),
                prepare: ({ state }) => state.level.traps.push({
                    tx: 1, ty: 1, ttyp: PIT, tseen: true,
                }),
            },
            {
                name: 'visible region over pile',
                build: () => pileLookState(),
                prepare: ({ state }) => {
                    const region = create_region([
                        { lx: 1, ly: 1, hx: 1, hy: 1 },
                    ]);
                    region.visible = true;
                    state.level.regions.push(region);
                },
            },
            {
                name: 'engraving under pile',
                build: () => pileLookState(),
                prepare: ({ state }) => {
                    state.head_engr = {
                        engr_x: 1,
                        engr_y: 1,
                        engr_txt: ['Elbereth'],
                        nxt_engr: null,
                    };
                },
            },
            {
                name: 'lava pile',
                build: () => pileLookState({ typ: LAVAPOOL }),
            },
        ];

        for (const specimen of cases) {
            const built = specimen.build();
            specimen.prepare?.(built);
            const events = [];
            // Mirror pickup.c check_here() instead of duplicating a fixture
            // count in each exclusion case.
            let objectCount = 0;
            for (let object = built.head; object; object = object.nexthere)
                ++objectCount;
            await look_here(
                    objectCount,
                    specimen.flags ?? LOOKHERE_NOFLAGS,
                    built.state,
                    {
                        message: (text) => events.push(['message', text]),
                        displayObjectPile: (lines) =>
                            events.push(['display', lines]),
                        readEngraving: () => events.push(['engraving']),
                    },
            );
            assert.ok(events.length > 0, specimen.name);
        }
    });

test('a blind object pile uses the source tactile heading before petrification',
    async () => {
    // C invent.c:look_here() (4289-4296) builds this line as
    // "Things that you feel here:"; the blind predicate includes "that"
    // just as the sighted arm includes "that are".
    const built = pileLookState({
        blind: true,
        first: CORPSE,
        firstOverrides: { corpsenm: PM_COCKATRICE },
    });
    const events = [];

    await look_here(2, LOOKHERE_NOFLAGS, built.state, {
        message: (text) => events.push(['message', text]),
        displayObjectPile: (lines) => events.push(['display', lines]),
        readEngraving: () => events.push(['engraving']),
    });

    assert.deepEqual(events, [
        ['message', 'You try to feel what is lying here on the floor.'],
        ['display', ['Things that you feel here:', 'a cockatrice corpse...']],
        ['message', 'Touching the cockatrice corpse is a fatal mistake...'],
        ['engraving'],
    ]);
    });

test('an unseen trap under a pile changes nothing look_here() prints',
    async () => {
        // invent.c look_here() names a trap only at 4162-4178, and 4170-4171
        // discards one whose tseen is clear; dfeature_at() (4041-4108) has no
        // trap arm at all. So the menu is identical with and without the trap
        // underneath, which is what lets hack.c spoteffects() describe an
        // object pile before dotrap() springs the bear trap under it.
        const runPile = async (trap) => {
            const built = pileLookState();
            if (trap) built.state.level.traps.push(trap);
            const events = [];
            await look_here(2, LOOKHERE_NOFLAGS, built.state, {
                message: (text) => events.push(['message', text]),
                displayObjectPile: (lines) => events.push(['display', lines]),
                readEngraving: () => events.push(['engraving']),
            });
            return events;
        };

        const withoutTrap = await runPile(null);
        const withUnseenTrap = await runPile({
            tx: 1, ty: 1, ttyp: BEAR_TRAP, tseen: false,
        });

        assert.deepEqual(withUnseenTrap, withoutTrap);
        // Pin the menu itself, so that a change which silenced both runs
        // together could not pass this comparison.
        assert.deepEqual(withoutTrap, [
            ['display', ['Things that are here:', 'a dart', 'a food ration']],
            ['engraving'],
        ]);
    });

test('worn and wielded suffixes follow doname()\'s owornmask branches', () => {
    const state = namingState();
    // MZ_MEDIUM is monsters.h's MZ_HUMAN, the unpolymorphed hero size, and
    // M1_HUMANOID is what makes mbodypart() answer "hand" rather than a
    // claw; bimanual() and body_part() read both.
    state.youmonst = {
        data: { mflags1: M1_HUMANOID, msize: MZ_MEDIUM, mattk: [] },
    };
    state.u.uhandedness = RIGHT_HANDED;
    const worn = (otyp, mask, overrides = {}) => donameFresh(
        objectOf(state, otyp, { owornmask: mask, bknown: true, ...overrides }),
        state,
    );

    // The class switch answers these three with the same phrase.
    assert.match(worn(AMULET_OF_ESP, W_AMUL), / \(being worn\)$/u);
    assert.match(worn(LEATHER_ARMOR, W_ARM), / \(being worn\)$/u);
    assert.match(worn(BLINDFOLD, W_TOOL), / \(being worn\)$/u);

    // A wielded stack, and wielded ammo or a missile whatever the count, take
    // C's alternate phrasing; a single ordinary weapon names the hand.
    assert.match(worn(DAGGER, W_WEP, { quan: 2 }), / \(wielded\)$/u);
    assert.match(worn(ARROW, W_WEP, { quan: 1 }), / \(wielded\)$/u);
    assert.match(worn(DART, W_WEP, { quan: 1 }), / \(wielded\)$/u);
    assert.match(worn(LONG_SWORD, W_WEP), / \(weapon in right hand\)$/u);
    state.u.uhandedness = LEFT_HANDED;
    assert.match(worn(LONG_SWORD, W_WEP), / \(weapon in left hand\)$/u);
    state.u.uhandedness = RIGHT_HANDED;
    // A two-handed weapon pluralizes the hand instead of naming a side.
    assert.match(worn(TWO_HANDED_SWORD, W_WEP), / \(weapon in hands\)$/u);

    // The alternate weapon pluralizes with the stack, not the hands.
    assert.match(
        worn(DAGGER, W_SWAPWEP), / \(alternate weapon; not wielded\)$/u,
    );
    assert.match(
        worn(DAGGER, W_SWAPWEP, { quan: 3 }),
        / \(alternate weapons; not wielded\)$/u,
    );

    // The three Qtyp values. Ammunition for a bow goes in the quiver;
    // non-bow ammunition and the small classes go in its pouch; anything
    // else, a dart included because is_ammo() is false for a missile, is at
    // the ready.
    assert.match(worn(ARROW, W_QUIVER), / \(in quiver\)$/u);
    assert.match(worn(CROSSBOW_BOLT, W_QUIVER), / \(in quiver pouch\)$/u);
    assert.match(worn(DIAMOND, W_QUIVER), / \(in quiver pouch\)$/u);
    assert.match(worn(DART, W_QUIVER), / \(at the ready\)$/u);
    assert.match(worn(LONG_SWORD, W_QUIVER), / \(at the ready\)$/u);
});

// C ref: objnam.c doname_base():1540-1546. The BALL_CLASS and CHAIN_CLASS
// arms identify punishment objects by their W_BALL or W_CHAIN worn bits. The
// second case also carries W_QUIVER to pin that the later suffix chain still
// runs after the source branch.
test('punishment ball and chain names include their tether suffix', () => {
    const state = namingState();
    const ball = (owornmask) => donameFresh(
        // objects.h sets the base ball weight to 480; 481 exercises xname()'s
        // source branch that prefixes this object with "very".
        objectOf(state, HEAVY_IRON_BALL, { owornmask, owt: 481 }), state,
    );
    const chain = (owornmask) => donameFresh(
        objectOf(state, IRON_CHAIN, { owornmask }), state,
    );

    assert.equal(ball(W_BALL), 'a very heavy iron ball (chained to you)');
    assert.equal(chain(W_CHAIN), 'an iron chain (attached to you)');
    // C tests W_BALL first, so a malformed object carrying both bits remains
    // chained; this also pins the source conditional's evaluation order.
    assert.equal(ball(W_BALL | W_CHAIN),
        'a very heavy iron ball (chained to you)');
    assert.equal(chain(W_CHAIN | W_QUIVER),
        'an iron chain (attached to you) (at the ready)');
});

// The differential evidence for doname_base()'s ARMOR_CLASS worn arm lives in
// scripts/run-worn-glove-name.mjs, which records fresh C output for six starts
// and compares complete screens, cursors and random-number calls. This guards
// what that matrix is made of, because a matrix that lost its enchantment
// spread or its bare-handed control would still pass.
test('the worn-glove matrix keeps its enchantment spread and control', () => {
    const recipe = loadWornGloveNameRecipe();
    assert.equal(recipe.segments.length, CASES.length);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // Every segment presses 'i' and nothing else that takes a turn.
        assert.equal(segment.moves, '.i.');
    }
    // u_init.c gives the three glove-wearing roles +1, +0 and +2, which is
    // the whole reason all three are in the matrix.
    assert.deepEqual(
        CASES.filter(({ spe }) => spe !== null)
            .map(({ role, spe }) => [role, spe]),
        [['Knight', 0], ['Healer', 1], ['Monk', 2], ['Healer', 1], ['Monk', 2]],
    );
    // The control shares the Knight's seed, so the two differ in the starting
    // kit and in nothing else.
    const control = CASES.find(({ spe }) => spe === null);
    const knight = CASES.find(({ role }) => role === 'Knight');
    assert.equal(control.role, 'Valkyrie');
    assert.equal(control.seed, knight.seed);
    assert.equal(control.datetime, knight.datetime);
});

// C ref: objnam.c doname_base():1400-1407. Slippery fingers are a property of
// the hero, not of the gloves, so no differential can reach this clause:
// js/wield.js:102 records that nothing in the port grants Glib, and the three
// roles that start in a pair start with dry hands. scripts/run-worn-glove-name
// .mjs records what C paints for those three; only a unit test can set Glib.
test('worn gloves take the slippery clause and nothing else does', () => {
    const state = namingState();
    const gloves = objectOf(state, LEATHER_GLOVES,
        { owornmask: W_ARMG, bknown: true, known: true, spe: 0 });
    const helmet = objectOf(state, DWARVISH_IRON_HELM,
        { owornmask: W_ARMH, bknown: true, known: true, spe: 0 });
    state.uarmg = gloves;
    state.uarmh = helmet;

    // Dry hands: the ARMOR_CLASS arm ends at C:1394's " (being worn)".
    assert.match(donameFresh(gloves, state), / \(being worn\)$/u);

    // youprop.h:112 makes Glib the bare intrinsic field, with no extrinsic
    // source, so setting the timeout alone leaves the name unchanged.
    state.u.uprops[GLIB] = { extrinsic: 1 };
    assert.match(donameFresh(gloves, state), / \(being worn\)$/u);

    // C:1406's Concat(bp, 1, "; slippery)") backs up over the paren it just
    // wrote, so the phrase gains a clause rather than a second parenthesis.
    state.u.uprops[GLIB] = { intrinsic: 1 };
    assert.match(donameFresh(gloves, state), / \(being worn; slippery\)$/u);

    // C tests `obj == uarmg`, not the mask, so a second pair of gloves the
    // hero is not wearing in that slot stays dry even while she is slippery.
    const spare = objectOf(state, LEATHER_GLOVES,
        { owornmask: W_ARMG, bknown: true, known: true, spe: 0 });
    assert.match(donameFresh(spare, state), / \(being worn\)$/u);
    // And the clause belongs to the glove slot alone: a slippery hero's helm
    // is described no differently.
    assert.match(donameFresh(helmet, state), / \(being worn\)$/u);
});

test('Concat and ConcatF keep their distinct C byte bounds and delta writes',
    () => {
        // objnam.c sets BUFSZ=256 and PREFIX=80; bp therefore has 175 bytes
        // before its terminating NUL. The final ')' makes delta=1 observable.
        const capacity = 256 - 80 - 1;
        const fullBody = `${'x'.repeat(capacity - 1)})`;
        assert.equal(fullBody.length, capacity);

        // strncat(spaceleft + delta) copies one byte after backing up one.
        assert.equal(
            concatNameBody(fullBody, '; slippery)', 1),
            `${'x'.repeat(capacity - 1)};`,
        );
        // snprintf(size=1) writes only the NUL after backing up, so the
        // replaced closing parenthesis disappears without a replacement.
        assert.equal(
            concatFormatNameBody(fullBody, ', 57 aum)', 1),
            'x'.repeat(capacity - 1),
        );
        // A full body gives snprintf size zero for a normal append and leaves
        // every existing byte untouched.
        assert.equal(concatFormatNameBody(fullBody, ' (57 aum)'), fullBody);
    });

test('doname bounds wizard weight before adding its constructed prefix', () => {
    const state = namingState();
    state.wizard = true;
    state.iflags.wizweight = true;
    // The long instance name fills bp's 175-byte C region; weight 57 is a
    // readable diagnostic value and its suffix must not leak past that limit.
    const dart = objectOf(state, DART, {
        dknown: true,
        owt: 57,
        oextra: { oname: 'x'.repeat(220) },
    });
    const body = xnameFresh(dart, state);
    assert.equal(body.length, 256 - 80 - 1);
    assert.equal(donameFresh(dart, state), `a ${body}`);
});

test('doname keeps xname pointer offsets and food prefixes source-aligned', () => {
    // C objnam.c:nextobuf() rotates scratch buffers, while this JS port uses
    // immutable strings and explicit offsets. The +4 "The " case below pins
    // the byte displacement and bounded-string behavior without inventing a
    // JavaScript ring-buffer state.
    const poisonState = dualWieldState(DART);
    // objnam.c:xname_flags() gives this named poisoned dart a 175-byte body;
    // the 220-byte oname fills it, and doname_base's bp += 9 must not restore
    // the bytes occupied by the source's "poisoned " prefix. W_WEP makes C
    // attempt its wielded suffix after that pointer advance.
    const poisonedDart = objectOf(poisonState, DART, {
        dknown: true,
        opoisoned: true,
        oextra: { oname: 'x'.repeat(220) },
        owornmask: W_WEP,
    });
    poisonState.uwep = poisonedDart;
    const poisonedXname = xnameFresh(poisonedDart, poisonState);
    assert.equal(poisonedXname.length, 256 - 80 - 1);
    assert.equal(
        donameFresh(poisonedDart, poisonState),
        `a poisoned ${poisonedXname.slice('poisoned '.length)}`,
    );

    const articleState = dualWieldState(LONG_SWORD);
    // objnam.c:xname_flags() lowercases then returns buf+4 for "The ";
    // a 220-byte artifact name leaves only 171 bytes after that pointer move.
    const articleName = `The ${'x'.repeat(220)}`;
    // C's proper-name branch needs both an existing artifact and its id in
    // artidisco; artiexist[].found alone does not establish discovery.
    articleState.artiexist[ART_SUNSWORD].exists = 1;
    articleState.artidisco[0] = ART_SUNSWORD;
    const namedArtifact = objectOf(articleState, LONG_SWORD, {
        dknown: true,
        known: true,
        bknown: true,
        rknown: true,
        oartifact: ART_SUNSWORD,
        oextra: { oname: articleName },
        owornmask: W_WEP,
    });
    articleState.uwep = namedArtifact;
    assert.equal(
        xnameFresh(namedArtifact, articleState).length,
        256 - 80 - 1 - 4,
    );
    assert.doesNotMatch(donameFresh(namedArtifact, articleState), /\(wielded\)/u);

    const corpseState = namingState();
    corpseState.wizard = true;
    corpseState.iflags.wizmgender = true;
    // "corpse named " occupies 13 bytes; 154 name bytes leave exactly eight
    // for C's seven-byte " (male)" ConcatF suffix and its terminating NUL.
    const corpseName = 'x'.repeat(154);
    assert.equal(
        donameFresh(objectOf(corpseState, CORPSE, {
            corpsenm: PM_NEWT,
            dknown: true,
            spe: 2,
            oextra: { oname: corpseName },
        }), corpseState),
        `a newt corpse named ${corpseName} (male)`,
    );

    const eggState = namingState();
    // "egg named " is 10 bytes; this 151-byte name leaves exactly 14 bytes
    // for " (laid by you)" while the newt prefix remains outside bp's buffer.
    const eggName = 'x'.repeat(151);
    assert.equal(
        donameFresh(objectOf(eggState, EGG, {
            corpsenm: PM_NEWT,
            dknown: true,
            known: true,
            spe: 1,
            oextra: { oname: eggName },
        }), eggState),
        `a newt egg named ${eggName} (laid by you)`,
    );
});

test('a clipped worn-glove close parenthesis controls the slippery delta', () => {
    const state = namingState();
    const gloves = objectOf(state, LEATHER_GLOVES, {
        dknown: true,
        known: true,
        bknown: true,
        owornmask: W_ARM,
        // Repeated closing parentheses fill xname's 175-byte body and make
        // C's post-append bp_eos[-1] test true after the worn phrase clips.
        oextra: { oname: ')'.repeat(220) },
    });
    state.uarmg = gloves;
    state.u.uprops[GLIB] = { intrinsic: 1 };
    assert.equal(xnameFresh(gloves, state).at(-1), ')');
    assert.equal(donameFresh(gloves, state).at(-1), ';');
});

test('gameover xname disclosures and distant_name object-id masking match C',
    () => {
        const disclosureState = namingState();
        disclosureState.program_state.gameover = 1;
        // C maps ALCHEMY_SMOCK to the name "apron" and indexes
        // APRON_MESSAGES by o_id; id 3 selects its fourth entry.
        const smock = objectOf(disclosureState, ALCHEMY_SMOCK, {
            dknown: true,
            o_id: 3,
        });
        assert.equal(
            xnameFresh(smock, disclosureState),
            'apron with text "Don\'t make me poison you"',
        );

        // C distant_name zeroes o_id before its near/far decision and restores
        // it afterward. The floor item is three squares away, outside the
        // radius-2 near threshold, so this exercises the distant branch.
        const distantState = distantNamingState(10, 5);
        distantState.program_state.gameover = 1;
        distantState.u.ux = 7;
        const shirt = objectOf(distantState, T_SHIRT, {
            dknown: true,
            o_id: 3,
            where: OBJ_FLOOR,
            ox: 10,
            oy: 5,
        });
        let idDuringName;
        const name = distant_name(shirt, (object, state) => {
            idDuringName = object.o_id;
            return xnameFresh(object, state);
        }, distantState);
        assert.equal(idDuringName, 0);
        assert.equal(shirt.o_id, 3);
        assert.doesNotMatch(name, /with text/u);
        assert.equal(distantState.gd.distantname, 0);
    });

// C ref: objnam.c doname_base():1391, the `(obj == uskin)` arm of the same
// conditional. This also pins the single state owner for the fused scales.
test('armor fused to the hero\'s skin uses its C-owned worn suffix', () => {
    const state = namingState();
    const scales = objectOf(state, RED_DRAGON_SCALES,
        { owornmask: W_ARM, bknown: true, known: true, spe: 0 });
    state.uskin = scales;
    assert.match(donameFresh(scales, state), / \(embedded in your skin\)$/u);
    // uskin selects one phrase; ordinary worn scales keep the adjacent arm.
    state.uskin = null;
    assert.match(donameFresh(scales, state), / \(being worn\)$/u);
});

// A right-handed humanoid hero holding a long sword and a dagger, the pair
// the tests below dual-wield. `u.twoweap` is left off; each test sets it.
// C ref: objnam.c doname_base() (1561-1621), the W_WEP and W_SWAPWEP arms.
// `grep -n twoweap` over objnam.c returns four lines, all inside that
// function: :1562 derives twoweap_primary from `obj == uwep && u.twoweap`,
// :1575 and :1593 consume it, and :1614 picks the W_SWAPWEP phrasing.
function dualWieldState(primaryOtyp = LONG_SWORD, primaryOverrides = {}) {
    const state = namingState();
    state.youmonst = {
        data: { mflags1: M1_HUMANOID, msize: MZ_MEDIUM, mattk: [] },
    };
    state.u.uhandedness = RIGHT_HANDED;
    state.u.twoweap = false;
    state.uwep = objectOf(state, primaryOtyp, {
        owornmask: W_WEP, bknown: true, known: true, spe: 0,
        ...primaryOverrides,
    });
    state.uswapwep = objectOf(state, DAGGER, {
        owornmask: W_SWAPWEP, bknown: true, known: true, spe: 0,
    });
    return state;
}

test('pickup merge naming honors gm.mrg_to_wielded for one message only', () => {
    const state = dualWieldState();
    state.gm ??= { mrg_to_wielded: false };
    assert.equal(state.gm.mrg_to_wielded, false);
    assert.match(donameFresh(state.uwep, state), / \(weapon in right hand\)$/u);

    // pickup.c:1881-1886 holds the flag only while pickup_prinv() calls
    // doname(), omitting the suffix that would describe the merged stack.
    state.gm.mrg_to_wielded = true;
    assert.doesNotMatch(donameFresh(state.uwep, state), /\((?:wielded|weapon in)/u);
    state.gm.mrg_to_wielded = false;
    assert.match(donameFresh(state.uwep, state), / \(weapon in right hand\)$/u);
});

test('a dual-wielded pair names one hand each', () => {
    const state = dualWieldState();

    // Off: the pair names itself the way any other wielded weapon and
    // secondary do, which is what C:1594 and C:1619 say.
    assert.match(donameFresh(state.uwep, state), / \(weapon in right hand\)$/u);
    assert.match(donameFresh(state.uswapwep, state),
        / \(alternate weapon; not wielded\)$/u);

    // On: C:1593 answers "wielded in" where C:1594 answered "weapon in", and
    // C:1615-1616 gives the secondary the hand the primary did not take.
    state.u.twoweap = true;
    assert.match(donameFresh(state.uwep, state),
        / \(wielded in right hand\)$/u);
    assert.match(donameFresh(state.uswapwep, state),
        / \(wielded in left hand\)$/u);
});

// C:1586 and C:1616 read URIGHTY from opposite sides of the same hero, so a
// left-handed hero swaps both phrases at once. u_init.c:395 makes one hero in
// ten left-handed.
test('a left-handed hero holds the primary in the left hand', () => {
    const state = dualWieldState();
    state.u.uhandedness = LEFT_HANDED;
    state.u.twoweap = true;
    assert.match(donameFresh(state.uwep, state), / \(wielded in left hand\)$/u);
    assert.match(donameFresh(state.uswapwep, state),
        / \(wielded in right hand\)$/u);

    // With the flag off only the primary carries a hand, and it is still the
    // left one: C:1586 is the same expression in both arms.
    state.u.twoweap = false;
    assert.match(donameFresh(state.uwep, state), / \(weapon in left hand\)$/u);
});

// C:1575's `&& !twoweap_primary` is what keeps the primary out of the
// "(wielded)" arm. Its comment at :1566-1570 says so: dual-wielded ammo and
// missiles take "the regular phrasing ... to contrast with secondary weapon's
// 'in left hand'".
test('a stacked or ammo primary keeps the hand phrasing while dual-wielding',
    () => {
        // A stack of daggers, the quan != 1 half of C:1571.
        const stacked = dualWieldState(DAGGER, { quan: 3 });
        assert.match(donameFresh(stacked.uwep, stacked), / \(wielded\)$/u);
        stacked.u.twoweap = true;
        assert.match(donameFresh(stacked.uwep, stacked),
            / \(wielded in right hand\)$/u);

        // A single arrow, the is_ammo() half. One item, so only the class
        // test at C:1572-1573 sends it to the alternate phrasing.
        const ammo = dualWieldState(ARROW);
        assert.match(donameFresh(ammo.uwep, ammo), / \(wielded\)$/u);
        ammo.u.twoweap = true;
        assert.match(donameFresh(ammo.uwep, ammo),
            / \(wielded in right hand\)$/u);
    });

// C:1562 tests `obj == uwep`, not the mask. Only one object can be uwep, so a
// second one carrying W_WEP is not the primary of anything.
test('only uwep is the two-weapon primary', () => {
    const state = dualWieldState();
    state.u.twoweap = true;
    const impostor = objectOf(state, LONG_SWORD, {
        owornmask: W_WEP, bknown: true, known: true, spe: 0,
    });
    assert.match(donameFresh(impostor, state), / \(weapon in right hand\)$/u);
    // And without twoweap_primary to hold it back, a stack takes C:1576.
    const stack = objectOf(state, DAGGER, {
        owornmask: W_WEP, bknown: true, known: true, spe: 0, quan: 3,
    });
    assert.match(donameFresh(stack, state), / \(wielded\)$/u);
});

// C:1619's plur(obj->quan) belongs to the alternate-weapon phrasing alone.
// C:1615's dual-wield phrasing names a hand and never a count.
test('the secondary pluralizes only while it is the alternate weapon', () => {
    const state = dualWieldState();
    state.uswapwep.quan = 3;
    assert.match(donameFresh(state.uswapwep, state),
        / \(alternate weapons; not wielded\)$/u);
    state.u.twoweap = true;
    assert.match(donameFresh(state.uswapwep, state),
        / \(wielded in left hand\)$/u);
});

// C:1581-1583 answers makeplural(body_part(HAND)) for a bimanual weapon in
// either arm, so the hand phrasing loses its side. wield.c:786 refuses to
// start two-weapon combat with one, so only the flag-off half occurs in play.
test('a bimanual primary names both hands', () => {
    const state = dualWieldState(TWO_HANDED_SWORD);
    assert.match(donameFresh(state.uwep, state), / \(weapon in hands\)$/u);
    state.u.twoweap = true;
    assert.match(donameFresh(state.uwep, state), / \(wielded in hands\)$/u);
});

// Every other worn mask is phrased the same whether or not two-weapon combat
// is on, so turning the flag on must leave all of them alone.
test('two-weapon combat renames no other worn slot', () => {
    const state = dualWieldState();
    state.u.twoweap = true;
    const worn = (otyp, mask) => donameFresh(
        objectOf(state, otyp, { owornmask: mask, bknown: true }), state,
    );
    assert.match(worn(AMULET_OF_ESP, W_AMUL), / \(being worn\)$/u);
    assert.match(worn(LEATHER_ARMOR, W_ARM), / \(being worn\)$/u);
    assert.match(worn(BLINDFOLD, W_TOOL), / \(being worn\)$/u);
    assert.match(worn(ARROW, W_QUIVER), / \(in quiver\)$/u);
});

// C:1592's "tethered to" arm of the same word choice. The ordinary and
// dual-wielded cases use the same hand owner; the AKLYS source label precedes
// the dual-wield label.
test('a wielded aklys names its tether before the selected hand', () => {
    const state = dualWieldState(AKLYS);
    const ordinary = donameFresh(state.uwep, state);
    assert.match(ordinary, / \(tethered to right hand\)$/u);
    // In two-weapon combat C still selects AKLYS's "tethered to" label.
    state.u.twoweap = true;
    assert.match(donameFresh(state.uwep, state), / \(tethered to right hand\)$/u);
});

test('container and tin names follow doname()\'s own branches', () => {
    const state = namingState();
    // An empty container the hero has looked into: "empty" precedes the BUC
    // word, and doname() adds no lock text because a sack is not a box. This
    // state has not identified the type, so xname() uses the appearance
    // "bag"; a starting inventory's sack is identified and reads "sack".
    const sack = objectOf(state, SACK, { cknown: true, bknown: true });
    assert.equal(donameFresh(sack, state), 'an empty uncursed bag');

    // A box adds its known lock state, and its known trap before that.
    const box = objectOf(state, LARGE_BOX, {
        cknown: true, bknown: true, dknown: true, lknown: true,
        olocked: true, otrapped: true, tknown: true,
    });
    assert.equal(
        donameFresh(box, state),
        'an empty uncursed trapped locked large box',
    );
    const brokenBox = objectOf(state, LARGE_BOX, {
        cknown: true, bknown: true, lknown: true, obroken: true,
    });
    assert.equal(
        donameFresh(brokenBox, state), 'an empty uncursed broken large box',
    );
    const unlockedBox = objectOf(state, LARGE_BOX, {
        cknown: true, bknown: true, lknown: true,
    });
    assert.equal(
        donameFresh(unlockedBox, state),
        'an empty uncursed unlocked large box',
    );

    // A tin whose contents are known names them. spe of -14 selects
    // tintxts[13], but the variety word appears only once cknown is set;
    // PM_FOX is a carnivore, so its meat is named.
    const tin = objectOf(state, TIN, {
        known: true, bknown: true, spe: -14, corpsenm: PM_FOX,
    });
    assert.equal(donameFresh(tin, state), 'an uncursed tin of fox meat');
    const knownTin = objectOf(state, TIN, {
        known: true, bknown: true, cknown: true, spe: -14, corpsenm: PM_FOX,
    });
    assert.equal(
        donameFresh(knownTin, state), 'an uncursed tin of candied fox meat',
    );
    // spe 1 is spinach, whatever the monster index says.
    const spinach = objectOf(state, TIN, {
        known: true, bknown: true, spe: 1, corpsenm: NON_PM,
    });
    assert.equal(donameFresh(spinach, state), 'an uncursed tin of spinach');
});

// C refs: objnam.c xname_flags():632-639, which forces `nn`, `known`, `dknown`
// and `bknown`, and doname_base():1254-1262, which forces `known`, `dknown`,
// `cknown`, `bknown` and `lknown`. Each object below is named twice, once with
// iflags.override_ID clear and once with it raised, so only the substitution
// separates the two answers. invent.c reroll_menu():2580 is the port's one
// caller that raises it.
test('override_ID names a type and charges the hero has not learned', () => {
    const state = namingState();

    // nn = 0 leaves the shuffled appearance, and a clear `known` withholds the
    // charges and makes doname_base():1339's `!known` term ask for "uncursed".
    const wand = objectOf(state, WAN_SLEEP, {
        dknown: true, bknown: true, spe: 5, recharged: 1,
    });
    assert.equal(donameFresh(wand, state), 'an uncursed runed wand');
    state.iflags.override_ID = 1;
    assert.equal(donameFresh(wand, state), 'a wand of sleep (1:5)');
    state.iflags.override_ID = 0;

    // dknown gates the instance name at xname_flags():998 and `known` gates
    // the enchantment at doname_base():1423; a dart's own type is discovered
    // from the start, so nn changes nothing here. gd.distantname keeps
    // xname_flags():628 from setting dknown as a side effect of the first
    // naming, which is what reroll_menu():2580 raises it for.
    state.gd = { distantname: 1 };
    const dart = objectOf(state, DART, {
        bknown: true, oextra: { oname: 'Zap' },
    });
    assert.equal(donameFresh(dart, state), 'an uncursed dart');
    state.iflags.override_ID = 1;
    assert.equal(donameFresh(dart, state), 'a +0 dart named Zap');
    state.iflags.override_ID = 0;
    state.gd.distantname = 0;

    // doname_base():1500 gives a ring its enchantment only when `known` and
    // the type's oc_charged both hold. RIN_ADORNMENT carries the second, so
    // the counter supplies the first; a ring keeps "uncursed" either way,
    // because :1341 names RING_CLASS as one of the two classes that do.
    const ring = objectOf(state, RIN_ADORNMENT, {
        dknown: true, bknown: true, spe: 2,
    });
    assert.equal(donameFresh(ring, state), 'an uncursed wooden ring');
    state.iflags.override_ID = 1;
    assert.equal(donameFresh(ring, state), 'an uncursed +2 ring of adornment');
    state.iflags.override_ID = 0;

    // bknown alone: doname_base():1318 prints no BUC word without it.
    const ration = objectOf(state, FOOD_RATION, { cursed: true });
    assert.equal(donameFresh(ration, state), 'a food ration');
    state.iflags.override_ID = 1;
    assert.equal(donameFresh(ration, state), 'a cursed food ration');
});

test('override_ID forces the container and lock flags doname() reads', () => {
    const state = namingState();

    // cknown reaches doname_base():1316's "empty", and nn turns the sack's
    // appearance into its name in the same breath.
    const sack = objectOf(state, SACK, { bknown: true });
    assert.equal(donameFresh(sack, state), 'an uncursed bag');
    state.iflags.override_ID = 1;
    assert.equal(donameFresh(sack, state), 'an empty uncursed sack');
    state.iflags.override_ID = 0;

    // lknown alone: cknown is already set, so only :1358's lock word moves.
    const box = objectOf(state, LARGE_BOX, { bknown: true, cknown: true });
    assert.equal(donameFresh(box, state), 'an empty uncursed large box');
    state.iflags.override_ID = 1;
    assert.equal(
        donameFresh(box, state), 'an empty uncursed unlocked large box',
    );
    state.iflags.override_ID = 0;

    // override_ID forces cknown, so a container with contents shows its
    // count. doname_base():1373 counts contents through invent.c:count_contents.
    // A bag of tricks still judges emptiness by its known charge count rather
    // than the contents chain; forced known charges suppress "empty".
    const stuffed = objectOf(state, SACK, { bknown: true });
    stuffed.cobj = objectOf(state, DART);
    assert.equal(donameFresh(stuffed, state), 'an uncursed bag');
    const tricks = objectOf(state, BAG_OF_TRICKS, { bknown: true });
    assert.equal(donameFresh(tricks, state), 'an uncursed bag');
    state.iflags.override_ID = 1;
    assert.equal(
        donameFresh(stuffed, state), 'an uncursed sack containing 1 item',
    );
    // override_ID forces known charges; C therefore adds (0:0) and omits
    // both the redundant "empty" and "uncursed" words.
    assert.equal(donameFresh(tricks, state), 'a bag of tricks (0:0)');
});

test('override_ID forces rknown, the tin variety, and the egg species', () => {
    const state = namingState();

    // add_erosion_words():1148 reads the counter for itself, and rknown is
    // the only flag that moves here: `known` is already set, so the "+0" and
    // the missing "uncursed" are the same on both sides.
    const sword = objectOf(state, LONG_SWORD, {
        known: true, bknown: true, oerodeproof: true,
    });
    assert.equal(donameFresh(sword, state), 'a +0 long sword');
    state.iflags.override_ID = 1;
    assert.equal(donameFresh(sword, state), 'a rustproof +0 long sword');
    state.iflags.override_ID = 0;

    // xname_flags():793 reaches eat.c tin_details() only when `known`, and
    // eat.c:1442 then reads the counter itself for the preparation word. spe
    // of -14 selects tintxts[13], "candied".
    const tin = objectOf(state, TIN, {
        bknown: true, spe: -14, corpsenm: PM_FOX,
    });
    assert.equal(donameFresh(tin, state), 'an uncursed tin');
    state.iflags.override_ID = 1;
    assert.equal(
        donameFresh(tin, state), 'an uncursed tin of candied fox meat',
    );
    state.iflags.override_ID = 0;

    // doname_base():1531 needs `known` before it names an egg's species.
    const egg = objectOf(state, EGG, { bknown: true, corpsenm: PM_FOX });
    assert.equal(donameFresh(egg, state), 'an uncursed egg');
    state.iflags.override_ID = 1;
    assert.equal(donameFresh(egg, state), 'an uncursed fox egg');
});

test('override_ID lets a unique amulet and a named artifact name themselves',
    () => {
        const state = namingState();

        // the_unique_obj():1110 refuses "the" without dknown, and :1113 tells
        // the hero's own lie: an unidentified fake amulet claims the article
        // and the real amulet's appearance. Forcing `known` retracts both.
        const fake = objectOf(state, FAKE_AMULET_OF_YENDOR, {
            dknown: true, bknown: true,
        });
        assert.equal(donameFresh(fake, state), 'the Amulet of Yendor');
        state.iflags.override_ID = 1;
        assert.equal(
            donameFresh(fake, state),
            'a cheap plastic imitation of the Amulet of Yendor',
        );
        state.iflags.override_ID = 0;

        // The real one, still unseen: :1110's dknown test decides the article
        // and xname_flags():677 decides the name. gd.distantname keeps the
        // first naming from setting dknown itself.
        state.gd = { distantname: 1 };
        const real = objectOf(state, AMULET_OF_YENDOR, { bknown: true });
        assert.equal(donameFresh(real, state), 'an amulet');
        state.iflags.override_ID = 1;
        assert.equal(donameFresh(real, state), 'the Amulet of Yendor');
        state.iflags.override_ID = 0;

        // With dknown set for real and the counter down, the second disjunct
        // of :1116 carries "the" on the type alone: xname_flags():625-626 has
        // cleared obj.known, because the Amulet's type is oc_unique and
        // oc_uses_known and is not discovered yet.
        state.gd.distantname = 0;
        assert.equal(donameFresh(real, state), 'the Amulet of Yendor');
        assert.equal(real.known, false);
        assert.equal(real.dknown, true);

        // obj_is_pname():337 skips not_fully_identified() under the counter.
        // A long sword erodes, so its clear rknown is what withholds the
        // personal name at not_fully_identified():1812-1818.
        state.artiexist[ART_GIANTSLAYER].exists = 1;
        const artifact = objectOf(state, LONG_SWORD, {
            dknown: true, known: true, bknown: true, rknown: false,
            oartifact: ART_GIANTSLAYER,
            oextra: { oname: 'Giantslayer' },
        });
        assert.equal(
            donameFresh(artifact, state),
            'a +0 long sword named Giantslayer',
        );
        state.iflags.override_ID = 1;
        assert.equal(donameFresh(artifact, state), 'the +0 Giantslayer');

        // C's guard at objnam.c:337 is a conjunction, and gameover is its
        // other half: once the game is over the tombstone names the artifact
        // whatever the hero learned about it. It is asserted on the function
        // rather than through doname(), so the test isolates the conjunction's
        // gameover half from the rest of object formatting. A port keeping
        // only the override_ID half answers this case wrongly.
        state.iflags.override_ID = 0;
        assert.equal(obj_is_pname(artifact, state), false);
        state.program_state = { ...state.program_state, gameover: 1 };
        assert.equal(obj_is_pname(artifact, state), true);
        state.program_state.gameover = 0;
    });

// C refs: objnam.c xname_flags():625-626 and :660, and doname_base():1319 and
// :1356.  Each reads a flag the object or its type stores where the code
// around it reads the iflags.override_ID substitution, and :656-659 gives the
// reason for the second.  Only a raised counter separates the two readings, so
// every object below is named with it up, and gd.distantname keeps xname()
// from setting dknown as a side effect of the naming itself.
test('the four flags C reads directly ignore the override_ID substitution',
    () => {
        const state = namingState();
        state.gd = { distantname: 1 };
        state.iflags.override_ID = 1;

        // :625-626 runs ahead of the block that forces `nn` to 1 and reads the
        // type's stored oc_name_known, so an undiscovered type that is both
        // oc_unique and oc_uses_known still has the object's `known` cleared.
        // The name is the same either way; the write is the whole effect.
        const amulet = objectOf(state, AMULET_OF_YENDOR, {
            dknown: true, known: true, bknown: true,
        });
        assert.equal(donameFresh(amulet, state), 'the Amulet of Yendor');
        assert.equal(amulet.known, false);

        // :660 reads the stored dknown, so an artifact the hero has never seen
        // stays unfound.  artiexist[].found is what find_artifact() writes.
        state.artiexist[ART_GIANTSLAYER].exists = 1;
        const unseen = objectOf(state, LONG_SWORD, {
            known: true, bknown: true, rknown: true,
            oartifact: ART_GIANTSLAYER,
            oextra: { oname: 'Giantslayer' },
        });
        assert.equal(donameFresh(unseen, state), 'the +0 Giantslayer');
        assert.equal(state.artiexist[ART_GIANTSLAYER].found, 0);
        // The same object once the hero has seen it: the stored flag now holds
        // and the artifact is found, which is what makes the refusal above a
        // reading of that flag rather than a path nothing reaches.
        unseen.dknown = true;
        assert.equal(donameFresh(unseen, state), 'the +0 Giantslayer');
        assert.equal(state.artiexist[ART_GIANTSLAYER].found, 1);

        // :1319 reads objects[POT_WATER].oc_name_known, not the forced `nn`.
        // xname() spells the potion by its actual name because `nn` is forced,
        // and the BUC word survives because the type itself is undiscovered:
        // C allows "blessed clear potion" where the hero cannot yet tell that
        // clear potions are water.
        assert.equal(state.objects[POT_WATER].oc_name_known, 0);
        const water = objectOf(state, POT_WATER, { blessed: true });
        assert.equal(
            donameFresh(water, state), 'a blessed potion of holy water',
        );

        // :1356 reads the stored dknown for the trap word alone, so a box the
        // hero has not seen keeps the lock word the counter supplies and loses
        // the trap word.
        const box = objectOf(state, LARGE_BOX, { otrapped: 1, tknown: true });
        assert.equal(
            donameFresh(box, state), 'an empty uncursed unlocked large box',
        );
        box.dknown = true;
        assert.equal(
            donameFresh(box, state),
            'an empty uncursed trapped unlocked large box',
        );
    });

test('override_ID supplies the bknown that names holy water', () => {
    const state = namingState();
    // xname_flags():841-843 needs bknown before it says "holy", and
    // doname_base():1318 then drops the BUC word it would otherwise repeat.
    // The type's own oc_name_known is what :1318 reads, not the forced nn,
    // so this pair only moves once the hero knows water by sight.
    state.objects[POT_WATER].oc_name_known = 1;
    const water = objectOf(state, POT_WATER, { dknown: true, blessed: true });
    assert.equal(donameFresh(water, state), 'a potion of water');
    state.iflags.override_ID = 1;
    assert.equal(donameFresh(water, state), 'a potion of holy water');
});

test('artifact identification uses the discovery list, not artiexist.found', () => {
    assert.match(
        OBJNAM_SOURCE,
        /otmp->oartifact && undiscovered_artifact\(otmp->oartifact\)/u,
    );
    assert.match(
        ARTIFACT_SOURCE,
        /undiscovered_artifact\(xint16 m\)[\s\S]*?if \(artidisco\[i\] == m\)[\s\S]*?else if \(artidisco\[i\] == 0\)/u,
    );
    assert.match(
        OBJNAM_JS_SOURCE,
        /obj\.oartifact\s*&&\s*undiscovered_artifact\(obj\.oartifact, state\)/u,
    );
    assert.match(
        ARTIFACT_JS_SOURCE,
        /undiscovered_artifact\(m, state = game\)[\s\S]*?state\.artidisco\[i\] === m/u,
    );

    const state = namingState();
    state.objects[LONG_SWORD].oc_name_known = 1;
    const sword = objectOf(state, LONG_SWORD, {
        known: true, dknown: true, bknown: true, rknown: true,
        oartifact: ART_GIANTSLAYER,
    });
    state.artiexist[ART_GIANTSLAYER].found = 1;
    state.artidisco.fill(0);
    // A found-object flag does not substitute for membership in artidisco.
    assert.equal(not_fully_identified(sword, state), true);

    state.artiexist[ART_GIANTSLAYER].found = 0;
    state.artidisco[0] = ART_GIANTSLAYER;
    // Conversely, C considers the artifact discovered when its id is in the
    // discovery list even if the independent found flag is clear.
    assert.equal(not_fully_identified(sword, state), false);

    const eyes = objectOf(state, LENSES, {
        oartifact: ART_EYES_OF_THE_OVERWORLD,
    });
    state.artiexist[ART_EYES_OF_THE_OVERWORLD].found = 1;
    state.artidisco.fill(0);
    assert.equal(is_plural(eyes, state), false);
    state.artiexist[ART_EYES_OF_THE_OVERWORLD].found = 0;
    state.artidisco[0] = ART_EYES_OF_THE_OVERWORLD;
    assert.equal(is_plural(eyes, state), true);
});

test('BUC, poison, erosion, and enchantment prefixes retain source order', () => {
    const state = namingState();
    const unknownUncursed = objectOf(state, DART, {
        bknown: true,
    });
    assert.equal(donameFresh(unknownUncursed, state), 'an uncursed dart');

    const damaged = objectOf(state, DART, {
        known: true,
        // Level 1 selects the unqualified erosion words; +2 checks placement.
        oeroded: 1,
        oeroded2: 1,
        opoisoned: true,
        spe: 2,
    });
    assert.equal(
        donameFresh(damaged, state),
        'a poisoned rusty corroded +2 dart',
    );
});

test('objnam.c erosion_matters recognizes source object classes', () => {
    const state = namingState();

    // objnam.c:1197-1215 returns true for weapons, armor, balls and chains;
    // tools depend on is_weptool(), while every other class is false.
    assert.equal(erosion_matters(objectOf(state, DART), state), true);
    assert.equal(erosion_matters(objectOf(state, ELVEN_LEATHER_HELM), state), true);
    assert.equal(erosion_matters(objectOf(state, HEAVY_IRON_BALL), state), true);
    assert.equal(erosion_matters(objectOf(state, IRON_CHAIN), state), true);
    assert.equal(erosion_matters(objectOf(state, AKLYS), state), true);
    assert.equal(erosion_matters(objectOf(state, BLINDFOLD), state), false);
    assert.equal(erosion_matters(objectOf(state, POT_HEALING), state), false);
});

// obj.h is_poisonable() (264-268) admits an object on either of two terms, and
// only the first repeats is_multigen() (260-263) word for word. The second,
// artifact.c permapoisoned() (2837-2840), answers TRUE for ART_GRIMTOOTH
// alone. Nothing else in the tree exercises it, so without this the port could
// drop that disjunct and every test would still pass.
test('is_poisonable admits an ammunition skill or Grimtooth', () => {
    const state = namingState();
    // objects.h PROJECTILE("dart", ... -P_DART ...): WEAPON_CLASS with an
    // oc_skill inside is_multigen()'s [-P_SHURIKEN, -P_BOW] window.
    assert.equal(isPoisonable(objectOf(state, DART), state), true);
    // objects.h WEAPON("orcish dagger", ... P_DAGGER ...): WEAPON_CLASS, but
    // oc_skill 1 is outside that window, so the first term rejects it.
    const orcish = objectOf(state, ORCISH_DAGGER);
    assert.equal(isPoisonable(orcish, state), false);
    // Grimtooth is that same orcish dagger, and the second term alone admits
    // it. artifact.c mk_artifact() sets opoisoned from the same predicate.
    orcish.oartifact = ART_GRIMTOOTH;
    assert.equal(isPoisonable(orcish, state), true);
    // The term is about the artifact and not about the object's class: any
    // other artifact leaves it rejected.
    orcish.oartifact = ART_GIANTSLAYER;
    assert.equal(isPoisonable(orcish, state), false);
});

test('Cleric and Samurai naming applies role state at xname boundaries', () => {
    const clericState = namingState();
    clericState.urole.mnum = PM_CLERIC;
    const clericDart = objectOf(clericState, DART);

    assert.equal(donameFresh(clericDart, clericState), 'a dart');
    assert.equal(clericDart.bknown, true);

    const samuraiState = namingState();
    samuraiState.urole.mnum = PM_SAMURAI;
    samuraiState.urole.filecode = 'Sam';
    assert.equal(
        donameFresh(objectOf(samuraiState, FOOD_RATION), samuraiState),
        'a gunyoki',
    );
});

test('quantities pluralize coins, weapons, and configured fruit', () => {
    const state = namingState();
    assert.equal(
        donameFresh(objectOf(state, GOLD_PIECE), state),
        'a gold piece',
    );
    assert.equal(
        donameFresh(objectOf(state, GOLD_PIECE, {
            // Two items take the numeric plural branch.
            quan: 2,
        }), state),
        '2 gold pieces',
    );
    assert.equal(
        donameFresh(objectOf(state, DART, {
            // Three items cover ordinary noun pluralization independently.
            quan: 3,
        }), state),
        '3 darts',
    );

    // A single-letter first word follows just_an()'s spoken-letter rule.
    state.gf.ffruit.fname = 'x apple';
    assert.equal(
        donameFresh(objectOf(state, SLIME_MOLD, {
            spe: state.gf.ffruit.fid,
        }), state),
        'an x apple',
    );

    state.gf.ffruit.fname = 'blueberries';
    assert.equal(
        donameFresh(objectOf(state, SLIME_MOLD, {
            // Two fruits exercise singular-then-plural normalization.
            quan: 2,
            spe: state.gf.ffruit.fid,
        }), state),
        '2 blueberries',
    );
});

test('corpse, statue, and named-fruit articles include their source nouns', () => {
    const state = namingState();
    assert.equal(
        donameFresh(objectOf(state, CORPSE, {
            bknown: true,
            corpsenm: PM_NEWT,
        }), state),
        'an uncursed newt corpse',
    );
    assert.equal(
        donameFresh(objectOf(state, CORPSE, {
            corpsenm: PM_NEWT,
            // Two corpses use the count without an indefinite article.
            quan: 2,
        }), state),
        '2 newt corpses',
    );
    assert.equal(
        donameFresh(objectOf(state, STATUE, {
            corpsenm: PM_NEWT,
        }), state),
        'a statue of a newt',
    );

    state.gf.ffruit.fname = 'The Orb of Detection';
    assert.equal(
        donameFresh(objectOf(state, SLIME_MOLD, {
            spe: state.gf.ffruit.fid,
        }), state),
        'the Orb of Detection',
    );
});

// C ref: objnam.c doname_base():1549-1559, which names the gender stored in
// obj->spe. Both halves of its guard are wizard-only state, so an ordinary
// game never shows this whatever spe holds.
test("'wizmgender' names the gender a body or statue carries", () => {
    const state = namingState();
    state.wizard = true;
    state.iflags.wizmgender = true;
    // hack.h:1190, CORPSTAT_GENDER is 0x03, so C reads spe's low two bits and
    // nothing above them. The rows below run the field past that mask as well
    // as through it: hack.h:1191 gives 0x04 to CORPSTAT_HISTORIC, which a
    // statue carries alongside its gender, so a test that drove spe only over
    // 0 to 3 could not tell `spe & CORPSTAT_GENDER` from a bare `spe` and
    // would let the mask be dropped. CORPSTAT_RANDOM is what mkcorpstat()
    // leaves when nothing chose a gender, and C answers it outside genders[]
    // altogether.
    for (const [spe, adjective] of [
        [0, 'unspecified gender'],
        [1, 'female'],
        [2, 'male'],
        [3, 'neuter'],
        [4, 'unspecified gender'],
        [5, 'female'],
        [6, 'male'],
        [7, 'neuter'],
    ]) {
        assert.equal(
            donameFresh(
                objectOf(state, CORPSE, { corpsenm: PM_NEWT, spe }), state,
            ),
            `a newt corpse (${adjective})`,
        );
    }
    // A statue and a figurine reach the same branch through the common tail
    // rather than through the corpse arm above it.
    assert.equal(
        donameFresh(
            objectOf(state, STATUE, { corpsenm: PM_NEWT, spe: 1 }), state,
        ),
        'a statue of a newt (female)',
    );
    // A statue is where CORPSTAT_HISTORIC is actually used -- hack.h:1191
    // says it is not used for a corpse -- so this is the pair that shows the
    // gender suffix reading only the masked bits while another part of the
    // same field drives a different clause of the same name.
    assert.equal(
        donameFresh(
            objectOf(state, STATUE, { corpsenm: PM_NEWT, spe: 5 }), state,
        ),
        'a historic statue of a newt (female)',
    );
    assert.equal(
        donameFresh(
            objectOf(state, FIGURINE, { corpsenm: PM_NEWT, spe: 2 }), state,
        ),
        'a figurine of a newt (male)',
    );
    // Where the suffix sits among its siblings, which nothing else pins.
    // objnam.c:1549 puts the gender clause after the " named ..." clause and
    // before the wielded group, so moving the call would produce a wrong name
    // with every assertion above still passing.
    assert.equal(
        donameFresh(
            objectOf(state, FIGURINE, {
                corpsenm: PM_NEWT, spe: 1, owornmask: W_WEP,
            }),
            state,
        ),
        'a figurine of a newt (female) (wielded)',
    );
    assert.equal(
        donameFresh(
            objectOf(state, CORPSE, {
                corpsenm: PM_NEWT, spe: 2, dknown: true,
                oextra: { oname: 'Rex' },
            }),
            state,
        ),
        'a newt corpse named Rex (male)',
    );
    // An object type that stores no gender keeps spe's ordinary meaning.
    assert.equal(
        donameFresh(objectOf(state, DART, { spe: 1, known: true }), state),
        'a +1 dart',
    );

    // Either half of the guard alone leaves every name unchanged.
    const female = { corpsenm: PM_NEWT, spe: 1 };
    state.wizard = false;
    assert.equal(
        donameFresh(objectOf(state, CORPSE, female), state), 'a newt corpse',
    );
    state.wizard = true;
    state.iflags.wizmgender = false;
    assert.equal(
        donameFresh(objectOf(state, CORPSE, female), state), 'a newt corpse',
    );
});

test('artifact naming records found separately from discovered identity', () => {
    const state = namingState();
    state.artiexist[ART_GIANTSLAYER].exists = 1;
    const artifact = objectOf(state, LONG_SWORD, {
        oartifact: ART_GIANTSLAYER,
        oextra: { oname: 'Giantslayer' },
    });

    assert.equal(
        donameFresh(artifact, state),
        'a long sword named Giantslayer',
    );
    assert.equal(state.artiexist[ART_GIANTSLAYER].found, 1);

    artifact.known = true;
    artifact.bknown = true;
    artifact.rknown = true;
    // C find_artifact() sets artiexist[].found but does not call
    // discover_artifact(); not_fully_identified() still sees an empty
    // artidisco[] until the separate discovery event occurs.
    assert.deepEqual(state.artidisco, Array(state.artidisco.length).fill(0));
    assert.equal(
        donameFresh(artifact, state), 'a +0 long sword named Giantslayer',
    );
    state.artidisco[0] = ART_GIANTSLAYER;
    assert.equal(donameFresh(artifact, state), 'the +0 Giantslayer');
});

test('xname_flags lowercases The only in an artifact instance name', () => {
    const state = namingState();
    state.artiexist[ART_HEART_OF_AHRIMAN].exists = 1;
    const heart = objectOf(state, LUCKSTONE, {
        oartifact: ART_HEART_OF_AHRIMAN,
        dknown: true,
        oextra: { oname: 'The Heart of Ahriman' },
    });

    // objnam.c:xname_flags() appends the instance name, then lowercases its
    // initial T when the object is an artifact. The class name stays intact.
    assert.equal(
        xnameFresh(heart, state), 'gray stone named the Heart of Ahriman',
    );

    const ordinary = objectOf(state, LUCKSTONE, {
        dknown: true,
        oextra: { oname: 'The Other Name' },
    });
    assert.equal(
        xnameFresh(ordinary, state), 'gray stone named The Other Name',
    );
});

// C ref: objnam.c obj_is_pname() (332-342), which withholds the personal name
// while not_fully_identified() (1786-1819) holds. Its last clause returns
// FALSE early for every class outside armor, weapons, weapon-tools and the
// ball, so only those four fall through to `return is_damageable(otmp)` at
// 1818 -- meaning a weapon with rknown clear is still not fully identified.
test('a named artifact weapon needs rknown before it names itself', () => {
    const state = namingState();
    state.artiexist[ART_GIANTSLAYER].exists = 1;
    const artifact = objectOf(state, LONG_SWORD, {
        oartifact: ART_GIANTSLAYER,
        oextra: { oname: 'Giantslayer' },
    });
    // The first naming is what records the artifact as found, which clears
    // artiexist[].found. C's separate artidisco discovery is required to
    // clear not_fully_identified()'s arm at 1805.
    donameFresh(artifact, state);
    state.artidisco[0] = ART_GIANTSLAYER;
    artifact.known = true;
    artifact.bknown = true;

    // A long sword is WEAPON_CLASS, so the early `return FALSE` at 1819 does
    // not apply and is_damageable() decides: iron erodes, so rknown still
    // matters and the object keeps its ordinary name with the oname appended.
    artifact.rknown = false;
    assert.equal(
        donameFresh(artifact, state),
        'a +0 long sword named Giantslayer',
    );

    // rknown alone flips the first term of that clause.
    artifact.rknown = true;
    assert.equal(donameFresh(artifact, state), 'the +0 Giantslayer');
});

test('known charges and partly used candles use object-specific suffixes', () => {
    const state = namingState();
    assert.equal(
        donameFresh(objectOf(state, WAN_SLEEP, {
            known: true,
            // One recharge and four charges make both suffix fields visible.
            recharged: 1,
            spe: 4,
        }), state),
        `a ${OBJ_DESCR(state.objects[WAN_SLEEP], state)} wand (1:4)`,
    );

    const candle = objectOf(state, TALLOW_CANDLE, {
        // Tallow candles have a 200-turn full burn time; 199 is used.
        age: 199,
    });
    assert.equal(
        donameFresh(candle, state),
        'a partly used candle',
    );
});

// C ref: objnam.c doname_base():1382, the switch on
// `is_weptool(obj) ? WEAPON_CLASS : obj->oclass`. A weapon-tool takes the
// WEAPON_CLASS arm at :1418, which appends the enchantment to the prefix and
// breaks, so it never reaches the `charges:` label at :1484 even though the
// WEPTOOL macro at objects.h:892-897 gives every weapon-tool oc_charged 1.
// objects.h has exactly three WEPTOOL rows -- pick-axe (1007), grappling hook
// (1010) and unicorn horn (1013) -- and this pins all three, because the class
// test rather than any one object decides the arm.
test('weapon-tools take the enchantment and no charge count', () => {
    const state = namingState();
    // A recharge count and a nonzero enchantment would both be visible in a
    // "(recharged:spe)" suffix, so a weapon-tool that carries them and still
    // prints none shows the `charges:` label was skipped rather than empty.
    const charged = { known: true, recharged: 1, spe: 2 };
    assert.equal(
        donameFresh(objectOf(state, PICK_AXE, charged), state),
        'a +2 pick-axe',
    );
    assert.equal(
        donameFresh(objectOf(state, GRAPPLING_HOOK, charged), state),
        'a +2 grappling hook',
    );
    assert.equal(
        donameFresh(objectOf(state, UNICORN_HORN, charged), state),
        'a +2 unicorn horn',
    );
    // :1422 guards the enchantment on `known`, and chargedSuffix() is not
    // reached either way, so an unidentified weapon-tool is the bare name.
    assert.equal(
        donameFresh(objectOf(state, PICK_AXE, { known: false }), state),
        'a pick-axe',
    );

    // objects.h:968 TOOL("magic marker", ...) passes chrg 1 with the TOOL
    // macro's P_NONE skill, so it is oc_charged but not a weapon-tool: it
    // stays on the TOOL_CLASS arm and reaches `charges:` through the
    // `goto charges` at :1480-1481.
    assert.equal(
        donameFresh(objectOf(state, MAGIC_MARKER, charged), state),
        'a magic marker (1:2)',
    );
    // objects.h:212 WEAPON("athame", ...) is oc_charged too, since the WEAPON
    // macro at 114-119 passes chrg 1 for every weapon. Its class alone keeps
    // it off the charge arm, which is what the weapon-tool test above shares.
    assert.equal(
        donameFresh(objectOf(state, ATHAME, charged), state),
        'a +2 athame',
    );
});

test('doname appends remembered price quotes after the object name', () => {
    const state = namingState();
    state.iflags.pricequotes = true;
    const type = state.objects[POT_HEALING];
    type.oc_buy_minseen = 10;
    type.oc_buy_maxseen = 20;

    const quoted = objectOf(state, POT_HEALING);
    assert.equal(
        donameFresh(quoted, state),
        'a purple-red potion {buy 10-20}',
    );
    assert.equal(quoted.dknown, true);

    type.oc_buy_minseen = Number.MAX_SAFE_INTEGER;
    type.oc_buy_maxseen = 0;
    const unquoted = objectOf(state, POT_HEALING);
    assert.equal(donameFresh(unquoted, state), 'a purple-red potion');

    type.oc_buy_minseen = 10;
    type.oc_buy_maxseen = 20;
    const contained = objectOf(state, POT_HEALING, {
        where: OBJ_CONTAINED,
    });
    assert.equal(
        doname_with_price(contained, state),
        'a purple-red potion {buy 10-20}',
    );

    // OBJ_INVENT: a hero's own worn item (e.g. during nymph theft) is not
    // unpaid, so C's doname_base falls through to the remembered-price-quote
    // branch at objnam.c:1682-1684. The item gets its base name plus any
    // remembered price quote, matching the OBJ_CONTAINED path.
    const inventItem = objectOf(state, POT_HEALING, {
        where: OBJ_INVENT,
    });
    assert.equal(
        doname_with_price(inventItem, state),
        'a purple-red potion {buy 10-20}',
    );

    // Without a remembered price quote, OBJ_INVENT returns the plain name.
    type.oc_buy_minseen = Number.MAX_SAFE_INTEGER;
    type.oc_buy_maxseen = 0;
    const inventNoQuote = objectOf(state, POT_HEALING, {
        where: OBJ_INVENT,
    });
    assert.equal(
        doname_with_price(inventNoQuote, state),
        'a purple-red potion',
    );
});

test('append_price_quote measures multibyte C buffer contents in bytes', () => {
    const state = namingState();
    const type = state.objects[POT_HEALING];
    Object.assign(type, {
        oc_buy_minseen: 20,
        oc_buy_maxseen: 30,
        oc_sell_minseen: 5,
        oc_sell_maxseen: 8,
    });
    const quote = ' {buy 20-30 sell 5-8}';

    // shk.c:append_price_quote compares byte lengths against BUFSZ=256.
    // Its 21-byte suffix fits after 116 two-byte names (23 bytes remain),
    // while 117 leave exactly 21 bytes and fail C's strict `<` check.
    assert.equal(
        append_price_quote('é'.repeat(116), POT_HEALING, state), quote,
    );
    assert.equal(
        append_price_quote('é'.repeat(117), POT_HEALING, state), '',
    );
});

test('doname keeps C cached capacity after appending a remembered quote', () => {
    const state = namingState();
    state.iflags.pricequotes = true;
    state.wizard = true;
    state.iflags.wizweight = true;
    const type = state.objects[DART];
    Object.assign(type, {
        // init_objects() marks this DART's type known for this startup fixture;
        // C's remembered-price branch requires an unknown type.
        oc_name_known: 0,
        oc_buy_minseen: 20,
        oc_buy_maxseen: 30,
        oc_sell_minseen: 5,
        oc_sell_maxseen: 8,
    });

    // C has BUFSZ=256 and PREFIX=80, leaving 175 bytes after xname. The
    // 11-byte `dart named ` prefix plus this 149-byte name makes a 160-byte
    // body and caches 15 bytes. append_price_quote's separate BUFSZ guard
    // accepts its 21-byte suffix, but does not refresh bpspaceleft; the
    // following eight-byte wizard suffix therefore still uses those 15.
    const named = objectOf(state, DART, {
        dknown: true,
        owt: 1,
        oextra: { oname: 'x'.repeat(149) },
    });
    const body = xnameFresh(named, state);
    assert.equal(body.length, 160);
    assert.equal(
        donameFresh(named, state),
        `a ${body} {buy 20-30 sell 5-8} (1 aum)`,
    );
});

test('doname uses peek_timer for the active candle burn interval', () => {
    const state = namingState();
    const wieldedForXname = objectOf(state, DART, { owornmask: W_WEP });
    assert.equal(xnameFresh(wieldedForXname, state), 'dart');
    assert.equal(wieldedForXname.dknown, true);

    state.iflags.pricequotes = false;

    state.objects[WAN_SLEEP].oc_uname = 'napper';
    const calledWand = objectOf(state, WAN_SLEEP);
    assert.equal(donameFresh(calledWand, state), 'a wand called napper');
    assert.equal(calledWand.dknown, true);

    // timeout.c:1471 adds age 149 to the absolute expiry 150, then subtracts
    // moves 100: 199 turns remain, one below this source type's 200-turn
    // full-burn threshold. The timer is attached before naming, as in a lit
    // candle that is already burning during play.
    state.moves = 100;
    const litCandle = objectOf(state, TALLOW_CANDLE, {
        age: 149, lamplit: true,
    });
    start_timer(50, TIMER_OBJECT, BURN_OBJECT, litCandle, state);
    assert.equal(donameFresh(litCandle, state), 'a partly used candle (lit)');
    assert.equal(litCandle.dknown, true);
});

test('an() applies just_an()\'s article rules', () => {
    // Each case names the objnam.c just_an() branch it exercises. The
    // article-free names are the three that dfeature_at() can return and
    // just_an() lists literally, plus a "the " prefix.
    for (const [name, expected] of [
        ['ice', 'ice'],
        ['molten lava', 'molten lava'],
        ['iron bars', 'iron bars'],
        ['the Gnomish Mines', 'the Gnomish Mines'],
        // Single letters: "aefhilmnosx" take "an", everything else "a".
        ['a', 'an a'],
        ['b', 'a b'],
        ['x', 'an x'],
        // The ordinary vowel and consonant cases.
        ['open door', 'an open door'],
        ['fountain', 'a fountain'],
        ['opulent throne', 'an opulent throne'],
        // Exceptions warranting "a" before a vowel.
        ['one-eyed newt', 'a one-eyed newt'],
        ['eucalyptus leaf', 'a eucalyptus leaf'],
        ['unicorn horn', 'a unicorn horn'],
        ['uranium wand', 'a uranium wand'],
        ['useful tool', 'a useful tool'],
        // "one" only counts with a separator after it; "oneself" does not.
        ['oneself', 'an oneself'],
        // Initial x before a consonant takes "an", before a vowel "a".
        ['xylophone', 'an xylophone'],
        ['xan', 'a xan'],
    ]) {
        assert.equal(an(name), expected, name);
        assert.equal(just_an(name) + name, expected, `just_an ${name}`);
    }
    assert.throws(() => an(''), /an\(\) requires a name/u);
});

test('vtense() agrees with the subject objnam.c inspects', () => {
    for (const [subject, verb, expected] of [
        // An "a"/"an" subject is singular however it ends.
        ['a pair of iron bars', 'are', 'is'],
        ['an aklys', 'are', 'is'],
        // Plural: ends in s, but not us or ss.
        ['iron bars', 'are', 'are'],
        ['bus', 'are', 'is'],
        ['glass', 'are', 'is'],
        // The other plural endings objnam.c lists.
        ['teeth', 'are', 'are'],
        ['feet', 'are', 'are'],
        ['larvae', 'are', 'are'],
        // special_subjs[] entries end in s but are singular.
        ['erinys', 'are', 'is'],
        ['aklys', 'are', 'is'],
        ['the invisible erinys', 'are', 'is'],
        // The head noun is what precedes " of ", so this is singular.
        ['pair of gloves', 'are', 'is'],
        // Pronouns handled explicitly.
        ['they', 'are', 'are'],
        ['you', 'are', 'are'],
        // A null subject asks for the singular third person directly.
        [null, 'are', 'is'],
        // Verb inflection: are/have are special-cased, then the s, es, and
        // ies rules.
        ['staircase up', 'have', 'has'],
        ['staircase up', 'push', 'pushes'],
        ['staircase up', 'fizz', 'fizzes'],
        ['staircase up', 'go', 'goes'],
        ['staircase up', 'fly', 'flies'],
        ['staircase up', 'obey', 'obeys'],
        ['staircase up', 'lie', 'lies'],
        // Strcasecpy() keeps the case of the character it overwrites, in
        // every branch that writes one, not just the "are" special case.
        ['staircase up', 'ARE', 'IS'],
        ['staircase up', 'HAVE', 'HAS'],
        ['staircase up', 'PUSH', 'PUSHES'],
        ['staircase up', 'GO', 'GOES'],
        ['staircase up', 'FLY', 'FLIES'],
        ['staircase up', 'OBEY', 'OBEYS'],
    ]) {
        assert.equal(vtense(subject, verb), expected, `${subject} ${verb}`);
    }
});

// distant_name() asks whether the hero could have inspected the object where
// it lies, so its cases need a lit square and a hero position. IN_SIGHT is the
// only viz_array bit cansee() reads.
function distantNamingState(objectX, objectY) {
    const state = namingState();
    state.level = new GameMap();
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Array(COLNO).fill(0),
    );
    state.viz_array[objectY][objectX] = IN_SIGHT;
    // distu() measures from the hero; place him on the object's row so a
    // single coordinate controls the squared distance.
    state.u.ux = objectX;
    state.u.uy = objectY;
    state.u.xray_range = 0;
    return state;
}

function floorPotion(state, x, y) {
    return objectOf(state, POT_HEALING, {
        ox: x,
        oy: y,
        where: OBJ_FLOOR,
    });
}

test('distant_name observes an object inside the rounded near square', () => {
    // r == 2 and neardist == 2*2*2 - 2 == 6, so distu() of 4 is inside it.
    const state = distantNamingState(10, 5);
    const potion = floorPotion(state, 10, 5);
    state.u.ux = 8; // dist2 == 4 <= 6.
    const description = OBJ_DESCR(state.objects[POT_HEALING], state);

    assert.equal(
        distant_name(potion, donameFresh, state),
        `a ${description} potion`,
    );
    assert.equal(potion.dknown, true);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 1);
    assert.equal(state.gd?.distantname ?? 0, 0);
});

test('distant_name suppresses discovery outside the near square', () => {
    // dist2 of (3,0) is 9, the first squared distance past neardist == 6.
    const state = distantNamingState(10, 5);
    const potion = floorPotion(state, 10, 5);
    state.u.ux = 7;

    // Without dknown, xname()'s potion branch drops the appearance entirely.
    assert.equal(distant_name(potion, donameFresh, state), 'a potion');
    assert.equal(potion.dknown, false);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 0);
    assert.equal(state.gd.distantname, 0);
});

test('distant_name rounds the corners of the near square', () => {
    // The diagonal at (2,2) has dist2 8. Two squares away on either axis alone
    // is dist2 4 and near, so only the `- r` term in neardist == r*r*2 - r
    // pushes this corner out.
    const state = distantNamingState(10, 5);
    const potion = floorPotion(state, 10, 5);
    state.u.ux = 8;
    state.u.uy = 3;

    distant_name(potion, donameFresh, state);
    assert.equal(potion.dknown, false);
});

test('distant_name treats an unseen square as distant however close', () => {
    const state = distantNamingState(10, 5);
    const potion = floorPotion(state, 10, 5);
    state.viz_array[5][10] = 0; // cansee() fails on the object's own square.

    distant_name(potion, donameFresh, state);
    assert.equal(potion.dknown, false);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 0);
});

test('distant_name counts a visible artifact as near at any distance', () => {
    // C ref: objnam.c:388, the `obj->oartifact ||` disjunct. Its purpose is
    // the side effect the comment above it names: reaching xname()'s
    // find_artifact() call, which is what marks the artifact as found.
    // dist2 9 is the same distance the suppression case above uses, so only
    // the disjunct separates the two.
    const state = distantNamingState(10, 5);
    state.artiexist[ART_GIANTSLAYER].exists = 1;
    const artifact = objectOf(state, LONG_SWORD, {
        oartifact: ART_GIANTSLAYER,
        oextra: { oname: 'Giantslayer' },
        ox: 10,
        oy: 5,
        where: OBJ_FLOOR,
    });
    state.u.ux = 7;

    distant_name(artifact, donameFresh, state);
    assert.equal(artifact.dknown, true);
    assert.equal(state.artiexist[ART_GIANTSLAYER].found, 1);
    assert.equal(state.gd?.distantname ?? 0, 0);
});

test('distant_name widens the near square with the hero xray range', () => {
    // xray_range 3 raises neardist to 3*3*2 - 3 == 15, which admits dist2 9.
    const state = distantNamingState(10, 5);
    const potion = floorPotion(state, 10, 5);
    state.u.ux = 7;
    state.u.xray_range = 3;

    distant_name(potion, donameFresh, state);
    assert.equal(potion.dknown, true);
});

test('distant_name lowers its counter after remembered-price formatting', () => {
    const state = distantNamingState(10, 5);
    const potion = floorPotion(state, 10, 5);
    state.viz_array[5][10] = 0; // Force the counted branch.
    state.iflags.pricequotes = true;
    state.objects[POT_HEALING].oc_buy_minseen = 10;
    state.objects[POT_HEALING].oc_buy_maxseen = 20;

    assert.equal(
        distant_name(potion, donameFresh, state),
        'a potion {buy 10-20}',
    );
    assert.equal(state.gd.distantname, 0);
});

// objnam.c cxname() (1922-1930), The() (2234-2241), otense() (2529-2545) and
// aobjnam() (2242-2258).  zap.c makewish() builds The(aobjnam(otmp, verb))
// for the message it prints only when the object cannot be held.
test('aobjnam names the object and agrees the verb with it', () => {
    const state = namingState();
    const lamp = objectOf(state, OIL_LAMP, { dknown: true });

    // Singular: the verb takes vtense()'s third-person "s".
    assert.equal(aobjnam(lamp, 'drop', state), 'lamp drops');
    assert.equal(The(aobjnam(lamp, 'drop', state)), 'The lamp drops');
    // The verb is optional; without it the name stands alone.
    assert.equal(aobjnam(lamp, null, state), 'lamp');
    // A stack prefixes its count and leaves the plural verb as it arrived.
    lamp.quan = 2;
    assert.equal(aobjnam(lamp, 'drop', state), '2 lamps drop');
    assert.equal(otense(lamp, 'drop'), 'drop');
    lamp.quan = 1;
    assert.equal(otense(lamp, 'drop'), 'drops');
    // cxname() answers xname() for everything but a corpse, whose monster
    // type xname() would drop; corpse_xname() supplies it instead, and CXN_
    // NORMAL leaves the quantity to say "corpses".
    assert.equal(cxname(lamp, state), 'lamp');
    const corpse = objectOf(state, CORPSE, { corpsenm: PM_NEWT });
    assert.equal(cxname(corpse, state), 'newt corpse');
    corpse.quan = 2;
    assert.equal(cxname(corpse, state), 'newt corpses');
});

// C refs: objnam.c corpse_xname() (1823-1919) and cxname_singular()
// (1933-1938). Globs use their object class name without a corpse suffix;
// CXN_SINGULAR suppresses pluralization without changing object quantity.
test('corpse_xname and cxname_singular preserve source flags and glob naming', () => {
    const state = namingState();
    const corpse = objectOf(state, CORPSE, {
        corpsenm: PM_NEWT,
        quan: 3,
    });
    assert.equal(corpse_xname(corpse, null, CXN_NORMAL, state), 'newt corpses');
    assert.equal(corpse_xname(corpse, null, CXN_SINGULAR, state), 'newt corpse');
    assert.equal(cxname_singular(corpse, state), 'newt corpse');
    assert.equal(corpse_xname(corpse, null, CXN_ARTICLE, state), 'newt corpses');
    assert.equal(corpse_xname(corpse, null, CXN_PFX_THE, state), 'the newt corpses');
    assert.equal(corpse_xname(corpse, null, CXN_NOCORPSE, state), 'newt');

    const glob = objectOf(state, GLOB_OF_GRAY_OOZE, {
        corpsenm: PM_NEWT,
        globby: true,
        quan: 7,
    });
    assert.equal(corpse_xname(glob, null, CXN_NORMAL, state), 'glob of gray ooze');
    assert.equal(corpse_xname(glob, null, CXN_ARTICLE, state), 'a glob of gray ooze');
    assert.equal(corpse_xname(glob, 'cursed', CXN_NORMAL, state),
        'cursed glob of gray ooze');

    const ration = objectOf(state, FOOD_RATION, { quan: 4 });
    assert.equal(cxname_singular(ration, state), 'food ration');
    assert.equal(ration.quan, 4);
});

// objnam.c killer_xname() (1942-2005). Death text temporarily exposes the
// object's identifying name while suppressing incidental properties, then
// restores both the object and its object-type discovery fields.
test('killer_xname formats source special cases and restores temporary ID', () => {
    const state = namingState();
    const rationType = state.objects[FOOD_RATION];
    rationType.oc_name_known = 0;
    rationType.oc_uname = 'traveler food';
    const ration = objectOf(state, FOOD_RATION, {
        known: false,
        dknown: false,
        bknown: true,
        rknown: true,
        greased: true,
        blessed: true,
        cursed: false,
        opoisoned: true,
        oextra: { oname: 'emergency meal', timed: 9 },
    });
    const rationBefore = structuredClone(ration);
    assert.equal(killer_xname(ration, state), 'a food ration');
    assert.deepEqual(ration, rationBefore);
    assert.equal(rationType.oc_name_known, 0);
    assert.equal(rationType.oc_uname, 'traveler food');

    // Water is the exception to clearing BUC: bknown is turned on so holy
    // water stays distinguishable in the tombstone reason.
    const holyWater = objectOf(state, POT_WATER, {
        known: false, dknown: false, bknown: false, blessed: true,
    });
    assert.equal(killer_xname(holyWater, state), 'a potion of holy water');

    // C uses corpse_xname() and a dedicated slime-mold name instead of xname.
    const corpse = objectOf(state, CORPSE, { corpsenm: PM_NEWT });
    assert.equal(killer_xname(corpse, state), 'a newt corpse');
    const slime = objectOf(state, SLIME_MOLD, { quan: 2 });
    assert.equal(killer_xname(slime, state), 'deadly slime molds');

    // Artifacts bypass temporary object identification entirely.
    const excalibur = objectOf(state, LONG_SWORD, {
        oartifact: ART_EXCALIBUR,
        oextra: { oname: 'Excalibur' },
    });
    assert.equal(killer_xname(excalibur, state), 'Excalibur');
});

// objnam.c yobjnam() (2262-2276) and Yobjnam2() (2280-2285). pleased()
// uses the capitalized possessive form for its weapon glow messages.
test('Yobjnam2 combines ownership, counts, and verb agreement', () => {
    const state = namingState();
    const lamp = objectOf(state, OIL_LAMP, {
        dknown: true, where: OBJ_INVENT,
    });

    assert.equal(Yobjnam2(lamp, 'drop', state), 'Your lamp drops');
    lamp.quan = 2;
    assert.equal(Yobjnam2(lamp, 'drop', state), 'Your 2 lamps drop');
    assert.equal(Yobjnam2(lamp, null, state), 'Your 2 lamps');
});

test('Tobjnam uses the supplied naming catalogs for its article', () => {
    // Tobjnam() first runs xname() and then The(). Both C calls read the same
    // globals, so the JavaScript pair must keep using the supplied state.
    const monsterState = namingState();
    monsterState.mons = structuredClone(monsterState.mons);
    monsterState.artilist = structuredClone(monsterState.artilist);
    monsterState.artiexist = structuredClone(monsterState.artiexist);
    monsterState.gf = structuredClone(monsterState.gf);
    monsterState.mons[PM_FOX].pmnames = [
        'Blueberries', 'Blueberries', 'Blueberries',
    ];
    monsterState.artilist[ART_GIANTSLAYER].name = 'Blueberries';
    monsterState.artiexist[ART_GIANTSLAYER].exists = 1;
    monsterState.artiexist[ART_GIANTSLAYER].found = 1;
    monsterState.iflags.override_ID = true;
    const artifact = objectOf(monsterState, LONG_SWORD, {
        dknown: true,
        oartifact: ART_GIANTSLAYER,
        oextra: { oname: 'Blueberries' },
    });
    assert.equal(
        Tobjnam(artifact, 'turn', monsterState),
        'The Blueberries turns',
    );

    // A configured capitalized fruit takes an article unless an artifact of
    // that name lacks one. This clone deliberately changes both catalogs.
    const fruitState = namingState();
    fruitState.mons = structuredClone(fruitState.mons);
    fruitState.artilist = structuredClone(fruitState.artilist);
    fruitState.artiexist = structuredClone(fruitState.artiexist);
    fruitState.gf = {
        ffruit: { fname: 'Excalibur', fid: 7, nextf: null },
    };
    fruitState.artilist[ART_EXCALIBUR].name = 'Elsecalibur';
    const fruit = objectOf(fruitState, SLIME_MOLD, { spe: 7 });
    assert.equal(Tobjnam(fruit, null, fruitState), 'The Excalibur');
});

test('The distinguishes capitalized monster types, names, and object names',
    () => {
        const state = namingState();
        assert.equal(state.mons[PM_ARCHON].pmnames[2], 'Archon');
        assert.equal(The('Archon', state), 'The Archon');
        assert.equal(
            The(state.mons[PM_WIZARD_OF_YENDOR].pmnames[2], state),
            'The Wizard of Yendor',
        );
        assert.equal(state.mons[PM_MEDUSA].pmnames[2], 'Medusa');
        assert.equal(The('Medusa', state), 'Medusa');

        // Configured capitalized fruit is an ordinary noun, except when its
        // name collides with an artifact that deliberately lacks "the".
        state.gf.ffruit.fname = 'Blueberries';
        assert.equal(The('Blueberries', state), 'The Blueberries');
        state.gf.ffruit.fname = 'Excalibur';
        assert.equal(The('Excalibur', state), 'Excalibur');

        // objnam.c's proper-name heuristic: a lower-case final word normally
        // needs the article, an apostrophe suppresses it, and "of" wins only
        // when it precedes a later naming clause.
        assert.equal(The('Shiny object', state), 'The Shiny object');
        assert.equal(The("Rex's corpse", state), "Rex's corpse");
        assert.equal(The('Orb of Detection', state), 'The Orb of Detection');
        assert.equal(
            The('Orb named Eye of Detection', state),
            'Orb named Eye of Detection',
        );
        assert.equal(
            The('Platinum Yendorian Express Card', state),
            'The Platinum Yendorian Express Card',
        );
    });

test('The preserves the source boundary cases in its proper-name heuristic',
    () => {
        const state = namingState();

        // 'A' and 'Z' are both capital letters in objnam.c's ASCII test,
        // including when they begin the final word after a separator.
        assert.equal(The('A', state), 'A');
        assert.equal(The('X A', state), 'X A');
        assert.equal(The('X Z', state), 'X Z');

        // fruit_from_name() is exact here. A longer name with a fruit prefix
        // remains a proper name, while an exact fruit spelling that only
        // fuzzily resembles an artifact still needs the article.
        state.gf.ffruit.fname = 'Blueberries';
        assert.equal(The('Blueberries Pie', state), 'Blueberries Pie');
        state.gf.ffruit.fname = 'Magic Bane';
        assert.equal(The('Magic Bane', state), 'The Magic Bane');

        // The Platinum-card exception applies only when no naming clause has
        // already made the whole string a proper name.
        assert.equal(
            The('X named Platinum Yendorian Express Card', state),
            'X named Platinum Yendorian Express Card',
        );
        assert.equal(
            The('Orb called Eye of Detection', state),
            'Orb called Eye of Detection',
        );
    });

// objnam.c yname() (2358-2374) and Yname2() (2376-2383). wield.c
// can_twoweapon() opens two of its refusals with Yname2(), so the capital and
// the ownership prefix both land at the start of a sentence.
test('yname prefixes the owner and Yname2 capitalizes it', () => {
    const state = namingState();
    const lamp = objectOf(state, OIL_LAMP, {
        dknown: true, where: OBJ_INVENT,
    });

    // shk.c shk_your() answers "your " for what the hero carries, and
    // Yname2() raises only the first character of the whole result.
    assert.equal(yname(lamp, state), 'your lamp');
    assert.equal(Yname2(lamp, state), 'Your lamp');

    // A stack pluralizes through cxname(), and the prefix is unchanged.
    lamp.quan = 2;
    assert.equal(Yname2(lamp, state), 'Your lamps');
});

// objnam.c yname():2365-2366, the three conjuncts that decide whether the
// prefix is written at all. C's comment above them states the rule: "leave off
// 'your' for most of your artifacts, but prepend 'your' for unique objects and
// 'foo of bar' quest artifacts".
//
// The bound is obj.h any_quest_artifact() (271) spelled out. artilist.h orders
// the quest artifacts last, opening with The Orb of Detection at 219, so
// ART_ORB_OF_DETECTION is the lowest index on the quest side and Sunsword, the
// row before it at 209, is the highest index off it. The two together are what
// separate `>=` from `>` and from `<`.
test('yname drops the prefix only for a held, non-quest artifact', () => {
    const state = namingState();

    // Sunsword is ART_ORB_OF_DETECTION - 1, so it is an ordinary artifact and
    // its own name is the whole answer. not_fully_identified() (1786-1819) has
    // to answer FALSE first: a long sword is WEAPON_CLASS, so its last clause
    // reaches is_damageable() and rknown is read along with the other three
    // identification flags.
    state.artiexist[ART_SUNSWORD].exists = 1;
    const sunsword = objectOf(state, LONG_SWORD, {
        oartifact: ART_SUNSWORD,
        oextra: { oname: 'Sunsword' },
        where: OBJ_INVENT,
        known: true, dknown: true, bknown: true, rknown: true,
    });
    state.artidisco[0] = ART_SUNSWORD;
    assert.equal(yname(sunsword, state), 'Sunsword');

    // The same object in flight, which is where a thrown weapon sits while
    // zap.c bhit() names it. C tests carried() first, so the prefix returns
    // and shk.c shk_your() writes "the " rather than "your ".
    sunsword.where = OBJ_FREE;
    assert.equal(yname(sunsword, state), 'the Sunsword');
    sunsword.where = OBJ_INVENT;

    // Back in the pack, but no longer fully identified: obj_is_pname() answers
    // FALSE, so xname() appends the instance name to the ordinary type name
    // and the prefix returns with it.
    sunsword.rknown = false;
    assert.equal(yname(sunsword, state), 'your long sword named Sunsword');

    // The quest side of the comparison, at the exact bound. The Orb is a
    // crystal ball, whose oc_name_known has to be raised for
    // not_fully_identified() to clear; a tool is outside that function's last
    // clause, so rknown does not matter here as it does for the sword.
    state.artiexist[ART_ORB_OF_DETECTION].exists = 1;
    state.artidisco[1] = ART_ORB_OF_DETECTION;
    state.objects[CRYSTAL_BALL].oc_name_known = 1;
    const orb = objectOf(state, CRYSTAL_BALL, {
        oartifact: ART_ORB_OF_DETECTION,
        oextra: { oname: 'The Orb of Detection' },
        where: OBJ_INVENT,
        known: true, dknown: true, bknown: true,
    });
    assert.deepEqual(
        state.artidisco.slice(0, 2), [ART_SUNSWORD, ART_ORB_OF_DETECTION],
    );
    assert.equal(not_fully_identified(orb, state), false);
    assert.equal(obj_is_pname(orb, state), true);
    // xname() strips the artifact's own leading "The ", and yname() puts the
    // possessive back because the index is on the quest side.
    assert.equal(yname(orb, state), 'your Orb of Detection');
});
