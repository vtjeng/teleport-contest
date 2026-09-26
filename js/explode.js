// explode.js -- monster and object explosions.
// C refs: explode.c explosionmask(), engulfer_explosion_msg(), explode(),
// scatter(), adtyp_to_expltype() and mon_explodes().  This module keeps the
// complete explosion path together because corpse_chance() reaches it for gas
// spores and trap/object callers reach scatter().

import {
    A_STR,
    ACID_RES,
    ANTIMAGIC,
    COLD_RES,
    DEAF,
    DISINT_RES,
    DISP_BEAM,
    DISP_CHANGE,
    DISP_END,
    EXPL_FROSTY,
    EXPL_MAGICAL,
    EXPL_MUDDY,
    EXPL_NOXIOUS,
    EXPL_WET,
    FIRE_RES,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    INVULNERABLE,
    IS_SINK,
    LARGEST_INT,
    KILLED_BY,
    KILLED_BY_AN,
    MON_EXPLODE,
    BURNING_OIL,
    TRAP_EXPLODE,
    PHYS_EXPL_TYPE,
    POISON_RES,
    SHOCK_RES,
    N_DIRS,
    SHOPBASE,
    STATUE_TRAP,
    ZAP_POS,
    xdir,
    ydir,
    Upolyd,
    engulfing_u,
    isok,
    u_at,
} from './const.js';
import { exercise } from './attrib.js';
import {
    curs_on_u,
    losehp,
    nomul,
    nh_delay_output,
} from './hack.js';
import { dist2, s_suffix } from './hacklib.js';
import {
    GLYPH_EXPLODE_FIERY_OFF,
    GLYPH_EXPLODE_FROSTY_OFF,
    GLYPH_EXPLODE_MAGICAL_OFF,
    GLYPH_EXPLODE_MUDDY_OFF,
    GLYPH_EXPLODE_NOXIOUS_OFF,
    GLYPH_EXPLODE_WET_OFF,
} from './glyph_offsets.js';
import { game } from './gstate.js';
import {
    AD_ACID,
    AD_COLD,
    AD_DGST,
    AD_DISN,
    AD_DREN,
    AD_DRCO,
    AD_DISE,
    AD_DRDX,
    AD_DRST,
    AD_ELEC,
    AD_ENCH,
    AD_FIRE,
    AD_MAGM,
    AD_PEST,
    AD_PHYS,
    AD_SPEL,
    AT_ENGL,
} from './monsters.js';
import {
    completelyburns,
    bigmonst,
    cvt_adtyp_to_mseenres,
    dmgtype_fromattack,
    is_demon,
    is_vampshifter,
    monster_resists_element,
    monstseesu,
    monstunseesu,
    nonliving,
    resists_magm,
    sticks,
    hides_under,
} from './mondata.js';
import {
    GLASS,
    POT_OIL,
    RAY,
    SCR_FIRE,
    SCROLL_CLASS,
    WAN_DIGGING,
    WAN_MAGIC_MISSILE,
    WAN_SLEEP,
    WAND_CLASS,
} from './objects.js';
import {
    ignite_items,
} from './apply_catch_lit.js';
import {
    burnarmor,
} from './trap_erode_obj.js';
import { burn_away_slime } from './timeout.js';
import { rehumanize, ugolemeffects } from './polyself.js';
import {
    map_glyphinfo,
    map_invisible,
    newsym,
    show_glyph_cell,
    tmp_at,
    unmap_invisible,
} from './display.js';
import { m_at } from './monst.js';
import {
    golemeffects,
    hideunder,
    maybe_unhide_at,
    monkilled,
    mondead,
    seemimic,
    setmangry,
    wake_nearto,
    xkilled,
} from './mon.js';
import { ohitmon, thitu } from './mthrowu.js';
import { dmgval } from './weapon.js';
import {
    obj_extract_self,
    stackobj,
} from './invent.js';
import {
    place_object,
    remove_object,
    sobj_at,
    splitobj,
    objectType,
} from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { flooreffects } from './do.js';
import { closed_door } from './monmove.js';
import { in_rooms } from './rooms.js';
import {
    addtobill,
    costly_spot,
    credit_report,
    shop_keeper,
} from './shk.js';
import { deltrap, t_at } from './trap.js';
import { Tobjnam } from './objnam.js';
import { canSpotMonster } from './startup_a11y.js';
import { cansee } from './vision.js';
import { destroy_items } from './zap_destroy_items.js';
import {
    break_statue as zapBreakStatue,
    fracture_rock,
    resist,
    zap_over_floor,
} from './zap.js';
import { breaks } from './dothrow.js';
import { mon_pmname, Monnam, rndmonnam } from './do_name.js';
import { done } from './end.js';
import { encumber_msg } from './pickup.js';
import { ttyPline } from './tty_message.js';
import { d, rn1, rn2, rnd, rne } from './rng.js';
import { note_unported } from './unported.js';
import { S_expl_tl } from './symbols.js';

// Note: C's table is column first while the screen is row first.  These are
// the cmap indices for S_expl_tl through S_expl_br in C's explosion[3][3].
const explosion = Object.freeze([
    [96, 99, 102],
    [97, 100, 103],
    [98, 101, 104],
]);

const shieldStatic = Object.freeze([
    82, 83, 84, 83, 82, 83, 85,
    82, 83, 84, 83, 82, 83, 85,
    82, 83, 84, 83, 82, 83, 85,
]);

const EXPL_NONE = 0;
const EXPL_MON = 1;
const EXPL_HERO = 2;
const EXPL_SKIP = 4;

// C ref: hack.h scatter flags (1339-1344). These values are deliberately
// local to this source port: the generated const.js names describe an older
// internal bit layout, while explode.c's public scatter contract uses the
// patched C values below.
export const SCATTER_VIS_EFFECTS = 0x01;
export const SCATTER_MAY_HITMON = 0x02;
export const SCATTER_MAY_HITYOU = 0x04;
export const SCATTER_MAY_HIT = SCATTER_MAY_HITMON | SCATTER_MAY_HITYOU;
export const SCATTER_MAY_DESTROY = 0x08;
export const SCATTER_MAY_FRACTURE = 0x10;

// C ref: display.h explosion_to_glyph(). The returned presentation is what
// tmp_at()/show_glyph_cell() consume; unlike C, JavaScript's display layer
// resolves cmap indices to the current terminal presentation here.
export function explosion_to_glyph(expltype, cmap, state = game) {
    let offset;
    switch (expltype) {
    case EXPL_FROSTY: offset = GLYPH_EXPLODE_FROSTY_OFF; break;
    case EXPL_MAGICAL: offset = GLYPH_EXPLODE_MAGICAL_OFF; break;
    case EXPL_WET: offset = GLYPH_EXPLODE_WET_OFF; break;
    case EXPL_MUDDY: offset = GLYPH_EXPLODE_MUDDY_OFF; break;
    case EXPL_NOXIOUS: offset = GLYPH_EXPLODE_NOXIOUS_OFF; break;
    default: offset = GLYPH_EXPLODE_FIERY_OFF; break;
    }
    return map_glyphinfo(cmap - S_expl_tl + offset, state);
}

function propertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function hallucination(state) {
    return propertyActive(state, HALLUC)
        && !propertyActive(state, HALLUC_RES);
}

function deaf(state) {
    return propertyActive(state, DEAF) || Boolean(state.u?.uroleplay?.deaf);
}

function maybeHalfPhys(damage, state) {
    return propertyActive(state, HALF_PHDAM)
        ? Math.trunc((damage + 1) / 2) : damage;
}

function monsterResists(monster, adtyp, olet, state) {
    switch (adtyp) {
    case AD_PHYS: return false;
    case AD_MAGM: return resists_magm(monster, state);
    case AD_FIRE: return monster_resists_element(monster, FIRE_RES, state);
    case AD_COLD: return monster_resists_element(monster, COLD_RES, state);
    case AD_DISN:
        return olet === WAND_CLASS
            ? (nonliving(monster.data) || is_demon(monster.data)
                || is_vampshifter(monster))
            : monster_resists_element(monster, DISINT_RES, state);
    case AD_ELEC: return monster_resists_element(monster, SHOCK_RES, state);
    case AD_DRST: return monster_resists_element(monster, POISON_RES, state);
    case AD_ACID: return monster_resists_element(monster, ACID_RES, state);
    default:
        note_unported(`explode.c explosionmask() for adtyp ${adtyp}`);
        return false;
    }
}

// C ref: explode.c explosionmask() (25-115).  This is pure: it spends no
// random numbers and changes no state, and is consequently also used by the
// display pass before any explosion effects are applied.
export function explosionmask(monster, adtyp, olet, state = game) {
    if (monster === state.youmonst) {
        switch (adtyp) {
        case AD_PHYS: return EXPL_NONE;
        case AD_MAGM: return propertyActive(state, ANTIMAGIC) ? EXPL_HERO : EXPL_NONE;
        case AD_FIRE: return propertyActive(state, FIRE_RES) ? EXPL_HERO : EXPL_NONE;
        case AD_COLD: return propertyActive(state, COLD_RES) ? EXPL_HERO : EXPL_NONE;
        case AD_DISN:
            return (olet === WAND_CLASS
                ? (nonliving(monster.data) || is_demon(monster.data))
                : propertyActive(state, DISINT_RES)) ? EXPL_HERO : EXPL_NONE;
        case AD_ELEC: return propertyActive(state, SHOCK_RES) ? EXPL_HERO : EXPL_NONE;
        case AD_DRST: return propertyActive(state, POISON_RES) ? EXPL_HERO : EXPL_NONE;
        case AD_ACID: return propertyActive(state, ACID_RES) ? EXPL_HERO : EXPL_NONE;
        default:
            note_unported(`explode.c explosionmask() for adtyp ${adtyp}`);
            return EXPL_NONE;
        }
    }
    return monsterResists(monster, adtyp, olet, state) ? EXPL_MON : EXPL_NONE;
}

async function messageLine(text, state, env) {
    const message = env.message ?? ttyPline;
    await message(text, state, env);
}

// C ref: explode.c engulfer_explosion_msg() (117-179).
export async function engulfer_explosion_msg(adtyp, olet, state = game, env = {}) {
    const engulfer = state.u?.ustuck;
    if (!engulfer) return;
    const digestive = Boolean(dmgtype_fromattack(engulfer.data, AD_DGST, AT_ENGL));
    let adjective;
    if (digestive) {
        switch (adtyp) {
        case AD_FIRE: adjective = 'heartburn'; break;
        case AD_COLD: adjective = 'chilly'; break;
        case AD_DISN:
            adjective = olet === WAND_CLASS
                ? 'irradiated by pure energy' : 'perforated';
            break;
        case AD_ELEC: adjective = 'shocked'; break;
        case AD_DRST: adjective = 'poisoned'; break;
        case AD_ACID: adjective = 'an upset stomach'; break;
        default: adjective = 'fried'; break;
        }
        await messageLine(`${Monnam(engulfer, state, env)} gets ${adjective}!`,
            state, env);
    } else {
        switch (adtyp) {
        case AD_FIRE: adjective = 'toasted'; break;
        case AD_COLD: adjective = 'chilly'; break;
        case AD_DISN:
            adjective = olet === WAND_CLASS
                ? 'overwhelmed by pure energy' : 'perforated';
            break;
        case AD_ELEC: adjective = 'shocked'; break;
        case AD_DRST: adjective = 'intoxicated'; break;
        case AD_ACID: adjective = 'burned'; break;
        default: adjective = 'fried'; break;
        }
        await messageLine(
            `${Monnam(engulfer, state, env)} gets slightly ${adjective}!`,
            state, env,
        );
    }
}

function adtypForExplosion(type, olet, state, env) {
    let adtyp;
    let description;
    switch (Math.abs(type) % 10) {
    case 0: adtyp = AD_MAGM; description = 'magical blast'; break;
    case 1:
        adtyp = AD_FIRE;
        description = olet === BURNING_OIL ? 'burning oil'
            : olet === SCROLL_CLASS ? 'tower of flame' : 'fireball';
        break;
    case 2: adtyp = AD_COLD; description = 'ball of cold'; break;
    case 4:
        adtyp = AD_DISN;
        description = olet === WAND_CLASS ? 'death field' : 'disintegration field';
        break;
    case 5: adtyp = AD_ELEC; description = 'ball of lightning'; break;
    case 6: adtyp = AD_DRST; description = 'poison gas cloud'; break;
    case 7: adtyp = AD_ACID; description = 'splash of acid'; break;
    default:
        note_unported(`explode.c bad explosion base type ${type}`);
        return { adtyp: AD_MAGM, description: 'magical blast' };
    }
    return { adtyp, description };
}

function targetAt(x, y, state) {
    let monster = m_at(x, y, state);
    if (!monster && u_at(x, y, state)) monster = state.u?.usteed;
    if (monster?.mhp <= 0) return null;
    return monster;
}

function next2u(x, y, state) {
    return dist2(x, y, state.u.ux, state.u.uy) <= 2;
}

function hallucinatoryExplosion(state, env) {
    let text;
    let tries = 0;
    do {
        text = `${s_suffix(rndmonnam({ ...env, state }))} explosion`;
        tries++;
    } while (text[0] !== text[0]?.toLowerCase() && tries < 20);
    return text;
}

// C ref: explode.c explode() (199-696).  Every asynchronous operation is
// awaited at its source location so message waits and screen frames retain
// C's order.  The ordinary gas-spore path is physical (type -1), but the
// other C callers remain available for future wand/trap ports.
export async function explode(
    x,
    y,
    type,
    dam,
    olet,
    expltype,
    state = game,
    rawEnv = {},
) {
    const env = { ...rawEnv, state };
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    let damu = dam;
    let visible = false;
    let anyShield = false;
    let uhurt = 0;
    let mdef = null;
    const shopdamage = { value: false };
    let generic = false;
    let doHallu = false;
    let insideEngulfer;
    let grabbed = false;
    let grabbing = false;
    let explodingWandTyp = 0;
    let didmsg = false;
    let str = null;

    // C's retributive-wand and burning-oil setup.  The physical monster
    // explosion does not enter these arms, but preserving them keeps this
    // source unit's type conversion and floor-owner argument in one place.
    if (olet === WAND_CLASS) {
        if (type < 0) {
            type = -type;
            explodingWandTyp = type;
            const object = state.objects?.[type];
            if (object?.oc_dir === RAY && type !== WAN_DIGGING
                && type !== WAN_SLEEP) {
                type -= WAN_MAGIC_MISSILE;
                if (type < 0 || type > 9) type = 0;
            } else type = 0;
        }
        const role = state.flags?.role;
        if (role === 'cleric' || role === 'monk' || role === 'wizard')
            damu = Math.trunc(damu / 5);
        else if (role === 'healer' || role === 'knight')
            damu = Math.trunc(damu / 2);
    } else if (olet === BURNING_OIL) {
        explodingWandTyp = POT_OIL;
    } else if (olet === SCROLL_CLASS) {
        explodingWandTyp = SCR_FIRE;
    } else if (olet === TRAP_EXPLODE) {
        type = 0;
    }

    if (expltype < 0) {
        mdef = m_at(x, y, state);
        expltype = -expltype;
    }
    insideEngulfer = Boolean(state.u?.uswallow && type >= 0);
    if (state.u?.ustuck && !state.u.uswallow) {
        if (Upolyd(state.u) && sticks(state.youmonst?.data)) grabbing = true;
        else grabbed = true;
    }

    if (olet === MON_EXPLODE && type < 0) {
        str = state.killer?.name ?? '';
        doHallu = hallucination(state)
            && (str.includes("'s explosion") || str.includes("s' explosion"));
    }

    let adtyp;
    if (type === PHYS_EXPL_TYPE) {
        adtyp = AD_PHYS;
    } else {
        const converted = adtypForExplosion(type, olet, state, env);
        adtyp = converted.adtyp;
        if (!str) str = converted.description;
    }
    if (!str) str = type === PHYS_EXPL_TYPE ? 'gas spore\'s explosion' : 'explosion';

    const masks = Array.from({ length: 3 }, () => [0, 0, 0]);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const xx = x + i - 1;
            const yy = y + j - 1;
            if (!isok(xx, yy)) {
                masks[i][j] = EXPL_SKIP;
                continue;
            }
            let mask = 0;
            if (u_at(xx, yy, state)) mask = explosionmask(
                state.youmonst, adtyp, olet, state,
            );
            const monster = m_at(xx, yy, state);
            if (monster) mask |= explosionmask(monster, adtyp, olet, state);
            masks[i][j] = mask;

            if (monster && cansee(xx, yy, state) && !canSpotMonster(monster, state))
                map_invisible(xx, yy, state);
            else if (!monster)
                unmap_invisible(xx, yy, state);
            if (cansee(xx, yy, state)) visible = true;
            if (mask & (EXPL_MON | EXPL_HERO)) anyShield = true;
        }
    }

    if (visible) {
        let starting = true;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (masks[i][j] === EXPL_SKIP) continue;
                const xx = x + i - 1;
                const yy = y + j - 1;
                await tmp_at(starting ? DISP_BEAM : DISP_CHANGE,
                    explosion_to_glyph(expltype, explosion[i][j], state), state);
                await tmp_at(xx, yy, state);
                starting = false;
            }
        }
        await curs_on_u(state);
        if (anyShield && state.flags?.sparkle) {
            for (const shield of shieldStatic) {
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        if (!(masks[i][j] & (EXPL_MON | EXPL_HERO))) continue;
                        show_glyph_cell(x + i - 1, y + j - 1,
                            map_glyphinfo(shield, state));
                    }
                }
                await curs_on_u(state);
                await nh_delay_output(state);
            }
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    if (!(masks[i][j] & (EXPL_MON | EXPL_HERO))) continue;
                    show_glyph_cell(x + i - 1, y + j - 1,
                        explosion_to_glyph(expltype, explosion[i][j], state));
                }
            }
        } else {
            await nh_delay_output(state);
            await nh_delay_output(state);
        }
        await tmp_at(DISP_END, 0, state);
    } else {
        if (olet === MON_EXPLODE || olet === TRAP_EXPLODE) {
            str = 'explosion';
            generic = true;
        }
        if (!deaf(state) && olet !== SCROLL_CLASS) {
            note_unported('sound.c Soundeffect');
            await messageLine('You hear a blast.', state, env);
            didmsg = true;
        }
    }

    if (!deaf(state) && !didmsg) await messageLine('Boom!', state, env);

    if (dam) {
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (masks[i][j] === EXPL_SKIP) continue;
                const xx = x + i - 1;
                const yy = y + j - 1;
                if (u_at(xx, yy, state)) {
                    uhurt = (masks[i][j] & EXPL_HERO) ? 1 : 2;
                    if (!state.context?.mon_moving && olet === MON_EXPLODE
                        && type >= 0) uhurt = 0;
                } else if (insideEngulfer) continue;

                if (!(state.u?.uswallow && !state.context?.mon_moving)) {
                    await zap_over_floor(xx, yy, type, shopdamage,
                        false, explodingWandTyp, state, random);
                }
                const monster = targetAt(xx, yy, state);
                if (!monster) continue;

                if (doHallu) str = hallucinatoryExplosion(state, env);
                if (engulfing_u(monster, state)) {
                    await engulfer_explosion_msg(adtyp, olet, state, env);
                } else if (cansee(xx, yy, state)) {
                    if (monster.m_ap_type) seemimic(monster, state);
                    await messageLine(`${Monnam(monster, state, env)} is caught in the ${str}!`,
                        state, env);
                }

                const itemdmg = await destroy_items(monster, adtyp, dam,
                    { ...env, state, random });
                if (adtyp === AD_FIRE) {
                    await burnarmor(monster, { ...env, state, random });
                    await ignite_items(monster.minvent, { ...env, state, random });
                }

                if (masks[i][j] & EXPL_MON) {
                    await golemeffects(monster, adtyp, dam, { ...env, state, random });
                    monster.mhp -= itemdmg;
                } else {
                    let mdam = dam;
                    if (await resist(monster, olet, 0, false, state, random)) {
                        if (cansee(xx, yy, state) || insideEngulfer)
                            await messageLine(`${Monnam(monster, state, env)} resists the ${str}!`,
                                state, env);
                        mdam = Math.trunc((dam + 1) / 2);
                    }
                    if (grabbed && monster === state.u?.ustuck && next2u(x, y, state))
                        mdam *= 2;
                    if (monster_resists_element(monster, COLD_RES, state)
                        && adtyp === AD_FIRE) mdam *= 2;
                    else if (monster_resists_element(monster, FIRE_RES, state)
                        && adtyp === AD_COLD) mdam *= 2;
                    monster.mhp -= mdam + itemdmg;
                }

                if (monster.mhp <= 0) {
                    const xkillFlags = adtyp === AD_FIRE
                        && completelyburns(monster.data) ? 2 : 0;
                    if (!state.context?.mon_moving) {
                        await xkilled(monster, 1 | xkillFlags, state, env);
                    } else if (mdef && monster === mdef) {
                        if (cansee(monster.mx, monster.my, state)
                            || canSpotMonster(monster, state)) {
                            await messageLine(`${Monnam(monster, state, env)} is ${xkillFlags
                                ? 'burned completely' : nonliving(monster.data)
                                    ? 'destroyed' : 'killed'}!`, state, env);
                        }
                        await xkilled(monster, 4 | 2 | xkillFlags, state, env);
                    } else {
                        if (xkillFlags) adtyp = AD_PHYS;
                        await monkilled(monster, '', adtyp, state, env);
                    }
                } else if (!state.context?.mon_moving) {
                    await setmangry(monster, true, env);
                }
            }
        }
    }

    if (uhurt) {
        if (state.flags?.verbose && (type < 0 || olet !== SCROLL_CLASS)) {
            if (doHallu) str = hallucinatoryExplosion(state, env);
            await messageLine(`You are caught in the ${str}!`, state, env);
        }
        if (adtyp === AD_FIRE) await burn_away_slime(state);
        if (propertyActive(state, INVULNERABLE)) {
            damu = 0;
            await messageLine('You are unharmed!', state, env);
        } else if (adtyp === AD_PHYS || adtyp === AD_ACID) {
            damu = maybeHalfPhys(damu, state);
        }
        if (adtyp === AD_FIRE) {
            await burnarmor(state.youmonst, { ...env, state, random });
            await ignite_items(state.invent, { ...env, state, random });
        }
        await destroy_items(state.youmonst, adtyp, dam, { ...env, state, random });
        await ugolemeffects(adtyp, damu, state);
        if (uhurt === 2) {
            if (grabbing && state.u?.ustuck
                && dist2(state.u.ustuck.mx, state.u.ustuck.my, x, y) <= 2)
                damu *= 2;
            if (Upolyd(state.u)) state.u.mh -= damu;
            else state.u.uhp -= damu;
            state.disp ??= {};
            state.disp.botl = true;
        }
        const seenres = cvt_adtyp_to_mseenres(adtyp);
        if (uhurt === 1) monstseesu(seenres, state);
        else monstunseesu(seenres, state);
        if (state.u.uhp <= 0 || (Upolyd(state.u) && state.u.mh <= 0)) {
            if (Upolyd(state.u)) await rehumanize(state);
            else {
                state.killer ??= { name: '', format: KILLED_BY };
                state.killer.name = generic ? 'explosion' : str;
                state.killer.format = olet === MON_EXPLODE ? KILLED_BY_AN : KILLED_BY;
                await messageLine('It is fatal.', state, env);
                await done(adtyp === AD_FIRE ? 3 : 0, state, env);
            }
        }
        await exercise(A_STR, false, state, random, {
            encumberMessage: env.encumberMessage ?? encumber_msg,
        });
    }

    if (shopdamage.value) note_unported('shk.c pay_for_damage');
    let noise = dam * dam;
    if (noise < 50) noise = 50;
    if (insideEngulfer) noise = Math.trunc((noise + 3) / 4);
    await wake_nearto(x, y, noise, env);
}

// C ref: explode.c adtyp_to_expltype() (987-1012). Pure source mapping.
export function adtyp_to_expltype(adtyp) {
    switch (adtyp) {
    case AD_ELEC:
    case AD_SPEL:
    case AD_DREN:
    case AD_ENCH:
        return 4;
    case AD_FIRE: return 5;
    case AD_COLD: return 6;
    case AD_DRST:
    case AD_DRDX:
    case AD_DRCO:
    case AD_DISE:
    case AD_PEST:
    case AD_PHYS:
        return 1;
    default:
        note_unported(`explode.c adtyp_to_expltype() for adtyp ${adtyp}`);
        return 5;
    }
}

// C ref: explode.c mon_explodes() (1014-1067). The first d() is here and
// explode() does no random damage roll; corpse_chance() has already consumed
// its own first roll before calling this function.
export async function mon_explodes(mon, mattk, state = game, rawEnv = {}) {
    const env = { ...rawEnv, state };
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    let damage;
    if (mattk.damn) damage = random.d(mattk.damn, mattk.damd);
    else if (mattk.damd) damage = random.d((mon.data?.mlevel ?? 0) + 1, mattk.damd);
    else damage = 0;

    let type;
    if (mattk.adtyp === AD_PHYS) type = PHYS_EXPL_TYPE;
    else if (mattk.adtyp >= AD_MAGM && mattk.adtyp <= 10)
        type = -((mattk.adtyp - 1) + 20);
    else {
        note_unported(`explode.c mon_explodes() unknown type ${mattk.adtyp}`);
        return;
    }
    if (mon.mhp > 0) await mondead(mon, state, env);
    state.killer ??= { name: '', format: KILLED_BY };
    state.killer.name = `${s_suffix(mon_pmname(mon))} explosion`;
    state.killer.format = KILLED_BY_AN;
    await explode(mon.mx, mon.my, type, damage, MON_EXPLODE,
        adtyp_to_expltype(mattk.adtyp), state, env);
    state.killer.name = '';
}

// C ref: explode.c scatter() (721-947). Scatter is asynchronous here only
// because JavaScript's message, monster-hit, hero-hit and floor-effect owners
// are asynchronous; each await is at the corresponding C call site, so the
// random and state-write order remains the source order.
//
// The direct C callers are dokick.c really_kick_object(), kick_nondoor(), and
// obj_delivery(), pickup.c do_boh_explosion(), trap.c blow_up_landmine() and
// launch_obj(), and dbridge.c destroy_drawbridge(). Those callers are owned by
// their source files' spans. They pass the SCATTER_* values exported above and
// await this production entry point when their JavaScript ports land.
export async function scatter(
    sx,
    sy,
    blastforce,
    scflags,
    obj = null,
    state = game,
    rawEnv = {},
) {
    const env = { ...rawEnv, state };
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const message = env.message ?? ttyPline;
    const individualObject = Boolean(obj);
    const chains = [];
    let farthest = 0;
    let total = 0;
    let shopOrigin = false;
    let shopkeeper = null;
    let lostGoods = false;

    state.gb ??= {};
    state.gb.bhitpos ??= { x: sx, y: sy };
    state.gt ??= {};

    if (individualObject && (obj.ox !== sx || obj.oy !== sy)) {
        // C calls impossible() and continues. The diagnostic is deliberately
        // not a throw: the object may still be useful to a recovery caller.
        note_unported(
            `explode.c scatter object <${obj.ox},${obj.oy}> not at `
            + `scatter site <${sx},${sy}>`,
        );
    }

    const roomNumbers = env.inRooms
        ?? ((x, y) => in_rooms(x, y, SHOPBASE, state));
    const costlySpot = env.costlySpot
        ?? ((x, y) => costly_spot(x, y, state));
    const shopKeeper = env.shopKeeper
        ?? ((roomno) => shop_keeper(roomno, state));
    const creditReport = env.creditReport
        ?? ((keeper, index, silent) => credit_report(
            keeper,
            index,
            silent,
            state,
            { message },
        ));
    const addToBill = env.addToBill
        ?? ((object, inInventory, dummy, silent) => addtobill(
            object,
            inInventory,
            dummy,
            silent,
            state,
            { ...env, message },
        ));
    const atShopWithHero = env.heroInShop
        ?? ((roomno) => {
            const rooms = state.u?.urooms ?? state.u?.ushops ?? '';
            return rooms.includes(String.fromCharCode(roomno));
        });
    if (env.shopOrigin != null) {
        shopOrigin = Boolean(env.shopOrigin);
        shopkeeper = env.shopkeeper ?? null;
    } else {
        const roomno = roomNumbers(sx, sy)?.[0] ?? 0;
        shopkeeper = shopKeeper(roomno);
        shopOrigin = Boolean(shopkeeper && costlySpot(sx, sy));
    }
    if (shopOrigin && shopkeeper)
        await creditReport(shopkeeper, 0, true);

    const lifecycle = objectGenerationEnv({
        ...env,
        state,
        random,
        hooks: {
            ...env.hooks,
            extractExternalObject: env.hooks?.extractExternalObject
                ?? ((object, operationEnv) => remove_object(object, operationEnv)),
            // remove_object() and place_object() require the corresponding
            // boulder vision hooks. Ordinary scatter callers never need this
            // hook, but keeping it in the composed environment prevents a
            // partial object mutation when a boulder path does.
            recalcBlockPoint: env.hooks?.recalcBlockPoint
                ?? (() => {}),
        },
    });
    const extractObject = env.extractObject
        ?? ((object) => obj_extract_self(object, lifecycle));
    const splitObject = env.splitObject
        ?? ((object, quantity) => splitobj(object, quantity, lifecycle));
    const placeObject = env.placeObject
        ?? ((object, x, y) => place_object(object, x, y, lifecycle));
    const stackObject = env.stackObject
        ?? ((object) => stackobj(object, lifecycle));
    const objectAt = env.objectAt
        ?? ((otyp, x, y) => sobj_at(otyp, x, y, state));
    const floorEffects = env.floorEffects
        ?? ((object, x, y, verb) => flooreffects(
            object,
            x,
            y,
            verb,
            {
                ...lifecycle,
                unsupported: (reason) => {
                    note_unported(`do.c flooreffects: ${reason}`);
                    throw new Error(`scatter floor effect is unported: ${reason}`);
                },
            },
        ));
    const isVisible = env.canSee
        ?? ((x, y) => cansee(x, y, state));
    const getMonster = env.monsterAt
        ?? ((x, y) => m_at(x, y, state));
    const getHero = env.heroAt
        ?? ((x, y) => u_at(x, y, state));
    const isClosedDoor = env.closedDoor
        ?? ((x, y) => closed_door(x, y, state));
    const isSink = env.isSink
        ?? ((typ) => IS_SINK(typ));
    const terrainAt = env.terrainAt
        ?? ((x, y) => state.level?.at?.(x, y)?.typ);
    const hitMonster = env.hitMonster
        ?? ((monster, object, range, verbose) => ohitmon(
            monster,
            object,
            range,
            verbose,
            { ...env, state, random, message },
        ));
    const damageValue = env.damageValue
        ?? ((object, monster) => dmgval(object, monster, state, {
            ...env,
            state,
            random,
        }));
    const hitHero = env.hitHero
        ?? ((hitValue, damage, object) => thitu(
            hitValue,
            damage,
            object,
            null,
            state,
            {
                ...env,
                state,
                random,
                message,
                losehp: env.losehp ?? losehp,
                exercise: env.exercise ?? exercise,
            },
        ));
    const stopOccupation = env.stopOccupation;
    const unpunish = env.unpunish;
    const fractureRock = env.fractureRock
        ?? ((object, operationEnv) => fracture_rock(
            object,
            state,
            random,
            { ...lifecycle, ...operationEnv, message },
        ));
    const breakStatue = env.breakStatue
        ?? ((object, operationEnv) => zapBreakStatue(
            object,
            state,
            random,
            { ...lifecycle, ...operationEnv, message },
        ));
    const breakObject = env.breakObject
        ?? ((object, x, y, operationEnv) => breaks(
            object,
            x,
            y,
            { ...lifecycle, ...operationEnv, message },
        ));
    const redraw = env.newsym ?? ((x, y) => newsym(x, y));
    const reveal = env.maybeUnhideAt
        ?? ((x, y) => maybe_unhide_at(x, y, state, env));

    // C's while condition is deliberately reread after every extraction. For
    // an individual object, splitobj() leaves the reduced parent in place, so
    // the parent is revisited after its child has entered the chain.
    let individual = obj;
    while (true) {
        const otmp = individualObject
            ? individual
            : state.level?.objects?.[sx]?.[sy] ?? null;
        if (!otmp) break;

        if (otmp === state.uball || otmp === state.uchain) {
            const wasChain = otmp === state.uchain;
            if (env.soundEffect) await env.soundEffect(
                'se_chain_shatters',
                25,
                state,
            );
            await message('The chain shatters!', state, env);
            if (typeof unpunish === 'function')
                await unpunish(state.uchain, state.uball, env);
            else
                note_unported('read.c unpunish()');
            if (wasChain) continue;
        }

        let scattered = otmp;
        if (otmp.quan > 1) {
            let quantity = otmp.quan - 1;
            if (quantity > LARGEST_INT) quantity = LARGEST_INT;
            quantity = random.rnd(quantity);
            scattered = await splitObject(otmp, quantity);
        } else if (individualObject) {
            individual = null;
        }
        await extractObject(scattered);
        let usedUp = false;

        // C gives fracture precedence over random destruction. The two
        // fracture helpers are injected because zap.c owns them; callers that
        // do not reach a stone object never need that later source span.
        if ((scflags & SCATTER_MAY_FRACTURE)
            && (scattered.otyp === BOULDER || scattered.otyp === STATUE)
            && random.rn2(10)) {
            if (scattered.otyp === BOULDER) {
                if (isVisible(sx, sy)) {
                    await message(`${Tobjnam(scattered, 'break', state)} apart.`,
                        state, env);
                } else {
                    if (env.soundEffect) await env.soundEffect(
                        'se_stone_breaking',
                        100,
                        state,
                    );
                    await message('You hear stone breaking.', state, env);
                }
                await fractureRock(scattered, env);
                await placeObject(scattered, sx, sy);
                const otherBoulder = objectAt(BOULDER, sx, sy);
                if (otherBoulder) {
                    await extractObject(otherBoulder);
                    await placeObject(otherBoulder, sx, sy);
                }
            } else {
                const trap = t_at(sx, sy, state);
                if (trap?.ttyp === STATUE_TRAP)
                    deltrap(trap, state);
                if (isVisible(sx, sy)) {
                    await message(`${Tobjnam(scattered, 'crumble', state)}.`,
                        state, env);
                } else {
                    if (env.soundEffect) await env.soundEffect(
                        'se_stone_crumbling',
                        100,
                        state,
                    );
                    await message('You hear stone crumbling.', state, env);
                }
                await breakStatue(scattered, env);
                await placeObject(scattered, sx, sy);
            }
            await redraw(sx, sy, state);
            usedUp = true;
        } else if ((scflags & SCATTER_MAY_DESTROY)
            && (!random.rn2(10)
                || scattered.otyp === EGG
                || (scattered.oclass != null
                    && (env.objectMaterial?.(scattered)
                        ?? objectType(scattered, state).oc_material) === GLASS))) {
            usedUp = Boolean(await breakObject(scattered, sx, sy, env));
        }

        if (!usedUp) {
            const direction = random.rn2(N_DIRS);
            const rangeBase = Math.max(1,
                Math.trunc(blastforce - (Math.trunc(scattered.owt) / 40)));
            const chain = {
                obj: scattered,
                ox: sx,
                oy: sy,
                dx: xdir[direction],
                dy: ydir[direction],
                range: random.rnd(rangeBase),
                stopped: false,
            };
            chains.push(chain);
            if (farthest < chain.range) farthest = chain.range;
        }
    }

    for (let step = farthest; step > 0; --step) {
        for (const chain of chains) {
            // C's post-decrement is part of the condition: a range of one
            // takes exactly one movement step before becoming zero.
            if (chain.range <= 0 || chain.stopped) continue;
            chain.range -= 1;
            state.gt.thrownobj = chain.obj;
            let x = chain.ox + chain.dx;
            let y = chain.oy + chain.dy;
            state.gb.bhitpos.x = x;
            state.gb.bhitpos.y = y;
            if (!isok(x, y) || !ZAP_POS(terrainAt(x, y))
                || isClosedDoor(x, y)) {
                x -= chain.dx;
                y -= chain.dy;
                chain.stopped = true;
            } else {
                const monster = getMonster(x, y);
                if (monster) {
                    if (scflags & SCATTER_MAY_HITMON) {
                        chain.range -= 1;
                        if (await hitMonster(monster, chain.obj, 1, false)) {
                            chain.obj = null;
                            chain.stopped = true;
                        }
                    }
                } else if (getHero(x, y)) {
                    if (scflags & SCATTER_MAY_HITYOU) {
                        if ((state.multi ?? state.gm?.multi ?? 0)
                            && !env.nomul) nomul(0, state);
                        else if (env.nomul) await env.nomul(0, state);
                        const damage = await damageValue(chain.obj, state.youmonst);
                        const hitValue = 8 + chain.obj.spe
                            + (bigmonst(state.youmonst?.data) ? 1 : 0);
                        const hit = await hitHero(
                            hitValue,
                            maybeHalfPhys(damage, state),
                            chain.obj,
                        );
                        if (hit && typeof hit === 'object') {
                            if ('object' in hit) chain.obj = hit.object;
                            if (hit.hitu != null && hit.hitu) {
                                chain.range -= 3;
                                if (typeof stopOccupation === 'function')
                                    await stopOccupation(state, env);
                                else
                                    note_unported('allmain.c stop_occupation()');
                            }
                        } else if (hit) {
                            chain.range -= 3;
                            if (typeof stopOccupation === 'function')
                                await stopOccupation(state, env);
                            else
                                note_unported('allmain.c stop_occupation()');
                        }
                        if (!chain.obj) chain.stopped = true;
                    }
                } else if (scflags & SCATTER_VIS_EFFECTS) {
                    // explode.c's tmp_at()/nh_delay_output() calls are
                    // commented out in this source version; this branch is
                    // intentionally an observable no-op.
                }
            }
            chain.ox = x;
            chain.oy = y;
            if (isSink(terrainAt(x, y))) chain.stopped = true;
            state.gt.thrownobj = null;
        }
    }

    for (const chain of chains) {
        const x = chain.ox;
        const y = chain.oy;
        if (chain.obj) {
            if (x !== sx || y !== sy) {
                total += chain.obj.quan;
                const leftShop = shopOrigin && !costlySpot(x, y);
                if (leftShop) {
                    const heroRoom = roomNumbers(state.u?.ux, state.u?.uy)
                        ?.[0] ?? 0;
                    if (chain.obj.otyp === GOLD_PIECE
                        && atShopWithHero(heroRoom)) {
                        await addToBill(chain.obj, false, false, true);
                        lostGoods = true;
                    }
                }
            }
            const consumed = await floorEffects(chain.obj, x, y, 'land');
            if (!consumed) {
                await placeObject(chain.obj, x, y);
                await stackObject(chain.obj);
            }
        }
        await redraw(x, y, state);
    }
    await redraw(sx, sy, state);

    const sourceMonster = getMonster(sx, sy);
    if (getHero(sx, sy) && state.u?.uundetected
        && hides_under(state.youmonst?.data)) {
        if (env.hideUnder) await env.hideUnder(state.youmonst, env);
        else hideunder(state.youmonst, { ...env, state });
    }
    if (sourceMonster?.mtrapped) sourceMonster.mtrapped = 0;
    reveal(sx, sy);
    if (lostGoods && shopkeeper)
        await creditReport(shopkeeper, 1, false);
    return total;
}
