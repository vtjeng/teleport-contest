#!/usr/bin/env node

// Record and replay read.c's one-worn-flammable-armor destroy-arm branch.
// Valkyrie's starting shield is removed first, so the wished leather armor is
// the only worn armor when the scroll effect selects its victim.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const WIZWISH = '\x17'; // cmd.c's C('w') binding for wiz_wish().
const WAIT = '.';
const TAKEOFF = 'T';
const WEAR = 'W';
const READ = 'r';
const ARMOR_SLOT = 'e'; // Valkyrie's wished armor follows four starting items.
const SCROLL_SLOT = 'f'; // The wished scroll follows the wished armor.
const MORE = ' ';

function wish(objectName) {
    return `${WIZWISH}${objectName}\n`;
}

export function loadReadDestroyArmorRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Fresh seed/date and a fixed character keep this case independent
            // of the development witness while preserving its C preconditions.
            seed: 9048171,
            datetime: '20310203040506',
            nethackrc: [
                'OPTIONS=name:ReadBurn,role:Valkyrie,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=playmode:debug,pettype:none,!autopickup,!acoustics',
                '',
            ].join('\n'),
            // Take off the starting shield, wish and wear one leather suit,
            // then wish and read the unknown-label destroy armor scroll. The
            // space dismisses the pending first smoulder line so the second
            // source-ordered hit can print before the independent wait.
            moves: `${WAIT}${TAKEOFF}${wish('leather armor')}`
                + `${WEAR}${ARMOR_SLOT}${wish('scroll of destroy armor')}`
                + `${READ}${SCROLL_SLOT}${MORE}${WAIT}`,
        }],
    }, 'read destroy-armor recipe');
}

export async function runReadDestroyArmorMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'one worn flammable armor destroy-armor read',
            recipe: loadReadDestroyArmorRecipe(),
        }],
        summaryLabel: 'READ DESTROY ARMOR',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runReadDestroyArmorMatrix, 'read destroy armor');
