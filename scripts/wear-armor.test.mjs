import assert from 'node:assert/strict';
import test from 'node:test';

import { ART_SUNSWORD } from '../js/artifacts.js';
import { ADMITTED_COMMANDS } from '../js/cmd.js';
import {
    ACID_RES,
    A_CHA,
    A_CON,
    A_STR,
    BASICENLIGHTENMENT,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    ENL_GAMEINPROGRESS,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_SUGGEST,
    GLIB,
    JUMPING,
    MAGICENLIGHTENMENT,
    POISON_RES,
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
    W_AMUL,
    W_RING,
    W_RINGL,
    W_RINGR,
    W_SWAPWEP,
    W_TOOL,
} from '../js/const.js';
import {
    UnsupportedRingOnError,
    UnsupportedWearError,
    _doWearInternals,
    canwearobj,
    dowear,
    equip_ok,
    select_off,
    set_wear,
    wear_ok,
} from '../js/do_wear.js';
import { effective_attribute } from '../js/attrib.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { UnsupportedEnlightenmentError, enlightenment } from '../js/insight.js';
import { runSegment } from '../js/jsmain.js';
import { cantweararm, has_horns, num_horns } from '../js/mondata.js';
import {
    MZ_HUGE,
    MZ_SMALL,
    PM_ELF,
    PM_FIRE_GIANT,
    PM_GHOST,
    PM_GNOME,
    PM_HOBBIT,
    PM_IMP,
    PM_LEPRECHAUN,
    PM_LICHEN,
    PM_MARILITH,
    PM_MINOTAUR,
    PM_PLAINS_CENTAUR,
    PM_VALKYRIE,
    PM_WHITE_UNICORN,
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
    CLOAK_OF_DISPLACEMENT,
    CLOAK_OF_INVISIBILITY,
    CLOAK_OF_MAGIC_RESISTANCE,
    CLOAK_OF_PROTECTION,
    CORNUTHAUM,
    DENTED_POT,
    DUNCE_CAP,
    DWARVISH_CLOAK,
    DWARVISH_IRON_HELM,
    DWARVISH_MATTOCK,
    DWARVISH_MITHRIL_COAT,
    ELVEN_BOOTS,
    ELVEN_CLOAK,
    ELVEN_LEATHER_HELM,
    ELVEN_MITHRIL_COAT,
    ELVEN_SHIELD,
    FEDORA,
    FUMBLE_BOOTS,
    GAUNTLETS_OF_DEXTERITY,
    GAUNTLETS_OF_FUMBLING,
    GAUNTLETS_OF_POWER,
    GOLD_DRAGON_SCALE_MAIL,
    GRAY_DRAGON_SCALES,
    HAWAIIAN_SHIRT,
    HELMET,
    HELM_OF_BRILLIANCE,
    HELM_OF_CAUTION,
    HELM_OF_OPPOSITE_ALIGNMENT,
    HELM_OF_TELEPATHY,
    HIGH_BOOTS,
    IRON_SHOES,
    JUMPING_BOOTS,
    KICKING_BOOTS,
    LEATHER_ARMOR,
    LEATHER_CLOAK,
    LEATHER_GLOVES,
    LEATHER_JACKET,
    LEVITATION_BOOTS,
    LONG_SWORD,
    LOW_BOOTS,
    MUMMY_WRAPPING,
    OILSKIN_CLOAK,
    ORCISH_CLOAK,
    ORCISH_HELM,
    ORCISH_RING_MAIL,
    MEAT_RING,
    RING_CLASS,
    RING_MAIL,
    RIN_ADORNMENT,
    RIN_GAIN_CONSTITUTION,
    RIN_GAIN_STRENGTH,
    RIN_INCREASE_ACCURACY,
    RIN_INCREASE_DAMAGE,
    RIN_PROTECTION,
    RIN_REGENERATION,
    RIN_STEALTH,
    RIN_TELEPORTATION,
    ROBE,
    SHORT_SWORD,
    SILVER_SABER,
    SMALL_SHIELD,
    SPEAR,
    SPEED_BOOTS,
    SPLINT_MAIL,
    TOOL_CLASS,
    TWO_HANDED_SWORD,
    T_SHIRT,
    WATER_WALKING_BOOTS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { obj_is_pname } from '../js/objnam.js';
import { find_ac } from '../js/u_init_inventory_attrs.js';
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

const { Armor_on, Boots_on, Cloak_on, Gloves_on, Helmet_on, Ring_on,
    Shield_on, Shirt_on, accessory_or_armor_on, already_wearing, on_msg }
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

// The same, by seed, for the cases two segments type the same keys in.
function seedSegmentFor(seed, recipe = loadWearRecipe()) {
    const found = recipe.segments.find((segment) => segment.seed === seed);
    assert.ok(found, `the matrix contains a segment with seed ${seed}`);
    return found;
}

// The same, over the wish matrix. This is for the tests that cut the keys they
// replay out of the segment itself; one that spells its own keys has to take
// wishSegmentTyping() below instead, or nothing checks that the two agree.
function wishSegmentFor(seed) {
    return seedSegmentFor(seed, loadWearWishRecipe());
}

// The same, checking that the recorded segment opens with the keys the test is
// about to replay. Locating by seed alone cannot notice a letter changing in
// the matrix, which would leave the test replaying keys no recording covers.
function wishSegmentTyping(seed, keys) {
    const found = wishSegmentFor(seed);
    assert.ok(found.moves.startsWith(keys),
        `the seed ${seed} segment types ${JSON.stringify(keys)}`);
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

// The pack object carrying an invlet. gi.invent is a linked list on `nobj`.
function inventoryLetter(invlet) {
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.invlet === invlet) return obj;
    }
    return null;
}

// A permonst row from the loaded catalog, which is what canwearobj() and the
// obj.h macros below read.
function species(pmidx) {
    return game.mons[pmidx];
}

// A validator for assert.rejects() and assert.throws() that pins the class of
// a fail-closed boundary as well as the branch it names. The text alone --
// all a bare RegExp compares -- reads the same on any Error at all, and the
// class is what decides the outcome: js/cmd.js failClosedCommandRefusals()
// lists UnsupportedWearError, and a class missing from that list escapes as a
// hard failure that discards every frame the segment had already matched.
// Nothing about the swap is hypothetical, either. The same switch that raises
// the otyp refusals below throws a plain Error sixteen lines further down, for
// C's panic() at do_wear.c:2392-2393.
//
// `branch` is the text the boundary names, matched inside the class's own
// "<verb> reached an unported branch: " prefix, which is what an unanchored
// RegExp over the same literal compared.
function refusal(cls, branch) {
    return (error) => {
        assert.ok(error instanceof cls,
            `expected ${cls.name}, got ${error?.constructor?.name}: `
            + `${error?.message}`);
        assert.ok(error.message.includes(branch),
            `expected a message naming ${JSON.stringify(branch)}, got `
            + `${JSON.stringify(error?.message)}`);
        return true;
    };
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
    // unmul("") clears the callback it just ran.
    assert.equal(game.afternmv ?? null, null);
    // The mask assertion below proves less than it looks. armoroff() sets the
    // slot bit and Shield_off() clears it again, so the preceding T leaves the
    // mask at 0 and nothing on the W path ever raises it: deleting
    // accessory_or_armor_on()'s own clear keeps this green. Making it
    // discriminating needs a W that follows a doff which left the mask set,
    // which needs an interrupted delayed take-off or the unported 'A' spine --
    // takeoff-mask-clear-has-no-discriminating-case in the ledger.
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

test('the two letters getobj turns away answer differently', async () => {
    // invent.c getobj(). A letter the prompt did not suggest reaches the
    // verification at 2071-2073 and invent.c silly_thing(); the money letter
    // is answered one loop earlier, at 2035-2041, and never reaches it. Both
    // answers end the command with no turn spent.
    //
    // Each assertion below also pins the `await` in front of the obj_ok()
    // call that decides it. Dropped, the verification's comparison sees a
    // pending promise, never equals GETOBJ_EXCLUDE, and hands the food ration
    // to accessory_or_armor_on(), whose non-armor arm stops the segment;
    // dropped at the gold arm, `promise <= GETOBJ_EXCLUDE` is false and the
    // gold falls through to the silly-thing line instead.
    const cases = [
        [`${TAKEOFF_KEY}${WEAR_KEY}d`, 'That is a silly thing to wear.'],
        [`${TAKEOFF_KEY}${WEAR_KEY}$`, 'You cannot wear gold.'],
    ];
    for (const [moves, expected] of cases) {
        const segment = segmentFor(moves);

        await runSegment({ ...segment, moves: OFF });
        const before = game.moves;

        await runSegment({ ...segment, moves: `${WAIT}${moves}` });
        assert.equal(topLine(), expected, moves);
        assert.equal(game.moves, before, moves);
        assert.equal(game.context.move, 0, moves);
    }
});

test('Shield_on reveals a wished shield\'s enchantment', async () => {
    // do_wear.c:725-728, the whole of what the callback does. mkobj.c
    // mksobj() leaves obj->known 0 for armor, where u_init.c
    // ini_inv_adjust_obj() sets it to 1, so a wished shield is the only one
    // this port holds with the enchantment still hidden.
    // The wish text holds an 'i', so the prefix is spelled out rather than
    // cut at the first inventory key.
    const prefix = `${OFF}${WISH_KEY}+2 small shield\n`;
    const segment = wishSegmentTyping(7720121, prefix);

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

test('Armor_on reveals a wished suit\'s enchantment on either arm',
    async () => {
    // do_wear.c:891-894. A Valkyrie's suit slot starts empty, so no 'T' is
    // needed; the wish is the only way to reach a suit whose obj->known is
    // still 0, and each seed below takes a different arm of C's fork on the
    // way to the same write. The dwarvish mithril-coat's oc_delay is 1 and
    // the leather jacket's 0.
    const cases = [
        [7720133, '+2 dwarvish mithril-coat', DWARVISH_MITHRIL_COAT],
        [7720134, '+2 leather jacket', LEATHER_JACKET],
    ];
    for (const [seed, wish, otyp] of cases) {
        // The wish text of the first case holds an 'i', so both prefixes are
        // spelled out rather than cut at the first inventory key.
        const prefix = `${WAIT}${WISH_KEY}${wish}\n`;
        const segment = wishSegmentTyping(seed, prefix);

        await runSegment({ ...segment, moves: prefix });
        let wished = null;
        for (let o = game.invent; o; o = o.nobj)
            if (o.otyp === otyp) wished = o;
        assert.ok(wished, `seed ${seed} delivered the suit`);
        assert.equal(wished.known, false, `seed ${seed} hid the enchantment`);
        assert.equal(wished.owornmask, 0, `seed ${seed} delivered to the pack`);

        await runSegment({ ...segment, moves: `${prefix}${WEAR_KEY}e` });
        assert.ok(game.uarm, `seed ${seed} wore the suit`);
        assert.equal(game.uarm.otyp, otyp, `seed ${seed}`);
        assert.equal(game.uarm.spe, 2, `seed ${seed}`);
        assert.equal(game.uarm.known, true, `seed ${seed} ran Armor_on()`);
        // Both arms end with the callback spent and the hero free again.
        assert.equal(game.afternmv ?? null, null, `seed ${seed}`);
        assert.equal(game.multi ?? 0, 0, `seed ${seed}`);
    }
});

test('the suit\'s oc_delay chooses which arm of the fork runs', async () => {
    // do_wear.c:2395-2403 for the suit slot. The delayed arm prints no
    // on_msg(): C announces the piece only through gn.nomovemsg, several
    // turns later. Adding an on_msg() there by symmetry with the shield path
    // would be wrong, so both halves are pinned here.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);

    // objects.h:594 gives leather armor an oc_ac of 8 and an oc_delay of 3,
    // so find_ac() counts 10 - 8 for it and nomul() buys three turns.
    // find_ac() is called here rather than read off u.uac because botl.c
    // bot() is what refreshes that field and only the move loop runs it.
    find_ac(game);
    const acBefore = game.u.uac;
    const delayed = armor(LEATHER_ARMOR, { dknown: 1, spe: 0 });
    assert.equal(await accessory_or_armor_on(delayed, game), ECMD_TIME);
    assert.equal(takePendingTopLine(), '', 'the delayed arm prints nothing');
    // setworn() runs before nomul(), so the AC the suit buys is already spent
    // although the hero has three helpless turns ahead of her, and setworn()
    // has already asked for the status line to be redrawn. That is the mirror
    // image of 'T', where armoroff() moves the AC only when Armor_off() finally
    // runs.
    assert.equal(game.disp.botl, true, 'setworn() asked for a redraw');
    find_ac(game);
    assert.equal(game.u.uac, acBefore - 2);
    assert.equal(game.multi, -3);
    assert.equal(game.nomovemsg, 'You finish your dressing maneuver.');

    // The other arm, reached only by the one suit with an oc_delay of 0.
    await setup(segment, OFF);
    const immediate = armor(LEATHER_JACKET, { dknown: 1, spe: 0 });
    assert.equal(await accessory_or_armor_on(immediate, game), ECMD_TIME);
    assert.equal(takePendingTopLine(), 'You are now wearing a leather jacket.');
    assert.equal(game.multi ?? 0, 0, 'nomul() was not called');
    assert.equal(game.nomovemsg ?? null, null, 'unmul("") cleared it');
    assert.equal(game.afternmv ?? null, null, 'unmul("") ran the callback');
});

test('a suit takes its whole delay before the hero is free', async () => {
    // The delayed arm end to end, through allmain.c moveloop_core(): every
    // turn of the countdown passes without reading a key, and unmul() prints
    // gn.nomovemsg on the turn it runs out. The Caveman's leather armor takes
    // 3 turns and the Samurai's splint mail 5 (objects.h:594 and :565); each
    // role wears exactly one piece, so the 'T' that clears the slot needs no
    // letter and takes the same delay again.
    // The AC each suit buys is 10 minus its objects.h oc_ac: 8 for leather
    // armor and 4 for splint mail, against the bare hero's 10.
    const cases = [[7720131, 3, 8], [7720132, 5, 4]];
    for (const [seed, delay, ac] of cases) {
        const segment = seedSegmentFor(seed);
        // The two segments open with different numbers of waits, so the
        // prefix is read off the matrix rather than rebuilt here.
        const off = segment.moves.slice(
            0, segment.moves.indexOf(TAKEOFF_KEY) + 1,
        );

        await runSegment({ ...segment, moves: off });
        assert.equal(game.uarm ?? null, null, `seed ${seed} emptied the slot`);
        assert.match(statusRow(), /AC:10 /, `seed ${seed} bare`);
        const movesAfterRemoval = game.moves;

        await runSegment({ ...segment, moves: `${off}${WEAR_KEY}e` });
        assert.ok(game.uarm, `seed ${seed} wore the suit again`);
        assert.equal(game.uarm.owornmask & W_ARM, W_ARM, `seed ${seed}`);
        assert.equal(topLine(), 'You finish your dressing maneuver.',
            `seed ${seed}`);
        assert.match(statusRow(), new RegExp(`AC:${ac} `), `seed ${seed}`);
        // The clock advances by exactly the suit's oc_delay, because the turn
        // the command spends is the first the countdown consumes. The already
        // differentially verified 'T' half agrees: the same two roles take 3
        // and 5 turns to undress in scripts/run-take-off-armor.mjs.
        assert.equal(game.moves, movesAfterRemoval + delay, `seed ${seed}`);
        assert.equal(game.afternmv ?? null, null, `seed ${seed}`);
        assert.equal(game.multi ?? 0, 0, `seed ${seed}`);
    }
});

test('W puts a cloak and a shirt back on', async () => {
    // do_wear.c Cloak_on() (325-380) and Shirt_on() (758-775), reached through
    // the same spine as the shield. Each role below starts in the piece, so
    // the 'T' is what empties the slot for the 'W' to fill again.
    const cases = [
        // The Wizard's cloak of magic resistance. u_init.c
        // ini_inv_use_obj():1257 discovers a starting item whose type carries
        // a description, so the message names the type and not the
        // appearance o_init.c dealt this seed. a_ac is 10 - 9 = 1 and spe is
        // 0, so AC moves by 1.
        [7720151, `${TAKEOFF_KEY}`, `${WEAR_KEY}b`,
            'You are now wearing a cloak of magic resistance.', 'uarmc', 1],
        // The Monk's +1 robe, chosen at both prompts because his gloves stay
        // on. on_msg() formats with xname(), which shows no enchantment where
        // off_msg()'s doname() one command earlier shows "+1". a_ac is 2 and
        // spe is 1, so AC moves by 3.
        [7720152, `${TAKEOFF_KEY}b`, `${WEAR_KEY}b`,
            'You are now wearing a robe.', 'uarmc', 3],
        // The Tourist's Hawaiian shirt, the one wearing in this matrix that
        // moves no AC: objects.h gives both shirts ac 10, so the ARMOR macro's
        // 10 - ac leaves a_ac 0 and a +0 shirt changes nothing find_ac() adds.
        [7720153, `${TAKEOFF_KEY}`, `${WEAR_KEY}k`,
            'You are now wearing a Hawaiian shirt.', 'uarmu', 0],
    ];
    for (const [seed, off, on, message, field, acDelta] of cases) {
        const segment = seedSegmentFor(seed);

        await runSegment({ ...segment, moves: `${WAIT}${off}` });
        assert.equal(game[field] ?? null, null, `seed ${seed}: T emptied it`);
        const acAfterRemoval = game.u.uac;

        await runSegment({ ...segment, moves: `${WAIT}${off}${on}` });
        assert.equal(topLine(), message, `seed ${seed}`);
        assert.ok(game[field], `seed ${seed}: the piece is worn again`);
        assert.equal(game.u.uac, acAfterRemoval - acDelta, `seed ${seed}`);
        // Both slots carry oc_delay 0 for every type, so unmul("") ran the
        // callback and cleared it before the command returned.
        assert.equal(game.afternmv ?? null, null, `seed ${seed}`);
        // The clock is not compared here. svm.moves is incremented when the
        // next command starts, so where it stands when a segment's keys run
        // out depends on how many of them the prompts ate -- the Monk answers
        // one for his 'T' and the Wizard answers none. The turn counter these
        // three roles show on every recorded frame is what
        // scripts/run-wear-armor.mjs compares, and the Valkyrie's shield above
        // is what pins the count itself.
    }
});

test('Cloak_on reveals a wished cloak\'s enchantment', async () => {
    // do_wear.c:375-378. mkobj.c mksobj() leaves obj->known 0 for armor where
    // u_init.c ini_inv_adjust_obj() sets it to 1, so a wished cloak is the
    // only one this port holds with the enchantment still hidden.
    const cases = [
        // The Wizard's wished +2 leather cloak, worn where her own cloak was.
        [7720158, 'o', 2, 3],
        // The Tourist's wished +1 robe, over an emptied shirt slot.
        [7720155, 'p', 1, 3],
    ];
    for (const [seed, letter, spe, acDelta] of cases) {
        const segment = wishSegmentFor(seed);
        const before = segment.moves.slice(0, segment.moves.indexOf(WEAR_KEY));

        await runSegment({ ...segment, moves: before });
        const cloak = inventoryLetter(letter);
        assert.ok(cloak, `seed ${seed}: the wish landed at ${letter}`);
        assert.equal(cloak.known ?? false, false, `seed ${seed}`);
        assert.equal(cloak.spe, spe, `seed ${seed}`);
        const acBefore = game.u.uac;

        await runSegment({
            ...segment, moves: `${before}${WEAR_KEY}${letter}`,
        });
        const worn = inventoryLetter(letter);
        assert.equal(worn.known, true, `seed ${seed}: Cloak_on() ran`);
        assert.equal(game.uarmc, worn, `seed ${seed}`);
        assert.equal(game.u.uac, acBefore - acDelta, `seed ${seed}`);
    }
});

// The keys scripts/run-wear-armor.mjs records for Cloak_on()'s two acting
// arms, spelled here so that the segments the tests below replay are located
// by what they type rather than by their shared seed.
const OILSKIN_MOVES = `${TAKEOFF_KEY}${WISH_KEY}+0 oilskin cloak\n`
    + `${WEAR_KEY}n${SPACE_KEY}`;
const SMOCK_MOVES = `${TAKEOFF_KEY}${WISH_KEY}+0 alchemy smock\n${WEAR_KEY}n`;

test('Cloak_on tells the hero an oilskin cloak fits tightly', async () => {
    // do_wear.c:365-367, pline("%s very tightly.", Tobjnam(uarmc, "fit")).
    // The Wizard knows neither cloak type -- u_init.c calls knows_class() for
    // her at no point -- so objects.h:623 names the piece by its appearance.
    const segment = segmentFor(OILSKIN_MOVES, loadWearWishRecipe());
    // The recorded keys without the space that answers the --More--, so the
    // replay stops between Cloak_on() and on_msg().
    const throughCallback = `${WAIT}${OILSKIN_MOVES.slice(0, -1)}`;

    await runSegment({ ...segment, moves: throughCallback });
    assert.equal(topLine(), 'The slippery cloak fits very tightly.--More--');
    // The `known` write at 375-378 runs after the pline, so it has already
    // happened while on_msg() waits at the prompt.
    assert.equal(game.uarmc.otyp, OILSKIN_CLOAK);
    assert.equal(game.uarmc.known, true);
    // The arm prints and raises nothing. Trading the two case labels would
    // leave WORN_CLOAK here and print about an apron above.
    assert.equal(game.u.uprops[ACID_RES].extrinsic, 0);
    // u.uac is find_ac()'s output and botl.c bot() is what recomputes it, so
    // it still reads the Wizard's cloakless 10 here even though setworn()
    // filled the slot several statements ago. The recorded C frame agrees:
    // its status line reads AC:10 under this very --More--.
    assert.equal(game.u.uac, 10);

    // The same keys with the space, which dismisses the prompt and lets
    // on_msg() reach the top line. This is the second message of the same
    // turn, which is why C stopped for a --More-- at all.
    await runSegment({ ...segment, moves: `${WAIT}${OILSKIN_MOVES}` });
    assert.equal(topLine(), 'You are now wearing a slippery cloak.');
    // objects.h:623 gives the type ac 9, so ARMOR's `10 - ac` makes its a_ac
    // 1, and the redraw this message travelled with is where u.uac catches up.
    assert.equal(game.u.uac, 9);
    // The 'W' spent the fourth turn: the opening wait is T:2, the 'T' T:3.
    assert.equal(game.moves, 4);
});

test('Cloak_on makes an alchemy smock acid resistant', async () => {
    // do_wear.c:369-371, EAcid_resistance |= WORN_CLOAK, under C's own comment
    // that the smock confers poison resistance and acid resistance both.
    const segment = segmentFor(SMOCK_MOVES, loadWearWishRecipe());

    await runSegment({ ...segment, moves: `${WAIT}${SMOCK_MOVES}` });
    // objects.h:630 gives the smock no oc_delay, so this arm and on_msg() both
    // ran on the turn the 'W' was typed. The smock prints once, so there is no
    // --More-- between them.
    assert.equal(topLine(), 'You are now wearing an apron.');
    assert.equal(game.uarmc.otyp, ALCHEMY_SMOCK);
    assert.equal(game.moves, 4);

    // prop.h:153 defines WORN_CLOAK as W_ARMC, which prop.h:102 gives the
    // value below. The literal is what pins the mask: every other worn slot
    // would read as acid resistance just as truthily, and only a value taken
    // from prop.h can tell a wrong bit from the right one. Cloak_off()'s
    // `EAcid_resistance &= ~WORN_CLOAK` is what will one day need it to be
    // this bit and not another.
    assert.equal(game.u.uprops[ACID_RES].extrinsic, 0x00000002);
    // The second half of C's comment, and the reason the arm exists: worn.c
    // setworn() raises only the type's own oc_oprop, which objects.h:631 makes
    // POISON_RES. Both bits are the cloak's, and this arm is the only writer
    // of the acid one.
    assert.equal(game.u.uprops[POISON_RES].extrinsic, 0x00000002);
});

test('canwearobj refuses a cloak and a shirt over what covers them',
    async () => {
    // do_wear.c:2157-2177, both arms, each recorded fresh. Neither spends a
    // turn, and the cloak's name comes from objnam.c cloak_simple_name(),
    // which answers "robe" for a robe and "cloak" for everything else this
    // port can wear.
    const cases = [
        // A second cloak while the Monk's robe is on.
        [7720156, 'l', 'You are already wearing a robe.'],
        // A shirt under the robe the Tourist has just put on. uarm is empty,
        // so the conditional at 2165-2166 takes its cloak_simple_name() half.
        [7720155, 'm', "You can't wear that over your robe."],
        // The same refusal's other half: a suit and no cloak names c_armor.
        [7720157, 'i', "You can't wear that over your armor."],
    ];
    for (const [seed, letter, expected] of cases) {
        const segment = wishSegmentFor(seed);
        const moves = segment.moves.slice(
            0, segment.moves.lastIndexOf(`${WEAR_KEY}${letter}`),
        );

        await runSegment({ ...segment, moves });
        const before = game.moves;

        await runSegment({
            ...segment, moves: `${moves}${WEAR_KEY}${letter}`,
        });
        assert.equal(topLine(), expected, `seed ${seed}`);
        assert.equal(game.moves, before, `seed ${seed}`);
        assert.equal(game.context.move, 0, `seed ${seed}`);
    }
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

    // `before` was cut from seed 7720122's segment above, so this replay is
    // only valid while 7720125 records the same prefix. wishSegmentTyping()
    // checks that rather than leaving the two recordings to drift apart in
    // silence, which is the hazard wish-tests-skip-their-own-typing-guard was
    // filed for.
    const thatSegment = wishSegmentTyping(7720125, before);
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

test('an unported Ring_on arm stops at the ring boundary', async () => {
    // do_wear.c Ring_on() arms that call unported helpers throw
    // UnsupportedRingOnError. accessory_or_armor_on() wears the ring (setworn)
    // before Ring_on() runs, so the error fires after the slot is filled.
    // RIN_STEALTH reaches toggle_stealth(), which is not ported.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);
    // Fill left ring so the ring goes straight to the right slot -- no prompt.
    game.uleft = { oclass: RING_CLASS, otyp: RIN_ADORNMENT, owornmask: W_RINGL,
        quan: 1, spe: 0 };
    const ring = { oclass: RING_CLASS, otyp: RIN_STEALTH, owornmask: 0,
        quan: 1, spe: 0, dknown: false };

    await assert.rejects(
        () => accessory_or_armor_on(ring, game),
        refusal(UnsupportedRingOnError, 'toggle_stealth()'),
    );
});

test('every one of the seven slots installs its own callback', async () => {
    // do_wear.c:2377-2393, C's whole chain, with no slot left refused. Each
    // object below is the cheapest member of its category whose canwearobj()
    // arm answers a mask.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    // The four that reach C's immediate arm: objects.h gives every shield,
    // every cloak, both shirts and the dented pot an oc_delay of 0, so
    // unmul("") runs their callback and on_msg() prints before the call
    // returns.
    //
    // obj.known separates the callbacks from one another. Each reads its own
    // slot field -- Shield_on() uarms, Cloak_on() uarmc, Shirt_on() uarmu,
    // Helmet_on() uarmh -- so installing the wrong one for a slot leaves the
    // write undone or throws on an empty slot, whatever the mask says.
    const worn = [
        [SMALL_SHIELD, W_ARMS, 'uarms', 'a small shield'],
        [LEATHER_CLOAK, W_ARMC, 'uarmc', 'a leather cloak'],
        [HAWAIIAN_SHIRT, W_ARMU, 'uarmu', 'a Hawaiian shirt'],
        [DENTED_POT, W_ARMH, 'uarmh', 'a dented pot'],
    ];
    for (const [otyp, mask, field, name] of worn) {
        // A fresh segment per slot: canwearobj() refuses a shirt under a
        // cloak, so the three cannot be worn onto the same hero in a row.
        await setup(segment, OFF);
        const obj = armor(otyp, { dknown: 1, spe: 0, known: false });

        assert.equal(await accessory_or_armor_on(obj, game), ECMD_TIME,
            `otyp ${otyp}`);
        assert.equal(game[field], obj, `otyp ${otyp}`);
        assert.equal(obj.owornmask & mask, mask, `otyp ${otyp}`);
        assert.equal(obj.known, true, `otyp ${otyp}`);
        // unmul("") ran the callback and cleared it again.
        assert.equal(game.afternmv ?? null, null, `otyp ${otyp}`);
        assert.equal(takePendingTopLine(), `You are now wearing ${name}.`,
            `otyp ${otyp}`);
    }

    // The three that reach C's delayed arm, with the callback still pending
    // and the countdown running. objects.h gives leather armor an oc_delay of
    // 3 (595), all four gloves 1 (686-697) and all ten boots 2 (700-727), so
    // the three delays differ and the multi each leaves behind names its slot.
    // No on_msg() is printed on this arm, which is why the top line is empty
    // where the four above carry a message.
    const pending = [
        [LEATHER_ARMOR, W_ARM, 'uarm', Armor_on, -3],
        [LEATHER_GLOVES, W_ARMG, 'uarmg', Gloves_on, -1],
        [LOW_BOOTS, W_ARMF, 'uarmf', Boots_on, -2],
    ];
    for (const [otyp, mask, field, callback, multi] of pending) {
        await setup(segment, OFF);
        const obj = armor(otyp, { dknown: 1, spe: 0, known: false });

        assert.equal(await accessory_or_armor_on(obj, game), ECMD_TIME,
            `otyp ${otyp}`);
        assert.equal(game[field], obj, `otyp ${otyp}`);
        assert.equal(obj.owornmask & mask, mask, `otyp ${otyp}`);
        assert.equal(game.afternmv, callback, `otyp ${otyp}`);
        assert.equal(game.multi, multi, `otyp ${otyp}`);
        assert.equal(game.multi_reason, 'dressing up', `otyp ${otyp}`);
        assert.equal(game.nomovemsg, 'You finish your dressing maneuver.',
            `otyp ${otyp}`);
        assert.equal(obj.known ?? false, false,
            `the callback has not run yet for otyp ${otyp}`);
        assert.equal(takePendingTopLine(), '',
            `the delayed arm prints no on_msg() for otyp ${otyp}`);
    }
});

test('the five cloaks Cloak_on cannot run are refused unwritten',
    async () => {
    // do_wear.c:338-363. Five of Cloak_on()'s labels fall to a bare break and
    // two more act without leaving do_wear.c; the remaining five makeknown(),
    // toggle stealth or displacement, or redraw the hero with the
    // See_invisible messages, all outside this file. The refusal is hoisted
    // above setworn(), so a refused cloak never reaches the slot and its
    // oc_delay 0 never gets the chance to run the callback.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    for (const otyp of [CLOAK_OF_PROTECTION, ELVEN_CLOAK,
        CLOAK_OF_DISPLACEMENT, MUMMY_WRAPPING, CLOAK_OF_INVISIBILITY]) {
        const obj = armor(otyp, { dknown: 1, spe: 0 });

        await assert.rejects(
            () => accessory_or_armor_on(obj, game),
            refusal(UnsupportedWearError, `Cloak_on() for otyp ${otyp}`),
            `otyp ${otyp}`,
        );
        assert.equal(game.uarmc ?? null, null, `otyp ${otyp}`);
        assert.equal(obj.owornmask, 0, `otyp ${otyp}`);
    }
    // Six of the seven that go on. CLOAK_OF_PROTECTION is the one member of
    // Cloak_off()'s bare-break set missing here, and it is why the two sets
    // are named apart: reusing the take-off list would wear it with its
    // makeknown() missing. The seventh admitted type, the oilskin cloak, is
    // absent for a reason of the harness rather than the source: its arm
    // prints, which makes a second message in the same turn and so a --More--
    // this test has no key for. The two tests above replay its recorded
    // segment instead. No message is asserted here either, because four of the
    // twelve cloak appearances are shuffled by o_init.c and the magic
    // resistance one is among them.
    for (const otyp of [ORCISH_CLOAK, DWARVISH_CLOAK,
        CLOAK_OF_MAGIC_RESISTANCE, ROBE, LEATHER_CLOAK, ALCHEMY_SMOCK]) {
        // A fresh segment per type, so each wearing starts from an empty
        // cloak slot and an empty top line.
        await setup(segment, OFF);
        const obj = armor(otyp, { dknown: 1, spe: 0, known: false });

        assert.equal(await accessory_or_armor_on(obj, game), ECMD_TIME,
            `otyp ${otyp}`);
        assert.equal(game.uarmc, obj, `otyp ${otyp}`);
        assert.equal(obj.known, true, `otyp ${otyp}`);
        // Only the smock's arm raises it, so every other type here shows the
        // hoisted test admitting a cloak without Cloak_on() acting on it.
        assert.equal(game.u.uprops[ACID_RES].extrinsic,
            otyp === ALCHEMY_SMOCK ? 0x00000002 : 0, `otyp ${otyp}`);
    }
});

test('the six helmets Helmet_on cannot run are refused unwritten',
    async () => {
    // do_wear.c:448-505. Six of Helmet_on()'s twelve labels are carried: the
    // fedora, which changes Luck, and the five that fall to a bare break. The
    // six below are refused, and the last of them is the one C's own switch
    // also answers with a bare break: the helm of telepathy needs no arm here
    // because objects.h:485 gives it TELEPAT as its oc_oprop, so setworn()
    // raises the extrinsic that display.h sensemon() reads. Wearing one would
    // change what the hero senses with no arm in this file to blame.
    //
    // The refusal is hoisted above setworn(), so a refused helmet never
    // reaches the slot and never spends its oc_delay.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    for (const otyp of [HELM_OF_CAUTION, HELM_OF_BRILLIANCE, CORNUTHAUM,
        DUNCE_CAP, HELM_OF_OPPOSITE_ALIGNMENT, HELM_OF_TELEPATHY]) {
        await setup(segment, OFF);
        const obj = armor(otyp, { dknown: 1, spe: 0 });

        await assert.rejects(
            () => accessory_or_armor_on(obj, game),
            refusal(UnsupportedWearError, `Helmet_on() for otyp ${otyp}`),
            `otyp ${otyp}`,
        );
        assert.equal(game.uarmh ?? null, null, `otyp ${otyp}`);
        assert.equal(obj.owornmask, 0, `otyp ${otyp}`);
        assert.equal(game.multi ?? 0, 0, `otyp ${otyp}`);

        // Helmet_on() asks the same question again for its other caller.
        // set_wear() reaches it with whatever u_init.c wore, and there is no
        // frame above that one to hoist a refusal into.
        game.uarmh = armor(otyp, { dknown: 1, spe: 0, known: false });
        assert.throws(() => Helmet_on(game),
            refusal(UnsupportedWearError, `Helmet_on() for otyp ${otyp}`));
        assert.equal(game.uarmh.known, false, `otyp ${otyp}`);
        game.uarmh = null;
    }
    // The same direct call for a type it carries, which is what pins C's own
    // `return 0` at do_wear.c:514. Both of its callers discard the value, so
    // nothing else in the port would notice it changing.
    game.uarmh = armor(HELMET, { dknown: 1, spe: 0, known: false });
    assert.equal(Helmet_on(game), 0);
    assert.equal(game.uarmh.known, true);
    game.uarmh = null;

    // Of the six that go on, four carry an oc_delay of 1 and are the ones this
    // loop drives: each leaves Helmet_on() pending under nomul(-1) rather than
    // running it at once. The other two, the fedora and the dented pot, carry
    // oc_delay 0 and take unmul("") on the spot, which is the pair Helmet_off()
    // already admits; they are covered by the Luck test and the recorded
    // dented-pot segment instead of here.
    for (const otyp of [HELMET, ELVEN_LEATHER_HELM, DWARVISH_IRON_HELM,
        ORCISH_HELM]) {
        await setup(segment, OFF);
        const obj = armor(otyp, { dknown: 1, spe: 0, known: false });

        assert.equal(await accessory_or_armor_on(obj, game), ECMD_TIME,
            `otyp ${otyp}`);
        assert.equal(game.uarmh, obj, `otyp ${otyp}`);
        assert.equal(game.afternmv, Helmet_on, `otyp ${otyp}`);
        assert.equal(game.multi, -1, `otyp ${otyp}`);
        assert.equal(obj.known ?? false, false,
            `the callback has not run yet for otyp ${otyp}`);
    }
});

test('the five boots Boots_on cannot run are refused unwritten', async () => {
    // do_wear.c:199-249. Five of Boots_on()'s ten labels fall to a bare break;
    // the other five call spoteffects() and makeknown(), makeknown() and
    // You_feel(), toggle_stealth(), incr_itimeout() over rnd(20), or float_up()
    // -- all outside do_wear.c. Refusing above setworn() is what keeps the
    // random-number log empty on this whole path: FUMBLE_BOOTS is the one arm
    // anywhere on the 'W' spine that would draw.
    //
    // Two of the five are the cases just outside this goal's stated limit,
    // recorded as the QUALITY.json deferral wear-magic-boots-stop.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    for (const otyp of [SPEED_BOOTS, WATER_WALKING_BOOTS, ELVEN_BOOTS,
        FUMBLE_BOOTS, LEVITATION_BOOTS]) {
        await setup(segment, OFF);
        const obj = armor(otyp, { dknown: 1, spe: 0 });

        await assert.rejects(
            () => accessory_or_armor_on(obj, game),
            refusal(UnsupportedWearError, `Boots_on() for otyp ${otyp}`),
            `otyp ${otyp}`,
        );
        assert.equal(game.uarmf ?? null, null, `otyp ${otyp}`);
        assert.equal(obj.owornmask, 0, `otyp ${otyp}`);
        assert.equal(game.multi ?? 0, 0, `otyp ${otyp}`);

        // Boots_on() asks the same question again for its other caller.
        // set_wear() reaches it with whatever u_init.c wore, and there is no
        // frame above that one to hoist a refusal into.
        game.uarmf = armor(otyp, { dknown: 1, spe: 0, known: false });
        assert.throws(() => Boots_on(game),
            refusal(UnsupportedWearError, `Boots_on() for otyp ${otyp}`));
        assert.equal(game.uarmf.known, false, `otyp ${otyp}`);
        game.uarmf = null;
    }
    // The same direct call for a type it carries, which pins C's own
    // `return 0` at do_wear.c:258. Both callers discard the value.
    game.uarmf = armor(LOW_BOOTS, { dknown: 1, spe: 0, known: false });
    assert.equal(Boots_on(game), 0);
    assert.equal(game.uarmf.known, true);
    game.uarmf = null;

    // The five that go on, JUMPING_BOOTS and KICKING_BOOTS included: their
    // arms are bare in C, and the state each raises has no ported reader that
    // could diverge in silence. All ten boots carry an oc_delay of 2, so every
    // one leaves the callback pending under nomul(-2).
    for (const otyp of [LOW_BOOTS, IRON_SHOES, HIGH_BOOTS, JUMPING_BOOTS,
        KICKING_BOOTS]) {
        await setup(segment, OFF);
        const obj = armor(otyp, { dknown: 1, spe: 0, known: false });

        assert.equal(await accessory_or_armor_on(obj, game), ECMD_TIME,
            `otyp ${otyp}`);
        assert.equal(game.uarmf, obj, `otyp ${otyp}`);
        assert.equal(game.afternmv, Boots_on, `otyp ${otyp}`);
        assert.equal(game.multi, -2, `otyp ${otyp}`);
        assert.equal(obj.known ?? false, false,
            `the callback has not run yet for otyp ${otyp}`);
    }
});

test('the two boots C leaves bare raise state no ported reader misuses',
    async () => {
    // The judgment the HELM_OF_TELEPATHY precedent asks for, applied to the
    // two arms of Boots_on() that are bare in C and still change the game.
    //
    // JUMPING_BOOTS: objects.h:712-714 gives it an oc_oprop of JUMPING, so
    // worn.c setworn() raises the extrinsic before the callback runs. C has
    // two readers. apply.c jump() cannot start, because js/cmd.js admits no
    // `jump` command. insight.c:1683 is inside attributes_enlightenment(),
    // which C runs only under MAGICENLIGHTENMENT -- explore or debug mode --
    // so an ordinary `^X` never reads the property in either program, and the
    // window under that mode stops by name rather than dropping C's line.
    //
    // KICKING_BOOTS: objects.h:718-720 gives it an oc_oprop of 0, so setworn()
    // raises nothing and dokick.c reads the type directly instead, at :10, :41
    // and :1328. js/dokick.js:127 martial() is the first of those, ported and
    // live in kick_dumb()'s rn2(3) short circuit.
    //
    // A Tourist, not the Valkyrie every other test here uses: the property
    // table is ordered, and the Valkyrie's XL1 cold resistance stops the magic
    // window twenty-odd rows above JUMPING, so no boots could move her answer.
    // The Tourist and the Caveman are the two roles whose starting state
    // reaches the table's end at all, as scripts/insight.test.mjs records.
    const segment = seedSegmentFor(7720153);
    const MAGIC = BASICENLIGHTENMENT | MAGICENLIGHTENMENT;
    await setup(segment, WAIT);
    // Both windows are complete while the hero is barefoot, which is what
    // makes the stop below attributable to the boots.
    assert.ok(Array.isArray(
        await enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, game),
    ));
    assert.ok(Array.isArray(
        await enlightenment(MAGIC, ENL_GAMEINPROGRESS, game),
    ));

    const jumpers = armor(JUMPING_BOOTS, { dknown: 1, spe: 0, known: false });

    assert.equal(await accessory_or_armor_on(jumpers, game), ECMD_TIME);
    assert.equal(game.u.uprops[JUMPING].extrinsic & W_ARMF, W_ARMF,
        'setworn() raised EJumping');
    await assert.rejects(
        () => enlightenment(MAGIC, ENL_GAMEINPROGRESS, game),
        refusal(UnsupportedEnlightenmentError, 'Jumping'),
    );
    // The ordinary ^X reads no property table at all, in C or here.
    assert.ok(Array.isArray(
        await enlightenment(BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, game),
    ));
    assert.ok(!ADMITTED_COMMANDS.includes('jump'),
        'the other C reader, apply.c jump(), cannot be reached at all');

    await setup(segment, WAIT);
    const kickers = armor(KICKING_BOOTS, { dknown: 1, spe: 0, known: false });

    assert.equal(await accessory_or_armor_on(kickers, game), ECMD_TIME);
    assert.equal(game.u.uprops[JUMPING].extrinsic, 0,
        'kicking boots have no oc_oprop, so no extrinsic moves');
    assert.ok(Array.isArray(
        await enlightenment(MAGIC, ENL_GAMEINPROGRESS, game),
    ));
});

test('the fedora is worth a point of Luck to an Archeologist alone',
    async () => {
    // do_wear.c:437-439, the one <X>_on() arm in this port that changes
    // something other than obj->known, and the reason scripts/run-wear-armor.mjs
    // walks a hero into a door: rnd.c rnl() hides a single point from every
    // range of 15 or less.
    //
    // set_wear() is what gives an Archeologist the point before her first
    // command; ini_inv_use_obj() only calls setworn().
    const fedoraSegment = segmentFor(`${TAKEOFF_KEY}c${WEAR_KEY}c`);

    await runSegment({ ...fedoraSegment, moves: WAIT });
    assert.equal(game.u.uluck, 1, 'set_wear() ran Helmet_on() at startup');
    await runSegment({ ...fedoraSegment, moves: `${WAIT}${TAKEOFF_KEY}c` });
    assert.equal(game.u.uluck, 0, 'Helmet_off() took the point back');
    await runSegment({
        ...fedoraSegment,
        moves: `${WAIT}${TAKEOFF_KEY}c${WEAR_KEY}c`,
    });
    assert.equal(game.u.uluck, 1, 'the W put it back');
    assert.equal(topLine(), 'You are now wearing a fedora.');

    // Any other role wears the same hat for nothing. A Valkyrie's helmet slot
    // starts empty, so no 'T' is needed.
    const valkyrie = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(valkyrie, WAIT);
    const luckBefore = game.u.uluck;
    const hat = armor(FEDORA, { dknown: 1, spe: 0 });

    assert.equal(await accessory_or_armor_on(hat, game), ECMD_TIME);
    assert.equal(game.uarmh, hat);
    assert.equal(game.u.uluck, luckBefore, 'no point for a Valkyrie');
});

test('set_wear runs the startup callbacks and stops on the slots it cannot',
    async () => {
    // do_wear.c set_wear() (1537-1568) with a Null argument, which allmain.c
    // moveloop_preamble():73 is the only caller of. Its inputs are bounded by
    // u_init.c: ini_inv_use_obj() fills armor slots and nothing else.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);

    // The four accessory slots do_wear.c:1544-1551 would run first. Each is
    // tested on its own so that no one of them can hide the others.
    for (const field of ['ublindf', 'uright', 'uleft', 'uamul']) {
        game[field] = { oclass: AMULET_CLASS, otyp: AMULET_OF_ESP };
        await assert.rejects(() => set_wear(game),
            refusal(UnsupportedWearError, 'set_wear() accessories'), field);
        game[field] = null;
    }
    // The seven armor calls at do_wear.c:1553-1565, one seeded piece each.
    // Every callback this port carries reveals the enchantment a wished piece
    // would still be hiding, and that `known` write is the only mark any of
    // them leaves; a starting piece cannot witness it, because
    // ini_inv_adjust_obj():1215-1216 marks every worn piece known before the
    // preamble ever calls set_wear(). So each slot below is seeded at known
    // false, and deleting any one of the seven calls turns exactly the
    // matching assertion red.
    //
    // The types are the ones each callback carries, and the six that a role
    // can start in are the type that role starts in: the Tourist's shirt, the
    // Rogue's and Caveman's suit, the Monk's and Priest's robe, the Healer's,
    // Knight's and Monk's gloves, the Knight's helmet and the Valkyrie's,
    // Knight's and Priest's shield. Boots are the exception at
    // do_wear.c:1558-1559: no role's gear can reach that call -- the test
    // below this one is what shows that -- and low boots stand in to show the
    // call is C's own rather than a refusal in front of a ported function.
    const startingShield = game.uarms;

    game.uarmu = armor(T_SHIRT, { known: false });
    game.uarm = armor(LEATHER_ARMOR, { known: false });
    game.uarmc = armor(ROBE, { known: false });
    game.uarmf = armor(LOW_BOOTS, { known: false });
    game.uarmg = armor(LEATHER_GLOVES, { known: false });
    game.uarmh = armor(HELMET, { known: false });
    game.uarms = armor(SMALL_SHIELD, { known: false });
    await set_wear(game);
    assert.equal(game.uarmu.known, true, 'Shirt_on() ran');
    assert.equal(game.uarm.known, true, 'Armor_on() ran');
    assert.equal(game.uarmc.known, true, 'Cloak_on() ran');
    assert.equal(game.uarmf.known, true, 'Boots_on() ran');
    assert.equal(game.uarmg.known, true, 'Gloves_on() ran');
    assert.equal(game.uarmh.known, true, 'Helmet_on() ran');
    assert.equal(game.uarms.known, true, 'Shield_on() ran');
    game.uarmu = null;
    game.uarm = null;
    game.uarmc = null;
    game.uarmf = null;
    game.uarmg = null;
    game.uarmh = null;
    game.uarms = startingShield;

    // A boot type Boots_on() cannot run still stops set_wear(), which is the
    // one caller with no frame above it to hoist the question into.
    game.uarmf = armor(SPEED_BOOTS, { known: false });
    await assert.rejects(() => set_wear(game),
        refusal(UnsupportedWearError, `Boots_on() for otyp ${SPEED_BOOTS}`));
    assert.equal(game.uarmf.known, false);
    game.uarmf = null;
});

test('no starting hero reaches a slot or a type set_wear refuses',
    async () => {
    // The premise every refusal in set_wear() rests on. u_init.c decides which
    // slots ini_inv_use_obj() fills and with what, so the list below is what
    // makes "no role starts in boots" and "no role starts in a worn ring,
    // amulet or blindfold" checkable rather than asserted -- and it is what
    // will fail first if a role's gear changes.
    //
    // One row per distinct worn-armor configuration, plus the two races that
    // substitute a worn piece at u_init.c:226-249: an elf Ranger's cloak of
    // displacement becomes an elven cloak, and an orc Barbarian's ring mail
    // becomes orcish ring mail. The Knight is the only role that fills four
    // slots, and the only one besides the Archeologist that starts in a
    // helmet; both of his are types Helmet_on() carries.
    const starts = [
        ['Archeologist', 'human', 'female', 'neutral',
            { uarm: LEATHER_JACKET, uarmh: FEDORA }],
        ['Barbarian', 'orc', 'male', 'chaotic', { uarm: ORCISH_RING_MAIL }],
        ['Healer', 'human', 'female', 'neutral', { uarmg: LEATHER_GLOVES }],
        ['Knight', 'human', 'male', 'lawful', {
            uarm: RING_MAIL, uarmh: HELMET, uarmg: LEATHER_GLOVES,
            uarms: SMALL_SHIELD,
        }],
        ['Monk', 'human', 'male', 'neutral',
            { uarmc: ROBE, uarmg: LEATHER_GLOVES }],
        ['Priest', 'human', 'female', 'neutral',
            { uarmc: ROBE, uarms: SMALL_SHIELD }],
        ['Ranger', 'human', 'female', 'neutral',
            { uarmc: CLOAK_OF_DISPLACEMENT }],
        ['Ranger', 'elf', 'female', 'chaotic', { uarmc: ELVEN_CLOAK }],
        ['Rogue', 'human', 'female', 'chaotic', { uarm: LEATHER_ARMOR }],
        ['Samurai', 'human', 'male', 'lawful', { uarm: SPLINT_MAIL }],
        ['Tourist', 'human', 'male', 'neutral', { uarmu: HAWAIIAN_SHIRT }],
        ['Valkyrie', 'human', 'female', 'neutral', { uarms: SMALL_SHIELD }],
        ['Wizard', 'human', 'male', 'neutral',
            { uarmc: CLOAK_OF_MAGIC_RESISTANCE }],
    ];
    const SLOTS = ['uarm', 'uarmc', 'uarmu', 'uarmh', 'uarmg', 'uarmf',
        'uarms', 'ublindf', 'uleft', 'uright', 'uamul'];
    // One seed for every row: what varies here is the role, not the dungeon.
    // 7720300 is outside the matrix's own seeds so that reordering it cannot
    // point this test at a recorded case.
    const seed = 7720300;
    for (const [role, race, gender, align, expected] of starts) {
        const label = `${role}/${race}`;
        const nethackrc = [
            `OPTIONS=name:Wear,role:${role},race:${race},gender:${gender},`
            + `align:${align}`,
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!acoustics,!autopickup,time,showexp',
            '',
        ].join('\n');
        const segment = { seed, datetime: '20310203040506', nethackrc };

        assert.equal(await boundaryFor(segment, WAIT), null, label);
        for (const slot of SLOTS) {
            assert.equal(game[slot]?.otyp ?? null, expected[slot] ?? null,
                `${label} ${slot}`);
        }
        // Only the Archeologist's fedora makes set_wear() do anything a
        // startup setworn() had not already done.
        assert.equal(game.u.uluck, role === 'Archeologist' ? 1 : 0, label);
    }
});

test('the three gauntlets Gloves_on cannot run are refused unwritten',
    async () => {
    // do_wear.c:584-596. GAUNTLETS_OF_FUMBLING draws rnd(20) into HFumbling,
    // GAUNTLETS_OF_POWER calls makeknown(), and GAUNTLETS_OF_DEXTERITY calls
    // adj_abon(); u_init.c gives no role a pair, so all three are refused.
    // GAUNTLETS_OF_POWER is the case just outside this goal's stated limit,
    // recorded as the QUALITY.json deferral wear-gauntlets-stop.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    for (const otyp of [GAUNTLETS_OF_FUMBLING, GAUNTLETS_OF_POWER,
        GAUNTLETS_OF_DEXTERITY]) {
        // The refusal accessory_or_armor_on() hoists above setworn(), which
        // is what leaves AC and the slot alone; all four gloves carry an
        // oc_delay of 1, so the callback's own copy would run a turn late.
        await setup(segment, WAIT);
        const obj = armor(otyp, { dknown: 1, spe: 0 });

        await assert.rejects(
            () => accessory_or_armor_on(obj, game),
            refusal(UnsupportedWearError, `Gloves_on() for otyp ${otyp}`),
            `otyp ${otyp}`,
        );
        assert.equal(game.uarmg ?? null, null, `otyp ${otyp}`);
        assert.equal(obj.owornmask, 0, `otyp ${otyp}`);
        assert.equal(game.multi ?? 0, 0, `otyp ${otyp}`);

        // Gloves_on() asks the same question again for set_wear(), which has
        // no frame above it to hoist into.
        game.uarmg = armor(otyp, { known: false });
        assert.throws(() => Gloves_on(game),
            refusal(UnsupportedWearError, `Gloves_on() for otyp ${otyp}`));
        assert.equal(game.uarmg.known, false, `otyp ${otyp}`);
        game.uarmg = null;
    }
    game.uarmg = armor(LEATHER_GLOVES, { known: false });
    assert.equal(Gloves_on(game), 0);
    assert.equal(game.uarmg.known, true);
    game.uarmg = null;
});

test('Helmet_on reveals a wished helmet\'s enchantment on either arm',
    async () => {
    // The two wish segments the matrix records. mkobj.c mksobj():864 leaves a
    // wished piece with obj->known 0, so the write Helmet_on() makes is
    // visible in the inventory window either side of the 'W'.
    //
    // objects.h gives the dented pot an oc_delay of 0 and an ac of 9, so it
    // takes unmul("") and on_msg() on the spot and moves u.uac by 1 plus its
    // enchantment; the orcish helm's oc_delay of 1 spends a turn under
    // nomul(-1) and prints "You finish your dressing maneuver." instead.
    const potKeys = `${WAIT}${WISH_KEY}+2 dented pot\n`;
    const pot = wishSegmentTyping(7720176, potKeys);

    await runSegment({ ...pot, moves: potKeys });
    const acBefore = game.u.uac;
    const wished = inventoryLetter('e');
    assert.equal(wished.otyp, DENTED_POT);
    assert.equal(wished.known ?? false, false, 'a wished pot hides its +2');

    await runSegment({ ...pot, moves: `${potKeys}${WEAR_KEY}e` });
    assert.equal(topLine(), 'You are now wearing a dented pot.');
    assert.equal(game.uarmh.known, true);
    assert.equal(game.u.uac, acBefore - 3, 'a_ac 1 plus the +2');
    assert.equal(game.afternmv ?? null, null, 'oc_delay 0 ran it at once');

    const helmKeys = `${WAIT}${WISH_KEY}+1 orcish helm\n`;
    const helm = wishSegmentTyping(7720185, helmKeys);

    await runSegment({ ...helm, moves: `${helmKeys}${WEAR_KEY}e` });
    // The countdown reaches zero inside the same elapsed turn, so by the time
    // the segment stops the callback has run and printed. What separates this
    // arm from the pot's is the message: C prints no on_msg() here.
    assert.equal(topLine(), 'You finish your dressing maneuver.');
    assert.equal(game.uarmh.otyp, ORCISH_HELM);
    assert.equal(game.uarmh.known, true);
    assert.equal(game.multi ?? 0, 0);
});

test('Gloves_on reveals a wished pair\'s enchantment', async () => {
    // The wish segment the matrix records, and the first case anywhere that
    // makes Gloves_on()'s `known` write observable: the Healer, Knight and
    // Monk who start in leather gloves get them through
    // ini_inv_adjust_obj():1215-1216, which sets known before the first turn.
    //
    // objects.h:686-688 gives leather gloves an oc_delay of 1 and an ac of 9,
    // so the pair takes C's delayed arm and moves u.uac by its own 1 plus the
    // +2, and no on_msg() is printed at all.
    const keys = `${WAIT}${WISH_KEY}+2 leather gloves\n`;
    const segment = wishSegmentTyping(7720211, keys);

    await runSegment({ ...segment, moves: keys });
    const acBefore = game.u.uac;
    const wished = inventoryLetter('e');
    assert.equal(wished.otyp, LEATHER_GLOVES);
    assert.equal(wished.known ?? false, false, 'a wished pair hides its +2');

    await runSegment({ ...segment, moves: `${keys}${WEAR_KEY}e` });
    assert.equal(topLine(), 'You finish your dressing maneuver.');
    assert.equal(game.uarmg.otyp, LEATHER_GLOVES);
    assert.equal(game.uarmg.known, true);
    assert.equal(game.u.uac, acBefore - 3, 'a_ac 1 plus the +2');
    assert.equal(game.multi ?? 0, 0);
});

test('Boots_on reveals a wished pair\'s enchantment at either a_ac',
    async () => {
    // The two boots segments the matrix records. objects.h:700-703 gives low
    // boots an ac of 9 and iron shoes an ac of 8, so the ARMOR macro's
    // `10 - ac` makes their a_ac 1 and 2; with a +1 and a +0 both wearings
    // move u.uac by 2 from opposite halves of the same sum.
    //
    // Both carry an oc_delay of 2, the longest outside the suit slot, so
    // neither prints on_msg() and both end on the dressing message.
    for (const [seed, wish, otyp, spe, a_ac] of [
        [7720221, '+1 low boots', LOW_BOOTS, 1, 1],
        [7720223, '+0 iron shoes', IRON_SHOES, 0, 2],
    ]) {
        const keys = `${WAIT}${WISH_KEY}${wish}\n`;
        const segment = wishSegmentTyping(seed, keys);

        await runSegment({ ...segment, moves: keys });
        const acBefore = game.u.uac;
        const wished = inventoryLetter('e');
        assert.equal(wished.otyp, otyp, wish);
        assert.equal(wished.known ?? false, false, wish);
        assert.equal(game.uarmf ?? null, null, 'no role starts in boots');

        await runSegment({ ...segment, moves: `${keys}${WEAR_KEY}e` });
        assert.equal(topLine(), 'You finish your dressing maneuver.', wish);
        assert.equal(game.uarmf.otyp, otyp, wish);
        assert.equal(game.uarmf.known, true, wish);
        assert.equal(game.u.uac, acBefore - (a_ac + spe), wish);
        assert.equal(game.multi ?? 0, 0, wish);
    }
});

test('a second pair of gloves or boots is refused by its category name',
    async () => {
    // canwearobj()'s is_gloves and is_boots filled-slot arms, at
    // do_wear.c:2139-2142 and 2103-2106. Both answer already_wearing() with a
    // bare category rather than an(): "gloves" and "boots" are plural, where
    // the helmet, shield, shirt and cloak arms all take an article.
    //
    // The Monk's gloves are starting gear; the Valkyrie's boots are the pair
    // the first half of her segment put on, which is why hers needs two
    // wishes. Neither refusal spends a turn or moves AC.
    const monkKeys = `${WAIT}${WISH_KEY}+0 leather gloves\n${WEAR_KEY}j`;
    const monk = wishSegmentTyping(7720213, monkKeys);

    await runSegment({ ...monk, moves: monkKeys });
    assert.equal(topLine(), 'You are already wearing gloves.');
    assert.equal(game.uarmg.spe, 2, 'the Monk kept his own +2 pair');

    const bootsOn = `${WAIT}${WISH_KEY}+1 low boots\n${WEAR_KEY}e`;
    const valkyrie = wishSegmentTyping(7720225, bootsOn);

    await runSegment({ ...valkyrie, moves: bootsOn });
    const acBefore = game.u.uac;

    await runSegment({
        ...valkyrie,
        moves: `${bootsOn}${WISH_KEY}+0 iron shoes\n${WEAR_KEY}f`,
    });
    assert.equal(topLine(), 'You are already wearing boots.');
    assert.equal(game.uarmf.otyp, LOW_BOOTS, 'the first pair is still on');
    assert.equal(game.u.uac, acBefore, 'the refusal moved nothing');
});

test('a second helmet is refused by the name of the one worn', async () => {
    // canwearobj()'s is_helmet arm at do_wear.c:2110-2114 through
    // objnam.c helm_simple_name() (5513-5525), which answers "helmet" for a
    // metallic hat and "hat" for the rest. The fedora is CLOTH.
    const keys = `${WAIT}${WISH_KEY}+0 dented pot\n${WEAR_KEY}j`;
    const segment = wishSegmentTyping(7720194, keys);

    await runSegment({ ...segment, moves: keys });
    assert.equal(topLine(), 'You are already wearing a hat.');
    assert.equal(game.uarmh.otyp, FEDORA, 'the fedora is still the one worn');
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
        refusal(UnsupportedWearError, 'accessory_or_armor_on() quest helm'),
    );
    // Outside the Quest branch the same helm reaches the otyp refusal in the
    // W_ARMH arm instead, one frame later and still above setworn().
    game.qstart_level = { dnum: game.u.uz.dnum + 1, dlevel: 11 };
    await assert.rejects(
        () => accessory_or_armor_on(
            armor(HELM_OF_OPPOSITE_ALIGNMENT, { dknown: 1 }), game,
        ),
        refusal(UnsupportedWearError,
            `Helmet_on() for otyp ${HELM_OF_OPPOSITE_ALIGNMENT}`),
    );
    delete game.qstart_level;

    // do_wear.c:2355-2356 retouch_object(), refused for an artifact alone.
    await assert.rejects(
        () => accessory_or_armor_on(
            armor(SMALL_SHIELD, { dknown: 1, oartifact: 1 }), game,
        ),
        refusal(UnsupportedWearError, 'retouch_object() for an artifact'),
    );
    // do_wear.c:2363-2364 remove_worn_item(), for armor held in a weapon slot.
    await assert.rejects(
        () => accessory_or_armor_on(
            armor(SMALL_SHIELD, { dknown: 1, owornmask: W_SWAPWEP }), game,
        ),
        refusal(UnsupportedWearError, 'remove_worn_item()'),
    );
    // Armor_on()'s dragon-armor tails, refused above setworn() rather than
    // inside the callback so that the suit never reaches a slot. Gray is one
    // of the two colours dragon_armor_handling() has no arm for -- its switch
    // at do_wear.c:806-883 names the other eight, in scales and in mail, and
    // says so at 807-808 -- and
    // artifact_light() answers TRUE for gold alone, so gray scales trip
    // neither tail in C and are refused anyway, exactly as Armor_off() refuses
    // them. Gold dragon scale mail is the one that trips both.
    for (const otyp of [GRAY_DRAGON_SCALES, GOLD_DRAGON_SCALE_MAIL]) {
        await assert.rejects(
            () => accessory_or_armor_on(armor(otyp, { dknown: 1 }), game),
            refusal(UnsupportedWearError, `Armor_on() for otyp ${otyp}`),
        );
        assert.equal(game.uarm ?? null, null, `otyp ${otyp}`);
        assert.equal(game.multi ?? 0, 0, `otyp ${otyp}`);
    }
    assert.equal(game.uarms ?? null, null,
        'every refusal left the slot empty');
});

test('Armor_on answers for an empty suit slot', async () => {
    // do_wear.c:889-890, C's own "no known instances of !uarm here but play
    // it safe". Nothing in this port reaches it: accessory_or_armor_on() is
    // the one place that installs the callback and it does so one statement
    // after setworn() fills the slot, and moveloop_core() reads no key while
    // the countdown runs, so no command can empty the slot before unmul()
    // arrives.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    assert.equal(game.uarm ?? null, null, 'a Valkyrie starts without a suit');
    assert.equal(Armor_on(game), 0);

    // With a suit in the slot the same call sets obj->known instead.
    const suit = armor(LEATHER_JACKET, { dknown: 1, spe: 2, known: false });
    await accessory_or_armor_on(suit, game);
    assert.equal(suit.known, true, 'the oc_delay 0 arm ran the callback');
    suit.known = false;
    assert.equal(Armor_on(game), 0);
    assert.equal(suit.known, true);
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

    // The second guard is a conjunction of all eleven slots, so any one of
    // them left empty has to keep it quiet on its own; testing a single slot
    // would leave the other ten deletable in silence. What the guard cannot
    // do is decide the answer alone: getobj() reports the pack, and the
    // fedoras below are not in it, so every iteration ends at the same
    // "nothing else to wear" whichever slot is the empty one. The Valkyrie's
    // own shield stays out of the prompt throughout, because equip_ok() reads
    // its owornmask rather than uarms.
    const filled = ['uarm', 'uarmu', 'uarmc', 'uarmh', 'uarms', 'uarmg',
        'uarmf', 'uleft', 'uright', 'uamul', 'ublindf'];
    const saved = filled.map((field) => game[field] ?? null);
    for (const field of filled) game[field] = armor(FEDORA);
    for (const empty of filled) {
        game[empty] = null;
        assert.equal(await dowear(game), ECMD_CANCEL, empty);
        assert.equal(takePendingTopLine(),
            "You don't have anything else to wear.", empty);
        game[empty] = armor(FEDORA);
    }
    // All eleven filled is the guard's own case, and the only one of the
    // twelve that answers ECMD_OK.
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

    // The accessory arm calls invent.c prinv(). do_wear.c:80 tests
    // `owornmask & (W_RING | W_AMUL)`, and obj.h spells W_RING as
    // W_RINGL | W_RINGR, so all three bits take this arm whatever
    // flags.verbose says; eyewear takes it only when verbose is off.
    // prinv() prints through ttyPline, so takePendingTopLine() captures it.
    for (const mask of [W_ARMS | W_AMUL, W_RINGL, W_RINGR]) {
        await on_msg({ ...shield, owornmask: mask }, game);
        // prinv() produces a line for each; verify it printed something.
        const line = takePendingTopLine();
        assert.ok(line.length > 0, `mask ${mask} should produce output`);
    }
    const towel = { oclass: TOOL_CLASS, otyp: 0, owornmask: W_TOOL, quan: 1 };
    game.flags.verbose = false;
    await on_msg(towel, game);
    // With verbose off, terse eyewear takes the prinv() arm too.
    assert.ok(takePendingTopLine().length > 0,
        'terse eyewear should produce prinv output',
    );
    game.flags.verbose = true;
});

test('wear and take-off messages keep their foreign naming state',
    async () => {
        const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
        await setup(segment, WAIT);

        function foreignState() {
            const state = Object.create(game);
            state.mons = structuredClone(game.mons);
            state.mons[PM_LICHEN].pmnames = [
                'Blueberries', 'Blueberries', 'Blueberries',
            ];
            state.gf = {
                ffruit: { fname: 'foreign fruit', fid: 7, nextf: null },
            };
            state.artilist = structuredClone(game.artilist);
            state.artiexist = structuredClone(game.artiexist);
            state.artilist[ART_SUNSWORD].name = 'Blueberries';
            state.artiexist[ART_SUNSWORD].exists = 1;
            state.artiexist[ART_SUNSWORD].found = 1;
            state.objects = structuredClone(game.objects);
            state.obj_descr = structuredClone(game.obj_descr);
            state.flags = { ...game.flags, verbose: true };
            state.iflags = { ...game.iflags, override_ID: true };
            state.program_state = { ...game.program_state };
            state.context = structuredClone(game.context);
            state.u = structuredClone(game.u);
            state.nhDisplay = { ...game.nhDisplay };
            state._pending_message = '';
            state._ttyPreviousMessage = '';
            state._ttyToplines = '';
            return state;
        }

        function blueberries(overrides = {}) {
            return armor(SMALL_SHIELD, {
                dknown: 1,
                oartifact: ART_SUNSWORD,
                oextra: { oname: 'Blueberries' },
                ...overrides,
            });
        }

        const wearing = foreignState();
        await on_msg(blueberries({ owornmask: W_ARMS }), wearing);
        assert.equal(
            wearing._pending_message,
            'You are now wearing the Blueberries.',
        );

        const takingOff = foreignState();
        const namedSuit = blueberries({ owornmask: W_ARM });
        takingOff.uarm = namedSuit;
        takingOff.uarmc = armor(LEATHER_CLOAK, {
            cursed: true,
            owornmask: W_ARMC,
        });
        takingOff.context.takeoff = { mask: 0 };
        assert.equal(await select_off(namedSuit, takingOff), 0);
        assert.equal(
            takingOff._pending_message,
            'You cannot remove your cloak to take off the Blueberries.',
        );
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
    assert.throws(() => Shield_on(game),
        refusal(UnsupportedWearError, 'Shield_on() for otyp 92'));
    game.uarms = null;
});

test('Shirt_on stops for a slot holding something that is not a shirt',
    async () => {
    // do_wear.c:767-768 reports impossible() for an otyp outside the two
    // objects.h defines. No ported path can arrive, because canwearobj()
    // picks the callback by is_shirt(), which answers for exactly those two.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    game.uarmu = armor(FEDORA, { owornmask: W_ARMU, dknown: 1 });
    assert.throws(() => Shirt_on(game),
        refusal(UnsupportedWearError, 'Shirt_on() for otyp 92'));

    // Both shirts pass, and each sets the known bit. No recorded case reaches
    // that write: every shirt this port can hold arrives from u_init.c with
    // known already 1, and a wished one cannot be recorded because
    // zap.c makewish() formats it through objnam.c the(), whose proper-noun
    // arm both capitalized shirt names take and this port refuses. Tracked as
    // the QUALITY.json deferral shirt-known-write-has-no-recorded-case.
    for (const otyp of [HAWAIIAN_SHIRT, T_SHIRT]) {
        game.uarmu = armor(otyp, { owornmask: W_ARMU, dknown: 1,
            known: false });
        assert.equal(Shirt_on(game), 0, `otyp ${otyp}`);
        assert.equal(game.uarmu.known, true, `otyp ${otyp}`);
    }
    game.uarmu = null;
});

test('Cloak_on reads the cloak slot before it tests it', async () => {
    // do_wear.c:329 and :331 both read uarmc->otyp, so C's own guard at 375 --
    // "no known instance of !uarmc here" -- can never answer FALSE: a null
    // uarmc has already been dereferenced twice. This port reads it in the
    // same place, so an empty slot ends the call rather than answering 0, and
    // the guard survives only because it is C's line. Nothing reaches either:
    // accessory_or_armor_on() installs the callback one statement after
    // setworn() fills the slot, and every cloak's oc_delay is 0, so unmul("")
    // runs it before any other code can empty the slot.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, OFF);
    assert.equal(game.uarmc ?? null, null, 'a Valkyrie starts without a cloak');
    await assert.rejects(() => Cloak_on(game), (error) => {
        assert.ok(error instanceof TypeError, `got ${error?.name}`);
        assert.match(error.message, /otyp/u);
        return true;
    });

    // With a cloak in the slot the same call sets obj->known instead.
    const cloak = armor(LEATHER_CLOAK, { dknown: 1, spe: 2, known: false });
    await accessory_or_armor_on(cloak, game);
    assert.equal(cloak.known, true, 'the oc_delay 0 arm ran the callback');
    cloak.known = false;
    assert.equal(await Cloak_on(game), 0);
    assert.equal(cloak.known, true);
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
    // is the whole reason equip_ok() calls canwearobj() at all. It asks with
    // noisy FALSE, once for every armor object in the pack, so a refusal that
    // printed anything would put it on the top line before the prompt was
    // raised. All seven of canwearobj()'s filled-slot arms sit on that path,
    // and each carries its own `if (noisy)`, so each is asked here with its
    // own slot filled and nothing else on. The Valkyrie is wearing nothing at
    // this point, so every row below supplies both pieces.
    const slots = [
        ['uarmh', W_ARMH, FEDORA, ORCISH_HELM],
        ['uarms', W_ARMS, SMALL_SHIELD, ELVEN_SHIELD],
        ['uarmf', W_ARMF, LOW_BOOTS, IRON_SHOES],
        ['uarmg', W_ARMG, LEATHER_GLOVES, LEATHER_GLOVES],
        ['uarmu', W_ARMU, HAWAIIAN_SHIRT, T_SHIRT],
        ['uarmc', W_ARMC, LEATHER_CLOAK, ROBE],
        // The suit arm reads uarmc before uarm, so the cloak slot has to be
        // empty for this row to reach already_wearing("some armor").
        ['uarm', W_ARM, LEATHER_ARMOR, RING_MAIL],
    ];
    for (const [field, mask, worn, offered] of slots) {
        const savedSlot = game[field] ?? null;
        game[field] = armor(worn, { owornmask: mask, dknown: 1 });
        assert.equal(await wear_ok(armor(offered, { dknown: 1 }), game),
            GETOBJ_DOWNPLAY, field);
        assert.equal(takePendingTopLine(), '',
            `the prompt filter stays silent for ${field}`);
        game[field] = savedSlot;
    }
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

    // One TRUE witness at each end of the size window C names, so that
    // narrowing either bound turns one of them FALSE: a gnome sits on
    // MZ_SMALL and a fire giant on MZ_HUGE. Their msize is asserted rather
    // than described, because the whole point of the pair is where they sit.
    assert.equal(species(PM_GNOME).msize, MZ_SMALL);
    assert.equal(WrappingAllowed(species(PM_GNOME)), true);
    assert.equal(species(PM_FIRE_GIANT).msize, MZ_HUGE);
    assert.equal(WrappingAllowed(species(PM_FIRE_GIANT)), true);
    // A Valkyrie is MZ_HUMAN, between the two.
    assert.equal(WrappingAllowed(species(PM_VALKYRIE)), true);

    // One FALSE witness per conjunct, each rejected by that conjunct alone:
    // every other term of the macro answers TRUE for it, so deleting the
    // named term makes exactly this line fail.
    //
    // A lichen is S_FUNGUS, MZ_SMALL and corporeal, so humanoid() is the only
    // term that turns it away.
    assert.equal(WrappingAllowed(species(PM_LICHEN)), false);
    // A leprechaun is a corporeal humanoid one size below the window:
    // monsters.h:660-666 gives it MZ_TINY and M1_HUMANOID.
    assert.equal(WrappingAllowed(species(PM_LEPRECHAUN)), false);
    // A ghost is a humanoid of MZ_HUMAN, so noncorporeal() -- mondata.h:31,
    // `mlet == S_GHOST` -- is the only term that turns it away.
    assert.equal(WrappingAllowed(species(PM_GHOST)), false);
    // The four forms C excludes by name or by symbol. A plains centaur is a
    // corporeal MZ_LARGE humanoid, so S_CENTAUR alone rejects it; a marilith
    // and a winged gargoyle likewise reach their own PM_ tests.
    assert.equal(WrappingAllowed(species(PM_PLAINS_CENTAUR)), false);
    assert.equal(WrappingAllowed(species(PM_MARILITH)), false);
    assert.equal(WrappingAllowed(species(PM_WINGED_GARGOYLE)), false);

    // The upper bound has no witness in the catalog: 14 rows sit above
    // MZ_HUGE -- monsters.h spells a fifteenth, the shimmering dragon, inside
    // an `#if 0` -- and every one of them is a worm or a dragon that
    // humanoid() has already turned away, so no permonst row can falsify
    // `msize <= MZ_HUGE` on its own. A copied row with the size raised is
    // what pins it, the same device the canwearobj() test above uses to reach
    // verysmall() with a form the catalog has no row for.
    const gigantic = { ...species(PM_VALKYRIE), msize: MZ_HUGE + 1 };
    assert.equal(WrappingAllowed(gigantic), false);
});

test('has_horns holds from one horn up, not from two', async () => {
    // mondata.h:56 is `(num_horns(ptr) > 0)` over mondata.c num_horns():678.
    // scripts/mondata-pure.test.mjs pins all nine num_horns() arms; what is
    // left here is where has_horns() puts its threshold, and only a
    // one-horned form separates `> 0` from `> 1`. The white unicorn is one of
    // the four rows num_horns():686-689 answers 1 for; the minotaur is one of
    // the four at 681-684 answering 2; the valkyrie falls to the default 0.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);

    assert.equal(num_horns(species(PM_MINOTAUR)), 2);
    assert.equal(has_horns(species(PM_MINOTAUR)), true);
    assert.equal(num_horns(species(PM_WHITE_UNICORN)), 1);
    assert.equal(has_horns(species(PM_WHITE_UNICORN)), true);
    assert.equal(num_horns(species(PM_VALKYRIE)), 0);
    assert.equal(has_horns(species(PM_VALKYRIE)), false);
});

// do_wear.c on_msg():89-97 formats the name and then asks objnam.c
// obj_is_pname() (332-342) whether the line reads "the <name>" or "an <name>".
// on_msg() reads the whole C conjunction; it used to call a second, narrower
// copy that refused every artifact. The two disagree only for an artifact, and
// no 'W' reaches one: accessory_or_armor_on() refuses it at retouch_object(),
// which the test above pins.
test('on_msg asks the complete obj_is_pname', async () => {
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    await setup(segment, WAIT);

    // Each object below is fully identified except where the case is about
    // not_fully_identified() itself, so that one term of the conjunction
    // decides each answer alone. Sunsword has been seen, which clears that
    // function's undiscovered-artifact arm.
    const identified = { known: 1, dknown: 1, bknown: 1, rknown: 1 };
    game.artiexist[ART_SUNSWORD].exists = 1;
    game.artiexist[ART_SUNSWORD].found = 1;

    // C's first term. A shield the hero has called something is still named
    // by its type: a called name is not an artifact's own name.
    const called = armor(SMALL_SHIELD, {
        ...identified, oextra: { oname: 'Fido' },
    });
    assert.equal(obj_is_pname(called, game), false);

    // has_oname(), C's second term: an artifact carrying no instance name has
    // nothing to print in place of its type name.
    const unnamed = armor(SMALL_SHIELD, {
        ...identified, oartifact: ART_SUNSWORD,
    });
    assert.equal(obj_is_pname(unnamed, game), false);

    // The arm the narrower copy refused instead of answering.
    // not_fully_identified() holds while the hero has not learned the
    // shield's enchantment, so the artifact still goes by its type name.
    const named = armor(SMALL_SHIELD, {
        ...identified, known: 0,
        oartifact: ART_SUNSWORD, oextra: { oname: 'Sunsword' },
    });
    assert.equal(obj_is_pname(named, game), false);

    // objnam.c:337 skips that test outright while iflags.override_ID is up.
    game.iflags.override_ID = 1;
    assert.equal(obj_is_pname(named, game), true);
    game.iflags.override_ID = 0;

    // And with the enchantment learned it answers by its own name unaided.
    named.known = 1;
    assert.equal(obj_is_pname(named, game), true);
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

test('W answered with a ring puts the ring on', async () => {
    // With the accessory half of accessory_or_armor_on() ported, a ring
    // selected at the 'W' prompt goes through. The 'r' keystroke answers
    // the "Which ring-finger, Right or Left?" prompt.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    const debug = {
        ...segment,
        seed: 7720141,
        nethackrc: segment.nethackrc.replace(
            'showexp', 'showexp,playmode:debug',
        ),
        moves: `${WAIT}\x17ring of adornment\n${WEAR_KEY}er${WAIT}`,
    };
    // The ring of adornment's adjust_attrib() arm is ported, so the whole
    // command completes without hitting a boundary.
    const boundary = await boundaryFor(debug, debug.moves);
    assert.equal(boundary, null, 'no fail-closed boundary');
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

// ---- P command (puton) and Ring_on() tests ----

// Build a debug-mode segment that wishes for the given item and then replays
// `extraMoves`. The seed 7720141 and the 'showexp' anchor are shared with the
// existing 'W answered with a ring' test above; both need a character that
// starts with empty ring slots.
function debugRingSegment(wishItem, extraMoves) {
    // The base segment is any worn-armor-matrix segment with the right option
    // string, so the hero starts in a dungeon with an inventory.
    const segment = segmentFor(`${TAKEOFF_KEY}${WEAR_KEY}c`);
    return {
        ...segment,
        seed: 7720141,
        nethackrc: segment.nethackrc.replace(
            'showexp', 'showexp,playmode:debug',
        ),
        moves: `${WAIT}\x17${wishItem}\n${extraMoves}`,
    };
}

// Find the first inventory item with the given otyp. Inventory is a linked list
// on `nobj`; the wished-for ring lands at the tail because addinv() appends it
// after the starting kit.
function inventoryByOtyp(otyp) {
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === otyp) return obj;
    }
    return null;
}

// Create a synthetic ring object suitable for Ring_on(). Ring_on reads otyp,
// spe, owornmask, dknown, and the uprops extrinsic; it does not walk the
// inventory list, so a detached object works.
function syntheticRing(otyp, spe = 0) {
    return {
        oclass: RING_CLASS, otyp, spe,
        owornmask: 0, dknown: false, known: false, quan: 1, where: 0,
    };
}

test('the puton command is admitted and shares its row with doputon', () => {
    // cmd.js ADMITTED_COMMANDS includes 'puton'; the extcmdlist row has P (0x50)
    // as its key and 'doputon' as its function name. The row has no flags, so
    // rhack() refuses an 'm' prefix rather than running the command under it.
    assert.ok(ADMITTED_COMMANDS.includes('puton'));
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'puton');
    assert.ok(row, 'extcmdlist[] has a puton row');
    assert.equal(row.ef_funct, 'doputon');
    assert.equal(row.flags, 0);
    assert.equal(row.key, 0x50, 'P key maps to doputon');
});

test('Ring_on adjust_attrib changes CHA for ring of adornment', async () => {
    // Ring_on(RIN_ADORNMENT) calls adjust_attrib(obj, A_CHA, spe). A +1 ring
    // bumps CHA by 1. We initialize game state, place a synthetic ring in the
    // left slot, and call Ring_on directly.
    const debug = debugRingSegment('ring of adornment', `${WAIT}`);
    await setup(debug, debug.moves);
    const chaBefore = effective_attribute(game, A_CHA);

    // Synthetic +1 ring of adornment, placed in the left ring slot.
    const ring = syntheticRing(RIN_ADORNMENT, 1);
    ring.owornmask = W_RINGL;
    game.uleft = ring;

    await Ring_on(ring, game);

    // A_CHA increased by spe (1).
    assert.equal(
        effective_attribute(game, A_CHA), chaBefore + 1,
        'CHA rises by the ring spe (+1)',
    );
    // adjust_attrib sets the status-line refresh flag on game.disp, not
    // game.nhDisplay (the terminal object). flush_screen reads game.disp.botl
    // to decide whether to call bot().
    assert.equal(game.disp.botl, true, 'botl flag set for status-line refresh');
});

test('Ring_on adjust_attrib changes STR for ring of gain strength', async () => {
    // Ring_on(RIN_GAIN_STRENGTH) calls adjust_attrib(obj, A_STR, spe).
    // A +1 ring bumps STR by 1.
    const debug = debugRingSegment('ring of gain strength', `${WAIT}`);
    await setup(debug, debug.moves);
    const strBefore = effective_attribute(game, A_STR);

    const ring = syntheticRing(RIN_GAIN_STRENGTH, 1);
    ring.owornmask = W_RINGR;
    game.uright = ring;

    await Ring_on(ring, game);

    assert.equal(
        effective_attribute(game, A_STR), strBefore + 1,
        'STR rises by the ring spe (+1)',
    );
});

test('Ring_on adjust_attrib changes CON for ring of gain constitution',
     async () => {
    // Ring_on(RIN_GAIN_CONSTITUTION) calls adjust_attrib(obj, A_CON, spe).
    // A +1 ring bumps CON by 1. This exercises the A_CON path through
    // extremeattr(), which has Ogresmasher-specific logic distinct from the
    // A_STR (Gauntlets of Power) and A_CHA (no override) branches.
    const debug = debugRingSegment('ring of gain constitution', `${WAIT}`);
    await setup(debug, debug.moves);
    const conBefore = effective_attribute(game, A_CON);

    const ring = syntheticRing(RIN_GAIN_CONSTITUTION, 1);
    ring.owornmask = W_RINGL;
    game.uleft = ring;

    await Ring_on(ring, game);

    assert.equal(
        effective_attribute(game, A_CON), conBefore + 1,
        'CON rises by the ring spe (+1)',
    );
});

test('Ring_on no-op types do not throw', async () => {
    // Sixteen ring types plus meat ring have no effect beyond the extrinsic
    // that setworn() already set. Ring_on must not throw for any of them.
    // Three representative types exercise the code path: teleportation
    // (first no-op case), regeneration (middle), meat ring (standalone arm).
    const noOpTypes = [
        RIN_TELEPORTATION, RIN_REGENERATION, MEAT_RING,
    ];
    const debug = debugRingSegment('ring of regeneration', `${WAIT}`);
    await setup(debug, debug.moves);

    for (const otyp of noOpTypes) {
        const ring = syntheticRing(otyp, 0);
        ring.owornmask = W_RINGL;
        game.uleft = ring;
        // Must complete without throwing.
        await Ring_on(ring, game);
        // Clean up for the next iteration.
        game.uleft = null;
        ring.owornmask = 0;
    }
});

test('Ring_on increase_accuracy adjusts uhitinc', async () => {
    // Ring_on(RIN_INCREASE_ACCURACY) adds obj.spe to u.uhitinc. A +2 ring
    // bumps the hit bonus by 2.
    const debug = debugRingSegment('ring of increase accuracy', `${WAIT}`);
    await setup(debug, debug.moves);
    const hitBefore = game.u.uhitinc ?? 0;

    const ring = syntheticRing(RIN_INCREASE_ACCURACY, 2);
    ring.owornmask = W_RINGL;
    game.uleft = ring;

    await Ring_on(ring, game);

    assert.equal(game.u.uhitinc, hitBefore + 2,
        'uhitinc increased by ring spe (+2)');
});

test('Ring_on increase_damage adjusts udaminc', async () => {
    // Ring_on(RIN_INCREASE_DAMAGE) adds obj.spe to u.udaminc. A +3 ring bumps
    // the damage bonus by 3.
    const debug = debugRingSegment('ring of increase damage', `${WAIT}`);
    await setup(debug, debug.moves);
    const damBefore = game.u.udaminc ?? 0;

    const ring = syntheticRing(RIN_INCREASE_DAMAGE, 3);
    ring.owornmask = W_RINGR;
    game.uright = ring;

    await Ring_on(ring, game);

    assert.equal(game.u.udaminc, damBefore + 3,
        'udaminc increased by ring spe (+3)');
});

test('Ring_on protection calls find_ac and learns the ring', async () => {
    // Ring_on(RIN_PROTECTION) calls learnring(obj, observable) with
    // observable = (spe != 0), then find_ac(). A +1 ring of protection lowers
    // AC by 1.
    const debug = debugRingSegment('ring of protection', `${WAIT}`);
    await setup(debug, debug.moves);

    // Capture AC before placing the ring. find_ac() reads uleft/uright, so
    // calling it while the slot is empty gives the ringless baseline.
    find_ac(game);
    const acBefore = game.u.uac;

    const ring = syntheticRing(RIN_PROTECTION, 1);
    ring.owornmask = W_RINGL;
    game.uleft = ring;

    await Ring_on(ring, game);

    // find_ac() inside Ring_on recalculates u.uac counting the new ring.
    // A +1 ring of protection lowers AC by 1.
    assert.equal(game.u.uac, acBefore - 1,
        'AC drops by 1 for a +1 ring of protection');
});

test('Ring_on throws UnsupportedRingOnError for stealth', async () => {
    // The stealth arm (toggle_stealth) is unported. Ring_on must refuse it
    // with the specific error class that failClosedCommandRefusals catches.
    const debug = debugRingSegment('ring of stealth', `${WAIT}`);
    await setup(debug, debug.moves);

    const ring = syntheticRing(RIN_STEALTH, 0);
    ring.owornmask = W_RINGL;
    game.uleft = ring;

    await assert.rejects(
        () => Ring_on(ring, game),
        refusal(UnsupportedRingOnError, 'toggle_stealth'),
    );
});

test('P command puts a ring on through the full command flow', async () => {
    // End-to-end: P prompt selects a wished-for ring of regeneration (a no-op
    // type), 'r' answers the finger prompt. No fail-closed boundary fires.
    const debug = debugRingSegment('ring of regeneration', `Per${WAIT}`);
    const boundary = await boundaryFor(debug, debug.moves);
    assert.equal(boundary, null, 'no fail-closed boundary for P + ring');
});

test('yn_function with NUL default omits the default display', async () => {
    // C ref: topl.c:415 `if (def)` tests the char value; NUL (0) is falsy and
    // suppresses the " (X)" suffix. In JS, def arrives as a one-character
    // string, so '\0' must be tested by code point, not truthiness. The fix is
    // in getline.js tty_yn_function.
    //
    // The finger prompt "Which ring-finger, Right or Left? [rl] " must not
    // end with " (\0) " (which would be 4 characters wider than the C output).
    // We verify by running the P command for a ring and checking the top-line
    // screen content at the finger prompt boundary.
    const debug = debugRingSegment('ring of regeneration', `Pe`);
    // After 'Pe', the game has shown the ring-finger prompt and is waiting for
    // the answer. The prompt is on the top line.
    await runSegment({ ...debug, moves: debug.moves });
    const prompt = topLine();
    // The prompt must NOT contain the literal "(\0)" or "(^@)" substring.
    assert.ok(!prompt.includes('(\0)'),
        `prompt must not show NUL default: ${JSON.stringify(prompt)}`);
    assert.ok(!prompt.includes('(^@)'),
        `prompt must not show NUL as caret notation: ${JSON.stringify(prompt)}`);
    // The prompt must contain "[rl]" (the choices). topLine() trims trailing
    // whitespace, so the trailing space after "]" is gone; the fixed prompt
    // ends the line.
    assert.ok(prompt.includes('[rl]'),
        `prompt must show choices: ${JSON.stringify(prompt)}`);
    // Verify it does NOT have "[rl] (" which would mean a default is displayed.
    // (Before the fix, the 4-char-wider prompt showed "[rl] (\0) ".)
    assert.ok(!prompt.includes('[rl] ('),
        `prompt must not show a default after choices: ${JSON.stringify(prompt)}`);
});
