// options.js — Parse the startup subset of .nethackrc options.
// C refs: options.c parseoptions(), option handlers; role.c str2*().

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

const PET_NAME_LIMIT = 62; // PL_PSIZ - 1
const PLAYER_NAME_LIMIT = 31; // PL_NSIZ - 1
const NONINTERACTIVE_OPTION_NAMES = Object.freeze([
    'legacy',
    'menu_headings',
    'menu_overlay',
    'tutorial',
    'splash_screen',
]);
const OPTION_ALIASES = Object.freeze({
    character: 'role',
    align: 'alignment',
    permablind: 'blind',
    permadeaf: 'deaf',
    colour: 'color',
});

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
            time: false,
        },
        iflags: {
            wc_color: true,
            wc_splash_screen: true,
            menu_overlay: true,
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
    };
}

function optionError(lineNumber, message) {
    throw new Error(`nethackrc line ${lineNumber}: ${message}`);
}

function splitNameAndValue(option) {
    const colon = option.indexOf(':');
    const equals = option.indexOf('=');
    let separator = -1;
    if (colon >= 0 && equals >= 0) separator = Math.min(colon, equals);
    else separator = Math.max(colon, equals);
    if (separator < 0) return { name: option.trim(), value: null };
    return {
        name: option.slice(0, separator).trim(),
        value: option.slice(separator + 1).trim(),
    };
}

// options.c toggles negation for every leading '!', "no", or "no-".
function stripNegation(optionName) {
    let name = optionName.trim();
    let negated = false;
    for (;;) {
        if (name.startsWith('!')) {
            negated = !negated;
            name = name.slice(1).trimStart();
        } else if (/^no-/iu.test(name)) {
            negated = !negated;
            name = name.slice(3).trimStart();
        } else if (/^no/iu.test(name)) {
            negated = !negated;
            name = name.slice(2).trimStart();
        } else {
            break;
        }
    }
    return { name: name.toLowerCase(), negated };
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

function sanitizePetName(value) {
    return [...value].slice(0, PET_NAME_LIMIT).map((character) => {
        const code = character.codePointAt(0);
        return code < 32 || code === 127 ? '.' : character;
    }).join('');
}

function setPetName(result, field, value, negated, lineNumber) {
    if (!negated && value == null) {
        optionError(lineNumber, `${field} requires a value`);
    }
    const lowered = value?.toLowerCase();
    result[field] = negated || lowered === 'none' || lowered === '(none)'
        ? '' : sanitizePetName(value);
}

function truncateName(value, limit) {
    return String(value).slice(0, limit);
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
    } else if (name === 'legacy') result.flags.legacy = enabled;
    else if (name === 'tutorial') {
        result.flags.tutorial = enabled;
        result.tutorial_set = true;
    } else if (name === 'splash_screen') {
        result.iflags.wc_splash_screen = enabled;
    } else if (name === 'menu_overlay') {
        result.iflags.menu_overlay = enabled;
    } else if (name === 'pushweapon') result.flags.pushweapon = enabled;
    else if (name === 'showexp') result.flags.showexp = enabled;
    else if (name === 'time') result.flags.time = enabled;
    else if (name === 'verbose') result.flags.verbose = enabled;
    else result.flags[name] = enabled;
}

function applyOption(result, optionState, option, lineNumber) {
    const { name: rawName, value } = splitNameAndValue(option);
    const { name: parsedName, negated } = stripNegation(rawName);
    let name = OPTION_ALIASES[parsedName] ?? parsedName;
    if (name.length >= 3) {
        const startupMatch = NONINTERACTIVE_OPTION_NAMES.find(
            (canonical) => canonical.startsWith(name),
        );
        if (startupMatch) name = startupMatch;
    }

    if (!name) optionError(lineNumber, 'empty option');

    if (name === 'name') {
        result.name = truncateName(
            requireValue(value, name, negated, lineNumber),
            PLAYER_NAME_LIMIT,
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
    } else if (name === 'pettype' || name === 'pet') {
        setPettype(result, value, negated, lineNumber);
    } else if (name === 'catname' || name === 'dogname'
               || name === 'horsename') {
        setPetName(result, name, value, negated, lineNumber);
    } else if (name === 'blind' || name === 'deaf' || name === 'nudist'
               || name === 'pauper' || name === 'reroll') {
        setRoleplay(result, name, value, negated, lineNumber);
    } else if (value != null) {
        if (negated) {
            optionError(
                lineNumber,
                `negated compound option '${name}' is not supported`,
            );
        }
        if (name === 'symset') result.symset = value;
        else if (name === 'suppress_alert') {
            result.flags.suppress_alert = value;
        } else if (name === 'msg_window') {
            result.iflags.prevmsg_window = value;
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
        result.name = truncateName(value, PLAYER_NAME_LIMIT);
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
        result[normalized] = truncateName(value, PET_NAME_LIMIT);
    }
}

export function parseNethackrc(rc) {
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

    const lines = String(rc).split(/\r?\n/u);
    for (let index = 0; index < lines.length; ++index) {
        const lineNumber = index + 1;
        const line = lines[index].trim();
        if (!line || line.startsWith('#')) continue;

        const optionsMatch = /^OPTIONS\s*[:=]\s*(.*)$/iu.exec(line);
        if (optionsMatch) {
            const options = optionsMatch[1].split(',');
            // options.c recurses into the comma suffix before applying the
            // current element, so options on one line are processed right to
            // left. This makes the leftmost duplicate the final value.
            for (let optionIndex = options.length - 1;
                optionIndex >= 0; --optionIndex) {
                const option = options[optionIndex].trim();
                if (option) {
                    applyOption(result, optionState, option, lineNumber);
                }
            }
            continue;
        }

        const directMatch = /^(NAME|ROLE|CHARACTER|DOGNAME|CATNAME)\s*[:=]\s*(.*)$/iu
            .exec(line);
        if (directMatch) {
            applyDirectOption(result, directMatch[1], directMatch[2]);
        }
    }

    return result;
}
