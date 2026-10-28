import assert from 'node:assert/strict';
import test from 'node:test';

import { moveloop_core } from '../js/allmain.js';
import { ROOM, TRAPDOOR, LEVITATION, W_ARMF } from '../js/const.js';
import { armoroff, Boots_off, Boots_on } from '../js/do_wear.js';
import { game } from '../js/gstate.js';
import { addinv } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import { LEVITATION_BOOTS } from '../js/objects.js';
import { teleds } from '../js/teleport.js';
import { maketrap } from '../js/trap.js';
import { setworn } from '../js/worn.js';

async function doffOnFloor(withTrap) {
    await runSegment({
        seed: 901799,
        datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:DoffProbe,role:Wizard,race:human,'
            + 'gender:female,align:neutral,pettype:none,!legacy,!tutorial,'
            + '!splash_screen,!autopickup\n',
        moves: '',
    });
    game.nhDisplay.onEmptyQueue = () => 32;
    const boots = mksobj(LEVITATION_BOOTS, false, false, { state: game });
    await addinv(boots, { state: game });
    await setworn(boots, W_ARMF, { state: game });
    await Boots_on(game);
    assert.equal(game.uarmf, boots);
    assert.ok(game.u.uprops[LEVITATION].extrinsic & W_ARMF);

    let floor = null;
    for (let dx = -5; dx <= 5 && !floor; dx++) {
        for (let dy = -5; dy <= 5; dy++) {
            const x = game.u.ux + dx;
            const y = game.u.uy + dy;
            if (game.level.at(x, y)?.typ === ROOM) {
                floor = { x, y };
                break;
            }
        }
    }
    assert.ok(floor, 'initialized level has reachable room floor');
    await teleds(floor.x, floor.y, 0, game);
    if (withTrap)
        assert.equal(maketrap(floor.x, floor.y, TRAPDOOR,
            { state: game })?.ttyp, TRAPDOOR);
    await armoroff(boots, game);
    assert.equal(game.multi, -2);
    assert.equal(game.afternmv, Boots_off);
    const initialLevel = game.u.uz.dlevel;
    for (let turn = 0; turn < 2; turn++) {
        game.context.move = 1;
        game.u.umovement = 12;
        await moveloop_core();
    }
    return { initialLevel, finalLevel: game.u.uz.dlevel };
}

test('delayed levitation-boot removal follows a trapdoor through deferred_goto',
    async () => {
        // C allmain.c:383-386 runs unmul(), then deferred_goto() if the
        // Boots_off()->float_down()->dotrap() callback scheduled a level.
        const result = await doffOnFloor(true);
        assert.equal(result.finalLevel, result.initialLevel + 1);
    });

test('delayed levitation-boot removal on dry floor stays on this level',
    async () => {
        const result = await doffOnFloor(false);
        assert.equal(result.finalLevel, result.initialLevel);
    });
