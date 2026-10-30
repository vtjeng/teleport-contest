import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {ICE, ICED_POOL, ICED_MOAT} from '../js/const.js';

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

test('reset expectations are pinned to C default and shared ice flags', () => {
    const mklev = readFileSync('nethack-c/upstream/src/mklev.c','utf8');
    const splev = readFileSync('nethack-c/upstream/src/sp_lev.c','utf8');
    const rm = readFileSync('nethack-c/upstream/include/rm.h','utf8');
    assert.match(mklev,/temperature = In_hell\(&u.uz\) \? 1 : 0;/u);
    assert.match(splev,/lvlfill_solid\(schar filling, schar lit\)[\s\S]*?levl\[x\]\[y\]\.flags = 0;/u);
    assert.match(rm,/#define icedpool\s+flags/u);
});

async function withResetDescriptor(body) {
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
    await assert.rejects(mklev({specialLevelLoader:async des => {
        await body(des);
        throw new LoaderDone();
    }}),LoaderDone);
}
for (const icedpools of [false,true]) {
    test(`solidfill clears ${icedpools ? 'pool' : 'moat'} ice origin while terrain redraw preserves it`, async () => {
        await withResetDescriptor(des => {
            des.level_init({style:'solidfill',fg:'.',lit:0});
            if (icedpools) des.level_flags('icedpools');
            des.terrain({x:9,y:6,typ:'I',lit:0});
            const origin = icedpools ? ICED_POOL : ICED_MOAT;
            assert.equal(game.level.at(10,6).icedpool,origin);
            des.terrain({x:9,y:6,typ:'I',lit:0});
            assert.equal(game.level.at(10,6).icedpool,origin,'ordinary paint control');
            des.level_init({style:'solidfill',fg:'I',bg:'I',lit:0});
            assert.equal(game.level.at(10,6).typ,ICE);
            assert.equal(game.level.at(10,6).icedpool,0);
        });
    });
}
