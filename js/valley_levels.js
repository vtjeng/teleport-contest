// valley_levels.js — Valley of the Dead level definition.
// C ref: dat/valley.lua.

import { selection_line } from './bigrm.js';
import {
    PM_ARCHEOLOGIST,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_GHOST,
    PM_HEALER,
    PM_KNIGHT,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_VAMPIRE_BAT,
    PM_WIZARD,
    S_LICH,
    S_MUMMY,
    S_VAMPIRE,
    S_ZOMBIE,
} from './monsters.js';
import {
    ARMOR_CLASS,
    CORPSE,
    GEM_CLASS,
    POTION_CLASS,
    RING_CLASS,
    RUBY,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    TOOL_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { rn2 } from './rng.js';
import { selection_area } from './themerooms.js';

function percent(threshold) {
    return rn2(100) < threshold;
}

// C ref: dat/valley.lua. The Valley of the Dead — maze of corridors with
// the shrine of Moloch, three morgues, corpses of former adventurers, and
// conditional boulder walls that randomize the path.
async function valley(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'nommap', 'temperate');

    des.map([
        '----------------------------------------------------------------------------',
        '|...S.|..|.....|  |.....-|      |................|   |...............| |...|',
        '|---|.|.--.---.|  |......--- ----..........-----.-----....---........---.-.|',
        '|   |.|.|..| |.| --........| |.............|   |.......---| |-...........--|',
        '|   |...S..| |.| |.......-----.......------|   |--------..---......------- |',
        '|----------- |.| |-......| |....|...-- |...-----................----       |',
        '|.....S....---.| |.......| |....|...|  |..............-----------          |',
        '|.....|.|......| |.....--- |......---  |....---.......|                    |',
        '|.....|.|------| |....--   --....-- |-------- ----....---------------      |',
        '|.....|--......---BBB-|     |...--  |.......|    |..................|      |',
        '|..........||........-|    --...|   |.......|    |...||.............|      |',
        '|.....|...-||-........------....|   |.......---- |...||.............--     |',
        '|.....|--......---...........--------..........| |.......---------...--    |',
        '|.....| |------| |--.......--|   |..B......----- -----....| |.|  |....---  |',
        '|.....| |......--| ------..| |----..B......|       |.--------.-- |-.....---|',
        '|------ |........|  |.|....| |.....----BBBB---------...........---.........|',
        '|       |........|  |...|..| |.....|  |-.............--------...........---|',
        '|       --.....-----------.| |....-----.....----------     |.........----  |',
        '|        |..|..B...........| |.|..........|.|              |.|........|    |',
        '----------------------------------------------------------------------------',
    ]);

    if (percent(50)) {
        des.terrain(selection_line(50, 8, 53, 8), '-');
        des.terrain(selection_line(40, 8, 43, 8), 'B');
    }
    if (percent(50)) {
        des.terrain({ x: 27, y: 12, typ: '|' });
        des.terrain(selection_line(27, 3, 29, 3), 'B');
        des.terrain({ x: 28, y: 2, typ: '-' });
    }
    if (percent(50)) {
        des.terrain(selection_line(16, 10, 16, 11), '|');
        des.terrain(selection_line(9, 13, 14, 13), 'B');
    }

    des.region({ region: [1, 6, 5, 14], lit: 1, type: 'temple', filled: 2 });
    des.region({ region: [19, 1, 24, 8], lit: 0, type: 'morgue', filled: 1, irregular: 1 });
    des.region({ region: [9, 14, 16, 18], lit: 0, type: 'morgue', filled: 1, irregular: 1 });
    des.region({ region: [37, 9, 43, 14], lit: 0, type: 'morgue', filled: 1, irregular: 1 });

    des.stair({ dir: 'down', coord: [1, 1] });
    des.levregion({ type: 'branch', region: [66, 17, 66, 17] });
    des.teleport_region({ region: [58, 9, 72, 18], dir: 'down' });

    des.door('locked', 4, 1);
    des.door('locked', 8, 4);
    des.door('locked', 6, 6);

    des.altar({ x: 3, y: 10, align: 'noalign', type: 'shrine' });

    des.non_diggable(selection_area(0, 0, 75, 19));

    des.object({ id: CORPSE, montype: PM_ARCHEOLOGIST });
    des.object({ id: CORPSE, montype: PM_ARCHEOLOGIST });
    des.object({ id: CORPSE, montype: PM_BARBARIAN });
    des.object({ id: CORPSE, montype: PM_BARBARIAN });
    des.object({ id: CORPSE, montype: PM_CAVE_DWELLER });
    des.object({ id: CORPSE, montype: PM_CAVE_DWELLER });
    des.object({ id: CORPSE, montype: PM_HEALER });
    des.object({ id: CORPSE, montype: PM_HEALER });
    des.object({ id: CORPSE, montype: PM_KNIGHT });
    des.object({ id: CORPSE, montype: PM_KNIGHT });
    des.object({ id: CORPSE, montype: PM_RANGER });
    des.object({ id: CORPSE, montype: PM_RANGER });
    des.object({ id: CORPSE, montype: PM_ROGUE });
    des.object({ id: CORPSE, montype: PM_ROGUE });
    des.object({ id: CORPSE, montype: PM_SAMURAI });
    des.object({ id: CORPSE, montype: PM_SAMURAI });
    des.object({ id: CORPSE, montype: PM_TOURIST });
    des.object({ id: CORPSE, montype: PM_TOURIST });
    des.object({ id: CORPSE, montype: PM_VALKYRIE });
    des.object({ id: CORPSE, montype: PM_VALKYRIE });
    des.object({ id: CORPSE, montype: PM_WIZARD });
    des.object({ id: CORPSE, montype: PM_WIZARD });

    des.object({ class: ARMOR_CLASS });
    des.object({ class: ARMOR_CLASS });
    des.object({ class: ARMOR_CLASS });
    des.object({ class: ARMOR_CLASS });
    des.object({ class: WEAPON_CLASS });
    des.object({ class: WEAPON_CLASS });
    des.object({ class: WEAPON_CLASS });
    des.object({ class: WEAPON_CLASS });

    des.object({ id: RUBY });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: POTION_CLASS });
    des.object({ class: POTION_CLASS });
    des.object({ class: POTION_CLASS });
    des.object({ class: SCROLL_CLASS });
    des.object({ class: SCROLL_CLASS });
    des.object({ class: SCROLL_CLASS });
    des.object({ class: WAND_CLASS });
    des.object({ class: WAND_CLASS });
    des.object({ class: RING_CLASS });
    des.object({ class: RING_CLASS });
    des.object({ class: SPBOOK_CLASS });
    des.object({ class: SPBOOK_CLASS });
    des.object({ class: TOOL_CLASS });
    des.object({ class: TOOL_CLASS });
    des.object({ class: TOOL_CLASS });

    des.trap({ type: 'spiked pit', coord: [5, 2] });
    des.trap({ type: 'spiked pit', coord: [14, 5] });
    des.trap({ type: 'sleep gas', coord: [3, 1] });
    des.trap({ type: 'board', coord: [21, 12] });
    des.trap('board');
    des.trap({ type: 'dart', coord: [60, 1] });
    des.trap({ type: 'dart', coord: [26, 17] });
    des.trap('anti magic');
    des.trap('anti magic');
    des.trap('magic');
    des.trap('magic');

    des.monster({ id: PM_GHOST });
    des.monster({ id: PM_GHOST });
    des.monster({ id: PM_GHOST });
    des.monster({ id: PM_GHOST });
    des.monster({ id: PM_GHOST });
    des.monster({ id: PM_GHOST });
    des.monster({ id: PM_VAMPIRE_BAT });
    des.monster({ id: PM_VAMPIRE_BAT });
    des.monster({ id: PM_VAMPIRE_BAT });
    des.monster({ class: S_LICH });
    des.monster({ class: S_VAMPIRE });
    des.monster({ class: S_VAMPIRE });
    des.monster({ class: S_VAMPIRE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_MUMMY });
    des.monster({ class: S_MUMMY });
    des.monster({ class: S_MUMMY });
    des.monster({ class: S_MUMMY });
}

export const VALLEY_LEVEL_LOADERS = {
    valley,
};
