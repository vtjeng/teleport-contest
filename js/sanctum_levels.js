// sanctum_levels.js -- the Sanctum special-level definition.
//
// C refs: dat/sanctum.lua and sp_lev.c's des.* handlers.

import { SANCTUM_LEVEL_MAP } from './sanctum_level_data.js';
import { selection_area } from './themerooms.js';

// C ref: dat/sanctum.lua. Keep every descriptor in source order because the
// door, room fill, trap, object, monster, and level-flip paths consume RNG.
export async function sanctum(des) {
    await des.level_init({ style: 'solidfill', fg: ' ' });
    await des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'nommap');

    // This barrier is placed before des.map(), while the default coordinate
    // frame begins at column 1. The matching post-map barrier below begins at
    // map column 37; both select level columns 40 through 42.
    await des.non_passwall(selection_area(39, 0, 41, 0));
    await des.map(SANCTUM_LEVEL_MAP);

    await des.region({
        region: [15, 7, 21, 10],
        lit: 1,
        type: 'temple',
        filled: 2,
        async contents() {
            await des.door({ wall: 'random', state: 'secret' });
        },
    });
    await des.altar({ x: 18, y: 8, align: 'noalign', type: 'sanctum' });
    await des.region({
        region: [41, 6, 48, 11],
        lit: 0,
        type: 'morgue',
        filled: 1,
        irregular: 1,
    });

    await des.non_diggable(selection_area(0, 0, 75, 19));
    await des.non_passwall(selection_area(37, 0, 39, 19));

    await des.door('closed', 40, 6);
    await des.door('locked', 62, 6);
    await des.door('closed', 46, 12);
    await des.door('closed', 53, 10);

    for (let x = 13; x <= 23; ++x) await des.trap('fire', x, 5);
    for (let x = 13; x <= 23; ++x) await des.trap('fire', x, 12);
    for (let y = 6; y <= 11; ++y) await des.trap('fire', 13, y);
    for (let y = 6; y <= 11; ++y) await des.trap('fire', 23, y);

    await des.trap('spiked pit');
    await des.trap('fire');
    await des.trap('sleep gas');
    await des.trap('anti magic');
    await des.trap('fire');
    await des.trap('magic');

    await des.object('[');
    await des.object('[');
    await des.object('[');
    await des.object('[');
    await des.object(')');
    await des.object(')');
    await des.object('*');
    await des.object('!');
    await des.object('!');
    await des.object('!');
    await des.object('!');
    await des.object('?');
    await des.object('?');
    await des.object('?');
    await des.object('?');
    await des.object('?');

    await des.monster({ id: 'horned devil', x: 14, y: 12, peaceful: 0 });
    await des.monster({ id: 'barbed devil', x: 18, y: 8, peaceful: 0 });
    await des.monster({ id: 'erinys', x: 10, y: 4, peaceful: 0 });
    await des.monster({ id: 'marilith', x: 7, y: 9, peaceful: 0 });
    await des.monster({ id: 'nalfeshnee', x: 27, y: 8, peaceful: 0 });

    await des.monster({
        id: 'aligned cleric', x: 20, y: 3,
        align: 'noalign', peaceful: 0,
    });
    await des.monster({
        id: 'aligned cleric', x: 15, y: 4,
        align: 'noalign', peaceful: 0,
    });
    await des.monster({
        id: 'aligned cleric', x: 11, y: 5,
        align: 'noalign', peaceful: 0,
    });
    await des.monster({
        id: 'aligned cleric', x: 11, y: 7,
        align: 'noalign', peaceful: 0,
    });
    await des.monster({
        id: 'aligned cleric', x: 11, y: 9,
        align: 'noalign', peaceful: 0,
    });
    await des.monster({
        id: 'aligned cleric', x: 11, y: 12,
        align: 'noalign', peaceful: 0,
    });
    await des.monster({
        id: 'aligned cleric', x: 15, y: 13,
        align: 'noalign', peaceful: 0,
    });
    await des.monster({
        id: 'aligned cleric', x: 17, y: 13,
        align: 'noalign', peaceful: 0,
    });
    await des.monster({
        id: 'aligned cleric', x: 21, y: 13,
        align: 'noalign', peaceful: 0,
    });

    await des.monster('L');
    await des.monster('L');
    await des.monster('V');
    await des.monster('V');
    await des.monster('V');

    await des.stair('up', 63, 15);
    await des.teleport_region({
        region: [54, 1, 79, 18],
        region_islev: 1,
        dir: 'down',
    });
}

export const SANCTUM_LEVEL_LOADERS = Object.freeze({ sanctum });
