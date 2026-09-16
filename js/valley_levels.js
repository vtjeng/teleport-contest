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
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'nommap', 'temperate');

    await des.map([
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
        await des.terrain(selection_line(50, 8, 53, 8), '-');
        await des.terrain(selection_line(40, 8, 43, 8), 'B');
    }
    if (percent(50)) {
        await des.terrain({ x: 27, y: 12, typ: '|' });
        await des.terrain(selection_line(27, 3, 29, 3), 'B');
        await des.terrain({ x: 28, y: 2, typ: '-' });
    }
    if (percent(50)) {
        await des.terrain(selection_line(16, 10, 16, 11), '|');
        await des.terrain(selection_line(9, 13, 14, 13), 'B');
    }

    await des.region({ region: [1, 6, 5, 14], lit: 1, type: 'temple', filled: 2 });
    await des.region({ region: [19, 1, 24, 8], lit: 0, type: 'morgue', filled: 1, irregular: 1 });
    await des.region({ region: [9, 14, 16, 18], lit: 0, type: 'morgue', filled: 1, irregular: 1 });
    await des.region({ region: [37, 9, 43, 14], lit: 0, type: 'morgue', filled: 1, irregular: 1 });

    await des.stair({ dir: 'down', coord: [1, 1] });
    await des.levregion({ type: 'branch', region: [66, 17, 66, 17] });
    await des.teleport_region({ region: [58, 9, 72, 18], dir: 'down' });

    await des.door('locked', 4, 1);
    await des.door('locked', 8, 4);
    await des.door('locked', 6, 6);

    await des.altar({ x: 3, y: 10, align: 'noalign', type: 'shrine' });

    await des.non_diggable(selection_area(0, 0, 75, 19));

    await des.object({ id: CORPSE, montype: PM_ARCHEOLOGIST });
    await des.object({ id: CORPSE, montype: PM_ARCHEOLOGIST });
    await des.object({ id: CORPSE, montype: PM_BARBARIAN });
    await des.object({ id: CORPSE, montype: PM_BARBARIAN });
    await des.object({ id: CORPSE, montype: PM_CAVE_DWELLER });
    await des.object({ id: CORPSE, montype: PM_CAVE_DWELLER });
    await des.object({ id: CORPSE, montype: PM_HEALER });
    await des.object({ id: CORPSE, montype: PM_HEALER });
    await des.object({ id: CORPSE, montype: PM_KNIGHT });
    await des.object({ id: CORPSE, montype: PM_KNIGHT });
    await des.object({ id: CORPSE, montype: PM_RANGER });
    await des.object({ id: CORPSE, montype: PM_RANGER });
    await des.object({ id: CORPSE, montype: PM_ROGUE });
    await des.object({ id: CORPSE, montype: PM_ROGUE });
    await des.object({ id: CORPSE, montype: PM_SAMURAI });
    await des.object({ id: CORPSE, montype: PM_SAMURAI });
    await des.object({ id: CORPSE, montype: PM_TOURIST });
    await des.object({ id: CORPSE, montype: PM_TOURIST });
    await des.object({ id: CORPSE, montype: PM_VALKYRIE });
    await des.object({ id: CORPSE, montype: PM_VALKYRIE });
    await des.object({ id: CORPSE, montype: PM_WIZARD });
    await des.object({ id: CORPSE, montype: PM_WIZARD });

    await des.object({ class: ARMOR_CLASS });
    await des.object({ class: ARMOR_CLASS });
    await des.object({ class: ARMOR_CLASS });
    await des.object({ class: ARMOR_CLASS });
    await des.object({ class: WEAPON_CLASS });
    await des.object({ class: WEAPON_CLASS });
    await des.object({ class: WEAPON_CLASS });
    await des.object({ class: WEAPON_CLASS });

    await des.object({ id: RUBY });
    await des.object({ class: GEM_CLASS });
    await des.object({ class: GEM_CLASS });
    await des.object({ class: POTION_CLASS });
    await des.object({ class: POTION_CLASS });
    await des.object({ class: POTION_CLASS });
    await des.object({ class: SCROLL_CLASS });
    await des.object({ class: SCROLL_CLASS });
    await des.object({ class: SCROLL_CLASS });
    await des.object({ class: WAND_CLASS });
    await des.object({ class: WAND_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: RING_CLASS });
    await des.object({ class: SPBOOK_CLASS });
    await des.object({ class: SPBOOK_CLASS });
    await des.object({ class: TOOL_CLASS });
    await des.object({ class: TOOL_CLASS });
    await des.object({ class: TOOL_CLASS });

    await des.trap({ type: 'spiked pit', coord: [5, 2] });
    await des.trap({ type: 'spiked pit', coord: [14, 5] });
    await des.trap({ type: 'sleep gas', coord: [3, 1] });
    await des.trap({ type: 'board', coord: [21, 12] });
    await des.trap('board');
    await des.trap({ type: 'dart', coord: [60, 1] });
    await des.trap({ type: 'dart', coord: [26, 17] });
    await des.trap('anti magic');
    await des.trap('anti magic');
    await des.trap('magic');
    await des.trap('magic');

    await des.monster({ id: PM_GHOST });
    await des.monster({ id: PM_GHOST });
    await des.monster({ id: PM_GHOST });
    await des.monster({ id: PM_GHOST });
    await des.monster({ id: PM_GHOST });
    await des.monster({ id: PM_GHOST });
    await des.monster({ id: PM_VAMPIRE_BAT });
    await des.monster({ id: PM_VAMPIRE_BAT });
    await des.monster({ id: PM_VAMPIRE_BAT });
    await des.monster({ class: S_LICH });
    await des.monster({ class: S_VAMPIRE });
    await des.monster({ class: S_VAMPIRE });
    await des.monster({ class: S_VAMPIRE });
    await des.monster({ class: S_ZOMBIE });
    await des.monster({ class: S_ZOMBIE });
    await des.monster({ class: S_ZOMBIE });
    await des.monster({ class: S_ZOMBIE });
    await des.monster({ class: S_MUMMY });
    await des.monster({ class: S_MUMMY });
    await des.monster({ class: S_MUMMY });
    await des.monster({ class: S_MUMMY });
}

export const VALLEY_LEVEL_LOADERS = {
    valley,
};
