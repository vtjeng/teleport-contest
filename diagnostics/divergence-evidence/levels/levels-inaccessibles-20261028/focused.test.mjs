import assert from 'node:assert/strict';
import test from 'node:test';

import { newgame_pre_mklev } from '../../../../js/allmain.js';
import { VWALL, SDOOR } from '../../../../js/const.js';
import { game, resetGame } from '../../../../js/gstate.js';
import { mklev } from '../../../../js/mklev.js';
import { monst_globals_init } from '../../../../js/monsters.js';
import { objects_globals_init } from '../../../../js/objects.js';
import { initRng } from '../../../../js/rng.js';
import { light_globals_init } from '../../../../js/light.js';
import {
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../../../../js/roles.js';
import { timeout_globals_init } from '../../../../js/timeout.js';

class LoaderDone extends Error {}

async function runLoader(seed, body) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    light_globals_init(game);
    initRng(seed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'ResetTest';
    game.flags = {
        initrole: str2role('Tourist'),
        initrace: str2race('human'),
        initgend: str2gend('female'),
        initalign: str2align('neutral'),
        female: true,
        bones: false,
    };
    game.iflags = {};
    game.u = { uroleplay: {} };
    game.context = { move: 0 };
    await newgame_pre_mklev(game);
    let result = null;
    await assert.rejects(
        mklev({
            specialLevelLoader: async (des) => {
                result = await body(des);
                throw new LoaderDone();
            },
        }),
        (error) => error instanceof LoaderDone,
    );
    return result;
}


// Source sp_lev.c:generate_way_out_method first tries a secret door between
// a disconnected accessible pocket and the stair-connected selection.
test('inaccessibles finalization creates a secret door; no-flag control does not', async () => {
    for (const enabled of [false, true]) {
        await runLoader(0x281028, async des => {
            des.level_init({ style: 'solidfill', fg: ' ' });
            des.level_flags('noflip', 'corrmaze');
            if (enabled) des.level_flags('inaccessibles');
            des.map(['.|.']);
            des.stair('down', 0, 0);
            const x = des.frame.xstart + 1, y = des.frame.ystart;
            const before = game.level.at(x,y).typ;
            assert.equal(before, VWALL); // VWALL, the authored '|'.
            await des.finish();
            const after = game.level.at(x,y).typ;
            assert.equal(after, enabled ? SDOOR : before); // SDOOR.
        });
    }
});
