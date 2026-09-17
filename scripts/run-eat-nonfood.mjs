#!/usr/bin/env node

// Fresh production witnesses for eat.c doeat_nonfood().  Each segment wishes
// a flammable bull whip, changes the hero into a fire elemental, and invokes
// the ordinary #eat dispatcher.  The two inputs use different roles and seeds
// so the accepted object is not tied to one startup inventory or character.

import assert from 'node:assert/strict';

import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runSegment } from '../js/jsmain.js';
import { PM_FIRE_ELEMENTAL } from '../js/monsters.js';
import { BULLWHIP } from '../js/objects.js';
import * as gstate from '../js/gstate.js';

function recipeSegment(seed, role, moves) {
    return {
        seed,
        datetime: '20381117091623',
        nethackrc: [
            `OPTIONS=name:NonFood${role},role:${role},race:human,gender:female,align:neutral`,
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=playmode:debug,pettype:none,!acoustics,!autopickup,time',
            '',
        ].join('\n'),
        moves,
    };
}

const NONFOOD_MOVES = '.\x17bull whip\n#polyself\nfire elemental\n meo.';
const NONFOOD_VARIATION_MOVES = '.\x17bull whip\n#polyself\nfire elemental\n mee.';

export function loadEatNonfoodRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            recipeSegment(8420017, 'Wizard', NONFOOD_MOVES),
        ],
    }, 'eat non-food recipe');
}

export function loadEatNonfoodVariationRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Cheap role variation of the independent Wizard witness. The
            // same source branch is reached through a different starting pack.
            recipeSegment(8420019, 'Valkyrie', NONFOOD_VARIATION_MOVES),
        ],
    }, 'eat non-food variation recipe');
}

async function verifySegment(segment) {
    await runSegment(segment);
    assert.equal(
        gstate.game.youmonst.data.pmidx,
        PM_FIRE_ELEMENTAL,
        'the production witness remains in fire-elemental form',
    );
    let bullwhip = null;
    for (let obj = gstate.game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === BULLWHIP) bullwhip = obj;
    }
    assert.equal(bullwhip, null, 'doeat_nonfood consumes the bullwhip');
    assert.equal(
        gstate.game.context?.victual?.piece ?? null,
        null,
        'eatspecial clears the one-turn victual state',
    );
}

export async function runEatNonfoodMatrix() {
    const ordinary = await runFreshMatrix({
        entries: [{
            label: 'eat non-food',
            recipe: loadEatNonfoodRecipe(),
        }],
        summaryLabel: 'EAT NON-FOOD',
        verifySegment,
    });
    if (!ordinary.passed) return ordinary;
    return runFreshMatrix({
        entries: [{
            label: 'eat non-food (role variation)',
            recipe: loadEatNonfoodVariationRecipe(),
        }],
        summaryLabel: 'EAT NON-FOOD (ROLE VARIATION)',
        verifySegment,
    });
}

runMatrixCli(import.meta.url, runEatNonfoodMatrix, 'eat non-food');
