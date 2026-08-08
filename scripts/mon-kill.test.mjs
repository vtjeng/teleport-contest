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
    unstuck,
    zombie_maker,
} from '../js/mon.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { canSpotMonster } from '../js/startup_a11y.js';
import { accessible } from '../js/monmove.js';
import { maketrap } from '../js/trap.js';
import { PIT, WEB } from '../js/const.js';
import { mksobj } from '../js/obj.js';
import {
    AMULET_OF_LIFE_SAVING,
    CORPSE,
    ORCISH_DAGGER,
} from '../js/objects.js';
import {
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
    PM_MINOTAUR,
    PM_NEWT,
    PM_OWLBEAR,
    PM_SEWER_RAT,
    PM_QUASIT,
    PM_RAVEN,
    PM_ROCK_TROLL,
    PM_SKELETON,
    PM_STONE_GOLEM,
    PM_VAMPIRE,
    PM_VLAD_THE_IMPALER,
    PM_WEREJACKAL,
    PM_WINGED_GARGOYLE,
    PM_WOOD_NYMPH,
    PM_WRAITH,
} from '../js/monsters.js';
import {
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

    // mon.c:3129 stops counting at 255, because svm.mvitals[].died is a
    // one-byte field that also feeds experience()'s repeat-kill divisor.
    game.svm.mvitals[PM_NEWT].died = 254;
    await mondead(spawn(PM_NEWT), game, killEnv());
    assert.equal(game.svm.mvitals[PM_NEWT].died, 255);
    await mondead(spawn(PM_NEWT), game, killEnv());
    assert.equal(game.svm.mvitals[PM_NEWT].died, 255, 'capped');
});

// mon.c mondead():3096-3171, the arms that stop. Each is guarded by exactly
// C's condition, and every one is reached before m_detach().
test('mondead stops on the arms it does not own', async () => {
    await hero();
    // A shape-shifted vampire would revert instead of dying.
    const vampshifter = monster(PM_JACKAL, { cham: PM_VAMPIRE });
    await refusesAsync(
        () => mondead(vampshifter, game, killEnv()),
        'a shape-shifted vampire reverting',
    );
    const guard = monster(PM_NEWT, { isgd: 1 });
    await refusesAsync(
        () => mondead(guard, game, killEnv()), "a vault guard's death",
    );
    // A Keystone Kop rolls rnd(5) for its return, which needs makemon().
    await refusesAsync(
        () => mondead(monster(PM_KEYSTONE_KOP), game, killEnv()),
        'a Keystone Kop coming back',
    );
    // A unique monster would be live-logged, and so would a revived one:
    // 3009's mrevived exemption applies to the High Priest alone, which is the
    // one species unique_corpstat() admits that is not literally unique.
    await refusesAsync(
        () => mondead(monster(PM_VLAD_THE_IMPALER), game, killEnv()),
        'the live-log line for a unique or shopkeeper kill',
    );
    await refusesAsync(
        () => mondead(monster(PM_VLAD_THE_IMPALER, { mrevived: 1 }), game,
                      killEnv()),
        'the live-log line for a unique or shopkeeper kill',
    );
    // A monster carrying a worn amulet of life saving.
    const saved = monster(PM_NEWT, { m_id: 202 });
    const amulet = mksobj(AMULET_OF_LIFE_SAVING, false, false,
                          { state: game });
    amulet.where = OBJ_MINVENT;
    amulet.ocarry = saved;
    amulet.owornmask = W_AMUL;
    saved.minvent = amulet;
    await refusesAsync(
        () => mondead(saved, game, killEnv()),
        'a monster saved by an amulet of life saving',
    );
});

// mon.c killed() (3469-3473) passes XKILL_GIVEMSG, so the message is given and
// neither the corpse nor the conduct is suppressed.
test('killed spends the drop and corpse calls in that order', async () => {
    await hero();
    const mon = spawn(PM_GOBLIN, { mhp: 0 });

    // rn2(6)=2 declines the drop; rn2(2)=1 declines the corpse.
    const env = killEnv([2, 1]);
    await killed(mon, game, env);

    assert.deepEqual(env.lines, ['You kill the goblin!']);
    assert.deepEqual(env.bounds, ['rn2(6)', 'rn2(2)']);
    assert.equal(game.level.monsters[mon.mx][mon.my], null);
    assert.equal(game.u.uconduct.killer, 1);
    assert.equal(game.u.uexp, 6, 'experience() through more_experienced()');
    assert.equal(game.u.urexp, 24, 'the score takes four times the points');
    // makemon.c set_malign() gave this goblin 3 against a neutral hero.
    assert.equal(game.u.ualign.record, mon.malign);
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
// into mkcorpstat(), which js/corpstat.js answers only with a save_mtraits()
// hook that no caller supplies, so each of its disjuncts is a stop rather than
// a corpse. Every case here reaches make_corpse() through killed(), so the
// message and both draws happen first.
test('a corpse that would keep its traits stops at mkcorpstat', async () => {
    await hero();
    const traits = 'mkcorpstat requires monster-trait persistence';

    // Three of KEEPTRAITS()'s six disjuncts stop earlier and cannot be shown
    // here: mtmp->mtame stops at xkilled():3505's pet message, and both
    // unique_corpstat() and mtmp->isshk stop at logdeadmon() or at
    // m_detach():2784 before make_corpse() runs.

    // is_reviver(): a troll, which is S_TROLL. corpse_chance() answers TRUE
    // for it at 3245 without drawing, so the only call spent is the drop's.
    const troll = spawn(PM_ROCK_TROLL, { mhp: 0 });
    const trollEnv = killEnv([2]);
    await refusesAsync(
        () => killed(troll, game, trollEnv), traits, 'is_reviver',
    );
    assert.deepEqual(trollEnv.bounds, ['rn2(6)']);

    // The quest leader's m_id, which reaches make_corpse() before the
    // alignment arm at 3677 that would otherwise stop it.
    game.svq.quest_status.leader_m_id = 7000;
    try {
        const leader = spawn(PM_NEWT, { mhp: 0 });
        leader.m_id = 7000;
        await refusesAsync(
            () => killed(leader, game, killEnv([2, 0])), traits, 'leader',
        );
    } finally {
        game.svq.quest_status.leader_m_id = 0;
    }

    // The same global with a monster whose m_id is not the leader's: the
    // conjunction must fall through rather than treat any kill as his.
    game.svq.quest_status.leader_m_id = 7001;
    try {
        const bystander = spawn(PM_NEWT, { mhp: 0 });
        await killed(bystander, game, killEnv([2, 0]));
        assert.equal(
            game.level.objects[bystander.mx][bystander.my].otyp, CORPSE,
        );
    } finally {
        game.svq.quest_status.leader_m_id = 0;
    }

    // dmgtype(AD_SEDU): a nymph.
    const nymph = spawn(PM_WOOD_NYMPH, { mhp: 0 });
    await refusesAsync(
        () => killed(nymph, game, killEnv([2, 0])), traits, 'AD_SEDU',
    );

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
// value the ordinary path leaves unset. Both must fall through when that value
// is absent and stop when it is present.
test('the pit and thrown-missile arms read their own conditions',
    async () => {
        await hero();
        // mtrapped with no trap under it, and mtrapped over a trap that is
        // not a pit: both fall through.
        const webbed = spawn(PM_NEWT, { mhp: 0, mtrapped: 1 });
        maketrap(webbed.mx, webbed.my, WEB, { state: game });
        await killed(webbed, game, killEnv([2, 1]));
        assert.equal(game.level.monsters[webbed.mx][webbed.my], null);

        // A pit under a trapped monster stops.
        const pitted = spawn(PM_NEWT, { mhp: 0, mtrapped: 1 });
        maketrap(pitted.mx, pitted.my, PIT, { state: game });
        await refusesAsync(
            () => killed(pitted, game, killEnv()),
            'killing a trapped monster in a pit',
        );

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
