// dig.js -- what a wielded digging tool is pointed at, what rots away, and
// how Mine Town watchmen respond to digging.
// C refs: src/dig.c use_pick_axe(), use_pick_axe2(), dig_typ(),
// rot_organic(), rot_corpse(),
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
    CQ_CANNED,
    DB_MOAT,
    DBWALL,
    DB_UNDER,
    D_BROKEN,
    D_NODOOR,
    D_TRAPPED,
    DOOR,
    DIR_ERR,
    DIR_180,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    DIGTYP_DOOR,
    DIGTYP_BOULDER,
    DIGTYP_ROCK,
    DIGTYP_STATUE,
    DIGTYP_TREE,
    DIGTYP_UNDIGGABLE,
    FAINTED,
    FORCEBUNGLE,
    Has_contents,
    HALLUC,
    HALLUC_RES,
    IRONBARS,
    IS_WATERWALL,
    WEB,
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
    LAVAWALL,
    MOAT,
    OBJ_AT,
    OBJ_FLOOR,
    POOL,
    ROOM,
    ROWNO,
    N_DIRS_Z,
    MV_WALK,
    TT_WEB,
    TT_PIT,
    SCORR,
    SDOOR,
    SHOPBASE,
    STONE,
    TT_BURIEDBALL,
    u_at,
    W_NONDIGGABLE,
    is_pit,
    LANDMINE,
    BEAR_TRAP,
    KILLED_BY,
    HALF_PHDAM,
} from './const.js';
import { game } from './gstate.js';
import { objectGenerationEnv } from './object_generation.js';
// js/hack.js imports dig_typ(); both crossings occur only inside function
// bodies, so the source-owned in_town() remains safe across the cycle.
import { in_town } from './hack.js';
import { can_reach_floor, cant_reach_floor, u_wipe_engr } from './engrave.js';
import {
    cmd_from_dir,
    cmdq_add_ec,
    cmdq_add_key,
    dxdy_moveok,
    extcmdRow,
    getdir,
    movecmd,
    confdir,
    xytodir,
} from './cmd.js';
import { obfree, obj_extract_self } from './invent.js';
import { hides_under, is_watch } from './mondata.js';
import { angry_guards, get_iter_mons, wake_nearby } from './mon.js';
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
    STATUE,
} from './objects.js';
import { cvt_sdoor_to_door } from './detect.js';
import { verbalize } from './pline.js';
import { in_rooms } from './rooms.js';
import { acurr } from './attrib.js';
import { is_axe, is_pick, mksobj_at, remove_object, sobj_at } from './obj.js';
import { canseemon, m_canseeu, recalc_block_point, unblock_point } from './vision.js';
import { d, rn1, rn2, rnd } from './rng.js';
import { set_voice } from './sounds.js';
import {
    Flying, Levitation, conjoined_pits, is_lava, is_pool, is_pool_or_lava,
    t_at, uteetering_at_seen_pit, uescaped_shaft,
} from './trap.js';
import { bimanual } from './worn.js';
import { stairway_at } from './stairs.js';
import { dist2, s_suffix } from './hacklib.js';
import { unconscious } from './trap.js';
import { ttyPline } from './tty_message.js';
import { wield_tool } from './wield.js';
import { ceiling, on_level, surface } from './dungeon.js';
import { losehp, nomul } from './hack.js';
import { dbon } from './weapon.js';
import { yname, yobjnam, Yobjnam2 } from './objnam.js';
import { note_unported } from './unported.js';

// C ref: youprop.h Unaware. The draft-message random roll is skipped while a
// negative multi represents unconsciousness or fainting.
function unaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || state.u?.uhs === FAINTED);
}

// C ref: dig.c pick_can_reach() (141-164). A pick reaches a target in a pit
// only when the hero's pit links to it; otherwise the hero must be able to
// reach across with a two-handed tool. Outside a pit, bimanual tools and
// flying heroes can reach any target, while a one-handed pick cannot reach a
// target in a known pit.
export function pick_can_reach(pick, x, y, state = game) {
    const trap = t_at(x, y, state);
    const targetInPit = Boolean(trap && is_pit(trap.ttyp) && trap.tseen);

    if (state.u?.utrap && state.u.utraptype === TT_PIT) {
        if (targetInPit)
            return conjoined_pits(
                trap,
                t_at(state.u.ux, state.u.uy, state),
                false,
                state,
            );
        return bimanual(pick, state);
    }

    if (bimanual(pick, state) || Flying(state)) return true;
    return !targetInPit;
}

// C ref: dig.c dig_typ() (167-192). Answers what digging into <x,y> with
// `otmp` would break: a door, a tree, rock, or nothing diggable at all.
// DIGTYP_UNDIGGABLE is 0, so C's callers spell the question as a plain truth
// test on the result.
//
// All source arms are ported, including the two object arms whose reach rule
// is shared with use_pick_axe2().
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
    const statue = sobj_at(STATUE, x, y, state);
    if (statue && pick_can_reach(otmp, x, y, state))
        return DIGTYP_STATUE;
    const boulder = sobj_at(BOULDER, x, y, state);
    if (boulder && pick_can_reach(otmp, x, y, state))
        return DIGTYP_BOULDER;
    return closed_door(x, y, state) ? DIGTYP_DOOR
        : IS_TREE(ltyp, state) ? DIGTYP_UNDIGGABLE /* pick vs tree */
            : (IS_OBSTRUCTED(ltyp)
               && (!state.level.flags.arboreal || IS_WALL(ltyp)))
                ? DIGTYP_ROCK
                : DIGTYP_UNDIGGABLE;
}

// C ref: dig.c use_pick_axe() (1092-1155). Applying a digging tool first
// equips it when needed, then offers only directions that can reach a
// diggable target (plus vertical choices that can reach the floor).
export async function use_pick_axe(obj, state = game, env = {}) {
    const ispick = is_pick(obj, state);
    const verb = ispick ? 'dig' : 'chop';
    const u = state.u;
    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'swing', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('apply'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }

    if (u.utrap && u.utraptype === TT_WEB) {
        await ttyPline(
            `Unfortunately, you can't ${verb} while entangled in a web.`,
            state,
        );
        return ECMD_OK;
    }

    const downok = Boolean(can_reach_floor(false, state));
    const directions = [];
    for (let dir = 0; dir < N_DIRS_Z; dir++) {
        const dirch = cmd_from_dir(dir, MV_WALK, state);
        if (u.uswallow) {
            // All directions are viable while swallowed.
        } else if (movecmd(dirch, MV_WALK, state)) {
            if (!dxdy_moveok(state)) continue;
            const rx = u.ux + u.dx;
            const ry = u.uy + u.dy;
            if (!isok(rx, ry) || dig_typ(obj, rx, ry, state) === DIGTYP_UNDIGGABLE)
                continue;
        } else if (Boolean((u.dz > 0) !== downok)) {
            continue;
        }
        directions.push(String.fromCharCode(dirch));
    }
    const prompt = `In what direction do you want to ${verb}? `
        + `[${directions.join('')}]`;
    if (!await getdir(prompt, state))
        return ECMD_CANCEL;
    return use_pick_axe2(obj, state, env);
}

// C ref: dig.c use_pick_axe2() (1162-1359). The immediate direction handling
// is ported in source order. The later dig() occupation is still a named gap:
// its callback returns a value consumed by allmain.c, so this function records
// that gap and does not substitute a guessed callback result or command code.
export async function use_pick_axe2(obj, state = game, env = {}) {
    const { u } = state;
    const ispick = is_pick(obj, state);
    const verbing = ispick ? 'digging' : 'chopping';
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn2, rnd };
    let attackConsumed = false;
    if (u.uswallow) {
        const { do_attack } = await import('./uhitm.js');
        attackConsumed = await do_attack(u.ustuck, state, env);
    }
    if (attackConsumed) {
        // The attack consumed this action; the source still returns time.
    } else if (u.uinwater) {
        await message(`Turbulence torpedoes your ${verbing} attempts.`, state);
    } else if (u.dz < 0) {
        if (Levitation(state)) {
            await message("You don't have enough leverage.", state);
        } else {
            await message(`You can't reach the ${ceiling(u.ux, u.uy, state)}.`, state);
        }
    } else if (!u.dx && !u.dy && !u.dz) {
        let damage = random.rnd(2) + dbon(state) + (obj.spe ?? 0);
        if (damage <= 0) damage = 1;
        await message(`You hit yourself with ${yname(state.uwep, state)}.`, state);
        const { OBJ_NAME } = await import('./objects.js');
        const objectName = OBJ_NAME(state.objects[obj.otyp], state);
        const possessive = state.flags?.female ? 'her' : 'his';
        await losehp(
            maybeHalfPhysical(damage, state),
            `${possessive} own ${objectName}`,
            KILLED_BY,
            state,
            env,
        );
        state.disp ??= {};
        state.disp.botl = true;
        return ECMD_TIME;
    } else if (!u.dz) {
        confdir(false, state);
        const rx = u.ux + u.dx;
        const ry = u.uy + u.dy;
        if (!isok(rx, ry)) {
            // Soundeffect(se_clash, 40) is a no-op with the recorder's tty
            // sound backend, so only its source-owned message remains.
            await message('Clash!', state);
            return ECMD_TIME;
        }

        const lev = state.level.at(rx, ry);
        const monster = m_at(rx, ry, state);
        if (monster) {
            const { do_attack } = await import('./uhitm.js');
            if (await do_attack(monster, state, env)) return ECMD_TIME;
        }

        const digTarget = dig_typ(obj, rx, ry, state);
        if (digTarget === DIGTYP_UNDIGGABLE) {
            const trap = t_at(rx, ry, state);
            if (trap?.ttyp === WEB) {
                if (!trap.tseen) {
                    const { newsym } = await import('./display.js');
                    const { seetrap } = await import('./trap_effects.js');
                    seetrap(trap, { redraw: (x, y) => newsym(x, y, state) });
                    await message('There is a spider web there!', state);
                }
                await message(`${Yobjnam2(obj, 'become')} entangled in the web.`, state);
                nomul(-random.d(2, 2), state);
                state.multi_reason = 'stuck in a spider web';
                state.nomovemsg = 'You pull free.';
            } else if (lev.typ === IRONBARS) {
                await message('Clang!', state);
                await wake_nearby(false, { ...env, state });
            } else if (IS_WATERWALL(lev.typ)) {
                await message('Splash!', state);
            } else if (lev.typ === LAVAWALL) {
                await message('Splash!', state);
                const { fire_damage } = await import('./trap_water_damage.js');
                await fire_damage(state.uwep, false, rx, ry, { ...env, state });
            } else if (IS_TREE(lev.typ, state)) {
                await message('You need an axe to cut down a tree.', state);
            } else if (IS_OBSTRUCTED(lev.typ)) {
                await message('You need a pick to dig rock.', state);
            } else {
                const boulder = sobj_at(BOULDER, rx, ry, state);
                const statue = sobj_at(STATUE, rx, ry, state);
                if (boulder || statue) {
                    const what = boulder ? 'boulder' : 'statue';
                    if (!ispick) {
                        const vibrates = !random.rn2(3);
                        await message(
                            `Sparks fly as you whack the ${what}.`
                                + (vibrates
                                    ? '  The axe-handle vibrates violently!'
                                    : ''),
                            state,
                        );
                        if (vibrates) {
                            await losehp(
                                maybeHalfPhysical(2, state),
                                'axing a hard object',
                                KILLED_BY,
                                state,
                                env,
                            );
                        }
                        await wake_nearby(false, { ...env, state });
                    } else {
                        await message(`You can't reach the ${what}.`, state);
                    }
                } else {
                    const heroTrap = t_at(u.ux, u.uy, state);
                    if (u.utrap && u.utraptype === TT_PIT && trap
                        && heroTrap && is_pit(trap.ttyp)
                        && !conjoined_pits(trap, heroTrap, false, state)) {
                        const idx = xytodir(u.dx, u.dy);
                        if (idx !== DIR_ERR) {
                            const adjidx = DIR_180(idx);
                            heroTrap.conjoined = (heroTrap.conjoined ?? 0)
                                | (1 << idx);
                            trap.conjoined = (trap.conjoined ?? 0)
                                | (1 << adjidx);
                            await message('You clear some debris from between the pits.', state);
                        }
                    } else if (u.utrap && u.utraptype === TT_PIT && heroTrap) {
                        await message(
                            `You swing ${yobjnam(obj, null, state)}, but the rubble has no place to go.`,
                            state,
                        );
                    } else {
                        await message(
                            `You swing ${yobjnam(obj, null, state)} through thin air.`,
                            state,
                        );
                    }
                }
            }
        } else {
            const actions = [
                'swinging', 'digging', 'chipping the statue',
                'hitting the boulder', 'chopping at the door', 'cutting the tree',
            ];
            state.gd ??= {};
            state.gd.did_dig_msg = false;
            state.context.digging ??= {};
            const digging = state.context.digging;
            digging.quiet = false;
            if (digging.pos?.x !== rx || digging.pos?.y !== ry
                || !on_level(digging.level, u.uz) || digging.down) {
                if (state.flags?.autodig && digTarget === DIGTYP_ROCK
                    && !digging.down && u_at(
                        digging.pos?.x, digging.pos?.y, state,
                    )
                    && state.moves <= (digging.lastdigtime ?? 0) + 2
                    && state.moves >= (digging.lastdigtime ?? 0)) {
                    state.gd.did_dig_msg = true;
                    digging.quiet = true;
                }
                digging.down = false;
                digging.chew = false;
                digging.warned = false;
                digging.pos = { x: rx, y: ry };
                digging.level = { ...u.uz };
                digging.effort = 0;
                if (!digging.quiet)
                    await message(`You start ${actions[digTarget]}.`, state);
            } else {
                await message(
                    `You ${digging.chew ? 'begin' : 'continue'} ${actions[digTarget]}.`,
                    state,
                );
                digging.chew = false;
            }
            note_unported('dig.c dig');
        }
    } else if (on_level(u.uz, state.air_level)
        || on_level(u.uz, state.water_level)) {
        await message(`You swing ${yobjnam(obj, null, state)} through thin air.`, state);
    } else if (!can_reach_floor(false, state)) {
        await cant_reach_floor(u.ux, u.uy, false, false, false, state, {
            pline: message,
        });
    } else if (is_pool_or_lava(u.ux, u.uy, state)) {
        await message(
            `You cannot stay under${is_pool(u.ux, u.uy, state) ? 'water' : ' the lava'} long enough.`,
            state,
        );
    } else {
        const trap = t_at(u.ux, u.uy, state);
        if (trap && (uteetering_at_seen_pit(trap, state)
            || uescaped_shaft(trap, state))) {
            const { dotrap } = await import('./trap_effects.js');
            await dotrap(trap, FORCEBUNGLE, state);
            if (!u.utrap) {
                await cant_reach_floor(u.ux, u.uy, false, true, false, state, {
                    pline: message,
                });
            }
            return ECMD_TIME;
        }
        if (!ispick && (!trap
            || (trap.ttyp !== LANDMINE && trap.ttyp !== BEAR_TRAP))) {
            await message(
                `${Yobjnam2(obj, null, state)} merely scratches the ${surface(u.ux, u.uy, state)}.`,
                state,
            );
            u_wipe_engr(3, { ...env, state });
            return ECMD_TIME;
        }

        state.context.digging ??= {};
        const digging = state.context.digging;
        if (digging.pos?.x !== u.ux || digging.pos?.y !== u.uy
            || !on_level(digging.level, u.uz) || !digging.down) {
            digging.chew = false;
            digging.down = true;
            digging.warned = false;
            digging.pos = { x: u.ux, y: u.uy };
            digging.level = { ...u.uz };
            digging.effort = 0;
            await message(`You start ${verbing} downward.`, state);
            if (state.u?.ushops) {
                note_unported('shk.c shopdig');
                note_unported('shk.c add_damage');
            }
        } else {
            await message(`You continue ${verbing} downward.`, state);
        }
        state.gd ??= {};
        state.gd.did_dig_msg = false;
        note_unported('dig.c dig');
    }
    return ECMD_TIME;
}

function maybeHalfPhysical(damage, state) {
    const property = state.u?.uprops?.[HALF_PHDAM];
    return property?.intrinsic || property?.extrinsic
        ? Math.trunc((damage + 1) / 2) : damage;
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
