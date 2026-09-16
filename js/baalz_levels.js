// baalz_levels.js — Baalzebub's Gehennom special level definition.
//
// C refs: dat/baalz.lua and sp_lev.c's des.* handlers.

import { selection_area } from './themerooms.js';

// C ref: dat/baalz.lua. Keep trailing spaces in every row: the level map
// parser places them as STONE, so trimming them changes the map geometry.
const BAALZ_MAP = [
    '-------------------------------------------------',
    '|                   ----               ----      ',
    '|          ----     |     -----------  |         ',
    '| ------      |  ---------|.........|--P         ',
    '| F....|  -------|...........--------------      ',
    '---....|--|..................S............|----  ',
    '+...--....S..----------------|............S...|  ',
    '---....|--|..................|............|----  ',
    '| F....|  -------|...........-----S--------      ',
    '| ------      |  ---------|.........|--P         ',
    '|          ----     |     -----------  |         ',
    '|                   ----               ----      ',
    '-------------------------------------------------',
].join('\n');

// C ref: dat/baalz.lua. The whole program runs through the special-level
// descriptor API in source order; this includes the random object and trap
// calls whose RNG draws follow the map and fixed features.
export async function baalz(des) {
    await des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
    await des.level_flags('mazelevel', 'corrmaze');
    await des.map({ halign: 'right', valign: 'center', map: BAALZ_MAP });
    await des.levregion({
        region: [1, 0, 15, 20],
        region_islev: 1,
        exclude: [15, 1, 70, 16],
        exclude_islev: 1,
        type: 'stair-up',
    });
    await des.levregion({
        region: [1, 0, 15, 20],
        region_islev: 1,
        exclude: [15, 1, 70, 16],
        exclude_islev: 1,
        type: 'branch',
    });
    await des.teleport_region({
        region: [1, 0, 15, 20],
        region_islev: 1,
        exclude: [15, 1, 70, 16],
        exclude_islev: 1,
    });
    await des.non_diggable(selection_area(0, 0, 47, 12));
    await des.mazewalk(0, 6, 'west');
    await des.stair('down', 44, 6);
    await des.door('locked', 0, 6);

    await des.monster('Baalzebub', 35, 6);

    for (const objectClass of ['[', '[', ')', ')', '*', '!', '!', '?', '?', '?'])
        await des.object(objectClass);

    for (const trapType of [
        'spiked pit', 'fire', 'sleep gas', 'anti magic', 'fire', 'magic',
        'magic',
    ]) await des.trap(trapType);

    await des.monster('ghost', 37, 7);
    await des.monster('horned devil', 32, 5);
    await des.monster('barbed devil', 38, 7);
    await des.monster('L');
    await des.monster('V');
    await des.monster('V');
    await des.monster('V');
}

export const BAALZ_LEVEL_LOADERS = Object.freeze({ baalz });
