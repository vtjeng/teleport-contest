// The fail-closed boundary for monster actions. This file holds no port; the
// ports of monmove.c and dogmove.c live in js/monmove.js and js/dogmove.js.
//
// Every action is first dry-run against a cloned ISAAC context and cloned
// monster state. If the dry run selects a branch that is not ported yet, it
// throws before the live game or its PRNG has changed, so the replay stops on
// the last matching screen instead of diverging. runSimpleMonsterAction()
// executes one already-preflighted action and is shared by the clone-only
// planning pass and the live movemon() adapter.
//
// Delete this file once ported coverage makes the boundary unnecessary.

import {
    BURN,
    CONFLICT,
    CORR,
    DOOR,
    D_CLOSED,
    HEADSTONE,
    INVIS,
    IS_FOUNTAIN,
    IS_FURNITURE,
    MMOVE_NOTHING,
    MON_FLOOR,
    MON_MIGRATING,
    NEED_WEAPON,
    NORMAL_SPEED,
    OBJ_MINVENT,
    ROOM,
    STRAT_CLOSE,
} from './const.js';
// js/allmain.js imports this file's action runners, so this edge closes an
// import cycle. `stop_occupation` is a hoisted function declaration, which an
// ES module cycle initializes before either module body runs; nothing here
// reads it at module scope.
import { stop_occupation } from './allmain.js';
import { bot, newsym } from './display.js';
import {
    best_target,
    dog_move,
    pet_ranged_attk,
} from './dogmove.js';
import { engr_at } from './engrave.js';
import { game } from './gstate.js';
import { any_light_source } from './light.js';
import { m_dowear } from './makemon_create.js';
import {
    adaptMonsterActionToDochugwSignature,
    movemon_singlemon,
    wake_msg,
} from './mon.js';
import {
    attacktype,
    can_teleport,
    is_covetous,
    is_hider,
    monsndx,
    nohands,
    passes_walls,
    perceives,
    tunnels,
    verysmall,
} from './mondata.js';
import {
    AT_BREA,
    AT_GAZE,
    AT_MAGC,
    AT_SPIT,
    AT_WEAP,
    PM_ERINYS,
    PM_GELATINOUS_CUBE,
    PM_GREMLIN,
    PM_KILLER_BEE,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_MEDUSA,
    PM_PONY,
    PM_SHRIEKER,
    S_EEL,
} from './monsters.js';
import {
    INERT_DOOR_MASKS,
    dochug,
    dochugw,
    m_avoid_kicked_loc,
    m_avoid_soko_push_loc,
    m_everyturn_effect,
    m_move,
    monnear,
} from './monmove.js';
import { select_fresh_monster_item_action } from './muse.js';
import { newObject } from './obj.js';
import {
    inside_region,
    mon_in_region,
} from './region.js';
import {
    cloneIsaacContext,
    createCoreRandom,
    d,
    rn1,
    rn2,
    rnd,
    rne,
    rnl,
    rnz,
} from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
} from './startup_a11y.js';
import { is_ice } from './terrain.js';
import { is_lava, is_pool } from './trap.js';
import { ttyPline } from './tty_message.js';
import {
    cansee,
    couldsee,
    makeVisionBuffers,
    recalc_block_point,
    vision_recalc,
} from './vision.js';
import {
    mon_wield_item,
    select_hwep,
    select_rwep,
} from './weapon.js';

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);
const SPECIAL_RESPONDERS = new Set([PM_SHRIEKER, PM_MEDUSA, PM_ERINYS]);

export class UnsupportedSimpleMonsterActionError extends Error {
    constructor(reason) {
        super(`simple monster action requires ${reason}`);
        this.name = 'UnsupportedSimpleMonsterActionError';
        this.reason = reason;
    }
}

function unsupported(reason) {
    throw new UnsupportedSimpleMonsterActionError(reason);
}

function activeProperty(state, property, blockedMatters = true) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && (!blockedMatters || !value?.blocked);
}

function liveOnMap(monster) {
    return monster.mhp > 0
        && (monster.mstate ?? MON_FLOOR) === MON_FLOOR;
}

function assertSimpleScanState(monster, state) {
    const parkedGuard = monster.isgd
        && !monster.mx
        && !((monster.mstate ?? MON_FLOOR) & MON_MIGRATING);
    if (parkedGuard) {
        if ((state.moves ?? 0) > (monster.mlstmv ?? 0))
            unsupported('parked guard handling');
        return false;
    }
    if (!liveOnMap(monster)) return false;
    // Returning true means "hand this monster to movemon_singlemon", not
    // "this monster will act". mon.c runs m_everyturn_effect() before its
    // `movement < NORMAL_SPEED` return, so a monster below its ration still
    // has to be scanned. None of the guards below can be reached on that
    // path -- they all describe branches mon.c only takes after the movement
    // debit -- so they are deliberately skipped rather than merely bypassed.
    if (monster.movement < NORMAL_SPEED) return true;
    if (is_pool(monster.mx, monster.my, state)
        || is_lava(monster.mx, monster.my, state)) {
        unsupported('monster liquid effects');
    }
    if (is_hider(monster.data) || monster.data?.mlet === S_EEL)
        unsupported('monster hiding');
    if (activeProperty(state, CONFLICT, false))
        unsupported('conflict combat');
    return true;
}

// C ref: mon.c minliquid_core() (961-1122). Nothing in this port runs that
// function's body, so both of its `minLiquid` owners -- elapsedTurnMinLiquid()
// in js/allmain.js for the live turn, and planSimpleMonsterScan()'s operation
// below for the cloned scan -- answer "C leaves this monster alone" and refuse
// otherwise. This names which refusal a monster's square and species earn, so
// the two owners cannot drift apart; each throws its own error type.
//
// The square decides for every species but one. C derives `inpool` at :967 and
// `inlava` at :971 to guard the drown and burn effects at :1068 and :1010,
// neither ported. The first arm below is deliberately broader than those two
// terms, which exempt a flyer or a floater: it refuses water and lava for every
// species. Over-refusing costs the rest of a replay but cannot diverge, and
// narrowing it would mean porting the arms it stands in for.
//
// The gremlin is the exception, and it is why a fountain appears here. C
// derives `infountain` at :973 from IS_FOUNTAIN(levl[mx][my].typ) and reads it
// in exactly one place, the split at :987, which fires for `mons[PM_GREMLIN]`
// alone: that gremlin draws rn2(3) and on a nonzero roll calls split_mon() and
// dryup(). Answering false for a fountain would skip that draw silently, so a
// gremlin standing on one is refused instead. A fountain is ordinary terrain
// for every other species, which reads the square through `inpool` and `inlava`
// alone.
//
// C tests the gremlin at :987 before either liquid arm, and these two are in
// the other order. That is only a labelling difference: a gremlin in water
// matches both, and whichever arm claims it, the caller refuses.
export function unportedMinliquidReason(monster, state) {
    if (is_pool(monster.mx, monster.my, state)
        || is_lava(monster.mx, monster.my, state))
        return 'an immobile monster in liquid';
    if (monsndx(monster.data) === PM_GREMLIN
        && IS_FOUNTAIN(state.level?.at?.(monster.mx, monster.my)?.typ))
        return 'a gremlin splitting in a fountain';
    return null;
}

function assertSimpleActionState(monster, state) {
    if (!monster.mcanmove) return;
    // STRAT_ARRIVE needs no guard: dog.c mon_arrive() is the only writer, and
    // monmove.c dochug() answers it at 704-708 by calling m_arrival(), which
    // clears the bit and returns -1 so that dochug() carries straight on.
    // js/monmove.js dochug() carries that clear.
    if (monster.mstrategy & STRAT_CLOSE)
        unsupported('quest wait strategy');
    if (monster.mfrozen)
        unsupported('inconsistent frozen monster state');
    if (monster.mtrapped)
        unsupported('a trapped monster');
    if (monster.mconf || monster.mstun || monster.meating)
        unsupported('altered monster movement state');

    if (monster.mtame && !monster.isminion) {
        if (!STARTING_PETS.has(monster.data?.pmidx))
            unsupported('a non-starting pet');
        if (monster.msleeping || monster.mleashed) {
            unsupported('special starting-pet state');
        }
        if (!monster.mextra?.edog)
            unsupported('missing starting-pet state');
        // uhitm.c:do_attack() can call monflee(rnd(6), FALSE, FALSE) when
        // safe_pet refuses an attack. mon.c:m_calcdistress() decrements this
        // seven-bit timer during once-per-turn distress, before the later
        // dochug() action scan, so a live fleeing starting pet must retain a
        // positive source-bounded timeout here.
        if (monster.mflee
            && (!Number.isInteger(monster.mfleetim)
                || monster.mfleetim < 1
                || monster.mfleetim > 127)) {
            unsupported('altered monster movement state');
        }
        return;
    }

    if (monster.mtame || monster.isminion)
        unsupported('minion movement');
    if (monster.mflee)
        unsupported('altered monster movement state');
    if (monster.wormno || monster.isshk || monster.isgd
        || monster.ispriest || is_covetous(monster.data)) {
        unsupported('special monster movement');
    }
    if (SPECIAL_RESPONDERS.has(monster.data?.pmidx)
        || can_teleport(monster.data)
        || monster.data?.pmidx === PM_KILLER_BEE
        || monster.data?.pmidx === PM_GELATINOUS_CUBE) {
        unsupported('a special monster action');
    }
    if (attacktype(monster.data, AT_MAGC))
        unsupported('monster ranged or magical action');
}

function clonedRandom(state) {
    const context = cloneIsaacContext(state.coreCtx);
    return createCoreRandom(context, state);
}

function cloneMonster(monster) {
    return {
        ...monster,
        mgoal: monster.mgoal ? { ...monster.mgoal } : monster.mgoal,
        mtrack: monster.mtrack?.map((position) => ({ ...position })),
        mextra: monster.mextra ? {
            ...monster.mextra,
            edog: monster.mextra.edog ? {
                ...monster.mextra.edog,
                ogoal: { ...monster.mextra.edog.ogoal },
            } : monster.mextra.edog,
        } : monster.mextra,
    };
}

// Copy every object on this level's floor, in the hero's inventory, and in
// every monster's pack. A monster picking an item up splits a stack, unlinks
// it from the pile and the level list, and merges it into its own inventory;
// a newly created threat can also finish the hero's meal. Without these
// copies the dry run would empty the live square or change a live carried
// stack. C has no counterpart: the dry run is this port's own device for
// keeping a refusal atomic, and objects are shared state that device has to
// isolate, exactly as it already isolates monsters, light sources and timers.
//
// The discovery ledger is cloned beside this, in planningState(): naming an
// object writes objects[].oc_encountered, svd.disco[] and artiexist[].found,
// which the spread would otherwise share.
//
// The buried list stays shared because no admitted action digs. Hero inventory
// must be cloned too: a runtime-created threat can stop an eating occupation,
// and maybe_finished_meal(TRUE) can consume context.victual.piece. That pointer
// and every top-level worn/inventory pointer must name this same copied graph.
//
// obj.v is C's union: nexthere on the floor, ocontainer inside a container,
// and ocarry inside a monster's pack, so an inventory object's `v` remaps
// through the monster map rather than the object map. The matching guard in
// the walk keeps a carrier out of the object queue; it changes no result on
// its own, since the remap already discriminates on `where`, and it exists so
// that no `newObject({ ...monster })` is ever built. The three root families
// are the level object list, hero inventory, and each monster's minvent. The
// coordinate grid needs no separate floor-object root because obj.js keeps it
// in step with the level list: place_object() writes both and remove_object()
// refuses an object missing from either.
function cloneObjects(state, monsterMap) {
    const objectMap = new Map();
    const pending = [];
    const enqueue = (obj) => {
        if (obj && !objectMap.has(obj)) pending.push(obj);
    };
    enqueue(state.level?.objlist);
    enqueue(state.invent);
    for (const monster of monsterMap.keys()) enqueue(monster.minvent);
    while (pending.length) {
        const original = pending.pop();
        if (objectMap.has(original)) continue;
        const copy = newObject({ ...original });
        if (original.oextra) copy.oextra = { ...original.oextra };
        objectMap.set(original, copy);
        enqueue(original.nobj);
        enqueue(original.cobj);
        if (original.where !== OBJ_MINVENT) enqueue(original.v);
    }
    for (const [original, copy] of objectMap) {
        copy.nobj = objectMap.get(original.nobj) ?? null;
        copy.cobj = objectMap.get(original.cobj) ?? null;
        copy.v = original.where === OBJ_MINVENT
            ? monsterMap.get(original.v) ?? original.v
            : objectMap.get(original.v) ?? null;
    }
    return objectMap;
}

function planningState(state) {
    const monsterMap = new Map();
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        monsterMap.set(monster, cloneMonster(monster));
    }
    const objectMap = cloneObjects(state, monsterMap);
    const context = structuredClone(state.context);
    const remapContextObject = (target, source, field) => {
        const original = source?.[field];
        if (!original) return;
        const copy = objectMap.get(original);
        if (!copy)
            throw new Error(`planning clone: context.${field} outside objects`);
        target[field] = copy;
    };
    remapContextObject(context.victual, state.context?.victual, 'piece');
    remapContextObject(context.tin, state.context?.tin, 'tin');
    const topLevelObjectPointers = {};
    for (const [field, value] of Object.entries(state)) {
        const copy = objectMap.get(value);
        if (copy) topLevelObjectPointers[field] = copy;
    }
    const clonedObject = (obj) => {
        if (!obj) return null;
        const copy = objectMap.get(obj);
        // Dropping the object instead would hide it from the whole scan.
        if (!copy)
            throw new Error('planning clone: floor object outside objlist');
        return copy;
    };
    for (const [original, clone] of monsterMap) {
        clone.nmon = monsterMap.get(original.nmon) ?? null;
        clone.minvent = objectMap.get(original.minvent) ?? null;
        // MON_WEP(). A wielded weapon is also in minvent, so the clone's
        // pointer has to name the copy the pack now holds.
        clone.mw = objectMap.get(original.mw) ?? null;
    }

    const level = Object.assign(
        Object.create(Object.getPrototypeOf(state.level)),
        state.level,
        {
            monsters: state.level.monsters.map(
                (column) => column.map(
                    (monster) => monsterMap.get(monster) ?? null,
                ),
            ),
            objects: state.level.objects.map(
                (column) => column.map(clonedObject),
            ),
            objlist: clonedObject(state.level.objlist),
            flags: { ...state.level.flags },
            monlist: monsterMap.get(state.level.monlist) ?? null,
            regions: state.level.regions.map((region) => ({
                ...region,
                monsters: [...(region.monsters ?? [])],
            })),
            // trap.c seetrap() sets trap->tseen and then repaints the square,
            // and its `if (!trap->tseen)` guard makes the repaint happen once.
            // Sharing the live trap would let the dry run consume that first
            // time, so the live pass would set nothing and draw nothing. Every
            // struct trap field the port writes lives on the trap itself or in
            // one of these four nested records.
            traps: state.level.traps.map((trap) => ({
                ...trap,
                vl: trap.vl ? { ...trap.vl } : trap.vl,
                launch: trap.launch ? { ...trap.launch } : trap.launch,
                dst: trap.dst ? { ...trap.dst } : trap.dst,
                teledest: trap.teledest ? { ...trap.teledest } : trap.teledest,
            })),
            // vision.c keeps one cached transparency index, which the planned
            // state borrows: it describes the planned map throughout the scan,
            // because admitDoorOpening() is the only thing that changes the
            // planned map and it rebuilds the index. Off-hero do_clear_area()
            // may therefore share it.
            _visionTransparencyOwner: state.level,
        },
    );
    const hero = {
        ...state.u,
        abon: [...(state.u?.abon ?? [])],
        acurr: state.u?.acurr
            ? { ...state.u.acurr, a: [...state.u.acurr.a] }
            : state.u?.acurr,
        aexe: Array.isArray(state.u?.aexe)
            ? [...state.u.aexe]
            : state.u?.aexe,
        amax: state.u?.amax
            ? { ...state.u.amax, a: [...state.u.amax.a] }
            : state.u?.amax,
        atemp: [...(state.u?.atemp ?? [])],
        atime: [...(state.u?.atime ?? [])],
        uevent: { ...(state.u?.uevent ?? {}) },
        uhave: { ...(state.u?.uhave ?? {}) },
        uprops: state.u?.uprops?.map(
            (property) => property ? { ...property } : property,
        ) ?? [],
        usteed: monsterMap.get(state.u?.usteed) ?? state.u?.usteed,
        ustuck: monsterMap.get(state.u?.ustuck) ?? state.u?.ustuck,
    };
    const mvitals = state.mvitals?.map(
        (vital) => vital ? { ...vital } : vital,
    );
    const cloneLightList = (source) => {
        if (!source) return null;
        return {
            ...source,
            id: monsterMap.get(source.id)
                ?? objectMap.get(source.id)
                ?? source.id,
            next: cloneLightList(source.next),
        };
    };
    // timeout.c keeps one timer queue and one timer_id counter. A planning
    // round can generate a monster whose starting inventory lights a candle,
    // and start_timer() would otherwise prepend that timer to the live queue
    // and advance the live counter, leaving an orphan behind on every retry.
    const cloneTimerList = (source) => {
        if (!source) return null;
        return {
            ...source,
            arg: monsterMap.get(source.arg)
                ?? objectMap.get(source.arg)
                ?? source.arg,
            next: cloneTimerList(source.next),
        };
    };
    return {
        ...state,
        ...topLevelObjectPointers,
        context,
        // Hallucinatory runtime creation names use rnd.c's independent
        // display stream.  A planned appearance must advance only this copy;
        // otherwise a dry run changes later live glyphs even though every
        // terminal operation is suppressed.
        displayCtx: state.displayCtx
            ? cloneIsaacContext(state.displayCtx)
            : state.displayCtx,
        disp: structuredClone(state.disp),
        flags: structuredClone(state.flags),
        // distant_name() raises gd.distantname around a name it must not let
        // observe_object() record, and lowers it in a finally. The dry run
        // reaches that raise through dog_invent(), so a shared gd is a live
        // write. It never showed, because the counter is balanced and gd is
        // absent from a fresh game -- it exists only once a live distant_name()
        // has created it, and the leak needs both. The frozen-state case in
        // scripts/unported-monster-actions.test.mjs seeds gd to reach it.
        gd: { ...(state.gd ?? {}) },
        gb: state.gb ? {
            ...state.gb,
            bhitpos: { ...(state.gb.bhitpos ?? {}) },
        } : state.gb,
        gg: { ...state.gg },
        gn: { ...(state.gn ?? {}) },
        gl: state.gl ? {
            ...state.gl,
            light_base: cloneLightList(state.gl.light_base),
        } : state.gl,
        go: { ...(state.go ?? {}) },
        gt: state.gt ? {
            ...state.gt,
            timer_base: cloneTimerList(state.gt.timer_base),
        } : state.gt,
        gw: { ...(state.gw ?? {}) },
        gs: { ...(state.gs ?? {}) },
        gv: { ...(state.gv ?? {}) },
        head_engr: structuredClone(state.head_engr),
        iflags: structuredClone(state.iflags),
        level,
        mvitals,
        program_state: structuredClone(state.program_state),
        svm: state.svm ? {
            ...state.svm,
            mvitals,
        } : state.svm,
        svt: state.svt ? { ...state.svt } : state.svt,
        svs: state.svs ? {
            ...state.svs,
            spl_book: state.svs.spl_book?.map(
                (spell) => ({ ...spell }),
            ),
        } : state.svs,
        track: structuredClone(state.track),
        u: hero,
        // The admitted naming path writes the discovery ledger:
        // distant_name() reaches xname(), which calls observe_object() and
        // o_init.c discover_object(), setting objects[otyp].oc_encountered and
        // svd.disco[]; artifacts.c find_artifact() sets artiexist[].found. The
        // spread above shares all four by reference, so a dry run mutated live
        // discovery state and the writes survived even a rejected round. Each
        // is isolated, not merely re-wrapped. `svb` is the exception: its own
        // spread is one level, and nothing on the admitted path writes through
        // it, so it is carried rather than deepened.
        //
        // The catalog uses prototype delegation rather than a copy. A
        // materialized 482-entry copy cost 6.4 ms on every elapsed turn, which
        // measured as 80-92% of a scored turn's total time; Object.create()
        // gives the same isolation for free. Reads fall through to the live
        // entry, a write shadows it on the copy and never reaches the live
        // one, and the eight non-enumerable aliases keep working because their
        // accessor bodies read `this[source]`, so the receiver is the copy.
        objects: state.objects?.map((entry) => Object.create(entry)),
        svd: state.svd ? { ...state.svd, disco: [...(state.svd.disco ?? [])] }
            : state.svd,
        svb: state.svb ? { ...state.svb } : state.svb,
        artiexist: state.artiexist?.map((entry) => ({ ...entry })),
    };
}

function actionRandom(rawEnv) {
    return rawEnv.random ?? { d, rn1, rn2, rnd, rne, rnl, rnz };
}

function ordinaryMonsterCanSeeHero(monster, state) {
    return (!activeProperty(state, INVIS) || perceives(monster.data))
        && !state.u.uinwater
        && couldsee(monster.mx, monster.my, state);
}

function resistsTrapEffect() {
    unsupported('monster trap-resistance evaluation');
}

// C ref: monmove.c postmov()'s `here->doormask == D_CLOSED && can_open` arm
// (1576-1592), plus the block's own entry test at 1520-1522. can_open repeats
// mon.c mon_allowflags():2067, so mfndpos() has already refused this square to
// a monster without it; a wall-walker or a tunneler skips the block instead and
// leaves the door closed, which is a separate behavior and stays refused.
function opensClosedDoor(monster, location, doorMask) {
    const species = monster.data;
    return location?.typ === DOOR
        && doorMask === D_CLOSED
        && !(nohands(species) || verysmall(species))
        && !passes_walls(species)
        && !tunnels(species);
}

// UnblockDoor (monmove.c:1526-1536) writes the doormask and then rebuilds the
// vision system twice: recalc_block_point() rebuilds the compact transparency
// index, and vision_recalc(0) rebuilds what the hero sees. Both write state
// the cloned scan shares with the live game, and the second also paints and
// ORs seenv into every square that has come into view. This gives the cloned
// scan what it needs to run both, and runs before the first door it opens.
//
// The two rebuilds are isolated differently, because vision.c holds them
// differently. The COULD_SEE buffers and the level are per-state, so the clone
// takes its own; the terrain grid is copied whole, since vision_recalc() marks
// squares all over the map rather than only the door. The transparency index
// is one set of module buffers with no per-state form, so the clone borrows
// it: it rebuilds it from the planned map, and preflightSimpleMonsterActions()
// rebuilds it from the live map before returning. Nothing else reads it in
// between, and either rebuild derives the whole index from the map it is given,
// so the live game gets back exactly the index it had.
function isolatePlannedVision(state) {
    if (state._visionBuffers) return;
    state.level.locations = state.level.locations.map(
        (column) => column.map((cell) => ({ ...cell })),
    );
    // Only the spare buffer of the pair is written: vision_recalc() fills it,
    // then points state.viz_array at it. Until then the clone keeps reading
    // the live game's current view, which is the value it should see, so this
    // takes the pair and copies nothing.
    state._visionBuffers = makeVisionBuffers();
}

function admitDoorOpening(x, y, env) {
    const { state } = env;
    if (!env.planning) return;
    isolatePlannedVision(state);
    state._plannedDoorOpening ??= { x, y };
}

function assertSimpleDestination(monster, x, y, env) {
    const { state } = env;
    const location = state.level.at(x, y);
    const doorMask = location?.flags || location?.doormask || 0;
    // Every IS_FURNITURE type is ordinary terrain for a monster that is not
    // covetous: all seven are ACCESSIBLE, so mon.c mfndpos() and teleport.c
    // goodpos() admit them with no furniture branch, and monmove.c postmov()
    // has none either. Three furniture tests do sit on the monster-move path.
    // monmove.c:274 onscary()'s vampire-fears-altar arm is ported in
    // js/monmove.js; monmove.c:1233 holds_up_web() is reached only from
    // maybe_spin_web(), which js/monmove.js refuses for every webmaker; and
    // mon.c:973 minliquid_core()'s `infountain` feeds the gremlin split at
    // :987, which unportedMinliquidReason() refuses on the square the monster
    // ends up standing on rather than here, because C decides it there and
    // makemon() can put a gremlin on a fountain with no move at all.
    //
    // No ordinary movement path changes a monster's level; every
    // migrate_to_level() caller is item use (muse.c), digging (dig.c),
    // teleportation (teleport.c), a shopkeeper (shk.c), or a wizard command.
    // dogmove.c reads stairs only through dog_goal()'s On_stairs(u.ux, u.uy),
    // which asks where the hero stands, not where the pet steps, and names no
    // other furniture at all.
    // A doorway a monster can stand in without acting on it, or a closed one
    // it opens. INERT_DOOR_MASKS names the first set; js/monmove.js owns it
    // beside the block that skips them.
    const inertDoorway = location?.typ === DOOR
        && INERT_DOOR_MASKS.has(doorMask);
    const opensDoor = opensClosedDoor(monster, location, doorMask);
    const ordinaryDestination = location
        && (location.typ === ROOM
            || location.typ === CORR
            || IS_FURNITURE(location.typ)
            || inertDoorway
            || opensDoor);
    if (!ordinaryDestination)
        unsupported('door or special terrain movement');
    // A trap on the destination is no longer refused here. C has no such gate:
    // monmove.c postmov() calls mintrap() after the move, and only there. That
    // is where an unported trap type now stops the scan, which also covers a
    // monster standing still on one -- a case this destination check never
    // saw. preflightSimpleMonsterActions() runs the whole scan on the clone
    // before the live pass, so a refusal that late is still atomic.
    for (const region of state.level.regions) {
        if (region.attach_2_m === monster.m_id) continue;
        if (mon_in_region(region, monster)
            !== inside_region(region, x, y)) {
            unsupported('a region transition');
        }
    }
    // Last, so that a destination another guard rejects prepares nothing.
    if (opensDoor) admitDoorOpening(x, y, env);
    return true;
}

function wipeSimpleEngraving(x, y, _count, _magical, env) {
    const engraving = engr_at(x, y, env.state);
    if (!engraving || engraving.engr_type === HEADSTONE
        || engraving.nowipeout
        || (engraving.engr_type === BURN && !is_ice(x, y, env.state))) {
        return;
    }
    unsupported('monster engraving wear');
}

// UnblockDoor's second rebuild, vision_recalc(0). The cloned scan runs the
// same function the live scan does, against the buffers and the terrain grid
// isolatePlannedVision() gave it, and paints nothing: the scan replays the
// turn against the live display afterwards.
function planningVisionRecalc(state) {
    return (control) => vision_recalc(control, { state, redraw: () => {} });
}

// postmov()'s two vision owners, which reach it through m_move()'s env for a
// pet as well as for an ordinary monster. recalc_block_point() is the module
// default in both passes: it derives the transparency index from whichever
// state it is handed, so the cloned scan gets the index its own map implies.
function doorVisionOperations(env) {
    return env.planning
        ? { visionRecalc: planningVisionRecalc(env.state) }
        : {};
}

async function moveSimpleOrdinary(monster, env) {
    return m_move(monster, {
        ...env,
        ...doorVisionOperations(env),
        mayCrossRegion: assertSimpleDestination,
        resolveTrappedMonster: () => false,
        resistsTrapEffect,
        // mon.c can_touch_safely() asks artifact.c touch_artifact() about
        // every item a monster considers, and that function can blast the
        // toucher for d(4,10) and print. Three consumers read this one
        // injection: m_search_items()'s can_carry() and can_touch_safely()
        // below, dog_invent()'s and dog_goal()'s can_carry() through
        // movePet(), which m_move() hands its own env, and postmov(), which
        // replaces it with a narrower reason of its own. Without it the first
        // two raised a bare TypeError for the missing operation, which
        // escapes runSegment() and discards the segment's matching prefix
        // rather than ending the segment on it.
        touchArtifact: () => unsupported('monster artifact item selection'),
        unsupported,
    });
}

async function moveSimplePet(monster, after, env) {
    return dog_move(monster, after, {
        ...env,
        attackHero: () => unsupported('pet attack on the hero'),
        attackMonster: () => unsupported('pet combat'),
        avoidKicked: (subject, x, y) =>
            m_avoid_kicked_loc(subject, x, y, env.state),
        avoidSokobanPush: (subject, x, y) =>
            m_avoid_soko_push_loc(subject, x, y, env.state),
        bestTarget: best_target,
        canSeeMonster: (subject) => canSeeMonster(subject, env.state),
        digWeaponCheck: () => false,
        displaceMonster: () => unsupported('pet displacement'),
        eatObject: () => unsupported('pet eating'),
        maxPassiveDamage: () => unsupported('pet combat evaluation'),
        mayCrossRegion: assertSimpleDestination,
        // Both of dog_invent()'s arms print and repaint through these two
        // seams: the carry arm through dogmove.c pline_xy(), and the drop arm
        // through steal.c mdrop_obj() and relobj(). The planning scan replays
        // the same turn against the live display afterwards, so it must
        // produce neither. Removing either injection because one arm no longer
        // needs it writes the other arm's line and repaint on a turn the scan
        // may still refuse.
        message: env.planning ? async () => {} : ttyPline,
        monsterReflects: () => unsupported('pet combat evaluation'),
        petRangedAttack: pet_ranged_attk,
        redraw: env.planning ? () => {} : newsym,
        reportCursedStep: () => unsupported('pet cursed-object feedback'),
        // C ref: dogmove.c dog_hunger() (360-394). Its middle arm confuses a
        // pet that has gone DOG_WEAK turns past hungrytime, then announces the
        // confusion through one of pline_mon(), beg() and You_feel() and calls
        // stop_occupation(). Only the last of the four is ported, and it runs
        // after the announcement, so the arm refuses at the announcement and
        // this pair carries one refusal between them.
        reportWeakPet: () => unsupported('pet hunger confusion'),
        resistsStone: () => unsupported('pet combat evaluation'),
        resistsTrapEffect,
        // dogmove.c dog_starve() (347-358), which both of dog_hunger()'s
        // starving arms call: the middle arm when the third of mhpmax it
        // leaves the pet is below one hit point, and the last arm once the pet
        // is DOG_STARVE turns past hungrytime. It prints through You_feel()
        // and removes the pet with mondied(); neither is ported.
        starvePet: () => unsupported('pet starvation'),
        // allmain.c stop_occupation() is ported and sits in the env chain
        // already, so this key shadows it deliberately rather than standing in
        // for something missing. C reaches it at dogmove.c:377, after the
        // You_feel() line the confusion arm prints, and that line has no
        // owner; letting the real function through would run the interruption
        // without the announcement that precedes it.
        stopOccupation: () => unsupported('pet hunger interruption'),
        // steal.c relobj() and mdrop_obj() and do.c flooreffects() reach the
        // drop arm as ported functions with unported branches, so they refuse
        // through the caller's boundary class the way m_move() does.
        unsupported,
        // No arm of the running game reaches this one, and it stays anyway.
        // dog_invent() calls it only for a pet with AT_WEAP, and
        // assertSimpleActionState() above refuses any tame monster outside
        // STARTING_PETS, whose three species carry AT_BITE and AT_KICK alone
        // (monsters.h:228-234, :381-388, :1002-1009). Without the injection
        // inventoryOperation() would throw a bare TypeError the moment that
        // boundary widens, which costs a session its whole matching prefix
        // rather than ending the segment; keeping it makes that first
        // widening a named refusal. scripts/unported-monster-actions.test.mjs
        // fabricates an AT_WEAP pony to pin it, so the pair reads as dead
        // code plus scaffolding and is neither.
        wieldPickedItem: () => unsupported('pet weapon selection'),
    });
}

// C ref: mhitu.c mattacku(). dochug()'s standard-attack gate admits a monster
// anywhere inside BOLT_LIM, and what it may do there depends on whether it
// believes it is adjacent. An adjacent attacker reaches the melee arms, which
// are not ported at all. A monster that only thinks it is near reaches the
// range2 arms alone: AT_MAGC's castmu(), refused by assertSimpleActionState()
// before the scan; AT_BREA, AT_SPIT and AT_GAZE, refused here; and AT_WEAP's
// thrwmu(), which does nothing at all unless select_rwep() finds a missile.
// mattacku()'s preamble writes nothing and draws nothing on this path: its
// nomul(0) is behind !ranged, and the steed, swallow and underwater arms need
// hero states this boundary already excludes.
function refuseHeroAttack(monster, env) {
    if (monnear(monster, monster.mux, monster.muy))
        unsupported('monster attack on the hero');
    const species = monster.data;
    if (attacktype(species, AT_BREA)
        || attacktype(species, AT_SPIT)
        || attacktype(species, AT_GAZE)) {
        unsupported('monster ranged attack on the hero');
    }
    if (attacktype(species, AT_WEAP)) {
        const selected = select_rwep(monster, {
            ...env,
            touchArtifact: () =>
                unsupported('monster artifact weapon selection'),
        });
        if (selected) unsupported('monster ranged weapon action');
    }
}

// Execute one already-preflighted monster action. The same function is used
// by the clone-only planning pass and the live movemon() adapter.
export async function runSimpleMonsterAction(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = actionRandom(rawEnv);
    const env = { ...rawEnv, state, random };
    assertSimpleActionState(monster, state);
    return dochugw(monster, true, {
        ...env,
        canSpotMonster: (subject) => canSpotMonster(subject, state),
        // One dochug() now serves both, as in C. m_move() picks the mover.
        dochug: (subject, actionEnv) => dochug(subject, {
                ...actionEnv,
                attackHero: refuseHeroAttack,
                monFlee: () => unsupported('monster flight'),
                monsterCanSeeHero: ordinaryMonsterCanSeeHero,
                moveMonster: moveSimpleOrdinary,
                postMoveRangedAttack: (weaponUser, weaponEnv) => {
                    const selected = select_rwep(weaponUser, {
                        ...weaponEnv,
                        touchArtifact: () => unsupported(
                            'monster artifact weapon selection',
                        ),
                    });
                    if (selected)
                        unsupported('monster ranged weapon action');
                    if (weaponUser.weapon_check === NEED_WEAPON
                        || !weaponUser.mw) {
                        weaponUser.weapon_check = NEED_WEAPON;
                    }
                },
                selectRangedWeapon: () =>
                    unsupported('monster ranged weapon selection'),
                usePreMoveItems: (itemUser, itemEnv) => {
                    const selected = select_fresh_monster_item_action(
                        itemUser,
                        itemEnv,
                    );
                    if (selected) unsupported('monster item use');
                    return false;
                },
                wieldMonsterItem: async (weaponUser, weaponEnv) => {
                    const selectionEnv = {
                        ...weaponEnv,
                        touchArtifact: () =>
                            unsupported('monster artifact weapon selection'),
                    };
                    const selected = select_hwep(
                        weaponUser,
                        selectionEnv,
                    );
                    if (selected
                        && weaponUser.mw?.otyp !== selected.otyp) {
                        unsupported('monster wield action');
                    }
                    return mon_wield_item(weaponUser, selectionEnv);
                },
                wakeMessage: env.planning ? () => {} : wake_msg,
                wipeEngraving: wipeSimpleEngraving,
                finishEating: () => unsupported('pet eating'),
                movePet: moveSimplePet,
                preflight: assertSimpleActionState,
            }),
        // C ref: monmove.c dochugw():223-235. Its radius is nine squares, so
        // this fires several turns before moveloop_core()'s own
        // monster_nearby() test, which scans the eight adjacent squares alone.
        // The planning pass runs the interruption against the clone -- a meal
        // whose last bite is already taken finishes there too, which is why
        // planningState() copies the hero's pack -- and both display operations
        // fall silent so only the live pass writes to the terminal.
        stopOccupation: (occupationEnv) => stop_occupation(occupationEnv.state, {
            message: env.planning ? async () => {} : ttyPline,
            statusRefresh: env.planning ? () => {} : () => bot(),
        }),
    });
}

async function planningEveryTurnEffect(monster, env) {
    await m_everyturn_effect(monster, {
        ...env,
        // C ref: monmove.c:657-661. A fog cloud lays a one-square vapour
        // region through create_gas_cloud(). The PRNG is not what stops the
        // dry run following it: at cloudsize 1 that is a single rn1(3, 4)
        // (region.c:1303), which the cloned ISAAC context can afford.
        // add_region() is. For a visible region it calls block_point() on the
        // inside square (region.c:326-328), and js/vision.js keeps the
        // transparency index that rebuilds in module constants (64-66), which
        // the caller's restore below repairs only for a planned door opening;
        // and it repaints through newsym() (region.c:329-330), for which
        // js/allmain.js regionEffectEnv() is the live owner and the plan has
        // no counterpart.
        //
        // The reason this comment used to give was that rebuildVisionPoint()
        // refuses a state other than the live game. It does not; js/vision.js
        // takes a state, and the door path already runs it against the clone.
        createGasCloud: () => unsupported('monster region creation'),
    });
}

async function planSimpleMonsterScan(monster, env) {
    return movemon_singlemon(monster, {
        ...env,
        everyTurnEffect: planningEveryTurnEffect,
        // C ref: mon.c:1258-1259. movemon()'s tail sets vision_full_recalc
        // whenever a light source exists (mon.c:1332-1333), and the next
        // ration-spending monster clears it with vision_recalc(0). That spends
        // no randomness, but it writes seenv and waslit on the map cells and
        // swaps the COULD_SEE pair.
        //
        // planningVisionRecalc() cannot stand in here, which is what the
        // sentence this replaces got wrong. It is safe only after
        // isolatePlannedVision(), which gives the clone its own COULD_SEE
        // buffers and its own level.locations; admitDoorOpening() is that
        // function's only caller, and this arm can be the first vision work in
        // a plan where no door was opened. Without the isolation
        // visionBuffers() falls back to the live pair and GameMap.at() reads
        // the live cells, so the plan would write through to the running game.
        visionRecalc: () => unsupported(
            'monster light-source vision recalculation',
        ),
        clearBypasses: () => unsupported('monster bypass cleanup'),
        // unportedMinliquidReason() is the live owner's predicate too, so both
        // tables refuse the same squares. Its water and lava arm duplicates
        // assertSimpleScanState()'s earlier liquid guard, which reaches this
        // monster first; its gremlin arm does not, and is the one that fires
        // here.
        minLiquid: async (subject, subjectEnv) => {
            const reason = unportedMinliquidReason(subject, subjectEnv.state);
            if (reason) unsupported(reason);
            return false;
        },
        // C ref: mon.c movemon_singlemon():1268-1281. m_dowear() reassesses
        // the monster's gear; only a monster that would actually put
        // something on stops the scan.
        dowear: (subject, creation, subjectEnv) => m_dowear(subject, creation, {
            ...subjectEnv,
            wearArmor: () => unsupported('monster equipment changes'),
        }),
        restrap: () => unsupported('monster hiding'),
        canSeeMonster: (subject) => canSeeMonster(subject, env.state),
        hideUnder: () => unsupported('eel concealment'),
        // movemon_singlemon() requires these three, but its conflict arm is
        // unreachable from here: assertSimpleScanState() refuses an active
        // CONFLICT before this function is ever called. They match the live
        // scan's owners anyway, so the two agree if that guard is ever lifted.
        canSeeHero: () => true,
        canSeeSquare: (x, y) => cansee(x, y, env.state),
        fightMonster: () => unsupported('conflict combat'),
        dochugwAction:
            adaptMonsterActionToDochugwSignature(runSimpleMonsterAction),
    });
}

// Dry-run every action scan against cloned coordinates and a cloned ISAAC
// context. Any excluded selected path throws while the live game and PRNG
// remain unchanged and retryable.
export async function preflightSimpleMonsterActions(
    state = game,
    { advanceRound = null } = {},
) {
    // The two terms are allmain.c moveloop_core()'s own preamble:
    // `if (svc.context.bypasses) clear_bypasses();` at 193 and the deferred
    // level transition u.utotype records. A third term named an occupation,
    // which C gates nothing on here -- allmain.c mentions go.occupation only
    // at 332, 485-506 and 684-689, all after this point in the turn -- and it
    // read a field nothing assigns, so it stopped nothing. monmove.c
    // dochugw() carries the per-monster occupation test, and stopOccupation
    // refuses there for the one monster that C would stop the meal for.
    if (state.context?.bypasses || state.u?.utotype)
        unsupported('deferred monster cleanup or level transition');
    const planned = planningState(state);
    const random = clonedRandom(planned);
    planned.u.umovement -= NORMAL_SPEED;
    let upkeepCount = 0;
    try {
        upkeepCount = await planSimpleMonsterTurn(planned, random, advanceRound);
    } finally {
        // admitDoorOpening() rebuilt js/vision.js's shared transparency index
        // from the planned map. Deriving it again from the live map restores
        // it, whether the plan finished or refused partway through.
        //
        // recalc_block_point() is not side-effect-free on the live state:
        // rebuildVisionPoint() sets vision_full_recalc whenever the change
        // touches the hero's current vision, which is the normal case for a
        // door in a lit room. Leaving that set would make the live scan run a
        // vision_recalc(0) C never performs, so the flag is saved and written
        // back — the restore has to restore everything it touches, not only
        // the index it came for.
        if (planned._plannedDoorOpening) {
            const { x, y } = planned._plannedDoorOpening;
            const fullRecalcBefore = state.vision_full_recalc;
            recalc_block_point(x, y, state);
            state.vision_full_recalc = fullRecalcBefore;
        }
    }
    return {
        runsOncePerTurnUpkeep: upkeepCount > 0,
        upkeepCount,
    };
}

// The body of preflightSimpleMonsterActions()'s scan, split out so that its
// caller can restore the shared vision buffers on every exit.
async function planSimpleMonsterTurn(planned, random, advanceRound) {
    let somebodyCanMove;
    let upkeepCount = 0;
    do {
        // C brackets only the monster scan with context.mon_moving, so the
        // once-per-turn upkeep below sees it clear just as the live loop does.
        planned.context.mon_moving = true;
        do {
            planned.somebody_can_move = false;
            for (let monster = planned.level.monlist;
                monster;
                monster = monster.nmon) {
                if (!assertSimpleScanState(monster, planned)) continue;
                await planSimpleMonsterScan(monster, {
                    state: planned,
                    random,
                    planning: true,
                });
            }
            somebodyCanMove = Boolean(planned.somebody_can_move);
            // C ref: mon.c movemon()'s tail. Keeping the flag here rather than
            // testing the light source at each place a further scan can follow
            // means planSimpleMonsterScan()'s refusing visionRecalc fires
            // exactly where movemon_singlemon() would rebuild viz_array,
            // whether the next scan comes from this inner loop or from the
            // allocation after advanceRound.
            // clear_bypasses() cannot apply here, since this function already
            // refused a state with context.bypasses set, and clear_splitobjs()
            // and dmonsfree() would only touch the discarded clone.
            if (any_light_source(planned)) planned.vision_full_recalc = 1;
            if (planned.u.umovement >= NORMAL_SPEED) break;
        } while (somebodyCanMove);
        planned.context.mon_moving = false;

        const runsUpkeep =
            !somebodyCanMove && planned.u.umovement < NORMAL_SPEED;
        if (!runsUpkeep) break;
        ++upkeepCount;
        if (!advanceRound) break;
        // A truthy result ends the plan early. The live advanceRound never
        // returns one, so this only serves callers that inject their own
        // round to stop after a single allocation.
        if (await advanceRound(planned, random)) break;
    } while (planned.u.umovement < NORMAL_SPEED);
    return upkeepCount;
}
