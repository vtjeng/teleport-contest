import assert from 'node:assert/strict';
import test from 'node:test';

import { adjalign, ALIGNLIM } from '../js/attrib.js';
import { experience } from '../js/exper.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    corpse_chance,
    killed,
    m_detach,
    mon_leaving_level,
    mondead,
    monkilled,
    unstuck,
    zombie_maker,
} from '../js/mon.js';
import {
    m_at,
    newMonster,
    place_monster,
    remove_monster,
} from '../js/monst.js';
import { set_malign } from '../js/makemon.js';
import { emits_light, is_neuter } from '../js/mondata.js';
import { new_light_source } from '../js/light.js';
import { canSpotMonster } from '../js/startup_a11y.js';
import { accessible } from '../js/monmove.js';
import { maketrap } from '../js/trap.js';
import { PIT, WEB } from '../js/const.js';
import { mksobj, place_object, remove_object } from '../js/obj.js';
import {
    AMULET_OF_LIFE_SAVING,
    BOULDER,
    CORPSE,
    ORCISH_DAGGER,
} from '../js/objects.js';
import {
    AD_DCAY,
    AD_DGST,
    AD_FIRE,
    AD_PHYS,
    AD_RBRE,
    AD_RUST,
    NON_PM,
    PM_ARCH_LICH,
    PM_CAVE_SPIDER,
    PM_CHAMELEON,
    PM_COCKATRICE,
    PM_GAS_SPORE,
    PM_GHOUL,
    PM_ARCHEOLOGIST,
    PM_GOBLIN,
    PM_FIRE_ANT,
    PM_GIANT_EEL,
    PM_GLASS_PIERCER,
    PM_GRID_BUG,
    PM_HORSE,
    PM_HUMAN_WEREJACKAL,
    PM_JACKAL,
    PM_KEYSTONE_KOP,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_LARGE_MIMIC,
    PM_LEPRECHAUN,
    PM_LICHEN,
    PM_LIZARD,
    PM_LONG_WORM,
    PM_MINOTAUR,
    PM_NEWT,
    PM_OWLBEAR,
    PM_PAPER_GOLEM,
    PM_SEWER_RAT,
    PM_QUASIT,
    PM_RAVEN,
    PM_SKELETON,
    PM_STONE_GOLEM,
    PM_VAMPIRE,
    PM_VLAD_THE_IMPALER,
    PM_WEREJACKAL,
    PM_WINGED_GARGOYLE,
    PM_WOOD_NYMPH,
    PM_WRAITH,
    PM_YELLOW_LIGHT,
} from '../js/monsters.js';
import {
    LS_MONSTER,
    MAGICAL_BREATHING,
    MON_DETACH,
    OBJ_FLOOR,
    OBJ_MINVENT,
    W_AMUL,
} from '../js/const.js';

// A Valkyrie on a plain first level. Any seed that reaches the first prompt
// will do; 7710044 is the base row of the kill matrix, so this is the hero
// that matrix recorded.
const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

async function hero(seed = 7710044) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    return game;
}

// A monster shaped the way makemon() leaves one: cham is NON_PM rather than
// cg.zeromonst's 0, because makemon.c:1355 writes that for every species that
// is not a shapeshifter, and m_lev starts at the species mlevel, which
// makemon.c:1332 copies before adj_lev() can raise it. exper.c experience()
// reads m_lev rather than the species record, so a fixture that left it zero
// would score every monster as first level.
function monster(pmidx, overrides = {}) {
    return newMonster({
        cham: NON_PM,
        m_lev: game.mons[pmidx].mlevel,
        m_id: 100,
        mhp: 1,
        mhpmax: 1,
        mcanmove: 1,
        data: game.mons[pmidx],
        ...overrides,
    });
}

// A random source that records the bound of every call and answers from a
// scripted list, so a test can put a specific roll where it wants one.
// Put a fixture monster on a free accessible square beside the hero and link
// it onto the level chain, the way makemon() would. The starting room already
// holds monsters on some neighbours, so the square is chosen rather than
// assumed, and mhp is written after place_monster(), which refuses a corpse.
let nextFixtureId = 100;
function spawn(pmidx, overrides = {}) {
    const { mhp = 1, ...rest } = overrides;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        if (!accessible(x, y, game) || m_at(x, y, game)) continue;
        const mon = monster(pmidx, {
            mx: x, my: y, m_id: ++nextFixtureId, ...rest,
        });
        place_monster(mon, x, y, game);
        mon.nmon = game.level.monlist;
        game.level.monlist = mon;
        mon.mhp = mhp;
        return mon;
    }
    throw new Error('no free square beside the hero');
}

function scripted(rolls = [], fallback = 1) {
    const bounds = [];
    const queue = [...rolls];
    const take = (label) => {
        bounds.push(label);
        return queue.length ? queue.shift() : fallback;
    };
    return {
        bounds,
        lines: [],
        // mkobj.c mksobj() and its corpse timer need the whole family, so the
        // recorder answers all six rather than the three the kill itself uses.
        random: {
            d: (n, x) => take(`d(${n},${x})`),
            rn1: (x, from) => take(`rn1(${x},${from})`) + from,
            rn2: (b) => take(`rn2(${b})`),
            rnd: (b) => take(`rnd(${b})`),
            rne: (b) => take(`rne(${b})`),
            rnz: (b) => take(`rnz(${b})`),
        },
    };
}

function killEnv(rolls = [], fallback = 1) {
    const recorder = scripted(rolls, fallback);
    return {
        bounds: recorder.bounds,
        lines: recorder.lines,
        random: recorder.random,
        message: async (text) => { recorder.lines.push(text); },
        unsupported: (reason) => { throw new Error(reason); },
    };
}

function refuses(fn, reason, label) {
    return assert.throws(fn, (error) => {
        assert.equal(error.message, reason, label);
        return true;
    }, label);
}

function refusesAsync(fn, reason, label) {
    return assert.rejects(fn, (error) => {
        assert.equal(error.message, reason, label);
        return true;
    }, label);
}

// mon.c corpse_chance():3247. Every divisor below was computed from the
// species record in js/monsters.js, which the generated-data check pins
// against monst.c: tmp = 2 + ((geno & G_FREQ) < 2) + verysmall(mdat).
test('corpse_chance divides by frequency and size', async () => {
    await hero();
    // [species, divisor, why]
    const cases = [
        // G_FREQ 4 and MZ_SMALL: neither term applies.
        [PM_LICHEN, 2],
        // G_FREQ 2 fails `< 2` by one, and MZ_SMALL is not verysmall, so a
        // goblin reaches the lichen's divisor by a different route.
        [PM_GOBLIN, 2],
        // G_FREQ 3, MZ_SMALL.
        [PM_JACKAL, 2],
        // G_FREQ 1 alone.
        [PM_KOBOLD, 3],
        // MZ_TINY alone: G_FREQ 5 clears the frequency test.
        [PM_NEWT, 3],
        // Both terms: G_FREQ 1 and MZ_TINY.
        [PM_SEWER_RAT, 4],
    ];
    for (const [pmidx, divisor] of cases) {
        const env = killEnv([1]);
        const label = `${game.mons[pmidx].pmnames.find(Boolean)}`;
        assert.equal(
            corpse_chance(monster(pmidx), null, false, game, env),
            false,
            `${label} declined`,
        );
        assert.deepEqual(env.bounds, [`rn2(${divisor})`], label);
        // A zero roll is the only one that leaves a corpse.
        const kept = killEnv([0]);
        assert.equal(
            corpse_chance(monster(pmidx), null, false, game, kept),
            true,
            `${label} kept`,
        );
    }
});

// mon.c corpse_chance():3244-3246. Six disjuncts answer TRUE before the
// divisor is ever computed, so they spend no call at all: PM_LIZARD by name,
// bigmonst() for a stone golem, is_mplayer() for a player-monster
// Archeologist, and mon->isshk for any species at all.
test('corpse_chance answers big and special monsters without drawing',
    async () => {
        await hero();
        for (const pmidx of [PM_LIZARD, PM_STONE_GOLEM, PM_ARCHEOLOGIST]) {
            const env = killEnv();
            assert.equal(
                corpse_chance(monster(pmidx), null, false, game, env),
                true,
                `${pmidx}`,
            );
            assert.deepEqual(env.bounds, [], `${pmidx} drew nothing`);
        }
        // isshk is a flag rather than a species, and it is the last disjunct.
        const shk = killEnv();
        assert.equal(
            corpse_chance(monster(PM_NEWT, { isshk: 1 }), null, false,
                          game, shk),
            true,
        );
        assert.deepEqual(shk.bounds, []);
        // A cloned lizard falls through the first disjunct to the divisor,
        // because C ands `!mon->mcloned` onto it. Its own record is G_FREQ 5
        // and MZ_TINY, so the divisor is 3.
        const cloned = killEnv([1]);
        assert.equal(
            corpse_chance(monster(PM_LIZARD, { mcloned: 1 }), null, false,
                          game, cloned),
            false,
        );
        assert.deepEqual(cloned.bounds, ['rn2(3)']);
    });

// mon.c corpse_chance():3193-3232. Both stopped arms sit above the first draw
// or message on their path.
test('corpse_chance stops on liches and gas spores before it draws',
    async () => {
        await hero();
        for (const pmidx of [PM_ARCH_LICH, PM_VLAD_THE_IMPALER]) {
            const env = killEnv();
            refuses(
                () => corpse_chance(monster(pmidx), null, false, game, env),
                'a lich body crumbling into dust',
            );
            assert.deepEqual(env.bounds, []);
        }
        const spore = killEnv();
        refuses(
            () => corpse_chance(monster(PM_GAS_SPORE), null, false, game,
                                spore),
            'a gas spore exploding on death',
        );
        // The refusal is at the top of the matching attack slot, so the d()
        // that would roll the explosion's damage is unspent.
        assert.deepEqual(spore.bounds, []);
    });

// mon.c LEVEL_SPECIFIC_NOCORPSE() (44-47). Its rn2(3) belongs to a graveyard
// and to undead alone; every other level short-circuits before it.
test('the graveyard term draws only for undead in a graveyard', async () => {
    await hero();
    const ordinary = killEnv([1]);
    assert.equal(
        corpse_chance(monster(PM_KOBOLD_ZOMBIE), null, false, game, ordinary),
        false,
    );
    assert.deepEqual(ordinary.bounds, ['rn2(3)'], 'the divisor, not the term');

    game.level.flags.graveyard = true;
    try {
        // Undead in a graveyard: the rn2(3) comes first and a nonzero result
        // returns FALSE without reaching the divisor.
        const undead = killEnv([2]);
        assert.equal(
            corpse_chance(monster(PM_KOBOLD_ZOMBIE), null, false, game,
                          undead),
            false,
        );
        assert.deepEqual(undead.bounds, ['rn2(3)']);
        // A zero falls through to the divisor, so two calls happen.
        const through = killEnv([0, 1]);
        assert.equal(
            corpse_chance(monster(PM_KOBOLD_ZOMBIE), null, false, game,
                          through),
            false,
        );
        assert.deepEqual(through.bounds, ['rn2(3)', 'rn2(3)']);
        // A living species in the same graveyard never reaches the term.
        const living = killEnv([1]);
        assert.equal(
            corpse_chance(monster(PM_LICHEN), null, false, game, living),
            false,
        );
        assert.deepEqual(living.bounds, ['rn2(2)']);
    } finally {
        game.level.flags.graveyard = false;
    }

    // level.flags.deathdrops is the macro's second disjunct, and it stops
    // every species without drawing.
    game.level.flags.deathdrops = false;
    try {
        const nodrops = killEnv();
        assert.equal(
            corpse_chance(monster(PM_LICHEN), null, false, game, nodrops),
            false,
        );
        assert.deepEqual(nodrops.bounds, []);
    } finally {
        game.level.flags.deathdrops = true;
    }
});

// display.h canspotmon() (129), which mon.c xkilled():3508 asks before it
// names what the hero killed. C's macro has no hit-point test, so a monster
// whose last point has just gone is still named; the port carried one until
// this slice and printed "You kill it!" for every kill.
test('canspotmon still sees a monster with no hit points left', async () => {
    await hero();
    const mon = spawn(PM_NEWT);
    assert.equal(canSpotMonster(mon, game), true, 'alive');
    mon.mhp = 0;
    assert.equal(canSpotMonster(mon, game), true, 'at zero');
    assert.equal(canSpotMonster(null, game), false, 'no monster at all');
});

// mon.c zombie_maker() (361-380).
test('zombie_maker admits liches and true zombies only', async () => {
    await hero();
    assert.equal(zombie_maker(monster(PM_KOBOLD_ZOMBIE)), true, 'zombie');
    assert.equal(zombie_maker(monster(PM_ARCH_LICH)), true, 'lich');
    // The two Z-class monsters C excludes by name.
    assert.equal(zombie_maker(monster(PM_GHOUL)), false, 'ghoul');
    assert.equal(zombie_maker(monster(PM_SKELETON)), false, 'skeleton');
    assert.equal(zombie_maker(monster(PM_LICHEN)), false, 'lichen');
    // mcan is tested before the class, so a cancelled lich makes none.
    assert.equal(
        zombie_maker(monster(PM_ARCH_LICH, { mcan: 1 })), false, 'cancelled',
    );
});

// exper.c experience() (84-166). Every figure was computed from the species
// record and the formula, and the first three are the ones the kill matrix
// confirms against fresh C recordings.
test('experience adds up the species bonuses', async () => {
    await hero();
    // A newt: m_lev 0 so the base is 1; ac 8 is not below 3; mmove 6 is not
    // above NORMAL_SPEED; AT_BITE is not above AT_BUTT; AD_PHYS adds nothing.
    assert.equal(experience(monster(PM_NEWT), 0, game), 1);
    // A lichen: AT_TUCH is above AT_BUTT and is neither AT_WEAP nor AT_MAGC,
    // so the "special attack" arm adds 3. AD_STCK is above AD_PHYS and below
    // AD_BLND, and m_lev is 0, so 2 * 0 adds nothing.
    assert.equal(experience(monster(PM_LICHEN), 0, game), 4);
    // A goblin: AT_WEAP adds 5.
    assert.equal(experience(monster(PM_GOBLIN), 0, game), 6);
    // A cave spider: m_lev 1 makes the base 1 + 1 * 1, and armor class 3 is
    // not below 3, so 3244 stays silent and nothing else applies.
    assert.equal(experience(monster(PM_CAVE_SPIDER), 0, game), 2);
    // A leprechaun: mmove 15 is above NORMAL_SPEED but not above
    // 3 * NORMAL_SPEED / 2, so the speed arm adds 3 rather than 5, and
    // AD_SGOLD takes the closing `!= AD_PHYS` arm for m_lev more.
    // 1 + 25, +3, +5.
    assert.equal(experience(monster(PM_LEPRECHAUN), 0, game), 34);
    // A horse: mmove 20 clears 3 * NORMAL_SPEED / 2, so the speed arm adds 5.
    // 1 + 25, +5.
    assert.equal(experience(monster(PM_HORSE), 0, game), 31);
    // A quasit: armor class 2 is below 3 but not below 0, so 3244's
    // multiplier is 1 rather than 2. 1 + 9, +(7-2), +3 for speed, +3 for each
    // of its two AD_DRDX attacks.
    assert.equal(experience(monster(PM_QUASIT), 0, game), 24);
    // A giant eel: armor class -1 doubles the bonus, and AD_WRAP on an S_EEL
    // is worth a thousand points on its own to a hero who cannot breathe
    // water. 1 + 25, +(7 - -1) * 2, +3 for AT_TUCH, +5 for AD_WRAP, +1000.
    assert.equal(experience(monster(PM_GIANT_EEL), 0, game), 1050);
    // The same eel with magical breathing: youprop.h Amphibious() suppresses
    // the thousand and nothing else changes.
    const breathing = game.u.uprops[MAGICAL_BREATHING];
    breathing.extrinsic = W_AMUL;
    try {
        assert.equal(experience(monster(PM_GIANT_EEL), 0, game), 50);
    } finally {
        breathing.extrinsic = 0;
    }
    // A cockatrice, whose second and third attacks are both AD_STON: the
    // same flat 50 as AD_DRLI, reached through the middle operand of 3249's
    // three-way test rather than the first. 1 + 25, +3 for AT_TUCH, +50, +50.
    assert.equal(experience(monster(PM_COCKATRICE), 0, game), 129);
    // A wraith: AD_DRLI is worth 50 flat, and AT_TUCH adds 3.
    assert.equal(experience(monster(PM_WRAITH), 0, game), 90);
    // A fire ant: AD_FIRE sits between AD_PHYS and AD_BLND, so it is worth
    // twice the monster level. 1 + 9, +3 for speed, +2 * 3.
    assert.equal(experience(monster(PM_FIRE_ANT), 0, game), 19);
    // A raven, whose second attack is AD_BLND exactly. 116's range test is
    // half-open, so 11 falls past it to the closing `!= AD_PHYS` arm and is
    // worth m_lev rather than twice it. 1 + 16, +5 for speed, +4.
    assert.equal(experience(monster(PM_RAVEN), 0, game), 26);
    // A glass piercer, which sits on two boundaries at once: armor class 0 is
    // below 3 but not below 0, so the multiplier is 1, and its 4d6 bite is
    // damd * damn 24, one over 3252's bar. 1 + 49, +(7-0), +7.
    assert.equal(experience(monster(PM_GLASS_PIERCER), 0, game), 64);
    // A winged gargoyle at exactly level 9, one over the flat-50 bar, with
    // armor class -2 to double the first bonus. 1 + 81, +(7 - -2) * 2, +3 for
    // speed, +50.
    assert.equal(experience(monster(PM_WINGED_GARGOYLE), 0, game), 153);
    // A large mimic at exactly level 8, one below 3255's bar, which is what
    // shows that bar is `>` rather than `>=`. 1 + 64, +8 for AD_STCK.
    assert.equal(experience(monster(PM_LARGE_MIMIC), 0, game), 73);
    // A minotaur, which is where the last three arms live: two attacks whose
    // damd * damn clears 23 add m_lev each, extra_nasty() adds seven times it,
    // and a level above 8 adds a flat 50. 1 + 225, +3, +15, +15, +105, +50.
    assert.equal(experience(monster(PM_MINOTAUR), 0, game), 414);

    // The kill count only matters for a revived or cloned monster. Twenty
    // kills is the last full-value one; the twenty-first halves the award.
    const cloned = monster(PM_GOBLIN, { mcloned: 1 });
    assert.equal(experience(cloned, 20, game), 6);
    assert.equal(experience(cloned, 21, game), 3);
    assert.equal(experience(cloned, 41, game), 2);
    // An uncloned goblin ignores the count entirely.
    assert.equal(experience(monster(PM_GOBLIN), 255, game), 6);
});

// attrib.c adjalign() (1297-1316).
test('adjalign raises the record to the moves-based ceiling', async () => {
    await hero();
    const u = game.u;
    const before = u.ualign.record;
    // ALIGNLIM is 10 + moves/200, and a fresh game is on move 1.
    assert.equal(ALIGNLIM(game), 10);

    adjalign(3, game);
    assert.equal(u.ualign.record, before + 3);
    // A gain that would pass the ceiling is clamped to it.
    adjalign(50, game);
    assert.equal(u.ualign.record, 10);
    // A gain that does not raise the record leaves it alone; C's guard is
    // `newalign > u.ualign.record`, not `n > 0`.
    adjalign(0, game);
    assert.equal(u.ualign.record, 10);

    // 200 moves buy one more point of headroom.
    game.moves = 400;
    try {
        assert.equal(ALIGNLIM(game), 12);
        adjalign(5, game);
        assert.equal(u.ualign.record, 12);
    } finally {
        game.moves = 1;
    }

    refuses(
        () => adjalign(-1, game),
        'ability change requires adjalign() with a loss, '
        + 'which reaches mon.c adj_erinys()',
    );
    assert.equal(u.ualign.record, 12, 'the loss changed nothing');
});

// mon.c unstuck() (3437-3467). The holder's re-hold cooldown is the only
// observable effect on the supported path.
test('unstuck re-arms a holder and leaves everything else alone',
    async () => {
        await hero();
        // Not the holder: the whole function is skipped.
        const bystander = monster(PM_LICHEN);
        const quiet = killEnv();
        unstuck(bystander, game, quiet);
        assert.deepEqual(quiet.bounds, []);
        assert.equal(bystander.mspec_used, 0);

        // A lichen's AT_TUCH/AD_STCK is one of C's three holding attacks, so
        // releasing it rolls the cooldown.
        const holder = monster(PM_LICHEN);
        game.u.ustuck = holder;
        const env = killEnv([2]);
        unstuck(holder, game, env);
        assert.equal(game.u.ustuck, null);
        assert.deepEqual(env.bounds, ['rnd(2)']);
        assert.equal(holder.mspec_used, 2);

        // An owlbear's AT_HUGS is the third of C's three, and it carries
        // neither AD_STCK nor AT_ENGL, so it is the only one of the disjuncts
        // that can decide the test on its own.
        const hugger = monster(PM_OWLBEAR);
        game.u.ustuck = hugger;
        const hugs = killEnv([1]);
        unstuck(hugger, game, hugs);
        assert.deepEqual(hugs.bounds, ['rnd(2)']);
        assert.equal(hugger.mspec_used, 1);

        // A holder whose cooldown is already running keeps it: 3462-3465's
        // `!mtmp->mspec_used` exists because unstuck() can be reached after a
        // shape change, and re-rolling would both spend a call and overwrite
        // the live value. This is the only fixture here that starts nonzero.
        const cooling = monster(PM_LICHEN, { mspec_used: 3 });
        game.u.ustuck = cooling;
        const cool = killEnv([2]);
        unstuck(cooling, game, cool);
        assert.equal(game.u.ustuck, null);
        assert.deepEqual(cool.bounds, [], 'no second rnd(2)');
        assert.equal(cooling.mspec_used, 3, 'the running cooldown survives');

        // A species with none of the three attacks spends no call.
        const plain = monster(PM_NEWT);
        game.u.ustuck = plain;
        const none = killEnv();
        unstuck(plain, game, none);
        assert.equal(game.u.ustuck, null);
        assert.deepEqual(none.bounds, []);

        // An engulfer stops above set_ustuck(), so u.ustuck survives.
        const engulfer = monster(PM_LICHEN);
        game.u.ustuck = engulfer;
        game.u.uswallow = 1;
        try {
            refuses(
                () => unstuck(engulfer, game, killEnv()),
                'releasing an engulfer',
            );
            assert.equal(game.u.ustuck, engulfer);
        } finally {
            game.u.uswallow = 0;
            game.u.ustuck = null;
        }
    });

// mon.c mon_leaving_level() (2695-2730) and m_detach() (2733-2803).
test('m_detach takes the monster off the map and drops what it carried',
    async () => {
        await hero();
        const mon = spawn(PM_GOBLIN, { mtrapped: 1 });
        const x = mon.mx;
        const y = mon.my;
        const dagger = mksobj(ORCISH_DAGGER, true, false, { state: game });
        dagger.where = OBJ_MINVENT;
        dagger.ocarry = mon;
        mon.minvent = dagger;

        const env = killEnv();
        await m_detach(mon, mon.data, true, game, env);

        assert.equal(game.level.monsters[x][y], null, 'off the map');
        assert.equal(mon.mtrapped, 0, 'the trapped flag is cleared first');
        assert.equal(mon.mhp, 0);
        assert.equal(mon.mstate & MON_DETACH, MON_DETACH);
        assert.equal(game.iflags.purge_monsters, 1);
        // relobj() emptied minvent onto the square the monster stood on.
        assert.equal(mon.minvent, null);
        assert.equal(dagger.where, OBJ_FLOOR);
        assert.equal(game.level.objects[x][y], dagger);
        // relobj()'s is_pet argument is FALSE here, so steal.c mdrop_obj()
        // computes `is_pet && flags.verbose` as FALSE and says nothing.
        assert.deepEqual(env.lines, [], 'a dead monster drops in silence');

        // A second detach would double-count the purge, so it throws rather
        // than corrupting what dmonsfree() checks.
        await refusesAsync(
            () => m_detach(mon, mon.data, true, game, killEnv()),
            'm_detach: monster is already detached',
        );
    });

// mon.c m_detach():2744-2745. A luminous monster takes its light source with
// it; one left behind would keep lighting a square nothing occupies.
test('m_detach releases the light a luminous monster shed', async () => {
    await hero();
    // S_LIGHT is the first of mondata.h emits_light()'s cases, and a yellow
    // light's radius is 1. A goblin answers 0 and is the species every other
    // m_detach row here uses, so the call is unreachable through them.
    const glow = spawn(PM_YELLOW_LIGHT);
    assert.equal(emits_light(glow.data), 1, 'the fixture is luminous');
    new_light_source(glow.mx, glow.my, 1, LS_MONSTER, glow, game);
    assert.equal(game.gl.light_base.id, glow, 'lit before the kill');

    await m_detach(glow, glow.data, true, game, killEnv());
    assert.equal(game.gl.light_base, null, 'and dark after it');
});

// mon.c m_detach():2782 and mondead():3133. Both compare a monster's m_id
// against a global that is 0 until something writes it, so both are tested for
// a nonzero value first; a monster whose identity does not match must fall
// through rather than be taken for the thief or the quest leader.
test('the theft and quest identities match by m_id, not by absence',
    async () => {
        await hero();
        game.gs = { ...(game.gs ?? {}), stealmid: 5000 };
        game.svq.quest_status.leader_m_id = 6000;
        try {
            // Neither id matches, so nothing stops and nothing is marked.
            const other = spawn(PM_NEWT);
            await mondead(other, game, killEnv());
            assert.equal(game.svq.quest_status.leader_is_dead, undefined);

            // The leader's own id: mondead():3134 marks him dead, and
            // m_detach() still lets him through because his msound is not
            // MS_LEADER.
            const leader = spawn(PM_NEWT);
            leader.m_id = 6000;
            await mondead(leader, game, killEnv());
            assert.equal(game.svq.quest_status.leader_is_dead, true);

            // The thief's own id stops m_detach() at 2782.
            const thief = spawn(PM_NEWT);
            thief.m_id = 5000;
            await refusesAsync(
                () => mondead(thief, game, killEnv()),
                'the death of a monster in mid-theft',
            );
        } finally {
            delete game.gs.stealmid;
            game.svq.quest_status.leader_m_id = 0;
        }
    });

// mon.c m_detach():2767-2780. due_to_death FALSE is mongone()'s call, and it
// is the only thing that keeps relobj() from running.
test('m_detach keeps inventory when the monster merely goes away',
    async () => {
        await hero();
        const mon = spawn(PM_GOBLIN);
        const x = mon.mx;
        const y = mon.my;
        const dagger = mksobj(ORCISH_DAGGER, true, false, { state: game });
        dagger.where = OBJ_MINVENT;
        dagger.ocarry = mon;
        mon.minvent = dagger;

        await m_detach(mon, mon.data, false, game, killEnv());

        assert.equal(game.level.monsters[x][y], null);
        assert.equal(mon.minvent, dagger, 'kept its inventory');
        assert.equal(game.level.objects[x][y], null, 'nothing on the floor');
    });

// mon.c mon_leaving_level():2699-2716. A monster that is not the one standing
// on its own coordinates is off the map already, so nothing is removed.
test('mon_leaving_level leaves a square another monster occupies',
    async () => {
        await hero();
        const standing = spawn(PM_NEWT);
        const x = standing.mx;
        const y = standing.my;
        const stale = monster(PM_GOBLIN, { mx: x, my: y, m_id: 201 });

        mon_leaving_level(stale, game, killEnv());

        assert.equal(game.level.monsters[x][y], standing, 'left in place');
        assert.equal(stale.mtrapped, 0);

        // 2727-2729, which sits below the onmap block and so runs for both.
        // apply.c use_pole() is the only C writer that stores a monster in
        // svc.context.polearm.hitmon and it is unported -- do.c goto_level()
        // only ever clears it -- so the fixture sets the pointer by hand.
        game.context.polearm = { hitmon: standing };
        mon_leaving_level(stale, game, killEnv());
        assert.equal(game.context.polearm.hitmon, standing, 'a different mon');
        mon_leaving_level(standing, game, killEnv());
        assert.equal(game.context.polearm.hitmon, null, 'forgotten');
    });

// mon.c mondead():3111-3121 and 3128-3130. A dying chameleon or lycanthrope
// reverts before m_detach() sees it, which is why mondead() saves mtmp->data
// into `mptr` at 3111 first, and the death is counted against the form the
// monster ends in rather than the one it wore.
test('mondead reverts a shifted form and counts the death', async () => {
    await hero();

    // A werejackal in jackal shape: 3116 rewrites it to the human form, so
    // 3129 credits PM_HUMAN_WEREJACKAL rather than PM_WEREJACKAL.
    const were = spawn(PM_WEREJACKAL);
    const humanDeaths = game.svm.mvitals[PM_HUMAN_WEREJACKAL].died;
    await mondead(were, game, killEnv());
    assert.equal(were.data, game.mons[PM_HUMAN_WEREJACKAL]);
    assert.equal(
        game.svm.mvitals[PM_HUMAN_WEREJACKAL].died, humanDeaths + 1,
    );
    assert.equal(game.svm.mvitals[PM_WEREJACKAL].died, 0);

    // A chameleon wearing a jackal's shape reverts to the chameleon itself.
    const shifted = spawn(PM_JACKAL, { cham: PM_CHAMELEON });
    await mondead(shifted, game, killEnv());
    assert.equal(shifted.data, game.mons[PM_CHAMELEON]);
    assert.equal(shifted.cham, NON_PM);
    assert.equal(game.svm.mvitals[PM_CHAMELEON].died, 1);
    assert.equal(game.svm.mvitals[PM_JACKAL].died, 0);

    // An ordinary species is left alone and counted where it stands.
    const plain = spawn(PM_NEWT);
    await mondead(plain, game, killEnv());
    assert.equal(plain.data, game.mons[PM_NEWT]);
    assert.equal(game.svm.mvitals[PM_NEWT].died, 1);

    // mon.c:3135 stops counting at 255, because svm.mvitals[].died is a
    // one-byte field that also feeds experience()'s repeat-kill divisor.
    game.svm.mvitals[PM_NEWT].died = 254;
    await mondead(spawn(PM_NEWT), game, killEnv());
    assert.equal(game.svm.mvitals[PM_NEWT].died, 255);
    await mondead(spawn(PM_NEWT), game, killEnv());
    assert.equal(game.svm.mvitals[PM_NEWT].died, 255, 'capped');
});

// mon.c mondead():3096-3171, the arms that stop. Each is guarded by exactly
// C's condition, and every one is reached before m_detach(). The message alone
// says nothing about where a refusal sits: one moved below m_detach() would
// still carry it while leaving a monster off the map, its inventory on the
// floor and iflags.purge_monsters counting a death dmonsfree() cannot find.
// So each row asserts the position instead -- nothing drawn, nothing printed,
// still on the map, not detached, not purged -- and asserts the vanquished
// count against 3135, which is above three of these arms and below three.
test('mondead stops on the arms it does not own', async () => {
    await hero();

    const stopped = async (mon, reason, diedDelta, label) => {
        const x = mon.mx;
        const y = mon.my;
        const mndx = mon.data.pmidx;
        const died = game.svm.mvitals[mndx].died;
        const purged = game.iflags.purge_monsters ?? 0;
        const env = killEnv();
        await refusesAsync(() => mondead(mon, game, env), reason, label);
        assert.deepEqual(env.bounds, [], `${label}: drew nothing`);
        assert.deepEqual(env.lines, [], `${label}: printed nothing`);
        assert.equal(m_at(x, y, game), mon, `${label}: still on the map`);
        assert.equal(mon.minvent?.where ?? OBJ_MINVENT, OBJ_MINVENT,
                     `${label}: inventory undropped`);
        assert.equal((mon.mstate ?? 0) & MON_DETACH, 0,
                     `${label}: not detached`);
        assert.equal(game.iflags.purge_monsters ?? 0, purged,
                     `${label}: purge count`);
        assert.equal(game.svm.mvitals[mndx].died, died + diedDelta,
                     `${label}: vanquished count`);
        // Teardown: spawn() takes the first free square beside the hero, and
        // a refused kill leaves its fixture standing on one.
        remove_monster(x, y, game);
    };

    // A shape-shifted vampire would revert instead of dying.
    await stopped(spawn(PM_JACKAL, { cham: PM_VAMPIRE }),
                  'a shape-shifted vampire reverting', 0, 'vampshifter');
    await stopped(spawn(PM_NEWT, { isgd: 1 }),
                  "a vault guard's death", 0, 'vault guard');
    // A Keystone Kop rolls rnd(5) for its return, which needs makemon(). It
    // is the first arm below 3135, so its own death is already counted.
    await stopped(spawn(PM_KEYSTONE_KOP),
                  'a Keystone Kop coming back', 1, 'Kop');
    // A unique monster would be live-logged, and so would a revived one:
    // 3009's mrevived exemption applies to the High Priest alone, which is the
    // one species unique_corpstat() admits that is not literally unique.
    const logged = 'the live-log line for a unique or shopkeeper kill';
    await stopped(spawn(PM_VLAD_THE_IMPALER), logged, 1, 'Vlad');
    await stopped(spawn(PM_VLAD_THE_IMPALER, { mrevived: 1 }),
                  logged, 1, 'revived Vlad');
    // A monster carrying a worn amulet of life saving. lifesaved_monster()
    // runs above everything else in mondead(), so nothing is counted.
    const saved = spawn(PM_NEWT);
    const amulet = mksobj(AMULET_OF_LIFE_SAVING, false, false,
                          { state: game });
    amulet.where = OBJ_MINVENT;
    amulet.ocarry = saved;
    amulet.owornmask = W_AMUL;
    saved.minvent = amulet;
    await stopped(saved, 'a monster saved by an amulet of life saving', 0,
                  'life saving');
});

// mon.c killed() (3469-3473) passes XKILL_GIVEMSG, so the message is given and
// neither the corpse nor the conduct is suppressed.
test('killed spends the drop and corpse calls in that order', async () => {
    await hero();
    const mon = spawn(PM_GOBLIN, { mhp: 0 });
    // spawn() builds its fixtures directly rather than through makemon(), so
    // malign has to be set the way makemon.c:1429 would. A goblin's maligntyp
    // is -3 and this hero is neutral, so set_malign() reaches its last arm --
    // neither always_peaceful nor always_hostile nor co-aligned -- and leaves
    // the absolute value. Without this the assertion below compares 0 with 0.
    assert.equal(set_malign(mon, game), 3, 'the value makemon() would store');
    assert.equal(game.u.ualign.record, 0, 'and the record starts at zero');

    // rn2(6)=2 declines the drop; rn2(2)=1 declines the corpse.
    const env = killEnv([2, 1]);
    await killed(mon, game, env);

    assert.deepEqual(env.lines, ['You kill the goblin!']);
    assert.deepEqual(env.bounds, ['rn2(6)', 'rn2(2)']);
    assert.equal(game.level.monsters[mon.mx][mon.my], null);
    assert.equal(game.u.uconduct.killer, 1);
    assert.equal(game.u.uexp, 6, 'experience() through more_experienced()');
    assert.equal(game.u.urexp, 24, 'the score takes four times the points');
    // xkilled():3725's closing adjalign(mtmp->malign).
    assert.equal(game.u.ualign.record, 3, 'the malign reached adjalign()');
});

// mon.c xkilled():3664. The luck penalty is the one arm a peaceful target
// reaches before the alignment chain below it, and its rn2(2) is drawn only
// for a peaceful one.
test('a peaceful kill costs luck behind its own draw', async () => {
    await hero();

    // A hostile short-circuits at `mtmp->mpeaceful` and never draws.
    const hostile = spawn(PM_NEWT, { mhp: 0 });
    const quiet = killEnv([2, 1]);
    await killed(hostile, game, quiet);
    assert.deepEqual(quiet.bounds, ['rn2(6)', 'rn2(3)']);
    assert.equal(game.u.uluck, 0);

    // A peaceful one draws, and a zero costs a point of luck. The alignment
    // arm below stops afterwards, so this asserts the throw as well.
    const peaceful = spawn(PM_NEWT, { mhp: 0, mpeaceful: 1 });
    const env = killEnv([2, 1, 0]);
    await refusesAsync(
        () => killed(peaceful, game, env), 'killing a peaceful monster',
    );
    assert.deepEqual(env.bounds, ['rn2(6)', 'rn2(3)', 'rn2(2)']);
    assert.equal(game.u.uluck, -1);
});

// mon.c make_corpse():850. KEEPTRAITS() (549-556) sends the monster itself
// into mkcorpstat(), which copies it into the corpse with mkobj.c
// save_mtraits() (2156-2195). Every case here reaches make_corpse() through
// killed(), so the message and both draws happen first.
test('a corpse that keeps its traits carries a copy of the monster',
    async () => {
    await hero();

    // Five of KEEPTRAITS()'s six disjuncts cannot be shown here: mtmp->mtame
    // stops at xkilled():3505's pet message, unique_corpstat() and
    // mtmp->isshk stop at logdeadmon() or at m_detach():2784 before
    // make_corpse() runs, is_reviver()'s lowest species is a troll, whose
    // experience levels a fresh Valkyrie and stops in exper.c newexplevel(),
    // and the quest leader's m_id reaches make_corpse() but then stops at
    // xkilled():3672. dmgtype(AD_SEDU) is the one that runs to completion.
    const nymph = spawn(PM_WOOD_NYMPH, { mhp: 0 });
    // mhpmax below the species level, so that save_mtraits():2184 has to
    // raise it: a wood nymph's mlevel is 3, so the saved copy must read 4.
    nymph.mhpmax = 0;
    nymph.mtrack[0].x = 5;
    // trapeffect_pit() kills the hero's dog, so edog is the mextra record
    // this port's live consumer copies. A tame monster stops earlier, so the
    // record rides on the nymph instead; only dogmove.c reads edog, and only
    // for a tame monster.
    nymph.mextra = { edog: { apport: 7, ogoal: { x: 3, y: 4 } } };
    const nymphAt = { x: nymph.mx, y: nymph.my };
    await killed(nymph, game, killEnv([2, 0]));

    const nymphCorpse = game.level.objects[nymphAt.x][nymphAt.y];
    assert.equal(nymphCorpse.otyp, CORPSE, 'nymph corpse');
    const saved = nymphCorpse.oextra.omonst;
    assert.equal(saved.mnum, PM_WOOD_NYMPH, 'saved species index');
    assert.equal(saved.m_id, nymph.m_id, 'm_id survives, to spot a revival');
    // The four pointers C invalidates at 2173-2176, plus the worm tail.
    assert.equal(saved.data, null, 'saved data pointer');
    assert.equal(saved.nmon, null, 'saved nmon pointer');
    assert.equal(saved.minvent, null, 'saved minvent pointer');
    assert.equal(saved.mw, null, 'saved wielded weapon');
    assert.equal(saved.wormno, 0, 'saved worm number');
    assert.equal(saved.mhpmax, 4, 'mhpmax raised above the species level');
    assert.equal(saved.mhp, 0, 'a dead monster saves no hit points');
    // m_detach() runs before make_corpse(), so the live monster carries
    // MON_DETACH and only the copy has it cleared.
    assert.equal(nymph.mstate & MON_DETACH, MON_DETACH, 'live mstate');
    assert.equal(saved.mstate & MON_DETACH, 0, 'saved mstate');
    // C assigns the struct by value, so neither the mtrack array nor the
    // mextra records are shared with the monster.
    assert.notEqual(saved.mtrack, nymph.mtrack, 'mtrack is copied');
    assert.deepEqual(saved.mtrack, nymph.mtrack, 'mtrack keeps its values');
    assert.notEqual(saved.mextra, nymph.mextra, 'mextra is copied');
    assert.notEqual(saved.mextra.edog, nymph.mextra.edog, 'edog is copied');
    assert.deepEqual(
        saved.mextra.edog, nymph.mextra.edog, 'edog keeps its values',
    );

    // The quest-leader global set to another monster's m_id: KEEPTRAITS()'s
    // conjunction must fall through rather than treat any kill as his, which
    // leaves a corpse with no saved monster at all.
    game.svq.quest_status.leader_m_id = 7001;
    try {
        const bystander = spawn(PM_NEWT, { mhp: 0 });
        await killed(bystander, game, killEnv([2, 0]));
        const corpse = game.level.objects[bystander.mx][bystander.my];
        assert.equal(corpse.otyp, CORPSE);
        assert.equal(corpse.oextra, null, 'no traits without KEEPTRAITS');
    } finally {
        game.svq.quest_status.leader_m_id = 0;
    }

    // A species that answers none of them leaves an ordinary corpse, and it
    // is dknown because the hero is neither blind nor unable to sense it.
    const plain = spawn(PM_NEWT, { mhp: 0 });
    const x = plain.mx;
    const y = plain.my;
    await killed(plain, game, killEnv([2, 0]));
    const corpse = game.level.objects[x][y];
    assert.equal(corpse.otyp, CORPSE);
    // make_corpse():927's clear_dknown() cannot change this either way: the
    // only object it ever produces is a CORPSE, whose oc_merge is 1, and
    // mkobj.c clear_dknown():842 zeroes dknown for a mergeable object, which
    // is the value mksobj() already left.
    assert.equal(corpse.dknown, false);
    assert.equal(corpse.norevive, false, 'no Trollsbane was wielded');
});

// mon.c make_corpse():576-579, whose flags mkobj.c mkcorpstat():2086 stores in
// the corpse's spe. Every ordinary kill runs those three lines, and nothing
// else can show what they wrote: the sex costs no random-number call and
// appears on no screen, so the saved object is the only witness a swapped pair
// of flags or a dropped is_neuter() guard would ever face.
test('a corpse records the sex of the monster it came from', async () => {
    await hero();
    // CORPSTAT_FEMALE is 1 and CORPSTAT_MALE is 2 in js/const.js, and
    // mkcorpstat() masks with CORPSTAT_SPE_VAL (0x07) before storing.
    // rn2(6)=2 declines the treasure drop and the corpse roll of 0 takes the
    // corpse, for both divisors below.
    const corpseOf = async (pmidx, female) => {
        const mon = spawn(pmidx, { mhp: 0, female });
        const x = mon.mx;
        const y = mon.my;
        await killed(mon, game, killEnv([2, 0]));
        const corpse = game.level.objects[x][y];
        assert.equal(corpse.otyp, CORPSE, `${pmidx} left a corpse`);
        // Teardown: the next fixture reuses this square, and two corpses on
        // it could merge.
        remove_object(corpse, { state: game });
        return corpse;
    };

    // A newt carries none of M2_MALE, M2_FEMALE or M2_NEUTER, so makemon()
    // rolls its sex and either of the first two arms can apply.
    assert.equal(is_neuter(game.mons[PM_NEWT]), false, 'the newt has a sex');
    assert.equal((await corpseOf(PM_NEWT, true)).spe, 1, 'female');
    assert.equal((await corpseOf(PM_NEWT, false)).spe, 2, 'male');
    // A lichen is M2_NEUTER, so 578's guard drops the male arm as well and
    // the corpse keeps the flags it was called with.
    assert.equal(is_neuter(game.mons[PM_LICHEN]), true, 'the lichen has none');
    assert.equal((await corpseOf(PM_LICHEN, false)).spe, 0, 'neuter');
});

// mon.c xkilled():3618-3621. gz.zombify decides whether mkobj.c
// mkcorpstat() arms a corpse timer at all, and every term of its expression
// answers FALSE for a hero this port can build: the Valkyrie holds a weapon,
// so `!uwep` alone settles it. A goblin is the species that would show the
// difference, because zombie_form() answers PM_ORC_ZOMBIE for it and
// start_corpse_timeout() would then spend an rn1(15,5) that is absent here.
test('an ordinary corpse arms no zombie timer', async () => {
    // Both sides of `!uwep`: a Valkyrie holds a long sword, and a Monk holds
    // nothing, which is the only one of the four terms a first-level hero can
    // satisfy. Neither leaves a zombie, because the hero is no lich.
    for (const [role, seed] of [['Valkyrie', 7710044], ['Monk', 9900243]]) {
        await runSegment({
            seed,
            datetime: DATETIME,
            nethackrc: RC.replace('role:Valkyrie', `role:${role}`),
            moves: '',
        });
        const mon = spawn(PM_GOBLIN, { mhp: 0 });
        const env = killEnv([2, 0]);
        await killed(mon, game, env);

        // rn2(6) declines the drop, rn2(2) takes the corpse, and everything
        // after it belongs to mkobj.c mksobj(). A goblin is not one of the
        // special corpses, so mkcorpstat() arms no timer and the list ends at
        // rnz(10); a zombifying corpse would add start_corpse_timeout()'s
        // rn1(15,5) after it.
        assert.deepEqual(env.bounds, [
            'rn2(6)', 'rn2(2)',
            'rnd(2)', 'rn2(3)', 'rn2(4)', 'rn2(5)', 'rn2(7)', 'rn2(8)',
            'rn2(11)', 'rn2(15)', 'rn2(16)', 'rn2(21)', 'rn2(2)', 'rnz(10)',
        ], role);
        assert.equal(game.gz.zombify, false, `${role} reset`);
        assert.equal(game.level.objects[mon.mx][mon.my].otyp, CORPSE, role);
    }
});

// mon.c xkilled():3514-3522 and 3528-3541, the two arms whose guards read a
// value the ordinary path leaves unset. 3514's own guard decides nothing: it
// is the two boulder tests inside it that set nocorpse and burycorpse, and a
// trapped monster in a bare pit is killed like any other.
test('the pit and thrown-missile arms read their own conditions',
    async () => {
        await hero();
        // mtrapped with no trap under it at all. 3514 evaluates t_at() only
        // because mtrapped is set, and the null it answers has to stop the
        // conjunction before is_pit() reads a field of it.
        const loose = spawn(PM_NEWT, { mhp: 0, mtrapped: 1 });
        const untrapped = killEnv([2, 1]);
        await killed(loose, game, untrapped);
        assert.deepEqual(untrapped.bounds, ['rn2(6)', 'rn2(3)']);
        assert.equal(game.level.monsters[loose.mx][loose.my], null);

        // mtrapped over a trap that is not a pit: the third conjunct fails.
        const webbed = spawn(PM_NEWT, { mhp: 0, mtrapped: 1 });
        maketrap(webbed.mx, webbed.my, WEB, { state: game });
        await killed(webbed, game, killEnv([2, 1]));
        assert.equal(game.level.monsters[webbed.mx][webbed.my], null);

        // A pit with no boulder on it and none in the monster's pack. C sets
        // neither flag at 3516 nor 3518, so the kill spends its two ordinary
        // draws: rn2(6)=2 declines the drop and the newt's rn2(3)=1 declines
        // the corpse.
        const pitted = spawn(PM_NEWT, { mhp: 0, mtrapped: 1 });
        maketrap(pitted.mx, pitted.my, PIT, { state: game });
        const bare = killEnv([2, 1]);
        await killed(pitted, game, bare);
        assert.deepEqual(bare.bounds, ['rn2(6)', 'rn2(3)']);
        assert.deepEqual(bare.lines, ['You kill the newt!']);
        assert.equal(game.level.monsters[pitted.mx][pitted.my], null);
        assert.equal(game.level.objects[pitted.mx][pitted.my], null);

        // 3515's boulder resting on the square, which sets nocorpse. The flag
        // is never read: mon_leaving_level() reaches trap.c fill_pit() first,
        // and that is where the boulder about to fall in stops the kill --
        // above the drop draw, so the stream is untouched.
        const under = spawn(PM_NEWT, { mhp: 0, mtrapped: 1 });
        maketrap(under.mx, under.my, PIT, { state: game });
        const floorRock = mksobj(BOULDER, false, false, { state: game });
        place_object(floorRock, under.mx, under.my, { state: game });
        const covered = killEnv();
        await refusesAsync(
            () => killed(under, game, covered),
            'unsupported hero move: fill_pit() settling a boulder into a pit',
        );
        assert.deepEqual(covered.bounds, [], 'stopped above the drop draw');
        // Teardown: the stopped kill freed the square but left the boulder on
        // it, and spawn() reuses the first free square beside the hero. The
        // vision hook is a fixture no-op; nothing below reads block points.
        remove_object(floorRock,
                      { state: game, hooks: { recalcBlockPoint() {} } });

        // 3517's boulder in the monster's pack, which sets burycorpse. Its
        // square is clear, so fill_pit() passes and the stop instead comes
        // from m_detach()'s relobj(), which drops that boulder onto the pit
        // before make_corpse() can read the flag. Also above both draws.
        const carrier = spawn(PM_NEWT, { mhp: 0, mtrapped: 1 });
        maketrap(carrier.mx, carrier.my, PIT, { state: game });
        const carriedRock = mksobj(BOULDER, false, false, { state: game });
        carriedRock.where = OBJ_MINVENT;
        carriedRock.ocarry = carrier;
        carrier.minvent = carriedRock;
        const packed = killEnv();
        await refusesAsync(
            () => killed(carrier, game, packed),
            `a boulder landing at <${carrier.mx},${carrier.my}>`,
        );
        assert.deepEqual(packed.bounds, [], 'stopped above the drop draw');

        // gt.thrownobj alone is not enough: 3528's first conjunct is
        // wasinside, and the hero is not inside anything here.
        const thrown = spawn(PM_NEWT, { mhp: 0 });
        game.gt = { ...(game.gt ?? {}), thrownobj: { oclass: 0 } };
        try {
            await killed(thrown, game, killEnv([2, 1]));
            assert.equal(game.level.monsters[thrown.mx][thrown.my], null);
        } finally {
            delete game.gt.thrownobj;
        }
    });

// mon.c xkilled():3574. nocorpse and LEVEL_SPECIFIC_NOCORPSE jump straight to
// the cleanup label, so neither the drop nor the corpse is even considered and
// the newsym() at 3642 does not run either.
test('a level with no death drops skips the whole object half', async () => {
    await hero();
    const mon = spawn(PM_GOBLIN, { mhp: 0 });
    const x = mon.mx;
    const y = mon.my;

    game.level.flags.deathdrops = false;
    try {
        const env = killEnv();
        await killed(mon, game, env);
        assert.deepEqual(env.bounds, [], 'no drop and no corpse call');
        assert.deepEqual(env.lines, ['You kill the goblin!']);
        assert.equal(game.level.objects[x][y], null);
        // The cleanup half still runs.
        assert.equal(game.u.uexp, 6);
    } finally {
        game.level.flags.deathdrops = true;
    }
});

// mon.c xkilled():3507. nonliving() chooses the verb, and 3508 chooses between
// the name and "it".
test('the kill line picks its verb and its noun from the target', async () => {
    await hero();

    const kill = async (pmidx, overrides = {}) => {
        const mon = spawn(pmidx, { mhp: 0, ...overrides });
        const env = killEnv([2, 1]);
        await killed(mon, game, env);
        return env.lines;
    };

    // is_undead, so nonliving() is true.
    assert.deepEqual(
        await kill(PM_KOBOLD_ZOMBIE), ['You destroy the kobold zombie!'],
    );
    assert.deepEqual(await kill(PM_NEWT), ['You kill the newt!']);
    // An undetected monster is neither seen nor sensed, so canspotmon() is
    // false and 3508 falls to "it".
    assert.deepEqual(
        await kill(PM_NEWT, { mundetected: 1 }), ['You kill it!'],
    );
});

// mon.c monkilled():3384-3388. The message names the victim, picks its verb
// from nonliving(), and inserts " by the " only when fltxt has text in it.
// C's guard is `fltxt &&`, a pointer test: every caller that supplies no text
// at all passes NULL, and the empty string trap.c thitm() passes is a live
// pointer that still prints.
test('the monkilled line reads its verb and its clause off the arguments',
    async () => {
        await hero();

        const kill = async (pmidx, fltxt, divisor) => {
            const mon = spawn(pmidx);
            // The corpse roll is the only call an ordinary death spends, and
            // 1 declines it for either divisor below, so no corpse is left on
            // the square the next fixture reuses.
            const env = killEnv([1]);
            await monkilled(mon, fltxt, AD_PHYS, game, env);
            assert.deepEqual(env.bounds, [`rn2(${divisor})`], `${pmidx}`);
            return env.lines;
        };

        // A goblin is G_FREQ 2 and MZ_SMALL, so corpse_chance()'s divisor is
        // 2; a kobold zombie is G_FREQ 1, which raises it to 3.
        assert.deepEqual(await kill(PM_GOBLIN, '', 2),
                         ['The goblin is killed!']);
        assert.deepEqual(await kill(PM_GOBLIN, 'fire', 2),
                         ['The goblin is killed by the fire!']);
        // is_undead, so nonliving() picks "destroyed".
        assert.deepEqual(await kill(PM_KOBOLD_ZOMBIE, '', 3),
                         ['The kobold zombie is destroyed!']);
        assert.deepEqual(await kill(PM_KOBOLD_ZOMBIE, 'gas cloud', 3),
                         ['The kobold zombie is destroyed by the gas cloud!']);
    });

// mon.c monkilled():3389-3391, the arm C reaches when the victim cannot be
// seen. It writes iflags.sad_feeling, which mondead() reads and clears one
// call later, and monkilled() is that flag's only writer in this port.
test('an unwitnessed death files the sad feeling under the victim',
    async () => {
        await hero();

        // A wild monster leaves the flag clear and dies normally: the newt's
        // divisor is 3 and 1 declines its corpse.
        const wild = spawn(PM_NEWT);
        const wildEnv = killEnv([1]);
        await monkilled(wild, null, AD_PHYS, game, wildEnv);
        assert.deepEqual(wildEnv.lines, [], 'nothing is printed');
        assert.equal(game.iflags.sad_feeling, false, 'cleared by mondead');
        assert.equal((wild.mstate ?? 0) & MON_DETACH, MON_DETACH, 'detached');

        // A pet sets it, and mondead() stops on it rather than printing "You
        // have a sad feeling for a moment, then it passes." That stop is
        // above m_detach(), so the pet is still on the map.
        const pet = spawn(PM_NEWT, { mtame: 1 });
        const petEnv = killEnv([1]);
        await refusesAsync(
            () => monkilled(pet, null, AD_PHYS, game, petEnv),
            'the sad feeling for a lost pet',
        );
        assert.deepEqual(petEnv.lines, [], 'nothing is printed');
        assert.deepEqual(petEnv.bounds, [], 'nothing is drawn');
        assert.equal(m_at(pet.mx, pet.my, game), pet, 'still on the map');
        assert.equal((pet.mstate ?? 0) & MON_DETACH, 0, 'not detached');
        remove_monster(pet.mx, pet.my, game);
    });

// mon.c monkilled():3398-3403. The three disjuncts of gd.disintegested choose
// mondead(), which leaves no corpse, over mondied(), which may. A paper golem
// separates them without a roll: corpse_chance() answers TRUE for is_golem()
// before it reaches its divisor, so mondied() always calls make_corpse(),
// which stops on the golem's pieces. mondead() alone finishes.
test('the disintegration test decides whether a corpse is even attempted',
    async () => {
        await hero();

        const golem = async (how) => {
            const mon = spawn(PM_PAPER_GOLEM);
            const env = killEnv();
            const outcome = await monkilled(mon, '', how, game, env).then(
                () => null,
                (error) => error.message,
            );
            assert.deepEqual(env.lines[0], 'The paper golem is destroyed!',
                             `${how}: the line is printed either way`);
            assert.deepEqual(env.bounds, [], `${how}: no roll is spent`);
            if (outcome) remove_monster(mon.mx, mon.my, game);
            return outcome;
        };

        const pieces = 'the pieces of a dead golem';
        // AD_DGST, -AD_RBRE, and AD_FIRE against a species completelyburns()
        // admits: each takes mondead() and leaves the square empty.
        assert.equal(await golem(AD_DGST), null, 'digested');
        assert.equal(await golem(-AD_RBRE), null, 'disintegrated');
        assert.equal(await golem(AD_FIRE), null, 'burnt up');
        // Neighbouring damage types do not: AD_RUST is the one the third
        // disjunct would admit for an iron golem rather than a paper one, and
        // AD_PHYS is what trap.c thitm() passes.
        assert.equal(await golem(AD_RUST), pieces, 'rusted');
        assert.equal(await golem(AD_PHYS), pieces, 'struck');

        // The AD_FIRE disjunct is conjoined with completelyburns(), so a newt
        // burnt to death still goes through mondied() and rolls for a corpse.
        const newt = spawn(PM_NEWT);
        const newtEnv = killEnv([1]);
        await monkilled(newt, '', AD_FIRE, game, newtEnv);
        assert.deepEqual(newtEnv.bounds, ['rn2(3)'], 'a corpse was attempted');
    });

// mon.c monkilled():3409-3415. C prints "May <pet> rest in peace." after the
// death, so the stop that stands in for it is below m_detach() -- that is
// where C puts the line, and the state it follows is C's own. `rxt` is what
// guards it, not mtame alone.
test('the pet golem farewell stops where C prints it', async () => {
    await hero();

    const pet = spawn(PM_PAPER_GOLEM, { mtame: 1 });
    const env = killEnv();
    await refusesAsync(
        () => monkilled(pet, '', AD_FIRE, game, env),
        'the farewell for a destroyed pet golem',
    );
    assert.deepEqual(env.lines, ['The paper golem is destroyed!']);
    assert.equal((pet.mstate ?? 0) & MON_DETACH, MON_DETACH, 'detached');

    // A pet whose species matches none of the three rxt tests passes through.
    // Each row pairs a damage type with a species that fails its companion
    // test: a newt is neither completelyburns(), completelyrusts() nor
    // completelyrots(), so every conjunction collapses and rxt stays null.
    // Both halves of each `&&` matter, and only the species half is free to
    // vary here, because the damage half is what selects the row.
    for (const how of [AD_FIRE, AD_RUST, AD_DCAY]) {
        const newt = spawn(PM_NEWT, { mtame: 1 });
        // The newt's corpse divisor is 3, and 1 declines it.
        await monkilled(newt, '', how, game, killEnv([1]));
        assert.equal((newt.mstate ?? 0) & MON_DETACH, MON_DETACH, `${how}`);
    }
});

// mon.c monkilled():3384. A long worm's visibility is worm_known() rather than
// cansee(), and that function is not ported. The stop sits above the message
// and above everything mondied() would do.
test('a long worm stops above the monkilled message', async () => {
    await hero();

    const worm = spawn(PM_LONG_WORM, { wormno: 1 });
    const env = killEnv();
    await refusesAsync(
        () => monkilled(worm, '', AD_PHYS, game, env),
        "a long worm's death by another monster",
    );
    assert.deepEqual(env.lines, [], 'printed nothing');
    assert.deepEqual(env.bounds, [], 'drew nothing');
    assert.equal(m_at(worm.mx, worm.my, game), worm, 'still on the map');
    assert.equal((worm.mstate ?? 0) & MON_DETACH, 0, 'not detached');
    assert.equal(game.svm.mvitals[PM_LONG_WORM].died, 0, 'not counted');
});
