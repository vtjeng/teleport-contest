// dig.js -- what a wielded digging tool is pointed at, what rots away, and
// how Mine Town watchmen respond to digging.
// C refs: src/dig.c dig_typ(), rot_organic(), rot_corpse(),
// watchman_canseeu(), watch_dig().
//
// dig.c bury_an_obj() is ported in js/bury.js, which predates this file and
// keeps its own name because it also holds zap.c obj_resists().

import {
    A_CHA,
    A_CON,
    A_DEX,
    A_INT,
    A_STR,
    A_WIS,
    COLNO,
    CORR,
    DEAF,
    DB_MOAT,
    DBWALL,
    DB_UNDER,
    D_BROKEN,
    D_NODOOR,
    D_TRAPPED,
    DOOR,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    DIGTYP_DOOR,
    DIGTYP_ROCK,
    DIGTYP_TREE,
    DIGTYP_UNDIGGABLE,
    FAINTED,
    Has_contents,
    HALLUC,
    HALLUC_RES,
    IRONBARS,
    IS_ALTAR,
    IS_DOOR,
    IS_FOUNTAIN,
    isok,
    IS_OBSTRUCTED,
    IS_SINK,
    IS_THRONE,
    IS_TREE,
    IS_WALL,
    LAVAPOOL,
    MOAT,
    OBJ_AT,
    OBJ_FLOOR,
    POOL,
    ROOM,
    ROWNO,
    SCORR,
    SDOOR,
    SHOPBASE,
    STONE,
    TT_BURIEDBALL,
    u_at,
    W_NONDIGGABLE,
} from './const.js';
import { game } from './gstate.js';
import { objectGenerationEnv } from './object_generation.js';
// js/hack.js imports dig_typ(); both crossings occur only inside function
// bodies, so the source-owned in_town() remains safe across the cycle.
import { in_town } from './hack.js';
import { obfree, obj_extract_self } from './invent.js';
import { hides_under, is_watch } from './mondata.js';
import { angry_guards, get_iter_mons } from './mon.js';
import { closed_door, youHear } from './monmove.js';
import { m_at } from './monst.js';
import {
    APPLE,
    BANANA,
    BOULDER,
    EUCALYPTUS_LEAF,
    HEAVY_IRON_BALL,
    ORANGE,
    PEAR,
    ROCK,
} from './objects.js';
import { cvt_sdoor_to_door } from './detect.js';
import { verbalize } from './pline.js';
import { in_rooms } from './rooms.js';
import { acurr } from './attrib.js';
import { is_axe, is_pick, mksobj_at, remove_object, sobj_at } from './obj.js';
import { canseemon, m_canseeu, recalc_block_point, unblock_point } from './vision.js';
import { rn1, rn2 } from './rng.js';
import { set_voice } from './sounds.js';
import { is_lava, is_pool } from './trap.js';
import { stairway_at } from './stairs.js';
import { dist2, s_suffix } from './hacklib.js';
import { unconscious } from './trap.js';
import { ttyPline } from './tty_message.js';

// C ref: youprop.h Unaware. The draft-message random roll is skipped while a
// negative multi represents unconsciousness or fainting.
function unaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || state.u?.uhs === FAINTED);
}

// C ref: dig.c dig_typ() (167-192). Answers what digging into <x,y> with
// `otmp` would break: a door, a tree, rock, or nothing diggable at all.
// DIGTYP_UNDIGGABLE is 0, so C's callers spell the question as a plain truth
// test on the result.
//
// The axe arm (177-180) and the pick's door, tree and rock arms (186-191) are
// ported. The pick's statue arm (182-183) and boulder arm (184-185) are not:
// each asks sobj_at() and then pick_can_reach(), which needs bimanual(),
// Flying, u.utrap and trap.c conjoined_pits(). The only caller, hack.c
// domove_fight_empty(), refuses a square holding a boulder or a statue above
// the line that asks this question -- js/hack.js does it with a wider test
// than C's, sobj_at() for both rather than C's glyph reads -- so no call can
// reach either arm. Porting them belongs with use_pick_axe2(), the caller that
// can.
//
// The order of the pick's remaining arms is what dig.c's own "pick vs tree"
// comment marks. A tree is answered DIGTYP_UNDIGGABLE before IS_OBSTRUCTED()
// is asked, and TREE is obstructed, so without that arm a pick would be told
// to dig a tree as rock. The arboreal conjunct beneath it asks a separate
// question and settles only the obstructed types that are neither walls nor
// trees, which leaves the two secret ones, SDOOR and SCORR.
// C ref: dig.c is_digging() (195-201). Returns true when the hero is
// currently performing the dig occupation. The dig() occupation callback
// is not yet ported, so this always returns false.
export function is_digging(_state) {
    // The dig() occupation callback is not ported to JS, so the hero can
    // never be in the dig occupation.
    return false;
}

// C ref: dig.c watchman_canseeu() (1362-1368). The guard must be a watchman,
// able to see, able to see the hero, and peaceful. m_canseeu() owns the
// compiled vision variant, including the hero's invisibility and underwater
// checks.
export function watchman_canseeu(mtmp, state = game) {
    return is_watch(mtmp?.data)
        && mtmp.mcansee
        && m_canseeu(mtmp, state)
        && mtmp.mpeaceful;
}

function heroDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF] ?? {};
    return Boolean(
        deafness.intrinsic || deafness.extrinsic
        || state.u?.uroleplay?.deaf,
    );
}

// C ref: dig.c watch_dig() (1377-1410). This is called by the monster watch,
// chewing, and wand-digging paths before their terrain mutation. The optional
// operations keep focused tests independent while production uses the same
// source-owned helpers and live game state.
export async function watch_dig(mtmp, x, y, zap, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const message = rawEnv.message ?? ttyPline;
    const inTown = in_town(x, y, state);
    const lev = state.level?.at(x, y);
    if (!inTown || !lev
        || !(closed_door(x, y, state)
            || lev.typ === SDOOR
            || IS_WALL(lev.typ)
            || IS_FOUNTAIN(lev.typ)
            || IS_TREE(lev.typ, state))) {
        return;
    }

    const findWatchman = rawEnv.getIterMons ?? get_iter_mons;
    if (!mtmp)
        mtmp = findWatchman(
            (candidate) => watchman_canseeu(candidate, state), state,
        );
    if (!mtmp) return;

    set_voice(mtmp, 0, 80, 0, state);
    if (zap || state.context?.digging?.warned) {
        await verbalize(
            'Halt, vandal!  You\'re under arrest!',
            state,
            { message },
        );
        const anger = rawEnv.angryGuards ?? angry_guards;
        await anger(heroDeaf(state), { ...rawEnv, state, message });
    } else {
        const target = IS_DOOR(lev.typ) ? 'door'
            : IS_TREE(lev.typ, state) ? 'tree'
                : IS_OBSTRUCTED(lev.typ) ? 'wall' : 'fountain';
        await verbalize(`Hey, stop damaging that ${target}!`, state, {
            message,
        });
        state.context ??= {};
        state.context.digging ??= {};
        state.context.digging.warned = true;
    }

    if (is_digging(state)) {
        const stop = rawEnv.stopOccupation
            ?? (await import('./allmain.js')).stop_occupation;
        await stop(state, { ...rawEnv, state, message });
    }
}

export function dig_typ(otmp, x, y, state = game) {
    if (!isok(x, y) || !otmp
        || (!is_pick(otmp, state) && !is_axe(otmp, state)))
        return DIGTYP_UNDIGGABLE;

    const ltyp = state.level.at(x, y).typ;
    if (is_axe(otmp, state))
        return closed_door(x, y, state) ? DIGTYP_DOOR
            : IS_TREE(ltyp, state) ? DIGTYP_TREE /* axe vs tree */
                : DIGTYP_UNDIGGABLE;
    /*assert(is_pick(otmp));*/
    return closed_door(x, y, state) ? DIGTYP_DOOR
        : IS_TREE(ltyp, state) ? DIGTYP_UNDIGGABLE /* pick vs tree */
            : (IS_OBSTRUCTED(ltyp)
               && (!state.level.flags.arboreal || IS_WALL(ltyp)))
                ? DIGTYP_ROCK
                : DIGTYP_UNDIGGABLE;
}

// C ref: dbridge.c is_moat() (100-112). is_pool() deliberately remains a
// separate predicate: on Juiblex's level C still calls MOAT terrain a pool,
// but is_moat() excludes it when fillholetyp() chooses a liquid.
export function is_moat(x, y, state) {
    const location = state.level?.at(x, y);
    const current = state.u?.uz;
    const juiblex = state.juiblex_level;
    const onJuiblex = Boolean(current && juiblex
        && current.dnum === juiblex.dnum
        && current.dlevel === juiblex.dlevel);
    if (!location || onJuiblex) return false;
    return location.typ === MOAT
        || (location.typ === DRAWBRIDGE_UP
            && ((location.flags || location.drawbridgemask || 0) & DB_UNDER)
                === DB_MOAT);
}

// C ref: dig.c fillholetyp() (606-637). Count the liquid around a square in
// x-major/y-minor order, reduce ordinary pools when not forced, then preserve
// C's short-circuit order for the three rn2() choices. This helper is impure
// only because those choices consume the caller's random stream.
export function fillholetyp(x, y, fillIfAny, state = game, random = { rn2 }) {
    const loX = Math.max(1, x - 1);
    const hiX = Math.min(x + 1, COLNO - 1);
    const loY = Math.max(0, y - 1);
    const hiY = Math.min(y + 1, ROWNO - 1);
    let poolCount = 0;
    let moatCount = 0;
    let lavaCount = 0;

    for (let x1 = loX; x1 <= hiX; ++x1) {
        for (let y1 = loY; y1 <= hiY; ++y1) {
            if (is_moat(x1, y1, state)) ++moatCount;
            else if (is_pool(x1, y1, state)) ++poolCount;
            else if (is_lava(x1, y1, state)) ++lavaCount;
        }
    }

    if (!fillIfAny) poolCount = Math.trunc(poolCount / 3);
    if ((lavaCount > moatCount + poolCount
         && random.rn2(lavaCount + 1))
        || (lavaCount && fillIfAny)) {
        return LAVAPOOL;
    }
    if ((moatCount > 0 && random.rn2(moatCount + 1))
        || (moatCount && fillIfAny)) {
        return MOAT;
    }
    if ((poolCount > 0 && random.rn2(poolCount + 1))
        || (poolCount && fillIfAny)) {
        return POOL;
    }
    return ROOM;
}

// C ref: dig.c adj_pit_checks() (1763-1838). The caller supplies the mutable
// coordinate and receives both the boolean permission and the exact refusal
// message. C clears the struct-rm flags before inspecting the surface; the
// JS location keeps doormask as a compatibility mirror, so clear that mirror
// too or monmove.c closed_door() would observe stale door state.
export function adj_pit_checks(coordinate, state = game) {
    if (!coordinate || !isok(coordinate.x, coordinate.y))
        return { allowed: false, message: '' };

    const { x, y } = coordinate;
    const room = state.level.at(x, y);
    room.flags = 0;
    room.doormask = 0;
    const foundation = 'The foundation is too hard to dig through from this angle.';
    let message = '';

    if (is_pool(x, y, state) || is_lava(x, y, state)) {
        // The zap_dig() caller handles liquid after this helper returns false.
        return { allowed: false, message };
    }
    if (closed_door(x, y, state) || room.typ === SDOOR) {
        message = foundation;
    } else if (IS_WALL(room.typ)) {
        message = foundation;
    } else if (IS_TREE(room.typ, state)) {
        message = "The tree's roots glow then fade.";
    } else if ((room.typ === STONE || room.typ === SCORR)
               && (room.wall_info & W_NONDIGGABLE)) {
        message = 'The rock glows then fades.';
    } else if (room.typ === IRONBARS) {
        message = 'The bars go much deeper than your pit.';
    } else if (IS_SINK(room.typ)) {
        message = 'A tangled mass of plumbing remains below the sink.';
    } else if (stairway_at(x, y, state)?.isladder) {
        message = 'The ladder is unaffected.';
    } else {
        let supporting = null;
        if (IS_FOUNTAIN(room.typ)) supporting = 'fountain';
        else if (IS_THRONE(room.typ)) supporting = 'throne';
        else if (IS_ALTAR(room.typ)) supporting = 'altar';
        else if (stairway_at(x, y, state)) supporting = 'stairs';
        else if (room.typ === DRAWBRIDGE_DOWN || room.typ === DBWALL)
            supporting = 'drawbridge';
        if (supporting)
            message = `The ${s_suffix(supporting)} supporting structures remain intact.`;
    }
    return { allowed: !message, message };
}

function setTerrain(location, typ, flags = 0) {
    location.typ = typ;
    location.flags = flags;
    location.doormask = flags;
}

// C ref: shk.c add_damage(). Monster tunneling can damage a shop wall or a
// real shop door. The common development path has no shop, but keeping the
// small save-state record here prevents the terrain mutation from losing the
// repair obligation when that branch is reached.
function addShopDamage(x, y, cost, state) {
    const location = state.level?.at(x, y);
    if (!location) return;
    if (location.typ === DOOR
        && !in_rooms(x, y, SHOPBASE, state).length) return;
    let damage = state.level.damagelist ?? null;
    while (damage) {
        if (damage.place?.x === x && damage.place?.y === y) {
            damage.cost = (damage.cost ?? 0) + cost;
            damage.when = state.moves ?? 0;
            return;
        }
        damage = damage.next ?? null;
    }
    state.level.damagelist = {
        when: state.moves ?? 0,
        place: { x, y },
        cost,
        typ: location.typ,
        flags: location.flags ?? location.doormask ?? 0,
        next: state.level.damagelist ?? null,
    };
}

async function draft_message(unexpected, env) {
    const state = env.state;
    const random = env.random ?? { rn1 };
    const message = env.planning ? async () => {} : (env.message ?? (async () => {}));
    const hallucinating = Boolean(
        state.u?.uprops?.[HALLUC]?.intrinsic
        && !state.u?.uprops?.[HALLUC_RES]?.intrinsic
        && !state.u?.uprops?.[HALLUC_RES]?.extrinsic,
    );
    if (unexpected) {
        if (!hallucinating) {
            await message('You feel an unexpected draft.', state, env);
            return;
        }
        const weak = [A_STR, A_DEX, A_CON, A_CHA, A_INT, A_WIS]
            .some((attribute) => acurr(state, attribute) < 6);
        await message(`You feel like you are ${weak ? '4-F' : '1-A'}.`, state, env);
        return;
    }
    if (!hallucinating) {
        await message('You feel a draft.', state, env);
        return;
    }
    const reactions = ['enlisting', 'marching', 'protesting', 'fleeing'];
    const alignment = Math.sign(state.u?.ualign?.type ?? 0);
    let index = random.rn1(2, 1 - alignment);
    if ((state.u?.ualign?.record ?? 0) < 4)
        index += random.rn1(3, alignment - 1);
    await message(`You feel like ${reactions[index]}.`, state, env);
}

// C ref: dig.c mdig_tunnel() (1413-1490). This is the monster movement arm,
// not the hero's digging command. The caller has already moved the monster;
// this function mutates the destination terrain, performs the one pile roll,
// and redraws the changed square before the caller continues.
export async function mdig_tunnel(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rnd: () => 1, rn2: () => 0 };
    const objectEnv = objectGenerationEnv({ ...rawEnv, state, random });
    const redraw = rawEnv.planning ? () => {} : (rawEnv.redraw ?? (() => {}));
    const message = rawEnv.planning
        ? async () => {}
        : (rawEnv.message ?? (async () => {}));
    const recalcBlockPoint = rawEnv.recalcBlockPoint ?? recalc_block_point;
    const unblockPoint = rawEnv.unblockPoint ?? unblock_point;
    const x = monster.mx;
    const y = monster.my;
    let location = state.level?.at(x, y);
    if (!location) return false;

    // C evaluates rnd(12) before inspecting the square, so preserve that
    // order even when the destination turns out not to be diggable.
    const pile = random.rnd(12);
    if (location.typ === SDOOR)
        location = cvt_sdoor_to_door(location, state);

    if (closed_door(x, y, state)) {
        if (in_rooms(x, y, SHOPBASE, state).length)
            addShopDamage(x, y, 0, state);
        const sawit = canseemon(monster, state);
        const trapped = Boolean((location.doormask ?? location.flags ?? 0) & D_TRAPPED);
        setTerrain(location, DOOR, trapped ? D_NODOOR : D_BROKEN);
        recalcBlockPoint(x, y, state);
        redraw(x, y);
        if (trapped) {
            // mb_trapped() owns the door-trap explosion and monster death.
            // No development witness reaches this arm yet.
            if (typeof rawEnv.mbTrapped !== 'function')
                throw new Error('mdig_tunnel requires mb_trapped for a trapped door');
            const seeit = canseemon(monster, state);
            if (await rawEnv.mbTrapped(monster, sawit || seeit, {
                ...rawEnv,
                state,
                message,
                redraw,
            })) {
                redraw(x, y);
                return true;
            }
        } else if (state.flags?.verbose
            && !unaware(state)
            && !random.rn2(3)) {
            await draft_message(true, { ...rawEnv, state, message });
        }
        return false;
    }

    if (location.typ === SCORR) {
        setTerrain(location, CORR, 0);
        unblockPoint(x, y, state);
        redraw(x, y);
        await draft_message(false, { ...rawEnv, state, message });
        return false;
    }
    if (!IS_OBSTRUCTED(location.typ) && !IS_TREE(location.typ, state))
        return false;
    if ((location.wall_info ?? 0) & W_NONDIGGABLE)
        return false;

    if (IS_WALL(location.typ)) {
        if (state.flags?.verbose && !random.rn2(5)) {
            // Soundeffect() is a no-op in the tty build. You_hear() spends
            // nothing and prints nothing for a deaf hero or under !acoustics.
            const heard = youHear('crashing rock.', state);
            if (heard) await message(heard, state, rawEnv);
        }
        if (in_rooms(x, y, SHOPBASE, state).length)
            addShopDamage(x, y, 0, state);
        if (state.level.flags?.is_maze_lev) {
            setTerrain(location, ROOM, 0);
        } else if (state.level.flags?.is_cavernous_lev && !in_town(x, y, state)) {
            setTerrain(location, CORR, 0);
        } else {
            setTerrain(location, DOOR, D_NODOOR);
        }
    } else if (IS_TREE(location.typ, state)) {
        setTerrain(location, ROOM, 0);
        if (pile && pile < 5) {
            const fruits = [APPLE, ORANGE, PEAR, BANANA, EUCALYPTUS_LEAF];
            mksobj_at(
                fruits[random.rnd(fruits.length) - 1],
                x,
                y,
                true,
                false,
                objectEnv,
            );
        }
    } else {
        setTerrain(location, CORR, 0);
        if (pile && pile < 5) {
            mksobj_at(
                pile === 1 ? BOULDER : ROCK,
                x,
                y,
                true,
                false,
                objectEnv,
            );
        }
    }
    redraw(x, y);
    if (!sobj_at(BOULDER, x, y, state))
        unblockPoint(x, y, state);
    return false;
}

// The environment dig.c's rotting hands its callees. `state` and `hooks` are
// what invent.c obj_extract_self() and obfree() read; the caller supplies
// hooks.newsym, because a planned turn runs this over a discarded clone and
// must draw nothing on the live map.
//
// obj_extract_self()'s OBJ_FLOOR arm dispatches to mkobj.c remove_object() in
// C. The port injects that owner, and rotting can mean no other one, so the
// hook is filled in here rather than at each run_timers() call site.
function rotEnv(env) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: { extractExternalObject: remove_object, ...env.hooks },
    };
}

// The reason dig.c rot_corpse() cannot yet run over `obj`, or null when it
// can. js/timeout.js run_timers() asks this for every element of the due
// prefix before it unlinks any of them, so an unported arm stops the turn
// instead of leaving a half-drained queue behind.
//
// A missing newsym seam is a wiring error rather than an unported branch, so
// it throws here -- still before any timer moves -- instead of becoming a
// segment boundary. It is asked last, so a corpse that was never going to rot
// yet still reports the arm it is waiting on.
export function unportedRotCorpseReason(obj, rawEnv = {}) {
    const env = rotEnv(rawEnv);
    if (obj.where !== OBJ_FLOOR) {
        // dig.c:2156-2174. OBJ_INVENT writes "Your <corpse> rots away" through
        // corpse_xname() and can reach remove_worn_item() and
        // stop_occupation(); OBJ_MINVENT can reach setmnotwielded(); and
        // OBJ_MIGRATING clears owornmask for a corpse in transit between
        // levels. None of the three has a caller in this port yet.
        return `a corpse on the floor, but one is rotting at where=${obj.where}`;
    }
    if (Has_contents(obj)) {
        // dig.c:2129-2136, rot_organic()'s contents loop, which buries each
        // contained object with bury_an_obj(). Only a container reaches it.
        return 'a rotting corpse to hold nothing, but one holds an object';
    }
    if (obj.unpaid) {
        // shk.c obfree() bills an unpaid object to the shopkeeper; js/invent.js
        // stops at that seam rather than guessing a price.
        return 'a rotting corpse nobody owes for, but one is unpaid';
    }
    if (u_at(obj.ox, obj.oy, env.state)
        && env.state.u?.uundetected
        && hides_under(env.state.youmonst?.data)) {
        // dig.c:2183-2185's else-if arm, mon.c hideunder(&gy.youmonst). The
        // port's hideunder() is monster-only and writes no u.uundetected.
        return 'a rotting corpse not under the hidden hero, but one is';
    }
    if (typeof env.hooks.newsym !== 'function')
        throw new TypeError('rot_corpse requires a newsym seam');
    return null;
}

// C ref: dig.c rot_organic() (2125-2140). "The organic material has rotted
// away while buried." rot_corpse() below is its only ported caller, so the
// contents loop C runs first is left out: unportedRotCorpseReason() refuses a
// corpse that holds anything, and the ROT_ORGANIC row of timeout_funcs[] --
// the other way in, for a buried non-corpse -- is unported.
//
// `timeout` is C's UNUSED second timeout_proc argument, kept so the function
// reads as the timeout_funcs[] row it is.
export function rot_organic(arg, timeout, env) {
    obj_extract_self(arg, env);
    obfree(arg, null, env);
}

// C ref: dig.c rot_corpse() (2146-2189), its OBJ_FLOOR arm. "Called when a
// corpse has rotted completely away." Writes no message and draws no random
// number: the corpse leaves both floor indexes, is deallocated, and the square
// is redrawn.
//
// C's hero half of the exposure test, `else if (u_at(x, y) && u.uundetected
// && hides_under(gy.youmonst.data)) hideunder(&gy.youmonst)`, is not here.
// unportedRotCorpseReason() refuses that square before run_timers() unlinks
// the element, so the branch cannot be reached rather than silently skipped.
export function rot_corpse(arg, timeout, rawEnv = {}) {
    const env = rotEnv(rawEnv);
    const { state } = env;
    const obj = arg;
    if (obj.where !== OBJ_FLOOR) {
        throw new Error(
            `rot_corpse: unported where=${obj.where}, expected floor`,
        );
    }
    const x = obj.ox;
    const y = obj.oy;

    rot_organic(arg, timeout, env);

    const mtmp = m_at(x, y, state);
    /* "a hiding monster may be exposed" */
    if (mtmp && !OBJ_AT(x, y, state) && mtmp.mundetected
        && hides_under(mtmp.data)) {
        mtmp.mundetected = 0;
    }
    env.hooks.newsym(x, y, env);
}

// C ref: dig.c buried_ball() (1885-1930). Find a buried iron ball at or near
// cc. A nearby match updates the caller-owned coordinate; equal-distance
// matches keep the first ball in buriedobjlist order.
export function buried_ball(cc, state = game) {
    let bdist = COLNO;
    let ball = null;

    if (!state.u.utrap || state.u.utraptype === TT_BURIEDBALL) {
        for (let obj = state.level.buriedobjlist; obj; obj = obj.nobj) {
            if (obj.otyp !== HEAVY_IRON_BALL) continue;
            if (obj.ox === cc.x && obj.oy === cc.y) return obj;

            const odist = dist2(obj.ox, obj.oy, cc.x, cc.y);
            if (odist <= 8 && (!ball || odist < bdist)) {
                ball = obj;
                bdist = odist;
            }
        }
    }

    if (ball) {
        cc.x = ball.ox;
        cc.y = ball.oy;
    }
    return ball;
}
