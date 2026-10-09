#!/usr/bin/env node
// Independent C-first action routes verify command admission, repeated target
// selection, actual monster/hero movement and direction cancellation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['newt', 'giant', 'hero', 'cancel', 'nonwizard'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-telekinesis-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
function snapshot() {
    const monster = game.level.monlist;
    return { x: game.u.ux, y: game.u.uy,
        monster: monster && { x: monster.mx, y: monster.my } };
}
async function verifySegment(segment) {
    const name = cases.find(n => recipe(n).segments[0].seed === segment.seed);
    const prefix = segment.moves.slice(0, segment.moves.indexOf('#wiztelekinesis'));
    await runSegment({ ...segment, moves: prefix });
    const before = snapshot();
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    if (name === 'nonwizard') {
        assert.ok(screens.some(s => s.includes('#wiztelekinesis: unknown extended command.')),
            'source registry excludes normal play');
    } else {
        assert.ok(screens.some(s => s.includes('Pick a monster to hurtle.')),
            'production dispatcher enters the source target loop');
        assert.ok(screens.some(s => s.includes('which direction?')),
            'visible monster or hero passes the source target gate');
        assert.ok(!screens.at(-1).includes('which direction?'), 'cancel leaves the command input boundary');
    }
    if (name === 'newt' || name === 'giant') {
        const monster = game.level.monlist;
        assert.equal(monster.mstun, 1, 'mhurtle always stuns before size and direction gates');
        assert.equal(monster.movement, 0, 'source clears target movement without spending a command turn');
        if (name === 'newt') assert.ok(monster.mx > before.monster.x, 'east hurtle moves the source target');
        else {
            assert.deepEqual([monster.mx, monster.my], [before.monster.x, before.monster.y], 'huge target cannot budge');
            assert.ok(screens.some(s => s.includes("stone giant doesn't budge!")), 'source huge-size refusal is visible');
        }
    }
    if (name === 'hero') assert.ok(game.u.uy < before.y, 'north hurtle moves hero before the wall collision');
    if (name === 'cancel') assert.deepEqual([game.u.ux, game.u.uy], [before.x, before.y], 'direction cancel precedes movement');
    assert.equal(game.context.move, 0, 'source command does not spend a turn');
}
export async function runWizTelekinesisMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD TELEKINESIS', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWizTelekinesisMatrix, 'wizcmds.c telekinesis');
