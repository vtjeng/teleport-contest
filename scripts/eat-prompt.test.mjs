import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMITTED_COMMANDS } from '../js/cmd.js';
import {
    ECMD_OK,
    EXT_ENCUMBER,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_NONINVENT,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    LAVAPOOL,
    PIT,
    POOL,
    STRANGLED,
} from '../js/const.js';
import { doeat, floorfood, is_edible } from '../js/eat.js';
import { flush_screen } from '../js/display.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { near_capacity, weight_cap } from '../js/hack.js';
import { _getobjInternals, getobj } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_FIRE_ELEMENTAL,
    PM_GELATINOUS_CUBE,
    PM_GHOUL,
    PM_HUMAN,
    PM_LICHEN,
    PM_RUST_MONSTER,
    monst_globals_init,
} from '../js/monsters.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    AMULET_OF_YENDOR,
    BELL_OF_OPENING,
    BULLWHIP,
    CANDELABRUM_OF_INVOCATION,
    COIN_CLASS,
    CORPSE,
    FOOD_CLASS,
    FOOD_RATION,
    EGG,
    GOLD_PIECE,
    SILVER_SABER,
    SPEAR,
    SPE_BOOK_OF_THE_DEAD,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import {
    ESCAPE_KEY,
    loadEatPromptOptionsRecipe,
    loadEatPromptRecipe,
} from './run-eat-prompt.mjs';

const { compactify, getobj_hands_txt, invletter_value } = _getobjInternals;

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The lower of the two status rows, which carries every field bot() rewrites
// when disp.botl is set.
function statusRow() {
    return game.nhDisplay.grid[23].map(({ ch }) => ch).join('').trimEnd();
}

// The top line a call made outside moveloop_core() produced. Nothing has
// flushed the screen yet, so the grid still holds the previous frame; this is
// the text the next flush would paint onto row 0.
function pendingTopLine() {
    return game._pending_message ?? '';
}

// Locate a segment by the keys it types, so reordering the matrix cannot
// silently point a test at a different case.
function segmentFor(moves, recipe = loadEatPromptRecipe()) {
    const found = recipe.segments.find(
        (segment) => segment.moves === `.${moves}.`,
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

// compactify() rewrites its buffer in place and stops at the NUL terminator,
// so each case is spelled the way C spells it.
function compacted(text) {
    const buf = [...text, '\0'];
    compactify(buf);
    return buf.slice(0, buf.indexOf('\0')).join('');
}

test('compactify collapses a run of three or more consecutive letters', () => {
    // invent.c:1626-1659. Every expectation below was produced by compiling
    // that function on its own -- the body copied out of invent.c with
    // NOINVSYM defined and a main() that prints its result -- rather than by
    // running the port. getobj() calls it only for `suggested > 5`, but the
    // algorithm collapses any run of three, which is what these pin.
    for (const [input, expected] of [
        // The recorded Tourist prompt: six consecutive comestible letters.
        ['bcdefg', 'b-g'],
        // The shortest run the algorithm collapses at all.
        ['abc', 'a-c'],
        // Two consecutive letters are left alone; so is a broken run.
        ['ab', 'ab'],
        ['abd', 'abd'],
        // A run that starts after an unrelated letter, and one that ends
        // before one, so the '-' is not simply written at a fixed position.
        ['zabc', 'za-c'],
        ['abcz', 'a-cz'],
        // Two separate runs in one buffer.
        ['abcxyz', 'a-cx-z'],
        // hack.h:575 NOINVSYM: three or more '#' overflow letters become
        // "#-#", which is invent.c:1642-1648's own arm rather than the
        // consecutive-letter one.
        ['###', '#-#'],
        ['####', '#-#'],
        ['#####', '#-#'],
        ['a###', 'a#-#'],
        ['###a', '#-#a'],
        // The three that reach the second '#' arm -- the `--i2` at
        // invent.c:1647 -- with its three conjuncts taking mixed values, so
        // each of them is load-bearing rather than implied by its neighbour.
        ['####-#', '#-#-#'],
        ['###--#', '#-#--#'],
        ['###a-#', '#-#a-#'],
    ]) {
        assert.equal(compacted(input), expected, input);
    }
});

test('invletter_value orders gold, lowercase, uppercase and overflow', () => {
    // invent.c:390-399, with invlet_basic == 52.
    assert.equal(invletter_value('$'), 1);
    assert.equal(invletter_value('a'), 2);
    assert.equal(invletter_value('z'), 27);
    assert.equal(invletter_value('A'), 28);
    assert.equal(invletter_value('Z'), 53);
    assert.equal(invletter_value('#'), 54);
    // "none of the above (shouldn't happen)" sorts after everything.
    assert.equal(invletter_value('!'), 55);
});

function catalogState() {
    const state = {};
    monst_globals_init(state);
    objects_globals_init(state);
    // you.h:554 spells Upolyd (u.umonnum != u.umonster), so an unpolymorphed
    // hero is the pair holding the same monster index that u_init.c writes.
    // mtimedone stays 0 throughout: the macro does not read the polymorph
    // timer, and the test below moves umonnum alone.
    state.u = { umonnum: 0, umonster: 0, mtimedone: 0 };
    state.youmonst = { data: state.mons[0] };
    return state;
}

// catalogState() with the youmonst set to a human (PM_HUMAN = 260), so
// body_part() returns the humanoid body-part names the C source uses in its
// Sprintf calls.
function humanState() {
    const state = catalogState();
    state.youmonst = { data: state.mons[PM_HUMAN] };
    return state;
}

// C ref: invent.c getobj_hands_txt() (1717-1736). Each case below pins the
// result to the Sprintf format string in the C source. The hero is an
// unpolymorphed human, so body_part(HAND) = "hand", body_part(FINGERTIP) =
// "fingertip", and fingers_or_gloves(FALSE) = "fingers".
test('getobj_hands_txt returns the correct hand description per action', () => {
    const state = humanState();
    // Default branch (no special action word): "your hands".
    // Exercises the else branch at C:1732-1734 for any action not in
    // the if/else-if chain.
    state.uarmg = null;
    state.uwep = null;
    state.uquiver = null;
    assert.equal(getobj_hands_txt('use or apply', state), 'your hands');
    assert.equal(getobj_hands_txt('eat', state), 'your hands');

    // C:1721-1722 -- "grease" uses fingers_or_gloves(FALSE), which always
    // returns makeplural(body_part(FINGER)) regardless of gloves.
    assert.equal(getobj_hands_txt('grease', state), 'your fingers');

    // C:1723-1724 -- "write with" uses body_part(FINGERTIP).
    assert.equal(getobj_hands_txt('write with', state), 'your fingertip');

    // C:1725-1728 -- "wield" with no gloves and no weapon.
    assert.equal(
        getobj_hands_txt('wield', state), 'your bare hands (wielded)',
    );

    // C:1725-1728 -- "wield" with gloves and a weapon: no "(wielded)" suffix.
    state.uarmg = { otyp: 1 };
    state.uwep = { otyp: 1 };
    assert.equal(getobj_hands_txt('wield', state), 'your gloved hands');

    // C:1729-1731 -- "ready" with no quiver.
    state.uarmg = null;
    state.uwep = null;
    state.uquiver = null;
    assert.equal(
        getobj_hands_txt('ready', state), 'empty quiver (nothing readied)',
    );

    // C:1729-1731 -- "ready" with something readied: no parenthetical.
    state.uquiver = { otyp: 1 };
    assert.equal(getobj_hands_txt('ready', state), 'empty quiver');
});

test('is_edible answers on object class and excludes unique objects', () => {
    const state = catalogState();
    // eat.c:91-121. FOOD_CLASS is the only class an unpolymorphed hero can
    // eat.
    assert.equal(
        is_edible({ otyp: FOOD_RATION, oclass: FOOD_CLASS }, state), true,
    );
    assert.equal(
        is_edible({ otyp: SPEAR, oclass: WEAPON_CLASS }, state), false,
    );

    // The oc_unique test reads objects[otyp], and the class answer reads
    // obj->oclass, so only an object pairing a unique type with FOOD_CLASS
    // tells the two apart. objects.c has none -- the four unique types are the
    // Amulet, two invocation tools and the Book of the Dead -- which is why
    // the pairing is fabricated here and why deleting the test would change no
    // The pairing is fabricated because the ordinary object table has no
    // unique food; the form-dependent arms below use real object definitions.
    assert.deepEqual(
        state.objects
            .map((type, otyp) => ({ type, otyp }))
            .filter(({ type }) => type.oc_unique)
            .map(({ otyp }) => otyp),
        [AMULET_OF_YENDOR, CANDELABRUM_OF_INVOCATION, BELL_OF_OPENING,
            SPE_BOOK_OF_THE_DEAD],
    );
    assert.equal(
        is_edible(
            { otyp: AMULET_OF_YENDOR, oclass: FOOD_CLASS }, state,
        ),
        false,
    );
});

test('is_edible admits fire-elemental flammable objects', () => {
    const state = catalogState();
    state.u.umonnum = PM_FIRE_ELEMENTAL;
    state.youmonst.data = state.mons[PM_FIRE_ELEMENTAL];
    // eat.c:99-101 accepts a flammable non-food object, while its material
    // guard still rejects a metallic spear.
    assert.equal(
        is_edible({ otyp: BULLWHIP, oclass: WEAPON_CLASS }, state), true,
    );
    assert.equal(
        is_edible({ otyp: SPEAR, oclass: WEAPON_CLASS }, state), false,
    );
});

test('is_edible applies the metallivore rust-prone exception', () => {
    const state = catalogState();
    state.u.umonnum = PM_RUST_MONSTER;
    state.youmonst.data = state.mons[PM_RUST_MONSTER];
    // C accepts iron for a rust monster, but silver is metallic without being
    // rust-prone. Both are non-food objects, so the source arm is observable.
    assert.equal(
        is_edible({ otyp: SPEAR, oclass: WEAPON_CLASS }, state), true,
    );
    assert.equal(
        is_edible({ otyp: SILVER_SABER, oclass: WEAPON_CLASS }, state), false,
    );
});

test('is_edible gives ghouls the corpse and egg diet', () => {
    const state = catalogState();
    state.u.umonnum = PM_GHOUL;
    state.youmonst.data = state.mons[PM_GHOUL];
    // Human flesh is non-vegan; lichen is vegan. C's egg arm is independent
    // of the corpse species and admits an egg even for a vegan species.
    assert.equal(
        is_edible({ otyp: CORPSE, oclass: FOOD_CLASS, corpsenm: PM_HUMAN }, state),
        true,
    );
    assert.equal(
        is_edible({ otyp: CORPSE, oclass: FOOD_CLASS, corpsenm: PM_LICHEN }, state),
        false,
    );
    assert.equal(
        is_edible({ otyp: EGG, oclass: FOOD_CLASS }, state), true,
    );
});

test('is_edible gives a gelatinous cube empty organic objects', () => {
    const state = catalogState();
    state.u.umonnum = PM_GELATINOUS_CUBE;
    state.youmonst.data = state.mons[PM_GELATINOUS_CUBE];
    // eat.c:114-118 uses is_organic and Has_contents before the final class
    // test. A leather bullwhip is organic and empty; contents disqualify it.
    assert.equal(
        is_edible({ otyp: BULLWHIP, oclass: WEAPON_CLASS }, state), true,
    );
    assert.equal(
        is_edible({ otyp: BULLWHIP, oclass: WEAPON_CLASS, cobj: {} }, state), false,
    );
    assert.equal(
        is_edible({ otyp: SPEAR, oclass: WEAPON_CLASS }, state), false,
    );
});

test('the eat command is admitted and shares extcmdlist row with doeat',
    () => {
    assert.ok(ADMITTED_COMMANDS.includes('eat'));
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'eat');
    assert.ok(row, 'extcmdlist[] has an eat row');
    assert.equal(row.ef_funct, 'doeat');
});

test('the eat prompt lists the suggested letters and spends no turn',
    async () => {
    const segment = segmentFor('ea');

    // The prompt getobj() builds from the pack: one suggested letter for a
    // Valkyrie's single food ration, then the fixed " or ?*]" tail. The cursor
    // sits one column past the trailing space tty_yn_function() appends.
    await runSegment({ ...segment, moves: '.e' });
    assert.equal(topLine(), 'What do you want to eat? [d or ?*]');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [35, 0],
    );

    // C's svm.moves is state.moves in this port; state.svm carries mvitals
    // alone, so the turn counter has to be read from the flattened field.
    const beforeMoves = game.moves;
    await runSegment({ ...segment, moves: '.ea' });
    assert.equal(topLine(), 'You cannot eat that!');
    assert.equal(game.moves, beforeMoves);
    assert.equal(game.context.move, 0);
});

test('a five-letter suggestion set is left uncompacted', async () => {
    // The `suggested > 5` gate at invent.c:1908. This Tourist carries exactly
    // five comestible slots and the next one carries six, so the two segments
    // sit either side of the boundary.
    await runSegment({ ...segmentFor(`e$.e${ESCAPE_KEY}`), moves: '.e' });
    assert.equal(topLine(), 'What do you want to eat? [bcdef or ?*]');

    await runSegment({ ...segmentFor('e$.ea'), moves: '.e' });
    assert.equal(topLine(), 'What do you want to eat? [b-g or ?*]');
});

test('the menu answers to the eat prompt reach display_pickinv',
    async () => {
    const segment = segmentFor('ea');
    // getobj()'s redo_menu block now handles all callers with the general
    // C computation (invent.c:1960-2001). '?' passes the suggested-letter
    // subset, and '*' passes the full inventory. For a single-food-item
    // Valkyrie, '?' shows the item on the message line via the n=1 path
    // in display_pickinv(). Neither stops at a boundary.
    for (const key of ['?', '*']) {
        const boundary = await boundaryFor(segment, `.e${key}`);
        assert.equal(boundary, null,
            `'${key}' at eat prompt should not hit a boundary`);
    }
    // '-' reaches mime_action(), which emits C's present-participle feedback.
    const hands = await boundaryFor(segment, '.e-');
    assert.equal(hands, null);
    assert.equal(topLine(), 'You mime eating something.');
});

test('a gold answer is judged on the callback, not on the letter',
    async () => {
    // invent.c:2005-2016. Three distinct answers share this arm.
    const segment = segmentFor('ea');

    // '$' with no gold slot: the arm is entered on the letter alone, finds no
    // object, and falls through to the not-carried message rather than
    // asking eat_ok() about a null object.
    await runSegment({ ...segment, moves: '.e$' });
    assert.equal(topLine(), "You don't have that object.--More--");

    // A letter neither carried nor '$' does not enter the arm at all.
    await runSegment({ ...segment, moves: '.ez' });
    assert.equal(topLine(), "You don't have that object.--More--");

    // '$' over a real gold slot: eat_ok() answers GETOBJ_EXCLUDE, which is
    // the smallest of hack.h's six values, so `<= GETOBJ_EXCLUDE` holds and
    // getobj() refuses the class by name instead of handing the coins back
    // for doeat() to call inedible.
    await runSegment({ ...segmentFor('e$.ea'), moves: '.e$' });
    assert.equal(topLine(), 'You cannot eat gold.');

    // The class test beside the letter test is what invent.c:1998-2000 calls
    // a guard against the hypothetical second gold slot, so only coins under
    // some other letter separate the two. assigninvlet() gives '$' to every
    // coin stack, which is why this slot is put there by hand.
    await runSegment({ ...segmentFor('ea'), moves: '.' });
    game.invent = {
        oclass: COIN_CLASS, otyp: GOLD_PIECE, invlet: 'q', quan: 7, owt: 0,
        nobj: game.invent,
    };
    game.nhDisplay.pushKey('q'.charCodeAt(0));
    assert.equal(await doeat(game), ECMD_OK);
    assert.equal(pendingTopLine(), 'You cannot eat gold.');
});

test('an accepted letter marks the bottom line for redraw', async () => {
    // invent.c:2048's `disp.botl = TRUE`, whose comment reads "May have
    // changed the amount of money". Nothing this slice reaches changes it --
    // taking a count on gold needs GETOBJ_ALLOWCNT, which getobj() refuses --
    // so the write is pinned through a status field changed by hand instead,
    // exactly as a pending change would be when the letter is accepted.
    await runSegment({ ...segmentFor('ea'), moves: '.' });
    await flush_screen(1);
    game.u.uhp = 3;
    game.disp.botl = false;
    game.nhDisplay.pushKey('a'.charCodeAt(0));
    assert.equal(await doeat(game), ECMD_OK);
    await flush_screen(1);
    assert.equal(
        statusRow(),
        'Dlvl:1 $:0 HP:3(16) Pw:2(2) AC:6 Xp:1',
    );
});

// A getobj() callback that answers `forNone` for the hands/self choice and
// `forObject` for every carried object, which is how invent.c's callbacks are
// shaped. eat_ok() answers only two of the six values for a null object, so
// the arms the others reach need a callback of their own.
function callback(forNone, forObject) {
    return (obj) => (obj ? forObject : forNone);
}

// The line getobj() left: the message when it declined to ask, and otherwise
// the prompt show_topl() painted. flags.verbose is cleared so the queued
// Escape cancels without printing Never_mind over the prompt, which is what
// leaves it on row 0 to be read back.
async function promptFor(forNone, forObject = GETOBJ_EXCLUDE_SELECTABLE) {
    await runSegment({ ...segmentFor('ea'), moves: '.' });
    game.flags.verbose = false;
    game.nhDisplay.pushKey(0x1B);
    await getobj('eat', callback(forNone, forObject), GETOBJ_NOFLAGS, game);
    return pendingTopLine() || topLine();
}

test('the hands answer decides whether getobj prompts at all', async () => {
    // invent.c:1826-1855, the switch over obj_ok(null). Each arm changes the
    // prompt or replaces it with the not-carrying message, so the answer the
    // callback gives for the hands/self choice is visible without '-' ever
    // being typed.

    // GETOBJ_SUGGEST puts "- " in front of the letters and sets allownone, so
    // the prompt is offered even though no object was suggested. The trailing
    // space is retained in _pending_message through tty_yn_function() cleanup.
    assert.equal(
        await promptFor(GETOBJ_SUGGEST),
        'What do you want to eat? [- or ?*] ',
    );
    // With the Valkyrie's four slots suggested too, the same space survives.
    assert.equal(
        await promptFor(GETOBJ_SUGGEST, GETOBJ_SUGGEST),
        'What do you want to eat? [- abcd or ?*] ',
    );
    // GETOBJ_DOWNPLAY sets allownone without advertising '-'.
    assert.equal(
        await promptFor(GETOBJ_DOWNPLAY),
        'What do you want to eat? [*] ',
    );
    // GETOBJ_EXCLUDE_NONINVENT clears forceprompt and counts an inaccessible
    // alternative, which is what puts "else" into the message.
    assert.equal(
        await promptFor(GETOBJ_EXCLUDE_NONINVENT),
        "You don't have anything else to eat.",
    );
    // GETOBJ_EXCLUDE leaves allownone clear, so the same pack produces the
    // message without "else".
    assert.equal(
        await promptFor(GETOBJ_EXCLUDE),
        "You don't have anything to eat.",
    );
    // A downplayed object is kept out of the letters but sets forceprompt, so
    // the prompt appears with no letters at all.
    assert.equal(
        await promptFor(GETOBJ_EXCLUDE, GETOBJ_DOWNPLAY),
        'What do you want to eat? [*] ',
    );
});

test('the strangled hero never reaches the prompt', async () => {
    await runSegment({ ...segmentFor('ea'), moves: '.' });
    // youprop.h:110 defines Strangled as u.uprops[STRANGLED].intrinsic, which
    // is a timeout rather than a flag. Only an amulet of strangulation sets
    // it, and wearing one is unported, so this is set by hand. No key is
    // queued, so a doeat() that reached floorfood() would throw on the empty
    // input queue instead of answering.
    game.u.uprops[STRANGLED] = {
        ...game.u.uprops[STRANGLED], intrinsic: 6,
    };
    assert.equal(await doeat(game), ECMD_OK);
    assert.equal(
        pendingTopLine(),
        "If you can't breathe air, how can you consume solids?",
    );
});

// Start one of the matrix's Valkyries, load her pack to a chosen encumbrance,
// and queue the key that will answer the eat prompt. Each call is a fresh
// game, because a second doeat() in the same one would open --More-- over the
// first one's message.
//
// hack.c capacity_from_excess() answers `trunc(excess * 2 / wc) + 1`, where
// excess is the pack's weight less the carrying capacity, so `level` covers
// the excesses from `(level - 1) * wc / 2` up to `level * wc / 2`. The weight
// below aims at the middle of that band, and the first slot absorbs whatever
// the rest of the pack already weighs.
async function loadedHero(answer, level) {
    await runSegment({ ...segmentFor('ea'), moves: '.' });
    const capacity = weight_cap(game);
    let rest = 0;
    for (let obj = game.invent.nobj; obj; obj = obj.nobj) rest += obj.owt ?? 0;
    game.invent.owt =
        Math.trunc(capacity * (1 + (2 * level - 1) / 4)) - rest;
    assert.equal(near_capacity(game), level);
    game.nhDisplay.pushKey(answer.charCodeAt(0));
}

test('capacity is checked after the prompt, not before', async () => {
    // hack.c:4398-4408 tests near_capacity() >= EXT_ENCUMBER, and doeat()
    // calls it only after floorfood() has asked. Escape answers the prompt, so
    // floorfood() returns null and doeat() returns at its own test: the
    // capacity line must not appear.
    await loadedHero(ESCAPE_KEY, EXT_ENCUMBER);
    assert.equal(await doeat(game), ECMD_OK);
    assert.equal(pendingTopLine(), 'Never mind.');

    // Answering with a carried non-food reaches check_capacity(), which
    // refuses at exactly EXT_ENCUMBER, before doeat() can say the object is
    // inedible.
    await loadedHero('a', EXT_ENCUMBER);
    assert.equal(await doeat(game), ECMD_OK);
    assert.equal(
        pendingTopLine(),
        "You can't do that while carrying so much stuff.",
    );

    // One step below it the command proceeds, so the test really is `>=` on
    // that value rather than on any smaller load.
    await loadedHero('a', EXT_ENCUMBER - 1);
    assert.equal(await doeat(game), ECMD_OK);
    assert.equal(pendingTopLine(), 'You cannot eat that!');
});

test('floorfood preserves metallivore and liquid branch ordering', async () => {
    const segment = segmentFor('ea');

    // An edible object on the hero's square: C asks "There is <object> here;
    // eat it?" through yn_function().  Answering 'y' returns the object;
    // answering 'q' returns null.
    await runSegment({ ...segment, moves: '.' });
    const floorFood = {
        otyp: FOOD_RATION, oclass: 7, quan: 1, nexthere: null,
    };
    game.level.objects[game.u.ux][game.u.uy] = floorFood;
    game.nhDisplay.pushKey('y'.charCodeAt(0));
    assert.equal(await floorfood('eat', 0, game), floorFood);

    game.nhDisplay.pushKey('q'.charCodeAt(0));
    assert.equal(await floorfood('eat', 0, game), null);
    clearTtyMessageWindow(game);

    // A metallivorous hero reaches the bear-trap, iron-bars and gold checks
    // before the ordinary inventory selector. With no such floor feature,
    // Escape at that selector returns null; the form is read from mons[] as
    // C's metallivorous() does.
    game.youmonst.data = game.mons[PM_RUST_MONSTER];
    game.level.objects[game.u.ux][game.u.uy] = null;
    game.nhDisplay.pushKey(0x1B);
    assert.equal(await floorfood('eat', 0, game), null);
    clearTtyMessageWindow(game);

    // C skips the floor on liquid when Wwalking, clinging, or flying without
    // Breathless. The normal unmodified hero falls through to the inventory
    // selector; Escape confirms the same result on both terrain types.
    game.level.at(game.u.ux, game.u.uy).typ = POOL;
    game.nhDisplay.pushKey(0x1B);
    assert.equal(await floorfood('eat', 0, game), null);
    clearTtyMessageWindow(game);
    game.level.at(game.u.ux, game.u.uy).typ = LAVAPOOL;
    game.nhDisplay.pushKey(0x1B);
    assert.equal(await floorfood('eat', 0, game), null);
});

test('each skipfloor reason answers the prompt instead of the floor',
    async () => {
    // invent.c never sees the square once floorfood() takes any of the three
    // reasons at eat.c:3593-3599. Each is set on its own here, over a square
    // holding food that would otherwise stop the command, and each has to
    // reach getobj() -- which the queued Escape then cancels.
    const cases = [
        // The 'm' prefix, which for #eat means "skip floor food".
        ['iflags.menu_requested', (state) => {
            state.iflags.menu_requested = true;
        }],
        // A mounted hero cannot reach the floor to eat off it.
        ['u.usteed', (state) => { state.u.usteed = { mx: 0, my: 0 }; }],
        // can_reach_floor(TRUE): the TRUE is checkPit, and only that argument
        // makes a hero teetering at the edge of a seen pit -- in it, u.utrap
        // would put them back within reach of the floor -- unable to eat off
        // the floor.
        ['a seen pit', (state) => {
            state.level.traps.push({
                tx: state.u.ux, ty: state.u.uy, ttyp: PIT, tseen: 1,
            });
        }],
    ];
    for (const [reason, apply] of cases) {
        await runSegment({ ...segmentFor('ea'), moves: '.' });
        game.level.objects[game.u.ux][game.u.uy] = {
            otyp: FOOD_RATION, oclass: FOOD_CLASS, quan: 1, nexthere: null,
        };
        apply(game);
        game.flags.verbose = false;
        game.nhDisplay.pushKey(0x1B);
        assert.equal(await floorfood('eat', 0, game), null, reason);
        assert.equal(topLine(), 'What do you want to eat? [d or ?*]', reason);
    }
});

test('a floor object that is neither food nor gold is left alone',
    async () => {
    // eat.c:3679's `otmp->oclass != COIN_CLASS && is_edible(otmp)`. Gold fails
    // the first test and every other non-comestible fails the second, so
    // neither reaches the floor question -- but only an object that passes one
    // and fails the other tells the two conjuncts apart.
    await runSegment({ ...segmentFor('ea'), moves: '.' });
    game.level.objects[game.u.ux][game.u.uy] = {
        otyp: SPEAR, oclass: WEAPON_CLASS, quan: 1, nexthere: null,
    };
    game.flags.verbose = false;
    game.nhDisplay.pushKey(0x1B);
    assert.equal(await floorfood('eat', 0, game), null);
    assert.equal(topLine(), 'What do you want to eat? [d or ?*]');
});

test('floorfood dispatches sacrifice and tin selectors by corpsecheck',
    async () => {
    await runSegment({ ...segmentFor('ea'), moves: '.' });
    // eat.c:3711-3718 selects offer_ok() for sacrifice and tin_ok() for a
    // corpsecheck of 2. This starting pack contains no suitable object for
    // either callback; Escape answers each selector's inventory prompt.
    game.nhDisplay.pushKey(0x1B);
    assert.equal(await floorfood('sacrifice', 1, game), null);
    clearTtyMessageWindow(game);
    game.nhDisplay.pushKey(0x1B);
    assert.equal(await floorfood('eat', 2, game), null);
});

test('the eat matrix covers the branches this slice ports', () => {
    const moves = [
        ...loadEatPromptRecipe().segments,
        ...loadEatPromptOptionsRecipe().segments,
    ].map((segment) => segment.moves);
    // Each entry names one getobj() or doeat() arm and the key that reaches
    // it. A segment deleted from the matrix takes its evidence with it, so the
    // list is asserted rather than described in a comment.
    for (const [arm, typed] of [
        ['the refusal', '.ea.'],
        ['Escape at the prompt', `.e${ESCAPE_KEY}.`],
        ['space at the prompt', '.e .'],
        ['a count with GETOBJ_ALLOWCNT clear', '.e5 a.'],
        ['a letter no slot holds', `.ez ${ESCAPE_KEY}.`],
        ['the command reached by name', '.#eat\na.'],
        ['gold, and five uncompacted letters', `.e$.e${ESCAPE_KEY}.`],
        ['gold, and six compacted letters', '.e$.ea.'],
        ['an empty suggestion set', '.e.'],
        ['a pet on the level', `.ea.e${ESCAPE_KEY}..`],
    ]) {
        assert.ok(moves.includes(typed), arm);
    }
});
