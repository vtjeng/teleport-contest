import assert from 'node:assert/strict';
import test from 'node:test';

import { LAVAWALL } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { zap_over_floor } from '../js/zap.js';

// zap.c:5245-5253: an unseen cold bolt makes a soft crackling sound when
// lava briefly freezes. You_hear handles the acoustics option.
test('unseen brief lava freeze respects acoustics', async () => {
    for (const acoustics of [true, false]) {
        await runSegment({
            seed: 93171023,
            datetime: '20781112121000',
            nethackrc: 'OPTIONS=name:ColdSound,role:Wizard,race:human,gender:female,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
            moves: '',
        });
        game.flags.acoustics = acoustics;
        const x = game.u.ux < 70 ? game.u.ux + 2 : game.u.ux - 2;
        const y = game.u.uy;
        game.level.at(x, y).typ = LAVAWALL;
        game.viz_array[y][x] = 0;
        const messages = [];
        const rangemod = await zap_over_floor(
            x, y, 2, { value: false }, true, 0,
            game, { rn2: () => 1, rnd: () => 1 },
            { message: async (line) => messages.push(line) },
        );
        assert.equal(rangemod, -1000);
        assert.deepEqual(messages, acoustics ? ['You hear a soft crackling.'] : []);
    }
});
