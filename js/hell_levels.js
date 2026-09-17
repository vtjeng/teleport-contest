// hell_levels.js -- Gehennom filler-level definitions.
//
// C refs: dat/hellfill.lua, dat/nhlib.lua, mkmaze.c makemaz(), and
// sp_lev.c lspo_level_init()/lspo_terrain().  This file keeps the complete
// hellfill Lua program in source order, including its seven generators and
// prefab helpers.

import { selection_match } from './bigrm.js';
import { Invocation_lev } from './dungeon.js';
import { PM_MINOTAUR } from './monsters.js';
import { ROOM } from './const.js';
import { rn2 } from './rng.js';
import { selection_area, selection_negate, ThemeroomSelection } from './themerooms.js';
import { hellTweaks } from './asmodeus_levels.js';

// C ref: nhlib.lua math.random().  The injected callback has the rn2 shape;
// one-based Lua ranges are translated here so every local random call remains
// independently testable without changing the production RNG owner.
function mathRandom(first, second, random = rn2) {
    if (second === undefined) return 1 + random(first);
    return first + random(second - first + 1);
}

function percent(threshold, random = rn2) {
    return random(100) < threshold;
}

function sourceShuffle(values, random = rn2) {
    // C ref: nhlib.lua shuffle(); Lua's math.random(i) is rn2(i) here.
    for (let i = values.length; i > 1; --i) {
        const j = random(i);
        [values[i - 1], values[j]] = [values[j], values[i - 1]];
    }
    return values;
}

function absoluteArea(x1, y1, x2, y2, frame) {
    const result = new ThemeroomSelection(null, true);
    const xstart = Number.isInteger(frame?.xstart) ? frame.xstart : 1;
    const ystart = Number.isInteger(frame?.ystart) ? frame.ystart : 0;
    for (let x = x1; x <= x2; ++x) {
        for (let y = y1; y <= y2; ++y)
            result.set(xstart + x, ystart + y);
    }
    return result;
}

function mapRows(...rows) {
    return rows.join('\n');
}

// C ref: hellfill.lua hellobjects().  The shuffle and descriptor calls are
// deliberately separate from populatemaze(); both are source entry points.
export async function hellobjects(des, random = rn2) {
    const objclass = ['(', '/', '=', '+', ')', '[', '?', '*', '%'];
    sourceShuffle(objclass, random);
    await des.object(objclass[0]);
    await des.object(objclass[0]);
    await des.object(objclass[1]);
    await des.object(objclass[2]);
    await des.object(objclass[3]);
    await des.object(objclass[4]);
    await des.object();
    await des.object();
}

// C ref: hellfill.lua hellmonsters().
export async function hellmonsters(des, random = rn2) {
    const monclass = ['V', 'D', ' ', '&', 'Z'];
    sourceShuffle(monclass, random);
    await des.monster({ class: monclass[0], peaceful: 0 });
    await des.monster({ class: monclass[0], peaceful: 0 });
    await des.monster({ class: monclass[1], peaceful: 0 });
    await des.monster({ class: monclass[1], peaceful: 0 });
    await des.monster({ class: monclass[2], peaceful: 0 });
    await des.monster({ class: monclass[3], peaceful: 0 });
    await des.monster({ peaceful: 0 });
    await des.monster({ class: 'H', peaceful: 0 });
}

// C ref: hellfill.lua helltraps().
export async function helltraps(des) {
    for (let i = 0; i < 12; ++i) await des.trap();
}

// C ref: dat/hellfill.lua populatemaze().
export async function populatemaze(des, random = rn2) {
    const objectCount = mathRandom(8, undefined, random) + 11;
    for (let i = 0; i < objectCount; ++i) {
        if (percent(50, random)) await des.object('*');
        else await des.object();
    }

    const gemCount = mathRandom(10, undefined, random) + 2;
    for (let i = 0; i < gemCount; ++i) await des.object('`');

    const minotaurCount = mathRandom(3, undefined, random);
    for (let i = 0; i < minotaurCount; ++i)
        await des.monster({ id: PM_MINOTAUR, peaceful: 0 });

    const monsterCount = mathRandom(5, undefined, random) + 7;
    for (let i = 0; i < monsterCount; ++i)
        await des.monster({ peaceful: 0 });

    const goldCount = mathRandom(6, undefined, random) + 7;
    for (let i = 0; i < goldCount; ++i) await des.gold();

    const trapCount = mathRandom(6, undefined, random) + 7;
    for (let i = 0; i < trapCount; ++i) await des.trap();
}

export function rnd_halign(random = rn2) {
    return ['half-left', 'center', 'half-right'][mathRandom(3, undefined, random) - 1];
}

export function rnd_valign(random = rn2) {
    return ['top', 'center', 'bottom'][mathRandom(3, undefined, random) - 1];
}

function prefabMap(des, map, random, options = {}, contents = async () => {}) {
    const positioned = options.x != null || options.y != null
        || options.coord != null;
    const alignment = positioned ? {} : {
        halign: rnd_halign(random),
        valign: 'center',
    };
    return des.map({
        ...alignment,
        ...options,
        map,
        contents,
    });
}

// C ref: dat/hellfill.lua's ten prefab entries.  Prefab contents run while
// des.map's placement frame is active, so every relative coordinate stays in
// the source callback's frame and all calls are awaited in order.
export function makeHellPrefabs(des, state, random = rn2) {
    const prefabs = [
        {
            repeatable: true,
            contents: async () => prefabMap(
                des,
                mapRows(
                    '......', '......', '......', '......',
                    '......', '......', '......', '......',
                    '......', '......', '......', '......',
                    '......', '......', '......', '......',
                ),
                random,
                { valign: 'center' },
            ),
        },
        {
            repeatable: true,
            contents: async () => prefabMap(
                des,
                mapRows(
                    'xxxxxx.....xxxxxx', 'xxxx.........xxxx',
                    'xx.............xx', 'xx.............xx',
                    'x...............x', 'x...............x',
                    '.................', '.................',
                    '.................', '.................',
                    '.................', 'x...............x',
                    'x...............x', 'xx.............xx',
                    'xx.............xx', 'xxxx.........xxxx',
                    'xxxxxx.....xxxxxx',
                ),
                random,
                { valign: 'center' },
            ),
        },
        async (coldhell) => prefabMap(
            des,
            mapRows(
                'xxxxxx.xxxxxx', 'xLLLLLLLLLLLx',
                'xL---------Lx', 'xL|.......|Lx',
                'xL|.......|Lx', '.L|.......|L.',
                'xL|.......|Lx', 'xL|.......|Lx',
                'xL---------Lx', 'xLLLLLLLLLLLx',
                'xxxxxx.xxxxxx',
            ),
            random,
            { valign: rnd_valign(random) },
            async () => {
                await des.non_diggable(selection_area(2, 2, 10, 8));
                await des.region(selection_area(4, 4, 8, 6), 'lit');
                await des.exclusion({ type: 'teleport', region: [2, 2, 10, 8] });
                if (coldhell) {
                    await des.replace_terrain({
                        region: [1, 1, 11, 9],
                        fromterrain: 'L',
                        toterrain: 'P',
                    });
                }
                const dblocs = [
                    { x: 1, y: 5, dir: 'east', state: 'closed' },
                    { x: 11, y: 5, dir: 'west', state: 'closed' },
                    { x: 6, y: 1, dir: 'south', state: 'closed' },
                    { x: 6, y: 9, dir: 'north', state: 'closed' },
                ];
                sourceShuffle(dblocs, random);
                const doorCount = mathRandom(1, dblocs.length, random);
                for (let i = 0; i < doorCount; ++i)
                    await des.drawbridge(dblocs[i]);

                const mons = ['H', 'T', '@'];
                sourceShuffle(mons, random);
                const monsterCount = 3 + mathRandom(1, 5, random);
                for (let i = 0; i < monsterCount; ++i)
                    await des.monster(mons[0], 6, 5);
            },
        ),
        {
            repeatable: true,
            contents: async () => prefabMap(
                des,
                mapRows(
                    '..............................................................',
                    '..............................................................',
                    '..............................................................',
                    '..............................................................',
                    '..............................................................',
                ),
                random,
                { halign: 'center', valign: 'center' },
            ),
        },
        {
            repeatable: true,
            contents: async () => prefabMap(
                des,
                mapRows(
                    'x.....x', '.......', '.......', '.......',
                    '.......', '.......', 'x.....x',
                ),
                random,
                { lit: true, valign: rnd_valign(random) },
            ),
        },
        async () => prefabMap(
            des,
            mapRows(
                'BBBBBBB', 'B.....B', 'B.....B', 'B.....B',
                'B.....B', 'B.....B', 'BBBBBBB',
            ),
            random,
            { valign: rnd_valign(random) },
            async () => {
                await des.region({
                    region: [2, 2, 2, 2],
                    type: 'temple', filled: 1, irregular: 1,
                });
                await des.altar({
                    x: 3, y: 3, align: 'noalign',
                    type: percent(75, random) ? 'altar' : 'shrine',
                });
            },
        ),
        async () => prefabMap(
            des,
            mapRows(
                '..........', '..........', '..........', '...FFFF...',
                '...F..F...', '...F..F...', '...FFFF...',
                '..........', '..........', '..........',
            ),
            random,
            { valign: rnd_valign(random) },
            async () => {
                await des.exclusion({ type: 'teleport', region: [4, 4, 5, 5] });
                const mons = ['Angel', 'D', 'H', 'L'];
                await des.monster(
                    mons[mathRandom(1, mons.length, random) - 1], 4, 4,
                );
            },
        ),
        async () => prefabMap(
            des,
            mapRows(
                '.........', '.}}}}}}}.', '.}}---}}.',
                '.}--.--}.', '.}|...|}.', '.}--.--}.',
                '.}}---}}.', '.}}}}}}}.', '.........',
            ),
            random,
            { valign: rnd_valign(random) },
            async () => {
                await des.exclusion({ type: 'teleport', region: [3, 3, 5, 5] });
                await des.monster('L', 4, 4);
            },
        ),
        async () => {
            const mapstr = percent(30, random)
                ? mapRows('.....', '.LLL.', '.LZL.', '.LLL.', '.....')
                : mapRows('.....', '.PPP.', '.PWP.', '.PPP.', '.....');
            for (let dx = 1; dx <= 5; ++dx) {
                await prefabMap(
                    des, mapstr, random,
                    { x: dx * 14 - 4, y: mathRandom(3, 15, random) },
                );
            }
        },
        {
            repeatable: true,
            contents: async () => {
                const mapstr = mapRows(
                    '...', '...', '...', '...', '...', '...',
                    '...', '...', '...', '...', '...', '...',
                    '...', '...', '...', '...', '...',
                );
                for (let dx = 1; dx <= 3; ++dx) {
                    await prefabMap(
                        des, mapstr, random,
                        { x: mathRandom(3, 75, random), y: 3 },
                    );
                }
            },
        },
    ];
    return prefabs;
}

export async function rnd_hell_prefab(des, state, coldhell, random = rn2) {
    const prefabs = makeHellPrefabs(des, state, random);
    let dorepeat = true;
    let nloops = 0;
    do {
        ++nloops;
        const prefab = prefabs[mathRandom(1, prefabs.length, random) - 1];
        if (typeof prefab === 'function') {
            await prefab(coldhell);
            dorepeat = false;
        } else {
            await prefab.contents(coldhell);
            dorepeat = !(prefab.repeatable
                && mathRandom(0, nloops * 2, random) === 0);
        }
    } while (dorepeat && nloops <= 5);
}

// C ref: dat/hellfill.lua hells[1], mines style with lava.
export async function hell_mines_lava(des, state, random = rn2) {
    await des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    await des.level_flags('mazelevel', 'noflip');
    await des.level_init({
        style: 'mines', fg: '.', smoothed: true, joined: true,
        lit: 0, walled: true,
    });
    await des.replace_terrain({ fromterrain: ' ', toterrain: 'L' });
    await des.replace_terrain({ fromterrain: '.', toterrain: 'L', chance: 5 });
    await des.replace_terrain({ mapfragment: 'w', toterrain: 'L', chance: 20 });
    await des.replace_terrain({ mapfragment: 'w', toterrain: '.', chance: 15 });
}

// C ref: dat/hellfill.lua hells[2]. The bounds selection is absolute in the
// JavaScript selection implementation; absoluteArea mirrors the source's
// selection.fillrect conversion through the active special-level frame.
export async function hell_mazegrid(des, state, random = rn2) {
    await des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    await des.level_flags('mazelevel', 'noflip');
    await des.level_init({ style: 'mazegrid', bg: '-' });
    await des.mazewalk({ coord: [1, 10], dir: 'east', stocked: false });
    const tmpbounds = selection_match('-', state);
    const bnds = tmpbounds.bounds();
    const protectedArea = absoluteArea(
        bnds.lx, bnds.ly + 1, bnds.hx - 2, bnds.hy - 1, des.frame,
    );
    await hellTweaks(des, protectedArea.negate(), state, random);
    if (percent(25, random)) await rnd_hell_prefab(des, state, false, random);
}

// C ref: dat/hellfill.lua hells[3]. The source omits corrwid; that omission
// intentionally lets lspo_level_init/create_maze use its rnd(4) default.
export async function hell_random_corridor_maze(des) {
    await des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    await des.level_flags('mazelevel', 'noflip');
    await des.level_init({ style: 'maze', wallthick: 1 });
}

// C ref: dat/hellfill.lua hells[4].
export async function hell_maze_iron_lava(des, state, random = rn2) {
    const cwid = mathRandom(4, undefined, random);
    await des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    await des.level_flags('mazelevel', 'noflip');
    await des.level_init({ style: 'maze', wallthick: 1, corrwid: cwid });
    const outsideWalls = selection_match(' ', state);
    const wallterrain = ['F', 'L'];
    sourceShuffle(wallterrain, random);
    await des.replace_terrain({ mapfragment: 'w', toterrain: wallterrain[0] });
    if (cwid === 1) {
        if (wallterrain[0] === 'F' && percent(80, random)) {
            await des.replace_terrain({
                mapfragment: '.\nF\n.', toterrain: '.',
                chance: 25 * mathRandom(4, undefined, random),
            });
        } else if (percent(25, random)) {
            await rnd_hell_prefab(des, state, false, random);
        }
    }
    await des.terrain(outsideWalls, ' ');
}

// C ref: dat/hellfill.lua hells[5].
export async function hell_thick_wall_maze(des, state, random = rn2) {
    const wwid = 1 + mathRandom(2, undefined, random);
    await des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    await des.level_flags('mazelevel', 'noflip');
    await des.level_init({
        style: 'maze', wallthick: wwid,
        corrwid: mathRandom(2, undefined, random),
    });
    if (percent(50, random)) {
        const outsideWalls = selection_match(' ', state);
        await des.replace_terrain({ mapfragment: 'w', toterrain: 'L' });
        await des.terrain(outsideWalls, ' ');
        if (wwid === 3 && percent(40, random)) {
            const sel = selection_match('LLL\nLLL\nLLL', state);
            await des.terrain(
                sel.percentage(30 * mathRandom(4, undefined, random), random),
                'Z',
            );
        }
    }
}

// C ref: dat/hellfill.lua hells[6], cold maze with ice and water.
export async function hell_cold_maze(des, state, random = rn2) {
    const cwid = mathRandom(4, undefined, random);
    await des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    await des.level_flags('mazelevel', 'noflip', 'cold');
    await des.level_init({ style: 'maze', wallthick: 1, corrwid: cwid });
    const outsideWalls = selection_match(' ', state);
    const icey = selection_negate()
        .percentage(10, random)
        .grow()
        .filter_mapchar(ROOM, (x, y) => state.level.at(x, y), { random });
    await des.terrain(icey, 'I');
    if (cwid > 1)
        await des.terrain(icey.percentage(1, random), 'W');
    await des.terrain(icey.percentage(5, random), 'P');
    if (percent(25, random)) await des.terrain(selection_match('w', state), 'W');
    if (cwid === 1 && percent(25, random))
        await rnd_hell_prefab(des, state, true, random);
    await des.terrain(outsideWalls, ' ');
}

// C ref: dat/hellfill.lua hells[7].
export async function hell_open_cavern(des, state, random = rn2) {
    const wallTerrain = percent(50, random) ? ' ' : 'L';
    await des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    await des.level_flags('mazelevel', 'noflip');
    await des.level_init({
        style: 'mines', fg: '.', bg: wallTerrain,
        smoothed: true, joined: true, lit: 0,
    });
    const room = selection_match('.', state).grow();
    await des.terrain({ selection: room, typ: '.', lit: 0 });
    const border = new ThemeroomSelection(null, true);
    // selection.rect() is Lua-relative; the active level frame starts at
    // column one, so its 0..78 rectangle paints map columns 1..79.
    for (let x = 1; x <= 79; ++x) {
        border.set(x, 0);
        border.set(x, 20);
    }
    for (let y = 0; y <= 20; ++y) {
        border.set(1, y);
        border.set(79, y);
    }
    await des.terrain({ selection: border, typ: wallTerrain, lit: 0 });
    await des.wallify();
}

export const HELL_GENERATORS = Object.freeze([
    hell_mines_lava,
    hell_mazegrid,
    hell_random_corridor_maze,
    hell_maze_iron_lava,
    hell_thick_wall_maze,
    hell_cold_maze,
    hell_open_cavern,
]);

// C ref: dat/hellfill.lua top-level chunk. The selected generator is followed
// by the common stair/invocation tail and then populatemaze().
export async function hellfill(des, state, random = rn2) {
    const generatorNumber = mathRandom(1, HELL_GENERATORS.length, random);
    await HELL_GENERATORS[generatorNumber - 1](des, state, random);
    await des.stair('up');
    if (Invocation_lev(state.u.uz, state)) await des.trap('vibrating square');
    else await des.stair('down');
    await populatemaze(des, random);
}

export const HELL_LEVEL_LOADERS = Object.freeze({ hellfill });
