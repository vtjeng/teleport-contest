// options.js — Parse the startup subset of .nethackrc options.
// C refs: cfgfiles.c config parsing; options.c parseoptions(), handlers, and
// nmcpy(); hacklib.c mungspaces(); bones.c sanitize_name(); role.c str2*().

import {
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_FORCE,
    AUTOUNLOCK_KICK,
    AUTOUNLOCK_UNTRAP,
    DISCLOSE_PROMPT_DEFAULT_NO,
    GFILTER_AREA,
    GFILTER_NONE,
    GFILTER_VIEW,
    GPCOORDS_COMPASS,
    GPCOORDS_COMFULL,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    GPCOORDS_SCREEN,
    Is_rogue_level,
    MENU_COMBINATION,
    MENU_FULL,
    MENU_TRADITIONAL,
    MOD_ENCUMBER,
    NUM_DISCLOSURE_OPTIONS,
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
    ROGUESET,
    RUN_CRAWL,
    RUN_LEAP,
    RUN_STEP,
    RUN_TPORT,
    STONE,
    SYM_BOULDER,
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
    DEFAULT_FRUIT,
    normalize_initial_fruit,
} from './fruit.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
    encodeUtf8Text,
    lowc,
    str_start_is,
} from './hacklib.js';
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
import { allopt } from './optlist_data.js';
import { AUTOCOMP_ADJ, extcmdlist } from './extcmdlist_data.js';
import {
    DEFAULT_PRIMARY_SYMBOLS,
    SYM_OFF_O,
    SYM_OFF_X,
} from './symbol_data.js';
import {
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
import { def_char_to_objclass } from './drawing.js';
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
const OPTION_ALIASES = Object.freeze({
    character: 'role',
    align: 'alignment',
    altkeyhandler: 'altkeyhandling',
    permablind: 'blind',
    permadeaf: 'deaf',
    colour: 'color',
    customcolours: 'customcolors',
    pet: 'pettype',
    prayconfirm: 'paranoid_confirmation',
    termcolumns: 'term_cols',
    use_menu_glyphs: 'menu_objsyms',
    use_truecolour: 'use_truecolor',
    male: 'male',
});
// options.c's exact "male" alias stays distinct so applyBooleanOption() can
// invert its value rather than treating it as an ordinary spelling of female.

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
            // walks. The trailing 0 terminates the list in C. options.c
            // change_inv_order() rewrites this from the packorder option,
            // which is not ported; js/invent.js stops when a session sets it.
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
            wc2_statuslines: 2,
            wc2_petattr: ATR_INVERSE,
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
            // initoptions_init()'s TTY_GRAPHICS arm; this build is tty.
            prevmsg_window: 's',
            // optfn_menu_objsyms()'s do_init arm calls
            // set_menuobjsyms_flags(4), "conditional".
            menuobjsyms: 4,
            menuinvertmode: 1,
            getloc_filter: GFILTER_NONE,
        },
        a11y: {
            mon_notices_blocked: 0,
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
        symbolOperations: [],
        rogueSymbols: {},
        // The configuration statements this parser recognizes but does not
        // interpret, in the order the file spelled them.  Each one makes
        // cfgfiles.c append to a list the options menu counts, so the count
        // has to know the statement was there; see UNPORTED_CONFIG_STATEMENTS.
        unportedConfigStatements: [],
    };
    applyBooleanOptionDefaults(result);
    return result;
}

function optionError(lineNumber, message) {
    throw new Error(`nethackrc line ${lineNumber}: ${message}`);
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

function trimCWhitespaceStart(value) {
    return String(value).replace(/^[\t\n\v\f\r ]+/u, '');
}

function trimConfigPadding(value) {
    return String(value).replace(/^[ \t]+|[ \t]+$/gu, '');
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
function logicalConfigLines(rc) {
    const input = encodeUtf8Text(rc);
    const logical = [];
    let buffered = null;
    let cursor = 0;
    let lineNumber = 0;
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
            // through the next visible newline.
            skip = true;
            continue;
        }

        lineNumber += 1;
        let line = chunk.slice(0, newline >= 0 ? newline : cLength);
        const continued = line.at(-1) === 0x5C;
        if (continued) {
            // parse_conf_buf() leaves its end pointer on the new NUL, so
            // spaces before a continuation backslash remain in the buffer.
            line.pop();
        } else {
            while ([0x20, 0x09, 0x0D].includes(line.at(-1))) line.pop();
        }
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

        logical.push({
            line: decodeUtf8ByteString(buffered),
            lineNumber,
        });
        buffered = null;
    }
    return logical;
}

function splitNameAndValue(option) {
    const colon = option.indexOf(':');
    const equals = option.indexOf('=');
    let separator = -1;
    if (colon >= 0 && equals >= 0) separator = Math.min(colon, equals);
    else separator = Math.max(colon, equals);
    if (separator < 0) return { name: trimCWhitespace(option), value: null };
    return {
        name: trimCWhitespace(option.slice(0, separator)),
        value: option.slice(separator + 1),
    };
}

// options.c toggles negation for every leading '!', "no", or "no-".
function stripNegation(optionName) {
    let name = trimCWhitespace(optionName);
    let negated = false;
    for (;;) {
        if (name.startsWith('!')) {
            negated = !negated;
            name = trimCWhitespaceStart(name.slice(1));
        } else if (/^no-/iu.test(name)) {
            negated = !negated;
            name = trimCWhitespaceStart(name.slice(3));
        } else if (/^no/iu.test(name)) {
            negated = !negated;
            name = trimCWhitespaceStart(name.slice(2));
        } else {
            break;
        }
    }
    return { name: name.toLowerCase(), sourceName: name, negated };
}

function booleanValue(value, negated, optionName, lineNumber) {
    if (value == null) return !negated;
    if (negated) {
        optionError(
            lineNumber,
            `negated boolean '${optionName}' must not have a value`,
        );
    }
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
    optionError(lineNumber, `'${value}' is not valid for ${optionName}`);
}

function requireValue(value, optionName, negated, lineNumber) {
    if (negated) optionError(lineNumber, `${optionName} filters are not supported`);
    if (!value) optionError(lineNumber, `${optionName} requires a value`);
    return value;
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

// C ref: options.c parse_role_opt() and optfn_role/race/gender/alignment().
function setCharacterOption(
    result, optionState, optionName, value, negated, lineNumber,
) {
    if (!value) optionError(lineNumber, `${optionName} requires a value`);

    const normalized = String(value).trim().replace(/[\t ]+/gu, ' ');
    if (!normalized) {
        optionError(lineNumber, `${optionName} requires a value`);
    }
    const values = normalized.split(' ');
    const duplicate = optionState.seen.has(optionName);
    optionState.seen.add(optionName);
    let previousValueNegated = false;
    let filtered = false;
    let selectedValue = '';

    for (let index = 0; index < values.length; ++index) {
        const valueNegation = stripValueNegation(values[index]);
        const token = valueNegation.token;
        const valueNegated = valueNegation.negated;
        if (!token) {
            optionError(lineNumber, `negated nothing for '${optionName}'`);
        }
        if (index > 0) {
            if ((valueNegated !== previousValueNegated)
                || (negated && valueNegated)) {
                optionError(
                    lineNumber,
                    `invalid mixed negation for '${negated ? '!' : ''}${optionName}'`,
                );
            }
            if (!negated && !valueNegated) {
                optionError(
                    lineNumber,
                    'multiple role values only allowed when list is negated',
                );
            }
        }
        previousValueNegated = valueNegated;

        const prior = optionState.values[optionName];
        if (valueNegated || negated) {
            if (!prior || !prior.startsWith('!')) {
                clearRoleFilter(result.roleFilter, optionName);
            }
            if (!setRoleFilter(result.roleFilter, token)) {
                optionError(
                    lineNumber,
                    `invalid ${optionName} '${token}'`,
                );
            }
            optionState.values[optionName] = roleFilterString(
                result.roleFilter, optionName,
            );
            filtered = true;
        } else {
            if (duplicate && prior?.startsWith('!')) {
                optionError(
                    lineNumber,
                    `compound option specified multiple times: ${optionName}`,
                );
            }
            optionState.values[optionName] = token;
            selectedValue = token;
            filtered = false;
        }
    }

    if (filtered) return;
    const choice = CHARACTER_OPTIONS[optionName];
    const parsed = choice.parser(selectedValue);
    if (parsed === ROLE_NONE) {
        optionError(
            lineNumber,
            `unknown ${choice.resultField} '${selectedValue}'`,
        );
    }
    result[choice.resultField] = parsed;
    result.flags[choice.flagField] = parsed;
    if (optionName === 'gender' && parsed !== ROLE_RANDOM) {
        result.flags.female = parsed === 1;
    }
}

function setPlaymode(result, value, negated, lineNumber) {
    const mode = requireValue(value, 'playmode', negated, lineNumber)
        .toLowerCase();
    let canonical;
    if (mode.startsWith('normal') || mode === 'play') canonical = 'normal';
    else if (mode.startsWith('explor') || mode.startsWith('discov')) {
        canonical = 'explore';
    } else if (mode.startsWith('debug') || mode.startsWith('wizard')) {
        canonical = 'debug';
    } else {
        optionError(lineNumber, `invalid playmode '${value}'`);
    }
    result.playmode = canonical;
    result.flags.debug = canonical === 'debug';
    result.flags.explore = canonical === 'explore';
}

function setPettype(result, value, negated, lineNumber) {
    if (negated && value == null) {
        result.preferred_pet = 'n';
        return;
    }
    const pettype = requireValue(value, 'pettype', negated, lineNumber);
    switch (pettype[0].toLowerCase()) {
    case 'd': result.preferred_pet = 'd'; break;
    case 'c':
    case 'f': result.preferred_pet = 'c'; break;
    case 'h':
    case 'q': result.preferred_pet = 'h'; break;
    case 'n': result.preferred_pet = 'n'; break;
    case 'r':
    case '*': result.preferred_pet = ''; break;
    default:
        optionError(lineNumber, `unrecognized pet type '${value}'`);
    }
}

function truncateByteString(value, limit) {
    return decodeUtf8ByteString(encodeUtf8ByteString(value).slice(0, limit));
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

function setPetName(result, field, value, negated, lineNumber) {
    if (!negated && value == null) {
        optionError(lineNumber, `${field} requires a value`);
    }
    result[field] = negated || value === 'none' || value === '(none)'
        ? '' : sanitizePetName(value, result.iflags.wc_eight_bit_input);
}

// C ref: options.c optfn_fruit(do_set) during initial option parsing.
// Singularization and fruit-chain insertion are deferred to
// initoptions_finish(), after the complete configuration has been read.
function setFruit(result, value, negated, lineNumber) {
    if (negated) {
        if (value != null && value !== '') {
            optionError(lineNumber, 'negated fruit cannot have a value');
        }
        result.pl_fruit = DEFAULT_FRUIT;
        return;
    }
    if (value == null || value === '')
        optionError(lineNumber, 'fruit requires a value');
    result.pl_fruit = normalize_initial_fruit(
        value,
        result.iflags.wc_eight_bit_input,
    );
}

function setRoleplay(result, field, value, negated, lineNumber) {
    const enabled = booleanValue(value, negated, field, lineNumber);
    result.uroleplay[field] = enabled;
    if (field === 'pauper') result.uroleplay.nudist = enabled;
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

const MENU_HEADING_ATTRIBUTES = Object.freeze({
    none: ATR_NONE,
    normal: ATR_NONE,
    bold: ATR_BOLD,
    // Recorder patch 006 only retains bold, underline, and inverse. These
    // valid tty styles therefore have the same captured value as ATR_NONE.
    dim: ATR_NONE,
    italic: ATR_NONE,
    blink: ATR_NONE,
    underline: ATR_UNDERLINE,
    uline: ATR_UNDERLINE,
    inverse: ATR_INVERSE,
    reverse: ATR_INVERSE,
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

const STATUS_CONDITION_ALIASES = Object.freeze({
    strangled: ['strngl'],
    all: SOURCE_CONDITION_NAMES,
    majortroubles: [
        'foodpois', 'grab', 'lava', 'slime', 'stone', 'strngl', 'termill',
    ],
    minortroubles: [
        'blind', 'conf', 'deaf', 'hallucinat', 'paralyzed', 'submerged',
        'stun',
    ],
    movement: ['levitate', 'fly', 'ride'],
    optin: SOURCE_CONDITION_NAMES.filter(
        (name) => !DEFAULT_STATUS_CONDITIONS[name],
    ),
});

function statusHiliteFieldName(rawName) {
    const normalized = menuHeadingToken(rawName);
    const exact = Object.keys(STATUS_HILITE_FIELDS).find(
        (name) => menuHeadingToken(name) === normalized,
    );
    if (exact) return exact;
    if (Object.hasOwn(STATUS_HILITE_FIELD_ALIASES, normalized)) {
        return STATUS_HILITE_FIELD_ALIASES[normalized];
    }
    const partials = Object.keys(STATUS_HILITE_FIELDS).filter(
        (name) => menuHeadingToken(name).startsWith(normalized),
    );
    return partials.length === 1 ? partials[0] : null;
}

function parseStatusHiliteAction(
    rawAction,
    lineNumber,
    { allowRepeatedColors = false, inheritedColor = NO_COLOR } = {},
) {
    const subfields = String(rawAction).split(/[+&]/u);
    if (!subfields.length || subfields.some((part) => !part.trim())) {
        optionError(lineNumber, `invalid status highlight '${rawAction}'`);
    }
    let attr = ATR_NONE;
    let clearAttributes = false;
    let color = inheritedColor;
    let colorSeen = false;
    for (const rawSubfield of subfields) {
        const token = menuHeadingToken(rawSubfield);
        const parsedAttr = menuHeadingAttribute(token);
        if (parsedAttr != null) {
            if (parsedAttr === ATR_NONE) {
                attr = ATR_NONE;
                clearAttributes = true;
            } else {
                attr |= parsedAttr;
            }
            continue;
        }
        const parsedColor = menuHeadingColor(token, rawSubfield.trim());
        if (parsedColor == null || (colorSeen && !allowRepeatedColors)) {
            optionError(lineNumber, `invalid status highlight '${rawAction}'`);
        }
        color = parsedColor;
        colorSeen = true;
    }
    return { attr, clearAttributes, color };
}

function statusConditionNames(rawConditions, lineNumber) {
    const selected = new Set();
    for (const rawCondition of String(rawConditions).split(/[+&]/u)) {
        const token = menuHeadingToken(rawCondition);
        if (!token) {
            optionError(
                lineNumber,
                `unknown status condition '${rawCondition}'`,
            );
        }
        const canonical = STATUS_HILITE_CONDITIONS[token];
        const alias = STATUS_CONDITION_ALIASES[token];
        // botl.c accumulates every alias whose name shares this prefix.  In
        // particular, "m" selects majortroubles, minortroubles, and movement.
        const partialAliases = Object.keys(STATUS_CONDITION_ALIASES)
            .filter((name) => name.startsWith(token));
        const names = canonical ? [canonical]
            : alias ?? partialAliases.flatMap(
                (name) => STATUS_CONDITION_ALIASES[name],
            );
        if (!names.length) {
            optionError(lineNumber, `unknown status condition '${rawCondition}'`);
        }
        for (const name of names) selected.add(name);
    }
    return [...selected];
}

function parseNumericStatusThreshold(rawThreshold) {
    const match = String(rawThreshold).match(
        /^([<>]=?|=)?([+-]?\d+)(%)?$/u,
    );
    if (!match) return null;
    const operator = match[1] || '=';
    return {
        behavior: match[3] ? 'percentage' : 'absolute',
        relation: operator,
        value: Number.parseInt(match[2], 10),
    };
}

function parseStatusHiliteRule(field, threshold, action, lineNumber) {
    const fieldType = STATUS_HILITE_FIELDS[field];
    const normalized = String(threshold).trim().toLowerCase();
    let behavior;
    let relation = '=';
    let value = null;
    let text = '';
    if (normalized === 'always') {
        behavior = 'always';
    } else if (normalized === 'up') {
        behavior = 'changed';
        relation = fieldType === 'string' ? '=' : '>';
    } else if (normalized === 'down') {
        behavior = 'changed';
        relation = fieldType === 'string' ? '=' : '<';
    } else if (normalized === 'changed') {
        behavior = 'changed';
    } else if (field === 'hitpoints' && normalized === 'criticalhp') {
        behavior = 'critical';
    } else {
        const numeric = parseNumericStatusThreshold(normalized);
        if (numeric) {
            if (fieldType === 'string') {
                optionError(
                    lineNumber,
                    `status field '${field}' does not accept numeric thresholds`,
                );
            }
            ({ behavior, relation, value } = numeric);
            if (behavior === 'percentage') {
                if (!STATUS_PERCENT_FIELDS.has(field)) {
                    optionError(
                        lineNumber,
                        `status field '${field}' does not accept percentages`,
                    );
                }
                if (value < 0 || value > 100
                    || (relation === '<' && value === 0)
                    || (relation === '>' && value === 100)) {
                    optionError(
                        lineNumber,
                        `status percentage '${threshold}' is out of range`,
                    );
                }
            } else {
                const lower = field === 'armor-class' ? -128
                    : relation === '>' ? -1 : relation === '<' ? 1 : 0;
                if (value < lower
                    || (fieldType === 'int' && value > 32767)) {
                    optionError(
                        lineNumber,
                        `status threshold '${threshold}' is out of range`,
                    );
                }
            }
        } else if (Object.hasOwn(STATUS_TEXT_THRESHOLDS, field)) {
            const canonical = STATUS_TEXT_THRESHOLDS[field][
                menuHeadingToken(normalized)
            ];
            if (!canonical) {
                optionError(
                    lineNumber,
                    `unknown status threshold '${threshold}'`,
                );
            }
            behavior = 'text';
            text = canonical;
        } else if (fieldType === 'string') {
            behavior = 'text';
            text = normalized;
        } else {
            optionError(
                lineNumber,
                `unknown status behavior '${threshold}'`,
            );
        }
    }
    return {
        field,
        behavior,
        relation,
        value,
        text,
        style: parseStatusHiliteAction(action, lineNumber),
    };
}

function parseStatusHiliteComponents(components, lineNumber) {
    const field = statusHiliteFieldName(components[0]);
    if (!field) {
        optionError(
            lineNumber,
            `unknown status field '${components[0]}'`,
        );
    }
    if (components.length < 2) {
        optionError(lineNumber, 'incomplete status highlight rule');
    }
    const fields = field === 'characteristics'
        ? STATUS_CHARACTERISTIC_FIELDS : [field];
    const rules = [];
    if (field === 'condition') {
        if (components.length < 3 || components.length % 2 === 0) {
            optionError(lineNumber, 'incomplete condition highlight rule');
        }
        let inheritedColor = NO_COLOR;
        for (let index = 1; index < components.length; index += 2) {
            const style = parseStatusHiliteAction(
                components[index + 1],
                lineNumber,
                { allowRepeatedColors: true, inheritedColor },
            );
            inheritedColor = style.color;
            rules.push({
                field: 'condition',
                conditions: statusConditionNames(
                    components[index], lineNumber,
                ),
                style,
            });
        }
        return rules;
    }
    if (components.length === 2) {
        for (const target of fields) {
            rules.push(parseStatusHiliteRule(
                target, 'always', components[1], lineNumber,
            ));
        }
        return rules;
    }
    if (components.length % 2 === 0) {
        optionError(lineNumber, 'incomplete status highlight rule');
    }
    for (let index = 1; index < components.length; index += 2) {
        for (const target of fields) {
            rules.push(parseStatusHiliteRule(
                target,
                components[index],
                components[index + 1],
                lineNumber,
            ));
        }
    }
    return rules;
}

function parseStatusHiliteRules(value, lineNumber) {
    const rules = [];
    let components = [''];
    let componentIndex = 0;
    const flush = () => {
        if (components.some(Boolean)) {
            rules.push(...parseStatusHiliteComponents(
                components.map((part) => part.trim()), lineNumber,
            ));
        }
        components = [''];
        componentIndex = 0;
    };
    for (const character of String(value).toLowerCase()) {
        if (character === '/') {
            componentIndex++;
            components[componentIndex] = '';
        } else if (character === ' ') {
            if (componentIndex === 1
                && menuHeadingToken(components[0]) === 'title') {
                components[componentIndex] += character;
            } else if (componentIndex > 0) {
                flush();
            }
        } else {
            components[componentIndex] += character;
        }
    }
    flush();
    if (!rules.length) {
        optionError(lineNumber, 'hilite_status requires a value');
    }
    return rules;
}

function setStatusHiliteOption(result, value, negated, lineNumber) {
    if (negated && value != null) {
        result.iflags.status_hilites.length = 0;
        return;
    }
    if (value == null || !String(value).trim()) {
        optionError(lineNumber, 'hilite_status requires a value');
    }
    result.iflags.status_hilites.push(
        ...parseStatusHiliteRules(value, lineNumber),
    );
    if (!result.iflags.hilite_delta) result.iflags.hilite_delta = 3;
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

function parseMenuHeadingStyle(value, lineNumber) {
    const rawTokens = String(value).split('&').map((token) => token.trim());
    const tokens = rawTokens.map(menuHeadingToken);
    let color = NO_COLOR;
    let attr = ATR_NONE;
    let valid = tokens.length > 0 && tokens.length <= 2
        && tokens.every(Boolean);

    if (valid && tokens.length === 1) {
        const parsedAttr = menuHeadingAttribute(tokens[0]);
        const parsedColor = menuHeadingColor(tokens[0], rawTokens[0]);
        if (parsedAttr != null) attr = parsedAttr;
        else if (parsedColor != null) color = parsedColor;
        else valid = false;
    } else if (valid) {
        const firstColor = menuHeadingColor(tokens[0], rawTokens[0]);
        const firstAttr = menuHeadingAttribute(tokens[0]);
        const secondColor = menuHeadingColor(tokens[1], rawTokens[1]);
        const secondAttr = menuHeadingAttribute(tokens[1]);
        if (firstColor != null && secondAttr != null) {
            color = firstColor;
            attr = secondAttr;
        } else if (firstAttr != null && secondColor != null) {
            color = secondColor;
            attr = firstAttr;
        } else {
            valid = false;
        }
    }
    if (!valid) {
        optionError(lineNumber, `invalid menu_headings style '${value}'`);
    }
    return { attr, color };
}

function setMenuHeadings(result, value, negated, lineNumber) {
    if (value == null) {
        result.iflags.menu_headings = {
            attr: negated ? ATR_NONE : ATR_INVERSE,
            color: NO_COLOR,
        };
    } else {
        if (negated) {
            optionError(
                lineNumber,
                'negated menu_headings cannot have a value',
            );
        }
        result.iflags.menu_headings = parseMenuHeadingStyle(
            value, lineNumber,
        );
    }
}

// C ref: options.c:optfn_petattr(). The tty port accepts one text
// attribute and keeps the chosen style when hilite_pet is later disabled.
function setPetAttribute(result, value, negated, lineNumber) {
    if (value != null && negated) {
        optionError(lineNumber, 'negated petattr cannot have a value');
    }
    if (value != null) {
        const attr = menuHeadingAttribute(menuHeadingToken(value));
        if (attr == null) {
            optionError(lineNumber, `unknown petattr parameter '${value}'`);
        }
        result.iflags.wc2_petattr = attr;
    } else if (negated) {
        result.iflags.wc2_petattr = ATR_NONE;
    }
    result.iflags.wc_hilite_pet = result.iflags.wc2_petattr !== ATR_NONE;
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

const MENU_COMMAND_BY_NAME = Object.freeze(Object.fromEntries(
    MENU_COMMAND_OPTIONS.map(({ name, command }) => [name, command]),
));

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

function textToKey(text) {
    let value = String(text).trim();
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

function illegalMenuCommandKey(key) {
    const ch = String.fromCharCode(key);
    const sourceLetter = (key >= 64 && key <= 90)
        || (key >= 97 && key <= 122);
    if (key === 0 || key === 10 || key === 13 || key === 27 || key === 32
        || (key >= 48 && key <= 57) || (sourceLetter && key !== 64)) {
        return true;
    }
    // The comment above illegal_menu_cmd_key() also lists '#', but the
    // executable source omits it. Preserve that upstream quirk.
    return DEFAULT_OBJECT_CLASS_SYMBOLS.has(ch);
}

function addMenuCommandAlias(result, fromKey, command) {
    if (result.iflags.mapped_menu_cmds.length >= 32) return;
    result.iflags.mapped_menu_cmds += String.fromCharCode(fromKey);
    result.iflags.mapped_menu_op += command;
}

function setMenuCommandOption(
    result, descriptor, value, negated, lineNumber,
) {
    if (negated) {
        optionError(lineNumber, `${descriptor.name} may not be negated`);
    }
    if (value == null || value === '') {
        optionError(lineNumber, `${descriptor.name} requires a value`);
    }
    const key = textToKey(value);
    if (illegalMenuCommandKey(key)) {
        optionError(lineNumber, `reserved menu command key '${value}'`);
    }
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

function applyMenuBinding(result, binding, lineNumber) {
    const colon = binding.indexOf(':');
    if (colon < 0) return;
    const keyText = binding.slice(0, colon);
    const commandName = binding.slice(colon + 1).trim();
    const command = MENU_COMMAND_BY_NAME[commandName];
    const key = textToKey(keyText);
    if (command === undefined) {
        if (keyText === 'mouse1' || keyText === 'mouse2') return;
        if (!key) {
            optionError(lineNumber, `unknown key binding key '${keyText}'`);
        }
        if (SPECIAL_KEY_COMMANDS.has(commandName)) {
            result.commandOperations.push({
                type: 'special_key',
                key,
                command: commandName,
            });
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
        return;
    }
    if (!key || illegalMenuCommandKey(key)) {
        optionError(lineNumber, `reserved menu command key '${keyText}'`);
    }
    addMenuCommandAlias(result, key, command);
}

// C ref: options.c optfn_number_pad(). These fields affect cmd_from_ecname()
// during tutorial generation and the same source-ordered runtime bindings.
function setNumberPadOption(result, value, negated, lineNumber) {
    let enabled;
    let mode;
    if (value == null || value === '') {
        enabled = !negated;
        mode = 0;
    } else {
        if (negated) {
            optionError(lineNumber, 'number_pad may not be negated with a value');
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < -1 || parsed > 4
            || (parsed === 0 && value[0] !== '0')) {
            optionError(lineNumber, `illegal number_pad parameter '${value}'`);
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

// C ref: options.c optfn_runmode(). Its four names are matched with
// str_start_is(name, value, TRUE), so any nonempty prefix of a name selects
// it and the first match in this order wins.
const RUNMODE_NAMES = Object.freeze([
    ['teleport', RUN_TPORT],
    ['run', RUN_LEAP],
    ['walk', RUN_STEP],
    ['crawl', RUN_CRAWL],
]);

function setRunmode(result, value, negated, lineNumber) {
    if (negated) {
        result.flags.runmode = RUN_TPORT;
        return;
    }
    if (value == null || value === '')
        optionError(lineNumber, 'Value is mandatory for runmode');
    const lowered = value.toLowerCase();
    const match = RUNMODE_NAMES.find(([name]) => name.startsWith(lowered));
    if (!match)
        optionError(lineNumber, `Unknown runmode parameter '${value}'`);
    result.flags.runmode = match[1];
}

// C ref: options.c parsebindings(). Comma-separated bindings recurse into
// their suffix, so the rightmost alias is appended first and wins collisions.
function applyMenuBindings(result, bindings, lineNumber) {
    const separator = bindingSeparator(bindings);
    if (separator >= 0) {
        applyMenuBindings(result, bindings.slice(separator + 1), lineNumber);
        applyMenuBinding(result, bindings.slice(0, separator), lineNumber);
    } else {
        applyMenuBinding(result, bindings, lineNumber);
    }
}

function applyBooleanOption(result, name, value, negated, lineNumber) {
    const enabled = booleanValue(value, negated, name, lineNumber);
    if (name === 'female' || name === 'male') {
        const female = name === 'female' ? enabled : !enabled;
        result.flags.female = female;
        result.flags.initgend = result.gender = female ? 1 : 0;
    } else if (name === 'autopickup') result.flags.pickup = enabled;
    else if (name === 'color') {
        result.flags.color = enabled;
        result.iflags.wc_color = enabled;
    } else if (name === 'use_inverse') {
        result.iflags.wc_inverse = enabled;
    } else if (name === 'use_darkgray') {
        // Preserve optlist.h's source option state. At the recorder-facing
        // grid boundary, both the remapped black wire value and the terminal
        // default sentinel intentionally canonicalize to NO_COLOR.
        result.iflags.wc2_darkgray = enabled;
    } else if (name === 'hilite_pet') {
        result.iflags.wc_hilite_pet = enabled;
        if (enabled && result.iflags.wc2_petattr === ATR_NONE) {
            result.iflags.wc2_petattr = ATR_INVERSE;
        }
    } else if (name === 'hilite_pile') {
        result.iflags.hilite_pile = enabled;
    } else if (name === 'hitpointbar') {
        result.iflags.wc2_hitpointbar = enabled;
    } else if (name === 'legacy') result.flags.legacy = enabled;
    else if (name === 'tutorial') {
        result.flags.tutorial = enabled;
        result.tutorial_set = true;
    } else if (name === 'splash_screen') {
        result.iflags.wc_splash_screen = enabled;
    } else if (name === 'status_updates') {
        result.iflags.status_updates = enabled;
    } else if (name === 'accessiblemsg') {
        result.a11y.accessiblemsg = enabled;
    } else if (name === 'mention_map') {
        result.a11y.glyph_updates = enabled;
    } else if (name === 'mon_movement') {
        result.a11y.mon_movement = enabled;
    } else if (name === 'spot_monsters') {
        result.a11y.mon_notices = enabled;
    } else if (name === 'menu_overlay') {
        result.iflags.menu_overlay = enabled;
    } else if (name === 'eight_bit_tty') {
        result.iflags.wc_eight_bit_input = enabled;
    } else if (name === 'altmeta') {
        result.iflags.altmeta = enabled;
    } else if (name === 'cmdassist') {
        result.iflags.cmdassist = enabled;
    } else if (name === 'extmenu') {
        // C ref: options.c. tty_get_ext_cmd() reads this as its first test, so
        // it has to reach iflags rather than being accepted and dropped;
        // extcmd_via_menu() is unported and the guard there stops on it.
        result.iflags.extmenu = enabled;
    } else if (name === 'customcolors' || name === 'customsymbols') {
        result.iflags[name] = enabled;
    } else if (name === 'safe_pet') result.flags.safe_dog = enabled;
    else if (name === 'safe_wait') result.flags.safe_wait = enabled;
    else if (name === 'pushweapon') result.flags.pushweapon = enabled;
    else if (name === 'rest_on_space') {
        result.flags.rest_on_space = enabled;
        result.commandOperations.push({
            type: 'rest_on_space',
            enabled,
        });
    } else if (name === 'mention_decor') {
        result.flags.mention_decor = enabled;
        // C ref: options.c opt_mention_decor. A toggle forgets the terrain
        // described under the previous setting.
        result.iflags.prev_decor = STONE;
    } else if (name === 'showdamage') {
        // optlist.h:654-655 stores showdamage in iflags, not flags, and
        // defaults it Off. hack.c showdamage() is its only reader.
        result.iflags.showdamage = enabled;
    } else if (name === 'showexp') result.flags.showexp = enabled;
    else if (name === 'time') result.flags.time = enabled;
    else if (name === 'verbose') result.flags.verbose = enabled;
    else result.flags[name] = enabled;
}

// Options whose source boolean handlers have concrete state ownership in this
// startup port.  Explicit true/false values must reach those handlers too;
// otherwise they fall through to the intentionally opaque compound-option
// preservation path and create stray string-valued flags.
const HANDLED_BOOLEAN_OPTIONS = new Set([
    'female', 'male', 'acoustics', 'autopickup', 'color', 'use_darkgray',
    'use_inverse',
    'hilite_pet', 'hilite_pile', 'hitpointbar', 'legacy', 'tutorial',
    'splash_screen',
    'status_updates', 'accessiblemsg', 'mention_map', 'mon_movement',
    'spot_monsters',
    'menu_overlay', 'eight_bit_tty', 'customcolors', 'customsymbols',
    'altmeta', 'autoopen', 'cmdassist', 'extmenu', 'safe_pet', 'safe_wait',
    'pushweapon',
    'rest_on_space',
    'mention_decor',
    'showdamage', 'showexp', 'time', 'verbose',
]);

function setWhatisCoord(result, value, negated, lineNumber) {
    if (negated) {
        result.iflags.getpos_coords = GPCOORDS_NONE;
        return;
    }
    if (!value) optionError(lineNumber, 'whatis_coord requires a value');
    const mode = value[0].toLowerCase();
    if (![GPCOORDS_NONE, GPCOORDS_COMPASS, GPCOORDS_COMFULL,
        GPCOORDS_MAP, GPCOORDS_SCREEN].includes(mode)) {
        optionError(lineNumber, `unknown whatis_coord parameter '${value}'`);
    }
    result.iflags.getpos_coords = mode;
}

// C ref: options.c optfn_pile_limit(). The recorder's glibc atoi() accepts an
// initial signed decimal run, returns zero when there is none, saturates first
// to signed long, then narrows to flags.pile_limit's signed 32-bit int. The
// option handler replaces that narrowed result with PILE_LIMIT_DFLT when it is
// negative. BigInt preserves this phase order across JavaScript hosts. Generic
// compound-option validation rejects a missing positive value before this
// handler, while an empty negated spelling means "never skip".
function setPileLimit(result, value, negated, lineNumber) {
    if (negated && value != null && value.length > 0) {
        optionError(
            lineNumber,
            "'pile_limit' may not both have a value and be negated",
        );
    }
    if (negated) {
        result.flags.pile_limit = 0;
        return;
    }
    if (value == null || value.length === 0) {
        optionError(lineNumber, "'pile_limit' requires a value");
    }
    const match = value.match(/^[\t\n\v\f\r ]*[+-]?\d+/u);
    let wide = match ? BigInt(match[0].trim()) : 0n;
    const longMax = (1n << 63n) - 1n;
    const longMin = -(1n << 63n);
    if (wide > longMax) wide = longMax;
    else if (wide < longMin) wide = longMin;
    const parsed = Number(BigInt.asIntN(32, wide));
    result.flags.pile_limit = parsed < 0 ? 5 : parsed;
}

function sourceOptionMatch(parsedName) {
    return SOURCE_OPTION_MATCHES.find(([canonical, minLength]) => (
        !SOURCE_PREFIX_OPTION_NAMES.includes(canonical)
            && parsedName.length >= minLength
            && canonical.startsWith(parsedName)
    ));
}

function isSourceOptionPrefix(parsedName) {
    return SOURCE_OPTION_NAMES.some((canonical) => (
        canonical.startsWith(parsedName)
    ));
}

function sourceConditionMatch(parsedName, value) {
    if (value != null || !parsedName.startsWith('cond_')) return null;
    const suffix = parsedName.slice('cond_'.length);
    const canonical = SOURCE_CONDITION_NAMES.find((candidate) => (
        suffix.length >= Math.min(candidate.length, 4)
            && candidate.startsWith(suffix)
    ));
    return canonical ? `cond_${canonical}` : null;
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

function applyOption(result, optionState, option, lineNumber) {
    const { name: rawName, value } = splitNameAndValue(option);
    const {
        name: parsedName,
        sourceName,
        negated,
    } = stripNegation(rawName);
    if (!parsedName) optionError(lineNumber, 'empty option');

    const sourceMatch = sourceOptionMatch(parsedName);
    const hasAlias = Object.hasOwn(OPTION_ALIASES, parsedName);
    const conditionMatch = sourceConditionMatch(parsedName, value);
    // options.c strips negation, then checks this prefix case-sensitively.
    const isSymbolAssignment = isSourceSymbolAssignment(sourceName, value);
    let name = sourceMatch?.[0]
        ?? (hasAlias ? OPTION_ALIASES[parsedName] : null);
    if (!name && conditionMatch) name = conditionMatch;
    if (!name && isSymbolAssignment) name = parsedName;
    if (!name) {
        const description = isSourceOptionPrefix(parsedName)
            ? 'unknown or ambiguous option' : 'unknown option';
        optionError(lineNumber, `${description} '${parsedName}'`);
    }

    const menuCommand = menuCommandOption(name);

    if (name === 'name') {
        result.name = truncateByteString(
            requireValue(value, name, negated, lineNumber),
            PLAYER_NAME_BYTE_LIMIT,
        );
    } else if (name === 'role') {
        setCharacterOption(
            result, optionState, 'role', value, negated, lineNumber,
        );
    } else if (name === 'race') {
        setCharacterOption(
            result, optionState, 'race', value, negated, lineNumber,
        );
    } else if (name === 'gender') {
        setCharacterOption(
            result, optionState, 'gender', value, negated, lineNumber,
        );
    } else if (name === 'alignment') {
        setCharacterOption(
            result, optionState, 'alignment', value, negated, lineNumber,
        );
    } else if (name === 'playmode') {
        setPlaymode(result, value, negated, lineNumber);
    } else if (name === 'menu_headings') {
        setMenuHeadings(result, value, negated, lineNumber);
    } else if (name === 'petattr') {
        setPetAttribute(result, value, negated, lineNumber);
    } else if (name === 'hilite_status') {
        setStatusHiliteOption(result, value, negated, lineNumber);
    } else if (name === 'statushilites') {
        setStatusHiliteDuration(result, value, negated);
    } else if (name.startsWith('cond_')) {
        const enabled = !negated;
        result.flags[name] = enabled;
        result.iflags.status_conditions[name.slice('cond_'.length)] = enabled;
    } else if (menuCommand && parsedName === name) {
        setMenuCommandOption(
            result, menuCommand, value, negated, lineNumber,
        );
    } else if (menuCommand || isMenuCommandPrefix(parsedName)) {
        optionError(
            lineNumber,
            `menu command option '${parsedName}' requires its full canonical name`,
        );
    } else if (name === 'packorder') {
        // options.c change_inv_order() rewrites flags.inv_order from this
        // value. That is not ported, so the value is retained and
        // invent.c display_pickinv()'s port stops when it is present rather
        // than listing the inventory in the default order.
        result.flags.packorder = negated ? null : value;
    } else if (name === 'pettype') {
        setPettype(result, value, negated, lineNumber);
    } else if (name === 'fruit') {
        setFruit(result, value, negated, lineNumber);
    } else if (name === 'catname' || name === 'dogname'
               || name === 'horsename') {
        setPetName(result, name, value, negated, lineNumber);
    } else if (name === 'blind' || name === 'deaf' || name === 'nudist'
               || name === 'pauper' || name === 'reroll') {
        setRoleplay(result, name, value, negated, lineNumber);
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
        setNumberPadOption(result, value, negated, lineNumber);
    } else if (name === 'whatis_coord') {
        setWhatisCoord(result, value, negated, lineNumber);
    } else if (name === 'runmode') {
        setRunmode(result, value, negated, lineNumber);
    } else if (name === 'pile_limit') {
        setPileLimit(result, value, negated, lineNumber);
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
            optionError(
                lineNumber, "the 'msg_window' option may not be negated",
            );
        } else {
            tmp = value[0].toLowerCase();
        }
        if (!'scfr'.includes(tmp)) {
            optionError(
                lineNumber, `unknown msg_window parameter '${value}'`,
            );
        }
        result.iflags.prevmsg_window = tmp;
    } else if (name === 'sortloot') {
        // C ref: options.c optfn_sortloot()'s do_set arm, which stores the
        // lowercased first letter and rejects anything else. optlist.h gives
        // sortloot negateok No, so parseoptions() answers a negation with
        // bad_negation() before the handler runs, which is why the handler
        // declares its negated argument UNUSED. The handler then re-reads the
        // value with string_for_env_opt(name, opts, FALSE), so a spelling
        // with no value is the "Missing parameter" config error rather than a
        // default. This port stops on each of those errors.
        if (negated) {
            optionError(
                lineNumber,
                `negated compound option '${name}' is not supported`,
            );
        }
        if (!value) optionError(lineNumber, "'sortloot' requires a value");
        const c = value[0].toLowerCase();
        if (!'nlf'.includes(c)) {
            optionError(
                lineNumber, `unknown sortloot parameter '${value}'`,
            );
        }
        result.flags.sortloot = c;
    } else if (HANDLED_BOOLEAN_OPTIONS.has(name)) {
        applyBooleanOption(result, name, value, negated, lineNumber);
    } else if (value != null) {
        if (negated) {
            optionError(
                lineNumber,
                `negated compound option '${name}' is not supported`,
            );
        }
        if (name === 'symset') {
            result.symset = value;
            appendSymbolSelection(result, 'primary', value);
        } else if (name === 'roguesymset') {
            result.roguesymset = value;
            appendSymbolSelection(result, 'rogue', value);
        }
        else if (name === 'suppress_alert') {
            result.flags.suppress_alert = value;
        } else if (name === 'versinfo') {
            const versinfo = Number.parseInt(value, 10);
            if (!Number.isInteger(versinfo)
                || versinfo < 1 || versinfo > 7) {
                optionError(
                    lineNumber,
                    "'versinfo' must be a bitmask from 1 through 7",
                );
            }
            result.flags.versinfo = versinfo;
        } else if (name === 'statuslines') {
            // options.c:optfn_statuslines() uses atoi() and accepts only the
            // two window-port layouts supported by tty.
            const statuslines = Number.parseInt(value, 10);
            if (statuslines !== 2 && statuslines !== 3) {
                optionError(
                    lineNumber,
                    "'statuslines' must be 2 or 3",
                );
            }
            result.iflags.wc2_statuslines = statuslines;
        } else {
            // This parser currently gives source semantics to the startup
            // subset above. Preserve other valid options for later subsystem
            // ports instead of pretending to interpret their values here.
            result.flags[name] = value;
        }
    } else {
        applyBooleanOption(result, name, value, negated, lineNumber);
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

// C ref: cfgfiles.c config_line_stmt[].  Each row here dispatches to a
// cnf_line_<NAME>() this port has not ported, and each of those appends to a
// list the options menu counts.  parse_config_line() matches on the same
// case-insensitive prefix of at least `minLength` bytes, so these lengths are
// the C table's: CNFL_N(AUTOPICKUP_EXCEPTION, 5), CNFL_N(AUTOCOMPLETE, 5),
// CNFL_N(MSGTYPE, 7) and CNFL_N(MENUCOLOR, 9).  Recording the statement lets
// the readers of the list refuse rather than report a list the port never
// built.
const UNPORTED_CONFIG_STATEMENTS = Object.freeze([
    { name: 'autopickup_exception', minLength: 5, kind: 'unported' },
    { name: 'autocomplete', minLength: 5, kind: 'unported' },
    { name: 'msgtype', minLength: 7, kind: 'unported' },
    { name: 'menucolor', minLength: 9, kind: 'unported' },
]);

const CONFIG_STATEMENTS = Object.freeze([
    { name: 'options', minLength: 4, kind: 'options' },
    { name: 'bindings', minLength: 4, kind: 'bindings' },
    ...UNPORTED_CONFIG_STATEMENTS,
    { name: 'roguesymbols', minLength: 4, kind: 'symbols', set: 'rogue' },
    { name: 'symbols', minLength: 4, kind: 'symbols', set: 'primary' },
    { name: 'name', minLength: 4, kind: 'direct', directName: 'name' },
    { name: 'role', minLength: 4, kind: 'direct', directName: 'role' },
    {
        name: 'character', minLength: 4,
        kind: 'direct', directName: 'role',
    },
    { name: 'dogname', minLength: 3, kind: 'direct', directName: 'dogname' },
    { name: 'catname', minLength: 3, kind: 'direct', directName: 'catname' },
]);

function configDelimiter(line) {
    const colon = line.indexOf(':');
    const equals = line.indexOf('=');
    if (colon >= 0 && equals >= 0) return Math.min(colon, equals);
    return Math.max(colon, equals);
}

function matchesConfigName(name, canonical, minLength) {
    return name.length >= minLength && canonical.startsWith(name);
}

function configSection(line) {
    if (!line.startsWith('[')) return null;
    const close = line.indexOf(']', 1);
    if (close < 0) return null;
    let suffixIndex = close + 1;
    while (line[suffixIndex] === ' ') ++suffixIndex;
    if (suffixIndex < line.length && line[suffixIndex] !== '#') return null;
    return { name: trimConfigPadding(line.slice(1, close)) };
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
    const lines = logicalConfigLines(rc);
    for (const configLine of lines) {
        const { lineNumber } = configLine;
        // parse_conf_buf() calls handle_config_section() on every logical
        // line. is_config_section() applies trimspaces() before checking for
        // '[', so that outer padding is removed even from CHOOSE and OPTIONS.
        // parse_config_line() then normalizes a separate copy with mungspaces().
        const paddingTrimmedLine = trimConfigPadding(configLine.line);
        const mungedLine = mungspaces(paddingTrimmedLine);
        if (!mungedLine || mungedLine.startsWith('#')) continue;

        const section = configSection(paddingTrimmedLine);
        if (section) {
            currentSection = null;
            if (chosenSection != null) {
                if (section.name) currentSection = section.name;
                else chosenSection = null;
            }
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
            if (delimiter < 0) continue;
            chosenSection = null;
            const rawDelimiter = configDelimiter(paddingTrimmedLine);
            chosenSection = chooseRandomPart(
                paddingTrimmedLine.slice(rawDelimiter + 1), random,
            );
            continue;
        }
        if (delimiter < 0) continue;

        const statement = CONFIG_STATEMENTS.find(({ name, minLength }) => (
            matchesConfigName(statementName, name, minLength)
        ));
        if (!statement) continue;
        if (statement.kind === 'unported') {
            result.unportedConfigStatements.push(statement.name);
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
            for (let optionIndex = options.length - 1;
                optionIndex >= 0; --optionIndex) {
                const rawOption = options[optionIndex];
                // parseoptions() enforces this before stripping whitespace or
                // invoking an option handler, and continues with other items.
                if (encodeUtf8ByteString(rawOption).length
                    > OPTION_ELEMENT_BYTE_LIMIT) continue;
                const option = trimCWhitespace(rawOption);
                if (option) {
                    applyOption(result, optionState, option, lineNumber);
                }
            }
            continue;
        }

        const normalizedValue = mungspaces(rawValue);
        if (statement.kind === 'bindings') {
            applyMenuBindings(result, normalizedValue, lineNumber);
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
    // options.c optfn_boolean()'s do_set arm writes *allopt[optidx].addr, the
    // field read just above.  This port's parse writes that field only for the
    // options applyBooleanOption() has an arm for; everything else lands under
    // the option's own lowercased name, leaving addr holding the compiled-in
    // default applyBooleanOptionDefaults() seeded.  When the two fields
    // disagree the port does not hold the value doset() has to print, so stop
    // rather than show the default as though it were the session's setting.
    // The two are the same field whenever addr is `flags.<name>`, which is
    // why an option the parse does handle never reaches this.
    const parsed = state.flags?.[option.name.toLowerCase()];
    if (parsed !== undefined && parsed !== value) {
        throw new UnsupportedOptionMenuError(
            `parseoptions() to store '${option.name}' in ${option.addr}`,
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
// C ref: options.c paranoia[], in the order optfn_paranoid_confirmation()
// walks when it spells the current bits.  The two config-only trailing rows,
// "none" and "all", carry no bit of their own and never print.
const paranoia = Object.freeze([
    [PARANOID_CONFIRM, 'Confirm'],
    [PARANOID_QUIT, 'quit'],
    [PARANOID_DIE, 'die'],
    [PARANOID_BONES, 'bones'],
    [PARANOID_HIT, 'attack'],
    [PARANOID_BREAKWAND, 'wand-break'],
    [PARANOID_EATING, 'eat'],
    [PARANOID_WERECHANGE, 'Were-change'],
    [PARANOID_PRAY, 'pray'],
    [PARANOID_TRAP, 'trap'],
    [PARANOID_AUTOALL, 'Autoall'],
    [PARANOID_SWIM, 'swim'],
    [PARANOID_REMOVE, 'Remove'],
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

// C ref: botl.c count_status_hilites().  Its gather pass walks every status
// field and every condition; with no rule of either kind configured it
// counts nothing, and this port has no representation for the line-per-rule
// count the pass produces once rules exist.
function count_status_hilites(state) {
    if (state.iflags?.status_hilites?.length)
        throw new UnsupportedOptionMenuError('count_status_hilites() rules');
    return 0;
}

// C ref: options.c count_cond(), over botl.c condtests[].
function count_cond(state) {
    return Object.values(state.iflags?.status_conditions ?? {})
        .filter(Boolean).length;
}

// C ref: options.c count_apes(), over ga.apelist.  cfgfiles.c
// cnf_line_AUTOPICKUP_EXCEPTION() is the only thing that appends to that list
// in reach -- no ported command adds one -- and parseNethackrc() records the
// statement without interpreting it, so the count stops rather than report an
// empty list as the session's.
function count_apes(state) {
    refuseUnportedConfigStatement(state, 'autopickup_exception');
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

// C ref: coloratt.c count_menucolors() over gm.menu_colorings, and options.c
// msgtype_count() over gp.plinemsg_types.  cfgfiles.c cnf_line_MENUCOLOR()
// and cnf_line_MSGTYPE() are what append to those lists at startup, and both
// stop this port above.  Nothing else in reach adds an entry: no js/ module
// writes gm.menu_colorings or gp.plinemsg_types, and the commands that would
// (doset()'s pick loop for either row) are unported.
function count_menucolors(state) {
    refuseUnportedConfigStatement(state, 'menucolor');
    return 0;
}
function msgtype_count(state) {
    refuseUnportedConfigStatement(state, 'msgtype');
    return 0;
}

// C ref: cmd.c count_autocompletions(), over the AUTOCOMP_ADJ flag that
// cmd.c's AUTOCOMPLETE handler sets on an extcmdlist[] row.  The generated
// table carries the compiled-in flags, which is the whole answer once the one
// statement that changes them stops above.
function count_autocompletions(state) {
    refuseUnportedConfigStatement(state, 'autocomplete');
    return extcmdlist.filter((entry) => entry.flags & AUTOCOMP_ADJ).length;
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
    // sounds.c get_soundlib_name() over ga.active_soundlib.  SND_LIB_INTEGRATED
    // is undefined for this build, so soundlib_choices[] holds only
    // nosound_procs and no configuration can select another.
    soundlib: () => 'nosound',
    autounlock: (state, option) => {
        const bits = requireParsedNumber(state, option);
        if (!bits) return 'none';
        return unlocktypes
            .filter((_name, index) => (bits & (1 << index)))
            .join(' + ');
    },
    // go.ov_primary_syms holds an explicit S_boulder override; without one
    // the value falls back to the active rock-class symbol.
    boulder: (state) => String.fromCharCode(
        state.go?.ov_primary_syms?.[SYM_OFF_X + SYM_BOULDER]
        || state.gs.showsyms[SYM_OFF_O + ROCK_CLASS],
    ),
    // gc.crash_email and gc.crash_name are null until a configuration file
    // sets them, and C then leaves the buffer empty.
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
    pickup_burden: (state, option) => burdentype[
        requireParsedNumber(state, option)
    ],
    pickup_types: (state) => {
        // flags.pickup_types holds object-class indices, which
        // optfn_pickup_types()'s do_set arm derives from the option's class
        // symbols. parseNethackrc() has no arm for this option, so a
        // configuration file that sets it leaves its raw class symbols in the
        // same field; a string here is that raw text rather than a parsed
        // list.
        if (typeof state.flags.pickup_types === 'string') {
            throw new UnsupportedOptionMenuError(
                "parseoptions() to interpret 'pickup_types'",
            );
        }
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
        // feature_alert_opts(), which packs the option's version number into
        // this field, is not ported, so zero is the only value it can hold.
        if (requireParsedNumber(state, option) !== 0) {
            throw new UnsupportedOptionMenuError(
                'a packed suppress_alert version',
            );
        }
        return none;
    },
    symset: (state) => symsetValue(state, PRIMARYSET, true),
    // A fifth option whose parsed home is its own name: the parse arm sits
    // inside the branch that needs a value, so `OPTIONS=versinfo`, which C
    // answers with a config error that leaves flags.versinfo alone, reaches
    // applyBooleanOption()'s fallback and leaves a boolean in this field.
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
// it.  packorder is a member on that rule even though it has its own parse
// arm, because that arm only retains the raw text: its handler reads
// flags.inv_order.  Where the raw text lands in the very field the handler
// reads -- autounlock, pickup_burden, pickup_types, suppress_alert and
// versinfo -- there is nothing left to compare against, so those five are
// guarded by type inside their handlers instead and are not members.  The
// other-settings rows need neither guard: each counts live state rather than
// reading an option field.  scripts/options-menu.test.mjs derives the whole
// rule from parseNethackrc(), so the set cannot drift from
// OPTION_VALUE_HANDLERS unnoticed.
export const UNPARSED_COMPOUND_OPTIONS = Object.freeze(new Set([
    'boulder', 'crash_email', 'crash_name', 'crash_urlmax',
    'disclose', 'glyph', 'menu_objsyms', 'menuinvertmode', 'menustyle',
    'msghistory', 'packorder', 'paranoid_confirmation',
    'scores', 'sortdiscoveries', 'sortvanquished',
    'soundlib', 'whatis_filter', 'windowtype',
]));

// C ref: options.c doset_add_menu()'s optfn call, plus the "unknown" default
// it keeps when the handler writes nothing.
function optionValue(state, option, helpers) {
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
// optn_silenterr, has no port: C's optfn_boolean() returns it only from the
// value-parsing and "not anatomically possible" arms, both of which stop with
// a refusal below, and parseoptions() treats it as every other error anyway.
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

// C ref: options.c string_for_opt(opts, TRUE).  Answers the text after the
// first ':' or '=', or the empty string where C answers its empty_optstr
// sentinel.  The val_optional == FALSE caller adds a configuration-file error
// message and is not on any path this port reaches.
function string_for_opt(opts) {
    const colon = opts.indexOf(':');
    const equals = opts.indexOf('=');
    const at = (colon < 0 || (equals >= 0 && equals < colon)) ? equals : colon;
    return (at < 0 || at + 1 >= opts.length) ? '' : opts.slice(at + 1);
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
// (5285).  booleanOptionValue() above reads the address this writes, and this
// is its only writer.
//
// C stores a boolean option once, at allopt[].addr.  This port stores it twice
// whenever applyBooleanOption()'s final arm handled the configuration file's
// copy: that arm writes flags.<name>, which is a second field for the 43
// options whose address is something else.  booleanOptionValue() refuses when
// the two disagree, because before this writer existed the only way they could
// was a configuration file the parse had misplaced.  Now that the menu writes
// the address itself, the parse's copy is a stale duplicate rather than an
// answer, so drop it and leave the address as the value's only owner --
// otherwise the next menu build refuses a value the port does hold.
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

    if (string_for_opt(opts) !== '') {
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
        /*
         * All corridor squares seen via night vision or candles & lamps
         * change.  Update them by calling newsym() on them.
         */
        vision_recalc(2, { state }); /* shut down vision */
        state.vision_full_recalc = 1; /* delayed recalc */
        if (state.iflags.wc_color)
            state.go.opt_need_redraw = true; /* darkroom refresh */
        break;
    case 'dark_room':
        // options.c:5362-5375 shares its arm with 'lit_corridor', and the
        // go.opt_need_redraw it raises takes reset_needed_visuals() into
        // reglyph_darkroom().  js/display.js reglyph_darkroom() explains why
        // this port cannot repair a map remembered under the other setting.
        throw new UnsupportedOptionMenuError(
            "reglyph_darkroom() over a 'dark_room' change",
        );
    case 'wizmgender':
    case 'showrace':
    case 'use_inverse':
    case 'hilite_pile':
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
    if (string_for_opt(opts) !== '') {
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
    let op = await choose_classes_menu(
        state, 'Autopickup what?', ocl, tbuf, helpers,
    );

    while (op.startsWith(' ')) op = op.slice(1);
    if (op[0] !== 'a' && op[0] !== 'A') {
        /* make sure all are valid obj symbols occurring once */
        const types = [];
        let badopt = false;
        for (const symbol of op) {
            const oc_sym = def_char_to_objclass(symbol);
            if (oc_sym !== MAXOCLASSES && !types.includes(oc_sym))
                types.push(oc_sym);
            else badopt = true;
        }
        // C writes each accepted class into flags.pickup_types as it goes, so
        // a rejected one later in the list does not undo the earlier ones.
        state.flags.pickup_types = types;
        if (badopt) {
            /* config_error_add("Unknown %s parameter '%s'") */
            return optn_err;
        }
    }
    return optn_ok;
}

// C ref: options.c parseoptions() (489-681)'s handler table, C's
// allopt[optidx].optfn(optidx, do_set, ...).  The key is that function's own
// name, as OPTION_VALUE_HANDLERS' keys are.
const OPTION_SET_HANDLERS = Object.freeze({
    boolean: optfn_boolean,
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

    let opts = trimCWhitespace(statement);
    if (!opts) return false; /* "Empty statement" */

    let negated = false;
    while (opts[0] === '!' || equal_ncasechars(opts, 'no', 2)) {
        opts = opts.slice(
            opts[0] === '!' ? 1 : (opts[2] !== '-' ? 2 : 3),
        );
        negated = !negated;
    }

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
    // glyph-to-symbol-and-color table the window port prints from.  It has no
    // port because this port keeps no such table: js/display.js maps each
    // glyph where it draws it, from the same three inputs the C rebuild reads
    // -- gs.symset[gc.currentgraphics], Is_rogue_level(), and iflags.wc_color,
    // which flag.h:507 also spells `use_color`.  js/do.js:1268 records the
    // same for reset_glyphmap(gm_levelchange).
    //
    // Nothing is lost by mapping late.  All four sites that raise this flag --
    // optfn_boolean()'s two arms at options.c:5384 and :5409,
    // optfn_roguesymset() at :3567 and optfn_symset() at :4198 -- raise
    // go.opt_need_redraw with it, so the docrt() below repaints every square
    // through those live values.  The flag's own clear is at the end of this
    // function, where C clears it.
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
