// dothrow.c hurtle() (1078-1126) prints "You feel a tug from the iron
// ball.", "You are anchored by the ...", or the hurtle line before moving
// the hero.
import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_FLOOR } from '../js/const.js';
import { hurtle } from '../js/dothrow.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

// Independent fixture values for an ordinary in-moveloop hero.
const SEED = 5530912;
const DATETIME = '20380611093000';
const NETHACKRC = [
    'OPTIONS=name:Tugged,role:Priest,race:elf,gender:female,align:chaotic',
    'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none,!autopickup',
    '',
].join('\n');

async function punishedHero() {
    await runSegment({ seed: SEED, datetime: DATETIME, nethackrc: NETHACKRC, moves: '' });
    // Punished() is uball != 0; a ball left on the floor takes hurtle()'s
    // first arm.
    game.uball = { where: OBJ_FLOOR, ox: game.u.ux, oy: game.u.uy };
    // Retire the welcome line so a new message needs no --More--.
    clearTtyMessageWindow(game);
    return game;
}

test('the live knockback of a punished hero feels the tug', async () => {
    const state = await punishedHero();
    // dx = 1, dy = 0 and range 2 are any knockback; the ball stops it first.
    await hurtle(1, 0, 2, false, state);
    assert.equal(state.nhDisplay.topMessage,
        'You feel a tug from the iron ball.');
});
