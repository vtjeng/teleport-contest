// Temple, shrine, and priest creation, movement, and queries.
// C ref: priest.c newepri(), priestini(), pri_move(), move_special(),
// mon_aligntyp(), p_coaligned(), temple_occupied(), histemple_at(),
// inhistemple(), has_shrine(), findpriest(), and in_your_sanctuary().

import {
    A_NONE,
    ALL_TRAPS,
    ALLOW_M,
    ALLOW_ROCK,
    AM_SHRINE,
    Amask2align,
    DRY,
    HOT,
    INVIS,
    IS_ALTAR,
    IS_ROOM,
    MM_EPRI,
    N_DIRS,
    NOTONL,
    RLOC_NOMSG,
    ROOMOFFSET,
    SOLID,
    TEMPLE,
    u_at,
    W_ARMC,
    WET,
    xdir,
    ydir,
} from './const.js';
import { newsym } from './display.js';
import { assign_level, on_level } from './dungeon.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { makemon } from './makemon_create.js';
import { set_malign } from './makemon.js';
import { mon_allowflags } from './mon.js';
import {
    amphibious,
    is_flyer,
    is_floater,
    is_minion,
    is_rider,
    is_swimmer,
    likes_fire,
    mon_learns_traps,
    noncorporeal,
    passes_walls,
} from './mondata.js';
import { mfndpos } from './monmove.js';
import { PM_ALIGNED_CLERIC, PM_HIGH_CLERIC, S_EEL } from './monsters.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import { mkobj, SPBOOK_NO_NOVEL } from './obj.js';
import { is_ok_location } from './room_coordinates.js';
import { in_rooms } from './rooms.js';
import { rn1, rn2 } from './rng.js';
import { mpickobj } from './steal.js';
import { rloc } from './teleport.js';
import { which_armor } from './worn.js';

// C ref: align.h ALGN_SINNED.
const ALGN_SINNED = -4;
// C ref: you.h `char urooms[5]`.
const ROOM_STRING_SIZE = 5;

// rm.altarmask aliases flags in C. altarmask remains a compatibility input
// for focused fixtures and older persisted state.
function altarMask(location) {
    return location?.altarmask ?? location?.flags ?? 0;
}

// C ref: priest.c mon_aligntyp().
export function mon_aligntyp(monster) {
    let alignment = monster.ispriest
        ? monster.mextra?.epri?.shralign
        : monster.isminion
            ? monster.mextra?.emin?.min_align
            : monster.data?.maligntyp;
    if (alignment === A_NONE) return A_NONE;
    alignment = Math.sign(alignment ?? 0);
    return alignment;
}

// C ref: priest.c temple_occupied().
export function temple_occupied(roomBuffer, state) {
    for (let index = 0; index < ROOM_STRING_SIZE; ++index) {
        const roomNumber = Math.trunc(roomBuffer?.[index] ?? 0);
        if (!roomNumber) break;
        if (state.level?.rooms?.[roomNumber - ROOMOFFSET]?.rtype === TEMPLE)
            return roomNumber;
    }
    return 0;
}

// C ref: priest.c histemple_at().
export function histemple_at(priest, x, y, state) {
    const extension = priest?.mextra?.epri;
    return Boolean(priest?.ispriest
        && extension
        && extension.shroom === (in_rooms(x, y, TEMPLE, state)[0] ?? 0)
        && on_level(extension.shrlevel, state.u?.uz));
}

// C ref: priest.c inhistemple().
export function inhistemple(priest, state) {
    return Boolean(priest?.ispriest
        && histemple_at(priest, priest.mx, priest.my, state)
        && has_shrine(priest, state));
}

// C ref: priest.c has_shrine().
export function has_shrine(priest, state) {
    if (!priest?.ispriest) return false;
    const extension = priest.mextra?.epri;
    const location = state.level?.at(
        extension?.shrpos?.x,
        extension?.shrpos?.y,
    );
    const mask = altarMask(location);
    return IS_ALTAR(location?.typ)
        && Boolean(mask & AM_SHRINE)
        && extension.shralign === Amask2align(mask & ~AM_SHRINE);
}

// C ref: priest.c findpriest().
export function findpriest(roomNumber, state) {
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1) continue;
        if (monster.ispriest
            && monster.mextra?.epri?.shroom === roomNumber
            && histemple_at(monster, monster.mx, monster.my, state)) {
            return monster;
        }
    }
    return null;
}

// C ref: priest.c in_your_sanctuary().
export function in_your_sanctuary(
    monster,
    x = 0,
    y = 0,
    state = game,
) {
    if (monster) {
        if (is_minion(monster.data) || is_rider(monster.data)) return false;
        x = monster.mx;
        y = monster.my;
    }
    if (state.u?.ualign?.record <= ALGN_SINNED) return false;
    const roomNumber = temple_occupied(state.u?.urooms, state);
    if (!roomNumber
        || roomNumber !== (in_rooms(x, y, TEMPLE, state)[0] ?? 0)) {
        return false;
    }
    const priest = findpriest(roomNumber, state);
    return Boolean(priest
        && has_shrine(priest, state)
        && mon_aligntyp(priest) === state.u?.ualign?.type
        && priest.mpeaceful);
}

// C ref: priest.c newepri(). Allocates the priest extension on a monster.
export function newepri(monster) {
    monster.mextra ??= {};
    monster.mextra.epri ??= {
        parentmid: monster.m_id ?? 0,
        shroom: 0,
        shralign: 0,
        shrpos: { x: 0, y: 0 },
        shrlevel: { dnum: 0, dlevel: 0 },
    };
}

// C ref: priest.c p_coaligned(). True when the hero's alignment matches the
// priest's alignment (read from the shrine, not from the species).
export function p_coaligned(priest, state = game) {
    return state.u?.ualign?.type === mon_aligntyp(priest);
}

// C ref: sp_lev.c pm_to_humidity(). Maps a permonst's movement capabilities
// to the DRY/WET/HOT/SOLID humidity flags is_ok_location() checks.
function pm_to_humidity(pm) {
    let loc = DRY;
    if (!pm) return loc;
    if (pm.mlet === S_EEL || amphibious(pm) || is_swimmer(pm))
        loc = WET;
    if (is_flyer(pm) || is_floater(pm))
        loc |= HOT | WET;
    if (passes_walls(pm) || noncorporeal(pm))
        loc |= SOLID;
    if (likes_fire(pm))
        loc |= HOT;
    return loc;
}

// C ref: sp_lev.c pm_good_location(). True when a species can stand on the
// given map cell -- delegates to is_ok_location with the species' humidity.
function pm_good_location(x, y, pm, env = {}) {
    return is_ok_location(x, y, pm_to_humidity(pm), env);
}

// C ref: priest.c priestini(). Places an aligned priest or high cleric next
// to a shrine altar. Called exclusively from mktemple() during level creation.
export function priestini(lvl, sroom, sx, sy, sanctum, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn1, rn2 };

    const prim = state.mons[sanctum ? PM_HIGH_CLERIC : PM_ALIGNED_CLERIC];
    let px = 0;
    let py = 0;
    const si = random.rn2(N_DIRS);
    let i;
    for (i = 0; i < N_DIRS; i++) {
        // C uses DIR_CLAMP which is `(dir + N_DIRS) % N_DIRS`.
        const dir = (i + si + N_DIRS) % N_DIRS;
        px = sx + xdir[dir];
        py = sy + ydir[dir];
        if (pm_good_location(px, py, prim, env))
            break;
    }
    if (i === N_DIRS) {
        px = sx;
        py = sy;
    }

    // Relocate any monster already at the chosen position.
    const blocker = m_at(px, py, state);
    if (blocker) rloc(blocker, RLOC_NOMSG, env);

    const priest = makemon(prim, px, py, MM_EPRI, env);
    if (!priest) return;

    const epri = priest.mextra.epri;
    epri.shroom = (state.level.rooms.indexOf(sroom) + ROOMOFFSET);
    epri.shralign = Amask2align(state.level.at(sx, sy).altarmask);
    epri.shrpos = { x: sx, y: sy };
    assign_level(epri.shrlevel, lvl);
    mon_learns_traps(priest, ALL_TRAPS);
    priest.mpeaceful = true;
    priest.ispriest = true;
    priest.isminion = false;
    priest.msleeping = false;
    set_malign(priest, state);

    // Sanctum high priest carries the Amulet of Yendor.  This path is not
    // exercised by ordinary temple generation, so it remains unported.

    // 2 to 4 spellbooks.
    for (let cnt = random.rn1(3, 2); cnt > 0; --cnt) {
        mpickobj(priest, mkobj(SPBOOK_NO_NOVEL, false, env), env);
    }

    // Robe blessing/cursing: the robe is given by makemon via m_initweapon.
    if (random.rn2(2)) {
        const otmp = which_armor(priest, W_ARMC, state);
        if (otmp) {
            if (p_coaligned(priest, state)) {
                otmp.cursed = false;
            } else {
                otmp.blessed = false;
                otmp.cursed = true;
            }
        }
    }
}

// C ref: hacklib.c online2(). True when (x0,y0) and (x1,y1) lie on a
// cardinal or diagonal line through each other.
function online2(x0, y0, x1, y1) {
    const dx = x0 - x1;
    const dy = y0 - y1;
    return !dy || !dx || dy === dx || dy === -dx;
}

// C ref: hack.h onlineu().
function onlineu(xx, yy, state) {
    return online2(xx, yy, state.u.ux, state.u.uy);
}

// C ref: priest.c move_special(). Handles pathfinding for priests (and
// shopkeepers in C, but only priests use this JS port). Returns 1 (moved),
// 0 (didn't move), or -2 (died during aggression).
function move_special(
    mtmp, inHisShop, appr, uondoor, avoid,
    omx, omy, ggx, ggy, env = {},
) {
    const state = env.state ?? game;

    if (omx === ggx && omy === ggy) return 0;
    if (mtmp.mconf) {
        avoid = false;
        appr = 0;
    }

    let nix = omx;
    let niy = omy;
    const allowflags = mon_allowflags(mtmp, env);
    const data = { poss: [], info: [], cnt: 0 };
    const cnt = mfndpos(mtmp, data, allowflags, env);

    // The isshk-specific avoid-uondoor loop does not apply to priests.

    let chcnt = 0;
    let ninfo = 0;
    const gdist = (x, y) => dist2(x, y, ggx, ggy);
    let retry = false;

    do {
        chcnt = 0;
        for (let i = 0; i < cnt; i++) {
            const nx = data.poss[i].x;
            const ny = data.poss[i].y;
            // For priests, only consider room squares (IS_ROOM). The
            // isshk-specific check for following-outside-shop is omitted.
            if (IS_ROOM(state.level.at(nx, ny).typ)) {
                if (avoid && (data.info[i] & NOTONL)
                    && !(data.info[i] & ALLOW_M))
                    continue;
                if ((!appr && !(env.random ?? { rn2 }).rn2(++chcnt))
                    || (appr && gdist(nx, ny) < gdist(nix, niy))
                    || (data.info[i] & ALLOW_M)) {
                    nix = nx;
                    niy = ny;
                    ninfo = data.info[i];
                }
            }
        }
        // C: if priest, avoid, and did not find a move, and hero is on the
        // same line, disable avoid and retry.
        if (mtmp.ispriest && avoid && nix === omx && niy === omy
            && onlineu(omx, omy, state) && !retry) {
            avoid = false;
            retry = true;
        } else {
            break;
        }
    } while (true);

    if (nix !== omx || niy !== omy) {
        if (ninfo & ALLOW_ROCK) {
            // Boulder breaking by a priest is extremely rare; refuse it.
            throw new Error('move_special: priest boulder breaking unported');
        }
        if (ninfo & ALLOW_M) {
            // Monster aggression during special movement is unported.
            throw new Error('move_special: aggression unported');
        }

        if (m_at(nix, niy, state) || u_at(nix, niy, state))
            return 0;
        remove_monster(omx, omy, state);
        place_monster(mtmp, nix, niy, state);
        newsym(nix, niy);
        return 1;
    }
    return 0;
}

// C ref: priest.c pri_move(). Returns 1 (moved), 0 (didn't), -1 (let
// m_move do it), or -2 (died). Called from m_move() for ispriest monsters.
export function pri_move(priest, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn1, rn2 };

    const omx = priest.mx;
    const omy = priest.my;

    if (!histemple_at(priest, omx, omy, state))
        return -1;

    const temple = priest.mextra.epri.shroom;

    let ggx = priest.mextra.epri.shrpos.x;
    let ggy = priest.mextra.epri.shrpos.y;

    // Mill around the altar.
    ggx += random.rn1(3, -1);
    ggy += random.rn1(3, -1);

    let avoid = true;

    // A hostile priest (or one under Conflict) attacks the hero if near.
    // A peaceful priest not under Conflict simply avoids.
    // Conflict and Displaced properties are not yet fully ported; the common
    // case is a peaceful priest, so we take that branch directly.
    if (!priest.mpeaceful) {
        // Non-peaceful priest handling is not fully ported (mattacku,
        // Displaced message). Throw on it.
        throw new Error('pri_move: hostile priest actions unported');
    }
    // C: `else if (Invis) avoid = FALSE;` -- Invis is the hero's invisibility
    // from uprops[INVIS] (intrinsic or extrinsic, minus blocked).
    const invisProp = state.u?.uprops?.[INVIS];
    if ((invisProp?.intrinsic || invisProp?.extrinsic) && !invisProp?.blocked)
        avoid = false;

    return move_special(
        priest, false, 1, false, avoid,
        omx, omy, ggx, ggy, env,
    );
}
