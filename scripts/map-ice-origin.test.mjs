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
const root=new URL('./test-fixtures/recovery-map-ice-origin/',import.meta.url);
const rows=JSON.parse(readFileSync(new URL('expected.json',root)));
const proof=JSON.parse(readFileSync(new URL('provenance.json',root))); 
class Observed extends Error {}
async function withDescriptor(body) {
    resetGame();objects_globals_init(game);monst_globals_init(game);
    timeout_globals_init(game);light_globals_init(game);initRng(0x5eed);enableRngLog();
    game.fixedDatetime='20400314015926';game.recorderIsDst=false;game.moves=0;game.plname='MapAlignmentControl';
    game.flags={initrole:str2role('Tourist'),initrace:str2race('human'),initgend:str2gend('female'),
        initalign:str2align('neutral'),female:true,bones:false};
    game.iflags={};game.u={uroleplay:{}};game.context={move:0};await newgame_pre_mklev(game);
    let complete=false;
    try {await mklev({specialLevelLoader:async des=>{await body(des);throw new Observed();}});}
    catch(error){if(!(error instanceof Observed))throw error;complete=true;}
    assert.equal(complete,true);
}

for(const row of rows)test(`C map ice origin ${row.kind}: ${row.init}/${row.pools}/${row.method}`,async()=>{
    await withDescriptor(des=>{
        if(row.init)des.level_init({style:'solidfill',fg:'.',lit:0});
        if(row.pools)des.level_flags('icedpools');
        const cells=[],before=getRngLog().length;
        if(row.method==='map'){
            const selected=des.map({x:10,y:6,map:'III\nIII\nIII'}).selection;
            for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(selected.get(x,y))cells.push([x,y]);
        }else for(let x=10;x<13;x++)for(let y=6;y<9;y++){
            des.terrain({x:x-1,y,typ:'I',lit:0});cells.push([x,y]);
        }
        assert.equal(getRngLog().length,before);
        assert.equal(cells.length,9);
        assert.deepEqual(cells.map(([x,y])=>{const loc=game.level.at(x,y);return[x,y,loc.typ,loc.icedpool??0];}),row.expected);
    });
});
test('ice-origin executed C oracle and function bodies remain source pinned',()=>{
    const oracle=readFileSync(new URL('oracle.c',root));
    assert.equal(createHash('sha256').update(oracle).digest('hex'),proof.oracleSha256);
    for(const fn of proof.functions){
        const source=readFileSync(new URL('../nethack-c/upstream/'+fn.path,import.meta.url),'utf8');
        const start=source.indexOf('\n'+fn.function+'(')+1,end=source.indexOf('\n}',start)+2;
        assert.ok(start>0&&end>start);
        const body=source.slice(start,end);assert.ok(oracle.toString().includes(body));
        assert.equal(createHash('sha256').update(body).digest('hex'),fn.bodySha256);
    }
});
