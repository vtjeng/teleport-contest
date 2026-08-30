// castle_levels.js — Castle special level definition.
// C ref: dat/castle.lua.

import { def_char_to_monclass } from './drawing.js';
import {
    PM_GIANT_EEL,
    PM_LIEUTENANT,
    PM_SHARK,
    PM_SOLDIER,
} from './monsters.js';
import {
    ARMOR_CLASS,
    CHEST,
    FOOD_CLASS,
    GEM_CLASS,
    POT_GAIN_LEVEL,
    SCR_SCARE_MONSTER,
    WAN_WISHING,
    WEAPON_CLASS,
} from './objects.js';
import { rn2 } from './rng.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

// C ref: dat/castle.lua. The Castle level: the stronghold with drawbridge,
// storerooms, throne room, and the wand of wishing.
async function castle(des) {
    des.level_init({ style: 'mazegrid', bg: '-' });

    des.level_flags('mazelevel', 'noteleport', 'noflipy');

    des.map([
        '}}}}}}}}}.............................................}}}}}}}}}',
        '}-------}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}-------}',
        '}|.....|-----------------------------------------------|.....|}',
        '}|.....+...............................................+.....|}',
        '}-------------------------------+-----------------------------}',
        '}}}}}}|........|..........+...........|.......S.S.......|}}}}}}',
        '.....}|........|..........|...........|.......|.|.......|}.....',
        '.....}|........------------...........---------S---------}.....',
        '.....}|...{....+..........+..........\\S.................+......',
        '.....}|........------------...........---------S---------}.....',
        '.....}|........|..........|...........|.......|.|.......|}.....',
        '}}}}}}|........|..........+...........|.......S.S.......|}}}}}}',
        '}-------------------------------+-----------------------------}',
        '}|.....+...............................................+.....|}',
        '}|.....|-----------------------------------------------|.....|}',
        '}-------}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}-------}',
        '}}}}}}}}}.............................................}}}}}}}}}',
    ]);

    // Random registers initialisation
    // C ref: castle.lua local object = { "[", ")", "*", "%" }; shuffle(object)
    const object = [ARMOR_CLASS, WEAPON_CLASS, GEM_CLASS, FOOD_CLASS];
    des.shuffle(object);

    const place = new ThemeroomSelection();
    place.set(4, 2);
    place.set(58, 2);
    place.set(4, 14);
    place.set(58, 14);

    // C ref: castle.lua local monster = { "L", "N", "E", "H", "M", "O", "R",
    //   "T", "X", "Z" }; shuffle(monster)
    const monsterClasses = [
        def_char_to_monclass('L'),
        def_char_to_monclass('N'),
        def_char_to_monclass('E'),
        def_char_to_monclass('H'),
        def_char_to_monclass('M'),
        def_char_to_monclass('O'),
        def_char_to_monclass('R'),
        def_char_to_monclass('T'),
        def_char_to_monclass('X'),
        def_char_to_monclass('Z'),
    ];
    des.shuffle(monsterClasses);

    des.teleport_region({
        region: [1, 0, 10, 20],
        region_islev: 1,
        exclude: [1, 1, 61, 15],
        dir: 'down',
    });
    des.teleport_region({
        region: [69, 0, 79, 20],
        region_islev: 1,
        exclude: [1, 1, 61, 15],
        dir: 'up',
    });
    des.levregion({
        region: [1, 0, 10, 20],
        region_islev: 1,
        exclude: [0, 0, 62, 16],
        exclude_islev: 1,
        type: 'stair-up',
    });

    des.feature('fountain', 10, 8);

    // Doors
    des.door('closed', 7, 3);
    des.door('closed', 55, 3);
    des.door('locked', 32, 4);
    des.door('locked', 26, 5);
    des.door('locked', 46, 5);
    des.door('locked', 48, 5);
    des.door('locked', 47, 7);
    des.door('closed', 15, 8);
    des.door('closed', 26, 8);
    des.door('locked', 38, 8);
    des.door('locked', 56, 8);
    des.door('locked', 47, 9);
    des.door('locked', 26, 11);
    des.door('locked', 46, 11);
    des.door('locked', 48, 11);
    des.door('locked', 32, 12);
    des.door('closed', 7, 13);
    des.door('closed', 55, 13);

    // The drawbridge
    des.drawbridge({ dir: 'east', state: 'closed', x: 5, y: 8 });

    // Storeroom number 1
    for (const [x, y] of [
        [39, 5], [40, 5], [41, 5], [42, 5], [43, 5], [44, 5], [45, 5],
        [39, 6], [40, 6], [41, 6], [42, 6], [43, 6], [44, 6], [45, 6],
    ]) {
        des.object({ class: object[0], coord: [x, y] });
    }
    // Storeroom number 2
    for (const [x, y] of [
        [49, 5], [50, 5], [51, 5], [52, 5], [53, 5], [54, 5], [55, 5],
        [49, 6], [50, 6], [51, 6], [52, 6], [53, 6], [54, 6], [55, 6],
    ]) {
        des.object({ class: object[1], coord: [x, y] });
    }
    // Storeroom number 3
    for (const [x, y] of [
        [39, 10], [40, 10], [41, 10], [42, 10], [43, 10], [44, 10], [45, 10],
        [39, 11], [40, 11], [41, 11], [42, 11], [43, 11], [44, 11], [45, 11],
    ]) {
        des.object({ class: object[2], coord: [x, y] });
    }
    // Storeroom number 4
    for (const [x, y] of [
        [49, 10], [50, 10], [51, 10], [52, 10], [53, 10], [54, 10], [55, 10],
        [49, 11], [50, 11], [51, 11], [52, 11], [53, 11], [54, 11], [55, 11],
    ]) {
        des.object({ class: object[3], coord: [x, y] });
    }

    // THE WAND OF WISHING in 1 of the 4 towers
    // C ref: castle.lua local loc = place:rndcoord(1)
    const loc = place.rndcoord(true, rn2);
    des.object({
        id: CHEST,
        trapped: false,
        locked: true,
        coord: [loc.x, loc.y],
        contents() {
            des.object({ id: WAN_WISHING });
            des.object({ id: POT_GAIN_LEVEL });
        },
    });
    // Prevent monsters from eating it. (@'s never eat objects)
    des.engraving({ coord: [loc.x, loc.y], type: 'burn', text: 'Elbereth' });
    des.object({
        id: SCR_SCARE_MONSTER,
        coord: [loc.x, loc.y],
        buc: 'cursed',
    });

    // The treasure of the lord
    des.object({ id: CHEST, coord: [37, 8] });

    // Traps
    des.trap({ type: 'trap door', coord: [40, 8] });
    des.trap({ type: 'trap door', coord: [44, 8] });
    des.trap({ type: 'trap door', coord: [48, 8] });
    des.trap({ type: 'trap door', coord: [52, 8] });
    des.trap({ type: 'trap door', coord: [55, 8] });

    // Soldiers guarding the entry hall
    des.monster({ id: PM_SOLDIER, coord: [8, 6] });
    des.monster({ id: PM_SOLDIER, coord: [9, 5] });
    des.monster({ id: PM_SOLDIER, coord: [11, 5] });
    des.monster({ id: PM_SOLDIER, coord: [12, 6] });
    des.monster({ id: PM_SOLDIER, coord: [8, 10] });
    des.monster({ id: PM_SOLDIER, coord: [9, 11] });
    des.monster({ id: PM_SOLDIER, coord: [11, 11] });
    des.monster({ id: PM_SOLDIER, coord: [12, 10] });
    des.monster({ id: PM_LIEUTENANT, coord: [9, 8] });

    // Soldiers guarding the towers
    des.monster({ id: PM_SOLDIER, coord: [3, 2] });
    des.monster({ id: PM_SOLDIER, coord: [5, 2] });
    des.monster({ id: PM_SOLDIER, coord: [57, 2] });
    des.monster({ id: PM_SOLDIER, coord: [59, 2] });
    des.monster({ id: PM_SOLDIER, coord: [3, 14] });
    des.monster({ id: PM_SOLDIER, coord: [5, 14] });
    des.monster({ id: PM_SOLDIER, coord: [57, 14] });
    des.monster({ id: PM_SOLDIER, coord: [59, 14] });

    // The four dragons guarding the storerooms
    des.monster({ class: def_char_to_monclass('D'), coord: [47, 5] });
    des.monster({ class: def_char_to_monclass('D'), coord: [47, 6] });
    des.monster({ class: def_char_to_monclass('D'), coord: [47, 10] });
    des.monster({ class: def_char_to_monclass('D'), coord: [47, 11] });

    // Sea monsters in the moat
    des.monster({ id: PM_GIANT_EEL, coord: [5, 7] });
    des.monster({ id: PM_GIANT_EEL, coord: [5, 9] });
    des.monster({ id: PM_GIANT_EEL, coord: [57, 7] });
    des.monster({ id: PM_GIANT_EEL, coord: [57, 9] });
    des.monster({ id: PM_SHARK, coord: [5, 0] });
    des.monster({ id: PM_SHARK, coord: [5, 16] });
    des.monster({ id: PM_SHARK, coord: [57, 0] });
    des.monster({ id: PM_SHARK, coord: [57, 16] });

    // The throne room and the court monsters
    // C ref: castle.lua lines 195-221. Uses the shuffled monster class array.
    const m = monsterClasses; // shorthand
    des.monster({ class: m[9], coord: [27, 5] });
    des.monster({ class: m[0], coord: [30, 5] });
    des.monster({ class: m[1], coord: [33, 5] });
    des.monster({ class: m[2], coord: [36, 5] });
    des.monster({ class: m[3], coord: [28, 6] });
    des.monster({ class: m[4], coord: [31, 6] });
    des.monster({ class: m[5], coord: [34, 6] });
    des.monster({ class: m[6], coord: [37, 6] });
    des.monster({ class: m[7], coord: [27, 7] });
    des.monster({ class: m[8], coord: [30, 7] });
    des.monster({ class: m[9], coord: [33, 7] });
    des.monster({ class: m[0], coord: [36, 7] });
    des.monster({ class: m[1], coord: [28, 8] });
    des.monster({ class: m[2], coord: [31, 8] });
    des.monster({ class: m[3], coord: [34, 8] });
    des.monster({ class: m[4], coord: [27, 9] });
    des.monster({ class: m[5], coord: [30, 9] });
    des.monster({ class: m[6], coord: [33, 9] });
    des.monster({ class: m[7], coord: [36, 9] });
    des.monster({ class: m[8], coord: [28, 10] });
    des.monster({ class: m[9], coord: [31, 10] });
    des.monster({ class: m[0], coord: [34, 10] });
    des.monster({ class: m[1], coord: [37, 10] });
    des.monster({ class: m[2], coord: [27, 11] });
    des.monster({ class: m[3], coord: [30, 11] });
    des.monster({ class: m[4], coord: [33, 11] });
    des.monster({ class: m[5], coord: [36, 11] });

    // MazeWalks
    des.mazewalk({ x: 0, y: 10, dir: 'west' });
    des.mazewalk({ x: 62, y: 6, dir: 'east' });

    // Non diggable walls
    des.non_diggable(selection_area(0, 0, 62, 16));

    // Subrooms:
    //   Entire castle area
    des.region(selection_area(0, 0, 62, 16), 'unlit');
    //   Courtyards
    des.region(selection_area(0, 5, 5, 11), 'lit');
    des.region(selection_area(57, 5, 62, 11), 'lit');
    //   Throne room
    des.region({ region: [27, 5, 37, 11], lit: 1, type: 'throne', filled: 2 });
    //   Antechamber
    des.region(selection_area(7, 5, 14, 11), 'lit');
    //   Storerooms
    des.region(selection_area(39, 5, 45, 6), 'lit');
    des.region(selection_area(39, 10, 45, 11), 'lit');
    des.region(selection_area(49, 5, 55, 6), 'lit');
    des.region(selection_area(49, 10, 55, 11), 'lit');
    //   Corners
    des.region(selection_area(2, 2, 6, 3), 'lit');
    des.region(selection_area(56, 2, 60, 3), 'lit');
    des.region(selection_area(2, 13, 6, 14), 'lit');
    des.region(selection_area(56, 13, 60, 14), 'lit');
    //   Barracks
    des.region({
        region: [16, 5, 25, 6], lit: 1, type: 'barracks', filled: 1,
    });
    des.region({
        region: [16, 10, 25, 11], lit: 1, type: 'barracks', filled: 1,
    });
    //   Hallways
    des.region(selection_area(8, 3, 54, 3), 'unlit');
    des.region(selection_area(8, 13, 54, 13), 'unlit');
    des.region(selection_area(16, 8, 25, 8), 'unlit');
    des.region(selection_area(39, 8, 55, 8), 'unlit');
    //   Storeroom alcoves
    des.region(selection_area(47, 5, 47, 6), 'unlit');
    des.region(selection_area(47, 10, 47, 11), 'unlit');
}

export const CASTLE_LEVEL_LOADERS = {
    castle,
};
