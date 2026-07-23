// command_bindings.js -- Source command-key binding state.
// C ref: cmd.c extcmdlist[], commands_init(), and reset_commands().

// Keeping list order matters because rebinding an existing key does not move
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

// cmd.c commands_init() registers the number-pad compatibility aliases first,
// then the unconditional alternate keys. Array order preserves its head
// insertion and lookup behavior across both groups.
const SOURCE_COMMAND_ALIASES = Object.freeze([
    ['^L', 'redraw'],
    ['h', 'help'],
    ['j', 'jump'],
    ['k', 'kick'],
    ['l', 'loot'],
    ['^N', 'annotate'],
    ['N', 'name'],
    ['u', 'untrap'],
    ['5', 'run'],
    ['M-5', 'rush'],
    ['-', 'fight'],
    ['M-O', 'overview'],
    ['M-2', 'twoweapon'],
    ['M-N', 'name'],
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

export function commandKeyCode(text) {
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

export function bindingAt(bindings, key) {
    return bindings.find((binding) => binding.key === (key & 0xFF)) ?? null;
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
        // cmd.c reset_commands() backs up its numpad RUN and RUSH slots
        // separately even though both modes use the same meta-digit key. The
        // first backup captures and removes the binding; the second captures
        // null. Restoration later re-adds the first, then removes it with the
        // second, which is observable after user bindings and mode changes.
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

export function createCommandBindingModel(state) {
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
    for (const [key, command] of SOURCE_COMMAND_ALIASES) {
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

export function commandForKey(model, key) {
    return bindingAt(model.bindings, key)?.command ?? null;
}

export function visibleCommandKey(code) {
    const byte = code & 0xFF;
    if (byte >= 0x80) return `M-${visibleCommandKey(byte & 0x7F)}`;
    if (byte < 0x20) return `^${String.fromCharCode(byte + 0x40)}`;
    if (byte === 0x7F) return '^?';
    return String.fromCharCode(byte);
}
