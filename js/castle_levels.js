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
    await des.level_init({ style: 'mazegrid', bg: '-' });

    await des.level_flags('mazelevel', 'noteleport', 'noflipy');

    await des.map([
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
    await des.shuffle(object);

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
    await des.shuffle(monsterClasses);

    await des.teleport_region({
        region: [1, 0, 10, 20],
        region_islev: 1,
        exclude: [1, 1, 61, 15],
        dir: 'down',
    });
    await des.teleport_region({
        region: [69, 0, 79, 20],
        region_islev: 1,
        exclude: [1, 1, 61, 15],
        dir: 'up',
    });
    await des.levregion({
        region: [1, 0, 10, 20],
        region_islev: 1,
        exclude: [0, 0, 62, 16],
        type: 'stair-up',
    });

    await des.feature('fountain', 10, 8);

    // Doors
    await des.door('closed', 7, 3);
    await des.door('closed', 55, 3);
    await des.door('locked', 32, 4);
    await des.door('locked', 26, 5);
    await des.door('locked', 46, 5);
    await des.door('locked', 48, 5);
    await des.door('locked', 47, 7);
    await des.door('closed', 15, 8);
    await des.door('closed', 26, 8);
    await des.door('locked', 38, 8);
    await des.door('locked', 56, 8);
    await des.door('locked', 47, 9);
    await des.door('locked', 26, 11);
    await des.door('locked', 46, 11);
    await des.door('locked', 48, 11);
    await des.door('locked', 32, 12);
    await des.door('closed', 7, 13);
    await des.door('closed', 55, 13);

    // The drawbridge
    await des.drawbridge({ dir: 'east', state: 'closed', x: 5, y: 8 });

    // Storeroom number 1
    for (const [x, y] of [
        [39, 5], [40, 5], [41, 5], [42, 5], [43, 5], [44, 5], [45, 5],
        [39, 6], [40, 6], [41, 6], [42, 6], [43, 6], [44, 6], [45, 6],
    ]) {
        await des.object({ class: object[0], coord: [x, y] });
    }
    // Storeroom number 2
    for (const [x, y] of [
        [49, 5], [50, 5], [51, 5], [52, 5], [53, 5], [54, 5], [55, 5],
        [49, 6], [50, 6], [51, 6], [52, 6], [53, 6], [54, 6], [55, 6],
    ]) {
        await des.object({ class: object[1], coord: [x, y] });
    }
    // Storeroom number 3
    for (const [x, y] of [
        [39, 10], [40, 10], [41, 10], [42, 10], [43, 10], [44, 10], [45, 10],
        [39, 11], [40, 11], [41, 11], [42, 11], [43, 11], [44, 11], [45, 11],
    ]) {
        await des.object({ class: object[2], coord: [x, y] });
    }
    // Storeroom number 4
    for (const [x, y] of [
        [49, 10], [50, 10], [51, 10], [52, 10], [53, 10], [54, 10], [55, 10],
        [49, 11], [50, 11], [51, 11], [52, 11], [53, 11], [54, 11], [55, 11],
    ]) {
        await des.object({ class: object[3], coord: [x, y] });
    }

    // THE WAND OF WISHING in 1 of the 4 towers
    // C ref: castle.lua local loc = place:rndcoord(1)
    const loc = place.rndcoord(true, rn2);
    await des.object({
        id: CHEST,
        trapped: false,
        locked: true,
        coord: [loc.x, loc.y],
        async contents() {
            await des.object({ id: WAN_WISHING });
            await des.object({ id: POT_GAIN_LEVEL });
        },
    });
    // Prevent monsters from eating it. (@'s never eat objects)
    await des.engraving({ coord: [loc.x, loc.y], type: 'burn', text: 'Elbereth' });
    await des.object({
        id: SCR_SCARE_MONSTER,
        coord: [loc.x, loc.y],
        buc: 'cursed',
    });

    // The treasure of the lord
    await des.object({ id: CHEST, coord: [37, 8] });

    // Traps
    await des.trap({ type: 'trap door', coord: [40, 8] });
    await des.trap({ type: 'trap door', coord: [44, 8] });
    await des.trap({ type: 'trap door', coord: [48, 8] });
    await des.trap({ type: 'trap door', coord: [52, 8] });
    await des.trap({ type: 'trap door', coord: [55, 8] });

    // Soldiers guarding the entry hall
    await des.monster({ id: PM_SOLDIER, coord: [8, 6] });
    await des.monster({ id: PM_SOLDIER, coord: [9, 5] });
    await des.monster({ id: PM_SOLDIER, coord: [11, 5] });
    await des.monster({ id: PM_SOLDIER, coord: [12, 6] });
    await des.monster({ id: PM_SOLDIER, coord: [8, 10] });
    await des.monster({ id: PM_SOLDIER, coord: [9, 11] });
    await des.monster({ id: PM_SOLDIER, coord: [11, 11] });
    await des.monster({ id: PM_SOLDIER, coord: [12, 10] });
    await des.monster({ id: PM_LIEUTENANT, coord: [9, 8] });

    // Soldiers guarding the towers
    await des.monster({ id: PM_SOLDIER, coord: [3, 2] });
    await des.monster({ id: PM_SOLDIER, coord: [5, 2] });
    await des.monster({ id: PM_SOLDIER, coord: [57, 2] });
    await des.monster({ id: PM_SOLDIER, coord: [59, 2] });
    await des.monster({ id: PM_SOLDIER, coord: [3, 14] });
    await des.monster({ id: PM_SOLDIER, coord: [5, 14] });
    await des.monster({ id: PM_SOLDIER, coord: [57, 14] });
    await des.monster({ id: PM_SOLDIER, coord: [59, 14] });

    // The four dragons guarding the storerooms
    await des.monster({ class: def_char_to_monclass('D'), coord: [47, 5] });
    await des.monster({ class: def_char_to_monclass('D'), coord: [47, 6] });
    await des.monster({ class: def_char_to_monclass('D'), coord: [47, 10] });
    await des.monster({ class: def_char_to_monclass('D'), coord: [47, 11] });

    // Sea monsters in the moat
    await des.monster({ id: PM_GIANT_EEL, coord: [5, 7] });
    await des.monster({ id: PM_GIANT_EEL, coord: [5, 9] });
    await des.monster({ id: PM_GIANT_EEL, coord: [57, 7] });
    await des.monster({ id: PM_GIANT_EEL, coord: [57, 9] });
    await des.monster({ id: PM_SHARK, coord: [5, 0] });
    await des.monster({ id: PM_SHARK, coord: [5, 16] });
    await des.monster({ id: PM_SHARK, coord: [57, 0] });
    await des.monster({ id: PM_SHARK, coord: [57, 16] });

    // The throne room and the court monsters
    // C ref: castle.lua lines 195-221. Uses the shuffled monster class array.
    const m = monsterClasses; // shorthand
    await des.monster({ class: m[9], coord: [27, 5] });
    await des.monster({ class: m[0], coord: [30, 5] });
    await des.monster({ class: m[1], coord: [33, 5] });
    await des.monster({ class: m[2], coord: [36, 5] });
    await des.monster({ class: m[3], coord: [28, 6] });
    await des.monster({ class: m[4], coord: [31, 6] });
    await des.monster({ class: m[5], coord: [34, 6] });
    await des.monster({ class: m[6], coord: [37, 6] });
    await des.monster({ class: m[7], coord: [27, 7] });
    await des.monster({ class: m[8], coord: [30, 7] });
    await des.monster({ class: m[9], coord: [33, 7] });
    await des.monster({ class: m[0], coord: [36, 7] });
    await des.monster({ class: m[1], coord: [28, 8] });
    await des.monster({ class: m[2], coord: [31, 8] });
    await des.monster({ class: m[3], coord: [34, 8] });
    await des.monster({ class: m[4], coord: [27, 9] });
    await des.monster({ class: m[5], coord: [30, 9] });
    await des.monster({ class: m[6], coord: [33, 9] });
    await des.monster({ class: m[7], coord: [36, 9] });
    await des.monster({ class: m[8], coord: [28, 10] });
    await des.monster({ class: m[9], coord: [31, 10] });
    await des.monster({ class: m[0], coord: [34, 10] });
    await des.monster({ class: m[1], coord: [37, 10] });
    await des.monster({ class: m[2], coord: [27, 11] });
    await des.monster({ class: m[3], coord: [30, 11] });
    await des.monster({ class: m[4], coord: [33, 11] });
    await des.monster({ class: m[5], coord: [36, 11] });

    // MazeWalks
    await des.mazewalk(0, 10, 'west');
    await des.mazewalk(62, 6, 'east');

    // Non diggable walls
    await des.non_diggable(selection_area(0, 0, 62, 16));

    // Subrooms:
    //   Entire castle area
    await des.region(selection_area(0, 0, 62, 16), 'unlit');
    //   Courtyards
    await des.region(selection_area(0, 5, 5, 11), 'lit');
    await des.region(selection_area(57, 5, 62, 11), 'lit');
    //   Throne room
    await des.region({ region: [27, 5, 37, 11], lit: 1, type: 'throne', filled: 2 });
    //   Antechamber
    await des.region(selection_area(7, 5, 14, 11), 'lit');
    //   Storerooms
    await des.region(selection_area(39, 5, 45, 6), 'lit');
    await des.region(selection_area(39, 10, 45, 11), 'lit');
    await des.region(selection_area(49, 5, 55, 6), 'lit');
    await des.region(selection_area(49, 10, 55, 11), 'lit');
    //   Corners
    await des.region(selection_area(2, 2, 6, 3), 'lit');
    await des.region(selection_area(56, 2, 60, 3), 'lit');
    await des.region(selection_area(2, 13, 6, 14), 'lit');
    await des.region(selection_area(56, 13, 60, 14), 'lit');
    //   Barracks
    await des.region({
        region: [16, 5, 25, 6], lit: 1, type: 'barracks', filled: 1,
    });
    await des.region({
        region: [16, 10, 25, 11], lit: 1, type: 'barracks', filled: 1,
    });
    //   Hallways
    await des.region(selection_area(8, 3, 54, 3), 'unlit');
    await des.region(selection_area(8, 13, 54, 13), 'unlit');
    await des.region(selection_area(16, 8, 25, 8), 'unlit');
    await des.region(selection_area(39, 8, 55, 8), 'unlit');
    //   Storeroom alcoves
    await des.region(selection_area(47, 5, 47, 6), 'unlit');
    await des.region(selection_area(47, 10, 47, 11), 'unlit');
}

export const CASTLE_LEVEL_LOADERS = {
    castle,
};
