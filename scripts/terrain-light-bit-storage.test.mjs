import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {newgame_pre_mklev} from '../js/allmain.js';
import {game,resetGame} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {get_table_boolean} from '../js/nhlua.js';
import {objects_globals_init} from '../js/objects.js';
import {monst_globals_init} from '../js/monsters.js';
import {timeout_globals_init} from '../js/timeout.js';
import {light_globals_init} from '../js/light.js';
import {initRng,enableRngLog,getRngLog} from '../js/rng.js';
import {str2align,str2gend,str2race,str2role} from '../js/roles.js';
const root=new URL('./test-fixtures/recovery-terrain-lighting-bit-storage/',import.meta.url);
const cases=JSON.parse(readFileSync(new URL('expected.json',root)));
const provenance=JSON.parse(readFileSync(new URL('provenance.json',root)));
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
for(const row of cases) test(`C lighting ${row.kind}: ${row.fg} ${JSON.stringify(row.lit)}`,async()=>{
    assert.equal(get_table_boolean({lit:row.lit},'lit'),row.parsedC,'supported C boolean-string parsing');
    await withDescriptor(des=>{
        const before=getRngLog().length;
        des.level_init({style:'solidfill',fg:row.fg,lit:row.lit});
        assert.equal(getRngLog().length,before,'fixed C writer cases make no random draw');
        const cells=[];
        for(let x=2;x<=78;x++)for(let y=0;y<=20;y++){
            const cell=game.level.at(x,y);cells.push([cell.typ,Number(cell.lit)]);
        }
        assert.equal(cells.length,row.cells);
        assert.ok(cells.every(cell=>JSON.stringify(cell)===JSON.stringify(row.expectedCell)));
        assert.equal(createHash('sha256').update(JSON.stringify(cells)).digest('hex'),row.expectedGridSha256);
        const native=provenance.nativeCases.find(c=>c.fg===row.fg && c.lit===row.lit);
        if(native) assert.equal(cells.filter(cell=>cell[1]===1).length,native.expectedLitCount,'actual native Lua/getmap grid count');
    });
});
test('terrain-light C source evidence remains pinned',()=>{
    const p=JSON.parse(readFileSync(new URL('provenance.json',root)));
    for(const [path,expected]of Object.entries(p.sourceHashes))
        assert.equal(createHash('sha256').update(readFileSync(new URL(`../nethack-c/upstream/${path}`,import.meta.url))).digest('hex'),expected,path);
});

for(const row of provenance.nativeCases)test(`native C lighting fixture: ${row.case}`,()=>{
    const bytes=gunzipSync(readFileSync(new URL(`native-grid-${row.case}.recording.json.gz`,root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.recordingSha256);
    for(const [suffix,sha]of [['lua',row.luaSha256],['recipe.json',row.recipeSha256]])
        assert.equal(createHash('sha256').update(readFileSync(new URL(`native-grid-${row.case}.${suffix}`,root))).digest('hex'),sha);
    const captured=JSON.parse(bytes);
    assert.ok(row.boundaries.some(i=>captured.segments[0].steps[i].screen.includes(row.token)));
});
