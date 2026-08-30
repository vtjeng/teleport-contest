// Polymorph self -- controlled transformation, species property binding, body
// part naming, and the flight/stealth blocking updates.
// C ref: polyself.c set_uasmon(), check_strangling(), polyself(), polymon(),
// uasmon_maxStr(), break_armor(), drop_weapon(), dropp(), skinback(),
// polysense(), float_vs_flight(), steed_vs_stealth(), mbodypart().

import {
    A_CON,
    A_STR,
    A_WIS,
    ACID_RES,
    ANTIMAGIC,
    ARM,
    BLINDED,
    BLND_RES,
    BZ_OFS_AD,
    BZ_U_BREATH,
    COLD_RES,
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
    FLYING,
    FOOT,
    FROMFORM,
    FROM_RACE,
    FROMOUTSIDE,
    G_GENOD,
    HAIR,
    HALLUC_RES,
    HAND,
    HANDED,
    HEAD,
    I_SPECIAL,
    In_endgame,
    INVIS,
    INFRAVISION,
    LEG,
    LEVITATION,
    MALE,
    NECK,
    NO_PART,
    NON_PM,
    NOSE,
    PASSES_WALLS,
    POISON_RES,
    POLY_CONTROLLED,
    REFLECTING,
    REGENERATION,
    SEE_INVIS,
    SHOCK_RES,
    SICK_RES,
    SLEEP_RES,
    STEALTH,
    STOMACH,
    STONE_RES,
    STRANGLED,
    STUNNED,
    SWIMMING,
    TELEPAT,
    TELEPORT,
    TELEPORT_CONTROL,
    TOE,
    TT_PIT,
    Upolyd,
    WARN_OF_MON,
} from './const.js';
import { exercise } from './attrib.js';
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
    has_horns,
    humanoid,
    infravision,
    is_bat,
    is_floater,
    is_flyer,
    is_placeholder,
    is_swimmer,
    is_vampire,
    is_vampshifter,
    nohands,
    passes_walls,
    perceives,
    pm_invisible,
    polyok,
    regenerates,
    resists_drli,
    sliparm,
    slithy,
    strongmonst,
    telepathic,
    valid_vampshiftform,
    verysmall,
    can_teleport,
    control_teleport,
    your_race,
    name_to_mon,
} from './mondata.js';
import { character_race } from './roles.js';
import { pmname } from './do_name.js';
import { set_mon_data } from './makemon_create.js';
import { cloak_simple_name, simpleonames, an } from './objnam.js';
import { find_ac } from './u_init_inventory_attrs.js';
import { newsym, see_monsters } from './display.js';
import { encumber_msg } from './pickup.js';
import { update_inventory } from './invent.js';
import { dropx, canletgo } from './do.js';
import { getlin } from './windows.js';
import { ttyPline } from './tty_message.js';
import { set_utrap } from './trap.js';
import { make_glib } from './potion.js';
import { cantwield, untwoweapon, uwepgone, uswapwepgone } from './wield.js';
import { _doWearInternals } from './do_wear.js';
import { Is_dragon_armor, is_sword, remove_object } from './obj.js';
import { makeplural } from './fruit.js';
import { weapon_descr } from './weapon.js';
import {
    AMULET_OF_STRANGULATION,
    CORPSE,
    MUMMY_WRAPPING,
} from './objects.js';
import * as M from './monsters.js';
import { rn1, rn2, rnd, rne, rnl, d } from './rng.js';
import { getdir } from './cmd.js';
import { ubuzz, ubreatheu } from './zap.js';

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
    set_mon_data(state.youmonst, mdat);
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

    // verbose hints — which #monster commands to use.
    // C ref: polyself.c:1031-1069.  Each hint is a separate pline(); the
    // checks are independent (a form can match several).  The dragon case
    // reaches only the can_breathe() hint.  Remaining checks (is_were,
    // gremlin, unicorn, mind_flayer, shriek, vampire, eggs) are included
    // only when the predicate is already imported; forms that satisfy an
    // unported predicate simply skip that hint.
    if (state.flags.verbose) {
        // C uses static format: "Use the command #%s to %s."
        const hint = (cmd, action) =>
            `Use the command #${cmd} to ${action}.`;
        const uptr = state.youmonst.data;

        if (can_breathe(uptr))
            await ttyPline(hint('monster', 'use your breath weapon'), state);
        if (attacktype(uptr, M.AT_SPIT))
            await ttyPline(hint('monster', 'spit venom'), state);
        if (uptr.mlet === M.S_NYMPH)
            await ttyPline(hint('monster', 'remove an iron ball'), state);
        if (attacktype(uptr, M.AT_GAZE))
            await ttyPline(hint('monster', 'gaze at monsters'), state);
        // is_hider/hides_under + webmaker: not imported (gnome/dragon skip)
        // is_were: not imported (gnome/dragon skip)
        // PM_GREMLIN: no match for gnome or dragon
        // is_unicorn: not imported (gnome/dragon skip)
        // is_mind_flayer: not imported (gnome/dragon skip)
        // MS_SHRIEK: not imported (gnome/dragon skip)
        // is_vampire/is_vampshifter: dragon is neither
        // lays_eggs: not imported for this path (gnome/dragon skip)
    }

    return 1;
}

// ---------- polyself ----------------------------------------------------
// C ref: polyself.c polyself() (468-731). The #polyself command's main body.
// This port covers the controlled-input branch (forcecontrol=true from
// POLY_CONTROLLED). The do_shift/do_vampyr/do_merge gotos, newman()'s death
// path, and the random-monster selection path are not exercised by the gnome
// case and throw if reached.
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

    const old_light = 0; // emits_light(youmonst.data) — for human, 0
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
                // name_to_monclass fallback — not ported
                // For the gnome case, "gnome" resolves directly via
                // name_to_mon, so this path is not taken.
                monclass = 0; // placeholder
                if (monclass && mntmp === NON_PM) {
                    throw new UnsupportedPolyselfError(
                        'polyself: name_to_monclass/mkclass_poly not ported',
                    );
                }
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
        // newman() — not ported
        throw new UnsupportedPolyselfError('polyself: newman() not ported');
    } else {
        await polymon(mntmp, state);
    }
    state.gs.sex_change_ok--;

    // made_change: light source bookkeeping
    // For gnome, old_light=0 and new_light=0 so nothing happens
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
