#!/usr/bin/env node
// cmd.c domonability(): independent fixed seeds chosen before JS comparison,
// without a search. Race, form and terrain vary the source dispatch. C-observed
// More and wizard confirmation are retained to complete the fountain return.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GREMLIN, PM_WHITE_UNICORN, PM_KNIGHT, PM_RED_DRAGON } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const MONABILITY_CASES = [
    { name: 'gremlin-fountain', form: PM_GREMLIN, splits: true },
    { name: 'gremlin-dry-floor', form: PM_GREMLIN, splits: false },
    { name: 'unicorn-intrinsic', form: PM_WHITE_UNICORN, splits: false },
    { name: 'steed-no-target', form: PM_KNIGHT, splits: false, steed: true },
];
export function loadMonabilityRecipe(name) {
    return validateCleanRecipe(JSON.parse(readFileSync(new URL(
        `../recipes/cmd.c/monster-ability-${name}-independent.session.json`,
        import.meta.url,
    ))), name);
}
function clones(state) {
    const result = [];
    for (let mon = state.level.monlist; mon; mon = mon.nmon)
        if (mon.mcloned) result.push(mon);
    return result;
}
export async function verifyMonabilitySegment(segment) {
    const entry = MONABILITY_CASES.find(({ name }) =>
        loadMonabilityRecipe(name).segments[0].seed === segment.seed);
    assert.ok(entry, 'a planned input case supplies the state assertion');
    const marker = segment.moves.indexOf('#monster\n');
    assert.ok(marker >= 0);
    let boundary;
    await runSegment({ ...segment, moves: segment.moves.slice(0, marker) }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, entry.form);
    if (entry.steed) {
        assert.equal(game.u.usteed?.data.pmidx, PM_RED_DRAGON);
    }
    const hp = game.u.mh;
    const max = game.u.mhmax;
    const oldCloneCount = clones(game).length;
    boundary = undefined;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, entry.form);
    if (entry.steed) {
        assert.equal(game.u.usteed?.data.pmidx, PM_RED_DRAGON);
        assert.ok(game.unported.has('dogmove.c pet_ranged_attk'));
    }
    const after = clones(game);
    assert.equal(after.length, oldCloneCount + (entry.splits ? 1 : 0));
    if (entry.splits) {
        const clone = after.find((mon) => mon.mnum === PM_GREMLIN);
        assert.ok(clone?.mtame);
        // potion.c split_mon and mhitu.c cloneu: original keeps the odd HP,
        // both current and maximum pools are conserved independently.
        assert.equal(clone.mhp, Math.trunc(hp / 2));
        assert.equal(clone.mhpmax, Math.trunc(max / 2));
        assert.equal(game.u.mh + clone.mhp, hp);
        assert.equal(game.u.mhmax + clone.mhpmax, max);
        assert.equal(clone.mextra.mgivenname, game.plname);
        // This C-first seed draws dryup's affirmative branch; the recorded
        // wizard y answer must turn the fountain into ROOM before return.
        assert.equal(game.level.at(game.u.ux, game.u.uy).typ, ROOM);
    } else {
        assert.equal(game.u.mh, hp);
        assert.equal(game.u.mhmax, max);
    }
}
export async function runMonabilityMatrix() {
    return runFreshMatrix({
        entries: MONABILITY_CASES.map(({ name }) => ({
            label: name, recipe: loadMonabilityRecipe(name),
        })),
        summaryLabel: 'MONSTER ABILITY',
        verifySegment: verifyMonabilitySegment,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runMonabilityMatrix, 'monster ability');
