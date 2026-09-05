// medusa_levels.js — Medusa special level definitions.
// C ref: dat/medusa-1.lua through dat/medusa-4.lua.

import { def_char_to_monclass, def_char_to_objclass } from './drawing.js';
import {
    PM_BABY_YELLOW_DRAGON,
    PM_BLACK_NAGA,
    PM_BLACK_NAGA_HATCHLING,
    PM_COBRA,
    PM_ELECTRIC_EEL,
    PM_GIANT_EEL,
    PM_GREMLIN,
    PM_JELLYFISH,
    PM_KNIGHT,
    PM_KRAKEN,
    PM_MEDUSA,
    PM_RAVEN,
    PM_STONE_GOLEM,
    PM_TITAN,
    PM_WATER_NYMPH,
    PM_WATER_TROLL,
    PM_WOOD_NYMPH,
    PM_YELLOW_DRAGON,
    PM_YELLOW_LIGHT,
    S_SNAKE,
} from './monsters.js';
import {
    BOULDER,
    CRYSTAL_BALL,
    EGG,
    LEVITATION_BOOTS,
    SACK,
    SCR_BLANK_PAPER,
    SCIMITAR,
    SHIELD_OF_REFLECTION,
    STATUE,
} from './objects.js';
import { rn2 } from './rng.js';
import { selection_area, ThemeroomSelection } from './themerooms.js';

function percent(threshold) {
    return rn2(100) < threshold;
}

// Perseus statue contents callback shared by all four medusa variants.
// C ref: dat/medusa-1.lua lines 62-75, etc. Each variant uses the same
// percent-gated items with the same thresholds and order.
function perseusContents() {
    // C ref: medusa-1.lua line 63 — percent(75) for shield of reflection
}

// C ref: dat/medusa-1.lua. The first Medusa level variant.
async function medusa1(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport');

    des.map([
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}.}}}}}..}}}}}......}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}....}}}...}}}}}',
        '}...}}.....}}}}}....}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}...............}',
        '}....}}}}}}}}}}....}}}..}}}}}}}}}}}.......}}}}}}}}}}}}}}}}..}}.....}}}...}}',
        '}....}}}}}}}}.....}}}}..}}}}}}.................}}}}}}}}}}}.}}}}.....}}...}}',
        '}....}}}}}}}}}}}}.}}}}.}}}}}}.-----------------.}}}}}}}}}}}}}}}}}.........}',
        '}....}}}}}}}}}}}}}}}}}}.}}}...|...............S...}}}}}}}}}}}}}}}}}}}....}}',
        '}.....}.}}....}}}}}}}}}.}}....--------+--------....}}}}}}..}}}}}}}}}}}...}}',
        '}......}}}}..}}}}}}}}}}}}}........|.......|........}}}}}....}}}}}}}}}}}}}}}',
        '}.....}}}}}}}}}}}}}}}}}}}}........|.......|........}}}}}...}}}}}}}}}.}}}}}}',
        '}.....}}}}}}}}}}}}}}}}}}}}....--------+--------....}}}}}}.}.}}}}}}}}}}}}}}}',
        '}......}}}}}}}}}}}}}}}}}}}}...S...............|...}}}}}}}}}}}}}}}}}.}}}}}}}',
        '}.......}}}}}}}..}}}}}}}}}}}}.-----------------.}}}}}}}}}}}}}}}}}....}}}}}}',
        '}........}}.}}....}}}}}}}}}}}}.................}}}}}..}}}}}}}}}.......}}}}}',
        '}.......}}}}}}}......}}}}}}}}}}}}}}.......}}}}}}}}}.....}}}}}}...}}..}}}}}}',
        '}.....}}}}}}}}}}}.....}}}}}}}}}}}}}}}}}}}}}}.}}}}}}}..}}}}}}}}}}....}}}}}}}',
        '}}..}}}}}}}}}}}}}....}}}}}}}}}}}}}}}}}}}}}}...}}..}}}}}}}.}}.}}}}..}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
    ]);

    // Dungeon Description
    des.region(selection_area(0, 0, 74, 19), 'lit');
    des.region(selection_area(31, 7, 45, 7), 'unlit');
    // The first room defined on Medusa's level receives fixup_special statues.
    des.region({ region: [35, 9, 41, 10], lit: 0, type: 'ordinary', arrival_room: true });
    des.region(selection_area(31, 12, 45, 12), 'unlit');

    // Teleport regions
    des.teleport_region({ region: [1, 1, 5, 17], dir: 'down' });
    des.teleport_region({ region: [26, 4, 50, 15], dir: 'up' });

    // Stairs
    des.stair({ dir: 'up', coord: [5, 14] });
    des.stair({ dir: 'down', coord: [36, 10] });

    // Doors
    des.door('closed', 46, 7);
    des.door('locked', 38, 8);
    des.door('locked', 38, 11);
    des.door('closed', 30, 12);

    // Branch, not allowed inside Medusa's building.
    des.levregion({ region: [1, 0, 79, 20], exclude: [30, 6, 46, 13], type: 'branch' });

    // Non diggable walls
    des.non_diggable(selection_area(30, 6, 46, 13));

    // Perseus statue with conditional contents
    des.object({
        id: STATUE, x: 36, y: 10, buc: 'uncursed',
        montype: PM_KNIGHT, historic: 1, male: 1, name: 'Perseus',
        contents() {
            if (percent(75)) {
                des.object({ id: SHIELD_OF_REFLECTION, buc: 'cursed', spe: 0 });
            }
            if (percent(25)) {
                des.object({ id: LEVITATION_BOOTS, spe: 0 });
            }
            if (percent(50)) {
                des.object({ id: SCIMITAR, buc: 'blessed', spe: 2 });
            }
            if (percent(50)) {
                des.object({ id: SACK });
            }
        },
    });

    // Statues with explicitly empty contents
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });

    // Random objects
    des.object();
    des.object();
    des.object();
    des.object();
    des.object();
    des.object();
    des.object();
    des.object();

    // Random traps
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap();
    des.trap({ type: 'board', coord: [38, 7] });
    des.trap({ type: 'board', coord: [38, 12] });

    // Random monsters
    des.monster({ id: PM_MEDUSA, x: 36, y: 10, asleep: 1 });
    des.monster({ id: PM_GIANT_EEL, coord: [11, 6] });
    des.monster({ id: PM_GIANT_EEL, coord: [23, 13] });
    des.monster({ id: PM_GIANT_EEL, coord: [29, 2] });
    des.monster({ id: PM_JELLYFISH, coord: [2, 2] });
    des.monster({ id: PM_JELLYFISH, coord: [0, 8] });
    des.monster({ id: PM_JELLYFISH, coord: [4, 18] });
    des.monster({ id: PM_WATER_TROLL, coord: [51, 3] });
    des.monster({ id: PM_WATER_TROLL, coord: [64, 11] });
    des.monster({ class: S_SNAKE, x: 38, y: 7 });
    des.monster({ class: S_SNAKE, x: 38, y: 12 });
    des.monster();
    des.monster();
    des.monster();
    des.monster();
    des.monster();
    des.monster();
    des.monster();
    des.monster();
    des.monster();
    des.monster();
}

// C ref: dat/medusa-2.lua. The second Medusa level variant.
async function medusa2(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('mazelevel', 'noteleport');

    des.map([
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}------}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}-------}}}}}}}}--------------}',
        '}|....|}}}}}}}}}..}.}}..}}}}}}}}}}}}}..}}}}}}-.....--}}}}}}}|............|}',
        '}|....|.}}}}}}}}}}}.}...}}..}}}}}}}}}}}}}}}}}---......}}}}}.|............|}',
        '}S....|.}}}}}}---}}}}}}}}}}}}}}}}}}}}}}}}}}---...|..-}}}}}}.S..----------|}',
        '}|....|.}}}}}}-...}}}}}}}}}.}}...}.}}}}.}}}......----}}}}}}.|............|}',
        '}|....|.}}}}}}-....--}}}}}}}}}}}}}}}}}}}}}}----...--}}}}}}}.|..--------+-|}',
        '}|....|.}}}}}}}......}}}}...}}}}}}.}}}}}}}}}}}---..---}}}}}.|..|..S...|..|}',
        '}|....|.}}}}}}-....-}}}}}}}------}}}}}}}}}}}}}}-...|.-}}}}}.|..|..|...|..|}',
        '}|....|.}}}}}}}}}---}}}}}}}........}}}}}}}}}}---.|....}}}}}.|..|..|...|..|}',
        '}|....|.}}}}}}}}}}}}}}}}}}-....|...-}}}}}}}}--...----.}}}}}.|..|..|...|..|}',
        '}|....|.}}}}}}..}}}}}}}}}}---..--------}}}}}-..---}}}}}}}}}.|..|..-------|}',
        '}|...}|...}}}.}}}}}}...}}}}}--..........}}}}..--}}}}}}}}}}}.|..|.........|}',
        '}|...}S...}}.}}}}}}}}}}}}}}}-..--------}}}}}}}}}}}}}}...}}}.|..--------..S}',
        '}|...}|...}}}}}}}..}}}}}}----..|....-}}}}}}}}}}}}}}}}}..}}}.|............|}',
        '}|....|}}}}}....}}}}..}}.-.......----}}......}}}}}}.......}}|............|}',
        '}------}}}}}}}}}}}}}}}}}}---------}}}}}}}}}}}}}}}}}}}}}}}}}}--------------}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
    ]);

    // Dungeon Description
    des.region(selection_area(0, 0, 74, 19), 'lit');
    des.region(selection_area(2, 3, 5, 16), 'unlit');
    // fixup_special hack: first room defined gets leaderboard statues
    des.region({ region: [61, 3, 72, 16], lit: 0, type: 'ordinary', irregular: 1 });
    des.region(selection_area(71, 8, 72, 11), 'unlit');
    // Downstairs area
    des.region({ region: [67, 8, 69, 11], lit: 1, type: 'ordinary', arrival_room: true });

    // Teleport regions
    des.teleport_region({ region: [2, 3, 5, 16], dir: 'down' });
    des.teleport_region({ region: [61, 3, 72, 16], dir: 'up' });

    // Stairs
    des.stair({ dir: 'up', coord: [4, 9] });
    des.stair({ dir: 'down', coord: [68, 10] });

    // Doors
    des.door('locked', 71, 7);

    // Branch
    des.levregion({ type: 'branch', region: [1, 0, 79, 20], exclude: [59, 1, 73, 17] });

    // Non diggable walls
    des.non_diggable(selection_area(1, 2, 6, 17));
    des.non_diggable(selection_area(60, 2, 73, 17));

    // Perseus statue with conditional contents
    des.object({
        id: STATUE, x: 68, y: 10, buc: 'uncursed',
        montype: PM_KNIGHT, historic: 1, male: 1, name: 'Perseus',
        contents() {
            if (percent(25)) {
                des.object({ id: SHIELD_OF_REFLECTION, buc: 'cursed', spe: 0 });
            }
            if (percent(75)) {
                des.object({ id: LEVITATION_BOOTS, spe: 0 });
            }
            if (percent(50)) {
                des.object({ id: SCIMITAR, buc: 'blessed', spe: 2 });
            }
            if (percent(50)) {
                des.object({ id: SACK });
            }
        },
    });

    // Positioned statues with empty contents
    des.object({ id: STATUE, x: 64, y: 8, contents() {} });
    des.object({ id: STATUE, x: 65, y: 8, contents() {} });
    des.object({ id: STATUE, x: 64, y: 9, contents() {} });
    des.object({ id: STATUE, x: 65, y: 9, contents() {} });
    des.object({ id: STATUE, x: 64, y: 10, contents() {} });
    des.object({ id: STATUE, x: 65, y: 10, contents() {} });
    des.object({ id: STATUE, x: 64, y: 11, contents() {} });
    des.object({ id: STATUE, x: 65, y: 11, contents() {} });

    // Named objects
    des.object({ id: BOULDER, coord: [4, 4] });
    des.object({ class: def_char_to_objclass('/'), coord: [52, 9] });
    des.object({ id: BOULDER, coord: [52, 9] });

    // Random objects
    des.object();
    des.object();
    des.object();
    des.object();
    des.object();
    des.object();

    // Traps
    des.trap({ type: 'magic', coord: [3, 12] });
    des.trap();
    des.trap();
    des.trap();
    des.trap();

    // Monsters
    des.monster({ id: PM_MEDUSA, x: 68, y: 10, asleep: 1 });
    des.monster({ id: PM_GREMLIN, coord: [2, 14] });
    des.monster({ id: PM_TITAN, coord: [2, 5] });
    des.monster({ id: PM_ELECTRIC_EEL, coord: [10, 13] });
    des.monster({ id: PM_ELECTRIC_EEL, coord: [11, 13] });
    des.monster({ id: PM_ELECTRIC_EEL, coord: [10, 14] });
    des.monster({ id: PM_ELECTRIC_EEL, coord: [11, 14] });
    des.monster({ id: PM_ELECTRIC_EEL, coord: [10, 15] });
    des.monster({ id: PM_ELECTRIC_EEL, coord: [11, 15] });
    des.monster({ id: PM_JELLYFISH, coord: [1, 1] });
    des.monster({ id: PM_JELLYFISH, coord: [0, 8] });
    des.monster({ id: PM_JELLYFISH, coord: [4, 19] });
    des.monster({ id: PM_STONE_GOLEM, x: 64, y: 8, asleep: 1 });
    des.monster({ id: PM_STONE_GOLEM, x: 65, y: 8, asleep: 1 });
    des.monster({ id: PM_STONE_GOLEM, x: 64, y: 9, asleep: 1 });
    des.monster({ id: PM_STONE_GOLEM, x: 65, y: 9, asleep: 1 });
    des.monster({ id: PM_COBRA, x: 64, y: 10, asleep: 1 });
    des.monster({ id: PM_COBRA, x: 65, y: 10, asleep: 1 });
    des.monster({ class: def_char_to_monclass('A'), coord: [72, 8] });
    des.monster({ id: PM_YELLOW_LIGHT, x: 72, y: 11, asleep: 1 });
    des.monster({ x: 17, y: 7 });
    des.monster({ x: 28, y: 11 });
    des.monster({ x: 32, y: 13 });
    des.monster({ x: 49, y: 9 });
    des.monster({ x: 48, y: 7 });
    des.monster({ x: 65, y: 3 });
    des.monster({ x: 70, y: 4 });
    des.monster({ x: 70, y: 15 });
    des.monster({ x: 65, y: 16 });
    des.monster();
    des.monster();
    des.monster();
    des.monster();
}

// C ref: dat/medusa-3.lua. The third Medusa level variant with ravens.
async function medusa3(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('noteleport', 'mazelevel', 'shortsighted');

    des.map([
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}.}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}T..T.}}}}}}}}}}}}}}}}}}}}..}}}}}}}}.}}}...}}}}}}}.}}}}}......}}}}}}}',
        '}}}}}}.......T.}}}}}}}}}}}..}}}}..T.}}}}}}...T...T..}}...T..}}..-----..}}}}}',
        '}}}...-----....}}}}}}}}}}.T..}}}}}...}}}}}.....T..}}}}}......T..|...|.T..}}}',
        '}}}.T.|...|...T.}}}}}}}.T......}}}}..T..}}.}}}.}}...}}}}}.T.....+...|...}}}}',
        '}}}}..|...|.}}.}}}}}.....}}}T.}}}}.....}}}}}}.T}}}}}}}}}}}}}..T.|...|.}}}}}}',
        '}}}}}.|...|.}}}}}}..T..}}}}}}}}}}}}}T.}}}}}}}}..}}}}}}}}}}}.....-----.}}}}}}',
        '}}}}}.--+--..}}}}}}...}}}}}}}}}}}}}}}}}}}T.}}}}}}}}}}}}}}}}.T.}........}}}}}',
        '}}}}}.......}}}}}}..}}}}}}}}}.}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.}}}.}}.T.}}}}}}',
        '}}.T...T...}}}}T}}}}}}}}}}}....}}}}}}}}}}T}}}}}.T}}...}}}}}}}}}}}}}}...}}}}}',
        '}}}...T}}}}}}}..}}}}}}}}}}}.T...}}}}}}}}.T.}.T.....T....}}}}}}}}}}}}}.}}}}}}',
        '}}}}}}}}}}}}}}}....}}}}}}}...}}.}}}}}}}}}}............T..}}}}}.T.}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}..T..}}}}}}}}}}}}}}..}}}}}..------+--...T.}}}....}}}}}}}}}}}',
        '}}}}.}..}}}}}}}.T.....}}}}}}}}}}}..T.}}}}.T.|...|...|....}}}}}.}}}}}...}}}}}',
        '}}}.T.}...}..}}}}T.T.}}}}}}.}}}}}}}....}}...|...+...|.}}}}}}}}}}}}}..T...}}}',
        '}}}}..}}}.....}}...}}}}}}}...}}}}}}}}}}}}}T.|...|...|}}}}}}}}}}}....T..}}}}}',
        '}}}}}..}}}.T..}}}.}}}}}}}}.T..}}}}}}}}}}}}}}---S-----}}}}}}}}}}}}}....}}}}}}',
        '}}}}}}}}}}}..}}}}}}}}}}}}}}}.}}}}}}}}}}}}}}}}}T..T}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
    ]);

    // C ref: medusa-3.lua lines 34-49. Three candidate rooms for Medusa
    // placement, using selection_rndcoord to distribute key features.
    const place = new ThemeroomSelection();
    place.set(8, 6);
    place.set(66, 5);
    place.set(46, 15);

    // Location of Medusa, downstairs, and Perseus's statue
    const medloc = place.rndcoord(true);
    // Alternate location for a decoy statue
    const altloc = place.rndcoord(true);
    // Location of a fountain in the remaining room
    const othloc = place.rndcoord(true);

    des.region(selection_area(0, 0, 74, 19), 'lit');
    // fixup_special hack: first room defined gets leaderboard statues
    des.region({ region: [49, 14, 51, 16], lit: -1, type: 'ordinary', arrival_room: true });
    des.region(selection_area(7, 5, 9, 7), 'unlit');
    des.region(selection_area(65, 4, 67, 6), 'unlit');
    des.region(selection_area(45, 14, 47, 16), 'unlit');

    // Non diggable walls
    des.non_diggable(selection_area(6, 4, 10, 8));
    des.non_diggable(selection_area(64, 3, 68, 7));
    des.non_diggable(selection_area(44, 13, 48, 17));

    // Teleport and level regions
    des.teleport_region({ region: [33, 2, 38, 7], dir: 'down' });
    des.levregion({ region: [32, 1, 39, 7], type: 'stair-up' });

    // Downstairs at Medusa's location
    des.stair({ dir: 'down', coord: [medloc.x, medloc.y] });

    // Doors
    des.door('locked', 8, 8);
    des.door('locked', 64, 5);
    des.door('random', 50, 13);
    des.door('locked', 48, 15);

    // Fountain in the remaining room
    des.feature('fountain', othloc.x, othloc.y);

    // Perseus statue with conditional contents, at Medusa's location
    des.object({
        id: STATUE, coord: [medloc.x, medloc.y], buc: 'uncursed',
        montype: PM_KNIGHT, historic: 1, male: 1, name: 'Perseus',
        contents() {
            if (percent(75)) {
                des.object({ id: SHIELD_OF_REFLECTION, buc: 'cursed', spe: 0 });
            }
            if (percent(25)) {
                des.object({ id: LEVITATION_BOOTS, spe: 0 });
            }
            if (percent(50)) {
                des.object({ id: SCIMITAR, buc: 'blessed', spe: 2 });
            }
            if (percent(50)) {
                des.object({ id: SACK });
            }
        },
    });

    // Decoy statue at altloc and random statues with empty contents
    des.object({ id: STATUE, coord: [altloc.x, altloc.y], contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });

    // Random objects
    for (let i = 0; i < 8; i++) {
        des.object();
    }
    des.object({ id: SCR_BLANK_PAPER, coord: [48, 18] });
    des.object({ id: SCR_BLANK_PAPER, coord: [48, 18] });

    // Traps
    des.trap({ type: 'rust' });
    des.trap({ type: 'rust' });
    des.trap({ type: 'board' });
    des.trap({ type: 'board' });
    des.trap();

    // Monsters: place Medusa first so other monsters cannot steal her spot
    des.monster({ id: PM_MEDUSA, coord: [medloc.x, medloc.y], asleep: 1 });
    des.monster({ id: PM_GIANT_EEL });
    des.monster({ id: PM_GIANT_EEL });
    des.monster({ id: PM_JELLYFISH });
    des.monster({ id: PM_JELLYFISH });
    des.monster({ id: PM_WOOD_NYMPH });
    des.monster({ id: PM_WOOD_NYMPH });
    des.monster({ id: PM_WATER_NYMPH });
    des.monster({ id: PM_WATER_NYMPH });

    // 30 hostile ravens nesting in the trees
    for (let i = 0; i < 30; i++) {
        des.monster({ id: PM_RAVEN, peaceful: 0 });
    }
}

// C ref: dat/medusa-4.lua. The fourth Medusa level variant with yellow dragon
// nest and snake/naga inhabitants.
async function medusa4(des) {
    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags('noteleport', 'mazelevel');

    des.map([
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}}}}}}}}}}}}}........}}}}}}}}}}}}}}}}}}}}}}}..}}}.....}}}}}}}}}}}----|}}}}}',
        '}}}}}}..----------F-.....}}}}}}}}}}}}}}}}..---...}}}}....T.}}}}}}}....|}}}}}',
        '}}}.....|...F......S}}}}....}}}}}}}...}}.....|}}.}}}}}}}......}}}}|......}}}',
        '}}}.....+...|..{...|}}}}}}}}}}}}.....}}}}|...|}}}}}}}}}}}.}}}}}}}}----.}}}}}',
        '}}......|...|......|}}}}}}}}}......}}}}}}|.......}}}}}}}}}}}}}..}}}}}...}}}}',
        '}}|-+--F|-+--....|F|-|}}}}}....}}}....}}}-----}}.....}}}}}}}......}}}}.}}}}}',
        '}}|...}}|...|....|}}}|}}}}}}}..}}}}}}}}}}}}}}}}}}}}....}}}}}}}}....T.}}}}}}}',
        '}}|...}}F...+....F}}}}}}}..}}}}}}}}}}}}}}...}}}}}}}}}}}}}}}}}}}}}}....}}..}}',
        '}}|...}}|...|....|}}}|}....}}}}}}....}}}...}}}}}...}}}}}}}}}}}}}}}}}.....}}}',
        '}}--+--F|-+--....-F|-|....}}}}}}}}}}.T...}}}}....---}}}}}}}}}}}}}}}}}}}}}}}}',
        '}}......|...|......|}}}}}.}}}}}}}}}....}}}}}}}.....|}}}}}}}}}.}}}}}}}}}}}}}}',
        '}}}}....+...|..{...|.}}}}}}}}}}}}}}}}}}}}}}}}}}.|..|}}}}}}}......}}}}...}}}}',
        '}}}}}}..|...F......|...}}}}}}}}}}..---}}}}}}}}}}--.-}}}}}....}}}}}}....}}}}}',
        '}}}}}}}}-----S----F|....}}}}}}}}}|...|}}}}}}}}}}}}...}}}}}}...}}}}}}..}}}}}}',
        '}}}}}}}}}..............T...}}}}}.|.......}}}}}}}}}}}}}}..}...}.}}}}....}}}}}',
        '}}}}}}}}}}....}}}}...}...}}}}}.......|.}}}}}}}}}}}}}}.......}}}}}}}}}...}}}}',
        '}}}}}}}}}}..}}}}}}}}}}.}}}}}}}}}}-..--.}}}}}}}}..}}}}}}..T...}}}..}}}}}}}}}}',
        '}}}}}}}}}...}}}}}}}}}}}}}}}}}}}}}}}...}}}}}}}....}}}}}}}.}}}..}}}...}}}}}}}}',
        '}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}}.}}}}}}....}}}}}}}}}}}}}}}}}}}...}}}}}}',
    ]);

    // C ref: medusa-4.lua lines 39-52. Four candidate rooms.
    const place = new ThemeroomSelection();
    place.set(4, 8);
    place.set(10, 4);
    place.set(10, 8);
    place.set(10, 12);

    // Location of Medusa, downstairs, and Perseus's statue
    const medloc = place.rndcoord(true);
    // Alternate location for a decoy statue
    const altloc = place.rndcoord(true);

    des.region(selection_area(0, 0, 74, 19), 'lit');
    // fixup_special hack: first room gets leaderboard statues; irregular forces
    // it to be a room
    des.region({ region: [13, 3, 18, 13], lit: 1, type: 'ordinary', irregular: 1 });

    // Teleport regions
    des.teleport_region({ region: [64, 1, 74, 17], dir: 'down' });
    des.teleport_region({ region: [2, 2, 18, 13], dir: 'up' });

    // Level regions
    des.levregion({ region: [67, 1, 74, 20], type: 'stair-up' });

    // Downstairs at Medusa's location
    des.stair({ dir: 'down', coord: [medloc.x, medloc.y] });

    // Doors
    des.door('locked', 4, 6);
    des.door('locked', 4, 10);
    des.door('locked', 8, 4);
    des.door('locked', 8, 12);
    des.door('locked', 10, 6);
    des.door('locked', 10, 10);
    des.door('locked', 12, 8);

    // Branch
    des.levregion({ region: [27, 0, 79, 20], type: 'branch' });

    // Non diggable walls
    des.non_diggable(selection_area(1, 1, 22, 14));

    // Crystal ball
    des.object({ id: CRYSTAL_BALL, coord: [7, 8] });

    // Perseus statue with conditional contents, at Medusa's location
    des.object({
        id: STATUE, coord: [medloc.x, medloc.y], buc: 'uncursed',
        montype: PM_KNIGHT, historic: 1, male: 1, name: 'Perseus',
        contents() {
            if (percent(75)) {
                des.object({ id: SHIELD_OF_REFLECTION, buc: 'cursed', spe: 0 });
            }
            if (percent(25)) {
                des.object({ id: LEVITATION_BOOTS, spe: 0 });
            }
            if (percent(50)) {
                des.object({ id: SCIMITAR, buc: 'blessed', spe: 2 });
            }
            if (percent(50)) {
                des.object({ id: SACK });
            }
        },
    });

    // Decoy statue at altloc and random statues with empty contents
    des.object({ id: STATUE, coord: [altloc.x, altloc.y], contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });
    des.object({ id: STATUE, contents() {} });

    // Random objects
    for (let i = 0; i < 8; i++) {
        des.object();
    }

    // Traps
    for (let i = 0; i < 7; i++) {
        des.trap();
    }

    // Monsters: place Medusa first
    des.monster({ id: PM_MEDUSA, coord: [medloc.x, medloc.y], asleep: 1 });
    des.monster({ id: PM_KRAKEN, coord: [7, 7] });

    // The nesting yellow dragon
    des.monster({ id: PM_YELLOW_DRAGON, x: 5, y: 4, asleep: 1 });
    if (percent(50)) {
        des.monster({ id: PM_BABY_YELLOW_DRAGON, x: 4, y: 4, asleep: 1 });
    }
    if (percent(25)) {
        des.monster({ id: PM_BABY_YELLOW_DRAGON, x: 4, y: 5, asleep: 1 });
    }
    des.object({ id: EGG, x: 5, y: 4, montype: PM_YELLOW_DRAGON });
    if (percent(50)) {
        des.object({ id: EGG, x: 5, y: 4, montype: PM_YELLOW_DRAGON });
    }
    if (percent(25)) {
        des.object({ id: EGG, x: 5, y: 4, montype: PM_YELLOW_DRAGON });
    }

    // Water monsters
    des.monster({ id: PM_GIANT_EEL });
    des.monster({ id: PM_GIANT_EEL });
    des.monster({ id: PM_JELLYFISH });
    des.monster({ id: PM_JELLYFISH });

    // 14 snakes
    for (let i = 0; i < 14; i++) {
        des.monster({ class: S_SNAKE });
    }

    // Black nagas
    for (let i = 0; i < 4; i++) {
        des.monster({ id: PM_BLACK_NAGA_HATCHLING });
        des.monster({ id: PM_BLACK_NAGA });
    }
}

export const MEDUSA_LEVEL_LOADERS = {
    'medusa-1': medusa1,
    'medusa-2': medusa2,
    'medusa-3': medusa3,
    'medusa-4': medusa4,
};
