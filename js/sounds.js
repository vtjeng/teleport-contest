// Ambient level sounds and the #chat command.
// C refs: sounds.c dosounds(), dotalk(), dochat().

import {
    BLINDED,
    DEAF,
    ECMD_CANCEL,
    ECMD_OK,
    FEMALE,
    HALLUC,
    HALLUC_RES,
    IS_WALL,
    MALE,
    ROOMOFFSET,
    SDOOR,
    STONE,
    STRANGLED,
    VAULT,
    isok,
} from './const.js';
import { getdir } from './cmd.js';
import { vobj_at } from './display.js';
import { pmname, rndmonnam } from './do_name.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { is_silent } from './mondata.js';
import { m_at } from './monst.js';
import { g_at } from './obj.js';
import { an } from './objnam.js';
import { STATUE } from './objects.js';
import { rn2 } from './rng.js';
import { shop_object } from './shk.js';
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

// C ref: youprop.h:120 Hallucination, over :116-119. HHallucination is the
// intrinsic alone -- no worn item confers hallucination -- while
// Halluc_resistance adds the extrinsic to it.
function Hallucination(state) {
    return Boolean(state.u?.uprops?.[HALLUC]?.intrinsic)
        && !propertyActive(state.u, HALLUC_RES);
}

// C ref: youprop.h:125 Deaf, which adds the permanent-deafness roleplay option
// to the intrinsic and the extrinsic.
function Deaf(state) {
    return propertyActive(state.u, DEAF)
        || Boolean(state.u?.uroleplay?.deaf);
}

// C ref: youprop.h:103 Blind. Blindness subtracts a blocking term the other
// properties here do not have.
function Blind(state) {
    const blinded = state.u?.uprops?.[BLINDED];
    return Boolean(blinded?.intrinsic || blinded?.extrinsic)
        && !blinded?.blocked;
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
 * until their owning gameplay goals make them reachable.
 */
export async function dosoundsInitialLevel(
    state = game,
    { random = rn2, pline = ttyPline } = {},
) {
    const hero = state.u;
    const flags = state.level?.flags ?? {};
    if (Deaf(state) || state.flags?.acoustics === false
        || hero?.uswallow || hero?.uinwater) {
        return;
    }

    const hallu = Hallucination(state) ? 1 : 0;

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

export class UnsupportedChatError extends Error {
    constructor(reason) {
        super(`#chat needs ${reason}`);
        this.name = 'UnsupportedChatError';
    }
}

// C ref: sounds.c:1355-1362, the eight replies a hallucinating hero hears out
// of a wall. sounds.c:1364-1367 draws rn2(10) and clamps it to the last slot,
// so that reply answers three times as often as the others.
const WALLTALK = Object.freeze([
    'gripes about its job.',
    'tells you a funny joke!',
    'insults your heritage!',
    'chuckles.',
    'guffaws merrily!',
    'deprecates your exploration efforts.',
    'suggests a stint of rehab...',
    "doesn't seem to be interested.",
]);

/**
 * C ref: sounds.c dochat() (1256-1409), every arm that returns before the two
 * calls this goal leaves for later: price_quote() at :1288 and domonnoise() at
 * :1302 and :1408.
 *
 * Every ported arm answers ECMD_OK or ECMD_CANCEL, so #chat spends no move,
 * and only the hallucinating wall reply draws a random number.
 */
async function dochat(state) {
    const u = state.u;

    if (is_silent(state.youmonst.data)) {
        await ttyPline(
            `As ${an(pmname(state.youmonst.data,
                           state.flags.female ? FEMALE : MALE))}, `
            + 'you cannot speak.',
            state,
        );
        return ECMD_OK;
    }
    if (u.uprops[STRANGLED].intrinsic) { /* youprop.h:110 Strangled */
        await ttyPline("You can't speak.  You're choking!", state);
        return ECMD_OK;
    }
    if (u.uswallow) {
        await ttyPline("They won't hear you out there.", state);
        return ECMD_OK;
    }
    if (u.uinwater) { /* youprop.h:279 Underwater */
        await ttyPline('Your speech is unintelligible underwater.', state);
        return ECMD_OK;
    }
    if (!Deaf(state) && !Blind(state) && shop_object(u.ux, u.uy, state)) {
        /* standing on something in a shop and chatting causes the shopkeeper
           to describe the price(s) */
        throw new UnsupportedChatError('price_quote() for shop merchandise');
    }

    if (!await getdir('Talk to whom? (in what direction)', state)) {
        /* decided not to chat */
        return ECMD_CANCEL;
    }

    if (u.usteed && u.dz > 0) {
        throw new UnsupportedChatError('a chat aimed down at a steed');
    }

    if (u.dz) {
        await ttyPline(
            `They won't hear you ${u.dz < 0 ? 'up' : 'down'} there.`,
            state,
        );
        return ECMD_OK;
    }

    if (u.dx === 0 && u.dy === 0) {
        await ttyPline(
            'Talking to yourself is a bad habit for a dungeoneer.',
            state,
        );
        return ECMD_OK;
    }

    const tx = u.ux + u.dx;
    const ty = u.uy + u.dy;

    if (!isok(tx, ty))
        return ECMD_OK;

    const mtmp = m_at(tx, ty, state);

    if (!mtmp || mtmp.mundetected) {
        const otmp = vobj_at(tx, ty, state);
        if (otmp && otmp.otyp === STATUE) {
            /* Talking to a statue */
            if (!Blind(state)) {
                await ttyPline(
                    /* if hallucinating, you can't tell it's a statue */
                    `The ${Hallucination(state) ? rndmonnam({ state })
                        : 'statue'} seems not to notice you.`,
                    state,
                );
            }
            return ECMD_OK;
        }
        const typ = state.level.at(tx, ty).typ;
        if (!Deaf(state) && (IS_WALL(typ) || typ === SDOOR)) {
            /* Talking to a wall; secret door remains hidden by behaving
               like a wall; IS_WALL() test excludes solid rock even when
               that serves as a wall bordering a corridor */
            if (Blind(state)
                && !IS_WALL(state.level.lastseentyp?.[tx]?.[ty] ?? STONE)) {
                /* when blind, you can only talk to a wall if it has
                   already been mapped as a wall */
                /* (C's empty statement: the arm prints nothing) */
            } else if (!Hallucination(state)) {
                await ttyPline("It's like talking to a wall.", state);
            } else {
                let idx = rn2(10);

                if (idx >= WALLTALK.length)
                    idx = WALLTALK.length - 1;
                await ttyPline(`The wall ${WALLTALK[idx]}`, state);
            }
            return ECMD_OK;
        }
    }

    // sounds.c:1374-1377 answers ECMD_OK for an empty square and for a monster
    // the hero has not detected, which is where this port stops: every arm
    // below it needs the monster naming and mimic-appearance reads that lead
    // into domonnoise().
    if (!mtmp || mtmp.mundetected)
        return ECMD_OK;
    throw new UnsupportedChatError('a monster occupying the target square');
}

// C ref: sounds.c dotalk() (1247-1254), the #chat command.
export async function dotalk(state = game) {
    return dochat(state);
}
