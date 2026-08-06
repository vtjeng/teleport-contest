import assert from 'node:assert/strict';
import test from 'node:test';

import { apply_ok, doapply, UnsupportedApplyError } from '../js/apply.js';
import { ADMITTED_COMMANDS } from '../js/cmd.js';
import {
    BLINDED,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FAST,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_SUGGEST,
    GLIB,
    HALLUC,
    HALLUC_RES,
    INVIS,
    SICK,
    SLIMED,
    STONED,
    STRANGLED,
    STUNNED,
    VOMITING,
    WOUNDED_LEGS,
} from '../js/const.js';
import { CONFUSION, OBJ_INVENT } from '../js/const.js';
import { freehand } from '../js/engrave.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { piousness, ustatusline } from '../js/insight.js';
import { runSegment } from '../js/jsmain.js';
import { monst_globals_init } from '../js/monsters.js';
import { is_axe, set_bknown } from '../js/obj.js';
import {
    ARMOR_CLASS,
    AXE,
    BALL_CLASS,
    BANANA,
    BATTLE_AXE,
    BULLWHIP,
    COIN_CLASS,
    CREAM_PIE,
    DWARVISH_MATTOCK,
    EUCALYPTUS_LEAF,
    FLINT,
    FOOD_CLASS,
    GEM_CLASS,
    GOLD_PIECE,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    LANCE,
    LEATHER_GLOVES,
    LOCK_PICK,
    LONG_SWORD,
    LUMP_OF_ROYAL_JELLY,
    PICK_AXE,
    POT_OIL,
    POT_WATER,
    POTION_CLASS,
    ROCK,
    SCALPEL,
    SPBOOK_CLASS,
    SPE_HEALING,
    SPEAR,
    STETHOSCOPE,
    TIN_OPENER,
    TOOL_CLASS,
    TOUCHSTONE,
    TWO_HANDED_SWORD,
    WAN_SLEEP,
    WAND_CLASS,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import { welded } from '../js/wield.js';
import {
    APPLY_KEY,
    ESCAPE_KEY,
    loadApplyPromptRecipe,
    loadApplyStethoscopeRecipe,
} from './run-apply-stethoscope.mjs';

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The top line a call made outside moveloop_core() produced. Nothing has
// flushed the screen yet, so this is the text the next flush would paint.
function pendingTopLine() {
    return game._pending_message ?? '';
}

// A state carrying the object catalog apply_ok() reads and an unhallucinating
// hero, which is what its BANANA arm asks about.
function catalogState() {
    const state = {};
    monst_globals_init(state);
    objects_globals_init(state);
    state.u = {
        uprops: {
            [HALLUC]: { intrinsic: 0, extrinsic: 0 },
            [HALLUC_RES]: { intrinsic: 0, extrinsic: 0 },
        },
    };
    return state;
}

// An object as apply_ok() reads one: its class, its type, and the two
// discovery flags the potion and gray-stone arms consult.
function item(oclass, otyp, extra = {}) {
    return { oclass, otyp, dknown: 1, ...extra };
}

// Locate a segment by the keys it types, so reordering the matrix cannot
// silently point a test at a different case.
function segmentFor(moves, recipe = loadApplyStethoscopeRecipe()) {
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

test('apply_ok answers on object class before it answers on type', () => {
    const state = catalogState();
    // apply.c:4149-4210, walked top to bottom. The null object is the
    // hands/self choice, which apply_ok() excludes outright, so getobj()
    // never sets allownone for this command.
    assert.equal(apply_ok(null, state), GETOBJ_EXCLUDE);

    // The three classes suggested whole: every tool, every wand and every
    // spellbook. A Healer carries one of each.
    assert.equal(
        apply_ok(item(TOOL_CLASS, STETHOSCOPE), state), GETOBJ_SUGGEST,
    );
    assert.equal(apply_ok(item(WAND_CLASS, WAN_SLEEP), state), GETOBJ_SUGGEST);
    assert.equal(
        apply_ok(item(SPBOOK_CLASS, SPE_HEALING), state), GETOBJ_SUGGEST,
    );

    // Coins are appliable -- flipping one is the easter egg apply.c's comment
    // names -- but downplayed, so '$' stays out of the advertised letters and
    // getobj()'s `<= GETOBJ_EXCLUDE` gold refusal does not fire either.
    assert.equal(apply_ok(item(COIN_CLASS, GOLD_PIECE), state),
        GETOBJ_DOWNPLAY);

    // Anything reaching the end of the callback: a Healer's leather gloves.
    assert.equal(apply_ok(item(ARMOR_CLASS, LEATHER_GLOVES), state),
        GETOBJ_EXCLUDE_SELECTABLE);
});

test('apply_ok suggests only the four kinds of weapon apply.c names', () => {
    const state = catalogState();
    // apply.c:4171-4175 asks four questions of a WEAPON_CLASS object. Each
    // row below answers exactly one of them, and the last two answer none.
    for (const otyp of [
        // is_pick(): both types carrying P_PICK_AXE. objects.h gives them
        // TOOL_CLASS, so no real object reaches this term through the
        // WEAPON_CLASS test above it; the pairing is fabricated here to keep
        // the term from being deletable without a visible change.
        PICK_AXE, DWARVISH_MATTOCK,
        // is_axe(): P_AXE, which u_init.c:56 and :62 give every Barbarian.
        AXE, BATTLE_AXE,
        // is_pole(): P_LANCE, which u_init.c:90 gives every Knight.
        LANCE,
        // The one otyp named on its own.
        BULLWHIP,
    ]) {
        assert.equal(apply_ok(item(WEAPON_CLASS, otyp), state),
            GETOBJ_SUGGEST, `weapon ${otyp}`);
    }
    // P_SPEAR is not P_POLEARMS, and a Healer's scalpel is P_KNIFE.
    assert.equal(apply_ok(item(WEAPON_CLASS, SPEAR), state),
        GETOBJ_EXCLUDE_SELECTABLE);
    assert.equal(apply_ok(item(WEAPON_CLASS, SCALPEL), state),
        GETOBJ_EXCLUDE_SELECTABLE);
    // The same axe outside WEAPON_CLASS is not reached by the weapon test at
    // all, which is what makes the class conjunct load-bearing. Nothing else
    // in the callback claims a GEM_CLASS axe, so it falls to the tail.
    assert.equal(apply_ok(item(GEM_CLASS, AXE), state),
        GETOBJ_EXCLUDE_SELECTABLE);
});

test('apply_ok suggests a potion only once oil has been discovered', () => {
    const state = catalogState();
    // apply.c:4177-4186. An undiscovered potion is downplayed whichever of
    // the two flags is missing, so both are moved one at a time.
    assert.equal(
        apply_ok(item(POTION_CLASS, POT_OIL, { dknown: 0 }), state),
        GETOBJ_DOWNPLAY,
    );
    assert.equal(apply_ok(item(POTION_CLASS, POT_OIL), state),
        GETOBJ_DOWNPLAY);

    // Discovered oil is the one potion the command can use.
    state.objects[POT_OIL].oc_name_known = 1;
    assert.equal(apply_ok(item(POTION_CLASS, POT_OIL), state), GETOBJ_SUGGEST);

    // A discovered potion that is not oil falls out of the potion block and
    // down to the tail. u_init.c:715's knows_object(POT_WATER, TRUE) is what
    // puts a Priest's holy water here on the first turn of a game.
    state.objects[POT_WATER].oc_name_known = 1;
    assert.equal(apply_ok(item(POTION_CLASS, POT_WATER), state),
        GETOBJ_EXCLUDE_SELECTABLE);
});

test('apply_ok suggests the three foods and the hallucinated banana', () => {
    const state = catalogState();
    // apply.c:4188-4194: three named comestibles, then the banana, which is
    // downplayed only while the hero is hallucinating.
    for (const otyp of [CREAM_PIE, EUCALYPTUS_LEAF, LUMP_OF_ROYAL_JELLY]) {
        assert.equal(apply_ok(item(FOOD_CLASS, otyp), state), GETOBJ_SUGGEST,
            `food ${otyp}`);
    }
    assert.equal(apply_ok(item(FOOD_CLASS, BANANA), state),
        GETOBJ_EXCLUDE_SELECTABLE);
    state.u.uprops[HALLUC].intrinsic = 1;
    assert.equal(apply_ok(item(FOOD_CLASS, BANANA), state), GETOBJ_DOWNPLAY);
    // youprop.h:120 subtracts resistance from either source, so a resistant
    // hero reads the banana the ordinary way even while the timeout runs.
    state.u.uprops[HALLUC_RES].extrinsic = 1;
    assert.equal(apply_ok(item(FOOD_CLASS, BANANA), state),
        GETOBJ_EXCLUDE_SELECTABLE);
});

test('apply_ok hides a gray stone only once it is known not to be a touchstone',
    () => {
    const state = catalogState();
    // apply.c:4196-4207. An unidentified gray stone might be the touchstone,
    // so it is suggested; identifying either the stone in hand or the
    // touchstone itself settles that it is not.
    assert.equal(apply_ok(item(GEM_CLASS, FLINT, { dknown: 0 }), state),
        GETOBJ_SUGGEST);
    assert.equal(apply_ok(item(GEM_CLASS, FLINT), state), GETOBJ_SUGGEST);

    state.objects[FLINT].oc_name_known = 1;
    assert.equal(apply_ok(item(GEM_CLASS, FLINT), state),
        GETOBJ_EXCLUDE_SELECTABLE);

    state.objects[FLINT].oc_name_known = 0;
    state.objects[TOUCHSTONE].oc_name_known = 1;
    assert.equal(apply_ok(item(GEM_CLASS, FLINT), state),
        GETOBJ_EXCLUDE_SELECTABLE);

    // The touchstone itself stays suggested however much is known, because
    // it is the stone the arm exists to protect.
    assert.equal(apply_ok(item(GEM_CLASS, TOUCHSTONE), state), GETOBJ_SUGGEST);

    // A rock is not a gray stone, so it never enters the arm.
    assert.equal(apply_ok(item(GEM_CLASS, ROCK), state),
        GETOBJ_EXCLUDE_SELECTABLE);
});

test('is_axe reads the weapon skill of both classes obj.h admits', () => {
    const state = catalogState();
    // obj.h:217-219. AXE and BATTLE_AXE are the two P_AXE types in
    // objects.h, and both are WEAPON_CLASS there; TOOL_CLASS is in the macro
    // for weapon-tools, which is why an axe under it answers true as well.
    assert.equal(is_axe(item(WEAPON_CLASS, AXE), state), true);
    assert.equal(is_axe(item(WEAPON_CLASS, BATTLE_AXE), state), true);
    assert.equal(is_axe(item(TOOL_CLASS, AXE), state), true);
    // P_PICK_AXE is the adjacent skill number, so a pick-axe separates
    // is_axe() from is_pick().
    assert.equal(is_axe(item(TOOL_CLASS, PICK_AXE), state), false);
    // A class the macro does not admit, holding a P_AXE type.
    assert.equal(is_axe(item(GEM_CLASS, AXE), state), false);
});

test('set_bknown writes the flag only when it changes', () => {
    const state = catalogState();
    // mkobj.c:1862-1873. The refresh is skipped here because
    // program_state.in_moveloop is unset, which is invent.c
    // update_inventory()'s own first test.
    const obj = item(TOOL_CLASS, STETHOSCOPE,
        { bknown: 0, where: OBJ_INVENT });
    set_bknown(obj, 1, { state });
    assert.equal(obj.bknown, 1);
    // Writing the value it already holds is C's no-op, and the guard is what
    // keeps update_inventory() from being called for every welded() test.
    set_bknown(obj, 1, { state });
    assert.equal(obj.bknown, 1);
    set_bknown(obj, 0, { state });
    assert.equal(obj.bknown, 0);

    // C's two conditions on the refresh, each isolated by a state that would
    // make update_inventory() visible. invent.c requireInventoryRefresh()
    // throws for a permanent-inventory window with no owner to draw it, so a
    // refresh that should not have happened is the thrown error.
    state.program_state = { in_moveloop: 1 };
    state.iflags = { perm_invent: true };
    const refreshes = (where, moves) => {
        state.moves = moves;
        const target = item(TOOL_CLASS, STETHOSCOPE, { bknown: 0, where });
        try {
            set_bknown(target, 1, { state });
            return false;
        } catch (error) {
            return error.name === 'UnsupportedObjectOperationError';
        }
    };
    // Both conditions hold: C redraws.
    assert.equal(refreshes(OBJ_INVENT, 2), true);
    // A floor object at the same turn does not, so the two conjuncts are not
    // interchangeable.
    assert.equal(refreshes(0 /* OBJ_FREE */, 2), false);
    // Turn 1 is u_init()'s, where C suppresses the redraw with `moves > 1L`;
    // turn 2 is the first that shows one.
    assert.equal(refreshes(OBJ_INVENT, 1), false);
});

test('welded and freehand answer on the wielded weapon', () => {
    const state = catalogState();
    state.moves = 5;
    // wield.c:1050-1058 through engrave.c:469-477.
    // No weapon at all: freehand() answers on its first term.
    assert.equal(freehand(state), true);

    // An uncursed wielded weapon does not weld, so the second term answers
    // and the shield is never consulted.
    const sword = item(WEAPON_CLASS, LONG_SWORD,
        { cursed: false, bknown: 0, where: OBJ_INVENT });
    state.uwep = sword;
    state.uarms = { cursed: true };
    assert.equal(welded(sword, state), 0);
    assert.equal(sword.bknown, 0);
    assert.equal(freehand(state), true);

    // Cursed, so it welds -- and welding teaches the hero it is cursed.
    sword.cursed = true;
    assert.equal(welded(sword, state), 1);
    assert.equal(sword.bknown, 1);
    // One-handed and welded, but the shield hand is cursed shut too.
    assert.equal(freehand(state), false);
    // The same weapon with a free shield hand leaves one hand available.
    state.uarms = { cursed: false };
    assert.equal(freehand(state), true);
    // A cursed two-handed weapon occupies both hands whatever the shield does.
    state.uwep = item(WEAPON_CLASS, TWO_HANDED_SWORD,
        { cursed: true, bknown: 0, where: OBJ_INVENT });
    assert.equal(freehand(state), false);

    // A weapon the hero is not wielding never welds, however cursed.
    assert.equal(welded(sword, state), 0);
    // will_weld() reads erodeable_wep(), so a cursed object outside the
    // classes that macro admits does not weld either. objects.h gives the
    // stethoscope and the lock pick P_NONE, so neither is a weapon-tool.
    for (const otyp of [STETHOSCOPE, LOCK_PICK]) {
        const tool = item(TOOL_CLASS, otyp,
            { cursed: true, bknown: 0, where: OBJ_INVENT });
        state.uwep = tool;
        assert.equal(welded(tool, state), 0, `tool ${otyp}`);
    }
    // A cursed pick-axe is a weapon-tool -- objects.h gives it P_PICK_AXE --
    // so the same cursed flag welds it.
    const pick = item(TOOL_CLASS, PICK_AXE,
        { cursed: true, bknown: 0, where: OBJ_INVENT });
    state.uwep = pick;
    assert.equal(welded(pick, state), 1);
    // The tin opener is the one otyp will_weld() names beside erodeable_wep(),
    // and objects.h gives it P_NONE, so only that name can weld it.
    const opener = item(TOOL_CLASS, TIN_OPENER,
        { cursed: true, bknown: 0, where: OBJ_INVENT });
    state.uwep = opener;
    assert.equal(welded(opener, state), 1);
    // erodeable_wep() names the punishment ball and chain outright, and
    // objects.h puts them in BALL_CLASS and CHAIN_CLASS with P_NONE, so
    // neither reaches the macro's first two terms.
    for (const otyp of [HEAVY_IRON_BALL, IRON_CHAIN]) {
        const iron = item(BALL_CLASS, otyp,
            { cursed: true, bknown: 0, where: OBJ_INVENT });
        state.uwep = iron;
        assert.equal(welded(iron, state), 1, `iron ${otyp}`);
    }
});

test('piousness names each band of the alignment record', () => {
    // insight.c:3234-3271, one value inside every band and one on each
    // boundary the source spells with a different comparison.
    const state = { u: { ualign: { record: 0 } } };
    const at = (record, showneg = false, suffix = 'neutral') => {
        state.u.ualign.record = record;
        return piousness(showneg, suffix, state);
    };
    assert.equal(at(20), 'piously neutral');
    assert.equal(at(19), 'devoutly neutral');
    assert.equal(at(14), 'devoutly neutral');
    assert.equal(at(13), 'fervently neutral');
    // Ten is every role's u_init.c starting record, which is the value the
    // recorded stethoscope report reads.
    assert.equal(at(10), 'fervently neutral');
    assert.equal(at(9), 'fervently neutral');
    assert.equal(at(8), 'stridently neutral');
    assert.equal(at(4), 'stridently neutral');
    // The one band with an empty adverb, where C also drops the space.
    assert.equal(at(3), 'neutral');
    assert.equal(at(2), 'haltingly neutral');
    assert.equal(at(1), 'haltingly neutral');
    assert.equal(at(0), 'nominally neutral');
    // Below zero, `showneg` picks between one word and three. ustatusline()
    // passes FALSE, which keeps the suffix as well, because C appends it
    // whenever `!showneg` holds however low the record has fallen.
    assert.equal(at(-1), 'insufficiently neutral');
    assert.equal(at(-99), 'insufficiently neutral');
    // With showneg set, the same records name the fall and drop the suffix,
    // because C then requires record >= 0 to append one.
    assert.equal(at(-1, true), 'strayed');
    assert.equal(at(-3, true), 'strayed');
    assert.equal(at(-4, true), 'sinned');
    assert.equal(at(-8, true), 'sinned');
    assert.equal(at(-9, true), 'transgressed');
    // No suffix at all leaves the adverb alone, at the same record that just
    // produced "transgressed" with one.
    assert.equal(piousness(true, '', state), 'transgressed');
    // showneg keeps the suffix once the record is back at or above zero.
    assert.equal(at(0, true), 'nominally neutral');
});

test('the apply command is admitted and shares its extcmdlist row with doapply',
    () => {
    assert.ok(ADMITTED_COMMANDS.includes('apply'));
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'apply');
    assert.ok(row, 'extcmdlist[] has an apply row');
    assert.equal(row.ef_funct, 'doapply');
});

test('the apply prompt lists the suggested letters and spends no turn',
    async () => {
    const segment = segmentFor(`${APPLY_KEY}${ESCAPE_KEY}`,
        loadApplyPromptRecipe());

    // getobj() builds the prompt from apply_ok()'s answers in invlet order:
    // this Healer's stethoscope, wand and three spellbooks. Her gold and her
    // four potion stacks are downplayed and stay out of it. The cursor sits
    // one column past the trailing space tty_yn_function() appends.
    await runSegment({ ...segment, moves: `.${APPLY_KEY}` });
    assert.equal(topLine(), 'What do you want to use or apply? [chijk or ?*]');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [48, 0],
    );

    // The pack with nothing appliable in it, where getobj() declines to ask.
    await runSegment({
        ...segmentFor(APPLY_KEY, loadApplyPromptRecipe()),
        moves: `.${APPLY_KEY}`,
    });
    assert.equal(topLine(), "You don't have anything to use or apply.");
});

test('the self direction reports the hero and the first listen is free',
    async () => {
    const segment = segmentFor('ac.');

    // insight.c:3485-3488's format string, with `info` empty. Level, hit
    // points and armor class come from u.ulevel, u.uhp/u.uhpmax and u.uac,
    // and the adverb from piousness() over this Healer's starting record.
    await runSegment({ ...segment, moves: '.ac.' });
    assert.equal(
        topLine(),
        'Status of Stetho (fervently neutral):  Level 1  HP 13(13)  AC 8.',
    );
    // apply.c:340: the first listen of a move finds svc.context.stethoscope_seq
    // still holding some earlier move's sequence number, so it costs nothing.
    // The game starts on turn 1 and the leading wait is the only key of the
    // three that spends one, so a listen that wrongly cost time reads 3 here.
    assert.equal(game.moves, 2);
    assert.equal(game.context.move, 0);
    assert.equal(game.context.stethoscope_seq, game.hero_seq);
});

test('a second listen in the same move spends the turn', async () => {
    // apply.c:340-341 and the comment above use_stethoscope(): one use per
    // turn is free, so the second finds gh.hero_seq unchanged and answers
    // ECMD_TIME. Driving doapply() directly keeps the two listens inside one
    // move without a command in between that could advance gh.hero_seq.
    await runSegment({ ...segmentFor('ac.'), moves: '.ac.' });
    const firstSeq = game.hero_seq;
    assert.equal(game.context.stethoscope_seq, firstSeq);

    // The report left the top line waiting, so the next prompt opens --More--
    // and consumes a space before it reads the object letter.
    for (const key of [' ', 'c', '.'])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_TIME);
    assert.equal(game.hero_seq, firstSeq);
    assert.equal(game.context.stethoscope_seq, firstSeq);
});

test('both prompts of the apply command cancel without spending a turn',
    async () => {
    // getobj() answers null for a quitchar, which doapply() turns into
    // ECMD_CANCEL before it reaches retouch_object() or the switch.
    await runSegment({
        ...segmentFor(`${APPLY_KEY}${ESCAPE_KEY}`),
        moves: `.${APPLY_KEY}`,
    });
    game.nhDisplay.pushKey(0x1b);
    assert.equal(await doapply(game), ECMD_CANCEL);
    assert.equal(pendingTopLine(), 'Never mind.');

    // getdir() answers 0 for the same key, which use_stethoscope() turns into
    // ECMD_CANCEL after the stethoscope has already been chosen -- and after
    // the free-action rule has already written stethoscope_seq in C, which is
    // why the write sits below the getdir() test rather than above it.
    await runSegment({
        ...segmentFor(`${APPLY_KEY}${ESCAPE_KEY}`),
        moves: `.${APPLY_KEY}`,
    });
    const before = game.context.stethoscope_seq;
    for (const key of ['c', '\x1b'])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_CANCEL);
    assert.equal(game.context.stethoscope_seq, before);
});

test('a deaf hero hears nothing and is never asked for a direction',
    async () => {
    // apply.c:331-333. The guard answers before getdir(), so the key that
    // would have been the direction is read as the next command instead.
    const segment = segmentFor('ac');
    await runSegment({ ...segment, moves: '.ac' });
    assert.equal(topLine(), "You can't hear anything!");
    assert.equal(game.context.move, 0);
    // The guard runs before the free-action rule, so a refused listen leaves
    // the next one free.
    assert.equal(game.context.stethoscope_seq, 0);
});

test('doapply refuses every class and arm this slice does not port',
    async () => {
    const segment = segmentFor('ac.');
    // js/cmd.js failClosedCommand() rewraps the refusal, so the reason
    // survives as the tail of the command boundary's message rather than as
    // its own `branch` field.
    const refusal = async (moves) =>
        (await boundaryFor(segment, moves))?.message ?? '';

    // The three oclass shortcuts apply.c takes before its switch, reached by
    // answering the prompt with this Healer's wand, first spellbook and gold.
    for (const [letter, branch] of [
        ['h', 'do_break_wand()'],
        ['i', 'flip_through_book()'],
        ['$', 'flip_coin()'],
    ]) {
        assert.match(await refusal(`.a${letter}`),
            new RegExp(`applying a tool requires ${branch}`, 'u'), letter);
    }

    // An arm of the switch: the Rogue's lock pick, which the next slice ports.
    const rogueSegment = loadApplyPromptRecipe().segments.find(
        ({ nethackrc }) => nethackrc.includes('role:Rogue'),
    );
    assert.ok(rogueSegment, 'the matrix carries a Rogue segment');
    const lockPick = await boundaryFor(rogueSegment, '.ae');
    assert.match(lockPick?.message ?? '',
        new RegExp(`doapply\\(\\)'s arm for object type ${LOCK_PICK}`, 'u'));

    // The two direction arms below confdir(): 'j' names an adjacent square
    // and '>' names the floor.
    for (const [key, branch] of [
        ['j', 'listening to an adjacent square'],
        ['>', 'listening to the floor or ceiling'],
    ]) {
        assert.match(await refusal(`.ac${key}`),
            new RegExp(`applying a tool requires ${branch}`, 'u'), key);
    }
});

test('ustatusline stops for every clause it would have to name', async () => {
    await runSegment({ ...segmentFor('ac.'), moves: '.' });
    // insight.c:3406-3484 appends one fragment per condition, in this order.
    // A starting hero carries none of them, so each is set by hand and then
    // cleared. Setting the extrinsic proves the guards read the pair rather
    // than the intrinsic alone, which is what makes them supersets of the
    // youprop.h macros they stand for.
    for (const [propidx, branch] of [
        [SICK, 'the dying-from-illness clause'],
        [STONED, 'the solidifying clause'],
        [SLIMED, 'the becoming-slimy clause'],
        [STRANGLED, 'the being-strangled clause'],
        [VOMITING, 'the nauseated clause'],
        [CONFUSION, 'the confused clause'],
        [BLINDED, 'the blind clause'],
        [STUNNED, 'the stunned clause'],
        [WOUNDED_LEGS, 'the injured-leg clause'],
        [GLIB, 'fingers_or_gloves()'],
        [FAST, 'the fast clause'],
        [INVIS, 'the invisible clause'],
    ]) {
        game.u.uprops[propidx].extrinsic = 1;
        await assert.rejects(() => ustatusline(game),
            (error) => error.branch === branch, branch);
        game.u.uprops[propidx].extrinsic = 0;
    }

    // The four conditions that live outside u.uprops.
    for (const [field, value, branch] of [
        ['utrap', 3, 'the trapped clause'],
        ['uundetected', 1, 'the concealed clause'],
        ['ustuck', { m_id: 1 }, 'a_monnam() for u.ustuck'],
    ]) {
        game.u[field] = value;
        await assert.rejects(() => ustatusline(game),
            (error) => error.branch === branch, branch);
        game.u[field] = 0;
    }
    game.youmonst.m_ap_type = 1; /* M_AP_FURNITURE */
    await assert.rejects(() => ustatusline(game),
        (error) => error.branch === 'the disguised clause');
    game.youmonst.m_ap_type = 0;

    // With every clause cleared the report is the one line the command draws.
    await ustatusline(game);
    assert.equal(
        pendingTopLine(),
        'Status of Stetho (fervently neutral):  Level 1  HP 13(13)  AC 8.',
    );

    // insight.c:3486 passes showneg FALSE, which only a fallen hero can show:
    // with TRUE the same record would read "strayed" and lose the alignment
    // word after it. Nothing ported lowers u.ualign.record, so it is moved by
    // hand.
    game.u.ualign.record = -1;
    // The first report is still waiting on the top line, so the second opens
    // --More-- and consumes a space before it prints.
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await ustatusline(game);
    assert.equal(
        pendingTopLine(),
        'Status of Stetho (insufficiently neutral):  Level 1  HP 13(13)  '
        + 'AC 8.',
    );
});

test('the apply matrix holds the two clean recipes the slice was closed on',
    () => {
    const recipes = [loadApplyStethoscopeRecipe(), loadApplyPromptRecipe()];
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.ok(recipes.every(({ version }) => version === 5));
    const segments = recipes.flatMap(({ segments: rows }) => rows);
    assert.equal(segments.length, 20);
    assert.ok(segments.every((segment) => !Object.hasOwn(segment, 'steps')));
    // Every segment opens and closes with a wait, so a command that wrongly
    // spent or wrongly saved a turn shows in the screen after it.
    assert.ok(segments.every(({ moves }) =>
        moves.startsWith('.') && moves.endsWith('.')));
    // The prompt half varies the role and the stethoscope half varies the
    // keys, so neither half is a copy of the other.
    assert.equal(
        new Set(loadApplyPromptRecipe().segments.map(
            ({ nethackrc }) => /role:(\w+)/u.exec(nethackrc)?.[1],
        )).size,
        9,
    );
});
