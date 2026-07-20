// options.js — Parse the startup subset of .nethackrc options.
// C refs: options.c parseoptions(), option handlers; role.c str2*().

import {
    ROLE_NONE,
    ROLE_RANDOM,
    str2align,
    str2gend,
    str2race,
    str2role,
    validalign,
    validgend,
    validrace,
} from './roles.js';

const PET_NAME_LIMIT = 62; // PL_PSIZ - 1
const PLAYER_NAME_LIMIT = 31; // PL_NSIZ - 1
const NONINTERACTIVE_OPTION_NAMES = Object.freeze([
    'legacy',
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
        },
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

function setCharacterChoice(
    result,
    field,
    flagField,
    parser,
    value,
    negated,
    lineNumber,
) {
    const explicit = requireValue(value, field, negated, lineNumber);
    const parsed = parser(explicit);
    if (parsed === ROLE_NONE) {
        optionError(lineNumber, `unknown ${field} '${explicit}'`);
    }
    result[field] = parsed;
    result.flags[flagField] = parsed;
    if (field === 'gender' && parsed !== ROLE_RANDOM) {
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
    } else if (name === 'pushweapon') result.flags.pushweapon = enabled;
    else if (name === 'showexp') result.flags.showexp = enabled;
    else if (name === 'time') result.flags.time = enabled;
    else if (name === 'verbose') result.flags.verbose = enabled;
    else result.flags[name] = enabled;
}

function applyOption(result, option, lineNumber) {
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
        setCharacterChoice(result, 'role', 'initrole', str2role,
            value, negated, lineNumber);
    } else if (name === 'race') {
        setCharacterChoice(result, 'race', 'initrace', str2race,
            value, negated, lineNumber);
    } else if (name === 'gender') {
        setCharacterChoice(result, 'gender', 'initgend', str2gend,
            value, negated, lineNumber);
    } else if (name === 'alignment') {
        setCharacterChoice(result, 'align', 'initalign', str2align,
            value, negated, lineNumber);
    } else if (name === 'playmode') {
        setPlaymode(result, value, negated, lineNumber);
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

function validateExplicitCombination(result) {
    const { initrole, initrace, initgend, initalign } = result.flags;
    if (initrole < 0 || initrace < 0) return;
    if (!validrace(initrole, initrace)) {
        throw new Error('nethackrc: explicit role and race are incompatible');
    }
    if (initgend >= 0 && !validgend(initrole, initrace, initgend)) {
        throw new Error('nethackrc: explicit role, race, and gender are incompatible');
    }
    if (initalign >= 0 && !validalign(initrole, initrace, initalign)) {
        throw new Error('nethackrc: explicit role, race, and alignment are incompatible');
    }
}

export function parseNethackrc(rc) {
    const result = defaultResult();
    if (!rc) return result;

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
                if (option) applyOption(result, option, lineNumber);
            }
            continue;
        }

        const directMatch = /^(NAME|ROLE|CHARACTER|DOGNAME|CATNAME)\s*[:=]\s*(.*)$/iu
            .exec(line);
        if (directMatch) {
            applyDirectOption(result, directMatch[1], directMatch[2]);
        }
    }

    validateExplicitCombination(result);
    return result;
}
