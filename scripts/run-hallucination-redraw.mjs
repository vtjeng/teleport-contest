#!/usr/bin/env node

// Independent display.c:docrt_flags witnesses through wizcmds.c:wiz_intrinsic.
// u_init.c's fixed inventories provide the floor object without copying the
// admitted pear input. Each recipe drops one item, steps away, enables
// hallucination, then cancels a second intrinsic menu to redraw it again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HALLUC, IN_SIGHT, OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { DAGGER, FLINT, POT_HEALING } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const HALLUCINATION_REDRAW_CASES = [
    { name: 'hallucination-redraw-dagger', otyp: DAGGER },
    { name: 'hallucination-redraw-potion', otyp: POT_HEALING },
    { name: 'hallucination-redraw-flint', otyp: FLINT },
];

export function loadHallucinationRedrawRecipes() {
    return HALLUCINATION_REDRAW_CASES.map((entry) => ({
        ...entry,
        recipe: validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/display.c/${entry.name}.recipe.session.json`,
            import.meta.url,
        ))), entry.name),
    }));
}

export async function verifyHallucinationRedraw(segment, otyp) {
    const output = await runSegment(segment);
    assert.equal(output.error, undefined);
    assert.ok(game.u.uprops[HALLUC].intrinsic > 0);
    let object = game.level.objlist;
    while (object && object.otyp !== otyp) object = object.nobj;
    assert.ok(object, 'the selected starting item reached the floor');
    assert.equal(object.where, OBJ_FLOOR);
    assert.equal(Math.abs(object.ox - game.u.ux), 1);
    assert.equal(object.oy, game.u.uy);
    assert.ok(game.viz_array[object.oy][object.ox] & IN_SIGHT);
    const location = game.level.at(object.ox, object.oy);
    assert.equal(location.remembered_glyph.glyph, location.disp_glyph.glyph,
        'the restored visible object and its remembered glyph agree');
}

export async function runHallucinationRedrawMatrix() {
    const entries = loadHallucinationRedrawRecipes();
    for (const { recipe, otyp } of entries)
        await verifyHallucinationRedraw(recipe.segments[0], otyp);
    return runFreshMatrix({
        entries: entries.map(({ name, recipe }) => ({ label: name, recipe })),
        summaryLabel: 'hallucination redraw',
    });
}

runMatrixCli(import.meta.url, runHallucinationRedrawMatrix,
    'hallucination redraw');
