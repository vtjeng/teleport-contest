// command_bindings.js -- Source command-key binding state.
// C ref: cmd.c extcmdlist[], commands_init(), and reset_commands().

import { INTERNALCMD, extcmdlist } from './extcmdlist_data.js';

// C ref: cmd.c commands_init(), which walks extcmdlist[] and binds every row
// carrying a nonzero key. Keeping that order matters because rebinding an
// existing key does not move its linked-list node while binding a new key
// inserts at the head.
const SOURCE_EXTENDED_COMMAND_DEFAULTS = Object.freeze(
    extcmdlist.filter((entry) => entry.key)
        .map((entry) => Object.freeze([entry.key, entry.ef_txt])),
);

// C ref: include/func_tab.h INTERNALCMD, "only for internal use, not for
// user". cmd.c gives the flag to six extcmdlist[] rows (2060-2065), none of
// which carries a key, so a `bind` statement in a configuration file is the
// only thing that can name one.
const INTERNAL_COMMAND_NAMES = Object.freeze(new Set(
    extcmdlist.filter((entry) => (entry.flags & INTERNALCMD) !== 0)
        .map((entry) => entry.ef_txt),
));

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

// DIRECTION_COMMANDS rows and every DIRECTION_KEYS string share index order
// west, northwest, north, northeast, east, southeast, south, southwest.
// Within each command row and directionBackups row, columns are walk, run,
// rush; keep every layout at exactly eight positions in this order.
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

// C ref: cmd.c spkeys_binds[] (3161-3191), which reset_commands() copies into
// gc.Cmd.spkeys[] on its `initial` pass. The names are the ones `bind` accepts
// in a config file, and js/options.js emits a `special_key` operation carrying
// the same name, so this table and that operation share one namespace.
// NHKF_ESC is spelled here too even though spkeys_binds[] marks it "no
// binding": reset_commands() copies every row, and bind_specialkey() declines
// it only because the row carries a null name.
const SOURCE_SPECIAL_KEY_DEFAULTS = Object.freeze({
    escape: '\x1B',
    'getdir.self': '.',
    'getdir.self2': 's',
    'getdir.help': '?',
    'getdir.mouse': '_',
    count: 'n',
    'getpos.self': '@',
    'getpos.pick': '.',
    'getpos.pick.quick': ',',
    'getpos.pick.once': ';',
    'getpos.pick.verbose': ':',
    'getpos.valid': '$',
    'getpos.autodescribe': '#',
    'getpos.mon.next': 'm',
    'getpos.mon.prev': 'M',
    'getpos.obj.next': 'o',
    'getpos.obj.prev': 'O',
    'getpos.door.next': 'd',
    'getpos.door.prev': 'D',
    'getpos.unexplored.next': 'x',
    'getpos.unexplored.prev': 'X',
    'getpos.valid.next': 'z',
    'getpos.valid.prev': 'Z',
    'getpos.all.next': 'a',
    'getpos.all.prev': 'A',
    'getpos.help': '?',
    'getpos.filter': '"',
    'getpos.moveskip': '*',
    'getpos.menu': '!',
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

// C ref: cmd.c cmdbind_add(), whose `user` argument becomes the entry's
// userbind flag.  An overwrite stores the new call's value, so a compiled-in
// rebinding of a key the player bound clears the flag again.  Every C caller
// but bind_key()'s OPTIONS `bind` path passes FALSE, which is this default.
// cmd.c count_bind_keys() is the only reader.
function setBinding(bindings, key, command, restBinding = false,
    userbind = false) {
    const index = bindings.findIndex((binding) => binding.key === key);
    if (command == null) {
        if (index >= 0) bindings.splice(index, 1);
        return;
    }
    if (index >= 0) {
        bindings[index].command = command;
        bindings[index].restBinding = restBinding;
        bindings[index].userbind = userbind;
    } else {
        bindings.unshift({ key, command, restBinding, userbind });
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

function resetCommandBindings(
    model,
    numberPadEnabled,
    numberPadMode,
    initialSetup = false,
) {
    if (!initialSetup && model.directionBackups) {
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

    const swapYZ = Boolean(numberPadMode & 1) && !numberPadEnabled;
    const pcHack = Boolean(numberPadMode & 1) && numberPadEnabled;
    const phone = Boolean(numberPadMode & 2) && numberPadEnabled;
    if (!initialSetup && swapYZ !== model.swapYZ) {
        for (const [first, second] of YZ_SWAP_KEYS) {
            swapBindingKeys(
                model.bindings,
                commandKeyCode(first),
                commandKeyCode(second),
            );
        }
    }
    if (!initialSetup && pcHack !== model.pcHack) {
        setBinding(
            model.bindings,
            commandKeyCode('M-0'),
            pcHack ? 'inventtype' : null,
        );
    }
    if (!initialSetup && phone !== model.phone) {
        for (let index = 0; index < 3; ++index) {
            const low = '1'.charCodeAt(0) + index;
            const high = low + 6;
            swapBindingKeys(model.bindings, low, high);
            swapBindingKeys(model.bindings, low | 0x80, high | 0x80);
        }
    }
    model.numPad = numberPadEnabled;
    model.swapYZ = swapYZ;
    model.pcHack = pcHack;
    model.phone = phone;

    const directionKeys = numberPadEnabled
        ? (phone ? DIRECTION_KEYS.phone : DIRECTION_KEYS.numberPad)
        : (swapYZ ? DIRECTION_KEYS.swapped : DIRECTION_KEYS.normal);
    model.directionBackups = DIRECTION_COMMANDS.map((commands, direction) => {
        const key = directionKeys.charCodeAt(direction);
        // cmd.c reset_commands() backs up its numpad RUN and RUSH slots
        // separately even though both modes use the same meta-digit key. The
        // first backup captures and removes the binding; the second captures
        // null. Restoration later re-adds the first, then removes it with the
        // second, which is observable after user bindings and mode changes.
        const modeKeys = numberPadEnabled
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
        if (numberPadEnabled) {
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
        // cmd.c spkeys_binds[] keeps prompt/navigation keys outside the
        // extended-command linked list.  NHKF_COUNT is consumed by the command
        // parser and the four NHKF_GETDIR_* keys by cmd.c getdir(); the rest
        // are carried unread until their source owner is ported, because
        // reset_commands() installs the whole table at once and `bind` can
        // move any row.
        specialKeys: Object.fromEntries(
            Object.entries(SOURCE_SPECIAL_KEY_DEFAULTS).map(
                ([name, key]) => [name, commandKeyCode(key)],
            ),
        ),
        directionBackups: null,
        numPad: false,
        swapYZ: false,
        pcHack: false,
        phone: false,
        restOnSpace: false,
        unrestOnSpace: null,
    };
    // extcmdlist[] stores its key as a byte, so these pairs bind it directly.
    for (const [keyCode, command] of SOURCE_EXTENDED_COMMAND_DEFAULTS) {
        setBinding(model.bindings, keyCode, command);
    }
    // The alias rows above instead spell their key the way cmd.c writes it, so
    // commandKeyCode() turns "^L" or "M-5" into the byte the first loop holds.
    for (const [keyText, command] of SOURCE_COMMAND_ALIASES) {
        setBinding(model.bindings, commandKeyCode(keyText), command);
    }
    resetCommandBindings(model, false, 0, true);

    // Replay commandOperations to preserve source ordering and binding
    // collisions. The final option snapshots below also support callers that
    // provide only terminal option state; when both forms are present, the
    // snapshots should agree with the replayed result.
    for (const operation of state.commandOperations ?? []) {
        if (operation.type === 'bind') {
            const parameter = operation.command.indexOf('(');
            const command = (parameter >= 0
                ? operation.command.slice(0, parameter)
                : operation.command).toLowerCase();
            // cmd.c bind_key() (2690-2693) passes over an INTERNALCMD row
            // rather than binding it, and no other row carries the same
            // ef_txt, so the loop runs out and bind_key() returns FALSE. The
            // key keeps whatever it already held.
            if (INTERNAL_COMMAND_NAMES.has(command)) continue;
            setBinding(
                model.bindings,
                operation.key,
                command === 'nothing' ? null : command,
                false,
                // cmd.c bind_key(key, command, TRUE) is the only call that
                // marks an entry as the player's; options.c parsebindings()
                // is its one caller that passes TRUE.
                true,
            );
        } else if (operation.type === 'special_key') {
            model.specialKeys[operation.command] = operation.key & 0xFF;
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

// C ref: cmd.c cmd_from_func(). cmdbinds is ordered newest-first, just like
// model.bindings. Prefer the first printable non-space binding, retain the
// last control/meta binding as a fallback, and use Space only as a last
// resort. The fight-command '-' exception is irrelevant to current callers.
export function keyForCommand(model, command) {
    let fallback = 0;
    for (const binding of model.bindings) {
        const key = binding.key & 0xFF;
        if (key === commandKeyCode(' ')) continue;
        if (((key >= commandKeyCode('0') && key <= commandKeyCode('9'))
                || (key === commandKeyCode('-') && command === 'fight'))
            && !model.numPad) {
            continue;
        }
        if (binding.command !== command) continue;
        if (key >= 0x20 && key <= 0x7E) return key;
        fallback = key;
    }
    if (bindingAt(model.bindings, commandKeyCode(' '))?.command === command)
        return commandKeyCode(' ');
    return fallback;
}

export function visibleCommandKey(code) {
    const byte = code & 0xFF;
    if (byte >= 0x80) return `M-${visibleCommandKey(byte & 0x7F)}`;
    if (byte < 0x20) return `^${String.fromCharCode(byte + 0x40)}`;
    if (byte === 0x7F) return '^?';
    return String.fromCharCode(byte);
}
