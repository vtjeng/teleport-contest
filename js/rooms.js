// Room membership bookkeeping.
// C refs: hack.c in_rooms(), move_update(), and check_special_room().

import { game } from './gstate.js';
// js/hack.js imports this file; both sides use the other's exports only inside
// function bodies, so the cycle resolves.
import {
    furniture_present,
    in_town,
    monstinroom,
    u_locomotion,
} from './hack.js';
import {
    ACH_TOWN,
    ANTHOLE,
    BARRACKS,
    BEEHIVE,
    COCKNEST,
    COLNO,
    COURT,
    DELPHI,
    LEPREHALL,
    MORGUE,
    NO_ROOM,
    OROOM,
    ROOMOFFSET,
    ROWNO,
    SHARED,
    SHARED_PLUS,
    SHOPBASE,
    STEALTH,
    SWAMP,
    TEMPLE,
    THRONE,
    ZOO,
} from './const.js';
import { isok } from './cmd_isok.js';
import { heroIsBlind } from './startup_a11y.js';
import {
    PM_CAPTAIN,
    PM_LIEUTENANT,
    PM_ORACLE,
    PM_SERGEANT,
    PM_SOLDIER,
} from './monsters.js';
import { record_achievement } from './insight.js';
import { wake_msg } from './mon.js';
import { mapseen_room, room_discovered } from './dungeon.js';
import { midnight } from './calendar.js';
import { search_special } from './mkroom.js';
import { rn2 } from './rng.js';
import { Hello } from './role_init.js';
import { u_entered_shop, u_left_shop } from './shk.js';
import { set_voice } from './sounds.js';
import { ttyPline } from './tty_message.js';

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
    return mapseen_room(roomno - ROOMOFFSET, state)?.rtype;
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

// C ref: hack.c check_special_room() (3626-3780). The switch, one-time room
// reset, discovery, and special-room wake scan follow that function's order.
//
// do.c goto_level() calls this twice.  The call at 1615 passes newlev TRUE, for
// which the early return is unconditional because move_update(TRUE) has just
// cleared both u.uentered and u.ushops_entered; the call at 1976 passes FALSE
// and is the one that can announce the room the hero arrived in.
export async function check_special_room(
    newlev,
    state = game,
    { message = ttyPline, random = rn2, canSeeMonster = null } = {},
) {
    move_update(newlev, state);

    // C calls u_left_shop() whenever the previous square belonged to a shop,
    // including an interior-to-boundary step whose leavestring is empty.
    if (roomString(roomBuffer(state.u, 'ushops0')).length)
        await u_left_shop(
            roomBuffer(state.u, 'ushops_left'),
            newlev,
            state,
            { message },
        );

    const achieveo = state.context?.achieveo;
    if (state.level?.flags?.has_town && !achieveo?.minetn_reached
        && state.u.uz.dnum === state.mines_dnum
        && in_town(state.u.ux, state.u.uy, state)) {
        record_achievement(ACH_TOWN, state);
        achieveo.minetn_reached = true;
    }

    const entered = roomString(roomBuffer(state.u, 'uentered'));
    const enteredShops = roomString(roomBuffer(state.u, 'ushops_entered'));
    if (!entered.length && !enteredShops.length)
        return state; /* no entrance messages necessary */

    if (enteredShops.length) {
        await u_entered_shop(enteredShops, state, { message, random });
    }

    for (const roomno of entered) {
        const roomIndex = roomno - ROOMOFFSET;
        // C's svr.rooms[] includes subrooms. Resolve the persisted source
        // pointer once, so the type read and one-time reset share one owner.
        const room = mapseen_room(roomIndex, state);
        const rt = room?.rtype;
        let msgGiven = true;
        let resetType = rt;
        if (rt === ZOO) {
            await message("Welcome to David's treasure zoo!", state);
        } else if (rt === SWAMP) {
            const blind = heroIsBlind(state);
            await message(
                `It ${blind ? 'feels' : 'looks'} rather `
                    + `${blind ? 'humid' : 'muddy'} down here.`,
                state,
            );
        } else if (rt === COURT) {
            const hasThrone = furniture_present(THRONE, roomIndex, state);
            await message(
                `You enter an opulent${hasThrone ? ' throne' : ''} room!`,
                state,
            );
        } else if (rt === LEPREHALL) {
            await message('You enter a leprechaun hall!', state);
        } else if (rt === MORGUE) {
            // C: hack.c:3685-3692. midnight() is evaluated before the
            // locomotion formatter, so the ordinary daytime path has no
            // dependency on the hero's monster form.
            if (midnight(state)) {
                const run = u_locomotion('Run', state);
                await message(`${run} away!  ${run} away!`, state);
            } else {
                await message('You have an uncanny feeling...', state);
            }
        } else if (rt === BEEHIVE) {
            await message('You enter a giant beehive!', state);
        } else if (rt === COCKNEST) {
            await message('You enter a disgusting nest!', state);
        } else if (rt === ANTHOLE) {
            await message('You enter an anthole!', state);
        } else if (rt === BARRACKS) {
            const occupied = [
                PM_SOLDIER,
                PM_SERGEANT,
                PM_LIEUTENANT,
                PM_CAPTAIN,
            ].some((mnum) => monstinroom(
                state.mons?.[mnum],
                roomIndex,
                state,
            ));
            await message(
                occupied
                    ? 'You enter a military barracks!'
                    : 'You enter an abandoned barracks.',
                state,
            );
        } else if (rt === DELPHI) {
            const oracle = monstinroom(
                state.mons?.[PM_ORACLE],
                roomIndex,
                state,
            );
            if (oracle) {
                set_voice(oracle, 0, 80, 0, state);
                await message(
                    oracle.mpeaceful
                        ? `"${Hello(state)}, ${state.plname}, welcome to Delphi!"`
                        : `"You're in Delphi, ${state.plname}."`,
                    state,
                );
            } else {
                msgGiven = false;
            }
        } else if (rt === TEMPLE) {
            // C falls through to default after intemple(): discover the temple
            // but retain its permanent room type.
            const { intemple } = await import('./priest.js');
            await intemple(roomno, { state, random: { rn2: random }, message });
            resetType = 0;
        } else {
            // C's default discovers temples and all shop types; ordinary and
            // themed rooms leave msg_given false and rt zero.
            msgGiven = rt === TEMPLE || rt >= SHOPBASE;
            resetType = 0;
        }

        if (msgGiven) room_discovered(roomIndex, state);

        if (resetType) {
            room.rtype = OROOM;
            if (!search_special(resetType, state)) {
                switch (resetType) {
                case COURT:
                    state.level.flags.has_court = false;
                    break;
                case SWAMP:
                    state.level.flags.has_swamp = false;
                    break;
                case MORGUE:
                    state.level.flags.has_morgue = false;
                    break;
                case ZOO:
                    state.level.flags.has_zoo = false;
                    break;
                case BARRACKS:
                    state.level.flags.has_barracks = false;
                    break;
                case TEMPLE:
                    state.level.flags.has_temple = false;
                    break;
                case BEEHIVE:
                    state.level.flags.has_beehive = false;
                    break;
                default:
                    break;
                }
            }

            if ([COURT, SWAMP, MORGUE, ZOO].includes(resetType)) {
                const stealth = state.u?.uprops?.[STEALTH];
                const stealthy = Boolean(
                    (stealth?.intrinsic || stealth?.extrinsic)
                    && !stealth?.blocked,
                );
                for (let monster = state.level.monlist;
                    monster;
                    monster = monster.nmon) {
                    if ((monster.mhp ?? 0) <= 0) continue;
                    if (!isok(monster.mx, monster.my)) continue;
                    const location = state.level.at(monster.mx, monster.my);
                    // Preserve hack.c's accidental room comparison: the room
                    // array index is compared to levl.roomno with ROOMOFFSET.
                    if (!location || location.roomno !== roomIndex) continue;
                    if (!stealthy && !random(3)) {
                        await wake_msg(monster, false, {
                            state,
                            message,
                            canSeeMonster,
                        });
                        monster.msleeping = false;
                    }
                }
            }
        }
    }

    return state;
}
