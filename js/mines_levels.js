// mines_levels.js — Mines special level definitions.
// C ref: dat/minefill.lua, dat/minetn-1.lua through dat/minetn-7.lua,
//        dat/minend-1.lua through dat/minend-3.lua.

import { def_char_to_monclass } from './drawing.js';
import { MALE } from './const.js';
import {
    PM_ALIGNED_CLERIC,
    PM_DOG,
    PM_DWARF,
    PM_ETTIN_MUMMY,
    PM_GNOME,
    PM_GNOME_LEADER,
    PM_GNOME_RULER,
    PM_GNOMISH_WIZARD,
    PM_GOBLIN,
    PM_HILL_ORC,
    PM_HOBBIT,
    PM_KITTEN,
    PM_KOBOLD,
    PM_KOBOLD_SHAMAN,
    PM_MONK,
    PM_MONKEY,
    PM_MORDOR_ORC,
    PM_ORC_CAPTAIN,
    PM_ORC_SHAMAN,
    PM_SHOPKEEPER,
    PM_URUK_HAI,
    PM_WATCHMAN,
    PM_WATCH_CAPTAIN,
    S_EYE,
    S_MUMMY,
    S_VAMPIRE,
    S_ZOMBIE,
} from './monsters.js';
import {
    AMETHYST,
    BOULDER,
    CHEST,
    CORPSE,
    DIAMOND,
    EMERALD,
    FLINT,
    GEM_CLASS,
    LOADSTONE,
    LUCKSTONE,
    OIL_LAMP,
    POTION_CLASS,
    POT_BOOZE,
    POT_OBJECT_DETECTION,
    RING_CLASS,
    ROCK,
    RUBY,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    STATUE,
    TALLOW_CANDLE,
    TOOL_CLASS,
    WAN_MAGIC_MISSILE,
    WAN_STRIKING,
    WAX_CANDLE,
    WORTHLESS_GREEN_GLASS,
    WORTHLESS_RED_GLASS,
    WORTHLESS_VIOLET_GLASS,
    WORTHLESS_WHITE_GLASS,
} from './objects.js';
import { rn2 } from './rng.js';
import { selection_floodfill } from './quest_levels.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

function percent(threshold) {
    return rn2(100) < threshold;
}

// C ref: dat/nhlib.lua monkfoodshop(). Returns "health food shop" for Monks,
// "food shop" for all other roles.
function monkfoodshop(state) {
    return state.urole?.mnum === PM_MONK ? 'health food shop' : 'food shop';
}

// C ref: selvar.c selection intersection (Lua's & operator).
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

// C ref: dat/minetn-1.lua. Orcish Town — Frontier Town overrun by orcs.
// Map-based with barricades, dead shopkeepers, and an orc army.
async function minetn1(des, state) {
    const { frame } = des;

    des.level_flags('mazelevel');

    des.level_init({
        style: 'mines',
        fg: '.',
        bg: ' ',
        smoothed: true,
        joined: true,
        walled: true,
    });

    des.map([
        '.....................................',
        '.----------------F------------------.',
        '.|.................................|.',
        '.|.-------------......------------.|.',
        '.|.|...|...|...|......|..|...|...|.|.',
        '.F.|...|...|...|......|..|...|...|.|.',
        '.|.|...|...|...|......|..|...|...|.F.',
        '.|.|...|...|----......------------.|.',
        '.|.---------.......................|.',
        '.|.................................|.',
        '.|.---------.....--...--...........|.',
        '.|.|...|...|----.|.....|.---------.|.',
        '.|.|...|...|...|.|.....|.|..|....|.|.',
        '.|.|...|...|...|.|.....|.|..|....|.|.',
        '.|.|...|...|...|.|.....|.|..|....|.|.',
        '.|.-------------.-------.---------.|.',
        '.|.................................F.',
        '.-----------F------------F----------.',
        '.....................................',
    ]);

    des.teleport_region({
        region: [1, 1, 75, 19],
        exclude: [1, 0, 35, 21],
        region_islev: 1,
    });
    des.region(selection_area(1, 1, 35, 17), 'lit');
    des.levregion({
        type: 'stair-up',
        region: [1, 3, 21, 19],
        region_islev: 1,
        exclude: [0, 1, 36, 17],
    });
    des.levregion({
        type: 'stair-down',
        region: [57, 3, 75, 19],
        region_islev: 1,
        exclude: [0, 1, 36, 17],
    });

    des.feature('fountain', 16, 9);
    des.feature('fountain', 25, 9);

    des.altar({ x: 20, y: 13, align: 'noalign', type: 'shrine' });

    des.door('random', 5, 8);
    des.door('random', 9, 8);
    des.door('random', 13, 7);
    des.door('random', 22, 5);
    des.door('random', 27, 7);
    des.door('random', 31, 7);
    des.door('random', 5, 10);
    des.door('random', 9, 10);
    des.door('random', 15, 13);
    des.door('random', 25, 13);
    des.door('random', 31, 11);

    des.replace_terrain({
        region: [7, 4, 11, 6],
        fromterrain: '|',
        toterrain: '.',
        chance: 18,
    });
    des.replace_terrain({
        region: [25, 4, 29, 6],
        fromterrain: '|',
        toterrain: '.',
        chance: 18,
    });
    des.replace_terrain({
        region: [7, 12, 11, 14],
        fromterrain: '|',
        toterrain: '.',
        chance: 18,
    });
    des.replace_terrain({
        region: [28, 12, 28, 14],
        fromterrain: '|',
        toterrain: '.',
        chance: 33,
    });

    // C ref: minetn-1.lua:74. One spot in most shops, shuffled.
    const place = [
        [5, 4], [9, 5], [13, 4], [26, 4], [31, 5],
        [30, 14], [5, 14], [10, 13], [26, 14], [27, 13],
    ];
    des.shuffle(place);

    des.object({ id: CORPSE, coord: [20, 12], montype: PM_ALIGNED_CLERIC });
    des.object({ id: CORPSE, coord: place[0], montype: PM_SHOPKEEPER });
    des.object({ id: CORPSE, coord: place[1], montype: PM_SHOPKEEPER });
    des.object({ id: CORPSE, coord: place[2], montype: PM_SHOPKEEPER });
    des.object({ id: CORPSE, coord: place[3], montype: PM_SHOPKEEPER });
    des.object({ id: CORPSE, coord: place[4], montype: PM_SHOPKEEPER });
    des.object({ id: CORPSE, montype: PM_WATCHMAN });
    des.object({ id: CORPSE, montype: PM_WATCHMAN });
    des.object({ id: CORPSE, montype: PM_WATCHMAN });
    des.object({ id: CORPSE, montype: PM_WATCHMAN });
    des.object({ id: CORPSE, montype: PM_WATCH_CAPTAIN });

    // C ref: minetn-1.lua:91-96. Rubble: 10-19 rocks, 90% with boulder.
    const rubbleCount = rn2(10) + 10;
    for (let i = 0; i < rubbleCount; i++) {
        if (percent(90)) {
            des.object({ id: BOULDER });
        }
        des.object({ id: ROCK });
    }

    // C ref: minetn-1.lua:98-105. Candles totaling at least 7.
    des.object({ id: WAX_CANDLE, coord: place[3], quantity: rn2(2) + 1 });
    des.object({ id: WAX_CANDLE, coord: place[0], quantity: rn2(3) + 2 });
    des.object({ id: WAX_CANDLE, coord: place[1], quantity: rn2(2) + 1 });
    des.object({ id: TALLOW_CANDLE, coord: place[2], quantity: rn2(3) + 1 });
    des.object({ id: TALLOW_CANDLE, coord: place[1], quantity: rn2(2) + 1 });
    des.object({ id: TALLOW_CANDLE, coord: place[3], quantity: rn2(2) + 1 });

    des.object({ id: OIL_LAMP, coord: place[1] });
    des.object({
        id: WAN_STRIKING, coord: place[0], buc: 'uncursed', spe: 0,
    });
    des.object({
        id: WAN_STRIKING, coord: place[2], buc: 'uncursed', spe: 0,
    });
    des.object({
        id: WAN_STRIKING, coord: place[3], buc: 'uncursed', spe: 0,
    });
    des.object({
        id: WAN_MAGIC_MISSILE, coord: place[3], buc: 'uncursed', spe: 0,
    });
    des.object({
        id: WAN_MAGIC_MISSILE, coord: place[4], buc: 'uncursed', spe: 0,
    });

    // C ref: minetn-1.lua:117-131. The Orcish Army.
    const inside = selection_floodfill(18, 8, state, frame);
    const nearTemple = selIntersect(selection_area(17, 8, 23, 14), inside);

    const armyCount = rn2(11) + 5;
    for (let i = 0; i < armyCount; i++) {
        if (percent(50)) {
            const pos = inside.rndcoord(true);
            des.monster({
                id: PM_ORC_CAPTAIN,
                coord: [pos.x, pos.y],
                peaceful: 0,
            });
        } else {
            if (percent(80)) {
                const pos = inside.rndcoord(true);
                des.monster({
                    id: PM_URUK_HAI,
                    coord: [pos.x, pos.y],
                    peaceful: 0,
                });
            } else {
                const pos = inside.rndcoord(true);
                des.monster({
                    id: PM_MORDOR_ORC,
                    coord: [pos.x, pos.y],
                    peaceful: 0,
                });
            }
        }
    }
    // C ref: minetn-1.lua:133-137. Shamans near the temple.
    const shamanCount = rn2(6) + 1;
    for (let i = 0; i < shamanCount; i++) {
        const pos = nearTemple.rndcoord(false);
        des.monster({
            id: PM_ORC_SHAMAN,
            coord: [pos.x, pos.y],
            peaceful: 0,
            m_lev_adj: (i === 0) ? 3 : 0,
        });
    }
    // C ref: minetn-1.lua:140-146. Hill orcs and goblins outside.
    const outsideCount = rn2(10) + 10;
    for (let i = 0; i < outsideCount; i++) {
        if (percent(90)) {
            des.monster({ id: PM_HILL_ORC, peaceful: 0 });
        } else {
            des.monster({ id: PM_GOBLIN, peaceful: 0 });
        }
    }

    des.wallify();
}

// C ref: dat/minetn-2.lua. Town Square — room-based with central 31x15 room,
// conditional subrooms, 4 shops, and a temple.
async function minetn2(des, state) {
    des.room({
        type: 'ordinary', lit: 1, x: 3, y: 3,
        xalign: 'center', yalign: 'center', w: 31, h: 15,
        contents() {
            des.feature('fountain', 17, 5);
            des.feature('fountain', 13, 8);

            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 2, y: 0, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'west' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 0, x: 5, y: 0, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'south' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 8, y: 0, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'east' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 1, x: 16, y: 0, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'west' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 0, x: 19, y: 0, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'south' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 22, y: 0, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'south' });
                        des.monster({ id: PM_GNOME });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 0, x: 25, y: 0, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'east' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 1, x: 2, y: 5, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'north' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 1, x: 5, y: 5, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'south' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 8, y: 5, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'locked', wall: 'north' });
                        des.monster({ id: PM_GNOME });
                    },
                });
            }

            des.room({
                type: 'shop', chance: 90, lit: 1, x: 2, y: 10, w: 4, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                },
            });
            des.room({
                type: 'tool shop', chance: 90, lit: 1,
                x: 23, y: 10, w: 4, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'east' });
                },
            });
            des.room({
                type: monkfoodshop(state), chance: 90, lit: 1,
                x: 24, y: 5, w: 3, h: 4,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                },
            });
            des.room({
                type: 'candle shop', lit: 1, x: 11, y: 10, w: 4, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'east' });
                },
            });

            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 0, x: 7, y: 10, w: 3, h: 3,
                    contents() {
                        des.door({ state: 'locked', wall: 'north' });
                        des.monster({ id: PM_GNOME });
                    },
                });
            }

            des.room({
                type: 'temple', lit: 1, x: 19, y: 5, w: 4, h: 4,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                    des.altar({
                        x: 2, y: 2,
                        align: state.specialLevelAlign[0],
                        type: 'shrine',
                    });
                    des.monster({ id: PM_GNOMISH_WIZARD });
                    des.monster({ id: PM_GNOMISH_WIZARD });
                },
            });

            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 1, x: 18, y: 10, w: 4, h: 3,
                    contents() {
                        des.door({ state: 'locked', wall: 'west' });
                        des.monster({
                            id: PM_GNOME_LEADER, parsedGender: MALE,
                        });
                    },
                });
            }

            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCH_CAPTAIN, peaceful: 1 });
        },
    });

    des.room({
        contents() {
            des.stair('up');
        },
    });
    des.room({
        contents() {
            des.stair('down');
            des.trap();
            des.monster({ id: PM_GNOME });
            des.monster({ id: PM_GNOME });
        },
    });
    des.room({
        contents() {
            des.monster({ id: PM_DWARF });
        },
    });
    des.room({
        contents() {
            des.trap();
            des.monster({ id: PM_GNOME });
        },
    });

    des.random_corridors();
}

// C ref: dat/minetn-3.lua. Alley Town — room-based with narrow alleys,
// shops, and a temple.
async function minetn3(des, state) {
    des.room({
        type: 'ordinary', lit: 1, x: 3, y: 3,
        xalign: 'center', yalign: 'center', w: 31, h: 15,
        contents() {
            des.feature('fountain', 1, 6);
            des.feature('fountain', 29, 13);

            des.room({
                type: 'ordinary', x: 2, y: 2, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });
            des.room({
                type: 'tool shop', chance: 30, lit: 1,
                x: 5, y: 3, w: 2, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });
            des.room({
                type: 'ordinary', x: 2, y: 10, w: 2, h: 3,
                contents() {
                    des.door({ state: 'locked', wall: 'north' });
                    des.monster({ class: def_char_to_monclass('G') });
                },
            });
            des.room({
                type: 'ordinary', x: 5, y: 9, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                },
            });
            des.room({
                type: 'temple', lit: 1, x: 10, y: 2, w: 3, h: 4,
                contents() {
                    des.door({ state: 'closed', wall: 'east' });
                    des.altar({
                        x: 1, y: 1,
                        align: state.specialLevelAlign[0],
                        type: 'shrine',
                    });
                    des.monster({ id: PM_GNOMISH_WIZARD });
                    des.monster({ id: PM_GNOMISH_WIZARD });
                },
            });
            des.room({
                type: 'ordinary', x: 11, y: 7, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                },
            });
            des.room({
                type: 'shop', lit: 1, x: 10, y: 10, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                },
            });
            des.room({
                type: 'ordinary', x: 14, y: 8, w: 2, h: 2,
                contents() {
                    des.door({ state: 'locked', wall: 'north' });
                    des.monster({ class: def_char_to_monclass('G') });
                },
            });
            des.room({
                type: 'ordinary', x: 14, y: 11, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });
            des.room({
                type: 'tool shop', chance: 40, lit: 1,
                x: 17, y: 10, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                },
            });
            des.room({
                type: 'ordinary', x: 21, y: 11, w: 2, h: 2,
                contents() {
                    des.door({ state: 'locked', wall: 'east' });
                    des.monster({ class: def_char_to_monclass('G') });
                },
            });
            des.room({
                type: monkfoodshop(state), chance: 90, lit: 1,
                x: 26, y: 8, w: 3, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                },
            });
            des.room({
                type: 'ordinary', x: 16, y: 2, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                },
            });
            des.room({
                type: 'ordinary', x: 19, y: 2, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                },
            });
            des.room({
                type: 'wand shop', chance: 30, lit: 1,
                x: 19, y: 5, w: 3, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                },
            });
            des.room({
                type: 'candle shop', lit: 1, x: 25, y: 2, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });

            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCH_CAPTAIN, peaceful: 1 });
        },
    });

    des.room({
        type: 'ordinary',
        contents() { des.stair('up'); },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.stair('down');
            des.trap();
            des.monster({ id: PM_GNOME });
            des.monster({ id: PM_GNOME });
        },
    });
    des.room({
        type: 'ordinary',
        contents() { des.monster({ id: PM_DWARF }); },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.trap();
            des.monster({ id: PM_GNOME });
        },
    });

    des.random_corridors();
}

// C ref: dat/minetn-4.lua. College Town — room-based with bookshop,
// temple, and varied residents.
async function minetn4(des, state) {
    des.room({
        type: 'ordinary', lit: 1, x: 3, y: 3,
        xalign: 'center', yalign: 'center', w: 30, h: 15,
        contents() {
            des.feature('fountain', 8, 7);
            des.feature('fountain', 18, 7);

            des.room({
                type: 'book shop', lit: 1, x: 4, y: 2, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });
            des.room({
                type: 'ordinary', x: 8, y: 2, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });
            des.room({
                type: 'temple', lit: 1, x: 11, y: 3, w: 5, h: 4,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                    des.altar({
                        x: 2, y: 1,
                        align: state.specialLevelAlign[0],
                        type: 'shrine',
                    });
                    des.monster({ id: PM_GNOMISH_WIZARD });
                    des.monster({ id: PM_GNOMISH_WIZARD });
                },
            });
            des.room({
                type: 'ordinary', x: 19, y: 2, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                    des.monster({ class: def_char_to_monclass('G') });
                },
            });
            des.room({
                type: 'candle shop', lit: 1, x: 22, y: 2, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });
            des.room({
                type: 'ordinary', x: 26, y: 2, w: 2, h: 2,
                contents() {
                    des.door({ state: 'locked', wall: 'east' });
                    des.monster({ class: def_char_to_monclass('G') });
                },
            });
            des.room({
                type: 'tool shop', chance: 90, lit: 1,
                x: 4, y: 10, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                },
            });
            des.room({
                type: 'ordinary', x: 8, y: 11, w: 2, h: 2,
                contents() {
                    des.door({ state: 'locked', wall: 'south' });
                    des.monster({ id: PM_KOBOLD_SHAMAN });
                    des.monster({ id: PM_KOBOLD_SHAMAN });
                    des.monster({ id: PM_KITTEN });
                    des.monster({ class: def_char_to_monclass('f') });
                },
            });
            des.room({
                type: monkfoodshop(state), chance: 90, lit: 1,
                x: 11, y: 11, w: 3, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'east' });
                },
            });
            des.room({
                type: 'ordinary', x: 17, y: 11, w: 2, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                },
            });
            des.room({
                type: 'ordinary', x: 20, y: 10, w: 2, h: 2,
                contents() {
                    des.door({ state: 'locked', wall: 'north' });
                    des.monster({ class: def_char_to_monclass('G') });
                },
            });
            des.room({
                type: 'shop', chance: 90, lit: 1,
                x: 23, y: 10, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                },
            });

            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCH_CAPTAIN, peaceful: 1 });
        },
    });

    des.room({
        type: 'ordinary',
        contents() { des.stair('up'); },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.stair('down');
            des.trap();
            des.monster({ id: PM_GNOME });
            des.monster({ id: PM_GNOME });
        },
    });
    des.room({
        type: 'ordinary',
        contents() { des.monster({ id: PM_DWARF }); },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.trap();
            des.monster({ id: PM_GNOME });
        },
    });

    des.random_corridors();
}

// C ref: dat/minetn-5.lua. Grotto Town — large map-based cavern with shops
// as regions, gnome homes, and a gnome king statue.
async function minetn5(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel');

    des.map([
        '-----         ---------                                                    ',
        '|...---  ------.......--    -------                       ---------------  ',
        '|.....----.........--..|    |.....|          -------      |.............|  ',
        '--..-....-.----------..|    |.....|          |.....|     --+---+--.----+-  ',
        ' --.--.....----     ----    |.....|  ------  --....----  |..-...--.-.+..|  ',
        '  ---.........----  -----   ---+---  |..+.|   ---..-..----..---+-..---..|  ',
        '    ----.-....|..----...--    |.|    |..|.|    ---+-.....-+--........--+-  ',
        '       -----..|....-.....---- |.|    |..|.------......--................|  ',
        '    ------ |..|.............---.--   ----.+..|-.......--..--------+--..--  ',
        '    |....| --......---...........-----  |.|..|-...{....---|.........|..--  ',
        '    |....|  |........-...-...........----.|..|--.......|  |.........|...|  ',
        '    ---+--------....-------...---......--.-------....---- -----------...|  ',
        ' ------.---...--...--..-..--...-..---...|.--..-...-....------- |.......--  ',
        ' |..|-.........-..---..-..---.....--....|........---...-|....| |.-------   ',
        ' |..+...............-+---+-----..--..........--....--...+....| |.|...S.    ',
        '-----.....{....----...............-...........--...-...-|....| |.|...|     ',
        '|..............-- --+--.---------.........--..-........------- |.--+-------',
        '-+-----.........| |...|.|....|  --.......------...|....---------.....|....|',
        '|...| --..------- |...|.+....|   ---...---    --..|...--......-...{..+..-+|',
        '|...|  ----       ------|....|     -----       -----.....----........|..|.|',
        '-----                   ------                     -------  ---------------',
    ]);

    if (percent(75)) {
        if (percent(50)) {
            des.terrain(selection_area(25, 8, 25, 9), '|');
        } else {
            des.terrain(selection_area(16, 13, 17, 13), '-');
        }
    }
    if (percent(75)) {
        if (percent(50)) {
            des.terrain(selection_area(36, 10, 36, 11), '|');
        } else {
            des.terrain(selection_area(32, 15, 33, 15), '-');
        }
    }
    if (percent(50)) {
        des.terrain(selection_area(21, 4, 22, 5), '.');
        des.terrain(selection_area(14, 9, 14, 10), '|');
    }
    if (percent(50)) {
        des.terrain([46, 13], '|');
        des.terrain(selection_area(43, 5, 47, 5), '-');
        des.terrain(selection_area(42, 6, 46, 6), '.');
        des.terrain(selection_area(46, 7, 47, 7), '.');
    }
    if (percent(50)) {
        des.terrain(selection_area(69, 11, 71, 11), '-');
    }

    des.stair({ dir: 'up', coord: [1, 1] });
    des.stair({ dir: 'down', coord: [46, 3] });
    des.feature('fountain', 50, 9);
    des.feature('fountain', 10, 15);
    des.feature('fountain', 66, 18);

    des.region(selection_area(0, 0, 74, 20), 'unlit');
    des.region(selection_area(9, 13, 11, 17), 'lit');
    des.region(selection_area(8, 14, 12, 16), 'lit');
    des.region(selection_area(49, 7, 51, 11), 'lit');
    des.region(selection_area(48, 8, 52, 10), 'lit');
    des.region(selection_area(64, 17, 68, 19), 'lit');
    des.region(selection_area(37, 13, 39, 17), 'lit');
    des.region(selection_area(36, 14, 40, 17), 'lit');
    des.region(selection_area(59, 2, 72, 10), 'lit');

    des.monster({ id: PM_WATCHMAN, peaceful: 1 });
    des.monster({ id: PM_WATCHMAN, peaceful: 1 });
    des.monster({ id: PM_WATCHMAN, peaceful: 1 });
    des.monster({ id: PM_WATCHMAN, peaceful: 1 });
    des.monster({ id: PM_WATCH_CAPTAIN, peaceful: 1 });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });

    // Shops
    des.region({
        region: [25, 17, 28, 19], lit: 1,
        type: 'candle shop', filled: 1,
    });
    des.door('closed', 24, 18);
    des.region({
        region: [59, 9, 67, 10], lit: 1, type: 'shop', filled: 1,
    });
    des.door('closed', 66, 8);
    des.region({
        region: [57, 13, 60, 15], lit: 1, type: 'tool shop', filled: 1,
    });
    des.door('closed', 56, 14);
    des.region({
        region: [5, 9, 8, 10], lit: 1,
        type: monkfoodshop(state), filled: 1,
    });
    des.door('closed', 7, 11);

    // Gnome homes
    des.door('closed', 4, 14);
    des.door('locked', 1, 17);
    des.monster({ id: PM_GNOMISH_WIZARD, coord: [2, 19] });
    des.door('locked', 20, 16);
    des.monster({ class: def_char_to_monclass('G'), coord: [20, 18] });
    des.door('random', 21, 14);
    des.door('random', 25, 14);
    des.door('random', 42, 8);
    des.door('locked', 40, 5);
    des.monster({ class: def_char_to_monclass('G'), coord: [38, 7] });
    des.door('random', 59, 3);
    des.door('random', 58, 6);
    des.door('random', 63, 3);
    des.door('random', 63, 5);
    des.door('locked', 71, 3);
    des.door('locked', 71, 6);
    des.door('closed', 69, 4);
    des.door('closed', 67, 16);
    des.monster({ id: PM_GNOMISH_WIZARD, coord: [67, 14] });
    des.object({ class: RING_CLASS, coord: [70, 14] });
    des.door('locked', 69, 18);
    des.monster({
        id: PM_GNOME_LEADER, parsedGender: MALE, coord: [71, 19],
    });
    des.door('locked', 73, 18);
    des.object({ id: CHEST, coord: [73, 19] });
    des.door('locked', 50, 6);
    des.object({ class: TOOL_CLASS, coord: [50, 3] });
    des.object({
        id: STATUE, coord: [38, 15],
        montype: PM_GNOME_RULER, historic: true,
    });

    // Temple
    des.region({
        region: [29, 2, 33, 4], lit: 1, type: 'temple', filled: 1,
    });
    des.door('closed', 31, 5);
    des.altar({
        x: 31, y: 3,
        align: state.specialLevelAlign[0],
        type: 'shrine',
    });
}

// C ref: dat/minetn-6.lua. Bustling Town — mines-init cavern with a map
// overlay, shops as regions, and diverse townsfolk.
async function minetn6(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'inaccessibles');

    des.level_init({
        style: 'mines',
        fg: '.',
        bg: '-',
        smoothed: true,
        joined: true,
        lit: 1,
        walled: true,
    });

    des.map({
        halign: 'center', valign: 'top', map: [
            'x--------xxxxxxxxxxx-------------------x',
            'x------xxxxxxxxxxxxxx-----------------xx',
            '.-----................----------------.x',
            '.|...|................|...|..|...|...|..',
            '.|...+..--+--.........|...|..|...|...|..',
            '.|...|..|...|..-----..|...|..|-+---+--..',
            '.-----..|...|--|...|..--+---+-.........x',
            '........|...|..|...+.............-----.x',
            '........-----..|...|......--+-...|...|..',
            'x----...|...|+------..{...|..|...+...|..',
            'x|..+...|...|.............|..|...|...|..',
            '.|..|...|...|-+-.....---+-------------.x',
            '.----...--+--..|..-+-|..................',
            '...|........|..|..|..|----....--------.x',
            '...|..T.....----..|..|...+....|......|..',
            '...|-....{........|..|...|....+......|x.',
            '...--..-....T.....--------....|......|x.',
            '.......--.....................----------',
            '.xxxx-----xxxxxxxxxxxxxxxxxx------------',
            'xxxx-------xxxxxxxxxxxxxxx--------------',
        ].join('\n'),
    });

    des.region(selection_area(0, 0, 39, 19), 'lit');

    des.levregion({
        type: 'stair-up',
        region: [1, 3, 21, 19],
        region_islev: 1,
        exclude: [1, 0, 39, 18],
    });
    des.levregion({
        type: 'stair-down',
        region: [60, 3, 75, 19],
        region_islev: 1,
        exclude: [0, 0, 38, 18],
    });

    des.region(selection_area(13, 7, 14, 8), 'unlit');
    des.region({
        region: [9, 9, 11, 11], lit: 1,
        type: 'candle shop', filled: 1,
    });
    des.region({
        region: [16, 6, 18, 8], lit: 1,
        type: 'tool shop', filled: 1,
    });
    des.region({
        region: [23, 3, 25, 5], lit: 1, type: 'shop', filled: 1,
    });
    des.region({
        region: [22, 14, 24, 15], lit: 1,
        type: monkfoodshop(state), filled: 1,
    });
    des.region({
        region: [31, 14, 36, 16], lit: 1, type: 'temple', filled: 1,
    });
    des.altar({
        x: 35, y: 15,
        align: state.specialLevelAlign[0],
        type: 'shrine',
    });

    des.door('closed', 5, 4);
    des.door('locked', 4, 10);
    des.door('closed', 10, 4);
    des.door('closed', 10, 12);
    des.door('locked', 13, 9);
    des.door('locked', 14, 11);
    des.door('closed', 19, 7);
    des.door('closed', 19, 12);
    des.door('closed', 24, 6);
    des.door('closed', 24, 11);
    des.door('closed', 25, 14);
    des.door('closed', 28, 6);
    des.door('locked', 28, 8);
    des.door('closed', 30, 15);
    des.door('closed', 31, 5);
    des.door('closed', 35, 5);
    des.door('closed', 33, 9);

    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME, coord: [14, 8] });
    des.monster({
        id: PM_GNOME_LEADER, parsedGender: MALE, coord: [14, 7],
    });
    des.monster({ id: PM_GNOME, coord: [27, 10] });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF, peaceful: 1 });
    des.monster({ id: PM_DWARF, peaceful: 1 });
    des.monster({ id: PM_GNOME, peaceful: 1 });
    des.monster({ id: PM_GNOME, peaceful: 1 });
    des.monster({ id: PM_HOBBIT, peaceful: 1 });
    des.monster({ id: PM_GOBLIN, peaceful: 1 });
    des.monster({ id: PM_KOBOLD, peaceful: 1 });
    des.monster({ id: PM_DOG, peaceful: 1 });
    des.monster({ id: PM_WATCHMAN, peaceful: 1 });
    des.monster({ id: PM_WATCHMAN, peaceful: 1 });
    des.monster({ id: PM_WATCHMAN, peaceful: 1 });
    des.monster({ id: PM_WATCH_CAPTAIN, peaceful: 1 });
    des.monster({ id: PM_WATCH_CAPTAIN, peaceful: 1 });
}

// C ref: dat/minetn-7.lua. Bazaar Town — room-based with many conditional
// rooms, dual food shops, a sink, and monkeys.
async function minetn7(des, state) {
    des.room({
        type: 'ordinary', lit: 1, x: 3, y: 3,
        xalign: 'center', yalign: 'center', w: 30, h: 15,
        contents() {
            des.feature('fountain', 12, 7);
            des.feature('fountain', 11, 13);

            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 2, y: 2, w: 4, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'south' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 7, y: 2, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'north' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 7, y: 5, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'south' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 1, x: 10, y: 2, w: 3, h: 4,
                    contents() {
                        des.monster({ id: PM_GNOME });
                        des.monster({ id: PM_MONKEY });
                        des.monster({ id: PM_MONKEY });
                        des.monster({ id: PM_MONKEY });
                        des.door({ state: 'closed', wall: 'south' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 14, y: 2, w: 4, h: 2,
                    contents() {
                        des.door({
                            state: 'closed', wall: 'south', pos: 0,
                        });
                        des.monster({
                            class: def_char_to_monclass('n'),
                        });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 16, y: 5, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'south' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', lit: 0, x: 19, y: 2, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'locked', wall: 'east' });
                        des.monster({
                            id: PM_GNOME_RULER, parsedGender: MALE,
                        });
                    },
                });
            }

            des.room({
                type: monkfoodshop(state), chance: 50, lit: 1,
                x: 19, y: 5, w: 2, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });

            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 2, y: 7, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'east' });
                    },
                });
            }

            des.room({
                type: 'tool shop', chance: 50, lit: 1,
                x: 2, y: 10, w: 2, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'south' });
                },
            });
            des.room({
                type: 'candle shop', lit: 1, x: 5, y: 10, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                },
            });

            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 11, y: 10, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'locked', wall: 'west' });
                        des.monster({
                            class: def_char_to_monclass('G'),
                        });
                    },
                });
            }

            des.room({
                type: 'shop', chance: 60, lit: 1,
                x: 14, y: 10, w: 2, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'north' });
                },
            });

            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 17, y: 11, w: 4, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'north' });
                    },
                });
            }
            if (percent(75)) {
                des.room({
                    type: 'ordinary', x: 22, y: 11, w: 2, h: 2,
                    contents() {
                        des.door({ state: 'closed', wall: 'south' });
                        des.feature('sink', 0, 0);
                    },
                });
            }

            des.room({
                type: monkfoodshop(state), chance: 50, lit: 1,
                x: 25, y: 11, w: 3, h: 2,
                contents() {
                    des.door({ state: 'closed', wall: 'east' });
                },
            });
            des.room({
                type: 'tool shop', chance: 30, lit: 1,
                x: 25, y: 2, w: 3, h: 3,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                },
            });
            des.room({
                type: 'temple', lit: 1, x: 24, y: 6, w: 4, h: 4,
                contents() {
                    des.door({ state: 'closed', wall: 'west' });
                    des.altar({
                        x: 2, y: 1,
                        align: state.specialLevelAlign[0],
                        type: 'shrine',
                    });
                    des.monster({ id: PM_GNOMISH_WIZARD });
                    des.monster({ id: PM_GNOMISH_WIZARD });
                },
            });

            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCHMAN, peaceful: 1 });
            des.monster({ id: PM_WATCH_CAPTAIN, peaceful: 1 });
            des.monster({ id: PM_GNOME });
            des.monster({ id: PM_GNOME });
            des.monster({ id: PM_GNOME });
            des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
            des.monster({ id: PM_MONKEY });
            des.monster({ id: PM_MONKEY });
        },
    });

    des.room({
        type: 'ordinary',
        contents() { des.stair('up'); },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.stair('down');
            des.trap();
            des.monster({ id: PM_GNOME });
            des.monster({ id: PM_GNOME });
        },
    });
    des.room({
        type: 'ordinary',
        contents() { des.monster({ id: PM_DWARF }); },
    });
    des.room({
        type: 'ordinary',
        contents() {
            des.trap();
            des.monster({ id: PM_GNOME });
        },
    });

    des.random_corridors();
}

// C ref: dat/minend-1.lua. "Mimic of the Mines" — maze level with gem
// niches containing mimics disguised as gray stones, and the real
// luckstone in the 6th niche.
async function minend1(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel');

    des.map([
        '------------------------------------------------------------------   ------',
        '|                        |.......|     |.......-...|       |.....|.       |',
        '|    ---------        ----.......-------...........|       ---...-S-      |',
        '|    |.......|        |..........................-S-      --.......|      |',
        '|    |......-------   ---........................|.       |.......--      |',
        '|    |..--........-----..........................|.       -.-..----       |',
        '|    --..--.-----........-.....................---        --..--          |',
        '|     --..--..| -----------..................---.----------..--           |',
        '|      |...--.|    |..S...S..............---................--            |',
        '|     ----..-----  ------------........--- ------------...---             |',
        '|     |.........--            ----------              ---...-- -----      |',
        '|    --.....---..--                           --------  --...---...--     |',
        '| ----..-..-- --..---------------------      --......--  ---........|     |',
        '|--....-----   --..-..................---    |........|    |.......--     |',
        '|.......|       --......................S..  --......--    ---..----      |',
        '|--.--.--        ----.................---     ------..------...--         |',
        '| |....S..          |...............-..|         ..S...........|          |',
        '--------            --------------------           ------------------------',
    ]);

    const place = [[8, 16], [13, 7], [21, 8], [41, 14], [50, 4], [50, 16], [66, 1]];
    des.shuffle(place);

    des.region({ region: [26, 1, 32, 1], lit: 0, type: 'ordinary', irregular: 1, arrival_room: true });
    des.region(selection_area(20, 8, 21, 8), 'unlit');
    des.region(selection_area(23, 8, 25, 8), 'unlit');

    des.door('locked', 7, 16);
    des.door('locked', 22, 8);
    des.door('locked', 26, 8);
    des.door('locked', 40, 14);
    des.door('locked', 50, 3);
    des.door('locked', 51, 16);
    des.door('locked', 66, 2);

    des.stair({ dir: 'up', coord: [36, 4] });

    des.non_diggable(selection_area(0, 0, 74, 17));

    // Niches — place[5] (Lua place[6]) is empty
    des.object({ id: DIAMOND, coord: place[6] });
    des.object({ id: EMERALD, coord: place[6] });
    des.object({ id: WORTHLESS_VIOLET_GLASS, coord: place[6] });
    des.monster({ class: def_char_to_monclass('m'), coord: place[6], appear_as: 'obj:luckstone' });
    des.object({ id: WORTHLESS_WHITE_GLASS, coord: place[0] });
    des.object({ id: EMERALD, coord: place[0] });
    des.object({ id: AMETHYST, coord: place[0] });
    des.monster({ class: def_char_to_monclass('m'), coord: place[0], appear_as: 'obj:loadstone' });
    des.object({ id: DIAMOND, coord: place[1] });
    des.object({ id: WORTHLESS_GREEN_GLASS, coord: place[1] });
    des.object({ id: AMETHYST, coord: place[1] });
    des.monster({ class: def_char_to_monclass('m'), coord: place[1], appear_as: 'obj:flint' });
    des.object({ id: WORTHLESS_WHITE_GLASS, coord: place[2] });
    des.object({ id: EMERALD, coord: place[2] });
    des.object({ id: WORTHLESS_VIOLET_GLASS, coord: place[2] });
    des.monster({ class: def_char_to_monclass('m'), coord: place[2], appear_as: 'obj:touchstone' });
    des.object({ id: WORTHLESS_RED_GLASS, coord: place[3] });
    des.object({ id: RUBY, coord: place[3] });
    des.object({ id: LOADSTONE, coord: place[3] });
    des.object({ id: RUBY, coord: place[4] });
    des.object({ id: WORTHLESS_RED_GLASS, coord: place[4] });
    des.object({ id: LUCKSTONE, coord: place[4], buc: 'not-cursed', achievement: 1 });

    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: TOOL_CLASS });
    des.object({ class: TOOL_CLASS });
    des.object();
    des.object();
    des.object();

    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();

    des.monster({ id: PM_GNOME_RULER, parsedGender: MALE });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_GNOMISH_WIZARD });
    des.monster({ id: PM_GNOMISH_WIZARD });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_HOBBIT });
    des.monster({ id: PM_HOBBIT });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });
    des.monster({ class: def_char_to_monclass('h') });
}

// C ref: dat/minend-2.lua. "Gnome King's Wine Cellar" — maze level with
// wine storage, fountain, engravings, and a gem treasure chamber.
async function minend2(des, state) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel');

    des.map([
        '---------------------------------------------------------------------------',
        '|...................................................|                     |',
        '|.|---------S--.--|...|--------------------------|..|                     |',
        '|.||---|   |.||-| |...|..........................|..|                     |',
        '|.||...| |-|.|.|---...|.............................|                ..   |',
        '|.||...|-|.....|....|-|..........................|..|.               ..   |',
        '|.||.....|-S|..|....|............................|..|..                   |',
        '|.||--|..|..|..|-|..|----------------------------|..|-.                   |',
        '|.|   |..|..|....|..................................|...                  |',
        '|.|   |..|..|----|..-----------------------------|..|....                 |',
        '|.|---|..|--|.......|----------------------------|..|.....                |',
        '|...........|----.--|......................|     |..|.......              |',
        '|-----------|...|.| |------------------|.|.|-----|..|.....|..             |',
        '|-----------|.{.|.|--------------------|.|..........|.....|....           |',
        '|...............|.S......................|-------------..-----...         |',
        '|.--------------|.|--------------------|.|.........................       |',
        '|.................|                    |.....................|........    |',
        '---------------------------------------------------------------------------',
    ]);

    if (percent(50)) {
        des.terrain([55, 14], '-');
        des.terrain([56, 14], '-');
        des.terrain([61, 15], '|');
        des.terrain([52, 5], 'S');
        des.door('locked', 52, 5);
    }
    if (percent(50)) {
        des.terrain([18, 1], '|');
        des.terrain(selection_area(7, 12, 8, 13), '.');
    }
    if (percent(50)) {
        des.terrain([49, 4], '|');
        des.terrain([21, 5], '.');
    }
    if (percent(50)) {
        if (percent(50)) {
            des.terrain([22, 1], '|');
        } else {
            des.terrain([50, 7], '-');
            des.terrain([51, 7], '-');
        }
    }

    des.teleport_region({ region: [23, 3, 48, 16], region_islev: 1 });

    des.feature('fountain', [14, 13]);
    des.region(selection_area(23, 3, 48, 6), 'lit');
    des.region(selection_area(21, 6, 22, 6), 'lit');
    des.region(selection_area(14, 4, 14, 4), 'unlit');
    des.region(selection_area(10, 5, 14, 8), 'unlit');
    des.region(selection_area(10, 9, 11, 9), 'unlit');
    des.region(selection_area(15, 8, 16, 8), 'unlit');

    des.door('locked', 12, 2);
    des.door('locked', 11, 6);

    des.stair({ dir: 'up', coord: [36, 4] });

    des.non_diggable(selection_area(0, 0, 52, 17));
    des.non_diggable(selection_area(53, 0, 74, 0));
    des.non_diggable(selection_area(53, 17, 74, 17));
    des.non_diggable(selection_area(74, 1, 74, 16));
    des.non_diggable(selection_area(53, 7, 55, 7));
    des.non_diggable(selection_area(53, 14, 61, 14));

    des.engraving({ coord: [12, 3], type: 'engrave', text: 'You are now entering the Gnome King\'s wine cellar.' });
    des.engraving({ coord: [12, 4], type: 'engrave', text: 'Trespassers will be persecuted!' });
    des.object({ id: POT_BOOZE, coord: [10, 7] });
    des.object({ id: POT_BOOZE, coord: [10, 7] });
    des.object({ class: POTION_CLASS, coord: [10, 7] });
    des.object({ id: POT_BOOZE, coord: [10, 8] });
    des.object({ id: POT_BOOZE, coord: [10, 8] });
    des.object({ class: POTION_CLASS, coord: [10, 8] });
    des.object({ id: POT_BOOZE, coord: [10, 9] });
    des.object({ id: POT_BOOZE, coord: [10, 9] });
    des.object({ id: POT_OBJECT_DETECTION, coord: [10, 9] });

    des.object({ id: DIAMOND, coord: [69, 4] });
    des.object({ class: GEM_CLASS, coord: [69, 4] });
    des.object({ id: DIAMOND, coord: [69, 4] });
    des.object({ class: GEM_CLASS, coord: [69, 4] });
    des.object({ id: EMERALD, coord: [70, 4] });
    des.object({ class: GEM_CLASS, coord: [70, 4] });
    des.object({ id: EMERALD, coord: [70, 4] });
    des.object({ class: GEM_CLASS, coord: [70, 4] });
    des.object({ id: EMERALD, coord: [69, 5] });
    des.object({ class: GEM_CLASS, coord: [69, 5] });
    des.object({ id: RUBY, coord: [69, 5] });
    des.object({ class: GEM_CLASS, coord: [69, 5] });
    des.object({ id: RUBY, coord: [70, 5] });
    des.object({ id: AMETHYST, coord: [70, 5] });
    des.object({ class: GEM_CLASS, coord: [70, 5] });
    des.object({ id: AMETHYST, coord: [70, 5] });
    des.object({ id: LUCKSTONE, coord: [70, 5], buc: 'not-cursed', achievement: 1 });

    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: GEM_CLASS });
    des.object({ class: TOOL_CLASS });
    des.object({ class: TOOL_CLASS });
    des.object();
    des.object();
    des.object();

    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();

    des.monster({ id: PM_GNOME_RULER, parsedGender: MALE });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_GNOME_LEADER, parsedGender: MALE });
    des.monster({ id: PM_GNOMISH_WIZARD });
    des.monster({ id: PM_GNOMISH_WIZARD });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_GNOME });
    des.monster({ id: PM_HOBBIT });
    des.monster({ id: PM_HOBBIT });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });
    des.monster({ id: PM_DWARF });
    des.monster({ class: def_char_to_monclass('h') });
}

// C ref: dat/minend-3.lua. "Catacombs" — solidfill maze with undead,
// two fountains, a treasure room, and level-teleport traps.
async function minend3(des, state) {
    des.level_init({ style: 'solidfill', fg: '-' });
    des.level_flags('mazelevel', 'nommap');

    des.map({ halign: 'center', valign: 'bottom', map: [
        ' - - - - - - - - - - -- -- - - . - - - - - - - - - -- - - -- - - - - . - - |',
        '------...---------.-----------...-----.-------.-------     ----------------|',
        ' - - - - - - - - - - - . - - - . - - - - - - - - - - -- - -- - . - - - - - |',
        '------------.---------...-------------------------.---   ------------------|',
        ' - - - - - - - - - - . . - - --- - . - - - - - - - - -- -- - - - - |.....| |',
        '--.---------------.......------------------------------- ----------|.....S-|',
        ' - - - - |.. ..| - ....... . - - - - |.........| - - - --- - - - - |.....| |',
        '----.----|.....|------.......--------|.........|--------------.------------|',
        ' - - - - |..{..| - - -.... . --- - -.S.........S - - - - - - - - - - - - - |',
        '---------|.....|--.---...------------|.........|---------------------------|',
        ' - - - - |.. ..| - - - . - - - - - - |.........| - --- . - - - - - - - - - |',
        '----------------------...-------.---------------------...------------------|',
        '---..| - - - - - - - - . --- - - - - - - - - - - - - - . - - --- - - --- - |',
        '-.S..|----.-------.------- ---------.-----------------...----- -----.-------',
        '---..| - - - - - - - -- - - -- . - - - - - . - - - . - . - - -- -- - - - -- ',
        '-.S..|--------.---.---       -...---------------...{.---------   ---------  ',
        '--|. - - - - - - - -- - - - -- . - - - --- - - - . . - - - - -- - - - - - - ',
    ].join('\n') });

    const place = [[1, 15], [68, 6], [1, 13]];
    des.shuffle(place);

    des.non_diggable(selection_area(67, 3, 73, 7));
    des.non_diggable(selection_area(0, 12, 2, 16));
    des.feature('fountain', [12, 8]);
    des.feature('fountain', [51, 15]);
    des.region(selection_area(0, 0, 75, 16), 'unlit');
    des.region(selection_area(38, 6, 46, 10), 'lit');
    des.door('closed', 37, 8);
    des.door('closed', 47, 8);
    des.door('closed', 73, 5);
    des.door('closed', 2, 15);
    des.mazewalk({ x: 36, y: 8, dir: 'west', stocked: 0 });
    des.stair({ dir: 'up', coord: [42, 8] });
    des.wallify();

    des.object({ id: DIAMOND });
    des.object({ class: GEM_CLASS });
    des.object({ id: DIAMOND });
    des.object({ class: GEM_CLASS });
    des.object({ id: EMERALD });
    des.object({ class: GEM_CLASS });
    des.object({ id: EMERALD });
    des.object({ class: GEM_CLASS });
    des.object({ id: EMERALD });
    des.object({ class: GEM_CLASS });
    des.object({ id: RUBY });
    des.object({ class: GEM_CLASS });
    des.object({ id: RUBY });
    des.object({ id: AMETHYST });
    des.object({ class: GEM_CLASS });
    des.object({ id: AMETHYST });
    des.object({ id: LUCKSTONE, coord: place[1], buc: 'not-cursed', achievement: 1 });
    des.object({ id: FLINT, coord: place[0] });
    des.object({ class: SCROLL_CLASS });
    des.object({ class: SCROLL_CLASS });
    des.object({ class: SCROLL_CLASS });
    des.object({ class: SCROLL_CLASS });
    des.object({ class: SCROLL_CLASS });
    des.object({ class: SPBOOK_CLASS });
    des.object({ class: SPBOOK_CLASS });
    des.object({ class: SPBOOK_CLASS });
    des.object({ class: SPBOOK_CLASS });
    des.object();
    des.object();
    des.object();

    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap({ type: 'level teleport', coord: place[1] });
    des.trap({ type: 'level teleport', coord: place[0] });

    des.monster({ class: S_MUMMY });
    des.monster({ class: S_MUMMY });
    des.monster({ class: S_MUMMY });
    des.monster({ class: S_MUMMY });
    des.monster({ class: S_MUMMY });
    des.monster({ id: PM_ETTIN_MUMMY });
    des.monster({ class: S_VAMPIRE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_ZOMBIE });
    des.monster({ class: S_VAMPIRE });
    des.monster({ class: S_EYE });
    des.monster({ class: S_EYE });
    des.monster({ class: S_EYE });
    des.monster({ class: S_EYE });
}

export const MINES_LEVEL_LOADERS = {
    minefill,
    'minetn-1': minetn1,
    'minetn-2': minetn2,
    'minetn-3': minetn3,
    'minetn-4': minetn4,
    'minetn-5': minetn5,
    'minetn-6': minetn6,
    'minetn-7': minetn7,
    'minend-1': minend1,
    'minend-2': minend2,
    'minend-3': minend3,
};
