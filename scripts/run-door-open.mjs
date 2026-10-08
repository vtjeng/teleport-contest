#!/usr/bin/env node

// C-first evidence for lock.c:doopen_indir. The chosen seed's C preview
// showed a clear square south of the hero. objnam.c's terrain wishes create
// a wall there before the door, without depending on a generated doorway.
// Door traps, plain doors, missing-key kick fallback and !autoopen/#open
// are cheap variations of the same independent setup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOOR, D_NODOOR, D_ISOPEN, D_BROKEN, CQ_CANNED } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['explicit-trap', 'auto-trap', 'auto-ordinary', 'auto-kick', 'explicit-extended'];
function recipe(name) {
    const path = new URL(`../recipes/lock.c/open-door-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
async function verifySegment(segment) {
    const name = CASES.find(name => {
        const entry = recipe(name).segments[0];
        return entry.seed === segment.seed && entry.moves === segment.moves;
    });
    assert.ok(name, 'each evidence segment belongs to its independent recipe');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/lock.c/open-door-${name}.session.json`, import.meta.url), 'utf8'));
    assert.equal(compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    }).passed, true);
    // tty_curs stores map x-1 and y+offy. C's initial terminal cursor is
    // (49,15), so the wished square south of map (50,14) is (50,15).
    const door = game.level.at(50, 15);
    assert.equal(door.typ, DOOR);
    const steps = recording.segments[0].steps;
    if (name === 'auto-kick') {
        assert.ok(steps.some(step => step.screen.includes('Kick it? [ynq] (q)')));
        assert.ok(steps.some(step => step.rng?.some(call => call.includes('kick_door(dokick.c:930)'))),
            'the canned command reaches the production kick rather than just its prompt');
        assert.equal(door.doormask, D_BROKEN);
        assert.equal(game.command_queue[CQ_CANNED].length, 0);
    } else {
        assert.ok(steps.some(step => step.rng?.some(call => call.includes('doopen_indir(lock.c:904)'))));
        const trapped = name.endsWith('trap');
        assert.equal(door.doormask, trapped ? D_NODOOR : D_ISOPEN);
        assert.equal(steps.some(step => step.rng?.some(call => call.includes('b_trapped(trap.c:6697)'))), trapped);
    }
    assert.equal(game.unported.has('shk.c add_damage'), false,
        'the independent door is outside a shop; shop billing remains a named void gap');
}
export function runDoorOpenMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: `door open ${name}`, recipe: recipe(name) })),
        summaryLabel: 'DOOR OPEN', chunkLimit: 1, verifySegment,
    });
}
runMatrixCli(import.meta.url, runDoorOpenMatrix, 'door open');
