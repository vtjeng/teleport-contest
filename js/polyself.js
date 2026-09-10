// Polymorph self -- controlled transformation, species property binding, body
// part naming, and the flight/stealth blocking updates.
// C ref: polyself.c set_uasmon(), check_strangling(), polyman(),
// change_sex(), livelog_newform(), newman(), polyself(),
// polymon(), uasmon_maxStr(), break_armor(), drop_weapon(), dropp(),
// rehumanize(), dobreathe(), dospit(), doremove(), dospinweb(), dosummon(),
// dogaze(), dohide(), dopoly(), domindblast(), uunstick(), skinback(),
// mbodypart(), body_part(), poly_gender(), ugolemeffects(), polysense(),
// float_vs_flight(), steed_vs_stealth(), ugenocided(), udeadinside().

import {
    A_CON,
    A_DEX,
    A_STR,
    A_WIS,
    ACID_RES,
    ANTI_MAGIC,
    ANTIMAGIC,
    ARM,
    ARROW_TRAP,
    BEAR_TRAP,
    BLINDED,
    BLND_RES,
    BOLT_LIM,
    BZ_OFS_AD,
    BZ_U_BREATH,
    COLD_RES,
    CONFUSION,
    DART_TRAP,
    DIED,
    DISINT_RES,
    DRAIN_RES,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    EYE,
    FEMALE,
    FINGER,
    FINGERTIP,
    FIRE_RES,
    FIRE_TRAP,
    FLYING,
    FOOT,
    FREE_ACTION,
    FROMFORM,
    FROM_RACE,
    FROMOUTSIDE,
    G_GENOD,
    GENOCIDED,
    HAIR,
    HALLUC,
    HALLUC_RES,
    HAND,
    HANDED,
    HEAD,
    HOLE,
    I_SPECIAL,
    In_endgame,
    INVIS,
    INFRAVISION,
    IS_AIR,
    IS_FOUNTAIN,
    Is_airlevel,
    Is_waterlevel,
    KILLED_BY,
    KILLED_BY_AN,
    LANDMINE,
    LEG,
    LEVEL_TELEP,
    LEVITATION,
    LS_MONSTER,
    M_AP_FURNITURE,
    M_AP_NOTHING,
    M_AP_OBJECT,
    M_AP_TYPE,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    MALE,
    MAXULEV,
    NATTK,
    NECK,
    NO_KILLER_PREFIX,
    NO_PART,
    NO_TRAP_FLAGS,
    NON_PM,
    NOSE,
    PASSES_WALLS,
    PIT,
    POISON_RES,
    POLY_CONTROLLED,
    POLY_MONSTER,
    POLY_TRAP,
    POLYMORPH,
    POLYMORPH_CONTROL,
    REFLECTING,
    REGENERATION,
    ROCKTRAP,
    ROLLING_BOULDER_TRAP,
    RUST_TRAP,
    SEE_INVIS,
    SHOCK_RES,
    SHOPBASE,
    SICK,
    SICK_RES,
    SLEEP_RES,
    SLIMED,
    SLP_GAS_TRAP,
    SPIKED_PIT,
    SQKY_BOARD,
    STAIRS,
    STEALTH,
    STOMACH,
    STONE_RES,
    STONED,
    STONING,
    STRANGLED,
    STUNNED,
    SWIMMING,
    TELEP_TRAP,
    TELEPAT,
    TELEPORT,
    TELEPORT_CONTROL,
    TOE,
    TRAPDOOR,
    TT_BURIEDBALL,
    TT_PIT,
    UNCHANGING,
    Ugender,
    Upolyd,
    VIBRATING_SQUARE,
    WARN_OF_MON,
    WEB,
    helpless,
    plur,
} from './const.js';
import {
    adjabil, exercise, newhp, redist_attr, setuhpmax,
} from './attrib.js';
import { game } from './gstate.js';
import { mungspaces } from './hacklib.js';
import {
    attacktype,
    attacktype_fordmg,
    breakarm,
    can_be_strangled,
    can_breathe,
    could_twoweap,
    dmgtype,
    dmgtype_fromattack,
    emits_light,
    has_horns,
    hides_under,
    humanoid,
    infravision,
    is_animal,
    is_bat,
    is_clinger,
    is_floater,
    is_flyer,
    is_hider,
    is_female,
    is_male,
    is_neuter,
    is_placeholder,
    is_swimmer,
    is_vampire,
    is_vampshifter,
    is_mind_flayer,
    is_unicorn,
    is_were,
    is_whirly,
    lays_eggs,
    eggs_in_water,
    mindless,
    monster_resists_element,
    nohands,
    nonliving,
    passes_walls,
    perceives,
    pm_invisible,
    polyok,
    regenerates,
    resists_drli,
    sliparm,
    slithy,
    sticks,
    strongmonst,
    telepathic,
    touch_petrifies,
    valid_vampshiftform,
    verysmall,
    webmaker,
    weirdnonliving,
    can_teleport,
    control_teleport,
    your_race,
    name_to_mon,
} from './mondata.js';
import { character_race, genders } from './roles.js';
import {
    capitalizedMonsterName,
    hliquid,
    l_monnam,
    monsterCommonName,
    pmname,
    y_monnam,
} from './do_name.js';
import { set_mon_data } from './makemon_create.js';
import { mkclass_poly } from './makemon.js';
import { cloak_simple_name, cxname, otense, simpleonames, an } from './objnam.js';
import { find_ac } from './u_init_inventory_attrs.js';
import { max_rank_sz } from './u_init.js';
import { newsym, rank_of, see_monsters } from './display.js';
import { encumber_msg } from './pickup.js';
import { update_inventory } from './invent.js';
import { dropx, canletgo } from './do.js';
import { getlin } from './windows.js';
import { ttyPline, ttyUrgentPline } from './tty_message.js';
import {
    deltrap, is_pool, is_pool_or_lava, maketrap, set_utrap, t_at,
} from './trap.js';
import { dotrap, feeltrap } from './trap_effects.js';
import { make_blinded, make_glib, set_itimeout } from './potion.js';
import { cantwield, untwoweapon, uwepgone, uswapwepgone } from './wield.js';
import { _doWearInternals } from './do_wear.js';
import { Is_dragon_armor, is_sword, mksobj, remove_object } from './obj.js';
import { makeplural } from './fruit.js';
import { weapon_descr } from './weapon.js';
import {
    ACID_VENOM,
    AMULET_OF_STRANGULATION,
    AMULET_OF_UNCHANGING,
    BLINDING_VENOM,
    CORPSE,
    MUMMY_WRAPPING,
    STRANGE_OBJECT,
} from './objects.js';
import * as M from './monsters.js';
import { rn1, rn2, rnd, rne, rnl, d } from './rng.js';
import { getdir, y_n } from './cmd.js';
import { ubuzz, ubreatheu } from './zap.js';
import { newpw, rndexp } from './exper.js';
import { newuhs } from './eat.js';
import { done, find_delayed_killer } from './end.js';
import { nomul, rounddiv, spoteffects, unmul } from './hack.js';
import { dist2, s_suffix } from './hacklib.js';
import { discover_object, observe_object } from './o_init.js';
import { del_light_source, new_light_source } from './light.js';
import { has_ceiling, surface } from './dungeon.js';
import { On_stairs } from './stairs.js';
import { canseemon, couldsee } from './vision.js';
import { throwit } from './dothrow.js';
import { in_rooms } from './rooms.js';
import { destroy_items } from './zap_destroy_items.js';
import { ignite_items } from './apply_catch_lit.js';
import { killed, set_ustuck, setmangry, wakeup } from './mon.js';
import { were_summon } from './were.js';
import { note_unported } from './unported.js';

// Boundary error for polyself branches that fall outside the current goal.
// failClosedCommand() in cmd.js converts this to an
// UnsupportedHeroCommandBranchBoundaryError, which the scorer keeps as a
// graceful stop rather than a session crash.
export class UnsupportedPolyselfError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedPolyselfError';
    }
}

function uprop(state, index) {
    const property = state.u?.uprops?.[index];
    if (!property)
        throw new Error(`hero property ${index} is not initialized`);
    return property;
}

// youprop.h:253 Flying. A flying steed carries the hero through the air, so
// the steed term belongs inside the macro rather than at its call sites.
function Flying(state) {
    const flying = uprop(state, FLYING);
    return Boolean((flying.intrinsic || flying.extrinsic
                    || (state.u.usteed && is_flyer(state.u.usteed.data)))
                   && !flying.blocked);
}

// youprop.h:242 Levitation.
function Levitation(state) {
    const levitation = uprop(state, LEVITATION);
    return Boolean((levitation.intrinsic || levitation.extrinsic)
                   && !levitation.blocked);
}

// youprop.h:103 Blind and :198 Invis: intrinsic or extrinsic, defeated by a
// block.
function Blind(state) {
    const blinded = uprop(state, BLINDED);
    return Boolean((blinded.intrinsic || blinded.extrinsic)
                   && !blinded.blocked);
}

function Invis(state) {
    const invis = uprop(state, INVIS);
    return Boolean((invis.intrinsic || invis.extrinsic) && !invis.blocked);
}

// youprop.h:120 Hallucination is HHallucination && !Halluc_resistance, and
// :119 Halluc_resistance is intrinsic or extrinsic.
function Hallucination(state) {
    const halluc = uprop(state, HALLUC);
    const resistance = uprop(state, HALLUC_RES);
    return Boolean(halluc.intrinsic
                   && !(resistance.intrinsic || resistance.extrinsic));
}

// youprop.h:84 Confusion is HConfusion alone.
function Confusion(state) {
    return Boolean(uprop(state, CONFUSION).intrinsic);
}

// youprop.h:65 Stone_resistance, :152 See_invisible, :368 Polymorph_control
// and :372 Unchanging: intrinsic or extrinsic, with no block term.
function intrinsicOrExtrinsic(state, index) {
    const property = uprop(state, index);
    return Boolean(property.intrinsic || property.extrinsic);
}

function Stone_resistance(state) {
    return intrinsicOrExtrinsic(state, STONE_RES);
}

function See_invisible(state) {
    return intrinsicOrExtrinsic(state, SEE_INVIS);
}

function Polymorph_control(state) {
    return intrinsicOrExtrinsic(state, POLYMORPH_CONTROL);
}

function Unchanging(state) {
    return intrinsicOrExtrinsic(state, UNCHANGING);
}

// youprop.h:383 Free_action reads the extrinsic field alone.
function Free_action(state) {
    return Boolean(uprop(state, FREE_ACTION).extrinsic);
}

// monst.h:272 resists_fire(mon) is Resists_Elem(mon, FIRE_RES), whose
// monster arm mondata.js ports as monster_resists_element().
function resists_fire(mon, state) {
    return monster_resists_element(mon, FIRE_RES, state);
}

// mondata.h:71 digests: an AT_ENGL attack that deals AD_DGST.
function digests(ptr) {
    return dmgtype_fromattack(ptr, M.AD_DGST, M.AT_ENGL) !== 0;
}

// you.h:559 mdistu(mon), the squared distance from the hero to a monster.
function mdistu(mon, state) {
    return dist2(mon.mx, mon.my, state.u.ux, state.u.uy);
}

// monst.h DEADMONSTER(mon): the port has no separate dead flag, so a
// monster with no hit points left is the dead one, as monmove.js reads it.
function DEADMONSTER(mon) {
    return mon.mhp <= 0;
}

// C ref: polyself.c float_vs_flight() (131-154). Floating overrides flight and
// being stuck in the floor overrides floating; both are expressed as the
// I_SPECIAL bit of the corresponding blocked mask.
export function float_vs_flight(state = game) {
    const u = state.u;
    const flying = uprop(state, FLYING);
    const levitation = uprop(state, LEVITATION);
    const stuck_in_floor = Boolean(u.utrap && u.utraptype !== TT_PIT);

    if ((levitation.intrinsic || levitation.extrinsic)
        || ((flying.intrinsic || flying.extrinsic) && stuck_in_floor))
        flying.blocked |= I_SPECIAL;
    else
        flying.blocked &= ~I_SPECIAL;
    if ((levitation.intrinsic || levitation.extrinsic) && stuck_in_floor)
        levitation.blocked |= I_SPECIAL;
    else
        levitation.blocked &= ~I_SPECIAL;

    steed_vs_stealth(state);

    state.disp ??= {};
    state.disp.botl = true;
}

// C ref: polyself.c steed_vs_stealth() (158-164). Riding blocks stealth unless
// hero and steed fly. This is the only writer of uprops[STEALTH].blocked, the
// BStealth term of youprop.h:210's Stealth macro.
export function steed_vs_stealth(state = game) {
    const stealth = uprop(state, STEALTH);
    if (state.u.usteed && !Flying(state) && !Levitation(state))
        stealth.blocked |= FROMOUTSIDE;
    else
        stealth.blocked &= ~FROMOUTSIDE;
}

// ---------- polysense --------------------------------------------------
// C ref: polyself.c polysense() (2236-2261). Some species have awareness of
// other species; reset or set the polymorph-driven warning fields.
function polysense(state) {
    let warnidx = NON_PM;
    state.context ??= {};
    state.context.warntype ??= {};
    state.context.warntype.speciesidx = NON_PM;
    state.context.warntype.species = null;
    state.context.warntype.polyd = 0;
    // HWarn_of_mon &= ~FROMRACE — clear the race-sourced warning
    const wom = state.u.uprops[WARN_OF_MON];
    wom.intrinsic &= ~FROM_RACE;

    switch (state.u.umonnum) {
    case M.PM_PURPLE_WORM:
    case M.PM_BABY_PURPLE_WORM:
        warnidx = M.PM_SHRIEKER;
        break;
    case M.PM_VAMPIRE:
    case M.PM_VAMPIRE_LEADER:
        state.context.warntype.polyd = M.M2_HUMAN | M.M2_ELF;
        wom.intrinsic |= FROM_RACE;
        return;
    default:
        break;
    }
    if (Number.isInteger(warnidx) && warnidx >= M.LOW_PM) {
        state.context.warntype.speciesidx = warnidx;
        state.context.warntype.species = state.mons[warnidx];
        wom.intrinsic |= FROM_RACE;
    }
}

// ---------- check_strangling -------------------------------------------
// C ref: polyself.c check_strangling() (167-193). Toggle strangulation on
// polymorphing into or out of a form immune to it.
async function check_strangling(on, state) {
    const u = state.u;
    if (on) {
        // maybe resume strangling
        const was_strangled = (u.uprops[STRANGLED].intrinsic !== 0);
        if (state.uamul && state.uamul.otyp === AMULET_OF_STRANGULATION
            && can_be_strangled(state.youmonst, state)) {
            u.uprops[STRANGLED].intrinsic = 6;
            state.disp ??= {};
            state.disp.botl = true;
            const itemName = simpleonames(state.uamul, state);
            const verb = was_strangled
                ? 'still constricts' : 'begins constricting';
            await ttyPline(
                `Your ${itemName} ${verb} your ${body_part(NECK, state.youmonst)}!`,
                state,
            );
            // makeknown(AMULET_OF_STRANGULATION) -- discover_object
            // is not ported; the wizard-mode gnome has no strangulation amulet
        }
    } else {
        // maybe block strangling
        if (u.uprops[STRANGLED].intrinsic
            && !can_be_strangled(state.youmonst, state)) {
            u.uprops[STRANGLED].intrinsic = 0;
            state.disp ??= {};
            state.disp.botl = true;
            await ttyPline('You are no longer being strangled.', state);
        }
    }
}

// ---------- set_uasmon -------------------------------------------------
// C ref: polyself.c set_uasmon() (38-126). Update youmonst.data pointer,
// intrinsic properties from form, cham field, and call polysense()/
// float_vs_flight().
export function set_uasmon(state = game) {
    const mdat = state.mons[state.u.umonnum];
    const was_vampshifter = valid_vampshiftform(
        state.youmonst.cham, state.u.umonnum, state,
    );
    set_mon_data(state.youmonst, mdat, state);
    state.youmonst.m_id = 1;

    // Protection_from_shape_changers — not ported, assumed false for now
    if (is_vampire(state.youmonst.data))
        state.youmonst.cham = state.youmonst.mnum;
    else if (!was_vampshifter)
        state.youmonst.cham = NON_PM;
    state.u.mcham = state.youmonst.cham;

    // The PROPSET block: set or clear FROMFORM intrinsic bit for each property
    function PROPSET(propIndx, on) {
        if (on)
            state.u.uprops[propIndx].intrinsic |= FROMFORM;
        else
            state.u.uprops[propIndx].intrinsic &= ~FROMFORM;
    }
    function resist_from_form(mrtyp) {
        return (state.youmonst.data.mresists & mrtyp) !== 0;
    }

    PROPSET(FIRE_RES, resist_from_form(M.MR_FIRE));
    PROPSET(COLD_RES, resist_from_form(M.MR_COLD));
    PROPSET(SLEEP_RES, resist_from_form(M.MR_SLEEP));
    PROPSET(DISINT_RES, resist_from_form(M.MR_DISINT));
    PROPSET(SHOCK_RES, resist_from_form(M.MR_ELEC));
    PROPSET(POISON_RES, resist_from_form(M.MR_POISON));
    PROPSET(ACID_RES, resist_from_form(M.MR_ACID));
    PROPSET(STONE_RES, resist_from_form(M.MR_STONE));

    // resists_drli() takes wielded weapon into account; suppress it
    const save_uwep = state.uwep;
    state.uwep = null;
    PROPSET(DRAIN_RES, resists_drli(state.youmonst, state));
    state.uwep = save_uwep;

    // resists_magm() duplicate of its monster-specific part
    PROPSET(ANTIMAGIC, (dmgtype(mdat, M.AD_MAGM)
                        || mdat.pmidx === M.PM_BABY_GRAY_DRAGON
                        || dmgtype(mdat, M.AD_RBRE)));
    PROPSET(SICK_RES, (mdat.mlet === M.S_FUNGUS
                       || mdat.pmidx === M.PM_GHOUL));

    PROPSET(STUNNED, (mdat.pmidx === M.PM_STALKER || is_bat(mdat)));
    PROPSET(HALLUC_RES, dmgtype(mdat, M.AD_HALU));
    PROPSET(SEE_INVIS, perceives(mdat));
    PROPSET(TELEPAT, telepathic(mdat));
    // infravision uses mons[race] rather than usual mons[role]
    PROPSET(INFRAVISION, infravision(
        Upolyd(state.u) ? mdat : state.mons[state.urace?.mnum],
    ));
    PROPSET(INVIS, pm_invisible(mdat));
    PROPSET(TELEPORT, can_teleport(mdat));
    PROPSET(TELEPORT_CONTROL, control_teleport(mdat));
    PROPSET(LEVITATION, is_floater(mdat));
    // floating eye is the only 'floater'; suppress flying for it
    PROPSET(FLYING, (is_flyer(mdat) && !is_floater(mdat)));
    PROPSET(SWIMMING, is_swimmer(mdat));
    // [don't touch MAGICAL_BREATHING here]
    PROPSET(PASSES_WALLS, passes_walls(mdat));
    PROPSET(REGENERATION, regenerates(mdat));
    PROPSET(REFLECTING, (mdat.pmidx === M.PM_SILVER_DRAGON));
    PROPSET(BLINDED, !haseyes(mdat));
    PROPSET(BLND_RES, (dmgtype_fromattack(mdat, M.AD_BLND, M.AT_EXPL)
                       || dmgtype_fromattack(mdat, M.AD_BLND, M.AT_GAZE)));

    if (!state.program_state?.restoring)
        float_vs_flight(state);
    polysense(state);

    // we can reset this now
    state.gw ??= {};
    state.gw.were_changes = 0;
}

// haseyes — used by PROPSET; re-exported from mondata would create a cycle
// so we inline it. C ref: mondata.h haseyes() — !M1_NOEYES.
function haseyes(mdat) {
    return !((mdat?.mflags1 ?? 0) & M.M1_NOEYES);
}

// C ref: polyself.c armor_to_dragon() (2191-2231). Stub: the gnome case never
// reaches this because uskin is null. The full implementation belongs in a
// later slice that ports dragon-armor merging.
function armor_to_dragon(_otyp) {
    throw new UnsupportedPolyselfError('armor_to_dragon is not ported');
}

// ---------- uasmon_maxStr ----------------------------------------------
// C ref: polyself.c uasmon_maxStr() (1076-1119). Compute the maximum
// strength for the hero's current polymorphed form.
export function uasmon_maxStr(state = game) {
    let mndx = state.u.umonnum;
    const ptr = state.mons[mndx];
    const { is_orc, is_elf, is_dwarf, is_gnome } = M;

    if ((ptr.mflags2 & M.M2_ORC) !== 0) {
        if (mndx !== M.PM_URUK_HAI && mndx !== M.PM_ORC_CAPTAIN)
            mndx = M.PM_ORC;
    } else if ((ptr.mflags2 & M.M2_ELF) !== 0) {
        mndx = M.PM_ELF;
    } else if ((ptr.mflags2 & M.M2_DWARF) !== 0) {
        mndx = M.PM_DWARF;
    } else if ((ptr.mflags2 & M.M2_GNOME) !== 0) {
        mndx = M.PM_GNOME;
    }
    const R = character_race(mndx);

    if (strongmonst(ptr)) {
        const is_giant_flag = (ptr.mflags2 & M.M2_GIANT) !== 0;
        const is_undead_flag = (ptr.mflags2 & M.M2_UNDEAD) !== 0;
        const live_H = is_giant_flag && !is_undead_flag;
        // STR19(19) = 19+100 = 119, STR18(100) = 18+100 = 118
        return R ? R.attrmax[A_STR] : live_H ? 119 : 118;
    }
    return R ? R.attrmax[A_STR] : 18;
}

// ---------- skinback ---------------------------------------------------
// C ref: polyself.c skinback() (1953-1969). Return merged dragon scales.
export async function skinback(silently, state = game) {
    if (state.uskin) {
        if (!silently)
            await ttyPline('Your skin returns to its original form.', state);
        state.uarm = state.uskin;
        state.uskin = null;
        state.uarm.owornmask &= ~I_SPECIAL;
        // artifact light adjustment omitted — no artifact dragon scales
        // in the gnome case
    }
}

// ---------- dropp (break_armor helper) ---------------------------------
// C ref: polyself.c dropp() (1122-1154). Drop an item from inventory,
// checking that it is still there (emergency_disrobe might have removed it).
async function dropp(obj, state) {
    let otmp = state.invent;
    while (otmp) {
        if (otmp === obj) {
            // C's dropp() calls dropx() unconditionally; dropx()/dropz()
            // requires three hooks that its callers inject: newsym (do.c:840),
            // encumber_msg (do.c:842), and remove_object (via stackobj ->
            // merged -> obj_extract_self). Match do.js dropCommandEnv().
            await dropx(obj, {
                state,
                hooks: {
                    newsym,
                    encumberMessage: encumber_msg,
                    extractExternalObject: remove_object,
                },
            });
            break;
        }
        otmp = otmp.nobj;
    }
}

// ---------- break_armor ------------------------------------------------
// C ref: polyself.c break_armor() (1156-1302). Remove armor that the new
// form cannot wear. For the gnome case (sliparm), the cloak falls off.
async function break_armor(state) {
    let otmp;
    const uptr = state.youmonst.data;
    const { Cloak_off, Helmet_off, Shield_off } = _doWearInternals;

    if (breakarm(uptr)) {
        // Body armor destruction
        if ((otmp = state.uarm) != null) {
            // cancel_don() — donning interruption not ported
            // end_burn, Armor_gone, useup — the armor destruction path
            // is not exercised by the gnome case (gnome is sliparm, not
            // breakarm). Throw if reached.
            throw new UnsupportedPolyselfError('break_armor: breakarm body armor path not ported');
        }
        if ((otmp = state.uarmc) != null) {
            throw new UnsupportedPolyselfError('break_armor: breakarm cloak path not ported');
        }
        if (state.uarmu) {
            throw new UnsupportedPolyselfError('break_armor: breakarm shirt path not ported');
        }
    } else if (sliparm(uptr)) {
        if ((otmp = state.uarm) != null) {
            // racial_exception not needed for gnome case (no body armor)
            // cancel_don() not ported — donning interruption
            await ttyPline('Your armor falls around you!', state);
            // Armor_gone() — setworn(null, W_ARM) to clear owornmask
            // The minimal equivalent: clear the worn slot
            if (otmp.owornmask) {
                otmp.owornmask = 0;
                state.uarm = null;
            }
            await dropp(otmp, state);
        }
        if ((otmp = state.uarmc) != null
            && (otmp.otyp !== MUMMY_WRAPPING /* WrappingAllowed omitted */)) {
            // Not whirly for gnome
            await ttyPline(
                `You shrink out of your ${cloak_simple_name(otmp, state)}!`,
                state,
            );
            Cloak_off(state);
            await dropp(otmp, state);
        }
        if ((otmp = state.uarmu) != null) {
            await ttyPline('You become much too small for your shirt!', state);
            // setworn(null, W_ARMU)
            if (otmp.owornmask) {
                otmp.owornmask = 0;
                state.uarmu = null;
            }
            await dropp(otmp, state);
        }
    }
    // has_horns check
    if (has_horns(uptr)) {
        if ((otmp = state.uarmh) != null) {
            // cancel_don, Helmet_off, dropp — not exercised for gnome
            throw new UnsupportedPolyselfError('break_armor: horned helmet removal not ported');
        }
    }
    // nohands or verysmall — gloves, shield, helmet
    if (nohands(uptr) || verysmall(uptr)) {
        if ((otmp = state.uarmg) != null) {
            throw new UnsupportedPolyselfError(
                'break_armor: nohands/verysmall gloves removal not ported',
            );
        }
        if ((otmp = state.uarms) != null) {
            throw new UnsupportedPolyselfError(
                'break_armor: nohands/verysmall shield removal not ported',
            );
        }
        if ((otmp = state.uarmh) != null) {
            throw new UnsupportedPolyselfError(
                'break_armor: nohands/verysmall helmet removal not ported',
            );
        }
    }
    // nohands or verysmall or slithy or centaur — boots
    if (nohands(uptr) || verysmall(uptr)
        || slithy(uptr) || uptr.mlet === M.S_CENTAUR) {
        if ((otmp = state.uarmf) != null) {
            // cancel_don, Boots_off, dropp — not exercised for gnome
            throw new UnsupportedPolyselfError('break_armor: boots removal not ported');
        }
    }
    // headless — eyewear
    // has_head is mondata.h:33 (!M1_NOHEAD). Gnome has a head.
    // skip for gnome; throw if hit
    const has_head = !((uptr?.mflags1 ?? 0) & M.M1_NOHEAD);
    if ((otmp = state.ublindf) != null && !has_head) {
        throw new UnsupportedPolyselfError('break_armor: headless eyewear removal not ported');
    }
}

// ---------- drop_weapon ------------------------------------------------
// C ref: polyself.c drop_weapon() (1304-1361). Force the hero to drop
// weapons if the new form cannot wield them.  For the dragon case with
// alone=1, cantwield(dragon) is true (nohands), so the hero drops the
// wielded weapon.  For the gnome case, cantwield is false (humanoid
// hands), so this falls through to the untwoweapon check.
async function drop_weapon(alone, state) {
    if (state.uwep) {
        // alone=0 when called from break_armor alongside glove removal;
        // alone=1 when called directly from polymon.
        if (!alone || cantwield(state.youmonst.data)) {
            const candropwep = await canletgo(state.uwep, '', state);
            const candropswapwep = !state.u.twoweap
                || await canletgo(state.uswapwep, '', state);
            let updateinv = true;

            if (alone) {
                // Build the "You find you must drop your <weapon>!" message.
                const what = (candropwep && candropswapwep) ? 'drop' : 'release';
                let which = is_sword(state.uwep, state)
                    ? 'sword' : weapon_descr(state.uwep, state);
                if (state.u.twoweap) {
                    const whichtoo = is_sword(state.uswapwep, state)
                        ? 'sword' : weapon_descr(state.uswapwep, state);
                    if (which !== whichtoo)
                        which = 'weapon';
                }
                if (state.uwep.quan !== 1 || state.u.twoweap)
                    which = makeplural(which);
                // C: the_your[!!strncmp(which, "corpse", 6)] — "your" unless
                // the descriptor starts with "corpse".
                const theYour = which.startsWith('corpse') ? 'the' : 'your';
                await ttyPline(
                    `You find you must ${what} ${theYour} ${which}!`, state,
                );
            }
            // Drop swap weapon first (if twoweap).
            if (state.u.twoweap) {
                const otmp = state.uswapwep;
                uswapwepgone({ state });
                if (otmp.in_use)
                    updateinv = false;
                else if (candropswapwep)
                    await dropx(otmp, {
                        state,
                        hooks: {
                            newsym,
                            encumberMessage: encumber_msg,
                            extractExternalObject: remove_object,
                        },
                    });
            }
            // Drop primary weapon.
            const otmp = state.uwep;
            uwepgone({ state });
            if (otmp.in_use)
                updateinv = false;
            else if (candropwep)
                await dropx(otmp, {
                    state,
                    hooks: {
                        newsym,
                        encumberMessage: encumber_msg,
                        extractExternalObject: remove_object,
                    },
                });
            if (updateinv)
                update_inventory({ state });
        } else if (!could_twoweap(state.youmonst.data)) {
            await untwoweapon(state);
        }
    }
}

// ---------- retouch_equipment (stub) -----------------------------------
// C ref: artifact.c retouch_equipment() (2640). Full implementation needs
// touch_artifact() and the artifact touchability system. For the gnome case,
// this is a no-op because the wizard has no artifact equipment.
async function retouch_equipment(_dropflag, state) {
    // Scan for artifacts that the new form cannot touch. For the gnome
    // case there are none (the starting wizard has no artifacts), so the
    // function returns immediately.
    // A real implementation would iterate worn/wielded artifacts.
}

// ---------- selftouch (stub) -------------------------------------------
// C ref: trap.c selftouch() (3882-3915). Check whether the hero is wielding
// a cockatrice corpse bare-handed. For the gnome case, the wizard's weapon
// is not a cockatrice corpse.
async function selftouch(_arg, state) {
    // If wielding a cockatrice corpse without gloves, petrify. The gnome
    // case never wields a cockatrice corpse, so this is a no-op.
    if (state.uwep && state.uwep.otyp === CORPSE
        && state.mons[state.uwep.corpsenm]
        && ((state.mons[state.uwep.corpsenm].mflags1 ?? 0) & M.M1_POIS)
        /* touch_petrifies check would go here */) {
        // For now, the gnome case never reaches this.
    }
}

// ---------- polymon ----------------------------------------------------
// C ref: polyself.c polymon() (735-1071). Transform the hero into the given
// monster type. This port covers the ordinary-monster happy path (no
// engulfment, steed, traps, eggs, death from petrification/sickness/slime,
// cockatrice corpse, or artifact equipment).
export async function polymon(mntmp, state = game) {
    const u = state.u;
    const mdat = state.mons[mntmp];

    if ((state.svm.mvitals[mntmp].mvflags & G_GENOD) !== 0) {
        const pm_name = pmname(mdat, state.flags?.female ? FEMALE : MALE);
        await ttyPline(`You feel rather ${pm_name}-ish.`, state);
        await exercise(A_WIS, true, state, { rn2 });
        return 0;
    }

    // KMH, conduct
    u.uconduct ??= {};
    u.uconduct.polyselfs = (u.uconduct.polyselfs || 0) + 1;
    // livelog_printf for first polymorph — livelog is not ported

    // exercise: C does CON then WIS at polyself.c:758-759
    await exercise(A_CON, false, state, { rn2 },
        { encumberMessage: encumber_msg });
    await exercise(A_WIS, true, state, { rn2 });

    if (!Upolyd(u)) {
        // Human to monster; save human stats
        u.macurr = { a: [...u.acurr.a] };
        u.mamax = { a: [...u.amax.a] };
        u.mfemale = state.flags.female;
    } else {
        // Monster to monster; restore human stats
        u.acurr = { a: [...u.macurr.a] };
        u.amax = { a: [...u.mamax.a] };
        state.flags.female = u.mfemale;
    }

    // if stuck mimicking gold, stop immediately — mimicry not ported
    // if becoming a non-mimic, stop mimicking anything
    if (mdat.mlet !== M.S_MIMIC) {
        state.youmonst.m_ap_type = 0; // M_AP_NOTHING
        state.youmonst.mappearance = 0;
    }

    // sex change logic — for the gnome case, sex_change_ok is 0 at polyself's
    // call to polymon(). The gnome is not is_male, is_female, or is_neuter,
    // and mntmp !== u.ulycn. With sex_change_ok==0, dochange stays false.
    let dochange = false;
    if ((mdat.mflags2 & M.M2_MALE) !== 0) {
        if (state.flags.female) dochange = true;
    } else if ((mdat.mflags2 & M.M2_FEMALE) !== 0) {
        if (!state.flags.female) dochange = true;
    } else if (!((mdat.mflags2 & M.M2_NEUTER) !== 0) && mntmp !== u.ulycn) {
        if (state.gs?.sex_change_ok && !rn2(10))
            dochange = true;
    }

    // "You turn into a gnome!"
    let buf = (u.umonnum !== mntmp) ? '' : 'new ';
    if (dochange) {
        state.flags.female = !state.flags.female;
        const maleOrFemale = ((mdat.mflags2 & M.M2_MALE) !== 0
                              || (mdat.mflags2 & M.M2_FEMALE) !== 0)
            ? '' : state.flags.female ? 'female ' : 'male ';
        buf += maleOrFemale;
    }
    buf += pmname(mdat, state.flags.female ? FEMALE : MALE);
    const verb = (u.umonnum !== mntmp) ? 'turn into' : 'feel like';
    await ttyPline(`You ${verb} ${an(buf)}!`, state);

    // Stoned + poly_when_stoned — not exercised for gnome
    // make_stoned omitted

    u.mtimedone = rn1(500, 500);
    u.umonnum = mntmp;
    set_uasmon(state);

    // New stats for monster: currently only strength.
    // ABASE(A_STR) = u.acurr.a[A_STR], AMAX(A_STR) = u.amax.a[A_STR].
    const newMaxStr = uasmon_maxStr(state);
    if (strongmonst(state.mons[mntmp])) {
        u.acurr.a[A_STR] = newMaxStr;
        u.amax.a[A_STR] = newMaxStr;
    } else {
        u.amax.a[A_STR] = newMaxStr;
        if (u.acurr.a[A_STR] > u.amax.a[A_STR])
            u.acurr.a[A_STR] = u.amax.a[A_STR];
    }

    // Stone_resistance && Stoned — not exercised for gnome
    // Sick_resistance && Sick — not exercised for gnome
    // Slimed — not exercised for gnome

    await check_strangling(false, state); // maybe stop strangling

    if (nohands(state.youmonst.data))
        make_glib(0, state);

    // HP for new form.  C ref: polyself.c:858-871.
    // Dragon (adult, mntmp >= PM_GRAY_DRAGON): endgame 8*mlvl, else 4*mlvl+d(mlvl,4).
    // Golem: golemhp(). Other: d(mlvl,8) or rnd(4) if mlvl==0, tripled
    // for a home elemental.
    const mlvl = mdat.mlevel;
    if (mdat.mlet === M.S_DRAGON && mntmp >= M.PM_GRAY_DRAGON) {
        u.mhmax = In_endgame(u.uz)
            ? (8 * mlvl)
            : (4 * mlvl + d(mlvl, 4));
    } else if (mdat.mlet === M.S_GOLEM) {
        throw new UnsupportedPolyselfError('polymon: golem HP not ported');
    } else {
        if (!mlvl)
            u.mhmax = rnd(4);
        else
            u.mhmax = d(mlvl, 8);
        // is_home_elemental — not exercised for gnome or dragon
    }
    u.mh = u.mhmax;

    if (u.ulevel < mlvl) {
        // Low level characters can't become high level monsters for long
        u.mtimedone = Math.trunc(u.mtimedone * u.ulevel / mlvl);
    }

    if (state.uskin && mntmp !== armor_to_dragon(state.uskin.otyp))
        await skinback(false, state);
    await break_armor(state);
    await drop_weapon(1, state);
    find_ac(state);

    // if hiding under something — not exercised for gnome
    // was_hiding_under check omitted

    if (u.utrap && u.utraptype === TT_PIT) {
        set_utrap(rn1(6, 2), TT_PIT, state);
    }
    // was_blind && !Blind — eyeless revert, not exercised for gnome
    newsym(u.ux, u.uy);

    // lays_eggs — not exercised for gnome

    // u.uswallow — not exercised for gnome
    // u.ustuck — not exercised for gnome
    // u.usteed — not exercised for gnome

    find_ac(state);
    // pool/lava check
    // Passes_walls trap check — not exercised for gnome

    await check_strangling(true, state); // maybe start strangling

    state.disp ??= {};
    state.disp.botl = true;
    state.vision_full_recalc = 1;
    see_monsters(state);
    await encumber_msg(state);

    await retouch_equipment(2, state);
    if (!state.uarmg)
        await selftouch('No longer petrify-resistant, you', state);

    /* the explanation of '#monster' used to be shown sooner, but there are
       possible fatalities above and it isn't useful unless hero survives */
    // C ref: polyself.c:1031-1069. Each hint is a separate pline(); the
    // checks are independent, so a form can match several.
    if (state.flags.verbose) {
        // C uses static format: "Use the command #%s to %s."
        const hint = (cmd, action) =>
            `Use the command #${cmd} to ${action}.`;
        const uptr = state.youmonst.data;
        const might_hide = is_hider(uptr) || hides_under(uptr);

        if (can_breathe(uptr))
            await ttyPline(hint('monster', 'use your breath weapon'), state);
        if (attacktype(uptr, M.AT_SPIT))
            await ttyPline(hint('monster', 'spit venom'), state);
        if (uptr.mlet === M.S_NYMPH)
            await ttyPline(hint('monster', 'remove an iron ball'), state);
        if (attacktype(uptr, M.AT_GAZE))
            await ttyPline(hint('monster', 'gaze at monsters'), state);
        if (might_hide && webmaker(uptr))
            await ttyPline(hint('monster', 'hide or to spin a web'), state);
        else if (might_hide)
            await ttyPline(hint('monster', 'hide'), state);
        else if (webmaker(uptr))
            await ttyPline(hint('monster', 'spin a web'), state);
        if (is_were(uptr))
            await ttyPline(hint('monster', 'summon help'), state);
        if (u.umonnum === M.PM_GREMLIN)
            await ttyPline(hint('monster', 'multiply in a fountain'), state);
        if (is_unicorn(uptr))
            await ttyPline(hint('monster', 'use your horn'), state);
        if (is_mind_flayer(uptr))
            await ttyPline(hint('monster', 'emit a mental blast'), state);
        if (uptr.msound === M.MS_SHRIEK) /* worthless, actually */
            await ttyPline(hint('monster', 'shriek'), state);
        if (is_vampire(uptr) || is_vampshifter(state.youmonst))
            await ttyPline(hint('monster', 'change shape'), state);

        if (lays_eggs(uptr) && state.flags.female
            && !(uptr.pmidx === M.PM_GIANT_EEL
                 || uptr.pmidx === M.PM_ELECTRIC_EEL))
            await ttyPline(
                hint('sit', eggs_in_water(uptr) ? 'spawn in the water'
                                                : 'lay an egg'),
                state,
            );
    }

    return 1;
}

// ---------- polyman -----------------------------------------------------
// C ref: polyself.c polyman() (198-267). "make a (new) human out of the
// player": restore the attributes, species and gender saved at polymorph
// time, clear the form's hit points, timer and hiding, release a grip and a
// mimicked appearance, announce the change with `fmt` and `arg`, and die if
// the hero genocided her own role or race while polymorphed.
//
// display.c set_mimic_blocking() and end.c dealloc_killer() are unported and
// C discards both results, so each call records its gap and is skipped.
async function polyman(fmt, arg, state) {
    const u = state.u;
    const sticking = Boolean(sticks(state.youmonst.data) && u.ustuck
                             && !u.uswallow);
    const was_mimicking = (M_AP_TYPE(state.youmonst) !== M_AP_NOTHING);
    const was_blind = Blind(state);
    const had_see_invis = See_invisible(state);

    if (Upolyd(u)) {
        u.acurr = { a: [...u.macurr.a] }; /* restore old attribs */
        u.amax = { a: [...u.mamax.a] };
        u.umonnum = u.umonster;
        state.flags.female = u.mfemale;
    }
    set_uasmon(state);

    u.mh = u.mhmax = 0;
    u.mtimedone = 0;
    await skinback(false, state);
    u.uundetected = 0;

    if (sticking)
        await uunstick(state);
    find_ac(state);
    if (was_mimicking) {
        if (state.multi < 0)
            await unmul('', state);
        state.youmonst.m_ap_type = M_AP_NOTHING;
        state.youmonst.mappearance = 0;
    }

    newsym(u.ux, u.uy);

    await ttyUrgentPline(fmt.replace('%s', arg), state);
    /* check whether player foolishly genocided self while poly'd */
    if (ugenocided(state)) {
        /* intervening activity might have clobbered genocide info */
        const kptr = find_delayed_killer(POLYMORPH, state);

        state.killer ??= {};
        if (kptr && kptr.name) {
            state.killer.format = kptr.format;
            state.killer.name = kptr.name;
        } else {
            state.killer.format = KILLED_BY;
            state.killer.name = 'self-genocide';
        }
        note_unported('end.c dealloc_killer');
        await done(GENOCIDED, state);
    }

    if (See_invisible(state) !== had_see_invis)
        note_unported('display.c set_mimic_blocking'); /* See_invisible just toggled */

    if (u.twoweap && !could_twoweap(state.youmonst.data))
        await untwoweapon(state);

    if (u.utrap && u.utraptype === TT_PIT) {
        set_utrap(rn1(6, 2), TT_PIT, state); /* time to escape resets */
    }
    if (was_blind && !Blind(state)) { /* reverting from eyeless */
        set_itimeout(u.uprops[BLINDED], 1);
        await make_blinded(0, true, state); /* remove blindness */
    }
    await check_strangling(true, state);

    if (!Levitation(state) && !u.ustuck && is_pool_or_lava(u.ux, u.uy, state))
        await spoteffects(true, state);

    see_monsters(state);
}

// ---------- change_sex --------------------------------------------------
// C ref: polyself.c change_sex() (272-304). Flip the hero's gender, and the
// saved gender too while polymorphed, then rewrite the character name and
// species to match. Called from newman() here and from do_wear.c Amulet_on()
// and eat.c eataccessory(), whose amulet-of-change arms are not ported.
export function change_sex(state = game) {
    const u = state.u;
    /* Some monsters are always of one sex and their sex can't be changed;
     * Succubi/incubi can change, but are handled below.
     *
     * !Upolyd check necessary because is_male() and is_female()
     * may be true for certain roles
     */
    if (!Upolyd(u)
        || (!is_male(state.youmonst.data) && !is_female(state.youmonst.data)
            && !is_neuter(state.youmonst.data)))
        state.flags.female = !state.flags.female;
    if (Upolyd(u)) /* poly'd: also change saved sex */
        u.mfemale = !u.mfemale;
    max_rank_sz(state); /* [this appears to be superfluous] */
    if ((Upolyd(u) ? u.mfemale : state.flags.female) && state.urole.name.f)
        state.pl_character = state.urole.name.f;
    else
        state.pl_character = state.urole.name.m;
    if (!Upolyd(u)) {
        u.umonnum = u.umonster;
    } else if (u.umonnum === M.PM_AMOROUS_DEMON) {
        state.flags.female = !state.flags.female;
        /* change monster type to match new sex; disabled with
           PM_AMOROUS_DEMON */
        set_uasmon(state);
    }
}

// ---------- livelog_newform ---------------------------------------------
// C ref: polyself.c livelog_newform() (306-333). "log a message if
// non-poly'd hero's gender has changed". The line is built as C builds it;
// pline.c livelog_printf(), which appends it to the chronicle and the live
// log, is unported and C discards its result, so the write records its gap.
export function livelog_newform(viapoly, oldgend, newgend, state = game) {
    const u = state.u;
    const urole = state.urole;

    if (!Upolyd(u)) {
        if (newgend !== oldgend) {
            const oldrole = (oldgend && urole.name.f) ? urole.name.f
                                                      : urole.name.m;
            const newrole = (newgend && urole.name.f) ? urole.name.f
                                                      : urole.name.m;
            const oldrank = rank_of(u.ulevel, urole.mnum, oldgend, state);
            const newrank = rank_of(u.ulevel, urole.mnum, newgend, state);
            const buf = `${genders[state.flags.female ? 1 : 0].adj.slice(0, 10)}`
                        + ` ${newrank.slice(0, 30)}`;
            // `line` is the text livelog_printf(LL_MINORAC, "%s into %s",
            // ...) would append; the append itself is the recorded gap.
            const line = `${viapoly ? 'polymorphed' : 'transformed'} into `
                         + an(newrole !== oldrole ? newrole
                                : newrank !== oldrank ? newrank
                                    : buf);
            note_unported('pline.c livelog_printf');
        }
    }
}

// ---------- newman ------------------------------------------------------
// C ref: polyself.c newman() (336-468). "make a (new) human out of the
// player": the experience level moves by -2..+2, the attributes are
// redistributed, hit points and energy are rebuilt from the per-level
// increments at a random 80-110% of the extra, and the form reverts through
// polyman(). A level outside 1..127, or hit points at or below zero without
// polymorph control, is the "unsuccessful polymorph" death.
//
// pline.c livelog_printf() appends to the chronicle and the live log,
// neither of which the port keeps; C discards its result, so the call
// records its gap and is skipped. The `dead` flag stands for C's `goto dead`
// into the middle of the u.uhp <= 0 arm.
export async function newman(state = game) {
    const u = state.u;
    let i, oldgend;
    const oldlvl = u.ulevel;
    let newlvl = oldlvl + rn1(5, -2);     /* new = old + {-2,-1,0,+1,+2} */
    let dead = false;
    if (newlvl > 127 || newlvl < 1) { /* level went below 0? */
        dead = true; /* old level is still intact (in case of lifesaving) */
    } else {
        if (newlvl > MAXULEV)
            newlvl = MAXULEV;
        /* If your level goes down, your peak level goes down by
           the same amount so that you can't simply use blessed
           full healing to undo the decrease.  But if your level
           goes up, your peak level does *not* undergo the same
           adjustment; you might end up losing out on the chance
           to regain some levels previously lost to other causes. */
        if (newlvl < oldlvl)
            u.ulevelmax -= (oldlvl - newlvl);
        if (u.ulevelmax < newlvl)
            u.ulevelmax = newlvl;
        u.ulevel = newlvl;

        oldgend = poly_gender(state);
        if (state.gs?.sex_change_ok && !rn2(10))
            change_sex(state);

        await adjabil(oldlvl, u.ulevel, state);

        /* random experience points for the new experience level */
        u.uexp = rndexp(false, state);

        /* set up new attribute points (particularly Con) */
        // attrib.h:43 ATTRMAX(A_STR) reads uasmon_maxStr() while Upolyd,
        // and the hero is still in the old form here.
        redist_attr(state, { uasmon_maxStr });

        /*
         * New hit points:
         *  remove "level gain"-based HP from any extra HP accumulated
         *  (the "extra" might actually be negative);
         *  modify the extra, retaining {80%, 90%, 100%, or 110%};
         *  add in newly generated set of level-gain HP.
         */
        let hpmax = u.uhpmax;
        for (i = 0; i < oldlvl; i++)
            hpmax -= u.uhpinc[i];
        /* hpmax * rn1(4,8) / 10; 0.95*hpmax on average */
        hpmax = rounddiv(hpmax * rn1(4, 8), 10);
        for (i = 0; (u.ulevel = i) < newlvl; i++)
            hpmax += newhp(state);
        if (hpmax < u.ulevel)
            hpmax = u.ulevel; /* min of 1 HP per level */
        /* retain same proportion for current HP; u.uhp * hpmax / u.uhpmax */
        u.uhp = rounddiv(u.uhp * hpmax, u.uhpmax);
        setuhpmax(hpmax, true, state); /* might reduce u.uhp */
        /*
         * Do the same for spell power.
         */
        let enmax = u.uenmax;
        for (i = 0; i < oldlvl; i++)
            enmax -= u.ueninc[i];
        enmax = rounddiv(enmax * rn1(4, 8), 10);
        for (i = 0; (u.ulevel = i) < newlvl; i++)
            enmax += newpw(state);
        if (enmax < u.ulevel)
            enmax = u.ulevel;
        u.uen = rounddiv(u.uen * enmax, (u.uenmax < 1) ? 1 : u.uenmax);
        u.uenmax = enmax;
        /* [should alignment record be tweaked too?] */

        u.uhunger = rn1(500, 500);
        if (u.uprops[SICK].intrinsic)
            note_unported('potion.c make_sick');
        if (u.uprops[STONED].intrinsic)
            note_unported('potion.c make_stoned');
        if (u.uhp <= 0) {
            if (Polymorph_control(state)) { /* even when Stunned || Unaware */
                if (u.uhp <= 0)
                    u.uhp = 1;
            } else {
                dead = true;
            }
        }
    }
    if (dead) { /* we come directly here if experience level went to 0 or less */
        await ttyUrgentPline(
            "Your new form doesn't seem healthy enough to survive.", state,
        );
        state.killer ??= {};
        state.killer.format = KILLED_BY_AN;
        state.killer.name = 'unsuccessful polymorph';
        await done(DIED, state);
        /* must have been life-saved to get here */
        await newuhs(false, state);
        await encumber_msg(state); /* used to be done by redist_attr() */
        return; /* lifesaved */
    }
    await newuhs(false, state);
    /* use saved gender we're about to revert to, not current */
    const newform = ((Upolyd(u) ? u.mfemale : state.flags.female)
                     && state.urace.individual.f)
        ? state.urace.individual.f
        : (state.urace.individual.m)
            ? state.urace.individual.m
            : state.urace.noun;
    await polyman('You feel like a new %s!', newform, state);

    const newgend = poly_gender(state);
    /* note: newman() bypasses achievements for new ranks attained and
       doesn't log "new <form>" when that isn't accompanied by level change */
    if (newlvl !== oldlvl)
        note_unported('pline.c livelog_printf');
    else
        livelog_newform(true, oldgend, newgend, state);

    if (u.uprops[SLIMED].intrinsic) {
        await ttyPline(
            'Your body transforms, but there is still slime on you.', state,
        );
        note_unported('potion.c make_slimed');
    }

    state.disp ??= {};
    state.disp.botl = true;
    see_monsters(state);
    await encumber_msg(state);

    await retouch_equipment(2, state);
    if (!state.uarmg)
        await selftouch('No longer petrify-resistant, you', state);
}

// ---------- polyself ----------------------------------------------------
// C ref: polyself.c polyself() (468-731). The #polyself command's main body.
// This port covers the controlled-input branch (forcecontrol=true from
// POLY_CONTROLLED). The do_shift/do_vampyr/do_merge gotos and the
// random-monster selection path are not exercised by the gnome case and
// throw if reached.
export async function polyself(psflags, state = game) {
    const u = state.u;
    const forcecontrol = (psflags & POLY_CONTROLLED) !== 0;
    // Remaining psflags bits and draconian/iswere/isvamp conditions
    const draconian = Boolean(state.uarm && Is_dragon_armor(state.uarm));
    const iswere = Number.isInteger(u.ulycn) && u.ulycn >= M.LOW_PM;
    const isvamp = Boolean(is_vampire(state.youmonst.data)
                           || is_vampshifter(state.youmonst));
    const controllable_poly = false; // Polymorph_control not ported

    // Unchanging check
    // uprops[UNCHANGING] — for the wizard-mode gnome, Unchanging is false
    // so this guard is not taken
    // if (Unchanging) { "You fail to transform!" return; }

    // system shock — skipped when forcecontrol is true

    const old_light = emits_light(state.youmonst.data);
    let mntmp = NON_PM;

    // forcecontrol + low_control gate — only matters if draconian/isvamp/iswere
    // monsterpoly/formrevert — not in POLY_CONTROLLED with no other flags

    if (controllable_poly || forcecontrol) {
        let buf = '';
        let tryct = 5;
        let gvariant = 0; // NEUTRAL gender variant

        do {
            mntmp = NON_PM;
            buf = await getlin(
                'Become what kind of monster? [type the name]', state,
            );
            buf = mungspaces(buf);
            if (buf.charCodeAt(0) === 0x1b || buf === '\x1b') {
                // ESC — user cancelled
                if (forcecontrol) {
                    await ttyPline('Never mind.', state);
                    return;
                }
                buf = '*'; // resort to random
            }
            if (buf === '*' || buf === 'random') {
                tryct = 0;
                continue;
            }
            let monclass = 0;
            const nameResult = name_to_mon(buf, { state });
            mntmp = nameResult;
            if (mntmp < M.LOW_PM) {
                // name_to_monclass fallback — not ported; monclass stays 0
                // so this branch is unreachable until name_to_monclass lands.
                monclass = 0; // placeholder
                if (monclass && mntmp === NON_PM)
                    mntmp = (draconian && monclass === M.S_DRAGON)
                        ? armor_to_dragon(state.uarm.otyp)
                        : mkclass_poly(monclass, { state });
            } else if (is_placeholder(state.mons[mntmp])
                       && !your_race(state.mons[mntmp], state)
                       && mntmp !== M.PM_HUMAN) {
                // placeholder substitution
                if (mntmp === M.PM_ORC)
                    mntmp = rn2(3)
                        ? M.PM_HILL_ORC : M.PM_MORDOR_ORC;
                else if (mntmp === M.PM_ELF)
                    mntmp = rn2(3)
                        ? M.PM_GREEN_ELF : M.PM_GREY_ELF;
                else if (mntmp === M.PM_GIANT)
                    mntmp = rn2(3)
                        ? M.PM_STONE_GIANT : M.PM_HILL_GIANT;
            }

            if (mntmp < M.LOW_PM) {
                if (!monclass)
                    await ttyPline(
                        "I've never heard of such monsters.", state,
                    );
                else
                    await ttyPline(
                        "You can't polymorph into any of those.", state,
                    );
            } else if (iswere /* && were_beastie etc */) {
                throw new UnsupportedPolyselfError('polyself: iswere path not ported');
            } else if (!polyok(state.mons[mntmp])
                       && !(mntmp === M.PM_HUMAN
                            || (your_race(state.mons[mntmp], state)
                                && (state.mons[mntmp].geno & M.G_UNIQ) === 0)
                            || mntmp === state.urace?.mnum)) {
                // Can't polymorph into that
                const pm_name = pmname(state.mons[mntmp],
                    state.flags.female ? FEMALE : MALE);
                await ttyPline(`You can't polymorph into ${an(pm_name)}.`,
                    state);
            } else {
                break;
            }
        } while (--tryct > 0);

        if (!tryct)
            await ttyPline("That's enough tries!", state);
        // draconian merge — not exercised for gnome
        // isvamp do_vampyr — not exercised for gnome
    } else if (draconian || iswere || isvamp) {
        throw new UnsupportedPolyselfError('polyself: draconian/iswere/isvamp path not ported');
    }

    if (mntmp < M.LOW_PM) {
        // random monster selection
        throw new UnsupportedPolyselfError('polyself: random monster selection not ported');
    }

    // sex_change_ok++ / polyok / rn2(5) / your_race gate
    state.gs ??= {};
    state.gs.sex_change_ok = (state.gs.sex_change_ok || 0) + 1;
    if (!polyok(state.mons[mntmp]) || (!forcecontrol && !rn2(5))
        || your_race(state.mons[mntmp], state)) {
        await newman(state);
    } else {
        await polymon(mntmp, state);
    }
    state.gs.sex_change_ok--;

    // made_change: polyself.c:722-730. A form that emits light carries a
    // monster light source on youmonst; swap it when the emitted range
    // changes, and raise a range of 1 to 2 so the source is detectable.
    let new_light = emits_light(state.youmonst.data);
    if (old_light !== new_light) {
        if (old_light)
            del_light_source(LS_MONSTER, state.youmonst, state);
        if (new_light === 1)
            ++new_light; /* otherwise it's undetectable */
        if (new_light)
            new_light_source(u.ux, u.uy, new_light, LS_MONSTER,
                state.youmonst, state);
    }
}

const HUMANOID_PARTS = Object.freeze([
    'arm', 'eye', 'face', 'finger', 'fingertip', 'foot', 'hand',
    'handed', 'head', 'leg', 'light headed', 'neck', 'spine', 'toe',
    'hair', 'blood', 'lung', 'nose', 'stomach',
]);
const JELLY_PARTS = Object.freeze([
    'pseudopod', 'dark spot', 'front', 'pseudopod extension',
    'pseudopod extremity', 'pseudopod root', 'grasp', 'grasped',
    'cerebral area', 'lower pseudopod', 'viscous', 'middle', 'surface',
    'pseudopod extremity', 'ripples', 'juices', 'surface', 'sensor',
    'stomach',
]);
const ANIMAL_PARTS = Object.freeze([
    'forelimb', 'eye', 'face', 'foreclaw', 'claw tip', 'rear claw',
    'foreclaw', 'clawed', 'head', 'rear limb', 'light headed', 'neck',
    'spine', 'rear claw tip', 'fur', 'blood', 'lung', 'nose', 'stomach',
]);
const BIRD_PARTS = Object.freeze([
    'wing', 'eye', 'face', 'wing', 'wing tip', 'foot', 'wing', 'winged',
    'head', 'leg', 'light headed', 'neck', 'spine', 'toe', 'feathers',
    'blood', 'lung', 'bill', 'stomach',
]);
const HORSE_PARTS = Object.freeze([
    'foreleg', 'eye', 'face', 'forehoof', 'hoof tip', 'rear hoof',
    'forehoof', 'hooved', 'head', 'rear leg', 'light headed', 'neck',
    'backbone', 'rear hoof tip', 'mane', 'blood', 'lung', 'nose',
    'stomach',
]);
const SPHERE_PARTS = Object.freeze([
    'appendage', 'optic nerve', 'body', 'tentacle', 'tentacle tip',
    'lower appendage', 'tentacle', 'tentacled', 'body', 'lower tentacle',
    'rotational', 'equator', 'body', 'lower tentacle tip', 'cilia',
    'life force', 'retina', 'olfactory nerve', 'interior',
]);
const FUNGUS_PARTS = Object.freeze([
    'mycelium', 'visual area', 'front', 'hypha', 'hypha', 'root',
    'strand', 'stranded', 'cap area', 'rhizome', 'sporulated', 'stalk',
    'root', 'rhizome tip', 'spores', 'juices', 'gill', 'gill', 'interior',
]);
const VORTEX_PARTS = Object.freeze([
    'region', 'eye', 'front', 'minor current', 'minor current',
    'lower current', 'swirl', 'swirled', 'central core', 'lower current',
    'addled', 'center', 'currents', 'edge', 'currents', 'life force',
    'center', 'leading edge', 'interior',
]);
const SNAKE_PARTS = Object.freeze([
    'vestigial limb', 'eye', 'face', 'large scale', 'large scale tip',
    'rear region', 'scale gap', 'scale gapped', 'head', 'rear region',
    'light headed', 'neck', 'length', 'rear scale', 'scales', 'blood',
    'lung', 'forked tongue', 'stomach',
]);
const WORM_PARTS = Object.freeze([
    'anterior segment', 'light sensitive cell', 'clitellum', 'setae',
    'setae', 'posterior segment', 'segment', 'segmented',
    'anterior segment', 'posterior', 'over stretched', 'clitellum',
    'length', 'posterior setae', 'setae', 'blood', 'skin', 'prostomium',
    'stomach',
]);
const SPIDER_PARTS = Object.freeze([
    'pedipalp', 'eye', 'face', 'pedipalp', 'tarsus', 'claw', 'pedipalp',
    'palped', 'cephalothorax', 'leg', 'spun out', 'cephalothorax',
    'abdomen', 'claw', 'hair', 'hemolymph', 'book lung', 'labrum',
    'digestive tract',
]);
const FISH_PARTS = Object.freeze([
    'fin', 'eye', 'premaxillary', 'pelvic axillary', 'pelvic fin',
    'anal fin', 'pectoral fin', 'finned', 'head', 'peduncle', 'played out',
    'gills', 'dorsal fin', 'caudal fin', 'scales', 'blood', 'gill',
    'nostril', 'stomach',
]);

const NOT_CLAWS = new Set([
    M.S_HUMAN,
    M.S_MUMMY,
    M.S_ZOMBIE,
    M.S_ANGEL,
    M.S_NYMPH,
    M.S_LEPRECHAUN,
    M.S_QUANTMECH,
    M.S_VAMPIRE,
    M.S_ORC,
    M.S_GIANT,
]);

function isSpecies(species, pmidx) {
    return species?.pmidx === pmidx;
}

// C ref: polyself.c body_part(). The hero's own anatomy, which is
// mbodypart() applied to youmonst. The caller passes youmonst explicitly so
// that a test can ask about any form without installing it on a game state.
export function body_part(part, youmonst) {
    return mbodypart(youmonst, part);
}

export function mbodypart(monster, part) {
    if (part <= NO_PART || part > STOMACH) return 'mystery part';
    const species = monster?.data;
    if (!species) throw new TypeError('mbodypart requires monster data');

    if (species.mlet === M.S_DOG
        || species.mlet === M.S_FELINE
        || species.mlet === M.S_RODENT
        || isSpecies(species, M.PM_OWLBEAR)) {
        switch (part) {
        case HAND: return 'paw';
        case HANDED: return 'pawed';
        case FOOT: return 'rear paw';
        case ARM:
        case LEG:
            return HORSE_PARTS[part];
        default:
            break;
        }
    } else if (species.mlet === M.S_YETI) {
        return HUMANOID_PARTS[part];
    }

    if ((part === HAND || part === HANDED)
        && humanoid(species)
        && attacktype(species, M.AT_CLAW)
        && !NOT_CLAWS.has(species.mlet)
        && !isSpecies(species, M.PM_STONE_GOLEM)
        && !isSpecies(species, M.PM_AMOROUS_DEMON)) {
        return part === HAND ? 'claw' : 'clawed';
    }
    if ((isSpecies(species, M.PM_MUMAK)
            || isSpecies(species, M.PM_MASTODON))
        && part === NOSE) {
        return 'trunk';
    }
    if (isSpecies(species, M.PM_SHARK) && part === HAIR)
        return 'skin';
    if ((isSpecies(species, M.PM_JELLYFISH)
            || isSpecies(species, M.PM_KRAKEN))
        && (part === ARM || part === FINGER || part === HAND
            || part === FOOT || part === TOE)) {
        return 'tentacle';
    }
    if (isSpecies(species, M.PM_FLOATING_EYE) && part === EYE)
        return 'cornea';
    if (humanoid(species)
        && (part === ARM || part === FINGER || part === FINGERTIP
            || part === HAND || part === HANDED)) {
        return HUMANOID_PARTS[part];
    }
    if (species.mlet === M.S_COCKATRICE)
        return part === HAIR ? SNAKE_PARTS[part] : BIRD_PARTS[part];
    if (isSpecies(species, M.PM_RAVEN)) return BIRD_PARTS[part];
    if (species.mlet === M.S_CENTAUR
        || species.mlet === M.S_UNICORN
        || isSpecies(species, M.PM_KI_RIN)
        || (isSpecies(species, M.PM_ROTHE) && part !== HAIR)) {
        return HORSE_PARTS[part];
    }
    if (species.mlet === M.S_LIGHT) {
        if (part === HANDED) return 'rayed';
        if (part === ARM || part === FINGER || part === FINGERTIP
            || part === HAND) {
            return 'ray';
        }
        return 'beam';
    }
    if (isSpecies(species, M.PM_STALKER) && part === HEAD) return 'head';
    if (species.mlet === M.S_EEL
        && !isSpecies(species, M.PM_JELLYFISH)) {
        return FISH_PARTS[part];
    }
    if (species.mlet === M.S_WORM) return WORM_PARTS[part];
    if (species.mlet === M.S_SPIDER) return SPIDER_PARTS[part];
    if (slithy(species)
        || (species.mlet === M.S_DRAGON && part === HAIR)) {
        return SNAKE_PARTS[part];
    }
    if (species.mlet === M.S_EYE) return SPHERE_PARTS[part];
    if (species.mlet === M.S_JELLY
        || species.mlet === M.S_PUDDING
        || species.mlet === M.S_BLOB
        || isSpecies(species, M.PM_JELLYFISH)) {
        return JELLY_PARTS[part];
    }
    if (species.mlet === M.S_VORTEX
        || species.mlet === M.S_ELEMENTAL) {
        return VORTEX_PARTS[part];
    }
    if (species.mlet === M.S_FUNGUS) return FUNGUS_PARTS[part];
    if (humanoid(species)) return HUMANOID_PARTS[part];
    return ANIMAL_PARTS[part];
}

// ---------- rehumanize --------------------------------------------------
// C ref: polyself.c rehumanize() (1367-1420). Return the hero to human form:
// Unchanging refuses it, fatally when the polymorphed form is out of hit
// points, and otherwise reports the amulet failing; the form's light source
// is dropped; polyman() reverts the form; and a human form with no hit
// points left dies. polyman() is not ported yet and C discards its result,
// so that call records a gap.
export async function rehumanize(state = game) {
    const u = state.u;
    const was_flying = Flying(state);

    /* You can't revert back while unchanging */
    if (Unchanging(state)) {
        if (u.mh < 1) {
            state.killer ??= {};
            state.killer.format = NO_KILLER_PREFIX;
            state.killer.name = 'killed while stuck in creature form';
            await done(DIED, state);
            /* can get to here if declining to die in explore or wizard
               mode; since we're wearing an amulet of unchanging we can't
               be wearing an amulet of life-saving */
            return; /* don't rehumanize after all */
        } else if (state.uamul && state.uamul.otyp === AMULET_OF_UNCHANGING) {
            await ttyPline(
                `Your ${simpleonames(state.uamul, state)} `
                + `${otense(state.uamul, 'fail')}!`,
                state,
            );
            observe_object(state.uamul, state);
            // hack.h:1530 makeknown(x) is discover_object(x, TRUE, TRUE, TRUE)
            discover_object(AMULET_OF_UNCHANGING, true, true, true, state);
        }
    }

    /*
     * Right now, dying while being a shifted vampire (bat, cloud, wolf)
     * reverts to human rather than to vampire.
     */

    if (emits_light(state.youmonst.data))
        del_light_source(LS_MONSTER, state.youmonst, state);
    await polyman('You return to %s form!', state.urace.adj, state);

    if (u.uhp < 1) {
        /* can only happen if some bit of code reduces u.uhp
           instead of u.mh while poly'd */
        await ttyPline(
            'Your old form was not healthy enough to survive.', state,
        );
        state.killer ??= {};
        state.killer.name = `reverting to unhealthy ${state.urace.adj} form`;
        state.killer.format = KILLED_BY;
        await done(DIED, state);
    }
    nomul(0, state);

    state.disp ??= {};
    state.disp.botl = true;
    state.vision_full_recalc = 1;
    await encumber_msg(state);
    update_inventory({ state });
    if (was_flying && !Flying(state) && u.usteed)
        await ttyPline(
            `You and ${monsterCommonName(u.usteed, state)} return gently `
            + `to the ${surface(u.ux, u.uy, state)}.`,
            state,
        );
    await retouch_equipment(2, state);
    if (!state.uarmg)
        await selftouch('No longer petrify-resistant, you', state);
}

// C ref: polyself.c dobreathe() (1420-1447). The poly'd hero's breath weapon,
// reached from domonability() when can_breathe(youmonst.data) is true.
// Checks Strangled and energy, spends 15 Pw, calls getdir(), then either
// ubreatheu() (self-targeted) or ubuzz() (directional breath).
export async function dobreathe(state = game) {
    // polyself.c:1425-1428 Strangled guard
    if (state.u.uprops[STRANGLED].intrinsic) {
        await ttyPline("You can't breathe.  Sorry.", state);
        return ECMD_OK;
    }
    // polyself.c:1429-1432 energy guard
    if (state.u.uen < 15) {
        await ttyPline("You don't have enough energy to breathe!", state);
        return ECMD_OK;
    }
    state.u.uen -= 15;
    state.disp.botl = true;

    if (!await getdir(null, state))
        return ECMD_CANCEL;

    const mattk = attacktype_fordmg(
        state.youmonst.data, M.AT_BREA, M.AD_ANY,
    );
    if (!mattk) {
        // C: impossible("bad breath attack?");
        throw new Error('impossible: bad breath attack?');
    } else if (!state.u.dx && !state.u.dy && !state.u.dz) {
        await ubreatheu(mattk, state, { d, rn1, rn2, rnd, rne, rnl });
    } else {
        await ubuzz(
            BZ_U_BREATH(BZ_OFS_AD(mattk.adtyp)), mattk.damn,
            state, { d, rn1, rn2, rnd, rne, rnl },
        );
    }
    return ECMD_TIME;
}

// ---------- dospit ------------------------------------------------------
// C ref: polyself.c dospit() (1450-1478). The poly'd hero spits venom in a
// chosen direction: blinding venom for a blinding or poisonous spit attack,
// acid venom otherwise, with spe 1 marking it as the hero's own.
export async function dospit(state = game) {
    if (!await getdir(null, state))
        return ECMD_CANCEL;
    const mattk = attacktype_fordmg(state.youmonst.data, M.AT_SPIT, M.AD_ANY);
    if (!mattk) {
        // C: impossible("bad spit attack?");
        throw new Error('impossible: bad spit attack?');
    }
    let otmp;
    switch (mattk.adtyp) {
    case M.AD_BLND:
    case M.AD_DRST:
        otmp = mksobj(BLINDING_VENOM, true, false, { state });
        break;
    default:
        // C: impossible("bad attack type in dospit") and fall through to
        // AD_ACID. No spitting species carries another damage type.
        throw new Error('impossible: bad attack type in dospit');
    case M.AD_ACID:
        otmp = mksobj(ACID_VENOM, true, false, { state });
        break;
    }
    otmp.spe = 1; /* to indicate it's yours */
    await throwit(otmp, 0, false, null, state);
    return ECMD_TIME;
}

// ---------- doremove ----------------------------------------------------
// C ref: polyself.c doremove() (1481-1494). The poly'd nymph slips out of a
// ball and chain. youprop.h:77 Punished is `uball != 0`. read.c unpunish()
// is unported and C discards its result, so that call records a gap.
export async function doremove(state = game) {
    const u = state.u;
    if (!state.uball) {
        if (u.utrap && u.utraptype === TT_BURIEDBALL) {
            await ttyPline(
                'The ball and chain are buried firmly in the '
                + `${surface(u.ux, u.uy, state)}.`,
                state,
            );
            return ECMD_OK;
        }
        await ttyPline('You are not chained to anything!', state);
        return ECMD_OK;
    }
    note_unported('read.c unpunish');
    return ECMD_TIME;
}

// ---------- dospinweb ---------------------------------------------------
// C ref: polyself.c dospinweb() (1497-1621). The poly'd spider spins a web
// on its square: refused over water, lava, air or while levitating or
// trapped; inside an engulfer the fluid is expelled, swept away or
// dissolved; over an existing trap the web covers, muffles, thickens,
// vanishes or triggers it; on stairs it fails; otherwise a WEB trap is made.
// mhitu.c expels() with a message, dig.c bury_objs() and shk.c add_damage()
// are unported and C discards their results, so those calls record gaps.
export async function dospinweb(state = game) {
    const u = state.u;
    const x = u.ux;
    const y = u.uy;
    let ttmp = t_at(x, y, state);
    const location = state.level.at(x, y);
    /* disallow webs on water, lava, air & cloud */
    const reject_terrain = is_pool_or_lava(x, y, state)
        || IS_AIR(location.typ);

    /* [at the time this was written, it was not possible to be both a
       webmaker and a flyer, but with the advent of amulet of flying that
       became a possibility; at present hero can spin a web while flying] */
    if (Levitation(state) || reject_terrain) {
        await ttyPline(
            `You must be on ${reject_terrain ? 'solid' : 'the'} ground `
            + 'to spin a web.',
            state,
        );
        return ECMD_OK;
    }
    if (u.uswallow) {
        await ttyPline(
            `You release web fluid inside ${monsterCommonName(u.ustuck, state)}.`,
            state,
        );
        if (is_animal(u.ustuck.data)) {
            // expels(u.ustuck, u.ustuck->data, TRUE)
            note_unported('mhitu.c expels');
            return ECMD_OK;
        }
        if (is_whirly(u.ustuck.data)) {
            let i;

            for (i = 0; i < NATTK; i++)
                if (u.ustuck.data.mattk[i].aatyp === M.AT_ENGL)
                    break;
            if (i === NATTK) {
                // C: impossible("Swallower has no engulfing attack?");
                throw new Error(
                    'impossible: Swallower has no engulfing attack?',
                );
            }
            let sweep = '';
            switch (u.ustuck.data.mattk[i].adtyp) {
            case M.AD_FIRE:
                sweep = 'ignites and ';
                break;
            case M.AD_ELEC:
                sweep = 'fries and ';
                break;
            case M.AD_COLD:
                sweep = 'freezes, shatters and ';
                break;
            }
            await ttyPline(`The web ${sweep}is swept away!`, state);
            return ECMD_OK;
        } /* default: a nasty jelly-like creature */
        await ttyPline(
            `The web dissolves into ${monsterCommonName(u.ustuck, state)}.`,
            state,
        );
        return ECMD_OK;
    }
    if (u.utrap) {
        await ttyPline('You cannot spin webs while stuck in a trap.', state);
        return ECMD_OK;
    }
    await exercise(A_DEX, true, state, { rn2 });
    if (ttmp) {
        switch (ttmp.ttyp) {
        case PIT:
        case SPIKED_PIT:
            await ttyPline('You spin a web, covering up the pit.', state);
            deltrap(ttmp, state);
            note_unported('dig.c bury_objs');
            newsym(x, y);
            return ECMD_TIME;
        case SQKY_BOARD:
            await ttyPline('The squeaky board is muffled.', state);
            deltrap(ttmp, state);
            newsym(x, y);
            return ECMD_TIME;
        case TELEP_TRAP:
        case LEVEL_TELEP:
        case MAGIC_PORTAL:
        case VIBRATING_SQUARE:
            await ttyPline('Your webbing vanishes!', state);
            return ECMD_OK;
        case WEB:
            await ttyPline('You make the web thicker.', state);
            return ECMD_TIME;
        case HOLE:
        case TRAPDOOR:
            await ttyPline(
                `You web over the ${(ttmp.ttyp === TRAPDOOR) ? 'trap door' : 'hole'}.`,
                state,
            );
            deltrap(ttmp, state);
            newsym(x, y);
            return ECMD_TIME;
        case ROLLING_BOULDER_TRAP:
            await ttyPline('You spin a web, jamming the trigger.', state);
            deltrap(ttmp, state);
            newsym(x, y);
            return ECMD_TIME;
        case ARROW_TRAP:
        case DART_TRAP:
        case BEAR_TRAP:
        case ROCKTRAP:
        case FIRE_TRAP:
        case LANDMINE:
        case SLP_GAS_TRAP:
        case RUST_TRAP:
        case MAGIC_TRAP:
        case ANTI_MAGIC:
        case POLY_TRAP:
            await ttyPline('You have triggered a trap!', state);
            await dotrap(ttmp, NO_TRAP_FLAGS, state);
            return ECMD_TIME;
        default:
            // C: impossible("Webbing over trap type %d?", ttmp->ttyp);
            throw new Error(`impossible: Webbing over trap type ${ttmp.ttyp}?`);
        }
    } else if (On_stairs(x, y, state)) {
        /* cop out: don't let them hide the stairs */
        await ttyPline(
            'Your web fails to impede access to the '
            + `${(location.typ === STAIRS) ? 'stairs' : 'ladder'}.`,
            state,
        );
        return ECMD_TIME;
    }
    ttmp = maketrap(x, y, WEB, { state });
    if (ttmp) {
        await ttyPline('You spin a web.', state);
        ttmp.madeby_u = 1;
        feeltrap(ttmp, { state, redraw: newsym });
        if (in_rooms(x, y, SHOPBASE, state).length)
            note_unported('shk.c add_damage');
    }
    return ECMD_TIME;
}

// ---------- dosummon ----------------------------------------------------
// C ref: polyself.c dosummon() (1624-1639). The poly'd lycanthrope spends
// 10 energy to call were_summon() for tame helpers.
export async function dosummon(state = game) {
    const u = state.u;
    const placeholder = { value: 0 };
    if (u.uen < 10) {
        await ttyPline(
            'You lack the energy to send forth a call for help!', state,
        );
        return ECMD_OK;
    }
    u.uen -= 10;
    state.disp ??= {};
    state.disp.botl = true;

    await ttyPline('You call upon your brethren for help!', state);
    await exercise(A_WIS, true, state, { rn2 });
    if (!await were_summon(state.youmonst.data, true, placeholder, null, state))
        await ttyPline('But none arrive.', state);
    return ECMD_TIME;
}

// ---------- dogaze ------------------------------------------------------
// C ref: polyself.c dogaze() (1642-1774). The poly'd hero's gaze attack,
// confusing or fiery, spends 15 energy and reaches every monster in view;
// gazing at a floating eye freezes the hero and gazing at Medusa is death.
export async function dogaze(state = game) {
    const u = state.u;
    let looked = 0;
    let adtyp = 0;

    for (let i = 0; i < NATTK; i++) {
        if (state.youmonst.data.mattk[i].aatyp === M.AT_GAZE) {
            adtyp = state.youmonst.data.mattk[i].adtyp;
            break;
        }
    }
    if (adtyp !== M.AD_CONF && adtyp !== M.AD_FIRE) {
        // C: impossible("gaze attack %d?", adtyp);
        throw new Error(`impossible: gaze attack ${adtyp}?`);
    }

    if (Blind(state)) {
        await ttyPline("You can't see anything to gaze at.", state);
        return ECMD_OK;
    } else if (Hallucination(state)) {
        await ttyPline("You can't gaze at anything you can see.", state);
        return ECMD_OK;
    }
    if (u.uen < 15) {
        await ttyPline('You lack the energy to use your special gaze!', state);
        return ECMD_OK;
    }
    u.uen -= 15;
    state.disp ??= {};
    state.disp.botl = true;

    for (let mtmp = state.fmon; mtmp; mtmp = mtmp.nmon) {
        if (DEADMONSTER(mtmp))
            continue;
        if (canseemon(mtmp, state) && couldsee(mtmp.mx, mtmp.my, state)) {
            looked++;
            if (Invis(state) && !perceives(mtmp.data)) {
                await ttyPline(
                    `${capitalizedMonsterName(mtmp, state)} seems not to `
                    + 'notice your gaze.',
                    state,
                );
            } else if (mtmp.minvis && !See_invisible(state)) {
                await ttyPline(
                    "You can't see where to gaze at "
                    + `${capitalizedMonsterName(mtmp, state)}.`,
                    state,
                );
            } else if (M_AP_TYPE(mtmp) === M_AP_FURNITURE
                       || M_AP_TYPE(mtmp) === M_AP_OBJECT) {
                looked--;
                continue;
            } else if (state.flags.safe_dog && mtmp.mtame
                       && !Confusion(state)) {
                await ttyPline(
                    `You avoid gazing at ${y_monnam(mtmp, state)}.`, state,
                );
            } else {
                if (state.flags.confirm && mtmp.mpeaceful
                    && !Confusion(state)) {
                    const qbuf = `Really ${(adtyp === M.AD_CONF)
                        ? 'confuse' : 'attack'} `
                        + `${monsterCommonName(mtmp, state)}?`;
                    // y_n() answers a key code.
                    if (await y_n(qbuf, state) !== 'y'.charCodeAt(0))
                        continue;
                }
                await setmangry(mtmp, true, { state });
                if (helpless(mtmp) || mtmp.mstun
                    || !mtmp.mcansee || !haseyes(mtmp.data)) {
                    looked--;
                    continue;
                }
                /* No reflection check for consistency with when a monster
                 * gazes at *you*--only medusa gaze gets reflected then.
                 */
                if (adtyp === M.AD_CONF) {
                    if (!mtmp.mconf)
                        await ttyPline(
                            `Your gaze confuses ${monsterCommonName(mtmp, state)}!`,
                            state,
                        );
                    else
                        await ttyPline(
                            `${capitalizedMonsterName(mtmp, state)} is getting `
                            + 'more and more confused.',
                            state,
                        );
                    mtmp.mconf = 1;
                } else if (adtyp === M.AD_FIRE) {
                    let dmg = d(2, 6);
                    const orig_dmg = dmg;
                    const lev = u.ulevel;

                    await ttyPline(
                        `You attack ${monsterCommonName(mtmp, state)} with a `
                        + 'fiery gaze!',
                        state,
                    );
                    if (resists_fire(mtmp, state)) {
                        await ttyPline(
                            `The fire doesn't burn ${monsterCommonName(mtmp, state)}!`,
                            state,
                        );
                        dmg = 0;
                    }
                    if (lev > rn2(20)) {
                        dmg += await destroy_items(mtmp, M.AD_FIRE, orig_dmg,
                            { state, random: { d, rn1, rn2, rnd, rne, rnl } });
                        await ignite_items(mtmp.minvent,
                            { state, random: { d, rn1, rn2, rnd, rne, rnl } });
                    }
                    if (dmg)
                        mtmp.mhp -= dmg;
                    if (DEADMONSTER(mtmp))
                        await killed(mtmp, state);
                }
                /* For consistency with passive() in uhitm.c, this only
                 * affects you if the monster is still alive.
                 */
                if (DEADMONSTER(mtmp))
                    continue;

                if (mtmp.data.pmidx === M.PM_FLOATING_EYE && !mtmp.mcan) {
                    if (!Free_action(state)) {
                        await ttyPline(
                            'You are frozen by '
                            + `${s_suffix(monsterCommonName(mtmp, state))} gaze!`,
                            state,
                        );
                        nomul((u.ulevel > 6 || rn2(4))
                            ? -d(mtmp.m_lev + 1, mtmp.data.mattk[0].damd)
                            : -200, state);
                        state.multi_reason = "frozen by a monster's gaze";
                        state.nomovemsg = null;
                        return ECMD_TIME;
                    } else {
                        await ttyPline(
                            'You stiffen momentarily under '
                            + `${s_suffix(monsterCommonName(mtmp, state))} gaze.`,
                            state,
                        );
                    }
                }
                /* Technically this one shouldn't affect you at all because
                 * the Medusa gaze is an active monster attack that only
                 * works on the monster's turn, but for it to *not* have an
                 * effect would be too weird.
                 */
                if (mtmp.data.pmidx === M.PM_MEDUSA && !mtmp.mcan) {
                    await ttyPline(
                        `Gazing at the awake ${l_monnam(mtmp, state)} is not `
                        + 'a very good idea.',
                        state,
                    );
                    /* as if gazing at a sleeping anything is fruitful... */
                    await ttyUrgentPline('You turn to stone...', state);
                    state.killer ??= {};
                    state.killer.format = KILLED_BY;
                    state.killer.name = "deliberately meeting Medusa's gaze";
                    await done(STONING, state);
                }
            }
        }
    }
    if (!looked)
        await ttyPline('You gaze at no place in particular.', state);
    return ECMD_TIME;
}

// ---------- dohide ------------------------------------------------------
// C ref: polyself.c dohide() (1777-1874). "called by domonability() for
// #monster": the poly'd hider or mimic hides, unless held, trapped, out of
// water as an eel, without an object to hide under, or on a plane with
// nothing above or below. trap.c instapetrify() and insight.c youhiding()
// are unported and C discards their results, so those calls record gaps.
export async function dohide(state = game) {
    const u = state.u;
    const ismimic = state.youmonst.data.mlet === M.S_MIMIC;
    const on_ceiling = is_clinger(state.youmonst.data) || Flying(state);

    /* can't hide while being held (or holding) or while trapped
       (except for floor hiders [trapper or mimic] in pits) */
    if (u.ustuck || (u.utrap && (u.utraptype !== TT_PIT || on_ceiling))) {
        const how = !u.ustuck ? 'trapped'
            : u.uswallow ? (digests(u.ustuck.data) ? 'swallowed'
                                                    : 'engulfed')
              : !sticks(state.youmonst.data) ? 'being held'
                : (humanoid(u.ustuck.data) ? 'holding someone'
                                           : 'holding that creature');
        await ttyPline(`You can't hide while you're ${how}.`, state);
        if (u.uundetected
            || (ismimic && M_AP_TYPE(state.youmonst) !== M_AP_NOTHING)) {
            u.uundetected = 0;
            state.youmonst.m_ap_type = M_AP_NOTHING;
            newsym(u.ux, u.uy);
        }
        return ECMD_OK;
    }
    /* note: hero-as-eel handling is incomplete but unnecessary;
       such critters aren't offered the option of hiding via #monster */
    if (state.youmonst.data.mlet === M.S_EEL && !is_pool(u.ux, u.uy, state)) {
        if (IS_FOUNTAIN(state.level.at(u.ux, u.uy).typ))
            await ttyPline(
                'The fountain is not deep enough to hide in.', state,
            );
        else
            await ttyPline(
                `There is no ${hliquid('water', { state })} to hide in here.`,
                state,
            );
        u.uundetected = 0;
        return ECMD_OK;
    }
    if (hides_under(state.youmonst.data)) {
        let ct = 0;
        const otop = state.level.objects[u.ux][u.uy];
        let otmp;

        if (!otop) {
            await ttyPline('There is nothing to hide under here.', state);
            u.uundetected = 0;
            return ECMD_OK;
        }
        for (otmp = otop;
             otmp && otmp.otyp === CORPSE
                  && touch_petrifies(state.mons[otmp.corpsenm]);
             otmp = otmp.nexthere)
            ct += otmp.quan;
        /* otmp will be Null iff the entire pile consists of 'trice corpses */
        if (!otmp && !Stone_resistance(state)) {
            let corpse_name = cxname(otop, state);

            /* for the plural case, we'll say "cockatrice corpses" or
               "chickatrice corpses" depending on the top of the pile
               even if both types are present */
            if (ct === 1)
                corpse_name = an(corpse_name);
            /* no need to check poly_when_stoned(); no hide-underers can
               turn into stone golems instead of becoming petrified */
            await ttyPline(
                `Hiding under ${corpse_name}${plur(ct)} is a fatal mistake...`,
                state,
            );
            // instapetrify("hiding under <corpse_name><plur>")
            note_unported('trap.c instapetrify');
            /* only reach here if life-saved */
            u.uundetected = 0;
            return ECMD_TIME;
        }
    }
    /* Planes of Air and Water */
    if (on_ceiling && !has_ceiling(u.uz, state)) {
        await ttyPline('There is nowhere to hide above you.', state);
        u.uundetected = 0;
        return ECMD_OK;
    }
    if ((is_hider(state.youmonst.data) && !Flying(state)) /* floor hider */
        && (Is_airlevel(u.uz) || Is_waterlevel(u.uz))) {
        await ttyPline('There is nowhere to hide beneath you.', state);
        u.uundetected = 0;
        return ECMD_OK;
    }
    /* TODO? inhibit floor hiding at furniture locations, or
     * else make youhiding() give smarter messages at such spots.
     */

    if (u.uundetected
        || (ismimic && M_AP_TYPE(state.youmonst) !== M_AP_NOTHING)) {
        // youhiding(FALSE, 1); "you are already hiding"
        note_unported('insight.c youhiding');
        return ECMD_OK;
    }

    if (ismimic) {
        /* should bring up a dialog "what would you like to imitate?" */
        state.youmonst.m_ap_type = M_AP_OBJECT;
        state.youmonst.mappearance = STRANGE_OBJECT;
    } else {
        u.uundetected = 1;
    }
    newsym(u.ux, u.uy);
    // youhiding(FALSE, 0); "you are now hiding"
    note_unported('insight.c youhiding');
    return ECMD_TIME;
}

// ---------- dopoly ------------------------------------------------------
// C ref: polyself.c dopoly() (1877-1891). The poly'd vampire or vampshifter
// shifts form through polyself(POLY_MONSTER) and reports the new form.
export async function dopoly(state = game) {
    const savedat = state.youmonst.data;

    if (is_vampire(state.youmonst.data) || is_vampshifter(state.youmonst)) {
        await polyself(POLY_MONSTER, state);
        if (savedat !== state.youmonst.data) {
            await ttyPline(
                'You transform into '
                + `${an(pmname(state.youmonst.data, Ugender(state)))}.`,
                state,
            );
            newsym(state.u.ux, state.u.uy);
        }
    }
    return ECMD_TIME;
}

// ---------- domindblast -------------------------------------------------
// C ref: polyself.c domindblast() (1894-1938). "#monster for hero-as-
// mind_flayer giving psychic blast": 10 energy, and every hostile,
// non-mindless monster within BOLT_LIM squares that is telepathic and
// blind, telepathic with an even chance, or anything with a 1-in-10 chance,
// takes rnd(15).
export async function domindblast(state = game) {
    const u = state.u;

    if (u.uen < 10) {
        await ttyPline(
            'You concentrate but lack the energy to maintain doing so.',
            state,
        );
        return ECMD_OK;
    }
    u.uen -= 10;
    state.disp ??= {};
    state.disp.botl = true;

    await ttyPline('You concentrate.', state);
    await ttyPline('A wave of psychic energy pours out.', state);
    for (let mtmp = state.fmon, nmon; mtmp; mtmp = nmon) {
        nmon = mtmp.nmon;
        if (DEADMONSTER(mtmp))
            continue;
        if (mdistu(mtmp, state) > BOLT_LIM * BOLT_LIM)
            continue;
        if (mtmp.mpeaceful)
            continue;
        if (mindless(mtmp.data))
            continue;
        const u_sen = telepathic(mtmp.data) && !mtmp.mcansee;
        if (u_sen || (telepathic(mtmp.data) && rn2(2)) || !rn2(10)) {
            const dmg = rnd(15);
            /* wake it up first, to bring hidden monster out of hiding;
               but in case it is currently peaceful, don't make it hostile
               unless it will survive the psychic blast, otherwise hero
               would avoid the penalty for killing it while peaceful */
            await wakeup(mtmp, dmg > mtmp.mhp, { state });
            await ttyPline(
                `You lock in on ${s_suffix(monsterCommonName(mtmp, state))} `
                + `${u_sen ? 'telepathy'
                    : telepathic(mtmp.data) ? 'latent telepathy'
                      : 'mind'}.`,
                state,
            );
            mtmp.mhp -= dmg;
            if (DEADMONSTER(mtmp))
                await killed(mtmp, state);
        }
    }
    return ECMD_TIME;
}

// ---------- uunstick ----------------------------------------------------
// C ref: polyself.c uunstick() (1941-1951). Release the monster the hero was
// holding, clearing u.ustuck before the message names it.
export async function uunstick(state = game) {
    const mtmp = state.u.ustuck;

    if (!mtmp) {
        // C: impossible("uunstick: no ustuck?");
        throw new Error('impossible: uunstick: no ustuck?');
    }
    set_ustuck(null, state); /* before pline() */
    await ttyPline(
        `${capitalizedMonsterName(mtmp, state)} is no longer in your clutches.`,
        state,
    );
}

// ---------- poly_gender -------------------------------------------------
// C ref: polyself.c poly_gender() (2149-2157). "Returns gender of
// polymorphed player; 0/1=same meaning as flags.female, 2=none."
export function poly_gender(state = game) {
    if (is_neuter(state.youmonst.data) || !humanoid(state.youmonst.data))
        return 2;
    return state.flags.female ? 1 : 0;
}

// ---------- ugolemeffects -----------------------------------------------
// C ref: polyself.c ugolemeffects() (2160-2188). A hero in flesh golem form
// heals from electricity and one in iron golem form from fire, up to the
// form's maximum.
export async function ugolemeffects(damtype, dam, state = game) {
    const u = state.u;
    let heal = 0;

    /* We won't bother with "slow"/"haste" since players do not
     * have a monster-specific slow/haste so there is no way to
     * restore the old velocity once they are back to human.
     */
    if (u.umonnum !== M.PM_FLESH_GOLEM && u.umonnum !== M.PM_IRON_GOLEM)
        return;
    switch (damtype) {
    case M.AD_ELEC:
        if (u.umonnum === M.PM_FLESH_GOLEM)
            heal = Math.trunc((dam + 5) / 6); /* Approx 1 per die */
        break;
    case M.AD_FIRE:
        if (u.umonnum === M.PM_IRON_GOLEM)
            heal = dam;
        break;
    }
    if (heal && (u.mh < u.mhmax)) {
        u.mh += heal;
        if (u.mh > u.mhmax)
            u.mh = u.mhmax;
        state.disp ??= {};
        state.disp.botl = true;
        await ttyPline('Strangely, you feel better than before.', state);
        await exercise(A_STR, true, state, { rn2 });
    }
}

// ---------- ugenocided --------------------------------------------------
// C ref: polyself.c ugenocided() (2265-2270). Whether the hero's role or
// race species has been genocided, which is fatal on returning to it.
export function ugenocided(state = game) {
    return Boolean((state.svm.mvitals[state.urole.mnum].mvflags & G_GENOD)
                   || (state.svm.mvitals[state.urace.mnum].mvflags & G_GENOD));
}

// ---------- udeadinside -------------------------------------------------
// C ref: polyself.c udeadinside() (2273-2285). "how hero feels 'inside'
// after self-genocide of role or race": living forms including demons feel
// dead, undead and manes condemned, golems and vortices empty.
export function udeadinside(state = game) {
    return !nonliving(state.youmonst.data)
        ? 'dead'          /* living, including demons */
        : !weirdnonliving(state.youmonst.data)
            ? 'condemned' /* undead plus manes */
            : 'empty';    /* golems plus vortices */
}
