import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARROW_TRAP,
    BEAR_TRAP,
    COULD_SEE,
    FORCETRAP,
    HOLE,
    IN_SIGHT,
    MAGIC_TRAP,
    PIT,
    SPIKED_PIT,
    Trap_Caught_Mon,
    Trap_Effect_Finished,
    Trap_Killed_Mon,
    WEB,
    W_ARMF,
} from '../js/const.js';
import { rhack } from '../js/cmd.js';
import { glyph_to_cmap, newsym } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { accessible, m_in_air } from '../js/monmove.js';
import {
    m_at,
    newMonster,
    place_monster,
    remove_monster,
} from '../js/monst.js';
import { trap_to_defsym } from '../js/symbols.js';
import {
    MZ_SMALL,
    NON_PM,
    PM_BLUE_JELLY,
    PM_BUGBEAR,
    PM_DUST_VORTEX,
    PM_JACKAL,
    PM_OWLBEAR,
    PM_PONY,
    PM_RUST_MONSTER,
    PM_WATER_ELEMENTAL,
} from '../js/monsters.js';
import { mksobj } from '../js/obj.js';
import { CORPSE, IRON_SHOES } from '../js/objects.js';
import { canSeeMonster } from '../js/startup_a11y.js';
import { t_at, trapname } from '../js/trap.js';
import { mintrap, trapeffect_selector } from '../js/trap_effects.js';
import { cansee } from '../js/vision.js';
import { loadMonsterBearTrapRecipe } from './run-monster-bear-trap.mjs';

// The same Valkyrie scripts/monster-pit.test.mjs uses, so both read the same
// hero, the same lit starting room and the same free neighbours.
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
// onto the level chain so that m_detach() can find it, standing on a bear
// trap. Every case here reaches trapeffect_bear_trap() through mintrap(),
// which is monmove.c postmov()'s own call.
let nextFixtureId = 700;
function victimInBearTrap(pmidx, mhp, { madeby_u = false, ...overrides } = {}) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        // One trap per square. t_at() answers with the first entry in
        // game.level.traps that matches, so a second fixture on a square an
        // earlier one already trapped would be read past: newsym() and
        // mintrap() would inspect the earlier trap while the case asserted
        // on the later one. Skipping trapped squares keeps the trap a case
        // asserts on the trap the port reads. The hero of this fixture has
        // all eight neighbours accessible, and the longest case below builds
        // six victims.
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
            ...overrides,
        });
        place_monster(mon, x, y, game);
        mon.nmon = game.level.monlist;
        game.level.monlist = mon;
        mon.mhp = mhp;
        const trap = {
            tx: x, ty: y, ttyp: BEAR_TRAP, tseen: false, madeby_u, once: false,
        };
        game.level.traps.push(trap);
        return { mon, trap, x, y };
    }
    throw new Error('no free square beside the hero');
}

// Records the bound of every draw and answers from a scripted list, so a test
// can put a chosen roll where the arm reads one, and records how many lines
// had been written when each draw was taken. That count is what pins the
// damage roll behind the message C suspends on.
function bearEnv(rolls = [], fallback = 1) {
    const bounds = [];
    const linesAtDraw = [];
    const lines = [];
    const redraws = [];
    const heard = [];
    const queue = [...rolls];
    const take = (label) => {
        bounds.push(label);
        linesAtDraw.push(lines.length);
        return queue.length ? queue.shift() : fallback;
    };
    return {
        bounds,
        linesAtDraw,
        lines,
        redraws,
        heard,
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
        // pline.c You_hear() with acoustics on and no deafness, which is what
        // the rc above gives. The composed line is C's, not this file's.
        youHear: (line) => {
            heard.push(line);
            return `You hear ${line}`;
        },
    };
}

// Take the hero's sight of a square away, the way
// scripts/monster-pit.test.mjs does, so that `in_sight` is false at C:1527.
function blind_to(x, y) {
    game.viz_array[y][x] &= ~(COULD_SEE | IN_SIGHT);
}

// The other half of blind_to(): the square the hero has walked back into view
// of. vision.c vision_recalc() sets these two bits and then calls newsym() for
// the square, which is the sequence display.c:1013-1024 runs under.
function watch_again(x, y) {
    game.viz_array[y][x] |= COULD_SEE | IN_SIGHT;
}

// trap.c trapeffect_bear_trap():1530-1538 and :1553-1557, the arm's common
// case: a monster over MZ_SMALL is held, told about, and bitten, and mintrap()
// hands Trap_Caught_Mon back to postmov().
test('a bear trap catches a monster the hero can watch', async () => {
    await hero();
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13);
    assert.equal(canSeeMonster(mon, game), true, 'the hero watches');
    // monsters.h:1002-1009 gives the pony SIZ(1300, 250, MS_NEIGH, MZ_MEDIUM),
    // which is the only conjunct of C:1530-1531 that a species record decides
    // on its own for this fixture.
    assert.equal(mon.data.msize > MZ_SMALL, true, 'MZ_MEDIUM clears the gate');

    // d(2, 4) of 5 leaves the pony standing with eight hit points.
    const env = bearEnv([5]);
    assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon, 'trap.c:1557');
    assert.deepEqual(env.lines, ['The pony is caught in a bear trap!']);
    assert.deepEqual(env.bounds, ['d(2,4)'], 'only the damage roll');
    assert.equal(mon.mhp, 8, 'd(2, 4) of 5 off thirteen hit points');
    assert.equal(mon.mtrapped, true, 'trap.c:1532');
    assert.equal(trap.tseen, true, "seetrap()'s write");
    assert.deepEqual(env.redraws, [`${x},${y}`], "and seetrap()'s draw");
});

// trap.c:1534 and :1554. C's pline_mon() suspends on a --More-- when a message
// already stands unread, and only after the hero clears it does thitm()'s
// argument get evaluated. The port reaches the same order by awaiting the
// message seam, so the draw has to fall after the line, never before it.
test('the bear trap damage roll follows the message that suspends',
     async () => {
         await hero();
         const { mon } = victimInBearTrap(PM_PONY, 13);

         const env = bearEnv([5]);
         assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon);
         assert.deepEqual(env.linesAtDraw, [1],
                          'the catch message was already written');

         // The other side of the same order: an out-of-sight catch writes no
         // line at all, and the draw still happens, so the count is the
         // message rather than the draw moving.
         const unseen = victimInBearTrap(PM_PONY, 13);
         blind_to(unseen.x, unseen.y);
         const unseenEnv = bearEnv([5]);
         assert.equal(await mintrap(unseen.mon, 0, unseenEnv),
                      Trap_Caught_Mon);
         assert.deepEqual(unseenEnv.bounds, ['d(2,4)']);
         assert.deepEqual(unseenEnv.linesAtDraw, [0]);
     });

// The same order, decided by a seam that really suspends. bearEnv()'s message
// double resolves at once, so `linesAtDraw` above counts only where the line
// was written relative to the draw, not whether the arm waited for it: an
// implementation that started the message and rolled without awaiting it
// records the same [1]. C's pline_mon() blocks inside the --More-- until the
// hero clears it, and the draw at 1554 belongs to the keystroke that cleared
// it, so nothing may be spent while the message is still standing.
test('the bear trap damage roll waits for the --More-- to be cleared',
     async () => {
         await hero();
         const { mon, trap } = victimInBearTrap(PM_PONY, 13);

         const env = bearEnv([5]);
         let clear;
         const cleared = new Promise((resolve) => { clear = resolve; });
         env.message = async (text) => {
             env.lines.push(text);
             await cleared;
         };

         const caught = mintrap(mon, 0, env);
         // setImmediate fires after the whole microtask queue, so everything
         // the arm can reach without the hero has run by the time this returns.
         await new Promise((resolve) => { setImmediate(resolve); });
         assert.deepEqual(env.lines, ['The pony is caught in a bear trap!'],
                          'the line stands unread');
         assert.deepEqual(env.bounds, [], 'and nothing has been spent');
         assert.equal(mon.mhp, 13, 'nor taken off the victim');
         assert.equal(trap.tseen, false, "seetrap() waits behind it too");

         clear();
         assert.equal(await caught, Trap_Caught_Mon);
         assert.deepEqual(env.bounds, ['d(2,4)'], 'the draw lands after it');
         assert.equal(mon.mhp, 8, 'd(2, 4) of 5 off thirteen hit points');
         assert.equal(trap.tseen, true, "and seetrap()'s write lands too");
     });

// trap.c:1530. MZ_SMALL is the floor, and a monster at or below it walks out
// of an ordinary bear trap with nothing written, nothing drawn, nothing spent
// and nothing held.
test('a bear trap lets a small monster walk out', async () => {
    await hero();
    const { mon, trap } = victimInBearTrap(PM_JACKAL, 9);
    // monsters.h:246-253 gives the jackal SIZ(300, 250, MS_BARK, MZ_SMALL),
    // which is exactly the bound rather than under it.
    assert.equal(mon.data.msize, MZ_SMALL, 'the boundary species');

    const env = bearEnv();
    assert.equal(await mintrap(mon, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.lines, [], 'no line');
    assert.deepEqual(env.redraws, [], 'no draw');
    assert.deepEqual(env.bounds, [], 'not even the damage roll');
    assert.equal(mon.mhp, 9);
    assert.equal(mon.mtrapped, false);
    assert.equal(trap.tseen, false);
});

// trap.c:1530-1531, the four substance and posture conjuncts behind the size
// test. Each is checked on a species or an injection that fails it alone, so
// that no one of the five carries another.
test('a bear trap closes through anything it cannot hold', async () => {
    await hero();

    // M1_AMORPHOUS. monsters.h:704-712 gives the blue jelly MZ_MEDIUM and no
    // flight, so amorphous() is the only conjunct it fails.
    const jelly = victimInBearTrap(PM_BLUE_JELLY, 9);
    const jellyEnv = bearEnv();
    assert.equal(await mintrap(jelly.mon, 0, jellyEnv), Trap_Effect_Finished);
    assert.deepEqual(jellyEnv.bounds, [], 'amorphous');
    assert.equal(jelly.mon.mtrapped, false);

    // mon.c m_in_air(), which arrives through the env because js/monmove.js
    // holds it. A pony clears every other conjunct, so lifting it off the
    // ground is the whole difference from the catch above.
    const airborne = victimInBearTrap(PM_PONY, 13);
    const airborneEnv = { ...bearEnv(), mInAir: () => true };
    assert.equal(await mintrap(airborne.mon, 0, airborneEnv),
                 Trap_Effect_Finished);
    assert.deepEqual(airborneEnv.bounds, [], 'm_in_air');
    assert.equal(airborne.mon.mtrapped, false);

    // M1_UNSOLID. monsters.h:3273-3282 gives the water elemental MZ_HUGE and
    // no flight, and mondata.h:87 is_whirly() names the air elemental and the
    // vortex class alone, so unsolid() is the only conjunct it fails.
    const water = victimInBearTrap(PM_WATER_ELEMENTAL, 9);
    const waterEnv = bearEnv();
    assert.equal(await mintrap(water.mon, 0, waterEnv), Trap_Effect_Finished);
    assert.deepEqual(waterEnv.bounds, [], 'unsolid');
    assert.equal(water.mon.mtrapped, false);

    // mondata.h:87 is_whirly(). All seven whirly species are M1_FLY, so C's
    // own m_in_air() answers TRUE for every one of them and this conjunct is
    // dead behind the one before it; mintrap():3766's check_in_air() gate
    // turns a whirly monster away earlier still, which is why this case goes
    // straight to trapeffect_selector() instead of through mintrap(). The
    // injection holds the vortex down so that the conjunct itself is what
    // refuses, and the assertion above it records why no game reaches it.
    assert.equal(m_in_air(
        { data: game.mons[PM_DUST_VORTEX], mundetected: false }, game,
    ), true, 'C stops a vortex one conjunct earlier');
    const vortex = victimInBearTrap(PM_DUST_VORTEX, 9);
    const vortexEnv = bearEnv();
    assert.equal(
        await trapeffect_selector(vortex.mon, vortex.trap, 0, vortexEnv),
        Trap_Effect_Finished,
    );
    assert.deepEqual(vortexEnv.bounds, [], 'is_whirly');
    assert.equal(vortex.mon.mtrapped, false);
});

// trap.c:1533-1538. `in_sight` gates the catch message and seetrap() together,
// so a monster the hero cannot watch is held and bitten with nothing said and
// the trap left off the map.
test('a bear trap out of sight is silent but still bites', async () => {
    await hero();
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13);
    blind_to(x, y);
    assert.equal(canSeeMonster(mon, game), false, 'the hero cannot watch');

    const env = bearEnv([5]);
    assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon);
    assert.deepEqual(env.lines, [], 'no line');
    assert.deepEqual(env.redraws, [], 'no draw');
    assert.deepEqual(env.bounds, ['d(2,4)'], 'the damage still lands');
    assert.equal(trap.tseen, false, 'the trap stays unmapped');
    assert.equal(mon.mtrapped, true, 'but the trap still holds it');
    assert.equal(mon.mhp, 8);
});

// trap.c:1527, `in_sight = canseemon(mtmp) || (mtmp == u.usteed)`. The second
// disjunct is what the case above cannot reach: the hero always knows what is
// happening to his own mount, whether or not he can see it. Every other case
// in this file decides in_sight through canseemon() alone, so this is the one
// that keeps the disjunct from being deleted.
test('a bear trap under the hero own steed is reported unseen', async () => {
    await hero();
    // The steed stands beside the hero rather than under him, because a mount
    // shares the hero's square and blind_to() could not then take the square
    // out of sight without taking the hero's own square with it. C reads
    // nothing but the identity `mtmp == u.usteed`, so the square is free to
    // differ. Tameness is left alone for the same reason: nothing in the arm
    // reads it, and js/do_name.js monsterCommonName() has no "your" form.
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13);
    blind_to(x, y);
    assert.equal(canSeeMonster(mon, game), false, 'the hero cannot watch');
    game.u.usteed = mon;

    try {
        const env = bearEnv([5]);
        assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon);
        assert.deepEqual(env.lines, ['The pony is caught in a bear trap!'],
                         'C:1534 writes the ordinary catch line');
        assert.equal(trap.tseen, true, "and C:1537 runs seetrap()");
        assert.deepEqual(env.redraws, [`${x},${y}`], "seetrap()'s draw");
        assert.deepEqual(env.heard, [],
                         'C:1539 is the else of this branch, so no roar');
        assert.equal(mon.mhp, 8, 'the bite is unchanged');
    } finally {
        // scripts/wounded-legs.test.mjs clears the same field for the same
        // reason: game is module state shared by every case in the file.
        game.u.usteed = null;
    }
});

// display.c newsym():1013-1024. A catch the hero did not watch leaves the trap
// off the map, and the hero learns it from the held monster itself: newsym()
// marks the trap seen before _map_location() picks the remembered glyph, so
// the first frame that shows the monster already remembers the trap under it.
// pager.c:468-476 makes the same write on a farlook and names the mechanism,
// "newsym lets you know of the trap".
test('newsym maps the trap under a monster the hero finds held', async () => {
    await hero();
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13);
    blind_to(x, y);
    const env = bearEnv([5]);
    assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon);
    assert.equal(mon.mtrapped, true, 'held');
    assert.equal(trap.tseen, false, 'and unwatched, so trap.c:1537 was skipped');

    // The hero walks into view: vision.c vision_recalc() ends in newsym() for
    // every square whose visibility changed.
    watch_again(x, y);
    newsym(x, y);
    assert.equal(trap.tseen, true, 'display.c:1023');
    assert.equal(glyph_to_cmap(game.level.at(x, y).remembered_glyph.glyph),
                 trap_to_defsym(BEAR_TRAP),
                 'display.c:1024, the trap under the monster');
});

// display.c:1014 and :1017. The write needs a held monster over one of the
// three trap types C names; every other square newsym() paints keeps whatever
// the hero already knew.
test('newsym maps no trap the hero has no held monster to read', async () => {
    await hero();

    // display.c:1014, mon->mtrapped. The pony stands on the same unseen bear
    // trap without being held by it, which mintrap() leaves possible whenever
    // the trap has already closed on something else.
    const loose = victimInBearTrap(PM_PONY, 13);
    newsym(loose.x, loose.y);
    assert.equal(loose.trap.tseen, false, 'nothing is holding it');

    // display.c:1013, the monster itself. An unseen trap with no monster on it
    // is the ordinary case of every square the hero walks past.
    const bare = victimInBearTrap(PM_PONY, 13);
    remove_monster(bare.x, bare.y, game);
    newsym(bare.x, bare.y);
    assert.equal(bare.trap.tseen, false, 'and nothing to read it from');

    // display.c:1017. is_pit() and WEB carry the other two arms; an arrow trap
    // is one of the types outside all three, and stays unmapped under a
    // monster the trap is recorded as holding. This is the case that refuses a
    // wider disjunction, so the t_at() assertion in front of it records that
    // newsym() reads this trap rather than an earlier fixture's.
    const arrow = victimInBearTrap(PM_PONY, 13);
    arrow.trap.ttyp = ARROW_TRAP;
    arrow.mon.mtrapped = true;
    assert.equal(t_at(arrow.x, arrow.y, game), arrow.trap,
                 'display.c:1016 reads this trap');
    newsym(arrow.x, arrow.y);
    assert.equal(arrow.trap.tseen, false, 'an arrow trap is not physical');

    // The rest of C:1017's membership: both types trap.h:113 is_pit() names,
    // and WEB. Only the write is asserted here; the remembered glyph the write
    // feeds is the case above, whose square is the one this fixture leaves
    // free of the starting room's objects.
    for (const [ttyp, label] of [[PIT, 'is_pit() PIT'],
        [SPIKED_PIT, 'is_pit() SPIKED_PIT'], [WEB, 'WEB']]) {
        const held = victimInBearTrap(PM_PONY, 13);
        held.trap.ttyp = ttyp;
        held.mon.mtrapped = true;
        newsym(held.x, held.y);
        assert.equal(held.trap.tseen, true, label);
    }
});

// trap.c:1539-1543. Out of sight, an owlbear or a bugbear is heard instead of
// seen. You_hear() writes the line and Soundeffect() writes nothing the
// recorder captures, and neither of them maps the trap.
test('an unseen owlbear is heard roaring in a bear trap', async () => {
    await hero();
    const owlbear = victimInBearTrap(PM_OWLBEAR, 20);
    blind_to(owlbear.x, owlbear.y);

    const env = bearEnv([5]);
    assert.equal(await mintrap(owlbear.mon, 0, env), Trap_Caught_Mon);
    assert.deepEqual(env.heard, ['the roaring of an angry bear!']);
    assert.deepEqual(env.lines, ['You hear the roaring of an angry bear!']);
    assert.deepEqual(env.redraws, [], 'no draw');
    assert.equal(owlbear.trap.tseen, false, 'the trap stays unmapped');
    assert.equal(owlbear.mon.mtrapped, true);
    assert.deepEqual(env.bounds, ['d(2,4)']);

    // monsters.h:565-573 gives the bugbear MZ_LARGE, and C:1540-1541 names it
    // beside the owlbear, so the pair is the whole membership of this arm.
    const bugbear = victimInBearTrap(PM_BUGBEAR, 20);
    blind_to(bugbear.x, bugbear.y);
    const bugbearEnv = bearEnv([5]);
    assert.equal(await mintrap(bugbear.mon, 0, bugbearEnv), Trap_Caught_Mon);
    assert.deepEqual(bugbearEnv.lines,
                     ['You hear the roaring of an angry bear!']);

    // In sight the same owlbear takes the ordinary message and no roar at all.
    const seen = victimInBearTrap(PM_OWLBEAR, 20);
    const seenEnv = bearEnv([5]);
    assert.equal(await mintrap(seen.mon, 0, seenEnv), Trap_Caught_Mon);
    assert.deepEqual(seenEnv.heard, [], 'nothing is heard');
    assert.deepEqual(seenEnv.lines, ['The owlbear is caught in a bear trap!']);
});

// trap.c:1545-1552. A monster the trap cannot hold still evades it visibly
// when the trigger was forced, which maps the trap without holding or hurting
// anything.
test('a forced bear trap reports the evasion', async () => {
    await hero();
    const { mon, trap, x, y } = victimInBearTrap(PM_JACKAL, 9);

    const env = bearEnv();
    assert.equal(await mintrap(mon, FORCETRAP, env), Trap_Effect_Finished);
    assert.deepEqual(env.lines, ['The jackal evades a bear trap!']);
    assert.equal(trap.tseen, true, "seetrap()'s write");
    assert.deepEqual(env.redraws, [`${x},${y}`]);
    assert.deepEqual(env.bounds, [], 'nothing is spent');
    assert.equal(mon.mtrapped, false, 'and nothing is held');
    assert.equal(mon.mhp, 9);

    // C:1546 gates the evasion on `in_sight` too, so an unwatched evasion is
    // as silent as an unwatched catch and leaves the trap unmapped.
    const unseen = victimInBearTrap(PM_JACKAL, 9);
    blind_to(unseen.x, unseen.y);
    const unseenEnv = bearEnv();
    assert.equal(await mintrap(unseen.mon, FORCETRAP, unseenEnv),
                 Trap_Effect_Finished);
    assert.deepEqual(unseenEnv.lines, []);
    assert.equal(unseen.trap.tseen, false);

    // The arm the evasion belongs to is the `else`, so a monster the trap does
    // hold is caught by a forced trigger exactly as by an ordinary one.
    const held = victimInBearTrap(PM_PONY, 13);
    const heldEnv = bearEnv([5]);
    assert.equal(await mintrap(held.mon, FORCETRAP, heldEnv),
                 Trap_Caught_Mon);
    assert.deepEqual(heldEnv.lines, ['The pony is caught in a bear trap!']);
});

// trap.c:1553. Iron shoes keep the teeth off a monster the trap has already
// closed on, so the catch stands and the damage roll never happens.
test('iron shoes keep a bear trap from biting', async () => {
    await hero();
    const { mon, trap } = victimInBearTrap(PM_PONY, 13);
    const shoes = mksobj(IRON_SHOES, false, false, { state: game });
    shoes.owornmask = W_ARMF;
    mon.minvent = shoes;

    const env = bearEnv([5]);
    assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon);
    assert.deepEqual(env.lines, ['The pony is caught in a bear trap!']);
    assert.deepEqual(env.bounds, [], 'no damage roll');
    assert.equal(mon.mhp, 13, 'and no damage');
    assert.equal(mon.mtrapped, true, 'the trap still holds it');
    assert.equal(trap.tseen, true);
});

// trap.c:1554 into mon.c monkilled(), and the first of C:1556's three answers.
// thitm() reports the kill and mintrap() passes Trap_Killed_Mon to postmov(),
// which is the path monmove.c:1510 turns into MMOVE_DIED.
test('a bear trap that empties its victim reports a kill', async () => {
    await hero();
    const { mon, x, y } = victimInBearTrap(PM_PONY, 6);

    // d(2, 4) of 6 empties the pony; every later draw takes the fallback of 1,
    // which declines the corpse.
    const env = bearEnv([6]);
    assert.equal(await mintrap(mon, 0, env), Trap_Killed_Mon, 'trap.c:1556');
    assert.deepEqual(env.lines, [
        'The pony is caught in a bear trap!',
        'The pony is killed!',
    ]);
    assert.equal(env.bounds[0], 'd(2,4)', 'the damage roll leads');
    assert.equal(mon.mhp, 0);
    assert.equal(m_at(x, y, game), null, 'off the map');

    // One hit point more and the same roll leaves it alive and held, which is
    // the difference between C:1556's first answer and its second.
    const survivor = victimInBearTrap(PM_PONY, 7);
    assert.equal(await mintrap(survivor.mon, 0, bearEnv([6])),
                 Trap_Caught_Mon);
    assert.equal(survivor.mon.mhp, 1);

    // C:1554's last argument, thitm()'s `nocorpse`, which C passes as FALSE.
    // mon.c monkilled() turns that into AD_PHYS and mondied(), so the corpse
    // roll happens and a pony corpse can land on the square; TRUE would send
    // -AD_RBRE and mondead() instead, which draws nothing and leaves nothing.
    // The corpse roll of 0 is what accepts the corpse, and every later draw
    // takes the fallback of 0 through mksobj().
    const corpsed = victimInBearTrap(PM_PONY, 6);
    const corpsedEnv = bearEnv([6, 0], 0);
    assert.equal(await mintrap(corpsed.mon, 0, corpsedEnv), Trap_Killed_Mon);
    assert.deepEqual(corpsedEnv.bounds.slice(0, 2), ['d(2,4)', 'rn2(2)'],
                     'the corpse roll follows the damage roll');
    const corpse = game.level.objects[corpsed.x][corpsed.y];
    assert.equal(corpse?.otyp, CORPSE, 'and leaves a corpse behind');
    assert.equal(corpse.corpsenm, PM_PONY, 'of the species the trap killed');
});

// trap.c:1535 and :1550. a_your[] is indexed by trap->madeby_u, and both of
// the arm's messages take the lowercase table. mintrap():3819's rnl(5) gate
// sits in front of them, so the aggravation draw is asserted here too.
test('a hero-made bear trap is named as the hero own', async () => {
    await hero();
    const { mon } = victimInBearTrap(PM_PONY, 13, { madeby_u: true });

    // rnl(5) of 0 declines setmangry(), which is not ported.
    const env = bearEnv([0, 5]);
    assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon);
    assert.deepEqual(env.lines, ['The pony is caught in your bear trap!']);
    assert.deepEqual(env.bounds, ['rnl(5)', 'd(2,4)']);

    const evader = victimInBearTrap(PM_JACKAL, 9, { madeby_u: true });
    const evaderEnv = bearEnv([0]);
    assert.equal(await mintrap(evader.mon, FORCETRAP, evaderEnv),
                 Trap_Effect_Finished);
    assert.deepEqual(evaderEnv.lines, ['The jackal evades your bear trap!']);
});

// trap.c mintrap():3751 and :3788. A held monster spends one rn2(40) per
// completed move and stays held on every nonzero roll, writing nothing and
// drawing nothing. The 39-in-40 side is what seed0004-feeding-pony spends
// from step 46 to step 82, so it is the arm's common case by a wide margin.
test('a trapped monster spends its turn in the trap', async () => {
    await hero();
    const { mon, trap } = victimInBearTrap(PM_PONY, 13, { mtrapped: true });
    trap.tseen = true;

    // rn2(40) of 1 is the smallest roll that keeps the monster held; 0 is the
    // only one that frees it.
    const env = bearEnv([1]);
    assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon, 'trap.c:3788');
    assert.deepEqual(env.bounds, ['rn2(40)'], 'one escape roll and no other');
    assert.deepEqual(env.lines, [], 'a held monster is not reported again');
    assert.deepEqual(env.redraws, [], 'and nothing is repainted');
    assert.equal(mon.mtrapped, true, 'still held');
    assert.equal(mon.mhp, 13, 'the trap bites once, at the catch');
});

// trap.c:3751 and :3770-3774. The escape itself: rn2(40) of 0 frees the
// monster and, while the hero can watch, writes the line trapname() names the
// trap in. No development session draws it -- seed0004's own escape at step 83
// is silent because canseemon() has gone false by then -- so this pins the
// wording against C and scripts/run-monster-bear-trap.mjs records it fresh.
test('a trapped monster pulls free of the bear trap', async () => {
    await hero();
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13, {
        mtrapped: true,
    });
    trap.tseen = true;
    assert.equal(canSeeMonster(mon, game), true, 'the hero watches');

    const env = bearEnv([0]);
    assert.equal(await mintrap(mon, 0, env), Trap_Effect_Finished,
                 'trap.c:3788 with mtrapped cleared');
    assert.deepEqual(env.bounds, ['rn2(40)']);
    assert.deepEqual(env.lines, ['The pony pulls free of the bear trap.']);
    assert.equal(mon.mtrapped, false, 'trap.c:3775');
    assert.equal(trap.tseen, true, 'the trap stays on the map');
    assert.deepEqual(env.redraws, [], 'freeing a monster repaints nothing');

    // C:3766. Out of sight the same roll frees the monster silently, so the
    // message is the hero's view rather than part of the escape.
    const unseen = victimInBearTrap(PM_PONY, 13, { mtrapped: true });
    unseen.trap.tseen = true;
    blind_to(unseen.x, unseen.y);
    const unseenEnv = bearEnv([0]);
    assert.equal(await mintrap(unseen.mon, 0, unseenEnv),
                 Trap_Effect_Finished);
    assert.deepEqual(unseenEnv.bounds, ['rn2(40)'], 'the roll still happens');
    assert.deepEqual(unseenEnv.lines, []);
    assert.equal(unseen.mon.mtrapped, false);

    // The escape leaves the square it was held on, which is what m_move()'s
    // prologue then lets the monster move off.
    assert.equal(m_at(x, y, game), mon, 'the monster has not moved yet');
});

// trap.c:3771-3772 passes trap->ttyp to trapname(), and C's condition admits
// a web beside the bear trap. The two names come from
// defsyms[trap_to_defsym(ttyp)].explanation, so this is what would break if
// trapname() indexed that table by one place.
test('the escape line names the trap it frees the monster from', async () => {
    await hero();
    assert.equal(trapname(BEAR_TRAP), 'bear trap');
    assert.equal(trapname(WEB), 'web');

    // The web is left unmapped, because C:3745 admits it beside the bear trap
    // and the hole: seeing a held monster reveals whichever of the four holds
    // it. That is the whole difference between this case and a bear trap.
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13, {
        mtrapped: true,
    });
    trap.ttyp = WEB;
    const env = bearEnv([0]);
    assert.equal(await mintrap(mon, 0, env), Trap_Effect_Finished);
    assert.deepEqual(env.lines, ['The pony pulls free of the web.']);
    assert.equal(trap.tseen, true, 'C:3745 admits a web');
    assert.deepEqual(env.redraws, [`${x},${y}`]);
});

// trap.c:3742-3749. Coming upon an obviously held monster reveals what holds
// it, which is the one write this arm makes on a turn that frees nobody.
test('watching a held monster reveals the trap under it', async () => {
    await hero();
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13, {
        mtrapped: true,
    });
    assert.equal(trap.tseen, false, 'the trap starts unmapped');

    const env = bearEnv([1]);
    assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon);
    assert.equal(trap.tseen, true, "seetrap()'s write");
    assert.deepEqual(env.redraws, [`${x},${y}`], "and seetrap()'s draw");

    // The same turn with the hero unable to see the square leaves the trap
    // unmapped: C:3742 wants cansee() and canseemon() together.
    const unseen = victimInBearTrap(PM_PONY, 13, { mtrapped: true });
    blind_to(unseen.x, unseen.y);
    const unseenEnv = bearEnv([1]);
    assert.equal(await mintrap(unseen.mon, 0, unseenEnv), Trap_Caught_Mon);
    assert.equal(unseen.trap.tseen, false, 'nothing revealed');
    assert.deepEqual(unseenEnv.redraws, []);

    // The two conjuncts apart. An invisible monster on a square the hero can
    // still see satisfies cansee() and fails canseemon(), and C:3742 wants
    // both: the hero has not come upon an obviously trapped monster, so the
    // trap stays hidden. The same gate silences the escape line at C:3766.
    const invisible = victimInBearTrap(PM_PONY, 13, {
        minvis: true,
        mtrapped: true,
    });
    assert.equal(canSeeMonster(invisible.mon, game), false, 'not seen');
    const invisibleEnv = bearEnv([0]);
    assert.equal(await mintrap(invisible.mon, 0, invisibleEnv),
                 Trap_Effect_Finished);
    assert.equal(invisible.trap.tseen, false, 'nothing revealed');
    assert.deepEqual(invisibleEnv.redraws, []);
    assert.deepEqual(invisibleEnv.lines, [], 'and nothing written');
    assert.equal(invisible.mon.mtrapped, false, 'yet it pulls free');
});

// trap.c:3744, the disjunct between the bear trap and the web. A hole holds a
// monster only by inheritance: dig.c digactualhole() calls maketrap() on the
// square (dig.c:689), which rewrites an existing pit's ttyp in place, and the
// monster branch below it (dig.c:801-805) returns without migrating a victim
// that is ungrounded, a long worm, or MZ_HUGE or larger -- leaving mtrapped
// set over what is now a HOLE. Nothing else in the C source writes mtrapped
// for a hole, which is why this fixture builds the state rather than playing
// to it.
test('a hole under a held monster is revealed like a bear trap', async () => {
    await hero();
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13, {
        mtrapped: true,
    });
    trap.ttyp = HOLE;
    assert.equal(canSeeMonster(mon, game), true, 'the hero watches');
    assert.equal(trap.tseen, false, 'the hole starts unmapped');

    // rn2(40) of 1 is the smallest roll that keeps the monster held, so the
    // turn ends inside C:3789 with seetrap()'s write as its only effect.
    const env = bearEnv([1]);
    assert.equal(await mintrap(mon, 0, env), Trap_Caught_Mon);
    assert.equal(trap.tseen, true, "C:3744 admits a hole, so seetrap() ran");
    assert.deepEqual(env.redraws, [`${x},${y}`], "and seetrap()'s draw");
    assert.deepEqual(env.bounds, ['rn2(40)'], 'one escape roll');
    assert.deepEqual(env.lines, [], 'nothing is written');
    assert.equal(mon.mtrapped, true, 'and the hole still holds it');
});

// js/trap_effects.js refuses the escape of a held monster on a trap that is
// neither a bear trap nor a web, because C:3767 calls set_msg_xy() and then
// writes no line at all, and messageAt() cannot leave a cursor hint standing
// for whatever prints next. The refusal sits inside the roll and the
// visibility test, at C's own position, so it fires with work already done --
// which is what this case pins.
test('a silent escape is refused with the roll already spent', async () => {
    await hero();

    // The hole of the case above, one roll further on. This is the reachable
    // silent type: is_pit() is refused ahead of seetrap(), and a bear trap and
    // a web both have a line, so C:3766-3773's silent path needs a hole.
    const { mon, trap, x, y } = victimInBearTrap(PM_PONY, 13, {
        mtrapped: true,
    });
    trap.ttyp = HOLE;
    // rn2(40) of 0 is the only roll that frees a monster from a non-pit.
    const env = bearEnv([0]);
    await assert.rejects(
        mintrap(mon, 0, env),
        (error) => error.message === 'a monster escaping a trap silently',
    );
    assert.deepEqual(env.bounds, ['rn2(40)'], 'the roll is already spent');
    assert.equal(trap.tseen, true, "and seetrap()'s write already stands");
    assert.deepEqual(env.redraws, [`${x},${y}`], 'as does its draw');
    assert.equal(mon.mtrapped, true, 'C:3771 has not been reached');
    assert.deepEqual(env.lines, [], 'and nothing was written');

    // A magic trap takes the same refusal, and shows the two gates apart:
    // C:3742-3745 does not admit it, so tseen is still false when the refusal
    // fires, while the roll above it has been spent either way. No C site
    // writes mtrapped for a magic trap, so only the refusal's position is
    // under test here.
    const magic = victimInBearTrap(PM_PONY, 13, { mtrapped: true });
    magic.trap.ttyp = MAGIC_TRAP;
    const magicEnv = bearEnv([0]);
    await assert.rejects(
        mintrap(magic.mon, 0, magicEnv),
        (error) => error.message === 'a monster escaping a trap silently',
    );
    assert.deepEqual(magicEnv.bounds, ['rn2(40)']);
    assert.equal(magic.trap.tseen, false, 'C:3745 leaves a magic trap out');
    assert.deepEqual(magicEnv.redraws, [], 'so nothing was drawn');
});

// trap.c:3751-3758 and :3775-3787, the two blocks a bear trap never reaches.
// Each is refused rather than ported, at C's own position: the pit refusal
// leads the arm because is_pit() changes the escape condition itself, and the
// metallivore refusal is the `else` of that escape, exactly where C puts it.
test('the pit and metallivore blocks are refused, not ported', async () => {
    await hero();

    // is_pit() opens C's second escape disjunct, the boulder block and the
    // "climbs out of the pit" line, all of which need m_easy_escape_pit() and
    // fill_pit().
    const pit = victimInBearTrap(PM_PONY, 13, { mtrapped: true });
    pit.trap.ttyp = PIT;
    const pitEnv = bearEnv([0]);
    await assert.rejects(
        mintrap(pit.mon, 0, pitEnv),
        (error) => error.message === 'a monster escaping a pit',
    );
    assert.deepEqual(pitEnv.bounds, [], 'refused ahead of the escape roll');
    assert.equal(pit.trap.tseen, false, 'and ahead of seetrap()');
    assert.equal(pit.mon.mtrapped, true, 'nothing freed');

    // metallivorous(). monsters.h:2147-2154 gives the rust monster
    // M1_METALLIVORE, and C:3777-3782 has it eat the bear trap through
    // deltrap() and start meating. C reaches that branch only as the `else` of
    // the escape, so the refusal follows the escape roll rather than leading
    // it, and the trap is still on the level when it fires.
    const eater = victimInBearTrap(PM_RUST_MONSTER, 13, { mtrapped: true });
    eater.trap.tseen = true;
    const eaterEnv = bearEnv([1]);
    await assert.rejects(
        mintrap(eater.mon, 0, eaterEnv),
        (error) => error.message === 'a monster eating a trap',
    );
    assert.deepEqual(eaterEnv.bounds, ['rn2(40)'], "C's own order");
    assert.equal(game.level.traps.includes(eater.trap), true, 'not eaten');
    assert.equal(eater.mon.mtrapped, true, 'and still held');

    // The other side of that order: the same metallivore on the roll that
    // frees it never reaches the branch, so it pulls free like anything else.
    const freed = victimInBearTrap(PM_RUST_MONSTER, 13, { mtrapped: true });
    freed.trap.tseen = true;
    const freedEnv = bearEnv([0]);
    assert.equal(await mintrap(freed.mon, 0, freedEnv), Trap_Effect_Finished);
    assert.deepEqual(freedEnv.lines,
                     ['The rust monster pulls free of the bear trap.']);
    assert.equal(freed.mon.mtrapped, false);
});

// What each matrix segment is recorded for, measured by replaying it in the
// port: the turn on which the trap fires, and the state the arm leaves behind.
// `caught` names the branch of C:1530 the segment takes; `freed` names
// mintrap():3751's, and only a segment whose escape roll comes up sets it.
const MATRIX_OUTCOME = Object.freeze({
    7000039: { turn: 5, caught: true, killed: false, freed: false },
    // Eight held turns end at step 15 with a roll of zero, which is what
    // leaves this segment's pony off its trap at the last key.
    7005082: { turn: 6, caught: true, killed: false, freed: true },
    7010149: { turn: 9, caught: true, killed: false, freed: false },
    7007646: { turn: 25, caught: true, killed: false, freed: false },
    // The roll empties the pony, so nothing stands on the trap afterwards.
    7008529: { turn: 32, caught: true, killed: true, freed: false },
    // The kobold zombie crosses the trap instead of being held by it.
    7002077: { turn: 31, caught: false, killed: false, freed: false },
    // The one unwatched catch. C:1533 is false, so no line is written and no
    // --More-- is raised, which is why this segment carries no space.
    7003206: {
        turn: 107, caught: true, killed: false, freed: false, silent: true,
    },
});

// Every watched segment has to carry the recording across the --More-- that
// C's pline_mon() raises at 1534, or the d(2, 4) at 1554 is never spent and
// the matrix records the message alone.
test('every matrix segment ends on the key that clears the --More--',
     async () => {
         const { segments } = loadMonsterBearTrapRecipe();
         assert.equal(segments.length, 7);
         for (const segment of segments) {
             const outcome = MATRIX_OUTCOME[segment.seed];
             assert.ok(outcome,
                       `segment ${segment.seed} has a measured outcome`);
             assert.equal(segment.moves.includes(' '), !outcome.silent,
                          `segment ${segment.seed} clears a --More--`);
             assert.ok(
                 segment.moves.length > outcome.turn,
                 `segment ${segment.seed} runs past its catch`,
             );
         }

         // One Valkyrie for the size gate's other side; the rest are Knights,
         // whose pony is the only starting pet over MZ_SMALL.
         assert.equal(
             segments.filter(
                 ({ nethackrc }) => nethackrc.includes('role:Knight'),
             ).length,
             6,
         );
     });

test('every matrix segment reaches a bear trap and replays to its last key',
     async () => {
         const { segments } = loadMonsterBearTrapRecipe();
         for (const segment of segments) {
             await runSegment({ ...segment, moves: '' });
             const traps = game.level.traps.filter(
                 (trap) => trap.ttyp === BEAR_TRAP,
             );
             assert.equal(traps.length > 0, true,
                          `segment ${segment.seed} generates a bear trap`);

             const replay = await runSegment(segment);
             assert.equal(
                 replay.getScreens().length,
                 segment.moves.length + 1,
                 `segment ${segment.seed} emits one screen per key`,
             );

             const expected = MATRIX_OUTCOME[segment.seed];
             const live = game.level.traps.filter(
                 (trap) => trap.ttyp === BEAR_TRAP,
             );
             let onTrap = null;
             for (let mon = game.level.monlist; mon; mon = mon.nmon) {
                 if (live.some(
                     (trap) => trap.tx === mon.mx && trap.ty === mon.my,
                 )) onTrap = mon;
             }
             // An empty trap square is all a killed and a freed victim have
             // in common, so each arm below names the fact only its own
             // outcome produces. Asserting the absence alone would let either
             // segment pass as the other, and this matrix is the repository's
             // only recording of the escape.
             let survivor = null;
             for (let mon = game.level.monlist; mon; mon = mon.nmon)
                 if (mon.mnum === PM_PONY) survivor = mon;
             // terminal.serialize() strings, the same text the judge compares.
             const screens = replay.getScreens();
             if (expected.killed) {
                 assert.equal(onTrap, null,
                              `segment ${segment.seed} empties its victim`);
                 assert.equal(live.some((trap) => trap.tseen), true,
                              `segment ${segment.seed} exposes the trap`);
                 // thitm()'s d(2,4) took the pony to zero, so it is gone from
                 // the level chain and mvitals has counted it.
                 assert.equal(survivor, null,
                              `segment ${segment.seed} leaves no live pony`);
                 assert.ok(game.mvitals[PM_PONY].died > 0,
                           `segment ${segment.seed} counts the death`);
                 continue;
             }
             if (expected.freed) {
                 // mintrap():3775 clears mtrapped, and m_move()'s prologue
                 // then lets the turn carry on, so the pony walks off the
                 // square it was held on. The trap it left stays mapped.
                 assert.equal(onTrap, null,
                              `segment ${segment.seed} frees its victim`);
                 assert.equal(live.some((trap) => trap.tseen), true,
                              `segment ${segment.seed} leaves the trap seen`);
                 // The escape itself, which the assertions above cannot see:
                 // the pony is alive and no longer held. Its message is not
                 // assertable here and no case in the repository asserts it:
                 // C's line at 3771 needs canseemon(), and this segment's
                 // pony is out of sight by the turn the roll frees it, so no
                 // captured screen carries "pulls free" on either side. That
                 // gap is recorded as a deferral rather than papered over.
                 assert.ok(survivor,
                           `segment ${segment.seed} keeps its pony alive`);
                 assert.equal(Boolean(survivor.mtrapped), false,
                              `segment ${segment.seed} releases its pony`);
                 assert.ok(
                     screens.every(
                         (screen) => !screen.includes('pulls free of the'),
                     ),
                     `segment ${segment.seed} frees its pony unseen`,
                 );
                 continue;
             }
             assert.ok(onTrap, `segment ${segment.seed} leaves a victim`);
             assert.equal(Boolean(onTrap.mtrapped), expected.caught,
                          `segment ${segment.seed} takes C:1530's branch`);
             assert.equal(onTrap.data.msize > MZ_SMALL, expected.caught,
                          `segment ${segment.seed} matches its size gate`);
         }
     });

// The setup display.c newsym():1014-1023 exists for, in a running game rather
// than a fixture: a pony held over a trap the hero has never been told about.
// The unlit room is what makes it reachable. Only the walk that stops two
// squares short leaves the trap dark while the pony still crosses it, so the
// hero's own position is this segment's whole subject and the assertions below
// pin it rather than the catch.
test('the unwatched matrix segment is caught over an unmapped trap',
     async () => {
         const segment = loadMonsterBearTrapRecipe().segments.find(
             ({ seed }) => seed === 7003206,
         );
         // Everything before the `lss` that walks the hero back into sight.
         const unwatched = segment.moves.slice(0, -3);

         await runSegment({ ...segment, moves: unwatched });
         const trap = game.level.traps.find((t) => t.ttyp === BEAR_TRAP);
         let pony = null;
         for (let mon = game.level.monlist; mon; mon = mon.nmon)
             if (mon.mnum === PM_PONY) pony = mon;
         assert.deepEqual([pony.mx, pony.my], [trap.tx, trap.ty],
                          'the pony is standing on the bear trap');
         assert.equal(Boolean(pony.mtrapped), true, 'trap.c:1532 held it');
         assert.equal(cansee(trap.tx, trap.ty, game), false,
                      'and the hero could not watch');
         assert.equal(Boolean(trap.tseen), false,
                      'so trap.c:1537 left the trap off the map');

         // The `l` of the segment's last three keys, run as the hero's own half
         // of the turn and stopped there. cmd.c rhack() is what allmain.c
         // moveloop_core() dispatches a command through, and the monster scan
         // is the *next* iteration's advanceElapsedTurn(), so nothing between
         // the two touches the trap.
         //
         // Stopping matters, because trap.c mintrap():3742-3749 sets the same
         // bit from the pony's next m_move() the moment the hero can see it.
         // Replaying the whole segment therefore cannot tell display.c:1023
         // from that catching-up write: the assertion below is taken before any
         // m_move() the hero's arrival makes visible, so only newsym() can
         // satisfy it. game.moves is the witness -- an elapsed turn, and with
         // it the monster scan, would have advanced it.
         const beforeStep = game.moves;
         game.nhDisplay.pushKey('l'.charCodeAt(0));
         // moveloop_core() sets this before every command dispatch, and
         // domove() requires it.
         game.context.move = 1;
         await rhack(0, game);

         assert.equal(game.moves, beforeStep,
                      'no elapsed turn, so the pony has not moved');
         assert.equal(Boolean(pony.mtrapped), true, 'and is still held');
         assert.equal(cansee(trap.tx, trap.ty, game), true,
                      'the hero is watching now');
         assert.equal(Boolean(trap.tseen), true, 'display.c:1023');
     });
