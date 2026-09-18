import assert from 'node:assert/strict';
import test from 'node:test';

import { GameDisplay } from '../js/game_display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadWhatisMapHeroRecipe } from './run-whatis-map-getpos-hero.mjs';

const QUICK_CASES = [
    {
        seed: 9310601,
        datetime: '20370106081234',
        name: 'BlindGlance',
        role: 'Wizard',
        race: 'human',
        gender: 'female',
        align: 'neutral',
    },
    {
        seed: 9310602,
        datetime: '20380207102345',
        name: 'BlindGlanceVar',
        role: 'Wizard',
        race: 'elf',
        gender: 'male',
        align: 'chaotic',
    },
];

function quickRecipe(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: [
            `OPTIONS=name:${entry.name},role:${entry.role},race:${entry.race},gender:${entry.gender},align:${entry.align}`,
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,blind',
        ].join('\n') + '\n',
        // The two spaces acknowledge the quick-look prompt and first-use
        // cursor tip; dot selects the blind hero square.
        moves: ';  .',
    };
}

async function runWithMoreTrace(segment) {
    const events = [];
    const originalPutstr = GameDisplay.prototype.putstr;
    GameDisplay.prototype.putstr = function tracePutstr(col, row, text, ...rest) {
        if (String(text).includes('--More--')) {
            events.push({
                text: String(text),
                stack: new Error().stack?.split('\n').slice(2, 8) ?? [],
            });
        }
        return originalPutstr.call(this, col, row, text, ...rest);
    };
    try {
        const replay = await runSegment(segment);
        return { events, replay };
    } finally {
        GameDisplay.prototype.putstr = originalPutstr;
    }
}

test('quick selected-location lookup skips checkfile and its More prompt',
    async () => {
        for (const entry of QUICK_CASES) {
            const { events, replay } = await runWithMoreTrace(quickRecipe(entry));
            const finalScreen = replay.getScreens().at(-1);
            assert.equal(finalScreen.includes('--More--'), false, entry.name);
            assert.equal(
                events.some(({ stack }) => stack.some((line) => line.includes('checkfile'))),
                false,
                entry.name,
            );
            assert.equal(game._ttyToplines.includes(entry.name), true);
        }
    });

test('ordinary selected-location lookup still enters checkfile', async () => {
    const segment = loadWhatisMapHeroRecipe().segments[0];
    const { events } = await runWithMoreTrace(segment);
    assert.equal(
        events.some(({ stack }) => stack.some((line) => line.includes('checkfile'))),
        true,
    );
});
