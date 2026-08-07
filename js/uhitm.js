// Hero-versus-monster interaction owned by uhitm.c.

import { ART_CLEAVER } from './artifacts.js';
import { exercise } from './attrib.js';
import {
    A_DEX,
    A_LAWFUL,
    A_STR,
    CONFUSION,
    HALLUC,
    HALLUC_RES,
    NATTK,
    P_BARE_HANDED_COMBAT,
    P_BASIC,
    STRAT_WAITMASK,
    STUNNED,
    engulfing_u,
    M_AP_TYPE,
} from './const.js';
import {
    capitalizedAlwaysVisibleMonsterName,
    monsterCommonName,
} from './do_name.js';
import { u_wipe_engr } from './engrave.js';
import { game } from './gstate.js';
import { sgn } from './hacklib.js';
import { wakeup } from './mon.js';
import { is_orc, is_undead } from './mondata.js';
import { monflee } from './monmove.js';
import {
    AD_PHYS,
    AT_CLAW,
    AT_NONE,
    AT_WEAP,
    PM_ELF,
    PM_KNIGHT,
    PM_MONK,
    PM_SAMURAI,
    S_LEPRECHAUN,
} from './monsters.js';
import { encumber_msg } from './pickup.js';
import { d, rn2, rnd } from './rng.js';
import { canSpotMonster } from './startup_a11y.js';
import { P_SKILL } from './startup_skills.js';
import { abon, hitval, weapon_hit_bonus } from './weapon.js';
import { can_twoweapon } from './wield.js';
import { find_mac } from './worn.js';

function intrinsicProperty(hero, index) {
    return Boolean(hero?.uprops?.[index]?.intrinsic);
}

function propertyPresent(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: monst.h:251 helpless().
function helpless(monster) {
    return Boolean(monster.msleeping) || !monster.mcanmove;
}

// C ref: youprop.h:120 Hallucination, over :116-119. HHallucination is the
// intrinsic alone -- no worn item confers hallucination, so there is no
// EHallucination term -- while Halluc_resistance is the intrinsic or the
// extrinsic. Both readers below take the macro from here, because uhitm.c
// spells it the same way at 300 as display.h is_safemon() does.
function Hallucination(state) {
    return intrinsicProperty(state?.u, HALLUC)
        && !propertyPresent(state?.u, HALLUC_RES);
}

// C ref: display.h is_safemon().
export function is_safemon(monster, state = game) {
    const hero = state.u;
    return Boolean(
        state.flags?.safe_dog
        && monster?.mpeaceful
        && canSpotMonster(monster, state)
        && !intrinsicProperty(hero, CONFUSION)
        && !Hallucination(state)
        && !intrinsicProperty(hero, STUNNED),
    );
}

function requireAttackOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`do_attack requires ${name}`);
    return operation;
}

// C ref: uhitm.c attack_checks() (188-327). FALSE means it is fine to attack.
// The ordinary melee case -- a spotted, undisguised, hostile target -- reaches
// the closing `return FALSE` at 326 having done nothing but clear the wait
// strategy at 195.
//
// Five arms stop instead of porting, and each is the whole of one C branch:
//
//   200-201  engulfing_u(): the hero is inside the target.
//   203-215  svc.context.forcefight. Its body is a comment, but the arm still
//            decides the return value, and force-fight is out of this port's
//            movement boundary.
//   229-259  a target the hero cannot spot needs display.c map_invisible().
//   261-292  a mimicking or hidden target needs seemimic(),
//            stumble_onto_mimic() or the hiding reveal, none of them ported.
//            C splits it into three tests; a mimic appearance or mundetected
//            is what all three have in common, and the pair is refused
//            together because the arm at 294-298 that follows them is the
//            same shape.
//   300-320  paranoid_query() for a peaceful target, and the Stormbringer
//            override above it.
//
// C caches glyph_at(gb.bhitpos) at 221 for the three glyph tests inside those
// arms; with every one of them stopping there is nothing left to read it.
export function attack_checks(mtmp, wep, state = game, env = {}) {
    const unsupported = requireAttackOperation(env, 'unsupported');

    mtmp.mstrategy &= ~STRAT_WAITMASK;

    if (engulfing_u(mtmp, state)) unsupported('attacking the engulfer');
    if (state.context?.forcefight) unsupported('force-fight attack');

    if (!canSpotMonster(mtmp, state))
        unsupported('attacking an unseen monster');
    if (M_AP_TYPE(mtmp) || mtmp.mundetected)
        unsupported('attacking a disguised or hidden monster');

    if (state.flags?.confirm && mtmp.mpeaceful
        && !intrinsicProperty(state.u, CONFUSION)
        && !Hallucination(state)
        && !intrinsicProperty(state.u, STUNNED)) {
        unsupported('confirming an attack on a peaceful monster');
    }

    return false;
}

// C ref: uhitm.c check_caitiff() (330-347). A Knight who strikes a helpless or
// fleeing target, or a Samurai who strikes a peaceful one, loses an alignment
// point. Both arms need attrib.c adjalign(), which has no port, so both stop.
// Every other hero runs the whole function and changes nothing.
export function check_caitiff(mtmp, state = game, env = {}) {
    const u = state.u;
    if (u.ualign.record <= -10) return;

    const role = state.urole?.mnum;
    if (role === PM_KNIGHT && u.ualign.type === A_LAWFUL
        && !is_undead(mtmp.data)
        && (helpless(mtmp) || (mtmp.mflee && !mtmp.mavenge))) {
        requireAttackOperation(env, 'unsupported')('knightly caitiff penalty');
    } else if (role === PM_SAMURAI && mtmp.mpeaceful) {
        requireAttackOperation(env, 'unsupported')('samurai giri penalty');
    }
}

// C ref: uhitm.c mon_maybe_unparalyze() (350-359). A paralyzed target has one
// chance in ten of shaking it off as the blow arrives. A target that can move
// never reaches the draw.
export function mon_maybe_unparalyze(mtmp, random = { rn2 }) {
    if (!mtmp.mcanmove) {
        if (!random.rn2(10)) {
            mtmp.mcanmove = 1;
            mtmp.mfrozen = 0;
        }
    }
}

// C ref: uhitm.c find_roll_to_hit() (363-427). How easy the hero finds it to
// hit `mtmp`; larger is easier, and the caller compares it with rnd(20). It
// makes no random-number call of its own.
//
// C writes *attk_count and *role_roll_penalty through pointers. `counters`
// carries both: `attknum` in and out, `role_roll_penalty` out.
//
// Its two maybe_polyd() reads, at 383 and 400, take their unpolymorphed
// halves, because polyself is unported and Upolyd() is constantly false;
// js/regen.js:52 records the same fact.
//
// The AT_KICK arm at 424-425 belongs to dokick.c and stops: this port has no
// caller for it, and reaching it would mean a kick had been routed here.
export function find_roll_to_hit(
    mtmp,
    aatyp,
    weapon,
    counters,
    state = game,
    env = {},
) {
    const u = state.u;
    counters.role_roll_penalty = 0; /* default is `none' */

    // you.h: Luck is the sum of u.uluck and u.moreluck.
    const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
    let tmp = 1 + abon(state) + find_mac(mtmp, state) + u.uhitinc
        + (sgn(luck) * Math.trunc((Math.abs(luck) + 2) / 3))
        + u.ulevel;

    /* some actions should occur only once during multiple attacks */
    if (!counters.attknum++) {
        /* knight's chivalry or samurai's giri */
        check_caitiff(mtmp, state, env);
    }

    /* adjust vs. monster state */
    if (mtmp.mstun) tmp += 2;
    if (mtmp.mflee) tmp += 2;
    if (mtmp.msleeping) tmp += 2;
    if (!mtmp.mcanmove) tmp += 4;

    /* role/race adjustments */
    if (state.urole?.mnum === PM_MONK) {
        if (state.uarm) {
            counters.role_roll_penalty = state.urole.spelarmr;
            tmp -= counters.role_roll_penalty;
        } else if (!state.uwep && !state.uarms) {
            tmp += Math.trunc(u.ulevel / 3) + 2;
        }
    }
    if (is_orc(mtmp.data) && state.urace?.mnum === PM_ELF) tmp++;

    /* encumbrance: with a lot of luggage, your agility diminishes */
    const tmp2 = requireAttackOperation(env, 'nearCapacity')(state);
    if (tmp2 !== 0) tmp -= (tmp2 * 2) - 1;
    if (u.utrap) tmp -= 3;

    /*
     * hitval applies if making a weapon attack while wielding a weapon;
     * weapon_hit_bonus applies if doing a weapon attack even bare-handed
     * or if kicking as martial artist
     */
    if (aatyp === AT_WEAP || aatyp === AT_CLAW) {
        if (weapon) tmp += hitval(weapon, mtmp, state, env);
        tmp += weapon_hit_bonus(weapon, state);
    } else {
        requireAttackOperation(env, 'unsupported')('kicked to-hit roll');
    }

    return tmp;
}

// C ref: uhitm.c do_attack() (446-583). The hero moves into a square holding a
// monster. Returns TRUE when the step is used up.
//
// The `is_safemon(mtmp) && !forcefight` arm at 461-509 covers the ordinary
// active starting pet only. The repeated-command boundary makes punishment,
// shops and Stormbringer unreachable there and preflights long worms,
// helplessness and obstructed source squares before this function can draw.
// Result false lets hack.c swap places; true consumes the move after the pet
// refuses. Everything from 511 on is the hostile arm.
export async function do_attack(monster, state = game, env = {}) {
    const random = env.random ?? { d, rn2, rnd };
    if (typeof random.rn2 !== 'function'
        || typeof random.rnd !== 'function') {
        throw new TypeError('do_attack random injection requires rn2 and rnd');
    }
    const unsupported = requireAttackOperation(env, 'unsupported');

    if (is_safemon(monster, state) && !state.context?.forcefight) {
        const message = requireAttackOperation(env, 'message');
        const stopRunning = requireAttackOperation(env, 'endRunning');
        const makeFlee = env.monFlee ?? monflee;
        if (typeof makeFlee !== 'function')
            throw new TypeError('do_attack requires monFlee');

        if (random.rn2(7)) return false;

        await makeFlee(monster, random.rnd(6), false, false, {
            ...env,
            state,
            random,
        });
        await message(
            `You stop.  ${capitalizedAlwaysVisibleMonsterName(monster, state)} `
                + 'is in the way!',
            state,
        );
        stopRunning(state);
        return true;
    }

    // 511-514. go.override_confirmation is written only by attack_checks()'s
    // Stormbringer arm, which stops below, and read only by known_hitum() at
    // 601 and hitum() at 797; both read it as FALSE, so it is not carried.
    // gb.bhitpos and gn.notonhead are set here too and are read only inside
    // arms that stop: attack_checks()'s glyph tests, and known_hitum()'s
    // hmon() and cutworm() calls.
    if (attack_checks(monster, state.uwep, state, env)) return true;

    // 516-521's `Upolyd && noattacks()` and 578-579's hmonas() arm cannot run:
    // polyself is unported, so Upolyd() is constantly false.

    // 523-526. check_capacity() prints and abandons the attack for an
    // overloaded hero. overexertion() spends the fight's extra nutrition and
    // makes the attempt's first random-number call, an rn2(20) inside
    // gethungry(). Both jump to atk_done, which returns TRUE.
    if (await requireAttackOperation(env, 'checkCapacity')(
        'You cannot fight while so heavily loaded.',
        state,
    )) {
        return true;
    }
    if (await requireAttackOperation(env, 'overexertion')(state)) return true;

    // 528-529. A hero still able to two-weapon falls straight through: C runs
    // nothing here and reaches the exercise below. can_twoweapon() is
    // wield.c's and fully ported, messages included, so evaluating it is
    // source-faithful; only its FALSE branch stops, because that is where
    // wield.c untwoweapon() takes over.
    if (state.u.twoweap && !(await can_twoweapon(state)))
        unsupported('ending two-weapon combat');

    // 531-541. wield.c setuwep() sets gu.unweapon for a hero holding something
    // that is not a weapon; the first swing clears it and, with `verbose` on,
    // announces what the hero is now bashing monsters with.
    if (state.unweapon) {
        state.unweapon = false;
        if (state.flags?.verbose) unsupported('first bash message');
    }

    // 543-545. exercise() draws rn2(19) while |AEXE(A_STR)| is under its
    // limit, so this is the attempt's second call. u_wipe_engr() draws only
    // where something is engraved under the hero.
    await exercise(A_STR, true, state, random, {
        encumberMessage: env.encumberMessage ?? encumber_msg,
    });
    /* andrew@orca: prevent unlimited pick-axe attacks */
    u_wipe_engr(3, { ...env, state, random });

    // 547-556. A leprechaun dodges the blow and the hero stumbles forward.
    // The arm needs monmove.c m_move(), so a leprechaun target stops here;
    // every other species fails mlet and never reaches its rn2(7).
    if (monster.data.mlet === S_LEPRECHAUN) unsupported('leprechaun dodge');

    // 580. C passes the whole mattk[] array and hitum() reads element 0.
    await hitum(monster, state.youmonst.data.mattk[0], state, env);
    monster.mstrategy &= ~STRAT_WAITMASK;

    // 570-577's map_invisible() needs svc.context.forcefight, on which
    // attack_checks() has already stopped.
    return true;
}

// C ref: uhitm.c known_hitum() (585-646). Delivers one already-decided swing.
// `mhit` carries the hit-or-miss decision in and back out, because the hit arm
// can downgrade a hit to a miss; the miss arm never does. C returns whether
// the target still lives, which is TRUE for every miss.
//
// Only the miss arm at 608-609 is ported; the hit arm at 610-644 needs hmon().
// `slice_or_chop`, computed at 599 for that arm's cutworm() call, is left out
// because nothing on the miss path reads it. go.override_confirmation at 601
// is constantly FALSE; see do_attack().
export async function known_hitum(
    mon,
    weapon,
    mhit,
    rollneeded,
    armorpenalty,
    uattk,
    dieroll,
    state = game,
    env = {},
) {
    if (!mhit.value) {
        await missum(
            mon,
            uattk,
            rollneeded + armorpenalty > dieroll,
            state,
            env,
        );
    } else {
        requireAttackOperation(env, 'unsupported')('melee damage');
    }
    return true;
}

// C ref: uhitm.c double_punch() (735-754). Whether a bare-handed hero tries a
// second blow. Skilled and better draw; Basic and Unskilled fail the
// `skl_lvl > P_BASIC` test first, so a hero who has not trained the skill
// never reaches the rn2(5).
export function double_punch(state = game, random = { rn2 }) {
    /* note: P_BARE_HANDED_COMBAT and P_MARTIAL_ARTS are equivalent */
    const skl_lvl = P_SKILL(P_BARE_HANDED_COMBAT, state);

    if (!state.uwep && !state.uarms && skl_lvl > P_BASIC)
        return (skl_lvl - P_BASIC) > random.rn2(5);
    return false;
}

// C ref: uhitm.c hitum() (756-813), first attack only. Rolls one swing, hands
// it to known_hitum() and then lets the target's passive counter-attack
// answer. Returns TRUE if the target still lives.
//
// The Cleaver arm at 769-771 needs hitum_cleave(). C also requires !u.twoweap,
// no engulfer, no holder and a diagonal-capable form before cleaving; this
// stops on the wielded artifact alone, because the arms those four terms would
// send it to are the ones below, which stop too.
//
// The second attack at 791-812 stops on gt.twohits, which is the only one of
// C's six gate terms that can be true here: the other five are decided by the
// hit arm and by passive(), both of which stop first.
export async function hitum(mon, uattk, state = game, env = {}) {
    const random = env.random ?? { d, rn2, rnd };
    const unsupported = requireAttackOperation(env, 'unsupported');
    const wepbefore = state.uwep;

    if (state.uwep?.oartifact === ART_CLEAVER) unsupported('Cleaver melee');

    /* 0: single hit, 1: first of two hits; affects strength bonus and
       silver rings; known_hitum() -> hmon() -> hmon_hitmon() will copy
       gt.twohits into struct _hitmon_data hmd.twohits */
    state.twohits = (state.uwep
        ? state.u.twoweap
        : double_punch(state, random)) ? 1 : 0;

    const counters = { attknum: 0, role_roll_penalty: 0 };
    const tmp = find_roll_to_hit(
        mon,
        uattk.aatyp,
        state.uwep,
        counters,
        state,
        env,
    );
    mon_maybe_unparalyze(mon, random);
    const dieroll = random.rnd(20);
    const mhit = { value: tmp > dieroll || state.u.uswallow };
    if (tmp > dieroll) {
        await exercise(A_DEX, true, state, random, {
            encumberMessage: env.encumberMessage ?? encumber_msg,
        });
    }

    /* gb.bhitpos is set up by caller */
    const malive = await known_hitum(
        mon,
        state.uwep,
        mhit,
        tmp,
        counters.role_roll_penalty,
        uattk,
        dieroll,
        state,
        env,
    );
    const wep_was_destroyed = Boolean(wepbefore && !state.uwep);
    await passive(
        mon,
        state.uwep,
        mhit.value,
        malive,
        AT_WEAP,
        wep_was_destroyed,
        state,
        env,
    );

    if (state.twohits) unsupported('second melee attack');
    state.twohits = 0;
    return malive;
}

// C ref: uhitm.c missum() (5197-5214). Reports a swing that did not land and
// wakes the target.
//
// mhitu.c could_seduce() at 5206 is constantly 0 here. Its last test rejects
// any aggressor that is neither an S_NYMPH nor PM_AMOROUS_DEMON, and the
// aggressor is gy.youmonst, whose data is the role's own species while
// Upolyd() is false. No role is either, so the call is left out rather than
// restated.
export async function missum(
    mdef,
    mattk,
    wouldhavehit,
    state = game,
    env = {},
) {
    const message = requireAttackOperation(env, 'message');

    if (wouldhavehit) /* monk is missing due to penalty for wearing suit */
        await message('Your armor is rather cumbersome...', state);

    if (canSpotMonster(mdef, state) && state.flags?.verbose)
        await message(`You miss ${monsterCommonName(mdef, state)}.`, state);
    else
        await message('You miss it.', state);
    if (!helpless(mdef)) await wakeup(mdef, true, { ...env, state });
}

// C ref: uhitm.c passive() (5863-6120). The target's passive counter-attack
// against the hero who just swung at it. C's return value is discarded by both
// of hitum()'s calls, so nothing is returned here.
//
// `i` lands on the first empty attack slot, whose damage dice decide `tmp` and
// whose damage type selects the arms below. A species whose attack list is
// full has no such slot and returns at 5876-5877.
//
// Every damage type but AD_PHYS stops. The first switch (5893-6011) needs
// passive_obj(), mdamageu(), erode_obj(), erode_armor() or done_in_by(); the
// second (6014-6109) needs mdamageu(), nomul(), make_stunned(), healmon() or
// split_mon(). AD_PHYS is the empty slot's own damage type and takes the
// default arm of both, so an ordinary monster's whole live contribution is the
// rn2(3) that guards the second switch, and only while it is alive.
export function passive(
    mon,
    weapon,
    mhitb,
    maliveb,
    aatyp,
    wep_was_destroyed,
    state = game,
    env = {},
) {
    const random = env.random ?? { d, rn2, rnd };
    const ptr = mon.data;
    let i = 0;

    for (;; i++) {
        if (i >= NATTK) return; /* no passive attacks */
        if (ptr.mattk[i].aatyp === AT_NONE) break; /* try this one */
    }
    /* Note: tmp not always used. Its value feeds only arms that stop, but the
       draw is C's and has to happen where C makes it. */
    if (ptr.mattk[i].damn) random.d(ptr.mattk[i].damn, ptr.mattk[i].damd);
    else if (ptr.mattk[i].damd) random.d(mon.m_lev + 1, ptr.mattk[i].damd);

    if (ptr.mattk[i].adtyp !== AD_PHYS)
        requireAttackOperation(env, 'unsupported')('passive counter-attack');

    /* 6013. C's guard is `malive && !mon->mcan && rn2(3)`, and with every
       damage type but AD_PHYS stopped above, the switch it guards has only its
       do-nothing default arm left. The draw happens exactly where C makes it
       and its value decides nothing. */
    if (maliveb && !mon.mcan) random.rn2(3);
}
