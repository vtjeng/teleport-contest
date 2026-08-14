// mhitu.js -- Monsters attacking the hero.
// C ref: mhitu.c -- missmu(), mswings_verb(), mswings(), getmattk(),
// calc_mattacku_vars(), mtrapped_in_pit(), mattacku(), magic_negation() and
// could_seduce().

import {
    BLINDED,
    CONFLICT,
    INVIS,
    M_AP_NOTHING,
    M_AP_OBJECT,
    M_AP_TYPE,
    M_ATTK_MISS,
    NATTK,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    PROTECTION,
    P_WHIP,
    TT_PIT,
    W_AMUL,
    W_ARMOR,
    is_pit,
    u_at,
} from './const.js';
import { ART_SNICKERSNEE } from './artifacts.js';
import { bot, newsym } from './display.js';
import { capitalizedMonsterName } from './do_name.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { dist2 } from './hacklib.js';
import { is_home_elemental } from './makemon.js';
import {
    is_animal,
    is_demon,
    is_minion,
    is_orc,
    is_were,
    mhis,
    perceives,
    thick_skinned,
    touch_petrifies,
    unsolid,
} from './mondata.js';
import { monnear } from './monmove.js';
import * as M from './monsters.js';
import { find_offensive } from './muse.js';
import { is_wet_towel, objectType } from './obj.js';
import {
    AMULET_OF_GUARDING,
    PIERCE,
    getObjects,
} from './objects.js';
import { xnameFresh } from './objnam.js';
import { rn2 } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    monsterVisible,
} from './startup_a11y.js';
import { t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { cansee } from './vision.js';
import { hitval } from './weapon.js';
import { is_pole } from './worn.js';

function requireMattackuOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`mattacku requires a ${name} operation`);
    return operation;
}

// youprop.h:92-103 and :198. Both properties are intrinsic-or-extrinsic and
// both are defeated by an artifact block.
function activeHeroProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean((value?.intrinsic || value?.extrinsic) && !value?.blocked);
}

// C ref: hack.h distu() and mdistu(). mdistu() is distu() applied to a
// monster's own square, with no long-worm handling of its own.
function mdistu(monster, state) {
    return dist2(monster.mx, monster.my, state.u.ux, state.u.uy);
}

// C ref: you.h m_next2u(), `distu((m)->mx, (m)->my) <= 2`. dist2() is a
// squared distance, so it never equals 3 and this is the same set of squares
// as mattacku()'s `!ranged`.
function m_next2u(monster, state) {
    return mdistu(monster, state) <= 2;
}

// C ref: mhitu.c could_seduce() (1933-1984). "returns 0 if seduction
// impossible, 1 if fine, 2 if wrong gender for nymph".
//
// Partial: it covers every aggressor whose species fails the S_NYMPH /
// PM_AMOROUS_DEMON test at :1976, which is the whole answer for all of them
// and is 0. An aggressor that passes it refuses, because the rest of the
// function needs polyself.c poly_gender(), sysopt.seduce and the AD_SSEX /
// AD_SEDU / AD_SITM damage types, none of which is ported. The three tests C
// runs before :1976 can also answer 0 for a nymph, so the refusal is narrower
// than C's TRUE, never wider.
export function could_seduce(magr, mdef, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');

    if (is_animal(magr.data)) return 0;
    /* nymphs have two attacks, one for steal-item damage and the other
       for seduction, both pass the could_seduce() test;
       incubi/succubi have three attacks, their claw attacks for damage
       don't pass the test */
    const pagr = magr.data;
    if (pagr.mlet === M.S_NYMPH
        || pagr === state.mons?.[M.PM_AMOROUS_DEMON]) {
        unsupported('a seductive monster attack');
    }
    return 0;
}

// C ref: mhitu.c missmu() (84-100). "monster missed you".
//
// C opens with map_invisible() for a monster the hero cannot spot. That
// function is unported (js/display.js:1778 documents the gap), and the name
// this prints would be "it" for the same monster, which
// capitalizedMonsterName() cannot spell either, so the pair refuses together.
//
// gh.hitmsg_mid and gh.hitmsg_prev, which C clears here, are hitmsg()'s
// "<foo> bites again" state. hitmsg() runs only for a landed hit, which
// refuses, so neither has a ported reader yet.
async function missmu(mtmp, nearmiss, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');
    const message = requireMattackuOperation(rawEnv, 'message');
    const stopOccupation = requireMattackuOperation(rawEnv, 'stopOccupation');
    const spotMonster = rawEnv.canSpotMonster ?? canSpotMonster;

    if (!spotMonster(mtmp, state))
        unsupported('a miss by a monster the hero cannot spot');
    if (mtmp.minvis)
        unsupported('a miss by an invisible monster the hero can see');

    if (could_seduce(mtmp, state.youmonst, mattk, rawEnv) && !mtmp.mcan) {
        await message(
            `${capitalizedMonsterName(mtmp, state)} pretends to be friendly.`,
            state,
        );
    } else {
        await message(
            `${capitalizedMonsterName(mtmp, state)} `
            + `${(nearmiss && state.flags?.verbose) ? 'just ' : ''}misses!`,
            state,
        );
    }

    await stopOccupation(rawEnv);
}

// C ref: mhitu.c mswings_verb() (104-126). "strike types P|S|B: Pierce
// (pointed: stab) => 'thrusts', Slash (edged: slice) or whack (blunt: Bash)
// => 'swings'".
//
// The rn2(2) is the only randomness, and only a weapon that pierces *and*
// does something else reaches it.
export function mswings_verb(mwep, bash, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const type = objectType(mwep, state);
    /* (monsters don't actually wield towels, wet or otherwise) */
    const lash = type.oc_skill === P_WHIP || is_wet_towel(mwep);
    /* some weapons can have more than one strike type; for those,
       give a mix of thrust and swing (caller doesn't care either way) */
    const thrust = (type.oc_dir & PIERCE) !== 0
        && ((type.oc_dir & ~PIERCE) === 0 || !random.rn2(2));

    return bash ? 'bashes with' /*sigh*/
        : lash ? 'lashes'
            : thrust ? 'thrusts'
                : 'swings';
}

// C ref: mhitu.c mswings() (129-141). "monster swings obj".
async function mswings(mtmp, otemp, bash, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const message = requireMattackuOperation(rawEnv, 'message');
    const visible = rawEnv.monsterVisible ?? monsterVisible;

    if (state.flags?.verbose && !activeHeroProperty(state, BLINDED)
        && visible(mtmp, state)) {
        await message(
            `${capitalizedMonsterName(mtmp, state)} `
            + `${mswings_verb(otemp, bash, rawEnv)} `
            + `${(otemp.quan > 1) ? 'one of ' : ''}`
            + `${mhis(mtmp, {
                ...rawEnv,
                canSpotMonster: rawEnv.canSpotMonster ?? canSpotMonster,
            })} ${xnameFresh(otemp, state)}.`,
            state,
        );
    }
}

// C ref: mhitu.c getmattk() (309-444). "select a monster's next attack,
// possibly substituting for its usual one".
//
// Partial: it covers the answer where no substitution happens, which is
// mptr->mattk[indx] unchanged, and refuses wherever a substitution guard is
// TRUE. Every substituted attack would need a mutable copy of a frozen catalog
// record plus machinery this port does not have -- AD_DREN's energy scaling,
// the cancelled-weapon and lich-touch rewrites, and is_home_elemental().
//
// One guard is left out rather than refused. C's first block substitutes when
// !SYSOPT_SEDUCE; sys.c:100 sets sysopt.seduce to 1 and the sysconf files ship
// with the option commented out, so the block is dead in the program this port
// matches.
export function getmattk(magr, mdef, indx, prev_result, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');
    const mptr = magr.data;
    const attk = mptr.mattk[indx];
    const udefend = mdef === state.youmonst;
    const refuse = () => unsupported("a substituted monster attack");

    /* prevent a monster with two consecutive disease or hunger attacks
       from hitting with both of them on the same turn; if the first has
       already hit, switch to a stun attack for the second */
    if (indx > 0 && prev_result[indx - 1] > M_ATTK_MISS
        && (attk.adtyp === M.AD_DISE || attk.adtyp === M.AD_PEST
            || attk.adtyp === M.AD_FAMN)
        && attk.adtyp === mptr.mattk[indx - 1].adtyp) {
        refuse();

    /* make drain-energy damage be somewhat in proportion to energy */
    } else if (attk.adtyp === M.AD_DREN && udefend) {
        refuse();

    /* holders/engulfers who release the hero have mspec_used set to rnd(2)
       and can't re-hold/re-engulf until it has been decremented to zero;
       likewise for transformation by genetic engineer */
    } else if (magr.mspec_used && (attk.aatyp === M.AT_ENGL
                                   || attk.aatyp === M.AT_HUGS
                                   || attk.adtyp === M.AD_STCK
                                   || attk.adtyp === M.AD_POLY)) {
        refuse();

    /* barrow wight, Nazgul, erinys have weapon attack for non-physical
       damage; force physical damage if attacker has been cancelled or
       if weapon is sufficiently interesting */
    // C narrows this further, with mattk[1] and the attacker's weapon; the
    // port stops at the damage type, so a monster C would have left alone
    // stops here too.
    } else if (indx === 0 && magr !== state.youmonst
               && attk.aatyp === M.AT_WEAP && attk.adtyp !== M.AD_PHYS) {
        refuse();

    /* liches have a touch attack for cold damage and also a spell attack;
       they won't use the spell for monster vs monster so become impotent
       against cold resistant foes */
    // C narrows this with the defender's cold resistance, which the port does
    // not consult, so a cold-vulnerable defender stops here as well.
    } else if (indx === 0 && attk.aatyp === M.AT_TUCH
               && attk.adtyp === M.AD_COLD) {
        refuse();
    }

    /* elementals on their home plane do double damage */
    if (is_home_elemental(mptr, state)) refuse();

    return attk;
}

// C ref: mhitu.c calc_mattacku_vars() (447-463). "calc some variables needed
// for mattacku()".
//
// C also sets gb.bhitpos to the hero's square and clears gn.notonhead, which
// do_attack() does for the mirror case. Neither has a ported reader: their
// consumers are hitmu() and the passive counter-attacks behind it.
export function calc_mattacku_vars(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const seeMonster = rawEnv.canSeeMonster ?? canSeeMonster;
    return {
        ranged: mdistu(mtmp, state) > 3,
        range2: !monnear(mtmp, mtmp.mux, mtmp.muy, state),
        foundyou: u_at(mtmp.mux, mtmp.muy, state),
        youseeit: seeMonster(mtmp, state),
    };
}

// C ref: mhitu.c mtrapped_in_pit() (466-479). "return TRUE iff monster or hero
// is trapped in a (spiked) pit".
export function mtrapped_in_pit(mtmp, state = game) {
    const ttmp = mtmp === state.youmonst
        ? ((state.u.utrap && state.u.utraptype === TT_PIT)
            ? t_at(state.u.ux, state.u.uy, state) : null)
        : (mtmp.mtrapped ? t_at(mtmp.mx, mtmp.my, state) : null);

    return Boolean(ttmp && is_pit(ttmp.ttyp));
}

// C ref: hack.h AC_VALUE(). A hero whose armor class has gone negative spends
// a draw here, so mattacku()'s differential is not a pure calculation.
function AC_VALUE(ac, random) {
    return ac >= 0 ? ac : -random.rnd(-ac);
}

// C ref: mhitu.c mattacku() (491-951). "monster attacks you; returns 1 if
// monster dies (e.g. 'yellow light'), 0 otherwise".
//
// The result is TRUE where C returns 1, which nothing reachable here can
// produce: every arm that kills the attacker is behind hitmu(), gulpmu(),
// explmu() or gazemu(), and all four refuse. The callers still read it,
// because C's own callers do.
//
// Ported: the preamble, the u.usteed arm, the armor-class differential, the
// eel-reveal, find_offensive()'s FALSE answer, the NATTK loop, and, inside it,
// the AT_CLAW/AT_KICK/AT_BITE/AT_STNG/AT_TUCH/AT_BUTT/AT_TENT arm and the
// non-range2 AT_WEAP arm, each as far as its to-hit test. The miss side is
// complete through missmu(); the hit side stops at hitmu().
//
// Refused where C acts: the hero-concealment blocks (u.uundetected, the
// S_MIMIC and M_AP_OBJECT arms), summonmu(), u.uinvulnerable, use_offensive(),
// wildmiss() for a monster that guessed wrong, and every other aatyp arm.
//
// Three lines of the preamble are deliberately absent:
//   DEADMONSTER(mtmp) cannot answer TRUE, because mon.c movemon() drops a
//     monster with mhp < 1 before dochug() runs and nothing between there and
//     here damages it;
//   Underwater needs u.uinwater, whose sole writer is hack.c set_uinwater()
//     and whose only ported callers, in js/do.js, both pass FALSE;
//   C's `if (u.uswallow)` arm is absent for the same kind of reason: js/mon.js
//     clears u.uswallow and no ported path sets it, so only the steed arm of
//     that if/else chain can be taken.
//
// Two seams still owe the steed draw and stop before it:
// js/unported_monster_actions.js:732 (dogmove.c:1286) and js/dogmove.js:891
// (dogmove.c:911). Both must call this function when they are ported.
export async function mattacku(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const u = state.u;
    const random = rawEnv.random;
    if (typeof random?.rn2 !== 'function' || typeof random?.rnd !== 'function')
        throw new TypeError('mattacku requires an rn2 and rnd random source');
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');
    // pline_mon(), newsym() and bot(). The planning scan replays the same turn
    // against the live display afterwards, so a dry run must produce none of
    // the three.
    const message = rawEnv.planning
        ? async () => {}
        : (rawEnv.message ?? ttyPline);
    const redraw = rawEnv.planning ? () => {} : (rawEnv.redraw ?? newsym);
    const statusRefresh = rawEnv.planning
        ? async () => {}
        : (rawEnv.statusRefresh ?? (() => bot()));
    const env = { ...rawEnv, state, message, redraw, statusRefresh };

    const mdat = monster.data;
    const initial = calc_mattacku_vars(monster, env);
    let { range2, foundyou } = initial;

    if (!initial.ranged)
        nomul(0, state);

    if (u.usteed) {
        if (monster === u.usteed)
            /* Your steed won't attack you */
            return true;
        /* Orcs like to steal and eat horses and the like */
        if (!random.rn2(is_orc(mdat) ? 2 : 4)
            && m_next2u(monster, state)) {
            // C hands the attack to mattackm(mtmp, u.usteed) and, if the steed
            // survives, lets it strike back through a second mattackm(). No
            // monster-versus-monster combat is ported.
            unsupported("a monster attacking the hero's steed");
        }
    }

    // The three hero-concealment blocks (551-706). Each ends in `return 0`
    // after revealing the hero, and each needs machinery -- map_invisible(),
    // enexto()/teleds(), set_ustuck(), unmul() -- that is not ported. Their
    // shared gate, `!range2 && foundyou && !u.uswallow`, is written once.
    if (!range2 && foundyou) {
        if (u.uundetected) unsupported('a monster finding the hidden hero');
        if (state.youmonst.data.mlet === M.S_MIMIC
            && M_AP_TYPE(state.youmonst) !== M_AP_NOTHING) {
            unsupported('a monster finding the mimicking hero');
        }
        if (M_AP_TYPE(state.youmonst) === M_AP_OBJECT)
            unsupported('a monster finding the hero disguised as an object');
    }

    /*  Work out the armor class differential   */
    let tmp = AC_VALUE(u.uac, random) + 10; /* tmp ~= 0 - 20 */
    tmp += monster.m_lev;
    if ((state.multi ?? 0) < 0)
        tmp += 4;
    if ((activeHeroProperty(state, INVIS) && !perceives(mdat))
        || !monster.mcansee)
        tmp -= 2;
    if (monster.mtrapped)
        tmp -= 2;
    if (tmp <= 0)
        tmp = 1;

    /* make eels visible the moment they hit/miss us */
    if (mdat.mlet === M.S_EEL && monster.minvis
        && cansee(monster.mx, monster.my, state)) {
        monster.minvis = false;
        redraw(monster.mx, monster.my);
    }

    /* when not cancelled and not in current form due to shapechange, many
       demons can summon more demons and were creatures can summon critters */
    if (monster.cham === M.NON_PM && !monster.mcan && !range2
        && (is_demon(mdat) || is_were(mdat))) {
        unsupported('a monster summoning help against the hero');
    }

    if (u.uinvulnerable) { /* in the midst of successful prayer */
        /* monsters won't attack you */
        unsupported('a monster balking at an invulnerable hero');
    }

    /* Unlike defensive stuff, don't let them use item _and_ attack. */
    if (find_offensive(monster, env)) {
        // Unreachable: find_offensive() refuses rather than answering TRUE,
        // because use_offensive() -- the only reader of what it selects -- is
        // not ported. The call stays so that the selection, and the rn2 that
        // lined_up() can spend inside it, happen where C runs them.
        unsupported('monster offensive item use');
    }

    const firstfoundyou = foundyou;
    const sum = new Array(NATTK).fill(M_ATTK_MISS);

    for (let i = 0; i < NATTK; i++) {
        sum[i] = M_ATTK_MISS;
        // C's DEADMONSTER(mtmp) guard covers a counterattack against attack
        // [i-1] having killed the attacker. Every counterattack sits behind
        // hitmu(), which refuses, so the attacker is always alive here.
        if (i > 0) {
            /* recalc in case prior attack moved hero */
            ({ range2, foundyou } = calc_mattacku_vars(monster, env));
            /* if hero was found but isn't anymore, avoid wildmiss now */
            if (firstfoundyou && !foundyou)
                continue; /* set sum[i] to 'miss' but skip other actions */
            // C's second skip tests !u_at(gb.bhitpos.x, gb.bhitpos.y).
            // calc_mattacku_vars() has just written the hero's own square into
            // bhitpos, so that test is always false and is left out.
        }
        const mattk = getmattk(monster, state.youmonst, i, sum, env);
        // C skips this attack for three reasons, none of which can be true
        // here. u.uswallow is never set: js/mon.js clears it and no ported
        // path writes it. skipnonmagc is wildmiss()'s, and gs.skipdrin is
        // mhitm_ad_drin()'s; wildmiss() refuses below and mhitm_ad_drin()
        // sits behind hitmu(), which refuses too.

        switch (mattk.aatyp) {
        case M.AT_CLAW: /* "hand to hand" attacks */
        case M.AT_KICK:
        case M.AT_BITE:
        case M.AT_STNG:
        case M.AT_TUCH:
        case M.AT_BUTT:
        case M.AT_TENT:
            if (mattk.aatyp === M.AT_KICK && mtrapped_in_pit(monster, state))
                continue;
            if (!range2 && (!monster.mw /* MON_WEP() */ || monster.mconf
                            || activeHeroProperty(state, CONFLICT)
                            || !touch_petrifies(state.youmonst.data))) {
                if (foundyou) {
                    const j = random.rnd(20 + i);
                    if (tmp > j) {
                        if (unsolid(state.youmonst.data)) {
                            // uhitm.c failed_grab() decides whether an attack
                            // on an unsolid defender connects at all, and
                            // spends a draw of its own doing it.
                            unsupported('an attack on an unsolid hero');
                        }
                        if (mattk.aatyp !== M.AT_KICK
                            || !thick_skinned(state.youmonst.data)) {
                            unsupported('a monster landing a hit on the hero');
                        }
                    } else {
                        await missmu(monster, tmp === j, mattk, env);
                    }
                } else {
                    // wildmiss() announces an attack on the wrong square and
                    // sets skipnonmagc for the rest of the loop.
                    unsupported('a monster attacking where the hero is not');
                }
            }
            break;

        case M.AT_HUGS: /* automatic if prev two attacks succeed */
            /* Note: if displaced, prev attacks never succeeded */
            if ((!range2 && i >= 2 && sum[i - 1] && sum[i - 2])
                || monster === u.ustuck) {
                unsupported('a monster crushing the hero');
            }
            break;

        case M.AT_GAZE: /* can affect you either ranged or not */
            /* Medusa gaze already operated through m_respond in
               dochug(); don't gaze more than once per round. */
            if (mdat !== state.mons?.[M.PM_MEDUSA])
                unsupported('a monster gazing at the hero');
            break;

        case M.AT_EXPL: /* automatic hit if next to, and aimed at you */
            if (!range2) unsupported('a monster exploding at the hero');
            break;

        case M.AT_ENGL:
            if (!range2) unsupported('a monster engulfing the hero');
            break;

        case M.AT_BREA:
            if (range2) unsupported('a monster breathing at the hero');
            break;

        case M.AT_SPIT:
            if (range2) unsupported('a monster spitting at the hero');
            break;

        case M.AT_WEAP:
            if (range2) {
                if (!on_level(u.uz, state.rogue_level)) {
                    await requireMattackuOperation(
                        env, 'throwRangedWeapon',
                    )(monster, env);
                }
            } else {
                let hittmp = 0;

                /* Rare but not impossible.  Normally the monster
                 * wields when 2 spaces away, but it can be
                 * teleported or whatever....
                 */
                if (monster.weapon_check === NEED_WEAPON || !monster.mw) {
                    monster.weapon_check = NEED_HTH_WEAPON;
                    /* mon_wield_item resets weapon_check as appropriate */
                    const wieldMonsterItem = requireMattackuOperation(
                        env, 'wieldMonsterItem',
                    );
                    if (await wieldMonsterItem(monster, env) !== 0)
                        break;
                }
                if (foundyou) {
                    const mon_currwep = monster.mw; /* MON_WEP() */
                    if (mon_currwep) {
                        const bash = is_pole(mon_currwep, state)
                            && mon_currwep.oartifact !== ART_SNICKERSNEE
                            && m_next2u(monster, state);

                        // C passes &gy.youmonst, whose mx and my track the
                        // hero. Only hitval()'s trident-versus-swimmer arm
                        // reads them, and no hero species swims.
                        hittmp = hitval(mon_currwep, state.youmonst,
                            state, env);
                        tmp += hittmp;
                        await mswings(monster, mon_currwep, bash, env);
                    }
                    // C also stores the roll in gm.mhitu_dieroll, which only
                    // hitmu() reads.
                    const j = random.rnd(20 + i);
                    if (tmp > j)
                        unsupported('a monster landing a hit on the hero');
                    else
                        await missmu(monster, tmp === j, mattk, env);
                    /* KMH -- Don't accumulate to-hit bonuses */
                    if (mon_currwep)
                        tmp -= hittmp;
                } else {
                    unsupported('a monster attacking where the hero is not');
                }
            }
            break;

        case M.AT_MAGC:
            unsupported('a monster casting at the hero');
            break;

        default: /* no attack */
            break;
        }
        if (state.disp?.botl) await statusRefresh();
        // C then wakes a sleeping hero on a landed hit, returns 1 for a dead
        // attacker and breaks for a teleported one. All three read sum[i],
        // which stays M_ATTK_MISS for every arm above: the only writers are
        // hitmu(), gulpmu(), explmu(), gazemu(), castmu() and buzzmu(), and
        // each of those refuses.
    }
    return false;
}

// C ref: mhitu.c magic_negation() (1088-1137). "armor that sufficiently covers
// the body might be able to block magic"; the answer is the magic-cancellation
// factor, 0 through 3.
//
// This covers the `mon == &gy.youmonst` half. insight.c:1800 is the only caller
// this port reaches and it passes the hero, and `is_you` is what makes C's
// `if (is_you || gotprot) continue;` end every loop iteration early. That
// leaves worn.c protects() and obj.c is_weptool() -- the whole apparatus the
// monster half needs -- unreached. uhitm.c:86 is the C caller that passes a
// monster; no ported path reaches it, so this throws instead of answering a
// cancellation factor it did not compute.
export function magic_negation(mon, state = game) {
    if (mon !== state.youmonst) {
        throw new TypeError('magic_negation() covers only the hero; the'
            + ' monster half needs worn.c protects()');
    }
    const { u } = state;
    const objects = getObjects(state);
    let mc = 0;
    let via_amul = false;
    const gotprot = Boolean(u.uprops?.[PROTECTION]?.extrinsic);

    for (let o = state.invent; o; o = o.nobj) {
        const wornmask = o.owornmask ?? 0;
        /* a_can field is only applicable for armor (which must be worn) */
        if ((wornmask & W_ARMOR) !== 0) {
            const armpro = objects[o.otyp].a_can;
            if (armpro > mc) mc = armpro;
        } else if ((wornmask & W_AMUL) !== 0) {
            // C assigns rather than accumulates, so a second worn amulet would
            // overwrite the first. Only one amulet slot exists, so the two
            // spellings cannot differ; ported as written.
            via_amul = (o.otyp === AMULET_OF_GUARDING);
        }
        /* if we've already confirmed Protection, skip additional checks */
        /* (is_you ends every iteration here, so the rest of C's loop body --
           the wearmask and protects() calls -- belongs to the monster half) */
    }

    if (gotprot) {
        /* extrinsic Protection increases mc by 1 (2 for amulet of guarding);
           multiple sources don't provide multiple increments */
        mc += via_amul ? 2 : 1;
        if (mc > 3)
            mc = 3;
    } else if (mc < 1) {
        /* intrinsic Protection is weaker (play balance; obtaining divine
           protection is too easy); it confers minimum mc 1 instead of 0 */
        if ((u.uprops?.[PROTECTION]?.intrinsic && u.ublessed > 0)
            || u.uspellprot
            /* aligned priests and angels have innate intrinsic Protection */
            // Indexed without a guard on purpose: an absent catalog would make
            // two undefineds compare equal and answer 1 where C answers 0.
            || mon.data === state.mons[M.PM_ALIGNED_CLERIC]
            || is_minion(mon.data))
            mc = 1;
    }
    return mc;
}
