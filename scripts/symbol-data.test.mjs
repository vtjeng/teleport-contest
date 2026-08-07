import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DEFAULT_PRIMARY_SYMBOLS,
    DEFAULT_ROGUE_SYMBOLS,
    OBJCLASS_EXPLANATIONS,
    SYMBOL_INDEX_BY_NAME,
    SYMBOL_SET_DEFINITIONS,
    SYM_MAX,
    SYM_OFF_M,
    SYM_OFF_O,
    SYM_OFF_P,
    SYM_OFF_W,
    SYM_OFF_X,
} from '../js/symbol_data.js';
import { def_char_to_objclass } from '../js/drawing.js';
import {
    COIN_CLASS, MAXOCLASSES, VENOM_CLASS, WEAPON_CLASS,
} from '../js/objects.js';
import {
    extractSymbolLayout,
    extractSymbolSets,
} from './generate-symbol-data.mjs';

test('generated symbol layout matches the complete pinned defsym projection', () => {
    const defsym = readFileSync(
        new URL('../nethack-c/upstream/include/defsym.h', import.meta.url),
        'utf8',
    );
    const layout = extractSymbolLayout(defsym);

    assert.deepEqual(layout.offsets, {
        p: SYM_OFF_P,
        o: SYM_OFF_O,
        m: SYM_OFF_M,
        w: SYM_OFF_W,
        x: SYM_OFF_X,
        max: SYM_MAX,
    });
    assert.deepEqual(layout.defaults, DEFAULT_PRIMARY_SYMBOLS);
    assert.deepEqual(layout.rogueDefaults, DEFAULT_ROGUE_SYMBOLS);
    assert.deepEqual(layout.indices, SYMBOL_INDEX_BY_NAME);
    assert.deepEqual(layout.objectExplanations, OBJCLASS_EXPLANATIONS);
    assert.equal(DEFAULT_PRIMARY_SYMBOLS.length, SYM_MAX);
    assert.equal(DEFAULT_ROGUE_SYMBOLS.length, SYM_MAX);

    // defsym.h defines a monster named S_invisible before symbols.c's
    // miscellaneous S_invisible entry.  Source lookup keeps the first match.
    assert.equal(SYMBOL_INDEX_BY_NAME.s_invisible, SYM_OFF_M + 35);
    assert.equal(SYMBOL_INDEX_BY_NAME.s_weapon, SYM_OFF_O + 2);
    assert.equal(SYMBOL_INDEX_BY_NAME.s_pet_override, SYM_OFF_X + 4);
    assert.equal(SYMBOL_INDEX_BY_NAME.s_hero_override, SYM_OFF_X + 5);

    // drawing.c def_oc_syms[].explain, which windows.c choose_classes_menu()
    // prints beside each class symbol.
    assert.equal(OBJCLASS_EXPLANATIONS.length, MAXOCLASSES);
    for (const [index, expected] of [
        // Entry 0 is the "random class" placeholder, which carries no text.
        [0, ''],
        [2, 'weapon'],
        // S_amulet's character literal is a double quote, which a scan for the
        // last quoted string in the whole entry pairs with the opening quote
        // of its name.
        [5, 'amulet'],
        // The only entry that both wraps onto a second physical line and
        // carries parentheses inside its explanation.
        [6, 'useful item (pick-axe, key, lamp...)'],
        // OBJCLASS2, the one entry whose *_SYM name differs from its class.
        [12, 'pile of coins'],
        [17, 'splash of venom'],
    ]) {
        assert.equal(OBJCLASS_EXPLANATIONS[index], expected, `oclass ${index}`);
    }
    // Nothing may hold a fragment of its own source line.
    for (const [index, text] of OBJCLASS_EXPLANATIONS.entries()) {
        assert.equal(
            /["]|S_|_CLASS/u.test(text),
            false,
            `oclass ${index} carries source punctuation: ${text}`,
        );
    }
});

// C ref: drawing.c def_char_to_objclass() (91-99).
test('def_char_to_objclass() maps a class symbol back to its index', () => {
    // The three shapes: an ordinary class, the OBJCLASS2 coin entry, and the
    // venom class that def_inv_order[] leaves out.
    assert.equal(def_char_to_objclass(')'), WEAPON_CLASS);
    assert.equal(def_char_to_objclass('$'), COIN_CLASS);
    assert.equal(def_char_to_objclass('.'), VENOM_CLASS);
    // C's "no class owns this character" answer, which optfn_pickup_types()
    // reads as a bad parameter. ']' is ILLOBJ_CLASS's symbol and does map;
    // 'Z' belongs to no class at all.
    assert.equal(def_char_to_objclass(']'), 1); // ILLOBJ_CLASS
    assert.equal(def_char_to_objclass('Z'), MAXOCLASSES);
    // Index 0's symbol byte is 0, so the placeholder never matches and the
    // scan cannot answer 0.
    assert.equal(def_char_to_objclass('\0'), MAXOCLASSES);
});

test('generated symbol sets match the pinned source projection', () => {
    const defsym = readFileSync(
        new URL('../nethack-c/upstream/include/defsym.h', import.meta.url),
        'utf8',
    );
    const symbols = readFileSync(
        new URL('../nethack-c/upstream/dat/symbols', import.meta.url),
        'utf8',
    );

    assert.deepEqual(
        extractSymbolSets(defsym, symbols),
        SYMBOL_SET_DEFINITIONS,
    );
    assert.deepEqual(
        SYMBOL_SET_DEFINITIONS.map(({ name, handling }) => [name, handling]),
        [
            ['plain', 'UNKNOWN'],
            ['Blank', 'UNKNOWN'],
            ['IBMgraphics', 'IBM'],
            ['IBMGraphics_1', 'IBM'],
            ['IBMGraphics_2', 'IBM'],
            ['RogueIBM', 'IBM'],
            ['RogueEpyx', 'IBM'],
            ['RogueWindows', 'IBM'],
            ['curses', 'DEC'],
            ['DECgraphics', 'DEC'],
            ['MACgraphics', 'MAC'],
            ['Enhanced1', 'UTF8'],
            ['Enhanced2', 'UTF8'],
            ['AmigaFont', 'UNKNOWN'],
        ],
    );
});
