// Starting-pet creation, tame-monster state, and the companions that leave a
// level with the hero.
// C refs: dog.c newedog(), initedog(), pet_type(), makedog(), mon_leave(),
// keep_mon_accessible(), keepdogs() and migrate_to_level(); mon.c relmon(),
// mon_leaving_level() and see_monster_closeup(); steed.c put_saddle_on_mon();
// do_name.c christen_monst().

import {
    A_CHA,
    BLINDED,
    HALLUC,
    HALLUC_RES,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_TYPMASK,
    MIGR_EXACT_XY,
    MON_MIGRATING,
    MM_EDOG,
    NO_MINVENT,
    STRAT_WAITFORU,
    TELEPAT,
    W_SADDLE,
    isok,
} from './const.js';
import {
    depth,
    ledger_no,
    ledger_to_dlev,
    ledger_to_dnum,
} from './dungeon.js';
import { newsym } from './display.js';
import { christen_monst } from './do_name.js';
import { UnsupportedHeroMoveBoundaryError } from './hack.js';
import { game } from './gstate.js';
import { add_to_minv, update_inventory } from './invent.js';
import { discover_object, observe_object } from './o_init.js';
import { set_malign } from './makemon.js';
import { makemon } from './makemon_create.js';
import { levl_follower } from './mondata.js';
import { monnear } from './monmove.js';
import { m_at, remove_monster } from './monst.js';
import {
    M1_AMORPHOUS,
    M1_HUMANOID,
    M1_UNSOLID,
    M2_DOMESTIC,
    MZ_MEDIUM,
    NON_PM,
    PM_AIR_ELEMENTAL,
    PM_BABY_GOLD_DRAGON,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_FIRE_ELEMENTAL,
    PM_FIRE_VORTEX,
    PM_FLAMING_SPHERE,
    PM_GOLD_DRAGON,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_PONY,
    PM_RANGER,
    PM_SAMURAI,
    PM_SHOCKING_SPHERE,
    S_LIGHT,
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
import {
    BOULDER,
    COIN_CLASS,
    EXPENSIVE_CAMERA,
    SADDLE,
} from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import {
    canSeeMonster,
    sensesMonster,
} from './startup_a11y.js';
import { effective_attribute } from './attrib.js';
import { vision_recalc } from './vision.js';
import { mon_has_amulet } from './wizard.js';

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
        edog.apport = effective_attribute(state, A_CHA);
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

// C callers set gb.bhitpos and derive gn.notonhead together before recording a
// monster observation. Keep those coupled writes at one JS ownership point.
function setMonsterObservationPosition(monster, observedAt, state) {
    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = observedAt.x;
    state.gb.bhitpos.y = observedAt.y;
    state.gn ??= {};
    state.gn.notonhead = observedAt.x !== monster.mx
        || observedAt.y !== monster.my;
    return state.gn.notonhead;
}

// C ref: mon.c see_monster_closeup(). When appearance handling resolves mndx to
// PM_LONG_WORM, `env.observedAt` owns the matching gb.bhitpos/gn.notonhead
// setup for the observed head or tail. Requiring that coordinate prevents
// stale global context from changing which vital is recorded. Startup monsters
// are undisguised; the representation below also handles the source's
// monster-appearance case.
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
                'see_monster_closeup requires observedAt when resolved as a '
                + 'long worm',
            );
        }
        if (setMonsterObservationPosition(monster, observedAt, state))
            mndx = PM_LONG_WORM_TAIL;
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
            setMonsterObservationPosition(monster, { x, y }, state);
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
        setMonsterObservationPosition(
            monster,
            { x: monster.mx, y: monster.my },
            state,
        );
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

function clearContainedNoCharge(container) {
    for (let obj = container.cobj; obj; obj = obj.nobj) {
        if (obj.oclass !== COIN_CLASS) obj.no_charge = false;
        if (obj.cobj) clearContainedNoCharge(obj);
    }
}

function monsterEmitsLight(monster) {
    const species = monster.data;
    return species?.mlet === S_LIGHT
        || species?.pmidx === PM_FLAMING_SPHERE
        || species?.pmidx === PM_SHOCKING_SPHERE
        || species?.pmidx === PM_BABY_GOLD_DRAGON
        || species?.pmidx === PM_FIRE_VORTEX
        || species?.pmidx === PM_FIRE_ELEMENTAL
        || species?.pmidx === PM_GOLD_DRAGON;
}

function migratingOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`migrate_to_level requires a ${name} operation`);
    return operation;
}

function levelMonsterPredecessor(monster, state) {
    let previous = null;
    for (let current = state.level.monlist;
        current && current !== monster;
        current = current.nmon) {
        previous = current;
    }
    const current = previous ? previous.nmon : state.level.monlist;
    if (current !== monster)
        throw new Error('migrate_to_level: monster is not on the level chain');
    return previous;
}

function floorBoulder(x, y, state) {
    for (let obj = state.level?.objects?.[x]?.[y] ?? null;
        obj;
        obj = obj.nexthere) {
        if (obj.otyp === BOULDER) return obj;
    }
    return null;
}

function sameLevel(left, right) {
    return Boolean(left && right
        && left.dnum === right.dnum
        && left.dlevel === right.dlevel);
}

// C ref: dog.c mon_leave() (725-762), the bookkeeping every monster gets as it
// leaves the level, shared by keepdogs() and migrate_to_level(). Returns C's
// num_segs, the tail-segment count a long worm carries while off the map.
//
// The minvent walk is C's `picked_container(obj)` plus `obj->no_charge = 0`:
// once a monster carries an object off the level, no shop can still be owed
// for it.
function mon_leave(monster, state) {
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.cobj) clearContainedNoCharge(obj);
        obj.no_charge = false;
    }
    if (monster.isshk) {
        // set_residency(mtmp, TRUE) clears the shop's resident field.
        throw new RangeError('shopkeeper level departure is future work');
    }
    if (monster.wormno)
        throw new RangeError('long-worm level departure is future work');
    return 0;
}

// C refs: mon.c relmon() (3396-3427) and mon_leaving_level() (3361-3395),
// which relmon() runs first. `listName` names the gm list the monster joins:
// 'mydogs' for keepdogs(), 'migrating_mons' for migrate_to_level().
//
// Every injected operation resolves before the first mutation, so a caller
// that omits one cannot leave the monster half off the map. C's `unstuck(mon)`
// and its mimic-unhiding seemimic() are handled by the callers' preconditions
// instead, which refuse a monster holding the hero or wearing a disguise.
function relmon(monster, listName, state, env) {
    const oldX = monster.mx;
    const oldY = monster.my;
    const previous = levelMonsterPredecessor(monster, state);
    const boulder = floorBoulder(oldX, oldY, state);
    const fillPit = boulder ? migratingOperation(env, 'fillPit') : null;
    const redraw = migratingOperation(env, 'newsym', newsym);

    monster.mtrapped = false;
    remove_monster(oldX, oldY, state);
    monster.mundetected = false;
    if (boulder) fillPit(oldX, oldY, boulder, env);
    redraw(oldX, oldY, state);

    if (previous) previous.nmon = monster.nmon;
    else state.level.monlist = monster.nmon;
    if (state.context?.polearm?.hitmon === monster)
        state.context.polearm.hitmon = null;
    state.gm ??= {};
    monster.nmon = state.gm[listName] ?? null;
    state.gm[listName] = monster;
}

// C ref: dog.c keep_mon_accessible() (765-785). A monster with level-specific
// data in mon->mextra joins the migrating list, where the game can still find
// it while the hero is elsewhere. Every other monster goes into the level's
// save file with the level.
function keep_mon_accessible(monster, state) {
    if (monster.iswiz) return true;
    const mextra = monster.mextra;
    if (mextra
        && ((monster.isshk && !sameLevel(state.u.uz, mextra.eshk?.shoplevel))
            || (monster.ispriest
                && !sameLevel(state.u.uz, mextra.epri?.shrlevel))
            || (monster.isgd && !sameLevel(state.u.uz, mextra.egd?.gdlevel))))
        return true;
    return false;
}

// C ref: dog.c keepdogs() (787-885), which do.c goto_level() calls once the
// level it is leaving has been stripped of context. Every monster next to the
// hero that follows her moves off this level's monster chain onto gm.mydogs;
// the levels the hero can still return to keep theirs through
// migrate_to_level().
//
// `pets_only` is TRUE only for an ascension or a final escape, which end.c
// drives and this port does not reach.
export function keepdogs(pets_only, rawEnv = {}) {
    const env = dogEnv(rawEnv);
    const { state } = env;
    const u = state.u;

    if (pets_only) {
        throw new UnsupportedHeroMoveBoundaryError(
            'keepdogs() collecting pets for an escape or ascension',
        );
    }

    let next = null;
    for (let mtmp = state.level.monlist; mtmp; mtmp = next) {
        next = mtmp.nmon;
        if (mtmp.mhp < 1) continue; /* DEADMONSTER() */

        const follows = (
            (monnear(mtmp, u.ux, u.uy, state) && levl_follower(mtmp, state))
            // The Wizard chases the Amulet from anywhere.
            || (u.uhave?.amulet && mtmp.iswiz))
            // monst.h:251 helpless().
            && (!(mtmp.msleeping || !mtmp.mcanmove) || mtmp === u.usteed)
            // A monster that has not noticed the hero stays put.
            && !(mtmp.mstrategy & STRAT_WAITFORU);

        if (follows) {
            if (mtmp.mtrapped) {
                // C gives a trapped follower one mintrap() escape attempt at
                // dog.c:815, then leaves it behind with "%s is still trapped."
                // if that fails. Both need mintrap()'s monster arm and
                // canseemon(), and a pet standing in a trap beside the stairs
                // is rare enough to defer.
                throw new UnsupportedHeroMoveBoundaryError(
                    'keepdogs() with a trapped follower',
                );
            }
            if (mtmp === u.usteed) {
                // mdrop_special_objs() and the dismount bookkeeping at
                // dog.c:817-821 belong with the steed work; apply.c
                // next_to_u() refuses a mounted hero before this runs.
                throw new UnsupportedHeroMoveBoundaryError(
                    'keepdogs() with the hero mounted',
                );
            }
            if (mtmp.meating) {
                // "%s is still eating." at dog.c:823-826, which leaves the
                // eater behind. It needs canseemon() and Monnam(), and pet
                // eating is not ported.
                throw new UnsupportedHeroMoveBoundaryError(
                    'keepdogs() with a follower that is still eating',
                );
            }
            if (mon_has_amulet(mtmp)) {
                throw new UnsupportedHeroMoveBoundaryError(
                    'keepdogs() with a follower carrying the Amulet',
                );
            }
            // stay_behind is FALSE for everything admitted above, so the
            // leash and steed cleanup at dog.c:836-849 cannot run.

            const num_segs = mon_leave(mtmp, state);
            relmon(mtmp, 'mydogs', state, env);
            mtmp.mx = 0; /* mx == 0 implies migrating */
            mtmp.my = 0;
            mtmp.wormno = num_segs;
            mtmp.mlstmv = state.moves;
        } else if (keep_mon_accessible(mtmp, state)) {
            migrate_to_level(
                mtmp,
                ledger_no(state.u.uz, state),
                MIGR_EXACT_XY,
                null,
                env,
            );
        } else if (mtmp.mleashed) {
            // "%s leash goes slack." and m_unleash() at dog.c:879-882. Nothing
            // in the port sets mleashed; see js/apply_next_to_u.js.
            throw new UnsupportedHeroMoveBoundaryError(
                'keepdogs() leaving a leashed monster behind',
            );
        }
    }
}

// C refs: dog.c mon_leave()/migrate_to_level() and mon.c relmon()/
// mon_leaving_level(), bounded to ordinary stable-level monsters.
export function migrate_to_level(
    monster,
    destinationLedger,
    destinationCode,
    coordinate,
    rawEnv = {},
) {
    const env = dogEnv(rawEnv);
    const { state } = env;
    const destination = {
        dnum: ledger_to_dnum(destinationLedger, state),
        dlevel: ledger_to_dlev(destinationLedger, state),
    };
    if (monster.mleashed)
        throw new RangeError('leashed monster migration is future work');
    if (monster.isshk)
        throw new RangeError('shopkeeper migration is future work');
    if (monster.wormno)
        throw new RangeError('long-worm migration is future work');
    const appearance = monster.m_ap_type & M_AP_TYPMASK;
    if (appearance !== M_AP_NOTHING && appearance !== M_AP_MONSTER)
        throw new RangeError('disguised monster migration is future work');
    if (monster === state.u.ustuck)
        throw new RangeError('stuck-monster migration is future work');
    const onWizardTowerLevel = [
        state.wiz1_level,
        state.wiz2_level,
        state.wiz3_level,
    ].some((level) => sameLevel(level, state.u.uz));
    const inWizardTower = onWizardTowerLevel
        ? migratingOperation(env, 'inWizardTower')
        : null;
    if (m_at(monster.mx, monster.my, state) !== monster)
        throw new Error('migrate_to_level: monster is not on the map');
    if (!Array.isArray(monster.mtrack)
        || monster.mtrack.length < 3
        || monster.mtrack.slice(0, 3).some((entry) => !entry)) {
        throw new TypeError('migrate_to_level requires monster track state');
    }
    if (coordinate
        && (!Number.isInteger(coordinate.x)
            || !Number.isInteger(coordinate.y))) {
        throw new TypeError(
            'migrate_to_level requires an integer destination coordinate',
        );
    }
    const oldX = monster.mx;
    const oldY = monster.my;
    const recalculateVision = monsterEmitsLight(monster)
        ? migratingOperation(env, 'visionRecalc', vision_recalc)
        : null;

    mon_leave(monster, state);
    relmon(monster, 'migrating_mons', state, env);
    monster.mstate |= MON_MIGRATING;

    let xyFlags = depth(destination, state) < depth(state.u.uz, state)
        ? 1
        : 0;
    if (inWizardTower
        && inWizardTower(oldX, oldY, state.u.uz, state)) {
        xyFlags |= 2;
    }
    monster.wormno = 0;
    monster.mlstmv = state.moves;
    monster.mtrack[2].x = state.u.uz.dnum;
    monster.mtrack[2].y = state.u.uz.dlevel;
    monster.mtrack[1].x = coordinate ? coordinate.x : oldX;
    monster.mtrack[1].y = coordinate ? coordinate.y : oldY;
    monster.mtrack[0].x = destinationCode;
    monster.mtrack[0].y = xyFlags;
    monster.mux = destination.dnum;
    monster.muy = destination.dlevel;
    monster.mx = 0;
    monster.my = 0;
    if (recalculateVision) recalculateVision(0);
    return monster;
}
