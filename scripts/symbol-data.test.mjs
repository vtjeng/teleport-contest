import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DEFAULT_PRIMARY_SYMBOLS,
    DEFAULT_ROGUE_SYMBOLS,
    SYMBOL_INDEX_BY_NAME,
    SYMBOL_SET_DEFINITIONS,
    SYM_MAX,
    SYM_OFF_M,
    SYM_OFF_O,
    SYM_OFF_P,
    SYM_OFF_W,
    SYM_OFF_X,
} from '../js/symbol_data.js';
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
    assert.equal(DEFAULT_PRIMARY_SYMBOLS.length, SYM_MAX);
    assert.equal(DEFAULT_ROGUE_SYMBOLS.length, SYM_MAX);

    // defsym.h defines a monster named S_invisible before symbols.c's
    // miscellaneous S_invisible entry.  Source lookup keeps the first match.
    assert.equal(SYMBOL_INDEX_BY_NAME.s_invisible, SYM_OFF_M + 35);
    assert.equal(SYMBOL_INDEX_BY_NAME.s_weapon, SYM_OFF_O + 2);
    assert.equal(SYMBOL_INDEX_BY_NAME.s_pet_override, SYM_OFF_X + 4);
    assert.equal(SYMBOL_INDEX_BY_NAME.s_hero_override, SYM_OFF_X + 5);
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
