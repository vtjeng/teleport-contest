import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMITTED_COMMANDS } from '../js/cmd.js';
import {
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_SUGGEST,
    GLIB,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    TT_INFLOOR,
    TT_LAVA,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
    W_SWAPWEP,
    W_TOOL,
} from '../js/const.js';
import {
    _doWearInternals,
    canwearobj,
    dowear,
    equip_ok,
    wear_ok,
} from '../js/do_wear.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { cantweararm, has_horns, num_horns } from '../js/mondata.js';
import {
    PM_ELF,
    PM_FIRE_GIANT,
    PM_GNOME,
    PM_HOBBIT,
    PM_IMP,
    PM_LICHEN,
    PM_MARILITH,
    PM_MINOTAUR,
    PM_PLAINS_CENTAUR,
    PM_VALKYRIE,
    PM_WINGED_GARGOYLE,
} from '../js/monsters.js';
import {
    WrappingAllowed,
    is_boots,
    is_cloak,
    is_gloves,
    is_helmet,
    is_shield,
    is_shirt,
    is_suit,
    is_sword,
} from '../js/obj.js';
import {
    ALCHEMY_SMOCK,
    AMULET_CLASS,
    AMULET_OF_ESP,
    ARMOR_CLASS,
    BATTLE_AXE,
    CORNUTHAUM,
    DWARVISH_MATTOCK,
    ELVEN_LEATHER_HELM,
    ELVEN_MITHRIL_COAT,
    ELVEN_SHIELD,
    FEDORA,
    HAWAIIAN_SHIRT,
    HELM_OF_OPPOSITE_ALIGNMENT,
    LEATHER_ARMOR,
    LEATHER_CLOAK,
    LEATHER_GLOVES,
    LONG_SWORD,
    LOW_BOOTS,
    MUMMY_WRAPPING,
    ORCISH_HELM,
    RING_CLASS,
    RING_MAIL,
    RIN_ADORNMENT,
    ROBE,
    SHORT_SWORD,
    SILVER_SABER,
    SMALL_SHIELD,
    SPEAR,
    TOOL_CLASS,
    TWO_HANDED_SWORD,
    WEAPON_CLASS,
} from '../js/objects.js';
import { obj_is_pname } from '../js/objnam.js';
import {
    ESCAPE_KEY,
    SPACE_KEY,
    TAKEOFF_KEY,
    WAIT,
    WEAR_BY_NAME,
    WEAR_KEY,
    WISH_KEY,
    loadWearRecipe,
    loadWearWishRecipe,
} from './run-wear-armor.mjs';

const { Shield_on, accessory_or_armor_on, already_wearing, on_msg }
    = _doWearInternals;

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The top line a call made outside moveloop_core() produced. Nothing has
// flushed the screen yet, so the grid still holds the previous frame; this is
// the text the next flush would paint onto row 0.
function takePendingTopLine() {
    const text = game._pending_message ?? '';
    game._pending_message = '';
    return text;
}

// The lower of the two status rows, which carries the AC field.
function statusRow() {
    return game.nhDisplay.grid[23].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a matrix segment by the keys it types, so reordering the matrix
// cannot silently point a test at a different case.
function segmentFor(moves, recipe = loadWearRecipe()) {
    const found = recipe.segments.find(
        (segment) => segment.moves === `${WAIT}${moves}${WAIT}`,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

function wishSegmentFor(seed) {
    const found = loadWearWishRecipe().segments.find(
        (segment) => segment.seed === seed,
    );
    assert.ok(found, `the wish matrix contains seed ${seed}`);
    return found;
}

// Replay a matrix segment's character and options with different keys, and
// report the fail-closed boundary it reached, or null when it reached none.
async function boundaryFor(segment, moves) {
    let boundary = null;
    await runSegment({ ...segment, moves }, {
        onBoundary: (error) => { boundary = error; },
    });
    return boundary;
}

// The take-the-shield-off prefix every 'W' segment opens with.
const OFF = `${WAIT}${TAKEOFF_KEY}`;

// Replay `moves` and then discard the message they left pending, so a direct
// call below starts from an empty top line. An occupied one makes the next
// pline wrap into a --More-- that reads a key the segment no longer has.
async function setup(segment, moves) {
    await runSegment({ ...segment, moves });
    takePendingTopLine();
}

function armor(otyp, extra = {}) {
    return { oclass: ARMOR_CLASS, otyp, owornmask: 0, quan: 1, ...extra };
}

// A permonst row from the loaded catalog, which is what canwearobj() and the
// obj.h macros below read.
function species(pmidx) {
    return game.mons[pmidx];
}

test('the wear command is admitted and shares its row with dowear', () => {
    assert.ok(ADMITTED_COMMANDS.includes('wear'));
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'wear');
    assert.ok(row, 'extcmdlist[] has a wear row');
    assert.equal(row.ef_funct, 'dowear');
    // cmd.c:1932 gives the row no flags, which is what lets rhack() report an
    // 'm' prefix rather than running the command under it.
    assert.equal(row.flags, 0);
});

test('W puts the shield back on and spends one turn', async () => {
    // do_wear.c dowear() through accessory_or_armor_on(). The Valkyrie's
    // +3 small shield is AC 9 plus its enchantment, so u.uac moves by 4.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);

    await runSegment({ ...segment, moves: OFF });
    assert.equal(game.uarms, null, 'the T emptied the slot');
    const acAfterRemoval = game.u.uac;
    const movesAfterRemoval = game.moves;

    await runSegment({ ...segment, moves: `${OFF}${WEAR_KEY}` });
    assert.equal(topLine(), 'What do you want to wear? [c or ?*]');
    assert.equal(game.uarms, null, 'the prompt puts nothing on by itself');

    await runSegment({ ...segment, moves: `${OFF}${WEAR_KEY}c` });
    // on_msg() names the object with xname(), which carries neither the
    // "(being worn)" suffix nor the enchantment doname() would show.
    assert.equal(topLine(), 'You are now wearing a small shield.');
    assert.ok(game.uarms, 'the shield is worn again');
    assert.equal(game.uarms.owornmask & W_ARMS, W_ARMS);
    assert.equal(game.u.uac, acAfterRemoval - 4);
    // accessory_or_armor_on() answers ECMD_TIME, so rhack() sets context.move
    // and the move loop advances the clock by one.
    assert.equal(game.moves, movesAfterRemoval + 1);
    // unmul("") clears the callback it just ran, and the tail of
    // accessory_or_armor_on() clears takeoff.mask.
    assert.equal(game.afternmv ?? null, null);
    assert.equal(game.context.takeoff.mask, 0);
});

test('an escaped or spaced prompt puts nothing on', async () => {
    // do_wear.c:2448-2449. getobj() answers null for either quitchar, and
    // dowear() turns that into ECMD_CANCEL, which spends no turn.
    for (const key of [ESCAPE_KEY, SPACE_KEY]) {
        const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}${key}`);

        await runSegment({ ...segment, moves: OFF });
        const before = game.moves;

        await runSegment({ ...segment, moves: `${OFF}${WEAR_KEY}${key}` });
        assert.equal(game.uarms, null, `key ${JSON.stringify(key)}`);
        assert.equal(game.moves, before, `key ${JSON.stringify(key)}`);
        assert.equal(game.context.move, 0, `key ${JSON.stringify(key)}`);
    }
});

test('a pack with nothing wearable reports without prompting', async () => {
    // invent.c getobj():1860. equip_ok() answers GETOBJ_EXCLUDE_INACCESS for
    // the worn shield and GETOBJ_EXCLUDE for the spear, the dagger and the
    // food ration, so no letter is suggested and none is offered.
    const segment = segmentFor(WEAR_KEY);
    await runSegment({ ...segment, moves: `${WAIT}${WEAR_KEY}` });
    assert.equal(topLine(), "You don't have anything else to wear.");
    assert.equal(game.context.move, 0);
});

test('#wear reaches the same handler as W', async () => {
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_BY_NAME}c`);
    await runSegment({ ...segment, moves: `${OFF}${WEAR_BY_NAME}c` });
    assert.equal(topLine(), 'You are now wearing a small shield.');
    assert.ok(game.uarms);
});

test('Shield_on reveals a wished shield\'s enchantment', async () => {
    // do_wear.c:725-728, the whole of what the callback does. mkobj.c
    // mksobj() leaves obj->known 0 for armor, where u_init.c
    // ini_inv_adjust_obj() sets it to 1, so a wished shield is the only one
    // this port holds with the enchantment still hidden.
    const segment = wishSegmentFor(7720121);
    // The wish text holds an 'i', so the prefix is spelled out rather than
    // cut at the first inventory key.
    const prefix = `${OFF}${WISH_KEY}+2 small shield\n`;
    assert.ok(segment.moves.startsWith(prefix), 'the matrix types this wish');

    await runSegment({ ...segment, moves: prefix });
    let wished = null;
    for (let o = game.invent; o; o = o.nobj)
        if (o.otyp === SMALL_SHIELD && o.spe === 2) wished = o;
    assert.ok(wished, 'the wish delivered a +2 small shield');
    // The Valkyrie's own +3 shield came from u_init.c, which sets known for
    // every oc_uses_known type; mksobj() does the opposite.
    assert.equal(wished.known, false, 'mksobj() left the enchantment hidden');
    assert.equal(wished.owornmask, 0, 'the wish delivers to the pack');

    await runSegment({ ...segment, moves: `${prefix}${WEAR_KEY}e` });
    assert.ok(game.uarms, 'the wished shield is worn');
    assert.equal(game.uarms.spe, 2);
    assert.equal(game.uarms.known, true, 'Shield_on() set obj->known');
});

test('canwearobj refuses a slot that is already filled', async () => {
    // do_wear.c:2085-2088 for this slot, and do_wear.c:2214-2216 for the worn
    // object answered at the prompt. Neither spends a turn.
    const shieldSegment = wishSegmentFor(7720122);
    const before = shieldSegment.moves.slice(
        0, shieldSegment.moves.indexOf(WEAR_KEY),
    );

    await runSegment({ ...shieldSegment, moves: `${before}${WEAR_KEY}e` });
    assert.equal(topLine(), 'You are already wearing a shield.');
    assert.equal(game.context.move, 0);

    const thatSegment = wishSegmentFor(7720125);
    await runSegment({ ...thatSegment, moves: `${before}${WEAR_KEY}c` });
    // already_wearing(c_that_) is the one call that ends in '!'.
    assert.equal(topLine(), 'You are already wearing that!');
    assert.equal(game.context.move, 0);
});

test('a two-handed weapon keeps every shield off', async () => {
    // do_wear.c:2089-2095. is_sword() picks the noun: seed 7720123 gives the
    // Barbarian a two-handed sword and seed 7720124 a battle-axe.
    const cases = [
        [7720123, 'e', 'You cannot wear a shield while wielding a two-handed '
            + 'sword.'],
        [7720124, 'f', 'You cannot wear a shield while wielding a two-handed '
            + 'axe.'],
    ];
    for (const [seed, letter, expected] of cases) {
        const segment = wishSegmentFor(seed);
        const before = segment.moves.slice(0, segment.moves.indexOf(WEAR_KEY));

        await runSegment({
            ...segment, moves: `${before}${WEAR_KEY}${letter}`,
        });
        assert.equal(topLine(), expected, `seed ${seed}`);
        assert.equal(game.uarms ?? null, null, `seed ${seed}`);
        assert.equal(game.context.move, 0, `seed ${seed}`);
    }
});

test('an accessory answered at the W prompt stops', async () => {
    // do_wear.c:2239-2353. C runs the ring, amulet and eyewear arms from the
    // same function, and this goal holds all three refused; the boundary is
    // raised before anything is worn.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);
    const ring = { oclass: RING_CLASS, otyp: RIN_ADORNMENT, owornmask: 0,
        quan: 1 };

    await assert.rejects(
        () => accessory_or_armor_on(ring, game),
        /accessory_or_armor_on\(\) accessories/,
    );
    assert.equal(game.uleft ?? null, null);
    assert.equal(game.uright ?? null, null);
});

test('the six slots this port does not don are refused unwritten',
    async () => {
    // do_wear.c:2377-2393. The test sits above setworn(), so a refused slot
    // leaves the hero exactly as it found her. Each object below is the
    // cheapest member of its category whose canwearobj() arm answers a mask.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    const slots = [
        [FEDORA, W_ARMH, 'uarmh'],
        [LOW_BOOTS, W_ARMF, 'uarmf'],
        [LEATHER_GLOVES, W_ARMG, 'uarmg'],
        [HAWAIIAN_SHIRT, W_ARMU, 'uarmu'],
        [LEATHER_CLOAK, W_ARMC, 'uarmc'],
        [LEATHER_ARMOR, W_ARM, 'uarm'],
    ];
    for (const [otyp, mask, field] of slots) {
        const obj = armor(otyp, { dknown: 1 });

        await assert.rejects(
            () => accessory_or_armor_on(obj, game),
            new RegExp(`accessory_or_armor_on\\(\\) for slot mask ${mask}`),
            `otyp ${otyp}`,
        );
        assert.equal(game[field] ?? null, null, `otyp ${otyp}`);
        assert.equal(obj.owornmask, 0, `otyp ${otyp}`);
    }
    // The shield is the one that goes through.
    const shield = armor(SMALL_SHIELD, { dknown: 1, spe: 0 });
    assert.equal(await accessory_or_armor_on(shield, game), ECMD_TIME);
    assert.equal(game.uarms, shield);
});

test('the branches accessory_or_armor_on cannot run name themselves',
    async () => {
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);

    // do_wear.c:2228-2238, the Quest-only helm of opposite alignment.
    game.qstart_level = { dnum: game.u.uz.dnum, dlevel: 11 };
    await assert.rejects(
        () => accessory_or_armor_on(
            armor(HELM_OF_OPPOSITE_ALIGNMENT, { dknown: 1 }), game,
        ),
        /accessory_or_armor_on\(\) quest helm/,
    );
    // Outside the Quest branch the same helm reaches the slot refusal.
    game.qstart_level = { dnum: game.u.uz.dnum + 1, dlevel: 11 };
    await assert.rejects(
        () => accessory_or_armor_on(
            armor(HELM_OF_OPPOSITE_ALIGNMENT, { dknown: 1 }), game,
        ),
        /accessory_or_armor_on\(\) for slot mask/,
    );
    delete game.qstart_level;

    // do_wear.c:2355-2356 retouch_object(), refused for an artifact alone.
    await assert.rejects(
        () => accessory_or_armor_on(
            armor(SMALL_SHIELD, { dknown: 1, oartifact: 1 }), game,
        ),
        /retouch_object\(\) for an artifact/,
    );
    // do_wear.c:2363-2364 remove_worn_item(), for armor held in a weapon slot.
    await assert.rejects(
        () => accessory_or_armor_on(
            armor(SMALL_SHIELD, { dknown: 1, owornmask: W_SWAPWEP }), game,
        ),
        /remove_worn_item\(\)/,
    );
    // do_wear.c:2396-2399, the delayed branch. Every shield carries oc_delay
    // 0, so only a doctored objects[] row can reach it.
    const shieldType = game.objects[SMALL_SHIELD];
    const delay = shieldType.oc_delay;
    shieldType.oc_delay = 1;
    try {
        await assert.rejects(
            () => accessory_or_armor_on(armor(SMALL_SHIELD, { dknown: 1 }),
                game),
            /delayed branch for otyp 150/,
        );
    } finally {
        shieldType.oc_delay = delay;
    }
    assert.equal(game.uarms ?? null, null,
        'every refusal left the slot empty');
});

test('both of dowear\'s guards answer before the prompt', async () => {
    // do_wear.c:2436-2447. Neither is reachable from a keystroke: no
    // polymorph is ported, and no hero can fill all eleven slots while ten of
    // them are refused. Both return ECMD_OK without reaching getobj().
    //
    // The two calls that pass a guard reach the prompt with the segment's
    // keys spent, so getobj() reads nothing and dowear() turns that into
    // ECMD_CANCEL; that answer is the proof the guard did not fire. Both come
    // first, because a prompt raised over an occupied top line waits for a
    // --More-- this test has no key for.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);
    const hero = game.youmonst.data;

    // A gnome is neither verysmall() nor nohands(), so it reaches getobj(),
    // which reports the pack rather than the form.
    game.youmonst.data = species(PM_GNOME);
    assert.equal(await dowear(game), ECMD_CANCEL);
    assert.equal(takePendingTopLine(),
        "You don't have anything else to wear.");
    game.youmonst.data = hero;

    // Ten of the eleven slots filled is one short of the second guard.
    const filled = ['uarm', 'uarmu', 'uarmc', 'uarmh', 'uarms', 'uarmg',
        'uarmf', 'uleft', 'uright', 'uamul', 'ublindf'];
    const saved = filled.map((field) => game[field] ?? null);
    for (const field of filled) game[field] = armor(FEDORA);
    game.ublindf = null;
    assert.equal(await dowear(game), ECMD_CANCEL);
    assert.equal(takePendingTopLine(),
        "You don't have anything else to wear.");
    game.ublindf = armor(FEDORA);
    assert.equal(await dowear(game), ECMD_OK);
    assert.equal(takePendingTopLine(),
        'You are already wearing a full complement of armor.');
    filled.forEach((field, i) => { game[field] = saved[i]; });

    // verysmall() and nohands() are read as a disjunction: an imp is MZ_TINY
    // with hands, a lichen is MZ_SMALL without them, and either alone stops.
    for (const pmidx of [PM_IMP, PM_LICHEN]) {
        game.youmonst.data = species(pmidx);
        assert.equal(await dowear(game), ECMD_OK, `pmidx ${pmidx}`);
        assert.equal(takePendingTopLine(), "Don't even bother.",
            `pmidx ${pmidx}`);
    }
    game.youmonst.data = hero;
});

test('canwearobj answers a mask for each of the seven slots', async () => {
    // do_wear.c:2070-2191. The Valkyrie wields a spear, so neither weapon
    // refusal fires, and every slot but the shield's is empty.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    const masks = [
        [FEDORA, W_ARMH],
        [SMALL_SHIELD, W_ARMS],
        [LOW_BOOTS, W_ARMF],
        [LEATHER_GLOVES, W_ARMG],
        [HAWAIIAN_SHIRT, W_ARMU],
        [LEATHER_CLOAK, W_ARMC],
        [LEATHER_ARMOR, W_ARM],
    ];
    for (const [otyp, mask] of masks) {
        assert.deepEqual(
            await canwearobj(armor(otyp, { dknown: 1 }), false, game),
            { ok: true, mask },
            `otyp ${otyp}`,
        );
    }
    // A worn piece is refused by the second early return rather than by its
    // slot's arm, and a refusal leaves the mask at 0.
    const worn = armor(FEDORA, { owornmask: W_ARMH, dknown: 1 });
    assert.deepEqual(await canwearobj(worn, false, game),
        { ok: false, mask: 0 });
    assert.equal(takePendingTopLine(), '', 'a silent call prints nothing');
    assert.deepEqual(await canwearobj(worn, true, game),
        { ok: false, mask: 0 });
    assert.equal(takePendingTopLine(), 'You are already wearing that!');
});

test('canwearobj names every filled slot it refuses', async () => {
    // do_wear.c:2071-2191, the `already_wearing` arms and the three that
    // spell their own message. Each is checked with noisy TRUE, which is what
    // accessory_or_armor_on() passes.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    const cases = [
        // helm_simple_name() answers "hat" for a fedora and "helm" for an
        // iron one, so the message follows the piece already worn.
        ['uarmh', armor(FEDORA, { owornmask: W_ARMH, dknown: 1 }),
            ORCISH_HELM, 'You are already wearing a hat.'],
        ['uarmh', armor(ORCISH_HELM, { owornmask: W_ARMH, dknown: 1 }),
            FEDORA, 'You are already wearing a helm.'],
        ['uarms', armor(SMALL_SHIELD, { owornmask: W_ARMS, dknown: 1 }),
            ELVEN_SHIELD, 'You are already wearing a shield.'],
        ['uarmf', armor(LOW_BOOTS, { owornmask: W_ARMF, dknown: 1 }),
            LOW_BOOTS, 'You are already wearing boots.'],
        ['uarmg', armor(LEATHER_GLOVES, { owornmask: W_ARMG, dknown: 1 }),
            LEATHER_GLOVES, 'You are already wearing gloves.'],
        ['uarmu', armor(HAWAIIAN_SHIRT, { owornmask: W_ARMU, dknown: 1 }),
            HAWAIIAN_SHIRT, 'You are already wearing a shirt.'],
        // cloak_simple_name() answers "cloak", "robe" or "apron" by type.
        ['uarmc', armor(LEATHER_CLOAK, { owornmask: W_ARMC, dknown: 1 }),
            ROBE, 'You are already wearing a cloak.'],
        ['uarmc', armor(ROBE, { owornmask: W_ARMC, dknown: 1 }),
            LEATHER_CLOAK, 'You are already wearing a robe.'],
        ['uarmc', armor(ALCHEMY_SMOCK, { owornmask: W_ARMC, dknown: 1 }),
            LEATHER_CLOAK, 'You are already wearing an apron.'],
        ['uarm', armor(LEATHER_ARMOR, { owornmask: W_ARM, dknown: 1 }),
            RING_MAIL, 'You are already wearing some armor.'],
    ];
    for (const [field, worn, otyp, expected] of cases) {
        const saved = game[field] ?? null;
        game[field] = worn;
        assert.deepEqual(
            await canwearobj(armor(otyp, { dknown: 1 }), true, game),
            { ok: false, mask: 0 },
            expected,
        );
        assert.equal(takePendingTopLine(), expected);
        game[field] = saved;
    }

    // A shirt and a suit are refused by whatever covers them rather than by
    // their own slot, and the shirt's message names the outermost layer.
    game.uarm = armor(RING_MAIL, { owornmask: W_ARM, dknown: 1 });
    assert.deepEqual(
        await canwearobj(armor(HAWAIIAN_SHIRT, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        "You can't wear that over your armor.");
    assert.deepEqual(
        await canwearobj(armor(RING_MAIL, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(), 'You are already wearing some armor.');
    game.uarmc = armor(ROBE, { owornmask: W_ARMC, dknown: 1 });
    assert.deepEqual(
        await canwearobj(armor(HAWAIIAN_SHIRT, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        "You can't wear that over your robe.");
    assert.deepEqual(
        await canwearobj(armor(RING_MAIL, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(), 'You cannot wear armor over a robe.');
    game.uarm = null;
    game.uarmc = null;
});

test('canwearobj reads the wielded weapon for four slots', async () => {
    // do_wear.c:2063-2068, 2089-2099 and 2143-2147. welded() needs the weapon
    // cursed and in the primary slot; bimanual() needs a two-handed one.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    const savedWep = game.uwep;

    // A cursed two-handed sword: a suit and a shirt stop at do_wear.c:2063,
    // and is_sword() names it.
    game.uwep = { oclass: WEAPON_CLASS, otyp: TWO_HANDED_SWORD, quan: 1,
        cursed: 1, bknown: 1, owornmask: 0 };
    for (const otyp of [RING_MAIL, HAWAIIAN_SHIRT]) {
        assert.deepEqual(
            await canwearobj(armor(otyp, { dknown: 1 }), true, game),
            { ok: false, mask: 0 }, `otyp ${otyp}`,
        );
        assert.equal(takePendingTopLine(),
            'You cannot do that while holding your sword.');
    }
    // The same slot with a cursed weapon that is not a sword.
    game.uwep.otyp = DWARVISH_MATTOCK;
    assert.deepEqual(
        await canwearobj(armor(RING_MAIL, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        'You cannot do that while holding your weapon.');
    // Gloves read welded() alone, so any cursed primary weapon refuses them.
    assert.deepEqual(
        await canwearobj(armor(LEATHER_GLOVES, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        'You cannot wear gloves over your weapon.');

    // A shield reads bimanual() alone, so an uncursed two-handed weapon
    // refuses it where an uncursed one-handed weapon does not.
    game.uwep = { oclass: WEAPON_CLASS, otyp: BATTLE_AXE, quan: 1, cursed: 0,
        owornmask: 0 };
    assert.deepEqual(
        await canwearobj(armor(SMALL_SHIELD, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        'You cannot wear a shield while wielding a two-handed axe.');
    game.uwep.otyp = DWARVISH_MATTOCK;
    assert.deepEqual(
        await canwearobj(armor(SMALL_SHIELD, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        'You cannot wear a shield while wielding a two-handed weapon.');
    game.uwep = { oclass: WEAPON_CLASS, otyp: LONG_SWORD, quan: 1, cursed: 0,
        owornmask: 0 };
    assert.deepEqual(
        await canwearobj(armor(SMALL_SHIELD, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMS },
    );
    // Two weapons at once refuse a shield whatever they are.
    game.u.twoweap = true;
    assert.deepEqual(
        await canwearobj(armor(SMALL_SHIELD, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        'You cannot wear a shield while wielding two weapons.');
    game.u.twoweap = false;
    game.uwep = savedWep;
});

test('canwearobj refuses boots to trapped feet and slippery gloves',
    async () => {
    // do_wear.c:2119-2135 and 2148-2154. u.utrap is set by trap.c, which
    // no ported path
    // reaches with 'W' available, and Glib by a can of grease.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    // The stuck-in-the-surface arm names dungeon.c surface(u.ux, u.uy), and
    // every role arrives on the up staircase, so it reads "stairs" here.
    const traps = [
        [TT_BEARTRAP, 'Your foot is trapped!'],
        [TT_INFLOOR, 'Your feet are stuck in the stairs!'],
        [TT_LAVA, 'Your feet are stuck in the stairs!'],
        [TT_BURIEDBALL, 'Your leg is attached to the buried ball!'],
    ];
    game.u.utrap = 3;
    for (const [utraptype, expected] of traps) {
        game.u.utraptype = utraptype;
        assert.deepEqual(
            await canwearobj(armor(LOW_BOOTS, { dknown: 1 }), true, game),
            { ok: false, mask: 0 }, expected,
        );
        assert.equal(takePendingTopLine(), expected);
    }
    // A trap type outside the four leaves the boots wearable.
    game.u.utraptype = 0; /* TT_PIT */
    assert.deepEqual(
        await canwearobj(armor(LOW_BOOTS, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMF },
    );
    game.u.utrap = 0;

    game.u.uprops[GLIB].intrinsic = 1;
    assert.deepEqual(
        await canwearobj(armor(LEATHER_GLOVES, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        'Your fingers are too slippery to pull on gloves.');
    game.u.uprops[GLIB].intrinsic = 0;
});

test('canwearobj refuses a form that cannot hold armor', async () => {
    // do_wear.c:2037-2041 and 2047-2056. Upolyd is constantly false in this
    // port, so every arm below is reached by writing youmonst.data directly.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    const hero = game.youmonst.data;

    // A fire giant is MZ_HUGE and not humanoid-sized, so breakarm() answers
    // TRUE and cantweararm() with it; the message names the category.
    game.youmonst.data = species(PM_FIRE_GIANT);
    for (const [otyp, which] of [[LEATHER_CLOAK, 'cloak'],
        [HAWAIIAN_SHIRT, 'shirt'], [RING_MAIL, 'suit']]) {
        assert.deepEqual(
            await canwearobj(armor(otyp, { dknown: 1 }), true, game),
            { ok: false, mask: 0 }, which,
        );
        assert.equal(takePendingTopLine(),
            `The ${which} will not fit on your body.`);
    }
    // A helmet is outside the three, so the same form still wears one.
    assert.deepEqual(
        await canwearobj(armor(FEDORA, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMH },
    );
    // A mummy wrapping is the cloak exception: WrappingAllowed() answers
    // TRUE for a fire giant, so the refusal does not apply to it.
    assert.deepEqual(
        await canwearobj(armor(MUMMY_WRAPPING, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMC },
    );
    // A gnome is MZ_SMALL, so sliparm() rather than breakarm() answers, and
    // the size exception at do_wear.c:2050-2051 lets an ordinary cloak
    // through.
    game.youmonst.data = species(PM_GNOME);
    assert.deepEqual(
        await canwearobj(armor(LEATHER_CLOAK, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMC },
    );
    assert.deepEqual(
        await canwearobj(armor(RING_MAIL, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        'The suit will not fit on your body.');
    // worn.c racial_exception() is the last conjunct, and it only matters for
    // the three categories the arm covers: a hobbit is MZ_SMALL, so sliparm()
    // refuses it an ordinary suit, but the exception lets elven mail through.
    // racial_exception() answers 1 there and 0 otherwise, so C's `< 1` and a
    // `<= 1` in its place differ on exactly this pair.
    game.youmonst.data = species(PM_HOBBIT);
    assert.deepEqual(
        await canwearobj(armor(ELVEN_MITHRIL_COAT, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARM },
    );
    assert.deepEqual(
        await canwearobj(armor(RING_MAIL, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(), 'The suit will not fit on your body.');
    // The exception covers a helmet too, but no helmet reaches this arm:
    // `which` is null for every category outside cloak, shirt and suit.
    assert.deepEqual(
        await canwearobj(armor(ELVEN_LEATHER_HELM, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMH },
    );

    // A form with no hands cannot wear anything, and neither can a very
    // small one; both stop at do_wear.c:2037 before the category is read.
    game.youmonst.data = { ...species(PM_VALKYRIE), msize: 0 /* MZ_TINY */ };
    assert.deepEqual(
        await canwearobj(armor(FEDORA, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        "You can't wear any armor in your current form.");
    game.youmonst.data = hero;
});

test('canwearobj refuses a helmet to horns and boots to hooves', async () => {
    // do_wear.c:2075-2081, 2107-2110 and 2111-2118, the three arms behind
    // Upolyd. u.umonnum is what the macro reads, so these write it.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    const hero = game.youmonst.data;
    const monnum = game.u.umonnum;

    game.u.umonnum = PM_MINOTAUR;
    game.youmonst.data = species(PM_MINOTAUR);
    // A minotaur has two horns, so plur() adds the 's'; helm_simple_name()
    // answers "helm" for an iron one.
    assert.deepEqual(
        await canwearobj(armor(ORCISH_HELM, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        "The helm won't fit over your horns.");
    // A flimsy helmet is the exception, and a cornuthaum is cloth.
    assert.deepEqual(
        await canwearobj(armor(CORNUTHAUM, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMH },
    );

    game.u.umonnum = PM_PLAINS_CENTAUR;
    game.youmonst.data = species(PM_PLAINS_CENTAUR);
    assert.deepEqual(
        await canwearobj(armor(LOW_BOOTS, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(),
        'You have too many hooves to wear boots.');

    // The slithy arm above it needs a form with hands, because the
    // verysmall()/nohands() guard answers first for every snake; a marilith
    // is the only slithy form in monst.c that reaches it.
    game.u.umonnum = PM_MARILITH;
    game.youmonst.data = species(PM_MARILITH);
    assert.deepEqual(
        await canwearobj(armor(LOW_BOOTS, { dknown: 1 }), true, game),
        { ok: false, mask: 0 },
    );
    assert.equal(takePendingTopLine(), 'You have no feet...');

    // Each of the three arms is a conjunction, so the same form with Upolyd
    // false wears the piece: u.umonnum back at u.umonster is what a hero who
    // merely looks like a marilith would have.
    game.u.umonnum = monnum;
    assert.deepEqual(
        await canwearobj(armor(LOW_BOOTS, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMF },
    );
    game.youmonst.data = species(PM_PLAINS_CENTAUR);
    assert.deepEqual(
        await canwearobj(armor(LOW_BOOTS, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMF },
    );
    game.youmonst.data = species(PM_MINOTAUR);
    assert.deepEqual(
        await canwearobj(armor(ORCISH_HELM, { dknown: 1 }), true, game),
        { ok: true, mask: W_ARMH },
    );

    game.youmonst.data = hero;
});

test('on_msg prints only when flags.verbose is on', async () => {
    // do_wear.c:87-98. This arm has no fresh C case: with verbose off,
    // nothing overwrites the "What do you want to wear?" prompt, and the
    // QUALITY.json deferral getobj-prompt-leaves-the-top-line-in-c-only is
    // what the resulting screen measures.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    const shield = armor(SMALL_SHIELD, { dknown: 1, spe: 3, owornmask: W_ARMS,
        known: true });

    await on_msg(shield, game);
    assert.equal(takePendingTopLine(),
        'You are now wearing a small shield.');
    game.flags.verbose = false;
    await on_msg(shield, game);
    assert.equal(takePendingTopLine(), '');
    game.flags.verbose = true;

    // The accessory arm calls invent.c prinv(), which is unported. It is
    // reached by a ring or an amulet whatever flags.verbose says, and by
    // eyewear only when verbose is off.
    for (const mask of [W_ARMS | 0x00010000 /* W_RING */, 0x00040000]) {
        await assert.rejects(
            () => on_msg({ ...shield, owornmask: mask }, game),
            /on_msg\(\) prinv\(\)/,
            `mask ${mask}`,
        );
    }
    const towel = { oclass: TOOL_CLASS, otyp: 0, owornmask: W_TOOL, quan: 1 };
    game.flags.verbose = false;
    await assert.rejects(
        () => on_msg(towel, game), /on_msg\(\) prinv\(\)/,
    );
    game.flags.verbose = true;
});

test('already_wearing picks its punctuation from the c_that_ string',
    async () => {
    // do_wear.c:2010-2014. C compares the pointer; only the c_that_ call
    // site ends in '!'.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);

    await already_wearing('that', game);
    assert.equal(takePendingTopLine(), 'You are already wearing that!');
    await already_wearing('a shield', game);
    assert.equal(takePendingTopLine(), 'You are already wearing a shield.');
});

test('Shield_on stops for a slot holding something that is not a shield',
    async () => {
    // do_wear.c:722-723 reports impossible() for an otyp outside the nine
    // is_shield() answers for. No ported path can arrive, because
    // canwearobj() picks the callback by the same predicate.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    game.uarms = armor(FEDORA, { owornmask: W_ARMS, dknown: 1 });
    assert.throws(() => Shield_on(game), /Shield_on\(\) for otyp 92/);
    game.uarms = null;
});

test('wear_ok classifies what the W prompt may offer', async () => {
    // do_wear.c:3462-3468 through equip_ok() with removing FALSE and
    // accessory FALSE.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);

    // The hands/self choice, which getobj() asks about with a null object.
    assert.equal(await wear_ok(null, game), GETOBJ_EXCLUDE);
    // An unworn wearable piece is suggested; the same piece once worn is
    // excluded as inaccessible, which keeps its letter out of the prompt
    // without stopping getobj() returning it when typed.
    const shield = armor(SMALL_SHIELD, { dknown: 1 });
    assert.equal(await wear_ok(shield, game), GETOBJ_SUGGEST);
    shield.owornmask = W_ARMS;
    assert.equal(await wear_ok(shield, game), GETOBJ_EXCLUDE_INACCESS);
    shield.owornmask = 0;
    // An accessory is downplayed for 'W', and armor is downplayed for 'P'.
    const ring = { oclass: RING_CLASS, otyp: RIN_ADORNMENT, owornmask: 0,
        quan: 1 };
    assert.equal(await wear_ok(ring, game), GETOBJ_DOWNPLAY);
    assert.equal(await equip_ok(ring, false, true, game), GETOBJ_SUGGEST);
    assert.equal(await equip_ok(shield, false, true, game), GETOBJ_DOWNPLAY);
    const amulet = { oclass: AMULET_CLASS, otyp: AMULET_OF_ESP, owornmask: 0,
        quan: 1 };
    assert.equal(await equip_ok(amulet, false, true, game), GETOBJ_SUGGEST);
    // A weapon and a food ration are excluded outright.
    assert.equal(
        await wear_ok({ oclass: WEAPON_CLASS, otyp: SPEAR, owornmask: 0,
            quan: 1 }, game),
        GETOBJ_EXCLUDE,
    );

    // Armor the hero cannot wear is downplayed rather than suggested, which
    // is the whole reason equip_ok() calls canwearobj() at all. The Valkyrie
    // is still wearing nothing here, so a second shield needs one on.
    game.uarms = armor(SMALL_SHIELD, { owornmask: W_ARMS, dknown: 1 });
    assert.equal(await wear_ok(armor(ELVEN_SHIELD, { dknown: 1 }), game),
        GETOBJ_DOWNPLAY);
    assert.equal(takePendingTopLine(), '', 'the prompt filter stays silent');
    game.uarms = null;
});

test('the obj.h armor macros answer for exactly one category each',
    async () => {
    // obj.h:279-298. Each predicate reads objects[].oc_armcat, and objects.h
    // gives every ARMOR_CLASS row exactly one of the seven categories.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);
    const predicates = [
        ['helmet', is_helmet, FEDORA],
        ['shield', is_shield, SMALL_SHIELD],
        ['boots', is_boots, LOW_BOOTS],
        ['gloves', is_gloves, LEATHER_GLOVES],
        ['cloak', is_cloak, LEATHER_CLOAK],
        ['shirt', is_shirt, HAWAIIAN_SHIRT],
        ['suit', is_suit, RING_MAIL],
    ];
    for (const [label, predicate, otyp] of predicates) {
        for (const [otherLabel, , otherOtyp] of predicates) {
            assert.equal(
                predicate(armor(otherOtyp), game), label === otherLabel,
                `${label} vs ${otherLabel}`,
            );
        }
        // A non-armor object of the same otyp number answers FALSE, because
        // every macro tests oclass first.
        assert.equal(
            predicate({ oclass: WEAPON_CLASS, otyp, quan: 1 }, game), false,
            label,
        );
    }
});

test('is_sword covers the contiguous run of sword skills', async () => {
    // obj.h:223-226, `oc_skill >= P_SHORT_SWORD && oc_skill <= P_SABER`.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);
    const weapon = (otyp) => ({ oclass: WEAPON_CLASS, otyp, quan: 1 });

    assert.equal(is_sword(weapon(LONG_SWORD), game), true);
    assert.equal(is_sword(weapon(TWO_HANDED_SWORD), game), true);
    // Both ends of the run are inclusive: a short sword is P_SHORT_SWORD (5)
    // and a silver saber is P_SABER (9).
    assert.equal(is_sword(weapon(SHORT_SWORD), game), true);
    assert.equal(is_sword(weapon(SILVER_SABER), game), true);
    // A spear, an axe and a mattock all sit outside the run.
    assert.equal(is_sword(weapon(SPEAR), game), false);
    assert.equal(is_sword(weapon(BATTLE_AXE), game), false);
    assert.equal(is_sword(weapon(DWARVISH_MATTOCK), game), false);
    // oclass is tested first, so an armor row with a sword's otyp is not one.
    assert.equal(is_sword(armor(LONG_SWORD), game), false);
});

test('WrappingAllowed and cantweararm answer for the forms C names',
    async () => {
    // obj.h:443-446 and mondata.h:133. Every value below is read from the
    // permonst table the port generates from monst.c.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);

    // A Valkyrie and an elf are MZ_HUMAN humanoids: neither breakarm() nor
    // sliparm() answers, so they wear anything.
    assert.equal(cantweararm(species(PM_VALKYRIE)), false);
    assert.equal(cantweararm(species(PM_ELF)), false);
    // A gnome is MZ_SMALL, which is sliparm()'s `msize <= MZ_SMALL`.
    assert.equal(cantweararm(species(PM_GNOME)), true);
    // A fire giant is bigmonst(), which is breakarm()'s first test.
    assert.equal(cantweararm(species(PM_FIRE_GIANT)), true);

    assert.equal(WrappingAllowed(species(PM_VALKYRIE)), true);
    assert.equal(WrappingAllowed(species(PM_FIRE_GIANT)), true);
    // The four forms C excludes by name or by symbol.
    assert.equal(WrappingAllowed(species(PM_PLAINS_CENTAUR)), false);
    assert.equal(WrappingAllowed(species(PM_MARILITH)), false);
    assert.equal(WrappingAllowed(species(PM_WINGED_GARGOYLE)), false);
    // A gnome is humanoid and exactly MZ_SMALL, so it passes the lower bound.
    assert.equal(WrappingAllowed(species(PM_GNOME)), true);
});

test('has_horns counts the four two-horned and four one-horned forms',
    async () => {
    // mondata.h:56 over mondata.c num_horns().
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);

    assert.equal(num_horns(species(PM_MINOTAUR)), 2);
    assert.equal(has_horns(species(PM_MINOTAUR)), true);
    assert.equal(num_horns(species(PM_VALKYRIE)), 0);
    assert.equal(has_horns(species(PM_VALKYRIE)), false);
});

test('obj_is_pname answers FALSE for a non-artifact and stops for one',
    async () => {
    // objnam.c:331-341. The first test settles every object this port can
    // produce; the artifact arm needs has_oname() and
    // not_fully_identified().
    assert.equal(obj_is_pname({ oartifact: 0 }), false);
    assert.equal(obj_is_pname({}), false);
    assert.throws(
        () => obj_is_pname({ oartifact: 1 }),
        /obj_is_pname\(\) for an artifact/,
    );
});

test('the W command reaches no unported branch on the matrix inputs',
    async () => {
    // Every segment of the checked-in matrix replays to its end with no
    // fail-closed boundary. The differential in scripts/run-wear-armor.mjs is
    // what compares those runs with C; this is what notices a new refusal
    // appearing on an input the matrix already covers.
    const segments = [
        ...loadWearRecipe().segments,
        ...loadWearWishRecipe().segments,
    ];
    for (const segment of segments) {
        assert.equal(
            await boundaryFor(segment, segment.moves), null,
            `seed ${segment.seed}`,
        );
    }
});

test('W answered with a ring stops before the accessory half', async () => {
    // The case just outside this goal's stated limit, recorded as the
    // QUALITY.json deferral wear-answered-with-an-accessory-stops. C asks
    // "Which ring-finger, Right or Left? [rl]"; the port stops instead.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    const debug = {
        ...segment,
        seed: 7720141,
        nethackrc: segment.nethackrc.replace(
            'showexp', 'showexp,playmode:debug',
        ),
        moves: `${WAIT}\x17ring of adornment\n${WEAR_KEY}e${WAIT}`,
    };
    const boundary = await boundaryFor(debug, debug.moves);
    assert.ok(boundary, 'the ring reaches a fail-closed boundary');
    assert.match(boundary.message, /accessory_or_armor_on\(\) accessories/);
});

test('the status line moves with the shield', async () => {
    // find_ac() through disp.botl. The AC field is what makes obj->known
    // worth setting, which is the whole of Shield_on().
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await runSegment({ ...segment, moves: `${WAIT}` });
    assert.match(statusRow(), /AC:6 /);
    await runSegment({ ...segment, moves: OFF });
    assert.match(statusRow(), /AC:10 /);
    await runSegment({ ...segment, moves: `${OFF}${WEAR_KEY}c` });
    assert.match(statusRow(), /AC:6 /);
});
