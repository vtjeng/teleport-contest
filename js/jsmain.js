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

import {
    game,
    recordedArgumentMisuses,
    resetGame,
    resetArgumentMisuses,
    setArgumentMisuseRecording,
} from './gstate.js';
import {
    MAX_COMMAND_COUNT,
    yn_function,
} from './cmd.js';
import {
    activate_chosen_soundlib,
} from './sounds.js';
import {
    initRng,
    enableRngLog,
    getRngLog,
    isTerminated,
    oneMacrotask,
    raceTermination,
    resetTermination,
    terminationViolations,
} from './rng.js';
import {
    newgame,
    moveloop_core,
} from './allmain.js';
import {
    initoptions_finish,
    parseNethackrc,
} from './options.js';
import {
    config_error_done,
    RECORDER_CONFIGFILE,
    set_configfile_name,
} from './cfgfiles.js';
import {
    nomux_get_cursor,
    tty_raw_print,
    tty_wait_synch,
} from './tty_rawprint.js';
import { GameDisplay } from './game_display.js';
import { JUDGE_RECORDER_IS_DST } from './calendar.js';
import { setStorageForTesting, vfsReadFile, vfsWriteFile, vfsDeleteFile } from './storage.js';
import { light_globals_init } from './light.js';
import { shk_globals_init } from './shk.js';
import { objects_globals_init } from './objects.js';
import { NON_PM, monst_globals_init } from './monsters.js';
import { timeout_globals_init } from './timeout.js';
import {
    ttyPlayerNameAndSuffix,
} from './tty_startup.js';
import { maybe_do_tutorial } from './tutorial_startup.js';
import { reset_in_tele_trap } from './teleport.js';
import {
    runMoveloopPreambleAtStartupBoundary,
} from './moveloop_preamble.js';
import {
    initialize_symbols_from_options,
} from './symbols.js';
import { clearTtyMessageWindow, ttyPline } from './tty_message.js';
import {
    tty_create_nhwindow,
    tty_init_nhwindows,
    tty_player_selection,
} from './wintty.js';
import { LL_NONE, NHW_MESSAGE, Upolyd } from './const.js';
import { dorestore } from './restore.js';
import { SAVE_FILE_PATH } from './save.js';
import { welcomeBackMessage, welcomeHallucinationMessage } from './role_init.js';
import { udeadinside, ugenocided } from './polyself.js';
import {
    cls,
    docrt,
    bot,
    flush_screen,
    status_initialize,
    reglyph_darkroom,
} from './display.js';
import {
    init_vision_globals,
    vision_reset,
} from './vision.js';
import { initUnported } from './unported.js';

// Every Unsupported*Error is a fail-closed refusal of an unported code path.
// runSegment() catches them as boundary stops so the session scan and scorer
// preserve the screens emitted before the refusal.
function isUnportedBoundary(error) {
    return error instanceof Error
        && typeof error.name === 'string'
        && error.name.startsWith('Unsupported')
        && error.name.endsWith('Error');
}

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
    // C sys.c:sys_early_init() starts each process with no live-log sink;
    // the recorder's sysconf leaves LIVELOG disabled.  Keep this canonical
    // system option explicit before the play-mode fields are layered on.
    sysopt.livelog ??= LL_NONE;
    sysopt.wizards ??= RECORDER_SYSTEM_OPTIONS.wizards;
    // The recorder's linux-minimal hints file does not define SYSCF, so the C
    // binary never calls cnf_line_WIZARDS() and fmtd_wizard_list stays NULL.
    // Do not create it here — the contact page must omit the "local support"
    // line to match C's output.
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
        // Recorder patch 001 leaks tm_isdst into fixed-time parsing. The
        // judge passes no recorderIsDst, so it replays with the daylight-time
        // bit its recorder inherited (calendar.js JUDGE_RECORDER_IS_DST).
        // Local recordings use that bit too (patch 009); unit tests may pass
        // another.
        this._recorderIsDst = opts.recorderIsDst ?? JUDGE_RECORDER_IS_DST;
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
        // Animation frames captured during each step.  Outer index is
        // one entry per input boundary, as frozen/ps_test_runner.mjs
        // indexes its C-side frames (_screens and _cursors skip a blank
        // boundary; see _installCaptureHook()); inner array
        // is the frames that fired between this boundary and the
        // previous one, in emit order.  Populated by animationFrame()
        // calls; committed at each input boundary.
        this._animFramesByStep = [];
        this._pendingAnimFrames = [];
        this._lastRngIdx = 0;
        // The input boundaries the recorder keeps; playSegment() sets it from
        // moves (recordedBoundaryLimit()). _rngSlices has one entry per
        // captured boundary.
        this._boundaryLimit = Infinity;
        // rng.js keeps one RNG log per process, and start() replaces it with
        // a fresh one, so until then the process log still holds the previous
        // segment's calls; a segment that stops before that point has logged
        // none.
        this._rngLogStarted = false;
        // runSegment() records here the error that ended the segment early,
        // as { name, message, stack }; null when nothing crashed.
        this.segmentError = null;
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
        this._pendingAnimFrames.push({
            screen: disp ? disp.serialize() : '',
            cursor: disp ? [...nomux_get_cursor(disp), 1] : null,
        });
        if (typeof requestAnimationFrame === 'function') {
            await new Promise((resolve) => requestAnimationFrame(resolve));
        } else {
            await null;
        }
    }

    // Returns true once the game is ready for moveloop_core(), false when the
    // segment terminated during start-up (a bail() or death there).
    async start() {
        // Let any chain an earlier segment discarded finish or reach
        // nhgetch()'s guard before this segment resets the termination
        // state and the RNG log (js/rng.js, "Segment termination").
        await oneMacrotask();
        resetTermination();
        // teleport.c tele_trap()'s static guard is restored by a finally
        // block, which does not run when the game terminates inside it.
        reset_in_tele_trap();
        const outcome = await raceTermination(this._startGame());
        return outcome.terminated ? false : outcome.value;
    }

    // C ref: unixmain.c nethack_main() from early_init() to moveloop().
    async _startGame() {
        const g = resetGame();
        initUnported();
        // C ref: allmain.c early_init() — clone both mutable source catalogs
        // before options and role initialization; per-game resets run later.
        objects_globals_init(g);
        monst_globals_init(g);
        timeout_globals_init(g);
        light_globals_init(g);
        shk_globals_init();
        setStorageForTesting(this._storage);
        // record-session.mjs creates the recorder's scorefile before C
        // starts. Mirror that startup contract for the browser and judge
        // VFS, while preserving an existing scorefile across segments.
        if (vfsReadFile('record') === null)
            vfsWriteFile('record', '');
        // Recorder patch 001 routes calendar.c:getnow() through this fixed
        // YYYYMMDDHHMMSS value and leaks its current tm_isdst bit.
        g.fixedDatetime = this._datetime;
        g.recorderIsDst = this._recorderIsDst;

        // C initializes the game RNG before reading the configuration file.
        initRng(this._seed);
        enableRngLog();
        this._rngLogStarted = true;

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

        // C cfgfiles.c fopen_config_file() stores $HOME/.nethackrc before
        // option parsing can report errors or option_help() can display its
        // path. The recorder HOME is a documented global environment value;
        // keep it in cfgfiles.js and use the canonical setter here so the
        // fixed BUFSZ truncation contract remains in one place.
        set_configfile_name(RECORDER_CONFIGFILE, g);
        // Parse nethackrc after the source-owned config buffer is initialized.
        const opts = parseNethackrc(this._nethackrc);
        g.plname = opts.name ?? '';
        g.flags = { ...opts.flags };
        g.iflags = { ...opts.iflags };
        // cfgfiles.c cnf_line_MENUCOLOR() has finished prepending the
        // per-game coloratt.c list before any menu can be built.
        g.gm = { ...opts.gm };
        // glyphs.c to_custom_symset_entry_callback() keeps its static
        // glyphnag and colornag counters for the whole process, so the live
        // glyph option handler shares the parser's record of them.
        g.parserGlyphSetContext = opts.parserGlyphSetContext;
        g.options_set_window_colors_flag
            = opts.options_set_window_colors_flag;
        g.wcolors_opt = [...opts.wcolors_opt];
        g.gc = { ...opts.gc, corpsenm_digested: NON_PM };
        g.gf = {
            ...opts.gf,
            fqn_prefix: [...(opts.gf?.fqn_prefix ?? [])],
        };
        installParsedGa(g, opts);
        g.gw = {
            ...opts.gw,
            warnsyms: [...opts.gw.warnsyms],
        };
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
        g.wizkit = opts.wizkit ?? ''; // C ref: gw.wizkit
        g.gameplayBindings = opts.gameplayBindings.map((binding) => ({
            ...binding,
        }));
        g.commandOperations = opts.commandOperations.map((operation) => ({
            ...operation,
        }));
        g.extcmdFlags = [...opts.extcmdFlags];
        g.unportedConfigStatements = [...opts.unportedConfigStatements];
        if (opts.tutorial_set) g.tutorial_set_in_config = true;

        // C ref: cfgfiles.c rcfile():1945, the config_error_done() that closes
        // configuration read. config_error_done() appends its summary before
        // startup events are replayed. Most configuration output has no input
        // boundary until the final wait, but cfgfiles.c get_uchars() writes a
        // raw syntax error and waits immediately, so each event carries its
        // own boundary when the source has one.
        const configErrors = config_error_done(opts.configErrorFrame, g);
        // decl.c g_init_e zero-initializes ge.early_raw_messages. pline.c
        // raw_printf() adds to it until program_state.beyond_savefile_load is
        // set, which no configuration output can follow; the restore branch
        // below and restore.c dorecover() read it.
        g.ge = { early_raw_messages: 0 };
        for (const event of opts.startupEvents) {
            tty_raw_print(g, event.text);
            // raw_printf() and its vraw_printf() each add one (pline.c:557,
            // :580); the readers test only for zero.
            if (event.raw_printf) g.ge.early_raw_messages += 2;
            if (event.wait) await tty_wait_synch(g);
        }
        if (configErrors) await tty_wait_synch(g);

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
            // decl.c zero-initializes this message flag word. set_voice()
            // raises PLINE_SPEECH for the next vpline() call, which clears it.
            pline_flags: 0,
            // C ref: decl.h instance_globals_p; dog.c:pet_type().
            preferred_pet: opts.preferred_pet ?? '',
            // cfgfiles.c cnf_line_MSGTYPE() has finished prepending the
            // per-game options.c list before any initialized vpline() call.
            plinemsg_types: opts.gp?.plinemsg_types ?? null,
        };
        // decl.c g_init_v zero-initializes gv.voice. sounds.c set_voice()
        // updates these fields together and deliberately leaves `mon` alone.
        g.gv = {
            voice: {
                serialno: 0,
                gender: 0,
                tone: 0,
                volume: 0,
                moreinfo: 0,
                mon: null,
                nameid: null,
            },
        };
        // decl.c initializes gp.prevmsg to an empty byte string. The TTY port
        // keeps that sole value here because getline.js and vpline() share it.
        g._ttyPreviousMessage = '';

        // C ref: options.c:initoptions() and symbols.c. Initialize the
        // default cmap, then layer the configured symset and S_* overrides.
        initialize_symbols_from_options(opts, g);

        // C ref: options.c:initoptions_finish() runs after the complete
        // configuration has been parsed and before player selection.
        initoptions_finish(opts, g);

        // tty_init_nhwindows() precedes plnamesuffix() and any role menus, and
        // clears the terminal over whatever the configuration read printed.
        tty_init_nhwindows(null, null, g);

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
        // player_selection().  Its first step activates the interface chosen
        // while reading options; its first window is NHW_MESSAGE.  This port
        // models the built-in nosound interface and tty_create_nhwindow()'s
        // live message-history clamp.
        activate_chosen_soundlib(g);
        tty_create_nhwindow(NHW_MESSAGE, g);
        // C ref: allmain.c init_sound_disp_gamewindows():720-721 calls
        // status_initialize(FALSE) right after creating WIN_MESSAGE, before
        // the restore-or-new-game branch, so a restored game has the status
        // banks too. gb.blinit and the banks are not in the save file.
        status_initialize(g, false);

        // ── Branch: restore saved game or start new one ──
        // C ref: unixmain.c nethack_main() checks for a save file between
        // init_sound_disp_gamewindows() and player_selection(). If a save
        // exists, it calls restgame() -> dorecover() (restore.c:789-951)
        // which restores the game state, redraws the map, and prints
        // welcome(FALSE). moveloop(TRUE) then follows with resuming=true.
        //
        // unixmain.c:242 restore_saved_game() answers whether a save file
        // could be opened; the one VFS save path stands in for its search.
        const haveSaveFile = vfsReadFile(SAVE_FILE_PATH) != null;
        if (haveSaveFile) {
            // C ref: unixmain.c:255-262. A configuration raw_printf() leaves
            // its text on the screen, so the notice is raw output too rather
            // than a top-line message. pline() also files it in the message
            // history, where tty_putmsghistory() keeps it after the restored
            // messages. mark_synch() is tty_mark_synch(), an fflush() with no
            // JS counterpart.
            if (g.ge.early_raw_messages)
                tty_raw_print(g, 'Restoring save file...');
            else
                await ttyPline('Restoring save file...', g);
        }
        if (haveSaveFile && await dorestore(g)) {
            // Restore succeeded. The new segment's datetime and recorder
            // state override whatever the save carried, so moveloop_preamble
            // picks up the current segment's calendar.
            g.fixedDatetime = this._datetime;
            g.recorderIsDst = this._recorderIsDst;

            // C ref: dorecover():926-927 reglyph_darkroom(), vision_reset().
            // Vision globals were not saved; rebuild them from the restored
            // level data.
            init_vision_globals();
            reglyph_darkroom(g);
            vision_reset();

            // C ref: dorecover():931 program_state.restoring = 0 (before
            // docrt). Set up display for the restored game.
            g.program_state.restoring = 0;

            // C ref: dorecover():933-940. Before docrt() erases the screen,
            // a raw configuration message waits for the player to see it.
            if (g.ge.early_raw_messages
                && !g.program_state.beyond_savefile_load) {
                g.ge.early_raw_messages = 0;
                await tty_wait_synch(g);
            }
            g.program_state.beyond_savefile_load = 1;
            g.program_state.in_moveloop = 1;

            // C's command-dispatch state (gc.Cmd.key and related fields) is
            // NOT part of context_info and is NOT saved or restored. After
            // restore, gc.Cmd.key is 0 (its initial value), so the first
            // rhack(0) reads fresh input. The JS port's equivalent,
            // context.pendingCommand, IS serialized because it lives on the
            // saved context struct. Clear it so the first command dispatch
            // after restore reads from the input queue instead of re-executing
            // the command that was in progress when the game was saved.
            delete g.context.pendingCommand;

            // C ref: dorecover():944-945 docrt() + clear_nhwindow(WIN_MSG).
            // docrt() does the vision pass that restore.js's
            // vision_full_recalc = 1 requests; a separate vision_recalc(0)
            // here would draw each hallucinated monster an extra time on
            // the display RNG before docrt() redraws it.
            await cls();
            await docrt();
            await flush_screen(1);
            await bot({ initialTtyRefresh: true });
            clearTtyMessageWindow(g);

            // C ref: dorecover():948 welcome(FALSE). allmain.c:863-867
            // skips "welcome back" for a restored hero whose own species
            // was genocided while polymorphed; that death is pending.
            const doomedRestore = Upolyd(g.u) && ugenocided(g);
            if (!doomedRestore) {
                const hallucinationWelcome = welcomeHallucinationMessage(g);
                if (hallucinationWelcome)
                    await ttyPline(hallucinationWelcome, g);
            }
            if (doomedRestore)
                await ttyPline(
                    `You're back, but you still feel ${udeadinside(g)} inside.`,
                    g,
                );
            else {
                await ttyPline(welcomeBackMessage(g), g);
                // C ref: allmain.c welcome(FALSE) 922-927: the Gehennom
                // smoke message and the level annotation, as goto_level()
                // gives them on arrival.
                const { hellish_smoke_mesg } = await import('./do.js');
                const { print_level_annotation } = await import('./dungeon.js');
                await hellish_smoke_mesg(g);
                await print_level_annotation(g);
            }

            // C ref: restore.c:dorecover() calls check_special_room(FALSE)
            // immediately after welcome(FALSE) on a successful restore.
            const { check_special_room } = await import('./rooms.js');
            await check_special_room(false, g);

            // C ref: unixmain.c:265 wd_message() after a successful
            // dorecover(), before the keep-save question.
            await wd_message(g);

            // C ref: unixmain.c:266-272. Debug/explore restores ask whether
            // to retain the save. VFS needs no chmod or compression operation.
            if (g.discover || g.wizard) {
                if (await yn_function('Do you want to keep the save file?',
                    'yn', 'n', true, g) === 'n') {
                    vfsDeleteFile(SAVE_FILE_PATH);
                }
            }

            // C ref: allmain.c moveloop(TRUE):589. The preamble with
            // resuming=true applies new date-dependent effects (moon phase,
            // Friday the 13th) but skips gear-equip, pickup, and seer_turn.
            await runMoveloopPreambleAtStartupBoundary(true, g);
            return true;
        }

        await tty_player_selection(g);

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
        await maybe_do_tutorial(g);
        return true;
    }

    _installCaptureHook() {
        const nhGame = this;
        // hack.c nh_delay_output() is where the recorder's patched tty
        // captures an intermediate frame, so js/hack.js calls this hook from
        // its port of that function.
        game._animationFrameHook = () => nhGame.animationFrame();
        game._preNhgetchHook = async () => {
            // The recorder has stopped keeping boundaries; the game reads on
            // and its RNG calls stay in the flat log.
            if (nhGame._rngSlices.length >= nhGame._boundaryLimit) return;
            // Capture RNG slice since last capture
            const fullLog = getRngLog() || [];
            const slice = fullLog.slice(nhGame._lastRngIdx);
            nhGame._lastRngIdx = fullLog.length;

            // Capture the screen from the terminal grid. The judge decodes
            // each getScreens() string and compares it with the C session's
            // recorded screen; GameDisplay.serialize() says why this does not
            // call the frozen Terminal's serialize().
            // The judge keeps a recorded screen and its cursor only when the
            // screen is non-empty (frozen/ps_test_runner.mjs `if
            // (step.screen)`), but keeps every JS screen. The recorder saves
            // an all-blank terminal, such as the one nh_terminate() leaves
            // after a quit, as "", so a blank boundary is left out of both
            // streams here too; otherwise a blank that ends one segment would
            // shift every screen of the next.
            const disp = game?.nhDisplay;
            const screen = disp ? disp.serialize() : '';
            nhGame._rngSlices.push(slice);

            // Recorder patch 006 reads the cursor through nomux_get_cursor(),
            // which answers with its raw-print row and column once
            // tty_raw_print() has been used -- and nothing turns that back off
            // for the rest of the segment.
            if (screen) {
                nhGame._screens.push(screen);
                nhGame._cursors.push(disp ? [...nomux_get_cursor(disp), 1] : null);
            }

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
    getRngLog() { return this._rngLogStarted ? getRngLog() : []; }
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
    getUnported() { return game.unported ? [...game.unported] : []; }
    getInputExhausted() { return Boolean(this._inputExhausted); }
    getThemeroomSelections() {
        return this._themeroomSelectionCollector?.snapshot() ?? null;
    }
}

// Startup parsing allocates ga.apelist nodes and their compiled regex objects.
// C installs that list by global identity; this shallow struct copy preserves
// the same nodes and regex objects instead of rebuilding either one.
export function installParsedGa(state, parsedOptions) {
    state.ga = { ...parsedOptions.ga };
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

// The bytes the recorded C game read, in order, from a replay's moves.
//
// scripts/record-session.mjs writes moves[i], one UTF-16 code unit, to the
// game's stdin as UTF-8 each time the game reaches an input boundary (the
// patched tty_nhgetch() emits one boundary marker before each read). Through
// that pipe:
// - a carriage return arrives as a newline, as a tmux pty's ICRNL line
//   discipline delivers it; the recorder copies that translation;
// - a code unit from U+0080 to U+07FF arrives as two bytes, and any other
//   code unit above U+007F as three; Node encodes a lone surrogate, half of
//   an astral character, as U+FFFD (EF BF BD);
// - tgetch() is getchar(), so the game reads one byte per tty_nhgetch().
//   0xC3, the first byte of 'é', is the key M-C, bound to #conduct.
// Each read is preceded by its own boundary, so the recording's boundaries
// fall between bytes, not between moves characters, and the bytes of one
// multi-byte key are read at successive boundaries. The recorder writes the
// last key at its moves.length-th boundary and keeps moves.length + 1
// boundaries (recordedBoundaryLimit() below), but the game does not wait for
// it: it reads the bytes still in the pipe, and plays the commands they
// complete, before the recorder's SIGTERM arrives. The game's RNG log is line
// buffered, and the recorder reads it after that last boundary, so the
// recording's last step holds the RNG calls of those commands. This returns
// every byte, and playSegment() replays them all.
export function recordedInputBytes(moves) {
    const bytes = [];
    for (let i = 0; i < moves.length; i++) {
        const unit = moves.charCodeAt(i) === 0x0d ? 0x0a : moves.charCodeAt(i);
        if (unit < 0x80) {
            bytes.push(unit);
        } else if (unit < 0x800) {
            bytes.push(0xc0 | (unit >> 6), 0x80 | (unit & 0x3f));
        } else {
            const cp = unit >= 0xd800 && unit <= 0xdfff ? 0xfffd : unit;
            bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f),
                0x80 | (cp & 0x3f));
        }
    }
    return bytes;
}

// The input boundaries scripts/record-session.mjs keeps from a segment that
// replays moves: the initial one and one per key it writes. It ignores every
// later boundary's screen, cursor and animation frames, so the capture hook
// stops at this many; the game keeps reading the bytes a multi-byte key left
// in the pipe (recordedInputBytes()).
export function recordedBoundaryLimit(moves) {
    return moves.length + 1;
}

export function segmentIterationLimit(movesLength) {
    return Math.max(
        movesLength * (MAX_COMMAND_COUNT + 1) + 1,
        1024,
    );
}

// ── Per-segment runner — the contest contract ──
//
// The judge calls runSegment() once per segment. Input is a clean replay
// descriptor with up to six fields (NO recorded answers):
//
//   { seed: number,           // PRNG seed
//     datetime: string,       // fixed datetime "YYYYMMDDHHMMSS"
//     nethackrc: string,      // game-options rc text
//     moves: string,          // raw key sequence to replay from launch
//     recorderIsDst: boolean, // recorder tm_isdst bit; the judge never
//                             //   passes it, so it defaults to
//                             //   JUDGE_RECORDER_IS_DST (true)
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
// the segment reached. inputBytes, when supplied, replaces the bytes
// recordedInputBytes() derives from moves; unit tests use it for a byte that
// no recording can deliver, such as 0377, which tty getline() reads as EOF.
//
// Two entry points share playSegment() and differ only in what an error that
// is neither a boundary refusal nor input exhaustion does:
//
// - runSegment() is the judge's. frozen/ps_test_runner.mjs discards a
//   segment's output, and every later segment's, when the call throws, so a
//   crash here ends the segment the way a refusal does: the returned game
//   keeps every screen, cursor, animation frame and RNG call captured before
//   the crash, records the error as game.segmentError, and passes it to
//   options.onError.
// - runSegmentStrict() rethrows the error. Every local test and tool uses it,
//   so a crash fails them instead of passing as a short replay;
//   scripts/run-segment-imports.test.mjs fails when a file imports the
//   judge's entry point instead.
//
// Both record and drop the same way after the segment terminates: an RNG log
// append or a key read by a chain some caller discarded (js/rng.js, "Segment
// termination"). runSegment() keeps the scores the judge computes and passes
// the violations to the reporter below; runSegmentStrict() throws after the
// segment, with the game attached as `segmentGame` for diagnosis.
//
// A js/youprop.js macro given the wrong argument differs the same way
// (js/gstate.js recordArgumentMisuse()): it throws under runSegmentStrict(),
// and under runSegment() it is recorded, with the answer recovered; the uses
// are kept as game.argumentMisuses and passed to the reporter below.
export async function runSegment(input, options = {}) {
    const nhGame = createSegmentGame(input, options);
    resetArgumentMisuses();
    const previousRecording = setArgumentMisuseRecording(true);
    try {
        await playSegment(nhGame, input, options);
    } catch (error) {
        nhGame.segmentError = {
            name: error instanceof Error ? error.name : typeof error,
            message: String(error instanceof Error ? error.message : error),
            stack: error instanceof Error ? error.stack ?? null : null,
        };
        options.onError?.(error);
        segmentErrorReporter?.(nhGame.segmentError);
    } finally {
        setArgumentMisuseRecording(previousRecording);
    }
    nhGame.terminationViolations = terminationViolations();
    if (nhGame.terminationViolations.length)
        terminationViolationReporter?.(nhGame.terminationViolations);
    nhGame.argumentMisuses = recordedArgumentMisuses();
    if (nhGame.argumentMisuses.length)
        argumentMisuseReporter?.(nhGame.argumentMisuses);
    return nhGame;
}

export async function runSegmentStrict(input, options = {}) {
    const nhGame = createSegmentGame(input, options);
    const previousRecording = setArgumentMisuseRecording(false);
    try {
        await playSegment(nhGame, input, options);
    } finally {
        setArgumentMisuseRecording(previousRecording);
    }
    nhGame.terminationViolations = terminationViolations();
    if (nhGame.terminationViolations.length) {
        const error = new Error('the segment terminated, then '
            + nhGame.terminationViolations
                .map(({ kind, detail }) => `${kind}: ${detail}`).join('; '));
        error.name = 'TerminationViolationError';
        error.segmentGame = nhGame;
        throw error;
    }
    return nhGame;
}

// Local scoring runs the unmodified judge in a child process, which keeps no
// returned game, so scripts/segment-error-preload.mjs registers here to
// receive each game.segmentError that runSegment() records. The judge never
// registers one.
let segmentErrorReporter = null;
export function setSegmentErrorReporter(reporter) {
    segmentErrorReporter = reporter;
}

// The same, for the termination violations runSegment() recorded in a
// segment: one call per segment that has any, with an array of
// { kind, detail }. The judge never registers one.
let terminationViolationReporter = null;
export function setTerminationViolationReporter(reporter) {
    terminationViolationReporter = reporter;
}

// The same, for the js/youprop.js argument uses that runSegment() recorded in
// a segment (js/gstate.js): one call per segment that has any,
// with an array of { kind, detail, count }. The judge never registers one.
let argumentMisuseReporter = null;
export function setArgumentMisuseReporter(reporter) {
    argumentMisuseReporter = reporter;
}

function createSegmentGame(input, { traceThemeroomSelections = false } = {}) {
    const { seed, datetime, nethackrc, recorderIsDst, storage } = input;
    return new NethackGame({
        seed,
        datetime,
        nethackrc,
        recorderIsDst,
        storage,
        themeroomSelectionCollector: traceThemeroomSelections
            ? createThemeroomSelectionCollector()
            : null,
    });
}

async function playSegment(nhGame, input, { onBoundary = null, inputBytes = null } = {}) {
    const moves = input.moves || '';

    const display = new GameDisplay(null);
    display.onEmptyQueue = () => { throw new Error('Input queue empty - test may be missing keystrokes'); };
    nhGame._pendingDisplay = display;

    const keys = inputBytes ?? recordedInputBytes(moves);
    if (!inputBytes) nhGame._boundaryLimit = recordedBoundaryLimit(moves);
    for (const byte of keys)
        display.pushKey(byte);

    let started;
    try {
        started = await nhGame.start();
    } catch (error) {
        // A recording may deliberately end at any startup input boundary.
        // nhgetch() has already captured that boundary before discovering
        // that the replay recipe has no next key.
        if (String(error?.message || '').includes('Input queue empty'))
            return;
        if (isUnportedBoundary(error)) {
            onBoundary?.(error);
            return;
        }
        throw error;
    }
    // start() returns false when the segment terminated during start-up.
    if (!started) return;

    // Drive the game loop until input is exhausted. The judge looks
    // at game.getScreens() afterwards; whatever the contestant
    // captured is what gets compared.
    // A single legal count can repeat through MAX_COMMAND_COUNT turns before
    // the next input boundary.  Keep a finite runaway guard, but size it from
    // the portable source limit rather than truncating valid counted commands.
    const maxIter = segmentIterationLimit(keys.length);
    for (let iter = 0; iter < maxIter; iter++) {
        // Once terminated, moveloop_core() would only read a raw key, and an
        // empty queue here would be misread as input exhaustion below.
        if (isTerminated()) break;
        try {
            await moveloop_core();
        } catch (e) {
            if (String(e?.message || '').includes('Input queue empty')) {
                nhGame._inputExhausted = true;
                break;
            }
            if (isUnportedBoundary(e)) {
                onBoundary?.(e);
                break;
            }
            throw e;
        }
        // C's moveloop() never returns: nh_terminate() exits the process.
        // Here nh_terminate() takes the final capture, sets gameover, and
        // moveloop_core() returns once its termination notice settles.
        if (game.program_state?.gameover) break;
    }
}
