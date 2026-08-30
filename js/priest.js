// Temple, shrine, and priest creation, movement, and queries.
// C ref: priest.c newepri(), priestini(), pri_move(), move_special(),
// mon_aligntyp(), p_coaligned(), temple_occupied(), histemple_at(),
// inhistemple(), has_shrine(), findpriest(), in_your_sanctuary(),
// and intemple().

import {
    A_NONE,
    ACH_TMPL,
    ALL_TRAPS,
    ALLOW_M,
    ALLOW_ROCK,
    AM_SHRINE,
    Amask2align,
    ARTICLE_A,
    ARTICLE_NONE,
    ARTICLE_THE,
    ARTICLE_YOUR,
    DEAF,
    DRY,
    EPRI,
    HALLUC,
    helpless,
    HOT,
    INVIS,
    IS_ALTAR,
    IS_ROOM,
    Is_astralevel,
    MM_EPRI,
    MM_NOMSG,
    N_DIRS,
    NOTONL,
    RLOC_NOMSG,
    ROOMOFFSET,
    SOLID,
    SPINE,
    TEMPLE,
    u_at,
    W_ARMC,
    WET,
    xdir,
    ydir,
} from './const.js';
import { newsym } from './display.js';
import { mon_pmname } from './do_name.js';
import { assign_level, find_mapseen, on_level } from './dungeon.js';
import { game } from './gstate.js';
import { nomul, UnsupportedHeroMoveBoundaryError } from './hack.js';
import { dist2, highc } from './hacklib.js';
import { record_achievement } from './insight.js';
import { makemon } from './makemon_create.js';
import { set_malign } from './makemon.js';
import { m_next2u } from './mhitu.js';
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
import { PM_ALIGNED_CLERIC, PM_GHOST, PM_HIGH_CLERIC, S_EEL } from './monsters.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import { just_an } from './objnam.js';
import { mkobj, SPBOOK_NO_NOVEL } from './obj.js';
import { body_part } from './polyself.js';
import { halu_gname } from './pray.js';
import { is_ok_location } from './room_coordinates.js';
import { in_rooms } from './rooms.js';
import { d, rn1, rn2 } from './rng.js';
import { mpickobj } from './steal.js';
import { ttyPline } from './tty_message.js';
import { canseemon } from './vision.js';
import { rloc } from './teleport.js';
import { which_armor } from './worn.js';

// C ref: priest.c local constants.
const ALGN_SINNED = -4;
const ALGN_DEVOUT = 14;
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

// C ref: priest.c priestname(). Produces the name string for a priest or
// minion monster: "the priest of Shan Lai Ching", "an Angel of Anhur", etc.
export function priestname(mon, article, reveal_high_priest, state = game) {
    const aligned_priest = mon.data === state.mons[PM_ALIGNED_CLERIC];
    const high_priest = mon.data === state.mons[PM_HIGH_CLERIC];
    let what = mon_pmname(mon);

    if (mon.ispriest || aligned_priest || high_priest)
        what = mon.female ? 'priestess' : 'priest';

    let pname = '';
    if (article !== ARTICLE_NONE) {
        let effectiveArticle = article;
        if (effectiveArticle === ARTICLE_YOUR
            || (effectiveArticle === ARTICLE_A && high_priest))
            effectiveArticle = ARTICLE_THE;
        if (effectiveArticle === ARTICLE_THE) {
            pname = 'the ';
        } else if (what === 'Angel') {
            pname = 'an ';
        } else {
            pname = just_an(what);
        }
    }
    if (mon.minvis) {
        if (pname === 'a ') pname = 'an ';
        pname += 'invisible ';
    }
    if (mon.isminion && mon.mextra?.emin?.renegade) {
        if (pname === 'an ' && !mon.minvis) pname = 'a ';
        pname += 'renegade ';
    }

    if (mon.ispriest || aligned_priest) {
        if (high_priest)
            pname += 'high ';
    } else {
        if (mon.mtame && what.toLowerCase() === 'angel')
            pname += 'guardian ';
    }

    pname += what;
    if (!high_priest || reveal_high_priest
        || !Is_astralevel(state.u?.uz)
        || m_next2u(mon, state) || state.program_state?.gameover) {
        pname += ' of ';
        pname += halu_gname(mon_aligntyp(mon), state);
    }
    return pname;
}

// C ref: youprop.h:125 Deaf. HDeaf || EDeaf || u.uroleplay.deaf.
function heroDeaf(state) {
    const prop = state.u?.uprops?.[DEAF];
    return Boolean(prop?.intrinsic || prop?.extrinsic)
        || Boolean(state.u?.uroleplay?.deaf);
}

// C ref: youprop.h:157 Hallucination.
function heroHallucinating(state) {
    const prop = state.u?.uprops?.[HALLUC];
    return Boolean(prop?.intrinsic || prop?.extrinsic) && !prop?.blocked;
}

// C ref: dungeon.c mapseen_temple(). Sets mapseen flags for valley/sanctum.
function mapseen_temple(priest, state) {
    const mptr = find_mapseen(state.u?.uz, state);
    if (!mptr) return;
    if (state.valley_level
        && on_level(state.u.uz, state.valley_level))
        mptr.flags.valley = 1;
    else if (state.sanctum_level
        && on_level(state.u.uz, state.sanctum_level))
        mptr.flags.msanctum = 1;
}

// C ref: priest.c intemple(int roomno). Called when the hero enters a TEMPLE
// room.
export async function intemple(roomno, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    const message = env.message ?? ttyPline;
    const u = state.u;

    if (temple_occupied(u.urooms0, state))
        return;

    const priest = findpriest(roomno, state);
    if (priest) {
        // Tended temple path.
        record_achievement(ACH_TMPL, state);

        const epri_p = EPRI(priest);
        const shrined = has_shrine(priest, state);
        const sanctum = (priest.data === state.mons[PM_HIGH_CLERIC]
            && (state.sanctum_level
                    && on_level(u.uz, state.sanctum_level))
                || (state.astral_level
                    && u.uz?.dnum === state.astral_level.dnum));
        const can_speak = !helpless(priest);
        if (can_speak && !heroDeaf(state)
            && state.moves >= (epri_p.intone_time ?? 0)) {
            const save_priest = priest.ispriest;
            if (sanctum && !heroHallucinating(state))
                priest.ispriest = 0;
            // C: Monnam(priest) = capitalize(mon_nam(priest))
            //    = capitalize(x_monnam(priest, ARTICLE_THE, ...))
            //    = capitalize(priestname(priest, ARTICLE_THE, false))
            const pname = priestname(priest, ARTICLE_THE, false, state);
            const who = canseemon(priest, state)
                ? highc(pname[0]) + pname.slice(1)
                : 'A nearby voice';
            await message(`${who} intones:`, state);
            priest.ispriest = save_priest;
            epri_p.intone_time = state.moves + d(10, 500);
            epri_p.enter_time = 0;
        }
        let msg1 = null;
        let msg2 = null;
        if (sanctum && state.sanctum_level
            && on_level(u.uz, state.sanctum_level)) {
            if (priest.mpeaceful) {
                msg1 = "Infidel, you have entered Moloch's Sanctum!";
                msg2 = 'Be gone!';
                priest.mpeaceful = 0;
                set_malign(priest, state);
            } else {
                msg1 = 'You desecrate this place by your presence!';
            }
        } else if (state.moves >= (epri_p.enter_time ?? 0)) {
            msg1 = `Pilgrim, you enter a ${!shrined ? 'desecrated' : 'sacred'} place!`;
        }
        if (msg1 && can_speak && !heroDeaf(state)) {
            await message(`"${msg1}"`, state);
            if (msg2)
                await message(`"${msg2}"`, state);
            epri_p.enter_time = state.moves + d(10, 100);
        }
        if (!sanctum) {
            let this_time_key, other_time_key;
            let msgFmt, msgArg;
            if (!shrined || !p_coaligned(priest, state)
                || u.ualign.record <= ALGN_SINNED) {
                msgFmt = 'have a%s forbidding feeling...';
                msgArg = (!shrined || !p_coaligned(priest, state))
                    ? '' : ' strange';
                this_time_key = 'hostile_time';
                other_time_key = 'peaceful_time';
            } else {
                msgFmt = 'experience %s sense of peace.';
                msgArg = u.ualign.record >= ALGN_DEVOUT
                    ? 'a' : 'an unusual';
                this_time_key = 'peaceful_time';
                other_time_key = 'hostile_time';
            }
            const this_time = epri_p[this_time_key] ?? 0;
            const other_time = epri_p[other_time_key] ?? 0;
            if (state.moves >= this_time || other_time >= this_time) {
                await message(
                    `You ${msgFmt.replace('%s', msgArg)}`, state,
                );
                const newTime = state.moves + d(10, 20);
                epri_p[this_time_key] = newTime;
                if (newTime <= (epri_p[other_time_key] ?? 0))
                    epri_p[other_time_key] = newTime - 1;
            }
        }
        mapseen_temple(priest, state);
        return;
    }

    // Untended temple path.
    switch (random.rn2(4)) {
    case 0:
        await message('You have an eerie feeling...', state);
        break;
    case 1:
        await message('You feel like you are being watched.', state);
        break;
    case 2:
        await message(
            `A shiver runs down your ${body_part(SPINE, state.youmonst)}.`,
            state,
        );
        break;
    default:
        break;
    }
    if (!random.rn2(5)) {
        const mtmp = makemon(
            state.mons[PM_GHOST], u.ux, u.uy, MM_NOMSG, env,
        );
        if (mtmp) {
            const ngen = state.mvitals[PM_GHOST].born;
            const visible = !mtmp.minvis;
            if (visible) {
                await message(
                    `A${ngen < 5 ? 'n enormous' : ''} ghost appears next to you${ngen < 10 ? '!' : '.'}`,
                    state,
                );
            } else {
                await message('You sense a presence close by!', state);
            }
            mtmp.mpeaceful = 0;
            set_malign(mtmp, state);
            if (state.flags.verbose)
                await message(
                    'You are frightened to death, and unable to move.',
                    state,
                );
            nomul(-3, state);
            state.multi_reason = 'being terrified of a ghost';
            state.nomovemsg = 'You regain your composure.';
        }
    }
}
