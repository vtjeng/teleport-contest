#!/usr/bin/env node

// Independent C-first production routes through wield.c:setuwep. Capture each
// raw C recording before comparison and retain only matching ones as evidence.
import assert from 'node:assert/strict';
import { OBJ_FLOOR } from '../js/const.js';
import { ART_SUNSWORD } from '../js/artifacts.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { AKLYS, BOOMERANG, LONG_SWORD, PICK_AXE, POT_SLEEPING, RIN_SEARCHING } from '../js/objects.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runDifferential, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const SETUWEP_CASES = [
    'setuwep-bare-hands',
    'setuwep-replacement',
    'setuwep-blind',
    'setuwep-quiver',
    'setuwep-tool',
    'setuwep-drop',
    'setuwep-ring-on',
    'setuwep-container',
    'setuwep-glibr',
    'setuwep-returning-weapon',
    'setuwep-polymorph-weapon',
    'setuwep-potion-melee',
    'setuwep-ballrelease',
    'setuwep-returning-weapon-up',
    'setuwep-dig-fumble',
];

function findSunsword() {
    const search = head => {
        for (let obj = head; obj; obj = obj.nobj) {
            if (obj.oartifact === ART_SUNSWORD) return obj;
            const nested = search(obj.cobj);
            if (nested) return nested;
        }
        return null;
    };
    return search(game.invent) ?? search(game.level.objlist);
}

export async function verifySetuwepSegment(name, segment) {
    const played = await runSegment(segment);
    if (['setuwep-bare-hands', 'setuwep-replacement', 'setuwep-blind',
        'setuwep-quiver', 'setuwep-tool', 'setuwep-drop',
        'setuwep-container', 'setuwep-glibr'].includes(name)) {
        const sword = findSunsword();
        assert.ok(sword, name + ' retained the source artifact object');
        assert.equal(sword.lamplit, false, name + ' completed the source shutdown');
        if (name === 'setuwep-quiver') assert.equal(game.uquiver, sword);
    }
    if (['setuwep-bare-hands', 'setuwep-blind', 'setuwep-drop',
        'setuwep-container', 'setuwep-glibr', 'setuwep-ring-on',
        'setuwep-potion-melee', 'setuwep-ballrelease'].includes(name)) {
        assert.equal(game.uwep, null, name + ' cleared the primary slot');
    }
    if (name === 'setuwep-replacement') {
        assert.equal(game.uwep.otyp, LONG_SWORD);
        assert.notEqual(game.uwep.oartifact, ART_SUNSWORD);
    }
    if (name === 'setuwep-tool') assert.equal(game.uwep.otyp, PICK_AXE);
    if (name === 'setuwep-ring-on') assert.equal(game.uleft.otyp, RIN_SEARCHING);
    if (name.startsWith('setuwep-returning-weapon')) assert.equal(game.uwep.otyp, AKLYS);
    if (name === 'setuwep-polymorph-weapon') {
        // This independent C dip changes the source long sword to a boomerang.
        assert.equal(game.uwep.otyp, BOOMERANG);
    }
    if (name === 'setuwep-potion-melee') {
        for (let obj = game.invent; obj; obj = obj.nobj) {
            assert.notEqual(obj.otyp, POT_SLEEPING, 'the singleton bottle reached potionhit');
        }
    }
    if (name === 'setuwep-dig-fumble') {
        assert.equal(game.uwep, null, 'forced drop cleared the still-wielded pick-axe');
        assert.ok(played.getScreens().some(screen => screen.includes('fumble and drop')),
            'the production dig fumble branch reached dropx and the dropz slot tail');
    }
    if (name === 'setuwep-ballrelease') {
        assert.equal(game.uball.where, OBJ_FLOOR);
        assert.equal(game.u.uz.dlevel, 2); // The C downstairs transition releases the wielded ball on level two.
    }
}

export async function runSetuwepMatrix() {
    mkdirSync('.cache/C134-fresh', { recursive: true });
    mkdirSync('recordings/wield.c', { recursive: true });
    const selected = process.env.SETUWEP_CASE
        ? SETUWEP_CASES.filter(name => name === process.env.SETUWEP_CASE)
        : SETUWEP_CASES;
    if (!selected.length) throw new Error('unknown setuwep fresh case');
    const results = [];
    for (const name of selected) {
        const recipe = validateCleanRecipe(JSON.parse(readFileSync(
            new URL(`../recipes/wield.c/${name}.recipe.session.json`, import.meta.url),
        )), name);
        let recording;
        const result = await runFreshMatrix({
            entries: [{ label: name, recipe }],
            summaryLabel: name.toUpperCase(),
            chunkLimit: 1, // Debug termination leaves a save: isolate each recipe.
            verifySegment: segment => verifySetuwepSegment(name, segment),
            runDifferentialFn: async input => {
                const differential = await runDifferential(input, process.env, {
                    transformRecording: raw => {
                        recording = raw;
                        writeFileSync(`.cache/C134-fresh/${name}.session.json`, JSON.stringify(raw, null, 2) + '\n');
                        return raw;
                    },
                });
                writeFileSync(`.cache/C134-fresh/${name}.comparison.json`, JSON.stringify(differential, null, 2) + '\n');
                if (differential.passed) {
                    writeFileSync(`recordings/wield.c/${name}.session.json`, JSON.stringify(recording, null, 2) + '\n');
                }
                return differential;
            },
        });
        results.push({ name, ...result });
    }
    writeFileSync('.cache/C134-fresh/results.json', JSON.stringify(results, null, 2) + '\n');
    return { passed: results.every(r => r.passed), cases: results };
}

runMatrixCli(import.meta.url, runSetuwepMatrix, 'setuwep');
