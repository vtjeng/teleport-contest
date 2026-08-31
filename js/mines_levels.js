// mines_levels.js — Mines special level definitions.
// C ref: dat/minefill.lua.

import { def_char_to_monclass } from './drawing.js';
import { MALE } from './const.js';
import {
    PM_DWARF,
    PM_GNOME,
    PM_GNOME_LEADER,
} from './monsters.js';
import {
    BOULDER,
    GEM_CLASS,
    TOOL_CLASS,
} from './objects.js';
import { rn2 } from './rng.js';

// C ref: dat/minefill.lua. Mines filler level: cellular-automata cavern
// with gnomes, dwarves, gems, and traps.
async function minefill(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });

    des.level_flags('mazelevel', 'noflip');

    des.level_init({
        style: 'mines',
        fg: '.',
        bg: ' ',
        smoothed: true,
        joined: true,
        walled: true,
    });

    des.stair('up');
    des.stair('down');

    // C ref: minefill.lua:23-25. 2-5 gems.
    const gemCount = 2 + rn2(4);
    for (let i = 0; i < gemCount; i++) {
        des.object({ class: GEM_CLASS });
    }
    // C ref: minefill.lua:26. One tool.
    des.object({ class: TOOL_CLASS });
    // C ref: minefill.lua:27-29. 2-4 random objects.
    const objCount = 2 + rn2(3);
    for (let i = 0; i < objCount; i++) {
        des.object({});
    }
    // C ref: minefill.lua:30-34. 75% chance of 1-2 boulders.
    if (rn2(100) < 75) {
        const boulderCount = 1 + rn2(2);
        for (let i = 0; i < boulderCount; i++) {
            des.object({ id: BOULDER });
        }
    }

    // C ref: minefill.lua:36-38. 6-8 gnomes.
    const gnomeCount = 6 + rn2(3);
    for (let i = 0; i < gnomeCount; i++) {
        des.monster({ id: PM_GNOME });
    }
    // C ref: minefill.lua:39-44. gnome lord, 2 dwarves, 2 G-class, 1 G or h.
    // C: des.monster("gnome lord") — name_to_monplus matches
    // pmnames[MALE], so find_montype sets mgend = MALE without rn2(2).
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });
    des.monster({ class: def_char_to_monclass('G') });
    des.monster({ class: def_char_to_monclass('G') });
    des.monster({
        class: def_char_to_monclass(rn2(100) < 50 ? 'h' : 'G'),
    });

    // C ref: minefill.lua:46-51. 6 random traps.
    for (let i = 0; i < 6; i++) {
        des.trap();
    }
}

export const MINES_LEVEL_LOADERS = {
    minefill,
};
