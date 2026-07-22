// options.js — Parse the startup subset of .nethackrc options.
// C refs: cfgfiles.c config parsing; options.c parseoptions(), handlers, and
// nmcpy(); hacklib.c mungspaces(); bones.c sanitize_name(); role.c str2*().

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
} from './hacklib.js';
import { sourceGlyphName } from './glyph_ids.js';
import { rn2 } from './rng.js';

const PET_NAME_BYTE_LIMIT = 62; // PL_PSIZ - 1
const PLAYER_NAME_BYTE_LIMIT = 31; // PL_NSIZ - 1
const CONFIG_BUFFER_BYTE_CAPACITY = 4 * 256; // cfgfiles.c: 4 * BUFSZ
const OPTION_ELEMENT_BYTE_LIMIT = 256 / 2; // options.c: BUFSZ / 2

// C ref: options.c:allopt[] and determine_ambiguities().  This is the
// canonical name catalog produced by the recorder's configured optlist.h.
// Keeping the full catalog matters because unported options still determine
// whether a prefix is unique (and are preserved under their canonical key).
const SOURCE_OPTION_NAMES = Object.freeze((
    'windowtype|playmode|name|role|race|gender|alignment|accessiblemsg'
    + '|acoustics|align_message|align_status|altkeyhandling|altmeta'
    + '|armorstatus|ascii_map|autocompletions|autodescribe|autodig|autoopen'
    + '|autopickup|autopickup exceptions|autoquiver|autounlock|bgcolors'
    + '|bind keys|bios|blind|bones|boulder|catname|checkpoint|cmdassist'
    + '|color|confirm|crash_email|crash_name|crash_urlmax|customcolors'
    + '|customsymbols|dark_room|deaf|decgraphics|debug_hunger|debug_mongen'
    + '|debug_overwrite_stairs|disclose|dogname|dropped_nopick|dungeon'
    + '|effects|eight_bit_tty|extmenu|female|fireassist|fixinv|font_map'
    + '|font_menu|font_message|font_size_map|font_size_menu'
    + '|font_size_message|font_size_status|font_size_text|font_status'
    + '|font_text|force_invmenu|fruit|fullscreen|glyph|goldx|guicolor|help'
    + '|herecmd_menu|hilite_pet|hilite_pile|hilite_status|hitpointbar'
    + '|horsename|ibmgraphics|idlecheckpoint|ignintr|implicit_uncursed'
    + '|legacy|lit_corridor|lootabc|mail|map_mode|mention_decor|mention_map'
    + '|mention_walls|menu_deselect_all|menu_deselect_page|menu_first_page'
    + '|menu_headings|menu_invert_all|menu_invert_page|menu_last_page'
    + '|menu_next_page|menu_objsyms|menu_overlay|menu_previous_page'
    + '|menu_search|menu_select_all|menu_select_page|menu_shift_left'
    + '|menu_shift_right|menu_tab_sep|menucolors|menu colors|menuinvertmode'
    + '|menustyle|message types|mon_movement|monpolycontrol|montelecontrol'
    + '|monsters|mouse_support|msg_window|msghistory|news|nudist|null'
    + '|number_pad|objects|packorder|paranoid_confirmation|pauper'
    + '|perm_invent|perminv_mode|petattr|pettype|pickup_burden'
    + '|pickup_stolen|pickup_thrown|pickup_types|pile_limit|player_selection'
    + '|popup_dialog|preload_tiles|price_quotes|pushweapon|query_menu'
    + '|quick_farsight|rawio|reroll|rest_on_space|roguesymset|runmode'
    + '|safe_pet|safe_wait|sanity_check|scores|scroll_amount|scroll_margin'
    + '|selectsaved|showdamage|showexp|showrace|showscore|showvers|silent'
    + '|softkeyboard|sortdiscoveries|sortloot|sortpack|sortvanquished'
    + '|soundlib|sounds|sparkle|spot_monsters|splash_screen|standout'
    + '|status_updates|status condition fields|statushilites'
    + '|status highlight rules|statuslines|suppress_alert|symset|term_cols'
    + '|term_rows|terrainstatus|tile_file|tile_height|tile_width|tiled_map'
    + '|time|timed_delay|tips|tombstone|toptenwin|traps|travel|travel_debug'
    + '|tutorial|use_darkgray|use_inverse|use_truecolor|vary_msgcount'
    + '|verbose|versinfo|voices|vt_tiledata|vt_sounddata|warnings'
    + '|weaponstatus|whatis_coord|whatis_filter|whatis_menu|whatis_moveskip'
    + '|windowborders|windowcolors|wizmgender|wizweight|wraptext|cond_|font'
).split('|'));

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

function defaultResult() {
    return {
        name: '',
        role: ROLE_NONE,
        race: ROLE_NONE,
        gender: ROLE_NONE,
        align: ROLE_NONE,
        flags: {
            initrole: ROLE_NONE,
            initrace: ROLE_NONE,
            initgend: ROLE_NONE,
            initalign: ROLE_NONE,
            female: false,
            debug: false,
            explore: false,
            pickup: false,
            bones: true,
            legacy: true,
            tutorial: true,
            verbose: true,
            pushweapon: false,
            showexp: false,
            showvers: false,
            time: false,
            // Recorder release builds have no git-branch metadata, so
            // options.c defaults versinfo to VI_NUMBER.
            versinfo: 1,
        },
        iflags: {
            wc_color: true,
            wc_inverse: true,
            wc_splash_screen: true,
            wc_eight_bit_input: false,
            wc2_statuslines: 2,
            num_pad: false,
            num_pad_mode: 0,
            customcolors: true,
            customsymbols: true,
            menu_overlay: true,
            // options.c keeps these as parallel, insertion-ordered strings.
            // The first alias for an incoming key wins in map_menu_cmd().
            mapped_menu_cmds: '',
            mapped_menu_op: '',
            menu_headings: {
                attr: ATR_INVERSE,
                color: NO_COLOR,
            },
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
    };
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
        || normalized === 'on' || normalized === '1') return true;
    if ('false'.startsWith(normalized)
        || 'no'.startsWith(normalized)
        || normalized === 'off' || normalized === '0') return false;
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
        if (SPECIAL_KEY_COMMANDS.has(commandName)) return;
        // Keep gameplay bindings in source application order. The first
        // consumer is nh.eckey() while loading tut-1; command execution still
        // belongs to the later turn milestone.
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
// during tutorial generation even though command dispatch remains unported.
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
    } else if (name === 'legacy') result.flags.legacy = enabled;
    else if (name === 'tutorial') {
        result.flags.tutorial = enabled;
        result.tutorial_set = true;
    } else if (name === 'splash_screen') {
        result.iflags.wc_splash_screen = enabled;
    } else if (name === 'menu_overlay') {
        result.iflags.menu_overlay = enabled;
    } else if (name === 'eight_bit_tty') {
        result.iflags.wc_eight_bit_input = enabled;
    } else if (name === 'customcolors' || name === 'customsymbols') {
        result.iflags[name] = enabled;
    } else if (name === 'pushweapon') result.flags.pushweapon = enabled;
    else if (name === 'rest_on_space') {
        result.flags.rest_on_space = enabled;
        result.commandOperations.push({
            type: 'rest_on_space',
            enabled,
        });
    }
    else if (name === 'showexp') result.flags.showexp = enabled;
    else if (name === 'time') result.flags.time = enabled;
    else if (name === 'verbose') result.flags.verbose = enabled;
    else result.flags[name] = enabled;
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
    } else if (menuCommand && parsedName === name) {
        setMenuCommandOption(
            result, menuCommand, value, negated, lineNumber,
        );
    } else if (menuCommand || isMenuCommandPrefix(parsedName)) {
        optionError(
            lineNumber,
            `menu command option '${parsedName}' requires its full canonical name`,
        );
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
        } else if (name === 'msg_window') {
            result.iflags.prevmsg_window = value;
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

const CONFIG_STATEMENTS = Object.freeze([
    { name: 'options', minLength: 4, kind: 'options' },
    { name: 'bindings', minLength: 4, kind: 'bindings' },
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
