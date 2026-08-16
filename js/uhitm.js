// Hero-versus-monster interaction owned by uhitm.c.

import {
    ART_CLEAVER,
    ART_OGRESMASHER,
    ART_SNICKERSNEE,
    ART_TROLLSBANE,
    artifact_light,
    permapoisoned,
} from './artifacts.js';
import { exercise } from './attrib.js';
import {
    A_DEX,
    A_LAWFUL,
    A_STR,
    CONFUSION,
    HALLUC,
    HALLUC_RES,
    HMON_APPLIED,
    HMON_MELEE,
    IS_DOOR,
    M_ATTK_HIT,
    M_SEEN_ELEC,
    NATTK,
    P_BARE_HANDED_COMBAT,
    P_BASIC,
    P_KNIFE,
    P_LANCE,
    P_NONE,
    P_SKILLED,
    P_WHIP,
    SHOCK_RES,
    STRAT_WAITMASK,
    STUNNED,
    W_ARMG,
    W_RINGL,
    W_RINGR,
    engulfing_u,
    helpless,
    isok,
    M_AP_TYPE,
} from './const.js';
import {
    capitalizedAlwaysVisibleMonsterName,
    monsterCommonName,
} from './do_name.js';
import { u_wipe_engr } from './engrave.js';
import { game } from './gstate.js';
import { doorless_door } from './hack.js';
import { sgn } from './hacklib.js';
// js/mhitu.js imports mhitm_adtyping() and mhitm_knockback() from this file,
// so this edge closes an import cycle, exactly as mhitu.c and uhitm.c call
// into each other. Both bindings are hoisted function declarations, which an
// ES module cycle initializes before either module body runs, and nothing here
// reads them at module scope.
import { hitmsg, magic_negation } from './mhitu.js';
import { killed, wakeup } from './mon.js';
import {
    amorphous,
    attacktype,
    bigmonst,
    is_orc,
    is_undead,
    is_watch,
    is_whirly,
    mon_hates_light,
    mon_hates_silver,
    monsndx,
    monstunseesu,
    noncorporeal,
    sticks,
    thick_skinned,
} from './mondata.js';
import { monflee } from './monmove.js';
import { m_at } from './monst.js';
import {
    AD_ACID,
    AD_BLND,
    AD_COLD,
    AD_CONF,
    AD_CORR,
    AD_CURS,
    AD_DCAY,
    AD_DETH,
    AD_DGST,
    AD_DISE,
    AD_DRCO,
    AD_DRDX,
    AD_DREN,
    AD_DRIN,
    AD_DRLI,
    AD_DRST,
    AD_ELEC,
    AD_ENCH,
    AD_FAMN,
    AD_FIRE,
    AD_HALU,
    AD_HEAL,
    AD_LEGS,
    AD_PEST,
    AD_PHYS,
    AD_PLYS,
    AD_POLY,
    AD_RUST,
    AD_SAMU,
    AD_SEDU,
    AD_SGLD,
    AD_SITM,
    AD_SLEE,
    AD_SLIM,
    AD_SLOW,
    AD_SSEX,
    AD_STCK,
    AD_STON,
    AD_STUN,
    AD_TLPT,
    AD_WERE,
    AD_WRAP,
    AT_BUTT,
    AT_CLAW,
    AT_ENGL,
    AT_HUGS,
    AT_KICK,
    AT_NONE,
    AT_TUCH,
    AT_WEAP,
    PM_BARBARIAN,
    PM_BLACK_PUDDING,
    PM_BROWN_PUDDING,
    PM_ELF,
    PM_HEALER,
    PM_KNIGHT,
    PM_MONK,
    PM_PURPLE_WORM,
    PM_ROGUE,
    PM_SAMURAI,
    PM_SHADE,
    PM_SHRIEKER,
    S_BLOB,
    S_EYE,
    S_FUNGUS,
    S_LEPRECHAUN,
    S_TROLL,
} from './monsters.js';
import {
    is_ammo,
    is_launcher,
    is_missile,
    is_weptool,
    objectType,
} from './obj.js';
import { cxname } from './objnam.js';
import {
    GEM_CLASS,
    IRON,
    KATANA,
    METAL,
    NO_MATERIAL,
    SILVER,
    WEAPON_CLASS,
} from './objects.js';
import { encumber_msg } from './pickup.js';
import { d, rn2, rnd } from './rng.js';
import { canSeeMonster, canSpotMonster } from './startup_a11y.js';
import { P_SKILL, weapon_type } from './startup_skills.js';
import {
    UnsupportedWeaponSkillError,
    abon,
    dbon,
    dmgval,
    hitval,
    martial_bonus,
    special_dmgval,
    use_skill,
    uwep_skill_type,
    weapon_dam_bonus,
    weapon_hit_bonus,
} from './weapon.js';
import { can_twoweapon } from './wield.js';
import {
    bimanual,
    find_mac,
    is_pole,
} from './worn.js';
import { exclam } from './zap.js';

function intrinsicProperty(hero, index) {
    return Boolean(hero?.uprops?.[index]?.intrinsic);
}

function propertyPresent(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
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

// C ref: uhitm.c mhitm_mgc_atk_negated() (74-98). Whether the defender's
// magic cancellation thwarts the attack before its damage type is applied.
//
// `verbosely` is C's. Every ported call site passes TRUE, and so do most of
// C's; mhitm_ad_dren():2422, mhitm_ad_drst():3126 and mhitm_ad_stck():3310 are
// three of the arms that pass FALSE, and none of them is ported.
//
// The draw is unconditional once the attacker is uncancelled, so a defender
// with no cancellation at all still spends it: `rn2(10) >= 0` is always true,
// which is why an unarmored hero is never spared and the roll still shows in
// the log.
export async function mhitm_mgc_atk_negated(
    magr,
    mdef,
    verbosely,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const message = requireAttackOperation(env, 'message');

    /* mcan doesn't apply to youmonst; hero can't be cancelled */
    if (magr !== state.youmonst && magr.mcan)
        return true; /* no message if attacker has been cancelled */

    const armpro = magic_negation(mdef, state);
    const negated = !(random.rn2(10) >= 3 * armpro);
    if (negated) {
        /* attack has been thwarted by negation, aka magical cancellation */
        if (verbosely) {
            // C's second arm, `else if (gv.vis && canseemon(mdef))`, announces
            // a monster defender's escape. magic_negation() above covers the
            // hero alone and throws for a monster, so that arm is unreachable
            // and is left out rather than restated.
            await message('You avoid harm.', state);
        }
        return true;
    }
    return false;
}

// C ref: uhitm.c attack_checks() (188-327). FALSE means it is fine to attack.
// The ordinary melee case -- a spotted, undisguised, hostile target -- reaches
// the closing `return FALSE` at 326 having done nothing but clear the wait
// strategy at 196.
//
// The force-fight arm at 201-214 is the second way through, and its position
// is the whole of what the 'F' prefix buys: it returns FALSE above every arm
// below, so a forced blow lands without any of the questions they ask. C's
// body is entirely commented out; the 'I' marker it once drew moved to
// do_attack()'s tail at 577-580, so that a target killed by the blow does not
// blank the square's remembered contents.
//
// Four arms stop instead of porting, and each is the whole of one C branch:
//
//   198-199  engulfing_u(): the hero is inside the target.
//   230-252  a target the hero cannot spot needs display.c map_invisible().
//   254-297  a mimicking or hidden target needs seemimic(),
//            stumble_onto_mimic() or the hiding reveal, none of them ported.
//            C splits it into three tests; a mimic appearance or mundetected
//            is what all three have in common, and the pair is refused
//            together because the arm at 299-306 that follows them is the
//            same shape. A forced blow returns above all three, as C does, and
//            a mimic that reaches the swing stops instead at mon.c wakeup()'s
//            own mimic arm.
//   308-324  paranoid_query() for a peaceful target, and the Stormbringer
//            override above it.
//
// C caches glyph_at(gb.bhitpos) at 220 for the three glyph tests inside those
// arms; with every one of them stopping there is nothing left to read it.
export function attack_checks(mtmp, wep, state = game, env = {}) {
    const unsupported = requireAttackOperation(env, 'unsupported');

    mtmp.mstrategy &= ~STRAT_WAITMASK;

    if (engulfing_u(mtmp, state)) unsupported('attacking the engulfer');

    if (state.context?.forcefight) {
        // C's own canspotmon() test here is inside the commented-out block,
        // so this one is not C's: it is where the port pays for do_attack()'s
        // unported tail. That tail marks an unspottable survivor with
        // map_invisible(), and refusing the unspottable target before the
        // blow is what keeps it out of reach. A target the hero can spot --
        // the case 'F' is normally pressed for -- runs the whole attack.
        if (!canSpotMonster(mtmp, state))
            unsupported('force-fight at a monster the hero cannot spot');
        return false;
    }

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
// point. Both arms call attrib.c adjalign(-1), and adjalign()'s loss arm stops
// because it reaches mon.c adj_erinys(); the refusals stay here so the reason
// names the Knight and the Samurai rather than the alignment helper. Every
// other hero runs the whole function and changes nothing.
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

    // 577-580. C marks the square with an 'I' when a forced blow leaves a
    // target the hero cannot spot alive. display.c map_invisible() is
    // unported, and nothing in this port reaches it: attack_checks() admits a
    // force-fight only against a target the hero can spot, and the arms
    // between there and here that could take that back stop before they get
    // to. passive() refuses every counter-attack damage type but AD_PHYS, so
    // no blow blinds the hero, and mhitm_knockback() refuses the knockback
    // that could carry the target out of sight. C's own glyph term contributes
    // nothing either way: glyph_is_invisible() is constantly false here,
    // because map_invisible() is the only writer of the marker it reads, and
    // C's conjunct is the negation `!glyph_is_invisible(...)`, so it is
    // constantly true. What keeps the tail out of reach is the spot check
    // attack_checks() now performs, together with !DEADMONSTER(mtmp).
    return true;
}

// C ref: uhitm.c known_hitum() (585-646). Delivers one already-decided swing.
// `mhit` carries the hit-or-miss decision in and back out, because the hit arm
// can downgrade a hit to a miss; the miss arm never does. C returns whether
// the target still lives, which is TRUE for every miss.
//
// `slice_or_chop`, computed at 599 for the hit arm's cutworm() call, is left
// out: no target this port reaches has a wormno, so the cutworm() call at
// 642-643 that reads it stops first. go.override_confirmation at 601 is
// constantly FALSE; see do_attack().
//
// gn.notonhead at 620 records whether the blow landed on a long worm's tail
// rather than its head. Only hmon_hitmon()'s potion and misc-object arms read
// it, and both stop, so it is not carried.
//
// The morale check at 623-631 stops. It is guarded by !rn2(25), whose draw C
// makes for every survived hit, and reaching it needs mon.c set_ustuck().
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
    const random = env.random ?? { d, rn2, rnd };
    let malive = true;

    if (!mhit.value) {
        await missum(
            mon,
            uattk,
            rollneeded + armorpenalty > dieroll,
            state,
            env,
        );
    } else {
        const oldhp = mon.mhp;
        const oldweaphit = state.u.uconduct.weaphit;

        /* KMH, conduct */
        if (weapon && (weapon.oclass === WEAPON_CLASS
                       || is_weptool(weapon, state)))
            state.u.uconduct.weaphit++;

        /* we hit the monster; be careful: it might die or
           be knocked into a different location */
        malive = await hmon(mon, weapon, HMON_MELEE, dieroll, state, env);
        if (malive) {
            /* monster still alive */
            if (!random.rn2(25) && mon.mhp < Math.trunc(mon.mhpmax / 2)
                && !engulfing_u(mon, state)) {
                requireAttackOperation(env, 'unsupported')(
                    'a wounded monster losing its nerve',
                );
            }
            /* Vorpal Blade hit converted to miss */
            /* could be headless monster or worm tail */
            if (mon.mhp === oldhp) {
                mhit.value = false;
                /* a miss does not break conduct */
                state.u.uconduct.weaphit = oldweaphit;
            }
            if (mon.wormno && mhit.value)
                requireAttackOperation(env, 'unsupported')('cutting a worm');
        }
    }
    return malive;
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

// C ref: uhitm.c hitum() (756-815). Rolls one swing, hands it to known_hitum()
// and then lets the target's passive counter-attack answer; a hero fighting
// with two weapons, or punching well enough for double_punch(), swings a second
// time at 797-812. Returns TRUE if the target still lives.
//
// The Cleaver arm at 769-771 needs hitum_cleave(). C also requires !u.twoweap,
// no engulfer, no holder and a diagonal-capable form before cleaving; this
// stops on the wielded artifact alone, because the arms those four terms would
// send it to are the ones below, which stop too.
//
// Three of the six terms guarding the second attack are constantly false here
// and are left out rather than restated:
//
//   go.override_confirmation  written only by attack_checks()'s Stormbringer
//                             arm, which stops; do_attack() records the same.
//   gm.multi < 0              a passive counter-attack that paralysed the hero.
//                             C reads it after the passive() call above, so it
//                             answers TRUE only for a paralysis inflicted
//                             during this call. Two facts keep it false. The
//                             hero cannot already be counting a negative multi:
//                             allmain.c moveloop_core() reads no key then, so
//                             no attack command can begin -- js/pray.js
//                             dopray()'s `nomul(-3)` is the port's one writer
//                             of a negative value, and the three turns it buys
//                             pass without reaching rhack(). And nothing this
//                             function calls can turn it negative: uhitm.c's
//                             paralysing arm is AD_PLYS in passive()'s second
//                             switch, and passive() below stops for every
//                             damage type but AD_PHYS before reaching it.
//                             Port that arm and this term becomes live.
//   u.umortality > oldumort   the hero killed by that counter-attack and then
//                             life-saved. `grep -rn 'umortality' js/` returns
//                             one hit, js/u_init.js:214, which initializes it
//                             to 0; nothing increments it.
//
// The two that remain are written out, and only one of them can currently
// decide anything. `m_at(x, y) != mon` is live: the second swing is aimed at
// the square the step was, so a target that is no longer standing there is not
// struck again. `!malive` is C's own first answer to the same question, but in
// this port it can only be true where the m_at test is: killing a monster ends
// at mon.c m_detach() -> mon_leaving_level(), which takes it off the map, and
// hmon_hitmon() has no other way to return FALSE with the target still
// standing. Deleting the term leaves all 3,113 tests passing. It stays because
// it is C's, and because a later arm -- lifesaved_monster(), or a knockback
// that kills -- can separate the two.
export async function hitum(mon, uattk, state = game, env = {}) {
    const random = env.random ?? { d, rn2, rnd };
    const unsupported = requireAttackOperation(env, 'unsupported');
    const wepbefore = state.uwep;
    const secondwep = state.u.twoweap ? state.uswapwep : null;
    const x = state.u.ux + state.u.dx;
    const y = state.u.uy + state.u.dy;

    if (state.uwep?.oartifact === ART_CLEAVER) unsupported('Cleaver melee');

    /* 0: single hit, 1: first of two hits; affects strength bonus and
       silver rings; known_hitum() -> hmon() -> hmon_hitmon() will copy
       gt.twohits into struct _hitmon_data hmd.twohits */
    state.twohits = (state.uwep
        ? state.u.twoweap
        : double_punch(state, random)) ? 1 : 0;

    const counters = { attknum: 0, role_roll_penalty: 0 };
    let tmp = find_roll_to_hit(
        mon,
        uattk.aatyp,
        state.uwep,
        counters,
        state,
        env,
    );
    mon_maybe_unparalyze(mon, random);
    let dieroll = random.rnd(20);
    const mhit = { value: tmp > dieroll || state.u.uswallow };
    if (tmp > dieroll) {
        await exercise(A_DEX, true, state, random, {
            encumberMessage: env.encumberMessage ?? encumber_msg,
        });
    }

    /* gb.bhitpos is set up by caller */
    let malive = await known_hitum(
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

    /* second attack for two-weapon combat or skilled unarmed combat;
       won't occur if Stormbringer overrode confirmation (assumes
       Stormbringer is primary weapon), or if hero became paralyzed by
       passive counter-attack, or if hero was killed by passive
       counter-attack and got life-saved, or if monster was killed or
       knocked to different location */
    if (state.twohits && malive && m_at(x, y, state) === mon) {
        state.twohits = 2; /* second of 2 hits */
        // C reads the live uswapwep for the to-hit number but hands
        // known_hitum() the `secondwep` it captured on entry. The two differ
        // for a bare-handed double punch, which leaves uswapwep alone and
        // strikes with nothing.
        tmp = find_roll_to_hit(
            mon,
            uattk.aatyp,
            state.uswapwep,
            counters,
            state,
            env,
        );
        mon_maybe_unparalyze(mon, random);
        dieroll = random.rnd(20);
        // C reassigns its `mhit` local; known_hitum() may still downgrade the
        // hit to a miss below, and the passive() guard reads what it left.
        mhit.value = tmp > dieroll || state.u.uswallow;
        // 783's exercise(A_DEX, TRUE) has no counterpart here: only the first
        // swing of a turn exercises Dexterity.
        malive = await known_hitum(
            mon,
            secondwep,
            mhit,
            tmp,
            counters.role_roll_penalty,
            uattk,
            dieroll,
            state,
            env,
        );
        /* second passive counter-attack only occurs if second attack hits */
        if (mhit.value) {
            await passive(
                mon,
                secondwep,
                mhit.value,
                malive,
                AT_WEAP,
                Boolean(secondwep && !state.uswapwep),
                state,
                env,
            );
        }
    }
    state.twohits = 0;
    return malive;
}

// C ref: uhitm.c hmon() (817-834). The wrapper every hit goes through. Its own
// body is two consequences of striking a monster the town protects.
//
// `anger_guards` is computed at 826-828, before hmon_hitmon() runs, and the
// priest's rn2(2) at 830 is drawn only for a priest target. Both refuse here
// rather than after the call, so neither spends the damage roll first.
export async function hmon(mon, obj, thrown, dieroll, state = game, env = {}) {
    const unsupported = requireAttackOperation(env, 'unsupported');

    // 819-822. Only known_hitum() calls this, always with HMON_MELEE.
    // dothrow.c, dokick.c and apply.c own the other three values and none of
    // them is ported, so no caller can send one.
    if (thrown !== HMON_MELEE) unsupported('ranged or applied hit');

    // 830-831 ghod_hitsu() and 832-833 angry_guards().
    if (mon.ispriest) unsupported('striking a temple priest');
    if (mon.mpeaceful && (mon.isshk || is_watch(mon.data)))
        unsupported('angering the town guards');

    return hmon_hitmon(mon, obj, thrown, dieroll, state, env);
}

// C ref: uhitm.c hmon_hitmon_barehands() (837-882). Damage for a hero striking
// with a fist, and the blessed-gloves or silver-ring bonus that rides on it.
//
// A shade takes nothing from a fist, and unlike the weapon arm at 892 C does
// not consult shade_glare() here. The feedback that says so is
// hmon_hitmon():1821's shade_miss(), which is where the shade case stops.
async function hmon_hitmon_barehands(hmd, mon, state, env, random) {
    const silverhit = { silverhit: 0 }; /* worn masks */

    if (hmd.mdat === state.mons[PM_SHADE]) {
        hmd.dmg = 0;
    } else {
        /* note: 1..2 or 1..4 can be substantially increased by
           strength bonus or skill bonus, usually both... */
        hmd.dmg = random.rnd(martial_bonus(state) ? 4 : 2);
        hmd.use_weapon_skill = true;
        hmd.train_weapon_skill = (hmd.dmg > 1);
    }

    /* Blessed gloves give bonuses when fighting 'bare-handed'.  So do
       silver rings.  Note:  rings are worn under gloves, so you don't
       get both bonuses, and two silver rings don't give double bonus.
       When making only one hit, both rings are checked (backwards
       compatibility => playability), but when making two hits, only the
       ring on the hand making the attack is checked. */
    const spcdmgflg = state.uarmg ? W_ARMG
        : (((hmd.twohits === 0 || hmd.twohits === 1) ? W_RINGR : 0)
           | ((hmd.twohits === 0 || hmd.twohits === 2) ? W_RINGL : 0));
    hmd.dmg += special_dmgval(
        state.youmonst, mon, spcdmgflg, silverhit, state, { ...env, random },
    );

    /* copy silverhit info back into struct _hitmon_data *hmd */
    switch (hmd.twohits) {
    case 0: /* only one hit being attempted; a silver ring on either hand
             * applies but having silver rings on both is same as just one */
        hmd.barehand_silver_rings =
            (silverhit.silverhit & (W_RINGR | W_RINGL)) ? 1 : 0;
        break;
    case 1: /* first of two or more hit attempts; right ring applies */
        hmd.barehand_silver_rings = (silverhit.silverhit & W_RINGR) ? 1 : 0;
        break;
    case 2: /* second of two or more hit attempts; left ring applies */
        hmd.barehand_silver_rings = (silverhit.silverhit & W_RINGL) ? 1 : 0;
        break;
    default: /* third or later of more than two hit attempts (poly'd hero);
              * rings were applied on first and second hits */
        hmd.barehand_silver_rings = 0;
        break;
    }
    if (hmd.barehand_silver_rings > 0) hmd.silvermsg = true;
}

// C ref: uhitm.c backstabbable() (920-931). Whether a Rogue may strike this
// target from behind. The last term is the one that changes during a fight;
// the six before it are fixed properties of the species.
function backstabbable(mon, state) {
    return !amorphous(mon.data)
        && !is_whirly(mon.data)
        && !noncorporeal(mon.data)
        && mon.data.mlet !== S_BLOB
        && mon.data.mlet !== S_EYE
        && mon.data.mlet !== S_FUNGUS
        && canSeeMonster(mon, state)
        && Boolean(mon.mflee || helpless(mon));
}

// C ref: uhitm.c hmon_hitmon_weapon_melee() (933-1067). Damage for a wielded
// weapon, weapon-tool or gem swung in melee, and the flags the messages below
// read off it.
//
// Five arms stop, each the whole of one C branch:
//
//   979-1010  the dieroll == 2 shatter of a defender's weapon. It needs
//             Yobjnam2() and m_useupall(); C reaches it only for a hero at
//             P_SKILLED or better swinging a two-handed weapon (or a
//             Samurai's katana) at a monster that is wielding something.
//   1013-1030 artifact_hit(). Guarded by obj->oartifact, which is 0 for every
//             ordinary weapon.
//   1043-1049 joust(), for a lance used from a saddle.
//   1050-1063 the HMON_THROWN ammunition bonuses. hmon() admits only
//             HMON_MELEE, so `thrown` is 0 here and both tests fail.
//   1065-1066 permapoisoned(), which only Grimtooth satisfies; its
//             hmon_hitmon_poison() owner is unported.
async function hmon_hitmon_weapon_melee(hmd, mon, obj, state, env, random) {
    const unsupported = requireAttackOperation(env, 'unsupported');

    /* "normal" weapon usage */
    hmd.use_weapon_skill = true;
    hmd.dmg = dmgval(obj, mon, state, { ...env, random });
    /* a minimal hit doesn't exercise proficiency */
    hmd.train_weapon_skill = (hmd.dmg > 1);

    /* Healer with anatomy knowledge */
    if (state.urole?.mnum === PM_HEALER && hmd.hand_to_hand
        && obj.oclass === WEAPON_CLASS
        && objectType(obj, state).oc_subtyp === P_KNIFE) {
        hmd.dmg += Math.min(
            3,
            Math.trunc(state.svm.mvitals[monsndx(mon.data)].died / 6),
        );
    }

    /* special attack actions */
    if (!hmd.train_weapon_skill || mon === state.u.ustuck || state.u.twoweap
        /* Cleaver can hit up to three targets at once so don't
           let it also hit from behind or shatter foes' weapons */
        || (hmd.hand_to_hand && obj.oartifact === ART_CLEAVER)) {
        ; /* no special bonuses */
    } else if (state.urole?.mnum === PM_ROGUE && backstabbable(mon, state)
               /* multi-shot throwing is too powerful here */
               && hmd.hand_to_hand) {
        await requireAttackOperation(env, 'message')(
            `You strike ${monsterCommonName(mon, state)} from behind!`,
            state,
        );
        hmd.dmg += random.rnd(state.u.ulevel);
        hmd.hittxt = true;
    } else if (hmd.dieroll === 2 && obj === state.uwep
               && obj.oclass === WEAPON_CLASS
               && (bimanual(obj, state)
                   || (state.urole?.mnum === PM_SAMURAI
                       && obj.otyp === KATANA && !state.uarms))
               && uwep_skill_type(state) !== P_NONE
               && P_SKILL(uwep_skill_type(state), state) >= P_SKILLED
               && mon.mw /* MON_WEP() */) {
        unsupported('shattering a monster weapon');
    }

    if (obj.oartifact) unsupported('artifact melee hit');
    if (hmd.material === SILVER && mon_hates_silver(mon)) {
        hmd.silvermsg = hmd.silverobj = true;
    }
    if (artifact_light(obj) && obj.lamplit && mon_hates_light(mon))
        hmd.lightobj = true;
    if (state.u.usteed && !hmd.thrown && hmd.dmg > 0
        && weapon_type(obj, state) === P_LANCE && mon !== state.u.ustuck) {
        unsupported('jousting from a saddle');
    }
    if (permapoisoned(obj) && hmd.dieroll <= 5)
        unsupported('a permanently poisoned weapon');
}

// C ref: uhitm.c hmon_hitmon_weapon() (1069-1092). Chooses between the melee
// and the ranged damage arms for a weapon, weapon-tool or gem.
//
// hmon_hitmon_weapon_ranged() (884-918) stops. It covers bashing with
// something meant to be launched or thrown -- a wielded bow, dart or arrow --
// and needs the BOOMERANG return arm at 901-917 that gives the weapon back to
// the hero.
//
// C's four tests are written against `hmd->thrown`, which hmon() fixes at
// HMON_MELEE. That makes `!hmd->thrown` hold in the second and third, and makes
// the fourth's `thrown != HMON_THROWN` hold and short-circuit
// ammo_and_launcher(), leaving `is_ammo(obj)` -- which the second already
// covers. The three that remain are written here.
async function hmon_hitmon_weapon(hmd, mon, obj, state, env, random) {
    /* is it not a melee weapon? */
    if (/* if you strike with a bow... */
        is_launcher(obj, state)
        /* or strike with a missile in your hand... */
        || is_missile(obj, state) || is_ammo(obj, state)
        /* or use a pole at short range and not mounted... */
        || (!state.u.usteed && is_pole(obj, state)
            && obj.oartifact !== ART_SNICKERSNEE)) {
        requireAttackOperation(env, 'unsupported')(
            'hitting with a launcher or ammunition',
        );
    } else {
        await hmon_hitmon_weapon_melee(hmd, mon, obj, state, env, random);
    }
}

// C ref: uhitm.c hmon_hitmon_do_hit() (1386-1433). Rolls the blow's base
// damage, dispatching on what the hero swung.
//
// Three arms stop:
//
//   1398-1406 a thrown or kicked stone missile against a rock-passing target.
//             hmon() admits only HMON_MELEE, so neither value can arrive.
//   1412-1413 bare_artifactname(), for a lit Sunsword whose name the messages
//             need after the object may have been destroyed.
//   1420-1431 hmon_hitmon_potion() and hmon_hitmon_misc_obj(), which cover
//             hitting with a potion or with something that is not a weapon
//             at all.
async function hmon_hitmon_do_hit(hmd, mon, obj, state, env, random) {
    const unsupported = requireAttackOperation(env, 'unsupported');

    if (!obj) { /* attack with bare hands */
        await hmon_hitmon_barehands(hmd, mon, state, env, random);
    } else {
        /* remember obj's name since it might end up being destroyed and
           we'll want to use it after that */
        if (!(artifact_light(obj) && obj.lamplit))
            hmd.saved_oname = cxname(obj, state);
        else
            unsupported('naming a lit artifact light source');

        if (obj.oclass === WEAPON_CLASS || is_weptool(obj, state)
            || obj.oclass === GEM_CLASS) {
            await hmon_hitmon_weapon(hmd, mon, obj, state, env, random);
        /* attacking with non-weapons */
        } else {
            unsupported('hitting with a non-weapon');
        }
    }
}

// C ref: uhitm.c hmon_hitmon_dmg_recalc() (1435-1507). Adds the damage-ring,
// strength and weapon-skill bonuses, and trains the skill.
//
// Three of C's tests are decided by `hmd->thrown`, which hmon() fixes at
// HMON_MELEE. `thrown != HMON_THROWN` at 1466 holds, so the propellor
// exemption never applies and both bonuses are always added. PROJECTILE(obj)
// at 1497 is unreachable, because a projectile swung in melee took
// hmon_hitmon_weapon()'s ranged arm and never set use_weapon_skill. And
// `hmd->thrown ? weapon_type(skillwep) : uwep_skill_type()` at 1508-1509
// always takes its second half.
function hmon_hitmon_dmg_recalc(hmd, obj, state, env) {
    let dmgbonus = 0;

    /*
     * Potential bonus (or penalty) from worn ring of increase damage
     * (or intrinsic bonus from eating same) or from strength.  Strength
     * bonus is increased for melee with two-handed weapons and decreased
     * for dual attacks (but when both hit, the total for the two is more
     * than the bonus for a regular single hit).
     */
    if (hmd.get_dmg_bonus) {
        /* for dual attacks, udaminc applies to both, and two-handed
           weapons use it as-is */
        dmgbonus = state.u.udaminc;
        /* throwing using a propellor gets an increase-damage bonus
           but not a strength one; other attacks get both;
           for dual attacks, 3/4 of the strength bonus is used; when
           both attacks hit, overall bonus is 3/2 rather than doubled;
           melee hit with two-handed weapon uses 3/2 strength bonus to
           approximately match double hit with two-weapon ('approximate'
           because udaminc skews in favor of two-weapon); the 3/2 factor
           for two-handed strength does not apply to polearms unless
           hero is simply bashing with one of those and does not apply
           to jousting because lances are one-handed */
        let strbonus = dbon(state);
        const absbonus = Math.abs(strbonus);
        if (hmd.twohits)
            strbonus = Math.trunc((3 * absbonus + 2) / 4) * sgn(strbonus);
        else if (hmd.thrown === HMON_MELEE && state.uwep
                 && bimanual(state.uwep, state))
            strbonus = Math.trunc((3 * absbonus + 1) / 2) * sgn(strbonus);
        dmgbonus += strbonus;
    }

    /*
     * Potential bonus (or penalty) from weapon skill.
     * 'use_weapon_skill' is True for hand-to-hand ordinary weapon,
     * applied or jousting polearm or lance, thrown missile (dart,
     * shuriken, boomerang), or shot ammo (arrow, bolt, rock/gem when
     * wielding corresponding launcher).
     * It is False for hand-to-hand or thrown non-weapon, hand-to-hand
     * polearm or lance when not mounted, hand-to-hand missile or ammo
     * or launcher, thrown non-missile, or thrown ammo (including rocks)
     * when not wielding corresponding launcher.
     */
    if (hmd.use_weapon_skill) {
        const skillwep = obj;

        dmgbonus += weapon_dam_bonus(skillwep, state);

        /* hit for more than minimal damage (before being adjusted
           for damage or skill bonus) trains the skill toward future
           enhancement */
        if (hmd.train_weapon_skill) {
            /* [this assumes that `!thrown' implies wielded...] */
            try {
                use_skill(uwep_skill_type(state), 1, state);
            } catch (error) {
                if (!(error instanceof UnsupportedWeaponSkillError)) throw error;
                requireAttackOperation(env, 'unsupported')(error.branch);
            }
        }
    }

    /* apply combined damage+strength and skill bonuses */
    hmd.dmg += dmgbonus;
    /* don't let penalty, if bonus is negative, turn a hit into a miss */
    if (hmd.dmg < 1) hmd.dmg = 1;
}

// C ref: uhitm.c hmon_hitmon_stagger() (1569-1585). A martial-arts punch can
// knock a small target off its feet. The rnd(100) is drawn for every
// bare-handed hit above minimal damage, and at Basic skill it clears the bar
// one time in a hundred; what follows it needs mhurtle_to_doom(), so the arm
// the draw guards stops. C's `mon` parameter is read only inside that arm, by
// canspotmon() and mhurtle_to_doom(), so it is not carried.
function hmon_hitmon_stagger(hmd, state, env, random) {
    /* VERY small chance of stunning opponent if unarmed. */
    if (random.rnd(100) < P_SKILL(P_BARE_HANDED_COMBAT, state)
        && !bigmonst(hmd.mdat) && !thick_skinned(hmd.mdat)) {
        requireAttackOperation(env, 'unsupported')('a staggering punch');
    }
}

// C ref: uhitm.c hmon_hitmon_pet() (1587-1601). Hitting a pet costs tameness
// and sends it fleeing. abuse_dog() is unported, so a tame target stops; every
// hostile one runs the whole function and changes nothing.
function hmon_hitmon_pet(hmd, mon, env) {
    if (mon.mtame && hmd.dmg > 0)
        requireAttackOperation(env, 'unsupported')('hitting a pet');
}

// C ref: uhitm.c hmon_hitmon_splitmon() (1603-1634). An iron or metal melee
// weapon divides a pudding. clone_mon() is unported, so a pudding that meets
// every one of C's tests stops; any other species fails the first one and the
// rest are never evaluated.
function hmon_hitmon_splitmon(hmd, mon, obj, state, env) {
    if ((hmd.mdat === state.mons[PM_BLACK_PUDDING]
         || hmd.mdat === state.mons[PM_BROWN_PUDDING])
        /* pudding is alive and healthy enough to split */
        && mon.mhp > 1 && !mon.mcan && !hmd.offmap
        /* iron weapon using melee or polearm hit [3.6.1: metal weapon too;
           also allow either or both weapons to cause split when twoweap] */
        && obj && (obj === state.uwep
                   || (state.u.twoweap && obj === state.uswapwep))
        && ((hmd.material === IRON
             /* allow scalpel and tsurugi to split puddings */
             || hmd.material === METAL)
            /* but not bashing with darts, arrows or ya */
            && !(is_ammo(obj, state) || is_missile(obj, state)))
        && hmd.hand_to_hand) {
        requireAttackOperation(env, 'unsupported')('splitting a pudding');
    }
}

// C ref: uhitm.c hmon_hitmon_msg_hit() (1636-1660). "You hit the lichen!" and
// its variants. Nothing is printed when the blow killed the target: the guard
// at 1641-1645 requires !destroyed, and killed() speaks for that case instead.
//
// The `thrown` arm at 1646-1647 needs mshot_xname(); hmon() admits only
// HMON_MELEE, so the whole `(thrown && ...)` disjunct of the guard is FALSE
// too and the guard reduces to `!hittxt && !destroyed`.
//
// Two of C's four verbs are left out because hmon_hitmon_do_hit() cannot
// deliver an object that would select them. "bash" needs is_shield(), which is
// ARMOR_CLASS, or a HEAVY_IRON_BALL, which is BALL_CLASS; the wet-towel half of
// "lash" needs a TOWEL, whose oc_skill is P_NONE so is_weptool() rejects it.
// All three reach do_hit()'s closing arm at 1425-1431 and stop there.
async function hmon_hitmon_msg_hit(hmd, mon, obj, state, env) {
    if (!hmd.hittxt /*( thrown => obj exists )*/
        && !hmd.destroyed) {
        const message = requireAttackOperation(env, 'message');
        if (!state.flags?.verbose) {
            await message('You hit it.', state);
        } else { /* hand_to_hand */
            const verb = (obj && objectType(obj, state).oc_subtyp === P_WHIP)
                ? 'lash'
                : state.urole?.mnum === PM_BARBARIAN ? 'smite'
                    : 'hit';
            await message(
                `You ${verb} ${monsterCommonName(mon, state)}`
                    + `${canSeeMonster(mon, state) ? exclam(hmd.dmg) : '.'}`,
                state,
            );
        }
    }
}

// C ref: uhitm.c hmon_hitmon() (1752-1935), the guts of hmon(). Everything
// between the decision that a blow landed and the target's reaction to it.
//
// `hmd` is C's `struct _hitmon_data`, allocated on the stack at 1760 and
// threaded through the helpers by reference. All 27 fields are set here in the
// order include/you.h:511-552 declares them, because the comment above that
// declaration records that the struct exists to fix the order of
// first_weapon_hit() against the hit-point decrement.
//
// Seven arms stop:
//
//   1821-1822 shade_miss() feedback, for a shade that took no damage.
//   1826      hmon_hitmon_jousting(), which only a mounted lance reaches.
//   1874-1877 hmon_hitmon_msg_silver() and hmon_hitmon_msg_lightobj(), the
//             two "sears" messages a silver or Sunsword hit adds.
//   1898-1907 the poison messages and xkilled(); hmon_hitmon_poison() sets
//             those flags and stops first.
//   1911      killed(), the kill itself, which mon.c owns.
//   1914-1919 the confused-touch arm behind u.umconf.
//
// Three of hmd's flags guard C call sites that this port leaves out. No ported
// path can write any of the three, so a refusal in their place would announce
// a stop that cannot happen:
//
//   ispoisoned   1808-1809 hmon_hitmon_poison(). C writes it at 1061-1062,
//                inside `thrown == HMON_THROWN`, which hmon() rejects, and at
//                1065-1066, where hmon_hitmon_weapon_melee() refuses
//                permapoisoned() in place of the assignment.
//   dryit        1872-1873 dry_a_towel(). Only the wet-towel branch of
//                hmon_hitmon_misc_obj() writes it, and hmon_hitmon_do_hit()
//                refuses that whole arm.
//   unpoisonmsg  1887-1889's cxname() reformat and 1919-1923's message.
//                hmon_hitmon_poison() writes it, and the ispoisoned entry
//                above shows that function is never called; needpoismsg and
//                poiskilled at 1898-1907 have the same writer.
//
// doreturn and retval carry C's abort of a blow that finished early. Of C's
// three `if (hmd->doreturn)` guards only 1806-1807's is executable: the two at
// 1090-1091 and 1418-1419 end their own function, so the `return` they guard
// reaches the same next statement the fall-through does. The one below is
// therefore the whole of that control flow. Every C writer -- artifact_hit()
// at 1021-1029, hmon_hitmon_potion() at 1108-1166, hmon_hitmon_misc_obj() at
// 1218-1248 and the stone missile at 1404-1405 -- sits inside an arm that
// stops above it, so nothing sets the flag yet.
//
// maybe_knockback is computed at 1829-1831 but read at 1927, inside a block
// C skips whenever the target died, so mhitm_knockback()'s two draws must not
// be made eagerly.
//
// The `!Upolyd` term C carries in both arms of that if-chain is left out rather
// than restated: polyself is unported, so Upolyd() is constantly false, which
// js/regen.js:52 records for the same reason.
async function hmon_hitmon(mon, obj, thrown, dieroll, state = game, env = {}) {
    const random = env.random ?? { d, rn2, rnd };
    const unsupported = requireAttackOperation(env, 'unsupported');
    const hmd = {
        dmg: 0,
        thrown,
        /* gt.twohits is turn-scoped state that hitum() owns; a ranged hit
           reads 0 so it cannot take the two-weapon damage branches */
        twohits: thrown ? 0 : state.twohits,
        dieroll,
        mdat: mon.data,
        use_weapon_skill: false,
        train_weapon_skill: false,
        barehand_silver_rings: 0,
        silvermsg: false,
        silverobj: false,
        lightobj: false,
        material: obj ? objectType(obj, state).oc_material : NO_MATERIAL,
        jousting: 0,
        hittxt: false,
        get_dmg_bonus: true,
        unarmed: !state.uwep && !state.uarm && !state.uarms,
        hand_to_hand: (thrown === HMON_MELEE
                       /* not grapnels; applied implies uwep */
                       || (thrown === HMON_APPLIED
                           && is_pole(state.uwep, state))),
        ispoisoned: false,
        unpoisonmsg: false,
        needpoismsg: false,
        poiskilled: false,
        already_killed: false,
        offmap: false,
        destroyed: false,
        dryit: false,
        doreturn: false,
        retval: false,
        saved_oname: '',
    };
    let maybe_knockback = false;

    await hmon_hitmon_do_hit(hmd, mon, obj, state, env, random);
    if (hmd.doreturn) return hmd.retval;

    /*
     ***** NOTE: perhaps obj is undefined! (if !thrown && BOOMERANG)
     *      *OR* if attacking bare-handed!
     * Note too: the cases where obj might get destroyed do not
     *      set 'use_weapon_skill', bare-handed does.
     */

    if (hmd.dmg > 0) hmon_hitmon_dmg_recalc(hmd, obj, state, env);

    if (hmd.dmg < 1) {
        const mon_is_shade = (mon.data === state.mons[PM_SHADE]);

        /* make sure that negative damage adjustment can't result
           in inadvertently boosting the victim's hit points */
        hmd.dmg = (hmd.get_dmg_bonus && !mon_is_shade) ? 1 : 0;
        if (mon_is_shade && !hmd.hittxt)
            unsupported('a blow that passes through a shade');
    }

    if (hmd.jousting) {
        unsupported('a jousting hit');
    } else if (hmd.unarmed && hmd.dmg > 1 && !thrown && !obj) {
        hmon_hitmon_stagger(hmd, state, env, random);
    } else if (!hmd.unarmed && hmd.dmg > 1 && !thrown
               && !state.u.twoweap && state.uwep) {
        maybe_knockback = true;
    }

    if (!hmd.already_killed) {
        if (obj && (obj === state.uwep
                    || (obj === state.uswapwep && state.u.twoweap))
            /* known_hitum 'what counts as a weapon' criteria */
            && (obj.oclass === WEAPON_CLASS || is_weptool(obj, state))
            && (thrown === HMON_MELEE || thrown === HMON_APPLIED)
            /* if jousting, the hit was already logged */
            && !hmd.jousting
            /* note: caller has already incremented u.uconduct.weaphit
               so we test for 1; 0 shouldn't be able to happen here... */
            && hmd.dmg > 0 && state.u.uconduct.weaphit <= 1)
            first_weapon_hit();
        mon.mhp -= hmd.dmg;
    }
    /* adjustments might have made tmp become less than what
       a level-draining artifact has already done to max HP */
    if (mon.mhp > mon.mhpmax) mon.mhp = mon.mhpmax;
    if (mon.mx === 0) {
        /*
         * jousting can lead to:
         *     mhurtle_to_doom()
         *      mhurtle()
         *       mintrap()
         *        trapeffect_hole()
         *         trapeffect_level_telep()
         *          migrate_to_level()
         * Set offmap in that situation so code to follow can test for it.*/
        hmd.offmap = true;
    }
    if (mon.mhp < 1) hmd.destroyed = true; /* DEADMONSTER() */

    hmon_hitmon_pet(hmd, mon, env);

    hmon_hitmon_splitmon(hmd, mon, obj, state, env);

    await hmon_hitmon_msg_hit(hmd, mon, obj, state, env);

    if (hmd.silvermsg) unsupported('a silver hit message');

    if (hmd.lightobj) unsupported('a light-source hit message');

    if (hmd.destroyed) {
        if (!hmd.already_killed) {
            /* monst.h troll_baned() (246-247). Only Trollsbane sets
               gm.mkcorpstat_norevive, and js/corpstat.js mkcorpstat() reads
               it; a hero not wielding that artifact leaves it FALSE. */
            if (mon.data.mlet === S_TROLL && obj
                && obj.oartifact === ART_TROLLSBANE) {
                state.gm ??= {};
                state.gm.mkcorpstat_norevive = true;
            }
            await killed(mon, state, env); /* "takes care of most messages" */
            state.gm ??= {};
            state.gm.mkcorpstat_norevive = false;
        }
    } else if (state.u.umconf && hmd.hand_to_hand) {
        unsupported('a confusing touch');
    }

    if (!hmd.destroyed && !hmd.offmap) {
        await wakeup(mon, true, { ...env, state });
        /* C's `hitflags` local, M_ATTK_HIT at 1925, is read only inside
           mhitm_knockback()'s stopped tail, and the body this call guards
           needs a TRUE return, which only the arm that knocks the target
           back gives. */
        if (maybe_knockback) {
            mhitm_knockback(
                state.youmonst,
                mon,
                state.youmonst.data.mattk[0],
                true,
                state,
                env,
                random,
            );
        }
    }
    return !hmd.destroyed;
}

// C ref: uhitm.c first_weapon_hit() (1962-1990). The whole body builds a
// livelog line for the first hit with a wielded weapon. pline.c
// livelog_printf() appends to gg.gamelog and to the live log file; this port
// writes neither, and js/eat.js:1479 records the same treatment for the food
// conduct. Nothing else in the function changes state or draws.
function first_weapon_hit() {
}

// C ref: uhitm.c mhitm_ad_elec() (2683-2739), the `mdef == &gy.youmonst` arm.
// A shock attack landing on the hero: the attack's own message, the magic
// cancellation test, and the item destruction a high-level attacker adds.
//
// C's other two arms refuse. The hero's own shock attack (uhitm) has no caller
// here, because js/uhitm.js damageum() is unported. One monster shocking
// another (mhitm) does: js/mhitm.js mdamagem() reaches mhitm_adtyping(), which
// dispatches AD_ELEC here, so a pet that fights a shocking monster stops at
// that arm.
export async function mhitm_ad_elec(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const random = env.random ?? { rn2 };
    const message = requireAttackOperation(env, 'message');
    const unsupported = requireAttackOperation(env, 'unsupported');
    // C's `orig_dmg` is the damage as it stood on entry, which only the three
    // destroy_items() calls read. All three refuse below, so nothing here
    // outlives mhm.damage.

    if (magr === state.youmonst) {
        /* uhitm */
        unsupported("the hero's own shock attack");
    } else if (mdef === state.youmonst) {
        /* mhitu */
        await hitmsg(magr, mattk, state, env);
        if (!await mhitm_mgc_atk_negated(magr, mdef, true, state, env)) {
            await message('You get zapped!', state);
            if (propertyPresent(state.u, SHOCK_RES)) {
                // youprop.h:44 Shock_resistance. The arm prints "The zap
                // doesn't shock you!" and then records the resistance through
                // mondata.c monstseesu(), which is unported -- js/mondata.js
                // carries monstunseesu() alone -- so the whole arm stops
                // before its first line rather than printing and forgetting.
                unsupported('a shock-resistant hero shrugging off an attack');
            } else {
                monstunseesu(M_SEEN_ELEC, state);
            }
            if (magr.m_lev > random.rn2(20)) {
                // zap.c destroy_items() for the hero's own pack. Only the
                // monster half is ported (js/zap_destroy_items.js), and it
                // covers fire alone.
                unsupported("electricity destroying the hero's items");
            }
        } else {
            mhm.damage = 0;
        }
    } else {
        /* mhitm */
        unsupported('one monster shocking another');
    }
}

// C ref: uhitm.c mhitm_ad_phys() (3980-4200), two of its three arms: the
// `mdef == &gy.youmonst` one (4021-4127) as far as its hand-to-hand path
// (4038-4040 and 4122-4126), and the mhitm one (4128-4200). An ordinary blow
// landing on the hero prints its line and records the hit; the damage is the
// roll hitmu() already made, which that arm leaves alone. One monster's blow
// on another adjusts the damage mdamagem() rolled and prints nothing, because
// mhitm.c hitmm() has already printed.
//
// The third arm is the hero's own physical attack (uhitm). It has no caller
// here, because js/uhitm.js damageum() is unported.
//
// Two pieces of the hero's arm stop where C acts:
//
//   AT_HUGS (4023-4037) sets u.ustuck and holds the hero. mhitu.c mattacku()
//     refuses its own AT_HUGS arm first, at js/mhitu.js:626, so no ported path
//     spells this attack. C's whole condition is kept rather than a bare aatyp
//     test, so the stop sits exactly where C's branch begins.
//   AT_WEAP with something wielded (4041-4121) is the armed blow: dmgval(),
//     the gauntlets of power, artifact_hit(), the silver and pudding-splitting
//     arms, rustm() and the poison tail. That is this slice's fail-closed edge.
//
// An AT_WEAP attacker holding nothing is not that edge. It falls to the last
// arm with everyone else and prints hitmsg()'s default verb, which is what
// mattacku()'s AT_WEAP arm leaves behind when mon_wield_item() finds it no
// weapon to wield.
//
// Neither mhm->specialdmg nor gm.mhitu_dieroll is read here, and js/mhitu.js
// said otherwise until this landed. specialdmg's two readers, 3992 and 3995,
// sit inside the `magr == &gy.youmonst` arm that opens at 3988; the dieroll's,
// 4069 and 4107, sit inside the AT_WEAP block that opens at 4041. Both arrive
// with work this slice does not do.
export async function mhitm_ad_phys(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const unsupported = requireAttackOperation(env, 'unsupported');
    const pa = magr.data;
    const pd = mdef.data;

    if (magr === state.youmonst) {
        /* uhitm */
        unsupported("the hero's own physical attack");
    } else if (mdef === state.youmonst) {
        /* mhitu */
        if (mattk.aatyp === AT_HUGS && !sticks(pd)) {
            unsupported('a monster grabbing the hero');
        } else { /* hand to hand weapon */
            const otmp = magr.mw; /* MON_WEP(magr) */

            if (mattk.aatyp === AT_WEAP && otmp) {
                unsupported("a monster's wielded weapon landing on the hero");
            } else if (mattk.aatyp !== AT_TUCH || mhm.damage !== 0
                       || magr !== state.u.ustuck) {
                await hitmsg(magr, mattk, state, env);
                /* C's mhitm_knockback() reads this at 5338, past the stop at
                   js/uhitm.js:1689, and hitmu() returns it only for a `done`
                   this arm never sets. It is written because C writes it, and
                   because the two callers that will read it are the next work
                   on this function. */
                mhm.hitflags |= M_ATTK_HIT;
            }
        }
    } else {
        /* mhitm */
        let mwep = magr.mw; /* MON_WEP(magr) */
        /* C's own local, not gv.vis: this arm asks whether the hero sees both
           combatants, while mhitm.c's gv.vis asks whether it sees either. */
        const vis = canSeeMonster(magr, state) && canSeeMonster(mdef, state);

        if (mattk.aatyp !== AT_WEAP && mattk.aatyp !== AT_CLAW) mwep = null;

        if (shade_miss(magr, mdef, mwep, false, vis, state, env)) {
            mhm.damage = 0;
        } else if (mattk.aatyp === AT_KICK && thick_skinned(pd)) {
            /* [no 'kicking boots' check needed; monsters with kick attacks
               can't wear boots and monsters that wear boots don't kick] */
            mhm.damage = 0;
        } else if (mwep) { /* non-Null 'mwep' implies AT_WEAP || AT_CLAW */
            // uhitm.c:4145-4188 is the armed blow: a cockatrice corpse
            // wielded as a club, dmgval(), the gauntlets of power,
            // artifact_hit() with the grow_up() that follows it, rustm() and
            // the poison tail. mhitm.c mattackm() refuses AT_WEAP outright,
            // so the only way in is an AT_CLAW attacker holding a weapon.
            unsupported("a monster's wielded weapon landing on another");
        } else if (pa === state.mons[PM_PURPLE_WORM]
                   && pd === state.mons[PM_SHRIEKER]) {
            /* hack to enhance mm_aggression(); we don't want purple
               worm's bite attack to kill a shrieker because then it
               won't swallow the corpse; but if the target survives,
               the subsequent engulf attack should accomplish that */
            if (mhm.damage >= mdef.mhp && mdef.mhp > 1)
                mhm.damage = mdef.mhp - 1;
        }
    }
}

// C ref: uhitm.c shade_miss() (2013-2050). "used for hero vs monster and
// monster vs monster; also handles monster vs hero but that won't happen
// because hero can't be a shade".
//
// Partial: the head is the whole answer for every defender that is not a
// shade, and it is FALSE. C's `||` short-circuits on the species test, so
// dmgval() is not reached for one and is called here only when it is.
//
// A shade defender refuses. Everything below the head prints -- through
// objnam.c cxname(), hacklib.c vtense() and do_name.c mon_nam() -- and then
// calls display.c map_invisible() and clears the shade's msleeping. The
// refusal sits above all of it, and above the TRUE that would tell the caller
// the blow passed harmlessly through.
export function shade_miss(
    magr,
    mdef,
    obj,
    thrown,
    verbose,
    state = game,
    env = {},
) {
    const unsupported = requireAttackOperation(env, 'unsupported');

    /* we're using dmgval() for zero/not-zero, not for actual damage amount */
    if (mdef.data !== state.mons[PM_SHADE]
        || (obj && dmgval(obj, mdef, state, env)))
        return false;

    unsupported('an attack passing through a shade');
    return true;
}

// C ref: uhitm.c mhitm_adtyping() (4781-4832). One landed blow's damage type
// selects the function that applies it. C's switch is written out in full so
// that the arms this port has not reached name the uhitm.c function a later
// slice puts in their place, and so that adding one is a one-line edit.
//
// C's `default` is not a refusal. An adtyp with no arm -- AD_MAGM, AD_DISN,
// AD_SPC1, AD_SPC2, AD_CLRC, AD_SPEL and AD_RBRE -- silently loses its damage,
// and mhitu.c hitmu() then lands a blow that prints nothing and costs no hit
// points. That is C's behavior, not a gap, so it is ported.
export async function mhitm_adtyping(
    magr,
    mattk,
    mdef,
    mhm,
    state = game,
    env = {},
) {
    const unsupported = requireAttackOperation(env, 'unsupported');
    const unported = (name) => unsupported(`uhitm.c ${name}()`);

    switch (mattk.adtyp) {
    case AD_STUN: unported('mhitm_ad_stun'); break;
    case AD_LEGS: unported('mhitm_ad_legs'); break;
    case AD_WERE: unported('mhitm_ad_were'); break;
    case AD_HEAL: unported('mhitm_ad_heal'); break;
    case AD_PHYS:
        await mhitm_ad_phys(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_FIRE: unported('mhitm_ad_fire'); break;
    case AD_COLD: unported('mhitm_ad_cold'); break;
    case AD_ELEC:
        await mhitm_ad_elec(magr, mattk, mdef, mhm, state, env);
        break;
    case AD_ACID: unported('mhitm_ad_acid'); break;
    case AD_STON: unported('mhitm_ad_ston'); break;
    case AD_SSEX: unported('mhitm_ad_ssex'); break;
    case AD_SITM:
    case AD_SEDU: unported('mhitm_ad_sedu'); break;
    case AD_SGLD: unported('mhitm_ad_sgld'); break;
    case AD_TLPT: unported('mhitm_ad_tlpt'); break;
    case AD_BLND: unported('mhitm_ad_blnd'); break;
    case AD_CURS: unported('mhitm_ad_curs'); break;
    case AD_DRLI: unported('mhitm_ad_drli'); break;
    case AD_RUST: unported('mhitm_ad_rust'); break;
    case AD_CORR: unported('mhitm_ad_corr'); break;
    case AD_DCAY: unported('mhitm_ad_dcay'); break;
    case AD_DREN: unported('mhitm_ad_dren'); break;
    case AD_DRST:
    case AD_DRDX:
    case AD_DRCO: unported('mhitm_ad_drst'); break;
    case AD_DRIN: unported('mhitm_ad_drin'); break;
    case AD_STCK: unported('mhitm_ad_stck'); break;
    case AD_WRAP: unported('mhitm_ad_wrap'); break;
    case AD_PLYS: unported('mhitm_ad_plys'); break;
    case AD_SLEE: unported('mhitm_ad_slee'); break;
    case AD_SLIM: unported('mhitm_ad_slim'); break;
    case AD_ENCH: unported('mhitm_ad_ench'); break;
    case AD_SLOW: unported('mhitm_ad_slow'); break;
    case AD_CONF: unported('mhitm_ad_conf'); break;
    case AD_POLY: unported('mhitm_ad_poly'); break;
    case AD_DISE: unported('mhitm_ad_dise'); break;
    case AD_SAMU: unported('mhitm_ad_samu'); break;
    case AD_DETH: unported('mhitm_ad_deth'); break;
    case AD_PEST: unported('mhitm_ad_pest'); break;
    case AD_FAMN: unported('mhitm_ad_famn'); break;
    case AD_DGST: unported('mhitm_ad_dgst'); break;
    case AD_HALU: unported('mhitm_ad_halu'); break;
    default:
        mhm.damage = 0;
    }
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

// C ref: uhitm.c mhitm_knockback() (5245-5372). Whether a solid blow sends the
// target staggering backwards.
//
// Both of its draws happen before anything is decided: rn2(3) picks a distance
// the caller may never use, and rn2(chance) rejects five hits in six. The two
// are why hmon_hitmon() defers the call until it knows the target survived,
// while mhitu.c hitmu() makes the call unconditionally.
//
// C reaches the size test at 5324-5326 only for a target two size classes
// smaller than the attacker -- for an unpolymorphed hero that means MZ_TINY --
// and everything past it stops here: is_blunt_weapon(), unsolid(),
// m_is_steadfast() and the mhurtle() that does the knocking back have no port.
//
// Three ported callers reach this: uhitm.c hmon_hitmon():1928, where the hero
// is the attacker; mhitu.c hitmu():1193, where the hero is the defender; and
// mhitm.c mdamagem():1061, where neither is. C's fourth, hmonas():5833, is a
// polymorphed hero's attack and is unported. The `hitflags` out-parameter
// serves none of the three, because it is first read at 5337 and first written
// at 5399, both past the stop below; it is left off the signature rather than
// accepted and ignored.
//
// The hero as defender reaches the `u_def` refusal below whenever an AD_PHYS
// AT_CLAW, AT_KICK, AT_BUTT or AT_WEAP blow lands on him and rn2(6) answers 0,
// so roughly one such hit in six stops there. QUALITY.json's
// monster-melee-knockback-on-the-hero-stops records that case and the seed that
// reaches it. An AT_BITE, AT_STNG, AT_TUCH or AT_TENT blow never does: the gate
// at 5273-5277 excludes all four.
export function mhitm_knockback(
    magr,
    mdef,
    mattk,
    weapon_used,
    state,
    env,
    random,
) {
    const unsupported = requireAttackOperation(env, 'unsupported');
    random.rn2(3); /* knockdistance: 67%: 1 step, 33%: 2 steps */
    let chance = 6; /* 1/6 chance of attack knocking back a monster */
    const u_agr = (magr === state.youmonst);
    const u_def = (mdef === state.youmonst);
    /* MON_WEP(magr) is magr->mw */
    const wep = weapon_used ? (u_agr ? state.uwep : magr.mw) : null;

    if (wep?.oartifact === ART_OGRESMASHER) chance = 2;

    if (random.rn2(chance)) return false;

    /* only certain attacks qualify for knockback */
    if (!((mattk.adtyp === AD_PHYS)
          && (mattk.aatyp === AT_CLAW
              || mattk.aatyp === AT_KICK
              || mattk.aatyp === AT_BUTT
              || mattk.aatyp === AT_WEAP)))
        return false;

    /* don't knockback if attacker also wants to grab or engulf */
    if (attacktype(magr.data, AT_ENGL)
        || attacktype(magr.data, AT_HUGS)
        || sticks(magr.data))
        return false;

    /* decide where the first step will place the target; not accurate
       for being knocked out of saddle but doesn't need to be; used for
       test_move() and for message before actual hurtle */
    const defx = u_def ? state.u.ux : mdef.mx;
    const defy = u_def ? state.u.uy : mdef.my;
    const dx = sgn(defx - (u_agr ? state.u.ux : magr.mx));
    const dy = sgn(defy - (u_agr ? state.u.uy : magr.my));

    /* can't move most targets into or out of a doorway diagonally */
    if (u_def) {
        // C tests hack.c test_move(..., TEST_MOVE) here, and everything past
        // it knocks the hero across the map through dothrow.c hurtle(). None
        // of that is ported, and no ported path reaches this line: see the
        // damage-type note above.
        unsupported('knocking the hero back');
    }
    /* subset of test_move() */
    if (!isok(defx + dx, defy + dy)) return false;
    const here = state.level?.at(defx, defy);
    /* C means this as "the push is diagonal", and it is that whenever magr is a
       monster, which mhitm.c mdamagem() and mhitu.c hitmu() both make it. It is
       not that for a hero attacker: magr is gy.youmonst, whose mx and my no
       line of src/ ever assigns -- light.c:16-17 records that they always
       remain 0 -- so the test C makes for uhitm.c hmon_hitmon() is that the
       target is on neither column 0 nor row 0, and an orthogonal push out of a
       doorway is refused along with a diagonal one. `?? 0` is that unset
       coordinate. Of the two monster attackers only mdamagem() reaches this
       line, because hitmu() makes the hero the defender and the refusal above
       stops it first. */
    if (IS_DOOR(here?.typ)
        && (defx - (magr.mx ?? 0)) && (defy - (magr.my ?? 0))
        && !doorless_door(here))
        return false;

    /* monsters must be alive */
    if ((!u_agr && magr.mhp < 1) || mdef.mhp < 1) return false;

    /* attacker must be much larger than defender */
    if (!(magr.data.msize > (mdef.data.msize + 1))) return false;

    unsupported('knocking a much smaller monster back');
    return false;
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
