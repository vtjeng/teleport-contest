import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_STR, COULD_SEE, FORCETRAP, IN_SIGHT, MAX_NUM_WORMS, NOWEBMSG, TT_NONE, TT_WEB,
    Trap_Caught_Mon, Trap_Effect_Finished, VIASITTING, WEB,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { accessible } from '../js/monmove.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    PM_AIR_ELEMENTAL, PM_BABY_RED_DRAGON, PM_BLACK_PUDDING, PM_BUGBEAR,
    PM_FIRE_ELEMENTAL, PM_GELATINOUS_CUBE, PM_GHOST, PM_GIANT_SPIDER,
    PM_HILL_GIANT, PM_IRON_GOLEM, PM_KOBOLD, PM_LONG_WORM, PM_PONY,
    PM_RED_DRAGON,
} from '../js/monsters.js';
import {
    mintrap, preflight_dotrap, trapeffect_selector,
} from '../js/trap_effects.js';

// An independently chosen startup supplies valid vision, map memory, and
// property arrays. Fixtures replace only the victim and the web; no C
// recording uses this constructed state.
async function setup() {
    await runSegment({
        seed: 8974123,
        datetime: '20370609112743',
        nethackrc: 'OPTIONS=name:Silk,role:Barbarian,race:human,gender:female,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
        moves: '',
    });
    game.level.traps = [];
}

function webAt(x, y, madeby_u = false) {
    const trap = { tx: x, ty: y, ttyp: WEB, tseen: false, madeby_u };
    game.level.traps.push(trap);
    return trap;
}

function victim(pmidx, { unseen = false, trapped = false } = {}) {
    // Use adjacent floor so visibility is determined by the real map. Every
    // test gets a fresh level and therefore needs only one free neighbour.
    const [x, y] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => [game.u.ux + dx, game.u.uy + dy])
        .find(([mx, my]) => accessible(mx, my, game));
    const monster = newMonster({
        data: game.mons[pmidx], mnum: pmidx, m_id: 700,
        mx: x, my: y, mhp: 20, mhpmax: 20, mcansee: true,
        mcanmove: true, mtrapped: trapped,
    });
    place_monster(monster, x, y, game);
    monster.nmon = game.level.monlist;
    game.level.monlist = monster;
    if (unseen) game.viz_array[y][x] &= ~(COULD_SEE | IN_SIGHT);
    return { monster, trap: webAt(x, y) };
}

function environment() {
    const events = [];
    const draws = [];
    // Return the low end of each source draw. Recording both the operation
    // and its arguments catches extra draws and changes between rnd/rn1.
    const random = {
        rn1: (bound, base) => { draws.push(['rn1', bound, base]); return base; },
        rnd: (bound) => { draws.push(['rnd', bound]); return 1; },
        rn2: (bound) => { draws.push(['rn2', bound]); return 1; },
        rnl: (bound) => { draws.push(['rnl', bound]); return 0; },
        rne: (bound) => { draws.push(['rne', bound]); return 1; },
    };
    return {
        state: game, events, draws, random,
        message: async (line) => { events.push(['message', line]); },
        redraw: (x, y) => { events.push(['redraw', x, y]); },
        unsupported: (reason) => { throw new Error(reason); },
        mInAir: () => false,
        heroDeaf: () => false,
        youHear: (line) => `You hear ${line}`,
    };
}

function lines(env) {
    return env.events.filter(([kind]) => kind === 'message').map(([, text]) => text);
}

test('mintrap catches an ordinary monster and reveals the web after its message', async () => {
    await setup();
    const { monster, trap } = victim(PM_KOBOLD);
    const env = environment();
    assert.equal(await mintrap(monster, 0, env), Trap_Caught_Mon);
    assert.equal(monster.mtrapped, true);
    assert.equal(trap.tseen, true);
    assert.match(lines(env)[0], /is caught in a spider web\./u);
    assert.deepEqual(env.events.map(([kind]) => kind), ['message', 'redraw']);
    assert.deepEqual(env.draws, []); // trap.c ordinary web catch spends no RNG.
});

test('webmaker immunity precedes visibility messages and destruction', async () => {
    await setup();
    const { monster, trap } = victim(PM_GIANT_SPIDER);
    const env = environment();
    assert.equal(await mintrap(monster, FORCETRAP, env), Trap_Effect_Finished);
    assert.equal(monster.mtrapped, false);
    assert.equal(trap.tseen, false);
    assert.deepEqual(env.events, []);
    assert.deepEqual(env.draws, []);
});

test('immune forms burn, dissolve, or flow through the web as trap.c specifies', async () => {
    // Acid alone does not grant passage: gelatinous cubes are admitted by
    // their explicit species check. Puddings are admitted by amorphous().
    for (const [pmidx, verb, destroyed] of [
        [PM_FIRE_ELEMENTAL, 'burns', true],
        [PM_BLACK_PUDDING, 'dissolves', true],
        [PM_GELATINOUS_CUBE, 'dissolves', true],
        [PM_AIR_ELEMENTAL, 'flows through', false],
        [PM_GHOST, 'flows through', false],
    ]) {
        await setup();
        const { monster, trap } = victim(pmidx);
        const env = environment();
        assert.equal(await mintrap(monster, 0, env), Trap_Effect_Finished);
        assert.equal(game.level.traps.includes(trap), !destroyed);
        assert.equal(monster.mtrapped, false);
        // Ghosts are intrinsically invisible; force their visible branch
        // below through the hero, while their monster branch stays silent.
        if (lines(env).length) assert.ok(lines(env)[0].includes(verb));
        assert.deepEqual(env.draws, []);
    }
});

test('giants and adult dragons tear webs, while baby dragons are caught', async () => {
    for (const [pmidx, caught] of [
        [PM_HILL_GIANT, false], [PM_RED_DRAGON, false],
        [PM_BABY_RED_DRAGON, true], [PM_IRON_GOLEM, false],
    ]) {
        await setup();
        const { monster, trap } = victim(pmidx);
        const env = environment();
        assert.equal(await mintrap(monster, 0, env),
            caught ? Trap_Caught_Mon : Trap_Effect_Finished);
        assert.equal(monster.mtrapped, caught);
        assert.equal(game.level.traps.includes(trap), caught);
        assert.deepEqual(env.draws, []);
    }
});

test('explicit tear-web species preserve mtrapped, unlike the giant default branch', async () => {
    // C's explicit species cases only set tear_web. Direct dispatch isolates
    // that contract; mintrap normally calls the effect for an untrapped victim.
    for (const [pmidx, held] of [[PM_IRON_GOLEM, true], [PM_HILL_GIANT, false]]) {
        await setup();
        const { monster, trap } = victim(pmidx, { trapped: true });
        await trapeffect_selector(monster, trap, FORCETRAP, environment());
        assert.equal(monster.mtrapped, held);
    }
});

test('worm destruction counts visible tail segments in the supplied state', async () => {
    // trap.c requires more than five; worm.c excludes the hidden head slot.
    for (const visibleSegments of [5, 6]) {
        await setup();
        const { monster, trap } = victim(PM_LONG_WORM);
        monster.wormno = 1; // Slot zero is reserved by worm.c.
        game.level.worms = Array(MAX_NUM_WORMS).fill(null);
        game.level.worms[1] = {
            segments: Array.from({ length: visibleSegments + 1 }, () => ({})),
        };
        await trapeffect_selector(monster, trap, 0, environment());
        assert.equal(game.level.traps.includes(trap), visibleSegments === 5);
    }
});

test('unseen bugbear roars and remains caught without revealing the web', async () => {
    await setup();
    const { monster, trap } = victim(PM_BUGBEAR, { unseen: true });
    const env = environment();
    assert.equal(await mintrap(monster, 0, env), Trap_Caught_Mon);
    assert.equal(trap.tseen, false);
    assert.deepEqual(lines(env), ['You hear the roaring of a confused bear!']);
    assert.deepEqual(env.draws, []);
});

test('hero web duration follows every Strength threshold and draw', async () => {
    // Each pair straddles a bound in trap.c:2176-2196; 69 is STR18(51).
    for (const [strength, timer, draw] of [
        [3, 6, ['rn1', 6, 6]], [4, 4, ['rn1', 6, 4]],
        [5, 4, ['rn1', 6, 4]], [6, 4, ['rn1', 4, 4]],
        [8, 4, ['rn1', 4, 4]], [9, 2, ['rn1', 4, 2]],
        [11, 2, ['rn1', 4, 2]], [12, 2, ['rn1', 2, 2]],
        [14, 2, ['rn1', 2, 2]], [15, 1, ['rnd', 2]],
        [17, 1, ['rnd', 2]], [18, 1, null], [68, 1, null], [69, 0, null],
    ]) {
        await setup();
        game.u.acurr.a[A_STR] = strength;
        const trap = webAt(game.u.ux, game.u.uy, true);
        const env = environment();
        await trapeffect_selector(game.youmonst, trap, VIASITTING, env);
        assert.equal(game.u.utrap, timer);
        assert.equal(game.u.utraptype, timer ? TT_WEB : TT_NONE);
        assert.deepEqual(env.draws, draw ? [draw] : []);
        assert.equal(game.level.traps.includes(trap), timer !== 0);
        assert.equal(lines(env)[0], 'You are caught by your spider web!');
    }
});

test('hero immune forms and NOWEBMSG preserve feeling the trap', async () => {
    for (const [pmidx, text, destroyed] of [
        [PM_FIRE_ELEMENTAL, 'You burn a spider web!', true],
        [PM_GELATINOUS_CUBE, 'You dissolve a spider web!', true],
        [PM_GHOST, 'You flow through a spider web.', false],
        [PM_GIANT_SPIDER, 'There is a spider web here.', false],
    ]) {
        for (const flags of [0, NOWEBMSG]) {
            await setup();
            game.youmonst.data = game.mons[pmidx];
            const trap = webAt(game.u.ux, game.u.uy);
            const env = environment();
            await trapeffect_selector(game.youmonst, trap, flags, env);
            assert.equal(trap.tseen, true);
            assert.equal(game.level.traps.includes(trap), !destroyed);
            assert.deepEqual(lines(env), flags ? [] : [text]);
            assert.deepEqual(env.draws, []);
        }
    }
});

test('mounted web catch uses mintrap then transfers the hold to the hero', async () => {
    await setup();
    const { monster: steed } = victim(PM_PONY);
    game.level.traps = [];
    game.u.usteed = steed;
    const trap = webAt(game.u.ux, game.u.uy);
    const env = environment();
    assert.doesNotThrow(() => preflight_dotrap(trap, game));
    await trapeffect_selector(game.youmonst, trap, 0, env);
    assert.equal(steed.mx, game.u.ux);
    assert.equal(steed.my, game.u.uy);
    assert.equal(steed.mtrapped, false);
    assert.equal(game.u.utrap, 1); // strongmonst gives Strength 17, rnd(2).
    assert.equal(game.u.utraptype, TT_WEB);
    assert.match(lines(env)[0], /You lead the poor pony into a spider web!/u);
    assert.match(lines(env)[1], /is caught in a spider web\./u);
    assert.deepEqual(env.draws, [['rnd', 2]]);
});
