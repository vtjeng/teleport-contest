// Ambient level sounds.
// C ref: sounds.c dosounds().

import {
    DEAF,
    HALLUC,
    HALLUC_RES,
    ROOMOFFSET,
    VAULT,
} from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { g_at } from './obj.js';
import { rn2 } from './rng.js';
import { ttyPline } from './tty_message.js';

const FOUNTAIN_MESSAGES = Object.freeze([
    'bubbling water.',
    'water falling on coins.',
    'the splashing of a naiad.',
    'a soda fountain!',
]);

const SINK_MESSAGES = Object.freeze([
    'a slow drip.',
    'a gurgling noise.',
    'dishes being washed!',
]);

const PRE_VAULT_SPECIAL_SOUND_FLAGS = Object.freeze([
    'has_court',
    'has_swamp',
]);

const POST_VAULT_SPECIAL_SOUND_FLAGS = Object.freeze([
    'has_beehive',
    'has_morgue',
    'has_barracks',
    'has_zoo',
    'has_shop',
    'has_temple',
]);

function propertyActive(hero, propertyIndex) {
    const property = hero?.uprops?.[propertyIndex];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function hallucinating(hero) {
    return propertyActive(hero, HALLUC)
        && !propertyActive(hero, HALLUC_RES);
}

function roomStringContainsType(buffer, roomType, state) {
    for (const rawRoomNumber of buffer ?? []) {
        const roomNumber = Math.trunc(rawRoomNumber ?? 0);
        if (!roomNumber) break;
        if (state.level?.rooms?.[roomNumber - ROOMOFFSET]?.rtype === roomType)
            return roomNumber;
    }
    return 0;
}

function searchSpecial(roomType, state) {
    // C's search_special() scans its main-room array and separate subroom
    // array. mklev.js preserves that split as level.rooms and root subrooms.
    for (const room of state.level?.rooms ?? []) {
        if (!room || room.hx < 0) break;
        if (room.rtype === roomType) return room;
    }
    for (const room of state.subrooms ?? []) {
        if (!room || room.hx < 0) break;
        if (room.rtype === roomType) return room;
    }
    return null;
}

function vaultGuardPresent(state) {
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (!monster.isgd) continue;
        const guardLevel = monster.mextra?.egd?.gdlevel;
        if (!guardLevel || on_level(guardLevel, state.u?.uz)) return true;
    }
    return false;
}

function vaultSoundAllowed(state) {
    return !roomStringContainsType(state.u?.urooms, VAULT, state)
        && !vaultGuardPresent(state);
}

function vaultContainsGold(room, state) {
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            if (g_at(x, y, state)) return true;
        }
    }
    return false;
}

function rejectUnportedSpecialSound(state, flagNames) {
    const flags = state.level?.flags ?? {};
    const laterFlag = flagNames.find((name) => flags[name]);
    if (laterFlag) {
        throw new Error(
            'dosounds initial-level slice reached an unported later-level '
                + `branch (${laterFlag})`,
        );
    }
}

function rejectUnportedOracleSound(state) {
    if (on_level(state.u?.uz, state.oracle_level)) {
        throw new Error(
            'dosounds initial-level slice reached an unported later-level '
                + 'branch (Oracle)',
        );
    }
}

async function hear(message, state, pline) {
    await pline(`You hear ${message}`, state);
}

/**
 * Run every sounds.c:dosounds() branch reachable on an ordinary initial level.
 *
 * Fountain, sink, and secret-vault behavior is complete.  Special rooms which
 * require a deeper level, plus the Oracle level, are rejected before any draw
 * until their owning gameplay milestones make them reachable.
 */
export async function dosoundsInitialLevel(
    state = game,
    { random = rn2, pline = ttyPline } = {},
) {
    const hero = state.u;
    const flags = state.level?.flags ?? {};
    const deaf = propertyActive(hero, DEAF) || hero?.uroleplay?.deaf;
    if (deaf || state.flags?.acoustics === false
        || hero?.uswallow || hero?.uinwater) {
        return;
    }

    const hallu = hallucinating(hero) ? 1 : 0;

    if (flags.nfountains && random(400) === 0) {
        await hear(FOUNTAIN_MESSAGES[random(3) + hallu], state, pline);
    }
    if (flags.nsinks && random(300) === 0) {
        await hear(SINK_MESSAGES[random(2) + hallu], state, pline);
    }
    // Stop at the first unowned source branch, after all earlier owned work.
    rejectUnportedSpecialSound(state, PRE_VAULT_SPECIAL_SOUND_FLAGS);
    if (flags.has_vault && random(200) === 0) {
        const room = searchSpecial(VAULT, state);
        if (!room) {
            flags.has_vault = false;
            return;
        }
        if (vaultSoundAllowed(state)) {
            const selection = random(2) + hallu;
            if (selection === 1
                && !roomStringContainsType(hero?.urooms, VAULT, state)) {
                if (vaultContainsGold(room, state)) {
                    await hear(
                        hallu
                            ? 'the quarterback calling the play.'
                            : 'someone counting gold coins.',
                        state,
                        pline,
                    );
                } else {
                    await hear('someone searching.', state, pline);
                }
            } else if (selection === 2) {
                await hear('Ebenezer Scrooge!', state, pline);
            } else {
                await hear(
                    'the footsteps of a guard on patrol.',
                    state,
                    pline,
                );
            }
        }
        // sounds.c returns after every taken vault gate, including when a
        // guard or the hero's room suppresses its selection draw.
        return;
    }
    rejectUnportedSpecialSound(state, POST_VAULT_SPECIAL_SOUND_FLAGS);
    rejectUnportedOracleSound(state);
}
