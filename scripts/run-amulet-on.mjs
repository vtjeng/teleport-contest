#!/usr/bin/env node
// Independent C-first witnesses for do_wear.c:Amulet_on. Inputs were frozen
// after confirming C inventory letters, gas-entry paging and call-name input.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLYING, SLEEPY, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    ['amulet-change-female', 'You are suddenly very masculine!'],
    ['amulet-change-male', 'You are suddenly very feminine!'],
    ['amulet-held-guarding', 'amulet of guarding (being worn)'],
    ['amulet-restful-sleep', 'oval amulet (being worn)'],
    ['amulet-flying', 'You are now in flight.'],
    ['amulet-breathing-gas', 'You are no longer bothered by the poison gas.'],
    ['amulet-change-unchanging', "You don't feel like yourself."],
];
const witnesses = CASES.map(([label, message]) => ({
    label,
    message,
    recipe: JSON.parse(readFileSync(new URL(
        `../recipes/do_wear.c/${label}.session.json`, import.meta.url))),
}));

export async function runAmuletOnMatrix() {
    return runFreshMatrix({
        entries: witnesses,
        chunkLimit: 1,
        summaryLabel: 'AMULET ON',
        verifySegment: async (segment) => {
            let boundary;
            const replay = await runSegment(segment, {
                onBoundary: (error) => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            const witness = witnesses.find(({ recipe }) =>
                recipe.segments.some((input) => input.seed === segment.seed
                    && input.moves === segment.moves));
            assert.ok(replay.getScreens().some((screen) =>
                screen.includes(witness.message)),
            'the production put-on caller must reach the intended C arm');
            if (witness.label.startsWith('amulet-change-')) {
                assert.equal(game.uamul, null,
                    'useup removes the consumed change amulet from its slot');
            } else {
                assert.ok(game.uamul, 'the ordinary amulet remains worn');
            }
            if (witness.label === 'amulet-held-guarding')
                assert.equal(game.uwep, null, 'remove_worn_item clears W_WEP');
            if (witness.label === 'amulet-flying')
                assert.ok(game.u.uprops[FLYING].extrinsic);
            if (witness.label === 'amulet-restful-sleep')
                assert.ok(game.u.uprops[SLEEPY].intrinsic & TIMEOUT);
        },
    });
}
runMatrixCli(import.meta.url, runAmuletOnMatrix, 'amulet on');
