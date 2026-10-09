#!/usr/bin/env node
// Independent C-first source witnesses for spell.c preflight/backfire. Seeds
// were chosen before observing C; ordinary amnesia scrolls forget retained slots.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';

const CASES = ['amulet-wizard', 'amulet-healer', 'forgotten-wizard', 'forgotten-variation', 'turn'];
export async function runAmuletCastingMatrix() {
    const entries = CASES.map(label => ({ label,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/spell.c/preflight-${label}-independent.session.json`, import.meta.url))),
    }));
    return runFreshMatrix({ entries, chunkLimit: 1, summaryLabel: 'SPELL PREFLIGHT',
        verifySegment: async segment => {
            let boundary;
            const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
            assert.equal(boundary, undefined);
            const label = entries.find(entry => entry.recipe.segments[0] === segment).label;
            const screens = replay.getScreens();
            if (label.startsWith('amulet')) {
                assert.equal(Boolean(game.u.uhave.amulet), true);
                assert(screens.some(screen => screen.includes('the amulet draining your energy away.')));
                if (label === 'amulet-healer')
                    assert(screens.some(screen => screen.includes("don't have enough energy to cast")));
            } else if (label === 'turn') {
                assert(screens.some(screen => screen.includes('turn undead')));
                assert(screens.some(screen => screen.includes("don't have enough energy to cast that spell yet.")));
            } else {
                assert.equal(game.svs.spl_book[0].sp_know, 0);
                assert(screens.some(screen => screen.includes('Your knowledge of this spell is twisted.')));
                assert(screens.some(screen => screen.includes('It invokes nightmarish images in your mind...')));
            }
        },
    });
}
runMatrixCli(import.meta.url, runAmuletCastingMatrix, 'spell preflight');
