// quest_levels.js — Quest and special level definitions.
// C refs: dat/Bar-strt.lua, dat/Bar-fila.lua, dat/Bar-filb.lua,
//         dat/Bar-goal.lua, dat/Bar-loca.lua, dat/Arc-strt.lua,
//         dat/Arc-loca.lua, dat/Arc-fila.lua, dat/Arc-filb.lua,
//         dat/Arc-goal.lua,
//         dat/Pri-strt.lua, dat/Pri-loca.lua, dat/Pri-fila.lua,
//         dat/Pri-filb.lua, dat/Pri-goal.lua, dat/oracle.lua,
//         dat/Wiz-strt.lua, dat/Wiz-loca.lua, dat/Wiz-fila.lua,
//         dat/tower1.lua, dat/tower2.lua, dat/tower3.lua.

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
    PM_IXOTH,
    PM_LORD_CARNARVON,
    PM_MINION_OF_HUHETOTL,
    PM_NALZOK,
    PM_OCHRE_JELLY,
    PM_OGRE,
    PM_ORACLE,
    PM_PELIAS,
    PM_QUASIT,
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
    S_WRAITH,
    S_ZOMBIE,
    S_OGRE,
    S_SNAKE,
    S_TROLL,
    S_VAMPIRE,
} from './monsters.js';
import {
    BULLWHIP, CHAIN_MAIL, CHEST, CRYSTAL_BALL, FEDORA, HELM_OF_BRILLIANCE,
    LUCKSTONE,
    MACE, MIRROR, ROBE, RUNESWORD, STATUE, TALLOW_CANDLE, WAX_CANDLE,
} from './objects.js';
import { rn2, rnd } from './rng.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';
import { KNI_GOAL_LEVEL_MAP } from './kni_goal_level_data.js';

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
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor');
    await des.map([
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
    await des.replace_terrain({
        region: [37, 0, 59, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 5,
    });
    await des.replace_terrain({
        region: [60, 0, 64, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 10,
    });
    await des.replace_terrain({
        region: [65, 0, 75, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 20,
    });

    // guarantee a path and free spot for the portal
    await des.terrain(selection_randline(37, 7, 62, 2, 7), '.');
    await des.terrain(62, 2, '.');

    // Dungeon Description
    await des.region(selection_area(0, 0, 75, 19), 'lit');
    await des.region(selection_area(9, 5, 11, 5), 'unlit');
    await des.region(selection_area(9, 7, 11, 7), 'lit');
    await des.region(selection_area(9, 9, 11, 9), 'unlit');
    await des.region(selection_area(13, 5, 20, 9), 'lit');
    await des.region(selection_area(29, 5, 31, 6), 'lit');
    await des.region(selection_area(26, 10, 28, 11), 'lit');
    await des.region(selection_area(4, 13, 6, 14), 'lit');
    await des.region(selection_area(15, 13, 17, 14), 'lit');
    await des.region(selection_area(22, 14, 24, 15), 'lit');

    // Stairs
    await des.stair({ dir: 'down', coord: [9, 9] });

    // Portal arrival point
    await des.levregion({ region: [62, 2, 62, 2], type: 'branch' });

    // Doors
    await des.door({ state: 'locked', coord: [12, 5] });
    await des.door({ state: 'locked', coord: [12, 9] });
    await des.door({ state: 'closed', coord: [21, 7] });
    await des.door({ state: 'open', coord: [7, 13] });
    await des.door({ state: 'open', coord: [18, 13] });
    await des.door({ state: 'open', coord: [23, 13] });
    await des.door({ state: 'open', coord: [25, 10] });
    await des.door({ state: 'open', coord: [28, 5] });

    // Elder
    await des.monster({
        id: PM_PELIAS,
        coord: [10, 7],
        async inventory() {
            await des.object({ id: RUNESWORD, spe: 5 });
            await des.object({ id: CHAIN_MAIL, spe: 5 });
        },
    });

    // The treasure of Pelias
    await des.object({ id: CHEST, coord: [9, 5] });

    // chieftain guards for the audience chamber
    await des.monster({ id: PM_CHIEFTAIN, coord: [10, 5] });
    await des.monster({ id: PM_CHIEFTAIN, coord: [10, 9] });
    await des.monster({ id: PM_CHIEFTAIN, coord: [11, 5] });
    await des.monster({ id: PM_CHIEFTAIN, coord: [11, 9] });
    await des.monster({ id: PM_CHIEFTAIN, coord: [14, 5] });
    await des.monster({ id: PM_CHIEFTAIN, coord: [14, 9] });
    await des.monster({ id: PM_CHIEFTAIN, coord: [16, 5] });
    await des.monster({ id: PM_CHIEFTAIN, coord: [16, 9] });

    // Non diggable walls
    await des.non_diggable(selection_area(0, 0, 75, 19));

    // One trap to keep the ogres at bay.
    await des.trap({ type: 'spiked pit', coord: [37, 7] });

    // Eels in the river
    await des.monster({ id: PM_GIANT_EEL, coord: [36, 1] });
    await des.monster({ id: PM_GIANT_EEL, coord: [37, 9] });
    await des.monster({ id: PM_GIANT_EEL, coord: [39, 15] });

    // Monsters on siege duty.
    const ogrelocs = selIntersect(
        selection_floodfill(37, 7, state, frame),
        selection_area(40, 3, 45, 20),
    );
    for (let i = 0; i < 12; i++) {
        const pos = ogrelocs.rndcoord(true);
        await des.monster({
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
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noflip');
    await des.level_init({
        style: 'mines', fg: '.', bg: '.',
        smoothed: true, joined: true, lit: 0, walled: false,
    });

    await des.stair('up');
    await des.stair('down');

    for (let i = 0; i < 8; i++) await des.object();
    for (let i = 0; i < 4; i++) await des.trap();

    await des.monster({ id: PM_OGRE, peaceful: 0 });
    await des.monster({ id: PM_OGRE, peaceful: 0 });
    await des.monster({ class: S_OGRE, peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
}

// C ref: dat/Bar-filb.lua. Mines-style filler level for quest levels at or
// below Bar-loca: walled cave terrain with more ogres and trolls.
async function barFilb(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noflip');
    await des.level_init({
        style: 'mines', fg: '.', bg: ' ',
        smoothed: true, joined: true, lit: 0, walled: true,
    });

    await des.stair('up');
    await des.stair('down');

    for (let i = 0; i < 11; i++) await des.object();
    for (let i = 0; i < 4; i++) await des.trap();

    for (let i = 0; i < 7; i++)
        await des.monster({ id: PM_OGRE, peaceful: 0 });
    await des.monster({ class: S_OGRE, peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    await des.monster({ class: S_TROLL, peaceful: 0 });
}

// C ref: dat/Bar-goal.lua. Map-based barbarian quest goal level: irregular
// cave with Thoth Amon guarding the Heart of Ahriman on an altar, many
// ogres and rock trolls.
async function barGoal(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel');
    await des.map([
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
    await des.region(selection_area(0, 0, 75, 19), 'unlit');

    // Secret doors
    await des.door({ state: 'locked', coord: [22, 9] });
    await des.door({ state: 'locked', coord: [26, 9] });

    // Stairs
    await des.stair({ dir: 'up', coord: [36, 5] });

    // The altar. Unattended.
    await des.altar({ x: 63, y: 4, align: 'noncoaligned', type: 'altar' });

    await des.non_diggable(selection_area(0, 0, 75, 19));

    // Objects — The Heart of Ahriman and 14 random
    await des.object({
        id: LUCKSTONE, coord: [63, 4],
        buc: 'blessed', spe: 0, name: 'The Heart of Ahriman',
    });
    for (let i = 0; i < 14; i++) await des.object();

    // Random traps
    for (let i = 0; i < 6; i++) await des.trap();

    // Random monsters
    await des.monster({ id: PM_THOTH_AMON, coord: [63, 4], peaceful: 0 });
    for (let i = 0; i < 16; i++)
        await des.monster({ id: PM_OGRE, peaceful: 0 });
    await des.monster({ class: S_OGRE, peaceful: 0 });
    await des.monster({ class: S_OGRE, peaceful: 0 });
    for (let i = 0; i < 8; i++)
        await des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    await des.monster({ class: S_TROLL, peaceful: 0 });

    await des.wallify();
}

// C ref: dat/Bar-loca.lua. Map-based barbarian quest locate level: a swamp
// path with pools, buildings, and many ogres and trolls.
async function barLoca(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'hardfloor');
    await des.map([
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
    await des.region(selection_area(0, 0, 75, 19), 'lit');
    await des.region(selection_area(24, 3, 26, 4), 'unlit');
    await des.region(selection_area(31, 8, 33, 9), 'unlit');
    await des.region(selection_area(35, 14, 37, 15), 'unlit');
    await des.region(selection_area(39, 3, 54, 8), 'lit');
    await des.region(selection_area(56, 0, 75, 8), 'unlit');
    await des.region(selection_area(64, 9, 75, 16), 'unlit');

    // Doors
    await des.door({ state: 'open', coord: [23, 3] });
    await des.door({ state: 'open', coord: [30, 8] });
    await des.door({ state: 'open', coord: [34, 14] });
    await des.door({ state: 'locked', coord: [38, 5] });
    await des.door({ state: 'locked', coord: [38, 6] });
    await des.door({ state: 'closed', coord: [43, 3] });
    await des.door({ state: 'closed', coord: [43, 5] });
    await des.door({ state: 'closed', coord: [43, 6] });
    await des.door({ state: 'closed', coord: [43, 8] });
    await des.door({ state: 'locked', coord: [55, 6] });

    // Stairs
    await des.stair({ dir: 'up', coord: [5, 2] });
    await des.stair({ dir: 'down', coord: [70, 13] });

    // Objects — positioned items in the rooms
    await des.object({ coord: [42, 3] });
    await des.object({ coord: [42, 3] });
    await des.object({ coord: [42, 3] });
    await des.object({ coord: [41, 3] });
    await des.object({ coord: [41, 3] });
    await des.object({ coord: [41, 3] });
    await des.object({ coord: [41, 3] });
    await des.object({ coord: [41, 8] });
    await des.object({ coord: [41, 8] });
    await des.object({ coord: [42, 8] });
    await des.object({ coord: [42, 8] });
    await des.object({ coord: [42, 8] });
    await des.object({ coord: [71, 13] });
    await des.object({ coord: [71, 13] });
    await des.object({ coord: [71, 13] });

    // Random traps — 4 spiked pits at fixed positions, 4 random
    await des.trap({ type: 'spiked pit', coord: [10, 13] });
    await des.trap({ type: 'spiked pit', coord: [21, 7] });
    await des.trap({ type: 'spiked pit', coord: [67, 8] });
    await des.trap({ type: 'spiked pit', coord: [68, 9] });
    await des.trap();
    await des.trap();
    await des.trap();
    await des.trap();

    // Random monsters — positioned ogres, trolls, and a few random
    await des.monster({ id: PM_OGRE, coord: [12, 9], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [18, 11], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [45, 5], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [45, 6], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [47, 5], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [46, 5], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [56, 3], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [56, 4], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [56, 5], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [56, 6], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [57, 3], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [57, 4], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [57, 5], peaceful: 0 });
    await des.monster({ id: PM_OGRE, coord: [57, 6], peaceful: 0 });
    await des.monster({ id: PM_OGRE, peaceful: 0 });
    await des.monster({ id: PM_OGRE, peaceful: 0 });
    await des.monster({ id: PM_OGRE, peaceful: 0 });
    await des.monster({ class: S_OGRE, peaceful: 0 });
    await des.monster({ class: S_TROLL, peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, coord: [46, 6], peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, coord: [47, 6], peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, coord: [56, 7], peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, coord: [57, 7], peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, coord: [70, 13], peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    await des.monster({ id: PM_ROCK_TROLL, peaceful: 0 });
    await des.monster({ class: S_TROLL, peaceful: 0 });
}

// C ref: dat/oracle.lua. Room-based special level: six rooms connected by
// random corridors. The first room is the Oracle's chamber with 8 centaur
// statues and a delphi sub-room containing 4 fountains.
async function oracle(des, state) {
    await des.level_flags('noflip');

    await des.room({
        type: 'ordinary', lit: 1, x: 3, y: 3,
        xalign: 'center', yalign: 'center', w: 11, h: 9,
        async contents() {
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
                await des.object({
                    id: STATUE, coord: [sx, sy],
                    montype: species ? species.pmidx : NON_PM,
                    historic: true,
                });
            }

            // Delphi sub-room with 4 fountains and the Oracle
            await des.room({
                type: 'delphi', lit: 1, x: 4, y: 3, w: 3, h: 3,
                async contents() {
                    await des.feature('fountain', 0, 1);
                    await des.feature('fountain', 1, 0);
                    await des.feature('fountain', 1, 2);
                    await des.feature('fountain', 2, 1);
                    await des.monster({ id: PM_ORACLE, coord: [1, 1] });
                    await des.door({ state: 'nodoor', wall: 'all' });
                },
            });

            await des.monster();
            await des.monster();
        },
    });

    await des.room({ async contents() {
        await des.stair('up');
        await des.object();
    }});

    await des.room({ async contents() {
        await des.stair('down');
        await des.object();
        await des.trap();
        await des.monster();
        await des.monster();
    }});

    await des.room({ async contents() {
        await des.object();
        await des.object();
        await des.monster();
    }});

    await des.room({ async contents() {
        await des.object();
        await des.trap();
        await des.monster();
    }});

    await des.room({ async contents() {
        await des.object();
        await des.trap();
        await des.monster();
    }});

    await des.random_corridors();
}

// C ref: dat/Arc-strt.lua. Map-based quest start level for the Archeologist.
// Lord Carnarvon's besieged compound behind a moat, with snakes and mummies.
async function arcStrt(des, state) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor');
    await des.map([
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
    await des.region(selection_area(0, 0, 75, 19), 'lit');
    await des.region(selection_area(22, 6, 23, 6), 'unlit');
    await des.region(selection_area(25, 6, 30, 6), 'unlit');
    await des.region(selection_area(32, 6, 48, 6), 'unlit');
    await des.region(selection_area(50, 6, 56, 8), 'lit');
    await des.region(selection_area(40, 8, 46, 8), 'unlit');
    await des.region(selection_area(22, 8, 22, 12), 'unlit');
    await des.region(selection_area(24, 8, 38, 12), 'unlit');
    await des.region(selection_area(48, 8, 48, 8), 'lit');
    await des.region(selection_area(40, 10, 56, 10), 'lit');
    await des.region(selection_area(48, 12, 48, 12), 'lit');
    await des.region(selection_area(40, 12, 46, 12), 'unlit');
    await des.region(selection_area(50, 12, 56, 14), 'lit');
    await des.region(selection_area(22, 14, 23, 14), 'unlit');
    await des.region(selection_area(25, 14, 30, 14), 'unlit');
    await des.region(selection_area(32, 14, 48, 14), 'unlit');

    // Stairs
    await des.stair({ dir: 'down', coord: [55, 7] });

    // Portal arrival point
    await des.levregion({ region: [63, 6, 63, 6], type: 'branch' });

    // Doors
    await des.door({ state: 'closed', coord: [22, 7] });
    await des.door({ state: 'closed', coord: [38, 7] });
    await des.door({ state: 'locked', coord: [47, 8] });
    await des.door({ state: 'locked', coord: [23, 10] });
    await des.door({ state: 'locked', coord: [39, 10] });
    await des.door({ state: 'locked', coord: [57, 10] });
    await des.door({ state: 'locked', coord: [47, 12] });
    await des.door({ state: 'closed', coord: [22, 13] });
    await des.door({ state: 'closed', coord: [38, 13] });
    await des.door({ state: 'locked', coord: [24, 14] });
    await des.door({ state: 'closed', coord: [31, 14] });
    await des.door({ state: 'locked', coord: [49, 14] });

    // Lord Carnarvon
    await des.monster({
        id: PM_LORD_CARNARVON,
        coord: [25, 10],
        async inventory() {
            await des.object({ id: FEDORA, spe: 5 });
            await des.object({ id: BULLWHIP, spe: 4 });
        },
    });

    // The treasure of Lord Carnarvon
    await des.object({ id: CHEST, coord: [25, 10] });

    // student guards for the audience chamber
    await des.monster({ id: PM_STUDENT, coord: [26, 9] });
    await des.monster({ id: PM_STUDENT, coord: [27, 9] });
    await des.monster({ id: PM_STUDENT, coord: [28, 9] });
    await des.monster({ id: PM_STUDENT, coord: [26, 10] });
    await des.monster({ id: PM_STUDENT, coord: [28, 10] });
    await des.monster({ id: PM_STUDENT, coord: [26, 11] });
    await des.monster({ id: PM_STUDENT, coord: [27, 11] });
    await des.monster({ id: PM_STUDENT, coord: [28, 11] });

    // city watch guards in the antechambers
    await des.monster({ id: PM_WATCHMAN, coord: [50, 6] });
    await des.monster({ id: PM_WATCHMAN, coord: [50, 14] });

    // Eels in the moat
    await des.monster({ id: PM_GIANT_EEL, coord: [20, 10] });
    await des.monster({ id: PM_GIANT_EEL, coord: [45, 4] });
    await des.monster({ id: PM_GIANT_EEL, coord: [33, 16] });

    // Non diggable walls
    await des.non_diggable(selection_area(0, 0, 75, 19));

    // Random traps
    await des.trap();
    await des.trap();
    await des.trap();
    await des.trap();
    await des.trap();
    await des.trap();

    // Monsters on siege duty (S = snake class, M = mummy class)
    await des.monster({ class: S_SNAKE, coord: [60, 9] });
    await des.monster({ class: S_MUMMY, coord: [60, 10] });
    await des.monster({ class: S_SNAKE, coord: [60, 11] });
    await des.monster({ class: S_SNAKE, coord: [60, 12] });
    await des.monster({ class: S_MUMMY, coord: [60, 13] });
    await des.monster({ class: S_SNAKE, coord: [61, 10] });
    await des.monster({ class: S_SNAKE, coord: [61, 11] });
    await des.monster({ class: S_SNAKE, coord: [61, 12] });
    await des.monster({ class: S_SNAKE, coord: [30, 3] });
    await des.monster({ class: S_MUMMY, coord: [20, 17] });
    await des.monster({ class: S_SNAKE, coord: [67, 2] });
    await des.monster({ class: S_SNAKE, coord: [10, 19] });
}

// C ref: dat/Arc-loca.lua. Map-based quest locate level for the Archeologist.
// The Tomb of the Toltec Kings has three temples, random treasure, traps,
// snakes, and mummies around its fixed maze map.
async function arcLoca(des, state) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'hardfloor');
    await des.map([
        '............................................................................',
        '............................................................................',
        '............................................................................',
        '........................-------------------------------.....................',
        '........................|....|.S......................|.....................',
        '........................|....|.|.|+------------------.|.....................',
        '........................|....|.|.|.|.........|......|.|.....................',
        '........................|....|.|.|.|.........|......|.|.....................',
        '........................|---+-.|.|.|..---....+......|.|.....................',
        '........................|....|.|.|.---|.|....|......|.|.....................',
        '........................|....S.|.|.+..S.|--S-----S--|.|.....................',
        '........................|....|.|.|.---|.|....|......+.|.....................',
        '........................|---+-.|.|.|..---....|.------.|.....................',
        '........................|....|.|.|.|.........|.|....+.|.....................',
        '........................|....|.|.|.|.........|+|....|-|.....................',
        '........................|....|.|.|------------+------.S.....................',
        '........................|....|.S......................|.....................',
        '........................-------------------------------.....................',
        '............................................................................',
        '............................................................................',
    ]);

    // Dungeon Description
    await des.region(selection_area(0, 0, 75, 19), 'lit');
    await des.region({ region: [25, 4, 28, 7], lit: 1, type: 'temple', filled: 2 });
    await des.region({ region: [25, 9, 28, 11], lit: 0, type: 'temple', filled: 2 });
    await des.region({ region: [25, 13, 28, 16], lit: 1, type: 'temple', filled: 2 });
    await des.region(selection_area(30, 4, 30, 16), 'lit');
    await des.region(selection_area(32, 4, 32, 16), 'unlit');
    await des.region({
        region: [33, 4, 53, 4], lit: 0, type: 'ordinary', irregular: 1,
    });
    await des.region(selection_area(36, 10, 37, 10), 'unlit');
    await des.region(selection_area(39, 9, 39, 11), 'unlit');
    await des.region({
        region: [36, 6, 42, 8], lit: 0, type: 'ordinary', irregular: 1,
    });
    await des.region({
        region: [36, 12, 42, 14], lit: 0, type: 'ordinary', irregular: 1,
    });
    await des.region(selection_area(46, 6, 51, 9), 'unlit');
    await des.region({
        region: [46, 11, 49, 11], lit: 0, type: 'ordinary', irregular: 1,
    });
    await des.region(selection_area(48, 13, 51, 14), 'unlit');

    // Doors
    await des.door({ state: 'closed', coord: [31, 4] });
    await des.door({ state: 'closed', coord: [28, 8] });
    await des.door({ state: 'locked', coord: [29, 10] });
    await des.door({ state: 'closed', coord: [28, 12] });
    await des.door({ state: 'closed', coord: [31, 16] });
    await des.door({ state: 'locked', coord: [34, 5] });
    await des.door({ state: 'locked', coord: [35, 10] });
    await des.door({ state: 'locked', coord: [38, 10] });
    await des.door({ state: 'closed', coord: [43, 10] });
    await des.door({ state: 'closed', coord: [45, 8] });
    await des.door({ state: 'locked', coord: [46, 14] });
    await des.door({ state: 'locked', coord: [46, 15] });
    await des.door({ state: 'locked', coord: [49, 10] });
    await des.door({ state: 'locked', coord: [52, 11] });
    await des.door({ state: 'closed', coord: [52, 13] });
    await des.door({ state: 'closed', coord: [54, 15] });

    // Stairs
    await des.stair({ dir: 'up', coord: [3, 17] });
    await des.stair({ dir: 'down', coord: [39, 10] });

    // Three unattended altars use nhlib.lua's shuffled alignment table.
    await des.altar({ x: 26, y: 5, align: state.specialLevelAlign[0], type: 'altar' });
    await des.altar({ x: 26, y: 10, align: state.specialLevelAlign[1], type: 'altar' });
    await des.altar({ x: 26, y: 15, align: state.specialLevelAlign[2], type: 'altar' });

    // Non diggable walls
    await des.non_diggable(selection_area(0, 0, 75, 19));

    // Objects
    for (let i = 0; i < 15; ++i) await des.object();

    // Treasure?
    for (let i = 0; i < 4; ++i)
        await des.engraving({ type: 'engrave', text: 'X marks the spot.' });

    // Random traps
    await des.trap('spiked pit', 24, 2);
    await des.trap('spiked pit', 37, 0);
    await des.trap('spiked pit', 23, 5);
    await des.trap('spiked pit', 26, 19);
    await des.trap('spiked pit', 55, 10);
    await des.trap('spiked pit', 55, 8);
    await des.trap('pit', 51, 1);
    await des.trap('pit', 23, 18);
    await des.trap('pit', 31, 18);
    await des.trap('pit', 48, 19);
    await des.trap('pit', 55, 15);
    await des.trap('magic', 60, 4);
    await des.trap('statue', 72, 7);
    await des.trap('statue');
    await des.trap('statue');
    await des.trap('anti magic', 64, 12);
    await des.trap('sleep gas');
    await des.trap('sleep gas');
    await des.trap('dart');
    await des.trap('dart');
    await des.trap('dart');
    await des.trap('rolling boulder', 32, 10);
    await des.trap('rolling boulder', 40, 16);

    // Random monsters: 18 snakes, a random mummy-class monster, seven named
    // human mummies, and a random mummy-class monster.
    for (let i = 0; i < 18; ++i) await des.monster('S');
    await des.monster('M');
    for (let i = 0; i < 7; ++i) await des.monster('human mummy');
    await des.monster('M');
}

// C ref: dat/Arc-fila.lua. Six ordinary rooms used for Archeologist quest
// levels above Arc-loca, with source-order objects, traps, monsters, stairs,
// and randomly connected corridors.
async function arcFila(des) {
    await des.room({ type: 'ordinary', async contents() {
        await des.stair('up');
        await des.object();
        await des.monster('S');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.object();
        await des.monster('S');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.trap();
        await des.object();
        await des.monster('S');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.stair('down');
        await des.object();
        await des.trap();
        await des.monster('S');
        await des.monster('human mummy');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.object();
        await des.trap();
        await des.monster('S');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.trap();
        await des.monster('S');
    }});

    await des.random_corridors();
}

// C ref: dat/Arc-filb.lua. Six ordinary rooms used for Archeologist quest
// levels at or below Arc-loca, with source-order objects, traps, monsters,
// stairs, and randomly connected corridors.
async function arcFilb(des) {
    await des.room({ type: 'ordinary', async contents() {
        await des.stair('up');
        await des.object();
        await des.monster('M');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.object();
        await des.monster('M');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.trap();
        await des.object();
        await des.monster('M');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.stair('down');
        await des.object();
        await des.trap();
        await des.monster('S');
        await des.monster('human mummy');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.object();
        await des.trap();
        await des.monster('S');
    }});

    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.trap();
        await des.monster('S');
    }});

    await des.random_corridors();
}

// C ref: dat/Arc-goal.lua. Map-based quest goal level for the Archeologist.
// The Tomb of the Toltec Kings has a central temple, the Orb of Detection,
// rolling boulder and random traps, snakes, and mummies.
async function arcGoal(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel');
    await des.map([
        '                                                                            ',
        '                                  ---------                                 ',
        '                                  |..|.|..|                                 ',
        '                       -----------|..S.S..|-----------                      ',
        '                       |.|........|+-|.|-+|........|.|                      ',
        '                       |.S........S..|.|..S........S.|                      ',
        '                       |.|........|..|.|..|........|.|                      ',
        '                    ------------------+------------------                   ',
        '                    |..|..........|.......|..........|..|                   ',
        '                    |..|..........+.......|..........S..|                   ',
        '                    |..S..........|.......+..........|..|                   ',
        '                    |..|..........|.......|..........|..|                   ',
        '                    ------------------+------------------                   ',
        '                       |.|........|..|.|..|........|.|                      ',
        '                       |.S........S..|.|..S........S.|                      ',
        '                       |.|........|+-|.|-+|........|.|                      ',
        '                       -----------|..S.S..|-----------                      ',
        '                                  |..|.|..|                                 ',
        '                                  ---------                                 ',
        '                                                                            ',
    ]);

    // Dungeon Description
    await des.region(selection_area(0, 0, 75, 19), 'lit');
    await des.region(selection_area(35, 2, 36, 3), 'unlit');
    await des.region(selection_area(40, 2, 41, 3), 'unlit');
    await des.region(selection_area(24, 4, 24, 6), 'unlit');
    await des.region(selection_area(26, 4, 33, 6), 'lit');
    await des.region(selection_area(38, 2, 38, 6), 'unlit');
    await des.region(selection_area(43, 4, 50, 6), 'lit');
    await des.region(selection_area(52, 4, 52, 6), 'unlit');
    await des.region(selection_area(35, 5, 36, 6), 'unlit');
    await des.region(selection_area(40, 5, 41, 6), 'unlit');
    await des.region(selection_area(21, 8, 22, 11), 'unlit');
    await des.region(selection_area(24, 8, 33, 11), 'lit');
    await des.region(selection_area(35, 8, 41, 11), 'unlit');
    await des.region(selection_area(43, 8, 52, 11), 'lit');
    await des.region(selection_area(54, 8, 55, 11), 'unlit');
    await des.region(selection_area(24, 13, 24, 15), 'unlit');
    await des.region(selection_area(26, 13, 33, 15), 'unlit');
    await des.region(selection_area(35, 13, 36, 14), 'unlit');
    await des.region(selection_area(35, 16, 36, 17), 'unlit');
    await des.region(selection_area(38, 13, 38, 17), 'unlit');
    await des.region(selection_area(40, 13, 41, 14), 'unlit');
    await des.region(selection_area(40, 16, 41, 17), 'unlit');
    await des.region({ region: [43, 13, 50, 15], lit: 0, type: 'temple', filled: 2 });
    await des.region(selection_area(52, 13, 52, 15), 'unlit');

    // Stairs and non-diggable walls
    await des.stair({ dir: 'up', coord: [38, 10] });
    await des.non_diggable(selection_area(0, 0, 75, 19));

    // The unattended altar of Huhetotl and the named Orb of Detection.
    await des.altar({ x: 50, y: 14, align: 'chaos', type: 'altar' });
    await des.object({
        id: CRYSTAL_BALL, coord: [50, 14],
        buc: 'blessed', spe: 5, name: 'The Orb of Detection',
    });
    for (let i = 0; i < 14; ++i) await des.object();

    // Random traps and the fixed rolling boulder.
    for (let i = 0; i < 6; ++i) await des.trap();
    await des.trap({ type: 'rolling boulder', coord: [46, 14] });

    // Minion of Huhetotl, snakes, human mummies, and one random mummy-class
    // monster, in the source descriptor order.
    await des.monster({ id: PM_MINION_OF_HUHETOTL, coord: [50, 14] });
    for (let i = 0; i < 18; ++i) await des.monster('S');
    for (let i = 0; i < 8; ++i) await des.monster('human mummy');
    await des.monster('M');
}

// C ref: dat/Pri-strt.lua. Map-based quest start level for the Priest.
// The Arch Priest's besieged temple with corridors, human zombies outside.
async function priStrt(des, state) {
    const { frame } = des;
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor');
    await des.map([
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
    await des.region(selection_area(0, 0, 75, 19), 'lit');
    await des.region({ region: [24, 6, 33, 13], lit: 1, type: 'temple', filled: 2 });

    await des.replace_terrain({
        region: [0, 0, 10, 19],
        fromterrain: '.', toterrain: 'T', chance: 10,
    });
    await des.replace_terrain({
        region: [65, 0, 75, 19],
        fromterrain: '.', toterrain: 'T', chance: 10,
    });
    await des.terrain(5, 4, '.');

    const spacelocs = selection_floodfill(5, 4, state, frame);

    // Portal arrival point
    await des.levregion({ region: [5, 4, 5, 4], type: 'branch' });

    // Stairs
    await des.stair({ dir: 'down', coord: [52, 9] });

    // Doors
    await des.door({ state: 'locked', coord: [18, 9] });
    await des.door({ state: 'locked', coord: [18, 10] });
    await des.door({ state: 'closed', coord: [34, 9] });
    await des.door({ state: 'closed', coord: [34, 10] });
    await des.door({ state: 'closed', coord: [40, 5] });
    await des.door({ state: 'closed', coord: [46, 5] });
    await des.door({ state: 'closed', coord: [52, 5] });
    await des.door({ state: 'locked', coord: [38, 7] });
    await des.door({ state: 'closed', coord: [42, 7] });
    await des.door({ state: 'closed', coord: [46, 7] });
    await des.door({ state: 'closed', coord: [52, 7] });
    await des.door({ state: 'locked', coord: [38, 12] });
    await des.door({ state: 'closed', coord: [44, 12] });
    await des.door({ state: 'closed', coord: [48, 12] });
    await des.door({ state: 'closed', coord: [52, 12] });
    await des.door({ state: 'closed', coord: [40, 14] });
    await des.door({ state: 'closed', coord: [46, 14] });
    await des.door({ state: 'closed', coord: [52, 14] });

    // Unattended Altar - unaligned due to conflict
    await des.altar({ x: 28, y: 9, align: 'noalign', type: 'altar' });

    // Arch Priest
    await des.monster({
        id: PM_ARCH_PRIEST,
        coord: [28, 10],
        async inventory() {
            await des.object({ id: ROBE, spe: 4 });
            await des.object({ id: MACE, spe: 4 });
        },
    });

    // The treasure of Arch Priest
    await des.object({ id: CHEST, coord: [27, 10] });

    // acolyte guards for the audience chamber
    await des.monster({ id: PM_ACOLYTE, coord: [32, 7] });
    await des.monster({ id: PM_ACOLYTE, coord: [32, 8] });
    await des.monster({ id: PM_ACOLYTE, coord: [32, 11] });
    await des.monster({ id: PM_ACOLYTE, coord: [32, 12] });
    await des.monster({ id: PM_ACOLYTE, coord: [33, 7] });
    await des.monster({ id: PM_ACOLYTE, coord: [33, 8] });
    await des.monster({ id: PM_ACOLYTE, coord: [33, 11] });
    await des.monster({ id: PM_ACOLYTE, coord: [33, 12] });

    // Non diggable walls
    await des.non_diggable(selection_area(18, 3, 55, 16));

    // Random traps — 2 dart traps in the open area, 4 random
    for (let i = 0; i < 2; i++) {
        const pos = spacelocs.rndcoord(true);
        await des.trap({ type: 'dart', coord: [pos.x, pos.y] });
    }
    await des.trap();
    await des.trap();
    await des.trap();
    await des.trap();

    // Monsters on siege duty — human zombies in the open area
    for (let i = 0; i < 12; i++) {
        const pos = spacelocs.rndcoord(true);
        await des.monster({ id: PM_HUMAN_ZOMBIE, coord: [pos.x, pos.y] });
    }
}

// C ref: dat/Pri-loca.lua. Priest quest locate level — temple with morgue.
async function priLoca(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'hardfloor', 'noflip');
    // This is a kludge to init the level as a lit field.
    await des.level_init({ style: 'mines', fg: '.', bg: '.', smoothed: false, joined: false, lit: 1, walled: false });

    await des.map([
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
    await des.region({ region: [0, 0, 9, 13], lit: 0, type: 'morgue', filled: 1 });
    await des.region({ region: [9, 0, 30, 1], lit: 0, type: 'morgue', filled: 1 });
    await des.region({ region: [9, 12, 30, 13], lit: 0, type: 'morgue', filled: 1 });
    await des.region({ region: [31, 0, 39, 13], lit: 0, type: 'morgue', filled: 1 });
    await des.region({ region: [11, 3, 29, 10], lit: 1, type: 'temple', filled: 1, irregular: 1 });

    // The altar inside the temple
    await des.altar({ x: 20, y: 7, align: 'noalign', type: 'shrine' });
    await des.monster({ id: PM_ALIGNED_CLERIC, coord: [20, 7], align: 'noalign', peaceful: 0 });

    // Doors
    await des.door({ state: 'locked', coord: [10, 6] });
    await des.door({ state: 'locked', coord: [10, 7] });
    await des.door({ state: 'locked', coord: [20, 2] });
    await des.door({ state: 'locked', coord: [20, 11] });
    await des.door({ state: 'locked', coord: [30, 6] });
    await des.door({ state: 'locked', coord: [30, 7] });

    // Stairs
    // Note: The up stairs are *intentionally* off of the map.
    await des.stair({ dir: 'up', coord: [43, 5] });
    await des.stair({ dir: 'down', coord: [20, 6] });

    // Non diggable walls
    await des.non_diggable(selection_area(10, 2, 30, 13));

    // Objects (inside the antechambers).
    await des.object({ coord: [14, 3] });
    await des.object({ coord: [15, 3] });
    await des.object({ coord: [16, 3] });
    await des.object({ coord: [14, 10] });
    await des.object({ coord: [15, 10] });
    await des.object({ coord: [16, 10] });
    await des.object({ coord: [17, 10] });
    await des.object({ coord: [24, 3] });
    await des.object({ coord: [25, 3] });
    await des.object({ coord: [26, 3] });
    await des.object({ coord: [27, 3] });
    await des.object({ coord: [24, 10] });
    await des.object({ coord: [25, 10] });
    await des.object({ coord: [26, 10] });
    await des.object({ coord: [27, 10] });

    // Random traps
    await des.trap({ coord: [15, 4] });
    await des.trap({ coord: [25, 4] });
    await des.trap({ coord: [15, 9] });
    await des.trap({ coord: [25, 9] });
    await des.trap();
    await des.trap();
    // No random monsters - the morgue generation will put them in.
}

// C ref: dat/Kni-goal.lua. Knight quest goal level — Ixoth guards Merlin's
// Magic Mirror in a maze-level map with hostile quasits and jellies.
async function kniGoal(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel');
    await des.map(KNI_GOAL_LEVEL_MAP);

    await des.region(selection_area(0, 0, 14, 19), 'lit');
    await des.region(selection_area(15, 0, 75, 19), 'unlit');

    await des.stair({ dir: 'up', coord: [3, 8] });
    await des.non_diggable(selection_area(0, 0, 75, 19));

    await des.object({
        id: MIRROR, x: 50, y: 6,
        buc: 'blessed', spe: 0, name: 'The Magic Mirror of Merlin',
    });
    for (let x = 33; x <= 35; ++x)
        for (let y = 1; y <= 5; ++y)
            await des.object({ x, y });
    for (let i = 0; i < 6; ++i) await des.object();

    await des.trap({ type: 'spiked pit', x: 13, y: 7 });
    await des.trap({ type: 'spiked pit', x: 12, y: 8 });
    await des.trap({ type: 'spiked pit', x: 12, y: 9 });
    for (let i = 0; i < 5; ++i) await des.trap();

    await des.monster({ id: PM_IXOTH, x: 50, y: 6, peaceful: 0 });
    for (let i = 0; i < 16; ++i)
        await des.monster({ id: PM_QUASIT, peaceful: 0 });
    await des.monster({ class: 'i', peaceful: 0 });
    await des.monster({ class: 'i', peaceful: 0 });
    for (let i = 0; i < 8; ++i)
        await des.monster({ id: PM_OCHRE_JELLY, peaceful: 0 });
    await des.monster({ class: 'j', peaceful: 0 });
}

// C ref: dat/Pri-goal.lua. Priest quest goal level — lava-filled cave with
// Nalzok guarding the Mitre of Holiness amid human zombies and wraiths.
async function priGoal(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel');
    await des.level_init({ style: 'mines', fg: 'L', bg: '.', smoothed: false, joined: false, lit: 0, walled: false });

    await des.map([
        'xxxxxx..xxxxxx...xxxxxxxxx',
        'xxxx......xx......xxxxxxxx',
        'xx.xx.............xxxxxxxx',
        'x....................xxxxx',
        '......................xxxx',
        '......................xxxx',
        'xx........................',
        'xxx......................x',
        'xxx................xxxxxxx',
        'xxxx.....x.xx.......xxxxxx',
        'xxxxx...xxxxxx....xxxxxxxx',
    ]);

    const place = [[14, 4], [13, 7]];
    const placeidx = rn2(2);

    await des.region(selection_area(0, 0, 25, 10), 'unlit');

    await des.stair({ dir: 'up', coord: [20, 5] });

    await des.object({
        id: HELM_OF_BRILLIANCE, coord: place[placeidx],
        buc: 'blessed', spe: 0, eroded: -1, name: 'The Mitre of Holiness',
    });
    for (let i = 0; i < 14; i++) await des.object();

    await des.trap('fire');
    await des.trap('fire');
    await des.trap('fire');
    await des.trap('fire');
    await des.trap();
    await des.trap();

    await des.monster({ id: PM_NALZOK, coord: place[placeidx] });
    for (let i = 0; i < 16; i++) await des.monster({ id: PM_HUMAN_ZOMBIE });
    await des.monster({ class: S_ZOMBIE });
    await des.monster({ class: S_ZOMBIE });
    for (let i = 0; i < 8; i++) await des.monster({ id: PM_WRAITH });
    await des.monster({ class: S_WRAITH });
}

// C ref: dat/tower1.lua — Upper stage of Vlad's tower.
async function tower1(des, state) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'solidify');
    await des.map({
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
    await des.shuffle(niches);

    await des.ladder({ dir: 'down', coord: [11, 5] });

    // The lord and his court
    await des.monster({ id: PM_VLAD_THE_IMPALER, coord: [6, 5] });
    await des.monster({ class: S_VAMPIRE, coord: niches[0] });
    await des.monster({ class: S_VAMPIRE, coord: niches[1] });
    await des.monster({ class: S_VAMPIRE, coord: niches[2] });

    // The brides, named unless vampires are genocided.
    // C ref: tower1.lua nh.is_genocided("vampire") check.
    const vgenod = (state.mvitals?.[PM_VAMPIRE]?.mvflags ?? 0) & G_GENOD;
    const vnames = vgenod ? [null, null, null]
        : ['Madame', 'Marquise', 'Countess'];
    await des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[3],
        name: vnames[0], waiting: 1, parsedGender: FEMALE,
    });
    await des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[4],
        name: vnames[1], waiting: 1, parsedGender: FEMALE,
    });
    await des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[5],
        name: vnames[2], waiting: 1, parsedGender: FEMALE,
    });

    // Doors
    await des.door({ state: 'closed', coord: [8, 3] });
    await des.door({ state: 'closed', coord: [10, 3] });
    await des.door({ state: 'closed', coord: [3, 4] });
    await des.door({ state: 'locked', coord: [10, 5] });
    await des.door({ state: 'locked', coord: [8, 7] });
    await des.door({ state: 'locked', coord: [10, 7] });
    await des.door({ state: 'closed', coord: [3, 6] });

    // Treasures
    await des.object({ id: CHEST, coord: [7, 5] });
    await des.object({ id: CHEST, coord: niches[5] });
    await des.object({ id: CHEST, coord: niches[0] });
    await des.object({ id: CHEST, coord: niches[1] });
    await des.object({ id: CHEST, coord: niches[2] });
    await des.object({
        id: CHEST,
        coord: niches[3],
        async contents() {
            await des.object({ id: WAX_CANDLE, quantity: 4 + rn2(5) });
        },
    });
    await des.object({
        id: CHEST,
        coord: niches[4],
        async contents() {
            await des.object({ id: TALLOW_CANDLE, quantity: 4 + rn2(5) });
        },
    });

    // Protect the tower against outside attacks
    await des.non_diggable();
}

// C ref: dat/tower2.lua. Middle stage of Vlad's Tower: a ten-niche map with
// fixed hounds, a winter wolf, two chests, and one shuffled spellbook.
async function tower2(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'solidify');
    await des.map({
        halign: 'half-left',
        valign: 'center',
        map: [
            '  --- --- ---  ',
            '  |.| |.| |.|  ',
            '---S---S---S---',
            '|.S.........S.|',
            '---.------+----',
            '  |......|..|  ',
            '--------.------',
            '|.S......+..S.|',
            '---S---S---S---',
            '  |.| |.| |.|  ',
            '  --- --- ---  ',
        ].join('\n'),
    });

    // Lua arrays are one-based; the JS indexes below are place[10] through
    // place[1] in the source order after des.shuffle() mutates this array.
    const place = [
        [3, 1], [7, 1], [11, 1], [1, 3], [13, 3],
        [1, 7], [13, 7], [3, 9], [7, 9], [11, 9],
    ];
    await des.shuffle(place);

    await des.ladder({ dir: 'up', coord: [11, 5] });
    await des.ladder({ dir: 'down', coord: [3, 7] });
    await des.door({ state: 'locked', coord: [10, 4] });
    await des.door({ state: 'locked', coord: [9, 7] });

    await des.monster('&', place[9]);
    await des.monster('&', place[0]);
    await des.monster('hell hound pup', place[1]);
    await des.monster('hell hound pup', place[2]);
    await des.monster('winter wolf', place[3]);

    await des.object({
        id: 'chest',
        coord: place[4],
        async contents() {
            await des.object('amulet of life saving');
        },
    });
    await des.object({
        id: 'chest',
        coord: place[5],
        async contents() {
            await des.object('amulet of strangulation');
        },
    });
    await des.object('water walking boots', place[6]);
    await des.object('crystal plate mail', place[7]);

    const spbooks = [
        'spellbook of invisibility',
        'spellbook of cone of cold',
        'spellbook of create familiar',
        'spellbook of clairvoyance',
        'spellbook of charm monster',
        'spellbook of stone to flesh',
        'spellbook of polymorph',
    ];
    await des.shuffle(spbooks);
    await des.object(spbooks[0], place[8]);

    // C selection.area(00,00,14,10) is relative to the map fragment frame.
    await des.non_diggable(selection_area(0, 0, 14, 10));
}

// C ref: dat/tower3.lua. Lower stage of Vlad's Tower: a broad tower map with
// a branch region, a locked entry door, random monsters, and ten trapped
// niches containing fixed objects.
async function tower3(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'solidify');
    await des.map({
        halign: 'half-left',
        valign: 'center',
        map: [
            '    --- --- ---    ',
            '    |.| |.| |.|    ',
            '  ---S---S---S---  ',
            '  |.S.........S.|  ',
            '-----.........-----',
            '|...|.........+...|',
            '|.---.........---.|',
            '|.|.S.........S.|.|',
            '|.---S---S---S---.|',
            '|...|.|.|.|.|.|...|',
            '---.---.---.---.---',
            '  |.............|  ',
            '  ---------------  ',
        ].join('\n'),
    });

    // The source leaves this ten-coordinate niche list in map order; Lua
    // table indexing is one-based, so place[4] is index 3 in JavaScript.
    const place = [
        [5, 1], [9, 1], [13, 1], [3, 3], [15, 3],
        [3, 7], [15, 7], [5, 9], [9, 9], [13, 9],
    ];

    await des.levregion({ type: 'branch', region: [2, 5, 2, 5] });
    await des.ladder({ dir: 'up', coord: [5, 7] });
    // Entry door is locked in dat/tower3.lua.
    await des.door({ state: 'locked', coord: [14, 5] });

    await des.monster('D', 13, 5);
    await des.monster({ x: 12, y: 4 });
    await des.monster({ x: 12, y: 6 });
    await des.monster();
    await des.monster();
    await des.monster();
    await des.monster();
    await des.monster();
    await des.monster();

    await des.object('long sword', place[3]);
    await des.trap({ coord: place[3] });
    await des.object('lock pick', place[0]);
    await des.trap({ coord: place[0] });
    await des.object('elven cloak', place[1]);
    await des.trap({ coord: place[1] });
    await des.object('blindfold', place[2]);
    await des.trap({ coord: place[2] });

    // Walls in the tower are non-diggable.
    await des.non_diggable(selection_area(0, 0, 18, 12));
}

// C ref: dat/Pri-fila.lua. Room-based filler level for quest levels above
// Pri-loca: six rooms with zombie and wraith monsters, morgue rooms, and
// random objects and traps.
async function priFila(des) {
    await des.room({
        type: 'ordinary',
        async contents() {
            await des.stair('up');
            await des.object();
            await des.monster({ id: PM_HUMAN_ZOMBIE });
        },
    });
    await des.room({
        type: 'ordinary',
        async contents() {
            await des.object();
            await des.object();
        },
    });
    await des.room({
        type: 'ordinary',
        async contents() {
            await des.object();
            await des.trap();
            await des.object();
            await des.monster({ id: PM_HUMAN_ZOMBIE });
        },
    });
    await des.room({
        type: 'morgue',
        async contents() {
            await des.stair('down');
            await des.object();
            await des.trap();
        },
    });
    await des.room({
        type: 'ordinary',
        async contents() {
            await des.object();
            await des.object();
            await des.trap();
            await des.monster({ id: PM_WRAITH });
        },
    });
    await des.room({
        type: 'morgue',
        async contents() {
            await des.object();
            await des.trap();
        },
    });
    await des.random_corridors();
}

// C ref: dat/Pri-filb.lua. Room-based filler level for quest levels at or
// below Pri-loca: six rooms with more zombie and wraith monsters, and morgue
// rooms.
async function priFilb(des) {
    await des.room({
        type: 'ordinary',
        async contents() {
            await des.stair('up');
            await des.object();
            await des.monster({ id: PM_HUMAN_ZOMBIE });
            await des.monster({ id: PM_WRAITH });
        },
    });
    await des.room({
        type: 'morgue',
        async contents() {
            await des.object();
            await des.object();
            await des.object();
        },
    });
    await des.room({
        type: 'ordinary',
        async contents() {
            await des.object();
            await des.trap();
            await des.object();
            await des.monster({ id: PM_HUMAN_ZOMBIE });
            await des.monster({ id: PM_WRAITH });
        },
    });
    await des.room({
        type: 'morgue',
        async contents() {
            await des.stair('down');
            await des.object();
            await des.object();
            await des.trap();
        },
    });
    await des.room({
        type: 'ordinary',
        async contents() {
            await des.object();
            await des.object();
            await des.trap();
            await des.monster({ id: PM_HUMAN_ZOMBIE });
            await des.monster({ id: PM_WRAITH });
        },
    });
    await des.room({
        type: 'morgue',
        async contents() {
            await des.object();
            await des.trap();
        },
    });
    await des.random_corridors();
}

// C ref: dat/Wiz-strt.lua. Wizard quest start level: Neferet the Green's
// besieged tower, with apprentices in the audience chamber and monsters on
// siege duty outside.
async function wizStrt(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor');

    await des.map([
        '............................................................................',
        '.....................C....CC.C........................C.....................',
        '..........CCC.....................CCC.......................................',
        '........CC........-----------.......C.C...C...C....C........................',
        '.......C.....---------------------...C..C..C..C.............................',
        '......C..C...------....\\....------....C.....C...............................',
        '........C...||....|.........|....||.........................................',
        '.......C....||....|.........+....||.........................................',
        '.......C...||---+--.........|....|||........................................',
        '......C....||...............|--S--||........................................',
        '...........||--+--|++----|---|..|.SS..........C......C......................',
        '........C..||.....|..|...|...|--|.||..CC..C.....C..........C................',
        '.......C...||.....|..|.--|.|.|....||.................C..C...................',
        '.....C......||....|..|.....|.|.--||..C..C..........C...........}}}..........',
        '......C.C...||....|..-----.|.....||...C.C.C..............C....}}}}}}........',
        '.........C...------........|------....C..C.....C..CC.C......}}}}}}}}}}}.....',
        '.........CC..---------------------...C.C..C.....CCCCC.C.......}}}}}}}}......',
        '.........C........-----------..........C.C.......CCC.........}}}}}}}}}......',
        '..........C.C.........................C............C...........}}}}}........',
        '......................CCC.C.................................................',
    ]);

    // First add clouds throughout the level, then restore the tower interior.
    await des.replace_terrain({
        region: [0, 0, 75, 19], fromterrain: '.', toterrain: 'C', chance: 10,
    });
    await des.replace_terrain({
        region: [13, 5, 33, 15], fromterrain: 'C', toterrain: '.', chance: 100,
    });

    // Dungeon Description
    await des.region(selection_area(0, 0, 75, 19), 'lit');
    await des.region(selection_area(35, 0, 49, 3), 'unlit');
    await des.region(selection_area(43, 12, 49, 16), 'unlit');
    await des.region({ region: [19, 11, 33, 15], lit: 0, type: 'ordinary', irregular: 1 });
    await des.region(selection_area(30, 10, 31, 10), 'unlit');

    // Stairs and portal arrival point
    await des.stair('down', 30, 10);
    await des.terrain([63, 6], '.');
    await des.levregion({ region: [63, 6, 63, 6], type: 'branch' });

    // Doors
    await des.door('closed', 31, 9);
    await des.door('closed', 16, 8);
    await des.door('closed', 28, 7);
    await des.door('locked', 34, 10);
    await des.door('locked', 35, 10);
    await des.door('closed', 15, 10);
    await des.door('locked', 19, 10);
    await des.door('locked', 20, 10);

    // Neferet the Green and her treasure
    await des.monster({
        id: 'Neferet the Green', coord: [23, 5], async inventory() {
            await des.object({ id: 'elven cloak', spe: 5 });
            await des.object({ id: 'quarterstaff', spe: 5 });
        },
    });
    await des.object('chest', 24, 5);

    // Apprentices in the audience chamber
    await des.monster('apprentice', 30, 7);
    await des.monster('apprentice', 24, 6);
    await des.monster('apprentice', 15, 6);
    await des.monster('apprentice', 15, 12);
    await des.monster('apprentice', 26, 11);
    await des.monster('apprentice', 27, 11);
    await des.monster('apprentice', 19, 9);
    await des.monster('apprentice', 20, 9);

    // Eels in the pond
    await des.monster('giant eel', 62, 14);
    await des.monster('giant eel', 69, 15);
    await des.monster('giant eel', 67, 17);

    await des.non_diggable(selection_area(0, 0, 75, 19));

    // Random traps
    for (let i = 0; i < 6; ++i) await des.trap();

    // Monsters on siege duty
    await des.monster({ class: 'B', x: 60, y: 9, peaceful: 0 });
    await des.monster({ class: 'W', x: 60, y: 10, peaceful: 0 });
    await des.monster({ class: 'B', x: 60, y: 11, peaceful: 0 });
    await des.monster({ class: 'B', x: 60, y: 12, peaceful: 0 });
    await des.monster({ class: 'i', x: 60, y: 13, peaceful: 0 });
    await des.monster({ class: 'B', x: 61, y: 10, peaceful: 0 });
    await des.monster({ class: 'B', x: 61, y: 11, peaceful: 0 });
    await des.monster({ class: 'B', x: 61, y: 12, peaceful: 0 });
    await des.monster({ class: 'B', x: 35, y: 3, peaceful: 0 });
    await des.monster({ class: 'i', x: 35, y: 17, peaceful: 0 });
    await des.monster({ class: 'B', x: 36, y: 17, peaceful: 0 });
    await des.monster({ class: 'B', x: 34, y: 16, peaceful: 0 });
    await des.monster({ class: 'i', x: 34, y: 17, peaceful: 0 });
    await des.monster({ class: 'W', x: 67, y: 2, peaceful: 0 });
    await des.monster({ class: 'B', x: 10, y: 19, peaceful: 0 });
}

// C ref: dat/Wiz-loca.lua. Wizard quest locate level: concentric chambers
// enclosed by a moat, with clouds along the western approach.
async function wizLoca(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'hardfloor');
    await des.map([
        '.............        .......................................................',
        '..............       .............}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.......',
        '..............      ..............}.................................}.......',
        '..............      ..............}.-------------------------------.}.......',
        '...............     .........C....}.|.............................|.}.......',
        '...............    ..........C....}.|.---------------------------.|.}.......',
        '...............    .........CCC...}.|.|.........................|.|.}.......',
        '................   ....C....CCC...}.|.|.-----------------------.|.|.}.......',
        '.......C..C.....  .....C....CCC...}.|.|.|......+.......+......|.|.|.}.......',
        '.............C..CC.....C....CCC...}.|.|.|......|-------|......|.|.|.}.......',
        '................   ....C....CCC...}.|.|.|......|.......|......|.|.|.}.......',
        '......C..C.....    ....C....CCC...}.|.|.|......|-------|......|.|.|.}.......',
        '............C..     ...C....CCC...}.|.|.|......+.......+......|.|.|.}.......',
        '........C......    ....C....CCC...}.|.|.-----------------------.|.|.}.......',
        '....C......C...     ........CCC...}.|.|.........................|.|.}.......',
        '......C..C....      .........C....}.|.---------------------------.|.}.......',
        '..............      .........C....}.|.............................|.}.......',
        '.............       ..............}.-------------------------------.}.......',
        '.............        .............}.................................}.......',
        '.............        .............}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.......',
        '.............        .......................................................',
    ]);

    await des.replace_terrain({ region: [0, 0, 30, 20], fromterrain: '.', toterrain: 'C', chance: 15 });
    await des.replace_terrain({ region: [68, 0, 75, 20], fromterrain: '.', toterrain: '}', chance: 25 });
    await des.replace_terrain({ region: [34, 1, 68, 19], fromterrain: '}', toterrain: '.', chance: 2 });

    await des.region(selection_area(0, 0, 75, 20), 'lit');
    await des.region({
        region: [37, 4, 65, 16], lit: 0, type: 'ordinary', irregular: 1,
        async contents() { await des.door({ state: 'secret', wall: 'random' }); },
    });
    await des.region({
        region: [39, 6, 63, 14], lit: 0, type: 'ordinary', irregular: 1,
        async contents() { await des.door({ state: 'secret', wall: 'random' }); },
    });
    await des.region({
        region: [41, 8, 46, 12], lit: 1, type: 'ordinary', irregular: 1,
        async contents() {
            const walls = ['north', 'south', 'west'];
            // nhlib.lua math.random(1, #walls) selects a one-based index.
            const widx = des.random.rn2(walls.length);
            await des.door({ state: 'secret', wall: walls[widx] });
        },
    });
    await des.region({
        region: [56, 8, 61, 12], lit: 1, type: 'ordinary', irregular: 1,
        async contents() {
            const walls = ['north', 'south', 'east'];
            const widx = des.random.rn2(walls.length);
            await des.door({ state: 'secret', wall: walls[widx] });
        },
    });
    await des.region(selection_area(48, 8, 54, 8), 'unlit');
    await des.region(selection_area(48, 12, 54, 12), 'unlit');
    await des.region({
        region: [48, 10, 54, 10], lit: 0, type: 'ordinary', irregular: 1,
        async contents() { await des.door({ state: 'secret', wall: 'random' }); },
    });

    await des.door('locked', 55, 8);
    await des.door('locked', 55, 12);
    await des.door('locked', 47, 8);
    await des.door('locked', 47, 12);
    await des.terrain([3, 17], '.');
    await des.stair('up', 3, 17);
    await des.stair('down', 48, 10);
    await des.non_diggable(selection_area(0, 0, 75, 20));

    for (let i = 0; i < 15; ++i) await des.object();

    await des.trap('spiked pit', 24, 2);
    await des.trap('spiked pit', 7, 10);
    await des.trap('spiked pit', 23, 5);
    await des.trap('spiked pit', 26, 19);
    await des.trap('spiked pit', 72, 2);
    await des.trap('spiked pit', 72, 12);
    await des.trap('falling rock', 45, 16);
    await des.trap('falling rock', 65, 13);
    await des.trap('falling rock', 55, 6);
    await des.trap('falling rock', 39, 11);
    await des.trap('falling rock', 57, 9);
    await des.trap('magic');
    await des.trap('statue');
    await des.trap('statue');
    await des.trap('polymorph');
    await des.trap('anti magic', 53, 10);
    await des.trap('sleep gas');
    await des.trap('sleep gas');
    await des.trap('dart');
    await des.trap('dart');
    await des.trap('dart');

    for (let i = 0; i < 12; ++i) await des.monster({ class: 'B', peaceful: 0 });
    for (let i = 0; i < 7; ++i) await des.monster({ class: 'i', peaceful: 0 });
    for (let i = 0; i < 7; ++i) await des.monster('vampire bat');
    await des.monster({ class: 'i', peaceful: 0 });
}

// C ref: dat/Wiz-fila.lua. Six rooms above the Wizard quest locate level,
// with imps, vampire bats, and source-ordered stairs, objects, and traps.
async function wizFila(des) {
    await des.room({ type: 'ordinary', async contents() {
        await des.stair('up');
        await des.object();
        await des.monster({ class: 'i', peaceful: 0 });
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.object();
        await des.monster({ class: 'i', peaceful: 0 });
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.trap();
        await des.object();
        await des.monster('vampire bat');
        await des.monster('vampire bat');
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.stair('down');
        await des.object();
        await des.trap();
        await des.monster({ class: 'i', peaceful: 0 });
        await des.monster('vampire bat');
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.object();
        await des.trap();
        await des.monster({ class: 'i', peaceful: 0 });
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.trap();
        await des.monster('vampire bat');
    }});
    await des.random_corridors();
}

// C ref: dat/Wiz-filb.lua. Six rooms below the Wizard quest locate level,
// with imps, vampire bats, and source-ordered stairs, objects, and traps.
async function wizFilb(des) {
    await des.room({ type: 'ordinary', async contents() {
        await des.stair('up');
        await des.object();
        await des.monster({ class: 'X', peaceful: 0 });
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.object();
        await des.monster({ class: 'i', peaceful: 0 });
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.trap();
        await des.object();
        await des.monster({ class: 'X', peaceful: 0 });
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.stair('down');
        await des.object();
        await des.trap();
        await des.monster({ class: 'i', peaceful: 0 });
        await des.monster('vampire bat');
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.object();
        await des.trap();
        await des.monster({ class: 'i', peaceful: 0 });
    }});
    await des.room({ type: 'ordinary', async contents() {
        await des.object();
        await des.trap();
        await des.monster('vampire bat');
    }});
    await des.random_corridors();
}

export const QUEST_LEVEL_LOADERS = {
    'Bar-strt': barStrt,
    'Bar-fila': barFila,
    'Bar-filb': barFilb,
    'Bar-goal': barGoal,
    'Bar-loca': barLoca,
    'Arc-strt': arcStrt,
    'Arc-loca': arcLoca,
    'Arc-fila': arcFila,
    'Arc-filb': arcFilb,
    'Arc-goal': arcGoal,
    'Kni-goal': kniGoal,
    'Pri-strt': priStrt,
    'Pri-loca': priLoca,
    'Pri-goal': priGoal,
    'Pri-fila': priFila,
    'Pri-filb': priFilb,
    'Wiz-strt': wizStrt,
    'Wiz-loca': wizLoca,
    'Wiz-fila': wizFila,
    'Wiz-filb': wizFilb,
    oracle,
    tower1,
    tower2,
    tower3,
};
