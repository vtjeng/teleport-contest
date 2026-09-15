#!/usr/bin/env node

// Run the fresh C differential for dig.c watchman_canseeu()/watch_dig(). The
// setup uses a new debug-Wizard route and a wand of digging; the resulting
// recording must reach the watch_dig() call before any terrain mutation.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = {
    version: 5,
    segments: [{
        seed: 9020117,
        datetime: '20270216112233',
        nethackrc: [
            'OPTIONS=name:WatchProbe,role:Wizard,race:human,gender:male,'
            + 'align:neutral,playmode:debug',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,'
            + '!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: '\x17wand of digging\nzol',
    }],
};

export function loadDigWatchDigRecipe() {
    return validateCleanRecipe(RECIPE);
}

export async function runDigWatchDigMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'dig watch_dig',
            recipe: loadDigWatchDigRecipe(),
        }],
        chunkLimit: 1,
        summaryLabel: 'DIG WATCH_DIG',
    });
}

runMatrixCli(import.meta.url, runDigWatchDigMatrix, 'dig watch_dig');
