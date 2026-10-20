import assert from 'node:assert/strict';
import test from 'node:test';

import { DISCLOSE_NO_WITHOUT_PROMPT, W_SADDLE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { PM_COCKATRICE } from '../js/monsters.js';
import { mount_steed } from '../js/steed.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { RIDE_COMMAND, loadRideDismountRecipe }
    from './run-ride-dismount.mjs';

test('mounting a saddled pony changed into a cockatrice petrifies the hero',
    async () => {
        const segment = loadRideDismountRecipe().segments.find(
            row => row.moves === `.${RIDE_COMMAND}j${RIDE_COMMAND}.`,
        );
        assert.ok(segment);
        await runSegment({ ...segment, moves: '.' });
        clearTtyMessageWindow(game);
        const steed = m_at(game.u.ux, game.u.uy + 1, game);
        assert.ok(steed?.minvent?.owornmask & W_SADDLE);
        steed.data = game.mons[PM_COCKATRICE];

        game.iflags.window_inited = false;
        game.flags.end_disclose.fill(DISCLOSE_NO_WITHOUT_PROMPT);
        game.flags.bones = false;
        game.invent = null;
        game.moves = Math.max(game.moves, 2);
        for (let i = 0; i < 40; ++i)
            game.nhDisplay.pushKey(' '.charCodeAt(0));

        await mount_steed(steed, false, game);

        assert.equal(game.program_state.gameover, true);
        assert.equal(game.killer.name, 'attempting to ride a cockatrice');
        assert.equal(game.unported.has('trap.c instapetrify'), false);
    });
