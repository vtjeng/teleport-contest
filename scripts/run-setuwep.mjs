#!/usr/bin/env node

// Independent C-first production routes through wield.c:setuwep. Capture each
// raw C recording before comparison and retain only matching ones as evidence.
// The two-segment save routes require the upstream documented gzip recorder
// configuration via NETHACK_BINARY/NETHACK_INSTALL, so external save compression
// succeeds. Default /usr/bin/compress absence exercises a separate files.c gap.
import assert from 'node:assert/strict';
import { OBJ_FLOOR } from '../js/const.js';
import { ART_SUNSWORD } from '../js/artifacts.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';
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
    'setuwep-restore-pickaxe',
    'setuwep-restore-long-sword',
    'setuwep-restore-sunsword',
    'setuwep-restore-bare-hands',
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

export async function verifySetuwepSegment(name, segment, restore = null) {
    const played = await runSegment(restore
        ? { ...segment, storage: restore.storage } : segment);
    if (restore) {
        const primary = game.uwep;
        if (name === 'setuwep-restore-bare-hands') {
            assert.equal(primary, null);
        } else {
            assert.equal(primary.otyp, name === 'setuwep-restore-pickaxe'
                ? PICK_AXE : LONG_SWORD);
        }
        if (name === 'setuwep-restore-sunsword') {
            assert.equal(primary.oartifact, ART_SUNSWORD);
            assert.equal(primary.lamplit, true, 'restore does not extinguish the reconstructed artifact');
        }
        if (restore.index === 0) {
            assert.ok(restore.storage.getItem('vfs:nhsave'), 'production save completed');
        }
        assert.equal(game.unweapon, name === 'setuwep-restore-bare-hands'
            || (restore.index > 0 && name === 'setuwep-restore-pickaxe'));
        return;
    }
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
        const restore = name.startsWith('setuwep-restore-')
            ? { storage: new InMemoryStorage(), index: 0 } : null;
        const result = await runFreshMatrix({
            entries: [{ label: name, recipe }],
            summaryLabel: name.toUpperCase(),
            // Isolate debug saves between recipes, but retain both segments
            // of an explicit save/restore witness in one recorder process.
            chunkLimit: restore ? recipe.segments.length : 1,
            verifySegment: async segment => {
                await verifySetuwepSegment(name, segment, restore);
                if (restore) restore.index++;
            },
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
