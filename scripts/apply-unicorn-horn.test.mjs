import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DEAF, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';

const CursedHornRecipe = validateCleanRecipe(
    JSON.parse(readFileSync(new URL(
        '../recipes/apply.c/unicorn-horn-cursed-independent.session.json',
        import.meta.url,
    ), 'utf8')),
    'cursed unicorn horn application',
);
const InventoryMenuHornRecipe = validateCleanRecipe(
    JSON.parse(readFileSync(new URL(
        '../recipes/apply.c/unicorn-horn-inventory-menu-independent.session.json',
        import.meta.url,
    ), 'utf8')),
    'inventory-menu unicorn horn application',
);

test('doapply dispatches a cursed unicorn horn through use_unicorn_horn',
    async () => {
        assert.equal(CursedHornRecipe.segments.length, 1);
        await runSegment(CursedHornRecipe.segments[0]);

        // The independent C recording selects case 6 of the cursed switch.
        // make_deaf() applies the timeout, then this command's turn decrements
        // it once before the recorded screen is captured.
        assert.equal(game.u.uprops[DEAF].intrinsic & TIMEOUT, 19);
        assert.equal(game._pending_message, 'You are unable to hear anything.');
    });

test('inventory item actions queue doapply for an uncursed unicorn horn',
    async () => {
        assert.equal(InventoryMenuHornRecipe.segments.length, 1);
        await runSegment(InventoryMenuHornRecipe.segments[0]);

        // The C input selects the horn from `i`, then chooses its IA_APPLY_OBJ
        // action. iactions.c queues doapply and its inventory letter.
        assert.equal(game._pending_message, 'Nothing happens.');
        assert.equal(game.u.uprops[DEAF].intrinsic & TIMEOUT, 0);
    });
