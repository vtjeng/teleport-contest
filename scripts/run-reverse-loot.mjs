#!/usr/bin/env node
// Independent C-first pickup.c:reverse_loot entry/placement witnesses.
// Chestless generation scan predeclared 15630100-15630200, stopping after
// five no-key replays kept two levels. The predicate examined floor chests,
// never confusion/command RNG: see .cache/A156/chestless-seeds.json at delivery.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {CHEST, COIN_CLASS} from '../js/objects.js';
import {T_LOOTED} from '../js/const.js';
import {weight} from '../js/obj.js';
import {compareSessionOutputs, validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix, runMatrixCli} from './fresh-matrix.mjs';

const CASES = ['inventory', 'gold-floor', 'throne-chest', 'throne-court',
    'throne-looted', 'throne-court-chestless', 'throne-looted-chestless'];
function recipe(name) {
    const path = new URL(`../recipes/pickup.c/reverse-loot-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
function* chain(head, link = 'nobj') { for (let obj = head; obj; obj = obj[link]) yield obj; }
async function verifySegment(segment) {
    const name = CASES.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name);
    let boundary;
    const replay = await runSegment(segment, {onBoundary: error => {boundary = error;}});
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/pickup.c/reverse-loot-${name}.session.json`, import.meta.url), 'utf8'));
    assert.equal(compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    }).passed, true);
    const steps = recording.segments[0].steps;
    assert.ok(steps.some(step => step.rng.some(call => call.includes('reverse_loot('))));
    const floor = [...chain(game.level.objlist)];
    if (name === 'inventory') {
        assert.ok(![...chain(game.invent)].some(obj => obj.oclass === COIN_CLASS));
        assert.ok(steps.some(step => step.rng.filter(call => /reverse_loot.*2361/.test(call)).length === 5),
            'C inventory route falls off the end after all five decreasing-bound draws');
    } else if (name === 'gold-floor') {
        assert.ok(steps.some(step => step.screen.includes('Ok, now there is loot here.')));
        assert.ok(floor.some(obj => obj.oclass === COIN_CLASS));
    } else if (name === 'throne-court-chestless') {
        assert.ok(!floor.some(obj => obj.otyp === CHEST));
        assert.ok(steps.some(step => step.screen.includes('The exchequer accepts your contribution.')));
        assert.ok([...chain(game.level.monlist, 'nmon')].some(mon =>
            [...chain(mon.minvent)].some(obj => obj.oclass === COIN_CLASS)));
    } else if (name === 'throne-looted-chestless') {
        assert.ok(!floor.some(obj => obj.otyp === CHEST));
        assert.equal(game.level.at(game.u.ux, game.u.uy).flags, T_LOOTED);
        assert.ok(steps.some(step => /^You drop \d+ gold pieces\./.test(step.screen)));
        assert.ok(!steps.some(step => step.rng.some(call => call.includes('courtmon('))),
            'already-looted throne short-circuits court selection and creation');
        assert.ok(floor.some(obj => obj.oclass === COIN_CLASS));
    } else {
        const chest = floor.find(obj => obj.otyp === CHEST &&
            [...chain(obj.cobj)].some(child => child.oclass === COIN_CLASS));
        assert.ok(chest, 'production contribution reaches an actual floor chest');
        assert.equal(chest.cknown, 0);
        assert.equal(Boolean(chest.olocked), true);
        assert.equal(chest.owt, weight(chest, {state: game}));
        assert.ok(steps.some(step => step.screen.includes('reduce the debt')));
        if (name === 'throne-chest')
            assert.ok(steps.some(step => step.screen.includes('Klunk!')));
    }
}
export function runReverseLootMatrix() {
    return runFreshMatrix({entries: CASES.map(name => ({label: name, recipe: recipe(name)})),
        summaryLabel: 'REVERSE LOOT', chunkLimit: 1, verifySegment});
}
runMatrixCli(import.meta.url, runReverseLootMatrix, 'reverse loot');
