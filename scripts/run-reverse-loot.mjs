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
import {BLINDED, LEVITATION, T_LOOTED} from '../js/const.js';
import {normal_obj_to_glyph} from '../js/display.js';
import {weight} from '../js/obj.js';
import {compareSessionOutputs, validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix, runMatrixCli} from './fresh-matrix.mjs';

const CASES = ['inventory', 'gold-floor', 'throne-chest', 'throne-court',
    'throne-looted', 'throne-court-chestless', 'throne-looted-chestless',
    'levitating', 'levitating-rest', 'blind-levitating-full', 'throne-levitating'];
function recipe(name) {
    const path = new URL(`../recipes/pickup.c/reverse-loot-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
function* chain(head, link = 'nobj') { for (let obj = head; obj; obj = obj[link]) yield obj; }
async function verifySegment(segment) {
    const name = CASES.find(name => {
        const input = recipe(name).segments[0];
        return input.seed === segment.seed && input.moves === segment.moves
            && input.nethackrc === segment.nethackrc;
    });
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
    if (name.includes('levitating')) {
        assert.ok(game.u.uprops[LEVITATION].extrinsic,
            'source ring equip still supplies levitation at the final boundary');
        const contributions = steps.filter(step => step.rng.some(call =>
            /rnd\(5\).*reverse_loot/.test(call)));
        assert.ok(contributions.length);
        for (const step of contributions)
            assert.equal(step.rng.filter(call => /rnd\(5\).*reverse_loot/.test(call)).length, 1,
                'one contribution draw per successful coin arm');
        const coins = floor.filter(obj => obj.oclass === COIN_CLASS);
        assert.ok(coins.length);
        if (name === 'levitating-rest') {
            assert.ok(contributions.some(step => step.rng.some(call =>
                /rnd\(5\)=4 .*reverse_loot/.test(call))));
            assert.ok(contributions.some(step => step.rng.some(call => call.includes('next_ident('))),
                'C partial contribution reaches splitobj id allocation before direct drop');
        }
        if (name === 'blind-levitating-full') {
            assert.ok(game.u.uprops[BLINDED].intrinsic);
            const dropped = coins.find(obj => obj.ox === game.u.ux && obj.oy === game.u.uy);
            assert.equal(dropped.quan, 1, 'singular gold-piece wish reaches an unsplit full contribution');
            assert.equal(game.level.at(game.u.ux, game.u.uy).remembered_glyph.glyph,
                normal_obj_to_glyph(dropped, game),
                'Blind+Levitation retains the explicit map_object memory after newsym');
            assert.ok(!contributions.some(step => step.rng.some(call => call.includes('next_ident('))));
        }
        if (name === 'throne-levitating') {
            assert.equal(game.level.at(game.u.ux, game.u.uy).flags, T_LOOTED);
            assert.ok(steps.some(step => /^You drop \d+ gold pieces\./.test(step.screen)));
            assert.ok(!steps.some(step => step.rng.some(call => call.includes('courtmon('))));
        } else {
            assert.ok(steps.some(step => step.screen.includes('Ok, now there is loot here.')));
        }
    } else if (name === 'inventory') {
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
