// Starting-pet creation and tame-monster state.
// C refs: dog.c newedog(), initedog(), pet_type(), makedog(); steed.c
// put_saddle_on_mon(); do_name.c christen_monst(); mon.c
// see_monster_closeup().

import {
    A_CHA,
    BLINDED,
    HALLUC,
    HALLUC_RES,
    M_AP_MONSTER,
    M_AP_TYPMASK,
    MM_EDOG,
    NO_MINVENT,
    TELEPAT,
    W_SADDLE,
    isok,
} from './const.js';
import { christen_monst } from './do_name.js';
import { game } from './gstate.js';
import { add_to_minv, update_inventory } from './invent.js';
import { discover_object, observe_object } from './o_init.js';
import { set_malign } from './makemon.js';
import { makemon } from './makemon_create.js';
import { m_at } from './monst.js';
import {
    M1_AMORPHOUS,
    M1_HUMANOID,
    M1_UNSOLID,
    M2_DOMESTIC,
    MZ_MEDIUM,
    NON_PM,
    PM_AIR_ELEMENTAL,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_PONY,
    PM_RANGER,
    PM_SAMURAI,
    S_ANGEL,
    S_CENTAUR,
    S_DRAGON,
    S_GHOST,
    S_JABBERWOCK,
    S_QUADRUPED,
    S_UNICORN,
    S_VORTEX,
} from './monsters.js';
import { mksobj, unknow_object } from './obj.js';
import { EXPENSIVE_CAMERA, SADDLE } from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import {
    canSeeMonster,
    sensesMonster,
} from './startup_a11y.js';

export { christen_monst } from './do_name.js';

function dogEnv(env = {}) {
    return {
        ...env,
        random: env.random ?? { d, rn1, rn2, rnd, rne, rnz },
        state: env.state ?? game,
    };
}

function propertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function propertyBlocked(hero, index) {
    return Boolean(hero?.uprops?.[index]?.blocked);
}

function carryingType(state, otyp) {
    for (let object = state.invent ?? state.gi?.invent ?? null;
        object;
        object = object.nobj) {
        if (object.otyp === otyp) return true;
    }
    return false;
}

// C ref: dog.c newedog(). makemon() calls this while m_id is still zero;
// preserving that order deliberately leaves a starting pet's parentmid zero.
export function newedog(monster) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('newedog requires a monster instance');
    monster.mextra ??= {};
    monster.mextra.edog ??= {
        parentmid: monster.m_id,
        droptime: 0,
        dropdist: 0,
        apport: 0,
        whistletime: 0,
        hungrytime: 0,
        ogoal: { x: 0, y: 0 },
        abuse: 0,
        revivals: 0,
        mhpmax_penalty: 0,
        killed_by_u: false,
    };
    return monster.mextra.edog;
}

// C ref: dog.c initedog().
export function initedog(monster, everything = true, env = {}) {
    const { state } = dogEnv(env);
    const edog = monster?.mextra?.edog;
    if (!monster?.data || !edog)
        throw new TypeError('initedog requires a monster with edog state');
    const minimumTame = monster.data.mflags2 & M2_DOMESTIC ? 10 : 5;
    monster.mtame = Math.max(minimumTame, monster.mtame ?? 0);
    monster.mpeaceful = true;
    monster.mavenge = false;
    set_malign(monster, state);

    if (everything) {
        monster.mleashed = false;
        monster.meating = 0;
        edog.droptime = 0;
        edog.dropdist = 10000;
        edog.apport = Math.trunc(state.u?.acurr?.a?.[A_CHA] ?? 0);
        edog.whistletime = 0;
        edog.ogoal = { x: -1, y: -1 };
        edog.abuse = 0;
        edog.revivals = 0;
        edog.mhpmax_penalty = 0;
        edog.killed_by_u = false;
    } else if (edog.apport <= 0) {
        edog.apport = 1;
    }
    edog.hungrytime = Math.max(
        edog.hungrytime,
        Math.trunc(state.moves ?? 0) + 1000,
    );
    state.u.uconduct ??= {};
    state.u.uconduct.pets = Math.trunc(state.u.uconduct.pets ?? 0) + 1;
    return monster;
}

// C ref: dog.c pet_type(). A configured horse preference intentionally falls
// through to the cat/dog draw for roles without a fixed pet.
export function pet_type(env = {}) {
    const { random, state } = dogEnv(env);
    const rolePet = state.urole?.petnum;
    if (Number.isInteger(rolePet) && rolePet !== NON_PM) return rolePet;
    if (state.gp?.preferred_pet === 'c') return PM_KITTEN;
    if (state.gp?.preferred_pet === 'd') return PM_LITTLE_DOG;
    if (typeof random.rn2 !== 'function')
        throw new TypeError('pet_type random injection requires rn2');
    return random.rn2(2) ? PM_KITTEN : PM_LITTLE_DOG;
}

function configuredPetName(pettype, state) {
    if (pettype === PM_LITTLE_DOG) return state.dogname ?? '';
    if (pettype === PM_KITTEN) return state.catname ?? '';
    if (pettype === PM_PONY) return state.horsename ?? '';
    return '';
}

function defaultDogName(state) {
    switch (state.urole?.mnum) {
    case PM_CAVE_DWELLER: return 'Slasher';
    case PM_SAMURAI: return 'Hachi';
    case PM_BARBARIAN: return 'Idefix';
    case PM_RANGER: return 'Sirius';
    default: return '';
    }
}

function fullyIdentifyObject(object, state, env) {
    // C ref: invent.c fully_identify_obj().  makeknown() owns both catalog
    // flags and the class-local discovery ledger; observe_object() owns
    // dknown.  A saddle is non-artifact and has no cknown/lknown semantics.
    discover_object(object.otyp, true, true, true, state, env);
    observe_object(object, state);
    object.known = true;
    object.bknown = true;
    object.rknown = true;
    return object;
}

function canSeeStartingPet(monster, env) {
    if (typeof env.canseemon === 'function')
        return Boolean(env.canseemon(monster, env));
    if (env.state.in_mklev) return false;
    const hero = env.state.u;
    const blind = propertyActive(hero, BLINDED)
        && !propertyBlocked(hero, BLINDED);
    // The fallback is complete for makedog()'s adjacent, undisguised pony.
    // Other callers can inject canseemon() when invisibility or line of sight
    // matters.
    return !blind && !monster.minvis;
}

const SADDLEABLE_CLASSES = new Set([
    S_QUADRUPED,
    S_UNICORN,
    S_ANGEL,
    S_CENTAUR,
    S_DRAGON,
    S_JABBERWOCK,
]);

// C ref: steed.c can_saddle().  Existing worn saddles are deliberately not
// part of this predicate; put_saddle_on_mon() performs that separate check.
export function can_saddle(monster) {
    const species = monster?.data;
    if (!species || !SADDLEABLE_CLASSES.has(species.mlet)) return false;
    const flags = species.mflags1 ?? 0;
    return species.msize >= MZ_MEDIUM
        && (!(flags & M1_HUMANOID) || species.mlet === S_CENTAUR)
        && !(flags & M1_AMORPHOUS)
        && species.mlet !== S_GHOST
        && species.mlet !== S_VORTEX
        && species.pmidx !== PM_AIR_ELEMENTAL
        && !(flags & M1_UNSOLID);
}

function pickUpStartingSaddle(monster, saddle, env) {
    // C ref: steal.c mpickobj(). put_saddle_on_mon() runs before initedog(),
    // so a blind hero cannot see the not-yet-tame pony acquire the saddle.
    // unknow_object() clears only this object instance; fully_identify_obj()
    // has already recorded the saddle's global discovery.
    if (!monster.mtame) {
        const canSeeMonster = canSeeStartingPet(monster, env);
        if (!canSeeMonster && monster !== env.state.u?.ustuck)
            unknow_object(saddle, env.state);
    }
    return add_to_minv(monster, saddle, env);
}

// C ref: steed.c put_saddle_on_mon(). Saddles have no extrinsic property, so
// update_mon_extrinsics() is a state-preserving no-op after the worn masks are
// installed for both starting pets and special-level custom inventories.
export function put_saddle_on_mon(saddle, monster, env = {}) {
    const normalized = dogEnv(env);
    if (!can_saddle(monster)) {
        if (saddle && typeof normalized.hooks?.impossible === 'function') {
            normalized.hooks.impossible(
                'put_saddle_on_mon: saddle obj could get orphaned',
                normalized,
            );
        }
        return null;
    }
    for (let object = monster.minvent; object; object = object.nobj) {
        if (object.owornmask & W_SADDLE) {
            if (saddle && typeof normalized.hooks?.impossible === 'function') {
                normalized.hooks.impossible(
                    'put_saddle_on_mon: saddle obj could get orphaned',
                    normalized,
                );
            }
            return null;
        }
    }
    if (!saddle) {
        saddle = mksobj(SADDLE, true, false, normalized);
        if (!saddle) return null;
        fullyIdentifyObject(saddle, normalized.state, normalized);
    }
    if (pickUpStartingSaddle(monster, saddle, normalized))
        throw new Error('put_saddle_on_mon: merged saddle');
    monster.misc_worn_check |= W_SADDLE;
    saddle.owornmask = W_SADDLE;
    saddle.leashmon = monster.m_id;
    return saddle;
}

// C ref: mon.c see_monster_closeup(). `env.observedAt` owns the caller's
// gb.bhitpos/gn.notonhead setup when a long-worm head or tail is observed;
// requiring that coordinate prevents stale global context from changing which
// vital is recorded. Startup monsters are undisguised; the representation
// below also handles the source's monster-appearance case.
export function see_monster_closeup(monster, photo = false, env = {}) {
    const { state } = dogEnv(env);
    const hero = state.u;
    const hallucinating = propertyActive(hero, HALLUC)
        && !propertyActive(hero, HALLUC_RES);
    const blind = propertyActive(hero, BLINDED)
        && !propertyBlocked(hero, BLINDED);
    const blindTelepathy = propertyActive(hero, TELEPAT);
    if (hallucinating || (blind && !blindTelepathy)) return false;

    let mndx = monster.data.pmidx;
    if ((monster.m_ap_type & M_AP_TYPMASK) === M_AP_MONSTER
        && typeof env.sensemon === 'function' && !env.sensemon(monster, env)) {
        mndx = monster.mappearance;
    }
    if (mndx === PM_LONG_WORM) {
        const observedAt = env.observedAt;
        if (!Number.isInteger(observedAt?.x)
            || !Number.isInteger(observedAt?.y)) {
            throw new Error(
                'see_monster_closeup requires observedAt for a long worm',
            );
        }
        state.gb ??= {};
        state.gb.bhitpos ??= {};
        state.gb.bhitpos.x = observedAt.x;
        state.gb.bhitpos.y = observedAt.y;
        state.gn ??= {};
        state.gn.notonhead = observedAt.x !== monster.mx
            || observedAt.y !== monster.my;
        if (state.gn.notonhead) mndx = PM_LONG_WORM_TAIL;
    }
    const vital = state.mvitals?.[mndx];
    if (!vital)
        throw new Error(`see_monster_closeup requires mvitals[${mndx}]`);
    state.context ??= {};
    state.context.lifelist ??= {
        total_seen_upclose: 0,
        total_photographed: 0,
    };
    if (!vital.seen_close) {
        vital.seen_close = 1;
        state.context.lifelist.total_seen_upclose = Math.trunc(
            state.context.lifelist.total_seen_upclose ?? 0,
        ) + 1;
    }
    if (photo && !monster.minvis && !monster.mundetected
        && ((monster.m_ap_type & M_AP_TYPMASK) === 0
            || (monster.m_ap_type & M_AP_TYPMASK) === M_AP_MONSTER)) {
        if ((monster.m_ap_type & M_AP_TYPMASK) === M_AP_MONSTER)
            mndx = monster.mappearance;
        const photographed = state.mvitals[mndx];
        if (!photographed.photographed) {
            photographed.photographed = 1;
            state.context.lifelist.total_photographed = Math.trunc(
                state.context.lifelist.total_photographed ?? 0,
            ) + 1;
        }
    }
    return true;
}

// C ref: mon.c see_nearby_monsters(). Mark each newly visible adjacent
// species as seen up close after the hero's time-consuming action.
export function see_nearby_monsters(state = game, env = {}) {
    const hero = state.u;
    const hallucinating = propertyActive(hero, HALLUC)
        && !propertyActive(hero, HALLUC_RES);
    const blind = propertyActive(hero, BLINDED)
        && !propertyBlocked(hero, BLINDED);
    if (hallucinating || (blind && !propertyActive(hero, TELEPAT))) return 0;

    let seen = 0;
    for (let x = hero.ux - 1; x <= hero.ux + 1; ++x) {
        for (let y = hero.uy - 1; y <= hero.uy + 1; ++y) {
            if (!isok(x, y)) continue;
            const monster = m_at(x, y, state);
            if (!monster) continue;
            const appearance = monster.m_ap_type & M_AP_TYPMASK;
            const mndx = appearance === M_AP_MONSTER
                ? monster.mappearance : monster.data.pmidx;
            if (state.mvitals?.[mndx]?.seen_close) continue;
            if (!canSeeMonster(monster, state)
                && !(monster.mundetected
                    && sensesMonster(monster, state))) {
                continue;
            }
            state.gb ??= {};
            state.gb.bhitpos ??= {};
            state.gb.bhitpos.x = x;
            state.gb.bhitpos.y = y;
            state.gn ??= {};
            state.gn.notonhead = x !== monster.mx || y !== monster.my;
            if (see_monster_closeup(monster, false, {
                ...env,
                state,
                observedAt: { x, y },
                sensemon: (subject) => sensesMonster(subject, state),
            })) {
                seen++;
            }
        }
    }
    return seen;
}

// C ref: dog.c makedog().
export function makedog(env = {}) {
    const normalized = dogEnv(env);
    const { state } = normalized;
    state.context ??= {};
    state.gp ??= {};
    if (state.gp.preferred_pet === 'n') {
        state.context.startingpet_typ = NON_PM;
        return null;
    }

    const pettype = pet_type(normalized);
    state.context.startingpet_typ = pettype;
    let petname = configuredPetName(pettype, state);
    if (!petname && pettype === PM_LITTLE_DOG)
        petname = defaultDogName(state);

    const monster = makemon(
        state.mons?.[pettype],
        state.u?.ux,
        state.u?.uy,
        MM_EDOG | NO_MINVENT,
        normalized,
    );
    if (!monster) return null;

    if (!state.context.startingpet_mid) {
        state.context.startingpet_mid = monster.m_id;
        if (!state.u?.uroleplay?.pauper && pettype === PM_PONY)
            put_saddle_on_mon(null, monster, normalized);
        state.gb ??= {};
        state.gb.bhitpos ??= {};
        state.gb.bhitpos.x = monster.mx;
        state.gb.bhitpos.y = monster.my;
        state.gn ??= {};
        state.gn.notonhead = false;
        see_monster_closeup(
            monster,
            carryingType(state, EXPENSIVE_CAMERA),
            normalized,
        );
    } else if (typeof normalized.impossible === 'function') {
        normalized.impossible(
            'makedog() when startingpet_mid is already non-zero?',
        );
    }

    const firstPetName = Math.trunc(state.gp.petname_used ?? 0) === 0;
    state.gp.petname_used = Math.trunc(state.gp.petname_used ?? 0) + 1;
    if (firstPetName && petname) {
        christen_monst(monster, petname, {
            updateInventory: () => update_inventory(normalized),
        });
    }
    initedog(monster, true, normalized);
    return monster;
}
