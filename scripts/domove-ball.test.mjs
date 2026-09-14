import assert from 'node:assert/strict';
import test from 'node:test';

import { ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { domove } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { remove_object, place_object } from '../js/obj.js';
import { SCROLL_CLASS, SCR_PUNISHMENT } from '../js/objects.js';
import { punish } from '../js/read.js';

const FIXTURE = {
    seed: 9945001,
    datetime: '20310908070605',
    nethackrc: [
        'OPTIONS=name:BallFix,role:Wizard,race:human,gender:male,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,playmode:debug',
        '',
    ].join('\n'),
    // The wait starts a fresh D:1 game. The punishment objects are then
    // created by read.c punish() below, so this fixture has no holdout-level
    // teleport and cannot enter mk_knox_portal()'s unsupported placement arm.
    moves: '.',
};

async function punishedMovementFixture() {
    await runSegment(FIXTURE);
    const x = game.u.ux;
    const y = game.u.uy;

    // Use the source read.c punish() constructor, then arrange its objects in
    // a five-square room strip. This keeps the test focused on hack.c's
    // drag_ball()/move_bc() order while making every terrain decision fixed.
    await punish({
        otyp: SCR_PUNISHMENT,
        oclass: SCROLL_CLASS,
        cursed: false,
        blessed: false,
    }, game);
    for (const object of [game.uball, game.uchain])
        remove_object(object, { state: game });
    for (let column = x - 3; column <= x + 1; ++column) {
        const location = game.level.at(column, y);
        location.typ = ROOM;
        location.roomno = 0;
        location.doormask = 0;
        location.flags = 0;
        location.seenv = 0;
        game.level.monsters[column][y] = null;
    }
    place_object(game.uball, x - 3, y, { state: game });
    place_object(game.uchain, x - 2, y, { state: game });
    return { x, y };
}

async function stepEast() {
    game.u.dx = 1;
    game.u.dy = 0;
    game.u.umoved = false;
    game.context.run = 0;
    game.context.move = 1;
    game.domoveAttempting = 1;
    await domove(game);
}

test('domove_core moves the chain before drawing the hero', async () => {
    // hack.c:2860-2864 calls drag_ball() before the tentative hero move, and
    // hack.c:2976-2987 calls move_bc() before spoteffects(). The independent
    // D:1 fixture starts with ball, chain, hero at x-3, x-2, x; an east step
    // must leave them at x-2, x, x+1 after the two movement calls.
    const { x, y } = await punishedMovementFixture();
    await stepEast();

    assert.deepEqual(
        [game.uball.ox, game.uball.oy],
        [x - 2, y],
    );
    assert.deepEqual(
        [game.uchain.ox, game.uchain.oy],
        [x, y],
    );
    assert.deepEqual([game.u.ux, game.u.uy], [x + 1, y]);
    assert.equal(
        [x - 2, x - 1, x, x + 1]
            .map((column) => game.level.at(column, y).disp_ch)
            .join(''),
        '0._@',
    );
});
