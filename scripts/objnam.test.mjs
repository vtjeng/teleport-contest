import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ART_GIANTSLAYER,
    ART_GRIMTOOTH,
    init_artifacts,
} from '../js/artifacts.js';
import {
    BEAR_TRAP,
    BLINDED,
    COLNO,
    CORR,
    DOOR,
    FOUNTAIN,
    IN_SIGHT,
    LAVAPOOL,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    OBJ_FLOOR,
    OBJ_INVENT,
    NON_PM,
    PLNMSG_ONE_ITEM_HERE,
    PIT,
    ROOM,
    ROWNO,
    GLIB,
    W_RINGR,
    W_WEP,
    W_AMUL,
    W_ARM,
    W_ARMG,
    W_ARMH,
    W_TOOL,
    W_SWAPWEP,
    W_QUIVER,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { dolook, look_here } from '../js/invent.js';
import { init_objects } from '../js/o_init.js';
import { LEFT_HANDED, RIGHT_HANDED } from '../js/u_init.js';
import { newObject } from '../js/obj.js';
import {
    The,
    an,
    aobjnam,
    assertObjectNameable,
    cloak_simple_name,
    cxname,
    otense,
    gloves_simple_name,
    helm_simple_name,
    distant_name,
    isPoisonable,
    just_an,
    suit_simple_name,
    UnsupportedObjectNameError,
    donameFresh,
    vtense,
    xnameFresh,
    yname,
    Yname2,
} from '../js/objnam.js';
import {
    MZ_MEDIUM,
    PM_CLERIC,
    PM_COCKATRICE,
    PM_NEWT,
    PM_SAMURAI,
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
    OIL_LAMP,
    DART,
    DWARVISH_IRON_HELM,
    ELVEN_LEATHER_HELM,
    FOOD_RATION,
    GAUNTLETS_OF_POWER,
    GOLD_PIECE,
    HELM_OF_BRILLIANCE,
    LEATHER_ARMOR,
    LEATHER_GLOVES,
    LEATHER_JACKET,
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
} from '../js/objects.js';
import { roles } from '../js/roles.js';
import { CASES, loadWornGloveNameRecipe } from './run-worn-glove-name.mjs';

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

test('object-pile nameability admits multibyte instance names', () => {
    const state = namingState();
    // A plain source name pins the same mutation-free naming preflight used by
    // the movement admission path.
    assert.doesNotThrow(
        () => assertObjectNameable(objectOf(state, DART), state),
    );
    const named = objectOf(state, DART, {
        // The accented byte distinguishes UTF-8 byte width from JavaScript's
        // code-unit length in the hybrid tty text window.
        oextra: { oname: 'caf\u00e9' },
    });
    assert.doesNotThrow(
        () => assertObjectNameable(named, state),
    );
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

test('object-pile exclusions stop before names, output, or engraving',
    async () => {
        const cases = [
            {
                name: 'picked-some pile-limit count',
                // Two is the smallest pile, and an equal threshold selects
                // the excluded picked-some wording.
                build: () => pileLookState({ count: 2 }),
                prepare: ({ state }) => { state.flags.pile_limit = 2; },
                flags: LOOKHERE_PICKED_SOME,
                expected: /picked-some skipped-pile count/u,
            },
            {
                name: 'non-triggering five-object pile',
                // Five is the first count outside the preceding menu slice;
                // zero disables the count shortcut.
                build: () => pileLookState({ count: 5 }),
                prepare: ({ state }) => { state.flags.pile_limit = 0; },
                expected: /outside the two-to-four-item window/u,
            },
            {
                name: 'blind cockatrice pile',
                build: () => pileLookState({
                    blind: true,
                    first: CORPSE,
                    firstOverrides: { corpsenm: PM_COCKATRICE },
                }),
                expected: /blind object-pile menu/u,
            },
            {
                name: 'mention-decor pile',
                build: () => pileLookState(),
                prepare: ({ state }) => { state.flags.mention_decor = true; },
                expected: /describe_decor/u,
            },
            {
                name: 'mention-decor pile-limit count',
                build: () => pileLookState(),
                prepare: ({ state }) => {
                    state.flags.mention_decor = true;
                    state.flags.pile_limit = 2;
                    state.iflags.prev_decor = ROOM;
                },
                expected: /mention-decor pile-limit/u,
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
                expected: /trapname\(\)/u,
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
                expected: /visible region description/u,
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
                expected: /engraving after/u,
            },
            {
                name: 'lava pile',
                build: () => pileLookState({ typ: LAVAPOOL }),
                expected: /inaccessible liquid square/u,
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
            await assert.rejects(
                look_here(
                    objectCount,
                    specimen.flags ?? LOOKHERE_NOFLAGS,
                    built.state,
                    {
                        message: (text) => events.push(['message', text]),
                        displayObjectPile: (lines) =>
                            events.push(['display', lines]),
                        readEngraving: () => events.push(['engraving']),
                    },
                ),
                specimen.expected,
                specimen.name,
            );
            assert.deepEqual(events, [], specimen.name);
            assert.equal(built.head.dknown, false, specimen.name);
        }
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

// C ref: objnam.c doname_base():1391, the `(obj == uskin)` arm of the same
// conditional. wornSuffix() emits only " (being worn)", so this one branch of
// the ARMOR_CLASS arm still has to stop.
test('armor fused to the hero\'s skin still refuses', () => {
    const state = namingState();
    const scales = objectOf(state, RED_DRAGON_SCALES,
        { owornmask: W_ARM, bknown: true, known: true, spe: 0 });
    state.u.uskin = scales;
    assert.throws(
        () => donameFresh(scales, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'skin-embedded armor suffix',
    );
    // The refusal is uskin's alone. Ordinary worn scales name themselves.
    state.u.uskin = null;
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

// C:1592's "tethered to" arm of the same word choice. An aklys is attached to
// the hand by a thong, and naming it that way is not ported.
test('a wielded aklys still refuses', () => {
    const state = dualWieldState(AKLYS);
    assert.throws(
        () => donameFresh(state.uwep, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'tethered weapon suffix',
    );
    // The refusal follows the object into two-weapon combat, where C would
    // still print "tethered to" rather than "wielded in".
    state.u.twoweap = true;
    assert.throws(
        () => donameFresh(state.uwep, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'tethered weapon suffix',
    );
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

    // The two refusals that read cknown answer the forced flag too, so a
    // counted container and a bag of tricks stop under override_ID even
    // though their own cknown is clear. doname_base():1373 counts contents
    // through pickup.c count_contents(), and :1310-1311 judges those two
    // types' emptiness by charges.
    const stuffed = objectOf(state, SACK, { bknown: true });
    stuffed.cobj = objectOf(state, DART);
    assert.equal(donameFresh(stuffed, state), 'an uncursed bag');
    const tricks = objectOf(state, BAG_OF_TRICKS, { bknown: true });
    assert.equal(donameFresh(tricks, state), 'an uncursed bag');
    state.iflags.override_ID = 1;
    assert.throws(
        () => donameFresh(stuffed, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'container contents count',
    );
    assert.throws(
        () => donameFresh(tricks, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'charge-based emptiness',
    );
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

test('artifact naming records discovery before choosing its article', () => {
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
    assert.equal(donameFresh(artifact, state), 'the +0 Giantslayer');
});

// C ref: objnam.c obj_is_pname() (334-343), which withholds the personal name
// while not_fully_identified() (1787-1820) holds. Its last clause returns
// FALSE early for every class outside armor, weapons, weapon-tools and the
// ball, so only those four fall through to `return is_damageable(otmp)` at
// 1820 -- meaning a weapon with rknown clear is still not fully identified.
test('a named artifact weapon needs rknown before it names itself', () => {
    const state = namingState();
    state.artiexist[ART_GIANTSLAYER].exists = 1;
    const artifact = objectOf(state, LONG_SWORD, {
        oartifact: ART_GIANTSLAYER,
        oextra: { oname: 'Giantslayer' },
    });
    // The first naming is what records the artifact as found, which clears
    // not_fully_identified()'s undiscovered-artifact arm at 1805.
    donameFresh(artifact, state);
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

test('unsupported naming branches fail before discovery or state changes', () => {
    const state = namingState();
    state.iflags.pricequotes = true;
    const wieldedForXname = objectOf(state, DART, { owornmask: W_WEP });
    assert.equal(xnameFresh(wieldedForXname, state), 'dart');
    assert.equal(wieldedForXname.dknown, true);

    const quoted = objectOf(state, POT_HEALING);
    assert.throws(
        () => donameFresh(quoted, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'price quote suffix',
    );
    assert.equal(quoted.dknown, false);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 0);

    const optionBypass = objectOf(state, POT_HEALING);
    assert.throws(
        () => donameFresh(optionBypass, state, { withPrice: true }),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'price quote suffix',
    );
    assert.equal(optionBypass.dknown, false);


    state.iflags.pricequotes = false;

    // A worn ring is still refused: doname() names the hand it is on, which
    // needs the ring branch of its class switch.
    const wornRing = objectOf(state, RIN_PROTECTION, { owornmask: W_RINGR });
    assert.throws(
        () => donameFresh(wornRing, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'worn-ring suffix',
    );
    assert.equal(wornRing.dknown, false);
    state.objects[WAN_SLEEP].oc_uname = 'napper';
    const calledWand = objectOf(state, WAN_SLEEP);
    assert.throws(
        () => donameFresh(calledWand, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'user-assigned type name',
    );
    assert.equal(calledWand.dknown, false);

    // A container whose contents are known and present still stops, because
    // naming them needs pickup.c count_contents().
    const fullChest = objectOf(state, CHEST, {
        cknown: true,
        cobj: objectOf(state, DART),
    });
    assert.throws(
        () => donameFresh(fullChest, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'container contents count',
    );
    assert.equal(fullChest.dknown, false);

    const litCandle = objectOf(state, TALLOW_CANDLE, {
        lamplit: true,
    });
    assert.throws(
        () => donameFresh(litCandle, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'lit candle timer adjustment',
    );
    assert.equal(litCandle.dknown, false);
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

test('distant_name lowers its counter when the formatter refuses', () => {
    const state = distantNamingState(10, 5);
    const potion = floorPotion(state, 10, 5);
    state.viz_array[5][10] = 0; // Force the counted branch.
    state.iflags.pricequotes = true; // donameFresh() refuses this object.

    assert.throws(
        () => distant_name(potion, donameFresh, state),
        (error) => error instanceof UnsupportedObjectNameError,
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

// objnam.c yname() (2357-2374) and Yname2() (2376-2383). wield.c
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

    // C skips the prefix for an artifact whose name stands on its own, which
    // needs obj_is_pname(); naming one at all needs artiname().
    state.artiexist[ART_GIANTSLAYER].exists = 1;
    const artifact = objectOf(state, LONG_SWORD, {
        dknown: true,
        oartifact: ART_GIANTSLAYER,
        oextra: { oname: 'Giantslayer' },
        where: OBJ_INVENT,
    });
    assert.throws(() => yname(artifact, state), UnsupportedObjectNameError);
});
