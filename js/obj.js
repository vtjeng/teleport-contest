// Object allocation, initialization, and weight.
// C refs: include/obj.h, src/mkobj.c mkobj(), mksobj(), and weight().

import {
    A_NONE,
    CORPSTAT_FEMALE,
    CORPSTAT_MALE,
    CORPSTAT_NEUTER,
    COST_DEGRD,
    FIRE_RES,
    G_GONE,
    HATCH_EGG,
    COLNO,
    LARGEST_INT,
    LOST_NONE,
    MAX_OIL_IN_FLASK,
    NON_PM,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_LUAFREE,
    OBJ_MINVENT,
    P_BOW,
    P_NONE,
    P_SHURIKEN,
    RANDOM_TIN,
    ROWNO,
    SPINACH_TIN,
    W_ARM,
} from './const.js';
import { ART_SUNSWORD } from './artifacts.js';
import { noveltitle } from './do_name.js';
import { depth, level_difficulty } from './dungeon.js';
import { set_tin_variety } from './eat.js';
import { game } from './gstate.js';
import { rndmonnum } from './makemon.js';
import {
    can_be_hatched,
    dead_species,
    is_female,
    is_male,
    is_neuter,
    undead_to_corpse,
} from './mondata.js';
import {
    pushRngLogEntry,
    rn1 as coreRn1,
    rn2 as coreRn2,
    rnd as coreRnd,
    rne as coreRne,
    rnz as coreRnz,
} from './rng.js';
import {
    attach_egg_hatch_timeout,
    attach_fig_transform_timeout,
    obj_stop_timers,
    start_corpse_timeout,
    start_glob_timeout,
    stop_timer,
} from './timeout.js';
import {
    AMULET_CLASS,
    AMULET_OF_CHANGE,
    AMULET_OF_RESTFUL_SLEEP,
    AMULET_OF_STRANGULATION,
    AMULET_OF_YENDOR,
    ARMOR_CLASS,
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    BALL_CLASS,
    BELL_OF_OPENING,
    BOULDER,
    BRASS_LANTERN,
    CANDELABRUM_OF_INVOCATION,
    CANDY_BAR,
    CAN_OF_GREASE,
    CHAIN_CLASS,
    CHEST,
    COIN_CLASS,
    CORPSE,
    CRYSKNIFE,
    CRYSTAL_BALL,
    COPPER,
    DRAGON_HIDE,
    DRUM_OF_EARTHQUAKE,
    EGG,
    ELVEN_SHIELD,
    EXPENSIVE_CAMERA,
    FIGURINE,
    FIRE_HORN,
    FOOD_CLASS,
    FROST_HORN,
    FUMBLE_BOOTS,
    GAUNTLETS_OF_FUMBLING,
    GEM_CLASS,
    GLOB_OF_BLACK_PUDDING,
    GLOB_OF_BROWN_PUDDING,
    GLOB_OF_GRAY_OOZE,
    GLOB_OF_GREEN_SLIME,
    GLASS,
    GOLD_PIECE,
    GOLD_DRAGON_SCALE_MAIL,
    GOLD_DRAGON_SCALES,
    HEAVY_IRON_BALL,
    HELM_OF_OPPOSITE_ALIGNMENT,
    HORN_OF_PLENTY,
    ICE_BOX,
    IRON,
    KELP_FROND,
    LARGE_BOX,
    LEASH,
    LEVITATION_BOOTS,
    LIQUID,
    LOADSTONE,
    LUCKSTONE,
    MAGIC_FLUTE,
    MAGIC_HARP,
    MAGIC_LAMP,
    MAGIC_MARKER,
    MEAT_RING,
    OILSKIN_SACK,
    OIL_LAMP,
    NODIR,
    ORCISH_SHIELD,
    PLASTIC,
    POTION_CLASS,
    POT_OIL,
    POT_WATER,
    RANDOM_CLASS,
    RING_CLASS,
    RIN_AGGRAVATE_MONSTER,
    RIN_HUNGER,
    RIN_POLYMORPH,
    RIN_TELEPORTATION,
    ROCK,
    ROCK_CLASS,
    SACK,
    SCROLL_CLASS,
    SCR_MAIL,
    SHIELD_OF_REFLECTION,
    SLIME_MOLD,
    SPE_BLANK_PAPER,
    SPE_NOVEL,
    SPBOOK_CLASS,
    SPLINT_MAIL,
    STATUE,
    TALLOW_CANDLE,
    TIN,
    TINNING_KIT,
    TOOL_CLASS,
    VENOM_CLASS,
    WAN_FIRE,
    WAN_STASIS,
    WAN_WISHING,
    WAND_CLASS,
    WAX_CANDLE,
    WEAPON_CLASS,
    WOOD,
    WORM_TOOTH,
    UNICORN_HORN,
} from './objects.js';
import {
    G_NOCORPSE,
    PM_GRAY_OOZE,
    PM_HUMAN,
} from './monsters.js';

export const SPBOOK_NO_NOVEL = -SPBOOK_CLASS;

const MKOBJ_PROBS = Object.freeze([
    [10, WEAPON_CLASS],
    [11, ARMOR_CLASS],
    [20, FOOD_CLASS],
    [8, TOOL_CLASS],
    [7, GEM_CLASS],
    [16, POTION_CLASS],
    [16, SCROLL_CLASS],
    [4, SPBOOK_CLASS],
    [4, WAND_CLASS],
    [3, RING_CLASS],
    [1, AMULET_CLASS],
]);

const ROGUE_PROBS = Object.freeze([
    [12, WEAPON_CLASS],
    [12, ARMOR_CLASS],
    [22, FOOD_CLASS],
    [22, POTION_CLASS],
    [22, SCROLL_CLASS],
    [5, WAND_CLASS],
    [5, RING_CLASS],
]);

const HELL_PROBS = Object.freeze([
    [20, WEAPON_CLASS],
    [20, ARMOR_CLASS],
    [16, FOOD_CLASS],
    [12, TOOL_CLASS],
    [10, GEM_CLASS],
    [1, POTION_CLASS],
    [1, SCROLL_CLASS],
    [8, WAND_CLASS],
    [8, RING_CLASS],
    [4, AMULET_CLASS],
]);

const DKNOWN_CLASSES = new Set([
    WAND_CLASS,
    RING_CLASS,
    POTION_CLASS,
    SCROLL_CLASS,
    GEM_CLASS,
    SPBOOK_CLASS,
    WEAPON_CLASS,
    TOOL_CLASS,
    VENOM_CLASS,
]);

export class UnsupportedObjectOperationError extends Error {
    constructor(operation, obj) {
        const type = obj && Number.isInteger(obj.otyp) ? ` for otyp ${obj.otyp}` : '';
        super(`${operation} is not available${type}`);
        this.name = 'UnsupportedObjectOperationError';
        this.operation = operation;
        this.otyp = obj?.otyp;
    }
}

// ObjectEnv hook contract. Predicates, lookups, and calculations must be pure;
// mutators run at the corresponding upstream call boundary. Missing hooks are
// fatal integration errors, not recoverable generation outcomes (earlier
// source-ordered RNG and id changes are intentionally retained).
//
//   monster(index, env) -> monster record
//   eatenStat(weight, obj, env) -> adjusted weight
//   artifactCount(env) -> existing artifact count
//   makeArtifact(obj, { alignment, maxGiftValue, adjustSpe, env }) -> obj
//   populateContainer(obj, count, env)
//   monsterObject(obj, 'initialize' | 'finalize', env) for the residual
//     STATUE and FIGURINE branches
//   isPermanentlyPoisoned(obj, env) -> boolean
//   stopObjectTimers(obj, env) -> must clear obj.timed and its timer queue
//   deleteObjectLightSource(obj, env) -> removes the remaining light source
//   costlyAlteration(obj, COST_DEGRD, env) -> applies shop billing before
//     an irreversible object degradation

function defineObjAliases(obj) {
    const aliases = {
        on_ice: 'recharged',
        orotten: 'oeroded',
        odiluted: 'oeroded',
        norevive: 'oeroded2',
        degraded_horn: 'obroken',
        opoisoned: 'otrapped',
        spestudied: 'usecount',
        wishedfor: 'usecount',
        leashmon: 'corpsenm',
        fromsink: 'corpsenm',
        novelidx: 'corpsenm',
        migr_species: 'corpsenm',
        next_boulder: 'corpsenm',
        nexthere: 'v',
        ocontainer: 'v',
        ocarry: 'v',
    };
    for (const [alias, source] of Object.entries(aliases)) {
        Object.defineProperty(obj, alias, {
            configurable: true,
            enumerable: false,
            get() { return this[source]; },
            set(value) { this[source] = value; },
        });
    }
    return obj;
}

// C ref: decl.c cg.zeroobj and include/obj.h struct obj. The three location
// names alias `v`, just as nexthere, ocontainer, and ocarry alias C's union.
// Source bitfield aliases such as `opoisoned` share backing fields too.
export function newObject(overrides = {}) {
    const obj = defineObjAliases({
        nobj: null,
        v: null,
        cobj: null,
        o_id: 0,
        ox: 0,
        oy: 0,
        otyp: 0,
        owt: 0,
        quan: 0,
        spe: 0,
        oclass: 0,
        invlet: '',
        oartifact: 0,
        where: OBJ_FREE,
        timed: 0,
        cursed: false,
        blessed: false,
        unpaid: false,
        no_charge: false,
        recharged: 0,
        lamplit: false,
        known: false,
        dknown: false,
        bknown: false,
        rknown: false,
        cknown: false,
        lknown: false,
        tknown: false,
        nomerge: false,
        oeroded: 0,
        oeroded2: 0,
        oerodeproof: false,
        olocked: false,
        obroken: false,
        otrapped: false,
        globby: false,
        greased: false,
        in_use: false,
        bypass: false,
        pickup_prev: false,
        ghostly: false,
        how_lost: LOST_NONE,
        named_how: false,
        corpsenm: 0,
        usecount: 0,
        oeaten: 0,
        age: 0,
        owornmask: 0,
        lua_ref_cnt: 0,
        omigr_from_dnum: 0,
        omigr_from_dlevel: 0,
        oextra: null,
    });
    Object.assign(obj, overrides);
    return obj;
}

function objectCatalog(state) {
    if (!Array.isArray(state?.objects))
        throw new Error('object catalog requires objects_globals_init()');
    return state.objects;
}

export function objectType(objOrType, state = game) {
    const otyp = typeof objOrType === 'number' ? objOrType : objOrType?.otyp;
    const type = objectCatalog(state)[otyp];
    if (!type)
        throw new RangeError(`invalid object type ${otyp}`);
    return type;
}

function sourceRandom(env) {
    const injected = env?.random;
    const state = env?.state ?? game;
    if (injected != null) {
        const names = ['rn2', 'rnd', 'rn1', 'rne'];
        if (!names.every((name) => typeof injected[name] === 'function')) {
            throw new TypeError(
                'random injection requires rn2, rnd, rn1, and rne',
            );
        }
        const random = Object.fromEntries(
            names.map((name) => [name, injected[name]]),
        );
        random.rnz = typeof injected.rnz === 'function'
            ? injected.rnz
            : (value) => {
                const scale = (1000 + random.rn2(1000)) * random.rne(4);
                return random.rn2(2)
                    ? Math.trunc(value * scale / 1000)
                    : Math.trunc(value * 1000 / scale);
            };
        return random;
    }

    const stateAwareRne = (bound) => {
        const level = Math.trunc(state.u?.ulevel ?? 1);
        const limit = level < 15 ? 5 : Math.trunc(level / 3);
        let result = 1;
        while (result < limit && !coreRn2(bound)) ++result;
        // coreRne logs this after its internal rn2 calls. Keep the same
        // recorder-visible identity when a non-global state supplies ulevel.
        pushRngLogEntry(`rne(${bound})=${result}`);
        return result;
    };
    const stateAwareRnz = (value) => {
        const scale = (1000 + coreRn2(1000)) * stateAwareRne(4);
        const result = coreRn2(2)
            ? Math.trunc(value * scale / 1000)
            : Math.trunc(value * 1000 / scale);
        pushRngLogEntry(`rnz(${value})=${result}`);
        return result;
    };
    return {
        rn2: coreRn2,
        rnd: coreRnd,
        rn1: coreRn1,
        rne: state === game ? coreRne : stateAwareRne,
        rnz: state === game ? coreRnz : stateAwareRnz,
    };
}

function objectEnv(env = {}) {
    const state = env.state ?? game;
    return {
        ...env,
        state,
        hooks: env.hooks ?? {},
        random: sourceRandom({ ...env, state }),
    };
}

function requiredHook(env, name, obj) {
    const hook = env.hooks?.[name];
    if (typeof hook !== 'function')
        throw new UnsupportedObjectOperationError(name, obj);
    return hook;
}

// C ref: mkobj.c next_ident(). Object and monster ids share context.ident.
export function next_ident(env = {}) {
    const normalized = objectEnv(env);
    const context = normalized.state.context;
    if (!context
        || !Number.isInteger(context.ident)
        || context.ident <= 0
        || context.ident > 0xffff_ffff) {
        throw new Error('next_ident requires initialized nonzero context.ident');
    }
    const result = context.ident >>> 0;
    context.ident = (result + normalized.random.rnd(2)) >>> 0;
    if (!context.ident)
        context.ident = (normalized.random.rnd(2) + 1) >>> 0;
    return result;
}

function lifecycleEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

// C refs: obj.h ignitable(), artifact.c artifact_light(), and
// light.c obj_sheds_light().
function objectShedsLight(obj) {
    if (!obj.lamplit) return false;
    const ignitable = obj.otyp === BRASS_LANTERN
        || obj.otyp === OIL_LAMP
        || (obj.otyp === MAGIC_LAMP && obj.spe > 0)
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === TALLOW_CANDLE
        || obj.otyp === WAX_CANDLE
        || obj.otyp === POT_OIL;
    const artifactLight = ((obj.otyp === GOLD_DRAGON_SCALE_MAIL
                            || obj.otyp === GOLD_DRAGON_SCALES)
                           && Boolean(obj.owornmask & W_ARM))
        || obj.oartifact === ART_SUNSWORD;
    return ignitable || artifactLight;
}

// C ref: mkobj.c dealloc_obj(). JS collapses C's deferred OBJ_DELETED queue
// into immediate oextra release; Lua-held objects retain oextra until their
// references are released. Lifecycle hooks are resolved at their source
// boundaries because timer cleanup determines whether a light remains.
export function dealloc_obj(obj, env = {}) {
    const normalized = lifecycleEnv(env);
    if (obj.otyp === BOULDER) obj.next_boulder = 0;
    if (obj.where !== OBJ_FREE && obj.where !== OBJ_LUAFREE) {
        throw new Error(
            `dealloc_obj: object where=${obj.where}, expected free`,
        );
    }
    if (obj.nobj || obj.cobj)
        throw new Error('dealloc_obj: object is still linked');

    if (obj.timed) {
        const stopTimers = requiredHook(
            normalized,
            'stopObjectTimers',
            obj,
        );
        stopTimers(obj, normalized);
        if (obj.timed)
            throw new Error('stopObjectTimers must clear obj.timed');
    }
    // A burn timer can own and remove the light source, so recheck after all
    // object timers have stopped, matching dealloc_obj()'s source order.
    if (objectShedsLight(obj)) {
        const deleteLight = requiredHook(
            normalized,
            'deleteObjectLightSource',
            obj,
        );
        deleteLight(obj, normalized);
        obj.lamplit = false;
    }

    if (normalized.state.thrownobj === obj) normalized.state.thrownobj = null;
    if (normalized.state.kickedobj === obj) normalized.state.kickedobj = null;
    if (normalized.state.gt?.thrownobj === obj)
        normalized.state.gt.thrownobj = null;
    if (normalized.state.gk?.kickedobj === obj)
        normalized.state.gk.kickedobj = null;
    if (normalized.state.context?.tin?.tin === obj) {
        normalized.state.context.tin.tin = null;
        normalized.state.context.tin.o_id = 0;
    }
    const split = normalized.state.context?.objsplit;
    if (split
        && (split.parent_oid === obj.o_id || split.child_oid === obj.o_id)) {
        split.parent_oid = 0;
        split.child_oid = 0;
    }

    if (obj.lua_ref_cnt) {
        obj.where = OBJ_LUAFREE;
        return obj;
    }
    obj.nobj = null;
    obj.nexthere = null;
    obj.oextra = null;
    obj.where = OBJ_DELETED;
    return obj;
}

export function isPudding(obj) {
    return obj.otyp === GLOB_OF_GRAY_OOZE
        || obj.otyp === GLOB_OF_BROWN_PUDDING
        || obj.otyp === GLOB_OF_GREEN_SLIME
        || obj.otyp === GLOB_OF_BLACK_PUDDING;
}

export function isContainer(obj) {
    return obj.otyp >= LARGE_BOX && obj.otyp <= BAG_OF_TRICKS;
}

export function isCandle(obj) {
    return obj.otyp === TALLOW_CANDLE || obj.otyp === WAX_CANDLE;
}

export function isWeptool(obj, state = game) {
    return obj.oclass === TOOL_CLASS && objectType(obj, state).oc_subtyp !== P_NONE;
}

export function isMultigen(obj, state = game) {
    const skill = objectType(obj, state).oc_subtyp;
    return obj.oclass === WEAPON_CLASS
        && skill >= -P_SHURIKEN
        && skill <= -P_BOW;
}

export function erosionMatters(obj, state = game) {
    return obj.oclass === WEAPON_CLASS
        || obj.oclass === ARMOR_CLASS
        || obj.oclass === BALL_CLASS
        || obj.oclass === CHAIN_CLASS
        || (obj.oclass === TOOL_CLASS && isWeptool(obj, state));
}

function isFlammable(obj, state) {
    const type = objectType(obj, state);
    if (isCandle(obj)) return false;
    if (type.oc_oprop === FIRE_RES || obj.otyp === WAN_FIRE) return false;
    return (type.oc_material <= WOOD && type.oc_material !== LIQUID)
        || type.oc_material === PLASTIC;
}

function isRottable(obj, state) {
    const material = objectType(obj, state).oc_material;
    return (material <= WOOD && material !== LIQUID)
        || material === DRAGON_HIDE;
}

function isRustprone(obj, state) {
    return objectType(obj, state).oc_material === IRON;
}

function isCorrodeable(obj, state) {
    const material = objectType(obj, state).oc_material;
    return material === COPPER || material === IRON;
}

function isCrackable(obj, state) {
    return objectType(obj, state).oc_material === GLASS
        && obj.oclass === ARMOR_CLASS;
}

function isDamageable(obj, state) {
    return isRustprone(obj, state)
        || isFlammable(obj, state)
        || isRottable(obj, state)
        || isCorrodeable(obj, state)
        || isCrackable(obj, state);
}

// C ref: mkobj.c clear_dknown() and unknow_object().
export function clear_dknown(obj, state = game) {
    const type = objectType(obj, state);
    obj.dknown = !DKNOWN_CLASSES.has(obj.oclass);
    if ((obj.otyp >= ELVEN_SHIELD && obj.otyp <= ORCISH_SHIELD)
        || obj.otyp === SHIELD_OF_REFLECTION
        || type.oc_merge) {
        obj.dknown = false;
    }
    if (isPudding(obj)) obj.dknown = true;
    return obj;
}

export function unknow_object(obj, state = game) {
    const type = objectType(obj, state);
    clear_dknown(obj, state);
    obj.bknown = false;
    obj.rknown = false;
    obj.cknown = false;
    obj.lknown = false;
    obj.tknown = false;
    obj.known = !type.oc_uses_known;
    return obj;
}

function assertStartupBucObject(obj, operation) {
    if (obj.where !== OBJ_FREE
        || obj.lamplit
        || obj.otyp === BAG_OF_HOLDING
        || (obj.otyp === FIGURINE && obj.timed)) {
        throw new UnsupportedObjectOperationError(operation, obj);
    }
}

function bless(obj) {
    if (obj.oclass === COIN_CLASS) return obj;
    assertStartupBucObject(obj, 'bless outside object initialization');
    obj.cursed = false;
    obj.blessed = true;
    return obj;
}

function curse(obj) {
    if (obj.oclass === COIN_CLASS) return obj;
    assertStartupBucObject(obj, 'curse outside object initialization');
    obj.blessed = false;
    obj.cursed = true;
    return obj;
}

// Narrow cross-module helper for free startup objects such as a loadstone
// just removed from inventory. General gameplay BUC changes need the full
// luck, equipment, timer, light, and weight side effects from mkobj.c.
export function curseFreeObject(obj) {
    return curse(obj);
}

export function bcsign(obj) {
    return Number(Boolean(obj.blessed)) - Number(Boolean(obj.cursed));
}

// C ref: mkobj.c blessorcurse(). The first draw decides whether BUC changes;
// the second draw only occurs when the first succeeds. This exported subset is
// restricted to free startup objects; gameplay BUC changes need full effects.
export function blessorcurse(obj, chance, env = {}) {
    const random = objectEnv(env).random;
    if (obj.blessed || obj.cursed) return obj;
    assertStartupBucObject(obj, 'blessorcurse outside object initialization');
    if (!random.rn2(chance)) {
        if (!random.rn2(2)) curse(obj);
        else bless(obj);
    }
    return obj;
}

function monsterRecord(obj, env) {
    const lookup = env.hooks?.monster
        ?? ((index) => env.state.mons?.[index]);
    const monster = lookup(obj.corpsenm, env);
    if (!monster)
        throw new UnsupportedObjectOperationError('monster weight lookup', obj);
    return monster;
}

// C ref: mkobj.c weight(). Monster-dependent food/statue calculations use a
// narrow lookup seam until the monster catalog is ported; ordinary startup
// objects, coins, and nested containers are complete here.
export function weight(obj, env = {}) {
    const normalized = objectEnv(env);
    const { state } = normalized;
    const type = objectType(obj, state);
    let wt = Math.trunc(type.oc_weight);

    if (obj.quan < 1)
        throw new RangeError(`weight: quantity ${obj.quan} for otyp ${obj.otyp}`);
    if (obj.globby) return Math.trunc(obj.owt);

    if (isContainer(obj) || obj.otyp === STATUE) {
        if (obj.otyp === STATUE && obj.corpsenm !== NON_PM) {
            const monster = monsterRecord(obj, normalized);
            const size = Math.trunc(monster.msize);
            const minimum = (size + size + 1) * 100;
            wt = Math.trunc(3 * Math.trunc(monster.cwt) / 2);
            if (wt < minimum) wt = minimum;
            wt *= Math.trunc(obj.quan);
        }

        let contentsWeight = 0;
        for (let contents = obj.cobj; contents; contents = contents.nobj)
            contentsWeight += weight(contents, normalized);
        if (obj.otyp === BAG_OF_HOLDING) {
            contentsWeight = obj.cursed
                ? contentsWeight * 2
                : obj.blessed
                    ? Math.trunc((contentsWeight + 3) / 4)
                    : Math.trunc((contentsWeight + 1) / 2);
        }
        return wt + contentsWeight;
    }

    if (obj.otyp === CORPSE && obj.corpsenm !== NON_PM) {
        const monster = monsterRecord(obj, normalized);
        wt = Math.min(obj.quan * Math.trunc(monster.cwt), LARGEST_INT);
        if (obj.oeaten) {
            const eatenStat = requiredHook(normalized, 'eatenStat', obj);
            wt = eatenStat(wt, obj, normalized);
        }
        return Math.trunc(wt);
    }
    if (obj.oclass === FOOD_CLASS && obj.oeaten) {
        const eatenStat = requiredHook(normalized, 'eatenStat', obj);
        return Math.trunc(eatenStat(obj.quan * wt, obj, normalized));
    }
    if (obj.oclass === COIN_CLASS)
        return Math.max(Math.trunc((obj.quan + 50) / 100), 1);
    if (obj.otyp === HEAVY_IRON_BALL && obj.owt)
        return Math.trunc(obj.owt);
    if (obj.otyp === CANDELABRUM_OF_INVOCATION && obj.spe)
        return wt + obj.spe * objectType(TALLOW_CANDLE, state).oc_weight;
    return wt ? wt * Math.trunc(obj.quan) : Math.trunc((obj.quan + 1) / 2);
}

// Validate integration dependencies which weight() would reach, without
// applying an eaten-stat calculation. Callers use this before mutations that
// would be difficult to roll back if a monster or food seam is unavailable.
export function preflightWeight(obj, env = {}) {
    const normalized = objectEnv(env);
    objectType(obj, normalized.state);
    if (obj.quan < 1)
        throw new RangeError(`weight: quantity ${obj.quan} for otyp ${obj.otyp}`);
    if (obj.globby) return;

    if (isContainer(obj) || obj.otyp === STATUE) {
        if (obj.otyp === STATUE && obj.corpsenm !== NON_PM)
            monsterRecord(obj, normalized);
        for (let contents = obj.cobj; contents; contents = contents.nobj)
            preflightWeight(contents, normalized);
        return;
    }
    if (obj.otyp === CORPSE && obj.corpsenm !== NON_PM) {
        monsterRecord(obj, normalized);
        if (obj.oeaten) requiredHook(normalized, 'eatenStat', obj);
    } else if (obj.oclass === FOOD_CLASS && obj.oeaten) {
        requiredHook(normalized, 'eatenStat', obj);
    }
}

function isInitialInventoryPhase(state) {
    return Math.trunc(state.moves ?? 0) <= 1 && !state.in_mklev;
}

function sameLevel(left, right) {
    return Boolean(left && right
        && left.dnum === right.dnum
        && left.dlevel === right.dlevel);
}

function inQuest(state) {
    const dnum = state.u?.uz?.dnum;
    return Number.isInteger(dnum) && dnum === state.quest_dnum;
}

function isRogueLevel(state) {
    return sameLevel(state.u?.uz, state.rogue_level);
}

function inHell(state) {
    const dnum = state.u?.uz?.dnum;
    return Number.isInteger(dnum)
        && Boolean(state.dungeons?.[dnum]?.flags?.hellish);
}

function initializeErosion(obj, env) {
    if (isInitialInventoryPhase(env.state)
        || obj.oerodeproof
        || !erosionMatters(obj, env.state)
        || !isDamageable(obj, env.state)
        || obj.oartifact) {
        return;
    }
    if (obj.otyp === WORM_TOOTH || obj.otyp === UNICORN_HORN) return;

    if (!env.random.rn2(100)) {
        obj.oerodeproof = true;
    } else {
        if (!env.random.rn2(80)
            && (isFlammable(obj, env.state)
                || isRustprone(obj, env.state)
                || isCrackable(obj, env.state))) {
            do {
                ++obj.oeroded;
            } while (obj.oeroded < 3 && !env.random.rn2(9));
        }
        if (!env.random.rn2(80)
            && (isRottable(obj, env.state)
                || isCorrodeable(obj, env.state))) {
            do {
                ++obj.oeroded2;
            } while (obj.oeroded2 < 3 && !env.random.rn2(9));
        }
    }
    if (!env.random.rn2(1000)) obj.greased = true;
}

function makeArtifact(obj, env, adjustSpe) {
    const result = requiredHook(env, 'makeArtifact', obj)(obj, {
        adjustSpe,
        alignment: A_NONE,
        maxGiftValue: 99,
        env,
    });
    if (!result)
        throw new UnsupportedObjectOperationError('makeArtifact returned no object', obj);
    return result;
}

function maybeGenerateArtifact(obj, artif, divisorBase, env) {
    if (!artif) return obj;
    const artifactCount = requiredHook(env, 'artifactCount', obj)(env);
    if (!env.random.rn2(divisorBase + 10 * artifactCount))
        return makeArtifact(obj, env, true);
    return obj;
}

function initializeContainer(obj, env) {
    let maximum;
    switch (obj.otyp) {
    case ICE_BOX:
        maximum = 20;
        break;
    case CHEST:
        maximum = obj.olocked ? 7 : 5;
        break;
    case LARGE_BOX:
        maximum = obj.olocked ? 5 : 3;
        break;
    case SACK:
    case OILSKIN_SACK:
        maximum = isInitialInventoryPhase(env.state) ? 0 : 1;
        break;
    case BAG_OF_HOLDING:
        maximum = 1;
        break;
    default:
        maximum = 0;
        break;
    }

    // C calls rn2(n + 1) even when n is zero. Keeping that draw is required
    // for sacks in initial inventory.
    const count = env.random.rn2(maximum + 1);
    if (count)
        requiredHook(env, 'populateContainer', obj)(obj, count, env);
}

function initializeResidualMonsterObject(obj, phase, env) {
    return requiredHook(env, 'monsterObject')(obj, phase, env);
}

function monsterVital(state, mnum) {
    const vital = state.svm?.mvitals?.[mnum] ?? state.mvitals?.[mnum];
    if (!vital || !Number.isInteger(vital.mvflags))
        throw new Error('monster object creation requires initialized mvitals');
    return vital;
}

function initializeCorpse(obj, env) {
    let attempts = 50;
    do {
        obj.corpsenm = undead_to_corpse(rndmonnum(env));
    } while ((monsterVital(env.state, obj.corpsenm).mvflags & G_NOCORPSE)
             && --attempts > 0);
    if (!attempts) obj.corpsenm = PM_HUMAN;
}

function initializeEgg(obj, env) {
    obj.corpsenm = NON_PM;
    if (!env.random.rn2(3)) {
        for (let attempts = 200; attempts > 0; --attempts) {
            const mnum = can_be_hatched(rndmonnum(env), env);
            if (mnum !== NON_PM && !dead_species(mnum, true, env)) {
                obj.corpsenm = mnum;
                break;
            }
        }
    }
}

function initializeTin(obj, env) {
    obj.corpsenm = NON_PM;
    if (!env.random.rn2(6)) {
        set_tin_variety(obj, SPINACH_TIN, env);
    } else {
        for (let attempts = 200; attempts > 0; --attempts) {
            const mnum = undead_to_corpse(rndmonnum(env));
            if (env.state.mons[mnum].cnutrit
                && !(monsterVital(env.state, mnum).mvflags & G_NOCORPSE)) {
                obj.corpsenm = mnum;
                set_tin_variety(obj, RANDOM_TIN, env);
                break;
            }
        }
    }
    blessorcurse(obj, 10, env);
}

function initializeMonsterFood(obj, env) {
    switch (obj.otyp) {
    case CORPSE:
        initializeCorpse(obj, env);
        break;
    case EGG:
        initializeEgg(obj, env);
        break;
    case TIN:
        initializeTin(obj, env);
        break;
    default:
        throw new RangeError(`unsupported monster food ${obj.otyp}`);
    }
}

// C ref: mkobj.c set_corpsenm().
export function set_corpsenm(obj, id, env = {}) {
    const normalized = objectEnv(env);
    const { state } = normalized;
    const oldId = obj.corpsenm;
    let when = 0;
    if (obj.timed) {
        if (obj.otyp === EGG)
            when = stop_timer(HATCH_EGG, obj, state);
        else
            obj_stop_timers(obj, state);
    }

    if (obj.otyp === CORPSE && obj.oeaten) {
        const oldNutrition = state.mons[oldId].cnutrit;
        const newNutrition = state.mons[id].cnutrit;
        if (oldNutrition !== newNutrition) {
            obj.oeaten = Math.trunc(
                obj.oeaten * newNutrition / oldNutrition,
            );
        }
    }

    obj.corpsenm = id;
    switch (obj.otyp) {
    case CORPSE:
        start_corpse_timeout(obj, normalized);
        obj.owt = weight(obj, normalized);
        break;
    case FIGURINE:
        if (obj.corpsenm !== NON_PM
            && !dead_species(obj.corpsenm, true, normalized)
            && (obj.where === OBJ_INVENT || obj.where === OBJ_MINVENT)) {
            attach_fig_transform_timeout(obj, normalized);
        }
        obj.owt = weight(obj, normalized);
        break;
    case EGG:
        if (obj.corpsenm !== NON_PM
            && !dead_species(obj.corpsenm, true, normalized)) {
            attach_egg_hatch_timeout(obj, when, normalized);
        }
        break;
    default:
        obj.owt = weight(obj, normalized);
        break;
    }
}

function finalizeCorpse(obj, env) {
    if (obj.corpsenm === NON_PM) {
        obj.corpsenm = undead_to_corpse(rndmonnum(env));
        if (monsterVital(env.state, obj.corpsenm).mvflags
            & (G_NOCORPSE | G_GONE)) {
            obj.corpsenm = env.state.urole.mnum;
        }
    }
    const monster = env.state.mons[obj.corpsenm];
    obj.spe = is_neuter(monster) ? CORPSTAT_NEUTER
        : is_female(monster) ? CORPSTAT_FEMALE
            : is_male(monster) ? CORPSTAT_MALE
                : env.random.rn2(2) ? CORPSTAT_FEMALE : CORPSTAT_MALE;
    set_corpsenm(obj, obj.corpsenm, env);
}

function currentFruit(state, obj) {
    const fruit = state.context?.current_fruit;
    if (!Number.isInteger(fruit))
        throw new UnsupportedObjectOperationError('current fruit initialization', obj);
    return fruit;
}

// C ref: mkobj.c mksobj_init(). Implemented branches stay local; artifacts,
// nonempty containers, statues, and figurines enter explicit subsystem seams
// rather than consuming guessed RNG.
function mksobj_init(obj, artif = false, env = {}) {
    let normalized = objectEnv(env);
    const { random, state } = normalized;
    const type = objectType(obj, state);

    switch (type.oc_class) {
    case WEAPON_CLASS:
        obj.quan = isMultigen(obj, state) ? random.rn1(6, 6) : 1;
        if (!random.rn2(11)) {
            obj.spe = random.rne(3);
            obj.blessed = Boolean(random.rn2(2));
        } else if (!random.rn2(10)) {
            curse(obj);
            obj.spe = -random.rne(3);
        } else {
            blessorcurse(obj, 10, normalized);
        }
        if (isMultigen(obj, state) && !random.rn2(100))
            obj.opoisoned = true;
        obj = maybeGenerateArtifact(obj, artif, 20, normalized);
        break;

    case FOOD_CLASS:
        obj.oeaten = 0;
        switch (obj.otyp) {
        case CORPSE:
        case EGG:
        case TIN:
            initializeMonsterFood(obj, normalized);
            break;
        case SLIME_MOLD:
            obj.spe = currentFruit(state, obj);
            state.flags ??= {};
            state.flags.made_fruit = true;
            break;
        case KELP_FROND:
            obj.quan = random.rnd(2);
            break;
        case CANDY_BAR:
            // read.c candy_wrappers has twelve nonempty entries.
            obj.spe = 1 + random.rn2(12);
            break;
        default:
            break;
        }
        if (isPudding(obj)) {
            obj.globby = true;
            obj.quan = 1;
            obj.owt = type.oc_weight;
            obj.known = true;
            obj.dknown = true;
            obj.corpsenm = PM_GRAY_OOZE
                + (obj.otyp - GLOB_OF_GRAY_OOZE);
            start_glob_timeout(obj, 0, normalized);
        } else if (obj.otyp !== CORPSE
                   && obj.otyp !== MEAT_RING
                   && obj.otyp !== KELP_FROND
                   && !random.rn2(6)) {
            obj.quan = 2;
        }
        break;

    case GEM_CLASS:
        obj.corpsenm = 0;
        if (obj.otyp === LOADSTONE) {
            curse(obj);
        } else if (obj.otyp === ROCK) {
            obj.quan = random.rn1(6, 6);
        } else if (obj.otyp !== LUCKSTONE && !random.rn2(6)) {
            obj.quan = 2;
        } else {
            obj.quan = 1;
        }
        break;

    case TOOL_CLASS:
        switch (obj.otyp) {
        case TALLOW_CANDLE:
        case WAX_CANDLE:
            obj.spe = 1;
            obj.age = 20 * type.oc_cost;
            obj.lamplit = false;
            obj.quan = 1 + (random.rn2(2) ? random.rn2(7) : 0);
            blessorcurse(obj, 5, normalized);
            break;
        case BRASS_LANTERN:
        case OIL_LAMP:
            obj.spe = 1;
            obj.age = random.rn1(500, 1000);
            obj.lamplit = false;
            blessorcurse(obj, 5, normalized);
            break;
        case MAGIC_LAMP:
            obj.spe = 1;
            obj.lamplit = false;
            blessorcurse(obj, 2, normalized);
            break;
        case CHEST:
        case LARGE_BOX:
            obj.olocked = Boolean(random.rn2(5));
            obj.otrapped = !random.rn2(10);
            obj.tknown = obj.otrapped && !random.rn2(100);
            initializeContainer(obj, normalized);
            break;
        case ICE_BOX:
        case SACK:
        case OILSKIN_SACK:
        case BAG_OF_HOLDING:
            initializeContainer(obj, normalized);
            break;
        case EXPENSIVE_CAMERA:
        case TINNING_KIT:
        case MAGIC_MARKER:
            obj.spe = random.rn1(70, 30);
            break;
        case CAN_OF_GREASE:
            obj.spe = random.rn1(21, 5);
            blessorcurse(obj, 10, normalized);
            break;
        case CRYSTAL_BALL:
            obj.spe = random.rn1(5, 3);
            blessorcurse(obj, 2, normalized);
            break;
        case HORN_OF_PLENTY:
        case BAG_OF_TRICKS:
            obj.spe = random.rn1(18, 3);
            break;
        case FIGURINE:
            initializeResidualMonsterObject(obj, 'initialize', normalized);
            blessorcurse(obj, 4, normalized);
            break;
        case BELL_OF_OPENING:
            obj.spe = 3;
            break;
        case MAGIC_FLUTE:
        case MAGIC_HARP:
        case FROST_HORN:
        case FIRE_HORN:
        case DRUM_OF_EARTHQUAKE:
            obj.spe = random.rn1(5, 4);
            break;
        default:
            break;
        }
        break;

    case AMULET_CLASS:
        if (obj.otyp === AMULET_OF_YENDOR) {
            state.context ??= {};
            state.context.made_amulet = true;
        }
        if (random.rn2(10)
            && (obj.otyp === AMULET_OF_STRANGULATION
                || obj.otyp === AMULET_OF_CHANGE
                || obj.otyp === AMULET_OF_RESTFUL_SLEEP)) {
            curse(obj);
        } else {
            blessorcurse(obj, 10, normalized);
        }
        break;

    case VENOM_CLASS:
    case CHAIN_CLASS:
    case BALL_CLASS:
    case COIN_CLASS:
        break;

    case POTION_CLASS:
    case SCROLL_CLASS:
        // MAIL_STRUCTURES is unconditional in NetHack 5.0 global.h.
        if (obj.otyp !== SCR_MAIL)
            blessorcurse(obj, 4, normalized);
        break;

    case SPBOOK_CLASS:
        obj.usecount = 0;
        blessorcurse(obj, 17, normalized);
        break;

    case ARMOR_CLASS:
        if (random.rn2(10)
            && (obj.otyp === FUMBLE_BOOTS
                || obj.otyp === LEVITATION_BOOTS
                || obj.otyp === HELM_OF_OPPOSITE_ALIGNMENT
                || obj.otyp === GAUNTLETS_OF_FUMBLING
                || !random.rn2(11))) {
            curse(obj);
            obj.spe = -random.rne(3);
        } else if (!random.rn2(10)) {
            obj.blessed = Boolean(random.rn2(2));
            obj.spe = random.rne(3);
        } else {
            blessorcurse(obj, 10, normalized);
        }
        obj = maybeGenerateArtifact(obj, artif, 40, normalized);
        if (state.urole?.filecode === 'Sam'
            && obj.otyp === SPLINT_MAIL
            && (Math.trunc(state.moves ?? 0) <= 1 || inQuest(state))) {
            obj.oerodeproof = true;
            obj.rknown = true;
        }
        break;

    case WAND_CLASS:
        if (obj.otyp === WAN_WISHING)
            obj.spe = 1;
        else if (obj.otyp === WAN_STASIS)
            obj.spe = random.rn1(4, 3);
        else
            obj.spe = random.rn1(5, type.oc_dir === NODIR ? 11 : 4);
        blessorcurse(obj, 17, normalized);
        obj.recharged = 0;
        break;

    case RING_CLASS:
        if (type.oc_charged) {
            blessorcurse(obj, 3, normalized);
            if (random.rn2(10)) {
                if (random.rn2(10) && bcsign(obj))
                    obj.spe = bcsign(obj) * random.rne(3);
                else
                    obj.spe = random.rn2(2) ? random.rne(3) : -random.rne(3);
            }
            if (!obj.spe)
                obj.spe = random.rn2(4) - random.rn2(3);
            if (obj.spe < 0 && random.rn2(5))
                curse(obj);
        } else if (random.rn2(10)
                   && (obj.otyp === RIN_TELEPORTATION
                       || obj.otyp === RIN_POLYMORPH
                       || obj.otyp === RIN_AGGRAVATE_MONSTER
                       || obj.otyp === RIN_HUNGER
                       || !random.rn2(9))) {
            curse(obj);
        }
        break;

    case ROCK_CLASS:
        if (obj.otyp === STATUE)
            initializeResidualMonsterObject(obj, 'initialize', normalized);
        break;

    default:
        throw new RangeError(
            `mksobj_init: unsupported class ${type.oc_class} for otyp ${obj.otyp}`,
        );
    }

    initializeErosion(obj, normalized);
    if (obj.oartifact) {
        const poisoned = requiredHook(normalized, 'isPermanentlyPoisoned', obj)(
            obj,
            normalized,
        );
        if (poisoned) obj.opoisoned = true;
    }
    return obj;
}

// C ref: mkobj.c mksobj().
export function mksobj(otyp, init = true, artif = false, env = {}) {
    const normalized = objectEnv(env);
    const type = objectType(otyp, normalized.state);
    let obj = newObject({
        age: Math.max(Math.trunc(normalized.state.moves ?? 0), 1),
        o_id: next_ident(normalized),
        quan: 1,
        oclass: type.oc_class,
        otyp,
        where: OBJ_FREE,
        corpsenm: NON_PM,
        lua_ref_cnt: 0,
        pickup_prev: false,
    });
    unknow_object(obj, normalized.state);

    if (init)
        obj = mksobj_init(obj, artif, normalized);

    // The source deliberately routes every non-oil potion through the
    // POT_WATER finalization case so the fromsink/corpsenm union becomes 0.
    const finalType = obj.oclass === POTION_CLASS && obj.otyp !== POT_OIL
        ? POT_WATER
        : obj.otyp;
    switch (finalType) {
    case STATUE:
    case FIGURINE:
        initializeResidualMonsterObject(obj, 'finalize', normalized);
        break;
    case CORPSE:
        finalizeCorpse(obj, normalized);
        break;
    case EGG:
        set_corpsenm(obj, obj.corpsenm, normalized);
        break;
    case BOULDER:
        obj.next_boulder = 0;
        break;
    case POT_OIL:
        obj.age = MAX_OIL_IN_FLASK;
        obj.fromsink = 0;
        break;
    case POT_WATER:
        obj.fromsink = 0;
        break;
    case LEASH:
        obj.leashmon = 0;
        break;
    case SPE_NOVEL: {
        obj.novelidx = -1;
        const named = noveltitle(obj.novelidx, normalized);
        obj.novelidx = named.novelidx;
        obj.oextra ??= {};
        obj.oextra.oname = named.title;
        break;
    }
    default:
        break;
    }

    if (type.oc_unique && !obj.oartifact)
        obj = makeArtifact(obj, normalized, false);
    obj.owt = weight(obj, normalized);
    return obj;
}

export function rnd_class(first, last, env = {}) {
    const normalized = objectEnv(env);
    const catalog = objectCatalog(normalized.state);
    if (last > first) {
        let sum = 0;
        for (let index = first; index <= last; ++index)
            sum += catalog[index].oc_prob;
        if (!sum)
            return normalized.random.rn1(last - first + 1, first);

        let choice = normalized.random.rnd(sum);
        for (let index = first; index <= last; ++index) {
            choice -= catalog[index].oc_prob;
            if (choice <= 0) return index;
        }
    }
    return first === last ? first : 0;
}

function randomObjectClass(env) {
    const probabilities = isRogueLevel(env.state)
        ? ROGUE_PROBS
        : inHell(env.state)
            ? HELL_PROBS
            : MKOBJ_PROBS;
    let choice = env.random.rnd(100);
    for (const [probability, objectClass] of probabilities) {
        choice -= probability;
        if (choice <= 0) return objectClass;
    }
    throw new RangeError('mkobj: random class probabilities did not total 100');
}

// C ref: mkobj.c mkobj(). init_objects() must already have populated bases
// and probability totals; failing that precondition is preferable to silently
// drawing from the unshuffled generated templates.
export function mkobj(oclass, artif = false, env = {}) {
    const normalized = objectEnv(env);
    const { state, random } = normalized;
    const catalog = objectCatalog(state);
    const bases = state.svb?.bases;
    const totals = state.go?.oclass_prob_totals;
    if (!Array.isArray(bases) || !Array.isArray(totals))
        throw new Error('mkobj requires init_objects()');

    if (oclass === RANDOM_CLASS)
        oclass = randomObjectClass(normalized);

    let otyp;
    if (oclass === SPBOOK_NO_NOVEL) {
        otyp = rnd_class(bases[SPBOOK_CLASS], SPE_BLANK_PAPER, normalized);
        oclass = SPBOOK_CLASS;
    } else {
        let probability = random.rnd(totals[oclass]);
        otyp = bases[oclass];
        while ((probability -= catalog[otyp].oc_prob) > 0)
            ++otyp;
    }

    if (catalog[otyp]?.oc_class !== oclass)
        throw new Error(`mkobj: probability table selected ${otyp} for class ${oclass}`);
    return mksobj(otyp, true, artif, normalized);
}

function floorObjectGrid(state) {
    const grid = state.level?.objects;
    if (!Array.isArray(grid)
        || grid.length !== COLNO
        || !grid.every((column) => Array.isArray(column)
            && column.length === ROWNO)) {
        throw new Error('floor object operations require a GameMap object grid');
    }
    return grid;
}

// C ref: mkobj.c costly_alteration(). The full shop-location calculation is
// not ported here. Its source fast path proves that an unbilled free or
// inventory object has no shop consequence; every other case needs the hook
// so a potentially owed side effect cannot be silently discarded.
function costlyAlteration(obj, alterType, env) {
    if ((obj.where === OBJ_FREE || obj.where === OBJ_INVENT) && !obj.unpaid)
        return;
    requiredHook(env, 'costlyAlteration', obj)(obj, alterType, env);
}

// C ref: do.c obj_no_longer_held(). Contents are released before their
// container, and erosion-proof crysknives alone consume the rn2(10) draw.
export function obj_no_longer_held(obj, env = {}) {
    const normalized = lifecycleEnv(env);
    const { state } = normalized;
    let random;

    const release = (current) => {
        if (!current) return;

        for (let contents = current.cobj; contents; contents = contents.nobj)
            release(contents);

        if (current.otyp !== CRYSKNIFE) return;
        if (current.oerodeproof) {
            random ??= sourceRandom(normalized);
            if (random.rn2(10)) return;
        }

        if (!state.context?.mon_moving && !state.program_state?.gameover)
            costlyAlteration(current, COST_DEGRD, normalized);
        current.otyp = WORM_TOOTH;
        current.oerodeproof = false;
    };

    release(obj);
}

// C ref: mkobj.c place_object(). This owns the two source floor indexes: the
// per-square nexthere pile and the level-wide nobj chain. New non-boulders go
// below consecutive boulders so the pile head remains the displayed boulder.
export function place_object(obj, x, y, env = {}) {
    const normalized = lifecycleEnv(env);
    const { state } = normalized;
    if (!Number.isInteger(x) || !Number.isInteger(y)
        || x < 0 || x >= COLNO || y < 0 || y >= ROWNO) {
        throw new RangeError(`place_object: off-map location <${x},${y}>`);
    }
    if (obj.where !== OBJ_FREE)
        throw new Error(`place_object: object where=${obj.where}, expected free`);

    const grid = floorObjectGrid(state);
    let pile = grid[x][y];
    obj_no_longer_held(obj, normalized);
    if (pile?.otyp === BOULDER && obj.otyp !== BOULDER) {
        while (pile.nexthere?.otyp === BOULDER) pile = pile.nexthere;
        obj.nexthere = pile.nexthere;
        pile.nexthere = obj;
    } else {
        obj.nexthere = pile;
        grid[x][y] = obj;
    }

    obj.ox = x;
    obj.oy = y;
    obj.where = OBJ_FLOOR;
    obj.nobj = state.level.objlist ?? null;
    state.level.objlist = obj;
    return obj;
}

// C ref: invent.c sobj_at() and g_at().
export function sobj_at(otyp, x, y, state = game) {
    const grid = floorObjectGrid(state);
    for (let obj = grid[x]?.[y] ?? null; obj; obj = obj.nexthere) {
        if (obj.otyp === otyp) return obj;
    }
    return null;
}

export function g_at(x, y, state = game) {
    const grid = floorObjectGrid(state);
    for (let obj = grid[x]?.[y] ?? null; obj; obj = obj.nexthere) {
        if (obj.oclass === COIN_CLASS) return obj;
    }
    return null;
}

// C ref: mkobj.c mksobj_at() and mkobj_at().
export function mksobj_at(otyp, x, y, init = true, artif = false, env = {}) {
    const normalized = objectEnv(env);
    return place_object(
        mksobj(otyp, init, artif, normalized),
        x,
        y,
        normalized,
    );
}

export function mkobj_at(oclass, x, y, artif = false, env = {}) {
    const normalized = objectEnv(env);
    return place_object(mkobj(oclass, artif, normalized), x, y, normalized);
}

// C ref: mkobj.c mkgold(). Existing floor gold absorbs the new amount without
// allocating another object, which also means that next_ident() consumes no
// PRNG draw on a repeated fill of the same square.
export function mkgold(amount, x, y, env = {}) {
    const normalized = objectEnv(env);
    const { random, state } = normalized;
    let gold = g_at(x, y, state);
    if (amount <= 0) {
        const divisor = Math.max(12 - depth(state.u?.uz, state), 2);
        const multiplier = random.rnd(Math.trunc(30 / divisor));
        amount = 1 + random.rnd(level_difficulty(state) + 2) * multiplier;
    }
    if (gold) {
        gold.quan += amount;
    } else {
        gold = mksobj_at(GOLD_PIECE, x, y, true, false, normalized);
        gold.quan = amount;
    }
    gold.owt = weight(gold, normalized);
    return gold;
}
