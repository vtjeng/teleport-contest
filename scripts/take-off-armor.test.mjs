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
    INVIS,
    M_SEEN_ELEC,
    M_SEEN_MAGR,
    M_SEEN_NOTHING,
    PARANOID_REMOVE,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
    W_RINGL,
    W_TOOL,
    W_WEP,
} from '../js/const.js';
import {
    _doWearInternals,
    armor_or_accessory_off,
    armoroff,
    count_worn_stuff,
    cursed,
    dotakeoff,
    equip_ok,
    inaccessible_equipment,
    select_off,
    takeoff_ok,
} from '../js/do_wear.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { monstunseesu } from '../js/mondata.js';
import { M1_SEE_INVIS } from '../js/monsters.js';
import { setworn } from '../js/worn.js';
import {
    AMULET_CLASS,
    AMULET_OF_ESP,
    ARMOR_CLASS,
    BLINDFOLD,
    CLOAK_OF_DISPLACEMENT,
    CLOAK_OF_MAGIC_RESISTANCE,
    ELVEN_MITHRIL_COAT,
    FEDORA,
    HAWAIIAN_SHIRT,
    LEATHER_GLOVES,
    LEATHER_JACKET,
    LENSES,
    LONG_SWORD,
    LOW_BOOTS,
    PLATE_MAIL,
    RING_CLASS,
    RIN_ADORNMENT,
    SPLINT_MAIL,
    TOOL_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    ESCAPE_KEY,
    SPACE_KEY,
    TAKEOFF_BY_NAME,
    TAKEOFF_KEY,
    WAIT,
    loadTakeOffOptionsRecipe,
    loadTakeOffRecipe,
} from './run-take-off-armor.mjs';

const { Armor_off, Cloak_off, is_boots, is_gloves, reset_remarm,
    takeoffContext, setwornEnv } = _doWearInternals;

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The top line a call made outside moveloop_core() produced. Nothing has
// flushed the screen yet, so the grid still holds the previous frame; this is
// the text the next flush would paint onto row 0. Consecutive plines append to
// it the way C's toplines does, so a test that reads one message at a time
// clears it first.
function takePendingTopLine() {
    const text = game._pending_message ?? '';
    game._pending_message = '';
    return text;
}

// The lower of the two status rows, which carries the AC field every
// successful removal moves.
function statusRow() {
    return game.nhDisplay.grid[23].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a matrix segment by the keys it types, so reordering the matrix
// cannot silently point a test at a different case.
function segmentFor(moves, recipe = loadTakeOffRecipe()) {
    const found = recipe.segments.find(
        (segment) => segment.moves === `${WAIT}${moves}${WAIT}`,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
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

// The fields a refused <X>_off() arm could rewrite on the item still in its
// slot. Recorded by value, because the alternative -- holding the object
// itself -- compares a refusal's slot against itself and so can only see a
// slot emptied or swapped, never an item edited in place.
function slotDescriptor(obj) {
    if (!obj) return null;
    const { otyp, owornmask, spe, cursed, bknown } = obj;
    return { otyp, owornmask, spe, cursed, bknown };
}

// A snapshot of everything a refusal must leave alone: the seven worn slots,
// the turn counter, whether the command spent time, the drawn top line and
// the number of random draws made so far.
function refusalWitness(replay) {
    return {
        // An empty slot reads as undefined at startup and as null once
        // setworn() has cleared it, so both are recorded the same way.
        slots: [
            game.uarm, game.uarmc, game.uarmh, game.uarms,
            game.uarmg, game.uarmf, game.uarmu,
        ].map((slot) => slotDescriptor(slot ?? null)),
        moves: game.moves,
        move: game.context.move,
        top: topLine(),
        status: statusRow(),
        draws: (replay.getRngLog?.() ?? []).length,
    };
}

test('the takeoff command is admitted and shares its row with dotakeoff',
    () => {
    assert.ok(ADMITTED_COMMANDS.includes('takeoff'));
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'takeoff');
    assert.ok(row, 'extcmdlist[] has a takeoff row');
    assert.equal(row.ef_funct, 'dotakeoff');
    // cmd.c:1886 gives the row no flags, which is what lets rhack() report
    // an 'm' prefix rather than running the command under it.
    assert.equal(row.flags, 0);
});

test('one worn piece is taken off without a prompt', async () => {
    // do_wear.c:1849. count_worn_stuff() answers Narmorpieces == 1 for each
    // of these roles, so dotakeoff() hands its own default item straight to
    // armor_or_accessory_off() with no prompt at all. The three one-piece
    // roles are read one at a time so the AC field can be compared with the
    // value before the removal, and between them they cover three of the five
    // ported <X>_off() arms: u_init.c gives the Wizard a cloak (AC 1), the
    // Tourist a Hawaiian shirt (AC 0) and the Valkyrie a +3 small shield
    // (AC 1 plus its enchantment).
    const cases = [
        ['Wizard', 'uarmc',
            'You were wearing an uncursed +0 cloak of magic resistance.', 1],
        ['Tourist', 'uarmu',
            'You were wearing an uncursed +0 Hawaiian shirt.', 0],
        ['Valkyrie', 'uarms',
            'You were wearing an uncursed +3 small shield.', 4],
    ];
    for (const [role, slot, expected, acDelta] of cases) {
        const segment = loadTakeOffRecipe().segments.find(
            (entry) => entry.nethackrc.includes(`role:${role},`),
        );
        assert.ok(segment, `the matrix has a ${role} segment`);
        await runSegment({ ...segment, moves: WAIT });
        assert.ok(game[slot], `${role} starts with ${slot} worn`);
        const before = game.u.uac;
        const beforeMoves = game.moves;

        await runSegment({ ...segment, moves: `${WAIT}${TAKEOFF_KEY}` });
        assert.equal(topLine(), expected, role);
        assert.equal(game[slot], null, role);
        assert.equal(game.u.uac, before + acDelta, role);
        // armor_or_accessory_off() answers ECMD_TIME, so rhack() sets
        // context.move and the move loop advances the clock by one.
        assert.equal(game.moves, beforeMoves + 1, role);
        // armoroff() clears takeoff.mask on the way out, so the next command
        // starts from the same state the first one did.
        assert.equal(takeoffContext(game).mask, 0, role);
    }
});

test('two worn pieces prompt, and the second removal does not', async () => {
    // do_wear.c:1849 again, from the other side of the test. The Archeologist
    // wears a leather jacket and a fedora, so the first 'T' prompts with both
    // letters and the second, with one piece left, does not.
    const segment = segmentFor(`${TAKEOFF_KEY}c${WAIT}${TAKEOFF_KEY}`);

    await runSegment({ ...segment, moves: `${WAIT}${TAKEOFF_KEY}` });
    assert.equal(topLine(), 'What do you want to take off? [bc or ?*]');
    assert.ok(game.uarm && game.uarmh, 'both pieces are still worn');

    await runSegment({ ...segment, moves: `${WAIT}${TAKEOFF_KEY}c` });
    assert.equal(topLine(), 'You were wearing an uncursed +0 fedora.');
    assert.equal(game.uarmh, null);

    await runSegment({
        ...segment, moves: `${WAIT}${TAKEOFF_KEY}c${WAIT}${TAKEOFF_KEY}`,
    });
    assert.equal(topLine(), 'You were wearing an uncursed +0 leather jacket.');
    assert.equal(game.uarm, null);
});

test("an Archeologist's Luck drops when the fedora comes off", async () => {
    // do_wear.c:522-525. Helmet_on()'s matching change_luck(1) never runs for
    // a starting fedora, because u_init.c ini_inv_use_obj() calls setworn()
    // rather than Helmet_on(), so the loss is one-sided.
    const segment = segmentFor(`${TAKEOFF_KEY}c${WAIT}${TAKEOFF_KEY}`);

    await runSegment({ ...segment, moves: `${WAIT}${TAKEOFF_KEY}` });
    const before = game.u.uluck;

    await runSegment({ ...segment, moves: `${WAIT}${TAKEOFF_KEY}c` });
    assert.equal(game.u.uluck, before - 1);

    // The Knight's helmet carries oc_delay 1, so no other role can lose Luck
    // this way in this port; a Knight's small shield leaves Luck alone.
    const knight = segmentFor(`${TAKEOFF_KEY}e${WAIT}${TAKEOFF_KEY}e`);
    await runSegment({ ...knight, moves: `${WAIT}${TAKEOFF_KEY}` });
    const knightLuck = game.u.uluck;
    await runSegment({ ...knight, moves: `${WAIT}${TAKEOFF_KEY}e` });
    assert.equal(game.u.uluck, knightLuck);
});

test('an unworn answer is refused without spending a turn', async () => {
    // do_wear.c:1772-1775. equip_ok() answers GETOBJ_EXCLUDE_INACCESS for an
    // item that is not worn, which keeps it out of the advertised letters but
    // does not stop getobj() handing it back when the player types it.
    const segment = segmentFor(`${TAKEOFF_KEY}e${WAIT}${TAKEOFF_KEY}e`);

    await runSegment({ ...segment, moves: `${WAIT}${TAKEOFF_KEY}e${WAIT}` });
    const before = game.moves;

    await runSegment({
        ...segment, moves: `${WAIT}${TAKEOFF_KEY}e${WAIT}${TAKEOFF_KEY}e`,
    });
    assert.equal(topLine(), 'You are not wearing that.');
    assert.equal(game.moves, before);
    assert.equal(game.context.move, 0);
});

test('the empty-slot arm reports rather than prompting', async () => {
    // do_wear.c:1836-1846. Both counts are 0 once the Wizard's only piece is
    // off, so dotakeoff() answers ECMD_OK before it reaches getobj().
    const segment = segmentFor(`${TAKEOFF_KEY}${WAIT}${TAKEOFF_KEY}`);
    await runSegment({
        ...segment, moves: `${WAIT}${TAKEOFF_KEY}${WAIT}${TAKEOFF_KEY}`,
    });
    assert.equal(topLine(), 'Not wearing any armor or accessories.');
    assert.equal(game.context.move, 0);
});

test('the prompt can be reached by name and refuses an m prefix',
    async () => {
    const named = segmentFor(TAKEOFF_BY_NAME);
    await runSegment({ ...named, moves: `${WAIT}${TAKEOFF_BY_NAME}` });
    assert.equal(
        topLine(),
        'You were wearing an uncursed +0 cloak of magic resistance.',
    );

    const prefixed = segmentFor(
        `m${TAKEOFF_KEY}`, loadTakeOffOptionsRecipe(),
    );
    await runSegment({ ...prefixed, moves: `${WAIT}m${TAKEOFF_KEY}` });
    assert.equal(
        topLine(), "The takeoff command does not accept 'm' prefix.",
    );
    assert.ok(game.uarm, 'the prefix report leaves the ring mail worn');
});

test('off_msg is the only line flags.verbose gates', async () => {
    // do_wear.c:69-71. The removal itself is unconditional, so !verbose has
    // to leave the slot empty and the AC field moved with no message.
    const terse = segmentFor(TAKEOFF_KEY, loadTakeOffOptionsRecipe());
    assert.match(terse.nethackrc, /!verbose/);

    await runSegment({ ...terse, moves: WAIT });
    const before = game.u.uac;
    await runSegment({ ...terse, moves: `${WAIT}${TAKEOFF_KEY}` });
    assert.equal(topLine(), '');
    assert.equal(game.uarmc, null);
    assert.equal(game.u.uac, before + 1);
});

test('a cancelled prompt spends no turn', async () => {
    // invent.c getobj()'s quitchars arm, reached from the 'T' prompt. C's
    // dotakeoff() answers ECMD_CANCEL for it, which rhack() turns into
    // reset_cmd_vars() and no spent move.
    const segment = segmentFor(
        `${TAKEOFF_KEY}${ESCAPE_KEY}${WAIT}${TAKEOFF_KEY}${SPACE_KEY}`,
        loadTakeOffOptionsRecipe(),
    );
    await runSegment({ ...segment, moves: WAIT });
    const before = game.moves;

    for (const cancel of [ESCAPE_KEY, SPACE_KEY]) {
        await runSegment({
            ...segment, moves: `${WAIT}${TAKEOFF_KEY}${cancel}`,
        });
        assert.equal(topLine(), 'Never mind.', JSON.stringify(cancel));
        assert.equal(game.moves, before, JSON.stringify(cancel));
        assert.equal(game.context.move, 0, JSON.stringify(cancel));
        assert.ok(game.uarm && game.uarmh, 'both pieces are still worn');
    }
});

test('a letter no slot holds re-prompts', async () => {
    // invent.c getobj()'s not-carried arm. The Priest's pack ends at 'g', so
    // 'z' finds nothing, prints with a --More--, and the loop asks again.
    const segment = segmentFor(`${TAKEOFF_KEY}z${SPACE_KEY}b`);

    await runSegment({ ...segment, moves: `${WAIT}${TAKEOFF_KEY}z` });
    assert.equal(topLine(), "You don't have that object.--More--");

    await runSegment({
        ...segment, moves: `${WAIT}${TAKEOFF_KEY}z${SPACE_KEY}`,
    });
    assert.equal(topLine(), 'What do you want to take off? [bc or ?*]');

    await runSegment({
        ...segment, moves: `${WAIT}${TAKEOFF_KEY}z${SPACE_KEY}b`,
    });
    assert.equal(topLine(), 'You were wearing a +0 robe.');
    assert.equal(game.uarmc, null);
});

test('count_worn_stuff counts the outermost of cloak, suit and shirt',
    async () => {
    // do_wear.c:1746-1752. The comment there says why: with only the
    // outermost piece counted, a hero in a cloak over a suit can take the
    // cloak off without a confirmation.
    const segment = segmentFor(TAKEOFF_KEY);
    await runSegment({ ...segment, moves: WAIT });
    const cloak = game.uarmc;
    assert.ok(cloak, 'the Wizard starts in a cloak');

    // Wizard: cloak alone.
    assert.deepEqual(count_worn_stuff(false, game), {
        which: cloak, Narmorpieces: 1, Naccessories: 0,
    });

    // A suit added under the cloak still counts one, and `which` stays the
    // cloak because C's MOREWORN() skips uarm entirely when uarmc is set.
    const suit = { otyp: FEDORA, owornmask: W_ARM };
    game.uarm = suit;
    assert.deepEqual(count_worn_stuff(false, game), {
        which: cloak, Narmorpieces: 1, Naccessories: 0,
    });

    // A shirt under both is skipped as well.
    game.uarmu = { otyp: FEDORA, owornmask: W_ARMU };
    assert.equal(count_worn_stuff(false, game).Narmorpieces, 1);

    // Without the cloak the suit is the outermost and the shirt is still
    // skipped; without the suit as well, the shirt is counted.
    game.uarmc = null;
    assert.deepEqual(count_worn_stuff(false, game), {
        which: suit, Narmorpieces: 1, Naccessories: 0,
    });
    game.uarm = null;
    assert.equal(count_worn_stuff(false, game).Narmorpieces, 1);
    assert.equal(count_worn_stuff(false, game).which, game.uarmu);

    // The four independent slots each add one; helmet, shield, gloves and
    // boots are counted whatever else is worn.
    game.uarmh = { otyp: FEDORA, owornmask: W_ARMH };
    game.uarms = { otyp: FEDORA, owornmask: W_ARMS };
    assert.equal(count_worn_stuff(false, game).Narmorpieces, 3);
    // With more than one piece there is no default item, but C still writes
    // the last one it saw; dotakeoff() ignores it and prompts.
    assert.equal(count_worn_stuff(false, game).which, game.uarmu);

    // `accessorizing` switches which count decides `which`; the accessory
    // slots are counted either way. doremring() and doddoremarm() pass TRUE.
    const amulet = { otyp: AMULET_OF_ESP, owornmask: 0 };
    game.uamul = amulet;
    assert.deepEqual(count_worn_stuff(true, game), {
        which: amulet, Narmorpieces: 3, Naccessories: 1,
    });
    assert.equal(count_worn_stuff(false, game).Naccessories, 1);
    game.uamul = null;
    game.uarmh = null;
    game.uarms = null;
    game.uarmu = null;
    game.uarmc = cloak;
});

test('equip_ok classifies what the T prompt may offer', async () => {
    // do_wear.c:3404-3446, through takeoff_ok() (removing TRUE, accessory
    // FALSE). The Knight is the widest starting pack: four worn pieces, two
    // weapons and two stacks of food.
    const segment = segmentFor(`${TAKEOFF_KEY}e${WAIT}${TAKEOFF_KEY}e`);
    await runSegment({ ...segment, moves: WAIT });

    // The hands/self choice, which getobj() asks about with a null object.
    assert.equal(takeoff_ok(null, game), GETOBJ_EXCLUDE);

    // Worn armor is suggested; the same object once unworn is excluded as
    // inaccessible, which is the answer that keeps its letter out of the
    // prompt without stopping getobj() from returning it.
    const shield = game.uarms;
    assert.equal(takeoff_ok(shield, game), GETOBJ_SUGGEST);
    const wornmask = shield.owornmask;
    shield.owornmask = 0;
    assert.equal(takeoff_ok(shield, game), GETOBJ_EXCLUDE_INACCESS);
    shield.owornmask = wornmask;

    // A worn accessory is downplayed rather than suggested: 'T' is the armor
    // command, so C's `accessory ^ (oclass != ARMOR_CLASS)` sends every
    // non-armor worn item to the alternate-letter set.
    const ring = {
        oclass: RING_CLASS, otyp: RIN_ADORNMENT, owornmask: W_RINGL,
    };
    assert.equal(takeoff_ok(ring, game), GETOBJ_DOWNPLAY);
    // ... and the reverse for 'P' and 'R', which pass accessory TRUE.
    assert.equal(equip_ok(ring, true, true, game), GETOBJ_SUGGEST);
    assert.equal(equip_ok(shield, true, true, game), GETOBJ_DOWNPLAY);
    const amulet = {
        oclass: AMULET_CLASS, otyp: AMULET_OF_ESP, owornmask: W_AMUL,
    };
    assert.equal(equip_ok(amulet, true, true, game), GETOBJ_SUGGEST);

    // Two of the wearable exceptions outside the three classes: a blindfold
    // and lenses are tools, and C lists them so 'P' and 'R' can reach them.
    for (const otyp of [BLINDFOLD, LENSES]) {
        assert.equal(
            equip_ok(
                { oclass: TOOL_CLASS, otyp, owornmask: W_TOOL },
                true, true, game,
            ),
            GETOBJ_SUGGEST,
            `otyp ${otyp}`,
        );
    }
    // A worn tool that is none of the four exceptions is excluded outright.
    assert.equal(
        equip_ok(
            { oclass: TOOL_CLASS, otyp: 0, owornmask: W_TOOL },
            true, true, game,
        ),
        GETOBJ_EXCLUDE,
    );

    // The wear side needs canwearobj(), which is unported. It is reached with
    // removing FALSE and an unworn piece, because the is_worn test above
    // answers first for anything already on.
    assert.throws(
        () => equip_ok(
            { oclass: ARMOR_CLASS, otyp: FEDORA, owornmask: 0 },
            false, false, game,
        ),
        /canwearobj\(\)/,
    );
});

test('equip_ok hides a piece another piece covers', async () => {
    // do_wear.c:3437-3442 through inaccessible_equipment(). No role starts in
    // both a cloak and a suit, so this is the only place the rule is checked.
    const segment = segmentFor(TAKEOFF_KEY);
    await runSegment({ ...segment, moves: WAIT });
    const cloak = game.uarmc;
    const suit = {
        oclass: ARMOR_CLASS, otyp: FEDORA, owornmask: W_ARM, cursed: 0,
    };
    const shirt = {
        oclass: ARMOR_CLASS, otyp: FEDORA, owornmask: W_ARMU, cursed: 0,
    };
    game.uarm = suit;
    game.uarmu = shirt;

    // A cloak covers the suit, and cloak or suit covers the shirt.
    assert.equal(takeoff_ok(cloak, game), GETOBJ_SUGGEST);
    assert.equal(takeoff_ok(suit, game), GETOBJ_EXCLUDE_INACCESS);
    assert.equal(takeoff_ok(shirt, game), GETOBJ_EXCLUDE_INACCESS);
    game.uarmc = null;
    assert.equal(takeoff_ok(suit, game), GETOBJ_SUGGEST);
    assert.equal(takeoff_ok(shirt, game), GETOBJ_EXCLUDE_INACCESS);
    game.uarm = null;
    assert.equal(takeoff_ok(shirt, game), GETOBJ_SUGGEST);

    // only_if_known_cursed narrows "covered" to "covered by something known
    // to be cursed", which is how a ring under gloves is judged: C passes
    // (obj->oclass == RING_CLASS) for that argument.
    game.uarmc = cloak;
    game.uarm = suit;
    const wasCursed = cloak.cursed;
    const wasBknown = cloak.bknown;
    cloak.cursed = 0;
    cloak.bknown = 0;
    assert.equal(inaccessible_equipment(suit, null, false, game), true);
    assert.equal(inaccessible_equipment(suit, null, true, game), false);
    cloak.cursed = 1;
    assert.equal(inaccessible_equipment(suit, null, true, game), false);
    cloak.bknown = 1;
    assert.equal(inaccessible_equipment(suit, null, true, game), true);
    cloak.cursed = wasCursed;
    cloak.bknown = wasBknown;

    // A ring is judged against the gloves rather than against the cloak.
    // 'T' cannot reach this, but 'R' passes obj->oclass == RING_CLASS as
    // only_if_known_cursed, which is why C wrote the rule this way.
    const ring = {
        oclass: RING_CLASS, otyp: RIN_ADORNMENT, owornmask: W_RINGL,
        cursed: 0,
    };
    const gloves = {
        oclass: ARMOR_CLASS, otyp: LEATHER_GLOVES, owornmask: W_ARMG,
        cursed: 0,
    };
    game.uleft = ring;
    assert.equal(inaccessible_equipment(ring, null, false, game), false);
    game.uarmg = gloves;
    assert.equal(inaccessible_equipment(ring, null, false, game), true);
    assert.equal(inaccessible_equipment(ring, null, true, game), false);
    gloves.cursed = 1;
    gloves.bknown = 1;
    assert.equal(inaccessible_equipment(ring, null, true, game), true);
    // The same gloves on the other hand's ring, and on nothing else.
    game.uleft = null;
    game.uright = ring;
    assert.equal(inaccessible_equipment(ring, null, false, game), true);
    game.uright = null;
    assert.equal(inaccessible_equipment(ring, null, false, game), false);
    game.uarmg = null;

    // An object in no slot at all is never inaccessible, and neither is a
    // missing one: getobj() asks equip_ok() about a null object first.
    assert.equal(
        inaccessible_equipment({ owornmask: 0 }, null, false, game), false,
    );
    assert.equal(inaccessible_equipment(null, null, false, game), false);
    // The dip and grease callers, which supply a verb, are unported.
    assert.throws(
        () => inaccessible_equipment(suit, 'dip', false, game),
        /inaccessible_equipment\(\) messages/,
    );
    game.uarm = null;
    game.uarmu = null;
});

test('cursed armor cannot be taken off', async () => {
    // do_wear.c:1900-1916. u_init.c:1223 clears cursed on every starting
    // object and 'W' is unported, so no fresh C case can put a cursed piece
    // on a hero; this is the only check of the arm.
    const segment = segmentFor(TAKEOFF_KEY);
    await runSegment({ ...segment, moves: WAIT });
    const cloak = game.uarmc;

    assert.equal(await cursed(cloak, game), 0);
    assert.equal(takePendingTopLine(), '', 'an uncursed item prints nothing');
    cloak.bknown = 0;
    cloak.cursed = 1;
    assert.equal(await cursed(cloak, game), 1);
    assert.equal(takePendingTopLine(), "You can't.  It is cursed.");
    // set_bknown(otmp, 1) is the state change the message pays for.
    assert.ok(cloak.bknown);

    // use_plural picks the verb: boots, gloves, lenses and a stack of more
    // than one are "They are", everything else is "It is".
    const plural = [
        { oclass: ARMOR_CLASS, otyp: LOW_BOOTS, cursed: 1, quan: 1 },
        { oclass: ARMOR_CLASS, otyp: LEATHER_GLOVES, cursed: 1, quan: 1 },
        { oclass: TOOL_CLASS, otyp: LENSES, cursed: 1, quan: 1 },
        { oclass: ARMOR_CLASS, otyp: FEDORA, cursed: 1, quan: 2 },
    ];
    for (const obj of plural) {
        assert.equal(await cursed(obj, game), 1, `otyp ${obj.otyp}`);
        assert.equal(
            takePendingTopLine(), "You can't.  They are cursed.",
            `otyp ${obj.otyp}`,
        );
    }
    // One of each is enough for the two predicates the arm reads.
    assert.equal(is_boots(plural[0], game), true);
    assert.equal(is_gloves(plural[1], game), true);
    assert.equal(is_boots(plural[1], game), false);
    assert.equal(is_gloves(plural[0], game), false);
    // A helmet is neither, which is what leaves the fedora on "It is".
    const hat = { oclass: ARMOR_CLASS, otyp: FEDORA, cursed: 1, quan: 1 };
    assert.equal(is_boots(hat, game), false);
    assert.equal(is_gloves(hat, game), false);
    assert.equal(await cursed(hat, game), 1);
    assert.equal(takePendingTopLine(), "You can't.  It is cursed.");

    // select_off() reports the refusal by leaving takeoff.mask empty, and
    // armor_or_accessory_off() answers ECMD_OK for that.
    reset_remarm(game);
    await select_off(cloak, game);
    assert.equal(takeoffContext(game).mask, 0);
    assert.equal(await armor_or_accessory_off(cloak, game), ECMD_OK);
    assert.ok(game.uarmc, 'the cursed cloak stays on');

    // An uncursed cloak sets its own bit and comes off.
    cloak.cursed = 0;
    reset_remarm(game);
    await select_off(cloak, game);
    assert.equal(takeoffContext(game).mask, W_ARMC);
    reset_remarm(game);
});

test('a cursed outer layer keeps the layer under it on', async () => {
    // do_wear.c:2756-2776, the suit-and-shirt checks. No role wears two of
    // cloak, suit and shirt, so these arms are only reachable directly.
    const segment = segmentFor(TAKEOFF_KEY);
    await runSegment({ ...segment, moves: WAIT });
    const cloak = game.uarmc;
    cloak.cursed = 0;
    cloak.bknown = 0;
    const suit = {
        oclass: ARMOR_CLASS, otyp: LEATHER_JACKET, owornmask: W_ARM,
        cursed: 0, quan: 1, dknown: 1, known: 1,
    };
    // select_off() reads the slot, not the type, and objnam.c the() stops on
    // a capitalized name; both real shirts are "Hawaiian shirt" and
    // "T-shirt", so the shirt slot holds a lower-case name here and the stop
    // a real shirt reaches is checked separately below.
    const shirt = {
        oclass: ARMOR_CLASS, otyp: LEATHER_JACKET, owornmask: W_ARMU,
        cursed: 0, quan: 1, dknown: 1, known: 1,
    };
    game.uarm = suit;
    game.uarmu = shirt;

    // An uncursed cloak blocks neither, so select_off() sets the bit.
    for (const [obj, mask] of [[suit, W_ARM], [shirt, W_ARMU]]) {
        reset_remarm(game);
        await select_off(obj, game);
        assert.equal(takeoffContext(game).mask, mask);
    }

    // A cursed cloak blocks both, and names itself in each refusal.
    cloak.cursed = 1;
    for (const obj of [suit, shirt]) {
        reset_remarm(game);
        await select_off(obj, game);
        assert.equal(takeoffContext(game).mask, 0);
        assert.match(
            takePendingTopLine(),
            /^You cannot remove your cloak to take off the /,
        );
        // set_bknown() on the blocking item is what the refusal teaches.
        assert.ok(cloak.bknown);
    }
    cloak.cursed = 0;
    cloak.bknown = 0;

    // With the cloak clear, a cursed suit blocks only the shirt.
    suit.cursed = 1;
    reset_remarm(game);
    await select_off(suit, game);
    assert.equal(takeoffContext(game).mask, 0);
    assert.equal(takePendingTopLine(), "You can't.  It is cursed.");
    reset_remarm(game);
    await select_off(shirt, game);
    assert.equal(takeoffContext(game).mask, 0);
    assert.equal(
        takePendingTopLine(),
        'You cannot remove your suit to take off the leather jacket.',
    );

    // A real shirt reaches the same refusal, and stops in objnam.c the(),
    // whose proper-noun branch is unported: both shirt names are capitalized.
    game.uarmu = {
        oclass: ARMOR_CLASS, otyp: HAWAIIAN_SHIRT, owornmask: W_ARMU,
        cursed: 0, quan: 1, dknown: 1, known: 1,
    };
    reset_remarm(game);
    await assert.rejects(
        () => select_off(game.uarmu, game),
        /the\(\) for a name that may be a proper noun/,
    );
    game.uarmu = shirt;

    // A helmet is in neither layer, so the whole block is skipped for it.
    game.uarmh = {
        oclass: ARMOR_CLASS, otyp: FEDORA, owornmask: W_ARMH,
        cursed: 0, quan: 1,
    };
    reset_remarm(game);
    await select_off(game.uarmh, game);
    assert.equal(takeoffContext(game).mask, W_ARMH);

    reset_remarm(game);
    game.uarm = null;
    game.uarmu = null;
    game.uarmh = null;
});

test('setworn clears only the doffed slot from the take-off mask', async () => {
    // do_wear.c cancel_doff() (1642-1659), which worn.c:110 runs from inside
    // setworn() for the item leaving the slot. Its whole ported body is
    // `takeoff.mask &= ~slotmask`, and no removal path can show which bit that
    // takes: armor_or_accessory_off() runs reset_remarm() immediately before
    // armoroff(), so the mask is already 0 by the time <X>_off() calls
    // setworn(), and Cloak_off()'s own `mask &= ~W_ARMC` at do_wear.c:389
    // clears the same bit first in any case. Setting the other slots' bits by
    // hand is what separates the ported body from an empty one and from one
    // that cleared the whole mask.
    const segment = segmentFor(TAKEOFF_KEY);
    await runSegment({ ...segment, moves: WAIT });
    assert.ok(game.uarmc, 'the Wizard starts in a cloak');

    const others = W_ARM | W_ARMH | W_ARMS | W_ARMG | W_ARMF | W_ARMU;
    takeoffContext(game).mask = others | W_ARMC;
    setworn(null, W_ARMC, setwornEnv(game));
    assert.equal(game.uarmc, null, 'the cloak left its slot');
    assert.equal(takeoffContext(game).mask, others);

    // The same call with the slot already empty runs no cancel_doff() at all,
    // because worn.c:87 reaches it only for an item that was there.
    takeoffContext(game).mask = others | W_ARMC;
    setworn(null, W_ARMC, setwornEnv(game));
    assert.equal(takeoffContext(game).mask, others | W_ARMC);

    reset_remarm(game);
});

test('greased fingers get their own refusal', async () => {
    // do_wear.c:1907-1913. Nothing in the port grants Glib, so this arm has
    // no reachable input; the property is set by hand here because the arm is
    // real C behavior that would otherwise go unpinned.
    const segment = segmentFor(TAKEOFF_KEY);
    await runSegment({ ...segment, moves: WAIT });
    game.u.uprops[GLIB].intrinsic = 1;

    // Without gloves the message names fingers, and only a wielded weapon or
    // a worn ring reaches it: those are the slots grease is applied to.
    const ring = {
        oclass: RING_CLASS, otyp: RIN_ADORNMENT, owornmask: W_RINGL,
        cursed: 1, bknown: 1, quan: 1,
    };
    assert.equal(await cursed(ring, game), 1);
    assert.equal(
        takePendingTopLine(), "Despite your slippery fingers, you can't.",
    );
    // A worn cloak is in neither slot, so it keeps the ordinary refusal.
    const cloak = { ...game.uarmc, cursed: 1, bknown: 1, quan: 1 };
    assert.equal(await cursed(cloak, game), 1);
    assert.equal(takePendingTopLine(), "You can't.  It is cursed.");
    // So does a ring whose curse the hero has not learned yet.
    ring.bknown = 0;
    assert.equal(await cursed(ring, game), 1);
    assert.equal(takePendingTopLine(), "You can't.  It is cursed.");
    ring.bknown = 1;

    // With gloves on, only the wielded weapon reaches it, and the message
    // names the gloves instead. welded() needs the weapon cursed and in the
    // primary slot.
    game.uarmg = {
        oclass: ARMOR_CLASS, otyp: LEATHER_GLOVES, owornmask: W_ARMG,
        cursed: 0, dknown: 1,
    };
    assert.equal(await cursed(ring, game), 1);
    assert.equal(takePendingTopLine(), "You can't.  It is cursed.");
    const sword = {
        oclass: WEAPON_CLASS, otyp: LONG_SWORD, owornmask: W_WEP,
        cursed: 1, bknown: 1, quan: 1,
    };
    game.uwep = sword;
    assert.equal(await cursed(sword, game), 1);
    assert.equal(
        takePendingTopLine(), "Despite your slippery gloves, you can't.",
    );
    game.uwep = null;
    game.uarmg = null;
    game.u.uprops[GLIB].intrinsic = 0;
});

test('cursed() without an object stops', async () => {
    // do_wear.c:1894-1897 reports impossible() and answers 0; no caller in
    // this port can reach it, so the port stops instead of guessing.
    await assert.rejects(
        () => cursed(null, game),
        /cursed\(\) without otmp/,
    );
});

test('a covered piece is refused by armor_or_accessory_off', async () => {
    // do_wear.c:1777-1797. equip_ok() keeps a covered piece out of the
    // advertised letters, but typing its letter still reaches this arm.
    const segment = segmentFor(TAKEOFF_KEY);
    await runSegment({ ...segment, moves: WAIT });
    const cloak = game.uarmc;
    const suit = {
        oclass: ARMOR_CLASS, otyp: FEDORA, owornmask: W_ARM, cursed: 0,
    };
    const shirt = {
        oclass: ARMOR_CLASS, otyp: FEDORA, owornmask: W_ARMU, cursed: 0,
    };
    game.uarm = suit;
    game.uarmu = shirt;

    assert.equal(await armor_or_accessory_off(suit, game), ECMD_OK);
    assert.equal(
        takePendingTopLine(),
        "You can't take that off without taking off your cloak first.",
    );
    assert.equal(game.uarm, suit, 'the suit stays on');

    assert.equal(await armor_or_accessory_off(shirt, game), ECMD_OK);
    assert.equal(
        takePendingTopLine(),
        "You can't take that off without taking off your cloak and suit "
        + 'first.',
    );

    // Without the cloak the suit alone names itself.
    game.uarmc = null;
    assert.equal(await armor_or_accessory_off(shirt, game), ECMD_OK);
    assert.equal(
        takePendingTopLine(),
        "You can't take that off without taking off your suit first.",
    );
    // An unworn object never reaches the covered test at all.
    assert.equal(
        await armor_or_accessory_off({ owornmask: 0 }, game), ECMD_OK,
    );
    assert.equal(takePendingTopLine(), 'You are not wearing that.');
    game.uarmc = cloak;
    game.uarm = null;
    game.uarmu = null;
});

test('an accessory reaches the unported half of the command', async () => {
    // do_wear.c:1806-1826. select_off() stops on a ring one frame earlier,
    // so an amulet or a blindfold is what arrives here.
    const segment = segmentFor(TAKEOFF_KEY);
    await runSegment({ ...segment, moves: WAIT });
    const amulet = {
        oclass: AMULET_CLASS, otyp: AMULET_OF_ESP, owornmask: W_AMUL,
        cursed: 0,
    };
    game.uamul = amulet;
    await assert.rejects(
        () => armor_or_accessory_off(amulet, game),
        /Ring_off\(\)\/Amulet_off\(\)\/Blindf_off\(\)/,
    );
    game.uamul = null;

    const ring = {
        oclass: RING_CLASS, otyp: RIN_ADORNMENT, owornmask: W_RINGL,
        cursed: 0,
    };
    game.uleft = ring;
    await assert.rejects(
        () => armor_or_accessory_off(ring, game),
        /select_off\(\) ring checks/,
    );
    game.uleft = null;
});

test('a delayed piece stops before anything is drawn or removed', async () => {
    // The goal's declared limit: armoroff() ports only its no-delay branch at
    // do_wear.c:1973-2005, and the delay computed at 1923 decides. objects.h
    // gives SPLINT_MAIL 5, PLATE_MAIL 5 and ELVEN_MITHRIL_COAT 1, and the
    // Samurai starts in splint mail, so a fresh C case reaches the stop.
    const segment = segmentFor(TAKEOFF_KEY);
    const replay = await runSegment({ ...segment, moves: WAIT });
    const before = refusalWitness(replay);

    for (const otyp of [SPLINT_MAIL, PLATE_MAIL, ELVEN_MITHRIL_COAT]) {
        const suit = {
            oclass: ARMOR_CLASS, otyp, owornmask: W_ARM, cursed: 0,
        };
        game.uarm = suit;
        await assert.rejects(
            () => armoroff(suit, game),
            new RegExp(`armoroff\\(\\) delay -?\\d+ for otyp ${otyp}`),
            `otyp ${otyp}`,
        );
        assert.equal(game.uarm, suit, `otyp ${otyp} stays worn`);
        game.uarm = null;
    }
    assert.deepEqual(refusalWitness(replay), before);
});

test('the Samurai reaches the delay stop from a real keystroke', async () => {
    // Nothing has been drawn when it fires: the top line and the status row
    // are the ones the wait before it left, and no random draw was made.
    const segment = segmentFor(TAKEOFF_KEY);
    const samurai = {
        ...segment,
        nethackrc: segment.nethackrc.replace(
            /role:Wizard,race:human,gender:male,align:neutral/,
            'role:Samurai,race:human,gender:male,align:lawful',
        ),
    };
    const replay = await runSegment({ ...samurai, moves: WAIT });
    const before = refusalWitness(replay);

    const boundary = await boundaryFor(samurai, `${WAIT}${TAKEOFF_KEY}`);
    assert.match(boundary?.message ?? '', /armoroff\(\) delay -5 for otyp/);
    assert.deepEqual(refusalWitness(replay), before);
});

test('the unported slots and armor types stop at their own frame',
    async () => {
    const segment = segmentFor(TAKEOFF_KEY);
    // A Ranger's cloak of displacement: every cloak carries oc_delay 0, so
    // this one reaches Cloak_off() and stops on toggle_displacement().
    const ranger = {
        ...segment,
        nethackrc: segment.nethackrc.replace(
            /role:Wizard,race:human,gender:male,align:neutral/,
            'role:Ranger,race:human,gender:male,align:neutral',
        ),
    };
    let boundary = await boundaryFor(ranger, `${WAIT}${TAKEOFF_KEY}`);
    assert.match(
        boundary?.message ?? '',
        new RegExp(`Cloak_off\\(\\) for otyp ${CLOAK_OF_DISPLACEMENT}`),
    );

    // A Monk's leather gloves, answered at the prompt: select_off() stops on
    // better_not_take_that_off() before armoroff() sees the delay.
    const monk = segmentFor(`${TAKEOFF_KEY}b`);
    boundary = await boundaryFor(monk, `${WAIT}${TAKEOFF_KEY}a`);
    assert.match(boundary?.message ?? '', /select_off\(\) glove checks/);

    // Nothing in the port puts boots on a hero, so the boot frame is only
    // reachable directly.
    await runSegment({ ...segment, moves: WAIT });
    const boots = {
        oclass: ARMOR_CLASS, otyp: LOW_BOOTS, owornmask: W_ARMF, cursed: 0,
    };
    game.uarmf = boots;
    await assert.rejects(
        () => select_off(boots, game), /select_off\(\) boot checks/,
    );
    game.uarmf = null;
});

test('the type guards inside the ported <X>_off arms hold', async () => {
    const segment = segmentFor(TAKEOFF_KEY);
    const replay = await runSegment({ ...segment, moves: WAIT });
    const cloak = game.uarmc;
    // Read out before the mutation below, because `before` now holds a copy
    // of the field rather than the object that carries it.
    const originalOtyp = cloak.otyp;
    const before = refusalWitness(replay);

    // Armor_off(): only a leather jacket has oc_delay 0, so any other suit
    // arriving would mean armoroff()'s delay test had let it through.
    game.uarm = {
        oclass: ARMOR_CLASS, otyp: PLATE_MAIL, owornmask: W_ARM,
    };
    assert.throws(
        () => Armor_off(game),
        new RegExp(`Armor_off\\(\\) for otyp ${PLATE_MAIL}`),
    );
    game.uarm = null;

    // Cloak_off(): the guard runs before setworn(), so the cloak is still on
    // after the stop.
    cloak.otyp = CLOAK_OF_DISPLACEMENT;
    assert.throws(() => Cloak_off(game), /Cloak_off\(\) for otyp/);
    assert.equal(game.uarmc, cloak, 'the cloak stays on');
    cloak.otyp = originalOtyp;
    assert.equal(cloak.otyp, CLOAK_OF_MAGIC_RESISTANCE, 'and unedited');
    assert.deepEqual(refusalWitness(replay), before);
});

test('a paranoid_confirmation game stops rather than guessing', async () => {
    // options.c optfn_paranoid_confirmation() is unported, so
    // flags.paranoia_bits never learns about PARANOID_REMOVE and reading it
    // would answer FALSE for a game that asked C to prompt.
    const segment = segmentFor(TAKEOFF_KEY);
    const paranoid = {
        ...segment,
        nethackrc: `${segment.nethackrc}OPTIONS=paranoid_confirmation:Remove\n`,
    };
    const boundary = await boundaryFor(paranoid, `${WAIT}${TAKEOFF_KEY}`);
    assert.match(boundary?.message ?? '', /optfn_paranoid_confirmation\(\)/);

    // Without the option the default bits decide, and they do not hold
    // PARANOID_REMOVE, so the one-piece Wizard is not prompted.
    await runSegment({ ...segment, moves: WAIT });
    assert.equal(game.flags.paranoid_confirmation, undefined);
    assert.equal(game.flags.paranoia_bits & PARANOID_REMOVE, 0);
    assert.equal(await dotakeoff(game), ECMD_TIME);
    assert.equal(game.uarmc, null);

    // With the bit set by hand, the same one-piece hero is prompted instead.
    // An Escape is queued for the prompt to read, so what the command reports
    // is getobj() cancelled -- "Never mind.", ECMD_CANCEL and the cloak still
    // worn -- rather than any throw that reaching getobj() might raise.
    await runSegment({ ...segment, moves: WAIT });
    game.flags.paranoia_bits |= PARANOID_REMOVE;
    game.nhDisplay.pushKey(ESCAPE_KEY.charCodeAt(0));
    assert.equal(await dotakeoff(game), ECMD_CANCEL);
    assert.equal(takePendingTopLine(), 'Never mind.');
    assert.ok(game.uarmc, 'the prompt left the cloak on');
    game.flags.paranoia_bits &= ~PARANOID_REMOVE;
});

test('taking armor off clears what monsters had seen it resist',
    async () => {
    // worn.c:170 monstunseesu_prop(), which setworn() reaches for the
    // property the removed item granted. The Wizard's cloak grants ANTIMAGIC,
    // which mondata.c cvt_prop_to_mseenres() maps to M_SEEN_MAGR.
    const segment = segmentFor(`${TAKEOFF_KEY}${ESCAPE_KEY}${WAIT}`
        + `${TAKEOFF_KEY}${SPACE_KEY}`, loadTakeOffOptionsRecipe());
    await runSegment({ ...segment, moves: WAIT });
    const pet = game.level.monlist;
    assert.ok(pet, 'the pettype:dog segment puts a monster on the level');

    pet.seen_resistance = M_SEEN_MAGR | M_SEEN_ELEC;
    monstunseesu(M_SEEN_MAGR, game);
    assert.equal(pet.seen_resistance, M_SEEN_ELEC);

    // monst.h:214 DEADMONSTER() is `mhp < 1`, so a monster on its last hit
    // point is still watching.
    pet.seen_resistance = M_SEEN_MAGR;
    const alive = pet.mhp;
    pet.mhp = 1;
    monstunseesu(M_SEEN_MAGR, game);
    assert.equal(pet.seen_resistance, M_SEEN_NOTHING);
    pet.mhp = alive;

    // A property with no M_SEEN_foo of its own clears nothing.
    pet.seen_resistance = M_SEEN_MAGR;
    monstunseesu(M_SEEN_NOTHING, game);
    assert.equal(pet.seen_resistance, M_SEEN_MAGR);

    // Neither does a dead monster lose what it saw.
    const hp = pet.mhp;
    pet.mhp = 0;
    monstunseesu(M_SEEN_MAGR, game);
    assert.equal(pet.seen_resistance, M_SEEN_MAGR);
    pet.mhp = hp;

    // A swallowed hero is seen by nobody.
    game.u.uswallow = 1;
    monstunseesu(M_SEEN_MAGR, game);
    assert.equal(pet.seen_resistance, M_SEEN_MAGR);
    game.u.uswallow = 0;
    monstunseesu(M_SEEN_MAGR, game);
    assert.equal(pet.seen_resistance, M_SEEN_NOTHING);

    // The four terms of vision.h m_canseeu(), one at a time. Each is set by
    // hand: nothing in the port turns the hero invisible, puts her underwater
    // or gives a starting pet see-invisible.
    const invis = game.u.uprops[INVIS];
    const clears = () => {
        pet.seen_resistance = M_SEEN_MAGR;
        monstunseesu(M_SEEN_MAGR, game);
        return pet.seen_resistance === M_SEEN_NOTHING;
    };

    // youprop.h:198 Invis: either source, minus the blocked term.
    invis.intrinsic = 1;
    assert.equal(clears(), false, 'an invisible hero is not watched');
    invis.intrinsic = 0;
    invis.extrinsic = 1;
    assert.equal(clears(), false, 'an extrinsic source hides her too');
    invis.blocked = 1;
    assert.equal(clears(), true, 'a blocked source does not');
    invis.blocked = 0;

    // mondata.h:81 perceives(): a monster with M1_SEE_INVIS watches anyway.
    const mflags1 = pet.data.mflags1;
    pet.data = { ...pet.data, mflags1: mflags1 | M1_SEE_INVIS };
    assert.equal(clears(), true);
    pet.data = { ...pet.data, mflags1 };
    assert.equal(clears(), false);
    invis.extrinsic = 0;

    // youprop.h:279 Underwater, which is the bare u.uinwater field.
    game.u.uinwater = 1;
    assert.equal(clears(), false);
    game.u.uinwater = 0;

    // couldsee(): a monster off the lit part of the map sees nothing.
    const [mx, my] = [pet.mx, pet.my];
    pet.mx = 0;
    pet.my = 0;
    assert.equal(clears(), false);
    pet.mx = mx;
    pet.my = my;
    assert.equal(clears(), true);
});
