// options.js — Parse the startup subset of .nethackrc options.
// C refs: cfgfiles.c config parsing; options.c parseoptions(), handlers, and
// nmcpy(); hacklib.c mungspaces(); bones.c sanitize_name(); role.c str2*().

import {
    ALIGN_BOTTOM,
    ALIGN_LEFT,
    ALIGN_RIGHT,
    ALIGN_TOP,
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_FORCE,
    AUTOUNLOCK_KICK,
    AUTOUNLOCK_UNTRAP,
    CLR_MAX,
    DISCLOSE_PROMPT_DEFAULT_NO,
    DISCLOSE_PROMPT_DEFAULT_YES,
    DISCLOSE_PROMPT_DEFAULT_SPECIAL,
    DISCLOSE_SPECIAL_WITHOUT_PROMPT,
    DISCLOSE_NO_WITHOUT_PROMPT,
    DISCLOSE_YES_WITHOUT_PROMPT,
    EXT_ENCUMBER,
    GFILTER_AREA,
    GFILTER_NONE,
    GFILTER_VIEW,
    GPCOORDS_COMPASS,
    GPCOORDS_COMFULL,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    GPCOORDS_SCREEN,
    HL_BLINK,
    HL_BOLD,
    HL_DIM,
    HL_INVERSE,
    HL_ITALIC,
    HL_NONE,
    HL_ULINE,
    HL_UNDEF,
    HVY_ENCUMBER,
    Is_rogue_level,
    LARGEST_INT,
    MENU_COMBINATION,
    MENU_FULL,
    MENU_PARTIAL,
    MENU_TRADITIONAL,
    MAP_MODE_ASCII4x6,
    MAP_MODE_ASCII6x8,
    MAP_MODE_ASCII8x8,
    MAP_MODE_ASCII16x8,
    MAP_MODE_ASCII7x12,
    MAP_MODE_ASCII8x12,
    MAP_MODE_ASCII16x12,
    MAP_MODE_ASCII12x16,
    MAP_MODE_ASCII10x18,
    MAP_MODE_ASCII_FIT_TO_SCREEN,
    MAP_MODE_TILES,
    MAP_MODE_TILES_FIT_TO_SCREEN,
    MOD_ENCUMBER,
    MSGTYP_NOREP,
    MSGTYP_NORMAL,
    MSGTYP_NOSHOW,
    MSGTYP_STOP,
    NUM_DISCLOSURE_OPTIONS,
    OVERLOADED,
    PARANOID_AUTOALL,
    PARANOID_BONES,
    PARANOID_BREAKWAND,
    PARANOID_CONFIRM,
    PARANOID_DIE,
    PARANOID_EATING,
    PARANOID_HIT,
    PARANOID_PRAY,
    PARANOID_QUIT,
    PARANOID_REMOVE,
    PARANOID_SWIM,
    PARANOID_TRAP,
    PARANOID_WERECHANGE,
    PICK_ANY,
    PICK_ONE,
    ECMD_OK,
    PRIMARYSET,
    QBUFSZ,
    ROGUESET,
    RUN_CRAWL,
    RUN_LEAP,
    RUN_STEP,
    RUN_TPORT,
    SLT_ENCUMBER,
    STONE,
    SYM_BOULDER,
    UNENCUMBERED,
    VIA_DIALOG,
    VIA_PROMPTS,
    WARNCOUNT,
    def_warnsyms,
} from './const.js';
import {
    ROLE_ALIGNMASK,
    ROLE_GENDMASK,
    ROLE_NONE,
    ROLE_RACEMASK,
    ROLE_RANDOM,
    aligns,
    genders,
    races,
    roles,
    str2align,
    str2gend,
    str2race,
    str2role,
} from './roles.js';
import {
    ATR_BOLD,
    ATR_INVERSE,
    ATR_NONE,
    ATR_UNDERLINE,
    CLR_BLACK,
    CLR_BLUE,
    CLR_BRIGHT_BLUE,
    CLR_BRIGHT_CYAN,
    CLR_BRIGHT_GREEN,
    CLR_BRIGHT_MAGENTA,
    CLR_BROWN,
    CLR_CYAN,
    CLR_GRAY,
    CLR_GREEN,
    CLR_MAGENTA,
    CLR_ORANGE,
    CLR_RED,
    CLR_WHITE,
    CLR_YELLOW,
    NO_COLOR,
} from './terminal.js';
import {
    cnf_line_BOULDER,
    cnf_line_WARNINGS,
    config_error_add,
    config_error_init,
    config_error_nextline,
} from './cfgfiles.js';
import {
    DEFAULT_FRUIT,
    finish_fruit_option,
    normalize_initial_fruit,
} from './fruit.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
    encodeUtf8Text,
    fuzzymatch,
    letter,
    lowc,
    str_start_is,
    truncateByteString,
    visctrl,
} from './hacklib.js';
import { read_sym_file } from './files.js';
import {
    assign_soundlib,
    get_soundlib_name,
    soundlib_id_from_opt,
    soundlib_nosound,
} from './sounds.js';
// js/display.js, js/invent.js and js/vision.js do not import this file, so
// these three are plain one-way dependencies; js/tty_message.js reaches
// js/display.js from the other side, and both use the other's exports only
// inside function bodies.
import {
    bot,
    classify_terrain,
    docrt,
    flush_screen,
    reglyph_darkroom,
} from './display.js';
import { reassign, update_inventory } from './invent.js';
import { ttyPline } from './tty_message.js';
import { vision_recalc } from './vision.js';
import { sourceGlyphName } from './glyph_ids.js';
import { allopt, optionParserMetadata } from './optlist_data.js';
import { configLineStatements } from './config_statement_data.js';
import {
    CMD_PARAM,
    INTERNALCMD,
    MOUSECMD,
    extcmdlist,
} from './extcmdlist_data.js';
import {
    count_autocompletions,
    initialExtcmdFlags,
    parseautocomplete,
} from './cmd_autocomplete.js';
import {
    DEFAULT_PRIMARY_SYMBOLS,
    SYM_OFF_O,
    SYM_OFF_X,
} from './symbol_data.js';
import {
    regex_compile,
    regex_error_desc,
    regex_init,
    regex_match,
} from './posixregex.js';
import {
    get_current_feature_ver,
    get_feature_notice_ver,
    status_version,
    VI_BRANCH,
    VI_NAME,
    VI_NUMBER,
} from './version.js';
import {
    AMULET_CLASS,
    ARMOR_CLASS,
    BALL_CLASS,
    CHAIN_CLASS,
    COIN_CLASS,
    FOOD_CLASS,
    GEM_CLASS,
    MAXOCLASSES,
    POTION_CLASS,
    RING_CLASS,
    ROCK_CLASS,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    TOOL_CLASS,
    VENOM_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { rn2 } from './rng.js';
import {
    def_char_to_monclass,
    def_char_to_objclass,
} from './drawing.js';
import { escapes } from './options_escapes.js';
import { finish_boulder_symbol, MAXMCLASSES } from './symbols.js';
import { choose_classes_menu } from './windows.js';

const PET_NAME_BYTE_LIMIT = 62; // PL_PSIZ - 1
const PLAYER_NAME_BYTE_LIMIT = 31; // PL_NSIZ - 1
const CONFIG_BUFFER_BYTE_CAPACITY = 4 * 256; // cfgfiles.c: 4 * BUFSZ
const OPTION_ELEMENT_BYTE_LIMIT = 256 / 2; // options.c: BUFSZ / 2

// C ref: options.c:allopt[] and determine_ambiguities().  Matching is
// case-insensitive, so the generated catalog is folded once here.  The full
// catalog matters because unported options still determine whether a prefix
// is unique (and are preserved under their canonical key).
const SOURCE_OPTION_NAMES = Object.freeze(
    allopt.map((option) => option.name.toLowerCase()),
);

function sourceOptionMinLength(name) {
    let needed = 0;
    for (const other of SOURCE_OPTION_NAMES) {
        if (other === name) continue;
        let shared = 0;
        while (shared < name.length && shared < other.length
               && name[shared] === other[shared]) ++shared;
        needed = Math.max(needed, shared + 1);
    }
    return Math.max(3, Math.min(needed, name.length));
}

const SOURCE_OPTION_MATCHES = Object.freeze(SOURCE_OPTION_NAMES.map((name) => (
    [name, sourceOptionMinLength(name)]
)));
// optlist.h's pfx entries participate in name matching, but their handlers
// validate suffixes before accepting them.  font's valid forms already have
// ordinary catalog entries; cond_ uses botl.c:condtests[].
const SOURCE_PREFIX_OPTION_NAMES = Object.freeze(['cond_', 'font']);
const SOURCE_CONDITION_NAMES = Object.freeze((
    'barehanded|blind|busy|conf|deaf|iron|fly|foodpois|glowhands|grab'
    + '|hallucinat|held|ice|lava|levitate|paralyzed|ride|sleep|slime|slip'
    + '|stone|strngl|stun|submerged|termill|tethered|trap|unconscious'
    + '|woundedlegs|holding'
).split('|'));
// C ref: botl.c:condtests[]. opt_out entries begin enabled; opt_in entries
// begin disabled until an explicit cond_* option enables them.
const DEFAULT_STATUS_CONDITIONS = Object.freeze({
    barehanded: false,
    blind: true,
    busy: false,
    conf: true,
    deaf: true,
    iron: true,
    fly: true,
    foodpois: true,
    glowhands: false,
    grab: true,
    hallucinat: true,
    held: false,
    ice: false,
    lava: true,
    levitate: true,
    paralyzed: false,
    ride: true,
    sleep: false,
    slime: true,
    slip: false,
    stone: true,
    strngl: true,
    stun: true,
    submerged: false,
    termill: true,
    tethered: false,
    trap: false,
    unconscious: false,
    woundedlegs: false,
    holding: false,
});
// C refs: defsym.h's three *_PARSE expansions and symbols.c:loadsyms[] and
// match_sym(). Names after the case-sensitive S_ prefix are case-insensitive.
const SOURCE_SYMBOL_NAMES = new Set((
    's_air|s_altar|s_amulet|s_angel|s_ant|s_anti_magic_trap|s_armor'
    + '|s_armour|s_arrow_trap|s_ball|s_bars|s_bat|s_bear_trap|s_blcorn'
    + '|s_blob|s_book|s_boomleft|s_boomright|s_boulder|s_brcorn'
    + '|s_brdnladder|s_brdnstair|s_brupladder|s_brupstair|s_centaur'
    + '|s_chain|s_cloud|s_cockatrice|s_coin|s_corr|s_crwall|s_darkroom'
    + '|s_dart_trap|s_demon|s_digbeam|s_dnladder|s_dnstair|s_dog'
    + '|s_dragon|s_eel|s_elemental|s_engrcorr|s_engroom|s_expl_bc'
    + '|s_expl_bl|s_expl_br|s_expl_mc|s_expl_ml|s_expl_mr|s_expl_tc'
    + '|s_expl_tl|s_expl_tr|s_explode1|s_explode2|s_explode3|s_explode4'
    + '|s_explode5|s_explode6|s_explode7|s_explode8|s_explode9|s_eye'
    + '|s_falling_rock_trap|s_feline|s_fire_trap|s_flashbeam|s_food'
    + '|s_fountain|s_fungus|s_gem|s_ghost|s_giant|s_gnome|s_golem'
    + '|s_goodpos|s_grave|s_gremlin|s_hbeam|s_hcdbridge|s_hcdoor'
    + '|s_hero_override|s_hodbridge|s_hodoor|s_hole|s_human|s_humanoid'
    + '|s_hwall|s_ice|s_imp|s_invisible|s_jabberwock|s_jelly|s_kobold'
    + '|s_kop|s_land_mine|s_lava|s_lavawall|s_leprechaun'
    + '|s_level_teleporter|s_lich|s_light|s_litcorr|s_lizard|s_lslant'
    + '|s_magic_portal|s_magic_trap|s_mimic|s_mimic_def|s_mummy|s_naga'
    + '|s_ndoor|s_nothing|s_nymph|s_ogre|s_orc|s_pet_override|s_piercer'
    + '|s_pit|s_poisoncloud|s_polymorph_trap|s_pool|s_potion|s_pudding'
    + '|s_quadruped|s_quantmech|s_ring|s_rock|s_rodent'
    + '|s_rolling_boulder_trap|s_room|s_rslant|s_rust_trap|s_rustmonst'
    + '|s_scroll|s_sink|s_sleeping_gas_trap|s_snake|s_spider'
    + '|s_spiked_pit|s_squeaky_board|s_ss1|s_ss2|s_ss3|s_ss4'
    + '|s_statue_trap|s_stone|s_strange_obj|s_sw_bc|s_sw_bl|s_sw_br'
    + '|s_sw_ml|s_sw_mr|s_sw_tc|s_sw_tl|s_sw_tr|s_tdwall'
    + '|s_teleportation_trap|s_throne|s_tlcorn|s_tlwall|s_tool'
    + '|s_trap_door|s_trapped_chest|s_trapped_door|s_trapper|s_trcorn'
    + '|s_tree|s_troll|s_trwall|s_tuwall|s_umber|s_unexplored|s_unicorn'
    + '|s_upladder|s_upstair|s_vampire|s_vbeam|s_vcdbridge|s_vcdoor'
    + '|s_venom|s_vibrating_square|s_vodbridge|s_vodoor|s_vortex'
    + '|s_vwall|s_wand|s_water|s_weapon|s_web|s_worm|s_worm_tail'
    + '|s_wraith|s_xan|s_xorn|s_yeti|s_zombie|s_zruty'
).split('|'));
// C ref: options.c parseoptions()'s alias loop over allopt[].alias.  The
// generated metadata is the sole owner of ordinary aliases; a self-alias can
// never reach C's alias loop because the canonical-name loop matched first.
// "male" stays distinct from its female row so applyBooleanOption() can invert
// it using the original spelling, as options.c's opt_female arm does.
const OPTION_ALIASES = Object.freeze(Object.fromEntries(
    Object.entries(optionParserMetadata).flatMap(([canonical, { alias }]) => (
        !alias || alias === canonical
            ? [] : [[alias, alias === 'male' ? 'male' : canonical]]
    )),
));

export function optionAliasTarget(alias) {
    return Object.hasOwn(OPTION_ALIASES, alias)
        ? OPTION_ALIASES[alias] : null;
}

const ROLEPLAY_FIELDS = Object.freeze([
    'blind',
    'nudist',
    'deaf',
    'pauper',
    'reroll',
    'reserved1',
    'reserved2',
    'reserved3',
]);

function defaultRoleplay() {
    const roleplay = Object.fromEntries(
        ROLEPLAY_FIELDS.map((field) => [field, false]),
    );
    roleplay.numbones = 0;
    roleplay.numrerolls = 0;
    return roleplay;
}

function defaultRoleFilter() {
    return {
        roles: Array(roles.length).fill(false),
        mask: 0,
    };
}

// allopt[].addr names the C lvalue a boolean option writes.  Its four roots
// are the live option structures; parseNethackrc()'s result carries three of
// them under their own names and u.uroleplay under `uroleplay`, which
// jsmain.js installs as state.u.uroleplay.
function booleanOptionStorage(addr) {
    const split = addr.lastIndexOf('.');
    const owner = addr.slice(0, split);
    return {
        resultKey: owner === 'u.uroleplay' ? 'uroleplay' : owner,
        field: addr.slice(split + 1),
    };
}

// C ref: options.c initoptions_init() (7165-7168).  Every boolean option that
// has storage starts at the compiled-in value optlist.h gives it, before any
// configuration file is read.  Options with no storage are the ones whose
// #ifdef arm compiled to a null pointer; C leaves them nowhere to write.
function applyBooleanOptionDefaults(result) {
    for (const option of allopt) {
        if (option.opttyp !== 'BoolOpt' || !option.addr) continue;
        const { resultKey, field } = booleanOptionStorage(option.addr);
        result[resultKey][field] = option.initval;
    }
}

function defaultResult() {
    const startupEvents = [];
    const result = {
        name: '',
        role: ROLE_NONE,
        race: ROLE_NONE,
        gender: ROLE_NONE,
        align: ROLE_NONE,
        // Every boolean option's startup value comes from allopt[].initval
        // through applyBooleanOptionDefaults() below, so only the fields
        // initoptions_init() sets separately appear here.
        flags: {
            initrole: ROLE_NONE,
            initrace: ROLE_NONE,
            initgend: ROLE_NONE,
            initalign: ROLE_NONE,
            debug: false,
            explore: false,
            // options.c initoptions_init(): PILE_LIMIT_DFLT.
            pile_limit: 5,
            // options.c initoptions_init() sets sortloot to 'l', which sorts
            // loot but not inventory; display_pickinv() compares against 'f'.
            sortloot: 'l',
            // options.c def_inv_order[], the class order the inventory menu
            // walks. The trailing 0 terminates the list in C, so the array
            // holds only its class bytes. change_inv_order() below is the one
            // startup path that rewrites it.
            inv_order: [
                COIN_CLASS, AMULET_CLASS, WEAPON_CLASS, ARMOR_CLASS,
                FOOD_CLASS, SCROLL_CLASS, SPBOOK_CLASS, POTION_CLASS,
                RING_CLASS, WAND_CLASS, TOOL_CLASS, GEM_CLASS, ROCK_CLASS,
                BALL_CLASS, CHAIN_CLASS,
            ],
            // options.c initoptions_init() sets flags.runmode = RUN_LEAP.
            runmode: RUN_LEAP,
            // Recorder release builds have no git-branch metadata, so
            // options.c defaults versinfo to VI_NUMBER.
            versinfo: 1,
            // The remaining initoptions_init() assignments, in source order.
            end_own: false,
            end_top: 3,
            end_around: 2,
            paranoia_bits: PARANOID_PRAY | PARANOID_SWIM | PARANOID_TRAP,
            // C's char array of object-class indices, empty for "all". Its
            // bytes are class numbers rather than class symbols, which is why
            // oc_to_str() maps them through def_oc_syms[]. Spelled as an
            // array of those numbers, the way flags.inv_order above is.
            // optfn_pickup_types()'s do_set arm is what rewrites it.
            pickup_types: [],
            pickup_burden: MOD_ENCUMBER,
            end_disclose: Array(NUM_DISCLOSURE_OPTIONS).fill(
                DISCLOSE_PROMPT_DEFAULT_NO,
            ),
            menu_style: MENU_FULL,
            // optfn_autounlock()'s do_init arm, which allopt_array_init()
            // runs for every option before the configuration file is read.
            autounlock: AUTOUNLOCK_APPLY_KEY,
            // o_init.c get_sortdisco() rewrites any unrecognized value to 'o',
            // which is also what a zeroed flags struct resolves to.
            discosort: 'o',
            // insight.c vanqorders[] index 0, "traditional".
            vanq_sortmode: 0,
            // A version number packed by feature_alert_opts(); zero means no
            // alert is suppressed.
            suppress_alert: 0,
        },
        iflags: {
            // options.c initializes instance_flags to zero, which is STONE.
            // Its boolean handler restores this value on every toggle.
            prev_decor: STONE,
            // options.c initoptions_init() sets these after zeroing iflags.
            wc_align_message: ALIGN_TOP,
            wc_align_status: ALIGN_BOTTOM,
            wc2_statuslines: 2,
            wc2_petattr: ATR_INVERSE,
            // options.c initoptions_init() sets the curses-only window-border
            // mode after the instance-flags struct starts zeroed.
            wc2_windowborders: 2,
            hilite_delta: 0,
            status_hilites: [],
            status_conditions: { ...DEFAULT_STATUS_CONDITIONS },
            num_pad: false,
            num_pad_mode: 0,
            getpos_coords: GPCOORDS_NONE,
            // options.c keeps these as parallel, insertion-ordered strings.
            // The first alias for an incoming key wins in map_menu_cmd().
            mapped_menu_cmds: '',
            mapped_menu_op: '',
            menu_headings: {
                attr: ATR_INVERSE,
                color: NO_COLOR,
            },
            msg_history: 20,
            // options.c optfn_scroll_amount() and optfn_scroll_margin()
            // leave the zeroed instance-flags fields alone during do_init.
            wc_scroll_amount: 0,
            wc_scroll_margin: 0,
            // options.c optfn_tile_height() and optfn_tile_width() likewise
            // leave their zeroed instance-flags fields alone during do_init.
            wc_tile_height: 0,
            wc_tile_width: 0,
            // options.c optfn_vary_msgcount() also leaves its zeroed
            // instance-flags field alone during do_init.
            wc_vary_msgcount: 0,
            // options.c optfn_mouse_support() leaves this zeroed
            // instance-flags field alone during do_init.
            wc_mouse_support: 0,
            // options.c optfn_map_mode() also leaves this zeroed field alone;
            // zero is MAP_MODE_TILES.
            wc_map_mode: MAP_MODE_TILES,
            // options.c optfn_player_selection() leaves this zeroed field
            // alone during do_init; zero is VIA_DIALOG.
            wc_player_selection: VIA_DIALOG,
            // options.c optfn_term_cols() and optfn_term_rows() leave these
            // zeroed instance-flags fields alone during do_init.
            wc2_term_cols: 0,
            wc2_term_rows: 0,
            // initoptions_init()'s TTY_GRAPHICS arm; this build is tty.
            prevmsg_window: 's',
            menuinvertmode: 1,
            getloc_filter: GFILTER_NONE,
        },
        a11y: {
            mon_notices_blocked: 0,
        },
        // decl.c instance_globals_c initializes the two report identities to
        // NULL and the URL limit to -1.  The three CRASHREPORT handlers below
        // are their configuration-time writers, and #optionsfull reads the
        // same fields through OPTION_VALUE_HANDLERS.
        gc: {
            crash_email: null,
            crash_name: null,
            crash_urlmax: -1,
            // sounds.c assign_soundlib() writes the requested interface here;
            // allmain.c activates it after configuration and name parsing.
            chosen_soundlib: soundlib_nosound,
        },
        ga: {
            // decl.c instance_globals_a starts on the built-in interface.
            active_soundlib: soundlib_nosound,
        },
        gp: {
            // decl.c instance_globals_p starts this list at NULL. Each valid
            // direct MSGTYPE row prepends one compiled rule; jsmain.js moves
            // the resulting per-parse list into the new game's gp owner.
            plinemsg_types: null,
        },
        // options.c initoptions_init() initializes the sole symbols.c-owned
        // warning array before reading either OPTIONS=warnings or the legacy
        // direct WARNINGS statement. jsmain.js installs this object at gw.
        gw: {
            warnsyms: def_warnsyms.map(({ ch }) => ch.charCodeAt(0)),
        },
        roleFilter: defaultRoleFilter(),
        uroleplay: defaultRoleplay(),
        playmode: 'normal',
        preferred_pet: '',
        catname: '',
        dogname: '',
        horsename: '',
        pl_fruit: DEFAULT_FRUIT,
        gameplayBindings: [],
        commandOperations: [],
        // cmd.c extcmdlist[] is mutable in C. Keep its flags per game so one
        // runSegment() cannot carry configuration into the next one.
        extcmdFlags: initialExtcmdFlags(),
        // Raw output produced while the rc file is being parsed, in source
        // order. optfn_boolean() and config_error_add() emit print-only
        // events. A wait marks cfgfiles.c get_uchars()'s immediate
        // wait_synch(); config_error_done() supplies the final wait separately.
        startupEvents,
        // options.c's file static starts true; unsupported idlecheckpoint is
        // its only configuration-time writer.
        give_opt_msg: true,
        symbolOperations: [],
        rogueSymbols: {},
        // The configuration statements this parser recognizes but does not
        // interpret, in the order the file spelled them. A consumer that would
        // read state owned by one of their cnf_line_<NAME>() handlers checks
        // this list and refuses instead of using an invented default.
        unportedConfigStatements: [],
        // C ref: cfgfiles.c config_error_data, the frame rcfile() (1943) opens
        // around the configuration read.  parseNethackrc() feeds it one line
        // at a time; js/jsmain.js closes it with config_error_done() and
        // prints what it holds.
        configErrorFrame: config_error_init(startupEvents),
    };
    applyBooleanOptionDefaults(result);
    // allopt_array_init() invokes this compound handler's do_init arm after
    // the instance-flags struct has been zeroed.
    set_menuobjsyms_flags(result, 4);
    return result;
}

// The port's fail-closed stop for a configuration path it has not ported.
// C has no such thing: every error the rc read produces is a config error that
// leaves the game running, so a call here says the port cannot follow C rather
// than that C refused the statement.  configErrorAdd() below is the ported
// answer, and each site that moves from one to the other has had its C branch
// read.
function optionError(lineNumber, message) {
    throw new Error(`nethackrc line ${lineNumber}: ${message}`);
}

// C ref: pline.c config_error_add(), reached from an option handler.
// parseoptions() carries on with the rest of the statement and the rest of the
// file afterwards, and js/jsmain.js prints what accumulated.
function configErrorAdd(result, message) {
    config_error_add(result.configErrorFrame, message);
}

// The recorder's C locale treats only the six ASCII bytes below as
// whitespace. ECMAScript trim() also removes Unicode spaces whose UTF-8 bytes
// NetHack preserves until option-specific sanitization.
function trimCWhitespace(value) {
    return String(value).replace(
        /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/gu,
        '',
    );
}

// C ref: hacklib.c trimspaces() (163-176).  Its two halves reach a caller
// differently: leading blanks are only skipped, by advancing a pointer the
// caller need not keep, while the trailing run is overwritten with NUL inside
// the caller's own buffer.  A caller that keeps its own pointer therefore sees
// the second half alone, which is what trimspacesTrailing() is.  C counts ' '
// and '\t' and nothing else, unlike trimCWhitespace() above.
function trimspacesTrailing(value) {
    return String(value).replace(/[ \t]+$/u, '');
}

// botl.c parse_status_hl2() ignores trimspaces()'s returned pointer after
// copying a title threshold.  When that buffer is all blanks, trimspaces()
// advances its local pointer to NUL and its trailing loop changes nothing.
function trimspacesIgnoredReturn(value) {
    const text = String(value);
    return /^[ \t]*$/u.test(text) ? text : trimspacesTrailing(text);
}

function trimspaces(value) {
    return trimspacesTrailing(value).replace(/^[ \t]+/u, '');
}

// C ref: hacklib.c:mungspaces().  Configuration statements other than
// OPTIONS are dispatched from a copy normalized this way.
function mungspaces(value) {
    let normalized = '';
    let wasSpace = true;
    for (const original of String(value)) {
        if (original === '\n') break;
        const character = original === '\t' ? ' ' : original;
        if (character !== ' ' || !wasSpace) normalized += character;
        wasSpace = character === ' ';
    }
    if (wasSpace && normalized) normalized = normalized.slice(0, -1);
    return normalized;
}

// C ref: cfgfiles.c:parse_conf_buf().  A physical line ending in a literal
// backslash continues onto the next non-comment text with one separating
// space.  Ignored lines without their own continuation terminate a pending
// logical line, matching the parser's p->buf lifetime.
//
// This yields rather than returns a list, because parse_conf_file() alternates
// between reading a line and handing a completed statement to its proc.  An
// error the proc reports is stamped with the line and text the frame is
// holding at that moment, and both move on the next physical line.
function* logicalConfigLines(rc, frame) {
    const input = encodeUtf8Text(rc);
    let buffered = null;
    let cursor = 0;
    let skip = false;

    while (cursor < input.length) {
        const chunk = [];
        while (cursor < input.length
               && chunk.length < CONFIG_BUFFER_BYTE_CAPACITY - 1) {
            const byte = input[cursor++];
            chunk.push(byte);
            if (byte === 0x0A) break;
        }

        let cLength = chunk.length;
        let newline = -1;
        for (let index = 0; index < chunk.length; ++index) {
            if (chunk[index] === 0) {
                cLength = index;
                break;
            }
            if (chunk[index] === 0x0A) {
                newline = index;
                break;
            }
        }

        if (skip) {
            if (newline >= 0) skip = false;
            continue;
        }

        if (newline < 0
            && cLength >= CONFIG_BUFFER_BYTE_CAPACITY - 2) {
            // parse_conf_buf() reports this non-fatally, then discards input
            // through the next visible newline.  The error lands on whichever
            // line config_error_nextline() last accepted, because this one
            // never reaches it.
            config_error_add(frame, 'Line too long, skipping');
            skip = true;
            continue;
        }

        let line = chunk.slice(0, newline >= 0 ? newline : cLength);
        const continued = line.at(-1) === 0x5C;
        if (continued) {
            // parse_conf_buf() leaves its end pointer on the new NUL, so
            // spaces before a continuation backslash remain in the buffer.
            line.pop();
        } else {
            while ([0x20, 0x09, 0x0D].includes(line.at(-1))) line.pop();
        }
        // parse_conf_buf() reports the line to the error frame here, before
        // the leading whitespace is stepped over, so a reported line keeps its
        // indent.  A false answer abandons the rest of the file.
        if (!config_error_nextline(frame, decodeUtf8ByteString(line))) return;
        const lineNumber = frame.line_num;
        while (line[0] === 0x20 || line[0] === 0x09) line.shift();

        const ignored = line.length === 0 || line[0] === 0x23;
        const hadBuffered = buffered !== null;

        if (!ignored) {
            buffered = hadBuffered
                ? [...buffered, 0x20, ...line]
                : line;
            if (buffered.length >= CONFIG_BUFFER_BYTE_CAPACITY)
                buffered.length = CONFIG_BUFFER_BYTE_CAPACITY - 1;
        }
        if (continued || (ignored && !hadBuffered)) continue;

        yield {
            line: decodeUtf8ByteString(buffered),
            lineNumber,
        };
        buffered = null;
    }
}

// C ref: options.c parseoptions() (543-556), which measures the name with
// length_without_val(), and string_for_opt() (6664-6680), which finds the same
// ':' or '=' again to answer the value.  The two ends of the name are not
// treated alike: whitespace in front of the separator belongs to neither side,
// while whitespace at the head belongs to the name, so "! time:on" looks for
// an option called " time" and finds none.
function splitNameAndValue(statement) {
    // length_without_val() answers the length it was handed only when the
    // statement carries no separator at all, since a separator at index i
    // answers at most i.  That is how the two are told apart here, where C
    // tells them apart by string_for_opt()'s empty_optstr.
    const nameLength = length_without_val(statement, statement.length);
    if (nameLength === statement.length) return { name: statement, value: null };
    return {
        name: statement.slice(0, nameLength),
        value: string_for_opt(statement, true),
    };
}

// C ref: options.c parseoptions() (539-542).  Negation toggles for every
// leading '!', "no" or "no-", and each one advances by exactly its own one,
// two or three bytes.  The loop strips no whitespace: parseoptions() strips
// the element's leading and trailing whitespace once at 528-533, before this
// runs, and a blank that follows a prefix therefore stays at the head of the
// statement the match loop reads.
function stripNegation(element) {
    let statement = element;
    let negated = false;
    while (statement[0] === '!' || equal_ncasechars(statement, 'no', 2)) {
        statement = statement.slice(
            statement[0] === '!' ? 1 : (statement[2] !== '-' ? 2 : 3),
        );
        negated = !negated;
    }
    return { statement, negated };
}

// C ref: options.c optfn_boolean() (5199-5222), the do_set request's three
// exits that precede `*(allopt[optidx].addr) = !negated` at 5285 and are
// reachable while a configuration file is being read.  True means C took one
// of them, so the caller must leave the option at its previous value.
//
// parseoptions() calls this handler for every BoolOpt row, so both this
// function and applyOption()'s boolean arm select on the row's opttyp: C
// reports the negation just the same for a row whose storage this port does
// not own.  bad_negation() has already answered a row whose negateok is No,
// matching C's order at 618-622.
//
// go.opt_initial is TRUE throughout a configuration-file read, so the
// set_in_config guard at 5205 cannot fire here and only its set_wiznofuz
// sibling can.  Neither that guard nor the null-address retreat reports
// anything; the negation arm is the one exit that adds a message.
function optfn_boolean_returns_before_setting(result, row, value, negated) {
    /* silent retreat: the #ifdef arm that would have supplied storage for
       this option compiled to a null pointer */
    if (!row.addr) return true;
    /* options that must NOT come from config file */
    if (row.setwhere === set_wiznofuz) return true;
    // C's `op = string_for_opt(opts, TRUE); if (op != empty_optstr)`.
    if (value == null || value === '') return false;
    if (!negated) return false;
    configErrorAdd(
        result,
        `Negated boolean '${row.name}' should not have a parameter`,
    );
    return true;
}

// C ref: options.c optfn_boolean() (5209-5237), the do_set request's value
// block, minus the negation arm optfn_boolean_returns_before_setting() above
// answers first.
//
// C skips the whole block when string_for_opt(opts, TRUE) answers
// empty_optstr, which it does both for a statement carrying no separator --
// splitNameAndValue()'s null -- and for one whose separator ends it, where the
// value is the empty string.  Either way the option takes !negated.
//
// `row` is allopt[optidx] and `statement` is `opts`, the trimmed
// negation-stripped element parseoptions() hands the handler, still carrying
// its value and its original case.  Null means C reported and returned
// optn_silenterr without reaching `*(allopt[optidx].addr) = !negated`, so the
// caller must leave the option and everything it drags with it alone.
function booleanValue(result, row, statement, value, negated) {
    if (value == null || value === '') return !negated;
    const normalized = value.toLowerCase();
    if ('true'.startsWith(normalized)
        || 'yes'.startsWith(normalized)
        || normalized === 'on'
        // options.c optfn_boolean() accepts digit-leading strings according
        // to atoi(), including spellings such as "01" and "1suffix".
        || (/^[0-9]/u.test(normalized)
            && Number.parseInt(normalized, 10) === 1)) return true;
    if ('false'.startsWith(normalized)
        || 'no'.startsWith(normalized)
        || normalized === 'off'
        || (/^[0-9]/u.test(normalized)
            && Number.parseInt(normalized, 10) === 0)) return false;
    // C's third arm (5233-5237) is `else if (!allopt[optidx].valok)`: a row
    // that admits arbitrary values keeps `negated` as it was and falls through
    // to the assignment, and only the rest report and return optn_silenterr.
    // menucolors is the one BoolOpt row whose optlist.h valok is Yes, so it is
    // the one row that reaches the fall-through below.
    if (!row.valok) {
        configErrorAdd(result, `'${statement}' is not valid for a boolean`);
        return null;
    }
    return !negated;
}

const CHARACTER_OPTIONS = Object.freeze({
    role: {
        resultField: 'role',
        flagField: 'initrole',
        parser: str2role,
    },
    race: {
        resultField: 'race',
        flagField: 'initrace',
        parser: str2race,
    },
    gender: {
        resultField: 'gender',
        flagField: 'initgend',
        parser: str2gend,
    },
    alignment: {
        resultField: 'align',
        flagField: 'initalign',
        parser: str2align,
    },
});

function clearRoleFilter(filter, which) {
    if (which === 'role') filter.roles.fill(false);
    else if (which === 'race') filter.mask &= ~ROLE_RACEMASK;
    else if (which === 'gender') filter.mask &= ~ROLE_GENDMASK;
    else if (which === 'alignment') filter.mask &= ~ROLE_ALIGNMASK;
}

// C ref: role.c setrolefilter().  It deliberately accepts any role aspect,
// regardless of which of the four option names supplied the value.
function setRoleFilter(filter, value) {
    let index = str2role(value);
    if (index !== ROLE_NONE && index !== ROLE_RANDOM) {
        filter.roles[index] = true;
        return true;
    }
    index = str2race(value);
    if (index !== ROLE_NONE && index !== ROLE_RANDOM) {
        filter.mask |= races[index].selfmask;
        return true;
    }
    index = str2gend(value);
    if (index !== ROLE_NONE && index !== ROLE_RANDOM) {
        filter.mask |= genders[index].allow;
        return true;
    }
    index = str2align(value);
    if (index !== ROLE_NONE && index !== ROLE_RANDOM) {
        filter.mask |= aligns[index].allow;
        return true;
    }
    return false;
}

// C ref: role.c rolefilterstring().  options.c uses this saved value to
// distinguish a preceding filter from a preceding positive choice.
function roleFilterString(filter, which) {
    if (which === 'role') {
        return roles.flatMap((role, index) => (
            filter.roles[index] ? [`!${role.name.m.slice(0, 3)}`] : []
        )).join(' ');
    }
    if (which === 'race') {
        return races.flatMap((race) => (
            filter.mask & race.selfmask ? [`!${race.noun}`] : []
        )).join(' ');
    }
    if (which === 'gender') {
        return genders.slice(0, -1).flatMap((gender) => (
            filter.mask & gender.allow ? [`!${gender.adj}`] : []
        )).join(' ');
    }
    return aligns.slice(0, 3).flatMap((alignment) => (
        filter.mask & alignment.allow ? [`!${alignment.adj}`] : []
    )).join(' ');
}

function stripValueNegation(value) {
    let token = value;
    let negated = false;
    for (;;) {
        if (token.startsWith('!')) {
            negated = !negated;
            token = token.slice(1);
        } else if (/^no-/iu.test(token)) {
            negated = !negated;
            token = token.slice(3);
        } else if (/^no/iu.test(token)) {
            negated = !negated;
            token = token.slice(2);
        } else {
            break;
        }
    }
    return { token, negated };
}

// C ref: options.c complain_about_duplicate() (6789-6808).  OthrOpt rows use
// the source's "boolean" fallback too; CompOpt is the only type printed as
// "compound".
//
// `using_alias` is a file static that options.c:503 clears at the top of every
// parseoptions() call.  The comma recursion at :513-521 runs before the
// level's own match loops, so the clear a level writes is overwritten by the
// level nested inside it, and the alias loop at :592-612 is the only place
// that raises the flag.  What survives is one flag per configuration-file
// line: the rightmost element of the line raises it, and every element to the
// left of that one inherits it whether or not it spelled an alias itself.
//
// The alias text is allopt[optidx].alias, the complained-about row's own, not
// the spelling the statement used. optlist.h gives the race and gender rows
// NoAlias, a null pointer, and the reference build's C library renders a null
// "%s" as "(null)"; a recorded run of
// `OPTIONS=race:human,race:!elf,align:!lawful` prints exactly that.
function complain_about_duplicate(result, option, metadata, usingAlias) {
    const alias = usingAlias
        ? ` (via alias: ${metadata.alias ?? '(null)'})`
        : '';
    const type = option.opttyp === 'CompOpt' ? 'compound' : 'boolean';
    configErrorAdd(
        result,
        `${type} option specified multiple times: ${option.name}${alias}`,
    );
}

// C ref: options.c parse_role_opt() (7904-8016), the shared body of
// optfn_role() (3588-3623), optfn_race() (3506-3547), optfn_gender()
// (1776-1817) and optfn_alignment() (884-925).  This covers everything the
// four reach from a configuration file, which is their whole do_set arm; the
// get_val and get_cnf_val requests belong to the options menu.
//
// Every message C writes here leaves the file being read, so this reports and
// returns rather than throwing.  Each return is one of C's two failure exits
// and they are indistinguishable from applyOption(): parse_role_opt() answering
// FALSE becomes optn_silenterr and the unknown-value arm becomes optn_err, and
// parseoptions() turns both into a discarded FALSE for a row whose optlist.h
// pfx is false, which all four of these are.
//
// C's `duplicate` is the value duplicate_opt_detection() returned before this
// handler ran. The general parse path owns that counter and passes its answer
// here, just as parseoptions() leaves the file-static value for optfn_role().
function setCharacterOption(
    result, optionState, option, statement, negated, usingAlias, duplicate,
) {
    const optionName = option.name.toLowerCase();
    // parse_role_opt():7935 reads the value with
    // string_for_env_opt(fullname, opts, FALSE), whose mandatory parameter is
    // what reports a statement that carries none.  `ok` stays FALSE, so the
    // handler answers optn_silenterr without a second message.
    const op = string_for_env_opt(statement, false, result);
    if (op === '') return;

    const normalized = mungspaces(op);
    const values = normalized ? normalized.split(' ') : [];
    let previousValueNegated = false;
    let filtered = false;
    let selectedValue = '';

    for (let index = 0; index < values.length; ++index) {
        const valueNegation = stripValueNegation(values[index]);
        const token = valueNegation.token;
        const valueNegated = valueNegation.negated;
        if (!token) {
            configErrorAdd(result, `Negated nothing for '${optionName}'`);
            return;
        }
        if (index > 0) {
            if ((valueNegated !== previousValueNegated)
                || (negated && valueNegated)) {
                configErrorAdd(
                    result,
                    'Invalid mixed negation for'
                    + ` '${negated ? '!' : ''}${optionName}'`,
                );
                return;
            }
            if (!negated && !valueNegated) {
                configErrorAdd(
                    result,
                    'Multiple role values only allowed when list is negated',
                );
                return;
            }
        }
        previousValueNegated = valueNegated;

        const prior = optionState.values[optionName];
        if (valueNegated || negated) {
            if (!prior || !prior.startsWith('!')) {
                clearRoleFilter(result.roleFilter, optionName);
            }
            if (!setRoleFilter(result.roleFilter, token)) {
                configErrorAdd(
                    result, `Invalid ${optionName} '${token}'`,
                );
                return;
            }
            optionState.values[optionName] = roleFilterString(
                result.roleFilter, optionName,
            );
            filtered = true;
        } else {
            if (duplicate && prior?.startsWith('!')) {
                complain_about_duplicate(
                    result, option, optionParserMetadata[option.name] ?? {},
                    usingAlias,
                );
                return;
            }
            optionState.values[optionName] = token;
            selectedValue = token;
            filtered = false;
        }
    }

    // C's `if (*op != '!')`: parse_role_opt() leaves *opp pointing at the
    // literal "!" once any value in the list was negated, so a filter skips
    // the handler's own str2<aspect>() lookup.
    if (filtered) return;
    const choice = CHARACTER_OPTIONS[optionName];
    const parsed = choice.parser(selectedValue);
    if (parsed === ROLE_NONE) {
        // C's "Unknown %s '%s'" names allopt[optidx].name, so alignment
        // reports "alignment" rather than the shorter field it writes.
        configErrorAdd(
            result, `Unknown ${optionName} '${selectedValue}'`,
        );
        return;
    }
    result[choice.resultField] = parsed;
    result.flags[choice.flagField] = parsed;
    if (optionName === 'gender' && parsed !== ROLE_RANDOM) {
        result.flags.female = parsed === 1;
    }
}

// C ref: options.c optfn_playmode() (3470-3499), its do_set arm.  The handler
// reads the value parseoptions() already found rather than asking for one of
// its own, so a statement with no value is refused with no message at all.
//
// A negated spelling cannot reach this handler because optlist.h gives
// playmode negateok No. A duplicate does reach it after parseoptions() has
// reported the repeated row, and this handler silently refuses that value.
function setPlaymode(result, value, duplicate) {
    if (duplicate) return;
    if (value == null || value === '') return; /* optn_err, silently */
    const mode = value.toLowerCase();
    let canonical;
    if (mode.startsWith('normal') || mode === 'play') canonical = 'normal';
    else if (mode.startsWith('explor') || mode.startsWith('discov')) {
        canonical = 'explore';
    } else if (mode.startsWith('debug') || mode.startsWith('wizard')) {
        canonical = 'debug';
    } else {
        configErrorAdd(result, `Invalid value for "playmode":${value}`);
        return;
    }
    result.playmode = canonical;
    result.flags.debug = canonical === 'debug';
    result.flags.explore = canonical === 'explore';
}

// C ref: options.c optfn_pettype() (3196-3252), its do_set arm.  The value is
// mandatory only when the statement is not negated, and the negation is
// otherwise ignored: "!pettype:dog" reaches the switch and selects a dog, the
// same as "pettype:dog".
function setPettype(result, statement, negated) {
    const op = string_for_env_opt(statement, negated, result);
    if (op === '') {
        if (negated) result.preferred_pet = 'n';
        return;
    }
    switch (lowc(op[0])) {
    case 'd': result.preferred_pet = 'd'; break;
    case 'c':
    case 'f': result.preferred_pet = 'c'; break;
    case 'h':
    case 'q': result.preferred_pet = 'h'; break;
    case 'n': result.preferred_pet = 'n'; break;
    case 'r':
    case '*': result.preferred_pet = ''; break;
    default:
        // C's format string ends in a period, so config_erradd() adds none.
        configErrorAdd(result, `Unrecognized pet type '${op}'.`);
    }
}

// C refs: options.c:nmcpy() and bones.c:sanitize_name(). Pet names are
// truncated and sanitized as bytes. Bytes whose low seven bits are control
// characters or DEL become '.'; default tty mode replaces other high-bit
// bytes with '_'.
function sanitizePetName(value, eightBitTty) {
    const bytes = encodeUtf8ByteString(value).slice(0, PET_NAME_BYTE_LIMIT);
    for (let index = 0; index < bytes.length; ++index) {
        const lowSeven = bytes[index] & 0x7F;
        if (lowSeven < 0x20 || lowSeven === 0x7F) bytes[index] = 0x2E;
        else if (lowSeven !== bytes[index] && !eightBitTty) {
            bytes[index] = 0x5F;
        }
    }
    return decodeUtf8ByteString(bytes);
}

// C ref: options.c petname_optfn() (846-873), the do_set arm shared by
// optfn_catname() (1248-1254), optfn_dogname() (1562-1568) and
// optfn_horsename() (1896-1902).
//
// optlist.h:221-222, :288-289 and :382-383 give catname, dogname and horsename
// negateok No, so parseoptions() answers a negated spelling with
// bad_negation() and none of the three handlers sees one.  What is left of
// C's first test is `op == empty_optstr`, which returns optn_err and writes
// neither a message nor the name: the handler reads the value parseoptions()
// already found rather than asking for a mandatory one of its own.
function setPetName(result, field, value) {
    if (value == null || value === '') return; /* optn_err, silently */
    result[field] = value === 'none' || value === '(none)'
        ? '' : sanitizePetName(value, result.iflags.wc_eight_bit_input);
}

// C ref: options.c optfn_fruit(do_set) during initial option parsing.
// Singularization and fruit-chain insertion are deferred to
// initoptions_finish(), after the complete configuration has been read.
// optlist.h:339-340 gives fruit negateok No, so parseoptions() answers a
// negated spelling with bad_negation() and optfn_fruit()'s negation arm
// (options.c:1717-1724), which resets svp.pl_fruit through `goodfruit`, is
// unreachable from a configuration file.
//
// That negation is also the whole of C's val_optional argument here:
// `negated || !go.opt_initial` is FALSE for every configuration-file read that
// gets this far, so the value is mandatory and string_for_opt() reports a
// statement without one.  The handler adds nothing of its own afterwards.
function setFruit(result, statement) {
    const op = string_for_opt(statement, false, result);
    if (op === '') return;
    result.pl_fruit = normalize_initial_fruit(
        op,
        result.iflags.wc_eight_bit_input,
    );
}

// C ref: options.c optfn_autounlock() (1066-1168), its startup do_set arm.
// A missing or empty value selects the source default (apply-key), or none
// when negated. Nonempty lists choose plus when the text contains any plus;
// otherwise they split on spaces. trimspaces() handles the edge of each token,
// while fuzzymatch() permits separators inside apply-key only when plus already
// separates the list.
function optfn_autounlock(result, statement, negated) {
    const op = string_for_opt(statement, true);
    if (op === '') {
        result.flags.autounlock = negated ? 0 : AUTOUNLOCK_APPLY_KEY;
        return;
    }

    let newflags = 0;
    const separator = op.includes('+') ? '+' : ' ';
    let remainder = op;
    for (;;) {
        const current = trimspaces(remainder);
        const split = current.indexOf(separator);
        const token = trimspaces(
            split < 0 ? current : current.slice(0, split),
        );
        let matched = false;
        if (str_start_is('none', token, true)) {
            negated = true;
            matched = true;
        }
        for (let index = 0; index < unlocktypes.length && !matched; ++index) {
            const candidate = unlocktypes[index];
            if (str_start_is(candidate, token, true)
                || fuzzymatch(token, candidate, ' -_', true)) {
                matched = true;
                // Preserve the source's case-sensitive dispatch after its
                // case-insensitive match. An uppercase token matches above but
                // reaches the default arm and is therefore invalid.
                switch (token[0]) {
                case 'u': newflags |= AUTOUNLOCK_UNTRAP; break;
                case 'a': newflags |= AUTOUNLOCK_APPLY_KEY; break;
                case 'k': newflags |= AUTOUNLOCK_KICK; break;
                case 'f': newflags |= AUTOUNLOCK_FORCE; break;
                default: matched = false; break;
                }
            }
        }
        if (!matched) {
            configErrorAdd(
                result, `Invalid value for "autounlock": "${token}"`,
            );
            return;
        }
        if (split < 0) break;
        remainder = current.slice(split + 1);
    }

    if (negated && newflags !== 0) {
        configErrorAdd(
            result,
            'Invalid value combination for "autounlock": \'none\' with some',
        );
        return;
    }
    result.flags.autounlock = newflags;
}

// C ref: options.c optfn_boulder() (1171-1244), its startup do_set arm.
// The reference build's plain `char` is signed.  Fresh patched-C recordings
// pin bytes 0x80 and above to the same control-character diagnostic as NUL;
// they also settle the adjacent source comment about NUL reset as stale.
function optfn_boulder(result, statement) {
    const op = string_for_opt(statement, false, result);
    if (op === '') return;
    const byte = escapes(op)[0] ?? 0;
    const monsterClass = def_char_to_monclass(byte);
    const clash = monsterClass !== MAXMCLASSES && byte !== 0
        ? 'monster'
        : byte >= 0x31 && byte < 0x30 + 6 ? 'warning' : null;
    const signedByte = byte >= 0x80 ? byte - 0x100 : byte;
    if (signedByte < 0x20) {
        configErrorAdd(
            result, 'boulder symbol cannot be a control character',
        );
        return;
    }
    if (clash) {
        configErrorAdd(
            result,
            `Badoption - boulder symbol '${visctrl(byte)}' would conflict`
                + ` with a ${clash} symbol`,
        );
        return;
    }
    result.symbolOperations.push({ kind: 'boulder', byte });
}

// C refs: options.c optfn_warnings(), warning_opts(), and assign_warnings().
// The option value is mandatory, then escapes() rewrites its bytes in place.
// strlen() stops at the first expanded NUL; a short value changes its prefix
// and leaves the remaining slots alone, while bytes after the sixth are
// ignored by assign_warnings().
function optfn_warnings(result, statement) {
    const op = string_for_env_opt(statement, false, result);
    if (op === '') return;
    const expanded = escapes(op);
    const nul = expanded.indexOf(0);
    const length = nul < 0 ? expanded.length : nul;
    const translate = Array.from(
        { length: WARNCOUNT },
        (_, index) => index < length ? expanded[index] : 0,
    );
    assign_warnings(result, translate);
}

// C ref: options.c assign_warnings(). gw.warnsyms is the sole installed
// warning-symbol state; zero entries mean that the corresponding slot is not
// changed.
export function assign_warnings(result, graphChars) {
    for (let index = 0; index < WARNCOUNT; ++index) {
        if (graphChars[index]) result.gw.warnsyms[index] = graphChars[index];
    }
}

// C ref: options.c optfn_crash_email() (1259-1282), its startup do_set arm.
// The value is mandatory.  Unlike the PL_NSIZ-sized option-menu input buffer,
// configuration parsing hands the handler a pointer into parseoptions()'s
// complete element, and dupstr() stores every remaining byte.
function optfn_crash_email(result, statement) {
    const op = string_for_opt(statement, false, result);
    if (op === '') return;
    result.gc.crash_email = op;
}

// C ref: options.c optfn_crash_name() (1285-1308), its startup do_set arm.
// Its allopt row owns a duplicate counter separate from crash_email's, while
// the handler otherwise applies the same mandatory-value rule.
function optfn_crash_name(result, statement) {
    const op = string_for_opt(statement, false, result);
    if (op === '') return;
    result.gc.crash_name = op;
}

// C ref: options.c optfn_crash_urlmax() (1311-1339), its startup do_set arm.
// The value is mandatory, then the recorder platform's atoi() conversion is
// checked against the sole lower bound.  A rejected value leaves the decl.c
// default or the value installed by an earlier handler call untouched.
function optfn_crash_urlmax(result, statement) {
    const op = string_for_opt(statement, false, result);
    if (op === '') return;
    const limit = atoi(op);
    if (limit < 75) {
        configErrorAdd(
            result,
            `Invalid value ${limit} for crash_urlmax.  Minimum value is 75.`,
        );
        return;
    }
    result.gc.crash_urlmax = limit;
}

const MENU_HEADING_COLORS = Object.freeze({
    black: CLR_BLACK,
    red: CLR_RED,
    green: CLR_GREEN,
    brown: CLR_BROWN,
    blue: CLR_BLUE,
    magenta: CLR_MAGENTA,
    purple: CLR_MAGENTA,
    cyan: CLR_CYAN,
    gray: CLR_GRAY,
    grey: CLR_GRAY,
    orange: CLR_ORANGE,
    lightgreen: CLR_BRIGHT_GREEN,
    brightgreen: CLR_BRIGHT_GREEN,
    yellow: CLR_YELLOW,
    lightblue: CLR_BRIGHT_BLUE,
    brightblue: CLR_BRIGHT_BLUE,
    lightmagenta: CLR_BRIGHT_MAGENTA,
    brightmagenta: CLR_BRIGHT_MAGENTA,
    lightpurple: CLR_BRIGHT_MAGENTA,
    brightpurple: CLR_BRIGHT_MAGENTA,
    lightcyan: CLR_BRIGHT_CYAN,
    brightcyan: CLR_BRIGHT_CYAN,
    brightred: CLR_ORANGE,
    white: CLR_WHITE,
    nocolor: NO_COLOR,
    transparent: NO_COLOR,
});

// C ref: coloratt.c attrnames[] (47-58), read by match_str2attr() (374-393).
// Its seven names are followed by a NULL row and then three aliases, and the
// match loop walks past the NULL row, so all ten spell an attribute.
//
// This table is match_str2attr() composed with what optfn_menu_headings()'s
// one caller does with the answer: iflags.menu_headings holds a single C ATR_
// value that wintty.c hands to term_start_attr(), and recorder patch 006's
// nomux_set_attr() records only ATR_INVERSE, ATR_BOLD and ATR_ULINE.  A
// heading asking for dim, italic or blink is therefore drawn exactly as an
// unstyled one, which is why those three share ATR_NONE's captured value here.
//
// STATUS_HILITE_ATTRIBUTES below is the other reading of the same ten names.
// A status highlight accumulates several attributes at once and keeps the
// tty-invisible ones apart from "none", so it cannot share this collapse.
const MENU_HEADING_ATTRIBUTES = Object.freeze({
    none: ATR_NONE,
    normal: ATR_NONE,
    bold: ATR_BOLD,
    dim: ATR_NONE,
    italic: ATR_NONE,
    blink: ATR_NONE,
    underline: ATR_UNDERLINE,
    uline: ATR_UNDERLINE,
    inverse: ATR_INVERSE,
    reverse: ATR_INVERSE,
});

// The status-highlight reading of coloratt.c attrnames[]: match_str2attr()
// composed with the ATR_ to HL_ chain that botl.c spells identically in
// parse_status_hl2() (3040-3060) and parse_condition() (3306-3326).  Each
// answer is the HL_ bit from include/botl.h:251-258 that the chain selects,
// so a caller ORs it in -- except HL_NONE, which C assigns rather than ORs
// and which therefore discards whatever the same action named earlier.
//
// The C ATR_ numbering (wintype.h:128-134) is deliberately absent: the ATR_
// names js/terminal.js exports are the recorder's captured attribute bitmask,
// a different vocabulary that happens to reuse the same identifiers, and
// routing the status highlights through C's enum would put both in scope at
// once.  The HL_ bits are the values C stores, so the port stores them too.
const STATUS_HILITE_ATTRIBUTES = Object.freeze({
    none: HL_NONE,
    bold: HL_BOLD,
    dim: HL_DIM,
    italic: HL_ITALIC,
    underline: HL_ULINE,
    blink: HL_BLINK,
    inverse: HL_INVERSE,
    normal: HL_NONE,
    uline: HL_ULINE,
    reverse: HL_INVERSE,
});

function menuHeadingToken(value) {
    // coloratt.c match_str2clr()/match_str2attr() ignore spaces, hyphens,
    // and underscores anywhere in the value.
    return String(value).trim().toLowerCase().replace(/[ _-]+/gu, '');
}

function menuHeadingColor(token, rawToken = token) {
    if (Object.hasOwn(MENU_HEADING_COLORS, token)) {
        return MENU_HEADING_COLORS[token];
    }
    // coloratt.c also accepts an in-range decimal color index when the
    // string begins with a digit; the tty color table occupies 0 through 15.
    if (/^\d/u.test(rawToken)) {
        const color = Number.parseInt(rawToken, 10);
        if (color >= CLR_BLACK && color <= CLR_WHITE) return color;
    }
    return null;
}

function menuHeadingAttribute(token) {
    return Object.hasOwn(MENU_HEADING_ATTRIBUTES, token)
        ? MENU_HEADING_ATTRIBUTES[token] : null;
}

// C ref: coloratt.c match_str2attr() (373-393).  Null is its -1, the answer
// its callers read as "not an attribute".  Only a caller that passes complain
// TRUE reports; color_attr_parse_str() below passes both.
//
// The "%.50s" precision is a byte count, and parseoptions() admits a statement
// of up to BUFSZ/2 bytes, so a value can exceed it while holding fewer than
// fifty characters.  Cutting the UTF-8 encoding reproduces C's split of a
// multi-byte character as well as its length.
function match_str2attr(result, str, complain) {
    const attr = menuHeadingAttribute(menuHeadingToken(str));
    if (attr === null && complain) {
        configErrorAdd(
            result,
            `Unknown text attribute '${truncateByteString(str, 50)}'`,
        );
    }
    return attr;
}

// C ref: coloratt.c color_attr_parse_str() (260-299).  Null is its FALSE.
// Its own comment calls the retry useless because both lookups have already
// reported, and that is exactly what makes the message order observable: a
// "color&attribute" pair that matches neither way reports four times, in the
// order this walk produces them.
//
// C splits at the first '&' alone, so "red&bold&underline" asks
// match_str2attr() about "bold&underline" rather than counting three parts.
function color_attr_parse_str(result, str) {
    const amp = str.indexOf('&');
    if (amp < 0) {
        /* one param only */
        const attr = match_str2attr(result, str, false);
        if (attr !== null) return { attr, color: NO_COLOR };
        const color = match_str2clr(result, str, false);
        if (color >= CLR_MAX) return null;
        return { attr: ATR_NONE, color };
    }
    const head = str.slice(0, amp);
    const tail = str.slice(amp + 1);
    let color = match_str2clr(result, head, false);
    let attr = match_str2attr(result, tail, true);
    if (color >= CLR_MAX && attr === null) {
        /* try other way around */
        color = match_str2clr(result, tail, false);
        attr = match_str2attr(result, head, true);
    }
    if (color >= CLR_MAX || attr === null) return null;
    return { attr, color };
}

// Null is match_str2attr()'s -1, the answer its two status-highlight callers
// take as "not an attribute, try a colour next".  Both pass complain FALSE,
// so an unmatched name reports nothing here.
function statusHiliteAttribute(token) {
    return Object.hasOwn(STATUS_HILITE_ATTRIBUTES, token)
        ? STATUS_HILITE_ATTRIBUTES[token] : null;
}

// C refs: botl.c initblstats[], fieldids_alias[], parse_status_hl1(), and
// parse_status_hl2(). Rules stay in source append order for get_hilite()-
// shaped selection by the tty status renderer.
const STATUS_HILITE_FIELDS = Object.freeze({
    title: 'string',
    strength: 'int',
    dexterity: 'int',
    constitution: 'int',
    intelligence: 'int',
    wisdom: 'int',
    charisma: 'int',
    alignment: 'string',
    score: 'long',
    'carrying-capacity': 'int',
    gold: 'long',
    power: 'int',
    'power-max': 'int',
    'experience-level': 'int',
    'armor-class': 'int',
    hd: 'int',
    time: 'long',
    hunger: 'int',
    hitpoints: 'int',
    'hitpoints-max': 'int',
    'dungeon-level': 'string',
    experience: 'long',
    condition: 'condition',
    version: 'string',
    weapon: 'string',
    armor: 'string',
    terrain: 'string',
});

const STATUS_PERCENT_FIELDS = new Set([
    'power', 'experience-level', 'hitpoints', 'experience',
]);

const STATUS_TEXT_THRESHOLDS = Object.freeze({
    'carrying-capacity': Object.freeze({
        burdened: 'burdened',
        stressed: 'stressed',
        strained: 'strained',
        overtaxed: 'overtaxed',
        overloaded: 'overloaded',
    }),
    hunger: Object.freeze({
        satiated: 'satiated',
        hungry: 'hungry',
        weak: 'weak',
        fainting: 'fainting',
        fainted: 'fainted',
        starved: 'starved',
    }),
});

const STATUS_HILITE_FIELD_ALIASES = Object.freeze({
    characteristics: 'characteristics',
    encumbrance: 'carrying-capacity',
    experiencepoints: 'experience',
    dx: 'dexterity',
    co: 'constitution',
    con: 'constitution',
    points: 'score',
    cap: 'carrying-capacity',
    pw: 'power',
    pwmax: 'power-max',
    xl: 'experience-level',
    xplvl: 'experience-level',
    ac: 'armor-class',
    hitdice: 'hd',
    turns: 'time',
    hp: 'hitpoints',
    hpmax: 'hitpoints-max',
    dgn: 'dungeon-level',
    xp: 'experience',
    exp: 'experience',
    flags: 'condition',
});

const STATUS_CHARACTERISTIC_FIELDS = Object.freeze([
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
]);

const STATUS_HILITE_CONDITIONS = Object.freeze({
    bare: 'barehanded',
    blind: 'blind',
    busy: 'busy',
    conf: 'conf',
    deaf: 'deaf',
    iron: 'iron',
    fly: 'fly',
    foodpois: 'foodpois',
    glow: 'glowhands',
    grab: 'grab',
    hallu: 'hallucinat',
    held: 'held',
    icy: 'ice',
    inlava: 'lava',
    lev: 'levitate',
    parlyz: 'paralyzed',
    ride: 'ride',
    zzz: 'sleep',
    slime: 'slime',
    slip: 'slip',
    stone: 'stone',
    strngl: 'strngl',
    stun: 'stun',
    submrg: 'submerged',
    termill: 'termill',
    teth: 'tethered',
    trap: 'trap',
    out: 'unconscious',
    wlegs: 'woundedlegs',
    uhold: 'holding',
});

// C ref: botl.c condition_aliases[] (748-775).  The keys are the C ids
// verbatim, underscores included, because match_str2conditionbitmask()'s
// prefix pass compares them with strncmpi() rather than fuzzymatch().
const STATUS_CONDITION_ALIASES = Object.freeze({
    strangled: ['strngl'],
    all: SOURCE_CONDITION_NAMES,
    major_troubles: [
        'foodpois', 'grab', 'lava', 'slime', 'stone', 'strngl', 'termill',
    ],
    minor_troubles: [
        'blind', 'conf', 'deaf', 'hallucinat', 'paralyzed', 'submerged',
        'stun',
    ],
    movement: ['levitate', 'fly', 'ride'],
    opt_in: SOURCE_CONDITION_NAMES.filter(
        (name) => !DEFAULT_STATUS_CONDITIONS[name],
    ),
});

// C ref: botl.c parse_status_hl1()'s MAX_THRESH, the group count one
// hilite_status statement can hold; botl.h's MAXVALWIDTH, the fixed storage
// for a text-match threshold; and splitsubfields()'s MAX_SUBFIELDS.
const MAX_THRESH = 21;
const MAXVALWIDTH = 80;
const MAX_SUBFIELDS = 16;

function statusHiliteFieldName(rawName) {
    const normalized = menuHeadingToken(rawName);
    const exact = Object.keys(STATUS_HILITE_FIELDS).find(
        (name) => menuHeadingToken(name) === normalized,
    );
    if (exact) return exact;
    if (Object.hasOwn(STATUS_HILITE_FIELD_ALIASES, normalized)) {
        return STATUS_HILITE_FIELD_ALIASES[normalized];
    }
    // C ref: fldname_to_bl_indx()'s third pass, strncmpi(), which keeps the
    // ' ', '-' and '_' the two fuzzymatch() passes above drop.  "carrying" is
    // a prefix of carrying-capacity where "carryingc" is not.  The keys below
    // are the initblstats[] names, and strncmpi() folds case, so the lowercase
    // spelling of "HD" compares the same way.
    const prefix = String(rawName).toLowerCase();
    const partials = Object.keys(STATUS_HILITE_FIELDS).filter(
        (name) => name.startsWith(prefix),
    );
    return partials.length === 1 ? partials[0] : null;
}

// C ref: botl.c initblstats[].fldname, which two of the messages below quote
// verbatim.  Every key of STATUS_HILITE_FIELDS is already its C spelling
// except this one, whose row reads INIT_BLSTAT("HD", ...).
function statusHiliteFieldCName(field) {
    return field === 'hd' ? 'HD' : field;
}

// C ref: botl.c splitsubfields() (2685-2726).  It splits str in place on '+'
// and '&', so a trailing separator contributes no field while a leading or
// doubled one contributes an empty one.  Its -1 answer, spelled null here,
// needs fifteen separators and is silent.  Two of the three callers below drop
// the group on it: parseStatusHiliteAction() is C's `if (sf < 1) return
// FALSE;` and str2conditionbitmask() is C's 0UL.  parse_condition() is the
// third, and C gives it no such guard, so its `for (i = 0; i < sf; ++i)` runs
// no iteration and the group is kept with whatever color and attributes the
// group before it left.
function splitsubfields(str, maxsf = 0) {
    const limit = maxsf === 0 ? MAX_SUBFIELDS : Math.min(maxsf, MAX_SUBFIELDS);
    if (!str.includes('+') && !str.includes('&')) return [str];
    const subfields = [];
    let start = 0;
    let index = 0;
    while (index < str.length && subfields.length < limit) {
        if (str[index] === '&' || str[index] === '+') {
            subfields.push(str.slice(start, index));
            start = index + 1;
        }
        index += 1;
    }
    if (subfields.length >= limit - 1) return null;
    // C's `if (!*c && c != st)`: the tail after the last separator, which a
    // string that ended on one does not have.
    if (index >= str.length && index !== start) {
        subfields.push(str.slice(start));
    }
    return subfields;
}

// C ref: coloratt.c match_str2clr() (348-371).  menuHeadingColor() is its
// table walk and digit fall-back; this adds the report and C's "none of the
// above" answer, which every caller rejects a second time by comparing against
// CLR_MAX.  Every status-highlight caller passes suppress_msg FALSE, and
// color_attr_parse_str() passes FALSE from both of its arms as well, so the
// suppressing call is the one this port has no caller for -- coloratt.c's own
// query_color() menu.
// "%.60s" counts bytes, as match_str2attr()'s "%.50s" above does.
function match_str2clr(result, str, suppress_msg) {
    const color = menuHeadingColor(menuHeadingToken(str), str);
    if (color != null) return color;
    if (!suppress_msg) {
        configErrorAdd(
            result, `Unknown color '${truncateByteString(str, 60)}'`,
        );
    }
    return CLR_MAX;
}

// C ref: botl.c parse_status_hl2() (3021-3059), its action half: at most one
// color, any number of attributes, and NO_COLOR when the action named none.
// Null means it reported and its caller answers FALSE.
//
// `attrib` is C's disp_attrib, which the rule keeps as the hilite.coloridx
// high byte (3070).  It starts at HL_UNDEF, gains a bit per named attribute,
// and is *assigned* HL_NONE by "none" or "normal", so an action can end in
// three distinguishable states: no attribute clause at all, an explicit
// "normal", and one or more bits.  A bit named after "normal" still ORs in,
// leaving HL_NONE set alongside it.
function parseStatusHiliteAction(result, how) {
    const subfields = splitsubfields(how);
    // C's `if (sf < 1) return FALSE;`, which reports nothing.
    if (!subfields) return null;
    let attrib = HL_UNDEF;
    let coloridx = -1;
    for (const subfield of subfields) {
        const parsedAttr = statusHiliteAttribute(menuHeadingToken(subfield));
        if (parsedAttr != null) {
            if (parsedAttr === HL_NONE) attrib = HL_NONE;
            else attrib |= parsedAttr;
            continue;
        }
        const color = match_str2clr(result, subfield, false);
        if (color >= CLR_MAX || coloridx !== -1) {
            configErrorAdd(result, `bad color '${color} ${coloridx}'`);
            return null;
        }
        coloridx = color;
    }
    return {
        attrib,
        color: coloridx === -1 ? NO_COLOR : coloridx,
    };
}

// C ref: botl.c match_str2conditionbitmask() (3170-3206).  Three passes: an
// exact fuzzymatch against the conditions[] names, an exact fuzzymatch against
// the aliases, then a strncmpi() prefix over the aliases, which is why "m"
// selects major_troubles, minor_troubles and movement together.  Only the
// first two ignore ' ', '-' and '_', so "major_" is a prefix of major_troubles
// where "majort" is not.  The empty answer is C's zero mask.
function match_str2conditionbitmask(str) {
    if (!str) return [];
    const token = menuHeadingToken(str);
    // Both tables are indexed by rc text, so an inherited name would
    // otherwise answer for a condition C's strcmp() walks never spell.
    if (Object.hasOwn(STATUS_HILITE_CONDITIONS, token)) {
        return [STATUS_HILITE_CONDITIONS[token]];
    }
    const aliases = Object.keys(STATUS_CONDITION_ALIASES);
    const exact = aliases.find((name) => menuHeadingToken(name) === token);
    if (exact) return STATUS_CONDITION_ALIASES[exact];
    const prefix = str.toLowerCase();
    return aliases.filter((name) => name.startsWith(prefix))
        .flatMap((name) => STATUS_CONDITION_ALIASES[name]);
}

// C ref: botl.c str2conditionbitmask() (3208-3229).  Null is its 0UL: either
// splitsubfields() refused the split, silently, or a subfield named no
// condition, which it reports.
function str2conditionbitmask(result, str) {
    const subfields = splitsubfields(str, SOURCE_CONDITION_NAMES.length);
    if (!subfields) return null;
    const selected = new Set();
    for (const subfield of subfields) {
        const names = match_str2conditionbitmask(subfield);
        if (!names.length) {
            configErrorAdd(result, `Unknown condition '${subfield}'`);
            return null;
        }
        for (const name of names) selected.add(name);
    }
    return [...selected];
}

// C's hsbuf[] is a fixed MAX_THRESH-entry array of strings that
// parse_status_hl1() blanks before it fills, so an unwritten group inside the
// array answers the empty string.
//
// Index MAX_THRESH is not inside it.  parse_status_hl1()'s `fldnum++` on '/'
// is unguarded and its loop only stops once fldnum has already reached
// MAX_THRESH, so hsbuf[20] is the last entry ever written.  The pinned C
// binary then reads changing stack garbage when a parser actually asks for
// hsbuf[21].  The port preserves every in-range write, but makes that access a
// deterministic configuration error and propagates the failure immediately.
const STATUS_HILITE_BOUNDARY_ERROR = Symbol('statusHiliteBoundaryError');

function statusHiliteField(result, s, index, boundaryMessage) {
    if (index < s.length) return s[index] ?? '';
    if (!s[STATUS_HILITE_BOUNDARY_ERROR]) {
        s[STATUS_HILITE_BOUNDARY_ERROR] = true;
        configErrorAdd(result, boundaryMessage);
    }
    return '';
}

// One accepted or partly accepted condition group, standing for the
// gc.cond_hilites[] entries parse_condition() has written for it by the time
// the group ends.  win/tty/wintty.c condattr() and condcolor() read those
// entries back, which js/display.js _statusConditionStyle() replays from the
// rules recorded here.
function pushConditionRule(result, conditions, style) {
    result.iflags.status_hilites.push({
        field: 'condition',
        conditions,
        style,
    });
}

// C ref: botl.c parse_condition() (3232-3348).  Its color index is set once,
// before the loop, so a later group naming no color of its own keeps the
// previous group's, and it reads the conditions before the action, which is
// the order the two messages arrive in.  Each accepted group becomes one rule
// in the port's single status_hilites array, standing for the bits C sets in
// gc.cond_hilites[].
function parse_condition(result, s, fieldIndex) {
    let sidx = fieldIndex + 1;
    let coloridx = NO_COLOR;
    let accepted = false; /* C's `result` */
    const fieldAt = (index) => statusHiliteField(
        result, s, index, "Unknown condition ''",
    );

    if (!fieldAt(sidx)) {
        configErrorAdd(result, 'Missing condition(s)');
        return false;
    }
    while (fieldAt(sidx)) {
        const conditions = str2conditionbitmask(
            result, fieldAt(sidx),
        );
        if (!conditions) return false;

        /* actions */
        sidx += 1;
        const how = fieldAt(sidx);
        if (!how) {
            configErrorAdd(result, 'Missing color+attribute');
            return false;
        }
        // C sets and clears bits of gc.cond_hilites[] directly, one array
        // entry per attribute, and those entries outlive the group: "none"
        // clears the six of them for these conditions, including bits an
        // earlier statement set, and a name after it sets one again.  The
        // port replays that at render time from the pair recorded here --
        // `clearAttributes` for the &= ~mask sweep, `attrib` for the |= mask
        // bits that survived it -- so the loop below has to keep the two in
        // the order the subfields arrive.
        let attrib = HL_UNDEF;
        let clearAttributes = false;
        // C has no `sf < 1` guard here, so a split it refuses leaves the color
        // and the attributes at whatever the group before this one left.
        for (const subfield of splitsubfields(how) ?? []) {
            const parsedAttr = statusHiliteAttribute(menuHeadingToken(subfield));
            if (parsedAttr != null) {
                if (parsedAttr === HL_NONE) {
                    attrib = HL_UNDEF;
                    clearAttributes = true;
                } else {
                    attrib |= parsedAttr;
                }
                continue;
            }
            const color = match_str2clr(result, subfield, false);
            // Unlike parse_status_hl2(), this loop has no "one color only"
            // rule: the last color named wins.
            if (color >= CLR_MAX) {
                configErrorAdd(result, `bad color ${color}`);
                // Every attribute subfield ahead of this one has already
                // reached gc.cond_hilites[], and those entries are indexed
                // past CLR_MAX, so the only write C skips is
                // `gc.cond_hilites[coloridx] |= conditions_bitmask` below the
                // loop.  A null color records that skip: the group keeps its
                // attributes and contributes no color index for condcolor()
                // to find.  A group that reached no attribute subfield first
                // wrote nothing at all, and gets no rule.
                if (attrib !== HL_UNDEF || clearAttributes) {
                    pushConditionRule(result, conditions, {
                        attrib, clearAttributes, color: null,
                    });
                }
                return false;
            }
            coloridx = color;
        }
        pushConditionRule(result, conditions, {
            attrib, clearAttributes, color: coloridx,
        });
        accepted = true;
        sidx += 1;
    }
    return s[STATUS_HILITE_BOUNDARY_ERROR] ? false : accepted;
}

// C ref: botl.c is_ltgt_percentnumber() (2649-2669), the
// "[<>]?=?[-+]?[0-9]+%?" predicate, together with the pieces
// parse_status_hl2() reads back out of the same string afterwards: the
// comparison prefix, the trailing '%', and the signed digits stripchars()
// leaves behind.  Null is the predicate's FALSE.
function is_ltgt_percentnumber(str) {
    const match = /^([<>]=?|=)?([+-]?\d+)(%)?$/u.exec(str);
    if (!match) return null;
    const operator = match[1] ?? '';
    return {
        percent: match[3] === '%',
        lt: operator === '<',
        le: operator === '<=',
        grt: operator === '>',
        gte: operator === '>=',
        value: Number.parseInt(match[2], 10),
    };
}

// C ref: botl.c has_ltgt_percentnumber() (2671-2683), which only chooses
// between two messages.
function has_ltgt_percentnumber(str) {
    return [...str].every((character) => '<>=-+0123456789%'.includes(character));
}

// C ref: botl.c parse_status_hl2() (2811-3106).  `s` is parse_status_hl1()'s
// split of one statement into a field name followed by threshold and action
// pairs.  Every group it accepts is installed before the next one is read, so
// C's closing `return (successes > 0)` is observable: a statement that fails
// on its third group keeps the two groups before it.
function parse_status_hl2(result, s) {
    let sidx = 0;
    const fieldAt = (index) => statusHiliteField(
        result, s, index, "Unknown behavior ''",
    );
    const field = statusHiliteFieldName(fieldAt(sidx));

    if (field === 'characteristics') {
        // C rewrites s[0] in place and re-enters once per characteristic, so
        // every threshold in the statement is parsed six times.
        for (const target of STATUS_CHARACTERISTIC_FIELDS) {
            s[sidx] = target;
            if (!parse_status_hl2(result, s)) return false;
        }
        return true;
    }
    if (!field) {
        configErrorAdd(
            result, `Unknown status field '${fieldAt(sidx)}'`,
        );
        return false;
    }
    if (field === 'condition') return parse_condition(result, s, sidx);

    const fieldType = STATUS_HILITE_FIELDS[field];
    // C ref: is_fld_arrayvalues() over enc_stat[] for BL_CAP and hutxt[] for
    // BL_HUNGER, both compared with strcmpi() rather than fuzzymatch().  Its
    // third caller, aligntxt[] for BL_ALIGN, needs no table: alignment is a
    // string field, so the same spellings reach the ANY_STR arm below and
    // store the same text.
    const textThresholds = Object.hasOwn(STATUS_TEXT_THRESHOLDS, field)
        ? STATUS_TEXT_THRESHOLDS[field] : null;
    let successes = 0;

    sidx += 1;
    while (fieldAt(sidx)) {
        const threshold = fieldAt(sidx);
        const numericThreshold = is_ltgt_percentnumber(threshold);
        let text = '';
        let percent = false;
        let numeric = false;
        let always = false;
        let changed = false;
        let up = false;
        let down = false;
        let criticalhp = false;
        let lt = false;
        let le = false;
        let grt = false;
        let gte = false;
        let txtval = false;
        let value = null;

        const nextField = fieldAt(sidx + 1);
        if (!nextField || threshold === 'always') {
            /* "field/always/color" OR "field/color" */
            always = true;
            // The short spelling steps back so that the action is read out of
            // this same slot, which is why an even number of groups ends as an
            // "always" rule rather than as an error.
            if (!nextField) sidx -= 1;
        } else if (threshold === 'up' || threshold === 'down') {
            // "LT/GT for the string fields is pointless; treat 'up' or 'down'
            // for string fields as 'changed' rather than rejecting them".
            if (fieldType !== 'string') {
                if (threshold === 'down') down = true;
                else up = true;
            }
            changed = true;
        } else if (textThresholds && Object.hasOwn(textThresholds, threshold)) {
            text = textThresholds[threshold];
            txtval = true;
        } else if (threshold === 'changed') {
            changed = true;
        } else if (field === 'hitpoints' && threshold === 'criticalhp') {
            criticalhp = true;
        } else if (numericThreshold) {
            ({ percent, lt, le, grt, gte, value } = numericThreshold);
            numeric = true;
            // C's dt: a percentage is compared as an int whatever type the
            // field itself has, which is how a percentage on a string field
            // reaches this range check before the one below refuses it.
            const dt = percent ? 'int' : fieldType;
            const op = grt ? '>' : gte ? '>=' : lt ? '<' : le ? '<=' : '=';
            if (dt === 'int'
                // "AC is the only field where negative values make sense but
                // accept >-1 for other fields; reject <0 for non-AC"
                && (value < (field === 'armor-class' ? -128
                    : grt ? -1 : lt ? 1 : 0)
                    || value > (percent ? (lt ? 101 : 100) : LARGEST_INT))) {
                configErrorAdd(
                    result,
                    `hilite_status threshold '${op}${value}`
                    + `${percent ? '%' : ''}' is out of range`,
                );
                return false;
            }
            if (dt === 'long' && value < (grt ? -1 : lt ? 1 : 0)) {
                configErrorAdd(
                    result,
                    `hilite_status threshold '${op}${value}' is out of range`,
                );
                return false;
            }
        } else if (fieldType === 'string') {
            text = threshold;
            txtval = true;
        } else {
            configErrorAdd(result, has_ltgt_percentnumber(threshold)
                ? `Wrong format '${threshold}', expected a threshold number`
                    + ' or percent'
                : `Unknown behavior '${threshold}'`);
            return false;
        }

        // C ref: botl.c:2966-2978, hilite.rel.  The status renderer reads it
        // only for the two numeric behaviors, so this keeps the numeric
        // relation and spells C's LT_VALUE for 'always' and 'criticalhp' and
        // its TXT_VALUE for a text match as the '=' the rest carry.
        const relation = (grt || up) ? '>' : (lt || down) ? '<'
            : gte ? '>=' : le ? '<=' : '=';

        if (fieldType === 'string' && (percent || numeric)) {
            configErrorAdd(
                result,
                `Field '${statusHiliteFieldCName(field)}' does not support`
                + ' numeric values',
            );
            return false;
        }
        if (percent) {
            // initblstats[fld].idxmax is set only by INIT_BLSTATP, the four
            // rows that name a maximum to take the percentage of.
            if (!STATUS_PERCENT_FIELDS.has(field)) {
                configErrorAdd(
                    result,
                    `Cannot use percent with '${statusHiliteFieldCName(field)}'`,
                );
                return false;
            }
            // C ref: botl.c:2996-3006.  Two of its six tests compare
            // hilite.value.a_int against a relationship constant where
            // hilite.rel was meant, so -1 and 101 are refused whatever the
            // relationship is; the bounds above keep every other combination
            // out before this runs.
            if (value <= -1
                || (value === 0 && relation === '<')
                || (value === 100 && relation === '>')
                || value >= 101) {
                configErrorAdd(
                    result,
                    'hilite_status: invalid percentage value'
                    + ` '${relation}${value}%'`,
                );
                return false;
            }
        }

        /* actions */
        sidx += 1;
        // C ref: botl.c:3013-3016.  Its `if (!how)` tests an array element
        // that is never null, so the `successes` arm below it is unreachable.
        const action = fieldAt(sidx);
        const style = parseStatusHiliteAction(result, action);
        if (!style) return false;

        // C ref: botl.c:3068-3089, hilite.behavior.  Its closing BL_TH_NONE is
        // unreachable, because every arm of the threshold chain above sets one
        // of the flags this reads.
        const behavior = always ? 'always'
            : percent ? 'percentage'
                : changed ? 'changed'
                    : numeric ? 'absolute'
                        : txtval ? 'text'
                            : criticalhp ? 'critical' : 'none';

        result.iflags.status_hilites.push({
            field,
            behavior,
            relation,
            value,
            // C copies txt into hilite.textmatch[MAXVALWIDTH], terminates its
            // last byte, then ignores trimspaces()'s returned pointer.  The
            // buffer therefore keeps leading blanks but loses trailing ones.
            text: behavior === 'text'
                ? trimspacesIgnoredReturn(
                    truncateByteString(text, MAXVALWIDTH - 1),
                )
                : '',
            style,
        });
        successes += 1;
        sidx += 1;
    }

    return s[STATUS_HILITE_BOUNDARY_ERROR] ? false : successes > 0;
}

// C ref: botl.c parse_status_hl1() (2591-2647).  It cuts one hilite_status
// value into space-separated statements and each statement into '/'-separated
// groups, handing every statement to parse_status_hl2().  The first statement
// that fails abandons the rest of the value, and the default highlight
// duration is stored only when none failed.
function parse_status_hl1(result, op) {
    // `op` is a char pointer in C.  Its component limit and pointer walk are
    // byte-based, including a cut through the middle of a UTF-8 sequence.
    // Keep the groups as bytes until parse_status_hl2() reads them so the
    // repository's reversible decoder preserves such a cut.
    const opBytes = encodeUtf8ByteString(op);
    const hsbufBytes = Array.from({ length: MAX_THRESH }, () => []);
    let badopt = false;
    let fldnum = 0;
    let ccount = 0;
    let index = 0;

    const parsedFields = () => hsbufBytes.map(decodeUtf8ByteString);
    const parseFields = () => parse_status_hl2(result, parsedFields());
    while (index < opBytes.length
           && fldnum < MAX_THRESH && ccount < QBUFSZ - 2) {
        const sourceByte = opBytes[index];
        const c = sourceByte >= 0x41 && sourceByte <= 0x5A
            ? sourceByte | 0x20 : sourceByte;
        if (c === 0x20) {
            if (fldnum >= 1) {
                if (fldnum === 1
                    && decodeUtf8ByteString(hsbufBytes[0]) === 'title') {
                    /* spaces are allowed in title */
                    hsbufBytes[fldnum].push(c);
                    ccount += 1;
                    index += 1;
                    continue;
                }
                if (!parseFields()) {
                    badopt = true;
                    break;
                }
            }
            for (const field of hsbufBytes) field.length = 0;
            fldnum = 0;
            ccount = 0;
        } else if (c === 0x2F) {
            fldnum += 1;
            ccount = 0;
        } else {
            hsbufBytes[fldnum].push(c);
            ccount += 1;
        }
        index += 1;
    }
    // fldnum counts the '/' separators seen, so a value carrying none is
    // accepted without parse_status_hl2() ever running.
    if (fldnum >= 1 && !badopt && !parseFields()) {
        badopt = true;
    }
    if (badopt) return false;
    /* make sure highlighting is On; use short duration for temp highlights */
    if (!result.iflags.hilite_delta) result.iflags.hilite_delta = 3;
    return true;
}

// C ref: botl.c clear_status_hilites() (3349-3366).  It empties each field's
// threshold list and nothing else, so gc.cond_hilites[] survives; the
// condition rules this port keeps in the same array have to survive with it.
function clear_status_hilites(result) {
    result.iflags.status_hilites = result.iflags.status_hilites.filter(
        (rule) => rule.field === 'condition',
    );
}

// C ref: options.c optfn_hilite_status() (1851-1893), the do_set arm.  Its
// value comes from string_for_opt(opts, TRUE), so a statement with no ':' and
// one with nothing after it both arrive as C's empty_optstr; parseoptions()
// has already stripped the blanks around the element.
function setStatusHiliteOption(result, value, negated) {
    const op = value == null || value === '' ? null : value;
    if (op !== null && negated) {
        clear_status_hilites(result);
        return;
    }
    if (op === null) {
        configErrorAdd(result, 'Value is mandatory for hilite_status');
        return;
    }
    // parse_status_hl1()'s FALSE is optn_err, which parseoptions() answers by
    // returning without a message of its own.
    parse_status_hl1(result, op);
}

function setStatusHiliteDuration(result, value, negated) {
    if (negated) {
        result.iflags.hilite_delta = 0;
        return;
    }
    const parsed = value == null || value === ''
        ? 3 : Number.parseInt(value, 10) || 0;
    result.iflags.hilite_delta = parsed < 0 ? 1 : parsed;
}

// C ref: options.c optfn_menu_headings() (2182-2212), its do_set arm.  The
// handler reads the value parseoptions() already found, so a statement without
// one is not an error at all: it means "no colour and inverse", or "no colour
// and no attribute" when negated.  optlist.h gives menu_headings negateok Yes,
// so the negation arms below are the live ones, unlike petattr's beneath.
// color_attr_parse_str() reports everything C says about a value it cannot
// read, and the handler adds nothing to it.
function setMenuHeadings(result, value, negated) {
    if (value == null || value === '') {
        result.iflags.menu_headings = {
            attr: negated ? ATR_NONE : ATR_INVERSE,
            color: NO_COLOR,
        };
        return;
    }
    if (negated) { /* 'op != empty_optstr' to get here */
        bad_negation(result, 'menu_headings');
        return;
    }
    const ca = color_attr_parse_str(result, value);
    if (ca === null) return;
    result.iflags.menu_headings = ca;
}

// C ref: options.c set_menuobjsyms_flags() (7446-7451).  The numeric mode is
// the sole stored option value; the other two fields are its execution flags.
function set_menuobjsyms_flags(result, newobjsyms) {
    result.iflags.menuobjsyms = newobjsyms;
    result.iflags.menu_head_objsym = (newobjsyms & 1) !== 0;
    result.iflags.use_menu_glyphs = (newobjsyms & (2 | 4)) !== 0;
}

// C ref: options.c optfn_menu_objsyms() (2225-2287), its startup do_set arm.
// The interactive handler remains outside this startup slice; get_val reads
// the numeric field through OPTION_VALUE_HANDLERS below.
function optfn_menu_objsyms(result, statement, value, negated) {
    let osyms;
    if (negated) {
        osyms = 0;
    } else if (value == null || value === '') {
        // C checks the original spelling case-sensitively after its
        // case-insensitive alias match.  Preserve that quirk for the obsolete
        // alias instead of checking the canonical name chosen by the parser.
        osyms = statement.startsWith('use_menu_glyphs') ? 2 : 1;
    } else if (/^[0-9]/u.test(value)) {
        const parsed = atoi(value);
        if (parsed >= objsymvals.length) {
            configErrorAdd(
                result, `Illegal menu_objsyms parameter '${value}'`,
            );
            return;
        }
        osyms = parsed;
    } else {
        const alternate = 'one-or-the-other';
        osyms = 0;
        for (let index = 0; index < objsymvals.length; ++index) {
            const canonical = objsymvals[index];
            const width = value.length >= 4
                ? value.length : canonical.length;
            if (equal_ncasechars(canonical, value, width)
                || (index === 5
                    && equal_ncasechars(
                        alternate, value, alternate.length,
                    ))) {
                osyms = index;
                break;
            }
        }
    }
    set_menuobjsyms_flags(result, osyms);
}

// C ref: options.c optfn_menuinvertmode() (2290-2317), its startup do_set
// arm.  The do_init request is a no-op; initoptions_init() has already stored
// the default 1 in defaultResult().  string_for_opt(opts, TRUE) makes a bare
// statement and an empty value the same empty_optstr, so both leave that value
// unchanged.  optlist.h gives this row negateok No, which means parseoptions()
// rejects negation before this function runs.
function optfn_menuinvertmode(result, value) {
    if (value == null || value === '') return;
    const mode = atoi(value);
    if (mode < 0 || mode > 2) {
        configErrorAdd(
            result, `Illegal menuinvertmode parameter '${value}'`,
        );
        return;
    }
    result.iflags.menuinvertmode = mode;
}

// C ref: options.c optfn_petattr() (3137-3175), its do_set arm.  The tty port
// accepts one text attribute and keeps the chosen style when hilite_pet is
// later disabled.  optlist.h:568-569 gives petattr negateok No, so
// parseoptions() answers a negated spelling with bad_negation() and both of the
// handler's negation arms -- its own bad_negation() and the ATR_NONE a
// value-less negation would store -- are unreachable from a configuration file.
//
// What is left of C's val_optional argument is therefore FALSE, which makes the
// value mandatory: a statement without one is reported by string_for_opt() and
// then falls past both remaining arms to the hilite_pet assignment, which
// nothing has changed.  The rejection arm names the whole statement rather than
// the value, because C passes `opts` there where its neighbours pass `op`.
function setPetAttribute(result, statement) {
    const op = string_for_opt(statement, false, result);
    let rejected = false;
    if (op !== '') {
        // match_str2attr(op, FALSE) reports nothing itself.
        const attr = match_str2attr(result, op, false);
        if (attr === null) {
            configErrorAdd(
                result, `Unknown petattr parameter '${statement}'`,
            );
            rejected = true;
        } else {
            result.iflags.wc2_petattr = attr;
        }
    }
    if (!rejected) {
        result.iflags.wc_hilite_pet = result.iflags.wc2_petattr !== ATR_NONE;
    }
}

// C refs: options.c default_menu_cmd_info[], txt2key(),
// illegal_menu_cmd_key(), and add_menu_cmd_alias().
const MENU_COMMAND_OPTIONS = Object.freeze([
    { name: 'menu_next_page', command: '>' },
    { name: 'menu_previous_page', command: '<' },
    { name: 'menu_first_page', command: '^' },
    { name: 'menu_last_page', command: '|' },
    { name: 'menu_select_all', command: '.' },
    { name: 'menu_invert_all', command: '@' },
    { name: 'menu_deselect_all', command: '-' },
    { name: 'menu_select_page', command: ',' },
    { name: 'menu_invert_page', command: '~' },
    { name: 'menu_deselect_page', command: '\\' },
    { name: 'menu_search', command: ':' },
    { name: 'menu_shift_right', command: '}' },
    { name: 'menu_shift_left', command: '{' },
]);

// C walks default_menu_cmd_info[] with strcmp(), so only the thirteen names
// above can match.  A Map answers for those thirteen alone; a plain object
// would also answer for every name Object.prototype carries, and rc text is
// free to spell "constructor".
const MENU_COMMAND_BY_NAME = new Map(
    MENU_COMMAND_OPTIONS.map(({ name, command }) => [name, command]),
);

// C ref: cmd.c spkeys_binds[]. These names update prompt/navigation keys,
// not the extended-command binding list queried by nh.eckey().
const SPECIAL_KEY_COMMANDS = new Set([
    'getdir.self',
    'getdir.self2',
    'getdir.help',
    'getdir.mouse',
    'count',
    'getpos.self',
    'getpos.pick',
    'getpos.pick.quick',
    'getpos.pick.once',
    'getpos.pick.verbose',
    'getpos.valid',
    'getpos.autodescribe',
    'getpos.mon.next',
    'getpos.mon.prev',
    'getpos.obj.next',
    'getpos.obj.prev',
    'getpos.door.next',
    'getpos.door.prev',
    'getpos.unexplored.next',
    'getpos.unexplored.prev',
    'getpos.valid.next',
    'getpos.valid.prev',
    'getpos.all.next',
    'getpos.all.prev',
    'getpos.help',
    'getpos.filter',
    'getpos.moveskip',
    'getpos.menu',
]);

const DEFAULT_OBJECT_CLASS_SYMBOLS = new Set([
    ']', ')', '[', '=', '"', '(', '%', '!', '?', '+', '/', '$', '*', '`',
    '0', '_', '.',
]);

function menuCommandOption(name) {
    // parseoptions() initially accepts unambiguous prefixes, but
    // shared_menu_optfn() calls check_misc_menu_command(), which requires
    // the complete canonical name. Preserve that handler-level quirk.
    return MENU_COMMAND_OPTIONS.find(
        ({ name: canonical }) => canonical === name,
    ) ?? null;
}

function isMenuCommandPrefix(name) {
    return MENU_COMMAND_OPTIONS.some(
        ({ name: canonical }) => canonical !== name
            && canonical.startsWith(name),
    );
}

function byteOf(character) {
    return character.charCodeAt(0) & 0xFF;
}

function metaByte(byte) {
    return (byte | 0x80) & 0xFF;
}

function firstEscapedByte(text) {
    // escapes() only matters through its first output byte here because
    // txt2key() immediately returns tbuf[0].
    if (text.length < 2) return byteOf('\\');
    let index = 0;
    const meta = text[index] === '\\'
        && (text[index + 1] === 'm' || text[index + 1] === 'M')
        && index + 2 < text.length;
    if (meta) index += 2;

    let value;
    const current = text[index];
    const next = text[index + 1];
    if ((current !== '\\' && current !== '^') || next === undefined) {
        value = byteOf(current);
    } else if (current === '^') {
        value = byteOf(next) & 0x1F;
    } else if (next >= '0' && next <= '9') {
        const match = text.slice(index + 1).match(/^\d{1,3}/u);
        value = Number.parseInt(match[0], 10) & 0xFF;
    } else if ((next === 'o' || next === 'O')
        && /[0-7]/u.test(text[index + 2] ?? '')) {
        const match = text.slice(index + 2).match(/^[0-7]{1,3}/u);
        value = Number.parseInt(match[0], 8) & 0xFF;
    } else if ((next === 'x' || next === 'X')
        && /[0-9a-f]/iu.test(text[index + 2] ?? '')) {
        const match = text.slice(index + 2).match(/^[0-9a-f]{1,2}/iu);
        value = Number.parseInt(match[0], 16) & 0xFF;
    } else {
        const escaped = {
            '\\': '\\',
            n: '\n',
            t: '\t',
            b: '\b',
            r: '\r',
        }[next] ?? next;
        value = byteOf(escaped);
    }
    return meta ? metaByte(value) : value;
}

// C ref: options.c txt2key() (6970-7067).  It opens on trimspaces(), so both
// halves apply to the text it reads; only the trailing half is visible to a
// caller that keeps the buffer it passed in.
function textToKey(text) {
    let value = trimspaces(text);
    if (!value) return 0;
    if (value.length === 1) return byteOf(value);
    if (value === '<enter>') return 10;
    if (value === '<space>') return 32;
    if (value === '<esc>') return 27;
    if (value[0] === '\\') return firstEscapedByte(value);

    let meta = false;
    if (value[0].toUpperCase() === 'M') {
        value = value.slice(1);
        if (value[0] === '-' && value.length > 1) value = value.slice(1);
        if (value.length === 1) return metaByte(byteOf(value));
        meta = true;
    }
    if (value[0] === '^' || value[0]?.toUpperCase() === 'C') {
        const original = value[0];
        if (value.length === 1) {
            const byte = byteOf(original);
            return meta ? metaByte(byte) : byte;
        }
        value = value.slice(1);
        if (value[0] === '-' && value.length > 1) value = value.slice(1);
        const byte = value[0] === '?' ? 127 : byteOf(value[0]) & 0x1F;
        return meta ? metaByte(byte) : byte;
    }
    if (meta && value) return metaByte(byteOf(value));

    if (/^\d{3}/u.test(value)) {
        return Number.parseInt(value.slice(0, 3), 10) & 0xFF;
    }
    return 0;
}

// C ref: options.c illegal_menu_cmd_key().  Each of its two rejecting arms
// reports its own configuration error before answering TRUE, so a caller adds
// only whatever message it owes on top of this one.
function illegalMenuCommandKey(result, key) {
    const ch = String.fromCharCode(key);
    const sourceLetter = (key >= 64 && key <= 90)
        || (key >= 97 && key <= 122);
    if (key === 0 || key === 10 || key === 13 || key === 27 || key === 32
        || (key >= 48 && key <= 57) || (sourceLetter && key !== 64)) {
        configErrorAdd(result, `Reserved menu command key '${visctrl(key)}'`);
        return true;
    }
    // The comment above illegal_menu_cmd_key() also lists '#', but the
    // executable source omits it. Preserve that upstream quirk.
    if (DEFAULT_OBJECT_CLASS_SYMBOLS.has(ch)) {
        configErrorAdd(
            result, `Menu command key '${visctrl(key)}' is an object class`,
        );
        return true;
    }
    return false;
}

function addMenuCommandAlias(result, fromKey, command) {
    if (result.iflags.mapped_menu_cmds.length >= 32) return;
    result.iflags.mapped_menu_cmds += String.fromCharCode(fromKey);
    result.iflags.mapped_menu_op += command;
}

// C ref: options.c spcfn_misc_menu_cmd() (5451-5477), the do_set request.  Its
// own bad_negation() arm (5458-5460) is unreachable from a configuration file:
// every menu command option's optlist.h negateok is No, so parseoptions()
// answers a negated spelling before the handler runs.  The remaining two arms
// both report and leave the alias list alone: string_for_opt(opts, FALSE)
// names the whole statement when no value follows the separator, and
// illegal_menu_cmd_key() reports for itself.
function setMenuCommandOption(result, descriptor, statement) {
    const op = string_for_opt(statement, false, result);
    if (op === '') return;
    const key = textToKey(op);
    if (illegalMenuCommandKey(result, key)) return;
    addMenuCommandAlias(result, key, descriptor.command);
}

function bindingSeparator(bindings) {
    let separator = bindings.indexOf(',');
    if (separator === 0) separator = bindings.indexOf(',', 1);
    else if (separator > 0
        && (bindings[separator - 1] === '\\'
            || (bindings[separator - 1] === "'"
                && bindings[separator + 1] === "'"))) {
        separator = bindings.indexOf(',', separator + 2);
    }
    return separator;
}

// C ref: cmd.c bind_key() (2661-2728).  It strips a trailing "(param)" before
// matching extcmdlist[] case-insensitively, passes over an INTERNALCMD row so
// the loop runs out, and answers TRUE for the reserved name "nothing" without
// looking at the table at all.  A FALSE answer is what makes parsebindings()
// report an unknown command.
//
// C's matched arm has three effects, with three different owners here.
//
//  - cmdbind_add() (2694) is the caller's commandOperations push, which
//    js/command_bindings.js createCommandBindingModel() replays -- including
//    the "nothing" spelling, which it turns into the cmdbind_remove() this
//    returns TRUE for.  That push carries the whole command text, parameter
//    and all, and createCommandBindingModel() cuts it back at the first '('
//    without asking for the ')' the test below also requires.  The two agree
//    on every text that reaches the push: the looser cut can only differ over
//    a text holding a '(' that this function leaves unparenthesized, and no
//    extcmdlist[] row spells a parenthesis, so such a text matches no row and
//    is never pushed.
//  - The three parameter diagnostics (2696-2712) belong to the binding itself
//    and are here: C reports every one of them for a key it has already
//    bound, so none of them changes the answer.
//  - The bind->param store (2706-2708) is unported.  include/func_tab.h:37
//    declares that field and cmd.c dotoggleoption() (1376-1384) is its only
//    reader, through gc.cmd_bind->param at 1378-1379; `parameter` below is
//    computed for the diagnostics and then dropped.  Deferral
//    bind-key-parameter-is-not-stored covers it.
function bind_key(result, command) {
    if (command.toLowerCase() === 'nothing') return true;
    // C truncates its copy at the '(' and points p past it only when a ')'
    // follows; otherwise the copy keeps the parenthesis and matches no row.
    const opening = command.indexOf('(');
    const closing = command.lastIndexOf(')');
    const parenthesized = opening >= 0 && closing > opening;
    const name = parenthesized ? command.slice(0, opening) : command;
    const parameter = parenthesized
        ? command.slice(opening + 1, closing) : null;
    const row = extcmdlist.find((entry) => (
        entry.ef_txt.toLowerCase() === name.toLowerCase()
        && (entry.flags & INTERNALCMD) === 0
    ));
    if (!row) return false;

    if ((row.flags & CMD_PARAM) !== 0) {
        if (parameter == null) {
            configErrorAdd(result, `'${name}' requires a parameter`);
        } else if (!parameter) {
            // C's guard is min(30, strlen(p)) + 1 <= 1, which only an empty
            // parameter satisfies; the 30 is the length it stores.
            configErrorAdd(result, 'Required parameter cannot be empty');
        }
    } else if (parameter) {
        configErrorAdd(result, `'${name}' does not take a parameter`);
    }
    return true;
}

// C ref: options.c parsebindings() mousebtn_names[] (7602-7604).  strcmp()
// compares the key text against these two case-sensitively.
const MOUSE_BUTTON_NAMES = Object.freeze(['mouse1', 'mouse2']);

// C ref: cmd.c bind_mousebtn() (2623-2659).  Only its answer is ported: the
// button it stores into gc.Cmd.mousebtn[] has no reader in this port, and its
// "Wrong mouse button" arm cannot fire from parsebindings(), whose loop runs
// over exactly the two valid buttons.  The reserved name "nothing" is accepted
// without consulting the table.  Unlike bind_key() this does not pass over an
// INTERNALCMD row, so all three MOUSECMD rows -- therecmdmenu, clicklook and
// mouseaction -- bind, and a name that matches a row without MOUSECMD keeps
// the loop running and so answers FALSE.
function bind_mousebtn(command) {
    if (command.toLowerCase() === 'nothing') return true;
    return extcmdlist.some((entry) => (
        entry.ef_txt.toLowerCase() === command.toLowerCase()
        && (entry.flags & MOUSECMD) !== 0
    ));
}

// C ref: options.c parsebindings() (7595-7674) from its ':' split onwards.
// The four candidates are tried in C's order: a mouse-button name, a special
// key, a menu command, then an extended command.
function applyMenuBinding(result, binding) {
    const colon = binding.indexOf(':');
    if (colon < 0) return;
    const rawKeyText = binding.slice(0, colon);
    const commandName = trimspaces(binding.slice(colon + 1));
    // C ref: parsebindings():7635-7641.  Only the accepting arm returns; a
    // rejected command reports and falls out of the loop into the txt2key()
    // below, which reads "mouse1" and "mouse2" alike as M-o.  The comparison
    // runs before txt2key() has trimmed anything, so it sees the padding the
    // key text still carries and " mouse1" is not a button name.
    for (const [index, name] of MOUSE_BUTTON_NAMES.entries()) {
        if (rawKeyText === name) {
            if (bind_mousebtn(commandName)) return;
            configErrorAdd(
                result, `Error binding mouse button ${index + 1}`,
            );
        }
    }
    // txt2key() opens on trimspaces(), whose trailing half writes into the
    // buffer parsebindings() holds, so the message below reports the key text
    // without the blanks and with whatever leading ones it had.
    const keyText = trimspacesTrailing(rawKeyText);
    const key = textToKey(keyText);
    if (!key) {
        configErrorAdd(result, `Unknown key binding key '${keyText}'`);
        return;
    }
    if (SPECIAL_KEY_COMMANDS.has(commandName)) {
        result.commandOperations.push({
            type: 'special_key',
            key,
            command: commandName,
        });
        return;
    }
    const command = MENU_COMMAND_BY_NAME.get(commandName);
    if (command !== undefined) {
        // illegal_menu_cmd_key() has already reported which rule the key
        // broke; parsebindings() adds this second message naming the pair.
        if (illegalMenuCommandKey(result, key)) {
            configErrorAdd(
                result, `Bad menu key ${visctrl(key)}:${commandName}`,
            );
            return;
        }
        addMenuCommandAlias(result, key, command);
        return;
    }
    // parsebindings() reports whatever bind_key() would not bind and
    // leaves the key holding what it already had.
    if (!bind_key(result, commandName)) {
        configErrorAdd(
            result, `Unknown key binding command '${commandName}'`,
        );
        return;
    }
    // Keep gameplay bindings in source application order.
    // commandOperations is the authoritative stream consumed by tutorial
    // key lookup and runtime dispatch; gameplayBindings remains a
    // compatibility projection of parsed option state.
    const operation = {
        key,
        command: commandName.toLowerCase(),
    };
    result.gameplayBindings.push(operation);
    result.commandOperations.push({ type: 'bind', ...operation });
}

// C ref: the recorder's glibc atoi(), which skips leading whitespace, reads an
// optional sign and a decimal run, answers zero when there is none, saturates
// first to signed long and then narrows to a signed 32-bit int.  BigInt
// preserves that phase order across JavaScript hosts, and its digit class is
// ASCII-only, as C's is.
function atoi(str) {
    const digits = String(str).match(/^[\t\n\v\f\r ]*[+-]?\d+/u);
    let wide = digits ? BigInt(digits[0].trim().replace(/^\+/u, '')) : 0n;
    const longMax = (1n << 63n) - 1n;
    const longMin = -(1n << 63n);
    if (wide > longMax) wide = longMax;
    else if (wide < longMin) wide = longMin;
    return Number(BigInt.asIntN(32, wide));
}

// C ref: the recorder's LP64 glibc atol().  Unlike atoi(), the option handlers
// print the long result before narrowing an accepted value to int.  Keep the
// result as BigInt so overflow diagnostics retain LONG_MIN or LONG_MAX exactly.
function atol(str) {
    const digits = String(str).match(/^[\t\n\v\f\r ]*[+-]?\d+/u);
    let value = digits ? BigInt(digits[0].trim().replace(/^\+/u, '')) : 0n;
    const longMax = (1n << 63n) - 1n;
    const longMin = -(1n << 63n);
    if (value > longMax) value = longMax;
    else if (value < longMin) value = longMin;
    return value;
}

// C ref: options.c optfn_number_pad() (2573-2645), its do_set arm.  These
// fields affect cmd_from_ecname() during tutorial generation and the same
// source-ordered runtime bindings.  optlist.h:535-536 gives the option
// negateok No, so parseoptions() answers a negated spelling with
// bad_negation(); the handler's own bad_negation() and its
// `iflags.num_pad = !negated` both see a negation that cannot happen.
//
// `compat` is what decides whether a statement without a value is reported:
// C measures the whole statement and treats ten bytes or fewer as the historic
// spelling that means number_pad:1, so "number_pad" is silent while
// "number_pad:" is one byte longer and reports.  Either way the arm that
// follows sets the option, because go.opt_initial makes its guard hold.
function setNumberPadOption(result, statement) {
    const compat = encodeUtf8ByteString(statement).length <= 10;
    const op = string_for_opt(statement, compat, result);
    let enabled;
    let mode;
    if (op === '') {
        /* for backwards compatibility, "number_pad" without a
           value is a synonym for number_pad:1 */
        enabled = true;
        mode = 0;
    } else {
        const parsed = atoi(op);
        if (parsed < -1 || parsed > 4 || (parsed === 0 && op[0] !== '0')) {
            configErrorAdd(
                result, `Illegal number_pad parameter '${op}'`,
            );
            return;
        }
        enabled = parsed > 0;
        mode = parsed < 0 ? 1
            : (parsed === 2 ? 1 : parsed === 3 ? 2 : parsed === 4 ? 3 : 0);
    }
    result.iflags.num_pad = enabled;
    result.iflags.num_pad_mode = mode;
    result.commandOperations.push({
        type: 'number_pad',
        enabled,
        mode,
    });
}

// C ref: options.c optfn_runmode() (3626-3670). Its four names are matched
// with str_start_is(name, value, TRUE), so any nonempty prefix of a name
// selects it and the first match in this order wins.
const RUNMODE_NAMES = Object.freeze([
    ['teleport', RUN_TPORT],
    ['run', RUN_LEAP],
    ['walk', RUN_STEP],
    ['crawl', RUN_CRAWL],
]);

// The negation is tested before the value, so "!runmode:walk" is a teleport
// run rather than a bad_negation(); the handler reads the value parseoptions()
// already found and reports a missing one in its own words rather than through
// string_for_opt().
function setRunmode(result, value, negated) {
    if (negated) {
        result.flags.runmode = RUN_TPORT;
        return;
    }
    if (value == null || value === '') {
        configErrorAdd(result, 'Value is mandatory for runmode');
        return;
    }
    const match = RUNMODE_NAMES.find(
        ([name]) => str_start_is(name, value, true),
    );
    if (!match) {
        configErrorAdd(result, `Unknown runmode parameter '${value}'`);
        return;
    }
    result.flags.runmode = match[1];
}

// C ref: options.c optfn_scores() (3669-3760), its complete do_set arm.
// string_for_opt(opts, FALSE) makes the value mandatory and leaves all three
// fields alone when it is absent. Every entered handler resets the fields,
// then walks its tokens left to right. A token accepts one optional inner
// negation, a decimal count that defaults to 1, and any alphabetic suffix
// after the significant t, a, o, or n initial.
function optfn_scores(result, statement) {
    const op = string_for_opt(statement, false, result);
    if (op === '') return;

    result.flags.end_top = 0;
    result.flags.end_around = 0;
    result.flags.end_own = false;

    let index = 0;
    while (index < op.length) {
        let inum = 1;
        const negated = op[index] === '!'
            || equal_ncasechars(op.slice(index), 'no', 2);
        if (negated) {
            index += op[index] === '!'
                ? 1 : (op[index + 2] !== '-' ? 2 : 3);
        }

        if (/^[0-9]$/u.test(op[index] ?? '')) {
            inum = atoi(op.slice(index));
            while (/^[0-9]$/u.test(op[index] ?? '')) ++index;
        }
        while (op[index] === ' ') ++index;

        const initial = lowc(op[index] ?? '');
        if (initial === 't') {
            result.flags.end_top = negated ? 0 : inum;
        } else if (initial === 'a') {
            result.flags.end_around = negated ? 0 : inum;
        } else if (initial === 'o') {
            result.flags.end_own = !(negated || inum === 0);
        } else if (initial === 'n') {
            result.flags.end_top = 0;
            result.flags.end_around = 0;
            result.flags.end_own = false;
        } else if (initial === '-'
                   && /^[0-9]$/u.test(op[index + 1] ?? '')) {
            configErrorAdd(
                result,
                'Values for scores:top and scores:around must not be negative',
            );
            return;
        } else {
            configErrorAdd(
                result, `Unknown scores parameter '${op.slice(index)}'`,
            );
            return;
        }

        while (letter(op[index] ?? '')) ++index;
        while (op[index] === ' ') ++index;
        if (op[index] === '/') ++index;
    }
}

// C ref: options.c optfn_scroll_amount() and optfn_scroll_margin()
// (3763-3821), their do_set arms.  Both accept any atoi() result without a
// range check.  A bare negation supplies the source's nonzero fallback; a
// negation carrying a value reports and preserves the previous field.
function setScrollOption(
    result, statement, negated, name, field, negatedDefault,
) {
    const op = string_for_opt(statement, negated, result);
    if ((negated && op === '') || (!negated && op !== '')) {
        result.iflags[field] = negated ? negatedDefault : atoi(op);
    } else if (negated) {
        bad_negation(result, name);
    }
}

function optfn_scroll_amount(result, statement, negated) {
    setScrollOption(
        result, statement, negated,
        'scroll_amount', 'wc_scroll_amount', 1,
    );
}

function optfn_scroll_margin(result, statement, negated) {
    setScrollOption(
        result, statement, negated,
        'scroll_margin', 'wc_scroll_margin', 5,
    );
}

// C ref: options.c optfn_soundlib() (3824-3860), its startup do_set arm.
// string_for_env_opt() requires a value.  Every nonempty spelling reaches
// sounds.c soundlib_id_from_opt(), whose exact match silently falls back to
// nosound in this build's one-entry soundlib_choices[] table.
function optfn_soundlib(result, statement) {
    const op = string_for_env_opt(statement, false, result);
    if (op === '') return;
    const optionId = soundlib_id_from_opt(op);
    result.gc.chosen_soundlib = optionId;
    assign_soundlib(result, result.gc.chosen_soundlib);
}

// C ref: options.c optfn_tile_height() and optfn_tile_width() (4354-4415),
// their do_set arms.  A non-negated value stores unrestricted atoi() output,
// while a bare negation resets the dimension to zero.  Missing positive
// values and valued negations report their source diagnostics and preserve
// the previous field.
function setTileDimension(result, statement, negated, name, field) {
    const op = string_for_opt(statement, negated, result);
    if ((negated && op === '') || (!negated && op !== '')) {
        result.iflags[field] = negated ? 0 : atoi(op);
    } else if (negated) {
        bad_negation(result, name);
    }
}

function optfn_tile_height(result, statement, negated) {
    setTileDimension(
        result, statement, negated, 'tile_height', 'wc_tile_height',
    );
}

function optfn_tile_width(result, statement, negated) {
    setTileDimension(
        result, statement, negated, 'tile_width', 'wc_tile_width',
    );
}

// C ref: options.c optfn_vary_msgcount() (4440-4467), its do_set arm.
// optlist.h rejects negation before this handler, so the live startup path
// requires a value and stores its unrestricted atoi() result.  Keep the
// source's unreachable negation arms here with the function they belong to.
function optfn_vary_msgcount(result, statement, negated) {
    const op = string_for_opt(statement, negated, result);
    if ((negated && op === '') || (!negated && op !== '')) {
        result.iflags.wc_vary_msgcount = negated ? 0 : atoi(op);
    } else if (negated) {
        bad_negation(result, 'vary_msgcount');
    }
}

// C ref: options.c optfn_term_cols() and optfn_term_rows() (4239-4329),
// their startup do_set arms.  optlist.h rejects negation before either
// handler.  A positive value is mandatory, parsed by LP64 atol(), and valid
// only below LARGEST_INT; rejected values preserve the installed dimension.
function setTermSize(result, statement, name, field) {
    const op = string_for_opt(statement, false, result);
    if (op === '') return;
    const value = atol(op);
    if (value <= 0n || value >= BigInt(LARGEST_INT)) {
        configErrorAdd(result, `Invalid ${name}: ${value}`);
        return;
    }
    result.iflags[field] = Number(value);
}

function optfn_term_cols(result, statement) {
    setTermSize(result, statement, 'term_cols', 'wc2_term_cols');
}

function optfn_term_rows(result, statement) {
    setTermSize(result, statement, 'term_rows', 'wc2_term_rows');
}

// C ref: options.c optfn_align_message() and optfn_align_status()
// (923-1020), their startup do_set arms.  Each value must begin with one
// complete alignment word, compared without case, and may carry any suffix.
// Missing or rejected values preserve the preceding iflags field.  The
// align_message row admits negation through parseoptions() and rejects it
// here; align_status has negateok No, so applyOption() rejects it first.
const WINDOW_ALIGNMENTS = Object.freeze([
    ['left', ALIGN_LEFT],
    ['top', ALIGN_TOP],
    ['right', ALIGN_RIGHT],
    ['bottom', ALIGN_BOTTOM],
]);

function setWindowAlignment(result, statement, negated, name, field) {
    const op = string_for_opt(statement, negated, result);
    if (op !== '' && !negated) {
        const matched = WINDOW_ALIGNMENTS.find(([token]) => (
            equal_ncasechars(op, token, token.length)
        ));
        if (matched) {
            result.iflags[field] = matched[1];
        } else {
            configErrorAdd(result, `Unknown ${name} parameter '${op}'`);
        }
    } else if (negated) {
        bad_negation(result, name);
    }
}

function optfn_align_message(result, statement, negated) {
    setWindowAlignment(
        result, statement, negated,
        'align_message', 'wc_align_message',
    );
}

function optfn_align_status(result, statement, negated) {
    setWindowAlignment(
        result, statement, negated,
        'align_status', 'wc_align_status',
    );
}

// C ref: options.c optfn_pickup_burden() (3266-3291), the switch its do_set
// arm runs. It reads one byte -- lowc(*op) -- so the value's remaining
// characters are never examined and "burdened" and "banana" both select
// SLT_ENCUMBER. 'o' and 't' share the overtaxed arm because "overtaxed" and
// "overloaded" cannot be told apart by their first letter; 't' is what the
// comment spells "OverTaxed".
const PICKUP_BURDEN_LEVELS = Object.freeze(new Map([
    ['u', UNENCUMBERED],
    ['b', SLT_ENCUMBER],
    ['s', MOD_ENCUMBER],
    ['n', HVY_ENCUMBER],
    ['o', EXT_ENCUMBER],
    ['t', EXT_ENCUMBER],
    ['l', OVERLOADED],
]));

// optlist.h:573 gives pickup_burden negateok No, so parseoptions() answers a
// negation with bad_negation() before the handler runs and this arrives with
// `negated` always false. The handler then reads its value with
// string_for_env_opt(name, opts, FALSE), whose mandatory parameter makes a
// spelling with no value string_for_opt()'s "Missing parameter" config error
// rather than a default, and both that and an unmatched letter return
// optn_err with flags.pickup_burden untouched.
function setPickupBurden(result, statement) {
    const op = string_for_env_opt(statement, false, result);
    if (op === '') return;
    const level = PICKUP_BURDEN_LEVELS.get(lowc(op[0]));
    if (level === undefined) {
        configErrorAdd(
            result, `Unknown pickup_burden parameter '${op}'`,
        );
        return;
    }
    result.flags.pickup_burden = level;
}

// C ref: options.c optfn_menustyle() (2320-2376), its do_set arm.  The
// handler measures the whole negation-stripped statement, not the canonical
// option name parseoptions() matched: a bare five-byte "menus" abbreviation
// therefore defaults to Full, while the full name without a value reports a
// missing parameter.  A negation makes the value optional; when one is
// present its first byte wins and the negation is otherwise ignored.
function optfn_menustyle(result, statement, negated) {
    const valRequired = encodeUtf8ByteString(statement).length > 5 && !negated;
    const op = string_for_opt(statement, !valRequired, result);
    let initial;
    if (op === '') {
        if (valRequired) return;
        initial = negated ? 'n' : 'f';
    } else {
        initial = lowc(op[0]);
    }

    const style = {
        n: MENU_TRADITIONAL,
        t: MENU_TRADITIONAL,
        c: MENU_COMBINATION,
        f: MENU_FULL,
        p: MENU_PARTIAL,
    }[initial];
    if (style === undefined) {
        configErrorAdd(result, `Unknown menustyle parameter '${op}'`);
        return;
    }
    result.flags.menu_style = style;
}

// C ref: options.c optfn_mouse_support() (2396-2452), its startup do_set
// arm.  The handler measures the whole negation-stripped statement rather
// than the canonical option name parseoptions() matched.  At most thirteen
// bytes keeps the missing value optional for backward compatibility; longer
// spellings report through string_for_opt(), then startup parsing still treats
// the empty answer as mode 1.  optlist.h rejects negation before this handler.
function optfn_mouse_support(result, statement) {
    const compat = encodeUtf8ByteString(statement).length <= 13;
    const op = string_for_opt(statement, compat, result);
    if (op === '') {
        result.iflags.wc_mouse_support = 1;
        return;
    }

    const mode = atoi(op);
    if (mode < 0 || mode > 2 || (mode === 0 && op[0] !== '0')) {
        configErrorAdd(
            result, `Illegal mouse_support parameter '${op}'`,
        );
        return;
    }
    result.iflags.wc_mouse_support = mode;
}

// C ref: options.c optfn_map_mode() (1963-2047), its startup do_set arm.
// The tiles spelling is an exact case-insensitive match.  Every other token
// is a fixed-length prefix comparison, so trailing bytes remain accepted.
// TTY does not advertise WC_MAP_MODE; startup still stores the selected mode,
// but preference_update() and the options-menu row are both unreachable.
const MAP_MODE_PREFIXES = Object.freeze([
    ['ascii4x6', MAP_MODE_ASCII4x6],
    ['ascii6x8', MAP_MODE_ASCII6x8],
    ['ascii8x8', MAP_MODE_ASCII8x8],
    ['ascii16x8', MAP_MODE_ASCII16x8],
    ['ascii7x12', MAP_MODE_ASCII7x12],
    ['ascii8x12', MAP_MODE_ASCII8x12],
    ['ascii16x12', MAP_MODE_ASCII16x12],
    ['ascii12x16', MAP_MODE_ASCII12x16],
    ['ascii10x18', MAP_MODE_ASCII10x18],
    ['fit_to_screen', MAP_MODE_ASCII_FIT_TO_SCREEN],
    ['ascii_fit_to_screen', MAP_MODE_ASCII_FIT_TO_SCREEN],
    ['tiles_fit_to_screen', MAP_MODE_TILES_FIT_TO_SCREEN],
]);

function optfn_map_mode(result, statement, negated) {
    const op = string_for_opt(statement, negated, result);
    if (op !== '' && !negated) {
        let mode;
        if (op.length === 5 && equal_ncasechars(op, 'tiles', 5)) {
            mode = MAP_MODE_TILES;
        } else {
            mode = MAP_MODE_PREFIXES.find(([name]) => (
                equal_ncasechars(op, name, name.length)
            ))?.[1];
        }
        if (mode === undefined) {
            configErrorAdd(result, `Unknown map_mode parameter '${op}'`);
            return;
        }
        result.iflags.wc_map_mode = mode;
    } else if (negated) {
        bad_negation(result, 'map_mode');
    }
}

// C ref: options.c parsebindings(). Comma-separated bindings recurse into
// their suffix, so the rightmost alias is appended first and wins collisions.
function applyMenuBindings(result, bindings) {
    const separator = bindingSeparator(bindings);
    if (separator >= 0) {
        applyMenuBindings(result, bindings.slice(separator + 1));
        applyMenuBinding(result, bindings.slice(0, separator));
    } else {
        applyMenuBinding(result, bindings);
    }
}

function applyBooleanOption(result, name, row, statement, value, negated) {
    const enabled = booleanValue(result, row, statement, value, negated);
    // The female arm and five post-write arms below can change more than the
    // option's own value, so C's "leave the option alone" has to stop ahead
    // of the whole dispatch rather than inside one of those arms.
    if (enabled === null) return;
    // A valid parameter rewrites optfn_boolean()'s local `negated`.  The map
    // post-write arms below read that effective value, not just the spelling's
    // leading ! or "no" prefix.
    const effectiveNegated = !enabled;
    if (name === 'female' || name === 'male') {
        // C ref: options.c optfn_boolean() (5244-5266), `case opt_female:`.
        // Both guards read `opts`, the whole statement, rather than the name
        // the match loop settled on, and compare max(ln, 3) of its bytes,
        // where ln is strlen(op) and op is empty_optstr for a statement that
        // carries no value.  go.opt_initial is true throughout a
        // configuration-file read, so neither nosexchange arm can fire and
        // each guard that holds writes flags.initgend beside flags.female and
        // returns.  A statement long enough to defeat both -- "male:false" is
        // the shortest -- falls past the switch to the ordinary
        // `*(allopt[optidx].addr) = !negated`, which leaves flags.initgend
        // alone.  female's optlist.h valok is No, so booleanValue() has
        // already refused every value that is not an ASCII spelling of true or
        // false and ln can be measured in characters.
        const width = Math.max(value?.length ?? 0, 3);
        if (equal_ncasechars(statement, 'female', width)) {
            result.flags.female = enabled;
            result.flags.initgend = result.gender = enabled ? 1 : 0;
            return;
        } else if (equal_ncasechars(statement, 'male', width)) {
            result.flags.female = !enabled;
            result.flags.initgend = result.gender = enabled ? 0 : 1;
            return;
        }
    }

    // options.c:5285 stores every ordinary BoolOpt through the address in its
    // allopt[] row.  The generated table keeps that lvalue, including names
    // such as fixinv -> flags.invlet_constant and accessiblemsg ->
    // a11y.accessiblemsg; no flags.<option-name> mirror exists in C.
    const { resultKey, field } = booleanOptionStorage(row.addr);
    result[resultKey][field] = enabled;

    switch (row.name.toLowerCase()) {
    case 'pauper':
        // options.c:5288-5291. Pauper implies nudist immediately, so the
        // right-to-left order of two options on one line remains observable.
        result.uroleplay.nudist = result.uroleplay.pauper;
        break;
    case 'ascii_map':
        result.iflags.wc_tiled_map = effectiveNegated;
        break;
    case 'tiled_map':
        result.iflags.wc_ascii_map = effectiveNegated;
        break;
    case 'hilite_pet':
        if (enabled && result.iflags.wc2_petattr === ATR_NONE) {
            result.iflags.wc2_petattr = ATR_INVERSE;
        }
        result.go ??= {};
        result.go.opt_need_redraw = true;
        break;
    case 'idlecheckpoint':
        // IDLECHECKPOINT is not compiled into the recorder build. pline()
        // therefore uses raw_print() this early, then the handler clears the
        // value it just wrote and suppresses later toggle messages.
        {
            const text = "There is no underlying support for"
                + " 'idlecheckpoint' compiled in.";
            result.startupEvents.push({ text });
        }
        result.iflags.idlecheckpoint = false;
        result.give_opt_msg = false;
        break;
    default:
        break;
    }

    // opt_set_in_config[opt_tutorial] is the second value this startup parser
    // exposes: ask_do_tutorial() distinguishes an explicit true setting from
    // the same compiled-in default.
    if (row.name === 'tutorial') {
        result.tutorial_set = true;
    } else if (row.name === 'rest_on_space') {
        result.commandOperations.push({
            type: 'rest_on_space',
            enabled,
        });
    } else if (row.name === 'mention_decor') {
        // C ref: options.c opt_mention_decor. A toggle forgets the terrain
        // described under the previous setting.
        result.iflags.prev_decor = STONE;
    }
}

// C ref: options.c optfn_whatis_coord() (4702-4749), its do_set arm.  The
// negation is answered before the value is read, so "!whatis_coord:map" turns
// the report off rather than reaching bad_negation(); everything past it needs
// a value, which string_for_env_opt() reports when it is missing.
function setWhatisCoord(result, statement, negated) {
    if (negated) {
        result.iflags.getpos_coords = GPCOORDS_NONE;
        return;
    }
    const op = string_for_env_opt(statement, false, result);
    if (op === '') return;
    const mode = lowc(op[0]);
    if (![GPCOORDS_NONE, GPCOORDS_COMPASS, GPCOORDS_COMFULL,
        GPCOORDS_MAP, GPCOORDS_SCREEN].includes(mode)) {
        configErrorAdd(
            result, `Unknown whatis_coord parameter '${op}'`,
        );
        return;
    }
    result.iflags.getpos_coords = mode;
}

// C ref: options.c optfn_whatis_filter() (4748-4795), its do_set arm. The
// negation returns before string_for_env_opt(), so a parameter on a negated
// statement is ignored and clears the filter without a diagnostic. Positive
// statements require a value and select from its first byte alone.
function optfn_whatis_filter(result, statement, negated) {
    if (negated) {
        result.iflags.getloc_filter = GFILTER_NONE;
        return;
    }
    const op = string_for_env_opt(statement, false, result);
    if (op === '') return;
    switch (lowc(op[0])) {
    case 'n':
        result.iflags.getloc_filter = GFILTER_NONE;
        break;
    case 'v':
        result.iflags.getloc_filter = GFILTER_VIEW;
        break;
    case 'a':
        result.iflags.getloc_filter = GFILTER_AREA;
        break;
    default:
        configErrorAdd(result, `Unknown whatis_filter parameter '${op}'`);
        break;
    }
}

// C ref: options.c optfn_windowborders() (4797-4854), its startup do_set
// arm.  string_for_opt() treats a missing or empty positive value as absent:
// it reports the missing parameter, then this handler still installs mode 1.
// A bare or empty-valued negation installs mode 0; only a negation carrying a
// nonempty value is rejected.  Values use C atoi() before the 0..4 range
// check, and an invalid value leaves the previous mode unchanged.
function optfn_windowborders(result, statement, negated) {
    const op = string_for_opt(statement, negated, result);
    if (negated && op !== '') {
        bad_negation(result, 'windowborders');
        return;
    }

    const mode = negated ? 0 : (op === '' ? 1 : atoi(op));
    if (mode < 0 || mode > 4) {
        configErrorAdd(
            result,
            `Invalid windowborders (should be within 0 to 4): ${statement}`,
        );
        return;
    }
    result.iflags.wc2_windowborders = mode;
}

// C ref: options.c:71.
const PILE_LIMIT_DFLT = 5;

// C ref: options.c optfn_pile_limit() (3403-3434), its do_set arm.  The three
// arms are a single condition read four ways: a negated statement with no
// value means "never skip", a plain statement with one stores atoi() of it, a
// negated statement that carries a value is bad_negation(), and a plain
// statement without one restores the compiled-in default -- after
// string_for_opt() has reported the missing parameter, since val_optional is
// the negation.
function setPileLimit(result, statement, negated) {
    const op = string_for_opt(statement, negated, result);
    if ((negated && op === '') || (!negated && op !== '')) {
        result.flags.pile_limit = negated ? 0 : atoi(op);
    } else if (negated) {
        bad_negation(result, 'pile_limit');
        return;
    } else { /* op == empty_optstr */
        result.flags.pile_limit = PILE_LIMIT_DFLT;
    }
    /* sanity check */
    if (result.flags.pile_limit < 0) {
        result.flags.pile_limit = PILE_LIMIT_DFLT;
    }
}

// C ref: options.c optfn_player_selection() (3438-3468), its do_set arm.
// optlist.h rejects negation before this handler.  Each accepted word is a
// six-byte case-insensitive prefix: "dialog" selects VIA_DIALOG, while
// "prompt", "prompts", "prompting", and longer prompt-prefixed values all
// select VIA_PROMPTS.  Missing and unknown values leave the previous field
// untouched after reporting their configuration error.
function optfn_player_selection(result, statement, negated) {
    const op = string_for_opt(statement, negated, result);
    if (op === '' || negated) return;

    if (equal_ncasechars(op, 'dialog', 6)) {
        result.iflags.wc_player_selection = VIA_DIALOG;
    } else if (equal_ncasechars(op, 'prompt', 6)) {
        result.iflags.wc_player_selection = VIA_PROMPTS;
    } else {
        configErrorAdd(
            result, `Unknown player_selection parameter '${op}'`,
        );
    }
}

// C ref: options.c optfn_statuslines() (4066-4098), its do_set arm.
// optlist.h gives statuslines negateok No, so parseoptions() answers a negated
// spelling with bad_negation() and the handler's own negation arm -- which
// would report and still leave itmp at 2 -- cannot run.  What is left needs a
// value: string_for_opt() reports a statement without one, and the range test
// then reports a second time, because itmp is still zero.  Both messages
// belong to the same statement, which is why C's optn_silenterr is not the
// silence its name suggests.
function setStatuslines(result, statement, negated) {
    const op = string_for_opt(statement, negated, result);
    const itmp = op !== '' ? atoi(op) : 0;
    if (itmp < 2 || itmp > 3) {
        configErrorAdd(
            result, `'statuslines:${op}' is invalid; must be 2 or 3`,
        );
        return;
    }
    result.iflags.wc2_statuslines = itmp;
}

// C ref: options.c optfn_msghistory() (2523-2545), its do_set request.
// A positive statement requires a value, while a negated statement without
// one stores zero.  The destination is an unsigned int, so atoi() narrows to
// signed int first and the assignment then wraps that value to 32 bits.  A
// missing positive value or a negated statement carrying a value reports and
// leaves the previous value intact.
function optfn_msghistory(result, statement, negated) {
    const op = string_for_env_opt(statement, negated, result);
    if ((negated && op === '') || (!negated && op !== '')) {
        result.iflags.msg_history = (negated ? 0 : atoi(op)) >>> 0;
    } else if (negated) {
        bad_negation(result, 'msghistory');
    }
}

// C ref: options.c optfn_paranoid_confirmation() (2816-3042), its do_set
// request.  flags.paranoia_bits is C unsigned storage, so every bitwise result
// is converted back to uint32; in particular, paranoia[]'s ~0 "all" row is
// 0xFFFFFFFF rather than JavaScript's signed -1.
function optfn_paranoid_confirmation(
    result, value, optionNegated, usingPrayconfirmAlias,
) {
    let op = value ?? '';

    // "prayconfirm" is a full-length alias.  Detect this element itself
    // rather than reading parseoptions()'s line-wide using_alias static: comma
    // recursion can leave that static raised for an unrelated element to its
    // left.  COMPLAIN_ABOUT_PRAYCONFIRM is defined in the recorder build.
    if (usingPrayconfirmAlias) {
        if (op !== '') {
            configErrorAdd(
                result,
                `deprecated ${optionNegated ? '!' : ''}`
                    + 'prayconfirm option takes no parameters '
                    + `(found '${op}')`,
            );
            return;
        }
        configErrorAdd(
            result,
            `${optionNegated ? '!' : ''}`
                + 'prayconfirm option is deprecated; switching to '
                + `paranoid_confirmation:${optionNegated ? '-' : '+'}pray`,
        );
        op = `${optionNegated ? '-' : '+'}pray`;
    } else if (optionNegated) {
        if (op === '') {
            result.flags.paranoia_bits = 0;
            return;
        }
        configErrorAdd(
            result, '!paranoid_confirmation does not accept a value',
        );
        return;
    } else if (op === '') {
        configErrorAdd(
            result,
            "paranoid_confirmation requires a value; use 'none' to cancel all",
        );
        return;
    }

    op = mungspaces(op);
    let plusOrMinus = false;
    // options.c says "context is changed" here: optionNegated described the
    // leading '!' on the compound option, while listNegated describes the '-'
    // modifier that applies to every token in its value.
    let listNegated = false;
    let index = 0;
    if (op[0] !== '+' && op[0] !== '-') {
        result.flags.paranoia_bits = 0;
    } else {
        plusOrMinus = true;
        listNegated = op[0] === '-';
        index = 1;
        if (op[index] === ' ') ++index;
    }

    for (;;) {
        let fieldNegated = op[index] === '!';
        if (fieldNegated) {
            ++index;
            if (op[index] === ' ') ++index;
        } else {
            const first = op[index] ?? '\0';
            const second = op[index + 1] ?? '\0';
            const third = op[index + 2] ?? '\0';
            // Preserve options.c:2971-2972 literally.  Its misplaced lowc()
            // makes the third-byte exclusion case-sensitive: "none" is not
            // a negation, but "noNone" is.  A space also passes this test, so
            // "no pray" advances onto the space and reports an empty token.
            if (lowc(first) === 'n' && lowc(second) === 'o'
                && third !== 'n' && lowc(third) !== '\0') {
                fieldNegated = true;
                index += 2;
            }
        }

        const space = op.indexOf(' ', index);
        const token = op.slice(index, space < 0 ? op.length : space);
        const matched = paranoia.find(([, argname, argMinLen,
            synonym, synMinLen]) => (
            match_optname(token, argname, argMinLen, false)
                || (synonym
                    && match_optname(token, synonym, synMinLen, false))
        ));
        if (!matched) {
            configErrorAdd(
                result,
                `Unknown paranoid_confirmation parameter '${token}'`,
            );
            return;
        }

        const [mask] = matched;
        if (mask === 0) {
            if (!plusOrMinus) result.flags.paranoia_bits = 0;
        } else if (listNegated || fieldNegated) {
            result.flags.paranoia_bits = (
                result.flags.paranoia_bits & ~mask
            ) >>> 0;
        } else {
            result.flags.paranoia_bits = (
                result.flags.paranoia_bits | mask
            ) >>> 0;
        }

        if (space < 0) break;
        index = space + 1;
    }
}

function sourceOptionMatch(parsedName) {
    return SOURCE_OPTION_MATCHES.find(([canonical, minLength]) => (
        !SOURCE_PREFIX_OPTION_NAMES.includes(canonical)
            && parsedName.length >= minLength
            && canonical.startsWith(parsedName)
    ));
}

// C ref: options.c:556-580, the two ways parseoptions()'s match loop reaches a
// pfx row.  str_start_is() accepts any suffix, and match_optname() accepts a
// leading substring of the prefix itself down to minmatch. The two rows are
// last in allopt[], so no ordinary row can match after them.
const PREFIX_OPTION_MATCHES = Object.freeze(SOURCE_OPTION_MATCHES.filter(
    ([canonical]) => SOURCE_PREFIX_OPTION_NAMES.includes(canonical),
));

function matchedPrefixOptionRow(statement, parsedName) {
    return PREFIX_OPTION_MATCHES.find(([canonical, minLength]) => (
        str_start_is(statement, canonical, true)
            || (parsedName.length >= minLength
                && canonical.startsWith(parsedName))
    ))?.[0] ?? null;
}

// C ref: options.c parseoptions()'s allopt[matchidx], the row its two match
// loops (556-612) settle on.  Three names this parser resolves are not that
// row's name: "male" is optlist.h:306-308's alias for the female row, every
// cond_<condition> comes from the single cond_ prefix row, and a name that
// matched nothing has no row at all.
const ALLOPT_ROWS = Object.freeze(new Map(
    allopt.map((option) => [option.name.toLowerCase(), option]),
));

function matchedOptionRow(name) {
    if (name.startsWith('cond_')) return ALLOPT_ROWS.get('cond_');
    if (name === 'male') return ALLOPT_ROWS.get('female');
    return ALLOPT_ROWS.get(name) ?? null;
}

// C ref: symbols.c parsesymbols(), which options.c:663 reaches only for a
// statement that starts with "S_" and only once both match loops have failed.
// It splits its argument in place at the first unquoted colon -- or, when
// there is none, at the first '=' -- and mungspaces() what is left before
// match_sym() decides, so a symbol name C does not know arrives at the
// "Unknown option" message already cut down to the part before that
// separator.  A statement carrying neither separator is reported whole.
function unknownOptionText(statement) {
    if (!statement.startsWith('S_')) return statement;
    // parsesymbols()'s scan starts at the second character and stops before
    // the last one, and passes over a colon that sits between two quotes.
    let separator = -1;
    for (let index = 1; index < statement.length - 1; ++index) {
        if (statement[index] !== ':') continue;
        if (statement[index - 1] === "'" && statement[index + 1] === "'")
            continue;
        separator = index;
        break;
    }
    if (separator < 0) separator = statement.indexOf('=');
    if (separator < 0) return statement;
    return mungspaces(statement.slice(0, separator));
}

// C ref: options.c optfn_pickup_types() (3369-3389), the class-symbol loop
// shared by startup parsing and the interactive handler.  C clears the
// destination before this loop, preserves the first occurrence of each valid
// class in input order, and keeps those accepted classes even when a later
// byte is invalid or repeated.  A leading 'a' or 'A' means all classes; only
// literal spaces at the head are skipped before that test.
function pickupTypesFromSymbols(symbols) {
    let op = symbols;
    while (op.startsWith(' ')) op = op.slice(1);
    if (op[0] === 'a' || op[0] === 'A') {
        return { types: [], badopt: false };
    }

    const types = [];
    let badopt = false;
    for (const symbol of op) {
        const objectClass = def_char_to_objclass(symbol);
        if (objectClass !== MAXOCLASSES && !types.includes(objectClass)) {
            types.push(objectClass);
        } else {
            badopt = true;
        }
    }
    return { types, badopt };
}

// C ref: options.c change_inv_order() (7466-7508), reached from
// optfn_packorder()'s do_set request.  The source walks bytes and diagnoses
// each bad, disallowed, or non-final repeated symbol, but still installs the
// good classes.  Gold leads only when omitted; every other omitted class
// follows in the order that was active before this statement.
export function change_inv_order(result, op) {
    const symbols = encodeUtf8ByteString(op);
    const previous = result.flags.inv_order;
    const reordered = [];
    let accepted = true;

    const goldSymbol = DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + COIN_CLASS];
    if (!symbols.includes(goldSymbol)) reordered.push(COIN_CLASS);

    for (let index = 0; index < symbols.length; ++index) {
        const byte = symbols[index];
        const symbol = decodeUtf8ByteString([byte]);
        const objectClass = def_char_to_objclass(symbol);
        let rejected = false;

        if (objectClass === MAXOCLASSES) {
            configErrorAdd(result, `Not an object class '${symbol}'`);
            rejected = true;
        } else if (!previous.includes(objectClass)) {
            configErrorAdd(result, `Object class '${symbol}' not allowed`);
            rejected = true;
        } else if (symbols.includes(byte, index + 1)) {
            configErrorAdd(result, `Duplicate object class '${symbol}'`);
            rejected = true;
        }
        if (rejected) accepted = false;
        else reordered.push(objectClass);
    }

    for (const objectClass of previous) {
        if (!reordered.includes(objectClass)) reordered.push(objectClass);
    }
    result.flags.inv_order = reordered.slice(0, MAXOCLASSES - 1);
    return accepted;
}

// C ref: options.c optfn_packorder() (2670-2691), its startup do_set arm.
// string_for_opt() supplies empty_optstr both without a separator and after
// an empty one; either spelling rejects silently and keeps the prior order.
function optfn_packorder(result, value) {
    if (value == null || value === '') return;
    change_inv_order(result, value);
}

// C ref: options.c optfn_sortdiscoveries() (3863-3903), its startup do_set
// arm.  The mandatory-value helper runs before the negation test, so a
// negated spelling without a value reports and then resets to discovery
// order.  Otherwise the first lowercased byte selects the order; an unknown
// parameter reports without changing the prior selection.
function optfn_sortdiscoveries(result, statement, negated) {
    const op = string_for_env_opt(statement, false, result);
    if (negated) {
        result.flags.discosort = 'o';
    } else if (op !== '') {
        switch (lowc(op[0])) {
        case '0':
        case 'o':
            result.flags.discosort = 'o';
            break;
        case '1':
        case 's':
            result.flags.discosort = 's';
            break;
        case '2':
        case 'c':
            result.flags.discosort = 'c';
            break;
        case '3':
        case 'a':
            result.flags.discosort = 'a';
            break;
        default:
            configErrorAdd(
                result, `Unknown sortdiscoveries parameter '${op}'`,
            );
            break;
        }
    }
}

// C ref: options.c optfn_sortvanquished() (3958-4009), its startup do_set
// arm.  The mandatory-value helper runs before negation is considered, so a
// negated spelling without a value reports and then restores traditional
// order.  Positive values select from the first byte alone; the two uppercase
// letters deliberately name modes distinct from their lowercase partners.
function optfn_sortvanquished(result, statement, negated) {
    const op = string_for_env_opt(statement, false, result);
    if (negated) {
        result.flags.vanq_sortmode = 0;
    } else if (op !== '') {
        const mode = 'tdaACcnz'.indexOf(op[0]);
        const numeric = '01234567'.indexOf(op[0]);
        if (mode >= 0) {
            result.flags.vanq_sortmode = mode;
        } else if (numeric >= 0) {
            result.flags.vanq_sortmode = numeric;
        } else {
            configErrorAdd(
                result, `Unknown sortvanquished parameter '${op}'`,
            );
        }
    }
}

// C ref: options.c feature_alert_opts(), startup branch. The parsed
// unsigned-long value remains exact until it is compared with this build's
// version. Only an accepted value is stored, and every accepted value fits in
// JavaScript's exact integer range because the current version is 5.0.0.
function feature_alert_opts(result, op, optn) {
    const fnv = get_feature_notice_ver(op);
    if (fnv === 0n) return 0;
    if (fnv > get_current_feature_ver()) {
        configErrorAdd(
            result,
            `${optn}=${op} Invalid reference to a future version ignored`,
        );
        return 0;
    }
    result.flags.suppress_alert = Number(fnv);
    return 1;
}

// C ref: options.c optfn_suppress_alert(), startup do_set arm. optlist.h
// rejects negation before this handler, and an absent or empty value is the
// empty_optstr sentinel, which leaves the existing setting alone.
function optfn_suppress_alert(result, value) {
    if (value == null || value === '') return;
    feature_alert_opts(result, value, 'suppress_alert');
}

// C ref: options.c bad_negation() (6692-6697).  Three of its callers are
// reachable here -- parseoptions() (627), optfn_menu_headings() (2201) and
// optfn_pile_limit() (3421) -- and all three pass with_parameter TRUE, whether
// or not the statement carried a value, so the message names a value either
// way.  The two that pass FALSE, optfn_suppress_alert() (4144) and
// spcfn_misc_menu_cmd() (5459), sit behind rows whose optlist.h negateok is
// No, so parseoptions() has already answered the negation by the time either
// handler runs.  That is also why several C handlers declare their `negated`
// argument UNUSED.
function bad_negation(result, optname) {
    configErrorAdd(
        result,
        `The ${optname} option may not both have a value and be negated.`,
    );
}

// C ref: botl.c condopt(), its setting branch. status_conditions is the sole
// owner of condtests[].enabled: no raw cond_* fields are retained in flags.
// Its initialization branch is initoptions_init()'s existing default table.
function condopt(target, canonical, negated) {
    target.iflags.status_conditions[canonical] = !negated;
}

// C ref: botl.c parse_cond_option(). `opts` is deliberately the whole
// post-negation statement, including a colon value, because
// match_optname(..., FALSE) rejects that suffix.
function parse_cond_option(target, negated, opts) {
    if (!opts || opts.length <= 'cond_'.length) return 2;
    const suffix = opts.slice('cond_'.length).toLowerCase();
    const canonical = SOURCE_CONDITION_NAMES.find((candidate) => (
        suffix.length >= Math.min(candidate.length, 4)
            && candidate.startsWith(suffix)
    ));
    if (!canonical) return 1;
    condopt(target, canonical, negated);
    return 0;
}

// C ref: options.c pfxfn_cond_(). A configuration read accumulates the
// handler's diagnostic and parseoptions() appends its pfx-only diagnostic.
// The interactive caller has no config-error frame, but shares condopt() and
// requests the redraw C records after a successful change.
function pfxfn_cond_(target, negated, opts, result = null) {
    const reslt = parse_cond_option(target, negated, opts);
    if (reslt !== 0) {
        if (result) {
            configErrorAdd(
                result, `Unknown condition option ${opts} (${reslt})`,
            );
        }
        return optn_err;
    }
    if (target.go) target.go.opt_need_redraw = true;
    return optn_ok;
}

// C ref: options.c enum window_option_types.  Keep the source values because
// wc_set_font_name() and pfxfn_font() exchange one of these rather than a
// field name.
const MESSAGE_OPTION = 1;
const STATUS_OPTION = 2;
const MAP_OPTION = 3;
const MENU_OPTION = 4;
const TEXT_OPTION = 5;

// C ref: options.c wc_set_font_name().  JavaScript strings already own their
// contents, so assigning the value supplies dupstr()'s independent lifetime.
function wc_set_font_name(result, opttype, fontname) {
    if (fontname == null) return;
    let field;
    switch (opttype) {
    case MAP_OPTION:
        field = 'wc_font_map';
        break;
    case MESSAGE_OPTION:
        field = 'wc_font_message';
        break;
    case TEXT_OPTION:
        field = 'wc_font_text';
        break;
    case MENU_OPTION:
        field = 'wc_font_menu';
        break;
    case STATUS_OPTION:
        field = 'wc_font_status';
        break;
    default:
        return;
    }
    result.iflags[field] = fontname;
}

const FONT_NAME_OPTION_TYPES = Object.freeze({
    font_map: MAP_OPTION,
    font_message: MESSAGE_OPTION,
    font_text: TEXT_OPTION,
    font_menu: MENU_OPTION,
    font_status: STATUS_OPTION,
});

const FONT_SIZE_OPTION_FIELDS = Object.freeze({
    font_size_map: Object.freeze([MAP_OPTION, 'wc_fontsiz_map']),
    font_size_message: Object.freeze([
        MESSAGE_OPTION, 'wc_fontsiz_message',
    ]),
    font_size_text: Object.freeze([TEXT_OPTION, 'wc_fontsiz_text']),
    font_size_menu: Object.freeze([MENU_OPTION, 'wc_fontsiz_menu']),
    font_size_status: Object.freeze([STATUS_OPTION, 'wc_fontsiz_status']),
});

// C ref: options.c pfxfn_font().  Font names and sizes deliberately disagree
// about negation.  A font name carrying a value is stored even when negated;
// a size carrying a negation is ignored without reading or reporting its
// value.  Size rows also report duplicates here despite allopt[].dupeok.
function pfxfn_font(
    result, row, negated, opts, duplicate, usingAlias,
) {
    const name = row.name;
    const opttype = FONT_NAME_OPTION_TYPES[name];
    const size = FONT_SIZE_OPTION_FIELDS[name];

    if (size) {
        if (duplicate) {
            complain_about_duplicate(
                result, row, optionParserMetadata[name] ?? {}, usingAlias,
            );
        }
        if (!negated) {
            const op = string_for_opt(opts, false, result);
            if (op !== '') result.iflags[size[1]] = atoi(op);
        }
        return optn_ok;
    }
    if (!opttype) {
        configErrorAdd(result, `Unknown font parameter '${opts}'`);
        return optn_err;
    }

    const op = string_for_opt(opts, false, result);
    if (op !== '') {
        wc_set_font_name(result, opttype, op);
        return optn_ok;
    }
    if (negated) {
        bad_negation(result, name);
        return optn_err;
    }
    return optn_ok;
}

// C refs: options.c optfn_font_map(), optfn_font_menu(),
// optfn_font_message(), the five optfn_font_size_*() wrappers,
// optfn_font_status(), and optfn_font_text().
function optfn_font_map(...args) { return pfxfn_font(...args); }
function optfn_font_menu(...args) { return pfxfn_font(...args); }
function optfn_font_message(...args) { return pfxfn_font(...args); }
function optfn_font_size_map(...args) { return pfxfn_font(...args); }
function optfn_font_size_menu(...args) { return pfxfn_font(...args); }
function optfn_font_size_message(...args) { return pfxfn_font(...args); }
function optfn_font_size_status(...args) { return pfxfn_font(...args); }
function optfn_font_size_text(...args) { return pfxfn_font(...args); }
function optfn_font_status(...args) { return pfxfn_font(...args); }
function optfn_font_text(...args) { return pfxfn_font(...args); }

const FONT_OPTION_SET_HANDLERS = Object.freeze({
    font_map: optfn_font_map,
    font_menu: optfn_font_menu,
    font_message: optfn_font_message,
    font_size_map: optfn_font_size_map,
    font_size_menu: optfn_font_size_menu,
    font_size_message: optfn_font_size_message,
    font_size_status: optfn_font_size_status,
    font_size_text: optfn_font_size_text,
    font_status: optfn_font_status,
    font_text: optfn_font_text,
});

function prefixSuffixText(opts) {
    const colon = opts.indexOf(':');
    return colon < 0 ? opts : opts.slice(0, colon);
}

function isSourceSymbolAssignment(sourceName, value) {
    return value != null && sourceName.startsWith('S_')
        && SOURCE_SYMBOL_NAMES.has(sourceName.toLowerCase());
}

function appendSymbolSelection(
    result,
    set,
    name,
    { legacyIfUnset = false, legacyIBM = false } = {},
) {
    result.symbolOperations.push({
        kind: 'select',
        set,
        name,
        legacyIfUnset,
        legacyIBM,
    });
}

function appendSymbolOverrides(result, set, assignments) {
    // This ordered stream is authoritative.  flags/rogueSymbols below are
    // compatibility snapshots for older callers and only represent S_*
    // symbol slots. Standalone G_* records are retained here because C saves
    // them back to config, although parsesymbols() does not apply them.
    result.symbolOperations.push({ kind: 'override', set, assignments });
    const target = set === 'rogue' ? result.rogueSymbols : result.flags;
    for (const { kind, name, rawValue } of assignments) {
        if (kind !== 'glyph') target[name] = rawValue;
    }
}

// C ref: symbols.c:parsesymbols(). Its comma recursion applies the suffix
// first, then the current assignment. Keep a mutable character buffer so the
// outer call retains its pre-recursion colon pointer, including the source's
// surprising mixed-delimiter behavior.
function parseSymbolAssignments(value, lineNumber) {
    const buffer = Array.from(String(value));
    buffer.push('\0');

    const cString = (start) => {
        let end = start;
        while (buffer[end] !== '\0') ++end;
        return buffer.slice(start, end).join('');
    };

    const parseAt = (start) => {
        let comma = -1;
        let colon = -1;
        for (let index = start + 1; buffer[index] !== '\0'; ++index) {
            const previous = buffer[index - 1];
            const next = buffer[index + 1];
            if (next === '\0') break;
            if (buffer[index] === ',') {
                if (previous === "'" && next === "'") continue;
                if (previous === '\\') continue;
                if (comma < 0) comma = index;
            }
            if (buffer[index] === ':'
                && !(previous === "'" && next === "'")
                && colon < 0) {
                colon = index;
            }
        }

        const assignments = [];
        if (comma >= 0) {
            buffer[comma] = '\0';
            assignments.push(...parseAt(comma + 1));
        }

        let delimiter = colon;
        if (delimiter < 0) {
            for (let index = start; buffer[index] !== '\0'; ++index) {
                if (buffer[index] === '=') {
                    delimiter = index;
                    break;
                }
            }
        }
        if (delimiter < 0) {
            optionError(
                lineNumber,
                `invalid symbol assignment '${cString(start)}'`,
            );
        }
        buffer[delimiter] = '\0';
        const sourceName = mungspaces(cString(start));
        const rawValue = mungspaces(cString(delimiter + 1));
        // match_sym() independently stops its lookup key at ':' or '='.
        // With the carried-colon quirk, sourceName can still contain an '='.
        const lookupName = sourceName
            .split(/[:=]/u, 1)[0]
            .trim()
            .toLowerCase();
        // parse_id()'s G_ gate is case-sensitive; match_glyph() then compares
        // the complete glyph-ID cache case-insensitively.
        const glyphName = sourceName.startsWith('G_')
            ? sourceGlyphName(lookupName) : null;
        if (!SOURCE_SYMBOL_NAMES.has(lookupName) && !glyphName) {
            optionError(lineNumber, `unknown symbol '${sourceName}'`);
        }
        assignments.push(glyphName
            ? { kind: 'glyph', name: glyphName, rawValue }
            : { kind: 'symbol', name: lookupName, rawValue });
        return assignments;
    };

    return parseAt(0);
}

// `aliasState` carries options.c's `using_alias` static across the elements of
// one configuration-file line; complain_about_duplicate() above states how far
// it reaches and why this parser cannot keep it in a local.
//
// C ref: options.c optfn_disclose() (1442-1560), the do_set request during
// configuration-file parsing.  `flags.end_disclose` is the sole copy of this
// option: the existing get_val formatter below reads the same six bytes for
// the #optionsfull value column.
function optfn_disclose(result, statement, negated) {
    const op = string_for_opt(statement, true);
    if (op !== '' && negated) {
        bad_negation(result, 'disclose');
        return;
    }

    const opBytes = encodeUtf8ByteString(op);
    const isAll = opBytes.length === 3
        && equal_ncasechars(decodeUtf8ByteString(opBytes), 'all', 3);
    const isNone = opBytes.length === 4
        && equal_ncasechars(decodeUtf8ByteString(opBytes), 'none', 4);
    // A bare disclose asks each question with Yes preselected; a bare
    // negation, or "none", suppresses every question without asking.
    if (op === '' || isAll || isNone) {
        if (isNone) negated = true;
        result.flags.end_disclose.fill(
            negated ? DISCLOSE_NO_WITHOUT_PROMPT
                : DISCLOSE_PROMPT_DEFAULT_YES,
        );
        return;
    }

    let num = 0;
    let prefixVal = null;
    const validSettings = new Set([
        DISCLOSE_PROMPT_DEFAULT_YES,
        DISCLOSE_PROMPT_DEFAULT_NO,
        DISCLOSE_PROMPT_DEFAULT_SPECIAL,
        DISCLOSE_YES_WITHOUT_PROMPT,
        DISCLOSE_NO_WITHOUT_PROMPT,
        DISCLOSE_SPECIAL_WITHOUT_PROMPT,
    ]);
    // C's source declares `num` for this bound but never increments it.  Keep
    // that exact fixed-array condition: every byte before the terminating NUL
    // is parsed, including one beyond the six disclosure categories.
    for (let index = 0; index < opBytes.length
        && num < NUM_DISCLOSURE_OPTIONS; ++index) {
        let c = lowc(String.fromCharCode(opBytes[index]));
        if (c === 'k') c = 'v'; // killed -> vanquished
        if (c === 'd') c = 'o'; // dungeon -> overview
        const disclosureIndex = disclosure_options.indexOf(c);
        if (disclosureIndex >= 0) {
            if (prefixVal !== null) {
                let setting = prefixVal;
                if (c !== 'v' && c !== 'g') {
                    if (setting === DISCLOSE_PROMPT_DEFAULT_SPECIAL)
                        setting = DISCLOSE_PROMPT_DEFAULT_YES;
                    if (setting === DISCLOSE_SPECIAL_WITHOUT_PROMPT)
                        setting = DISCLOSE_YES_WITHOUT_PROMPT;
                }
                result.flags.end_disclose[disclosureIndex] = setting;
                prefixVal = null;
            } else {
                result.flags.end_disclose[disclosureIndex]
                    = DISCLOSE_YES_WITHOUT_PROMPT;
            }
        } else if (validSettings.has(c)) {
            prefixVal = c;
        } else if (c !== ' ') {
            configErrorAdd(
                result,
                `Unknown disclose parameter '${decodeUtf8ByteString(
                    [opBytes[index]],
                )}'`,
            );
            return;
        }
    }
}

function applyOption(result, optionState, element, lineNumber, aliasState) {
    // options.c:538-542 strips the negation prefixes off the whole element,
    // before length_without_val() looks for a value, so `statement` is what
    // the rest of parseoptions() matches against, what it hands each handler
    // as `opts`, and what every message naming the statement reports --
    // "Unknown option" here and string_for_opt()'s "Missing parameter" below.
    // `element` keeps those prefixes and is read nowhere else.
    const { statement, negated } = stripNegation(element);
    const { name: rawName, value } = splitNameAndValue(statement);
    const parsedName = rawName.toLowerCase();

    const sourceMatch = sourceOptionMatch(parsedName);
    const aliasTarget = optionAliasTarget(parsedName);
    const hasAlias = aliasTarget !== null;
    // options.c strips negation, then checks this prefix case-sensitively.
    const isSymbolAssignment = isSourceSymbolAssignment(rawName, value);
    let name = sourceMatch?.[0] ?? aliasTarget;
    // options.c:592-612 runs the alias loop only after the name loop has
    // failed, and raises using_alias there and nowhere else, so a name match
    // leaves the flag as the element to the right of this one left it.
    if (!sourceMatch && hasAlias) aliasState.usingAlias = true;
    // options.c:618-629 reads allopt[matchidx], the row its two match loops
    // settled on; a symbol assignment reaches parsesymbols() (663) only with
    // got_match still false, so it has no row and gets no negation check.
    const matchedRow = name ? matchedOptionRow(name) : null;
    if (!name && isSymbolAssignment) name = parsedName;
    const prefixRow = !name
        ? matchedPrefixOptionRow(statement, parsedName) : null;
    if (prefixRow === 'cond_') {
        const optresult = pfxfn_cond_(result, negated, statement, result);
        // options.c:675-682 adds this after the handler only when the pfx
        // str_start_is() path reached the row. A shorter "cond" reaches the
        // same handler through match_optname(), without this second report.
        if (optresult === optn_err && str_start_is(statement, prefixRow, true)) {
            configErrorAdd(
                result,
                `bad option suffix variation '${prefixSuffixText(statement)}'`,
            );
        }
        return;
    }
    if (prefixRow === 'font') {
        const optresult = pfxfn_font(
            result, matchedOptionRow(prefixRow), negated, statement,
        );
        // Unlike cond_, font's minmatch is its complete four-byte name, so
        // every statement which reaches this prefix arm also satisfies C's
        // str_start_is() guard.
        if (optresult === optn_err) {
            configErrorAdd(
                result,
                `bad option suffix variation '${prefixSuffixText(statement)}'`,
            );
        }
        return;
    }
    if (!name && prefixRow) {
        optionError(lineNumber, `unported prefix option '${statement}'`);
    }
    if (!name) {
        // options.c:687-689, the last arm of parseoptions().
        configErrorAdd(
            result, `Unknown option '${unknownOptionText(statement)}'`,
        );
        return;
    }
    // C refs: options.c reset_duplicate_opt_detection() (6773-6779) and
    // duplicate_opt_detection() (6782-6787). parseNethackrc() represents one
    // read_config_file() call, so its new optionState is the reset and this
    // Set is allopt[].dupdetected. The counter advances before bad_negation()
    // and before the option handler, even when either one rejects the value.
    let duplicate;
    if (matchedRow) {
        const metadata = optionParserMetadata[matchedRow.name] ?? {};
        duplicate = optionState.seen.has(matchedRow.name);
        optionState.seen.add(matchedRow.name);
        if (duplicate && !metadata.dupeok) {
            complain_about_duplicate(
                result, matchedRow, metadata, aliasState.usingAlias,
            );
        }
    }
    if (negated && matchedRow && !matchedRow.negateok) {
        bad_negation(result, matchedRow.name);
        return;
    }
    const fontHandler = FONT_OPTION_SET_HANDLERS[name];
    if (fontHandler) {
        fontHandler(
            result, matchedRow, negated, statement, duplicate,
            aliasState.usingAlias,
        );
        return;
    }
    if (matchedRow?.opttyp === 'BoolOpt'
        && optfn_boolean_returns_before_setting(
            result, matchedRow, value, negated,
        )) return;

    const menuCommand = menuCommandOption(name);

    if (name === 'name') {
        // C ref: options.c optfn_name() (2548-2570), its do_set arm.  The
        // value is mandatory, so a statement without one is reported by
        // string_for_env_opt() and leaves svp.plname alone.
        const op = string_for_env_opt(statement, false, result);
        if (op === '') return;
        result.name = truncateByteString(op, PLAYER_NAME_BYTE_LIMIT);
    } else if (name === 'disclose') {
        optfn_disclose(result, statement, negated);
    } else if (name === 'role' || name === 'race' || name === 'gender'
               || name === 'alignment') {
        setCharacterOption(
            result, optionState, matchedRow, statement, negated,
            aliasState.usingAlias, duplicate,
        );
    } else if (name === 'playmode') {
        setPlaymode(result, value, duplicate);
    } else if (name === 'menu_objsyms') {
        optfn_menu_objsyms(result, statement, value, negated);
    } else if (name === 'menuinvertmode') {
        optfn_menuinvertmode(result, value);
    } else if (name === 'menu_headings') {
        setMenuHeadings(result, value, negated);
    } else if (name === 'petattr') {
        setPetAttribute(result, statement);
    } else if (name === 'hilite_status') {
        setStatusHiliteOption(result, value, negated);
    } else if (name === 'statushilites') {
        setStatusHiliteDuration(result, value, negated);
    } else if (menuCommand && parsedName === name) {
        setMenuCommandOption(result, menuCommand, statement);
    } else if (menuCommand || isMenuCommandPrefix(parsedName)) {
        optionError(
            lineNumber,
            `menu command option '${parsedName}' requires its full canonical name`,
        );
    } else if (name === 'packorder') {
        // optlist.h gives negateok No, so a negated spelling never arrives.
        optfn_packorder(result, value);
    } else if (name === 'pettype') {
        setPettype(result, statement, negated);
    } else if (name === 'fruit') {
        setFruit(result, statement);
    } else if (name === 'autounlock') {
        optfn_autounlock(result, statement, negated);
    } else if (name === 'boulder') {
        optfn_boulder(result, statement);
    } else if (name === 'warnings') {
        optfn_warnings(result, statement);
    } else if (name === 'crash_email') {
        optfn_crash_email(result, statement);
    } else if (name === 'crash_name') {
        optfn_crash_name(result, statement);
    } else if (name === 'crash_urlmax') {
        optfn_crash_urlmax(result, statement);
    } else if (name === 'catname' || name === 'dogname'
               || name === 'horsename') {
        setPetName(result, name, value);
    } else if (name === 'decgraphics') {
        result.flags.decgraphics = !negated;
        if (!negated) {
            appendSymbolSelection(result, 'primary', 'DECgraphics', {
                legacyIfUnset: true,
            });
        }
    } else if (name === 'ibmgraphics') {
        result.flags.ibmgraphics = !negated;
        if (!negated) {
            appendSymbolSelection(result, 'primary', 'IBMgraphics', {
                legacyIfUnset: true,
                legacyIBM: true,
            });
        }
    } else if (isSymbolAssignment) {
        // parsesymbols() does not receive parseoptions()'s negation flag.
        appendSymbolOverrides(result, 'primary', [{
            name,
            rawValue: value,
        }]);
    } else if (name === 'number_pad') {
        setNumberPadOption(result, statement);
    } else if (name === 'whatis_coord') {
        setWhatisCoord(result, statement, negated);
    } else if (name === 'whatis_filter') {
        optfn_whatis_filter(result, statement, negated);
    } else if (name === 'runmode') {
        setRunmode(result, value, negated);
    } else if (name === 'scores') {
        optfn_scores(result, statement);
    } else if (name === 'scroll_amount') {
        optfn_scroll_amount(result, statement, negated);
    } else if (name === 'scroll_margin') {
        optfn_scroll_margin(result, statement, negated);
    } else if (name === 'soundlib') {
        optfn_soundlib(result, statement);
    } else if (name === 'tile_height') {
        optfn_tile_height(result, statement, negated);
    } else if (name === 'tile_width') {
        optfn_tile_width(result, statement, negated);
    } else if (name === 'vary_msgcount') {
        optfn_vary_msgcount(result, statement, negated);
    } else if (name === 'term_cols') {
        optfn_term_cols(result, statement);
    } else if (name === 'term_rows') {
        optfn_term_rows(result, statement);
    } else if (name === 'align_message') {
        optfn_align_message(result, statement, negated);
    } else if (name === 'align_status') {
        optfn_align_status(result, statement, negated);
    } else if (name === 'pickup_burden') {
        setPickupBurden(result, statement);
    } else if (name === 'menustyle') {
        optfn_menustyle(result, statement, negated);
    } else if (name === 'mouse_support') {
        optfn_mouse_support(result, statement);
    } else if (name === 'map_mode') {
        optfn_map_mode(result, statement, negated);
    } else if (name === 'pickup_types') {
        // optfn_pickup_types() clears the restriction before looking for its
        // value.  During startup a missing or empty value still reports the
        // mandatory-parameter error, then enables autopickup for all classes
        // instead of opening the interactive class menu.
        result.flags.pickup_types = [];
        const op = string_for_opt(statement, false, result);
        if (op === '') {
            result.flags.pickup = true;
        } else {
            const parsed = pickupTypesFromSymbols(op);
            result.flags.pickup_types = parsed.types;
            if (parsed.badopt) {
                // `op` points at its terminating NUL after C's loop, so the
                // reported parameter is empty even when earlier bytes failed.
                configErrorAdd(
                    result, "Unknown pickup_types parameter ''",
                );
            }
        }
    } else if (name === 'pile_limit') {
        setPileLimit(result, statement, negated);
    } else if (name === 'player_selection') {
        optfn_player_selection(result, statement, negated);
    } else if (name === 'statuslines') {
        setStatuslines(result, statement, negated);
    } else if (name === 'msghistory') {
        optfn_msghistory(result, statement, negated);
    } else if (name === 'paranoid_confirmation') {
        optfn_paranoid_confirmation(
            result, value, negated,
            parsedName === 'prayconfirm',
        );
    } else if (name === 'msg_window') {
        // C ref: options.c optfn_msg_window()'s do_set arm. PREV_MSGS is 1
        // for this tty build. parseoptions() reads this option's value as
        // optional, so the spellings with no value reach the handler with
        // empty_optstr, which means 'f' plain and 's' negated; a negation
        // that does carry a value is bad_negation(). Otherwise C keeps the
        // lowercased first letter and rejects anything but s, c, f or r.
        let tmp;
        if (!value) {
            tmp = negated ? 's' : 'f';
        } else if (negated) {
            configErrorAdd(
                result,
                'The msg_window option may not both have a value and be'
                + ' negated.',
            );
            return;
        } else {
            tmp = lowc(value[0]);
        }
        if (!'scfr'.includes(tmp)) {
            configErrorAdd(
                result, `Unknown msg_window parameter '${value}'`,
            );
            return;
        }
        result.iflags.prevmsg_window = tmp;
    } else if (name === 'sortloot') {
        // C ref: options.c optfn_sortloot()'s do_set arm, which stores the
        // lowercased first letter and rejects anything else. optlist.h gives
        // sortloot negateok No, so parseoptions() answers a negation with
        // bad_negation() before the handler runs, which is why the handler
        // declares its negated argument UNUSED.
        // The handler re-reads the value with
        // string_for_env_opt(name, opts, FALSE); its mandatory parameter makes
        // a spelling without one string_for_opt()'s "Missing parameter" error
        // over the whole statement text, and the handler then returns optn_err
        // without touching flags.sortloot.
        const op = string_for_env_opt(statement, false, result);
        if (op === '') return;
        const c = lowc(op[0]);
        if (!'nlf'.includes(c)) {
            configErrorAdd(
                result, `Unknown sortloot parameter '${op}'`,
            );
            return;
        }
        result.flags.sortloot = c;
    } else if (name === 'sortdiscoveries') {
        optfn_sortdiscoveries(result, statement, negated);
    } else if (name === 'sortvanquished') {
        optfn_sortvanquished(result, statement, negated);
    } else if (name === 'suppress_alert') {
        optfn_suppress_alert(result, value);
    } else if (name === 'windowborders') {
        optfn_windowborders(result, statement, negated);
    } else if (name === 'versinfo') {
        // C ref: options.c optfn_versinfo()'s do_set arm.  optlist.h:816 gives
        // it negateok No, so parseoptions() has already answered a negation
        // with bad_negation() and the handler's own negation arm is dead on
        // this path.
        // string_for_opt(opts, FALSE) reports the missing parameter itself,
        // and the handler then adds a second error naming the default it does
        // not actually store.  nomakedefs.git_branch is null in a release
        // build (js/version.js records the same reading), so have_branch is
        // false and the default is VI_NUMBER.
        const op = string_for_opt(statement, false, result);
        if (op === '') {
            configErrorAdd(
                result, "'versinfo' requires a value; defaulting to 1",
            );
            return;
        }
        // atoi() answers 0 for text that starts with no digits, and the guard
        // is `!val || (val & ~7) != 0`, which admits exactly 1 through 7.
        const versinfo = Number.parseInt(op, 10);
        if (!Number.isInteger(versinfo) || versinfo < 1 || versinfo > 7) {
            configErrorAdd(
                result,
                "'versinfo' must be one of 1, 2, 4, or the sum of two or all"
                + ' three of those',
            );
            return;
        }
        result.flags.versinfo = versinfo;
    } else if (matchedRow?.opttyp === 'BoolOpt') {
        // parseoptions():644 hands every BoolOpt row to optfn_boolean(),
        // whatever value the statement carries, so the row's type selects this
        // arm rather than the subset of names whose storage the port owns.
        // Selecting on the name instead sent a boolean carrying a value into
        // the compound arm below: "sortpack:" stored the empty string in
        // flags.sortpack where C stores TRUE, "!autodig:" hit that arm's
        // negation stop, and a value C cannot read reached no handler to
        // report it.
        applyBooleanOption(result, name, matchedRow, statement, value, negated);
    } else if (name === 'symset' || name === 'roguesymset') {
        // C refs: options.c optfn_symset() (4166-4201) and
        // optfn_roguesymset() (3543-3585). parseoptions() passes each handler
        // string_for_opt(..., TRUE), so a missing or empty value is a silent
        // optn_err: it neither selects a set nor leaves parser residue.
        if (value == null || value === '') return;
        const set = name === 'roguesymset' ? 'rogue' : 'primary';
        result[name] = value;
        // files.c read_sym_file() selects by name without applying the
        // Restrictions field used by the interactive picker. A miss clears
        // the attempted name and metadata but deliberately leaves bytes from
        // an earlier successful selection in place, so retain that cleanup
        // in the ordered symbols.c operation stream.
        if (!read_sym_file(value)) {
            result[name] = undefined;
            result.symbolOperations.push({
                kind: 'clear', set, nameToo: true,
            });
            configErrorAdd(
                result,
                `Unable to load symbol set "${value}" from "symbols"`,
            );
            return;
        }
        appendSymbolSelection(result, set, value);
    } else if (value != null) {
        // Only a negated option whose optlist.h negateok is Yes reaches the
        // stop below: a negated spelling of any other one is bad_negation()'s
        // above, and a BoolOpt row took the arm ahead of this.  What C's
        // compound handler does with the negation is what is unported here.
        if (negated) {
            optionError(
                lineNumber,
                `negated compound option '${name}' is not supported`,
            );
        }
        // This parser currently gives source semantics to the startup subset
        // above. Preserve other valid options for later subsystem ports
        // instead of pretending to interpret their values here. Nothing reads
        // what this stores, and each remaining handler reads an empty value
        // differently, so no common guard here would be source-faithful.
        result.flags[name] = value;
    } else {
        // Preserve the pre-existing fail-closed marker for a value-less
        // compound option whose do_set request is not ported yet.  A BoolOpt
        // never reaches this arm: both of its statement shapes dispatch by
        // the generated row type above.
        result.flags[name] = !negated;
    }
}

function applyDirectOption(result, key, value) {
    const normalized = key.toLowerCase();
    if (normalized === 'name') {
        result.name = truncateByteString(value, PLAYER_NAME_BYTE_LIMIT);
    }
    else if (normalized === 'role' || normalized === 'character') {
        // cfgfiles.c:cnf_line_ROLE() silently ignores random or unknown
        // legacy values; OPTIONS=role:... owns modern validation.
        const parsed = str2role(value);
        if (parsed >= 0) {
            result.role = parsed;
            result.flags.initrole = parsed;
        }
    } else if (normalized === 'dogname' || normalized === 'catname') {
        // The legacy statements use strncpy(), without the compound pet-name
        // option's "none" handling or sanitize_name() pass.
        result[normalized] = truncateByteString(value, PET_NAME_BYTE_LIMIT);
    }
}

// C ref: cfgfiles.c config_line_stmt[] and parse_config_line(). The generated
// table owns every player-reachable name and minimum prefix length. This map
// owns only handlers that have been ported. A generated row absent here is
// still recognized, then recorded in unportedConfigStatements so a later
// consumer can refuse its missing cnf_line_<NAME>() state explicitly.
const CONFIG_STATEMENT_HANDLERS = Object.freeze({
    options: Object.freeze({ kind: 'options' }),
    autopickup_exception: Object.freeze({ kind: 'autopickup-exception' }),
    msgtype: Object.freeze({ kind: 'msgtype' }),
    bindings: Object.freeze({ kind: 'bindings' }),
    autocomplete: Object.freeze({ kind: 'autocomplete' }),
    roguesymbols: Object.freeze({ kind: 'symbols', set: 'rogue' }),
    symbols: Object.freeze({ kind: 'symbols', set: 'primary' }),
    hilite_status: Object.freeze({ kind: 'status-hilite' }),
    name: Object.freeze({ kind: 'direct', directName: 'name' }),
    role: Object.freeze({ kind: 'direct', directName: 'role' }),
    character: Object.freeze({ kind: 'direct', directName: 'role' }),
    dogname: Object.freeze({ kind: 'direct', directName: 'dogname' }),
    catname: Object.freeze({ kind: 'direct', directName: 'catname' }),
    boulder: Object.freeze({ kind: 'legacy-boulder' }),
    warnings: Object.freeze({ kind: 'warnings' }),
});

function configDelimiter(line) {
    const colon = line.indexOf(':');
    const equals = line.indexOf('=');
    if (colon >= 0 && equals >= 0) return Math.min(colon, equals);
    return Math.max(colon, equals);
}

function matchesConfigName(name, canonical, minLength) {
    return name.length >= minLength && canonical.startsWith(name);
}

function scanfAutopickupMapping(mapping, prefix) {
    const bytes = encodeUtf8ByteString(mapping);
    let index = 0;
    if (bytes[index++] !== 0x22) return { n: 0 }; // opening '"'
    if (prefix != null && bytes[index++] !== prefix) return { n: 0 };

    const text = [];
    while (index < bytes.length && bytes[index] !== 0x00
           && bytes[index] !== 0x22 && text.length < 253) {
        text.push(bytes[index++]);
    }
    if (!text.length) return { n: 0 };
    const decoded = decodeUtf8ByteString(text);
    // scanf() keeps prior assignments when a later literal does not match.
    // That makes an unclosed quote, and a quote beyond the field width, n=1.
    if (bytes[index] !== 0x22) return { n: 1, text: decoded };
    ++index;
    while ([0x20, 0x09, 0x0A, 0x0B, 0x0C, 0x0D].includes(bytes[index])) {
        ++index;
    }
    if (index >= bytes.length || bytes[index] === 0x00) {
        return { n: 1, text: decoded };
    }
    return { n: 2, text: decoded, end: bytes[index] };
}

// C ref: options.c add_autopickup_exception(). cfgfiles.c passes the munged
// post-delimiter value, and the three sscanf() calls retain their assignment
// counts even when a closing quote or the byte after field width 253 fails.
export function add_autopickup_exception(result, mapping) {
    let scanned = scanfAutopickupMapping(mapping, 0x3C); // '<'
    let grab = false;
    if (scanned.n === 1 || (scanned.n === 2 && scanned.end === 0x23)) {
        grab = true;
    } else {
        scanned = scanfAutopickupMapping(mapping, 0x3E); // '>'
        if (scanned.n !== 1) {
            scanned = scanfAutopickupMapping(mapping, null);
        }
        if (!(scanned.n === 1
              || (scanned.n === 2 && scanned.end === 0x23))) {
            configErrorAdd(result, 'syntax error in AUTOPICKUP_EXCEPTION');
            return 0;
        }
    }

    const regex = regex_init();
    if (!regex_compile(scanned.text, regex)) {
        configErrorAdd(
            result,
            'regex error in AUTOPICKUP_EXCEPTION: '
                + regex_error_desc(regex),
        );
        return 0;
    }
    result.ga.apelist = {
        pattern: scanned.text,
        grab,
        regex,
        next: result.ga.apelist ?? null,
    };
    return 1;
}

const MSGTYPE_NAMES = Object.freeze([
    // msgtype_parse_add() accepts the first source-table name with this
    // prefix. Keep show before stop (`s`) and noshow before norep (`n`).
    Object.freeze({ name: 'show', msgtype: MSGTYP_NORMAL }),
    Object.freeze({ name: 'hide', msgtype: MSGTYP_NOSHOW }),
    Object.freeze({ name: 'noshow', msgtype: MSGTYP_NOSHOW }),
    Object.freeze({ name: 'stop', msgtype: MSGTYP_STOP }),
    Object.freeze({ name: 'more', msgtype: MSGTYP_STOP }),
    Object.freeze({ name: 'norep', msgtype: MSGTYP_NOREP }),
]);

function scanfMsgtypeRule(value) {
    const bytes = encodeUtf8ByteString(value);
    let index = 0;
    const whitespace = (byte) => (
        byte === 0x20 || (byte >= 0x09 && byte <= 0x0D)
    );
    while (whitespace(bytes[index])) ++index;

    const action = [];
    while (index < bytes.length && !whitespace(bytes[index])
           && action.length < 10) {
        action.push(bytes[index++]);
    }
    if (!action.length) return { assignments: 0 };
    while (whitespace(bytes[index])) ++index;
    if (bytes[index++] !== 0x22) {
        return {
            assignments: 1,
            action: decodeUtf8ByteString(action),
        };
    }

    const pattern = [];
    while (index < bytes.length && bytes[index] !== 0x22
           && pattern.length < 255) {
        pattern.push(bytes[index++]);
    }
    if (!pattern.length) {
        return {
            assignments: 1,
            action: decodeUtf8ByteString(action),
        };
    }
    // The closing quote is a literal after both conversions. sscanf() keeps
    // two assignments when that literal is missing or lies beyond width 255.
    return {
        assignments: 2,
        action: decodeUtf8ByteString(action),
        pattern: decodeUtf8ByteString(pattern),
    };
}

// C ref: options.c msgtype_add(). The list is prepended, so a later rc line
// has precedence when msgtype_type() walks from its head.
function msgtype_add(result, msgtype, pattern) {
    const regex = regex_init();
    if (!regex_compile(pattern, regex)) {
        configErrorAdd(
            result,
            `MSGTYPE regex error: ${regex_error_desc(regex)}`,
        );
        return false;
    }
    result.gp.plinemsg_types = {
        msgtype,
        regex,
        pattern,
        next: result.gp.plinemsg_types,
    };
    return true;
}

// C ref: options.c msgtype_parse_add(). The scanf widths count bytes, and the
// action lookup asks whether each table name starts with the supplied token.
export function msgtype_parse_add(result, value) {
    const scanned = scanfMsgtypeRule(value);
    if (scanned.assignments === 2) {
        const row = MSGTYPE_NAMES.find(({ name }) => (
            str_start_is(name, scanned.action, true)
        ));
        if (row) return msgtype_add(result, row.msgtype, scanned.pattern);
        configErrorAdd(result, `Unknown message type '${scanned.action}'`);
    } else {
        configErrorAdd(result, 'Malformed MSGTYPE');
    }
    return false;
}

// C ref: options.c msgtype_type(). The caller-supplied Norep default applies
// only after every configured rule has failed to match.
export function msgtype_type(message, norepeat, state = game) {
    for (let rule = state.gp?.plinemsg_types; rule; rule = rule.next) {
        if (regex_match(String(message), rule.regex)) return rule.msgtype;
    }
    return norepeat ? MSGTYP_NOREP : MSGTYP_NORMAL;
}

function configSection(line) {
    if (!line.startsWith('[')) return null;
    const close = line.indexOf(']', 1);
    if (close < 0) return null;
    let suffixIndex = close + 1;
    while (line[suffixIndex] === ' ') ++suffixIndex;
    if (suffixIndex < line.length && line[suffixIndex] !== '#') return null;
    return { name: trimspaces(line.slice(1, close)) };
}

// C ref: cfgfiles.c:choose_random_part().  Keep its separator walk (including
// empty-part quirks) rather than using split(), and consume rn2(1) for a
// single candidate just as the source does. For ",a", draw 0 returns "a"
// while draw 1 returns null.
function chooseRandomPart(value, random) {
    let choices = 1;
    for (const character of value) {
        if (character === ',') ++choices;
    }
    let choice = random(choices);
    if (!Number.isInteger(choice) || choice < 0 || choice >= choices) {
        throw new RangeError(`random(${choices}) returned ${choice}`);
    }

    let index = 0;
    while (choice > 0 && index < value.length) {
        ++index;
        if (value[index] === ',') --choice;
    }
    if (index < value.length) {
        if (value[index] === ',') ++index;
        const begin = index;
        while (index < value.length && value[index] !== ',') ++index;
        if (index > begin) return value.slice(begin, index);
    }
    return null;
}

export function parseNethackrc(rc, random = rn2) {
    const result = defaultResult();
    if (!rc) return result;
    const optionState = {
        seen: new Set(),
        values: {
            role: null,
            race: null,
            gender: null,
            alignment: null,
        },
    };

    // chosenSection is CHOOSE's active target; null disables filtering.
    // currentSection names the section being gated; null means that no named
    // section gate is active. An empty [] header clears both.
    let chosenSection = null;
    let currentSection = null;
    const lines = logicalConfigLines(rc, result.configErrorFrame);
    for (const configLine of lines) {
        const { lineNumber } = configLine;
        // parse_conf_buf() calls handle_config_section() on every logical
        // line. is_config_section() applies trimspaces() before checking for
        // '[', so that outer padding is removed even from CHOOSE and OPTIONS.
        // parse_config_line() then normalizes a separate copy with mungspaces().
        const paddingTrimmedLine = trimspaces(configLine.line);
        const mungedLine = mungspaces(paddingTrimmedLine);
        if (!mungedLine || mungedLine.startsWith('#')) continue;

        const section = configSection(paddingTrimmedLine);
        if (section) {
            currentSection = null;
            // cfgfiles.c handle_config_section():560-563.  A section header
            // read before any CHOOSE is reported and then skipped like any
            // other; the file keeps being read.
            if (chosenSection == null) {
                configErrorAdd(
                    result, `Section "[${section.name}]" without CHOOSE`,
                );
                continue;
            }
            if (section.name) currentSection = section.name;
            else chosenSection = null;
            continue;
        }
        if (currentSection != null
            && (chosenSection == null || currentSection !== chosenSection)) {
            continue;
        }

        const delimiter = configDelimiter(mungedLine);
        const statementNameText = delimiter >= 0
            ? mungedLine.slice(0, delimiter) : mungedLine;
        const statementName = mungspaces(statementNameText).toLowerCase();
        if (matchesConfigName(statementName, 'choose', 6)) {
            // cfgfiles.c parse_conf_buf():1775-1798.  Both arms report and
            // leave gc.config_section_chosen null, which is what makes every
            // later section header the "without CHOOSE" case above.
            if (delimiter < 0) {
                configErrorAdd(
                    result, 'Format is CHOOSE=section1,section2,...',
                );
                continue;
            }
            chosenSection = null;
            const rawDelimiter = configDelimiter(paddingTrimmedLine);
            chosenSection = chooseRandomPart(
                paddingTrimmedLine.slice(rawDelimiter + 1), random,
            );
            if (chosenSection == null)
                configErrorAdd(result, 'No config section to choose');
            continue;
        }
        if (delimiter < 0) {
            // cfgfiles.c parse_config_line():1412-1416.  Its
            // ignore_statement_errors guard belongs to
            // rcfile_interface_options()'s earlier windowtype-only pass, which
            // this port does not make.
            configErrorAdd(result, "Not a config statement, missing '='");
            continue;
        }

        const statementRow = configLineStatements.find(({ name, minLength }) => (
            matchesConfigName(statementName, name, minLength)
        ));
        // cfgfiles.c parse_config_line():1436-1437. The earlier
        // rcfile_interface_options() pass ignores unmatched rows, but the full
        // rcfile() read that builds this result reports and keeps reading.
        if (!statementRow) {
            configErrorAdd(result, 'Unknown config statement');
            continue;
        }
        const statement = CONFIG_STATEMENT_HANDLERS[statementRow.name];
        if (!statement) {
            result.unportedConfigStatements.push(statementRow.name);
            continue;
        }

        const rawValue = statement.kind === 'options'
            ? paddingTrimmedLine.slice(configDelimiter(paddingTrimmedLine) + 1)
            : mungedLine.slice(delimiter + 1);
        if (statement.kind === 'options') {
            const options = rawValue.split(',');
            // options.c recurses into the comma suffix before applying the
            // current element, so options on one line are processed right to
            // left. This makes the leftmost duplicate the final value.
            //
            // The recursion also decides how far options.c:503's `using_alias`
            // reaches: one line's worth, raised by any element and inherited by
            // every element to its left.  complain_about_duplicate() above
            // traces that.
            const aliasState = { usingAlias: false };
            for (let optionIndex = options.length - 1;
                optionIndex >= 0; --optionIndex) {
                const rawOption = options[optionIndex];
                // options.c:520-524 enforces this before stripping whitespace
                // or invoking an option handler.  The recursion into the comma
                // suffix has already run, so the other elements on the line
                // are unaffected.
                if (encodeUtf8ByteString(rawOption).length
                    > OPTION_ELEMENT_BYTE_LIMIT) {
                    configErrorAdd(
                        result,
                        'Option too long, max length is'
                        + ` ${OPTION_ELEMENT_BYTE_LIMIT} characters`,
                    );
                    continue;
                }
                const option = trimCWhitespace(rawOption);
                // options.c:526-538.  An element that is nothing but
                // whitespace is the "Empty statement" this reports; a bare
                // `OPTIONS=` reaches it as the line's only element.
                if (!option) {
                    configErrorAdd(result, 'Empty statement');
                    continue;
                }
                applyOption(
                    result, optionState, option, lineNumber, aliasState,
                );
            }
            continue;
        }

        const normalizedValue = mungspaces(rawValue);
        if (statement.kind === 'autopickup-exception') {
            add_autopickup_exception(result, normalizedValue);
            continue;
        }
        if (statement.kind === 'msgtype') {
            msgtype_parse_add(result, normalizedValue);
            continue;
        }
        if (statement.kind === 'bindings') {
            applyMenuBindings(result, normalizedValue);
            continue;
        }
        if (statement.kind === 'symbols') {
            appendSymbolOverrides(
                result,
                statement.set,
                parseSymbolAssignments(normalizedValue, lineNumber),
            );
            continue;
        }
        if (statement.kind === 'status-hilite') {
            // cfgfiles.c cnf_line_HILITE_STATUS() passes parse_config_line()'s
            // munged post-delimiter value directly to parse_status_hl1() with
            // from_configfile TRUE.  OPTIONS=hilite_status reaches the same
            // parser while reading an rc file, so its port already has those
            // semantics; unlike that option handler, an empty direct value is
            // accepted and enables the default duration.
            parse_status_hl1(result, normalizedValue);
            continue;
        }
        if (statement.kind === 'legacy-boulder') {
            cnf_line_BOULDER(result, normalizedValue);
            continue;
        }
        if (statement.kind === 'warnings') {
            cnf_line_WARNINGS(result, normalizedValue, assign_warnings);
            continue;
        }
        if (statement.kind === 'autocomplete') {
            parseautocomplete(
                normalizedValue,
                true,
                result,
                (text) => result.startupEvents.push({ text, wait: true }),
            );
            continue;
        }

        applyDirectOption(result, statement.directName, normalizedValue);
    }

    return result;
}

// ===========================================================================
// options.c doset() -- the '#optionsfull' menu, reached from 'O' with the 'm'
// prefix through doset_simple().  Everything below builds that menu and hands
// it to the window port; applying the picks stays unported.
// ===========================================================================

// Thrown where the options menu reaches an options.c path this port has not
// implemented.  Every stop names the C function that is missing.
export class UnsupportedOptionMenuError extends Error {
    constructor(what) {
        super(`the options menu requires ${what}`);
        this.name = 'UnsupportedOptionMenuError';
        this.what = what;
    }
}

// C ref: global.h enum optset_restrictions, the values doset() compares
// allopt[].setwhere against.
const set_in_config = 1;
const set_gameview = 3;
const set_in_game = 4;
const set_wizonly = 5;
const set_wiznofuz = 6;

// C ref: options.c wc_options[] and wc2_options[].  Each option names the
// window-port capability its interface must advertise; doset() hides an
// option whose interface does not.  Naming the capability rather than its
// winprocs.h bit keeps the mapping readable, because nothing here combines
// capabilities arithmetically.
const WC_OPTION_CAPABILITY = Object.freeze(new Map([
    ['ascii_map', 'WC_ASCII_MAP'],
    ['color', 'WC_COLOR'],
    ['eight_bit_tty', 'WC_EIGHT_BIT_IN'],
    ['hilite_pet', 'WC_HILITE_PET'],
    ['perm_invent', 'WC_PERM_INVENT'],
    ['perminv_mode', 'WC_PERM_INVENT'],
    ['popup_dialog', 'WC_POPUP_DIALOG'],
    ['player_selection', 'WC_PLAYER_SELECTION'],
    ['preload_tiles', 'WC_PRELOAD_TILES'],
    ['tiled_map', 'WC_TILED_MAP'],
    ['tile_file', 'WC_TILE_FILE'],
    ['tile_width', 'WC_TILE_WIDTH'],
    ['tile_height', 'WC_TILE_HEIGHT'],
    ['align_message', 'WC_ALIGN_MESSAGE'],
    ['align_status', 'WC_ALIGN_STATUS'],
    ['font_map', 'WC_FONT_MAP'],
    ['font_menu', 'WC_FONT_MENU'],
    ['font_message', 'WC_FONT_MESSAGE'],
    ['font_size_map', 'WC_FONTSIZ_MAP'],
    ['font_size_menu', 'WC_FONTSIZ_MENU'],
    ['font_size_message', 'WC_FONTSIZ_MESSAGE'],
    ['font_size_status', 'WC_FONTSIZ_STATUS'],
    ['font_size_text', 'WC_FONTSIZ_TEXT'],
    ['font_status', 'WC_FONT_STATUS'],
    ['font_text', 'WC_FONT_TEXT'],
    ['map_mode', 'WC_MAP_MODE'],
    ['scroll_amount', 'WC_SCROLL_AMOUNT'],
    ['scroll_margin', 'WC_SCROLL_MARGIN'],
    ['splash_screen', 'WC_SPLASH_SCREEN'],
    ['use_inverse', 'WC_INVERSE'],
    ['vary_msgcount', 'WC_VARY_MSGCOUNT'],
    ['windowcolors', 'WC_WINDOWCOLORS'],
    ['mouse_support', 'WC_MOUSE_SUPPORT'],
]));

const WC2_OPTION_CAPABILITY = Object.freeze(new Map([
    ['armorstatus', 'WC2_EXTRASTATUS'],
    ['fullscreen', 'WC2_FULLSCREEN'],
    ['guicolor', 'WC2_GUICOLOR'],
    ['hilite_status', 'WC2_HILITE_STATUS'],
    ['hitpointbar', 'WC2_HITPOINTBAR'],
    ['menu_shift', 'WC2_MENU_SHIFT'],
    ['petattr', 'WC2_PETATTR'],
    ['softkeyboard', 'WC2_SOFTKEYBOARD'],
    // The name shown in the 'O' menu differs from the option name.
    ['status hilite rules', 'WC2_HILITE_STATUS'],
    // statushilites has no bit of its own.
    ['statushilites', 'WC2_HILITE_STATUS'],
    ['statuslines', 'WC2_STATUSLINES'],
    ['term_cols', 'WC2_TERM_SIZE'],
    ['term_rows', 'WC2_TERM_SIZE'],
    ['terrainstatus', 'WC2_EXTRASTATUS'],
    ['use_darkgray', 'WC2_DARKGRAY'],
    ['weaponstatus', 'WC2_EXTRASTATUS'],
    ['windowborders', 'WC2_WINDOWBORDERS'],
    ['wraptext', 'WC2_WRAPTEXT'],
]));

// C ref: win/tty/wintty.c tty_procs.wincap and .wincap2.  This build compiles
// none of TTY_PERM_INVENT, MSDOS or WIN32CON, so wincap carries only the four
// unconditional bits; SELECTSAVED and STATUS_HILITES are both defined in
// config.h and NO_TERMS is not, so wincap2 carries every bit listed there.
const TTY_WINCAP = Object.freeze(new Set([
    'WC_COLOR', 'WC_HILITE_PET', 'WC_INVERSE', 'WC_EIGHT_BIT_IN',
]));
const TTY_WINCAP2 = Object.freeze(new Set([
    'WC2_SELECTSAVED', 'WC2_HILITE_STATUS', 'WC2_HITPOINTBAR',
    'WC2_FLUSH_STATUS', 'WC2_RESET_STATUS', 'WC2_DARKGRAY',
    'WC2_SUPPRESS_HIST', 'WC2_URGENT_MESG', 'WC2_STATUSLINES',
    'WC2_U_UTF8STR', 'WC2_PETATTR', 'WC2_EXTRACOLORS', 'WC2_EXTRASTATUS',
]));

// C ref: options.c is_wc_option(), wc_supported(), is_wc2_option() and
// wc2_supported().
function is_wc_option(name) { return WC_OPTION_CAPABILITY.has(name); }
function wc_supported(name) {
    return TTY_WINCAP.has(WC_OPTION_CAPABILITY.get(name));
}
function is_wc2_option(name) { return WC2_OPTION_CAPABILITY.has(name); }
function wc2_supported(name) {
    return TTY_WINCAP2.has(WC2_OPTION_CAPABILITY.get(name));
}

// The three menu loops repeat this pair of tests verbatim.
function unsupportedWindowOption(name) {
    return (is_wc_option(name) && !wc_supported(name))
        || (is_wc2_option(name) && !wc2_supported(name));
}

// C ref: options.c initoptions_finish() (7366-7374).  The configuration file
// can request either map mode before the selected window port is known.  This
// port's only interface is TTY, which does not advertise WC_TILED_MAP, so the
// first source arm always changes a requested tiled map back to ASCII.  The
// other source arm needs an interface that supports tiles and is outside this
// runtime boundary.
export function finishStartupBooleanOptions(state) {
    if (state.iflags.wc_tiled_map) {
        state.iflags.wc_tiled_map = false;
        state.iflags.wc_ascii_map = true;
    }
}

// C ref: options.c initoptions_finish() (7324-7383), after rcfile() has
// returned.  Keep the source-owned startup sequence together here: install
// fruit state, activate the final primary boulder override, reconcile the
// dark-room symbol, then apply the selected TTY map-mode fallback.
//
// reset_glyphmap(gm_optionchange) follows reglyph_darkroom() in C.  This port
// resolves glyph presentation on demand and has no stored glyphmap to reset.
// update_rest_on_space() follows that reset; command binding initialization
// consumes the already-recorded rest_on_space operation later in start().
export function initoptions_finish(parsedOptions = {}, state = game, env = {}) {
    finish_fruit_option(parsedOptions, state, env);
    finish_boulder_symbol(state);
    reglyph_darkroom(state);
    finishStartupBooleanOptions(state);
}

// C ref: options.c longest_option_name().  The two passes differ only in
// which options the first one skips, and both feed the same maximum.
export function longest_option_name(startpass, endpass) {
    let longest_name_len = 0;
    for (let pass = 0; pass < 2; pass++) {
        for (const option of allopt) {
            if (pass === 0
                && (option.opttyp !== 'BoolOpt' || !option.addr)) continue;
            const optflags = option.setwhere;
            if (optflags < startpass || optflags > endpass) continue;
            if (unsupportedWindowOption(option.name)) continue;
            if (option.name.length > longest_name_len)
                longest_name_len = option.name.length;
        }
    }
    return longest_name_len;
}

// C ref: options.c term_for_boolean().  booleanterms[][0] is the value shown
// unless the option asked for one of the other three vocabularies.
const BOOLEAN_TERMS = Object.freeze([
    Object.freeze(['false', 'off', 'disabled', 'excluded from build']),
    Object.freeze(['true', 'on', 'enabled', 'included']),
]);

export function term_for_boolean(index, value) {
    const f_t = value ? 1 : 0;
    let boolean_term = BOOLEAN_TERMS[f_t][0];
    const i = allopt[index].termpref;
    if (i > 0 && i < BOOLEAN_TERMS[0].length) boolean_term = BOOLEAN_TERMS[f_t][i];
    return boolean_term;
}

// allopt[].addr names the C lvalue that stores a boolean option's value.
// Its four roots are the live option structures this port keeps on the game
// state; jsmain.js installs flags, iflags and a11y from parseNethackrc(), and
// u_init_misc() carries u.uroleplay across its memset boundary.
function booleanOptionValue(state, option) {
    const path = option.addr.split('.');
    let owner = state;
    for (let index = 0; index < path.length - 1; ++index)
        owner = owner?.[path[index]];
    const value = owner?.[path[path.length - 1]];
    if (typeof value !== 'boolean') {
        throw new UnsupportedOptionMenuError(
            `a live value for boolean option '${option.name}' (${option.addr})`,
        );
    }
    return value;
}

// C ref: coloratt.c colornames[] and attrnames[], each truncated at the NULL
// entry that separates canonical names from aliases; clr2colorname() and
// attr2attrname() return the first entry whose value matches.  The port's
// attribute set holds four of C's seven values, because recorder patch 006
// retains only bold, underline and inverse, so dim, italic and blink share
// ATR_NONE and cannot be named apart from it.
const COLOR_NAMES = Object.freeze([
    ['black', CLR_BLACK], ['red', CLR_RED], ['green', CLR_GREEN],
    ['brown', CLR_BROWN], ['blue', CLR_BLUE], ['magenta', CLR_MAGENTA],
    ['cyan', CLR_CYAN], ['gray', CLR_GRAY], ['orange', CLR_ORANGE],
    ['light green', CLR_BRIGHT_GREEN], ['yellow', CLR_YELLOW],
    ['light blue', CLR_BRIGHT_BLUE], ['light magenta', CLR_BRIGHT_MAGENTA],
    ['light cyan', CLR_BRIGHT_CYAN], ['white', CLR_WHITE],
    ['no color', NO_COLOR],
]);
const ATTR_NAMES = Object.freeze([
    ['none', ATR_NONE], ['bold', ATR_BOLD], ['underline', ATR_UNDERLINE],
    ['inverse', ATR_INVERSE],
]);

function nameForValue(table, value, what) {
    const found = table.find(([, candidate]) => candidate === value);
    if (!found) throw new UnsupportedOptionMenuError(`a name for ${what}`);
    return found[0];
}

// C ref: coloratt.c color_attr_to_str().
function color_attr_to_str(ca) {
    return `${nameForValue(COLOR_NAMES, ca.color, `color ${ca.color}`)}`
        + `&${nameForValue(ATTR_NAMES, ca.attr, `attribute ${ca.attr}`)}`;
}

// C ref: options.c oc_to_str(), which spells an object-class list with the
// fixed drawing.c def_oc_syms[] symbols rather than the active symbol set.
export function oc_to_str(classes) {
    return classes
        .map((oclass) => String.fromCharCode(
            DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + oclass],
        ))
        .join('');
}

// C ref: options.c's file-scope strings shared by several handlers.
const none = '(none)';
const randomrole = 'random';
const to_be_done = '(to be done)';

// C ref: options.c rolestring().
function rolestring(val, array, field) {
    if (val >= 0) return field(array[val]);
    return val === ROLE_RANDOM ? randomrole : none;
}

// C ref: options.c unlocktypes[], burdentype[], runmodes[], sortltype[] and
// menutype[]; insight.c vanqorders[]; o_init.c disco_order_let and
// disco_orders_descr[]; decl.c disclosure_options; symbols.c
// known_handling[].  Only the columns the value column shows are kept.
// optfn_autounlock() maps each source-table index to 1U << index; this order
// therefore owns the UNTRAP/APPLY_KEY/KICK/FORCE bits 1/2/4/8.
const unlocktypes = Object.freeze(['untrap', 'apply-key', 'kick', 'force']);
const burdentype = Object.freeze([
    'unencumbered', 'burdened', 'stressed',
    'strained', 'overtaxed', 'overloaded',
]);
const runmodes = Object.freeze(['teleport', 'run', 'walk', 'crawl']);
const sortltype = Object.freeze(['none', 'loot', 'full']);
const menutype = Object.freeze([
    'traditional', 'combination', 'full', 'partial',
]);
const objsymvals = Object.freeze([
    'none', 'headers', 'entries', 'both', 'conditional', 'one-or-other',
]);
const vanqorders = Object.freeze([
    ['t', 'traditional: by monster level'],
    ['d', 'by monster difficulty rating'],
    ['a', 'alphabetically, unique monsters separate'],
    ['A', 'alphabetically, unique monsters intermixed'],
    ['C', 'by monster class, high to low level in class'],
    ['c', 'by monster class, low to high level in class'],
    ['n', 'by count, high to low'],
    ['z', 'by count, low to high'],
]);
const disco_order_let = 'osca';
const disco_orders_descr = Object.freeze([
    'by order of discovery within each class',
    'sortloot order (by class with some sub-class groupings)',
    'alphabetical within each class',
    'alphabetical across all classes',
]);
const disclosure_options = 'iavgco';
const known_handling = Object.freeze([
    'UNKNOWN', 'IBM', 'DEC', 'CURS', 'MAC', 'UTF8',
]);
// C ref: options.c paranoia[].  The setter walks all fifteen rows, including
// the two config-only choices at the end.  The value getter stops at "none",
// the first zero mask, so neither config-only choice is ever printed.
const paranoia = Object.freeze([
    [PARANOID_CONFIRM, 'Confirm', 1, 'Paranoia', 2],
    [PARANOID_QUIT, 'quit', 1, 'explore', 2],
    [PARANOID_DIE, 'die', 1, 'death', 2],
    [PARANOID_BONES, 'bones', 1, null, 0],
    [PARANOID_HIT, 'attack', 1, 'hit', 1],
    [PARANOID_BREAKWAND, 'wand-break', 2, 'break-wand', 2],
    [PARANOID_EATING, 'eat', 1, 'continue', 4],
    [PARANOID_WERECHANGE, 'Were-change', 2, null, 0],
    [PARANOID_PRAY, 'pray', 1, null, 0],
    [PARANOID_TRAP, 'trap', 1, 'move-trap', 1],
    [PARANOID_AUTOALL, 'Autoall', 2, 'autoselect-all', 2],
    [PARANOID_SWIM, 'swim', 1, null, 0],
    [PARANOID_REMOVE, 'Remove', 1, 'Takeoff', 1],
    [0, 'none', 4, null, 0],
    [0xFFFFFFFF, 'all', 3, null, 0],
]);
// C ref: options.c n_currently_set.
function n_currently_set(count) {
    return `(${count} currently set)`;
}

// C ref: options.c petname_optfn(), shared by catname, dogname and horsename.
function petname_optfn(state, option) {
    const petname = state[option.name] ?? '';
    return petname || none;
}

// C ref: botl.c status_hilite_linestr_gather_conditions().  Condition rules
// are stored as writes to gc.cond_hilites[], unlike the one-node-per-rule
// threshold lists for ordinary fields.  Replaying those writes gives each
// condition its final lowest-numbered color and accumulated attributes.  C
// then coalesces conditions with the same final pair into one menu line, so
// this count is the number of distinct non-empty pairs rather than the number
// of configuration statements.
function status_hilite_linestr_gather_conditions(rules) {
    const conditionStyles = new Map();
    for (const rule of rules) {
        if (rule.field !== 'condition') continue;
        for (const condition of rule.conditions) {
            const style = conditionStyles.get(condition) ?? {
                colors: new Set(),
                attrib: HL_UNDEF,
            };
            if (rule.style.clearAttributes) style.attrib = HL_UNDEF;
            style.attrib |= rule.style.attrib;
            // A null color marks parse_condition() returning after it had
            // stored attributes but before its final color-array write.
            if (rule.style.color !== null)
                style.colors.add(rule.style.color);
            conditionStyles.set(condition, style);
        }
    }

    const gathered = new Set();
    for (const condition of SOURCE_CONDITION_NAMES) {
        const style = conditionStyles.get(condition);
        if (!style) continue;
        const color = style.colors.size
            ? Math.min(...style.colors) : NO_COLOR;
        // gather_conditions() begins with HL_NONE and removes that sentinel
        // when any real attribute bit is present.
        const attrib = style.attrib === HL_UNDEF ? HL_NONE
            : style.attrib & ~HL_NONE;
        if (color !== NO_COLOR || attrib !== HL_NONE)
            gathered.add(`${color}:${attrib}`);
    }
    return [...gathered];
}

// C ref: botl.c status_hilite_linestr_gather().  count_status_hilites() only
// observes the gathered list's length, so its entries can be opaque here:
// every ordinary field rule contributes one, then the coalesced condition
// entries follow.  Building a fresh array also preserves C's gather/done
// idempotence without changing the configured rule list.
function status_hilite_linestr_gather(state) {
    const rules = state.iflags?.status_hilites ?? [];
    return [
        ...rules.filter((rule) => rule.field !== 'condition'),
        ...status_hilite_linestr_gather_conditions(rules),
    ];
}

// C ref: botl.c count_status_hilites(), used by options.c
// optfn_hilite_status(get_val) and optfn_o_status_hilites(get_val).
function count_status_hilites(state) {
    return status_hilite_linestr_gather(state).length;
}

// C ref: options.c count_cond(), over botl.c condtests[].
function count_cond(state) {
    return Object.values(state.iflags?.status_conditions ?? {})
        .filter(Boolean).length;
}

// C ref: options.c count_apes(), over ga.apelist.
function count_apes(state) {
    let numapes = 0;
    for (let ape = state.ga?.apelist; ape; ape = ape.next) numapes++;
    return numapes;
}

// A configuration statement cfgfiles.c dispatches and parseNethackrc() only
// records.  The list each one appends to is the list a count below walks, so
// the count stops here rather than reporting the empty list as the session's.
export function hasUnportedConfigStatement(state, name) {
    return Boolean(state.unportedConfigStatements?.includes(name));
}

function refuseUnportedConfigStatement(state, name) {
    if (hasUnportedConfigStatement(state, name)) {
        throw new UnsupportedOptionMenuError(
            `cfgfiles.c cnf_line_${name.toUpperCase()}()`,
        );
    }
}

// C ref: coloratt.c count_menucolors(). cnf_line_MENUCOLOR() remains unported,
// and the interactive menu command that would add entries is outside this
// startup slice.
function count_menucolors(state) {
    refuseUnportedConfigStatement(state, 'menucolor');
    return 0;
}
function msgtype_count(state) {
    let count = 0;
    for (let rule = state.gp?.plinemsg_types; rule; rule = rule.next) ++count;
    return count;
}

// parseNethackrc() gives source semantics to the options its own arms parse
// and falls back to keeping an unported option's raw text under
// flags[<option name>].  For an option whose parsed home is that same field,
// the raw text overwrites the parsed value rather than sitting beside it, and
// showing the compiled-in default would misreport the session.  Every such
// option's parsed form is a number, so a type test finds the raw string.
function requireParsedNumber(state, option) {
    const value = state.flags[option.name];
    if (typeof value !== 'number') {
        throw new UnsupportedOptionMenuError(
            `parseoptions() to interpret '${option.name}'`,
        );
    }
    return value;
}

// The get_val and get_cnf_val arms of both alignment handlers use the same
// four names and print "default" for a value outside the ALIGN_* constants.
function windowAlignmentValue(value) {
    return WINDOW_ALIGNMENTS.find(([, alignment]) => alignment === value)?.[0]
        ?? 'default';
}

// The value column each compound and other option shows.  Every entry ports
// its options.c optfn_<name>() get_val arm; the key is allopt[].optfn, which
// is that function's name.  A handler returns the C buffer's contents, so an
// empty string is the "left the buffer alone" result doset_add_menu() shows
// as "unknown".
const OPTION_VALUE_HANDLERS = Object.freeze({
    // windowprocs.name, which is WPID(tty) for this build's only interface.
    windowtype: () => 'tty',
    playmode: (state) => (state.flags.debug ? 'debug'
        : state.flags.explore ? 'explore' : 'normal'),
    // svp.plname; jsmain.js installs the same value as state.plname.
    name: (state) => state.plname ?? '',
    role: (state) => rolestring(
        state.flags.initrole, roles, (entry) => entry.name.m,
    ),
    race: (state) => rolestring(
        state.flags.initrace, races, (entry) => entry.noun,
    ),
    gender: (state) => rolestring(
        state.flags.initgend, genders, (entry) => entry.adj,
    ),
    alignment: (state) => rolestring(
        state.flags.initalign, aligns, (entry) => entry.adj,
    ),
    align_message: (state) => windowAlignmentValue(
        state.iflags.wc_align_message,
    ),
    align_status: (state) => windowAlignmentValue(
        state.iflags.wc_align_status,
    ),
    catname: petname_optfn,
    dogname: petname_optfn,
    horsename: petname_optfn,
    msghistory: (state) => `${state.iflags.msg_history}`,
    pettype: (state) => {
        const preferred = state.gp?.preferred_pet;
        return preferred === 'c' ? 'cat'
            : preferred === 'd' ? 'dog'
                : preferred === 'h' ? 'horse'
                    : preferred === 'n' ? 'none' : 'random';
    },
    soundlib: (state) => get_soundlib_name(state),
    autounlock: (state, option) => {
        const bits = requireParsedNumber(state, option);
        if (!bits) return 'none';
        return unlocktypes
            .filter((_name, index) => (bits & (1 << index)))
            .join(' + ');
    },
    // go.ov_primary_syms holds an explicit S_boulder override; without one
    // the value falls back to the active rock-class symbol.
    boulder: (state) => decodeUtf8ByteString([
        state.go?.ov_primary_syms?.[SYM_OFF_X + SYM_BOULDER]
        || state.gs.showsyms[SYM_OFF_O + ROCK_CLASS],
    ]),
    // gc.crash_email and gc.crash_name are null until a configuration file
    // sets them, and C then leaves the buffer empty.  decl.c initializes
    // crash_urlmax to -1 and its handler always prints the signed decimal.
    crash_email: (state) => state.gc?.crash_email ?? '',
    crash_name: (state) => state.gc?.crash_name ?? '',
    crash_urlmax: (state) => `${state.gc?.crash_urlmax ?? -1}`,
    disclose: (state) => state.flags.end_disclose
        .map((setting, index) => `${setting}${disclosure_options[index]}`)
        .join(' '),
    fruit: (state) => state.svp.pl_fruit,
    glyph: () => to_be_done,
    hilite_status: (state) => (count_status_hilites(state)
        ? '(see "status highlight rules" below)' : none),
    // strNsubst(ca_buf, " ", "-", 0) replaces every space, so a two-word
    // color or attribute name becomes hyphenated.
    menu_headings: (state) => color_attr_to_str(state.iflags.menu_headings)
        .replaceAll(' ', '-'),
    menu_objsyms: (state) => objsymvals[state.iflags.menuobjsyms],
    menuinvertmode: (state) => `${state.iflags.menuinvertmode}`,
    menustyle: (state) => menutype[state.flags.menu_style],
    // WINDOWPORT(curses) rewrites two of the four settings; this build's
    // interface is tty, which supports all four.
    msg_window: (state) => {
        const tmp = state.iflags.prevmsg_window;
        return tmp === 's' ? 'single'
            : tmp === 'c' ? 'combination'
                : tmp === 'f' ? 'full' : 'reversed';
    },
    // The non-WIN32 get_val arm.  TTY does not advertise WC_MOUSE_SUPPORT,
    // so its option menus exclude this row before asking for the value.
    mouse_support: (state) => {
        const modes = [
            '0=off', '1=on, O/S adjusted', '2=on, O/S unchanged',
        ];
        return modes[state.iflags.wc_mouse_support] ?? '';
    },
    // optfn_map_mode()'s source getter omits mode 11 even though its setter
    // accepts tiles_fit_to_screen, so that stored value reports "default".
    map_mode: (state) => {
        const names = [
            'tiles', 'ascii4x6', 'ascii6x8', 'ascii8x8', 'ascii16x8',
            'ascii7x12', 'ascii8x12', 'ascii16x12', 'ascii12x16',
            'ascii10x18', 'fit_to_screen',
        ];
        return names[state.iflags.wc_map_mode] ?? 'default';
    },
    number_pad: (state) => {
        const numpadmodes = [
            '0=off', '1=on', '2=on, MSDOS compatible',
            '3=on, phone-style layout',
            '4=on, phone layout, MSDOS compatible',
            '-1=off, y & z swapped',
        ];
        // gc.Cmd's three parsed fields, which js/options.js packs into
        // iflags.num_pad_mode: bit 0 is pcHack_compat when the pad is on and
        // swap_yz when it is off, and bit 1 is phone_layout.
        const mode = state.iflags.num_pad_mode;
        const indx = state.iflags.num_pad
            ? ((mode & 2) ? ((mode & 1) ? 4 : 3) : ((mode & 1) ? 2 : 1))
            : ((mode & 1) ? 5 : 0);
        return numpadmodes[indx];
    },
    packorder: (state) => oc_to_str(state.flags.inv_order),
    paranoid_confirmation: (state) => {
        const bits = state.flags.paranoia_bits;
        const names = paranoia
            .slice(0, paranoia.findIndex(([mask]) => mask === 0))
            // paranoid_confirm:bones is hidden during play outside debug mode.
            .filter(([mask]) => (bits & mask)
                && (mask !== PARANOID_BONES || state.wizard))
            .map(([, argname]) => argname);
        return names.length ? names.join(' ') : 'none';
    },
    // The tty and curses arm; this build's interface is tty.
    petattr: (state) => nameForValue(
        ATTR_NAMES, state.iflags.wc2_petattr,
        `attribute ${state.iflags.wc2_petattr}`,
    ),
    pickup_burden: (state) => burdentype[state.flags.pickup_burden],
    pickup_types: (state) => {
        const ocl = oc_to_str(state.flags.pickup_types);
        return ocl || 'all';
    },
    pile_limit: (state) => `${state.flags.pile_limit}`,
    roguesymset: (state) => symsetValue(state, ROGUESET, false),
    runmode: (state) => runmodes[state.flags.runmode],
    scores: (state) => {
        let opts = '';
        if (state.flags.end_top > 0) opts = `${state.flags.end_top} top`;
        if (state.flags.end_around > 0) {
            opts += `${state.flags.end_top > 0 ? '/' : ''}`
                + `${state.flags.end_around} around`;
        }
        if (state.flags.end_own) {
            opts += `${(state.flags.end_top > 0
                || state.flags.end_around > 0) ? '/' : ''}own`;
        }
        return opts || 'none';
    },
    scroll_amount: (state) => (state.iflags.wc_scroll_amount
        ? `${state.iflags.wc_scroll_amount}` : 'default'),
    scroll_margin: (state) => (state.iflags.wc_scroll_margin
        ? `${state.iflags.wc_scroll_margin}` : 'default'),
    term_cols: (state) => (state.iflags.wc2_term_cols
        ? `${state.iflags.wc2_term_cols}` : 'default'),
    term_rows: (state) => (state.iflags.wc2_term_rows
        ? `${state.iflags.wc2_term_rows}` : 'default'),
    tile_height: (state) => (state.iflags.wc_tile_height
        ? `${state.iflags.wc_tile_height}` : 'default'),
    tile_width: (state) => (state.iflags.wc_tile_width
        ? `${state.iflags.wc_tile_width}` : 'default'),
    vary_msgcount: (state) => (state.iflags.wc_vary_msgcount
        ? `${state.iflags.wc_vary_msgcount}` : 'default'),
    // o_init.c get_sortdisco() with cnf FALSE.
    sortdiscoveries: (state) => {
        const index = disco_order_let.indexOf(state.flags.discosort);
        return disco_orders_descr[index < 0 ? 0 : index];
    },
    sortloot: (state) => sortltype.find(
        (name) => name[0] === state.flags.sortloot,
    ) ?? '',
    sortvanquished: (state) => {
        const order = vanqorders[state.flags.vanq_sortmode];
        return `${order[0]}: ${order[1]}`;
    },
    statushilites: (state) => (state.iflags.hilite_delta
        ? `${state.iflags.hilite_delta} (on: highlight status for `
            + `${state.iflags.hilite_delta} turns)`
        : "0 (off: don't highlight status fields)"),
    statuslines: (state) => (wc2_supported('statuslines')
        ? (state.iflags.wc2_statuslines < 3 ? '2' : '3') : 'unknown'),
    suppress_alert: (state, option) => {
        // C ref: optfn_suppress_alert(get_val), including the macros whose
        // major field is deliberately unmasked while minor and patch retain
        // one byte each. Arithmetic avoids JavaScript's signed 32-bit
        // bitwise conversion.
        const packed = requireParsedNumber(state, option);
        if (packed === 0) return none;
        const major = Math.floor(packed / 0x01000000);
        const minor = Math.floor(packed / 0x00010000) % 0x100;
        const patch = Math.floor(packed / 0x00000100) % 0x100;
        return `${major}.${minor}.${patch}`;
    },
    symset: (state) => symsetValue(state, PRIMARYSET, true),
    // versinfo is the remaining option whose parsed home is its own field and
    // whose parse arm requires a value. `OPTIONS=versinfo` therefore reaches
    // applyBooleanOption()'s fallback after C reports the missing value, so
    // this handler retains requireParsedNumber() as the same-field guard.
    versinfo: (state, option) => {
        const vi = requireParsedNumber(state, option);
        const g = (vi & VI_NAME) !== 0;
        const b = (vi & VI_BRANCH) !== 0;
        const n = (vi & VI_NUMBER) !== 0;
        return `${vi}: ${g ? 'name' : ''}${(b && g) ? '+' : ''}`
            + `${b ? 'branch' : ''}${(n && (b || g)) ? '+' : ''}`
            + `${n ? 'number' : ''} (${status_version(state.flags, false)})`;
    },
    whatis_coord: (state) => {
        const coords = state.iflags.getpos_coords;
        return coords === GPCOORDS_MAP ? 'map'
            : coords === GPCOORDS_COMPASS ? 'compass'
                : coords === GPCOORDS_COMFULL ? 'full compass'
                    : coords === GPCOORDS_SCREEN ? 'screen' : 'none';
    },
    whatis_filter: (state) => {
        const filter = state.iflags.getloc_filter;
        return filter === GFILTER_VIEW ? 'view'
            : filter === GFILTER_AREA ? 'area' : 'none';
    },
    o_autocomplete: (state) => n_currently_set(count_autocompletions(state)),
    o_autopickup_exceptions: (state) => n_currently_set(count_apes(state)),
    // cmd.c count_bind_keys(), ported in js/cmd.js beside the cmdbinds model
    // it walks. It arrives through helpers rather than an import because
    // js/cmd.js already imports this module.
    o_bind_keys: (state, option, helpers) => n_currently_set(
        helpers.countBindKeys(state),
    ),
    o_menu_colors: (state) => n_currently_set(count_menucolors(state)),
    o_message_types: (state) => n_currently_set(msgtype_count(state)),
    o_status_cond: (state) => n_currently_set(count_cond(state)),
    o_status_hilites: (state) => n_currently_set(count_status_hilites(state)),
});

// C ref: optfn_symset() and optfn_roguesymset(), which differ only in the set
// they report and in the handler suffix the primary set adds.
function symsetValue(state, set, withHandling) {
    const entry = state.gs?.symset?.[set] ?? {};
    let opts = entry.name ? entry.name : 'default';
    if (state.gc?.currentgraphics === set && entry.name) opts += ', active';
    if (withHandling && entry.handling)
        opts += `, handler=${known_handling[entry.handling]}`;
    return opts;
}

// parseNethackrc() gives source semantics to the options its own arms parse
// and preserves every other option's raw text under flags[<option name>].  A
// value kept that way never reached the field the handler above reads, so the
// menu would show the compiled-in default instead of the session's setting.
//
// Membership is every shown compound option that parseNethackrc() leaves as
// raw text under flags[<option name>] and whose handler above reads some
// other field, so the raw text sits beside the value rather than replacing
// it. Where the raw text lands in the very field the handler reads --
// versinfo -- there is nothing left to compare against, so it is guarded by
// type inside its handler instead and is not a member. The other-settings
// rows need neither guard: each counts live state rather than reading an
// option field.
// scripts/options-menu.test.mjs derives the whole rule from parseNethackrc(),
// so the set cannot drift from OPTION_VALUE_HANDLERS unnoticed.
export const UNPARSED_COMPOUND_OPTIONS = Object.freeze(new Set([
    'glyph',
    'windowtype',
]));

// C ref: options.c doset_add_menu()'s optfn call, plus the "unknown" default
// it keeps when the handler writes nothing.
export function optionValue(state, option, helpers) {
    if (UNPARSED_COMPOUND_OPTIONS.has(option.name)
        && state.flags?.[option.name] !== undefined) {
        throw new UnsupportedOptionMenuError(
            `parseoptions() to interpret '${option.name}'`,
        );
    }
    const handler = OPTION_VALUE_HANDLERS[option.optfn];
    if (!handler)
        throw new UnsupportedOptionMenuError(`optfn_${option.optfn}()`);
    return handler(state, option, helpers);
}

// C ref: options.c doset_add_menu().  idx < 0 is the PREFIXES_IN_USE arm,
// which this build does not compile, so every call names a real option.
function doset_add_menu(
    state, helpers, items, option, format, index, indexoffset,
) {
    const a_int = indexoffset === 0 ? 0 : index + 1 + indexoffset;
    const value = optionValue(state, option, helpers);
    // "    " replaces "a - " -- assumes menus follow that style.
    const indent = !a_int ? '    ' : '';
    const text = format(indent, option.name, value || 'unknown');
    items.push(a_int ? { text, value: a_int } : { text });
}

// options.c doset() lists menu_tab_sep only for a hero in debug mode, because
// its setwhere is set_wizonly -- but that restriction governs the listing
// alone.  optfn_boolean()'s do_set arm rejects only set_in_config after
// startup and set_wiznofuz at startup, so a configuration file turns
// iflags.menu_tab_sep on in an ordinary game, and every line of the menu then
// takes the "%s%s\t[%s]" form with no pass 0 indent.
const MENU_TAB_SEP = allopt.find(
    (option) => option.name === 'menu_tab_sep',
);

// C ref: options.c doset()'s fmtstr_doset, the "%s%-Nus [%s]" branch.
// fmtstr_tab_doset, the branch above, is not ported.
function dosetEntryFormat(state, startpass, endpass) {
    if (booleanOptionValue(state, MENU_TAB_SEP))
        throw new UnsupportedOptionMenuError('doset() with menu_tab_sep');
    const width = longest_option_name(startpass, endpass);
    return (indent, name, value) => `${indent}${name.padEnd(width)} [${value}]`;
}

// C ref: options.c doset()'s cmdassist help block.  helptext[]'s single NULL
// marks where the selectable '?' entry is inserted.
const DOSET_HELPTEXT = Object.freeze([
    "For a brief explanation of how this works, type '?' to select",
    'the next menu choice, then press <enter> or <return>.',
    null,
    "[To suppress this menu help, toggle off the 'cmdassist' option.]",
    '',
]);

// C ref: options.c HELP_IDX, which is SIZE(allopt): the table's own length
// plus the terminating entry allopt_init[] carries.
const HELP_IDX = allopt.length + 1;

// C ref: options.c doset()'s `indexoffset = 1` (8830).  Every selectable
// entry's a_int is its allopt[] index plus one for select_menu()'s own offset
// plus this, and the pick loop subtracts all three back out again.
const DOSET_INDEXOFFSET = 1;

// C ref: options.c doset(), everything up to select_menu().  Returns the menu
// specification the window port renders.
export function dosetMenuItems(state, helpers, skiphelp) {
    const items = [];
    if (!skiphelp) {
        for (const line of DOSET_HELPTEXT) {
            if (line !== null) {
                items.push({ text: `    ${line.slice(0, 75)}` });
            } else {
                items.push({
                    text: 'view help for options menu',
                    value: HELP_IDX + 1,
                    selector: '?',
                    groupSelector: '?',
                });
            }
        }
    }

    // wizard mode would widen both ends; this port has no set_in_sysconf arm
    // because SYSCF's `#ifdef notyet` block is not compiled.
    const startpass = set_gameview;
    const endpass = state.wizard ? set_wiznofuz : set_in_game;
    const format = dosetEntryFormat(state, startpass, endpass);
    const indexoffset = DOSET_INDEXOFFSET;

    items.push({
        text: 'Booleans (selecting will toggle value):',
        ...helpers.headingStyle,
    });
    // First list any other non-modifiable booleans, then modifiable ones.
    for (let pass = 0; pass <= 1; pass++) {
        for (let i = 0; i < allopt.length; ++i) {
            const option = allopt[i];
            if (option.opttyp !== 'BoolOpt' || !option.addr) continue;
            if (!((option.setwhere <= set_gameview && pass === 0)
                || (option.setwhere >= set_in_game && pass === 1))) continue;
            // flags.female is obsolete; gender:female replaced it.
            if (option.addr === 'flags.female') continue;
            if (option.setwhere === set_wizonly && !state.wizard) continue;
            if (option.setwhere === set_wiznofuz
                && (!state.wizard || state.iflags?.debug_fuzzer)) continue;
            if (unsupportedWindowOption(option.name)) continue;

            const a_int = pass === 0 ? 0 : i + 1 + indexoffset;
            const indent = pass === 0 ? '    ' : '';
            // enhance_menu_text() is compiled out; its whole body sits behind
            // `#if 0` in this build.
            const text = format(
                indent, option.name,
                term_for_boolean(i, booleanOptionValue(state, option)),
            );
            items.push(a_int ? { text, value: a_int } : { text });
        }
    }

    items.push({ text: '' });
    items.push({
        text: 'Compounds (selecting will prompt for new value):',
        ...helpers.headingStyle,
    });
    for (let pass = startpass; pass <= endpass; pass++) {
        for (let i = 0; i < allopt.length; ++i) {
            const option = allopt[i];
            if (option.opttyp !== 'CompOpt') continue;
            if (option.setwhere !== pass) continue;
            if (unsupportedWindowOption(option.name)) continue;
            doset_add_menu(
                state, helpers, items, option, format, i,
                pass === set_gameview ? 0 : indexoffset,
            );
        }
    }

    items.push({ text: '' });
    items.push({ text: 'Other settings:', ...helpers.headingStyle });
    for (let pass = startpass; pass <= endpass; pass++) {
        for (let i = 0; i < allopt.length; ++i) {
            const option = allopt[i];
            if (option.opttyp !== 'OthrOpt') continue;
            if (option.setwhere !== pass) continue;
            if (unsupportedWindowOption(option.name)) continue;
            doset_add_menu(
                state, helpers, items, option, format, i,
                pass === set_gameview ? 0 : indexoffset,
            );
        }
    }
    return items;
}

// ===========================================================================
// options.c parseoptions() and optfn_boolean(), as doset()'s pick loop
// reaches them.  The configuration-file pass has its own parser above; this
// is the interactive one, which writes live flags and prints a message.
// ===========================================================================

// C ref: options.c:84, the value each option handler answers with.  The third,
// optn_silenterr, has no constant here because this interactive parser never
// produces one: of optfn_boolean()'s four (5220, 5236, 5267 and 5283), the
// first two need a value on the statement and doset() builds none, and the
// other two stop with a refusal below.  parseoptions() treats it as every
// other error anyway.  The configuration-file parser above does port the
// negation arm at 5220, in optfn_boolean_returns_before_setting().
const optn_err = 0;
const optn_ok = 1;

// C ref: options.c determine_ambiguities() (6699-6736), which
// initoptions_init() runs once over the fixed allopt[] table.  needed[i] ends
// as one more than the longest prefix option i's name shares with another
// name, and minmatch is that count floored at three characters and capped at
// the name's own length.  Nothing here reads game state, so this port computes
// the table once at import instead of on the first parse.
function determine_ambiguities() {
    const needed = allopt.map(() => 0);
    for (let i = 0; i < allopt.length; ++i) {
        for (let j = 0; j < allopt.length; ++j) {
            if (j === i) continue;
            const p1 = allopt[i].name;
            const p2 = allopt[j].name;
            let tmpneeded = 1;
            let at = 0;
            while (at < p1.length && at < p2.length
                && lowc(p1[at]) === lowc(p2[at])) {
                ++tmpneeded;
                ++at;
            }
            if (tmpneeded > needed[i]) needed[i] = tmpneeded;
            if (tmpneeded > needed[j]) needed[j] = tmpneeded;
        }
    }
    return needed.map((count, i) => {
        const len = allopt[i].name.length;
        if (count < 3) return 3;
        return count <= len ? count : len;
    });
}

export const OPTION_MINMATCH = Object.freeze(determine_ambiguities());

// C's strncmpi() over at most `n` bytes, with C's NUL terminator: a string
// that ends inside the window matches only if the other ends there too.
function equal_ncasechars(a, b, n) {
    for (let index = 0; index < n; ++index) {
        const endedA = index >= a.length;
        const endedB = index >= b.length;
        if (endedA || endedB) return endedA && endedB;
        if (lowc(a[index]) !== lowc(b[index])) return false;
    }
    return true;
}

// C ref: options.c length_without_val().  A statement's name ends at the first
// ':' or '=', whichever comes first, and any whitespace in front of that
// separator belongs to neither side.
function length_without_val(user_string, len) {
    const colon = user_string.indexOf(':');
    const equals = user_string.indexOf('=');
    let at = colon;
    if (colon < 0 || (equals >= 0 && equals < colon)) at = equals;
    if (at < 0) return len;
    while (at > 0 && /[\t\n\v\f\r ]/u.test(user_string[at - 1])) --at;
    return at;
}

// C ref: options.c match_optname().  The player's text has to be a prefix of
// the option's name and at least min_length characters long.
function match_optname(user_string, optn_name, min_length, val_allowed) {
    let len = user_string.length;
    if (val_allowed) len = length_without_val(user_string, len);
    return len >= min_length && equal_ncasechars(optn_name, user_string, len);
}

// C ref: options.c string_for_opt() (6664-6680).  Answers the text after the
// first ':' or '=', or the empty string where C answers its empty_optstr
// sentinel.  C reaches that sentinel exactly when the separator is missing or
// ends the statement, so an empty answer and empty_optstr are the same thing.
//
// The function runs twice per statement.  parseoptions():643 calls it with
// val_optional TRUE to get the value it hands the handler, and a handler that
// needs a value calls it again with FALSE, which is the only call that reports
// the missing parameter.  `result` carries the configuration-error frame C
// reads from a global, so only the FALSE caller has to supply one.
function string_for_opt(opts, val_optional, result = null) {
    const colon = opts.indexOf(':');
    const equals = opts.indexOf('=');
    const at = (colon < 0 || (equals >= 0 && equals < colon)) ? equals : colon;
    if (at < 0 || at + 1 >= opts.length) {
        if (!val_optional) {
            configErrorAdd(result, `Missing parameter for '${opts}'`);
        }
        return '';
    }
    return opts.slice(at + 1);
}

// C ref: options.c string_for_env_opt() (6683-6691).  go.opt_initial is TRUE
// for the whole configuration-file read, so rejectoption() -- the arm that
// refuses an option settable only from NETHACKOPTIONS or the configuration
// file -- cannot fire here, and what is left is string_for_opt() with the
// option name discarded.  That name is the parameter this port leaves out.
function string_for_env_opt(opts, val_optional, result = null) {
    return string_for_opt(opts, val_optional, result);
}

// C ref: include/botl.h:213 VIA_WINDOWPORT(), which asks whether the interface
// takes status updates field by field.  tty advertises both bits, so every
// caller in optfn_boolean() takes its true arm.
function VIA_WINDOWPORT() {
    return TTY_WINCAP2.has('WC2_HILITE_STATUS')
        || TTY_WINCAP2.has('WC2_FLUSH_STATUS');
}

// C ref: botl.c status_initialize(REASSESS_ONLY) (1697-1721).  Its loop hands
// every field to windows.c genl_status_enablefield(), which caches the field's
// format, name and enabled state in three module arrays that
// bot_via_windowport() reads back.  This port keeps no such cache:
// js/display.js recomputes each field from flags on every bot(), which is what
// makes flags.showexp and flags.time reach the status line at all, and
// writeStatusRows() clears and rewrites both rows rather than sending only the
// fields C would have marked dirty, so gu.update_all is permanently set here.
// The redraw request the function ends with is the part that needs a home.
function status_initialize(state) {
    state.disp ??= {};
    state.disp.botlx = true;
}

// C ref: windows.c adjust_menu_promptstyle().  It relays iflags.menu_headings
// to the window port, and tty stores it in tty_menu_promptstyle
// (wintty.c:2905).  This port reads iflags.menu_headings afresh every time it
// opens a menu -- js/cmd.js menuTitleStyle() -- so the cached copy has no
// counterpart and the flag reset is all that survives.
function adjust_menu_promptstyle(state) {
    state.go.opt_need_promptstyle = false;
}

// C ref: win/tty/wintty.c tty_preference_update().  Its one compiled arm tests
// for "statuslines"; genl_preference_update() below it returns at once and the
// TTY_PERM_INVENT block is not compiled, so every other preference is a no-op.
function preference_update(state, pref) {
    if (pref === 'statuslines') {
        // Unreachable from either menu: 'statuslines' is a CompOpt with no
        // handler, so applyOptionMenuPick() refuses at its getlin() arm before
        // reaching this call.
        throw new UnsupportedOptionMenuError(
            'tty_preference_update("statuslines")',
        );
    }
}

// C ref: options.c optfn_boolean()'s `*(allopt[optidx].addr) = !negated`
// (5285). C stores a boolean option once, at allopt[].addr. Startup parsing
// writes that address through applyBooleanOption(), and this interactive path
// writes it through setBooleanOptionValue(). Delete any legacy flags.<name>
// copy supplied by a hand-built test state so one C value retains one owner.
function setBooleanOptionValue(state, option, value) {
    const path = option.addr.split('.');
    let owner = state;
    for (let index = 0; index < path.length - 1; ++index)
        owner = owner?.[path[index]];
    if (!owner) {
        throw new UnsupportedOptionMenuError(
            `live storage for boolean option '${option.name}'`
            + ` (${option.addr})`,
        );
    }
    owner[path[path.length - 1]] = value;
    const parsedName = option.name.toLowerCase();
    if (option.addr !== `flags.${parsedName}`)
        delete state.flags?.[parsedName];
}

// C ref: options.c optfn_boolean() (5192-5443), the do_set request.  The
// do_init request returns at once and the get_val request answers an empty
// string, which is what term_for_boolean() already supplies to
// doset_add_menu(), so neither needs an arm here.
//
// C switches on optidx, the enum opt member; this switches on the option's
// name, which the generator pins to the same array position.
async function optfn_boolean(state, optidx, negated, opts) {
    const option = allopt[optidx];

    /* silent retreat: the #ifdef arm that would have supplied storage for
       this option compiled to a null pointer */
    if (!option.addr) return optn_ok;

    /* option that must come from config file? */
    if (!state.go.opt_initial && option.setwhere === set_in_config)
        return optn_err;
    /* options that must NOT come from config file */
    if (state.go.opt_initial && option.setwhere === set_wiznofuz)
        return optn_err;

    if (string_for_opt(opts, true) !== '') {
        // options.c:5211-5241 reads "opt:true", "opt:no", "opt:1" and their
        // relatives, and `ln`, which the opt_female arm below floors at 3,
        // is the length of that value.  doset() builds its statement as
        // "%s%s" from an optional '!' and the option's name, so no pick
        // brings a value and ln stays 0.
        throw new UnsupportedOptionMenuError(
            "parseoptions() with a value on a boolean option's statement",
        );
    }

    if (state.iflags?.debug_fuzzer && !state.go.opt_initial) {
        /* don't randomly toggle this/these */
        if (option.name === 'silent' || option.name === 'perm_invent')
            return optn_ok;
    }

    /* Before the change */
    switch (option.name) {
    case 'female':
        // options.c:5245-5266 keeps the old 'O'-prompts-for-text behaviour,
        // where "female" and "male" both reached this entry.  doset()'s
        // boolean loop skips every entry whose storage is &flags.female
        // (options.c:8873), so no pick can arrive here.
        throw new UnsupportedOptionMenuError(
            "optfn_boolean()'s flags.female arm",
        );
    case 'perm_invent':
        // options.c:5267-5270 asks can_set_perm_invent() whether the
        // interface can show a persistent inventory window.  The port's
        // TTY_WINCAP carries no WC_PERM_INVENT, so unsupportedWindowOption()
        // keeps 'perm_invent' out of the menu entirely.
        throw new UnsupportedOptionMenuError('can_set_perm_invent()');
    default:
        break;
    }

    setBooleanOptionValue(state, option, !negated); /* <==== SET IT HERE */

    /* After the change */
    switch (option.name) {
    case 'pauper':
        // options.c:5288-5291. 'pauper' is set_in_config, so doset() lists it
        // in the pass that assigns no selector.
        throw new UnsupportedOptionMenuError("optfn_boolean()'s pauper arm");
    case 'ascii_map':
        state.iflags.wc_tiled_map = negated;
        break;
    case 'tiled_map':
        state.iflags.wc_ascii_map = negated;
        break;
    case 'hilite_pet':
        /* if we're enabling hilite_pet and petattr isn't set, set it to
           Inverse; if we're disabling, leave petattr alone so that
           re-enabling will get current value back */
        if (state.iflags.wc_hilite_pet && !state.iflags.wc2_petattr)
            state.iflags.wc2_petattr = ATR_INVERSE;
        state.go.opt_need_redraw = true;
        break;
    case 'idlecheckpoint':
        await ttyPline("There is no underlying support for 'idlecheckpoint'"
            + ' compiled in.', state);
        state.iflags.idlecheckpoint = false;
        // C's give_opt_msg is a file static that starts TRUE, and only this
        // arm and doset_simple() write it.  doset_simple() brackets its own
        // pick loop with FALSE at options.c:8722 and an unconditional TRUE at
        // :8733, so the suppression this arm starts lasts only until the next
        // 'O'.  This port keeps it on game state rather than in a module
        // variable so that each runSegment() starts from C's initial TRUE.
        state.give_opt_msg = false;
        break;
    default:
        break;
    }

    /* only do processing below if setting with doset() */
    if (state.go.opt_initial) return optn_ok;

    switch (option.name) {
    case 'terrainstatus':
        classify_terrain(state); /* bring iflags.terrain_typ up to date */
        /* FALLTHRU */
    case 'weaponstatus':
    case 'armorstatus':
        // The three fall through to the group below because the port's
        // TTY_WINCAP2 carries WC2_EXTRASTATUS; options.c:5330-5335's
        // "'%s' is not supported." arm needs an interface that does not, and
        // unsupportedWindowOption() would have kept them out of the menu.
        /* FALLTHRU */
    case 'showscore':
    case 'showvers':
    case 'showexp':
    case 'time':
        if (VIA_WINDOWPORT()) status_initialize(state);
        state.disp ??= {};
        state.disp.botl = true;
        break;
    case 'fixinv':
    case 'price_quotes':
    case 'sortpack':
    case 'implicit_uncursed':
    case 'wizweight':
        if (!state.flags.invlet_constant) reassign(state);
        update_inventory({ state });
        break;
    case 'lit_corridor':
    case 'dark_room':
        /*
         * All corridor squares seen via night vision or candles & lamps
         * change.  Update them by calling newsym() on them.
         */
        vision_recalc(2, { state }); /* shut down vision */
        state.vision_full_recalc = 1; /* delayed recalc */
        if (state.iflags.wc_color)
            state.go.opt_need_redraw = true; /* darkroom refresh */
        break;
    case 'wizmgender':
    case 'showrace':
    case 'hilite_pile':
    case 'use_inverse':
    case 'perm_invent':
    case 'ascii_map':
    case 'tiled_map':
        state.go.opt_need_redraw = true;
        state.go.opt_need_glyph_reset = true;
        break;
    case 'hitpointbar':
        if (VIA_WINDOWPORT()) {
            status_initialize(state);
            state.go.opt_need_redraw = true;
        }
        break;
    case 'color':
        // options.c:5407-5409 raises the same two flags the seven-option arm
        // above raises, and reset_needed_visuals() answers both with
        // reset_glyphmap(gm_optionchange) and a docrt().
        state.go.opt_need_redraw = true;
        state.go.opt_need_glyph_reset = true;
        break;
    case 'customcolors':
        state.go.opt_reset_customcolors = true;
        break;
    case 'customsymbols':
        state.go.opt_reset_customsymbols = true;
        break;
    case 'menucolors':
    case 'guicolor':
        update_inventory({ state });
        state.go.opt_need_promptstyle = true;
        break;
    case 'mention_decor':
        state.iflags.prev_decor = STONE;
        break;
    case 'rest_on_space':
        // options.c:5424-5425 calls cmd.c update_rest_on_space(), which
        // rebinds <space> in gc.Cmd.cmdbinds to a private #wait entry, or
        // back to whatever the RC file bound there.
        throw new UnsupportedOptionMenuError('update_rest_on_space()');
    case 'accessiblemsg':
        // options.c:5427-5428 clears a11y.msg_loc.  This port stores no such
        // position: pline.c:162-164 clears it on every message, which is the
        // state js/hack.js:1370 and :1405 already assume, so the assignment
        // writes a value that is always already in force.
        break;
    default:
        break;
    }

    /* boolean value has been toggled but some option changes can still be
       pending at this point (mainly for opt_need_redraw); give the toggled
       message now regardless */
    // `!== false` rather than a truth test: C's give_opt_msg is a file static
    // that starts TRUE, and this field is undefined until doset_simple()'s
    // bracket first writes it, so undefined has to read as TRUE. Seeding it
    // true in defaultResult() does not work -- that builds the parse result,
    // not the game state, so the seed never reaches here and the messages
    // stop.
    if (state.give_opt_msg !== false) {
        await ttyPline(
            `'${option.name}' option toggled ${!negated ? 'on' : 'off'}.`,
            state,
        );
    }
    return optn_ok;
}

// C ref: options.c optfn_pickup_types() (3307-3402), the do_set request.  The
// do_init and get_val requests need no arm here: get_val is what
// OPTION_VALUE_HANDLERS.pickup_types already answers for the menu's value
// column, and do_init returns at once.
//
// handler_pickup_types() below is this arm's only caller, and it always
// spells the statement 'pickup_types' in full.  Three of C's branches cannot
// be reached from it and are left out rather than written dead:
//   - a statement carrying a ':' or '=' value.  The guard below is what would
//     notice a caller that started passing one.
//   - options.c:3327-3332, where an empty value means "pick up everything"
//     rather than "ask".  It needs `compat` -- strlen(opts) <= 6, and the
//     statement is twelve bytes -- or go.opt_initial, which parseoptions()
//     refuses along with tinitial, or `negated`.
//   - options.c:3364-3367's bad_negation() arm.  `negated` cannot be true
//     here either: allopt[]'s negateok is false for this option, so
//     parseoptions() rejects a negated statement before the handler runs.
//     The parameter stays so every OPTION_SET_HANDLERS entry takes C's
//     argument list.
async function optfn_pickup_types(state, optidx, negated, opts, helpers) {
    /* types of objects to pick up automatically */
    const tbuf = oc_to_str(state.flags.pickup_types);
    state.flags.pickup_types = []; /* all */
    if (string_for_opt(opts, true) !== '') {
        throw new UnsupportedOptionMenuError(
            `optfn_${allopt[optidx].optfn}() with an explicit value`,
        );
    }

    const inv_order_symbols = oc_to_str(state.flags.inv_order);
    // VENOM_SYM.  Venom is not in def_inv_order[], so a wizard picking up
    // splashes of venom needs the class appended by hand.
    const venom = oc_to_str([VENOM_CLASS]);
    const ocl = (state.wizard && !inv_order_symbols.includes(venom))
        ? inv_order_symbols + venom
        : inv_order_symbols;
    if (state.flags.menu_style === MENU_TRADITIONAL
        || state.flags.menu_style === MENU_COMBINATION) {
        // options.c:3337-3356 asks getlin() for the class list instead, and
        // only answering 'm' there reaches the menu below.
        throw new UnsupportedOptionMenuError(
            'optfn_pickup_types()\'s getlin("New %s: [%s am] (%s)")',
        );
    }
    const op = await choose_classes_menu(
        state, 'Autopickup what?', ocl, tbuf, helpers,
    );
    const parsed = pickupTypesFromSymbols(op);
    state.flags.pickup_types = parsed.types;
    // Outside a configuration-file frame, config_error_add() writes through
    // pline().  That interactive message remains outside this startup slice;
    // parseoptions() still receives C's optn_err answer here.
    return parsed.badopt ? optn_err : optn_ok;
}

// C ref: options.c parseoptions() (489-681)'s handler table, C's
// allopt[optidx].optfn(optidx, do_set, ...).  The key is that function's own
// name, as OPTION_VALUE_HANDLERS' keys are.
const OPTION_SET_HANDLERS = Object.freeze({
    boolean: optfn_boolean,
    cond_: (state, _optidx, negated, opts) => pfxfn_cond_(
        state, negated, opts,
    ),
    pickup_types: optfn_pickup_types,
});

// C ref: options.c parseoptions() (489-681), the path doset()'s pick loop
// takes.  `opts` there is always an allopt[] name with an optional leading
// '!', and both flags arrive FALSE.
export async function parseoptions(
    state, statement, tinitial, tfrom_file, helpers,
) {
    if (tinitial || tfrom_file) {
        // The comma recursion at options.c:513-521, duplicate_opt_detection()'s
        // per-option counter and every config_error_add() report belong to the
        // configuration-file pass, which parseNethackrc() above covers with a
        // parser of its own.
        throw new UnsupportedOptionMenuError(
            'parseoptions() during option initialization',
        );
    }
    state.go ??= {};
    state.go.opt_initial = tinitial;
    state.go.opt_from_file = tfrom_file;

    if (encodeUtf8ByteString(statement).length > OPTION_ELEMENT_BYTE_LIMIT)
        return false; /* "Option too long" */

    const element = trimCWhitespace(statement);
    if (!element) return false; /* "Empty statement" */

    /* options.c:539-542, the same loop parseNethackrc() above reaches */
    const { statement: opts, negated } = stripNegation(element);

    let got_match = false;
    let matchidx = -1;
    for (let i = 0; i < allopt.length; ++i) {
        got_match = false;
        if (allopt[i].pfx && str_start_is(opts, allopt[i].name, true))
            got_match = true;
        if (!got_match) {
            got_match = match_optname(
                opts, allopt[i].name, OPTION_MINMATCH[i], true,
            );
        }
        if (got_match) {
            // options.c:583-589 answers "Ambiguous option" here when
            // length_without_val(opts, strlen(opts)) is below
            // allopt[i].minmatch.  match_optname() has just measured that same
            // length from the same string with the same val_allowed, and
            // answered true only because it reached minmatch, so the test
            // cannot hold and the arm is left out rather than written
            // unreachable.  Nothing in this port needs the length itself.
            matchidx = i;
            break;
        }
    }
    if (!got_match) {
        // options.c:592-612 tries allopt[].alias next.  doset() builds this
        // statement from an allopt[] entry's own name, and the loop above
        // always matches such a name by the time it reaches that entry, so no
        // pick can arrive here.
        throw new UnsupportedOptionMenuError("parseoptions()'s alias table");
    }

    // options.c:614 raises program_state.in_parseoptions so a handler can ask
    // who called it; optfn_boolean(), the one handler dispatched below, never
    // asks.  options.c:620 and :671 also test allopt[].disregarded, which only
    // cfgfiles.c rcfile_interface_options() writes, and it leaves just
    // 'windowtype' and 'soundlib' set; neither is a boolean option.
    // duplicate_opt_detection() (options.c:434-439) answers FALSE whenever
    // go.opt_initial and go.opt_from_file are not both set, which the guard at
    // the head of this function has already established.
    if (negated && !allopt[matchidx].negateok) {
        /* bad_negation(); C returns optn_err, which is 0, from a function
           declared boolean, so the caller reads it as FALSE */
        return false;
    }

    const optfn = OPTION_SET_HANDLERS[allopt[matchidx].optfn];
    if (!optfn) {
        // opt_set_in_config[matchidx], which options.c:640 sets after a
        // successful handler call, feeds #saveoptions alone and has no port.
        const prefix = allopt[matchidx].pfx ? 'pfxfn' : 'optfn';
        throw new UnsupportedOptionMenuError(
            `${prefix}_${allopt[matchidx].optfn}()'s do_set request`,
        );
    }
    const optresult = await optfn(state, matchidx, negated, opts, helpers);

    // options.c:670-681.  Every remaining arm reports a configuration error
    // and answers FALSE; only optn_ok answers TRUE, and `retval` is TRUE
    // because the comma recursion that could clear it is a tinitial-only path.
    // doset() discards this answer -- `(void) parseoptions(buf, FALSE, FALSE)`
    // at options.c:8929 -- so the arms differ only in the message they add.
    return optresult === optn_ok;
}

// C ref: options.c handler_pickup_types() (6114-6121).  Rather than edit
// flags.pickup_types itself, it asks parseoptions() to run the same do_set arm
// a configuration file would, which is where the class menu lives.  C's
// comment: "parseoptions will prompt for the list of types".
async function handler_pickup_types(state, helpers) {
    await parseoptions(state, 'pickup_types', false, false, helpers);
    return optn_ok;
}

// C ref: options.c allopt[optidx].optfn(optidx, do_handler, ...), the
// interactive editor doset()'s pick loop opens for a compound option.  Keyed
// on the handler's own option, as OPTION_SET_HANDLERS is.
const OPTION_HANDLERS = Object.freeze({
    pickup_types: handler_pickup_types,
});

// C ref: options.c reset_needed_visuals() (8977-9010), which doset() runs once
// after its pick loop and doset_simple() runs after every pass of its own.
export async function reset_needed_visuals(state) {
    const go = state.go ??= {};
    // display.c reset_glyphmap(gm_optionchange) rebuilds glyphmap[], the
    // glyph-to-symbol-and-colour table the window port prints from. This port
    // keeps no such table: js/display.js map_glyphinfo() resolves one glyph
    // number on demand, and the docrt() below re-runs newsym() over every
    // square, so the rebuild and the repaint are one act here.
    //
    // That argument alone was tried at 0f7b6cf and is false on its own, as the
    // correctness pass over 5366349..909a338 proved by execution: what makes
    // it true is that map memory holds the unresolved number. It now does for
    // every layer that reaches map memory, so a repaint draws each remembered
    // square under the option values in force at the repaint. Monsters need no
    // stored number: C's comment at detect.c:2205-2209 records that
    // levl[x][y].glyph never holds one, and docrt_flags() (display.c:1709)
    // rebuilds every monster cell by re-running newsym(), so the repaint
    // re-derives their glyphflags from the live monster.
    if (go.opt_reset_customcolors || go.opt_update_basic_palette
        || go.opt_reset_customsymbols || go.opt_need_redraw) {
        if (go.opt_update_basic_palette) {
            // change_palette() sits behind CHANGE_COLOR, which no unix tty
            // build defines, so C clears the flag and does nothing else.
            go.opt_update_basic_palette = false;
        }
        if (go.opt_reset_customcolors)
            throw new UnsupportedOptionMenuError('reset_customcolors()');
        if (go.opt_reset_customsymbols)
            throw new UnsupportedOptionMenuError('reset_customsymbols()');
        if (go.opt_need_redraw) {
            // botl.c check_gold_symbol() writes iflags.invis_goldsym from
            // gs.showsyms[COIN_CLASS + SYM_OFF_O].  Its only readers are
            // botl.c:131 and botl.c:1071, which choose between the literal
            // "$" and encglyph(objnum_to_glyph(GOLD_PIECE)); tty renders the
            // second as the coin-class symbol, which is '$' in both symbol
            // sets this port loads, so the two arms write the same status
            // byte and js/display.js spells that byte out.  js/do.js:857-860
            // records the same reasoning for goto_level()'s call.
            reglyph_darkroom(state);
        }
        // display.c docrt_flags() brackets its repaint with vision_recalc(2)
        // and vision_recalc(0); js/display.js docrt() leaves that bracket to
        // each caller because they do not all want the same one.  This caller
        // wants both: the map on screen was drawn under the old option values
        // and every square has to be reconsidered.
        // js/display.js docrt() and bot() paint the module-level game, so
        // passing `state` here is what refuses a state that is not it.
        vision_recalc(2, { state });
        await docrt();
        vision_recalc(0, { state });
    }
    if (go.opt_need_promptstyle) adjust_menu_promptstyle(state);
    if (state.disp?.botl || state.disp?.botlx) await bot();
    go.opt_need_redraw = false;
    go.opt_need_glyph_reset = false;
    go.opt_reset_customcolors = false;
    go.opt_reset_customsymbols = false;
    go.opt_update_basic_palette = false;
}

// C ref: the body both option menus repeat over a pick, options.c doset()
// (8925-8958) and doset_simple_menu() (8659-8688).  The two are the same three
// arms over the same option, and differ only where nothing here reaches: the
// guard on `opt_set_in_config[k] = TRUE`, which has no port on either side, and
// what each does when the player escapes the getlin() prompt, which one spells
// as `continue` and the other as a test on the answer.
//
// Three of C's tests are left out because nothing above can make them false.
// doset_simple_menu() writes `abuf[0] = '\0'` and only its getlin() arm can put
// an ESC there, so the `abuf[0] != '\033'` half of its preference_update()
// guard always holds once that arm is refused; its `k >= 0` half excludes the
// help pick, which doset_simple_menu() refuses before calling this.  C's
// `allopt[k].has_handler && allopt[k].optfn` needs the second test because
// optlist.h leaves a handler-less entry's optfn null; every allopt[] entry this
// port generates carries one, so has_handler decides alone.
async function applyOptionMenuPick(state, option, helpers) {
    if (option.opttyp === 'BoolOpt') {
        /* boolean option */
        const buf = (booleanOptionValue(state, option) ? '!' : '')
            + option.name;
        await parseoptions(state, buf, false, false, helpers);
    } else if (option.has_handler) {
        /* compound option */
        const handler = OPTION_HANDLERS[option.optfn];
        if (!handler) {
            throw new UnsupportedOptionMenuError(
                `optfn_${option.optfn}()'s do_handler request`,
            );
        }
        await handler(state, helpers);
        // `opt_set_in_config[k] = TRUE` follows a successful handler in both
        // menus.  Its only reader is #saveoptions, which this port does not
        // have, so there is no array to write.
    } else {
        throw new UnsupportedOptionMenuError(
            `getlin("Set ${option.name} to what?")`,
        );
    }
    if (wc_supported(option.name) || wc2_supported(option.name))
        preference_update(state, option.name);
}

// C ref: options.c doset(), the '#optionsfull' command.
export async function doset(state, helpers) {
    if (state.iflags?.menu_requested) {
        // doset_simple() checks for 'm' and calls doset(); clear the
        // menu-requested flag to avoid doing that recursively.
        state.iflags.menu_requested = false;
        return doset_simple(state, helpers);
    }
    // options.c:8781 sets go.opt_phase = play_opt, which only the
    // configuration-file error reporter reads.
    const skiphelp = !state.iflags?.cmdassist;
    const items = dosetMenuItems(state, helpers, skiphelp);
    // options.c:8944-8946: end_menu(), then the two flags
    // reset_needed_visuals() consumes, cleared before select_menu() can run a
    // handler that raises either.
    state.go ??= {};
    state.go.opt_need_redraw = false;
    state.go.opt_need_glyph_reset = false;

    const picks = await helpers.menu(items, 'Set what options?', PICK_ANY);
    const pick_list = Array.isArray(picks) ? picks : [];
    /*
     * Walk down the selection list and either invert the booleans or prompt
     * for new values.  In most cases, call parseoptions() to take care of
     * options that require special attention, like redraws.
     */
    for (let pick_idx = 0; pick_idx < pick_list.length; ++pick_idx) {
        // options.c:8908-8912 answers '?' with display_file(OPTMENUHELP), then
        // re-runs the whole menu when '?' was the only pick.  Both the help
        // file and that second pass stop here.
        if (pick_list[pick_idx].value - 1 === HELP_IDX)
            throw new UnsupportedOptionMenuError('display_file(OPTMENUHELP)');
        // options.c:8913-8914 corrects an a_int below -1, which only the
        // PREFIXES_IN_USE entries produce and that block is not compiled;
        // doset_add_menu() gives every selectable entry an a_int of at least
        // two.  INDEXOFFSET is the 1 doset() adds at options.c:8830.
        const opt_indx = pick_list[pick_idx].value - 1 - DOSET_INDEXOFFSET;
        await applyOptionMenuPick(state, allopt[opt_indx], helpers);
    }
    // destroy_nhwindow(tmpwin) at options.c:8971: the window port dismissed
    // the menu as select_menu() answered, and this port creates no window
    // object to free.
    await reset_needed_visuals(state);
    return ECMD_OK;
}

// ===========================================================================
// options.c doset_simple_menu() and doset_simple() -- the 'O' menu.  It walks
// the same allopt[] table doset() does, but groups it by optlist.h enum
// OptSection instead of by setwhere, gives every row a selector instead of
// splitting the booleans into an indented pass and a selectable one, and asks
// for a single pick.
// ===========================================================================

// C ref: options.c OptS_type[], the heading over each group of rows.
// doset_simple_menu()'s loop starts at OptS_General and stops before
// OptS_Advanced, so only the full doset() menu lists an Advanced option.
const OptS_General = 0;
const OptS_Advanced = 4;
const OptS_type = Object.freeze([
    'General', 'Behavior', 'Map', 'Status', 'Advanced',
]);

// C ref: options.c doset_simple_menu()'s help entry, `any.a_int = -2 + 1`, and
// the `k == -2` its pick loop compares against after subtracting the same 1
// back out.
const SIMPLE_HELP_K = -2;
const SIMPLE_HELP_A_INT = SIMPLE_HELP_K + 1;

// C ref: options.c doset_simple_menu()'s `k = opt_roguesymset` substitution.
const ROGUESYMSET_INDEX = allopt.findIndex(
    (option) => option.name === 'roguesymset',
);

// C ref: options.c doset_simple_menu()'s idx chain below the row switch.  C's
// comment: "pickup_types is separated from autopickup due to the spelling of
// their names; emphasize what it means".
const AUTOPICKUP_SUFFIX_OPTIONS = Object.freeze(new Set([
    'pickup_types', 'pickup_thrown', 'pickup_stolen', 'dropped_nopick',
]));

// C ref: options.c doset_simple_menu()'s fmtstr_doset_simple, the
// "%-Nus [%s]" branch; fmtstr_tab_doset_simple above it is not ported.  Two
// things differ from doset()'s format.  There is no leading "%s", because
// this menu has no indented pass to line up with, and the width comes from
// set_gameview..set_in_game even in debug mode, where doset() widens its own
// end of that range to set_wiznofuz.
function dosetSimpleEntryFormat(state) {
    if (booleanOptionValue(state, MENU_TAB_SEP)) {
        throw new UnsupportedOptionMenuError(
            'doset_simple_menu() with menu_tab_sep',
        );
    }
    const width = longest_option_name(set_gameview, set_in_game);
    return (name, value) => `${name.padEnd(width)} [${value}]`;
}

// C ref: options.c doset_simple_menu(), everything up to end_menu().  Returns
// the menu specification the window port renders.
export function dosetSimpleMenuItems(state, helpers) {
    const format = dosetSimpleEntryFormat(state);
    const items = [];
    // gs.simple_options_help starts FALSE and the k == -2 pick is its only
    // writer, so the "Use command '#optionsfull'" line above this entry, the
    // "hide help" label on it, the descr line under each row and the
    // `goto redo_opt_help` re-render all wait on the refused pick handling.
    items.push({ text: 'show help', value: SIMPLE_HELP_A_INT, selector: '?' });

    for (let section = OptS_General; section < OptS_Advanced; ++section) {
        items.push({ text: '' });
        items.push({
            text: ` ${OptS_type[section].padEnd(30)} `,
            ...helpers.headingStyle,
        });
        for (let i = 0; i < allopt.length; ++i) {
            const option = allopt[i];
            if (option.section !== section) continue;
            if (unsupportedWindowOption(option.name)) continue;

            let a_int = i + 1;
            let name = option.name;
            let buf;
            if (option.opttyp === 'BoolOpt') {
                // 'showscore' and 'timed_delay' are the two rows this drops:
                // SCORE_ON_BOTL and TIMED_DELAY are undefined for this build,
                // so optlist.h gives each a null pointer instead of storage.
                if (!option.addr) continue;
                // A tiled map draws no colored glyphs, so C hides the option
                // that would turn them on.  No configuration file reaches
                // this through the port: parseNethackrc() has no 'tiled_map'
                // arm, so it never writes iflags.wc_tiled_map.
                if (state.iflags?.wc_tiled_map && option.name === 'color')
                    continue;
                buf = format(
                    name, booleanOptionValue(state, option) ? 'X' : ' ',
                );
            } else {
                // C's switch has a third arm, `default: Sprintf(buf,
                // "ERROR")`, which no entry reaches: enum OptType holds only
                // the three values and the generator rejects a fourth.
                //
                // The Rogue level draws from the rogue symbol set, so its
                // option takes over the symset row's name, value and
                // identifier while the hero stands there.  C keeps `i` for
                // the suffix test below and this port keeps `option` for it,
                // which changes nothing: neither symset row is one of the
                // four rows that take a suffix.
                let valued = option;
                if (option.optfn === 'symset' && Is_rogue_level(state.u?.uz)) {
                    valued = allopt[ROGUESYMSET_INDEX];
                    name = valued.name;
                    a_int = ROGUESYMSET_INDEX + 1;
                }
                buf = format(
                    name,
                    optionValue(state, valued, helpers) || 'unknown',
                );
            }
            if (AUTOPICKUP_SUFFIX_OPTIONS.has(option.name))
                buf += '  (for autopickup)';
            items.push({ text: buf, value: a_int });
        }
    }
    return items;
}

// C ref: options.c doset_simple_menu(), the guts of doset_simple().  It answers
// with select_menu()'s count, which doset_simple() loops on.
export async function doset_simple_menu(state, helpers) {
    const items = dosetSimpleMenuItems(state, helpers);
    // options.c:8642-8649: end_menu(), then the five flags
    // reset_needed_visuals() consumes, cleared before select_menu() can run a
    // handler that raises any of them.
    state.go ??= {};
    state.go.opt_need_redraw = false;
    state.go.opt_need_glyph_reset = false;
    state.go.opt_reset_customcolors = false;
    state.go.opt_reset_customsymbols = false;
    state.go.opt_update_basic_palette = false;

    const pick = await helpers.menu(items, 'Options', PICK_ONE);
    // C returns select_menu()'s count, which is -1 for a cancelled menu and 0
    // for a commit that picked nothing; both fail doset_simple()'s
    // `pickedone > 0` test, so this port answers 0 for either.  C's own note
    // covers the other side: "without the complication of a preselected entry,
    // a PICK_ONE menu returning pick_cnt > 0 implies exactly 1".
    if (pick === null) return 0;

    const k = pick - 1;
    if (k === SIMPLE_HELP_K) {
        // gs.simple_options_help = !gs.simple_options_help, then
        // `goto redo_opt_help` to rebuild the menu with a description under
        // every row.  dosetSimpleMenuItems() does not build that shape, so
        // this stops with the menu already dismissed and nothing applied.
        throw new UnsupportedOptionMenuError(
            "doset_simple_menu()'s 'show help' toggle",
        );
    }
    await applyOptionMenuPick(state, allopt[k], helpers);
    // destroy_nhwindow(tmpwin) at options.c:8694: as in doset(), the window
    // port dismissed the menu as select_menu() answered.  C's comment there:
    // "tear down this instance of the menu; if pick_cnt is 1, caller will
    // immediately call us back to put up another instance".
    return 1;
}

// C ref: options.c doset_simple(), the 'O' command.
export async function doset_simple(state, helpers) {
    if (state.iflags?.menu_requested) {
        // doset() checks for 'm' and calls doset_simple(); clear the
        // menu-requested flag to avoid doing that recursively.
        state.iflags.menu_requested = false;
        return doset(state, helpers);
    }
    // options.c:8719 sets go.opt_phase = play_opt, which only the
    // configuration-file error reporter reads.
    //
    // :8722 and :8733 bracket the loop with give_opt_msg, which silences
    // optfn_boolean()'s "'%s' option toggled %s." for every pick this menu
    // applies; C's comment above the bracket is that the menu is reprocessed
    // "with updated settings", so each row's [X] or [ ] carries the news
    // instead.  The restore at :8733 is unconditional rather than a save and
    // put back, which matters because the other writer -- optfn_boolean()'s
    // idlecheckpoint arm -- also clears the flag, and that suppression ends
    // here.
    state.give_opt_msg = false;
    let pickedone = 0;
    do {
        pickedone = await doset_simple_menu(state, helpers);
        // options.c:8725 copies go.opt_need_redraw out before
        // reset_needed_visuals() spends it, so a pass whose pick asked for a
        // repaint also ends with the map flushed and the cursor back on the
        // hero.  C's `boolean flush` is a function-level variable it clears
        // again after each flush; both of those stores are dead, because the
        // copy below is the only thing that reaches the test.
        const flush = state.go.opt_need_redraw;
        await reset_needed_visuals(state);
        if (flush) await flush_screen(1);
    } while (pickedone > 0);
    state.give_opt_msg = true;
    return ECMD_OK;
}
