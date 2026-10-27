import assert from 'node:assert/strict';
import test from 'node:test';

import { PIT, ROOM, TT_PIT } from '../js/const.js';
import { zap_dig } from '../js/dig.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { conjoined_pits, deltrap, maketrap, set_utrap } from '../js/trap.js';

async function setup() {
    await runSegment({ seed: 2026102719, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:PitLink,role:Wizard,race:human,gender:female,'
            + 'align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '' });
    const { u } = game;
    u.ux = 10; u.uy = 10;
    u.dx = 1; u.dy = 0; u.dz = 0;
    for (let x = 9; x <= 12; x++) for (let y = 9; y <= 11; y++)
        game.level.at(x, y).typ = ROOM;
    const first = await maketrap(10, 10, PIT, { state: game });
    const second = await maketrap(11, 10, PIT, { state: game });
    assert.ok(first && second);
    set_utrap(5, TT_PIT, game);
    return { first, second };
}

test('target: removing a normally joined pit clears its neighbor link', async () => {
    const { first, second } = await setup();
    await zap_dig(game, { rn1: () => 8 });
    assert.equal(conjoined_pits(second, first, false, game), true,
        'a digging beam joins the adjacent existing pit');
    deltrap(first, game);
    assert.equal(second.conjoined, 0);
    assert.deepEqual(game.level.traps.includes(first), false);
});

test('control: removing an ordinary unjoined pit leaves its neighbor', async () => {
    const { first, second } = await setup();
    assert.equal(conjoined_pits(second, first, false, game), false);
    deltrap(first, game);
    assert.equal(second.conjoined, 0);
    assert.equal(game.level.traps.includes(second), true);
});
