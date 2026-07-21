// Room membership bookkeeping.
// C ref: hack.c in_rooms(), move_update(), and the state-update prefix of
// check_special_room().  Entry messages and special-room side effects remain
// with the future complete check_special_room() port.

import { game } from './gstate.js';
import {
    COLNO,
    NO_ROOM,
    ROOMOFFSET,
    ROWNO,
    SHARED,
    SHARED_PLUS,
    SHOPBASE,
} from './const.js';

const ROOM_STRING_SIZE = 5;

function roomString(buffer) {
    const result = [];
    for (let index = 0; index < ROOM_STRING_SIZE; ++index) {
        const room = Math.trunc(buffer?.[index] ?? 0);
        if (!room) break;
        result.push(room);
    }
    return result;
}

function roomBuffer(hero, name) {
    let buffer = hero[name];
    if (!Array.isArray(buffer)) {
        buffer = new Array(ROOM_STRING_SIZE).fill(0);
        hero[name] = buffer;
    } else if (buffer.length !== ROOM_STRING_SIZE) {
        buffer.length = ROOM_STRING_SIZE;
        for (let index = 0; index < ROOM_STRING_SIZE; ++index)
            buffer[index] ??= 0;
    }
    return buffer;
}

// C's strcpy() writes through the first NUL but leaves bytes beyond it alone.
// Preserve that behavior because these arrays model fixed char[5] fields.
function copyRoomString(target, source) {
    const values = roomString(source);
    const count = Math.min(values.length, ROOM_STRING_SIZE - 1);
    for (let index = 0; index < count; ++index)
        target[index] = values[index];
    target[count] = 0;
}

function clearRoomString(target) {
    target.fill(0);
}

function roomHas(buffer, room) {
    return roomString(buffer).includes(room);
}

function roomType(roomno, state) {
    return state.level?.rooms?.[roomno - ROOMOFFSET]?.rtype;
}

function goodRoomType(roomno, typewanted, state) {
    if (!typewanted) return true;
    const found = roomType(roomno, state);
    return found === typewanted
        || (typewanted === SHOPBASE && found > SHOPBASE);
}

/**
 * Return the rooms containing a map coordinate, in hack.c's C-string order.
 *
 * A regular room number is returned directly.  SHARED checks the four
 * diagonal neighbors; SHARED_PLUS checks the complete surrounding square.
 * Source prepends each newly found room to a backwards-growing buffer, so
 * this function deliberately reverses discovery order with unshift().
 */
export function in_rooms(x, y, typewanted = 0, state = game) {
    let rno = state.level?.at(x, y)?.roomno ?? NO_ROOM;
    if (rno === NO_ROOM) return [];

    let step;
    if (rno === SHARED) step = 2;
    else if (rno === SHARED_PLUS) step = 1;
    else return goodRoomType(rno, typewanted, state) ? [rno] : [];

    let minX = x - 1;
    let maxX = x + 1;
    if (x < 1) minX += step;
    else if (x >= COLNO) maxX -= step;

    let minY = y - 1;
    let maxYOffset = 2;
    if (minY < 0) {
        minY += step;
        maxYOffset -= step;
    } else if (minY + maxYOffset >= ROWNO) {
        maxYOffset -= step;
    }

    const result = [];
    for (let xx = minX; xx <= maxX; xx += step) {
        for (let yOffset = 0; yOffset <= maxYOffset; yOffset += step) {
            rno = state.level?.at(xx, minY + yOffset)?.roomno ?? NO_ROOM;
            if (rno >= ROOMOFFSET
                && !result.includes(rno)
                && goodRoomType(rno, typewanted, state)) {
                result.unshift(rno);
            }
        }
    }
    return result;
}

function isShopRoom(roomno, state) {
    return roomType(roomno, state) >= SHOPBASE;
}

/**
 * Update the hero's current, previous, entered, and shop room strings.
 * This is hack.c:move_update(); it intentionally has no messaging or PRNG.
 */
export function move_update(newlev, state = game) {
    const hero = state.u;
    if (!hero) throw new Error('move_update requires initialized hero state');

    const urooms = roomBuffer(hero, 'urooms');
    const urooms0 = roomBuffer(hero, 'urooms0');
    const uentered = roomBuffer(hero, 'uentered');
    const ushops = roomBuffer(hero, 'ushops');
    const ushops0 = roomBuffer(hero, 'ushops0');
    const ushopsEntered = roomBuffer(hero, 'ushops_entered');
    const ushopsLeft = roomBuffer(hero, 'ushops_left');

    copyRoomString(urooms0, urooms);
    copyRoomString(ushops0, ushops);
    if (newlev) {
        clearRoomString(urooms);
        clearRoomString(uentered);
        clearRoomString(ushops);
        clearRoomString(ushopsEntered);
        copyRoomString(ushopsLeft, ushops0);
        return state;
    }

    copyRoomString(urooms, in_rooms(hero.ux, hero.uy, 0, state));

    const entered = [];
    const currentShops = [];
    const enteredShops = [];
    for (const room of roomString(urooms)) {
        if (!roomHas(urooms0, room)) entered.push(room);
        if (isShopRoom(room, state)) {
            currentShops.push(room);
            if (!roomHas(ushops0, room)) enteredShops.push(room);
        }
    }
    copyRoomString(uentered, entered);
    copyRoomString(ushops, currentShops);
    copyRoomString(ushopsEntered, enteredShops);

    const leftShops = roomString(ushops0)
        .filter((room) => !roomHas(ushops, room));
    copyRoomString(ushopsLeft, leftShops);
    return state;
}

// The first operation in check_special_room() is always move_update().  This
// named boundary lets new-game startup initialize room state without implying
// that shop and special-room entry effects have already been ported.
export function check_special_room_state(newlev, state = game) {
    return move_update(newlev, state);
}
