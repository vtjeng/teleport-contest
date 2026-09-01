// dig.js -- what a wielded digging tool is pointed at, and what rots away.
// C refs: src/dig.c dig_typ(), rot_organic(), rot_corpse().
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
    CORR,
    D_BROKEN,
    D_NODOOR,
    D_TRAPPED,
    DOOR,
    DIGTYP_DOOR,
    DIGTYP_ROCK,
    DIGTYP_TREE,
    DIGTYP_UNDIGGABLE,
    Has_contents,
    isok,
    IS_OBSTRUCTED,
    IS_TREE,
    IS_WALL,
    OBJ_AT,
    OBJ_FLOOR,
    ROOM,
    SCORR,
    SDOOR,
    u_at,
    W_NONDIGGABLE,
} from './const.js';
import { game } from './gstate.js';
import { obfree, obj_extract_self } from './invent.js';
import { hides_under } from './mondata.js';
import { closed_door } from './monmove.js';
import { m_at } from './monst.js';
import {
    APPLE,
    BANANA,
    BOULDER,
    EUCALYPTUS_LEAF,
    ORANGE,
    PEAR,
    ROCK,
} from './objects.js';
import { cvt_sdoor_to_door } from './detect.js';
import { inside_room } from './room_coordinates.js';
import { in_rooms } from './rooms.js';
import { effective_attribute } from './attrib.js';
import { is_axe, is_pick, mksobj_at, remove_object, sobj_at } from './obj.js';
import { canseemon, recalc_block_point, unblock_point } from './vision.js';
import { rn1 } from './rng.js';

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

// C ref: hack.c in_town(). The Mine Town flag is the only caller-side state
// that enables this test. `inside_room()` includes the one-square room edge,
// matching mkroom.c's predicate used by the C implementation.
function in_town(x, y, state) {
    if (!state.level?.flags?.has_town) return false;
    let hasSubrooms = false;
    for (const room of state.level.rooms ?? []) {
        if (!(room?.hx > 0)) break;
        if ((room.nsubrooms ?? room.sbrooms?.length ?? 0) > 0) {
            hasSubrooms = true;
            if (inside_room(room, x, y, state)) return true;
        }
    }
    return !hasSubrooms;
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
    if (location.typ === DOOR && !in_rooms(x, y, 14, state).length) return;
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
        state.u?.uprops?.[23]?.intrinsic
        && !state.u?.uprops?.[24]?.intrinsic
        && !state.u?.uprops?.[24]?.extrinsic,
    );
    if (unexpected) {
        if (!hallucinating) {
            await message('You feel an unexpected draft.', state, env);
            return;
        }
        const weak = [A_STR, A_DEX, A_CON, A_CHA, A_INT, A_WIS]
            .some((attribute) => effective_attribute(state, attribute) < 6);
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
        if (in_rooms(x, y, 14, state).length)
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
        } else if (state.flags?.verbose && !random.rn2(3)) {
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
        if (state.flags?.verbose && !random.rn2(5))
            await message('You hear crashing rock.', state, rawEnv);
        if (in_rooms(x, y, 14, state).length)
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
            mksobj_at(fruits[random.rnd(fruits.length) - 1], x, y, true, false, {
                ...rawEnv,
                state,
                random,
            });
        }
    } else {
        setTerrain(location, CORR, 0);
        if (pile && pile < 5) {
            mksobj_at(pile === 1 ? BOULDER : ROCK, x, y, true, false, {
                ...rawEnv,
                state,
                random,
            });
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
