#!/usr/bin/env node

// Record and replay the common generated-shop floor-price transaction against
// the patched C reference. The hero level-teleports into a natural D:5 shop,
// dismisses its greeting, then steps west onto one stock potion. The movement
// input boundary captures the priced message and the next command prompt.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { POT_WATER } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export function loadShopFloorPricingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independently generated D:5 arrives at <25,11> inside a
            // potion shop whose west stock square holds one clear potion.
            seed: 7633019,
            datetime: '20310417113000',
            nethackrc: [
                'OPTIONS=name:ShopPrice,role:Wizard,race:human,gender:male,'
                    + 'align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,playmode:debug,!autopickup',
                '',
            ].join('\n'),
            // Ctrl-V opens the wizard level-teleport prompt. Space dismisses
            // the generated-shop greeting; h moves to <24,11> and captures
            // the priced result at the next input boundary.
            moves: '.\x165\n h',
        }],
    }, 'shop floor pricing recipe');
}

export async function verifyShopFloorPricingSegment(segment) {
    let boundary = null;
    const replay = await runSegment(
        segment,
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;
    if (game.u.ux !== 24 || game.u.uy !== 11)
        throw new Error('shop-price case did not reach <24,11>');
    const object = game.level.objects[24]?.[11] ?? null;
    if (!object || object.nexthere || object.otyp !== POT_WATER
        || object.where !== OBJ_FLOOR || object.quan !== 1) {
        throw new Error('shop-price case changed its natural potion stock');
    }
    if (!object.dknown)
        throw new Error('shop-price case did not observe its stock potion');
    const type = game.objects[object.otyp];
    if (type.oc_buy_minseen !== 7 || type.oc_buy_maxseen !== 7)
        throw new Error('shop-price case did not record its 7-zorkmid quote');
    if (game.nhDisplay.inputQueueLength !== 0)
        throw new Error('shop-price case left unread input');
    return replay;
}

export async function runShopFloorPricingMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'shop floor pricing',
            recipe: loadShopFloorPricingRecipe(),
        }],
        summaryLabel: 'SHOP FLOOR PRICING',
        verifySegment: verifyShopFloorPricingSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runShopFloorPricingMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`shop floor pricing: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
