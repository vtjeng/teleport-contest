// Monster-versus-monster attacks.
// C ref: mhitm.c -- noises(), pre_mm_attack(), missmm(), mattackm(),
// failed_grab(), hitmm(), mdamagem() and passivemm(). The unported neighbours
// are named where the arm that needs them refuses.

import {
    CONFLICT,
    DEAF,
    M_AP_TYPE,
    M_ATTK_AGR_DIED,
    M_ATTK_AGR_DONE,
    M_ATTK_DEF_DIED,
    M_ATTK_HIT,
    M_ATTK_MISS,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    NATTK,
    helpless,
} from './const.js';
import {
    capitalizedMonsterName,
    mon_nam_too,
    monsterPossessive,
} from './do_name.js';
import { game } from './gstate.js';
import { dist2, distmin } from './hacklib.js';
import { grow_up } from './makemon.js';
import { could_seduce, getmattk, mtrapped_in_pit } from './mhitu.js';
import { mon_offmap, monkilled, zombie_maker } from './mon.js';
import {
    is_elf,
    is_orc,
    mon_hates_silver,
    touch_petrifies,
    unsolid,
    zombie_form,
} from './mondata.js';
import { youHear } from './monmove.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import {
    AD_ACID,
    AD_DGST,
    AD_DRIN,
    AD_ENCH,
    AD_STCK,
    AD_WRAP,
    AT_BITE,
    AT_BREA,
    AT_BUTT,
    AT_CLAW,
    AT_ENGL,
    AT_EXPL,
    AT_GAZE,
    AT_HUGS,
    AT_KICK,
    AT_NONE,
    AT_SPIT,
    AT_STNG,
    AT_TENT,
    AT_TUCH,
    AT_WEAP,
    AD_COLD,
    AD_ELEC,
    AD_FIRE,
    AD_PLYS,
    AD_STUN,
    NON_PM,
    PM_GRID_BUG,
    PM_MEDUSA,
    S_TROLL,
} from './monsters.js';
import { ART_TROLLSBANE } from './artifacts.js';
import { objectType } from './obj.js';
import { SILVER } from './objects.js';
import { d, rn2, rnd } from './rng.js';
import { canSpotMonster } from './startup_a11y.js';
import { mhitm_adtyping, mhitm_knockback, shade_miss } from './uhitm.js';
import { cansee } from './vision.js';
import { possibly_unwield } from './weapon.js';
import { find_mac } from './worn.js';

// The operations mhitm.c reaches that this file cannot import: the caller owns
// the terminal and the fail-closed boundary its own segment stops on.
function requireAttackOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`mattackm requires a ${name} operation`);
    return operation;
}

function attackEnv(rawEnv) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { d, rn2, rnd };
    for (const name of ['d', 'rn2', 'rnd']) {
        if (typeof random[name] !== 'function')
            throw new TypeError(`mattackm random injection requires ${name}`);
    }
    return { ...rawEnv, state, random };
}

// C ref: youprop.h:218 Conflict, `(HConflict || EConflict)`, over the hero's
// CONFLICT property. Two disjuncts and no blocking term: youprop.h gives a
// `blocked` alias to BLINDED, CLAIRVOYANT, INVIS, STEALTH, LEVITATION and
// FLYING alone, so no C path sets it for CONFLICT. mhitm.c reads Conflict
// once, in the cockatrice-instinct test at 436.
function Conflict(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic);
}

// C ref: youprop.h:125 Deaf, `HDeaf || EDeaf || u.uroleplay.deaf`. Three
// disjuncts and no blocking term: the third is the deaf conduct, which only
// `OPTIONS=roleplay:deaf` sets and nothing clears. js/dothrow.js, js/sit.js
// and js/sounds.js each keep their own copy of this one-line macro beside the
// call that reads it, as C does.
function Deaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(deafness?.intrinsic || deafness?.extrinsic
        || state.u?.uroleplay?.deaf);
}

// C ref: mhitm.c noises() (26-38). What the hero hears when a fight he cannot
// see happens near enough. gf.far_noise and gn.noisetime rate-limit the line
// to one per ten moves at each distance band; decl.c starts the first at FALSE
// and the second at 0, and neither appears in save.c, so they live on the game
// state rather than in `input.storage`, as js/mhitu.js's `gh` pair does.
//
// The two gates are separate. This one asks whether the hero is deaf and, when
// he is not, spends the rate limit; You_hear() then decides independently
// whether the line reaches the screen and how it is worded. A run that fails
// only the second still writes both fields, as C does.
async function noises(magr, mattk, env) {
    const { state } = env;
    const message = requireAttackOperation(env, 'message');
    /* hack.h mdistu(): distu() applied to the monster's own square */
    const farq = dist2(magr.mx, magr.my, state.u.ux, state.u.uy) > 15;

    state.gf ??= {};
    /* decl.c:341 starts gf.far_noise at FALSE, and :555 gn.noisetime at 0.
       Without the first default the comparison below is against undefined,
       which neither distance band equals, so the near band would speak on the
       first unseen fight of a game where C stays quiet. */
    state.gf.far_noise ??= false;
    state.gn ??= {};
    state.gn.noisetime ??= 0;
    if (!Deaf(state)
        && (farq !== state.gf.far_noise
            || state.moves - state.gn.noisetime > 10)) {
        state.gf.far_noise = farq;
        state.gn.noisetime = state.moves;
        /* pline.c You_hear() owns the acoustics gate and the Underwater and
           Unaware prefixes, and C reaches all three from here. */
        const heard = youHear(
            `${mattk.aatyp === AT_EXPL ? 'an explosion' : 'some noises'}`
            + `${farq ? ' in the distance' : ''}.`,
            state,
        );
        if (heard) await message(heard, state);
    }
}

// C ref: mhitm.c pre_mm_attack() (40-73). "unhiding or unmimicking happens
// even if hero can't see it because the formerly concealed monster is now in
// action".
//
// Two arms refuse. A mimic on either side needs mon.c seemimic(), which writes
// to the map and prints nothing, so the stop sits exactly where C's branch
// begins.
//
// Both mundetected clears are ported, and only the aggressor's runs. A hidden
// defender stops mattackm() at its own :337-359 block, well above the call
// that arrives here, so `mdef.mundetected` is 0 on every path that reaches
// this function. The clear is written because C writes it.
//
// The marker write goes through the `markInvisible` seam for the same reason
// `redraw` does. Both write the live map: newsym() paints the module-global
// game, and display.c map_invisible() writes map memory and then paints
// through show_glyph_cell(), which reads that same global. The once-per-turn
// planning scan reaches this function -- js/unported_monster_actions.js
// preflightSimpleMonsterActions() runs moveSimplePet() with `planning: true`,
// and a pet's blow arrives here through dogmove.c dog_move() -- and its clone
// shares the live level's cells, so a dry run marking a square would leave a
// remembered 'I' and a painted cell behind in a game the scan may still refuse.
// The scan binds both seams to no-ops and replays the turn live afterwards.
function pre_mm_attack(magr, mdef, env) {
    const { state } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');
    const redraw = requireAttackOperation(env, 'redraw');
    const markInvisible = requireAttackOperation(env, 'markInvisible');
    let showit = false;

    if (M_AP_TYPE(mdef)) {
        unsupported('a disguised monster being attacked');
    } else if (mdef.mundetected) {
        mdef.mundetected = 0;
        showit ||= state.gv.vis;
    }
    if (M_AP_TYPE(magr)) {
        unsupported('a disguised monster attacking');
    } else if (magr.mundetected) {
        magr.mundetected = 0;
        showit ||= state.gv.vis;
    }

    if (state.gv.vis) {
        // C's `if/else if` per participant: a marker write and a redraw are
        // mutually exclusive, so a monster the hero cannot spot is marked and
        // not redrawn even when showit is set.
        if (!canSpotMonster(magr, state))
            markInvisible(magr.mx, magr.my);
        else if (showit) redraw(magr.mx, magr.my);
        if (!canSpotMonster(mdef, state))
            markInvisible(mdef.mx, mdef.my);
        else if (showit) redraw(mdef.mx, mdef.my);
    }
}

// C ref: mhitm.c missmm() (74-93). "feedback for when a monster-vs-monster
// attack misses".
//
// could_seduce() answers 0 for every aggressor this port admits and refuses
// for the rest (js/mhitu.js could_seduce()), so the verb is always "misses"
// and the "pretends to be friendly to" arm has no reachable caller. C's whole
// expression is kept so the call happens where C makes it.
async function missmm(magr, mdef, mattk, env) {
    const { state } = env;
    const message = requireAttackOperation(env, 'message');

    pre_mm_attack(magr, mdef, env);

    if (state.gv.vis) {
        await message(
            `${capitalizedMonsterName(magr, state)} `
            + `${(magr.mcan || !could_seduce(magr, mdef, mattk, env))
                ? 'misses' : 'pretends to be friendly to'} `
            + `${mon_nam_too(mdef, magr, state, env)}.`,
            state,
        );
    } else {
        await noises(magr, mattk, env);
    }
}

/*
 *  mattackm() -- a monster attacks another monster.
 *
 *  Returns the same bitmask C documents at mhitm.c:274-283:
 *      0x4 M_ATTK_AGR_DIED, 0x2 M_ATTK_DEF_DIED, 0x1 M_ATTK_HIT,
 *      0x0 M_ATTK_MISS.
 *
 *  Attacker has targeted <bhitpos.x,bhitpos.y> rather than
 *  <mdef->mx,mdef->my>; matters for long worms.
 */
// C ref: mhitm.c mattackm() (292-577).
//
// The physical melee group is ported: AT_CLAW, AT_KICK, AT_BITE, AT_STNG,
// AT_TUCH, AT_BUTT and AT_TENT, with their dieroll = rnd(20 + i), hitmm(),
// missmm() and the passivemm() that follows every one of them. So is the
// `default` arm, which is where an empty AT_NONE slot lands and where C
// clears `attk` so passivemm() is skipped.
//
// Six arms refuse, each at the `case` label so the stop sits where C's branch
// begins:
//
//   AT_WEAP  the adjacent empty-handed arm ports mon_wield_item()'s zero-result
//            path and possibly_unwield()'s null-MON_WEP return before falling
//            through to the physical group below it. The distant half still
//            needs mthrowu.c thrwmm(), and a selected/current weapon still
//            needs mswingsm() and hitval().
//   AT_HUGS  both of the functions this arm calls, failed_grab() and hitmm(),
//            are in this file. It stops because no species this port places
//            as a pet carries the attack, so porting the arm would add code
//            no game runs.
//   AT_GAZE  gazemm().
//   AT_EXPL  explmm().
//   AT_ENGL  gulpmm().
//   AT_BREA and AT_SPIT  breamm() and spitmm().
//
// `strike` is C's, declared once above the loop and never re-initialized
// inside it, and every arm that reaches passivemm() assigns it in the same
// iteration. A `continue` cannot carry the previous slot's answer down,
// because it skips the passivemm() call at the foot of the loop, and C's
// AT_HUGS arm assigns `strike` before it tests it. The declaration stays where
// C puts it rather than moving inside the loop.
export async function mattackm(magr, mdef, rawEnv = {}) {
    const env = attackEnv(rawEnv);
    const { state, random } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');
    let strike = 0; /* hit this attack */
    let struck = 0; /* hit at least once */
    const res = new Array(NATTK).fill(M_ATTK_MISS);
    let dieroll = 0;

    if (!magr || !mdef) return M_ATTK_MISS; /* mike@genat */
    if (helpless(magr)) return M_ATTK_MISS;
    const pa = magr.data;
    const pd = mdef.data;

    /* Grid bugs cannot attack at an angle. */
    if (pa === state.mons[PM_GRID_BUG] && magr.mx !== mdef.mx
        && magr.my !== mdef.my)
        return M_ATTK_MISS;

    /* Calculate the armour class differential. */
    let tmp = find_mac(mdef, state) + magr.m_lev;
    if (mdef.mconf || helpless(mdef)) {
        tmp += 4;
        mdef.msleeping = 0;
    }

    /* mundetected monsters become un-hidden if they are attacked */
    if (mdef.mundetected) {
        // C clears the flag, repaints and may print one of four lines through
        // noname_monnam(), makeplural(), a_monnam() or mon_nam(). Every one
        // needs display.c sensemon(), which has no port, and the fourth also
        // needs gl.last_hider, which nothing here writes.
        unsupported('a hidden monster noticed as it is attacked');
    }

    /* Elves hate orcs. */
    if (is_elf(pa) && is_orc(pd)) tmp++;

    /* Set up the visibility of action */
    state.gv ??= {};
    state.gv.vis = (cansee(magr.mx, magr.my, state) && canSpotMonster(magr, state))
        || (cansee(mdef.mx, mdef.my, state) && canSpotMonster(mdef, state));

    /* Set flag indicating monster has moved this turn. */
    magr.mlstmv = state.moves;

    /* controls whether a mind flayer uses all of its tentacle-for-DRIN
       attacks */
    state.gs ??= {};
    state.gs.skipdrin = false;

    /* Now perform all attacks for the monster. */
    for (let i = 0; i < NATTK; i++) {
        res[i] = M_ATTK_MISS;

        /* target might no longer be there */
        if (i > 0 && (m_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state) !== mdef
                      || magr.mhp < 1 || mdef.mhp < 1))
            continue;

        const mattk = getmattk(magr, mdef, i, res, env);
        if (state.gs.skipdrin && mattk.aatyp === AT_TENT
            && mattk.adtyp === AD_DRIN)
            continue;
        let mwep = null; /* MON_WEP() is read only under AT_WEAP */
        let attk = 1;

        switch (mattk.aatyp) {
        case AT_WEAP: /* "hand to hand" attacks */
            if (distmin(magr.mx, magr.my, mdef.mx, mdef.my) > 1)
                unsupported('an armed monster attacking another monster');
            if (magr.weapon_check === NEED_WEAPON || !magr.mw) {
                magr.weapon_check = NEED_HTH_WEAPON;
                const wieldMonsterItem = requireAttackOperation(
                    env,
                    'wieldMonsterItemAgainstMonster',
                );
                if (await wieldMonsterItem(magr, env) !== 0)
                    return M_ATTK_MISS;
            }
            // weapon.c mon_wield_item() returns 0 for the goblin's empty
            // inventory after setting NEED_WEAPON. C then calls
            // possibly_unwield() even though MON_WEP() is null; that is an
            // intentional no-op and the AT_WEAP arm falls through.
            possibly_unwield(magr, false, env);
            mwep = magr.mw ?? null;
            if (mwep)
                unsupported('an armed monster attacking another monster');
            /* FALLTHRU: C's empty-handed AT_WEAP arm joins the physical group. */

        case AT_CLAW:
        case AT_KICK:
        case AT_BITE:
        case AT_STNG:
        case AT_TUCH:
        case AT_BUTT:
        case AT_TENT:
            if (mattk.aatyp === AT_KICK && mtrapped_in_pit(magr, state))
                continue;
            /* Nymph that teleported away on first attack? */
            if (distmin(magr.mx, magr.my, mdef.mx, mdef.my) > 1)
                /* Continue because the monster may have a ranged attack. */
                continue;
            /* Monsters won't attack cockatrices physically if they
             * have a weapon instead. This instinct doesn't work for
             * players, or under conflict or confusion. */
            // `mwep` is null on every path this arm admits, so the whole
            // condition is FALSE and no test can separate its operators. It
            // is translated rather than dropped because the AT_WEAP arm that
            // supplies a weapon is a refusal rather than a gap.
            if (!magr.mconf && !Conflict(state) && mwep
                && mattk.aatyp !== AT_WEAP && touch_petrifies(mdef.data)) {
                strike = 0;
                break;
            }
            dieroll = random.rnd(20 + i);
            strike = (tmp > dieroll) ? 1 : 0;
            /* KMH -- don't accumulate to-hit bonuses */
            /* C's `if (mwep) tmp -= hitval(mwep, mdef);` needs a weapon this
               arm cannot have: only AT_WEAP sets mwep, and that case refuses
               above. */
            if (strike) {
                /* for eel AT_TUCH+AD_WRAP attack: can't grab an unsolid
                   target; the unsolid test is redundant since failed_grab
                   checks it too, but is cheap and avoids calling failed_grab
                   for ordinary targets */
                if (unsolid(mdef.data)
                    && failed_grab(magr, mdef, mattk, env)) {
                    strike = 0;
                    break;
                }
                res[i] = await hitmm(magr, mdef, mattk, mwep, dieroll, env);
                /* C's pudding-splitting block at 447-464 asks next whether
                   `mwep` is iron or metal. That conjunct is FALSE for every
                   attack this arm admits, because only the refused AT_WEAP
                   case can set a weapon, so clone_mon() is unreachable. */
            } else {
                await missmm(magr, mdef, mattk, env);
            }
            break;

        case AT_HUGS: /* automatic if prev two attacks succeed */
            unsupported('a monster crushing another monster');
            break;

        case AT_GAZE:
            unsupported('a monster gazing at another monster');
            break;

        case AT_EXPL:
            unsupported('a monster exploding at another monster');
            break;

        case AT_ENGL:
            unsupported('a monster engulfing another monster');
            break;

        case AT_BREA:
        case AT_SPIT:
            unsupported('a monster breathing or spitting at another monster');
            break;

        default: /* no attack */
            strike = 0;
            attk = 0;
            break;
        }

        if (attk && !(res[i] & M_ATTK_AGR_DIED)
            && distmin(magr.mx, magr.my, mdef.mx, mdef.my) <= 1) {
            res[i] = await passivemm(magr, mdef, Boolean(strike),
                                     (res[i] & M_ATTK_DEF_DIED), mwep, env);
        }

        if (res[i] & M_ATTK_DEF_DIED) return res[i];
        if (res[i] & M_ATTK_AGR_DIED) return res[i];
        /* return if aggressor can no longer attack */
        if ((res[i] & M_ATTK_AGR_DONE) || helpless(magr)) return res[i];
        /* eg. defender was knocked into a level teleport trap */
        if (mon_offmap(mdef)) return res[i];
        if (res[i] & M_ATTK_HIT) struck = 1; /* at least one hit */
    } /* for (;i < NATTK;) loop */

    return struck ? M_ATTK_HIT : M_ATTK_MISS;
}

// C ref: mhitm.c failed_grab() (594-640). "can't hold an unsolid target
// (ghosts, lights, vortices, most elementals) or a long worm tail".
//
// The head is the whole answer for every attack mattackm()'s physical group
// admits. None of them is AT_HUGS, and every melee slot a pet carries is
// AD_PHYS, so the second conjunct is FALSE and an ordinary bite or claw on a
// fog cloud, a vortex or a will-o-the-wisp lands like any other.
//
// The TRUE arm refuses. Its line needs do_name.c s_suffix(), mon_nam() and
// some_mon_nam(), and it prints for a mon-vs-mon grab only while the hero can
// spot the defender; the refusal sits above that test rather than inside it,
// so the stop does not depend on what the hero can see. Every attack that
// reaches it belongs to a mattackm() arm that refuses anyway -- AT_HUGS and
// AT_ENGL -- or to an eel, trapper, mimic or purple worm aggressor, none of
// which this port places as a pet.
//
// The gn.notonhead disjunct is unreachable from mattackm(), which
// short-circuits on its own unsolid() test before calling here. C's comment
// there calls that test redundant, which holds for the first disjunct alone: a
// holding attack that landed on a solid long worm's tail never asks this
// function. The disjunct is written because C writes it.
//
// C declares this one non-static for mhitu.c:808, :827 and :1305 and
// uhitm.c:5652, :5735 and :5779. All six are unported, so it stays
// module-local until one of them arrives.
function failed_grab(magr, mdef, mattk, env) {
    const { state } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');

    if ((unsolid(mdef.data) || Boolean(state.gn?.notonhead))
        /* hug attack: most holders (owlbear, python, pit fiend, &c);
           wrap damage: eel grabbing, trapper/lurker-above engulfing;
           stick-to damage: mimic, lichen;
           digestion damage: purple worm swallowing */
        && (mattk.aatyp === AT_HUGS || mattk.adtyp === AD_WRAP
            || mattk.adtyp === AD_STCK || mattk.adtyp === AD_DGST)) {
        unsupported('a grab that passes through its target');
        return true;
    }
    return false;
}

// C ref: mhitm.c hitmm() (642-731). "Returns the result of mdamagem()."
//
// `weaponhit` and `silverhit` are C's, and both need a weapon: an AT_WEAP
// attack, which mattackm() refuses, or an AT_CLAW attacker holding one, which
// only that refused arm can set. They stay because the "%s hits" default arm
// reads `weaponhit` and would print nothing for an artifact.
async function hitmm(magr, mdef, mattk, mwep, dieroll, env) {
    const { state } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');
    const message = requireAttackOperation(env, 'message');
    // Both need a weapon, which only the refused AT_WEAP arm can supply, so
    // both are constantly FALSE here: `weaponhit` selects the "%s hits"
    // default arm below and `silverhit` keeps the searing line out of reach.
    const weaponhit = mattk.aatyp === AT_WEAP
        || (mattk.aatyp === AT_CLAW && mwep);
    const silverhit = weaponhit && mwep
        && objectType(mwep, state).oc_material === SILVER;

    pre_mm_attack(magr, mdef, env);

    const compat = !magr.mcan ? could_seduce(magr, mdef, mattk, env) : 0;
    if (!compat && shade_miss(magr, mdef, mwep, false, state.gv.vis,
                              state, env))
        return M_ATTK_MISS; /* bypass mdamagem() */

    if (state.gv.vis) {
        const magr_name = capitalizedMonsterName(magr, state);
        let buf = '';

        if (compat) {
            // C prints "%s smiles at %s seductively" here. could_seduce()
            // refuses before it can answer nonzero, so this is where a
            // completed could_seduce() would first need the line.
            unsupported('a seductive monster attack');
        } else {
            switch (mattk.aatyp) {
            case AT_BITE: buf = `${magr_name} bites`; break;
            case AT_STNG: buf = `${magr_name} stings`; break;
            case AT_BUTT: buf = `${magr_name} butts`; break;
            case AT_TUCH: buf = `${magr_name} touches`; break;
            case AT_TENT:
                buf = `${monsterPossessive(magr, state, true)} tentacles suck`;
                break;
            case AT_HUGS:
                if (magr !== state.u.ustuck) {
                    buf = `${magr_name} squeezes`;
                    break;
                }
                /* FALLTHRU */
            default:
                if (!weaponhit || !mwep || !mwep.oartifact)
                    buf = `${magr_name} hits`;
                break;
            }
            if (buf) {
                await message(
                    `${buf} ${mon_nam_too(mdef, magr, state, env)}.`,
                    state,
                );
            }

            if (mon_hates_silver(mdef) && silverhit) {
                // C's "%s %s sears %s!" needs objnam.c simpleonames() and the
                // "its own flesh" substitutions. Only a silver weapon reaches
                // it, and the AT_WEAP arm refuses ahead of that.
                unsupported('a silver weapon searing another monster');
            }
        }
    } else {
        await noises(magr, mattk, env);
    }

    return mdamagem(magr, mdef, mattk, mwep, dieroll, env);
}

// C ref: mhitm.c mdamagem() (1014-1120). One landed blow's damage, the death
// it may cause, and the experience the killer earns for it.
//
// Partial: what an AD_PHYS attack reaches. Two arms refuse:
//
//   1031-1057  the petrification pre-check, for an attacker that bites a
//              cockatrice or digests Medusa. It needs mondata.c resists_ston(),
//              polymon.c mon_to_stone() and mon.c monstone().
//   1093-1108  the AD_DGST tail: newcham(), healmon() and mon_givit() after a
//              digesting attack.
//
// Two blocks are ported although no melee blow can make either do anything,
// because both are cheap and stopping on them would end a segment C plays
// through. gm.mkcorpstat_norevive at 1080-1081 is written for AT_WEAP and
// AT_CLAW alone, and its only setter here, monst.h troll_baned(), needs the
// wielded Trollsbane that mattackm()'s refused AT_WEAP arm would have to
// supply; js/corpstat.js mkcorpstat() is its only reader. The gulpmm() square
// swap at 1073-1078 tests whether the defender stands on the aggressor's
// square, which no melee blow arranges.
async function mdamagem(magr, mdef, mattk, mwep, dieroll, env) {
    const { state, random } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');
    const pd = mdef.data;
    const mhm = {
        damage: random.d(mattk.damn, mattk.damd),
        hitflags: M_ATTK_MISS,
        permdmg: 0,
        specialdmg: 0,
        dieroll,
        done: false,
    };

    if (touch_petrifies(pd)
        || (mattk.adtyp === AD_DGST && pd === state.mons[PM_MEDUSA])) {
        // C tests !resists_ston(magr) next and, when the attacker's gloves or
        // wielded weapon do not cover the attack, turns it to stone.
        unsupported('an attack on a petrifying monster');
    }

    await mhitm_adtyping(magr, mattk, mdef, mhm, state, env);

    if (mhitm_knockback(magr, mdef, mattk, Boolean(magr.mw), state, env, random)
        && ((mhm.hitflags & (M_ATTK_DEF_DIED | M_ATTK_HIT)) !== 0
            || mon_offmap(mdef)))
        return mhm.hitflags;

    if (mhm.done) return mhm.hitflags;

    if (!mhm.damage) return mhm.hitflags;

    mdef.mhp -= mhm.damage;
    if (mdef.mhp < 1) {
        if (m_at(mdef.mx, mdef.my, state) === magr) { /* see gulpmm() */
            remove_monster(mdef.mx, mdef.my, state);
            mdef.mhp = 1; /* otherwise place_monster will complain */
            place_monster(mdef, mdef.mx, mdef.my, state);
            mdef.mhp = 0;
        }
        if (mattk.aatyp === AT_WEAP || mattk.aatyp === AT_CLAW) {
            /* monst.h troll_baned() (246-247): only Trollsbane sets the
               flag, and the AT_WEAP arm of mattackm() refuses before an
               armed attacker can arrive here. */
            state.gm ??= {};
            state.gm.mkcorpstat_norevive = mdef.data.mlet === S_TROLL && mwep
                && mwep.oartifact === ART_TROLLSBANE;
        }
        state.gz ??= {};
        state.gz.zombify = !mwep && zombie_maker(magr)
            && (mattk.aatyp === AT_TUCH
                || mattk.aatyp === AT_CLAW
                || mattk.aatyp === AT_BITE)
            && zombie_form(mdef.data) !== NON_PM;
        await monkilled(mdef, '', mattk.adtyp, state, env);
        state.gz.zombify = false; /* reset */
        state.gm ??= {};
        state.gm.mkcorpstat_norevive = false;
        if (mdef.mhp >= 1) return mhm.hitflags; /* mdef lifesaved */
        if (mhm.hitflags === M_ATTK_AGR_DIED)
            return M_ATTK_DEF_DIED | M_ATTK_AGR_DIED;

        if (mattk.adtyp === AD_DGST) {
            /* various checks similar to dog_eat and meatobj */
            unsupported('a monster digesting the monster it killed');
        }

        return M_ATTK_DEF_DIED
            | (grow_up(magr, mdef, env) ? 0 : M_ATTK_AGR_DIED);
    }
    return (mhm.hitflags === M_ATTK_AGR_DIED) ? M_ATTK_AGR_DIED : M_ATTK_HIT;
}

// C ref: mhitm.c passivemm() (1301-1408). "Passive responses by defenders.
// Does not replicate responses already handled above. Returns same values as
// mattackm."
//
// `i` lands on the defender's first empty attack slot, whose damage dice
// decide `tmp` and whose damage type selects the arms below. A species whose
// attack list is full has no such slot and returns at 1315-1316.
//
// AD_PHYS is the empty slot's own damage type and takes the default arm of
// both switches, so an ordinary defender's whole live contribution is the
// rn2(3) that guards the second switch, and only while it is alive.
//
// AD_ENCH is the one other damage type this port follows. Its whole body is a
// drain_item() call C guards on the aggressor's wielded weapon, which no path
// mattackm() admits can supply, so the arm is a no-op and stopping on it would
// cost a segment for nothing. The rest refuse: AD_ACID in the first switch
// (1330-1348) needs erode_armor() and acid_damage(), and the second switch
// (1362-1443) needs mon_reflects(), paralyze_monst(), golemeffects(),
// healmon() and split_mon().
async function passivemm(magr, mdef, mhitb, mdead, mwep, env) {
    const { state, random } = env;
    const unsupported = requireAttackOperation(env, 'unsupported');
    const mddat = mdef.data;
    let i;
    let tmp;
    const mhit = mhitb ? M_ATTK_HIT : M_ATTK_MISS;

    for (i = 0; ; i++) {
        if (i >= NATTK)
            return mdead | mhit; /* no passive attacks */
        if (mddat.mattk[i].aatyp === AT_NONE) break;
    }
    if (mddat.mattk[i].damn)
        tmp = random.d(mddat.mattk[i].damn, mddat.mattk[i].damd);
    else if (mddat.mattk[i].damd)
        tmp = random.d(mddat.mlevel + 1, mddat.mattk[i].damd);
    else
        tmp = 0;

    /* These affect the enemy even if defender killed */
    switch (mddat.mattk[i].adtyp) {
    case AD_ACID:
        unsupported('an acid splash from the monster attacked');
        break;
    case AD_ENCH: /* KMH -- remove enchantment (disenchanter) */
        // C's body is one drain_item(mwep, FALSE) with its own "No message"
        // comment, so the arm changes nothing else and never draws. `mwep` is
        // null on every path mattackm() admits -- only the refused AT_WEAP
        // case sets one -- so the body is unreachable and a pet clawing a
        // disenchanter passes straight through this arm, as C does.
        if (mhitb && !mdef.mcan && mwep) {
            unsupported('a disenchanting monster draining a wielded weapon');
        }
        break;
    default:
        break;
    }
    if (mdead || mdef.mcan) return mdead | mhit;

    /* These affect the enemy only if defender is still alive */
    if (random.rn2(3)) {
        switch (mddat.mattk[i].adtyp) {
        case AD_PLYS: /* Floating eye */
            unsupported("a paralyzing monster's passive attack");
            break;
        case AD_COLD:
            unsupported("a cold monster's passive attack");
            break;
        case AD_STUN:
            unsupported("a stunning monster's passive attack");
            break;
        case AD_FIRE:
            unsupported("a fiery monster's passive attack");
            break;
        case AD_ELEC:
            unsupported("a shocking monster's passive attack");
            break;
        default:
            tmp = 0;
            break;
        }
    } else {
        tmp = 0;
    }

    /* assess_dmg: */
    magr.mhp -= tmp;
    if (magr.mhp <= 0) {
        await monkilled(magr, '', mddat.mattk[i].adtyp, state, env);
        return mdead | mhit | M_ATTK_AGR_DIED;
    }
    return mdead | mhit;
}
