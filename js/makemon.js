// Monster selection, birth limits, hit points, and attitude.
// C refs: makemon.c rndmonst_adj(), mkclass(), and elemental filtering;
// mkobj.c rndmonnum_adj(); questpgr.c qt_montype().

import {
    A_NONE,
    A_NEUTRAL,
    ALIGNWEIGHT,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    G_EXTINCT,
    G_GENOD,
    G_GONE,
    MAXMONNO,
} from './const.js';
import { level_difficulty, on_level } from './dungeon.js';
import { game } from './gstate.js';
import { d, rn1, rn2, rnd } from './rng.js';
import {
    G_FREQ,
    G_HELL,
    G_NOGEN,
    G_NOHELL,
    G_UNIQ,
    G_IGNORE,
    LOW_PM,
    M1_AMORPHOUS,
    M1_FLY,
    M1_SWIM,
    M2_HOSTILE,
    M2_MINION,
    M2_PEACEFUL,
    MR_COLD,
    MR_FIRE,
    MS_GUARDIAN,
    MS_LEADER,
    MS_NEMESIS,
    NON_PM,
    NUMMONS,
    PM_AIR_ELEMENTAL,
    PM_CLAY_GOLEM,
    PM_DEATH,
    PM_EARTH_ELEMENTAL,
    PM_ELF,
    PM_ERINYS,
    PM_FAMINE,
    PM_FLESH_GOLEM,
    PM_FIRE_ELEMENTAL,
    PM_GLASS_GOLEM,
    PM_GOLD_GOLEM,
    PM_GRAY_DRAGON,
    PM_GIANT,
    PM_HIGH_CLERIC,
    PM_HUMAN,
    PM_IRON_GOLEM,
    PM_LEATHER_GOLEM,
    PM_MAIL_DAEMON,
    PM_NAZGUL,
    PM_ORC,
    PM_PAPER_GOLEM,
    PM_PESTILENCE,
    PM_ROPE_GOLEM,
    PM_STONE_GOLEM,
    PM_STRAW_GOLEM,
    PM_WATER_ELEMENTAL,
    PM_WOOD_GOLEM,
    PM_WIZARD_OF_YENDOR,
    S_DRAGON,
    S_ELEMENTAL,
    S_EYE,
    S_GHOST,
    S_GOLEM,
    S_LICH,
    S_LIGHT,
    S_MIMIC_DEF,
    S_TRAPPER,
    S_VORTEX,
    SPECIAL_PM,
    monsterClassSymbol,
} from './monsters.js';

// C ref: mondata.h is_placeholder(). These records only back corpse forms.
const PLACEHOLDER_MONSTERS = new Set([PM_ORC, PM_GIANT, PM_ELF, PM_HUMAN]);

function generationState(env = {}) {
    const state = env.state ?? game;
    if (!Array.isArray(state.mons) || state.mons.length <= SPECIAL_PM)
        throw new Error('monster generation requires monst_globals_init()');
    if (!Array.isArray(state.mvitals) || state.mvitals.length < SPECIAL_PM)
        throw new Error('monster generation requires initialized mvitals');
    return state;
}

function generationEnv(env = {}) {
    const state = generationState(env);
    const random = env.random ?? { d, rn1, rn2, rnd };
    // Every selection path needs rn2. rndmonnum's fallback can synthesize rn1
    // from it; a missing rnd is tolerated unless a path reaches mkclass(),
    // which requires it (including a rejected fixed Quest enemy's fallback).
    if (typeof random.rn2 !== 'function')
        throw new TypeError('monster random injection requires rn2');
    const randomOneBased = typeof random.rnd === 'function' ? random.rnd : null;
    const sourceRandom = {
        rn2: random.rn2,
        rn1: typeof random.rn1 === 'function'
            ? random.rn1
            : (range, base) => random.rn2(range) + base,
        rnd: randomOneBased,
        d: typeof random.d === 'function'
            ? random.d
            : randomOneBased && ((number, sides) => {
                let total = 0;
                for (let die = 0; die < number; ++die)
                    total += randomOneBased(sides);
                return total;
            }),
    };
    return { ...env, state, random: sourceRandom };
}

function hitPointEnv(env = {}) {
    const state = generationState(env);
    const random = env.random ?? { d, rnd };
    const randomOneBased = typeof random.rnd === 'function'
        ? random.rnd
        : null;
    return {
        ...env,
        state,
        random: {
            rnd: randomOneBased,
            d: typeof random.d === 'function'
                ? random.d
                : randomOneBased && ((number, sides) => {
                    let total = 0;
                    for (let die = 0; die < number; ++die)
                        total += randomOneBased(sides);
                    return total;
                }),
        },
    };
}

function currentSpecialLevel(state) {
    return state.specialLevels?.find(
        (candidate) => on_level(candidate.dlevel, state.u?.uz),
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
    return on_level(state.u?.uz, state.astral_level);
}

function isRogueLevel(state) {
    return on_level(state.u?.uz, state.rogue_level);
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
        return on_level(state.u?.uz, state.air_level);
    case PM_FIRE_ELEMENTAL:
        return on_level(state.u?.uz, state.fire_level);
    case PM_EARTH_ELEMENTAL:
        return on_level(state.u?.uz, state.earth_level);
    case PM_WATER_ELEMENTAL:
        return on_level(state.u?.uz, state.water_level);
    default:
        return false;
    }
}

// C ref: makemon.c wrong_elem_type().
function wrongElementType(monster, state) {
    if (monster.mlet === S_ELEMENTAL)
        return !is_home_elemental(monster, state);
    if (on_level(state.u?.uz, state.earth_level)) return false;
    if (on_level(state.u?.uz, state.water_level))
        return !(monster.mflags1 & M1_SWIM);
    if (on_level(state.u?.uz, state.fire_level))
        return !(monster.mresists & MR_FIRE);
    if (on_level(state.u?.uz, state.air_level)) {
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

// C ref: makemon.c adj_lev().
export function adj_lev(monster, state = game) {
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

// C ref: makemon.c mbirth_limit().
export function mbirth_limit(mndx) {
    if (mndx === PM_NAZGUL) return 9;
    if (mndx === PM_ERINYS) return 3;
    return MAXMONNO;
}

// C ref: makemon.c propagate(). Births can still be tallied after a species
// is gone; ghostly restoration alone suppresses a tally which cannot live.
export function propagate(mndx, tally, ghostly, env = {}) {
    const state = generationState(env);
    if (!Number.isInteger(mndx) || mndx < LOW_PM || mndx >= NUMMONS)
        throw new RangeError(`propagate: invalid monster index ${mndx}`);

    const monster = state.mons[mndx];
    const vital = state.mvitals[mndx];
    const limit = mbirth_limit(mndx);
    const gone = Boolean(vital.mvflags & G_GONE);
    const result = vital.born < limit && !gone;

    if ((monster.geno & G_UNIQ) && mndx !== PM_HIGH_CLERIC)
        vital.mvflags |= G_EXTINCT;
    if (vital.born < 255 && tally && (!ghostly || result)) ++vital.born;
    if (vital.born >= limit
        && !(monster.geno & G_NOGEN)
        && !(vital.mvflags & G_EXTINCT)) {
        vital.mvflags |= G_EXTINCT;
    }
    return result;
}

// C ref: makemon.c golemhp().
export function golemhp(mndx) {
    switch (mndx) {
    case PM_STRAW_GOLEM:
    case PM_PAPER_GOLEM:
        return 20;
    case PM_ROPE_GOLEM:
        return 30;
    case PM_LEATHER_GOLEM:
        return 40;
    case PM_GOLD_GOLEM:
        return 60;
    case PM_WOOD_GOLEM:
        return 50;
    case PM_FLESH_GOLEM:
        return 40;
    case PM_CLAY_GOLEM:
        return 70;
    case PM_STONE_GOLEM:
        return 100;
    case PM_GLASS_GOLEM:
        return 80;
    case PM_IRON_GOLEM:
        return 120;
    default:
        return 0;
    }
}

function isRider(mndx) {
    return mndx === PM_DEATH || mndx === PM_PESTILENCE || mndx === PM_FAMINE;
}

// C ref: makemon.c newmonhp().
export function newmonhp(mon, mndx, env = {}) {
    const { random, state } = hitPointEnv(env);
    if (!mon || typeof mon !== 'object')
        throw new TypeError('newmonhp requires a monster instance');
    if (!Number.isInteger(mndx) || mndx < LOW_PM || mndx >= NUMMONS)
        throw new RangeError(`newmonhp: invalid monster index ${mndx}`);

    const ptr = state.mons[mndx];
    let basehp = 0;
    mon.m_lev = adj_lev(ptr, state);
    if (ptr.mlet === S_GOLEM) {
        mon.mhpmax = mon.mhp = golemhp(mndx);
    } else if (isRider(mndx)) {
        basehp = 10;
        if (typeof random.d !== 'function')
            throw new TypeError('newmonhp requires d for Rider hit points');
        mon.mhpmax = mon.mhp = random.d(basehp, 8);
    } else if (ptr.mlevel > 49) {
        mon.mhpmax = mon.mhp = 2 * (ptr.mlevel - 6);
        mon.m_lev = Math.trunc(mon.mhp / 4);
    } else if (ptr.mlet === S_DRAGON && mndx >= PM_GRAY_DRAGON) {
        basehp = mon.m_lev;
        if (inEndgame(state)) {
            mon.mhpmax = mon.mhp = 8 * basehp;
        } else {
            if (typeof random.d !== 'function')
                throw new TypeError('newmonhp requires d for dragon hit points');
            mon.mhpmax = mon.mhp = 4 * basehp + random.d(basehp, 4);
        }
    } else if (!mon.m_lev) {
        basehp = 1;
        if (typeof random.rnd !== 'function')
            throw new TypeError('newmonhp requires rnd for level-zero hit points');
        mon.mhpmax = mon.mhp = random.rnd(4);
    } else {
        basehp = mon.m_lev;
        if (typeof random.d !== 'function')
            throw new TypeError('newmonhp requires d for ordinary hit points');
        mon.mhpmax = mon.mhp = random.d(basehp, 8);
        if (is_home_elemental(ptr, state))
            mon.mhpmax = (mon.mhp *= 3);
    }

    // If the roll equals basehp (all d8s rolled 1, or level-zero rnd(4)
    // rolled 1), raise both HP fields so levels zero and one start at 2.
    if (mon.mhpmax === basehp)
        mon.mhp = ++mon.mhpmax;
    return mon;
}

// C ref: makemon.c peace_minded().
export function peace_minded(monster, env = {}) {
    const { random, state } = generationEnv(env);
    const mal = monster.maligntyp;
    const heroAlignment = state.u.ualign.type;

    if (alwaysPeaceful(monster)) return true;
    if (alwaysHostile(monster)) return false;
    if (monster.msound === MS_LEADER || monster.msound === MS_GUARDIAN)
        return true;
    if (monster.msound === MS_NEMESIS) return false;
    if (monster.pmidx === PM_ERINYS) return !state.u.ualign.abuse;
    if (monster.mflags2 & (state.urace?.lovemask ?? 0)) return true;
    if (monster.mflags2 & (state.urace?.hatemask ?? 0)) return false;
    if (Math.sign(mal) !== Math.sign(heroAlignment)) return false;
    if (mal < A_NEUTRAL && state.u.uhave.amulet) return false;
    if (monster.mflags2 & M2_MINION)
        return state.u.ualign.record >= 0;

    const record = state.u.ualign.record;
    // Co-aligned monsters are more likely to be hostile when the hero has
    // strayed or the monster is weakly aligned.
    const alignmentRecordBound = 16 + (record < -15 ? -15 : record);
    return Boolean(random.rn2(alignmentRecordBound)
        && random.rn2(2 + Math.abs(mal)));
}

function alwaysPeaceful(monster) {
    return Boolean(monster.mflags2 & M2_PEACEFUL);
}

function alwaysHostile(monster) {
    return Boolean(monster.mflags2 & M2_HOSTILE);
}

// C ref: makemon.c set_malign().
export function set_malign(mon, state = game) {
    if (!mon?.data)
        throw new TypeError('set_malign requires initialized monster data');
    // mon.malign is the base hero-alignment adjustment when this monster is
    // killed: positive is favorable and negative unfavorable. Kill handling
    // applies its other adjustments separately.
    let mal = mon.data.maligntyp;
    if (mon.ispriest || mon.isminion) {
        if (mon.ispriest && mon.mextra?.epri)
            mal = mon.mextra.epri.shralign;
        else if (mon.isminion && mon.mextra?.emin)
            mal = mon.mextra.emin.min_align;
        if (mal !== A_NONE) mal *= 5;
    }

    const coaligned = Math.sign(mal) === Math.sign(state.u.ualign.type);
    const absolute = Math.abs(mal);
    if (mon.data.msound === MS_LEADER) {
        mon.malign = -20;
    } else if (mal === A_NONE) {
        mon.malign = mon.mpeaceful ? 0 : 20;
    } else if (alwaysPeaceful(mon.data)) {
        mon.malign = (mon.mpeaceful ? -3 : 3) * Math.max(5, absolute);
    } else if (alwaysHostile(mon.data)) {
        mon.malign = coaligned ? 0 : Math.max(5, absolute);
    } else if (coaligned) {
        mon.malign = mon.mpeaceful
            ? -3 * Math.max(3, absolute)
            : Math.max(3, absolute);
    } else {
        mon.malign = absolute;
    }
    return mon.malign;
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
                adj_lev(monster, state) > state.u.ulevel * 2,
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
