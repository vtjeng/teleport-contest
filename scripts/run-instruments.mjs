#!/usr/bin/env node
// Seed 8547721 was selected before inspection; no natural seed scan was
// needed. The sleep-before-play assertion rejects non-reaching wake cases.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEAF, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LEPRECHAUN } from '../js/monsters.js';
import { LEATHER_DRUM } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadInstrumentRecipes() {
    return ['drum-wakes-leprechaun', 'drum-deaf-wakes-leprechaun',
        'empty-earthquake-drum', 'horn-wakes-leprechaun',
        'flute-chosen-tune', 'empty-magic-flute'].map(label => ({ label,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/music.c/${label}.session.json`, import.meta.url), 'utf8')) }));
}
function leprechaun() {
    for (let mon = game.level.monlist; mon; mon = mon.nmon)
        if (mon.data === game.mons[PM_LEPRECHAUN]) return mon;
    return null;
}
export async function verifyInstrumentSegment(segment) {
    const playStart = segment.moves.lastIndexOf('ae');
    assert.ok(playStart > 0);
    const checkWake = segment.moves.includes('leprechaun');
    if (checkWake) {
        let boundary;
        await runSegment({ ...segment, moves: segment.moves.slice(0, playStart) },
            { onBoundary: error => { boundary = error; } });
        if (boundary) throw boundary;
        assert.ok(leprechaun()?.msleeping, 'the independent target must begin asleep');
    }
    let boundary;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    if (checkWake) {
        assert.equal(Boolean(leprechaun()?.msleeping), false);
        assert.ok(leprechaun(), 'the target must survive the implemented wake path');
    }
    let instrument;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.invlet === 'e') instrument = obj;
    assert.ok(instrument, 'apply must retain the instrument');
    if (instrument.otyp === LEATHER_DRUM && !segment.nethackrc.includes('OPTIONS=deaf'))
        assert.ok(game.u.uprops[DEAF].intrinsic & TIMEOUT, 'ordinary drum adds real deafness');
    if (!segment.moves.includes('aen')) assert.ok(game.context.jingle, 'improvisation stores its tune');
    assert.equal(game.nhDisplay.inputQueueLength, 0);
}
export function runInstrumentMatrix() {
    return runFreshMatrix({ entries: loadInstrumentRecipes(),
        verifySegment: verifyInstrumentSegment, summaryLabel: 'INSTRUMENTS' });
}
runMatrixCli(import.meta.url, runInstrumentMatrix, 'instruments');
