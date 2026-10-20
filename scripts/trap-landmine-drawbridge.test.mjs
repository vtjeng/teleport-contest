import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DB_NORTH, DOOR, DRAWBRIDGE_DOWN, LANDMINE, MOAT, OROOM,
} from '../js/const.js';
import { create_drawbridge } from '../js/dbridge.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { maketrap } from '../js/trap.js';
import { blow_up_landmine } from '../js/trap_effects.js';

const C_TRAP = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);

test('a landmine destroys a lowered drawbridge at its blast square', async () => {
    assert.match(C_TRAP,
        /blow_up_landmine\(struct trap \*trap\)[\s\S]*?scatter\(x, y, 4,[\s\S]*?find_drawbridge\(&dbx, &dby\)[\s\S]*?destroy_drawbridge\(dbx, dby\)/u);
    await runSegment({
        seed: 672405,
        datetime: '20351019120000',
        nethackrc: 'OPTIONS=name:BridgeMine,role:Wizard,race:human,'
            + 'gender:male,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!autopickup',
        moves: '',
    });
    let target = null;
    for (const room of game.level.rooms) {
        if (room?.rtype !== OROOM) continue;
        const x = room.lx + 1;
        const y = room.ly;
        if (x === game.u.ux && y === game.u.uy) continue;
        if (create_drawbridge(x, y, DB_NORTH, true, game)) {
            target = { x, y };
            break;
        }
    }
    assert.ok(target);
    const bridge = game.level.at(target.x, target.y);
    const wall = game.level.at(target.x, target.y - 1);
    const trap = maketrap(target.x, target.y, LANDMINE, { state: game });
    assert.equal(bridge.typ, DRAWBRIDGE_DOWN);
    assert.equal(trap.ttyp, LANDMINE);
    game.nhDisplay.onEmptyQueue = () => 32;

    await blow_up_landmine(trap, { state: game });
    assert.equal(bridge.typ, MOAT);
    assert.equal(wall.typ, DOOR);
    assert.ok(!game.unported.has('dbridge.c destroy_drawbridge'));
});
