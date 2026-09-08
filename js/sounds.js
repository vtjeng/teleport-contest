// Monster noises, ambient level sounds, #chat, and sound backends.
// C refs: sounds.c dosounds() through sound_speak().

import {
    ANY_SHOP,
    BARRACKS,
    BEEHIVE,
    BLINDED,
    BOLT_LIM,
    CONFLICT,
    COURT,
    DEAF,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    EMIN,
    EPRI,
    FEMALE,
    HAIR,
    HALLUC,
    HALLUC_RES,
    HEAD,
    INVIS,
    IRONBARS,
    IS_WALL,
    Is_astralevel,
    MALE,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPE,
    MS_ANIMAL,
    MS_ARREST,
    MS_BARK,
    MS_BELLOW,
    MS_BOAST,
    MS_BUZZ,
    MS_CHIRP,
    MS_CUSS,
    MS_DJINNI,
    MS_GROAN,
    MS_GROWL,
    MS_GRUNT,
    MS_GUARD,
    MS_GUARDIAN,
    MS_HISS,
    MS_HUMANOID,
    MS_IMITATE,
    MS_LAUGH,
    MS_LEADER,
    MS_MEW,
    MS_MOO,
    MS_MUMBLE,
    MS_NEIGH,
    MS_NURSE,
    MS_ORACLE,
    MS_ORC,
    MS_PRIEST,
    MS_ROAR,
    MS_SEDUCE,
    MS_SELL,
    MS_SILENT,
    MS_SOLDIER,
    MS_SPELL,
    MS_SQAWK,
    MS_SQEEK,
    MS_VAMPIRE,
    MS_WAIL,
    MS_WERE,
    MORGUE,
    NECK,
    ROOMOFFSET,
    SDOOR,
    SOUND_TRIGGER_VERBAL,
    STONE,
    STRANGLED,
    STRAT_WAITMASK,
    VAULT,
    W_ARMH,
    WINTYPELEN,
    ZOO,
    has_emin,
    helpless,
    isok,
    nothing_happens,
    PLINE_SPEECH,
    PLINE_VERBALIZE,
    sff_base_only,
    sff_default,
    sff_havedir_append_rest,
    voice_deity,
    voice_talking_artifact,
} from './const.js';
import { getdir } from './cmd.js';
import {
    glyph_at,
    glyph_is_invisible,
    glyph_is_statue,
    glyph_to_mon,
    map_invisible,
    vobj_at,
} from './display.js';
import { cursed } from './do_wear.js';
import {
    capitalizedMonsterName,
    monsterCommonName,
    pmname,
    rndmonnam,
} from './do_name.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
} from './hacklib.js';
import { search_special } from './mkroom.js';
import { get_iter_mons, wake_nearto } from './mon.js';
import {
    carnivorous,
    haseyes,
    herbivorous,
    humanoid,
    is_animal,
    is_flyer,
    is_lord,
    is_mercenary,
    is_prince,
    is_silent,
    is_undead,
    is_vampshifter,
    mhis,
    perceives,
} from './mondata.js';
import {
    PM_GECKO,
    PM_LONG_WORM,
    PM_ORACLE,
    S_ANT,
    S_EEL,
} from './monsters.js';
import { accessible } from './monmove.js';
import { m_at } from './monst.js';
import { g_at } from './obj.js';
import { an, helm_simple_name, vtense } from './objnam.js';
import { STATUE } from './objects.js';
import { halu_gname } from './pray.js';
import { body_part } from './polyself.js';
import { quest_chat } from './quest.js';
import { inhistemple, p_coaligned, temple_occupied } from './priest.js';
import { rn1, rn2 } from './rng.js';
import { genders } from './roles.js';
import { canSpotMonster } from './startup_a11y.js';
import { noisy_shop, shop_object, tended_shop } from './shk.js';
import { SOUND_EFFECT_BASE_FILENAMES } from './sound_effects_data.js';
import { ttyPline } from './tty_message.js';
import { cansee, canseemon, couldsee } from './vision.js';
import { vault_occupied } from './vault.js';
import { which_armor } from './worn.js';

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
async function zoo_mon_sound(monster, state, hallu, { random, pline }) {
    if (!zoo_mon_sound_qualifies(monster, state)) return false;
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
async function throne_mon_sound(monster, state, hallu, { random, pline }) {
    if (!throne_mon_sound_qualifies(monster, state)) return false;
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

function throne_mon_sound_qualifies(monster, state) {
    return (monster.msleeping
        || is_lord(monster.data)
        || is_prince(monster.data))
        && !is_animal(monster.data)
        && mon_in_room(monster, COURT, state);
}

// C ref: sounds.c beehive_mon_sound() (62-88).
async function beehive_mon_sound(monster, state, hallu, { random, pline }) {
    if (monster.data?.mlet !== S_ANT || !is_flyer(monster.data)
        || !mon_in_room(monster, BEEHIVE, state)) {
        return false;
    }
    switch (random(2) + hallu) {
    case 0:
        await hear('a low buzzing.', state, pline);
        break;
    case 1:
        await hear('an angry drone.', state, pline);
        break;
    case 2:
        await hear(
            `bees in your ${state.uarmh ? '' : '(nonexistent) '}bonnet!`,
            state,
            pline,
        );
        break;
    default:
        break;
    }
    return true;
}

// C ref: sounds.c morgue_mon_sound() (89-114).
async function morgue_mon_sound(monster, state, hallu, { random, pline }) {
    if (!(is_undead(monster.data) || is_vampshifter(monster))
        || !mon_in_room(monster, MORGUE, state)) {
        return false;
    }
    const hair = body_part(HAIR, state.youmonst);
    switch (random(2) + hallu) {
    case 0:
        await pline('You suddenly realize it is unnaturally quiet.', state);
        break;
    case 1: {
        const neck = body_part(NECK, state.youmonst);
        await pline(
            `The ${hair} on the back of your ${neck} ${vtense(hair, 'stand')} up.`,
            state,
        );
        break;
    }
    case 2: {
        const head = body_part(HEAD, state.youmonst);
        await pline(
            `The ${hair} on your ${head} ${vtense(hair, 'seem')} to stand up.`,
            state,
        );
        break;
    }
    default:
        break;
    }
    return true;
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
async function temple_priest_sound(mtmp, state, hallu, { random, pline }) {
    if (!mtmp.ispriest || !inhistemple(mtmp, state)
        || helpless(mtmp)
        || temple_occupied(state.u?.urooms, state) === EPRI(mtmp)?.shroom) {
        return false;
    }
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

async function oracle_sound(mtmp, state, hallu, { random, pline }) {
    if (mtmp.data !== state.mons?.[PM_ORACLE]) return false;
    if (Hallucination(state) || !canseemon(mtmp, state)) {
        const messages = [
            'a strange wind.',
            'convulsive ravings.',
            'snoring snakes.',
            'someone say "No more woodchucks!"',
            'a loud ZOT!',
        ];
        await hear(messages[random(3) + hallu * 2], state, pline);
    }
    return true;
}

// C ref: sounds.c dosounds() (202-339). Ambient gates remain in source order;
// a taken branch returns exactly where C does, while a callback gate whose
// monster scan finds nobody continues to the following room type.
export async function dosounds(
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
            (candidate) => throne_mon_sound_qualifies(candidate, state),
            state,
        );
        if (monster) {
            await throne_mon_sound(monster, state, hallu, { random, pline });
            return;
        }
    }
    if (flags.has_swamp && random(200) === 0) {
        const messages = [
            'hear mosquitoes!',
            'smell marsh gas!',
            'hear Donald Duck!',
        ];
        await pline(`You ${messages[random(2) + hallu]}`, state);
        return;
    }
    if (flags.has_vault && random(200) === 0) {
        const room = search_special(VAULT, state);
        if (!room) {
            flags.has_vault = false;
            return;
        }
        if (vaultSoundAllowed(state)) {
            const selection = random(2) + hallu;
            if (selection === 1
                && vault_occupied(hero?.urooms, state)
                    !== (room.roomnoidx ?? 0) + ROOMOFFSET) {
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
    if (flags.has_beehive && random(200) === 0) {
        const monster = get_iter_mons(
            (candidate) => candidate.data?.mlet === S_ANT
                && is_flyer(candidate.data)
                && mon_in_room(candidate, BEEHIVE, state),
            state,
        );
        if (monster) {
            await beehive_mon_sound(monster, state, hallu, { random, pline });
            return;
        }
    }
    if (flags.has_morgue && random(200) === 0) {
        const monster = get_iter_mons(
            (candidate) => (is_undead(candidate.data)
                    || is_vampshifter(candidate))
                && mon_in_room(candidate, MORGUE, state),
            state,
        );
        if (monster) {
            await morgue_mon_sound(monster, state, hallu, { random, pline });
            return;
        }
    }
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
    // C ref: sounds.c:330-334 temple ambient sound.
    if (flags.has_temple && random(200) === 0
        && !(Is_astralevel(state.u?.uz)
            || (state.sanctum_level
                && on_level(state.u?.uz, state.sanctum_level)))) {
        const monster = get_iter_mons(
            (candidate) => candidate.ispriest
                && inhistemple(candidate, state)
                && !helpless(candidate)
                && temple_occupied(state.u?.urooms, state)
                    !== EPRI(candidate)?.shroom,
            state,
        );
        if (monster) {
            await temple_priest_sound(
                monster, state, hallu, { random, pline },
            );
            return;
        }
    }
    // C ref: sounds.c:335-338 Oracle level sound branch.
    if (on_level(state.u?.uz, state.oracle_level) && random(400) === 0) {
        const mtmp = get_iter_mons(
            (candidate) => candidate.data === state.mons?.[PM_ORACLE],
            state,
        );
        if (mtmp) {
            await oracle_sound(mtmp, state, hallu, { random, pline });
            return;
        }
    }
}

// C ref: sounds.c h_sounds[] (341-349). The 35 verbs a hallucinating hero
// hears in place of a monster's real noise. growl(), yelp() and whimper() all
// index it with ROLL_FROM(), which is `array[rn2(SIZE(array))]`. Exported so
// that a test can pin each entry against the C table.
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

// C ref: sounds.c whimper() (479-515), the sounds of distressed pets.
export async function whimper(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const message = rawEnv.message ?? ttyPline;
    let whimper_verb = 0;

    if (helpless(mtmp) || !mtmp.data?.msound) return;
    if (Hallucination(state)) {
        whimper_verb = h_sounds[random.rn2(h_sounds.length)];
    } else {
        switch (mtmp.data.msound) {
        case MS_MEW:
        case MS_GROWL:
            whimper_verb = 'whimper';
            break;
        case MS_BARK:
            whimper_verb = 'whine';
            break;
        case MS_SQEEK:
            whimper_verb = 'squeal';
            break;
        default:
            break;
        }
    }
    if (whimper_verb) {
        // Soundeffect() is a no-op with the recorder's nosound backend.
        await message(
            `${capitalizedMonsterName(mtmp, state)} `
            + `${vtense(null, whimper_verb)}.`,
            state,
        );
        if (state.context?.run) nomul(0, state);
        await wake_nearto(
            mtmp.mx,
            mtmp.my,
            (mtmp.data?.mlevel ?? 0) * 6,
            { state },
        );
    }
}

// C ref: sounds.c beg() (519-542), a hungry pet's request for food.
export async function beg(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const message = rawEnv.message ?? ttyPline;
    const spotMonster = rawEnv.canSpotMonster ?? canSpotMonster;
    const markInvisible = rawEnv.mapInvisible ?? map_invisible;
    if (helpless(mtmp)
        || !(carnivorous(mtmp.data) || herbivorous(mtmp.data))) {
        return;
    }

    if (!is_silent(mtmp.data) && mtmp.data.msound <= MS_ANIMAL) {
        await (rawEnv.domonnoise ?? domonnoise)(mtmp, state);
    } else if (mtmp.data.msound >= MS_HUMANOID) {
        if (!spotMonster(mtmp, state))
            markInvisible(mtmp.mx, mtmp.my, state);
        set_voice(mtmp, 0, 80, 0, state);
        state.gp.pline_flags |= PLINE_VERBALIZE;
        try {
            await message('"I\'m hungry."', state);
        } finally {
            state.gp.pline_flags &= ~PLINE_VERBALIZE;
        }
    } else if (spotMonster(mtmp, state)) {
        await message(
            `${capitalizedMonsterName(mtmp, state)} seems famished.`,
            state,
        );
    }
}

// C ref: sounds.c maybe_gasp() (546-609). The caller has already established
// that a peaceful humanoid witnessed the hero attack another peaceful.
export function maybe_gasp(mon, state = game, random = { rn2 }) {
    const exclamations = ['Gasp!', 'Uh-oh.', 'Oh my!', 'What?', 'Why?'];
    const mptr = mon.data;
    let msound = mptr?.msound ?? MS_SILENT;
    let dogasp = false;

    if ((msound === MS_GUARDIAN
            && mptr !== state.mons?.[state.urole?.guardnum])
        || (msound === MS_PRIEST && !p_coaligned(mon, state))) {
        msound = MS_SILENT;
    } else if (msound === MS_CUSS && has_emin(mon)
        && (p_coaligned(mon, state)
            ? !EMIN(mon)?.renegade : EMIN(mon)?.renegade)) {
        msound = MS_HUMANOID;
    }

    switch (msound) {
    case MS_HUMANOID:
    case MS_ARREST:
    case MS_SOLDIER:
    case MS_GUARD:
    case MS_NURSE:
    case MS_SEDUCE:
    case MS_LEADER:
    case MS_GUARDIAN:
    case MS_SELL:
    case MS_ORACLE:
    case MS_PRIEST:
    case MS_BOAST:
    case MS_IMITATE:
        dogasp = true;
        break;
    case MS_ORC:
    case MS_GRUNT:
    case MS_LAUGH:
    case MS_ROAR:
    case MS_BELLOW:
    case MS_DJINNI:
    case MS_VAMPIRE:
    case MS_WERE:
    case MS_SPELL:
        dogasp = mptr?.mlet === state.youmonst?.data?.mlet;
        break;
    default:
        break;
    }
    return dogasp ? exclamations[random.rn2(exclamations.length)] : null;
}

// C ref: sounds.c cry_sound() (617-655). Pure: supplies the stem which the
// egg-hatching caller passes to ing_suffix().
export function cry_sound(mtmp) {
    const ptr = mtmp.data;
    switch (ptr?.msound) {
    default:
    case MS_SILENT:
        return ptr?.mlet === S_EEL ? 'gurgle' : 'chitter';
    case MS_HISS:
        return 'hiss';
    case MS_ROAR:
    case MS_GROWL:
        return 'growl';
    case MS_CHIRP:
        return 'chirp';
    case MS_BUZZ:
        return 'buzz';
    case MS_SQAWK:
        return 'screech';
    case MS_GRUNT:
        return 'grunt';
    case MS_MUMBLE:
        return 'mumble';
    }
}

// C ref: sounds.c mon_is_gecko() (659-674). Pure: actual geckos win before
// consulting the displayed glyph; long worms lose before a possible tail.
export function mon_is_gecko(mon, state = game) {
    if (mon.data === state.mons?.[PM_GECKO]) return true;
    if (mon.data === state.mons?.[PM_LONG_WORM]) return false;
    return glyph_to_mon(glyph_at(mon.mx, mon.my, state)) === PM_GECKO;
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
        // quest.c chat_with_leader() raises the caller's own class for the
        // conversation arms this port does not carry, so #chat keeps reporting
        // them as chat boundaries with the arm named.
        await quest_chat(mtmp, state, {
            unsupported: (reason) => { throw new UnsupportedChatError(reason); },
        });
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

// C ref: sounds.c responsive_mon_at() (1413-1423). Pure: identify a monster
// at the head square (never a worm tail) which is able to see and react.
export function responsive_mon_at(x, y, state = game) {
    let mtmp = isok(x, y) ? m_at(x, y, state) : null;
    const invisibility = state.u?.uprops?.[INVIS];
    const invisible = Boolean(
        (invisibility?.intrinsic || invisibility?.extrinsic)
        && !invisibility?.blocked,
    );
    if (mtmp && (helpless(mtmp)
        || !mtmp.mcansee
        || !haseyes(mtmp.data)
        || (invisible && !perceives(mtmp.data))
        || x !== mtmp.mx || y !== mtmp.my)) {
        mtmp = null;
    }
    return mtmp;
}

function next2u(x, y, state) {
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    return dx * dx + dy * dy <= 2;
}

// C ref: sounds.c tiphat() (1427-1537), selected by pickup.c dotip() when the
// chosen inventory object is the worn helmet. The pickup selection arm is
// still outside sounds.c; this function preserves the complete response once
// called.
export async function tiphat(state = game, rawEnv = {}) {
    const u = state.u;
    const helmet = state.uarmh;
    if (!helmet) return 0;

    let res = helmet.bknown ? 0 : 1;
    const cursedCheck = rawEnv.cursed ?? cursed;
    if (await cursedCheck(helmet, state)) return res;

    const readDirection = rawEnv.getdir ?? getdir;
    if (!await readDirection('At whom? (in what direction)', state)) return res;
    res = 1;

    const message = rawEnv.message ?? ttyPline;
    const random = rawEnv.random ?? { rn1, rn2 };
    const seesMonster = rawEnv.canseemon ?? canseemon;
    const couldSee = rawEnv.couldsee ?? couldsee;
    const displayedGlyph = rawEnv.glyph_at ?? glyph_at;
    const monsterNoise = rawEnv.domonnoise ?? domonnoise;
    const spotMonster = rawEnv.canSpotMonster ?? canSpotMonster;

    await message(
        `You briefly doff your ${helm_simple_name(helmet, state)}.`,
        state,
    );

    if (!u.dx && !u.dy) {
        if (u.usteed && u.dz > 0) {
            if (helpless(u.usteed)) {
                await message(
                    `${capitalizedMonsterName(u.usteed, state)} doesn't notice.`,
                    state,
                );
            } else {
                await monsterNoise(u.usteed, state);
            }
        } else if (u.dz) {
            await message(
                `There's no one ${u.dz < 0 ? 'up' : 'down'} there.`,
                state,
            );
        } else {
            await message("The lout here doesn't acknowledge you...", state);
        }
        return res;
    }

    let mtmp = null;
    let vismon = false;
    let unseen = false;
    let statue = false;
    let x = u.ux;
    let y = u.uy;
    let range;
    for (range = 1; range <= BOLT_LIM + 1; ++range) {
        x += u.dx;
        y += u.dy;
        if (!isok(x, y) || (range > 1 && !couldSee(x, y, state))) {
            x -= u.dx;
            y -= u.dy;
            break;
        }
        mtmp = m_at(x, y, state);
        vismon = Boolean(mtmp && seesMonster(mtmp, state));
        const glyph = displayedGlyph(x, y, state);
        unseen = glyph_is_invisible(glyph);
        const object = !vismon && !unseen ? vobj_at(x, y, state) : null;
        statue = glyph_is_statue(glyph)
            || Boolean(object && object.otyp === STATUE);
        if (vismon && (M_AP_TYPE(mtmp) === M_AP_FURNITURE
            || M_AP_TYPE(mtmp) === M_AP_OBJECT)) {
            vismon = false;
            mtmp = null;
        }
        if (vismon || unseen || (statue && Hallucination(state))
            || (range === 1 && mtmp && responsive_mon_at(x, y, state)
                && !is_silent(mtmp.data))
            || !(accessible(x, y, state)
                || state.level.at(x, y).typ === IRONBARS)) {
            break;
        }
    }

    if (unseen || (statue && Hallucination(state))) {
        await message(
            `That ${unseen ? 'unseen ' : ''}creature is ignoring you!`,
            state,
        );
    } else if (!mtmp || !responsive_mon_at(x, y, state)) {
        if (vismon) {
            await message(
                `${capitalizedMonsterName(mtmp, state)} seems not to notice you.`,
                state,
            );
        } else {
            await message(nothing_happens, state);
        }
    } else {
        mtmp.mstrategy &= ~STRAT_WAITMASK;
        const conflict = state.u?.uprops?.[CONFLICT];
        const conflictActive = Boolean(conflict?.intrinsic || conflict?.extrinsic);
        if (vismon && humanoid(mtmp.data) && mtmp.mpeaceful
            && !conflictActive) {
            const wornHelmet = which_armor(mtmp, W_ARMH, state);
            if (!wornHelmet) {
                await message(
                    `${capitalizedMonsterName(mtmp, state)} waves.`,
                    state,
                );
            } else {
                const possessive = mhis(mtmp, {
                    state,
                    random,
                    canSpotMonster: spotMonster,
                });
                if (wornHelmet.cursed) {
                    await message(
                        `${capitalizedMonsterName(mtmp, state)} grasps `
                        + `${possessive} ${helm_simple_name(wornHelmet, state)} `
                        + "but can't remove it.",
                        state,
                    );
                    wornHelmet.bknown = true;
                } else {
                    await message(
                        `${capitalizedMonsterName(mtmp, state)} tips `
                        + `${possessive} ${helm_simple_name(wornHelmet, state)} `
                        + 'in response.',
                        state,
                    );
                }
            }
        } else if (vismon && humanoid(mtmp.data)) {
            const reactions = ['curses', 'gestures rudely', 'gestures offensively'];
            const deaf = Deaf(state);
            const which = !deaf ? random.rn2(3) : random.rn1(2, 1);
            const twice = (deaf || which > 0 || random.rn2(3))
                ? 0 : random.rn1(2, 1);
            await message(
                `${capitalizedMonsterName(mtmp, state)} ${reactions[which]}`
                + `${twice ? ` and ${reactions[twice]}` : ''} at you...`,
                state,
            );
        } else if (next2u(x, y, state) && !Deaf(state)
            && await monsterNoise(mtmp, state)) {
            if (!vismon) map_invisible(x, y, state);
        } else if (vismon) {
            await message(
                `${capitalizedMonsterName(mtmp, state)} doesn't respond.`,
                state,
            );
        } else {
            await message(nothing_happens, state);
        }
    }
    return res;
}

function soundMappingError(text, state, rawEnv) {
    if (typeof rawEnv.rawPrint === 'function') rawEnv.rawPrint(text, state);
    else {
        state.startupEvents ??= [];
        state.startupEvents.push({ text });
    }
}

function parseSoundMapping(mapping) {
    const plain = /^MESG[\t ]+"([^"]{0,255})"[\t ]+"([^"]{0,255})"[\t ]+([+-]?\d+)(?:[\t ]+([+-]?\d+))?[\t ]*$/u
        .exec(mapping);
    if (plain) {
        return {
            msgtyp: '',
            text: plain[1],
            filename: plain[2],
            volume: Number.parseInt(plain[3], 10),
            idx: plain[4] === undefined ? -1 : Number.parseInt(plain[4], 10),
        };
    }
    const typed = /^MESG[\t ]+([^"]{1,10})"([^"]{0,255})"[\t ]+"([^"]{0,255})"[\t ]+([+-]?\d+)(?:[\t ]+([+-]?\d+))?[\t ]*$/u
        .exec(mapping);
    if (!typed) return null;
    return {
        msgtyp: typed[1].trim(),
        text: typed[2],
        filename: typed[3],
        volume: Number.parseInt(typed[4], 10),
        idx: typed[5] === undefined ? -1 : Number.parseInt(typed[5], 10),
    };
}

// C ref: sounds.c add_sound_mapping() (1556-1626). USER_SOUNDS is disabled
// in the recorder, so file readability is supplied by a host which opts into
// user sounds; indexed mappings require no filesystem access, as in C.
export function add_sound_mapping(mapping, state = game, rawEnv = {}) {
    const parsed = parseSoundMapping(mapping);
    if (!parsed) {
        soundMappingError('syntax error in SOUND', state, rawEnv);
        return 0;
    }
    state.sounddir ??= '.';
    const filespec = `${state.sounddir}/${parsed.filename}`;
    if (new TextEncoder().encode(filespec).length >= 256) {
        soundMappingError('sound file name too long', state, rawEnv);
        return 0;
    }
    const canReadFile = rawEnv.canReadFile ?? (() => false);
    if (parsed.idx < 0 && !canReadFile(filespec)) {
        soundMappingError(`cannot read ${filespec.slice(0, 243)}`, state, rawEnv);
        return 0;
    }

    let regex;
    try {
        regex = new RegExp(parsed.text, 'u');
    } catch (error) {
        soundMappingError(error.message, state, rawEnv);
        return 0;
    }
    const newMap = {
        regex,
        filename: filespec,
        volume: parsed.volume,
        idx: parsed.idx,
        next: state.soundmap ?? null,
    };
    if (parsed.msgtyp && typeof rawEnv.msgtypeParseAdd === 'function') {
        rawEnv.msgtypeParseAdd(
            `${parsed.msgtyp.slice(0, 10)} "${parsed.text.slice(0, 230)}"`,
        );
    }
    state.soundmap = newMap;
    return 1;
}

// C ref: sounds.c sound_matches_message() (1629-1639).
export function sound_matches_message(msg, state = game) {
    for (let snd = state.soundmap ?? null; snd; snd = snd.next) {
        if (snd.regex.test(msg)) return snd;
    }
    return null;
}

// C ref: sounds.c play_sound_for_message() and maybe_play_sound()
// (1642-1673). The two source functions are intentionally identical.
export function play_sound_for_message(msg, state = game) {
    const play = state.soundprocs?.sound_play_usersound;
    if (typeof play !== 'function') return;
    const snd = sound_matches_message(msg, state);
    if (snd) play(snd.filename, snd.volume, snd.idx);
}

export function maybe_play_sound(msg, state = game) {
    const play = state.soundprocs?.sound_play_usersound;
    if (typeof play !== 'function') return;
    const snd = sound_matches_message(msg, state);
    if (snd) play(snd.filename, snd.volume, snd.idx);
}

// C ref: sounds.c release_sound_mappings() (1676-1690).
export function release_sound_mappings(state = game) {
    state.soundmap = null;
    state.sounddir = null;
}

// C refs: sounds.c soundlib_choices[], activate_chosen_soundlib(),
// assign_soundlib(), get_soundlib_name(), and soundlib_id_from_opt()
// (1744-1895).  The recorder build defines none of the optional SND_LIB_*
// macros, so its table contains only the built-in nosound entry.
export const soundlib_nosound = 0;

const nosound_procs = Object.freeze({
    soundname: 'nosound',
    soundlib_id: soundlib_nosound,
    sound_init_nhsound: null,
    sound_exit_nhsound: null,
    sound_achievement: null,
    sound_soundeffect: null,
    sound_hero_playnotes: null,
    sound_play_usersound: null,
});

const soundlib_choices = Object.freeze([
    nosound_procs,
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
    if (state.ga?.active_soundlib !== soundlib_nosound
        || choice.soundlib_id !== soundlib_nosound) {
        state.soundprocs?.sound_exit_nhsound?.('assigning a new sound library');
    }
    state.soundprocs = choice;
    choice.sound_init_nhsound?.();
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

// C ref: sounds.c choose_soundlib() (1809-1858), retained inside #if 0 in
// upstream. With the recorder's one-entry table, every supplied name falls
// back to nosound and reports the sole available choice.
export function choose_soundlib(name, state = game, rawEnv = {}) {
    for (let i = 1; i < soundlib_choices.length; ++i) {
        if (name.toLowerCase() === soundlib_choices[i].soundname.toLowerCase()) {
            assign_soundlib(state, i);
            return;
        }
    }
    assign_soundlib(state, soundlib_nosound);
    const shown = name.length >= 50 ? name.slice(0, 49) : name;
    const report = rawEnv.configErrorAdd
        ?? ((text) => {
            state.configErrors ??= [];
            state.configErrors.push(text);
        });
    report(
        `Soundlib type ${shown} not recognized.  The only choice is: nosound`,
    );
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

// C ref: sounds.c nosound_*() (1917-1944), the disabled empty fallback
// implementations. The active nosound_procs table uses null callbacks.
export function nosound_init_nhsound() {}
export function nosound_exit_nhsound(_reason) {}
export function nosound_achievement(_ach1, _ach2, _repeat) {}
export function nosound_soundeffect(_seid, _volume) {}
export function nosound_hero_playnotes(_instr, _notes, _volume) {}
export function nosound_play_usersound(_filename, _volume, _idx) {}

export function nosound_ambience(
    _ambienceid,
    _ambienceAction,
    _heroProximity,
) {}

export function nosound_verbal(
    _text,
    _gender,
    _tone,
    _volume,
    _moreinfo,
) {}

// C refs: sounds.c se_mappings_init[] and initialize_semap_basenames()
// (1965-1992). The generated array's index is the corresponding
// sound_effect_entries value from sndprocs.h.
const semap_basenames = [];
let basenames_initialized = false;

export function initialize_semap_basenames() {
    for (let i = 1; i < SOUND_EFFECT_BASE_FILENAMES.length; ++i) {
        if (i > 0 && i < SOUND_EFFECT_BASE_FILENAMES.length)
            semap_basenames[i] = SOUND_EFFECT_BASE_FILENAMES[i];
    }
}

function cStringBytes(value) {
    const bytes = encodeUtf8ByteString(value);
    const nul = bytes.indexOf(0);
    return nul < 0 ? bytes : bytes.slice(0, nul);
}

function appendSoundFilename(existing, body, bufsz) {
    let prefix = cStringBytes(existing);
    const last = prefix.at(-1);
    if (last !== 0x2F && last !== 0x5C)
        prefix = [...prefix, 0x2F];

    // sounds.c passes `bufsz - (existinglen + 1)` after updating existinglen
    // for the slash. That is one byte smaller than the actual remaining
    // buffer, so an exactly-sized caller loses the formatted part's last byte.
    const snprintfSize = bufsz - (prefix.length + 1);
    const appended = cStringBytes(body).slice(
        0,
        Math.max(0, snprintfSize - 1),
    );
    return decodeUtf8ByteString([...prefix, ...appended]);
}

// C ref: sounds.c get_sound_effect_filename() (1995-2079). JavaScript strings
// are immutable, so the return value is the caller's resulting `buf`; null is
// C's null-pointer result.
export function get_sound_effect_filename(
    seidint,
    buf,
    bufsz,
    approach,
    state = game,
) {
    const ourdir = state.sounddir;
    if (buf === null || buf === undefined
        || ((ourdir === null || ourdir === undefined)
            && approach === sff_default)) {
        return null;
    }

    if (!basenames_initialized) {
        initialize_semap_basenames();
        basenames_initialized = true;
    }

    const basename = semap_basenames[Math.trunc(seidint)];
    const baseBytes = basename ? cStringBytes(basename) : [];
    const existingBytes = approach === sff_havedir_append_rest
        ? cStringBytes(buf) : [];
    const dirBytes = approach === sff_default ? cStringBytes(ourdir) : [];
    const needsSlash = existingBytes.length === 0
        || ![0x2F, 0x5C].includes(existingBytes.at(-1));

    let consumes = 3 + baseBytes.length; // "se_" and the basename
    if (approach === sff_default) {
        consumes += 4 + dirBytes.length + 1; // ".wav" and '/'
    } else if (approach === sff_havedir_append_rest) {
        if (needsSlash) ++consumes;
        consumes += existingBytes.length + 4;
    }
    ++consumes; // trailing NUL
    if (baseBytes.length <= 0 || consumes > bufsz
        || existingBytes.length >= bufsz) {
        return null;
    }

    const filename = `se_${basename}`;
    if (approach === sff_default)
        return `${decodeUtf8ByteString(dirBytes)}/${filename}.wav`;
    if (approach === sff_havedir_append_rest)
        return appendSoundFilename(buf, `${filename}.wav`, bufsz);
    if (approach === sff_base_only) return filename;
    return null;
}

// C ref: sounds.c base_soundname_to_filename() (2084-2151). This preserves
// the same append-size quirk as get_sound_effect_filename().
export function base_soundname_to_filename(
    basename,
    buf,
    bufsz,
    approach,
) {
    if (buf === null || buf === undefined) return null;

    const baseBytes = cStringBytes(basename);
    const existingBytes = approach === sff_havedir_append_rest
        ? cStringBytes(buf) : [];
    const needsSlash = existingBytes.length === 0
        || ![0x2F, 0x5C].includes(existingBytes.at(-1));
    let consumes = baseBytes.length;
    if (approach === sff_havedir_append_rest) {
        if (needsSlash) ++consumes;
        consumes += existingBytes.length + 4; // ".wav"
    }
    ++consumes; // trailing NUL
    if (!baseBytes.length || consumes > bufsz
        || existingBytes.length >= bufsz) {
        return null;
    }

    const base = decodeUtf8ByteString(baseBytes);
    if (approach === sff_havedir_append_rest)
        return appendSoundFilename(buf, `${base}.wav`, bufsz);
    if (approach === sff_base_only) return base;
    return null;
}

// C ref: sounds.c set_voice() (2161-2182). The compile-time SND_SPEECH body
// is represented directly; the default nosound backend never asks to speak.
export function set_voice(
    mtmp,
    tone,
    volume,
    moreinfo,
    state = game,
) {
    state.gv ??= {};
    state.gv.voice ??= {
        serialno: 0,
        gender: MALE,
        tone: 0,
        volume: 0,
        moreinfo: 0,
        mon: null,
        nameid: null,
    };
    const voice = state.gv.voice;
    voice.gender = mtmp?.female ? FEMALE : MALE;
    voice.serialno = mtmp
        ? mtmp.m_id
        : (moreinfo & voice_talking_artifact) !== 0
            ? 3
            : (moreinfo & voice_deity) !== 0 ? 4 : 2;
    voice.tone = tone;
    voice.volume = volume;
    voice.moreinfo = moreinfo;
    voice.nameid = null;
    state.gp ??= {};
    state.gp.pline_flags = (state.gp.pline_flags ?? 0) | PLINE_SPEECH;
}

// C ref: sounds.c sound_speak() (2185-2217). The fixed 2*BUFSZ buffer is not
// truncated on overflow: C leaves it empty and still calls sound_verbal().
export function sound_speak(text, state = game) {
    if (text === null || text === undefined || text === '') return;
    const verbal = state.soundprocs?.sound_verbal;
    if (!state.iflags?.voices || typeof verbal !== 'function'
        || !((state.soundprocs.sound_triggers ?? 0)
            & SOUND_TRIGGER_VERBAL)) {
        return;
    }

    const bytes = cStringBytes(text);
    if (!bytes.length) return;
    let first = 0;
    let last = bytes.length - 1;
    if ((state.gp?.pline_flags ?? 0) & PLINE_VERBALIZE) {
        if (bytes[first] === 0x22) ++first;
        if (bytes[last] === 0x22) --last;
    }
    let spoken = '';
    if (last - first >= 0 && last - first < (512 - 1))
        spoken = decodeUtf8ByteString(bytes.slice(first, last + 1));

    const voice = state.gv?.voice ?? {};
    verbal(
        spoken,
        voice.gender ?? 0,
        voice.tone ?? 0,
        voice.volume ?? 0,
        voice.moreinfo ?? 0,
    );
}
