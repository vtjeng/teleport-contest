// cmd.js -- Command parsing, dispatch, and movement intent.
// C refs: cmd.c get_count(), parse(), rhack(), set_move_cmd(); hack.c domove().

import {
    commandForKey,
    createCommandBindingModel,
    keyForCommand,
    visibleCommandKey,
} from './command_bindings.js';
import {
    COLNO,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    HALLUC,
    HALLUC_RES,
    IS_WALL,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    SICK,
    SLIMED,
    STONE,
    STONED,
    STRANGLED,
    isok,
} from './const.js';
import { flush_screen, newsym } from './display.js';
import { game } from './gstate.js';
import { nhgetch } from './input.js';
import { is_hider, noattacks } from './mondata.js';
import { m_at } from './monst.js';
import { onscary } from './monmove.js';
import { in_out_region } from './region.js';
import { canSpotMonster } from './startup_a11y.js';
import {
    clearTtyMessageWindow,
    ttyNorep,
    ttyPline,
} from './tty_message.js';
import { vision_recalc } from './vision.js';

export const MAX_COMMAND_COUNT = 32767;
const ESC = 0x1B;
const BACKSPACE = 0x08;
const DELETE = 0x7F;
const DOMOVE_WALK = 0x01;
const DOMOVE_RUSH = 0x02;

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

function propertyIntrinsic(state, property) {
    return Boolean(state.u?.uprops?.[property]?.intrinsic);
}

function heroHallucinating(state) {
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return propertyIntrinsic(state, HALLUC)
        && !Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: hack.c monster_nearby(). This deliberately has stricter concealment,
// disposition, helplessness, and scare checks than canspotmon().
export function monsterNearby(state = game) {
    const { ux, uy } = state.u;
    const hallucinating = heroHallucinating(state);
    for (let x = ux - 1; x <= ux + 1; ++x) {
        for (let y = uy - 1; y <= uy + 1; ++y) {
            if (!isok(x, y) || (x === ux && y === uy)) continue;
            const monster = m_at(x, y, state);
            if (!monster) continue;
            const appearance = (monster.m_ap_type ?? 0) & M_AP_TYPMASK;
            if (appearance === M_AP_FURNITURE
                || appearance === M_AP_OBJECT) {
                continue;
            }
            if (!hallucinating
                && (monster.mpeaceful || noattacks(monster.data))) {
                continue;
            }
            if (is_hider(monster.data) && monster.mundetected) continue;
            if (monster.msleeping || !monster.mcanmove) continue;
            if (onscary(ux, uy, monster, state)) continue;
            if (canSpotMonster(monster, state)) return true;
        }
    }
    return false;
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

// C ref: cmd.c parse(). Reads one logical command, stores its parsed count in
// commandCount/lastCommandCount, remaining repeats in multi, and its command
// byte in cmdKey. It restores parse/input state, clears the physical TTY
// message row, and returns cmdKey.
export async function parseCommand(state = game) {
    state.iflags ??= {};
    state.program_state ??= {};
    state.context ??= {};
    state.commandCount = 0;
    state.context.move = 1;
    await flush_screen(1);

    state.iflags.in_parse = true;
    state.program_state.input_state = 'command';
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
        state.context.move = 0;
        state.iflags.in_parse = false;
        state.program_state.input_state = 'other';
        throw error;
    }

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

// C ref: cmd.c reset_cmd_vars(). Command queues and travel-map ownership stay
// with their future subsystems; this resets the state already owned here.
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

// C ref: hack.c end_running(TRUE). The current finite-movement caller always
// requests travel cancellation, so this helper clears travel, travel1, and mv.
// Status refresh and travel-map cleanup remain with their owning subsystems.
export function endRunning(state = game) {
    state.context.run = 0;
    state.context.travel = 0;
    state.context.travel1 = 0;
    state.context.mv = 0;
    if (state.multi > 0) state.multi = 0;
}

function blocksMove(x, y, state) {
    const loc = state.level?.at(x, y);
    if (!loc || loc.typ === STONE || IS_WALL(loc.typ)) return true;
    return loc.typ === DOOR && (loc.doormask & (D_CLOSED | D_LOCKED));
}

// C ref: hack.c domove(). This remains the narrow ordinary-floor subset; the
// movement milestone will replace its collision and terrain branches in source
// order without changing the command intent established by executeMovement().
// It requires established u.dx/u.dy and context.move = 1. Success updates the
// position and leaves that turn flag untouched; a blocked step sets it to 0
// and cancels multi, context.mv, and context.run. moveloop_core() calls this
// directly only for already-established movement intent. Like hack.c, a
// changed hero position sets u.umoved for the subsequent turn effects.
export async function domove(state = game) {
    const u = state.u;
    const newx = u.ux + u.dx;
    const newy = u.uy + u.dy;

    if (blocksMove(newx, newy, state)) {
        state.context.move = 0;
        state.multi = 0;
        state.context.mv = 0;
        state.context.run = 0;
        state.domoveAttempting = 0;
        return;
    }

    const oldx = u.ux;
    const oldy = u.uy;
    if (!await in_out_region(newx, newy, { state })) return;
    u.ux0 = oldx;
    u.uy0 = oldy;
    u.ux = newx;
    u.uy = newy;
    u.umoved = true;

    newsym(oldx, oldy);
    vision_recalc(1);
    newsym(newx, newy);
    state.domoveAttempting = 0;
}

// C ref: cmd.c set_move_cmd() and rhack()'s DOMOVE_WALK/DOMOVE_RUSH paths.
async function executeMovement(command, firstTime, state) {
    const [dx, dy, run] = MOVEMENT_INTENTS[command];
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

// C ref: cmd.c rhack(). Only the source handlers owned by this milestone are
// dispatched here; later command families retain the existing unknown-command
// behavior until their complete handlers are ported. key === 0 reads and
// parses a fresh command; any nonzero key is supplied command input (normally
// cmdKey during a repeat) and dispatches without another read. rhack() has no
// command-result return; context.move reports whether the command took time.
export async function rhack(key, state = game) {
    state.iflags ??= {};
    state.context ??= {};
    // C resets both prefix effects at every rhack() entry, including repeats.
    state.iflags.menu_requested = false;
    state.context.nopick = 0;

    const firstTime = key === 0;
    if (firstTime) key = await parseCommand(state);

    // A command is dispatched only after its input wait returns. Keep this
    // diagnostic independent of turn consumption so the first-command gate can
    // distinguish a blocked or zero-time command from an untouched prompt.
    state._commandDispatchCount = (state._commandDispatchCount ?? 0) + 1;

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
    if (Object.hasOwn(MOVEMENT_INTENTS, command)) {
        await executeMovement(command, firstTime, state);
        return;
    }

    await ttyPline(`Unknown command '${visibleCommandKey(key)}'.`, state);
    state.context.move = 0;
    state.multi = 0;
}
