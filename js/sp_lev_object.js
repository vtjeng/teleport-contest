// Special-level object creation.
// C ref: sp_lev.c create_object()/lspo_object().

import {
    CORPSTAT_FEMALE,
    CORPSTAT_HISTORIC,
    CORPSTAT_MALE,
    DRY,
    NON_PM,
    SP_COORD_IS_RANDOM,
} from './const.js';
import { bury_an_obj } from './bury.js';
import { game } from './gstate.js';
import {
    add_to_container,
    delete_contents,
    obfree,
    stackobj,
} from './invent.js';
import { rndmonnum } from './makemon.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    mkgold,
    mkobj_at,
    mksobj_at,
    objectType,
    remove_object,
    set_corpsenm,
    weight,
} from './obj.js';
import {
    BAG_OF_HOLDING,
    COIN_CLASS,
    CORPSE,
    EGG,
    FIGURINE,
    RANDOM_CLASS,
    STATUE,
    TIN,
} from './objects.js';
import { get_location_coord } from './room_coordinates.js';
import { begin_burn } from './timeout.js';

const MAX_CONTAINMENT = 10;

export class UnsupportedSpecialObjectError extends Error {
    constructor(operation, specification = null) {
        super(`special-level object requires ${operation}`);
        this.name = 'UnsupportedSpecialObjectError';
        this.operation = operation;
        this.specification = specification;
    }
}

// The C loader keeps a process-global stack while one level is decoded. JS
// scopes the same stack to one synchronous special-level or themed-room fill.
export function new_sp_lev_object_context() {
    return { containers: [] };
}

function specialObjectEnvironment(rawEnv = {}) {
    const context = rawEnv.spObjectContext
        ?? new_sp_lev_object_context();
    if (!context || !Array.isArray(context.containers)) {
        throw new TypeError(
            'special-level object context requires a containers array',
        );
    }
    return objectGenerationEnv({
        ...rawEnv,
        state: rawEnv.state ?? game,
        spObjectContext: context,
    });
}

function packedCoordinate(specification) {
    const coordinate = specification.coordinate;
    if (coordinate == null) return SP_COORD_IS_RANDOM;
    if (!Number.isInteger(coordinate.x)
        || !Number.isInteger(coordinate.y)) {
        throw new TypeError(
            'special-level object coordinate requires integer x and y',
        );
    }
    return (coordinate.x & 0xff) | ((coordinate.y & 0xff) << 16);
}

function normalizedBuc(specification) {
    if (specification.buc != null) return specification.buc;
    if (specification.notBlessed) return 'not-blessed';
    return 'random';
}

function normalizedSpe(specification) {
    if (specification.id === CORPSE || specification.id === STATUE) {
        return (specification.historic ? CORPSTAT_HISTORIC : 0)
            | (specification.male ? CORPSTAT_MALE : 0)
            | (specification.female ? CORPSTAT_FEMALE : 0);
    }
    if (specification.id === EGG)
        return specification.laidByYou ? 1 : 0;
    if (specification.id === TIN || specification.id === FIGURINE)
        return 0;
    return specification.spe ?? -127;
}

function normalizeSpecification(specification, context) {
    if (!specification || typeof specification !== 'object') {
        throw new TypeError('special-level object requires a specification');
    }
    if (specification.id != null
        && !Number.isInteger(specification.id)) {
        throw new TypeError('special-level object id must be an integer');
    }
    if (specification.class != null
        && !Number.isInteger(specification.class)) {
        throw new TypeError('special-level object class must be an integer');
    }
    if (specification.contents != null
        && typeof specification.contents !== 'function') {
        throw new TypeError(
            'special-level object contents must be a function',
        );
    }
    return {
        ...specification,
        spe: normalizedSpe(specification),
        buc: normalizedBuc(specification),
        corpsenm: specification.corpsenm ?? NON_PM,
        quantity: specification.quantity ?? -1,
        buried: Boolean(specification.buried),
        lit: Boolean(specification.lit),
        eroded: specification.eroded ?? 0,
        locked: specification.locked == null
            ? -1
            : Number(Boolean(specification.locked)),
        trapped: specification.trapped == null
            ? -1
            : Number(Boolean(specification.trapped)),
        trapKnown: specification.trapKnown == null
            ? -1
            : Number(Boolean(specification.trapKnown)),
        recharged: specification.recharged ?? 0,
        greased: Boolean(specification.greased),
        broken: Boolean(specification.broken),
        achievement: Boolean(specification.achievement),
        content: context.containers.length > 0,
        container: typeof specification.contents === 'function',
        packedCoordinate: packedCoordinate(specification),
    };
}

function bagWeight(obj, env) {
    if (obj.otyp === BAG_OF_HOLDING) obj.owt = weight(obj, env);
}

function blessSpecialObject(obj, env) {
    if (obj.oclass === COIN_CLASS) return;
    obj.cursed = false;
    obj.blessed = true;
    bagWeight(obj, env);
}

function unblessSpecialObject(obj, env) {
    obj.blessed = false;
    bagWeight(obj, env);
}

function curseSpecialObject(obj, env) {
    if (obj.oclass === COIN_CLASS) return;
    obj.blessed = false;
    obj.cursed = true;
    bagWeight(obj, env);
}

function uncurseSpecialObject(obj, env) {
    obj.cursed = false;
    bagWeight(obj, env);
}

function blessorcurseSpecialObject(obj, env) {
    if (obj.blessed || obj.cursed) return;
    if (!env.random.rn2(1)) {
        if (env.random.rn2(2)) blessSpecialObject(obj, env);
        else curseSpecialObject(obj, env);
    }
}

function applyBuc(obj, buc, env, specification) {
    switch (buc) {
    case 0:
    case 'random':
        break;
    case 1:
    case 'blessed':
        blessSpecialObject(obj, env);
        break;
    case 2:
    case 'uncursed':
        unblessSpecialObject(obj, env);
        uncurseSpecialObject(obj, env);
        break;
    case 3:
    case 'cursed':
        curseSpecialObject(obj, env);
        break;
    case 4:
    case 'not-cursed':
        uncurseSpecialObject(obj, env);
        break;
    case 5:
    case 'not-uncursed':
        blessorcurseSpecialObject(obj, env);
        break;
    case 6:
    case 'not-blessed':
        unblessSpecialObject(obj, env);
        break;
    default:
        throw new UnsupportedSpecialObjectError(
            `BUC state ${String(buc)}`,
            specification,
        );
    }
}

function constructObject(specification, coordinate, env) {
    const named = specification.name != null;
    if (specification.id != null) {
        return mksobj_at(
            specification.id,
            coordinate.x,
            coordinate.y,
            true,
            !named,
            env,
        );
    }
    const objectClass = specification.class ?? RANDOM_CLASS;
    if (objectClass === COIN_CLASS) {
        return mkgold(0, coordinate.x, coordinate.y, env);
    }
    return mkobj_at(
        objectClass,
        coordinate.x,
        coordinate.y,
        !named,
        env,
    );
}

function applyObjectFields(obj, specification, env) {
    if (specification.spe !== -127) obj.spe = specification.spe;
    applyBuc(obj, specification.buc, env, specification);

    if (specification.corpsenm !== NON_PM) {
        const species = specification.corpsenm === NON_PM - 1
            ? rndmonnum(env)
            : specification.corpsenm;
        set_corpsenm(obj, species, env);
    }

    if (specification.name != null) {
        const nameObject = env.hooks.nameObject;
        if (typeof nameObject !== 'function') {
            throw new UnsupportedSpecialObjectError(
                'named-object creation',
                specification,
            );
        }
        obj = nameObject(obj, String(specification.name), env);
        if (!obj) {
            throw new UnsupportedSpecialObjectError(
                'a named-object result',
                specification,
            );
        }
    }

    if (specification.eroded) {
        if (specification.eroded < 0) {
            obj.oerodeproof = true;
        } else {
            obj.oeroded = specification.eroded % 4;
            obj.oeroded2 = (specification.eroded >> 2) % 4;
        }
    } else {
        obj.oeroded = 0;
        obj.oeroded2 = 0;
        obj.oerodeproof = false;
    }
    if (specification.recharged)
        obj.recharged = specification.recharged % 8;
    if (specification.locked === 0 || specification.locked === 1) {
        obj.olocked = Boolean(specification.locked);
    } else if (specification.broken) {
        obj.obroken = true;
        obj.olocked = false;
    }
    if (specification.trapped === 0 || specification.trapped === 1)
        obj.otrapped = Boolean(specification.trapped);
    if (specification.trapped
        && (specification.trapKnown === 0
            || specification.trapKnown === 1)) {
        obj.tknown = Boolean(specification.trapKnown);
    }
    obj.greased = specification.greased;

    const type = objectType(obj, env.state);
    if (specification.quantity > 0 && type.oc_merge) {
        obj.quan = specification.quantity;
        obj.owt = weight(obj, env);
    }
    return obj;
}

function impossible(message, env) {
    if (typeof env.hooks.impossible === 'function')
        env.hooks.impossible(message, env);
}

function putInCurrentContainer(obj, context, env) {
    const parent = context.containers[context.containers.length - 1];
    remove_object(obj, env);
    if (!parent) {
        if (obj.oartifact) {
            throw new UnsupportedSpecialObjectError(
                'artifact uncreation for a missing container',
            );
        }
        obfree(obj, null, env);
        return null;
    }
    const survivor = add_to_container(parent, obj, env);
    parent.owt = weight(parent, env);
    return survivor;
}

function pushContainer(obj, context, env) {
    delete_contents(obj, env);
    if (context.containers.length < MAX_CONTAINMENT) {
        context.containers.push(obj);
    } else {
        impossible('create_object: too deeply nested containers.', env);
    }
}

function finalizeTopLevelObject(obj, specification, context, env) {
    stackobj(obj, env);
    if (specification.lit) begin_burn(obj, false, env);
    if (!specification.buried) return obj;

    const { deallocated } = bury_an_obj(obj, env);
    if (!deallocated) return obj;
    if (context.containers.length) {
        context.containers[context.containers.length - 1] = null;
    }
    return null;
}

function createOneObject(specification, croom, env) {
    const context = env.spObjectContext;
    const coordinate = { x: -1, y: -1 };
    get_location_coord(
        coordinate,
        DRY,
        croom,
        specification.packedCoordinate,
        env,
    );

    let obj = constructObject(specification, coordinate, env);
    obj = applyObjectFields(obj, specification, env);

    if (specification.content) {
        obj = putInCurrentContainer(obj, context, env);
        if (!obj) return null;
    }
    if (specification.container && obj)
        pushContainer(obj, context, env);

    if (specification.achievement) {
        const recordAchievementObject = env.hooks.recordAchievementObject;
        if (typeof recordAchievementObject !== 'function') {
            throw new UnsupportedSpecialObjectError(
                'achievement-object creation',
                specification,
            );
        }
        recordAchievementObject(obj, env);
    }

    if (!specification.content && obj)
        obj = finalizeTopLevelObject(obj, specification, context, env);
    return obj;
}

// Source-shaped single-object primitive. A caller using this directly owns
// any container-stack pop, just as lspo_object() does around create_object().
export function create_object(specification, croom, rawEnv = {}) {
    const env = specialObjectEnvironment(rawEnv);
    const normalized = normalizeSpecification(
        specification,
        env.spObjectContext,
    );
    return createOneObject(normalized, croom, env);
}

// Lua-facing semantic operation: nonmergeable exact quantities create one
// object per unit, the callback sees the final result, then one container slot
// is popped when the descriptor declared contents.
export function lspo_object(specification, croom, rawEnv = {}) {
    const env = specialObjectEnvironment(rawEnv);
    const context = env.spObjectContext;
    const entryDepth = context.containers.length;
    const normalized = normalizeSpecification(specification, context);
    const exactType = normalized.id == null
        ? null
        : objectType(normalized.id, env.state);
    let remaining = normalized.id == null ? 0 : normalized.quantity;
    let obj;
    let completed = false;
    try {
        do {
            obj = createOneObject(normalized, croom, env);
            --remaining;
        } while (remaining > 0 && exactType && !exactType.oc_merge);

        if (typeof normalized.contents === 'function')
            normalized.contents(obj, env);
        completed = true;
    } finally {
        if (normalized.container
            && (completed || context.containers.length > entryDepth)) {
            context.containers.pop();
        }
    }
    return obj;
}
