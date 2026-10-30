import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {newgame_pre_mklev} from '../js/allmain.js';
import {game,resetGame} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {objects_globals_init} from '../js/objects.js';
import {monst_globals_init} from '../js/monsters.js';
import {timeout_globals_init} from '../js/timeout.js';
import {light_globals_init} from '../js/light.js';
import {initRng,enableRngLog,getRngLog} from '../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../js/roles.js';
const root=new URL('./test-fixtures/recovery-wall-flag-reset/',import.meta.url);
const cases=JSON.parse(readFileSync(new URL('expected.json',root)));
class Observed extends Error {}
async function withDescriptor(body) {
    resetGame();objects_globals_init(game);monst_globals_init(game);
    timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);enableRngLog();
    game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='WallFlagControl';
    game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),
        initalign:str2align('neutral'),female:true,bones:false};
    game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
    let complete=false;
    try {await mklev({specialLevelLoader:async des=>{await body(des);throw new Observed();}});}
    catch(error){if(!(error instanceof Observed))throw error;complete=true;}
    assert.equal(complete,true);
}
for(const row of cases) test(`C wall-flag ${row.kind}: ${row.bit} ${row.method}`,async()=>{
    await withDescriptor(des=>{
        des.level_init({style:'solidfill',fg:'.',lit:0});
        const cells=[];
        for(let x=10;x<13;x++)for(let y=6;y<9;y++){
            des.terrain({x:x-1,y,typ:'-',lit:0});cells.push([x,y]);
        }
        des.wall_property({region:[9,6,11,8],property:row.bit===8?'nondiggable':'nonpasswall'});
        assert.deepEqual(cells.map(([x,y])=>game.level.at(x,y).wall_info),row.before);
        const before=getRngLog().length;
        if(row.method==='map'||row.method==='transparent')
            des.map({x:10,y:6,map:row.method==='map'?'---\n---\n---':'xxx\nxxx\nxxx'});
        else if(row.method==='solidfill'||row.method==='mazegrid')
            des.level_init({style:row.method,fg:'-',bg:'-',lit:0});
        else for(const [x,y]of cells)des.terrain({x:x-1,y,typ:'-',lit:0});
        assert.equal(getRngLog().length,before,'C oracle aborts on any RNG draw in these fixed paths');
        assert.deepEqual(cells.map(([x,y])=>[x,y,game.level.at(x,y).typ,game.level.at(x,y).wall_info]),row.after);
    });
});
test('wall-flag C body proof source inputs remain pinned',()=>{
    const p=JSON.parse(readFileSync(new URL('provenance.json',root)));
    for(const [path,expected]of Object.entries(p.sourceHashes))
        assert.equal(createHash('sha256').update(readFileSync(new URL(`../nethack-c/upstream/${path}`,import.meta.url))).digest('hex'),expected,path);
});
