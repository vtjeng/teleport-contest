// Pin the pure functions of mondata.c. The game does not call most of these
// yet, so these expectations are the only proof the ports are correct. Every
// expected value below is derived by reading mondata.c, mondata.h, monattk.h,
// and the monsters.h entry for the species involved, not by running the
// JavaScript and recording what it produced.
//
// Where a function branches on an enum, the test writes the C number with the
// header and line it came from rather than importing the port's own constant.
// Doing both sides from the port hides the defect it should catch: an
// undefined M.AD_DISN made `switch (adtyp)` match `case undefined`, so
// `cvt_adtyp_to_mseenres(M.AD_DISN)` returned the expected answer for the
// wrong reason and the test passed over a dead branch.
//
// Species are still named by their PM_ constant. Those name a row of the
// generated mons[] table, and no literal index would say which species a case
// is about.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as M from '../js/monsters.js';
import { blankCommentsAndStrings } from './check-namespace-members.mjs';
import {
    big_little_match,
    breakarm,
    cantvomit,
    completelyburns,
    completelyrots,
    completelyrusts,
    cvt_adtyp_to_mseenres,
    cvt_prop_to_mseenres,
    dmgtype_fromattack,
    gender,
    hates_blessings,
    hates_light,
    is_watch,
    is_wooden,
    max_passive_dmg,
    mon_hates_blessings,
    mon_hates_light,
    monsndx,
    msummon_environ,
    mstrength,
    num_horns,
    olfaction,
    on_fire,
    poly_when_stoned,
    ranged_attk,
    raceptr,
    sliparm,
    stagger,
} from '../js/mondata.js';

function monsterState(withVitals = false) {
    const state = {};
    M.monst_globals_init(state);
    if (withVitals) M.reset_mvitals(state);
    return state;
}

const state = monsterState();
const pm = (index) => state.mons[index];

test('monsndx returns the mons[] index a species was built from', () => {
    assert.equal(monsndx(pm(M.PM_NEWT)), M.PM_NEWT);
    assert.equal(monsndx(pm(M.PM_GREMLIN)), M.PM_GREMLIN);
});

test('hates_light singles out the gremlin', () => {
    assert.equal(hates_light(pm(M.PM_GREMLIN)), true);
    assert.equal(hates_light(pm(M.PM_YELLOW_LIGHT)), false);
    assert.equal(mon_hates_light({ data: pm(M.PM_GREMLIN) }), true);
});

test('the completely-destroyed golem sets each name exactly one pair', () => {
    // completelyburns: paper and straw golems only.
    assert.equal(completelyburns(pm(M.PM_PAPER_GOLEM)), true);
    assert.equal(completelyburns(pm(M.PM_STRAW_GOLEM)), true);
    assert.equal(completelyburns(pm(M.PM_WOOD_GOLEM)), false);
    // completelyrots: wood and leather golems only.
    assert.equal(completelyrots(pm(M.PM_WOOD_GOLEM)), true);
    assert.equal(completelyrots(pm(M.PM_LEATHER_GOLEM)), true);
    assert.equal(completelyrots(pm(M.PM_PAPER_GOLEM)), false);
    // completelyrusts: the iron golem alone.
    assert.equal(completelyrusts(pm(M.PM_IRON_GOLEM)), true);
    assert.equal(completelyrusts(pm(M.PM_WOOD_GOLEM)), false);
});

// C ref: mondata.h is_wooden() (68). One species, named directly.
test('is_wooden singles out the wood golem', () => {
    // monsters.h:2545-2552 MON(NAM("wood golem"), ...).
    assert.equal(is_wooden(pm(M.PM_WOOD_GOLEM)), true);
    // monsters.h:2538-2544, the golem row immediately before it. Another
    // golem, another organic material, and still not the one species the
    // macro names.
    assert.equal(is_wooden(pm(M.PM_LEATHER_GOLEM)), false);
});

// C ref: mondata.h is_watch() (159-160). Both arms of the `||` need a case,
// or one species could be dropped without failing anything.
test('is_watch names both members of the town watch', () => {
    // monsters.h:2816-2824 MON(NAM("watchman"), ...).
    assert.equal(is_watch(pm(M.PM_WATCHMAN)), true);
    // monsters.h:2825-2833 MON(NAM("watch captain"), ...).
    assert.equal(is_watch(pm(M.PM_WATCH_CAPTAIN)), true);
    // monsters.h:2807-2815, the soldier rank immediately before watchman.
    // Same S_HUMAN class and same M2_MERC flag, so nothing but the species
    // identity separates it from the Watch.
    assert.equal(is_watch(pm(M.PM_CAPTAIN)), false);
});

test('poly_when_stoned excludes the stone golem and honors genocide', () => {
    const vitals = monsterState(true);
    assert.equal(poly_when_stoned(pm(M.PM_PAPER_GOLEM), vitals), true);
    // A non-golem never polymorphs on being stoned.
    assert.equal(poly_when_stoned(pm(M.PM_NEWT), vitals), false);
    // The stone golem is already the target form.
    assert.equal(poly_when_stoned(pm(M.PM_STONE_GOLEM), vitals), false);

    // With the stone golem genocided there is nothing to turn into.
    // poly_when_stoned() masks mvflags with G_GENOD, which is 0x02
    // (monflag.h:209).
    vitals.svm.mvitals[M.PM_STONE_GOLEM].mvflags |= 0x02;
    assert.equal(poly_when_stoned(pm(M.PM_PAPER_GOLEM), vitals), false);
});

test('ranged_attk accepts only the four distance attack types', () => {
    // monattk.h DISTANCE_ATTK_TYPE: AT_SPIT, AT_BREA, AT_MAGC, AT_GAZE.
    assert.equal(ranged_attk(pm(M.PM_GRAY_DRAGON)), true);  // AT_BREA
    assert.equal(ranged_attk(pm(M.PM_COBRA)), true);        // AT_SPIT
    assert.equal(ranged_attk(pm(M.PM_FLOATING_EYE)), false);
    // A pure melee biter has no distance attack.
    assert.equal(ranged_attk(pm(M.PM_JACKAL)), false);
});

test('mstrength reproduces the C difficulty formula', () => {
    // Each expectation below is computed by hand from mondata.c:mstrength()
    // and the species' monsters.h entry.
    //
    // newt (monsters.h): LVL(0, 6, 8, 0, 0), G_GENO | 5, one
    // ATTK(AT_BITE, AD_PHYS, 1, 2).
    //   n = 0 (no G_SGROUP or G_LGROUP) + 0 (ranged) + 0 (ac 8) + 0 (mmove 6)
    //     + 1 (aatyp > 0) + 0 (AT_MAGC) + 0 (AT_WEAP & M2_STRONG)
    //     + 0 (AD_PHYS is not special, and the strcmp branch adds
    //          (adtyp != AD_PHYS) = 0)
    //     + 0 (damd * damn = 2, not > 23) = 1
    //   n < 6, so tmp = 0 + (trunc(1/3) + 1) = 1
    assert.equal(mstrength(pm(M.PM_NEWT)), 1);

    // grid bug is the one species C's
    // `else if (strcmp(pmnames[NEUTRAL], "grid bug"))` skips, so its
    // (adtyp != AD_PHYS) increment never runs.
    // monsters.h: LVL(0, 12, 9, 0, 0), G_GENO | G_SGROUP | G_NOCORPSE | 3,
    // one ATTK(AT_BITE, AD_ELEC, 1, 1).
    //   n = 1 (G_SGROUP) + 0 (ranged) + 0 (ac 9) + 0 (mmove 12)
    //     + 1 (aatyp > 0) + 0 (skipped AD_ELEC increment)
    //     + 0 (damd * damn = 1) = 2
    //   n < 6, so tmp = 0 + (trunc(2/3) + 1) = 1.
    // Without the grid-bug special case n would be 3 and tmp would be 2.
    assert.equal(mstrength(pm(M.PM_GRID_BUG)), 1);

    // killer bee takes the artificial +2 from the named-species adjustment.
    // monsters.h: LVL(1, 18, -1, 0, 0), G_GENO | G_LGROUP | 2, one
    // ATTK(AT_STNG, AD_DRST, 1, 3).
    //   n = 2 (G_LGROUP << 1) + 0 (ranged) + 1 (ac < 4) + 1 (ac < 0)
    //     + 1 (mmove >= 18) + 1 (aatyp > 0) + 2 (AD_DRST is special)
    //     + 0 (damd * damn = 3) + 2 (killer bee adjustment) = 10
    //   n >= 6, so tmp = 1 + trunc(10/2) = 6
    assert.equal(mstrength(pm(M.PM_KILLER_BEE)), 6);

    // chickatrice exercises AD_STON, which scores +2 per attack slot rather
    // than the +1 the generic branch gives.
    // monsters.h: LVL(4, 4, 8, 30, 0), G_GENO | G_SGROUP | 1, with
    // ATTK(AT_BITE, AD_PHYS, 1, 2), ATTK(AT_TUCH, AD_STON, 0, 0), and
    // ATTK(AT_NONE, AD_STON, 0, 0).
    //   n = 1 (G_SGROUP) + 0 (ranged) + 0 (ac 8) + 0 (mmove 4)
    //     + 2 (two attacks with aatyp > 0)
    //     + 0 (AD_PHYS) + 2 + 2 (two AD_STON slots) = 7
    //   n >= 6, so tmp = 4 + trunc(7/2) = 7
    assert.equal(mstrength(pm(M.PM_CHICKATRICE)), 7);

    // shocking sphere exercises the AT_EXPL bonus, which is +5 for AD_ELEC.
    // monsters.h: LVL(6, 13, 4, 0, 0), G_NOCORPSE | G_GENO | 2, one
    // ATTK(AT_EXPL, AD_ELEC, 4, 6).
    //   n = 0 (no G_SGROUP or G_LGROUP)
    //     + 0 (ranged: AT_EXPL is 13, below AT_WEAP and outside the
    //          AT_BREA|AT_SPIT|AT_GAZE mask, monattk.h:23)
    //     + 0 (ac 4 is not < 4) + 0 (mmove 13 < 18)
    //     + 1 (aatyp > 0) + 5 (AT_EXPL carrying AD_ELEC)
    //     + 1 (AD_ELEC != AD_PHYS through the non-grid-bug strcmp arm)
    //     + 1 (damd * damn = 6 * 4 = 24 > 23) = 8
    //   n >= 6, so tmp = 6 + trunc(8/2) = 10
    assert.equal(mstrength(pm(M.PM_SHOCKING_SPHERE)), 10);
});

test('mstrength agrees with the difficulty C stores for every species', () => {
    // C keeps a hardcoded difficulty in each monsters.h entry and provides the
    // #mondifficulty wizard command (wizcmds.c) to report where mstrength()
    // disagrees with it. mondata.c's own comment says a discrepancy means the
    // table or the algorithm needs updating, so upstream tolerates a few. This
    // sweep pins every attack-type and damage-type constant the formula reads
    // at once; a single missing enum export shows up here as a batch of
    // mismatches.
    //
    // The two rows where upstream's own table disagrees carry the value
    // mstrength() must return instead, so the exclusion is re-derived rather
    // than assumed. The priest/cleric (monsters.h:3396, LVL(10, 12, 10, 2, 0),
    // G_NOGEN, AT_WEAP/AD_PHYS 1d6 + AT_MAGC/AD_CLRC, M2_STRONG, stored 12) and
    // the wizard (monsters.h:3453, same shape with AD_SPEL, stored 12) both
    // give
    //   n = 1 (ranged: AT_WEAP is 254, so `j >= AT_WEAP` holds)
    //     + 0 (ac 10) + 0 (mmove 12 < 18)
    //     + 1 (AT_WEAP aatyp > 0) + 1 (AT_WEAP with M2_STRONG)
    //     + 1 (AT_MAGC aatyp > 0) + 1 (tmp2 == AT_MAGC)
    //     + 1 (AD_CLRC/AD_SPEL != AD_PHYS) + 0 (damd * damn = 6, not > 23) = 6
    //   n >= 6, so tmp = 10 + trunc(6/2) = 13, one above the stored 12.
    const KNOWN_UPSTREAM_MISMATCHES = new Map([
        [M.PM_CLERIC, 13],
        [M.PM_WIZARD, 13],
    ]);
    const mismatched = [];
    let checked = 0;
    for (let index = 0; index < M.NUMMONS; index++) {
        const species = state.mons[index];
        // Defensive only. C's loops over mons[] stop at the terminator row,
        // whose mlet is 0 (wizcmds.c:1806 `for (ptr = &mons[0]; ptr->mlet;`),
        // but NUMMONS already excludes that row, so this never fires. The
        // `checked` assertion below is what proves the sweep is not vacuous.
        if (!species || !species.mlet) continue;
        checked++;
        const strength = mstrength(species);
        const upstream = KNOWN_UPSTREAM_MISMATCHES.get(index);
        const expected = upstream ?? species.difficulty;
        if (strength !== expected) {
            mismatched.push(
                `${species.pmnames[2]}: ${strength} != ${expected}`,
            );
        }
        // The exclusion is only justified while the stored value really does
        // disagree. If upstream corrects its table, this entry must go.
        if (upstream !== undefined && strength === species.difficulty) {
            mismatched.push(
                `${species.pmnames[2]}: no longer disagrees with `
                + `monsters.h (${species.difficulty})`,
            );
        }
    }
    assert.deepEqual(mismatched, []);
    // Every non-terminator row was compared, so no skip silenced the sweep.
    assert.equal(checked, M.NUMMONS);
});

test('every monster constant mondata.js reads is actually exported', () => {
    // A missing export makes `adtyp === M.AD_FOO` compare a number against
    // undefined, so the branch silently never fires. That is how AD_STON,
    // AD_DRLI, AD_DRDX, AD_DRCO, AD_WERE, AT_EXPL, AD_DCAY, and AD_DISN were
    // all dead at once. This guard fails the moment another one goes missing.
    // scripts/check-namespace-members.mjs applies the same rule to every
    // namespace import in js/ and scripts/; this one keeps the failure next to
    // the functions it breaks. Reuse that module's blankCommentsAndStrings()
    // so both apply the rule identically: a comment naming an unported
    // upstream constant, such as `// upstream also handles M.AD_CLRC here`, is
    // not a member access and must not fail this test.
    const source = blankCommentsAndStrings(readFileSync(
        new URL('../js/mondata.js', import.meta.url), 'utf8'));
    const referenced = [...new Set(
        [...source.matchAll(/\bM\.([A-Za-z_][A-Za-z0-9_]*)/gu)]
            .map((match) => match[1]),
    )].sort();
    // A tripwire against the match silently collapsing. mondata.js reads 342
    // distinct members today, so the floor leaves room to add and remove a few.
    assert.equal(referenced.length > 300, true);
    assert.deepEqual(referenced.filter((name) => M[name] === undefined), []);
});

test('hates_blessings covers undead and demons', () => {
    assert.equal(hates_blessings(pm(M.PM_HUMAN_ZOMBIE)), true); // undead
    assert.equal(hates_blessings(pm(M.PM_WATER_DEMON)), true);  // demon
    assert.equal(hates_blessings(pm(M.PM_NEWT)), false);
    // mon_hates_blessings adds vampshifters, which a plain newt is not.
    // is_vampshifter() tests `cham >= LOW_PM`, so cham is written as the C
    // value NON_PM = -1 (permonst.h:14) that means "not shape-shifted".
    assert.equal(
        mon_hates_blessings({ data: pm(M.PM_NEWT), cham: -1 }),
        false,
    );
    assert.equal(
        mon_hates_blessings({ data: pm(M.PM_HUMAN_ZOMBIE), cham: -1 }),
        true,
    );
});

test('sliparm and breakarm split armor destruction by body shape', () => {
    // sliparm: whirly, MZ_SMALL or smaller, or noncorporeal.
    assert.equal(sliparm(pm(M.PM_AIR_ELEMENTAL)), true);  // whirly
    assert.equal(sliparm(pm(M.PM_NEWT)), true);           // MZ_TINY
    assert.equal(sliparm(pm(M.PM_GRAY_DRAGON)), false);   // MZ_GIGANTIC

    // breakarm returns false whenever sliparm is true.
    assert.equal(breakarm(pm(M.PM_NEWT)), false);
    // bigmonst, so the suit breaks.
    assert.equal(breakarm(pm(M.PM_GRAY_DRAGON)), true);
    // Named humanoid exceptions that cannot wear a suit.
    assert.equal(breakarm(pm(M.PM_MARILITH)), true);
    assert.equal(breakarm(pm(M.PM_WINGED_GARGOYLE)), true);
    // An ordinary MZ_HUMAN humanoid neither slips nor breaks out of a suit.
    assert.equal(breakarm(pm(M.PM_HUMAN)), false);
});

test('cantvomit lists rodents except two, plus the three horses', () => {
    assert.equal(cantvomit(pm(M.PM_SEWER_RAT)), true);
    // The two S_RODENT exceptions named in the C source.
    assert.equal(cantvomit(pm(M.PM_ROCK_MOLE)), false);
    assert.equal(cantvomit(pm(M.PM_WOODCHUCK)), false);
    assert.equal(cantvomit(pm(M.PM_PONY)), true);
    assert.equal(cantvomit(pm(M.PM_HORSE)), true);
    assert.equal(cantvomit(pm(M.PM_WARHORSE)), true);
    assert.equal(cantvomit(pm(M.PM_NEWT)), false);
});

test('num_horns returns two, one, or none', () => {
    for (const index of [M.PM_HORNED_DEVIL, M.PM_MINOTAUR, M.PM_ASMODEUS,
        M.PM_BALROG]) {
        assert.equal(num_horns(pm(index)), 2);
    }
    for (const index of [M.PM_WHITE_UNICORN, M.PM_GRAY_UNICORN,
        M.PM_BLACK_UNICORN, M.PM_KI_RIN]) {
        assert.equal(num_horns(pm(index)), 1);
    }
    assert.equal(num_horns(pm(M.PM_NEWT)), 0);
});

test('dmgtype_fromattack matches damage type and honors the AT_ANY wildcard',
    () => {
        // dmgtype_fromattack() compares its arguments against the species'
        // stored attack numbers, so the arguments and the expectations are
        // written as the C numbers rather than as the port's own constants:
        // AT_ANY -1 (monattk.h:11), AT_BITE 2 (monattk.h:14),
        // AT_SPIT 10 (monattk.h:20), AD_BLND 11 (monattk.h:53).
        const cobra = pm(M.PM_COBRA);
        // The cobra spits blinding venom: AT_SPIT with AD_BLND.
        const spit = dmgtype_fromattack(cobra, 11, 10);
        assert.equal(spit.aatyp, 10);
        assert.equal(spit.adtyp, 11);
        // The same damage type under AT_ANY finds the first matching attack.
        assert.equal(dmgtype_fromattack(cobra, 11, -1), spit);
        // A specific attack type that does not carry that damage type fails.
        assert.equal(dmgtype_fromattack(cobra, 11, 2), null);
        assert.equal(dmgtype_fromattack(pm(M.PM_NEWT), 11, -1), null);
    });

test('max_passive_dmg multiplies passive damage by the attacker attack count',
    () => {
        // The acid blob's only attack is AT_NONE/AD_ACID 1d8, which is the
        // passive slot max_passive_dmg() reads.
        const mdef = { data: pm(M.PM_ACID_BLOB), mhp: 12 };
        // A jackal has one AT_BITE, so multi2 is 1 and it does not resist
        // acid, giving dmg = damn(1) * damd(8) * 1.
        const jackal = { data: pm(M.PM_JACKAL), mhp: 7, mextrinsics: 0,
            mintrinsics: 0, minvent: null };
        assert.equal(max_passive_dmg(mdef, jackal, state), 8);

        // A soldier ant has AT_CLAW and AT_STNG, so multi2 is 2.
        const ant = { data: pm(M.PM_SOLDIER_ANT), mhp: 9, mextrinsics: 0,
            mintrinsics: 0, minvent: null };
        assert.equal(max_passive_dmg(mdef, ant, state), 16);

        // An acid-resistant attacker takes nothing from an AD_ACID passive.
        // The attacker must have an attack that counts toward multi2, or the
        // trailing `dmg *= multi2` would force 0 whatever the resistance
        // check returned. A gray ooze resists acid and has one AT_BITE.
        const ooze = { data: pm(M.PM_GRAY_OOZE), mhp: 11, mextrinsics: 0,
            mintrinsics: 0, minvent: null };
        assert.equal(max_passive_dmg(mdef, ooze, state), 0);

        // The acid blob itself has only AT_NONE, so multi2 stays 0 and the
        // product is 0 through a different path than resistance.
        const blob = { data: pm(M.PM_ACID_BLOB), mhp: 12, mextrinsics: 0,
            mintrinsics: 0, minvent: null };
        assert.equal(max_passive_dmg(mdef, blob, state), 0);
    });

test('max_passive_dmg wipes out an attacker its passive completely destroys',
    () => {
        // The red mold is the one species whose first attack is a passive
        // AD_FIRE one (AT_NONE, 0d4), which is what this branch needs.
        const mdef = { data: pm(M.PM_RED_MOLD), mhp: 15 };
        // completelyburns(paper golem) is true, so dmg becomes magr->mhp
        // rather than the attack's dice. The paper golem has one AT_CLAW
        // attack, so multi2 is 1 and the product is its full hit points.
        const paper = { data: pm(M.PM_PAPER_GOLEM), mhp: 20, mextrinsics: 0,
            mintrinsics: 0, minvent: null };
        assert.equal(max_passive_dmg(mdef, paper, state), 20);

        // A jackal does not completely burn, and does not resist fire, so it
        // takes the dice instead. The red mold's passive is ATTK(AT_NONE,
        // AD_FIRE, 0, 4); damn is 0, so C substitutes mlevel + 1. The mold is
        // level 1, giving (1 + 1) * damd(4) * multi2(1).
        const jackal = { data: pm(M.PM_JACKAL), mhp: 7, mextrinsics: 0,
            mintrinsics: 0, minvent: null };
        assert.equal(max_passive_dmg(mdef, jackal, state), 8);
    });

test('max_passive_dmg covers the cold and shock resistance arms too', () => {
    // C writes the AD_ACID, AD_COLD, AD_FIRE and AD_ELEC arms of the same
    // else-if chain identically (mondata.c:754-757), so each needs its own
    // case; the tests above exercise only AD_ACID and AD_FIRE.
    //
    // The blue jelly's only attack is ATTK(AT_NONE, AD_COLD, 0, 6) at mlevel 4
    // (monsters.h:591), so damn 0 substitutes mlevel + 1 = 5 and the product
    // is 5 * damd(6) per counted attacker attack.
    const chilling = { data: pm(M.PM_BLUE_JELLY), mhp: 30 };
    const jackal = { data: pm(M.PM_JACKAL), mhp: 7, mextrinsics: 0,
        mintrinsics: 0, minvent: null };
    // A jackal has one AT_BITE, so multi2 is 1, and it does not resist cold.
    assert.equal(max_passive_dmg(chilling, jackal, state), 30);
    // The winter wolf cub carries MR_COLD (monsters.h:280) and one counted
    // attack, AT_BITE; its AT_BREA slot is not in C's multi2 switch. multi2 is
    // therefore 1, so only the resistance term can zero the result.
    const wolfCub = { data: pm(M.PM_WINTER_WOLF_CUB), mhp: 25,
        mextrinsics: 0, mintrinsics: 0, minvent: null };
    assert.equal(max_passive_dmg(chilling, wolfCub, state), 0);

    // The energy vortex's passive is its third slot, ATTK(AT_NONE, AD_ELEC, 0,
    // 4) at mlevel 6 (monsters.h:1081); the loop skips its two AT_ENGL slots
    // first. damn 0 substitutes mlevel + 1 = 7, giving 7 * damd(4) per counted
    // attack.
    const shocking = { data: pm(M.PM_ENERGY_VORTEX), mhp: 40 };
    assert.equal(max_passive_dmg(shocking, jackal, state), 28);
    // An energy vortex attacking one of its own resists MR_ELEC, and its two
    // AT_ENGL attacks put multi2 at 2, so a lost resistance check would show
    // as 56 rather than 0.
    const vortex = { data: pm(M.PM_ENERGY_VORTEX), mhp: 40, mextrinsics: 0,
        mintrinsics: 0, minvent: null };
    assert.equal(max_passive_dmg(shocking, vortex, state), 0);
});

test('max_passive_dmg covers the rot and rust instakill arms too', () => {
    // completelyrots: the brown pudding (monsters.h:2092) is the table's only
    // AD_DCAY row, and its one attack is AT_BITE/AD_DCAY, which the passive
    // loop skips. No real species pairs AD_DCAY with AT_NONE or AT_BOOM, so
    // the arm is unreachable from table data in C too and the case needs a
    // synthetic defender. C's three arms are written identically, so each
    // needs its own case; only the AD_FIRE one was exercised before.
    // AT_NONE is 0 (monattk.h:12) and AD_DCAY is 34 (monattk.h:76). Both are
    // written as C numbers because max_passive_dmg() branches on exactly these
    // two values, and this arm was dead while AD_DCAY was undefined.
    const decaying = { data: {
        mlevel: 5,
        mattk: [{ aatyp: 0, adtyp: 34, damn: 0, damd: 0 }],
    } };
    const wood = { data: pm(M.PM_WOOD_GOLEM), mhp: 50, mextrinsics: 0,
        mintrinsics: 0, minvent: null };
    // The wood golem has one AT_CLAW, so multi2 is 1 and dmg is its mhp.
    assert.equal(max_passive_dmg(decaying, wood, state), 50);
    // A leather golem also completely rots. It has two AT_CLAW attacks, so
    // multi2 is 2 and its mhp is doubled by the trailing `dmg *= multi2`.
    const leather = { data: pm(M.PM_LEATHER_GOLEM), mhp: 40, mextrinsics: 0,
        mintrinsics: 0, minvent: null };
    assert.equal(max_passive_dmg(decaying, leather, state), 80);

    // completelyrusts: the rust monster's first two slots are AT_TUCH/AD_RUST
    // and only its third is AT_NONE/AD_RUST (monsters.h:2149), so this case
    // also exercises the loop's skip-and-continue before the passive slot is
    // found. Only the iron golem completely rusts.
    const rusting = { data: pm(M.PM_RUST_MONSTER), mhp: 30 };
    const iron = { data: pm(M.PM_IRON_GOLEM), mhp: 80, mextrinsics: 0,
        mintrinsics: 0, minvent: null };
    assert.equal(max_passive_dmg(rusting, iron, state), 80);
    // A wood golem does not rust, and AD_RUST is not in the elif chain, so
    // dmg stays at its initial 0.
    assert.equal(max_passive_dmg(rusting, wood, state), 0);
});

test('gender returns C ints for the boolean the port stores', () => {
    // The running game stores `female` as a JavaScript boolean (js/monst.js
    // and js/makemon_create.js), while C holds an `unsigned female:1` and
    // callers index pmnames[] with the result. Pass booleans, as the game
    // does, and require the numeric C values back.
    assert.equal(gender({ data: pm(M.PM_ACID_BLOB), female: false }), 2);
    assert.equal(gender({ data: pm(M.PM_HUMAN), female: true }), 1);
    assert.equal(gender({ data: pm(M.PM_HUMAN), female: false }), 0);
    // A neuter species reports 2 whatever the flag says.
    assert.equal(gender({ data: pm(M.PM_ACID_BLOB), female: true }), 2);
});

test('big_little_match walks the growth chain in both directions', () => {
    assert.equal(big_little_match(M.PM_NEWT, M.PM_NEWT, state), true);
    // little dog -> dog -> large dog, so the ends match through the chain.
    assert.equal(big_little_match(M.PM_LITTLE_DOG, M.PM_LARGE_DOG, state),
        true);
    assert.equal(big_little_match(M.PM_LARGE_DOG, M.PM_LITTLE_DOG, state),
        true);
    // Same class letter, but neither grows into the other.
    assert.equal(big_little_match(M.PM_LITTLE_DOG, M.PM_JACKAL, state), false);
    // Different class letters short-circuit before the chain walk.
    assert.equal(big_little_match(M.PM_LITTLE_DOG, M.PM_NEWT, state), false);
});

test('raceptr returns the racial species only for an unpolymorphed hero', () => {
    const monster = { data: pm(M.PM_NEWT) };
    assert.equal(raceptr(monster, state), pm(M.PM_NEWT));

    // An unpolymorphed hero reports the racial species, not the current data.
    const hero = { data: pm(M.PM_GRAY_DRAGON) };
    const heroState = {
        ...state, youmonst: hero, urace: { mnum: M.PM_HUMAN }, u: {},
    };
    assert.equal(raceptr(hero, heroState), pm(M.PM_HUMAN));

    // A polymorphed hero reports the current form. you.h:554 spells Upolyd
    // (u.umonnum != u.umonster), so this also pins that raceptr passes state.u
    // rather than the whole state, which would make the guard permanently
    // false.
    const polymorphed = {
        ...heroState,
        u: { umonnum: M.PM_GRAY_DRAGON, umonster: M.PM_HUMAN },
    };
    assert.equal(raceptr(hero, polymorphed), pm(M.PM_GRAY_DRAGON));
});

test('stagger picks the third and fourth locomotion verbs', () => {
    // locoverbs indexes 2 and 3 are the staggering forms. A lowercase default
    // selects index 2 and an uppercase default selects index 3.
    assert.equal(stagger(pm(M.PM_FLOATING_EYE), 'stumble'), 'wobble');
    assert.equal(stagger(pm(M.PM_FLOATING_EYE), 'Stumble'), 'Wobble');
    // flys (MZ_SMALL or smaller) flutters; flyl (larger) staggers. These two
    // rows are identical at the indexes locomotion() reads and differ here.
    assert.equal(stagger(pm(M.PM_BAT), 'stumble'), 'flutter');
    // The giant bat is SIZ(..., MZ_SMALL) (monsters.h:1280) with M1_FLY, so it
    // sits on the inclusive end of C's `ptr->msize <= MZ_SMALL` (mondata.c
    // locomotion()). MZ_SMALL is 1 and MZ_TINY is 0 (monflag.h:177-178), so
    // PM_BAT above is strictly below the bound and pins nothing at it.
    assert.equal(stagger(pm(M.PM_GIANT_BAT), 'stumble'), 'flutter');
    assert.equal(stagger(pm(M.PM_GRAY_DRAGON), 'stumble'), 'stagger');
    assert.equal(stagger(pm(M.PM_GARTER_SNAKE), 'stumble'), 'falter');
    assert.equal(stagger(pm(M.PM_BROWN_PUDDING), 'stumble'), 'tremble');
    // mmove 0 takes the immobile row. Its staggering verb is "pulsate"; the
    // "wiggle" in the same row is what locomotion() reads at index 0.
    assert.equal(stagger(pm(M.PM_BROWN_MOLD), 'stumble'), 'pulsate');
    // The lichen has mmove 1, so it reaches the nolimbs row instead.
    assert.equal(stagger(pm(M.PM_LICHEN), 'stumble'), 'falter');
    // A species matching no branch keeps the caller's default.
    assert.equal(stagger(pm(M.PM_HUMAN), 'stumble'), 'stumble');
});

test('on_fire names what burning does to each special species', () => {
    // on_fire() switches on the attack type, so the type is written as the C
    // number: AT_CLAW 1 (monattk.h:13).
    const claw = { aatyp: 1 };
    for (const index of [M.PM_FLAMING_SPHERE, M.PM_FIRE_VORTEX,
        M.PM_FIRE_ELEMENTAL, M.PM_SALAMANDER]) {
        assert.equal(on_fire(pm(index), claw), 'already on fire');
    }
    for (const index of [M.PM_WATER_ELEMENTAL, M.PM_FOG_CLOUD,
        M.PM_STEAM_VORTEX]) {
        assert.equal(on_fire(pm(index), claw), 'boiling');
    }
    for (const index of [M.PM_ICE_VORTEX, M.PM_GLASS_GOLEM]) {
        assert.equal(on_fire(pm(index), claw), 'melting');
    }
    assert.equal(on_fire(pm(M.PM_STONE_GOLEM), claw), 'heating up');
    // The default branch varies on the attack type.
    assert.equal(on_fire(pm(M.PM_NEWT), claw), 'on fire');
    // AT_HUGS is 7 (monattk.h:19); it is the one attack type that reads
    // "being roasted" instead of "on fire".
    assert.equal(on_fire(pm(M.PM_NEWT), { aatyp: 7 }), 'being roasted');
});

test('msummon_environ returns both the substance and its container word', () => {
    assert.deepEqual(msummon_environ(pm(M.PM_WATER_DEMON)),
        { what: 'vapor', cloud: 'cloud' });
    assert.deepEqual(msummon_environ(pm(M.PM_STEAM_VORTEX)),
        { what: 'steam', cloud: 'cloud' });
    assert.deepEqual(msummon_environ(pm(M.PM_ENERGY_VORTEX)),
        { what: 'sparks', cloud: 'shower' });
    assert.deepEqual(msummon_environ(pm(M.PM_DUST_VORTEX)),
        { what: 'dust', cloud: 'cloud' });
    assert.deepEqual(msummon_environ(pm(M.PM_FIRE_VORTEX)),
        { what: 'flame', cloud: 'ball' });
    // Any S_ANGEL maps to PM_ANGEL and any S_LIGHT to PM_YELLOW_LIGHT before
    // the switch, so an archon and a black light take the light branch.
    assert.deepEqual(msummon_environ(pm(M.PM_ARCHON)),
        { what: 'light', cloud: 'flash' });
    assert.deepEqual(msummon_environ(pm(M.PM_BLACK_LIGHT)),
        { what: 'light', cloud: 'flash' });
    assert.deepEqual(msummon_environ(pm(M.PM_NEWT)),
        { what: 'smoke', cloud: 'cloud' });
});

test('olfaction denies smell to golems and seven class letters', () => {
    assert.equal(olfaction(pm(M.PM_PAPER_GOLEM)), false); // is_golem
    assert.equal(olfaction(pm(M.PM_FLOATING_EYE)), false); // S_EYE
    assert.equal(olfaction(pm(M.PM_BLUE_JELLY)), false);   // S_JELLY
    assert.equal(olfaction(pm(M.PM_BROWN_PUDDING)), false); // S_PUDDING
    assert.equal(olfaction(pm(M.PM_ACID_BLOB)), false);    // S_BLOB
    assert.equal(olfaction(pm(M.PM_DUST_VORTEX)), false);  // S_VORTEX
    assert.equal(olfaction(pm(M.PM_AIR_ELEMENTAL)), false); // S_ELEMENTAL
    assert.equal(olfaction(pm(M.PM_LICHEN)), false);       // S_FUNGUS
    assert.equal(olfaction(pm(M.PM_YELLOW_LIGHT)), false); // S_LIGHT
    assert.equal(olfaction(pm(M.PM_JACKAL)), true);
});

test('the two mseenres converters map their own key sets', () => {
    // Both converters are pure switches, so passing the port's own constant in
    // and expecting the port's own constant back proves nothing: an undefined
    // AD_DISN matched `case undefined` and this test passed while the branch
    // was dead. Every number below is transcribed from the C headers instead.
    //
    // Inputs are AD_foo from monattk.h lines 42-50, in the order
    // cvt_adtyp_to_mseenres() lists its cases. Expectations are M_SEEN_foo
    // from the enum at monst.h lines 77-86.
    assert.equal(cvt_adtyp_to_mseenres(1), 0x0001);   // AD_MAGM -> M_SEEN_MAGR
    assert.equal(cvt_adtyp_to_mseenres(2), 0x0002);   // AD_FIRE -> M_SEEN_FIRE
    assert.equal(cvt_adtyp_to_mseenres(3), 0x0004);   // AD_COLD -> M_SEEN_COLD
    assert.equal(cvt_adtyp_to_mseenres(4), 0x0008);   // AD_SLEE -> M_SEEN_SLEEP
    assert.equal(cvt_adtyp_to_mseenres(5), 0x0010);   // AD_DISN -> M_SEEN_DISINT
    assert.equal(cvt_adtyp_to_mseenres(6), 0x0020);   // AD_ELEC -> M_SEEN_ELEC
    assert.equal(cvt_adtyp_to_mseenres(7), 0x0040);   // AD_DRST -> M_SEEN_POISON
    assert.equal(cvt_adtyp_to_mseenres(8), 0x0080);   // AD_ACID -> M_SEEN_ACID
    // AD_PHYS (monattk.h:42) reaches the default arm: no AD_foo type maps to
    // M_SEEN_REFL, and M_SEEN_NOTHING is 0x0000 at monst.h:77.
    assert.equal(cvt_adtyp_to_mseenres(0), 0x0000);

    // Inputs are prop_types from prop.h: FIRE_RES through ACID_RES at lines
    // 15-21, ANTIMAGIC at line 30, and REFLECTING at line 88.
    assert.equal(cvt_prop_to_mseenres(12), 0x0001);  // ANTIMAGIC -> M_SEEN_MAGR
    assert.equal(cvt_prop_to_mseenres(1), 0x0002);   // FIRE_RES -> M_SEEN_FIRE
    assert.equal(cvt_prop_to_mseenres(2), 0x0004);   // COLD_RES -> M_SEEN_COLD
    assert.equal(cvt_prop_to_mseenres(3), 0x0008);   // SLEEP_RES -> M_SEEN_SLEEP
    assert.equal(cvt_prop_to_mseenres(4), 0x0010);   // DISINT_RES -> M_SEEN_DISINT
    assert.equal(cvt_prop_to_mseenres(6), 0x0040);   // POISON_RES -> M_SEEN_POISON
    assert.equal(cvt_prop_to_mseenres(5), 0x0020);   // SHOCK_RES -> M_SEEN_ELEC
    assert.equal(cvt_prop_to_mseenres(7), 0x0080);   // ACID_RES -> M_SEEN_ACID
    // REFLECTING is the one property the adtyp converter cannot produce.
    assert.equal(cvt_prop_to_mseenres(65), 0x0100);  // REFLECTING -> M_SEEN_REFL
    // STONE_RES (prop.h:22) has no arm, so it takes the default.
    assert.equal(cvt_prop_to_mseenres(8), 0x0000);
});
