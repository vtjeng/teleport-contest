import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SYMBOL_SET_DEFINITIONS } from '../js/symbol_data.js';
import { extractSymbolSets } from './generate-symbol-data.mjs';

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
