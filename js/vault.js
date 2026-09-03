// vault.js -- gold the hero is carrying out of sight, vault occupancy, and the
// end-of-game vault-guard settlement.
// C ref: src/vault.c hidden_gold(), vault_occupied(), findgd(), paygd().

import { ROOMOFFSET, VAULT } from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { money_cnt } from './invent.js';
import { hasContents } from './obj.js';
import { contained_gold } from './shk.js';

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
