// pray.js -- the hero's deity, the troubles a prayer would fix, the #pray
// command, and the prayer a god answers by taking offence.
//
// C ref: src/pray.c critically_low_hp() (116-156), stuck_in_wall() (161-181),
//        in_trouble() (198-284), worst_cursed_item() (288-346),
//        angrygods() (704-784), gods_upset() (1436-1443),
//        blocked_boulder() (2677-2719), can_pray() (2124-2173),
//        dopray() (2199-2273), prayer_done() (2276-2343), u_gname() (2524)
//        and align_gname() (2530).
//
// prayer_done() covers its head and the gp.p_type == 0 arm; angrygods() covers
// cases 0 and 1 of its switch and the trailing rnz(300). pleased(),
// water_prayer(), pray_revive(), godvoice(), gods_angry() and everything the
// remaining angrygods() cases reach are not ported, and each site that would
// enter one stops by name.

import {
    A_CHAOTIC,
    A_LAWFUL,
    A_MAX,
    A_NEUTRAL,
    A_NONE,
    A_STR,
    AM_MASK,
    Amask2align,
    BLINDED,
    CONFUSION,
    DEAF,
    ECMD_OK,
    ECMD_TIME,
    EXT_ENCUMBER,
    HALLUC,
    HALLUC_RES,
    HUNGRY,
    HVY_ENCUMBER,
    IS_ALTAR,
    IS_OBSTRUCTED,
    PARANOID_CONFIRM,
    PARANOID_PRAY,
    PASSES_WALLS,
    SCORR,
    SDOOR,
    SICK,
    SLIMED,
    STONED,
    STRANGLED,
    STUNNED,
    TIMEOUT,
    TT_BURIEDBALL,
    TT_LAVA,
    UNCHANGING,
    Upolyd,
    WEAK,
    WOUNDED_LEGS,
    W_SADDLE,
    isok,
    ismnum,
} from './const.js';
import { confers_luck } from './artifacts.js';
import { paranoid_query } from './cmd.js';
import { xlev_to_rank } from './display.js';
import { stuck_ring, unchanger } from './do_wear.js';
import { In_hell } from './dungeon.js';
import { freehand } from './engrave.js';
import { game } from './gstate.js';
import { near_capacity, nomul } from './hack.js';
import { change_luck } from './moveloop_preamble.js';
import {
    attacktype_fordmg,
    is_demon,
    is_undead,
    nohands,
    throws_rocks,
} from './mondata.js';
import { AD_BLND, AT_ENGL } from './monsters.js';
import { sobj_at } from './obj.js';
import {
    BOULDER,
    FUMBLE_BOOTS,
    GAUNTLETS_OF_FUMBLING,
    HELM_OF_OPPOSITE_ALIGNMENT,
    LEVITATION_BOOTS,
    LOADSTONE,
    RIN_LEVITATION,
    SADDLE,
} from './objects.js';
import { region_danger } from './region.js';
import { rn2, rnz } from './rng.js';
import { Punished } from './steed.js';
import { is_pool_or_lava } from './trap.js';
import { ttyPline } from './tty_message.js';
import { welded } from './wield.js';
import { bimanual, which_armor } from './worn.js';

// Raised where pray.c reaches a branch this port has not translated.
// js/cmd.js failClosedCommandRefusals() lists it, so the segment keeps every
// frame the command already matched instead of failing hard.
export class UnsupportedPrayerError extends Error {
    constructor(what) {
        super(`prayer reached an unported branch: ${what}`);
        this.name = 'UnsupportedPrayerError';
    }
}

// C ref: pray.c TROUBLE_* (76-101). Positive values are serious trouble,
// negative ones are comparative annoyances, and in_trouble() answers the worst
// one it finds. can_pray() reads only the sign, but the values are what
// fix_worst_trouble() switches on, so they are kept as C spells them.
export const TROUBLE_STONED = 14;
export const TROUBLE_SLIMED = 13;
export const TROUBLE_STRANGLED = 12;
export const TROUBLE_LAVA = 11;
export const TROUBLE_SICK = 10;
export const TROUBLE_STARVING = 9;
export const TROUBLE_REGION = 8; /* stinking cloud */
export const TROUBLE_HIT = 7;
export const TROUBLE_LYCANTHROPE = 6;
export const TROUBLE_COLLAPSING = 5;
export const TROUBLE_STUCK_IN_WALL = 4;
export const TROUBLE_CURSED_LEVITATION = 3;
export const TROUBLE_UNUSEABLE_HANDS = 2;
export const TROUBLE_CURSED_BLINDFOLD = 1;

export const TROUBLE_PUNISHED = -1;
export const TROUBLE_FUMBLING = -2;
export const TROUBLE_CURSED_ITEMS = -3;
export const TROUBLE_SADDLE = -4;
export const TROUBLE_BLIND = -5;
export const TROUBLE_POISONED = -6;
export const TROUBLE_WOUNDED_LEGS = -7;
export const TROUBLE_HUNGRY = -8;
export const TROUBLE_STUNNED = -9;
export const TROUBLE_CONFUSED = -10;
export const TROUBLE_HALLUCINATION = -11;

// C ref: pray.c:67 `#define STRIDENT 4`, the alignment record from which a god
// weighs the hero's bad luck at a third rather than in full.
const STRIDENT = 4;

// C ref: pray.c:39 `#define Cursed_obj(obj, typ)`.
function Cursed_obj(obj, typ) {
    return Boolean(obj) && obj.otyp === typ && Boolean(obj.cursed);
}

// C ref: pray.c:105 `#define on_altar()`. C's macro omits the u.uswallow test
// that its sibling at pray.c:1860 spells out, so a swallowed hero standing
// over an altar square still counts as being on it.
function on_altar(state) {
    return IS_ALTAR(state.level.at(state.u.ux, state.u.uy).typ);
}

// C ref: pray.c:107 `#define a_align(x, y)`.
function a_align(x, y, state) {
    return Amask2align(state.level.at(x, y).altarmask & AM_MASK);
}

// The intrinsic half of a youprop.h macro. Every trouble test below that reads
// one names it here rather than reaching into u.uprops, so a stray `.extrinsic`
// cannot creep into a test C writes as intrinsic-only.
function intrinsic(state, propidx) {
    return Math.trunc(state.u.uprops?.[propidx]?.intrinsic ?? 0);
}

function extrinsic(state, propidx) {
    return Math.trunc(state.u.uprops?.[propidx]?.extrinsic ?? 0);
}

// C ref: youprop.h:372 Unchanging (HUnchanging || EUnchanging).
function Unchanging(state) {
    return Boolean(intrinsic(state, UNCHANGING) || extrinsic(state, UNCHANGING));
}

// C ref: pray.c critically_low_hp() (116-156). "critically low hit points if
// hp <= 5 or hp <= maxhp/N for some N".
export function critically_low_hp(only_if_injured, state = game) {
    let divisor;
    const curhp = Upolyd(state.u) ? state.u.mh : state.u.uhp;
    let maxhp = Upolyd(state.u) ? state.u.mhmax : state.u.uhpmax;

    if (only_if_injured && !(curhp < maxhp)) return false;
    /* if maxhp is extremely high, use lower threshold for the division test */
    const hplim = 15 * state.u.ulevel;
    if (maxhp > hplim) maxhp = hplim;
    /* 7 used to be the unconditional divisor */
    switch (xlev_to_rank(state.u.ulevel)) { /* maps 1..30 into 0..8 */
    case 0:
    case 1:
        divisor = 5;
        break; /* explvl 1 to 5 */
    case 2:
    case 3:
        divisor = 6;
        break; /* explvl 6 to 13 */
    case 4:
    case 5:
        divisor = 7;
        break; /* explvl 14 to 21 */
    case 6:
    case 7:
        divisor = 8;
        break; /* explvl 22 to 29 */
    default:
        divisor = 9;
        break; /* explvl 30+ */
    }
    /* 5 is a magic number in TROUBLE_HIT handling below */
    return curhp <= 5 || curhp * divisor <= maxhp;
}

// C ref: pray.c stuck_in_wall() (161-181). "return True if surrounded by
// impassible rock, regardless of the state of your own location (for example,
// inside a doorless closet)".
export function stuck_in_wall(state = game) {
    let count = 0;

    if (intrinsic(state, PASSES_WALLS) || extrinsic(state, PASSES_WALLS))
        return false;
    for (let i = -1; i <= 1; i++) {
        const x = state.u.ux + i;
        for (let j = -1; j <= 1; j++) {
            if (!i && !j) continue;
            const y = state.u.uy + j;
            if (!isok(x, y)
                || (IS_OBSTRUCTED(state.level.at(x, y).typ)
                    && (state.level.at(x, y).typ !== SDOOR
                        && state.level.at(x, y).typ !== SCORR))
                || (blocked_boulder(i, j, state)
                    && !throws_rocks(state.youmonst?.data)))
                ++count;
        }
    }
    return count === 8;
}

// C ref: pray.c in_trouble() (198-284).
//
// "Return 0 if nothing particular seems wrong, positive numbers for serious
// trouble, and negative numbers for comparative annoyances. This returns the
// worst problem."
export function in_trouble(state = game) {
    let otmp;

    /*
     * major troubles
     */
    if (intrinsic(state, STONED)) return TROUBLE_STONED;
    if (intrinsic(state, SLIMED)) return TROUBLE_SLIMED;
    if (intrinsic(state, STRANGLED)) return TROUBLE_STRANGLED;
    if (state.u.utrap && state.u.utraptype === TT_LAVA) return TROUBLE_LAVA;
    if (intrinsic(state, SICK)) return TROUBLE_SICK;
    if (state.u.uhs >= WEAK) return TROUBLE_STARVING;
    if (region_danger(state)) return TROUBLE_REGION;
    if ((!Upolyd(state.u) || Unchanging(state))
        && critically_low_hp(false, state))
        return TROUBLE_HIT;
    if (ismnum(state.u.ulycn)) return TROUBLE_LYCANTHROPE;
    if (near_capacity(state) >= EXT_ENCUMBER
        && state.u.amax.a[A_STR] - state.u.acurr.a[A_STR] > 3)
        return TROUBLE_COLLAPSING;
    if (stuck_in_wall(state)) return TROUBLE_STUCK_IN_WALL;
    if (Cursed_obj(state.uarmf, LEVITATION_BOOTS)
        || stuck_ring(state.uleft, RIN_LEVITATION, state)
        || stuck_ring(state.uright, RIN_LEVITATION, state))
        return TROUBLE_CURSED_LEVITATION;
    if (nohands(state.youmonst?.data) || !freehand(state)) {
        /* for bag/box access [cf use_container()]...
           make sure it's a case that we know how to handle;
           otherwise "fix all troubles" would get stuck in a loop */
        if (welded(state.uwep, state)) return TROUBLE_UNUSEABLE_HANDS;
        if (Upolyd(state.u) && nohands(state.youmonst?.data)
            && (!Unchanging(state)
                || ((otmp = unchanger(state)) !== null && otmp.cursed)))
            return TROUBLE_UNUSEABLE_HANDS;
    }
    // Blindfolded is EBlinded alone, so ublindf is necessarily worn here.
    if (extrinsic(state, BLINDED) && state.ublindf.cursed)
        return TROUBLE_CURSED_BLINDFOLD;

    /*
     * minor troubles
     */
    if (Punished(state)
        || (state.u.utrap && state.u.utraptype === TT_BURIEDBALL))
        return TROUBLE_PUNISHED;
    if (Cursed_obj(state.uarmg, GAUNTLETS_OF_FUMBLING)
        || Cursed_obj(state.uarmf, FUMBLE_BOOTS))
        return TROUBLE_FUMBLING;
    if (worst_cursed_item(state)) return TROUBLE_CURSED_ITEMS;
    if (state.u.usteed) { /* can't voluntarily dismount from a cursed saddle */
        otmp = which_armor(state.u.usteed, W_SADDLE, state);
        if (Cursed_obj(otmp, SADDLE)) return TROUBLE_SADDLE;
    }

    if ((intrinsic(state, BLINDED) & TIMEOUT) > 1
        && !(intrinsic(state, BLINDED) & ~TIMEOUT)
        && (!state.u.uswallow
            || !attacktype_fordmg(state.u.ustuck.data, AT_ENGL, AD_BLND)))
        return TROUBLE_BLIND;
    /* deafness isn't its own trouble; healing magic cures deafness
       when it cures blindness, so do the same with trouble repair */
    if ((intrinsic(state, DEAF) & TIMEOUT) > 1) return TROUBLE_BLIND;

    for (let i = 0; i < A_MAX; i++)
        if (state.u.acurr.a[i] < state.u.amax.a[i]) return TROUBLE_POISONED;
    if ((intrinsic(state, WOUNDED_LEGS) || extrinsic(state, WOUNDED_LEGS))
        && !state.u.usteed)
        return TROUBLE_WOUNDED_LEGS;
    if (state.u.uhs >= HUNGRY) return TROUBLE_HUNGRY;
    if (intrinsic(state, STUNNED) & TIMEOUT) return TROUBLE_STUNNED;
    if (intrinsic(state, CONFUSION) & TIMEOUT) return TROUBLE_CONFUSED;
    if (intrinsic(state, HALLUC) & TIMEOUT) return TROUBLE_HALLUCINATION;
    return 0;
}

// C ref: pray.c worst_cursed_item() (288-346). "select an item for
// TROUBLE_CURSED_ITEMS". in_trouble() reads only whether the answer is null.
export function worst_cursed_item(state = game) {
    let otmp;

    /* if strained or worse, check for loadstone first */
    if (near_capacity(state) >= HVY_ENCUMBER) {
        for (otmp = state.invent; otmp; otmp = otmp.nobj)
            if (Cursed_obj(otmp, LOADSTONE)) return otmp;
    }
    /* weapon takes precedence if it is interfering
       with taking off a ring or putting on a shield */
    if (welded(state.uwep, state)
        && (state.uright || bimanual(state.uwep, state))) { /* weapon */
        otmp = state.uwep;
    /* gloves come next, due to rings */
    } else if (state.uarmg && state.uarmg.cursed) { /* gloves */
        otmp = state.uarmg;
    /* then shield due to two handed weapons and spells */
    } else if (state.uarms && state.uarms.cursed) { /* shield */
        otmp = state.uarms;
    /* then cloak due to body armor */
    } else if (state.uarmc && state.uarmc.cursed) { /* cloak */
        otmp = state.uarmc;
    } else if (state.uarm && state.uarm.cursed) { /* suit */
        otmp = state.uarm;
    /* if worn helmet of opposite alignment is making you an adherent
       of the current god, he/she/it won't uncurse that for you */
    } else if (state.uarmh && state.uarmh.cursed /* helmet */
               && state.uarmh.otyp !== HELM_OF_OPPOSITE_ALIGNMENT) {
        otmp = state.uarmh;
    } else if (state.uarmf && state.uarmf.cursed) { /* boots */
        otmp = state.uarmf;
    } else if (state.uarmu && state.uarmu.cursed) { /* shirt */
        otmp = state.uarmu;
    } else if (state.uamul && state.uamul.cursed) { /* amulet */
        otmp = state.uamul;
    } else if (state.uleft && state.uleft.cursed) { /* left ring */
        otmp = state.uleft;
    } else if (state.uright && state.uright.cursed) { /* right ring */
        otmp = state.uright;
    } else if (state.ublindf && state.ublindf.cursed) { /* eyewear */
        otmp = state.ublindf; /* must be non-blinding lenses */
    /* if weapon wasn't handled above, do it now */
    } else if (welded(state.uwep, state)) { /* weapon */
        otmp = state.uwep;
    /* active secondary weapon even though it isn't welded */
    } else if (state.uswapwep && state.uswapwep.cursed && state.u.twoweap) {
        otmp = state.uswapwep;
    /* all worn items ought to be handled by now */
    } else {
        // C leaves otmp NULL when the scan runs out, and that is the whole of
        // the "no cursed item worth fixing" answer.
        for (otmp = state.invent; otmp; otmp = otmp.nobj) {
            if (!otmp.cursed) continue;
            if (otmp.otyp === LOADSTONE || confers_luck(otmp, state)) break;
        }
    }
    return otmp ?? null;
}

// C ref: pray.c can_pray() (2124-2173). "determine prayer results in advance;
// also used for enlightenment". `praying` false means no messages should be
// given; only dopray() reaches this port's copy, so it always passes true.
export async function can_pray(praying, state = game) {
    let alignment;
    const { u } = state;
    state.gp ??= {};

    state.gp.p_aligntyp = on_altar(state)
        ? a_align(u.ux, u.uy, state) : u.ualign.type;
    state.gp.p_trouble = in_trouble(state);

    // C's guard reads `p_aligntyp == A_LAWFUL || p_aligntyp != A_NEUTRAL`,
    // which its own comment ("ok if chaotic or none") contradicts: the second
    // disjunct already admits chaotic and Moloch. Ported as written.
    if (is_demon(state.youmonst?.data)
        && (state.gp.p_aligntyp === A_LAWFUL
            || state.gp.p_aligntyp !== A_NEUTRAL)) {
        if (praying) {
            await ttyPline(
                'The very idea of praying to a '
                + `${state.gp.p_aligntyp ? 'lawful' : 'neutral'} god is `
                + 'repugnant to you.',
                state,
            );
        }
        return false;
    }

    if (praying) {
        await ttyPline(
            `You begin praying to ${align_gname(state.gp.p_aligntyp, state)}.`,
            state,
        );
    }

    if (u.ualign.type && u.ualign.type === -state.gp.p_aligntyp)
        alignment = -u.ualign.record; /* Opposite alignment altar */
    else if (u.ualign.type !== state.gp.p_aligntyp)
        alignment = Math.trunc(u.ualign.record / 2); /* Different alignment */
    else
        alignment = u.ualign.record;

    if (state.gp.p_aligntyp === A_NONE) /* praying to Moloch */
        state.gp.p_type = -2;
    else if ((state.gp.p_trouble > 0) ? (u.ublesscnt > 200)   /* big trouble */
        : (state.gp.p_trouble < 0) ? (u.ublesscnt > 100) /* minor difficulty */
            : (u.ublesscnt > 0))                        /* not in trouble */
        state.gp.p_type = 0;                     /* too soon... */
    else if (((u.uluck ?? 0) + (u.moreluck ?? 0)) < 0 || u.ugangr
             || alignment < 0)
        state.gp.p_type = 1; /* too naughty... */
    else /* alignment >= 0 */ {
        if (on_altar(state) && u.ualign.type !== state.gp.p_aligntyp)
            state.gp.p_type = 2;
        else
            state.gp.p_type = 3;
    }

    // No ported hero is undead: js/u_init.js writes u.umonnum === u.umonster,
    // so Upolyd is constantly false, and no player race is undead. The rn2(10)
    // below therefore never draws; it is written out because skipping it would
    // silently drop a call from a form that can reach here later.
    if (is_undead(state.youmonst?.data) && !In_hell(u.uz, state)
        && (state.gp.p_aligntyp === A_LAWFUL
            || (state.gp.p_aligntyp === A_NEUTRAL && !rn2(10))))
        state.gp.p_type = -1;
    /* Note:  when !praying, the random factor for neutrals makes the
       return value a non-deterministic approximation for enlightenment.
       This case should be uncommon enough to live with... */

    return !praying
        ? (state.gp.p_type === 3 && !In_hell(u.uz, state))
        : true;
}

// C ref: pray.c dopray() (2199-2273), the '#pray' command.
export async function dopray(state = game) {
    /*
     * If ParanoidPray is set, confirm prayer to avoid accidental slips
     * of Alt+p.  If ParanoidConfirm is also set, require "yes" rather
     * than just "y" (will also require "no" to decline).
     */
    if ((state.flags.paranoia_bits & PARANOID_PRAY) !== 0) {
        // flag.h:556 ParanoidConfirm, a different bit from the ParanoidPray
        // one above: it asks for "yes" spelled out rather than a single 'y'.
        const ok = await paranoid_query(
            (state.flags.paranoia_bits & PARANOID_CONFIRM) !== 0,
            'Are you sure you want to pray?',
            state,
        );
        // C's cmdq_clear(CQ_REPEAT) pair below this is inside `#if 0`.
        if (!ok) /* declined the "are you sure?" confirmation */
            return ECMD_OK;
    }

    /* breaking conduct should probably occur in can_pray() at "You begin
     * praying to %s" ... -- C's livelog_printf(LL_CONDUCT) on the first
     * prayer writes gg.gamelog and the live-log file, neither of which this
     * port has; the conduct counter itself is saved state, so it is kept.
     */
    state.u.uconduct.gnostic++;

    /* set up p_type and p_alignment */
    if (!await can_pray(true, state)) return ECMD_OK;

    if (state.wizard && state.gp.p_type >= 0) {
        // dopray():2235-2263 asks "Force the gods to be pleased?" and, on a
        // yes, rewrites u.ublesscnt, u.uluck, u.ualign.record, u.ugangr and
        // p_type. The stop precedes the prompt, so nothing is drawn or
        // written.
        throw new UnsupportedPrayerError('the wizard force-success prompt');
    }
    // The prayer itself is a three-turn wait. nomul() writes gm.multi, and
    // allmain.c moveloop_core() counts it back up one turn at a time and calls
    // hack.c unmul() when it reaches zero; unmul() prints nomovemsg and runs
    // the callback. state.afternmv is C's ga.afternmv; js/do_wear.js
    // armoroff() writes it too, with the Armor_off callback, and cancel_doff()
    // there records why the two never overlap. It is stored flat beside
    // state.nomovemsg and state.multi_reason, the two globals dopray() sets
    // alongside it. No segment boundary can fall between the write and the
    // read, because moveloop_core() reads no key while gm.multi is negative,
    // so it needs no save handling -- decl.c:175 leaves C's copy out of the
    // save file for the same reason.
    nomul(-3, state);
    state.multi_reason = 'praying';
    state.nomovemsg = 'You finish your prayer.';
    state.afternmv = prayer_done;

    if (state.gp.p_type === 3 && !In_hell(state.u.uz, state)) {
        // dopray():2265-2270 prints "You are surrounded by a shimmering
        // light." for an unblinded hero and sets u.uinvulnerable, which
        // prayer_done() then clears before taking pleased(). Nothing on this
        // arm is ported, so it stops before the message; the four statements
        // above have already run, which is where C runs them.
        throw new UnsupportedPrayerError(
            "dopray()'s pre-prayer invulnerability",
        );
    }

    return ECMD_TIME;
}

// C ref: pray.c prayer_done() (2276-2343), the ga.afternmv callback dopray()
// installs. Restricted to the head and the gp.p_type == 0 arm: a fresh hero
// carries u.ublesscnt 300 from u_init.c:1005 and can_pray() answers 0 for
// every prayer that finds no trouble, so that is the arm ordinary play
// reaches. Each of the other five stops by name.
//
// C's return value distinguishes the Inhell arm from the rest, and only
// moveloop_core()'s occupation loop reads an afternmv result; unmul() discards
// it. Nothing is returned here.
export async function prayer_done(state = game) {
    state.u.uinvulnerable = false;
    if (state.gp.p_type === -2) {
        // Praying at an unaligned altar: wake_nearby(), adjalign(-2) and,
        // outside Gehennom, "Nothing else happens."
        throw new UnsupportedPrayerError("prayer_done()'s Moloch arm");
    } else if (state.gp.p_type === -1) {
        // Praying while polymorphed into an undead creature: godvoice(),
        // rehumanize() and losehp(rnd(20)).
        throw new UnsupportedPrayerError("prayer_done()'s undead arm");
    }
    if (In_hell(state.u.uz, state)) {
        // "Since you are in Gehennom, %s can't help you." plus an rnl() roll
        // against u.ualign.record that decides whether angrygods() runs.
        throw new UnsupportedPrayerError("prayer_done()'s Gehennom arm");
    }

    if (state.gp.p_type === 0) {
        // C guards water_prayer(FALSE) with `on_altar() && u.ualign.type !=
        // alignment`. can_pray() only reaches p_type 0 by way of u.ublesscnt,
        // so an altar-standing hero can arrive here; water_prayer() blesses
        // and curses the potions underfoot and is not ported.
        if (on_altar(state) && state.u.ualign.type !== state.gp.p_aligntyp)
            throw new UnsupportedPrayerError('water_prayer()');
        state.u.ublesscnt += rnz(250);
        change_luck(-3, state);
        await gods_upset(state.u.ualign.type, state);
    } else if (state.gp.p_type === 1) {
        // "too naughty". pray.c:2323-2325 runs the same on_altar()
        // water_prayer(FALSE) call the p_type 0 arm above does, then
        // angrygods(u.ualign.type). What it skips relative to p_type 0 is the
        // pair of penalties between them, u.ublesscnt += rnz(250) and
        // change_luck(-3).
        throw new UnsupportedPrayerError("prayer_done()'s p_type 1 arm");
    } else if (state.gp.p_type === 2) {
        // A coaligned hero on a cross-aligned altar: water_prayer() decides
        // between the p_type 0 penalties and pleased().
        throw new UnsupportedPrayerError("prayer_done()'s p_type 2 arm");
    } else {
        // Coaligned and in good standing: pray_revive(), water_prayer(TRUE)
        // and pleased(), which is the whole reward half of pray.c.
        throw new UnsupportedPrayerError('pleased()');
    }
}

// C ref: pray.c gods_upset() (1436-1443). "The g_align god is upset with you."
// Anger at the hero's own god accumulates; anger at another god is spent.
export async function gods_upset(g_align, state = game) {
    if (g_align === state.u.ualign.type) state.u.ugangr++;
    else if (state.u.ugangr) state.u.ugangr--;
    await angrygods(g_align, state);
}

// C ref: youprop.h:119-120 Hallucination, the bare HALLUC intrinsic minus
// either form of Halluc_resistance.
function Hallucination(state) {
    const halluc = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(halluc?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: pray.c angrygods() (704-784). How badly a god reacts is
// `rn2(maxanger)`, and maxanger grows with the anger already stored and with
// bad luck, so the first prayer of a game -- one point of anger and the three
// points of luck prayer_done() has just taken -- lands on rn2(4).
//
// Only cases 0 and 1, the pair that merely tells the hero the god is
// displeased, are ported. Cases 2 through 8 and the default reach adjattrib(),
// losexp(), rndcurse(), attrcurse(), punish(), summon_minion() and
// god_zaps_you(); each stops by name below.
export async function angrygods(resp_god, state = game) {
    let maxanger;
    const { u } = state;

    if (In_hell(u.uz, state)) resp_god = A_NONE;
    u.ublessed = 0; /* lose divine protection */

    const Luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
    /* changed from tmp = u.ugangr + abs (u.uluck) -- rph */
    /* added test for alignment diff -dlc */
    if (resp_god !== u.ualign.type) {
        maxanger = Math.trunc(u.ualign.record / 2)
            + (Luck > 0 ? Math.trunc(-Luck / 3) : -Luck);
    } else {
        maxanger = 3 * u.ugangr
            + ((Luck > 0 || u.ualign.record >= STRIDENT)
                ? Math.trunc(-Luck / 3)
                : -Luck);
    }
    if (maxanger < 1) maxanger = 1; /* possible if bad align & good luck */
    else if (maxanger > 15) maxanger = 15; /* be reasonable */

    switch (rn2(maxanger)) {
    case 0:
    case 1:
        await ttyPline(
            `You feel that ${align_gname(resp_god, state)} is `
            + `${Hallucination(state) ? 'bummed' : 'displeased'}.`,
            state,
        );
        break;
    case 2:
    case 3:
        throw new UnsupportedPrayerError(
            "angrygods()'s \"Thou must relearn thy lessons!\"",
        );
    case 6:
        // C punishes an unpunished hero here and falls through to the curse
        // arm below when the hero already carries a ball and chain.
        throw new UnsupportedPrayerError("angrygods()'s punishment");
    case 4:
    case 5:
        throw new UnsupportedPrayerError("angrygods()'s curses");
    case 7:
    case 8:
        throw new UnsupportedPrayerError("angrygods()'s summoned minion");
    default:
        throw new UnsupportedPrayerError("angrygods()'s lightning bolt");
    }
    /* even though this might not be in response to prayer, set pray timer */
    const new_ublesscnt = rnz(300);
    if (new_ublesscnt > u.ublesscnt) u.ublesscnt = new_ublesscnt;
}

// C ref: decl.c Moloch.
const Moloch = 'Moloch';

// C ref: pray.c align_gname(). role.c stores a name whose worship is
// grammatically awkward with a leading underscore, which C strips here.
export function align_gname(alignment, state = game) {
    let gnam;
    switch (alignment) {
    case A_NONE:
        gnam = Moloch;
        break;
    case A_LAWFUL:
        gnam = state.urole.lgod;
        break;
    case A_NEUTRAL:
        gnam = state.urole.ngod;
        break;
    case A_CHAOTIC:
        gnam = state.urole.cgod;
        break;
    default:
        // C reports impossible() and carries on with "someone".
        gnam = 'someone';
        break;
    }
    return gnam.startsWith('_') ? gnam.slice(1) : gnam;
}

// C ref: pray.c u_gname(). The name of the hero's own deity.
export function u_gname(state = game) {
    return align_gname(state.u.ualign.type, state);
}

// C ref: pray.c blocked_boulder() (2677-2719). Whether a boulder pile one step
// away in direction (dx, dy) cannot be pushed. stuck_in_wall() is the only
// caller, and it evaluates isok(u.ux + dx, u.uy + dy) first, so the object
// chain read below is always in bounds even though C checks nothing here.
function blocked_boulder(dx, dy, state) {
    let count = 0;

    for (let otmp = state.level.objects[state.u.ux + dx][state.u.uy + dy];
        otmp;
        otmp = otmp.nexthere) {
        if (otmp.otyp === BOULDER) count += otmp.quan;
    }

    /* next spot beyond boulder(s) */
    const nx = state.u.ux + 2 * dx;
    const ny = state.u.uy + 2 * dy;
    switch (count) {
    case 0:
        /* no boulders--not blocked */
        return false;
    case 1:
        /* possibly blocked depending on if it's pushable */
        break;
    case 2:
        /* this is only approximate since multiple boulders might sink */
        if (is_pool_or_lava(nx, ny, state)) /* does its own isok() check */
            break; /* still need Sokoban check below */
        /* FALLTHRU */
    default:
        /* more than one boulder--blocked after they push the top one;
           don't force them to push it first to find out */
        return true;
    }

    /* can't push boulder diagonally in Sokoban */
    if (dx && dy && state.level.flags?.sokoban_rules) return true;
    if (!isok(nx, ny)) return true;
    if (IS_OBSTRUCTED(state.level.at(nx, ny).typ)) return true;
    if (sobj_at(BOULDER, nx, ny, state)) return true;

    return false;
}
