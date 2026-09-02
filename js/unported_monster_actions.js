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

import { artifact_light } from './artifacts.js';
import {
    BEAR_TRAP,
    BURN,
    CORR,
    DOOR,
    D_CLOSED,
    FIRE_RES,
    HEADSTONE,
    INVIS,
    IS_FOUNTAIN,
    IS_FURNITURE,
    MON_FLOOR,
    MON_MIGRATING,
    NEED_WEAPON,
    NORMAL_SPEED,
    OBJ_MINVENT,
    ROOM,
    STRAT_CLOSE,
    SLEEP_RES,
    SLP_GAS_TRAP,
    FIRE_TRAP,
    ANTI_MAGIC,
} from './const.js';
import { exercise } from './attrib.js';
// js/allmain.js imports this file's action runners, so this edge closes an
// import cycle. `stop_occupation` is a hoisted function declaration, which an
// ES module cycle initializes before either module body runs; nothing here
// reads it at module scope.
import { stop_occupation } from './allmain.js';
import { bot, map_invisible, newsym, obj_to_glyph, tmp_at } from './display.js';
import { mdig_tunnel } from './dig.js';
import { flooreffects } from './do.js';
import { should_mulch_missile, shipsAway } from './dothrow.js';
import {
    best_target,
    dog_eat,
    dog_move,
    finish_meating,
    pet_ranged_attk,
} from './dogmove.js';
import { capitalizedMonsterName } from './do_name.js';
import { engr_at, wipe_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { losehp, nh_delay_output, nomul } from './hack.js';
import { hands_obj, obj_extract_self, stackobj } from './invent.js';
import { any_light_source } from './light.js';
import { m_dowear, set_mimic_sym } from './makemon_create.js';
import { fightm } from './mhitm.js';
import { mattacku, MonsterDeathPlanningError } from './mhitu.js';
import { m_throw, thitu, thrwmu } from './mthrowu.js';
import { AKLYS } from './objects.js';
import {
    adaptMonsterActionToDochugwSignature,
    minliquid,
    movemon_singlemon,
    restrap,
    wake_msg,
} from './mon.js';
import {
    attacktype,
    defended,
    is_covetous,
    is_swimmer,
    likes_lava,
    monsndx,
    monster_resists_element,
    nohands,
    passes_walls,
    perceives,
    resists_magm,
    tunnels,
    verysmall,
} from './mondata.js';
import {
    AD_FIRE,
    AD_MAGM,
    AD_SLEE,
    AT_MAGC,
    PM_ERINYS,
    PM_FLOATING_EYE,
    PM_FOG_CLOUD,
    PM_GELATINOUS_CUBE,
    PM_GREMLIN,
    PM_KILLER_BEE,
    PM_KITTEN,
    PM_LEPRECHAUN,
    PM_LITTLE_DOG,
    PM_MEDUSA,
    PM_PONY,
    PM_SHRIEKER,
    PM_TENGU,
    S_EEL,
} from './monsters.js';
import {
    INERT_DOOR_MASKS,
    dochug,
    dochugw,
    m_avoid_kicked_loc,
    m_avoid_soko_push_loc,
    m_everyturn_effect,
    m_in_air,
    m_move,
} from './monmove.js';
import { m_at } from './monst.js';
import { select_fresh_monster_item_action } from './muse.js';
import {
    clear_dknown,
    newObject,
    place_object,
    remove_object,
} from './obj.js';
import { observe_object } from './o_init.js';
import { donameFresh } from './objnam.js';
import { encumber_msg } from './pickup.js';
import {
    create_gas_cloud,
    inside_region,
    m_in_out_region,
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
import { is_lava, is_pool, t_at } from './trap.js';
import { ttyPline, ttyPlineWillWait } from './tty_message.js';
import { passive_obj } from './uhitm.js';
import {
    block_point,
    cansee,
    couldsee,
    does_block,
    m_canseeu,
    makeVisionBuffers,
    recalc_block_point,
    vision_recalc,
} from './vision.js';
import {
    dmgval,
    mon_wield_item,
    select_hwep,
    select_rwep,
    setmnotwielded,
} from './weapon.js';
import { mwelded, will_weld } from './wield.js';
import { is_pole } from './worn.js';

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
    // mon.c restrap() is ported, so an M1_HIDE monster is scanned like any
    // other; the eel half stands, because movemon_singlemon()'s S_EEL arm ends
    // in mon.c hideunder(), which is not.
    const liquidReason = unportedMinliquidReason(monster, state);
    if (liquidReason) unsupported(liquidReason);
    if (monster.data?.mlet === S_EEL)
        unsupported('eel concealment');
    return true;
}

// C ref: mon.c minliquid_core() (961-1122). The ordinary pool and lava
// branches now run through js/mon.js. This predicate retains only the
// species-specific fountain split that this bounded slice deliberately leaves
// at the action boundary.
//
// The square decides for every species but one. C derives `inpool` at :967 and
// `inlava` at :971 to guard the drown and burn effects at :1068 and :1010,
// neither ported. A flyer or floater is exempt from both: C's `inpool` and
// `inlava` are false for those species (outside the Plane of Water, where
// Is_waterlevel at :970 re-includes flyers; that level is not yet reachable).
// Non-flying, non-floating monsters on pool or lava are refused because
// minliquid_core()'s burn and drown effects are not ported.
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
    // trap.c mintrap()'s mtmp->mtrapped arm, which monmove.c m_move()'s
    // prologue reaches at :1734, is admitted for the bear trap alone, and this
    // gate is the sole guard rather than the outer half of two. mtrapped does
    // not say which trap holds the monster, so the gate reads the square.
    //
    // What the ported arm would do with the others, if this gate let them by:
    // a web is handled completely, since C's own line at 3768-3770 covers
    // BEAR_TRAP and WEB alike; a pit stops at js/trap_effects.js's is_pit()
    // refusal before any write; and only MAGIC_TRAP reaches C:3771's silent
    // `else`, which messageAt() cannot reproduce, and its refusal fires only
    // on the branch where the roll frees a visible monster. A web is excluded
    // here anyway, because the metallivore refusal further down that arm is
    // unconditional where C's block is conditional on ttyp. Keeping the gate
    // ahead of dochug() is what stops a turn being half-spent on any of them.
    if (monster.mtrapped) {
        const heldBy = t_at(monster.mx, monster.my, state);
        if (heldBy && heldBy.ttyp !== BEAR_TRAP)
            unsupported('a trapped monster');
    }
    if (monster.mtame && !monster.isminion) {
        if (!STARTING_PETS.has(monster.data?.pmidx))
            unsupported('a non-starting pet');
        if (monster.msleeping || monster.mleashed) {
            unsupported('special starting-pet state');
        }
        if (!monster.mextra?.edog)
            unsupported('missing starting-pet state');
        return;
    }

    if (monster.mtame || monster.isminion)
        unsupported('minion movement');
    if (monster.wormno || monster.isgd || is_covetous(monster.data)) {
        unsupported('special monster movement');
    }
    // isshk and ispriest are admitted: m_move() dispatches to shk_move()
    // and pri_move() respectively, which handle the stationary and milling
    // paths and refuse the rest.
    //
    // mon.c m_respond() is a no-op unless its source predicates hold: a
    // shrieker must be adjacent, Medusa must be in couldsee(), and Erinys
    // must be hostile, able to see, and able to see the hero. Refuse only
    // those active response branches; a distant shrieker, for example, falls
    // through dochug() without any special-action work.
    // monmove.c dochug() checks msleeping before m_move()'s leppie_avoidance()
    // arm. For a non-tame, non-minion leprechaun outside couldsee(),
    // disturb() returns 0 without a draw, so this exact case returns from
    // dochug() before any leprechaun-specific movement. Keep every other
    // leprechaun state behind the special-action boundary.
    const sleepingOutOfSightLeprechaun =
        monster.data?.pmidx === PM_LEPRECHAUN
        && monster.msleeping
        && !monster.mtame
        && !monster.isminion
        && !couldsee(monster.mx, monster.my, state);
    const specialResponseNeeded = monster.data?.pmidx === PM_SHRIEKER
        ? Math.abs(monster.mx - state.u.ux) <= 1
            && Math.abs(monster.my - state.u.uy) <= 1
        : monster.data?.pmidx === PM_MEDUSA
            ? couldsee(monster.mx, monster.my, state)
            : monster.data?.pmidx === PM_ERINYS
                ? !monster.mpeaceful
                    && monster.mcansee
                    && m_canseeu(monster, state)
                : false;
    if ((SPECIAL_RESPONDERS.has(monster.data?.pmidx)
            && specialResponseNeeded)
        || monster.data?.pmidx === PM_TENGU
        || (monster.data?.pmidx === PM_LEPRECHAUN
            && !sleepingOutOfSightLeprechaun)
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
            // state borrows. A planned door opening or visible-region change
            // rebuilds the index from the clone, and the planning wrapper
            // restores it from the live map afterward. Off-hero
            // do_clear_area() may therefore share it.
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
        // track.c settrack() advances the ring during every planned elapsed
        // turn. The clone must own both counters and coordinates; sharing the
        // ring makes the live pass see the planning footprint a second time.
        track: state.track
            ? {
                utcnt: state.track.utcnt,
                utpnt: state.track.utpnt,
                utrack: state.track.utrack.map((coordinate) => ({
                    x: coordinate.x,
                    y: coordinate.y,
                })),
            }
            : state.track,
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
        // cmd.c's gc.command_queue. cmdq_clear() empties a queue in place
        // (`commandQueue(state)[q].length = 0`), so a shared array is a live
        // write. The dry run reaches it through stop_occupation(), which
        // clears CQ_CANNED twice -- once through nomul(0) and once
        // unconditionally at allmain.c:352 -- and timeout.c's expiring
        // WOUNDED_LEGS case calls stop_occupation() gated on nothing, unlike
        // every other route in, which needs an active occupation. A canned
        // sequence pending from js/dothrow.js would be discarded by the plan
        // rather than by the game. The rows themselves are read-only
        // extcmdlist entries and need no deepening.
        command_queue: state.command_queue?.map((queue) => [...queue]),
        gd: { ...(state.gd ?? {}) },
        // mthrowu.c monshoot() fills this record before entering m_throw(). A
        // rejected planned flight must not leave those values in live state.
        m_shot: { ...(state.m_shot ?? {}) },
        // decl.h:457-458's hitmsg_mid and hitmsg_prev, which mhitu.c hitmsg()
        // writes and missmu() clears on every monster attack the scan replays.
        // The two answer whether a monster's next blow says "again", and the
        // dry run's copy must not decide the live pass's answer.
        gh: { ...(state.gh ?? {}) },
        // decl.h gf.far_noise, which mhitm.c noises() writes beside
        // gn.noisetime in `gn` below. The pair rate-limits "You hear some
        // noises." to one line per ten moves at each distance band, so a dry
        // run that raised the live flag and left the live timestamp alone
        // would silence the line the live pass owes.
        gf: { ...(state.gf ?? {}) },
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

// C ref: trap.c m_harmless_trap() (1133-1175). Only these three traps ask
// for resistance; the surrounding trap cases are decided by
// monmove.js m_harmless_trap() without a callback.
function resistsTrapEffect(monster, trapType, env) {
    const state = env.state ?? game;
    if (trapType === SLP_GAS_TRAP) {
        return monster_resists_element(monster, SLEEP_RES, state)
            || defended(monster, AD_SLEE, state);
    }
    if (trapType === FIRE_TRAP) {
        return monster_resists_element(monster, FIRE_RES, state)
            || defended(monster, AD_FIRE, state);
    }
    if (trapType === ANTI_MAGIC) {
        return resists_magm(monster, state)
            || defended(monster, AD_MAGM, state);
    }
    return false;
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

// Shared by the cloned movement scan and allmain.js's cloned elapsed-turn
// allocation. Every planned block_point() caller must enter through here
// before it rebuilds the borrowed transparency index.
export function admitPlannedVisionChange(x, y, state) {
    isolatePlannedVision(state);
    // block_point() rebuilds the complete module-wide transparency index, so
    // one affected coordinate is sufficient to rebuild it from the live map
    // when planning finishes, even when the clone makes several changes.
    state._plannedVisionChange ??= { x, y };
}

// makemon.c set_mimic_sym() rebuilds vision when the selected disguise blocks
// light. The planning pass borrows vision.c's module-wide transparency index,
// so it marks that borrow before block_point() derives the index from the
// cloned monster map. preflightSimpleMonsterActions() restores the index from
// the live map in its finally block.
function setPlannedMimicSym(monster, env) {
    return set_mimic_sym(monster, {
        ...env,
        hooks: {
            ...(env.hooks ?? {}),
            doesBlock: (x, y, location, normalized) => does_block(
                x,
                y,
                location,
                normalized.state,
            ),
            blockPoint: (x, y, normalized) => {
                admitPlannedVisionChange(x, y, normalized.state);
                block_point(x, y, normalized.state);
            },
        },
    });
}

function admitDoorOpening(x, y, env) {
    const { state } = env;
    if (!env.planning) return;
    admitPlannedVisionChange(x, y, state);
}

async function admitSimpleDestinationAndRegion(monster, x, y, env) {
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
    // C ref: mon.c mfndpos() :2166-2170. poolok and lavaok decide whether the
    // monster can step onto pool and lava tiles. m_in_air() covers flyers,
    // floaters, and ceiling-clinging clingers; is_swimmer() covers swimmers
    // (but not eels that *want* pool -- assertSimpleScanState refuses eels
    // before this point); likes_lava() covers fire elementals and salamanders.
    // PM_FLOATING_EYE overrides lavaok to FALSE at :2169-2170 (prefers to
    // avoid heat). On the Plane of Water, Is_waterlevel at :2166 suppresses
    // m_in_air() for poolok; that level is not yet reachable.
    const poolOkay = m_in_air(monster, state)
        || (is_swimmer(monster.data) && monster.data.mlet !== S_EEL);
    const lavaOkay = (m_in_air(monster, state) || likes_lava(monster.data))
        && monsndx(monster.data) !== PM_FLOATING_EYE;
    const liquidDestination = (is_pool(x, y, state) && poolOkay)
        || (is_lava(x, y, state) && lavaOkay);
    const ordinaryDestination = location
        && (location.typ === ROOM
            || location.typ === CORR
            || IS_FURNITURE(location.typ)
            || inertDoorway
            || opensDoor
            || liquidDestination);
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
        const currentlyInside = mon_in_region(region, monster);
        const destinationInside = inside_region(region, x, y);
        if (currentlyInside === destinationInside) continue;

        // This boundary admits only monmove.c m_everyturn_effect()'s harmless
        // fog vapor. Its transition callbacks are unset, so the selected path
        // only removes the moving fog's cached ID. Other species can reach
        // monmove.c m_postmove_effect() after this transition, and callback-
        // bearing regions can change more than cached membership; both stay
        // fail-closed until their complete source paths are ported.
        const leavesHarmlessFogVapor = currentlyInside
            && monsndx(monster.data) === PM_FOG_CLOUD
            && region.inside_f === 'inside_gas_cloud'
            && Math.trunc(region.arg ?? 0) === 0
            && region.can_enter_f == null
            && region.enter_f == null
            && region.can_leave_f == null
            && region.leave_f == null;
        if (!leavesHarmlessFogVapor)
            unsupported('a region transition');
    }
    // Last, so that a destination another guard rejects prepares nothing.
    if (opensDoor) admitDoorOpening(x, y, env);
    return m_in_out_region(monster, x, y, env);
}

function wipeSimpleEngraving(x, y, _count, _magical, env) {
    const engraving = engr_at(x, y, env.state);
    if (!engraving || engraving.engr_type === HEADSTONE
        || engraving.nowipeout
        || (engraving.engr_type === BURN && !is_ice(x, y, env.state))) {
        return;
    }
    return wipe_engr_at(x, y, _count, _magical, env);
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
        mdigTunnel: mdig_tunnel,
        mayCrossRegion: admitSimpleDestinationAndRegion,
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
        // dogmove.c:1280-1287 hands an ALLOW_U landing directly to
        // mattacku().  Starting pets are constrained by assertSimpleActionState
        // above; mattacku() itself keeps every attack family outside this
        // ordinary visible physical boundary fail-closed.
        attackHero: attackHeroWithMattacku,
        avoidKicked: (subject, x, y) =>
            m_avoid_kicked_loc(subject, x, y, env.state),
        avoidSokobanPush: (subject, x, y) =>
            m_avoid_soko_push_loc(subject, x, y, env.state),
        bestTarget: best_target,
        canSeeMonster: (subject) => canSeeMonster(subject, env.state),
        digWeaponCheck: () => false,
        displaceMonster: () => unsupported('pet displacement'),
        eatObject: dog_eat,
        mayCrossRegion: admitSimpleDestinationAndRegion,
        // Three printing sites share the `message` seam: dog_invent()'s carry
        // arm through dogmove.c pline_xy(), its drop arm through steal.c
        // mdrop_obj(), and dog_move()'s cursed-step line through pline.c
        // pline_mon(). Two of those three also repaint through the `redraw`
        // seam -- the carry arm at js/dogmove.js dog_invent()'s
        // obj_extract_self(), and the drop arm through js/steal.js relobj()'s
        // tail. The cursed-step line repaints nothing, matching C, where
        // dogmove.c:1296-1312 calls no newsym().
        //
        // The planning scan replays the same turn against the live display
        // afterwards, so it must produce neither a message nor a repaint.
        // Removing `message` because one of its three sites no longer needs it
        // writes the other two's lines, and removing `redraw` because one of
        // its two no longer needs it repaints for the other, on a turn the
        // scan may still refuse.
        message: env.planning ? async () => {} : ttyPline,
        waitMap: env.planning ? async () => {} : undefined,
        // js/mhitm.js pre_mm_attack() marks a combatant the hero cannot spot
        // through display.c map_invisible(), which writes map memory and then
        // paints through show_glyph_cell(). This clone's level cells are the
        // live game's, so the planned pass must write neither half; the live
        // replay of the same turn writes both.
        markInvisible: env.planning ? () => {} : map_invisible,
        monsterReflects: () => unsupported('pet combat evaluation'),
        petRangedAttack: pet_ranged_attk,
        redraw: env.planning ? () => {} : newsym,
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

// C ref: mthrowu.c thrwmu() (566-...), the head that mattacku()'s range2
// AT_WEAP arm reaches. thrwmu() is not ported, and the port lets a monster
// past only where C's own head returns without acting: select_rwep() finds no
// missile.
//
// C reaches that answer twice. It first sets weapon_check to
// NEED_RANGED_WEAPON and calls mon_wield_item(), whose ranged branch runs
// select_rwep() and, finding nothing, leaves weapon_check at NEED_WEAPON and
// returns 0; thrwmu() then calls select_rwep() itself and returns. This runs
// the selection once and writes the same weapon_check, because
// runSimpleMonsterAction() binds mon_wield_item()'s selectRangedWeapon
// operation to a refusal and going through it would stop every monster C
// leaves alone.
async function throwRangedWeapon(monster, env) {
    const selectionEnv = {
        ...env,
        touchArtifact: () => unsupported('monster artifact weapon selection'),
    };
    if (monster.weapon_check === NEED_WEAPON || !monster.mw) {
        const propellorResult = {};
        const selected = select_rwep(monster, {
            ...selectionEnv,
            propellorResult,
        });
        const propellor = propellorResult.value;
        if (selected && (is_pole(selected, env.state)
            || selected.otyp === AKLYS)) {
            unsupported('monster polearm or returning-weapon action');
        }
        if (propellor && propellor !== hands_obj) {
            // C's thrwmu() preamble reaches mon_wield_item() even when a
            // different, non-welded MON_WEP already exists. That call clears
            // the old W_WEP bit, equips gp.propellor, announces the switch,
            // and consumes this monster turn. A welded current weapon stays
            // fail-closed because weapon.c mon_wield_item() takes its own
            // refusal branch instead of replacing it.
            if (monster.mw && mwelded(monster.mw, env.state))
                unsupported('monster ranged wield with a welded current weapon');
            if (propellor.oartifact || artifact_light(propellor))
                unsupported('monster ranged artifact wield');
            if (will_weld(propellor, env.state))
                unsupported('monster ranged wield with a welded weapon');
        }
    }
    let plannedAnnouncementWaits = false;
    return thrwmu(monster, {
        ...selectionEnv,
        canSeeMonster: (subject) => canSeeMonster(subject, env.state),
        canSeeSquare: (x, y) => cansee(x, y, env.state),
        clearObjectKnowledge: (obj) => clear_dknown(obj, env.state),
        damageValue: (obj, target, actionEnv) => dmgval(
            obj,
            target,
            actionEnv.state,
            { random: actionEnv.random, unsupported },
        ),
        delayOutput: env.planning ? async () => {} : nh_delay_output,
        endMulti: (value, state) => nomul(value, state),
        extractObject: (obj, actionEnv) => obj_extract_self(obj, actionEnv),
        floorEffects: (obj, x, y, verb, actionEnv) => flooreffects(
            obj,
            x,
            y,
            verb,
            actionEnv,
        ),
        hitHero: (hitv, damage, obj, actionEnv) => {
            if (actionEnv.planning && actionEnv.state.iflags?.showdamage)
                unsupported('monster missile hit with showdamage');
            return thitu(hitv, damage, obj, null, actionEnv.state, {
                ...actionEnv,
                exercise: (index, increase, state) => exercise(
                    index,
                    increase,
                    state,
                    actionEnv.random,
                    {
                        encumberMessage: actionEnv.planning
                            ? async () => {} : encumber_msg,
                    },
                ),
                losehp,
                requireHit: true,
            });
        },
        message: env.planning
            ? async (text, state) => {
                plannedAnnouncementWaits = ttyPlineWillWait(text, state);
            }
            : ttyPline,
        monsterAt: (x, y, state) => m_at(x, y, state),
        monsterName: (subject) => capitalizedMonsterName(subject, env.state),
        objectToGlyph: (obj, state) => obj_to_glyph(obj, state),
        observeObject: (obj, state) => observe_object(obj, state),
        passiveObject: (target, obj, attack, actionEnv) => passive_obj(
            target,
            obj,
            attack,
            actionEnv.state,
            actionEnv,
        ),
        placeObject: (obj, x, y, actionEnv) => place_object(
            obj,
            x,
            y,
            actionEnv,
        ),
        setMonsterNotWielded: (subject, obj, actionEnv) =>
            setmnotwielded(subject, obj, actionEnv),
        shipsAway: (x, y, state) => shipsAway(x, y, state),
        shouldMulch: (obj, actionEnv) => should_mulch_missile(
            obj,
            actionEnv.state,
            actionEnv,
        ),
        stackObject: (obj, actionEnv) => stackobj(obj, {
            ...actionEnv,
            hooks: {
                ...(actionEnv.hooks ?? {}),
                extractExternalObject: remove_object,
            },
        }),
        stopOccupation: (state) => stop_occupation(state, {
            message: env.planning ? async () => {} : ttyPline,
            statusRefresh: env.planning ? () => {} : () => bot(),
        }),
        temporaryDisplay: env.planning ? async () => {} : tmp_at,
        throwMissile: env.planning
            ? (...args) => plannedAnnouncementWaits
                ? undefined : m_throw(...args)
            : m_throw,
        unsupported,
        wieldMessage: async (subject, obj, detail) => {
            if (env.planning) return;
            await ttyPline(
                `${capitalizedMonsterName(subject, env.state)} wields `
                + `${donameFresh(obj, env.state)}`
                + `${detail.exclaim ? '!' : '.'}`,
                env.state,
            );
        },
    });
}

// The dochug() operation that mhitu.c mattacku() sits behind. Everything it
// still refuses -- the hero-concealment blocks, summonmu(), u.uinvulnerable,
// use_offensive(), wildmiss(), hitmu() and every aatyp arm outside the two
// melee ones -- refuses from inside mattacku() itself, so this seam adds only
// the operations that file cannot import.
function attackHeroWithMattacku(monster, env) {
    return mattacku(monster, { ...env, throwRangedWeapon, unsupported });
}

export async function wieldMonsterItemAgainstMonster(
    weaponUser,
    weaponEnv,
) {
    const selectionEnv = {
        ...weaponEnv,
        touchArtifact: () => unsupported('monster artifact weapon selection'),
    };
    const selected = select_hwep(weaponUser, selectionEnv);
    // This boundary admits only the empty-handed ordinary wielding turn. A
    // current weapon continues into possibly_unwield(), and a newly welded
    // weapon adds the welded message and discovery writes; both remain with
    // the armed-swing continuation.
    if (selected && weaponUser.mw)
        unsupported('monster wield action with a current weapon');
    if (selected?.oartifact)
        unsupported('monster artifact weapon selection');
    if (selected && will_weld(selected, weaponEnv.state))
        unsupported('monster wield action with a welded weapon');
    return mon_wield_item(weaponUser, {
        ...selectionEnv,
        canSeeMonster: (subject) =>
            canSeeMonster(subject, weaponEnv.state),
        // The planning pass mutates its cloned monster and inventory, but
        // leaves the live terminal and object discovery state untouched. The
        // live replay performs doname() and writes the same pline_mon() text
        // as C.
        wieldMessage: async (subject, obj, detail) => {
            if (weaponEnv.planning) return;
            await ttyPline(
                `${capitalizedMonsterName(subject,
                    weaponEnv.state)} wields `
                + `${donameFresh(obj, weaponEnv.state)}`
                + `${detail.exclaim ? '!' : '.'}`,
                weaponEnv.state,
            );
        },
    });
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
                // This file's one seam onto mhitu.c mattacku(). C reaches it
                // from dochug()'s standard-attack gate whether or not the
                // monster moved first, and js/monmove.js now breaks into that
                // gate the way monmove.c:948 does instead of calling mattacku()
                // a second way. Two further seams still refuse ahead of C's
                // steed draw, named by symbol because both line citations here
                // were wrong: js/dogmove.js dog_move()'s usteed arm
                // (dogmove.c:911) and js/dogmove.js pet_ranged_attk()
                // (dogmove.c:1286).
                attackHero: attackHeroWithMattacku,
                monFlee: () => unsupported('monster flight'),
                monsterCanSeeHero: ordinaryMonsterCanSeeHero,
                moveMonster: moveSimpleOrdinary,
                selectRangedWeapon: () =>
                    unsupported('monster ranged weapon selection'),
                // muse.c find_offensive(), which dochug()'s post-move
                // disjunction calls, refuses through this rather than
                // answering TRUE.
                unsupported,
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
                    if (selected?.oartifact)
                        unsupported('monster artifact weapon selection');
                    if (selected
                        && weaponUser.mw
                        && mwelded(weaponUser.mw, weaponEnv.state))
                        unsupported(
                            'monster wield with a welded current weapon',
                        );
                    if (selected
                        && will_weld(selected, weaponEnv.state))
                        unsupported(
                            'monster wield action with a welded weapon',
                        );
                    return mon_wield_item(weaponUser, {
                        ...selectionEnv,
                        canSeeMonster: (subject) =>
                            canSeeMonster(subject, weaponEnv.state),
                        wieldMessage: async (subject, obj, detail) => {
                            if (weaponEnv.planning) return;
                            await ttyPline(
                                `${capitalizedMonsterName(subject,
                                    weaponEnv.state)} wields `
                                + `${donameFresh(obj, weaponEnv.state)}`
                                + `${detail.exclaim ? '!' : '.'}`,
                                weaponEnv.state,
                            );
                        },
                    });
                },
                wieldMonsterItemAgainstMonster,
                wakeMessage: env.planning ? () => {} : wake_msg,
                wipeEngraving: wipeSimpleEngraving,
                finishEating: finish_meating,
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
        // C ref: monmove.c:657-661 and region.c create_gas_cloud(). The
        // one-square harmless vapor spends one rn1(3, 4) draw, then adds a
        // visible region. The clone owns the region, locations and COULD_SEE
        // buffers. It temporarily borrows the module-wide transparency index,
        // paints nothing, and the planning wrapper restores that index from the
        // live map before returning. The live pass uses allmain.js's ordinary
        // region hooks and commits the same effects to the display and vision.
        createGasCloud: (x, y, size, damage, effectEnv) => {
            const { state } = effectEnv;
            admitPlannedVisionChange(x, y, state);
            return create_gas_cloud(x, y, size, damage, {
                ...effectEnv,
                blockPoint: (cloudX, cloudY) =>
                    block_point(cloudX, cloudY, state),
                canSee: (cloudX, cloudY) => cansee(cloudX, cloudY, state),
                newsym: () => {},
                message: async () => {},
            });
        },
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
        // A newly visible fog region has already isolated the clone before it
        // reaches this call. A mobile light source can reach it without a map
        // change, so isolate here too. The planned terrain still matches the
        // live terrain in that case, which lets vision_recalc() read the shared
        // transparency index without rebuilding or restoring it.
        visionRecalc: (control) => {
            isolatePlannedVision(env.state);
            return planningVisionRecalc(env.state)(control);
        },
        clearBypasses: () => unsupported('monster bypass cleanup'),
        // C ref: mon.c minliquid(). The clone uses the same source function
        // as the live elapsed-turn owner, but every display, relocation,
        // inventory, and overcrowding tail stays a planning-owned seam.
        minLiquid: (subject, subjectEnv) => minliquid(subject, {
            ...subjectEnv,
            unsupported,
            message: async () => {},
            canSee: (x, y) => cansee(x, y, subjectEnv.state),
            relocateMonster: () => unsupported(
                'monster liquid relocation',
            ),
            fireDamageChain: () => unsupported(
                'monster fire inventory damage',
            ),
            waterDamageChain: () => unsupported(
                'monster water inventory damage',
            ),
            dealWithOvercrowding: () => unsupported(
                'monster liquid overcrowding',
            ),
            hooks: {
                ...(subjectEnv.hooks ?? {}),
                newsym: () => {},
            },
        }),
        // C ref: mon.c movemon_singlemon():1268-1281. m_dowear() reassesses
        // the monster's gear. Its new W_ARMF/no-old-item arm applies the
        // source delay and worn masks on the planning clone; other runtime
        // equipment changes remain a fail-closed boundary.
        dowear: (subject, creation, subjectEnv) => m_dowear(subject, creation, {
            ...subjectEnv,
            wearArmor: () => unsupported('monster equipment changes'),
        }),
        // C ref: mon.c restrap(). js/allmain.js binds the same function for the
        // live pass. This clone binding keeps set_mimic_sym()'s disguise and
        // visibility updates on the planning state.
        restrap: (subject, subjectEnv) => restrap(subject, {
            ...subjectEnv,
            setMimicSym: setPlannedMimicSym,
        }),
        canSeeMonster: (subject) => canSeeMonster(subject, env.state),
        hideUnder: () => unsupported('eel concealment'),
        // movemon_singlemon() requires these three. fightm() owns the
        // resistance preflight for this slice; the visibility operations stay
        // here so the planning and live scans take the same final Conflict
        // gates before dochugw().
        canSeeHero: () => true,
        canSeeSquare: (x, y) => cansee(x, y, env.state),
        fightMonster: (subject, subjectEnv) => fightm(subject, {
            ...subjectEnv,
            // mhitm.c owns these effects, but the clone must remain silent and
            // must not mutate the live display while preflighting a turn.
            message: async () => {},
            markInvisible: () => {},
            redraw: () => {},
            wieldMonsterItemAgainstMonster,
            unsupported,
        }),
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
    let heroDeath = null;
    try {
        try {
            upkeepCount = await planSimpleMonsterTurn(
                planned,
                random,
                advanceRound,
            );
        } catch (error) {
            if (!(error instanceof MonsterDeathPlanningError)) throw error;
            // The live pass must replay the same monster turn against the real
            // state. Keep the source result and attacker identity in the
            // preflight result rather than treating this as an unsupported
            // branch and discarding the matching prefix.
            heroDeath = {
                monsterId: error.monsterId,
                how: error.how,
            };
        }
    } finally {
        // A planned door opening or blocking mimic disguise rebuilt
        // js/vision.js's shared transparency index from the planned map.
        // Deriving it again from the live map restores it, whether the plan
        // finished or refused partway through.
        //
        // recalc_block_point() is not side-effect-free on the live state:
        // rebuildVisionPoint() sets vision_full_recalc whenever the change
        // touches the hero's current vision, which is the normal case for a
        // door in a lit room. Leaving that set would make the live scan run a
        // vision_recalc(0) C never performs, so the flag is saved and written
        // back — the restore has to restore everything it touches, not only
        // the index it came for.
        if (planned._plannedVisionChange) {
            const { x, y } = planned._plannedVisionChange;
            const fullRecalcBefore = state.vision_full_recalc;
            recalc_block_point(x, y, state);
            state.vision_full_recalc = fullRecalcBefore;
        }
    }
    return {
        runsOncePerTurnUpkeep: upkeepCount > 0,
        upkeepCount,
        heroDeath,
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
