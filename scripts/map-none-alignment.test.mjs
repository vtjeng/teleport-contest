import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {newgame_pre_mklev} from '../js/allmain.js';
import {game,resetGame} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {ROOM} from '../js/const.js';
import {objects_globals_init} from '../js/objects.js';
import {monst_globals_init} from '../js/monsters.js';
import {timeout_globals_init} from '../js/timeout.js';
import {light_globals_init} from '../js/light.js';
import {initRng,enableRngLog,getRngLog} from '../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../js/roles.js';
const root=new URL('./test-fixtures/recovery-map-none-alignment/',import.meta.url);
const native=JSON.parse(readFileSync(new URL('provenance.json',root)));
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

for(const row of native.rows)test(`native C map alignment ${row.kind}: ${row.name}`,async()=>{
    await withDescriptor(des=>{
        const spec={x:10,y:6,map:'...\n...\n...'};
        if(row.halign!=='absent')spec.halign=row.halign;
        if(row.valign!=='absent')spec.valign=row.valign;
        const before=getRngLog().length,chosen=des.map(spec);
        // Mirror the native reference's supported transparent frame reset.
        des.map({x:1,y:0,map:'xxx\nxxx'});
        const points=[];
        for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(chosen.selection.get(x,y)){
            assert.equal(game.level.at(x,y).typ,ROOM);points.push([x,y]);
        }
        assert.equal(getRngLog().length,before);
        assert.deepEqual([Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),
            Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1])),points.length],row.expected);
    });
});
for(const row of native.rows)test(`native map alignment fixture: ${row.name}`,()=>{
    const bytes=gunzipSync(readFileSync(new URL(`${row.name}.recording.json.gz`,root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
    for(const suffix of ['lua','recipe.json'])assert.equal(createHash('sha256').update(
        readFileSync(new URL(`${row.name}.${suffix}`,root))).digest('hex'),row[suffix+'Sha256']);
    assert.equal(row.token,`MAPNONE_${row.name.toUpperCase().replaceAll('-','_')}=${row.expected.join(',')}`);
    const c=JSON.parse(bytes);assert.ok(c.segments[0].steps[row.boundary].screen.includes(row.token));
});
