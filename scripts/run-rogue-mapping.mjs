#!/usr/bin/env node
// C-first level arrivals establish display.c's dynamic DARKROOMSYM choice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cmap_to_glyph } from '../js/display.js';
import { ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { S_darkroom, S_stone } from '../js/symbols.js';
import { cansee } from '../js/vision.js';
import { compareSessionOutputs } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const ROGUE_MAPPING_CASES = ['rogue-ranger', 'rogue-samurai', 'ordinary-ranger'];
export function loadRogueMappingRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/display.c/magic-map-${name}-independent.session.json`, import.meta.url,
    )));
}
export async function verifyRogueMappingSegment(input) {
    const name = ROGUE_MAPPING_CASES.find(n => loadRogueMappingRecipe(n).segments[0].seed === input.seed);
    assert.ok(name, 'the verifier receives one declared C-first recipe');
    const gold = JSON.parse(readFileSync(new URL(
        `../recordings/display.c/magic-map-${name}-independent.session.json`, import.meta.url,
    )));
    let boundary;
    const replay = await runSegment({ ...input, recorderIsDst: gold.segments[0].recorderIsDst }, {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    const comparison = compareSessionOutputs(gold, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    const rogue = name !== 'ordinary-ranger';
    const levelMatches = game.u.uz.dnum === game.rogue_level.dnum
        && game.u.uz.dlevel === game.rogue_level.dlevel;
    assert.equal(levelMatches, rogue);
    if (rogue) assert.ok(replay.getScreens().some(screen =>
        screen.includes('an older, more primitive world')));
    assert.equal(Boolean(game.flags.dark_room), true);
    assert.equal(Boolean(game.iflags.wc_color), true);
    const glyph = cmap_to_glyph(rogue ? S_stone : S_darkroom, game);
    let mappedRooms = 0;
    // GameMap dimensions come from C COLNO/ROWNO. x=0 is not a legal map
    // position; detect.c:do_mapping also begins its traversal at column1.
    for (let x = 1; x < game.level.locations.length; ++x) {
        for (let y = 0; y < game.level.locations[x].length; ++y) {
            const loc = game.level.at(x, y);
            if (loc.typ === ROOM && !loc.waslit && !cansee(x, y, game)
                && loc.remembered_glyph?.glyph === glyph) ++mappedRooms;
        }
    }
    assert.ok(mappedRooms > 0, 'production mapping reaches the selected unseen ROOM branch');
    return comparison;
}
export function runRogueMappingMatrix() {
    return runFreshMatrix({
        entries: ROGUE_MAPPING_CASES.map(name => ({ label: name, recipe: loadRogueMappingRecipe(name) })),
        verifySegment: verifyRogueMappingSegment,
        summaryLabel: 'ROGUE MAPPING', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runRogueMappingMatrix, 'rogue mapping');
