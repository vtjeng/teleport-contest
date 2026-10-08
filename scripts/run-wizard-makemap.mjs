#!/usr/bin/env node
// Independent C-first wizard level recreation. The Tourist variation repeats
// the command immediately, reaching rhack's queued function-pointer arm.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['ordinary', 'repeat-variation', 'nonwizard'];
const loadRecipe = name => JSON.parse(readFileSync(new URL(
    `../recipes/wizcmds.c/makemap-${name}.session.json`, import.meta.url)));

function inventory() {
    const result = [];
    for (let obj = game.invent; obj; obj = obj.nobj)
        result.push([obj.o_id, obj.otyp, obj.quan, obj.invlet]);
    return result;
}

export async function verifyWizardMakemap(input) {
    const name = names.find(candidate => loadRecipe(candidate).segments[0].seed === input.seed);
    assert.ok(name, 'the independent recipe identifies its entry');
    const command = input.moves.indexOf('#wizmakemap');
    await runSegment({ ...input, moves: input.moves.slice(0, command) });
    const before = { moves: game.moves, inventory: inventory() };
    let boundary;
    const replay = await runSegment(input, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    // Each recipe ends with one ordinary wait. Recreation and repeat return
    // ECMD_OK, and unavailable wizard commands also leave time unchanged.
    assert.equal(game.moves, before.moves + 1);
    assert.deepEqual(inventory(), before.inventory, 'recreation retains hero inventory');
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/wizcmds.c/makemap-${name}.session.json`, import.meta.url)));
    const result = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(result.passed, true, JSON.stringify(result));
    const steps = recording.segments[0].steps;
    const generation = steps.filter(step => step.rng.some(draw => draw.includes('@ getbones(bones.c:')));
    // Startup is one generation; explicit command adds one, repeat adds two.
    assert.equal(generation.length, name === 'nonwizard' ? 1 : name === 'ordinary' ? 2 : 3);
    if (name === 'repeat-variation') {
        assert.ok(generation.some(step => step.key === '\x01'),
            'C recreates the level from the queued Ctrl-A repeat');
    }
}

export function runWizardMakemapMatrix() {
    return runFreshMatrix({
        entries: names.map(name => ({ label: `wizard recreation ${name}`, recipe: loadRecipe(name) })),
        summaryLabel: 'WIZARD RECREATION',
        chunkLimit: 1,
        verifySegment: verifyWizardMakemap,
    });
}

runMatrixCli(import.meta.url, runWizardMakemapMatrix, 'wizard level recreation');
