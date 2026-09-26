// Engraving commands, creation, and erosion.
// C ref: engrave.c doengrave(), u_can_engrave(), engrave(), make_engr_at(),
// wipe_engr_at(), wipeout_text(), and freehand().

import {
    ACCESSIBLE,
    A_WIS,
    BLINDED,
    BURN,
    BUFSZ,
    CLOUD,
    CONFUSION,
    DUST,
    ECMD_FAIL,
    ECMD_OK,
    ENGRAVE,
    ENGR_BLOOD,
    FLYING,
    GETOBJ_DOWNPLAY,
    GETOBJ_SUGGEST,
    HALLUC,
    HALLUC_RES,
    HEADSTONE,
    ICE,
    LEVITATION,
    LL_CONDUCT,
    MARK,
    N_ENGRAVE,
    P_BASIC,
    P_RIDING,
    STUNNED,
    IS_AIR,
    IS_FOUNTAIN,
    IS_ALTAR,
    IS_GRAVE,
    Never_mind,
    WAND_BACKFIRE_CHANCE,
    DRAWBRIDGE_DOWN,
    FINGERTIP,
    HAND,
    ECMD_TIME,
    DEAF,
} from './const.js';
import { exercise_nonphysical } from './attrib.js';
import { ART_FIRE_BRAND, is_art } from './artifacts.js';
import { on_level, surface, surface_typ } from './dungeon.js';
import { game } from './gstate.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
    xcrypt,
} from './hacklib.js';
import { nomul } from './hack.js';
import {
    is_animal,
    is_demon,
    is_vampire,
    is_whirly,
    resists_blnd,
    sticks,
} from './mondata.js';
import {
    AT_HUGS,
    M1_CLING,
    M1_FLY,
    M1_HIDE,
    MZ_HUGE,
    S_MIMIC,
} from './monsters.js';
import { rn2, rnd } from './rng.js';
import {
    AMULET_CLASS,
    ARMOR_CLASS,
    BALL_CLASS,
    CHAIN_CLASS,
    COIN_CLASS,
    FOOD_CLASS,
    GEM_CLASS,
    ILLOBJ_CLASS,
    MAGIC_MARKER,
    POTION_CLASS,
    RANDOM_CLASS,
    RING_CLASS,
    ROCK_CLASS,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    TOOL_CLASS,
    TOWEL,
    VENOM_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
    WAN_CANCELLATION,
    WAN_COLD,
    WAN_CREATE_MONSTER,
    WAN_DEATH,
    WAN_DIGGING,
    WAN_ENLIGHTENMENT,
    WAN_FIRE,
    WAN_LIGHT,
    WAN_LIGHTNING,
    WAN_LOCKING,
    WAN_MAGIC_MISSILE,
    WAN_MAKE_INVISIBLE,
    WAN_NOTHING,
    WAN_OPENING,
    WAN_POLYMORPH,
    WAN_PROBING,
    WAN_SECRET_DOOR_DETECTION,
    WAN_SLEEP,
    WAN_SLOW_MONSTER,
    WAN_SPEED_MONSTER,
    WAN_STASIS,
    WAN_STRIKING,
    WAN_TELEPORTATION,
    WAN_UNDEAD_TURNING,
    WAN_WISHING,
    ATHAME,
} from './objects.js';
import { more_experienced } from './exper.js';
import {
    hold_another_object,
    obj_extract_self,
    prinv,
    update_inventory,
    useup,
} from './invent.js';
import { donameFresh, otense, Tobjnam, xnameFresh, Yname2,
    Yobjnam2, yname } from './objnam.js';
import { body_part } from './polyself.js';
import { make_blinded } from './potion.js';
import { note_unported } from './unported.js';
import { check_unpaid } from './shk.js';
import { learnwand, zappable } from './zap.js';
import {
    is_blade,
    is_boots,
    is_wet_towel,
    objectType,
    splitobj,
} from './obj.js';
import { is_ice } from './terrain.js';
import {
    is_lava,
    is_pool,
    t_at,
    uescaped_shaft,
    uteetering_at_seen_pit,
} from './trap.js';
import { welded } from './wield.js';
import { bimanual } from './worn.js';
import { livelog_printf } from './pline.js';

const RUBOUTS = new Map([
    ['A', '^'], ['B', 'Pb['], ['C', '('], ['D', '|)['], ['E', '|FL[_'],
    ['F', '|-'], ['G', 'C('], ['H', '|-'], ['I', '|'], ['K', '|<'],
    ['L', '|_'], ['M', '|'], ['N', '|\\'], ['O', 'C('], ['P', 'F'],
    ['Q', 'C('], ['R', 'PF'], ['T', '|'], ['U', 'J'], ['V', '/\\'],
    ['W', 'V/\\'], ['Z', '/'], ['b', '|'], ['d', 'c|'], ['e', 'c'],
    ['g', 'c'], ['h', 'n'], ['j', 'i'], ['k', '|'], ['l', '|'],
    ['m', 'nr'], ['n', 'r'], ['o', 'c'], ['q', 'c'], ['w', 'v'],
    ['y', 'v'], [':', '.'], [';', ',:'], [',', '.'], ['=', '-'],
    ['+', '-|'], ['*', '+'], ['@', '0'], ['0', 'C('], ['1', '|'],
    ['6', 'o'], ['7', '/'], ['8', '3o'],
]);

const SMALL_PUNCTUATION = "?.,'`-|_";

function engravingEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        random: env.random ?? { rn2, rnd },
    };
}

export function engr_at(x, y, state = game) {
    for (let engraving = state.head_engr ?? null;
        engraving;
        engraving = engraving.nxt_engr) {
        if (engraving.engr_x === x && engraving.engr_y === y)
            return engraving;
    }
    return null;
}

// C ref: engrave.c engr_can_be_felt() (291-313). Only writing that cuts or
// scorches the floor survives being read by touch; dust, blood and a wand's
// mark do not. display.c feel_location():860 is the caller that reveals such
// an engraving to a hero who cannot see it.
export function engr_can_be_felt(engraving) {
    return [ENGRAVE, HEADSTONE, BURN].includes(engraving?.engr_type);
}

function asciiCaseFold(value) {
    return String(value).replace(/[A-Z]/g, (character) =>
        String.fromCharCode(character.charCodeAt(0) + 32));
}

// C ref: engrave.c sengr_at(). NetHack's strcmpi()/strstri() comparison is
// ASCII case-insensitive; strict callers require the intact complete text.
export function sengr_at(text, x, y, strict, state = game) {
    const engraving = engr_at(x, y, state);
    if (!engraving || engraving.engr_type === HEADSTONE
        || engraving.engr_time > state.moves) {
        return null;
    }
    const actual = asciiCaseFold(engraving.engr_txt?.[0] ?? '');
    const wanted = asciiCaseFold(text);
    const matches = strict ? actual === wanted : actual.includes(wanted);
    return matches ? engraving : null;
}

export function del_engr_at(x, y, state = game) {
    let previous = null;
    for (let engraving = state.head_engr ?? null;
        engraving;
        engraving = engraving.nxt_engr) {
        if (engraving.engr_x !== x || engraving.engr_y !== y) {
            previous = engraving;
            continue;
        }
        if (previous) previous.nxt_engr = engraving.nxt_engr;
        else state.head_engr = engraving.nxt_engr;
        return;
    }
}

export function make_engr_at(
    x,
    y,
    text,
    pristineText,
    engravingTime,
    engravingType,
    env = {},
) {
    const normalized = engravingEnv(env);
    const { random, state } = normalized;
    del_engr_at(x, y, state);
    const sourceText = String(text);
    const pristine = pristineText == null ? sourceText : String(pristineText);
    const stringBytes = Math.max(
        encodeUtf8ByteString(sourceText).length,
        encodeUtf8ByteString(pristine).length,
    ) + 1;
    const exactElbereth = sourceText === 'Elbereth';
    if (exactElbereth && !state.in_mklev)
        exercise_nonphysical(A_WIS, true, state, random);
    const engraving = {
        nxt_engr: state.head_engr ?? null,
        engr_x: x,
        engr_y: y,
        engr_txt: [sourceText, sourceText, pristine],
        engr_time: engravingTime,
        engr_type: engravingType > 0
            ? engravingType
            : random.rnd(N_ENGRAVE - 1),
        engr_szeach: stringBytes,
        engr_alloc: stringBytes * 3,
        guardobjects: exactElbereth && Boolean(state.in_mklev),
        nowipeout: false,
        eread: false,
        erevealed: false,
    };
    state.head_engr = engraving;
    return engraving;
}

function propertyActiveUnblocked(hero, propertyIndex) {
    const property = hero?.uprops?.[propertyIndex];
    return Boolean(property
        && ((property.intrinsic ?? 0) || (property.extrinsic ?? 0))
        && !(property.blocked ?? 0));
}

function heroBlind(state) {
    return propertyActiveUnblocked(state.u, BLINDED);
}

function heroDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(deafness?.intrinsic || deafness?.extrinsic
        || state.u?.uroleplay?.deaf);
}

function tileAt(x, y, state) {
    return state.level?.at?.(x, y) ?? state.level?.locations?.[x]?.[y] ?? {};
}

function setText(de, field, text) {
    de[field] = String(text).slice(0, BUFSZ - 1);
}

// C ref: engrave.c doengrave_ctx_init(). This local structure is recreated
// for each command; only its `svc.context.engraving` fields survive as an
// occupation after the command returns.
export function doengrave_ctx_init(state = game) {
    const u = state.u;
    const oep = engr_at(u.ux, u.uy, state);
    const species = state.youmonst?.data;
    const holder = u.ustuck?.data;
    return {
        dengr: false,
        doblind: false,
        doknown: false,
        eow: false,
        ptext: true,
        teleengr: false,
        zapwand: false,
        disprefresh: false,
        adding: false,
        ret: ECMD_OK,
        type: is_demon(species) || is_vampire(species) ? ENGR_BLOOD : DUST,
        oetype: oep?.engr_type ?? 0,
        otmp: null,
        oep,
        buf: '',
        ebuf: '',
        fbuf: '',
        qbuf: '',
        post_engr_text: '',
        writer: null,
        jello: Boolean(u.uswallow && !(is_animal(holder) || is_whirly(holder))),
        frosted: is_ice(u.ux, u.uy, state),
    };
}

const BLIND_WRITING = [
    [0x44, 0x66, 0x6d, 0x69, 0x62, 0x65, 0x22, 0x45, 0x7b, 0x71, 0x65, 0x6d, 0x72],
    [0x51, 0x67, 0x60, 0x7a, 0x7f, 0x21, 0x40, 0x71, 0x6b, 0x71, 0x6f, 0x67, 0x63],
    [0x49, 0x6d, 0x73, 0x69, 0x62, 0x65, 0x22, 0x4c, 0x61, 0x7c, 0x6d, 0x67, 0x24, 0x42, 0x7f, 0x69, 0x6c, 0x77, 0x67, 0x7e],
    [0x4b, 0x6d, 0x6c, 0x66, 0x30, 0x4c, 0x6b, 0x68, 0x7c, 0x7f, 0x6f],
    [0x51, 0x67, 0x70, 0x7a, 0x7f, 0x6f, 0x67, 0x68, 0x64, 0x71, 0x21, 0x4f, 0x6b, 0x6d, 0x7e, 0x72],
    [0x4c, 0x63, 0x76, 0x61, 0x71, 0x21, 0x48, 0x6b, 0x7b, 0x75, 0x67, 0x63, 0x24, 0x45, 0x65, 0x6b, 0x6b, 0x65],
    [0x4c, 0x67, 0x68, 0x6b, 0x78, 0x68, 0x6d, 0x76, 0x7a, 0x75, 0x21, 0x4f, 0x71, 0x7a, 0x75, 0x6f, 0x77],
    [0x44, 0x66, 0x6d, 0x7c, 0x78, 0x21, 0x50, 0x65, 0x66, 0x65, 0x6c],
    [0x44, 0x66, 0x73, 0x69, 0x62, 0x65, 0x22, 0x56, 0x7d, 0x63, 0x69, 0x76, 0x6b, 0x66],
];

// C ref: engrave.c blengr(). ROLL_FROM(blind_writing) performs one rn2(9)
// call, then returns that row up to its NUL byte.
export function blengr(random = { rn2 }) {
    const row = BLIND_WRITING[random.rn2(BLIND_WRITING.length)];
    return String.fromCharCode(...row);
}

// C ref: engrave.c stylus_ok(). Object implements remain selectable; this
// return value only changes their placement in the getobj() menu.
export function stylus_ok(obj) {
    if (!obj) return GETOBJ_SUGGEST;
    if ([WEAPON_CLASS, WAND_CLASS, GEM_CLASS, RING_CLASS].includes(obj.oclass))
        return GETOBJ_SUGGEST;
    if (obj.oclass === TOOL_CLASS
        && [TOWEL, MAGIC_MARKER].includes(obj.otyp)) {
        return GETOBJ_SUGGEST;
    }
    return GETOBJ_DOWNPLAY;
}

// C ref: engrave.c doengrave_ctx_verb(). This only chooses the text labels
// used for the command and has no game side effects.
export function doengrave_ctx_verb(de) {
    switch (de.type) {
    default:
        de.everb = de.adding ? 'add to the weird writing on'
            : 'write strangely on';
        break;
    case DUST:
        de.everb = de.adding ? 'add to the writing in' : 'write in';
        de.eloc = de.frosted ? 'frost' : 'dust';
        break;
    case HEADSTONE:
        de.everb = de.adding ? 'add to the epitaph on' : 'engrave on';
        break;
    case ENGRAVE:
        de.everb = de.adding ? 'add to the engraving in' : 'engrave in';
        break;
    case BURN:
        de.everb = de.adding
            ? (de.frosted ? 'add to the text melted into'
                : 'add to the text burned into')
            : (de.frosted ? 'melt into' : 'burn into');
        break;
    case MARK:
        de.everb = de.adding ? 'add to the graffiti on' : 'scribble on';
        break;
    case ENGR_BLOOD:
        de.everb = de.adding ? 'add to the scrawl on' : 'scrawl on';
        break;
    }
}

// C ref: engrave.c u_can_engrave() (503-541). The caller supplies C's
// cantwield() and check_capacity() owners to avoid an engrave.js -> hack.js
// import cycle. Its terrain test is ACCESSIBLE(SURFACE_AT()), while floor
// reachability belongs later in doengrave(), after a writing implement is
// selected.
export async function u_can_engrave(
    state, { cantWield, checkCapacity, message },
) {
    const { u } = state;
    const levtyp = surface_typ(state.level.at(u.ux, u.uy));

    if (u.uswallow) {
        if (is_animal(u.ustuck.data)) {
            await message('What would you write?  "Jonah was here"?', state);
            return false;
        } else if (is_whirly(u.ustuck.data)) {
            await cant_reach_floor(
                u.ux, u.uy, false, false, false, state,
                { pline: message },
            );
            return false;
        }
        // C allows an attempt inside an amorphous engulfer; doengrave()
        // handles its later jello response after the stylus prompt.
    } else if (is_lava(u.ux, u.uy, state)) {
        await message(
            `You can't write on the ${surface(u.ux, u.uy, state)}!`, state,
        );
        return false;
    } else if (is_pool(u.ux, u.uy, state) || IS_FOUNTAIN(levtyp)) {
        await message(
            `You can't write on the ${surface(u.ux, u.uy, state)}!`, state,
        );
        return false;
    } else if (IS_AIR(levtyp)) {
        await message(
            `You can't write in ${levtyp === CLOUD ? 'cloud vapor' : 'thin air'}!`,
            state,
        );
        return false;
    } else if (!ACCESSIBLE(levtyp)) {
        await message("You can't write here.", state);
        return false;
    }

    if (cantWield(state.youmonst.data)) {
        await message("You can't even hold anything!", state);
        return false;
    }
    if (await checkCapacity(null, state))
        return false;
    return true;
}

// C ref: engrave.c doengrave_sfx_item_WAN(). `zapnodir()` has a narrower
// source port than this caller, and C discards its result, so the call is
// recorded as an explicit gap and skipped as required by the port contract.
export async function doengrave_sfx_item_WAN(de, state = game, env = {}) {
    const otmp = de.otmp;
    const typ = otmp.otyp;
    const blind = heroBlind(state);
    const surfaceName = surface(state.u.ux, state.u.uy, state);
    const setPost = (text) => setText(de, 'post_engr_text', text);

    switch (typ) {
    default:
        break;
    case WAN_LIGHT:
    case WAN_SECRET_DOOR_DETECTION:
    case WAN_STASIS:
    case WAN_CREATE_MONSTER:
    case WAN_WISHING:
    case WAN_ENLIGHTENMENT:
        note_unported('zap.c zapnodir');
        break;
    case WAN_STRIKING:
        setPost('The wand unsuccessfully fights your attempt to write!');
        break;
    case WAN_SLOW_MONSTER:
        if (!blind) setPost(`The bugs on the ${surfaceName} slow down!`);
        break;
    case WAN_SPEED_MONSTER:
        if (!blind) setPost(`The bugs on the ${surfaceName} speed up!`);
        break;
    case WAN_POLYMORPH:
        if (de.oep) {
            if (!blind) {
                de.type = 0;
                const generated = await env.randomEngraving?.({ state,
                    random: env.random });
                if (!generated)
                    throw new TypeError('doengrave requires randomEngraving');
                de.buf = generated.text;
                de.ebuf = generated.pristine;
            } else {
                if (de.oetype) de.type = de.oetype;
                const cipher = blengr(env.random);
                de.buf = xcrypt(cipher);
            }
            de.dengr = true;
        }
        break;
    case WAN_NOTHING:
    case WAN_UNDEAD_TURNING:
    case WAN_OPENING:
    case WAN_LOCKING:
    case WAN_PROBING:
        break;
    case WAN_MAGIC_MISSILE:
        de.ptext = true;
        if (!blind) setPost(`The ${surfaceName} is riddled by bullet holes!`);
        break;
    case WAN_SLEEP:
    case WAN_DEATH:
        if (!blind) setPost(`The bugs on the ${surfaceName} stop moving!`);
        break;
    case WAN_COLD:
        if (!blind) setPost('A few ice cubes drop from the wand.');
        if (!de.oep || de.oep.engr_type !== BURN) break;
        // C falls through for a burning engraving.
        if (de.oep && de.oep.engr_type !== HEADSTONE) {
            if (!blind)
                await env.message?.(`The engraving on the ${surfaceName} vanishes!`, state);
            de.dengr = true;
        }
        break;
    case WAN_CANCELLATION:
    case WAN_MAKE_INVISIBLE:
        if (de.oep && de.oep.engr_type !== HEADSTONE) {
            if (!blind)
                await env.message?.(`The engraving on the ${surfaceName} vanishes!`, state);
            de.dengr = true;
        }
        break;
    case WAN_TELEPORTATION:
        if (de.oep && de.oep.engr_type !== HEADSTONE) {
            if (!blind)
                await env.message?.(`The engraving on the ${surfaceName} vanishes!`, state);
            de.teleengr = true;
        }
        break;
    case WAN_DIGGING: {
        de.ptext = true;
        de.type = ENGRAVE;
        if (!objectType(otmp.otyp, state).oc_name_known) {
            if (state.flags?.verbose)
                await env.message?.(`This ${xnameFresh(otmp, state)} is a wand of digging!`, state);
            de.doknown = true;
        }
        const deaf = heroDeaf(state);
        const levtyp = tileAt(state.u.ux, state.u.uy, state).typ;
        const text = blind
            ? (!deaf ? 'You hear drilling!' : 'You feel tremors.')
            : IS_GRAVE(levtyp) ? 'Chips fly out from the headstone.'
                : de.frosted ? 'Ice chips fly up from the ice surface!'
                    : levtyp === DRAWBRIDGE_DOWN
                        ? 'Splinters fly up from the bridge.'
                        : 'Gravel flies up from the floor.';
        setPost(text);
        break;
    }
    case WAN_FIRE:
        de.ptext = true;
        de.type = BURN;
        if (!objectType(otmp.otyp, state).oc_name_known) {
            if (state.flags?.verbose)
                await env.message?.(`This ${xnameFresh(otmp, state)} is a wand of fire!`, state);
            de.doknown = true;
        }
        setPost(blind ? 'You feel the wand heat up.' : 'Flames fly from the wand.');
        break;
    case WAN_LIGHTNING:
        de.ptext = true;
        de.type = BURN;
        if (!objectType(otmp.otyp, state).oc_name_known) {
            if (state.flags?.verbose)
                await env.message?.(`This ${xnameFresh(otmp, state)} is a wand of lightning!`, state);
            de.doknown = true;
        }
        if (!blind) {
            setPost('Lightning arcs from the wand.');
            de.doblind = true;
        } else {
            setPost(!heroDeaf(state) ? 'You hear crackling!' : 'Your hair stands up!');
        }
        break;
    }
}

// C ref: engrave.c doengrave_sfx_item(). C's true/false return determines
// whether doengrave() proceeds to its setup and text prompt.
export async function doengrave_sfx_item(de, state = game, env = {}) {
    const otmp = de.otmp;
    const blind = heroBlind(state);
    const surfaceName = surface(state.u.ux, state.u.uy, state);
    const message = async (text) => env.message?.(text, state);

    switch (otmp.oclass) {
    default:
    case AMULET_CLASS:
    case CHAIN_CLASS:
    case POTION_CLASS:
    case COIN_CLASS:
        break;
    case RING_CLASS:
    case GEM_CLASS:
        if (objectType(otmp.otyp, state).oc_tough) de.type = ENGRAVE;
        break;
    case ARMOR_CLASS:
        if (is_boots(otmp, state)) {
            de.type = DUST;
            break;
        }
        // C falls through to the too-large object cases.
    case BALL_CLASS:
    case ROCK_CLASS:
        await message("You can't engrave with such a large object!");
        de.ptext = false;
        break;
    case FOOD_CLASS:
    case SCROLL_CLASS:
    case SPBOOK_CLASS:
        await message(`${Yname2(otmp, state)} would get ${de.frosted ? 'all frosty' : 'too dirty'}.`);
        de.ptext = false;
        break;
    case RANDOM_CLASS:
        break;
    case WAND_CLASS:
        if (await zappable(otmp, state)) {
            check_unpaid(otmp, state);
            if (otmp.cursed && !env.random.rn2(WAND_BACKFIRE_CHANCE)) {
                note_unported('zap.c wand_explode');
                de.ret = env.ECMD_TIME ?? ECMD_TIME;
                return false;
            }
            de.zapwand = true;
            if (!can_reach_floor(true, state)) de.ptext = false;
            await doengrave_sfx_item_WAN(de, state, env);
        } else {
            de.ptext = false;
            if (can_reach_floor(true, state)) {
                if (otmp.spe < 0) de.zapwand = true;
                else await message('The wand is too worn out to engrave.');
            }
        }
        break;
    case WEAPON_CLASS:
        if (is_art(otmp, ART_FIRE_BRAND)) {
            de.type = BURN;
        } else if (is_blade(otmp, state)) {
            if (welded(otmp, state)) {
                await message(`${Yname2(otmp, state)} can only scratch the ${surfaceName}.`);
            } else if (Math.trunc(otmp.spe) <= -3) {
                await message(`${Yobjnam2(otmp, 'are', state)} too dull for engraving.`);
            } else {
                de.type = ENGRAVE;
            }
        }
        break;
    case TOOL_CLASS:
        if (otmp === state.ublindf) {
            await message("That is a bit difficult to engrave with, don't you think?");
            de.ret = env.ECMD_FAIL ?? ECMD_FAIL;
            return false;
        }
        switch (otmp.otyp) {
        case MAGIC_MARKER:
            if (otmp.spe <= 0) await message('Your marker has dried out.');
            else de.type = MARK;
            break;
        case TOWEL:
            de.ptext = false;
            if (de.oep) {
                if ([DUST, ENGR_BLOOD, MARK].includes(de.oep.engr_type)) {
                    if (is_wet_towel(otmp)) note_unported('apply.c dry_a_towel');
                    if (!blind) await message('You wipe out the message here.');
                    else await message(`${Yobjnam2(otmp, 'get', state)} ${de.frosted ? 'frosty' : 'dusty'}.`);
                    de.dengr = true;
                } else {
                    await message(`${Yname2(otmp, state)} can't wipe out this engraving.`);
                }
            } else {
                await message(`${Yobjnam2(otmp, 'get', state)} ${de.frosted ? 'frosty' : 'dusty'}.`);
            }
            break;
        default:
            break;
        }
        break;
    case VENOM_CLASS:
        await message('Writing a poison pen letter?');
        break;
    case ILLOBJ_CLASS:
        note_unported('hack.c impossible');
        break;
    }
    return true;
}

function engravingContext(state) {
    state.context ??= {};
    state.context.engraving ??= {};
    return state.context.engraving;
}

// C ref: engrave.c engrave(). `context.nextc` is represented as the remaining
// byte string at that C pointer; this keeps C's byte-counting behavior for
// rates, BUFSZ truncation and malformed UTF-8 without storing a JS pointer.
export async function engrave(state = game, env = {}) {
    const context = engravingContext(state);
    const say = async (text) => env.message?.(text, state);
    const sameSquare = context.pos?.x === state.u.ux
        && context.pos?.y === state.u.uy;
    if (!sameSquare) {
        await say('You are unable to continue engraving.');
        return 0;
    }

    let stylus;
    if (context.stylus === env.handsObject) {
        stylus = null;
    } else {
        for (let object = state.invent; object; object = object.nobj) {
            if (object === context.stylus) {
                stylus = object;
                break;
            }
        }
        if (!stylus) {
            await say('You are unable to continue engraving.');
            return 0;
        }
    }

    const firsttime = Math.trunc(context.actionct ?? 0) === 0;
    const neweng = firsttime;
    const carving = context.type === ENGRAVE || context.type === HEADSTONE;
    const dullingWep = Boolean(carving && stylus
        && stylus.oclass === WEAPON_CLASS
        && (stylus.otyp !== ATHAME || stylus.cursed));
    const marker = Boolean(stylus && stylus.otyp === MAGIC_MARKER
        && context.type === MARK);
    let rate = 10;
    let truncate = false;
    context.actionct = Math.trunc(context.actionct ?? 0) + 1;

    if (dullingWep && !is_blade(stylus, state)) {
        note_unported('pline.c impossible');
    } else if (context.type === MARK && !marker) {
        note_unported('pline.c impossible');
    }

    if (carving && stylus
        && (dullingWep || stylus.oclass === RING_CLASS
            || stylus.oclass === GEM_CLASS)) {
        rate = 1;
    } else if (marker) {
        rate = Math.min(rate, Math.trunc(stylus.spe) * 2);
    }

    const originalText = encodeUtf8ByteString(context.text ?? '');
    const remaining = encodeUtf8ByteString(context.nextc ?? '');
    const pointerOffset = Math.max(0, originalText.length - remaining.length);
    const remainingLength = remaining.length;
    let end = 0;
    let count = rate;
    while (end < remaining.length && count > 0) {
        if (remaining[end] !== 0x20) count--;
        end++;
    }
    // C's endc points at the NUL when the whole string fits; trailing spaces
    // are consumed because the loop walks through them before testing NUL.

    if (dullingWep) {
        let splitstack = false;
        let dulled = false;
        if (stylus.quan > 1) {
            if (firsttime) await say(`One of ${yname(stylus, state)} gets dull.`);
            stylus = context.stylus = splitobj(stylus, 1, {
                state,
                hooks: env.objectHooks ?? {},
                random: env.random,
            });
            stylus.owornmask = 0;
            splitstack = true;
        } else if (firsttime) {
            await say(`${Yname2(stylus, state)} gets dull.`);
        }
        if (context.actionct % 2 === 1) {
            if (stylus.spe <= -3) {
                if (firsttime) note_unported('pline.c impossible');
                truncate = true;
            } else if (end < remaining.length || context.actionct === 1) {
                stylus.spe -= 1;
                dulled = true;
            }
        }
        if (splitstack) {
            obj_extract_self(stylus, { state, hooks: env.inventoryHooks ?? {} });
            stylus = await hold_another_object(
                stylus,
                'You drop one %s!',
                donameFresh(stylus, state),
                null,
                { state, hooks: env.inventoryHooks ?? {} },
            );
        } else if (dulled && stylus.known) {
            await prinv(null, stylus, 1, { state, hooks: env.inventoryHooks ?? {} });
            update_inventory({ state, hooks: env.inventoryHooks ?? {} });
        }
    } else if (marker) {
        let inkCost = Math.max(Math.trunc(rate / 2), 1);
        if (stylus.spe < inkCost) {
            note_unported('pline.c impossible');
            inkCost = stylus.spe;
            truncate = true;
        }
        stylus.spe -= inkCost;
        update_inventory({ state, hooks: env.inventoryHooks ?? {} });
        if (stylus.spe === 0) {
            await say('Your marker dries out.');
            truncate = true;
        }
    }

    let finishVerb;
    switch (context.type) {
    default: finishVerb = 'your weird engraving'; break;
    case DUST:
        finishVerb = is_ice(state.u.ux, state.u.uy, state)
            ? 'writing in the frost' : 'writing in the dust';
        break;
    case HEADSTONE:
    case ENGRAVE: finishVerb = 'engraving'; break;
    case BURN:
        finishVerb = is_ice(state.u.ux, state.u.uy, state)
            ? 'melting your message into the ice'
            : 'burning your message into the floor';
        break;
    case MARK: finishVerb = 'defacing the dungeon'; break;
    case ENGR_BLOOD: finishVerb = 'scrawling'; break;
    }

    let buf = '';
    let oep = engr_at(state.u.ux, state.u.uy, state);
    if (oep) buf = oep.engr_txt?.[0] ?? '';
    const existingBytes = encodeUtf8ByteString(buf);
    const spaceLeft = Math.max(BUFSZ - existingBytes.length - 1, 0);
    if (end > spaceLeft) {
        await say('You run out of room to write.');
        end = spaceLeft;
        truncate = true;
    }
    if (truncate && end < remaining.length) {
        // C writes NUL at endc in context.text, so the persistent source text
        // is shortened through the pointer position rather than replacing
        // only the `nextc` suffix.
        context.text = decodeUtf8ByteString(
            originalText.slice(0, pointerOffset + end),
        );
        remaining.length = end;
        await say(`You are only able to write "${context.text}".`);
    } else {
        truncate = false;
    }
    buf = decodeUtf8ByteString(encodeUtf8ByteString(buf)
        .concat(remaining.slice(0, Math.min(spaceLeft, end))));
    make_engr_at(
        state.u.ux,
        state.u.uy,
        buf,
        null,
        (state.moves ?? 0) - (state.multi ?? 0),
        context.type,
        { state, random: env.random },
    );
    oep = engr_at(state.u.ux, state.u.uy, state);
    if (oep) {
        oep.eread = true;
        oep.erevealed = true;
    }

    if (end < remainingLength && !truncate) {
        context.nextc = decodeUtf8ByteString(remaining.slice(end));
        if (neweng) env.redraw?.(context.pos.x, context.pos.y, state);
        return 1;
    }

    if (truncate) {
        await say('You cannot write any more.');
    } else if (!firsttime) {
        await say(`You finish ${finishVerb}.`);
    }
    context.text = '';
    context.nextc = null;
    context.stylus = null;
    if (neweng) env.redraw?.(context.pos.x, context.pos.y, state);
    return 0;
}

// C ref: engrave.c doengrave() (956-1264), including its local setup,
// item effects, overwrite decision, text corruption order and occupation
// installation. Unported calls whose C results are discarded are skipped at
// their call sites and recorded by note_unported().
export async function doengrave(state = game, env = {}) {
    const say = async (text) => env.message?.(text, state);
    if (!await u_can_engrave(state, env)) return env.ECMD_FAIL ?? ECMD_FAIL;

    const de = doengrave_ctx_init(state);
    de.ret = env.ECMD_OK ?? ECMD_OK;
    state.multi = 0;
    state.nomovemsg = null;
    let initialMsgGiven = false;
    de.otmp = await env.getObject(
        'write with', stylus_ok, env.GETOBJ_PROMPT, state,
    );
    if (!de.otmp) {
        de.ret = env.ECMD_CANCEL;
        return de.ret;
    }

    if (de.otmp === env.handsObject) {
        de.fbuf = `your ${body_part(FINGERTIP, state.youmonst)}`;
        de.writer = de.fbuf;
    } else {
        de.writer = yname(de.otmp, state);
    }

    if (!freehand(state, env) && de.otmp !== state.uwep
        && !de.otmp.owornmask) {
        await say(`You have no free ${body_part(HAND, state.youmonst)} to write with!`);
        return de.ret;
    }
    if (de.jello) {
        await say(`You tickle ${env.monName?.(state.u.ustuck, state) ?? 'it'} with ${de.writer}.`);
        await say('Your message dissolves...');
        return de.ret;
    }
    if (!can_reach_floor(true, state)) {
        if (de.otmp.oclass !== WAND_CLASS) {
            await cant_reach_floor(
                state.u.ux, state.u.uy, false, true, false, state,
                { pline: env.message },
            );
            return de.ret;
        }
        await say(`You gesture, with your wand, towards the ${surface(state.u.ux, state.u.uy, state)} below you.`);
        initialMsgGiven = true;
    }

    const currentTyp = tileAt(state.u.ux, state.u.uy, state).typ;
    if (IS_ALTAR(currentTyp)) {
        if (!initialMsgGiven)
            await say(`You make a motion towards the altar with ${de.writer}.`);
        note_unported('pray.c altar_wrath');
        return de.ret;
    }
    if (IS_GRAVE(currentTyp)) {
        if (de.otmp === env.handsObject) {
            await say(`You would only make a small smudge on the ${surface(state.u.ux, state.u.uy, state)}.`);
            return de.ret;
        }
        if (!tileAt(state.u.ux, state.u.uy, state).disturbed) {
            note_unported('grave.c disturb_grave');
            return de.ret;
        }
    }

    if (!await doengrave_sfx_item(de, state, env)) return de.ret;
    if (IS_GRAVE(currentTyp)) {
        if (de.type === ENGRAVE || de.type === 0) {
            de.type = HEADSTONE;
        } else {
            de.type = DUST;
            de.dengr = false;
            de.teleengr = false;
            de.buf = '';
        }
    }

    if (de.doknown) {
        learnwand(de.otmp, state);
        if (objectType(de.otmp.otyp, state).oc_name_known)
            more_experienced(0, 10, state);
    }
    if (de.teleengr) {
        note_unported('engrave.c rloc_engr');
        de.oep.eread = false;
        de.oep.erevealed = false;
        de.disprefresh = true;
        de.oep = null;
    }
    if (de.dengr) {
        del_engr_at(state.u.ux, state.u.uy, state);
        de.oep = null;
        de.disprefresh = true;
    }
    if (de.buf) {
        make_engr_at(
            state.u.ux, state.u.uy, de.buf, de.ebuf, state.moves, de.type,
            { state, random: env.random },
        );
        const tmpEp = engr_at(state.u.ux, state.u.uy, state);
        if (!heroBlind(state) && tmpEp) {
            await say(`The engraving now reads: "${de.buf}".`);
            tmpEp.eread = true;
            tmpEp.erevealed = true;
            de.disprefresh = true;
        }
        de.ptext = false;
    }
    if (de.zapwand && de.otmp.spe < 0) {
        await say(`${Tobjnam(de.otmp, 'turns', state)}, then ${otense(de.otmp, 'fade')}.`);
        if (!IS_GRAVE(currentTyp))
            await say(`You are not going to get anywhere trying to write in the ${de.frosted ? 'frost' : 'dust'} with your dust.`);
        useup(de.otmp, { state, hooks: env.inventoryHooks ?? {} });
        de.otmp = null;
        de.ptext = false;
    }

    if (!de.ptext) {
        if (de.otmp && de.otmp.oclass === WAND_CLASS
            && !can_reach_floor(true, state)) {
            await cant_reach_floor(
                state.u.ux, state.u.uy, false, true, true, state,
                { pline: env.message },
            );
        }
        de.ret = env.ECMD_TIME ?? ECMD_TIME;
        if (de.disprefresh) env.redraw?.(state.u.ux, state.u.uy, state);
        return de.ret;
    }

    if (de.oep) {
        let choice = 'n';
        if (de.type === HEADSTONE) choice = 'y';
        else if (de.type === de.oep.engr_type
            && (!heroBlind(state) || [BURN, ENGRAVE].includes(de.oep.engr_type))) {
            choice = await env.yesNo?.(
                'Do you want to add to the current engraving?', 'ynq', 'y',
                true, state,
            ) ?? 'y';
            if (choice === 'q') {
                await say(Never_mind);
                if (de.disprefresh) env.redraw?.(state.u.ux, state.u.uy, state);
                return de.ret;
            }
        }

        if (choice === 'n' || heroBlind(state)) {
            if ([DUST, ENGR_BLOOD, MARK].includes(de.oep.engr_type)) {
                if (!heroBlind(state)) {
                    const description = de.oep.engr_type === DUST
                        ? (de.frosted ? 'written in the frost' : 'written in the dust')
                        : de.oep.engr_type === ENGR_BLOOD
                            ? 'scrawled in blood' : 'written';
                    await say(`You wipe out the message that was ${description} here.`);
                    del_engr_at(state.u.ux, state.u.uy, state);
                    de.oep = null;
                    de.disprefresh = true;
                } else {
                    de.eow = true;
                }
            } else if ([DUST, MARK, ENGR_BLOOD].includes(de.type)) {
                const verb = de.oep.engr_type === BURN
                    ? (de.frosted ? 'melted into' : 'burned into')
                    : 'engraved in';
                await say(`You cannot wipe out the message that is ${verb} the ${surface(state.u.ux, state.u.uy, state)} here.`);
                de.ret = env.ECMD_TIME ?? ECMD_TIME;
                if (de.disprefresh) env.redraw?.(state.u.ux, state.u.uy, state);
                return de.ret;
            } else if (de.type !== de.oep.engr_type || choice === 'n') {
                if (!heroBlind(state) || can_reach_floor(true, state))
                    await say('You will overwrite the current message.');
                de.eow = true;
            }
        } else if (encodeUtf8ByteString(de.oep.engr_txt?.[0] ?? '').length >= BUFSZ - 1) {
            await say('There is no room to add anything else here.');
            de.ret = env.ECMD_TIME ?? ECMD_TIME;
            if (de.disprefresh) env.redraw?.(state.u.ux, state.u.uy, state);
            return de.ret;
        }
    }

    de.eloc = surface(state.u.ux, state.u.uy, state);
    de.adding = Boolean(de.oep && !de.eow);
    doengrave_ctx_verb(de);
    if (de.otmp !== env.handsObject) {
        const oneOf = de.type === ENGRAVE && de.otmp.quan > 1 ? '1 of ' : '';
        await say(`You ${de.everb} the ${de.eloc} with ${oneOf}${donameFresh(de.otmp, state)}.`);
    } else {
        await say(`You ${de.everb} the ${de.eloc} with your ${body_part(FINGERTIP, state.youmonst)}.`);
    }

    de.qbuf = `What do you want to ${de.everb} the ${de.eloc} here?`;
    de.ebuf = env.mungspaces(await env.getLine(de.qbuf, state));
    const bytes = encodeUtf8ByteString(de.ebuf);
    let length = bytes.length;
    for (const byte of bytes) if (byte === 0x20) length--;
    if (!length || bytes.includes(0x1b)) {
        if (de.zapwand) {
            if (!heroBlind(state))
                await say(`${Tobjnam(de.otmp, 'glow', state)}, then ${otense(de.otmp, 'fade')}.`);
            de.ret = env.ECMD_TIME ?? ECMD_TIME;
        } else {
            await say(Never_mind);
        }
        if (de.disprefresh) env.redraw?.(state.u.ux, state.u.uy, state);
        return de.ret;
    }

    state.u.uconduct ??= {};
    if (length !== 1 || (!de.ebuf.includes('x') && !de.ebuf.includes('X'))) {
        if (!state.u.uconduct.literate++)
            livelog_printf(LL_CONDUCT,
                `became literate by engraving "${de.ebuf}"`, state);
    }
    const corrupted = [...bytes];
    for (let i = 0; i < corrupted.length; i++) {
        if (corrupted[i] === 0x20) continue;
        const damage = (de.type === DUST || de.type === ENGR_BLOOD)
            && !env.random.rn2(25)
            || heroBlind(state) && !env.random.rn2(11)
            || propertyActiveUnblocked(state.u, CONFUSION)
                && !env.random.rn2(7)
            || propertyActiveUnblocked(state.u, STUNNED)
                && !env.random.rn2(4)
            || propertyActiveUnblocked(state.u, HALLUC)
                && !propertyActiveUnblocked(state.u, HALLUC_RES)
                && !env.random.rn2(2);
        if (damage) corrupted[i] = 0x20 + env.random.rnd(94);
    }
    de.ebuf = decodeUtf8ByteString(corrupted);

    if (de.eow) {
        del_engr_at(state.u.ux, state.u.uy, state);
        de.oep = null;
        de.disprefresh = true;
    }
    const context = engravingContext(state);
    context.text = de.ebuf;
    context.nextc = context.text;
    context.stylus = de.otmp;
    context.type = de.type;
    context.pos = { x: state.u.ux, y: state.u.uy };
    context.actionct = 0;
    env.setOccupation((current) => engrave(current, env), 'engraving', 0, state);

    if (de.post_engr_text) await say(de.post_engr_text);
    if (de.doblind && !resists_blnd(state.youmonst, state)) {
        await say('You are blinded by the flash!');
        await make_blinded(env.random.rnd(50), false, state, env.blindingEnv ?? {});
        if (!heroBlind(state)) await say('Your vision clears.');
    }
    if (de.disprefresh) env.redraw?.(state.u.ux, state.u.uy, state);
    return de.ret;
}

function hasAttackType(species, attackType) {
    return Boolean(species?.mattk?.some(
        (attack) => attack.aatyp === attackType,
    ));
}

function ceilingHider(species) {
    return Boolean(species?.mflags1 & M1_HIDE)
        && ((Boolean(species.mflags1 & M1_CLING)
                && species.mlet !== S_MIMIC)
            || Boolean(species.mflags1 & M1_FLY));
}

function heroFlying(state) {
    const hero = state.u;
    const property = hero?.uprops?.[FLYING] ?? {};
    return Boolean(
        property.intrinsic
            || property.extrinsic
            || (hero?.usteed?.data?.mflags1 & M1_FLY),
    ) && !property.blocked;
}

// C ref: engrave.c can_reach_floor(), mondata.c sticks(), and trap.c
// uteetering_at_seen_pit()/uescaped_shaft().
export function can_reach_floor(checkPit = true, state = game) {
    const hero = state.u;
    const species = state.youmonst?.data;
    if (!hero || !species || !Number.isInteger(species.mflags1)
        || !Number.isInteger(species.msize)
        || !Array.isArray(species.mattk)) {
        throw new Error('can_reach_floor requires initialized hero form');
    }

    const holderSpecies = hero.ustuck?.data;
    const levitating = propertyActiveUnblocked(hero, LEVITATION);
    if (hero.uswallow
        || (holderSpecies && !sticks(species)
            && hasAttackType(holderSpecies, AT_HUGS))
        || (levitating
            && !(on_level(hero.uz, state.air_level)
                || on_level(hero.uz, state.water_level)))) {
        return false;
    }

    const ridingSkill = hero.weapon_skills?.[P_RIDING]?.skill ?? 0;
    if (hero.usteed && ridingSkill < P_BASIC) return false;
    if (hero.uundetected && ceilingHider(species)) return false;
    if (heroFlying(state) || species.msize >= MZ_HUGE) return true;

    if (checkPit) {
        const trap = t_at(hero.ux, hero.uy, state);
        if (uteetering_at_seen_pit(trap, state) || uescaped_shaft(trap, state))
            return false;
    }
    return true;
}

// C ref: engrave.c cant_reach_floor() (217-228). Emits the refusal message
// after the caller has already determined that can_reach_floor() is false.
// The pline callback is injected so this module need not depend on the tty
// display layer.
export async function cant_reach_floor(
    x, y, up, checkPit, wandEngraving, state = game, { pline } = {},
) {
    if (typeof pline !== 'function')
        throw new TypeError('cant_reach_floor requires a pline callback');
    const who = wandEngraving
        ? 'The wand does nothing more, and the tip of the wand'
        : 'You';
    let what;
    if (up) {
        // ceiling() imported from dungeon.js is not needed in this port's
        // callers yet; the only live call passes up=false.
        throw new Error('cant_reach_floor up=true not ported');
    } else {
        what = (checkPit && can_reach_floor(false, state))
            ? 'bottom of the pit'
            : surface(x, y, state);
    }
    await pline(`${who} can't reach the ${what}.`, state);
}

// C ref: engrave.c freehand() (469-477). Answers whether the hero has a hand
// free for something other than her weapon. A weapon that is not welded leaves
// one free whatever else she wears; a welded one leaves the off hand free
// unless the weapon is two-handed or a cursed shield occupies it.
export function freehand(state = game, env = {}) {
    const uwep = state.uwep;
    return !uwep || !welded(uwep, state, env)
        || (!bimanual(uwep, state) && (!state.uarms || !state.uarms.cursed));
}

// C ref: engrave.c read_engr_at(). The message callback is injected to avoid
// making the engraving substrate depend on the tty display implementation.
// Blind tactile ENGRAVE, HEADSTONE, and BURN paths invoke
// canReachFloor(true, state) synchronously; other paths do not require the
// callback.
export async function read_engr_at(
    x,
    y,
    state = game,
    { pline, canReachFloor } = {},
) {
    const engraving = engr_at(x, y, state);
    const text = engraving?.engr_txt?.[0] ?? '';
    if (!text) return false;
    if (typeof pline !== 'function')
        throw new TypeError('read_engr_at requires a pline callback');

    const blind = propertyActiveUnblocked(state.u, BLINDED);
    const onIce = state.level?.at(x, y)?.typ === ICE;
    const surface = onIce ? 'ice' : 'floor';
    const tactileFloor = () => {
        if (!blind) return true;
        if (typeof canReachFloor !== 'function') {
            throw new TypeError(
                'blind read_engr_at requires a canReachFloor callback',
            );
        }
        return Boolean(canReachFloor(true, state));
    };
    let sensed = false;
    switch (engraving.engr_type) {
    case DUST:
        if (!blind) {
            sensed = true;
            await pline(
                `Something is written here in the ${onIce ? 'frost' : 'dust'}.`,
                state,
            );
        }
        break;
    case ENGRAVE:
    case HEADSTONE:
        if (tactileFloor()) {
            sensed = true;
            await pline(`Something is engraved here on the ${surface}.`, state);
        }
        break;
    case BURN:
        if (tactileFloor()) {
            sensed = true;
            await pline(
                `Some text has been ${onIce ? 'melted' : 'burned'} into the ${surface} here.`,
                state,
            );
        }
        break;
    case MARK:
        if (!blind) {
            sensed = true;
            await pline(`There's some graffiti on the ${surface} here.`, state);
        }
        break;
    case ENGR_BLOOD:
        if (!blind) {
            sensed = true;
            await pline('You see a message scrawled in blood here.', state);
        }
        break;
    default:
        sensed = true;
        break;
    }
    if (!sensed) return false;

    const pristine = engraving.engr_txt[2] ?? text;
    const finalCharacter = text.at(-1) ?? '';
    const hasOriginalPunctuation = text.length >= 2
        && '.!?'.includes(finalCharacter)
        && pristine.at(-1) === finalCharacter;
    await pline(
        `You ${blind ? 'feel the words' : 'read'}: "${text}"${hasOriginalPunctuation ? '' : '.'}`,
        state,
    );
    engraving.engr_txt[1] = text;
    engraving.eread = true;
    engraving.erevealed = true;
    // C ref: engrave.c read_engr_at():400-402. Reading an engraving while
    // running interrupts the run after the messages and remembered text.
    if (state.context?.run > 0) {
        nomul(0, state);
    }
    return true;
}

// Degrade exactly `count` character selections. A selected space still uses
// the position and rubout draws, matching the source's continue statement.
export function wipeout_text(text, count, seed = 0, env = {}) {
    const { random } = engravingEnv(env);
    // C indexes the raw bytes of its UTF-8 char array. Surrogate escapes from
    // decodeUtf8ByteString preserve a byte when rubbing out one byte leaves a
    // malformed sequence, so later byte-oriented operations can round-trip it.
    const bytes = encodeUtf8ByteString(text);
    const length = bytes.length;
    let currentSeed = seed >>> 0;

    if (length && count > 0) {
        while (count-- > 0) {
            let next;
            let useRubout;
            if (!currentSeed) {
                next = random.rn2(length);
                useRubout = random.rn2(4);
            } else {
                next = currentSeed % length;
                currentSeed = Math.imul(currentSeed, 31) >>> 0;
                currentSeed %= BUFSZ - 1;
                useRubout = currentSeed & 3;
            }

            const character = String.fromCharCode(bytes[next]);
            if (character === ' ') continue;
            if (SMALL_PUNCTUATION.includes(character)) {
                bytes[next] = ' '.charCodeAt(0);
                continue;
            }

            const replacements = useRubout ? RUBOUTS.get(character) : null;
            if (!replacements) {
                bytes[next] = '?'.charCodeAt(0);
                continue;
            }

            let replacementIndex;
            if (!currentSeed) {
                replacementIndex = random.rn2(replacements.length);
            } else {
                currentSeed = Math.imul(currentSeed, 31) >>> 0;
                currentSeed %= BUFSZ - 1;
                replacementIndex = currentSeed % replacements.length;
            }
            bytes[next] = replacements.charCodeAt(replacementIndex);
        }
    }
    while (bytes.at(-1) === ' '.charCodeAt(0)) bytes.pop();
    return decodeUtf8ByteString(bytes);
}

// C ref: engrave.c u_wipe_engr() (264-268). Rubs out part of whatever the hero
// is standing on. With nothing engraved there wipe_engr_at() returns before
// its first draw, so an ordinary square costs nothing.
export function u_wipe_engr(count, env = {}) {
    const { state } = engravingEnv(env);
    if (can_reach_floor(true, state))
        wipe_engr_at(state.u.ux, state.u.uy, count, false, env);
}

export function wipe_engr_at(x, y, count, magical = false, env = {}) {
    const normalized = engravingEnv(env);
    const { random, state } = normalized;
    const engraving = engr_at(x, y, state);
    if (!engraving || engraving.engr_type === HEADSTONE || engraving.nowipeout)
        return engraving;

    const onIce = state.level?.at?.(x, y)?.typ === ICE;
    if (engraving.engr_type === BURN && !onIce
        && !(magical && !random.rn2(2))) {
        return engraving;
    }
    if (engraving.engr_type !== DUST && engraving.engr_type !== ENGR_BLOOD) {
        const bound = 1 + Math.trunc(50 / (count + 1));
        count = random.rn2(bound) ? 0 : 1;
    }

    engraving.engr_txt[0] = wipeout_text(
        engraving.engr_txt[0],
        count,
        0,
        normalized,
    ).replace(/^ +/u, '');
    if (!engraving.engr_txt[0])
        del_engr_at(x, y, state);
    return engr_at(x, y, state);
}
