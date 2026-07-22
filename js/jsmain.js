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
import { initRng, enableRngLog, getRngLog } from './rng.js';
import { newgame, moveloop_core } from './allmain.js';
import { parseNethackrc } from './options.js';
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
import { moveloop_preamble } from './moveloop_preamble.js';
import { initialize_symbols_from_options } from './symbols.js';
import { ttyPline } from './tty_message.js';

const RECORDER_SYSTEM_OPTIONS = Object.freeze({
    // nethack-c/upstream/sys/libnh/sysconf.  Login identity is not part of
    // the contest input, so an unset login name represents the ordinary
    // unprivileged recorder user rather than granting browser-side wizard
    // access.
    wizards: 'root games',
    explorers: '*',
});

function buildEnglishList(value) {
    const words = String(value).trim().split(/\s+/u).filter(Boolean);
    if (words.length < 2) return words[0] ?? '';
    if (words.length === 2) return `${words[0]} or ${words[1]}`;
    return `${words.slice(0, -1).join(', ')}, or ${words.at(-1)}`;
}

// C refs: options.c:set_playmode() and unixmain.c:check_user_string().
// This runs after tty initialization and before plnamesuffix(), matching the
// Unix startup owner.  A caller can supply loginName for focused authorization
// tests; the replay contract deliberately has no operating-system identity.
export function set_playmode(state = game, { loginName } = {}) {
    const flags = state.flags ??= {};
    const iflags = state.iflags ??= {};
    const sysopt = state.sysopt ??= {};
    sysopt.wizards ??= RECORDER_SYSTEM_OPTIONS.wizards;
    sysopt.explorers ??= RECORDER_SYSTEM_OPTIONS.explorers;

    const username = String(loginName ?? state.loginName ?? '');
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
            cursor: disp ? [disp.cursorCol ?? 0, disp.cursorRow ?? 0, 1] : null,
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

        // Parse nethackrc
        const opts = parseNethackrc(this._nethackrc);
        g.plname = opts.name ?? '';
        g.flags = { ...opts.flags };
        g.iflags = { ...opts.iflags };
        g.a11y = { ...opts.a11y };
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
        if (opts.tutorial_set) g.tutorial_set_in_config = true;

        // The rc parser owns roleplay options until u_init_misc() preserves
        // them across its source memset boundary.
        g.u = { uroleplay: { ...(opts.uroleplay ?? {}) } };
        g.context = { move: 0 };
        g.program_state = {};
        g.moves = 0;
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
        initoptions_finish(opts, g);

        // tty_init_nhwindows() precedes plnamesuffix() and any role menus.
        // Install the capture surface before reproducing that visible input
        // boundary; explicit configurations proceed without reading a key.
        if (this._pendingDisplay) {
            g.nhDisplay = this._pendingDisplay;
            this._pendingDisplay = null;
        }
        this._installCaptureHook();
        renderTtyStartupBanner(g);

        // Unix calls set_playmode() after init_nhwindows() and before
        // plnamesuffix().  Its decision changes initial inventory and dungeon
        // PRNG order, so it cannot be deferred to wd_message().
        set_playmode(g);

        // C filters generic Unix usernames, prompts when necessary, then
        // strips any role/race/gender/alignment suffix before selection.
        await ttyPlayerNameAndSuffix(g);
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
        // C ref: allmain.c moveloop(FALSE).  The preamble's messages and RNG
        // effects precede the optional tutorial query.
        await moveloop_preamble(false, g);
        const tutorial = await maybe_do_tutorial(g);
        if (tutorial.action === 'enter') await enter_tutorial(tutorial, g);
        return true;
    }

    _installCaptureHook() {
        const nhGame = this;
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

            const cursor = disp ? [disp.cursorCol ?? 0, disp.cursorRow ?? 0, 1] : null;
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
export async function runSegment(input) {
    const { seed, datetime, nethackrc, recorderIsDst, storage } = input;
    const moves = input.moves || '';

    const nhGame = new NethackGame({
        seed,
        datetime,
        nethackrc,
        recorderIsDst,
        storage,
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
        throw error;
    }
    if (!started) return nhGame;

    // Drive the game loop until input is exhausted. The judge looks
    // at game.getScreens() afterwards; whatever the contestant
    // captured is what gets compared.
    const maxIter = Math.max(moves.length * 8, 1024);
    for (let iter = 0; iter < maxIter; iter++) {
        try {
            await moveloop_core();
        } catch (e) {
            if (String(e?.message || '').includes('Input queue empty')) break;
            throw e;
        }
    }

    return nhGame;
}
