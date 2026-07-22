// Special-level object creation.
// C ref: sp_lev.c create_object()/lspo_object().

import {
    CORPSTAT_FEMALE,
    CORPSTAT_HISTORIC,
    CORPSTAT_MALE,
    DRY,
    NON_PM,
    ONAME,
    ONAME_NO_FLAGS,
    SP_COORD_IS_RANDOM,
    W_SADDLE,
} from './const.js';
import { artifact_exists } from './artifacts.js';
import { bury_an_obj } from './bury.js';
import { lookup_novel } from './do_name.js';
import { can_saddle, put_saddle_on_mon } from './dog.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import {
    add_to_minv,
    add_to_container,
    delete_contents,
    obfree,
    stackobj,
} from './invent.js';
import { rndmonnum } from './makemon.js';
import { dead_species } from './mondata.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    mkgold,
    mkobj_at,
    mksobj_at,
    objectType,
    remove_object,
    set_corpsenm,
    unknow_object,
    weight,
} from './obj.js';
import {
    BAG_OF_HOLDING,
    COIN_CLASS,
    CORPSE,
    EGG,
    FIGURINE,
    RANDOM_CLASS,
    SADDLE,
    SPE_NOVEL,
    STATUE,
    TIN,
} from './objects.js';
import { get_location_coord } from './room_coordinates.js';
import {
    attach_fig_transform_timeout,
    begin_burn,
} from './timeout.js';

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
    return {
        containers: [],
        inventCarryingMonster: null,
    };
}

function specialObjectEnvironment(rawEnv = {}) {
    const context = rawEnv.spObjectContext
        ?? new_sp_lev_object_context();
    if (!context || !Array.isArray(context.containers)) {
        throw new TypeError(
            'special-level object context requires a containers array',
        );
    }
    if (context.inventCarryingMonster != null
        && typeof context.inventCarryingMonster !== 'object') {
        throw new TypeError(
            'special-level object carrier must be a monster or null',
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
    if (coordinate == null
        || (coordinate.x === -1 && coordinate.y === -1)) {
        return SP_COORD_IS_RANDOM;
    }
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

// The level descriptor stores spe in a signed short before create_object()
// compares its -127 sentinel.  The object itself narrows an assigned value to
// signed char afterward.
function signedShort(value) {
    const word = ((value % 0x10000) + 0x10000) % 0x10000;
    return word >= 0x8000 ? word - 0x10000 : word;
}

function signedChar(value) {
    const byte = ((value % 0x100) + 0x100) % 0x100;
    return byte >= 0x80 ? byte - 0x100 : byte;
}

function unsignedThreeBits(value) {
    return ((value % 8) + 8) % 8;
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
        spe: signedShort(normalizedSpe(specification)),
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
    // Source quirk: blessorcurse(otmp, 1) deliberately consumes rn2(1)
    // before its independent blessed-versus-cursed rn2(2) draw.
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
    if (specification.spe !== -127)
        obj.spe = signedChar(specification.spe);
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
        const namedObject = nameObject(
            obj,
            String(specification.name),
            env,
        );
        if (!namedObject) {
            throw new UnsupportedSpecialObjectError(
                'a named-object result',
                specification,
            );
        }
        // sp_lev.c oname() preserves identity and every ownership chain.
        if (namedObject !== obj) {
            throw new UnsupportedSpecialObjectError(
                'named-object identity preservation',
                specification,
            );
        }
        if (obj.otyp === SPE_NOVEL) {
            const lookedUp = lookup_novel(
                String(specification.name),
                obj.novelidx,
                env,
            );
            obj.novelidx = lookedUp.novelidx;
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
        obj.recharged = unsignedThreeBits(specification.recharged);
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

function achievementTracking(state) {
    const tracking = state.context?.achieveo;
    if (!tracking || typeof tracking !== 'object') {
        throw new Error(
            'special-level achievement objects require initialized achieveo',
        );
    }
    return tracking;
}

// C ref: sp_lev.c create_object() achievement branch.  Prize creation only
// registers identity and prevents floor stacking; invent.addinv() owns the
// later achievement award, oid clearing, and nomerge reset.
function initializeAchievementObject(obj, env) {
    const { state } = env;
    const tracking = achievementTracking(state);
    let oidField;
    let typeField;
    let levelName;
    if (on_level(state.u?.uz, state.mineend_level)) {
        oidField = 'mines_prize_oid';
        typeField = 'mines_prize_otyp';
        levelName = 'mines end';
    } else if (on_level(state.u?.uz, state.sokoend_level)) {
        oidField = 'soko_prize_oid';
        typeField = 'soko_prize_otyp';
        levelName = 'sokoban end';
    } else {
        if (!state.iflags?.lua_testing) {
            // Full describe_level()/simpleonames() formatting belongs to the
            // unported message-name boundary; retain the object type here so
            // malformed level data still produces a deterministic diagnostic.
            impossible(
                `create_object: unknown achievement object ${obj.otyp}`,
                env,
            );
        }
        return obj;
    }

    if (tracking[oidField]) {
        impossible(`multiple prizes on ${levelName} level`, env);
        return obj;
    }
    tracking[oidField] = obj.o_id;
    tracking[typeField] = obj.otyp;
    obj.nomerge = true;
    return obj;
}

function putInCurrentContainer(obj, context, env) {
    // A null entry is an active tombstone: the intended parent was destroyed
    // after being pushed (for example, a buried rock), so subsequent children
    // are created and then uncreated at the source's normal boundary.
    const parent = context.containers[context.containers.length - 1];
    remove_object(obj, env);
    if (!parent) {
        if (obj.oartifact) {
            artifact_exists(
                obj,
                ONAME(obj),
                false,
                ONAME_NO_FLAGS,
                env.state,
            );
        }
        obfree(obj, null, env);
        return null;
    }
    const survivor = add_to_container(parent, obj, env);
    parent.owt = weight(parent, env);
    return survivor;
}

function carrierCanSeeObject(monster, env, specification) {
    const canSeeMonster = env.hooks.canSeeMonster;
    if (typeof canSeeMonster === 'function')
        return Boolean(canSeeMonster(monster, env));
    // Special-level callbacks run while mklev has map visibility suppressed,
    // so the carrier is not visible.  A later live loader must provide the
    // complete canseemon() boundary explicitly.
    if (env.state.in_mklev) return false;
    throw new UnsupportedSpecialObjectError(
        'monster visibility for custom inventory',
        specification,
    );
}

function saddleRejectedBeforePickup(obj, monster) {
    if (obj.otyp !== SADDLE || !can_saddle(monster)) return false;
    for (let carried = monster.minvent; carried; carried = carried.nobj) {
        if (carried.owornmask & W_SADDLE) return true;
    }
    return false;
}

function preflightCarrierVisibility(obj, monster, env, specification) {
    // mpickobj() skips canseemon() for tame carriers.  For every other live
    // carrier, verify that JS owns the complete visibility boundary before
    // remove_object() unlinks the newly generated floor object.  The provider
    // itself still runs later at the source-ordered pickup point.
    if (!saddleRejectedBeforePickup(obj, monster)
        && !monster.mtame
        && !env.state.in_mklev
        && typeof env.hooks.canSeeMonster !== 'function') {
        throw new UnsupportedSpecialObjectError(
            'monster visibility for custom inventory',
            specification,
        );
    }
}

function putInCurrentMonster(obj, monster, env, specification) {
    preflightCarrierVisibility(obj, monster, env, specification);
    remove_object(obj, env);
    if (obj.otyp === SADDLE && can_saddle(monster)) {
        put_saddle_on_mon(obj, monster, {
            ...env,
            canseemon: (candidate) => carrierCanSeeObject(
                candidate,
                env,
                specification,
            ),
        });
        return obj;
    }

    obj.no_charge = false;
    if (!monster.mtame) {
        const canSeeCarrier = carrierCanSeeObject(
            monster,
            env,
            specification,
        );
        if (!canSeeCarrier && monster !== env.state.u?.ustuck)
            unknow_object(obj, env.state);
    }
    if (obj.otyp === FIGURINE
        && obj.cursed
        && obj.corpsenm !== NON_PM
        && !dead_species(obj.corpsenm, true, env)) {
        attach_fig_transform_timeout(obj, env);
    }
    // Source intentionally ignores mpickobj()'s "incoming object was freed"
    // result.  Keep this reference even when add_to_minv() merged and deleted
    // it; the callback and later source-ordered finalization observe that quirk.
    add_to_minv(monster, obj, env);
    return obj;
}

function placeSpecialObject(obj, specification, context, env) {
    if (!specification.content && !context.inventCarryingMonster)
        return obj;
    if (context.containers.length)
        return putInCurrentContainer(obj, context, env);
    if (context.inventCarryingMonster) {
        return putInCurrentMonster(
            obj,
            context.inventCarryingMonster,
            env,
            specification,
        );
    }
    // A legal monster descriptor can outlive a failed unique-monster
    // creation.  With no container or carrier, C leaves its objects on floor.
    return obj;
}

function pushContainer(obj, context, env) {
    delete_contents(obj, env);
    if (context.containers.length < MAX_CONTAINMENT) {
        context.containers.push(obj);
    } else {
        // create_object() reports the depth error without pushing.  The
        // enclosing lspo_object() still pops one descriptor slot afterward.
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
    const deadParent = specification.content
        && context.containers.at(-1) === null;
    if (specification.id === STATUE
        && specification.corpsenm === NON_PM
        && !deadParent
        && on_level(env.state.u?.uz, env.state.medusa_level)) {
        throw new UnsupportedSpecialObjectError(
            'Medusa-level generic-statue population',
            specification,
        );
    }
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

    if (specification.content || context.inventCarryingMonster) {
        obj = placeSpecialObject(obj, specification, context, env);
        if (!obj) return null;
    }
    if (specification.container && obj)
        pushContainer(obj, context, env);

    if (specification.achievement) {
        initializeAchievementObject(obj, env);
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
// is popped when the descriptor declared contents.  That final pop also
// preserves the source quirk when MAX_CONTAINMENT rejected the corresponding
// push.
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
