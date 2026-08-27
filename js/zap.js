// zap.js -- the `z` command, the ray it fires, and the wish prompt.
// C refs: src/zap.c learnwand(), zappable(), zap_ok(), dozap(), zapyourself()
// and makewish(); then the ray, whose own section header below lists it.
//
// dozap() is ported whole, and so is the command around its effect arms: the
// two guards, the object prompt, the charge, the direction prompt, the wand
// that glows and fades when no direction is given, and the worn-out wand that
// crumbles. One of its five effect arms still stops: backfire(). The fifth,
// weffects(), runs, and takes an aimed ray wand as far as the fire damage
// zhitu() does to the hero.
//
// The shop usage fee stops the command earlier than any of them. check_unpaid()
// runs between the object prompt and the charge, and js/shk.js raises
// UnsupportedShopError there for merchandise the hero has not paid for, so a
// zap in a shop ends the segment before an effect arm is chosen at all.
//
// The self-zap arm runs, through zapyourself(), for a wand or spell of sleep
// alone. Every other object type zapyourself() can be handed stops in the one
// refusal that stands where C puts `default: impossible()`.
//
// wizcmds.c wiz_wish() calls makewish(); potion.c, sit.c and zap.c's own
// wand code reach it too, and none of those callers is ported.
//
// zap.c's elemental destruction of carried and floor-borne objects lives in
// js/zap_destroy_items.js, which the C file separates as its own group of
// functions.

import { artifact_origin } from './artifacts.js';
import {
    ACID_RES,
    AC_VALUE,
    ARM,
    A_WIS,
    BLINDED,
    COLD_RES,
    DISINT_RES,
    DISP_BEAM,
    DISP_CHANGE,
    DISP_END,
    DISP_FLASH,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FIRE_RES,
    GETOBJ_EXCLUDE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HALF_SPDAM,
    HALLUC,
    HALLUC_RES,
    ICE,
    IRONBARS,
    IS_FOUNTAIN,
    IS_ROOM,
    IS_SINK,
    IS_WALL,
    IS_WATERWALL,
    In_mines,
    KILLED_BY_AN,
    Is_airlevel,
    Is_waterlevel,
    LAVAWALL,
    M_AP_OBJECT,
    M_AP_TYPE,
    M_SEEN_FIRE,
    M_SEEN_REFL,
    M_SEEN_SLEEP,
    OBJ_AT,
    REFLECTING,
    SDOOR,
    SHOCK_RES,
    STONE,
    nothing_happens,
    ONAME_KNOW_ARTI,
    ONAME_WISH,
    SLEEP_RES,
    THROWN_WEAPON,
    WAND_BACKFIRE_CHANCE,
    WAND_WREST_CHANCE,
    WEB,
    W_ACCESSORY,
    W_ART,
    W_ARMOR,
    W_WEP,
    ZAP_POS,
    isok,
    u_at,
    uhim,
} from './const.js';
import { stop_occupation } from './allmain.js';
import { exercise } from './attrib.js';
import { dirtocoord, getdir, xytodir } from './cmd.js';
import {
    bot,
    glyph_is_invisible,
    map_invisible,
    newsym,
    obj_to_glyph,
    tmp_at,
    unmap_invisible,
    unmap_object,
    zapdir_to_glyph,
} from './display.js';
import { findit } from './detect.js';
import { dropx, preflight_dropx } from './do.js';
import { more_experienced } from './exper.js';
import { getlin } from './windows.js';
import { game } from './gstate.js';
import {
    check_capacity, losehp, nh_delay_output, nomul,
} from './hack.js';
import { lcase, mungspaces } from './hacklib.js';
import {
    getobj,
    hold_another_object,
    prepareHoldDropAdmission,
    update_inventory,
    useupall,
} from './invent.js';
import { monstunseesu, nohands } from './mondata.js';
import {
    AD_ACID,
    AD_COLD,
    AD_DISN,
    AD_ELEC,
    AD_FIRE,
} from './monsters.js';
import { discover_object, observe_object } from './o_init.js';
import { is_pick, objectType, remove_object } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    DWARVISH_CLOAK,
    HEAVY_IRON_BALL,
    IMMEDIATE,
    NODIR,
    ROCK,
    SPBOOK_CLASS,
    SPE_DIG,
    SPE_EXTRA_HEALING,
    SPE_FINGER_OF_DEATH,
    SPE_HEALING,
    SPE_MAGIC_MISSILE,
    SPE_SLEEP,
    TOOL_CLASS,
    WAND_CLASS,
    WAN_DIGGING,
    WAN_LIGHTNING,
    WAN_MAGIC_MISSILE,
    WAN_SECRET_DOOR_DETECTION,
    WAN_SLEEP,
} from './objects.js';
import {
    The,
    Tobjnam,
    Yname2,
    aobjnam,
    donameFresh,
    xnameFresh,
} from './objnam.js';
import { UnsupportedWishError, readobjnam } from './objnam_readobjnam.js';
import { encumber_msg } from './pickup.js';
import { body_part } from './polyself.js';
import { healup } from './potion.js';
import { d, rn1, rn2, rnd, rne, rnl } from './rng.js';
import { m_at } from './monst.js';
import { check_unpaid, inside_shop } from './shk.js';
import { canSpotMonster, messageAt } from './startup_a11y.js';
import { closed_door } from './monmove.js';
import { is_ice } from './terrain.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { burnarmor } from './trap_erode_obj.js';
import { shade_miss } from './uhitm.js';
import { cansee } from './vision.js';
import { burn_away_slime, fall_asleep } from './timeout.js';
import { ttyPline } from './tty_message.js';
import { burn_floor_objects, destroy_items } from './zap_destroy_items.js';
import { ignite_items } from './apply_catch_lit.js';

// The wish parser raises every other refusal, so the class lives with it.
export { UnsupportedWishError };

// Thrown where zap.c reaches a wand effect this port has not ported.
export class UnsupportedZapError extends Error {
    constructor(branch) {
        super(`zapping a wand requires ${branch}`);
        this.name = 'UnsupportedZapError';
        this.branch = branch;
    }
}

// C ref: youprop.h:103 Blind, which is either source of blindness minus the
// artifact block that cancels both.
function heroIsBlind(state) {
    const blinded = state.u?.uprops?.[BLINDED];
    return Boolean((blinded?.intrinsic || blinded?.extrinsic)
        && !blinded?.blocked);
}

// C ref: zap.c learnwand() (122-151), translated whole. Called once a zap's
// effect has been observed, to turn "a wand" into "a wand of sleep" in the
// discoveries and in the pack.
//
// The SPBOOK_CLASS guard is for a cast spell, which reaches zapyourself()
// through a fake spellbook object; skipping it there keeps casting a spell
// from rediscovering a spellbook the hero has forgotten.
//
// makeknown() is hack.h:1530's `discover_object((x), TRUE, TRUE, TRUE)`, whose
// fourth argument is what credits the hero with the discovery through
// exercise(A_WIS, TRUE). Only the arm below reaches it: a wand whose type is
// already discovered takes observe_object() alone, which is the arm the Healer
// takes, because u_init.c ini_inv_use_obj() discovered her wand of sleep as it
// handed the wand over.
export function learnwand(obj, state = game) {
    if (obj.oclass !== SPBOOK_CLASS) {
        /* if type already discovered, treat this item has having been seen
           even if hero is currently blinded (skips redundant makeknown) */
        if (objectType(obj, state).oc_name_known) {
            observe_object(obj, state); /* will usually be dknown already */

        /* otherwise discover it if item itself has been or can be seen */
        } else {
            /* in case it was picked up while blind and then zapped without
               examining inventory after regaining sight (bypassing xname) */
            if (!heroIsBlind(state))
                observe_object(obj, state);
            /* make the discovery iff we know what we're manipulating */
            if (obj.dknown)
                discover_object(obj.otyp, true, true, true, state);
        }
        update_inventory({ state });
    }
}

// C ref: zap.c zappable() (2508-2522), translated whole. Answers whether the
// wand still has a charge to spend and spends it, and its comment records
// that spending is the point: "returns 1 if zap is available, 0 otherwise. it
// removes a charge from the wand if zappable."
//
// The wrest arm is the only one that draws. A wand at zero charges is worth
// one more zap with probability 1 in WAND_WREST_CHANCE, and that last zap
// takes spe to -1, which is what makes dozap()'s tail crumble the wand.
export async function zappable(wand, state = game) {
    if (wand.spe < 0 || (wand.spe === 0 && rn2(WAND_WREST_CHANCE)))
        return 0;
    if (wand.spe === 0)
        await ttyPline(
            'You wrest one last charge from the worn-out wand.', state,
        );
    wand.spe--;
    return 1;
}

// C ref: zap.c zap_ok() (2616-2623), the getobj() callback for the `z`
// command. Every wand is a likely candidate and nothing else is one, so a
// starting hero who carries a single wand sees it alone in the prompt.
export function zap_ok(obj) {
    if (obj && obj.oclass === WAND_CLASS)
        return GETOBJ_SUGGEST;
    return GETOBJ_EXCLUDE;
}

// C ref: zap.c dozap() (2625-2683), the `z` command, translated whole.
//
// One of the five effect arms stops, and it stops after everything C does
// ahead of it has run, so the charge, the prompts and the draws that select
// the arm all happen first:
//
// - backfire() throws the cursed wand up in the hero's face. The rn2 that
//   picks it is inside the condition, so a cursed wand that does not backfire
//   spends the draw and carries on exactly as C does.
// weffects() runs the aimed-zap machinery below it and the empty
// secret-door-detection scan.
//
// The self-zap arm runs and returns ECMD_TIME for a wand or spell of sleep,
// which is the arm the recorded Healer takes. It stops only inside
// zapyourself(), which owns one refusal for every other object type in place
// of C's `default: impossible()` and a second for a sleep-resistant hero.
// dozap()'s own losehp() throw below that call cannot fire while zapyourself()
// returns 0 damage.
//
// check_unpaid() stops the command earlier than any effect arm; the file
// header says what that costs.
export async function dozap(state = game) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to zap anything in your current form.", state,
        );
        return ECMD_OK;
    }
    if (await check_capacity(null, state))
        return ECMD_OK;
    const obj = await getobj('zap', zap_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    check_unpaid(obj, state);

    const need_dir = objectType(obj, state).oc_dir !== NODIR;
    if (!await zappable(obj, state)) {
        await ttyPline(nothing_happens, state);
    } else if (obj.cursed && !rn2(WAND_BACKFIRE_CHANCE)) {
        /* the wand blows up in your face! */
        // backfire() names the wand, rolls d(spe + 2, 6) damage through
        // losehp() and useupall()s the wreckage; exercise(A_STR, FALSE) and
        // the early `return ECMD_TIME` that skips update_inventory() follow
        // it.
        throw new UnsupportedZapError('backfire() for a cursed wand');
    } else if (need_dir && !await getdir(null, state)) {
        if (!heroIsBlind(state))
            await ttyPline(
                `${The(xnameFresh(obj, state), state)} glows and fades.`, state,
            );
        /* make him pay for knowing !NODIR */
    } else if (need_dir && !state.u.dx && !state.u.dy && !state.u.dz) {
        const damage = await zapyourself(obj, true, state);
        if (damage !== 0) {
            // C names the killer with killer_xname() and halves the damage for
            // a hero with physical-damage resistance through
            // Maybe_Half_Phys(). Neither is ported, and the sleep arm is the
            // only one zapyourself() runs, so `damage` is 0 on every path that
            // reaches here.
            throw new UnsupportedZapError(
                'losehp() for a self-zap that wounds',
            );
        }
    } else {
        /*      Are we having fun yet?
         * weffects -> buzz(obj->otyp) -> zhitm (temple priest) ->
         * attack -> hitum -> known_hitum -> ghod_hitsu ->
         * buzz(AD_ELEC) -> destroy_items(AD_ELEC) ->
         * useup -> obfree -> dealloc_obj -> free(obj)
         */
        // That chain is why C reloads `obj` from gc.current_wand afterwards
        // and tests it for NULL below: weffects() can free the wand. Nothing
        // this port reaches inside weffects() frees it -- the priest whose
        // temple the chain names is behind the monster arm dobuzz() refuses --
        // so the wand below is still the one getobj() answered and C's
        // `obj &&` term has no reachable false case.
        //
        // gc.current_wand is what makes the wand reachable from the bottom of
        // that chain without being passed down it. zhitu():4563 is this port's
        // one reader, telling a wand's "zapped" from a horn's "played" in the
        // killer it builds. muse.c, music.c, priest.c and apply.c are C's
        // other writers, and none of them is ported.
        state.current_wand = obj;
        try {
            await weffects(obj, state);
        } finally {
            // JavaScript's fail-closed boundaries unwind where C's call would
            // complete. Do not let that artificial exit retain the transient
            // attribution pointer.
            state.current_wand = null;
        }
    }
    if (obj.spe < 0) {
        await ttyPline(`${Tobjnam(obj, 'turn', state)} to dust.`, state);
        useupall(obj, { state }); /* calls freeinv() -> update_inventory() */
    } else {
        update_inventory({ state }); /* maybe used a charge */
    }
    return ECMD_TIME;
}

// C ref: youprop.h:36 Sleep_resistance, which is the plain "either source"
// spelling: unlike Blind it has no blocking term.
function heroResistsSleep(state) {
    const resistance = state.u?.uprops?.[SLEEP_RES];
    return Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: zap.c zapyourself() (2704-3013), the effect of a wand or spell the
// hero aimed at their own square. The frame is here whole; of its thirty-odd
// object arms only WAN_SLEEP and SPE_SLEEP are ported, and everything else
// falls into the single refusal below.
//
// C's own `default:` is `impossible("zapyourself: object %d used?")`, so one
// arm naming the object type is the shape C already uses for a type that has
// no business here. It covers the unported wand effects at the same time.
//
// `ordinary` is TRUE for a zap the hero aimed and FALSE for a wand that broke;
// only dozap() reaches this port, so it is always TRUE today.
//
// `damage` is the hit points dozap() then takes off the hero. The sleep arm
// leaves it 0, which is what makes dozap()'s losehp() unreachable.
export async function zapyourself(obj, ordinary, state = game) {
    let learn_it = false;
    const damage = 0;

    switch (obj.otyp) {
    case WAN_SLEEP:
    case SPE_SLEEP:
        learn_it = true;
        if (heroResistsSleep(state)) {
            // shieldeff() is a tmp_at() animation and monstseesu() is the
            // "monsters notice what you shrugged off" ledger; neither is
            // ported, and the port has no hero who resists sleep yet.
            throw new UnsupportedZapError(
                'shieldeff() and monstseesu() for a sleep-resistant hero',
            );
        } else {
            if (ordinary)
                await ttyPline('The sleep ray hits you!', state);
            else
                await ttyPline('You fall asleep!', state);
            monstunseesu(M_SEEN_SLEEP, state);
            await fall_asleep(-rnd(50), true, state, {
                message: ttyPline,
                statusRefresh: () => bot(),
            });
        }
        break;

    // C ref: zap.c zapyourself() (2908-2914). SPE_HEALING and SPE_EXTRA_HEALING
    // call healup() with the d(6,4) or d(6,8) roll and optionally cure blindness
    // when the pseudo object is blessed or the spell is SPE_EXTRA_HEALING.
    case SPE_HEALING:
    case SPE_EXTRA_HEALING:
        learn_it = true; /* (no effect for spells...) */
        healup(d(6, obj.otyp === SPE_EXTRA_HEALING ? 8 : 4), 0, false,
               (obj.blessed || obj.otyp === SPE_EXTRA_HEALING), state);
        await ttyPline(
            `You feel ${obj.otyp === SPE_EXTRA_HEALING ? 'much ' : ''}better.`,
            state,
        );
        break;

    default:
        throw new UnsupportedZapError(
            `zapyourself() for object type ${obj.otyp}`,
        );
    }
    /* if effect was observable then discover the wand type provided
       that the wand itself has been seen */
    if (learn_it)
        learnwand(obj, state);
    return damage;
}

// C ref: zap.c exclam() (3546-3553). The punctuation that ends a hit message,
// chosen by how hard the blow landed. uhitm.c hmon_hitmon_msg_hit() is the
// caller here. C's comment records that the "?" arm is for a force below zero,
// which a zap can produce and a melee blow cannot.
export function exclam(force) {
    /* force == 0 occurs e.g. with sleep ray */
    /* note that large force is usual with wands so that !! would
            require information about hand/weapon/wand */
    return (force < 0) ? '?' : (force <= 4) ? '.' : '!';
}

// C ref: zap.c makewish() (6313-6422). The "help" arm at 6348-6352, the
// MAXWISHTRY retry loop at 6360-6368 and the hands_obj and artifact arms all
// stop instead; the wishes this port grants take the plain readobjnam() and
// hold_another_object() path between them, the Escape at 6346-6347 included.
//
// `tries` is 0 on every pass this port reaches, because the MAXWISHTRY loop
// that raises it starts past the throw. That settles two of the head's tests:
// the `iflags.cmdassist && tries > 0` suffix at 6330 cannot be appended, and
// the third operand of the 6334 test below holds.
export async function makewish(state = game) {
    state.context ??= {};
    // svc.context.resume_wish. allmain.c:200 is its only reader, restarting a
    // wish that a saved game left standing at this prompt; that call site is
    // not ported, so nothing reads the value back yet. It lives here because
    // makewish() is the only writer of it.
    state.context.resume_wish = 0;
    if (state.flags?.verbose)
        await ttyPline('You may wish for an object.', state);

    // `retry:`, the label the MAXWISHTRY loop jumps back to.
    const promptbuf = 'For what do you wish?';

    // 6334's `iflags.menu_requested && wish_history[0] && (tries == 0)` picks
    // the history menu over getlin(). wish_history[] is written only by
    // wish_history_add(), which sits inside `#ifdef DEBUG` at zap.c:6229;
    // include/config.h defines only DEBUG_MIGRATING_MONS and no patch under
    // nethack-c/patches/ defines DEBUG, so wish_history[0] is permanently
    // NULL. The `m` prefix therefore reaches getlin() like every other wish.
    const answer = await getlin(promptbuf, state);

    if (state.iflags?.term_gone) {
        // The terminal is gone, so C abandons the wish and marks it for a
        // restore to resume. win/tty/getline.c:87 raises the flag for the one
        // byte that reads back as EOF, which js/getline.js already models.
        // C guards the assignment with `!iflags.debug_fuzzer`, and that flag
        // is never set here.
        state.context.resume_wish = 1;
        return;
    }

    let buf = mungspaces(answer);
    if (buf[0] === '\x1b') {
        // zap.c:6346-6347 empties the buffer rather than declining the wish,
        // so readobjnam("") falls through readobjnam_preparse()'s empty return
        // to `any:` and is granted wrpsym[rn2(13)].
        buf = '';
    } else if (lcase(buf) === 'help') {
        // 6348-6352 opens wishcmdassist()'s window and asks again.
        throw new UnsupportedWishError('the wish prompt help text', buf);
    }
    /*
     *  Note: if they wished for and got a non-object successfully,
     *  otmp == &hands_obj.  That includes an artifact which has been
     *  denied.  Wishing for "nothing" requires a separate value to remain
     *  distinct.
     */
    // C's bufcpy holds the typed line for wish_history_add() and the three
    // livelog strings, none of which this port writes.
    // C's `struct obj nothing` is a stack object whose address alone matters.
    const nothing = Object.freeze({});
    // readobjnam()'s typfnd: tail calls mksobj(), which reaches the same
    // generation machinery mklev.c and makemon() do -- mkbox_cnts() for a
    // container is the arm a wish reaches today. The hooks obj.js requires for
    // those arms are the ones every other mksobj() caller assembles, so this
    // wish path assembles them the same way rather than a subset of its own.
    const otmp = readobjnam(buf, nothing, objectGenerationEnv({ state }));
    // readobjnam() answering null -- the MAXWISHTRY retry loop at 6360-6368 --
    // and &hands_obj -- wizterrainwish() at 6374-6377 -- are both refused
    // inside it, so only the two arms below are reachable.
    if (otmp === nothing) {
        /* explicitly wished for "nothing", presumably attempting
           to retain wishless conduct */
        // livelog_printf(LL_WISH, "declined to make a wish") writes the
        // livelog file, which is not a screen.
        return;
    }
    // wish_history_add() sits inside `#ifdef DEBUG` at zap.c:6229, and no
    // patch under nethack-c/patches/ defines DEBUG.
    if (otmp.oartifact) {
        /* update artifact bookkeeping; doesn't produce a livelog event */
        artifact_origin(otmp, ONAME_WISH | ONAME_KNOW_ARTI, state);
    }
    // 6387-6388 saves u.uconduct.wisharti from before the wish only to pick
    // one of three livelog strings with it, so nothing outside the livelog
    // file reads it.

    const holdEnv = {
        state,
        hooks: {
            encumberMessage: encumber_msg,
            // do.c dropz() -> stackobj() -> invent.c merged() reaches
            // mkobj.c obj_extract_self() for the pile member the landing
            // object absorbs, and that member is on the floor.
            extractExternalObject: remove_object,
            // invent.c merged():933-942.  A wished-for object that merges
            // into a stack the hero already carries settles any known,
            // rknown or bknown the two disagreed on, and says so.  Only a
            // random wish reaches this: a named one is spelled the same way
            // twice, so the second copy agrees with the first.
            inventoryComparisonDiscovered: () => ttyPline(
                'You learn more about your items by comparing them.',
                state,
            ),
            newsym,
            preflightDropObject: preflight_dropx,
            dropObject: dropx,
        },
    };
    // The supported drop tail must be admitted before doname() records
    // discovery and before wish conduct changes. The returned token is
    // consumed after addinv() reaches the source drop_it branch.
    const holdDropAdmission = prepareHoldDropAdmission(otmp, holdEnv);

    // 6398 builds the livelog string.  Its three arms differ only in the text
    // they write to the livelog file, but doname() runs for all of them and
    // its xname() marks the object seen, so the call stays.
    donameFresh(otmp, state);
    /* KMH, conduct */
    state.u.uconduct.wishes++;

    // 6405-6420.  readobjnam() refuses a corpse, so otmp->wishedfor is 0 and
    // both tests that read it take their other branch.
    const verb = (Is_airlevel(state.u.uz) || state.u.uinwater)
        ? 'slip' : 'drop';
    const here = state.level.at(state.u.ux, state.u.uy).typ;
    const oops_msg = state.u.uswallow
        ? 'Oops!  %s out of your reach!'
        : (Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)
           || here < IRONBARS || here >= ICE)
            ? 'Oops!  %s away from you!'
            : 'Oops!  %s to the floor!';

    /* The(aobjnam()) is safe since otmp is unidentified -dlc */
    await hold_another_object(
        otmp, oops_msg, The(aobjnam(otmp, verb, state), state), null,
        holdEnv,
        holdDropAdmission,
    );
    state.u.ublesscnt += rn1(100, 50); /* the gods take notice */
}

// ── bhit ──
//
// C ref: zap.c bhit() (3827-4139) and skiprange() (3578-3590). The distance
// effect shared by a thrown weapon, a kicked object, an immediate wand, a
// flashed light and an applied mirror: it walks the ray one square at a time,
// draws the transient glyph, and stops at the first monster, wall or closed
// door. C's gb.bhitpos, which it leaves at the final square, is the port's
// `state.gb.bhitpos`, the one JavaScript home for that global; dogmove.c's
// and mon.c's writers use the same name. Every caller reads it after the call
// rather than the return value, which is the monster hit.
//
// Only THROWN_WEAPON is ported, because dothrow.c throwit() is bhit()'s only
// ported caller. Everything the other five call types reach -- zap_map(),
// bhitpile(), flash_hits_mon(), hits_bars(), doorlock() -- belongs to the
// commands that use them.
//
// Ten branches inside the thrown-weapon walk stop, each at its own condition:
// a shopkeeper catching a pick-axe, a lit object lighting the squares it
// passes, iron bars, a rock skipping over water, a mimic disguised as an
// object, a heavy iron ball's four range limits, and a shade the missile
// passes through.
//
// Nine of the ten stop before changing anything. The shade does not: C's
// shade_miss() at uhitm.c:1575 reads dmgval() for zero or not-zero, and
// dmgval() rolls the damage dice, so the draw is spent before the refusal is
// raised. It is raised through an injected callback rather than a visible
// throw here, which is why it is easy to miss in this list.
//
// A monster in the path is not one of them. C's THROWN_WEAPON arm at 4021-4029
// ends the flight, maps an unseen monster and returns it, leaving the caller
// to decide what hits it: dothrow.c throwit() reaches thitmonst() through
// throwit_mon_hit():1492, and dothrow.c throw_gold():2712 reaches dokick.c
// ghitm(). Neither is ported, and each caller refuses under its own name.
export class UnsupportedBhitError extends Error {
    constructor(branch) {
        super(`zap.c bhit() reached ${branch}`);
        this.name = 'UnsupportedBhitError';
        this.branch = branch;
    }
}

// C ref: zap.c skiprange() (3578-3590). Picks the range window over which a
// thrown rock may skip. Its rnd() draws are part of the stream whether or not
// any water lies ahead, so the caller runs it for every thrown rock.
export function skiprange(range, random = { rnd }) {
    const tr = Math.trunc(range / 4);
    const tmp = range - (tr > 0 ? random.rnd(tr) : 0);
    let skipend = tmp - Math.trunc(tmp / 4) * random.rnd(3);
    if (skipend >= tmp) skipend = tmp - 1;
    return { skipstart: tmp, skipend };
}

export async function bhit(
    ddx,
    ddy,
    range,
    weapon,
    fhitm,
    fhito,
    pobj,
    state = game,
    random = { rn2, rnd },
) {
    const obj = pobj.obj;
    let allow_skip = false;
    let skiprange_start = 0;
    let skiprange_end = 0;

    if (weapon !== THROWN_WEAPON) {
        throw new UnsupportedBhitError(`call type ${weapon}`);
    }
    if (fhitm || fhito) {
        // Only ZAPPED_WAND supplies either callback; C passes null for a
        // thrown weapon at dothrow.c:1665-1666.
        throw new UnsupportedBhitError('an object or monster callback');
    }
    state.gb ??= {};
    state.gb.bhitpos = { x: state.u.ux, y: state.u.uy };

    if (obj && obj.otyp === ROCK) {
        ({ skipstart: skiprange_start, skipend: skiprange_end } =
            skiprange(range, random));
        allow_skip = random.rn2(3) === 0;
    }

    await tmp_at(DISP_FLASH, obj_to_glyph(obj, state), state);

    while (range-- > 0) {
        state.gb.bhitpos.x += ddx;
        state.gb.bhitpos.y += ddy;
        const x = state.gb.bhitpos.x;
        const y = state.gb.bhitpos.y;

        if (!isok(x, y)) {
            state.gb.bhitpos.x -= ddx;
            state.gb.bhitpos.y -= ddy;
            break;
        }

        if (is_pick(obj, state) && inside_shop(x, y, state)) {
            // shkcatch() belongs to js/shk.js's unported half.
            throw new UnsupportedBhitError('shkcatch()');
        }

        const typ = state.level.at(x, y).typ;

        /* WATER aka "wall of water" stops items */
        if (IS_WATERWALL(typ) || typ === LAVAWALL) break;

        if (obj.lamplit) {
            throw new UnsupportedBhitError('show_transient_light()');
        }
        if (typ === IRONBARS) {
            throw new UnsupportedBhitError('hits_bars()');
        }

        const mtmp = m_at(x, y, state);
        const ttmp = t_at(x, y, state);
        if (!mtmp && ttmp && ttmp.ttyp === WEB && random.rn2(3) === 0) {
            if (cansee(x, y, state)) {
                await ttyPline(
                    `${Yname2(obj, state)} gets stuck in a web!`,
                    state,
                );
                ttmp.tseen = true;
                newsym(x, y);
            }
            // iflags.returning_missile: no ported object returns to the hand,
            // so `was_returning` is always null and its two arms are inert.
            break;
        }

        /*
         * skipping rocks
         *
         * skiprange_start is only set if this is a thrown rock
         */
        if (skiprange_start && range === skiprange_start && allow_skip) {
            if (is_pool(x, y, state) && !mtmp) {
                throw new UnsupportedBhitError('a rock skipping over water');
            } else if (skiprange_start > skiprange_end + 1) {
                --skiprange_start;
            }
        }
        // C's `if (in_skip)` block below this cannot run: in_skip is set only
        // by the arm that stops just above, so its branches -- another bounce
        // and a monster the rock passes over -- are unreachable.

        /* if mtmp is a shade and missile passes harmlessly through it,
           give message and skip it in order to keep going;
           ...
           thrown objects don't hit mimics pretending to be objects (both
           because the hero is likely aiming to throw over what seems to
           be an object rather than at it, and for balance because
           otherwise mimics are too easy to identify by throwing gold at
           them); exception: if the hero knows there is a monster there,
           they will be aiming at the monster */
        // zap.c:3983-3992, the guard that can clear mtmp and let the missile
        // fly past a monster standing in its path. Its FLASHED_LIGHT disjunct
        // belongs to a call type the head of this function refuses, so only
        // the THROWN_WEAPON half is here.
        //
        // shade_miss() answers false for every defender that is not a shade,
        // and js/uhitm.js refuses rather than answering true for one, so the
        // `mtmp = 0` C writes on a true answer has no reachable site to be
        // written at. Its false answer still costs a dmgval() roll for a shade
        // that the missile can hurt, which is why it is called rather than
        // skipped.
        if (mtmp) {
            shade_miss(state.youmonst, mtmp, obj, true, true, state, {
                unsupported: (what) => {
                    throw new UnsupportedBhitError(what);
                },
            });
            if (M_AP_TYPE(mtmp) === M_AP_OBJECT) {
                // The three glyph tests at 3987-3989 ask what the hero sees
                // drawn on the square, which display.c glyph_at() reads out of
                // gg.gbuf as a glyph number. This port's glyph buffer stores
                // resolved presentations, and only js/display.js
                // map_glyphinfo() puts a number on one (:1733); the monster
                // presentations are built by glyphPresentation() and carry
                // none, and map_glyphinfo() has no monster arm at all. So a
                // square showing a monster cannot answer glyph_is_monster()
                // here, and the disguise the hero has seen through cannot be
                // told from the one they have not.
                throw new UnsupportedBhitError('glyph_at()');
            }
        }

        if (mtmp) {
            /* THROWN_WEAPON, KICKED_WEAPON */
            // zap.c:3994-3995 and 4021-4029. `tethered_weapon` is false for
            // every call this port admits, so the DISP_END always runs here
            // and the one at 4125-4127 is what `goto bhit_done` skips.
            state.gn ??= {};
            state.gn.notonhead = x !== mtmp.mx || y !== mtmp.my;
            await tmp_at(DISP_END, 0, state);
            if (cansee(x, y, state) && !canSpotMonster(mtmp, state))
                map_invisible(x, y, state);
            // goto bhit_done. transient_light_cleanup() there is inert for the
            // same reason as at the tail below.
            return mtmp;
        }

        if (!ZAP_POS(typ) || closed_door(x, y, state)) {
            state.gb.bhitpos.x -= ddx;
            state.gb.bhitpos.y -= ddy;
            break;
        }
        /* 'I' present but no monster: erase; do this before tmp_at() */
        if (glyph_is_invisible(state.level.at(x, y).remembered_glyph?.glyph)
            && cansee(x, y, state)) {
            unmap_object(x, y, state);
            newsym(x, y);
        }
        await tmp_at(x, y, state);
        await nh_delay_output(state);
        if (IS_SINK(typ))
            break; /* physical objects fall onto sink */

        /* limit range of ball so hero won't make an invalid move */
        if (range > 0 && obj.otyp === HEAVY_IRON_BALL) {
            throw new UnsupportedBhitError('a heavy iron ball in flight');
        }

        // C clears point_blank here, "affects passing through iron bars". Its
        // only reader is the hits_bars() call that stops above, so the port
        // keeps neither the variable nor this assignment.
    }

    await tmp_at(DISP_END, 0, state);
    // pay_for_damage("destroy"): only a zapped wand can break a shop door.
    // transient_light_cleanup(): only a lit object registers a transient
    // light, and the arm that would have shown one stops above.
    //
    // The return value is the monster the missile hit. Reaching the tail means
    // the flight ended on terrain or on its own range instead, so it is null.
    return null;
}

// ── The ray ──
//
// C refs: zap.c weffects() (3430-3476), ubuzz() (4758-4762), dobuzz()
// (4779-5037), zhitu() (4400-4591), zap_over_floor() (5140-5497),
// bounce_dir() (4663-4701), zap_hit() (4704-4720), zaptype() (88-96),
// flash_types[] (71-85), flash_str() (6428-6445), adtyp_to_prop() (5653-5674),
// u_adtyp_resistance_obj() (5675-5698) and inventory_resistance_check()
// (5709-5718).
//
// This is the aimed-ray half of the file: the hero points a wand of magic
// missile, fire, cold, sleep, death or lightning in a direction and dobuzz()
// walks the bolt one square at a time until its range runs out. bhit() above
// is the sibling traversal for an IMMEDIATE wand and shares none of it.
//
// The whole of it is entered from one place, weffects()'s ubuzz() arm, so
// `type` is always a hero wand zap, 0..9. Three things C computes follow from
// that and are written here as constants rather than tests:
//
// - `fireball` is `type == ZT_SPELL(ZT_FIRE)`, which is 11, so it is false.
//   Its four consequences -- the skipped zap_over_floor(), the `break` on a
//   monster, the explode-before-the-obstacle arm and explode() itself -- are
//   all absent below rather than refused.
// - `spell_type` is `is_hero_spell(type) ? SPE_MAGIC_MISSILE + damgtype : 0`,
//   and is_hero_spell() needs 10..19, so it is 0. zap_hit() takes that 0 and
//   never reaches spell_hit_bonus().
// - `gas_hit` is `damgtype == ZT_POISON_GAS`, which is 6. BZ_OFS_WAN() answers
//   0..5 for the six ray wands (objects.h:1488 orders them so), so it is
//   false and the deferred second zap_over_floor() at 5021-5022 never runs.
//
// Only zhitu()'s ZT_FIRE arm is ported; the other six damage types stop by
// name. The killer-and-losehp() tail below them is ported too, and the doc
// comment on zhitu() itself records what of it still refuses.

// C ref: zap.c:45-57. ZT_<element> is the damage type minus one, and the three
// ZT_ macros shift it into the wand, spell and breath bands.
const ZT_MAGIC_MISSILE = 0;
const ZT_FIRE = 1;
const ZT_COLD = 2;
const ZT_SLEEP = 3;
const ZT_DEATH = 4;
const ZT_LIGHTNING = 5;
const ZT_POISON_GAS = 6;
const ZT_ACID = 7;

// C ref: zap.c flash_types[] (71-85). "A positive index means zapped/cast/
// breathed by hero. A negative index means zapped/cast/breathed by a monster,
// with value index fixup beyond abs() needed for wand zaps." Wands are 0-9,
// spell equivalents 10-19 and dragon-breath equivalents 20-29; the empty
// strings are the unassigned slots in each band.
const flash_types = Object.freeze([
    'magic missile', /* Wands must be 0-9 */
    'bolt of fire', 'bolt of cold', 'sleep ray', 'death ray',
    'bolt of lightning', '', '', '', '',

    'magic missile', /* Spell equivalents must be 10-19 */
    'fireball', 'cone of cold', 'sleep ray', 'finger of death',
    'bolt of lightning', /* there is no spell, used for retribution */
    '', '', '', '',

    'blast of missiles', /* Dragon breath equivalents 20-29*/
    'blast of fire', 'blast of frost', 'blast of sleep gas',
    'blast of disintegration', 'blast of lightning',
    'blast of poison gas', 'blast of acid', '', '',
]);

// C ref: zap.c zaptype() (88-96), "convert monster zap/spell/breath value to
// hero zap/spell/breath value". A monster's wand zap is -39..-30 rather than
// -9..-0 because -0 is ambiguous, so it is shifted before the abs().
export function zaptype(type) {
    if (type <= -30 && -39 <= type) /* monster wand zap */
        type += 30; /* first convert -39..-30 to -9..0 so that abs()
                     * will yield 0..9 (hero wand zap) for it */
    return Math.abs(type);
}

// C ref: youprop.h:120 Hallucination, over :116-119. The property is an
// intrinsic timeout alone, and either source of Halluc_resistance suppresses
// it.
function Hallucination(state) {
    const halluc = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(halluc?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: youprop.h:28 Fire_resistance and :381 Reflecting, both the plain
// "either source" spelling. Fire_resistance is exported because
// js/zap_destroy_items.js maybe_destroy_item() reads it too, at zap.c:5834.
export function Fire_resistance(state) {
    const property = state.u?.uprops?.[FIRE_RES];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: youprop.h:32 Cold_resistance = (HCold_resistance || ECold_resistance).
// Exported because peffect_oil() in js/potion.js reads it.
export function Cold_resistance(state) {
    const property = state.u?.uprops?.[COLD_RES];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function Reflecting(state) {
    const property = state.u?.uprops?.[REFLECTING];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: youprop.h:293-295 Half_spell_damage, another "either source"
// spelling. Only an artifact carrying SPFX_HSPDAM confers it, and no ported
// path puts one in a hero's hand, so the halving it gates at zap.c:4586 has
// yet to fire in a running game.
function Half_spell_damage(state) {
    const property = state.u?.uprops?.[HALF_SPDAM];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: zap.c flash_str() (6428-6445). "Fills buf with the appropriate string
// for this ray. In the hallucination case, insert 'blast of <silly thing>'."
//
// `nohallu` suppresses hallucination for a death reason, so the killer a
// player reads afterwards names the bolt that killed them. The hallucinating
// arm needs rnd_hallublast(), which draws, so it stops; dobuzz() stops on the
// same property one call earlier.
export function flash_str(typ, nohallu, state = game) {
    typ = zaptype(typ);
    if (!nohallu && Hallucination(state)) {
        throw new UnsupportedZapError(
            'rnd_hallublast() for a hallucinating hero',
        );
    }
    return flash_types[typ];
}

// C ref: zap.c adtyp_to_prop() (5653-5674). The resistance property that
// answers a damage type, or 0 for a type no property covers.
export function adtyp_to_prop(dmgtyp) {
    switch (dmgtyp) {
    case AD_COLD: return COLD_RES;
    case AD_FIRE: return FIRE_RES;
    case AD_ELEC: return SHOCK_RES;
    case AD_ACID: return ACID_RES;
    case AD_DISN: return DISINT_RES;
    // C's switch holds these five rows and nothing else. Every other damage
    // type falls to `default: break;` and the `return 0` below it, which
    // zap.c:5670's own comment explains: prop_types start at 1, so 0 is the
    // no-property answer u_adtyp_resistance_obj() tests for.
    default: return 0;
    }
}

// C ref: zap.c u_adtyp_resistance_obj() (5675-5698). How well the hero's own
// equipment protects the pack from a damage type, as a percentage. C's own
// comment: "FIXME? these percentages (99 and 90) seem too high..."
//
// The 99% arm needs an extrinsic from armor, an accessory, the wielded weapon
// or an artifact; the 90% arm needs a worn dwarvish cloak against heat or
// cold. A starting hero has neither, which is why the ray's first burnarmor()
// spends no draw on inventory_resistance_check().
export function u_adtyp_resistance_obj(dmgtyp, state = game) {
    const prop = adtyp_to_prop(dmgtyp);
    if (!prop) return 0;

    /* items that give an extrinsic resistance when worn or wielded or
       carried give 99% protection to your items */
    if ((Math.trunc(state.u?.uprops?.[prop]?.extrinsic ?? 0)
         & (W_ARMOR | W_ACCESSORY | W_WEP | W_ART)) !== 0)
        return 99;

    /* worn dwarvish cloaks give 90% protection against heat and cold to
       carried items */
    if (state.uarmc && state.uarmc.otyp === DWARVISH_CLOAK
        && (dmgtyp === AD_COLD || dmgtyp === AD_FIRE))
        return 90;

    return 0;
}

// C ref: zap.c inventory_resistance_check() (5709-5718). "Rolls to see whether
// an object in inventory resists damage from the given damage type, due to an
// equipped item protecting it." No protection means no roll, which is what
// keeps an unprotected hero's erosion draw-free.
export function inventory_resistance_check(
    dmgtyp,
    state = game,
    random = { rn2 },
) {
    const prob = u_adtyp_resistance_obj(dmgtyp, state);
    if (!prob) return false;
    return random.rn2(100) < prob;
}

// C ref: zap.c bounce_dir() (4663-4701). "which direction a ray bounces.
// current location is sx,sy, direction is ddx, ddy. bounceback is 1/n chance
// of bouncing back. caller must ensure sx,sy is a bouncing location: !ZAP_POS
// or closed_door".
//
// C writes the new direction back through two pointers; this returns it.
//
// A ray travelling along a row or a column takes the first arm on `!*ddx ||
// !*ddy` before the bounceback roll is reached, so it always reverses and
// never draws. That is why a horizontal zap's log carries no bounce roll and
// why no horizontal zap can exercise the 10/20/75 selector dobuzz() picks
// `bounceback` from.
// C's `*ddx = -(*ddx)` on an int 0 is 0; JavaScript's unary minus answers -0.
// No branch this port takes can tell the two apart: `-0 === 0` holds, `-0` is
// falsy exactly as `0` is, and so zapdir_to_glyph()'s `dx ? 1 : 0`,
// dobuzz()'s `dx === 0 && dy === 0` and the `!ddx || !ddy` test below all
// answer the same either way. js/zap.js's own `xytodir(-dx, -dy)` passes -0
// for a horizontal bolt and resolves correctly.
//
// What separates them is identity: Object.is and assert.deepStrictEqual. This
// keeps a delta the same value C's int holds, so an assertion or a future
// serialization comparing by identity stays meaningful. It fixes no branch.
function negate(delta) {
    return 0 - delta;
}

export function bounce_dir(
    sx, sy, ddx, ddy, bounceback, state = game, random = { rn2 },
) {
    if (!ddx || !ddy || (bounceback > 0 && !random.rn2(bounceback))) {
        return { dx: negate(ddx), dy: negate(ddy) };
    }
    let rmn;
    let bounce = 0;
    const lsy = sy - ddy;
    const lsx = sx - ddx;

    if (isok(sx, lsy) && ZAP_POS(rmn = state.level.at(sx, lsy).typ)
        && !closed_door(sx, lsy, state)
        && (IS_ROOM(rmn) || (isok(sx + ddx, lsy)
                             && ZAP_POS(state.level.at(sx + ddx, lsy).typ))))
        bounce = 1;
    if (isok(lsx, sy) && ZAP_POS(rmn = state.level.at(lsx, sy).typ)
        && !closed_door(lsx, sy, state)
        && (IS_ROOM(rmn) || (isok(lsx, sy + ddy)
                             && ZAP_POS(state.level.at(lsx, sy + ddy).typ))))
        if (!bounce || random.rn2(2))
            bounce = 2;
    switch (bounce) {
    case 0:
        ddx = negate(ddx);
        /* FALLTHRU */
    case 1:
        ddy = negate(ddy);
        break;
    case 2:
        ddx = negate(ddx);
        break;
    default:
        break;
    }
    return { dx: ddx, dy: ddy };
}

// C ref: zap.c zap_hit() (4704-4720). "will zap/spell/breath attack score a
// hit against armor class `ac'?"
//
// `type` is a hero-cast spell type or 0; every ported caller passes 0, because
// dobuzz()'s `spell_type` is 0 for a wand. The rn2(20) precedes the
// spell_hit_bonus() the refusal stands in for, exactly as C evaluates them.
export function zap_hit(ac, type, random = { rn2, rnd }) {
    const chance = random.rn2(20);
    if (type) {
        throw new UnsupportedZapError(
            'spell_hit_bonus() for a spell the hero cast',
        );
    }
    const spell_bonus = 0;

    /* small chance for naked target to avoid being hit */
    if (!chance)
        return random.rnd(10) < ac + spell_bonus;

    /* very high armor protection does not achieve invulnerability */
    ac = AC_VALUE(ac, random);

    return (3 - chance < ac + spell_bonus);
}

// C ref: zap.c zhitu() (4561-4589), the braced block that turns the bolt into
// the two arguments losehp() reads at 4588: the killer string and the damage.
//
// It stands apart from zhitu() because nothing observes svk.killer until end.c
// done() names the death by it, and done() is unported. No screen, cursor or
// random-number call moves with the string, so a fresh differential cannot
// tell a right killer from a wrong one and the test that pins it is the only
// proof it is correct.
export function zhituLosehpArguments(type, abstyp, dam, fltxt, state = game) {
    const otmp = state.current_wand;
    /* fire horn and frost horn get handled as wands by caller */
    const verb = (abstyp < 10) /* wand */
        ? ((otmp && otmp.oclass === TOOL_CLASS) ? 'played' : 'zapped')
        : (abstyp < 20) ? 'cast'
            : (abstyp < 30) ? 'exhaled'
                : 'imagined'; /* should never happen */

    if (type < 0 || (type === 0 && state.gb?.buzzer)) {
        // 4572-4577 names the monster that fired the bolt, through
        // mcastu.c death_inflicted_by() and hacklib.c strsubst(). C's guard is
        // `type < 0 || (type == 0 && gb.buzzer != 0)`, and the conjunct
        // matters: a hero's own magic missile is type 0, so only a set
        // gb.buzzer separates it from the else at 4578, while every other
        // hero type takes the else whatever gb.buzzer holds.
        //
        // Neither half can hold here. dobuzz() refuses a negative type one
        // frame above, and gb.buzzer is written only by mcastu.c, muse.c,
        // mthrowu.c, priest.c and timeout.c, none of them ported. A hero's own
        // ricochet therefore always takes the else at 4578.
        throw new UnsupportedZapError(
            'death_inflicted_by() for a bolt a monster fired',
        );
    }
    /* FIXME: "zapped by herself" is suitable for a rebound;
       "zapped at herself" would be better if player explicitly
       targeted hero */
    const kbuf = `${fltxt} ${verb} by ${uhim(state)}self`;
    /* Half_spell_damage protection yields half-damage for wands & spells,
       including hero's own ricochets; breath attacks do full damage */
    if (dam && Half_spell_damage(state) && abstyp < 20)
        dam = Math.trunc((dam + 1) / 2);
    return { dam, kbuf };
}

// C ref: zap.c zhitu() (4400-4591), the damage a bolt does to the hero, and
// the only caller of burnarmor() this port reaches.
//
// The ZT_FIRE arm (4421-4439) is ported whole, including both !rn2(3) guards:
// the first hands the pack to zap.c destroy_items() and the second to
// apply.c ignite_items(). So is the tail below it, through the
// losehp(dam, kbuf, KILLED_BY_AN) at 4588 that kills the hero this bolt was
// aimed back at.
//
// `dam` and `orig_dam` are separate in C because a fire-resistant hero takes
// no damage but still has the full roll fed to ugolemeffects() and to
// destroy_items(). Only the else at 4428-4431 is ported, where the two are
// equal.
async function zhitu(type, nd, fltxt, sx, sy, state, random) {
    let dam = 0;
    const abstyp = zaptype(type);
    let orig_dam = 0;

    // sx and sy are read by shieldeff() alone, and every arm that calls it
    // refuses above the call.
    void sx;
    void sy;

    switch (abstyp % 10) {
    case ZT_FIRE:
        orig_dam = random.d(nd, 6);
        if (Fire_resistance(state)) {
            // shieldeff() is a tmp_at() animation, monstseesu() the ledger of
            // what monsters noticed the hero shrug off, and ugolemeffects()
            // the iron golem that heals on fire. None is ported and no ported
            // hero resists fire.
            throw new UnsupportedZapError(
                "zhitu()'s fire-resistant hero, over ugolemeffects()",
            );
        }
        dam = orig_dam;
        monstunseesu(M_SEEN_FIRE, state);
        burn_away_slime(state);
        /* "body hit" */
        if (await burnarmor(state.youmonst, { state, random })) {
            if (!random.rn2(3))
                await destroy_items(state.youmonst, AD_FIRE, orig_dam,
                    { state, random });
            if (!random.rn2(3))
                await ignite_items(state.invent, { state, random });
        }
        break;

    default:
        throw new UnsupportedZapError(
            `zhitu() for damage type ${abstyp % 10}`,
        );
    }
    const killed = zhituLosehpArguments(type, abstyp, dam, fltxt, state);
    await losehp(killed.dam, killed.kbuf, KILLED_BY_AN, state);
}

// C ref: zap.c zap_over_floor() (5140-5497), "location", "damage type plus
// {wand|spell|breath} info", "extra output if shop door is destroyed",
// "ignore any monster here", and "supplied when breaking a wand; or POT_OIL
// when a lit potion of oil explodes". Returns the amount the bolt's remaining
// range changes by.
//
// dobuzz() calls this for every square the bolt crosses, walls included. On
// ordinary room floor with nothing on it, every arm below is skipped and the
// answer is 0, which is why a ray across a plain room draws nothing here.
//
// Each terrain the fire arm acts on stops by name instead: a web
// (delfloortrap()), ice (melt_ice()), water (create_gas_cloud() and the pit
// maketrap() leaves behind) and a fountain (dryup()). So do the two arms the
// other wand damage types reach, and the secret door, the closed door and the
// floor objects in the shared tail.
async function zap_over_floor(
    x, y,
    type,
    shopdamage,
    ignoremon,
    exploding_wand_typ,
    state = game,
    random = { rn2, rnd },
) {
    const lev = state.level.at(x, y);
    const rangemod = 0;
    const lavawall = lev.typ === LAVAWALL;
    const damgtype = zaptype(type) % 10;

    // 5157-5160's PHYS_EXPL_TYPE (hack.h:1470, -1) is explode.c's gas-spore
    // constant; ubuzz() cannot produce a negative type.
    if (exploding_wand_typ) {
        throw new UnsupportedZapError(
            'zap_over_floor() for a wand that broke or burning oil',
        );
    }

    switch (damgtype) {
    case ZT_FIRE: {
        const t = t_at(x, y, state);
        if (t && t.ttyp === WEB) {
            throw new UnsupportedZapError(
                'delfloortrap() for a web the bolt burns',
            );
        }
        if (is_ice(x, y, state)) {
            throw new UnsupportedZapError('melt_ice() under the bolt');
        } else if (is_pool(x, y, state)) {
            throw new UnsupportedZapError(
                'create_gas_cloud() over the water the bolt boils',
            );
        } else if (IS_FOUNTAIN(lev.typ)) {
            throw new UnsupportedZapError(
                'dryup() at the fountain the bolt boils',
            );
        }
        break; /* ZT_FIRE */
    }

    case ZT_COLD:
        if (is_pool(x, y, state) || is_lava(x, y, state) || lavawall) {
            throw new UnsupportedZapError(
                'start_melt_ice_timeout() for the water or lava a cold bolt '
                + 'freezes',
            );
        } else if (is_ice(x, y, state)) {
            throw new UnsupportedZapError(
                'start_melt_ice_timeout() firming up ice the cold bolt crossed',
            );
        }
        break; /* ZT_COLD */

    case ZT_POISON_GAS:
        // Unreachable from a wand: BZ_OFS_WAN() answers 0..5 for the six ray
        // wands and this arm needs 6. Dragon breath and an iron golem's are
        // what reach it, through buzz() and mcastu(), neither of them ported.
        throw new UnsupportedZapError(
            'create_gas_cloud() for a poison-gas zap',
        );

    case ZT_LIGHTNING:
        /* FALLTHRU */
    case ZT_ACID:
        if (lev.typ === IRONBARS) {
            throw new UnsupportedZapError(
                'dissolve_bars() for the iron bars the bolt melts',
            );
        }
        break; /* ZT_ACID */

    default:
        break;
    }

    // 5376-5395 builds `yourzap` and `zapverb` for the door feedback alone,
    // and both door arms below stop, so neither is computed here.

    /* secret door gets revealed, converted into regular door */
    if (lev.typ === SDOOR) {
        throw new UnsupportedZapError(
            'cvt_sdoor_to_door() for the secret door the bolt reveals',
        );
    }

    /* regular door absorbs remaining zap range, possibly gets destroyed */
    if (closed_door(x, y, state)) {
        throw new UnsupportedZapError(
            'add_damage() for the closed door that absorbs the bolt or burns '
            + 'away',
        );
    }

    if (OBJ_AT(x, y, state) && damgtype === ZT_FIRE) {
        await burn_floor_objects(x, y, false, type > 0, {
            state,
            random,
            // js/zap_destroy_items.js keeps the hero-caused half fail-closed,
            // because useupf() charges a shopkeeper for what it burns.
            unsupported: (reason) => {
                throw new UnsupportedZapError(
                    `burn_floor_objects() reached ${reason}`,
                );
            },
        });
    }
    if (!ignoremon && m_at(x, y, state)) {
        throw new UnsupportedZapError(
            'wakeup() for a monster the bolt passed over',
        );
    }
    return rangemod;
}

// C ref: zap.c dobuzz() (4779-5037). One `while (range-- > 0)` loop that walks
// the bolt square by square, painting a transient glyph, running the floor
// effect, and stopping range short by 2 for a hit and by 1 for a bounce.
//
// `sayhit` and `saymiss` "report out of sight hit/miss events" and belong to
// the monster arm; `forcemiss` is muse.c's. ubuzz() passes TRUE, FALSE, FALSE.
//
// The arms that stop, each before it changes state, draws or writes:
// u.uswallow (4802-4820), the whole `if (mon)` arm (4864-4956), u.usteed
// (4959-4961), Reflecting (4966-4976), flashburn() (4988-4989), Is_airlevel
// (5008-5013) and pay_for_damage() (5028-5035).
export async function dobuzz(
    type,               /* 0..29 (by hero) or -39..-10 (by monster) */
    nd,                 /* damage strength ('number of dice') */
    sx, sy,             /* starting point */
    dx, dy,             /* direction delta */
    sayhit, saymiss,    /* report out of sight hit/miss events */
    forcemiss,
    state = game,
    random = { d, rn1, rn2, rnd, rne, rnl },
) {
    const fltyp = zaptype(type);
    const damgtype = fltyp % 10;

    // ubuzz() is the only ported entry, so `type` is a hero wand zap. The
    // section header above records what that settles.
    if (type < 0 || type > 9) {
        throw new UnsupportedZapError(
            `dobuzz() for a spell, breath or monster zap of type ${type}`,
        );
    }
    if (Hallucination(state)) {
        // hdmgtype is `Hallucination ? rn2(6) : damgtype` at 4797, so a
        // hallucinating hero draws for the beam's colour before anything else
        // in the loop, and flash_str() then draws again for every message.
        throw new UnsupportedZapError(
            "rnd_hallublast() and the rn2(6) beam colour a hallucinating "
            + 'hero draws',
        );
    }
    const hdmgtype = damgtype;

    if (state.u.uswallow) {
        throw new UnsupportedZapError(
            "dobuzz()'s swallowed hero, over zhitm() on the engulfer",
        );
    }
    // 4821-4822's `if (type < 0) newsym(u.ux, u.uy)` is a monster zap's.
    let range = random.rn1(7, 7);
    if (dx === 0 && dy === 0)
        range = 1;
    state.gb ??= {};
    const save_bhitpos = state.gb.bhitpos;
    // C's `boolean shopdamage`, taken by address. Only the door arm of
    // zap_over_floor() raises it and that arm stops, so the tail below reads
    // it back false on every reachable path.
    const shopdamage = { value: false };

    await tmp_at(DISP_BEAM, zapdir_to_glyph(dx, dy, hdmgtype, state), state);
    while (range-- > 0) {
        const lsx = sx;
        sx += dx;
        const lsy = sy;
        sy += dy;
        let make_bounce = !isok(sx, sy) || state.level.at(sx, sy).typ === STONE;

        if (!make_bounce) {
            let mon = m_at(sx, sy, state);
            if (cansee(sx, sy, state)) {
                /* reveal/unreveal invisible monsters before tmp_at() */
                if (mon && !canSpotMonster(mon, state))
                    map_invisible(sx, sy, state);
                else if (!mon)
                    unmap_invisible(sx, sy, state);
                if (ZAP_POS(state.level.at(sx, sy).typ)
                    || (isok(lsx, lsy) && cansee(lsx, lsy, state)))
                    await tmp_at(sx, sy, state);
                await nh_delay_output(state); /* wait a little */
            }

            /* hit() and miss() need gb.bhitpos to match the target */
            state.gb.bhitpos = { x: sx, y: sy };
            range += await zap_over_floor(
                sx, sy, type, shopdamage, true, 0, state, random,
            );
            /* zap with fire -> melt ice -> drown monster, so monster
               found and cached above might not be here any more */
            mon = m_at(sx, sy, state);

            if (mon) {
                // 4864-4956: mstrategy, zap_hit(find_mac(mon)), mon_reflects(),
                // zhitm(), the Rider and PM_DEATH arms, disintegrate_mon(),
                // xkilled(), slept_monst() and wakeup(), plus the miss() at
                // 4954. None of it is ported.
                throw new UnsupportedZapError(
                    "dobuzz()'s monster arm, over zhitm()",
                );
            } else if (u_at(sx, sy, state) && range >= 0) {
                nomul(0, state);
                if (state.u.usteed) {
                    // 4959-4961 gives the steed a 1-in-3 chance of taking the
                    // bolt instead, through the same monster arm above.
                    throw new UnsupportedZapError(
                        "dobuzz()'s steed taking the bolt",
                    );
                } else if (!forcemiss
                           && zap_hit(Math.trunc(state.u.uac), 0, random)) {
                    range -= 2;
                    // C ref: pline.c pline_dir() (113-123) over set_msg_dir()
                    // (83-89): the message is placed at the square the bolt
                    // came from, which vpline() reads back only when
                    // a11y.accessiblemsg is set. messageAt() is this port's
                    // one owner of that prefix.
                    //
                    // A vertical bolt has dx == dy == 0, so xytodir() answers
                    // DIR_ERR and cmd.c dirtocoord() leaves its coord alone.
                    // vpline() zeroes a11y.msg_loc at the top of every message
                    // it prints, so the coord set_msg_dir() then adds u.ux and
                    // u.uy to is (0, 0) and the message lands on the hero's
                    // own square.
                    const from = dirtocoord(xytodir(-dx, -dy))
                        ?? { x: 0, y: 0 };
                    await ttyPline(
                        messageAt(
                            `${The(
                                flash_str(fltyp, false, state), state,
                            )} hits you!`,
                            state.u.ux + from.x, state.u.uy + from.y, state,
                        ),
                        state,
                    );
                    if (Reflecting(state)) {
                        throw new UnsupportedZapError(
                            'ureflects() for a hero the bolt bounces off',
                        );
                    } else {
                        /* flash_str here only used for killer; suppress
                         * hallucination */
                        await zhitu(
                            type, nd, flash_str(fltyp, true, state), sx, sy,
                            state, random,
                        );
                        monstunseesu(M_SEEN_REFL, state);
                    }
                } else if (!heroIsBlind(state)) {
                    await ttyPline(
                        `${The(flash_str(fltyp, false, state), state)} whizzes `
                        + 'by you!',
                        state,
                    );
                } else if (damgtype === ZT_LIGHTNING) {
                    await ttyPline(
                        `Your ${body_part(ARM, state.youmonst)} tingles.`,
                        state,
                    );
                }
                if (damgtype === ZT_LIGHTNING) {
                    throw new UnsupportedZapError(
                        'flashburn() for the lightning that blinds the hero',
                    );
                }
                await stop_occupation(state, { message: ttyPline });
                nomul(0, state);
            }
            // 5019-5022's deferred gas cloud needs gas_hit, which is false.

            if (!ZAP_POS(state.level.at(sx, sy).typ)
                || (closed_door(sx, sy, state) && range >= 0))
                make_bounce = true;
        }

        if (make_bounce) {
            const bchance = (!isok(sx, sy)
                             || state.level.at(sx, sy).typ === STONE) ? 10
                : (In_mines(state.u.uz)
                   && IS_WALL(state.level.at(sx, sy).typ)) ? 20
                    : 75;
            if (--range > 0 && isok(lsx, lsy) && cansee(lsx, lsy, state)) {
                if (Is_airlevel(state.u.uz)) { /* nothing to bounce off of */
                    throw new UnsupportedZapError(
                        "Is_airlevel()'s bolt vanishing into the aether",
                    );
                }
                await ttyPline(
                    `The ${flash_str(fltyp, false, state)} bounces!`, state,
                );
            }
            ({ dx, dy } = bounce_dir(
                sx, sy, dx, dy, bchance, state, random,
            ));
            await tmp_at(
                DISP_CHANGE, zapdir_to_glyph(dx, dy, hdmgtype, state), state,
            );
        }
    }
    await tmp_at(DISP_END, 0, state);
    if (shopdamage.value) {
        throw new UnsupportedZapError(
            'pay_for_damage() for the shop door the bolt destroyed',
        );
    }
    state.gb.bhitpos = save_bhitpos;
    void sayhit;
    void saymiss;
}

// C ref: zap.c ubuzz() (4758-4762). The hero's own ray, fired from their own
// square along u.dx/u.dy. buzz() beside it at 4764-4768 is the same call with
// an explicit origin, for the monsters and traps that fire one; none of its
// callers is ported, so it has no port here.
export async function ubuzz(
    type, nd, state = game, random = { d, rn1, rn2, rnd, rne, rnl },
) {
    return dobuzz(
        type, nd, state.u.ux, state.u.uy, state.u.dx, state.u.dy,
        true, false, false, state, random,
    );
}

// C ref: zap.c zapnodir() (2539-2596), restricted to the wand of secret door
// detection. Its findit() call is observable even when it finds nothing, so a
// seen wand goes through the shared discovery tail. Every other NODIR object
// retains the previous fail-closed boundary.
export async function zapnodir(obj, state = game) {
    let known = false;
    switch (obj.otyp) {
    case WAN_SECRET_DOOR_DETECTION:
        known = Boolean(obj.dknown);
        await findit(state);
        break;
    default:
        throw new UnsupportedZapError(
            'zapnodir() for a directionless wand',
        );
    }

    if (known) {
        if (!objectType(obj, state).oc_name_known)
            more_experienced(0, 10, state);
        learnwand(obj, state);
    }
}

// C ref: zap.c weffects() (3430-3476), "called for various wand and spell
// effects - M. Stephenson". dozap()'s final else is its ported caller, so
// `obj` is a wand the hero aimed or a wand with no direction at all.
//
// The ray arm at 3463-3465 and the secret-door-detection part of the NODIR arm
// run. `disclose` turns a ray wand into "a wand of fire" after its effect has
// been seen. zapnodir() owns the equivalent discovery tail for its wand.
//
// hack.h:1477 BZ_OFS_WAN(otyp) is `abs(otyp - WAN_MAGIC_MISSILE) % 10` and
// :1480 BZ_U_WAND(bztyp) is `0 + bztyp`, so the six ray wands become dobuzz()
// types 0..5 in the order objects.h:1488 lists them.
export async function weffects(
    obj, state = game, random = { d, rn1, rn2, rnd, rne, rnl },
) {
    const otyp = obj.otyp;
    let disclose = false;
    const was_unkn = !objectType(obj, state).oc_name_known;
    const oc_dir = objectType(obj, state).oc_dir;

    await exercise(A_WIS, true, state, random);
    if (state.u.usteed && oc_dir !== NODIR && !state.u.dx && !state.u.dy
        && state.u.dz > 0) {
        // zap_steed() lets a ridden steed take a downward zap. C's condition
        // ends in `&& zap_steed(obj)`, so the refusal stands one term short of
        // the call rather than inside it.
        throw new UnsupportedZapError(
            'zap_steed() for a downward zap while riding',
        );
    } else if (oc_dir === IMMEDIATE) {
        // zapsetup(), bhitm(), zap_updown() and bhit()'s ZAPPED_WAND call
        // type, plus zapwrapup()'s "You feel shuddering vibrations." Every one
        // of them belongs to the immediate wands rather than to the ray.
        throw new UnsupportedZapError(
            'zapsetup() and the immediate-wand arm of weffects()',
        );
    } else if (oc_dir === NODIR) {
        await zapnodir(obj, state);
    } else {
        /* neither immediate nor directionless */

        if (otyp === WAN_DIGGING || otyp === SPE_DIG) {
            throw new UnsupportedZapError('zap_dig()');
        } else if (otyp >= SPE_MAGIC_MISSILE && otyp <= SPE_FINGER_OF_DEATH) {
            // A cast ray takes the same dobuzz(), at BZ_U_SPELL() types 10..19
            // and u.ulevel / 2 + 1 dice. spell.c casting is unported.
            throw new UnsupportedZapError('ubuzz() for a spell the hero cast');
        } else if (otyp >= WAN_MAGIC_MISSILE && otyp <= WAN_LIGHTNING) {
            await ubuzz(
                Math.abs(otyp - WAN_MAGIC_MISSILE) % 10,
                (otyp === WAN_MAGIC_MISSILE) ? 2 : 6,
                state, random,
            );
        } else {
            // C's impossible("weffects: unexpected spell or wand"), for a
            // directional object that is neither a dig nor a ray.
            throw new UnsupportedZapError(
                `weffects() for unexpected object type ${otyp}`,
            );
        }
        disclose = true;
    }
    if (disclose) {
        learnwand(obj, state);
        if (was_unkn)
            more_experienced(0, 10, state);
    }
}
