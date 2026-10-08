#!/usr/bin/env node
// C-first potion.c:peffect_levitation witnesses. Seeds 84815111–84815116
// were selected before recording, without searching for JS-compatible output.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { I_SPECIAL, LEVITATION, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['cursed-upstairs', 'cursed-ceiling', 'blessed', 'uncursed', 'spell', 'sink'];
const witnesses = names.map(name => ({ label: `levitation-${name}`, name,
    recipe: JSON.parse(readFileSync(new URL(
        `../recipes/potion.c/levitation-${name}.session.json`, import.meta.url))),
}));
export async function runLevitationEffectsMatrix() {
    return runFreshMatrix({ entries: witnesses, chunkLimit: 1,
        summaryLabel: 'LEVITATION EFFECTS',
        verifySegment: async segment => {
            let boundary;
            const replay = await runSegment(segment, {
                onBoundary: error => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            const witness = witnesses.find(({ recipe }) =>
                recipe.segments[0].seed === segment.seed);
            const screens = replay.getScreens();
            assert.ok(screens.some(screen => screen.includes('You start to float in the air!')));
            const intrinsic = game.u.uprops[LEVITATION].intrinsic;
            if (witness.name === 'cursed-upstairs') {
                assert.ok(screens.some(screen => screen.includes('Still climb?')),
                    'potion.c calls the production doup query');
                assert.equal(game.u.uz.dlevel, 1, 'the escape query is declined');
                assert.equal(game.unported.has('do.c doup'), false);
            }
            if (witness.name === 'cursed-ceiling')
                assert.ok(screens.some(screen => screen.includes('You hit your head on the ceiling.')));
            if (witness.name === 'sink')
                assert.ok(screens.some(screen => screen.includes('You crash to the floor!')),
                    'the shared tail reaches hack.c:spoteffects/dosinkfall');
            if (witness.name.startsWith('cursed') || witness.name === 'sink')
                assert.equal(intrinsic & (TIMEOUT | I_SPECIAL), 0,
                    'cursed one-turn rise expires after the quaff');
            else {
                assert.ok(intrinsic & TIMEOUT, 'the potion or spell extends the timeout');
                assert.equal(Boolean(intrinsic & I_SPECIAL), witness.name === 'blessed',
                    'only the blessed potion gives control at basic spell skill');
            }
        },
    });
}
runMatrixCli(import.meta.url, runLevitationEffectsMatrix, 'levitation effects');
