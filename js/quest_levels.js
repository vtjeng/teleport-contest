// quest_levels.js — Quest and special level definitions.
// C refs: dat/Bar-strt.lua, dat/Bar-fila.lua, dat/Bar-filb.lua,
//         dat/Bar-goal.lua, dat/Bar-loca.lua, dat/Arc-strt.lua,
//         dat/Pri-strt.lua, dat/Pri-loca.lua, dat/Pri-fila.lua,
//         dat/Pri-filb.lua, dat/oracle.lua, dat/tower1.lua.

import { COLNO, FEMALE, G_GENOD, ROWNO } from './const.js';
import { mkclass } from './makemon.js';
import {
    G_IGNORE,
    G_NOGEN,
    NON_PM,
    PM_ACOLYTE,
    PM_ALIGNED_CLERIC,
    PM_ARCH_PRIEST,
    PM_CHIEFTAIN,
    PM_GIANT_EEL,
    PM_HUMAN_ZOMBIE,
    PM_LORD_CARNARVON,
    PM_OGRE,
    PM_ORACLE,
    PM_PELIAS,
    PM_ROCK_TROLL,
    PM_STUDENT,
    PM_THOTH_AMON,
    PM_VAMPIRE,
    PM_VAMPIRE_LEADER,
    PM_VLAD_THE_IMPALER,
    PM_WATCHMAN,
    PM_WRAITH,
    S_CENTAUR,
    S_MUMMY,
    S_OGRE,
    S_SNAKE,
    S_TROLL,
    S_VAMPIRE,
} from './monsters.js';
import {
    BULLWHIP, CHAIN_MAIL, CHEST, FEDORA, LUCKSTONE, MACE, ROBE,
    RUNESWORD, STATUE, TALLOW_CANDLE, WAX_CANDLE,
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
        '........|.\\..........+......-----...........................................',  
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

// C ref: dat/Bar-fila.lua. Mines-style filler level for quest levels above
// Bar-loca: cave terrain with stairs, random objects, traps, and a few
// ogres and a rock troll.
async function barFila(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.level_init({
        style: 'mines', fg: '.', bg: '.',
        smoothed: true, joined: true, lit: 0, walled: false,
    });

    des.stair('up');
    des.stair('down');

    for (let i = 0; i < 8; i++) des.object();
    for (let i = 0; i < 4; i++) des.trap();

    des.monster({ id: PM_OGRE, peaceful: 0 });
    des.monster({ id: PM_OGRE, peaceful: 0 });
    des.monster({ class: S_OGRE, peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
}

// C ref: dat/Bar-filb.lua. Mines-style filler level for quest levels at or
// below Bar-loca: walled cave terrain with more ogres and trolls.
async function barFilb(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noflip');
    des.level_init({
        style: 'mines', fg: '.', bg: ' ',
        smoothed: true, joined: true, lit: 0, walled: true,
    });

    des.stair('up');
    des.stair('down');

    for (let i = 0; i < 11; i++) des.object();
    for (let i = 0; i < 4; i++) des.trap();

    for (let i = 0; i < 7; i++)
        des.monster({ id: PM_OGRE, peaceful: 0 });
    des.monster({ class: S_OGRE, peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    des.monster({ class: S_TROLL, peaceful: 0 });
}

// C ref: dat/Bar-goal.lua. Map-based barbarian quest goal level: irregular
// cave with Thoth Amon guarding the Heart of Ahriman on an altar, many
// ogres and rock trolls.
async function barGoal(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel');
    des.map([
        '                                                                            ',
        '                               .............                                ',
        '                             ..................                             ',
        '        ....              .........................          ....           ',
        '      .......          ..........................           .......         ',
        '      ......             ........................          .......          ',
        '      ..  ......................................             ..             ',
        '       ..                 .....................             ..              ',
        '        ..                 ..................              ..               ',
        '         ..         ..S...S..............   ................                ',
        '          ..                   ........                ...                  ',
        '       .........                                         ..                 ',
        '       ......  ..                                         ...  ....         ',
        '      .. ...    ..                             ......       ........        ',
        '   ....          .. ..................        ........       ......         ',
        '  ......          ......................       ......         ..            ',
        '   ....             ..................              ...........             ',
        '                      ..............                                        ',
        '                        ...........                                         ',
        '                                                                            ',
    ]);

    // Dungeon Description
    des.region(selection_area(0, 0, 75, 19), 'unlit');

    // Secret doors
    des.door({ state: 'locked', coord: [22, 9] });
    des.door({ state: 'locked', coord: [26, 9] });

    // Stairs
    des.stair({ dir: 'up', coord: [36, 5] });

    // The altar. Unattended.
    des.altar({ x: 63, y: 4, align: 'noncoaligned', type: 'altar' });

    des.non_diggable(selection_area(0, 0, 75, 19));

    // Objects — The Heart of Ahriman and 14 random
    des.object({
        id: LUCKSTONE, coord: [63, 4],
        buc: 'blessed', spe: 0, name: 'The Heart of Ahriman',
    });
    for (let i = 0; i < 14; i++) des.object();

    // Random traps
    for (let i = 0; i < 6; i++) des.trap();

    // Random monsters
    des.monster({ id: PM_THOTH_AMON, coord: [63, 4], peaceful: 0 });
    for (let i = 0; i < 16; i++)
        des.monster({ id: PM_OGRE, peaceful: 0 });
    des.monster({ class: S_OGRE, peaceful: 0 });
    des.monster({ class: S_OGRE, peaceful: 0 });
    for (let i = 0; i < 8; i++)
        des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    des.monster({ class: S_TROLL, peaceful: 0 });

    des.wallify();
}

// C ref: dat/Bar-loca.lua. Map-based barbarian quest locate level: a swamp
// path with pools, buildings, and many ogres and trolls.
async function barLoca(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'hardfloor');
    des.map([
        '..........PPP.........................................                      ',
        '...........PP..........................................        .......      ',
        '..........PP...........-----..........------------------     ..........     ',
        '...........PP..........+...|..........|....S...........|..  ............    ',
        '..........PPP..........|...|..........|-----...........|...  .............  ',
        '...........PPP.........-----..........+....+...........|...  .............  ',
        '..........PPPPPPPPP...................+....+...........S.................   ',
        '........PPPPPPPPPPPPP.........-----...|-----...........|................    ',
        '......PPPPPPPPPPPPPP..P.......+...|...|....S...........|          ...       ',
        '.....PPPPPPP......P..PPPP.....|...|...------------------..         ...      ',
        '....PPPPPPP.........PPPPPP....-----........................      ........   ',
        '...PPPPPPP..........PPPPPPP..................................   ..........  ',
        '....PPPPPPP........PPPPPPP....................................  ..........  ',
        '.....PPPPP........PPPPPPP.........-----........................   ........  ',
        '......PPP..PPPPPPPPPPPP...........+...|.........................    .....   ',
        '..........PPPPPPPPPPP.............|...|.........................     ....   ',
        '..........PPPPPPPPP...............-----.........................       .    ',
        '..............PPP.................................................          ',
        '...............PP....................................................       ',
        '................PPP...................................................      ',
    ]);

    // Dungeon Description
    des.region(selection_area(0, 0, 75, 19), 'lit');
    des.region(selection_area(24, 3, 26, 4), 'unlit');
    des.region(selection_area(31, 8, 33, 9), 'unlit');
    des.region(selection_area(35, 14, 37, 15), 'unlit');
    des.region(selection_area(39, 3, 54, 8), 'lit');
    des.region(selection_area(56, 0, 75, 8), 'unlit');
    des.region(selection_area(64, 9, 75, 16), 'unlit');

    // Doors
    des.door({ state: 'open', coord: [23, 3] });
    des.door({ state: 'open', coord: [30, 8] });
    des.door({ state: 'open', coord: [34, 14] });
    des.door({ state: 'locked', coord: [38, 5] });
    des.door({ state: 'locked', coord: [38, 6] });
    des.door({ state: 'closed', coord: [43, 3] });
    des.door({ state: 'closed', coord: [43, 5] });
    des.door({ state: 'closed', coord: [43, 6] });
    des.door({ state: 'closed', coord: [43, 8] });
    des.door({ state: 'locked', coord: [55, 6] });

    // Stairs
    des.stair({ dir: 'up', coord: [5, 2] });
    des.stair({ dir: 'down', coord: [70, 13] });

    // Objects — positioned items in the rooms
    des.object({ coord: [42, 3] });
    des.object({ coord: [42, 3] });
    des.object({ coord: [42, 3] });
    des.object({ coord: [41, 3] });
    des.object({ coord: [41, 3] });
    des.object({ coord: [41, 3] });
    des.object({ coord: [41, 3] });
    des.object({ coord: [41, 8] });
    des.object({ coord: [41, 8] });
    des.object({ coord: [42, 8] });
    des.object({ coord: [42, 8] });
    des.object({ coord: [42, 8] });
    des.object({ coord: [71, 13] });
    des.object({ coord: [71, 13] });
    des.object({ coord: [71, 13] });

    // Random traps — 4 spiked pits at fixed positions, 4 random
    des.trap({ type: 'spiked pit', coord: [10, 13] });
    des.trap({ type: 'spiked pit', coord: [21, 7] });
    des.trap({ type: 'spiked pit', coord: [67, 8] });
    des.trap({ type: 'spiked pit', coord: [68, 9] });
    des.trap();
    des.trap();
    des.trap();
    des.trap();

    // Random monsters — positioned ogres, trolls, and a few random
    des.monster({ id: PM_OGRE, coord: [12, 9], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [18, 11], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [45, 5], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [45, 6], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [47, 5], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [46, 5], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [56, 3], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [56, 4], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [56, 5], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [56, 6], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [57, 3], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [57, 4], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [57, 5], peaceful: 0 });
    des.monster({ id: PM_OGRE, coord: [57, 6], peaceful: 0 });
    des.monster({ id: PM_OGRE, peaceful: 0 });
    des.monster({ id: PM_OGRE, peaceful: 0 });
    des.monster({ id: PM_OGRE, peaceful: 0 });
    des.monster({ class: S_OGRE, peaceful: 0 });
    des.monster({ class: S_TROLL, peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, coord: [46, 6], peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, coord: [47, 6], peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, coord: [56, 7], peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, coord: [57, 7], peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, coord: [70, 13], peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    des.monster({ class: S_TROLL, peaceful: 0 });
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
        '....................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.................',  
        '....................}-------------------------------------}.................',  
        '....................}|..S......+.................+.......|}.................',  
        '....................}-S---------------+----------|.......|}.................',  
        '....................}|.|...............|.......+.|.......|}.................',  
        '....................}|.|...............---------.---------}.................',  
        '....................}|.S.\\.............+.................+..................',  
        '....................}|.|...............---------.---------}.................',  
        '....................}|.|...............|.......+.|.......|}.................',  
        '....................}-S---------------+----------|.......|}.................',  
        '....................}|..S......+.................+.......|}.................',  
        '....................}-------------------------------------}.................',  
        '....................}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.................',  
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
        '....................------------------------------------....................',  
        '....................|................|.....|.....|.....|....................',  
        '....................|..------------..|--+-----+-----+--|....................',  
        '....................|..|..........|..|.................|....................',  
        '....................|..|..........|..|+---+---+-----+--|....................',  
        '..................---..|..........|......|...|...|.....|....................',  
        '..................+....|..........+......|...|...|.....|....................',  
        '..................+....|..........+......|...|...|.....|....................',  
        '..................---..|..........|......|...|...|.....|....................',  
        '....................|..|..........|..|+-----+---+---+--|....................',  
        '....................|..|..........|..|.................|....................',  
        '....................|..------------..|--+-----+-----+--|....................',  
        '....................|................|.....|.....|.....|....................',  
        '....................------------------------------------....................',  
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

// C ref: dat/Pri-loca.lua. Priest quest locate level — temple with morgue.
async function priLoca(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'hardfloor', 'noflip');
    // This is a kludge to init the level as a lit field.
    des.level_init({ style: 'mines', fg: '.', bg: '.', smoothed: false, joined: false, lit: 1, walled: false });

    des.map([
        '........................................',
        '........................................',
        '..........----------+----------.........',
        '..........|........|.|........|.........',
        '..........|........|.|........|.........',
        '..........|----.----.----.----|.........',
        '..........+...................+.........',
        '..........+...................+.........',
        '..........|----.----.----.----|.........',
        '..........|........|.|........|.........',
        '..........|........|.|........|.........',
        '..........----------+----------.........',
        '........................................',
        '........................................',
    ]);

    // Dungeon Description
    des.region({ region: [0, 0, 9, 13], lit: 0, type: 'morgue', filled: 1 });
    des.region({ region: [9, 0, 30, 1], lit: 0, type: 'morgue', filled: 1 });
    des.region({ region: [9, 12, 30, 13], lit: 0, type: 'morgue', filled: 1 });
    des.region({ region: [31, 0, 39, 13], lit: 0, type: 'morgue', filled: 1 });
    des.region({ region: [11, 3, 29, 10], lit: 1, type: 'temple', filled: 1, irregular: 1 });

    // The altar inside the temple
    des.altar({ x: 20, y: 7, align: 'noalign', type: 'shrine' });
    des.monster({ id: PM_ALIGNED_CLERIC, coord: [20, 7], align: 'noalign', peaceful: 0 });

    // Doors
    des.door({ state: 'locked', coord: [10, 6] });
    des.door({ state: 'locked', coord: [10, 7] });
    des.door({ state: 'locked', coord: [20, 2] });
    des.door({ state: 'locked', coord: [20, 11] });
    des.door({ state: 'locked', coord: [30, 6] });
    des.door({ state: 'locked', coord: [30, 7] });

    // Stairs
    // Note: The up stairs are *intentionally* off of the map.
    des.stair({ dir: 'up', coord: [43, 5] });
    des.stair({ dir: 'down', coord: [20, 6] });

    // Non diggable walls
    des.non_diggable(selection_area(10, 2, 30, 13));

    // Objects (inside the antechambers).
    des.object({ coord: [14, 3] });
    des.object({ coord: [15, 3] });
    des.object({ coord: [16, 3] });
    des.object({ coord: [14, 10] });
    des.object({ coord: [15, 10] });
    des.object({ coord: [16, 10] });
    des.object({ coord: [17, 10] });
    des.object({ coord: [24, 3] });
    des.object({ coord: [25, 3] });
    des.object({ coord: [26, 3] });
    des.object({ coord: [27, 3] });
    des.object({ coord: [24, 10] });
    des.object({ coord: [25, 10] });
    des.object({ coord: [26, 10] });
    des.object({ coord: [27, 10] });

    // Random traps
    des.trap({ coord: [15, 4] });
    des.trap({ coord: [25, 4] });
    des.trap({ coord: [15, 9] });
    des.trap({ coord: [25, 9] });
    des.trap();
    des.trap();
    // No random monsters - the morgue generation will put them in.
}

// C ref: dat/tower1.lua — Upper stage of Vlad's tower.
function tower1(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'solidify');
    des.map({
        halign: 'half-left',
        valign: 'center',
        map: [
            '  --- --- ---  ',
            '  |.| |.| |.|  ',
            '---S---S---S---',
            '|.......+.+...|',
            '---+-----.-----',
            '  |...\\.|.+.|  ',
            '---+-----.-----',
            '|.......+.+...|',
            '---S---S---S---',
            '  |.| |.| |.|  ',
            '  --- --- ---  ',
        ].join('\n'),
    });

    const niches = [[3, 1], [3, 9], [7, 1], [7, 9], [11, 1], [11, 9]];
    des.shuffle(niches);

    des.ladder({ dir: 'down', coord: [11, 5] });

    // The lord and his court
    des.monster({ id: PM_VLAD_THE_IMPALER, coord: [6, 5] });
    des.monster({ class: S_VAMPIRE, coord: niches[0] });
    des.monster({ class: S_VAMPIRE, coord: niches[1] });
    des.monster({ class: S_VAMPIRE, coord: niches[2] });

    // The brides, named unless vampires are genocided.
    // C ref: tower1.lua nh.is_genocided("vampire") check.
    const vgenod = (state.mvitals?.[PM_VAMPIRE]?.mvflags ?? 0) & G_GENOD;
    const vnames = vgenod ? [null, null, null]
        : ['Madame', 'Marquise', 'Countess'];
    des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[3],
        name: vnames[0], waiting: 1, parsedGender: FEMALE,
    });
    des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[4],
        name: vnames[1], waiting: 1, parsedGender: FEMALE,
    });
    des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[5],
        name: vnames[2], waiting: 1, parsedGender: FEMALE,
    });

    // Doors
    des.door({ state: 'closed', coord: [8, 3] });
    des.door({ state: 'closed', coord: [10, 3] });
    des.door({ state: 'closed', coord: [3, 4] });
    des.door({ state: 'locked', coord: [10, 5] });
    des.door({ state: 'locked', coord: [8, 7] });
    des.door({ state: 'locked', coord: [10, 7] });
    des.door({ state: 'closed', coord: [3, 6] });

    // Treasures
    des.object({ id: CHEST, coord: [7, 5] });
    des.object({ id: CHEST, coord: niches[5] });
    des.object({ id: CHEST, coord: niches[0] });
    des.object({ id: CHEST, coord: niches[1] });
    des.object({ id: CHEST, coord: niches[2] });
    des.object({
        id: CHEST,
        coord: niches[3],
        contents() {
            des.object({ id: WAX_CANDLE, quantity: 4 + rn2(5) });
        },
    });
    des.object({
        id: CHEST,
        coord: niches[4],
        contents() {
            des.object({ id: TALLOW_CANDLE, quantity: 4 + rn2(5) });
        },
    });

    // Protect the tower against outside attacks
    des.non_diggable();
}

// C ref: dat/Pri-fila.lua. Room-based filler level for quest levels above
// Pri-loca: six rooms with zombie and wraith monsters, morgue rooms, and
// random objects and traps.
async function priFila(des) {
    des.room({
        type: 'ordinary',
        contents() {
            des.stair('up');
            des.object();
            des.monster({ id: PM_HUMAN_ZOMBIE });
        },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.object();
            des.object();
        },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.object();
            des.trap();
            des.object();
            des.monster({ id: PM_HUMAN_ZOMBIE });
        },
    });
    des.room({
        type: 'morgue',
        contents() {
            des.stair('down');
            des.object();
            des.trap();
        },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.object();
            des.object();
            des.trap();
            des.monster({ id: PM_WRAITH });
        },
    });
    des.room({
        type: 'morgue',
        contents() {
            des.object();
            des.trap();
        },
    });
    des.random_corridors();
}

// C ref: dat/Pri-filb.lua. Room-based filler level for quest levels at or
// below Pri-loca: six rooms with more zombie and wraith monsters, and morgue
// rooms.
async function priFilb(des) {
    des.room({
        type: 'ordinary',
        contents() {
            des.stair('up');
            des.object();
            des.monster({ id: PM_HUMAN_ZOMBIE });
            des.monster({ id: PM_WRAITH });
        },
    });
    des.room({
        type: 'morgue',
        contents() {
            des.object();
            des.object();
            des.object();
        },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.object();
            des.trap();
            des.object();
            des.monster({ id: PM_HUMAN_ZOMBIE });
            des.monster({ id: PM_WRAITH });
        },
    });
    des.room({
        type: 'morgue',
        contents() {
            des.stair('down');
            des.object();
            des.object();
            des.trap();
        },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.object();
            des.object();
            des.trap();
            des.monster({ id: PM_HUMAN_ZOMBIE });
            des.monster({ id: PM_WRAITH });
        },
    });
    des.room({
        type: 'morgue',
        contents() {
            des.object();
            des.trap();
        },
    });
    des.random_corridors();
}

export const QUEST_LEVEL_LOADERS = {
    'Bar-strt': barStrt,
    'Bar-fila': barFila,
    'Bar-filb': barFilb,
    'Bar-goal': barGoal,
    'Bar-loca': barLoca,
    'Arc-strt': arcStrt,
    'Pri-strt': priStrt,
    'Pri-loca': priLoca,
    'Pri-fila': priFila,
    'Pri-filb': priFilb,
    oracle,
    tower1,
};
