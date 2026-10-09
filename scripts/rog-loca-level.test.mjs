import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {QUEST_LEVEL_LOADERS} from '../js/quest_levels.js';
import {ROG_LOCA_LEVEL_MAP} from '../js/rog_loca_level_data.js';
import {extractRogLocaMap,renderRogLocaMap} from './generate-rog-loca-level.mjs';

const source=readFileSync('nethack-c/upstream/dat/Rog-loca.lua','utf8');
test('Rog-loca map is generated from every complete source row',()=>{
    const rows=extractRogLocaMap(source);
    assert.deepEqual(ROG_LOCA_LEVEL_MAP,rows);
    assert.equal(readFileSync('js/rog_loca_level_data.js','utf8'),renderRogLocaMap(rows));
    assert.equal(rows.length,21); // Lua12–32 full height, including bottom stone row.
    assert.ok(rows.every(row=>row.length===76)); // Source trailing spaces remain cells.
});
test('Rog-loca preserves all descriptor values and asynchronous source order',async()=>{
    const calls=[];
    const des=new Proxy({},{get:(_,name)=>async(...args)=>{
        await Promise.resolve(); // Pending descriptor completion precedes the next call.
        calls.push({name,args});
    }});
    assert.equal(typeof QUEST_LEVEL_LOADERS['Rog-loca'],'function');
    await QUEST_LEVEL_LOADERS['Rog-loca'](des);
    assert.deepEqual(calls.map(c=>c.name),['level_init','level_flags','map','region',
        'stair','stair','non_diggable',...Array(15).fill('object'),
        ...Array(6).fill('trap'),...Array(33).fill('monster')]); // Lua5–99 definition order.
    assert.deepEqual(calls[0].args,[{style:'solidfill',fg:' '}]); // Lua5.
    assert.deepEqual(calls[1].args,['mazelevel']); // Lua7, no hardfloor or noflip flag.
    assert.deepEqual(calls[2].args,[ROG_LOCA_LEVEL_MAP]); // Lua11 string map uses canonical row form.
    assert.deepEqual(calls[3].args[0].bounds(),{lx:0,ly:0,hx:75,hy:20}); // Lua35.
    assert.equal(calls[3].args[1],'lit');
    assert.deepEqual(calls[4].args,['up']); // Lua39 random up stair first.
    assert.deepEqual(calls[5].args,['down']); // Lua40 random down stair second.
    assert.deepEqual(calls[6].args[0].bounds(),{lx:0,ly:0,hx:75,hy:20}); // Lua42.
    assert.deepEqual(calls[7].args,[{id:'scroll of teleportation',x:11,y:18,buc:'cursed',spe:0}]); // Lua44.
    assert.ok(calls.filter(c=>c.name==='object').slice(1).every(c=>c.args.length===0)); // Lua45–58.
    assert.ok(calls.filter(c=>c.name==='trap').every(c=>c.args.length===0)); // Lua60–65 random traps.
    assert.deepEqual(calls.filter(c=>c.name==='monster').map(c=>c.args),[
        ...Array(17).fill([{id:'leprechaun',peaceful:0}]),[{class:'l',peaceful:0}],
        ...Array(7).fill([{id:'guardian naga',peaceful:0}]),
        ...Array(3).fill([{class:'N',peaceful:0}]),
        ...Array(5).fill([{id:'chameleon',peaceful:0}]),
    ]); // Lua67–99: named species and class draws remain distinct.
});
