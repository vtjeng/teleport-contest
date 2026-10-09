import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {QUEST_LEVEL_LOADERS} from '../js/quest_levels.js';
import {RAN_STRT_LEVEL_MAP, RAN_STRT_HUNTERS, RAN_STRT_FOREST_CENTAURS} from '../js/ran_strt_level_data.js';
import {extractRanStrtData, renderRanStrtData} from './generate-ran-strt-level.mjs';

const source = readFileSync('nethack-c/upstream/dat/Ran-strt.lua', 'utf8');
test('Ran-strt fixed geometry and monster coordinates are generated from source', () => {
    const data = extractRanStrtData(source);
    assert.deepEqual(data, {map:RAN_STRT_LEVEL_MAP, hunters:RAN_STRT_HUNTERS,
        centaurs:RAN_STRT_FOREST_CENTAURS});
    assert.equal(readFileSync('js/ran_strt_level_data.js', 'utf8'), renderRanStrtData(data));
    assert.equal(data.map.length, 21); // Lua21–41 includes both transparent end rows.
    assert.ok(data.map.every(row => row.length === 41)); // Trailing spaces are map cells.
});
test('Ran-strt awaits every descriptor and Orion inventory in Lua source order', async () => {
    const calls = [];
    const des = new Proxy({}, {get: (_, name) => async (...args) => {
        await Promise.resolve(); // Each callback completes before the next descriptor.
        calls.push({name, args});
        if (name === 'monster' && args[0]?.inventory) await args[0].inventory();
    }});
    assert.equal(typeof QUEST_LEVEL_LOADERS['Ran-strt'], 'function');
    await QUEST_LEVEL_LOADERS['Ran-strt'](des);
    assert.deepEqual(calls.map(c => c.name), ['level_init','level_flags','level_init',
        'replace_terrain','map','region','stair','levregion','monster',
        ...Array(4).fill('object'), ...Array(8).fill('monster'), 'non_diggable',
        ...Array(6).fill('trap'), ...Array(27).fill('monster')]); // Lua13–101, including inventory.
    assert.deepEqual(calls[0].args, [{style:'solidfill',fg:'.'}]); // Lua13.
    assert.deepEqual(calls[1].args, ['mazelevel','noteleport','hardfloor','arboreal']); // Lua15.
    assert.deepEqual(calls[2].args, [{style:'mines',fg:'.',bg:'.',smoothed:true,
        joined:true,lit:1,walled:false}]); // Lua17.
    assert.deepEqual(calls[3].args, [{region:[0,0,76,19],fromterrain:'.',toterrain:'T',chance:5}]); // Lua18 before map.
    assert.deepEqual(calls[4].args, [{halign:'left',valign:'center',map:RAN_STRT_LEVEL_MAP.join('\n')}]); // Lua20 table map is a string.
    assert.deepEqual(calls[5].args[0].bounds(), {lx:0,ly:0,hx:40,hy:20}); // Lua43.
    assert.equal(calls[5].args[1], 'lit');
    assert.deepEqual(calls[6].args, ['down',10,10]); // Lua45 map-relative.
    assert.deepEqual(calls[7].args, [{region:[51,2,77,18],region_islev:1,type:'branch'}]); // Lua47 absolute.
    assert.equal(calls[8].args[0].id, 'Orion'); // Lua49.
    assert.deepEqual(calls[8].args[0].coord, [20,10]);
    assert.deepEqual(calls.filter(c=>c.name==='object').map(c=>c.args), [
        [{id:'leather armor',spe:4}], [{id:'yumi',spe:4}],
        [{id:'ya',spe:4,quantity:50}], ['chest',20,10],
    ]); // Lua50–55: callback objects precede the floor chest.
    assert.deepEqual(calls.filter(c=>c.name==='monster').slice(1,9).map(c=>c.args),
        RAN_STRT_HUNTERS.map(([x,y])=>['hunter',x,y])); // Lua57–64.
    assert.deepEqual(calls.find(c=>c.name==='non_diggable').args[0].bounds(),
        {lx:0,ly:0,hx:40,hy:20}); // Lua66.
    assert.deepEqual(calls.filter(c=>c.name==='trap').map(c=>c.args),
        [['arrow',30,9],['arrow',30,10],['pit',40,9],['spiked pit'],['bear'],['bear']]); // Lua68–73.
    assert.deepEqual(calls.filter(c=>c.name==='monster').slice(9).map(c=>c.args), [
        [{id:'minotaur',x:33,y:9,peaceful:0,asleep:1}],
        ...RAN_STRT_FOREST_CENTAURS.map(([x,y])=>[{id:'forest centaur',x,y,peaceful:0}]),
        ...Array(6).fill([{id:'plains centaur',peaceful:0}]),
        ...Array(2).fill([{id:'scorpion',peaceful:0}]),
    ]); // Lua75–101 preserves fixed and random creation order.
});
