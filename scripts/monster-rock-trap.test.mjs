import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COULD_SEE,
    IN_SIGHT,
    ROCKTRAP,
    Trap_Effect_Finished,
    Trap_Is_Gone,
    Trap_Killed_Mon,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { accessible } from '../js/monmove.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { NON_PM, PM_GNOME, PM_JACKAL } from '../js/monsters.js';
import { ROCK } from '../js/objects.js';
import { t_at } from '../js/trap.js';
import { mintrap } from '../js/trap_effects.js';
import { loadMonsterRockTrapRecipe } from './run-monster-rock-trap.mjs';

// Every segment spends its whole turn budget on the search command, so the
// hero never moves and every recorded difference belongs to a monster.
const SEGMENT_KEYS = new Set(['s']);

// trap.c:1389 sets this bit the first time a rock falls, and nothing in the
// port clears it, so it is the state that says a rock trap actually fired.
function firedRockTraps() {
    return game.level.traps.filter(
        (trap) => trap.ttyp === ROCKTRAP && trap.once,
    );
}

// t_missile() creates exactly one rock per firing and thitm() places it on the
// victim's square, because the arm's forced damage keeps C:6766 rather than
// C:6770. Both roots are needed because a monster may pick the rock up again,
// which moves it off the floor list and into a pack.
function rocksOnLevel() {
    let count = 0;
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === ROCK) count += obj.quan;
    for (let mon = game.level.monlist; mon; mon = mon.nmon)
        for (let obj = mon.minvent; obj; obj = obj.nobj)
            if (obj.otyp === ROCK) count += obj.quan;
    return count;
}

test('monster-rock-trap matrix contains only source-selected inputs', () => {
    const recipe = loadMonsterRockTrapRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 7);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment spends its turns on the search command',
        );
    }
    // Six segments keep the hero alone, so the victim is always a wild
    // monster; the seventh puts a pet in the same scan, which reaches
    // postmov() through dog_move() instead of m_move().
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('OPTIONS=pettype:none\n'),
        ).length,
        6,
    );
});

test('every matrix segment fires a rock trap and replays to its last key',
    async () => {
        const { segments } = loadMonsterRockTrapRecipe();
        for (const [index, segment] of segments.entries()) {
            await runSegment({ ...segment, moves: '' });
            assert.equal(
                firedRockTraps().length,
                0,
                `segment ${index} starts with no rock trap fired`,
            );
            const before = rocksOnLevel();
            assert.ok(
                game.level.traps.some((trap) => trap.ttyp === ROCKTRAP),
                `segment ${index} generates a rock trap`,
            );

            const replay = await runSegment(segment);
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${index} emits one screen per key plus the prompt`,
            );
            assert.ok(
                firedRockTraps().length > 0,
                `segment ${index} fires a rock trap`,
            );
            // trap.c:6765. The arm forces its damage, so `d_override` is
            // nonzero and the rock is placed rather than deallocated,
            // whether it killed the victim or not.
            assert.ok(
                rocksOnLevel() > before,
                `segment ${index} leaves the fallen rock on the level`,
            );
        }
    });

// The fixtures below reach trapeffect_rocktrap() through mintrap(), which is
// monmove.c postmov()'s own call, on a hero built by the same recipe every
// other monster-trap test file uses.
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
// onto the level chain so that m_detach() can find it, standing on a rock
// trap whose `once` and `tseen` bits the caller chooses.
let nextFixtureId = 900;
function victimOnRockTrap(pmidx, mhp, trapOverrides = {}) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        // One trap per square: t_at() answers with the first matching entry,
        // so a second fixture on an already-trapped square would be read past.
        if (!accessible(x, y, game) || m_at(x, y, game) || t_at(x, y, game))
            continue;
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
        });
        place_monster(mon, x, y, game);
        mon.nmon = game.level.monlist;
        game.level.monlist = mon;
        mon.mhp = mhp;
        const trap = {
            tx: x,
            ty: y,
            ttyp: ROCKTRAP,
            tseen: false,
            once: false,
            madeby_u: false,
            ...trapOverrides,
        };
        game.level.traps.push(trap);
        return { mon, trap, x, y };
    }
    throw new Error('no free square beside the hero');
}

// Records the bound of every draw and answers each by its label, so a test can
// put a chosen roll where the arm reads one without counting the draws
// mksobj() makes for the rock ahead of it. The whole random family is answered
// because t_missile() reaches mkobj.c mksobj(); every unlisted draw returns 1.
function rockEnv(answers = {}) {
    const bounds = [];
    const lines = [];
    const redraws = [];
    const take = (label) => {
        bounds.push(label);
        return Object.hasOwn(answers, label) ? answers[label] : 1;
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
        youHear: (line) => `You hear ${line}`,
    };
}

// Take the hero's sight of a square away, the way the other monster-trap test
// files do, so that `in_sight` and `see_it` are both false.
function blind_to(x, y) {
    game.viz_array[y][x] &= ~(COULD_SEE | IN_SIGHT);
}

// trap.c trapeffect_rocktrap():1389-1397, the arm's common case: the trap
// remembers that it fired, a rock is made, seetrap() exposes the trap to a
// watching hero, and thitm() applies the forced d(2, 6).
test('a rock trap drops a rock on a monster the hero can watch', async () => {
    await hero();
    const { mon, trap, x, y } = victimOnRockTrap(PM_GNOME, 9);

    // d(2, 6) of 4 leaves the gnome standing with five hit points. Every
    // other draw is mksobj()'s rock initialization, which the fallback of 1
    // answers.
    const env = rockEnv({ 'd(2,6)': 4 });
    assert.equal(await mintrap(mon, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.lines, ['The gnome is hit by a rock!']);
    assert.equal(mon.mhp, 5, 'd(2, 6) of 4 off nine hit points');
    assert.equal(trap.once, true, 'trap.c:1389');
    assert.equal(trap.tseen, true, "seetrap()'s write");
    // The forced damage keeps thitm() on C:6766, so the rock lands where the
    // victim stands rather than being deallocated.
    const rock = game.level.objects[x][y];
    assert.equal(rock.otyp, ROCK);
    assert.equal(rock.quan, 1, "t_missile()'s single missile");
    assert.deepEqual(env.redraws, [`${x},${y}`], "seetrap()'s draw alone");
    // C evaluates d(2, 6) as thitm()'s argument, so the damage roll follows
    // mksobj()'s initialization sequence rather than leading it.
    assert.equal(env.bounds.at(-1), 'd(2,6)');
});

// The same arm with the hero unable to see the square. canseemon() is false,
// so 1391's seetrap() does not run and thitm():6739's cansee() gate silences
// the line; the rock and the damage are unchanged.
test('an unwatched rock trap fires in silence', async () => {
    await hero();
    const { mon, trap, x, y } = victimOnRockTrap(PM_GNOME, 9);
    blind_to(x, y);

    const env = rockEnv({ 'd(2,6)': 4 });
    assert.equal(await mintrap(mon, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.lines, [], 'no line');
    assert.deepEqual(env.redraws, [], 'and no draw');
    assert.equal(trap.tseen, false, 'the trap stays off the map');
    assert.equal(trap.once, true, 'but it remembers that it fired');
    assert.equal(mon.mhp, 5);
    assert.equal(game.level.objects[x][y].otyp, ROCK);
});

// trap.c:1394-1397 into thitm():6752-6760. A roll that empties the victim
// reaches mon.c monkilled(), and mintrap() hands Trap_Killed_Mon back to
// postmov(), which turns it into MMOVE_DIED.
test('a rock that empties its victim reports the kill', async () => {
    await hero();
    const { mon, x, y } = victimOnRockTrap(PM_JACKAL, 4);

    // d(2, 6) of 4 is exactly the jackal's hit points; corpse_chance()'s
    // rn2(2) takes the default of 1, which declines the corpse, so the square
    // holds the rock and nothing else.
    const env = rockEnv({ 'd(2,6)': 4 });
    assert.equal(await mintrap(mon, 0, env), Trap_Killed_Mon);
    assert.deepEqual(env.lines,
                     ['The jackal is hit by a rock!', 'The jackal is killed!']);
    assert.equal(m_at(x, y, game), null, 'off the map');
    assert.equal(game.level.objects[x][y].otyp, ROCK);
});

// trap.c:1379-1388. A trap that has already fired under a hero who has seen it
// wears out on one roll in fifteen: it says so, deltrap() unlinks it, and the
// arm answers Trap_Is_Gone before any rock is made.
//
// No recorded case reaches this. A scan of seeds 4,200,000 to 4,202,499 with a
// 150-search budget put a rock trap on 214 dungeon levels and produced no
// wear-out on any of them, because it needs a second monster to step on the
// same already-mapped trap and then roll the one in fifteen.
test('a rock trap the hero has already seen can wear out', async () => {
    await hero();
    const { mon, trap, x, y } = victimOnRockTrap(
        PM_GNOME, 9, { once: true, tseen: true },
    );

    // The rn2(15) of zero is the wear-out; mintrap()'s own alreadySeen gate
    // reads mon_knows_traps(), which is clear for a fresh fixture, so the
    // bound-15 roll is the first draw the arm makes.
    const env = rockEnv({ 'rn2(15)': 0 });
    assert.equal(await mintrap(mon, 0, env), Trap_Is_Gone);
    assert.deepEqual(env.bounds, ['rn2(15)'], 'nothing else is spent');
    assert.deepEqual(
        env.lines,
        ['A trap door above the gnome opens, but nothing falls out!'],
    );
    assert.deepEqual(game.level.traps, [], "deltrap()'s unlink");
    assert.deepEqual(env.redraws, [`${x},${y}`]);
    assert.equal(game.level.objects[x][y], null, 'no rock was made');
    assert.equal(mon.mhp, 9, 'and no damage taken');
});

// The sibling: the same gate on a nonzero roll spends the draw and falls
// through into the drop.
test('an already-seen rock trap that survives its roll still fires',
    async () => {
        await hero();
        const { mon, trap, x, y } = victimOnRockTrap(
            PM_GNOME, 9, { once: true, tseen: true },
        );

        const env = rockEnv({});
        assert.equal(await mintrap(mon, 0, env), Trap_Effect_Finished);
        assert.equal(env.bounds[0], 'rn2(15)', 'the gate is rolled first');
        assert.equal(game.level.traps.includes(trap), true, 'still on the list');
        assert.equal(game.level.objects[x][y].otyp, ROCK);
        // The fallback answers d(2, 6) with 1, so the gnome loses one point.
        assert.equal(mon.mhp, 8);
        assert.equal(m_at(x, y, game), mon);
    });

// trap.c:1380-1382. The wear-out line is the one place the arm reads `see_it`,
// which is cansee() at the victim's square rather than canseemon(); a hero who
// cannot see the square gets the unlink with no line at all.
test('an unwatched rock trap wears out silently', async () => {
    await hero();
    const { mon, x, y } = victimOnRockTrap(
        PM_GNOME, 9, { once: true, tseen: true },
    );
    blind_to(x, y);

    const env = rockEnv({ 'rn2(15)': 0 });
    assert.equal(await mintrap(mon, 0, env), Trap_Is_Gone);
    assert.deepEqual(env.lines, []);
    assert.deepEqual(game.level.traps, []);
    assert.deepEqual(env.redraws, [`${x},${y}`], 'the repaint still happens');
    assert.equal(mon.mhp, 9);
});
