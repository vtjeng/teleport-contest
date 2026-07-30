// cmd.js -- Command parsing, dispatch, and movement intent.
// C refs: cmd.c get_count(), parse(), rhack(), set_move_cmd().

import {
    commandForKey,
    createCommandBindingModel,
    keyForCommand,
    visibleCommandKey,
} from './command_bindings.js';
import {
    COLNO,
    PICK_NONE,
    PICK_ONE,
    SICK,
    SLIMED,
    STONED,
    STRANGLED,
} from './const.js';
import { UnsupportedArtifactDisplayError } from './artifacts.js';
import { dosearch, UnsupportedSearchError } from './detect.js';
import { flush_screen } from './display.js';
import { can_reach_floor, read_engr_at } from './engrave.js';
import {
    AUTOCOMPLETE,
    CMD_M_PREFIX,
    CMD_NOT_AVAILABLE,
    ECM_EXACTMATCH,
    ECM_IGNOREAC,
    ECM_NO1CHARCMD,
    IFBURIED,
    INTERNALCMD,
    WIZMODECMD,
    extcmdlist,
} from './extcmdlist_data.js';
import {
    UnsupportedGetlinBoundaryError,
    tty_get_ext_cmd,
} from './getline.js';
import { game } from './gstate.js';
import { lcase } from './hacklib.js';
import {
    ddoinv,
    dolook,
    UnsupportedFeatureDescriptionError,
} from './invent.js';
import { doattributes, UnsupportedEnlightenmentError } from './insight.js';
import { dodiscovered, UnsupportedDiscoveryDisplayError } from './o_init.js';
import { UnsupportedObjectNameError } from './objnam.js';
import { UnsupportedShopError } from './shk.js';
import { dovspell, UnsupportedSpellDisplayError } from './spell.js';
import { UnsupportedWeaponSkillError } from './weapon.js';
import {
    displayTtyTextWindow, menuTitleStyle, selectTtyMenu,
} from './tty_menu.js';
import {
    domove,
    monsterNearby,
    preflightDomoveDestination,
    UnsupportedHeroMoveBoundaryError,
} from './hack.js';
import { nhgetch } from './input.js';
import {
    clearTtyMessageWindow,
    ttyNorep,
    ttyPline,
} from './tty_message.js';

export const MAX_COMMAND_COUNT = 32767;
const ESC = 0x1B;
const BACKSPACE = 0x08;
const DELETE = 0x7F;
const DOMOVE_WALK = 0x01;
const DOMOVE_RUSH = 0x02;
// C ref: hack.h ECMD_* -- the result every extended command handler returns.
const ECMD_OK = 0x00;
const ECMD_TIME = 0x01;
const ECMD_CANCEL = 0x02;
const ECMD_FAIL = 0x04;

export class UnsupportedHeroCommandBoundaryError extends Error {
    constructor(reason, key) {
        super(`unsupported hero command: ${reason}`);
        this.name = 'UnsupportedHeroCommandBoundaryError';
        this.reason = reason;
        this.key = key;
    }
}

// Each value is [u.dx, u.dy, context.run]: 0 walks, 1 runs, and 3 rushes.
// Preserve these source numeric modes; downstream code groups them by
// truthiness only where cmd.c does.
const MOVEMENT_INTENTS = Object.freeze({
    movewest: [-1, 0, 0],
    movenorthwest: [-1, -1, 0],
    movenorth: [0, -1, 0],
    movenortheast: [1, -1, 0],
    moveeast: [1, 0, 0],
    movesoutheast: [1, 1, 0],
    movesouth: [0, 1, 0],
    movesouthwest: [-1, 1, 0],
    runwest: [-1, 0, 1],
    runnorthwest: [-1, -1, 1],
    runnorth: [0, -1, 1],
    runnortheast: [1, -1, 1],
    runeast: [1, 0, 1],
    runsoutheast: [1, 1, 1],
    runsouth: [0, 1, 1],
    runsouthwest: [-1, 1, 1],
    rushwest: [-1, 0, 3],
    rushnorthwest: [-1, -1, 3],
    rushnorth: [0, -1, 3],
    rushnortheast: [1, -1, 3],
    rusheast: [1, 0, 3],
    rushsoutheast: [1, 1, 3],
    rushsouth: [0, 1, 3],
    rushsouthwest: [-1, 1, 3],
});

function commandBindings(state) {
    state.commandBindings ??= createCommandBindingModel(state);
    return state.commandBindings;
}

// C ref: cmd.c extcmd_initiator(). reset_commands() keeps gc.Cmd.extcmd_char
// at cmd_from_func(doextcmd), the key currently bound to the '#' row, which
// keyForCommand() ports.
export function extcmd_initiator(state = game) {
    return keyForCommand(commandBindings(state), '#');
}

// C ref: cmd.c extcmds_match(). Returns the matching extcmdlist[] indexes;
// findstr === null asks for every currently available entry. strncmpi() and
// strcmpi() fold case with lowc(), which lcase() ports.
export function extcmds_match(findstr, ecmflags, state = game) {
    const ignoreac = (ecmflags & ECM_IGNOREAC) !== 0;
    const exactmatch = (ecmflags & ECM_EXACTMATCH) !== 0;
    const no1charcmd = (ecmflags & ECM_NO1CHARCMD) !== 0;
    const needle = findstr === null ? null : lcase(findstr);
    const matchlist = [];
    for (let i = 0; i < extcmdlist.length; ++i) {
        const entry = extcmdlist[i];
        if (entry.flags & (CMD_NOT_AVAILABLE | INTERNALCMD)) continue;
        // Debug mode is what makes '#levelchange' and its siblings matchable,
        // and what keeps 'l' ambiguous there while it expands to 'loot' in an
        // ordinary game.
        if (!state.wizard && (entry.flags & WIZMODECMD)) continue;
        if (!ignoreac && !(entry.flags & AUTOCOMPLETE)) continue;
        if (no1charcmd && entry.ef_txt.length === 1) continue;
        if (needle === null) {
            matchlist.push(i);
        } else {
            const name = lcase(entry.ef_txt);
            if (exactmatch ? name === needle : name.startsWith(needle))
                matchlist.push(i);
        }
    }
    return matchlist;
}

// C ref: cmd.c accept_menu_prefix().
function accept_menu_prefix(entry) {
    return Boolean(entry && (entry.flags & CMD_M_PREFIX));
}

function propertyIntrinsic(state, property) {
    return Boolean(state.u?.uprops?.[property]?.intrinsic);
}

// C ref: do.c danger_uprops(). These four properties are timeout bits; unlike
// ordinary property checks, the source tests their intrinsic field directly.
function dangerUprops(state) {
    return propertyIntrinsic(state, STONED)
        || propertyIntrinsic(state, SLIMED)
        || propertyIntrinsic(state, STRANGLED)
        || propertyIntrinsic(state, SICK);
}

// C ref: do.c cmd_safety_prevention(). flagName models the source int pointer.
export async function cmdSafetyPrevention(
    ucverb,
    cmddesc,
    act,
    flagName,
    state = game,
) {
    state.flags ??= {};
    state.iflags ??= {};
    state[flagName] ??= 0;
    if (state.flags.safe_wait
        && !state.iflags.menu_requested
        && !state.multi) {
        let assist = '';
        if (state.iflags.cmdassist) {
            const key = keyForCommand(commandBindings(state), 'reqmenu');
            assist = `  Use '${visibleCommandKey(key)}' prefix to force ${cmddesc}.`;
        } else {
            const prior = Math.trunc(state[flagName] ?? 0);
            state[flagName] = prior + 1;
            if (!prior) {
                const key = keyForCommand(commandBindings(state), 'reqmenu');
                assist = `  Use '${visibleCommandKey(key)}' prefix to force ${cmddesc}.`;
            }
        }

        if (monsterNearby(state)) {
            await ttyNorep(`${act}${assist}`, state);
            return true;
        }
        if (dangerUprops(state)) {
            await ttyNorep(
                `${ucverb} doesn't feel like a good idea right now.`,
                state,
            );
            return true;
        }
    }
    state[flagName] = 0;
    return false;
}

// C ref: do.c donull().
export async function donull(state = game) {
    const prevented = await cmdSafetyPrevention(
        'Waiting',
        'a no-op (to rest)',
        'Are you waiting to get hit?',
        'did_nothing_flag',
        state,
    );
    state.context.move = prevented ? 0 : 1;
    return !prevented;
}

function isDigit(key) {
    return key >= 0x30 && key <= 0x39;
}

// C ref: cmd.c readchar_core(). The window port supplies physical bytes;
// this helper composes ESC+byte for altmeta and resets input_state after the
// completed logical command read.
async function readCommandKey(state) {
    let key = (await nhgetch(state)) & 0xFF;
    if (key === ESC && state.iflags.altmeta
        && state.program_state.input_state !== 'other') {
        const following = (await nhgetch(state)) & 0xFF;
        if (following === 0 || following === ESC) key = ESC;
        else key = following | 0x80;
    }
    state.program_state.input_state = 'other';
    return key;
}

// C ref: cmd.c get_count(). parse() passes allowchars == NULL: an ordinary
// non-digit commits the count, Backspace/Delete edit it, and Escape returns
// without committing so parse() can cancel the count.
async function getCount(state, inkey = 0) {
    let count = 0;
    let key = inkey;
    let hasInkey = Boolean(inkey);
    let backspaced = false;
    let showZero = true;
    const savedInputState = state.program_state.input_state;

    for (;;) {
        if (hasInkey) {
            hasInkey = false;
        } else {
            // readchar_core() resets input_state after each logical read.
            // Restore commandInp before the next read so ESC+byte remains one
            // meta command after any number of digits.
            state.program_state.input_state = savedInputState;
            key = await readCommandKey(state);
        }

        if (isDigit(key)) {
            // AppendLongDigit() followed by parse()'s LARGEST_INT limit.
            count = Math.min(
                MAX_COMMAND_COUNT,
                count * 10 + key - 0x30,
            );
            showZero = key === 0x30;
        } else if (key === BACKSPACE || key === DELETE) {
            if (!count) break;
            showZero = false;
            count = Math.trunc(count / 10);
            backspaced = true;
        } else if (key === ESC) {
            break;
        } else {
            break;
        }

        if (count > 9 || backspaced) {
            clearTtyMessageWindow(state);
            let countMessage;
            if (backspaced && !count && !showZero) {
                countMessage = 'Count: ';
            } else {
                countMessage = `Count: ${count}`;
                backspaced = false;
            }
            await ttyPline(countMessage, state);
            // get_count() calls mark_synch() after writing the transient
            // message, making it visible at the next readchar() boundary.
            await flush_screen(1);
            state.nhDisplay?.setCursor(countMessage.length, 0);
        }
    }
    return { key, count };
}

async function beginCommandParse(state) {
    state.iflags ??= {};
    state.program_state ??= {};
    state.context ??= {};
    state.commandCount = 0;
    state.context.move = 1;
    await flush_screen(1);
    state.iflags.in_parse = true;
    state.program_state.input_state = 'command';
}

function abortCommandParse(state) {
    state.context.move = 0;
    state.iflags.in_parse = false;
    state.program_state.input_state = 'other';
}

function finishCommandParse(parsed, state) {
    state.commandCount = parsed.count;
    state.lastCommandCount = parsed.count;
    if (parsed.key === ESC) {
        clearTtyMessageWindow(state);
        state.commandCount = 0;
        state.lastCommandCount = 0;
    }
    state.multi = state.commandCount;
    if (state.multi) --state.multi;
    state.cmdKey = parsed.key;
    clearTtyMessageWindow(state);
    state.iflags.in_parse = false;
    state.program_state.input_state = 'other';
    return state.cmdKey;
}

// C ref: cmd.c parse(). Reads one logical command, stores its parsed count in
// commandCount/lastCommandCount, remaining repeats in multi, and its command
// byte in cmdKey. It restores parse/input state, clears the physical TTY
// message row, and returns cmdKey.
export async function parseCommand(state = game) {
    await beginCommandParse(state);
    let parsed;
    try {
        if (!state.iflags.num_pad) {
            parsed = await getCount(state);
        } else {
            const key = await readCommandKey(state);
            const countKey = commandBindings(state).specialKeys.count;
            if (key === countKey) {
                // The initial read reset input_state; get_count() restores
                // commandInp so altmeta also works after the count prefix.
                state.program_state.input_state = 'command';
                parsed = await getCount(state);
            } else {
                parsed = { key, count: 0 };
            }
        }
    } catch (error) {
        // A replay can intentionally stop at this live input wait. C never
        // returns from readchar() in that state, so undo parse()'s provisional
        // time assumption for the runner's boundary diagnostics.
        abortCommandParse(state);
        throw error;
    }

    return finishCommandParse(parsed, state);
}

// Every command this milestone dispatches, named once so the comment above
// readSimpleCommand(), both boundary messages, and the admission test cannot
// drift apart as more commands land. '#' opens the extended-command prompt,
// through which the other seven are also reachable by name; every other
// extended command stops inside doextcmd() instead, after the prompt has
// painted the frames the reference program painted for the same keystrokes.
const ADMITTED_COMMANDS = Object.freeze([
    'wait', 'look', 'inventory', 'showspells', 'known', 'attributes', 'search',
    '#',
]);
const ADMITTED_BOUNDARY = 'the repeated-command boundary admits only '
    + `${ADMITTED_COMMANDS.join(', ')}, an uncounted one-square walk, an `
    + 'uncounted shift-direction run, an uncounted ctrl-direction rush, or a '
    + 'byte bound to no command';
// context.run values this boundary dispatches. cmd.c set_move_cmd() takes the
// value from the command the key is bound to: 0 for do_move_<dir>, 1 for
// do_run_<dir>, which the shift-direction keys use, and 3 for do_rush_<dir>
// at cmd.c:1461-1512, which the ctrl-direction keys use.
//
// Two values are refused here, by value: 2, which only do_rush() behind the `g`
// prefix sets at cmd.c:1599, and 8, which dotravel_target() sets.
//
// The `g` and `G` prefixes are refused one level earlier instead, and this list
// cannot refuse them. `js/command_bindings.js` binds them to the commands
// `rush` and `run`, which no `MOVEMENT_INTENTS` entry covers, so the lookup
// below throws before any run value exists. That matters for `G`: do_run() at
// cmd.c:1606 sets 3, the same value do_rush_<dir> sets, so this list cannot
// tell a `G` run from a ctrl-direction rush. Porting PREFIXCMD dispatch has to
// bring its own seam for `G`, or it will admit prefixed runs by accident.
const ADMITTED_RUN_MODES = Object.freeze([0, 1, 3]);

// A byte that cmd.c cmdbind_get() finds no command for reaches rhack()'s
// bad-command path, which this file owns. parse() returns such a byte
// unchanged except for the ones get_count() consumes first: every digit when
// num_pad is off, and the count key itself when it is on. Those start a count
// rather than a command, so they stay outside this boundary. ESC and the two
// empty-key values leave rhack() through its earlier return instead.
function unboundCommandKey(key, command, model) {
    if (command !== null) return false;
    // Escape is admitted separately: it never reaches the bad-command path,
    // because rhack() returns at its empty-key test before looking a command
    // up. The two empty-key values stay refused; C rings the bell for them
    // and nhbell() is not ported.
    if (!key || key === 0xFF || key === ESC) return false;
    return model.numPad
        ? key !== model.specialKeys.count
        : !isDigit(key);
}

// ADMITTED_COMMANDS above lists what this milestone dispatches; a one-square
// walk and a byte bound to no command join them here. Classify that first
// logical byte before get_count() can consume a prefix byte or expose
// transient count output.
async function readSimpleCommand(state) {
    await beginCommandParse(state);
    let key;
    try {
        key = await readCommandKey(state);
    } catch (error) {
        abortCommandParse(state);
        throw error;
    }
    const model = commandBindings(state);
    const command = commandForKey(model, key);
    const movement = MOVEMENT_INTENTS[command];
    // parse() answers Escape by clearing the message window and zeroing both
    // count fields, which finishCommandParse() already does, and rhack() then
    // returns without a message or a turn.
    const admitted = key === ESC
        || ADMITTED_COMMANDS.includes(command)
        || (movement && ADMITTED_RUN_MODES.includes(movement[2]))
        || unboundCommandKey(key, command, model);
    if (!admitted) {
        abortCommandParse(state);
        throw new UnsupportedHeroCommandBoundaryError(ADMITTED_BOUNDARY, key);
    }
    return finishCommandParse({ key, count: 0 }, state);
}

// C ref: cmd.c reset_cmd_vars(). Command queues and travel-map ownership stay
// with their future subsystems; this resets the state already owned here.
// context.pendingCommand is the JS retry owner rather than a C command
// variable, so this reset deliberately preserves it until rhack() either
// completes that command or reaches a non-retryable result.
export function resetCommandVars(state = game) {
    state.context ??= {};
    state.iflags ??= {};
    state.context.run = 0;
    state.context.nopick = 0;
    state.context.forcefight = 0;
    state.context.move = 0;
    state.context.mv = 0;
    state.context.travel = 0;
    state.context.travel1 = 0;
    state.domoveAttempting = 0;
    state.multi = 0;
    state.iflags.menu_requested = false;
}

// C ref: cmd.c set_move_cmd() and rhack()'s DOMOVE_WALK/DOMOVE_RUSH paths.
async function executeMovement(command, firstTime, state) {
    const [dx, dy, run] = MOVEMENT_INTENTS[command];

    // moveloop_core() optimistically sets context.move before rhack(), as C
    // does. This port's temporary hack.c admission seam must run before
    // movement intent is committed; otherwise the next loop mistakes the
    // rejected command for elapsed time.
    const newx = state.u.ux + dx;
    const newy = state.u.uy + dy;
    try {
        preflightDomoveDestination(newx, newy, state, run);
    } catch (error) {
        if (error instanceof UnsupportedHeroMoveBoundaryError)
            resetCommandVars(state);
        throw error;
    }

    state.u.dx = dx;
    state.u.dy = dy;
    state.u.dz = 0;
    state.context.travel = 0;
    state.context.travel1 = 0;
    state.context.run = run;
    state.domoveAttempting = run ? DOMOVE_RUSH : DOMOVE_WALK;
    state.context.move = 1;

    if (!run) {
        if (state.multi) state.context.mv = 1;
    } else {
        if (firstTime) {
            // Upstream uses max(COLNO, ROWNO) as the uncounted-run sentinel.
            // Explicit movement counts at or above COLNO intentionally share
            // its run-until-stopped treatment in moveloop_core().
            if (!state.multi) state.multi = COLNO;
            state.u.last_str_turn = 0;
        }
        state.context.mv = 1;
    }
    await domove(state);
    if (!run) state.context.forcefight = 0;
    state.iflags.menu_requested = false;
}

// pendingCommand owns either one rejected physical byte which has not entered
// cmd.c parsing, or the complete parsed state needed to retry a destination
// admission failure. Parser UI state and prefix flags are deliberately absent:
// neither kind of retry resumes inside get_count() or a prefix handler.
function captureParsedCommand(key, state) {
    return {
        phase: 'parsed',
        key,
        commandCount: state.commandCount,
        lastCommandCount: state.lastCommandCount,
        multi: state.multi,
    };
}

function restoreParsedCommand(pending, state) {
    state.cmdKey = pending.key;
    state.commandCount = pending.commandCount;
    state.lastCommandCount = pending.lastCommandCount;
    state.multi = pending.multi;
    return pending.key;
}

function rejectedPhysicalCommand(pending) {
    return new UnsupportedHeroCommandBoundaryError(
        ADMITTED_BOUNDARY,
        pending.key,
    );
}

// A command whose port is complete except for branches that are not, such as
// an object name doname() cannot format yet. Those throw their owner's error;
// converting it here keeps the segment's supported prefix and leaves the
// keystroke retryable, the same contract the admission seam provides.
async function failClosedCommand(key, state, run) {
    try {
        return await run();
    } catch (error) {
        if (error instanceof UnsupportedFeatureDescriptionError
            || error instanceof UnsupportedObjectNameError
            || error instanceof UnsupportedSpellDisplayError
            || error instanceof UnsupportedDiscoveryDisplayError
            || error instanceof UnsupportedEnlightenmentError
            || error instanceof UnsupportedShopError
            || error instanceof UnsupportedWeaponSkillError
            || error instanceof UnsupportedGetlinBoundaryError
            || error instanceof UnsupportedSearchError
            || error instanceof UnsupportedArtifactDisplayError) {
            resetCommandVars(state);
            throw new UnsupportedHeroCommandBoundaryError(
                `an unported branch of this command: ${error.message}`,
                key,
            );
        }
        throw error;
    }
}

// Six of the seven extcmdlist[] handlers this milestone owns follow, each
// reachable both from the key bound to it and from the extended-command
// prompt: ddoinv(), dovspell(), dodiscovered(), doattributes(), dolook() and
// dosearch(). The seventh is donull(), which doextcmd() and rhack() call
// directly because it formats nothing that can fail closed. The first five
// wrappers return whether the command took time, which its two callers turn
// into rhack()'s ECMD_TIME; dosearch() returns the ECMD_* result itself.
//
// Each wrapper routes its handler through failClosedCommand(), and what that
// preserves differs by caller. Reached from the single key bound to the
// command, nothing has painted and rhack() can replay that one byte. Reached
// from the '#' prompt, hooked_tty_getlin() has already painted the prompt,
// consumed every keystroke of the command name and cleared the top line, so
// replaying '#' alone would not reproduce them; there the boundary preserves
// the segment's matching prefix rather than the keystroke.

// C ref: invent.c ddoinv(). Every entry is formatted before the menu draws
// anything, so an unported object name or display branch stops before ddoinv()
// itself writes to the screen.
async function runInventoryCommand(key, state) {
    return failClosedCommand(key, state, () => ddoinv(state, {
        // invent.c display_pickinv() ends its menu with no prompt and asks
        // select_menu() for PICK_ONE; Escape answers null.
        menu: (items) => selectTtyMenu(state, {
            // add_menu_heading() draws a class heading with
            // iflags.menu_headings, which menuTitleStyle() reads.
            items: items.map((item) => (item.heading
                ? {
                    ...item,
                    attr: menuTitleStyle(state).titleAttr,
                    color: menuTitleStyle(state).titleColor,
                }
                : item)),
            how: PICK_ONE,
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        }),
    }));
}

// C ref: spell.c dovspell().
async function runShowspellsCommand(key, state) {
    return failClosedCommand(key, state, () => dovspell(state, {
        message: ttyPline,
        // spell.c dospellmenu() ends its menu with end_menu(prompt) and asks
        // select_menu() for PICK_ONE, or PICK_NONE when only one spell is
        // known; Escape answers null either way.
        menu: (items, how, prompt) => selectTtyMenu(state, {
            // add_menu_heading() draws the column heading with
            // iflags.menu_headings, and allmain.c hands the same style to
            // tty_end_menu()'s prompt line through adjust_menu_promptstyle().
            items: items.map((item) => (item.heading
                ? {
                    ...item,
                    attr: menuTitleStyle(state).titleAttr,
                    color: menuTitleStyle(state).titleColor,
                }
                : item)),
            how,
            title: prompt,
            ...menuTitleStyle(state),
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        }),
    }));
}

// C ref: o_init.c dodiscovered().
async function runKnownCommand(key, state) {
    return failClosedCommand(key, state, () => dodiscovered(state, {
        message: ttyPline,
        // o_init.c dodiscovered() writes its headings with
        // iflags.menu_headings, the same style the inventory menu's class
        // headings use.
        textWindow: (lines) => displayTtyTextWindow(
            state,
            lines.map((line) => (line.heading
                ? {
                    ...line,
                    attr: menuTitleStyle(state).titleAttr,
                    color: menuTitleStyle(state).titleColor,
                }
                : line)),
        ),
    }));
}

// C ref: insight.c doattributes().
async function runAttributesCommand(key, state) {
    return failClosedCommand(key, state, () => doattributes(state, {
        // insight.c enlightenment() ends its menu with end_menu(win, NULL), so
        // the window carries no prompt line, and asks select_menu() for
        // PICK_NONE; every line is an add_menu_str() entry with no selector or
        // highlight. Escape answers null.
        menu: (lines) => selectTtyMenu(state, {
            lines,
            how: PICK_NONE,
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        }),
    }));
}

// C ref: detect.c dosearch(). Unlike the five wrappers above, this one returns
// the ECMD_* result its handler produced, because cmd_safety_prevention() and
// the search itself already distinguish ECMD_OK from ECMD_TIME.
//
// extcmdlist[]'s "searching" occupation text would make rhack() call
// set_occupation() under a count. This boundary parses no count, so multi is 0
// and that call cannot happen; `wait`, the only other command carrying an
// occupation text, is admitted on the same terms.
async function runSearchCommand(key, state) {
    return failClosedCommand(key, state, () => dosearch(state));
}

// C ref: invent.c dolook().
async function runLookCommand(key, state) {
    return failClosedCommand(key, state, () => dolook(state, {
        message: ttyPline,
        readEngraving: () => read_engr_at(
            state.u.ux,
            state.u.uy,
            state,
            { pline: ttyPline, canReachFloor: can_reach_floor },
        ),
    }));
}

// C ref: cmd.c can_do_extcmd(). The Lua NHCB_CMD_BEFORE arm needs a callback
// registered by a level script, which no recorded game installs, and
// iflags.debug_fuzzer is never set. The extended-command prompt cannot reach
// the WIZMODECMD arm either, because extcmds_match() has already dropped every
// WIZMODECMD row for a hero who is not in debug mode; rhack()'s own
// can_do_extcmd() call, which this port does not make yet, is what reaches it.
async function can_do_extcmd(entry, state) {
    if (!state.wizard && (entry.flags & WIZMODECMD)) {
        await ttyPline(`Unavailable command '${entry.ef_txt}'.`, state);
        return false;
    }
    if (state.u?.uburied && !(entry.flags & IFBURIED)) {
        await ttyPline("You can't do that while you are buried!", state);
        return false;
    }
    return true;
}

// C ref: cmd.c doextcmd(). The do/while loop repeats only while the command
// reached is doextlist (#?), which stays unported, so one pass covers every
// dispatch this milestone can make.
async function doextcmd(key, state) {
    const idx = await tty_get_ext_cmd(state);
    if (idx < 0) return ECMD_OK; /* quit */

    const entry = extcmdlist[idx];
    if (!await can_do_extcmd(entry, state)) return ECMD_OK;
    if (state.iflags.menu_requested && !accept_menu_prefix(entry)) {
        const prefix = keyForCommand(commandBindings(state), 'reqmenu');
        await ttyPline(
            `'${visibleCommandKey(prefix)}' prefix has no effect for the `
            + `${entry.ef_txt} command.`,
            state,
        );
        state.iflags.menu_requested = false;
    }
    // ge.ext_tlist tells rhack() which row actually ran. It matters only for
    // the repeat queue and for rhack()'s PREFIXCMD and MOVEMENTCMD tests, and
    // no command below is either, so the substitution has nothing to change
    // yet. Porting '#movewest' or another MOVEMENTCMD row has to add it.
    switch (entry.ef_funct) {
    case 'doextcmd':
        // '#' names itself, so '##' opens a second prompt. C recurses through
        // `retval = (*func)()`; the do/while around it repeats only for
        // doextlist.
        return doextcmd(key, state);
    case 'donull':
        return await donull(state) ? ECMD_TIME : ECMD_OK;
    case 'dolook':
        return await runLookCommand(key, state) ? ECMD_TIME : ECMD_OK;
    case 'doattributes':
        return await runAttributesCommand(key, state) ? ECMD_TIME : ECMD_OK;
    case 'ddoinv':
        return await runInventoryCommand(key, state) ? ECMD_TIME : ECMD_OK;
    case 'dovspell':
        return await runShowspellsCommand(key, state) ? ECMD_TIME : ECMD_OK;
    case 'dodiscovered':
        return await runKnownCommand(key, state) ? ECMD_TIME : ECMD_OK;
    case 'dosearch':
        return await runSearchCommand(key, state);
    default:
        resetCommandVars(state);
        throw new UnsupportedHeroCommandBoundaryError(
            `the extended command '${entry.ef_txt}' is not ported`,
            key,
        );
    }
}

// C ref: cmd.c rhack(). Only the source handlers owned by this milestone are
// dispatched here. A fresh excluded physical byte stops retryably before
// parsing or an unknown-command diagnostic. A supplied nonzero key (normally
// cmdKey during a repeat) is already logical input and retains the diagnostic
// behavior until that handler is ported. key === 0 normally reads a fresh
// command, except that pendingCommand restores its physical or parsed retry
// phase first. rhack() has no command-result return; context.move reports
// whether the command took time.
export async function rhack(key, state = game) {
    state.iflags ??= {};
    state.context ??= {};
    // C resets both prefix effects at every rhack() entry, including repeats.
    state.iflags.menu_requested = false;
    state.context.nopick = 0;

    const firstTime = key === 0;
    let newLogicalCommand = !firstTime;
    let retryableBoundary = false;
    try {
        if (firstTime) {
            const pending = state.context.pendingCommand;
            if (pending?.phase === 'physical') {
                resetCommandVars(state);
                throw rejectedPhysicalCommand(pending);
            }
            if (pending) {
                key = restoreParsedCommand(pending, state);
            } else {
                try {
                    key = await readSimpleCommand(state);
                } catch (error) {
                    if (error instanceof UnsupportedHeroCommandBoundaryError) {
                        resetCommandVars(state);
                        state.context.pendingCommand = {
                            phase: 'physical',
                            key: error.key,
                        };
                    }
                    throw error;
                }
                state.context.pendingCommand =
                    captureParsedCommand(key, state);
                newLogicalCommand = true;
            }
        }

        // Count one dispatch per logical parsed command. A retained parsed
        // command has already been dispatched even when destination admission
        // rejects more than once before it can complete.
        if (newLogicalCommand) {
            state._commandDispatchCount =
                (state._commandDispatchCount ?? 0) + 1;
        }

        if (!key || key === 0xFF || key === ESC) {
            resetCommandVars(state);
            return;
        }

        let command = commandForKey(commandBindings(state), key);
        if (command === 'reqmenu') {
            state.iflags.menu_requested = true;
            // do_reqmenu() is a PREFIXCMD, so rhack() immediately reads and
            // dispatches the following command in the same input cycle.
            key = await parseCommand(state);
            if (firstTime) {
                state.context.pendingCommand =
                    captureParsedCommand(key, state);
            }
            command = commandForKey(commandBindings(state), key);
            if (command === 'reqmenu') {
                const prefix = keyForCommand(commandBindings(state), 'reqmenu');
                await ttyNorep(
                    `Double ${visibleCommandKey(prefix)} prefix, canceled.`,
                    state,
                );
                resetCommandVars(state);
                return;
            }
        }
        if (command === 'wait') {
            if (!await donull(state)) resetCommandVars(state);
            return;
        }
        if (command === '#') {
            // C ref: rhack()'s result handling, applied to what doextcmd()
            // returns from the command the player named. ECMD_TIME skips
            // reset_cmd_vars() and puts context.move back to TRUE; ECMD_OK,
            // ECMD_CANCEL and ECMD_FAIL all reset.
            const res = await failClosedCommand(
                key, state, () => doextcmd(key, state),
            );
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state);
            if (res & ECMD_TIME) state.context.move = 1;
            return;
        }
        if (command === 'search') {
            // C ref: rhack()'s result handling, the same three tests the '#'
            // arm above applies. dosearch() answers ECMD_TIME for a search
            // that ran and ECMD_OK when cmd_safety_prevention() stopped it.
            const res = await runSearchCommand(key, state);
            if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state);
            if (res & ECMD_TIME) state.context.move = 1;
            return;
        }
        if (command === 'inventory') {
            const elapsed = await runInventoryCommand(key, state);
            resetCommandVars(state);
            if (elapsed) state.context.move = 1;
            return;
        }
        if (command === 'showspells') {
            const elapsed = await runShowspellsCommand(key, state);
            resetCommandVars(state);
            if (elapsed) state.context.move = 1;
            return;
        }
        if (command === 'known') {
            const elapsed = await runKnownCommand(key, state);
            resetCommandVars(state);
            if (elapsed) state.context.move = 1;
            return;
        }
        if (command === 'attributes') {
            const elapsed = await runAttributesCommand(key, state);
            resetCommandVars(state);
            if (elapsed) state.context.move = 1;
            return;
        }
        if (command === 'look') {
            const elapsed = await runLookCommand(key, state);
            // C ref: rhack()'s result handling. dolook() returns ECMD_OK for
            // a sighted hero, which reaches reset_cmd_vars(); only ECMD_TIME
            // puts context.move back to TRUE.
            resetCommandVars(state);
            if (elapsed) state.context.move = 1;
            return;
        }
        if (Object.hasOwn(MOVEMENT_INTENTS, command)) {
            await executeMovement(command, firstTime, state);
            return;
        }
        if (command !== null) {
            // A bound command whose handler this milestone excludes. The
            // fresh-read seam above rejects it before parsing; reaching here
            // means a repeat supplied it as logical input.
            resetCommandVars(state);
            throw new UnsupportedHeroCommandBoundaryError(
                ADMITTED_BOUNDARY,
                key,
            );
        }

        // C ref: cmd.c rhack()'s bad-command path. Its custompline() differs
        // from pline() only in SUPPRESS_HISTORY, which keeps the line out of
        // the message history that doprev_message() recalls; no message
        // history is ported. Its cmdq_clear(CQ_CANNED) and
        // cmdq_clear(CQ_REPEAT) have no queue to clear while no command queue
        // is ported, and iflags.sanity_no_check suppresses only the debug
        // sanity check.
        await ttyPline(`Unknown command '${visibleCommandKey(key)}'.`, state);
        state.context.move = 0;
        state.multi = 0;
    } catch (error) {
        retryableBoundary =
            error instanceof UnsupportedHeroMoveBoundaryError
            || error instanceof UnsupportedHeroCommandBoundaryError;
        throw error;
    } finally {
        if (firstTime && !retryableBoundary)
            delete state.context.pendingCommand;
    }
}
