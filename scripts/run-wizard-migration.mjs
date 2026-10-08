#!/usr/bin/env node
// Seeds, roles, and count inputs chosen independently before C comparison.
// The matrix checks both source count modes and canceled/ordinary commands.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['migration-random-prefix', 'migration-existing-negative',
    'migration-empty-cancel', 'migration-nonwizard', 'migration-negative-limit', 'migration-integer-count'];
export function loadWizardMigrationRecipes() {
    return names.map(name => ({ label: name, recipe: validateCleanRecipe(
        JSON.parse(readFileSync(new URL(`../recipes/wizcmds.c/${name}.session.json`, import.meta.url))), name,
    ) }));
}
export async function verifyWizardMigrationSegment(segment) {
    const firstCommand = segment.moves.indexOf('#migratemons');
    await runSegment({ ...segment, moves: segment.moves.slice(0, firstCommand) });
    const liveIds = [];
    for (let mon = game.level.monlist; mon; mon = mon.nmon) liveIds.push(mon.m_id);
    const savedMongen = game.iflags.debug_mongen;
    let boundary;
    const result = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.iflags.debug_mongen, savedMongen, 'source restores debug generation flag');
    const pending = [];
    for (let mon = game.gm.migrating_mons; mon; mon = mon.nmon) pending.push(mon);
    if (segment.moves.includes('1trailing') || segment.moves.includes('4294967297')) {
        assert.equal(pending.length, 1, 'decimal prefix creates and migrates one monster');
        assert.ok(result.getScreens().some(screen => screen.startsWith('All migrating monsters:')));
    } else if (segment.moves.includes('-1') || segment.moves.includes('-2000')) {
        const beyondLimit = segment.moves.includes('-2000');
        assert.equal(pending.length, beyondLimit ? liveIds.length : 1, 'negative count consumes the source live chain');
        const expectedIds = beyondLimit ? liveIds : liveIds.slice(0, 1);
        assert.deepEqual(pending.map(mon => mon.m_id).sort((a, b) => a - b),
            expectedIds.sort((a, b) => a - b), 'migration transfers the existing pointers');
        if (beyondLimit) assert.equal(game.level.monlist, null);
        assert.ok(result.getScreens().some(screen => /^Monsters? migrating to next level:/u.test(screen)));
    } else {
        assert.equal(pending.length, 0, 'canceled, nonnumeric and ordinary commands create nothing');
        if (!game.wizard)
            assert.ok(result.getScreens().some(screen => screen.includes('#migratemons: unknown extended command.')));
    }
    for (const mon of pending) {
        assert.deepEqual([mon.mx, mon.my], [0, 0], 'migration removes live coordinates');
        assert.deepEqual([mon.mux, mon.muy], [game.u.uz.dnum, game.u.uz.dlevel + 1]);
        assert.equal(mon.mtrack[0].x, 0, 'MIGR_RANDOM destination code');
        assert.ok(!game.level.monlist || game.level.monlist !== mon);
    }
}
export async function runWizardMigrationMatrix() {
    return runFreshMatrix({ entries: loadWizardMigrationRecipes(),
        summaryLabel: 'WIZARD MIGRATION', chunkLimit: 1,
        verifySegment: verifyWizardMigrationSegment });
}
runMatrixCli(import.meta.url, runWizardMigrationMatrix, 'wizard migration');
