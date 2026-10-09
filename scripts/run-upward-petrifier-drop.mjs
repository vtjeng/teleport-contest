#!/usr/bin/env node
// dothrow.c:toss_up's surviving-petrifier drop precedes done(STONING).
// Independent C-first species and helmet variations retain the corpse timer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { CORPSE } from '../js/objects.js';
import { compareSessionOutputs } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const NAMES = ['cockatrice', 'chickatrice', 'helmet'];
function recording(name) {
    return JSON.parse(readFileSync(new URL(
        `../recordings/dothrow.c/upward-petrifier-${name}-independent.session.json`,
        import.meta.url,
    )));
}
function recipe(name) {
    const value = JSON.parse(readFileSync(new URL(
        `../recipes/dothrow.c/upward-petrifier-${name}-independent.session.json`,
        import.meta.url,
    )));
    value.segments[0].recorderIsDst = recording(name).segments[0].recorderIsDst;
    return value;
}

export async function verifyUpwardPetrifierSegment(segment) {
    const name = segment.moves.includes('uncursed helmet') ? 'helmet'
        : segment.moves.includes('chickatrice corpse') ? 'chickatrice'
        : 'cockatrice';
    let boundary;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    const comparison = compareSessionOutputs(recording(name), {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    const screens = replay.getScreens().join('\n');
    assert.ok(screens.includes(name === 'helmet'
        ? 'Fortunately, you are wearing a hard helmet.'
        : "OK, so you don't die.  You survived that attempt on your life."));
    assert.equal(game.u.umortality, name === 'helmet' ? 0 : 1);
    assert.equal(game.gt.thrownobj, null);
    let corpse;
    for (const column of game.level.objects) {
        for (const head of column ?? []) {
            for (let obj = head; obj; obj = obj.nexthere) {
                if (obj.otyp === CORPSE) corpse = obj;
            }
        }
    }
    assert.ok(corpse);
    assert.equal(corpse.where, OBJ_FLOOR);
    assert.equal(game.level.objects[corpse.ox][corpse.oy], corpse);
    assert.ok(corpse.timed > 0);
    let timer;
    for (let node = game.gt.timer_base; node; node = node.next) {
        if (node.arg === corpse) timer = node;
    }
    assert.ok(timer, 'the floor corpse keeps its original object timer');
    for (let obj = game.invent; obj; obj = obj.nobj) {
        assert.notStrictEqual(obj, corpse);
    }
}

export function runUpwardPetrifierDropMatrix() {
    return runFreshMatrix({
        entries: NAMES.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'UPWARD PETRIFIER DROP', chunkLimit: 1,
        verifySegment: verifyUpwardPetrifierSegment,
    });
}
runMatrixCli(import.meta.url, runUpwardPetrifierDropMatrix, 'upward petrifier drop');
