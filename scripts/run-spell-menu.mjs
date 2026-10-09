#!/usr/bin/env node
// C-first inputs use fixed seeds18233001..18233009 and18233101..18233106.
// The role/repertoire, menu action and tab option variations are in recipes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SORTBY_LETTER } from '../js/spell.js';
import { NO_SPELL } from '../js/const.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const SPELL_MENU_CASES = [
    'sort-retain-swap', 'sort-healer', 'tab-columns', 'swap-default',
    'swap-deselect', 'cast-cancel', 'cast-healing', 'no-spells', 'typed-showspells',
    'swap-unselect-all', 'swap-unselect-page', 'swap-counted-default',
    'sort-unselect-all', 'sort-unselect-page', 'sort-counted-default',
];
export function loadSpellMenuRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/spell.c/menu-${name}-independent.session.json`, import.meta.url,
    )));
}
export async function verifySpellMenuSegment(input) {
    const name = SPELL_MENU_CASES.find(n => loadSpellMenuRecipe(n).segments[0].seed === input.seed);
    const gold = JSON.parse(readFileSync(new URL(
        `../recordings/spell.c/menu-${name}-independent.session.json`, import.meta.url,
    ))).segments[0];
    let boundary;
    await runSegment({ ...input, recorderIsDst: gold.recorderIsDst }, {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    if (!name.startsWith('cast-')) {
        assert.equal(game.gs.spl_sortmode, SORTBY_LETTER);
        assert.equal(game.gs.spl_orderindx, null);
    }
    if (name === 'no-spells') assert.equal(game.svs.spl_book[0].sp_id, NO_SPELL);
    if (name === 'tab-columns') assert.equal(game.iflags.menu_tab_sep, true);
}
export async function runSpellMenuMatrix() {
    return runFreshMatrix({
        entries: SPELL_MENU_CASES.map(name => ({ label: name, recipe: loadSpellMenuRecipe(name) })),
        verifySegment: verifySpellMenuSegment,
        summaryLabel: 'SPELL MENU', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runSpellMenuMatrix, 'spell menus');
