import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadMenuObjsymsRecipe,
    MENU_OBJSYMS_CASES,
    verifyMenuObjsymsSegment,
} from './run-menu-objsyms-inventory.mjs';

test('the menu object symbols recipe covers each startup input family', () => {
    const recipe = loadMenuObjsymsRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, MENU_OBJSYMS_CASES.length);
    assert.deepEqual(
        new Set(MENU_OBJSYMS_CASES.map(({ mode }) => mode)),
        new Set([0, 1, 2, 3, 4, 5]),
    );
    for (const [index, segment] of recipe.segments.entries()) {
        const entry = MENU_OBJSYMS_CASES[index];
        assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
        assert.ok(segment.moves.includes('i\x1bmO'), entry.label);
        assert.ok(segment.moves.endsWith('\x1b'), entry.label);
    }
});

test('each menu object symbols case reaches inventory and #optionsfull',
    async () => {
        for (const segment of loadMenuObjsymsRecipe().segments)
            await verifyMenuObjsymsSegment(segment);
    });
