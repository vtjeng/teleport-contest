import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
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
const root=new URL('./test-fixtures/recovery-c-string-consumers/',import.meta.url);
const proof=JSON.parse(readFileSync(new URL('provenance.json',root)));
const messages=JSON.parse(readFileSync(new URL('messages.json',root)));
const engravings=JSON.parse(readFileSync(new URL('engravings.json',root)));
const maps=JSON.parse(readFileSync(new URL('maps.json',root)));
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

for(const row of messages)test(`C message prefix ${row.kind}: ${row.id}`,async()=>{
    await withDescriptor(des=>{
        des.level_init({style:'solidfill',fg:'.',lit:0});
        const before=getRngLog().length;
        for(const text of row.messages)des.message(text);
        assert.equal(getRngLog().length,before);assert.equal(game.gl.lev_message,row.expected);
    });
});
for(const row of engravings)test(`C engraving prefix ${row.kind}: ${row.form}/${Buffer.from(row.text).toString('hex')}`,async()=>{
    await withDescriptor(des=>{
        des.level_init({style:'solidfill',fg:'.',lit:0});
        assert.ok(!game.head_engr);const before=getRngLog().length;
        if(row.form)des.engraving([2,2],'engrave',row.text);
        else des.engraving({x:2,y:2,type:'engrave',text:row.text});
        const e=game.head_engr;assert.ok(e&&!e.nxt_engr);
        assert.equal(getRngLog().length,before);
        assert.deepEqual({x:e.engr_x,y:e.engr_y,type:e.engr_type,time:e.engr_time,size:e.engr_szeach,
            allocation:e.engr_alloc,guardobjects:Number(e.guardobjects),nowipeout:Number(e.nowipeout),
            textHex:e.engr_txt.map(t=>Buffer.from(t).toString('hex'))},row.expected);
    });
});
for(const row of maps)test(`native C table-map prefix ${row.kind}: ${row.name}`,async()=>{
    await withDescriptor(des=>{
        const before=getRngLog().length,chosen=des.map({x:10,y:6,map:row.text});
        des.map({x:1,y:0,map:'xxx\nxxx'});const points=[];
        for(let x=1;x<80;x++)for(let y=0;y<21;y++)if(chosen.selection.get(x,y))points.push([x,y]);
        assert.equal(getRngLog().length,before);
        assert.deepEqual([Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),
            Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1])),points.length],row.expected);
    });
});
for(const row of maps)test(`native table-map prefix fixture: ${row.name}`,()=>{
    const bytes=gunzipSync(readFileSync(new URL(`${row.name}.recording.json.gz`,root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.recordingSha256);
    for(const suffix of ['lua','recipe.json'])assert.equal(createHash('sha256').update(
        readFileSync(new URL(`${row.name}.${suffix}`,root))).digest('hex'),row[suffix+'Sha256']);
    assert.equal(row.token,`MAP_PREFIX_${row.name.toUpperCase().replaceAll('-','_')}=${row.expected.join(',')}`);
    assert.ok(JSON.parse(bytes).segments[0].steps[row.boundary].screen.includes(row.token));
});
test('executed C consumer oracles retain six exact source bodies',()=>{
    for(const [group,hash]of Object.entries(proof.oracleHashes))assert.equal(createHash('sha256').update(
        readFileSync(new URL(`${group}-oracle.c`,root))).digest('hex'),hash);
    for(const fn of proof.functions){
        const source=readFileSync(new URL('../nethack-c/upstream/'+fn.path,import.meta.url),'utf8');
        const start=source.indexOf('\n'+fn.function+'(')+1,end=source.indexOf('\n}',start)+2;
        assert.ok(start>0&&end>start);const body=source.slice(start,end);
        assert.equal(createHash('sha256').update(body).digest('hex'),fn.bodySha256);
        assert.ok(readFileSync(new URL(`${fn.group}-oracle.c`,root),'utf8').includes(body));
    }
});
