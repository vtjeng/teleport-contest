#!/usr/bin/env node
// explode.c:224-255 independent C-first retributive-strike witnesses. These
// four seeds were chosen directly before JavaScript comparisons, without a
// seed scan. C's apply menus establish the wished inventory slots; role and
// wand-class variations exercise both existing production explosion callers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_WIZARD, PM_MONK, PM_HEALER, PM_CAVE_DWELLER,
    PM_HILL_GIANT, PM_STONE_GIANT,
} from '../js/monsters.js';
import { decodeScreen } from '../frozen/screen-decode.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = [
    // Magic-missile spe 2 gives dam 8; integer 8/5 is one Wizard HP.
    { name: 'wand-strike-wizard', role: PM_WIZARD, form: PM_HILL_GIANT, damage: 1 },
    // C-first rnd(12)=6 at do_break_wand; integer 6/5 is one Monk HP.
    { name: 'wand-strike-monk', role: PM_MONK, form: PM_STONE_GIANT, damage: 1 },
    // Same magic-missile charge count gives 8/2, four Healer HP.
    { name: 'wand-strike-healer', role: PM_HEALER, form: PM_HILL_GIANT, damage: 4 },
    // C-first rnd(4)=3 remains three HP for the default Caveman role.
    { name: 'wand-strike-caveman', role: PM_CAVE_DWELLER, form: PM_STONE_GIANT, damage: 3 },
];

export function loadWandBreakCases() {
    return cases.map((entry) => ({ ...entry, recipe: validateCleanRecipe(
        JSON.parse(readFileSync(new URL(
            `../recipes/explode.c/${entry.name}.session.json`, import.meta.url))),
        entry.name,
    ) }));
}

export async function verifyWandBreakSegment(segment) {
    const entry = loadWandBreakCases().find(({ recipe }) =>
        recipe.segments[0].seed === segment.seed);
    assert.ok(entry, 'segment is one of the independent recipes');
    let boundary;
    const replay = await runSegment(segment, {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, undefined, 'production apply reaches the explosion');
    assert.equal(game.urole.mnum, entry.role, 'original role stays canonical');
    assert.equal(game.u.umonnum, entry.form, 'the separate current form persists');
    const frames = replay.getScreens().map((screen) => decodeScreen(screen)
        .map((row) => row.map((cell) => cell.ch).join('')));
    // Created monsters may attack before the apply command returns. Pin the
    // explosion's own boundary before those source-ordered later effects.
    const blast = frames.find((rows) => rows[0].includes('You are caught in the magical blast!'));
    assert.ok(blast, 'production explode reaches the caught message');
    const hp = blast[23].match(/HP:(\d+)\((\d+)\)/u);
    assert.ok(hp);
    assert.equal(Number(hp[1]), Number(hp[2]) - entry.damage,
        'source role division reaches the active polymorph HP pool');
    assert.ok(game.u.mh <= game.u.mhmax - entry.damage,
        'later monster actions may further reduce the same form HP pool');
    const screens = frames.map((rows) => rows.join('\n')).join('\n');
    // apply.c uses "snap" for a balsa wand and "break" for other materials.
    assert.match(screens, /you (?:break|snap) it in two!/u);
    assert.match(screens, /You are caught in the magical blast!/u);
    assert.equal(game.current_wand, null, 'the existing caller discards the broken wand');
}

export async function runWandBreakMatrix() {
    return runFreshMatrix({
        entries: loadWandBreakCases().map(({ name, recipe }) => ({ label: name, recipe })),
        verifySegment: verifyWandBreakSegment,
        summaryLabel: 'RETRIBUTIVE WAND DAMAGE',
        chunkLimit: 1, // Each debug game starts without restoring a previous save.
    });
}

runMatrixCli(import.meta.url, runWandBreakMatrix, 'retributive wand damage');
