import assert from 'node:assert/strict';
import test from 'node:test';

import { ROOM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { PM_WIZARD_OF_YENDOR } from '../js/monsters.js';
import { resurrect } from '../js/wizard.js';
import { vision_recalc, vision_reset } from '../js/vision.js';

async function setup() {
    await runSegment({
        seed: 16028,
        datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:WizardReturn,role:Wizard,race:human,'
            + 'gender:female,align:neutral,pettype:none,!legacy,!tutorial,'
            + '!splash_screen\n',
        moves: '',
    });
    game.level = new GameMap();
    for (let x = 2; x < 12; ++x) for (let y = 2; y < 12; ++y)
        Object.assign(game.level.at(x, y), {
            typ: ROOM, lit: true, seenv: 255,
        });
    game.u.ux = 6;
    game.u.uy = 6;
    game.context.no_of_wizards = 0;
    game.in_mklev = false;
    vision_reset(game);
    vision_recalc(0);
}

test('resurrect uses the complete runtime Wizard constructor on a live level', async () => {
    await setup();
    const messages = [];
    // C wizard.c:715-728 calls makemon(Wizard, hero.x, hero.y, MM_NOWAIT).
    // It cannot borrow initial-level construction after the level is live.
    const monster = await resurrect(game, {
        makemon: makemon_runtime,
        message: async text => messages.push(text),
        norepMessage: async text => messages.push(text),
    });
    assert.equal(monster?.data, game.mons[PM_WIZARD_OF_YENDOR]);
    assert.equal(monster.iswiz, true);
    assert.equal(monster.mrevived, true);
    assert.equal(monster.mgenmklev, false);
    assert.equal(game.in_mklev, false);
    assert.equal(game.context.no_of_wizards, 1);
    assert.ok(Math.abs(monster.mx - game.u.ux) <= 1);
    assert.ok(Math.abs(monster.my - game.u.uy) <= 1);
    assert.ok(messages.some(text => text.includes('A voice booms out...')));
});

test('resurrect returns null when no adjacent placement is possible', async () => {
    await setup();
    for (let x = 2; x < 12; ++x) for (let y = 2; y < 12; ++y) {
        if (x === game.u.ux && y === game.u.uy) continue;
        game.level.at(x, y).typ = 0;
    }
    const monster = await resurrect(game, {
        makemon: makemon_runtime,
        message: async () => {},
        norepMessage: async () => {},
    });
    assert.equal(monster, null);
    assert.equal(game.context.no_of_wizards, 0);
    assert.equal(game.in_mklev, false);
});
