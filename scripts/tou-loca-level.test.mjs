import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ROOM, STONE } from '../js/const.js';
import { initRng } from '../js/rng.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { TOU_LOCA_DOORS, TOU_LOCA_LEVEL_MAP } from '../js/tou_loca_level_data.js';
import { extractTouLocaData, renderTouLocaData } from './generate-tou-loca-level.mjs';

const lua = readFileSync('nethack-c/upstream/dat/Tou-loca.lua', 'utf8');
const nhlselC = readFileSync('nethack-c/upstream/src/nhlsel.c', 'utf8');
const shknamC = readFileSync('nethack-c/upstream/src/shknam.c', 'utf8');
const specialLevelC = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');
const makeLevelC = readFileSync('nethack-c/upstream/src/mklev.c', 'utf8');
const mazeC = readFileSync('nethack-c/upstream/src/mkmaze.c', 'utf8');
const wizardCommandsC = readFileSync('nethack-c/upstream/src/wizcmds.c', 'utf8');
const questLevelsJs = readFileSync('js/quest_levels.js', 'utf8');
const shknamJs = readFileSync('js/shknam.js', 'utf8');
const makeLevelJs = readFileSync('js/mklev.js', 'utf8');
const wizardCommandsJs = readFileSync('js/wizcmds.js', 'utf8');

test('Tou-loca generated map and door tables retain every Lua cell and fixed door', () => {
    const data = extractTouLocaData(lua);
    assert.deepEqual(data, { rows: TOU_LOCA_LEVEL_MAP, doors: TOU_LOCA_DOORS });
    assert.equal(renderTouLocaData(data), readFileSync('js/tou_loca_level_data.js', 'utf8'));
    assert.equal(data.rows.length, 20); // Tou-loca.lua:8–27.
    assert.ok(data.rows.every(row => row.length === 76)); // Walls and trailing cells included.
    assert.equal(data.doors.length, 35); // Tou-loca.lua:69–103.
    assert.equal(data.doors.filter(([state]) => state === 'locked').length, 4);
});

test('Tou-loca operators and natural shop fill trace to their C callers', () => {
    assert.match(wizardCommandsC, /wiz_level_tele\(void\)[\s\S]*?if \(wizard\)\s*level_tele\(\)/u);
    assert.match(wizardCommandsJs, /export async function wiz_level_tele\([\s\S]*?await level_tele\(state\)/u);
    assert.match(makeLevelC, /makelevel\(void\)[\s\S]*?if \(slev && !Is_rogue_level\(&u\.uz\)\)\s*\{\s*makemaz\(slev->proto\)/u);
    assert.match(mazeC, /makemaz\(const char \*s\)[\s\S]*?if \(load_special\(protofile\)\)/u);
    assert.match(makeLevelJs, /const \{ QUEST_LEVEL_LOADERS \} = await import\('\.\/quest_levels\.js'\)/u);
    assert.match(makeLevelJs, /\.\.\.QUEST_LEVEL_LOADERS/u);
    assert.match(nhlselC, /\{ "__bor", l_selection_or \}[\s\S]*?\{ "__add", l_selection_or \}[\s\S]*?\{ "__sub", l_selection_sub \}/u);
    assert.match(lua, /validtraps = validtraps - \(selection\.area\(15,03,20,05\) \+ selection\.area\(62,03,71,04\)\)/u);
    assert.match(questLevelsJs, /const validTraps = l_selection_sub\(floorSquares, shops\)/u);
    assert.match(questLevelsJs, /const shops = l_selection_or\([\s\S]*?selection_area\(62, 3, 71, 4\)/u);

    assert.match(shknamC, /if \(MON_AT\(sx, sy\)\)\s*\(void\) rloc\(m_at\(sx, sy\), RLOC_NOMSG\);/u);
    assert.match(shknamC, /if \(\(sh = shkinit\(shp, sroom\)\) < 0\)/u);
    assert.match(specialLevelC, /fill_special_room\(struct mkroom \*croom\)[\s\S]*?stock_room\(croom->rtype - SHOPBASE, croom\)/u);
    assert.match(makeLevelC, /makelevel\(void\)[\s\S]*?fill_special_room\(&svr\.rooms\[i\]\)/u);
    assert.match(shknamJs, /const occupant = m_at\(placement\.sx, placement\.sy, state\);\s*if \(occupant\) rloc\(occupant, RLOC_NOMSG, normalized\);/u);
    assert.match(makeLevelJs, /const fillSpecialRooms = async \(\) => \{[\s\S]*?await fill_special_room\(g\.level\.rooms\[i\], env\)/u);
});

test('Tou-loca loader preserves every descriptor and selection-driven trap choice in source order', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Tou-loca'], 'function');
    initRng(71_204_189);
    const calls = [];
    const frame = { xstart: 2, ystart: 0 };
    const des = new Proxy({ frame }, {
        get(target, method) {
            if (method in target) return target[method];
            return async (...args) => calls.push({ method, args });
        },
    });
    const state = {
        level: {
            at(x, y) {
                const glyph = TOU_LOCA_LEVEL_MAP[y]?.[x - frame.xstart];
                return { typ: glyph === '.' ? ROOM : STONE, glyph };
            },
        },
    };

    await QUEST_LEVEL_LOADERS['Tou-loca'](des, state);

    assert.deepEqual(calls.map(call => call.method), [
        'level_init', 'level_flags', 'map', 'region', 'non_diggable',
        ...Array(34).fill('region'), 'stair', 'stair', 'non_diggable',
        ...Array(35).fill('door'), ...Array(16).fill('object'),
        ...Array(9).fill('trap'), ...Array(18).fill('monster'),
    ]); // Whole Tou-loca.lua:5–153, including deferred room setup calls.
    assert.deepEqual(calls.slice(0, 3).map(call => call.args), [
        [{ style: 'solidfill', fg: ' ' }], ['mazelevel', 'hardfloor'],
        [TOU_LOCA_LEVEL_MAP],
    ]);

    const regions = calls.filter(call => call.method === 'region');
    assert.deepEqual([regions[0].args[0].bounds(), regions[0].args[1]], [
        { lx: 0, ly: 0, hx: 75, hy: 19 }, 'lit',
    ]); // Lua35 lights the entire mapped rectangle.
    assert.deepEqual(regions.slice(1, 9).map(call => call.args[0]), [
        { region: [1, 1, 4, 5], lit: 0, type: 'morgue', filled: 1 },
        { region: [15, 3, 20, 5], lit: 1, type: 'shop', filled: 1 },
        { region: [62, 3, 71, 4], lit: 1, type: 'shop', filled: 1 },
        { region: [1, 17, 11, 18], lit: 1, type: 'barracks', filled: 1 },
        { region: [12, 9, 20, 10], lit: 1, type: 'barracks', filled: 1 },
        { region: [53, 11, 59, 14], lit: 1, type: 'zoo', filled: 1 },
        { region: [63, 14, 72, 16], lit: 1, type: 'barracks', filled: 1 },
        { region: [32, 14, 40, 16], lit: 1, type: 'temple', filled: 1 },
    ]); // Lua39–46: filled rooms retain source order.
    const selectionRegions = regions.filter(call => call.args[0]?.bounds);
    assert.deepEqual(selectionRegions.slice(1).map(call => [call.args[0].bounds(), call.args[1]]), [
        [{ lx: 73, ly: 5, hx: 74, hy: 5 }, 'unlit'],
        [{ lx: 35, ly: 11, hx: 36, hy: 12 }, 'lit'],
    ]); // Lua55 and 64 use local lighting selections.

    assert.deepEqual(calls.filter(call => call.method === 'stair').map(call => call.args), [
        ['up', 10, 4], ['down', 73, 5],
    ]); // Lua65–66.
    const nondiggable = calls.filter(call => call.method === 'non_diggable');
    assert.equal(nondiggable.length, 2); // Lua36 and 68 repeat the full-map call.
    assert.ok(nondiggable.every(call => call.args[0].bounds().hx === 75));
    assert.deepEqual(calls.filter(call => call.method === 'door').map(call => call.args), TOU_LOCA_DOORS);

    const objects = calls.filter(call => call.method === 'object');
    assert.deepEqual(objects.slice(0, 14).map(call => call.args), Array.from({ length: 14 }, () => []));
    assert.deepEqual(objects.slice(14).map(call => call.args), [
        ['blank paper', 71, 12], ['blank paper', 71, 12],
    ]); // Lua106–121.

    const traps = calls.filter(call => call.method === 'trap').map(call => call.args[0]);
    assert.equal(traps.length, 9); // Lua124–134.
    assert.equal(new Set(traps.map(({ x, y }) => `${x},${y}`)).size, 9);
    for (const { x, y } of traps) {
        assert.equal(TOU_LOCA_LEVEL_MAP[y][x], '.');
        assert.equal(x >= 15 && x <= 20 && y >= 3 && y <= 5, false);
        assert.equal(x >= 62 && x <= 71 && y >= 3 && y <= 4, false);
    }

    assert.deepEqual(calls.filter(call => call.method === 'monster').map(call => call.args), [
        ...Array(16).fill(['giant spider']), ['s'], ['s'],
    ]); // Lua137–153.
});
