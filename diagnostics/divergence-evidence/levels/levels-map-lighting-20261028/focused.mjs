import assert from 'node:assert/strict';
import {newgame_pre_mklev} from '../../../../js/allmain.js';
import {game,resetGame} from '../../../../js/gstate.js';
import {mklev} from '../../../../js/mklev.js';
import {monst_globals_init} from '../../../../js/monsters.js';
import {objects_globals_init} from '../../../../js/objects.js';
import {initRng} from '../../../../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../../../../js/roles.js';
import {timeout_globals_init} from '../../../../js/timeout.js';
class LoaderDone extends Error {}

async function runLoader(seed, body) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    initRng(seed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'MapLightingProbe';
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

const mode=process.argv[2];assert.ok(['target','control'].includes(mode),'target|control');
const lit=mode==='target';
const cells=await runLoader(28103903,async des=>{
 await des.level_init({style:'solidfill',fg:' ',lit:0});
 await des.map({coord:[20,10],lit,map:'x.....x\n.......\n.......\n.......\n.......\n.......\nx.....x',contents(){}});
 const cells=[];for(let y=10;y<17;y++)for(let x=20;x<27;x++)
  if(!((x===20||x===26)&&(y===10||y===16)))cells.push({x,y,lit:game.level.at(x,y).lit});
 return cells;
});
console.log(JSON.stringify({mode,cells:cells.length,litCount:cells.filter(c=>c.lit).length,expectedLitCount:lit?45:0}));
assert.equal(cells.filter(c=>c.lit).length,lit?45:0,'C lspo_map forwards table lit to every painted cell');
