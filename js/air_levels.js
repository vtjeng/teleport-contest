// air_levels.js -- the Plane of Air special-level definition.
//
// C refs: dat/air.lua, sp_lev.c lspo_level_flags(), lspo_message(),
// lspo_map(), lspo_region(), lspo_teleport_region(), lspo_levregion(),
// and lspo_monster().

import { def_char_to_monclass } from './drawing.js';
import {
    PM_AIR_ELEMENTAL,
    PM_COUATL,
    PM_DJINNI,
    PM_ENERGY_VORTEX,
    PM_FLOATING_EYE,
    PM_FOG_CLOUD,
    PM_STEAM_VORTEX,
    PM_YELLOW_LIGHT,
} from './monsters.js';
import { selection_area } from './themerooms.js';
import { AIR_LEVEL_MAP } from './air_level_data.js';

const AIR_MONSTERS = Object.freeze([
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_AIR_ELEMENTAL, peaceful: 0 },
    { id: PM_FLOATING_EYE, peaceful: 0 },
    { id: PM_FLOATING_EYE, peaceful: 0 },
    { id: PM_FLOATING_EYE, peaceful: 0 },
    { id: PM_YELLOW_LIGHT, peaceful: 0 },
    { id: PM_YELLOW_LIGHT, peaceful: 0 },
    { id: PM_YELLOW_LIGHT, peaceful: 0 },
    { id: PM_COUATL },
    { class: def_char_to_monclass('D') },
    { class: def_char_to_monclass('D') },
    { class: def_char_to_monclass('D') },
    { class: def_char_to_monclass('D') },
    { class: def_char_to_monclass('D') },
    { class: def_char_to_monclass('E') },
    { class: def_char_to_monclass('E') },
    { class: def_char_to_monclass('E') },
    { class: def_char_to_monclass('J') },
    { class: def_char_to_monclass('J') },
    { id: PM_DJINNI, peaceful: 0 },
    { id: PM_DJINNI, peaceful: 0 },
    { id: PM_DJINNI, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_FOG_CLOUD, peaceful: 0 },
    { id: PM_ENERGY_VORTEX, peaceful: 0 },
    { id: PM_ENERGY_VORTEX, peaceful: 0 },
    { id: PM_ENERGY_VORTEX, peaceful: 0 },
    { id: PM_ENERGY_VORTEX, peaceful: 0 },
    { id: PM_ENERGY_VORTEX, peaceful: 0 },
    { id: PM_STEAM_VORTEX, peaceful: 0 },
    { id: PM_STEAM_VORTEX, peaceful: 0 },
    { id: PM_STEAM_VORTEX, peaceful: 0 },
    { id: PM_STEAM_VORTEX, peaceful: 0 },
    { id: PM_STEAM_VORTEX, peaceful: 0 },
]);

// C ref: dat/air.lua. Keep each descriptor in source order: create_monster
// consumes coordinate, alignment, gender, and construction RNG per call.
export async function air(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags(
        'mazelevel', 'noteleport', 'hardfloor', 'shortsighted', 'stormy',
    );
    des.message('What a strange feeling!');
    des.message('You notice that there is no gravity here.');
    des.map(AIR_LEVEL_MAP);
    des.teleport_region({
        region: [1, 0, 24, 20],
        region_islev: 1,
        exclude: [25, 0, 79, 20],
        exclude_islev: 1,
        dir: 'up',
    });
    des.teleport_region({
        region: [56, 0, 79, 20],
        region_islev: 1,
        exclude: [1, 0, 55, 20],
        exclude_islev: 1,
        dir: 'down',
    });
    des.levregion({
        region: [57, 1, 78, 19],
        region_islev: 1,
        type: 'portal',
        name: 'fire',
    });
    des.region(selection_area(0, 0, 75, 19), 'lit');
    for (const monster of AIR_MONSTERS) des.monster(monster);
}

export const AIR_LEVEL_LOADERS = Object.freeze({ air });
