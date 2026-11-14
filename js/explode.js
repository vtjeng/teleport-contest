// explode.js -- monster and object explosions.
// C refs: explode.c explosionmask(), engulfer_explosion_msg(), explode(),
// scatter(), adtyp_to_expltype() and mon_explodes().  This module keeps the
// complete explosion path together because corpse_chance() reaches it for gas
// spores and trap/object callers reach scatter().

import {
    A_STR,
    ACID_RES,
    COLD_RES,
    DISINT_RES,
    DISP_BEAM,
    DISP_CHANGE,
    DISP_END,
    EXPL_FIERY,
    EXPL_FROSTY,
    EXPL_MAGICAL,
    EXPL_MUDDY,
    EXPL_NOXIOUS,
    EXPL_WET,
    FIRE_RES,
    IS_SINK,
    LARGEST_INT,
    KILLED_BY,
    KILLED_BY_AN,
    NO_KILLER_PREFIX,
    LOST_EXPLODING,
    MON_EXPLODE,
    BURNING_OIL,
    BURNING,
    DIED,
    TRAP_EXPLODE,
    PHYS_EXPL_TYPE,
    PLNMSG_CAUGHT_IN_EXPLOSION,
    PLNMSG_TOWER_OF_FLAME,
    POISON_RES,
    SHOCK_RES,
    N_DIRS,
    SHOPBASE,
    STATUE_TRAP,
    XKILL_GIVEMSG,
    XKILL_NOCONDUCT,
    XKILL_NOCORPSE,
    XKILL_NOMSG,
    ZAP_POS,
    xdir,
    ydir,
    Upolyd,
    engulfing_u,
    u_at,
    uhim,
} from './const.js';
import { isok } from './cmd_isok.js';
import { exercise } from './attrib.js';
import {
    curs_on_u,
    nomul,
    nh_delay_output,
} from './hack.js';
import { dist2, s_suffix, lcase, lowc } from './hacklib.js';
import {
    GLYPH_EXPLODE_FIERY_OFF,
    GLYPH_EXPLODE_FROSTY_OFF,
    GLYPH_EXPLODE_MAGICAL_OFF,
    GLYPH_EXPLODE_MUDDY_OFF,
    GLYPH_EXPLODE_NOXIOUS_OFF,
    GLYPH_EXPLODE_WET_OFF,
} from './glyph_offsets.js';
import { game } from './gstate.js';
import { impossible, youHear } from './pline.js';
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
    PM_CLERIC,
    PM_MONK,
    PM_WIZARD,
    PM_HEALER,
    PM_KNIGHT,
} from './monsters.js';
import {
    completelyburns,
    bigmonst,
    cvt_adtyp_to_mseenres,
    dmgtype_fromattack,
    is_demon,
    is_vampshifter,
    Resists_Elem,
    monstseesu,
    monstunseesu,
    nonliving,
    resists_magm,
    sticks,
    hides_under,
} from './mondata.js';
import {
    BOULDER,
    EGG,
    GLASS,
    GOLD_PIECE,
    POT_OIL,
    RAY,
    SCR_FIRE,
    SCROLL_CLASS,
    STATUE,
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
import { burn_away_slime, end_burn } from './timeout.js';
import { rehumanize, ugolemeffects } from './polyself.js';
import {
    cmap_to_glyph,
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
    stackobjRuntime,
    sobj_at,
} from './invent.js';
import {
    place_object,
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
    pay_for_damage,
    shop_keeper,
} from './shk.js';
import { deltrap, t_at } from './trap.js';
import { Tobjnam } from './objnam.js';

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
import { coreRandom, rn2_on_display_rng } from './rng.js';
import { note_unported } from './unported.js';
import { unpunish as removePunishment } from './read.js';
import { S_expl_tl } from './symbols.js';
import { canspotmon } from './display.js';
import {
    Acid_resistance, Antimagic, Cold_resistance, Deaf, Disint_resistance,
    Fire_resistance, Hallucination, Invulnerable, Maybe_Half_Phys,
    Poison_resistance, Shock_resistance,
} from './youprop.js';

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

// C ref: explode.c explosionmask() (25-115).  This is pure: it spends no
// random numbers and changes no state, and is consequently also used by the
// display pass before any explosion effects are applied.
export function explosionmask(monster, adtyp, olet, state = game) {
    if (monster === state.youmonst) {
        switch (adtyp) {
        case AD_PHYS: return EXPL_NONE;
        case AD_MAGM: return Antimagic(state.u) ? EXPL_HERO : EXPL_NONE;
        case AD_FIRE: return Fire_resistance(state.u) ? EXPL_HERO : EXPL_NONE;
        case AD_COLD: return Cold_resistance(state.u) ? EXPL_HERO : EXPL_NONE;
        case AD_DISN:
            return (olet === WAND_CLASS
                ? (nonliving(monster.data) || is_demon(monster.data))
                : Disint_resistance(state.u)) ? EXPL_HERO : EXPL_NONE;
        case AD_ELEC: return Shock_resistance(state.u) ? EXPL_HERO : EXPL_NONE;
        case AD_DRST: return Poison_resistance(state.u) ? EXPL_HERO : EXPL_NONE;
        case AD_ACID: return Acid_resistance(state.u) ? EXPL_HERO : EXPL_NONE;
        default:
            // C: impossible("explosion type %d?", adtyp);
            note_unported('pline.c impossible');
            return EXPL_NONE;
        }
    }
    /* 'm' is a monster */
    switch (adtyp) {
    case AD_PHYS: return EXPL_NONE;
    case AD_MAGM: return resists_magm(monster, state) ? EXPL_MON : EXPL_NONE;
    case AD_FIRE:
        return Resists_Elem(monster, FIRE_RES, state) ? EXPL_MON : EXPL_NONE;
    case AD_COLD:
        return Resists_Elem(monster, COLD_RES, state) ? EXPL_MON : EXPL_NONE;
    case AD_DISN:
        return (olet === WAND_CLASS
            ? (nonliving(monster.data) || is_demon(monster.data)
                || is_vampshifter(monster))
            : Resists_Elem(monster, DISINT_RES, state)) ? EXPL_MON : EXPL_NONE;
    case AD_ELEC:
        return Resists_Elem(monster, SHOCK_RES, state) ? EXPL_MON : EXPL_NONE;
    case AD_DRST:
        return Resists_Elem(monster, POISON_RES, state) ? EXPL_MON : EXPL_NONE;
    case AD_ACID:
        return Resists_Elem(monster, ACID_RES, state) ? EXPL_MON : EXPL_NONE;
    default:
        // C: impossible("explosion type %d?", adtyp);
        note_unported('pline.c impossible');
        return EXPL_NONE;
    }
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
        text = `${s_suffix(rndmonnam({ state, random: env.displayRandom ?? rn2_on_display_rng }))} explosion`;
        tries++;
    } while (text[0] !== lowc(text[0]) && tries < 20);
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
    const random = env.random ?? coreRandom;
    let damu = dam;
    let visible = false;
    let anyShield = false;
    let uhurt = 0;
    let mdef = null;
    const shopdamage = { value: false };
    let generic = false;
    let doHallu = false;
    // C compares str with its hallu_buf by address; this marks that str
    // holds the hallucinatory text rather than the killer-name copy.
    let strIsHallu = false;
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
                if (type < 0 || type > 9) {
                    await impossible(
                        `explode: wand has bad zap type (${type}).`, state, env,
                    );
                    type = 0;
                }
            } else type = 0;
        }
        // you.h Role_switch reads the original role even while polymorphed.
        switch (state.urole.mnum) {
        case PM_CLERIC:
        case PM_MONK:
        case PM_WIZARD:
            damu = Math.trunc(damu / 5);
            break;
        case PM_HEALER:
        case PM_KNIGHT:
            damu = Math.trunc(damu / 2);
            break;
        default:
            break;
        }
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
        doHallu = Hallucination(state.u)
            && (str.includes("'s explosion") || str.includes("s' explosion"));
    }

    let adtyp;
    if (type === PHYS_EXPL_TYPE) {
        adtyp = AD_PHYS;
    } else {
        /* If str is e.g. "flaming sphere's explosion" from above, we want to
         * still assign adtyp appropriately, but not replace str. */
        let adstr;
        switch (Math.abs(type) % 10) {
        case 0: adstr = 'magical blast'; adtyp = AD_MAGM; break;
        case 1:
            adstr = olet === BURNING_OIL ? 'burning oil'
                : olet === SCROLL_CLASS ? 'tower of flame' : 'fireball';
            /* fire damage, not physical damage */
            adtyp = AD_FIRE;
            break;
        case 2: adstr = 'ball of cold'; adtyp = AD_COLD; break;
        case 4:
            adstr = olet === WAND_CLASS ? 'death field' : 'disintegration field';
            adtyp = AD_DISN;
            break;
        case 5: adstr = 'ball of lightning'; adtyp = AD_ELEC; break;
        case 6: adstr = 'poison gas cloud'; adtyp = AD_DRST; break;
        case 7: adstr = 'splash of acid'; adtyp = AD_ACID; break;
        default:
            await impossible(`explosion base type ${type}?`, state, env);
            return;
        }
        if (!str) str = adstr;
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

            if (monster && cansee(xx, yy, state) && !canspotmon(monster, state)) {
                map_invisible(xx, yy, state);
            } else if (!monster) {
                unmap_invisible(xx, yy, state, newsym);
            }
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
                            map_glyphinfo(cmap_to_glyph(shield, state), state));
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
        if (!Deaf(state.u) && olet !== SCROLL_CLASS) {
            note_unported('sound.c Soundeffect');
            const heard = youHear('a blast.', state);
            if (heard) await messageLine(heard, state, env);
            didmsg = true;
        }
    }

    if (!Deaf(state.u) && !didmsg) await messageLine('Boom!', state, env);

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
                        false, explodingWandTyp, state, random, env);
                }
                const monster = targetAt(xx, yy, state);
                if (!monster) continue;

                if (doHallu) {
                    str = hallucinatoryExplosion(state, env);
                    strIsHallu = true;
                }
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
                    if (Resists_Elem(monster, COLD_RES, state)
                        && adtyp === AD_FIRE) mdam *= 2;
                    else if (Resists_Elem(monster, FIRE_RES, state)
                        && adtyp === AD_COLD) mdam *= 2;
                    monster.mhp -= mdam + itemdmg;
                }

                if (monster.mhp <= 0) {
                    const xkillFlags = adtyp === AD_FIRE
                        && completelyburns(monster.data)
                        ? XKILL_NOCORPSE : 0;
                    if (!state.context?.mon_moving) {
                        // explode.c passes XKILL_GIVEMSG (zero) plus xkflg;
                        // do not suppress xkilled()'s ordinary kill line.
                        await xkilled(
                            monster,
                            XKILL_GIVEMSG | xkillFlags,
                            state,
                            env,
                        );
                    } else if (mdef && monster === mdef) {
                        if (cansee(monster.mx, monster.my, state)
                            || canspotmon(monster, state)) {
                            await messageLine(`${Monnam(monster, state, env)} is ${xkillFlags
                                ? 'burned completely' : nonliving(monster.data)
                                    ? 'destroyed' : 'killed'}!`, state, env);
                        }
                        await xkilled(
                            monster,
                            XKILL_NOMSG | XKILL_NOCONDUCT | xkillFlags,
                            state,
                            env,
                        );
                    } else {
                        if (xkillFlags) adtyp = AD_PHYS;
                        await monkilled(monster, '', adtyp, state, env);
                    }
                    // A recursive monster explosion can end the game in
                    // C's nonreturning done(); the enclosing blast stops too.
                    if (state.program_state?.gameover) return;
                } else if (!state.context?.mon_moving) {
                    await setmangry(monster, true, env);
                }
            }
        }
    }

    if (uhurt) {
        if (state.flags?.verbose && (type < 0 || olet !== SCROLL_CLASS)) {
            if (doHallu) {
                str = hallucinatoryExplosion(state, env);
                strIsHallu = true;
            }
            await messageLine(`You are caught in the ${str}!`, state, env);
            state.iflags ??= {};
            state.iflags.last_msg = PLNMSG_CAUGHT_IN_EXPLOSION;
        }
        if (adtyp === AD_FIRE) await burn_away_slime(state, env);
        if (Invulnerable(state.u)) {
            damu = 0;
            await messageLine('You are unharmed!', state, env);
        } else if (adtyp === AD_PHYS || adtyp === AD_ACID) {
            damu = Maybe_Half_Phys(damu, state.u);
        }
        if (adtyp === AD_FIRE) {
            await burnarmor(state.youmonst, { ...env, state, random });
            await ignite_items(state.invent, { ...env, state, random });
        }
        await destroy_items(state.youmonst, adtyp, dam, { ...env, state, random });
        // destroy_items() can kill the hero through an exploding potion, and
        // C's done() does not return.
        if (state.program_state?.gameover) return;
        await ugolemeffects(adtyp, damu, state, env);
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
            if (Upolyd(state.u)) await rehumanize(state, env);
            else {
                state.killer ??= { name: '', format: KILLED_BY };
                if (olet === MON_EXPLODE) {
                    // C explode.c:645-650. An unseen blast keeps the
                    // caller's killer name ("gas spore's explosion") while
                    // str says only "explosion"; otherwise the name is
                    // restored from str unless str is the hallucinatory text.
                    if (!generic && !strIsHallu) state.killer.name = str;
                    state.killer.format = KILLED_BY_AN;
                } else if (olet === TRAP_EXPLODE) {
                    // C explode.c:651-655 attributes a magical trap's fatal
                    // blast to the hero without a prefixed "killed by".
                    state.killer.name = `caught ${uhim(state)}self in a ${str}`;
                    state.killer.format = NO_KILLER_PREFIX;
                } else if (type >= 0 && olet !== SCROLL_CLASS) {
                    // C explode.c:656-660 attributes a fatal self-inflicted
                    // blast (a cast fireball, burning oil) to the original
                    // hero gender, without a prefixed "killed by" on the
                    // tombstone.
                    state.killer.name = `caught ${uhim(state)}self in ${state.flags?.female ? 'her' : 'his'} own ${str}`;
                    state.killer.format = NO_KILLER_PREFIX;
                } else {
                    state.killer.name = str;
                    // C explode.c:662-667 uses an article for a fireball or
                    // tower of flame, even when the source is a scroll.
                    state.killer.format = ['tower of flame', 'fireball']
                        .includes(lcase(str))
                        ? KILLED_BY_AN : KILLED_BY;
                }
                // explode.c:668-673 checks the last pline after item effects:
                // an intervening message replaces the blast's antecedent.
                const lastMessage = state.iflags?.last_msg;
                await messageLine(lastMessage === PLNMSG_CAUGHT_IN_EXPLOSION
                    || lastMessage === PLNMSG_TOWER_OF_FLAME
                    ? 'It is fatal.' : `The ${str} is fatal.`, state, env);
                const how = adtyp === AD_FIRE ? BURNING : DIED;
                await done(how, state, env);
                if (state.program_state?.gameover) return;
            }
        }
        await exercise(A_STR, false, state, random, {
            encumberMessage: env.encumberMessage
                ?? ((subject) => encumber_msg(subject, {
                    message: env.message,
                })),
        });
    }

    if (shopdamage.value) {
        const damageText = type === AD_FIRE ? 'burn away'
            : type === AD_COLD ? 'shatter'
                : type === AD_DISN ? 'disintegrate' : 'destroy';
        await pay_for_damage(damageText, false, state, { ...env, random });
    }
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
        note_unported('pline.c impossible');
        return 5;
    }
}

// C ref: explode.c mon_explodes() (1014-1067). The first d() is here and
// explode() does no random damage roll; corpse_chance() has already consumed
// its own first roll before calling this function.
export async function mon_explodes(mon, mattk, state = game, rawEnv = {}) {
    const env = { ...rawEnv, state };
    const random = env.random ?? coreRandom;
    let damage;
    if (mattk.damn) damage = random.d(mattk.damn, mattk.damd);
    else if (mattk.damd) damage = random.d((mon.data?.mlevel ?? 0) + 1, mattk.damd);
    else damage = 0;

    let type;
    if (mattk.adtyp === AD_PHYS) type = PHYS_EXPL_TYPE;
    else if (mattk.adtyp >= AD_MAGM && mattk.adtyp <= 10)
        type = -((mattk.adtyp - 1) + 20);
    else {
        note_unported('pline.c impossible');
        return;
    }
    if (mon.mhp > 0) await mondead(mon, state, env);
    state.killer ??= { name: '', format: KILLED_BY };
    state.killer.name = `${s_suffix(mon_pmname(mon, state))} explosion`;
    state.killer.format = KILLED_BY_AN;
    await explode(mon.mx, mon.my, type, damage, MON_EXPLODE,
        adtyp_to_expltype(mattk.adtyp), state, env);
    if (state.program_state?.gameover) return;
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
//
// C's scatter() calls its callees directly. A caller or a test may replace
// them only through `rawEnv.scatterOps`, whose keys SCATTER_OPERATIONS lists.
// Every other key of the environment belongs to the caller's own callees, and
// scatter() reads only the shared `random`, `message` and `hooks` from it:
// mthrowu.c's missile operations (js/unported_monster_actions.js
// monsterMissileEnv()) use several of these names with another signature, and
// a monster's wand of striking forwards them through muse.c mbhit() and
// dbridge.c destroy_drawbridge(). scripts/scatter-operations.test.mjs fails
// when scatter() reads any other key.
export const SCATTER_OPERATIONS = Object.freeze([
    'addToBill', 'breakObject', 'breakStatue', 'canSee', 'closedDoor',
    'costlySpot', 'creditReport', 'damageValue', 'extractObject',
    'floorEffects', 'fractureRock', 'heroAt', 'heroInShop', 'hideUnder',
    'hitHero', 'hitMonster', 'inRooms', 'isSink', 'maybeUnhideAt',
    'monsterAt', 'newsym', 'nomul', 'objectAt',
    'objectMaterial', 'placeObject', 'shopKeeper', 'shopOrigin', 'shopkeeper',
    'soundEffect', 'splitObject', 'stackObject', 'stopOccupation',
    'terrainAt', 'unpunish',
]);

export async function scatter(
    sx,
    sy,
    blastforce,
    scflags,
    obj = null,
    state = game,
    rawEnv = {},
) {
    const { scatterOps: ops = {}, ...forwarded } = rawEnv;
    for (const name of Object.keys(ops)) {
        if (!SCATTER_OPERATIONS.includes(name))
            throw new TypeError(`scatter() has no operation ${name}`);
    }
    const env = { ...forwarded, state };
    const random = env.random ?? coreRandom;
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
        note_unported('pline.c impossible');
    }

    const roomNumbers = ops.inRooms
        ?? ((x, y) => in_rooms(x, y, SHOPBASE, state));
    const costlySpot = ops.costlySpot
        ?? ((x, y) => costly_spot(x, y, state));
    const shopKeeper = ops.shopKeeper
        ?? ((roomno) => shop_keeper(roomno, state));
    const creditReport = ops.creditReport
        ?? ((keeper, index, silent) => credit_report(
            keeper,
            index,
            silent,
            state,
            { message },
        ));
    const addToBill = ops.addToBill
        ?? ((object, inInventory, dummy, silent) => addtobill(
            object,
            inInventory,
            dummy,
            silent,
            state,
            { ...env, message },
        ));
    const atShopWithHero = ops.heroInShop
        ?? ((roomno) => {
            const rooms = state.u?.urooms ?? state.u?.ushops ?? '';
            return rooms.includes(String.fromCharCode(roomno));
        });
    if (ops.shopOrigin != null) {
        shopOrigin = Boolean(ops.shopOrigin);
        shopkeeper = ops.shopkeeper ?? null;
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
    });
    const extractObject = ops.extractObject
        ?? ((object) => obj_extract_self(object, lifecycle));
    const splitObject = ops.splitObject
        ?? ((object, quantity) => splitobj(object, quantity, lifecycle));
    const placeObject = ops.placeObject
        ?? ((object, x, y) => place_object(object, x, y, lifecycle));
    // explode.c scatter():932 stackobj() can absorb a glob into a glob already
    // on the landing square, and merged() then prints pudding_merge_message();
    // the runtime form waits for that message.
    const stackObject = ops.stackObject
        ?? ((object) => stackobjRuntime(object, lifecycle));
    const objectAt = ops.objectAt
        ?? ((otyp, x, y) => sobj_at(otyp, x, y, state));
    const floorEffects = ops.floorEffects
        ?? ((object, x, y, verb) => flooreffects(
            object,
            x,
            y,
            verb,
            { ...lifecycle },
        ));
    const isVisible = ops.canSee
        ?? ((x, y) => cansee(x, y, state));
    const getMonster = ops.monsterAt
        ?? ((x, y) => m_at(x, y, state));
    const getHero = ops.heroAt
        ?? ((x, y) => u_at(x, y, state));
    const isClosedDoor = ops.closedDoor
        ?? ((x, y) => closed_door(x, y, state));
    const isSink = ops.isSink
        ?? ((typ) => IS_SINK(typ));
    const terrainAt = ops.terrainAt
        ?? ((x, y) => state.level?.at?.(x, y)?.typ);
    const hitMonster = ops.hitMonster
        ?? ((monster, object, range, verbose) => ohitmon(
            monster,
            object,
            range,
            verbose,
            { ...env, state, random, message },
        ));
    const damageValue = ops.damageValue
        ?? ((object, monster) => dmgval(object, monster, state, {
            ...env,
            state,
            random,
        }));
    const hitHero = ops.hitHero
        ?? ((hitValue, damage, object) => thitu(
            hitValue,
            damage,
            object,
            null,
            state,
            { ...env, state, random, message },
        ));
    const stopOccupation = ops.stopOccupation
        ?? (async (subject, operationEnv) => {
            // allmain.js imports explosion handling; resolve its canonical
            // interruption only when a scattered object strikes the hero.
            const { stop_occupation } = await import('./allmain.js');
            await stop_occupation(subject, { ...operationEnv, message });
        });
    const unpunish = ops.unpunish;
    const fractureRock = ops.fractureRock
        ?? ((object, operationEnv) => fracture_rock(
            object,
            state,
            random,
            { ...lifecycle, ...operationEnv, message },
        ));
    const breakStatue = ops.breakStatue
        ?? ((object, operationEnv) => zapBreakStatue(
            object,
            state,
            random,
            { ...lifecycle, ...operationEnv, message },
        ));
    const breakObject = ops.breakObject
        ?? ((object, x, y, operationEnv) => breaks(
            object,
            x,
            y,
            { ...lifecycle, ...operationEnv, message },
        ));
    const redraw = ops.newsym ?? newsym;
    const reveal = ops.maybeUnhideAt
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
            if (ops.soundEffect) await ops.soundEffect(
                'se_chain_shatters',
                25,
                state,
            );
            await message('The chain shatters!', state, env);
            if (typeof unpunish === 'function')
                await unpunish(state.uchain, state.uball, env);
            else
                removePunishment(state, env);
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

        // C gives fracture precedence over random destruction. The default
        // helpers call zap.c's fracture_rock() and break_statue(); hooks keep
        // their effects controllable in source-pinned scatter tests.
        if ((scflags & SCATTER_MAY_FRACTURE)
            && (scattered.otyp === BOULDER || scattered.otyp === STATUE)
            && random.rn2(10)) {
            if (scattered.otyp === BOULDER) {
                if (isVisible(sx, sy)) {
                    await message(`${Tobjnam(scattered, 'break', state)} apart.`,
                        state, env);
                } else {
                    if (ops.soundEffect) await ops.soundEffect(
                        'se_stone_breaking',
                        100,
                        state,
                    );
                    const heard = youHear('stone breaking.', state);
                    if (heard) await message(heard, state, env);
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
                    if (ops.soundEffect) await ops.soundEffect(
                        'se_stone_crumbling',
                        100,
                        state,
                    );
                    const heard = youHear('stone crumbling.', state);
                    if (heard) await message(heard, state, env);
                }
                await breakStatue(scattered, env);
                await placeObject(scattered, sx, sy);
            }
            await redraw(sx, sy, state);
            usedUp = true;
        } else if ((scflags & SCATTER_MAY_DESTROY)
            && (!random.rn2(10)
                || ((ops.objectMaterial?.(scattered)
                    ?? objectType(scattered, state).oc_material) === GLASS
                    || scattered.otyp === EGG))) {
            usedUp = Boolean(await breakObject(scattered, sx, sy, env));
        }

        if (!usedUp) {
            const direction = random.rn2(N_DIRS);
            // C's unsigned owt division is integral before it is subtracted.
            const rangeBase = Math.max(1, Math.trunc(blastforce)
                - Math.trunc(Math.trunc(scattered.owt) / 40));
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
                // C steps the global gb.bhitpos back too; a bhit() whose
                // zap_map() scattered debris resumes from that square.
                x -= chain.dx;
                y -= chain.dy;
                state.gb.bhitpos.x = x;
                state.gb.bhitpos.y = y;
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
                        if (state.multi
                            && !ops.nomul) nomul(0, state);
                        else if (ops.nomul) await ops.nomul(0, state);
                        const damage = await damageValue(chain.obj, state.youmonst);
                        const hitValue = 8 + chain.obj.spe
                            + (bigmonst(state.youmonst?.data) ? 1 : 0);
                        const hit = await hitHero(
                            hitValue,
                            Maybe_Half_Phys(damage, state.u),
                            chain.obj,
                        );
                        if (hit && typeof hit === 'object') {
                            if ('object' in hit) chain.obj = hit.object;
                            if (hit.hitu != null && hit.hitu) {
                                chain.range -= 3;
                                await stopOccupation(state, env);
                            }
                        } else if (hit) {
                            chain.range -= 3;
                            await stopOccupation(state, env);
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
            let leftShop = false;
            if (x !== sx || y !== sy) {
                total += chain.obj.quan;
                leftShop = shopOrigin && !costlySpot(x, y);
            }
            const consumed = await floorEffects(chain.obj, x, y, 'land');
            if (!consumed) {
                if (leftShop) {
                    const heroRoom = roomNumbers(state.u?.ux, state.u?.uy)
                        ?.[0] ?? 0;
                    if (chain.obj.otyp === GOLD_PIECE
                        && atShopWithHero(heroRoom)) {
                        await addToBill(chain.obj, false, false, true);
                        lostGoods = true;
                    }
                }
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
        if (ops.hideUnder) await ops.hideUnder(state.youmonst, env);
        else hideunder(state.youmonst, { ...env, state });
    }
    if (sourceMonster?.mtrapped) sourceMonster.mtrapped = 0;
    reveal(sx, sy);
    if (lostGoods && shopkeeper)
        await creditReport(shopkeeper, 1, false);
    return total;
}

// C ref: explode.c splatter_burning_oil() (962-970). The roll is consumed by
// explode() as the damage value, so keep it in this source function and pass
// the caller's RNG owner through unchanged.
export async function splatter_burning_oil(
    x,
    y,
    dilutedOil,
    state = game,
    rawEnv = {},
) {
    const env = { ...rawEnv, state };
    const random = env.random ?? coreRandom;
    const damage = random.d(dilutedOil ? 3 : 4, 4);
    await explode(x, y, 11, damage, BURNING_OIL, EXPL_FIERY, state,
        { ...env, random });
}

// C ref: explode.c explode_oil() (971-983). C calls impossible() only as a
// discarded diagnostic for a violated lit-oil precondition, then continues.
// It extinguishes the light and marks the object before the explosion can
// kill the hero or save bones.
export async function explode_oil(obj, x, y, state = game, rawEnv = {}) {
    const dilutedOil = Boolean(obj.odiluted);
    const env = { ...rawEnv, state };
    const random = env.random ?? coreRandom;

    if (!obj.lamplit) note_unported('pline.c impossible');
    end_burn(obj, true, env);
    obj.how_lost = LOST_EXPLODING;
    await splatter_burning_oil(x, y, dilutedOil, state, { ...env, random });
}
