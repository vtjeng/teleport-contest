// apply.js -- the `a` command: using a tool.
// C refs: src/apply.c apply_ok(), doapply(), get_mleash(), use_cream_pie(),
// use_whip(), the polearm helpers and use_pole(), use_stethoscope(), its_dead(),
// reset_trapset(), use_trap(), and set_trap().
//
// doapply()'s switch has thirty-odd named arms. Its live groups include
// BULLWHIP and polearms, CREAM_PIE, STETHOSCOPE, OIL_LAMP/MAGIC_LAMP/
// BRASS_LANTERN through apply.c use_lamp(), WAX_CANDLE/TALLOW_CANDLE through
// use_candle(), and the LOCK_PICK/CREDIT_CARD/SKELETON_KEY arm that lock.c
// pick_lock() serves; MAGIC_MARKER delegates to write.c dowrite() in
// js/write.js; containers delegate to pickup.c use_container() in js/pickup.js;
// BAG_OF_TRICKS delegates to makemon.c bagotricks() in js/makemon.js; musical
// instruments delegate to music.c; LAND_MINE/BEARTRAP use apply.c
// use_trap()/set_trap(); and HORN_OF_PLENTY delegates to mkobj.c. Ordinary
// food and armor return their source unknown-use result. Other named arms,
// plus the wand, spellbook, and coin shortcuts above the switch, still stop at
// a refusal naming the C function they need.
// use_stethoscope() covers
// the no-hands, Deaf and free-hand guards, the free-action rule, self and
// off-map probes, the adjacent monster arm, both secret-terrain arms, an empty
// adjacent square, ordinary sighted and blind corpses and statues, and a
// Healer's statue-trap report. Mounted, swallowed, vertical, and cursed uses
// still stop.

import {
    ACCESSIBLE,
    ARTICLE_A,
    A_DEX,
    A_STR,
    AIR,
    BEAR_TRAP,
    BLINDED,
    COLNO,
    ROWNO,
    CQ_CANNED,
    CORR,
    CONFUSION,
    COST_SPLAT,
    DEAF,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    FLASHED_LIGHT,
    FACE,
    FOOT,
    FUMBLING,
    FORCETRAP,
    GLIB,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HALLUC,
    HALLUC_RES,
    HAND,
    KILLED_BY,
    has_mcorpsenm,
    isok,
    MCORPSENM,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    M_AP_TYPE,
    nothing_happens,
    OBJ_INVENT,
    PRONOUN_NO_IT,
    REVIVE_MON,
    D_ISOPEN,
    DISP_BEAM,
    DISP_END,
    FLYING,
    HALF_PHDAM,
    INTRINSIC,
    IS_DOOR,
    IS_FURNITURE,
    IS_OBSTRUCTED,
    IS_STWALL,
    IS_WATERWALL,
    LAVAWALL,
    LANDMINE,
    P_BASIC,
    P_NONE,
    P_SKILLED,
    P_RIDING,
    STOMACH,
    STONE,
    PROT_FROM_SHAPE_CHANGERS,
    STUNNED,
    JUMPING,
    LEG,
    LEVITATION,
    LEFT_SIDE,
    PASSES_WALLS,
    RIGHT_SIDE,
    SHOPBASE,
    TELEDS_NO_FLAGS,
    TELEDS_ALLOW_DRAG,
    TOOKPLUNGE,
    CLOUD,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    TT_INFLOOR,
    TT_LAVA,
    TT_PIT,
    TT_WEB,
    UNENCUMBERED,
    WOUNDED_LEGS,
    NO_KILLER_PREFIX,
    Is_airlevel,
    Is_waterlevel,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    TIMEOUT,
    Upolyd,
    uhim,
    u_at,
} from './const.js';
import {
    cmdq_add_ec,
    cmdq_add_key,
    confdir,
    extcmdRow,
    getdir,
    set_occupation,
    y_n,
} from './cmd.js';
import { cvt_sdoor_to_door } from './detect.js';
import { ceiling, surface } from './dungeon.js';
import { see_monster_closeup } from './dog.js';
import {
    cmap_to_glyph,
    feel_newsym,
    flush_screen,
    glyph_at,
    glyph_is_cmap,
    glyph_is_invisible,
    glyph_is_monster,
    glyph_is_statue,
    glyph_to_cmap,
    glyph_to_obj,
    map_object,
    map_invisible,
    map_glyphinfo,
    newsym,
    obj_to_glyph,
    tmp_at,
    unmap_invisible,
} from './display.js';
import { Amonnam, Monnam, mon_nam, obj_pmname, pmname, x_monnam } from './do_name.js';
import { can_reach_floor, freehand } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity, losehp, near_capacity, nomul, overexertion } from './hack.js';
import { dist2, highc, isqrt, s_suffix, strstri } from './hacklib.js';
import { mstatusline, ustatusline } from './insight.js';
import {
    delobj,
    carrying,
    consume_obj_charge,
    getobj,
    nxtobj,
    obj_extract_self,
    preflight_obfree,
    preflight_update_inventory,
    update_inventory,
    useupall,
    useup,
    hold_another_object,
    stackobj,
} from './invent.js';
import { pick_lock } from './lock.js';
import { bagotricks } from './makemon.js';
import { seemimic, set_ustuck, wakeup, wake_nearto } from './mon.js';
import {
    can_blnd,
    gender,
    humanoid,
    is_female,
    is_male,
    nohands,
    nolimbs,
    pronoun_gender,
    slithy,
    throws_rocks,
    type_is_pname,
    bigmonst,
    touch_petrifies,
    little_to_big,
    big_to_little,
    poly_when_stoned,
} from './mondata.js';
import { accessible, closed_door, youHear } from './monmove.js';
import { m_at } from './monst.js';
import { do_play_instrument } from './music.js';
import { get_mtraits } from './corpstat.js';
import { discover_object } from './o_init.js';
import {
    costly_alteration,
    bill_dummy_object,
    hornoplenty,
    init_dummyobj,
    is_axe,
    is_boots,
    is_gloves,
    is_graystone,
    is_pick,
    hasContents,
    newObject,
    objectType,
    obj_no_longer_held,
    place_object,
    set_bknown,
    sobj_at,
    carried,
    splitobj,
    weight,
} from './obj.js';
import {
    simple_typename,
    simpleonames,
    an,
    cxname,
    donameFresh,
    singular,
    Tobjnam,
    the,
    The,
    Yname2,
    otense,
    safe_qbuf,
    thesimpleoname,
    yname,
    xnameFresh,
} from './objnam.js';
import {
    ARMOR_CLASS,
    BANANA,
    BRASS_LANTERN,
    BULLWHIP,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    CREDIT_CARD,
    EUCALYPTUS_LEAF,
    FOOD_CLASS,
    GEM_CLASS,
    HORN_OF_PLENTY,
    BUGLE,
    DRUM_OF_EARTHQUAKE,
    FIRE_HORN,
    FROST_HORN,
    LEATHER_DRUM,
    MAGIC_FLUTE,
    MAGIC_HARP,
    TOOLED_HORN,
    WOODEN_FLUTE,
    WOODEN_HARP,
    LENSES,
    LOCK_PICK,
    LUMP_OF_ROYAL_JELLY,
    MAGIC_MARKER,
    MAGIC_LAMP,
    OIL_LAMP,
    POT_OIL,
    POTION_CLASS,
    SKELETON_KEY,
    SLIME_MOLD,
    SPBOOK_CLASS,
    STATUE,
    STETHOSCOPE,
    TOOL_CLASS,
    TOUCHSTONE,
    WAND_CLASS,
    WEAPON_CLASS,
    LARGE_BOX,
    CHEST,
    ICE_BOX,
    LEASH,
    SACK,
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    OILSKIN_SACK,
    EXPENSIVE_CAMERA,
    DWARVISH_MATTOCK,
    PICK_AXE,
    CANDELABRUM_OF_INVOCATION,
    TALLOW_CANDLE,
    WAX_CANDLE,
    LAND_MINE,
    BEARTRAP,
} from './objects.js';
import {
    AT_WEAP, MZ_TINY, PM_ARCHEOLOGIST, PM_HEALER, PM_HORSE,
    PM_STONE_GOLEM,
} from './monsters.js';
import { body_part, mbodypart, polymon } from './polyself.js';
import { djinni_from_bottle, make_blinded, make_glib } from './potion.js';
import { canSpotMonster, heroIsBlind, sensesMonster } from './startup_a11y.js';
import { P_SKILL } from './startup_skills.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { obj_has_timer } from './timeout.js';
import {
    activate_statue_trap, deltrap, is_lava, is_pool, is_pool_or_lava,
    Levitation, maketrap, reset_utrap, t_at, trapname,
} from './trap.js';
import { dotrap, feeltrap } from './trap_effects.js';
import { ttyPline } from './tty_message.js';
import {
    cansee,
    couldsee,
    recalc_block_point,
    unblock_point,
    vision_recalc,
} from './vision.js';
import { bimanual, is_pole, setnotworn } from './worn.js';
import { dowrite } from './write.js';
import { pickup_object, use_container } from './pickup.js';
import { use_pick_axe } from './dig.js';
import { genders } from './roles.js';
import { d, rn1, rn2, rnd, rne, rnl, rnz } from './rng.js';
import {
    check_unpaid,
    check_unpaid_usage,
    costly_spot,
    shop_keeper,
    shk_your,
    UnsupportedShopError,
} from './shk.js';
import { begin_burn, end_burn } from './timeout.js';
import { wield_tool } from './wield.js';
import { acurr } from './attrib.js';
import { known_spell, spe_Fresh, spelleffects } from './spell.js';
import { stucksteed } from './steed.js';
import { enexto, teleds } from './teleport.js';
import { fingers_or_gloves } from './do_wear.js';
import { dropx, legs_in_no_shape, set_wounded_legs } from './do.js';
import { morehungry } from './eat.js';
import { digests, hurtle_jump, thitmonst, walk_path } from './dothrow.js';
import { makeplural } from './fruit.js';
import { getpos } from './getpos.js';
import { SPE_JUMPING, BOULDER } from './objects.js';
import { S_goodpos } from './symbols.js';
import { in_rooms } from './rooms.js';
import { On_stairs, stairway_at } from './stairs.js';
import { set_voice } from './sounds.js';
import {
    attack_checks,
    check_caitiff,
    flash_hits_mon,
    force_attack,
} from './uhitm.js';
import { transient_light_cleanup } from './light.js';
import { bhit, zapyourself } from './zap.js';
import { verbalize } from './pline.js';
import { note_unported } from './unported.js';
import { dbon, setmnotwielded, uwep_skill_type } from './weapon.js';
import { mwelded } from './wield.js';
import { u_wipe_engr } from './engrave.js';
import { ART_SNICKERSNEE, Stone_resistance } from './artifacts.js';

function applyPropertyActive(property, state = game) {
    const value = state.u?.uprops?.[property];
    return Boolean((value?.intrinsic || value?.extrinsic) && !value?.blocked);
}

function applyIsConfused(state) {
    return Boolean(state.u?.uprops?.[CONFUSION]?.intrinsic);
}

function applyIsStunned(state) {
    return Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
}

function applyIsHallucinating(state) {
    const hallu = state.u?.uprops?.[HALLUC];
    const resist = state.u?.uprops?.[HALLUC_RES];
    return Boolean((hallu?.intrinsic || hallu?.extrinsic) && !hallu?.blocked
        && !(resist?.intrinsic || resist?.extrinsic));
}

function applyIsFumbling(state) {
    return applyPropertyActive(FUMBLING, state);
}

function applyIsGlib(state) {
    return applyPropertyActive(GLIB, state);
}

function polearmContext(state) {
    state.context ??= {};
    state.context.polearm ??= { hitmon: null };
    return state.context.polearm;
}

// C ref: apply.c calc_pole_range() (3371-3385). `gp` keeps this range for the
// duration of targeting, while context.polearm owns the remembered target.
export function calc_pole_range(state = game) {
    const type = uwep_skill_type(state);
    const skill = type === P_NONE ? P_NONE : P_SKILL(type, state);
    const minRange = 4;
    const maxRange = type === P_NONE || skill <= P_BASIC
        ? 4 : skill === P_SKILLED ? 5 : 8;
    state.gp ??= {};
    state.gp.polearm_range_min = minRange;
    state.gp.polearm_range_max = maxRange;
    return { minRange, maxRange };
}

function glyphIsPoleable(glyph) {
    return glyph_is_monster(glyph) || glyph_is_invisible(glyph)
        || glyph_is_statue(glyph);
}

// C ref: apply.c get_valid_polearm_position() (3321-3331).
export function get_valid_polearm_position(x, y, state = game) {
    const glyph = glyph_at(x, y, state);
    const distance = dist2(x, y, state.u.ux, state.u.uy);
    return isok(x, y) && distance >= state.gp?.polearm_range_min
        && distance <= state.gp?.polearm_range_max
        && (cansee(x, y, state)
            || (couldsee(x, y, state) && glyphIsPoleable(glyph)));
}

// C ref: apply.c display_polearm_positions() (3334-3353).
export async function display_polearm_positions(onOff, state = game) {
    if (onOff) {
        await tmp_at(DISP_BEAM, cmap_to_glyph(S_goodpos, state), state);
        for (let dx = -3; dx <= 3; ++dx) {
            for (let dy = -3; dy <= 3; ++dy) {
                const x = state.u.ux + dx;
                const y = state.u.uy + dy;
                if (get_valid_polearm_position(x, y, state))
                    await tmp_at(x, y, state);
            }
        }
    } else {
        await tmp_at(DISP_END, 0, state);
    }
}

// C ref: apply.c find_poleable_mon() (3284-3318). Preserve its x-major then
// y-major scan and the single-target-only result.
export function find_poleable_mon(pos, state = game) {
    const impaired = applyIsConfused(state) || applyIsStunned(state)
        || applyIsHallucinating(state);
    const rt = isqrt(state.gp.polearm_range_max);
    const lowX = Math.max(state.u.ux - rt, 1);
    const highX = Math.min(state.u.ux + rt, COLNO - 1);
    const lowY = Math.max(state.u.uy - rt, 0);
    const highY = Math.min(state.u.uy + rt, ROWNO - 1);
    let candidate = null;
    for (let x = lowX; x <= highX; ++x) {
        for (let y = lowY; y <= highY; ++y) {
            if (!get_valid_polearm_position(x, y, state)) continue;
            const glyph = glyph_at(x, y, state);
            const monster = !impaired && glyph_is_monster(glyph)
                ? m_at(x, y, state) : null;
            if (monster && (monster.mtame
                || (monster.mpeaceful && state.flags.confirm)))
                continue;
            if (glyphIsPoleable(glyph)
                && (!glyph_is_statue(glyph) || impaired)) {
                if (candidate) return false;
                candidate = { x, y };
            }
        }
    }
    if (!candidate) return false;
    pos.x = candidate.x;
    pos.y = candidate.y;
    return true;
}

// C ref: apply.c could_pole_mon() (3388-3411).
export function could_pole_mon(state = game) {
    if (!state.uwep || !is_pole(state.uwep, state)) return false;
    const { minRange, maxRange } = calc_pole_range(state);
    const pos = { x: state.u.ux, y: state.u.uy };
    if (find_poleable_mon(pos, state)) return true;
    const hitmon = polearmContext(state).hitmon;
    if (hitmon && hitmon.mhp > 0 && sensesMonster(hitmon, state)) {
        const distance = dist2(hitmon.mx, hitmon.my, state.u.ux, state.u.uy);
        if (distance <= maxRange && distance >= minRange) return true;
    }
    return false;
}

// C ref: apply.c snickersnee_used_dist_attk() (3414-3422).
export function snickersnee_used_dist_attk(obj, state = game) {
    return Boolean(obj && obj === state.uwep
        && obj.oartifact === ART_SNICKERSNEE
        && state.context?.snickersnee_turn === state.moves);
}

// C ref: apply.c use_whip() (2955-3279). The source's fire_damage(),
// kick_steed(), possibly_unwield(), and instapetrify() results are discarded;
// record those unported void boundaries without substituting a result.
export async function use_whip(obj, state = game) {
    let monster;
    let rx;
    let ry;
    let proficient = 0;
    const msgSlipsFree = 'The bullwhip slips free.';
    const msgSnap = 'Snap!';
    const u = state.u;

    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'lash', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('apply'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }
    if (!await getdir(null, state)) return ECMD_OK | ECMD_CANCEL;

    if (u.uswallow) {
        monster = u.ustuck;
        rx = monster.mx;
        ry = monster.my;
    } else {
        confdir(false, state);
        rx = u.ux + u.dx;
        ry = u.uy + u.dy;
        if (!isok(rx, ry)) {
            await ttyPline('You miss.', state);
            return ECMD_OK;
        }
        monster = m_at(rx, ry, state);
    }

    if (state.urole?.mnum === PM_ARCHEOLOGIST) ++proficient;
    const dexterity = acurr(state, A_DEX);
    if (dexterity < 6) --proficient;
    else if (dexterity >= 14) proficient += dexterity - 14;
    if (applyIsFumbling(state)) --proficient;
    proficient = Math.max(0, Math.min(3, proficient));

    if (u.uswallow) {
        await ttyPline("There's not enough room to flick your bullwhip.", state);
    } else if (u.uinwater) {
        await ttyPline("There's too much resistance to flick your bullwhip.", state);
    } else if (u.dz < 0) {
        await ttyPline(`You flick a bug off of the ${ceiling(u.ux, u.uy, state)}.`, state);
    } else if (!u.dz && (IS_WATERWALL(state.level.at(rx, ry).typ)
        || state.level.at(rx, ry).typ === LAVAWALL)) {
        await ttyPline('You cause a small splash.', state);
        if (state.level.at(rx, ry).typ === LAVAWALL)
            note_unported('trap.c fire_damage');
        return ECMD_TIME;
    } else if ((!u.dx && !u.dy) || u.dz > 0) {
        if (u.usteed && !rn2(proficient + 2)) {
            await ttyPline(`You whip ${mon_nam(u.usteed, state)}!`, state);
            note_unported('steed.c kick_steed');
            return ECMD_TIME;
        }
        if (is_pool_or_lava(u.ux, u.uy, state)
            || IS_WATERWALL(state.level.at(rx, ry).typ)
            || state.level.at(rx, ry).typ === LAVAWALL) {
            await ttyPline('You cause a small splash.', state);
            if (is_lava(u.ux, u.uy, state))
                note_unported('trap.c fire_damage');
            return ECMD_TIME;
        }
        if (Levitation(state) || u.usteed || applyPropertyActive(FLYING, state)) {
            let object = state.level.objects?.[u.ux]?.[u.uy] ?? null;
            if (object?.otyp === CORPSE
                && [PM_HORSE, little_to_big(PM_HORSE), big_to_little(PM_HORSE)]
                    .includes(object.corpsenm)) {
                await ttyPline('Why beat a dead horse?', state);
                return ECMD_TIME;
            }
            if (object && proficient) {
                const name = an(singular(object, xnameFresh, state), state);
                await ttyPline(
                    `You wrap your bullwhip around ${name} on the ${surface(u.ux, u.uy, state)}.`,
                    state,
                );
                if (rnl(6) || await pickup_object(object, 1, true, state) < 1)
                    await ttyPline(msgSlipsFree, state);
                return ECMD_TIME;
            }
        }
        let damage = rnd(2) + dbon(state) + obj.spe;
        if (damage <= 0) damage = 1;
        await ttyPline(`You hit your ${body_part(FOOT, state.youmonst)} with your bullwhip.`, state);
        const killer = `killed ${uhim(state)}self with ${state.flags.female ? 'her' : 'his'} bullwhip`;
        await losehp(halfPhysicalDamage(damage, state), killer, NO_KILLER_PREFIX, state);
        return ECMD_TIME;
    } else if ((applyIsFumbling(state) || applyIsGlib(state)) && !rn2(5)) {
        await ttyPline(`The bullwhip slips out of your ${body_part(HAND, state.youmonst)}.`, state);
        await dropx(obj, { state });
    } else if (u.utrap && u.utraptype === TT_PIT) {
        const tile = state.level.at(rx, ry);
        let wrappedWhat = sobj_at(BOULDER, rx, ry, state)
            ? 'a boulder' : IS_FURNITURE(tile.typ) ? 'something' : null;
        if (monster) {
            if (bigmonst(monster.data) && canSpotMonster(monster, state))
                wrappedWhat = mon_nam(monster, state);
            if (!wrappedWhat) wrappedWhat = null;
        }
        if (wrappedWhat) {
            const target = { x: rx, y: ry };
            await ttyPline(`You wrap your bullwhip around ${wrappedWhat}.`, state);
            if (proficient && rn2(proficient + 2)) {
                const adjacent = monster
                    ? enexto(rx, ry, state.youmonst.data, { state }) : target;
                if (!monster || adjacent) {
                    await ttyPline('You yank yourself out of the pit!', state);
                    await reset_utrap(true, state);
                    await teleds(adjacent.x, adjacent.y, TELEDS_ALLOW_DRAG, state);
                    state.vision_full_recalc = 1;
                }
            } else {
                await ttyPline(msgSlipsFree, state);
            }
            if (monster) await wakeup(monster, true, { state });
        } else if (monster) {
            return await whipattack(monster, rx, ry, proficient, state);
        } else {
            await ttyPline(msgSnap, state);
        }
    } else if (monster) {
        return await whipattack(monster, rx, ry, proficient, state);
    } else if (Is_airlevel(u.uz) || Is_waterlevel(u.uz)) {
        await ttyPline('You snap your whip through thin air.', state);
    } else {
        await ttyPline(msgSnap, state);
    }
    return ECMD_TIME;
}

// C ref: apply.c use_whip()'s `whipattack:` label, shared by the pit case
// when no boulder, furniture, or visible big monster can be used to escape.
async function whipattack(monster, rx, ry, proficient, state) {
        let object = null;
        if (!canSpotMonster(monster, state)) {
            monster.mundetected = 0;
            const spotItNow = canSpotMonster(monster, state);
            const rememberedGlyph = glyph_at(rx, ry, state);
            if (spotItNow || !glyph_is_invisible(rememberedGlyph)) {
                await ttyPline(
                `${spotItNow ? Amonnam(monster, state) : 'A monster'} is there that you `
                        + `${heroIsBlind(state) ? "hadn't noticed" : "couldn't see"}.`,
                    state,
                );
                if (!spotItNow) map_invisible(rx, ry, state);
                else newsym(rx, ry, state);
            }
        } else {
            object = monster.mw ?? null;
        }

        if (object) {
            const objectName = cxname(object, state);
            const gotIt = proficient && (!applyIsFumbling(state) || !rn2(10));
            let hand = gotIt ? mbodypart(monster, HAND) : null;
            if (gotIt && bimanual(object, state)) hand = makeplural(hand);
            await ttyPline(`You wrap your bullwhip around ${yname(object, state)}.`, state);
            let pullFree = gotIt;
            if (gotIt && mwelded(object, state)) {
                await ttyPline(
                    `${object.quan === 1 ? 'It is' : 'They are'} welded to ${s_suffix(mon_nam(monster, state))} ${hand}${object.bknown ? '.' : '!'}`,
                    state,
                );
                set_bknown(object, true, { state });
                pullFree = false;
            }
            if (pullFree) {
                obj_extract_self(object, { state });
                if (monster.mw === object) note_unported('weapon.c possibly_unwield');
                await setmnotwielded(monster, object, { state });
                switch (rn2(proficient + 1)) {
                case 2:
                    await ttyPline(`You yank ${yname(object, state)} to the ${surface(u.ux, u.uy, state)}!`, state);
                    place_object(object, u.ux, u.uy, { state });
                    stackobj(object, { state });
                    break;
                case 3: {
                    await ttyPline(`You snatch ${yname(object, state)}!`, state);
                    const species = state.mons?.[object.corpsenm];
                    const petrifies = object.otyp === CORPSE
                        && touch_petrifies(species) && !state.uarmg
                        && !Stone_resistance(state);
                    if (petrifies) {
                        const canTransform = poly_when_stoned(state.youmonst.data, state);
                        const saved = canTransform
                            ? await polymon(PM_STONE_GOLEM, state) : false;
                        if (!saved) {
                            await ttyPline(`Snatching ${an(objectName, state)} is a fatal mistake.`, state);
                            place_object(object, u.ux, u.uy, { state });
                            note_unported('trap.c instapetrify');
                            obj_extract_self(object, { state });
                        }
                    }
                    await hold_another_object(
                        object, 'You drop %s!', donameFresh(object, state),
                        null, { state },
                    );
                    break;
                }
                default:
                    await ttyPline(`You yank ${the(objectName, state)} from ${s_suffix(mon_nam(monster, state))} ${hand}!`, state);
                    obj_no_longer_held(object, { state });
                    place_object(object, monster.mx, monster.my, { state });
                    stackobj(object, { state });
                    break;
                }
            } else {
                await ttyPline(msgSlipsFree, state);
            }
        } else {
            let doSnap = true;
            if (M_AP_TYPE(monster) && !applyPropertyActive(PROT_FROM_SHAPE_CHANGERS, state)
                && !sensesMonster(monster, state)) {
                await stumble_onto_mimic(monster, state);
                doSnap = false;
            } else {
                await ttyPline(`You flick your bullwhip towards ${mon_nam(monster, state)}.`, state);
            }
            if (proficient && await force_attack(monster, false, state))
                return ECMD_TIME;
            if (doSnap) await ttyPline(msgSnap, state);
        }
        await wakeup(monster, true, { state });
        return ECMD_TIME;
}

// C ref: apply.c use_pole() (3426-3557).
export async function use_pole(obj, autohit, state = game) {
    let res = ECMD_OK;
    const pole = polearmContext(state);
    const hitmon = pole.hitmon;
    let freehit = false;
    let glyph;
    if (state.u.uswallow) {
        await ttyPline("There's not enough room here to use that.", state);
        return ECMD_OK;
    }
    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'swing', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('apply'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }

    const { minRange, maxRange } = calc_pole_range(state);
    if (!autohit) await ttyPline('Where do you want to hit?', state);
    const target = { x: state.u.ux, y: state.u.uy };
    if (!find_poleable_mon(target, state) && hitmon && hitmon.mhp > 0
        && sensesMonster(hitmon, state)) {
        const distance = dist2(hitmon.mx, hitmon.my, state.u.ux, state.u.uy);
        if (distance <= maxRange && distance >= minRange) {
            target.x = hitmon.mx;
            target.y = hitmon.my;
        }
    }
    if (!autohit) {
        state.getpos_hilitefunc = (onOff) => display_polearm_positions(onOff, state);
        state.getpos_getvalid = (x, y) => get_valid_polearm_position(x, y, state);
        try {
            if (await getpos(target, true, 'the spot to hit', state) < 0)
                return res | ECMD_CANCEL;
        } finally {
            state.getpos_hilitefunc = null;
            state.getpos_getvalid = null;
        }
    }

    glyph = glyph_at(target.x, target.y, state);
    const distance = dist2(target.x, target.y, state.u.ux, state.u.uy);
    if (distance > maxRange) {
        await ttyPline('Too far!', state);
        return ECMD_FAIL;
    } else if (distance < minRange) {
        await ttyPline(autohit && u_at(target.x, target.y, state)
            ? "Don't know what to hit." : 'Too close!', state);
        return ECMD_FAIL;
    } else if (!cansee(target.x, target.y, state) && !glyphIsPoleable(glyph)) {
        await ttyPline("That won't hit anything if you can't see that spot.", state);
        return ECMD_FAIL;
    } else if (!couldsee(target.x, target.y, state)) {
        await ttyPline("You can't reach that spot from here.", state);
        return ECMD_FAIL;
    }

    pole.hitmon = null;
    state.gb.bhitpos = { x: target.x, y: target.y };
    const monster = m_at(target.x, target.y, state);
    if (monster) {
        if (await attack_checks(monster, state.uwep, state))
            return res | (state.context.move ? ECMD_TIME : ECMD_OK);
        if (await overexertion(state)) return ECMD_TIME;
        pole.hitmon = monster;
        if (snickersnee_used_dist_attk(obj, state)) {
            await ttyPline("The blade doesn't reach there!", state);
            return ECMD_FAIL;
        }
        await check_caitiff(monster, state);
        state.gn ??= {};
        state.gn.notonhead = target.x !== monster.mx || target.y !== monster.my;
        if (obj === state.uwep && obj.oartifact === ART_SNICKERSNEE) {
            freehit = state.moves !== state.context.snickersnee_turn;
            state.context.snickersnee_turn = state.moves;
            if (freehit && !applyPropertyActive(DEAF, state))
                await ttyPline('Shkinng!', state);
        }
        await thitmonst(monster, state.uwep, state);
    } else if (glyph_is_statue(glyph) && sobj_at(STATUE, target.x, target.y, state)) {
        const trap = t_at(target.x, target.y, state);
        if (!(trap && trap.ttyp === STATUE_TRAP
            && await activate_statue_trap(trap, trap.tx, trap.ty, false, { state }))) {
            await ttyPline('Thump!  Your blow bounces harmlessly off the statue.', state);
            await wake_nearto(target.x, target.y, 25, { state });
        }
    } else {
        unmap_invisible(target.x, target.y, state);
        if (glyph_to_obj(glyph) === BOULDER
            && sobj_at(BOULDER, target.x, target.y, state)) {
            await ttyPline('Thump!  Your blow bounces harmlessly off the boulder.', state);
            await wake_nearto(target.x, target.y, 25, { state });
        } else {
            const tile = state.level.at(target.x, target.y);
            if (!accessible(target.x, target.y, state) || IS_FURNITURE(tile.typ)) {
                const what = tile.typ === STONE || tile.typ === SCORR ? 'stone'
                    : glyph_is_cmap(glyph)
                        ? `the ${CMAP_EXPLANATIONS[glyph_to_cmap(glyph)]}`
                        : 'an unknown obstacle';
                await ttyPline(`You uselessly attack ${what}.`, state);
            } else {
                await ttyPline('You miss; there is no one there to hit.', state);
            }
        }
    }
    u_wipe_engr(2, { state });
    return freehit ? ECMD_OK : ECMD_TIME;
}

// C ref: apply.c get_mleash() (880-887). The leash belongs to the hero's
// inventory, and its leashmon id names the monster; the monster's minvent is
// not searched here.
export function get_mleash(monster, state = game) {
    for (let object = state.invent; object; object = object.nobj) {
        if (object.otyp === LEASH && object.leashmon === monster.m_id)
            return object;
    }
    return null;
}

// Thrown where apply.c reaches a tool or a branch this port has not ported.
export class UnsupportedApplyError extends Error {
    constructor(branch) {
        super(`applying a tool requires ${branch}`);
        this.name = 'UnsupportedApplyError';
        this.branch = branch;
    }
}

function cameraTransientLightEnv(state) {
    return {
        visionRecalc: (control) => vision_recalc(control, {
            state,
            redraw: (x, y) => newsym(x, y, state),
        }),
        flushScreen: (mode) => flush_screen(mode),
        canSpotMonster: (monster) => canSpotMonster(monster, state),
        mapInvisible: (x, y) => map_invisible(x, y, state),
    };
}

// C ref: apply.c do_blinding_ray() (61-76). zap.c:bhit() returns the first
// visible monster but handles invisible monsters while continuing the beam;
// both use the same FLASHED_LIGHT traversal and defer temporary-light cleanup
// until after this caller has processed the returned target.
export async function do_blinding_ray(
    object,
    state = game,
    env = {},
) {
    const random = env.random ?? { d, rn2, rnd };
    const monster = await bhit(
        state.u.dx,
        state.u.dy,
        COLNO,
        FLASHED_LIGHT,
        null,
        null,
        { obj: object },
        state,
        random,
        env,
    );
    object.ox = state.u.ux;
    object.oy = state.u.uy;
    if (monster) {
        await flash_hits_mon(monster, object, state, random, env);
        if (object.otyp === EXPENSIVE_CAMERA) {
            await see_monster_closeup(monster, true, {
                ...env,
                state,
                observedAt: state.gb.bhitpos,
            });
        }
    }
    await transient_light_cleanup(state, cameraTransientLightEnv(state));
}

// C ref: apply.c use_camera() (79-111). A charge is spent after direction
// selection, before cursed backfire, and the swallowed, vertical, selfie and
// aimed-ray outcomes are kept in the same source order.
export async function use_camera(object, state = game, env = {}) {
    if (state.u?.uinwater) {
        await ttyPline(
            'Using your camera underwater would void the warranty.', state,
        );
        return ECMD_OK;
    }
    if (!await getdir(null, state)) return ECMD_CANCEL;

    if (object.spe <= 0) {
        await ttyPline(nothing_happens, state);
        return ECMD_TIME;
    }
    consume_obj_charge(object, true, { ...env, state });

    const random = env.random ?? { d, rn2, rnd };
    if (object.cursed && !random.rn2(2)) {
        await zapyourself(object, true, state);
    } else if (state.u.uswallow) {
        const engulfer = state.u.ustuck;
        await ttyPline(
            `You take a picture of ${s_suffix(mon_nam(engulfer, state))} `
                + `${mbodypart(engulfer, STOMACH)}.`,
            state,
        );
    } else if (state.u.dz) {
        const location = state.u.dz > 0
            ? surface(state.u.ux, state.u.uy, state)
            : ceiling(state.u.ux, state.u.uy, state);
        await ttyPline(`You take a picture of the ${location}.`, state);
    } else if (!state.u.dx && !state.u.dy) {
        await zapyourself(object, true, state);
    } else {
        await do_blinding_ray(object, state, { ...env, random });
    }
    return ECMD_TIME;
}

// C ref: apply.c tinnable() (2167-2173). An uneaten corpse can be canned only
// when its species supplies nutrition; this pure predicate is shared by
// eat.c floorfood()'s tin_ok() and its final corpsecheck validation.
export function tinnable(corpse, state = game) {
    if (corpse?.oeaten) return false;
    return Boolean(state.mons?.[corpse?.corpsenm]?.cnutrit);
}

// C ref: youprop.h:120 Hallucination, which is the intrinsic timeout alone
// minus resistance from either source.
function heroHallucinating(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    if (!hallucination || !resistance)
        throw new Error('Hallucination requires initialized u.uprops');
    return Boolean(hallucination.intrinsic
        && !(resistance.intrinsic || resistance.extrinsic));
}

// C ref: youprop.h:125 Deaf, which adds the permanent-deafness roleplay
// option to the intrinsic and the extrinsic.
function heroDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF] ?? {};
    return Boolean(deafness.intrinsic || deafness.extrinsic
        || state.u?.uroleplay?.deaf);
}

// Keep every state outside the selected use_cream_pie() boundary ahead of
// its first message and mutation. The source branches still exist in C, but
// their plural wording, hallucination, protection, polymorph, shop, and
// lifecycle effects belong to later slices.
function preflightCreamPie(obj, state, env) {
    const blindness = state.u?.uprops?.[BLINDED];
    if (!blindness)
        throw new Error('cream-pie application requires BLINDED state');
    if (obj.quan !== 1)
        throw new UnsupportedApplyError('a cream pie stack');
    if (heroHallucinating(state))
        throw new UnsupportedApplyError('a hallucinating cream pie user');
    if (Upolyd(state.u) || state.urace?.noun !== 'human')
        throw new UnsupportedApplyError('a non-human cream pie user');
    if (blindness.intrinsic || blindness.extrinsic || blindness.blocked
        || state.u.ucreamed) {
        throw new UnsupportedApplyError(
            'cream pie with protected or blind eyes',
        );
    }
    if (!can_blnd(null, state.youmonst, AT_WEAP, obj, state)) {
        throw new UnsupportedApplyError(
            'cream pie against eyes it cannot blind',
        );
    }
    if (obj.unpaid)
        throw new UnsupportedApplyError('an unpaid cream pie');
    if (obj.owornmask || obj.timed || obj.lamplit || obj.cobj) {
        throw new UnsupportedApplyError(
            'a cream pie with unported lifecycle state',
        );
    }
    if (obj.where !== OBJ_INVENT)
        throw new UnsupportedApplyError('a cream pie outside inventory');
    let carried = false;
    for (let current = state.invent; current; current = current.nobj) {
        if (current === obj) {
            carried = true;
            break;
        }
    }
    if (!carried)
        throw new UnsupportedApplyError('a cream pie outside inventory');

    preflight_update_inventory(env);
    preflight_obfree(obj, null, env);
}

// C ref: apply.c use_cream_pie() (3568-3603), restricted to one paid,
// ordinary pie and the sighted human state preflightCreamPie() admits.
async function use_cream_pie(obj, state = game, rawEnv = {}) {
    const random = rawEnv.random ?? { d, rn1, rn2, rnd, rne, rnz };
    const env = { ...rawEnv, state, random };
    preflightCreamPie(obj, state, env);

    await ttyPline(
        `You immerse your ${body_part(FACE, state.youmonst)} in ${
            the(xnameFresh(obj, state), state)}.`,
        state,
    );
    const blindinc = random.rnd(25);
    state.u.ucreamed += blindinc;
    const blindness = state.u.uprops[BLINDED];
    await make_blinded(
        (blindness.intrinsic & TIMEOUT) + blindinc,
        false,
        state,
    );
    await ttyPline(
        `You can't see through all the sticky goop on your ${
            body_part(FACE, state.youmonst)}.`,
        state,
    );

    setnotworn(obj, env);
    costly_alteration(obj, COST_SPLAT, env);
    obj_extract_self(obj, env);
    delobj(obj, env);
    return ECMD_OK;
}

// C ref: apply.c reset_trapset() (2812-2817), the third of the three clears
// cmd.c reset_occupations() makes. C resets only the object and bungle flag;
// the target coordinates and remaining setup time stay in gt.trapinfo.
export function reset_trapset(state = game) {
    state.gt ??= {};
    state.gt.trapinfo ??= {
        tobj: null,
        tx: 0,
        ty: 0,
        time_needed: 0,
        force_bungle: false,
    };
    state.gt.trapinfo.tobj = null;
    state.gt.trapinfo.force_bungle = false;
}

function trapSettingFumbling(state) {
    const property = state.u?.uprops?.[FUMBLING];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function trapSettingStunned(state) {
    return Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
}

// C ref: apply.c use_trap() (2821-2911). The caller has already selected a
// land mine or bear trap in doapply(); this function validates the square,
// records gt.trapinfo, and installs set_trap() as the turn occupation.
export async function use_trap(obj, state = game, env = {}) {
    const random = env.random ?? { rnl };
    const location = state.level.at(state.u.ux, state.u.uy);
    const levtyp = location.typ;
    const trapinfo = state.gt?.trapinfo;
    let what = null;

    if (nohands(state.youmonst.data))
        what = 'without hands';
    else if (trapSettingStunned(state))
        what = 'while stunned';
    else if (state.u.uswallow)
        what = digests(state.u.ustuck?.data)
            ? 'while swallowed' : 'while engulfed';
    else if (state.u.uinwater)
        what = 'underwater';
    else if (Levitation(state))
        what = 'while levitating';
    else if (is_pool(state.u.ux, state.u.uy, state))
        what = 'in water';
    else if (is_lava(state.u.ux, state.u.uy, state))
        what = 'in lava';
    else if (On_stairs(state.u.ux, state.u.uy, state)) {
        const stway = stairway_at(state.u.ux, state.u.uy, state);
        what = stway.isladder ? 'on the ladder' : 'on the stairs';
    } else if (IS_FURNITURE(levtyp) || IS_OBSTRUCTED(levtyp)
        || closed_door(state.u.ux, state.u.uy, state)
        || t_at(state.u.ux, state.u.uy, state)) {
        what = 'here';
    } else if (Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)) {
        what = levtyp === AIR ? 'in midair'
            : levtyp === CLOUD ? 'in a cloud' : 'in this place';
    }

    if (what) {
        await ttyPline(`You can't set a trap ${what}!`, state);
        reset_trapset(state);
        return;
    }

    const ttyp = obj.otyp === LAND_MINE ? LANDMINE : BEAR_TRAP;
    if (obj === trapinfo?.tobj
        && u_at(trapinfo.tx, trapinfo.ty, state)) {
        await ttyPline(
            `You resume setting ${shk_your(obj, state)}${trapname(ttyp, false, state)}.`,
            state,
        );
        set_occupation(set_trap, 'setting the trap', 0, state);
        return;
    }

    state.gt ??= {};
    state.gt.trapinfo ??= {
        tobj: null,
        tx: 0,
        ty: 0,
        time_needed: 0,
        force_bungle: false,
    };
    const currentTrapInfo = state.gt.trapinfo;
    currentTrapInfo.tobj = obj;
    currentTrapInfo.tx = state.u.ux;
    currentTrapInfo.ty = state.u.uy;
    let attribute = acurr(state, A_DEX);
    currentTrapInfo.time_needed = attribute > 17 ? 2
        : attribute > 12 ? 3 : attribute > 7 ? 4 : 5;
    if (heroIsBlind(state)) currentTrapInfo.time_needed *= 2;
    attribute = acurr(state, A_STR);
    if (ttyp === BEAR_TRAP && attribute < 18) {
        currentTrapInfo.time_needed += attribute > 12 ? 1
            : attribute > 7 ? 2 : 4;
    }

    if (state.u.usteed && P_SKILL(P_RIDING, state) < P_BASIC) {
        const chance = trapSettingFumbling(state) || obj.cursed
            ? random.rnl(10) > 3
            : random.rnl(10) > 5;
        await ttyPline(
            `You aren't very skilled at reaching from ${mon_nam(state.u.usteed, state)}.`,
            state,
        );
        const question = `Continue your attempt to set ${the(trapname(ttyp, false, state), state)}?`;
        if (await y_n(question, state) === 'y') {
            if (chance) {
                if (ttyp === LANDMINE) {
                    currentTrapInfo.time_needed = 0;
                    currentTrapInfo.force_bungle = true;
                } else {
                    reset_trapset(state);
                    await ttyPline(
                        `You drop ${the(trapname(ttyp, false, state), state)}!`,
                        state,
                    );
                    await dropx(obj, { ...env, state });
                    return;
                }
            }
        } else {
            reset_trapset(state);
            return;
        }
    }

    await ttyPline(
        `You begin setting ${shk_your(obj, state)}${trapname(ttyp, false, state)}.`,
        state,
    );
    if (obj.unpaid) note_unported('shk.c use_unpaid_trapobj');
    set_occupation(set_trap, 'setting the trap', 0, state);
}

// C ref: apply.c set_trap() (2914-2952), the untimed occupation callback.
// Its integer answer is consumed by allmain.c: a positive answer keeps the
// occupation, and zero clears it after this turn.
export async function set_trap(state = game, env = {}) {
    const trapinfo = state.gt?.trapinfo;
    const obj = trapinfo?.tobj;
    if (!obj || !carried(obj) || !u_at(trapinfo.tx, trapinfo.ty, state)) {
        reset_trapset(state);
        return 0;
    }

    if (--trapinfo.time_needed > 0) return 1;

    const ttyp = obj.otyp === LAND_MINE ? LANDMINE : BEAR_TRAP;
    const trap = maketrap(state.u.ux, state.u.uy, ttyp, { ...env, state });
    if (trap) {
        trap.madeby_u = true;
        feeltrap(trap, {
            state,
            redraw: (x, y) => newsym(x, y, state),
        });
        if (in_rooms(state.u.ux, state.u.uy, SHOPBASE, state).length)
            note_unported('shk.c add_damage');
        if (!trapinfo.force_bungle) {
            await ttyPline(
                `You finish arming ${the(trapname(ttyp, false, state), state)}.`,
                state,
            );
        }
        if (((obj.cursed || trapSettingFumbling(state))
            && (env.random?.rnl ?? rnl)(10) > 5)
            || trapinfo.force_bungle) {
            // C discards dotrap()'s result. Its complete trigger chain is not
            // in this task, so retain the named gap and skip its partial port.
            note_unported('trap.c dotrap');
        }
    } else {
        await ttyPline('Your trap setting attempt fails.', state);
    }
    await useup(obj, { ...env, state });
    reset_trapset(state);
    return 0;
}

// C ref: apply.c apply_ok() (4149-4210), the getobj() callback for the `a`
// command. It is longer than most because there are many appliable things.
export function apply_ok(obj, state = game) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    /* all tools, all wands (breaking), all spellbooks (flipping through -
       including blank/novel/Book of the Dead) */
    if (obj.oclass === TOOL_CLASS || obj.oclass === WAND_CLASS
        || obj.oclass === SPBOOK_CLASS)
        return GETOBJ_SUGGEST;

    /* applying coins to flip them is a minor easter egg, so do not suggest
       coin application to the player */
    if (obj.oclass === COIN_CLASS)
        return GETOBJ_DOWNPLAY;

    /* certain weapons */
    if (obj.oclass === WEAPON_CLASS
        && (is_pick(obj, state) || is_axe(obj, state) || is_pole(obj, state)
            || obj.otyp === BULLWHIP))
        return GETOBJ_SUGGEST;

    if (obj.oclass === POTION_CLASS) {
        /* permit applying unknown potions, but don't suggest them */
        if (!obj.dknown || !objectType(obj, state).oc_name_known)
            return GETOBJ_DOWNPLAY;

        /* only applicable potion is oil, and it will only be suggested as a
           choice when already discovered */
        if (obj.otyp === POT_OIL)
            return GETOBJ_SUGGEST;
    }

    /* certain foods */
    if (obj.otyp === CREAM_PIE || obj.otyp === EUCALYPTUS_LEAF
        || obj.otyp === LUMP_OF_ROYAL_JELLY)
        return GETOBJ_SUGGEST;

    if (obj.otyp === BANANA && heroHallucinating(state))
        return GETOBJ_DOWNPLAY;

    if (is_graystone(obj)) {
        /* The only case where we don't suggest a gray stone is if we KNOW it
           isn't a touchstone. */
        if (!obj.dknown)
            return GETOBJ_SUGGEST;

        if (obj.otyp !== TOUCHSTONE
            && (objectType(TOUCHSTONE, state).oc_name_known
                || objectType(obj, state).oc_name_known))
            return GETOBJ_EXCLUDE_SELECTABLE;

        return GETOBJ_SUGGEST;
    }

    /* item can't be applied; if picked anyway,
       _EXCLUDE would yield "That is a silly thing to apply.",
       _EXCLUDE_SELECTABLE yields "Sorry, I don't know how to use that." */
    return GETOBJ_EXCLUDE_SELECTABLE;
}

// C ref: apply.c rub_ok() (1770-1781), the getobj() callback for #rub.
// Hands are excluded along with every carried object except the three lamps,
// the four gray stones, and royal jelly.
export function rub_ok(obj) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    if (obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP
        || obj.otyp === BRASS_LANTERN || is_graystone(obj)
        || obj.otyp === LUMP_OF_ROYAL_JELLY)
        return GETOBJ_SUGGEST;

    return GETOBJ_EXCLUDE;
}

// C ref: apply.c dorub() (1785-1838), through the sighted, charged magic
// lamp outcomes at 1817-1835. Gray stones, royal jelly, empty lamps, blind
// smoke, and every other already-wielded lamp remain outside this port.
export async function dorub(state = game, env = {}) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to rub anything without hands.",
            state,
        );
        return ECMD_OK;
    }
    const obj = await getobj('rub', rub_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    if (obj.oclass === GEM_CLASS || obj.oclass === FOOD_CLASS) {
        throw new UnsupportedApplyError(
            'dorub() with a gray stone or royal jelly',
        );
    }
    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'rub', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('rub'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }

    if (state.uwep.otyp === MAGIC_LAMP && state.uwep.spe > 0) {
        const random = env.random ?? { d, rn1, rn2, rnd, rne, rnz };
        if (!random.rn2(3)) {
            check_unpaid_usage(state.uwep, true, state);
            state.uwep.otyp = OIL_LAMP;
            state.uwep.spe = 0;
            state.uwep.age = random.rn1(500, 1000);
            if (state.uwep.lamplit)
                begin_burn(state.uwep, true, { ...env, state });
            await (env.djinniFromBottle ?? djinni_from_bottle)(
                state.uwep,
                state,
                { ...env, random },
            );
            discover_object(
                MAGIC_LAMP,
                true,
                true,
                true,
                state,
                { ...env, random },
            );
            update_inventory({ ...env, state });
            return ECMD_TIME;
        }
        if (random.rn2(2)) {
            if (heroIsBlind(state)) {
                throw new UnsupportedApplyError(
                    'dorub() blind magic-lamp smoke',
                );
            }
            await ttyPline('You see a puff of smoke.', state);
        } else {
            await ttyPline(nothing_happens, state);
        }
        return ECMD_TIME;
    }

    throw new UnsupportedApplyError(
        'dorub() with an empty or non-magic already-wielded lamp',
    );
}

// C ref: apply.c its_dead() (196-309), the floor-object half of a listen.
// C answers TRUE when it printed something and FALSE when the square holds
// neither a corpse nor a statue, which is when the caller falls through to
// "You hear nothing special."
//
// C takes `int *resp` so that its hallucination arm can charge the turn. The
// exported source-named helper retains its boolean result and optionally
// accepts the caller-owned response holder for that write.
function selectedDeadObject(rx, ry, state) {
    let corpse = sobj_at(CORPSE, rx, ry, state);
    let statue = sobj_at(STATUE, rx, ry, state);
    const canReachFloor = can_reach_floor(true, state);

    if (!canReachFloor) {               /* levitation or unskilled riding */
        corpse = null;                   /* can't reach corpse on floor */
        // apply.c:208-211. An out-of-reach hero cannot touch tiny statues;
        // walk this square's pile until the first statue whose species is not
        // tiny. When none remains, its_dead() reaches its FALSE fall-through.
        while (statue
            && state.mons[statue.corpsenm].msize === MZ_TINY) {
            statue = nxtobj(statue, STATUE, true);
        }
    }
    // apply.c:213-219. sobj_at() found the first object of each kind. If the
    // first corpse follows the first statue in the square's nexthere chain,
    // the statue is uppermost; otherwise the corpse is. An unrelated object
    // between them does not affect the comparison.
    if (corpse && statue) {
        if (nxtobj(statue, CORPSE, true) === corpse) corpse = null;
        else statue = null;
    }
    return { corpse, statue };
}

// C ref: apply.c its_dead(). The optional response holder models C's `int
// *resp`; direct callers that need only the source boolean result may omit it.
export async function its_dead(rx, ry, state = game, response = null) {
    const { corpse, statue } = selectedDeadObject(rx, ry, state);
    if ((corpse || statue) && heroHallucinating(state)) {
        let answer;
        if (!corpse) {
            answer = "You're both stoned";
        } else {
            const more_corpses = Boolean(nxtobj(corpse, CORPSE, true));
            if (corpse.quan === 1 && !more_corpses) {
                let gndr = 2;
                const saved = get_mtraits(corpse, false, state);
                if (saved) {
                    gndr = pronoun_gender(saved, PRONOUN_NO_IT, { state });
                } else {
                    const species = state.mons[corpse.corpsenm];
                    if (is_female(species)) gndr = 1;
                    else if (is_male(species)) gndr = 0;
                }
                const pronoun = genders[gndr].he;
                answer = `${highc(pronoun[0])}${pronoun.slice(1)}'s dead`;
            } else {
                answer = "They're dead";
            }
        }
        const heard = youHear(`a voice say, "${answer}, Jim."`, state);
        if (heard) await ttyPline(heard, state);
        if (response) response.value = ECMD_TIME;
        return true;
    }
    if (corpse) {
        const more_corpses = Boolean(nxtobj(corpse, CORPSE, true));
        const one = (corpse.quan === 1 && !more_corpses);
        const here = u_at(rx, ry, state);
        const visglyph = glyph_at(rx, ry, state);
        const corpseglyph = obj_to_glyph(corpse, state);
        let reviver = false;
        if (heroIsBlind(state) && visglyph !== corpseglyph.glyph)
            map_object(corpse, true, state);
        if (state.urole?.mnum === PM_HEALER) {
            // apply.c:265-274. This only detects a pending revival; it neither
            // runs nor changes the timer. Walk the square's nexthere chain,
            // stopping at the first corpse with REVIVE_MON.
            let current = corpse;
            do {
                if (obj_has_timer(current, REVIVE_MON, state))
                    reviver = true;
                else
                    current = nxtobj(current, CORPSE, true);
            } while (current && !reviver);
        }
        await ttyPline(
            `You determine that ${one ? (here ? 'this' : 'that')
                : (here ? 'these' : 'those')} unfortunate being${
                one ? '' : 's'} ${one ? 'is' : 'are'}${
                reviver ? ' mostly' : ''} dead.`,
            state,
        );
        return true;
    }
    if (statue) {
        const species = state.mons[statue.corpsenm];
        let what;
        let how = 'fine';
        if (heroIsBlind(state)) {
            what = `${u_at(rx, ry, state) ? 'This' : 'That'} ${
                humanoid(species) ? 'person' : 'creature'}`;
        } else {
            what = obj_pmname(statue, state);
            if (!type_is_pname(species)) what = The(what, state);
        }
        if (state.urole?.mnum === PM_HEALER) {
            if (t_at(rx, ry, state)?.ttyp === STATUE_TRAP)
                how = 'extraordinary';
            else if (hasContents(statue))
                how = 'remarkable';
        }
        await ttyPline(`${what} is in ${how} health for a statue.`, state);
        return true;
    }
    return false;
}

// Fail-closed commands are retryable. Inspect the earlier adjacent paths that
// still refuse before apply.c:340 changes the listen sequence and observation
// globals. The complete its_dead() family no longer needs preflight.
function preflightAdjacentStethoscope(obj, state) {
    const u = state.u;
    // These source arms precede confdir() and the adjacent-square body. Their
    // existing refusals therefore win over anything at the pointed square.
    if (u.uswallow) return;
    if (u.dz) return;
    if (obj.cursed) return;
    if (!u.dx && !u.dy) return;

    const rx = u.ux + u.dx;
    const ry = u.uy + u.dy;
    if (!isok(rx, ry)) return;
    if (m_at(rx, ry, state)) return;

    const lev = state.level.at(rx, ry);
    if (lev.typ === SDOOR || lev.typ === SCORR) return;
}

// C ref: apply.c use_stethoscope() (317-470), with C's own comment above it at
// 313-316 explaining the free action: one use per turn costs nothing, so a
// second use in the same move is what makes a cursed stethoscope's wasted
// listen cost anything.
//
// Four arms between the direction prompt and confdir() stop rather than run.
// The u.usteed and the two u.uswallow arms need mstatusline(); u.dz needs
// cant_reach_floor() and the Soundeffect() interface; and the cursed arm draws
// an rn2(2) whose "You hear your heart beat." nothing has checked. Refusing
// the cursed arm on obj.cursed alone keeps that draw out of the random-number
// stream for the uncursed tools the ported path uses.
//
// Below confdir() the adjacent-square arm (384-470) runs through the off-map
// answer, monster branch, both secret-terrain arms, and the complete
// dead-object family.
async function use_stethoscope(obj, state = game) {
    const u = state.u;

    if (nohands(state.youmonst.data)) {
        await ttyPline('You have no hands!', state); /* not `body_part(HAND)' */
        return ECMD_OK;
    } else if (heroDeaf(state)) {
        await ttyPline("You can't hear anything!", state);
        return ECMD_OK;
    } else if (!freehand(state)) {
        await ttyPline(
            `You have no free ${body_part(HAND, state.youmonst)}.`,
            state,
        );
        return ECMD_OK;
    }
    if (!await getdir(null, state))
        return ECMD_CANCEL;

    preflightAdjacentStethoscope(obj, state);

    const res = (state.hero_seq === state.context.stethoscope_seq)
        ? ECMD_TIME : ECMD_OK;
    state.context.stethoscope_seq = state.hero_seq;

    // apply.c:340-341. C calls these tentative because the monster arm below
    // overwrites both; mstatusline() reads gb.bhitpos for its long-worm and
    // region terms, and gn.notonhead for nothing this port reaches yet.
    // js/dog.js setMonsterObservationPosition() makes the same coupled write
    // from mon.c see_monster_closeup(); this pair is not that one, because
    // gn.notonhead here is u.uswallow rather than a comparison with the
    // monster's own square.
    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = u.ux;
    state.gb.bhitpos.y = u.uy;
    state.gn ??= {};
    state.gn.notonhead = Boolean(u.uswallow);

    if (u.usteed && u.dz > 0)
        throw new UnsupportedApplyError('mstatusline() for a steed');
    if (u.uswallow)
        throw new UnsupportedApplyError('mstatusline() for an engulfer');
    if (u.dz)
        throw new UnsupportedApplyError('listening to the floor or ceiling');
    if (obj.cursed)
        throw new UnsupportedApplyError('a cursed stethoscope');

    confdir(false, state);
    if (!u.dx && !u.dy) {
        await ustatusline(state);
        return res;
    }
    const rx = u.ux + u.dx;
    const ry = u.uy + u.dy;
    // apply.c:386-390 answers a square off the map with "You hear a faint
    // typing noise." and ECMD_OK, the one arm below here that discards `res`
    // rather than returning it. Soundeffect(se_typing_noise, 100) expands to
    // nothing in the tty build; You_hear() still applies the acoustics gate.
    if (!isok(rx, ry)) {
        const heard = youHear('a faint typing noise.', state);
        if (heard) await ttyPline(heard, state);
        return ECMD_OK;
    }
    const mtmp = m_at(rx, ry, state);
    if (mtmp) {
        // Named before seemimic() runs, so a mimic is still wearing its
        // disguise here; x_monnam() ignores that for M_AP_OBJECT and answers
        // the true species either way. insight.c:3392 names it a second time
        // afterwards, with a different article and no disguise left.
        const mnm = x_monnam(mtmp, ARTICLE_A, null,
                             SUPPRESS_IT | SUPPRESS_INVISIBLE, false, state);

        /* gb.bhitpos needed by mstatusline() iff mtmp is a long worm */
        state.gb.bhitpos.x = rx;
        state.gb.bhitpos.y = ry;
        state.gn.notonhead = (mtmp.mx !== rx || mtmp.my !== ry);

        if (mtmp.mundetected) {
            if (!canSpotMonster(mtmp, state))
                await ttyPline(`There is ${mnm} hidden there.`, state);
            mtmp.mundetected = 0;
            newsym(mtmp.mx, mtmp.my);
        } else if (mtmp.mappearance) {
            let what = 'thing';
            let use_plural = false;

            switch (M_AP_TYPE(mtmp)) {
            case M_AP_OBJECT: {
                /* FIXME?
                 *  we should probably be using object_from_map() here
                 */
                const odummy = init_dummyobj(newObject(), mtmp.mappearance,
                                             1, state);
                /* simple_typename() yields "fruit" for any named fruit;
                   we want the same thing '//' or ';' shows: "slime mold"
                   or "grape" or "slice of pizza" */
                if (odummy.otyp === SLIME_MOLD && has_mcorpsenm(mtmp)) {
                    odummy.spe = MCORPSENM(mtmp);
                    what = simpleonames(odummy, state);
                } else {
                    what = simple_typename(odummy.otyp, state);
                }
                use_plural = (is_boots(odummy, state)
                    || is_gloves(odummy, state)
                    || odummy.otyp === LENSES);
                break;
            }
            case M_AP_MONSTER: /* ignore Hallucination here */
                what = pmname(state.mons[mtmp.mappearance], gender(mtmp));
                break;
            case M_AP_FURNITURE:
                what = CMAP_EXPLANATIONS[mtmp.mappearance];
                break;
            }
            seemimic(mtmp, state);
            await ttyPline(
                `${use_plural ? 'Those' : 'That'} ${what} `
                + `${use_plural ? 'are' : 'is'} really ${mnm}.`,
                state,
            );
        } else if (state.flags.verbose && !canSpotMonster(mtmp, state)) {
            await ttyPline(`There is ${mnm} there.`, state);
        }

        await mstatusline(mtmp, state);
        if (!canSpotMonster(mtmp, state))
            map_invisible(rx, ry, state);
        return res;
    }
    if (unmap_invisible(rx, ry, state))
        await ttyPline('The invisible monster must have moved.', state);

    const lev = state.level.at(rx, ry);
    // apply.c:452-464. Soundeffect() is a no-op in the tty build; You_hear()
    // still owns the acoustics gate and its alternate underwater prefix.
    if (lev.typ === SDOOR) {
        const heard = youHear(
            'a hollow sound.  This must be a secret door!', state,
        );
        if (heard) await ttyPline(heard, state);
        cvt_sdoor_to_door(lev, state); /* ->typ = DOOR */
        recalc_block_point(rx, ry, state);
        feel_newsym(rx, ry, state);
        return res;
    }
    if (lev.typ === SCORR) {
        const heard = youHear(
            'a hollow sound.  This must be a secret passage!', state,
        );
        if (heard) await ttyPline(heard, state);
        lev.typ = CORR;
        lev.flags = 0;
        lev.doormask = 0;
        unblock_point(rx, ry, state);
        feel_newsym(rx, ry, state);
        return res;
    }

    const response = { value: res };
    if (!await its_dead(rx, ry, state, response))
        await ttyPline('You hear nothing special.', state); /* not You_hear() */
    return response.value;
}

// C ref: apply.c dojump(), check_jump(), is_valid_jump_pos(),
// get_valid_jump_position(), display_jump_positions(), and jump() (1847-2166).
// The callback walk is the same Bresenham algorithm as dothrow.c walk_path().
// Its movement callback is kept local until dothrow.c's hurtle family lands.

const JUMP_ANY = 0;
const JUMP_HORZ = 1;
const JUMP_VERT = 2;
const JUMP_DIAG = 3;

function jumpProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function jumpPropertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// C ref: dothrow.c walk_path() (656-753).
function jumpWalkPath(source, destination, callback, argument, state) {
    let dx = destination.x - source.x;
    let dy = destination.y - source.y;
    let x = source.x;
    let y = source.y;
    let previousX = x;
    let previousY = y;
    const xChange = dx < 0 ? -1 : 1;
    const yChange = dy < 0 ? -1 : 1;
    if (dx < 0) dx = -dx;
    if (dy < 0) dy = -dy;
    let error = 0;
    let keepGoing = true;
    if (dx < dy) {
        for (let i = 0; i < dy; ++i) {
            previousX = x;
            previousY = y;
            y += yChange;
            error += dx << 1;
            if (error > dy) {
                x += xChange;
                error -= dy << 1;
            }
            keepGoing = callback(argument, x, y, state);
            if (!keepGoing) break;
        }
    } else {
        for (let i = 0; i < dx; ++i) {
            previousX = x;
            previousY = y;
            x += xChange;
            error += dy << 1;
            if (error > dx) {
                y += yChange;
                error -= dx << 1;
            }
            keepGoing = callback(argument, x, y, state);
            if (!keepGoing) break;
        }
    }
    if (!keepGoing) {
        destination.x = previousX;
        destination.y = previousY;
    }
    return keepGoing;
}

// C ref: apply.c check_jump() (1860-1883).
export function check_jump(trajectory, x, y, state = game) {
    if (jumpProperty(state, PASSES_WALLS)) return true;
    const location = state.level.at(x, y);
    if (IS_STWALL(location.typ)) return false;
    if (IS_DOOR(location.typ)) {
        if (closed_door(x, y, state)) return false;
        const mask = location.doormask ?? 0;
        if ((mask & D_ISOPEN) !== 0 && trajectory !== JUMP_ANY
            && (trajectory === JUMP_DIAG
                || (((trajectory & JUMP_HORZ) !== 0)
                    === Boolean(location.horizontal))))
            return false;
    }
    if (sobj_at(BOULDER, x, y, state)
        && !throws_rocks(state.youmonst?.data)) return false;
    return true;
}

// C ref: apply.c is_valid_jump_pos() (1885-1954).
export async function is_valid_jump_pos(x, y, magic, showmsg, state = game) {
    const distance = dist2(x, y, state.u.ux, state.u.uy);
    const jumping = state.u?.uprops?.[JUMPING] ?? {};
    if (!magic && !(jumping.intrinsic & ~INTRINSIC) && !jumping.extrinsic
        && distance !== 5) {
        if (showmsg) await ttyPline('Illegal move!', state);
        return false;
    }
    if (distance > (magic ? 6 + magic * 3 : 9)) {
        if (showmsg) await ttyPline('Too far!', state);
        return false;
    }
    if (!isok(x, y)) {
        if (showmsg) await ttyPline('You cannot jump there!', state);
        return false;
    }
    if (!cansee(x, y, state)) {
        if (showmsg) await ttyPline('You cannot see where to land!', state);
        return false;
    }

    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const diagonal = (magic || jumpProperty(state, PASSES_WALLS) || (!dx && !dy))
        ? JUMP_ANY : !dy ? JUMP_HORZ : !dx ? JUMP_VERT : JUMP_DIAG;
    let flatX = ax;
    let flatY = ay;
    if (flatX >= 2 * flatY) flatY = 0;
    else if (flatY >= 2 * flatX) flatX = 0;
    const trajectory = (magic || jumpProperty(state, PASSES_WALLS)
        || (!flatX && !flatY))
        ? JUMP_ANY : !flatY ? JUMP_HORZ : !flatX ? JUMP_VERT : JUMP_DIAG;

    const source = state.level.at(state.u.ux, state.u.uy);
    if (diagonal === JUMP_DIAG && IS_DOOR(source.typ)
        && (source.doormask & D_ISOPEN) !== 0
        && (trajectory === JUMP_DIAG
            || (((trajectory & JUMP_HORZ) !== 0)
                === Boolean(source.horizontal)))) {
        if (showmsg)
            await ttyPline("You can't jump diagonally out of a doorway.", state);
        return false;
    }
    const from = { x: state.u.ux, y: state.u.uy };
    const to = { x, y };
    if (!jumpWalkPath(from, to, check_jump, trajectory, state)) {
        if (showmsg)
            await ttyPline('There is an obstacle preventing that jump.', state);
        return false;
    }
    return true;
}

export async function get_valid_jump_position(x, y, state = game) {
    return isok(x, y)
        && (ACCESSIBLE(state.level.at(x, y).typ)
            || jumpProperty(state, PASSES_WALLS))
        && await is_valid_jump_pos(
            x, y, state.gj?.jumping_is_magic ?? 0, false, state,
        );
}

// C ref: apply.c display_jump_positions() (1956-1986).
async function display_jump_positions(onOff, state = game) {
    if (onOff) {
        await tmp_at(
            DISP_BEAM,
            map_glyphinfo(cmap_to_glyph(S_goodpos, state), state),
            state,
        );
        for (let dx = -4; dx <= 4; ++dx) {
            for (let dy = -4; dy <= 4; ++dy) {
                const x = state.u.ux + dx;
                const y = state.u.uy + dy;
                if (await get_valid_jump_position(x, y, state)
                    && !u_at(x, y, state))
                    await tmp_at(x, y, state);
            }
        }
    } else {
        await tmp_at(DISP_END, 0, state);
    }
}

function halfPhysicalDamage(damage, state) {
    const prop = state.u?.uprops?.[HALF_PHDAM];
    return (prop?.intrinsic || prop?.extrinsic)
        ? Math.trunc((damage + 1) / 2) : damage;
}

async function jumpLandingPath(target, state) {
    const source = { x: state.u.ux, y: state.u.uy };
    const destination = { x: target.x, y: target.y };
    const range = {
        range: Math.max(
            Math.abs(destination.x - source.x),
            Math.abs(destination.y - source.y),
        ),
    };
    await walk_path(
        source,
        destination,
        hurtle_jump,
        { state, range },
    );
    target.x = destination.x;
    target.y = destination.y;
    return teleds(target.x, target.y, TELEDS_NO_FLAGS, state);
}

// C ref: apply.c dojump() (1847-1851).
export async function dojump(state = game) {
    return jump(0, state);
}

// C ref: apply.c jump() (1988-2163).
export async function jump(magic = 0, state = game) {
    if (!magic && !jumpProperty(state, JUMPING)
        && known_spell(SPE_JUMPING, state) >= spe_Fresh)
        return spelleffects(SPE_JUMPING, false, false, state);

    const species = state.youmonst?.data;
    if (!magic && (nolimbs(species) || slithy(species))) {
        await ttyPline("You can't jump; you have no legs!", state);
        return ECMD_OK;
    }
    if (!magic && !jumpProperty(state, JUMPING)) {
        await ttyPline("You can't jump very far.", state);
        return ECMD_OK;
    }
    if (!magic && state.u.usteed
        && await stucksteed(false, state)) return ECMD_OK;
    if (state.u.uswallow) {
        if (magic) {
            await ttyPline('You bounce around a little.', state);
            return ECMD_TIME;
        }
        await ttyPline("You've got to be kidding!", state);
        return ECMD_OK;
    }
    if (state.u.uinwater) {
        if (magic) {
            await ttyPline('You swish around a little.', state);
            return ECMD_TIME;
        }
        await ttyPline('This calls for swimming, not jumping!', state);
        return ECMD_OK;
    }
    if (state.u.ustuck) {
        const captor = state.u.ustuck;
        if (captor.mtame && !jumpProperty(state, CONFLICT) && !captor.mconf) {
            set_ustuck(null, state);
            await ttyPline(`You pull free from ${mon_nam(captor, state)}.`, state);
            return ECMD_TIME;
        }
        if (magic) {
            await ttyPline('You writhe a little in the grasp of your captor!', state);
            return ECMD_TIME;
        }
        await ttyPline('You cannot escape from your captor!', state);
        return ECMD_OK;
    }
    if (jumpPropertyActive(state, LEVITATION)
        || Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)) {
        if (magic) {
            await ttyPline('You flail around a little.', state);
            return ECMD_TIME;
        }
        await ttyPline("You don't have enough traction to jump.", state);
        return ECMD_OK;
    }
    if (!magic && near_capacity(state) > UNENCUMBERED) {
        await ttyPline('You are carrying too much to jump!', state);
        return ECMD_OK;
    }
    if (!magic && (state.u.uhunger <= 100 || acurr(state, A_STR) < 6)) {
        await ttyPline('You lack the strength to jump!', state);
        return ECMD_OK;
    }
    if (!magic && jumpProperty(state, WOUNDED_LEGS)) {
        await legs_in_no_shape('jumping', Boolean(state.u.usteed), state);
        return ECMD_OK;
    }
    if (state.u.usteed && state.u.utrap) {
        await ttyPline(`${Monnam(state.u.usteed, state)} is stuck in a trap.`, state);
        return ECMD_OK;
    }

    await ttyPline('Where do you want to jump?', state);
    const target = { x: state.u.ux, y: state.u.uy };
    state.gj ??= {};
    state.gj.jumping_is_magic = magic;
    state.getpos_hilitefunc = display_jump_positions;
    state.getpos_getvalid = get_valid_jump_position;
    try {
        if (await getpos(target, true, 'the desired position', state) < 0)
            return ECMD_CANCEL;
    } finally {
        state.getpos_hilitefunc = null;
        state.getpos_getvalid = null;
    }
    if (!await is_valid_jump_pos(target.x, target.y, magic, true, state))
        return ECMD_FAIL;
    if (state.u.usteed && u_at(target.x, target.y, state)) {
        await ttyPline("Your steed isn't capable of jumping in place.", state);
        return ECMD_FAIL;
    }

    let wasTrapped = false;
    if (state.u.utrap) {
        wasTrapped = true;
        switch (state.u.utraptype) {
        case TT_BEARTRAP: {
            const side = rn2(3) ? LEFT_SIDE : RIGHT_SIDE;
            await ttyPline('You rip yourself free of the bear trap!  Ouch!', state);
            await losehp(halfPhysicalDamage(rnd(10), state),
                'jumping out of a bear trap', KILLED_BY, state);
            await set_wounded_legs(side, rn1(1000, 500), state);
            break;
        }
        case TT_PIT:
            await ttyPline('You leap from the pit!', state);
            break;
        case TT_WEB:
            await ttyPline('You tear the web apart as you pull yourself free!', state);
            deltrap(t_at(state.u.ux, state.u.uy, state), state);
            break;
        case TT_LAVA:
            await ttyPline('You pull yourself above the lava!', state);
            target.x = state.u.ux;
            target.y = state.u.uy;
            break;
        case TT_BURIEDBALL:
        case TT_INFLOOR:
            const legs = makeplural(body_part(LEG, state.youmonst));
            const place = state.u.utraptype === TT_INFLOOR
                ? 'stuck in the floor' : 'attached to the buried ball';
            await ttyPline(`You strain your ${legs}, but you're still ${place}.`, state);
            await set_wounded_legs(LEFT_SIDE, rn1(10, 11), state);
            await set_wounded_legs(RIGHT_SIDE, rn1(10, 11), state);
            return ECMD_TIME;
        default:
            throw new Error(`Jumping out of strange trap (${state.u.utraptype})?`);
        }
        await reset_utrap(true, state);
    }

    if (u_at(target.x, target.y, state)) {
        const trap = t_at(target.x, target.y, state);
        if (wasTrapped) {
            await morehungry(rnd(10), state);
            return ECMD_TIME;
        }
        if (trap) {
            await ttyPline(
                `You jump up and ${jumpPropertyActive(state, FLYING) ? 'fly' : 'come'} back down.`,
                state,
            );
            await dotrap(trap, FORCETRAP | TOOKPLUNGE, state);
            return ECMD_TIME;
        }
        await ttyPline(
            `${heroHallucinating(state) ? 'You hop up and down a bit.' : 'You decide not to jump after all.'}`,
            state,
        );
        return ECMD_OK;
    }

    await jumpLandingPath(target, state);
    nomul(-1, state);
    state.multi_reason = 'jumping around';
    state.nomovemsg = '';
    await morehungry(rnd(25), state);
    return ECMD_TIME;
}

// C ref: apply.c use_lamp() (1628-1702). The branch order is observable:
// an already-lit object is snuffed before the underwater and empty-fuel
// checks, and cursed lamps consume the second draw only for oil or magic
// lamps after the first curse check fails.
export async function use_lamp(obj, state = game, env = {}) {
    const candle = obj.otyp === TALLOW_CANDLE || obj.otyp === WAX_CANDLE;
    const lamp = obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP
        ? 'lamp' : obj.otyp === BRASS_LANTERN ? 'lantern' : null;

    if (obj.lamplit) {
        if (lamp) {
            const owner = shk_your(obj, state);
            await ttyPline(
                `${highc(owner[0])}${owner.slice(1)}${lamp} is now off.`,
                state,
            );
        } else {
            await ttyPline(`You snuff out ${yname(obj, state)}.`, state);
        }
        end_burn(obj, true, { ...env, state });
        return;
    }
    if (state.u?.uinwater) {
        await ttyPline(candle
            ? 'Sorry, fire and water don\'t mix.'
            : 'This is not a diving lamp.', state);
        return;
    }
    if ((!candle && obj.age === 0)
        || (obj.otyp === MAGIC_LAMP && obj.spe === 0)) {
        if (obj.otyp === BRASS_LANTERN) {
            await ttyPline(heroIsBlind(state)
                ? 'Nothing seems to happen.'
                : 'Your lantern is out of power.', state);
        } else {
            await ttyPline(`This ${xnameFresh(obj, state)} has no oil.`, state);
        }
        return;
    }

    if (obj.cursed && rn2(2) === 0) {
        if ((obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP)
            && rn2(3) === 0) {
            await ttyPline(
                `The lamp spills and covers your ${fingers_or_gloves(true, state)} with oil.`,
                state,
            );
            const glib = state.u?.uprops?.[GLIB]?.intrinsic ?? 0;
            make_glib((glib & TIMEOUT) + d(2, 10), state, env);
        } else if (!heroIsBlind(state)) {
            await ttyPline(
                `${Tobjnam(obj, 'flicker', state)} for a moment, then ${otense(obj, 'die')}.`,
                state,
            );
        } else {
            await ttyPline('Nothing seems to happen.', state);
        }
    } else if (lamp) {
        try {
            check_unpaid(obj, state);
        } catch (error) {
            // check_unpaid() is void in C. Its unresolved billing branch is
            // skipped as a recorded gap while the source continues to light.
            if (!(error instanceof UnsupportedShopError)) throw error;
            note_unported('shk.c check_unpaid_usage');
        }
        const owner = shk_your(obj, state);
        await ttyPline(
            `${highc(owner[0])}${owner.slice(1)}${lamp} is now on.`, state,
        );
        begin_burn(obj, false, { ...env, state });
    } else {
        const name = Yname2(obj, state);
        const plural = obj.quan !== 1;
        await ttyPline(
            `${s_suffix(name)} flame${plural ? 's' : ''} ${otense(obj, 'burn')}`
                + `${heroIsBlind(state) ? '.' : ' brightly!'}`,
            state,
        );
        const cost = objectType(obj, state).oc_cost;
        if (obj.unpaid && costly_spot(state.u.ux, state.u.uy, state)
            && obj.age === 20 * cost) {
            const pronoun = obj.quan > 1 ? 'them' : 'it';
            const rooms = in_rooms(state.u.ux, state.u.uy, SHOPBASE, state);
            set_voice(shop_keeper(rooms[0] ?? 0, state), 0, 80, 0, state);
            await verbalize(`You burn ${pronoun}, you bought ${pronoun}!`, state);
            await bill_dummy_object(obj, { ...env, state });
        }
        begin_burn(obj, false, { ...env, state });
    }
}

// C ref: apply.c use_candle() (1387-1468). Attaching a candle stack to the
// carried candelabrum consumes the accepted split, while a negative answer,
// a missing/full candelabrum, or a swallowed hero delegates to use_lamp().
export async function use_candle(obj, state = game, env = {}) {
    if (state.u?.uswallow) {
        await ttyPline(
            "You don't have enough elbow-room to maneuver.", state,
        );
        return;
    }

    const candelabrum = carrying(CANDELABRUM_OF_INVOCATION, state);
    if (!candelabrum || candelabrum.spe === 7) {
        await use_lamp(obj, state, env);
        return;
    }

    let candleNoun = obj.quan !== 1 ? 'candles' : 'candle';
    const suffix = ` to\x1b${thesimpleoname(candelabrum, state)}?`;
    let query = safe_qbuf(
        'Attach ', suffix, obj, yname, thesimpleoname, candleNoun, state,
    );
    const marker = strstri(query, ' to\x1b');
    if (marker >= 0)
        query = `${query.slice(0, marker)} to `;
    const attachQuery = safe_qbuf(
        query, '?', candelabrum, yname, thesimpleoname, 'it', state,
    );
    if (await y_n(attachQuery, state) === 'n') {
        await use_lamp(obj, state, env);
        return;
    }

    if (candelabrum.spe + obj.quan > 7) {
        obj = splitobj(obj, 7 - candelabrum.spe, { ...env, state });
        candleNoun = obj.quan !== 1 ? 'candles' : 'candle';
    }

    const wasLit = Boolean(obj.lamplit);
    if (wasLit)
        end_burn(obj, true, { ...env, state });

    await ttyPline(
        `You attach ${obj.quan}${candelabrum.spe ? ' more' : ''} ${candleNoun} to ${the(xnameFresh(candelabrum, state), state)}.`,
        state,
    );
    if (!candelabrum.spe || candelabrum.age > obj.age)
        candelabrum.age = obj.age;
    candelabrum.spe += obj.quan;
    if (candelabrum.lamplit && !wasLit) {
        const pluralSuffix = candleNoun;
        await ttyPline(
            `The new ${pluralSuffix} magically ${pluralSuffix === 'candle' ? 'ignites' : 'ignite'}!`,
            state,
        );
    } else if (!candelabrum.lamplit && wasLit) {
        await ttyPline(obj.quan > 1 ? 'They go out.' : 'It goes out.', state);
    }
    if (obj.unpaid) {
        const rooms = in_rooms(state.u.ux, state.u.uy, SHOPBASE, state);
        set_voice(shop_keeper(rooms[0] ?? 0, state), 0, 80, 0, state);
        const pronoun = obj.quan > 1 ? 'them' : 'it';
        await verbalize(
            `You ${candelabrum.lamplit ? 'burn' : 'use'} ${pronoun}, you bought ${pronoun}!`,
            state,
        );
    }
    if (obj.quan < 7 && candelabrum.spe === 7) {
        const lit = candelabrum.lamplit ? ' lit' : '';
        await ttyPline(
            `${The(xnameFresh(candelabrum, state), state)} now has seven${lit} candles attached.`,
            state,
        );
    }
    if (candelabrum.lamplit)
        note_unported('light.c obj_merge_light_sources');
    useupall(obj, { ...env, state });
    candelabrum.owt = weight(candelabrum, { ...env, state });
    update_inventory({ ...env, state });
}

// C ref: apply.c doapply() (4213-4430), the `a` command.
//
// retouch_object(&obj, FALSE) sits between getobj() and the switch, and only
// an artifact stops here, on the same derivation js/eat.js:1449-1458 records
// for doeat(). artifact.c retouch_object() (2507-2528) answers 1 with no side
// effect unless `ag` or `bane` is set; both need get_artifact() to answer
// something, except for `ag`'s other conjunct Hate_silver. That one is
// provably false in this port: youprop.h:401 spells it
// `u.ulycn >= LOW_PM || hates_silver(gy.youmonst.data)`, js/u_init.js:368
// writes NON_PM into u.ulycn and nothing writes it again, and
// js/u_init.js:275 builds state.youmonst once and nothing reassigns its
// `data`, because no polymorph is ported. The BELL_OF_OPENING shortcut at the
// top of retouch_object() answers 1 as well, so it changes nothing either.
// Porting the artifact arm needs touch_artifact()'s blast, bane_applies(),
// losehp() and remove_worn_item().
export async function doapply(state = game, env = {}) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to use or apply tools in your current form.",
            state,
        );
        return ECMD_OK;
    }
    if (await check_capacity(null, state))
        return ECMD_OK;

    const obj = await getobj('use or apply', apply_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    if (obj.oartifact)
        throw new UnsupportedApplyError('retouch_object() for an artifact');

    if (obj.oclass === WAND_CLASS)
        throw new UnsupportedApplyError('do_break_wand()');
    if (obj.oclass === SPBOOK_CLASS)
        throw new UnsupportedApplyError('flip_through_book()');
    if (obj.oclass === COIN_CLASS)
        throw new UnsupportedApplyError('flip_coin()');

    switch (obj.otyp) {
    case CREAM_PIE:
        return use_cream_pie(obj, state, env);
    case BULLWHIP:
        return use_whip(obj, state);
    case STETHOSCOPE:
        return use_stethoscope(obj, state);
    case EXPENSIVE_CAMERA:
        return use_camera(obj, state, env);
    case PICK_AXE:
    case DWARVISH_MATTOCK:
        return use_pick_axe(obj, state, env);
    case LOCK_PICK:
    case CREDIT_CARD:
    case SKELETON_KEY:
        // apply.c:4285-4289. Every pick_lock() answer except
        // PICKLOCK_DID_NOTHING spends the turn, which is what draws the next
        // turn's random numbers.
        return (await pick_lock(obj, 0, 0, null, state) !== 0)
            ? ECMD_TIME : ECMD_OK;
    case LARGE_BOX:
    case CHEST:
    case ICE_BOX:
    case SACK:
    case BAG_OF_HOLDING:
    case OILSKIN_SACK:
        // apply.c:4271-4278. use_container() handles open/close/loot.
        return use_container(obj, true, false, state);
    case BAG_OF_TRICKS:
        // apply.c:4279-4281. (void) bagotricks(obj, FALSE, (int *) 0)
        await bagotricks(obj, false, state);
        return ECMD_TIME;
    case WAX_CANDLE:
    case TALLOW_CANDLE:
        await use_candle(obj, state, env);
        return ECMD_TIME;
    case OIL_LAMP:
    case MAGIC_LAMP:
    case BRASS_LANTERN:
        await use_lamp(obj, state, env);
        return ECMD_TIME;
    case MAGIC_MARKER:
        // apply.c:4361-4362. dowrite() handles the full magic marker flow.
        return dowrite(obj, state);
    case HORN_OF_PLENTY:
        // apply.c:4385-4387. Not a musical instrument.
        // C's res starts as ECMD_TIME; hornoplenty doesn't change it.
        await hornoplenty(obj, false, null, { state });
        return ECMD_TIME;
    case LAND_MINE:
    case BEARTRAP:
        // apply.c:4388-4393. use_trap() is void, so doapply() keeps its
        // initial ECMD_TIME result while it schedules the occupation.
        await use_trap(obj, state, env);
        return ECMD_TIME;
    case WOODEN_FLUTE:
    case MAGIC_FLUTE:
    case TOOLED_HORN:
    case FROST_HORN:
    case FIRE_HORN:
    case WOODEN_HARP:
    case MAGIC_HARP:
    case BUGLE:
    case LEATHER_DRUM:
    case DRUM_OF_EARTHQUAKE:
        // apply.c:4372-4383. All musical instruments share this owner.
        return do_play_instrument(obj, state, env);
    case BANANA:
        // apply.c:4401-4403. Hallucinating heroes get the banana's ringing
        // message and the source's initial ECMD_TIME result; otherwise C
        // falls through to the generic default arm below.
        if (heroHallucinating(state)) {
            await ttyPline("It rings! ... But no-one answers.", state);
            return ECMD_TIME;
        }
        // FALLTHROUGH to the same unknown-use result as the C default.
    default:
        // apply.c:4407-4417. CARROT and other nonnamed foods use this arm;
        // BANANA also falls through here when not hallucinating. Those food
        // objects cannot be poles, picks, or axes because the source macros
        // admit only WEAPON_CLASS and TOOL_CLASS.
        // C names LUMP_OF_ROYAL_JELLY before its default, but that helper is
        // still unported. CREAM_PIE also has an earlier named arm, which the
        // switch above handles. Other FOOD_CLASS items, including CARROT,
        // use the generic result.
        if (obj.oclass === FOOD_CLASS && obj.otyp !== LUMP_OF_ROYAL_JELLY) {
            await ttyPline("Sorry, I don't know how to use that.", state);
            return ECMD_FAIL;
        }
        // The same already-ported default result applies to ordinary armor.
        if (obj.oclass === ARMOR_CLASS) {
            await ttyPline("Sorry, I don't know how to use that.", state);
            return ECMD_FAIL;
        }
        if (is_pole(obj, state))
            return use_pole(obj, false, state);
        if (is_pick(obj, state) || is_axe(obj, state))
            return use_pick_axe(obj, state, env);
        // Every named arm this port has not implemented, plus the default's
        // other unported arms, stays fail-closed.
        // The refusal names the object type so a session says which path it
        // wanted without accidentally executing a partial implementation.
        throw new UnsupportedApplyError(
            `doapply()'s arm for object type ${obj.otyp}`,
        );
    }
    // C's tail, `if (obj && obj->oartifact) res |= arti_speak(obj)`, has no
    // reachable input: the retouch_object() stop above refuses every artifact
    // before the switch, and no arm here can turn a non-artifact into one.
}
