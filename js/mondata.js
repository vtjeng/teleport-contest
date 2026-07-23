// Monster name parsing, growth, and species relationships.
// C refs: src/mondata.c name_to_monplus(), name_to_mon(), grownups[],
// little_to_big(), big_to_little(); src/botl.c title_to_mon();
// src/mon.c undead_to_corpse(), can_be_hatched(), dead_species().

import {
    FEMALE,
    G_GENOD,
    MALE,
    NEUTRAL,
    NUM_MGENDERS,
} from './const.js';
import { game } from './gstate.js';
import * as M from './monsters.js';
import { rn2 } from './rng.js';
import { roles } from './roles.js';

const M2_JEWELS = 0x20000000;

function hasAttackType(species, attackType) {
    return Boolean(species?.mattk?.some(
        (attack) => attack.aatyp === attackType,
    ));
}

function hasDamageType(species, damageType) {
    return Boolean(species?.mattk?.some(
        (attack) => attack.adtyp === damageType,
    ));
}

// C ref: mondata.c sticks(). A wrapping attack sticks unless it is the
// engulfing form; explicit sticky damage and hug attacks always do.
export function sticks(species) {
    return hasDamageType(species, M.AD_STCK)
        || (hasDamageType(species, M.AD_WRAP)
            && !hasAttackType(species, M.AT_ENGL))
        || hasAttackType(species, M.AT_HUGS);
}

const pair = (little, big) => Object.freeze([little, big]);
const alternateName = (name, mnum, gender = NEUTRAL) => Object.freeze({
    name,
    mnum,
    gender,
});

// C ref: mondata.c:name_to_monplus() names[]. Source order is observable:
// the first full-word alternate match wins before the canonical mons[] scan.
const alternateMonsterNames = Object.freeze([
    alternateName('grey dragon', M.PM_GRAY_DRAGON),
    alternateName('baby grey dragon', M.PM_BABY_GRAY_DRAGON),
    alternateName('grey unicorn', M.PM_GRAY_UNICORN),
    alternateName('grey ooze', M.PM_GRAY_OOZE),
    alternateName('gray-elf', M.PM_GREY_ELF),
    alternateName('mindflayer', M.PM_MIND_FLAYER),
    alternateName('master mindflayer', M.PM_MASTER_MIND_FLAYER),
    alternateName('aligned priest', M.PM_ALIGNED_CLERIC, MALE),
    alternateName('aligned priestess', M.PM_ALIGNED_CLERIC, FEMALE),
    alternateName('high priest', M.PM_HIGH_CLERIC, MALE),
    alternateName('high priestess', M.PM_HIGH_CLERIC, FEMALE),
    alternateName('master of thief', M.PM_MASTER_OF_THIEVES),
    alternateName('master thief', M.PM_MASTER_OF_THIEVES),
    alternateName('master of assassin', M.PM_MASTER_ASSASSIN),
    alternateName('master-lich', M.PM_MASTER_LICH),
    alternateName('masterlich', M.PM_MASTER_LICH),
    alternateName('invisible stalker', M.PM_STALKER),
    alternateName('high-elf', M.PM_ELVEN_MONARCH),
    alternateName('wood-elf', M.PM_WOODLAND_ELF),
    alternateName('wood elf', M.PM_WOODLAND_ELF),
    alternateName('woodland nymph', M.PM_WOOD_NYMPH),
    alternateName('halfling', M.PM_HOBBIT),
    alternateName('genie', M.PM_DJINNI),
    alternateName('human wererat', M.PM_HUMAN_WERERAT),
    alternateName('human werejackal', M.PM_HUMAN_WEREJACKAL),
    alternateName('human werewolf', M.PM_HUMAN_WEREWOLF),
    alternateName('rat wererat', M.PM_WERERAT),
    alternateName('jackal werejackal', M.PM_WEREJACKAL),
    alternateName('wolf werewolf', M.PM_WEREWOLF),
    alternateName('ki rin', M.PM_KI_RIN),
    alternateName('kirin', M.PM_KI_RIN),
    alternateName('uruk hai', M.PM_URUK_HAI),
    alternateName('orc captain', M.PM_ORC_CAPTAIN),
    alternateName('woodland elf', M.PM_WOODLAND_ELF),
    alternateName('green elf', M.PM_GREEN_ELF),
    alternateName('grey elf', M.PM_GREY_ELF),
    alternateName('gray elf', M.PM_GREY_ELF),
    alternateName('elf lady', M.PM_ELF_NOBLE, FEMALE),
    alternateName('elf lord', M.PM_ELF_NOBLE, MALE),
    alternateName('elf noble', M.PM_ELF_NOBLE),
    alternateName('olog hai', M.PM_OLOG_HAI),
    alternateName('arch lich', M.PM_ARCH_LICH),
    alternateName('archlich', M.PM_ARCH_LICH),
    alternateName('incubi', M.PM_AMOROUS_DEMON, MALE),
    alternateName('succubi', M.PM_AMOROUS_DEMON, FEMALE),
    alternateName('violet fungi', M.PM_VIOLET_FUNGUS),
    alternateName('homunculi', M.PM_HOMUNCULUS),
    alternateName('baluchitheria', M.PM_BALUCHITHERIUM),
    alternateName('lurkers above', M.PM_LURKER_ABOVE),
    alternateName('cavemen', M.PM_CAVE_DWELLER, MALE),
    alternateName('cavewomen', M.PM_CAVE_DWELLER, FEMALE),
    alternateName('watchmen', M.PM_WATCHMAN),
    alternateName('djinn', M.PM_DJINNI),
    alternateName('mumakil', M.PM_MUMAK),
    alternateName('erinyes', M.PM_ERINYS),
]);

// Order is observable through big_to_little(): several adult forms have more
// than one possible predecessor and the C code returns the first match.
const grownups = Object.freeze([
    pair(M.PM_CHICKATRICE, M.PM_COCKATRICE),
    pair(M.PM_LITTLE_DOG, M.PM_DOG),
    pair(M.PM_DOG, M.PM_LARGE_DOG),
    pair(M.PM_HELL_HOUND_PUP, M.PM_HELL_HOUND),
    pair(M.PM_WINTER_WOLF_CUB, M.PM_WINTER_WOLF),
    pair(M.PM_KITTEN, M.PM_HOUSECAT),
    pair(M.PM_HOUSECAT, M.PM_LARGE_CAT),
    pair(M.PM_PONY, M.PM_HORSE),
    pair(M.PM_HORSE, M.PM_WARHORSE),
    pair(M.PM_KOBOLD, M.PM_LARGE_KOBOLD),
    pair(M.PM_LARGE_KOBOLD, M.PM_KOBOLD_LEADER),
    pair(M.PM_GNOME, M.PM_GNOME_LEADER),
    pair(M.PM_GNOME_LEADER, M.PM_GNOME_RULER),
    pair(M.PM_DWARF, M.PM_DWARF_LEADER),
    pair(M.PM_DWARF_LEADER, M.PM_DWARF_RULER),
    pair(M.PM_MIND_FLAYER, M.PM_MASTER_MIND_FLAYER),
    pair(M.PM_ORC, M.PM_ORC_CAPTAIN),
    pair(M.PM_HILL_ORC, M.PM_ORC_CAPTAIN),
    pair(M.PM_MORDOR_ORC, M.PM_ORC_CAPTAIN),
    pair(M.PM_URUK_HAI, M.PM_ORC_CAPTAIN),
    pair(M.PM_SEWER_RAT, M.PM_GIANT_RAT),
    pair(M.PM_CAVE_SPIDER, M.PM_GIANT_SPIDER),
    pair(M.PM_OGRE, M.PM_OGRE_LEADER),
    pair(M.PM_OGRE_LEADER, M.PM_OGRE_TYRANT),
    pair(M.PM_ELF, M.PM_ELF_NOBLE),
    pair(M.PM_WOODLAND_ELF, M.PM_ELF_NOBLE),
    pair(M.PM_GREEN_ELF, M.PM_ELF_NOBLE),
    pair(M.PM_GREY_ELF, M.PM_ELF_NOBLE),
    pair(M.PM_ELF_NOBLE, M.PM_ELVEN_MONARCH),
    pair(M.PM_LICH, M.PM_DEMILICH),
    pair(M.PM_DEMILICH, M.PM_MASTER_LICH),
    pair(M.PM_MASTER_LICH, M.PM_ARCH_LICH),
    pair(M.PM_VAMPIRE, M.PM_VAMPIRE_LEADER),
    pair(M.PM_BAT, M.PM_GIANT_BAT),
    pair(M.PM_BABY_GRAY_DRAGON, M.PM_GRAY_DRAGON),
    pair(M.PM_BABY_GOLD_DRAGON, M.PM_GOLD_DRAGON),
    pair(M.PM_BABY_SILVER_DRAGON, M.PM_SILVER_DRAGON),
    pair(M.PM_BABY_RED_DRAGON, M.PM_RED_DRAGON),
    pair(M.PM_BABY_WHITE_DRAGON, M.PM_WHITE_DRAGON),
    pair(M.PM_BABY_ORANGE_DRAGON, M.PM_ORANGE_DRAGON),
    pair(M.PM_BABY_BLACK_DRAGON, M.PM_BLACK_DRAGON),
    pair(M.PM_BABY_BLUE_DRAGON, M.PM_BLUE_DRAGON),
    pair(M.PM_BABY_GREEN_DRAGON, M.PM_GREEN_DRAGON),
    pair(M.PM_BABY_YELLOW_DRAGON, M.PM_YELLOW_DRAGON),
    pair(M.PM_RED_NAGA_HATCHLING, M.PM_RED_NAGA),
    pair(M.PM_BLACK_NAGA_HATCHLING, M.PM_BLACK_NAGA),
    pair(M.PM_GOLDEN_NAGA_HATCHLING, M.PM_GOLDEN_NAGA),
    pair(M.PM_GUARDIAN_NAGA_HATCHLING, M.PM_GUARDIAN_NAGA),
    pair(M.PM_SMALL_MIMIC, M.PM_LARGE_MIMIC),
    pair(M.PM_LARGE_MIMIC, M.PM_GIANT_MIMIC),
    pair(M.PM_BABY_LONG_WORM, M.PM_LONG_WORM),
    pair(M.PM_BABY_PURPLE_WORM, M.PM_PURPLE_WORM),
    pair(M.PM_BABY_CROCODILE, M.PM_CROCODILE),
    pair(M.PM_SOLDIER, M.PM_SERGEANT),
    pair(M.PM_SERGEANT, M.PM_LIEUTENANT),
    pair(M.PM_LIEUTENANT, M.PM_CAPTAIN),
    pair(M.PM_WATCHMAN, M.PM_WATCH_CAPTAIN),
    pair(M.PM_ALIGNED_CLERIC, M.PM_HIGH_CLERIC),
    pair(M.PM_STUDENT, M.PM_ARCHEOLOGIST),
    pair(M.PM_ATTENDANT, M.PM_HEALER),
    pair(M.PM_PAGE, M.PM_KNIGHT),
    pair(M.PM_ACOLYTE, M.PM_CLERIC),
    pair(M.PM_APPRENTICE, M.PM_WIZARD),
    pair(M.PM_MANES, M.PM_LEMURE),
    pair(M.PM_KEYSTONE_KOP, M.PM_KOP_SERGEANT),
    pair(M.PM_KOP_SERGEANT, M.PM_KOP_LIEUTENANT),
    pair(M.PM_KOP_LIEUTENANT, M.PM_KOP_KAPTAIN),
]);

function monsterIndexOrNonPm(value) {
    return Number.isInteger(value) ? value : M.NON_PM;
}

function asciiLower(value) {
    let lowered = '';
    for (const character of value) {
        const code = character.charCodeAt(0);
        lowered += code >= 0x41 && code <= 0x5A
            ? String.fromCharCode(code + 0x20)
            : character;
    }
    return lowered;
}

function asciiEquals(left, right) {
    return asciiLower(left) === asciiLower(right);
}

function asciiStartsWith(value, prefix) {
    return asciiEquals(value.slice(0, prefix.length), prefix);
}

function asciiEndsWith(value, suffix) {
    return value.length >= suffix.length
        && asciiEquals(value.slice(-suffix.length), suffix);
}

function asciiIndexOf(value, needle) {
    return asciiLower(value).indexOf(asciiLower(needle));
}

function initializedMonsterNameCatalog(state, operation) {
    if (!Array.isArray(state?.mons) || state.mons.length !== M.NUMMONS + 1)
        throw new Error(`${operation} requires monst_globals_init()`);
    for (let index = M.LOW_PM; index < M.NUMMONS; ++index) {
        const names = state.mons[index]?.pmnames;
        if (!Array.isArray(names) || names.length !== NUM_MGENDERS
            || names.some((name) => name !== null
                && typeof name !== 'string')) {
            throw new Error(`${operation} requires a complete monster catalog`);
        }
    }
    return state.mons;
}

function stripArticle(input) {
    if (input.startsWith('a ')) return { text: input.slice(2), offset: 2 };
    if (input.startsWith('an ')) return { text: input.slice(3), offset: 3 };
    if (input.startsWith('the ')) return { text: input.slice(4), offset: 4 };
    return { text: input, offset: 0 };
}

function normalizeMonsterNamePlural(input) {
    const vortices = asciiIndexOf(input, 'vortices');
    if (vortices >= 0) {
        // Strcpy(s + 4, "ex") truncates everything after the replacement.
        return `${input.slice(0, vortices + 4)}ex`;
    }
    if (input.length > 3 && asciiEndsWith(input, 'ies')
        && (input.length < 7 || !asciiEndsWith(input, 'zombies'))) {
        return `${input.slice(0, -3)}y`;
    }
    if (input.length > 3 && asciiEndsWith(input, 'ves'))
        return `${input.slice(0, -3)}f`;
    return input;
}

function suffixCanFollowMonsterName(suffix) {
    return suffix.startsWith(' ')
        || asciiEquals(suffix, 's')
        || asciiStartsWith(suffix, 's ')
        || asciiEquals(suffix, "'")
        || asciiStartsWith(suffix, "' ")
        || asciiEquals(suffix, "'s")
        || asciiStartsWith(suffix, "'s ")
        || asciiEquals(suffix, 'es')
        || asciiStartsWith(suffix, 'es ');
}

// C ref: botl.c:title_to_mon(). It intentionally accepts a title prefix
// without requiring a following word boundary.
function titleToMonster(input) {
    for (const role of roles) {
        for (const rank of role.rank) {
            if (rank.m && asciiStartsWith(input, rank.m))
                return { mnum: role.mnum, length: rank.m.length };
            if (rank.f && asciiStartsWith(input, rank.f))
                return { mnum: role.mnum, length: rank.f.length };
        }
    }
    return { mnum: M.NON_PM, length: 0 };
}

/**
 * C ref: mondata.c:name_to_monplus().
 *
 * `env.gender` models the optional input/output gender pointer. The returned
 * `remainder` is the suffix beginning at the same original-string offset as
 * C's remainder pointer, including its quirks after plural normalization.
 */
export function name_to_monplus(in_str, env = {}) {
    if (typeof in_str !== 'string')
        throw new TypeError('name_to_monplus requires monster-name text');
    const state = env?.state ?? game;
    const mons = initializedMonsterNameCatalog(state, 'name_to_monplus');
    const initialGender = env?.gender === undefined ? -1 : env.gender;
    if (!Number.isInteger(initialGender))
        throw new TypeError('name_to_monplus gender must be an integer');

    const nul = in_str.indexOf('\0');
    const source = nul >= 0 ? in_str.slice(0, nul) : in_str;
    const article = stripArticle(source);
    const input = normalizeMonsterNamePlural(article.text);

    for (const alternate of alternateMonsterNames) {
        const length = alternate.name.length;
        if (asciiStartsWith(input, alternate.name)
            && (input.length === length
                || input[length] === ' '
                || input[length] === "'")) {
            return {
                mnum: alternate.mnum,
                remainder: source.slice(article.offset + length),
                gender: alternate.gender,
            };
        }
    }

    let mnum = M.NON_PM;
    let matchedLength = 0;
    let matchedGender = -1;

    canonical:
    for (let index = M.LOW_PM; index < M.NUMMONS; ++index) {
        for (let gender = MALE; gender < NUM_MGENDERS; ++gender) {
            const name = mons[index].pmnames[gender];
            if (!name || name.length <= matchedLength
                || !asciiStartsWith(input, name)) {
                continue;
            }
            if (name.length === input.length) {
                mnum = index;
                matchedLength = name.length;
                matchedGender = gender;
                break canonical;
            }
            if (suffixCanFollowMonsterName(input.slice(name.length))) {
                mnum = index;
                matchedLength = name.length;
                matchedGender = gender;
            }
        }
    }

    if (mnum === M.NON_PM) {
        const title = titleToMonster(input);
        mnum = title.mnum;
        matchedLength = title.length;
    }

    let gender = initialGender;
    if (matchedGender !== -1
        && (gender === -1 || matchedGender !== NEUTRAL)) {
        gender = matchedGender;
    }
    return {
        mnum,
        remainder: matchedLength
            ? source.slice(article.offset + matchedLength)
            : null,
        gender,
    };
}

// Source name_to_mon() discards name_to_monplus()'s remainder.
export function name_to_mon(in_str, env = {}) {
    return name_to_monplus(in_str, env).mnum;
}

export function little_to_big(montype) {
    montype = monsterIndexOrNonPm(montype);
    for (const [little, big] of grownups) {
        if (montype === little) {
            montype = big;
            break;
        }
    }
    return montype;
}

export function big_to_little(montype) {
    montype = monsterIndexOrNonPm(montype);
    for (const [little, big] of grownups) {
        if (montype === big) {
            montype = little;
            break;
        }
    }
    return montype;
}

export function is_male(ptr) {
    return Boolean(ptr && Number.isInteger(ptr.mflags2)
        && (ptr.mflags2 & M.M2_MALE));
}

export function is_female(ptr) {
    return Boolean(ptr && Number.isInteger(ptr.mflags2)
        && (ptr.mflags2 & M.M2_FEMALE));
}

export function is_neuter(ptr) {
    return Boolean(ptr && Number.isInteger(ptr.mflags2)
        && (ptr.mflags2 & M.M2_NEUTER));
}

export function is_rider(ptr) {
    const index = ptr?.pmidx;
    return index === M.PM_DEATH
        || index === M.PM_FAMINE
        || index === M.PM_PESTILENCE;
}

// C ref: mondata.h is_unicorn() and likes_gems().
export function is_unicorn(ptr) {
    return ptr?.mlet === M.S_UNICORN && Boolean(ptr.mflags2 & M2_JEWELS);
}

// C ref: mondata.h is_reviver().
export function is_reviver(ptr) {
    return is_rider(ptr) || ptr?.mlet === M.S_TROLL;
}

function isElf(ptr) {
    return Boolean(ptr.mflags2 & M.M2_ELF);
}

function isDwarf(ptr) {
    return Boolean(ptr.mflags2 & M.M2_DWARF);
}

export function zombie_form(pm) {
    if (!pm || !Number.isInteger(pm.mlet) || !Number.isInteger(pm.mflags2))
        return M.NON_PM;
    switch (pm.mlet) {
    case M.S_ZOMBIE:
        return M.NON_PM;
    case M.S_KOBOLD:
        return M.PM_KOBOLD_ZOMBIE;
    case M.S_ORC:
        return M.PM_ORC_ZOMBIE;
    case M.S_GIANT:
        return pm.pmidx === M.PM_ETTIN
            ? M.PM_ETTIN_ZOMBIE
            : M.PM_GIANT_ZOMBIE;
    case M.S_HUMAN:
    case M.S_KOP:
        return isElf(pm) ? M.PM_ELF_ZOMBIE : M.PM_HUMAN_ZOMBIE;
    case M.S_HUMANOID:
        return isDwarf(pm) ? M.PM_DWARF_ZOMBIE : M.NON_PM;
    case M.S_GNOME:
        return M.PM_GNOME_ZOMBIE;
    default:
        return M.NON_PM;
    }
}

export function undead_to_corpse(mndx) {
    mndx = monsterIndexOrNonPm(mndx);
    switch (mndx) {
    case M.PM_KOBOLD_ZOMBIE:
    case M.PM_KOBOLD_MUMMY:
        return M.PM_KOBOLD;
    case M.PM_DWARF_ZOMBIE:
    case M.PM_DWARF_MUMMY:
        return M.PM_DWARF;
    case M.PM_GNOME_ZOMBIE:
    case M.PM_GNOME_MUMMY:
        return M.PM_GNOME;
    case M.PM_ORC_ZOMBIE:
    case M.PM_ORC_MUMMY:
        return M.PM_ORC;
    case M.PM_ELF_ZOMBIE:
    case M.PM_ELF_MUMMY:
        return M.PM_ELF;
    case M.PM_VAMPIRE:
    case M.PM_VAMPIRE_LEADER:
    case M.PM_HUMAN_ZOMBIE:
    case M.PM_HUMAN_MUMMY:
        return M.PM_HUMAN;
    case M.PM_GIANT_ZOMBIE:
    case M.PM_GIANT_MUMMY:
        return M.PM_GIANT;
    case M.PM_ETTIN_ZOMBIE:
    case M.PM_ETTIN_MUMMY:
        return M.PM_ETTIN;
    default:
        return mndx;
    }
}

function initializedMonster(state, mnum, operation) {
    if (!Array.isArray(state?.mons) || state.mons.length !== M.NUMMONS + 1)
        throw new Error(`${operation} requires monst_globals_init()`);
    const monster = state.mons[mnum];
    if (!monster || !Number.isInteger(monster.mflags1))
        throw new Error(`${operation} requires a complete monster catalog`);
    return monster;
}

// BREEDER_EGG is deliberately evaluated before the queen/winged-gargoyle
// exclusions, matching C's short-circuit order and its single rn2(77) draw.
export function can_be_hatched(mnum, env = {}) {
    mnum = monsterIndexOrNonPm(mnum);
    if (mnum === M.PM_SCORPIUS) mnum = M.PM_SCORPION;
    mnum = little_to_big(mnum);

    // These two exceptions do not consult mons[] or consume BREEDER_EGG.
    if (mnum === M.PM_KILLER_BEE || mnum === M.PM_GARGOYLE) return mnum;
    if (mnum < M.LOW_PM || mnum >= M.NUMMONS) return M.NON_PM;

    const monster = initializedMonster(env.state ?? game, mnum,
        'can_be_hatched');
    if (!(monster.mflags1 & M.M1_OVIPAROUS)) return M.NON_PM;

    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('can_be_hatched random injection requires rn2');
    const breederEgg = random.rn2(77) === 0;
    if (breederEgg
        || (mnum !== M.PM_QUEEN_BEE
            && mnum !== M.PM_WINGED_GARGOYLE)) {
        return mnum;
    }
    return M.NON_PM;
}

export function dead_species(m_idx, egg = false, env = {}) {
    m_idx = monsterIndexOrNonPm(m_idx);
    // Generic and malformed species are not viable; this also avoids looking
    // through mvitals with the NON_PM sentinel used by generic eggs.
    if (m_idx < M.LOW_PM || m_idx >= M.NUMMONS) return true;

    const state = env.state ?? game;
    const mvitals = state?.svm?.mvitals;
    if (!Array.isArray(mvitals) || mvitals.length !== M.NUMMONS)
        throw new Error('dead_species requires initialized mvitals');

    const alt_idx = egg ? big_to_little(m_idx) : m_idx;
    const current = mvitals[m_idx];
    const alternate = mvitals[alt_idx];
    if (!current || !alternate
        || !Number.isInteger(current.mvflags)
        || !Number.isInteger(alternate.mvflags)) {
        throw new Error('dead_species requires complete mvitals');
    }
    return Boolean((current.mvflags & G_GENOD)
        || (alternate.mvflags & G_GENOD));
}

export const _mondataInternals = Object.freeze({
    alternateMonsterNames,
    grownups,
});
