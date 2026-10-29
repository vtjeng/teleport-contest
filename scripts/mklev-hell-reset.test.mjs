import assert from 'node:assert/strict';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import { game, resetGame } from '../js/gstate.js';
import { light_globals_init } from '../js/light.js';
import { mklev } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import { initRng } from '../js/rng.js';
import { str2align, str2gend, str2race, str2role } from '../js/roles.js';
import { timeout_globals_init } from '../js/timeout.js';

class LoaderDone extends Error {}

for (const hellish of [true, false]) {
    test(`reset_level restores ${hellish ? 'hot' : 'temperate'} dungeon temperature`, async () => {
        resetGame();
        objects_globals_init(game);
        monst_globals_init(game);
        timeout_globals_init(game);
        light_globals_init(game);
        initRng(0x5eed);
        game.fixedDatetime = '20400314015926';
        game.recorderIsDst = false;
        game.moves = 0;
        game.plname = 'ResetTemperature';
        game.flags = { initrole: str2role('Tourist'), initrace: str2race('human'),
            initgend: str2gend('female'), initalign: str2align('neutral'),
            female: true, bones: false };
        game.iflags = {};
        game.u = { uroleplay: {} };
        game.context = { move: 0 };
        await newgame_pre_mklev(game);
        const dnum = hellish ? game.dungeons.findIndex(d => d.flags.hellish) : 0;
        assert.ok(dnum >= 0);
        assert.equal(Boolean(game.dungeons[dnum].flags.hellish), hellish);
        game.u.uz = { dnum, dlevel: 1 };
        await assert.rejects(mklev({ specialLevelLoader: async des => {
            // C sp_level_coder_init has set the correct pre-reset default.
            assert.equal(game.level.flags.temperature, hellish ? 1 : 0);
            des.level_flags('cold');
            assert.equal(game.level.flags.temperature, -1);
            await des.reset_level();
            // C mklev.c:clear_level_structures derives this from In_hell.
            assert.equal(game.level.flags.temperature, hellish ? 1 : 0);
            throw new LoaderDone();
        } }), LoaderDone);
    });
}
