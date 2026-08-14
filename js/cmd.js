// cmd.js -- Command parsing, dispatch, and movement intent.
// C refs: cmd.c get_count(), parse(), rhack(), set_move_cmd().

import {
    commandForKey,
    createCommandBindingModel,
    keyForCommand,
    visibleCommandKey,
} from './command_bindings.js';
import {
    CMDQ_EXTCMD,
    CMDQ_KEY,
    COLNO,
    CQ_CANNED,
    DIR_ERR,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    MV_ANY,
    MV_RUN,
    MV_RUSH,
    MV_WALK,
    N_DIRS,
    N_DIRS_Z,
    Never_mind,
    PICK_NONE,
    PICK_ONE,
    PLNMSG_UNKNOWN,
    QBUFSZ,
    SICK,
    SLIMED,
    STONED,
    STRANGLED,
    isok,
    quitchars,
    xdir,
    ydir,
    zdir,
} from './const.js';
import { doapply, reset_trapset, UnsupportedApplyError } from './apply.js';
import { UnsupportedArtifactDisplayError } from './artifacts.js';
import { dosearch, UnsupportedSearchError } from './detect.js';
import {
    bot,
    flush_screen,
    UnsupportedGlyphRepairError,
    UnsupportedMapMemoryError,
    UnsupportedTransientDisplayError,
} from './display.js';
import {
    dodown,
    dodrop,
    UnsupportedDropError,
    UnsupportedLevelChangeError,
} from './do.js';
import {
    dotakeoff, dowear, reset_remarm, UnsupportedTakeOffError,
    UnsupportedWearError,
} from './do_wear.js';
import { reset_pick, UnsupportedLockError } from './lock.js';
import { UnsupportedMonsterCreationError } from './makemon_create.js';
import { UnsupportedRegionPlacementError } from './mkmaze.js';
import { UnsupportedObjectOperationError } from './obj.js';
import { UnsupportedPickupError } from './pickup.js';
import { UnsupportedPositionCheckError } from './teleport.js';
import { UnsupportedHeroTimeoutBoundaryError } from './timeout.js';
import {
    doeat,
    UnsupportedEatError,
    UnsupportedHungerTransitionError,
} from './eat.js';
import { can_reach_floor, read_engr_at } from './engrave.js';
import {
    AUTOCOMPLETE,
    CMD_M_PREFIX,
    CMD_gGF_PREFIX,
    CMD_NOT_AVAILABLE,
    ECM_EXACTMATCH,
    ECM_IGNOREAC,
    ECM_NO1CHARCMD,
    IFBURIED,
    INTERNALCMD,
    PREFIXCMD,
    WIZMODECMD,
    extcmdlist,
} from './extcmdlist_data.js';
import {
    UnsupportedGetlinBoundaryError,
    tty_get_ext_cmd,
    tty_yn_function,
} from './getline.js';
import { game } from './gstate.js';
import { lcase, visctrl } from './hacklib.js';
import {
    ddoinv,
    dolook,
    UnsupportedFeatureDescriptionError,
    UnsupportedObjectPromptError,
} from './invent.js';
import { doattributes, UnsupportedEnlightenmentError } from './insight.js';
import { dodiscovered, UnsupportedDiscoveryDisplayError } from './o_init.js';
import { UnsupportedObjectNameError } from './objnam.js';
import { doset_simple, UnsupportedOptionMenuError } from './options.js';
import { dopray, UnsupportedPrayerError } from './pray.js';
import { UnsupportedHideError } from './mon.js';
import { UnsupportedShopError } from './shk.js';
import { dofire, dothrow, UnsupportedThrowError } from './dothrow.js';
import { dosit, UnsupportedSitError } from './sit.js';
import {
    clear_kickedloc,
    dokick,
    UnsupportedKickError,
} from './dokick.js';
import { dovspell, UnsupportedSpellDisplayError } from './spell.js';
import {
    UnsupportedWeaponSkillError,
    enhance_weapon_skill,
} from './weapon.js';
import {
    displayTtyTextWindow, menuTitleStyle,
} from './tty_menu.js';
import { select_menu } from './windows.js';
import {
    domove,
    dopickup,
    monsterNearby,
    preflightDomoveDestination,
    u_maybe_impaired,
    NODIAG,
    UnsupportedHeroMoveBoundaryError,
} from './hack.js';
import { nhgetch } from './input.js';
import { doride, UnsupportedSteedError } from './steed.js';
import { UnsupportedHitPointLossError } from './hack.js';
import { UnsupportedAbilityChangeError } from './attrib.js';
import { UnsupportedExperienceChangeError } from './exper.js';
import { wiz_level_change, wiz_level_tele, wiz_wish } from './wizcmds.js';
import {
    dozap,
    UnsupportedBhitError,
    UnsupportedWishError,
    UnsupportedZapError,
} from './zap.js';
import {
    doswapweapon,
    dotwoweapon,
    UnsupportedTwoWeaponError,
    UnsupportedWieldError,
} from './wield.js';
import { dotalk, UnsupportedChatError } from './sounds.js';
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
export class UnsupportedHeroCommandBoundaryError extends Error {
    constructor(reason, key) {
        super(`unsupported hero command: ${reason}`);
        this.name = 'UnsupportedHeroCommandBoundaryError';
        this.reason = reason;
        this.key = key;
    }
}

// A cmd.c getdir() or yn_function() path this port has not reached yet. Most
// of these are raised after the prompt has painted and the answering key has
// been read, so the segment keeps its matching prefix rather than the
// keystroke; yn_function()'s two guards fire before anything paints.
export class UnsupportedDirectionBoundaryError extends Error {
    constructor(reason) {
        super(`unsupported direction prompt: ${reason}`);
        this.name = 'UnsupportedDirectionBoundaryError';
        this.reason = reason;
    }
}

// Each value is [u.dx, u.dy, context.run]: 0 walks, 1 runs, and 3 rushes.
// Preserve these source numeric modes; downstream code groups them by
// truthiness only where cmd.c does.
export const MOVEMENT_INTENTS = Object.freeze({
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

// C ref: cmd.c set_occupation() (205-217). Installs the callback that
// allmain.c moveloop_core() runs once a turn until it answers 0, together with
// the text stop_occupation() puts into "You stop <occtxt>."
//
// go.occupation, go.occtxt and go.occtime live on state.go, the port's home for
// decl.c's `go` globals. C never writes them to a save file, so nothing carries
// them between segments either: an occupation lasts one segment at most.
//
// This module is part of an import cycle with js/eat.js, which calls this. The
// callback therefore arrives as an argument and is never read from a module
// scope that could still be initializing.
export function set_occupation(fn, txt, xtime, state = game) {
    if (xtime) {
        // cmd.c timed_occupation() counts gm.multi down instead of letting the
        // callback decide when it is finished. Its one caller is doextcmd()'s
        // `if (tlist->f_text && !go.occupation && gm.multi)` at cmd.c:3728,
        // which needs a count typed before an extended command. This port's
        // command boundary parses no such count, so runSearchCommand() below
        // already records that multi is 0 whenever an occupation text exists.
        throw new Error('set_occupation() with a timeout is unreachable');
    }
    state.go ??= {};
    state.go.occupation = fn;
    state.go.occtxt = txt;
    state.go.occtime = 0;
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

// C ref: cmd.c readchar(), which is readchar_core() with the mouse-position
// outputs discarded. The window port supplies physical bytes; this composes
// ESC+byte for altmeta and resets input_state after the completed logical read.
// The debug fuzzer, the do-again buffer and the readchar queue are all
// unported, and none of them is reachable in a recorded game.
export async function readchar(state) {
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

// C ref: cmd.c key2txt(). The four named keys are spelled out; everything else
// goes through visctrl().
export function key2txt(c) {
    const byte = c & 0xFF;
    if (byte === 0x20) return '<space>';
    if (byte === 0x1B) return '<esc>';
    if (byte === 0x0A) return '<enter>';
    if (byte === 0x7F) return '<del>';
    return visctrl(byte);
}

// C ref: cmd.c yn_menuable_resp(). The C test compares `resp` against five
// specific string literals by address. Two of them, ynchars and ynqchars, are
// exactly what paranoid_ynq() passes, so the address test succeeds and the
// answer is iflags.query_menu; getdir()'s null `resp` matches none of the
// five and answers FALSE on the address comparisons alone. C also requires
// iflags.window_inited, which is true from tty_init_nhwindows() onward and so
// on every path that can reach a prompt at all.
function yn_menuable_resp(resp, state) {
    return resp !== null && Boolean(state.iflags?.query_menu);
}

// C ref: cmd.c yn_function() (5471-5578). Both queue arms sit behind
// `addcmdq`, which the refusal below still rejects, so neither the
// cmdq_pop() at 5496 nor the cmdq_add_key(CQ_REPEAT) at 5543 can run.
// getdir() is the port's other caller and passes addcmdq FALSE, exactly as C
// does at 3989. iflags.debug_fuzzer is never set, leaving the window port's
// tty_yn_function() as the only reader.
//
// The `resp && *resp && res && !strchr(resp, res)` repair at 5567 has no work
// to do for either caller. A null `resp` fails its first test. For a restricted
// set, tty_yn_function() returns only a character of `resp` or `def`, and both
// ported callers pass a `def` that is in their set, so the paniclog() and
// impossible() inside it stay unreachable.
export async function yn_function(query, resp, def, addcmdq, state = game) {
    state.iflags ??= {};
    // "most recent pline is clobbered". Nothing in the port reads last_msg
    // back yet; js/invent.js is its other writer.
    state.iflags.last_msg = PLNMSG_UNKNOWN;

    if (query.length >= QBUFSZ) {
        // cmd.c:5486-5491 calls paniclog() and then truncates the query to
        // QBUFSZ-4 characters plus "...". paniclog() writes a file, which game
        // code may not do, and no ported caller passes a query anywhere near
        // this long, so the port stops instead of guessing at the log.
        throw new UnsupportedDirectionBoundaryError(
            `a query of ${query.length} characters needs paniclog()`,
        );
    }
    if (yn_menuable_resp(resp, state)) {
        throw new UnsupportedDirectionBoundaryError('yn_function_menu()');
    }
    const res = await tty_yn_function(query, resp, def, state);
    if (addcmdq) {
        throw new UnsupportedDirectionBoundaryError(
            'cmdq_add_key(CQ_REPEAT) has no CQ_REPEAT queue',
        );
    }
    // "in case we're called via getdir() which sets input_state".
    state.program_state.input_state = 'other';
    return res;
}

// C ref: hack.h:1329 y_n(), over decl.c ynchars[]. Its one ported caller,
// steed.c doride()'s debug-mode question, still stops: y_n() passes
// addcmdq TRUE and yn_function() refuses that above.
const ynchars = 'yn';
export async function y_n(query, state = game) {
    return yn_function(query, ynchars, 'n', true, state);
}

// C ref: cmd.c paranoid_ynq() (5587-5650). "for paranoid_confirm:quit,die,
// attack,&c prompting; allows yes, n|no, or q|quit; result is one of 'y' or
// 'n' or 'q'; ESC yields 'q'".
//
// `be_paranoid` is ParanoidConfirm at every call site, not the caller's own
// paranoia bit: the caller tests its own bit before asking at all. C's
// PARANOID_CONFIRM arm reads a whole line through getlin() and reprompts with
// "\"Yes\" or \"No\": " up to five times, which is a different prompt, a
// different reader and a different history entry from the single-key arm; it
// stops rather than being approximated.
//
// C's `char c` is a key byte here, which is what yn_function() answers and
// what readchar() below it produces, so the comparisons are against codes.
//
// accept_q has no caller: paranoid_query() below is the port's only entry and
// passes FALSE, so the ynqchars arm and the `!accept_q` half of the fold are
// carried for the shape of the C function rather than for a path a game
// reaches.
const KEY_N = 'n'.charCodeAt(0);
const KEY_Q = 'q'.charCodeAt(0);
const KEY_Y = 'y'.charCodeAt(0);
const ynqchars = 'ynq';
async function paranoid_ynq(be_paranoid, prompt, accept_q, state = game) {
    let c = KEY_N; /* default result */

    if (be_paranoid) {
        throw new UnsupportedGetlinBoundaryError(
            'paranoid_ynq() reading "yes" or "no" under paranoid_confirm',
        );
    } else if (accept_q) {
        /* 'y', 'n', or 'q' */
        c = await yn_function(prompt, ynqchars, 'n', false, state);
    } else {
        /* 'y' or 'n' */
        c = await yn_function(prompt, ynchars, 'n', false, state);
    }
    if (c !== KEY_Y && (c !== KEY_Q || !accept_q)) c = KEY_N;
    return c;
}

// C ref: cmd.c paranoid_query() (5652-5657). "result is True for yes; n|no and
// ESC yield False".
export async function paranoid_query(be_paranoid, prompt, state = game) {
    return await paranoid_ynq(be_paranoid, prompt, false, state) === KEY_Y;
}

// C ref: cmd.c move_funcs[N_DIRS_Z][N_MOVEMODES] (2070-2082), named by the
// extcmdlist[] handler each slot holds rather than by a function pointer.
// Rows are xdir[]/ydir[]/zdir[] indexes; columns are MV_WALK, MV_RUN, MV_RUSH.
// The down and up rows repeat one handler across all three columns, which is
// why '>' and '<' answer a direction here even though rhack() rejects them
// after a run or rush prefix.
const MOVE_FUNCS = Object.freeze([
    ['do_move_west', 'do_run_west', 'do_rush_west'],
    ['do_move_northwest', 'do_run_northwest', 'do_rush_northwest'],
    ['do_move_north', 'do_run_north', 'do_rush_north'],
    ['do_move_northeast', 'do_run_northeast', 'do_rush_northeast'],
    ['do_move_east', 'do_run_east', 'do_rush_east'],
    ['do_move_southeast', 'do_run_southeast', 'do_rush_southeast'],
    ['do_move_south', 'do_run_south', 'do_rush_south'],
    ['do_move_southwest', 'do_run_southwest', 'do_rush_southwest'],
    ['dodown', 'dodown', 'dodown'],
    ['doup', 'doup', 'doup'],
].map((row) => Object.freeze(row)));

const HANDLER_BY_COMMAND_NAME = new Map(
    extcmdlist.map((entry) => [entry.ef_txt, entry.ef_funct]),
);

// C ref: the `bind->cmd->ef_funct` that cmd.c cmdbind_get() yields. The port's
// binding model stores extcmdlist[]'s ef_txt, and C compares handlers rather
// than names, so resolve the name back to its handler before comparing.
function boundHandler(model, key) {
    const command = commandForKey(model, key & 0xFF);
    return command === null
        ? null
        : (HANDLER_BY_COMMAND_NAME.get(command) ?? null);
}

// C ref: cmd.c movecmd(). Sets u.dx, u.dy and u.dz from the direction the key
// is bound to and returns 1 only for a horizontal one, so '>' and '<' return 0
// with u.dz set. A key bound to no movement command leaves u.dx and u.dy
// untouched and only clears u.dz, so the direction the hero last gave survives
// a cancelled or invalid prompt; steed.c landing_spot() reads that survivor
// back through xytodir(u.dx, u.dy) on a later dismount.
export function movecmd(sym, mode, state = game) {
    let d = DIR_ERR;
    const fnc = boundHandler(commandBindings(state), sym);
    if (fnc) {
        if (mode === MV_ANY) {
            for (d = N_DIRS_Z - 1; d > DIR_ERR; d--)
                if (fnc === MOVE_FUNCS[d][MV_WALK]
                    || fnc === MOVE_FUNCS[d][MV_RUN]
                    || fnc === MOVE_FUNCS[d][MV_RUSH])
                    break;
        } else {
            for (d = N_DIRS_Z - 1; d > DIR_ERR; d--)
                if (fnc === MOVE_FUNCS[d][mode])
                    break;
        }
    }

    if (d !== DIR_ERR) {
        state.u.dx = xdir[d];
        state.u.dy = ydir[d];
        state.u.dz = zdir[d];
        return state.u.dz ? 0 : 1;
    }
    state.u.dz = 0;
    return 0;
}

// C ref: cmd.c xytodir() (3846-3856). Converts a unit offset into an index
// into xdir[]/ydir[], or DIR_ERR when no compass direction matches.
export function xytodir(x, y) {
    for (let dd = 0; dd < N_DIRS; dd++)
        if (x === xdir[dd] && y === ydir[dd]) return dd;
    return DIR_ERR;
}

// C ref: cmd.c dirtocoord() (3858-3866). The inverse. C writes through a coord
// pointer and leaves it untouched for an out-of-range code; this returns null
// there so a caller cannot mistake a stale coordinate for a fresh one.
export function dirtocoord(dd) {
    if (dd > DIR_ERR && dd < N_DIRS_Z) return { x: xdir[dd], y: ydir[dd] };
    return null;
}

// C ref: cmd.c dxdy_moveok(). Grid bug handling: a diagonal is zeroed rather
// than refused, so the caller sees no direction at all.
export function dxdy_moveok(state = game) {
    const u = state.u;
    if (u.dx && u.dy && NODIAG(u.umonnum)) {
        u.dx = 0;
        u.dy = 0;
    }
    return (u.dx || u.dy) ? 1 : 0;
}

// C ref: cmd.c redraw_cmd().
export function redraw_cmd(c, state = game) {
    return boundHandler(commandBindings(state), c) === 'doredraw';
}

// C ref: cmd.c confdir(). The impaired arm draws rn2(kmax) and rewrites the
// direction. Nothing the port admits can stun or confuse the hero -- the
// closed-door seam in js/hack.js refuses both properties for the same reason
// -- so it stops here rather than guess at a draw no recorded case can check.
export function confdir(force_impairment, state = game) {
    if (force_impairment || u_maybe_impaired(state)) {
        throw new UnsupportedDirectionBoundaryError(
            'an impaired hero rerolls the direction',
        );
    }
}

// C ref: cmd.c get_adjacent_loc() (3929-3953), translated whole. getdir()
// supplies the direction; this turns it into a square and checks it. Callers
// pass <u.ux, u.uy> as the origin, so `cc` names one of the eight neighbours,
// or the hero's own square when the answer set u.dz instead of u.dx/u.dy.
//
// The `emsg` refusal needs an origin on the map's edge: isok() admits
// x 1..COLNO-1 and y 0..ROWNO-1, and lock.c pick_lock(), its only ported
// caller, starts from a hero who is standing on room floor or a corridor.
export async function get_adjacent_loc(prompt, emsg, x, y, cc, state = game) {
    const u = state.u;
    if (!await getdir(prompt, state)) {
        await ttyPline(Never_mind, state);
        return 0;
    }
    const new_x = x + u.dx;
    const new_y = y + u.dy;
    if (cc && isok(new_x, new_y)) {
        cc.x = new_x;
        cc.y = new_y;
    } else {
        if (emsg) await ttyPline(emsg, state);
        return 0;
    }
    return 1;
}

// C ref: cmd.c getdir() (3958-4098). Returns 1 when u.dx/u.dy/u.dz name a
// direction and 0 otherwise, exactly as C does.
//
// Four inputs stop here. The simulated-mouse key needs getpos(); '^R' needs
// docrt_flags() and the retry loop above got_dirsym; an invalid direction key
// reaches help_dir(), which builds an NHW_TEXT window whenever cmdassist is
// set, which it is by default; and confdir() stops for an impaired hero.
//
// Two of C's own inputs cannot arrive at all: gi.in_doagain and
// readchar_queue are always empty, and iflags.debug_fuzzer is never set.
export async function getdir(s, state = game) {
    const u = state.u;
    // C ref: getdir():3962-3981. A queued direction answers the prompt and
    // jumps to got_dirsym, skipping the prompt itself, the message-window
    // clear and the CQ_REPEAT record below. Nothing ported pushes a CMDQ_DIR
    // or CMDQ_KEY node -- dothrow.c dofire()'s swap-and-retry arm pushes two
    // extended commands and rhack() has consumed both by the time throw_obj()
    // asks for a direction -- so any node found here is one this port cannot
    // answer, and C's own impossible() arm is the shape of the refusal.
    const queued = cmdq_pop(state);
    if (queued) {
        cmdq_clear(CQ_CANNED, state);
        throw new UnsupportedDirectionBoundaryError(
            'the direction prompt has a queued answer',
        );
    }
    // retry: -- only the '^R' arm jumps back here, and it is refused below.
    state.program_state.input_state = 'getdir';
    const dirsym = await yn_function(
        (s && s[0] !== '^') ? s : 'In what direction?',
        null,
        '\0',
        false,
        state,
    );
    // "remove the prompt string so caller won't have to"
    clearTtyMessageWindow(state);

    if (redraw_cmd(dirsym, state)) {
        throw new UnsupportedDirectionBoundaryError(
            "'^R' repaints the screen and reissues the direction prompt",
        );
    }
    // cmdq_add_key(CQ_REPEAT, dirsym): no CQ_REPEAT queue is ported.

    const spkeys = commandBindings(state).specialKeys;
    // cmd.c:4021-4090 tests NHKF_GETDIR_SELF first and evaluates movecmd()
    // only in the final `else if`, so the self arm writes <0,0,0> and returns
    // it without movecmd() ever running.
    if (dirsym === spkeys['getdir.self']
        || dirsym === spkeys['getdir.self2']) {
        u.dx = 0;
        u.dy = 0;
        u.dz = 0;
    } else if (dirsym === spkeys['getdir.mouse']) {
        throw new UnsupportedDirectionBoundaryError(
            'a simulated mouse click answers the direction prompt',
        );
    } else {
        const is_mov = movecmd(dirsym, MV_ANY, state);
        if (!is_mov && !u.dz) {
            if (!quitchars.includes(String.fromCharCode(dirsym))) {
                const help_requested = dirsym === spkeys['getdir.help'];
                if (help_requested || state.iflags.cmdassist) {
                    // help_dir()'s `!viawindow` early return is inside an
                    // `#if 0` block, so with cmdassist set it always opens a
                    // window and always answers TRUE.
                    throw new UnsupportedDirectionBoundaryError(
                        'help_dir() opens the direction-key window',
                    );
                }
                // did_help stayed FALSE, which only !cmdassist can reach.
                await ttyPline('What a strange direction!', state);
            }
            return 0;
        }
        if (is_mov && !dxdy_moveok(state)) {
            await ttyPline(
                "You can't orient yourself that direction.",
                state,
            );
            return 0;
        }
    }
    if (!u.dz) confdir(false, state);
    return 1;
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
            key = await readchar(state);
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
            const key = await readchar(state);
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

// Every command this seam dispatches from the key bound to it, named once so
// the comment above readSimpleCommand(), both boundary messages, and the
// admission test cannot drift apart as more commands land. '#' opens the
// extended-command prompt, through which every other name in the list is also
// reachable; every other extended command stops inside doextcmd() instead,
// after the prompt has painted the frames the reference program painted for
// the same keystrokes.
//
// 'fight' and 'reqmenu' are the two PREFIXCMD rows this seam admits. Each
// modifies the command typed after it, which rhack() reads without consulting
// this list; a prefixed command the port does not own stops at its own arm
// below, exactly as the same key does unprefixed.
//
// doextcmd() dispatches three commands that are deliberately absent here:
// '#ride', whose own key is M-R (cmd.c:1833); '#twoweapon', whose own key is
// 'X' (cmd.c:1913) and which commands_init() binds a second time to M-2
// (cmd.c:2776); and '#chat', whose own key is M-c (cmd.c:1691). Reaching
// doride(), dotwoweapon() or dotalk() from any of those four keystrokes needs
// rhack()'s arm for each as well as this admission, and nothing in the current
// goal drives any of them, so all four keys stay on the refusing side while
// the typed names work.
export const ADMITTED_COMMANDS = Object.freeze([
    'wait', 'look', 'inventory', 'showspells', 'known', 'attributes', 'search',
    'eat', 'apply', 'down', 'drop', 'pickup', 'takeoff', 'wear', 'zap',
    'reqmenu', 'fight', 'options', 'wizwish', 'wizlevelport', 'fire', 'throw',
    'swap', 'kick', '#',
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
// tell a `G` run from a ctrl-direction rush.
//
// Two seams keep them out, and PREFIXCMD dispatch added the second.
// ADMITTED_COMMANDS omits `rush` and `run`, so neither key can start a
// command. A prefixed one is a different route: only the first byte of a
// command passes that gate, so `FG` and `mG` read `G`, find its row, and pass
// the PREFIXCMD exemption below exactly as they do in C. They are refused
// further down, at the bound-command-without-a-handler arm, because
// MOVEMENT_INTENTS has no row for `run`.
export const ADMITTED_RUN_MODES = Object.freeze([0, 1, 3]);

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

// ADMITTED_COMMANDS above lists what the port dispatches; a one-square
// walk and a byte bound to no command join them here. Classify that first
// logical byte before get_count() can consume a prefix byte or expose
// transient count output.
async function readSimpleCommand(state) {
    await beginCommandParse(state);
    let key;
    try {
        key = await readchar(state);
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

// C ref: cmd.c reset_occupations() (194-200). Its own comment lists the three
// occupations it stops from resuming: taking off all armor, picking a lock or
// forcing a chest, and setting a trap. Each owner clears its own context, so
// this is the three calls and nothing else.
export function reset_occupations(state = game) {
    reset_remarm(state);
    reset_pick(state);
    reset_trapset(state);
}

// ── command queue ──
//
// C ref: cmd.c cmdq_add_ec() (252-270), cmdq_pop() (406-420), cmdq_peek()
// (422-427) and cmdq_clear() (429-442), over gc.command_queue[NUM_CQS]
// (decl.h:225). A command can push a canned sequence of further commands and
// return; rhack() then runs one node per call, ahead of reading any key, so
// "time passes normally when doing queued actions" (hack.h:172-173).
//
// Only CQ_CANNED is represented. C's other queue, CQ_REPEAT, is a
// write-only recording buffer during ordinary play: cmdq_pop() reads it only
// while gi.in_doagain is set, and cmd.c do_repeat() (1636-1660) is the sole
// writer of that flag. #repeat and its ^A binding are unported, so every
// CQ_REPEAT write C makes -- rhack():3735, getdir():4018, yn_function():5543,
// getobj():2052-2053 -- would go into a list nothing can ever read. Each of
// those sites says so where it stands.
//
// Only CMDQ_EXTCMD nodes are produced. cmdq_add_key(), cmdq_add_dir(),
// cmdq_add_int() and cmdq_add_userinput() have no ported caller: of the four
// call sites that reach a ported command, dothrow.c dofire()'s swap-and-retry
// arm (568-570) pushes two extended commands and nothing else, and the three
// arms that push keys or directions belong to click_to_cmd(), iactions.c and
// dofire()'s own find_launcher() arm, all unported. rhack() below still
// classifies a non-extcmd node the way C does, because the queue is state and
// a future adder must not silently change what a stale node means.
function commandQueue(state) {
    state.command_queue ??= [[], []];
    return state.command_queue;
}

// C appends at the tail and pops from the head, so a canned sequence runs in
// the order it was pushed.
export function cmdq_add_ec(q, entry, state = game) {
    if (!entry || typeof entry.ef_txt !== 'string') {
        throw new TypeError('cmdq_add_ec() requires an extcmdlist row');
    }
    commandQueue(state)[q].push({ typ: CMDQ_EXTCMD, ec_entry: entry });
}

// C ref: cmd.c cmdq_pop(). It picks its own queue -- CQ_REPEAT while
// gi.in_doagain, CQ_CANNED otherwise -- and gi.in_doagain is always false
// here, so this reads CQ_CANNED unconditionally.
export function cmdq_pop(state = game) {
    return commandQueue(state)[CQ_CANNED].shift() ?? null;
}

export function cmdq_peek(q, state = game) {
    return commandQueue(state)[q][0] ?? null;
}

export function cmdq_clear(q, state = game) {
    commandQueue(state)[q].length = 0;
}

// C ref: cmd.c reset_cmd_vars(). Travel-map ownership stays with its future
// subsystem; this resets the state already owned here.
// context.pendingCommand is the JS retry owner rather than a C command
// variable, so this reset deliberately preserves it until rhack() either
// completes that command or reaches a non-retryable result.
//
// `resetCmdq` is C's parameter, and dropping it would break a canned
// sequence: rhack() passes FALSE for a command that answered plain ECMD_OK
// (3815, when gm.multi >= 0), which is exactly how dofire() returns after
// queueing [doswapweapon, dofire], and TRUE everywhere else so a cancelled or
// failed command discards the rest of the sequence.
export function resetCommandVars(state = game, resetCmdq = true) {
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
    if (resetCmdq) {
        cmdq_clear(CQ_CANNED, state);
        // cmdq_clear(CQ_REPEAT): no CQ_REPEAT queue is ported.
    }
}

// C ref: cmd.c set_move_cmd() (1386-1399), over the decl.c direction arrays
// indexed by hack.h's DIR_* enum. Every do_move_<dir>, do_run_<dir> and
// do_rush_<dir> handler calls it, and so do do.c dodown() and doup(), which
// pass DIR_DOWN and DIR_UP. The zdir[] entry is what separates them: it is
// nonzero for those two, so neither commits a walk or rush intent.
//
// C indexes the direction arrays; the port's MOVEMENT_INTENTS stores the
// resulting offsets, so its caller resolves the index back with xytodir().
export function set_move_cmd(dir, run, state = game) {
    state.u.dz = zdir[dir];
    state.u.dx = xdir[dir];
    state.u.dy = ydir[dir];
    /* #reqmenu -prefix disables autopickup during movement */
    if (state.iflags?.menu_requested) state.context.nopick = 1;
    state.context.travel = 0;
    state.context.travel1 = 0;
    if (!state.domoveAttempting && !state.u.dz) {
        state.context.run = run;
        state.domoveAttempting |= (!run ? DOMOVE_WALK : DOMOVE_RUSH);
    }
}

// C ref: cmd.c do_reqmenu() (1574-1587), the 'm' prefix. Pressed twice it
// cancels the command it was starting; rhack()'s PREFIXCMD arm turns the
// ECMD_CANCEL into reset_cmd_vars().
export async function do_reqmenu(state = game) {
    if (state.iflags.menu_requested) {
        const prefix = keyForCommand(commandBindings(state), 'reqmenu');
        await ttyNorep(
            `Double ${visibleCommandKey(prefix)} prefix, canceled.`,
            state,
        );
        state.iflags.menu_requested = false;
        return ECMD_CANCEL;
    }
    state.iflags.menu_requested = true;
    return ECMD_OK;
}

// C ref: cmd.c do_fight() (1621-1634), the 'F' prefix. It commits a walk
// before the direction key is even read, which is what lets rhack() send a
// force-fight through domove() rather than through the command it prefixed.
//
// Its cancel line names the command rather than the key -- C writes
// Norep("Double fight prefix, canceled.") literally, where do_reqmenu() above
// formats visctrl(cmd_from_func(do_reqmenu)) into the same sentence.
export async function do_fight(state = game) {
    if (state.context.forcefight) {
        await ttyNorep('Double fight prefix, canceled.', state);
        state.context.forcefight = 0;
        state.domoveAttempting = 0;
        return ECMD_CANCEL;
    }
    state.context.forcefight = 1;
    state.domoveAttempting |= DOMOVE_WALK;
    return ECMD_OK;
}

// C ref: cmd.c set_move_cmd() and rhack()'s DOMOVE_WALK/DOMOVE_RUSH paths.
// `key` is the movement key rhack() dispatched, which the failClosedCommand()
// wrapper below needs to keep the keystroke retryable.
async function executeMovement(command, key, firstTime, state) {
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

    set_move_cmd(xytodir(dx, dy), run, state);
    state.context.move = 1;

    // C ref: rhack():3785-3800, which picks the walk arm or the rush arm from
    // gd.domove_attempting rather than from the command's own run value, and
    // tests DOMOVE_WALK first. The two agree for an unprefixed movement key,
    // because set_move_cmd() has just derived one from the other. They part
    // company under the 'F' prefix: do_fight() sets DOMOVE_WALK before the
    // direction key is read, and set_move_cmd() then leaves both
    // domove_attempting and context.run alone, so the walk arm claims the step
    // and clears context.forcefight after it whatever run value the row holds.
    const walking = (state.domoveAttempting & DOMOVE_WALK) !== 0;
    if (walking) {
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
    // Every extended command routes its handler through failClosedCommand();
    // movement had no equivalent, so a refusal class raised below domove()
    // that js/jsmain.js does not break on escaped runSegment() and discarded
    // the segment's matching prefix instead of ending on it. The preflight
    // above converts by hand the refusals it can see ahead of the move; this
    // is the backstop for the ones only domove() reaches. rhack() is on the
    // stack here, so its finally still holds context.pendingCommand and the
    // keystroke stays retryable, exactly as the '#' arm's wrapper leaves it.
    await failClosedCommand(key, state, () => domove(state));
    if (walking) state.context.forcefight = 0;
    state.iflags.menu_requested = false;
}

// pendingCommand owns either one rejected physical byte which has not entered
// cmd.c parsing, or the complete parsed state needed to retry a destination
// admission failure. Parser UI state is deliberately absent because neither
// kind of retry resumes inside get_count(). A parsed retry retains the effect
// of every prefix this port owns, because rhack() has already consumed the
// prefix byte and no later input can reconstruct it: the reqmenu effect before
// set_move_cmd() copies it to context.nopick, and the fight effect, which is
// context.forcefight itself. Dropping either would replay the direction key as
// a plain walk, which is a different command from the one the player typed.
function captureParsedCommand(key, state) {
    return {
        phase: 'parsed',
        key,
        commandCount: state.commandCount,
        lastCommandCount: state.lastCommandCount,
        multi: state.multi,
        ...(state.iflags?.menu_requested ? { menuRequested: true } : {}),
        ...(state.context?.forcefight ? { forcefight: true } : {}),
    };
}

function restoreParsedCommand(pending, state) {
    state.cmdKey = pending.key;
    state.commandCount = pending.commandCount;
    state.lastCommandCount = pending.lastCommandCount;
    state.multi = pending.multi;
    state.iflags.menu_requested = Boolean(pending.menuRequested);
    state.context.forcefight = pending.forcefight ? 1 : 0;
    return pending.key;
}

function rejectedPhysicalCommand(pending) {
    return new UnsupportedHeroCommandBoundaryError(
        ADMITTED_BOUNDARY,
        pending.key,
    );
}

// The classes failClosedCommand() converts. js/jsmain.js breaks the segment
// only for the boundary classes it lists, so a class a command handler can
// raise that is missing from this list escapes as a hard failure and discards
// the segment's matching prefix instead of stopping on it.
// js/allmain.js elapsedTurnPlanningRefusals() is the same list for the turn
// loop; a class both paths can reach belongs in both.
export function failClosedCommandRefusals() {
    return [
        UnsupportedFeatureDescriptionError,
        UnsupportedObjectNameError,
        UnsupportedSpellDisplayError,
        UnsupportedDiscoveryDisplayError,
        UnsupportedEnlightenmentError,
        UnsupportedShopError,
        UnsupportedWeaponSkillError,
        UnsupportedGetlinBoundaryError,
        UnsupportedSearchError,
        UnsupportedDirectionBoundaryError,
        UnsupportedEatError,
        UnsupportedApplyError,
        // lock.c pick_lock() stops inside doapply()'s lock-pick arm, one
        // frame below UnsupportedApplyError rather than beside it.
        UnsupportedLockError,
        // do_wear.c dotakeoff() raises this for a piece of armor whose
        // objects[].oc_delay is non-zero and for the slots whose <X>_off()
        // is unported, in both cases before anything is drawn or removed.
        UnsupportedTakeOffError,
        // do_wear.c accessory_or_armor_on() raises this above setworn() for
        // the accessory half, the quest helm, an artifact, armor held in a
        // weapon slot, and the suit, cloak, helmet, glove and boot otyps whose
        // <X>_on() reaches outside do_wear.c. No slot refuses wholesale: all
        // seven reach a callback. on_msg() raises it for prinv().
        // set_wear() raises it too, from moveloop_preamble() rather than from
        // a command, so that one raiser is outside everything this list
        // converts; js/do_wear.js set_wear() records why that is tolerable.
        UnsupportedWearError,
        // eat.c newuhs() is shared: gethungry() calls it from the turn loop,
        // and done_eating() and lesshungry() call it from doeat().
        UnsupportedHungerTransitionError,
        UnsupportedObjectPromptError,
        UnsupportedSteedError,
        // wield.c can_twoweapon()'s artifact and slippery-or-cursed arms,
        // both of which stop before the command prints anything or draws its
        // rnd(20).
        UnsupportedTwoWeaponError,
        // The `f` command's three files. dothrow.c collects every branch of
        // the throw itself, wield.c the ones ready_weapon() reaches when the
        // swap-and-retry arm puts a launcher in the hero's hand, zap.c the
        // ones bhit() meets along the missile's flight, and display.c the one
        // transient-glyph style bhit() never opens.
        UnsupportedThrowError,
        UnsupportedWieldError,
        UnsupportedBhitError,
        UnsupportedTransientDisplayError,
        UnsupportedHitPointLossError,
        UnsupportedArtifactDisplayError,
        UnsupportedDropError,
        UnsupportedLevelChangeError,
        // wizcmds.c wiz_level_change() reaches the first when asked to lower
        // a level, which exper.c losexp() owns. attrib.c adjabil() throws the
        // second only while losing an ability or a weapon-skill slot, which
        // no ported command reaches; it is listed so that a future lowering
        // path ends the segment instead of failing the run.
        UnsupportedExperienceChangeError,
        UnsupportedAbilityChangeError,
        // do.c goto_level()'s tail reaches all four from inside the `>`
        // handler, so each one ends the segment where it would otherwise
        // discard the prefix: pickup(1) is goto_level()'s last statement,
        // run_timers() fires timers that expired while away, mon_arrive()
        // reaches rloc_to() placing a follower, and mklev() reaches makemon()
        // when the shop it generates holds a mimic.
        // The `,` command raises UnsupportedPickupError on a second path, and
        // now the more frequent one: runPickupCommand() -> dopickup() reaches
        // every refusal in pickup_checks() and pickup(). Retiring the
        // goto_level() grouping above would leave that path escaping instead
        // of ending the segment.
        UnsupportedPickupError,
        // options.c doset() builds its whole menu before select_menu() draws
        // anything, so an unported option value stops with no output; its
        // pick loop stops after the player has committed a selection.
        UnsupportedOptionMenuError,
        // display.c reglyph_darkroom() sits one frame below the second of
        // those: options.c reset_needed_visuals() calls it once the pick loop
        // has applied every selection, so a toggle that raises
        // go.opt_need_redraw reaches it under 'OPTIONS=!color' or
        // 'OPTIONS=!dark_room'.
        UnsupportedGlyphRepairError,
        // display.c unmap_object() raises this for a square that shows an
        // engraving, which hack.c domove_fight_empty() is the one ported
        // caller that can reach.
        UnsupportedMapMemoryError,
        UnsupportedHeroTimeoutBoundaryError,
        UnsupportedPositionCheckError,
        UnsupportedMonsterCreationError,
        UnsupportedRegionPlacementError,
        // zap.c makewish() raises this where readobjnam() stands, after
        // getlin() has echoed the whole wished-for line. Both #wizwish routes
        // reach it, so leaving it out would discard every screen the wish
        // prompt already matched instead of stopping on the last of them.
        UnsupportedWishError,
        // zap.c dozap() raises this from its three effect arms. Each one
        // stops after the command has already spent a charge and painted its
        // prompts, so the segment has to end on them rather than lose the
        // screens they matched.
        UnsupportedZapError,
        // Two paths raise this. invent.c hold_another_object(), which
        // makewish() calls unguarded, raises it from its drop, artifact,
        // Fumbling and autoquiver arms. A wish heavy or numerous enough to
        // push near_capacity() past flags.pickup_burden reaches the drop arm:
        // a boulder does it on any hero. dothrow.c throwit() raises it from
        // the weight() call that picks Splash! or Plop!, for a food the hero
        // has bitten, because js/dothrow.js cannot supply the eatenStat hook
        // without an import cycle. js/allmain.js
        // elapsedTurnPlanningRefusals() already lists the class, and the note
        // above says a class several paths can reach belongs in each.
        UnsupportedObjectOperationError,
        // sounds.c dochat() reaches this for a shop's merchandise, for a
        // steed, and for a monster on the target square, all three of which
        // continue into a function this goal leaves unported.
        UnsupportedChatError,
        // pray.c raises this from three functions. dopray() reaches
        // failClosedCommand() through the '#pray' keystroke, at the wizard
        // force-success prompt and at the pre-prayer invulnerability arm.
        // prayer_done()'s unported arms and angrygods()'s cases 2 through 8
        // and default run three turns later, from the ga.afternmv callback
        // unmul() invokes, with rhack() off the stack; js/allmain.js
        // runUnmulAtTurnBoundary() reads this same list to convert those at
        // the turn boundary. Prune this entry only once all three functions
        // have stopped raising the class, because dropping it early costs the
        // turn-boundary conversion too.
        UnsupportedPrayerError,
        // sit.c dosit() raises this from the eleven terrain and trap arms it
        // leaves unported, each at its own condition and so before that arm
        // has printed anything or changed the hero.
        UnsupportedSitError,
        // dokick.c raises this from dokick()'s nine guards and five target
        // tests and from kick_nondoor()'s terrain chain, each at its own
        // condition and so before that arm has drawn, printed or written
        // anything.
        UnsupportedKickError,
        // mon.c maybe_unhide_at() raises this from inside invent.c
        // delobj_core(), which sit.c's cream-pie arm reaches through useupf().
        UnsupportedHideError,
    ];
}

// C ref: rhack():3818-3825, the tail every ECMD_* handler shares. A command
// that spent a turn puts context.move back to TRUE and, unless it was
// dokick(), forgets the square the hero last kicked so that a pet stops
// avoiding it.
//
// `#kick` clears it too, and that is not an oversight to repair: rhack()
// captured `func` from the '#' row before calling doextcmd(), and the
// reassignment at 3750 replaces `tlist` alone, so the test at 3821 compares
// doextcmd() with dokick() and passes. Only the key bound to kick keeps the
// square. The kick arm in rhack() below is therefore the one command-result
// arm that does not come through here; the five arms whose handler answers a
// boolean rather than an ECMD code share this tail like the rest. The
// movement arms set context.move themselves because C returns at 3785-3800,
// before this tail runs at all.
function commandTookTime(state) {
    state.context.move = 1;
    clear_kickedloc(state);
}

// A command whose port is complete except for branches that are not, such as
// an object name doname() cannot format yet. Those throw their owner's error;
// converting it here keeps the segment's supported prefix and leaves the
// keystroke retryable, the same contract the admission seam provides.
async function failClosedCommand(key, state, run) {
    try {
        return await run();
    } catch (error) {
        if (failClosedCommandRefusals().some(
            (type) => error instanceof type,
        )) {
            resetCommandVars(state);
            throw new UnsupportedHeroCommandBoundaryError(
                `an unported branch of this command: ${error.message}`,
                key,
            );
        }
        throw error;
    }
}

// Seven of the extcmdlist[] handlers this file owns follow, each reachable
// both from the key bound to it and from the extended-command prompt:
// ddoinv(), dovspell(), dodiscovered(), doattributes(), dolook(), dosearch()
// and doeat(). Two more have no wrapper: donull(), which doextcmd() and
// rhack() call directly because it formats nothing that can fail closed, and
// steed.c doride(), which only the prompt reaches. The first five wrappers
// return whether the command took time, which its two callers turn into
// rhack()'s ECMD_TIME; dosearch() and doeat() return the ECMD_* result itself,
// as doride() does.
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
        menu: (items) => select_menu(state, {
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
        menu: (items, how, prompt) => select_menu(state, {
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
        menu: (lines) => select_menu(state, {
            lines,
            how: PICK_NONE,
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        }),
    }));
}

// C ref: detect.c dosearch(). Unlike the four wrappers above, this one returns
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

// C ref: eat.c doeat(). Like dosearch() and doride() it returns its own ECMD_*
// result, because doeat() distinguishes a refusal that spends no turn from the
// meal that spends one.
async function runEatCommand(key, state) {
    return failClosedCommand(key, state, () => doeat(state, {
        // C ref: eat.c newuhs()'s bot(), which redraws the status line as
        // soon as the hunger status changes rather than waiting for the
        // move loop.
        statusRefresh: () => bot(),
    }));
}

// C ref: apply.c doapply(). Like dosearch() and doeat() it returns its own
// ECMD_* result: use_stethoscope()'s free first listen answers ECMD_OK where a
// second listen in the same move answers ECMD_TIME, and a cancelled object or
// direction prompt answers ECMD_CANCEL.
async function runApplyCommand(key, state) {
    return failClosedCommand(key, state, () => doapply(state));
}

// C ref: zap.c dozap(). Like dosearch() and doeat() it returns its own ECMD_*
// result: ECMD_OK for the two guards above the object prompt, ECMD_CANCEL for
// an escaped object prompt, and ECMD_TIME once a wand has been chosen, whether
// or not it had a charge left to spend.
async function runZapCommand(key, state) {
    return failClosedCommand(key, state, () => dozap(state));
}

// C ref: do.c dodown(). Like dosearch() and doeat() it returns its own ECMD_*
// result, because dodown() distinguishes the refusal that spends no turn from
// the arms that spend one.
async function runDownCommand(key, state) {
    return failClosedCommand(key, state, () => dodown(state));
}

// C ref: do.c dodrop(), the 'd' command. Like dosearch() and doeat() it
// returns its own ECMD_* result, because drop() answers ECMD_FAIL for a
// refusal that spends no turn and ECMD_TIME for the object that lands.
async function runDropCommand(key, state) {
    return failClosedCommand(key, state, () => dodrop(state));
}

// C ref: hack.c dopickup(), the ',' command. Like dosearch() and doeat() it
// returns its own ECMD_* result: pickup_checks() refuses a square with nothing
// on it without spending a turn, and only a pickup that lifts something
// answers ECMD_TIME.
async function runPickupCommand(key, state) {
    return failClosedCommand(key, state, () => dopickup(state));
}

// C ref: do_wear.c dotakeoff(). Like dosearch() and doeat() it returns its own
// ECMD_* result, and it is the first ported command to answer ECMD_CANCEL from
// a getobj() the player escaped: an empty pack answers ECMD_OK instead,
// because getobj() never prompts for one.
async function runTakeOffCommand(key, state) {
    return failClosedCommand(key, state, () => dotakeoff(state));
}

// C ref: do_wear.c dowear(). Like dotakeoff() it returns its own ECMD_*
// result, and reaches all three: ECMD_OK for both of its guards and for a
// canwearobj() refusal, ECMD_CANCEL for an escaped getobj() prompt, and
// ECMD_TIME for the piece that goes on.
async function runWearCommand(key, state) {
    return failClosedCommand(key, state, () => dowear(state));
}

// C ref: wizcmds.c wiz_level_change(). Like dosearch() and doeat() it returns
// its own ECMD_* result; #levelchange never spends a turn, so that result is
// always ECMD_OK.
async function runLevelChangeCommand(key, state) {
    return failClosedCommand(key, state, () => wiz_level_change(state));
}

// C ref: wizcmds.c wiz_wish(). Both of its arms end `return ECMD_OK`, so the
// result never varies. doextcmd() hands it back anyway, the way it does for
// every other ECMD_* handler; rhack()'s arm drops it, and says why.
async function runWishCommand(key, state) {
    return failClosedCommand(key, state, () => wiz_wish(state));
}

// C ref: wizcmds.c wiz_level_tele(). Like wiz_wish() it ends `return ECMD_OK`
// on both arms, so a cancelled level teleport spends no turn.
async function runLevelTeleCommand(key, state) {
    return failClosedCommand(key, state, () => wiz_level_tele(state));
}

// C ref: wield.c dotwoweapon(). Like dosearch() and doeat() it returns its own
// ECMD_* result, and it is the only ported command whose result a random draw
// decides: wield.c:861 answers ECMD_TIME when rnd(20) beats the hero's current
// Dexterity and ECMD_OK when it does not.
async function runTwoWeaponCommand(key, state) {
    return failClosedCommand(key, state, () => dotwoweapon(state));
}

// C ref: dokick.c dokick(). Like dosearch() and doeat() it returns its own
// ECMD_* result: ECMD_CANCEL when the direction prompt answers nothing or
// names the hero's own square, and ECMD_TIME for the kick that lands. C's
// third result, the ECMD_FAIL that follows every no-kick guard, belongs to
// arms this port refuses.
async function runKickCommand(key, state) {
    return failClosedCommand(key, state, () => dokick(state));
}

// C ref: sounds.c dotalk(). Like dosearch() and doeat() it returns its own
// ECMD_* result: dochat() answers ECMD_CANCEL for a cancelled direction prompt
// and ECMD_OK for every arm this goal ports, so #chat never spends a move.
async function runChatCommand(key, state) {
    return failClosedCommand(key, state, () => dotalk(state));
}

// C ref: weapon.c enhance_weapon_skill(). Like dosearch() and doeat() it
// returns its own ECMD_* result, which for this command is always ECMD_OK.
// The whole skill listing is formatted before select_menu() draws anything, so
// an unported skill display stops with the screen untouched.
async function runEnhanceCommand(key, state) {
    return failClosedCommand(key, state, () => enhance_weapon_skill(state, {
        // weapon.c add_skills_to_menu() opens each skill range with
        // add_menu_heading(), which draws it with iflags.menu_headings;
        // menuTitleStyle() reads that style. end_menu()'s prompt line takes
        // the same style through allmain.c adjust_menu_promptstyle().
        menu: (lines, prompt) => select_menu(state, {
            lines: lines.map((line) => (line.heading
                ? {
                    ...line,
                    attr: menuTitleStyle(state).titleAttr,
                    color: menuTitleStyle(state).titleColor,
                }
                : line)),
            // Every entry is display-only, so select_menu(PICK_NONE) ends
            // only on a dismissal and always answers cancelValue.
            how: PICK_NONE,
            title: prompt,
            ...menuTitleStyle(state),
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        }),
    }));
}

// C ref: options.c doset_simple(), the 'O' command. Both it and the doset()
// its menu_requested arm hands off to format the whole menu before
// select_menu() draws anything, so an unported option value stops before any
// output.
async function runOptionsCommand(key, state) {
    return failClosedCommand(key, state, () => doset_simple(state, {
        // add_menu_heading() draws each section heading with
        // iflags.menu_headings, which menuTitleStyle() reads.
        headingStyle: {
            attr: menuTitleStyle(state).titleAttr,
            color: menuTitleStyle(state).titleColor,
        },
        // Both menus end with end_menu(prompt) and then call select_menu().
        // doset() asks for PICK_ANY, where Escape answers null and an empty
        // commit answers []; doset_simple_menu() asks for PICK_ONE, where
        // both of those answer null.
        menu: (items, prompt, how) => select_menu(state, {
            items,
            how,
            title: prompt,
            ...menuTitleStyle(state),
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        }),
        // Not a window-port seam like `menu` above: count_bind_keys() below
        // is the complete port of the cmd.c function optfn_o_bind_keys()
        // calls, and cmd.c owns it. It is injected only because js/cmd.js
        // already imports js/options.js, so importing this back would close
        // the cycle.
        countBindKeys: count_bind_keys,
    }));
}

// C ref: cmd.c count_bind_keys(). Both of its loops read gc.Cmd.cmdbinds,
// which holds one entry per key: cmdbind_add() overwrites an existing entry
// in place and bind_key(key, "nothing") removes it, so repeated `bind`
// statements for one key leave one entry behind. model.bindings is that list
// -- createCommandBindingModel() replays commandOperations with the same
// replace-in-place semantics and carries C's userbind flag on each entry --
// so both loops walk it here too.
//
// The first loop counts every entry the player bound whose command sits on a
// key other than its extcmdlist[] one. C reads that key through bind->cmd,
// the row bind_key() matched after stripping any `(param)` suffix; this port
// stores the stripped name, so EXTCMD_BY_NAME looks the row back up. A name
// bind_key() would have rejected has no row and, as in C, contributes
// nothing. The second loop counts every command whose compiled-in key no
// entry holds.
export function count_bind_keys(state = game) {
    const model = commandBindings(state);
    let nbinds = 0;
    const keys = new Set();
    for (const binding of model.bindings) {
        const key = binding.key & 0xFF;
        keys.add(key);
        const command = EXTCMD_BY_NAME.get(binding.command);
        if (binding.userbind && command && command.key !== key) nbinds++;
    }
    for (const entry of extcmdlist)
        if (entry.key && !keys.has(entry.key)) nbinds++;
    return nbinds;
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
// the WIZMODECMD arm, because extcmds_match() has already dropped every
// WIZMODECMD row for a hero who is not in debug mode; rhack()'s own
// can_do_extcmd() call below is what reaches it, for a hero who presses the
// key such a row is bound to.
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

// extcmdlist[] indexed by the name commandForKey() answers, which is the row's
// ef_txt. C keeps the row itself in the binding, so rhack() reaches it through
// gc.cmd_bind->cmd; this port stores the name and looks the row back up.
const EXTCMD_BY_NAME = new Map(
    extcmdlist.map((entry) => [entry.ef_txt, entry]),
);

// C ref: cmd.c ext_func_tab_from_func() (cmd.c:5766-5777), which cmdq_add_ec()
// applies to the function pointer its caller names. This port names the row by
// its ef_txt instead, because that is what commandForKey() answers and what
// rhack() dispatches on.
export function extcmdRow(name) {
    const entry = EXTCMD_BY_NAME.get(name);
    if (!entry) throw new Error(`no extcmdlist row named ${name}`);
    return entry;
}

// C ref: cmd.c rhack() at 3688-3692, the can_do_extcmd() call rhack() makes
// for the row the pressed key is bound to, ahead of the prefix tests and the
// dispatch below. A refusal reset_cmd_vars(TRUE)s and leaves res at ECMD_OK,
// which the tail at 3814 answers with a second reset and no spent turn, so
// returning here reproduces both.
//
// cmdbind_get() answers no row for an unbound byte and C skips the call for
// it. `null` is this port's spelling of that; so is a name with no row, which
// only an OPTIONS `bind` to a command C's bind_key() would have rejected can
// produce, and which rhack()'s unported-command arm below already refuses.
async function rhackCanDoExtcmd(command, state) {
    const entry = EXTCMD_BY_NAME.get(command);
    if (entry && !await can_do_extcmd(entry, state)) {
        resetCommandVars(state);
        return false;
    }
    return true;
}

// C ref: rhack():3696-3722, the two messages for a command that was given a
// prefix it does not accept. `which` is the key bound to the prefix; C's two
// fallbacks for an unbound prefix cannot fire, because commands_init() binds
// both prefixes this port dispatches.
//
// Both lines end the command. C sets res = ECMD_FAIL and its result handling
// at 3810 turns that into reset_cmd_vars(TRUE), which the caller does here.
async function prefixRefusedCommand(prefixCommand, entry, wasMPrefix, state) {
    const which = visibleCommandKey(
        keyForCommand(commandBindings(state), prefixCommand),
    );
    if (wasMPrefix) {
        // custompline(SUPPRESS_HISTORY, ...) is pline() that stays out of the
        // message history doprev_message() recalls; no message history is
        // ported, so the two are the same line.
        await ttyPline(
            `The ${entry.ef_txt} command does not accept '${which}' prefix.`,
            state,
        );
        return;
    }
    // 3712-3720. The movement prefixes name the two staircase commands as the
    // ones a movement prefix still cannot take. extcmdlist[]'s "up" and "down"
    // rows are reached by their keys, doup() and dodown() by '#up' and
    // '#down', and C tests for both spellings.
    const ch = String.fromCharCode(entry.key);
    const up = ch === '<' || entry.ef_funct === 'doup';
    const down = ch === '>' || entry.ef_funct === 'dodown';
    await ttyPline(
        `The '${which}' prefix should be followed by a movement command`
        + `${up || down ? ' other than up or down' : ''}.`,
        state,
    );
}

// C ref: cmd.c doextcmd(). The do/while loop repeats only while the command
// reached is doextlist (#?), which stays unported, so one pass covers every
// dispatch the port can make.
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
    case 'doeat':
        return await runEatCommand(key, state);
    case 'doapply':
        return await runApplyCommand(key, state);
    case 'dozap':
        return await runZapCommand(key, state);
    case 'dodown':
        return await runDownCommand(key, state);
    case 'dodrop':
        return await runDropCommand(key, state);
    case 'dopickup':
        return await runPickupCommand(key, state);
    case 'dotakeoff':
        return await runTakeOffCommand(key, state);
    case 'dowear':
        return await runWearCommand(key, state);
    case 'doride':
        // C ref: steed.c doride(), which returns its own ECMD_* result.
        return await doride(state);
    case 'dopray':
        // C ref: pray.c dopray(), which returns its own ECMD_* result.
        return await dopray(state);
    case 'dosit':
        // C ref: sit.c dosit(), which returns its own ECMD_* result.
        return await dosit(state);
    case 'dokick':
        return await runKickCommand(key, state);
    case 'dotwoweapon':
        return await runTwoWeaponCommand(key, state);
    case 'dotalk':
        return await runChatCommand(key, state);
    case 'enhance_weapon_skill':
        return await runEnhanceCommand(key, state);
    case 'wiz_level_change':
        return await runLevelChangeCommand(key, state);
    case 'wiz_level_tele':
        return await runLevelTeleCommand(key, state);
    case 'wiz_wish':
        return await runWishCommand(key, state);
    default:
        resetCommandVars(state);
        throw new UnsupportedHeroCommandBoundaryError(
            `the extended command '${entry.ef_txt}' is not ported`,
            key,
        );
    }
}

// C ref: cmd.c rhack(). Only the source handlers the port owns are
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
        // C ref: rhack():3642-3657. The queue is consulted first, ahead of
        // both the pending-command retry and any key read, and `firsttime`
        // was captured before it. A CMDQ_EXTCMD node jumps straight to the
        // dispatch with the queued row in hand; every other node type is
        // reduced to a key, which for the three that carry none is 0 and
        // reaches the reset-and-return below.
        //
        // A queued command is not a parsed one: no key exists to replay, so
        // it captures no pendingCommand, and a fail-closed refusal it raises
        // ends the segment where it stands. On a fresh entry it counts no
        // dispatch either, because only a key read from parse() sets
        // newLogicalCommand.
        const queued = cmdq_pop(state);
        let cmdqCommand = null;
        if (queued) {
            if (queued.typ === CMDQ_EXTCMD && queued.ec_entry) {
                cmdqCommand = queued.ec_entry.ef_txt;
            } else {
                key = queued.typ === CMDQ_KEY ? queued.key : 0;
            }
        } else if (firstTime) {
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
            // parse() cannot push a canned command here: click_to_cmd() is
            // its only pusher and no mouse input is ported, so C's
            // `!key && cmdq_peek(CQ_CANNED)` retry at 3655 never fires.
        }

        // Count one dispatch per logical parsed command. A retained parsed
        // command has already been dispatched even when destination admission
        // rejects more than once before it can complete.
        if (newLogicalCommand) {
            state._commandDispatchCount =
                (state._commandDispatchCount ?? 0) + 1;
        }

        if (!cmdqCommand && (!key || key === 0xFF || key === ESC)) {
            resetCommandVars(state);
            return;
        }

        // C ref: rhack():3682-3685. A queued extended command supplies its own
        // table row, and the `goto do_cmdq_extcmd` that brings it here skips
        // the binding lookup entirely.
        let command = cmdqCommand
            ?? commandForKey(commandBindings(state), key);
        if (!await rhackCanDoExtcmd(command, state)) return;
        // C ref: rhack()'s PREFIXCMD arm (3762-3772). A prefix runs its own
        // handler, is remembered in prefix_seen, and jumps back to
        // got_prefix_input for the command it modifies -- so a prefix may
        // follow a prefix, and this is a loop for the same reason C uses a
        // goto. Two of the four PREFIXCMD rows are ported: 'm' (do_reqmenu)
        // and 'F' (do_fight). 'g' and 'G' are refused one level up, because
        // ADMITTED_COMMANDS omits `rush` and `run`.
        let prefixSeen = null;
        let wasMPrefix = false;
        while (command === 'reqmenu' || command === 'fight') {
            const res = command === 'reqmenu'
                ? await do_reqmenu(state)
                : await do_fight(state);
            // 3764-3767. A prefix pressed twice cancels the whole command.
            if (res & ECMD_CANCEL) {
                resetCommandVars(state);
                return;
            }
            prefixSeen = command;
            // 3770-3771. was_m_prefix latches on do_reqmenu() and is never
            // cleared, so `Fm` and `mF` both leave the CMD_M_PREFIX rule in
            // force for the command that follows.
            if (command === 'reqmenu') wasMPrefix = true;
            key = await parseCommand(state);
            if (firstTime) {
                state.context.pendingCommand =
                    captureParsedCommand(key, state);
            }
            if (!key || key === 0xFF || key === ESC) {
                resetCommandVars(state);
                return;
            }
            command = commandForKey(commandBindings(state), key);
            // C loops back to do_cmdq_extcmd for the prefixed command, so the
            // next key gets its own can_do_extcmd() before anything else
            // looks at it.
            if (!await rhackCanDoExtcmd(command, state)) return;
        }
        if (prefixSeen) {
            // C ref: rhack():3693-3722. The command after a prefix has to
            // carry the flag that prefix hands out, or C reports it and gives
            // up on the whole command with ECMD_FAIL. A further prefix is
            // exempt: the PREFIXCMD conjunct is what lets `mF` and `FG`
            // through, and the loop above consumes only the two prefixes this
            // port owns, so `run` and `rush` still reach it.
            //
            // An unbound key has no row at all; C's `tlist != 0` test above
            // this one sends it to the bad-command path instead, which is
            // where a missing entry falls through to below.
            const entry = EXTCMD_BY_NAME.get(command);
            const accepted = wasMPrefix ? CMD_M_PREFIX : CMD_gGF_PREFIX;
            if (entry && !(entry.flags & PREFIXCMD)
                && !(entry.flags & accepted)) {
                await prefixRefusedCommand(prefixSeen, entry, wasMPrefix,
                    state);
                resetCommandVars(state);
                return;
            }
        }
        if (command === 'wait') {
            // donull() writes context.move itself, so this arm carries only
            // the halves of rhack():3805-3825 that it does not: the reset for
            // ECMD_OK and, for ECMD_TIME, the kickedloc clear every handler
            // but dokick() performs.
            if (!await donull(state)) resetCommandVars(state);
            else clear_kickedloc(state);
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
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'search') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#' arm above applies. dosearch() answers
            // ECMD_TIME for a search that ran and ECMD_OK when
            // cmd_safety_prevention() stopped it, so the cancel arm is
            // unreachable from this handler today and no test pins it. It is
            // written out anyway because cmd.c:3805-3809 documents
            // (ECMD_TIME|ECMD_CANCEL) as a real result, and dropping the test
            // would make this arm disagree with C for it.
            const res = await runSearchCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'eat') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#' and `search` arms apply. doeat() answers
            // ECMD_OK for every refusal this slice covers, so only the middle
            // test fires today; the cancel test is written out for the same
            // reason it is there, because cmd.c:3805-3809 documents
            // (ECMD_TIME|ECMD_CANCEL) as a real result.
            const res = await runEatCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'apply') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search` and `eat` arms apply. doapply()
            // reaches all three: ECMD_CANCEL for a cancelled object or
            // direction prompt, ECMD_OK for the free first listen of a move
            // and for the three use_stethoscope() guards, and ECMD_TIME for a
            // second listen in the same move.
            const res = await runApplyCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'zap') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat` and `apply` arms apply.
            // dozap() reaches all three: ECMD_OK for nohands() and
            // check_capacity(), ECMD_CANCEL for an escaped object prompt, and
            // ECMD_TIME for every arm past it. The MOVEMENTCMD and
            // domove_attempting tests at 3773-3800 cannot divert it, because
            // cmd.c:2004's "zap" row carries no flags at all -- which is also
            // why an 'm' or 'F' prefix is refused ahead of this arm.
            const res = await runZapCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'down') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search` and `eat` arms apply. The
            // MOVEMENTCMD and domove_attempting tests above them at 3773-3800
            // cannot divert this command: extcmdlist[]'s "down" row carries
            // CMD_M_PREFIX alone, and set_move_cmd(DIR_DOWN, 0) leaves
            // domove_attempting at 0 because zdir[DIR_DOWN] is nonzero.
            //
            // dodown() answers ECMD_OK for the refusal this slice covers and
            // ECMD_TIME for u_rooted(); the cancel test is written out for the
            // same reason it is in the arms above, because cmd.c:3805-3809
            // documents (ECMD_TIME|ECMD_CANCEL) as a real result.
            const res = await runDownCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'drop') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat`, `apply`, `down` and
            // `takeoff` arms apply. dodrop() answers ECMD_FAIL when the
            // getobj() prompt is escaped or the object cannot be let go, and
            // ECMD_TIME for the object that lands; the ECMD_CANCEL half of the
            // first test cannot fire, because drop() has no ECMD_CANCEL arm.
            // The MOVEMENTCMD and domove_attempting tests at 3773-3800 cannot
            // divert it either, because cmd.c:1708's "drop" row carries no
            // flags at all.
            const res = await runDropCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'pickup') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat`, `apply`, `down`, `drop`
            // and `takeoff` arms apply. dopickup() answers ECMD_OK when
            // pickup_checks() refuses the square, which spends no turn, and
            // ECMD_TIME when pickup() answers 1 because it selected at least
            // one object, which is n_tried > 0 in js/pickup.js pickup(). The
            // ECMD_TIME test below is what spends that turn; the cancel test is
            // written out for the same reason it is in the arms above,
            // because cmd.c:3805-3809 documents (ECMD_TIME|ECMD_CANCEL) as a
            // real result. The MOVEMENTCMD and domove_attempting tests at
            // 3773-3800 cannot divert this command either, because
            // cmd.c:1799's "pickup" row carries CMD_M_PREFIX and no movement
            // flag; that same flag is what lets `m,` through the prefix test
            // at 3693-3695 with iflags.menu_requested still set.
            const res = await runPickupCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'takeoff') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat`, `apply` and `down` arms
            // apply. dotakeoff() reaches all three: ECMD_CANCEL when the
            // getobj() prompt is escaped, ECMD_OK for a bare pack, for an
            // item that is not worn and for a cursed one, and ECMD_TIME for
            // the piece that comes off. The MOVEMENTCMD and
            // domove_attempting tests at 3773-3800 cannot divert it, because
            // cmd.c:1886's "takeoff" row carries no flags at all.
            const res = await runTakeOffCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'wear') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the `takeoff` arm above applies. dowear() reaches
            // all three: ECMD_CANCEL when the getobj() prompt is escaped,
            // ECMD_OK for a form that cannot wear armor, for a hero already
            // wearing everything and for every canwearobj() refusal, and
            // ECMD_TIME for the piece that goes on. The MOVEMENTCMD and
            // domove_attempting tests at 3773-3800 cannot divert it, because
            // cmd.c:1932's "wear" row carries no flags at all.
            const res = await runWearCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'fire') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the arms above apply. dofire() reaches all three:
            // ECMD_CANCEL when throw_obj() is given no direction, ECMD_OK for
            // an empty quiver and for the swap-and-retry arm that queues its
            // own continuation, and ECMD_TIME for the shot itself. The
            // ECMD_OK arm is why the reset below must be told not to clear
            // the queue -- it is the one that leaves [doswapweapon, dofire]
            // standing for the next two rhack() calls.
            //
            // extcmdlist[]'s "fire" row carries no flags at all, so neither
            // the prefix test at 3693-3695 nor the MOVEMENTCMD and
            // domove_attempting tests at 3773-3800 can divert it.
            const res = await failClosedCommand(
                key, state, () => dofire(state),
            );
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'throw') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the `fire` arm above applies. dothrow() reaches all
            // three: ECMD_CANCEL when the object prompt is escaped, ECMD_OK
            // for each of ok_to_throw()'s three refusals and for the throws
            // throw_obj() answers with a message, and ECMD_TIME for the throw
            // itself. Nothing here queues a continuation, so the ECMD_OK arm
            // has no queue to preserve -- but it is spelled the same way as
            // `fire`'s, because both read rhack()'s one test.
            //
            // extcmdlist[]'s "throw" row (cmd.c:1901) carries no flags at
            // all, so neither the prefix test at 3693-3695 nor the
            // MOVEMENTCMD and domove_attempting tests at 3773-3800 can divert
            // it.
            const res = await failClosedCommand(
                key, state, () => dothrow(state),
            );
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'swap') {
            // C ref: rhack()'s result handling, the same three tests. Both of
            // doswapweapon()'s guards answer ECMD_FAIL, and ready_weapon()
            // supplies the rest: ECMD_TIME for the swap that happens and
            // ECMD_OK only when both slots were already empty. cmd.c:1917's
            // "swap" row carries no flags either.
            const res = await failClosedCommand(
                key, state, () => doswapweapon(state),
            );
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'kick') {
            // C ref: rhack()'s result handling at cmd.c:3810-3825. dokick()
            // answers ECMD_CANCEL for a direction prompt that named nothing
            // and ECMD_TIME for the kick that lands; its ECMD_FAIL belongs to
            // the no-kick guards this port refuses. cmd.c:1748's "kick" row
            // carries no flags at all, so neither the prefix test at
            // 3693-3695 nor the MOVEMENTCMD and domove_attempting tests at
            // 3773-3800 can divert it.
            //
            // This is the one arm that does not call commandTookTime(): the
            // key bound to kick makes rhack()'s `func` dokick() itself, and
            // 3821 keeps gk.kickedloc for exactly that case.
            const res = await runKickCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) state.context.move = 1;
            return;
        }
        if (command === 'options') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, which the
            // '#', `search`, `eat` and `down` arms above spell out in full.
            // Both doset_simple() and doset() end `return ECMD_OK`
            // (options.c:8734, :8974), so only reset_cmd_vars() runs. The
            // MOVEMENTCMD and domove_attempting tests at 3773-3800 cannot
            // divert it: extcmdlist[]'s "options" row carries IFBURIED,
            // GENERALCMD and CMD_M_PREFIX and no movement flag.
            await runOptionsCommand(key, state);
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'wizwish') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, which the
            // '#', `search`, `eat` and `down` arms above spell out in full.
            // Both arms of wiz_wish() end `return ECMD_OK` (wizcmds.c:44), so
            // neither the cancel test nor the ECMD_TIME test can fire and
            // reset_cmd_vars() is the whole of the handling. The MOVEMENTCMD
            // and domove_attempting tests at 3773-3800 cannot divert it
            // either: extcmdlist[]'s "wizwish" row carries IFBURIED,
            // CMD_M_PREFIX and WIZMODECMD and none of the movement flags.
            await runWishCommand(key, state);
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'wizlevelport') {
            // C ref: rhack()'s result handling, the same shape the `wizwish`
            // arm above spells out: wizcmds.c:405 ends both arms of
            // wiz_level_tele() with `return ECMD_OK`, so reset_cmd_vars() is
            // all of it. The prefix test at 3693-3695 cannot divert the
            // command either -- cmd.c:1970's "wizlevelport" row carries
            // CMD_M_PREFIX, so an 'm' prefix reaches level_tele() rather than
            // "The wizlevelport command does not accept 'm' prefix." -- and
            // the row holds no movement flag.
            await runLevelTeleCommand(key, state);
            resetCommandVars(state, state.multi < 0);
            return;
        }
        // These five wrappers answer a boolean rather than an ECMD code, so
        // each folds C's two result arms into one unconditional reset. That
        // predates the command queue and stays: every one of them is reachable
        // only from a typed key, and rhack() has just drained the queue to
        // read that key, so the clear the reset now performs has nothing to
        // discard. The fold covers the reset argument alone; the ECMD_TIME
        // tail at 3818-3825 is shared with every other arm through
        // commandTookTime(), so a wrapper that spends a turn forgets the
        // kicked square exactly as the ECMD arms do.
        //
        // One fold here is wider than the reset argument and is left as it
        // stands: for an elapsed command C runs no reset_cmd_vars() at all,
        // where these arms run one and then put context.move back, so multi,
        // context.run, context.mv and domove_attempting are zeroed on a path
        // that C leaves alone. Nothing reaches it today. dolook() is the only
        // one of the five whose own exits can answer ECMD_TIME (invent.c:4160,
        // :4248 and :4314, each for a blind hero), no ported code writes
        // u.uprops[BLINDED], and ddoinv()'s other C exit, itemactions() at
        // invent.c:2998, is refused in js/invent.js before it can answer.
        if (command === 'inventory') {
            const elapsed = await runInventoryCommand(key, state);
            resetCommandVars(state);
            if (elapsed) commandTookTime(state);
            return;
        }
        if (command === 'showspells') {
            const elapsed = await runShowspellsCommand(key, state);
            resetCommandVars(state);
            if (elapsed) commandTookTime(state);
            return;
        }
        if (command === 'known') {
            const elapsed = await runKnownCommand(key, state);
            resetCommandVars(state);
            if (elapsed) commandTookTime(state);
            return;
        }
        if (command === 'attributes') {
            const elapsed = await runAttributesCommand(key, state);
            resetCommandVars(state);
            if (elapsed) commandTookTime(state);
            return;
        }
        if (command === 'look') {
            const elapsed = await runLookCommand(key, state);
            // C ref: rhack()'s result handling. dolook() returns ECMD_OK for
            // a sighted hero, which reaches reset_cmd_vars(); only ECMD_TIME
            // puts context.move back to TRUE.
            resetCommandVars(state);
            if (elapsed) commandTookTime(state);
            return;
        }
        if (Object.hasOwn(MOVEMENT_INTENTS, command)) {
            await executeMovement(command, key, firstTime, state);
            return;
        }
        if (command !== null) {
            // A bound command whose handler the port excludes. Two routes
            // reach here. A repeat can supply it as logical input, and a
            // prefix can: only a command's first byte passes the fresh-read
            // seam above, so `FG` and `mG` read `G`, pass the PREFIXCMD
            // exemption, and arrive with no MOVEMENT_INTENTS row. This arm is
            // what keeps `run` and `rush` out of the port on that route.
            resetCommandVars(state);
            throw new UnsupportedHeroCommandBoundaryError(
                ADMITTED_BOUNDARY,
                key,
            );
        }

        // C ref: cmd.c rhack()'s bad-command path. Its custompline() differs
        // from pline() only in SUPPRESS_HISTORY, which keeps the line out of
        // the message history that doprev_message() recalls; no message
        // history is ported. Its cmdq_clear(CQ_REPEAT) has no ported queue to
        // clear, and iflags.sanity_no_check suppresses only the debug sanity
        // check.
        cmdq_clear(CQ_CANNED, state);
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
