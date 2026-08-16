import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEAF,
    helpless,
    M_ATTK_DEF_DIED,
    M_ATTK_HIT,
    M_ATTK_MISS,
    NATTK,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mattackm } from '../js/mhitm.js';
import {
    is_elf,
    is_orc,
    touch_petrifies,
    unsolid,
    zombie_form,
} from '../js/mondata.js';
import { accessible } from '../js/monmove.js';
import {
    AD_DGST,
    AD_ENCH,
    AD_PHYS,
    AD_STCK,
    AD_WRAP,
    AT_BITE,
    AT_BREA,
    AT_ENGL,
    AT_EXPL,
    AT_CLAW,
    AT_GAZE,
    AT_HUGS,
    AT_KICK,
    AT_NONE,
    AT_SPIT,
    AT_TENT,
    AT_TUCH,
    AT_WEAP,
    NON_PM,
    PM_ACID_BLOB,
    PM_COCKATRICE,
    PM_DISENCHANTER,
    PM_FOG_CLOUD,
    PM_GIANT_ANT,
    PM_GRID_BUG,
    PM_HILL_ORC,
    PM_KITTEN,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_LITTLE_DOG,
    PM_PONY,
    PM_SEWER_RAT,
    PM_WOODLAND_ELF,
} from '../js/monsters.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { cansee } from '../js/vision.js';
import { find_mac } from '../js/worn.js';

// A Valkyrie with no pet on a plain first level. The fixtures below place
// every combatant themselves, so all the seed has to supply is a lit room
// around the hero: mhitm.c mattackm():362-364 builds gv.vis from cansee() and
// canspotmon(), and every message under it is behind that flag, so an unlit
// room would test noises() instead. 7710048 opens with 53 free squares the
// hero can see.
const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    // acoustics is left at its default so that noises() reaches pline.c
    // You_hear() the way an ordinary game does; the row that turns it off
    // below writes the flag directly.
    'OPTIONS=pettype:none',
    '',
].join('\n');

async function hero(seed = 7710048) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    return game;
}

let nextFixtureId = 500;

// A monster shaped the way makemon() leaves one, placed on a chosen square.
function fixture(pmidx, x, y, overrides = {}) {
    const species = game.mons[pmidx];
    const mon = newMonster({
        cham: NON_PM,
        data: species,
        m_id: ++nextFixtureId,
        m_lev: species.mlevel,
        mcanmove: 1,
        mcansee: 1,
        mhp: 1,
        mhpmax: 1,
        mx: x,
        my: y,
        ...overrides,
    });
    place_monster(mon, x, y, game);
    mon.mhp = overrides.mhp ?? 8;
    mon.mhpmax = overrides.mhpmax ?? mon.mhp;
    mon.nmon = game.level.monlist;
    game.level.monlist = mon;
    return mon;
}

// Two free squares the hero can see, `gap` apart along the row they share.
// mhitm.c mattackm():362-364 makes gv.vis from cansee() and canspotmon(), and
// every message below it is behind that flag, so a fixture on an unlit square
// would be testing noises() instead.
function battlefield(gap = 1) {
    const free = (x, y) => accessible(x, y, game) && !m_at(x, y, game)
        && cansee(x, y, game);
    for (let dy = 0; dy <= 4; ++dy) {
        for (const y of [game.u.uy + dy, game.u.uy - dy]) {
            for (let dx = -10; dx <= 10; ++dx) {
                const ax = game.u.ux + dx;
                // A defender directly above the attacker's row is needed by
                // the grid-bug case, so leave that neighbour clear too.
                if (!free(ax, y) || !free(ax + gap, y)
                    || !free(ax + gap, y + 1)) continue;
                return { ax, dx: ax + gap, y };
            }
        }
    }
    throw new Error('no clear pair of visible squares near the hero');
}

// A random source that records the bound of every call and answers from a
// scripted list, so a test can put a specific roll where it wants one.
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

function attackEnv(rolls = [], fallback = 1) {
    const recorder = scripted(rolls, fallback);
    const redraws = [];
    return {
        bounds: recorder.bounds,
        lines: recorder.lines,
        random: recorder.random,
        redraws,
        state: game,
        message: async (text) => { recorder.lines.push(text); },
        redraw: (x, y) => { redraws.push([x, y]); },
        unsupported: (reason) => { throw new Error(reason); },
    };
}

// Aim gb.bhitpos at the defender, as dogmove.c dog_move():1149-1150 does
// before every call.
function aim(defender) {
    game.gb ??= {};
    game.gb.bhitpos = { x: defender.mx, y: defender.my };
    game.gn ??= {};
    game.gn.notonhead = false;
}

// monst.h:251 is `#define helpless(mon) ((mon)->msleeping || !(mon)->mcanmove)`
// and js/const.js owns it for the eleven call sites that used to spell it out.
// The test lives here because js/mhitm.js held one of the two duplicate
// definitions the convergence removed, so this file already imported the
// symbol. It is not that mhitm.c reads the macro most -- it does not.
//
// The four rows are the truth table. The pairs cover both encodings the port
// writes: js/monst.js:49 and :53 start a monster at false/false, js/mon.js new_were()
// wakes one with true, and js/steed.js:743 and :749 write 0 and 1 for the same
// two fields.
test('helpless reads sleep and immobility and nothing else', () => {
    assert.equal(helpless({ msleeping: false, mcanmove: true }), false);
    assert.equal(helpless({ msleeping: true, mcanmove: true }), true);
    assert.equal(helpless({ msleeping: 0, mcanmove: 0 }), true);
    assert.equal(helpless({ msleeping: 1, mcanmove: 1 }), true);
    // mfrozen, mtrapped and meating are separate C terms; a monster carrying
    // all three and neither of the two fields above is not helpless.
    assert.equal(
        helpless({
            msleeping: false,
            mcanmove: true,
            mfrozen: 7,
            mtrapped: true,
            meating: 5,
        }),
        false,
    );
});

// mhitm.c mattackm():321-370, the head every call runs before the attack loop.
// dogmove.c pet_ranged_attk() reaches it with the target out of reach, and
// every melee slot then takes the `distmin > 1` continue at :423-425 without a
// to-hit draw.
test('mattackm makes its setup writes before a distant target escapes it',
    async () => {
        await hero();
        const { ax, dx, y } = battlefield(3);
        const pet = fixture(PM_KITTEN, ax, y, { mtame: 10, mlstmv: 0 });
        const ant = fixture(PM_GIANT_ANT, dx, y);
        aim(pet); /* pet_ranged_attk() aims at the aggressor's own square */
        game.gs = { skipdrin: true };
        const env = attackEnv();

        assert.equal(await mattackm(pet, ant, env), M_ATTK_MISS);
        assert.deepEqual(env.bounds, []);
        assert.equal(pet.mlstmv, game.moves);
        assert.equal(game.gs.skipdrin, false);
        assert.equal(game.gv.vis, true);
        assert.equal(ant.mhp, 8);
    });

// mhitm.c mattackm():441 and missmm():74-93. `tmp` is the armour-class
// differential from :321-325; a roll at or above it misses, and the line names
// both monsters through do_name.c mon_nam_too().
test('mattackm misses on a roll the differential cannot beat', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const ant = fixture(PM_GIANT_ANT, dx, y);
    aim(ant);
    // A giant ant's AC is 3 and a kitten is level 2, so the differential is 5;
    // 20 is the highest roll rnd(20) can return and misses by any measure.
    const env = attackEnv([20]);

    assert.equal(await mattackm(pet, ant, env), M_ATTK_MISS);
    assert.deepEqual(env.lines, ['The kitten misses the giant ant.']);
    // rnd(20) is the to-hit roll; rn2(3) guards passivemm()'s second switch,
    // which a live defender always reaches.
    assert.deepEqual(env.bounds, ['rnd(20)', 'rn2(3)']);
    assert.equal(ant.mhp, 8);
});

// mhitm.c hitmm():644-731 and mdamagem():1014-1120. A landed bite prints
// hitmm()'s AT_BITE verb, spends mdamagem()'s damage roll at :1025 and the
// knockback pair uhitm.c mhitm_knockback() draws at :5258 and :5269, and
// takes the damage off the defender.
test('mattackm lands a bite and spends the damage and knockback rolls',
    async () => {
        await hero();
        const { ax, dx, y } = battlefield(1);
        const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
        const ant = fixture(PM_GIANT_ANT, dx, y);
        aim(ant);
        // 1 is the lowest roll rnd(20) can return, so it beats the
        // differential whatever it is; 3 is the damage the kitten's 1d6 bite
        // deals; the two knockback rolls decline the push, as C's do for an
        // AT_BITE that its :5273-5277 gate excludes anyway.
        const env = attackEnv([1, 3, 1, 1]);

        assert.equal(await mattackm(pet, ant, env), M_ATTK_HIT);
        assert.deepEqual(env.lines, ['The kitten bites the giant ant.']);
        assert.deepEqual(env.bounds,
                         ['rnd(20)', 'd(1,6)', 'rn2(3)', 'rn2(6)', 'rn2(3)']);
        assert.equal(ant.mhp, 5);
    });

// mhitm.c mdamagem():1071-1119 and makemon.c grow_up():2049-2100. The kill
// prints through mon.c monkilled(), rolls corpse_chance() and then grow_up()'s
// rnd(victim->m_lev + 1). rnd.c:163 is `x = RND(x) + 1`, so even rnd(1) spends
// a draw. passivemm() is called with mdead set and returns at :1359-1360
// without reaching its own rn2(3).
test('a lethal blow kills the defender and raises the killer\'s maximum',
    async () => {
        await hero();
        const { ax, dx, y } = battlefield(1);
        const pet = fixture(PM_KITTEN, ax, y, { mtame: 10, mhp: 4, mhpmax: 4 });
        // One hit point, so any damage roll is lethal.
        const ant = fixture(PM_GIANT_ANT, dx, y, { mhp: 1, mhpmax: 1 });
        aim(ant);
        // rnd(20)=1 hits, d(1,6)=3 is lethal and the knockback pair declines.
        // A giant ant is G_FREQ 3 and MZ_TINY (monsters.h:89-95), so
        // corpse_chance()'s `verysmall` term alone applies and its divisor is
        // 3; rn2(3)=1 then declines the corpse, keeping the square clear.
        // grow_up()'s rnd(victim->m_lev + 1) is rnd(3), because a giant ant
        // is a second-level monster.
        const env = attackEnv([1, 3, 1, 1, 1, 1]);

        // passivemm() folds the strike into the answer at :1359-1360, so a
        // fatal hit returns both bits rather than M_ATTK_DEF_DIED alone.
        assert.equal(await mattackm(pet, ant, env),
                     M_ATTK_DEF_DIED | M_ATTK_HIT);
        assert.deepEqual(env.lines, [
            'The kitten bites the giant ant.',
            'The giant ant is killed!',
        ]);
        assert.deepEqual(env.bounds, [
            'rnd(20)', 'd(1,6)', 'rn2(3)', 'rn2(6)', 'rn2(3)', 'rnd(3)',
        ]);
        assert.equal(ant.mhp, 0);
        // grow_up()'s max_increase, banked above its threshold test. A
        // kitten is a second-level monster, so the threshold is 16 and the
        // new maximum returns early well below it.
        assert.equal(pet.mhpmax, 5);
        // cur_increase is rn2(max_increase) only when max_increase exceeds 1,
        // and rnd(3) answered 1 here, so current hit points do not move.
        assert.equal(pet.mhp, 4);
    });

// mhitm.c mattackm():441, `dieroll = rnd(20 + i)`. Each later slot draws from
// a wider die, so a two-attack species spends rnd(20) and then rnd(21).
test('mattackm widens the die for every later attack slot', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pony = fixture(PM_PONY, ax, y, { mtame: 10 });
    const ant = fixture(PM_GIANT_ANT, dx, y);
    aim(ant);
    assert.equal(pony.data.mattk[0].aatyp, AT_KICK);
    assert.equal(pony.data.mattk[1].aatyp, AT_BITE);
    assert.equal(pony.data.mattk[2].aatyp, AT_NONE);
    // Both slots miss on the highest roll each die can return, so the run
    // reaches the end of the attack list. The 1 between them is the rn2(3)
    // passivemm() spends after the first miss.
    const env = attackEnv([20, 1, 21]);

    assert.equal(await mattackm(pony, ant, env), M_ATTK_MISS);
    assert.deepEqual(env.bounds,
                     ['rnd(20)', 'rn2(3)', 'rnd(21)', 'rn2(3)']);
    assert.deepEqual(env.lines, [
        'The pony misses the giant ant.',
        'The pony misses the giant ant.',
    ]);
});

// mhitm.c mattackm():378-380. Every slot after the first checks that the
// aimed square still holds the defender. dogmove.c pet_ranged_attk() aims at
// the aggressor instead, which is how a distant pet spends no draw at all.
test('mattackm abandons later slots when the aimed square is not the target',
    async () => {
        await hero();
        const { ax, dx, y } = battlefield(1);
        const pony = fixture(PM_PONY, ax, y, { mtame: 10 });
        const ant = fixture(PM_GIANT_ANT, dx, y);
        aim(pony); /* the aggressor's own square, not the defender's */
        const env = attackEnv([20]);

        assert.equal(await mattackm(pony, ant, env), M_ATTK_MISS);
        // Slot 0 runs because C tests the square only for `i > 0`.
        assert.deepEqual(env.bounds, ['rnd(20)', 'rn2(3)']);
    });

// mhitm.c mattackm():316-317. A grid bug can attack only along a row or a
// column, and the test sits above every setup write.
test('a grid bug cannot attack diagonally', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const bug = fixture(PM_GRID_BUG, ax, y, { mtame: 10, mlstmv: 0 });
    const ant = fixture(PM_GIANT_ANT, dx, y + 1);
    aim(ant);
    const env = attackEnv();

    assert.equal(await mattackm(bug, ant, env), M_ATTK_MISS);
    assert.deepEqual(env.bounds, []);
    assert.equal(bug.mlstmv, 0);

    // The same pair sharing a row passes the test and reaches the attack.
    game.level.monsters[ant.mx][ant.my] = null;
    ant.my = y;
    place_monster(ant, ant.mx, ant.my, game);
    aim(ant);
    const inline = attackEnv([20]);
    assert.equal(await mattackm(bug, ant, inline), M_ATTK_MISS);
    assert.deepEqual(inline.bounds, ['rnd(20)', 'rn2(3)']);
});

// mhitm.c mattackm():327-328, `tmp += 4` for a defender that cannot dodge,
// and the msleeping clear beside it.
test('a sleeping defender wakes and is easier to hit', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const ant = fixture(PM_GIANT_ANT, dx, y, { msleeping: 1 });
    aim(ant);
    // A giant ant's AC is 3 and a kitten is level 2, so the differential is 5
    // awake and 9 asleep. A roll of 7 misses at 5 and hits at 9, which is why
    // this row proves the bonus rather than merely exercising it.
    const env = attackEnv([7, 2, 1, 1]);

    assert.equal(await mattackm(pet, ant, env), M_ATTK_HIT);
    // C writes the literal 0 rather than FALSE, so the field ends numeric.
    assert.equal(ant.msleeping, 0);
    assert.equal(ant.mhp, 6);

    // The same roll against the same defender, now awake, misses.
    assert.equal(await mattackm(pet, ant, attackEnv([7])), M_ATTK_MISS);
    assert.equal(ant.mhp, 6);
});

// mhitm.c mattackm():367, `if (is_elf(pa) && is_orc(pd)) tmp++`. Both halves
// of the conjunction are exercised: the same attacker against an orc and
// against a non-orc, with the roll that sits exactly on the unbonused
// differential.
//
// Every elf carries AT_WEAP, which mattackm() refuses, so slot zero is
// replaced with a bite. mondata.h is_elf() and is_orc() read the species
// flags rather than the attack list, so the substitution leaves the branch
// under test alone.
test("an elf's blow against an orc gains one point of accuracy", async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const elf = fixture(PM_WOODLAND_ELF, ax, y, { mtame: 10 });
    elf.data = {
        ...elf.data,
        mattk: [
            { aatyp: AT_BITE, adtyp: AD_PHYS, damn: 1, damd: 4 },
            ...elf.data.mattk.slice(1),
        ],
    };
    assert.equal(is_elf(elf.data), true);
    const orc = fixture(PM_HILL_ORC, dx, y, { mhp: 30, mhpmax: 30 });
    assert.equal(is_orc(orc.data), true);
    aim(orc);

    const base = find_mac(orc, game) + elf.m_lev;
    // Without :367 the differential is `base`, so `tmp > dieroll` fails on a
    // roll of `base`. The bonus makes it `base + 1` and the same roll lands.
    const landed = attackEnv([base, 1, 1, 1]);
    assert.equal(await mattackm(elf, orc, landed), M_ATTK_HIT);
    // One point higher misses, so the bonus is exactly one.
    assert.equal(await mattackm(elf, orc, attackEnv([base + 1])),
                 M_ATTK_MISS);

    // A defender that is not an orc misses on the same roll, so the bonus
    // rests on the second half of the conjunction as well. A giant ant's
    // armour class differs from a hill orc's, so the roll is recomputed.
    game.level.monsters[orc.mx][orc.my] = null;
    const ant = fixture(PM_GIANT_ANT, dx, y, { mhp: 30, mhpmax: 30 });
    assert.equal(is_orc(ant.data), false);
    aim(ant);
    const antBase = find_mac(ant, game) + elf.m_lev;
    assert.equal(await mattackm(elf, ant, attackEnv([antBase])),
                 M_ATTK_MISS);
    assert.equal(await mattackm(elf, ant, attackEnv([antBase - 1, 1, 1, 1])),
                 M_ATTK_HIT);
});

// mhitm.c passivemm():1322-1354, the switch that runs whether or not the
// defender survived. An acid blob's only slot is
// ATTK(AT_NONE, AD_ACID, 1, 8), so its AD_ACID arm is the first thing the
// port cannot follow.
test('a defender with an acid passive stops the attack', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const blob = fixture(PM_ACID_BLOB, dx, y);
    aim(blob);
    const env = attackEnv([20]);

    await assert.rejects(
        mattackm(pet, blob, env),
        /an acid splash from the monster attacked/u,
    );
    // The damage roll for the passive attack precedes the refusal, because C
    // makes it above its own switch at :1316-1321.
    assert.deepEqual(env.bounds, ['rnd(20)', 'd(1,8)']);
});

// mhitm.c passivemm():1349-1354, the AD_ENCH arm. Its whole body is a
// drain_item() on the aggressor's wielded weapon, which mattackm() never
// supplies, so C runs the arm and changes nothing. A disenchanter's second
// slot is ATTK(AT_NONE, AD_ENCH, 0, 0), so it is the passive under test and
// its zero dice make tmp 0 with no draw.
test('a defender with a disenchanting passive is fought normally',
    async () => {
        await hero();
        const { ax, dx, y } = battlefield(1);
        // A disenchanter's armour class is -10, so an ordinary pet cannot
        // reach it on any roll; the level is raised to make the differential
        // 10 and let the blow land.
        const pet = fixture(PM_KITTEN, ax, y, { mtame: 10, m_lev: 20 });
        const foe = fixture(PM_DISENCHANTER, dx, y, { mhp: 40, mhpmax: 40 });
        assert.equal(foe.data.mattk[1].adtyp, AD_ENCH);
        assert.equal(foe.data.mattk[1].aatyp, AT_NONE);
        aim(foe);

        // rnd(20)=1 lands, d(1,6)=3 is the kitten's bite, and the knockback
        // pair declines. The passive's own dice are both zero, so passivemm()
        // spends nothing above its switch and only the rn2(3) that guards the
        // second one.
        const landed = attackEnv([1, 3, 1, 1]);
        assert.equal(await mattackm(pet, foe, landed), M_ATTK_HIT);
        assert.deepEqual(landed.lines, ['The kitten bites the disenchanter.']);
        assert.deepEqual(landed.bounds,
                         ['rnd(20)', 'd(1,6)', 'rn2(3)', 'rn2(6)', 'rn2(3)']);
        assert.equal(foe.mhp, 37);
        // AD_ENCH takes the default arm of the second switch, so tmp is
        // cleared and the aggressor loses nothing.
        assert.equal(pet.mhp, 8);

        // A missed blow reaches the same arm with mhitb clear.
        const missed = attackEnv([20]);
        assert.equal(await mattackm(pet, foe, missed), M_ATTK_MISS);
        assert.deepEqual(missed.lines,
                         ['The kitten misses the disenchanter.']);
        assert.deepEqual(missed.bounds, ['rnd(20)', 'rn2(3)']);
        assert.equal(pet.mhp, 8);
    });

// mhitm.c mattackm():447-452 and failed_grab() (594-640). C tests unsolid()
// only to skip the call for an ordinary target; failed_grab() decides, and it
// answers FALSE unless the attack is a hug or carries wrap, stick or digestion
// damage. So an ordinary bite on a fog cloud lands.
test('an ordinary blow on an unsolid defender lands', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    // A fog cloud's armour class is 0, so a second-level attacker's
    // differential is 2 and the lowest roll lands.
    const cloud = fixture(PM_FOG_CLOUD, dx, y, { mhp: 20, mhpmax: 20 });
    assert.equal(unsolid(cloud.data), true);
    aim(cloud);
    // The same five draws an ordinary landed bite spends: to-hit, damage,
    // the knockback pair, and passivemm()'s guard. A fog cloud's second slot
    // is empty with no dice, so its passive adds none.
    const env = attackEnv([1, 3, 1, 1]);

    assert.equal(await mattackm(pet, cloud, env), M_ATTK_HIT);
    assert.deepEqual(env.lines, ['The kitten bites the fog cloud.']);
    assert.deepEqual(env.bounds,
                     ['rnd(20)', 'd(1,6)', 'rn2(3)', 'rn2(6)', 'rn2(3)']);
    assert.equal(cloud.mhp, 17);
});

// mhitm.c failed_grab():602-607, the head's two conjuncts. The port stops
// inside the TRUE arm, above a line that needs do_name.c s_suffix(),
// mon_nam() and some_mon_nam().
test('a grab that cannot hold its target stops the attack', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const cloud = fixture(PM_FOG_CLOUD, dx, y, { mhp: 20, mhpmax: 20 });
    const ordinary = pet.data;
    // No pet carries a holding attack, so the record is fabricated the way
    // this file's other structural cases are.
    const holding = (adtyp) => {
        pet.data = {
            ...ordinary,
            mattk: [
                { aatyp: AT_TUCH, adtyp, damn: 1, damd: 4 },
                ...ordinary.mattk.slice(1),
            ],
        };
    };
    const attack = async (defender) => {
        aim(defender);
        // rnd(20)=1 lands against either defender's armour class, so the
        // strike is what carries the attack into failed_grab().
        return mattackm(pet, defender, attackEnv([1, 3, 1, 1]))
            .then(() => null, (error) => error.message);
    };

    // Each of C's three damage types refuses on the same unsolid defender.
    for (const adtyp of [AD_WRAP, AD_STCK, AD_DGST]) {
        holding(adtyp);
        assert.equal(await attack(cloud),
                     'a grab that passes through its target', `adtyp ${adtyp}`);
    }

    // The same attack on a solid defender passes the head and carries on to
    // its damage type, which is a different stop in a different file.
    const ant = fixture(PM_GIANT_ANT, dx, y + 1, { mhp: 20, mhpmax: 20 });
    assert.equal(unsolid(ant.data), false);
    holding(AD_STCK);
    assert.equal(await attack(ant), 'uhitm.c mhitm_ad_stck()');

    // gn.notonhead is the head's other disjunct, and mattackm() is the one
    // caller that cannot reach it: C's own unsolid() test short-circuits
    // ahead of the call for every solid defender, so a holding attack that
    // landed on a long worm's tail carries on to its damage type here. C's
    // comment at :447-450 calls that test redundant, which holds for the
    // first disjunct alone.
    aim(ant);
    game.gn.notonhead = true;
    assert.equal(
        await mattackm(pet, ant, attackEnv([1, 3, 1, 1]))
            .then(() => null, (error) => error.message),
        'uhitm.c mhitm_ad_stck()',
    );
    game.gn.notonhead = false;
    pet.data = ordinary;
});

// mhitm.c mattackm()'s six refusing arms, each at the `case` label. The
// attack records are fabricated because no species this port can place
// carries one of them beside a pet's melee slot; mondata.h reads the list off
// the species record, so replacing that record is enough.
test('mattackm stops at every attack type outside the physical group',
    async () => {
        await hero();
        const { ax, dx, y } = battlefield(1);
        const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
        const ant = fixture(PM_GIANT_ANT, dx, y);
        aim(ant);
        const rows = [
            [AT_WEAP, 'an armed monster attacking another monster'],
            [AT_HUGS, 'a monster crushing another monster'],
            [AT_GAZE, 'a monster gazing at another monster'],
            [AT_EXPL, 'a monster exploding at another monster'],
            [AT_ENGL, 'a monster engulfing another monster'],
            [AT_BREA,
                'a monster breathing or spitting at another monster'],
            [AT_SPIT,
                'a monster breathing or spitting at another monster'],
        ];
        const ordinary = pet.data;
        for (const [aatyp, reason] of rows) {
            pet.data = {
                ...ordinary,
                mattk: [
                    { aatyp, adtyp: AD_PHYS, damn: 1, damd: 4 },
                    ...ordinary.mattk.slice(1),
                ],
            };
            await assert.rejects(
                mattackm(pet, ant, attackEnv()),
                (error) => {
                    assert.equal(error.message, reason, `aatyp ${aatyp}`);
                    return true;
                },
            );
        }
        pet.data = ordinary;
        assert.equal(ordinary.mattk.length, NATTK);
    });

// mhitm.c mattackm():337-359. A defender that was hiding is noticed as it is
// attacked, through display.c newsym() and one of four lines that need
// sensemon(). The stop sits above the whole block.
test('a hidden defender stops the attack before it starts', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_LITTLE_DOG, ax, y, { mtame: 10, mlstmv: 0 });
    const ant = fixture(PM_GIANT_ANT, dx, y, { mundetected: 1 });
    aim(ant);
    const env = attackEnv();

    await assert.rejects(
        mattackm(pet, ant, env),
        /a hidden monster noticed as it is attacked/u,
    );
    assert.deepEqual(env.bounds, []);
    // The stop precedes the visibility and move-tracking writes.
    assert.equal(pet.mlstmv, 0);
});

// mhitm.c missmm():90-91 and noises():26-38. When neither combatant can be
// seen, C swaps the named line for the one pline.c You_hear() composes.
// gf.far_noise and gn.noisetime rate-limit it: the line repeats only when the
// distance band changes or more than ten moves have passed.
test('an unseen fight is heard rather than named', async () => {
    await hero();
    // hack.h mdistu() is a squared distance from the hero, and noises()
    // divides the bands at 15. These two pairs sit either side of it.
    const near = { x: game.u.ux - 2, y: game.u.uy + 2 };
    const far = { x: 5, y: 15 };
    const brawl = ({ x, y }) => {
        for (const square of [[x, y], [x + 1, y]]) {
            game.viz_array[square[1]][square[0]] = 0;
        }
        const magr = fixture(PM_SEWER_RAT, x, y);
        const mdef = fixture(PM_GIANT_ANT, x + 1, y);
        aim(mdef);
        return { magr, mdef };
    };
    const close = brawl(near);
    const distant = brawl(far);
    // A fight this file's other tests never reach, so the rate limit still
    // holds decl.c's own starting values: :341 gf.far_noise FALSE and :555
    // gn.noisetime 0.
    assert.equal(game.gf?.far_noise, undefined);
    assert.equal(game.gn?.noisetime, undefined);
    // The ten-move rule cannot have expired yet at this point in the game,
    // which is what leaves gf.far_noise's starting value deciding the row
    // below on its own.
    assert.ok(game.moves <= 10, `moves ${game.moves}`);
    // The default the rc leaves behind, which pline.c You_hear() reads.
    assert.equal(game.flags.acoustics, true);

    // The near band equals gf.far_noise's FALSE and ten moves have not
    // passed, so the first unseen fight of a game says nothing.
    const silent = attackEnv([20]);
    assert.equal(await mattackm(close.magr, close.mdef, silent), M_ATTK_MISS);
    assert.equal(game.gv.vis, false);
    assert.deepEqual(silent.lines, []);
    // C's `if` holds both writes, so a quiet fight leaves the pair alone.
    assert.equal(game.gf.far_noise, false);
    assert.equal(game.gn.noisetime, 0);

    // A fight in the other band is announced immediately, because
    // gf.far_noise no longer matches.
    const remote = attackEnv([20]);
    assert.equal(await mattackm(distant.magr, distant.mdef, remote),
                 M_ATTK_MISS);
    assert.deepEqual(remote.lines,
                     ['You hear some noises in the distance.']);
    assert.equal(game.gf.far_noise, true);
    assert.equal(game.gn.noisetime, game.moves);

    // Back to the near band on the same move: the band has changed again, so
    // the line returns without its distance tail.
    const heard = attackEnv([20]);
    assert.equal(await mattackm(close.magr, close.mdef, heard), M_ATTK_MISS);
    assert.deepEqual(heard.lines, ['You hear some noises.']);
    assert.equal(game.gf.far_noise, false);

    // A second miss on the same move and in the same band says nothing.
    const again = attackEnv([20]);
    assert.equal(await mattackm(close.magr, close.mdef, again), M_ATTK_MISS);
    assert.deepEqual(again.lines, []);

    // Ten moves is not more than ten, so the same band still says nothing;
    // eleven speaks again.
    game.gn.noisetime = game.moves - 10;
    const early = attackEnv([20]);
    assert.equal(await mattackm(close.magr, close.mdef, early), M_ATTK_MISS);
    assert.deepEqual(early.lines, []);
    game.gn.noisetime = game.moves - 11;
    const late = attackEnv([20]);
    assert.equal(await mattackm(close.magr, close.mdef, late), M_ATTK_MISS);
    assert.deepEqual(late.lines, ['You hear some noises.']);

    // Each row below re-opens the rate limit, so anything it silences is
    // silenced by the row's own condition rather than by the ten-move rule.
    const overdue = async (label) => {
        game.gn.noisetime = game.moves - 20;
        const env = attackEnv([20]);
        assert.equal(await mattackm(close.magr, close.mdef, env),
                     M_ATTK_MISS, label);
        return env.lines;
    };

    // youprop.h:125 Deaf is `HDeaf || EDeaf || u.uroleplay.deaf`: three
    // disjuncts, each of which silences noises() on its own, and no blocking
    // term, so a blocked property still reads as deaf. C writes gf.far_noise
    // and gn.noisetime inside the same `if`, so a deaf hero leaves the rate
    // limit where it was.
    const deafRows = [
        ['extrinsic', { intrinsic: 0, extrinsic: 1, blocked: 0 }],
        ['intrinsic', { intrinsic: 1, extrinsic: 0, blocked: 0 }],
        // A blocking mask exists for other properties and would clear this
        // one if noises() read a Deaf with a blocked term.
        ['blocked', { intrinsic: 1, extrinsic: 0, blocked: 1 }],
    ];
    for (const [label, property] of deafRows) {
        game.u.uprops[DEAF] = property;
        assert.deepEqual(await overdue(label), [], label);
        assert.equal(game.gn.noisetime, game.moves - 20, label);
        game.u.uprops[DEAF] = undefined;
    }
    // The deaf conduct, which `OPTIONS=roleplay:deaf` sets and nothing clears.
    game.u.uroleplay = { ...game.u.uroleplay, deaf: true };
    assert.deepEqual(await overdue('roleplay'), []);
    assert.equal(game.gn.noisetime, game.moves - 20);
    game.u.uroleplay.deaf = false;

    // pline.c You_hear() returns on !flags.acoustics, which noises() does not
    // test. So the line is dropped but the rate limit is spent, and the next
    // fight in this band is silent for the ordinary reason.
    game.flags.acoustics = false;
    assert.deepEqual(await overdue('acoustics'), []);
    assert.equal(game.gn.noisetime, game.moves);
    game.flags.acoustics = true;

    // youprop.h:399 Unaware, which You_hear() turns into a dream. trap.c
    // unconscious() is one of its two halves and u.usleep is one of that
    // half's disjuncts.
    game.multi = -1;
    game.u.usleep = 1;
    assert.deepEqual(await overdue('unaware'),
                     ['You dream that you hear some noises.']);
    game.multi = 0;
    game.u.usleep = 0;

    // youprop.h:279 Underwater, You_hear()'s other prefix.
    game.u.uinwater = true;
    assert.deepEqual(await overdue('underwater'),
                     ['You barely hear some noises.']);
    game.u.uinwater = false;
});

// mhitm.c hitmm():684-687, the AT_TENT arm. Its subject is the attacker's
// possessive rather than its name, so the capitalization comes from
// do_name.c s_suffix() applied to Monnam().
test('a tentacle attack names its owner in the possessive', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const ant = fixture(PM_GIANT_ANT, dx, y);
    aim(ant);
    // No pet carries AT_TENT, so the slot is fabricated the way the refusal
    // rows above are.
    const ordinary = pet.data;
    pet.data = {
        ...ordinary,
        mattk: [
            { aatyp: AT_TENT, adtyp: AD_PHYS, damn: 1, damd: 4 },
            ...ordinary.mattk.slice(1),
        ],
    };
    const env = attackEnv([1, 2, 1, 1]);

    assert.equal(await mattackm(pet, ant, env), M_ATTK_HIT);
    assert.deepEqual(env.lines,
                     ["The kitten's tentacles suck the giant ant."]);
    pet.data = ordinary;
});

// mhitm.c mattackm():306-307, `if (!magr || !mdef) return M_ATTK_MISS`. C's
// own comment credits mike@genat for the guard.
test('mattackm answers a miss for a combatant that is not there', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10, mlstmv: 0 });
    const ant = fixture(PM_GIANT_ANT, dx, y);
    aim(ant);

    assert.equal(await mattackm(null, ant, attackEnv()), M_ATTK_MISS);
    assert.equal(await mattackm(pet, null, attackEnv()), M_ATTK_MISS);
    assert.equal(pet.mlstmv, 0);
});

// mhitm.c pre_mm_attack():44-59. `showit` starts FALSE and only a mimic or a
// hidden monster raises it, and both of those refuse, so no ported blow
// repaints either combatant.
test('an ordinary blow repaints neither combatant', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const ant = fixture(PM_GIANT_ANT, dx, y);
    aim(ant);
    const missed = attackEnv([20]);
    assert.equal(await mattackm(pet, ant, missed), M_ATTK_MISS);
    assert.deepEqual(missed.redraws, []);

    const landed = attackEnv([1]);
    assert.equal(await mattackm(pet, ant, landed), M_ATTK_HIT);
    assert.deepEqual(landed.redraws, []);
});

// mhitm.c mattackm():362-364. gv.vis is a disjunction of two conjunctions:
// each combatant contributes only when the hero can both see its square and
// spot the monster on it.
//
// Every configuration in which the two conjunctions disagree is one
// pre_mm_attack() refuses, because a combatant the hero cannot spot needs
// display.c map_invisible(). The rows below therefore read the answer off that
// refusal and off the line missmm() prints instead of it.
test('gv.vis needs one combatant both in sight and spotted', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const ant = fixture(PM_GIANT_ANT, dx, y);
    aim(ant);
    const lit = { attacker: game.viz_array[y][ax], defender: game.viz_array[y][dx] };

    // The attacker alone contributes, which is enough: the disjunction is
    // true and the unspottable defender then stops the attack.
    game.viz_array[y][dx] = 0;
    await assert.rejects(
        mattackm(pet, ant, attackEnv([20])),
        /an unseen defender marked on the map/u,
    );

    // An invisible attacker on a lit square passes cansee() and fails
    // canspotmon(), so its conjunction is false and, with the defender's
    // square still dark, the fight is only heard.
    pet.minvis = true;
    assert.equal(await mattackm(pet, ant, attackEnv([20])), M_ATTK_MISS);
    assert.equal(game.gv.vis, false);

    // The mirror: the attacker's square dark and the defender invisible on a
    // lit one. The second conjunction decides it, and it is false too.
    pet.minvis = false;
    game.viz_array[y][ax] = 0;
    game.viz_array[y][dx] = lit.defender;
    ant.minvis = true;
    assert.equal(await mattackm(pet, ant, attackEnv([20])), M_ATTK_MISS);
    assert.equal(game.gv.vis, false);

    ant.minvis = false;
    game.viz_array[y][ax] = lit.attacker;
});

// mhitm.c mattackm():378-380, the DEADMONSTER() halves of the per-slot guard.
// One hit point is alive, so a pony's second slot still swings.
test('a combatant on its last hit point still reaches the later slots',
    async () => {
        await hero();
        const { ax, dx, y } = battlefield(1);
        const pony = fixture(PM_PONY, ax, y, { mtame: 10, mhp: 1, mhpmax: 8 });
        const ant = fixture(PM_GIANT_ANT, dx, y, { mhp: 1, mhpmax: 8 });
        aim(ant);
        // Both slots miss, so nothing dies and the loop runs to the end.
        const env = attackEnv([20, 1, 21]);

        assert.equal(await mattackm(pony, ant, env), M_ATTK_MISS);
        assert.deepEqual(env.bounds,
                         ['rnd(20)', 'rn2(3)', 'rnd(21)', 'rn2(3)']);
    });

// mhitm.c mdamagem():1071. A defender left on exactly one hit point survives.
test('damage that leaves one hit point does not kill', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const ant = fixture(PM_GIANT_ANT, dx, y, { mhp: 4, mhpmax: 4 });
    aim(ant);
    // rnd(20)=1 hits, d(1,6)=3 leaves one hit point, and the knockback pair
    // declines.
    const env = attackEnv([1, 3, 1, 1]);

    assert.equal(await mattackm(pet, ant, env), M_ATTK_HIT);
    assert.equal(ant.mhp, 1);
    assert.deepEqual(env.lines, ['The kitten bites the giant ant.']);
    // A live defender still spends passivemm()'s rn2(3); the kill path
    // skips it.
    assert.deepEqual(env.bounds,
                     ['rnd(20)', 'd(1,6)', 'rn2(3)', 'rn2(6)', 'rn2(3)']);
});

// mhitm.c mdamagem():1031-1032. The petrification pre-check runs above
// mhitm_adtyping(), so an attack on a cockatrice stops before its damage type
// is dispatched.
test('an attack on a petrifying defender stops above the damage type',
    async () => {
        await hero();
        const { ax, dx, y } = battlefield(1);
        const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
        const cockatrice = fixture(PM_COCKATRICE, dx, y);
        aim(cockatrice);
        assert.equal(touch_petrifies(cockatrice.data), true);
        const env = attackEnv([1]);

        await assert.rejects(
            mattackm(pet, cockatrice, env),
            /an attack on a petrifying monster/u,
        );
        // The damage roll at :1025 precedes the check, so it is spent.
        assert.deepEqual(env.bounds, ['rnd(20)', 'd(1,6)']);

        // C's second disjunct needs both AD_DGST and Medusa. A digesting bite
        // against an ordinary defender therefore passes the check and stops
        // one call later, inside mhitm_adtyping().
        const ant = fixture(PM_GIANT_ANT, dx, y + 1);
        game.level.monsters[cockatrice.mx][cockatrice.my] = null;
        game.level.monsters[ant.mx][ant.my] = null;
        ant.mx = dx;
        ant.my = y;
        place_monster(ant, ant.mx, ant.my, game);
        aim(ant);
        const ordinary = pet.data;
        pet.data = {
            ...ordinary,
            mattk: [
                { aatyp: AT_BITE, adtyp: AD_DGST, damn: 1, damd: 6 },
                ...ordinary.mattk.slice(1),
            ],
        };
        await assert.rejects(
            mattackm(pet, ant, attackEnv([1])),
            /mhitm_ad_dgst/u,
        );
        pet.data = ordinary;
    });

// mhitm.c mdamagem():1083-1087, gz.zombify, and the reset at :1090. C's
// expression asks for a bare-handed zombie maker landing a touch, claw or bite
// on a species that has a zombie form. js/corpstat.js mkcorpstat() is the
// reader, and it runs inside monkilled(), so the value is observed from the
// kill message the same call prints.
test('gz.zombify records a zombie maker and is cleared again', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    // A kobold has a zombie form, so only the attacker decides the answer.
    const kitten = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const kobold = fixture(PM_KOBOLD, dx, y, { mhp: 1, mhpmax: 1 });
    assert.notEqual(zombie_form(kobold.data), NON_PM);
    aim(kobold);
    const seen = [];
    const watch = (env) => {
        const inner = env.message;
        env.message = async (text) => {
            seen.push([text, game.gz?.zombify ?? null,
                game.gm?.mkcorpstat_norevive ?? null]);
            await inner(text);
        };
        return env;
    };

    // A kitten is not a zombie maker, so the flag stays false through the
    // kill message. rn2(3) declines the corpse, keeping the square clear.
    const plain = watch(attackEnv([1, 3, 1, 1, 1, 1]));
    await mattackm(kitten, kobold, plain);
    // The hit line precedes the write, so only the kill line reads the flag.
    assert.deepEqual(
        seen.filter(([text]) => text.includes('killed')).map(([, f]) => f),
        [false],
    );
    assert.equal(game.gz.zombify, false);
    assert.equal(game.gm.mkcorpstat_norevive, false);

    // A kobold zombie is one, and its AT_CLAW is in C's list. Its own kill
    // therefore raises the flag while monkilled() prints, and clears it after.
    seen.length = 0;
    const second = battlefield(1);
    // A level-zero killer's hit-point threshold is 4, so a maximum of 3
    // leaves room for grow_up()'s single point without a level gain.
    const zombie = fixture(PM_KOBOLD_ZOMBIE, second.ax, second.y,
                           { mhp: 3, mhpmax: 3 });
    const victim = fixture(PM_KOBOLD, second.dx, second.y,
                           { mhp: 1, mhpmax: 1 });
    aim(victim);
    assert.equal(zombie.data.mattk[0].aatyp, AT_CLAW);
    // C writes gm.mkcorpstat_norevive for AT_WEAP and AT_CLAW alone, and
    // troll_baned() is FALSE for every attacker without Trollsbane, so this
    // claw clears a flag left raised rather than setting one.
    game.gm.mkcorpstat_norevive = true;
    const raised = watch(attackEnv([1, 3, 1, 1, 1, 1]));
    await mattackm(zombie, victim, raised);
    assert.deepEqual(
        seen.filter(([text]) => text.includes('killed'))
            .map(([, , norevive]) => norevive),
        [false],
    );
    assert.deepEqual(
        seen.filter(([text]) => text.includes('killed')).map(([, f]) => f),
        [true],
    );
    assert.equal(game.gz.zombify, false);
    // C writes gm.mkcorpstat_norevive for AT_WEAP and AT_CLAW alone, and
    // troll_baned() is FALSE for every attacker without Trollsbane.
    assert.equal(game.gm.mkcorpstat_norevive, false);
});

// mhitm.c passivemm():1315-1316. A species whose attack list has no empty slot
// leaves the search at NATTK and returns without a damage roll.
test('a defender with a full attack list has no passive response', async () => {
    await hero();
    const { ax, dx, y } = battlefield(1);
    const pet = fixture(PM_KITTEN, ax, y, { mtame: 10 });
    const ant = fixture(PM_GIANT_ANT, dx, y);
    // Six live slots, so the loop reaches `i >= NATTK`. No species carries
    // six, which is why the list is fabricated.
    ant.data = {
        ...ant.data,
        mattk: Array.from({ length: NATTK }, () => (
            { aatyp: AT_BITE, adtyp: AD_PHYS, damn: 1, damd: 2 }
        )),
    };
    aim(ant);
    const env = attackEnv([20]);

    assert.equal(await mattackm(pet, ant, env), M_ATTK_MISS);
    // The to-hit roll alone: passivemm() returns before its own d().
    assert.deepEqual(env.bounds, ['rnd(20)']);
});
