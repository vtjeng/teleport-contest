#!/usr/bin/env node

// Record and replay read.c's ordinary, uncursed teleportation-scroll path.
// The Monk's naturally generated starting scroll is read without wizard-mode
// setup, then the recipe stops after the materialization message.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const READ = 'r';
const SCROLL_LETTER = 'c';
export const READ_MORE = ' ';

export function loadReadTeleportRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent normal-mode seed gives the starting Monk an
            // uncursed, known teleportation scroll in inventory slot c.
            seed: 260051,
            datetime: '20390516110703',
            nethackrc: [
                'OPTIONS=name:TeleportRead,role:Monk,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!autopickup,!debug_mongen,symset:DECgraphics',
                '',
            ].join('\n'),
            // The space dismisses the disappearance line and the second
            // source-ordered message is the materialization result. The
            // recipe stops before a following travel command.
            moves: `${READ}${SCROLL_LETTER}${READ_MORE}`,
        }],
    }, 'ordinary teleport-scroll reading recipe');
}

export async function runReadTeleportMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'ordinary uncursed teleportation-scroll reading',
            recipe: loadReadTeleportRecipe(),
        }],
        summaryLabel: 'READ TELEPORT SCROLL',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runReadTeleportMatrix, 'read teleport scroll');
