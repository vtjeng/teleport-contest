import assert from 'node:assert/strict';
import test from 'node:test';
import { newgame_pre_mklev } from '../js/allmain.js';
import { game, resetGame } from '../js/gstate.js';
import { mklev } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import { initRng } from '../js/rng.js';
import { DOOR, SDOOR, D_LOCKED, D_CLOSED, DBWALL } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { str2align, str2gend, str2race, str2role } from '../js/roles.js';
import { timeout_globals_init } from '../js/timeout.js';
class LoaderDone extends Error {}
async function runLoader(body) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    light_globals_init(game);
    initRng(0x5eed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'SpecialLevelTest';
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

    await assert.rejects(
        mklev({
            specialLevelLoader: async (des) => {
                await body(des);
                throw new LoaderDone();
            },
        }),
        (error) => error instanceof LoaderDone,
    );
}


// Values independently exercised by the pinned portable C construction oracle.
for (const [dir, dx, dy] of [['north',0,-1], ['south',0,1], ['east',1,0], ['west',-1,0]]) {
    for (const mode of ['closed-door', 'open-door', 'closed-secret']) {
        test(`drawbridge ${dir} ${mode} retains the C door mask`, async () => {
            await runLoader(des => {
                des.level_init({style:'solidfill',fg:'.',lit:0});
                const x = 13, y = 10, wx = x + dx, wy = y + dy;
                des.terrain({x,y,typ:'}',lit:0});
                des.terrain({x:wx,y:wy,typ:'-',lit:0});
                des.drawbridge({x,y,dir,state:mode === 'open-door' ? 'open' : 'closed'});
                const wall = game.level.at(wx + 1,wy);
                assert.equal(wall.typ,mode === 'open-door' ? DOOR : DBWALL);
                des.terrain({x:wx,y:wy,typ:mode === 'closed-secret' ? 'S' : '+',lit:0});
                assert.equal(wall.typ,mode === 'closed-secret' ? SDOOR : DOOR);
                assert.equal(wall.doormask,mode === 'closed-secret' ? D_CLOSED
                    : mode === 'closed-door' ? D_LOCKED : 0);
                des.terrain({x,y,typ:'.',lit:0});
            });
        });
    }
}
