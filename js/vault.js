// vault.js -- gold the hero is carrying out of sight, vault occupancy, guard
// entry, guard escort (gd_move), and the end-of-game vault-guard settlement.
// C ref: src/vault.c hidden_gold(), vault_occupied(), findgd(),
// vault_summon_gd(), gd_sound(), vault_gd_watching(), newegd(),
// in_fcorridor(), find_guard_dest(), invault(), gd_move(), paygd().

import {
    ACCESSIBLE,
    A_LAWFUL,
    ARTICLE_A,
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
    FEMALE,
    GD_DESTROYGOLD,
    GD_EATGOLD,
    HWALL,
    IN_SIGHT,
    IS_OBSTRUCTED,
    IS_POOL,
    IS_ROOM,
    IS_STWALL,
    IS_WALL,
    M_AP_OBJECT,
    MALE,
    MELT_ICE_AWAY,
    MM_EGD,
    MM_NOMSG,
    NEED_HTH_WEAPON,
    RLOC_ERR,
    RLOC_MSG,
    RLOC_NOMSG,
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
} from './const.js';
import { isok } from './cmd_isok.js';
import {
    map_invisible, map_invisible_planning, map_location, newsym, unset_seenv, xy_set_wall_state,
} from './display.js';
import { assign_level, on_level } from './dungeon.js';
import { verbalize, youHear } from './pline.js';
import { reset_faint } from './eat.js';
import { del_engr_at } from './engrave.js';
import { mungspaces } from './fruit.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { nomul } from './hack.js';
import { add_to_minv, currency, freeinv, money_cnt, obj_extract_self, obfree, sobj_at, stackobj } from './invent.js';
import { set_malign } from './makemon.js';
import { gender, is_silent, mhe, noit_mhis, sticks } from './mondata.js';
import { PM_CROESUS, PM_GUARD } from './monsters.js';
import {
    m_at, mon_track_clear, place_monster, remove_monster,
} from './monst.js';
import { m_carrying, m_into_limbo, mnexto, mongone, mpickgold, setmangry } from './mon.js';
import { mon_wield_item } from './weapon.js';
import {
    capitalizedAlwaysVisibleMonsterName,
    alwaysVisibleMonsterName,
    capitalizedMonsterName,
    Monnam,
    noit_Monnam,
    pmname,
    Some_Monnam,
    x_monnam,
} from './do_name.js';
import { makeplural } from './fruit.js';
import { adjalign } from './attrib.js';
import { carried, g_at, hasContents, place_object, remove_object } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { BOULDER, COIN_CLASS, GOLD_PIECE, ROCK, TIN_WHISTLE } from './objects.js';
import { an, mimic_obj_name, simpleonames } from './objnam.js';
import { in_rooms } from './rooms.js';
import { contained_gold } from './shk.js';
import { relobj } from './steal.js';
import { um_dist } from './apply.js';
import { enexto, rloc } from './teleport.js';
import { spot_stop_timers } from './timeout.js';
import { t_at, deltrap } from './trap.js';
import {
    displayPendingTtyMessageWindow,
    ttyPline,
} from './tty_message.js';
import {
    block_point, cansee, couldsee, m_canseeu, recalc_block_point, unblock_point,
} from './vision.js';
import { getlin } from './windows.js';
import { canspotmon, mon_visible } from './display.js';
import { set_voice } from './sounds.js';
import { fracture_rock } from './zap.js';
import { make_grave } from './grave.js';
import { d, rn1, rn2, rnd, rne } from './rng.js';

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

// C ref: vault.c uleftvault() (256-278). teleds() calls this after updating
// the hero's temporary vault occupancy and before destination room effects.
export async function uleftvault(grd, state = game, env = {}) {
    if (!grd || !grd.isgd || grd.mhp < 1) return;
    if ((money_cnt(state.invent) || hidden_gold(true, state))
        && um_dist(grd.mx, grd.my, 1, state)) {
        if (grd.mpeaceful) {
            if (canspotmon(grd, state))
                await (env.message ?? ttyPline)(
                    `${Monnam(grd, state, env)} becomes irate.`, state, env,
                );
            grd.mpeaceful = 0;
        }
        if (!in_fcorridor(grd, state.u.ux, state.u.uy))
            await gd_move(grd, { ...env, state });
    }
}

// C ref: vault.c findgd() (204-234). Search the level monster chain first,
// healing a guard parked at <0,0> until its fake corridor is complete. If none
// is on this level, unlink its migrating guard from gm.migrating_mons, put it
// on the level chain, clear its track and park it at <0,0>.
export function findgd(state = game) {
    for (let mtmp = state.level?.monlist ?? null; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.isgd && on_level(mtmp.mextra?.egd?.gdlevel, state.u.uz)) {
            if (!mtmp.mx && !mtmp.mextra.egd.gddone)
                mtmp.mhp = mtmp.mhpmax;
            return mtmp;
        }
    }
    let previous = null;
    for (let mtmp = state.gm?.migrating_mons ?? null; mtmp;) {
        if (mtmp.isgd && on_level(mtmp.mextra?.egd?.gdlevel, state.u.uz)) {
            if (previous) previous.nmon = mtmp.nmon;
            else state.gm.migrating_mons = mtmp.nmon;
            mtmp.nmon = state.level.monlist ?? null;
            state.level.monlist = mtmp;
            mon_track_clear(mtmp);
            mtmp.mux = state.u.ux;
            mtmp.muy = state.u.uy;
            mtmp.mx = 0;
            mtmp.my = 0;
            parkguard(mtmp, state);
            return mtmp;
        }
        previous = mtmp;
        mtmp = mtmp.nmon;
    }
    return null;
}

// C ref: vault.c vault_summon_gd() (237-241). A cursed ordinary tin whistle
// starts the guard timer only when the hero is in a vault with no guard.
export function vault_summon_gd(state = game) {
    if (vault_occupied(state.u?.urooms, state) && !findgd(state))
        state.u.uinvault = VAULT_GUARD_TIME - 1;
}

// C ref: vault.c gd_sound() (1272-1275). This predicate calls findgd(); that
// call may pull a migrating guard onto the level and park it at <0,0>.
export function gd_sound(state = game) {
    return !(vault_occupied(state.u?.urooms, state) || findgd(state));
}

// C ref: vault.c vault_gd_watching() (1278-1285). Eating or destroying gold
// is witnessed only by an on-map guard that can see the hero.
export function vault_gd_watching(activity, state = game) {
    const guard = findgd(state);
    if (guard && guard.mx && guard.mcansee && m_canseeu(guard, state)) {
        if (activity === GD_EATGOLD || activity === GD_DESTROYGOLD)
            EGD(guard).witness = activity;
    }
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
export function in_fcorridor(grd, x, y) {
    const egrd = EGD(grd);
    for (let fci = egrd.fcbeg; fci < egrd.fcend; fci++) {
        if (x === egrd.fakecorr[fci].fx && y === egrd.fakecorr[fci].fy)
            return true;
    }
    return false;
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
async function clear_fcorr(grd, forceshow, state, env) {
    const egrd = EGD(grd);
    if (!on_level(egrd.gdlevel, state.u.uz)) return true;

    let sawcorridor = false;
    const silently = Boolean(state.program_state?.stopprint);
    const message = env.message ?? ttyPline;

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
                && state.u.uball && !carried(state.u.uball)
                && state.u.uball.ox === fcx && state.u.uball.oy === fcy)) {
            return false;
        }

        const mtmp = m_at(fcx, fcy, state);
        if (mtmp) {
            if (mtmp.isgd) {
                return false;
            } else {
                if (mtmp.mtame) {
                    const { yelp } = await import('./sounds.js');
                    await yelp(mtmp, state, env.random);
                }
                if (!await rloc(mtmp, RLOC_MSG, { ...env, state })) {
                    await m_into_limbo(mtmp, state, env);
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

    if (sawcorridor && !silently)
        await message('The corridor disappears.', state, env);
    const heroHp = state.u.upolyd ? state.u.mh : state.u.uhp;
    if (IS_OBSTRUCTED(state.level.at(state.u.ux, state.u.uy).typ)
        && heroHp > 0 && !silently)
        await message('You are encased in rock.', state, env);
    return true;
}

// C ref: vault.c restfakecorr() (143-151). The hero has left the corridor;
// try to make the guard disappear. If clear_fcorr fails (hero or guard still
// in the way), the guard remains parked at (0,0) and restfakecorr will be
// retried on the next gd_move call.
async function restfakecorr(grd, state, env) {
    if (await clear_fcorr(grd, false, state, env)) {
        grd.isgd = 0; // dmonsfree() should delete this mon
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

// C ref: vault.c grddead() (175-188). Remove the temporary corridor before
// allowing mondead()/mongone() to detach a dead vault guard. A failed first
// pass means the guard still occupies a fake-corridor square; park it at
// (0,0), then retry the same source operation.
export async function grddead(grd, state = game, rawEnv = {}) {
    const env = {
        ...rawEnv,
        state,
        message: rawEnv.message ?? ttyPline,
    };
    let dispose = await clear_fcorr(grd, true, state, env);

    if (!dispose) {
        // C relobj(grd, 0, FALSE) drops non-gold inventory and removes any
        // carried guard gold before the guard is parked off-map.
        await relobj(grd, 0, false, env);
        grd.mhp = 0;
        parkguard(grd, state);
        dispose = await clear_fcorr(grd, true, state, env);
    }

    if (dispose) grd.isgd = 0; // dmonsfree() should delete it
    return dispose;
}

// C ref: vault.c move_gold(). Redraw the old location before choosing the
// destination; stackobj preserves this moved pile while absorbing old gold.
async function move_gold(gold, vroom, state, env) {
    const objectEnv = objectGenerationEnv({ ...env, state });
    remove_object(gold, objectEnv);
    newsym(gold.ox, gold.oy, state);
    const room = state.level.rooms[vroom];
    const nx = room.lx + env.random.rn2(2);
    const ny = room.ly + env.random.rn2(2);
    await place_object(gold, nx, ny, objectEnv);
    stackobj(gold, objectEnv);
    newsym(nx, ny, state);
}

// C ref: vault.c wallify_vault() (645-731). Restore the vault walls after the
// guard escort is done. Gold at wall positions moves into the vault, rocks and
// boulders are subsumed into walls, traps are destroyed, and the vault
// boundary is rebuilt.
async function wallify_vault(grd, state, env) {
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
                || sobj_at(ROCK, x, y, state) || sobj_at(BOULDER, x, y, state))
                && !in_fcorridor(grd, x, y)) {

                // Monster at wall position: relocate or throw
                const mon = m_at(x, y, state);
                if (mon && mon !== grd) {
                    if (!rloc(mon, RLOC_MSG, { state })) {
                        await m_into_limbo(mon, state, env);
                    }
                }
                // Gold at wall position: move into vault
                const gold = g_at(x, y, state);
                if (gold) {
                    await move_gold(gold, EGD(grd).vroom, state, env);
                    movedgold = true;
                }
                // Destroy rocks and boulders (subsume them into the walls);
                // other objects present stay intact and become embedded.
                // C ref: vault.c lines 682-689.
                let rocks;
                while ((rocks = sobj_at(ROCK, x, y, state)) != null) {
                    obj_extract_self(rocks);
                    obfree(rocks);
                }
                while ((rocks = sobj_at(BOULDER, x, y, state)) != null) {
                    obj_extract_self(rocks);
                    obfree(rocks);
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
            await env.message(
                `${capitalizedAlwaysVisibleMonsterName(grd, state)} whispers an incantation.`,
                state, env,
            );
        else {
            const heard = youHear('a distant chant.', state);
            if (heard) await env.message(heard, state, env);
        }
        if (movedgold)
            await env.message(
                'A mysterious force moves the gold into the vault.',
                state, env,
            );
        if (fixed)
            await env.message(
                "The damaged vault's walls are magically restored!",
                state, env,
            );
    }
}

// C ref: vault.c gd_mv_monaway() (733-747). Move a monster out of the guard's
// way at position (nx, ny).
async function gd_mv_monaway(grd, nx, ny, state, env) {
    const mtmp = m_at(nx, ny, state);
    if (mtmp && mtmp !== grd) {
        if (!Deaf(state)) {
            env.message('"Out of my way, scum!"', state, env);
        }
        if (!rloc(mtmp, RLOC_ERR | RLOC_MSG, { state })
            || m_at(nx, ny, state)) {
            await m_into_limbo(mtmp, state, env);
        }
        recalc_block_point(nx, ny, state);
    }
}

// C ref: vault.c gd_move_cleanup() (836-866). Final cleanup when the guard
// escort is done: park the guard off-map, restore vault walls, and remove
// the temporary corridor. Returns 1 (guard moved/disappeared) or -2 (died).
async function gd_move_cleanup(grd, semi_dead, disappear_msg_seen, state, env) {
    const x = grd.mx;
    const y = grd.my;
    const see_guard = canspotmon(grd, state);
    parkguard(grd, state);
    await wallify_vault(grd, state, env);
    await restfakecorr(grd, state, env);
    if (!semi_dead && (in_fcorridor(grd, state.u.ux, state.u.uy)
        || cansee(x, y, state))) {
        if (!disappear_msg_seen && see_guard)
            // C's pline() completes before gd_move() returns. ttyPline() is
            // awaitable in JS, and monmove.c:m_move() awaits gd_move(), so
            // preserve that source ordering before the turn is captured.
            await env.message(
                `Suddenly, ${alwaysVisibleMonsterName(grd, state)} disappears.`,
                state, env,
            );
            // The C pline() call leaves its completed message in the TTY
            // window before gd_move_cleanup() returns; when that window is
            // awaiting More, it also prevents later monster turns from
            // consuming RNG before the next input. Complete that same
            // display-window boundary in the awaitable JS TTY adapter.
            await displayPendingTtyMessageWindow(state);
        return 1;
    }
    return -2;
}

// C ref: vault.c gd_letknow() (868-882). Announce a guard's approach or
// confrontation when the guard turns hostile and teleports out.
async function gd_letknow(grd, state, env) {
    if (!cansee(grd.mx, grd.my, state) || !mon_visible(grd, state)) {
        const sound = m_carrying(grd, TIN_WHISTLE, state)
            ? "the shrill sound of a guard's whistle" : 'angry shouting';
        const heard = youHear(`${sound}.`, state);
        if (heard) await env.message(heard, state, env);
    } else {
        const name = x_monnam(grd, ARTICLE_A, 'angry', 0, false, state, env);
        const text = um_dist(grd.mx, grd.my, 2, state)
            ? `You see ${name} approaching.`
            : `You are confronted by ${name}.`;
        await env.message(text, state, env);
    }
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
        await wallify_vault(grd, state, gdEnv);

    if (!grd.mpeaceful) {
        // C vault.c:914-932. Once the hero leaves with gold, the guard can
        // teleport out of its vault or temporary corridor and close it.
        if (!u_in_vault
            && (grd_in_vault || (in_fcorridor(grd, grd.mx, grd.my)
                && !in_fcorridor(grd, state.u.ux, state.u.uy)))) {
            rloc(grd, RLOC_MSG, { ...env, state });
            await wallify_vault(grd, state, gdEnv);
            if (!in_fcorridor(grd, grd.mx, grd.my))
                await clear_fcorr(grd, true, state, gdEnv);
            await gd_letknow(grd, state, gdEnv);
            return -1;
        }
        if (!in_fcorridor(grd, grd.mx, grd.my))
            await clear_fcorr(grd, true, state, gdEnv);
        return -1;
    }

    if (Math.abs(egrd.ogx - grd.mx) > 1 || Math.abs(egrd.ogy - grd.my) > 1)
        return -1; // teleported guard — treat as normal monster

    if (egrd.witness) {
        // C ref: vault.c:933-944. The guard reacts before the ordinary
        // pursuit path; clear the observation so it is announced once.
        if (!Deaf(state)) {
            set_voice(grd, 0, 80, 0, state);
            await verbalize(
                `How dare you ${egrd.witness & GD_EATGOLD ? 'consume' : 'destroy'} that gold, scoundrel!`,
                state, { message },
            );
        }
        egrd.witness = 0;
        grd.mpeaceful = 0;
        return -1;
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
                    set_voice(grd, 0, 80, 0, state);
                    await verbalize('You\'ve been warned, knave!',
                        state, { message });
                }
                grd.mpeaceful = 0;
                await mnexto(grd, RLOC_NOMSG, { ...env, state });
                const entry = state.level.at(m, n);
                entry.typ = egrd.fakecorr[0].ftyp;
                entry.flags = egrd.fakecorr[0].flags;
                recalc_block_point(m, n, state);
                del_engr_at(m, n, state);
                newsym(m, n);
                return -1;
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
                // C vault.c:986-997. Leaving before the first corridor
                // extension restores the doorway and sets the guard loose.
                const m = grd.mx;
                const n = grd.my;
                await rloc(grd, RLOC_MSG, { ...env, state });
                const entry = state.level.at(m, n);
                entry.typ = egrd.fakecorr[0].ftyp;
                entry.flags = egrd.fakecorr[0].flags;
                recalc_block_point(m, n, state);
                del_engr_at(m, n, state);
                newsym(m, n);
                grd.mpeaceful = 0;
                await gd_letknow(grd, state, gdEnv);
                return -1;
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
            // C ref: vault.c gd_move(): the escort makes one demand, then
            // turns hostile if the hero still carries gold on the next turn.
            if (!grd.mx) {
                await restfakecorr(grd, state, gdEnv);
                return -2;
            }
            if (egrd.warncnt < 6) {
                egrd.warncnt = 6;
                if (Deaf(state)) {
                    if (!Blind(state)) {
                        await message(
                            `${noit_Monnam(grd, state)} holds out ${noit_mhis(grd, { state })} palm demandingly!`,
                            state, gdEnv,
                        );
                    }
                } else {
                    set_voice(grd, 0, 80, 0, state);
                    await verbalize('Drop all your gold, scoundrel!', state, { message });
                }
                return 0;
            }
            if (Deaf(state)) {
                if (!Blind(state)) {
                    await message(
                        `${noit_Monnam(grd, state)} rubs ${noit_mhis(grd, { state })} hands with enraged delight!`,
                        state, gdEnv,
                    );
                }
            } else {
                set_voice(grd, 0, 80, 0, state);
                await verbalize('So be it, rogue!', state, { message });
            }
            grd.mpeaceful = 0;
            return -1;
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
        // C ref: vault.c gd_pick_corridor_gold(). The guard may collect gold
        // beneath the hero or briefly move to a different corridor square.
        const underHero = goldX === state.u.ux && goldY === state.u.uy;
        const see_it = cansee(goldX, goldY, state);
        const guardX = grd.mx;
        const guardY = grd.my;
        if (underHero) {
            const guardDistance = dist2(guardX, guardY, state.u.ux, state.u.uy);
            if (see_it && guardDistance > 2) {
                let bestDistance = guardDistance;
                let bestX = guardX;
                let bestY = guardY;
                // C initializes tryct to 9 and uses a do/while (--tryct >= 0),
                // which calls enexto ten times, even after finding a near spot.
                for (let tryct = 9; tryct >= 0; --tryct) {
                    const next = enexto(goldX, goldY, grd.data, { ...env, state });
                    if (!next) continue;
                    const distance = dist2(next.x, next.y, state.u.ux, state.u.uy);
                    if (distance < bestDistance || (distance === bestDistance
                        && dist2(next.x, next.y, guardX, guardY)
                            < dist2(bestX, bestY, guardX, guardY))) {
                        bestDistance = distance;
                        bestX = next.x;
                        bestY = next.y;
                    }
                }
                if (bestDistance < guardDistance) {
                    remove_monster(guardX, guardY, state);
                    newsym(guardX, guardY, state);
                    place_monster(grd, bestX, bestY, state);
                    newsym(grd.mx, grd.my, state);
                }
            }
            const gold = g_at(goldX, goldY, state);
            const objectEnv = objectGenerationEnv({ ...env, state });
            obj_extract_self(gold, objectEnv);
            add_to_minv(grd, gold, objectEnv);
            newsym(goldX, goldY, state);
        } else if (goldX === guardX && goldY === guardY) {
            mpickgold(grd, { ...env, state });
        } else {
            await gd_mv_monaway(grd, goldX, goldY, state, gdEnv);
            if (see_it) {
                remove_monster(grd.mx, grd.my, state);
                newsym(grd.mx, grd.my, state);
                place_monster(grd, goldX, goldY, state);
            }
            mpickgold(grd, { ...env, state });
        }
        if (see_it) {
            await message(
                `${Some_Monnam(grd, state)}${grd.mpeaceful && egrd.warncnt > 5 ? ' calms down and' : ''} picks up the gold${underHero ? ' from beneath you' : ''}.`,
                state, gdEnv,
            );
        }
        if (grd.mx !== guardX || grd.my !== guardY) {
            remove_monster(grd.mx, grd.my, state);
            newsym(grd.mx, grd.my, state);
            place_monster(grd, guardX, guardY, state);
            newsym(guardX, guardY, state);
        }
        if (!grd.mpeaceful) return -1;
        egrd.warncnt = 5;
        return 0;
    }

    if (um_dist(grd.mx, grd.my, 1, state) || egrd.gddone) {
        if (!egrd.gddone && !random.rn2(10) && !Deaf(state)
            && !state.u.uswallow
            && !(state.u.ustuck
                && !sticks(state.youmonst?.data ?? state.u.umonster))) {
            await message('"Move along!"', state, gdEnv);
        }
        await restfakecorr(grd, state, gdEnv);
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
                        await gd_mv_monaway(grd, nx, ny, state, gdEnv);
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
                        grd, x, y, nx, ny, typ, semi_dead, true, state, gdEnv,
                    );
                }
            }
        }
    }

    return gd_move_nextpos(grd, x, y, semi_dead, state, gdEnv);
}

// C ref: vault.c gd_move() lines 1111-1200, the "nextpos" and "proceed"
// labels. The guard walks toward (gdx, gdy), creating corridor tiles as needed.
async function gd_move_nextpos(grd, x, y, semi_dead, state, env) {
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
async function gd_move_proceed(
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
    await gd_mv_monaway(grd, nx, ny, state, env);
    if (egrd.gddone)
        return gd_move_cleanup(grd, semi_dead, false, state, env);
    egrd.ogx = grd.mx;
    egrd.ogy = grd.my;
    remove_monster(grd.mx, grd.my, state);
    place_monster(grd, nx, ny, state);
    if (newspot && g_at(nx, ny, state)) {
        // Gold here (likely from mineralize()); pick it up now so the guard
        // doesn't later think the hero dropped it.
        mpickgold(grd, { ...env, state });
        if (canspotmon(grd, state))
            await env.message(`${Monnam(grd, state)} picks up some gold.`, state, env);
    } else {
        newsym(grd.mx, grd.my);
    }
    await restfakecorr(grd, state, env);
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

    // C ref: vault.c:423.  reset_faint() checks the pending callback and
    // wakes the hero only when that callback is eat.c:unfaint().
    await reset_faint(state, { ...env, message });

    // C vault.c invault clears every boulder before announcing the guard.
    let boulder = sobj_at(BOULDER, guard.mx, guard.my, state);
    if (boulder) {
        const bname = simpleonames(boulder, state);
        let count = 0;
        do {
            ++count;
            await fracture_rock(boulder, state, random, { ...env, message });
            boulder = sobj_at(BOULDER, guard.mx, guard.my, state);
        } while (boulder);
        const suffix = `${count === 1 ? an(bname) : makeplural(bname)} shatter.`;
        const line = Blind(state) ? youHear(suffix, state) : `You see ${suffix}`;
        if (line) await message(line);
    }

    const spotted = canspotmon(guard, state);
    if (spotted) {
        await message(
            `Suddenly one of the Vault's ${makeplural(pmname(guard.data, gender(guard)))} enters!`,
        );
        newsym(guard.mx, guard.my);
    } else {
        await message('Someone else has entered the Vault.');
        if (state === game) map_invisible(guard.mx, guard.my, state);
        else map_invisible_planning(guard.mx, guard.my, state);
    }

    if (u.uswallow) {
        if (!Deaf(state)) {
            set_voice(guard, 0, 80, 0, state);
            await verbalize("What's going on here?", state, { message });
        }
        if (!spotted) {
            await message('The other presence vanishes.');
        }
        await mongone(guard, { state, random });
        return;
    }
    const uApType = state.youmonst?.m_ap_type ?? 0;
    if (uApType === M_AP_OBJECT || u.uundetected) {
        if (uApType === M_AP_OBJECT
            && state.youmonst.mappearance !== GOLD_PIECE && !Deaf(state)) {
            set_voice(guard, 0, 80, 0, state);
            await verbalize(
                `Hey!  Who left that ${mimic_obj_name(state.youmonst, state)} in here?`,
                state, { message },
            );
        }
        await message(`Puzzled, ${mhe(guard, { state, random, canSpotMonster: canspotmon })} turns around and leaves.`);
        await mongone(guard, { state, random });
        return;
    }
    if (Strangled(state) || is_silent(state.youmonst?.data ?? u.umonster)
        || state.multi < 0) {
        if (Deaf(state)) {
            await message(`${noit_Monnam(guard, state)} huffs and turns to leave.`);
        } else {
            set_voice(guard, 0, 80, 0, state);
            await verbalize(
                "I'll be back when you're ready to speak to me!",
                state, { message },
            );
        }
        await mongone(guard, { state, random });
        return;
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
        if (!state.mvitals[PM_CROESUS].died) {
            if (Deaf(state)) {
                if (!Blind(state))
                    await message(`${noit_Monnam(guard, state)} waves goodbye.`, state);
            } else {
                set_voice(guard, 0, 80, 0, state);
                await verbalize(
                    'Oh, yes, of course.  Sorry to have disturbed you.',
                    state, { message },
                );
            }
            await mongone(guard, { state });
            return;
        }
        const guardEnv = { ...env, state, random, message };
        await setmangry(guard, false, guardEnv);
        if (Deaf(state)) {
            if (!Blind(state))
                await message(`${noit_Monnam(guard, state)} mouths something and looks very angry!`);
        } else {
            set_voice(guard, 0, 80, 0, state);
            await verbalize("Back from the dead, are you?  I'll remedy that!",
                state, { message });
        }
        // C arms the guard now so it does not spend its next turn wielding.
        if (!guard.mw) {
            guard.weapon_check = NEED_HTH_WEAPON;
            await mon_wield_item(guard, guardEnv);
        }
        return;
    }

    if (Deaf(state)) {
        await message(`${noit_Monnam(guard, state)} doesn't ${Blind(state) ? '' : 'appear to '}recognize you.`);
    } else {
        await message('"I don\'t know you."');
    }

    const umoney = money_cnt(state.invent);
    if (!umoney && !hidden_gold(true, state)) {
        if (Deaf(state)) {
            await message(`${noit_Monnam(guard, state)} stomps${Blind(state) ? '' : ' and beckons'}.`);
        } else {
            await message('"Please follow me."');
        }
    } else {
        if (Deaf(state)) {
            if (!umoney) {
                if (!Blind(state)) {
                    await message(
                        `${noit_Monnam(guard, state)} glares at you${state.invent ? 'r stuff' : ''}.`,
                    );
                }
            }
            if (!Blind(state)) {
                const possessive = noit_mhis(guard, { state });
                await message(
                    `${noit_Monnam(guard, state)} holds out ${possessive} palm and beckons with ${possessive} other hand.`,
                );
            }
        } else {
            if (!umoney) {
                await message('"You have hidden gold."');
            }
            await message(
                '"Most likely all your gold was stolen from this vault."',
            );
            await message('"Please drop that gold and follow me."');
        }
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

// C ref: vault.c paygd() (1204-1247), called before end.c disclosure.
export async function paygd(silently, state = game, rawEnv = {}) {
    const grd = findgd(state);
    const umoney = money_cnt(state.invent);

    if (!umoney || !grd) return;
    const random = rawEnv.random ?? { d, rn1, rn2, rnd, rne };
    const message = rawEnv.message ?? ttyPline;
    const env = objectGenerationEnv({ ...rawEnv, state, random, message });
    let gdx, gdy;
    if (state.u.uinvault) {
        if (!silently) await message(
            `Your ${umoney} ${currency(umoney, state, { random: random.rn2 })} goes into the Magic Memory Vault.`, state);
        gdx = state.u.ux;
        gdy = state.u.uy;
    } else {
        if (grd.mpeaceful) {
            await mongone(grd, env);
            return;
        }
        await mnexto(grd, RLOC_NOMSG, env);
        if (!silently) await message(`${Monnam(grd, state)} remits your gold to the vault.`, state);
        const room = state.level.rooms[EGD(grd).vroom];
        gdx = room.lx + random.rn2(2);
        gdy = room.ly + random.rn2(2);
        const role = pmname(state.mons[state.u.umonster], state.flags.female ? FEMALE : MALE);
        make_grave(gdx, gdy, `To Croesus: here's the gold recovered from ${state.plname} the ${role}.`, env);
    }
    for (let coins = state.invent, nextcoins; coins; coins = nextcoins) {
        nextcoins = coins.nobj;
        if (state.objects[coins.otyp].oc_class === COIN_CLASS) {
            await freeinv(coins, env);
            await place_object(coins, gdx, gdy, env);
            stackobj(coins, env);
        }
    }
    await mongone(grd, env);
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
