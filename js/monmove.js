// Monster movement decisions and shared movement predicates.
// C ref: monmove.c set_apparxy(), can_ooze(), and can_fog().

import {
    ACCESSIBLE,
    A_LAWFUL,
    A_NONE,
    AM_SHRINE,
    Amask2align,
    BOLT_LIM,
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
    IS_ALTAR,
    LAVAPOOL,
    MOAT,
    PROT_FROM_SHAPE_CHANGERS,
    ROOMOFFSET,
    SHOPBASE,
    STONE,
    TEMPLE,
    W_ARM,
    isok,
} from './const.js';
import { ART_SUNSWORD } from './artifacts.js';
import { on_level } from './dungeon.js';
import { sengr_at } from './engrave.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { money_cnt } from './invent.js';
import {
    amorphous,
    is_minion,
    is_rider,
    passes_walls,
    perceives,
    verysmall,
} from './mondata.js';
import {
    G_UNIQ,
    PM_ANGEL,
    PM_DISPLACER_BEAST,
    PM_FOG_CLOUD,
    PM_GREMLIN,
    PM_GRID_BUG,
    PM_MINOTAUR,
    PM_VAMPIRE,
    PM_VAMPIRE_LEADER,
    PM_VLAD_THE_IMPALER,
    PM_XORN,
    S_HUMAN,
    S_VAMPIRE,
} from './monsters.js';
import {
    isCandle,
    isContainer,
    objectType,
    sobj_at,
} from './obj.js';
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
    GOLD_DRAGON_SCALE_MAIL,
    GOLD_DRAGON_SCALES,
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
    SCR_SCARE_MONSTER,
    SKELETON_KEY,
    SLING,
    STETHOSCOPE,
    TIN_OPENER,
    TIN_WHISTLE,
    TOWEL,
    VENOM_CLASS,
} from './objects.js';
import { rn2, rnd } from './rng.js';
import { in_rooms } from './rooms.js';
import { couldsee } from './vision.js';

const ALGN_SINNED = -4;
const ROOM_STRING_SIZE = 5;

function movementEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2, rnd };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('monster movement random injection requires rn2');
    const couldSee = env.couldSee ?? ((x, y) => couldsee(x, y, state));
    if (typeof couldSee !== 'function')
        throw new TypeError('monster movement couldSee must be a function');
    return {
        ...env,
        state,
        random,
        couldSee,
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

function monsterAlignment(monster) {
    let alignment = monster.ispriest
        ? monster.mextra?.epri?.shralign
        : monster.isminion
            ? monster.mextra?.emin?.min_align
            : monster.data?.maligntyp;
    if (alignment === A_NONE) return A_NONE;
    alignment = Math.sign(alignment ?? 0);
    return alignment;
}

function isLawfulMinion(monster) {
    return is_minion(monster.data)
        && monsterAlignment(monster) === A_LAWFUL;
}

function altarMask(location) {
    return location?.altarmask ?? location?.flags ?? 0;
}

function hasShrine(priest, state) {
    if (!priest?.ispriest) return false;
    const extension = priest.mextra?.epri;
    const location = state.level?.at(
        extension?.shrpos?.x,
        extension?.shrpos?.y,
    );
    const mask = altarMask(location);
    return IS_ALTAR(location?.typ)
        && Boolean(mask & AM_SHRINE)
        && extension.shralign === Amask2align(mask & ~AM_SHRINE);
}

function histempleAt(priest, x, y, state) {
    const extension = priest?.mextra?.epri;
    return Boolean(priest?.ispriest
        && extension
        && extension.shroom === (in_rooms(x, y, TEMPLE, state)[0] ?? 0)
        && on_level(extension.shrlevel, state.u?.uz));
}

function inhistemple(priest, state) {
    return Boolean(priest?.ispriest
        && histempleAt(priest, priest.mx, priest.my, state)
        && hasShrine(priest, state));
}

function inhishop(shopkeeper, state) {
    const extension = shopkeeper?.mextra?.eshk;
    return Boolean(extension
        && on_level(extension.shoplevel, state.u?.uz)
        && in_rooms(
            shopkeeper.mx,
            shopkeeper.my,
            SHOPBASE,
            state,
        ).includes(extension.shoproom));
}

function templeOccupied(roomBuffer, state) {
    for (let index = 0; index < ROOM_STRING_SIZE; ++index) {
        const roomNumber = Math.trunc(roomBuffer?.[index] ?? 0);
        if (!roomNumber) break;
        if (state.level?.rooms?.[roomNumber - ROOMOFFSET]?.rtype === TEMPLE)
            return roomNumber;
    }
    return 0;
}

function findPriest(roomNumber, state) {
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1) continue;
        if (monster.ispriest
            && monster.mextra?.epri?.shroom === roomNumber
            && histempleAt(monster, monster.mx, monster.my, state)) {
            return monster;
        }
    }
    return null;
}

// C ref: priest.c in_your_sanctuary().
export function in_your_sanctuary(
    monster,
    x = 0,
    y = 0,
    state = game,
) {
    if (monster) {
        if (is_minion(monster.data) || is_rider(monster.data)) return false;
        x = monster.mx;
        y = monster.my;
    }
    if (state.u?.ualign?.record <= ALGN_SINNED) return false;
    const roomNumber = templeOccupied(state.u?.urooms, state);
    if (!roomNumber
        || roomNumber !== (in_rooms(x, y, TEMPLE, state)[0] ?? 0)) {
        return false;
    }
    const priest = findPriest(roomNumber, state);
    return Boolean(priest
        && hasShrine(priest, state)
        && monsterAlignment(priest) === state.u?.ualign?.type
        && priest.mpeaceful);
}

function inHell(state) {
    const dnum = state.u?.uz?.dnum;
    return Boolean(state.dungeons?.[dnum]?.flags?.hellish);
}

function inEndgame(state) {
    return state.u?.uz?.dnum != null
        && state.u.uz.dnum === state.astral_level?.dnum;
}

function visibleObjectAt(x, y, state) {
    return state.level?.objects?.[x]?.[y] ?? null;
}

// C ref: monmove.c onscary().
export function onscary(x, y, monster, state = game) {
    const auditoryScare = x === 0 && y === 0;
    const magicalScare = !auditoryScare;

    if (monster.iswiz || isLawfulMinion(monster)
        || isSpecies(monster, PM_ANGEL, state)
        || is_rider(monster.data)) {
        return false;
    }

    if (magicalScare
        && (monster.data?.mlet === S_HUMAN
            || Boolean(monster.data?.geno & G_UNIQ))) {
        return false;
    }

    if ((monster.isshk && inhishop(monster, state))
        || (monster.ispriest && inhistemple(monster, state))) {
        return false;
    }

    if (auditoryScare) return true;

    const location = state.level?.at(x, y);
    if (IS_ALTAR(location?.typ)
        && (monster.data?.mlet === S_VAMPIRE
            || is_vampshifter(monster))) {
        return true;
    }

    if (sobj_at(SCR_SCARE_MONSTER, x, y, state)) return true;

    const engraving = sengr_at('Elbereth', x, y, true, state);
    const imageAtSquare = propertyActive(state, DISPLACED)
        && monster.mux === x && monster.muy === y;
    return Boolean(engraving
        && ((state.u?.ux === x && state.u?.uy === y)
            || imageAtSquare
            || (engraving.guardobjects && visibleObjectAt(x, y, state)))
        && !(monster.isshk || monster.isgd || !monster.mcansee
            || monster.mpeaceful
            || isSpecies(monster, PM_MINOTAUR, state)
            || inHell(state) || inEndgame(state)));
}

// C ref: mon.c monnear(). Grid bugs alone cannot use diagonal adjacency.
export function monnear(monster, x, y, state = game) {
    const distance = dist2(monster.mx, monster.my, x, y);
    if (distance === 2 && isSpecies(monster, PM_GRID_BUG, state))
        return false;
    return distance < 3;
}

function artifactLight(obj) {
    return Boolean(obj
        && ((((obj.otyp === GOLD_DRAGON_SCALE_MAIL
                    || obj.otyp === GOLD_DRAGON_SCALES)
                && (obj.owornmask & W_ARM))
            || obj.oartifact === ART_SUNSWORD)));
}

function fleesLight(monster, normalized) {
    const { couldSee, state } = normalized;
    return isSpecies(monster, PM_GREMLIN, state)
        && ((state.uwep?.lamplit && artifactLight(state.uwep))
            || (state.uarm?.lamplit && artifactLight(state.uarm)))
        && monster.mcansee
        && couldSee(monster.mx, monster.my);
}

// C ref: monmove.c distfleeck(). monflee() owns messages, release behavior,
// Vrock gas, and track clearing, so callers supply that complete operation.
export async function distfleeck(monster, env = {}) {
    const normalized = movementEnv(env);
    const { random, state } = normalized;
    const onScary = env.onScary ?? onscary;
    const checksFleeingLight = env.fleesLight ?? fleesLight;
    const inSanctuary = env.inYourSanctuary ?? in_your_sanctuary;
    if (typeof random.rnd !== 'function')
        throw new TypeError('distfleeck random injection requires rnd');
    if (typeof onScary !== 'function'
        || typeof checksFleeingLight !== 'function'
        || typeof inSanctuary !== 'function') {
        throw new TypeError('distfleeck predicate injections must be functions');
    }
    if (typeof env.monFlee !== 'function')
        throw new TypeError('distfleeck requires a monFlee operation');

    const braveGremlin = random.rn2(5) === 0;
    const inrange = dist2(
        monster.mx,
        monster.my,
        monster.mux,
        monster.muy,
    ) <= BOLT_LIM * BOLT_LIM;
    const nearby = inrange
        && monnear(monster, monster.mux, monster.muy, state);

    const seesWrongSquare = !monster.mcansee
        || (propertyActive(state, INVIS, true) && !perceives(monster.data));
    const scaryX = seesWrongSquare ? monster.mux : state.u.ux;
    const scaryY = seesWrongSquare ? monster.muy : state.u.uy;
    const sawScary = onScary(
        scaryX,
        scaryY,
        monster,
        state,
    );
    const scared = nearby
        && (sawScary
            || (checksFleeingLight(monster, normalized)
                && !braveGremlin)
            || (!monster.mpeaceful
                && inSanctuary(
                    monster,
                    0,
                    0,
                    state,
                )));

    if (scared) {
        const fleeTime = random.rnd(random.rn2(7) ? 10 : 100);
        await env.monFlee(monster, fleeTime, true, true, normalized);
    }
    return { inrange, nearby, scared: Boolean(scared) };
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
