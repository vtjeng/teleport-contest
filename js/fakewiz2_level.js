// fakewiz2_level.js — The fake Wizard's Tower level.
// C refs: dat/fakewiz2.lua, dat/nhlib.lua hell_tweaks(), selvar.c selection
// operations, and sp_lev.c's des.* handlers.

import { selection_match } from './bigrm.js';
import { hellTweaks } from './asmodeus_levels.js';
import { ThemeroomSelection } from './themerooms.js';

const FAKEWIZ2_MAP = [
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

function absoluteArea(x1, y1, x2, y2, frame) {
    const result = new ThemeroomSelection(null, true);
    for (let x = x1; x <= x2; ++x) {
        for (let y = y1; y <= y2; ++y)
            result.set(frame.xstart + x, frame.ystart + y);
    }
    return result;
}

function selectionUnion(a, b) {
    const result = a.clone();
    const { lx, ly, hx, hy } = b.bounds();
    for (let x = lx; x <= hx; ++x) {
        for (let y = ly; y <= hy; ++y) {
            if (b.get(x, y)) result.set(x, y);
        }
    }
    return result;
}

// C ref: dat/fakewiz2.lua. Keep descriptor order: placements and
// hell_tweaks consume the same generation RNG stream as the C loader.
export async function fakewiz2(des, state) {
    await des.level_init({ style: 'mazegrid', bg: '-' });
    await des.level_flags('mazelevel');

    const bnds = selection_match('-', state).bounds();
    const bounds2 = absoluteArea(
        bnds.lx, bnds.ly + 1, bnds.hx - 2, bnds.hy - 1, des.frame,
    );

    const placed = await des.map({
        halign: 'center',
        valign: 'center',
        map: FAKEWIZ2_MAP,
        async contents() {
            await des.levregion({
                region: [1, 0, 79, 20], region_islev: 1,
                exclude: [0, 0, 8, 8], type: 'stair-up',
            });
            await des.levregion({
                region: [1, 0, 79, 20], region_islev: 1,
                exclude: [0, 0, 8, 8], type: 'stair-down',
            });
            await des.levregion({
                region: [1, 0, 79, 20], region_islev: 1,
                exclude: [0, 0, 8, 8], type: 'branch',
            });
            await des.teleport_region({
                region: [1, 0, 79, 20], region_islev: 1,
                exclude: [2, 2, 6, 6],
            });
            await des.mazewalk(8, 5, 'east');
            await des.monster('L', 4, 4);
            await des.monster('vampire lord', 3, 4);
            await des.monster('kraken', 6, 6);
            await des.trap('board', 4, 3);
            await des.trap('board', 4, 5);
            await des.trap('board', 3, 4);
            await des.trap('board', 5, 4);
            await des.object('"', 4, 4);
        },
    });

    await hellTweaks(des, selectionUnion(bounds2.negate(), placed.selection), state);
}

export const FAKEWIZ2_LEVEL_LOADERS = Object.freeze({ fakewiz2 });
