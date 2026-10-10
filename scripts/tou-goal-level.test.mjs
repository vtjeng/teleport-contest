import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ROOM, STONE } from '../js/const.js';
import { initRng } from '../js/rng.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { ThemeroomSelection } from '../js/themerooms.js';
import {
    TOU_GOAL_LEVEL_DOORS, TOU_GOAL_LEVEL_MAP, TOU_GOAL_LEVEL_MONSTERS,
} from '../js/tou_goal_level_data.js';
import { extractTouGoalData, renderTouGoalData } from './generate-tou-goal-level.mjs';

const lua = readFileSync('nethack-c/upstream/dat/Tou-goal.lua', 'utf8');
const wizardCommandsC = readFileSync('nethack-c/upstream/src/wizcmds.c', 'utf8');
const teleportC = readFileSync('nethack-c/upstream/src/teleport.c', 'utf8');
const doC = readFileSync('nethack-c/upstream/src/do.c', 'utf8');
const allMainC = readFileSync('nethack-c/upstream/src/allmain.c', 'utf8');
const makeLevelC = readFileSync('nethack-c/upstream/src/mklev.c', 'utf8');
const mazeC = readFileSync('nethack-c/upstream/src/mkmaze.c', 'utf8');
const specialLevelC = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');
const shopkeeperC = readFileSync('nethack-c/upstream/src/shknam.c', 'utf8');
const nhlselC = readFileSync('nethack-c/upstream/src/nhlsel.c', 'utf8');
const wizardCommandsJs = readFileSync('js/wizcmds.js', 'utf8');
const teleportJs = readFileSync('js/teleport.js', 'utf8');
const doJs = readFileSync('js/do.js', 'utf8');
const allMainJs = readFileSync('js/allmain.js', 'utf8');
const makeLevelJs = readFileSync('js/mklev.js', 'utf8');
const shopkeeperJs = readFileSync('js/shknam.js', 'utf8');
const monsterCreateJs = readFileSync('js/makemon_create.js', 'utf8');
const questLevelsJs = readFileSync('js/quest_levels.js', 'utf8');

const fullMap = { lx: 0, ly: 0, hx: 75, hy: 19 };
const area = (lx, ly, hx, hy) => ({ lx, ly, hx, hy });

test('Tou-goal generated data preserves the complete source map and fixed call tables', () => {
    const data = extractTouGoalData(lua);
    assert.deepEqual(data, {
        rows: TOU_GOAL_LEVEL_MAP,
        doors: TOU_GOAL_LEVEL_DOORS,
        monsters: TOU_GOAL_LEVEL_MONSTERS,
    });
    assert.equal(renderTouGoalData(data), readFileSync('js/tou_goal_level_data.js', 'utf8'));
    assert.equal(data.rows.length, 20); // Tou-goal.lua:10-30.
    assert.ok(data.rows.every(row => row.length === 76));
    assert.equal(data.doors.length, 27); // Tou-goal.lua:67-93.
    assert.equal(data.monsters.length, 38); // Tou-goal.lua:117-157.
    assert.equal(data.monsters.filter(([name]) => name === 'giant spider').length, 16);
    assert.equal((lua.match(/^\s*des\.region\(/gmu) ?? []).length, 25);
    assert.equal((lua.match(/^\s*des\.object\(/gmu) ?? []).length, 15);
    assert.equal((lua.match(/^\s*des\.monster\(/gmu) ?? []).length, 38);
});

test('Tou-goal loader preserves every descriptor, source order, and six trap choices', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Tou-goal'], 'function');
    initRng(71_204_193);

    const calls = [];
    const frame = { xstart: 3, ystart: 0 };
    const des = new Proxy({ frame }, {
        get(target, method) {
            if (method in target) return target[method];
            return async (...args) => calls.push({ method, args });
        },
    });
    const state = {
        level: {
            at(x, y) {
                const glyph = TOU_GOAL_LEVEL_MAP[y]?.[x - frame.xstart];
                return glyph == null
                    ? null
                    : { typ: glyph === '.' ? ROOM : STONE, glyph };
            },
        },
    };

    await QUEST_LEVEL_LOADERS['Tou-goal'](des, state);

    assert.deepEqual(calls.map(({ method }) => method), [
        'level_init', 'level_flags', 'map',
        ...Array(25).fill('region'), 'non_diggable', 'stair',
        ...Array(27).fill('door'), 'object', ...Array(14).fill('object'),
        ...Array(6).fill('trap'), ...Array(38).fill('monster'), 'wallify',
    ]); // Whole Tou-goal.lua:7-159 in descriptor order.
    assert.deepEqual(calls.slice(0, 3).map(({ args }) => args), [
        [{ style: 'solidfill', fg: ' ' }], ['mazelevel'], [TOU_GOAL_LEVEL_MAP],
    ]);

    const regions = calls.filter(({ method }) => method === 'region')
        .map(({ args }) => args[0] instanceof ThemeroomSelection
            ? ['selection', args[0].bounds(), args[1]]
            : ['table', args[0]]);
    assert.deepEqual(regions, [
        ['selection', fullMap, 'lit'],
        ['selection', area(1, 1, 9, 2), 'lit'],
        ['table', { region: [1, 4, 9, 5], lit: 1, type: 'barracks', filled: 1 }],
        ['selection', area(1, 7, 2, 10), 'unlit'],
        ['selection', area(7, 7, 9, 10), 'unlit'],
        ['selection', area(1, 14, 2, 15), 'unlit'],
        ['selection', area(7, 14, 9, 15), 'unlit'],
        ['selection', area(1, 17, 2, 18), 'unlit'],
        ['selection', area(7, 17, 9, 18), 'unlit'],
        ['table', { region: [11, 1, 19, 2], lit: 0, type: 'barracks', filled: 1 }],
        ['selection', area(21, 1, 30, 2), 'unlit'],
        ['table', { region: [11, 17, 19, 18], lit: 0, type: 'barracks', filled: 1 }],
        ['selection', area(21, 17, 30, 18), 'unlit'],
        ['selection', area(18, 7, 25, 11), 'lit'],
        ['selection', area(18, 13, 19, 13), 'unlit'],
        ['selection', area(21, 13, 22, 13), 'unlit'],
        ['selection', area(24, 13, 25, 13), 'unlit'],
        ['selection', area(42, 3, 47, 6), 'unlit'],
        ['selection', area(42, 8, 50, 11), 'unlit'],
        ['table', { region: [37, 16, 41, 18], lit: 0, type: 'morgue', filled: 1 }],
        ['selection', area(47, 16, 55, 18), 'unlit'],
        ['selection', area(55, 1, 62, 3), 'unlit'],
        ['selection', area(64, 1, 71, 3), 'unlit'],
        ['table', { region: [60, 14, 71, 15], lit: 1, type: 'shop', filled: 1 }],
        ['table', { region: [60, 17, 71, 18], lit: 1, type: 'shop', filled: 1 }],
    ]); // Tou-goal.lua:33-61.

    assert.deepEqual(calls.find(({ method }) => method === 'non_diggable').args[0].bounds(), fullMap);
    assert.deepEqual(calls.find(({ method }) => method === 'stair').args, ['up', 70, 8]);
    assert.deepEqual(calls.filter(({ method }) => method === 'door')
        .map(({ args }) => args), TOU_GOAL_LEVEL_DOORS);

    const objects = calls.filter(({ method }) => method === 'object');
    assert.equal(objects.length, 15);
    assert.deepEqual(objects[0].args, [{ id: 'credit card', x: 4, y: 1,
        buc: 'blessed', spe: 0, name: 'The Platinum Yendorian Express Card' }]);
    assert.deepEqual(objects.slice(1).map(({ args }) => args),
        Array.from({ length: 14 }, () => [])); // Tou-goal.lua:95-109.

    const traps = calls.filter(({ method }) => method === 'trap')
        .map(({ args }) => args[0]);
    assert.equal(traps.length, 6); // Tou-goal.lua:111-115.
    assert.equal(new Set(traps.map(({ x, y }) => `${x},${y}`)).size, 6);
    for (const { x, y } of traps) {
        assert.equal(TOU_GOAL_LEVEL_MAP[y][x], '.');
        assert.equal(x >= 60 && x <= 71 && y >= 14 && y <= 18, false);
    }

    assert.deepEqual(calls.filter(({ method }) => method === 'monster')
        .map(({ args }) => args), TOU_GOAL_LEVEL_MONSTERS);
    assert.equal(calls.at(-1).method, 'wallify'); // Tou-goal.lua:159.
});

test('Tou-goal selection and natural quest-level caller trace matches upstream dispatch', () => {
    assert.match(lua, /validtraps = validtraps - selection\.area\(60,14,71,18\)/u);
    assert.match(lua, /for i=1,6 do\s*des\.trap\(validtraps:rndcoord\(1\)\)\s*end/u);
    assert.match(nhlselC, /\{ "__sub", l_selection_sub \}/u);
    assert.match(questLevelsJs,
        /const validTraps = l_selection_sub\(\s*floorSquares, selection_area\(60, 14, 71, 18\),\s*\)/u);
    assert.match(questLevelsJs, /validTraps\.rndcoord\(true, rn2\)/u);

    assert.match(wizardCommandsC,
        /wiz_level_tele\(void\)[\s\S]*?if \(wizard\)\s*level_tele\(\)/u);
    assert.match(teleportC, /level_tele\(void\)[\s\S]*?schedule_goto\(/u);
    assert.match(doC,
        /schedule_goto\([\s\S]*?u\.utotype =|schedule_goto\([\s\S]*?u\.utolev/u);
    assert.match(allMainC, /deferred_goto\(\); \/\* after rhack\(\) \*\//u);
    assert.match(doC, /deferred_goto\(void\)[\s\S]*?goto_level\(&dest/u);
    assert.match(doC, /goto_level\([\s\S]*?mklev\(\);/u);
    assert.match(makeLevelC, /mklev\(void\)[\s\S]*?makelevel\(\);/u);
    assert.match(makeLevelC,
        /if \(slev && !Is_rogue_level\(&u\.uz\)\)\s*\{\s*makemaz\(slev->proto\)/u);
    assert.match(mazeC, /makemaz\(const char \*s\)[\s\S]*?load_special\(protofile\)/u);
    assert.match(specialLevelC,
        /load_special\(const char \*name\)[\s\S]*?load_lua\(name, &sbi\)/u);

    assert.match(wizardCommandsJs,
        /export async function wiz_level_tele\([\s\S]*?await level_tele\(state\)/u);
    assert.match(teleportJs,
        /export async function level_tele\([\s\S]*?schedule_goto\(/u);
    assert.match(allMainJs, /await deferred_goto\(state\)/u);
    assert.match(doJs,
        /export async function deferred_goto\([\s\S]*?await goto_level\(/u);
    assert.match(doJs, /export async function goto_level\([\s\S]*?await mklev\(\)/u);
    assert.match(makeLevelJs, /export async function mklev\([\s\S]*?await makelevel\(/u);
    assert.match(makeLevelJs,
        /if \(hasLoader\) \{\s*await makemaz\(slev\.proto, slev, g\);\s*await fillSpecialRooms\(\)/u);
    assert.match(makeLevelJs, /\.\.\.QUEST_LEVEL_LOADERS/u);
    assert.match(questLevelsJs, /'Tou-goal': touGoal/u);

    // The natural makelevel tail fills special rooms after load_special. That
    // source path reaches the already accepted C176 shopkeeper implementation.
    assert.match(makeLevelC, /fill_special_room\(&svr\.rooms\[i\]\)/u);
    assert.match(specialLevelC,
        /fill_special_room\(struct mkroom \*croom\)[\s\S]*?stock_room\(croom->rtype - SHOPBASE, croom\)/u);
    assert.match(shopkeeperC,
        /stock_room\(int shp_indx, struct mkroom \*sroom\)[\s\S]*?shkinit\(shp, sroom\)/u);
    assert.match(shopkeeperJs,
        /function fill_special_room|export function stock_room/u);
});

test('the diagnostic wiz_load_splua caller is separate and retains its shopkeeper gate', () => {
    assert.match(wizardCommandsC,
        /wiz_load_splua\(void\)[\s\S]*?\(void\) load_special\(buf\);\s*lspo_finalize_level\(NULL\)/u);
    assert.match(wizardCommandsJs,
        /export async function wiz_load_splua\([\s\S]*?await \(env\.loadSpecial \?\? load_special\)\(buf, state, levelEnv\);\s*await \(env\.finalizeLevel \?\? lspo_finalize_level\)\(null, levelEnv\)/u);
    assert.match(shopkeeperC,
        /shkinit\(const struct shclass \*shp, struct mkroom \*sroom\)[\s\S]*?makemon\([^;]*MM_ESHK/u);
    assert.match(monsterCreateJs,
        /const shopkeeperCall = \(state\.in_mklev[\s\S]*?if \(\(mmflags & MM_ESHK\) && !shopkeeperCall\)/u);
});
