#!/usr/bin/env node

// Recheck independently recorded tinning inputs and post-conversion state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Stone_resistance } from '../js/artifacts.js';
import { HOMEMADE_TIN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_STONE_GOLEM } from '../js/monsters.js';
import { CORPSE, TIN, TINNING_KIT } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = [
    'tinning-petrifier-valkyrie-independent',
    'tinning-petrifier-gloves-independent',
    'tinning-iron-golem-independent',
];

async function verifySegment(segment) {
    await runSegment(segment);
    const objects = [];
    for (let object = game.invent; object; object = object.nobj)
        objects.push(object);
    const tin = objects.find((object) => object.otyp === TIN);
    assert.ok(tin, 'conversion leaves a homemade tin');
    assert.equal(tin.spe, -(HOMEMADE_TIN + 1)); // eat.c homemade variety encoding
    assert.ok(objects.some((object) => object.otyp === TINNING_KIT));
    assert.equal(objects.some((object) => object.otyp === CORPSE), false);
    assert.equal(Boolean(game.program_state.gameover), false); // all inputs survive
    if (segment.moves.includes('#polyself')) {
        // trap.c instapetrify consumes polymon(PM_STONE_GOLEM) success.
        assert.equal(game.u.umonnum, PM_STONE_GOLEM);
        assert.equal(Stone_resistance(game), true);
    } else if (segment.moves.includes('leather gloves')) {
        assert.ok(game.uarmg); // gloves exclude the source petrification arm
    }
}

export async function runTinningKitMatrix() {
    return runFreshMatrix({
        entries: names.map((name) => ({
            label: name,
            // Seeds were independently chosen before JS comparison; C
            // observations supplied the kit/corpse inventory letters.
            recipe: JSON.parse(readFileSync(new URL(
                `../recipes/apply.c/${name}.session.json`, import.meta.url,
            ), 'utf8')),
        })),
        summaryLabel: 'TINNING KIT',
        chunkLimit: 1, // retain each independent game's recorder state
        verifySegment,
    });
}

runMatrixCli(import.meta.url, runTinningKitMatrix, 'tinning kit');
