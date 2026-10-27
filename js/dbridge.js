// dbridge.c — drawbridge terrain, entity, and transition functions.
import {
    BURNING, CONFUSION, CRUSHING, DB_DIR, DB_EAST, DB_ICE, DB_LAVA, DEAF,
    DB_MOAT, DB_NORTH, DB_SOUTH, DB_UNDER, DB_WEST, DBWALL, DOOR,
    DRAWBRIDGE_DOWN, DRAWBRIDGE_UP, DROWNING, D_NODOOR, FUMBLING, HALLUC,
    HALLUC_RES, ICE, ICED_MOAT,
    IS_LAVA, IS_WALL, IS_DRAWBRIDGE, IS_WATERWALL, KILLED_BY_AN, LAVAPOOL,
    MAGICAL_BREATHING, MOAT, NO_KILLER_PREFIX, OBJ_AT, PASSES_WALLS,
    POOL, ROOM, STUNNED, SWIMMING, WATER, WWALKING, Is_waterlevel,
    W_NONDIGGABLE, XKILL_GIVEMSG, XKILL_NOCORPSE, XKILL_NOCONDUCT,
    XKILL_NOMSG, TELEDS_NO_FLAGS, helpless, u_at,
} from './const.js';
import { isok } from './cmd_isok.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { canseemon, canspotmon, newsym } from './display.js';
import { hliquid, Monnam, mon_nam } from './do_name.js';
import { flooreffects } from './do.js';
import { done } from './end.js';
import { SCATTER_MAY_HIT, scatter } from './explode.js';
import { del_engr_at } from './engrave.js';
import { dist2 } from './hacklib.js';
import { delallobj, obj_extract_self, sobj_at } from './invent.js';
import {
    amphibious, breathless, is_flyer, is_floater, is_swimmer, likes_lava,
    noncorporeal, passes_walls, mhe,
} from './mondata.js';
import { AD_DGST, AD_PHYS, PM_LONG_WORM_TAIL } from './monsters.js';
import { heroUnaware as plineHeroUnaware, youHear } from './pline.js';
import { minliquid, monkilled, wake_nearto, xkilled } from './mon.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import { d, rn1, rn2, rn2_on_display_rng, rnd, rne, rnl, rnz } from './rng.js';
import { BOULDER, IRON_CHAIN } from './objects.js';
import { update_monster_region } from './region.js';
import { deltrap, drown, Flying, Levitation, lava_effects, t_at } from './trap.js';
import { revive_nasty, spoteffects } from './hack.js';
import { enexto, teleds } from './teleport.js';
import {
    block_point, cansee, does_block, unblock_point, vision_recalc,
} from './vision.js';
import { mksobj_at } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { ttyPline } from './tty_message.js';
import { vtense } from './objnam.js';

// C refs: dbridge.c is_pool() (46-60) and is_moat() (100-112). The `flags`
// field is the live JavaScript owner of drawbridgemask on map records.
export function drawbridgeFlags(location) {
    return location?.flags ?? 0;
}

export function drawbridgeUnder(location) {
    return drawbridgeFlags(location) & DB_UNDER;
}

export function is_moat(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);
    const juiblexLevel = state.juiblex_level;
    const assignedJuiblexLevel = Boolean(
        juiblexLevel?.dlevel || juiblexLevel?.dnum,
    );
    if (!location
        || (assignedJuiblexLevel && on_level(state.u?.uz, juiblexLevel))) {
        return false;
    }
    return location.typ === MOAT
        || (location.typ === DRAWBRIDGE_UP
            && drawbridgeUnder(location) === DB_MOAT);
}

export function is_pool(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    const typ = location.typ;
    return typ === POOL || typ === MOAT || typ === WATER
        || is_moat(x, y, state);
}

// C ref: dbridge.c is_waterwall() (36-42).
export function is_waterwall(x, y, state = game) {
    return isok(x, y) && IS_WATERWALL(state.level?.at?.(x, y)?.typ);
}

// C ref: dbridge.c is_lava() (62-73), including lava under a raised bridge.
export function is_lava(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);
    return Boolean(location && (
        IS_LAVA(location.typ)
        || (location.typ === DRAWBRIDGE_UP
            && drawbridgeUnder(location) === DB_LAVA)
    ));
}

// C ref: dbridge.c is_pool_or_lava() (76-83).
export function is_pool_or_lava(x, y, state = game) {
    return is_pool(x, y, state) || is_lava(x, y, state);
}

// C ref: dbridge.c is_ice() (86-97), including ice under a raised bridge.
export function is_ice(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);
    return location?.typ === ICE
        || (location?.typ === DRAWBRIDGE_UP
            && drawbridgeUnder(location) === DB_ICE);
}

// C ref: dbridge.c is_drawbridge_wall() (137-162). Return the direction,
// including DB_NORTH=0, or -1; callers must not test JavaScript truthiness.
export function is_drawbridge_wall(x, y, state = game) {
    if (!isok(x, y)) return -1;
    const location = state.level.at(x, y);
    if (!location || (location.typ !== DOOR && location.typ !== DBWALL)) return -1;
    for (const [dx, dy, direction] of [
        [1, 0, DB_WEST], [-1, 0, DB_EAST],
        [0, -1, DB_SOUTH], [0, 1, DB_NORTH],
    ]) {
        if (!isok(x + dx, y + dy)) continue;
        const neighbor = state.level.at(x + dx, y + dy);
        if (!neighbor) continue;
        if (IS_DRAWBRIDGE(neighbor.typ)
            && (drawbridgeFlags(neighbor) & DB_DIR) === direction) {
            return direction;
        }
    }
    return -1;
}

// C ref: dbridge.c is_db_wall() (170-173).
export function is_db_wall(x, y, state = game) {
    return state.level.at(x, y).typ === DBWALL;
}

// C ref: dbridge.c find_drawbridge() (180-205). The coordinate object
// represents C's two in/out arguments; failure leaves both unchanged.
export function find_drawbridge(position, state = game) {
    if (IS_DRAWBRIDGE(state.level.at(position.x, position.y).typ)) return true;
    const direction = is_drawbridge_wall(position.x, position.y, state);
    if (direction < 0) return false;
    switch (direction) {
    case DB_NORTH: position.y++; break;
    case DB_SOUTH: position.y--; break;
    case DB_EAST: position.x--; break;
    case DB_WEST: position.x++; break;
    }
    return true;
}

// C ref: dbridge.c get_wall_for_db() (211-225). This mutates a coordinate
// pair from the bridge location to its portcullis wall using drawbridgemask.
export function get_wall_for_db(position, state = game) {
    switch (drawbridgeFlags(state.level.at(position.x, position.y)) & DB_DIR) {
    case DB_NORTH: position.y--; break;
    case DB_SOUTH: position.y++; break;
    case DB_EAST: position.x++; break;
    case DB_WEST: position.x--; break;
    }
}

// C ref: dbridge.c create_drawbridge(). Creation of a drawbridge at (x, y)
// facing `dir`; `flag` true wants the bridge open. The square beyond it in
// that direction must already be a wall: it becomes the doorway of an open
// bridge or the DBWALL of a raised one. Answers false when it is not a wall.
export function create_drawbridge(x, y, dir, flag, state = game) {
    let x2, y2;
    let horiz;
    const lava = state.level.at(x, y).typ === LAVAPOOL; /* assume initialized map */

    x2 = x;
    y2 = y;
    switch (dir) {
    case DB_NORTH:
        horiz = true;
        y2--;
        break;
    case DB_SOUTH:
        horiz = true;
        y2++;
        break;
    case DB_EAST:
        horiz = false;
        x2++;
        break;
    default:
        // C: impossible("bad direction in create_drawbridge");
        /* falls through */
    case DB_WEST:
        horiz = false;
        x2--;
        break;
    }
    const loc2 = state.level.at(x2, y2);
    if (!loc2 || !IS_WALL(loc2.typ))
        return false;
    const loc = state.level.at(x, y);
    if (flag) { /* We want the bridge open */
        loc.typ = DRAWBRIDGE_DOWN;
        loc2.typ = DOOR;
        loc2.doormask = D_NODOOR;
    } else {
        loc.typ = DRAWBRIDGE_UP;
        loc2.typ = DBWALL;
        /* Drawbridges are non-diggable. */
        loc2.wall_info = W_NONDIGGABLE;
    }
    loc.horizontal = !horiz;
    loc2.horizontal = horiz;
    loc.flags = dir;
    if (lava)
        loc.flags |= DB_LAVA;
    return true;
}

// C ref: dbridge.c destroy_drawbridge() (888-1020). Destruction differs
// from open/close: it removes the bridge and resolves debris before it
// captures either occupant, so scatter can change who is on the two squares.
function drawbridgeRandom(selected = {}, state = game) {
    return {
        ...selected,
        d: selected.d ?? d,
        rn1: selected.rn1 ?? rn1,
        rn2: selected.rn2 ?? rn2,
        rnd: selected.rnd ?? rnd,
        rne: selected.rne ?? rne,
        rnl: selected.rnl ?? rnl,
        rnz: selected.rnz ?? rnz,
        rn2_on_display_rng: selected.rn2_on_display_rng
            ?? ((bound) => rn2_on_display_rng(bound, state)),
    };
}

export async function destroy_drawbridge(x, y, state = game, rawEnv = {}) {
    const bridge = state.level?.at(x, y);
    if (!IS_DRAWBRIDGE(bridge?.typ)) return;

    // zap_map's selected random parameter is sometimes partial. Retain its
    // supplied callbacks, fill only absent canonical operations, and give
    // object creation, scatter and display naming the same stream.
    const random = drawbridgeRandom(rawEnv.random, state);
    const env = {
        ...rawEnv,
        state,
        random,
        displayRandom: rawEnv.displayRandom ?? random.rn2_on_display_rng,
    };
    const message = env.message ?? ttyPline;
    const say = async (line) => message(line, state, env);
    const hear = async (line) => {
        const heard = youHear(line, state);
        if (heard) await say(heard);
    };

    const wallPosition = { x, y };
    get_wall_for_db(wallPosition, state);
    const { x: x2, y: y2 } = wallPosition;
    const wall = state.level.at(x2, y2);
    const under = drawbridgeUnder(bridge);

    if (under === DB_MOAT || under === DB_LAVA) {
        const lava = under === DB_LAVA;
        if (bridge.typ === DRAWBRIDGE_UP) {
            if (cansee(x2, y2, state) || u_at(x2, y2, state)) {
                const liquid = lava ? hliquid('lava', env) : 'moat';
                await say(`The portcullis of the drawbridge falls into the ${liquid}!`);
            } else {
                await hear('a loud *SPLASH*!');
            }
        } else if (cansee(x, y, state) || u_at(x, y, state)) {
            const liquid = lava ? hliquid('lava', env) : 'moat';
            await say(`The drawbridge collapses into the ${liquid}!`);
        } else {
            await hear('a loud *SPLASH*!');
        }
        bridge.typ = lava ? LAVAPOOL : MOAT;
        bridge.flags = 0;
        const boulder = sobj_at(BOULDER, x, y, state);
        if (boulder) {
            obj_extract_self(boulder, env);
            await flooreffects(boulder, x, y, 'fall', env);
            if (state.program_state?.gameover) return;
        }
    } else {
        if (cansee(x, y, state) || u_at(x, y, state))
            await say('The drawbridge disintegrates!');
        else
            await hear('a loud *CRASH*!');
        const icy = Boolean(under & DB_ICE);
        // The C expression reads DB_ICE from the preserved drawbridgemask;
        // the bridge's `flags` stay intact on this dry branch.
        bridge.typ = icy ? ICE : ROOM;
        bridge.icedpool = icy ? ICED_MOAT : 0;
    }

    await wake_nearto(x, y, 500, env);
    wall.typ = DOOR;
    wall.doormask = D_NODOOR;
    const bridgeTrap = t_at(x, y, state);
    if (bridgeTrap) deltrap(bridgeTrap, state);
    const wallTrap = t_at(x2, y2, state);
    if (wallTrap) deltrap(wallTrap, state);
    del_engr_at(x, y, state);
    del_engr_at(x2, y2, state);

    for (let count = random.rn2(6); count > 0; --count) {
        const objectX = random.rn2(2) ? x : x2;
        const objectY = random.rn2(2) ? y : y2;
        const chain = mksobj_at(
            IRON_CHAIN, objectX, objectY, true, false, env,
        );
        await scatter(
            chain.ox, chain.oy, 1, SCATTER_MAY_HIT, chain, state, env,
        );
        if (state.program_state?.gameover) return;
    }

    newsym(x, y, state);
    newsym(x2, y2, state);
    if (!does_block(x2, y2, wall, state)) unblock_point(x2, y2, state);
    vision_recalc(0, {
        ...env,
        state,
        redraw: env.redraw
            ?? ((redrawX, redrawY) => newsym(redrawX, redrawY, state)),
    });
    if (on_level(state.u.uz, state.stronghold_level)) {
        state.u.uevent ??= {};
        state.u.uevent.uopened_dbridge = true;
    }

    const [bridgeEntity, wallEntity] = occupants(state);
    set_entity(x2, y2, wallEntity, state);
    if (wallEntity.edata) {
        const inview = entityCanSee(wallEntity, state);
        if (!automiss(wallEntity, state)) {
            if (inview)
                await say(`${E_phrase(wallEntity, 'are', state)} blown apart by flying debris.`);
            state.killer ??= {};
            state.killer.format = KILLED_BY_AN;
            state.killer.name = 'exploding drawbridge';
            await e_died(
                wallEntity,
                XKILL_NOCORPSE | (inview ? XKILL_GIVEMSG : XKILL_NOMSG),
                CRUSHING,
                state,
                env,
            );
            if (state.program_state?.gameover) return;
        }
    }

    set_entity(x, y, bridgeEntity, state);
    if (bridgeEntity.edata) {
        const inview = entityCanSee(bridgeEntity, state);
        if (e_missed(bridgeEntity, true, state, random)) {
            if (is_u(bridgeEntity, state))
                await spoteffects(false, state, env);
            else
                await minliquid(bridgeEntity.emon, env);
            if (state.program_state?.gameover) return;
        } else {
            if (inview) {
                if (!is_u(bridgeEntity, state) && heroHallucinating(state))
                    await say(`${E_phrase(bridgeEntity, 'get', state)} into some heavy metal!`);
                else
                    await say(`${E_phrase(bridgeEntity, 'are', state)} hit by a huge chunk of metal!`);
            } else if (!heroDeaf(state)
                && !is_u(bridgeEntity, state) && !is_pool(x, y, state)) {
                await hear('a crushing sound.');
            }
            state.killer ??= {};
            state.killer.format = KILLED_BY_AN;
            state.killer.name = 'collapsing drawbridge';
            await e_died(
                bridgeEntity,
                XKILL_NOCORPSE | (inview ? XKILL_GIVEMSG : XKILL_NOMSG),
                CRUSHING,
                state,
                env,
            );
            if (state.program_state?.gameover) return;
            if (state.level.at(bridgeEntity.ex, bridgeEntity.ey).typ === MOAT) {
                await do_entity(bridgeEntity, state, env);
                if (state.program_state?.gameover) return;
            }
        }
    }

    nokiller(state);
    if (on_level(state.u.uz, state.stronghold_level)) {
        state.u.uevent ??= {};
        state.u.uevent.uheard_tune = 3;
    }
}

// The two C occupants are call-local drawbridge bookkeeping kept in go while
// do_entity recursively resolves collisions. They are cleared by nokiller.
function occupants(state) {
    state.go ??= {};
    state.go.occupants ??= Array.from({ length: 2 }, () => ({
        emon: null, edata: null, ex: 0, ey: 0,
    }));
    return state.go.occupants;
}

// C refs: dbridge.c is_u(), e_canseemon(), m_to_e(), u_to_e(), and
// set_entity() (304-342). C's go.occupants is transient state for one
// transition; it is initialized when captured and cleared by nokiller().
function is_u(entity, state) { return entity?.emon === state.youmonst; }
function heroProperty(index, state) {
    const property = state.u?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}
function heroPassesWalls(state) { return heroProperty(PASSES_WALLS, state); }
function heroConfused(state) { return heroProperty(CONFUSION, state); }
function heroStunned(state) { return heroProperty(STUNNED, state); }
function heroFumbling(state) { return heroProperty(FUMBLING, state); }
function heroUnaware(state) { return plineHeroUnaware(state); }
function heroHallucinating(state) {
    return heroProperty(HALLUC, state) && !heroProperty(HALLUC_RES, state);
}
function entityCanSee(entity, state) {
    return is_u(entity, state) || canseemon(entity.emon, state);
}

function m_to_e(monster, x, y, entity, state) {
    entity.emon = monster;
    if (!monster) {
        entity.edata = null;
        entity.ex = entity.ey = 0;
    } else {
        entity.ex = x;
        entity.ey = y;
        entity.edata = monster.wormno && (x !== monster.mx || y !== monster.my)
            ? state.mons[PM_LONG_WORM_TAIL] : monster.data;
    }
}

function u_to_e(entity, state) {
    entity.emon = state.youmonst;
    entity.ex = state.u.ux;
    entity.ey = state.u.uy;
    entity.edata = state.youmonst.data;
}

function set_entity(x, y, entity, state) {
    if (u_at(x, y, state)) u_to_e(entity, state);
    else m_to_e(m_at(x, y, state), x, y, entity, state);
}

export function e_at(x, y, state = game) {
    return state.go?.occupants?.find(entity => entity.edata
        && entity.ex === x && entity.ey === y) ?? null;
}

// C refs: dbridge.c e_nam() and E_phrase() (351-374).
export function e_nam(entity, state = game) {
    return is_u(entity, state) ? 'you' : mon_nam(entity.emon, state);
}

export function E_phrase(entity, verb, state = game) {
    const name = is_u(entity, state) ? 'You' : Monnam(entity.emon, state);
    if (!verb) return name;
    return `${name} ${is_u(entity, state) ? verb : vtense('mon', verb)}`;
}

export function e_survives_at(entity, x, y, state = game) {
    if (noncorporeal(entity.edata)) return true;
    if (is_pool(x, y, state)) {
        return (is_u(entity, state) && (
            (heroProperty(WWALKING, state) && !Is_waterlevel(state.u?.uz))
            || heroProperty(SWIMMING, state)
            || Boolean(state.u?.usteed && is_swimmer(state.u.usteed.data))
            || heroProperty(MAGICAL_BREATHING, state)
            || amphibious(state.youmonst?.data)
            || breathless(state.youmonst?.data)
            || Flying(state) || Levitation(state)))
            || is_swimmer(entity.edata) || is_flyer(entity.edata) || is_floater(entity.edata);
    }
    if (is_lava(x, y, state))
        return (is_u(entity, state) && (Levitation(state) || Flying(state)))
            || likes_lava(entity.edata) || is_flyer(entity.edata);
    if (is_db_wall(x, y, state))
        return is_u(entity, state) ? heroPassesWalls(state) : passes_walls(entity.edata);
    return true;
}

export function automiss(entity, state = game) {
    return (is_u(entity, state) ? heroPassesWalls(state) : passes_walls(entity.edata))
        || noncorporeal(entity.edata);
}

function e_missed(entity, chunks, state, random) {
    if (automiss(entity, state)) return true;
    let misses;
    if (is_flyer(entity.edata)
        && (is_u(entity, state) ? !heroUnaware(state) : !helpless(entity.emon))) {
        misses = 5;
    } else if (is_floater(entity.edata)
        || (is_u(entity, state) && Levitation(state))) {
        misses = 3;
    } else if (chunks && is_pool(entity.ex, entity.ey, state)) {
        misses = 2;
    } else {
        misses = 0;
    }
    if (is_db_wall(entity.ex, entity.ey, state)) misses -= 3;
    return misses >= random.rnd(8);
}

function e_jumps(entity, state, random) {
    let chances = 4;
    if (is_u(entity, state) ? (heroUnaware(state) || heroFumbling(state))
        : (helpless(entity.emon) || !entity.edata?.mmove || entity.emon?.wormno)) {
        return false;
    }
    if (is_u(entity, state) ? heroConfused(state) : entity.emon?.mconf) chances -= 2;
    if (is_u(entity, state) ? heroStunned(state) : entity.emon?.mstun) chances -= 3;
    if (is_db_wall(entity.ex, entity.ey, state)) chances -= 2;
    return chances >= random.rnd(10);
}

async function e_died(entity, xkillFlags, how, state, env) {
    const killer = state.killer ??= { name: '', format: KILLED_BY_AN };
    if (is_u(entity, state)) {
        if (how === DROWNING) {
            killer.name = '';
            await drown(state);
        } else if (how === BURNING) {
            killer.name = '';
            await lava_effects(state);
        } else {
            if (!killer.name) {
                killer.format = KILLED_BY_AN;
                killer.name = 'falling drawbridge';
            }
            await done(how, state);
            if (!e_survives_at(entity, entity.ex, entity.ey, state)) {
                const target = enexto(entity.ex, entity.ey, entity.edata, { state });
                if (target) {
                    await ttyPline(`A ${heroHallucinating(state) ? 'normal' : 'strange'} force teleports you away...`, state);
                    await teleds(target.x, target.y, TELEDS_NO_FLAGS, state, env);
                }
            }
        }
        entity.ex = state.u.ux;
        entity.ey = state.u.uy;
        return;
    }
    killer.name = '';
    const corpseHow = (xkillFlags & XKILL_NOCORPSE) ? AD_DGST : AD_PHYS;
    if (state.context?.mon_moving) await monkilled(entity.emon,
        (xkillFlags & XKILL_NOMSG) ? null : '', corpseHow, state, env);
    else await xkilled(entity.emon, xkillFlags, state, env);
    if ((entity.emon?.mhp ?? 0) > 0) {
        const seeit = canspotmon(entity.emon, state);
        const retriedFlags = xkillFlags | XKILL_NOMSG | XKILL_NOCONDUCT;
        if (state.context?.mon_moving)
            await monkilled(entity.emon, '', corpseHow, state, env);
        else await xkilled(entity.emon, retriedFlags, state, env);
        if ((entity.emon?.mhp ?? 0) < 1 && seeit) {
            await (env.message ?? ttyPline)(
                `Unfortunately for ${mon_nam(entity.emon, state, env)}, `
                + `${mhe(entity.emon, { ...env, state,
                    canSpotMonster: mon => canspotmon(mon, state) })} is still crushed.`,
                state,
            );
        }
    }
    entity.edata = null;
    for (const other of occupants(state)) {
        if (other !== entity && other.emon === entity.emon) other.edata = null;
    }
}

function nokiller(state) {
    state.killer ??= {};
    state.killer.name = '';
    state.killer.format = 0;
    for (const entity of occupants(state)) m_to_e(null, 0, 0, entity, state);
}

function heroDeaf(state) {
    const deaf = state.u?.uprops?.[DEAF];
    return Boolean(deaf?.intrinsic || deaf?.extrinsic || state.u?.uroleplay?.deaf);
}

// C refs: dbridge.c e_died(), automiss(), e_missed(), e_jumps(), do_entity(),
// and nokiller() (380-769). C state mutation and RNG order stay in source order.
// C ref: dbridge.c close_drawbridge() (775-834).
export async function close_drawbridge(x, y, state = game, env = {}) {
    const randomEnv = env.random ?? { d, rn2, rnd };
    const bridge = state.level.at(x, y);
    if (bridge?.typ !== DRAWBRIDGE_DOWN) return;
    const wallPosition = { x, y };
    get_wall_for_db(wallPosition, state);
    const { x: x2, y: y2 } = wallPosition;
    if (cansee(x, y, state) || cansee(x2, y2, state)) {
        const coming = ((state.u.ux === x || state.u.uy === y) && !state.u.uinwater)
            || dist2(state.u.ux, state.u.uy, x2, y2)
                < dist2(state.u.ux, state.u.uy, x, y);
        await (env.message ?? ttyPline)(`You see a drawbridge ${coming ? 'coming' : 'going'} up!`, state);
    } else {
        const heard = youHear('chains rattling and gears turning.', state);
        if (heard) await (env.message ?? ttyPline)(heard, state);
    }
    bridge.typ = DRAWBRIDGE_UP;
    const wall = state.level.at(x2, y2);
    wall.typ = DBWALL;
    if ([DB_NORTH, DB_SOUTH].includes(drawbridgeFlags(bridge) & DB_DIR))
        wall.horizontal = true;
    else
        wall.horizontal = false;
    wall.wall_info = W_NONDIGGABLE;
    const [first, second] = occupants(state);
    set_entity(x, y, first, state);
    set_entity(x2, y2, second, state);
    await do_entity(first, state, { ...env, random: randomEnv });
    set_entity(x2, y2, second, state);
    await do_entity(second, state, { ...env, random: randomEnv });
    if (OBJ_AT(x, y, state) && !heroDeaf(state)) {
        const heard = youHear('smashing and crushing.', state);
        if (heard) await (env.message ?? ttyPline)(heard, state);
    }
    await revive_nasty(x, y, null, state);
    await revive_nasty(x2, y2, null, state);
    const objectEnv = objectGenerationEnv({ ...env, state });
    delallobj(x, y, objectEnv);
    delallobj(x2, y2, objectEnv);
    const firstTrap = t_at(x, y, state), secondTrap = t_at(x2, y2, state);
    if (firstTrap) deltrap(firstTrap, state);
    if (secondTrap) deltrap(secondTrap, state);
    del_engr_at(x, y, state);
    del_engr_at(x2, y2, state);
    newsym(x, y, state);
    newsym(x2, y2, state);
    block_point(x2, y2, state);
    nokiller(state);
}

// C ref: dbridge.c open_drawbridge() (840-882).
export async function open_drawbridge(x, y, state = game, env = {}) {
    const randomEnv = env.random ?? { d, rn2, rnd };
    const bridge = state.level.at(x, y);
    if (bridge?.typ !== DRAWBRIDGE_UP) return;
    const wallPosition = { x, y };
    get_wall_for_db(wallPosition, state);
    const { x: x2, y: y2 } = wallPosition;
    if (cansee(x, y, state) || cansee(x2, y2, state)) {
        const coming = dist2(state.u.ux, state.u.uy, x2, y2)
            >= dist2(state.u.ux, state.u.uy, x, y);
        await (env.message ?? ttyPline)(`You see a drawbridge ${coming ? 'coming' : 'going'} down!`, state);
    } else {
        const heard = youHear('gears turning and chains rattling.', state);
        if (heard) await (env.message ?? ttyPline)(heard, state);
    }
    bridge.typ = DRAWBRIDGE_DOWN;
    const wall = state.level.at(x2, y2);
    wall.typ = DOOR;
    wall.doormask = D_NODOOR;
    const [first, second] = occupants(state);
    set_entity(x, y, first, state);
    set_entity(x2, y2, second, state);
    await do_entity(first, state, { ...env, random: randomEnv });
    set_entity(x2, y2, second, state);
    await do_entity(second, state, { ...env, random: randomEnv });
    await revive_nasty(x, y, null, state);
    delallobj(x, y, objectGenerationEnv({ ...env, state }));
    for (const [tx, ty] of [[x, y], [x2, y2]]) {
        const trap = t_at(tx, ty, state);
        if (trap) deltrap(trap, state);
        del_engr_at(tx, ty, state);
    }
    newsym(x, y, state);
    newsym(x2, y2, state);
    unblock_point(x2, y2, state);
    if (on_level(state.u.uz, state.stronghold_level)) {
        state.u.uevent ??= {};
        state.u.uevent.uopened_dbridge = true;
    }
    nokiller(state);
}

async function do_entity(entity, state, env = {}) {
    const random = env.random ?? { d, rn2, rnd };
    const message = env.message ?? ttyPline;
    if (!entity.edata) return;
    let inview = entityCanSee(entity, state);
    const oldx = entity.ex, oldy = entity.ey;
    const atPortcullis = is_db_wall(oldx, oldy, state);
    const cell = state.level.at(oldx, oldy);
    let mustJump = false, relocates = false;

    if (automiss(entity, state) && e_survives_at(entity, oldx, oldy, state)) {
        if (inview && (atPortcullis || IS_DRAWBRIDGE(cell.typ))) {
            await message(`The ${atPortcullis ? 'portcullis' : 'drawbridge'} passes through ${e_nam(entity, state)}!`, state);
        }
        if (is_u(entity, state)) await spoteffects(false, state, env);
        return;
    }
    if (e_missed(entity, false, state, random)) {
        if (atPortcullis) await message(`The portcullis misses ${e_nam(entity, state)}!`, state);
        if (e_survives_at(entity, oldx, oldy, state)) return;
        if (atPortcullis) mustJump = true;
        else relocates = true;
    } else {
        if (cell.typ === DRAWBRIDGE_DOWN) {
            if (is_u(entity, state)) {
                state.killer ??= {};
                state.killer.format = NO_KILLER_PREFIX;
                state.killer.name = 'crushed to death underneath a drawbridge';
            }
            await message(`${E_phrase(entity, 'are', state)} crushed underneath the drawbridge.`, state);
            await e_died(entity, XKILL_NOCORPSE | (inview ? XKILL_GIVEMSG : XKILL_NOMSG), CRUSHING, state, env);
            return;
        }
        mustJump = true;
    }
    if (mustJump) {
        if (atPortcullis && !e_jumps(entity, state, random)) {
            if (inview)
                await message(`${E_phrase(entity, 'are', state)} crushed by the falling portcullis!`, state);
            else if (!heroDeaf(state)) {
                const heard = youHear('a crushing sound.', state);
                if (heard) await message(heard, state);
            }
            await e_died(entity, XKILL_NOCORPSE | (inview ? XKILL_GIVEMSG : XKILL_NOMSG), CRUSHING, state, env);
            return;
        }
        if (atPortcullis) relocates = true;
        else relocates = !e_jumps(entity, state, random);
    }

    const position = { x: oldx, y: oldy };
    find_drawbridge(position, state);
    if (position.x === oldx && position.y === oldy)
        get_wall_for_db(position, state);
    const newx = position.x, newy = position.y;
    if (relocates && e_at(newx, newy, state)) {
        const other = e_at(newx, newy, state);
        if (e_survives_at(other, newx, newy, state) && automiss(other, state)) {
            relocates = false;
        } else {
            while (e_at(newx, newy, state) && e_at(newx, newy, state) !== entity)
                await do_entity(other, state, env);
            if (e_at(oldx, oldy, state) !== entity) return;
        }
    }
    if (relocates && !e_at(newx, newy, state)) {
        if (!is_u(entity, state)) {
            remove_monster(entity.ex, entity.ey, state);
            place_monster(entity.emon, newx, newy, state);
            update_monster_region(entity.emon, state);
        } else {
            state.u.ux = newx;
            state.u.uy = newy;
        }
        entity.ex = newx;
        entity.ey = newy;
        inview = entityCanSee(entity, state);
    }
    if (is_db_wall(entity.ex, entity.ey, state)) {
        // C dbridge.c:do_entity() reports a visible occupant's arrival
        // before checking whether the portcullis chamber kills it.
        if (inview) {
            if (is_u(entity, state)) {
                await message('You tumble towards the closed portcullis!', state);
                await message(automiss(entity, state)
                    ? 'You pass through it!'
                    : 'The drawbridge closes in...', state);
            } else {
                await message(`${E_phrase(entity, 'disappear', state)} behind the drawbridge.`, state);
            }
        }
        if (!e_survives_at(entity, entity.ex, entity.ey, state)) {
            state.killer ??= {};
            state.killer.format = KILLED_BY_AN;
            state.killer.name = 'closing drawbridge';
            await e_died(entity, XKILL_NOMSG, CRUSHING, state, env);
        }
        return;
    }
    if (is_pool(entity.ex, entity.ey, state) && !inview && !heroDeaf(state)) {
        const heard = youHear('a splash.', state);
        if (heard) await message(heard, state);
    }
    if (e_survives_at(entity, entity.ex, entity.ey, state)) {
        if (inview && !is_flyer(entity.edata) && !is_floater(entity.edata)) {
            await message(`${E_phrase(entity, 'fall', state)} from the bridge.`, state);
        }
        return;
    }
    const pool = is_pool(entity.ex, entity.ey, state);
    const lava = is_lava(entity.ex, entity.ey, state);
    if ((pool || lava) && inview && !is_u(entity, state)) {
        // C dbridge.c:743-753 uses a different visible-monster line while
        // hallucinating; its liquid name is literal in that arm.
        if (heroHallucinating(state)) {
            await message(`${E_phrase(entity, 'drink', state)} the `
                + `${lava ? 'lava' : 'moat'} and disappears.`, state);
        } else {
            await message(`${E_phrase(entity, 'fall', state)} into the `
                + `${lava ? 'lava' : 'moat'}.`, state);
        }
    }
    state.killer ??= {};
    state.killer.format = NO_KILLER_PREFIX;
    state.killer.name = 'fell from a drawbridge';
    await e_died(entity, XKILL_NOCORPSE | (inview ? XKILL_GIVEMSG : XKILL_NOMSG),
        pool ? DROWNING : lava ? BURNING : CRUSHING, state, env);
}
