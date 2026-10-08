#!/usr/bin/env node

// Independent C-first runtime evidence for pray.c angrygods and the
// minion.c summon_minion calls in anger and rival altar offerings.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { A_CHAOTIC, A_LAWFUL } from '../js/const.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['sacrifice-neutral', 'sacrifice-lawful', 'sacrifice-lessons',
    'sacrifice-curses', 'sacrifice-punishment', 'delayed-prayer',
    'negative-offering', 'rival-altar', 'rival-altar-chaotic'];

function recipe(name) {
    const path = new URL(`../recipes/pray.c/anger-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

async function verifySegment(segment) {
    const name = CASES.find(name => {
        const entry = recipe(name).segments[0];
        return entry.seed === segment.seed && entry.moves === segment.moves;
    });
    assert.ok(name, 'each matrix entry has an independent recipe');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/pray.c/anger-${name}.session.json`, import.meta.url), 'utf8'));
    assert.equal(compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    }).passed, true);
    assert.equal(game.unported.has('pray.c angrygods'), false);
    assert.equal(game.unported.has('minion.c summon_minion'), false);
    if (name.startsWith('rival-altar')) {
        // C sets emin before speaking and overrides peacefulness without
        // recomputing malign; the altar variation chooses the opposing deity.
        const alignment = name.endsWith('chaotic') ? A_CHAOTIC : A_LAWFUL;
        const minion = game.level.monsters.flat().find(mon =>
            mon?.isminion && mon.mextra?.emin?.min_align === alignment);
        assert.ok(minion, 'the source caller created an aligned minion');
        assert.equal(minion.mpeaceful, false);
        assert.equal(minion.mextra.emin.renegade, false);
        assert.ok(recording.segments[0].steps.some(step =>
            step.screen.includes('Thou shalt pay for thine indiscretion!')));
    } else {
        assert.ok(recording.segments[0].steps.some(step =>
            step.rng?.some(call => call.includes('angrygods(pray.c:725)'))),
        'the C command reaches the anger selector');
        assert.ok(game.u.ublesscnt > 0, 'the source anger timer was set');
    }
}

export function runPrayAngerMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: `divine anger ${name}`, recipe: recipe(name) })),
        summaryLabel: 'DIVINE ANGER', chunkLimit: 1, verifySegment,
    });
}

runMatrixCli(import.meta.url, runPrayAngerMatrix, 'divine anger');
