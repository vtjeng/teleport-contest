#!/usr/bin/env node
// eat.c cprefx(): these inputs were designed before JS comparison. Species,
// race and caller vary golem conversion and early tin cleanup after stoning.
// Recipe letter/pager corrections come from the independently recorded C run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_FLESH_GOLEM, PM_STONE_GOLEM, PM_WIZARD } from '../js/monsters.js';
import { TIN } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const CORPSE_PREFX_CASES = [
    { name: 'golem-corpse', prefix: 'ey', form: PM_FLESH_GOLEM },
    { name: 'golem-tin', prefix: 'an ', form: PM_FLESH_GOLEM, tin: true },
    { name: 'fatal-tin-lifesaved', prefix: 'ao ', form: PM_WIZARD, tin: true },
];
export function loadCorpsePrefxRecipe(name) {
    return validateCleanRecipe(JSON.parse(readFileSync(new URL(
        `../recipes/eat.c/prefx-${name}-independent.session.json`,
        import.meta.url,
    ))), name);
}
function tins(state) {
    const result = [];
    for (let obj = state.invent; obj; obj = obj.nobj)
        if (obj.otyp === TIN) result.push(obj);
    return result;
}
export async function verifyCorpsePrefxSegment(segment) {
    const entry = CORPSE_PREFX_CASES.find(({ name }) =>
        loadCorpsePrefxRecipe(name).segments[0].seed === segment.seed);
    assert.ok(entry, 'the planned input case supplies the caller assertion');
    const marker = segment.moves.lastIndexOf(entry.prefix);
    assert.ok(marker >= 0);
    let boundary;
    await runSegment({ ...segment, moves: segment.moves.slice(0, marker) }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, entry.form);
    if (entry.tin) assert.equal(tins(game).length, 1);
    boundary = undefined;
    const run = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(Boolean(game.program_state.gameover), false);
    if (entry.form === PM_FLESH_GOLEM) {
        assert.equal(game.u.umonnum, PM_STONE_GOLEM);
        // makemon.c golemhp() gives the new stone form 100 maximum HP.
        // The corpse variation can take source monster damage afterward.
        assert.equal(game.u.mhmax, 100);
        assert.ok(game.u.mh > 0 && game.u.mh <= game.u.mhmax);
    } else {
        assert.equal(game.u.umonnum, entry.form);
        assert.ok(game.u.uhp > 0, 'wizard death decline resumes a living hero');
        assert.ok(run.getScreens().some((screen) =>
            screen.includes("OK, so you don't die.")));
    }
    if (entry.tin) {
        assert.deepEqual(tins(game), []);
        assert.equal(game.context.tin.tin, null);
        assert.equal(game.context.tin.o_id, 0);
        assert.equal(game.context.victual.piece, null);
        assert.equal(game.context.victual.eating, 0);
    }
}
export async function runCorpsePrefxMatrix() {
    return runFreshMatrix({
        entries: CORPSE_PREFX_CASES.map(({ name }) => ({
            label: name, recipe: loadCorpsePrefxRecipe(name),
        })),
        summaryLabel: 'CORPSE PRE-EFFECTS',
        verifySegment: verifyCorpsePrefxSegment,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runCorpsePrefxMatrix, 'corpse pre-effects');
