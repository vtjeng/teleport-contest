import assert from 'node:assert/strict';
import test from 'node:test';

import { rhack, resetCommandVars } from '../js/cmd.js';
import { ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GRID_BUG } from '../js/monsters.js';

const input = {
    seed: 39261011,
    datetime: '20431009123456',
    nethackrc: 'OPTIONS=name:GridAudit,role:Wizard,race:human,'
        + 'gender:female,align:neutral,playmode:debug\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
};

async function preparedHero(gridBug) {
    await runSegment({
        ...input,
        moves: gridBug ? '#polyself\ngrid bug\n  ' : ' ',
    });
    if (gridBug) assert.equal(game.u.umonnum, PM_GRID_BUG);
    const { ux, uy } = game.u;
    for (const [x, y] of [[ux, uy], [ux - 1, uy], [ux - 1, uy - 1]]) {
        const spot = game.level.at(x, y);
        spot.typ = ROOM;
        spot.flags = spot.doormask = 0;
        game.level.monsters[x][y] = null;
        game.level.objects[x][y] = null;
    }
    game.level.monlist = null;
    game.level.traps = [];
    game.level.regions = [];
    // Polymorph leaves the Wizard overburdened. Empty inventory lets this
    // command test reach movement admission, without changing the form.
    game.invent = null;
    game.u.uwep = null;
    resetCommandVars(game);
    game.context.move = 0;
    return [ux, uy];
}

async function command(key) {
    game.nhDisplay.pushKey(key.charCodeAt(0));
    await rhack(0, game);
}

test('grid bug diagonal command is refused before movement', async () => {
    // C cmd.c:3779-3783 runs dxdy_moveok() before domove(); cmd.c:3900-3908
    // zeros both components and prints the refusal without spending a turn.
    const before = await preparedHero(true);
    const turn = game.moves;
    await command('y');
    assert.deepEqual([game.u.ux, game.u.uy], before);
    assert.deepEqual([game.u.dx, game.u.dy], [0, 0]);
    assert.equal(game.moves, turn);
    assert.equal(game.nhDisplay.topMessage,
        "You can't get there from here...");
});

test('grid bug cardinal command and human diagonal command remain admitted',
    async () => {
        let [x, y] = await preparedHero(true);
        await command('h');
        assert.deepEqual([game.u.ux, game.u.uy], [x - 1, y]);

        [x, y] = await preparedHero(false);
        await command('y');
        assert.deepEqual([game.u.ux, game.u.uy], [x - 1, y - 1]);
    });
