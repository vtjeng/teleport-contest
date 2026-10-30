import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {ICE} from '../js/const.js';
import {newgame_pre_mklev} from '../js/allmain.js';
import {game,resetGame} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {objects_globals_init} from '../js/objects.js';
import {monst_globals_init} from '../js/monsters.js';
import {timeout_globals_init} from '../js/timeout.js';
import {light_globals_init} from '../js/light.js';
import {initRng,enableRngLog,getRngLog} from '../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../js/roles.js';
const root=new URL('./test-fixtures/recovery-table-map-lighting-and-ice/',import.meta.url);
const proof=JSON.parse(readFileSync(new URL('provenance.json',root)));
const rows=proof.rows;
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

for(const row of rows)test(`C table-map lighting/ice interaction: ${row.name}`,async()=>{
    await withDescriptor(des=>{
        des.level_init({style:'solidfill',fg:'.',lit:false});
        if(row.pools)des.level_flags('icedpools');
        const before=getRngLog().length;
        des.map({x:1,y:0,map:'III\nIII\nIII',lit:row.lit});
        let lit=0;
        for(let x=1;x<=3;x++)for(let y=0;y<=2;y++){
            const loc=game.level.at(x,y);assert.equal(loc.typ,ICE);
            if(loc.lit)lit++;assert.equal(loc.icedpool,row.icedpool);
        }
        assert.equal(getRngLog().length,before);assert.equal(lit,row.expected);
    });
});
for(const row of rows)test(`native C lighting/ice fixture: ${row.name}`,()=>{
    const bytes=gunzipSync(readFileSync(new URL(`${row.name}.recording.json.gz`,root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.recordingSha256);
    for(const suffix of ['lua','recipe.json'])assert.equal(createHash('sha256').update(
        readFileSync(new URL(`${row.name}.${suffix}`,root))).digest('hex'),row[suffix+'Sha256']);
    assert.equal(row.token,`MAP_ICE_LIGHT_${row.name.toUpperCase().replaceAll('-','_')}=${row.expected}/9,ICE=9/9`);
    assert.ok(JSON.parse(bytes).segments[0].steps[row.boundary].screen.includes(row.token));
});
