#!/usr/bin/env node
// Independent C-first roles, named lamp and remote gas cloud exercise the
// statistics command, optional allocations and retained region capacity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['ordinary', 'lamp', 'region', 'restored-region', 'nonwizard'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-memory-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(name => { const entry = recipe(name).segments[0]; return entry.seed === segment.seed && entry.moves === segment.moves; });
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    assert.equal(screens.filter(s => s.includes('Current memory statistics:')).length,
        name === 'nonwizard' ? 0 : name === 'restored-region' ? 1 : 2,
        'two complete source command entries');
    assert.ok(!screens.at(-1).includes('Grand total'), 'text window dismissal restores the map');
    assert.equal(game.context.move, 0, 'ECMD_OK leaves no command turn pending');
    if (name === 'lamp') {
        assert.ok(screens.some(s => s.includes('light sources, size 32')),
            'C lit lamp owns a light allocation');
        assert.ok(screens.some(s => s.includes('timers, size 48')),
            'C burning lamp owns a timer allocation');
        let named;
        for (let obj = game.invent; obj; obj = obj.nobj)
            if (obj.oextra?.oname === 'Beacon') named = obj;
        assert.ok(named, 'named lamp exercises source oextra/oname bytes');
    }
    if (name === 'nonwizard') {
        assert.ok(screens.at(-1).includes('#stats: unknown extended command.'),
            'C ordinary-play admission rejects the wizard command');
    }
    if (name === 'restored-region') {
        assert.equal(game.level.regions.length, 1, 'cloud survives the two-level journey');
        assert.equal(game.level.max_regions, 1, 'C restores capacity to the saved live count');
    }
    if (name === 'region') {
        assert.ok(screens.some(s => s.includes('regions, size 96+8*rect+N')),
            'C region allocation is included');
        assert.equal(game.level.regions.length, 0, 'cloud expired before the second report');
        assert.equal(game.level.max_regions, 10, 'source removal retains the original allocation');
    }
}
export async function runMemoryStatisticsMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'MEMORY STATISTICS', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runMemoryStatisticsMatrix, 'wizcmds.c memory statistics');
