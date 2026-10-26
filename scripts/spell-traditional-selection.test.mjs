import assert from 'node:assert/strict';
import test from 'node:test';

import { runSegment } from '../js/jsmain.js';

const nethackrc = [
    'OPTIONS=name:SpellMenuAudit,role:Priest,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,!autopickup,menustyle:traditional',
    '',
].join('\n');

async function screensFor(moves) {
    const replay = await runSegment({
        seed: 802700,
        datetime: '20320405060708',
        nethackrc,
        moves,
    });
    return replay.getScreens().map((screen) => screen.split('\n')[0]);
}

test('traditional casting accepts a letter without opening the spell menu', async () => {
    const screens = await screensFor('.Za    ');
    assert.equal(screens[2], 'Cast which spell? [a-b *?]');
    assert.equal(screens[3], 'In what direction?');
    assert.equal(screens[4], 'The magical energy is released!  You feel better.');
});

test('traditional casting reprompts after an invalid letter', async () => {
    const screens = await screensFor('.Zz a   ');
    assert.equal(screens[3], "You don't know that spell.--More--");
    assert.equal(screens[4], 'Cast which spell? [a-b *?]');
    assert.equal(screens[5], 'In what direction?');
});

test('traditional casting preserves cancellation and explicit menu fallback', async () => {
    const cancelled = await screensFor('.Z\x1b   ');
    assert.equal(cancelled[3], 'Never mind.');

    const fallback = await screensFor('.Z?a    ');
    assert.equal(fallback[2], 'Cast which spell? [a-b *?]');
    assert.match(fallback[3], /Choose which spell to cast/u);
    assert.equal(fallback[4], 'In what direction?');
});
