// Hero inventory and nobj-chain primitives.
// C refs: src/invent.c addinv(), mergable(), merged(), useupall();
//         src/mkobj.c extract_nobj(), add_to_container(), and add_to_buried().

import {
    ACH_MINE_PRIZE,
    ACH_SOKO_PRIZE,
    BLINDED,
    HALLUC,
    HALLUC_RES,
    LOST_EXPLODING,
    LOST_NONE,
    LOST_THROWN,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_LUAFREE,
    OBJ_MIGRATING,
    OBJ_MINVENT,
    OBJ_ONBILL,
    NON_PM,
    P_BOOMERANG,
    P_BOW,
    P_CROSSBOW,
    P_DAGGER,
    P_DART,
    P_SABER,
    P_SHORT_SWORD,
    P_SPEAR,
    W_QUIVER,
} from './const.js';
import { ART_MJOLLNIR } from './artifacts.js';
import { game } from './gstate.js';
import {
    AMULET_OF_YENDOR,
    AKLYS,
    BELL_OF_OPENING,
    BOULDER,
    CANDELABRUM_OF_INVOCATION,
    COIN_CLASS,
    CORPSE,
    EGG,
    FIGURINE,
    FOOD_CLASS,
    GEM_CLASS,
    GLASS,
    LEASH,
    LOADSTONE,
    LUCKSTONE,
    POT_OIL,
    SCR_BLANK_PAPER,
    SCR_MAIL,
    SCROLL_CLASS,
    SPE_BOOK_OF_THE_DEAD,
    SPBOOK_CLASS,
    TIN,
    TOOL_CLASS,
    WAR_HAMMER,
    WEAPON_CLASS,
    PIERCE,
} from './objects.js';
import {
    UnsupportedObjectOperationError,
    curseFreeObject,
    dealloc_obj,
    erosionMatters,
    isCandle,
    isContainer,
    isPudding,
    objectType,
    preflightWeight,
    weight,
} from './obj.js';

export const INVLET_BASIC = 52;
export const NOINVSYM = '#';

function inventoryEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

function requiredHook(env, name, obj) {
    const hook = env.hooks?.[name];
    if (typeof hook !== 'function')
        throw new UnsupportedObjectOperationError(name, obj);
    return hook;
}

// InventoryEnv hook contract. Predicates are pure. Mutators run at their C
// call boundary and must leave the object invariants named by the caller.
// Missing live hooks throw UnsupportedObjectOperationError before mutation
// whenever the branch can be preflighted.
//
// Predicates: artifactConfersLuck(obj, env), isReviver(species, env),
// samePrice(obj, target, env), isDeadSpecies(species, includeGone, env).
// Inventory effects: addSpecialInventoryEffects(obj, env),
// removeSpecialInventoryEffects(obj, env), recalculateLuck(obj, env),
// archeologistDeciphersScroll(obj, env), recordAchievement(id, env),
// updateInventory(state).
// attachFigurineTimer(obj, env) and stopFigurineTimer(obj, env) own both the
// external timer queue and obj.timed, as NetHack's timer subsystem does.
// Ownership/lifetime: extractExternalObject(obj, env),
// objectNoLongerHeld(obj, env), stopObjectTimers(obj, env),
// deleteObjectLightSource(obj, env), unleashObject(obj, env),
// resetPick(obj, env). obfreeShopBill(obj, merge, env) returns 'retained' when
// the shop moves obj to OBJ_ONBILL, 'billed' when it merged an existing bill
// entry, or 'unbilled' when normal deletion and price adjustment should run.
// Merge effects: mergeLightSources(obj, target, env),
// mergeWornMasks(target, obj, env). absorbGlob(target, obj, env) owns
// mkobj.c obj_absorb(), including globby_bill_fixup(), timeout recombination,
// target updates, and leaving obj deallocated as OBJ_DELETED or OBJ_LUAFREE.
// inventoryComparisonDiscovered(target, env), setNotWorn(obj, env).

function suppressMapOutput(state) {
    return Boolean(state.in_mklev
        || state.program_state?.saving
        || state.program_state?.restoring
        || state.program_state?.done_hup);
}

function inventoryRefreshActive(env) {
    return Boolean(env.state.program_state?.in_moveloop)
        && !suppressMapOutput(env.state);
}

function requireInventoryRefresh(env) {
    if (!inventoryRefreshActive(env)) return;
    if (env.state.iflags?.perm_invent
        && typeof env.hooks.updateInventory !== 'function') {
        throw new UnsupportedObjectOperationError('updateInventory');
    }
}

// C ref: invent.c update_inventory(). Calls before the move loop and while
// map output is suppressed are deliberately ignored. moveloop_preamble()
// owns the first live startup refresh.
export function update_inventory(env = {}) {
    const normalized = inventoryEnv(env);
    if (!inventoryRefreshActive(normalized)) return false;
    requireInventoryRefresh(normalized);
    if (typeof normalized.hooks.updateInventory !== 'function') return false;
    normalized.state.iflags ??= {};
    const savedSuppressPrice = normalized.state.iflags.suppress_price;
    normalized.state.iflags.suppress_price = 0;
    try {
        normalized.hooks.updateInventory(normalized.state);
    } finally {
        normalized.state.iflags.suppress_price = savedSuppressPrice;
    }
    return true;
}

function inventoryHead(state) {
    return state.invent ?? null;
}

function setInventoryHead(state, head) {
    state.invent = head ?? null;
    return state.invent;
}

// The C global gi.invent is intentionally flattened to state.invent, matching
// the rest of this port's flattened instance-global state.
export function inventoryObjects(state = game) {
    const result = [];
    for (let obj = inventoryHead(state); obj; obj = obj.nobj)
        result.push(obj);
    return result;
}

export function initializeInventory(state = game) {
    if (inventoryHead(state)) {
        throw new Error(
            'initializeInventory requires an empty inventory; use resetInventory first',
        );
    }
    setInventoryHead(state, null);
    // C ref: u_init.c u_init_inventory_attrs(). 51 makes the first search
    // wrap around to inventory letter 'a'.
    state.lastinvnr = INVLET_BASIC - 1;
    return state;
}

// C ref: mkobj.c extract_nobj(). The replacement head stays private so a
// caller cannot forget to assign it back to its owner.
function extractNobj(obj, head) {
    let previous = null;
    let current = head;
    while (current && current !== obj) {
        previous = current;
        current = current.nobj;
    }
    if (!current)
        throw new Error(`extract_nobj: object ${obj?.o_id ?? '?'} is not on chain`);
    if (previous) previous.nobj = current.nobj;
    else head = current.nobj;
    obj.where = OBJ_FREE;
    obj.nobj = null;
    return head;
}

function buriedObjectHead(state) {
    if (!state.level
        || !Object.hasOwn(state.level, 'buriedobjlist')) {
        throw new Error(
            'buried object operations require initialized level state',
        );
    }
    return state.level.buriedobjlist ?? null;
}

// A malformed chain is unreachable in C's normal lifecycle. Detect it before
// mutation so a JS integration error cannot orphan objects or loop forever.
function validateBuriedChain(state, target = null) {
    const seen = new Set();
    let found = target === null;
    for (let current = buriedObjectHead(state);
        current;
        current = current.nobj) {
        if (typeof current !== 'object' || seen.has(current))
            throw new Error('buried object chain is corrupt');
        seen.add(current);
        if (current.where !== OBJ_BURIED || current.nexthere)
            throw new Error('buried object chain has invalid ownership');
        if (current === target) found = true;
    }
    if (!found) {
        throw new Error(
            `buried object ${target?.o_id ?? '?'} is not on the level chain`,
        );
    }
}

// C ref: mkobj.c add_to_buried(). The caller owns ox/oy; this primitive only
// transfers a free object to the level-wide buried chain.
export function add_to_buried(obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (!obj || typeof obj !== 'object')
        throw new TypeError('add_to_buried requires an object');
    if (obj.where !== OBJ_FREE) {
        throw new Error(
            `add_to_buried: object where=${obj.where}, expected OBJ_FREE`,
        );
    }
    if (obj.nobj || obj.nexthere) {
        throw new Error('add_to_buried: free object retains a chain link');
    }
    validateBuriedChain(normalized.state);
    const head = buriedObjectHead(normalized.state);

    obj.where = OBJ_BURIED;
    obj.nobj = head;
    normalized.state.level.buriedobjlist = obj;
    return obj;
}

function container_weight(container, env) {
    container.owt = weight(container, env);
    if (container.where === OBJ_CONTAINED && container.ocontainer)
        container_weight(container.ocontainer, env);
}

function preflightFreeinvCore(obj, env) {
    if (obj.oclass === COIN_CLASS) return { confersLuck: false };
    if (obj.otyp === AMULET_OF_YENDOR
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === BELL_OF_OPENING
        || obj.otyp === SPE_BOOK_OF_THE_DEAD
        || obj.oartifact) {
        requiredHook(env, 'removeSpecialInventoryEffects', obj);
    }
    let confersLuck = obj.otyp === LUCKSTONE;
    if (obj.oartifact && obj.otyp !== LUCKSTONE) {
        confersLuck = Boolean(
            requiredHook(env, 'artifactConfersLuck', obj)(obj, env),
        );
    }
    if (confersLuck) {
        requiredHook(env, 'recalculateLuck', obj);
    } else if (obj.otyp === FIGURINE && obj.timed) {
        requiredHook(env, 'stopFigurineTimer', obj);
    }
    return { confersLuck };
}

function freeinvCore(obj, env, facts) {
    if (obj.oclass === COIN_CLASS) {
        env.state.disp ??= {};
        env.state.disp.botl = true;
        return;
    }
    if (obj.otyp === AMULET_OF_YENDOR
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === BELL_OF_OPENING
        || obj.otyp === SPE_BOOK_OF_THE_DEAD
        || obj.oartifact) {
        requiredHook(env, 'removeSpecialInventoryEffects', obj)(obj, env);
    }

    if (obj.otyp === LOADSTONE) {
        curseFreeObject(obj);
    } else if (obj.otyp === LUCKSTONE || obj.oartifact) {
        if (facts.confersLuck) {
            requiredHook(env, 'recalculateLuck', obj)(obj, env);
            env.state.disp ??= {};
            env.state.disp.botl = true;
        }
    } else if (obj.otyp === FIGURINE && obj.timed) {
        requiredHook(env, 'stopFigurineTimer', obj)(obj, env);
        if (obj.timed)
            throw new Error('stopFigurineTimer must clear obj.timed');
    }

    if (env.state.context?.tin?.tin === obj) {
        env.state.context.tin.tin = null;
        env.state.context.tin.o_id = 0;
    }
}

export function freeinv(obj, env = {}) {
    const normalized = inventoryEnv(env);
    requireInventoryRefresh(normalized);
    const facts = preflightFreeinvCore(obj, normalized);
    normalized.state.invent = extractNobj(obj, inventoryHead(normalized.state));
    obj.pickup_prev = false;
    freeinvCore(obj, normalized, facts);
    update_inventory(normalized);
    return obj;
}

// Floor/migration owners stay outside this first substrate. A future level
// module supplies extractExternalObject; inventory, container, and monster
// chains are handled here without an adapter.
function projectedContents(head, replacedObject, replacement) {
    let projectedHead = null;
    let projectedTail = null;
    let found = false;
    for (let current = head; current; current = current.nobj) {
        let projected;
        if (current === replacedObject) {
            found = true;
            if (!replacement) continue;
            projected = replacement;
        } else {
            projected = { ...current };
        }
        projected.nobj = null;
        if (projectedTail) projectedTail.nobj = projected;
        else projectedHead = projected;
        projectedTail = projected;
    }
    return { found, head: projectedHead };
}

function preflightContainedExtraction(obj, env) {
    let container = obj.ocontainer;
    if (!container) {
        throw new Error(
            'obj_extract_self: contained object has no container',
        );
    }

    // Build a read-only projection of the outer container tree after obj has
    // been removed. This checks siblings and ancestors without requiring
    // dependencies which belong only to the departing object.
    let replacedObject = obj;
    let replacement = null;
    while (container) {
        const contents = projectedContents(
            container.cobj,
            replacedObject,
            replacement,
        );
        if (!contents.found)
            throw new Error('obj_extract_self: object is not in its container');
        replacement = { ...container, cobj: contents.head, nobj: null };
        if (container.where !== OBJ_CONTAINED) break;
        replacedObject = container;
        container = container.ocontainer;
        if (!container) {
            throw new Error(
                'obj_extract_self: contained container has no parent',
            );
        }
    }
    preflightWeight(replacement, env);
}

function preflightObjectExtraction(obj, env) {
    switch (obj.where) {
    case OBJ_CONTAINED:
        preflightContainedExtraction(obj, env);
        break;
    case OBJ_INVENT:
        requireInventoryRefresh(env);
        preflightFreeinvCore(obj, env);
        break;
    case OBJ_FLOOR:
    case OBJ_MIGRATING:
    case OBJ_ONBILL:
        requiredHook(env, 'extractExternalObject', obj);
        break;
    case OBJ_BURIED:
        validateBuriedChain(env.state, obj);
        break;
    default:
        break;
    }
}

export function obj_extract_self(obj, env = {}) {
    const normalized = inventoryEnv(env);
    preflightObjectExtraction(obj, normalized);
    switch (obj.where) {
    case OBJ_FREE:
        if (obj.nobj || obj.nexthere)
            throw new Error('obj_extract_self: free object retains a chain link');
        return obj;
    case OBJ_LUAFREE:
    case OBJ_DELETED:
        return obj;
    case OBJ_CONTAINED: {
        const container = obj.ocontainer;
        if (!container)
            throw new Error('obj_extract_self: contained object has no container');
        container.cobj = extractNobj(obj, container.cobj);
        obj.ocontainer = null;
        container_weight(container, normalized);
        return obj;
    }
    case OBJ_INVENT:
        return freeinv(obj, normalized);
    case OBJ_MINVENT:
        if (!obj.ocarry)
            throw new Error('obj_extract_self: monster object has no carrier');
        obj.ocarry.minvent = extractNobj(obj, obj.ocarry.minvent);
        obj.ocarry = null;
        return obj;
    case OBJ_BURIED:
        normalized.state.level.buriedobjlist = extractNobj(
            obj,
            buriedObjectHead(normalized.state),
        );
        return obj;
    case OBJ_FLOOR:
    case OBJ_MIGRATING:
    case OBJ_ONBILL:
        requiredHook(normalized, 'extractExternalObject', obj)(obj, normalized);
        if (obj.where !== OBJ_FREE)
            throw new Error('extractExternalObject must leave object OBJ_FREE');
        if (obj.nobj || obj.nexthere) {
            throw new Error(
                'extractExternalObject must clear object chain links',
            );
        }
        return obj;
    default:
        throw new RangeError(`obj_extract_self: invalid where=${obj.where}`);
    }
}

function hasTextExtra(obj, field) {
    return obj.oextra?.[field] != null && obj.oextra[field] !== '';
}

function oname(obj) {
    return hasTextExtra(obj, 'oname') ? String(obj.oextra.oname) : '';
}

function isBlind(env) {
    const property = env.state.u?.uprops?.[BLINDED];
    if (!property)
        throw new Error('Blind requires initialized u.uprops');
    return Boolean((property.intrinsic || property.extrinsic)
        && !property.blocked);
}

function isHallucinating(env) {
    const hallucination = env.state.u?.uprops?.[HALLUC];
    const resistance = env.state.u?.uprops?.[HALLUC_RES];
    if (!hallucination || !resistance)
        throw new Error('Hallucination requires initialized u.uprops');
    return Boolean(hallucination.intrinsic
        && !(resistance.intrinsic || resistance.extrinsic));
}

function isCleric(state) {
    return state.urole?.filecode === 'Pri';
}

// C ref: invent.c mergable(). Checks whose answer depends on unported shops or
// monsters require a hook at the point where that dependency becomes live.
export function mergable(otmp, obj, env = {}) {
    const normalized = inventoryEnv(env);
    const type = objectType(obj, normalized.state);
    if (obj === otmp
        || obj.otyp !== otmp.otyp
        || obj.nomerge
        || otmp.nomerge
        || !type.oc_merge) {
        return false;
    }
    if (obj.oclass === COIN_CLASS) return true;
    if (Boolean(obj.cursed) !== Boolean(otmp.cursed)
        || Boolean(obj.blessed) !== Boolean(otmp.blessed)) {
        return false;
    }
    if (obj.how_lost === LOST_EXPLODING
        || otmp.how_lost === LOST_EXPLODING) {
        return false;
    }
    if (otmp.how_lost !== LOST_NONE && obj.how_lost !== otmp.how_lost)
        return false;
    if (obj.globby) return true;

    if (Boolean(obj.unpaid) !== Boolean(otmp.unpaid)
        || obj.spe !== otmp.spe
        || Boolean(obj.no_charge) !== Boolean(otmp.no_charge)
        || Boolean(obj.obroken) !== Boolean(otmp.obroken)
        || Boolean(obj.otrapped) !== Boolean(otmp.otrapped)
        || Boolean(obj.lamplit) !== Boolean(otmp.lamplit)) {
        return false;
    }
    if (obj.oclass === FOOD_CLASS
        && (obj.oeaten !== otmp.oeaten || obj.orotten !== otmp.orotten)) {
        return false;
    }

    let perceptionBlocksComparison;
    const blindOrHallucinating = () => {
        if (perceptionBlocksComparison === undefined) {
            perceptionBlocksComparison = isBlind(normalized)
                || isHallucinating(normalized);
        }
        return perceptionBlocksComparison;
    };
    if (Boolean(obj.dknown) !== Boolean(otmp.dknown)
        || (Boolean(obj.bknown) !== Boolean(otmp.bknown)
            && !isCleric(normalized.state)
            && blindOrHallucinating())
        || obj.oeroded !== otmp.oeroded
        || obj.oeroded2 !== otmp.oeroded2
        || Boolean(obj.greased) !== Boolean(otmp.greased)) {
        return false;
    }
    if (erosionMatters(obj, normalized.state)
        && (Boolean(obj.oerodeproof) !== Boolean(otmp.oerodeproof)
            || (Boolean(obj.rknown) !== Boolean(otmp.rknown)
                && blindOrHallucinating()))) {
        return false;
    }

    if (obj.otyp === CORPSE || obj.otyp === EGG || obj.otyp === TIN) {
        if (obj.corpsenm !== otmp.corpsenm) return false;
    }
    if (obj.otyp === EGG && (obj.timed || otmp.timed)) return false;
    if (obj.otyp === CORPSE && obj.corpsenm >= 0) {
        const isReviver = requiredHook(normalized, 'isReviver', obj);
        if (isReviver(obj.corpsenm, normalized)) return false;
    }
    if (isCandle(obj)
        && Math.trunc(obj.age / 25) !== Math.trunc(otmp.age / 25)) {
        return false;
    }
    if (obj.otyp === POT_OIL && obj.lamplit) return false;
    if (obj.unpaid) {
        const samePrice = requiredHook(normalized, 'samePrice', obj);
        if (!samePrice(obj, otmp, normalized)) return false;
    }
    if (obj.oextra?.omonst
        || obj.oextra?.omid
        || otmp.oextra?.omonst
        || otmp.oextra?.omid) {
        return false;
    }

    const objName = oname(obj);
    const targetName = oname(otmp);
    if ((objName.length !== targetName.length
         && ((objName.length && targetName.length) || obj.otyp === CORPSE))
        || (objName && targetName && objName !== targetName)) {
        return false;
    }
    const objMail = hasTextExtra(obj, 'omailcmd') ? String(obj.oextra.omailcmd) : '';
    const targetMail = hasTextExtra(otmp, 'omailcmd')
        ? String(otmp.oextra.omailcmd)
        : '';
    if (objMail !== targetMail) return false;
    if (obj.otyp === SCR_MAIL
        && obj.spe > 0
        && obj.o_id % 2 !== otmp.o_id % 2) {
        return false;
    }
    if (obj.oartifact !== otmp.oartifact) return false;
    if (Boolean(obj.known) !== Boolean(otmp.known)
        && blindOrHallucinating()) {
        return false;
    }
    return true;
}

function stopObjectTimers(obj, env) {
    requiredHook(env, 'stopObjectTimers', obj)(obj, env);
    if (obj.timed)
        throw new Error('stopObjectTimers must clear obj.timed');
}

function oidPriceAdjustment(obj, oid, state) {
    const type = objectType(obj, state);
    const canVary = !(obj.dknown && type.oc_name_known)
        && (obj.oclass !== GEM_CLASS || type.oc_material !== GLASS);
    return canVary && oid % 4 === 0 ? 1 : 0;
}

function deleteContents(container, env) {
    while (container.cobj) {
        const obj = container.cobj;
        container.cobj = extractNobj(obj, container.cobj);
        obj.ocontainer = null;
        obfree(obj, null, env);
    }
}

function preflightObfree(obj, merge, env) {
    if (obj.otyp === LEASH && obj.leashmon)
        requiredHook(env, 'unleashObject', obj);
    // useupall() runs freeinv_core() first, which stops a carried figurine's
    // transform timer before obfree() reaches deallocation.
    const timerStopsDuringFreeinv = obj.where === OBJ_INVENT
        && obj.otyp === FIGURINE;
    if (obj.timed && !timerStopsDuringFreeinv)
        requiredHook(env, 'stopObjectTimers', obj);
    if (obj.lamplit && !merge)
        requiredHook(env, 'deleteObjectLightSource', obj);
    if (obj.owornmask && !(merge && merge.where === OBJ_INVENT))
        requiredHook(env, 'setNotWorn', obj);
    if (isContainer(obj)) {
        const lock = env.state.xlock ?? env.state.context?.xlock;
        if (lock?.box === obj) requiredHook(env, 'resetPick', obj);
    }
    if (obj.unpaid || merge?.unpaid || obj.where === OBJ_ONBILL)
        requiredHook(env, 'obfreeShopBill', obj);
    for (let contents = obj.cobj; contents; contents = contents.nobj)
        preflightObfree(contents, null, env);
}

function comparisonWillDiscover(otmp, obj, state) {
    const targetBknown = otmp.oclass === COIN_CLASS ? false : otmp.bknown;
    return Boolean(obj.known) !== Boolean(otmp.known)
        || (Boolean(obj.rknown) !== Boolean(otmp.rknown)
            && Boolean(otmp.oerodeproof))
        || (Boolean(obj.bknown) !== Boolean(targetBknown)
            && !isCleric(state));
}

// C ref: shk.c obfree(). The general shop bill is not ported; encountering a
// billed object fails at that seam. Owned startup objects still preserve the
// source's o_id-based price adjustment when stacks merge.
function obfree(obj, merge, env) {
    if (obj.otyp === LEASH && obj.leashmon)
        requiredHook(env, 'unleashObject', obj)(obj, env);

    if (obj.oclass === FOOD_CLASS) {
        if (env.state.context?.victual?.piece === obj) {
            env.state.context.victual = { piece: null, o_id: 0 };
        }
        if (obj.timed) stopObjectTimers(obj, env);
    }
    if (obj.oclass === SPBOOK_CLASS
        && env.state.context?.spbook?.book === obj) {
        env.state.context.spbook.book = null;
        env.state.context.spbook.o_id = 0;
    }
    if (obj.cobj) deleteContents(obj, env);
    if (isContainer(obj)) {
        const lock = env.state.xlock ?? env.state.context?.xlock;
        if (lock?.box === obj)
            requiredHook(env, 'resetPick', obj)(obj, env);
    }
    if (obj.otyp === BOULDER) obj.next_boulder = 0;

    let shopDisposition = null;
    if (obj.unpaid || merge?.unpaid || obj.where === OBJ_ONBILL) {
        const disposition = requiredHook(env, 'obfreeShopBill', obj)(
            obj,
            merge,
            env,
        );
        if (disposition === 'retained') {
            if (merge)
                throw new Error('obfreeShopBill cannot retain a merged object');
            if (obj.where !== OBJ_ONBILL) {
                throw new Error(
                    'obfreeShopBill retained object must be on the bill chain',
                );
            }
            return;
        }
        if (disposition === 'billed' && !merge) {
            throw new Error('obfreeShopBill billed disposition requires merge');
        }
        if (disposition !== 'billed' && disposition !== 'unbilled') {
            throw new Error(
                'obfreeShopBill must return retained, billed, or unbilled',
            );
        }
        shopDisposition = disposition;
    }
    if (merge
        && shopDisposition !== 'billed'
        && oidPriceAdjustment(obj, obj.o_id, env.state)
            > oidPriceAdjustment(merge, merge.o_id, env.state)) {
        merge.o_id = obj.o_id;
    }

    if (obj.owornmask) {
        requiredHook(env, 'setNotWorn', obj)(obj, env);
        if (obj.owornmask)
            throw new Error('setNotWorn must clear owornmask');
    }
    dealloc_obj(obj, env);
}

// C ref: invent.c merged(). Returns true when `obj` was absorbed into otmp.
export function merged(otmp, obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (!mergable(otmp, obj, normalized)) return false;

    if (obj.lamplit) requiredHook(normalized, 'mergeLightSources', obj);
    if (obj.timed) requiredHook(normalized, 'stopObjectTimers', obj);
    if (obj.owornmask && otmp.where === OBJ_INVENT)
        requiredHook(normalized, 'mergeWornMasks', obj);
    if (obj.globby) requiredHook(normalized, 'absorbGlob', obj);
    if (!obj.globby
        && comparisonWillDiscover(otmp, obj, normalized.state)
        && otmp.where === OBJ_INVENT
        && obj.how_lost !== LOST_THROWN
        && otmp.how_lost !== LOST_THROWN) {
        requiredHook(normalized, 'inventoryComparisonDiscovered', otmp);
    }
    preflightObjectExtraction(obj, normalized);
    if (!obj.globby) preflightObfree(obj, otmp, normalized);
    if (otmp.oclass === COIN_CLASS || !isPudding(otmp))
        preflightWeight(otmp, normalized);

    if (!obj.lamplit && !obj.globby) {
        obj.age = Math.trunc(obj.age);
        otmp.age = Math.trunc(
            (otmp.age * otmp.quan + obj.age * obj.quan)
            / (otmp.quan + obj.quan),
        );
    }
    if (!otmp.globby) otmp.quan += obj.quan;
    if (otmp.oclass === COIN_CLASS) {
        otmp.owt = weight(otmp, normalized);
        otmp.bknown = false;
    } else if (!isPudding(otmp)) {
        otmp.owt = weight(otmp, normalized);
    }

    if (!oname(otmp) && oname(obj)) {
        otmp.oextra ??= {};
        otmp.oextra.oname = obj.oextra.oname;
    }
    obj_extract_self(obj, normalized);
    if (obj.pickup_prev && otmp.where === OBJ_INVENT)
        otmp.pickup_prev = true;

    if (obj.lamplit) {
        requiredHook(normalized, 'mergeLightSources', obj)(obj, otmp, normalized);
        obj.lamplit = false;
    }
    if (obj.timed) stopObjectTimers(obj, normalized);

    let discovered = false;
    if (Boolean(obj.known) !== Boolean(otmp.known)) {
        otmp.known = true;
        discovered = true;
    }
    if (Boolean(obj.rknown) !== Boolean(otmp.rknown)) {
        otmp.rknown = true;
        if (otmp.oerodeproof) discovered = true;
    }
    if (Boolean(obj.bknown) !== Boolean(otmp.bknown)) {
        otmp.bknown = true;
        if (!isCleric(normalized.state)) discovered = true;
    }

    if (obj.owornmask && otmp.where === OBJ_INVENT) {
        requiredHook(normalized, 'mergeWornMasks', obj)(otmp, obj, normalized);
        if (obj.owornmask)
            throw new Error('mergeWornMasks must clear incoming owornmask');
    }
    if (obj.bypass) otmp.bypass = true;
    if (obj.globby) {
        requiredHook(normalized, 'absorbGlob', obj)(otmp, obj, normalized);
        const absorbed = obj.where === OBJ_DELETED || obj.where === OBJ_LUAFREE;
        if (!absorbed || obj.nobj || obj.nexthere || obj.cobj) {
            throw new Error(
                'absorbGlob must deallocate the absorbed object',
            );
        }
        if (otmp.where === OBJ_DELETED || otmp.where === OBJ_LUAFREE)
            throw new Error('absorbGlob must preserve the target object');
        return true;
    }
    if (discovered
        && otmp.where === OBJ_INVENT
        && obj.how_lost !== LOST_THROWN
        && otmp.how_lost !== LOST_THROWN) {
        requiredHook(
            normalized,
            'inventoryComparisonDiscovered',
            otmp,
        )(otmp, normalized);
    }
    obfree(obj, otmp, normalized);
    return true;
}

function inventoryIndex(invlet) {
    if (typeof invlet !== 'string' || invlet.length !== 1) return -1;
    const code = invlet.charCodeAt(0);
    if (code >= 97 && code <= 122) return code - 97;
    if (code >= 65 && code <= 90) return code - 65 + 26;
    return -1;
}

function inventoryLetter(index) {
    return index < 26
        ? String.fromCharCode(97 + index)
        : String.fromCharCode(65 + index - 26);
}

// C ref: invent.c assigninvlet().
export function assigninvlet(obj, state = game) {
    if (obj.oclass === COIN_CLASS) {
        obj.invlet = '$';
        return obj.invlet;
    }
    const inUse = new Array(INVLET_BASIC).fill(false);
    for (let current = inventoryHead(state); current; current = current.nobj) {
        if (current === obj) continue;
        const index = inventoryIndex(current.invlet);
        if (index >= 0) inUse[index] = true;
        if (current.invlet === obj.invlet) obj.invlet = '';
    }
    let index = inventoryIndex(obj.invlet);
    if (index >= 0) return obj.invlet;

    const previous = Number.isInteger(state.lastinvnr)
        ? state.lastinvnr
        : INVLET_BASIC - 1;
    for (index = previous + 1; index !== previous; ++index) {
        if (index === INVLET_BASIC) {
            index = -1;
            continue;
        }
        if (!inUse[index]) break;
    }
    obj.invlet = inUse[index] ? NOINVSYM : inventoryLetter(index);
    state.lastinvnr = index;
    return obj.invlet;
}

function inventoryRank(obj) {
    if (typeof obj.invlet !== 'string' || !obj.invlet) return 0;
    return obj.invlet.charCodeAt(0) ^ 0o40;
}

function reorderInventory(state) {
    let needsSorting;
    do {
        needsSorting = false;
        let previous = null;
        let current = inventoryHead(state);
        while (current) {
            const next = current.nobj;
            if (next && inventoryRank(next) < inventoryRank(current)) {
                needsSorting = true;
                if (previous) previous.nobj = next;
                else setInventoryHead(state, next);
                current.nobj = next.nobj;
                next.nobj = current;
                previous = next;
            } else {
                previous = current;
                current = next;
            }
        }
    } while (needsSorting);
}

function resetJustPicked(head) {
    for (let obj = head; obj; obj = obj.nobj)
        obj.pickup_prev = false;
}

function clearContainedNoCharge(container) {
    for (let obj = container.cobj; obj; obj = obj.nobj) {
        if (obj.oclass !== COIN_CLASS)
            obj.no_charge = false;
        if (obj.cobj) clearContainedNoCharge(obj);
    }
}

function specialPrize(obj, state) {
    const achieveo = state.context?.achieveo;
    if (!achieveo) return null;
    // Prize ids use zero as their inactive sentinel.  Live object ids are
    // nonzero, so make that invariant explicit for hand-built JS objects too.
    if (achieveo.mines_prize_oid
        && obj.o_id === achieveo.mines_prize_oid) {
        return {
            achievement: ACH_MINE_PRIZE,
            oidField: 'mines_prize_oid',
        };
    }
    if (achieveo.soko_prize_oid
        && obj.o_id === achieveo.soko_prize_oid) {
        return {
            achievement: ACH_SOKO_PRIZE,
            oidField: 'soko_prize_oid',
        };
    }
    return null;
}

function addinvCore1(obj, env, facts) {
    if (obj.oclass === COIN_CLASS) {
        env.state.disp ??= {};
        env.state.disp.botl = true;
    } else if (obj.otyp === AMULET_OF_YENDOR
               || obj.otyp === CANDELABRUM_OF_INVOCATION
               || obj.otyp === BELL_OF_OPENING
               || obj.otyp === SPE_BOOK_OF_THE_DEAD
               || obj.oartifact) {
        requiredHook(env, 'addSpecialInventoryEffects', obj)(obj, env);
    }

    // C ref: invent.c addinv_core1().  Special-level creation sets nomerge
    // only until the tracked prize reaches the hero's inventory.
    if (facts.prize) {
        requiredHook(env, 'recordAchievement', obj)(
            facts.prize.achievement,
            env,
        );
        env.state.context.achieveo[facts.prize.oidField] = 0;
        obj.nomerge = false;
    }
}

function preflightAddinvCores(obj, env) {
    if (obj.otyp === AMULET_OF_YENDOR
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === BELL_OF_OPENING
        || obj.otyp === SPE_BOOK_OF_THE_DEAD
        || obj.oartifact) {
        requiredHook(env, 'addSpecialInventoryEffects', obj);
    }
    const prize = specialPrize(obj, env.state);
    if (prize) requiredHook(env, 'recordAchievement', obj);
    let confersLuck = obj.otyp === LUCKSTONE;
    if (obj.oartifact && obj.otyp !== LUCKSTONE) {
        confersLuck = Boolean(
            requiredHook(env, 'artifactConfersLuck', obj)(obj, env),
        );
    }
    if (confersLuck) requiredHook(env, 'recalculateLuck', obj);
    if (env.state.urole?.filecode === 'Arc'
        && obj.oclass === SCROLL_CLASS
        && obj.otyp !== SCR_BLANK_PAPER
        && !isBlind(env)
        && !objectType(obj, env.state).oc_name_known) {
        requiredHook(env, 'archeologistDeciphersScroll', obj);
    }
    return { confersLuck, prize };
}

function addinvCore2(obj, env, facts) {
    if (obj.otyp === LUCKSTONE || obj.oartifact) {
        if (facts.confersLuck)
            requiredHook(env, 'recalculateLuck', obj)(obj, env);
    }

    // The Archeologist's scroll-label side effect can become reachable only
    // after its startup inventory changes; keep it behind a named seam.
    if (env.state.urole?.filecode === 'Arc'
        && obj.oclass === SCROLL_CLASS
        && obj.otyp !== SCR_BLANK_PAPER
        && !isBlind(env)
        && !objectType(obj, env.state).oc_name_known) {
        requiredHook(env, 'archeologistDeciphersScroll', obj)(obj, env);
    }
}

function carryObjectEffects(obj, env, shouldAttachFigurineTimer) {
    if (shouldAttachFigurineTimer) {
        requiredHook(env, 'attachFigurineTimer', obj)(obj, env);
        if (obj.timed !== 1)
            throw new Error('attachFigurineTimer must leave one object timer');
    }
}

function isAmmo(obj, state) {
    const skill = objectType(obj, state).oc_subtyp;
    return (obj.oclass === WEAPON_CLASS || obj.oclass === GEM_CLASS)
        && skill >= -P_CROSSBOW
        && skill <= -P_BOW;
}

function isThrowingWeapon(obj, state) {
    const type = objectType(obj, state);
    const skill = type.oc_subtyp;
    const missile = (obj.oclass === WEAPON_CLASS || obj.oclass === TOOL_CLASS)
        && skill >= -P_BOOMERANG
        && skill <= -P_DART;
    const spear = obj.oclass === WEAPON_CLASS && skill === P_SPEAR;
    const blade = obj.oclass === WEAPON_CLASS
        && skill >= P_DAGGER
        && skill <= P_SABER;
    const sword = obj.oclass === WEAPON_CLASS
        && skill >= P_SHORT_SWORD
        && skill <= P_SABER;
    return missile
        || spear
        || (blade && !sword && Boolean(type.oc_dir & PIERCE))
        || obj.otyp === WAR_HAMMER
        || obj.otyp === AKLYS;
}

function shouldAutoquiver(obj, state) {
    return obj.oartifact !== ART_MJOLLNIR
        && obj.otyp !== AKLYS
        && (isThrowingWeapon(obj, state) || isAmmo(obj, state));
}

function setQuiver(obj, env) {
    if (env.state.uquiver)
        env.state.uquiver.owornmask &= ~W_QUIVER;
    env.state.uquiver = obj;
    obj.owornmask |= W_QUIVER;
    update_inventory(env);
}

// C ref: invent.c addinv_core0() and addinv().
export function addinv(obj, env = {}) {
    const normalized = inventoryEnv(env);
    const { state } = normalized;
    if (obj.where !== OBJ_FREE)
        throw new Error(`addinv: object where=${obj.where}, expected OBJ_FREE`);
    if (obj.nobj || obj.nexthere)
        throw new Error('addinv: free object retains a chain link');
    if (obj.how_lost === LOST_EXPLODING) return null;

    requireInventoryRefresh(normalized);
    const addinvFacts = preflightAddinvCores(obj, normalized);
    const willConsiderAutoquiver = obj.how_lost === LOST_THROWN
        && state.flags?.pickup_thrown
        && !state.uquiver;
    let shouldAttachFigurineTimer = false;
    if (obj.otyp === FIGURINE
        && obj.cursed
        && obj.corpsenm !== NON_PM) {
        shouldAttachFigurineTimer = !requiredHook(
            normalized,
            'isDeadSpecies',
            obj,
        )(obj.corpsenm, true, normalized);
        if (shouldAttachFigurineTimer)
            requiredHook(normalized, 'attachFigurineTimer', obj);
    }

    obj.no_charge = false;
    if (obj.cobj) clearContainedNoCharge(obj);
    obj.how_lost = LOST_NONE;
    if (state.loot_reset_justpicked) {
        state.loot_reset_justpicked = false;
        resetJustPicked(inventoryHead(state));
    }

    let inserted = false;
    addinvCore1(obj, normalized, addinvFacts);
    if (state.uquiver && merged(state.uquiver, obj, normalized)) {
        obj = state.uquiver;
    } else {
        let previous = null;
        let current = inventoryHead(state);
        while (current && !merged(current, obj, normalized)) {
            previous = current;
            current = current.nobj;
        }
        if (current) {
            obj = current;
        } else {
            assigninvlet(obj, state);
            const fixedLetters = state.flags?.invlet_constant ?? true;
            if (fixedLetters || !previous) {
                obj.nobj = inventoryHead(state);
                setInventoryHead(state, obj);
                if (fixedLetters) reorderInventory(state);
            } else {
                previous.nobj = obj;
                obj.nobj = null;
            }
            obj.where = OBJ_INVENT;
            inserted = true;
        }
    }

    if (inserted
        && willConsiderAutoquiver
        && shouldAutoquiver(obj, state))
        setQuiver(obj, normalized);
    obj.pickup_prev = true;
    addinvCore2(obj, normalized, addinvFacts);
    carryObjectEffects(obj, normalized, shouldAttachFigurineTimer);
    update_inventory(normalized);
    return obj;
}

export function addinv_nomerge(obj, env = {}) {
    const previous = obj.nomerge;
    obj.nomerge = true;
    try {
        return addinv(obj, env);
    } finally {
        obj.nomerge = previous;
    }
}

// C ref: mkobj.c add_to_minv(). Returns true when `obj` merged into an
// existing stack and was freed, false when it was linked into the inventory.
export function add_to_minv(monster, obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (!monster || typeof monster !== 'object')
        throw new TypeError('add_to_minv requires a monster');
    if (obj.where !== OBJ_FREE) {
        throw new Error(
            `add_to_minv: object where=${obj.where}, expected OBJ_FREE`,
        );
    }

    for (let current = monster.minvent; current; current = current.nobj) {
        if (merged(current, obj, normalized)) return true;
    }
    obj.where = OBJ_MINVENT;
    obj.ocarry = monster;
    obj.nobj = monster.minvent ?? null;
    monster.minvent = obj;
    return false;
}

export function add_to_container(container, obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (obj.where !== OBJ_FREE) {
        throw new Error(
            `add_to_container: object where=${obj.where}, expected OBJ_FREE`,
        );
    }
    if (obj.nobj || obj.nexthere) {
        throw new Error(
            'add_to_container: free object retains a chain link',
        );
    }
    if (container.where !== OBJ_INVENT && container.where !== OBJ_MINVENT) {
        requiredHook(normalized, 'objectNoLongerHeld', obj)(obj, normalized);
    }

    for (let current = container.cobj; current; current = current.nobj) {
        if (merged(current, obj, normalized)) return current;
    }
    obj.where = OBJ_CONTAINED;
    obj.ocontainer = container;
    obj.nobj = container.cobj;
    container.cobj = obj;
    return obj;
}

export function useupall(obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (obj.where !== OBJ_INVENT)
        throw new Error('useupall requires an inventory object');
    requireInventoryRefresh(normalized);
    preflightFreeinvCore(obj, normalized);
    preflightObfree(obj, null, normalized);
    if (obj.owornmask) {
        requiredHook(normalized, 'setNotWorn', obj)(obj, normalized);
        if (obj.owornmask)
            throw new Error('setNotWorn must clear owornmask');
    }
    freeinv(obj, normalized);
    obfree(obj, null, normalized);
}

export function resetInventory(env = {}) {
    const normalized = inventoryEnv(env);
    requireInventoryRefresh(normalized);
    for (let obj = inventoryHead(normalized.state); obj; obj = obj.nobj) {
        preflightFreeinvCore(obj, normalized);
        preflightObfree(obj, null, normalized);
    }
    normalized.state.lastinvnr = INVLET_BASIC - 1;
    while (inventoryHead(normalized.state))
        useupall(inventoryHead(normalized.state), normalized);
    return normalized.state;
}

export function money_cnt(head = inventoryHead(game)) {
    for (let obj = head; obj; obj = obj.nobj) {
        if (obj.oclass === COIN_CLASS) return obj.quan;
    }
    return 0;
}
