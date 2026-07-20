// jsmain.js — Game engine: NethackGame class + per-segment runner.
// C ref: unixmain.c — nethack_main() initialization and game setup.
//
// Contest contract: the judge orchestrates sessions (load JSON,
// normalize v4/v5, loop segments, aggregate scores). It calls
// runSegment(segment, prevGame) for each game segment and reads back
// game.getScreens() / getRngLog() / getCursors() to compare with
// C-recorded session data.
//
// For browser play, see nethack.js (uses NethackGame directly).

import { game, resetGame } from './gstate.js';
import { initRng, enableRngLog, getRngLog } from './rng.js';
import { pushKey, nhgetch } from './input.js';
import { newgame, moveloop_core } from './allmain.js';
import { parseNethackrc } from './options.js';
import { flush_screen } from './display.js';
import { GameDisplay } from './game_display.js';
import { setStorageForTesting } from './storage.js';
import { objects_globals_init } from './objects.js';
import { plnamesuffix, rigid_role_checks } from './role_init.js';
import {
    ROLE_NONE,
    ROLE_RANDOM,
    validalign,
    validgend,
    validrace,
    validrole,
} from './roles.js';

function resolveNoninteractiveCharacterConfig(state) {
    const { flags } = state;
    const choicesBeforeSelection = [
        flags.initrole,
        flags.initrace,
        flags.initgend,
        flags.initalign,
    ];
    const needsSelection = choicesBeforeSelection.includes(ROLE_NONE);

    // role.c:genl_player_setup() resolves ROLE_RANDOM before deciding which
    // menus are needed. A missing choice still requires confirmation even
    // when rigid_role_checks() can force the only compatible value.
    rigid_role_checks(state);
    const resolvedChoices = [
        flags.initrole,
        flags.initrace,
        flags.initgend,
        flags.initalign,
    ];
    if (needsSelection || resolvedChoices.some((choice) => (
        choice === ROLE_NONE || choice === ROLE_RANDOM
    ))) {
        throw new Error(
            'interactive character selection is not implemented; provide '
            + 'role, race, gender, and alignment options',
        );
    }
    if (!validrole(flags.initrole)
        || !validrace(flags.initrole, flags.initrace)
        || !validgend(flags.initrole, flags.initrace, flags.initgend)
        || !validalign(flags.initrole, flags.initrace, flags.initalign)) {
        throw new RangeError(
            'role, race, gender, and alignment options are incompatible',
        );
    }
}

function requireNoninteractiveStartupOptions(opts) {
    if (!opts.name) {
        throw new Error(
            'interactive character naming is not implemented; provide a name option',
        );
    }
    const unsupported = [];
    if (opts.iflags.wc_splash_screen) unsupported.push('splash_screen');
    if (opts.flags.tutorial) unsupported.push('tutorial');
    if (opts.flags.legacy) unsupported.push('legacy');
    if (unsupported.length) {
        throw new Error(
            `interactive startup pages are not implemented; disable ${unsupported.join(', ')}`,
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
        this._nhgetchCount = 0;
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
        // C ref: allmain.c early_init() — mutable object names must exist
        // before options can customize them; init_objects() runs later.
        objects_globals_init(g);
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
        requireNoninteractiveStartupOptions(opts);
        g.plname = opts.name;
        g.flags = { ...opts.flags };
        g.iflags = { ...opts.iflags };
        g.catname = opts.catname ?? '';
        g.dogname = opts.dogname ?? '';
        g.horsename = opts.horsename ?? '';
        g.wizard = Boolean(g.flags.debug);
        g.discover = Boolean(g.flags.explore);
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

        // C strips any name suffix before character selection, then runs the
        // rigid checks. Configured random choices can resolve without input;
        // missing choices still belong to the unported selection menus.
        plnamesuffix(g);
        resolveNoninteractiveCharacterConfig(g);

        // Install display
        if (this._pendingDisplay) {
            g.nhDisplay = this._pendingDisplay;
            this._pendingDisplay = null;
        }

        // Install capture hook
        this._installCaptureHook();

        // Run game startup
        await newgame();
    }

    _installCaptureHook() {
        const nhGame = this;
        game._preNhgetchHook = async () => {
            const keyIdx = nhGame._nhgetchCount++;

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
// descriptor with up to five fields (NO recorded answers):
//
//   { seed: number,        // PRNG seed
//     datetime: string,    // fixed datetime "YYYYMMDDHHMMSS"
//     nethackrc: string,   // game-options rc text
//     moves: string,       // raw key sequence to replay from launch
//     storage: object }    // Web-Storage-shaped (getItem/setItem/...)
//                          //   handle for cross-segment persistence —
//                          //   shared across all segments of a
//                          //   session. The browser passes a
//                          //   localStorage-backed view so save files
//                          //   survive page reload too.
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

    await nhGame.start();

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
