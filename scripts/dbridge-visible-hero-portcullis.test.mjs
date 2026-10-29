// C dbridge.c:do_entity() prints hero-specific messages after a visible hero
// is pushed into the closed portcullis. This is a source-grounded API fixture,
// not a fresh C gameplay recording.
import assert from 'node:assert/strict';
import test from 'node:test';

import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { close_drawbridge, create_drawbridge } from '../js/dbridge.js';
import { DB_NORTH } from '../js/const.js';
import { d, rn1, rn2, rne, rnl, rnz } from '../js/rng.js';

for (const heroOnBridge of [false, true]) {
    test(`closing drawbridge reports visible hero in portcullis: ${heroOnBridge}`, async () => {
        await runSegment({
            seed: 671903,
            datetime: '20261018120000',
            nethackrc: 'OPTIONS=name:BridgeHero,role:Wizard,race:human,gender:male,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
            moves: '',
        });
        const x = 66, y = 13;
        assert.equal(create_drawbridge(x, y, DB_NORTH, true, game), true);
        if (heroOnBridge) {
            game.u.ux = x;
            game.u.uy = y;
        }
        const messages = [];
        try {
            await close_drawbridge(x, y, game, {
                message: async line => messages.push(line),
                random: { d, rn1, rn2, rnd: bound => bound, rne, rnl, rnz },
            });
        } catch (error) {
            // Fatal drawbridge processing requests endgame input after these
            // messages; that is outside this deliberately input-empty fixture.
            if (!heroOnBridge || !String(error).includes('Input queue empty')) throw error;
        }
        const heroMessages = messages.filter(line =>
            line.includes('portcullis') || line.includes('drawbridge closes in'));
        if (heroOnBridge) {
            assert.deepEqual([game.u.ux, game.u.uy], [x, y - 1]);
            assert.equal(game.u.uhp, 0);
            assert.deepEqual(heroMessages, [
                'You tumble towards the closed portcullis!',
                'The drawbridge closes in...',
            ]);
        } else {
            assert.deepEqual(heroMessages, []);
        }
    });
}
