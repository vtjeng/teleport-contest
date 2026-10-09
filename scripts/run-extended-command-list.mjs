#!/usr/bin/env node
// Independent runtime evidence for cmd.c doextlist and its typed, help-menu,
// and counted rebound entry points. Each recipe was inspected in C first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';

const CASES = ['wizard', 'help', 'bound-discover'];
export async function runExtendedCommandListMatrix() {
    const entries = CASES.map(label => ({ label,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/cmd.c/extended-list-${label}-independent.session.json`, import.meta.url))),
    }));
    return runFreshMatrix({ entries, chunkLimit: 1,
        summaryLabel: 'EXTENDED COMMAND LIST',
        verifySegment: async segment => {
            let boundary;
            const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
            assert.equal(boundary, undefined);
            const index = entries.findIndex(entry => entry.recipe.segments[0] === segment);
            const label = CASES[index];
            const screens = replay.getScreens();
            assert(screens.some(screen => screen.includes('Extended Commands List')));
            assert.equal(game.context.pendingCommand, undefined);
            assert.equal(game.multi, 0);
            if (label === 'wizard') {
                assert(screens.some(screen => screen.includes('Switch back from search ("WIZ*kill")')));
                assert(screens.some(screen => screen.includes('Switch to showing debugging commands in separate section')));
                assert(screens.some(screen => screen.includes("including commands that don't autocomplete")));
            } else if (label === 'help') {
                assert(screens.some(screen => screen.includes('Switch back from search ("SPELL")')));
                assert(screens.some(screen => screen.includes('Extended command list search phrase?')));
            } else assert(game.discover);
            // The list and its controls take no time: these recipes have two
            // explicit waits; compare with those alone on the same fresh state.
            const baseline = await runSegment({ ...segment, moves: label === 'bound-discover' ? ' ..' : '..' });
            assert.equal(game.moves, 3);
            assert.deepEqual(replay.getRngLog(), baseline.getRngLog());
        },
    });
}
runMatrixCli(import.meta.url, runExtendedCommandListMatrix, 'extended-command list');
