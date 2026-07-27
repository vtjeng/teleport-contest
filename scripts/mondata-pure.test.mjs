// Pin the pure functions of mondata.c. The game does not call most of these
// yet, so these expectations are the only proof the ports are correct. Every
// expected value below is derived by reading mondata.c, mondata.h, monattk.h,
// and the monsters.h entry for the species involved, not by running the
// JavaScript and recording what it produced.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACID_RES,
    ANTIMAGIC,
    COLD_RES,
    DISINT_RES,
    FIRE_RES,
    G_GENOD,
    M_SEEN_ACID,
    M_SEEN_COLD,
    M_SEEN_DISINT,
    M_SEEN_ELEC,
    M_SEEN_FIRE,
    M_SEEN_MAGR,
    M_SEEN_NOTHING,
    M_SEEN_POISON,
    M_SEEN_REFL,
    M_SEEN_SLEEP,
    POISON_RES,
    REFLECTING,
    SHOCK_RES,
    SLEEP_RES,
} from '../js/const.js';
import * as M from '../js/monsters.js';
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

test('poly_when_stoned excludes the stone golem and honors genocide', () => {
    const vitals = monsterState(true);
    assert.equal(poly_when_stoned(pm(M.PM_PAPER_GOLEM), vitals), true);
    // A non-golem never polymorphs on being stoned.
    assert.equal(poly_when_stoned(pm(M.PM_NEWT), vitals), false);
    // The stone golem is already the target form.
    assert.equal(poly_when_stoned(pm(M.PM_STONE_GOLEM), vitals), false);

    // With the stone golem genocided there is nothing to turn into.
    vitals.svm.mvitals[M.PM_STONE_GOLEM].mvflags |= G_GENOD;
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
    // newt: mlevel 0, geno has neither G_SGROUP nor G_LGROUP, no ranged
    // attack, ac 8, mmove 6, one AT_CLAW/AD_PHYS 1d3 attack.
    //   n = 0 (groups) + 0 (ranged) + 0 (ac) + 0 (speed)
    //     + 1 (aatyp > 0) + 0 (AT_MAGC) + 0 (AT_WEAP&STRONG)
    //     + 0 (special damage; AD_PHYS) + 0 (damd*damn = 3 <= 23) = 1
    //   n < 6 so tmp = 0 + (1/3 + 1) = 1
    assert.equal(mstrength(pm(M.PM_NEWT)), 1);

    // grid bug is the one species the AD_PHYS increment is skipped for, via
    // C's `else if (strcmp(pmnames[NEUTRAL], "grid bug"))`.
    // mlevel 0, ac 9, mmove 12, one AT_BITE/AD_ELEC 1d1 attack.
    //   n = 1 (aatyp > 0) + 1 (AD_ELEC is a "special" damage type through the
    //   strcmp branch being skipped? no: AD_ELEC is not in the DRLI/STON/DRST/
    //   DRDX/DRCO/WERE list, and the strcmp is false for "grid bug", so the
    //   n += (tmp2 != AD_PHYS) increment does not run) = 1
    //   n < 6 so tmp = 0 + (1/3 + 1) = 1
    assert.equal(mstrength(pm(M.PM_GRID_BUG)), 1);

    // killer bee takes the artificial +2 from the named-species adjustment.
    // mlevel 1, G_LGROUP, ac -1, mmove 18, one AT_STNG/AD_DRST 1d3 attack.
    //   n = 2 (G_LGROUP << 1) + 0 (ranged) + 1 (ac < 4) + 1 (ac < 0)
    //     + 1 (mmove >= 18) + 1 (aatyp > 0) + 2 (AD_DRST is special)
    //     + 0 (damd*damn = 3) + 2 (killer bee adjustment) = 10
    //   n >= 6 so tmp = 1 + 10/2 = 6
    assert.equal(mstrength(pm(M.PM_KILLER_BEE)), 6);
});

test('hates_blessings covers undead and demons', () => {
    assert.equal(hates_blessings(pm(M.PM_HUMAN_ZOMBIE)), true); // undead
    assert.equal(hates_blessings(pm(M.PM_WATER_DEMON)), true);  // demon
    assert.equal(hates_blessings(pm(M.PM_NEWT)), false);
    // mon_hates_blessings adds vampshifters, which a plain newt is not.
    assert.equal(
        mon_hates_blessings({ data: pm(M.PM_NEWT), cham: M.NON_PM }),
        false,
    );
    assert.equal(
        mon_hates_blessings({ data: pm(M.PM_HUMAN_ZOMBIE), cham: M.NON_PM }),
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
        const cobra = pm(M.PM_COBRA);
        // The cobra spits blinding venom: AT_SPIT with AD_BLND.
        const spit = dmgtype_fromattack(cobra, M.AD_BLND, M.AT_SPIT);
        assert.equal(spit.aatyp, M.AT_SPIT);
        assert.equal(spit.adtyp, M.AD_BLND);
        // The same damage type under AT_ANY finds the first matching attack.
        assert.equal(dmgtype_fromattack(cobra, M.AD_BLND, M.AT_ANY), spit);
        // A specific attack type that does not carry that damage type fails.
        assert.equal(dmgtype_fromattack(cobra, M.AD_BLND, M.AT_BITE), null);
        assert.equal(dmgtype_fromattack(pm(M.PM_NEWT), M.AD_BLND, M.AT_ANY),
            null);
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

test('gender reports 2 for neuter and the female flag otherwise', () => {
    assert.equal(gender({ data: pm(M.PM_ACID_BLOB), female: 0 }), 2);
    assert.equal(gender({ data: pm(M.PM_HUMAN), female: 1 }), 1);
    assert.equal(gender({ data: pm(M.PM_HUMAN), female: 0 }), 0);
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

    const hero = { data: pm(M.PM_GRAY_DRAGON) };
    const heroState = {
        ...state, youmonst: hero, urace: { mnum: M.PM_HUMAN }, u: {},
    };
    assert.equal(raceptr(hero, heroState), pm(M.PM_HUMAN));
});

test('stagger picks the third and fourth locomotion verbs', () => {
    // locoverbs indexes 2 and 3 are the staggering forms. A lowercase default
    // selects index 2 and an uppercase default selects index 3.
    assert.equal(stagger(pm(M.PM_FLOATING_EYE), 'stumble'), 'wobble');
    assert.equal(stagger(pm(M.PM_FLOATING_EYE), 'Stumble'), 'Wobble');
    // flys (MZ_SMALL or smaller) flutters; flyl (larger) staggers. These two
    // rows are identical at the indexes locomotion() reads and differ here.
    assert.equal(stagger(pm(M.PM_BAT), 'stumble'), 'flutter');
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
    const claw = { aatyp: M.AT_CLAW };
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
    assert.equal(on_fire(pm(M.PM_NEWT), { aatyp: M.AT_HUGS }),
        'being roasted');
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
    assert.equal(cvt_adtyp_to_mseenres(M.AD_MAGM), M_SEEN_MAGR);
    assert.equal(cvt_adtyp_to_mseenres(M.AD_FIRE), M_SEEN_FIRE);
    assert.equal(cvt_adtyp_to_mseenres(M.AD_COLD), M_SEEN_COLD);
    assert.equal(cvt_adtyp_to_mseenres(M.AD_SLEE), M_SEEN_SLEEP);
    assert.equal(cvt_adtyp_to_mseenres(M.AD_DISN), M_SEEN_DISINT);
    assert.equal(cvt_adtyp_to_mseenres(M.AD_ELEC), M_SEEN_ELEC);
    assert.equal(cvt_adtyp_to_mseenres(M.AD_DRST), M_SEEN_POISON);
    assert.equal(cvt_adtyp_to_mseenres(M.AD_ACID), M_SEEN_ACID);
    // No AD_foo type maps to M_SEEN_REFL.
    assert.equal(cvt_adtyp_to_mseenres(M.AD_PHYS), M_SEEN_NOTHING);

    assert.equal(cvt_prop_to_mseenres(ANTIMAGIC), M_SEEN_MAGR);
    assert.equal(cvt_prop_to_mseenres(FIRE_RES), M_SEEN_FIRE);
    assert.equal(cvt_prop_to_mseenres(COLD_RES), M_SEEN_COLD);
    assert.equal(cvt_prop_to_mseenres(SLEEP_RES), M_SEEN_SLEEP);
    assert.equal(cvt_prop_to_mseenres(DISINT_RES), M_SEEN_DISINT);
    assert.equal(cvt_prop_to_mseenres(POISON_RES), M_SEEN_POISON);
    assert.equal(cvt_prop_to_mseenres(SHOCK_RES), M_SEEN_ELEC);
    assert.equal(cvt_prop_to_mseenres(ACID_RES), M_SEEN_ACID);
    // REFLECTING is the one property the adtyp converter cannot produce.
    assert.equal(cvt_prop_to_mseenres(REFLECTING), M_SEEN_REFL);
});
