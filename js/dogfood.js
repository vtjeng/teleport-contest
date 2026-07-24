// Pet food classification.
// C ref: dog.c dogfood().

import { obj_resists } from './bury.js';
import {
    ACCFOOD,
    ACID_RES,
    APPORT,
    CADAVER,
    DOGFOOD,
    G_GENOD,
    MANFOOD,
    POISON,
    POISON_RES,
    STONE_RES,
    TABU,
    UNDEF,
    ismnum,
} from './const.js';
import { game } from './gstate.js';
import {
    acidic,
    carnivorous,
    dmgtype,
    flesh_petrifies,
    haseyes,
    herbivorous,
    humanoid,
    is_elf,
    is_rider,
    is_undead,
    is_vampshifter,
    likes_fire,
    metallivorous,
    mon_hates_silver,
    monster_resists_element,
    poisonous,
    same_race,
    slimeproof,
    vegan,
} from './mondata.js';
import {
    AD_POLY,
    M2_SHAPESHIFTER,
    PM_GELATINOUS_CUBE,
    PM_GHOUL,
    PM_KILLER_BEE,
    PM_LICHEN,
    PM_LIZARD,
    PM_PYROLISK,
    PM_QUEEN_BEE,
    PM_RUST_MONSTER,
    S_FUNGUS,
    S_KOBOLD,
    S_OGRE,
    S_ORC,
    S_YETI,
} from './monsters.js';
import { objectType } from './obj.js';
import {
    AMULET_OF_STRANGULATION,
    APPLE,
    BALL_CLASS,
    BANANA,
    CARROT,
    CHAIN_CLASS,
    CLOVE_OF_GARLIC,
    CORPSE,
    EGG,
    ENORMOUS_MEATBALL,
    FOOD_CLASS,
    GLOB_OF_GREEN_SLIME,
    IRON,
    LUMP_OF_ROYAL_JELLY,
    MEATBALL,
    MEAT_RING,
    MEAT_STICK,
    MITHRIL,
    RIN_SLOW_DIGESTION,
    ROCK_CLASS,
    SILVER,
    SLIME_MOLD,
    TIN,
    TRIPE_RATION,
    WOOD,
} from './objects.js';
import { rn2 } from './rng.js';

function effectiveCorpseAge(obj, state) {
    let age = Math.trunc(obj.age ?? 0);
    if (obj.otyp === CORPSE && obj.on_ice) {
        const elapsed = Math.trunc(state.moves ?? 0) - age;
        age += Math.trunc(elapsed / 2);
    }
    return age;
}

function staleEgg(obj, state) {
    // obj.h MAX_EGG_HATCH_TIME is 200; stale_egg uses twice that age.
    return Math.trunc(state.moves ?? 0) - Math.trunc(obj.age ?? 0) > 400;
}

function polymorphFood(obj, species) {
    if (obj.otyp !== CORPSE && obj.otyp !== EGG && obj.otyp !== TIN)
        return false;
    return Boolean(species
        && ((species.mflags2 ?? 0) & M2_SHAPESHIFTER
            || dmgtype(species, AD_POLY)));
}

function isQuestArtifact(obj, state) {
    return Boolean(obj.oartifact
        && obj.oartifact === state.urole?.questarti);
}

function queenBeeOnLevel(state) {
    if ((state.mvitals?.[PM_QUEEN_BEE]?.mvflags ?? 0) & G_GENOD)
        return false;
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.data?.pmidx === PM_QUEEN_BEE && monster.mhp > 0)
            return true;
    }
    return false;
}

function isOrganic(obj, state) {
    return objectType(obj, state).oc_material <= WOOD;
}

function isMetallic(obj, state) {
    const material = objectType(obj, state).oc_material;
    return material >= IRON && material <= MITHRIL;
}

function isRustprone(obj, state) {
    return objectType(obj, state).oc_material === IRON;
}

function normalizedDogfoodEnv(rawEnv, requireRandom = true) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    if (requireRandom && typeof random.rn2 !== 'function')
        throw new TypeError('dogfood random injection requires rn2');
    return {
        ...rawEnv,
        state,
        random,
        resistsPoison: rawEnv.resistsPoison
            ?? ((monster) => monster_resists_element(
                monster,
                POISON_RES,
                state,
            )),
        resistsAcid: rawEnv.resistsAcid
            ?? ((monster) => monster_resists_element(
                monster,
                ACID_RES,
                state,
            )),
        resistsStone: rawEnv.resistsStone
            ?? ((monster) => monster_resists_element(
                monster,
                STONE_RES,
                state,
            )),
    };
}

function dogfoodAfterObjectResistance(monster, obj, env) {
    const { state } = env;
    const species = monster.data;
    const carnivore = carnivorous(species);
    const herbivore = herbivorous(species);

    if (obj.oclass === FOOD_CLASS) {
        const foodMonsterIndex = obj.otyp === CORPSE
            || obj.otyp === TIN || obj.otyp === EGG
            ? obj.corpsenm : -1;
        const foodSpecies = ismnum(foodMonsterIndex)
            ? state.mons?.[foodMonsterIndex] : null;

        if (obj.otyp === CORPSE && is_rider(foodSpecies)) return TABU;
        if ((obj.otyp === CORPSE || obj.otyp === EGG)
            && flesh_petrifies(foodSpecies)
            && !env.resistsStone(monster, env)) {
            return POISON;
        }
        if (obj.otyp === LUMP_OF_ROYAL_JELLY
            && species?.pmidx === PM_KILLER_BEE) {
            return queenBeeOnLevel(state) ? TABU : DOGFOOD;
        }
        if (!carnivore && !herbivore)
            return obj.cursed ? UNDEF : APPORT;

        const edog = monster.mtame && !monster.isminion
            ? monster.mextra?.edog : null;
        const starving = Boolean(edog?.mhpmax_penalty);
        const blindWithEyes = !monster.mcansee && haseyes(species);

        if (species?.pmidx === PM_GHOUL) {
            if (obj.otyp === CORPSE) {
                const old = effectiveCorpseAge(obj, state) + 50
                    <= state.moves;
                return old && foodMonsterIndex !== PM_LIZARD
                    && foodMonsterIndex !== PM_LICHEN ? DOGFOOD
                    : starving && !vegan(foodSpecies) ? ACCFOOD : POISON;
            }
            if (obj.otyp === EGG)
                return staleEgg(obj, state)
                    ? CADAVER : starving ? ACCFOOD : POISON;
            return TABU;
        }

        switch (obj.otyp) {
        case TRIPE_RATION:
        case MEATBALL:
        case MEAT_RING:
        case MEAT_STICK:
        case ENORMOUS_MEATBALL:
            return carnivore ? DOGFOOD : MANFOOD;
        case EGG:
            if (obj.corpsenm === PM_PYROLISK && !likes_fire(species))
                return POISON;
            return carnivore ? CADAVER : MANFOOD;
        case CORPSE: {
            const old = effectiveCorpseAge(obj, state) + 50 <= state.moves
                && foodMonsterIndex !== PM_LIZARD
                && foodMonsterIndex !== PM_LICHEN
                && species?.mlet !== S_FUNGUS;
            if (old
                || (acidic(foodSpecies)
                    && !env.resistsAcid(monster, env))
                || (poisonous(foodSpecies)
                    && !env.resistsPoison(monster, env))) {
                return POISON;
            }
            if (polymorphFood(obj, foodSpecies)
                && monster.mtame > 1 && !starving) {
                return MANFOOD;
            }
            if (vegan(foodSpecies)) return herbivore ? CADAVER : MANFOOD;
            if (humanoid(species) && same_race(species, foodSpecies)
                && (!is_undead(species)
                    && foodSpecies?.mlet !== S_KOBOLD
                    && foodSpecies?.mlet !== S_ORC
                    && foodSpecies?.mlet !== S_OGRE)) {
                return starving && carnivore && !is_elf(species)
                    ? ACCFOOD : TABU;
            }
            return carnivore ? CADAVER : MANFOOD;
        }
        case GLOB_OF_GREEN_SLIME:
            return starving || slimeproof(species) ? ACCFOOD : POISON;
        case CLOVE_OF_GARLIC:
            return is_undead(species) || is_vampshifter(monster)
                ? TABU : herbivore || starving ? ACCFOOD : MANFOOD;
        case TIN:
            return metallivorous(species) ? ACCFOOD : MANFOOD;
        case APPLE:
            return herbivore ? DOGFOOD : starving ? ACCFOOD : MANFOOD;
        case CARROT:
            return herbivore || blindWithEyes
                ? DOGFOOD : starving ? ACCFOOD : MANFOOD;
        case BANANA:
            return species?.mlet === S_YETI && herbivore
                ? DOGFOOD : herbivore || starving ? ACCFOOD : MANFOOD;
        default:
            if (starving) return ACCFOOD;
            return obj.otyp > SLIME_MOLD
                ? carnivore ? ACCFOOD : MANFOOD
                : herbivore ? ACCFOOD : MANFOOD;
        }
    }

    // The source's outer switch sends ROCK_CLASS directly to UNDEF.
    if (obj.oclass === ROCK_CLASS) return UNDEF;
    if (obj.otyp === AMULET_OF_STRANGULATION
        || obj.otyp === RIN_SLOW_DIGESTION) {
        return TABU;
    }
    if (mon_hates_silver(monster)
        && objectType(obj, state).oc_material === SILVER) {
        return TABU;
    }
    if (species?.pmidx === PM_GELATINOUS_CUBE
        && isOrganic(obj, state)) {
        return ACCFOOD;
    }
    if (metallivorous(species) && isMetallic(obj, state)
        && (isRustprone(obj, state)
            || species?.pmidx !== PM_RUST_MONSTER)) {
        return isRustprone(obj, state) && !obj.oerodeproof
            ? DOGFOOD : ACCFOOD;
    }
    if (!obj.cursed && obj.oclass !== BALL_CLASS
        && obj.oclass !== CHAIN_CLASS) {
        return APPORT;
    }
    return UNDEF;
}

// Pure source classification used by callers which must establish whether a
// later dogfood() call can reach an effect before they consume its rn2(100).
// An artifact which reaches this helper is classified along the source's 5%
// non-resistance path.
export function dogfoodWithoutObjectResistanceDraw(
    monster,
    obj,
    rawEnv = {},
) {
    const env = normalizedDogfoodEnv(rawEnv, false);
    if (obj.opoisoned && !env.resistsPoison(monster, env)) return POISON;
    if (isQuestArtifact(obj, env.state))
        return obj.cursed ? TABU : APPORT;
    return dogfoodAfterObjectResistance(monster, obj, env);
}

// The lower result is the more desirable food class. obj_resists() retains
// the source's unconditional rn2(100) call for ordinary non-quest objects.
export function dogfood(monster, obj, rawEnv = {}) {
    const env = normalizedDogfoodEnv(rawEnv);
    if (obj.opoisoned && !env.resistsPoison(monster, env)) return POISON;
    if (isQuestArtifact(obj, env.state)
        || obj_resists(obj, 0, 95, env)) {
        return obj.cursed ? TABU : APPORT;
    }
    return dogfoodAfterObjectResistance(monster, obj, env);
}
