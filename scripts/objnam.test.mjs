import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ART_GIANTSLAYER,
    init_artifacts,
} from '../js/artifacts.js';
import {
    BLINDED,
    COLNO,
    CORR,
    IN_SIGHT,
    LOOKHERE_NOFLAGS,
    OBJ_FLOOR,
    NON_PM,
    PLNMSG_ONE_ITEM_HERE,
    ROOM,
    ROWNO,
    W_RINGR,
    W_WEP,
    W_AMUL,
    W_ARM,
    W_TOOL,
    W_SWAPWEP,
    W_QUIVER,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { look_here } from '../js/invent.js';
import { init_objects } from '../js/o_init.js';
import { LEFT_HANDED, RIGHT_HANDED } from '../js/u_init.js';
import { newObject } from '../js/obj.js';
import {
    an,
    cloak_simple_name,
    gloves_simple_name,
    helm_simple_name,
    distant_name,
    just_an,
    suit_simple_name,
    UnsupportedObjectNameError,
    donameFresh,
    vtense,
    xnameFresh,
} from '../js/objnam.js';
import {
    MZ_MEDIUM,
    PM_CLERIC,
    PM_NEWT,
    PM_SAMURAI,
    monst_globals_init,
    PM_FOX,
    M1_HUMANOID,
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
    RIN_PROTECTION,
    SACK,
    LARGE_BOX,
    TIN,
    AMULET_OF_ESP,
    BLINDFOLD,
    ARROW,
    TWO_HANDED_SWORD,
    DAGGER,
    DIAMOND,
    CROSSBOW_BOLT,
} from '../js/objects.js';
import { roles } from '../js/roles.js';

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
