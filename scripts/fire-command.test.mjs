// The `f` command driven end to end through js/jsmain.js runSegment(), over
// the same recipes scripts/run-fire-command.mjs records against the C
// reference. The differential compares screens and random-number calls; this
// file asserts the game state behind them, so a change that keeps the screens
// and moves an object, a slot or a turn fails here.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CORR, MOAT, W_QUIVER, W_SWAPWEP, W_WEP } from '../js/const.js';
import {
    CANCEL_MOVES,
    FIRE_MOVES,
    LIQUID_MOVES,
    loadFireBesideLiquidRecipe,
    loadFireCancelRecipe,
    loadFireCommandRecipe,
} from './run-fire-command.mjs';
import { ARROW } from '../js/objects.js';
import { ammo_and_launcher } from '../js/obj.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

// FIRE_MOVES is `.f  l.fl.`: wait, fire, two --More-- dismissals, east, wait,
// fire, east, wait. Each prefix below stops one key later than the last.
const AFTER_WAIT = FIRE_MOVES.slice(0, 1);
const AFTER_FIRST_FIRE = FIRE_MOVES.slice(0, 2);
const AFTER_SWAP = FIRE_MOVES.slice(0, 4);
const AFTER_FIRST_SHOT = FIRE_MOVES.slice(0, 5);
const AFTER_SECOND_SHOT = FIRE_MOVES.slice(0, 8);

function segments() {
    return loadFireCommandRecipe().segments;
}

function role(segment) {
    return /role:([A-Za-z]+)/u.exec(segment.nethackrc)[1];
}

// The floor pile at <x,y>, head first, as js/obj.js place_object() links it.
function pileAt(x, y) {
    const found = [];
    for (let obj = game.level.objects[x]?.[y]; obj; obj = obj.nexthere)
        found.push(obj);
    return found;
}

test('the first f queues the swap and spends no time on itself', async () => {
    for (const segment of segments()) {
        await runSegment({ ...segment, moves: AFTER_WAIT });
        const beforeMoves = game.moves;
        const ammo = game.uquiver;
        assert.ok(ammo, `${role(segment)} readied nothing`);
        // dothrow.c:566-570 is the arm this reaches: the launcher is in the
        // secondary slot, not the hand.
        assert.equal(ammo_and_launcher(ammo, game.uwep, game), false);
        assert.equal(ammo_and_launcher(ammo, game.uswapwep, game), true);

        // dothrow.c:570 returns "haven't taken any time yet", and the queued
        // doswapweapon() runs on the same keystroke -- but its turn does not
        // elapse until moveloop_core() comes back round, and the segment is
        // sitting at the first prinv() --More-- by then.
        await runSegment({ ...segment, moves: AFTER_FIRST_FIRE });
        assert.equal(game.moves, beforeMoves,
            `${role(segment)} spent a turn before the swap elapsed`);

        // By the direction prompt the swap's turn has elapsed, and only it:
        // the `f` that queued it charged nothing of its own.
        await runSegment({ ...segment, moves: AFTER_SWAP });
        assert.equal(game.moves, beforeMoves + 1,
            `${role(segment)} spent the wrong number of turns on f`);
    }
});

test('the queued swap puts the launcher in the hand', async () => {
    for (const segment of segments()) {
        await runSegment({ ...segment, moves: AFTER_WAIT });
        const launcherTyp = game.uswapwep.otyp;
        const heldTyp = game.uwep.otyp;

        await runSegment({ ...segment, moves: AFTER_SWAP });
        // wield.c:477-495 exchanges the two slots, and worn.c setworn() moves
        // the masks with them.
        assert.equal(game.uwep.otyp, launcherTyp);
        assert.equal(game.uswapwep.otyp, heldTyp);
        assert.equal(game.uwep.owornmask & W_WEP, W_WEP);
        assert.equal(game.uswapwep.owornmask & W_SWAPWEP, W_SWAPWEP);
        // The quiver is untouched by the swap.
        assert.equal(game.uquiver.owornmask & W_QUIVER, W_QUIVER);
        assert.equal(ammo_and_launcher(game.uquiver, game.uwep, game), true);
    }
});

// The two volley sizes each seed produces, in order. throw_obj():231 ends the
// multishot arithmetic with rnd(multishot), so every bonus above that draw --
// the skill bonus, multishot_class_bonus() and the racial-bow bonus -- moves
// these numbers. They are C's, not the port's: scripts/run-fire-command.mjs
// records these same segments with the C reference and compares every screen,
// and a volley above one names its own size on the top line ("You shoot 2
// flint stones."), which is one of the screens it compares.
const VOLLEY_SIZES = new Map([
    [7810001, [1, 2]], // human Ranger, arrows from a bow
    [7810002, [2, 1]], // Caveman, flint stones from a sling
    [7810003, [2, 1]], // elven Ranger, elven arrows from an elven bow
]);

test('a volley leaves the quiver and lands on the floor', async () => {
    for (const segment of segments()) {
        const [firstVolley, secondVolley] = VOLLEY_SIZES.get(segment.seed);
        await runSegment({ ...segment, moves: AFTER_SWAP });
        const before = game.uquiver.quan;
        const otyp = game.uquiver.otyp;

        await runSegment({ ...segment, moves: AFTER_FIRST_SHOT });
        const afterFirst = game.uquiver.quan;
        // throw_obj():265 splits one missile off the stack per shot, so the
        // stack falls by exactly the volley size.
        assert.equal(before - afterFirst, firstVolley,
            `${role(segment)} fired the wrong number of missiles`);
        // Every missile that left is somewhere on the level, because
        // throwit() ends at place_object() and nothing here can break one.
        assert.equal(countOnFloor(otyp), before - afterFirst,
            `${role(segment)} lost a missile between the hand and the floor`);

        await runSegment({ ...segment, moves: AFTER_SECOND_SHOT });
        assert.equal(afterFirst - game.uquiver.quan, secondVolley,
            `${role(segment)} fired the wrong number the second time`);
        assert.equal(countOnFloor(otyp), before - game.uquiver.quan);
    }
});

function countOnFloor(otyp) {
    let total = 0;
    for (let x = 0; x < game.level.objects.length; x++) {
        for (let y = 0; y < (game.level.objects[x]?.length ?? 0); y++) {
            for (const obj of pileAt(x, y)) {
                if (obj.otyp === otyp) total += obj.quan;
            }
        }
    }
    return total;
}

test('a shot lands in the direction it was aimed', async () => {
    // Every segment fires east, so the missiles have to be on the hero's own
    // row and no further west than the hero.
    for (const segment of segments()) {
        await runSegment({ ...segment, moves: AFTER_FIRST_SHOT });
        const otyp = game.uquiver.otyp;
        let seen = 0;
        for (let x = 0; x < game.level.objects.length; x++) {
            for (let y = 0; y < (game.level.objects[x]?.length ?? 0); y++) {
                for (const obj of pileAt(x, y)) {
                    if (obj.otyp !== otyp) continue;
                    seen++;
                    assert.equal(y, game.u.uy, `${role(segment)} row`);
                    assert.ok(x > game.u.ux, `${role(segment)} column`);
                }
            }
        }
        assert.ok(seen > 0, `${role(segment)} left nothing on the floor`);
    }
});

test('the second f skips the swap and shoots at once', async () => {
    for (const segment of segments()) {
        await runSegment({ ...segment, moves: AFTER_FIRST_SHOT });
        const wielded = game.uwep;
        const swapped = game.uswapwep;
        const moves = game.moves;

        await runSegment({ ...segment, moves: AFTER_SECOND_SHOT });
        // dothrow.c:564-565 finds the launcher already wielded, so neither
        // slot moves. AFTER_SECOND_SHOT adds the wait at FIRE_MOVES[5] and
        // then the second `f` with its direction, which is two turns: one for
        // the wait and one for the shot, and none for the `f` itself.
        assert.equal(game.uwep.otyp, wielded.otyp);
        assert.equal(game.uswapwep.otyp, swapped.otyp);
        assert.equal(game.moves, moves + 2,
            `${role(segment)} spent the wrong number of turns on the retry`);
    }
});

test('a cancelled direction prompt fires nothing and costs nothing',
    async () => {
        const [segment] = loadFireCancelRecipe().segments;
        // CANCEL_MOVES is `.f  <ESC>.f.`: the Escape answers the first
        // direction prompt and the `.` answers the second with the hero's own
        // square. Neither spends a turn on the throw.
        assert.equal(CANCEL_MOVES.length, 8);

        await runSegment({ ...segment, moves: CANCEL_MOVES.slice(0, 4) });
        const quivered = game.uquiver.quan;
        const moves = game.moves;

        // throw_obj():95-99 answers ECMD_CANCEL when getdir() answers 0.
        await runSegment({ ...segment, moves: CANCEL_MOVES.slice(0, 5) });
        assert.equal(game.uquiver.quan, quivered);
        assert.equal(game.moves, moves);

        // throw_obj():132-136, "You cannot throw an object at yourself.",
        // answers ECMD_OK, which spends no turn either. The wait between the
        // two is what moves the counter, so it moves exactly once.
        await runSegment({ ...segment, moves: CANCEL_MOVES });
        assert.equal(game.uquiver.quan, quivered);
        assert.equal(game.moves, moves + 1);
    });

test('a shot that lands short of water makes no sound', async () => {
    const [segment] = loadFireBesideLiquidRecipe().segments;
    await runSegment({ ...segment, moves: LIQUID_MOVES });

    // The walk ends on the corridor square the recipe was built around, with
    // the moat two squares south of it. dothrow.c:1794-1802 reads only where
    // the missile lands, so this hero is close enough to a pool for a guard
    // that read the hero's surroundings, or the flight, to sound.
    assert.deepEqual([game.u.ux, game.u.uy], [57, 7]);
    assert.equal(game.level.at(game.u.ux, game.u.uy + 2).typ, MOAT);

    // The shot goes the other way, down a corridor that stays dry, and the
    // arrow is on it rather than in the moat.
    const landed = pileAt(50, 7);
    assert.equal(landed.length, 1);
    assert.equal(landed[0].otyp, ARROW);
    assert.equal(game.level.at(50, 7).typ, CORR);
    assert.equal(pileAt(game.u.ux, game.u.uy + 2).length, 0);

    // weight.h:11 puts an arrow under WT_SPLASH_THRESHOLD, so the message a
    // wrongly wide guard would print here is "Plop!".
    assert.doesNotMatch(game._ttyToplines ?? '', /Splash!|Plop!/u);
});
