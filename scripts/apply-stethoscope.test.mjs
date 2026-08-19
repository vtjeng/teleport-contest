import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
    apply_ok,
    doapply,
    its_dead,
    UnsupportedApplyError,
} from '../js/apply.js';
import { ADMITTED_COMMANDS } from '../js/cmd.js';
import {
    BLINDED,
    COLNO,
    CORPSTAT_FEMALE,
    CORPSTAT_NEUTER,
    CORPSTAT_RANDOM,
    DEAF,
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
    MFAST,
    MSLOW,
    REVIVE_MON,
    ROWNO,
    SICK,
    SLIMED,
    STONED,
    STRANGLED,
    STRAT_WAITFORU,
    STUNNED,
    VOMITING,
    WOUNDED_LEGS,
} from '../js/const.js';
import {
    CONFUSION,
    CORR,
    D_CLOSED,
    DOOR,
    LEVITATION,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    OBJ_INVENT,
    PIT,
    ROOM,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    TIMER_OBJECT,
} from '../js/const.js';
import {
    cmap_to_glyph,
    flush_screen,
    glyph_at,
    glyph_is_invisible,
    map_object,
    map_invisible,
    obj_to_glyph,
    remembered_glyph_from_presentation,
    show_glyph_cell,
} from '../js/display.js';
import { GLYPH_UNEXPLORED_OFF } from '../js/glyph_offsets.js';
import { freehand } from '../js/engrave.js';
import { UnsupportedMonsterNameError } from '../js/do_name.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { GameMap } from '../js/game.js';
import { GameDisplay } from '../js/game_display.js';
import { game } from '../js/gstate.js';
import {
    piousness,
    UnsupportedEnlightenmentError,
    ustatusline,
} from '../js/insight.js';
import { runSegment } from '../js/jsmain.js';
import { getRngLog } from '../js/rng.js';
import {
    MZ_SMALL,
    MZ_TINY,
    monst_globals_init,
    NON_PM,
    PM_ALIGNED_CLERIC,
    PM_ARCHON,
    PM_GNOME,
    PM_GNOME_RULER,
    PM_LONG_WORM,
    PM_MEDUSA,
    PM_MONK,
    PM_NEWT,
    PM_SMALL_MIMIC,
} from '../js/monsters.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { is_axe, mksobj_at, newObject, set_bknown } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    ARMOR_CLASS,
    APPLE,
    AXE,
    CHEST,
    BALL_CLASS,
    BANANA,
    BATTLE_AXE,
    BULLWHIP,
    COIN_CLASS,
    CORPSE,
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
    LENSES,
    LOCK_PICK,
    LOW_BOOTS,
    LONG_SWORD,
    LUMP_OF_ROYAL_JELLY,
    PICK_AXE,
    POT_OIL,
    POT_WATER,
    POTION_CLASS,
    RIN_PROTECTION,
    ROCK,
    SACK,
    SCALPEL,
    SLIME_MOLD,
    SPBOOK_CLASS,
    SPE_HEALING,
    SPEAR,
    STATUE,
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
import { S_altar, S_room } from '../js/symbols.js';
import { create_region } from '../js/region.js';
import { start_timer } from '../js/timeout.js';
import { CLR_GRAY, NO_COLOR } from '../js/terminal.js';
import { welded } from '../js/wield.js';
import {
    APPLY_KEY,
    ESCAPE_KEY,
    loadApplyPromptRecipe,
    loadApplyStethoscopeRecipeInventory,
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

function canonicalInput(value) {
    if (Array.isArray(value)) return value.map(canonicalInput);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(
        (key) => [key, canonicalInput(value[key])],
    ));
}

function recipeInputDigest(recipe) {
    return createHash('sha256')
        .update(JSON.stringify(canonicalInput(recipe.segments)))
        .digest('hex');
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

    // The change guard itself, under the same redrawing state: every case
    // above hands set_bknown() a fresh object whose flag does change, so they
    // hold with the guard deleted. Writing a value the object already holds
    // must reach neither the write nor update_inventory(). moves = 2 is the
    // first turn C's `svm.moves > 1L` admits, and OBJ_INVENT the where that
    // redraws, so both conjuncts are satisfied and only the guard can stop it.
    state.moves = 2;
    const settled = item(TOOL_CLASS, STETHOSCOPE,
        { bknown: 0, where: OBJ_INVENT });
    assert.throws(() => set_bknown(settled, 1, { state }),
        { name: 'UnsupportedObjectOperationError' });
    assert.equal(settled.bknown, 1);
    assert.doesNotThrow(() => set_bknown(settled, 1, { state }));
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
    // The record, not the suffix, is what drops it here: showneg with a
    // fallen record fails C's `!showneg || u.ualign.record >= 0` term, so the
    // adverb stands alone whatever the suffix holds.
    assert.equal(piousness(true, '', state), 'transgressed');
    // showneg keeps the suffix once the record is back at or above zero.
    assert.equal(at(0, true), 'nominally neutral');

    // C tests `suffix` for NULL, and an empty string is not NULL, so it takes
    // the append branch and emits the separator on its own. A JavaScript
    // truthiness test would answer the opposite way for exactly this input,
    // which is the one value that separates the two readings.
    assert.equal(at(10, false, ''), 'fervently ');
    // Record 3 is the band whose adverb is empty and whose separator C skips,
    // so the same empty suffix yields nothing at all.
    assert.equal(at(3, false, ''), '');
    // A genuinely absent suffix is C's NULL, which skips the branch and the
    // separator with it. `at` supplies a default for an omitted argument, so
    // the undefined case calls piousness() directly.
    assert.equal(at(10, false, null), 'fervently');
    state.u.ualign.record = 10;
    assert.equal(piousness(false, undefined, state), 'fervently');
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

test('the Deaf guard reads the intrinsic and the extrinsic, not the option',
    async () => {
    // youprop.h:125 spells Deaf as the intrinsic, the extrinsic and the
    // roleplay option. The segment above supplies only the option, so on its
    // own it holds for an implementation that reads uroleplay.deaf alone.
    // These two drive an ordinary Healer and set one term each.
    for (const term of ['intrinsic', 'extrinsic']) {
        await runSegment({ ...segmentFor('ac.'), moves: '.' });
        game.u.uprops[DEAF][term] = 1;
        game.nhDisplay.pushKey('c'.charCodeAt(0));
        // No direction key is queued: reaching getdir() would hang or read
        // the wrong byte, so the guard answering first is what makes this
        // pass at all.
        assert.equal(await doapply(game), ECMD_OK, term);
        assert.equal(pendingTopLine(), "You can't hear anything!", term);
        // apply.c:331-333 returns above the free-action write.
        assert.equal(game.context.stethoscope_seq, 0, term);
    }
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

    // An arm of the switch: the Rogue's sack, which apply.c:4274 sends to
    // use_container(). Her lock pick, slot `e` in the same pack, no longer
    // stops here; scripts/apply-lock-pick.test.mjs owns it.
    const rogueSegment = loadApplyPromptRecipe().segments.find(
        ({ nethackrc }) => nethackrc.includes('role:Rogue'),
    );
    assert.ok(rogueSegment, 'the matrix carries a Rogue segment');
    const sack = await boundaryFor(rogueSegment, '.af');
    assert.match(sack?.message ?? '',
        new RegExp(`doapply\\(\\)'s arm for object type ${SACK}`, 'u'));

    // The one direction arm still above the port's reach: '>' names the floor,
    // which apply.c:363 answers before confdir() ever runs. 'j', the adjacent
    // square beside it, now answers rather than stopping, and the test below
    // covers where it stops instead.
    assert.match(await refusal('.ac>'),
        /applying a tool requires listening to the floor or ceiling/u);
});

// The arms between the free-action write and confdir() that no key sequence
// can reach, because the starting Healer is unmounted, unswallowed and
// carries an uncursed tool. Each is set by hand and doapply() driven
// directly. C's order is usteed, uswallow, u.dz, then cursed
// (apply.c:345-377), and these pin the order as well as the arms.
test('use_stethoscope stops for the states its own keys cannot reach',
    async () => {
    const drive = async (setup, keys) => {
        await runSegment({ ...segmentFor('ac.'), moves: '.' });
        setup();
        for (const key of keys) game.nhDisplay.pushKey(key.charCodeAt(0));
        return doapply(game).then(
            (value) => ({ value }),
            (error) => ({ error }),
        );
    };
    // A steed is only consulted when the hero points down: apply.c:345 reads
    // `u.usteed && u.dz > 0`. The stub carries no fields because every reader
    // of u.usteed below this arm stops before it.
    const mounted = () => { game.u.usteed = { mx: game.u.ux, my: game.u.uy }; };
    assert.equal((await drive(mounted, ['c', '>'])).error?.branch,
        'mstatusline() for a steed');
    // The same steed with dz 0 falls past the arm to ustatusline(), which is
    // the `u.dz > 0` half of the conjunct. Under `>=` this would refuse.
    const selfListen = await drive(mounted, ['c', '.']);
    assert.equal(selfListen.error, undefined);
    // Driven outside moveloop_core(), so the report is still pending rather
    // than painted; the replayed self-listen above reads it from the grid.
    assert.equal(
        pendingTopLine(),
        'Status of Stetho (fervently neutral):  Level 1  HP 13(13)  AC 8.',
    );

    // apply.c:352 and :356 both need mstatusline() for u.ustuck.
    assert.equal(
        (await drive(() => { game.u.uswallow = 1; }, ['c', '.'])).error?.branch,
        'mstatusline() for an engulfer',
    );
    // The same source arm wins when the swallowed hero points horizontally at
    // a corpse. Adjacent-path preflight must not reorder it below its_dead().
    const swallowedDead = () => {
        game.u.uswallow = 1;
        floorCorpstat(CORPSE, { x: game.u.ux - 1, y: game.u.uy });
    };
    assert.equal((await drive(swallowedDead, ['c', 'h'])).error?.branch,
        'mstatusline() for an engulfer');

    // C's cursed arm is `obj->cursed && !rn2(2)`, so the port must stop on
    // obj.cursed alone to keep that draw out of the stream. Refusing it must
    // cost no random number at all.
    const cursed = () => {
        for (let obj = game.invent; obj; obj = obj.nobj)
            if (obj.otyp === STETHOSCOPE) obj.cursed = 1;
    };
    await runSegment({ ...segmentFor('ac.'), moves: '.' });
    cursed();
    const drawsBefore = (getRngLog() ?? []).length;
    for (const key of ['c', '.']) game.nhDisplay.pushKey(key.charCodeAt(0));
    await assert.rejects(doapply(game), { branch: 'a cursed stethoscope' });
    assert.equal((getRngLog() ?? []).length, drawsBefore,
        'the refused cursed arm draws no random number');

    // The cursed arm also stays above an adjacent corpse. Preflight inspects
    // only paths whose earlier use_stethoscope() arms are admitted.
    const cursedDead = () => {
        cursed();
        floorCorpstat(CORPSE, { x: game.u.ux - 1, y: game.u.uy });
    };
    assert.equal((await drive(cursedDead, ['c', 'h'])).error?.branch,
        'a cursed stethoscope');

    // The same cursed tool pointed down answers the u.dz arm instead, which
    // is the order: C tests u.dz at 363 before cursed at 374.
    assert.equal((await drive(cursed, ['c', '>'])).error?.branch,
        'listening to the floor or ceiling');
});

// C refs: apply.c use_stethoscope() (384-470) and its_dead() (196-309). The
// adjacent-square arm keeps the off-map and dead-thing stops around the paths
// it answers. Each square below is furnished by hand and doapply() driven
// directly, and every case pins an order -- each would answer with the other
// guard's name if the two traded places.

// Replay the matrix Healer's opening move and hand back the square west of
// her. On this seed it is ordinary room floor with nothing on it, which is
// what makes it the blank the cases below write on.
async function heroWithEmptyWest() {
    await runSegment({ ...segmentFor('ac.'), moves: '.' });
    const west = { x: game.u.ux - 1, y: game.u.uy };
    assert.equal(game.level.at(west.x, west.y).typ, ROOM);
    assert.equal(m_at(west.x, west.y, game), null);
    return west;
}

// One listen west, answered from the Healer's stethoscope slot. Reports the
// refusal's branch, or null when the listen ran through to its message.
//
// `dismissals` is one space per --More-- the listen will raise. A listen that
// prints two messages needs one, because the second overflows the 80-column
// top line the first is sitting on; that overflow is exactly what makes the
// mimic arm worth twenty-four screens in seed5002-wizard-coverage-pair.
async function listenWest(dismissals = 0) {
    for (const key of ['c', 'h', ...Array(dismissals).fill(' ')])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    return doapply(game).then(() => null, (error) => {
        if (!(error instanceof UnsupportedApplyError)) throw error;
        return error.branch;
    });
}

// A corpse and a statue as mkobj.c leaves them on the floor. its_dead()'s
// ported frame reads only whether sobj_at() found one, but the arms that stop
// read corpsenm, so a newt is named rather than nothing.
function floorCorpstat(otyp, { x, y }) {
    const obj = mksobj_at(otyp, x, y, false, false,
        objectGenerationEnv({ state: game }));
    obj.corpsenm = PM_NEWT;
    return obj;
}

function adjacentRefusalEffects(target = null) {
    const location = target ? game.level.at(target.x, target.y) : null;
    return {
        stethoscopeSeq: game.context.stethoscope_seq,
        bhitpos: structuredClone(game.gb?.bhitpos ?? null),
        notonhead: game.gn?.notonhead,
        rememberedGlyph: structuredClone(location?.remembered_glyph ?? null),
        terrain: location ? {
            typ: location.typ,
            flags: location.flags,
            doormask: location.doormask,
        } : null,
        pendingMessage: pendingTopLine(),
        // Rows 22-23 are the status window. Hand-setting Hallucination in one
        // fixture does not schedule bot(), so the next prompt can refresh
        // those rows even though the stethoscope did not write them.
        screen: game.nhDisplay.grid.slice(0, 22).map((row) => row.map(
            ({ ch, color, attr }) => `${ch}\u0001${color}\u0001${attr}`,
        ).join('\u0002')),
        cursor: [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow],
        rngCalls: (getRngLog() ?? []).length,
        moves: game.moves,
        contextMove: game.context.move,
    };
}

// A direct its_dead() refusal must be as retryable as the command-level
// refusal. Capture the selected pile and timers beside the shared listen,
// display, message and RNG effects above so the exported helper cannot change
// either its inputs or its caller's state before it raises the boundary.
function directItsDeadEffects(target) {
    const location = game.level.at(target.x, target.y);
    const pile = [];
    for (let obj = game.level.objects?.[target.x]?.[target.y]; obj;
        obj = obj.nexthere) {
        pile.push({
            o_id: obj.o_id,
            otyp: obj.otyp,
            quan: obj.quan,
            corpsenm: obj.corpsenm,
            dknown: obj.dknown,
            where: obj.where,
            ox: obj.ox,
            oy: obj.oy,
            timed: obj.timed,
            has_contents: Boolean(obj.cobj),
            cobj_id: obj.cobj?.o_id ?? null,
            cobj_otyp: obj.cobj?.otyp ?? null,
            nobj_id: obj.nobj?.o_id ?? null,
            nexthere_id: obj.nexthere?.o_id ?? null,
        });
    }
    const timers = [];
    for (let timer = game.gt?.timer_base; timer; timer = timer.next) {
        timers.push({
            tid: timer.tid,
            timeout: timer.timeout,
            kind: timer.kind,
            func_index: timer.func_index,
            arg_id: timer.arg?.o_id ?? null,
            next_tid: timer.next?.tid ?? null,
        });
    }
    return {
        shared: adjacentRefusalEffects(target),
        transient: {
            glyph: location.disp_glyph?.glyph ?? null,
            ch: location.disp_ch,
            color: location.disp_color,
            attr: location.disp_attr,
            gnew: location.gnew,
        },
        heroProperties: {
            blind: game.u.uprops[BLINDED].intrinsic,
            hallucinating: game.u.uprops[HALLUC].intrinsic,
            levitating: game.u.uprops[LEVITATION].intrinsic,
        },
        pile,
        timers,
    };
}

async function assertDirectItsDeadRefusal(target, branch) {
    const before = directItsDeadEffects(target);
    await assert.rejects(
        its_dead(target.x, target.y, game),
        (error) => {
            assert.equal(error.constructor, UnsupportedApplyError);
            assert.equal(error.name, 'UnsupportedApplyError');
            assert.equal(error.branch, branch);
            assert.equal(
                error.message, `applying a tool requires ${branch}`,
            );
            return true;
        },
    );
    assert.deepEqual(directItsDeadEffects(target), before, branch);
}

function isolatedItsDeadState() {
    const state = { ...game };
    state.level = new GameMap();
    state.u = structuredClone(game.u);
    state.youmonst = { ...game.youmonst };
    state.urole = { ...game.urole };
    state.mons = structuredClone(game.mons);
    state.objects = structuredClone(game.objects);
    state.obj_descr = structuredClone(game.obj_descr);
    state.nhDisplay = new GameDisplay(null);
    state.a11y = { glyph_updates: false };
    state._pending_message = '';
    state._ttyPreviousMessage = '';
    state._ttyToplines = '';
    state._ttyMessageStopped = false;
    state._emittingGlyphUpdateNotices = false;
    return state;
}

function placeStateCorpstat(state, otyp, { x, y }) {
    const obj = newObject({
        otyp,
        quan: 1,
        spe: CORPSTAT_RANDOM,
        corpsenm: PM_NEWT,
        ox: x,
        oy: y,
    });
    state.level.objects[x][y] = obj;
    state.level.objlist = obj;
    return obj;
}

function suppliedItsDeadEffects(state, target) {
    const location = state.level.at(target.x, target.y);
    const pile = [];
    for (let obj = state.level.objects[target.x][target.y]; obj;
        obj = obj.nexthere) {
        pile.push({
            otyp: obj.otyp,
            quan: obj.quan,
            spe: obj.spe,
            corpsenm: obj.corpsenm,
            dknown: obj.dknown,
            has_contents: Boolean(obj.cobj),
            cobj_otyp: obj.cobj?.otyp ?? null,
        });
    }
    return {
        pile,
        catalogName: [...state.mons[PM_NEWT].pmnames],
        rememberedGlyph: location.remembered_glyph?.glyph ?? null,
        transientGlyph: location.disp_glyph?.glyph ?? null,
        pendingMessage: state._pending_message,
        ttyToplines: state._ttyToplines,
        previousMessage: state._ttyPreviousMessage,
        display: {
            topMessage: state.nhDisplay.topMessage,
            toplines: state.nhDisplay.toplines,
            toplin: state.nhDisplay.toplin,
            messages: [...state.nhDisplay.messages],
            cursor: [
                state.nhDisplay.cursorCol, state.nhDisplay.cursorRow,
            ],
            firstRow: state.nhDisplay.grid[0].map(
                ({ ch, color, attr }) => [ch, color, attr],
            ),
        },
    };
}

// A monster of the kind that would answer the listen. The fields are the ones
// makemon() sets and js/monst.js newMonster() zeroes: place_monster() rejects
// a monster at zero hit points; mcansee and mcanmove clear are two of
// mstatusline()'s conditions, so leaving them zero would add ", blind" and
// ", can't move" to every line below; and cham stays 0, which is a real
// species index, so makemon.c:2953's NON_PM is needed or mstatusline() reads
// the newt as a shapechanger.
function monsterAt({ x, y }, overrides = {}) {
    const monster = place_monster(
        newMonster({
            data: game.mons[PM_NEWT],
            mhp: 3,
            mhpmax: 3,
            mcansee: 1,
            mcanmove: 1,
            cham: NON_PM,
            ...overrides,
        }), x, y, game,
    );
    monster.nmon = game.level.monlist;
    game.level.monlist = monster;
    return monster;
}

test('a listen at an empty adjacent square hears nothing special', async () => {
    await heroWithEmptyWest();
    assert.equal(await listenWest(), null);
    // apply.c:468. C writes it with You() rather than You_hear(), so the
    // sentence is not the one a deafened hero would be spared.
    assert.equal(pendingTopLine(), 'You hear nothing special.');
});

test('an off-map adjacent listen uses You_hear and always stays free',
    async () => {
    // This is the constructed live-consumer substitute authorized on
    // 2026-08-19. The exact setup starts the ordinary Healer fixture, makes
    // her valid boundary coordinate (1, uy) ROOM, assigns that coordinate to
    // u.ux, and drives doapply() with the starting stethoscope's `c` letter
    // and west direction `h`. The target (0, uy) fails cmd.c isok(). A declared
    // D:1 and D:2-D:30 search over 7,680 generated setups found no accessible
    // boundary coordinate, and every ported placement path preserves isok(),
    // so no valid recorder input could create this starting state.
    //
    // apply.c use_stethoscope():340-390 controls the writes, message, and
    // result. pline.c You_hear():435-451 supplies the acoustics gate, and the
    // no-sound-library half of sndprocs.h makes Soundeffect() a tty no-op. This
    // test reaches that code through doapply(), its production consumer. It
    // does not prove that a source-real input can place the hero here, compare
    // this unreachable arm against a C recording, or exercise a sound-library
    // backend. The checked-in fresh matrix instead guards every reachable
    // adjacent-listen sibling against regression.
    await heroWithEmptyWest();
    const edgeY = game.u.uy;
    game.level.at(1, edgeY).typ = ROOM;
    game.u.ux = 1;
    game.flags.acoustics = true;
    game.context.stethoscope_seq = game.hero_seq - 1;
    game.gb ??= {};
    game.gb.bhitpos = { x: 17, y: 9 };
    game.gn ??= {};
    game.gn.notonhead = true;

    const before = adjacentRefusalEffects({ x: 1, y: edgeY });
    const offMapCell = structuredClone(game.level.at(0, edgeY));
    for (const key of ['c', 'h']) game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(pendingTopLine(), 'You hear a faint typing noise.');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [0, edgeY + 1],
    );
    assert.equal(game.context.stethoscope_seq, game.hero_seq);
    assert.deepEqual(game.gb.bhitpos, { x: 1, y: edgeY });
    assert.equal(game.gn.notonhead, false);
    assert.equal((getRngLog() ?? []).length, before.rngCalls);
    assert.equal(game.moves, before.moves);
    assert.equal(game.context.move, before.contextMove);
    assert.deepEqual(game.level.at(0, edgeY), offMapCell);
    assert.deepEqual(
        adjacentRefusalEffects({ x: 1, y: edgeY }).terrain,
        before.terrain,
    );
    assert.deepEqual(
        adjacentRefusalEffects({ x: 1, y: edgeY }).screen,
        before.screen,
    );

    // The second listen sees the unchanged hero sequence and computes
    // ECMD_TIME, but apply.c:390 returns ECMD_OK unconditionally. The leading
    // space dismisses the first message before getobj() opens its prompt.
    game.gb.bhitpos = { x: COLNO - 1, y: ROWNO - 1 };
    game.gn.notonhead = true;
    for (const key of [' ', 'c', 'h'])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(pendingTopLine(), 'You hear a faint typing noise.');
    assert.deepEqual(game.gb.bhitpos, { x: 1, y: edgeY });
    assert.equal(game.gn.notonhead, false);
    assert.equal((getRngLog() ?? []).length, before.rngCalls);
    assert.equal(game.moves, before.moves);
    assert.equal(game.context.move, before.contextMove);

    // You_hear() suppresses the line when acoustics is disabled, while the
    // source-order shared writes and unconditional result remain the same.
    await heroWithEmptyWest();
    const quietY = game.u.uy;
    game.level.at(1, quietY).typ = ROOM;
    game.u.ux = 1;
    game.flags.acoustics = false;
    game.context.stethoscope_seq = game.hero_seq;
    game.gb ??= {};
    game.gb.bhitpos = { x: 23, y: 7 };
    game.gn ??= {};
    game.gn.notonhead = true;
    const quietBefore = adjacentRefusalEffects({ x: 1, y: quietY });
    for (const key of ['c', 'h']) game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(pendingTopLine(), quietBefore.pendingMessage);
    assert.equal(game.context.stethoscope_seq, game.hero_seq);
    assert.deepEqual(game.gb.bhitpos, { x: 1, y: quietY });
    assert.equal(game.gn.notonhead, false);
    assert.equal((getRngLog() ?? []).length, quietBefore.rngCalls);
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [0, 0],
    );
    assert.deepEqual(
        adjacentRefusalEffects({ x: 1, y: quietY }).screen,
        quietBefore.screen,
    );
});

test('use_stethoscope walks the adjacent square in apply.c order',
    async () => {
    // apply.c:386-390. isok() guards every reader below it, so the hero is
    // moved to the west edge, where the square she points at is off the map.
    // Without the guard js/const.js isok() would let levl[0][y] through.
    await heroWithEmptyWest();
    game.u.ux = 1;
    game.flags.acoustics = true;
    assert.equal(await listenWest(), null);
    assert.equal(pendingTopLine(), 'You hear a faint typing noise.');

    // apply.c:391-446 returns inside the monster arm, so nothing below it
    // runs. The secret door under the newt is what the port would answer with
    // if the m_at() test sat below the terrain switch: instead the listen
    // reports the newt and never mentions a hollow sound.
    const withMonster = await heroWithEmptyWest();
    monsterAt(withMonster);
    game.level.at(withMonster.x, withMonster.y).typ = SDOOR;
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'Status of the newt (neutral, tiny):  Level 0  HP 3(3)  AC 8.',
    );

    // apply.c:447-448 sits between the monster arm and the switch. A monster
    // standing on a remembered 'I' therefore leaves the marker alone, because
    // C returned two lines above it.
    const marked = await heroWithEmptyWest();
    map_invisible(marked.x, marked.y, game);
    monsterAt(marked);
    assert.equal(await listenWest(), null);
    assert.ok(glyph_is_invisible(
        game.level.at(marked.x, marked.y).remembered_glyph?.glyph),
    'the monster arm returns before unmap_invisible() clears the marker');

    // The same marker with no monster on it: the line runs, and it runs above
    // the switch, so the secret door is revealed afterwards.
    const movedOff = await heroWithEmptyWest();
    map_invisible(movedOff.x, movedOff.y, game);
    game.level.at(movedOff.x, movedOff.y).typ = SDOOR;
    assert.equal(await listenWest(1), null);
    assert.equal(
        pendingTopLine(),
        'The invisible monster must have moved.',
    );
    assert.equal(game.level.at(movedOff.x, movedOff.y).typ, DOOR);
    // display.c unmap_object() replaces the marker with the memory of what
    // lies under it rather than clearing the square, so the check is that the
    // 'I' is gone, not that nothing is remembered.
    assert.ok(!glyph_is_invisible(
        game.level.at(movedOff.x, movedOff.y).remembered_glyph?.glyph),
    'the marker is cleared before the switch reads the terrain');

    // apply.c:452-464, the two terrain arms, each above its_dead(). The corpse
    // underneath would stop the listen if the switch sat below it.
    for (const typ of [SDOOR, SCORR]) {
        const secret = await heroWithEmptyWest();
        floorCorpstat(CORPSE, secret);
        game.level.at(secret.x, secret.y).typ = typ;
        assert.equal(await listenWest(), null, String(typ));
    }
});

test('secret terrain changes the map, vision, display, and turn result',
    async () => {
    for (const [secretType, exposedType, message, symbol] of [
        [SDOOR, DOOR,
            'You hear a hollow sound.  This must be a secret door!', '+'],
        [SCORR, CORR,
            'You hear a hollow sound.  This must be a secret passage!', '#'],
    ]) {
        for (const acoustics of [true, false]) {
            const label = `${secretType}, acoustics ${acoustics}`;
            const target = await heroWithEmptyWest();
            const location = game.level.at(target.x, target.y);
            location.typ = secretType;
            location.flags = 0;
            location.doormask = 0;
            game.flags.acoustics = acoustics;
            game.vision_full_recalc = 0;
            const priorMessage = pendingTopLine();

            for (const key of ['c', 'h'])
                game.nhDisplay.pushKey(key.charCodeAt(0));
            assert.equal(await doapply(game), ECMD_OK, label);
            assert.equal(
                pendingTopLine(), acoustics ? message : priorMessage, label,
            );
            assert.equal(location.typ, exposedType, label);
            assert.equal(location.flags,
                secretType === SDOOR ? D_CLOSED : 0, label);
            assert.equal(location.doormask,
                secretType === SDOOR ? D_CLOSED : 0, label);
            assert.equal(location.disp_ch, symbol, label);
            assert.equal(game.vision_full_recalc, 1, label);

            // The next listen in the same hero sequence costs the turn. Only
            // the acoustics-on case has a first line to dismiss before
            // getobj() asks for the tool.
            const keys = acoustics ? [' ', 'c', 'h'] : ['c', 'h'];
            for (const key of keys)
                game.nhDisplay.pushKey(key.charCodeAt(0));
            assert.equal(await doapply(game), ECMD_TIME, label);
        }
    }
});

// The first of the two messages a listen prints when it prints two. It is
// flushed to the grid when the second overflows the top line, while the second
// stays pending.
async function listenLine() {
    assert.equal(await listenWest(1), null);
    return topLine().replace(/--More--$/u, '');
}

// A mimic wearing an object, as makemon()'s set_mimic_sym() leaves one.
function mimicAt({ x, y }, appearance, overrides = {}) {
    return monsterAt({ x, y }, {
        data: game.mons[PM_SMALL_MIMIC],
        // monst.c's small mimic row: level 7, AC 7, MZ_MEDIUM, neutral. The
        // hit points are the ones seed5002-wizard-coverage-pair's mimic rolled,
        // so the line below is the one that session's C screen shows.
        m_lev: 6,
        mhp: 22,
        mhpmax: 22,
        m_ap_type: M_AP_OBJECT,
        mappearance: appearance,
        ...overrides,
    });
}

// The newt's own row in monst.c: level 0, AC 8, MZ_TINY, neutral. Every
// mstatusline() case below prints this line with its `info` clause appended.
const NEWT_STATUS = 'Status of the newt (neutral, tiny):  Level 0  HP 3(3)'
    + '  AC 8';

test('the monster arm answers in apply.c branch order', async () => {
    // apply.c:400-403, the first arm. A hidden monster cannot be spotted, so
    // C names it before revealing it, and the reveal is what lets
    // mstatusline() print a line for a monster the hero could not see.
    const hidden = await heroWithEmptyWest();
    const piercer = monsterAt(hidden, { mundetected: 1 });
    assert.equal(await listenWest(1), null);
    assert.equal(piercer.mundetected, 0);
    assert.equal(pendingTopLine(), `${NEWT_STATUS}.`);

    // apply.c:404 is an `else if`, so a monster that is both hidden and
    // disguised takes the arm above and keeps its disguise; insight.c:3316
    // then reads that surviving m_ap_type. The remembered glyph under this
    // hand-placed mimic lets pager.c mhidden_description() name the chest.
    const both = await heroWithEmptyWest();
    const disguised = mimicAt(both, CHEST, { mundetected: 1 });
    assert.equal(await listenWest(2), null);
    assert.equal(disguised.mundetected, 0);
    assert.equal(disguised.m_ap_type & M_AP_TYPMASK, M_AP_OBJECT);
    assert.equal(
        game._ttyToplines,
        'Status of the small mimic (neutral, medium):  Level 6  HP 22(22)'
        + '  AC 7, mimicking a chest.',
    );

    // insight.c passes MHID_ALTMON, so a surviving monster appearance is
    // included even though pager.c's look-at caller deliberately omits it.
    const shapedAndHidden = await heroWithEmptyWest();
    mimicAt(shapedAndHidden, PM_NEWT, {
        m_ap_type: M_AP_MONSTER,
        mundetected: 1,
    });
    assert.equal(await listenWest(2), null);
    assert.equal(
        game._ttyToplines,
        'Status of the newt (neutral, medium):  Level 6  HP 22(22)  AC 7,'
        + ' masquerading as a newt.',
    );

    // apply.c:438-439, the last arm. An invisible monster is neither hidden
    // nor disguised, so it is announced under flags.verbose and then, at
    // apply.c:444-445, remembered on the map as an 'I'.
    const unseen = await heroWithEmptyWest();
    monsterAt(unseen, { minvis: true });
    assert.equal(await listenWest(1), null);
    assert.equal(pendingTopLine(), `${NEWT_STATUS}, invisible.`);
    assert.ok(glyph_is_invisible(
        game.level.at(unseen.x, unseen.y).remembered_glyph?.glyph),
    'an unspottable monster leaves a remembered invisible marker');

    // flags.verbose guards only the announcement. The report and the marker
    // below it are printed either way, so the quiet listen raises no --More--.
    const quiet = await heroWithEmptyWest();
    game.flags.verbose = false;
    monsterAt(quiet, { minvis: true });
    assert.equal(await listenWest(), null);
    assert.equal(pendingTopLine(), `${NEWT_STATUS}, invisible.`);
    assert.ok(glyph_is_invisible(
        game.level.at(quiet.x, quiet.y).remembered_glyph?.glyph));

    // A monster the hero can spot gets neither the announcement nor the
    // marker, which is what makes the canspotmon() test at apply.c:444 do
    // something rather than mark every square a listen touched.
    const seen = await heroWithEmptyWest();
    monsterAt(seen);
    assert.equal(await listenWest(), null);
    assert.equal(pendingTopLine(), `${NEWT_STATUS}.`);
    assert.ok(!glyph_is_invisible(
        game.level.at(seen.x, seen.y).remembered_glyph?.glyph));

    // Both x_monnam() calls pass `called` FALSE -- apply.c:393 and
    // insight.c:3393 -- so a monster the player has named is reported under
    // that name alone, in the announcement and in the report. TRUE would
    // answer "the newt called Rex" in both.
    const named = await heroWithEmptyWest();
    monsterAt(named, { minvis: true, mextra: { mgivenname: 'Rex' } });
    assert.equal(await listenLine(), 'There is Rex there.');
    assert.equal(
        pendingTopLine(),
        'Status of Rex (neutral, tiny):  Level 0  HP 3(3)  AC 8, invisible.',
    );

    // apply.c:396-397. gn.notonhead is FALSE while the monster stands on the
    // square the listen pointed at. Only a long worm can answer m_at()
    // somewhere other than its own <mx,my>, and insight.c:3290 stops for one,
    // but the write happens at :397, well above that stop.
    const wormHead = await heroWithEmptyWest();
    monsterAt(wormHead, { data: game.mons[PM_LONG_WORM] });
    await assert.rejects(listenWest(), UnsupportedEnlightenmentError);
    assert.equal(game.gb.bhitpos.x, wormHead.x);
    assert.equal(game.gb.bhitpos.y, wormHead.y);
    assert.equal(game.gn.notonhead, false);

    // The same worm with its head one square further on, which is what a tail
    // segment under the stethoscope looks like: the two coordinates disagree
    // one at a time, so neither half of the comparison can be dropped.
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const tail = await heroWithEmptyWest();
        const worm = monsterAt(tail, { data: game.mons[PM_LONG_WORM] });
        worm.mx += dx;
        worm.my += dy;
        await assert.rejects(listenWest(), UnsupportedEnlightenmentError);
        assert.equal(game.gn.notonhead, true, `${dx},${dy}`);
    }
});

test('a listened-to mimic is exposed and named by what it was wearing',
    async () => {
    // apply.c:406-436 over mkobj.c init_dummyobj(), objnam.c
    // simple_typename() and mon.c seemimic(). This is the pair of lines
    // seed5002-wizard-coverage-pair records, and their combined length is
    // what forces the --More-- between them.
    const chestGround = await heroWithEmptyWest();
    const chest = mimicAt(chestGround, CHEST);
    assert.equal(await listenWest(1), null);
    assert.equal(chest.m_ap_type, 0);
    assert.equal(chest.mappearance, 0);
    assert.equal(
        pendingTopLine(),
        'Status of the small mimic (neutral, medium):  Level 6  HP 22(22)'
        + '  AC 7.',
    );

    // apply.c:422. Boots, gloves and lenses take a plural demonstrative and a
    // plural verb, which is the only place `use_plural` shows. The shoes are
    // named by their description, which o_init.c shuffles per game; the
    // matrix segment's seed and datetime are fixed, so it is the same string
    // every run.
    const bootGround = await heroWithEmptyWest();
    mimicAt(bootGround, LOW_BOOTS);
    assert.equal(await listenLine(),
        'Those pair of walking shoes are really a small mimic.');

    // The other two kinds apply.c:422 names, so no operand of that disjunct
    // can be dropped: gloves reach it through is_gloves(), and lenses are the
    // one object type named there outright.
    const gloveGround = await heroWithEmptyWest();
    mimicAt(gloveGround, LEATHER_GLOVES);
    // Named rather than described, because u_init.c gives this Healer a pair
    // and ini_inv_use_obj() discovers the type at startup.
    assert.equal(await listenLine(),
        'Those pair of leather gloves are really a small mimic.');
    const lensGround = await heroWithEmptyWest();
    mimicAt(lensGround, LENSES);
    assert.equal(await listenLine(), 'Those lenses are really a small mimic.');

    // A type whose full name carries a parenthesized description: objnam.c
    // simple_typename() cuts it, so the mimic is "a ring" rather than "a ring
    // (black onyx)".
    const ringGround = await heroWithEmptyWest();
    mimicAt(ringGround, RIN_PROTECTION);
    assert.equal(await listenLine(), 'That ring is really a small mimic.');

    // apply.c:418-421 and :426-427. Named-fruit disguises retain the fruit id
    // set_mimic_sym() saved, while furniture reads drawing.c defsyms[]'s
    // source-generated explanation.
    for (const [appearance, overrides, expected] of [
        [SLIME_MOLD,
            { mextra: { mcorpsenm: game.context.current_fruit } },
            'That slime mold is really a small mimic.'],
        [S_altar, { m_ap_type: M_AP_FURNITURE },
            'That altar is really a small mimic.'],
    ]) {
        const ground = await heroWithEmptyWest();
        mimicAt(ground, appearance, overrides);
        assert.equal(await listenLine(), expected);
    }

    // apply.c:423-424 and do_name.c:907-910. x_monnam() names the apparent
    // species before seemimic() reveals the real one, and the switch uses the
    // same apparent species for `what`. This is why C's line says "newt"
    // twice even though mstatusline() below reports the small mimic.
    const shaped = await heroWithEmptyWest();
    mimicAt(shaped, PM_NEWT, { m_ap_type: M_AP_MONSTER });
    assert.equal(await listenLine(), 'That newt is really a newt.');

    // apply.c:410's SLIME_MOLD test is a pair, and the second half is what
    // C's comment there is about: a slime-mold disguise carrying no corpse
    // species falls to simple_typename(), which answers the type description
    // "fruit" rather than the fruit the mimic is pretending to be.
    const moldGround = await heroWithEmptyWest();
    mimicAt(moldGround, SLIME_MOLD);
    assert.equal(await listenLine(), 'That fruit is really a small mimic.');
});

test('mstatusline appends the conditions insight.c names, in its order',
    async () => {
    // insight.c:3277-3388. Every row is one condition and the clause it adds
    // after the armor class; the rows are in the order C appends them, so a
    // port that moved one would still pass each row alone and fail the pair at
    // the end. Ordinary game, so `wizard` is false and the tame arm's
    // debugging detail is left off.
    for (const [overrides, info] of [
        [{ mtame: 5 }, ', tame'],
        [{ mpeaceful: 1 }, ', peaceful'],
        // insight.c:3286 is an `else if`: a tame monster is never "peaceful".
        [{ mtame: 5, mpeaceful: 1 }, ', tame'],
        // insight.c:3305. mons[PM_GNOME] is not the newt this monster is, so
        // its current form is not its innate one.
        [{ cham: PM_GNOME }, ', shapechanger'],
        [{ meating: 3 }, ', eating'],
        [{ mcan: true }, ', cancelled'],
        [{ mconf: true }, ', confused'],
        // insight.c:3325 is a disjunct: either field alone says blind.
        [{ mblinded: 4 }, ', blind'],
        [{ mcansee: 0 }, ', blind'],
        [{ mstun: true }, ', stunned'],
        // insight.c:3329-3341, one chain of three.
        [{ msleeping: true }, ', asleep'],
        [{ mcanmove: 0 }, ", can't move"],
        [{ mfrozen: 2 }, ", can't move"],
        [{ msleeping: true, mfrozen: 2 }, ', asleep'],
        [{ mstrategy: STRAT_WAITFORU }, ', meditating'],
        [{ mcanmove: 0, mstrategy: STRAT_WAITFORU }, ", can't move"],
        [{ mflee: true }, ', scared'],
        [{ mtrapped: true }, ', trapped'],
        // monst.h:207-208 and the third arm C keeps for a value that is
        // neither.
        [{ mspeed: MFAST }, ', fast'],
        [{ mspeed: MSLOW }, ', slow'],
        [{ mspeed: 3 }, ', [? speed]'],
        [{ mleashed: true }, ', leashed'],
        // Two at once, from opposite ends of the sequence.
        [{ mpeaceful: 1, mblinded: 1 }, ', peaceful, blind'],
    ]) {
        const ground = await heroWithEmptyWest();
        monsterAt(ground, overrides);
        assert.equal(await listenWest(), null, JSON.stringify(overrides));
        // A tame monster is "your newt"; every other row is "the newt".
        const name = overrides.mtame ? 'your' : 'the';
        assert.equal(
            pendingTopLine(),
            `Status of ${name} newt (neutral, tiny):  Level 0  HP 3(3)`
            + `  AC 8${info}.`,
            JSON.stringify(overrides),
        );
    }
});

test('a debug game reports a pet\'s tameness, hunger and apport', async () => {
    // insight.c:3281-3288, the arm playmode:debug turns on. It is not a
    // developer aside that can be dropped: seed5002-wizard-coverage-pair and
    // every fresh case recorded with ^V or ^G run with `wizard` set, so a
    // listen at a pet in one of them prints this.
    const ground = await heroWithEmptyWest();
    game.wizard = true;
    monsterAt(ground, {
        mtame: 5,
        mextra: { edog: { hungrytime: 1, apport: 2 } },
    });
    // 91 characters, so win/tty/topl.c wraps it and asks for a --More--
    // before the caller sees it; the wrapped text stays in gt.toplines.
    assert.equal(await listenWest(1), null);
    assert.equal(
        game._ttyToplines,
        'Status of your newt (neutral, tiny):  Level 0  HP 3(3)  AC 8'
        + ', tame (5; hungry 1; apport 2).',
    );

    // insight.c:3283's !isminion guard. A tame minion has no EDOG to read, so
    // dropping the guard would throw a TypeError here instead of reaching
    // x_monnam(), which refuses a minion at insight.c:3392.
    const minionGround = await heroWithEmptyWest();
    game.wizard = true;
    monsterAt(minionGround, { mtame: 5, isminion: true });
    await assert.rejects(listenWest(), UnsupportedMonsterNameError);
});

test('mstatusline stops on the three clauses that need unported source',
    async () => {
    // insight.c:3290-3303, the long-worm segment count, which needs worm.c
    // count_wsegs() and wseg_at().
    const worm = await heroWithEmptyWest();
    monsterAt(worm, { data: game.mons[PM_LONG_WORM] });
    await assert.rejects(listenWest(), UnsupportedEnlightenmentError);

    // insight.c:3316-3318's third term. gb.bhitpos is the square the listen
    // pointed at, not the hero's, so a cloud over the monster reaches
    // mhidden_description() while the hero stands in clear air. The region's
    // default cmap is harmless vapor rather than poison gas.
    const clouded = await heroWithEmptyWest();
    monsterAt(clouded);
    const region = create_region([
        { lx: clouded.x, ly: clouded.y, hx: clouded.x, hy: clouded.y },
    ]);
    region.visible = true;
    game.level.regions.push(region);
    assert.equal(await listenWest(1), null);
    assert.equal(
        game._ttyToplines,
        `${NEWT_STATUS}, in a cloud of vapor.`,
    );
    game.level.regions.pop();

    // insight.c:3355-3373 and :3374-3387, the two clauses about a monster that
    // has hold of the hero or is carrying her. Neither is reachable from a
    // listen in an ordinary game, and both need source the goal leaves out.
    const holder = await heroWithEmptyWest();
    game.u.ustuck = monsterAt(holder);
    await assert.rejects(listenWest(), UnsupportedEnlightenmentError);
    game.u.ustuck = null;

    const steed = await heroWithEmptyWest();
    game.u.usteed = monsterAt(steed);
    await assert.rejects(listenWest(), UnsupportedEnlightenmentError);
    game.u.usteed = null;
});

test('its_dead reports singular, stacked, and separated corpses', async () => {
    // apply.c:261-279. The first listen of a hero sequence is free, and a
    // single corpse object with quantity one takes every singular operand.
    const single = await heroWithEmptyWest();
    floorCorpstat(CORPSE, single);
    for (const key of ['c', 'h']) game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(
        pendingTopLine(),
        'You determine that that unfortunate being is dead.',
    );

    // A second listen in the same hero sequence returns ECMD_TIME. Dismiss
    // the first message before the object and direction prompts are drawn.
    for (const key of [' ', 'c', 'h'])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_TIME);

    // corpse->quan alone makes the message plural.
    const stacked = await heroWithEmptyWest();
    floorCorpstat(CORPSE, stacked).quan = 2;
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'You determine that those unfortunate beings are dead.',
    );

    // A second corpse object does the same through nxtobj(), even with an
    // unrelated object between them on the nexthere pile chain.
    const separated = await heroWithEmptyWest();
    floorCorpstat(CORPSE, separated);
    mksobj_at(ROCK, separated.x, separated.y, false, false,
        objectGenerationEnv({ state: game }));
    const upper = floorCorpstat(CORPSE, separated);
    // The level-wide ownership chain can leave this square immediately;
    // nxtobj(..., TRUE) must use nexthere and still find the lower corpse.
    upper.nobj = null;
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'You determine that those unfortunate beings are dead.',
    );
});

test('its_dead maps only a blind mismatched corpse glyph', async () => {
    // apply.c:261-265. Start with the selected corpse already in the transient
    // buffer. The unrelated map-memory sentinel proves that an equal logical
    // glyph skips map_object(): comparing presentation objects by identity
    // would repaint it even though C's two integer glyphs are equal.
    const equal = await heroWithEmptyWest();
    const equalCorpse = floorCorpstat(CORPSE, equal);
    game.a11y ??= {};
    game.a11y.glyph_updates = true;
    const equalGlyph = obj_to_glyph(equalCorpse, game);
    show_glyph_cell(equal.x, equal.y, equalGlyph);
    const equalMemory = { glyph: equalGlyph.glyph + 1 };
    game.level.at(equal.x, equal.y).remembered_glyph = equalMemory;
    game.u.uprops[BLINDED].intrinsic = 1;

    assert.equal(glyph_at(equal.x, equal.y, game), equalGlyph.glyph);
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'You determine that that unfortunate being is dead.',
    );
    assert.equal(
        game.level.at(equal.x, equal.y).remembered_glyph,
        equalMemory,
        'an equal transient glyph skips map_object()',
    );

    // display.c glyph_at() has its own bounds guard, wider than isok(). Its
    // fallback is the logical room number, not a room presentation record.
    const roomGlyph = cmap_to_glyph(S_room, game);
    assert.equal(glyph_at(-1, equal.y, game), roomGlyph);
    assert.equal(glyph_at(COLNO, equal.y, game), roomGlyph);
    assert.equal(glyph_at(equal.x, -1, game), roomGlyph);
    assert.equal(glyph_at(equal.x, ROWNO, game), roomGlyph);
    // clear_glyph_buffer() fills every in-bounds third-screen entry with
    // GLYPH_UNEXPLORED. The JS buffer represents the cleared record as null,
    // but glyph_at() still returns that logical number rather than undefined.
    game.level.at(equal.x, equal.y).disp_glyph = null;
    assert.equal(
        glyph_at(equal.x, equal.y, game), GLYPH_UNEXPLORED_OFF,
    );
    // Column zero and row zero are inside glyph_at()'s C buffer even though
    // ordinary movement never uses column zero. Put a non-room number at each
    // edge so turning either `< 0` guard into `<= 0` is observable.
    show_glyph_cell(0, equal.y, equalGlyph);
    show_glyph_cell(equal.x, 0, equalGlyph);
    assert.equal(glyph_at(0, equal.y, game), equalGlyph.glyph);
    assert.equal(glyph_at(equal.x, 0, game), equalGlyph.glyph);

    // Sightedness gates map_object() independently from the glyph comparison.
    // A visible apple above the selected corpse gives different logical IDs,
    // but a sighted listen leaves both the transient glyph and memory alone.
    const sighted = await heroWithEmptyWest();
    const sightedCorpse = floorCorpstat(CORPSE, sighted);
    const sightedApple = mksobj_at(
        APPLE, sighted.x, sighted.y, false, false,
        objectGenerationEnv({ state: game }),
    );
    const sightedCorpseGlyph = obj_to_glyph(sightedCorpse, game);
    const sightedAppleGlyph = obj_to_glyph(sightedApple, game);
    assert.notEqual(sightedAppleGlyph.glyph, sightedCorpseGlyph.glyph);
    show_glyph_cell(sighted.x, sighted.y, sightedAppleGlyph);
    const sightedMemory = remembered_glyph_from_presentation(
        sightedAppleGlyph,
    );
    game.level.at(sighted.x, sighted.y).remembered_glyph = sightedMemory;

    assert.equal(await listenWest(), null);
    assert.equal(
        glyph_at(sighted.x, sighted.y, game), sightedAppleGlyph.glyph,
    );
    assert.equal(
        game.level.at(sighted.x, sighted.y).remembered_glyph, sightedMemory,
    );

    // The other source branch: an apple is above the corpse. With color off,
    // both presentations are the same `%`, but their glyph ranges and IDs are
    // different. map_object() must update both the transient buffer and map
    // memory with the corpse, including the non-enumerable accessibility
    // subject that names what was mapped.
    const different = await heroWithEmptyWest();
    const hiddenCorpse = floorCorpstat(CORPSE, different);
    const apple = mksobj_at(APPLE, different.x, different.y, false, false,
        objectGenerationEnv({ state: game }));
    game.iflags.wc_color = false;
    game.a11y ??= {};
    game.a11y.glyph_updates = true;
    const corpseGlyph = obj_to_glyph(hiddenCorpse, game);
    const appleGlyph = obj_to_glyph(apple, game);
    assert.deepEqual({ ...appleGlyph }, { ...corpseGlyph });
    assert.notEqual(appleGlyph.glyph, corpseGlyph.glyph);
    show_glyph_cell(different.x, different.y, appleGlyph);
    game.level.at(different.x, different.y).remembered_glyph
        = remembered_glyph_from_presentation(appleGlyph);
    game.u.uprops[BLINDED].intrinsic = 1;

    assert.equal(await listenWest(), null);
    const mapped = game.level.at(different.x, different.y);
    assert.equal(glyph_at(different.x, different.y, game), corpseGlyph.glyph);
    assert.equal(mapped.remembered_glyph.glyph, corpseGlyph.glyph);
    assert.deepEqual(mapped.disp_glyph.a11ySubject, {
        type: 'object', generic: false, otyp: CORPSE,
        oclass: hiddenCorpse.oclass, corpsenm: PM_NEWT,
    });
    assert.deepEqual(
        mapped.remembered_glyph.a11ySubject,
        mapped.disp_glyph.a11ySubject,
    );
    assert.equal(
        mapped.disp_glyph.a11yIdentity,
        `object:corpse:${PM_NEWT}`,
    );
    assert.ok(!Object.keys(mapped.disp_glyph).includes('glyph'));
    assert.ok(!Object.keys(mapped.disp_glyph).includes('a11ySubject'));
    assert.ok(!Object.keys(mapped.remembered_glyph).includes('a11ySubject'));
});

test('map_object rejects foreign state before observation or display writes',
    async () => {
    const target = await heroWithEmptyWest();
    const potion = mksobj_at(
        POT_WATER, target.x, target.y, false, false,
        objectGenerationEnv({ state: game }),
    );
    potion.dknown = false;
    const location = game.level.at(target.x, target.y);
    const remembered = location.remembered_glyph;
    const displayed = location.disp_glyph;

    assert.throws(
        () => map_object(potion, true, { ...game }),
        {
            name: 'TypeError',
            message: 'map_object() draws to the global game',
        },
    );
    assert.equal(potion.dknown, false);
    assert.equal(location.remembered_glyph, remembered);
    assert.equal(location.disp_glyph, displayed);
});

test('blind its_dead keeps the ordinary plural grammar', async () => {
    // Blindness changes only the optional map_object() call. A stack quantity
    // still selects every plural operand in apply.c:276-278.
    const target = await heroWithEmptyWest();
    const corpse = floorCorpstat(CORPSE, target);
    corpse.quan = 2;
    show_glyph_cell(target.x, target.y, obj_to_glyph(corpse, game));
    game.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'You determine that those unfortunate beings are dead.',
    );
});

test('its_dead reports ordinary statues through obj_pmname and The',
    async () => {
        // apply.c:281-307. Each row reaches the real doapply() consumer and
        // pins a naming decision that its_dead() delegates to do_name.c or
        // objnam.c. The first listen in a hero sequence remains free.
        for (const { corpsenm, spe, message } of [
            {
                corpsenm: PM_NEWT,
                spe: CORPSTAT_RANDOM,
                message: 'The newt is in fine health for a statue.',
            },
            {
                corpsenm: PM_GNOME_RULER,
                spe: CORPSTAT_FEMALE,
                message: 'The gnome queen is in fine health for a statue.',
            },
            {
                corpsenm: PM_ALIGNED_CLERIC,
                spe: CORPSTAT_RANDOM,
                message: 'The cleric is in fine health for a statue.',
            },
            {
                corpsenm: PM_ALIGNED_CLERIC,
                spe: CORPSTAT_NEUTER,
                message: 'The aligned cleric is in fine health for a statue.',
            },
            {
                corpsenm: PM_MEDUSA,
                spe: CORPSTAT_FEMALE,
                message: 'Medusa is in fine health for a statue.',
            },
            {
                corpsenm: PM_ARCHON,
                spe: CORPSTAT_RANDOM,
                message: 'The Archon is in fine health for a statue.',
            },
        ]) {
            const target = await heroWithEmptyWest();
            Object.assign(floorCorpstat(STATUE, target), { corpsenm, spe });
            for (const key of ['c', 'h'])
                game.nhDisplay.pushKey(key.charCodeAt(0));
            assert.equal(await doapply(game), ECMD_OK, message);
            assert.equal(pendingTopLine(), message);
        }

        // A second listen without a move between finds the same statue and
        // returns the costly result. Space dismisses the first report before
        // the second object and direction prompts.
        const charged = await heroWithEmptyWest();
        floorCorpstat(STATUE, charged);
        for (const key of ['c', 'h'])
            game.nhDisplay.pushKey(key.charCodeAt(0));
        assert.equal(await doapply(game), ECMD_OK);
        for (const key of [' ', 'c', 'h'])
            game.nhDisplay.pushKey(key.charCodeAt(0));
        assert.equal(await doapply(game), ECMD_TIME);

        // sobj_at() selects the upper statue even with an unrelated object in
        // between, so a statue-only pile is not reduced to a single object.
        const piled = await heroWithEmptyWest();
        floorCorpstat(STATUE, piled);
        mksobj_at(ROCK, piled.x, piled.y, false, false,
            objectGenerationEnv({ state: game }));
        const upper = floorCorpstat(STATUE, piled);
        upper.corpsenm = PM_GNOME_RULER;
        upper.spe = CORPSTAT_FEMALE;
        assert.equal(await listenWest(), null);
        assert.equal(
            pendingTopLine(),
            'The gnome queen is in fine health for a statue.',
        );
    });

test('its_dead reports blind statues by location and body shape', async () => {
    // apply.c:285-290. An adjacent nonhumanoid statue takes every false arm:
    // u_at() chooses "That" and mondata.h humanoid() chooses "creature".
    // The result still follows use_stethoscope()'s one-free-listen rule.
    const creature = await heroWithEmptyWest();
    floorCorpstat(STATUE, creature);
    game.u.uprops[BLINDED].intrinsic = 1;
    for (const key of ['c', 'h']) game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(
        pendingTopLine(),
        'That creature is in fine health for a statue.',
    );
    for (const key of [' ', 'c', 'h'])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_TIME);

    // A gnome has M1_HUMANOID, so the same adjacent production path selects
    // "person" without consulting the statue's visible species name.
    const person = await heroWithEmptyWest();
    floorCorpstat(STATUE, person).corpsenm = PM_GNOME;
    game.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'That person is in fine health for a statue.',
    );

    // use_stethoscope() cannot call its_dead() on the hero's square until its
    // vertical arm is ported. Drive the source helper directly to pin the
    // other u_at() polarity without widening that command boundary.
    await heroWithEmptyWest();
    floorCorpstat(STATUE, { x: game.u.ux, y: game.u.uy }).corpsenm = PM_GNOME;
    game.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(await its_dead(game.u.ux, game.u.uy, game), true);
    assert.equal(
        pendingTopLine(),
        'This person is in fine health for a statue.',
    );
});

test('its_dead selects the uppermost dead object in a mixed pile', async () => {
    // apply.c:203-220. place_object() prepends each non-boulder, so this pile
    // is corpse, rock, statue. The lower statue's contents are exceptional for
    // a Healer, but C clears the lower kind before it checks either object arm.
    // The unrelated rock proves the decision follows nxtobj(..., TRUE) rather
    // than assuming the two dead objects are adjacent in the pile.
    const corpseTarget = await heroWithEmptyWest();
    const ignoredFilledStatue = floorCorpstat(STATUE, corpseTarget);
    ignoredFilledStatue.cobj = newObject({ otyp: ROCK, quan: 1 });
    mksobj_at(ROCK, corpseTarget.x, corpseTarget.y, false, false,
        objectGenerationEnv({ state: game }));
    const selectedCorpse = floorCorpstat(CORPSE, corpseTarget);
    selectedCorpse.corpsenm = PM_SMALL_MIMIC;
    const corpseBefore = directItsDeadEffects(corpseTarget);

    assert.deepEqual(
        corpseBefore.pile.map(({ otyp }) => otyp),
        [CORPSE, ROCK, STATUE],
    );
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'You determine that that unfortunate being is dead.',
    );
    const corpseAfter = directItsDeadEffects(corpseTarget);
    assert.deepEqual(corpseAfter.pile, corpseBefore.pile);
    assert.deepEqual(corpseAfter.timers, corpseBefore.timers);
    assert.equal(
        corpseAfter.shared.rngCalls, corpseBefore.shared.rngCalls,
    );

    // Authorized constructed live-consumer substitute, 2026-08-19. The exact
    // reverse setup starts from the ordinary Healer fixture, places a newt
    // corpse on the adjacent west square, starts REVIVE_MON on it, places a
    // rock above it, then places a newt statue uppermost. It drives that pile
    // through doapply() with the starting stethoscope's `c` slot and west `h`
    // direction. Direct `newt statue` and `statue of a newt` wishes are
    // refused, no other ported player command places a statue, and dropping a
    // wished corpse onto a generated statue only constructs the opposite
    // corpse-upper order. The source-route inventory therefore has no ported
    // constructor for statue above corpse; no finite seed scan is claimed.
    //
    // apply.c its_dead():203-220 and invent.c nxtobj():1477-1491 select the
    // upper statue; apply.c:223-307 then ignores the lower corpse's timer and
    // uses the already-differentially-proven statue report. This test exercises
    // the real doapply() consumer and pins both command results, exact output,
    // terminal attributes and cursor, PRNG count, pile/timer preservation, and
    // the next unread key. It cannot prove that an unported future input will
    // build the same pile or compare this reverse order with a C recording;
    // the checked-in seed-55 recipe proves the source-real corpse-upper order
    // and all reachable rendering/result behavior against C.
    const statueTarget = await heroWithEmptyWest();
    const ignoredTimedCorpse = floorCorpstat(CORPSE, statueTarget);
    start_timer(
        100, TIMER_OBJECT, REVIVE_MON, ignoredTimedCorpse, game,
    );
    mksobj_at(ROCK, statueTarget.x, statueTarget.y, false, false,
        objectGenerationEnv({ state: game }));
    const selectedStatue = floorCorpstat(STATUE, statueTarget);
    // The level-wide nobj chain is independent from the per-square nexthere
    // chain C passes to nxtobj() here. Ending nobj at the upper statue makes a
    // false by_nexthere argument select the timed corpse and fail this case.
    selectedStatue.nobj = null;
    const statueBefore = directItsDeadEffects(statueTarget);
    const lowerRowsBefore = game.nhDisplay.grid.slice(1).map(
        (row) => row.map(({ ch, color, attr }) => ({ ch, color, attr })),
    );
    const statueMessage = 'The newt is in fine health for a statue.';

    assert.deepEqual(
        statueBefore.pile.map(({ otyp }) => otyp),
        [STATUE, ROCK, CORPSE],
    );
    for (const key of ['c', 'h', 'x'])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(pendingTopLine(), statueMessage);
    assert.equal(game.nhDisplay.inputQueueLength, 1);
    assert.equal(game.context.stethoscope_seq, game.hero_seq);
    assert.equal(game.moves, statueBefore.shared.moves);
    assert.equal(game.context.move, statueBefore.shared.contextMove);
    let statueAfter = directItsDeadEffects(statueTarget);
    assert.deepEqual(statueAfter.pile, statueBefore.pile);
    assert.deepEqual(statueAfter.timers, statueBefore.timers);
    assert.equal(
        statueAfter.shared.rngCalls, statueBefore.shared.rngCalls,
    );

    await flush_screen(1);
    assert.deepEqual(
        game.nhDisplay.grid[0],
        [...statueMessage.padEnd(80)].map((ch, index) => ({
            ch,
            color: index < statueMessage.length ? NO_COLOR : CLR_GRAY,
            attr: 0,
        })),
    );
    assert.deepEqual(
        game.nhDisplay.grid.slice(1).map(
            (row) => row.map(({ ch, color, attr }) => ({ ch, color, attr })),
        ),
        lowerRowsBefore,
    );
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow],
        [game.u.ux - 1, game.u.uy + 1],
    );

    // Consume only the sentinel from the first call, then leave a different
    // one behind the second. Space dismisses the first report. With no hero
    // action between listens, apply.c:367-368 changes only the returned command
    // result; the chosen pile and the branch's zero PRNG calls stay the same.
    assert.equal(await game.nhDisplay.readKey(), 'x'.charCodeAt(0));
    for (const key of [' ', 'c', 'h', 'y'])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_TIME);
    assert.equal(pendingTopLine(), statueMessage);
    assert.equal(game.nhDisplay.inputQueueLength, 1);
    assert.equal(await game.nhDisplay.readKey(), 'y'.charCodeAt(0));
    statueAfter = directItsDeadEffects(statueTarget);
    assert.deepEqual(statueAfter.pile, statueBefore.pile);
    assert.deepEqual(statueAfter.timers, statueBefore.timers);
    assert.equal(
        statueAfter.shared.rngCalls, statueBefore.shared.rngCalls,
    );

    // The same selection controls the exceptional branch when the upper dead
    // object is the corpse. The direct source-helper call pins the full mixed
    // pile and timer list across that refusal.
    const timedCorpseTarget = await heroWithEmptyWest();
    floorCorpstat(STATUE, timedCorpseTarget);
    mksobj_at(ROCK, timedCorpseTarget.x, timedCorpseTarget.y, false, false,
        objectGenerationEnv({ state: game }));
    const selectedTimedCorpse = floorCorpstat(CORPSE, timedCorpseTarget);
    start_timer(
        100, TIMER_OBJECT, REVIVE_MON, selectedTimedCorpse, game,
    );
    await assertDirectItsDeadRefusal(
        timedCorpseTarget, 'a corpse with a REVIVE_MON timer',
    );

    // The reverse order selects the filled statue and ignores the lower
    // corpse. Contents now affect only the selected statue's adjective.
    const filledStatueTarget = await heroWithEmptyWest();
    floorCorpstat(CORPSE, filledStatueTarget);
    mksobj_at(ROCK, filledStatueTarget.x, filledStatueTarget.y, false, false,
        objectGenerationEnv({ state: game }));
    const selectedFilledStatue = floorCorpstat(STATUE, filledStatueTarget);
    selectedFilledStatue.cobj = newObject({
        otyp: ROCK, quan: 1,
    });
    // Keep the level-wide nobj chain from accidentally agreeing with the
    // per-square nexthere chain that apply.c passes to nxtobj() here.
    selectedFilledStatue.nobj = null;
    const filledPileBefore = directItsDeadEffects(filledStatueTarget).pile;
    assert.equal(
        await its_dead(filledStatueTarget.x, filledStatueTarget.y, game), true,
    );
    assert.equal(
        pendingTopLine(),
        'The newt is in remarkable health for a statue.',
    );
    assert.deepEqual(
        directItsDeadEffects(filledStatueTarget).pile, filledPileBefore,
    );
});

test('a Healer hears remarkable health from a filled selected statue',
    async () => {
        // Authorized constructed live-consumer substitute, 2026-08-19. The
        // exact setup starts the ordinary sighted Healer fixture, places a
        // reachable newt statue on the adjacent west square, attaches one rock
        // as its cobj contents, leaves that square without a trap, and drives
        // doapply() with the starting stethoscope's `c` slot and west `h`.
        // Direct `newt statue` and `statue of a newt` wishes are refused. The
        // natural D:1 statue is empty, while the known source-created filled
        // D:8 candidate lies on a higher-priority STATUE_TRAP. No ported input
        // route can therefore supply this filled non-trap state.
        //
        // apply.c its_dead():281-307 selects the statue name, sets `how` to
        // "fine", then :295-303 changes it to "remarkable" for a Healer when
        // t_at() finds no STATUE_TRAP and Has_contents(statue) is true. This
        // test reaches that code through doapply(), its production consumer,
        // and pins the command results, exact output, terminal attributes and
        // cursor, zero branch PRNG calls, pile and contents preservation, and
        // the unread next key. It cannot prove a future input constructor will
        // build the same state or compare this unavailable setup directly to a
        // C recording. The checked-in ordinary-statue and statue-trap recipes
        // remain the direct C evidence for the surrounding reachable paths.
        const target = await heroWithEmptyWest();
        const statue = floorCorpstat(STATUE, target);
        const contents = newObject({ otyp: ROCK, quan: 1 });
        statue.cobj = contents;
        const before = directItsDeadEffects(target);
        const contentsBefore = structuredClone(contents);
        const lowerRowsBefore = game.nhDisplay.grid.slice(1).map(
            (row) => row.map(({ ch, color, attr }) => ({ ch, color, attr })),
        );
        const message = 'The newt is in remarkable health for a statue.';

        for (const key of ['c', 'h', 'x'])
            game.nhDisplay.pushKey(key.charCodeAt(0));
        assert.equal(await doapply(game), ECMD_OK);
        assert.equal(pendingTopLine(), message);
        assert.equal(game.nhDisplay.inputQueueLength, 1);
        assert.equal(game.context.stethoscope_seq, game.hero_seq);
        assert.equal(game.moves, before.shared.moves);
        assert.equal(game.context.move, before.shared.contextMove);
        let after = directItsDeadEffects(target);
        assert.deepEqual(after.pile, before.pile);
        assert.strictEqual(statue.cobj, contents);
        assert.deepEqual(statue.cobj, contentsBefore);
        assert.equal(after.shared.rngCalls, before.shared.rngCalls);

        await flush_screen(1);
        assert.deepEqual(
            game.nhDisplay.grid[0],
            [...message.padEnd(80)].map((ch, index) => ({
                ch,
                color: index < message.length ? NO_COLOR : CLR_GRAY,
                attr: 0,
            })),
        );
        assert.deepEqual(
            game.nhDisplay.grid.slice(1).map(
                (row) => row.map(({ ch, color, attr }) => ({
                    ch, color, attr,
                })),
            ),
            lowerRowsBefore,
        );
        assert.deepEqual(
            [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow],
            [target.x, target.y + 1],
        );
        assert.equal(await game.nhDisplay.readKey(), 'x'.charCodeAt(0));

        // No hero action separates the calls, so use_stethoscope():367-368
        // changes the second result to ECMD_TIME without changing this branch.
        for (const key of [' ', 'c', 'h', 'y'])
            game.nhDisplay.pushKey(key.charCodeAt(0));
        assert.equal(await doapply(game), ECMD_TIME);
        assert.equal(pendingTopLine(), message);
        assert.equal(game.nhDisplay.inputQueueLength, 1);
        assert.equal(await game.nhDisplay.readKey(), 'y'.charCodeAt(0));
        after = directItsDeadEffects(target);
        assert.deepEqual(after.pile, before.pile);
        assert.strictEqual(statue.cobj, contents);
        assert.deepEqual(statue.cobj, contentsBefore);
        assert.equal(after.shared.rngCalls, before.shared.rngCalls);
    });

test('its_dead keeps exceptional object paths in source order', async () => {
    // The exported source-named helper applies the same exceptional preflight
    // as use_stethoscope(). Direct test callers cannot enter a partially
    // supported arm after the command caller would have refused it.
    const direct = await heroWithEmptyWest();
    floorCorpstat(CORPSE, direct);
    game.u.uprops[HALLUC].intrinsic = 1;
    await assertDirectItsDeadRefusal(
        direct, 'a hallucinated listen to the dead',
    );

    const directTimer = await heroWithEmptyWest();
    const directTimedCorpse = floorCorpstat(CORPSE, directTimer);
    map_invisible(directTimer.x, directTimer.y, game);
    game.u.uprops[BLINDED].intrinsic = 1;
    start_timer(
        100, TIMER_OBJECT, REVIVE_MON, directTimedCorpse, game,
    );
    await assertDirectItsDeadRefusal(
        directTimer, 'a corpse with a REVIVE_MON timer',
    );

    // nxtobj(..., TRUE) must also find the timer on a lower corpse through an
    // unrelated intervening object. The exported refusal preserves the full
    // pile and the timer record after that traversal.
    const directLowerTimer = await heroWithEmptyWest();
    const lowerTimedCorpse = floorCorpstat(CORPSE, directLowerTimer);
    mksobj_at(
        ROCK, directLowerTimer.x, directLowerTimer.y, false, false,
        objectGenerationEnv({ state: game }),
    );
    const upperOrdinaryCorpse = floorCorpstat(CORPSE, directLowerTimer);
    upperOrdinaryCorpse.nobj = null;
    start_timer(
        100, TIMER_OBJECT, REVIVE_MON, lowerTimedCorpse, game,
    );
    await assertDirectItsDeadRefusal(
        directLowerTimer, 'a corpse with a REVIVE_MON timer',
    );

    const directUnreachable = await heroWithEmptyWest();
    const directUnreachableGnome = floorCorpstat(STATUE, directUnreachable);
    directUnreachableGnome.corpsenm = PM_GNOME;
    game.u.uprops[LEVITATION].intrinsic = 1;
    await assertDirectItsDeadRefusal(
        directUnreachable, 'an out-of-reach statue',
    );

    // Blindness changes only the statue's name. The Healer's trap check below
    // that name changes the adjective and keeps the first listen free.
    const trapped = await heroWithEmptyWest();
    floorCorpstat(STATUE, trapped);
    game.u.uprops[BLINDED].intrinsic = 1;
    game.level.traps.push({
        tx: trapped.x, ty: trapped.y, ttyp: STATUE_TRAP, tseen: false,
    });
    for (const key of ['c', 'h']) game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(
        pendingTopLine(),
        'That creature is in extraordinary health for a statue.',
    );
    for (const key of [' ', 'c', 'h'])
        game.nhDisplay.pushKey(key.charCodeAt(0));
    assert.equal(await doapply(game), ECMD_TIME);

    // Has_contents() is an else-if below the trap test. A Healer therefore
    // still hears "extraordinary" when the selected trap statue has contents.
    const trappedFilled = await heroWithEmptyWest();
    floorCorpstat(STATUE, trappedFilled).cobj = newObject({ quan: 1 });
    game.level.traps.push({
        tx: trappedFilled.x, ty: trappedFilled.y,
        ttyp: STATUE_TRAP, tseen: false,
    });
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'The newt is in extraordinary health for a statue.',
    );

    // Contents without the higher-priority trap select the Healer's second
    // adjective. The ordinary empty-statue tests above pin the default.
    const filled = await heroWithEmptyWest();
    floorCorpstat(STATUE, filled).cobj = newObject({ quan: 1 });
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'The newt is in remarkable health for a statue.',
    );

    // Blindness changes the subject but not the Healer's contents adjective.
    const blindFilled = await heroWithEmptyWest();
    floorCorpstat(STATUE, blindFilled).cobj = newObject({ quan: 1 });
    game.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'That creature is in remarkable health for a statue.',
    );

    // The trap and contents affect the adjective only for a Healer. Another
    // role reaches the ordinary answer even when both are present.
    const nonHealer = await heroWithEmptyWest();
    const ordinary = floorCorpstat(STATUE, nonHealer);
    ordinary.cobj = newObject({ quan: 1 });
    game.level.traps.push({
        tx: nonHealer.x, ty: nonHealer.y, ttyp: STATUE_TRAP, tseen: false,
    });
    game.urole.mnum = PM_MONK;
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'The newt is in fine health for a statue.',
    );

    // apply.c:226 sits above both object arms and therefore above the mixed
    // pile's selected-object report and the admitted blind-statue name.
    const hallucinated = await heroWithEmptyWest();
    floorCorpstat(STATUE, hallucinated).cobj = newObject({ quan: 1 });
    game.u.uprops[HALLUC].intrinsic = 1;
    game.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(await listenWest(), 'a hallucinated listen to the dead');

    // The blind glyph update at :264-265 precedes the Healer's timer walk in
    // C. The port preflights the excluded timer before either effect so a
    // retry cannot retain the map write; the named refusal is the timer that
    // keeps this otherwise-admitted blind corpse outside the slice.
    const blindReviver = await heroWithEmptyWest();
    const timed = floorCorpstat(CORPSE, blindReviver);
    start_timer(100, TIMER_OBJECT, REVIVE_MON, timed, game);
    game.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(await listenWest(), 'a corpse with a REVIVE_MON timer');

    const reviver = await heroWithEmptyWest();
    const revivingCorpse = floorCorpstat(CORPSE, reviver);
    mksobj_at(ROCK, reviver.x, reviver.y, false, false,
        objectGenerationEnv({ state: game }));
    const ordinaryCorpse = floorCorpstat(CORPSE, reviver);
    ordinaryCorpse.nobj = null;
    // The first corpse has no timer; only a nexthere traversal reaches the
    // lower corpse carrying REVIVE_MON.
    start_timer(100, TIMER_OBJECT, REVIVE_MON, revivingCorpse, game);
    assert.equal(await listenWest(), 'a corpse with a REVIVE_MON timer');
});

test('its_dead filled-statue body reads and writes the supplied state',
    async () => {
    const target = await heroWithEmptyWest();
    // The global state is admitted: an ordinary statue has no contents. The
    // supplied state owns the opposite adjective at the same coordinate.
    // Reading the global pile or dropping the state argument would print
    // "fine" to the global display instead of "remarkable" to the supplied
    // display.
    floorCorpstat(STATUE, target);
    const supplied = isolatedItsDeadState();
    placeStateCorpstat(supplied, STATUE, target).cobj = newObject({
        otyp: ROCK, quan: 1,
    });
    const globalBefore = directItsDeadEffects(target);
    const suppliedBefore = suppliedItsDeadEffects(supplied, target);

    assert.equal(await its_dead(target.x, target.y, supplied), true);
    assert.equal(
        supplied._pending_message,
        'The newt is in remarkable health for a statue.',
    );
    assert.deepEqual(directItsDeadEffects(target), globalBefore);
    const suppliedAfter = suppliedItsDeadEffects(supplied, target);
    assert.deepEqual(suppliedAfter.pile, suppliedBefore.pile);
    assert.deepEqual(suppliedAfter.catalogName, suppliedBefore.catalogName);
    assert.equal(suppliedAfter.ttyToplines, suppliedAfter.pendingMessage);
    assert.equal(
        suppliedAfter.display.topMessage, suppliedAfter.pendingMessage,
    );
});

test('its_dead admitted body reads and writes the supplied state', async () => {
    const target = await heroWithEmptyWest();
    // Both states have contents, but only the supplied state's trap admits
    // them through the source's trap-over-contents precedence. Their species
    // differ so the body must also select the supplied statue object. The
    // foreign catalog and independent TTY expose where naming and output land.
    const globalStatue = floorCorpstat(STATUE, target);
    globalStatue.corpsenm = PM_GNOME;
    globalStatue.cobj = newObject({
        otyp: ROCK, quan: 1,
    });
    const supplied = isolatedItsDeadState();
    placeStateCorpstat(supplied, STATUE, target).cobj = newObject({
        otyp: ROCK, quan: 1,
    });
    supplied.level.traps.push({
        tx: target.x,
        ty: target.y,
        ttyp: STATUE_TRAP,
        tseen: false,
    });
    supplied.mons[PM_NEWT].pmnames = [
        'foreign newt', 'foreign newt', 'foreign newt',
    ];
    const globalBefore = directItsDeadEffects(target);
    const suppliedPileBefore
        = suppliedItsDeadEffects(supplied, target).pile;
    const suppliedCatalogBefore = [
        ...supplied.mons[PM_NEWT].pmnames,
    ];

    assert.equal(await its_dead(target.x, target.y, supplied), true);
    assert.equal(
        supplied._pending_message,
        'The foreign newt is in extraordinary health for a statue.',
    );
    assert.equal(supplied._ttyToplines, supplied._pending_message);
    assert.equal(
        supplied.nhDisplay.topMessage, supplied._pending_message,
    );
    assert.equal(
        supplied.nhDisplay.toplines, supplied._pending_message,
    );
    assert.deepEqual(
        suppliedItsDeadEffects(supplied, target).pile, suppliedPileBefore,
    );
    assert.deepEqual(
        supplied.mons[PM_NEWT].pmnames, suppliedCatalogBefore,
    );
    assert.deepEqual(directItsDeadEffects(target), globalBefore);
});

test('still-unported adjacent listens refuse before shared effects',
    async () => {
    const cases = [
        {
            branch: 'a hallucinated listen to the dead',
            setup(target) {
                map_invisible(target.x, target.y, game);
                floorCorpstat(CORPSE, target);
                game.u.uprops[HALLUC].intrinsic = 1;
                return target;
            },
        },
        {
            branch: 'a corpse with a REVIVE_MON timer',
            setup(target) {
                map_invisible(target.x, target.y, game);
                floorCorpstat(STATUE, target);
                mksobj_at(ROCK, target.x, target.y, false, false,
                    objectGenerationEnv({ state: game }));
                const corpse = floorCorpstat(CORPSE, target);
                start_timer(100, TIMER_OBJECT, REVIVE_MON, corpse, game);
                return target;
            },
        },
        {
            branch: 'a corpse with a REVIVE_MON timer',
            setup(target) {
                map_invisible(target.x, target.y, game);
                const corpse = floorCorpstat(CORPSE, target);
                start_timer(100, TIMER_OBJECT, REVIVE_MON, corpse, game);
                return target;
            },
        },
        {
            branch: 'a corpse with a REVIVE_MON timer',
            setup(target) {
                map_invisible(target.x, target.y, game);
                const corpse = floorCorpstat(CORPSE, target);
                start_timer(100, TIMER_OBJECT, REVIVE_MON, corpse, game);
                game.u.uprops[BLINDED].intrinsic = 1;
                return target;
            },
        },
        {
            branch: 'an out-of-reach statue',
            setup(target) {
                map_invisible(target.x, target.y, game);
                const statue = floorCorpstat(STATUE, target);
                statue.corpsenm = PM_GNOME;
                game.u.uprops[LEVITATION].intrinsic = 1;
                return target;
            },
        },
    ];

    for (const { branch, setup } of cases) {
        const west = await heroWithEmptyWest();
        const target = setup(west);
        game.context.stethoscope_seq = 73;
        game.gb ??= {};
        game.gb.bhitpos = { x: 17, y: 9 };
        game.gn ??= {};
        game.gn.notonhead = true;
        // Hand-built remembered glyphs are buffered until the next display
        // boundary. Flush them now so the prompt is not mistaken for the
        // stethoscope drawing a marker that setup had merely queued.
        await flush_screen(1);
        const before = adjacentRefusalEffects(target);
        assert.equal(await listenWest(), branch);
        const refused = adjacentRefusalEffects(target);
        // getobj() and getdir() move the tty cursor while consuming their
        // prompts. That prompt cursor is not a shared stethoscope effect; the
        // second attempt starts from its cleared <0,0> position. Everything
        // the listen itself could have changed remains equal to the setup.
        const { cursor: _beforeCursor, ...beforeListenEffects } = before;
        const { cursor: _refusedCursor, ...refusedListenEffects } = refused;
        assert.deepEqual(refusedListenEffects, beforeListenEffects, branch);
        assert.deepEqual(refused.cursor, [0, 0], branch);

        // Replaying the retryable command reaches the same named refusal and
        // leaves even the prompt cursor byte-for-byte unchanged.
        assert.equal(await listenWest(), branch);
        assert.deepEqual(adjacentRefusalEffects(target), refused, branch);
    }
});

test('its_dead clears unreachable corpses and stops at a non-tiny statue',
    async () => {
    // apply.c:206-207. A levitating hero reaches no corpse on the floor, so
    // C's chain finds nothing and the caller prints its ordinary answer. The
    // corpse test has to sit below this block for that to happen.
    const floated = await heroWithEmptyWest();
    floorCorpstat(CORPSE, floated);
    game.u.uprops[LEVITATION].intrinsic = 1;
    assert.equal(await listenWest(), null);
    assert.equal(pendingTopLine(), 'You hear nothing special.');

    // The TRUE argument at apply.c:206. engrave.c can_reach_floor() only
    // consults trap.c uteetering_at_seen_pit() and uescaped_shaft() when its
    // caller asks it to, so a hero on the edge of a pit she has seen reaches
    // no corpse either. Passing FALSE would leave the corpse in her reach.
    const teetering = await heroWithEmptyWest();
    floorCorpstat(CORPSE, teetering);
    game.level.traps.push({
        tx: game.u.ux, ty: game.u.uy, ttyp: PIT, tseen: true, madeby_u: 0,
    });
    assert.equal(await listenWest(), null);
    assert.equal(pendingTopLine(), 'You hear nothing special.');

    // A reachable tiny statue still enters the ordinary statue arm. The walk
    // at apply.c:210-211 belongs only inside the failed reachability block.
    const reachableTiny = await heroWithEmptyWest();
    floorCorpstat(STATUE, reachableTiny);
    assert.equal(await listenWest(), null);
    assert.equal(
        pendingTopLine(),
        'The newt is in fine health for a statue.',
    );

    // A levitating hero stops at the first non-tiny statue. monst.c's gnome
    // row is MZ_SMALL, separating it from the MZ_TINY newt used above.
    const outOfReach = await heroWithEmptyWest();
    const gnomeStatue = floorCorpstat(STATUE, outOfReach);
    gnomeStatue.corpsenm = PM_GNOME;
    game.u.uprops[LEVITATION].intrinsic = 1;
    assert.equal(await listenWest(), 'an out-of-reach statue');

    // The same refusal survives a tiny statue above the non-tiny one: the
    // loop skips the newt, finds the gnome, and leaves it selected.
    const mixedSizes = await heroWithEmptyWest();
    const lowerGnome = floorCorpstat(STATUE, mixedSizes);
    lowerGnome.corpsenm = PM_GNOME;
    floorCorpstat(STATUE, mixedSizes);
    game.u.uprops[LEVITATION].intrinsic = 1;
    assert.equal(await listenWest(), 'an out-of-reach statue');
});

test('a levitating Healer hears nothing from a pile of tiny statues',
    async () => {
        // Authorized constructed live-consumer substitute, 2026-08-19. The
        // exact setup starts the ordinary sighted Healer fixture, grants
        // intrinsic LEVITATION, then places two newt statues on the adjacent
        // west square with a rock between them. It drives the state through
        // doapply() using the starting stethoscope's `c` slot and west `h`.
        // There is no ported player-input route to this state: levitation
        // boots stop before do_wear.c Boots_on() calls float_up(), drinking a
        // levitation potion has no ported dodrink() consumer, and no mounted
        // input route supplies an unskilled rider here.
        //
        // apply.c its_dead():203-224 clears the corpse when
        // can_reach_floor(TRUE) is false, then :208-211 walks each statue for
        // which mons[corpsenm].msize is MZ_TINY using invent.c
        // nxtobj(..., TRUE). With no statue left, :223-224 does nothing and
        // :308 returns FALSE; use_stethoscope():467-468 prints the ordinary
        // nothing-special message. A detached gnome statue on the upper
        // newt's nobj chain makes a mistaken level-wide traversal refuse,
        // while the real nexthere chain crosses the rock to the lower newt.
        // This test pins the live command's free and costly results, exact
        // output and terminal state, object and timer preservation, branch
        // PRNG count, and unread sentinels. It cannot prove a future input
        // constructor creates this state or compare the unavailable setup to
        // a C recording; source-real reachable-statue and unreachable-corpse
        // cases provide the surrounding differential evidence.
        const target = await heroWithEmptyWest();
        const lowerTiny = floorCorpstat(STATUE, target);
        mksobj_at(ROCK, target.x, target.y, false, false,
            objectGenerationEnv({ state: game }));
        const upperTiny = floorCorpstat(STATUE, target);
        const foreignNobjStatue = newObject({
            o_id: -973,
            otyp: STATUE,
            quan: 1,
            corpsenm: PM_GNOME,
        });
        upperTiny.nobj = foreignNobjStatue;
        game.u.uprops[LEVITATION].intrinsic = 1;
        // Paint the setup's Lev status before taking the lower-screen
        // baseline; the listen itself must leave every lower row unchanged.
        game.disp.botl = true;
        await flush_screen(1);
        const before = directItsDeadEffects(target);
        const lowerRowsBefore = game.nhDisplay.grid.slice(1).map(
            (row) => row.map(({ ch, color, attr }) => ({ ch, color, attr })),
        );
        const message = 'You hear nothing special.';

        assert.deepEqual(
            before.pile.map(({ otyp, corpsenm }) => ({ otyp, corpsenm })),
            [
                { otyp: STATUE, corpsenm: PM_NEWT },
                { otyp: ROCK, corpsenm: -1 },
                { otyp: STATUE, corpsenm: PM_NEWT },
            ],
        );
        assert.strictEqual(upperTiny.nexthere.nexthere, lowerTiny);
        assert.strictEqual(upperTiny.nobj, foreignNobjStatue);
        assert.equal(game.mons[PM_NEWT].msize, MZ_TINY);
        assert.equal(game.mons[PM_GNOME].msize, MZ_SMALL);

        for (const key of ['c', 'h', 'x'])
            game.nhDisplay.pushKey(key.charCodeAt(0));
        assert.equal(await doapply(game), ECMD_OK);
        assert.equal(pendingTopLine(), message);
        assert.equal(game.nhDisplay.inputQueueLength, 1);
        assert.equal(game.context.stethoscope_seq, game.hero_seq);
        assert.equal(game.moves, before.shared.moves);
        assert.equal(game.context.move, before.shared.contextMove);
        let after = directItsDeadEffects(target);
        assert.deepEqual(after.pile, before.pile);
        assert.deepEqual(after.timers, before.timers);
        assert.equal(after.shared.rngCalls, before.shared.rngCalls);

        await flush_screen(1);
        assert.deepEqual(
            game.nhDisplay.grid[0],
            [...message.padEnd(80)].map((ch, index) => ({
                ch,
                color: index < message.length ? NO_COLOR : CLR_GRAY,
                attr: 0,
            })),
        );
        assert.deepEqual(
            game.nhDisplay.grid.slice(1).map(
                (row) => row.map(({ ch, color, attr }) => ({
                    ch, color, attr,
                })),
            ),
            lowerRowsBefore,
        );
        assert.deepEqual(
            [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow],
            [target.x, target.y + 1],
        );
        assert.equal(await game.nhDisplay.readKey(), 'x'.charCodeAt(0));

        // No hero action separates these calls, so only the command result
        // changes. Space dismisses the first message; `y` remains unread.
        for (const key of [' ', 'c', 'h', 'y'])
            game.nhDisplay.pushKey(key.charCodeAt(0));
        assert.equal(await doapply(game), ECMD_TIME);
        assert.equal(pendingTopLine(), message);
        assert.equal(game.nhDisplay.inputQueueLength, 1);
        await flush_screen(1);
        assert.deepEqual(
            game.nhDisplay.grid[0],
            [...message.padEnd(80)].map((ch, index) => ({
                ch,
                color: index < message.length ? NO_COLOR : CLR_GRAY,
                attr: 0,
            })),
        );
        assert.deepEqual(
            game.nhDisplay.grid.slice(1).map(
                (row) => row.map(({ ch, color, attr }) => ({
                    ch, color, attr,
                })),
            ),
            lowerRowsBefore,
        );
        assert.deepEqual(
            [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow],
            [target.x, target.y + 1],
        );
        assert.equal(await game.nhDisplay.readKey(), 'y'.charCodeAt(0));
        after = directItsDeadEffects(target);
        assert.deepEqual(after.pile, before.pile);
        assert.deepEqual(after.timers, before.timers);
        assert.equal(after.shared.rngCalls, before.shared.rngCalls);
        assert.equal(game.moves, before.shared.moves);
        assert.equal(game.context.move, before.shared.contextMove);
    });

test('its_dead uses the supplied monster catalog for tiny statues',
    async () => {
        const target = await heroWithEmptyWest();
        const supplied = isolatedItsDeadState();
        placeStateCorpstat(supplied, STATUE, target);
        supplied.u.uprops[LEVITATION].intrinsic = 1;
        supplied.mons[PM_NEWT].msize = MZ_TINY;
        const suppliedBefore = suppliedItsDeadEffects(supplied, target);
        const globalSize = game.mons[PM_NEWT].msize;
        game.mons[PM_NEWT].msize = MZ_SMALL;
        try {
            assert.equal(
                await its_dead(target.x, target.y, supplied),
                false,
            );
            assert.deepEqual(
                suppliedItsDeadEffects(supplied, target), suppliedBefore,
            );
        } finally {
            game.mons[PM_NEWT].msize = globalSize;
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

    // The last clause, and the only one behind a helper rather than a
    // property: region.c visible_region_at() answers on a region that is
    // visible, is not expiring (ttl -2) and covers the square. The shape is
    // what js/region.js inside_region() reads -- a bounding box and the
    // rectangles inside it -- both set to the hero's own square.
    const here = { lx: game.u.ux, hx: game.u.ux,
        ly: game.u.uy, hy: game.u.uy };
    game.level.regions = [
        { visible: true, ttl: -1, bounding_box: here, rects: [here] },
    ];
    await assert.rejects(() => ustatusline(game),
        (error) => error.branch === 'the cloud-of-vapor clause');
    // Cleared again, so the clean report below proves the refusal was the
    // region and not some state the stub left behind.
    game.level.regions = [];

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

test('the apply matrix holds the thirteen clean recipes the slices close on',
    () => {
    const inventory = loadApplyStethoscopeRecipeInventory();
    assert.deepEqual(inventory.map(({
        label, summaryLabel, chunkLimit, recipe,
    }) => ({
        label,
        summaryLabel,
        chunkLimit,
        segments: recipe.segments.length,
        digest: recipeInputDigest(recipe),
    })), [
        {
            label: 'apply stethoscope',
            summaryLabel: 'APPLY STETHOSCOPE',
            chunkLimit: 5,
            segments: 13,
            digest: '06275f8cfc21b5fa32fd90427a75a8d31646b83f68f85501bf53848aa1730411',
        },
        {
            label: 'apply prompt',
            summaryLabel: 'APPLY PROMPT',
            chunkLimit: 5,
            segments: 10,
            digest: 'a4a5c61afdc1e214a347de9d58aea1c0c0a20430cac82845ec417d679a7a9ed4',
        },
        {
            label: 'listen at a monster',
            summaryLabel: 'LISTEN AT A MONSTER',
            chunkLimit: 1,
            segments: 10,
            digest: '4affea37d0cdd7e417ac24cc716b8c2ea09a8fc63e550cc0066b688cc6fff805',
        },
        {
            label: 'quickmimic logical glyph',
            summaryLabel: 'QUICKMIMIC LOGICAL GLYPH',
            chunkLimit: 1,
            segments: 1,
            digest: '858acde8c339663df94fc3fbb6a92c4b7d50c26e1c0a977c63ea0015be3ec8a3',
        },
        {
            label: 'secret terrain',
            summaryLabel: 'SECRET TERRAIN',
            chunkLimit: 1,
            segments: 2,
            digest: 'ad491fc8ef1e59f5c48bea71708a7e3cbb53d9c6bfce8f2717b767c4562a7551',
        },
        {
            label: 'ordinary corpse',
            summaryLabel: 'ORDINARY CORPSE',
            chunkLimit: 1,
            segments: 2,
            digest: '650ff690107b3bb9712bfe0cc30fcbf2bbfb0c0ddd6e2357273fd446df4d3645',
        },
        {
            label: 'mixed dead object',
            summaryLabel: 'MIXED DEAD OBJECT',
            chunkLimit: 1,
            segments: 1,
            digest: 'd6c9272b1d28816fd8d18fa3a00ccaccf6f478e41c31579b4da2c3939ece9d04',
        },
        {
            label: 'ordinary statue',
            summaryLabel: 'ORDINARY STATUE',
            chunkLimit: 2,
            segments: 2,
            digest: 'a08199639218650a6fcb6379681dfa1b4b38b9d11398599609d0103de0ccc5c1',
        },
        {
            label: 'blind statue',
            summaryLabel: 'BLIND STATUE',
            chunkLimit: 1,
            segments: 1,
            digest: 'bd899ee620af522f340b52948b419479c82e0bb998aaf00be0732a8460beefdd',
        },
        {
            label: 'blind corpse',
            summaryLabel: 'BLIND CORPSE',
            chunkLimit: 1,
            segments: 2,
            digest: '4eabe9c46c502a442c15471b77ab12a02e53baf476f28273f3d57982bae29285',
        },
        {
            label: 'Healer statue trap',
            summaryLabel: 'HEALER STATUE TRAP',
            chunkLimit: 1,
            segments: 1,
            digest: '571cca24fec42f017e6920347468971ab84a72765780163c99401a39b1eca573',
        },
        {
            label: 'costly mimic redisguise',
            summaryLabel: 'COSTLY MIMIC REDISGUISE',
            chunkLimit: 1,
            segments: 1,
            digest: '4c763b25e15abd2ac9bee4d405ce926b1bed35a1a870d1c78a9ab55fb29689f9',
        },
        {
            label: 'costly fog vapor',
            summaryLabel: 'COSTLY FOG VAPOR',
            chunkLimit: 1,
            segments: 1,
            digest: 'eb89ff021300662e52aa5e1421d86356fc3e6afdfcc9ea2ff2ce2ab9e461aa3a',
        },
    ]);
    const recipes = inventory.map(({ recipe }) => recipe);
    const priorRecipes = recipes.slice(0, 2);
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.ok(recipes.every(({ version }) => version === 5));
    const segments = recipes.flatMap(({ segments: rows }) => rows);
    assert.equal(segments.length, 47);
    assert.ok(segments.every((segment) => !Object.hasOwn(segment, 'steps')));
    // The two prior recipes open and close with a wait, so a command that
    // wrongly spent or wrongly saved a turn shows in the screen after it.
    assert.ok(priorRecipes.flatMap(({ segments: rows }) => rows)
        .every(({ moves }) =>
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
