// earth_levels.js -- the Plane of Earth special-level definition.
// C ref: nethack-c/upstream/dat/earth.lua.

import { EARTH_LEVEL_MAP, EARTH_MONSTERS } from './earth_level_data.js';

// C ref: dat/earth.lua. Keep every des.* call in source order because the
// random terrain replacement, monster placement, and boulder placement each
// consume the level-generation random stream.
export async function earth(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'shortsighted');
    await des.message('Well done, mortal!');
    await des.message('But now thou must face the final Test...');
    await des.message('Prove thyself worthy or perish!');
    await des.map(EARTH_LEVEL_MAP);
    await des.replace_terrain({
        region: [0, 0, 75, 19],
        fromterrain: ' ',
        toterrain: '.',
        lit: 0,
        chance: 5,
    });
    await des.teleport_region({ region: [69, 16, 69, 16] });
    await des.levregion({
        region: [0, 0, 75, 19],
        exclude: [65, 13, 75, 19],
        type: 'portal',
        name: 'air',
    });

    for (const monster of EARTH_MONSTERS) {
        if (monster.form === 'named-at-coordinate') {
            await des.monster(monster.id, monster.x, monster.y);
        } else {
            await des.monster({
                id: monster.id,
                x: monster.x,
                y: monster.y,
                peaceful: monster.peaceful,
            });
        }
    }

    await des.object('boulder');
}

export const EARTH_LEVEL_LOADERS = Object.freeze({ earth });
