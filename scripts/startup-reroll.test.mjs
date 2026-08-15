import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactTable } from '../js/artifacts.js';
import {
    HALLUC,
    HALLUC_RES,
    NO_SPELL,
    NON_PM,
    TOPLINE_NON_EMPTY,
} from '../js/const.js';
import { init_dungeons } from '../js/dungeon.js';
import {
    monster_glyph_info,
    object_glyph_info,
} from '../js/display.js';
import { initoptions_finish } from '../js/fruit.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { NethackGame } from '../js/jsmain.js';
import * as M from '../js/monsters.js';
import { monst_globals_init, reset_mvitals } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import * as O from '../js/objects.js';
import { role_init } from '../js/role_init.js';
import {
    aligns,
    genders,
    races,
    roles,
    validalign,
    validgend,
    validrace,
} from '../js/roles.js';
import { initRng } from '../js/rng.js';
import {
    _startupRerollInternals,
    buildRerollMenuSpec,
    reroll_menu,
} from '../js/startup_reroll.js';
import { u_init_misc } from '../js/u_init.js';
import { u_init_inventory_attrs } from '../js/u_init_inventory_attrs.js';
import { loadRerollMenuNamingRecipe } from './run-reroll-menu-naming.mjs';

const {
    rerollAttributeLine,
    rerollObjectGlyphInfo,
    strengthText,
} = _startupRerollInternals;

function rerollState({ role = M.PM_HEALER, lootabc = false } = {}) {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    // Zero keeps each randomized appearance in place; reroll naming uses the
    // actual-name indexes initialized by init_objects().
    init_objects(game, () => 0);
    monst_globals_init(game);
    game.flags = { implicit_uncursed: true, lootabc };
    game.iflags = {
        menu_overlay: true,
        menu_headings: { attr: 1, color: 8 },
    };
    game.urole = { mnum: role, filecode: role === M.PM_CLERIC ? 'Pri' : 'Hea' };
    // botl.c describe_level() reaches dungeon.c depth(), which reads
    // svd.dungeons[u.uz.dnum].depth_start. The hero starts on the first level
    // of the Dungeons of Doom, which is dungeon 0 and starts at depth 1.
    game.dungeons = [{ depth_start: 1 }];
    game.u = {
        uz: { dnum: 0, dlevel: 1 },
        acurr: { a: [9, 11, 16, 10, 12, 17] },
        abon: { a: [0, 0, 0, 0, 0, 0] },
        atemp: { a: [0, 0, 0, 0, 0, 0] },
        uprops: Array.from({ length: 69 }, () => ({
            intrinsic: 0,
            extrinsic: 0,
        })),
        uroleplay: { numrerolls: 2 },
    };
    return game;
}

function object(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        corpsenm: NON_PM,
        ...overrides,
    });
}

function chain(objects) {
    // The last link is cleared explicitly so that reusing an object in a
    // shorter chain does not leave it pointing at the previous chain's tail.
    for (const [index, obj] of objects.entries())
        obj.nobj = objects[index + 1] ?? null;
    return objects[0] ?? null;
}

function menuTexts(spec) {
    return spec.items.map((item) => item.label ?? item.text ?? '');
}

// The inventory rows of one reroll menu: the two choices, a blank, the kit,
// another blank and the attribute line. Naming an object at all is only
// reachable through the menu now, because that is where invent.c
// reroll_menu():2579-2588 raises gd.distantname and iflags.override_ID.
function menuInventoryNames(state, objects, displayRandom = () => 0) {
    state.invent = chain(objects);
    const spec = buildRerollMenuSpec(state, { displayRandom });
    return spec.items.slice(3, -2).map((item) => item.text);
}

function rowText(state, row) {
    return state.nhDisplay.grid[row]
        .map((cell) => cell.ch).join('').trimEnd();
}

function inventoryObjects(state) {
    const objects = [];
    for (let obj = state.invent; obj; obj = obj.nobj) objects.push(obj);
    return objects;
}

const EQUIPMENT_FIELDS = Object.freeze([
    'uwep',
    'uswapwep',
    'uquiver',
    'uarm',
    'uarmc',
    'uarmh',
    'uarmf',
    'uarms',
    'uarmg',
    'uarmu',
]);

function equippedObjects(state) {
    return EQUIPMENT_FIELDS.flatMap((field) => state[field] ? [state[field]] : []);
}

function learnedSpellTypes(state) {
    return (state.svs?.spl_book ?? [])
        .filter((slot) => slot.sp_id !== NO_SPELL)
        .map((slot) => slot.sp_id);
}

function skillsHaveEffects(state) {
    return (state.u?.weapon_skills ?? []).some((entry) => (
        entry.skill || entry.max_skill || entry.advance
    ));
}

test('reroll menu preserves source selectors, inventory order, and attributes', () => {
    const state = rerollState();
    const inventory = [
        object(state, O.GOLD_PIECE, { quan: 1770 }),
        object(state, O.SCALPEL, { spe: 0 }),
        object(state, O.LEATHER_GLOVES, { spe: 1 }),
        object(state, O.STETHOSCOPE, { spe: 0 }),
        object(state, O.POT_HEALING, { quan: 4 }),
        object(state, O.POT_EXTRA_HEALING, { quan: 4 }),
        object(state, O.WAN_SLEEP, { spe: 7 }),
        object(state, O.SPE_HEALING, { blessed: true }),
        object(state, O.SPE_EXTRA_HEALING, { blessed: true }),
        object(state, O.SPE_STONE_TO_FLESH, { blessed: true }),
        object(state, O.APPLE, { quan: 5 }),
    ];
    state.invent = chain(inventory);

    const spec = buildRerollMenuSpec(state, {
        displayRandom: () => {
            throw new Error('ordinary startup glyphs do not draw');
        },
    });
    assert.deepEqual(
        spec.items.slice(0, 2).map(({ selector, value }) => ({
            selector,
            value,
        })),
        [
            { selector: 'p', value: 'n' },
            { selector: 'r', value: 'y' },
        ],
    );
    assert.deepEqual(menuTexts(spec).slice(2), [
        '',
        '1770 gold pieces',
        'a +0 scalpel',
        'an uncursed +1 pair of leather gloves',
        'an uncursed stethoscope',
        '4 uncursed potions of healing',
        '4 uncursed potions of extra healing',
        'a wand of sleep (0:7)',
        'a blessed spellbook of healing',
        'a blessed spellbook of extra healing',
        'a blessed spellbook of stone to flesh',
        '5 uncursed apples',
        '',
        'St:9 Dx:10 Co:12 In:11 Wi:16 Ch:17',
    ]);
    assert.ok(spec.items.slice(3, -2).every((item) => item.glyphInfo));
    assert.equal(spec.titleAttr, 1);
    assert.equal(spec.titleColor, 8);
});

test('lootabc assigns the source-generated a and b menu selectors', () => {
    const state = rerollState({ lootabc: true });
    state.invent = object(state, O.FOOD_RATION);
    const spec = buildRerollMenuSpec(state, { displayRandom: () => 0 });
    assert.deepEqual(
        spec.items.slice(0, 2).map((item) => item.selector),
        ['a', 'b'],
    );
    assert.equal(spec.items[3].text, 'an uncursed food ration');
});

// C ref: invent.c reroll_menu():2579-2588, which raises gd.distantname and
// iflags.override_ID around its doname() loop. Every line below is what
// doname() prints with the counter raised, not what the objects' stored flags
// ask for: objnam.c xname_flags():632-639 forces nn, known, dknown and bknown,
// and doname_base():1254-1262 forces cknown and lknown as well.
test('the reroll menu identifies a kit the stored flags do not', () => {
    const state = rerollState();
    const water = object(state, O.POT_WATER, {
        blessed: true,
        quan: 4,
    });
    const sack = object(state, O.SACK);
    const flint = object(state, O.FLINT, { quan: 14 });
    const hiddenPotion = object(state, O.POT_HEALING, {
        known: false,
        dknown: false,
        bknown: false,
    });
    const knowledge = state.objects[O.POT_HEALING].oc_name_known;

    // doname_base():1319 reads the water type's own oc_name_known, not the
    // forced nn, so a hero who knows what water looks like sees no BUC word
    // ahead of the "holy" that xname_flags():841-843 already supplied.
    state.urole = { mnum: M.PM_CLERIC, filecode: 'Pri' };
    state.objects[O.POT_WATER].oc_name_known = 1;
    assert.deepEqual(
        menuInventoryNames(state, [water]),
        ['4 potions of holy water'],
    );
    // :1328 short-circuits on !flags.implicit_uncursed ahead of the
    // Role_if(PM_CLERIC) test at :1347, so a Priest still reads "uncursed"
    // while the option is off.
    state.flags.implicit_uncursed = false;
    assert.deepEqual(
        menuInventoryNames(state, [object(state, O.APPLE)]),
        ['an uncursed apple'],
    );
    state.flags.implicit_uncursed = true;
    state.urole = { mnum: M.PM_HEALER, filecode: 'Hea' };
    state.objects[O.POT_WATER].oc_name_known = 0;
    assert.deepEqual(
        menuInventoryNames(state, [water, sack, flint, hiddenPotion]),
        [
            // The same water, now for a hero who cannot recognize it: the BUC
            // word returns because :1319's second disjunct holds.
            '4 blessed potions of holy water',
            // cknown is one of doname_base():1255's five, so an empty
            // container says so even though ini_inv only sets that flag for
            // the containers it creates.
            'an empty uncursed sack',
            // objnam.h GemStone(): flint takes the " stone" suffix, and
            // xname_flags() pluralizes the whole phrase.
            '14 uncursed flint stones',
            // nn = 1 names an undiscovered type in full.
            'an uncursed potion of healing',
        ],
    );
    // The forced flags are locals in C; naming writes none of them back. The
    // discoveries list is untouched for a different reason: reroll_menu():2579
    // raises gd.distantname, which stops xname_flags():627 calling
    // observe_object().
    assert.equal(hiddenPotion.known, false);
    assert.equal(hiddenPotion.dknown, false);
    assert.equal(hiddenPotion.bknown, false);
    assert.equal(state.objects[O.POT_HEALING].oc_name_known, knowledge);

    state.urole = { mnum: M.PM_SAMURAI, filecode: 'Sam' };
    assert.deepEqual(
        menuInventoryNames(state, [object(state, O.SHORT_SWORD, { spe: 0 })]),
        ['a +0 wakizashi'],
    );
});

// C ref: invent.c reroll_menu():2579-2588. Both are C ints, raised before the
// loop and lowered after it, so a menu must leave them exactly where it found
// them. Leaving iflags.override_ID raised would identify every later name in
// the game; leaving gd.distantname raised would silence observe_object().
test('the reroll menu raises and lowers both naming counters', () => {
    const state = rerollState();
    const seen = [];
    const apple = object(state, O.APPLE);
    Object.defineProperty(apple, 'otyp', {
        configurable: true,
        get() {
            seen.push([
                state.iflags.override_ID,
                state.gd.distantname,
            ]);
            return O.APPLE;
        },
    });
    // Both start unset, as the C globals do; the menu is the only writer.
    assert.equal(state.iflags.override_ID, undefined);
    assert.equal(state.gd?.distantname, undefined);
    menuInventoryNames(state, [apple]);
    assert.ok(seen.length > 0);
    for (const pair of seen) assert.deepEqual(pair, [1, 1]);
    assert.equal(state.iflags.override_ID, 0);
    assert.equal(state.gd.distantname, 0);

    // A refusal from any formatter has to lower them too. A blindfold worn and
    // lit reaches preflightDoname()'s 'lit worn-object suffix' stop, the one
    // arm of that preflight a startup kit could carry.
    const lamp = object(state, O.OIL_LAMP, { owornmask: 1, lamplit: 1 });
    assert.throws(() => menuInventoryNames(state, [lamp]), /unsupported/u);
    assert.equal(state.iflags.override_ID, 0);
    assert.equal(state.gd.distantname, 0);
});

test('the reroll menu names monster food and charge forms from source', () => {
    const state = rerollState();
    const cases = [
        // doname_base():1531 prefixes an egg with its species when `known`,
        // which override_ID forces even for an egg the hero never examined.
        [
            object(state, O.EGG, { corpsenm: M.PM_NEWT, quan: 2 }),
            '2 uncursed newt eggs',
        ],
        // A specific corpse keeps the species attached to the singular head.
        [
            object(state, O.CORPSE, { corpsenm: M.PM_NEWT }),
            'an uncursed newt corpse',
        ],
        // xname_flags():793 reaches eat.c tin_details() only when `known`, so
        // this is the forced flag again: without it the tin would be "a tin".
        // eat.c:1442 then reads override_ID for itself, which is why the
        // preparation appears at all; spe -5 is tintxts[4], "pickled", chosen
        // because it is neither of the two entries eat.c:1445 puts ahead of
        // the word "tin", and because a non-negative spe would draw
        // rn2(TTSZ - 1) at eat.c:1372 for a variety.
        [
            object(state, O.TIN, { corpsenm: M.PM_NEWT, spe: -5 }),
            'an uncursed tin of pickled newt meat',
        ],
        // tintxts[1] is one of the two: "homemade" goes ahead of "tin".
        [
            object(state, O.TIN, { corpsenm: M.PM_NEWT, spe: -2 }),
            'an uncursed homemade tin of newt meat',
        ],
        // Charged tools show recharge-count:charges and omit implicit
        // uncursed, because doname_base():1331's `!known || !oc_charged` fails
        // on both terms.
        [
            object(state, O.TINNING_KIT, { recharged: 2, spe: 30 }),
            'a tinning kit (2:30)',
        ],
        // A ring is one of :1333's two classes that keep "uncursed" whatever
        // is known, and :1499 gives it the enchantment.
        [
            object(state, O.RIN_ADORNMENT, { spe: 2 }),
            'an uncursed +2 ring of adornment',
        ],
    ];

    for (const [item, expected] of cases)
        assert.deepEqual(menuInventoryNames(state, [item]), [expected]);
});

// C ref: objnam.c xname():685-687, whose `case WEAPON_CLASS:` runs
// `if (is_poisonable(obj) && obj->opoisoned) Strcpy(buf, "poisoned ")`.
// mkobj.c:1174 is the only generator that reaches a starting object, and it
// poisons under is_multigen() (obj.h:260-263), so every poisoned object a
// reroll menu can show is WEAPON_CLASS ammunition and no weapon-tool.
//
// obj.h:264-268 admits an object on either of two terms: is_multigen()'s
// three, or permapoisoned(). This file used to spell that as
// `WEAPON_CLASS || is_weptool()`, which admits objects C rejects; the last
// two cases below are the ones that separate the two readings. Both turn on
// the is_multigen() term alone -- no starting object is an artifact, so the
// permapoisoned() term is unreachable from a reroll menu and is pinned in
// scripts/objnam.test.mjs instead.
test('the startup poisoned prefix needs both the flag and a weapon', () => {
    const state = rerollState();
    // objects.h PROJECTILE("arrow", ... -P_BOW ...): WEAPON_CLASS with a
    // non-zero oc_skill of the wrong sign, so is_weptool() is false and the
    // class arm alone admits it. `||` cannot become `&&` here.
    assert.deepEqual(
        menuInventoryNames(state, [
            object(state, O.ARROW, { opoisoned: 1, spe: 0, quan: 3 }),
        ]),
        ['3 poisoned +0 arrows'],
    );
    // The flag is the other conjunct: the same stack without it loses only
    // the prefix.
    assert.deepEqual(
        menuInventoryNames(state, [
            object(state, O.ARROW, { spe: 0, quan: 3 }),
        ]),
        ['3 +0 arrows'],
    );
    // A potion carries neither arm, so a stray flag adds nothing.
    assert.deepEqual(
        menuInventoryNames(state, [
            object(state, O.POT_WATER, { opoisoned: 1 }),
        ]),
        ['an uncursed potion of water'],
    );
    // objects.h WEAPON("dagger", ... P_DAGGER ...) gives oc_skill 1, outside
    // is_multigen()'s [-P_SHURIKEN, -P_BOW] window, and no dagger but
    // Grimtooth is permapoisoned. WEAPON_CLASS on its own is not enough for
    // C, so a poisoned plain dagger keeps no prefix. A Rogue and a Samurai
    // both start with daggers, so this is the shape the reroll menu would
    // misname first.
    assert.deepEqual(
        menuInventoryNames(state, [
            object(state, O.DAGGER, { opoisoned: 1, spe: 0 }),
        ]),
        ['a +0 dagger'],
    );
    // The weapon-tool half of the old reading. objects.h TOOL("pick-axe",
    // ... P_PICK_AXE ...) makes is_weptool() true, but a pick-axe is
    // TOOL_CLASS, so is_multigen()'s first term fails before its skill window
    // is consulted. An Archeologist starts with one, and doname_base():1382
    // switches on `is_weptool(obj) ? WEAPON_CLASS : obj->oclass`, so that
    // pick-axe takes the enchantment prefix and never reaches the `charges:`
    // label at :1484. A fresh Archeologist recording prints "a +0 pick-axe".
    assert.deepEqual(
        menuInventoryNames(state, [
            object(state, O.PICK_AXE, { opoisoned: 1, spe: 0 }),
        ]),
        ['a +0 pick-axe'],
    );
});

test('attribute line applies ACURR bonuses and strength encoding', () => {
    const state = rerollState();
    state.u.acurr.a = [18, 9, 10, 11, 12, 13];
    state.u.abon.a = [100, 2, 3, 4, 5, 6];
    assert.equal(rerollAttributeLine(state),
        'St:18/** Dx:15 Co:17 In:11 Wi:13 Ch:19');
    assert.deepEqual(
        [18, 19, 117, 118, 119, 125].map(strengthText),
        ['18', '18/01', '18/99', '18/**', '19', '25'],
    );
});

test('reroll glyph calculation consumes only display draws for hallucination', () => {
    const state = rerollState();
    state.u.uprops[HALLUC].intrinsic = 1;
    state.u.uprops[HALLUC_RES].intrinsic = 0;
    const calls = [];
    const results = [O.CORPSE - O.FIRST_OBJECT, M.PM_NEWT];
    const random = (bound) => {
        calls.push(bound);
        return results.shift();
    };
    const glyph = rerollObjectGlyphInfo(
        object(state, O.APPLE),
        state,
        random,
    );
    assert.deepEqual(calls, [
        O.NUM_OBJECTS - O.FIRST_OBJECT,
        M.NUMMONS,
    ]);
    assert.equal(glyph.ch, '%');

    calls.length = 0;
    const selectedSpecies = M.PM_TENGU;
    const statueResults = [selectedSpecies, 1];
    const statueGlyph = rerollObjectGlyphInfo(
        object(state, O.STATUE, { corpsenm: M.PM_NEWT }),
        state,
        (bound) => {
            calls.push(bound);
            return statueResults.shift();
        },
    );
    state.u.uprops[HALLUC].intrinsic = 0;
    const selectedGlyph = monster_glyph_info({
        data: state.mons[selectedSpecies],
    }, state);
    const originalGlyph = monster_glyph_info({
        data: state.mons[M.PM_NEWT],
    }, state);
    state.u.uprops[HALLUC].intrinsic = 1;
    assert.deepEqual(statueGlyph, selectedGlyph);
    assert.notDeepEqual(statueGlyph, originalGlyph);
    assert.deepEqual(calls, [M.NUMMONS, 2]);
    assert.equal(state.u.uprops[HALLUC].intrinsic, 1);
});

test('reroll hallucination requires intrinsic HALLUC without resistance', () => {
    const cases = [
        {
            label: 'no hallucination',
            hallucination: { intrinsic: 0, extrinsic: 0 },
            resistance: { intrinsic: 0, extrinsic: 0 },
            draws: false,
        },
        {
            label: 'extrinsic-only HALLUC',
            hallucination: { intrinsic: 0, extrinsic: 1 },
            resistance: { intrinsic: 0, extrinsic: 0 },
            draws: false,
        },
        {
            label: 'effective intrinsic HALLUC',
            hallucination: { intrinsic: 1, extrinsic: 0 },
            resistance: { intrinsic: 0, extrinsic: 0 },
            draws: true,
        },
        {
            label: 'intrinsic resistance',
            hallucination: { intrinsic: 1, extrinsic: 0 },
            resistance: { intrinsic: 1, extrinsic: 0 },
            draws: false,
        },
        {
            label: 'extrinsic resistance',
            hallucination: { intrinsic: 1, extrinsic: 0 },
            resistance: { intrinsic: 0, extrinsic: 1 },
            draws: false,
        },
    ];
    for (const {
        label,
        hallucination,
        resistance,
        draws,
    } of cases) {
        const state = rerollState();
        state.u.uprops[HALLUC] = { ...hallucination };
        state.u.uprops[HALLUC_RES] = { ...resistance };
        const apple = object(state, O.APPLE);
        const expected = object_glyph_info(apple, state);
        const calls = [];

        const glyph = rerollObjectGlyphInfo(
            apple,
            state,
            (bound) => {
                calls.push(bound);
                return O.APPLE - O.FIRST_OBJECT;
            },
        );

        assert.deepEqual(
            calls,
            draws ? [O.NUM_OBJECTS - O.FIRST_OBJECT] : [],
            label,
        );
        assert.deepEqual(glyph, expected, label);
    }
});

// Records one event per read of obj.quan. doname() reads it more than once, so
// callers compare the run-length-encoded sequence rather than the raw list.
function probeQuantity(obj, events, initial = 1) {
    let quantity = initial;
    Object.defineProperty(obj, 'quan', {
        configurable: true,
        get() {
            events.push('name');
            return quantity;
        },
        set(value) {
            quantity = value;
        },
    });
    return obj;
}

function collapse(events) {
    return events.filter((event, index) => event !== events[index - 1]);
}

test('reroll rows compute glyphs before names and honor artifact fruit articles', () => {
    const state = rerollState();
    state.artilist = createArtifactTable();
    state.u.uprops[HALLUC].intrinsic = 1;
    const events = [];
    const fruit = probeQuantity(
        object(state, O.SLIME_MOLD, { spe: 42 }),
        events,
    );
    const apple = probeQuantity(object(state, O.APPLE), events);
    state.gf = {
        ffruit: {
            fid: 42,
            fname: 'Excalibur',
            nextf: null,
        },
    };
    // invent.c reroll_menu():2582-2585 computes each row's glyph before it
    // names that row, and finishes one object before starting the next.
    const names = menuInventoryNames(state, [fruit, apple], () => {
        events.push('glyph');
        return O.APPLE - O.FIRST_OBJECT;
    });
    assert.deepEqual(collapse(events), ['glyph', 'name', 'glyph', 'name']);
    assert.deepEqual(names, ['uncursed Excalibur', 'an uncursed apple']);

    // objnam.c doname_base():1278-1280 keeps the artifact's own "the" and
    // suppresses the article an() would otherwise add.
    state.gf.ffruit.fname = 'The Orb of Detection';
    assert.deepEqual(
        menuInventoryNames(state, [fruit], () => O.APPLE - O.FIRST_OBJECT),
        ['the uncursed Orb of Detection'],
    );

    fruit.quan = 2;
    state.gf.ffruit.fname = 'blueberries';
    assert.deepEqual(
        menuInventoryNames(state, [fruit], () => O.APPLE - O.FIRST_OBJECT),
        ['2 uncursed blueberries'],
    );
    state.gf.ffruit.fname = 'foo@';
    assert.deepEqual(
        menuInventoryNames(state, [fruit], () => O.APPLE - O.FIRST_OBJECT),
        ['2 uncursed foo@s'],
    );
});

test('reroll choice increments only for y and supports cancel fallback', async () => {
    {
        const state = rerollState();
        state.invent = object(state, O.APPLE);
        state.nhDisplay.pushKey('r'.charCodeAt(0));
        assert.equal(await reroll_menu(state, { displayRandom: () => 0 }), true);
        assert.equal(state.u.uroleplay.numrerolls, 3);
    }
    {
        const state = rerollState();
        state.invent = object(state, O.APPLE);
        state.nhDisplay.pushKey('p'.charCodeAt(0));
        assert.equal(await reroll_menu(state, { displayRandom: () => 0 }), false);
        assert.equal(state.u.uroleplay.numrerolls, 2);
    }
    {
        const state = rerollState();
        state.invent = object(state, O.APPLE);
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push({
            top: rowText(state, 0),
            cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        });
        state.nhDisplay.pushKey(27); // Escape closes select_menu().
        state.nhDisplay.pushKey('x'.charCodeAt(0)); // Ignored printable byte.
        state.nhDisplay.pushKey(1); // Ignored control byte.
        state.nhDisplay.pushKey('Y'.charCodeAt(0));
        assert.equal(await reroll_menu(state, { displayRandom: () => 0 }), true);
        assert.equal(state.u.uroleplay.numrerolls, 3);
        assert.equal(boundaries.length, 4);
        for (const boundary of boundaries.slice(1)) {
            assert.equal(boundary.top, 'Reroll this character? [yn] (n)');
            assert.deepEqual(boundary.cursor, [32, 0]);
        }
        assert.equal(rowText(state, 0), 'Reroll this character? [yn] (n)');
        assert.equal(state.nhDisplay.toplin, TOPLINE_NON_EMPTY);
        assert.equal(
            state.nhDisplay.toplines,
            'Reroll this character? [yn] (n) y',
        );
    }
    {
        const state = rerollState();
        state.invent = object(state, O.APPLE);
        state.nhDisplay.pushKey(32); // Empty menu commit asks again.
        state.nhDisplay.pushKey(27); // Escape chooses the y_n() default.
        assert.equal(await reroll_menu(state, { displayRandom: () => 0 }), false);
        assert.equal(state.u.uroleplay.numrerolls, 2);
    }
});

test('full-screen reroll dismissal leaves the status rows for the next paint',
    async () => {
    const state = rerollState();
    state.iflags.menu_overlay = false;
    state.invent = object(state, O.APPLE);
    state.plname = 'RedrawTest';
    state.u.ulevel = 1;
    state.u.ualign = { type: 0 };
    state.u.uhp = state.u.uhpmax = 12;
    state.u.uen = state.u.uenmax = 7;
    state.u.uac = 10;
    state.nhDisplay.pushKey('p'.charCodeAt(0));

    assert.equal(await reroll_menu(state, { displayRandom: () => 0 }), false);
    // invent.c reroll_menu() repairs nothing of its own: select_menu() ->
    // tty_dismiss_nhwindow() -> erase_menu_or_text() is the whole repair, and
    // it runs while gb.bot_disabled is raised, so bot() returns at botl.c:255
    // before clearing the flags. C therefore leaves both status rows blank
    // here with disp.botlx still set, and the next pline()'s flush_screen(1)
    // paints them. A second repair in reroll_menu() would paint them now and
    // spend the botlx C carries forward.
    assert.equal(rowText(state, 22), '');
    assert.equal(rowText(state, 23), '');
    assert.equal(state.disp.botlx, true);
    // The map is restored either way, which is what docrt() inside the
    // dismissal does.
    assert.doesNotMatch(rowText(state, 0), /Reroll this character/u);
});

test('every valid role and race builds a source-shaped reroll inventory',
    async () => {
    let caseNumber = 0;
    for (let roleIndex = 0; roleIndex < roles.length; ++roleIndex) {
        for (let raceIndex = 0; raceIndex < races.length; ++raceIndex) {
            if (!validrace(roleIndex, raceIndex)) continue;
            const genderIndex = genders.findIndex((_, index) =>
                validgend(roleIndex, raceIndex, index));
            const alignmentIndex = aligns.findIndex((_, index) =>
                validalign(roleIndex, raceIndex, index));

            resetGame();
            // Distinct fixed seeds cover different generated objects without
            // selecting behavior from any recording or expected screen.
            initRng(920_000 + caseNumber++);
            game.context = { ident: 2 };
            game.moves = 0;
            game.flags = {
                initrole: roleIndex,
                initrace: raceIndex,
                initgend: genderIndex,
                initalign: alignmentIndex,
                pantheon: -1,
            };
            game.plname = 'RerollTest';
            game.u = { uroleplay: { reroll: true } };
            O.objects_globals_init(game);
            monst_globals_init(game);
            initoptions_finish({}, game);
            reset_mvitals(game);
            init_objects(game);
            role_init(game);
            init_dungeons(game);
            await u_init_misc(game, undefined, {
                now: new Date(2_000_000_000_000),
            });
            u_init_inventory_attrs(game);

            const spec = buildRerollMenuSpec(game, {
                displayRandom: () => {
                    throw new Error('startup glyph should not hallucinate');
                },
            });
            const label = `${roles[roleIndex].filecode}`
                + `/${races[raceIndex].filecode}`;
            const inventoryLines = spec.items.slice(3, -2)
                .map((item) => item.text);
            assert.ok(inventoryLines.length > 0, label);
            assert.ok(inventoryLines.every((line) => (
                line && !line.includes('strange object')
                    && !line.includes('undefined')
            )), `${label}: ${inventoryLines.join('; ')}`);
            assert.equal(spec.items.at(-1).text, rerollAttributeLine(game));
        }
    }
    assert.ok(caseNumber > roles.length);
});

// The differential matrix scripts/run-reroll-menu-naming.mjs replays is what
// proves the menu against C; this only keeps the recipe from losing coverage
// silently, since the matrix itself needs the C recorder and does not run here.
test('the reroll naming matrix covers every role and the reroll arm', () => {
    const { segments } = loadRerollMenuNamingRecipe();
    const rolesCovered = segments.map((segment) => (
        /role:(\w+)/u.exec(segment.nethackrc)?.[1]
    ));
    assert.deepEqual(
        [...new Set(rolesCovered)].sort(),
        roles.map((role) => role.name.m).sort(),
    );
    for (const segment of segments) {
        // u.uroleplay.reroll is what allmain.c:820 loops on, so a segment
        // without the option never draws the menu at all.
        assert.match(segment.nethackrc, /^OPTIONS=reroll$/mu);
        assert.match(segment.moves, /^r*p$/u);
    }
    // allmain.c:820-823 reruns u_init_inventory_attrs() for each 'r', so at
    // least one segment has to answer the menu more than once.
    assert.ok(segments.some((segment) => segment.moves.startsWith('rr')));
});

test('newgame applies startup effects only after multiple rerolls are accepted', async () => {
    const session = new NethackGame({
        // This fixed, freshly chosen seed gives all three Monk candidates
        // distinct scrolls and spellbooks, so rejected-only effects are visible.
        seed: 864_209,
        // An ordinary non-Friday date avoids unrelated lunar input boundaries.
        datetime: '20260129120000',
        nethackrc: 'OPTIONS=name:RerollFlow,role:Monk,race:human,'
            + 'gender:male,align:neutral,reroll,!legacy,!tutorial,'
            + '!splash_screen\n',
    });
    const display = new GameDisplay(null);
    display.onEmptyQueue = () => {
        throw new Error('startup reroll test exhausted its input');
    };
    // Reject two generated characters, then accept the third.
    for (const key of 'rrp') display.pushKey(key.charCodeAt(0));
    session._pendingDisplay = display;

    const boundaries = [];
    session._installCaptureHook = () => {
        game._preNhgetchHook = () => {
            const inventory = inventoryObjects(game);
            boundaries.push({
                inventory,
                wornMasks: inventory.map((obj) => obj.owornmask ?? 0),
                equipment: equippedObjects(game),
                encountered: inventory.map(
                    (obj) => Boolean(game.objects[obj.otyp].oc_encountered),
                ),
                spells: learnedSpellTypes(game),
                skillsInitialized: skillsHaveEffects(game),
            });
        };
    };

    assert.equal(await session.start(), true);
    assert.equal(game.u.uroleplay.numrerolls, 2);
    assert.equal(boundaries.length, 3);

    for (const boundary of boundaries) {
        assert.ok(boundary.inventory.length > 0);
        assert.ok(boundary.wornMasks.every((mask) => mask === 0));
        assert.deepEqual(boundary.equipment, []);
        assert.ok(boundary.encountered.every((value) => !value));
        assert.deepEqual(boundary.spells, []);
        assert.equal(boundary.skillsInitialized, false);
    }

    const accepted = boundaries.at(-1).inventory;
    const finalInventory = inventoryObjects(game);
    assert.equal(finalInventory.length, accepted.length);
    for (let index = 0; index < accepted.length; ++index)
        assert.equal(finalInventory[index], accepted[index]);

    const acceptedSet = new Set(accepted);
    const rejected = boundaries.slice(0, -1)
        .flatMap((boundary) => boundary.inventory);
    assert.ok(rejected.every((obj) => !acceptedSet.has(obj)));
    assert.ok(rejected.every((obj) => (obj.owornmask ?? 0) === 0));

    const equipment = equippedObjects(game);
    assert.ok(equipment.length > 0);
    assert.ok(equipment.every((obj) => acceptedSet.has(obj)));
    assert.ok(equipment.every((obj) => (obj.owornmask ?? 0) !== 0));

    const acceptedTypes = new Set(accepted.map((obj) => obj.otyp));
    const acceptedDiscoveries = new Set(accepted
        .filter((obj) => obj.known && O.OBJ_DESCR(game.objects[obj.otyp], game))
        .map((obj) => obj.otyp));
    const rejectedOnlyDiscoveries = new Set(rejected
        .filter((obj) => !acceptedTypes.has(obj.otyp)
            && obj.known && O.OBJ_DESCR(game.objects[obj.otyp], game))
        .map((obj) => obj.otyp));
    // The selected seed supplies two rejected spellbooks and two rejected
    // scrolls; keep at least two distinct types to make this a meaningful gate.
    assert.ok(rejectedOnlyDiscoveries.size >= 2);
    const encounteredTypes = new Set(game.objects.flatMap(
        (objectType, otyp) => objectType?.oc_encountered ? [otyp] : [],
    ));
    assert.deepEqual(encounteredTypes, acceptedDiscoveries);
    for (const otyp of rejectedOnlyDiscoveries)
        assert.equal(Boolean(game.objects[otyp].oc_encountered), false);

    const acceptedSpellbooks = accepted
        .filter((obj) => obj.oclass === O.SPBOOK_CLASS
            && obj.otyp !== O.SPE_BLANK_PAPER)
        .map((obj) => obj.otyp);
    const rejectedOnlySpellbooks = new Set(rejected
        .filter((obj) => obj.oclass === O.SPBOOK_CLASS
            && !acceptedTypes.has(obj.otyp))
        .map((obj) => obj.otyp));
    assert.ok(rejectedOnlySpellbooks.size >= 2);
    assert.deepEqual(learnedSpellTypes(game), acceptedSpellbooks);
    for (const otyp of rejectedOnlySpellbooks)
        assert.equal(learnedSpellTypes(game).includes(otyp), false);
    assert.equal(skillsHaveEffects(game), true);
});
