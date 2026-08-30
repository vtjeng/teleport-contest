// quest_levels.js — Quest special level definitions.
// C refs: dat/Bar-strt.lua, dat/Arc-strt.lua, dat/Pri-strt.lua,
//         dat/oracle.lua, and related quest level files.

import { COLNO, ROWNO } from './const.js';
import { mkclass } from './makemon.js';
import {
    G_IGNORE,
    G_NOGEN,
    NON_PM,
    PM_ACOLYTE,
    PM_ARCH_PRIEST,
    PM_CHIEFTAIN,
    PM_GIANT_EEL,
    PM_HUMAN_ZOMBIE,
    PM_LORD_CARNARVON,
    PM_OGRE,
    PM_ORACLE,
    PM_PELIAS,
    PM_STUDENT,
    PM_WATCHMAN,
    S_CENTAUR,
    S_MUMMY,
    S_SNAKE,
} from './monsters.js';
import {
    BULLWHIP, CHAIN_MAIL, CHEST, FEDORA, MACE, ROBE,
    RUNESWORD, STATUE,
} from './objects.js';
import { rn2, rnd } from './rng.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

// C ref: selvar.c selection_do_randline(). Recursive midpoint displacement
// that draws a random zig-zag path from (x1,y1) to (x2,y2).
function selection_do_randline(x1, y1, x2, y2, rough, rec, sel) {
    if (rec < 1 || (x2 === x1 && y2 === y1))
        return;

    if (rough > Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)))
        rough = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

    let mx, my;
    if (rough < 2) {
        mx = Math.trunc((x1 + x2) / 2);
        my = Math.trunc((y1 + y2) / 2);
    } else {
        do {
            const dx = rn2(rough) - Math.trunc(rough / 2);
            const dy = rn2(rough) - Math.trunc(rough / 2);
            mx = Math.trunc((x1 + x2) / 2) + dx;
            my = Math.trunc((y1 + y2) / 2) + dy;
        } while (mx > COLNO - 1 || mx < 0 || my < 0 || my > ROWNO - 1);
    }

    if (!sel.get(mx, my)) {
        sel.set(mx, my);
    }

    rough = Math.trunc((rough * 2) / 3);
    rec--;

    selection_do_randline(x1, y1, mx, my, rough, rec, sel);
    selection_do_randline(mx, my, x2, y2, rough, rec, sel);

    sel.set(x2, y2);
}

// C ref: nhlsel.c l_selection_randline(). Creates a random path between
// two points with given roughness. Recursion depth fixed at 12.
export function selection_randline(x1, y1, x2, y2, roughness) {
    const sel = new ThemeroomSelection();
    selection_do_randline(x1, y1, x2, y2, roughness, 12, sel);
    return sel;
}

// C ref: selvar.c selection_floodfill(). Flood-fills from (x,y) to all
// connected cells with the same terrain type. Coordinates are map-relative;
// frame converts them to absolute for state.level.at() lookups.
export function selection_floodfill(x, y, state, frame) {
    const ox = frame?.xstart ?? 0;
    const oy = frame?.ystart ?? 0;
    const sel = new ThemeroomSelection();
    const startTyp = state.level.at(ox + x, oy + y)?.typ;
    if (startTyp == null) return sel;

    const stack = [{ x, y }];
    const visited = new ThemeroomSelection();

    while (stack.length > 0) {
        const { x: cx, y: cy } = stack.pop();
        const ax = ox + cx;
        const ay = oy + cy;
        if (ax < 0 || ax >= COLNO || ay < 0 || ay >= ROWNO) continue;
        if (visited.get(cx, cy)) continue;
        visited.set(cx, cy);

        const loc = state.level.at(ax, ay);
        if (!loc || loc.typ !== startTyp) continue;

        sel.set(cx, cy);
        stack.push({ x: cx + 1, y: cy });
        stack.push({ x: cx - 1, y: cy });
        stack.push({ x: cx, y: cy + 1 });
        stack.push({ x: cx, y: cy - 1 });
    }
    return sel;
}

// Intersection of two selections (Lua's & operator).
function selIntersect(a, b) {
    const result = new ThemeroomSelection();
    const boundsA = a.bounds();
    for (let x = boundsA.lx; x <= boundsA.hx; ++x) {
        for (let y = boundsA.ly; y <= boundsA.hy; ++y) {
            if (a.get(x, y) && b.get(x, y)) result.set(x, y);
        }
    }
    return result;
}

// C ref: dat/Bar-strt.lua. The Barbarian quest start level: Pelias's
// besieged encampment behind a river, with forest beyond.
async function barStrt(des, state) {
    const { frame } = des;
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport', 'hardfloor');
    des.map([
        '..................................PP........................................',
        '...................................PP.......................................',
        '...................................PP.......................................',
        '....................................PP......................................',
        '........--------------......-----....PPP....................................',
        '........|...S........|......+...|...PPP.....................................',
        '........|----........|......|...|....PP.....................................',
        '........|.\\..........+......-----...........................................', // eslint-disable-line no-useless-escape
        '........|----........|...............PP.....................................',
        '........|...S........|...-----.......PPP....................................',
        '........--------------...+...|......PPPPP...................................',
        '.........................|...|.......PPP....................................',
        '...-----......-----......-----........PP....................................',
        '...|...+......|...+..--+--.............PP...................................',
        '...|...|......|...|..|...|..............PP..................................',
        '...-----......-----..|...|.............PPPP.................................',
        '.....................-----............PP..PP................................',
        '.....................................PP...PP................................',
        '....................................PP...PP.................................',
        '....................................PP....PP................................',
    ]);

    // the forest beyond the river
    des.replace_terrain({
        region: [37, 0, 59, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 5,
    });
    des.replace_terrain({
        region: [60, 0, 64, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 10,
    });
    des.replace_terrain({
        region: [65, 0, 75, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 20,
    });

    // guarantee a path and free spot for the portal
    des.terrain(selection_randline(37, 7, 62, 2, 7), '.');
    des.terrain(62, 2, '.');

    // Dungeon Description
    des.region(selection_area(0, 0, 75, 19), 'lit');
    des.region(selection_area(9, 5, 11, 5), 'unlit');
    des.region(selection_area(9, 7, 11, 7), 'lit');
    des.region(selection_area(9, 9, 11, 9), 'unlit');
    des.region(selection_area(13, 5, 20, 9), 'lit');
    des.region(selection_area(29, 5, 31, 6), 'lit');
    des.region(selection_area(26, 10, 28, 11), 'lit');
    des.region(selection_area(4, 13, 6, 14), 'lit');
    des.region(selection_area(15, 13, 17, 14), 'lit');
    des.region(selection_area(22, 14, 24, 15), 'lit');

    // Stairs
    des.stair({ dir: 'down', coord: [9, 9] });

    // Portal arrival point
    des.levregion({ region: [62, 2, 62, 2], type: 'branch' });

    // Doors
    des.door({ state: 'locked', coord: [12, 5] });
    des.door({ state: 'locked', coord: [12, 9] });
    des.door({ state: 'closed', coord: [21, 7] });
    des.door({ state: 'open', coord: [7, 13] });
    des.door({ state: 'open', coord: [18, 13] });
    des.door({ state: 'open', coord: [23, 13] });
    des.door({ state: 'open', coord: [25, 10] });
    des.door({ state: 'open', coord: [28, 5] });

    // Elder
    des.monster({
        id: PM_PELIAS,
        coord: [10, 7],
        inventory() {
            des.object({ id: RUNESWORD, spe: 5 });
            des.object({ id: CHAIN_MAIL, spe: 5 });
        },
    });

    // The treasure of Pelias
    des.object({ id: CHEST, coord: [9, 5] });

    // chieftain guards for the audience chamber
    des.monster({ id: PM_CHIEFTAIN, coord: [10, 5] });
    des.monster({ id: PM_CHIEFTAIN, coord: [10, 9] });
    des.monster({ id: PM_CHIEFTAIN, coord: [11, 5] });
    des.monster({ id: PM_CHIEFTAIN, coord: [11, 9] });
    des.monster({ id: PM_CHIEFTAIN, coord: [14, 5] });
    des.monster({ id: PM_CHIEFTAIN, coord: [14, 9] });
    des.monster({ id: PM_CHIEFTAIN, coord: [16, 5] });
    des.monster({ id: PM_CHIEFTAIN, coord: [16, 9] });

    // Non diggable walls
    des.non_diggable(selection_area(0, 0, 75, 19));

    // One trap to keep the ogres at bay.
    des.trap({ type: 'spiked pit', coord: [37, 7] });

    // Eels in the river
    des.monster({ id: PM_GIANT_EEL, coord: [36, 1] });
    des.monster({ id: PM_GIANT_EEL, coord: [37, 9] });
    des.monster({ id: PM_GIANT_EEL, coord: [39, 15] });

    // Monsters on siege duty.
    const ogrelocs = selIntersect(
        selection_floodfill(37, 7, state, frame),
        selection_area(40, 3, 45, 20),
    );
    for (let i = 0; i < 12; i++) {
        const pos = ogrelocs.rndcoord(true);
        des.monster({
            id: PM_OGRE,
            coord: [pos.x, pos.y],
            peaceful: 0,
        });
    }
}

// C ref: dat/oracle.lua. Room-based special level: six rooms connected by
// random corridors. The first room is the Oracle's chamber with 8 centaur
// statues and a delphi sub-room containing 4 fountains.
async function oracle(des, state) {
    des.level_flags('noflip');

    des.room({
        type: 'ordinary', lit: 1, x: 3, y: 3,
        xalign: 'center', yalign: 'center', w: 11, h: 9,
        contents() {
            // 8 centaur statues at corners, edges, and midsections.
            // C ref: lspo_object() resolves montype "C" via
            // mkclass(def_char_to_monclass('C'), G_NOGEN|G_IGNORE).
            for (const [sx, sy] of [
                [0, 0], [0, 8], [10, 0], [10, 8],
                [5, 1], [5, 7], [2, 4], [8, 4],
            ]) {
                const species = mkclass(S_CENTAUR, G_NOGEN | G_IGNORE, {
                    state, random: { rn2, rnd },
                });
                des.object({
                    id: STATUE, coord: [sx, sy],
                    montype: species ? species.pmidx : NON_PM,
                    historic: true,
                });
            }

            // Delphi sub-room with 4 fountains and the Oracle
            des.room({
                type: 'delphi', lit: 1, x: 4, y: 3, w: 3, h: 3,
                contents() {
                    des.feature('fountain', 0, 1);
                    des.feature('fountain', 1, 0);
                    des.feature('fountain', 1, 2);
                    des.feature('fountain', 2, 1);
                    des.monster({ id: PM_ORACLE, coord: [1, 1] });
                    des.door({ state: 'nodoor', wall: 'all' });
                },
            });

            des.monster();
            des.monster();
        },
    });

    des.room({ contents() {
        des.stair('up');
        des.object();
    }});

    des.room({ contents() {
        des.stair('down');
        des.object();
        des.trap();
        des.monster();
        des.monster();
    }});

    des.room({ contents() {
        des.object();
        des.object();
        des.monster();
    }});

    des.room({ contents() {
        des.object();
        des.trap();
        des.monster();
    }});

    des.room({ contents() {
        des.object();
        des.trap();
        des.monster();
    }});

    des.random_corridors();
}

// C ref: dat/Arc-strt.lua. Map-based quest start level for the Archeologist.
// Lord Carnarvon's besieged compound behind a moat, with snakes and mummies.
async function arcStrt(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport', 'hardfloor');
    des.map([
        '............................................................................',
        '............................................................................',
        '............................................................................',
        '............................................................................',
        '....................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.................', // eslint-disable-line no-useless-escape
        '....................}-------------------------------------}.................', // eslint-disable-line no-useless-escape
        '....................}|..S......+.................+.......|}.................', // eslint-disable-line no-useless-escape
        '....................}-S---------------+----------|.......|}.................', // eslint-disable-line no-useless-escape
        '....................}|.|...............|.......+.|.......|}.................', // eslint-disable-line no-useless-escape
        '....................}|.|...............---------.---------}.................', // eslint-disable-line no-useless-escape
        '....................}|.S.\\.............+.................+..................', // eslint-disable-line no-useless-escape
        '....................}|.|...............---------.---------}.................', // eslint-disable-line no-useless-escape
        '....................}|.|...............|.......+.|.......|}.................', // eslint-disable-line no-useless-escape
        '....................}-S---------------+----------|.......|}.................', // eslint-disable-line no-useless-escape
        '....................}|..S......+.................+.......|}.................', // eslint-disable-line no-useless-escape
        '....................}-------------------------------------}.................', // eslint-disable-line no-useless-escape
        '....................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.................', // eslint-disable-line no-useless-escape
        '............................................................................',
        '............................................................................',
        '............................................................................',
    ]);

    // Dungeon Description
    des.region(selection_area(0, 0, 75, 19), 'lit');
    des.region(selection_area(22, 6, 23, 6), 'unlit');
    des.region(selection_area(25, 6, 30, 6), 'unlit');
    des.region(selection_area(32, 6, 48, 6), 'unlit');
    des.region(selection_area(50, 6, 56, 8), 'lit');
    des.region(selection_area(40, 8, 46, 8), 'unlit');
    des.region(selection_area(22, 8, 22, 12), 'unlit');
    des.region(selection_area(24, 8, 38, 12), 'unlit');
    des.region(selection_area(48, 8, 48, 8), 'lit');
    des.region(selection_area(40, 10, 56, 10), 'lit');
    des.region(selection_area(48, 12, 48, 12), 'lit');
    des.region(selection_area(40, 12, 46, 12), 'unlit');
    des.region(selection_area(50, 12, 56, 14), 'lit');
    des.region(selection_area(22, 14, 23, 14), 'unlit');
    des.region(selection_area(25, 14, 30, 14), 'unlit');
    des.region(selection_area(32, 14, 48, 14), 'unlit');

    // Stairs
    des.stair({ dir: 'down', coord: [55, 7] });

    // Portal arrival point
    des.levregion({ region: [63, 6, 63, 6], type: 'branch' });

    // Doors
    des.door({ state: 'closed', coord: [22, 7] });
    des.door({ state: 'closed', coord: [38, 7] });
    des.door({ state: 'locked', coord: [47, 8] });
    des.door({ state: 'locked', coord: [23, 10] });
    des.door({ state: 'locked', coord: [39, 10] });
    des.door({ state: 'locked', coord: [57, 10] });
    des.door({ state: 'locked', coord: [47, 12] });
    des.door({ state: 'closed', coord: [22, 13] });
    des.door({ state: 'closed', coord: [38, 13] });
    des.door({ state: 'locked', coord: [24, 14] });
    des.door({ state: 'closed', coord: [31, 14] });
    des.door({ state: 'locked', coord: [49, 14] });

    // Lord Carnarvon
    des.monster({
        id: PM_LORD_CARNARVON,
        coord: [25, 10],
        inventory() {
            des.object({ id: FEDORA, spe: 5 });
            des.object({ id: BULLWHIP, spe: 4 });
        },
    });

    // The treasure of Lord Carnarvon
    des.object({ id: CHEST, coord: [25, 10] });

    // student guards for the audience chamber
    des.monster({ id: PM_STUDENT, coord: [26, 9] });
    des.monster({ id: PM_STUDENT, coord: [27, 9] });
    des.monster({ id: PM_STUDENT, coord: [28, 9] });
    des.monster({ id: PM_STUDENT, coord: [26, 10] });
    des.monster({ id: PM_STUDENT, coord: [28, 10] });
    des.monster({ id: PM_STUDENT, coord: [26, 11] });
    des.monster({ id: PM_STUDENT, coord: [27, 11] });
    des.monster({ id: PM_STUDENT, coord: [28, 11] });

    // city watch guards in the antechambers
    des.monster({ id: PM_WATCHMAN, coord: [50, 6] });
    des.monster({ id: PM_WATCHMAN, coord: [50, 14] });

    // Eels in the moat
    des.monster({ id: PM_GIANT_EEL, coord: [20, 10] });
    des.monster({ id: PM_GIANT_EEL, coord: [45, 4] });
    des.monster({ id: PM_GIANT_EEL, coord: [33, 16] });

    // Non diggable walls
    des.non_diggable(selection_area(0, 0, 75, 19));

    // Random traps
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();

    // Monsters on siege duty (S = snake class, M = mummy class)
    des.monster({ class: S_SNAKE, coord: [60, 9] });
    des.monster({ class: S_MUMMY, coord: [60, 10] });
    des.monster({ class: S_SNAKE, coord: [60, 11] });
    des.monster({ class: S_SNAKE, coord: [60, 12] });
    des.monster({ class: S_MUMMY, coord: [60, 13] });
    des.monster({ class: S_SNAKE, coord: [61, 10] });
    des.monster({ class: S_SNAKE, coord: [61, 11] });
    des.monster({ class: S_SNAKE, coord: [61, 12] });
    des.monster({ class: S_SNAKE, coord: [30, 3] });
    des.monster({ class: S_MUMMY, coord: [20, 17] });
    des.monster({ class: S_SNAKE, coord: [67, 2] });
    des.monster({ class: S_SNAKE, coord: [10, 19] });
}

// C ref: dat/Pri-strt.lua. Map-based quest start level for the Priest.
// The Arch Priest's besieged temple with corridors, human zombies outside.
async function priStrt(des, state) {
    const { frame } = des;
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport', 'hardfloor');
    des.map([
        '............................................................................',
        '............................................................................',
        '............................................................................',
        '....................------------------------------------....................', // eslint-disable-line no-useless-escape
        '....................|................|.....|.....|.....|....................', // eslint-disable-line no-useless-escape
        '....................|..------------..|--+-----+-----+--|....................', // eslint-disable-line no-useless-escape
        '....................|..|..........|..|.................|....................', // eslint-disable-line no-useless-escape
        '....................|..|..........|..|+---+---+-----+--|....................', // eslint-disable-line no-useless-escape
        '..................---..|..........|......|...|...|.....|....................', // eslint-disable-line no-useless-escape
        '..................+....|..........+......|...|...|.....|....................', // eslint-disable-line no-useless-escape
        '..................+....|..........+......|...|...|.....|....................', // eslint-disable-line no-useless-escape
        '..................---..|..........|......|...|...|.....|....................', // eslint-disable-line no-useless-escape
        '....................|..|..........|..|+-----+---+---+--|....................', // eslint-disable-line no-useless-escape
        '....................|..|..........|..|.................|....................', // eslint-disable-line no-useless-escape
        '....................|..------------..|--+-----+-----+--|....................', // eslint-disable-line no-useless-escape
        '....................|................|.....|.....|.....|....................', // eslint-disable-line no-useless-escape
        '....................------------------------------------....................', // eslint-disable-line no-useless-escape
        '............................................................................',
        '............................................................................',
        '............................................................................',
    ]);

    // Dungeon Description
    des.region(selection_area(0, 0, 75, 19), 'lit');
    des.region({ region: [24, 6, 33, 13], lit: 1, type: 'temple', filled: 2 });

    des.replace_terrain({
        region: [0, 0, 10, 19],
        fromterrain: '.', toterrain: 'T', chance: 10,
    });
    des.replace_terrain({
        region: [65, 0, 75, 19],
        fromterrain: '.', toterrain: 'T', chance: 10,
    });
    des.terrain(5, 4, '.');

    const spacelocs = selection_floodfill(5, 4, state, frame);

    // Portal arrival point
    des.levregion({ region: [5, 4, 5, 4], type: 'branch' });

    // Stairs
    des.stair({ dir: 'down', coord: [52, 9] });

    // Doors
    des.door({ state: 'locked', coord: [18, 9] });
    des.door({ state: 'locked', coord: [18, 10] });
    des.door({ state: 'closed', coord: [34, 9] });
    des.door({ state: 'closed', coord: [34, 10] });
    des.door({ state: 'closed', coord: [40, 5] });
    des.door({ state: 'closed', coord: [46, 5] });
    des.door({ state: 'closed', coord: [52, 5] });
    des.door({ state: 'locked', coord: [38, 7] });
    des.door({ state: 'closed', coord: [42, 7] });
    des.door({ state: 'closed', coord: [46, 7] });
    des.door({ state: 'closed', coord: [52, 7] });
    des.door({ state: 'locked', coord: [38, 12] });
    des.door({ state: 'closed', coord: [44, 12] });
    des.door({ state: 'closed', coord: [48, 12] });
    des.door({ state: 'closed', coord: [52, 12] });
    des.door({ state: 'closed', coord: [40, 14] });
    des.door({ state: 'closed', coord: [46, 14] });
    des.door({ state: 'closed', coord: [52, 14] });

    // Unattended Altar - unaligned due to conflict
    des.altar({ x: 28, y: 9, align: 'noalign', type: 'altar' });

    // Arch Priest
    des.monster({
        id: PM_ARCH_PRIEST,
        coord: [28, 10],
        inventory() {
            des.object({ id: ROBE, spe: 4 });
            des.object({ id: MACE, spe: 4 });
        },
    });

    // The treasure of Arch Priest
    des.object({ id: CHEST, coord: [27, 10] });

    // acolyte guards for the audience chamber
    des.monster({ id: PM_ACOLYTE, coord: [32, 7] });
    des.monster({ id: PM_ACOLYTE, coord: [32, 8] });
    des.monster({ id: PM_ACOLYTE, coord: [32, 11] });
    des.monster({ id: PM_ACOLYTE, coord: [32, 12] });
    des.monster({ id: PM_ACOLYTE, coord: [33, 7] });
    des.monster({ id: PM_ACOLYTE, coord: [33, 8] });
    des.monster({ id: PM_ACOLYTE, coord: [33, 11] });
    des.monster({ id: PM_ACOLYTE, coord: [33, 12] });

    // Non diggable walls
    des.non_diggable(selection_area(18, 3, 55, 16));

    // Random traps — 2 dart traps in the open area, 4 random
    for (let i = 0; i < 2; i++) {
        const pos = spacelocs.rndcoord(true);
        des.trap({ type: 'dart', coord: [pos.x, pos.y] });
    }
    des.trap();
    des.trap();
    des.trap();
    des.trap();

    // Monsters on siege duty — human zombies in the open area
    for (let i = 0; i < 12; i++) {
        const pos = spacelocs.rndcoord(true);
        des.monster({ id: PM_HUMAN_ZOMBIE, coord: [pos.x, pos.y] });
    }
}

export const QUEST_LEVEL_LOADERS = {
    'Bar-strt': barStrt,
    'Arc-strt': arcStrt,
    'Pri-strt': priStrt,
    oracle,
};
