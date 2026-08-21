// jsmain.js — Game engine: NethackGame class + per-segment runner.
// C ref: unixmain.c — nethack_main() initialization and game setup.
//
// Contest contract: the judge orchestrates sessions (load JSON,
// normalize v4/v5, loop segments, aggregate scores). It calls
// runSegment(input) for each game segment and reads back
// game.getScreens() / getRngLog() / getCursors() to compare with
// C-recorded session data. Cross-segment state travels through input.storage.
//
// For browser play, see nethack.js (uses NethackGame directly).

import { game, resetGame } from './gstate.js';
import {
    MAX_COMMAND_COUNT,
    UnsupportedHeroCommandBoundaryError,
} from './cmd.js';
import {
    UnsupportedStatusRefreshError,
    reglyph_darkroom,
} from './display.js';
import { UnsupportedEarthSenseError } from './dungeon.js';
import { UnsupportedHeroMoveBoundaryError } from './hack.js';
import { UnsupportedSpecialRoomError } from './mkroom.js';
import { UnsupportedAmbientSoundError } from './sounds.js';
import { initRng, enableRngLog, getRngLog } from './rng.js';
import {
    newgame,
    moveloop_core,
    UnsupportedTurnBoundaryError,
} from './allmain.js';
import {
    finishStartupBooleanOptions,
    parseNethackrc,
} from './options.js';
import { config_error_done } from './cfgfiles.js';
import {
    nomux_get_cursor,
    tty_raw_print,
    tty_wait_synch,
} from './tty_rawprint.js';
import { initoptions_finish } from './fruit.js';
import { GameDisplay } from './game_display.js';
import { setStorageForTesting } from './storage.js';
import { light_globals_init } from './light.js';
import { objects_globals_init } from './objects.js';
import { monst_globals_init } from './monsters.js';
import { timeout_globals_init } from './timeout.js';
import { ttyPlayerSelection } from './player_selection_tty.js';
import {
    renderTtyStartupBanner,
    ttyPlayerNameAndSuffix,
} from './tty_startup.js';
import {
    enter_tutorial,
    maybe_do_tutorial,
} from './tutorial_startup.js';
import {
    runMoveloopPreambleAtStartupBoundary,
    UnsupportedStartupBoundaryError,
} from './moveloop_preamble.js';
import { initialize_symbols_from_options } from './symbols.js';
import { ttyPline } from './tty_message.js';
import { tty_create_nhwindow } from './wintty.js';
import { NHW_MESSAGE } from './const.js';

const RECORDER_SYSTEM_OPTIONS = Object.freeze({
    // nethack-c/upstream/sys/unix/sysconf, which nethack-c/build-recorder.sh
    // installs into the recorder's HACKDIR.  A local recorder may append its
    // own user to the installed WIZARDS line, so the value below is the
    // committed upstream list rather than whatever one checkout happens to
    // have installed.
    wizards: 'root games',
    explorers: '*',
});

// A stand-in for whatever get_unix_pw() returns under the recorder, not a
// measured account name.  check_user_string() (unixmain.c:695) matches that
// name against sysopt.wizards above and reads it from get_unix_pw() rather
// than from any game input, so like the pinned seed and date it belongs to the
// fixed recorder environment.
//
// The one requirement on this constant is that RECORDER_SYSTEM_OPTIONS.wizards
// lists it.  Changing either value alone flips every playmode:debug session
// into explore mode, so a test in scripts/runtime-foundation.test.mjs pins the
// pair through the same predicate set_playmode() uses.
//
// Recorded evidence that the recorder's own account is authorized: no
// playmode:debug session carries the "Only users root or games may access
// debug (wizard) mode." message that wd_message() prints on denial.  Debug
// mode changes starting inventory and dungeon PRNG order, so a port that
// denies it diverges from the reference within the first hundred random-number
// calls.
const RECORDER_ACCOUNT = 'root';

function buildEnglishList(value) {
    const words = String(value).trim().split(/\s+/u).filter(Boolean);
    if (words.length < 2) return words[0] ?? '';
    if (words.length === 2) return `${words[0]} or ${words[1]}`;
    return `${words.slice(0, -1).join(', ')}, or ${words.at(-1)}`;
}

// C refs: options.c:set_playmode() and unixmain.c:check_user_string().
// This runs after tty initialization and before plnamesuffix(), matching the
// Unix startup owner.  The account comes from exactly one place: the optional
// loginName argument, defaulting to RECORDER_ACCOUNT.  Passing another name
// exercises the denied branch, and passing '' stands for check_user_string()
// finding an empty pw_name (unixmain.c:709), which it rejects before scanning
// the option string.
export function set_playmode(state = game, { loginName } = {}) {
    const flags = state.flags ??= {};
    const iflags = state.iflags ??= {};
    const sysopt = state.sysopt ??= {};
    sysopt.wizards ??= RECORDER_SYSTEM_OPTIONS.wizards;
    sysopt.explorers ??= RECORDER_SYSTEM_OPTIONS.explorers;

    const username = String(loginName ?? RECORDER_ACCOUNT);
    const authorized = (configuredUsers) => {
        const text = String(configuredUsers ?? '');
        if (text.startsWith('*')) return true;
        if (!username) return false;
        return text.split(/\s+/u).filter(Boolean).includes(username);
    };

    let wizard = Boolean(flags.debug);
    let discover = Boolean(flags.explore);
    if (wizard) {
        if (authorized(sysopt.wizards)) {
            state.plname = 'wizard';
            state.gp ??= {};
            state.gp.plnamelen = state.plname.length;
        } else {
            iflags.wiz_error_flag = true;
            wizard = false;
        }
        // A denied debug request falls through to explore mode.  Successful
        // wizard authorization stays out of explore mode.
        discover = !wizard;
        iflags.deferred_X = false;
    }
    if (discover && !authorized(sysopt.explorers)) {
        iflags.explore_error_flag = true;
        discover = false;
        iflags.deferred_X = false;
    }

    flags.debug = wizard;
    flags.explore = discover;
    state.wizard = wizard;
    state.discover = discover;
    return state;
}

// C ref: sys/unix/unixmain.c wd_message().  set_playmode() has already made
// and recorded the authorization decision; this reports it after newgame.
export async function wd_message(
    state = game,
    { pline = ttyPline } = {},
) {
    const iflags = state.iflags ??= {};
    const flags = state.flags ??= {};

    // C aliases wizard/discover to flags.debug/flags.explore. JavaScript keeps
    // both spellings for source-shaped consumers, so each paranoia assignment
    // below synchronizes the duplicated field it actually clears. The earlier
    // set_playmode() decision is responsible for the authorization state.

    if (iflags.wiz_error_flag) {
        const wizards = String(state.sysopt?.wizards ?? '');
        if (wizards.length) {
            await pline(
                `Only user${wizards.includes(' ') ? 's' : ''} `
                    + `${buildEnglishList(wizards)} may access debug `
                    + '(wizard) mode.',
                state,
            );
        } else {
            await pline('You cannot access debug (wizard) mode.', state);
        }
        state.wizard = false;
        flags.debug = false;
        if (!iflags.explore_error_flag) {
            await pline('Entering explore/discovery mode instead.', state);
        }
    } else if (iflags.explore_error_flag) {
        await pline('You cannot access explore mode.', state);
        state.discover = false;
        flags.explore = false;
        iflags.deferred_X = false;
    } else if (state.discover) {
        await pline(
            'You are in non-scoring explore/discovery mode.',
            state,
        );
    }
}

// ── NethackGame ──
// Wraps a single game session with replay infrastructure.
export class NethackGame {
    constructor(opts = {}) {
        this._seed = opts.seed || 0;
        this._datetime = opts.datetime || null;
        // Recorder patch 001 leaks tm_isdst into fixed-time parsing. Official
        // sessions were recorded while New York daylight time was active;
        // fresh recorder output can carry the explicit bit for local diffs.
        this._recorderIsDst = opts.recorderIsDst ?? true;
        this._nethackrc = opts.nethackrc || '';
        // Cross-segment persistence handle. The judge sandbox passes a
        // shared Web-Storage-shaped object here so save / record /
        // bones survive across segments of a session; the browser
        // /play/<owner>/ page passes a localStorage-backed view so
        // those files also survive page reloads. If a port doesn't
        // need persistence (no save/restore implemented yet), it can
        // ignore this; the field just sits unused.
        this._storage = opts.storage || null;
        this._screens = [];
        this._cursors = [];
        this._rngSlices = [];
        // Animation frames captured during each step.  Outer index
        // matches _screens (one entry per input boundary); inner array
        // is the frames that fired between this boundary and the
        // previous one, in emit order.  Populated by animationFrame()
        // calls; committed at each input boundary.
        this._animFramesByStep = [];
        this._pendingAnimFrames = [];
        this._lastRngIdx = 0;
        this._themeroomSelectionCollector
            = opts.themeroomSelectionCollector ?? null;
    }

    // Universal animation-frame hook.  Call once per intermediate
    // animation state — typically inside whatever your port writes as
    // the equivalent of NetHack's nh_delay_output() (zap beams, thrown
    // objects, hurtle steps, explosion expansions).
    //
    // Same call, same code, in every runtime:
    //   * Browser /play/  — your writes to the Terminal already update
    //                        the visible DOM cells; we yield via
    //                        requestAnimationFrame so the browser
    //                        actually paints between frames.
    //   * Judge sandbox    — the Terminal is a pure data structure;
    //                        we yield a microtask, effectively
    //                        immediate.
    //   * Local score.sh   — same as judge sandbox.
    //
    // The yield mechanism is the only environment-sensitive bit, and
    // it is invisible to contestant code: every caller writes the same
    // `await game.animationFrame()`.
    //
    // Frames are scored as a SUPPLEMENTAL metric (see API.md).  Not
    // implementing animation frames doesn't penalise your official
    // RNG / screen score in any way.
    async animationFrame() {
        const disp = game?.nhDisplay;
        const term = disp?.terminal || disp;
        this._pendingAnimFrames.push({
            screen: term?.serialize ? term.serialize() : '',
            cursor: disp ? [...nomux_get_cursor(disp), 1] : null,
        });
        if (typeof requestAnimationFrame === 'function') {
            await new Promise((resolve) => requestAnimationFrame(resolve));
        } else {
            await null;
        }
    }

    async start() {
        const g = resetGame();
        // C ref: allmain.c early_init() — clone both mutable source catalogs
        // before options and role initialization; per-game resets run later.
        objects_globals_init(g);
        monst_globals_init(g);
        timeout_globals_init(g);
        light_globals_init(g);
        setStorageForTesting(this._storage);
        // Recorder patch 001 routes calendar.c:getnow() through this fixed
        // YYYYMMDDHHMMSS value and leaks its current tm_isdst bit.
        g.fixedDatetime = this._datetime;
        g.recorderIsDst = this._recorderIsDst;

        // C initializes the game RNG before reading the configuration file.
        initRng(this._seed);
        enableRngLog();

        // choose_windows(DEFAULT_WINDOW_SYS) (unixmain.c:104) installs the tty
        // window procs long before init_nhwindows(), so raw_print() already
        // reaches the terminal while initoptions() reads the configuration
        // file.  A configuration error printed there is the first thing a
        // session can see, and it waits for a key, so both the surface and the
        // boundary capture have to exist by now.
        if (this._pendingDisplay) {
            g.nhDisplay = this._pendingDisplay;
            this._pendingDisplay = null;
        }
        this._installCaptureHook();

        // Parse nethackrc
        const opts = parseNethackrc(this._nethackrc);
        g.plname = opts.name ?? '';
        g.flags = { ...opts.flags };
        g.iflags = { ...opts.iflags };
        // C ref: sys/share/unixtty.c setftty() (251-259).  iflags is a static
        // struct and no option writes cbreak, so it is false until
        // tty_init_nhwindows() raises it -- which js/tty_startup.js
        // renderTtyStartupBanner() does below, ahead of its own display guard
        // so that every caller passes the same boundary.  Between here and
        // there, js/tty_message.js xwaitforspace() reads only Return and
        // Enter, which is what the configuration errors reported just after
        // this wait on.
        g.iflags.cbreak = false;
        g.a11y = { ...opts.a11y };
        if (opts.go) g.go = { ...opts.go };
        g.give_opt_msg = opts.give_opt_msg;
        g.roleFilter = {
            roles: [...(opts.roleFilter?.roles ?? [])],
            mask: opts.roleFilter?.mask ?? 0,
        };
        // role.c calls this global gr.rfilter; selection code accepts the
        // descriptive JS name while legacy ports can use the source name.
        g.rfilter = g.roleFilter;
        g.catname = opts.catname ?? '';
        g.dogname = opts.dogname ?? '';
        g.horsename = opts.horsename ?? '';
        g.gameplayBindings = opts.gameplayBindings.map((binding) => ({
            ...binding,
        }));
        g.commandOperations = opts.commandOperations.map((operation) => ({
            ...operation,
        }));
        g.unportedConfigStatements = [...opts.unportedConfigStatements];
        if (opts.tutorial_set) g.tutorial_set_in_config = true;

        // optfn_boolean()'s unsupported idlecheckpoint arm calls pline()
        // before tty_init_nhwindows(), so pline() routes it to raw_print().
        // Unlike config_error_done() below, this output does not wait here.
        for (const line of opts.startupRawPrints)
            tty_raw_print(g, line);

        // C ref: cfgfiles.c rcfile():1945, the config_error_done() that closes
        // the configuration read.  Each queued string is one pline() C already
        // made during the read; nothing observes the terminal in between, so
        // emitting them here leaves the same shadow screen behind.  A nonzero
        // count then blocks for a key, which is a session's first input
        // boundary whenever a configuration file has an error in it.
        if (config_error_done(opts.configErrorFrame, g)) {
            for (const line of opts.configErrorFrame.output)
                tty_raw_print(g, line);
            await tty_wait_synch(g);
        }

        // The rc parser owns roleplay options until u_init_misc() preserves
        // them across its source memset boundary.
        g.u = { uroleplay: { ...(opts.uroleplay ?? {}) } };
        // context.h declares door_opened beside move; test_move() clears it on
        // entry and domove_core() reads it, so it exists from the start rather
        // than appearing the first time the hero tries to walk. stethoscope_seq
        // (context.h:158) joins them: C zeroes the whole svc.context struct at
        // startup, and use_stethoscope() compares it against gh.hero_seq before
        // it ever writes it, so the value it is compared against on the first
        // listen of a game is 0 rather than absent. gh.hero_seq is never 0
        // during play -- allmain.c:260 sets it to moves << 3 with moves >= 1 --
        // so that first listen is always the free one.
        g.context = { move: 0, door_opened: false, stethoscope_seq: 0 };
        g.program_state = {};
        g.moves = 0;
        g._commandDispatchCount = 0;
        if (this._themeroomSelectionCollector) {
            // The collector is the single owner of this diagnostic state.
            // Level-generation producers can append through its narrow seam,
            // while this NethackGame retains the segment-local snapshot API.
            g._themeroomSelectionCollector
                = this._themeroomSelectionCollector;
        }
        g.gp = {
            plnamelen: 0,
            // C ref: decl.h instance_globals_p; dog.c:pet_type().
            preferred_pet: opts.preferred_pet ?? '',
        };

        // C ref: options.c:initoptions() and symbols.c. Initialize the
        // default cmap, then layer the configured symset and S_* overrides.
        initialize_symbols_from_options(opts, g);

        // C ref: options.c:initoptions_finish() runs after the complete
        // configuration has been parsed and before player selection.
        finishStartupBooleanOptions(g);
        initoptions_finish(opts, g);

        // options.c:initoptions_finish():7347. This is where gs.showsyms gains
        // its entry for S_darkroom: defsym.h gives that cmap its own default
        // byte, and reglyph_darkroom() replaces it with the S_room byte under
        // 'dark_room' and colour, or with the SYM_NOTHING byte otherwise. No
        // level exists yet, so its repair loop has nothing to match.
        //
        // The reset_glyphmap(gm_optionchange) that follows it in C rebuilds a
        // table this port does not keep; js/display.js records why.
        reglyph_darkroom(g);

        // tty_init_nhwindows() precedes plnamesuffix() and any role menus, and
        // clears the terminal over whatever the configuration read printed.
        renderTtyStartupBanner(g);

        // Unix calls set_playmode() after init_nhwindows() and before
        // plnamesuffix().  Its decision changes initial inventory and dungeon
        // PRNG order, so it cannot be deferred to wd_message().
        set_playmode(g);

        // unixmain.c:195 overwrites the plnamelen that set_playmode() just set
        // for wizard mode: gp.plnamelen = exact_username ? strlen(plname) : 0.
        // exact_username is whoami()'s result (unixmain.c:157), and whoami()
        // returns TRUE only when it copies an environment name containing a
        // hyphen into an empty plname (unixmain.c:570-585); the recorder always
        // passes -u, which resets plnamelen to 0 anyway (unixmain.c:386-394).
        // So the port writes the FALSE arm unconditionally.
        //
        // The value is currently inert rather than load-bearing: plnamelen is
        // non-zero only where set_playmode() sets it beside plname 'wizard',
        // and both readers use it as the start offset of a hyphen search
        // (js/tty_startup.js and js/role_init.js), which finds none in
        // 'wizard' from either 0 or 6. The statement is here for fidelity to
        // unixmain.c:195, and the end-to-end assertion in
        // scripts/runtime-foundation.test.mjs keeps it from being dropped.
        g.gp.plnamelen = 0;

        // C filters generic Unix usernames, prompts when necessary, then
        // strips any role/race/gender/alignment suffix before selection.
        await ttyPlayerNameAndSuffix(g);

        // C ref: unixmain.c nethack_main() calls
        // init_sound_disp_gamewindows() after plnamesuffix() and before
        // player_selection(); its first window is NHW_MESSAGE.  This port
        // models only tty_create_nhwindow()'s live message-history clamp.
        tty_create_nhwindow(NHW_MESSAGE, g);
        if (!await ttyPlayerSelection(g)) {
            g.program_state.gameover = true;
            return false;
        }

        // Run game startup
        await newgame();
        // C ref: sys/unix/unixmain.c nethack_main().  This boundary must
        // precede moveloop(): an existing welcome message can force More
        // before the explore-mode notice and preamble RNG effects.
        await wd_message(g);
        // C ref: allmain.c moveloop(FALSE):589.  The preamble's messages and
        // RNG effects precede the optional tutorial query.  The wrapper turns
        // a refusal raised inside it into the boundary runSegment() below ends
        // the segment on.
        await runMoveloopPreambleAtStartupBoundary(false, g);
        const tutorial = await maybe_do_tutorial(g);
        if (tutorial.action === 'enter') await enter_tutorial(tutorial, g);
        return true;
    }

    _installCaptureHook() {
        const nhGame = this;
        // hack.c nh_delay_output() is where the recorder's patched tty
        // captures an intermediate frame, so js/hack.js calls this hook from
        // its port of that function.
        game._animationFrameHook = () => nhGame.animationFrame();
        game._preNhgetchHook = async () => {
            // Capture RNG slice since last capture
            const fullLog = getRngLog() || [];
            const slice = fullLog.slice(nhGame._lastRngIdx);
            nhGame._lastRngIdx = fullLog.length;

            // Capture screen from the terminal grid. The fixture for
            // screen scoring is the Terminal: contestants drive it
            // however they like, judge reads back terminal.serialize()
            // and compares to the C session's recorded screen.
            const disp = game?.nhDisplay;
            const term = disp?.terminal || disp;
            nhGame._screens.push(term?.serialize ? term.serialize() : '');
            nhGame._rngSlices.push(slice);

            // Recorder patch 006 reads the cursor through nomux_get_cursor(),
            // which answers with its raw-print row and column once
            // tty_raw_print() has been used -- and nothing turns that back off
            // for the rest of the segment.
            const cursor = disp ? [...nomux_get_cursor(disp), 1] : null;
            nhGame._cursors.push(cursor);

            // Commit animation frames accumulated since the previous
            // input boundary as belonging to this step.  Frames are
            // captured by animationFrame() into _pendingAnimFrames; we
            // snapshot and reset here so the next step starts empty.
            nhGame._animFramesByStep.push(nhGame._pendingAnimFrames);
            nhGame._pendingAnimFrames = [];
        };
    }

    getScreens() { return this._screens; }
    getCursors() { return this._cursors; }
    getRngLog() { return getRngLog(); }
    // Per-step PRNG slices, parallel to getScreens(). Each entry is the
    // log of PRNG calls that fired since the previous capture (i.e.
    // since the previous nhgetch). Useful for tooling like the PS
    // visualizer that wants to attribute calls to individual keystrokes;
    // the judge ignores this and uses getRngLog() flat.
    getRngSlices() { return this._rngSlices; }
    // Per-step animation frames, parallel to getScreens().  Each entry
    // is the array of frames captured (via animationFrame()) between
    // the previous input boundary and this one — i.e. the intermediate
    // display states for that step's animation.  Empty inner arrays
    // for steps that didn't animate.  SUPPLEMENTAL metric — not part
    // of the official ranking; see API.md.
    getAnimationFramesByStep() { return this._animFramesByStep; }
    getThemeroomSelections() {
        return this._themeroomSelectionCollector?.snapshot() ?? null;
    }
}

function createThemeroomSelectionCollector() {
    const selections = [];
    return Object.freeze({
        record(kind, id) {
            selections.push(Object.freeze({ kind, id }));
        },
        snapshot() {
            return selections.map((entry) => ({ ...entry }));
        },
    });
}

export function segmentIterationLimit(movesLength) {
    return Math.max(
        movesLength * (MAX_COMMAND_COUNT + 1) + 1,
        1024,
    );
}

// ── Per-segment runner — the contest contract ──
//
// The judge calls this once per segment. Input is a clean replay
// descriptor with up to six fields (NO recorded answers):
//
//   { seed: number,           // PRNG seed
//     datetime: string,       // fixed datetime "YYYYMMDDHHMMSS"
//     nethackrc: string,      // game-options rc text
//     moves: string,          // raw key sequence to replay from launch
//     recorderIsDst: boolean, // recorder tm_isdst bit; defaults to true
//     storage: object }       // Web-Storage-shaped (getItem/setItem/...)
//                             //   handle for cross-segment persistence —
//                             //   shared across all segments of a
//                             //   session. The browser passes a
//                             //   localStorage-backed view so save files
//                             //   survive page reload too.
//
// Each call returns a self-contained game whose getScreens() /
// getRngLog() / getCursors() / getAnimationFramesByStep() cover ONLY
// this segment. The harness concatenates them itself. Cross-segment
// C-side state (bones, record file, save) lives in `input.storage`.
// The optional second argument enables local diagnostics and is never part of
// a replay recipe or the judge contract. onBoundary, when supplied, receives
// the fail-closed boundary error that ended the segment; the loop below
// swallows it, so an observer has no other way to learn which unported path
// the segment reached.
export async function runSegment(
    input,
    { traceThemeroomSelections = false, onBoundary = null } = {},
) {
    const { seed, datetime, nethackrc, recorderIsDst, storage } = input;
    const moves = input.moves || '';

    const nhGame = new NethackGame({
        seed,
        datetime,
        nethackrc,
        recorderIsDst,
        storage,
        themeroomSelectionCollector: traceThemeroomSelections
            ? createThemeroomSelectionCollector()
            : null,
    });

    const display = new GameDisplay(null);
    display.onEmptyQueue = () => { throw new Error('Input queue empty - test may be missing keystrokes'); };
    nhGame._pendingDisplay = display;

    for (const ch of moves) display.pushKey(ch.charCodeAt(0));

    let started;
    try {
        started = await nhGame.start();
    } catch (error) {
        // A recording may deliberately end at any startup input boundary.
        // nhgetch() has already captured that boundary before discovering
        // that the replay recipe has no next key.
        if (String(error?.message || '').includes('Input queue empty'))
            return nhGame;
        // allmain.c moveloop() runs its preamble above the loop below, so a
        // fail-closed boundary raised there arrives here rather than at the
        // catch inside that loop. Ending the segment on it preserves every
        // screen start() captured, which rethrowing would discard.
        if (error instanceof UnsupportedStartupBoundaryError) {
            onBoundary?.(error);
            return nhGame;
        }
        throw error;
    }
    if (!started) return nhGame;

    // Drive the game loop until input is exhausted. The judge looks
    // at game.getScreens() afterwards; whatever the contestant
    // captured is what gets compared.
    // A single legal count can repeat through MAX_COMMAND_COUNT turns before
    // the next input boundary.  Keep a finite runaway guard, but size it from
    // the portable source limit rather than truncating valid counted commands.
    const maxIter = segmentIterationLimit(moves.length);
    for (let iter = 0; iter < maxIter; iter++) {
        try {
            await moveloop_core();
        } catch (e) {
            if (String(e?.message || '').includes('Input queue empty')) break;
            // A known, fail-closed gameplay boundary preserves all output
            // produced through the supported prefix. It must not turn that
            // prefix into a zero-session scorer error.
            if (e instanceof UnsupportedTurnBoundaryError
                || e instanceof UnsupportedHeroMoveBoundaryError
                || e instanceof UnsupportedHeroCommandBoundaryError
                // Arrival placement supplies earth_sense() a source-ordered
                // message collector. Other movement callers remain an
                // explicit boundary until their async message path is ported.
                || e instanceof UnsupportedEarthSenseError
                // botl.c timebot() reaches js/display.js
                // _refuseUnfittableStatusRow() from allmain.c moveloop_core()
                // and from display.c flush_screen(), both of which run under
                // this loop, so a status row that outgrows the terminal on a
                // turn-counter refresh ends the segment on its last matching
                // screen.
                || e instanceof UnsupportedStatusRefreshError
                || e instanceof UnsupportedSpecialRoomError
                // sounds.c dosounds() runs every turn under this loop, so the
                // first turn on a level holding an unported special room ends
                // the segment here.
                || e instanceof UnsupportedAmbientSoundError) {
                onBoundary?.(e);
                break;
            }
            throw e;
        }
    }

    return nhGame;
}
