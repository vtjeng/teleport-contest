import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COULD_SEE,
    FORCETRAP,
    IN_SIGHT,
    PIT,
    Trap_Caught_Mon,
    Trap_Effect_Finished,
    Trap_Killed_Mon,
} from '../js/const.js';
import { has_ceiling } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { copy_mextra } from '../js/mon.js';
import { grounded } from '../js/mondata.js';
import { accessible } from '../js/monmove.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import {
    NON_PM,
    PM_BAT,
    PM_COCKATRICE,
    PM_FLOATING_EYE,
    PM_JACKAL,
    PM_LICHEN,
    PM_PIT_VIPER,
    PM_ROCK_PIERCER,
    PM_XORN,
} from '../js/monsters.js';
import { mksobj } from '../js/obj.js';
import { CORPSE } from '../js/objects.js';
import { canSeeMonster } from '../js/startup_a11y.js';
import { mintrap, trapeffect_selector } from '../js/trap_effects.js';
import { loadMonsterPitRecipe } from './run-monster-pit.mjs';

// The same Valkyrie scripts/trap-thitm.test.mjs and scripts/mon-kill.test.mjs
// use, so all three read the same hero, the same lit starting room and the
// same free neighbours.
const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7710044, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.level.traps = [];
    return game;
}

// A monster beside the hero, shaped the way makemon() leaves one and linked
// onto the level chain so that m_detach() can find it, with a pit dug under
// it. Every case here reaches trapeffect_pit() through mintrap(), which is
// monmove.c postmov()'s own call.
let nextFixtureId = 400;
function victimInPit(pmidx, mhp, { madeby_u = false, ...overrides } = {}) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        if (!accessible(x, y, game) || m_at(x, y, game)) continue;
        const species = game.mons[pmidx];
        const mon = newMonster({
            cham: NON_PM,
            m_lev: Math.max(1, species.mlevel),
            m_id: ++nextFixtureId,
            // place_monster() rejects a dead monster, so the fixture is born
            // alive and takes its real hit points below.
            mhp: 1,
            mhpmax: 20,
            mcanmove: 1,
            mcansee: true,
            data: species,
            mnum: pmidx,
            mx: x,
            my: y,
            ...overrides,
        });
        place_monster(mon, x, y, game);
        mon.nmon = game.level.monlist;
        game.level.monlist = mon;
        mon.mhp = mhp;
        const trap = {
            tx: x, ty: y, ttyp: PIT, tseen: false, madeby_u, once: false,
        };
        game.level.traps.push(trap);
        return { mon, trap, x, y };
    }
    throw new Error('no free square beside the hero');
}

// Records the bound of every draw and answers from a scripted list, so a test
// can put a chosen roll where the pit reads one. The whole family is answered
// because a corpse reaches mkobj.c mksobj() and its timer.
function pitEnv(rolls = [], fallback = 1) {
    const bounds = [];
    const lines = [];
    const redraws = [];
    const queue = [...rolls];
    const take = (label) => {
        bounds.push(label);
        return queue.length ? queue.shift() : fallback;
    };
    return {
        bounds,
        lines,
        redraws,
        state: game,
        random: {
            d: (n, x) => take(`d(${n},${x})`),
            rn1: (x, from) => take(`rn1(${x},${from})`) + from,
            rn2: (b) => take(`rn2(${b})`),
            rnd: (b) => take(`rnd(${b})`),
            rne: (b) => take(`rne(${b})`),
            rnl: (b) => take(`rnl(${b})`),
            rnz: (b) => take(`rnz(${b})`),
        },
        message: async (text) => { lines.push(text); },
        redraw: (x, y) => { redraws.push(`${x},${y}`); },
        unsupported: (reason) => { throw new Error(reason); },
        mInAir: () => false,
        heroDeaf: () => false,
        youHear: () => null,
    };
}

function refusesAsync(fn, reason, label) {
    return assert.rejects(fn, (error) => {
        assert.equal(error.message, reason, label);
        return true;
    }, label);
}

// mondata.h:23-24 grounded() and dungeon.c has_ceiling() (1689-1698). Neither
// is reachable from a recorded screen on its own: grounded() decides only
// whether trapeffect_pit() takes its airborne branch, and has_ceiling() only
// changes grounded()'s answer for a clinger.
test('grounded excludes flyers, floaters and clingers under a ceiling',
    async () => {
        await hero();
        assert.equal(has_ceiling(game.u.uz), true, 'dungeon level 1');
        // dungeon.c:1694. The endgame planes are the only levels without one,
        // and the earth plane is the exception inside that exception.
        assert.equal(has_ceiling(game.astral_level), false, 'the astral plane');
        assert.equal(has_ceiling(game.earth_level), true, 'the earth plane');

        // A jackal walks, so all three terms pass.
        assert.equal(grounded(game.mons[PM_JACKAL], game), true);
        // A rock piercer is M1_CLING, and the ceiling it holds is what takes
        // grounded() away; without one it would be grounded like the jackal.
        assert.equal(grounded(game.mons[PM_ROCK_PIERCER], game), false);
        // The two remaining terms, from the species records the generated-data
        // check pins against monst.c: a bat is M1_FLY and a floating eye is
        // S_EYE, which is what is_floater() reads.
        assert.equal(grounded(game.mons[PM_BAT], game), false, 'M1_FLY');
        assert.equal(grounded(game.mons[PM_FLOATING_EYE], game), false,
                     'S_EYE');
    });

// trap.c trapeffect_pit():1989-2007, the ordinary case: the pit catches its
// victim, tells the hero so, exposes itself on the map and spends rnd(6) on
// the victim's hit points. mintrap():3830 then stops, because a monster the
// pit leaves alive needs mon.c maybe_unhide_at().
test('a pit in sight catches its victim and reports the fall', async () => {
    await hero();
    const { mon, trap, x, y } = victimInPit(PM_JACKAL, 9);
    assert.equal(canSeeMonster(mon, game), true, 'the hero watches');

    // rnd(6) of 4 leaves the jackal standing with 5 hit points.
    const env = pitEnv([4]);
    await refusesAsync(
        () => mintrap(mon, 0, env), 'a monster trapped under an object',
    );
    assert.deepEqual(env.lines, ['The jackal falls into a pit!']);
    assert.deepEqual(env.bounds, ['rnd(6)'], 'only the damage roll');
    assert.equal(mon.mhp, 5, 'rnd(6) of 4 off nine hit points');
    assert.equal(mon.mtrapped, true, 'trap.c:1990');
    assert.equal(trap.tseen, true, "seetrap()'s write");
    assert.deepEqual(env.redraws, [`${x},${y}`], "and seetrap()'s draw");

    // trap.c:2006-2007. mintrap()'s tail stops before it can return, so the
    // arm's own answer for a victim it caught is asked of it directly.
    const caught = victimInPit(PM_JACKAL, 9);
    assert.equal(
        await trapeffect_selector(caught.mon, caught.trap, 0, pitEnv([4])),
        Trap_Caught_Mon,
    );
});

// trap.c trapeffect_pit():2002-2004 into mon.c monkilled(). This is the case
// seed0015 records: `The little dog falls into a pit!  The little dog is
// killed!`, both lines from one mintrap() call.
test('a pit that empties its victim reports a kill to the caller',
    async () => {
        await hero();
        const { mon, x, y } = victimInPit(PM_JACKAL, 6);

        // rnd(6) of 6 empties the jackal, and its corpse divisor is 2: an
        // rn2(2) of 1 declines the corpse.
        const env = pitEnv([6, 1]);
        assert.equal(await mintrap(mon, 0, env), Trap_Killed_Mon);
        assert.deepEqual(env.lines, [
            'The jackal falls into a pit!',
            'The jackal is killed!',
        ]);
        assert.deepEqual(env.bounds, ['rnd(6)', 'rn2(2)']);
        assert.equal(mon.mhp, 0);
        assert.equal(m_at(x, y, game), null, 'off the map');

        // trap.c:2002's DEADMONSTER() test is `mhp < 1`, so a victim standing
        // on its last hit point is still alive when the pit reaches it: the
        // damage roll happens and the kill is thitm()'s, not the guard's.
        const alive = victimInPit(PM_JACKAL, 1);
        const aliveEnv = pitEnv([1, 1]);
        assert.equal(await mintrap(alive.mon, 0, aliveEnv), Trap_Killed_Mon);
        assert.deepEqual(aliveEnv.bounds, ['rnd(6)', 'rn2(2)']);
        assert.deepEqual(aliveEnv.lines, [
            'The jackal falls into a pit!',
            'The jackal is killed!',
        ]);
    });

// trap.c trapeffect_pit():1991-1999. `in_sight` gates the fall message, the
// pit-viper aside and seetrap() together, so a victim the hero cannot watch
// leaves the trap unmapped and says nothing at all.
test('a pit out of sight is silent and stays off the map', async () => {
    await hero();
    const { mon, trap, x, y } = victimInPit(PM_JACKAL, 9);
    game.viz_array[y][x] &= ~(COULD_SEE | IN_SIGHT);
    assert.equal(canSeeMonster(mon, game), false, 'the hero cannot watch');

    const env = pitEnv([4]);
    await refusesAsync(
        () => mintrap(mon, 0, env), 'a monster trapped under an object',
    );
    assert.deepEqual(env.lines, [], 'no line');
    assert.deepEqual(env.redraws, [], 'no draw');
    assert.equal(trap.tseen, false, 'the pit stays unmapped');
    assert.equal(mon.mtrapped, true, 'but the pit still holds it');
    assert.equal(mon.mhp, 5, 'and still hurts');
});

// trap.c trapeffect_pit():1994. a_your[] is indexed by trap->madeby_u, and the
// lowercase table is the one this message takes. mintrap():3819's rnl(5) gate
// sits in front of it, so the aggravation draw is asserted here too.
test('a hero-made pit is named as the hero own', async () => {
    await hero();
    const { mon } = victimInPit(PM_JACKAL, 9, { madeby_u: true });

    // rnl(5) of 0 declines setmangry(), which is not ported.
    const env = pitEnv([0, 4]);
    await refusesAsync(
        () => mintrap(mon, 0, env), 'a monster trapped under an object',
    );
    assert.deepEqual(env.lines, ['The jackal falls into your pit!']);
    assert.deepEqual(env.bounds, ['rnl(5)', 'rnd(6)']);
});

// trap.c trapeffect_pit():1975-1986. A clinger is not grounded(), and without
// FORCETRAP or Sokoban it walks over the pit: no message, no draw, no damage
// and no trapped bit. mintrap()'s check_in_air() gate lets it through first,
// because a clinger is neither is_flyer() nor is_floater().
test('a clinger avoids an ordinary pit entirely', async () => {
    await hero();
    const { mon, trap } = victimInPit(PM_ROCK_PIERCER, 9);

    const env = pitEnv();
    assert.equal(await mintrap(mon, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.lines, []);
    assert.deepEqual(env.redraws, []);
    assert.deepEqual(env.bounds, [], 'not even the damage roll');
    assert.equal(mon.mhp, 9);
    assert.equal(mon.mtrapped, false);
    assert.equal(trap.tseen, false);
});

// trap.c trapeffect_pit():1976-1983, the openfallingtrap arm. FORCETRAP maps
// the pit and says so, and still returns before the trapped bit.
test('a forced pit tells the hero the clinger did not fall', async () => {
    await hero();
    const { mon, trap, x, y } = victimInPit(PM_ROCK_PIERCER, 9);

    const env = pitEnv();
    assert.equal(
        await mintrap(mon, FORCETRAP, env), Trap_Effect_Finished,
    );
    assert.deepEqual(env.lines, ["The rock piercer doesn't fall into the pit."]);
    assert.equal(trap.tseen, true);
    assert.deepEqual(env.redraws, [`${x},${y}`]);
    assert.equal(mon.mtrapped, false, 'and it is still free');
    assert.equal(mon.mhp, 9);
});

// trap.c trapeffect_pit():1985-1987. Sokoban makes a pit inescapable, so the
// clinger that walked over it above is dragged in instead, with the verb the
// message takes from `fallverb`.
test('a Sokoban pit drags a clinger in', async () => {
    await hero();
    const { mon } = victimInPit(PM_ROCK_PIERCER, 9);
    game.level.flags.sokoban_rules = true;
    try {
        const env = pitEnv([4]);
        await refusesAsync(
            () => mintrap(mon, 0, env), 'a monster trapped under an object',
        );
        assert.deepEqual(env.lines, ['The rock piercer is dragged into a pit!']);
        assert.equal(mon.mtrapped, true);
        assert.equal(mon.mhp, 5);
    } finally {
        game.level.flags.sokoban_rules = false;
    }
});

// trap.c trapeffect_pit():1989-1990. A wall-walker falls in and is hurt, but
// nothing holds it, so mintrap()'s tail is not reached and the effect reports
// that it finished rather than that it caught anything.
test('a wall-walker falls into a pit without being held', async () => {
    await hero();
    const { mon } = victimInPit(PM_XORN, 9);

    const env = pitEnv([4]);
    assert.equal(await mintrap(mon, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.lines, ['The xorn falls into a pit!']);
    assert.equal(mon.mhp, 5, 'the damage still lands');
    assert.equal(mon.mtrapped, false, 'trap.c:1989 skipped the write');
});

// trap.c trapeffect_pit():1995-1997. The aside follows the fall message for
// the two species whose names are the joke, and for no other.
test('a pit viper draws the pit joke', async () => {
    await hero();
    const { mon } = victimInPit(PM_PIT_VIPER, 9);

    const env = pitEnv([4]);
    await refusesAsync(
        () => mintrap(mon, 0, env), 'a monster trapped under an object',
    );
    assert.deepEqual(env.lines, [
        'The pit viper falls into a pit!',
        "How pitiful.  Isn't that the pits?",
    ]);

    // A lichen shares every other branch of the arm and takes no aside.
    const plain = victimInPit(PM_LICHEN, 9);
    const plainEnv = pitEnv([4]);
    await refusesAsync(
        () => mintrap(plain.mon, 0, plainEnv),
        'a monster trapped under an object',
    );
    assert.deepEqual(plainEnv.lines, ['The lichen falls into a pit!']);
});

// trap.c mselftouch() (3912-3933), called from trapeffect_pit():2000. Its body
// is refused, and the guard has to be the C one: a wielded object that is not
// a corpse, and a corpse that does not petrify, both fall through.
test('a wielded cockatrice corpse stops the fall', async () => {
    await hero();
    const { mon } = victimInPit(PM_JACKAL, 9);
    mon.mw = mksobj(CORPSE, false, false, { state: game });
    mon.mw.corpsenm = PM_COCKATRICE;

    await refusesAsync(
        () => mintrap(mon, 0, pitEnv([4])),
        'a monster touching its wielded corpse',
    );

    // The same corpse of a species that does not petrify runs the arm out.
    const safe = victimInPit(PM_JACKAL, 9);
    safe.mon.mw = mksobj(CORPSE, false, false, { state: game });
    safe.mon.mw.corpsenm = PM_LICHEN;
    await refusesAsync(
        () => mintrap(safe.mon, 0, pitEnv([4])),
        'a monster trapped under an object',
    );
});

// trap.c trapeffect_pit():1975. The worm term is worm.c count_wsegs(), which
// is not ported; C reads it only for a grounded monster, so the clinger above
// keeps walking over the pit whatever its wormno says.
test('a long worm stops where C would count its segments', async () => {
    await hero();
    const { mon } = victimInPit(PM_JACKAL, 9, { wormno: 3 });
    await refusesAsync(
        () => mintrap(mon, 0, pitEnv([4])), 'a long worm falling into a pit',
    );

    const clinger = victimInPit(PM_ROCK_PIERCER, 9, { wormno: 3 });
    assert.equal(
        await mintrap(clinger.mon, 0, pitEnv()), Trap_Effect_Finished,
    );
});

// trap.c trapeffect_pit():1835. dotrap() cannot reach a pit -- js/hack.js
// refuses the hero's move onto one before it happens -- so this arm is only
// reachable through trapeffect_selector() itself, and it must stop before the
// hero arm sets u.utrap or spends rn1(6, 2).
test('the hero arm of the pit refuses', async () => {
    await hero();
    const trap = { tx: game.u.ux, ty: game.u.uy, ttyp: PIT, tseen: false };
    const env = pitEnv();
    await refusesAsync(
        () => trapeffect_selector(game.youmonst, trap, 0, env),
        'a hero falling into a pit',
    );
    assert.equal(game.u.utrap, 0, 'no hero trap timer');
    assert.deepEqual(env.bounds, []);
    assert.deepEqual(env.lines, []);
});

// mon.c copy_mextra() (2596-2646). Its live caller is save_mtraits(), which
// runs for the pet the pit kills; scripts/mon-kill.test.mjs pins that route
// end to end and this pins the record-by-record copy underneath it.
test('copy_mextra copies each record it finds and shares none', () => {
    const source = {
        mextra: {
            mgivenname: 'Hachi',
            edog: { apport: 7, ogoal: { x: 3, y: 4 } },
            eshk: { billct: 2, bill: [{ bo_id: 1 }] },
            mcorpsenm: PM_JACKAL,
        },
    };
    const target = {};
    copy_mextra(target, source);

    assert.equal(target.mextra.mgivenname, 'Hachi');
    assert.deepEqual(target.mextra.edog, source.mextra.edog);
    assert.notEqual(target.mextra.edog, source.mextra.edog);
    assert.notEqual(target.mextra.edog.ogoal, source.mextra.edog.ogoal);
    assert.notEqual(target.mextra.eshk.bill, source.mextra.eshk.bill);
    assert.equal(target.mextra.mcorpsenm, PM_JACKAL);
    // The records the source does not carry are not invented.
    assert.equal('egd' in target.mextra, false);
    assert.equal('epri' in target.mextra, false);

    // mextra.h:234 has_mcorpsenm() also requires a real species, and a source
    // without mextra at all copies nothing rather than allocating one.
    const cleared = { mextra: { mcorpsenm: NON_PM } };
    const clearedTarget = {};
    copy_mextra(clearedTarget, cleared);
    assert.equal('mcorpsenm' in clearedTarget.mextra, false);

    const bare = {};
    copy_mextra(bare, {});
    assert.equal(bare.mextra, undefined);

    // mon.c:2599's first two disjuncts. C tolerates a null on either side, and
    // the port has to as well: without the target test it would allocate an
    // mextra on nothing.
    copy_mextra(null, source);
    copy_mextra(target, null);
});

// Every segment of the checked-in matrix spends its whole turn budget on the
// search command, so the hero never moves and every recorded difference
// belongs to a monster.
const SEGMENT_KEYS = new Set(['s']);

// The key each segment's fall lands on, measured by replaying it against the
// commit before this arm existed: the port emits one screen per consumed key
// plus the opening prompt, so a segment that stopped on the fall emitted
// exactly this many screens. A segment shorter than its own number would
// never reach the pit.
const FALL_KEY = Object.freeze({
    6228974: 3,
    6209768: 25,
    6217129: 25,
    6225078: 40,
    6229214: 52,
    6402469: 5,
    6402174: 25,
    6404579: 34,
    6401331: 5,
    6316388: 7,
    6305341: 18,
    6312649: 28,
    6301625: 74,
});

test('monster-pit matrix contains only source-selected inputs', () => {
    const recipe = loadMonsterPitRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 13);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment spends its turns on the search command',
        );
    }
    // Nine segments keep the hero alone, so the victim is always a wild
    // monster; the other four put a pet in the same scan, which reaches
    // postmov() through dog_move() instead of m_move().
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('OPTIONS=pettype:none\n'),
        ).length,
        9,
    );
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('OPTIONS=pettype:dog\n'),
        ).length,
        4,
    );
});

test('every matrix segment falls into a pit and replays to its last key',
    async () => {
        const { segments } = loadMonsterPitRecipe();
        for (const segment of segments) {
            const fallKey = FALL_KEY[segment.seed];
            assert.ok(fallKey, `segment ${segment.seed} has a measured fall`);
            assert.ok(
                segment.moves.length >= fallKey,
                `segment ${segment.seed} runs past its fall`,
            );

            await runSegment({ ...segment, moves: '' });
            assert.ok(
                game.level.traps.some((trap) => trap.ttyp === PIT),
                `segment ${segment.seed} generates a pit`,
            );

            const replay = await runSegment(segment);
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${segment.seed} emits one screen per key`,
            );
        }
    });
