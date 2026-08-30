// quest_levels.js — Quest and special level definitions.
// C refs: dat/Bar-strt.lua, dat/tower1.lua, and related level files.

import { COLNO, FEMALE, G_GENOD, ROWNO } from './const.js';
import {
    PM_CHIEFTAIN, PM_GIANT_EEL, PM_OGRE, PM_PELIAS,
    PM_VAMPIRE, PM_VAMPIRE_LEADER, PM_VLAD_THE_IMPALER, S_VAMPIRE,
} from './monsters.js';
import { CHAIN_MAIL, CHEST, RUNESWORD, TALLOW_CANDLE, WAX_CANDLE } from './objects.js';
import { rn2 } from './rng.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

// C ref: selvar.c selection_do_randline(). Recursive midpoint displacement
// that draws a random zig-zag path from (x1,y1) to (x2,y2).
function selection_do_randline(x1, y1, x2, y2, rough, rec, sel) {
    if (rec < 1 || (x2 === x1 && y2 === y1))
        return;

    if (rough > Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)))
        rough = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

    let mx, my;
    if (rough < 2) {
        mx = Math.trunc((x1 + x2) / 2);
        my = Math.trunc((y1 + y2) / 2);
    } else {
        do {
            const dx = rn2(rough) - Math.trunc(rough / 2);
            const dy = rn2(rough) - Math.trunc(rough / 2);
            mx = Math.trunc((x1 + x2) / 2) + dx;
            my = Math.trunc((y1 + y2) / 2) + dy;
        } while (mx > COLNO - 1 || mx < 0 || my < 0 || my > ROWNO - 1);
    }

    if (!sel.get(mx, my)) {
        sel.set(mx, my);
    }

    rough = Math.trunc((rough * 2) / 3);
    rec--;

    selection_do_randline(x1, y1, mx, my, rough, rec, sel);
    selection_do_randline(mx, my, x2, y2, rough, rec, sel);

    sel.set(x2, y2);
}

// C ref: nhlsel.c l_selection_randline(). Creates a random path between
// two points with given roughness. Recursion depth fixed at 12.
export function selection_randline(x1, y1, x2, y2, roughness) {
    const sel = new ThemeroomSelection();
    selection_do_randline(x1, y1, x2, y2, roughness, 12, sel);
    return sel;
}

// C ref: selvar.c selection_floodfill(). Flood-fills from (x,y) to all
// connected cells with the same terrain type. Coordinates are map-relative;
// frame converts them to absolute for state.level.at() lookups.
export function selection_floodfill(x, y, state, frame) {
    const ox = frame?.xstart ?? 0;
    const oy = frame?.ystart ?? 0;
    const sel = new ThemeroomSelection();
    const startTyp = state.level.at(ox + x, oy + y)?.typ;
    if (startTyp == null) return sel;

    const stack = [{ x, y }];
    const visited = new ThemeroomSelection();

    while (stack.length > 0) {
        const { x: cx, y: cy } = stack.pop();
        const ax = ox + cx;
        const ay = oy + cy;
        if (ax < 0 || ax >= COLNO || ay < 0 || ay >= ROWNO) continue;
        if (visited.get(cx, cy)) continue;
        visited.set(cx, cy);

        const loc = state.level.at(ax, ay);
        if (!loc || loc.typ !== startTyp) continue;

        sel.set(cx, cy);
        stack.push({ x: cx + 1, y: cy });
        stack.push({ x: cx - 1, y: cy });
        stack.push({ x: cx, y: cy + 1 });
        stack.push({ x: cx, y: cy - 1 });
    }
    return sel;
}

// Intersection of two selections (Lua's & operator).
function selIntersect(a, b) {
    const result = new ThemeroomSelection();
    const boundsA = a.bounds();
    for (let x = boundsA.lx; x <= boundsA.hx; ++x) {
        for (let y = boundsA.ly; y <= boundsA.hy; ++y) {
            if (a.get(x, y) && b.get(x, y)) result.set(x, y);
        }
    }
    return result;
}

// C ref: dat/Bar-strt.lua. The Barbarian quest start level: Pelias's
// besieged encampment behind a river, with forest beyond.
async function barStrt(des, state) {
    const { frame } = des;
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport', 'hardfloor');
    des.map([
        '..................................PP........................................',
        '...................................PP.......................................',
        '...................................PP.......................................',
        '....................................PP......................................',
        '........--------------......-----....PPP....................................',
        '........|...S........|......+...|...PPP.....................................',
        '........|----........|......|...|....PP.....................................',
        '........|.\\..........+......-----...........................................', // eslint-disable-line no-useless-escape
        '........|----........|...............PP.....................................',
        '........|...S........|...-----.......PPP....................................',
        '........--------------...+...|......PPPPP...................................',
        '.........................|...|.......PPP....................................',
        '...-----......-----......-----........PP....................................',
        '...|...+......|...+..--+--.............PP...................................',
        '...|...|......|...|..|...|..............PP..................................',
        '...-----......-----..|...|.............PPPP.................................',
        '.....................-----............PP..PP................................',
        '.....................................PP...PP................................',
        '....................................PP...PP.................................',
        '....................................PP....PP................................',
    ]);

    // the forest beyond the river
    des.replace_terrain({
        region: [37, 0, 59, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 5,
    });
    des.replace_terrain({
        region: [60, 0, 64, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 10,
    });
    des.replace_terrain({
        region: [65, 0, 75, 19],
        fromterrain: '.',
        toterrain: 'T',
        chance: 20,
    });

    // guarantee a path and free spot for the portal
    des.terrain(selection_randline(37, 7, 62, 2, 7), '.');
    des.terrain(62, 2, '.');

    // Dungeon Description
    des.region(selection_area(0, 0, 75, 19), 'lit');
    des.region(selection_area(9, 5, 11, 5), 'unlit');
    des.region(selection_area(9, 7, 11, 7), 'lit');
    des.region(selection_area(9, 9, 11, 9), 'unlit');
    des.region(selection_area(13, 5, 20, 9), 'lit');
    des.region(selection_area(29, 5, 31, 6), 'lit');
    des.region(selection_area(26, 10, 28, 11), 'lit');
    des.region(selection_area(4, 13, 6, 14), 'lit');
    des.region(selection_area(15, 13, 17, 14), 'lit');
    des.region(selection_area(22, 14, 24, 15), 'lit');

    // Stairs
    des.stair({ dir: 'down', coord: [9, 9] });

    // Portal arrival point
    des.levregion({ region: [62, 2, 62, 2], type: 'branch' });

    // Doors
    des.door({ state: 'locked', coord: [12, 5] });
    des.door({ state: 'locked', coord: [12, 9] });
    des.door({ state: 'closed', coord: [21, 7] });
    des.door({ state: 'open', coord: [7, 13] });
    des.door({ state: 'open', coord: [18, 13] });
    des.door({ state: 'open', coord: [23, 13] });
    des.door({ state: 'open', coord: [25, 10] });
    des.door({ state: 'open', coord: [28, 5] });

    // Elder
    des.monster({
        id: PM_PELIAS,
        coord: [10, 7],
        inventory() {
            des.object({ id: RUNESWORD, spe: 5 });
            des.object({ id: CHAIN_MAIL, spe: 5 });
        },
    });

    // The treasure of Pelias
    des.object({ id: CHEST, coord: [9, 5] });

    // chieftain guards for the audience chamber
    des.monster({ id: PM_CHIEFTAIN, coord: [10, 5] });
    des.monster({ id: PM_CHIEFTAIN, coord: [10, 9] });
    des.monster({ id: PM_CHIEFTAIN, coord: [11, 5] });
    des.monster({ id: PM_CHIEFTAIN, coord: [11, 9] });
    des.monster({ id: PM_CHIEFTAIN, coord: [14, 5] });
    des.monster({ id: PM_CHIEFTAIN, coord: [14, 9] });
    des.monster({ id: PM_CHIEFTAIN, coord: [16, 5] });
    des.monster({ id: PM_CHIEFTAIN, coord: [16, 9] });

    // Non diggable walls
    des.non_diggable(selection_area(0, 0, 75, 19));

    // One trap to keep the ogres at bay.
    des.trap({ type: 'spiked pit', coord: [37, 7] });

    // Eels in the river
    des.monster({ id: PM_GIANT_EEL, coord: [36, 1] });
    des.monster({ id: PM_GIANT_EEL, coord: [37, 9] });
    des.monster({ id: PM_GIANT_EEL, coord: [39, 15] });

    // Monsters on siege duty.
    const ogrelocs = selIntersect(
        selection_floodfill(37, 7, state, frame),
        selection_area(40, 3, 45, 20),
    );
    for (let i = 0; i < 12; i++) {
        const pos = ogrelocs.rndcoord(true);
        des.monster({
            id: PM_OGRE,
            coord: [pos.x, pos.y],
            peaceful: 0,
        });
    }
}

// C ref: dat/tower1.lua — Upper stage of Vlad's tower.
function tower1(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport', 'hardfloor', 'solidify');
    des.map({
        halign: 'half-left',
        valign: 'center',
        map: [
            '  --- --- ---  ',
            '  |.| |.| |.|  ',
            '---S---S---S---',
            '|.......+.+...|',
            '---+-----.-----',
            '  |...\\.|.+.|  ',
            '---+-----.-----',
            '|.......+.+...|',
            '---S---S---S---',
            '  |.| |.| |.|  ',
            '  --- --- ---  ',
        ].join('\n'),
    });

    const niches = [[3, 1], [3, 9], [7, 1], [7, 9], [11, 1], [11, 9]];
    des.shuffle(niches);

    des.ladder({ dir: 'down', coord: [11, 5] });

    // The lord and his court
    des.monster({ id: PM_VLAD_THE_IMPALER, coord: [6, 5] });
    des.monster({ class: S_VAMPIRE, coord: niches[0] });
    des.monster({ class: S_VAMPIRE, coord: niches[1] });
    des.monster({ class: S_VAMPIRE, coord: niches[2] });

    // The brides, named unless vampires are genocided.
    // C ref: tower1.lua nh.is_genocided("vampire") check.
    const vgenod = (state.mvitals?.[PM_VAMPIRE]?.mvflags ?? 0) & G_GENOD;
    const vnames = vgenod ? [null, null, null]
        : ['Madame', 'Marquise', 'Countess'];
    des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[3],
        name: vnames[0], waiting: 1, parsedGender: FEMALE,
    });
    des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[4],
        name: vnames[1], waiting: 1, parsedGender: FEMALE,
    });
    des.monster({
        id: PM_VAMPIRE_LEADER, coord: niches[5],
        name: vnames[2], waiting: 1, parsedGender: FEMALE,
    });

    // Doors
    des.door({ state: 'closed', coord: [8, 3] });
    des.door({ state: 'closed', coord: [10, 3] });
    des.door({ state: 'closed', coord: [3, 4] });
    des.door({ state: 'locked', coord: [10, 5] });
    des.door({ state: 'locked', coord: [8, 7] });
    des.door({ state: 'locked', coord: [10, 7] });
    des.door({ state: 'closed', coord: [3, 6] });

    // Treasures
    des.object({ id: CHEST, coord: [7, 5] });
    des.object({ id: CHEST, coord: niches[5] });
    des.object({ id: CHEST, coord: niches[0] });
    des.object({ id: CHEST, coord: niches[1] });
    des.object({ id: CHEST, coord: niches[2] });
    des.object({
        id: CHEST,
        coord: niches[3],
        contents() {
            des.object({ id: WAX_CANDLE, quantity: 4 + rn2(5) });
        },
    });
    des.object({
        id: CHEST,
        coord: niches[4],
        contents() {
            des.object({ id: TALLOW_CANDLE, quantity: 4 + rn2(5) });
        },
    });

    // Protect the tower against outside attacks
    des.non_diggable();
}

export const QUEST_LEVEL_LOADERS = {
    'Bar-strt': barStrt,
    tower1,
};
