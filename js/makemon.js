// Random monster selection.
// C refs: makemon.c rndmonst_adj(), mkclass(), and elemental filtering;
// mkobj.c rndmonnum_adj(); questpgr.c qt_montype().

import {
    ALIGNWEIGHT,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    G_GENOD,
    G_GONE,
} from './const.js';
import { level_difficulty } from './dungeon.js';
import { game } from './gstate.js';
import { rn1, rn2, rnd } from './rng.js';
import {
    G_FREQ,
    G_HELL,
    G_NOGEN,
    G_NOHELL,
    G_UNIQ,
    G_IGNORE,
    LOW_PM,
    MR_COLD,
    MR_FIRE,
    NON_PM,
    NUMMONS,
    PM_AIR_ELEMENTAL,
    PM_EARTH_ELEMENTAL,
    PM_ELF,
    PM_FIRE_ELEMENTAL,
    PM_GIANT,
    PM_HUMAN,
    PM_MAIL_DAEMON,
    PM_ORC,
    PM_WATER_ELEMENTAL,
    PM_WIZARD_OF_YENDOR,
    S_ELEMENTAL,
    S_EYE,
    S_GHOST,
    S_LICH,
    S_LIGHT,
    S_MIMIC_DEF,
    S_TRAPPER,
    S_VORTEX,
    SPECIAL_PM,
    monsterClassSymbol,
} from './monsters.js';

// C ref: monflag.h flags used by makemon.c wrong_elem_type().
const M1_FLY = 0x00000001;
const M1_SWIM = 0x00000002;
const M1_AMORPHOUS = 0x00000004;
// C ref: mondata.h is_placeholder(). These records only back corpse forms.
const PLACEHOLDER_MONSTERS = new Set([PM_ORC, PM_GIANT, PM_ELF, PM_HUMAN]);

function generationEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn1, rn2, rnd };
    // Every selection path needs rn2. rndmonnum's fallback can synthesize rn1
    // from it; a missing rnd is tolerated unless a path reaches mkclass(),
    // which requires it (including a rejected fixed Quest enemy's fallback).
    if (typeof random.rn2 !== 'function')
        throw new TypeError('monster random injection requires rn2');
    const sourceRandom = {
        rn2: random.rn2,
        rn1: typeof random.rn1 === 'function'
            ? random.rn1
            : (range, base) => random.rn2(range) + base,
        rnd: typeof random.rnd === 'function' ? random.rnd : null,
    };
    if (!Array.isArray(state.mons) || state.mons.length <= SPECIAL_PM)
        throw new Error('monster generation requires monst_globals_init()');
    if (!Array.isArray(state.mvitals) || state.mvitals.length < SPECIAL_PM)
        throw new Error('monster generation requires initialized mvitals');
    return { ...env, state, random: sourceRandom };
}

function sameLevel(left, right) {
    return Boolean(left && right
        && left.dnum === right.dnum
        && left.dlevel === right.dlevel);
}

function currentSpecialLevel(state) {
    return state.specialLevels?.find(
        (candidate) => sameLevel(candidate.dlevel, state.u?.uz),
    ) ?? null;
}

function inHell(state) {
    const dnum = state.u?.uz?.dnum;
    return Number.isInteger(dnum)
        && Boolean(state.dungeons?.[dnum]?.flags?.hellish);
}

function inEndgame(state) {
    const astral = state.astral_level;
    return Number.isInteger(astral?.dlevel)
        && astral.dlevel > 0
        && state.u?.uz?.dnum === astral.dnum;
}

function isAstralLevel(state) {
    return sameLevel(state.u?.uz, state.astral_level);
}

function isRogueLevel(state) {
    return sameLevel(state.u?.uz, state.rogue_level);
}

function uncommon(index, state) {
    const monster = state.mons[index];
    if (monster.geno & (G_NOGEN | G_UNIQ)) return true;
    if (state.mvitals[index].mvflags & G_GONE) return true;
    if (inHell(state)) return monster.maligntyp > 0;
    return Boolean(monster.geno & G_HELL);
}

function alignShift(monster, state) {
    const special = currentSpecialLevel(state);
    const alignment = special?.flags?.align
        ?? state.dungeons[state.u.uz.dnum].flags.align;
    switch (alignment) {
    case AM_LAWFUL:
        return Math.trunc((monster.maligntyp + 20) / (2 * ALIGNWEIGHT));
    case AM_NEUTRAL:
        return Math.trunc((20 - Math.abs(monster.maligntyp)) / ALIGNWEIGHT);
    case AM_CHAOTIC:
        return Math.trunc((20 - monster.maligntyp) / (2 * ALIGNWEIGHT));
    default:
        return 0;
    }
}

function temperatureShift(monster, state) {
    const temperature = Math.trunc(state.level?.flags?.temperature ?? 0);
    if (!temperature) return 0;
    const resistance = temperature > 0 ? MR_FIRE : MR_COLD;
    return monster.mresists & resistance ? 3 : 0;
}

// C ref: makemon.c is_home_elemental().
export function is_home_elemental(monster, state = game) {
    if (monster?.mlet !== S_ELEMENTAL) return false;
    switch (monster.pmidx) {
    case PM_AIR_ELEMENTAL:
        return sameLevel(state.u?.uz, state.air_level);
    case PM_FIRE_ELEMENTAL:
        return sameLevel(state.u?.uz, state.fire_level);
    case PM_EARTH_ELEMENTAL:
        return sameLevel(state.u?.uz, state.earth_level);
    case PM_WATER_ELEMENTAL:
        return sameLevel(state.u?.uz, state.water_level);
    default:
        return false;
    }
}

// C ref: makemon.c wrong_elem_type().
function wrongElementType(monster, state) {
    if (monster.mlet === S_ELEMENTAL)
        return !is_home_elemental(monster, state);
    if (sameLevel(state.u?.uz, state.earth_level)) return false;
    if (sameLevel(state.u?.uz, state.water_level))
        return !(monster.mflags1 & M1_SWIM);
    if (sameLevel(state.u?.uz, state.fire_level))
        return !(monster.mresists & MR_FIRE);
    if (sameLevel(state.u?.uz, state.air_level)) {
        const flyer = Boolean(monster.mflags1 & M1_FLY)
            && monster.mlet !== S_TRAPPER;
        const floater = monster.mlet === S_EYE || monster.mlet === S_LIGHT;
        const amorphous = Boolean(monster.mflags1 & M1_AMORPHOUS);
        const noncorporeal = monster.mlet === S_GHOST;
        const whirly = monster.mlet === S_VORTEX
            || monster.pmidx === PM_AIR_ELEMENTAL;
        return !(flyer || floater || amorphous || noncorporeal || whirly);
    }
    return false;
}

function adjustedMonsterLevel(monster, state) {
    if (monster.pmidx === PM_WIZARD_OF_YENDOR) {
        return Math.min(
            monster.mlevel + Math.trunc(state.mvitals[monster.pmidx].died ?? 0),
            49,
        );
    }
    let adjusted = Math.trunc(monster.mlevel);
    if (adjusted > 49) return 50;

    let difference = level_difficulty(state) - adjusted;
    if (difference < 0) --adjusted;
    else adjusted += Math.trunc(difference / 5);

    difference = Math.trunc(state.u.ulevel) - monster.mlevel;
    if (difference > 0) adjusted += Math.trunc(difference / 4);

    const upperLimit = Math.min(Math.trunc(3 * monster.mlevel / 2), 49);
    return Math.min(Math.max(adjusted, 0), upperLimit);
}

function monsterClassOrder(classSymbol, state) {
    const order = [];
    for (let index = LOW_PM; index < SPECIAL_PM; ++index) {
        if (state.mons[index].mlet === classSymbol) order.push(index);
    }
    // init_mongen_order() sorts by class and difficulty.  The recorder's
    // source catalog retains mons[] order for equal-difficulty records.
    order.sort((left, right) => state.mons[left].difficulty
        - state.mons[right].difficulty || left - right);
    return order;
}

function mkGenerationOkay(index, mvflagsMask, genoMask, state) {
    const monster = state.mons[index];
    return !(state.mvitals[index].mvflags & mvflagsMask)
        && !(monster.geno & genoMask)
        && !PLACEHOLDER_MONSTERS.has(index)
        && index !== PM_MAIL_DAEMON;
}

// C ref: makemon.c mkclass()/mkclass_aligned(), for A_NONE callers. `special`
// contains mons[].geno bits exempted from normal rejection. G_IGNORE is a
// pseudo-flag: it disables the G_GONE mvitals check, then is removed before
// the geno mask is applied.
export function mkclass(classSymbol, special = 0, env = {}) {
    const normalized = generationEnv(env);
    const { random, state } = normalized;
    if (typeof random.rnd !== 'function')
        throw new TypeError('mkclass random injection requires rnd');
    if (!Number.isInteger(classSymbol)
        || classSymbol < 1 || classSymbol > S_MIMIC_DEF) {
        return null;
    }

    const order = monsterClassOrder(classSymbol, state);
    if (!order.length) return null;
    // Like init_mongen_order()'s mclass_maxf, this check covers all NUMMONS;
    // the candidate order remains limited to records before SPECIAL_PM.
    const zeroFrequencyForEntireClass = !state.mons
        .slice(LOW_PM, NUMMONS)
        .some((monster) => monster.mlet === classSymbol
            && (monster.geno & G_FREQ));
    const weights = Array(SPECIAL_PM).fill(0);
    const maxLevel = Math.trunc(level_difficulty(state) / 2);
    const gehennom = inHell(state);
    let mvflagsMask = G_GONE;
    let specialMask = Math.trunc(special);
    if (specialMask & G_IGNORE) {
        mvflagsMask = 0;
        specialMask &= ~G_IGNORE;
    }

    let total = 0;
    let last = 0;
    for (; last < order.length; ++last) {
        const index = order[last];
        const monster = state.mons[index];
        let genoMask = G_NOGEN | G_UNIQ;
        // rn2(9) is evaluated even for liches because it is the left operand.
        if (random.rn2(9) || classSymbol === S_LICH)
            genoMask |= gehennom ? G_NOHELL : G_HELL;
        genoMask &= ~specialMask;

        if (!mkGenerationOkay(index, mvflagsMask, genoMask, state)) continue;
        // C compares with the immediately preceding difficulty-sorted class
        // record, even when that record failed the generation filters above.
        if (total && monster.difficulty > maxLevel
            && monster.difficulty > state.mons[order[last - 1]].difficulty
            && random.rn2(2)) {
            break;
        }

        let weight = monster.geno & G_FREQ;
        if (!weight && zeroFrequencyForEntireClass) weight = 1;
        if (weight) {
            weight += 1 - Number(
                adjustedMonsterLevel(monster, state) > state.u.ulevel * 2,
            );
            weights[index] = weight;
            total += weight;
        }
    }
    if (!total) return null;

    let choice = random.rnd(total);
    for (let position = 0; position < last; ++position) {
        const index = order[position];
        choice -= weights[index];
        if (choice <= 0) return state.mons[index];
    }
    return null;
}

// C ref: questpgr.c qt_montype().
export function qt_montype(env = {}) {
    const normalized = generationEnv(env);
    const { random, state } = normalized;
    const role = state.urole;
    if (!role) throw new Error('qt_montype requires role_init()');

    const useFirst = Boolean(random.rn2(5));
    const qpm = useFirst ? role.enemy1num : role.enemy2num;
    const monsterClass = useFirst ? role.enemy1sym : role.enemy2sym;
    if (qpm !== NON_PM && random.rn2(5)
        && !(state.mvitals[qpm].mvflags & G_GENOD)) {
        return state.mons[qpm];
    }
    return mkclass(monsterClass, 0, normalized);
}

// Weighted reservoir sampling is intentional. It consumes one rn2 call for
// every viable positive-weight candidate, in mons[] order; replacing it with
// a final weighted draw would select the same distribution but the wrong RNG.
export function rndmonst_adj(minadj = 0, maxadj = 0, env = {}) {
    const normalized = generationEnv(env);
    const { random, state } = normalized;
    if (state.u.uz.dnum === state.quest_dnum && random.rn2(7)) {
        const quest = qt_montype(normalized);
        if (quest) return quest;
    }

    const zlevel = level_difficulty(state);
    const minmlev = Math.trunc(zlevel / 6) + Math.trunc(minadj);
    const maxmlev = Math.trunc((zlevel + state.u.ulevel) / 2)
        + Math.trunc(maxadj);
    const uppercaseOnly = isRogueLevel(state);
    const elementalLevel = inEndgame(state) && !isAstralLevel(state);
    let totalWeight = 0;
    let selected = NON_PM;

    for (let index = LOW_PM; index < SPECIAL_PM; ++index) {
        const monster = state.mons[index];
        if (monster.difficulty < minmlev || monster.difficulty > maxmlev)
            continue;
        if (uppercaseOnly
            && !/^[A-Z]$/u.test(monsterClassSymbol(monster.mlet))) {
            continue;
        }
        if (elementalLevel && wrongElementType(monster, state)) continue;
        if (uncommon(index, state)) continue;
        if (inHell(state) && (monster.geno & G_NOHELL)) continue;

        let weight = (monster.geno & G_FREQ) + alignShift(monster, state);
        weight += temperatureShift(monster, state);
        if (weight < 0 || weight > 127) weight = 0;
        if (weight > 0) {
            totalWeight += weight;
            if (random.rn2(totalWeight) < weight) selected = index;
        }
    }
    if (selected === NON_PM || uncommon(selected, state)) return null;
    return state.mons[selected];
}

export function rndmonst(env = {}) {
    return rndmonst_adj(0, 0, env);
}

export function rndmonnum_adj(minadj = 0, maxadj = 0, env = {}) {
    const normalized = generationEnv(env);
    const selected = rndmonst_adj(minadj, maxadj, normalized);
    if (selected) return selected.pmidx;

    const excluded = G_UNIQ | G_NOGEN
        | (inHell(normalized.state) ? G_NOHELL : G_HELL);
    let index;
    do {
        index = normalized.random.rn1(SPECIAL_PM - LOW_PM, LOW_PM);
    } while (normalized.state.mons[index].geno & excluded);
    return index;
}

export function rndmonnum(env = {}) {
    return rndmonnum_adj(0, 0, env);
}
