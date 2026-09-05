// vault.js -- gold the hero is carrying out of sight, vault occupancy, guard
// entry, guard escort (gd_move), and the end-of-game vault-guard settlement.
// C ref: src/vault.c hidden_gold(), vault_occupied(), findgd(), newegd(),
// in_fcorridor(), find_guard_dest(), invault(), gd_move(), paygd().

import {
    ACCESSIBLE,
    A_LAWFUL,
    BLCORNER,
    BLINDED,
    BRCORNER,
    COLNO,
    CORR,
    COULD_SEE,
    D_NODOOR,
    DEAF,
    DOOR,
    EGD,
    FCSIZ,
    GD_EATGOLD,
    HWALL,
    IN_SIGHT,
    IS_OBSTRUCTED,
    IS_POOL,
    IS_ROOM,
    IS_STWALL,
    IS_WALL,
    M_AP_OBJECT,
    MELT_ICE_AWAY,
    MM_EGD,
    MM_NOMSG,
    RLOC_ERR,
    RLOC_MSG,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    SCORR,
    STONE,
    STRANGLED,
    TLCORNER,
    TRCORNER,
    VAULT,
    VAULT_GUARD_TIME,
    VWALL,
    isok,
} from './const.js';
import {
    map_invisible, map_location, newsym, unset_seenv, xy_set_wall_state,
} from './display.js';
import { assign_level, on_level } from './dungeon.js';
import { del_engr_at } from './engrave.js';
import { mungspaces } from './fruit.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { money_cnt } from './invent.js';
import { set_malign } from './makemon.js';
import { mongone } from './makemon_create.js';
import { gender, is_silent, sticks } from './mondata.js';
import { PM_GUARD } from './monsters.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import {
    capitalizedAlwaysVisibleMonsterName,
    alwaysVisibleMonsterName,
    capitalizedMonsterName,
    pmname,
} from './do_name.js';
import { makeplural } from './fruit.js';
import { adjalign } from './attrib.js';
import { g_at, sobj_at, hasContents } from './obj.js';
import { BOULDER } from './objects.js';
import { in_rooms } from './rooms.js';
import { contained_gold } from './shk.js';
import { rloc } from './teleport.js';
import { spot_stop_timers } from './timeout.js';
import { t_at, deltrap } from './trap.js';
import { ttyPline } from './tty_message.js';
import {
    block_point, canseemon, cansee, couldsee, recalc_block_point, unblock_point,
} from './vision.js';
import { getlin } from './windows.js';

// Thrown where vault.c reaches vault-guard handling this port has not ported.
export class UnsupportedVaultGuardError extends Error {
    constructor(branch) {
        super(`vault guard handling requires ${branch}`);
        this.name = 'UnsupportedVaultGuardError';
        this.branch = branch;
    }
}

// C ref: vault.c vault_occupied() (244-253). `array` is one of the hero's room
// strings, which js/rooms.js models as a zero-terminated array of room
// numbers. C returns the room number or '\0'; this returns 0 for "none",
// which is the same value.
export function vault_occupied(array, state = game) {
    for (const room of array ?? []) {
        if (!room) break;
        if (state.level?.rooms?.[room - ROOMOFFSET]?.rtype === VAULT)
            return room;
    }
    return 0;
}

// C ref: vault.c findgd() (208-238). Only the first loop is ported: it finds a
// guard already on the level's monster chain. The second loop pulls a guard off
// gm.migrating_mons and parks it, which needs mon_track_clear() and
// parkguard(); no ported code migrates a guard, so that loop stops instead.
export function findgd(state = game) {
    for (let mtmp = state.level?.monlist ?? null; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.isgd && on_level(mtmp.mextra?.egd?.gdlevel, state.u.uz)) {
            if (!mtmp.mx && !mtmp.mextra.egd.gddone)
                mtmp.mhp = mtmp.mhpmax;
            return mtmp;
        }
    }
    for (let mtmp = state.gm?.migrating_mons ?? null; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.isgd && on_level(mtmp.mextra?.egd?.gdlevel, state.u.uz)) {
            throw new UnsupportedVaultGuardError(
                'findgd() parking a guard migrating to this level',
            );
        }
    }
    return null;
}

// C ref: vault.c newegd() (23-32). Allocates the extra guard data on a
// monster's mextra record. makemon() calls this when MM_EGD is set.
export function newegd(monster) {
    if (!monster.mextra) monster.mextra = {};
    if (!EGD(monster)) {
        monster.mextra.egd = {
            parentmid: monster.m_id ?? 0,
            fcbeg: 0,
            fcend: 0,
            vroom: 0,
            gdx: 0,
            gdy: 0,
            ogx: 0,
            ogy: 0,
            gdlevel: { dnum: 0, dlevel: 0 },
            warncnt: 0,
            dropgoldcnt: 0,
            gddone: 0,
            witness: 0,
            fakecorr: Array.from({ length: FCSIZ }, () => ({
                fx: 0, fy: 0, ftyp: 0, flags: 0,
            })),
        };
    }
}

// C ref: vault.c in_fcorridor() (192-201). Checks whether (x,y) falls within
// the guard's temporary fake corridor.
function in_fcorridor(grd, x, y) {
    const egrd = EGD(grd);
    for (let fci = egrd.fcbeg; fci < egrd.fcend; fci++) {
        if (x === egrd.fakecorr[fci].fx && y === egrd.fakecorr[fci].fy)
            return true;
    }
    return false;
}

// C ref: apply.c um_dist() (691-695). Returns true when the hero is strictly
// more than `n` squares away from (x,y) in either axis (Chebyshev metric > n).
function um_dist(x, y, n, state) {
    return Math.abs(state.u.ux - x) > n || Math.abs(state.u.uy - y) > n;
}

// C ref: vault.c blackout() (122-141). As the temporary corridor is removed,
// stone locations and their neighbours are unlit; any light from a scroll, wand,
// or spell cast inside the corridor should not reappear when a new tunnel goes
// through the same area.
function blackout(x, y, state) {
    for (let i = x - 1; i <= x + 1; ++i) {
        for (let j = y - 1; j <= y + 1; ++j) {
            if (!isok(i, j)) continue;
            const lev = state.level.at(i, j);
            if (lev.typ === STONE) {
                lev.lit = 0;
                lev.waslit = 0;
            }
            unset_seenv(lev, x, y, i, j);
        }
    }
}

// C ref: vault.c clear_fcorr() (48-116). Try to remove the temporary corridor
// from the vault to the rest of the map. If the guard or hero is still inside
// or visible corridor cells cannot be cleared yet, returns false and the
// corridor stays for now.
function clear_fcorr(grd, forceshow, state, env) {
    const egrd = EGD(grd);
    if (!on_level(egrd.gdlevel, state.u.uz)) return true;

    let sawcorridor = false;

    while (egrd.fcbeg < egrd.fcend) {
        const fcbeg = egrd.fcbeg;
        const fcx = egrd.fakecorr[fcbeg].fx;
        const fcy = egrd.fakecorr[fcbeg].fy;

        if ((grd.mhp < 1 || !in_fcorridor(grd, state.u.ux, state.u.uy))
            && egrd.gddone) {
            forceshow = true;
        }
        if ((state.u.ux === fcx && state.u.uy === fcy && grd.mhp >= 1)
            || (!forceshow && couldsee(fcx, fcy, state))
            || (state.u.uprops?.punished?.intrinsic
                && state.u.uball && !state.u.uball.owornmask
                && state.u.uball.ox === fcx && state.u.uball.oy === fcy)) {
            return false;
        }

        const mtmp = m_at(fcx, fcy, state);
        if (mtmp) {
            if (mtmp.isgd) {
                return false;
            } else {
                // Tame monster: yelp is not exercised in the witness path,
                // and m_into_limbo is not ported; throw on the rloc fallback.
                if (!rloc(mtmp, RLOC_MSG, { state })) {
                    throw new UnsupportedVaultGuardError(
                        'clear_fcorr() m_into_limbo for monster in corridor',
                    );
                }
            }
        }

        const lev = state.level.at(fcx, fcy);
        if (lev.typ === CORR && cansee(fcx, fcy, state))
            sawcorridor = true;
        lev.typ = egrd.fakecorr[fcbeg].ftyp;
        lev.flags = egrd.fakecorr[fcbeg].flags;
        if (IS_STWALL(lev.typ)) {
            const trap = t_at(fcx, fcy, state);
            if (trap) deltrap(trap, state);
            if (lev.typ === STONE) blackout(fcx, fcy, state);
        }
        del_engr_at(fcx, fcy, state);
        map_location(fcx, fcy, 1, state);
        recalc_block_point(fcx, fcy, state);
        state.vision_full_recalc = 1;
        egrd.fcbeg++;
    }

    if (sawcorridor)
        env.message('The corridor disappears.', state, env);
    if (IS_OBSTRUCTED(state.level.at(state.u.ux, state.u.uy).typ)
        && state.u.uhp > 0)
        env.message('You are encased in rock.', state, env);
    return true;
}

// C ref: vault.c restfakecorr() (143-151). The hero has left the corridor;
// try to make the guard disappear. If clear_fcorr fails (hero or guard still
// in the way), the guard remains parked at (0,0) and restfakecorr will be
// retried on the next gd_move call.
function restfakecorr(grd, state, env) {
    if (clear_fcorr(grd, false, state, env)) {
        grd.isgd = 0; // dmonsfree() should delete this mon
        // The guard was parked at (0,0) by parkguard(). JS's mongone checks
        // isok(mx,my) which is false for (0,0), so it won't clean the grid
        // entry. Remove it manually before mongone.
        if (m_at(0, 0, state) === grd)
            remove_monster(0, 0, state);
        mongone(grd, { state });
    }
}

// C ref: vault.c parkguard() (154-171). Move the guard (dead or alive) to the
// off-map coordinate (0,0) until the temporary corridor is removed.
function parkguard(grd, state) {
    if (state.svc?.context?.polearm?.hitmon === grd)
        state.svc.context.polearm.hitmon = null;
    if (grd.mx) {
        remove_monster(grd.mx, grd.my, state);
        newsym(grd.mx, grd.my);
    }
    if (m_at(0, 0, state) !== grd)
        place_monster(grd, 0, 0, state);
    EGD(grd).ogx = grd.mx;
    EGD(grd).ogy = grd.my;
}

// C ref: vault.c wallify_vault() (645-731). Restore the vault walls after the
// guard escort is done. Gold at wall positions moves into the vault, rocks and
// boulders are subsumed into walls, traps are destroyed, and the vault
// boundary is rebuilt.
function wallify_vault(grd, state, env) {
    const vlt = EGD(grd).vroom;
    const room = state.level.rooms[vlt];
    const lox = room.lx - 1;
    const hix = room.hx + 1;
    const loy = room.ly - 1;
    const hiy = room.hy + 1;
    let fixed = false;
    let movedgold = false;

    for (let x = lox; x <= hix; x++) {
        for (let y = loy; y <= hiy; y++) {
            // Skip interior cells (not on room boundary)
            if (x !== lox && x !== hix && y !== loy && y !== hiy)
                continue;

            const lev = state.level.at(x, y);
            if ((!IS_WALL(lev.typ) || g_at(x, y, state)
                || sobj_at(BOULDER, x, y, state))
                && !in_fcorridor(grd, x, y)) {

                // Monster at wall position: relocate or throw
                const mon = m_at(x, y, state);
                if (mon && mon !== grd) {
                    if (!rloc(mon, RLOC_MSG, { state })) {
                        throw new UnsupportedVaultGuardError(
                            'wallify_vault() m_into_limbo for monster at wall',
                        );
                    }
                }
                // Gold at wall position: move into vault
                const gold = g_at(x, y, state);
                if (gold) {
                    throw new UnsupportedVaultGuardError(
                        'wallify_vault() move_gold into vault',
                    );
                }
                // Rocks/boulders: not exercised by witness
                if (sobj_at(BOULDER, x, y, state)) {
                    throw new UnsupportedVaultGuardError(
                        'wallify_vault() destroying rocks/boulders at wall',
                    );
                }
                const trap = t_at(x, y, state);
                if (trap) deltrap(trap, state);

                let typ;
                if (x === lox)
                    typ = (y === loy) ? TLCORNER
                        : (y === hiy) ? BLCORNER : VWALL;
                else if (x === hix)
                    typ = (y === loy) ? TRCORNER
                        : (y === hiy) ? BRCORNER : VWALL;
                else
                    typ = HWALL;

                lev.typ = typ;
                lev.wall_info = 0;
                xy_set_wall_state(x, y, state);
                del_engr_at(x, y, state);
                // Hack: show the wall restoration on screen even if not in
                // direct sight, because the player knows about it from the
                // message.
                const viz = state.viz_array;
                const saved = viz?.[y]?.[x] ?? 0;
                if (viz?.[y]) viz[y][x] = IN_SIGHT | COULD_SEE;
                newsym(x, y);
                if (viz?.[y]) viz[y][x] = saved;
                block_point(x, y, state);
                fixed = true;
            }
        }
    }

    if (movedgold || fixed) {
        if (in_fcorridor(grd, grd.mx, grd.my) || cansee(grd.mx, grd.my, state))
            env.message(
                `${capitalizedAlwaysVisibleMonsterName(grd, state)} whispers an incantation.`,
                state, env,
            );
        else
            env.message('You hear a distant chant.', state, env);
        if (movedgold)
            env.message(
                'A mysterious force moves the gold into the vault.',
                state, env,
            );
        if (fixed)
            env.message(
                "The damaged vault's walls are magically restored!",
                state, env,
            );
    }
}

// C ref: vault.c gd_mv_monaway() (733-747). Move a monster out of the guard's
// way at position (nx, ny).
function gd_mv_monaway(grd, nx, ny, state, env) {
    const mtmp = m_at(nx, ny, state);
    if (mtmp && mtmp !== grd) {
        if (!Deaf(state)) {
            env.message('"Out of my way, scum!"', state, env);
        }
        if (!rloc(mtmp, RLOC_ERR | RLOC_MSG, { state })
            || m_at(nx, ny, state)) {
            throw new UnsupportedVaultGuardError(
                'gd_mv_monaway() m_into_limbo for blocked monster',
            );
        }
        recalc_block_point(nx, ny, state);
    }
}

// C ref: vault.c gd_move_cleanup() (836-866). Final cleanup when the guard
// escort is done: park the guard off-map, restore vault walls, and remove
// the temporary corridor. Returns 1 (guard moved/disappeared) or -2 (died).
function gd_move_cleanup(grd, semi_dead, disappear_msg_seen, state, env) {
    const x = grd.mx;
    const y = grd.my;
    const see_guard = canspotmon(grd, state);
    parkguard(grd, state);
    wallify_vault(grd, state, env);
    restfakecorr(grd, state, env);
    if (!semi_dead && (in_fcorridor(grd, state.u.ux, state.u.uy)
        || cansee(x, y, state))) {
        if (!disappear_msg_seen && see_guard)
            env.message(
                `Suddenly, ${alwaysVisibleMonsterName(grd, state)} disappears.`,
                state, env,
            );
        return 1;
    }
    return -2;
}

// C ref: vault.c gd_letknow() (868-882). Announce a guard's approach or
// confrontation when the guard turns hostile and teleports out.
function gd_letknow(grd, state, env) {
    throw new UnsupportedVaultGuardError(
        'gd_letknow() hostile guard announcement',
    );
}

// C ref: vault.c gd_move() (887-1201). The vault guard escort state machine.
// Returns: 1 guard moved, 0 guard didn't move, -1 let m_move handle it,
// -2 guard died.
export async function gd_move(grd, env = {}) {
    const state = env.state ?? game;
    // The planning pass (dry run) clones state but shares the guard's egd.
    // gd_move modifies egd (fcend, fakecorr, ogx/ogy) and the map, which
    // corrupts the live state if done on a shared reference. Returning 0
    // (didn't move) is safe: the planning pass only decides whether dochug
    // should attack the hero, and a guard escort never attacks.
    if (env.planning) return 0;
    const random = env.random ?? { rn2: () => { throw new Error('no rng'); } };
    const message = env.message ?? ttyPline;
    const gdEnv = { ...env, message };
    const egrd = EGD(grd);
    const semi_dead = grd.mhp < 1; // DEADMONSTER

    if (!on_level(egrd.gdlevel, state.u.uz))
        return -1;

    if (semi_dead || !grd.mx || egrd.gddone) {
        egrd.gddone = 1;
        return gd_move_cleanup(grd, semi_dead, false, state, gdEnv);
    }

    const u_in_vault = vault_occupied(state.u.urooms, state) ? true : false;
    const grd_in_vault = in_rooms(grd.mx, grd.my, VAULT, state).length > 0
        && in_rooms(grd.mx, grd.my, VAULT, state)[0] !== 0;
    if (!u_in_vault && !grd_in_vault)
        wallify_vault(grd, state, gdEnv);

    if (!grd.mpeaceful) {
        // Hostile guard path: not exercised by the witness
        throw new UnsupportedVaultGuardError(
            'gd_move() hostile guard movement',
        );
    }

    if (Math.abs(egrd.ogx - grd.mx) > 1 || Math.abs(egrd.ogy - grd.my) > 1)
        return -1; // teleported guard — treat as normal monster

    if (egrd.witness) {
        // Guard witnessed hero consuming or destroying gold
        throw new UnsupportedVaultGuardError(
            'gd_move() guard witnessed gold consumption/destruction',
        );
    }

    const umoney = money_cnt(state.invent);
    const u_carry_gold = (umoney > 0 || hidden_gold(true, state) > 0);

    if (egrd.fcend === 1) {
        if (u_in_vault && (u_carry_gold
            || um_dist(grd.mx, grd.my, 1, state))) {
            if (egrd.warncnt === 3 && !Deaf(state)) {
                let buf;
                if (u_carry_gold) {
                    buf = (!umoney ? 'drop that hidden gold and ' : 'drop that gold and ');
                } else {
                    buf = '';
                }
                buf += 'follow me!';
                if (egrd.dropgoldcnt || !u_carry_gold) {
                    await message(`"I repeat, ${buf}"`, state, gdEnv);
                } else {
                    await message(
                        `"${buf.charAt(0).toUpperCase()}${buf.slice(1)}"`,
                        state, gdEnv,
                    );
                }
                if (u_carry_gold) egrd.dropgoldcnt++;
            }
            if (egrd.warncnt === 7) {
                const m = grd.mx;
                const n = grd.my;
                if (!Deaf(state)) {
                    await message('"You\'ve been warned, knave!"', state, gdEnv);
                }
                grd.mpeaceful = 0;
                // mnexto is not exercised here; throw on the hostile path
                throw new UnsupportedVaultGuardError(
                    'gd_move() guard turns hostile at warncnt 7',
                );
            }
            // Don't count warnings when hero is fainted or paralyzed
            if (state.multi >= 0
                && !(state.afternmv != null
                    && state.afternmv === state._unfaint)) {
                egrd.warncnt++;
            }
            return 0;
        }

        if (!u_in_vault) {
            if (u_carry_gold) {
                // Hero teleported out with gold
                throw new UnsupportedVaultGuardError(
                    'gd_move() hero teleported out of vault carrying gold',
                );
            } else {
                if (!Deaf(state)) {
                    await message('"Well, begone."', state, gdEnv);
                }
                egrd.gddone = 1;
                return gd_move_cleanup(grd, semi_dead, false, state, gdEnv);
            }
        }
    }

    if (egrd.fcend > 1) {
        if (egrd.fcend > 2 && in_fcorridor(grd, grd.mx, grd.my)
            && !egrd.gddone && !in_fcorridor(grd, state.u.ux, state.u.uy)
            && (state.level.at(egrd.fakecorr[0].fx, egrd.fakecorr[0].fy).typ
                === egrd.fakecorr[0].ftyp)) {
            await message(
                `${capitalizedAlwaysVisibleMonsterName(grd, state)}, confused, disappears.`,
                state, gdEnv,
            );
            return gd_move_cleanup(grd, semi_dead, true, state, gdEnv);
        }
        if (u_carry_gold && (in_fcorridor(grd, state.u.ux, state.u.uy)
            || (egrd.fcend > 1 && u_in_vault))) {
            // Hero carrying gold inside corridor or vault
            throw new UnsupportedVaultGuardError(
                'gd_move() hero carrying gold in corridor (fcend > 1)',
            );
        }
    }

    // Check for gold in the corridor
    let goldincorridor = false;
    let goldX = 0;
    let goldY = 0;
    for (let fci = egrd.fcbeg; fci < egrd.fcend; fci++) {
        if (g_at(egrd.fakecorr[fci].fx, egrd.fakecorr[fci].fy, state)) {
            goldX = egrd.fakecorr[fci].fx;
            goldY = egrd.fakecorr[fci].fy;
            goldincorridor = true;
            break;
        }
    }
    if (goldincorridor && !egrd.gddone) {
        // Gold in corridor: not exercised by the witness
        throw new UnsupportedVaultGuardError(
            'gd_move() gold in corridor pickup',
        );
    }

    if (um_dist(grd.mx, grd.my, 1, state) || egrd.gddone) {
        if (!egrd.gddone && !random.rn2(10) && !Deaf(state)
            && !state.u.uswallow
            && !(state.u.ustuck
                && !sticks(state.youmonst?.data ?? state.u.umonster))) {
            await message('"Move along!"', state, gdEnv);
        }
        restfakecorr(grd, state, gdEnv);
        return 0; // didn't move
    }

    let x = grd.mx;
    let y = grd.my;
    let nx, ny;
    let newspot = false;

    if (u_in_vault)
        return gd_move_nextpos(grd, x, y, semi_dead, state, gdEnv);

    // Look around (hor & vert only) for accessible places to leave the guard
    for (nx = x - 1; nx <= x + 1; nx++) {
        for (ny = y - 1; ny <= y + 1; ny++) {
            if ((nx === x || ny === y) && (nx !== x || ny !== y)
                && isok(nx, ny)) {
                const crm = state.level.at(nx, ny);
                const typ = crm.typ;
                if (!IS_STWALL(typ) && !IS_POOL(typ)) {
                    if (in_fcorridor(grd, nx, ny))
                        continue; // C: goto nextnxy

                    const vaultRooms = in_rooms(nx, ny, VAULT, state);
                    if (vaultRooms.length > 0 && vaultRooms[0] !== 0)
                        continue;

                    // Found a good place for the guard to exit
                    egrd.gddone = 1;
                    if (ACCESSIBLE(typ)) {
                        // goto newpos
                        gd_mv_monaway(grd, nx, ny, state, gdEnv);
                        return gd_move_cleanup(grd, semi_dead, false, state, gdEnv);
                    }
                    crm.typ = (typ === SCORR) ? CORR : DOOR;
                    if (crm.typ === DOOR)
                        crm.doormask = D_NODOOR;
                    else
                        crm.flags = 0;
                    del_engr_at(nx, ny, state);
                    // goto proceed — continue to movement below
                    return gd_move_proceed(
                        grd, x, y, nx, ny, crm.typ, semi_dead, true, state, gdEnv,
                    );
                }
            }
        }
    }

    return gd_move_nextpos(grd, x, y, semi_dead, state, gdEnv);
}

// C ref: vault.c gd_move() lines 1111-1200, the "nextpos" and "proceed"
// labels. The guard walks toward (gdx, gdy), creating corridor tiles as needed.
function gd_move_nextpos(grd, x, y, semi_dead, state, env) {
    const egrd = EGD(grd);
    let nx = x;
    let ny = y;
    const ggx = egrd.gdx;
    const ggy = egrd.gdy;
    const dx = (ggx > x) ? 1 : (ggx < x) ? -1 : 0;
    let dy = (ggy > y) ? 1 : (ggy < y) ? -1 : 0;
    if (Math.abs(ggx - x) >= Math.abs(ggy - y))
        nx += dx;
    else
        ny += dy;

    let crm = state.level.at(nx, ny);
    let typ = crm.typ;

    while (typ !== STONE) {
        const ex = nx + nx - x;
        const ey = ny + ny - y;
        if (isok(ex, ey) && IS_ROOM(state.level.at(ex, ey).typ)) {
            crm.typ = DOOR;
            crm.doormask = D_NODOOR;
            del_engr_at(ex, ey, state);
            return gd_move_proceed(
                grd, x, y, nx, ny, typ, semi_dead, true, state, env,
            );
        }
        if (dy && nx !== x) {
            nx = x;
            ny = y + dy;
            crm = state.level.at(nx, ny);
            typ = crm.typ;
            continue;
        }
        if (dx && ny !== y) {
            ny = y;
            nx = x + dx;
            dy = 0; // C: vault.c:1142, prevents revisiting the dy arm
            crm = state.level.at(nx, ny);
            typ = crm.typ;
            continue;
        }
        if (IS_ROOM(typ)) {
            crm.typ = DOOR;
            crm.doormask = D_NODOOR;
            del_engr_at(nx + nx - x, ny + ny - y, state);
            return gd_move_proceed(
                grd, x, y, nx, ny, typ, semi_dead, true, state, env,
            );
        }
        break;
    }
    crm.typ = CORR;
    crm.flags = 0;
    return gd_move_proceed(
        grd, x, y, nx, ny, typ, semi_dead, true, state, env,
    );
}

// C ref: vault.c gd_move() lines 1156-1200, the "proceed" and "newpos" labels.
// Handle unblocking, fakecorr tracking, and actual guard movement.
function gd_move_proceed(
    grd, x, y, nx, ny, origTyp, semi_dead, newspot, state, env,
) {
    const egrd = EGD(grd);
    const ggx = egrd.gdx;
    const ggy = egrd.gdy;
    const crm = state.level.at(nx, ny);

    unblock_point(nx, ny, state);
    if (cansee(nx, ny, state))
        newsym(nx, ny);

    if ((nx !== ggx || ny !== ggy) || (grd.mx !== ggx || grd.my !== ggy)) {
        if (egrd.fcend >= FCSIZ) {
            throw new Error('fakecorr overflow');
        }
        const fcp = egrd.fakecorr[egrd.fcend];
        fcp.fx = nx;
        fcp.fy = ny;
        fcp.ftyp = origTyp;
        fcp.flags = crm.flags;
        egrd.fcend++;
    } else if (!egrd.gddone) {
        // We're stuck; try to find a new destination
        const dest = find_guard_dest(grd, state);
        if (!dest || (dest.x === ggx && dest.y === ggy)) {
            env.message(
                `${capitalizedMonsterName(grd, state)}, confused, disappears.`,
                state, env,
            );
            return gd_move_cleanup(grd, semi_dead, true, state, env);
        }
        egrd.gdx = dest.x;
        egrd.gdy = dest.y;
        return gd_move_nextpos(grd, x, y, semi_dead, state, env);
    }

    // newpos label
    gd_mv_monaway(grd, nx, ny, state, env);
    if (egrd.gddone)
        return gd_move_cleanup(grd, semi_dead, false, state, env);
    egrd.ogx = grd.mx;
    egrd.ogy = grd.my;
    remove_monster(grd.mx, grd.my, state);
    place_monster(grd, nx, ny, state);
    if (newspot && g_at(nx, ny, state)) {
        // Gold here (likely from mineralize()); pick it up now so the guard
        // doesn't later think the hero dropped it.
        // mpickgold not ported; throw on the exercised branch.
        throw new UnsupportedVaultGuardError(
            'gd_move() guard picks up pre-existing gold at new position',
        );
    } else {
        newsym(grd.mx, grd.my);
    }
    restfakecorr(grd, state, env);
    return 1;
}

// C ref: vault.c find_guard_dest() (281-314). Finds the nearest corridor cell
// in expanding concentric squares around the hero that the guard can walk
// toward. Returns { x, y } or null.
function find_guard_dest(guard, state) {
    outer:
    for (let dd = 2; dd < ROWNO || dd < COLNO; dd++) {
        for (let y = state.u.uy - dd; y <= state.u.uy + dd; y++) {
            if (y < 0 || y > ROWNO - 1) continue;
            for (let x = state.u.ux - dd; x <= state.u.ux + dd; x++) {
                if (y !== state.u.uy - dd && y !== state.u.uy + dd
                    && x !== state.u.ux - dd) {
                    x = state.u.ux + dd;
                }
                if (x < 1 || x > COLNO - 1) continue;
                if (guard && ((x === guard.mx && y === guard.my)
                    || (guard.isgd && in_fcorridor(guard, x, y)))) {
                    continue;
                }
                if (state.level.at(x, y).typ === CORR) {
                    const lx = (x < state.u.ux) ? x + 1
                        : (x > state.u.ux) ? x - 1 : x;
                    const ly = (y < state.u.uy) ? y + 1
                        : (y > state.u.uy) ? y - 1 : y;
                    const adjTyp = state.level.at(lx, ly).typ;
                    if (adjTyp !== STONE && adjTyp !== CORR) {
                        continue outer; // C: goto incr_radius
                    }
                    return { x, y };
                }
            }
        }
    }
    return null;
}

function propertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}
function Deaf(state) {
    return propertyActive(state.u, DEAF)
        || Boolean(state.u?.uroleplay?.deaf);
}
function Blind(state) {
    return propertyActive(state.u, BLINDED);
}
function Strangled(state) {
    return propertyActive(state.u, STRANGLED);
}
function canspotmon(mon, state) {
    return canseemon(mon, state);
}

// C ref: vault.c invault() (317-629). Called once per turn from moveloop when
// the hero is in a vault. After VAULT_GUARD_TIME turns, creates a guard who
// asks the hero's name and demands any gold be dropped.
export async function invault(state, env = {}) {
    const { message = async () => {}, makemon_runtime: makeMonRuntime } = env;
    const { random } = env;
    const u = state.u;

    const vaultroom = vault_occupied(u.urooms, state);
    if (!vaultroom) {
        u.uinvault = 0;
        return;
    }

    const vgdeathcount = state.mvitals[PM_GUARD].died;
    if (vgdeathcount < 2
        || (vgdeathcount < 50 && !random.rn2(vgdeathcount * vgdeathcount))) {
        ++u.uinvault;
    }
    if (u.uinvault < VAULT_GUARD_TIME
        || (u.uinvault % (VAULT_GUARD_TIME / 2)) !== 0) {
        return;
    }

    let guard = findgd(state);
    if (guard) return;

    // No guard yet — create one.
    const dest = find_guard_dest(null, state);
    if (!dest) return;
    const gdx = dest.x;
    const gdy = dest.y;
    const vroom = vaultroom - ROOMOFFSET;

    // Find a wall location for the guard to enter through.
    let x = u.ux;
    let y = u.uy;
    if (state.level.at(x, y).typ !== ROOM) {
        if (state.level.at(x + 1, y).typ === ROOM) {
            x = x + 1;
        } else if (state.level.at(x, y + 1).typ === ROOM) {
            y = y + 1;
        } else if (state.level.at(x - 1, y).typ === ROOM) {
            x = x - 1;
        } else if (state.level.at(x, y - 1).typ === ROOM) {
            y = y - 1;
        } else if (state.level.at(x + 1, y + 1).typ === ROOM) {
            x = x + 1; y = y + 1;
        } else if (state.level.at(x - 1, y - 1).typ === ROOM) {
            x = x - 1; y = y - 1;
        } else if (state.level.at(x + 1, y - 1).typ === ROOM) {
            x = x + 1; y = y - 1;
        } else if (state.level.at(x - 1, y + 1).typ === ROOM) {
            x = x - 1; y = y + 1;
        }
    }
    while (state.level.at(x, y).typ === ROOM) {
        const dx = (gdx > x) ? 1 : (gdx < x) ? -1 : 0;
        const dy = (gdy > y) ? 1 : (gdy < y) ? -1 : 0;
        if (Math.abs(gdx - x) >= Math.abs(gdy - y))
            x += dx;
        else
            y += dy;
    }
    if (x === u.ux && y === u.uy) {
        if (state.level.at(x + 1, y).typ === HWALL
            || state.level.at(x + 1, y).typ === DOOR) {
            x = x + 1;
        } else if (state.level.at(x - 1, y).typ === HWALL
            || state.level.at(x - 1, y).typ === DOOR) {
            x = x - 1;
        } else if (state.level.at(x, y + 1).typ === VWALL
            || state.level.at(x, y + 1).typ === DOOR) {
            y = y + 1;
        } else if (state.level.at(x, y - 1).typ === VWALL
            || state.level.at(x, y - 1).typ === DOOR) {
            y = y - 1;
        } else {
            return;
        }
    }

    guard = await makeMonRuntime(
        state.mons[PM_GUARD], x, y, MM_EGD | MM_NOMSG,
        { state, random, message },
    );
    if (!guard) return;
    guard.isgd = 1;
    guard.mpeaceful = 1;
    set_malign(guard, state);
    EGD(guard).gddone = 0;
    EGD(guard).ogx = x;
    EGD(guard).ogy = y;
    assign_level(EGD(guard).gdlevel, u.uz);
    EGD(guard).vroom = vroom;
    EGD(guard).warncnt = 0;

    ++u.uinvault;

    // C ref: vault.c:423. reset_faint() wakes a fainted hero.
    // C: ga.afternmv is NULL when no occupation is pending; unfaint is a
    // function pointer.  In JS both default to undefined, so the guard
    // prevents a false match when neither is set.
    if (state.afternmv != null && state.afternmv === state._unfaint) {
        await env.unmul?.('You revive.');
    }

    // Boulder destruction at guard's position
    if (sobj_at(BOULDER, guard.mx, guard.my, state)) {
        throw new UnsupportedVaultGuardError(
            'invault() destroying boulders at guard entry point',
        );
    }

    const spotted = canspotmon(guard, state);
    if (spotted) {
        await message(
            `Suddenly one of the Vault's ${makeplural(pmname(guard.data, gender(guard)))} enters!`,
        );
        newsym(guard.mx, guard.my);
    } else {
        await message('Someone else has entered the Vault.');
        map_invisible(guard.mx, guard.my, state);
    }

    if (u.uswallow) {
        if (!Deaf(state)) {
            await message('"What\'s going on here?"');
        }
        if (!spotted) {
            await message('The other presence vanishes.');
        }
        throw new UnsupportedVaultGuardError(
            'invault() removing guard while hero is swallowed',
        );
    }
    const uApType = state.youmonst?.m_ap_type ?? 0;
    if (uApType === M_AP_OBJECT || u.uundetected) {
        throw new UnsupportedVaultGuardError(
            'invault() guard encounters disguised or hidden hero',
        );
    }
    if (Strangled(state) || is_silent(state.youmonst?.data ?? u.umonster)
        || state.multi < 0) {
        if (Deaf(state)) {
            throw new UnsupportedVaultGuardError(
                'invault() guard leaves deaf+strangled hero',
            );
        }
        await message('"I\'ll be back when you\'re ready to speak to me!"');
        throw new UnsupportedVaultGuardError(
            'invault() guard leaves strangled/silent hero (mongone)',
        );
    }

    await env.stopOccupation?.();
    if (state.multi > 0) {
        nomul(0, state);
    }

    let buf = '';
    let trycount = 5;
    do {
        buf = await getlin(
            Deaf(state) ? 'You are required to supply your name. -'
                : '"Hello stranger, who are you?" -',
            state,
        );
        buf = mungspaces(buf);
    } while (!buf && --trycount > 0);

    if (u.ualign.type === A_LAWFUL
        && buf.substring(0, state.plname.length).toLowerCase()
            !== state.plname.toLowerCase()) {
        adjalign(-1, state);
    }

    if (buf.toLowerCase() === 'croesus'
        || buf.toLowerCase() === 'kroisos'
        || buf.toLowerCase() === 'creosote') {
        throw new UnsupportedVaultGuardError(
            'invault() hero claims to be Croesus',
        );
    }

    if (Deaf(state)) {
        throw new UnsupportedVaultGuardError(
            'invault() deaf hero name response',
        );
    }
    // "I don't know you."
    await message('"I don\'t know you."');

    const umoney = money_cnt(state.invent);
    if (!umoney && !hidden_gold(true, state)) {
        // No gold — "Please follow me."
        await message('"Please follow me."');
    } else {
        if (!umoney) {
            await message('"You have hidden gold."');
        }
        await message(
            '"Most likely all your gold was stolen from this vault."',
        );
        await message('"Please drop that gold and follow me."');
        EGD(guard).dropgoldcnt++;
    }
    EGD(guard).gdx = gdx;
    EGD(guard).gdy = gdy;
    EGD(guard).fcbeg = 0;
    EGD(guard).fakecorr[0].fx = x;
    EGD(guard).fakecorr[0].fy = y;
    let typ = state.level.at(x, y).typ;
    if (!IS_WALL(typ)) {
        const room = state.level.rooms[vroom];
        const lowx = room.lx;
        const hix = room.hx;
        const lowy = room.ly;
        const hiy = room.hy;
        if (x === lowx - 1 && y === lowy - 1) typ = TLCORNER;
        else if (x === hix + 1 && y === lowy - 1) typ = TRCORNER;
        else if (x === lowx - 1 && y === hiy + 1) typ = BLCORNER;
        else if (x === hix + 1 && y === hiy + 1) typ = BRCORNER;
        else if (y === lowy - 1 || y === hiy + 1) typ = HWALL;
        else if (x === lowx - 1 || x === hix + 1) typ = VWALL;

        const loc = state.level.at(x, y);
        loc.typ = typ;
        loc.wall_info = 0;
        xy_set_wall_state(x, y, state);
    }
    EGD(guard).fakecorr[0].ftyp = typ;
    EGD(guard).fakecorr[0].flags = state.level.at(x, y).flags;
    spot_stop_timers(x, y, MELT_ICE_AWAY, state);
    const loc = state.level.at(x, y);
    loc.typ = DOOR;
    loc.doormask = D_NODOOR;
    unblock_point(x, y, state);
    EGD(guard).fcend = 1;
    EGD(guard).warncnt = 1;
}

// C ref: vault.c paygd() (1204-1247). Called from end.c really_done(). Only
// the early return is ported: with no gold, or no guard on the level, the
// function has nothing to settle. Every other arm moves the hero's gold to the
// vault or a grave and then removes the guard, which needs mnexto(),
// make_grave(), freeinv(), place_object() and stackobj() on a guard mongone()
// itself refuses; those stop here.
export function paygd(_silently, state = game) {
    const grd = findgd(state);
    const umoney = money_cnt(state.invent);

    if (!umoney || !grd) return;
    throw new UnsupportedVaultGuardError(
        'paygd() surrendering the hero\'s gold to a vault guard',
    );
}

// C ref: vault.c hidden_gold(). `even_if_unknown` false counts only gold in
// containers whose contents the hero already knows.
export function hidden_gold(even_if_unknown, state = game) {
    let value = 0;
    for (let obj = state.invent; obj; obj = obj.nobj) {
        if (hasContents(obj) && (obj.cknown || even_if_unknown))
            value += contained_gold(obj, even_if_unknown);
    }
    return value;
}
