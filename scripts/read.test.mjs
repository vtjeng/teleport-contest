import assert from 'node:assert/strict';
import test from 'node:test';

import { ECMD_TIME } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { seffects } from '../js/read.js';
import { spelleffects } from '../js/spell.js';
import { SCR_TAMING, SCROLL_CLASS, SPE_CHARM_MONSTER } from '../js/objects.js';

async function emptyTamingWorld(seed) {
    await runSegment({
        seed,
        datetime: '20310908070605',
        nethackrc: [
            'OPTIONS=name:Tamer,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '.',
    });

    // read.c:seffect_taming() scans the adjacent square ring, plus the steed
    // fallback under the hero. Empty it so this test pins its no-target arm.
    const grid = game.level.monsters;
    for (let x = 0; x < grid.length; ++x)
        for (let y = 0; y < grid[x].length; ++y)
            grid[x][y] = null;
    game.u.uswallow = 0;
    game.u.ustuck = null;
    game.u.usteed = null;
    game.gk = {};
    game._pending_message = '';
}

test('read.c seffect_taming handles an empty nearby-monster scan', async () => {
    await emptyTamingWorld(8080051);
    await seffects({
        otyp: SCR_TAMING,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed: false,
        quan: 1,
    }, game);

    assert.equal(game._pending_message, 'Nothing interesting happens.');
    assert.equal(game.gk.known, undefined);
});

test('spell.c charm monster dispatches through read.c seffects', async () => {
    await emptyTamingWorld(8080052);
    const result = await spelleffects(
        SPE_CHARM_MONSTER,
        false,
        true,
        game,
    );

    assert.equal(result, ECMD_TIME);
    assert.equal(game._pending_message, 'Nothing interesting happens.');
});
