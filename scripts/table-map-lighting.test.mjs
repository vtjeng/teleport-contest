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
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
const root=new URL('./test-fixtures/recovery-map-lighting/',import.meta.url);
const native=JSON.parse(readFileSync(new URL('native-observations.json',root)));
const shipped=JSON.parse(readFileSync(new URL('shipped-provenance.json',root)));
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

for(const row of native.rows)test(`native C map lighting ${row.kind}: ${row.name}`,async()=>{
    await withDescriptor(des=>{
        des.level_init({style:'solidfill',fg:'.',lit:false});
        const before=getRngLog().length;
        const line=row.fg.repeat(3);
        des.map({x:1,y:0,map:`${line}\n${line}\n${line}`,...(row.name==='absent'?{}:{lit:row.lit})});
        assert.equal(getRngLog().length,before);
        let count=0;
        for(let x=1;x<=3;x++)for(let y=0;y<=2;y++)if(game.level.at(x,y).lit)count++;
        assert.equal(count,row.expected,'actual native Lua map/getmap count');
    });
});
for(const row of native.rows)test(`native map lighting fixture: ${row.name}`,()=>{
    const bytes=gunzipSync(readFileSync(new URL(`native-${row.name}.recording.json.gz`,root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.recordingSha256);
    for(const [suffix,sha]of [['lua',row.luaSha256],['recipe.json',row.recipeSha256]])
        assert.equal(createHash('sha256').update(readFileSync(new URL(`native-${row.name}.${suffix}`,root))).digest('hex'),sha);
    const c=JSON.parse(bytes);
    assert.equal(row.token,`MAPLIT_NATIVE_${row.name.toUpperCase()}=${row.expected}/9`);
    assert.ok(row.boundaries.some(i=>c.segments[0].steps[i].screen.includes(row.token)));
});
for(const row of shipped)test(`shipped hellfill C map lighting: ${row.name}`,async()=>{
    const bytes=gunzipSync(readFileSync(new URL(`${row.name}.recording.json.gz`,root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
    const c=JSON.parse(bytes),workspace=createScoringWorkspace(process.cwd(),[]);
    try{const result=compareSessionOutputs(c,await runJsSession(c,workspace));assert.equal(result.passed,true,formatReport(result));}
    finally{removeScoringWorkspace(workspace);}
});
