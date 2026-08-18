// dothrow.js -- the `f` command, which shoots the readied ammunition, and the
// `t` command, which asks which object to throw.
// C refs: src/dothrow.c multishot_class_bonus(), throw_obj(), ok_to_throw(),
// throw_ok(), dothrow(), find_launcher(), dofire(), throwing_weapon(),
// throwit(), throwit_return(), throwit_mon_hit() and breaktest().
//
// dothrow() is three calls: ok_to_throw() asks whether the hero can throw at
// all, getobj() runs the prompt over throw_ok()'s per-object classification,
// and throw_obj() throws what came back. Everything past that point is shared
// with `f`, so `t` differs from `f` only in how the missile is chosen.
//
// dofire() is the entry point and it has two shapes. When the launcher is
// already wielded it goes straight to throw_obj(). When the launcher is in
// the secondary slot instead -- the Caveman's sling, with the club in hand --
// it queues [doswapweapon, dofire] and returns without spending time, so the
// swap costs its own turn and the shot happens on the next one, after the
// monsters have moved. js/cmd.js owns that queue.
//
// throw_obj() decides how many missiles leave the hand, prints "You shoot 2
// flint stones." and calls throwit() once per shot; throwit() flies each one
// with zap.c bhit() and puts it down where it lands.
//
// The unported branches are collected under UnsupportedThrowError. The three
// largest are thitmonst(), which is this C file's own 380-line function for a
// missile that reaches a monster; breakobj() with breakmsg(), for a missile
// that shatters; and dothrow.c's whole thrown-and-return family -- Mjollnir,
// an aklys and a boomerang -- which needs boomhit() and sho_obj_return_to_u().
// dowield(), doquiver_core(), autoquiver(), use_pole() and use_whip() stop for
// the same reason: each is a command in its own right.

import {
    A_CON,
    A_DEX,
    A_STR,
    BOLT_LIM,
    CONFUSION,
    CQ_CANNED,
    DEAF,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FUMBLING,
    GETOBJ_ALLOWCNT,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    HEAD,
    IS_SOFT,
    Is_airlevel,
    Is_waterlevel,
    LARGEST_INT,
    ZAP_POS,
    is_hole,
    isok,
    LOST_THROWN,
    P_CROSSBOW,
    P_DART,
    P_DAGGER,
    P_EXPERT,
    P_KNIFE,
    P_SHURIKEN,
    P_SKILLED,
    P_SLING,
    P_SPEAR,
    SLT_ENCUMBER,
    STONE_RES,
    STR19,
    STUNNED,
    THROWN_WEAPON,
    WT_SPLASH_THRESHOLD,
    W_WEP,
} from './const.js';
import { ART_MJOLLNIR } from './artifacts.js';
import { acurrstr, effective_attribute, exercise } from './attrib.js';
import { obj_resists } from './bury.js';
import { cmdq_add_ec, extcmdRow, getdir } from './cmd.js';
import { newsym } from './display.js';
import { canletgo, flooreffects } from './do.js';
import { ceiling, surface } from './dungeon.js';
import { u_wipe_engr } from './engrave.js';
import { game } from './gstate.js';
import {
    calc_capacity,
    check_capacity,
    disturb_buried_zombies,
} from './hack.js';
import { freeinv, getobj, stackobj } from './invent.js';
import { obj_sheds_light } from './light.js';
import { nohands, notake, throws_rocks, touch_petrifies } from './mondata.js';
import { closed_door } from './monmove.js';
import {
    PM_CAVE_DWELLER,
    PM_CLERIC,
    PM_DWARF,
    PM_ELF,
    PM_GNOME,
    PM_HEALER,
    PM_HUMAN,
    PM_MONK,
    PM_NINJA,
    PM_ORC,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_WIZARD,
} from './monsters.js';
import {
    ammo_and_launcher,
    isFlammable,
    is_ammo,
    is_flimsy,
    is_wet_towel,
    matching_launcher,
    obj_no_longer_held,
    objectType,
    place_object,
    remove_object,
    splitobj,
    uslinging,
    weight,
} from './obj.js';
import {
    ACID_VENOM,
    AKLYS,
    ARMOR_CLASS,
    BLINDING_VENOM,
    BOOMERANG,
    BOULDER,
    BULLWHIP,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    EGG,
    ELVEN_ARROW,
    ELVEN_BOW,
    EXPENSIVE_CAMERA,
    GEM_CLASS,
    GLASS,
    HEAVY_IRON_BALL,
    MELON,
    ORCISH_ARROW,
    ORCISH_BOW,
    POTION_CLASS,
    POT_WATER,
    STRANGE_OBJECT,
    VENOM_CLASS,
    WEAPON_CLASS,
    YA,
    YUMI,
} from './objects.js';
import { an, helm_simple_name, singular, the, xnameFresh } from './objnam.js';
import { encumber_msg } from './pickup.js';
import { body_part } from './polyself.js';
import { rn2, rnd } from './rng.js';
import { stairway_at } from './stairs.js';
import { P_SKILL, weapon_type } from './startup_skills.js';
import { Levitation, is_lava, is_pool, t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { cansee } from './vision.js';
import { welded } from './wield.js';
import { is_pole } from './worn.js';
import { bhit } from './zap.js';

// C refs: youprop.h Confusion (84), Stunned (81), Fumbling (129) and
// Stone_resistance (65). Each is the union of the intrinsic and extrinsic
// halves of one property; none of the four has a blocking source. Defined here
// beside their callers -- the multishot gate and the bare-handed corpse gate --
// the way js/wield.js keeps Glib beside can_twoweapon().
function propertyHeld(state, property) {
    const held = state.u?.uprops?.[property];
    return Boolean(held?.intrinsic || held?.extrinsic);
}

// C ref: youprop.h Deaf (125), `HDeaf || EDeaf || u.uroleplay.deaf`. The third
// term is the deaf conduct, which only `OPTIONS=roleplay:deaf` sets and nothing
// clears; js/display.js statusConditionActive() spells the same union for the
// status line.
function Deaf(state) {
    return propertyHeld(state, DEAF) || Boolean(state.u?.uroleplay?.deaf);
}

// A branch of dothrow.c this port has not translated. js/cmd.js
// failClosedCommandRefusals() lists it, so the segment keeps every frame the
// command already matched instead of failing hard.
export class UnsupportedThrowError extends Error {
    constructor(what) {
        super(`dothrow.c reached ${what}`);
        this.name = 'UnsupportedThrowError';
        this.what = what;
    }
}

// C ref: dothrow.c:30-34 AutoReturn(). A weapon that comes back to the hand
// when thrown: an aklys or Valkyrie's Mjollnir in the primary slot, or a
// boomerang from anywhere. dofire() and throwit() refuse everything the flag
// turns on, but throw_ok() below only classifies with it, so the Mjollnir
// half is spelled out rather than widened to any artifact: widening would
// suggest a wielded artifact that C downplays, and the prompt would show it.
function autoReturns(obj, wmask, state = game) {
    if (!obj) return false;
    return (((wmask & W_WEP) !== 0
        && (obj.otyp === AKLYS
            || (obj.oartifact === ART_MJOLLNIR
                && state.urole.mnum === PM_VALKYRIE)))
        || obj.otyp === BOOMERANG);
}

// C ref: dothrow.c multishot_class_bonus() (37-83). The role-specific extra
// missile: low-tech gear for a Caveman, shuriken for a Monk, anything but a
// dagger for a Ranger, a dagger for a Rogue, and the racial bow and arrow for
// a Ninja or Samurai. `launcher` may be null.
export function multishot_class_bonus(pm, ammo, launcher, state = game) {
    let multishot = 0;
    const skill = objectType(ammo, state).oc_skill;

    switch (pm) {
    case PM_CAVE_DWELLER:
        /* give bonus for low-tech gear */
        if (skill === -P_SLING || skill === P_SPEAR)
            multishot++;
        break;
    case PM_MONK:
        /* allow higher volley count despite skill limitation */
        if (skill === -P_SHURIKEN)
            multishot++;
        break;
    case PM_RANGER:
        /* arbitrary; encourage use of other missiles beside daggers */
        if (skill !== P_DAGGER)
            multishot++;
        break;
    case PM_ROGUE:
        /* possibly should add knives... */
        if (skill === P_DAGGER)
            multishot++;
        break;
    case PM_NINJA:
        if (skill === -P_SHURIKEN || skill === -P_DART)
            multishot++;
        /* FALLTHRU */
    case PM_SAMURAI:
        /* role-specific launcher and its ammo */
        if (ammo.otyp === YA && launcher && launcher.otyp === YUMI)
            multishot++;
        break;
    default:
        break; /* No bonus */
    }

    return multishot;
}

// C ref: dothrow.c breaktest() (2581-2610). Whether an object that has just
// hit something hard is going to break. It is asked before anything breaks,
// so its rn2(100) through obj_resists() is part of every landing missile's
// stream even when the answer is no.
export function breaktest(obj, env = {}) {
    const state = env.state ?? game;
    let nonbreakchance = 1; /* chance for non-artifacts to resist */

    /* crystal plate mail and helm of brilliance crack four times first */
    if (obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_material === GLASS) {
        nonbreakchance = 90;
    }

    if (obj_resists(obj, nonbreakchance, 99, env)) return false;
    if (objectType(obj, state).oc_material === GLASS && !obj.oartifact
        && obj.oclass !== GEM_CLASS) {
        return true;
    }
    switch (obj.oclass === POTION_CLASS ? POT_WATER : obj.otyp) {
    case EXPENSIVE_CAMERA:
    case POT_WATER: /* really, all potions */
    case EGG:
    case CREAM_PIE:
    case MELON:
    case ACID_VENOM:
    case BLINDING_VENOM:
        return true;
    default:
        return false;
    }
}

// C ref: dothrow.c ok_to_throw() (295-317), "common to dothrow() and
// dofire()". Answers whether the hero can throw at all and hands back the
// count prefix as a shot limit.
async function ok_to_throw(state) {
    const shotlimit = Math.min(
        Math.max(state.commandCount ?? 0, 0),
        LARGEST_INT,
    );
    state.multi = 0; /* reset; it's been used up */

    const youmonst = state.youmonst?.data ?? state.mons[state.u.umonnum];
    if (notake(youmonst)) {
        await ttyPline(
            'You are physically incapable of throwing or shooting anything.',
            state,
        );
        return { ok: false, shotlimit };
    } else if (nohands(youmonst)) {
        /* not body_part(HAND) */
        await ttyPline("You can't throw or shoot without hands.", state);
        return { ok: false, shotlimit };
    }
    if (await check_capacity(null, state)) return { ok: false, shotlimit };
    return { ok: true, shotlimit };
}

// C ref: dothrow.c throw_ok() (315-348), "getobj callback for object to be
// thrown". Its answer for each carried object is the whole of what the `t`
// prompt shows: getobj() lists every GETOBJ_SUGGEST letter between the
// brackets and hides every GETOBJ_DOWNPLAY one behind `?*`. The arms are
// ordered, and the order is visible -- the wielded-weapon arm below runs
// before the WEAPON_CLASS arm, which is why a Valkyrie is offered her spare
// dagger and not the spear in her hand.
export function throw_ok(obj, state = game) {
    if (!obj) return GETOBJ_EXCLUDE;

    if (obj.bknown && welded(obj, state)) /* not a candidate if known stuck */
        return GETOBJ_DOWNPLAY;

    if (autoReturns(obj, obj.owornmask, state)
        /* to get here, obj is boomerang or is uwep and (alkys or Mjollnir) */
        /* ACURR(A_STR) is effective_attribute(), which keeps Strength in the
           3..125 encoding STR19() writes; acurrstr() would already have
           folded that down to 3..25 and could never reach the bound. */
        && (obj.oartifact !== ART_MJOLLNIR
            || effective_attribute(state, A_STR) >= STR19(25)))
        return GETOBJ_SUGGEST;

    if (obj.quan === 1 && (obj === state.uwep
        || (obj === state.uswapwep && state.u.twoweap)))
        return GETOBJ_DOWNPLAY;

    if (obj.oclass === COIN_CLASS)
        return GETOBJ_SUGGEST;

    if (!uslinging(state) && obj.oclass === WEAPON_CLASS)
        return GETOBJ_SUGGEST;
    /* Possible extension: exclude weapons that make no sense to throw,
       such as whips, bows, slings, rubber hoses. */

    if (uslinging(state) && obj.oclass === GEM_CLASS)
        return GETOBJ_SUGGEST;

    if (throws_rocks(state.youmonst?.data ?? state.mons[state.u.umonnum])
        && obj.otyp === BOULDER)
        return GETOBJ_SUGGEST;

    return GETOBJ_DOWNPLAY;
}

// C ref: dothrow.c dothrow() (350-376), "the #throw command". It calls three
// functions and nothing else.
export async function dothrow(state = game) {
    /*
     * Since some characters shoot multiple missiles at one time,
     * allow user to specify a count prefix for 'f' or 't' to limit
     * number of items thrown (to avoid possibly hitting something
     * behind target after killing it, or perhaps to conserve ammo).
     *
     * Prior to 3.3.0, command ``3t'' meant ``t(shoot) t(shoot) t(shoot)''
     * and took 3 turns.  Now it means ``t(shoot at most 3 missiles)''.
     *
     * [3.6.0:  shot count setup has been moved into ok_to_throw().]
     *
     * That count is 0 or 1 here. js/cmd.js parse() collects it, and rhack()
     * refuses a count that leaves gm.multi above 0 for every row carrying no
     * occupation text, the "throw" row included, so `3t` never reaches this
     * function; `1t` does, and ok_to_throw() reads its 1 as a one-missile
     * shot limit.
     */
    const { ok, shotlimit } = await ok_to_throw(state);
    if (!ok) return ECMD_OK;

    const obj = await getobj(
        'throw', throw_ok, GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state,
    );
    /* it is also possible to throw food */
    /* (or jewels, or iron balls... ) */

    return obj ? await throw_obj(obj, shotlimit, state) : ECMD_CANCEL;
}

// C ref: dothrow.c find_launcher() (443-462). "look through hero inventory
// for launcher matching ammo, avoiding known cursed items."
export function find_launcher(ammo, state = game) {
    if (!ammo) return null;

    let oX = null;
    for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
        if (otmp.cursed && otmp.bknown)
            continue; /* known to be cursed, so skip */
        if (ammo_and_launcher(ammo, otmp, state)) {
            if (otmp.bknown)
                return otmp; /* known-B or known-U */
            if (!oX)
                oX = otmp; /* unknown-BUC; used if no known-BU item found */
        }
    }
    return oX;
}

// C ref: dothrow.c dofire() (468-586), "the #fire command -- throw from the
// quiver or use wielded polearm".
export async function dofire(state = game) {
    const { ok, shotlimit } = await ok_to_throw(state);
    if (!ok) return ECMD_OK;

    let obj = state.uquiver ?? null;

    /* if wielding a throw-and-return weapon, throw it if quiver is empty
       or has ammo rather than missiles */
    if (state.uwep && autoReturns(state.uwep, state.uwep.owornmask, state)
        && (!obj || is_ammo(obj, state))) {
        throw new UnsupportedThrowError('firing a thrown-and-return weapon');
    } else if (!obj) {
        if (!state.flags.autoquiver) {
            if (state.uwep && is_pole(state.uwep, state)) {
                throw new UnsupportedThrowError('use_pole()');
            } else if (state.uwep && state.uwep.otyp === BULLWHIP) {
                throw new UnsupportedThrowError('use_whip()');
            } else if (state.iflags.fireassist
                       && state.uswapwep && is_pole(state.uswapwep, state)
                       && !(state.uswapwep.cursed
                            && state.uswapwep.bknown)) {
                /* we have a known not-cursed polearm as swap weapon.
                   swap to it and retry */
                cmdq_add_ec(CQ_CANNED, extcmdRow('swap'), state);
                cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
                return ECMD_OK; /* haven't taken any time yet */
            } else {
                await ttyPline('You have no ammunition readied.', state);
            }
        } else {
            throw new UnsupportedThrowError('autoquiver()');
        }
    }

    /* if autoquiver is disabled or has failed, prompt for missile */
    if (!obj) {
        throw new UnsupportedThrowError('doquiver_core()');
    }

    /* C's fourth conjunct here is `!skip_fireassist`, which only the
       thrown-and-return arm above sets, and that arm stops. */
    if (state.uquiver && is_ammo(state.uquiver, state)
        && state.iflags.fireassist) {
        if (state.uwep && is_pole(state.uwep, state)) {
            /* C asks could_pole_mon() whether anything is in reach and falls
               through to the launcher tests below when nothing is. Both
               answers stop here: use_pole() is unported either way, and
               could_pole_mon() prompts for a target of its own. */
            throw new UnsupportedThrowError('use_pole()');
        }
        /* Try to find a launcher */
        if (ammo_and_launcher(state.uquiver, state.uwep, state)) {
            obj = state.uquiver;
        } else if (ammo_and_launcher(state.uquiver, state.uswapwep, state)) {
            /* swap weapons and retry fire */
            cmdq_add_ec(CQ_CANNED, extcmdRow('swap'), state);
            cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
            return ECMD_OK;
        } else if (find_launcher(state.uquiver, state)) {
            /* wield launcher, retry fire */
            throw new UnsupportedThrowError('dowield()');
        }
    }

    /* C's `return (res == ECMD_TIME) ? res : altres`, where `res` is
       ECMD_TIME only when doquiver_core() spent a turn unwielding something
       to fill the quiver. That is the one arm above that stops, so the throw's
       own result is the whole answer here. */
    return obj ? await throw_obj(obj, shotlimit, state) : ECMD_CANCEL;
}

// C ref: dothrow.c throw_obj() (85-286), "throw the selected object, asking
// for direction". Decides the volley size, announces it, and hands each
// missile to throwit().
export async function throw_obj(obj, shotlimit, state = game) {
    const save_osplit = { ...(state.context.objsplit ?? {}) };
    let res = ECMD_TIME;
    let unsplitTarget = obj;

    /* ask "in what direction?" */
    if (!await getdir(null, state)) {
        /* No direction specified, so cancel the throw */
        res = ECMD_CANCEL; /* no time passes */
        return finishThrowObj(res, unsplitTarget, save_osplit, state);
    }

    /*
     * Throwing gold is usually for getting rid of it when
     * a leprechaun approaches, or for bribing an oncoming
     * angry monster.  So throw the whole object.
     *
     * If the gold is in quiver, throw one coin at a time,
     * possibly using a sling.
     */
    if (obj.oclass === COIN_CLASS && obj !== state.uquiver) {
        /* throw_gold will unsplit the stack itself if necessary and may have
           freed the object, so don't route through unsplit_stack here */
        return await throw_gold(obj, state);
    }

    if (!await canletgo(obj, 'throw', state)) {
        res = ECMD_OK;
        return finishThrowObj(res, unsplitTarget, save_osplit, state);
    }
    if (obj.oartifact) {
        /* is_art(obj, ART_MJOLLNIR) and its two messages */
        throw new UnsupportedThrowError('throwing an artifact');
    }
    if (obj.otyp === BOULDER
        && !throws_rocks(state.youmonst?.data
            ?? state.mons[state.u.umonnum])) {
        await ttyPline("It's too heavy.", state);
        res = ECMD_TIME;
        return finishThrowObj(res, unsplitTarget, save_osplit, state);
    }
    if (!state.u.dx && !state.u.dy && !state.u.dz) {
        await ttyPline('You cannot throw an object at yourself.', state);
        res = ECMD_OK;
        return finishThrowObj(res, unsplitTarget, save_osplit, state);
    }
    u_wipe_engr(2, { state });
    if (!state.uarmg && obj.otyp === CORPSE
        && touch_petrifies(state.mons[obj.corpsenm])
        && !propertyHeld(state, STONE_RES)) {
        /* C prints "You throw <the corpse> with your bare hands." and then
           calls instapetrify(), which is the unported half. A stone-resistant
           hero fails the fourth conjunct and throws in silence, so the guard
           has to carry it or the throw stops for a hero C never harms. */
        throw new UnsupportedThrowError('instapetrify()');
    }
    if (welded(obj, state)) {
        throw new UnsupportedThrowError('weldmsg()');
    }
    if (is_wet_towel(obj, state)) {
        throw new UnsupportedThrowError('dry_a_towel()');
    }

    /* Multishot calculations
     * (potential volley of up to N missiles; default for N is 1)
     */
    let multishot = 1;
    const skill = objectType(obj, state).oc_skill;
    if (obj.quan > 1 /* no point checking if there's only 1 */
        /* ammo requires corresponding launcher be wielded */
        && (is_ammo(obj, state)
            ? matching_launcher(obj, state.uwep, state)
            /* otherwise any stackable (non-ammo) weapon */
            : obj.oclass === WEAPON_CLASS)
        && !(propertyHeld(state, CONFUSION)
            || propertyHeld(state, STUNNED))) {
        /* some roles don't get a volley bonus until becoming expert */
        const role = state.urole.mnum;
        const weakmultishot = (role === PM_WIZARD || role === PM_CLERIC
            || (role === PM_HEALER && skill !== P_KNIFE)
            || (role === PM_TOURIST && skill !== -P_DART)
            /* poor dexterity also inhibits multishot */
            || propertyHeld(state, FUMBLING)
            || effective_attribute(state, A_DEX) <= 6);

        /* Bonus if the player is proficient in this weapon... */
        switch (P_SKILL(weapon_type(obj, state), state)) {
        case P_EXPERT:
            multishot++;
            /* FALLTHRU */
        case P_SKILLED:
            if (!weakmultishot)
                multishot++;
            break;
        default: /* basic or unskilled: no bonus */
            break;
        }
        /* ...or is using a special weapon for their role... */
        multishot += multishot_class_bonus(role, obj, state.uwep, state);

        /* ...or using their race's special bow; no bonus for spears */
        if (!weakmultishot) {
            switch (state.urace.mnum) {
            case PM_ELF:
                if (obj.otyp === ELVEN_ARROW && state.uwep
                    && state.uwep.otyp === ELVEN_BOW)
                    multishot++;
                break;
            case PM_ORC:
                if (obj.otyp === ORCISH_ARROW && state.uwep
                    && state.uwep.otyp === ORCISH_BOW)
                    multishot++;
                break;
            case PM_GNOME:
                /* arbitrary; there isn't any gnome-specific gear */
                if (skill === -P_CROSSBOW)
                    multishot++;
                break;
            case PM_HUMAN:
            case PM_DWARF:
            default:
                break; /* No bonus */
            }

            /* the quest artifact launcher bonus; no ported hero holds one */
            if (state.uwep && state.uwep.oartifact
                && ammo_and_launcher(obj, state.uwep, state)) {
                throw new UnsupportedThrowError('is_quest_artifact()');
            }
        }

        /* crossbows are slow to load; high strength loads them quickly */
        if (multishot > 1 && skill === -P_CROSSBOW
            && ammo_and_launcher(obj, state.uwep, state)
            && acurrstr(state) < (state.urace.mnum === PM_GNOME ? 16 : 18)) {
            multishot = rnd(multishot);
        }

        multishot = rnd(multishot);
        if (multishot > obj.quan)
            multishot = obj.quan;
        if (shotlimit > 0 && multishot > shotlimit)
            multishot = shotlimit;
    }

    state.m_shot ??= {};
    state.m_shot.s = Boolean(ammo_and_launcher(obj, state.uwep, state));
    /* give a message if shooting more than one, or if player
       attempted to specify a count */
    if (multishot > 1 || shotlimit > 0) {
        /* "You shoot N arrows." or "You throw N daggers." */
        await ttyPline(
            `You ${state.m_shot.s ? 'shoot' : 'throw'} ${multishot} `
            + `${multishot === 1
                ? singular(obj, xnameFresh, state) : xnameFresh(obj, state)}.`,
            state,
        );
    }

    const wep_mask = obj.owornmask;
    let oldslot = null;
    state.m_shot.o = obj.otyp;
    state.m_shot.n = multishot;
    for (state.m_shot.i = 1;
        state.m_shot.i <= state.m_shot.n;
        state.m_shot.i++) {
        const twoweap = state.u.twoweap;
        /* split this object off from its slot if necessary */
        let otmp;
        if (obj.quan > 1) {
            otmp = splitobj(obj, 1, { state });
        } else {
            otmp = obj;
            if (otmp.owornmask) {
                throw new UnsupportedThrowError('remove_worn_item()');
            }
            oldslot = obj.nobj;
            /* obj will leave inventory and may be freed by throwit */
            obj = null;
            unsplitTarget = null;
        }
        freeinv(otmp, { state });
        await throwit(otmp, wep_mask, twoweap, oldslot, state);
        await encumber_msg(state);
    }
    state.m_shot.n = 0;
    state.m_shot.i = 0;
    state.m_shot.o = STRANGE_OBJECT;
    state.m_shot.s = false;

    return finishThrowObj(res, unsplitTarget, save_osplit, state);
}

// C ref: throw_obj()'s `unsplit_stack:` label (270-285). It puts a partly
// thrown stack back together, and only for a stack the throw split away from
// a parent that is not the quiver. dofire() always throws from the quiver, so
// the test is written out and the undo behind it stops: unsplitobj() has no
// port, and reaching it would mean this port had grown a caller C's `f` does
// not have.
function finishThrowObj(res, obj, save_osplit, state) {
    if (obj && obj !== state.uquiver
        && (obj.o_id === save_osplit.parent_oid
            || obj.o_id === save_osplit.child_oid)) {
        throw new UnsupportedThrowError('unsplitobj()');
    }
    return res;
}

// C ref: dothrow.c throwit() (1507-1849), "throw an object, NB: obj may be
// consumed in the process". Sends one missile on its way and disposes of it
// where it stops.
export async function throwit(obj, wep_mask, twoweap, oldslot, state = game) {
    const u = state.u;

    if ((obj.cursed || obj.greased) && (u.dx || u.dy) && rn2(7) === 0) {
        /* misfire or slip: both messages, and the scattered direction */
        throw new UnsupportedThrowError('a cursed or greased missile slipping');
    }

    /* C reads u.mh instead of u.uhp for a polymorphed hero and exempts the
       air level; Upolyd is constantly false in this port, and Is_airlevel()
       is checked here rather than assumed. */
    if ((u.dx || u.dy || u.dz < 1)
        && calc_capacity(obj.owt, state) > SLT_ENCUMBER
        && u.uhp < 10 && u.uhp !== u.uhpmax
        && obj.owt > u.uhp * 2
        && !Is_airlevel(u.uz)) {
        await ttyPline(
            `You have so little stamina, ${the(xnameFresh(obj, state))}`
            + ' drops from your grasp.',
            state,
        );
        await exercise(A_CON, false, state, { rn2 },
            { encumberMessage: encumber_msg });
        u.dx = 0;
        u.dy = 0;
        u.dz = 1;
    }

    state.thrownobj = obj;
    state.thrownobj.how_lost = LOST_THROWN;
    if (autoReturns(obj, wep_mask, state)) {
        throw new UnsupportedThrowError('iflags.returning_missile');
    }

    if (u.uswallow) {
        throw new UnsupportedThrowError('throwing while swallowed');
    } else if (u.dz) {
        /* toss_up(), hitfloor() and potionhit() are the three arms */
        throw new UnsupportedThrowError('throwing straight up or down');
    } else if (obj.otyp === BOOMERANG) {
        throw new UnsupportedThrowError('boomhit()');
    }

    /* crossbow range is independent of strength */
    const crossbowing = Boolean(ammo_and_launcher(obj, state.uwep, state)
        && weapon_type(state.uwep, state) === P_CROSSBOW);
    const urange = Math.trunc((crossbowing ? 18 : acurrstr(state)) / 2);
    let range = obj.otyp === HEAVY_IRON_BALL
        ? urange - Math.trunc(obj.owt / 100)
        : urange - Math.trunc(obj.owt / 40);
    if (obj === state.uball) {
        throw new UnsupportedThrowError('throwing the attached iron ball');
    }
    if (range < 1)
        range = 1;

    if (is_ammo(obj, state)) {
        if (ammo_and_launcher(obj, state.uwep, state)) {
            if (crossbowing)
                range = BOLT_LIM;
            else
                range++;
        } else if (obj.oclass !== GEM_CLASS) {
            /* "You aren't wielding a bow, so you throw your arrow by hand." */
            throw new UnsupportedThrowError('throwing ammo without a launcher');
        }
    }

    if (Is_airlevel(u.uz) || Levitation(state)) {
        /* action, reaction: hurtle() throws the hero the other way */
        throw new UnsupportedThrowError('the recoil of a weightless throw');
    }

    if (obj.otyp === BOULDER)
        range = 20; /* you must be giant */

    if (u.uinwater)
        range = 1;

    const pobj = { obj };
    const mon = await bhit(u.dx, u.dy, range, THROWN_WEAPON, null, null,
        pobj, state);
    obj = pobj.obj;
    state.thrownobj = obj; /* obj may be null now */

    if (!obj) {
        /* throwit_return(FALSE) leaves gt.thrownobj alone, and the line
           above has already set it to the null bhit() answered with. */
        return;
    }

    if (mon) {
        /* C ref: dothrow.c throwit_mon_hit() (1482-1506), reached from 1695.
           Three statements stand between its entry and thitmonst() at 1492,
           and none of them can act on a path this port admits. The shopkeeper
           arm at 1487-1489 needs obj->where == OBJ_MINVENT, which only shk.c
           shkcatch() produces and js/zap.js bhit() refuses. snuff_candle()
           at 1490 needs obj->lamplit, which bhit()'s show_transient_light()
           arm refuses. The gn.notonhead write at 1491 recomputes from
           gb.bhitpos what bhit() already wrote at zap.c:3995 from the same
           square. So thitmonst() is the first thing here that would run. */
        throw new UnsupportedThrowError('thitmonst()');
    }

    const bx = state.gb.bhitpos.x;
    const by = state.gb.bhitpos.y;
    if ((!IS_SOFT(state.level.at(bx, by).typ)
        && breaktest(obj, { state }))
        || obj.oclass === VENOM_CLASS) {
        throw new UnsupportedThrowError('breakobj()');
    }
    if (!Deaf(state) && !u.uinwater) {
        /* Some sound effects when item lands in water or lava */
        if (is_pool(bx, by, state)
            || (is_lava(bx, by, state) && !isFlammable(obj, state))) {
            /* Soundeffect(se_splash, 50) expands to nothing. The minimal
               hints nethack-c/build-recorder.sh selects define no SND_LIB_*
               backend, so sndprocs.h:193-201 leaves SND_LIB_INTEGRATED unset
               and the empty definition at :272 is the live one. */
            /* weight() raises UnsupportedObjectOperationError for a food the
               hero has bitten: js/obj.js requires an eatenStat hook to read
               oeaten, and js/eat.js is its only provider, which this file
               cannot import without closing the cycle
               dothrow -> eat -> cmd -> dothrow. js/cmd.js
               failClosedCommandRefusals() lists the class, so a partly eaten
               food thrown into liquid ends the segment there rather than
               escaping as an uncaught error. */
            await ttyPline(
                weight(obj, { state }) > WT_SPLASH_THRESHOLD
                    ? 'Splash!' : 'Plop!',
                state,
            );
        }
    }
    /* flooreffects() owns everything the liquid then does to the object:
       trap.c lava_damage() for a lava square and trap.c water_damage() for a
       pool. Neither is ported for a free object, so js/do.js flooreffects()
       raises the refusal for both and this site no longer has to. */
    if (flooreffects(obj, bx, by, 'fall', {
        state,
        unsupported: (what) => {
            throw new UnsupportedThrowError(what);
        },
    })) {
        state.thrownobj = null;
        return;
    }
    obj_no_longer_held(obj);
    /* snuff_candle(): bhit() stops for a lit object before it can get here */
    if (shipsAway(bx, by, state)) {
        throw new UnsupportedThrowError('ship_object()');
    }
    state.thrownobj = null;
    place_object(obj, bx, by, { state });
    /* container contents might break */
    if (!IS_SOFT(state.level.at(bx, by).typ)) {
        if (obj.cobj) {
            throw new UnsupportedThrowError('container_impact_dmg()');
        }
        impact_disturbs_zombies(obj, true, state);
    }
    /* charge for items thrown out of shop; shk takes possession for items
       thrown into one. C's `obj != uball` third conjunct is settled above,
       where the attached iron ball stops. `*u.ushops` is the first entry of
       the room list naming the shops the hero stands in, as js/do.js
       dropx() reads it. */
    if (state.u.ushops?.[0] || obj.unpaid) {
        throw new UnsupportedThrowError('check_shop_obj()');
    }

    /* stackobj() merges the landing missile into a compatible floor pile,
       which extracts the object it merged with; invent.c obj_extract_self()
       takes that operation from its caller, as js/do.js dropx() does. */
    stackobj(obj, { state, hooks: { extractExternalObject: remove_object } });
    if (cansee(bx, by, state))
        newsym(bx, by);
    if (obj_sheds_light(obj, state))
        state.vision_full_recalc = 1;
}

// C ref: dokick.c down_gate() (1942-1975), reduced to the question
// ship_object() asks it first: is there anywhere below this square for a
// falling object to go? Everything ship_object() then does is unported, so
// the caller stops when the answer is yes.
function shipsAway(x, y, state) {
    const stway = stairway_at(x, y, state);
    if (stway && !stway.up) return true;
    const ttmp = t_at(x, y, state);
    return Boolean(ttmp && ttmp.tseen && is_hole(ttmp.ttyp));
}

// C ref: hack.c impact_disturbs_zombies() (1786-1794) over obj.h is_flimsy()
// (418-420). A heavy landing wakes buried zombies; a light or soft object
// leaves them alone.
export function impact_disturbs_zombies(obj, violent, state = game) {
    /* if object won't make a noticeable impact, let buried zombies rest */
    if (obj.owt < (violent ? 10 : 100) || is_flimsy(obj, state))
        return;

    disturb_buried_zombies(obj.ox, obj.oy, state);
}

// C ref: dothrow.c throw_gold() (2655-2731). The coin arm of throw_obj(), and
// the one arm `t` can reach that `f` cannot: C guards it on
// `obj->oclass == COIN_CLASS && obj != uquiver`, and dofire() always throws
// the quiver. The whole stack leaves the hand at once, so there is no volley
// and no split, and throwit() is never involved.
//
// The tail from flooreffects() down looks like throwit()'s and is not it.
// throwit() also calls obj_no_longer_held(), container_impact_dmg(),
// impact_disturbs_zombies() and check_shop_obj(), and guards its newsym() with
// cansee(); throw_gold() does none of that, calls sellobj() instead of
// check_shop_obj(), and calls newsym() unconditionally. The two tails are kept
// separate because sharing one would draw the wrong screen.
//
// Four branches inside this function stop. Each is C's own call to a function
// no part of this port has translated:
//
// - unsplitobj(), for a self-throw of a stack the prompt's count had split.
//   Dead in this port rather than merely untaken: C reaches getobj() with
//   GETOBJ_ALLOWCNT and splits inside it, but js/invent.js getobj() raises on
//   the first digit of a count, so no split object ever arrives here. The test
//   is written out because C's comment calls it essential for gold, and it
//   becomes live with the slice that ports the count path.
// - mondata.c digests(), for the message a swallowed hero sees. do_name.c
//   mon_nam() names the engulfer and digests() decides whether the gold
//   disappears into it or into its entrails. js/do.js drop() stops on the same
//   pair, and js/dungeon.js surface() on digests() and enfolds().
// - dokick.c ghitm() (295-407), for gold a monster in the flight path catches:
//   likes_gold(), wakeup(), setmangry(), finish_meating() and the shopkeeper's
//   bribe accounting. This one is reachable. js/zap.js bhit() ports C's
//   THROWN_WEAPON arm at zap.c:4021-4029, so it returns the monster rather
//   than stopping for it, and the refusal below is what holds the branch --
//   the same is true of throwit()'s own monster arm.
// - shk.c sellobj(), for gold that lands on a shop's floor.
async function throw_gold(obj, state = game) {
    const u = state.u;

    if (!u.dx && !u.dy && !u.dz) {
        await ttyPline('You cannot throw gold at yourself.', state);
        /* If we tried to throw part of a stack, force it to merge back
           together (same as in throw_obj).  Essential for gold. */
        const objsplit = state.context.objsplit ?? {};
        if (obj.o_id === objsplit.parent_oid
            || obj.o_id === objsplit.child_oid) {
            throw new UnsupportedThrowError('unsplitobj()');
        }
        return ECMD_CANCEL;
    }
    freeinv(obj, { state });
    if (u.uswallow) {
        throw new UnsupportedThrowError('digests() for a swallowed hero');
    }

    /* C's gb.bhitpos is a struct member and always exists; this port creates
       the struct on first use, and both arms below write into it. */
    state.gb ??= {};
    if (u.dz) {
        if (u.dz < 0 && !Is_airlevel(u.uz) && !u.uinwater
            && !Is_waterlevel(u.uz)) {
            await ttyPline(
                `The gold hits the ${ceiling(u.ux, u.uy, state)}, then falls `
                + `back on top of your ${body_part(HEAD, state.youmonst)}.`,
                state,
            );
            /* some self damage? */
            if (state.uarmh) {
                await ttyPline(
                    'Fortunately, you are wearing '
                    + `${an(helm_simple_name(state.uarmh, state))}!`,
                    state,
                );
            }
        }
        state.gb.bhitpos = { x: u.ux, y: u.uy };
    } else {
        /* consistent with range for normal objects */
        const range = Math.trunc(acurrstr(state) / 2)
            - Math.trunc(obj.owt / 40);

        /* see if the gold has a place to move into */
        const odx = u.ux + u.dx;
        const ody = u.uy + u.dy;
        if (!isok(odx, ody)
            || !ZAP_POS(state.level.at(odx, ody).typ)
            || closed_door(odx, ody, state)) {
            state.gb.bhitpos = { x: u.ux, y: u.uy };
        } else {
            const pobj = { obj };
            const mon = await bhit(u.dx, u.dy, range, THROWN_WEAPON, null, null,
                pobj, state);
            obj = pobj.obj;
            if (!obj)
                return ECMD_TIME; /* object is gone */
            if (mon) {
                /* ghitm() answers whether the monster caught the gold; both
                   answers stop, because the arm that keeps the gold flying
                   has already woken and angered the monster. */
                throw new UnsupportedThrowError('ghitm()');
            } else {
                if (shipsAway(state.gb.bhitpos.x, state.gb.bhitpos.y, state))
                    throw new UnsupportedThrowError('ship_object()');
            }
        }
    }

    if (flooreffects(obj, state.gb.bhitpos.x, state.gb.bhitpos.y, 'fall', {
        state,
        unsupported: (what) => {
            throw new UnsupportedThrowError(what);
        },
    }))
        return ECMD_TIME;
    if (u.dz > 0) {
        await ttyPline(
            'The gold hits the '
            + `${surface(state.gb.bhitpos.x, state.gb.bhitpos.y, state)}.`,
            state,
        );
    }
    place_object(obj, state.gb.bhitpos.x, state.gb.bhitpos.y, { state });
    /* `*u.ushops` is the first entry of the room list naming the shops the
       hero stands in, as js/do.js dropx() reads it. */
    if (u.ushops?.[0])
        throw new UnsupportedThrowError('sellobj()');
    /* stackobj() merges the landing gold into a compatible floor pile, which
       extracts the object it merged with; invent.c obj_extract_self() takes
       that operation from its caller, as throwit() above does. */
    stackobj(obj, { state, hooks: { extractExternalObject: remove_object } });
    newsym(state.gb.bhitpos.x, state.gb.bhitpos.y);
    return ECMD_TIME;
}
