// Object allocation, initialization, and weight.
// C refs: include/obj.h, src/mkobj.c mkobj(), mksobj(), init_dummyobj(), and
// weight().

import {
    A_NONE,
    CORPSTAT_FEMALE,
    CORPSTAT_MALE,
    CORPSTAT_NEUTER,
    COST_DEGRD,
    COLNO,
    DB_ICE,
    DB_UNDER,
    DRAWBRIDGE_UP,
    FIRE_RES,
    G_GONE,
    HATCH_EGG,
    ICE,
    LARGEST_INT,
    LOST_NONE,
    MAX_OIL_IN_FLASK,
    NON_PM,
    OBJ_BURIED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_LUAFREE,
    OBJ_MINVENT,
    P_AXE,
    P_BOOMERANG,
    P_BOW,
    P_CROSSBOW,
    P_DART,
    P_NONE,
    P_PICK_AXE,
    P_SABER,
    P_SHORT_SWORD,
    P_SHURIKEN,
    P_SLING,
    P_SPEAR,
    RANDOM_TIN,
    REVIVE_MON,
    ROT_CORPSE,
    ROWNO,
    SPINACH_TIN,
    TIMER_OBJECT,
} from './const.js';
import { noveltitle } from './do_name.js';
import { depth, level_difficulty, on_level } from './dungeon.js';
import { set_tin_variety } from './eat.js';
import { game } from './gstate.js';
import { update_inventory } from './invent.js';
import { obj_sheds_light } from './light.js';
import { rndmonnum } from './makemon.js';
import {
    can_be_hatched,
    dead_species,
    humanoid,
    is_female,
    is_male,
    is_neuter,
    monsndx,
    noncorporeal,
    undead_to_corpse,
} from './mondata.js';
// copy_oextra() below reads copy_mextra(), as mkobj.c:438 does. js/mon.js
// already imports this file, and both sides use the other's exports only
// inside function bodies, so this direct edge resolves the same way the
// js/mondata.js edge onto js/dungeon.js does.
import { copy_mextra } from './mon.js';
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
    start_timer,
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
    ARM_BOOTS,
    ARM_CLOAK,
    ARM_GLOVES,
    ARM_HELM,
    ARM_SHIELD,
    ARM_SHIRT,
    ARM_SUIT,
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
    FLINT,
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
    GRAY_DRAGON_SCALE_MAIL,
    HEAVY_IRON_BALL,
    HELM_OF_OPPOSITE_ALIGNMENT,
    HORN_OF_PLENTY,
    ICE_BOX,
    IRON,
    KELP_FROND,
    LARGE_BOX,
    LEASH,
    LEATHER,
    LEVITATION_BOOTS,
    LIQUID,
    LOADSTONE,
    LUCKSTONE,
    MAGIC_FLUTE,
    MAGIC_HARP,
    MAGIC_LAMP,
    MAGIC_MARKER,
    MEAT_RING,
    MITHRIL,
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
    RUBBER_HOSE,
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
    TOUCHSTONE,
    TOWEL,
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
    YELLOW_DRAGON_SCALES,
} from './objects.js';
import {
    G_NOCORPSE,
    MZ_HUGE,
    MZ_SMALL,
    PM_GRAY_OOZE,
    PM_HUMAN,
    PM_MARILITH,
    PM_WINGED_GARGOYLE,
    S_CENTAUR,
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

// C ref: mkobj.c init_dummyobj() (3346-3371), which fills in just enough of an
// object for the obj.h predicates that take an object pointer. Its one ported
// caller is apply.c use_stethoscope()'s M_AP_OBJECT arm, which needs to know
// what a mimic's disguise is called and whether that name takes a plural verb.
//
// C's caller owns the storage -- `struct obj dummyobj` on the stack, passed by
// address -- and this function zeroes it from cg.zeroobj. The port keeps the
// parameter so the call reads the same, and the caller passes newObject(),
// which is the port's cg.zeroobj and carries the union aliases that
// `leashmon` and `next_boulder` below write through.
export function init_dummyobj(obj, otyp, oquan, state = game) {
    if (obj) {
        Object.assign(obj, newObject()); /* *obj = cg.zeroobj */
        obj.otyp = otyp;
        const ocl = objectType(otyp, state);
        obj.oclass = ocl.oc_class;
        /* obj.dknown = 0; */
        /* suppress known except for amulets (needed for fakes & real AoY) */
        obj.known = (obj.oclass === AMULET_CLASS)
            ? obj.known
            /* default is "on" for types which don't use it */
            : !ocl.oc_uses_known;
        obj.quan = oquan || 1;
        obj.corpsenm = NON_PM; /* suppress statue and figurine details */
        if (obj.otyp === LEASH)
            obj.leashmon = 0; /* overloads corpsenm, avoid NON_PM */
        if (obj.otyp === BOULDER)
            obj.next_boulder = 0; /* overloads corpsenm, avoid NON_PM */
        /* but suppressing fruit details leads to "bad fruit #0" */
        if (obj.otyp === SLIME_MOLD)
            obj.spe = state.context.current_fruit;
    }
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

// C ref: mkobj.c clear_splitobjs().
export function clear_splitobjs(state = game) {
    state.context ??= {};
    state.context.objsplit ??= {};
    state.context.objsplit.parent_oid = 0;
    state.context.objsplit.child_oid = 0;
}

// C ref: shk.c oid_price_adjustment(), called by mkobj.c nextoid().
function oidPriceAdjustment(obj, oid, state) {
    const type = objectType(obj, state);
    const identityKnown = obj.dknown && type.oc_name_known;
    const glassGem = obj.oclass === GEM_CLASS
        && type.oc_material === GLASS;
    return !identityKnown && !glassGem && oid % 4 === 0 ? 1 : 0;
}

function initializedIdentContext(state) {
    const context = state?.context;
    if (!context
        || !Number.isInteger(context.ident)
        || context.ident <= 0
        || context.ident > 0xffff_ffff) {
        throw new Error('next_ident requires initialized nonzero context.ident');
    }
    return context;
}

function nextSplitOid(source, child, normalized) {
    const context = initializedIdentContext(normalized.state);
    const adjustment = oidPriceAdjustment(
        source,
        source.o_id,
        normalized.state,
    );
    let oid = (context.ident - 1) >>> 0;
    let tries = 256;
    do {
        oid = (oid + 1) >>> 0;
        if (!oid) oid = 1;
    } while (oidPriceAdjustment(child, oid, normalized.state) !== adjustment
        && --tries >= 0);
    context.ident = oid;
    next_ident(normalized);
    return oid;
}

// C ref: mkobj.c copy_oextra() (417-448). C copies the inline monster
// structure while retaining its pointer fields, then separately copies mextra
// and clears nmon.
export function copy_oextra(target, source) {
    if (!target || !source || !source.oextra) return target;

    target.oextra ??= {};
    const sourceExtra = source.oextra;
    if (sourceExtra.oname)
        target.oextra.oname = String(sourceExtra.oname);
    if (sourceExtra.omonst) {
        const sourceMonster = sourceExtra.omonst;
        // mkobj.c:430-431 copies struct monst by value, so its two
        // struct-valued members -- `coord mtrack[MTSZ]` (monst.h:143) and
        // `coord mgoal` (monst.h:189) -- are copied too, which a JavaScript
        // spread would instead alias. js/corpstat.js save_mtraits() rebuilds
        // the same two for the same reason.
        const targetMonster = {
            ...sourceMonster,
            nmon: null,
            mtrack: Array.isArray(sourceMonster.mtrack)
                ? sourceMonster.mtrack.map((point) => ({ ...point }))
                : sourceMonster.mtrack,
            mgoal: sourceMonster.mgoal
                ? { ...sourceMonster.mgoal }
                : sourceMonster.mgoal,
            mextra: null,
        };
        target.oextra.omonst = targetMonster;
        // mkobj.c:437-438 guards this call on the source's mextra;
        // copy_mextra() makes the same test first, so the guard is left to it.
        copy_mextra(targetMonster, sourceMonster);
    }
    if (sourceExtra.omailcmd)
        target.oextra.omailcmd = String(sourceExtra.omailcmd);
    if (sourceExtra.omid != null)
        target.oextra.omid = sourceExtra.omid;
    return target;
}

// C ref: mkobj.c splitobj(). The child follows its parent in both ownership
// chains, receives a price-compatible object id, and clears transient worn,
// light, timer, Lua, and pickup state.
export function splitobj(obj, quantity, env = {}) {
    const normalized = objectEnv(env);
    quantity = Math.trunc(quantity);
    if (!obj || typeof obj !== 'object')
        throw new TypeError('splitobj requires an object');
    if (obj.cobj || quantity <= 0 || Math.trunc(obj.quan) <= quantity) {
        throw new RangeError(
            `splitobj requires 0 < quantity < ${obj.quan} `
            + 'and an empty object',
        );
    }
    const splitLight = obj_sheds_light(obj);
    if (obj.unpaid) requiredHook(normalized, 'splitBill', obj);
    if (obj.timed) requiredHook(normalized, 'splitObjectTimers', obj);
    if (splitLight) requiredHook(normalized, 'splitObjectLight', obj);

    const child = newObject({
        ...obj,
        oextra: null,
    });
    child.o_id = nextSplitOid(obj, child, normalized);
    child.timed = 0;
    child.lamplit = false;
    child.owornmask = 0;
    obj.quan -= quantity;
    obj.owt = weight(obj, normalized);
    child.quan = quantity;
    child.owt = weight(child, normalized);
    child.lua_ref_cnt = 0;
    child.pickup_prev = false;

    normalized.state.context.objsplit ??= {};
    normalized.state.context.objsplit.parent_oid = obj.o_id;
    normalized.state.context.objsplit.child_oid = child.o_id;
    obj.nobj = child;
    if (obj.where === OBJ_FLOOR) obj.nexthere = child;
    if (child.where === OBJ_LUAFREE) child.where = OBJ_FREE;

    if (obj.unpaid)
        normalized.hooks.splitBill(obj, child, normalized);
    copy_oextra(child, obj);
    if (child.oextra?.omid != null) delete child.oextra.omid;
    if (obj.timed)
        normalized.hooks.splitObjectTimers(obj, child, normalized);
    if (splitLight)
        normalized.hooks.splitObjectLight(obj, child, normalized);
    return child;
}

// C ref: mkobj.c next_ident(). Object and monster ids share context.ident.
export function next_ident(env = {}) {
    const normalized = objectEnv(env);
    const context = initializedIdentContext(normalized.state);
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
    if (obj_sheds_light(obj)) {
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

// C ref: obj.h Is_box().
export function isBox(obj) {
    return obj.otyp === LARGE_BOX || obj.otyp === CHEST;
}

// C ref: obj.h Has_contents(). The commented-out class test in C is left out
// there too, so any object with a contents chain answers true.
export function hasContents(obj) {
    return Boolean(obj.cobj);
}

export function isCandle(obj) {
    return obj.otyp === TALLOW_CANDLE || obj.otyp === WAX_CANDLE;
}

// C ref: obj.h carried() (332). Answers whether the hero holds the object, as
// opposed to a monster, the floor, a container, or the ground under a grave.
export function carried(obj) {
    return obj.where === OBJ_INVENT;
}

// C ref: obj.h is_weptool() (249-250).
export function is_weptool(obj, state = game) {
    return obj.oclass === TOOL_CLASS && objectType(obj, state).oc_subtyp !== P_NONE;
}

// C ref: obj.h is_launcher() (235-237). The closed skill window P_BOW through
// P_CROSSBOW; is_ammo() below is its negated mirror.
export function is_launcher(obj, state = game) {
    const skill = objectType(obj, state).oc_subtyp;
    return obj.oclass === WEAPON_CLASS
        && skill >= P_BOW && skill <= P_CROSSBOW;
}

// C ref: obj.h is_ammo().
export function is_ammo(obj, state = game) {
    const skill = objectType(obj, state).oc_subtyp;
    return (obj.oclass === WEAPON_CLASS || obj.oclass === GEM_CLASS)
        && skill >= -P_CROSSBOW
        && skill <= -P_BOW;
}

// C ref: obj.h matching_launcher() (242-243). C's oc_skill is negative for
// ammunition and positive for the launcher that fires it, so the two match
// when one negates the other. Stored here under the union alias oc_subtyp, as
// is_ammo() above reads it.
export function matching_launcher(ammo, launcher, state = game) {
    return Boolean(launcher)
        && objectType(ammo, state).oc_subtyp
            === -objectType(launcher, state).oc_subtyp;
}

// C ref: obj.h ammo_and_launcher() (244).
export function ammo_and_launcher(ammo, launcher, state = game) {
    return is_ammo(ammo, state) && matching_launcher(ammo, launcher, state);
}

// C ref: obj.h uslinging() (269). Whether the hero holds a sling, which is
// what makes a gem worth throwing and an ordinary weapon not. The macro reads
// the global uwep rather than taking an object, so the hero state is the only
// argument here.
export function uslinging(state = game) {
    return Boolean(state.uwep)
        && objectType(state.uwep, state).oc_subtyp === P_SLING;
}

// C ref: obj.h is_flimsy() (418-420). Whether an object is too soft to make a
// noticeable impact when it lands; hack.c impact_disturbs_zombies() is the
// caller. LEATHER is the material enum's dividing line: everything at or below
// it is liquid, wax, vegetable, flesh, paper, cloth or leather.
export function is_flimsy(obj, state = game) {
    return objectType(obj, state).oc_material <= LEATHER
        || obj.otyp === RUBBER_HOSE;
}

// C ref: obj.h is_missile() (245-248). A tool qualifies here where is_launcher()
// and is_ammo() admit only weapons, because a boomerang is a TOOL_CLASS object.
export function is_missile(obj, state = game) {
    const skill = objectType(obj, state).oc_subtyp;
    return (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && skill >= -P_BOOMERANG && skill <= -P_DART;
}

// C ref: obj.h is_wet_towel() (256). `spe` counts a towel's remaining wetness
// rather than an enchantment.
export function is_wet_towel(obj) {
    return obj.otyp === TOWEL && obj.spe > 0;
}

// C ref: obj.h is_shield() (280-282). oc_armcat is the objects[] field's
// armor-category alias, over the same storage is_ammo() above reads as
// oc_subtyp; C spells this test with oc_armcat.
export function is_shield(obj, state = game) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === ARM_SHIELD;
}

// The other six armor-category macros obj.h spells the same way as
// is_shield() above: obj.h is_helmet() (283-284), is_boots() (285-287),
// is_gloves() (288-290), is_cloak() (291-293), is_shirt() (294-296) and
// is_suit() (297-298). do_wear.c canwearobj() tests all seven in one chain, so
// they arrive together.
export function is_helmet(obj, state = game) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === ARM_HELM;
}

export function is_boots(obj, state = game) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === ARM_BOOTS;
}

export function is_gloves(obj, state = game) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === ARM_GLOVES;
}

export function is_cloak(obj, state = game) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === ARM_CLOAK;
}

export function is_shirt(obj, state = game) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === ARM_SHIRT;
}

export function is_suit(obj, state = game) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === ARM_SUIT;
}

// C ref: obj.h WrappingAllowed() (443-446). A mummy wrapping fits more forms
// than any other cloak, so do_wear.c canwearobj() exempts it from the
// cantweararm() refusal for every form listed here.
export function WrappingAllowed(species) {
    return humanoid(species)
        && species.msize >= MZ_SMALL && species.msize <= MZ_HUGE
        && !noncorporeal(species) && species.mlet !== S_CENTAUR
        && monsndx(species) !== PM_WINGED_GARGOYLE
        && monsndx(species) !== PM_MARILITH;
}

// C ref: obj.h is_sword() (223-226). The objects[] field C calls oc_skill is
// stored under its union alias oc_subtyp here, as is_axe() below also reads
// it. P_SHORT_SWORD through P_SABER is the contiguous run of sword skills;
// do_wear.c canwearobj() uses this only to choose between "sword" and "weapon"
// in the messages that refuse a suit, a shirt, a shield or gloves to a hero
// holding a welded weapon.
export function is_sword(obj, state = game) {
    const skill = objectType(obj, state).oc_subtyp;
    return obj.oclass === WEAPON_CLASS
        && skill >= P_SHORT_SWORD && skill <= P_SABER;
}

// C ref: obj.h Is_dragon_scales() (347-348), Is_dragon_mail() (349-351) and
// Is_dragon_armor() (352), which ORs the other two. objects.h lists the ten
// scale mails at otyp 101-110 and the ten scale heaps at 111-120, so those two
// ranges abut and one test over the pair answers the same for every otyp.
// scripts/take-off-armor.test.mjs pins that adjacency, which is the whole of
// what the merge assumes. Only the combined macro has a caller here:
// do_wear.c Armor_off() needs it to tell the suits dragon_armor_handling()
// acts on from the ones it takes `default: break;` for.
export function Is_dragon_armor(obj) {
    return obj.otyp >= GRAY_DRAGON_SCALE_MAIL
        && obj.otyp <= YELLOW_DRAGON_SCALES;
}

// C ref: obj.h is_axe() (217-219). Reads the same field is_pick() below does.
export function is_axe(obj, state = game) {
    return (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && objectType(obj, state).oc_subtyp === P_AXE;
}

// C ref: obj.h is_pick(). The objects[] field C calls oc_skill is stored under
// its union alias oc_subtyp here, as is_ammo() above also reads it.
export function is_pick(obj, state = game) {
    return (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && objectType(obj, state).oc_subtyp === P_PICK_AXE;
}

// C ref: obj.h is_spear() (233-234). Unlike is_axe() and is_pick() above, a
// weapon-tool does not qualify: C tests WEAPON_CLASS alone.
export function is_spear(obj, state = game) {
    return obj.oclass === WEAPON_CLASS
        && objectType(obj, state).oc_subtyp === P_SPEAR;
}

// C ref: obj.h greatest_erosion().
export function greatest_erosion(obj) {
    const rusted = Math.trunc(obj.oeroded ?? 0);
    const corroded = Math.trunc(obj.oeroded2 ?? 0);
    return rusted > corroded ? rusted : corroded;
}

// C ref: hack.h ARM_BONUS(). Both armor-class calculations read it:
// do_wear.c find_ac() for the hero and worn.c find_mac() for a monster.
export function ARM_BONUS(obj, state = game) {
    const base = Math.trunc(objectType(obj, state).a_ac);
    return base + Math.trunc(obj.spe ?? 0)
        - Math.min(greatest_erosion(obj), base);
}

// C ref: obj.h is_graystone().
export function is_graystone(obj) {
    return obj.otyp === LUCKSTONE || obj.otyp === LOADSTONE
        || obj.otyp === FLINT || obj.otyp === TOUCHSTONE;
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
        || (obj.oclass === TOOL_CLASS && is_weptool(obj, state));
}

export function isFlammable(obj, state = game) {
    const type = objectType(obj, state);
    if (isCandle(obj)) return false;
    if (type.oc_oprop === FIRE_RES || obj.otyp === WAN_FIRE) return false;
    return (type.oc_material <= WOOD && type.oc_material !== LIQUID)
        || type.oc_material === PLASTIC;
}

export function isRottable(obj, state = game) {
    const material = objectType(obj, state).oc_material;
    return (material <= WOOD && material !== LIQUID)
        || material === DRAGON_HIDE;
}

// C ref: objclass.h is_metallic().
export function isMetallic(obj, state = game) {
    const material = objectType(obj, state).oc_material;
    return material >= IRON && material <= MITHRIL;
}

export function isRustprone(obj, state = game) {
    return objectType(obj, state).oc_material === IRON;
}

export function isCorrodeable(obj, state = game) {
    const material = objectType(obj, state).oc_material;
    return material === COPPER || material === IRON;
}

export function isCrackable(obj, state = game) {
    return objectType(obj, state).oc_material === GLASS
        && obj.oclass === ARMOR_CLASS;
}

export function isDamageable(obj, state = game) {
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

// C ref: mkobj.c curse() (1783-1820), narrowed to free objects. This covers
// startup loadstones, objects generated for level features before they acquire
// an owner, and the object readobjnam() builds for a wish. Carried, worn, lit,
// or otherwise owned objects still need curse()'s full luck, equipment, timer,
// light, occupation, and display side effects.
//
// Four of curse()'s arms cannot fire on a free object and are omitted rather
// than guarded: the uwep and uswapwep tests at 1795-1801; confers_luck()'s
// set_moreluck() at 1803, which carried() gates; attach_fig_transform_timeout()
// at 1808-1810, which carried() or mcarried() gates; and spell.c:343
// book_cursed(), which acts only on the book svc.context.spbook.book points at.
export function curseFreeObject(obj, env = {}) {
    if (obj.oclass === COIN_CLASS) return obj;
    if (obj.where !== OBJ_FREE || obj.lamplit) {
        throw new UnsupportedObjectOperationError(
            'curse outside free-object generation',
            obj,
        );
    }
    obj.blessed = false;
    obj.cursed = true;
    if (obj.otyp === BAG_OF_HOLDING)
        obj.owt = weight(obj, env);
    return obj;
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

// C ref: mkobj.c set_bknown() (1862-1873). Records that the hero has learned
// an object's bless/curse state, and refreshes the permanent-inventory window
// when the object she learned it about is one she is carrying.
//
// C's guard is `svm.moves > 1L`, which suppresses the refresh during the first
// turn while u_init() is still building the pack; update_inventory() applies
// its own program_state.in_moveloop test on top of that.
export function set_bknown(obj, onoff, env = {}) {
    if (Boolean(obj.bknown) !== Boolean(onoff)) {
        obj.bknown = onoff;
        if (obj.where === OBJ_INVENT && (objectEnv(env).state.moves ?? 0) > 1)
            update_inventory(env);
    }
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

function inQuest(state) {
    const dnum = state.u?.uz?.dnum;
    return Number.isInteger(dnum) && dnum === state.quest_dnum;
}

function isRogueLevel(state) {
    return on_level(state.u?.uz, state.rogue_level);
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
export function costly_alteration(obj, alterType, env = {}) {
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
            costly_alteration(current, COST_DEGRD, normalized);
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
    // C ref: mkobj.c place_object():2331-2334, `block_point(x, y)` for a
    // boulder. Resolved before the writes below, as remove_object() resolves
    // its mirror image, so a caller that cannot supply the vision owner leaves
    // the object where it was rather than half-placed.
    const blockPoint = obj.otyp === BOULDER
        ? requiredHook(normalized, 'blockPoint', obj)
        : null;

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
    // Two things about this call do not look like C. C makes it above the pile
    // insertion, and this port's block_point() is the same full vision_reset()
    // as unblock_point() and recalc_block_point(), reading the live pile
    // (js/vision.js blocksVisionAt()); a rebuild run before the insertion would
    // still read the square as transparent, so it has to run after.
    //
    // C's `!otmp2 || otmp2->otyp != BOULDER` guard is dropped, and that is not
    // free. The rebuild reaches C's blocked answer either way, since a square
    // that already held a boulder rebuilds to the same value. But
    // js/vision.js rebuildVisionPoint() also raises state.vision_full_recalc
    // whenever the square is in the viz_array, and js/allmain.js spends that
    // flag on an extra vision_recalc(0) at the end of the turn -- so on a
    // second boulder landing where one already stands, this port makes a call
    // C skips entirely. No ported path stacks boulders yet, which is why the
    // guard is left out rather than written; restoring it means reading the
    // pile before insertion.
    if (blockPoint) blockPoint(x, y, normalized);
    if (obj.timed) obj_timer_checks(obj, x, y, 0, normalized);
    return obj;
}

function chainPredecessor(head, target, link, label) {
    const seen = new Set();
    let previous = null;
    for (let current = head; current; current = current[link]) {
        if (typeof current !== 'object' || seen.has(current))
            throw new Error(`${label} is corrupt`);
        seen.add(current);
        if (current === target) return previous;
        previous = current;
    }
    throw new Error(
        `${label}: object ${target?.o_id ?? '?'} is not on the chain`,
    );
}

function objectLocationIsIce(x, y, state) {
    const location = state.level?.at(x, y);
    return location?.typ === ICE
        || (location?.typ === DRAWBRIDGE_UP
            && ((location.flags ?? 0) & DB_UNDER) === DB_ICE);
}

// C ref: mkobj.c ROT_ICE_ADJUSTMENT (2391), "rotting on ice takes 2 times as
// long". obj_timer_checks() below multiplies a pending timeout by it.
const ROT_ICE_ADJUSTMENT = 2;

// C ref: mkobj.c peek_at_iced_corpse_age() (2422-2438). The age a rot
// calculation should use: a corpse resting on ice has aged at half speed, so
// the stored age is moved forward by the half of the elapsed time that did not
// count. "must be same as obj_timer_checks() for off ice".
export function peek_at_iced_corpse_age(otmp, state = game) {
    let retval = Math.trunc(otmp.age ?? 0);

    if (otmp.otyp === CORPSE && otmp.on_ice) {
        /* Adjust the age; must be same as obj_timer_checks() for off ice */
        const age = Math.trunc(state.moves ?? 0) - Math.trunc(otmp.age ?? 0);
        retval += Math.trunc(age * (ROT_ICE_ADJUSTMENT - 1)
            / ROT_ICE_ADJUSTMENT);
    }
    return retval;
}

// C ref: mkobj.c obj_timer_checks(). Corpse rot and revival timers run at
// half speed on ice; moving a corpse onto or off ice adjusts both its pending
// timeout and age so later source calculations see the same elapsed time.
export function obj_timer_checks(obj, x, y, force = 0, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const onFloor = obj.where === OBJ_FLOOR;
    const buried = obj.where === OBJ_BURIED;
    const onIce = (onFloor || buried) && objectLocationIsIce(x, y, state);

    let action = ROT_CORPSE;
    let timeLeft = 0;
    let restartTimer = false;

    if (obj.otyp === CORPSE && onIce) {
        timeLeft = stop_timer(action, obj, state, rawEnv);
        if (timeLeft === 0) {
            action = REVIVE_MON;
            timeLeft = stop_timer(action, obj, state, rawEnv);
        }
        if (timeLeft !== 0) {
            obj.on_ice = true;
            timeLeft *= 2;
            restartTimer = true;
            const age = Math.trunc(state.moves ?? 0)
                - Math.trunc(obj.age ?? 0);
            obj.age = Math.trunc(state.moves ?? 0) - age * 2;
        }
    } else if (force < 0
        || (obj.otyp === CORPSE && obj.on_ice && !onIce)) {
        timeLeft = stop_timer(action, obj, state, rawEnv);
        if (timeLeft === 0) {
            action = REVIVE_MON;
            timeLeft = stop_timer(action, obj, state, rawEnv);
        }
        if (timeLeft !== 0) {
            obj.on_ice = false;
            timeLeft = Math.trunc(timeLeft / 2);
            restartTimer = true;
            const age = Math.trunc(state.moves ?? 0)
                - Math.trunc(obj.age ?? 0);
            obj.age += Math.trunc(age / 2);
        }
    }

    if (restartTimer)
        start_timer(timeLeft, TIMER_OBJECT, action, obj, state);
}

// C ref: mkobj.c obj_ice_effects(). Terrain changes recheck every timed floor
// object at the square and, when requested, every timed buried object there.
export function obj_ice_effects(x, y, doBuried, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const grid = floorObjectGrid(state);

    for (let obj = grid[x][y]; obj; obj = obj.nexthere) {
        if (obj.timed) obj_timer_checks(obj, x, y, 0, rawEnv);
    }
    if (doBuried) {
        for (let obj = state.level.buriedobjlist; obj; obj = obj.nobj) {
            if (obj.ox === x && obj.oy === y && obj.timed)
                obj_timer_checks(obj, x, y, 0, rawEnv);
        }
    }
}

// C ref: mkobj.c remove_object(). Floor objects have two independent links;
// validate both before changing either so a JS ownership error cannot orphan
// an object from just one index.
export function remove_object(obj, env = {}) {
    const normalized = lifecycleEnv(env);
    const { state } = normalized;
    if (!obj || typeof obj !== 'object')
        throw new TypeError('remove_object requires an object');
    if (obj.where !== OBJ_FLOOR) {
        throw new Error(
            `remove_object: object where=${obj.where}, expected floor`,
        );
    }
    const { ox: x, oy: y } = obj;
    if (!Number.isInteger(x) || !Number.isInteger(y)
        || x < 0 || x >= COLNO || y < 0 || y >= ROWNO) {
        throw new RangeError(`remove_object: off-map location <${x},${y}>`);
    }

    const grid = floorObjectGrid(state);
    const pilePrevious = chainPredecessor(
        grid[x][y], obj, 'nexthere', 'floor object pile',
    );
    const listPrevious = chainPredecessor(
        state.level.objlist ?? null, obj, 'nobj', 'level object list',
    );
    const recalcBlockPoint = obj.otyp === BOULDER
        ? requiredHook(normalized, 'recalcBlockPoint', obj)
        : null;

    if (pilePrevious) pilePrevious.nexthere = obj.nexthere;
    else grid[x][y] = obj.nexthere;
    if (listPrevious) listPrevious.nobj = obj.nobj;
    else state.level.objlist = obj.nobj;
    obj.nexthere = null;
    obj.nobj = null;
    obj.where = OBJ_FREE;

    if (recalcBlockPoint) recalcBlockPoint(x, y, normalized);
    if (obj.timed) obj_timer_checks(obj, x, y, 0, normalized);
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
