// cmd.js -- Command parsing, dispatch, and movement intent.
// C refs: cmd.c get_count(), parse(), rhack(), set_move_cmd().

import {
    bindingAt,
    commandForKey,
    createCommandBindingModel,
    keyForCommand,
    resetCommandBindingModel,
    SOURCE_SPECIAL_KEY_DEFAULTS,
    updateRestOnSpaceModel,
    visibleCommandKey,
} from './command_bindings.js';
import {
    ACH_MINE_PRIZE,
    ACH_SOKO_PRIZE,
    ARTICLE_THE,
    CLICK_1,
    CLICK_2,
    CMDQ_DIR,
    CMDQ_EXTCMD,
    CMDQ_INT,
    CMDQ_KEY,
    CMDQ_USER_INPUT,
    COLNO,
    A_STR,
    A_WIS,
    CONFUSION,
    CQ_CANNED,
    CQ_REPEAT,
    DIR_E,
    DIR_N,
    DIR_NE,
    DIR_NW,
    DIR_S,
    DIR_SE,
    DIR_SW,
    DIR_W,
    DIR_ERR,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    GC_CONDHIST,
    GC_ECHOFIRST,
    GC_SAVEHIST,
    DOOR,
    DRAWBRIDGE_UP,
    GFILTER_VIEW,
    IRONBARS,
    IS_DOOR,
    IS_ALTAR,
    IS_FOUNTAIN,
    IS_SINK,
    IS_STWALL,
    IS_THRONE,
    In_tutorial,
    IS_TREE,
    IS_WATERWALL,
    LAVAWALL,
    LARGEST_INT,
    MENU_BEHAVE_STANDARD,
    MAX_TYPE,
    ROOM,
    ROOMOFFSET,
    SCORR,
    SDOOR,
    SUPPRESS_SADDLE,
    GETOBJ_PROMPT,
    MV_ANY,
    MV_RUN,
    MV_RUSH,
    MV_WALK,
    N_DIRS,
    N_DIRS_Z,
    Never_mind,
    PICK_ANY,
    PICK_NONE,
    PICK_ONE,
    PARANOID_QUIT,
    PLNMSG_UNKNOWN,
    QBUFSZ,
    ROWNO,
    LEVEL_TELEP,
    SICK,
    SLIMED,
    STONED,
    STRANGLED,
    TELEP_TRAP,
    TELEPORT,
    TER_MAP,
    VIBRATING_SQUARE,
    Upolyd,
    isok,
    quitchars,
    u_at,
    dirs_ord,
    xdir,
    ydir,
    zdir,
    W_SADDLE,
} from './const.js';
import {
    doapply,
    dorub,
    reset_trapset,
    UnsupportedApplyError,
} from './apply.js';
import { UnsupportedArtifactDisplayError, doinvoke } from './artifacts.js';
import {
    dosearch,
    reveal_terrain,
    UnsupportedSearchError,
} from './detect.js';
import {
    bot,
    cls,
    docrt,
    flush_screen,
    glyph_at,
    glyph_is_invisible,
    hero_glyph_info,
    newsym,
    objnum_to_glyph,
    vobj_at,
    UnsupportedMapMemoryError,
    UnsupportedTransientDisplayError,
} from './display.js';
import {
    dodown,
    dodrop,
    dowipe,
    doup,
    UnsupportedWipeError,
    UnsupportedDropError,
    UnsupportedLevelChangeError,
} from './do.js';
import {
    doputon, dotakeoff, dowear, remarm_swapwep, reset_remarm,
    UnsupportedAccessoryOnError, UnsupportedRingOnError,
    UnsupportedTakeOffError, UnsupportedWearError,
} from './do_wear.js';
import { doclose, doforce, doopen, reset_pick, UnsupportedLockError } from './lock.js';
import {
    attacktype,
    can_breathe,
    can_teleport,
    hides_under,
    is_hider,
    is_mind_flayer,
    is_unicorn,
    is_vampire,
    is_vampshifter,
    is_were,
    webmaker,
} from './mondata.js';
import {
    AT_GAZE,
    AT_SPIT,
    MS_SHRIEK,
    PM_GREMLIN,
    PM_WIZARD,
    S_NYMPH,
} from './monsters.js';
import { dmonsfree, UnsupportedMonsterCreationError } from './makemon_create.js';
import { UnsupportedRegionPlacementError } from './mkmaze.js';
import {
    docallcmd,
    mon_nam,
    x_monnam,
    UnsupportedObjectNamingError,
} from './do_name.js';
import { dobjsfree, isContainer, UnsupportedObjectOperationError } from './obj.js';
import { doloot, dotip, UnsupportedPickupError } from './pickup.js';
import {
    dodrink,
    dodip,
    UnsupportedDipError,
    UnsupportedPotionError,
    UnsupportedQuaffError,
} from './potion.js';
import { UnsupportedFountainError } from './fountain.js';
import { WaterDamageError } from './trap_water_damage.js';
import { UnsupportedItemDestructionError } from './zap_destroy_items.js';
import {
    BOULDER,
    CREDIT_CARD,
    FOOD_CLASS,
    LOCK_PICK,
    SADDLE,
    SKELETON_KEY,
    SPE_TELEPORT_AWAY,
} from './objects.js';
import { next_to_u } from './apply_next_to_u.js';
import { UnsupportedPositionCheckError, tele } from './teleport.js';
import { reset_utrap, t_at, dountrap } from './trap.js';
import { stairway_at } from './stairs.js';
import { UnsupportedHeroTimeoutBoundaryError } from './timeout.js';
import { UnsupportedErosionError } from './trap_erode_obj.js';
import {
    doeat,
    morehungry,
    UnsupportedEatError,
    UnsupportedHungerTransitionError,
} from './eat.js';
import {
    can_reach_floor,
    doengrave,
    read_engr_at,
    UnsupportedEngraveError,
} from './engrave.js';
import {
    AUTOCOMPLETE,
    AUTOCOMP_ADJ,
    CMD_NOT_AVAILABLE,
    CMD_M_PREFIX,
    CMD_gGF_PREFIX,
    CMD_PARAM,
    GENERALCMD,
    IFBURIED,
    INTERNALCMD,
    MOVEMENTCMD,
    PREFIXCMD,
    WIZMODECMD,
    extcmdlist,
} from './extcmdlist_data.js';
export { extcmds_match } from './cmd_autocomplete.js';
import { initialExtcmdFlags, parseautocomplete } from './cmd_autocomplete.js';
import {
    UnsupportedGetlinBoundaryError,
    tty_get_ext_cmd,
    tty_yn_function,
} from './getline.js';
import { game } from './gstate.js';
import { getnow } from './calendar.js';
import { getpos } from './getpos.js';
import {
    donamelevel,
    ledger_no,
    on_level,
    recalc_mapseen,
    u_on_rndspot,
} from './dungeon.js';
import {
    dist2,
    mungspaces,
    sgn,
    strstri,
    strsubst,
    upstart,
    visctrl,
} from './hacklib.js';
import {
    ddoinv,
    dolook,
    dopramulet,
    doprarm,
    doprgold,
    doprring,
    doprwep,
    carrying,
    getobj,
    hands_obj,
    UnsupportedFeatureDescriptionError,
    UnsupportedObjectPromptError,
} from './invent.js';
import {
    doattributes,
    remove_achievement,
    UnsupportedEnlightenmentError,
} from './insight.js';
import { dodiscovered, UnsupportedDiscoveryDisplayError } from './o_init.js';
import { donameFresh, UnsupportedObjectNameError } from './objnam.js';
import {
    doset_simple,
    dotogglepickup,
    toggle_bool_option,
    show_menu_controls,
    UnsupportedOptionMenuError,
} from './options.js';
import { dopray, UnsupportedPrayerError } from './pray.js';
import { UnsupportedHideError } from './mon.js';
import { dosave, dosave0, savelev } from './save.js';
import {
    dohelp,
    doquickwhatis,
    do_screen_description,
    dowhatis,
    UnsupportedHelpError,
    UnsupportedWhatisError,
} from './pager.js';
import { UnsupportedShopError } from './shk.js';
import { UnsupportedVaultGuardError } from './vault.js';
import { dofire, dothrow, UnsupportedThrowError } from './dothrow.js';
import { dosit, UnsupportedSitError } from './sit.js';
import {
    clear_kickedloc,
    dokick,
    UnsupportedKickError,
} from './dokick.js';
import {
    docast,
    dovspell,
    known_spell,
    spe_Fresh,
    spe_Unknown,
    spelleffects,
    UnsupportedSpellCastError,
    UnsupportedSpellDisplayError,
    UnsupportedSpellStudyError,
} from './spell.js';
import {
    UnsupportedWeaponSkillError,
    enhance_weapon_skill,
} from './weapon.js';
import {
    displayTtyTextWindow, menuTitleStyle,
} from './tty_menu.js';
import { add_menu_heading, getlin, select_menu } from './windows.js';
import {
    check_capacity,
    domove,
    dopickup,
    end_running,
    monster_nearby,
    preflightDomoveDestination,
    test_move,
    u_maybe_impaired,
    NODIAG,
    UnsupportedHeroMoveBoundaryError,
} from './hack.js';
import { nhgetch } from './input.js';
import { doride, Punished, UnsupportedSteedError } from './steed.js';
import { done2, UnsupportedEndOfGameError } from './end.js';
import { UnsupportedItemIgnitionError } from './apply_catch_lit.js';
import {
    acurr,
    exercise,
    UnsupportedAbilityChangeError,
} from './attrib.js';
import { UnsupportedExperienceChangeError } from './exper.js';
import {
    doread,
    UnsupportedMonsterRequestError,
    UnsupportedReadError,
} from './read.js';
import {
    UnsupportedPolyselfError, dobreathe, dogaze, dohide, domindblast,
    dopoly, doremove, dospinweb, dospit, dosummon,
} from './polyself.js';
import {
    wiz_genesis, wiz_intrinsic, wiz_level_change, wiz_level_tele,
    wiz_polyself, wiz_wish,
} from './wizcmds.js';
import {
    dozap,
    UnsupportedBhitError,
    UnsupportedWishError,
    UnsupportedZapError,
} from './zap.js';
import {
    doswapweapon,
    dotwoweapon,
    dowieldquiver,
    dowield,
    UnsupportedTwoWeaponError,
    UnsupportedWieldError,
    cantwield,
} from './wield.js';
import { rn1, rn2, rnd } from './rng.js';
import { dotalk, UnsupportedChatError } from './sounds.js';
import {
    clearTtyMessageWindow,
    ttyNorep,
    ttyPline,
    UnsupportedUrgentMessageError,
} from './tty_message.js';
import { tty_wait_synch } from './tty_rawprint.js';
import { do_write_config_file } from './cfgfiles.js';
import { note_unported } from './unported.js';
import {
    selection_floodfill,
    selection_new,
    set_selection_floodfillchk,
} from './themerooms.js';
import { canSpotMonster, collectLookaroundMessages, messageAt } from './startup_a11y.js';
import { cansee, vision_reset } from './vision.js';
import { m_at } from './monst.js';
import { linedup } from './mthrowu.js';
import { can_saddle, losedogs } from './dog.js';
import { which_armor } from './worn.js';
import { num_spells } from './startup_skills.js';
import { initrack } from './track.js';
import { check_special_room } from './rooms.js';
import { maybe_reset_pick } from './lock.js';
import { set_uinwater } from './hack.js';
import { GLYPH_UNEXPLORED_OFF } from './glyph_offsets.js';

export const MAX_COMMAND_COUNT = 32767;
// C ref: cmd.c extcmd_via_menu()'s choices[MAX_EXT_CMD + 1].
const MAX_EXT_CMD = 200;
const ESC = 0x1B;
const BACKSPACE = 0x08;
const DELETE = 0x7F;
const DOMOVE_WALK = 0x01;
const DOMOVE_RUSH = 0x02;
const ynchars = 'yn';
const ynqchars = 'ynq';
const ynaqchars = 'ynaq';
const rightleftchars = 'rl';
const hidespinchars = 'hsq';
export class UnsupportedHeroCommandBoundaryError extends Error {
    constructor(reason, key) {
        super(`unsupported hero command: ${reason}`);
        this.name = 'UnsupportedHeroCommandBoundaryError';
        this.reason = reason;
        this.key = key;
    }
}

// A branch the port has not reached, inside a command it did dispatch.
// failClosedCommand() below raises this by converting the owner's refusal;
// every other raiser of the parent class refused a command before dispatching
// it at all.
//
// The distinction has one consumer, scripts/scan-sessions.mjs, and it is not
// cosmetic there. That scan models what a session still owes the port by
// resolving the recorded bytes against ADMITTED_COMMANDS, which admits a
// command by its command byte alone. So the recorded input can name a command
// the port refuses to dispatch, and can never name a branch below one it
// dispatches: a stop here has to carry the port's own message as the
// behavior, the way a boundary raised outside any command does.
//
// The class body is empty because the identity is the whole addition. It
// keeps the parent's `name`, which labels the contract every other consumer
// reads -- js/jsmain.js ends the segment on it and leaves the keystroke
// retryable -- and that contract is identical here. The cause is what
// differs, and the message states it.
export class UnsupportedHeroCommandBranchBoundaryError
    extends UnsupportedHeroCommandBoundaryError {}

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

// C ref: cmd.c timed_occupation() (171-178). The occupation a count installs:
// it runs the command once more, spends one of the repeats parse() left in
// gm.multi, and answers 0 on the turn that empties it, which is how
// moveloop_core() learns to stop.
//
// C's `(*timed_occ_fn)()` passes no argument and discards the result, so
// neither the ECMD_* code the command answers -- ECMD_TIME for a search that
// ran -- nor the env moveloop_core() hands the occupation goes any further
// than this.
//
// The decrement is guarded because C's is. detect.c dosearch0():2048 calls
// nomul(0) when a search finds a secret door, so the callback can return with
// the count already spent; an unguarded decrement would take gm.multi below 0,
// which is the value moveloop_core():485 reads as a helpless hero.
async function timed_occupation(state) {
    await state.timedOccFn(state);
    if (state.multi > 0) state.multi--;
    return state.multi > 0 ? 1 : 0;
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
    state.go ??= {};
    if (xtime) {
        // cmd.c:208-210. A count makes timed_occupation() the occupation and
        // puts the command's own function in cmd.c's file-scope timed_occ_fn.
        // The port keeps that pointer on the state rather than in a module
        // variable, so that two game states in one process cannot share it;
        // like C's static it is left standing when an untimed occupation
        // replaces this one, because only timed_occupation() reads it.
        state.go.occupation = timed_occupation;
        state.timedOccFn = fn;
    } else {
        state.go.occupation = fn;
    }
    state.go.occtxt = txt;
    state.go.occtime = 0;
}

// C ref: cmd.c extcmd_initiator(). reset_commands() keeps gc.Cmd.extcmd_char
// at cmd_from_func(doextcmd), the key currently bound to the '#' row, which
// keyForCommand() ports.
export function extcmd_initiator(state = game) {
    return keyForCommand(commandBindings(state), '#');
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

        if (monster_nearby(state)) {
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

function pointerValue(pointer, fallback = 0) {
    return pointer && typeof pointer === 'object'
        ? pointer.value ?? fallback : pointer ?? fallback;
}

function setPointerValue(pointer, value) {
    if (pointer && typeof pointer === 'object') pointer.value = value;
}

// C ref: cmd.c readchar_core(). The browser input layer is the port's
// nh_poskey() implementation; it supplies a byte and has no mouse-position
// event, so x, y and mod remain the caller's values unless a test supplies a
// poskey event through state.poskey.
async function nh_poskey(x, y, mod, state) {
    const event = state.poskey;
    if (typeof event === 'function') {
        const result = await event(x, y, mod);
        if (result && typeof result === 'object') {
            setPointerValue(x, result.x);
            setPointerValue(y, result.y);
            setPointerValue(mod, result.mod);
            return result.key;
        }
        return result;
    }
    return nhgetch(state);
}

function queuedReadcharValue(state) {
    const queue = state.readchar_queue;
    if (!queue || (typeof queue !== 'string' && !Array.isArray(queue)))
        return null;
    if (!queue.length) return null;
    const value = typeof queue === 'string' ? queue.charCodeAt(0) : queue[0];
    state.readchar_queue = typeof queue === 'string'
        ? queue.slice(1) : queue.slice(1);
    return value;
}

async function readchar_core(x, y, mod, state = game) {
    state.iflags ??= {};
    state.program_state ??= {};
    let sym;

    if (state.iflags.debug_fuzzer) {
        // C's goto readchar_done skips Alt-meta and click handling for a
        // fuzzer-generated byte.
        sym = randomkey(state);
    } else {
        const queued = queuedReadcharValue(state);
        if (queued !== null) sym = queued;
        else if (state.in_doagain) sym = await pgetchar(state);
        else sym = await nh_poskey(x, y, mod, state);

        if (sym === ESC && state.iflags.altmeta
            && state.program_state.input_state !== 'other') {
            const followingQueue = queuedReadcharValue(state);
            const following = followingQueue === null
                ? await pgetchar(state) : followingQueue;
            if (following === 0 || following === ESC) sym = ESC;
            else sym = following | 0x80;
        }

        // The TTY reader maps NUL and EOF to Escape before this function sees
        // them. A supplied poskey event can still use zero for a mouse click.
        if (sym === 0) {
            state.clicklook_cc = { x: -1, y: -1 };
            click_to_cmd(
                pointerValue(x), pointerValue(y), pointerValue(mod), state,
            );
        }
    }

    state.program_state.input_state = 'other';
    return Number(sym) & 0xFF;
}

// C ref: cmd.c readchar(). The mouse-position outputs are discarded.
export async function readchar(state = game) {
    const x = { value: state.u?.ux ?? 0 };
    const y = { value: state.u?.uy ?? 0 };
    const mod = { value: 0 };
    return readchar_core(x, y, mod, state);
}

// C ref: cmd.c readchar_poskey(). getpos.c reads the three out parameters;
// callers in this port use the same mutable `{value}` shape as C pointers.
export async function readchar_poskey(x, y, mod, state = game) {
    state.program_state ??= {};
    state.program_state.input_state = 'getpos';
    return readchar_core(x, y, mod, state);
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

// C ref: cmd.c yn_menuable_resp(). JavaScript compares the five source
// strings by value because it has no C pointer identity. An omitted
// window_inited flag represents the initialized browser window; an explicit
// false keeps the C pre-window behavior.
function yn_menuable_resp(resp, state) {
    return Boolean(state.iflags?.query_menu)
        && state.iflags?.window_inited !== false
        && [ynchars, ynqchars, ynaqchars, rightleftchars, hidespinchars]
            .includes(resp);
}

function byteValue(value) {
    return typeof value === 'string' ? value.charCodeAt(0) : Number(value) || 0;
}

// C ref: cmd.c yn_func_menu_opt(). `win` is the array-backed menu window used
// by the JavaScript windows layer; C's `a_char` is the numeric item value.
function yn_func_menu_opt(win, key, text, def) {
    const keyByte = byteValue(key);
    win.push({
        selector: String.fromCharCode(keyByte),
        value: keyByte,
        label: text,
        selected: byteValue(def) === keyByte,
    });
}

// C ref: cmd.c yn_function_menu(). Returns null when the response set cannot
// use a menu, otherwise the selected response byte. Escape and an empty
// selection return the C default response.
async function yn_function_menu(query, resp, def, state = game) {
    if (!yn_menuable_resp(resp, state)) return null;

    const items = [];
    if (resp === rightleftchars) {
        yn_func_menu_opt(items, 'r', 'Right', def);
        yn_func_menu_opt(items, 'l', 'Left', def);
    } else if (resp === hidespinchars) {
        yn_func_menu_opt(items, 'h', 'Hide', def);
        yn_func_menu_opt(items, 's', 'Spin a web', def);
    } else {
        yn_func_menu_opt(items, 'y', 'Yes', def);
        yn_func_menu_opt(items, 'n', 'No', def);
    }
    if (resp === ynaqchars) yn_func_menu_opt(items, 'a', 'All', def);
    if (resp === ynqchars || resp === ynaqchars || resp === hidespinchars)
        yn_func_menu_opt(items, 'q', 'Quit', def);

    const selected = await select_menu(state, {
        items,
        how: PICK_ONE,
        title: query,
        ...menuTitleStyle(state),
        cancelValue: byteValue(def),
        behavior: MENU_BEHAVE_STANDARD,
    });
    const result = selected === null || selected === undefined
        ? byteValue(def) : byteValue(selected);
    await ttyPline(`${query} ${key2txt(result)}`, state);
    clearTtyMessageWindow(state);
    return result;
}

// C ref: cmd.c yn_function() (5471-5578). The ordinary user-input arm reads
// through tty_yn_function() and, when addcmdq is true, records the answer in
// CQ_REPEAT. Both unrestricted whatdoes input and restricted y_n input reach
// that write. The queued-answer arm also matters to canned commands and to
// do_repeat(); getdir() passes addcmdq FALSE, exactly as C does at 3989.
// iflags.debug_fuzzer is never set, leaving the window port's reader as the
// only live input source.
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
    const queue = state.in_doagain ? CQ_REPEAT : CQ_CANNED;
    const queued = addcmdq ? cmdq_peek(queue, state) : null;
    let fromQueue = false;
    let res;
    if (queued?.typ === CMDQ_KEY) {
        cmdq_pop(state);
        res = queued.key;
        fromQueue = true;
    } else if (queued?.typ === CMDQ_USER_INPUT) {
        // CMDQ_USER_INPUT is an explicit prompt handoff; C consumes it and
        // then reads the answer from the window port.
        cmdq_pop(state);
    } else if (queued) {
        // C treats any other queued node as an impossible prompt answer,
        // clears the canned queue, and returns Escape without prompting.
        cmdq_pop(state);
        cmdq_clear(CQ_CANNED, state);
        res = ESC;
        fromQueue = true;
    } else {
        const menuResult = await yn_function_menu(query, resp, def, state);
        res = menuResult === null
            ? await tty_yn_function(query, resp, def, state)
            : menuResult;
    }
    if (!fromQueue && res === undefined)
        res = await tty_yn_function(query, resp, def, state);
    if (addcmdq && !fromQueue) cmdq_add_key(CQ_REPEAT, res, state);
    // "in case we're called via getdir() which sets input_state".
    state.program_state.input_state = 'other';
    return res;
}

// C ref: hack.h:1329 y_n(), over decl.c ynchars[]. The accepted byte is saved
// in CQ_REPEAT so a future #repeat implementation can replay the same answer.
export async function y_n(query, state = game) {
    return yn_function(query, ynchars, 'n', true, state);
}

// C ref: cmd.c paranoid_ynq() (5587-5650). "for paranoid_confirm:quit,die,
// attack,&c prompting; allows yes, n|no, or q|quit; result is one of 'y' or
// 'n' or 'q'; ESC yields 'q'".
//
// `be_paranoid` switches this query from a key to a spelled-out answer. That
// arm always requires "yes" spelled out. The separate ParanoidConfirm bit
// also requires "no" spelled out and permits five retries after an invalid
// answer; without it, one non-"yes", non-"quit" answer defaults to no. pray.c
// first tests ParanoidPray and passes ParanoidConfirm; end.c passes ParanoidDie
// directly. The spelled-out arm uses a different prompt, reader, and history
// entry from the single-key arm, so it stops rather than being approximated.
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

function externalCommandStarted(state) {
    state.urealtime ??= {
        realtime: 0,
        start_timing: getnow(state),
        finish_time: 0,
    };
    const now = getnow(state);
    state.urealtime.realtime += now - state.urealtime.start_timing;
    state.urealtime.start_timing = now;
}

// C ref: cmd.c dosuspend_core(). The browser window has no suspend-capable
// window port, so the normal tty path reports the same unavailable command.
// A test or future window port can expose the C callback shape; its discarded
// platform operation remains an explicit gap while the clock bookkeeping is
// preserved here.
export async function dosuspend_core(state = game) {
    const canSuspend = state.windowprocs?.win_can_suspend?.() === true;
    if (canSuspend) {
        externalCommandStarted(state);
        note_unported('sys/share/ioctl.c dosuspend');
        state.urealtime.start_timing = getnow(state);
    } else {
        await ttyNorep("'#suspend' command not available.", state);
    }
    return ECMD_OK;
}

// C ref: cmd.c dosh_core(). The subprocess is outside the browser runtime;
// keep the elapsed-time boundaries and record the discarded dosh() call.
export async function dosh_core(state = game) {
    externalCommandStarted(state);
    note_unported('sys/unix/unixunix.c dosh');
    state.urealtime.start_timing = getnow(state);
    return ECMD_OK;
}

// C ref: cmd.c dummyfunction(). rhack() initializes its function pointer with
// this cost-free cancellation result before it resolves a command row.
export function dummyfunction() {
    return ECMD_CANCEL;
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

// C ref: cmd.c key2extcmddesc() (2561-2615). This keeps source evaluation
// order: the three movecmd() probes precede the count, special-key, and
// regular-command lookups. A failed probe clears u.dz, which is an observable
// C side effect even for the ordinary inventory key used by dowhatdoes().
export function key2extcmddesc(key, state = game) {
    const byte = key & 0xFF;
    const model = commandBindings(state);
    let description = '';
    if (movecmd(byte, MV_WALK, state)) description = 'move';
    else if (movecmd(byte, MV_RUSH, state)) description = 'rush';
    else if (movecmd(byte, MV_RUN, state)) description = 'run';
    if (description) return description;

    const unmeta = byte & 0x7F;
    const isDigit = (value) => value >= 0x30 && value <= 0x39;
    if (isDigit(byte) || (model.numPad && isDigit(unmeta))) {
        if (!model.numPad) {
            return 'start of, or continuation of, a count';
        }
        const metaFive = 0x35 | 0x80;
        const metaZero = 0x30 | 0x80;
        if (byte === 0x35 || byte === metaFive) {
            const run = Boolean(model.pcHack) !== (byte === metaFive);
            return `${run ? 'run' : 'rush'} prefix`;
        }
        if (byte === 0x30 || (model.pcHack && byte === metaZero))
            return "synonym for 'i'";
    }

    if (byte === model.specialKeys.escape)
        return 'cancel current prompt or pending prefix';
    if (model.numPad && byte === model.specialKeys.count) {
        return 'Prefix: for digits when preceding a command with a count';
    }

    const command = commandForKey(model, byte);
    const entry = command === null ? null : EXTCMD_BY_NAME.get(command);
    if (!entry?.ef_txt) return null;
    let result = `${entry.ef_desc} (#${entry.ef_txt})`;
    if (result.toLowerCase().startsWith('prefix:')
        && entry.ef_txt.toLowerCase() === 'reqmenu') {
        result = 'movement prefix: move without autopickup and without '
            + 'attacking\nnon-movement prefix:' + result.slice(7);
    }
    return result.replace(' (##)', '');
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

// C ref: cmd.c confdir() (4300-4310). Cardinal directions occupy the first
// half of dirs_ord[], which preserves the distinct draw range for NODIAG
// forms.
export function confdir(force_impairment, state = game) {
    if (force_impairment || u_maybe_impaired(state)) {
        const kmax = NODIAG(state.u.umonnum) ? N_DIRS / 2 : N_DIRS;
        const k = dirs_ord[rn2(kmax)];
        state.u.dx = xdir[k];
        state.u.dy = ydir[k];
    }
}

// C ref: cmd.c show_direction_keys() (4121-4165). Appends a direction-key
// diagram to `lines` (an array of {text} objects for displayTtyTextWindow).
// `centerchar` is '.' when help_dir is showing a non-prefix prompt, or ' '
// when showing prefix help. `nodiag` is true for grid bugs.
function show_direction_keys(lines, centerchar, nodiag, state = game) {
    const model = commandBindings(state);
    // C ref: cmd_from_func(do_move_*) returns the key currently bound to each
    // movement command; visctrl() renders control characters as ^X.
    const k = (cmd) => visctrl(keyForCommand(model, cmd));
    if (!centerchar) centerchar = ' ';

    if (nodiag) {
        lines.push({ text: `             ${k('movenorth')}   ` });
        lines.push({ text: '             |   ' });
        lines.push({ text:
            `          ${k('movewest')}- ${centerchar} -${k('moveeast')}` });
        lines.push({ text: '             |   ' });
        lines.push({ text: `             ${k('movesouth')}   ` });
    } else {
        lines.push({ text:
            `          ${k('movenorthwest')}  ${k('movenorth')}  ${k('movenortheast')}` });
        lines.push({ text: '           \\ | / ' });
        lines.push({ text:
            `          ${k('movewest')}- ${centerchar} -${k('moveeast')}` });
        lines.push({ text: '           / | \\ ' });
        lines.push({ text:
            `          ${k('movesouthwest')}  ${k('movesouth')}  ${k('movesoutheast')}` });
    }
}

// C ref: cmd.c keylist_func_has_key() (2784-2797). The source compares the
// extcmdlist row stored in each binding, so this port compares its unique
// ef_txt rather than the handler name shared by aliases such as call/name.
function keylist_func_has_key(entry, skipKeysUsed, model) {
    for (let key = 0; key < 256; ++key) {
        if (skipKeysUsed[key]) continue;
        if (commandForKey(model, key) === entry.ef_txt) return true;
    }
    return false;
}

// C ref: cmd.c keylist_putcmds() (2799-2857). In count mode this returns the
// number of rows without changing keysUsed; display mode appends the same rows
// and reserves each keyed byte for the later command categories.
function keylist_putcmds(lines, docount, inclFlags, exclFlags, keysUsed,
    model) {
    const keysAlreadyUsed = Uint8Array.from(keysUsed);
    const rowsByName = new Map(extcmdlist.map((entry) => [entry.ef_txt, entry]));
    let count = 0;

    for (let key = 0; key < 256; ++key) {
        if (keysUsed[key]) continue;
        if (key === 0x20 && !model.restOnSpace) continue;
        const command = commandForKey(model, key);
        const entry = command === null ? null : rowsByName.get(command);
        if (!entry) continue;
        if ((inclFlags && !(entry.flags & inclFlags))
            || (exclFlags && (entry.flags & exclFlags))) {
            continue;
        }
        if (docount) {
            ++count;
            continue;
        }
        // No compiled-in binding carries CMD_PARAM. Its quoted parameter is
        // stored on C's Cmd_bind node, which the bounded default model does
        // not need; reject that excluded custom-binding variant explicitly.
        if (entry.flags & CMD_PARAM) {
            throw new UnsupportedHelpError(
                'a parameterized custom binding in the key list',
            );
        }
        lines.push({ text:
            `${key2txt(key).padEnd(7)} ${entry.ef_txt.padEnd(13)} ${entry.ef_desc}` });
        keysUsed[key] = 1;
    }

    for (const entry of extcmdlist) {
        if ((inclFlags && !(entry.flags & inclFlags))
            || (exclFlags && (entry.flags & exclFlags))) {
            continue;
        }
        if (keylist_func_has_key(entry, keysAlreadyUsed, model)) continue;
        if (docount) {
            ++count;
            continue;
        }
        lines.push({
            text: `#${entry.ef_txt.padEnd(20)} ${entry.ef_desc}`,
        });
    }
    return count;
}

// C ref: cmd.c dokeylist() (2859-3013). This slice admits the recorder's
// default non-number-pad, no-rest-on-space, non-debug binding set. The data
// flow remains source-shaped so the complete 256-byte traversal and category
// ordering stay visible beside extcmdlist_data.js.
export function keyBindingLines(state = game) {
    const model = commandBindings(state);
    const lines = [];
    const keysUsed = new Uint8Array(256);
    const pfxSeen = new Uint16Array(256);

    // This build has signal handling, so Ctrl-C is reserved before movement
    // and miscellaneous keys are classified.
    keysUsed[0x03] = 1;
    const movSeen = Uint8Array.from(keysUsed);

    const miscKeys = [
        { index: 0, name: 'escape', desc: 'cancel current prompt or pending prefix', numpad: false },
        { index: 5, name: 'count', desc: 'Prefix: for digits when preceding a command with a count', numpad: true },
    ];
    let spkeyGap = false;
    for (const item of miscKeys) {
        if (item.numpad && !model.numPad) continue;
        const key = model.specialKeys[item.name] & 0xFF;
        if (key && !movSeen[key] && !pfxSeen[key]) {
            keysUsed[key] = 1;
            pfxSeen[key] = item.index;
        } else {
            spkeyGap = true;
        }
    }

    lines.push({ text: '' });
    lines.push({ text: '            Full Current Key Bindings List' });
    if (extcmdlist.some((entry) => (
        spkeyGap || !keylist_func_has_key(entry, keysUsed, model)
    ))) {
        lines.push({ text: '        (also commands with no key assignment)' });
    }

    lines.push({ text: '' });
    lines.push({ text: 'Directional keys:' });
    show_direction_keys(lines, '.', false, state);
    lines.push({ text: '' });
    lines.push({
        text: 'Ctrl+<direction> will run in specified direction until something very',
    });
    lines.push({ text: '        interesting is seen.' });
    lines.push({
        text: 'Shift+<direction> will run in specified direction until you encounter',
    });
    lines.push({ text: '        an obstacle.' });

    lines.push({ text: '' });
    lines.push({ text: 'Miscellaneous keys:' });
    for (const item of miscKeys) {
        if (item.numpad && !model.numPad) continue;
        const key = model.specialKeys[item.name] & 0xFF;
        if (key && !movSeen[key] && pfxSeen[key] === item.index) {
            lines.push({ text: `${key2txt(key).padEnd(7)} ${item.desc}` });
        }
    }
    lines.push({
        text: `${key2txt(0x03).padEnd(7)} interrupt: break out of NetHack (SIGINT)`,
    });

    lines.push({ text: '' });
    show_menu_controls(lines, true, state);

    const ignoreCommands = WIZMODECMD | INTERNALCMD | MOVEMENTCMD;
    if (keylist_putcmds(
        lines, true, GENERALCMD, ignoreCommands, keysUsed, model,
    )) {
        lines.push({ text: '' });
        lines.push({ text: 'General commands:' });
        keylist_putcmds(
            lines, false, GENERALCMD, ignoreCommands, keysUsed, model,
        );
    }
    if (keylist_putcmds(
        lines, true, 0, GENERALCMD | ignoreCommands, keysUsed, model,
    )) {
        lines.push({ text: '' });
        lines.push({ text: 'Game commands:' });
        keylist_putcmds(
            lines, false, 0, GENERALCMD | ignoreCommands, keysUsed, model,
        );
    }
    if (state.wizard && keylist_putcmds(
        lines, true, WIZMODECMD, INTERNALCMD, keysUsed, model,
    )) {
        lines.push({ text: '' });
        lines.push({ text: 'Debug mode commands:' });
        keylist_putcmds(
            lines, false, WIZMODECMD, INTERNALCMD, keysUsed, model,
        );
    }
    return lines;
}

export async function dokeylist(state = game) {
    await displayTtyTextWindow(state, keyBindingLines(state));
}

// C ref: cmd.c doc_extcmd_flagstr() (524-558). The empty-entry call appends
// its two source footnotes; an ordinary entry returns the four-character flag
// field which doextlist() right-aligns below.
function doc_extcmd_flagstr(entry, flags, state = game) {
    if (!entry) {
        const prefix = visibleCommandKey(
            keyForCommand(commandBindings(state), 'reqmenu'),
        );
        return [
            { text: '[A] Command autocompletes' },
            { text: `[m] Command accepts '${prefix}' prefix` },
        ];
    }
    const mprefix = Boolean(flags & CMD_M_PREFIX);
    const autocomplete = Boolean(flags & AUTOCOMPLETE);
    return mprefix || autocomplete
        ? `[${mprefix ? 'm' : ''}${autocomplete ? 'A' : ''}]`
        : '';
}

// C ref: cmd.c doextlist() (562-707), through its first non-debug,
// empty-search pass. The controls remain selectable so doextlist() can stop
// at the precise input which enters the excluded toggle and search modes.
export function extendedCommandListLines(state = game) {
    const lines = [
        { text: 'Extended Commands List' },
        { text: '' },
        { text: "a - Switch to excluding commands that don't autocomplete" },
        { text: ': - Search extended commands' },
        { text: '' },
    ];
    let headingAdded = false;
    let count = 0;
    for (let index = 0; index < extcmdlist.length; ++index) {
        const entry = extcmdlist[index];
        const flags = state.extcmdFlags?.[index] ?? entry.flags;
        if (flags & (CMD_NOT_AVAILABLE | INTERNALCMD)) continue;
        if (flags & WIZMODECMD) continue;

        if (!headingAdded) {
            lines.push(add_menu_heading('Extended commands', state));
            headingAdded = true;
        }
        let description = entry.ef_desc;
        if (!state.wizard && !state.discover
            && (flags & GENERALCMD)
            && strstri(description, 'extinct') >= 0) {
            description = strsubst(
                description,
                ' been genocided or become extinct',
                ' been genocided',
            );
        }
        const flagText = doc_extcmd_flagstr(entry, flags, state);
        lines.push({
            text: ` ${entry.ef_txt.padEnd(14)} ${flagText.padStart(4)} ${description}`,
        });
        ++count;
    }
    if (count) lines.push({ text: '' });
    lines.push(...doc_extcmd_flagstr(null, 0, state));
    return lines;
}

export async function doextlist(state = game) {
    if (state.wizard) {
        throw new UnsupportedHelpError(
            'debug sections in the extended-command list',
        );
    }
    const choice = await select_menu(state, {
        how: PICK_ONE,
        title: null,
        lines: extendedCommandListLines(state),
        choices: new Map([['a', 1], [':', 2]]),
        overlay: state.iflags?.menu_overlay !== false,
        cancelValue: null,
    });
    if (choice !== null) {
        throw new UnsupportedHelpError(
            choice === 1
                ? 'the extended-command autocomplete toggle'
                : 'extended-command list search',
        );
    }
    return ECMD_OK;
}

// C ref: cmd.c help_dir() (4170-4296). Displays direction help when cmdassist
// is enabled and the player types an invalid direction key. Called from
// getdir() at cmd.c:4101.
//
// The #if 0 block (lines 4195-4227) is dead code in the C source; skipped.
// The dowhatdoes_core() ctrl-key suggestion branch (lines 4243-4261) is
// unreachable when sym == '\0' because letter('\0') is false; left as a
// deferred stub.
// The help_requested retry path (goto retry at cmd.c:4106) is not exercised
// by any witness session; deferred.
async function help_dir(sym, spkey, msg, state = game) {
    const model = commandBindings(state);
    const prefixhandling = (spkey !== model.specialKeys.escape);
    // nhUse(prefixhandling) -- the #if 0 block's prefix tests are dead code.

    const lines = [];

    // When msg is non-null and buf is empty (no prefix handling wrote to it),
    // show "cmdassist: <msg>".
    if (msg) {
        lines.push({ text: `cmdassist: ${msg}` });
        lines.push({ text: '' });
    }

    // The dowhatdoes_core() ctrl-key suggestion is unreachable when sym is
    // '\0' (null byte) because C's letter() returns false for it. Both witness
    // sessions pass sym='\0'. Stub the branch.
    if (!prefixhandling && sym !== 0
        && ((sym >= 0x41 && sym <= 0x5A)     // A-Z
            || (sym >= 0x61 && sym <= 0x7A)  // a-z
            || sym === 0x40                  // @
            || sym === 0x5B)) {              // [
        // dowhatdoes_core() suggestion -- deferred.
    }

    const nodiag = NODIAG(state.u.umonnum);
    lines.push({ text:
        `Valid direction keys${prefixhandling ? ' to ' : ''}${prefixhandling ? 'do that' : ''}${nodiag ? ' in your current form' : ''} are:` });
    show_direction_keys(lines, !prefixhandling ? '.' : ' ', nodiag, state);

    if (!prefixhandling) {
        lines.push({ text: '' });
        lines.push({ text: '          <  up' });
        lines.push({ text: '          >  down' });
        // C: int selfi = gc.Cmd.num_pad ? NHKF_GETDIR_SELF2 : NHKF_GETDIR_SELF
        const selfi = state.iflags.num_pad
            ? 'getdir.self2' : 'getdir.self';
        lines.push({ text:
            `       ${visctrl(model.specialKeys[selfi]).padStart(4)}  direct at yourself` });
    }

    if (msg) {
        lines.push({ text: '' });
        lines.push({ text:
            '(Suppress this message with !cmdassist in config file.)' });
    }

    await displayTtyTextWindow(state, lines);
    return true;
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
// Three inputs stop here. The simulated-mouse key needs getpos(); '^R' needs
// docrt_flags() and the retry loop above got_dirsym; and confdir() stops for
// an impaired hero. help_dir() is ported and displays the direction-key window
// when cmdassist is set (the default). The help_requested retry path
// (cmd.c:4106 goto retry) is deferred.
export async function getdir(s, state = game) {
    const u = state.u;
    state.program_state ??= {};
    // C ref: getdir():3962-4019. A queued direction or key jumps to
    // got_dirsym, skipping the prompt and its repeat record. Other queued
    // nodes are consumed and make the direction invalid.
    const queued = cmdq_pop(state);
    let dirsym;
    if (queued?.typ === CMDQ_DIR) {
        const index = queued.dz
            ? (queued.dz > 0 ? 8 : 9)
            : xytodir(queued.dx, queued.dy);
        const directionChars = state.dirchars ?? 'hykulnjb><';
        dirsym = directionChars.charCodeAt(index);
    } else if (queued?.typ === CMDQ_KEY) {
        dirsym = queued.key;
    } else if (queued) {
        cmdq_clear(CQ_CANNED, state);
        dirsym = 0;
    }
    // retry: -- only the '^R' arm jumps back here, and it is refused below.
    if (dirsym === undefined) {
        state.program_state.input_state = 'getdir';
        if (state.in_doagain || state.readchar_queue)
            dirsym = await readchar(state);
        else
            dirsym = await yn_function(
                (s && s[0] !== '^') ? s : 'In what direction?',
                null,
                '\0',
                false,
                state,
            );
        // "remove the prompt string so caller won't have to"
        clearTtyMessageWindow(state);
    }

    if (redraw_cmd(dirsym, state)) {
        throw new UnsupportedDirectionBoundaryError(
            "'^R' repaints the screen and reissues the direction prompt",
        );
    }
    // C jumps straight to got_dirsym for every queued node, so only a
    // direction read from the prompt is recorded for a later do-again.
    if (!queued && !state.in_doagain)
        cmdq_add_key(CQ_REPEAT, dirsym, state);

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
            let did_help = false;
            if (!quitchars.includes(String.fromCharCode(dirsym))) {
                const help_requested = dirsym === spkeys['getdir.help'];
                if (help_requested || state.iflags.cmdassist) {
                    // help_dir()'s `!viawindow` early return is inside an
                    // `#if 0` block, so with cmdassist set it always opens a
                    // window and always answers TRUE.
                    did_help = await help_dir(
                        (s && s[0] === '^') ? dirsym : 0,
                        spkeys.escape,
                        help_requested ? null : 'Invalid direction key!',
                        state,
                    );
                    if (help_requested) {
                        // The C source jumps to `retry:` (cmd.c:4106),
                        // re-prompting for a direction. Not exercised by any
                        // witness session; deferred.
                        throw new UnsupportedDirectionBoundaryError(
                            'help_requested retry path re-prompts for direction',
                        );
                    }
                }
                if (!did_help) {
                    await ttyPline('What a strange direction!', state);
                }
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

// C ref: cmd.c get_count() (5018-5089). `allowchars` is a string of accepted
// terminators; null accepts any non-digit. C's AppendLongDigit() returns -1
// on overflow, which the caller changes back to zero before applying its
// positive maximum.
export async function get_count(
    allowchars = null,
    inkey = 0,
    maxcount = LARGEST_INT,
    countOut = null,
    gcFlags = 0,
    state = game,
) {
    state.program_state ??= {};
    const savedInputState = state.program_state.input_state;
    let key = inkey;
    let count = 0;
    let committedCount = 0;
    let first = inkey ? inkey - 0x30 : 0;
    let backspaced = false;
    let showzero = true;
    const historicmsg = (gcFlags & GC_SAVEHIST) !== 0;
    const conditionalmsg = (gcFlags & GC_CONDHIST) !== 0;
    const echoalways = (gcFlags & GC_ECHOFIRST) !== 0;
    const escape = commandBindings(state).specialKeys.escape ?? ESC;

    const storeCount = (value) => {
        committedCount = value;
        if (countOut && typeof countOut === 'object') countOut.value = value;
    };
    const appendLongDigit = (value, digitValue) => {
        const appended = value * 10 + digitValue;
        return appended > Number.MAX_SAFE_INTEGER ? -1 : appended;
    };

    for (;;) {
        if (inkey) {
            key = inkey;
            inkey = 0;
        } else {
            state.program_state.input_state = savedInputState;
            key = await readchar(state);
        }

        if (isDigit(key)) {
            const dgt = key - 0x30;
            count = appendLongDigit(count, dgt);
            if (count < 0) count = 0;
            else if (maxcount > 0 && count > maxcount) count = maxcount;
            showzero = key === 0x30;
        } else if (key === BACKSPACE || key === DELETE) {
            if (!count && !echoalways) break;
            showzero = false;
            count = Math.trunc(count / 10);
            backspaced = true;
        } else if (key === escape) {
            break;
        } else if (!allowchars || allowchars.includes(String.fromCharCode(key))) {
            storeCount(count);
            break;
        }

        if (count > 9 || backspaced || echoalways) {
            clearTtyMessageWindow(state);
            let countMessage;
            if (backspaced && !count && !showzero) {
                countMessage = 'Count: ';
            } else {
                countMessage = `Count: ${count}`;
                backspaced = false;
            }
            await ttyPline(countMessage, state);
            await flush_screen(1);
            state.nhDisplay?.setCursor(countMessage.length, 0);
        }
    }

    const resultCount = countOut && typeof countOut === 'object'
        ? countOut.value ?? 0 : committedCount;
    if (historicmsg || (conditionalmsg && resultCount !== first)) {
        const historyLine = `Count: ${resultCount} ${key2txt(key)}`;
        state.messageHistory ??= [];
        state.messageHistory.push(historyLine);
    }
    return { key, count: resultCount };
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
    return parse(state);
}

// C ref: cmd.c parse() (5093-5156). The wrapper above keeps the existing
// JavaScript callers named `parseCommand`; this source-named function owns the
// command-count and input-state transitions from C.
export async function parse(state = game) {
    await beginCommandParse(state);
    try {
        let key;
        if (!state.iflags.num_pad || (key = await readchar(state))
            === commandBindings(state).specialKeys.count) {
            state.program_state.input_state = 'command';
            const countOut = { value: 0 };
            key = await get_count(
                null, 0, LARGEST_INT, countOut, 0, state,
            );
            return finishCommandParse(
                { key: key.key, count: countOut.value }, state,
            );
        }
        return finishCommandParse({ key, count: 0 }, state);
    } catch (error) {
        abortCommandParse(state);
        throw error;
    }
}

// C ref: cmd.c hangup() (5159-5185). The terminal hangup swap has no browser
// equivalent; the saved flags and deferred-save decision remain observable.
export function hangup(_sig = 0, state = game) {
    state.program_state ??= {};
    if (state.program_state.exiting) state.program_state.in_moveloop = 0;
    state.program_state.done_hup = (state.program_state.done_hup ?? 0) + 1;
    if (state.program_state.in_moveloop
        && state.program_state.something_worth_saving) return;
    return end_of_input(state);
}

// C ref: cmd.c end_of_input() (5188-5212). The JavaScript runner observes
// `gameover` as nh_terminate(EXIT_SUCCESS); clearlocks and sound shutdown have
// no stateful browser implementation.
export function end_of_input(state = game) {
    state.program_state ??= {};
    if (In_tutorial(state.u?.uz))
        state.program_state.something_worth_saving = 0;
    if (state.program_state.something_worth_saving
        && !state.program_state.done_hup_saved) {
        dosave0(state);
        state.program_state.done_hup_saved = true;
    }
    state.program_state.in_moveloop = 0;
    state.program_state.exiting = 1;
    state.program_state.gameover = true;
    return ECMD_OK;
}

// Every command this seam dispatches from the key bound to it, named once so
// the comment above admitParsedCommand(), both boundary messages, and the
// admission test cannot drift apart as more commands land. '#' opens the
// extended-command prompt, through which every other name in the list is also
// reachable; every other extended command stops inside doextcmd() instead,
// after the prompt has painted the frames the reference program painted for
// the same keystrokes.
//
// 'fight', 'reqmenu', 'rush', and 'run' are the PREFIXCMD rows this seam
// admits. Each
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
    'eat', 'engrave', 'apply', 'rub', 'open', 'close', 'down', 'up', 'drop', 'pickup',
    'takeoff', 'wear',
    'puton', 'quaff', 'read', 'zap', 'cast', 'reqmenu', 'fight', 'rush', 'run', 'repeat',
    'options', 'autopickup',
    'wizwish', 'wizlevelport', 'wizgenesis', 'wizintrinsic', 'fire', 'throw',
    'swap', 'kick',
    'save', 'wield', 'quiver', 'help', 'whatis', '#', 'loot', 'force', 'tip',
    'glance', 'showgold', 'seeweapon', 'seearmor', 'seerings', 'seeamulet', 'teleport',
    'terrain', 'travel', 'dip', 'invoke', 'untrap', 'herecmdmenu', 'therecmdmenu',
]);
const ADMITTED_BOUNDARY = 'the repeated-command boundary admits only '
    + `${ADMITTED_COMMANDS.join(', ')}, a one-square walk, a shift-direction `
    + 'run, a ctrl-direction rush, or a byte bound to no command';
// The count a command carries is refused separately, below, because parse()
// admits the count before the command it modifies is even known.
const COUNTED_BOUNDARY = 'cmd.c parse() committed a count leaving gm.multi '
    + 'above 0 before a row this port will not repeat, which allmain.c '
    + 'moveloop_core():515-531 turns into a repeat of the command; that arm '
    + 'is not ported';
// context.run values this boundary dispatches. cmd.c set_move_cmd() takes the
// value from the command the key is bound to: 0 for do_move_<dir>, 1 for
// do_run_<dir>, which the shift-direction keys use, and 3 for do_rush_<dir>
// at cmd.c:1461-1512, which the ctrl-direction keys use.
//
// Two values are not movement-row values: 2, which do_rush() sets behind the
// `g` prefix, and 8, which dotravel_target() sets.
export const ADMITTED_RUN_MODES = Object.freeze([0, 1, 3]);

// A byte that cmd.c cmdbind_get() finds no command for reaches rhack()'s
// bad-command path, which this file owns: it prints "Unknown command" at
// cmd.c:3834, clears the canned and repeat queues at 3835-3836, and zeroes
// gm.multi at 3841. A count parsed ahead of such a byte therefore needs
// nothing beyond what is already ported, which is why the count refusal below
// spares it.
function unboundCommandKey(key, command) {
    if (command !== null) return false;
    // Escape is admitted by its own test below: it never reaches the
    // bad-command path, because rhack() returns at its empty-key test before
    // looking a command up. The two empty-key values stay refused; C rings the
    // bell for them and nhbell() is not ported. Only 0377 can arrive at this
    // test, because js/input.js nhgetch() substitutes ESC for NUL below
    // readchar(), as win/tty/wintty.c tty_nhgetch():4093-4098 does; the other
    // half is written out because rhack():3661 tests it.
    return Boolean(key) && key !== 0xFF;
}

// ADMITTED_COMMANDS above lists what the port dispatches; a one-square walk
// and a byte bound to no command join them here. parse() has already run when
// this is called, so the byte classified here is the command byte parse()
// returned, never a count digit get_count() consumed ahead of it.
function admitParsedCommand(key, state) {
    const command = commandForKey(commandBindings(state), key);
    const movement = MOVEMENT_INTENTS[command];
    // parse() answers Escape by clearing the message window and zeroing both
    // count fields, which finishCommandParse() already does, and rhack() then
    // returns without a message or a turn.
    const admitted = key === ESC
        || ADMITTED_COMMANDS.includes(command)
        || (movement && ADMITTED_RUN_MODES.includes(movement[2]))
        || unboundCommandKey(key, command);
    if (!admitted) {
        resetCommandVars(state);
        throw new UnsupportedHeroCommandBoundaryError(ADMITTED_BOUNDARY, key);
    }
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
// CQ_REPEAT records the command sequence that #repeat replays. cmdq_pop() reads
// it only while state.in_doagain is set; prompt answers also append their raw
// keys there for the same replay path. getdir()'s separate source write remains
// outside this boundary.
//
// CMDQ_EXTCMD and CMDQ_KEY nodes are produced by live callers. The remaining
// node constructors stay source-shaped here because spell and Lua command
// paths can queue them even when the current recorder does not.
// cmdq_add_key() is called by itemactions_pushkeys() (iactions.c) to
// queue the inventory letter for the command the player chose from the
// item-actions menu. rhack() below classifies every node type the way C
// does, because the queue is state and a future adder must not silently
// change what a stale node means.
function commandQueue(state) {
    state.command_queue ??= [[], []];
    return state.command_queue;
}

// C ref: cmd.c doprev_message() (164-169). The window-port helper's return
// value is discarded by C, so record the missing callee and preserve the
// command's non-time-consuming result.
export function doprev_message(state = game) {
    note_unported('nhwindows.c nh_doprev_message');
    return ECMD_OK;
}

// C appends at the tail and pops from the head, so a canned sequence runs in
// the order it was pushed.
export function cmdq_add_ec(q, entry, state = game) {
    if (!entry || typeof entry.ef_funct !== 'string') {
        throw new TypeError('cmdq_add_ec() requires an extcmdlist row');
    }
    commandQueue(state)[q].push({ typ: CMDQ_EXTCMD, ec_entry: entry });
}

// C ref: cmd.c cmdq_add_key() (286-295). Pushes a single key onto the
// command queue. itemactions_pushkeys() (iactions.c) uses this to queue
// the inventory letter that identifies the object the player chose.
export function cmdq_add_key(q, key, state = game) {
    commandQueue(state)[q].push({ typ: CMDQ_KEY, key });
}

// C ref: cmd.c cmdq_add_dir() (294-315). The direction fields are kept as
// three separate values because getdir() can queue a vertical direction too.
export function cmdq_add_dir(q, dx, dy, dz, state = game) {
    commandQueue(state)[q].push({ typ: CMDQ_DIR, dx, dy, dz });
}

// C ref: cmd.c cmdq_add_userinput() (317-329). A user-input node carries no
// payload in C; the consumer obtains the answer from its owning prompt.
export function cmdq_add_userinput(q, state = game) {
    commandQueue(state)[q].push({ typ: CMDQ_USER_INPUT });
}

// C ref: cmd.c cmdq_add_int() (331-343). Keep the integer separate from a key
// so a queued count cannot be mistaken for a command byte.
export function cmdq_add_int(q, value, state = game) {
    commandQueue(state)[q].push({ typ: CMDQ_INT, value });
}

// C ref: cmd.c cmdq_shift() (345-360). The JS queue is an array, so moving
// its tail to the head is the linked-list operation's direct equivalent.
export function cmdq_shift(q, state = game) {
    const queue = commandQueue(state)[q];
    if (queue.length > 1) queue.unshift(queue.pop());
}

function recordRepeatCommand(command, prefixed, state) {
    if (state.in_doagain || command === 'repeat' || command === '#') return;
    const entry = EXTCMD_BY_NAME.get(command);
    if (!entry) return;
    if (!prefixed) cmdq_clear(CQ_REPEAT, state);
    cmdq_add_ec(CQ_REPEAT, entry, state);
}

// C ref: cmd.c cmdq_reverse() (362-378). This helper accepts the source-shaped
// linked list used by direct callers as well as a JS queue array.
export function cmdq_reverse(head) {
    if (Array.isArray(head)) return head.reverse();
    let previous = null;
    let current = head;
    while (current) {
        const next = current.next;
        current.next = previous;
        previous = current;
        current = next;
    }
    return previous;
}

// C ref: cmd.c cmdq_copy() (380-404). C allocates a fresh linked list; the
// array-backed queue owns the equivalent fresh node array here.
export function cmdq_copy(q, state = game) {
    return commandQueue(state)[q].map((node) => ({ ...node }));
}

// C ref: cmd.c cmdq_print() (220-250). The original definition is retained in
// a disabled debugging block, but its output is part of the command queue's
// observable behavior when the debug command calls it.
export async function cmdq_print(q, state = game) {
    const lines = commandQueue(state)[q].map((node) => {
        switch (node.typ) {
        case CMDQ_KEY:
            return `(key:${String.fromCharCode(node.key)})`;
        case CMDQ_EXTCMD:
            return `(extcmd:#${node.ec_entry?.ef_txt ?? ''})`;
        case CMDQ_DIR:
            return `(dir:${node.dx},${node.dy},${node.dz})`;
        case CMDQ_USER_INPUT:
            return '(userinput)';
        case CMDQ_INT:
            return `(int:${node.value})`;
        default:
            return `(ERROR:${node.typ})`;
        }
    });
    await ttyPline(`CQ:${q}`, state);
    for (const line of lines) await ttyPline(line, state);
}

// C ref: cmd.c pgetchar() (445-453) and randomkey() (3517-3590).
export async function pgetchar(state = game) {
    if (state.iflags?.debug_fuzzer) return randomkey(state);
    return Number(await nhgetch(state)) & 0xFF;
}

function randomDirectionKey(dir, mode, state) {
    const names = ['west', 'northwest', 'north', 'northeast', 'east',
        'southeast', 'south', 'southwest'];
    const prefix = mode === MV_WALK ? 'move' : mode === MV_RUSH ? 'rush' : 'run';
    return keyForCommand(commandBindings(state), `${prefix}${names[dir]}`);
}

export function randomkey(state = game) {
    state._randomkeyIndex ??= 0;
    const previous = state._randomkeyLast ?? 0;
    const commandInput = state.program_state?.input_state === 'command';
    // C('a') and C('p') are control-A (1) and control-P (16), not the
    // printable letters used by their ordinary command bindings.
    if ((previous === 1 || previous === 16) && commandInput && rn2(5))
        return previous;

    let value;
    switch (rn2(16)) {
    case 0:
        value = 10;
        break;
    case 1:
    case 2:
    case 3:
    case 4:
        value = rn1('~'.charCodeAt(0) - ' '.charCodeAt(0) + 1,
            ' '.charCodeAt(0));
        break;
    case 5:
        value = rn2(2) ? 9 : 32;
        break;
    case 6:
        value = rn1(26, 'a'.charCodeAt(0));
        break;
    case 7:
        value = rn1(26, 'A'.charCodeAt(0));
        break;
    case 8: {
        const row = extcmdlist[state._randomkeyIndex++ % extcmdlist.length];
        value = row.key || 0;
        break;
    }
    case 9:
        value = '#'.charCodeAt(0);
        break;
    case 10:
    case 11:
    case 12: {
        const dir = rn2(N_DIRS);
        const mode = rn2(7) ? MV_WALK : (!rn2(3) ? MV_RUSH : MV_RUN);
        value = randomDirectionKey(dir, mode, state);
        break;
    }
    case 13:
        value = rn1(10, '0'.charCodeAt(0));
        break;
    case 14:
        value = rnd(state.iflags?.wc_eight_bit_input ? 255 : 127);
        break;
    default:
        value = ESC;
        break;
    }
    if (commandInput) state._randomkeyLast = value;
    return value;
}

// C ref: cmd.c cmdq_pop(). It picks CQ_REPEAT while gi.in_doagain is true and
// CQ_CANNED otherwise. state.in_doagain owns that C flag in the port.
export function cmdq_pop(state = game) {
    const queue = state.in_doagain ? CQ_REPEAT : CQ_CANNED;
    return commandQueue(state)[queue].shift() ?? null;
}

export function cmdq_peek(q, state = game) {
    return commandQueue(state)[q][0] ?? null;
}

export function cmdq_clear(q, state = game) {
    commandQueue(state)[q].length = 0;
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

// C ref: cmd.c do_move_*(), do_rush_*(), and do_run_*() (1404-1552). These
// handlers are deliberately small: all movement state belongs to
// set_move_cmd(), and each wrapper returns ECMD_TIME so rhack() enters the
// normal movement loop.
export function do_move_west(state = game) { set_move_cmd(DIR_W, MV_WALK, state); return ECMD_TIME; }
export function do_move_northwest(state = game) { set_move_cmd(DIR_NW, MV_WALK, state); return ECMD_TIME; }
export function do_move_north(state = game) { set_move_cmd(DIR_N, MV_WALK, state); return ECMD_TIME; }
export function do_move_northeast(state = game) { set_move_cmd(DIR_NE, MV_WALK, state); return ECMD_TIME; }
export function do_move_east(state = game) { set_move_cmd(DIR_E, MV_WALK, state); return ECMD_TIME; }
export function do_move_southeast(state = game) { set_move_cmd(DIR_SE, MV_WALK, state); return ECMD_TIME; }
export function do_move_south(state = game) { set_move_cmd(DIR_S, MV_WALK, state); return ECMD_TIME; }
export function do_move_southwest(state = game) { set_move_cmd(DIR_SW, MV_WALK, state); return ECMD_TIME; }

export function do_rush_west(state = game) { set_move_cmd(DIR_W, 3, state); return ECMD_TIME; }
export function do_rush_northwest(state = game) { set_move_cmd(DIR_NW, 3, state); return ECMD_TIME; }
export function do_rush_north(state = game) { set_move_cmd(DIR_N, 3, state); return ECMD_TIME; }
export function do_rush_northeast(state = game) { set_move_cmd(DIR_NE, 3, state); return ECMD_TIME; }
export function do_rush_east(state = game) { set_move_cmd(DIR_E, 3, state); return ECMD_TIME; }
export function do_rush_southeast(state = game) { set_move_cmd(DIR_SE, 3, state); return ECMD_TIME; }
export function do_rush_south(state = game) { set_move_cmd(DIR_S, 3, state); return ECMD_TIME; }
export function do_rush_southwest(state = game) { set_move_cmd(DIR_SW, 3, state); return ECMD_TIME; }

export function do_run_west(state = game) { set_move_cmd(DIR_W, MV_RUN, state); return ECMD_TIME; }
export function do_run_northwest(state = game) { set_move_cmd(DIR_NW, MV_RUN, state); return ECMD_TIME; }
export function do_run_north(state = game) { set_move_cmd(DIR_N, MV_RUN, state); return ECMD_TIME; }
export function do_run_northeast(state = game) { set_move_cmd(DIR_NE, MV_RUN, state); return ECMD_TIME; }
export function do_run_east(state = game) { set_move_cmd(DIR_E, MV_RUN, state); return ECMD_TIME; }
export function do_run_southeast(state = game) { set_move_cmd(DIR_SE, MV_RUN, state); return ECMD_TIME; }
export function do_run_south(state = game) { set_move_cmd(DIR_S, MV_RUN, state); return ECMD_TIME; }
export function do_run_southwest(state = game) { set_move_cmd(DIR_SW, MV_RUN, state); return ECMD_TIME; }

// C ref: cmd.c do_rush() (1590-1602). state.domoveAttempting and
// state.context.run represent gd.domove_attempting and svc.context.run.
export async function do_rush(state = game) {
    state.context ??= {};
    if (state.domoveAttempting & DOMOVE_RUSH) {
        await ttyNorep('Double rush prefix, canceled.', state);
        state.context.run = 0;
        state.domoveAttempting = 0;
        return ECMD_CANCEL;
    }
    state.context.run = 2;
    state.domoveAttempting |= DOMOVE_RUSH;
    return ECMD_OK;
}

// C ref: cmd.c do_run() (1606-1618). NetHack uses run value 3 for this
// prefix; the following direction handler leaves it unchanged because this
// function has already set gd.domove_attempting.
export async function do_run(state = game) {
    state.context ??= {};
    if (state.domoveAttempting & DOMOVE_RUSH) {
        await ttyNorep('Double run prefix, canceled.', state);
        state.context.run = 0;
        state.domoveAttempting = 0;
        return ECMD_CANCEL;
    }
    state.context.run = 3;
    state.domoveAttempting |= DOMOVE_RUSH;
    return ECMD_OK;
}

// C ref: cmd.c do_repeat() (1638-1660). The repeat copy is restored after
// rhack() consumes the working queue, so a repeated command remains available
// for the next #repeat. `state.in_doagain` is gi.in_doagain.
export async function do_repeat(state = game) {
    state.context ??= {};
    state.iflags ??= {};
    let result = ECMD_OK;
    if (!state.in_doagain) {
        if (!cmdq_peek(CQ_REPEAT, state)) {
            await ttyNorep('There is no command available to repeat.', state);
            return ECMD_FAIL;
        }
        const repeatCopy = cmdq_copy(CQ_REPEAT, state);
        state.in_doagain = true;
        try {
            await rhack(0, state);
        } finally {
            state.in_doagain = false;
            cmdq_clear(CQ_REPEAT, state);
            commandQueue(state)[CQ_REPEAT] = repeatCopy;
            state.iflags.menu_requested = false;
        }
        if (state.context.move) result = ECMD_TIME;
    }
    return result;
}

// C ref: cmd.c extcmd_via_menu() (752-889). The menu has one row per
// accelerator at the matched prefix depth; selecting one more character
// narrows the same command list until one exact extended command remains.
export async function extcmd_via_menu(state = game) {
    let prefix = '';
    let matchLevel = 0;
    for (;;) {
        const choices = extcmdlist.filter((entry) => {
            if (entry.flags & (CMD_NOT_AVAILABLE | INTERNALCMD)) return false;
            if (!(entry.flags & AUTOCOMPLETE)) return false;
            if (!state.wizard && (entry.flags & WIZMODECMD)) return false;
            return entry.ef_txt.startsWith(prefix);
        });
        if (choices.length === 0) return -1;
        if (choices.length > MAX_EXT_CMD) {
            // C disables the option rather than displaying a truncated menu.
            state.iflags.extmenu = false;
            return -1;
        }
        if (choices.length === 1) return extcmdlist.indexOf(choices[0]);

        const groups = new Map();
        for (const entry of choices) {
            const accelerator = entry.ef_txt[matchLevel];
            if (!accelerator) continue;
            if (!groups.has(accelerator)) groups.set(accelerator, []);
            groups.get(accelerator).push(entry);
        }
        const items = [...groups].map(([accelerator, rows]) => ({
            selector: accelerator,
            value: accelerator,
            label: rows.map((row) => `${row.ef_txt} [${row.ef_desc}]`).join(' or '),
        }));
        const selected = await select_menu(state, {
            items,
            how: PICK_ONE,
            title: `Extended Command: ${prefix}`,
            ...menuTitleStyle(state),
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        });
        if (selected === null || selected === undefined) {
            if (matchLevel) {
                // C lets Escape back out one complete menu prompt by
                // restarting the root menu; only Escape at the root cancels.
                prefix = '';
                matchLevel = 0;
                continue;
            }
            return -1;
        }
        prefix += typeof selected === 'string'
            ? selected : String.fromCharCode(selected);
        matchLevel++;
        const exact = choices.filter((entry) => entry.ef_txt === prefix);
        if (exact.length === 1) return extcmdlist.indexOf(exact[0]);
    }
}

// C ref: cmd.c enter_explore_mode() (952-983). The Unix authorization list
// has the same syntax as jsmain.set_playmode(): a leading '*' permits every
// account, otherwise the login name must appear as a whitespace-delimited
// word.
export async function enter_explore_mode(state = game) {
    if (state.discover) {
        await ttyPline('You are already in explore mode.', state);
        return ECMD_OK;
    }
    const oldmode = state.wizard ? 'debug mode' : 'normal game';
    const users = String(state.sysopt?.explorers ?? '*');
    const login = String(state.loginName ?? state.plname ?? 'root');
    const authorized = users.startsWith('*')
        || (login && users.split(/\s+/u).includes(login));
    if (!authorized) {
        if (!state.wizard) {
            await ttyPline('You cannot access explore mode.', state);
            return ECMD_OK;
        }
        await ttyPline("Note: normally you wouldn't be allowed into explore mode.", state);
    }
    await ttyPline(
        `Beware!  From explore mode there will be no return to ${oldmode},`,
        state,
    );
    const paranoid = Boolean(state.flags?.paranoia_bits & PARANOID_QUIT);
    if (!await paranoid_query(paranoid, 'Do you want to enter explore mode?', state)) {
        clearTtyMessageWindow(state);
        await ttyPline(`Continuing with ${oldmode}.`, state);
        return ECMD_OK;
    }
    state.discover = true;
    state.flags ??= {};
    state.flags.explore = true;
    state.wizard = false;
    state.flags.debug = false;
    state.iflags ??= {};
    state.iflags.deferred_X = false;
    clearTtyMessageWindow(state);
    await ttyPline('You are now in non-scoring explore mode.', state);
    return ECMD_OK;
}

const LEVLTYP_NAMES = Object.freeze([
    'stone', 'vertical wall', 'horizontal wall', 'top-left corner wall',
    'top-right corner wall', 'bottom-left corner wall',
    'bottom-right corner wall', 'cross wall', 'tee-up wall', 'tee-down wall',
    'tee-left wall', 'tee-right wall', 'drawbridge wall', 'tree',
    'secret door', 'secret corridor', 'pool', 'moat', 'water',
    'drawbridge up', 'lava pool', 'lava wall', 'iron bars', 'door',
    'corridor', 'room', 'stairs', 'ladder', 'fountain', 'throne', 'sink',
    'grave', 'altar', 'ice', 'drawbridge down', 'air', 'cloud',
    'unreachable/undiggable', '',
]);

// C ref: cmd.c levltyp_to_name() (1090-1193).
export function levltyp_to_name(typ) {
    return typ >= 0 && typ < MAX_TYPE ? LEVLTYP_NAMES[typ] : null;
}

function selectedPoint(selection, x, y) {
    return Boolean(selection?.get(x, y));
}

function selectionBoundsSeen(selection, bounds, state) {
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (const y of [bounds.ly, bounds.hy]) {
            if (isok(x, y) && selectedPoint(selection, x, y)
                && glyph_at(x, y, state) === GLYPH_UNEXPLORED_OFF) {
                return false;
            }
        }
    }
    for (let y = bounds.ly; y <= bounds.hy; ++y) {
        for (const x of [bounds.lx, bounds.hx]) {
            if (isok(x, y) && selectedPoint(selection, x, y)
                && glyph_at(x, y, state) === GLYPH_UNEXPLORED_OFF) {
                return false;
            }
        }
    }
    return true;
}

// C ref: cmd.c u_have_seen_whole_selection() (1195-1212).
export function u_have_seen_whole_selection(selection, state = game) {
    const bounds = selection.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (isok(x, y) && selectedPoint(selection, x, y)
                && glyph_at(x, y, state) === GLYPH_UNEXPLORED_OFF) {
                return false;
            }
        }
    }
    return true;
}

// C ref: cmd.c u_have_seen_bounds_selection() (1213-1245).
export function u_have_seen_bounds_selection(selection, state = game) {
    return selectionBoundsSeen(selection, selection.bounds(), state);
}

// C ref: cmd.c u_can_see_whole_selection() (1247-1261).
export function u_can_see_whole_selection(selection, state = game) {
    const bounds = selection.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (isok(x, y) && selectedPoint(selection, x, y)
                && !cansee(x, y, state)) return false;
        }
    }
    return true;
}

// C ref: cmd.c dolookaround_floodfill_findroom() (1263-1275).
export function dolookaround_floodfill_findroom(x, y, state = game) {
    const typ = state.level?.at(x, y)?.typ;
    return !(IS_STWALL(typ) || IS_DOOR(typ) || IS_TREE(typ)
        || IS_WATERWALL(typ) || typ === LAVAWALL || typ === IRONBARS
        || typ === SCORR || typ === SDOOR || typ === DRAWBRIDGE_UP);
}

function selectionSizeDescription(selection) {
    const bounds = selection.bounds();
    let irregular = false;
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (isok(x, y) && !selectedPoint(selection, x, y)) {
                irregular = true;
                break;
            }
        }
        if (irregular) break;
    }
    const width = bounds.hx - bounds.lx + 1;
    const height = bounds.hy - bounds.ly + 1;
    const shape = irregular
        ? 'irregularly shaped' : width === height ? 'square' : 'rectangular';
    return `${shape} ${width} by ${height}`;
}

function sizeDescriptionArticle(text) {
    return /^[aeiou]/u.test(text) ? 'an' : 'a';
}

// C ref: cmd.c lookaround_known_room() (1277-1309).
export async function lookaround_known_room(x, y, state = game) {
    const selection = selection_new();
    set_selection_floodfillchk((sx, sy) =>
        dolookaround_floodfill_findroom(sx, sy, state));
    selection_floodfill(selection, x, y, true);
    const wholeSeen = u_have_seen_whole_selection(selection, state);
    const boundsSeen = u_have_seen_bounds_selection(selection, state);
    const size = selectionSizeDescription(selection);
    const roomNumber = (state.u?.urooms?.[0] ?? 0) - ROOMOFFSET;
    const place = roomNumber >= 0 ? 'room' : 'area';
    const heroHere = state.u?.ux === x && state.u?.uy === y;
    const article = sizeDescriptionArticle(size);
    let message;
    if (wholeSeen) {
        const relation = heroHere && u_can_see_whole_selection(selection, state)
            ? 'are in' : heroHere ? 'remember this as' : 'remember that as';
        message = `You ${relation} ${article} ${size} ${place}.`;
    } else if (boundsSeen) {
        message = `You guess ${heroHere ? 'this' : 'that'} to be ${article} ${size} ${place}.`;
    } else {
        message = `You can't guess the size of ${heroHere ? 'this' : 'that'} area.`;
    }
    await ttyPline(
        heroHere ? message : messageAt(message, x, y, state, true),
        state,
    );
}

// C ref: cmd.c dolookaround() (1311-1375). startup_a11y.js owns the same
// source-order room and visible-cell description primitives; this wrapper
// supplies the command's filter lifetime and emits their pline_xy messages.
export async function dolookaround(state = game) {
    const oldFilter = state.iflags?.getloc_filter;
    const oldAccessible = state.a11y?.accessiblemsg;
    state.iflags ??= {};
    state.a11y ??= {};
    state.a11y.accessiblemsg = true;
    state.iflags.getloc_filter = GFILTER_VIEW;
    try {
        const { ux, uy } = state.u;
        const here = state.level?.at(ux, uy)?.typ;
        if (here === DOOR) {
            // C checks the four cardinal neighbors in DIR_W..N_DIRS steps of
            // two, which is exactly this west/north/east/south order.
            for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
                const x = ux + dx;
                const y = uy + dy;
                if (isok(x, y) && (state.level?.at(x, y)?.typ ?? -1) >= ROOM)
                    await lookaround_known_room(x, y, state);
            }
        } else if (here !== SCORR) {
            await lookaround_known_room(ux, uy, state);
        }
        // The room/area description above is emitted by this cmd.c function;
        // the shared helper supplies only the visible-cell pline_xy loop.
        for (const message of collectLookaroundMessages(state, { includeRoom: false }))
            await ttyPline(message, state);
    } finally {
        state.iflags.getloc_filter = oldFilter;
        if (oldAccessible === undefined) delete state.a11y.accessiblemsg;
        else state.a11y.accessiblemsg = oldAccessible;
    }
    return ECMD_OK;
}

// C ref: cmd.c dotoggleoption() (1377-1386).
export async function dotoggleoption(state = game) {
    if (state.cmd_bind?.param) {
        return await toggle_bool_option(state.cmd_bind.param, state);
    }
    await ttyPline('Use #optionsfull to set any option instead.', state);
    return ECMD_OK;
}

// C ref: cmd.c makemap_prepost() (985-1088). The JavaScript level serializer
// owns the in-memory equivalent of savelev(); file handles and monster/ball
// helpers without a JS owner are recorded as discarded-result gaps.
export async function makemap_prepost(pre, wiztower = false, state = game) {
    state.context ??= {};
    if (pre) {
        note_unported('wizcmds.c makemap_remove_mons');
        const ledger = ledger_no(state.u.uz, state);
        note_unported('dungeon.c rm_mapseen');
        state.context.achieveo ??= {};
        if (on_level(state.u.uz, state.mineend_level)) {
            if (remove_achievement(ACH_MINE_PRIZE, state))
                await ttyPline('Mine\'s-end achievement revoked.', state);
            state.context.achieveo.mines_prize_oid = 0;
        } else if (on_level(state.u.uz, state.sokoend_level)) {
            if (remove_achievement(ACH_SOKO_PRIZE, state))
                await ttyPline('Sokoban end achievement revoked.', state);
            state.context.achieveo.soko_prize_oid = 0;
        }
        if (Punished(state)) {
            note_unported('ball.c ballrelease');
            note_unported('ball.c unplacebc');
        }
        maybe_reset_pick(null, state);
        if (on_level(state.context.digging?.level, state.u.uz))
            state.context.digging = {};
        state.iflags ??= {};
        state.iflags.travelcc = { x: 0, y: 0 };
        state.context.polearm ??= {};
        state.context.polearm.hitmon = null;
        reset_utrap(false, state);
        await check_special_room(true, state);
        state.dndest = {};
        state.updest = {};
        state.u.ustuck = null;
        state.u.uswallow = false;
        state.u.uswldtim = 0;
        set_uinwater(0, state);
        state.u.uundetected = false;
        dmonsfree(state);
        dobjsfree(state);
        savelev(ledger, state);
        note_unported('files.c get_freeing_nhfile');
        note_unported('files.c close_nhfile');
        return ECMD_OK;
    }

    vision_reset(state);
    state.vision_full_recalc = 1;
    await cls();
    u_on_rndspot(
        (state.u?.uhave?.amulet ? 1 : 0) | (wiztower ? 2 : 0),
        state,
    );
    losedogs({ state });
    note_unported('mon.c kill_genocided_monsters');
    if (m_at(state.u.ux, state.u.uy, state))
        note_unported('do.c u_collide_m');
    initrack(state);
    if (Punished(state)) {
        note_unported('ball.c unplacebc');
        note_unported('ball.c placebc');
    }
    await docrt();
    await flush_screen(1);
    note_unported('questpgr.c deliver_splev_message');
    await check_special_room(false, state);
    return ECMD_OK;
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

// C ref: cmd.c dotravel() (5299-5343). This owns the ordinary keyboard route
// only. Menu travel and the cancellation/selection settings outside the
// default getpos configuration remain later slices.
async function dotravel(key, state = game) {
    state.iflags ??= {};
    const cached = state.iflags.travelcc ?? { x: 0, y: 0 };
    const cc = { x: cached.x, y: cached.y };
    if (cc.x === 0 && cc.y === 0) {
        cc.x = state.u.ux;
        cc.y = state.u.uy;
    }

    state.iflags.getloc_travelmode = true;
    if (state.iflags.menu_requested) {
        state.iflags.getloc_travelmode = false;
        throw new UnsupportedHeroCommandBranchBoundaryError(
            'dotravel menu target selection is not ported',
            key,
        );
    }

    await ttyPline('Where do you want to travel to?', state);
    const getposResult = await getpos(
        cc, true, 'the desired destination', state,
    );
    if (getposResult < 0) {
        state.iflags.getloc_travelmode = false;
        return ECMD_CANCEL;
    }

    state.iflags.travelcc = { x: cc.x, y: cc.y };
    state.u.tx = cc.x;
    state.u.ty = cc.y;
    return dotravel_target(state);
}

// C ref: cmd.c dotravel_target() (5348-5379). The state setup and the first
// domove() call are source-faithful; hack.c's travel path search chooses the
// direction before the ordinary movement pipeline runs.
async function dotravel_target(state = game) {
    const travelcc = state.iflags?.travelcc;
    if (!isok(travelcc?.x, travelcc?.y)) {
        // C treats an unset destination as a harmless retravel no-op.
        await ttyPline('No travel destination set.', state);
        return ECMD_OK;
    }
    if (u_at(travelcc.x, travelcc.y, state)) {
        // C's You() call is asynchronous in the JS terminal owner.
        await ttyPline('You are already here.', state);
        state.iflags.travelcc.x = 0;
        state.iflags.travelcc.y = 0;
        state.iflags.getloc_travelmode = false;
        return ECMD_OK;
    }

    state.iflags.getloc_travelmode = false;
    state.context.travel = 1;
    state.context.travel1 = 1;
    state.context.run = 8;
    state.context.nopick = 1;
    state.domoveAttempting |= DOMOVE_RUSH;
    if (!state.multi)
        state.multi = Math.max(COLNO, ROWNO);
    state.u.last_str_turn = 0;
    state.context.mv = 1;

    await domove(state);
    return ECMD_TIME;
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

// pendingCommand owns the complete parsed state needed to retry a command
// rhack() could not finish, whether it was refused before dispatch or by a
// destination admission failure under domove(). Replaying the keystroke is
// never the alternative, because parse() has already consumed the command's
// count digits and no retry resumes inside get_count(); parser UI state is
// deliberately absent for the same reason. A retry retains the effect of every
// prefix this port owns, because rhack() has already consumed the prefix byte
// and no later input can reconstruct it: the reqmenu effect before
// set_move_cmd() copies it to context.nopick, and both of do_fight()'s writes,
// context.forcefight and the DOMOVE_WALK bit it puts in domoveAttempting.
// Dropping any of them would replay the direction key as a different command
// from the one the player typed -- a plain walk for the first two, and, for the
// third, a rush, because set_move_cmd() rebuilds domoveAttempting from the
// row's own run value once the word is empty.
function captureParsedCommand(key, state) {
    return {
        key,
        commandCount: state.commandCount,
        lastCommandCount: state.lastCommandCount,
        multi: state.multi,
        ...(state.iflags?.menu_requested ? { menuRequested: true } : {}),
        ...(state.context?.forcefight ? { forcefight: true } : {}),
        ...(state.domoveAttempting
            ? { domoveAttempting: state.domoveAttempting }
            : {}),
    };
}

function restoreParsedCommand(pending, state) {
    state.cmdKey = pending.key;
    state.commandCount = pending.commandCount;
    state.lastCommandCount = pending.lastCommandCount;
    state.multi = pending.multi;
    state.iflags.menu_requested = Boolean(pending.menuRequested);
    state.context.forcefight = pending.forcefight ? 1 : 0;
    state.domoveAttempting = pending.domoveAttempting ?? 0;
    return pending.key;
}

// The classes failClosedCommand() converts. js/jsmain.js breaks the segment
// only for the boundary classes it lists, so a class a command handler can
// raise that is missing from this list escapes as a hard failure and discards
// the segment's matching prefix instead of stopping on it.
// js/allmain.js elapsedTurnPlanningRefusals() is the same list for the turn
// loop; a class both paths can reach belongs in both.
// js/moveloop_preamble.js runMoveloopPreambleAtStartupBoundary() reads this
// list too, for the one stretch of a segment that runs above both: the
// preamble allmain.c moveloop() runs before its first moveloop_core().
export function failClosedCommandRefusals() {
    return [
        UnsupportedFeatureDescriptionError,
        UnsupportedObjectNameError,
        UnsupportedSpellDisplayError,
        UnsupportedSpellStudyError,
        // spell.c spelleffects_check() and spelleffects() raise this from
        // the forgotten-spell, amulet-drain, and non-healing spell paths
        // that this port has not reached.
        UnsupportedSpellCastError,
        UnsupportedDiscoveryDisplayError,
        UnsupportedEnlightenmentError,
        UnsupportedShopError,
        // end.c really_done() calls paybill() and paygd() on every death, so
        // a shopkeeper inherits() cannot settle with or a vault guard owed the
        // hero's gold refuses below a killing blow. The hero's own command
        // reaches that death through losehp(), and js/allmain.js converts the
        // same two classes where a monster's attack reaches it.
        UnsupportedVaultGuardError,
        UnsupportedWeaponSkillError,
        UnsupportedGetlinBoundaryError,
        UnsupportedSearchError,
        UnsupportedDirectionBoundaryError,
        UnsupportedEatError,
        UnsupportedApplyError,
        UnsupportedEngraveError,
        UnsupportedHelpError,
        UnsupportedWhatisError,
        // lock.c pick_lock() stops inside doapply()'s lock-pick arm, one
        // frame below UnsupportedApplyError rather than beside it.
        UnsupportedLockError,
        // do_wear.c dotakeoff() raises this for a piece of armor whose
        // objects[].oc_delay is non-zero and for the slots whose <X>_off()
        // is unported, in both cases before anything is drawn or removed.
        UnsupportedTakeOffError,
        // do_wear.c accessory_or_armor_on() raises this above setworn() for
        // the quest helm, an artifact, armor held in a weapon slot, and the
        // suit, cloak, helmet, glove and boot otyps whose <X>_on() reaches
        // outside do_wear.c. Also raised for the headless-polymorph eyewear
        // arm, which needs ansimpleoname(). No armor slot refuses wholesale:
        // all seven reach a callback.
        // set_wear() raises it too, from moveloop_preamble() rather than from
        // a command, which is the raiser the startup reader above converts.
        UnsupportedWearError,
        // do_wear.c Ring_on() raises this for the five ring types whose
        // on-wear effect calls helpers this port has not reached:
        // toggle_stealth, set_mimic_blocking, self_invis_message, float_up,
        // The no-op, arithmetic, and shape-changer protection arms work
        // without the remaining unsupported ring helpers.
        UnsupportedRingOnError,
        // do_wear.c Amulet_on() and Blindf_on() are fail-closed entry points
        // that belong to later puton-command slices.
        UnsupportedAccessoryOnError,
        // eat.c newuhs() is shared: gethungry() calls it from the turn loop,
        // and done_eating() and lesshungry() call it from doeat().
        UnsupportedHungerTransitionError,
        UnsupportedObjectPromptError,
        // read.c doread() raises this after getobj() returns an object and
        // before pickup_prev or any reading effect changes state. Cancellation
        // completes normally, so only selected objects reach this refusal.
        UnsupportedReadError,
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
        // A killing blow reaches the next two classes.
        // UnsupportedEndOfGameError now has
        // several source-ordered endpoints: a return-capable paranoid query
        // is preflighted before done() paints or mutates, an ordinary death
        // stops above really_done() after the forced status work, and a debug
        // or explore death can draw "Die?" before savelife() refuses.
        // UnsupportedUrgentMessageError remains the earlier boundary from
        // hack.c losehp()'s urgent_pline("You die...") when an
        // Escape-suppressed message window prevents that line.
        //
        // The third is not a killing blow's. apply_catch_lit.js raises it from
        // zhitu()'s ignite_items() call at zap.c:4437, one guard above the
        // killer block at 4561-4589, for an ignitable object in the hero's own
        // pack. The hero may still be at full hit points there and the bolt
        // may not kill at all, so the last screen a segment ending on it
        // matched carries whatever the status line held before the ray.
        UnsupportedEndOfGameError,
        UnsupportedUrgentMessageError,
        UnsupportedItemIgnitionError,
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
        // read.c raises this from every parse and creation arm of
        // create_particular() this port leaves unported, all of them after
        // getlin() has echoed the whole typed monster name. Leaving it out
        // would discard every screen the ^G prompt already matched instead of
        // stopping on the last of them.
        UnsupportedMonsterRequestError,
        // zap.c raises this from dozap()'s effect arms and from every arm of
        // the ray below weffects() that this port has not reached. Each one
        // stops after the command has already spent a charge and painted its
        // prompts -- and, for the ray, after the bolt has already been drawn
        // across the map -- so the segment has to end on them rather than
        // lose the screens they matched.
        UnsupportedZapError,
        // trap.c burnarmor() and erode_obj() raise this for a monster victim
        // and for the wet towel a hero's own fire would dry. zhitu()'s fire
        // arm is the ported caller, one frame below UnsupportedZapError.
        UnsupportedErosionError,
        // The three classes zhitu()'s destroy_items() call reaches below
        // UnsupportedErosionError, each after the bolt has been drawn and the
        // items it destroyed have been announced. zap.c maybe_destroy_item()
        // raises the first from its AD_COLD and AD_ELEC cases and from a worn
        // or wielded object; potion.c potionbreathe() raises the second from
        // the sixteen vapor arms this port leaves unported; do_name.c docall()
        // raises the third for an object type the hero has neither identified
        // nor already called something.
        UnsupportedItemDestructionError,
        UnsupportedPotionError,
        // potion.c dodrink()/dopotion()/peffects() raises this for the 22
        // potion types besides POT_SPEED and for the strangled, sink,
        // underwater, worn-potion, milky and smoky branches of dodrink()
        // that this port has not reached.
        UnsupportedQuaffError,
        // fountain.c drinkfountain(), dowaterdemon(), dipfountain(),
        // and dryup() raise this for the fountain-effect arms this port
        // leaves unported.
        UnsupportedFountainError,
        // potion.c dodip() raises this for the sink, pool, and
        // potion-into-potion dipping paths this port leaves unported.
        UnsupportedDipError,
        // trap.c water_damage() raises this for the item types
        // (containers, scrolls, spellbooks, potions, lit items) whose
        // water-damage paths are not yet ported.
        WaterDamageError,
        UnsupportedObjectNamingError,
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
        // do.c dowipe() and wipeoff() raise this for every face or blindness
        // state outside the selected ordinary three-turn cream occupation.
        // wipeoff() runs at the turn boundary, so allmain.js consumes this
        // same list when the installed callback refuses a changed state.
        UnsupportedWipeError,
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
        // polyself.c polymon(), break_armor(), drop_weapon(), and polyself()
        // raise this for every form whose species-specific branches are not
        // ported: dragon HP, golem HP, breakarm armor paths, horned/headless
        // gear, forced weapon drops, iswere/isvamp/draconian gotos, random
        // selection, and newman(). Each guard fires after getlin() has echoed
        // the typed monster name and after the controlled-input loop has
        // committed the species.
        UnsupportedPolyselfError,
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
// keystroke retryable, the same contract the admission seam provides. The
// branch subclass records which of the two seams stopped the command, for the
// reason its declaration gives.
async function failClosedCommand(key, state, run) {
    try {
        return await run();
    } catch (error) {
        if (failClosedCommandRefusals().some(
            (type) => error instanceof type,
        )) {
            resetCommandVars(state);
            throw new UnsupportedHeroCommandBranchBoundaryError(
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

// C ref: invent.c display_pickinv() menu hooks. Used by ddoinv() and the
// equipment display commands (doprwep, doprarm, doprring, dopramulet).
function inventoryMenuHooks(state) {
    return {
        menu: (items) => select_menu(state, {
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
    };
}

// C ref: invent.c ddoinv(). Every entry is formatted before the menu draws
// anything, so an unported object name or display branch stops before ddoinv()
// itself writes to the screen.
async function runInventoryCommand(key, state) {
    return failClosedCommand(key, state, () => ddoinv(state,
        inventoryMenuHooks(state)));
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
// extcmdlist[]'s "searching" occupation text makes rhack() install a timed
// occupation ahead of this wrapper whenever a count left gm.multi above 0. The
// occupation calls dosearch() bare, without the wrapper: it is not running a
// command, so a refusal from below belongs to the turn loop, which
// moveloop_core() converts there.
async function runSearchCommand(key, state) {
    return failClosedCommand(key, state, () => dosearch(state));
}

// C ref: cmd.c doterrain() (1098-1170). The menu is source-shaped for every
// normal/explore/wizard entry, but only the normal preselected TER_MAP choice
// is owned by this slice. reveal_terrain() stops after its projection and
// message, before browse_map()/getpos(); the wrapper keeps that later branch
// and every other menu choice fail-closed.
async function runTerrainCommand(key, state) {
    return failClosedCommand(key, state, () => doterrain(state));
}

export async function doterrain(state = game) {
    recalc_mapseen(state);
    const items = [
        {
            value: 1,
            selected: true,
            label: 'known map without monsters, objects, and traps',
        },
        {
            value: 2,
            label: 'known map without monsters and objects',
        },
        {
            value: 3,
            label: 'known map without monsters',
        },
    ];
    if (state.discover || state.wizard) {
        items.push({
            value: 4,
            label: 'full map without monsters, objects, and traps',
        });
        if (state.wizard) {
            items.push({
                value: 5,
                label: 'internal levl[][].typ codes in base-36',
            });
            items.push({
                value: 6,
                label: 'legend of base-36 levl[][].typ codes',
            });
        }
    }

    const which = await select_menu(state, {
        items,
        how: PICK_ONE,
        title: 'View which?',
        preselected: 1,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
    if (which === null) return ECMD_OK;
    if (which !== 1) {
        throw new UnsupportedSearchError(
            `terrain menu choice ${which} is not ported`,
        );
    }
    await reveal_terrain(TER_MAP, state);
    return ECMD_OK;
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

async function runEngraveCommand(key, state) {
    return failClosedCommand(key, state, () => doengrave(state, {
        cantWield: cantwield,
        checkCapacity: check_capacity,
        getObject: getobj,
        handsObject: hands_obj,
        GETOBJ_PROMPT,
        getLine: getlin,
        mungspaces,
        message: ttyPline,
        redraw: newsym,
        setOccupation: set_occupation,
        random: { rn2, rnd },
        ECMD_CANCEL,
        ECMD_OK,
    }));
}

async function runWhatisCommand(key, state) {
    return failClosedCommand(key, state, () => dowhatis(state));
}

// C ref: pager.c doquickwhatis(). The glance command is the cursor-based
// quick form of do_look(): it returns ECMD_OK, never spends a turn, and its
// ordinary map path is complete for the current glance goal.
async function runGlanceCommand(key, state) {
    return failClosedCommand(key, state, () => doquickwhatis(state));
}

// C ref: pager.c dohelp(). The handler returns ECMD_OK after either a menu
// cancellation or a selected target completes, so it never spends a turn.
async function runHelpCommand(key, state) {
    return failClosedCommand(key, state, () => dohelp(state));
}

// C ref: apply.c doapply(). Like dosearch() and doeat() it returns its own
// ECMD_* result: use_stethoscope()'s free first listen answers ECMD_OK where a
// second listen in the same move answers ECMD_TIME, and a cancelled object or
// direction prompt answers ECMD_CANCEL.
async function runApplyCommand(key, state) {
    return failClosedCommand(key, state, () => doapply(state));
}

// C ref: apply.c dorub(). Cancellation and the nohands refusal return the
// function's own result; selecting an object reaches apply.js's explicit
// boundary before the unported wielding and rubbing effects.
async function runRubCommand(key, state) {
    return failClosedCommand(key, state, () => dorub(state));
}

// C ref: lock.c doclose(). Like dosearch() and doeat() it returns its own
// ECMD_* result: ECMD_OK for the nohands/pit refusals, ECMD_CANCEL for a
// cancelled direction prompt, and ECMD_TIME for every path past the direction
// prompt (including refusals like "You are in the way!"). The Confusion and
// Stunned ECMD_TIME branch is unreachable because getdir()'s confdir() throws
// for an impaired hero.
async function runCloseCommand(key, state) {
    return failClosedCommand(key, state, () => doclose(state));
}

// C ref: lock.c doopen(). Like doclose() it returns its own ECMD_* result:
// ECMD_OK for the nohands refusal, a cancelled direction prompt, and the pit
// refusal, and ECMD_TIME for every path past the mimic/Confusion/Stunned
// checks (including the drawbridge, container, no-door, doormask, verysmall
// and open-attempt paths). The u_at delegation to doloot() answers doloot()'s
// own result.
async function runOpenCommand(key, state) {
    return failClosedCommand(key, state, () => doopen(state));
}

// C ref: zap.c dozap(). Like dosearch() and doeat() it returns its own ECMD_*
// result: ECMD_OK for the two guards above the object prompt, ECMD_CANCEL for
// an escaped object prompt, and ECMD_TIME once a wand has been chosen, whether
// or not it had a charge left to spend.
async function runZapCommand(key, state) {
    return failClosedCommand(key, state, () => dozap(state));
}

// C ref: spell.c docast(). Like dozap() and dodrink() it returns its own ECMD_*
// result: ECMD_FAIL when no spell is selected, ECMD_TIME when a spell is cast.
async function runCastCommand(key, state) {
    return failClosedCommand(key, state, () => docast(state, {
        message: ttyPline,
        // spell.c dospellmenu() for SPELLMENU_CAST: PICK_ONE menu with the
        // column heading styled by iflags.menu_headings.
        menu: (items, how, prompt) => select_menu(state, {
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
        // morehungry() -> newuhs() requires these hooks for hunger
        // status-change messages and status-line redraws.
        statusRefresh: () => bot(),
        endRunning: (s) => end_running(true, s),
    }));
}

// C ref: potion.c dodrink(). Like dosearch() and doeat() it returns its own
// ECMD_* result: ECMD_OK for the strangled refusal, ECMD_CANCEL for a
// cancelled object prompt, and ECMD_TIME for the quaff that happens.
async function runQuaffCommand(key, state) {
    return failClosedCommand(key, state, () => dodrink(state));
}

// C ref: potion.c dodip(). Like dodrink() it returns its own ECMD_* result:
// ECMD_CANCEL for an escaped object prompt and ECMD_TIME for the dip that
// happens. cmd.c:1710's "dip" row carries CMD_M_PREFIX, so an 'm' prefix
// sets iflags.menu_requested and skips the fountain/sink/pool prompts.
async function runDipCommand(key, state) {
    return failClosedCommand(key, state, () => dodip(state));
}

// C ref: read.c doread(). Like dodrink() it returns its own ECMD_* result:
// ECMD_OK for the capacity refusal and ECMD_CANCEL for an escaped object
// prompt. A known uncursed magic-mapping scroll completes; other selected
// objects stop inside doread() until their effects are ported.
async function runReadCommand(key, state) {
    return failClosedCommand(key, state, () => doread(state));
}

// C ref: do.c dodown(). Like dosearch() and doeat() it returns its own ECMD_*
// result, because dodown() distinguishes the refusal that spends no turn from
// the arms that spend one.
async function runDownCommand(key, state) {
    return failClosedCommand(key, state, () => dodown(state));
}

// C ref: do.c doup(), the '<' command. Like dodown() it returns its own ECMD_*
// result, because doup() distinguishes the refusal that spends no turn from
// the arms that spend one.
async function runUpCommand(key, state) {
    return failClosedCommand(key, state, () => doup(state));
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

// C ref: pickup.c doloot(), the #loot extended command. doloot() returns its
// own ECMD_* result: locked containers and the no-container messages answer
// ECMD_OK, and use_container() paths answer ECMD_TIME.
async function runLootCommand(key, state) {
    return failClosedCommand(key, state, () => doloot(state));
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

// C ref: do_wear.c doputon(). Like dowear() it returns its own ECMD_* result,
// and reaches all three: ECMD_OK for the "full" guard and for the accessory
// refusals, ECMD_CANCEL for an escaped getobj(), and ECMD_TIME for a ring
// that goes on.
async function runPutonCommand(key, state) {
    return failClosedCommand(key, state, () => doputon(state));
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

// C ref: wizcmds.c wiz_genesis(). Like wiz_wish() it ends `return ECMD_OK` on
// both arms, so creating a monster spends no turn however many arrive.
async function runGenesisCommand(key, state) {
    return failClosedCommand(key, state, () => wiz_genesis(state));
}

// C ref: wizcmds.c wiz_intrinsic(). Its menu and all selected property
// changes complete with ECMD_OK, so a wizard intrinsic never spends a turn.
async function runIntrinsicCommand(key, state) {
    return failClosedCommand(key, state, () => wiz_intrinsic(state));
}

// C ref: wizcmds.c wiz_polyself(). Unconditionally calls
// polyself(POLY_CONTROLLED) and returns ECMD_OK, so #polyself spends no turn.
async function runPolyselfCommand(key, state) {
    return failClosedCommand(key, state, () => wiz_polyself(state));
}

// C ref: cmd.c domonability() (888-949). #monster command: use a special
// monster ability while polymorphed. The polyself.c abilities are wired;
// the gremlin split, unicorn horn, shriek and steed breath arms still
// refuse. For a gnome form every test is false and the Upolyd catch-all
// prints "Any special ability you may have is purely reflexive."
async function domonability(state) {
    const uptr = state.youmonst?.data;
    const might_hide = is_hider(uptr) || hides_under(uptr);

    // cmd.c:896-901: combined hider+webmaker prompt. C initializes c to
    // '\0'; null preserves the same falsiness for the ternary conditions at
    // lines 912 and 914.
    let c = null;
    if (might_hide && webmaker(uptr)) {
        // decl.c:118 hidespinchars is "hsq". yn_function() answers a key
        // code, so the answers are compared as codes.
        c = await yn_function('Hide [h] or spin a web [s]?', 'hsq', 'q',
            true, state);
        if (c === 'q'.charCodeAt(0) || c === 0x1b)
            return ECMD_OK;
    }

    if (can_breathe(uptr)) {
        // cmd.c:902-903: return dobreathe();
        return dobreathe(state);
    } else if (attacktype(uptr, AT_SPIT)) {
        return dospit(state);
    } else if (uptr?.mlet === S_NYMPH) {
        return doremove(state);
    } else if (attacktype(uptr, AT_GAZE)) {
        return dogaze(state);
    } else if (is_were(uptr)) {
        return dosummon(state);
    } else if (c ? c === 'h'.charCodeAt(0) : might_hide) {
        // cmd.c:912. When the prompt was not shown (c is null), this tests
        // might_hide alone; when it was shown, it tests the answer.
        return dohide(state);
    } else if (c ? c === 's'.charCodeAt(0) : webmaker(uptr)) {
        // cmd.c:914. Same ternary pattern as the hider branch above.
        return dospinweb(state);
    } else if (is_mind_flayer(uptr)) {
        return domindblast(state);
    } else if (state.u.umonnum === PM_GREMLIN) {
        throw new UnsupportedHeroCommandBranchBoundaryError(
            'domonability gremlin-split for gremlin form',
        );
    } else if (is_unicorn(uptr)) {
        throw new UnsupportedHeroCommandBranchBoundaryError(
            'domonability unicorn-horn for unicorn form',
        );
    } else if (uptr?.msound === MS_SHRIEK) {
        throw new UnsupportedHeroCommandBranchBoundaryError(
            'domonability shriek for a shrieking form',
        );
    } else if (is_vampire(uptr) || is_vampshifter(state.youmonst)) {
        return dopoly(state);
    } else if (state.u.usteed && can_breathe(state.u.usteed?.data)) {
        throw new UnsupportedHeroCommandBranchBoundaryError(
            'domonability steed-breathe for a breath-weapon steed',
        );
    } else if (Upolyd(state.u)) {
        // cmd.c:943-944: polymorphed but no special ability.
        await ttyPline(
            'Any special ability you may have is purely reflexive.',
            state,
        );
    } else {
        // cmd.c:945-946: not polymorphed at all.
        await ttyPline(
            "You don't have a special ability in your normal form!",
            state,
        );
    }
    return ECMD_OK;
}

async function runMonsterCommand(key, state) {
    return failClosedCommand(key, state, () => domonability(state));
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
            // windows.c add_menu_heading() passes this flag through
            // add_menu(), so a catch-all MENUCOLOR cannot replace it.
            skipMenuColors: true,
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
        optionHandlers: {
            o_bind_keys: () => handler_rebind_keys(state),
            o_autocomplete: () => handler_change_autocompletions(state),
        },
        resetCommands: () => reset_commands(false, state),
        updateRestOnSpace: () => update_rest_on_space(state),
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
// stores the stripped name, so EXTCMD_BY_NAME looks the row back up. Every
// name reaching model.bindings has a row, because js/options.js reports the
// rest as parsebindings()'s unknown-command config error rather than binding
// them. The second loop counts every command whose compiled-in key no entry
// holds.
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

// C ref: cmd.c extcmds_getentry() (2101-2106). The generated JavaScript
// table has no C sentinel row, so its length is the first invalid index.
export function extcmds_getentry(index) {
    return Number.isInteger(index) && index >= 0 && index < extcmdlist.length
        ? extcmdlist[index] : null;
}

function bindingCommand(binding) {
    if (!binding) return null;
    const command = EXTCMD_BY_NAME.get(binding.command);
    return command ? {
        ...binding,
        key: binding.key & 0xFF,
        param: binding.param ?? null,
        cmd: command,
    } : null;
}

// C ref: cmd.c cmdbind_get() (2110-2123). command_bindings.js owns the
// linked-list equivalent; return a C-shaped snapshot so callers cannot mutate
// the list without going through cmdbind_add/remove.
export function cmdbind_get(key, state = game) {
    if (!key) return null;
    return bindingCommand(bindingAt(commandBindings(state).bindings, key));
}

// C ref: cmd.c cmdbind_add() (2126-2155). New entries are newest-first, while
// an existing key is overwritten in place. The C param field is maintained by
// bind_key() after the command row is installed.
export function cmdbind_add(key, command, user = false, state = game) {
    if (!key || !command) {
        if (!key) return;
        cmdbind_remove(key, state);
        return;
    }
    const bindings = commandBindings(state).bindings;
    const byte = key & 0xFF;
    const existing = bindingAt(bindings, byte);
    if (existing) {
        existing.command = command.ef_txt;
        existing.userbind = Boolean(user);
        existing.param = null;
    } else {
        bindings.unshift({
            key: byte,
            command: command.ef_txt,
            restBinding: false,
            userbind: Boolean(user),
            param: null,
        });
    }
}

// C ref: cmd.c cmdbind_remove() (2158-2177). JavaScript owns no separately
// allocated parameter or linked-list node, so removing the array entry is the
// complete equivalent of both frees.
export function cmdbind_remove(key, state = game) {
    if (!key) return;
    const bindings = commandBindings(state).bindings;
    const index = bindings.findIndex((binding) => binding.key === (key & 0xFF));
    if (index >= 0) bindings.splice(index, 1);
}

// C ref: cmd.c cmdbind_freeall() (2180-2191).
export function cmdbind_freeall(state = game) {
    commandBindings(state).bindings.length = 0;
}

// C ref: cmd.c cmdbind_swapkeys() (2195-2204). A swap only happens when both
// keys have entries; an absent key is intentionally left absent.
export function cmdbind_swapkeys(first, second, state = game) {
    const bindings = commandBindings(state).bindings;
    const firstBinding = bindingAt(bindings, first);
    const secondBinding = bindingAt(bindings, second);
    if (firstBinding && secondBinding) {
        firstBinding.key = second & 0xFF;
        secondBinding.key = first & 0xFF;
    }
}

function appendBindText(sbuf, text) {
    if (sbuf && typeof sbuf.append === 'function') sbuf.append(text);
    else if (sbuf && typeof sbuf.str === 'string') sbuf.str += text;
    else if (sbuf && typeof sbuf.text === 'string') sbuf.text += text;
}

// C ref: cmd.c get_changed_key_binds() (2235-2287). A caller-provided
// strbuf receives newline-terminated config lines; without one C opens a text
// window, represented by the existing displayTtyTextWindow wrapper.
export async function get_changed_key_binds(sbuf = null, state = game) {
    const model = commandBindings(state);
    const used = new Uint8Array(256);
    const lines = [];
    const append = (line) => {
        if (sbuf) appendBindText(sbuf, line + '\n');
        else lines.push({ text: line });
    };

    for (const binding of model.bindings) {
        const key = binding.key & 0xFF;
        used[key] = 1;
        const command = EXTCMD_BY_NAME.get(binding.command);
        if (!binding.userbind || !command || command.key === key) continue;
        const parameter = command.flags & CMD_PARAM
            ? '(' + (binding.param ?? '') + ')' : '';
        append('BIND=' + key2txt(key) + ':' + command.ef_txt + parameter);
    }
    for (const command of extcmdlist) {
        if (command.key && !used[command.key])
            append('BIND=' + key2txt(command.key) + ':nothing');
    }
    if (!sbuf) await displayTtyTextWindow(state, lines);
}

// C ref: bind_key() (2661-2728). This is the interactive/config-independent
// binding operation used by handler_rebind_keys_add(); options.js has its own
// parser for configuration strings and records the same command operation.
export function bind_key(key, commandText, user = false, state = game) {
    const text = String(commandText ?? '');
    if (text.toLowerCase() === 'nothing') {
        cmdbind_remove(key, state);
        return true;
    }
    const opening = text.indexOf('(');
    const closing = text.lastIndexOf(')');
    const parenthesized = opening >= 0 && closing > opening;
    const name = (parenthesized ? text.slice(0, opening) : text).toLowerCase();
    const command = extcmdlist.find((entry) => (
        entry.ef_txt.toLowerCase() === name
        && !(entry.flags & INTERNALCMD)
    ));
    if (!command) return false;

    cmdbind_add(key, command, user, state);
    if (parenthesized && (command.flags & CMD_PARAM)
        && text.slice(opening + 1, closing).length > 0) {
        const binding = bindingAt(commandBindings(state).bindings, key);
        if (binding) binding.param = text.slice(opening + 1, closing).slice(0, 30);
    }
    return true;
}

// C ref: cmd.c handler_rebind_keys_add() (2291-2405). Menu entries retain
// their extcmdlist index as the selector value, matching C's i + 1 value even
// when movement, internal, and unavailable rows are omitted.
export async function handler_rebind_keys_add(keyfirst = false, state = game) {
    let key = 0;
    if (keyfirst) {
        await ttyPline('Bind which key? ', state);
        key = await pgetchar(state);
        if (!key || key === ESC) return;
    }

    const current = key ? cmdbind_get(key, state) : null;
    const items = [];
    if (key) {
        items.push({
            text: current
                ? "Key '" + key2txt(key) + "' is currently bound to \""
                    + current.cmd.ef_txt + '".'
                : "Key '" + key2txt(key) + "' is not bound to anything.",
        });
        items.push({ text: '' });
    }
    items.push({ value: -1, label: 'nothing: unbind the key' });
    items.push({ text: '' });
    for (let index = 0; index < extcmdlist.length; index++) {
        const command = extcmds_getentry(index);
        if (!command || (command.flags & (MOVEMENTCMD | INTERNALCMD
            | CMD_NOT_AVAILABLE))) continue;
        items.push({
            value: index + 1,
            label: command.ef_txt + ': ' + command.ef_desc,
        });
    }
    const selected = await select_menu(state, {
        items,
        how: PICK_ONE,
        title: key ? "Bind '" + key2txt(key) + "' to what command?"
            : 'Bind what command?',
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
    if (selected == null) return;

    let command = null;
    let commandText = 'nothing';
    if (selected !== -1) {
        command = extcmds_getentry(selected - 1);
        if (!command) return;
        commandText = command.ef_txt;
        if (command.flags & CMD_PARAM) {
            const parameter = mungspaces(await getlin(
                'Command ' + command.ef_txt + ' requires a parameter:', state,
            ));
            commandText = command.ef_txt + '(' + parameter + ')';
        }
    }
    if (!key) {
        await ttyPline('Bind which key? ', state);
        key = await pgetchar(state);
        if (!key || key === ESC) return;
    }
    const previous = cmdbind_get(key, state);
    if (!bind_key(key, commandText, true, state)) {
        await ttyPline('Key binding failed?!', state);
        return;
    }
    if (previous && (!command || previous.cmd !== command)) {
        await ttyPline(
            "Changed key '" + key2txt(key) + "' from \""
            + previous.cmd.ef_txt + "\" to \"" + commandText + '".',
            state,
        );
    } else if (!previous && command) {
        await ttyPline(
            "Bound key '" + key2txt(key) + "' to \"" + commandText + '".',
            state,
        );
    }
}

// C ref: cmd.c handler_rebind_keys() (2408-2451).  A PICK_ONE menu returns
// the same integer selector that C stores in anything.a_int; the loop repeats
// after each operation until the player dismisses the menu.
export async function handler_rebind_keys(state = game) {
    for (;;) {
        const items = [
            { value: 1, label: 'bind key to a command' },
            { value: 2, label: 'bind command to a key' },
        ];
        if (count_bind_keys(state))
            items.push({ value: 3, label: 'view changed key binds' });
        const selected = await select_menu(state, {
            items,
            how: PICK_ONE,
            title: 'Do what?',
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        });
        if (selected == null) return;
        if (selected === 1 || selected === 2)
            await handler_rebind_keys_add(selected === 1, state);
        else if (selected === 3)
            await get_changed_key_binds(null, state);
    }
}

// C ref: cmd.c handler_change_autocompletions() (2453-2509).  The extcmd
// index remains the selector value even though internal and unavailable rows
// are omitted from the displayed menu.
export async function handler_change_autocompletions(state = game) {
    const flags = state.extcmdFlags ??= initialExtcmdFlags();
    const items = [];
    for (let index = 0; index < extcmdlist.length; ++index) {
        const entry = extcmdlist[index];
        const entryFlags = flags[index];
        if (entryFlags & (INTERNALCMD | CMD_NOT_AVAILABLE)) continue;
        if (entry.ef_txt.length < 2) continue;
        items.push({
            value: index + 1,
            label: `${entryFlags & AUTOCOMP_ADJ ? '*' : ' '} ${entry.ef_txt}: ${entry.ef_desc}`,
            selected: Boolean(entryFlags & AUTOCOMPLETE),
        });
    }
    const picks = await select_menu(state, {
        items,
        how: PICK_ANY,
        title: 'Which commands autocomplete?',
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
    if (picks == null) return;
    const selected = new Set(Array.isArray(picks) ? picks : [picks]);
    for (let index = 0; index < extcmdlist.length; ++index) {
        const entry = extcmdlist[index];
        const entryFlags = flags[index];
        if (entryFlags & (INTERNALCMD | CMD_NOT_AVAILABLE)) continue;
        if (entry.ef_txt.length < 2) continue;
        parseautocomplete(
            entry.ef_txt,
            selected.has(index + 1),
            state,
        );
    }
}

function handlerName(fn) {
    if (typeof fn === 'string') return fn;
    if (fn && typeof fn.ef_funct === 'string') return fn.ef_funct;
    return typeof fn?.name === 'string' ? fn.name : null;
}

function controlKey(byte) {
    return byte & 0x1F;
}

function metaKey(byte) {
    return (byte | 0x80) & 0xFF;
}

function extcmdEntryForHandler(fn) {
    const name = handlerName(fn);
    return extcmdlist.find((entry) => entry.ef_funct === name) ?? null;
}

// C ref: cmd.c bind_key_fn() (3247-3267).  The JavaScript binding model uses
// the extcmd name where C stores the function-table pointer.
export function bind_key_fn(key, fn, state = game) {
    const entry = extcmdEntryForHandler(fn);
    if (!entry || (entry.flags & INTERNALCMD)) return false;
    cmdbind_add(key, entry, false, state);
    return true;
}

// C ref: cmd.c commands_init() (2750-2784).
export function commands_init(state = game) {
    const model = commandBindings(state);
    for (const entry of extcmdlist) {
        if (entry.key) cmdbind_add(entry.key, entry, false, state);
    }
    const there = extcmdlist.find((entry) => entry.ef_txt === 'therecmdmenu');
    const clicklook = extcmdlist.find((entry) => entry.ef_funct === 'doclicklook');
    model.mouseButtons[0] = there?.ef_txt ?? null;
    model.mouseButtons[1] = clicklook?.ef_funct ?? null;
    for (const [key, command] of [
        [controlKey('l'.charCodeAt(0)), 'redraw'],
        ['h'.charCodeAt(0), 'help'],
        ['j'.charCodeAt(0), 'jump'],
        ['k'.charCodeAt(0), 'kick'],
        ['l'.charCodeAt(0), 'loot'],
        [controlKey('n'.charCodeAt(0)), 'annotate'],
        ['N'.charCodeAt(0), 'name'],
        ['u'.charCodeAt(0), 'untrap'],
        ['5'.charCodeAt(0), 'run'],
        [metaKey('5'.charCodeAt(0)), 'rush'],
        ['-'.charCodeAt(0), 'fight'],
        [metaKey('O'.charCodeAt(0)), 'overview'],
        [metaKey('2'.charCodeAt(0)), 'twoweapon'],
        [metaKey('N'.charCodeAt(0)), 'name'],
    ]) bind_key(key, command, false, state);
}

// C ref: cmd.c ext_func_tab_from_func() (3016-3025).
export function ext_func_tab_from_func(fn) {
    return extcmdEntryForHandler(fn);
}

// C ref: cmd.c cmd_from_dir() (3030-3033).
export function cmd_from_dir(dir, mode, state = game) {
    return cmd_from_func(MOVE_FUNCS[dir]?.[mode], state);
}

// C ref: cmd.c cmd_from_func() (3036-3069).
export function cmd_from_func(fn, state = game) {
    const name = handlerName(fn);
    const model = commandBindings(state);
    let fallback = 0;
    for (const binding of model.bindings) {
        const key = binding.key & 0xFF;
        if (key === 0x20) continue;
        if (((key >= 0x30 && key <= 0x39)
                || (key === 0x2D && name === 'do_fight'))
            && !model.numPad) continue;
        const entry = EXTCMD_BY_NAME.get(binding.command);
        if (!entry || entry.ef_funct !== name) continue;
        if (key >= 0x20 && key <= 0x7E) return key;
        fallback = key;
    }
    const space = bindingAt(model.bindings, 0x20);
    if (space && EXTCMD_BY_NAME.get(space.command)?.ef_funct === name)
        return 0x20;
    return fallback;
}

// C ref: cmd.c cmd_from_ecname() (3072-3090).
export function cmd_from_ecname(ecname, state = game) {
    const entry = extcmdlist.find((candidate) => candidate.ef_txt === ecname);
    if (!entry) return '';
    const key = cmd_from_func(entry.ef_funct, state);
    return key ? visctrl(key) : '#' + ecname;
}

// C ref: cmd.c ecname_from_fn() (3093-3107).
export function ecname_from_fn(fn) {
    return extcmdEntryForHandler(fn)?.ef_txt ?? null;
}

function writeOutBuffer(outbuf, value) {
    if (Array.isArray(outbuf)) outbuf[0] = value;
    else if (outbuf && typeof outbuf === 'object') outbuf.value = value;
}

// C ref: cmd.c cmdname_from_func() (3110-3160).  The debugpline2() call has
// no game-state effect; retain its source gap through the shared tracker.
export function cmdname_from_func(fn, outbuf = [], fullname = false, state = game) {
    const entry = extcmdEntryForHandler(fn);
    if (!entry) {
        writeOutBuffer(outbuf, '');
        return '';
    }
    if (fullname) {
        writeOutBuffer(outbuf, entry.ef_txt);
        return entry.ef_txt;
    }
    let length = 0;
    while (length < entry.ef_txt.length) {
        ++length;
        const ambiguous = extcmdlist.some((candidate) => (
            candidate !== entry
            && !(candidate.flags & CMD_NOT_AVAILABLE)
            && (!(candidate.flags & WIZMODECMD) || state.wizard)
            && candidate.ef_txt.startsWith(entry.ef_txt.slice(0, length))
        ));
        if (!ambiguous) break;
    }
    const result = entry.ef_txt.slice(0, length || entry.ef_txt.length);
    writeOutBuffer(outbuf, result);
    if (result !== entry.ef_txt)
        note_unported('pline.c debugpline2');
    return result;
}

const SPECIAL_KEY_NAMES = Object.freeze([
    'getdir.self', 'getdir.self2', 'getdir.help', 'getdir.mouse', 'count',
    'getpos.self', 'getpos.pick', 'getpos.pick.quick', 'getpos.pick.once',
    'getpos.pick.verbose', 'getpos.valid', 'getpos.autodescribe',
    'getpos.mon.next', 'getpos.mon.prev', 'getpos.obj.next', 'getpos.obj.prev',
    'getpos.door.next', 'getpos.door.prev', 'getpos.unexplored.next',
    'getpos.unexplored.prev', 'getpos.valid.next', 'getpos.valid.prev',
    'getpos.all.next', 'getpos.all.prev', 'getpos.help', 'getpos.filter',
    'getpos.moveskip', 'getpos.menu',
]);

// C ref: cmd.c bind_specialkey() (3194-3210).
export function bind_specialkey(key, command, state = game) {
    if (!SPECIAL_KEY_NAMES.includes(command)) return false;
    commandBindings(state).specialKeys[command] = key & 0xFF;
    return true;
}

// C ref: cmd.c spkey_name() (3213-3224).
export function spkey_name(nhkf) {
    if (nhkf === 'escape' || nhkf === 0) return 'escape';
    return SPECIAL_KEY_NAMES[nhkf - 1] ?? null;
}

// C ref: cmd.c all_options_autocomplete() (3296-3311).
export function all_options_autocomplete(sbuf, state = game) {
    const flags = state.extcmdFlags ??= initialExtcmdFlags();
    for (let index = 0; index < extcmdlist.length; ++index) {
        if (!(flags[index] & AUTOCOMP_ADJ)) continue;
        appendBindText(
            sbuf,
            `AUTOCOMPLETE=${flags[index] & AUTOCOMPLETE ? '' : '!'}${extcmdlist[index].ef_txt}\n`,
        );
    }
}

let savedMouseButtons = null;

// C ref: cmd.c lock_mouse_buttons() (3314-3333).
export function lock_mouse_buttons(savebtns, state = game) {
    const buttons = commandBindings(state).mouseButtons;
    if (savebtns) {
        savedMouseButtons = [...buttons];
        buttons[0] = null;
        buttons[1] = null;
    } else if (savedMouseButtons) {
        buttons[0] = savedMouseButtons[0];
        buttons[1] = savedMouseButtons[1];
    }
}

// C ref: cmd.c reset_commands() (3336-3508).  Binding mutation is delegated
// to command_bindings.js, which owns the C cmdbinds equivalent.
export function reset_commands(initial = false, state = game) {
    state.iflags ??= {};
    state.flags ??= {};
    const model = commandBindings(state);
    let updated = 0;
    if (initial) {
        updated = 1;
        model.numPad = false;
        model.pcHack = false;
        model.phone = false;
        model.swapYZ = false;
        for (const [name, key] of Object.entries(SOURCE_SPECIAL_KEY_DEFAULTS))
            model.specialKeys[name] = key.charCodeAt(0);
        commands_init(state);
        resetCommandBindingModel(model, false, 0, true);
    } else {
        const numberPad = Boolean(state.iflags.num_pad);
        const mode = state.iflags.num_pad_mode ?? 0;
        const next = {
            numPad: numberPad,
            swapYZ: Boolean(mode & 1) && !numberPad,
            pcHack: Boolean(mode & 1) && numberPad,
            phone: Boolean(mode & 2) && numberPad,
        };
        if (Object.keys(next).some((key) => model[key] !== next[key]))
            updated = 1;
        resetCommandBindingModel(model, numberPad, mode);
    }
    if (updated) state.serialno = (state.serialno ?? 0) + 1;
    const direction = !model.numPad
        ? (model.swapYZ ? 'hzkulnjb><' : 'hykulnjb><')
        : (model.phone ? '41236987><' : '47896321><');
    state.dirchars = direction;
    state.alphadirchars = model.numPad ? 'hykulnjb><' : direction;
    update_rest_on_space(state);
    state.extcmd_char = cmd_from_func(doextcmd, state);
}

// C ref: cmd.c update_rest_on_space() (3511-3550).
export function update_rest_on_space(state = game) {
    state.flags ??= {};
    updateRestOnSpaceModel(
        commandBindings(state),
        Boolean(state.flags.rest_on_space),
    );
}

// C ref: cmd.c random_response() (3553-3580).  The optional buffer form keeps
// the C out-parameter shape; the returned string is convenient for JS callers.
export function random_response(bufferOrSize, sizeOrState, maybeState) {
    const buffer = typeof bufferOrSize === 'number' ? null : bufferOrSize;
    const size = typeof bufferOrSize === 'number' ? bufferOrSize : sizeOrState;
    const state = typeof bufferOrSize === 'number' ? sizeOrState : maybeState ?? game;
    let response = '';
    const limit = Math.max(0, (Number(size) || 0) - 1);
    for (;;) {
        const key = randomkey(state);
        if (key === 0x0A) break;
        if (key === ESC) {
            response = '';
            break;
        }
        // C keeps drawing until newline or ESC even after the output buffer
        // is full; only the write is bounded by sz - 1.
        if (response.length < limit)
            response += String.fromCharCode(key);
    }
    if (Array.isArray(buffer)) buffer[0] = response;
    else if (buffer && typeof buffer === 'object') buffer.value = response;
    return response;
}

// C ref: cmd.c rnd_extcmd_idx() (3583-3587).
export function rnd_extcmd_idx() {
    return rn2(extcmdlist.length + 1) - 1;
}

// Source-named implementation of cmd.c reset_cmd_vars().
export function reset_cmd_vars(resetCmdq = true, state = game) {
    state.context ??= {};
    state.iflags ??= {};
    state.context.run = 0;
    state.context.nopick = 0;
    state.context.forcefight = 0;
    state.context.move = 0;
    state.context.mv = 0;
    state.domoveAttempting = 0;
    state.multi = 0;
    state.iflags.menu_requested = false;
    state.context.travel = 0;
    state.context.travel1 = 0;
    state.travelmap = null;
    if (resetCmdq) {
        cmdq_clear(CQ_CANNED, state);
        cmdq_clear(CQ_REPEAT, state);
    }
}

// Casing-compatible bridge for existing callers in this file.
export function resetCommandVars(state = game, resetCmdq = true) {
    return reset_cmd_vars(resetCmdq, state);
}

// C ref: cmd.c directionname() (4313-4325).
export function directionname(dir) {
    return ['west', 'northwest', 'north', 'northeast', 'east', 'southeast',
        'south', 'southwest', 'down', 'up'][dir] ?? 'invalid';
}

function commandMenuResult(state, name, ...args) {
    const callback = state[name];
    if (typeof callback === 'function') return callback(...args);
    if (!state?.u) {
        throw new UnsupportedHeroCommandBoundaryError(`cmd.c ${name}()`);
    }
    if (name === 'hereCmdMenu') return here_cmd_menu(state);
    if (name === 'thereCmdMenu') return there_cmd_menu(...args, state);
    throw new UnsupportedHeroCommandBoundaryError(`cmd.c ${name}()`);
}

// C ref: cmd.c doherecmdmenu() (4328-4340).
export async function doherecmdmenu(state = game) {
    const ch = await commandMenuResult(state, 'hereCmdMenu');
    return ch && ch !== ESC ? ECMD_TIME : ECMD_OK;
}

// C ref: cmd.c dotherecmdmenu() (4343-4420).
export async function dotherecmdmenu(state = game) {
    state.iflags ??= {};
    state.clicklook_cc ??= { x: -1, y: -1 };
    state.iflags.getdir_click = 1 | 2;
    const x = state.clicklook_cc.x;
    const y = state.clicklook_cc.y;
    const ux = state.u?.ux ?? 0;
    const uy = state.u?.uy ?? 0;
    if (isok(x, y)) {
        const ch = x === ux && y === uy
            ? await commandMenuResult(state, 'hereCmdMenu')
            : await commandMenuResult(state, 'thereCmdMenu', x, y, state.iflags.getdir_click);
        state.clicklook_cc.x = -1;
        state.clicklook_cc.y = -1;
        state.iflags.getdir_click = 0;
        return ch && ch !== ESC ? ECMD_TIME : ECMD_OK;
    }
    const dir = await getdir(null, state);
    const click = state.iflags.getdir_click;
    state.iflags.getdir_click = 0;
    if (!dir || !isok(ux + state.u.dx, uy + state.u.dy)) return ECMD_CANCEL;
    const ch = state.u.dx || state.u.dy
        ? await commandMenuResult(
            state, 'thereCmdMenu', ux + state.u.dx, uy + state.u.dy, click,
        )
        : await commandMenuResult(state, 'hereCmdMenu');
    return ch && ch !== ESC ? ECMD_TIME : ECMD_OK;
}

// C ref: cmd.c mcmd_addmenu() (4421-4434).  Menu windows are represented by
// their item arrays in JavaScript; preserve the C selector and text fields.
export function mcmd_addmenu(win, act, txt) {
    const item = { value: act, label: txt };
    if (Array.isArray(win)) win.push(item);
    else if (win && Array.isArray(win.items)) win.items.push(item);
    return item;
}

// C ref: cmd.c enum menucmd (4378-4414). Keep the numeric order because the
// menu stores the action integer and selects it after the menu window closes.
export const MCMD = Object.freeze({
    NOTHING: 0,
    OPEN_DOOR: 1,
    LOCK_DOOR: 2,
    UNTRAP_DOOR: 3,
    KICK_DOOR: 4,
    CLOSE_DOOR: 5,
    SEARCH: 6,
    LOOK_TRAP: 7,
    UNTRAP_TRAP: 8,
    MOVE_DIR: 9,
    RIDE: 10,
    REMOVE_SADDLE: 11,
    APPLY_SADDLE: 12,
    TALK: 13,
    NAME: 14,
    QUAFF: 15,
    DIP: 16,
    SIT: 17,
    UP: 18,
    DOWN: 19,
    DISMOUNT: 20,
    MONABILITY: 21,
    PICKUP: 22,
    LOOT: 23,
    TIP: 24,
    EAT: 25,
    DROP: 26,
    REST: 27,
    LOOK_HERE: 28,
    LOOK_AT: 29,
    ATTACK_NEXT2U: 30,
    UNTRAP_HERE: 31,
    OFFER: 32,
    INVENTORY: 33,
    CAST_SPELL: 34,
    THROW_OBJ: 35,
    TRAVEL: 36,
});

function tileAt(x, y, state) {
    return state.level?.at?.(x, y) ?? null;
}

function terrainAt(x, y, state) {
    const tile = tileAt(x, y, state);
    return typeof tile === 'object' ? tile?.typ ?? 0 : tile ?? 0;
}

function doorMaskAt(x, y, state) {
    const tile = tileAt(x, y, state);
    return typeof tile === 'object'
        ? tile?.doormask ?? tile?.flags ?? 0 : 0;
}

function objectAt(x, y, state) {
    return vobj_at(x, y, state);
}

function next2u(x, y, state) {
    return !u_at(x, y, state)
        && dist2(x, y, state.u.ux, state.u.uy) <= 2;
}

function commandEntryForHandler(handler) {
    if (handler === 'dotravel_target') return EXTCMD_BY_NAME.get('retravel');
    return extcmdlist.find((entry) => entry.ef_funct === handler) ?? null;
}

function queueHandler(handler, state) {
    const entry = commandEntryForHandler(handler);
    if (!entry) {
        note_unported(`cmd.c command queue handler ${handler}`);
        return false;
    }
    cmdq_add_ec(CQ_CANNED, entry, state);
    return true;
}

// C ref: cmd.c there_cmd_menu_self() (4435-4521).
export function there_cmd_menu_self(win, x, y, act, state = game) {
    let K = 0;
    const typ = terrainAt(x, y, state);
    const stway = stairway_at(x, y, state);
    const add = (action, text) => {
        mcmd_addmenu(win, action, text);
        ++K;
    };
    if (!u_at(x, y, state)) return K;

    if ((IS_FOUNTAIN(typ) || IS_SINK(typ))
        && can_reach_floor(false, state)) {
        add(MCMD.QUAFF, `Drink from the ${IS_FOUNTAIN(typ) ? 'fountain' : 'sink'}`);
    }
    if (IS_FOUNTAIN(typ) && can_reach_floor(false, state))
        add(MCMD.DIP, 'Dip something into the fountain');
    if (IS_THRONE(typ)) add(MCMD.SIT, 'Sit on the throne');
    if (IS_ALTAR(typ)) add(MCMD.OFFER, 'Sacrifice something on the altar');

    if (stway?.up)
        add(MCMD.UP, `Go up the ${stway.isladder ? 'ladder' : 'stairs'}`);
    if (stway && !stway.up)
        add(MCMD.DOWN, `Go down the ${stway.isladder ? 'ladder' : 'stairs'}`);
    if (state.u?.usteed) {
        const name = x_monnam(
            state.u.usteed, ARTICLE_THE, null, SUPPRESS_SADDLE, false, state,
        );
        add(MCMD.DISMOUNT, `Dismount ${name}`);
    }

    const otmp = objectAt(x, y, state);
    if (otmp) {
        add(MCMD.PICKUP, `Pick up ${otmp.nexthere ? 'items' : donameFresh(otmp, state)}`);
        if (isContainer(otmp)) {
            add(MCMD.LOOT, `Loot ${donameFresh(otmp, state)}`);
            add(MCMD.TIP, `Tip ${donameFresh(otmp, state)}`);
        }
        if (otmp.oclass === FOOD_CLASS)
            add(MCMD.EAT, `Eat ${donameFresh(otmp, state)}`);
    }
    if (state.invent) {
        add(MCMD.INVENTORY, 'Inventory');
        add(MCMD.DROP, 'Drop items');
    }
    add(MCMD.REST, 'Rest one turn');
    add(MCMD.SEARCH, 'Search around you');
    add(MCMD.LOOK_HERE, 'Look at what is here');
    if (num_spells(state) > 0) add(MCMD.CAST_SPELL, 'Cast a spell');

    const trap = t_at(x, y, state);
    if (trap?.tseen && trap.ttyp !== VIBRATING_SQUARE) {
        add(MCMD.UNTRAP_HERE, 'Attempt to disarm trap');
    }
    return K;
}

// C ref: cmd.c there_cmd_menu_next2u() (4524-4617).
export function there_cmd_menu_next2u(win, x, y, mod, act, state = game) {
    let K = 0;
    const typ = terrainAt(x, y, state);
    const add = (action, text) => {
        mcmd_addmenu(win, action, text);
        ++K;
    };
    if (!next2u(x, y, state)) return K;

    if (IS_DOOR(typ)) {
        const dm = doorMaskAt(x, y, state);
        if (dm & (D_CLOSED | D_LOCKED)) {
            add(MCMD.OPEN_DOOR, 'Open the door');
            const keyOrPick = Boolean(
                carrying(SKELETON_KEY, state) || carrying(LOCK_PICK, state),
            );
            const card = Boolean(carrying(CREDIT_CARD, state));
            if (keyOrPick || card) {
                add(
                    MCMD.LOCK_DOOR,
                    upstart(`${keyOrPick ? 'lock or ' : ''}unlock the door`),
                );
            }
            add(MCMD.UNTRAP_DOOR, 'Search the door for a trap');
            add(MCMD.KICK_DOOR, 'Kick the door');
        } else if ((dm & D_ISOPEN) && mod === CLICK_2) {
            add(MCMD.CLOSE_DOOR, 'Close the door');
        }
    }
    if (typ <= SCORR) add(MCMD.SEARCH, 'Search for secret doors');

    const trap = t_at(x, y, state);
    if (trap?.tseen) {
        add(MCMD.LOOK_TRAP, 'Examine trap');
        if (trap.ttyp !== VIBRATING_SQUARE)
            add(MCMD.UNTRAP_TRAP, 'Attempt to disarm trap');
        add(MCMD.MOVE_DIR, 'Move on the trap');
    }
    if (glyph_at(x, y, state) === objnum_to_glyph(BOULDER))
        add(MCMD.MOVE_DIR, 'Push the boulder');

    let mtmp = m_at(x, y, state);
    if (mtmp && !canSpotMonster(mtmp, state)) mtmp = null;
    if (mtmp && which_armor(mtmp, W_SADDLE, state)) {
        const mnam = x_monnam(mtmp, ARTICLE_THE, null, SUPPRESS_SADDLE, false, state);
        if (!state.u?.usteed) add(MCMD.RIDE, `Ride ${mnam}`);
        add(MCMD.REMOVE_SADDLE, `Remove saddle from ${mnam}`);
    }
    if (mtmp && can_saddle(mtmp) && !which_armor(mtmp, W_SADDLE, state)
        && carrying(SADDLE, state)) {
        add(MCMD.APPLY_SADDLE, `Put saddle on ${mon_nam(mtmp, state)}`);
    }
    if (mtmp && (mtmp.mpeaceful || mtmp.mtame)) {
        add(MCMD.TALK, `Talk to ${mon_nam(mtmp, state)}`);
        add(MCMD.MOVE_DIR, `Swap places with ${mon_nam(mtmp, state)}`);
        add(
            MCMD.NAME,
            `${mtmp.mgivenname ? 'Rename' : 'Name'} ${mon_nam(mtmp, state)}`,
        );
    }
    if ((mtmp && !(mtmp.mpeaceful || mtmp.mtame))
        || glyph_is_invisible(glyph_at(x, y, state))) {
        add(
            MCMD.ATTACK_NEXT2U,
            `Attack ${mtmp ? mon_nam(mtmp, state) : 'unseen creature'}`,
        );
        if (act && typeof act === 'object') act.value = MCMD.ATTACK_NEXT2U;
        else if (Array.isArray(act)) act[0] = MCMD.ATTACK_NEXT2U;
    }
    return K;
}

// C ref: cmd.c there_cmd_menu_far() (4620-4633).
export function there_cmd_menu_far(win, x, y, mod, state = game) {
    let K = 0;
    if (mod === CLICK_1) {
        if (linedup(state.u.ux, state.u.uy, x, y, 1, { state })
            && dist2(state.u.ux, state.u.uy, x, y) < 18 * 18) {
            mcmd_addmenu(win, MCMD.THROW_OBJ, 'Throw something');
            ++K;
        }
        mcmd_addmenu(win, MCMD.TRAVEL, 'Travel here');
        ++K;
    }
    return K;
}

// C ref: cmd.c there_cmd_menu_common() (4636-4651).
export function there_cmd_menu_common(win, x, y, mod, act, state = game) {
    let K = 0;
    if (mod === CLICK_1 || mod === CLICK_2) {
        const heroGlyph = hero_glyph_info(state)?.glyph;
        if (!u_at(x, y, state) || Upolyd(state.u)
            || glyph_at(x, y, state) !== heroGlyph) {
            mcmd_addmenu(win, MCMD.LOOK_AT, 'Look at map symbol');
            ++K;
        }
    }
    return K;
}

function actionValue(act) {
    if (act && typeof act === 'object') return act.value ?? act[0] ?? MCMD.NOTHING;
    return act;
}

// C ref: cmd.c act_on_act() (4654-4797).
export function act_on_act(act, dx, dy, state = game) {
    const action = actionValue(act);
    if (![MCMD.THROW_OBJ, MCMD.TRAVEL, MCMD.LOOK_AT].includes(action)) {
        dx = sgn(dx);
        dy = sgn(dy);
    }
    const dir = xytodir(dx, dy);
    const queueMove = () => queueHandler(MOVE_FUNCS[dir]?.[MV_WALK], state);
    switch (action) {
    case MCMD.TRAVEL:
        state.iflags ??= {};
        state.iflags.travelcc = { x: state.u.ux + dx, y: state.u.uy + dy };
        state.u.tx = state.iflags.travelcc.x;
        state.u.ty = state.iflags.travelcc.y;
        queueHandler('dotravel_target', state);
        break;
    case MCMD.THROW_OBJ:
        queueHandler('dothrow', state);
        cmdq_add_userinput(CQ_CANNED, state);
        cmdq_add_dir(CQ_CANNED, dx, dy, 0, state);
        break;
    case MCMD.OPEN_DOOR: queueHandler('doopen', state); cmdq_add_dir(CQ_CANNED, dx, dy, 0, state); break;
    case MCMD.LOCK_DOOR: {
        const otmp = carrying(SKELETON_KEY, state)
            ?? carrying(LOCK_PICK, state) ?? carrying(CREDIT_CARD, state);
        if (otmp) {
            queueHandler('doapply', state);
            cmdq_add_key(CQ_CANNED, otmp.invlet, state);
            cmdq_add_dir(CQ_CANNED, dx, dy, 0, state);
            cmdq_add_key(CQ_CANNED, 'y'.charCodeAt(0), state);
        }
        break;
    }
    case MCMD.UNTRAP_DOOR: queueHandler('dountrap', state); cmdq_add_dir(CQ_CANNED, dx, dy, 0, state); break;
    case MCMD.KICK_DOOR: queueHandler('dokick', state); cmdq_add_dir(CQ_CANNED, dx, dy, 0, state); break;
    case MCMD.CLOSE_DOOR: queueHandler('doclose', state); cmdq_add_dir(CQ_CANNED, dx, dy, 0, state); break;
    case MCMD.SEARCH: queueHandler('dosearch', state); break;
    case MCMD.LOOK_TRAP: queueHandler('doidtrap', state); cmdq_add_dir(CQ_CANNED, dx, dy, 0, state); break;
    case MCMD.UNTRAP_TRAP: queueHandler('dountrap', state); cmdq_add_dir(CQ_CANNED, dx, dy, 0, state); break;
    case MCMD.MOVE_DIR: queueMove(); break;
    case MCMD.RIDE: queueHandler('doride', state); cmdq_add_dir(CQ_CANNED, dx, dy, 0, state); break;
    case MCMD.REMOVE_SADDLE:
        queueHandler('do_reqmenu', state);
        queueHandler('doloot', state);
        cmdq_add_dir(CQ_CANNED, dx, dy, 0, state);
        cmdq_add_key(CQ_CANNED, 'y'.charCodeAt(0), state);
        break;
    case MCMD.APPLY_SADDLE: {
        const saddle = carrying(SADDLE, state);
        if (saddle) {
            queueHandler('doapply', state);
            cmdq_add_key(CQ_CANNED, saddle.invlet, state);
            cmdq_add_dir(CQ_CANNED, dx, dy, 0, state);
        }
        break;
    }
    case MCMD.ATTACK_NEXT2U: queueMove(); break;
    case MCMD.TALK: queueHandler('dotalk', state); cmdq_add_dir(CQ_CANNED, dx, dy, 0, state); break;
    case MCMD.NAME:
        queueHandler('docallcmd', state);
        cmdq_add_key(CQ_CANNED, 'm'.charCodeAt(0), state);
        cmdq_add_dir(CQ_CANNED, dx, dy, 0, state);
        break;
    case MCMD.QUAFF: queueHandler('dodrink', state); cmdq_add_key(CQ_CANNED, 'y'.charCodeAt(0), state); break;
    case MCMD.DIP: queueHandler('dodip', state); cmdq_add_userinput(CQ_CANNED, state); cmdq_add_key(CQ_CANNED, 'y'.charCodeAt(0), state); break;
    case MCMD.SIT: queueHandler('dosit', state); break;
    case MCMD.UP: queueHandler('doup', state); break;
    case MCMD.DOWN: queueHandler('dodown', state); break;
    case MCMD.DISMOUNT: queueHandler('doride', state); break;
    case MCMD.MONABILITY: queueHandler('domonability', state); break;
    case MCMD.PICKUP: queueHandler('dopickup', state); break;
    case MCMD.LOOT: queueHandler('doloot', state); break;
    case MCMD.TIP: queueHandler('dotip', state); cmdq_add_key(CQ_CANNED, 'y'.charCodeAt(0), state); break;
    case MCMD.EAT:
        queueHandler('doeat', state);
        cmdq_add_key(CQ_CANNED, 'y'.charCodeAt(0), state);
        break;
    case MCMD.DROP: queueHandler('dodrop', state); break;
    case MCMD.INVENTORY: queueHandler('ddoinv', state); break;
    case MCMD.REST: queueHandler('donull', state); break;
    case MCMD.LOOK_HERE: queueHandler('dolook', state); break;
    case MCMD.LOOK_AT:
        state.clicklook_cc = { x: state.u.ux + dx, y: state.u.uy + dy };
        queueHandler('doclicklook', state);
        break;
    case MCMD.UNTRAP_HERE: queueHandler('dountrap', state); cmdq_add_dir(CQ_CANNED, 0, 0, 1, state); break;
    case MCMD.OFFER: queueHandler('dosacrifice', state); cmdq_add_userinput(CQ_CANNED, state); break;
    case MCMD.CAST_SPELL: queueHandler('docast', state); break;
    default: break;
    }
}

// C ref: cmd.c there_cmd_menu() (4800-4897). The JS menu window returns one
// scalar action for PICK_ONE; null is C's zero-pick cancellation.
export async function there_cmd_menu(x, y, mod, state = game) {
    const items = [];
    const act = { value: MCMD.NOTHING };
    let K = 0;
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    if (u_at(x, y, state)) K += there_cmd_menu_self(items, x, y, act, state);
    else if (next2u(x, y, state))
        K += there_cmd_menu_next2u(items, x, y, mod, act, state);
    else K += there_cmd_menu_far(items, x, y, mod, state);
    K += there_cmd_menu_common(items, x, y, mod, act, state);

    if (!K) {
        if (next2u(x, y, state)
            && await test_move(state.u.ux, state.u.uy, dx, dy, 1, state)) {
            queueHandler(MOVE_FUNCS[xytodir(dx, dy)]?.[MV_WALK], state);
        } else if (state.flags?.travelcmd) {
            state.iflags ??= {};
            state.iflags.travelcc = { x, y };
            state.u.tx = x;
            state.u.ty = y;
            queueHandler('dotravel_target', state);
        }
        return '\0';
    }
    if (K === 1 && act.value !== MCMD.NOTHING && act.value !== MCMD.TRAVEL) {
        act_on_act(act.value, dx, dy, state);
        return '\0';
    }
    const picked = await select_menu(state, {
        items,
        how: PICK_ONE,
        title: 'What do you want to do?',
        cancelValue: null,
        behavior: MENU_BEHAVE_STANDARD,
    });
    if (picked !== null && picked !== undefined) {
        act_on_act(picked, dx, dy, state);
        return '\0';
    }
    return ESC;
}

// C ref: cmd.c here_cmd_menu() (4900-4906).
export async function here_cmd_menu(state = game) {
    await there_cmd_menu(state.u.ux, state.u.uy, CLICK_1, state);
    return '\0';
}

// C ref: cmd.c click_to_cmd() (4909-4919).
export function click_to_cmd(x, y, mod, state = game) {
    state.clicklook_cc = { x, y };
    const command = commandBindings(state).mouseButtons?.[mod - 1];
    const entry = typeof command === 'string'
        ? EXTCMD_BY_NAME.get(command)
            ?? extcmdlist.find((row) => row.ef_funct === command)
        : command;
    if (entry) cmdq_add_ec(CQ_CANNED, entry, state);
}

// C ref: cmd.c domouseaction() (4922-5015). Travel clicks choose the nearest
// cardinal/diagonal direction only when the click is within one square; a
// farther click stores the absolute travel target.
export async function domouseaction(state = game) {
    const click = state.clicklook_cc ?? { x: -1, y: -1 };
    let x = click.x - state.u.ux;
    let y = click.y - state.u.uy;
    if (state.flags?.travelcmd) {
        if (Math.abs(x) <= 1 && Math.abs(y) <= 1) {
            x = sgn(x);
            y = sgn(y);
        } else {
            state.iflags ??= {};
            state.iflags.travelcc = { x: state.u.ux + x, y: state.u.uy + y };
            state.u.tx = state.iflags.travelcc.x;
            state.u.ty = state.iflags.travelcc.y;
            queueHandler('dotravel_target', state);
            return ECMD_OK;
        }
        if (!x && !y) {
            const typ = terrainAt(state.u.ux, state.u.uy, state);
            const otmp = objectAt(state.u.ux, state.u.uy, state);
            if (IS_FOUNTAIN(typ) || IS_SINK(typ)) queueHandler('dodrink', state);
            else if (IS_THRONE(typ)) queueHandler('dosit', state);
            else if (stairway_at(state.u.ux, state.u.uy, state)?.up)
                queueHandler('doup', state);
            else if (stairway_at(state.u.ux, state.u.uy, state))
                queueHandler('dodown', state);
            else if (otmp) queueHandler(isContainer(otmp) ? 'doloot' : 'dopickup', state);
            else queueHandler('donull', state);
            return ECMD_OK;
        }
        const dir = xytodir(x, y);
        const target = m_at(state.u.ux + x, state.u.uy + y, state);
        if (!target && !await test_move(state.u.ux, state.u.uy, x, y, 1, state)) {
            const typ = terrainAt(state.u.ux + x, state.u.uy + y, state);
            const dm = doorMaskAt(state.u.ux + x, state.u.uy + y, state);
            if (IS_DOOR(typ)) {
                if (dm & D_LOCKED) queueHandler('dokick', state);
                else if (dm & D_CLOSED) queueHandler('doopen', state);
                else if (typ <= SCORR) queueHandler('dosearch', state);
                else queueHandler(MOVE_FUNCS[dir]?.[MV_WALK], state);
            } else if (typ <= SCORR) queueHandler('dosearch', state);
            else queueHandler(MOVE_FUNCS[dir]?.[MV_WALK], state);
            return ECMD_OK;
        }
    } else {
        if (x > 2 * Math.abs(y)) [x, y] = [1, 0];
        else if (y > 2 * Math.abs(x)) [x, y] = [0, 1];
        else if (x < -2 * Math.abs(y)) [x, y] = [-1, 0];
        else if (y < -2 * Math.abs(x)) [x, y] = [0, -1];
        else [x, y] = [sgn(x), sgn(y)];
        if (!x && !y) {
            queueHandler('donull', state);
            return ECMD_OK;
        }
    }
    queueHandler(MOVE_FUNCS[xytodir(x, y)]?.[MV_WALK], state);
    return ECMD_OK;
}

// C ref: cmd.c doclicklook() (5381-5390), the internal command queued by the
// map-symbol menu. pager.c owns the description text in this port.
export async function doclicklook(state = game) {
    const cc = state.clicklook_cc ?? { x: -1, y: -1 };
    if (!isok(cc.x, cc.y)) return ECMD_OK;
    state.context.move = 0;
    const description = do_screen_description(cc, true, 0, state);
    if (description?.found) await ttyPline(description.firstmatch, state);
    return ECMD_OK;
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
    if (!state.in_doagain && entry.ef_funct !== 'do_repeat'
        && entry.ef_funct !== 'doextcmd') {
        cmdq_clear(CQ_REPEAT, state);
        cmdq_add_ec(CQ_REPEAT, entry, state);
    }
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
    case 'done2':
        // C ref: end.c done2(), the #quit handler. Its accepted path calls
        // done(QUIT), while the cancellation path returns ECMD_OK after it
        // restores the command loop.
        return await done2(state);
    case 'doprev_message':
        return doprev_message(state);
    case 'enter_explore_mode':
        return await enter_explore_mode(state);
    case 'dolookaround':
        return await dolookaround(state);
    case 'doherecmdmenu':
        return await doherecmdmenu(state);
    case 'dotherecmdmenu':
        return await dotherecmdmenu(state);
    case 'dotoggleoption':
        return await dotoggleoption(state);
    case 'do_move_west':
        return do_move_west(state);
    case 'do_move_northwest':
        return do_move_northwest(state);
    case 'do_move_north':
        return do_move_north(state);
    case 'do_move_northeast':
        return do_move_northeast(state);
    case 'do_move_east':
        return do_move_east(state);
    case 'do_move_southeast':
        return do_move_southeast(state);
    case 'do_move_south':
        return do_move_south(state);
    case 'do_move_southwest':
        return do_move_southwest(state);
    case 'do_rush_west':
        return do_rush_west(state);
    case 'do_rush_northwest':
        return do_rush_northwest(state);
    case 'do_rush_north':
        return do_rush_north(state);
    case 'do_rush_northeast':
        return do_rush_northeast(state);
    case 'do_rush_east':
        return do_rush_east(state);
    case 'do_rush_southeast':
        return do_rush_southeast(state);
    case 'do_rush_south':
        return do_rush_south(state);
    case 'do_rush_southwest':
        return do_rush_southwest(state);
    case 'do_run_west':
        return do_run_west(state);
    case 'do_run_northwest':
        return do_run_northwest(state);
    case 'do_run_north':
        return do_run_north(state);
    case 'do_run_northeast':
        return do_run_northeast(state);
    case 'do_run_east':
        return do_run_east(state);
    case 'do_run_southeast':
        return do_run_southeast(state);
    case 'do_run_south':
        return do_run_south(state);
    case 'do_run_southwest':
        return do_run_southwest(state);
    case 'do_rush':
        return do_rush(state);
    case 'do_run':
        return do_run(state);
    case 'do_repeat':
        return do_repeat(state);
    case 'dosh_core':
        return await dosh_core(state);
    case 'dosuspend_core':
        return await dosuspend_core(state);
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
    case 'doterrain':
        return await runTerrainCommand(key, state);
    case 'doeat':
        return await runEatCommand(key, state);
    case 'doengrave':
        return await runEngraveCommand(key, state);
    case 'dohelp':
        return await runHelpCommand(key, state);
    case 'dowhatis':
        return await runWhatisCommand(key, state);
    case 'doquickwhatis':
        return await runGlanceCommand(key, state);
    case 'doprgold':
        await failClosedCommand(key, state, () => doprgold(state));
        return ECMD_OK;
    case 'doprwep':
        await failClosedCommand(key, state, () => doprwep(state, inventoryMenuHooks(state)));
        return ECMD_OK;
    case 'doprarm':
        await failClosedCommand(key, state, () => doprarm(state, inventoryMenuHooks(state)));
        return ECMD_OK;
    case 'doprring':
        await failClosedCommand(key, state, () => doprring(state, inventoryMenuHooks(state)));
        return ECMD_OK;
    case 'dopramulet':
        await failClosedCommand(key, state, () => dopramulet(state, inventoryMenuHooks(state)));
        return ECMD_OK;
    case 'doread':
        return await runReadCommand(key, state);
    case 'dowieldquiver':
        return await failClosedCommand(
            key, state, () => dowieldquiver(state),
        );
    case 'doapply':
        return await runApplyCommand(key, state);
    case 'dorub':
        return await runRubCommand(key, state);
    case 'dozap':
        return await runZapCommand(key, state);
    case 'docast':
        return await runCastCommand(key, state);
    case 'dodown':
        return await runDownCommand(key, state);
    case 'doup':
        return await runUpCommand(key, state);
    case 'dodrop':
        return await runDropCommand(key, state);
    case 'dopickup':
        return await runPickupCommand(key, state);
    case 'doloot':
        return await runLootCommand(key, state);
    case 'doopen':
        return await runOpenCommand(key, state);
    case 'dotogglepickup':
        await dotogglepickup(state);
        return ECMD_OK;
    case 'dotakeoff':
        return await runTakeOffCommand(key, state);
    case 'dowear':
        return await runWearCommand(key, state);
    case 'doputon':
        return await runPutonCommand(key, state);
    case 'doride':
        // C ref: steed.c doride(), which returns its own ECMD_* result.
        return await doride(state);
    case 'dopray':
        // C ref: pray.c dopray(), which returns its own ECMD_* result.
        return await dopray(state);
    case 'dosit':
        // C ref: sit.c dosit(), which returns its own ECMD_* result.
        return await dosit(state);
    case 'dowipe':
        return await failClosedCommand(key, state, () => dowipe(state));
    case 'dokick':
        return await runKickCommand(key, state);
    case 'dotwoweapon':
        return await runTwoWeaponCommand(key, state);
    case 'dotalk':
        return await runChatCommand(key, state);
    case 'docallcmd':
        // C ref: do_name.c docallcmd(), which returns its own ECMD_* result.
        return await docallcmd(state);
    case 'enhance_weapon_skill':
        return await runEnhanceCommand(key, state);
    case 'wiz_level_change':
        return await runLevelChangeCommand(key, state);
    case 'wiz_level_tele':
        return await runLevelTeleCommand(key, state);
    case 'wiz_wish':
        return await runWishCommand(key, state);
    case 'wiz_genesis':
        return await runGenesisCommand(key, state);
    case 'wiz_intrinsic':
        return await runIntrinsicCommand(key, state);
    case 'wiz_polyself':
        return await runPolyselfCommand(key, state);
    case 'domonability':
        return await runMonsterCommand(key, state);
    case 'dosave':
        // C ref: save.c dosave(), which always returns ECMD_OK.
        return await dosave(state);
    case 'do_write_config_file':
        // C ref: cfgfiles.c do_write_config_file(), which returns ECMD_OK
        // after the overwrite query and its file-write attempt.
        return await do_write_config_file(state, {
            message: ttyPline,
            wait: tty_wait_synch,
            query: paranoid_query,
        });
    case 'doforce':
        // C ref: lock.c doforce(), which returns ECMD_OK or ECMD_TIME.
        return await doforce(state);
    case 'dotip':
        // C ref: pickup.c dotip(), which returns its own ECMD_* result.
        return await failClosedCommand(key, state, () => dotip(state));
    case 'dodip':
        // C ref: potion.c dodip(), which returns its own ECMD_* result.
        return await runDipCommand(key, state);
    case 'donamelevel':
        // C ref: dungeon.c donamelevel(), which returns ECMD_OK.
        return await donamelevel(state);
    case 'doinvoke':
        // C ref: artifact.c doinvoke(), which returns its own ECMD_* result.
        return await failClosedCommand(key, state, () => doinvoke(state));
    case 'dountrap':
        // C ref: trap.c dountrap(), which returns ECMD_OK or ECMD_TIME.
        return await dountrap(state);
    default:
        resetCommandVars(state);
        throw new UnsupportedHeroCommandBoundaryError(
            `${entry.ef_funct}() for the extended command '${entry.ef_txt}' is not ported`,
            key,
        );
    }
}

// C ref: rhack():3727's `func = tlist->ef_funct`, resolved for the rows that
// can reach set_occupation(). C hands set_occupation() the same pointer the
// dispatch below calls; this port names its handlers instead, so the row's
// ef_funct is what maps one to the other, as doextcmd()'s switch above does.
//
// Only a row carrying occupation text arrives here, and extcmdlist[] gives
// exactly two rows one: 's'/dosearch at cmd.c:1846-1847 and '.'/donull at
// :1930-1931. Both handlers are ported, so the refusal below is unreachable
// until upstream adds a third row and scripts/generate-extcmds.mjs copies it in.
function timedOccupationFunction(row, key, state) {
    switch (row.ef_funct) {
    case 'dosearch':
        return dosearch;
    case 'donull':
        return donull;
    default:
        resetCommandVars(state);
        throw new UnsupportedHeroCommandBoundaryError(
            `the counted command '${row.ef_txt}' has no ported occupation`,
            key,
        );
    }
}

// C ref: cmd.c rhack(). Only the source handlers the port owns are dispatched
// here. On a fresh read parse() always runs to completion first, so a byte the
// port will not dispatch is refused only after get_count() has consumed and
// echoed its digits and parse()'s closing clear_nhwindow(WIN_MESSAGE) has
// cleared the row: admission happens at the command byte and never at a count
// digit, and the refusal is retryable. A supplied nonzero key (normally cmdKey
// during a repeat) is already logical input and retains the unknown-command
// diagnostic until that handler is ported. key === 0 normally reads a fresh
// command, except that pendingCommand restores the last parsed one first; it
// has one shape only, captureParsedCommand()'s, which carries the parsed count
// so that no keystroke is ever replayed. rhack() has no command-result return;
// context.move reports whether the command took time.
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
                cmdqCommand = queued.ec_entry.ef_txt
                    ?? queued.ec_entry.ef_funct;
            } else {
                key = queued.typ === CMDQ_KEY ? queued.key : 0;
            }
        } else if (firstTime) {
            const pending = state.context.pendingCommand;
            if (pending) {
                key = restoreParsedCommand(pending, state);
            } else {
                key = await parseCommand(state);
                state.context.pendingCommand =
                    captureParsedCommand(key, state);
                newLogicalCommand = true;
            }
            // Admission runs on the parsed command rather than on the byte
            // that opened it, and outside the capture above, so a restored
            // command is re-examined instead of dispatched unchecked.
            admitParsedCommand(key, state);
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
        // C ref: rhack()'s PREFIXCMD arm (3762-3773). A prefix runs its own
        // handler, is remembered in prefix_seen, and jumps back to
        // got_prefix_input for the command it modifies -- so a prefix may
        // follow a prefix, and this is a loop for the same reason C uses a
        // goto. The four PREFIXCMD rows are do_reqmenu, do_fight, do_rush,
        // and do_run.
        let prefixSeen = null;
        let wasMPrefix = false;
        while (command === 'reqmenu' || command === 'fight'
            || command === 'rush' || command === 'run') {
            recordRepeatCommand(command, Boolean(prefixSeen), state);
            let res;
            if (command === 'reqmenu') res = await do_reqmenu(state);
            else if (command === 'fight') res = await do_fight(state);
            else if (command === 'rush') res = await do_rush(state);
            else res = await do_run(state);
            // 3764-3767. A prefix pressed twice cancels the whole command.
            if (res & ECMD_CANCEL) {
                resetCommandVars(state);
                return;
            }
            prefixSeen = command;
            // 3771-3772. was_m_prefix latches on do_reqmenu() and is never
            // cleared, so `Fm` and `mF` both leave the CMD_M_PREFIX rule in
            // force for the command that follows.
            if (command === 'reqmenu') wasMPrefix = true;
            const queuedAfterPrefix = cmdq_pop(state);
            let commandAfterPrefix = null;
            if (queuedAfterPrefix) {
                if (queuedAfterPrefix.typ === CMDQ_EXTCMD
                    && queuedAfterPrefix.ec_entry) {
                    commandAfterPrefix = queuedAfterPrefix.ec_entry.ef_txt
                        ?? queuedAfterPrefix.ec_entry.ef_funct;
                } else {
                    key = queuedAfterPrefix.typ === CMDQ_KEY
                        ? queuedAfterPrefix.key : 0;
                }
            } else {
                key = await parseCommand(state);
                if (firstTime) {
                    state.context.pendingCommand =
                        captureParsedCommand(key, state);
                }
            }
            if (!commandAfterPrefix && (!key || key === 0xFF || key === ESC)) {
                resetCommandVars(state);
                return;
            }
            command = commandAfterPrefix
                ?? commandForKey(commandBindings(state), key);
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
        recordRepeatCommand(command, Boolean(prefixSeen), state);
        // C ref: rhack():3726-3729, where a committed count is spent. A row
        // carrying occupation text becomes a timed occupation, which
        // moveloop_core():485-509 then runs once a turn without reading
        // another key; the command still runs once through the dispatch below
        // first, because parse():5142-5144 already spent one repeat on it.
        //
        // This sits below the prefix loop because each pass through that loop
        // calls parse() again, which zeroes gc.command_count at cmd.c:5102, so
        // only the last parse's count survives to be spent.
        const row = command !== null ? EXTCMD_BY_NAME.get(command) : null;
        if (row?.f_text && !state.go?.occupation && state.multi) {
            set_occupation(
                timedOccupationFunction(row, key, state),
                row.f_text,
                state.multi,
                state,
            );
        } else if (state.multi > 0 && command !== null) {
            // Every other row leaves the count for moveloop_core():515-531 to
            // repeat the command with, and that arm reaches lookaround() and
            // svc.context.mv, neither of which this port drives from a count.
            // A key bound to no command is exempt: the bad-command path below
            // zeroes gm.multi itself, as cmd.c:3841 does.
            //
            // A row that carries occupation text is not exempt when one is
            // already running. It fails the `!go.occupation` term above and C
            // leaves it to the same unported repeat arm, so it is refused
            // here too, which is why the message names the rows this port will
            // not repeat rather than the rows without occupation text. No
            // ported path reaches that state: moveloop_core() returns before
            // rhack() while an occupation is installed, so both of its rhack()
            // calls arrive with go.occupation clear.
            resetCommandVars(state);
            throw new UnsupportedHeroCommandBoundaryError(
                COUNTED_BOUNDARY,
                key,
            );
        }
        if (command === 'doclicklook' || command === 'domouseaction') {
            const result = command === 'doclicklook'
                ? await doclicklook(state) : await domouseaction(state);
            if (result & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((result & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (result & ECMD_TIME) commandTookTime(state);
            return;
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
        if (command === 'repeat') {
            // C ref: do_repeat() returns its nested rhack() result to the
            // ordinary ECMD result arm; the retained CQ_REPEAT copy is
            // restored inside do_repeat() before this branch runs.
            const res = await do_repeat(state);
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
        if (command === 'terrain') {
            // C ref: cmd.c rhack()'s result handling at 3810-3818. doterrain()
            // is a no-time command; its TER_MAP implementation ends at the
            // browse_map()/getpos() boundary with a fail-closed refusal.
            const res = await runTerrainCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'travel') {
            // C ref: cmd.c dotravel() and dotravel_target(). The target
            // selection and cached destination state are ported here; the
            // call into hack.c findtravelpath() is the next boundary.
            const res = await dotravel(key, state);
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
        if (command === 'engrave') {
            const res = await runEngraveCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'help') {
            await runHelpCommand(key, state);
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'whatis') {
            await runWhatisCommand(key, state);
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'glance') {
            await runGlanceCommand(key, state);
            resetCommandVars(state, state.multi < 0);
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
        if (command === 'rub') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818. The
            // ordinary unwielded-lamp arm answers ECMD_TIME after queueing
            // this same command and the lamp letter, so this direct handler
            // must preserve CQ_CANNED while marking the elapsed turn.
            const res = await runRubCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'close') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat` and `apply` arms apply.
            // doclose() reaches all three: ECMD_CANCEL for a cancelled
            // direction prompt, ECMD_OK for the nohands/pit refusals, and
            // ECMD_TIME for every path past the direction prompt (including
            // the self-square refusal and the close roll). The MOVEMENTCMD
            // and domove_attempting tests at 3773-3800 cannot divert it,
            // because cmd.c:1545's "close" row carries no flags at all.
            const res = await runCloseCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'open') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat`, `apply` and `close` arms
            // apply. doopen() reaches ECMD_OK for the nohands refusal, a
            // cancelled direction prompt, and the pit refusal, and ECMD_TIME
            // for every path past the mimic/Confusion/Stunned checks. The
            // u_at delegation to doloot() answers doloot()'s own result. The
            // MOVEMENTCMD and domove_attempting tests at 3773-3800 cannot
            // divert it, because cmd.c:1785's "open" row carries no flags.
            const res = await runOpenCommand(key, state);
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
        if (command === 'cast') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat` and `zap` arms apply.
            // docast() reaches ECMD_FAIL whenever getspell() answers false:
            // an empty spellbook, rejectcasting(), an invalid queued key, or
            // a cancelled spell menu. A cast attempt answers ECMD_TIME.
            // cmd.c:1689's
            // "cast" row carries only IFBURIED -- no prefix flags at all --
            // so an 'm' or 'F' prefix is refused ahead of this arm.
            const res = await runCastCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'quaff') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat` and `zap` arms apply.
            // dodrink() reaches all three: ECMD_OK for the strangled refusal,
            // ECMD_CANCEL for an escaped object prompt, and ECMD_TIME for the
            // quaff that happens. cmd.c:1809's "quaff" row carries
            // CMD_M_PREFIX, so an 'm' prefix sets iflags.menu_requested and
            // skips the fountain/sink/underwater prompts.
            const res = await runQuaffCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'read') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818. The read
            // row at cmd.c:1816 carries no flags, so prefix and movement arms
            // cannot divert it. doread() answers ECMD_OK for an overloaded
            // hero and ECMD_CANCEL when getobj() is escaped; a selected object
            // remains fail-closed before it changes state.
            const res = await runReadCommand(key, state);
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
        if (command === 'up') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the '#', `search`, `eat` and `down` arms apply. The
            // MOVEMENTCMD and domove_attempting tests above them at 3773-3800
            // cannot divert this command: extcmdlist[]'s "up" row carries
            // CMD_M_PREFIX alone, and set_move_cmd(DIR_UP, 0) leaves
            // domove_attempting at 0 because zdir[DIR_UP] is nonzero.
            //
            // doup() answers ECMD_OK for "can't go up here" and the pet
            // holdback, ECMD_TIME for u_rooted/u_stuck_cannot_go/overloaded
            // and for the successful ascent.
            const res = await runUpCommand(key, state);
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
        if (command === 'puton') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the `wear` arm above applies. doputon() reaches
            // all three: ECMD_CANCEL when the getobj() prompt is escaped,
            // ECMD_OK for a hero already wearing all accessories and for
            // each accessory_or_armor_on() refusal, and ECMD_TIME for a
            // ring that goes on. cmd.c:1821's "puton" row carries no flags.
            const res = await runPutonCommand(key, state);
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
        if (command === 'wield') {
            // C ref: rhack()'s result handling at cmd.c:3810-3825. dowield()
            // answers ECMD_CANCEL when the object prompt is escaped,
            // ECMD_FAIL for "already wielding" or "cannot wield", and
            // ECMD_TIME for the wield that happens. cmd.c:1921's "wield"
            // row carries no flags at all, so neither the prefix test at
            // 3693-3695 nor the MOVEMENTCMD and domove_attempting tests at
            // 3773-3800 can divert it.
            const res = await failClosedCommand(
                key, state, () => dowield(state),
            );
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'quiver') {
            // C ref: rhack()'s result handling at cmd.c:3810-3825.
            // doquiver_core() answers ECMD_CANCEL for a cancelled prompt and
            // ECMD_OK when the queued '-' clears the quiver. Quiver changes
            // consume no time unless a later ordinary-item branch unwields a
            // weapon, so this slice reaches only the cost-free result.
            const res = await failClosedCommand(
                key, state, () => dowieldquiver(state),
            );
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        if (command === 'altunwield') {
            // C ref: rhack()'s result handling at cmd.c:3810-3825. The
            // internal row can arrive only from itemactions_pushkeys(), and
            // remarm_swapwep() consumes the queued '-' itself. A valid
            // alternate weapon always answers ECMD_TIME after removing it;
            // a missing or malformed continuation answers ECMD_FAIL.
            const res = await remarm_swapwep(state);
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
        if (command === 'autopickup') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818.
            // dotogglepickup() ends `return ECMD_OK` (options.c:9273), so
            // only reset_cmd_vars() runs. The MOVEMENTCMD and
            // domove_attempting tests at 3773-3800 cannot divert it:
            // extcmdlist[]'s "autopickup" row (cmd.c:1681) carries IFBURIED
            // and GENERALCMD and no movement flag.
            await dotogglepickup(state);
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
        if (command === 'wizgenesis') {
            // C ref: rhack()'s result handling, the same shape the `wizwish`
            // arm above spells out: wizcmds.c:213 ends both arms of
            // wiz_genesis() with `return ECMD_OK`, so reset_cmd_vars() is all
            // of it and creating a monster spends no turn. cmd.c:1961's
            // "wizgenesis" row carries IFBURIED and WIZMODECMD and no movement
            // flag, so the MOVEMENTCMD and domove_attempting tests at
            // 3774-3802 cannot divert it; it carries no CMD_M_PREFIX either,
            // so the prefix test at 3693-3695 refuses `m^G` and `F^G` above.
            await runGenesisCommand(key, state);
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'wizintrinsic') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818.
            // wiz_intrinsic() ends with ECMD_OK and never consumes a turn;
            // the command row carries IFBURIED and WIZMODECMD only.
            await runIntrinsicCommand(key, state);
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'teleport') {
            // C ref: teleport.c dotelecmd() → dotele().
            const trap = t_at(state.u.ux, state.u.uy, state);
            if (trap?.tseen
                && (trap.ttyp === TELEP_TRAP || trap.ttyp === LEVEL_TELEP)) {
                throw new UnsupportedHeroCommandBranchBoundaryError(
                    'dotelecmd: teleport trap interaction unported',
                    key,
                );
            }
            // C ref: dotelecmd() wizard path. Without 'm' prefix,
            // ignore_restrictions=TRUE → dotele(TRUE) skips all checks.
            if (state.wizard && !state.iflags?.menu_requested) {
                if (next_to_u(state)) {
                    if (state.iflags)
                        state.iflags.travelcc = { x: 0, y: 0 };
                    await tele(state);
                    next_to_u(state);
                } else {
                    await ttyPline(
                        'You shudder for a moment.',
                        state,
                    );
                    resetCommandVars(state);
                    return;
                }
                await morehungry(100, state);
                resetCommandVars(state);
                // C ref: teleport.c dotelecmd() returns ECMD_TIME after
                // dotele(TRUE) succeeds; rhack() restores context.move
                // after reset_cmd_vars().
                commandTookTime(state);
                state.go.occupation = null;
                return;
            }
            const prop = state.u?.uprops?.[TELEPORT];
            const hasTeleportation = Boolean(
                (prop?.intrinsic || prop?.extrinsic) && !prop?.blocked,
            );
            const levelOk = state.u.ulevel
                >= (state.urole?.mnum === PM_WIZARD ? 8 : 12);
            const formOk = can_teleport(state.youmonst?.data);
            if (hasTeleportation && (levelOk || formOk)) {
                // C ref: teleport.c dotele() intrinsic teleport path.
                // energy = 5 * objects[SPE_TELEPORT_AWAY].oc_level
                const spellLevel = Math.trunc(
                    state.objects?.[SPE_TELEPORT_AWAY]?.oc_level ?? 6,
                );
                const energy = 5 * spellLevel;
                state.u.uen -= energy;
                state.disp = state.disp || {};
                state.disp.botl = true;
                if (next_to_u(state)) {
                    if (state.iflags)
                        state.iflags.travelcc = { x: 0, y: 0 };
                    await tele(state);
                    next_to_u(state);
                } else {
                    await ttyPline(
                        'You shudder for a moment.',
                        state,
                    );
                    resetCommandVars(state);
                    return;
                }
                await morehungry(100, state);
                resetCommandVars(state);
                // C ref: dotele(FALSE) returns 1 after an intrinsic
                // teleport, which dotelecmd() turns into ECMD_TIME.
                commandTookTime(state);
                state.go.occupation = null;
                return;
            }
            const knownsp = known_spell(SPE_TELEPORT_AWAY, state);
            const confusion = Boolean(
                state.u?.uprops?.[CONFUSION]?.intrinsic
                || state.u?.uprops?.[CONFUSION]?.extrinsic,
            );
            if (knownsp >= spe_Fresh && !confusion) {
                // C ref: teleport.c dotele() (1090-1137), spell-casting path.
                const spellLevel = Math.trunc(
                    state.objects?.[SPE_TELEPORT_AWAY]?.oc_level ?? 6,
                );
                const energy = 5 * spellLevel;
                let cantdoit = null;
                if ((state.u?.uhunger ?? 901) <= 10)
                    cantdoit = 'are too weak from hunger';
                else if (acurr(state, A_STR) < 4)
                    cantdoit = 'lack the strength';
                else if (energy > state.u.uen)
                    cantdoit = 'lack the energy';
                if (cantdoit) {
                    await ttyPline(
                        `You ${cantdoit} for a teleport spell.`, state,
                    );
                    resetCommandVars(state);
                    return;
                }
                if (await check_capacity(
                    'Your concentration falters from carrying so much.',
                    state,
                )) {
                    commandTookTime(state);
                    resetCommandVars(state);
                    state.go.occupation = null;
                    return;
                }
                await exercise(A_WIS, true, state);
                if (await spelleffects(
                    SPE_TELEPORT_AWAY, true, false, state,
                ) & ECMD_TIME) {
                    commandTookTime(state);
                    resetCommandVars(state);
                    state.go.occupation = null;
                    return;
                }
                resetCommandVars(state);
                return;
            }
            if (!hasTeleportation) {
                if (knownsp !== spe_Unknown)
                    await ttyPline("You can't cast that spell.", state);
                else
                    await ttyPline("You don't know that spell.", state);
            } else {
                await ttyPline(
                    'You are not able to teleport at will.',
                    state,
                );
            }
            resetCommandVars(state);
            return;
        }
        if (command === 'save') {
            // C ref: save.c dosave():43-70. dosave() always returns ECMD_OK;
            // on the success path C never returns at all (it calls
            // nh_terminate), so only reset_cmd_vars() runs here. On the
            // success path dosave() sets program_state.gameover, so the
            // moveloop breaks after this rhack() returns. cmd.c:1846's "save"
            // row carries IFBURIED | GENERALCMD | NOFUZZERCMD, no movement
            // flag, so the MOVEMENTCMD and domove_attempting tests at
            // 3773-3800 cannot divert it.
            await dosave(state);
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'shell' || command === 'suspend') {
            const res = command === 'shell'
                ? await dosh_core(state) : await dosuspend_core(state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
            return;
        }
        // These five wrappers answer a boolean rather than an ECMD code. The
        // inventory wrapper's ECMD_OK-equivalent exit can leave a canned item
        // action behind, so it preserves that queue. The other wrappers still
        // fold C's two result arms into one unconditional reset. The fold
        // covers the reset argument alone; the ECMD_TIME
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
        // u.uprops[BLINDED].
        if (command === 'inventory') {
            const elapsed = await runInventoryCommand(key, state);
            if (elapsed) {
                resetCommandVars(state);
                commandTookTime(state);
            } else {
                resetCommandVars(state, state.multi < 0);
            }
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
        if (command === 'showgold') {
            await failClosedCommand(key, state, () => doprgold(state));
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'seeweapon') {
            await failClosedCommand(key, state, () => doprwep(state, inventoryMenuHooks(state)));
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'seearmor') {
            await failClosedCommand(key, state, () => doprarm(state, inventoryMenuHooks(state)));
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'seerings') {
            await failClosedCommand(key, state, () => doprring(state, inventoryMenuHooks(state)));
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'seeamulet') {
            await failClosedCommand(key, state, () => dopramulet(state, inventoryMenuHooks(state)));
            resetCommandVars(state, state.multi < 0);
            return;
        }
        if (command === 'dip') {
            // C ref: rhack()'s result handling at cmd.c:3810-3818, the same
            // three tests the quaff arm applies. dodip() reaches all three:
            // ECMD_OK for the inaccessible-equipment refusal, ECMD_CANCEL
            // for an escaped object prompt, and ECMD_TIME for the dip that
            // happens. cmd.c:1710's "dip" row carries CMD_M_PREFIX, so an
            // 'm' prefix sets iflags.menu_requested and skips the terrain
            // prompts.
            const res = await runDipCommand(key, state);
            if (res & (ECMD_CANCEL | ECMD_FAIL)) resetCommandVars(state);
            else if ((res & (ECMD_OK | ECMD_TIME)) === ECMD_OK)
                resetCommandVars(state, state.multi < 0);
            if (res & ECMD_TIME) commandTookTime(state);
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
        // history is ported. iflags.sanity_no_check suppresses only the debug
        // sanity check.
        cmdq_clear(CQ_CANNED, state);
        cmdq_clear(CQ_REPEAT, state);
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
