// Verdicts for the C functions that scripts/c-function-map.mjs cannot
// classify by rule: each one names a function that has no JavaScript function
// of its own name, no `C ref:` comment that the map accepts, and a definition
// the recorder compiles. Each entry is keyed `<file>.c <name>` and gives a
// category with its reason:
//
// - otherName: ported under another name or inside a caller. `js` names the
//   JavaScript file, and the function there, that holds the port; the reason
//   says what part it is, or which part is missing when the port is partial.
// - unreachable: compiled, but no session can reach it. The reason gives the
//   C condition that rules it out.
// - noVisibleEffect: reachable, but nothing it does reaches the screen, the
//   cursor or the random numbers the scorer compares, nor state that later
//   reaches them.
// - unportedVisible: reachable, with an effect the scorer can see, and not
//   ported.
//
// A function the C code never calls in the recorder's build is unreachable;
// one it calls whose only visible arm needs a host failure is
// noVisibleEffect. A JavaScript port of a function the build cannot reach is
// still otherName.
//
// C_FUNCTION_RULE_OVERRIDES, at the end, replaces the otherName rule for the
// functions whose accepted `C ref:` comment does not mark a port.
//
// scripts/c-function-map.test.mjs fails when a function needs a verdict and
// has none, when an entry here names a function that no longer needs one
// (ported under its own name, or matched by a rule), when an otherName entry
// cites a JavaScript function its file does not define, when an override
// names a function the rule no longer matches, and when the counts below
// differ from VERDICT_TOTALS.
//
// The entries began as the function map of 2026-11-13
// (.cache/lead/reports/2026-11-13/function-map.md) and its review
// (function-map-review.md in the same folder). Each function the review
// found misjudged is now named in js/ or matched by a rule, so none of those
// verdicts remains here; restore.c inven_inuse() matches by its C ref,
// although its dorecover() arm ("Finishing off %s...") is still missing.
// The gameplay entries copy the map's per-function verdicts. The map classified the infrastructure files (options, config,
// files, Lua bindings, tty, termcap, windows, library) by rule; each entry
// here applies one of those rules to one function, citing the JavaScript
// that holds a port as it stood when the entry was added. An independent
// double-check on 2026-11-14 re-derived every entry from the C source and
// from js/; .cache/lead/reports/2026-11-14/fmap-check/adjudication.md
// records the 78 entries it disputed and how each was settled.

export const VERDICT_CATEGORIES = Object.freeze([
    'otherName', 'unreachable', 'noVisibleEffect', 'unportedVisible',
]);

// The number of entries in each category, counting C_FUNCTION_VERDICTS and
// C_FUNCTION_RULE_OVERRIDES together. Change these in the same commit as the
// entries; the test fails in either direction.
export const VERDICT_TOTALS = Object.freeze({
    otherName: 276,
    unreachable: 200,
    noVisibleEffect: 194,
    unportedVisible: 2,
});

const ported = (js, reason = 'ported under another name or inside a caller') =>
    Object.freeze({ category: 'otherName', js, reason });
const unreachable = (reason) => Object.freeze({ category: 'unreachable', reason });
const noEffect = (reason) => Object.freeze({ category: 'noVisibleEffect', reason });
const visible = (reason) => Object.freeze({ category: 'unportedVisible', reason });

// Reasons that many entries share.
const MEMORY = 'frees or allocates memory, which the port leaves to the garbage collector';
const SAVEOPTIONS = 'serializes options for #saveoptions; record-session.mjs writes each segment\'s rc file afresh, so no session reads the result';
const CONFIG_STATEMENT = 'a config statement that parseNethackrc() dispatches through CONFIG_STATEMENT_HANDLERS';
const NOCWD = 'does nothing but nhUse() its argument without NOCWD_ASSUMPTIONS, which the Linux build leaves undefined';
const QT = 'does nothing without QT_GRAPHICS, which the tty build leaves undefined';
const SYSCF_ONLY = 'a sysconf-only statement: parse_config_line() skips it in a user rc (cfgfiles.c:1424), and the recorder\'s sysconf does not set it';
const SYSCF_FIXED = 'a sysconf statement that the recorder\'s fixed sysconf sets; RECORDER_SYSTEM_OPTIONS in js/jsmain.js holds the result';
const SYSCF_SILENT = 'a sysconf statement that the recorder\'s sysconf sets, with no effect on the screen or the random numbers';
const WINDOWS_RC = 'part of rcfile_interface_options(), which only sys/windows/windmain.c calls';
const NO_CALLER = 'no caller in the compiled build';
const LUA_UNUSED = 'a Lua binding that no shipped dat/*.lua program calls';
const LUA_PLUMBING = 'Lua runtime plumbing (userdata, stack pushes, registration, memory and step accounting) with no game effect';
const LUA_DIRECT = 'a Lua binding: the port runs the dat/*.lua program as JavaScript, which calls the wrapped C function directly';
const EXTRACOLOR = 'computes or writes the 256-colour escape for an RGB customisation, which patch 006\'s shadow buffer does not capture';
const ESCAPE = 'writes a terminal escape sequence or mode change that patch 006\'s shadow buffer, which the scorer reads, does not capture';
const CMDLINE = 'reached only from a command-line option; the recorder passes only "-u <name>"';
const HANGUP = 'a hangup procedure; no SIGHUP reaches the recorder, whose input is a pipe';
const GENL = 'a windows.c generic or default procedure that the tty window port does not install';
const BUILD_CONST = 'computes a build constant; js/mdlib.js and js/version.js hold the recorder\'s values';
const SAVE_COMPAT = 'a save or bones file compatibility check; the port\'s input.storage snapshots carry no C file header';
const FILE_IO = 'file plumbing (names, handles, locks, the record and panic files); the port keeps game state in input.storage, the scorer sees no file, and the only messages report file errors';
const COMPRESS = 'compresses or converts a save or bones file; the port stores uncompressed snapshots in input.storage';
const EMBEDDED_DATA = 'opens a data file; the port reads the data from generated modules';
const C_STRING = 'a C string helper; the callers use JavaScript string operations';
const MAILBOX = 'polls the host mailbox, which nothing changes during a recorded game';
const MAIL_DELIVERY = 'runs only when the host mailbox changes during play, which no recorded game makes happen';
const OPTION_HANDLERS = 'an option handler; js/options.js splits it among OPTION_VALUE_HANDLERS, OPTION_SET_HANDLERS and OPTION_HANDLERS';
const CRASH_REPORT = 'crash-report set-up or a panic backtrace, which a correct game never shows';
const RNG_SETUP = 'random-number set-up; js/rng.js seeds the generator as the patched build does';
const PLAYER_SELECTION = 'the tty player-selection menus';
const SELECTION_CLASS = 'a selection operation; ThemeroomSelection in js/themerooms.js holds the selection';
const SYMBOL_TABLES = 'the symbol tables';
const CURSOR = 'cursor movement, which the shadow buffer records as a position';
const ATTRIBUTES = 'the attribute and colour of each cell';
const MENU_TEXT = 'a menu line with no selector';
const TTY_MENU = 'the tty menu window';
const TTY_STATUS = 'the tty status line layout';
const DUMPLOG = 'DUMPLOG is off (include/config.h:669); the compiled stub writes no file the session sees';
const SYSCF_GDB = 'a sysconf statement that the recorder\'s sysconf keeps only on a host with '
    + '/usr/bin/gdb (nethack-c/build-recorder.sh:166-178); its value steers only NH_abort()\'s '
    + 'backtrace, which a correct game never reaches';
const DUMP_INSTALLED = 'installed only by dump_redirect(TRUE), whose every call (end.c:549, '
    + '1402, 1484) is inside #ifdef DUMPLOG, which include/config.h:669 leaves undefined';
export const C_FUNCTION_VERDICTS = Object.freeze({
    // allmain.c
    'allmain.c timet_to_seconds': noEffect('feeds livelog and xlogfile only'),

    // alloc.c
    'alloc.c alloc': noEffect(MEMORY),
    'alloc.c re_alloc': noEffect(MEMORY),
    'alloc.c dupstr': noEffect(MEMORY),
    'alloc.c FITSint_': noEffect('narrows a Lua integer to an int, calling panic() only when '
        + 'it does not fit; the port holds the value as a number'),
    'alloc.c FITSuint_': unreachable('its callers are dlb.c under #ifdef DLB, which '
        + 'include/config.h:406 and the linux-minimal hints leave undefined, and nhdupstr() '
        + 'under MONITOR_HEAP'),

    // bones.c
    'bones.c free_ebones': unreachable('no caller in the compiled build (mon.c dealloc_mextra '
        + 'frees mextra directly)'),

    // botl.c
    'botl.c do_statusline1': unreachable('bot() calls it only for a window port without '
        + 'WC2_STATUS; tty takes the field-by-field status path'),
    'botl.c cond_cmp': ported('js/display.js _statusConditionEntries'),
    'botl.c menualpha_cmp': ported('js/options.js handler_status_conditions'),
    'botl.c cond_menu': ported('js/options.js handler_status_conditions'),
    'botl.c opt_next_cond': noEffect('#saveoptions RC-file writer; JS stops at '
        + 'note_unported(\'cfgfiles.c fopen\') js/cfgfiles.js:100'),
    'botl.c anything_to_s': ported('js/display.js _statusLine1Layout'),
    'botl.c percentage': ported('js/display.js _statusPercentage'),
    'botl.c exp_percentage': ported('js/display.js _statusExperiencePercentage'),
    'botl.c stat_cap_indx': ported('js/display.js _capacityStatus'),
    'botl.c stat_hunger_indx': unreachable('no tty caller'),
    'botl.c bl_idx_to_fldname': unreachable('X11 only'),
    'botl.c fldname_to_bl_indx': ported('js/options.js statusHiliteFieldName'),
    'botl.c hilite_reset_needed': ported('js/display.js _statusFieldNotice',
        'the status highlight timer test'),
    'botl.c get_hilite': ported('js/display.js _statusFieldData',
        'the status highlight rule choice'),
    'botl.c is_fld_arrayvalues': ported('js/options.js parse_status_hl2'),
    'botl.c all_options_statushilites': noEffect(SAVEOPTIONS),

    // calendar.c
    'calendar.c getlt': ported('js/calendar.js getLocalTime'),

    // cfgfiles.c
    'cfgfiles.c fopen_config_file': ported('js/cfgfiles.js get_configfile',
        'the recorder\'s $HOME/.nethackrc lookup'),
    'cfgfiles.c cnf_line_OPTIONS': ported('js/options.js parseNethackrc', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_AUTOPICKUP_EXCEPTION': ported('js/options.js parseNethackrc', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_BINDINGS': ported('js/options.js parseNethackrc', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_AUTOCOMPLETE': ported('js/options.js parseNethackrc', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_MSGTYPE': ported('js/options.js parseNethackrc', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_HACKDIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_LEVELDIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_SAVEDIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_BONESDIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_DATADIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_SCOREDIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_LOCKDIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_CONFIGDIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_TROUBLEDIR': noEffect(NOCWD),
    'cfgfiles.c cnf_line_NAME': ported('js/options.js parseNethackrc', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_ROLE': ported('js/options.js applyDirectOption', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_dogname': ported('js/options.js applyDirectOption', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_catname': ported('js/options.js applyDirectOption', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_WIZARDS': ported('js/jsmain.js set_playmode', SYSCF_FIXED),
    'cfgfiles.c cnf_line_SHELLERS': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_MSGHANDLER': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_EXPLORERS': ported('js/jsmain.js set_playmode', SYSCF_FIXED),
    'cfgfiles.c cnf_line_DEBUGFILES': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_DUMPLOGFILE': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_GENERICUSERS': ported('js/tty_startup.js isGenericPlayerName', SYSCF_FIXED),
    'cfgfiles.c cnf_line_BONES_POOLS': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_SUPPORT': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_RECOVER': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_CHECK_SAVE_UID': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_CHECK_PLNAME': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_SEDUCE': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_HIDEUSAGE': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_MAXPLAYERS': noEffect(SYSCF_SILENT),
    'cfgfiles.c cnf_line_PERSMAX': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_PERS_IS_UID': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_ENTRYMAX': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_POINTSMIN': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_MAX_STATUENAME_RANK': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_LIVELOG': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_PANICTRACE_LIBC': noEffect(SYSCF_SILENT),
    'cfgfiles.c cnf_line_PANICTRACE_GDB': noEffect(SYSCF_GDB),
    'cfgfiles.c cnf_line_GDBPATH': noEffect(SYSCF_GDB),
    'cfgfiles.c cnf_line_GREPPATH': noEffect(SYSCF_SILENT),
    'cfgfiles.c cnf_line_CRASHREPORTURL': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_ACCESSIBILITY': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_PORTABLE_DEVICE_PATHS': unreachable(SYSCF_ONLY),
    'cfgfiles.c cnf_line_HILITE_STATUS': ported('js/options.js parseNethackrc', CONFIG_STATEMENT),
    'cfgfiles.c cnf_line_QT_TILEWIDTH': noEffect(QT),
    'cfgfiles.c cnf_line_QT_TILEHEIGHT': noEffect(QT),
    'cfgfiles.c cnf_line_QT_FONTSIZE': noEffect(QT),
    'cfgfiles.c cnf_line_QT_COMPACT': noEffect(QT),
    'cfgfiles.c parse_config_line': ported('js/options.js parseNethackrc',
        'the statement match and dispatch'),
    'cfgfiles.c l_get_config_errors': unreachable(LUA_UNUSED),
    'cfgfiles.c read_config_file': ported('js/options.js parseNethackrc', 'the rc read'),
    'cfgfiles.c cnf_parser_init': ported('js/cfgfiles.js parse_conf_file',
        'the parser state that parse_conf_file() threads through'),
    'cfgfiles.c cnf_parser_done': noEffect('only frees parser->inbuf and parser->buf '
        + '(cfgfiles.c:1677-1684)'),
    'cfgfiles.c parse_conf_str': ported('js/tutorial_level.js loadTutorialLevel',
        'nh.parse_config() from tut-1.lua, reduced to the three fixed lines that program '
        + 'passes'),
    'cfgfiles.c rcfile_interface_options': unreachable(WINDOWS_RC),
    'cfgfiles.c heed_all_config_statements': unreachable(WINDOWS_RC),
    'cfgfiles.c disregard_all_config_statements': unreachable(WINDOWS_RC),
    'cfgfiles.c heed_this_config_statement': unreachable(NO_CALLER),
    'cfgfiles.c disregard_this_config_statement': unreachable(NO_CALLER),
    'cfgfiles.c clear_ignore_errors_on_unmatched': unreachable(WINDOWS_RC),
    'cfgfiles.c set_ignore_errors_on_unmatched': unreachable(WINDOWS_RC),
    'cfgfiles.c config_unmatched_ignored': ported('js/options.js parseNethackrc',
        'returns FALSE outside rcfile_interface_options(), which the recorder never runs; '
        + 'parseNethackrc() reports the unmatched entry'),
    'cfgfiles.c assure_syscf_file': noEffect('exits only when the sysconf file is unreadable, '
        + 'and the recorder always installs one'),

    // coloratt.c
    'coloratt.c free_menu_coloring': noEffect(MEMORY),
    'coloratt.c set_map_customcolor': ported('js/display.js glyphPresentation',
        'the glyph colour customisation'),
    'coloratt.c color_distance': noEffect(EXTRACOLOR),
    'coloratt.c closest_color': noEffect(EXTRACOLOR),
    'coloratt.c get_nhcolor_from_256_index': unreachable(NO_CALLER),

    // date.c
    'date.c populate_nomakedefs': ported('js/mdlib.js mdlib_version_string', BUILD_CONST),
    'date.c free_nomakedefs': noEffect(MEMORY),

    // decl.c
    'decl.c program_state_init': ported('js/jsmain.js _startGame',
        'g.program_state = {} for each game stands for the zero init_program_state'),
    'decl.c decl_globals_init': ported('js/gstate.js resetGame',
        'initialGameState() and _startGame() build each game\'s globals from decl.c\'s '
        + 'initial values'),
    'decl.c sa_victual': noEffect('empty function for a static analyser'),

    // detect.c
    'detect.c skip_premap_detect': ported('js/mklev.js premap_detect'),

    // display.c
    'display.c mon_warning': ported('js/display.js monsterWarnsHero'),
    'display.c mon_overrides_region': ported('js/display.js newsym'),
    'display.c under_ground': unreachable('u.uburied set only by bury_you(), which is #if 0 '
        + '(dig.c:2191)'),
    'display.c newsym_force': ported('js/display.js newsym',
        'tty dirty marks dropped by design'),
    'display.c clear_glyph_buffer': ported('js/display.js cls',
        'ported in part: JS always sets gnew=0; C sets gnew=1 when the unexplored glyph '
        + 'is not blank (e.g. SYMBOLS=S_unexplored:x)'),
    'display.c row_refresh': ported('js/display.js docorner',
        'ported in part: force test omits glyphflags/tileidx (minor)'),
    'display.c set_seenv': ported('js/display.js feel_location'),
    'display.c fn_cmap_to_glyph': unreachable('only caller is win/Qt'),

    // do.c
    'do.c currentlevel_rewrite': noEffect('level-file creation; message only on file error'),

    // dog.c
    'dog.c free_edog': unreachable('no caller in the compiled build'),

    // dogmove.c
    'dogmove.c wantdoor': ported('js/dogmove.js nearestVisibleGoal'),
    'dogmove.c mnum_leashable': ported('js/apply.js leashable'),

    // dokick.c
    'dokick.c watchman_thief_arrest': ported('js/dokick.js kick_door'),
    'dokick.c watchman_door_damage': ported('js/dokick.js kick_door'),

    // dungeon.c
    'dungeon.c dumpit': noEffect('init_dungeons() calls it under the DEBUG that '
        + 'include/patchlevel.h:36 defines, but it returns at once unless explicitdebug(), '
        + 'which needs sysconf DEBUGFILES; the recorder\'s sysconf leaves it unset'),
    'dungeon.c free_proto_dungeon': noEffect('frees parse buffers'),

    // eat.c
    'eat.c food_substitution': unreachable('no callers'),

    // end.c
    'end.c done1': unreachable('SIGINT handler'),
    'end.c done_intr': unreachable('signal handler'),
    'end.c done_hangup': unreachable('SIGHUP handler'),
    'end.c dump_everything': noEffect(DUMPLOG),
    'end.c wordcount': ported('js/jsmain.js buildEnglishList'),
    'end.c bel_copy1': ported('js/jsmain.js buildEnglishList'),
    'end.c build_english_list': ported('js/jsmain.js buildEnglishList'),

    // engrave.c
    'engrave.c forget_engravings': ported('js/bones.js savebones', 'merged into bones save'),
    'engrave.c del_engr': ported('js/engrave.js del_engr_at',
        'one engraving per square makes it equivalent'),
    'engrave.c see_engraving': unreachable('no callers'),
    'engrave.c feel_engraving': unreachable('no callers'),

    // files.c
    'files.c fname_encode': unreachable(NO_CALLER),
    'files.c fname_decode': unreachable(NO_CALLER),
    'files.c fqname': noEffect(FILE_IO),
    'files.c validate_prefix_locations': unreachable(NO_CALLER),
    'files.c fopen_datafile': noEffect('an fopen() of a data, record, log or panic file; '
        + 'every file it opens exists in the recorder\'s install, the port embeds the data '
        + 'files and keeps the record in input.storage, and the callers read what it opens'),
    'files.c init_nhfile': noEffect(FILE_IO),
    'files.c new_nhfile': noEffect(FILE_IO),
    'files.c free_nhfile': noEffect(FILE_IO),
    'files.c close_nhfile': noEffect(FILE_IO),
    'files.c rewind_nhfile': noEffect(FILE_IO),
    'files.c viable_nhfile': noEffect(FILE_IO),
    'files.c nhclose': noEffect(FILE_IO),
    'files.c set_levelfile_name': noEffect(FILE_IO),
    'files.c create_levelfile': ported('js/do.js goto_level',
        'setting LFILE_EXISTS for the level, without the file'),
    'files.c open_levelfile': noEffect(FILE_IO),
    'files.c clearlocks': noEffect(FILE_IO),
    'files.c strcmp_wrap': ported('js/files.js get_saved_games',
        'the strcmp() order of the saved-game names'),
    'files.c set_bonestemp_name': noEffect(FILE_IO),
    'files.c compress_bonesfile': noEffect(COMPRESS),
    'files.c save_savefile_name': noEffect(FILE_IO),
    'files.c set_error_savefile': noEffect(FILE_IO),
    'files.c create_savefile': ported('js/save.js dosave0',
        'vfsWriteFile(set_savefile_name()) stands for creat(); the failure arm needs a host '
        + 'error'),
    'files.c open_savefile': ported('js/save.js dosave0',
        'vfsReadFile(savefile) != null is its success test, which decides the "old save file" '
        + 'prompt here and the restore in js/jsmain.js'),
    'files.c delete_savefile': ported('js/restore.js dorestore',
        'removing the save after a restore'),
    'files.c get_freeing_nhfile': noEffect(FILE_IO),
    'files.c check_panic_save': noEffect(FILE_IO),
    'files.c free_saved_games': noEffect(MEMORY),
    'files.c redirect': noEffect(COMPRESS),
    'files.c docompress_file': noEffect(COMPRESS),
    'files.c nh_compress': noEffect(COMPRESS),
    'files.c nh_uncompress': noEffect(COMPRESS),
    'files.c problematic_savefile': unreachable('restore_saved_game() calls it only for a '
        + 'save file that is truncated or from another build, and the recorder restores '
        + 'only saves it wrote'),
    'files.c doconvert_file': noEffect(COMPRESS),
    'files.c nh_sfconvert': noEffect(COMPRESS),
    'files.c nh_sfunconvert': unreachable(NO_CALLER),
    'files.c make_converted_name': noEffect(COMPRESS),
    'files.c delete_convertedfile': noEffect(COMPRESS),
    'files.c free_convert_filenames': noEffect(MEMORY),
    'files.c contains_directory': noEffect(COMPRESS),
    'files.c lock_file': noEffect(FILE_IO),
    'files.c unlock_file': noEffect(FILE_IO),
    'files.c fopen_sym_file': noEffect(EMBEDDED_DATA + '; the open itself always succeeds '
        + 'in the recorder\'s install'),
    'files.c check_recordfile': noEffect(FILE_IO),
    'files.c paniclog': noEffect('appends to the paniclog file, which no session displays'),
    'files.c testinglog': unreachable(NO_CALLER),
    'files.c do_deferred_showpaths': unreachable(CMDLINE),
    'files.c debugcore': noEffect('answers whether sysconf DEBUGFILES names a source file, so '
        + 'that debugpline() traces print; the recorder\'s sysconf sets no DEBUGFILES, so it '
        + 'always answers FALSE'),
    'files.c reveal_paths': unreachable(CMDLINE),

    // getpos.c
    'getpos.c getpos_toggle_hilite_state': ported('js/getpos.js getpos',
        'inline in the hilite toggle'),
    'getpos.c mapxy_valid': ported('js/display.js map_framecolor'),

    // glyphs.c
    'glyphs.c fix_glyphname': ported('js/glyph_ids.js fixGlyphName'),
    'glyphs.c glyph_find_core': ported('js/glyphs.js glyph_find'),
    'glyphs.c match_glyph': ported('js/glyph_ids.js sourceGlyphName'),
    'glyphs.c glyphrep': ported('js/symbols.js applySymbolAssignments'),
    'glyphs.c add_custom_nhcolor_entry': ported('js/glyphs.js addDetail'),
    'glyphs.c shuffle_customizations': ported('js/glyphs.js maybe_shuffle_customizations',
        'second definition (646); the first (591) is #if 0'),
    'glyphs.c find_matching_customization': ported('js/glyphs.js addDetail'),
    'glyphs.c purge_all_custom_entries': noEffect('exit-time memory'),
    'glyphs.c dump_all_glyphids': unreachable('only earlyarg.c dump_glyphids() calls it, '
        + 'for the --dumpglyphids option; ' + CMDLINE),

    // hacklib.c
    'hacklib.c c_eos': ported('js/hacklib.js eos', C_STRING),
    'hacklib.c strkitten': ported('js/hacklib.js eos', C_STRING),
    'hacklib.c strNsubst': ported('js/uhitm.js hmon_hitmon_msg_silver', C_STRING),
    'hacklib.c findword': ported('js/tty_startup.js isGenericPlayerName',
        'inline in the generic-name check'),
    'hacklib.c nh_snprintf': ported('js/uhitm.js hmon_hitmon_msg_silver', C_STRING),
    'hacklib.c unicodeval_to_utf8str': ported('js/hacklib.js encodeUtf8Text',
        'UTF-8 encoding of a symbol customisation'),
    'hacklib.c case_insensitive_comp': noEffect('its one compiled caller, date.c '
        + 'populate_nomakedefs(), matches the __DATE__ month for nomakedefs.build_time, which '
        + 'only MICRO comp_times() reads; the mdlib.c calls are WIN32-only'),
    'hacklib.c copy_bytes': unreachable(NO_CALLER),
    'hacklib.c datamodel': ported('js/mdlib.js build_options', BUILD_CONST),
    'hacklib.c what_datamodel_is_this': unreachable('compare_critical_bytes() calls it only '
        + 'when a save file\'s critical sizes differ from the binary\'s (version.c:784-786); '
        + 'every save a session restores was written by the same recorder build'),

    // invent.c
    'invent.c prepare_perminvent': unreachable('TTY_PERM_INVENT off (include/config.h:612); '
        + 'only a mode hand-off to the window port'),
    'invent.c sync_perminvent': unreachable('perm_invent_toggled() calls it only when '
        + 'perm_invent turns on, which needs TTY_PERM_INVENT (options.c:5509-5520), off in '
        + 'the build'),
    'invent.c perm_invent_toggled': noEffect('done_object_cleanup() (end.c:898-901) calls '
        + 'it when an rc file set perm_invent; it destroys WIN_INVEN, which tty never shows '
        + 'without TTY_PERM_INVENT, and the disclosure inventory that follows passes '
        + 'want_reply TRUE (end.c:635-638), so it uses the cached menu window either way'),

    // light.c
    'light.c new_light_core': ported('js/light.js new_light_source'),
    'light.c delete_ls': ported('js/light.js del_light_source'),
    'light.c obj_move_light_source': unreachable('no callers'),

    // mail.c
    'mail.c free_maildata': noEffect(MEMORY),
    'mail.c getmailstatus': noEffect(MAILBOX),
    'mail.c md_start': unreachable(MAIL_DELIVERY),
    'mail.c md_stop': unreachable(MAIL_DELIVERY),
    'mail.c md_rush': unreachable(MAIL_DELIVERY),
    'mail.c newmail': unreachable(MAIL_DELIVERY),
    'mail.c ckmailstatus': noEffect(MAILBOX),
    'mail.c readmail': visible('forks and runs the host\'s mail reader (DEF_MAILREADER), so '
        + 'what it shows depends on the host; a spe 0 scroll of mail, which a killed mail '
        + 'daemon drops, reaches it; js/read.js seffect_mail() records the gap'),
    'mail.c ck_server_admin_msg': noEffect('its body is empty without SERVER_ADMIN_MSG, which '
        + 'the build leaves undefined'),

    // mdlib.c
    'mdlib.c md_ignored_features': noEffect('feeds nomakedefs.ignored_features, which only '
        + 'check_version() and dump_version_info() read; ' + SAVE_COMPAT),
    'mdlib.c make_version': noEffect('fills the version struct that save headers and '
        + 'check_version() use; the visible version text comes from mdlib_version_string()'),
    'mdlib.c build_savebones_compat_string': ported('js/mdlib.js build_options', BUILD_CONST),
    'mdlib.c count_and_validate_winopts': ported('js/mdlib.js build_options', BUILD_CONST),
    'mdlib.c count_and_validate_soundlibopts': ported('js/mdlib.js build_options', BUILD_CONST),
    'mdlib.c opt_out_words': ported('js/mdlib.js build_options', BUILD_CONST),
    'mdlib.c release_runtime_info': noEffect(MEMORY),

    // mhitu.c
    'mhitu.c mon_avoiding_this_attack': unreachable('no callers'),

    // mklev.c
    'mklev.c mkroom_cmp': ported('js/mklev.js sort_rooms',
        'stable sort on both sides (patch 002)'),
    'mklev.c alloc_doors': noEffect('memory'),
    'mklev.c makevtele': ported('js/mklev.js makeniche'),
    'mklev.c pos_to_room': noEffect('place_branch discards the result'),

    // mkmap.c
    'mkmap.c remove_rooms': unreachable('no callers'),
    'mkmap.c remove_room': unreachable('only from remove_rooms'),

    // music.c
    'music.c obj_to_instr': unreachable('only an argument of Hero_playnotes, empty without '
        + 'SND_LIB_INTEGRATED'),

    // nhlobj.c
    'nhlobj.c l_obj_check': noEffect(LUA_PLUMBING),
    'nhlobj.c l_obj_gc': noEffect(LUA_PLUMBING),
    'nhlobj.c l_obj_push': noEffect(LUA_PLUMBING),
    'nhlobj.c nhl_push_obj': noEffect(LUA_PLUMBING),
    'nhlobj.c l_obj_getcontents': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_add_to_container': ported('js/mklev.js water_surrounded_vault_contents', LUA_DIRECT +
        '; obj:addcontent() in themerms.lua'),
    'nhlobj.c nhl_obj_u_giveobj': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_objects_to_table': noEffect('obj:class() in themerms.lua builds a '
        + 'read-only table whose material only chooses an olocked field, which lspo_object() '
        + 'never reads (sp_lev.c reads locked), so both arms make the same chest'),
    'nhlobj.c l_obj_to_table': ported('js/themeroom_fill.js fillBuriedTreasure', LUA_DIRECT +
        '; obj:totable() in themerms.lua'),
    'nhlobj.c l_obj_at': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_placeobj': ported('js/nhlua.js tutorial_turn', LUA_DIRECT +
        '; o:placeobj() in nhlib.lua'),
    'nhlobj.c l_obj_nextobj': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_container': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_isnull': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_timer_has': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_timer_peek': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_timer_stop': ported('js/themeroom_fill.js fillBuriedZombies', LUA_DIRECT +
        '; o:stop_timer() in themerms.lua'),
    'nhlobj.c l_obj_timer_start': ported('js/themeroom_fill.js fillBuriedZombies', LUA_DIRECT +
        '; o:start_timer() in themerms.lua'),
    'nhlobj.c l_obj_bury': unreachable(LUA_UNUSED),
    'nhlobj.c l_obj_register': noEffect(LUA_PLUMBING),

    // nhlsel.c
    'nhlsel.c l_selection_gc': noEffect(LUA_PLUMBING),
    'nhlsel.c l_selection_push_new': ported('js/themerooms.js selection_new',
        SELECTION_CLASS + '; a fresh, empty selection where the Lua code makes one'),
    'nhlsel.c l_selection_push_copy': ported('js/themerooms.js clone',
        SELECTION_CLASS + '; a copy of the selection that later changes do not alter'),
    'nhlsel.c l_selection_new': ported('js/themerooms.js selection_new', LUA_DIRECT),
    'nhlsel.c l_selection_clone': ported('js/themerooms.js clone', LUA_DIRECT),
    'nhlsel.c l_selection_numpoints': ported('js/themerooms.js numpoints', LUA_DIRECT),
    'nhlsel.c l_selection_getpoint': unreachable(LUA_UNUSED),
    'nhlsel.c l_selection_not': ported('js/themerooms.js negate', LUA_DIRECT),
    'nhlsel.c l_selection_and': ported('js/mines_levels.js selIntersect', LUA_DIRECT +
        '; the & operator'),
    'nhlsel.c l_selection_xor': unreachable(LUA_UNUSED),
    'nhlsel.c l_selection_filter_percent': ported('js/themerooms.js percentage', LUA_DIRECT),
    'nhlsel.c l_selection_rndcoord': ported('js/themerooms.js rndcoord', LUA_DIRECT),
    'nhlsel.c l_selection_room': ported('js/themerooms.js selection_room', LUA_DIRECT),
    'nhlsel.c l_selection_getbounds': ported('js/themerooms.js bounds', LUA_DIRECT),
    'nhlsel.c params_sel_2coords': ported('js/bigrm.js selection_line', LUA_DIRECT +
        '; the argument parsing of line(), rect() and fillrect()'),
    'nhlsel.c l_selection_grow': ported('js/themerooms.js grow', LUA_DIRECT),
    'nhlsel.c l_selection_filter_mapchar': ported('js/themerooms.js filter_mapchar', LUA_DIRECT),
    'nhlsel.c l_selection_match': ported('js/bigrm.js selection_match', LUA_DIRECT),
    'nhlsel.c l_selection_flood': ported('js/themerooms.js selection_floodfill', LUA_DIRECT),
    'nhlsel.c l_selection_circle': unreachable(LUA_UNUSED),
    'nhlsel.c l_selection_ellipse': unreachable(LUA_UNUSED),
    'nhlsel.c l_selection_gradient': unreachable(LUA_UNUSED),
    'nhlsel.c l_selection_size_description': unreachable(LUA_UNUSED),
    'nhlsel.c l_selection_register': noEffect(LUA_PLUMBING),

    // nhlua.c
    'nhlua.c l_nhcore_done': noEffect(LUA_PLUMBING),
    'nhlua.c l_nhcore_call': ported('js/hack.js handle_tip',
        'the nhcore.lua callbacks a game reaches (getpos_tip, enter_tutorial, '
        + 'leave_tutorial) are called directly; nhcore.lua comments out the others'),
    'nhlua.c splev_typ2chr': unreachable('its only caller, nhl_getmap(), is a binding no '
        + 'shipped program calls'),
    'nhlua.c nhl_gettrap': unreachable(LUA_UNUSED),
    'nhlua.c nhl_deltrap': unreachable(LUA_UNUSED),
    'nhlua.c nhl_getmap': unreachable(LUA_UNUSED),
    'nhlua.c nhl_impossible': unreachable('themerms.lua calls nh.impossible() only for a '
        + 'malformed themed-room table, and the shipped tables are well formed'),
    'nhlua.c nhl_pline': ported('js/nhlua.js tutorial_turn', LUA_DIRECT +
        '; nh.pline() in nhlib.lua'),
    'nhlua.c nhl_verbalize': unreachable(LUA_UNUSED),
    'nhlua.c nhl_parse_config': ported('js/tutorial_level.js loadTutorialLevel', LUA_DIRECT +
        '; nh.parse_config() in tut-1.lua'),
    'nhlua.c nhl_get_config': unreachable(LUA_UNUSED),
    'nhlua.c nhl_getlin': unreachable(LUA_UNUSED),
    'nhlua.c nhl_menu': unreachable(LUA_UNUSED),
    'nhlua.c nhl_text': ported('js/hack.js handle_tip', LUA_DIRECT +
        '; nh.text() in nhcore.lua show_getpos_tip()'),
    'nhlua.c nhl_makeplural': unreachable(LUA_UNUSED),
    'nhlua.c nhl_makesingular': unreachable(LUA_UNUSED),
    'nhlua.c nhl_s_suffix': unreachable(LUA_UNUSED),
    'nhlua.c nhl_ing_suffix': unreachable(LUA_UNUSED),
    'nhlua.c nhl_an': unreachable(LUA_UNUSED),
    'nhlua.c nhl_rn2': ported('js/mklev.js makerooms', LUA_DIRECT +
        '; nh.rn2() in themerms.lua and other programs'),
    'nhlua.c nhl_random': ported('js/hell_levels.js mathRandom', LUA_DIRECT +
        '; nh.random() through nhlib.lua\'s math.random shim'),
    'nhlua.c nhl_level_difficulty': ported('js/mklev.js makerooms', LUA_DIRECT +
        '; nh.level_difficulty() in themerms.lua'),
    'nhlua.c nhl_is_genocided': ported('js/quest_levels.js tower1', LUA_DIRECT +
        '; nh.is_genocided() in tower1.lua'),
    'nhlua.c nhl_get_debug_themerm_name': noEffect('reads $THEMERM or $THEMERMFILL only in '
        + 'wizard mode, and a session cannot set an environment variable'),
    'nhlua.c nhl_dnum_name': unreachable('its only call is in nhcore.lua mk_dgl_extrainfo(), '
        + 'which the moveloop_turn entry that would run it comments out'),
    'nhlua.c nhl_int_to_pm_name': unreachable(LUA_UNUSED),
    'nhlua.c nhl_int_to_obj_name': unreachable(LUA_UNUSED),
    'nhlua.c nhl_variable': unreachable(LUA_UNUSED),
    'nhlua.c get_nh_lua_variables': noEffect('saves the nh.variable() table, which no shipped '
        + 'program writes'),
    'nhlua.c save_luadata': noEffect('saves the nh.variable() table, which no shipped program '
        + 'writes'),
    'nhlua.c restore_luadata': ported('js/restore.js dorestore',
        'restgamestate() reloads nhlib.lua through it, which draws rn2(3) and rn2(2)'),
    'nhlua.c nhl_stairways': unreachable(LUA_UNUSED),
    'nhlua.c nhl_test': unreachable(LUA_UNUSED),
    'nhlua.c nhl_pushkey': unreachable(LUA_UNUSED),
    'nhlua.c nhl_doturn': unreachable(LUA_UNUSED),
    'nhlua.c nhl_debug_flags': unreachable(LUA_UNUSED),
    'nhlua.c nhl_flip_level': unreachable(LUA_UNUSED),
    'nhlua.c nhl_timer_has_at': unreachable(LUA_UNUSED),
    'nhlua.c nhl_timer_peek_at': unreachable(LUA_UNUSED),
    'nhlua.c nhl_timer_stop_at': unreachable(LUA_UNUSED),
    'nhlua.c nhl_timer_start_at': ported('js/themeroom_fill.js startMeltTimer', LUA_DIRECT +
        '; nh.start_timer_at() in themerms.lua'),
    'nhlua.c nhl_get_cmd_key': ported('js/tutorial_level.js tutorialCommandKey', LUA_DIRECT +
        '; nh.eckey() in nhlib.lua and the tutorial programs'),
    'nhlua.c nhl_callback': ported('js/nhlua.js tutorial_enter', LUA_DIRECT +
        '; nh.callback() in nhlib.lua and tut-1.lua'),
    'nhlua.c init_nhc_data': ported('js/asmodeus_levels.js hellTweaks', LUA_DIRECT
        + '; the one reachable nhc read, nhlib.lua hell_tweaks() nhc.COLNO * nhc.ROWNO, is '
        + '80 * 21 there'),
    'nhlua.c nhl_push_anything': ported('js/nhlua.js tutorial_turn', LUA_DIRECT
        + '; the u fields nhl_meta_u_index() pushes through it are read from state.u'),
    'nhlua.c nhl_meta_u_index': ported('js/nhlua.js tutorial_turn', LUA_DIRECT +
        '; reads of the u table read the hero\'s state'),
    'nhlua.c nhl_meta_u_newindex': unreachable(LUA_UNUSED +
        '; no shipped program assigns to the u table'),
    'nhlua.c nhl_u_clear_inventory': unreachable(LUA_UNUSED),
    'nhlua.c nhl_u_giveobj': unreachable(LUA_UNUSED),
    'nhlua.c init_u_data': noEffect(LUA_PLUMBING),
    'nhlua.c traceback_handler': ported('js/nhlua.js luaL_traceback',
        'the "stack traceback:" text of a failed protected call'),
    'nhlua.c nhl_getmeminuse': noEffect(LUA_PLUMBING),
    'nhlua.c nhl_clearfromtable': noEffect(LUA_PLUMBING),
    'nhlua.c end_luapat': noEffect(MEMORY),
    'nhlua.c nhl_pushhooked_open_table': unreachable(NO_CALLER),
    'nhlua.c nhlL_openlibs': noEffect(LUA_PLUMBING),
    'nhlua.c nhl_alloc': noEffect(LUA_PLUMBING),
    'nhlua.c nhl_panic': unreachable('Lua calls it only for an error outside a protected '
        + 'call, and NetHack makes every call through lua_pcall()'),
    'nhlua.c nhl_warn': noEffect('writes Lua warnings to the paniclog file, which no session '
        + 'displays'),
    'nhlua.c nhl_hookfn': noEffect(LUA_PLUMBING),

    // o_init.c
    'o_init.c savenames': ported('js/save.js dosave0', 'save format replaced'),
    'o_init.c restnames': ported('js/restore.js dorestore', 'save format replaced'),
    'o_init.c get_sortdisco': ported('js/options.js defaultResult',
        'cnf=FALSE arm only; cnf=TRUE serves #saveoptions'),

    // objnam.c
    'objnam.c releaseobuf': noEffect('rotating static name buffers; JS strings'),
    'objnam.c maybereleaseobuf': noEffect('rotating static name buffers'),
    'objnam.c reorder_fruit': unreachable('DEBUG + wizard + explicitdebug("fruit") only '
        + '(insight.c:1957-1963)'),

    // options.c
    'options.c optfn_pickup_burden': ported('js/options.js parseNethackrc', OPTION_HANDLERS),
    'options.c optfn_race': ported('js/options.js applyParsedCharacterOption', OPTION_HANDLERS),
    'options.c optfn_role': ported('js/options.js applyParsedCharacterOption', OPTION_HANDLERS),
    'options.c optfn_runmode': ported('js/options.js parseNethackrc', OPTION_HANDLERS),
    'options.c optfn_traps': noEffect('a placeholder: setting the traps option changes '
        + 'nothing (options.c:4418-4437)'),
    'options.c handler_windowborders': unreachable('a curses option; optfn_windowborders() '
        + 'reaches it only under the curses window port'),
    'options.c rejectoption': unreachable('string_for_env_opt() calls it only after the game '
        + 'has started, but opt_initial is set for the whole rc read (js/options.js '
        + 'string_for_env_opt)'),
    'options.c nh_getenv': ported('js/mklev.js makelevel', 'the recorder\'s fixed environment'),
    'options.c allopt_array_init': ported('js/options.js defaultResult',
        'the option defaults and each compound do_init arm'),
    'options.c msgtype2name': ported('js/options.js handler_msgtype',
        'inside the MSGTYPE menu'),
    'options.c msgtype_free': noEffect(MEMORY),
    'options.c collect_menu_keys': unreachable(NO_CALLER),
    'options.c optfn_o_autopickup_exceptions': ported('js/options.js parseNethackrc', OPTION_HANDLERS),
    'options.c optfn_o_bind_keys': ported('js/cmd.js optionCommandHelpers', OPTION_HANDLERS),
    'options.c optfn_o_autocomplete': ported('js/cmd.js optionCommandHelpers', OPTION_HANDLERS),
    'options.c optfn_o_message_types': ported('js/options.js handler_msgtype', OPTION_HANDLERS),
    'options.c optfn_o_status_cond': ported('js/options.js handler_status_conditions', OPTION_HANDLERS),
    'options.c get_option_value': noEffect(SAVEOPTIONS),
    'options.c remove_autopickup_exception': ported('js/options.js handler_autopickup_exception',
        'inside the autopickup exception menu'),
    'options.c free_autopickup_exceptions': noEffect(MEMORY),
    'options.c all_options_conds': noEffect(SAVEOPTIONS),
    'options.c all_options_menucolors': noEffect(SAVEOPTIONS),
    'options.c all_options_msgtypes': noEffect(SAVEOPTIONS),
    'options.c all_options_apes': noEffect(SAVEOPTIONS),
    'options.c all_options_strbuf': noEffect(SAVEOPTIONS),
    'options.c set_option_mod_status': noEffect('reached only through '
        + 'set_wc2_option_mod_status(); its sync_perminvent() callers cannot run without '
        + 'TTY_PERM_INVENT'),
    'options.c set_wc_option_mod_status': unreachable(NO_CALLER),
    'options.c set_wc2_option_mod_status': noEffect('its one call (wintty.c:588) gives '
        + 'statuslines set_in_game, which include/optlist.h:734 already gives it'),
    'options.c options_free_window_colors': noEffect(MEMORY),
    'options.c enhance_menu_text': noEffect('its body is compiled out (js/options.js '
        + 'dosetMenuItems says which condition)'),
    'options.c heed_all_options': noEffect('clears the disregard marks only '
        + 'rcfile_interface_options() sets'),
    'options.c disregard_all_options': unreachable(WINDOWS_RC),
    'options.c heed_this_option': unreachable(WINDOWS_RC),
    'options.c disregard_this_option': unreachable(WINDOWS_RC),

    // pager.c
    'pager.c is_swallow_sym': ported('js/pager.js do_screen_description'),
    'pager.c monhealthdescr': noEffect('body #if 0, returns ""'),
    'pager.c hmenu_doextversion': ported('js/pager.js dohelp'),
    'pager.c hmenu_doextlist': ported('js/pager.js dohelp'),

    // pline.c
    'pline.c dumplogmsg': noEffect('feeds DUMPLOG saved_plines (dump log/crash report only; '
        + 'DUMPLOG off)'),
    'pline.c dumplogfreemessages': noEffect('memory'),
    'pline.c putmesg': ported('js/tty_message.js ttyPline', 'merged into message pipeline'),
    'pline.c set_msg_dir': ported('js/zap.js dobuzz', 'message direction for a11y'),
    'pline.c pline_xy': ported('js/pline.js set_msg_xy'),
    'pline.c custompline': ported('js/tty_message.js ttyCustomPline'),
    'pline.c You_buf': ported('js/tty_message.js ttyPlineCore',
        'state.gy.you_buf is the shared buffer, including a nested You() overwriting it'),
    'pline.c free_youbuf': noEffect('memory'),
    'pline.c You': ported('js/tty_message.js ttyPline'),
    'pline.c Your': ported('js/tty_message.js ttyPline'),
    'pline.c You_cant': ported('js/tty_message.js ttyPline'),
    'pline.c pline_The': ported('js/tty_message.js ttyPline'),
    'pline.c There': ported('js/tty_message.js ttyPline'),
    'pline.c You_hear': ported('js/pline.js youHear'),
    'pline.c vraw_printf': ported('js/files.js wizkit_raw_printf'),
    'pline.c execplinehandler': noEffect('runs an external MSGHANDLER program; none '
        + 'configured'),
    'pline.c nhassert_failed': unreachable('called only when an nhassert() or assert() '
        + 'invariant is false, which no valid input is known to cause; if one did, its '
        + 'impossible() message would show'),

    // pray.c
    'pray.c gods_angry': ported('js/pray.js godvoice'),

    // read.c
    'read.c assign_candy_wrapper': ported('js/obj.js mksobj_init',
        'rn2(12) hard-coded rather than derived from the table'),
    'read.c seffect_blank_paper': ported('js/read.js seffects'),

    // region.c
    'region.c free_region': noEffect('memory'),
    'region.c clear_regions': ported('js/game.js constructor'),
    'region.c save_regions': ported('js/save.js savelev', 'level snapshot'),
    'region.c is_hero_inside_gas_cloud': ported('js/region.js heroInsideGasCloud'),
    'region.c make_gas_cloud': ported('js/region.js makeGasCloud'),

    // report.c
    'report.c crashreport_init': noEffect(CRASH_REPORT),
    'report.c crashreport_bidshow': unreachable(CMDLINE),
    'report.c swr_add_uricoded': unreachable('submit_web_report() reaches it only when '
        + 'sysconf CRASHREPORTURL is set, and the recorder\'s sysconf leaves it unset'),
    'report.c NH_panictrace_libc': noEffect(CRASH_REPORT),
    'report.c NH_panictrace_gdb': unreachable('NH_abort() tries libc first, since sysconf '
        + 'PANICTRACE_LIBC=2 exceeds PANICTRACE_GDB (1 or unset), and NH_panictrace_libc() '
        + 'returns TRUE under the PANICTRACE_LIBC that glibc and macOS define (global.h:448-453), '
        + 'so the gdb arm (end.c:1922-1923) never runs'),
    'report.c get_saved_pline': unreachable('submit_web_report() reaches it only when sysconf '
        + 'CRASHREPORTURL is set, and the recorder\'s sysconf leaves it unset'),
    'report.c panictrace_handler': unreachable('the handler for SIGILL, SIGBUS, SIGSEGV and '
        + 'other fault signals, which valid input does not raise; NH_abort() resets them '
        + 'before abort()'),
    'report.c panictrace_setsignals': noEffect(CRASH_REPORT),

    // restore.c
    'restore.c restlevchn': ported('js/restore.js dorestore', 'save format replaced'),
    'restore.c freefruitchn': noEffect('memory'),
    'restore.c restlevelstate': noEffect('its body is a bare return (restore.c:742-749)'),
    'restore.c restlevelfile': ported('js/restore.js dorestore'),
    'restore.c restcemetery': ported('js/restore.js getlev', 'save format replaced'),
    'restore.c rest_levl': ported('js/restore.js getlev', 'save format replaced'),
    'restore.c trickery': unreachable('prints only when a level file is corrupt; JS has no '
        + 'level files'),
    'restore.c moves_to_relative_time': ported('js/save.js shift_level_edog_times'),
    'restore.c relative_time_to_moves': ported('js/save.js shift_level_edog_times'),
    'restore.c get_plname_from_file': ported('js/restore.js dorestore',
        'dorestore() takes snapshot.plname, the name_only read; js/files.js '
        + 'plname_from_file() makes the full read'),
    'restore.c rest_bubbles': ported('js/restore.js dorestore'),
    'restore.c restore_gamelog': ported('js/restore.js dorestore'),
    'restore.c clear_id_mapping': ported('js/bones.js restoreBonesLevel'),
    'restore.c add_id_mapping': ported('js/bones.js restobjchn_ghostly'),
    'restore.c lookup_id_mapping': ported('js/bones.js restoreBonesLevel'),

    // rnd.c
    'rnd.c whichrng': ported('js/rng.js initRng', RNG_SETUP),
    'rnd.c init_isaac64': ported('js/rng.js initRng', RNG_SETUP),
    'rnd.c RND': ported('js/rng.js initRng', RNG_SETUP),
    'rnd.c set_random': ported('js/rng.js initRng', RNG_SETUP),
    'rnd.c init_random': ported('js/rng.js initRng', RNG_SETUP),
    'rnd.c reseed_random': noEffect('a no-op in the patched build (js/do.js goto_level says '
        + 'why)'),

    // role.c
    'role.c gotrolefilter': ported('js/player_selection_tty.js gotRoleFilter',
        'duplicated at js/tty_menu.js:1742'),
    'role.c clearrolefilter': ported('js/tty_menu.js applyRoleFilterSelection'),
    'role.c promptsep': ported('js/player_selection.js appendPostAttributes'),
    'role.c role_gendercount': ported('js/player_selection.js roleGenderCount'),
    'role.c race_alignmentcount': ported('js/player_selection.js raceAlignmentCount'),
    'role.c role_selection_prolog': unreachable(NO_CALLER),
    'role.c genl_player_selection': unreachable('tty installs tty_player_selection() as its '
        + 'player_selection procedure'),
    'role.c genl_player_setup': ported('js/player_selection.js prepare_player_selection',
        'the player-selection menus'),
    'role.c maybe_skip_seps': ported('js/player_selection_tty.js roleMenuExcess',
        'C calls it twice; equivalent with stock tables'),
    'role.c plsel_startmenu': ported('js/player_selection_tty.js facetMenuSpec', PLAYER_SELECTION),
    'role.c setup_rolemenu': ported('js/player_selection_tty.js facetMenuSpec', PLAYER_SELECTION),
    'role.c setup_racemenu': ported('js/player_selection_tty.js facetMenuSpec', PLAYER_SELECTION),
    'role.c setup_gendmenu': ported('js/player_selection_tty.js facetMenuSpec', PLAYER_SELECTION),
    'role.c setup_algnmenu': ported('js/player_selection_tty.js facetMenuSpec', PLAYER_SELECTION),

    // rumors.c
    'rumors.c unpadline': ported('js/random_text.js get_rnd_line'),
    'rumors.c couldnt_open_file': unreachable('data files bundled; open never fails'),
    'rumors.c free_CapMons': noEffect('memory'),

    // save.c
    'save.c save_gamelog': ported('js/save.js serializeGameState'),
    'save.c tricked_fileremoved': noEffect('goto_level() and savestateinlock() call it on '
        + 'every open, and it acts only when a level or lock file the game wrote is missing, '
        + 'which game input cannot cause'),
    'save.c savestateinlock': ported('js/do.js save_currentstate',
        'the checkpoint\'s in-memory effects, including save_msghistory()\'s remember_topl() '
        + 'under in_checkpoint; the restore-time call (restore.c:829) and '
        + 'forget_temple_entry() on migrating priests have none, and neither is known to '
        + 'change the screen'),
    'save.c savelevl': ported('js/save.js savelev'),
    'save.c save_bubbles': ported('js/save.js savelev'),
    'save.c savecemetery': ported('js/save.js savelev'),
    'save.c saveobj': ported('js/save.js saveobjchn'),
    'save.c savelevchn': ported('js/save.js dosave0'),
    'save.c store_plname_in_file': ported('js/save.js serializeGameState',
        'the snapshot holds every value the header encodes (plname, urole, urace, '
        + 'flags.female, u.ualign, wizard, discover); js/files.js plname_from_file() '
        + 'rebuilds the header from them'),
    'save.c free_dungeons': noEffect('memory'),
    'save.c freedynamicdata': noEffect('exit-time memory release'),

    // selvar.c
    'selvar.c selection_free': noEffect(MEMORY),
    'selvar.c selection_clone': ported('js/themerooms.js clone', SELECTION_CLASS),
    'selvar.c selection_getbounds': ported('js/themerooms.js bounds', SELECTION_CLASS),
    'selvar.c selection_recalc_bounds': ported('js/themerooms.js bounds', SELECTION_CLASS),
    'selvar.c selection_getpoint': ported('js/themerooms.js get', SELECTION_CLASS),
    'selvar.c selection_setpoint': ported('js/themerooms.js set', SELECTION_CLASS),
    'selvar.c selection_not': ported('js/themerooms.js negate', SELECTION_CLASS),
    'selvar.c selection_filter_percent': ported('js/themerooms.js percentage', SELECTION_CLASS),
    'selvar.c selection_filter_mapchar': ported('js/themerooms.js filter_mapchar', SELECTION_CLASS),
    'selvar.c selection_rndcoord': ported('js/themerooms.js rndcoord', SELECTION_CLASS),
    'selvar.c selection_do_grow': ported('js/themerooms.js grow', SELECTION_CLASS),
    'selvar.c selection_do_ellipse': unreachable('its only callers, l_selection_circle() and '
        + 'l_selection_ellipse(), are bindings no shipped program calls'),
    'selvar.c line_dist_coord': unreachable('its only caller, selection_do_gradient(), serves '
        + 'a binding no shipped program calls'),
    'selvar.c selection_do_gradient': unreachable('its only caller, l_selection_gradient(), '
        + 'is a binding no shipped program calls'),
    'selvar.c selection_do_line': ported('js/bigrm.js selection_line', SELECTION_CLASS),
    'selvar.c selection_is_irregular': ported('js/startup_a11y.js selectionDescription',
        'the travel-room size description'),
    'selvar.c selection_size_description': ported('js/startup_a11y.js selectionDescription',
        'the travel-room size description'),
    'selvar.c selection_from_mkroom': ported('js/themerooms.js selection_room', SELECTION_CLASS),
    'selvar.c selection_force_newsyms': ported('js/getpos.js getpos_sethilite',
        'inline in the getpos highlight'),

    // shknam.c
    'shknam.c free_eshk': unreachable('no caller in the compiled build'),

    // spell.c
    'spell.c book_disappears': ported('js/invent.js obfree'),
    'spell.c book_substitution': unreachable('no callers'),

    // stairs.c
    'stairs.c On_ladder': ported('js/dig.js adj_pit_checks'),
    'stairs.c On_stairs_up': ported('js/cmd.js domouseaction'),
    'stairs.c On_stairs_dn': ported('js/cmd.js domouseaction'),

    // strutil.c
    'strutil.c strbuf_init': noEffect(SAVEOPTIONS),
    'strutil.c strbuf_append': noEffect(SAVEOPTIONS),
    'strutil.c strbuf_reserve': noEffect(SAVEOPTIONS),
    'strutil.c strbuf_empty': noEffect(SAVEOPTIONS),
    'strutil.c strbuf_nl_to_crlf': unreachable(NO_CALLER),

    // symbols.c
    'symbols.c init_showsyms': ported('js/symbols.js init_symbols', SYMBOL_TABLES),
    'symbols.c init_ov_rogue_symbols': ported('js/symbols.js init_symbols', SYMBOL_TABLES),
    'symbols.c init_ov_primary_symbols': ported('js/symbols.js init_symbols', SYMBOL_TABLES),
    'symbols.c update_ov_primary_symset': ported('js/symbols.js applySymbolAssignments', SYMBOL_TABLES),
    'symbols.c update_ov_rogue_symset': ported('js/symbols.js applySymbolAssignments', SYMBOL_TABLES),
    'symbols.c symset_is_compatible': unreachable(NO_CALLER),
    'symbols.c proc_symset_line': ported('js/symbols.js readSymbolSetFile',
        'the symbol-set file read, from embedded data'),
    'symbols.c parse_sym_line': ported('js/symbols.js readSymbolSetFile',
        'the symbol-set file read, from embedded data'),
    'symbols.c load_symset': unreachable('its callers are initoptions_init()\'s TERM "AT" '
        + 'and "vt" arms (record-session.mjs sets TERM=xterm-256color), MSDOS, WIN32 and Mac '
        + 'arms, options.c:4193 under #ifndef ENHANCED_SYMBOLS (config.h:368 defines it), and '
        + 'unixmain.c\'s -DECgraphics and -IBMgraphics; ' + CMDLINE),
    'symbols.c free_symsets': noEffect(MEMORY),
    'symbols.c savedsym_free': noEffect(MEMORY),
    'symbols.c savedsym_find': noEffect(SAVEOPTIONS),
    'symbols.c savedsym_add': noEffect(SAVEOPTIONS),
    'symbols.c savedsym_strbuf': noEffect(SAVEOPTIONS),
    'symbols.c match_sym': ported('js/symbols.js applySymbolAssignments',
        'the symbol-name lookup'),

    // sys.c
    'sys.c sys_early_init': ported('js/jsmain.js set_playmode',
        'the sysopt defaults; js/jsmain.js RECORDER_SYSTEM_OPTIONS holds the values the '
        + 'recorder\'s sysconf then sets'),
    'sys.c sysopt_release': noEffect(MEMORY),
    'sys.c sysopt_seduce_set': noEffect('its compiled body only returns; the #if 0 arm '
        + '(sys.c:165-177) held the attack substitution that mhitu.c getmattk() now makes'),

    // teleport.c
    'teleport.c enexto_gpflags': ported('js/makemon_create.js m_initgrp'),

    // termcap.c
    'termcap.c term_shutdown': noEffect(ESCAPE),
    'termcap.c tty_number_pad': noEffect(ESCAPE),
    'termcap.c tty_decgraphics_termcap_fixup': noEffect(ESCAPE),
    'termcap.c term_start_screen': noEffect(ESCAPE),
    'termcap.c term_end_screen': ported('js/wintty.js tty_suspend_nhwindows',
        'its term_clear_screen() clears patch 006\'s shadow screen, which display.clearScreen() '
        + 'mirrors; VE and TE are escapes the buffer does not capture'),
    'termcap.c nocmov': ported('js/wintty.js tty_curs', CURSOR),
    'termcap.c cmov': ported('js/wintty.js tty_curs', CURSOR),
    'termcap.c xputc': noEffect('a putchar() for tputs() and the no-CE and no-CM fallbacks, '
        + 'which xterm-256color never takes; patch 006 records cells only through its '
        + 'nomux hooks'),
    'termcap.c xputs': noEffect(ESCAPE),
    'termcap.c term_clear_screen': ported('js/tty_menu.js erase_menu_or_text',
        'the full-screen erase'),
    'termcap.c home': ported('js/wintty.js tty_curs', CURSOR),
    'termcap.c standoutbeg': noEffect(ESCAPE),
    'termcap.c standoutend': noEffect(ESCAPE),
    'termcap.c backsp': noEffect('only xputs(BC); its callers adjust curx themselves '
        + '(topl.c:316-318)'),
    'termcap.c tty_nhbell': noEffect('writes a BEL byte, which changes no screen cell'),
    'termcap.c graph_on': ported('js/display.js glyphPresentation',
        'the DECgraphics flag carried on each symbol'),
    'termcap.c graph_off': ported('js/display.js glyphPresentation',
        'the DECgraphics flag carried on each symbol'),
    'termcap.c tty_delay_output': ported('js/hack.js nh_delay_output', 'the output delay'),
    'termcap.c cl_eos': ported('js/tty_menu.js displayTtyTextWindow',
        'the erase to the end of the screen'),
    'termcap.c init_hilite': ported('js/display.js glyphPresentation',
        'for TERM=xterm-256color it sets iflags.colorcount to 256 and every hilites[] entry, '
        + 'which the port assumes'),
    'termcap.c kill_hilite': noEffect(ESCAPE),
    'termcap.c s_atr2str': noEffect(ESCAPE),
    'termcap.c e_atr2str': noEffect(ESCAPE),
    'termcap.c term_attr_fixup': noEffect('rewrites HL_ULINE, HL_BLINK and HL_DIM only when '
        + 'us, mb or mh is missing; xterm-256color has all three, so it returns its argument'),
    'termcap.c term_start_attr': ported('js/display.js _recorderStatusAttribute', ATTRIBUTES),
    'termcap.c term_end_attr': ported('js/display.js _recorderStatusAttribute', ATTRIBUTES),
    'termcap.c term_start_raw_bold': noEffect(ESCAPE),
    'termcap.c term_end_raw_bold': noEffect(ESCAPE),
    'termcap.c term_end_color': ported('js/display.js glyphPresentation', ATTRIBUTES),
    'termcap.c term_start_color': ported('js/display.js glyphPresentation', ATTRIBUTES),
    'termcap.c term_start_bgcolor': noEffect(ESCAPE),
    'termcap.c term_curs_set': noEffect(ESCAPE),
    'termcap.c term_start_extracolor': noEffect(EXTRACOLOR),
    'termcap.c term_end_extracolor': noEffect(EXTRACOLOR),

    // timeout.c
    'timeout.c obj_move_timers': unreachable('no callers'),
    'timeout.c remove_timer': ported('js/timeout.js stop_timer'),
    'timeout.c write_timer': ported('js/bones.js serializeBonesLevel'),
    'timeout.c relink_timers': ported('js/bones.js getbones'),

    // topten.c
    'topten.c discardexcess': ported('js/topten.js readentry', 'record-line parsing'),
    'topten.c writexlentry': noEffect('writes xlogfile; never displayed'),
    'topten.c encodexlogflags': noEffect('xlogfile field'),
    'topten.c encodeconduct': noEffect('xlogfile field'),
    'topten.c encodeachieve': noEffect('xlogfile field'),
    'topten.c add_achieveX': noEffect('xlogfile field'),
    'topten.c encode_extended_achievements': noEffect('xlogfile field'),
    'topten.c encode_extended_conducts': noEffect('xlogfile field'),
    'topten.c free_ttlist': noEffect('memory'),
    'topten.c score_wanted': unreachable(CMDLINE),
    'topten.c prscore': unreachable(CMDLINE),

    // track.c
    'track.c save_track': ported('js/bones.js serializeBonesLevel'),
    'track.c rest_track': ported('js/bones.js restoreBonesLevel'),

    // trap.c
    'trap.c mkroll_launch': ported('js/trap.js makeRollingBoulderLaunch',
        'only caller is the rolling boulder'),

    // utf8map.c
    'utf8map.c set_map_u': ported('js/glyphs.js apply_customizations',
        'the UTF-8 glyph customisation'),
    'utf8map.c mixed_to_utf8': ported('js/hacklib.js encodeUtf8Text',
        'the UTF-8 text of an encoded glyph'),
    'utf8map.c add_custom_urep_entry': ported('js/glyphs.js glyphrep_to_custom_map_entries',
        'the UTF-8 glyph customisation'),

    // vault.c
    'vault.c free_egd': unreachable('no caller in the compiled build'),

    // version.c
    'version.c version_string': noEffect('its callers write the paniclog file '
        + '(files.c:2823), the crash-report URL (report.c:315) and DUMPLOG text (windows.c:1190); '
        + 'none reaches the screen'),
    'version.c early_version_info': unreachable(CMDLINE),
    'version.c check_version': noEffect(SAVE_COMPAT),
    'version.c dump_version_info': unreachable('only earlyarg.c:512 calls it, for '
        + '--version:dump; ' + CMDLINE),
    'version.c store_version': noEffect(SAVE_COMPAT),
    'version.c get_critical_size_count': unreachable('its one caller, files.c:2869 '
        + 'recover_savefile(), needs SELF_RECOVER, which include/unixconf.h:126 leaves '
        + 'undefined'),
    'version.c store_critical_bytes': noEffect(SAVE_COMPAT),
    'version.c uptodate': noEffect(SAVE_COMPAT),
    'version.c compare_critical_bytes': noEffect(SAVE_COMPAT),
    'version.c validate': noEffect(SAVE_COMPAT),

    // vision.c
    'vision.c vision_init': ported('js/vision.js init_vision_globals'),
    'vision.c get_unused_cs': ported('js/vision.js recalc_steps'),
    'vision.c view_init': noEffect('empty body'),

    // windows.c
    'windows.c genl_can_suspend_no': unreachable(GENL),
    'windows.c genl_can_suspend_yes': ported('js/cmd.js dosuspend_core',
        'tty\'s win_can_suspend answer'),
    'windows.c def_raw_print': unreachable(GENL),
    'windows.c def_wait_synch': unreachable(GENL),
    'windows.c check_tty_wincap': unreachable(NO_CALLER),
    'windows.c check_tty_wincap2': unreachable(NO_CALLER),
    'windows.c win_choices_find': unreachable('its only callers, check_tty_wincap() and '
        + 'check_tty_wincap2(), have no caller'),
    'windows.c genl_message_menu': unreachable(GENL),
    'windows.c genl_preference_update': noEffect('its body only returns; '
        + 'tty_preference_update() calls it last'),
    'windows.c genl_getmsghistory': unreachable(GENL),
    'windows.c genl_putmsghistory': unreachable(GENL),
    'windows.c nhwindows_hangup': unreachable(HANGUP),
    'windows.c hup_exit_nhwindows': unreachable(HANGUP),
    'windows.c hup_nhgetch': unreachable(HANGUP),
    'windows.c hup_yn_function': unreachable(HANGUP),
    'windows.c hup_nh_poskey': unreachable(HANGUP),
    'windows.c hup_getlin': unreachable(HANGUP),
    'windows.c hup_init_nhwindows': unreachable(HANGUP),
    'windows.c hup_create_nhwindow': unreachable(HANGUP),
    'windows.c hup_select_menu': unreachable(HANGUP),
    'windows.c hup_add_menu': unreachable(HANGUP),
    'windows.c hup_end_menu': unreachable(HANGUP),
    'windows.c hup_putstr': unreachable(HANGUP),
    'windows.c hup_print_glyph': unreachable(HANGUP),
    'windows.c hup_outrip': unreachable(HANGUP),
    'windows.c hup_curs': unreachable(HANGUP),
    'windows.c hup_display_nhwindow': unreachable(HANGUP),
    'windows.c hup_display_file': unreachable(HANGUP),
    'windows.c hup_cliparound': unreachable(HANGUP),
    'windows.c hup_status_update': unreachable(HANGUP),
    'windows.c hup_int_ndecl': unreachable(HANGUP),
    'windows.c hup_void_ndecl': unreachable(HANGUP),
    'windows.c hup_void_fdecl_int': unreachable(HANGUP),
    'windows.c hup_void_fdecl_winid': unreachable(HANGUP),
    'windows.c hup_void_fdecl_winid_ulong': unreachable(HANGUP),
    'windows.c hup_void_fdecl_constchar_p': unreachable(HANGUP),
    'windows.c hup_ctrl_nhwindow': unreachable(HANGUP),
    'windows.c genl_status_init': ported('js/wintty.js new_status_window',
        'the status window\'s set-up'),
    'windows.c genl_status_finish': noEffect('only frees the status_vals[] strings; '
        + 'genl_status_init() then allocates them blank (windows.c:893-920)'),
    'windows.c genl_status_enablefield': ported('js/display.js _statusFieldEnabled',
        'the status field table'),
    'windows.c genl_status_update': unreachable(GENL),
    'windows.c dump_open_log': noEffect(DUMPLOG),
    'windows.c dump_close_log': noEffect(DUMPLOG),
    'windows.c dump_forward_putstr': ported('js/end.js really_done',
        'really_done() calls it outside DUMPLOG for each farewell line; with no dumplog file it '
        + 'is putstr() unless done_stopprint, and really_done() pushes the same lines'),
    'windows.c dump_putstr': unreachable(DUMP_INSTALLED),
    'windows.c dump_create_nhwindow': unreachable(DUMP_INSTALLED),
    'windows.c dump_clear_nhwindow': unreachable(DUMP_INSTALLED),
    'windows.c dump_display_nhwindow': unreachable(DUMP_INSTALLED),
    'windows.c dump_destroy_nhwindow': unreachable(DUMP_INSTALLED),
    'windows.c dump_start_menu': unreachable(DUMP_INSTALLED),
    'windows.c dump_add_menu': unreachable(DUMP_INSTALLED),
    'windows.c dump_end_menu': unreachable(DUMP_INSTALLED),
    'windows.c dump_select_menu': unreachable(DUMP_INSTALLED),
    'windows.c dump_redirect': unreachable('every call (end.c:549, 611, 1402, 1405, 1484, 1487) '
        + 'is inside #ifdef DUMPLOG, which include/config.h:669 leaves undefined'),
    'windows.c has_color': ported('js/display.js glyphPresentation',
        'the colour test of the glyph map'),
    'windows.c glyph2ttychar': unreachable(NO_CALLER),
    'windows.c glyph2symidx': unreachable(NO_CALLER),
    'windows.c genl_putmixed': unreachable(GENL),
    'windows.c genl_display_file': unreachable(CMDLINE),
    'windows.c mixed_to_glyphinfo': unreachable(NO_CALLER),
    'windows.c add_menu_str': ported('js/insight.js enlght_out', MENU_TEXT),

    // wintty.c
    'wintty.c winch_handler': unreachable('a SIGWINCH handler; the recorder\'s terminal size '
        + 'never changes'),
    'wintty.c resize_tty': unreachable('reached only from winch_handler(), or from '
        + 'tty_nhgetch() after a SIGWINCH; the recorder\'s terminal size never changes'),
    'wintty.c tty_get_nh_event': noEffect('its body is empty in the tty build'),
    'wintty.c tty_resume_nhwindows': visible('unixunix.c child(1) calls it after mail.c '
        + 'readmail() runs the mail reader, which reading a spe 0 scroll of mail reaches in '
        + 'debug mode; it restores the terminal and calls docrt(), a full redraw that the '
        + 'port lacks with readmail(); the shell escape and suspend that also reach it are '
        + 'refused without sysconf SHELLERS'),
    'wintty.c free_window_info': noEffect(MEMORY),
    'wintty.c toggle_menu_curr': ported('js/tty_menu.js setItems', TTY_MENU),
    'wintty.c set_item_state': ported('js/tty_menu.js selectionMarker', TTY_MENU),
    'wintty.c toggle_menu_attr': ported('js/tty_menu.js selectionMarker', TTY_MENU),
    'wintty.c tty_dismiss_nhwindow': ported('js/tty_menu.js erase_menu_or_text', TTY_MENU),
    'wintty.c tty_destroy_nhwindow': ported('js/tty_menu.js erase_menu_or_text', TTY_MENU),
    'wintty.c erase_tty_screen': ported('js/wintty.js tty_clear_map_window',
        'the full-screen erase'),
    'wintty.c tty_display_file': ported('js/pager.js display_file', 'the text file display'),
    'wintty.c tty_start_menu': ported('js/tty_menu.js selectTtyMenu',
        'without TTY_PERM_INVENT it only empties the menu with tty_clear_nhwindow(); the port '
        + 'builds every menu from a new item list'),
    'wintty.c reverse': ported('js/tty_menu.js assignMenuAccelerators', TTY_MENU),
    'wintty.c tty_select_menu': ported('js/tty_menu.js visiblePickOneChoice', TTY_MENU),
    'wintty.c tty_ctrl_nhwindow': ported('js/tty_menu.js menuTitleStyle',
        'without TTY_PERM_INVENT only its set_menu_promptstyle arm acts, storing '
        + 'menu_headings for end_menu() prompts; menuTitleStyle() reads the same option, which '
        + 'every change relays (allmain.c:728, options.c:5790, 9003-9004)'),
    'wintty.c tty_mark_synch': noEffect('an fflush() of the output, which changes no screen '
        + 'cell'),
    'wintty.c end_glyphout': ported('js/display.js glyphPresentation',
        'it turns off the DECgraphics flag and colour after a glyph; the port carries both on '
        + 'each cell, so text written later is never DEC or coloured'),
    'wintty.c g_putch': ported('js/display.js glyphPresentation',
        'the symbol byte written to the shadow buffer'),
    'wintty.c g_pututf8': ported('js/display.js glyphPresentation',
        'the UTF-8 customisation written to the shadow buffer'),
    'wintty.c tty_nh_poskey': ported('js/input.js nhgetch', 'the key read'),
    'wintty.c win_tty_init': noEffect('its body is empty on Unix'),
    'wintty.c tty_status_init': ported('js/wintty.js new_status_window',
        'the status window\'s set-up'),
    'wintty.c tty_status_enablefield': ported('js/display.js _statusFieldEnabled',
        'the status field table'),
    'wintty.c make_things_fit': ported('js/display.js _statusLine2Configuration', TTY_STATUS),
    'wintty.c tty_putstatusfield': ported('js/display.js _statusPlayerName', TTY_STATUS),
    'wintty.c shrink_enc': ported('js/display.js _statusLine2Configuration', TTY_STATUS),
    'wintty.c shrink_dlvl': ported('js/display.js _statusLevelDescription', TTY_STATUS),
    'wintty.c check_windowdata': noEffect('writes to the paniclog file when the status window '
        + 'is missing, and on its first call clears the status rows, which are still blank '
        + 'before the first status line is drawn; the botlx it sets matches the port\'s full '
        + 'first status draw'),

    // worm.c
    'worm.c worm_cross': ported('js/monmove.js wormCross', 'used by mfndpos and test_move'),

    // worn.c
    'worn.c allunworn': noEffect('clears worn bits on objects being freed at save'),
    'worn.c wornmask_to_armcat': unreachable('no callers'),

    // zap.c
    'zap.c wish_history_flush': noEffect('DEBUG-only, exit-time memory'),
});

// Verdicts that replace the otherName rule for entries whose `C ref:` comment
// the map accepts although the function it names is not ported there: the
// comment cites one guard or one call. Each needs a reason, like a verdict.
// scripts/c-function-map.test.mjs fails when an entry here no longer matches
// the rule, so a comment that is removed or reworded takes its override with
// it.
export const C_FUNCTION_RULE_OVERRIDES = Object.freeze({
    // js/display.js:5577 cites the function for its hit-point guard only.
    'botl.c do_statusline2': unreachable('bot() calls it only for a window port without '
        + 'WC2_HILITE_STATUS or WC2_FLUSH_STATUS (botl.c:261-268), and tty has both under '
        + 'STATUS_HILITES; the end.c:586 call is inside #ifdef DUMPLOG'),
});
