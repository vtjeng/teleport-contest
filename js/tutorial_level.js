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

function commandKeyCode(text) {
    if (text.length === 1) return text.charCodeAt(0);
    if (/^\^.$/u.test(text)) {
        return text[1] === '?' ? 0x7F : text.charCodeAt(1) & 0x1F;
    }
    if (/^M-\^.$/u.test(text)) {
        const control = text[3] === '?'
            ? 0x7F : text.charCodeAt(3) & 0x1F;
        return control | 0x80;
    }
    if (/^M-.$/u.test(text)) return text.charCodeAt(2) | 0x80;
    return 0;
}

// C ref: cmd.c extcmdlist[], commands_init(), and reset_commands(). This is
// command-key metadata for nh.eckey(), not command execution. Keeping the
// source list order matters because rebinding an existing key does not move
// its linked-list node while binding a new key inserts at the head.
const SOURCE_EXTENDED_COMMAND_DEFAULTS = Object.freeze([
    ['#', '#'], ['M-?', '?'], ['M-a', 'adjust'], ['M-A', 'annotate'],
    ['a', 'apply'], ['^X', 'attributes'], ['@', 'autopickup'], ['C', 'call'],
    ['Z', 'cast'], ['M-c', 'chat'], ['v', 'chronicle'], ['c', 'close'],
    ['M-C', 'conduct'], ['M-d', 'dip'], ['>', 'down'], ['d', 'drop'],
    ['D', 'droptype'], ['e', 'eat'], ['E', 'engrave'], ['M-e', 'enhance'],
    ['M-X', 'exploremode'], ['F', 'fight'], ['f', 'fire'], ['M-f', 'force'],
    ['M-g', 'genocided'], [';', 'glance'], ['?', 'help'], ['i', 'inventory'],
    ['I', 'inventtype'], ['M-i', 'invoke'], ['M-j', 'jump'], ['^D', 'kick'],
    ['\\', 'known'], ['`', 'knownclass'], [':', 'look'], ['M-l', 'loot'],
    ['M-m', 'monster'], ['M-n', 'name'], ['M-o', 'offer'], ['o', 'open'],
    ['O', 'options'], ['^O', 'overview'], ['p', 'pay'], ['|', 'perminv'],
    [',', 'pickup'], ['M-p', 'pray'], ['^P', 'prevmsg'], ['P', 'puton'],
    ['q', 'quaff'], ['Q', 'quiver'], ['r', 'read'], ['^R', 'redraw'],
    ['R', 'remove'], ['^A', 'repeat'], ['m', 'reqmenu'], ['^_', 'retravel'],
    ['M-R', 'ride'], ['M-r', 'rub'], ['G', 'run'], ['g', 'rush'],
    ['S', 'save'], ['s', 'search'], ['*', 'seeall'], ['"', 'seeamulet'],
    ['[', 'seearmor'], ['=', 'seerings'], ['(', 'seetools'], [')', 'seeweapon'],
    ['!', 'shell'], ['$', 'showgold'], ['+', 'showspells'], ['^', 'showtrap'],
    ['M-s', 'sit'], ['^Z', 'suspend'], ['x', 'swap'], ['T', 'takeoff'],
    ['A', 'takeoffall'], ['^T', 'teleport'], ['^?', 'terrain'], ['t', 'throw'],
    ['M-T', 'tip'], ['_', 'travel'], ['M-t', 'turn'], ['X', 'twoweapon'],
    ['M-u', 'untrap'], ['<', 'up'], ['M-V', 'vanquished'], ['M-v', 'version'],
    ['V', 'versionshort'], ['.', 'wait'], ['W', 'wear'], ['&', 'whatdoes'],
    ['/', 'whatis'], ['w', 'wield'], ['M-w', 'wipe'], ['^E', 'wizdetect'],
    ['^G', 'wizgenesis'], ['^I', 'wizidentify'], ['^V', 'wizlevelport'],
    ['^F', 'wizmap'], ['^W', 'wizwish'], ['z', 'zap'],
]);

const SOURCE_NUMPAD_ALIASES = Object.freeze([
    ['^L', 'redraw'],
    ['h', 'help'],
    ['j', 'jump'],
    ['k', 'kick'],
    ['l', 'loot'],
    ['^N', 'annotate'],
    ['N', 'name'],
    ['u', 'untrap'],
    ['5', 'run'],
]);

const DIRECTION_COMMANDS = Object.freeze([
    ['movewest', 'runwest', 'rushwest'],
    ['movenorthwest', 'runnorthwest', 'rushnorthwest'],
    ['movenorth', 'runnorth', 'rushnorth'],
    ['movenortheast', 'runnortheast', 'rushnortheast'],
    ['moveeast', 'runeast', 'rusheast'],
    ['movesoutheast', 'runsoutheast', 'rushsoutheast'],
    ['movesouth', 'runsouth', 'rushsouth'],
    ['movesouthwest', 'runsouthwest', 'rushsouthwest'],
]);

const DIRECTION_KEYS = Object.freeze({
    normal: 'hykulnjb',
    swapped: 'hzkulnjb',
    numberPad: '47896321',
    phone: '41236987',
});

const YZ_SWAP_KEYS = Object.freeze([
    ['y', 'z'], ['Y', 'Z'], ['^Y', '^Z'],
    ['M-y', 'M-z'], ['M-Y', 'M-Z'], ['M-^Y', 'M-^Z'],
]);

function bindingAt(bindings, key) {
    return bindings.find((binding) => binding.key === key) ?? null;
}

function setBinding(bindings, key, command, restBinding = false) {
    const index = bindings.findIndex((binding) => binding.key === key);
    if (command == null) {
        if (index >= 0) bindings.splice(index, 1);
        return;
    }
    if (index >= 0) {
        bindings[index].command = command;
        bindings[index].restBinding = restBinding;
    } else {
        bindings.unshift({ key, command, restBinding });
    }
}

function swapBindingKeys(bindings, first, second) {
    const firstBinding = bindingAt(bindings, first);
    const secondBinding = bindingAt(bindings, second);
    if (firstBinding && secondBinding) {
        firstBinding.key = second;
        secondBinding.key = first;
    }
}

function updateRestOnSpace(model, enabled) {
    const space = commandKeyCode(' ');
    const binding = bindingAt(model.bindings, space);
    if (binding && !binding.restBinding) {
        model.unrestOnSpace = binding.command;
    }
    setBinding(
        model.bindings,
        space,
        enabled ? 'wait' : model.unrestOnSpace,
        enabled,
    );
    model.restOnSpace = enabled;
}

function resetCommandBindings(model, enabled, mode, initial = false) {
    if (!initial && model.directionBackups) {
        for (const direction of model.directionBackups) {
            for (const binding of direction) {
                setBinding(
                    model.bindings,
                    binding.key,
                    binding.command,
                    binding.restBinding,
                );
            }
        }
    }

    const swapYZ = Boolean(mode & 1) && !enabled;
    const pcHack = Boolean(mode & 1) && enabled;
    const phone = Boolean(mode & 2) && enabled;
    if (!initial && swapYZ !== model.swapYZ) {
        for (const [first, second] of YZ_SWAP_KEYS) {
            swapBindingKeys(
                model.bindings,
                commandKeyCode(first),
                commandKeyCode(second),
            );
        }
    }
    if (!initial && pcHack !== model.pcHack) {
        setBinding(
            model.bindings,
            commandKeyCode('M-0'),
            pcHack ? 'inventtype' : null,
        );
    }
    if (!initial && phone !== model.phone) {
        for (let index = 0; index < 3; ++index) {
            const low = '1'.charCodeAt(0) + index;
            const high = low + 6;
            swapBindingKeys(model.bindings, low, high);
            swapBindingKeys(model.bindings, low | 0x80, high | 0x80);
        }
    }
    model.numPad = enabled;
    model.swapYZ = swapYZ;
    model.pcHack = pcHack;
    model.phone = phone;

    const directionKeys = enabled
        ? (phone ? DIRECTION_KEYS.phone : DIRECTION_KEYS.numberPad)
        : (swapYZ ? DIRECTION_KEYS.swapped : DIRECTION_KEYS.normal);
    model.directionBackups = DIRECTION_COMMANDS.map((commands, direction) => {
        const key = directionKeys.charCodeAt(direction);
        const modeKeys = enabled
            ? [key, key | 0x80, key | 0x80]
            : [key, directionKeys.toUpperCase().charCodeAt(direction), key & 0x1F];
        return modeKeys.map((modeKey) => {
            const binding = bindingAt(model.bindings, modeKey);
            const backup = {
                key: modeKey,
                command: binding?.command ?? null,
                restBinding: Boolean(binding?.restBinding),
            };
            setBinding(model.bindings, modeKey, null);
            return backup;
        });
    });

    for (let direction = 0; direction < DIRECTION_COMMANDS.length;
        ++direction) {
        const key = directionKeys.charCodeAt(direction);
        const [walk, run, rush] = DIRECTION_COMMANDS[direction];
        setBinding(model.bindings, key, walk);
        if (enabled) {
            setBinding(model.bindings, key | 0x80, run);
        } else {
            setBinding(
                model.bindings,
                directionKeys.toUpperCase().charCodeAt(direction),
                run,
            );
            setBinding(model.bindings, key & 0x1F, rush);
        }
    }
    updateRestOnSpace(model, model.restOnSpace);
}

function createCommandBindingModel(state) {
    const model = {
        bindings: [],
        directionBackups: null,
        numPad: false,
        swapYZ: false,
        pcHack: false,
        phone: false,
        restOnSpace: false,
        unrestOnSpace: null,
    };
    for (const [key, command] of SOURCE_EXTENDED_COMMAND_DEFAULTS) {
        setBinding(model.bindings, commandKeyCode(key), command);
    }
    for (const [key, command] of SOURCE_NUMPAD_ALIASES) {
        setBinding(model.bindings, commandKeyCode(key), command);
    }
    resetCommandBindings(model, false, 0, true);

    for (const operation of state.commandOperations ?? []) {
        if (operation.type === 'bind') {
            const parameter = operation.command.indexOf('(');
            const command = (parameter >= 0
                ? operation.command.slice(0, parameter)
                : operation.command).toLowerCase();
            setBinding(
                model.bindings,
                operation.key,
                command === 'nothing' ? null : command,
            );
        } else if (operation.type === 'number_pad') {
            resetCommandBindings(
                model,
                Boolean(operation.enabled),
                operation.mode ?? 0,
            );
        } else if (operation.type === 'rest_on_space') {
            updateRestOnSpace(model, Boolean(operation.enabled));
        }
    }
    const finalNumberPad = Boolean(state.iflags?.num_pad);
    const finalMode = state.iflags?.num_pad_mode ?? 0;
    if (model.numPad !== finalNumberPad
        || model.swapYZ !== (Boolean(finalMode & 1) && !finalNumberPad)
        || model.pcHack !== (Boolean(finalMode & 1) && finalNumberPad)
        || model.phone !== (Boolean(finalMode & 2) && finalNumberPad)) {
        resetCommandBindings(model, finalNumberPad, finalMode);
    }
    updateRestOnSpace(model, Boolean(state.flags?.rest_on_space));
    return model;
}

function visibleCommandKey(code) {
    const byte = code & 0xFF;
    if (byte >= 0x80) return `M-${visibleCommandKey(byte & 0x7F)}`;
    if (byte < 0x20) return `^${String.fromCharCode(byte + 0x40)}`;
    if (byte === 0x7F) return '^?';
    return String.fromCharCode(byte);
}

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
