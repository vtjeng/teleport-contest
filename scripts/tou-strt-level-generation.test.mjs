import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { TOU_STRT_LEVEL_MAP, TOU_STRT_DOORS, TOU_STRT_GUIDES } from '../js/tou_strt_level_data.js';
import { extractTouStrtData, renderTouStrtData } from './generate-tou-strt-level.mjs';
const source = readFileSync('nethack-c/upstream/dat/Tou-strt.lua', 'utf8');
test('Tou-strt generated map and placement tables retain the Lua literals', () => {
    const data = extractTouStrtData(source);
    assert.deepEqual(TOU_STRT_LEVEL_MAP, data.rows);
    assert.deepEqual(TOU_STRT_DOORS, data.doors);
    assert.deepEqual(TOU_STRT_GUIDES, data.guides);
    assert.equal(renderTouStrtData(data), readFileSync('js/tou_strt_level_data.js', 'utf8'));
    // Lua15–36: the throne backslash at 64/3 must survive JS escaping.
    assert.equal(data.rows[3][64], '\\');
    assert.equal(data.doors.length, 18); // Lua54–71 fixed doors, including secrets.
    assert.equal(data.guides.length, 11); // Lua105–115 fixed audience guides.
});
test('Tou-strt preserves whole source order and awaited Twoflower inventory', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Tou-strt'], 'function');
    const calls = [];
    const des = Object.fromEntries(['level_init', 'level_flags', 'map', 'region', 'stair',
        'levregion', 'non_diggable', 'door', 'monster', 'object', 'trap']
        .map(property => [property, async (...args) => {
            calls.push({ property, args });
            if (args[0]?.inventory) await args[0].inventory();
        }]));
    await QUEST_LEVEL_LOADERS['Tou-strt'](des);
    assert.deepEqual(calls.slice(0, 3), [
        { property: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { property: 'level_flags', args: ['mazelevel', 'noteleport', 'hardfloor'] },
        { property: 'map', args: [TOU_STRT_LEVEL_MAP] },
    ]); // Lua12–36 leaves solidfill lighting unspecified.
    const regions = calls.filter(c => c.property === 'region');
    assert.deepEqual(regions[1].args, [{ region: [14, 1, 20, 3], lit: 0, type: 'morgue', filled: 1 }]);
    // Lua38–47: all map lit, then deferred morgue and the seven dark rooms.
    assert.deepEqual(regions.filter(c => c.args[0]?.bounds).map(c => [c.args[0].bounds(), c.args[1]]),
        [[0, 0, 75, 19, 'lit'], [7, 10, 11, 12, 'unlit'], [4, 16, 8, 18, 'unlit'],
            [17, 16, 21, 18, 'unlit'], [27, 2, 32, 4, 'unlit'], [34, 2, 39, 4, 'unlit'],
            [41, 2, 53, 4, 'unlit'], [55, 2, 60, 4, 'unlit'], [62, 2, 67, 4, 'lit']]
            .map(([lx, ly, hx, hy, light]) => [{ lx, ly, hx, hy }, light]));
    assert.deepEqual(calls.filter(c => c.property === 'door').map(c => c.args), TOU_STRT_DOORS);
    assert.deepEqual(calls.find(c => c.property === 'stair').args, ['down', 66, 3]); // Lua49.
    assert.deepEqual(calls.find(c => c.property === 'levregion').args, [{ region: [68, 14, 68, 14], type: 'branch' }]); // Lua51.
    assert.deepEqual(calls.find(c => c.property === 'non_diggable').args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 }); // Lua53.
    const monsters = calls.filter(c => c.property === 'monster');
    const leader = monsters[23].args[0]; // Lua73–98's siege monsters precede Twoflower.
    assert.equal(leader.id, 'Twoflower');
    assert.deepEqual(leader.coord, [64, 3]);
    assert.deepEqual(monsters.map(c => typeof c.args[0] === 'string' ? c.args : [c.args[0].id]), [
        ...Array.from({ length: 12 }, () => ['giant spider']), ['s'], ['s'],
        ...Array.from({ length: 8 }, () => ['forest centaur']), ['C'], ['Twoflower'],
        ...TOU_STRT_GUIDES.map(coord => ['guide', ...coord]), ['watchman', 35, 8], ['watchman', 36, 8],
        ['giant eel', 62, 12], ['piranha', 47, 10], ['piranha', 29, 11], ['kraken', 34, 9], ['kraken', 37, 9],
    ]); // Lua73–124 preserves species/class strings and aquatic coordinates.
    assert.deepEqual(calls.filter(c => c.property === 'object').map(c => c.args), [
        [{ id: 'walking shoes', spe: 3 }], [{ id: 'hawaiian shirt', spe: 3 }], ['chest', 64, 3],
    ]); // Lua99–103 completes both inventory objects before the floor chest.
    assert.deepEqual(calls.map(c => c.property), ['level_init', 'level_flags', 'map',
        ...Array(10).fill('region'), 'stair', 'levregion', 'non_diggable', ...Array(18).fill('door'),
        ...Array(24).fill('monster'), ...Array(3).fill('object'), ...Array(18).fill('monster'),
        ...Array(9).fill('trap')]); // Lua125–134 ends with nine random traps.
});

test('special room filling belongs to makelevel or post-topology direct finalization', () => {
    const js = readFileSync('js/mklev.js', 'utf8');
    const luaSource = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');
    const makeSource = readFileSync('nethack-c/upstream/src/mklev.c', 'utf8');
    const cLoader = luaSource.slice(luaSource.indexOf('load_special(const char *name)'));
    assert.ok(!cLoader.includes('fill_special_room(')); // sp_lev.c6454–6503 ends at premap_detect.
    const jsFinish = js.slice(js.indexOf('        async finish() {'), js.indexOf('// C ref: sp_lev.c lspo_map(), array form.'));
    assert.ok(!jsFinish.includes('fill_special_room('));
    const cMake = makeSource.slice(makeSource.indexOf('makelevel(void)\n{'), makeSource.indexOf('makelevel(void)\n{') + 8500);
    assert.match(cMake, /Fill all special rooms now, regardless[\s\S]*fill_special_room\(&svr\.rooms\[i\]\);/u); // mklev.c1414–1418 common tail.
    const jsMake = js.slice(js.indexOf('async function makelevel('), js.indexOf('// C ref: mklev.c mk_knox_portal()'));
    // Five special-generation returns and the ordinary common tail all fill.
    assert.equal((jsMake.match(/await fillSpecialRooms\(\);/gu) ?? []).length, 6);
    assert.equal((jsMake.match(/await (?:makemaz|specialLevelApi\.finish)\([^;]*;\n\s+await fillSpecialRooms\(\);\n\s+return;/gu) ?? []).length, 5);
    const finalize = js.slice(js.indexOf('export async function lspo_finalize_level('), js.indexOf('async function finishFixupSpecial('));
    assert.ok(finalize.indexOf('level_finalize_topology();') < finalize.indexOf('await fill_special_room(')); // sp_lev.c6055–6059: mineralize first.
});
