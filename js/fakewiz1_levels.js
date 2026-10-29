// fakewiz1_levels.js — The false Wizard's Tower level used by the Wizard
// debug level menu. Source: dat/fakewiz1.lua and dat/nhlib.lua.

import { selection_match } from './bigrm.js';
import { hellTweaks } from './asmodeus_levels.js';
import { ThemeroomSelection } from './themerooms.js';

const FAKEWIZ1_MAP = [
    '.........',
    '.}}}}}}}.',
    '.}}---}}.',
    '.}--.--}.',
    '.}|...|}.',
    '.}--.--}.',
    '.}}---}}.',
    '.}}}}}}}.',
    '.........',
].join('\n');

function union(a, b) {
    const result = a.clone();
    const bounds = b.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x)
        for (let y = bounds.ly; y <= bounds.hy; ++y)
            if (b.get(x, y)) result.set(x, y);
    return result;
}

function absoluteArea(x1, y1, x2, y2, frame) {
    const result = new ThemeroomSelection(null, true);
    for (let x = x1; x <= x2; ++x)
        for (let y = y1; y <= y2; ++y)
            result.set(frame.xstart + x, frame.ystart + y);
    return result;
}

// C ref: dat/fakewiz1.lua, preserving descriptor order for level RNG parity.
export async function fakewiz1(des, state) {
    await des.level_init({ style: 'mazegrid', bg: '-' });
    await des.level_flags('mazelevel');
    const bounds = selection_match('-', state).bounds();
    const protectedBounds = absoluteArea(bounds.lx, bounds.ly + 1,
        bounds.hx - 2, bounds.hy - 1, des.frame);
    const map = await des.map({
        halign: 'center', valign: 'center', map: FAKEWIZ1_MAP,
        async contents() {
            const levelRegion = { region: [1, 0, 79, 20], region_islev: 1,
                exclude: [0, 0, 8, 8] };
            await des.levregion({ ...levelRegion, type: 'stair-up' });
            await des.levregion({ ...levelRegion, type: 'stair-down' });
            await des.levregion({ ...levelRegion, type: 'branch' });
            await des.teleport_region({ region: [1, 0, 79, 20], region_islev: 1,
                exclude: [2, 2, 6, 6] });
            await des.levregion({ region: [4, 4, 4, 4], type: 'portal', name: 'wizard3' });
            await des.mazewalk(8, 5, 'east');
            await des.region({ region: [4, 3, 6, 6], lit: 0, type: 'ordinary',
                irregular: 1, arrival_room: true });
            await des.monster('L', 4, 4);
            await des.monster('vampire lord', 3, 4);
            await des.monster('kraken', 6, 6);
            await des.trap('board', 4, 3);
            await des.trap('board', 4, 5);
            await des.trap('board', 3, 4);
            await des.trap('board', 5, 4);
        },
    });
    await hellTweaks(des, union(protectedBounds.negate(), map.selection), state);
}

export const FAKEWIZ1_LEVEL_LOADERS = Object.freeze({ fakewiz1 });
