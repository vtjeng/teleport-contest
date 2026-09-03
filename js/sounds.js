// Ambient level sounds and the #chat command.
// C refs: sounds.c dosounds(), dotalk(), dochat().

import {
    ANY_SHOP,
    BARRACKS,
    BLINDED,
    COURT,
    DEAF,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    EPRI,
    FEMALE,
    HALLUC,
    HALLUC_RES,
    IS_WALL,
    Is_astralevel,
    MALE,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPE,
    MS_ANIMAL,
    MS_BARK,
    MS_BELLOW,
    MS_BUZZ,
    MS_GROAN,
    MS_GROWL,
    MS_HISS,
    MS_MEW,
    MS_MOO,
    MS_NEIGH,
    MS_ROAR,
    MS_SILENT,
    MS_SQAWK,
    MS_SQEEK,
    MS_WAIL,
    ROOMOFFSET,
    SDOOR,
    STONE,
    STRANGLED,
    STRAT_WAITMASK,
    VAULT,
    WINTYPELEN,
    ZOO,
    helpless,
    isok,
} from './const.js';
import { getdir } from './cmd.js';
import { map_invisible, vobj_at } from './display.js';
import {
    capitalizedMonsterName,
    monsterCommonName,
    pmname,
    rndmonnam,
} from './do_name.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { search_special } from './mkroom.js';
import { get_iter_mons, wake_nearto } from './mon.js';
import {
    humanoid,
    is_animal,
    is_lord,
    is_mercenary,
    is_prince,
    is_silent,
} from './mondata.js';
import { MS_LEADER, PM_ORACLE } from './monsters.js';
import { m_at } from './monst.js';
import { g_at } from './obj.js';
import { an, vtense } from './objnam.js';
import { STATUE } from './objects.js';
import { halu_gname } from './pray.js';
import { quest_chat } from './quest.js';
import { inhistemple, temple_occupied } from './priest.js';
import { rn2 } from './rng.js';
import { genders } from './roles.js';
import { canSeeMonster, canSpotMonster } from './startup_a11y.js';
import { noisy_shop, shop_object, tended_shop } from './shk.js';
import { ttyPline } from './tty_message.js';
import { cansee, canseemon } from './vision.js';

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
    'has_swamp',
]);

// C's dosounds() checks special-room flags in this order after the vault:
// beehive, morgue, barracks, zoo, shop, temple. The shop and zoo branches are
// ported; the remaining special-room branches are rejected before their gate
// draws.
const PRE_SHOP_SPECIAL_SOUND_FLAGS = Object.freeze([
    'has_beehive',
    'has_morgue',
]);

const POST_SHOP_SPECIAL_SOUND_FLAGS = Object.freeze([
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

// C ref: strchr(u.ushops, roomno). Checks whether a 0-terminated room-number
// buffer contains a specific room number.
function roomStringContainsValue(buffer, value) {
    for (const raw of buffer ?? []) {
        const entry = Math.trunc(raw ?? 0);
        if (!entry) break;
        if (entry === value) return true;
    }
    return false;
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

// C ref: sounds.c:20-26 mon_in_room(). A monster is in a room only when its
// map location carries a real room number whose room type matches the query;
// room edges and corridors therefore do not count.
function mon_in_room(monster, roomType, state) {
    const roomno = state.level?.at(monster.mx, monster.my)?.roomno ?? 0;
    return roomno >= ROOMOFFSET
        && state.level?.rooms?.[roomno - ROOMOFFSET]?.rtype === roomType;
}

// C ref: sounds.c:115-129 zoo_mon_sound(). The callback's selection draw is
// made only after get_iter_mons() finds the first live qualifying monster.
async function zoo_mon_sound(_monster, state, hallu, { random, pline }) {
    const selection = random(2) + hallu;
    const zooMessages = [
        'a sound reminiscent of an elephant stepping on a peanut.',
        'a sound reminiscent of a seal barking.',
        'Doctor Dolittle!',
    ];
    await hear(zooMessages[selection], state, pline);
    return true;
}

function zoo_mon_sound_qualifies(monster, state) {
    return (monster.msleeping || is_animal(monster.data))
        && mon_in_room(monster, ZOO, state);
}

// C ref: sounds.c:29-61 throne_mon_sound(). The room gate is the callback's
// responsibility, so get_iter_mons() can continue to the next sound branch
// when a court exists but has no eligible living monster.
async function throneMonSound(_monster, state, hallu, { random, pline }) {
    const selection = random(3) + hallu;
    const messages = [
        'the tones of courtly conversation.',
        'a sceptre pounded in judgment.',
        null,
        "Queen Beruthiel's cats!",
    ];
    if (selection === 2) {
        const gender = genders[state.flags?.female ? 1 : 0];
        await pline(
            `Someone shouts "Off with ${gender?.his ?? 'his'} head!"`,
            state,
        );
    } else {
        await hear(messages[selection], state, pline);
    }
    return true;
}

function throneMonSoundQualifies(monster, state) {
    return (monster.msleeping
        || is_lord(monster.data)
        || is_prince(monster.data))
        && !is_animal(monster.data)
        && mon_in_room(monster, COURT, state);
}

const BARRACKS_MESSAGES = Object.freeze([
    'blades being honed.',
    'loud snoring.',
    'dice being thrown.',
    'General MacArthur!',
]);

// C ref: sounds.c:280-305 barracks ambient sound. The sixth awake
// mercenary is enough; sleeping mercenaries qualify immediately.
async function barracksMonSound(state, hallu, { random, pline }) {
    let awakeMercenaries = 0;
    const monster = get_iter_mons((candidate) => {
        if (!is_mercenary(candidate.data)
            || !mon_in_room(candidate, BARRACKS, state)) return false;
        return candidate.msleeping || ++awakeMercenaries > 5;
    }, state);
    if (!monster) return false;
    await hear(BARRACKS_MESSAGES[random(3) + hallu], state, pline);
    return true;
}

// A sounds.c dosounds() branch this port cannot run yet. dosounds() runs once
// per turn from allmain.c moveloop_core(), so the refusal has to end the
// segment on its last matching screen rather than crash the caller.
export class UnsupportedAmbientSoundError extends Error {
    constructor(reason) {
        super(`dosounds() needs ${reason}`);
        this.name = 'UnsupportedAmbientSoundError';
    }
}

function rejectUnportedSpecialSound(state, flagNames) {
    const flags = state.level?.flags ?? {};
    const laterFlag = flagNames.find((name) => flags[name]);
    if (laterFlag) {
        throw new UnsupportedAmbientSoundError(
            `the ${laterFlag} level-sound branch`,
        );
    }
}


async function hear(message, state, pline) {
    await pline(`You hear ${message}`, state);
}

const TEMPLE_MESSAGES = Object.freeze([
    '*someone praising %s.',
    '*someone beseeching %s.',
    '#an animal carcass being offered in sacrifice.',
    '*a strident plea for donations.',
]);

// C ref: sounds.c:131-178 temple_priest_sound(). Iterates monlist for a
// priest inside their own temple while the hero is outside it.
async function templePriestSound(state, hallu, { random, pline }) {
    for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
        if (!mtmp.ispriest || !inhistemple(mtmp, state)
            || helpless(mtmp)
            || temple_occupied(state.u?.urooms, state) === EPRI(mtmp)?.shroom)
            continue;
        const epri = EPRI(mtmp);
        const ax = epri.shrpos.x;
        const ay = epri.shrpos.y;
        const speechless = (mtmp.data?.msound ?? 0) <= MS_ANIMAL;
        const in_sight = canseemon(mtmp, state) || cansee(ax, ay, state);
        let msg;
        let trycount = 0;
        do {
            msg = TEMPLE_MESSAGES[random(TEMPLE_MESSAGES.length - 1 + hallu)];
            if (msg.includes('*') && speechless) continue;
            if (msg.includes('#') && in_sight) continue;
            break;
        } while (++trycount < 50);
        const text = msg.replace(/^[*#]+/, '');
        if (text.includes('%s')) {
            await hear(
                text.replace('%s', halu_gname(epri.shralign, state)),
                state, pline,
            );
        } else {
            await hear(text, state, pline);
        }
        return true;
    }
    return false;
}

/**
 * Run every sounds.c:dosounds() branch reachable on an ordinary initial level.
 *
 * Fountain, sink, court, secret-vault, and shop behavior is complete. Special
 * rooms which require a deeper level, plus the Oracle level, are rejected
 * before their owning gameplay goals make them reachable.
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
    // C ref: sounds.c:226-229. If the gate fires but no court monster
    // qualifies, dosounds() continues to the swamp branch.
    if (flags.has_court && random(200) === 0) {
        const monster = get_iter_mons(
            (candidate) => throneMonSoundQualifies(candidate, state),
            state,
        );
        if (monster) {
            await throneMonSound(monster, state, hallu, { random, pline });
            return;
        }
    }
    // Stop at the first unowned source branch, after all earlier work.
    rejectUnportedSpecialSound(state, PRE_VAULT_SPECIAL_SOUND_FLAGS);
    if (flags.has_vault && random(200) === 0) {
        const room = search_special(VAULT, state);
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
    rejectUnportedSpecialSound(state, PRE_SHOP_SPECIAL_SOUND_FLAGS);
    // C ref: sounds.c:280-305. If the barracks gate fires but fewer than six
    // awake mercenaries (and no sleeping mercenary) qualify, continue on.
    if (flags.has_barracks && random(200) === 0
        && await barracksMonSound(state, hallu, { random, pline })) {
        return;
    }
    // C ref: sounds.c:309-312. If the gate fires but no live monster meets
    // zoo_mon_sound()'s predicate, dosounds() continues to the shop branch.
    if (flags.has_zoo && random(200) === 0) {
        const monster = get_iter_mons(
            (candidate) => zoo_mon_sound_qualifies(candidate, state),
            state,
        );
        if (monster) {
            await zoo_mon_sound(monster, state, hallu, { random, pline });
            return;
        }
    }
    if (flags.has_shop && random(200) === 0) {
        const sroom = search_special(ANY_SHOP, state);
        if (!sroom) {
            // strange...
            flags.has_shop = false;
            return;
        }
        if (tended_shop(sroom, state)
            && !roomStringContainsValue(
                hero?.ushops, (sroom.roomnoidx ?? 0) + ROOMOFFSET,
            )) {
            const shopMessages = [
                'someone cursing shoplifters.',
                'the chime of a cash register.',
                'Neiman and Marcus arguing!',
            ];
            await hear(shopMessages[random(2) + hallu], state, pline);
            await noisy_shop(sroom, { state, message: pline });
        }
        return;
    }
    rejectUnportedSpecialSound(state, POST_SHOP_SPECIAL_SOUND_FLAGS);
    // C ref: sounds.c:330-334 temple ambient sound.
    if (flags.has_temple && random(200) === 0
        && !(Is_astralevel(state.u?.uz)
            || (state.sanctum_level
                && on_level(state.u?.uz, state.sanctum_level)))) {
        if (templePriestSound(state, hallu, { random, pline }))
            return;
    }
    // C ref: sounds.c:335-338 Oracle level sound branch.
    if (on_level(state.u?.uz, state.oracle_level) && random(400) === 0) {
        for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
            if (mtmp.data !== state.mons?.[PM_ORACLE]) continue;
            if (Hallucination(state) || !canSeeMonster(mtmp, state)) {
                const oracleMessages = [
                    'a strange wind.',
                    'convulsive ravings.',
                    'snoring snakes.',
                    'someone say "No more woodchucks!"',
                    'a loud ZOT!',
                ];
                await hear(
                    oracleMessages[random(3) + hallu * 2], state, pline,
                );
            }
            return;
        }
    }
}

// C ref: sounds.c h_sounds[] (341-349). The 35 verbs a hallucinating hero
// hears in place of a monster's real noise. growl(), yelp() and whimper() all
// index it with ROLL_FROM(), which is `array[rn2(SIZE(array))]`; only growl()
// and yelp() have a caller in this port. Exported so that a test can pin each
// entry against the C table.
export const h_sounds = Object.freeze([
    'beep', 'boing', 'sing', 'belche', 'creak', 'cough',
    'rattle', 'ululate', 'pop', 'jingle', 'sniffle', 'tinkle',
    'eep', 'clatter', 'hum', 'sizzle', 'twitter', 'wheeze',
    'rustle', 'honk', 'lisp', 'yodel', 'coo', 'burp',
    'moo', 'boom', 'murmur', 'oink', 'quack', 'rumble',
    'twang', 'toot', 'gargle', 'hoot', 'warble',
]);

// C ref: sounds.c growl_sound() (351-396). Pure: it maps the species' msound
// to a verb and draws nothing. Every msound outside this switch, including
// MS_SILENT, answers "scream" -- growl() itself is what rejects MS_SILENT.
export function growl_sound(mtmp) {
    switch (mtmp.data?.msound) {
    case MS_MEW:
    case MS_HISS:
        return 'hiss';
    case MS_BARK:
    case MS_GROWL:
        return 'growl';
    case MS_ROAR:
        return 'roar';
    case MS_BELLOW:
        return 'bellow';
    case MS_BUZZ:
        return 'buzz';
    case MS_SQEEK:
        return 'squeal';
    case MS_SQAWK:
        return 'screech';
    case MS_NEIGH:
        return 'neigh';
    case MS_WAIL:
        return 'wail';
    case MS_GROAN:
        return 'groan';
    case MS_MOO:
        return 'low';
    case MS_SILENT:
        return 'commotion';
    default:
        return 'scream';
    }
}

// C ref: sounds.c growl() (398-421), "the sounds of a seriously abused pet,
// including player attacking it".
//
// The hallucination draw is on the core stream and precedes the print, so a
// hero who cannot see or hear the monster still spends it. wake_nearto() sits
// outside the print guard for the same reason: the noise happens whether or
// not the hero perceives it.
//
// C also sets iflags.last_msg = PLNMSG_GROWL inside the print guard. Its only
// C reader is mon.c setmangry() at 4244, which is unported, and a faithful
// port of the field first needs pline() to clear it (pline.c:242, 281) so the
// flag means "the most recent message was this growl". Both belong with
// setmangry(); nothing here reads the value.
//
// `random` is the injection seam for the hallucination draw; the game passes
// nothing and draws from the core stream.
export async function growl(mtmp, state = game, random = { rn2 }) {
    let growl_verb = 0;

    if (helpless(mtmp) || mtmp.data?.msound === MS_SILENT)
        return;

    /* presumably nearness and soundok checks have already been made */
    if (Hallucination(state))
        growl_verb = h_sounds[random.rn2(h_sounds.length)];
    else
        growl_verb = growl_sound(mtmp);
    if (growl_verb) {
        if (canseemon(mtmp, state) || !Deaf(state)) {
            await ttyPline(
                `${capitalizedMonsterName(mtmp, state)} `
                + `${vtense(null, growl_verb)}!`,
                state,
            );
            if (state.context?.run) nomul(0, state);
        }
        await wake_nearto(mtmp.mx, mtmp.my, (mtmp.data?.mlevel ?? 0) * 18,
                          { state });
    }
}

// C ref: sounds.c yelp() (425-476), "the sounds of mistreated pets".
//
// Two differences from growl() above: the message is printed even when the
// hero can neither see nor hear the yelper, and a species whose msound has no
// case below leaves yelp_verb unset, so nothing is printed and wake_nearto()
// is not reached. Deafness swaps each verb for a silent gesture without
// changing any draw.
//
// C's Soundeffect() calls are omitted: the recorder's soundlib is `nosound`,
// whose soundprocs.sound_soundeffect is null, so the macro expands to a test
// that never fires.
export async function yelp(mtmp, state = game, random = { rn2 }) {
    let yelp_verb = 0;

    if (helpless(mtmp) || !mtmp.data?.msound)
        return;

    /* presumably nearness and soundok checks have already been made */
    if (Hallucination(state)) {
        yelp_verb = h_sounds[random.rn2(h_sounds.length)];
    } else {
        switch (mtmp.data.msound) {
        case MS_MEW:
            yelp_verb = !Deaf(state) ? 'yowl' : 'arch';
            break;
        case MS_BARK:
        case MS_GROWL:
            yelp_verb = !Deaf(state) ? 'yelp' : 'recoil';
            break;
        case MS_ROAR:
            yelp_verb = !Deaf(state) ? 'snarl' : 'bluff';
            break;
        case MS_SQEEK:
            yelp_verb = !Deaf(state) ? 'squeal' : 'quiver';
            break;
        case MS_SQAWK:
            yelp_verb = !Deaf(state) ? 'screak' : 'thrash';
            break;
        case MS_WAIL:
            yelp_verb = !Deaf(state) ? 'wail' : 'cringe';
            break;
        default:
            break;
        }
    }
    if (yelp_verb) {
        await ttyPline(
            `${capitalizedMonsterName(mtmp, state)} `
            + `${vtense(null, yelp_verb)}!`,
            state,
        );
        if (state.context?.run) nomul(0, state);
        await wake_nearto(mtmp.mx, mtmp.my, (mtmp.data?.mlevel ?? 0) * 12,
                          { state });
    }
}

export class UnsupportedChatError extends Error {
    constructor(reason) {
        super(`#chat needs ${reason}`);
        this.name = 'UnsupportedChatError';
    }
}

// C ref: sounds.c domonnoise() (679-731). The leader is identified by its
// persistent m_id rather than by its current species, because the leader can
// be polymorphed and still speaks with quest-leader dialogue. Other sound
// families remain fail-closed at this boundary until their own slices land.
async function domonnoise(mtmp, state) {
    if (Deaf(state)) return ECMD_OK;
    if (is_silent(mtmp.data) && !mtmp.isshk) return ECMD_OK;

    let msound = mtmp.data?.msound;
    const leaderId = state.svq?.quest_status?.leader_m_id;
    if (mtmp.m_id === leaderId && msound > MS_ANIMAL)
        msound = MS_LEADER;

    if (msound === MS_LEADER) {
        if (!await quest_chat(mtmp, state))
            throw new UnsupportedChatError('a quest leader conversation');
    } else {
        // Preserve the existing public boundary for every ordinary monster;
        // only the quest-leader arm is admitted by this slice.
        throw new UnsupportedChatError('a monster occupying the target square');
    }

    // C's quest_chat() is void; domonnoise() returns ECMD_TIME after the
    // selected sound arm has completed.
    return ECMD_TIME;
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
 * Every ported arm answers ECMD_OK or ECMD_CANCEL, so #chat spends no move.
 * Two arms draw, and both belong to a hallucinating hero. The wall reply at
 * :1364 spends rn2(10) on the core stream, which the recorder logs. The
 * statue line at :1338 spends rndmonnam()'s draws on the display stream,
 * which the recorder does not log -- but they still choose the name the line
 * prints, so the arm is not free.
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

    // sounds.c:1374-1377. Empty, undetected, and furniture/object mimics do
    // not reach domonnoise(); the real monster tail starts after this guard.
    if (!mtmp || mtmp.mundetected
        || M_AP_TYPE(mtmp) === M_AP_FURNITURE
        || M_AP_TYPE(mtmp) === M_AP_OBJECT)
        return ECMD_OK;

    // sounds.c:1379-1385. A helpless non-priest is not woken by #chat; the
    // message is omitted when the hero cannot spot that monster.
    if (helpless(mtmp) && !mtmp.ispriest) {
        if (canSpotMonster(mtmp, state)) {
            await ttyPline(
                `${capitalizedMonsterName(mtmp, state)} seems not to notice you.`,
                state,
            );
        }
        return ECMD_OK;
    }

    // sounds.c:1388-1395. Chat prods a waiting monster, and an eating tame
    // monster makes noise instead of entering its sound-specific arm.
    mtmp.mstrategy &= ~STRAT_WAITMASK;
    if (!Deaf(state) && mtmp.mtame && mtmp.meating) {
        if (!canSpotMonster(mtmp, state))
            map_invisible(mtmp.mx, mtmp.my, state);
        await ttyPline(
            `${capitalizedMonsterName(mtmp, state)} is eating noisily.`,
            state,
        );
        return ECMD_OK;
    }

    // sounds.c:1397-1406. This remains a complete common tail even though the
    // witnessed quest leader is audible and therefore skips it.
    if (Deaf(state)) {
        const xresponse = humanoid(state.youmonst.data)
            ? 'falls on deaf ears' : 'is inaudible';
        const name = canSpotMonster(mtmp, state)
            ? ` from ${monsterCommonName(mtmp, state)}` : '';
        await ttyPline(`Any response${name} ${xresponse}.`, state);
        return ECMD_OK;
    }

    return domonnoise(mtmp, state);
}

// C ref: sounds.c dotalk() (1247-1254), the #chat command.
export async function dotalk(state = game) {
    return dochat(state);
}

// C refs: sounds.c soundlib_choices[], activate_chosen_soundlib(),
// assign_soundlib(), get_soundlib_name(), and soundlib_id_from_opt()
// (1744-1895).  The recorder build defines none of the optional SND_LIB_*
// macros, so its table contains only the built-in nosound entry.
export const soundlib_nosound = 0;

const soundlib_choices = Object.freeze([
    Object.freeze({ soundname: 'nosound', soundlib_id: soundlib_nosound }),
]);

function soundlibChoice(index, caller) {
    if (!Number.isInteger(index) || index < 0
        || index >= soundlib_choices.length) {
        throw new RangeError(`${caller}: invalid soundlib (${index})`);
    }
    return soundlib_choices[index];
}

export function activate_chosen_soundlib(state = game) {
    const choice = soundlibChoice(
        state.gc?.chosen_soundlib, 'activate_chosen_soundlib',
    );
    state.ga ??= {};
    state.ga.active_soundlib = choice.soundlib_id;
    state.gc.chosen_soundlib = state.ga.active_soundlib;
}

export function assign_soundlib(state, index) {
    state.gc ??= {};
    state.gc.chosen_soundlib = soundlibChoice(
        index, 'assign_soundlib',
    ).soundlib_id;
}

export function get_soundlib_name(state = game, maxlen = WINTYPELEN) {
    const source = soundlibChoice(
        state.ga?.active_soundlib, 'get_soundlib_name',
    ).soundname;
    const comma = source.indexOf(',');
    return source.slice(0, Math.min(
        comma < 0 ? source.length : comma,
        Math.max(0, maxlen - 1),
    ));
}

export function soundlib_id_from_opt(option) {
    const choice = soundlib_choices.find(
        ({ soundname }) => soundname === option,
    );
    return (choice ?? soundlib_choices[0]).soundlib_id;
}
