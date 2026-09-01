// fire_levels.js -- the Plane of Fire special-level definition.
//
// C refs: dat/fire.lua, sp_lev.c lspo_level_flags(), lspo_map(),
// lspo_levregion(), create_trap(), create_monster(), and create_object().

import { BOULDER } from './objects.js';
import {
    PM_BALROG,
    PM_BARBED_DEVIL,
    PM_FIRE_ELEMENTAL,
    PM_FIRE_GIANT,
    PM_FIRE_VORTEX,
    PM_HELL_HOUND,
    PM_PIT_FIEND,
    PM_PIT_VIPER,
    PM_RED_DRAGON,
    PM_SALAMANDER,
    PM_SCORPION,
    PM_STEAM_VORTEX,
    PM_STONE_GOLEM,
    PM_DUST_VORTEX,
    PM_MINOTAUR,
} from './monsters.js';
import { FIRE_LEVEL_MAP } from './fire_level_data.js';

const FIRE_MONSTERS = Object.freeze([
    { id: PM_RED_DRAGON },
    { id: PM_BALROG },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_VORTEX },
    { id: PM_HELL_HOUND },
    { id: PM_FIRE_GIANT },
    { id: PM_BARBED_DEVIL },
    { id: PM_HELL_HOUND },
    { id: PM_STONE_GOLEM },
    { id: PM_PIT_FIEND },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_HELL_HOUND },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_SCORPION },
    { id: PM_FIRE_GIANT },
    { id: PM_HELL_HOUND },
    { id: PM_DUST_VORTEX },
    { id: PM_FIRE_VORTEX },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_HELL_HOUND },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_STONE_GOLEM },
    { id: PM_PIT_VIPER },
    { id: PM_PIT_VIPER },
    { id: PM_FIRE_VORTEX },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_GIANT },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_VORTEX },
    { id: PM_FIRE_VORTEX },
    { id: PM_PIT_FIEND },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_PIT_VIPER },
    { id: PM_SALAMANDER, peaceful: 0 },
    { id: PM_SALAMANDER, peaceful: 0 },
    { id: PM_MINOTAUR },
    { id: PM_SALAMANDER, peaceful: 0 },
    { id: PM_STEAM_VORTEX },
    { id: PM_SALAMANDER, peaceful: 0 },
    { id: PM_SALAMANDER, peaceful: 0 },
    { id: PM_FIRE_GIANT },
    { id: PM_BARBED_DEVIL },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_VORTEX },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_HELL_HOUND },
    { id: PM_FIRE_GIANT },
    { id: PM_PIT_FIEND },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_FIRE_ELEMENTAL, peaceful: 0 },
    { id: PM_BARBED_DEVIL },
    { id: PM_SALAMANDER, peaceful: 0 },
    { id: PM_STEAM_VORTEX },
    { id: PM_SALAMANDER, peaceful: 0 },
    { id: PM_SALAMANDER, peaceful: 0 },
]);

// C ref: dat/fire.lua. This is intentionally a descriptor sequence: every
// call consumes the same coordinate and creation RNG before the next one.
export async function fire(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags(
        'mazelevel', 'noteleport', 'hardfloor',
        'shortsighted', 'hot', 'fumaroles',
    );
    des.map(FIRE_LEVEL_MAP);
    des.teleport_region({ region: [71, 16, 71, 16] });
    des.levregion({
        region: [0, 0, 78, 19],
        exclude: [67, 13, 78, 19],
        type: 'portal',
        name: 'water',
    });

    for (let index = 0; index < 40; ++index) des.trap('fire');
    for (const monster of FIRE_MONSTERS) des.monster(monster);
    for (let index = 0; index < 5; ++index)
        des.object({ id: BOULDER });
}

export const FIRE_LEVEL_LOADERS = Object.freeze({ fire });
