import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {ROOM,CORR,DOOR,STONE} from '../js/const.js';

import { newgame_pre_mklev } from '../js/allmain.js';
import { game, resetGame } from '../js/gstate.js';
import { light_globals_init } from '../js/light.js';
import { mklev } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import { initRng, enableRngLog, getRngLog } from '../js/rng.js';
import { str2align, str2gend, str2race, str2role } from '../js/roles.js';
import { timeout_globals_init } from '../js/timeout.js';

class LoaderDone extends Error {}

async function withDescriptor(body) {
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
for (const [midpoint,carve,expected] of [
    ['+','.',ROOM],['+','#',CORR],['.','.',ROOM],['.','#',CORR],
]) {
    test(`mazewalk ${carve} overwrites intermediate ${midpoint} with identical RNG`, async () => {
        await withDescriptor(des => {
            des.level_init({style:'solidfill',fg:'.',lit:0});
            des.terrain(13,11,midpoint);
            des.terrain(14,11,' ');
            assert.deepEqual([13,14,15].map(x => game.level.at(x,11).typ),
                [ROOM,midpoint === '+' ? DOOR : ROOM,STONE]);
            enableRngLog();
            des.mazewalk({x:11,y:11,dir:'east',typ:carve,stocked:0});
            assert.deepEqual([13,14,15].map(x => game.level.at(x,11).typ),
                [expected,expected,expected]);
            assert.deepEqual(getRngLog(),['rn2(1)=0']);
        });
    });
}
test('non-MICRO C walkfrom guards the start but always paints its intermediate square', () => {
    const source = readFileSync('nethack-c/upstream/src/mkmaze.c','utf8');
    const start = source.lastIndexOf('walkfrom(coordxy x, coordxy y, schar typ)');
    assert.ok(start >= 0);
    const body = source.slice(start,source.indexOf('/* find random point',start));
    assert.match(body,/if \(!IS_DOOR\(levl\[x\]\[y\]\.typ\)\)/u);
    assert.match(body,/mz_move\(x, y, dir\);\s*levl\[x\]\[y\]\.typ = typ;\s*mz_move\(x, y, dir\);/u);
});
