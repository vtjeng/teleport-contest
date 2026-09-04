// vault.js -- gold the hero is carrying out of sight, vault occupancy, guard
// entry, and the end-of-game vault-guard settlement.
// C ref: src/vault.c hidden_gold(), vault_occupied(), findgd(), newegd(),
// in_fcorridor(), find_guard_dest(), invault(), paygd().

import {
    A_LAWFUL,
    BLCORNER,
    BLINDED,
    BRCORNER,
    COLNO,
    CORR,
    D_NODOOR,
    DEAF,
    DOOR,
    EGD,
    FCSIZ,
    HWALL,
    IS_WALL,
    M_AP_OBJECT,
    MELT_ICE_AWAY,
    MM_EGD,
    MM_NOMSG,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    STONE,
    STRANGLED,
    TLCORNER,
    TRCORNER,
    VAULT,
    VAULT_GUARD_TIME,
    VWALL,
} from './const.js';
import { map_invisible, newsym, xy_set_wall_state } from './display.js';
import { assign_level, on_level } from './dungeon.js';
import { mungspaces } from './fruit.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { money_cnt } from './invent.js';
import { set_malign } from './makemon.js';
import { gender } from './mondata.js';
import { is_silent } from './mondata.js';
import { PM_GUARD } from './monsters.js';
import { pmname } from './do_name.js';
import { makeplural } from './fruit.js';
import { adjalign } from './attrib.js';
import { sobj_at, hasContents } from './obj.js';
import { BOULDER } from './objects.js';
import { contained_gold } from './shk.js';
import { spot_stop_timers } from './timeout.js';
import { canseemon, unblock_point } from './vision.js';
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
