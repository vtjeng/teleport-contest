// Tutorial special-level description.
// C/Lua ref: dat/tut-1.lua. Descriptor order is PRNG-significant.

import {
    BURN,
    ENGRAVE,
    MAGIC_PORTAL,
    SLP_GAS_TRAP,
    SQKY_BOARD,
    TRAPDOOR,
    WEB,
} from './const.js';
import {
    PM_KNIGHT,
    PM_LICHEN,
    PM_MONK,
    PM_WOLF,
    PM_YELLOW_MOLD,
} from './monsters.js';
import {
    APPLE,
    BOULDER,
    CANDY_BAR,
    CORPSE,
    DAGGER,
    KNIFE,
    LARGE_BOX,
    LEATHER_ARMOR,
    LEATHER_GLOVES,
    POT_OBJECT_DETECTION,
    RIN_LEVITATION,
    ROCK,
    SCR_REMOVE_CURSE,
    SLING,
    SPE_LIGHT,
    WAN_SECRET_DOOR_DETECTION,
} from './objects.js';
import {
    bindingAt,
    commandKeyCode,
    createCommandBindingModel,
    visibleCommandKey,
} from './command_bindings.js';

export const TUTORIAL_MAP = Object.freeze([
    '---------------------------------------------------------------------------',
    '|-.--|.......|......|..S....|.F.......|.............|.......|.............|',
    '|.-..........|......|--|....|.F.....|.|S-------.....|.....................|',
    '||.--|.......|..T......|....|.F.....|.|.......|.....|.......|.............|',
    '||.|.|.......|......|-.|....|.F.....|.|.......|.....|--------.............|',
    '||.|.|.......|......||.|-.-----------.-.......|-S----.....................|',
    '|-+-S---------..---.||........................|...|.......................|',
    '|......|          |.-------------------.......|...|....--S----............|',
    '|......|  ######  |.........|      |..S.......|...|....|.....|............|',
    '|----.-| -+-   #  |.....---.|######+..|.......S...|....|.....|............|',
    '|----+----.----+---.|.--|.|.|#     ------------...|....|.....F............|',
    '|........|.|......|.|...F...|#  ........|.....+...|....|.....|............|',
    '|.P......-S|......|------.---# .........|.....|...|....-------........----|',
    '|..........|......+.|...|.|.S# ..--S-----.....|LLL|..................|..| |',
    '|.W......---......|.|.|.|.|.|# ..|......|.....|LLL|..................|..--|',
    '|....Z.L.S.F......|.|.|.|.---#   |......+.....|...|..................|..|.|',
    '|........|--......|...|.....|####+......|.....|...+..................||...|',
    '---------------------------------------------------------------------------',
]);

function tutorialCommandKey(command, model) {
    let nonPrintable = 0;
    for (const binding of model.bindings) {
        const key = binding.key;
        if (key === commandKeyCode(' ')) continue;
        if (!model.numPad
            && ((key >= commandKeyCode('0') && key <= commandKeyCode('9'))
                || (key === commandKeyCode('-') && command === 'fight'))) {
            continue;
        }
        if (binding.command !== command) continue;
        if (key >= 0x20 && key <= 0x7E) return visibleCommandKey(key);
        nonPrintable = key;
    }
    const space = bindingAt(model.bindings, commandKeyCode(' '));
    if (space?.command === command) return ' ';
    return nonPrintable ? visibleCommandKey(nonPrintable) : `#${command}`;
}

function tutorialKeys(des, state) {
    let controlKey = null;
    const commandBindings = des.eckey
        ? null : createCommandBindingModel(state);

    function key(command) {
        const source = des.eckey?.(command)
            ?? tutorialCommandKey(command, commandBindings);
        let match = source.match(/^\^([A-Z])$/u);
        if (match) {
            controlKey = match[1];
            return `Ctrl-${match[1]}`;
        }
        match = source.match(/^M-([A-Z])$/u);
        if (match) return `Alt-${match[1]}`;
        return source;
    }

    function help(x, y) {
        if (controlKey == null) return;
        des.engraving({
            coord: [x, y],
            type: ENGRAVE,
            text: 'Note: Outside the tutorial, Ctrl-key combinations are '
                + `shown prefixed with a caret, like '^${controlKey}'`,
            degrade: false,
        });
        controlKey = null;
    }

    return { key, help };
}

export const _tutorialLevelInternals = Object.freeze({
    commandKeyCode,
    createCommandBindingModel,
    tutorialCommandKey,
});

// Port of dat/tut-1.lua. The injected `des` object deliberately mirrors the
// small slice of the Lua special-level API used by this one level.
export function loadTutorialLevel(des, state) {
    const { key: tutKey, help: tutKeyHelp } = tutorialKeys(des, state);
    const percent = (threshold) => des.random.rn2(100) < threshold;

    des.level_init({ style: 'solidfill', fg: ' ' });
    des.level_flags(
        'mazelevel',
        'noflip',
        'nomongen',
        'nodeathdrops',
        'noautosearch',
    );
    des.map(TUTORIAL_MAP);
    des.region({ area: [1, 1, 73, 16], lit: true });
    des.non_diggable();
    des.teleport_region({ region: [9, 3, 9, 3] });

    des.parse_config('mention_walls', true);
    des.parse_config('mention_decor', true);
    des.parse_config('lit_corridor', true);

    const moveKeys = [
        tutKey('movewest'),
        tutKey('movesouth'),
        tutKey('movenorth'),
        tutKey('moveeast'),
    ].join(' ');
    const diagonalMoveKeys = [
        tutKey('movesouthwest'),
        tutKey('movenortheast'),
        tutKey('movesoutheast'),
        tutKey('movenorthwest'),
    ].join(' ');

    des.engraving({
        coord: [9, 3], type: ENGRAVE,
        text: `Move around with ${moveKeys}`, degrade: false,
    });
    des.engraving({
        coord: [5, 2], type: ENGRAVE,
        text: `Move diagonally with ${diagonalMoveKeys}`, degrade: false,
    });
    if (state.urole?.mnum === PM_KNIGHT) {
        des.engraving({
            coord: [12, 1], type: ENGRAVE,
            text: `Knights can jump with '${tutKey('jump')}'`,
            degrade: false,
        });
    }

    des.engraving({
        coord: [2, 4], type: ENGRAVE,
        text: 'Some actions may require multiple tries before succeeding',
        degrade: false,
    });
    des.engraving({
        coord: [2, 5], type: ENGRAVE,
        text: 'Open the door by moving into it', degrade: false,
    });
    des.door({ coord: [2, 6], state: 'closed' });
    des.engraving({
        coord: [2, 7], type: ENGRAVE,
        text: `Close the door with '${tutKey('close')}'`, degrade: false,
    });

    des.engraving({
        coord: [4, 5], type: ENGRAVE,
        text: 'You can leave the tutorial via the magic portal.',
        degrade: false,
    });
    des.trap({ type: MAGIC_PORTAL, coord: [4, 4], seen: true });

    des.engraving({
        coord: [5, 9], type: ENGRAVE,
        text: `This door is locked. Kick it with '${tutKey('kick')}'`,
        degrade: false,
    });
    des.door({ coord: [5, 10], state: 'locked' });
    tutKeyHelp(6, 8);
    des.engraving({
        coord: [5, 12], type: ENGRAVE,
        text: `Look around the map with '${tutKey('glance')}', press ESC when you're done`,
        degrade: false,
    });

    des.engraving({
        coord: [10, 13], type: ENGRAVE,
        text: `Use '${tutKey('search')}' to search for secret doors`,
        degrade: false,
    });
    des.engraving({
        coord: [10, 15], type: ENGRAVE,
        text: 'Wrong secret', degrade: false,
    });

    des.engraving({
        coord: [10, 10], type: ENGRAVE,
        text: 'Behind this door is a dark corridor', degrade: false,
    });
    des.door({
        coord: [10, 9], state: percent(50) ? 'locked' : 'closed',
    });
    des.region({ match: '#', lit: false });
    des.region({ match: ' ', lit: false });
    des.door({
        coord: [15, 10], state: percent(50) ? 'locked' : 'closed',
    });

    des.engraving({
        coord: [15, 11], type: ENGRAVE,
        text: 'There are four traps next to you! Search for them.',
        degrade: false,
    });
    const locations = [[14, 11], [14, 12], [15, 12], [16, 12], [16, 11]];
    des.shuffle(locations);
    for (let index = 0; index < 4; ++index) {
        des.trap({
            type: percent(50) ? SLP_GAS_TRAP : SQKY_BOARD,
            coord: locations[index],
            victim: false,
        });
    }
    des.engraving({
        coord: [15, 15], type: ENGRAVE,
        text: `Some traps can be disabled with '${tutKey('untrap')}'`,
        degrade: false,
    });
    des.trap({
        coord: [15, 16], type: WEB, spider_on_web: false,
    });

    des.door({ coord: [18, 13], state: 'closed' });
    des.engraving({
        coord: [19, 13], type: ENGRAVE,
        text: `Pick up items with '${tutKey('pickup')}'`, degrade: false,
    });
    const armor = state.urole?.mnum === PM_MONK
        ? LEATHER_GLOVES : LEATHER_ARMOR;
    des.object({
        id: armor, spe: 0, buc: 'cursed', coord: [19, 14],
    });
    des.engraving({
        coord: [19, 15], type: ENGRAVE,
        text: `Wear armor with '${tutKey('wear')}'`, degrade: false,
    });
    des.object({
        id: DAGGER, spe: 0, buc: 'not-cursed', coord: [21, 15],
    });
    des.engraving({
        coord: [21, 14], type: ENGRAVE,
        text: `Wield weapons with '${tutKey('wield')}'`, degrade: false,
    });
    des.engraving({
        coord: [22, 13], type: ENGRAVE,
        text: 'Hit monsters by walking into them.', degrade: false,
    });
    des.monster({
        id: PM_LICHEN, coord: [23, 15], waiting: true, countbirth: false,
    });

    des.engraving({
        coord: [24, 16], type: ENGRAVE,
        text: 'Now you know the very basics. You can leave the tutorial via the magic portal.',
        degrade: false,
    });
    des.engraving({
        coord: [26, 16], type: ENGRAVE,
        text: 'Step into this portal to leave the tutorial', degrade: false,
    });
    des.trap({ type: MAGIC_PORTAL, coord: [27, 16], seen: true });

    des.engraving({
        coord: [25, 13], type: ENGRAVE,
        text: 'Push boulders by moving into them', degrade: false,
    });
    des.object({ id: BOULDER, coord: [25, 12] });
    des.engraving({
        coord: [27, 9], type: ENGRAVE,
        text: `Take off armor with '${tutKey('takeoff')}'`, degrade: false,
    });

    des.object({
        id: SCR_REMOVE_CURSE, buc: 'blessed', coord: [23, 11],
    });
    des.engraving({
        coord: [22, 11], type: ENGRAVE,
        text: 'Some items have shuffled descriptions, different each game',
        degrade: false,
    });
    des.engraving({
        coord: [23, 11], type: ENGRAVE,
        text: `Pick up this scroll, read it with '${tutKey('read')}', and try to remove the armor again`,
        degrade: false,
    });

    des.engraving({
        coord: [19, 10], type: ENGRAVE,
        text: 'Another magic portal, a way to leave this tutorial',
        degrade: false,
    });
    des.trap({ type: MAGIC_PORTAL, coord: [19, 11], seen: true });

    des.object({
        coord: [14, 5], id: ROCK, quantity: des.random.rn1(50, 50),
    });
    des.object({
        coord: [15, 5], id: ROCK, quantity: des.random.rn1(21, 10),
    });
    des.object({
        coord: [14, 4], id: ROCK, quantity: des.random.rn1(21, 10),
    });
    des.object({
        coord: [15, 6], id: ROCK, quantity: des.random.rn1(31, 30),
    });
    des.object({
        coord: [14, 6], id: ROCK, quantity: des.random.rn1(31, 30),
    });
    des.object({ coord: [14, 6], id: BOULDER });
    des.door({
        coord: [20, 3], state: percent(50) ? 'open' : 'closed',
    });
    des.engraving({
        coord: [21, 3], type: ENGRAVE,
        text: 'Avoid being burdened, it slows you down', degrade: false,
    });
    des.engraving({
        coord: [22, 3], type: ENGRAVE,
        text: `Drop items with '${tutKey('drop')}'`, degrade: false,
    });
    des.engraving({
        coord: [22, 4], type: ENGRAVE,
        text: 'You can drop partial stacks by prefixing the item slot letter with a number',
        degrade: false,
    });

    des.monster({
        id: PM_YELLOW_MOLD, coord: [26, 2], waiting: true,
        countbirth: false,
    });
    des.engraving({
        coord: [25, 5], type: ENGRAVE,
        text: `Throw items with '${tutKey('throw')}'`, degrade: false,
    });
    des.trap({ type: MAGIC_PORTAL, coord: [21, 1], seen: true });

    des.monster({
        id: PM_WOLF, coord: [29, 2], peaceful: false, waiting: true,
        countbirth: false,
    });
    des.engraving({
        coord: [37, 4], type: ENGRAVE,
        text: 'Missiles, such as rocks, work better when fired from appropriate launcher',
        degrade: false,
    });
    des.object({
        coord: [37, 3], id: SLING, buc: 'not-cursed', spe: 9,
    });
    des.engraving({
        coord: [37, 3], type: ENGRAVE,
        text: 'Wield the sling', degrade: false,
    });
    des.engraving({
        coord: [36, 1], type: ENGRAVE,
        text: `Use '${tutKey('fire')}' to fire missiles with the wielded launcher`,
        degrade: false,
    });
    des.engraving({
        coord: [35, 4], type: ENGRAVE,
        text: `Firing launches items from your quiver; Use '${tutKey('quiver')}' to put items in it`,
        degrade: false,
    });
    des.engraving({
        coord: [33, 4], type: ENGRAVE,
        text: `You can wait a turn with '${tutKey('wait')}'`, degrade: false,
    });

    des.door({ coord: [38, 6], state: 'closed' });
    des.engraving({
        coord: [39, 6], type: ENGRAVE,
        text: `You loot containers with '${tutKey('loot')}'`, degrade: false,
    });
    des.object({
        coord: [41, 6], id: LARGE_BOX, broken: true, trapped: false,
        contents() {
            des.object({ id: WAN_SECRET_DOOR_DETECTION, spe: 30 });
        },
    });
    des.engraving({
        coord: [42, 6], type: ENGRAVE,
        text: `Containers can also be emptied with '${tutKey('tip')}'`,
        degrade: false,
    });
    des.engraving({
        coord: [45, 6], type: ENGRAVE,
        text: `Magic wands are used with '${tutKey('zap')}'`, degrade: false,
    });

    des.door({ coord: [35, 9], state: 'nodoor' });
    des.engraving({
        coord: [34, 9], type: ENGRAVE,
        text: `You can run by prefixing a movement key with '${tutKey('run')}'`,
        degrade: false,
    });
    des.door({ coord: [33, 16], state: 'nodoor' });
    des.engraving({
        coord: [35, 15], type: ENGRAVE,
        text: `Travel across the level with '${tutKey('travel')}'`,
        degrade: false,
    });
    des.trap({ type: MAGIC_PORTAL, coord: [27, 14], seen: true });

    des.engraving({
        coord: [48, 1], type: BURN,
        text: `Use '${tutKey('eat')}' to eat edible things`, degrade: false,
    });
    des.object({ coord: [50, 3], id: APPLE, buc: 'not-cursed' });
    des.object({ coord: [50, 3], id: CANDY_BAR, buc: 'not-cursed' });
    des.object({
        coord: [50, 3], id: CORPSE, montype: PM_LICHEN,
        buc: 'not-cursed',
    });

    des.door({ coord: [46, 11], state: 'closed' });
    des.engraving({
        coord: [43, 11], type: BURN,
        text: `Use '${tutKey('twoweapon')}' to use two weapons at once`,
        degrade: false,
    });
    des.object({ coord: [43, 13], id: KNIFE, buc: 'uncursed' });
    des.object({ coord: [43, 14], id: DAGGER, buc: 'blessed' });
    des.engraving({
        coord: [43, 16], type: BURN,
        text: `Swap weapons quickly with '${tutKey('swap')}'`, degrade: false,
    });
    des.door({ coord: [40, 15], state: 'random' });

    des.object({
        coord: [48, 7], id: RIN_LEVITATION, buc: 'not-cursed',
    });
    des.engraving({
        coord: [48, 10], type: BURN,
        text: `Put on accessories with '${tutKey('puton')}'`, degrade: false,
    });
    des.engraving({
        coord: [48, 16], type: BURN,
        text: `Remove accessories with '${tutKey('remove')}'`, degrade: false,
    });
    des.door({ coord: [50, 16], state: 'closed' });

    des.engraving({
        coord: [58, 9], type: BURN,
        text: `Use '${tutKey('down')}' to go down the stairs`, degrade: false,
    });
    des.stair({ dir: 'down', coord: [58, 10] });
    tutKeyHelp(64, 4);
    des.engraving({
        coord: [65, 3], type: BURN,
        text: 'UNDER CONSTRUCTION', degrade: false,
    });
    des.trap({ type: MAGIC_PORTAL, coord: [66, 2], seen: true });

    des.engraving({
        coord: [69, 12], type: BURN,
        text: "Can't get through?  You're carrying too much.",
        degrade: false,
    });
    des.object({ id: BOULDER, coord: [71, 16] });
    des.object({ id: BOULDER, coord: [72, 16] });
    des.object({ id: BOULDER, coord: [73, 16] });
    des.trap({ type: TRAPDOOR, coord: [73, 15] });

    des.engraving({
        coord: [60, 2], type: ENGRAVE,
        text: 'Spellcasting', degrade: false,
    });
    if ((state.u?.uenmax ?? 0) < 5) {
        des.engraving({
            coord: [59, 2], type: ENGRAVE,
            text: "Unfortunately you don't have enough energy to cast spells.",
            degrade: false,
        });
    }
    des.engraving({
        coord: [57, 2], type: ENGRAVE,
        text: `Pick up the spellbook with '${tutKey('pickup')}'`,
        degrade: false,
    });
    des.object({ coord: [57, 2], id: SPE_LIGHT, buc: 'blessed' });
    des.engraving({
        coord: [55, 2], type: ENGRAVE,
        text: `Read the spellbook with '${tutKey('read')}'`, degrade: false,
    });
    des.engraving({
        coord: [53, 2], type: ENGRAVE,
        text: `Use '${tutKey('cast')}' to cast a spell`, degrade: false,
    });
    des.region({ area: [53, 1, 59, 3], lit: false });

    des.engraving({
        coord: [72, 2], type: ENGRAVE,
        text: `You "quaff" potions with '${tutKey('quaff')}'`, degrade: false,
    });
    des.object({
        coord: [72, 2], id: POT_OBJECT_DETECTION, buc: 'blessed',
    });
}
