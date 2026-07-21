// Random monster selection.
// C refs: src/makemon.c rndmonst_adj() and src/mkobj.c rndmonnum_adj().

import {
    ALIGNWEIGHT,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    G_GONE,
} from './const.js';
import { level_difficulty } from './dungeon.js';
import { game } from './gstate.js';
import { rn1, rn2 } from './rng.js';
import {
    G_FREQ,
    G_HELL,
    G_NOGEN,
    G_NOHELL,
    G_UNIQ,
    LOW_PM,
    MR_COLD,
    MR_FIRE,
    NON_PM,
    NUMMONS,
    SPECIAL_PM,
    monsterClassSymbol,
} from './monsters.js';

export class UnsupportedMonsterGenerationError extends Error {
    constructor(operation) {
        super(`${operation} is not available`);
        this.name = 'UnsupportedMonsterGenerationError';
        this.operation = operation;
    }
}

function generationEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn1, rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('monster random injection requires rn2');
    const sourceRandom = {
        rn2: random.rn2,
        rn1: typeof random.rn1 === 'function'
            ? random.rn1
            : (range, base) => random.rn2(range) + base,
    };
    if (!Array.isArray(state.mons) || state.mons.length <= SPECIAL_PM)
        throw new Error('monster generation requires monst_globals_init()');
    if (!Array.isArray(state.mvitals) || state.mvitals.length < SPECIAL_PM)
        throw new Error('monster generation requires initialized mvitals');
    return { ...env, state, random: sourceRandom, hooks: env.hooks ?? {} };
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

function questMonster(env) {
    const hook = env.hooks.questMonsterType;
    if (typeof hook !== 'function')
        throw new UnsupportedMonsterGenerationError('questMonsterType');
    const index = hook(env);
    if (index == null) return null;
    if (!Number.isInteger(index) || index < LOW_PM || index >= NUMMONS)
        throw new RangeError(`invalid quest monster index ${index}`);
    return env.state.mons[index];
}

function wrongElement(monster, env) {
    const hook = env.hooks.wrongElementType;
    if (typeof hook !== 'function')
        throw new UnsupportedMonsterGenerationError('wrongElementType');
    return Boolean(hook(monster, env));
}

// Weighted reservoir sampling is intentional. It consumes one rn2 call for
// every viable positive-weight candidate, in mons[] order; replacing it with
// a final weighted draw would select the same distribution but the wrong RNG.
export function rndmonst_adj(minadj = 0, maxadj = 0, env = {}) {
    const normalized = generationEnv(env);
    const { random, state } = normalized;
    if (state.u.uz.dnum === state.quest_dnum && random.rn2(7)) {
        const quest = questMonster(normalized);
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
        if (elementalLevel && wrongElement(monster, normalized)) continue;
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
