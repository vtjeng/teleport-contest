#!/usr/bin/env node
// Independent C-first dokick.c object lifecycle witnesses and variations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOOD_RATION, POT_CONFUSION, GOLD_PIECE, LARGE_BOX } from '../js/objects.js';
import { PM_LEPRECHAUN, PM_ORC } from '../js/monsters.js';
import { OBJ_MINVENT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const KICK_OBJECT_CASES = ['kick-fragile-confusion',
    'kick-nonfragile-stack', 'gold-throw-greedy', 'kick-gold-greedy',
    'kick-locked-container'];
export function loadKickObjectRecipe(name) {
    return validateCleanRecipe(JSON.parse(readFileSync(new URL(
        `../recipes/dokick.c/${name}.session.json`, import.meta.url), 'utf8')), name);
}
function floorObjects(type) {
    const result = [];
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === type) result.push(obj);
    return result;
}
export async function verifyKickObjectSegment(segment, name) {
    // Recorder DST is part of the reference replay contract, not a recipe
    // input. Use the persisted C run's metadata for the state-only verifier.
    const recorded = JSON.parse(readFileSync(new URL(
        `../recordings/dokick.c/${name}.session.json`, import.meta.url), 'utf8')).segments[0];
    assert.equal(recorded.seed, segment.seed);
    assert.equal(recorded.moves, segment.moves);
    segment = { ...segment, recorderIsDst: recorded.recorderIsDst };
    const greedySpecies = segment.moves.includes('orc') ? PM_ORC : PM_LEPRECHAUN;
    let goldBefore = 0;
    if (name.includes('greedy')) {
        const attack = name.startsWith('kick-')
            ? segment.moves.indexOf(String.fromCharCode(0x04))
            : segment.moves.lastIndexOf('t$');
        await runSegment({ ...segment, moves: segment.moves.slice(0, attack) });
        for (let mon = game.level.monlist; mon; mon = mon.nmon)
            if (mon.data === game.mons[greedySpecies])
                for (let obj = mon.minvent; obj; obj = obj.nobj)
                    if (obj.otyp === GOLD_PIECE) goldBefore += obj.quan;
    }
    let fragileId;
    if (name === 'kick-fragile-confusion') {
        // Identify the wished object at its source drop before replaying the
        // full case; generation can put unrelated potions elsewhere.
        const kickStart = segment.moves.indexOf(String.fromCharCode(0x04));
        await runSegment({ ...segment, moves: segment.moves.slice(0, kickStart) });
        const dropped = game.level.objects[game.u.ux + 1][game.u.uy];
        assert.equal(dropped.otyp, POT_CONFUSION);
        fragileId = dropped.o_id;
    }
    let boundary = null;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, null);
    if (name === 'kick-fragile-confusion') {
        assert.equal(floorObjects(POT_CONFUSION).some(obj => obj.o_id === fragileId), false,
            'the independently wished potion must have broken');
        assert.equal(game.gk.kickedobj, null);
    } else if (name === 'kick-nonfragile-stack') {
        // C starting Archeologist inventory owns three rations; splitobj
        // leaves two at the drop square and moves one along bhit flight.
        const rations = floorObjects(FOOD_RATION);
        const remainder = rations.find(obj => obj.quan === 2);
        const kicked = rations.find(obj => obj.quan === 1);
        assert.ok(remainder && kicked);
        assert.equal(remainder.oy, kicked.oy);
        assert.ok(kicked.ox > remainder.ox);
        assert.equal(game.gk.kickedobj, null);
    } else if (name.includes('greedy')) {
        let target;
        for (let mon = game.level.monlist; mon; mon = mon.nmon)
            if (mon.data === game.mons[greedySpecies]) target = mon;
        assert.ok(target, 'the C-created target must survive the catch');
        const gold = target.minvent;
        // The wished single coin is caught whole, not placed on the floor.
        let caught;
        for (let obj = gold; obj; obj = obj.nobj)
            if (obj.otyp === GOLD_PIECE) caught = obj;
        assert.ok(caught);
        assert.equal(caught.quan, goldBefore + 1);
        assert.equal(caught.where, OBJ_MINVENT);
        assert.equal(caught.ocarry, target);
        if (name.startsWith('kick-')) assert.equal(game.gk.kickedobj, null);
    } else {
        const boxes = floorObjects(LARGE_BOX);
        assert.equal(boxes.length, 1);
        assert.equal(boxes[0].cobj, null, 'the independent box was wished empty');
        assert.equal(game.gk.kickedobj, null);
    }
}
export async function runKickObjectMatrix() {
    return runFreshMatrix({ entries: KICK_OBJECT_CASES.map(name => ({
        label: name, recipe: loadKickObjectRecipe(name),
    })), verifySegment: async segment => {
        const name = KICK_OBJECT_CASES.find(candidate =>
            loadKickObjectRecipe(candidate).segments[0].moves === segment.moves);
        assert.ok(name);
        await verifyKickObjectSegment(segment, name);
    }, summaryLabel: 'DOKICK.C OBJECTS', chunkLimit: 1 });
}
runMatrixCli(import.meta.url, runKickObjectMatrix, 'dokick.c objects');
