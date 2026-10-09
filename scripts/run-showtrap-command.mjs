#!/usr/bin/env node
// pager.c doidtrap and detect.c trapped glyph predicates: independently
// recorded direct/typed/canned commands, a cheap web variation, and blind
// chest/door farlook with both Hallucination gate outcomes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLINDED, HALLUC } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    ['pit', 'pager', 'That is a pit.'],
    ['web', 'pager', 'That is a web.'],
    ['door', 'detect', 'That is a trapped door.'],
    ['chest', 'detect', 'That is a trapped chest.'],
];

export async function runShowtrapMatrix() {
    const entries = CASES.map(([label, owner]) => ({
        label,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/${owner}.c/showtrap-${label}-independent.session.json`,
            import.meta.url,
        ))),
    }));
    return runFreshMatrix({
        entries,
        verifySegment: async segment => {
            let boundary;
            const output = await runSegment(segment, {
                onBoundary: error => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            const index = entries.findIndex(entry => entry.recipe.segments[0] === segment);
            const [label, , description] = CASES[index];
            assert.ok(output.getScreens().some(screen => screen.includes(description)));
            if (label === 'door' || label === 'chest') {
                // Blind memory retains the special trap glyph while timed
                // Hallucination changes only the guarded predicate result.
                assert.ok(game.u.uprops[BLINDED].intrinsic);
                assert.ok(game.u.uprops[HALLUC].intrinsic);
                assert.ok(output.getScreens().some(screen => screen.includes(`a trap (trapped ${label})`)));
            }
        },
        summaryLabel: 'SHOWTRAP', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runShowtrapMatrix, 'showtrap commands');
