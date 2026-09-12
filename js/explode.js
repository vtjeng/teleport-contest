// explode.js -- monster and object explosions.
// C refs: explode.c explosionmask(), engulfer_explosion_msg(), explode(),
// adtyp_to_expltype() and mon_explodes().  This module keeps the complete
// explosion path together because corpse_chance() reaches it for gas spores.

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
    KILLED_BY,
    KILLED_BY_AN,
    MON_EXPLODE,
    BURNING_OIL,
    TRAP_EXPLODE,
    PHYS_EXPL_TYPE,
    POISON_RES,
    SHOCK_RES,
    Upolyd,
    engulfing_u,
    isok,
    u_at,
} from './const.js';
import { exercise } from './attrib.js';
import {
    curs_on_u,
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
} from './mondata.js';
import {
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
    show_glyph_cell,
    tmp_at,
    unmap_invisible,
} from './display.js';
import { m_at } from './monst.js';
import {
    golemeffects,
    monkilled,
    mondead,
    seemimic,
    setmangry,
    wake_nearto,
    xkilled,
} from './mon.js';
import { canSpotMonster } from './startup_a11y.js';
import { cansee } from './vision.js';
import { destroy_items } from './zap_destroy_items.js';
import { resist, zap_over_floor } from './zap.js';
import { rndmonnam } from './do_name.js';
import { Monnam } from './do_name.js';
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
    state.killer.name = `${s_suffix(Monnam(mon, state, env))} explosion`;
    state.killer.format = KILLED_BY_AN;
    await explode(mon.mx, mon.my, type, damage, MON_EXPLODE,
        adtyp_to_expltype(mattk.adtyp), state, env);
    state.killer.name = '';
}
