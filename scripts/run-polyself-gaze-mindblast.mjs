#!/usr/bin/env node
// Independently selected fixed seeds 124070201/202, with gnome/orc Wizard
// starting inventories and level eight. No seed search. The recipes exercise
// AD_CONF against a newt and ordinary (nontelepathic) psychic selection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_NEWT, PM_UMBER_HULK, PM_MIND_FLAYER } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = [
    { name: 'gaze-confusion-newt', form: PM_UMBER_HULK },
    { name: 'mindblast-ordinary-newt', form: PM_MIND_FLAYER },
];
export function loadGazeMindblastRecipes() {
    return cases.map(entry => ({ ...entry, recipe: validateCleanRecipe(
        JSON.parse(readFileSync(new URL(`../recipes/polyself.c/${entry.name}.recipe.session.json`, import.meta.url))), entry.name,
    ) }));
}

export async function verifyGazeMindblastSegment(segment) {
    const entry = loadGazeMindblastRecipes().find(({ recipe }) => recipe.segments[0].seed === segment.seed);
    assert.ok(entry);
    const commandIndex = segment.moves.indexOf('#monster');
    assert.ok(commandIndex >= 0);
    let boundary;
    await runSegment({ ...segment, moves: segment.moves.slice(0, commandIndex) },
        { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, entry.form);
    const beforeEnergy = game.u.uen;
    const beforeMove = game.moves;
    const actors = [];
    for (let mon = game.level.monlist; mon; mon = mon.nmon) actors.push(mon);
    const newt = actors.find(mon => mon.mnum === PM_NEWT);
    assert.ok(newt && !newt.mpeaceful, 'debug creation must provide the claimed hostile target');
    const targetId = newt.m_id;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, entry.form);
    // nh_timeout regenerates energy, so the bound allows that source tail
    // while still proving expenditure of the special ability's 15/10 cost.
    assert.ok(game.u.uen <= beforeEnergy - (entry.form === PM_UMBER_HULK ? 14 : 9));
    assert.ok(game.moves > beforeMove);
    const screens = replay.getScreens().join('\n');
    if (entry.form === PM_UMBER_HULK) {
        let target;
        for (let mon = game.level.monlist; mon; mon = mon.nmon)
            if (mon.m_id === targetId) target = mon;
        assert.equal(target?.mconf, 1);
        assert.ok(screens.includes('Your gaze confuses the newt!'));
    } else {
        assert.ok(screens.includes('A wave of psychic energy pours out.'));
        assert.ok(replay.getRngSlices().slice(commandIndex + '#monster\n'.length).flat().some(line => /^rn2\(10\)=/u.test(line)));
    }
}
export async function runGazeMindblastMatrix() {
    return runFreshMatrix({
        entries: loadGazeMindblastRecipes().map(entry => ({ label: entry.name, recipe: entry.recipe })),
        verifySegment: verifyGazeMindblastSegment,
        summaryLabel: 'GAZE AND MINDBLAST', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runGazeMindblastMatrix, 'gaze and mindblast');
