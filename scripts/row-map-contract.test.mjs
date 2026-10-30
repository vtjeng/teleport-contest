import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {newgame_pre_mklev} from '../js/allmain.js';
import {game,resetGame} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {ROOM,COLNO,ROWNO} from '../js/const.js';
import {objects_globals_init} from '../js/objects.js';
import {monst_globals_init} from '../js/monsters.js';
import {timeout_globals_init} from '../js/timeout.js';
import {light_globals_init} from '../js/light.js';
import {initRng,enableRngLog,getRngLog} from '../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../js/roles.js';
const root=new URL('./test-fixtures/recovery-row-map-contract/',import.meta.url);
const proof=JSON.parse(readFileSync(new URL('provenance.json',root)));
const rows=JSON.parse(readFileSync(new URL('expected.json',root)));
const translation=JSON.parse(readFileSync(new URL('translation-proof.json',root)));
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

function bounds(selection){
    let lowx=COLNO,lowy=ROWNO,highx=0,highy=0,count=0;
    for(let x=1;x<COLNO;x++)for(let y=0;y<ROWNO;y++)if(selection.get(x,y)){
        assert.equal(game.level.at(x,y).typ,ROOM);
        count++;lowx=Math.min(lowx,x);lowy=Math.min(lowy,y);highx=Math.max(highx,x);highy=Math.max(highy,y);
    }
    return[lowx,lowy,highx,highy,count];
}
for(const row of rows)test(`native C raw-string / JS row-map ${row.kind}: ${row.name}`,async()=>{
    await withDescriptor(des=>{
        const before=getRngLog().length,chosen=des.map(row.rows);
        const follow=des.map({valign:'center',map:'..'});
        des.map({x:1,y:0,map:'xxx\nxxx'});
        assert.equal(getRngLog().length,before);
        assert.deepEqual([bounds(chosen.selection),bounds(follow.selection)],row.expected);
    });
});
for(const row of rows)test(`native row-map fixture: ${row.name}`,()=>{
    const bytes=gunzipSync(readFileSync(new URL(`${row.name}.recording.json.gz`,root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.recordingSha256);
    for(const suffix of ['lua','recipe.json'])assert.equal(createHash('sha256').update(
        readFileSync(new URL(`${row.name}.${suffix}`,root))).digest('hex'),row[suffix+'Sha256']);
    assert.equal(row.token,`ROW_MAP_${row.name.toUpperCase().replaceAll('-','_')}=${row.expected[0].join(',')};FOLLOW=${row.expected[1].join(',')}`);
    assert.ok(JSON.parse(bytes).segments[0].steps[row.boundary].screen.includes(row.token));
});
test('row-array translation contract is grounded in a matching authored map literal',()=>{
    const js=readFileSync(new URL('../'+translation.jsPath,import.meta.url),'utf8');
    const c=readFileSync(new URL('../nethack-c/upstream/'+translation.cPath,import.meta.url),'utf8');
    assert.ok(js.includes('translates one Lua file into the same sequence of des.* API calls'));
    const block=js.split('async function bigrm1(')[1].split('await des.map([')[1].split(']);')[0];
    const rows=[...block.matchAll(/'([^']*)'/gu)].map(m=>m[1]);
    const cGrid=c.split('des.map([[')[1].split(']])')[0].replace(/^\n/u,'').replace(/\n$/u,'');
    assert.deepEqual(rows,cGrid.split('\n'));assert.equal(rows.length,translation.matchingRows);
    assert.equal(createHash('sha256').update(cGrid).digest('hex'),translation.normalizedGridSha256);
    const source=readFileSync(new URL('../nethack-c/upstream/src/sp_lev.c',import.meta.url),'utf8');
    const start=source.indexOf('\nlspo_map(')+1,end=source.indexOf('\n}',start)+2;
    assert.equal(createHash('sha256').update(source.slice(start,end)).digest('hex'),proof.cMapBodySha256);
});
