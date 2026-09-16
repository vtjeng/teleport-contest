// sokoban_levels.js — Sokoban special level definitions.
// C refs: dat/soko1-1.lua, dat/soko1-2.lua, dat/soko2-1.lua,
//         dat/soko2-2.lua, dat/soko3-1.lua, dat/soko3-2.lua,
//         dat/soko4-1.lua, dat/soko4-2.lua.

import { PM_GIANT_MIMIC } from './monsters.js';
import {
    AMULET_OF_REFLECTION,
    BAG_OF_HOLDING,
    BOULDER,
    FOOD_CLASS,
    RING_CLASS,
    SCR_EARTH,
    SCR_SCARE_MONSTER,
    WAND_CLASS,
} from './objects.js';
import { rn2 } from './rng.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

// C ref: dat/nhlib.lua percent(). math.random(0, 99) is nh.random(0, 100),
// which is rn2(100).
function percent(threshold) {
    return rn2(100) < threshold;
}

// ---- soko1-1 ----
// 26x18 map, reward level with zoo.
// Down stair at (1,1). 21 boulders. 2 giant mimics.
// 16 holes + 1 rolling boulder trap on row 1.
// Zoo at [18,10,22,16]. 75% bag of holding / 25% amulet of reflection.
async function soko1_1(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags(
        'mazelevel', 'noteleport', 'premapped', 'sokoban', 'solidify',
    );
    await des.map([
        '--------------------------',
        '|........................|',
        '|.......|---------------.|',
        '-------.------         |.|',
        ' |...........|         |.|',
        ' |...........|         |.|',
        '--------.-----         |.|',
        '|............|         |.|',
        '|............|         |.|',
        '-----.--------   ------|.|',
        ' |..........|  --|.....|.|',
        ' |..........|  |.+.....|.|',
        ' |.........|-  |-|.....|.|',
        '-------.----   |.+.....+.|',
        '|........|     |-|.....|--',
        '|........|     |.+.....|  ',
        '|...|-----     --|.....|  ',
        '-----            -------  ',
    ]);

    const place = new ThemeroomSelection();
    place.set(16, 11);
    place.set(16, 13);
    place.set(16, 15);

    await des.stair({ dir: 'down', coord: [1, 1] });
    await des.region(selection_area(0, 0, 25, 17), 'lit');
    await des.non_diggable(selection_area(0, 0, 25, 17));
    await des.non_passwall(selection_area(0, 0, 25, 17));

    // Boulders
    await des.object({ id: BOULDER, coord: [3, 5] });
    await des.object({ id: BOULDER, coord: [5, 5] });
    await des.object({ id: BOULDER, coord: [7, 5] });
    await des.object({ id: BOULDER, coord: [9, 5] });
    await des.object({ id: BOULDER, coord: [11, 5] });
    //
    await des.object({ id: BOULDER, coord: [4, 7] });
    await des.object({ id: BOULDER, coord: [4, 8] });
    await des.object({ id: BOULDER, coord: [6, 7] });
    await des.object({ id: BOULDER, coord: [9, 7] });
    await des.object({ id: BOULDER, coord: [11, 7] });
    //
    await des.object({ id: BOULDER, coord: [3, 12] });
    await des.object({ id: BOULDER, coord: [4, 10] });
    await des.object({ id: BOULDER, coord: [5, 12] });
    await des.object({ id: BOULDER, coord: [6, 10] });
    await des.object({ id: BOULDER, coord: [7, 11] });
    await des.object({ id: BOULDER, coord: [8, 10] });
    await des.object({ id: BOULDER, coord: [9, 12] });
    //
    await des.object({ id: BOULDER, coord: [3, 14] });

    // Prevent monster generation over the (filled) holes
    await des.exclusion({
        type: 'monster-generation', region: [7, 1, 23, 1],
    });
    // Traps
    await des.trap({ type: 'hole', coord: [7, 1] });
    await des.trap({ type: 'rolling boulder', coord: [8, 1] });
    await des.trap({ type: 'hole', coord: [9, 1] });
    await des.trap({ type: 'hole', coord: [10, 1] });
    await des.trap({ type: 'hole', coord: [11, 1] });
    await des.trap({ type: 'hole', coord: [12, 1] });
    await des.trap({ type: 'hole', coord: [13, 1] });
    await des.trap({ type: 'hole', coord: [14, 1] });
    await des.trap({ type: 'hole', coord: [15, 1] });
    await des.trap({ type: 'hole', coord: [16, 1] });
    await des.trap({ type: 'hole', coord: [17, 1] });
    await des.trap({ type: 'hole', coord: [18, 1] });
    await des.trap({ type: 'hole', coord: [19, 1] });
    await des.trap({ type: 'hole', coord: [20, 1] });
    await des.trap({ type: 'hole', coord: [21, 1] });
    await des.trap({ type: 'hole', coord: [22, 1] });
    await des.trap({ type: 'hole', coord: [23, 1] });

    await des.monster({
        id: PM_GIANT_MIMIC,
        appear_as: 'obj:boulder',
    });
    await des.monster({
        id: PM_GIANT_MIMIC,
        appear_as: 'obj:boulder',
    });

    // Random objects
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: WAND_CLASS });

    // Rewards
    await des.door({ state: 'locked', coord: [23, 13] });
    await des.door({ state: 'closed', coord: [17, 11] });
    await des.door({ state: 'closed', coord: [17, 13] });
    await des.door({ state: 'closed', coord: [17, 15] });

    await des.region({
        region: [18, 10, 22, 16], lit: 1, type: 'zoo',
        filled: 1, irregular: 1,
    });

    const pt = place.rndcoord();
    if (percent(75)) {
        await des.object({
            id: BAG_OF_HOLDING, coord: [pt.x, pt.y],
            buc: 'not-cursed', achievement: 1,
        });
    } else {
        await des.object({
            id: AMULET_OF_REFLECTION, coord: [pt.x, pt.y],
            buc: 'not-cursed', achievement: 1,
        });
    }
    await des.engraving({ coord: [pt.x, pt.y], type: 'burn', text: 'Elbereth' });
    await des.object({
        id: SCR_SCARE_MONSTER, coord: [pt.x, pt.y], buc: 'cursed',
    });
}

// ---- soko1-2 ----
// 26x17 map, reward level with zoo.
// Down stair at (6,15). 19 boulders. 2 giant mimics.
// 18 holes + 1 rolling boulder trap on row 1.
// Zoo at [18,9,22,15]. 25% bag of holding / 75% amulet of reflection.
async function soko1_2(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags(
        'mazelevel', 'noteleport', 'premapped', 'sokoban', 'solidify',
    );
    await des.map([
        '  ------------------------',
        '  |......................|',
        '  |..-------------------.|',
        '----.|    -----        |.|',
        '|..|.--  --...|        |.|',
        '|.....|--|....|        |.|',
        '|.....|..|....|        |.|',
        '--....|......--        |.|',
        ' |.......|...|   ------|.|',
        ' |....|..|...| --|.....|.|',
        ' |....|--|...| |.+.....|.|',
        ' |.......|..-- |-|.....|.|',
        ' ----....|.--  |.+.....+.|',
        '    ---.--.|   |-|.....|--',
        '     |.....|   |.+.....|  ',
        '     |..|..|   --|.....|  ',
        '     -------     -------  ',
    ]);

    const place = new ThemeroomSelection();
    place.set(16, 10);
    place.set(16, 12);
    place.set(16, 14);

    await des.stair({ dir: 'down', coord: [6, 15] });
    await des.region(selection_area(0, 0, 25, 16), 'lit');
    await des.non_diggable(selection_area(0, 0, 25, 16));
    await des.non_passwall(selection_area(0, 0, 25, 16));

    // Boulders
    await des.object({ id: BOULDER, coord: [4, 4] });
    await des.object({ id: BOULDER, coord: [2, 6] });
    await des.object({ id: BOULDER, coord: [3, 6] });
    await des.object({ id: BOULDER, coord: [4, 7] });
    await des.object({ id: BOULDER, coord: [5, 7] });
    await des.object({ id: BOULDER, coord: [2, 8] });
    await des.object({ id: BOULDER, coord: [5, 8] });
    await des.object({ id: BOULDER, coord: [3, 9] });
    await des.object({ id: BOULDER, coord: [4, 9] });
    await des.object({ id: BOULDER, coord: [3, 10] });
    await des.object({ id: BOULDER, coord: [5, 10] });
    await des.object({ id: BOULDER, coord: [6, 12] });
    //
    await des.object({ id: BOULDER, coord: [7, 14] });
    //
    await des.object({ id: BOULDER, coord: [11, 5] });
    await des.object({ id: BOULDER, coord: [12, 6] });
    await des.object({ id: BOULDER, coord: [10, 7] });
    await des.object({ id: BOULDER, coord: [11, 7] });
    await des.object({ id: BOULDER, coord: [10, 8] });
    await des.object({ id: BOULDER, coord: [12, 9] });
    await des.object({ id: BOULDER, coord: [11, 10] });

    // Prevent monster generation over the (filled) holes
    await des.exclusion({
        type: 'monster-generation', region: [5, 1, 23, 1],
    });
    // Traps
    await des.trap({ type: 'rolling boulder', coord: [5, 1] });
    await des.trap({ type: 'hole', coord: [6, 1] });
    await des.trap({ type: 'hole', coord: [7, 1] });
    await des.trap({ type: 'hole', coord: [8, 1] });
    await des.trap({ type: 'hole', coord: [9, 1] });
    await des.trap({ type: 'hole', coord: [10, 1] });
    await des.trap({ type: 'hole', coord: [11, 1] });
    await des.trap({ type: 'hole', coord: [12, 1] });
    await des.trap({ type: 'hole', coord: [13, 1] });
    await des.trap({ type: 'hole', coord: [14, 1] });
    await des.trap({ type: 'hole', coord: [15, 1] });
    await des.trap({ type: 'hole', coord: [16, 1] });
    await des.trap({ type: 'hole', coord: [17, 1] });
    await des.trap({ type: 'hole', coord: [18, 1] });
    await des.trap({ type: 'hole', coord: [19, 1] });
    await des.trap({ type: 'hole', coord: [20, 1] });
    await des.trap({ type: 'hole', coord: [21, 1] });
    await des.trap({ type: 'hole', coord: [22, 1] });
    await des.trap({ type: 'hole', coord: [23, 1] });

    await des.monster({
        id: PM_GIANT_MIMIC,
        appear_as: 'obj:boulder',
    });
    await des.monster({
        id: PM_GIANT_MIMIC,
        appear_as: 'obj:boulder',
    });

    // Random objects
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: WAND_CLASS });

    // Rewards
    await des.door({ state: 'locked', coord: [23, 12] });
    await des.door({ state: 'closed', coord: [17, 10] });
    await des.door({ state: 'closed', coord: [17, 12] });
    await des.door({ state: 'closed', coord: [17, 14] });
    await des.region({
        region: [18, 9, 22, 15], lit: 1, type: 'zoo',
        filled: 1, irregular: 1,
    });

    const pt = place.rndcoord();
    if (percent(25)) {
        await des.object({
            id: BAG_OF_HOLDING, coord: [pt.x, pt.y],
            buc: 'not-cursed', achievement: 1,
        });
    } else {
        await des.object({
            id: AMULET_OF_REFLECTION, coord: [pt.x, pt.y],
            buc: 'not-cursed', achievement: 1,
        });
    }
    await des.engraving({ coord: [pt.x, pt.y], type: 'burn', text: 'Elbereth' });
    await des.object({
        id: SCR_SCARE_MONSTER, coord: [pt.x, pt.y], buc: 'cursed',
    });
}

// ---- soko2-1 ----
// 20x12 map. Down stair at (6,10), up stair at (16,4).
// 15 boulders. 10 holes + 1 rolling boulder trap on row 9.
async function soko2_1(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags(
        'mazelevel', 'noteleport', 'premapped', 'sokoban', 'solidify',
    );
    await des.map([
        '--------------------',
        '|........|...|.....|',
        '|.....-..|.-.|.....|',
        '|..|.....|...|.....|',
        '|-.|..-..|.-.|.....|',
        '|...--.......|.....|',
        '|...|...-...-|.....|',
        '|...|..|...--|.....|',
        '|-..|..|----------+|',
        '|..................|',
        '|...|..|------------',
        '--------            ',
    ]);
    await des.stair({ dir: 'down', coord: [6, 10] });
    await des.stair({ dir: 'up', coord: [16, 4] });
    await des.door({ state: 'locked', coord: [18, 8] });
    await des.region(selection_area(0, 0, 19, 11), 'lit');
    await des.non_diggable(selection_area(0, 0, 19, 11));
    await des.non_passwall(selection_area(0, 0, 19, 11));

    // Boulders
    await des.object({ id: BOULDER, coord: [2, 2] });
    await des.object({ id: BOULDER, coord: [3, 2] });
    //
    await des.object({ id: BOULDER, coord: [5, 3] });
    await des.object({ id: BOULDER, coord: [7, 3] });
    await des.object({ id: BOULDER, coord: [7, 2] });
    await des.object({ id: BOULDER, coord: [8, 2] });
    //
    await des.object({ id: BOULDER, coord: [10, 3] });
    await des.object({ id: BOULDER, coord: [11, 3] });
    //
    await des.object({ id: BOULDER, coord: [2, 7] });
    await des.object({ id: BOULDER, coord: [2, 8] });
    await des.object({ id: BOULDER, coord: [3, 9] });
    //
    await des.object({ id: BOULDER, coord: [5, 7] });
    await des.object({ id: BOULDER, coord: [6, 6] });

    // Prevent monster generation over the (filled) holes
    await des.exclusion({
        type: 'monster-generation', region: [7, 9, 18, 9],
    });
    // Traps
    await des.trap({ type: 'rolling boulder', coord: [7, 9] });
    await des.trap({ type: 'hole', coord: [8, 9] });
    await des.trap({ type: 'hole', coord: [9, 9] });
    await des.trap({ type: 'hole', coord: [10, 9] });
    await des.trap({ type: 'hole', coord: [11, 9] });
    await des.trap({ type: 'hole', coord: [12, 9] });
    await des.trap({ type: 'hole', coord: [13, 9] });
    await des.trap({ type: 'hole', coord: [14, 9] });
    await des.trap({ type: 'hole', coord: [15, 9] });
    await des.trap({ type: 'hole', coord: [16, 9] });
    await des.trap({ type: 'hole', coord: [17, 9] });

    // Random objects
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: WAND_CLASS });
}

// ---- soko2-2 ----
// 22x13 map. Down stair at (6,11), up stair at (15,6).
// 16 boulders. 11 holes + 1 rolling boulder trap on row 11.
async function soko2_2(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags(
        'mazelevel', 'noteleport', 'premapped', 'sokoban', 'solidify',
    );
    await des.map([
        '  --------            ',
        '--|.|....|            ',
        '|........|----------  ',
        '|.-...-..|.|.......|  ',
        '|...-......|.......|  ',
        '|.-....|...|.......|  ',
        '|....-.--.-|.......|  ',
        '|..........|.......|  ',
        '|.--...|...|.......---',
        '|....-.|---|.......+.|',
        '--|....|------------.|',
        '  |................+.|',
        '  --------------------',
    ]);
    await des.stair({ dir: 'down', coord: [6, 11] });
    await des.stair({ dir: 'up', coord: [15, 6] });
    await des.door({ state: 'locked', coord: [19, 9] });
    await des.door({ state: 'locked', coord: [19, 11] });
    await des.region(selection_area(0, 0, 21, 12), 'lit');
    await des.non_diggable(selection_area(0, 0, 21, 12));
    await des.non_passwall(selection_area(0, 0, 21, 12));

    // Boulders
    await des.object({ id: BOULDER, coord: [4, 2] });
    await des.object({ id: BOULDER, coord: [4, 3] });
    await des.object({ id: BOULDER, coord: [5, 3] });
    await des.object({ id: BOULDER, coord: [7, 3] });
    await des.object({ id: BOULDER, coord: [8, 3] });
    await des.object({ id: BOULDER, coord: [2, 4] });
    await des.object({ id: BOULDER, coord: [3, 4] });
    await des.object({ id: BOULDER, coord: [5, 5] });
    await des.object({ id: BOULDER, coord: [6, 6] });
    await des.object({ id: BOULDER, coord: [9, 6] });
    await des.object({ id: BOULDER, coord: [3, 7] });
    await des.object({ id: BOULDER, coord: [4, 7] });
    await des.object({ id: BOULDER, coord: [7, 7] });
    await des.object({ id: BOULDER, coord: [6, 9] });
    await des.object({ id: BOULDER, coord: [5, 10] });
    await des.object({ id: BOULDER, coord: [5, 11] });

    // Prevent monster generation over the (filled) holes
    await des.exclusion({
        type: 'monster-generation', region: [6, 11, 18, 11],
    });
    // Traps
    await des.trap({ type: 'rolling boulder', coord: [7, 11] });
    await des.trap({ type: 'hole', coord: [8, 11] });
    await des.trap({ type: 'hole', coord: [9, 11] });
    await des.trap({ type: 'hole', coord: [10, 11] });
    await des.trap({ type: 'hole', coord: [11, 11] });
    await des.trap({ type: 'hole', coord: [12, 11] });
    await des.trap({ type: 'hole', coord: [13, 11] });
    await des.trap({ type: 'hole', coord: [14, 11] });
    await des.trap({ type: 'hole', coord: [15, 11] });
    await des.trap({ type: 'hole', coord: [16, 11] });
    await des.trap({ type: 'hole', coord: [17, 11] });
    await des.trap({ type: 'hole', coord: [18, 11] });

    // Random objects
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: WAND_CLASS });
}

// ---- soko3-1 ----
// 29x12 map. Down stair at (11,2), up stair at (23,4).
// 20 boulders. 15 holes + 1 rolling boulder trap on row 10.
async function soko3_1(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags(
        'mazelevel', 'noteleport', 'premapped', 'sokoban', 'solidify',
    );
    await des.map([
        '-----------       -----------',
        '|....|....|--     |.........|',
        '|....|......|     |.........|',
        '|.........|--     |.........|',
        '|....|....|       |.........|',
        '|-.---------      |.........|',
        '|....|.....|      |.........|',
        '|....|.....|      |.........|',
        '|..........|      |.........|',
        '|....|.....|---------------+|',
        '|....|......................|',
        '-----------------------------',
    ]);
    await des.stair({ dir: 'down', coord: [11, 2] });
    await des.stair({ dir: 'up', coord: [23, 4] });
    await des.door({ state: 'locked', coord: [27, 9] });
    await des.region(selection_area(0, 0, 28, 11), 'lit');
    await des.non_diggable(selection_area(0, 0, 28, 11));
    await des.non_passwall(selection_area(0, 0, 28, 11));

    // Boulders
    await des.object({ id: BOULDER, coord: [3, 2] });
    await des.object({ id: BOULDER, coord: [4, 2] });
    //
    await des.object({ id: BOULDER, coord: [6, 2] });
    await des.object({ id: BOULDER, coord: [6, 3] });
    await des.object({ id: BOULDER, coord: [7, 2] });
    //
    await des.object({ id: BOULDER, coord: [3, 6] });
    await des.object({ id: BOULDER, coord: [2, 7] });
    await des.object({ id: BOULDER, coord: [3, 7] });
    await des.object({ id: BOULDER, coord: [3, 8] });
    await des.object({ id: BOULDER, coord: [2, 9] });
    await des.object({ id: BOULDER, coord: [3, 9] });
    await des.object({ id: BOULDER, coord: [4, 9] });
    //
    await des.object({ id: BOULDER, coord: [6, 7] });
    await des.object({ id: BOULDER, coord: [6, 9] });
    await des.object({ id: BOULDER, coord: [8, 7] });
    await des.object({ id: BOULDER, coord: [8, 10] });
    await des.object({ id: BOULDER, coord: [9, 8] });
    await des.object({ id: BOULDER, coord: [9, 9] });
    await des.object({ id: BOULDER, coord: [10, 7] });
    await des.object({ id: BOULDER, coord: [10, 10] });

    // Prevent monster generation over the (filled) holes
    await des.exclusion({
        type: 'monster-generation', region: [11, 10, 27, 10],
    });
    // Traps
    await des.trap({ type: 'rolling boulder', coord: [11, 10] });
    await des.trap({ type: 'hole', coord: [12, 10] });
    await des.trap({ type: 'hole', coord: [13, 10] });
    await des.trap({ type: 'hole', coord: [14, 10] });
    await des.trap({ type: 'hole', coord: [15, 10] });
    await des.trap({ type: 'hole', coord: [16, 10] });
    await des.trap({ type: 'hole', coord: [17, 10] });
    await des.trap({ type: 'hole', coord: [18, 10] });
    await des.trap({ type: 'hole', coord: [19, 10] });
    await des.trap({ type: 'hole', coord: [20, 10] });
    await des.trap({ type: 'hole', coord: [21, 10] });
    await des.trap({ type: 'hole', coord: [22, 10] });
    await des.trap({ type: 'hole', coord: [23, 10] });
    await des.trap({ type: 'hole', coord: [24, 10] });
    await des.trap({ type: 'hole', coord: [25, 10] });
    await des.trap({ type: 'hole', coord: [26, 10] });

    // Random objects
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: WAND_CLASS });
}

// ---- soko3-2 ----
// 26x14 map. Down stair at (3,1), up stair at (20,4).
// 16 boulders. 12 holes + 1 rolling boulder trap on row 10.
async function soko3_2(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags(
        'mazelevel', 'noteleport', 'premapped', 'sokoban', 'solidify',
    );
    await des.map([
        ' ----          -----------',
        '-|..|-------   |.........|',
        '|..........|   |.........|',
        '|..-----.-.|   |.........|',
        '|..|...|...|   |.........|',
        '|.........-|   |.........|',
        '|.......|..|   |.........|',
        '|.----..--.|   |.........|',
        '|........|.--  |.........|',
        '|.---.-.....------------+|',
        '|...|...-................|',
        '|.........----------------',
        '----|..|..|               ',
        '    -------               ',
    ]);
    await des.stair({ dir: 'down', coord: [3, 1] });
    await des.stair({ dir: 'up', coord: [20, 4] });
    await des.door({ state: 'locked', coord: [24, 9] });
    await des.region(selection_area(0, 0, 25, 13), 'lit');
    await des.non_diggable(selection_area(0, 0, 25, 13));
    await des.non_passwall(selection_area(0, 0, 25, 13));

    // Boulders
    await des.object({ id: BOULDER, coord: [2, 3] });
    await des.object({ id: BOULDER, coord: [8, 3] });
    await des.object({ id: BOULDER, coord: [9, 4] });
    await des.object({ id: BOULDER, coord: [2, 5] });
    await des.object({ id: BOULDER, coord: [4, 5] });
    await des.object({ id: BOULDER, coord: [9, 5] });
    await des.object({ id: BOULDER, coord: [2, 6] });
    await des.object({ id: BOULDER, coord: [5, 6] });
    await des.object({ id: BOULDER, coord: [6, 7] });
    await des.object({ id: BOULDER, coord: [3, 8] });
    await des.object({ id: BOULDER, coord: [7, 8] });
    await des.object({ id: BOULDER, coord: [5, 9] });
    await des.object({ id: BOULDER, coord: [10, 9] });
    await des.object({ id: BOULDER, coord: [7, 10] });
    await des.object({ id: BOULDER, coord: [10, 10] });
    await des.object({ id: BOULDER, coord: [3, 11] });

    // Prevent monster generation over the (filled) holes
    await des.exclusion({
        type: 'monster-generation', region: [11, 10, 24, 10],
    });
    // Traps
    await des.trap({ type: 'rolling boulder', coord: [11, 10] });
    await des.trap({ type: 'hole', coord: [12, 10] });
    await des.trap({ type: 'hole', coord: [13, 10] });
    await des.trap({ type: 'hole', coord: [14, 10] });
    await des.trap({ type: 'hole', coord: [15, 10] });
    await des.trap({ type: 'hole', coord: [16, 10] });
    await des.trap({ type: 'hole', coord: [17, 10] });
    await des.trap({ type: 'hole', coord: [18, 10] });
    await des.trap({ type: 'hole', coord: [19, 10] });
    await des.trap({ type: 'hole', coord: [20, 10] });
    await des.trap({ type: 'hole', coord: [21, 10] });
    await des.trap({ type: 'hole', coord: [22, 10] });
    await des.trap({ type: 'hole', coord: [23, 10] });

    // Random objects
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: WAND_CLASS });
}

// ---- soko4-1 ----
// 14x13 map, bottom (first) Sokoban level.
// Branch levregion at (6,4), up stair at (6,6).
// hardfloor flag. 11 boulders. 9 pits + 2 rolling boulder traps.
// 2 scrolls of earth at (2,11) and (3,11).
async function soko4_1(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags(
        'mazelevel', 'noteleport', 'hardfloor',
        'premapped', 'sokoban', 'solidify',
    );
    await des.map([
        '------  ----- ',
        '|....|  |...| ',
        '|....----...| ',
        '|...........| ',
        '|..|-|.|-|..| ',
        '---------|.---',
        '|......|.....|',
        '|..----|.....|',
        '--.|   |.....|',
        ' |.|---|.....|',
        ' |...........|',
        ' |..|---------',
        ' ----         ',
    ]);
    await des.levregion({ region: [6, 4, 6, 4], type: 'branch' });
    await des.stair({ dir: 'up', coord: [6, 6] });
    await des.region(selection_area(0, 0, 13, 12), 'lit');
    await des.non_diggable(selection_area(0, 0, 13, 12));
    await des.non_passwall(selection_area(0, 0, 13, 12));

    // Boulders
    await des.object({ id: BOULDER, coord: [2, 2] });
    await des.object({ id: BOULDER, coord: [2, 3] });
    //
    await des.object({ id: BOULDER, coord: [10, 2] });
    await des.object({ id: BOULDER, coord: [9, 3] });
    await des.object({ id: BOULDER, coord: [10, 4] });
    //
    await des.object({ id: BOULDER, coord: [8, 7] });
    await des.object({ id: BOULDER, coord: [9, 8] });
    await des.object({ id: BOULDER, coord: [9, 9] });
    await des.object({ id: BOULDER, coord: [8, 10] });
    await des.object({ id: BOULDER, coord: [10, 10] });

    // Prevent monster generation over the (filled) pits
    await des.exclusion({
        type: 'monster-generation', region: [1, 6, 7, 11],
    });

    // Traps
    await des.trap({ type: 'pit', coord: [4, 6] });

    await des.trap({ type: 'pit', coord: [2, 6] });
    await des.trap({ type: 'pit', coord: [2, 7] });
    await des.trap({ type: 'pit', coord: [2, 8] });
    await des.trap({ type: 'rolling boulder', coord: [2, 9] });

    await des.trap({ type: 'pit', coord: [2, 10] });
    await des.trap({ type: 'pit', coord: [3, 10] });
    await des.trap({ type: 'pit', coord: [4, 10] });
    await des.trap({ type: 'pit', coord: [5, 10] });
    await des.trap({ type: 'pit', coord: [6, 10] });
    await des.trap({ type: 'rolling boulder', coord: [7, 10] });

    // A little help
    await des.object({ id: SCR_EARTH, coord: [2, 11] });
    await des.object({ id: SCR_EARTH, coord: [3, 11] });

    // Random objects
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: WAND_CLASS });
}

// ---- soko4-2 ----
// 15x11 map, bottom (first) Sokoban level.
// Branch levregion at (3,1), up stair at (1,1).
// hardfloor flag. 12 boulders. 9 pits + 2 rolling boulder traps.
// 2 scrolls of earth at (1,9) and (2,9).
// 2 exclusion zones.
async function soko4_2(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags(
        'mazelevel', 'noteleport', 'hardfloor',
        'premapped', 'sokoban', 'solidify',
    );
    await des.map([
        '-------- ------',
        '|.|....|-|....|',
        '|.|-..........|',
        '|.||....|.....|',
        '|.||....|.....|',
        '|.|-----|.-----',
        '|.|    |......|',
        '|.-----|......|',
        '|.............|',
        '|..|---|......|',
        '----   --------',
    ]);
    await des.levregion({ region: [3, 1, 3, 1], type: 'branch' });
    await des.stair({ dir: 'up', coord: [1, 1] });
    await des.region(selection_area(0, 0, 14, 10), 'lit');
    await des.non_diggable(selection_area(0, 0, 14, 10));
    await des.non_passwall(selection_area(0, 0, 14, 10));

    // Boulders
    await des.object({ id: BOULDER, coord: [5, 2] });
    await des.object({ id: BOULDER, coord: [6, 2] });
    await des.object({ id: BOULDER, coord: [6, 3] });
    await des.object({ id: BOULDER, coord: [7, 3] });
    //
    await des.object({ id: BOULDER, coord: [9, 5] });
    await des.object({ id: BOULDER, coord: [10, 3] });
    await des.object({ id: BOULDER, coord: [11, 2] });
    await des.object({ id: BOULDER, coord: [12, 3] });
    //
    await des.object({ id: BOULDER, coord: [7, 8] });
    await des.object({ id: BOULDER, coord: [8, 8] });
    await des.object({ id: BOULDER, coord: [9, 8] });
    await des.object({ id: BOULDER, coord: [10, 8] });

    // Prevent monster generation over the (filled) pits
    await des.exclusion({
        type: 'monster-generation', region: [1, 1, 1, 9],
    });
    await des.exclusion({
        type: 'monster-generation', region: [1, 8, 7, 9],
    });
    // Traps
    await des.trap({ type: 'pit', coord: [1, 2] });
    await des.trap({ type: 'pit', coord: [1, 3] });
    await des.trap({ type: 'pit', coord: [1, 4] });
    await des.trap({ type: 'pit', coord: [1, 5] });
    await des.trap({ type: 'pit', coord: [1, 6] });
    await des.trap({ type: 'rolling boulder', coord: [1, 7] });

    await des.trap({ type: 'pit', coord: [1, 8] });
    await des.trap({ type: 'pit', coord: [2, 8] });
    await des.trap({ type: 'pit', coord: [3, 8] });
    await des.trap({ type: 'pit', coord: [4, 8] });
    await des.trap({ type: 'pit', coord: [5, 8] });
    await des.trap({ type: 'rolling boulder', coord: [6, 8] });

    // A little help
    await des.object({ id: SCR_EARTH, coord: [1, 9] });
    await des.object({ id: SCR_EARTH, coord: [2, 9] });

    // Random objects
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: FOOD_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: WAND_CLASS });
}

export const SOKOBAN_LEVEL_LOADERS = {
    'soko1-1': soko1_1,
    'soko1-2': soko1_2,
    'soko2-1': soko2_1,
    'soko2-2': soko2_2,
    'soko3-1': soko3_1,
    'soko3-2': soko3_2,
    'soko4-1': soko4_1,
    'soko4-2': soko4_2,
};
