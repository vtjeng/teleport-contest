#!/usr/bin/env node
// Independently selected fixed seeds125070101/102, gnome/orc Wizard inventory
// variation, eyeless fire/earth elemental, and floor/ice terrain. No seed scan.
// The lava variant is retained separately: its matching hero redraw is
// followed by the unported trap.c:fire_damage_chain -> erode_obj floor tail.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ICE, IN_SIGHT, ROOM } from '../js/const.js';
import { PM_EARTH_ELEMENTAL, PM_FIRE_ELEMENTAL } from '../js/monsters.js';
import { heroIsBlind } from '../js/startup_a11y.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = [
    { name: 'blind-floor-wish', form: PM_FIRE_ELEMENTAL, terrain: ROOM },
    { name: 'blind-ice-wish', form: PM_EARTH_ELEMENTAL, terrain: ICE },
];
export function loadBlindVisionRecipes() {
    return cases.map(entry => ({ ...entry, recipe: validateCleanRecipe(
        JSON.parse(readFileSync(new URL(`../recipes/vision.c/${entry.name}.recipe.session.json`, import.meta.url))), entry.name,
    ) }));
}
export async function verifyBlindVisionSegment(segment) {
    const entry = loadBlindVisionRecipes().find(item => item.recipe.segments[0].seed === segment.seed);
    assert.ok(entry);
    let boundary;
    const commandIndex = segment.moves.indexOf('\u0017');
    assert.ok(commandIndex >= 0);
    await runSegment({ ...segment, moves: segment.moves.slice(0, commandIndex) },
        { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, entry.form);
    assert.equal(heroIsBlind(game), true);
    const coordinates = [game.u.ux, game.u.uy];
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, entry.form);
    assert.equal(heroIsBlind(game), true);
    assert.deepEqual([game.u.ux, game.u.uy], coordinates);
    assert.equal(game.level.at(...coordinates).typ, entry.terrain);
    assert.equal(game.vision_full_recalc, 0);
    assert.equal(game.viz_array[game.u.uy][game.u.ux] & IN_SIGHT, 0);
    // monsters.h assigns both elemental forms the uppercase E class. The
    // blind redraw must restore that hero glyph over the wished terrain.
    assert.equal(game.nhDisplay.grid[game.u.uy + 1][game.u.ux - 1].ch, 'E');
    assert.equal(game.nhDisplay.grid[game.u.uy + 1][game.u.ux - 1].color, game.mons[entry.form].mcolor);
}
export async function runBlindVisionMatrix() {
    return runFreshMatrix({
        entries: loadBlindVisionRecipes().map(entry => ({ label: entry.name, recipe: entry.recipe })),
        verifySegment: verifyBlindVisionSegment,
        summaryLabel: 'BLIND VISION EPILOGUE', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runBlindVisionMatrix, 'blind vision epilogue');
