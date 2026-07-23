// Monster movement decisions and shared movement predicates.
// C ref: monmove.c set_apparxy(), can_ooze(), and can_fog().

import {
    ACCESSIBLE,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DISPLACED,
    DOOR,
    DRAWBRIDGE_UP,
    D_CLOSED,
    D_LOCKED,
    G_GENOD,
    ICE,
    INVIS,
    LAVAPOOL,
    MOAT,
    PROT_FROM_SHAPE_CHANGERS,
    STONE,
    isok,
} from './const.js';
import { game } from './gstate.js';
import { money_cnt } from './invent.js';
import {
    amorphous,
    passes_walls,
    perceives,
    verysmall,
} from './mondata.js';
import {
    PM_DISPLACER_BEAST,
    PM_FOG_CLOUD,
    PM_VAMPIRE,
    PM_VAMPIRE_LEADER,
    PM_VLAD_THE_IMPALER,
    PM_XORN,
} from './monsters.js';
import { isCandle, isContainer, objectType } from './obj.js';
import {
    AMULET_CLASS,
    ARMOR_CLASS,
    ARM_CLOAK,
    ARM_GLOVES,
    ARM_SHIRT,
    ARROW,
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    BLINDFOLD,
    BOOMERANG,
    CANDY_BAR,
    COIN_CLASS,
    CORPSE,
    CREDIT_CARD,
    CRYSKNIFE,
    DAGGER,
    FEDORA,
    FORTUNE_COOKIE,
    GEM_CLASS,
    LEASH,
    LEATHER_JACKET,
    LEMBAS_WAFER,
    LOCK_PICK,
    LUMP_OF_ROYAL_JELLY,
    MAGIC_MARKER,
    MAGIC_WHISTLE,
    OILSKIN_SACK,
    PANCAKE,
    RING_CLASS,
    SACK,
    SKELETON_KEY,
    SLING,
    STETHOSCOPE,
    TIN_OPENER,
    TIN_WHISTLE,
    TOWEL,
    VENOM_CLASS,
} from './objects.js';
import { rn2 } from './rng.js';
import { couldsee } from './vision.js';

function movementEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('monster movement random injection requires rn2');
    return {
        ...env,
        state,
        random,
        couldSee: env.couldSee ?? ((x, y) => couldsee(x, y, state)),
    };
}

function propertyActive(state, property, blockedMatters = false) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && (!blockedMatters || !value?.blocked);
}

function doorMask(location) {
    // rm.doormask aliases flags in C. doormask remains a compatibility input
    // for focused fixtures and older persisted state.
    return location?.flags || location?.doormask || 0;
}

function drawbridgeMask(location) {
    return location?.flags || location?.drawbridgemask || 0;
}

// C ref: monmove.c closed_door().
export function closed_door(x, y, state = game) {
    const location = state.level?.at(x, y);
    return location?.typ === DOOR
        && Boolean(doorMask(location) & (D_LOCKED | D_CLOSED));
}

function surfaceAt(x, y, state) {
    const location = state.level?.at(x, y);
    if (!location) return STONE;
    if (location.typ !== DRAWBRIDGE_UP) return location.typ;
    switch (drawbridgeMask(location) & DB_UNDER) {
    case DB_ICE: return ICE;
    case DB_LAVA: return LAVAPOOL;
    case DB_MOAT: return MOAT;
    default: return STONE;
    }
}

// C ref: monmove.c accessible(). Closed drawbridges use their underlying
// terrain through rm.h's SURFACE_AT macro.
export function accessible(x, y, state = game) {
    return ACCESSIBLE(surfaceAt(x, y, state)) && !closed_door(x, y, state);
}

function isArmorCategory(obj, category, state) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === category;
}

// C ref: monmove.c stuff_prevents_passage(). Keep the source's `otyp ==
// COIN_CLASS` test: in this source tree, that names the generic coin slot.
function stuffPreventsPassage(monster, state) {
    const chain = monster === state.youmonst
        ? state.invent
        : monster.minvent;
    for (let obj = chain; obj; obj = obj.nobj) {
        const typ = obj.otyp;

        if (typ === COIN_CLASS && obj.quan > 100) return true;
        if (obj.oclass !== GEM_CLASS
            && !(typ >= ARROW && typ <= BOOMERANG)
            && !(typ >= DAGGER && typ <= CRYSKNIFE)
            && typ !== SLING
            && !isArmorCategory(obj, ARM_CLOAK, state)
            && typ !== FEDORA
            && !isArmorCategory(obj, ARM_GLOVES, state)
            && typ !== LEATHER_JACKET
            && typ !== CREDIT_CARD
            && !isArmorCategory(obj, ARM_SHIRT, state)
            && !(typ === CORPSE
                && verysmall(state.mons?.[obj.corpsenm]))
            && typ !== FORTUNE_COOKIE
            && typ !== CANDY_BAR
            && typ !== PANCAKE
            && typ !== LEMBAS_WAFER
            && typ !== LUMP_OF_ROYAL_JELLY
            && obj.oclass !== AMULET_CLASS
            && obj.oclass !== RING_CLASS
            && obj.oclass !== VENOM_CLASS
            && typ !== SACK
            && typ !== BAG_OF_HOLDING
            && typ !== BAG_OF_TRICKS
            && !isCandle(obj)
            && typ !== OILSKIN_SACK
            && typ !== LEASH
            && typ !== STETHOSCOPE
            && typ !== BLINDFOLD
            && typ !== TOWEL
            && typ !== TIN_WHISTLE
            && typ !== MAGIC_WHISTLE
            && typ !== MAGIC_MARKER
            && typ !== TIN_OPENER
            && typ !== SKELETON_KEY
            && typ !== LOCK_PICK) {
            return true;
        }
        if (isContainer(obj) && obj.cobj) return true;
    }
    return false;
}

// C ref: monmove.c can_ooze().
export function can_ooze(monster, state = game) {
    return amorphous(monster.data)
        && !stuffPreventsPassage(monster, state);
}

export function is_vampshifter(monster) {
    return monster.cham === PM_VAMPIRE
        || monster.cham === PM_VAMPIRE_LEADER
        || monster.cham === PM_VLAD_THE_IMPALER;
}

// C ref: monmove.c can_fog().
export function can_fog(monster, state = game) {
    return !(state.mvitals?.[PM_FOG_CLOUD]?.mvflags & G_GENOD)
        && is_vampshifter(monster)
        && !propertyActive(state, PROT_FROM_SHAPE_CHANGERS)
        && !stuffPreventsPassage(monster, state);
}

function isSpecies(monster, pmidx, state) {
    return monster.data === state.mons?.[pmidx]
        || monster.data?.pmidx === pmidx;
}

// C ref: monmove.c set_apparxy(). Decide where a monster thinks the hero is.
export function set_apparxy(monster, env = {}) {
    const normalized = movementEnv(env);
    const { couldSee, random, state } = normalized;
    const { u } = state;
    let mx = monster.mux;
    let my = monster.muy;
    const heroMoney = money_cnt(state.invent ?? null);

    // Pets know the hero's smell. A grabber or a monster whose remembered
    // square still contains the hero also keeps exact knowledge.
    if (monster.mtame || monster === u.ustuck
        || (mx === u.ux && my === u.uy)) {
        monster.mux = u.ux;
        monster.muy = u.uy;
        return;
    }

    const notseen = !monster.mcansee
        || (propertyActive(state, INVIS, true) && !perceives(monster.data));
    const notthere = propertyActive(state, DISPLACED)
        && !isSpecies(monster, PM_DISPLACER_BEAST, state);
    let displacement;
    if (u.uinwater) {
        displacement = 1;
    } else if (notseen) {
        // Xorns can smell the valuable metal in the hero's gold.
        displacement = isSpecies(monster, PM_XORN, state) && heroMoney
            ? 0
            : 1;
    } else if (notthere) {
        displacement = couldSee(mx, my) ? 2 : 1;
    } else {
        displacement = 0;
    }

    if (!displacement) {
        monster.mux = u.ux;
        monster.muy = u.uy;
        return;
    }

    const foundHero = notseen
        ? !random.rn2(3)
        : notthere
            ? !random.rn2(4)
            : false;

    if (foundHero) {
        mx = u.ux;
        my = u.uy;
    } else {
        let tryCount = 0;
        do {
            if (++tryCount > 200) {
                mx = u.ux;
                my = u.uy;
                break;
            }
            mx = u.ux - displacement
                + random.rn2(2 * displacement + 1);
            my = u.uy - displacement
                + random.rn2(2 * displacement + 1);
        } while (!isok(mx, my)
            || (displacement !== 2
                && mx === monster.mx && my === monster.my)
            || ((mx !== u.ux || my !== u.uy)
                && !passes_walls(monster.data)
                && !(accessible(mx, my, state)
                    || (closed_door(mx, my, state)
                        && (can_ooze(monster, state)
                            || can_fog(monster, state)))))
            || !couldSee(mx, my));
    }

    monster.mux = mx;
    monster.muy = my;
}
