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
import { initoptions_finish } from '../js/fruit.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { resetInputState } from '../js/input.js';
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

const {
    identifiedStartingObjectName,
    rerollAttributeLine,
    rerollObjectGlyphInfo,
    strengthText,
} = _startupRerollInternals;

function rerollState({ role = M.PM_HEALER, lootabc = false } = {}) {
    resetGame();
    resetInputState();
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
    game.u = {
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
    for (let index = 0; index + 1 < objects.length; ++index)
        objects[index].nobj = objects[index + 1];
    return objects[0] ?? null;
}

function menuTexts(spec) {
    return spec.items.map((item) => item.label ?? item.text ?? '');
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

test('identified startup names cover race, BUC, container, and gem forms', () => {
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

    state.urole = { mnum: M.PM_CLERIC, filecode: 'Pri' };
    state.objects[O.POT_WATER].oc_name_known = 1;
    assert.equal(
        identifiedStartingObjectName(water, state),
        '4 potions of holy water',
    );
    state.flags.implicit_uncursed = false;
    assert.equal(
        identifiedStartingObjectName(
            object(state, O.APPLE),
            state,
        ),
        'an uncursed apple',
    );
    state.flags.implicit_uncursed = true;
    state.urole = { mnum: M.PM_HEALER, filecode: 'Hea' };
    state.objects[O.POT_WATER].oc_name_known = 0;
    assert.equal(
        identifiedStartingObjectName(water, state),
        '4 blessed potions of holy water',
    );
    assert.equal(identifiedStartingObjectName(sack, state),
        'an empty uncursed sack');
    assert.equal(identifiedStartingObjectName(flint, state),
        '14 uncursed flint stones');
    assert.equal(identifiedStartingObjectName(hiddenPotion, state),
        'an uncursed potion of healing');
    assert.equal(hiddenPotion.known, false);
    assert.equal(hiddenPotion.dknown, false);
    assert.equal(hiddenPotion.bknown, false);
    assert.equal(state.objects[O.POT_HEALING].oc_name_known, knowledge);

    state.urole = { mnum: M.PM_SAMURAI, filecode: 'Sam' };
    assert.equal(
        identifiedStartingObjectName(
            object(state, O.SHORT_SWORD, { spe: 0 }),
            state,
        ),
        'a +0 wakizashi',
    );
});

test('source-derived startup names cover monster food and charge forms', () => {
    const state = rerollState();
    const cases = [
        // objnam.c prefixes a specific egg with its species before pluralizing.
        [
            object(state, O.EGG, { corpsenm: M.PM_NEWT, quan: 2 }),
            '2 uncursed newt eggs',
        ],
        // A specific corpse keeps the species attached to the singular head.
        [
            object(state, O.CORPSE, { corpsenm: M.PM_NEWT }),
            'an uncursed newt corpse',
        ],
        // An ordinary nonempty tin uses the species-meat form.
        [
            object(state, O.TIN, { corpsenm: M.PM_NEWT }),
            'an uncursed tin of newt meat',
        ],
        // Charged tools show recharge-count:charges and omit implicit uncursed.
        [
            object(state, O.TINNING_KIT, { recharged: 2, spe: 30 }),
            'a tinning kit (2:30)',
        ],
        // Charged rings retain BUC and enchantment prefixes.
        [
            object(state, O.RIN_ADORNMENT, { spe: 2 }),
            'an uncursed +2 ring of adornment',
        ],
    ];

    for (const [item, expected] of cases)
        assert.equal(identifiedStartingObjectName(item, state), expected);
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
    const statueResults = [M.PM_NEWT, 1];
    rerollObjectGlyphInfo(
        object(state, O.STATUE, { corpsenm: M.PM_NEWT }),
        state,
        (bound) => {
            calls.push(bound);
            return statueResults.shift();
        },
    );
    assert.deepEqual(calls, [M.NUMMONS, 2]);
});

test('reroll rows compute glyphs before names and honor artifact fruit articles', () => {
    const state = rerollState();
    state.artilist = createArtifactTable();
    state.u.uprops[HALLUC].intrinsic = 1;
    const events = [];
    const fruit = object(state, O.SLIME_MOLD, { spe: 42 });
    let quantity = 1;
    Object.defineProperty(fruit, 'quan', {
        configurable: true,
        get() {
            events.push('name');
            return quantity;
        },
        set(value) {
            quantity = value;
        },
    });
    state.gf = {
        ffruit: {
            fid: 42,
            fname: 'Excalibur',
            nextf: null,
        },
    };
    state.invent = fruit;
    const spec = buildRerollMenuSpec(state, {
        displayRandom: () => {
            events.push('glyph');
            return O.APPLE - O.FIRST_OBJECT;
        },
    });
    assert.deepEqual(events, ['glyph', 'name']);
    assert.equal(spec.items[3].text, 'uncursed Excalibur');

    state.gf.ffruit.fname = 'The Orb of Detection';
    assert.equal(
        identifiedStartingObjectName(fruit, state),
        'the uncursed Orb of Detection',
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

test('full-screen reroll dismissal redraws gameplay before continuing', async () => {
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
    assert.match(rowText(state, 22), /^RedrawTest the /u);
    assert.doesNotMatch(rowText(state, 0), /Reroll this character/u);
});

test('every valid role and race builds a source-shaped reroll inventory', () => {
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
            u_init_misc(game, undefined, {
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

test('newgame applies startup effects only after multiple rerolls are accepted', async () => {
    resetInputState();
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
