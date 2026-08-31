// mhitu.js -- Monsters attacking the hero.
// C ref: mhitu.c -- hitmsg(), missmu(), mswings_verb(), mswings(), getmattk(),
// calc_mattacku_vars(), mtrapped_in_pit(), mattacku(), magic_negation(),
// could_seduce(), hitmu(), mdamageu(), ranged_attk_available(),
// passiveum(), and gulp_blnd_check().

import {
    A_CON,
    AC_VALUE,
    BLINDED,
    CONFLICT,
    DIED,
    HALF_PHDAM,
    INVIS,
    M_AP_NOTHING,
    M_AP_OBJECT,
    M_AP_TYPE,
    M_ATTK_HIT,
    M_ATTK_MISS,
    NATTK,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    PROTECTION,
    P_WHIP,
    TT_PIT,
    W_AMUL,
    W_ARMOR,
    Upolyd,
    is_pit,
    u_at,
} from './const.js';
// js/unported_monster_actions.js already imports allmain.js across the same
// cycle and records why it is safe: `stop_occupation` is a hoisted function
// declaration, initialized before either module body runs, and nothing here
// reads it at module scope.
import { stop_occupation } from './allmain.js';
import { ART_SNICKERSNEE } from './artifacts.js';
import { effective_attribute, minuhpmax, setuhpmax } from './attrib.js';
import { midnight } from './calendar.js';
import { bot, map_invisible, newsym } from './display.js';
import { capitalizedMonsterName, monsterPossessive } from './do_name.js';
import { In_hell, on_level } from './dungeon.js';
import { done_in_by } from './end.js';
import { game } from './gstate.js';
import { nomul, showdamage } from './hack.js';
import { dist2 } from './hacklib.js';
import { is_home_elemental } from './makemon.js';
import {
    DISTANCE_ATTK_TYPE,
    cvt_adtyp_to_mseenres,
    get_atkdam_type,
    hides_under,
    is_animal,
    is_demon,
    is_minion,
    is_orc,
    is_undead,
    is_vampshifter,
    is_were,
    mhis,
    mon_hates_blessings,
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
import { is_quest_artifact } from './questpgr.js';
import { rn2 } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    monsterVisible,
} from './startup_a11y.js';
import { t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { mhitm_adtyping, mhitm_knockback } from './uhitm.js';
import { cansee } from './vision.js';
import { hitval } from './weapon.js';
import { is_pole } from './worn.js';

// Planning cannot call end.c done_in_by() on its cloned state: the ordinary
// death entry updates the live terminal and then asks for input. This signal
// carries the source DIED result across the atomic planning/live seam; it is
// consumed by unported_monster_actions.js and is never a gameplay boundary.
export class MonsterDeathPlanningError extends Error {
    constructor(monster) {
        super('the hero dying of a monster attack');
        this.name = 'MonsterDeathPlanningError';
        this.monsterId = monster.m_id;
        this.how = DIED;
    }
}

function requireMattackuOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`mattacku requires a ${name} operation`);
    return operation;
}

// youprop.h:92-103 and :198. Both properties are intrinsic-or-extrinsic and
// both are defeated by an artifact block. Only Blind (:103) and Invis (:198)
// route through here; a macro without a `blocked` alias needs its own copy.
function activeHeroProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean((value?.intrinsic || value?.extrinsic) && !value?.blocked);
}

// C ref: youprop.h:218 Conflict, `(HConflict || EConflict)`. Two disjuncts and
// no blocking term, which is why it cannot share activeHeroProperty() above:
// youprop.h gives a `blocked` alias to BLINDED, CLAIRVOYANT, INVIS, STEALTH,
// LEVITATION and FLYING alone, so no C path sets one for CONFLICT. mhitu.c
// reads Conflict once, in mattacku()'s cockatrice-instinct test at 803.
function Conflict(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic);
}

// C ref: hack.h distu() and mdistu(). mdistu() is distu() applied to a
// monster's own square, with no long-worm handling of its own.
function mdistu(monster, state) {
    return dist2(monster.mx, monster.my, state.u.ux, state.u.uy);
}

// C ref: you.h:560 m_next2u(), `distu((m)->mx, (m)->my) <= 2`. dist2() is a
// squared distance, so it never equals 3 and this is the same set of squares
// as mattacku()'s `!ranged`. Exported because mon.c restrap()'s last guard
// term reads it too, and one C macro gets one port.
export function m_next2u(monster, state) {
    return mdistu(monster, state) <= 2;
}

// C ref: mhitu.c could_seduce() (1933-1984). "returns 0 if seduction
// impossible, 1 if fine, 2 if wrong gender for nymph".
//
// Partial: it covers every aggressor whose species fails the S_NYMPH /
// PM_AMOROUS_DEMON test at :1976, which is the whole answer for all of them
// and is 0. An aggressor that passes it refuses, because the rest of the
// function needs polyself.c poly_gender(), sysopt.seduce and the AD_SSEX /
// AD_SEDU / AD_SITM damage types, none of which is ported.
//
// That refusal is a fail-closed stop, not the boundary of C's nonzero answer.
// It is wider, in three directions, because it tests the species alone:
//
//   C's :1976-1977 is a disjunction, and its second half also demands an adtyp
//     of AD_SEDU, AD_SSEX or AD_SITM. An amorous demon's claw carries
//     ATTK(AT_CLAW, AD_PHYS, 1, 3) (monsters.h:2922-2923), for which C returns
//     0 at :1978 and hitmsg() prints its default verb, while this refuses.
//   C's :1969-1970 returns 0 for an unseen aggressor's AD_SEDU attack.
//   C's :1980 returns 0 for an amorous demon whose gender matches the hero's.
//
// A caller that needs C's answer rather than a stop therefore has to complete
// this function; it cannot read the refusal as "C would have said yes".
export function could_seduce(magr, mdef, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');

    if (is_animal(magr.data)) return 0;
    /* nymphs have two attacks, one for steal-item damage and the other
       for seduction, both pass the could_seduce() test;
       incubi/succubi have three attacks, their claw attacks for damage
       don't pass the test */
    // C's comment describes both halves of its :1976-1977 test. Only the
    // species half is ported, so the claw attacks its last line excuses refuse
    // here instead of falling through.
    const pagr = magr.data;
    if (pagr.mlet === M.S_NYMPH
        || pagr === state.mons?.[M.PM_AMOROUS_DEMON]) {
        unsupported('a seductive monster attack');
    }
    return 0;
}

// allmain.c stop_occupation(), which mhitu.c calls from missmu() at :99 and
// from hitmu() at :1266. It is imported rather than resolved from the env,
// because the env this file is handed carries a `stopOccupation` key that
// js/unported_monster_actions.js binds twice with opposite meanings -- once to
// the real function for dochugw()'s interruption and once to a refusal for a
// pet's hunger -- and neither binding is meant for these two call sites.
//
// What the env does own is the pair of display operations that differ between
// the live game and the atomic planning clone, so those are forwarded.
function mattackuStopOccupation(env) {
    return stop_occupation(env.state, {
        message: env.message,
        statusRefresh: env.statusRefresh,
    });
}

// C ref: decl.h:457-458, the `gh` globals hitmsg() writes and missmu() clears.
// decl.c:400-401 starts them at 0 and NULL, and neither appears in save.c, so
// a restored game starts from those values again; this port therefore keeps
// them on the game state and out of `input.storage`.
//
// C's hitmsg_prev is a `struct attack *` into the attacker's own mattk[], and
// its one reader asks whether this attack sits immediately after it in that
// array. getmattk() hands back mptr->mattk[indx] itself, so the JavaScript
// pointer is the same array element and the question is answered by finding it
// in the current attacker's list.
function hitmsgState(state) {
    state.gh ??= {};
    state.gh.hitmsg_mid ??= 0;
    state.gh.hitmsg_prev ??= null;
    return state.gh;
}

// C ref: mhitu.c hitmsg() (28-81). "monster hits hero"; the line every landed
// blow prints before its damage type acts.
//
// The `again` term is C's `mattk == gh.hitmsg_prev + 1`. It can only be true
// inside one mattacku() NATTK loop: a landed blow at slot i leaves prev at i,
// the next turn starts again at slot 0, and any miss in between clears prev
// through missmu(). No monster this slice admits has two attacks, so it never
// prints yet; it is ported rather than deferred because the state it reads is
// the state missmu() already clears.
export async function hitmsg(mtmp, mattk, state = game, env = {}) {
    const message = requireMattackuOperation(env, 'message');
    const gh = hitmsgState(state);
    let punct = '!';
    let verb;
    let Monst_name = capitalizedMonsterName(mtmp, state);

    /* Note: if opposite gender, "seductively";
       if same gender, "engagingly" for nymph, normal msg for others. */
    // C's first arm prints "%s smiles at you seductively." for a nonzero
    // could_seduce(). It is left out because no route into hitmsg() can reach
    // it, which is a fact about the callers rather than about the call below.
    // uhitm.c mhitm_ad_phys() and mhitm_ad_elec() are the only two, and both
    // pass a non-null mattk whose adtyp is AD_PHYS or AD_ELEC. mhitu.c:1977
    // then holds for every aggressor, so C returns 0 at :1978 and the arm has
    // no reachable spelling. The call stays for the refusal it carries, which
    // is wider than C's nonzero set rather than equal to it; could_seduce()
    // above says in which directions.
    could_seduce(mtmp, state.youmonst, mattk, { ...env, state });

    switch (mattk.aatyp) {
    case M.AT_BITE:
        verb = 'bites';
        break;
    case M.AT_KICK:
        if (thick_skinned(state.youmonst.data))
            punct = '.';
        verb = 'kicks';
        break;
    case M.AT_STNG:
        verb = 'stings';
        break;
    case M.AT_BUTT:
        verb = 'butts';
        break;
    case M.AT_TUCH:
        verb = 'touches you';
        break;
    case M.AT_TENT:
        verb = 'tentacles suck your brain';
        /* s_suffix(Monst_name) */
        Monst_name = monsterPossessive(mtmp, state, true);
        break;
    case M.AT_EXPL:
    case M.AT_BOOM:
        verb = 'explodes';
        break;
    default:
        verb = 'hits';
    }
    /* if a monster hits more than once with similar attack, say so */
    const prevIndex = gh.hitmsg_prev
        ? mtmp.data.mattk.indexOf(gh.hitmsg_prev) : -1;
    const again = (mtmp.m_id === gh.hitmsg_mid
                   && prevIndex >= 0
                   && mtmp.data.mattk[prevIndex + 1] === mattk
                   && mattk.aatyp === gh.hitmsg_prev.aatyp) ? ' again' : '';
    await message(`${Monst_name} ${verb}${again}${punct}`, state);

    gh.hitmsg_mid = mtmp.m_id;
    gh.hitmsg_prev = mattk;
}

// C ref: mhitu.c missmu() (84-100). "monster missed you".
//
// C opens with map_invisible() for a monster the hero cannot spot, marking the
// square as containing an invisible monster, then falls through to the miss
// message. capitalizedMonsterName() produces "It" when canspotmon() is false.
async function missmu(mtmp, nearmiss, mattk, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = requireMattackuOperation(rawEnv, 'unsupported');
    const message = requireMattackuOperation(rawEnv, 'message');
    const markInvisible = requireMattackuOperation(rawEnv, 'markInvisible');
    const spotMonster = rawEnv.canSpotMonster ?? canSpotMonster;
    const gh = hitmsgState(state);

    gh.hitmsg_mid = 0;
    gh.hitmsg_prev = null;

    // C ref: mhitu.c:90-91. Same pattern as hitmu(): mark the square as
    // containing an invisible monster when the hero cannot spot the attacker.
    const spotted = spotMonster(mtmp, state);
    if (!spotted)
        markInvisible(mtmp.mx, mtmp.my);
    // do_name.c x_monnam() adds the invisible adjective for a spotted
    // invisible monster and can spend display RNG while hallucinating. Keep
    // that naming branch fail-closed without blocking the unspotted "It" arm.
    if (mtmp.minvis && spotted)
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

    await mattackuStopOccupation(rawEnv);
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
// do_attack() does for the mirror case. Neither has a ported reader. hitmu()
// reads neither; the consumers are mattacku()'s own u_at(gb.bhitpos.x,
// gb.bhitpos.y) test at mhitu.c:782 and the passive counter-attacks. That
// test is tautologically false, because the only write between here and it,
// the steed retaliation at mhitu.c:545, returns on every path out of :547.
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

// C ref: mhitu.c mattacku() (491-951). "monster attacks you; returns 1 if
// monster dies (e.g. 'yellow light'), 0 otherwise".
//
// The result is TRUE where C returns 1, which nothing reachable here can
// produce: hitmu() answers M_ATTK_HIT on both of its paths, and gulpmu(),
// explmu() and gazemu() all refuse. So every reachable exit answers false,
// including the steed's own arm, which mhitu.c:532 returns 0 from.
//
// No ported caller reads the value today. dochug() awaits it and discards it,
// which is faithful to C only because C's callers act on a bit this port
// cannot yet set; the value is kept rather than dropped so that the arm which
// will set it has somewhere to report.
//
// Ported: the preamble, the u.usteed arm, the armor-class differential, the
// eel-reveal, find_offensive()'s FALSE answer, the NATTK loop, and, inside it,
// the AT_CLAW/AT_KICK/AT_BITE/AT_STNG/AT_TUCH/AT_BUTT/AT_TENT arm and the
// non-range2 AT_WEAP arm, each through hitmu() or missmu().
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
// Two seams still owe the steed draw and stop before it, named by symbol
// because line numbers rot and both citations here were already wrong once:
// js/dogmove.js dog_move()'s `monster === state.u.usteed` arm (dogmove.c:911)
// and js/dogmove.js pet_ranged_attk() (dogmove.c:1286). Both must call this
// function when they are ported.
export async function mattacku(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const u = state.u;
    const random = rawEnv.random;
    if (typeof random?.rn2 !== 'function' || typeof random?.rnd !== 'function'
        || typeof random?.d !== 'function') {
        throw new TypeError(
            'mattacku requires an rn2, rnd and d random source',
        );
    }
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
    // map_invisible() writes map memory and then paints through
    // show_glyph_cell(), both against the module-global game. The planning
    // scan replays the same turn live afterwards, so a dry run must write
    // neither half; the live replay writes both.
    const markInvisible = rawEnv.planning
        ? () => {}
        : (rawEnv.markInvisible ?? map_invisible);
    const env = {
        ...rawEnv, state, message, redraw, statusRefresh, markInvisible,
    };

    const mdat = monster.data;
    const initial = calc_mattacku_vars(monster, env);
    let { range2, foundyou } = initial;

    if (!initial.ranged)
        nomul(0, state);

    if (u.usteed) {
        if (monster === u.usteed)
            /* Your steed won't attack you */
            return false;
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
    // after revealing the hero, and each needs machinery -- enexto()/teleds(),
    // set_ustuck(), unmul() -- that is not ported. Their shared gate,
    // `!range2 && foundyou && !u.uswallow`, is written once.
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
    // C ref: mhitu.c:955-993, summonmu(). Extracted from mattacku() in C.
    if (monster.cham === M.NON_PM && !monster.mcan && !range2
        && (is_demon(mdat) || is_were(mdat))) {
        if (is_demon(mdat)) {
            // C ref: mhitu.c:966-971. Non-balrog, non-amorous demons
            // roll rn2(Inhell ? 10 : 16); only a 0 calls msummon().
            if (mdat.pmidx !== M.PM_BALROG
                && mdat.pmidx !== M.PM_AMOROUS_DEMON) {
                if (!random.rn2(In_hell(u.uz, state) ? 10 : 16)) {
                    unsupported('a demon summoning help via msummon()');
                }
            }
            // C returns after the demon arm (no demon were-creatures).
        } else {
            // Were-creature summoning is not ported.
            unsupported('a were creature summoning critters');
        }
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
                            || Conflict(state)
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
                            sum[i] = await hitmu(monster, mattk, env);
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
                    // C also stores the roll in gm.mhitu_dieroll, whose only
                    // readers are uhitm.c mhitm_ad_phys():4069 and :4107. Both
                    // sit inside the AT_WEAP block that opens at :4041, which
                    // that function refuses; the roll arrives with the armed
                    // blow rather than with AD_PHYS.
                    const j = random.rnd(20 + i);
                    if (tmp > j)
                        sum[i] = await hitmu(monster, mattk, env);
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
        /* give player a chance of waking up before dying -kaa */
        if (sum[i] === M_ATTK_HIT) { /* successful attack */
            if (u.usleep && u.usleep < state.moves && !random.rn2(10)) {
                state.multi = -1;
                state.nomovemsg = 'The combat suddenly awakens you.';
            }
        }
        // C follows this with `return 1` for a dead attacker and `break` for a
        // teleported one, reading M_ATTK_AGR_DIED and M_ATTK_AGR_DONE out of
        // sum[i]. Neither bit can be set: hitmu() is the only writer of sum[i]
        // and both of its exits answer M_ATTK_HIT, while gulpmu(), explmu(),
        // gazemu(), castmu() and buzzmu() all refuse above.
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

// youprop.h:339-341 Half_physical_damage, spelled out here because each C
// file's port expands its own macros; js/trap_effects.js:158 expands the same
// one. It is the intrinsic or the extrinsic, with no blocking term.
function Half_physical_damage(state) {
    const halved = state.u?.uprops?.[HALF_PHDAM];
    return Boolean(halved?.intrinsic || halved?.extrinsic);
}

// C ref: mhitu.c hitmu() (1143-1267). "monster hits you; returns MM_ flags".
//
// Every reachable surviving exit answers M_ATTK_HIT. A lethal unpolymorphed
// planning exit raises MonsterDeathPlanningError so the cloned turn can stop
// at the same point that the live exit calls done_in_by(); the live end-game
// boundary then unwinds the monster pass after the real death entry.
//
// Ported: the base damage roll, mhitm_adtyping(), mhitm_knockback(), the
// negative-armor-class reduction, mdamageu() and passiveum().
//
// Ported: the marker for an unspottable attacker in hitmu() and missmu().
//
// Refused where C acts: the block that reveals an attacker hidden under an
// object, which needs doname(), Amonnam() and tp_sensemon();
// and the alternate mdamageu() death branches.
//
// One piece of C is absent rather than refused: mhm.permdmg's whole block
// (1229-1259), which drains permanent hit points. Death's life-force drain is
// its only writer, that is uhitm.c mhitm_ad_deth(), and mhitm_adtyping()
// refuses AD_DETH above. The field is still initialized, because the mhm
// record is C's and every arm of that switch may write it.
//
// mhm.specialdmg has no ported reader either, and mhitm_ad_phys() did not
// bring one. Its two C readers, uhitm.c:3992 and :3995, are inside the
// `magr == &gy.youmonst` arm that opens at :3988, so the silver and blessed
// bonus it carries belongs to the hero's own blow, not to a monster's.
async function hitmu(mtmp, mattk, env) {
    const state = env.state;
    const random = env.random;
    const unsupported = requireMattackuOperation(env, 'unsupported');
    const markInvisible = requireMattackuOperation(env, 'markInvisible');
    const spotMonster = env.canSpotMonster ?? canSpotMonster;
    const mdat = mtmp.data;
    const olduasmon = state.youmonst.data;
    let res;
    const mhm = {
        damage: 0,
        hitflags: M_ATTK_MISS,
        permdmg: 0,
        specialdmg: 0,
        done: false,
    };

    // C ref: mhitu.c:1155-1156. When the hero cannot spot the attacker (blind
    // with no telepathy, attacker invisible, etc.), mark the square as
    // containing an invisible monster. The damage computation below is the
    // same regardless.
    if (!spotMonster(mtmp, state))
        markInvisible(mtmp.mx, mtmp.my);

    /*  If the monster is undetected & hits you, you should know where
     *  the attack came from.
     */
    if (mtmp.mundetected && (hides_under(mdat) || mdat.mlet === M.S_EEL))
        unsupported('a hit by a monster that was hiding');

    /*  First determine the base damage done */
    mhm.damage = random.d(mattk.damn, mattk.damd);
    if ((is_undead(mdat) || is_vampshifter(mtmp)) && midnight(state))
        mhm.damage += random.d(mattk.damn, mattk.damd); /* extra dmg */

    await mhitm_adtyping(mtmp, mattk, state.youmonst, mhm, state, env);

    mhitm_knockback(mtmp, state.youmonst, mattk, Boolean(mtmp.mw) /* MON_WEP */,
        state, env, random);

    if (mhm.done)
        return mhm.hitflags;

    if ((Upolyd(state.u) ? state.u.mh : state.u.uhp) < 1) {
        /* already dead? call rehumanize() or done_in_by() as appropriate */
        await mdamageu(mtmp, 1, state, env);
        // C's done_in_by() is NORETURN on the ordinary death path. The JS
        // end-game display returns after setting gameover so replay can
        // capture its final window; do not resume hitmu() in that case.
        if (state.program_state?.gameover)
            return;
        mhm.damage = 0;
    }

    /*  Negative armor class reduces damage done instead of fully protecting
     *  against hits.
     */
    if (mhm.damage && state.u.uac < 0) {
        mhm.damage -= random.rnd(-state.u.uac);
        if (mhm.damage < 1)
            mhm.damage = 1;
    }

    if (mhm.damage > 0) {
        /* [Half_physical_damage isn't applied to mhm.permdmg] */
        if (Half_physical_damage(state)
            /* Mitre of Holiness, even if not currently blessed */
            || (state.urole?.mnum === M.PM_CLERIC && state.uarmh
                && is_quest_artifact(state.uarmh, state)
                && mon_hates_blessings(mtmp)))
            mhm.damage = Math.trunc((mhm.damage + 1) / 2);

        await mdamageu(mtmp, mhm.damage, state, env);
        // A completed really_done() must not continue into passiveum() or the
        // attack-loop cleanup that follows this C NORETURN call.
        if (state.program_state?.gameover)
            return;
    }

    if (mhm.damage)
        res = await passiveum(olduasmon, mtmp, mattk, state, env);
    else
        res = M_ATTK_HIT;
    await mattackuStopOccupation(env);
    return res;
}

// C ref: mhitu.c mdamageu() (1901-1927). "mtmp hits you for n points damage".
//
// C ref: mhitu.c mdamageu() (1901-1927). "mtmp hits you for n points damage".
//
// done_in_by() is ported in js/end.js and wired below. The live pass calls it
// when uhp drops below 1; the normal planning pass raises the internal signal
// above because done() calls bot() on the module-level game and
// paranoid_query() reads input.
async function mdamageu(mtmp, n, state, env) {
    const unsupported = requireMattackuOperation(env, 'unsupported');
    const message = requireMattackuOperation(env, 'message');

    if (n < 0) {
        // C calls impossible() and continues with n = 0. No ported caller can
        // reach it: hitmu() calls this with 1 or with a damage it has already
        // clamped above zero.
        unsupported('mdamageu() for negative damage');
    }

    state.disp ??= {};
    state.disp.botl = true;
    if (Upolyd(state.u)) {
        // u.mh, u.mhmax and rehumanize() belong to polyself.c, which is not
        // ported; js/regen.js:52 records that Upolyd() is constantly false.
        unsupported('damage to a polymorphed hero');
    }
    state.u.uhp -= n;
    await showdamage(n, state, { message });
    /* caller might have reduced uhpmax before calling mdamageu() */
    if (state.u.uhp > state.u.uhpmax)
        state.u.uhp = state.u.uhpmax;
    if (state.u.uhp < 1) {
        // C ref: mhitu.c:1924-1925. done_in_by() prints "You die...", builds
        // the killer string, and calls done(). done() calls bot() on the
        // module-level game and paranoid_query() reads input, so it cannot
        // run on the planning pass's clone.
        if (env.planning) {
            if (state.wizard || state.discover) {
                // In wizard or discover mode, done() asks "Die? [yn]" and the
                // player answers "n". done() then calls savelife(), which
                // restores the hero to a viable state, and returns normally.
                // Neither done() nor savelife() makes a random-number call, so
                // the planning pass can simulate survival by applying the same
                // state changes without running done()'s display operations
                // (bot(), paranoid_query(), curs_on_u()) that need the live
                // terminal.
                //
                // C ref: end.c done():1071 u.umortality++, :1077 u.uhp=0, then
                // savelife():719-722 restores HP from CON.
                state.u.umortality++;
                state.u.uhp = 0;
                const uhpmin = minuhpmax(10, state);
                if (state.u.uhpmax < uhpmin)
                    setuhpmax(uhpmin, true, state);
                const givehp = 50
                    + 10 * Math.trunc(effective_attribute(state, A_CON) / 2);
                state.u.uhp = Math.min(state.u.uhpmax, givehp);
                state.context.move = 0;
                state.multi = -1;
            } else {
                throw new MonsterDeathPlanningError(mtmp);
            }
        } else {
            // Live pass: done_in_by() calls done(), which in wizard/discover
            // mode asks "Die?"; savelife() runs on the real game state.
            await done_in_by(mtmp, DIED, state);
        }
    }
}

// C ref: mhitu.c ranged_attk_available() (2412-2426). "returns TRUE if monster
// has a range attack in its repertoire that it will actually utilize"; the
// monster declines one whose damage type it has already watched the hero
// resist, which is what m_seenres() records.
//
// The draw is real and belongs to the caller's turn: for an AT_BREA slot whose
// damage type is AD_RBRE, get_atkdam_type() rolls the breath before the
// resistance test, and one loop pass can spend that draw and still move on to
// the next slot. That is why this is not a pure predicate and why
// monmove.c dochug() must reach it in C's order.
//
// C's `(typ = get_atkdam_type(...)) >= 0` guard is left out. `struct attack`
// declares adtyp a uchar (permonst.h:42) and get_atkdam_type() answers either
// that field or a member of rnd_breath_typ[], so no attack entry can drive it
// below zero. `typ` itself, C's -1 initializer included, exists only to carry
// the value between the two calls.
//
// C loops `for (i = 0; i < NATTK; i++)` over an array of NATTK slots
// (permonst.h:48) whose unused members hold aatyp AT_NONE, which
// DISTANCE_ATTK_TYPE() rejects; walking the mattk array itself reaches the
// same slots in the same order.
export function ranged_attk_available(mtmp, rawEnv = {}) {
    const random = rawEnv.random ?? { rn2 };
    const ptr = mtmp.data;

    return Boolean(ptr?.mattk?.some((mattk) => {
        if (!DISTANCE_ATTK_TYPE(mattk.aatyp)) return false;
        const typ = get_atkdam_type(mattk.adtyp, random);
        /* m_seenres() */
        return (mtmp.seen_resistance & cvt_adtyp_to_mseenres(typ)) === 0;
    }));
}

// C ref: mhitu.c passiveum() (2434-2615), as far as `if (!Upolyd)` at 2519.
// The hero's own passive counter-attack against the monster that just hit.
//
// An unpolymorphed hero costs nothing here. olduasmon is the role's permonst,
// whose mattk[1] is NO_ATTK: aatyp AT_NONE ends the search, damn and damd are
// both zero so tmp is zero and no die is rolled, and adtyp AD_PHYS takes the
// switch's default arm. The absence of any passiveum() site in seed0004's
// step-91 and step-92 random-number log is that path, observed.
//
// The three arms below therefore need a polymorphed hero, and so does
// everything after the `!Upolyd` return: the second switch, its rn2(3) guard
// and uhitm.c-style assess_dmg().
//
// `mattk` is the blow that landed, and C reads it in one place: the AD_STON
// arm's attk_protection(mattk->aatyp), which decides whether the attacker's
// gloves saved it from a cockatrice. That arm refuses, so the parameter is
// carried for the signature rather than read.
async function passiveum(olduasmon, mtmp, mattk, state, env) {
    const random = env.random;
    const unsupported = requireMattackuOperation(env, 'unsupported');
    let i;
    let oldu_mattk = null;

    /*
     * mattk      == mtmp's attack that hit you;
     * oldu_mattk == your passive counterattack (even if mtmp's attack
     *               has already caused you to revert to normal form).
     */
    for (i = 0; !oldu_mattk; i++) {
        if (i >= NATTK)
            return M_ATTK_HIT;
        if (olduasmon.mattk[i].aatyp === M.AT_NONE
            || olduasmon.mattk[i].aatyp === M.AT_BOOM)
            oldu_mattk = olduasmon.mattk[i];
    }
    /* Note: C's `tmp` is not always used. Its value feeds only the arms below
       and the polymorphed tail, all of which stop, but the draw is C's and has
       to happen where C makes it -- the same treatment js/uhitm.js passive()
       gives the mirror-image function. */
    if (oldu_mattk.damn)
        random.d(oldu_mattk.damn, oldu_mattk.damd);
    else if (oldu_mattk.damd)
        random.d(olduasmon.mlevel + 1, oldu_mattk.damd);

    /* These affect the enemy even if you were "killed" (rehumanized) */
    switch (oldu_mattk.adtyp) {
    case M.AD_ACID: /* acid blob */
        unsupported("a hero form's passive acid");
        break;
    case M.AD_STON: /* cockatrice */
        unsupported("a hero form's passive petrification");
        break;
    case M.AD_ENCH: /* KMH -- remove enchantment (disenchanter) */
        unsupported("a hero form's passive disenchantment");
        break;
    default:
        break;
    }
    if (!Upolyd(state.u))
        return M_ATTK_HIT;

    /* These affect the enemy only if you are still a monster */
    return unsupported("a polymorphed hero's passive counter-attack");
}

// C ref: mhitu.c gulp_blnd_check() (1273-1285). Called when removing
// a blindfold or lenses to check whether an engulfing monster immediately
// blinds the hero. The condition requires u.uswallow (hero is engulfed),
// which no ported path sets, so this always returns false.
export function gulp_blnd_check(state = game) {
    if (state.u.uswallow) {
        // The hero is engulfed. The full branch calls
        // attacktype_fordmg(), can_blnd(), and gulpmu(), none of which
        // are ported.
        throw new Error('gulp_blnd_check(): engulfed hero not ported');
    }
    return false;
}
