import assert from 'node:assert/strict';
import test from 'node:test';

import { MON_DETACH, OBJ_FLOOR, OBJ_FREE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { accessible } from '../js/monmove.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { AD_RBRE, NON_PM, PM_JACKAL } from '../js/monsters.js';
import { mksobj } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { DART } from '../js/objects.js';
import { thitm } from '../js/trap_effects.js';
import { find_mac } from '../js/worn.js';

// The same Valkyrie scripts/mon-kill.test.mjs uses, so that both files read
// the same hero, the same lit starting room and the same free neighbours.
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
    return game;
}

// A jackal beside the hero, shaped the way makemon() leaves one and linked
// onto the level chain so that m_detach() can find it. The jackal is the
// victim throughout: its species AC is 7, which is thitm()'s to-hit threshold,
// and corpse_chance() divides by 2 for it -- G_FREQ 3 clears the frequency
// term and MZ_SMALL is not verysmall.
let nextFixtureId = 200;
function jackal(mhp) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        if (!accessible(x, y, game) || m_at(x, y, game)) continue;
        const mon = newMonster({
            cham: NON_PM,
            m_lev: game.mons[PM_JACKAL].mlevel,
            m_id: ++nextFixtureId,
            mhp: 1,
            mhpmax: 12,
            mcanmove: 1,
            data: game.mons[PM_JACKAL],
            mx: x,
            my: y,
        });
        place_monster(mon, x, y, game);
        mon.nmon = game.level.monlist;
        game.level.monlist = mon;
        mon.mhp = mhp;
        return mon;
    }
    throw new Error('no free square beside the hero');
}

// Records the bound of every draw and answers from a scripted list, so a test
// can put a chosen rnd(20) where thitm() reads one. The whole family is
// answered because a corpse reaches mkobj.c mksobj() and its timer.
function trapEnv(rolls = [], fallback = 1) {
    const bounds = [];
    const lines = [];
    const redraws = [];
    const queue = [...rolls];
    const take = (label) => {
        bounds.push(label);
        return queue.length ? queue.shift() : fallback;
    };
    const random = {
        d: (n, x) => take(`d(${n},${x})`),
        rn1: (x, from) => take(`rn1(${x},${from})`) + from,
        rn2: (b) => take(`rn2(${b})`),
        rnd: (b) => take(`rnd(${b})`),
        rne: (b) => take(`rne(${b})`),
        rnz: (b) => take(`rnz(${b})`),
    };
    return {
        bounds,
        lines,
        redraws,
        state: game,
        random,
        objectEnv: objectGenerationEnv({ state: game, random }),
        message: async (text) => { lines.push(text); },
        redraw: (x, y) => { redraws.push(`${x},${y}`); },
        unsupported: (reason) => { throw new Error(reason); },
    };
}

function refusesAsync(fn, reason, label) {
    return assert.rejects(fn, (error) => {
        assert.equal(error.message, reason, label);
        return true;
    }, label);
}

// trap.c thitm():6721-6726. A nonzero d_override forces the hit, so the to-hit
// roll is never made; without one the roll happens and the target's AC decides
// it. trap.c:1554 and :2002 are the callers that pass an override.
test('an overridden hit skips the to-hit roll and spends its own damage',
    async () => {
        await hero();
        assert.equal(find_mac(jackal(1), game), 7, 'the jackal fixture AC');

        // A jackal with 9 hit points survives 6 damage with 3 left, and the
        // whole call draws nothing: 6721 takes the override and 6752's death
        // test fails.
        const mon = jackal(9);
        const env = trapEnv();
        assert.equal(await thitm(0, mon, null, 6, false, env), false);
        assert.equal(mon.mhp, 3, 'the override is the damage');
        assert.deepEqual(env.bounds, [], 'no roll at all');
        assert.deepEqual(env.lines, [], 'a missile-less hit is silent');
        assert.deepEqual(env.redraws, [], 'and repaints nothing');
    });

// trap.c thitm():6726. `strike` is `find_mac(mon) + tlev <= rnd(20)` when the
// trap throws no missile, so the roll that just reaches the total hits and the
// one below it misses. Both sides are asserted at the boundary, because the
// arms differ only by one point of damage and no message.
test('the to-hit roll is decided at find_mac plus the attack level',
    async () => {
        await hero();

        // tlev 0: the threshold is the jackal's AC of 7 on its own.
        const hit = jackal(9);
        const hitEnv = trapEnv([7]);
        assert.equal(await thitm(0, hit, null, 0, false, hitEnv), false);
        assert.deepEqual(hitEnv.bounds, ['rnd(20)']);
        assert.equal(hit.mhp, 8, 'a missile-less hit costs the default 1');

        const miss = jackal(9);
        const missEnv = trapEnv([6]);
        assert.equal(await thitm(0, miss, null, 0, false, missEnv), false);
        assert.deepEqual(missEnv.bounds, ['rnd(20)']);
        assert.equal(miss.mhp, 9, 'a miss costs nothing');
        assert.deepEqual(missEnv.lines, [], 'and says nothing without an obj');

        // tlev 3 moves the threshold to 10, which is what proves the term is
        // added rather than ignored.
        const raised = jackal(9);
        const raisedEnv = trapEnv([9]);
        assert.equal(await thitm(3, raised, null, 0, false, raisedEnv), false);
        assert.equal(raised.mhp, 9, 'rnd(20) of 9 no longer reaches 10');
        const met = jackal(9);
        await thitm(3, met, null, 0, false, trapEnv([10]));
        assert.equal(met.mhp, 8, 'and 10 does');
    });

// trap.c thitm():6752-6760. A strike that empties the victim's hit points
// hands it to mon.c monkilled() with AD_PHYS, repaints the square it stood on
// and reports the kill to the caller, which is what turns a monster arm's
// result into Trap_Killed_Mon.
test('a lethal strike kills the victim and repaints its square', async () => {
    await hero();

    const mon = jackal(6);
    const x = mon.mx;
    const y = mon.my;
    // The jackal's corpse divisor is 2, and 1 declines the corpse so that the
    // square holds nothing but the repaint.
    const env = trapEnv([1]);
    assert.equal(await thitm(0, mon, null, 6, false, env), true, 'trapkilled');
    assert.equal(mon.mhp, 0);
    assert.deepEqual(env.lines, ['The jackal is killed!']);
    assert.deepEqual(env.bounds, ['rn2(2)'], "monkilled()'s corpse roll");
    assert.equal(m_at(x, y, game), null, 'off the map');
    assert.equal((mon.mstate ?? 0) & MON_DETACH, MON_DETACH, 'detached');
    // Two repaints of the one square, in C's order: steal.c relobj() makes
    // the first when m_detach() drops what the victim carried, and 6758's
    // newsym() the second. C saves mx and my before the kill and repaints
    // them afterwards; the port's mon_leaving_level() leaves both fields
    // alone, as mon.c:2712-2714 requires, so the two coordinates agree.
    assert.deepEqual(env.redraws, [`${x},${y}`, `${x},${y}`]);

    // Damage that leaves the victim standing reaches none of it.
    const spared = jackal(7);
    const sparedEnv = trapEnv();
    assert.equal(await thitm(0, spared, null, 6, false, sparedEnv), false);
    assert.equal(spared.mhp, 1, 'one point short of the kill');
    assert.deepEqual(sparedEnv.redraws, [], 'nothing repainted');
    assert.deepEqual(sparedEnv.lines, []);
});

// trap.c thitm():6756. `nocorpse` selects -AD_RBRE, which mon.c monkilled()
// reads as disintegration and answers with mondead() instead of mondied(). The
// corpse roll is the whole difference: mondead() never reaches
// corpse_chance().
test('nocorpse reaches monkilled as a disintegration', async () => {
    await hero();

    const burnt = jackal(6);
    const burntEnv = trapEnv();
    assert.equal(await thitm(0, burnt, null, 6, true, burntEnv), true);
    assert.deepEqual(burntEnv.bounds, [], 'no corpse is attempted');
    assert.equal(game.level.objects[burnt.mx][burnt.my], null,
                 'and none left');
    // -AD_RBRE is what the flag turns into, and AD_RBRE itself would not do:
    // monkilled() compares against the negated constant.
    assert.equal(AD_RBRE, 242, 'the constant the sign is applied to');

    const ordinary = jackal(6);
    const ordinaryEnv = trapEnv([0]);
    assert.equal(await thitm(0, ordinary, null, 6, false, ordinaryEnv), true);
    assert.deepEqual(ordinaryEnv.bounds[0], 'rn2(2)', 'a corpse is attempted');
});

// trap.c thitm():6740-6749, the branch a missile takes when it connects. Its
// damage is weapon.c dmgval(), its message names a still-free object, and a
// rock that a rock-passing monster shrugs off has to clear `strike` so that
// 6766 places the missile rather than freeing it. The stop is above all three,
// so the target keeps its hit points and the missile stays where it was.
test('a missile that connects stops above the message and the damage',
    async () => {
        await hero();

        const mon = jackal(9);
        const dart = mksobj(DART, false, false, { state: game });
        // 6724's to-hit total is find_mac + tlev + spe. 7 + 7 + 2 is 16, and
        // an rnd(20) of 16 reaches it.
        dart.spe = 2;
        const env = trapEnv([16]);
        await refusesAsync(
            () => thitm(7, mon, dart, 0, false, env),
            'a monster struck by a trap missile',
        );
        assert.deepEqual(env.bounds, ['rnd(20)'], 'only the to-hit roll');
        assert.deepEqual(env.lines, [], 'nothing printed');
        assert.equal(mon.mhp, 9, 'no damage taken');
        assert.equal(dart.where, OBJ_FREE, 'the missile is neither placed');
        assert.equal(game.level.objects[mon.mx][mon.my], null, 'nor dropped');
    });

// trap.c thitm():6732-6734 and 6766-6768, the arm a missile takes when it goes
// wide. It is the arm every firing in the monster-dart-trap matrix takes, and
// it is asserted here at the boundary so that the enchantment term above it
// cannot be dropped without a failure.
test('a missile that goes wide is named and lands on the square', async () => {
    await hero();

    const mon = jackal(9);
    const dart = mksobj(DART, false, false, { state: game });
    dart.spe = 2;
    // One below the 16 the strike needs.
    const env = trapEnv([15]);
    assert.equal(await thitm(7, mon, dart, 0, false, env), false);
    assert.deepEqual(env.lines, ['The jackal is almost hit by a dart!']);
    assert.equal(mon.mhp, 9);
    assert.equal(dart.where, OBJ_FLOOR);
    assert.equal(game.level.objects[mon.mx][mon.my], dart);
});
