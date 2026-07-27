// Temple, shrine, and priest queries.
// C ref: priest.c mon_aligntyp(), temple_occupied(), histemple_at(),
// inhistemple(), has_shrine(), findpriest(), and in_your_sanctuary().

import {
    A_NONE,
    AM_SHRINE,
    Amask2align,
    IS_ALTAR,
    ROOMOFFSET,
    TEMPLE,
} from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { is_minion, is_rider } from './mondata.js';
import { in_rooms } from './rooms.js';

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
