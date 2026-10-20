import assert from 'node:assert/strict';
import test from 'node:test';

import { AD_SITM, PM_MONKEY, NON_PM } from '../js/monsters.js';
import { W_SADDLE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { mhitm_adtyping } from '../js/uhitm.js';
import { RIDE_COMMAND, loadRideDismountRecipe }
    from './run-ride-dismount.mjs';

test('a monkey stealing the mounted pony saddle dismounts before extraction',
    async () => {
        const segment = loadRideDismountRecipe().segments.find(
            row => row.moves === `.${RIDE_COMMAND}j${RIDE_COMMAND}.`,
        );
        assert.ok(segment);
        await runSegment({ ...segment, moves: `.${RIDE_COMMAND}j` });
        clearTtyMessageWindow(game);
        const steed = game.u.usteed;
        assert.ok(steed, 'the recorded Knight ride leaves a mounted pony');
        const saddle = steed.minvent;
        assert.ok(saddle.owornmask & W_SADDLE);
        const hpBefore = game.u.uhp;

        const monkey = newMonster({
            data: game.mons[PM_MONKEY], cham: NON_PM, m_id: 94140,
            mx: game.u.ux + 1, my: game.u.uy, mhp: 10, mhpmax: 10,
        });
        const theft = monkey.data.mattk[0];
        assert.equal(theft.adtyp, AD_SITM);
        for (let i = 0; i < 12; ++i)
            game.nhDisplay.pushKey(' '.charCodeAt(0));

        await mhitm_adtyping(monkey, theft, steed,
            { damage: 1, hitflags: 0, done: false }, game,
            { message: async () => {},
              unsupported: reason => { throw new Error(reason); } });

        assert.equal(game.u.usteed, null);
        assert.equal(monkey.minvent, saddle);
        assert.equal(game.u.uhp, hpBefore);
        assert.match(game._ttyToplines, /You can no longer ride/u);
        assert.equal(game.unported.has('steed.c dismount_steed'), false);
    });
