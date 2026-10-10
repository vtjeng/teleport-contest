// water_levels.js -- the Plane of Water special-level definition.
// C refs: dat/water.lua and sp_lev.c lspo_level_init(), lspo_level_flags(),
// lspo_message(), lspo_map(), lspo_teleport_region(), lspo_levregion(),
// and lspo_monster().

const WATER_LEVEL_MAP = Array(20).fill('W'.repeat(76)).join('\n');

// C ref: dat/water.lua. Keep the calls in source order: every monster
// descriptor chooses a location and may consume construction RNG.
export async function water(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'shortsighted');
    await des.message(
        'You find yourself suspended in an air bubble surrounded by water.',
    );
    // The current JS des.map adapter takes the C string-form map as rows.
    await des.map(WATER_LEVEL_MAP.split('\n'));
    await des.teleport_region({ region: [0, 0, 25, 19] });
    await des.levregion({
        type: 'portal',
        region: [51, 0, 75, 19],
        name: 'astral',
    });

    for (let count = 0; count < 8; ++count) await des.monster('giant eel');
    for (let count = 0; count < 8; ++count) await des.monster('electric eel');
    for (let count = 0; count < 9; ++count) await des.monster('kraken');
    for (let count = 0; count < 4; ++count) await des.monster('shark');
    for (let count = 0; count < 4; ++count) await des.monster('piranha');
    for (let count = 0; count < 4; ++count) await des.monster('jellyfish');
    for (let count = 0; count < 4; ++count) await des.monster(';');
    for (let count = 0; count < 19; ++count) {
        await des.monster({ id: 'water elemental', peaceful: 0 });
    }
}

export const WATER_LEVEL_LOADERS = Object.freeze({ water });
