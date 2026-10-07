#!/usr/bin/env node
// Independently chosen seeds 134371–134383 vary takeoff menu style, role,
// equipment, and the fragile iron-bars caller. No seed search was needed.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ART_SUNSWORD } from '../js/artifacts.js';
import { runDifferential, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const TAKEOFF_CASES = [
    ['do_wear.c', 'takeoff-all-primary'],
    ['do_wear.c', 'takeoff-all-traditional-primary'],
    ['do_wear.c', 'takeoff-all-primary-shield'],
    ['do_wear.c', 'takeoff-all-typed-primary'],
    ['pickup.c', 'takeoff-all-filtered-priest'],
    ['do_wear.c', 'takeoff-all-combination-primary'],
    ['do_wear.c', 'takeoff-all-cancel'],
    ['do_wear.c', 'takeoff-alternate-itemaction'],
    ['do_wear.c', 'takeoff-reset-cursed-wielded'],
    ['do_wear.c', 'takeoff-reset-welded-commands'],
    ['wield.c', 'setuwep-iron-bars-singleton'],
    ['wield.c', 'setuwep-iron-bars-stack'],
];

async function verifyTakeoffSegment(name, segment) {
    await runSegment(segment);
    if (name.startsWith('takeoff-reset-')) {
        assert.ok(game.uwep.cursed, 'the source curse/weld branch retains a cursed primary');
        assert.equal(game.context.takeoff.mask, 0);
        assert.equal(game.context.takeoff.disrobing, '');
    } else if (name === 'takeoff-alternate-itemaction') {
        assert.equal(game.uswapwep, null, 'inventory action reaches remarm_swapwep and do_takeoff');
        assert.ok(game.uwep, 'the primary weapon stays wielded');
    } else if (name === 'takeoff-all-cancel') {
        assert.ok(game.uwep, 'canceled menu retains the primary weapon');
        assert.equal(game.context.takeoff.mask, 0);
    } else if (name === 'setuwep-iron-bars-stack') {
        assert.equal(game.uwep.quan, 2, 'the source splits one bottle and retains the stack');
    } else {
        assert.equal(game.uwep, null, name + ' clears the primary slot');
        if (name.startsWith('takeoff-all-')) {
            assert.equal(game.context.takeoff.mask, 0, 'the occupation exhausted its selection');
            assert.equal(game.context.takeoff.what, 0);
        }
    }
    if (['takeoff-all-primary', 'takeoff-all-primary-shield'].includes(name)) {
        let sword;
        for (let obj = game.invent; obj; obj = obj.nobj) {
            if (obj.oartifact === ART_SUNSWORD) sword = obj;
        }
        assert.ok(sword);
        assert.equal(sword.lamplit, false, 'takeoff uses the canonical artifact shutdown');
    }
    if (name === 'takeoff-all-primary') {
        assert.equal(game.context.takeoff.disrobing, '', 'movement invokes reset_remarm');
    }
    if (name === 'takeoff-all-primary-shield') assert.equal(game.uarms, null);
}

export async function runTakeoffMatrix() {
    mkdirSync('.cache/C134-takeoff-fresh', { recursive: true });
    const selected = process.env.TAKEOFF_CASE
        ? TAKEOFF_CASES.filter(([, name]) => name === process.env.TAKEOFF_CASE)
        : TAKEOFF_CASES;
    if (!selected.length) throw new Error('unknown takeoff fresh case');
    const results = [];
    for (const [folder, name] of selected) {
        mkdirSync(`recordings/${folder}`, { recursive: true });
        const recipe = validateCleanRecipe(JSON.parse(readFileSync(
            new URL(`../recipes/${folder}/${name}.recipe.session.json`, import.meta.url),
        )), name);
        let recording;
        const result = await runFreshMatrix({
            entries: [{ label: name, recipe }],
            summaryLabel: name.toUpperCase(),
            chunkLimit: 1,
            verifySegment: segment => verifyTakeoffSegment(name, segment),
            runDifferentialFn: async input => {
                const differential = await runDifferential(input, process.env, {
                    transformRecording: raw => {
                        recording = raw;
                        writeFileSync(`.cache/C134-takeoff-fresh/${name}.session.json`, JSON.stringify(raw, null, 2) + '\n');
                        return raw;
                    },
                });
                writeFileSync(`.cache/C134-takeoff-fresh/${name}.comparison.json`, JSON.stringify(differential, null, 2) + '\n');
                if (differential.passed) {
                    writeFileSync(`recordings/${folder}/${name}.session.json`, JSON.stringify(recording, null, 2) + '\n');
                }
                return differential;
            },
        });
        results.push({ folder, name, ...result });
    }
    writeFileSync('.cache/C134-takeoff-fresh/results.json', JSON.stringify(results, null, 2) + '\n');
    return { passed: results.every(r => r.passed), cases: results };
}

runMatrixCli(import.meta.url, runTakeoffMatrix, 'takeoff-all');
