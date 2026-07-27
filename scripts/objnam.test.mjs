import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ART_GIANTSLAYER,
    init_artifacts,
} from '../js/artifacts.js';
import {
    BLINDED,
    CORR,
    NON_PM,
    PLNMSG_ONE_ITEM_HERE,
    ROOM,
    W_WEP,
} from '../js/const.js';
import { look_here_single_object } from '../js/invent.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import {
    cloak_simple_name,
    gloves_simple_name,
    helm_simple_name,
    suit_simple_name,
    UnsupportedObjectNameError,
    donameFresh,
    xnameFresh,
} from '../js/objnam.js';
import {
    PM_CLERIC,
    PM_NEWT,
    PM_SAMURAI,
    monst_globals_init,
} from '../js/monsters.js';
import {
    ALCHEMY_SMOCK,
    CHEST,
    CHAIN_MAIL,
    CORPSE,
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
} from '../js/objects.js';
import { roles } from '../js/roles.js';

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

test('single-object look_here reports the item and records its message kind',
    async () => {
        const state = namingState();
        state.u.ux = state.u.uy = 1;
        state.level = { at: () => ({ typ: ROOM }) };
        const dart = objectOf(state, DART);
        const events = [];

        await look_here_single_object(dart, state, {
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

test('blind single-object look_here uses the source surface and output order',
    async () => {
        for (const [typ, surfaceName] of [
            [ROOM, 'floor'],
            [CORR, 'ground'],
        ]) {
            const state = namingState();
            state.u.ux = state.u.uy = 1;
            state.u.uprops[BLINDED] = {
                intrinsic: 1,
                extrinsic: 0,
                blocked: 0,
            };
            state.level = { at: () => ({ typ }) };
            const dart = objectOf(state, DART);
            const events = [];

            await look_here_single_object(dart, state, {
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

test('single-object look_here requires its engraving owner before output',
    async () => {
        const state = namingState();
        const dart = objectOf(state, DART);
        const messages = [];
        await assert.rejects(
            look_here_single_object(dart, state, {
                message: (text) => messages.push(text),
            }),
            /engraving owners/u,
        );
        assert.deepEqual(messages, []);
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

    const worn = objectOf(state, DART, { owornmask: W_WEP });
    assert.throws(
        () => donameFresh(worn, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'worn-object suffix',
    );
    assert.equal(worn.dknown, false);

    state.iflags.pricequotes = false;
    state.objects[WAN_SLEEP].oc_uname = 'napper';
    const calledWand = objectOf(state, WAN_SLEEP);
    assert.throws(
        () => donameFresh(calledWand, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'user-assigned type name',
    );
    assert.equal(calledWand.dknown, false);

    const knownChest = objectOf(state, CHEST, { cknown: true });
    assert.throws(
        () => donameFresh(knownChest, state),
        (error) => error instanceof UnsupportedObjectNameError
            && error.branch === 'known container state',
    );
    assert.equal(knownChest.dknown, false);

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
