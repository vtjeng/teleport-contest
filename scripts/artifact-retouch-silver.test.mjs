import assert from 'node:assert/strict';
import test from 'node:test';

import { retouch_equipment } from '../js/artifacts.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_WEREWOLF } from '../js/monsters.js';
import { SILVER_DAGGER } from '../js/objects.js';

test('retouch_equipment completes exercise after silver burns a lycanthrope',
    async () => {
    await runSegment({
        seed: 202610206,
        datetime: '20310415120000',
        nethackrc: 'OPTIONS=name:SilverRetouch,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,playmode:debug,pettype:none',
        moves: '.\x17silver dagger\nwk',
    });
    assert.equal(game.uwep?.otyp, SILVER_DAGGER);
    const dagger = game.uwep;
    game.u.ulycn = PM_WEREWOLF;
    game.u.uhp = game.u.uhpmax = 100;
    game.nhDisplay.terminal._inputQueue.push(...Array(12).fill(32));

    await retouch_equipment(2, game);

    assert.ok(game.u.uhp < 100);
    assert.equal(game.uwep, null);
    assert.equal(dagger.owornmask, 0);
});
