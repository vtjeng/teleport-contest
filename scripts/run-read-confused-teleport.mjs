#!/usr/bin/env node

// Record and replay read.c's confused, blessed teleportation-scroll reading
// through the second reading message. The recipe stops while that message is
// waiting for dismissal, immediately before seffects() advances to
// teleport.c level_tele().

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// This fixed clock has no NetHack calendar event, so the recipe varies only
// the commands and object effects under test.
const DATETIME = '20370809101112';
const WIZWISH = '\x17'; // cmd.c's C('w') binding for wiz_wish().
const WAIT = '.';
const QUAFF = 'q';
const READ = 'r';
const WISHED_SLOT = 'o';
export const READ_MORE = ' ';

function wish(objectName) {
    return `${WIZWISH}${objectName}\n`;
}

export function confusedTeleportSetupMoves() {
    // The cursed potion guarantees the ordinary confusion feedback. Drinking
    // it frees slot o, so the following single-scroll wish reuses that slot.
    return `${WAIT}${wish('cursed potion of confusion')}`
        + `${QUAFF}${WISHED_SLOT}`
        + wish('blessed scroll of teleportation');
}

export function loadReadConfusedTeleportRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Seed 9048123 is newly chosen for this constructed wizard-mode
            // case. Disabling debug monster generation keeps the messages
            // between the two wishes attributable to the hero's commands.
            seed: 9048123,
            datetime: DATETIME,
            nethackrc: [
                'OPTIONS=name:ConfRead,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=playmode:debug,pettype:none,!autopickup,!debug_mongen',
                '',
            ].join('\n'),
            // Space dismisses the disappearance line. The recipe then stops
            // on the confused-mispronunciation line, before its dismissal can
            // let level_tele() open the destination prompt.
            moves: confusedTeleportSetupMoves()
                + `${READ}${WISHED_SLOT}${READ_MORE}`,
        }],
    }, 'confused teleport-scroll reading recipe');
}

export async function runReadConfusedTeleportMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'confused blessed teleport-scroll reading',
            recipe: loadReadConfusedTeleportRecipe(),
        }],
        summaryLabel: 'READ CONFUSED TELEPORT',
        // A debug game leaves a save in the recorder installation.
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runReadConfusedTeleportMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `read confused teleport: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
