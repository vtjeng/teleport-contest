import assert from 'node:assert/strict';
import test from 'node:test';

import { moveloop_core, UnsupportedTurnBoundaryError } from '../js/allmain.js';
import { rhack } from '../js/cmd.js';
import { commandKeyCode } from '../js/command_bindings.js';
import {
    ENERGY_REGENERATION,
    FROMOUTSIDE,
    REGENERATION,
    SEARCHING,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { projected_capacity } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { ttyPline } from '../js/tty_message.js';
import {
    loadFullHealthInterruptRecipe,
} from './run-full-health-interrupt.mjs';
import { completeSecondTurnSnapshot } from './second-turn-snapshot.mjs';

// The segments the matrix in scripts/run-full-health-interrupt.mjs recorded
// against the C reference, replayed here so that a unit assertion and its
// differential describe the same games.
const SEGMENTS = loadFullHealthInterruptRecipe().segments;

// Every segment is a walk onto a bear trap, one key to dismiss the pile the
// trap victim left, and then a counted occupation. This is the same game
// stopped just before the count.
function segmentBeforeCount(segment) {
    const walk = /^(?<walk>[^0-9]+)(?<count>[0-9]+[s.])$/u
        .exec(segment.moves);
    assert.ok(walk, segment.moves);
    return { ...segment, moves: walk.groups.walk };
}

function countOf(segment) {
    return Number(/(?<count>[0-9]+)[s.]$/u.exec(segment.moves)[1]);
}

// The same game as segmentBeforeCount(), with a count of nine typed by hand
// instead of the segment's own forty. cmd.c get_count():5069 echoes
// `Count: %ld` only once the count passes nine, so a count of nine leaves
// gp.prevmsg -- js/tty_message.js keeps it in `_ttyPreviousMessage` -- holding
// whatever printed before the command. That is what makes a second top-up a
// repeat, and the assertion below is the claim itself.
async function startShortCount(segment) {
    const replay = await runSegment(segmentBeforeCount(segment));
    const previous = game._ttyPreviousMessage;
    for (const key of '9s') game.nhDisplay.pushKey(commandKeyCode(key));
    await rhack(0, game);
    assert.ok(game.multi > 0, 'the count leaves repeats owed');
    assert.equal(game._ttyPreviousMessage, previous,
        'a count of nine echoes nothing');
    return replay;
}

// One hit point below the maximum, holding the U_CAN_REGEN() term that makes
// allmain.c regen_hp() add a point whatever its rn2(100) draw returns, so the
// top-up belongs to the next turn rather than to some later one. FROMOUTSIDE
// rather than a bare 1: the low bits of an intrinsic are its timeout, and a
// timeout stops the port at nh_timeout() before regen_hp() is reached.
function armFullHealthTurn() {
    game.u.uhp = game.u.uhpmax - 1;
    game.u.uprops[REGENERATION].intrinsic = FROMOUTSIDE;
}

test('the matrix decides one interrupt_multi term per segment', () => {
    // allmain.c interrupt_multi() is `if (gm.multi > 0 && !svc.context.travel
    // && !svc.context.run) { nomul(0); if (flags.verbose && msg) Norep(...); }`.
    // Two of its terms have a segment each, and losing either would leave the
    // matrix unable to tell an unconditional print from C's.
    const verbose = SEGMENTS.filter(
        (segment) => !/!verbose/u.test(segment.nethackrc),
    );
    assert.equal(SEGMENTS.length - verbose.length, 1, 'one !verbose segment');
    // A count of three runs out before the top-up; every other count is long
    // enough that only the interruption can end it.
    assert.deepEqual(
        SEGMENTS.map(countOf).filter((count) => count < 40),
        [3],
    );
    // Both extcmdlist rows that carry occupation text: cmd.c:1846-1847's
    // searching row and cmd.c:1930-1931's waiting row.
    const rows = SEGMENTS.map((segment) => segment.moves.at(-1));
    assert.ok(rows.includes('s'), 'the searching row spends a count');
    assert.ok(rows.includes('.'), 'the waiting row spends a count');
    // Distinct hero names keep each segment's recorder lock and save file
    // separate, so a segment stopped at a prompt cannot restore into another.
    const names = SEGMENTS.map(
        (segment) => /name:([^,]+)/u.exec(segment.nethackrc)[1],
    );
    assert.equal(new Set(names).size, SEGMENTS.length);
});

test('the matrix covers both elapsed-turn planning shapes', async () => {
    // js/allmain.js advanceElapsedTurn() dry-runs the whole once-per-turn block
    // on a cloned state only when projected_capacity() is positive, and returns
    // straight after random monster generation otherwise. So regen_hp() runs
    // twice on a turn of the first shape and once on a turn of the second, and
    // interrupt_multi() has to stay silent on the planning pass. Both shapes
    // need a segment, and the trap is what creates the first: its
    // WT_WOUNDEDLEG_REDUCT costs the Knight a carrying-capacity threshold.
    const burdened = [];
    for (const segment of SEGMENTS) {
        await runSegment(segmentBeforeCount(segment));
        burdened.push(projected_capacity(game) > 0);
    }
    assert.ok(burdened.includes(true), 'a burdened hero plans the whole turn');
    assert.ok(burdened.includes(false), 'an unburdened hero plans less');
});

test('a topped-up hero ends the count and says so once', async () => {
    for (const segment of SEGMENTS) {
        const label = `${segment.seed} ${segment.moves}`;
        const silent = /!verbose/u.test(segment.nethackrc)
            || countOf(segment) < 40;

        await runSegment(segmentBeforeCount(segment));
        const started = game.moves;
        assert.ok(
            game.u.uhp < game.u.uhpmax,
            `${label}: the trap must leave the hero below full health`,
        );

        await runSegment(segment);
        // regen_hp() reached its last statement: allmain.c calls
        // interrupt_multi() only from `reached_full`.
        assert.equal(game.u.uhp, game.u.uhpmax, label);
        // hack.c nomul(0) spends the count, and cmd.c timed_occupation()
        // uninstalls the occupation on the following turn when it finds no
        // repeat left. Both have happened by the time the segment stops.
        assert.equal(game.multi, 0, label);
        assert.equal(game.go.occupation, null, label);
        // The turns the count actually spent, plus the one moveloop_core()
        // charges before rhack() finds the input queue empty. A count of forty
        // that ends in single figures was cut short by something, and a count
        // of three that spends exactly three was not.
        const spent = game.moves - started - 1;
        if (countOf(segment) < 40) assert.equal(spent, 3, label);
        else assert.ok(spent < 40, `${label}: spent ${spent}`);
        // Norep() writes to a top line no key bounds. cmd.c parse() cleared the
        // physical row when it read the count's committing byte and nothing
        // else prints during the count, so the line stands alone: it neither
        // shares the row with an earlier message nor spends a key on a --More--
        // prompt.
        assert.equal(
            game._pending_message,
            silent ? '' : 'You are in full health.',
            label,
        );
        assert.equal(game.nhDisplay.terminal._inputQueue.length, 0, label);
    }
});

// js/allmain.js finishElapsedTurn() gives the regenerators a Norep() owner
// that is silent while it dry-runs a burdened turn on a cloned state, the way
// it silences every other line that block can write. The clone's state is
// discarded but its GameDisplay is the live one, so a live owner here would
// leave the top line, its logical copy and TOPLINE_NEED_MORE behind on a turn
// the live game has not taken -- and would do it before the live pass writes
// the same line, so the finished turn looks identical and only the stopped one
// shows the difference.
test('a planned top-up announces nothing', async () => {
    // The Knight is the one segment whose trap leaves the hero Burdened, so it
    // is the one whose clone runs the whole once-per-turn block rather than
    // returning after random monster generation.
    const replay = await startShortCount(SEGMENTS[0]);
    assert.ok(projected_capacity(game) > 0,
        'the clone must plan the whole turn');
    assert.equal(game.level.regions.length, 0,
        'a region would stop the plan before regen_hp()');
    armFullHealthTurn();
    // The first planning stop after the two regenerators. A Ranger or an
    // Archeologist carries SEARCHING from experience level 1; this Knight is
    // given it so the plan stops between regen_pw() and the rest of the turn.
    game.u.uprops[SEARCHING].intrinsic = FROMOUTSIDE;

    const before = completeSecondTurnSnapshot(game, replay);
    for (let attempt = 0; attempt < 2; ++attempt) {
        game.context.move = 1;
        await assert.rejects(
            () => moveloop_core(),
            (error) => (
                error instanceof UnsupportedTurnBoundaryError
                && error.message === 'elapsed turn reached '
                    + 'burdened multi-cycle automatic search'
            ),
            `attempt ${attempt}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, replay),
            before,
            `attempt ${attempt}`,
        );
    }

    // The snapshot is the detector; this is what shows the case arrives. With
    // the search property gone the plan runs to the end and the live pass takes
    // the same turn for real: the hero tops up, the count ends, and the line
    // reaches a top row no key bounds.
    game.u.uprops[SEARCHING].intrinsic = 0;
    game.context.move = 1;
    await moveloop_core();
    assert.equal(game.u.uhp, game.u.uhpmax);
    assert.equal(game.multi, 0);
    assert.equal(game._pending_message, 'You are in full health.');
    assert.equal(game.nhDisplay.terminal._inputQueue.length, 0);
});

// pline.c Norep() drops a line equal to gp.prevmsg before the window port sees
// it, and that is the whole difference between the seam the elapsed turn hands
// the regenerators and the ordinary pline() seam beside it. Two counted
// occupations that each end in a top-up reach the comparison, because a count
// of nine echoes nothing between them.
test('a repeated top-up line is suppressed', async () => {
    // An unburdened hero, so the live pass is the only caller and the silent
    // planning owner cannot account for the silence below.
    await startShortCount(SEGMENTS[3]);
    assert.equal(projected_capacity(game), 0);
    armFullHealthTurn();
    // gp.prevmsg as an identical earlier top-up left it.
    game._ttyPreviousMessage = 'You are in full health.';
    const topMessage = game.nhDisplay.topMessage;

    game.context.move = 1;
    await moveloop_core();

    // nomul(0) still spent the count: C prints after it, so suppressing the
    // line cannot suppress the interruption.
    assert.equal(game.u.uhp, game.u.uhpmax);
    assert.equal(game.multi, 0);
    // Nothing reached the top line, logically or physically.
    assert.equal(game._pending_message, '');
    assert.equal(game.nhDisplay.topMessage, topMessage);
    assert.equal(game.nhDisplay.terminal._inputQueue.length, 0);
});

// allmain.c runs regen_hp(), then the overexertion block, then regen_pw(), then
// the automatic search and gethungry(). The port's interruption ends in a
// Norep() that can stop for a --More--, so each regenerator has to be awaited
// where C calls it; one whose promise floated would let the rest of the turn
// run while the line it owes was still going out, and would carry its refusal
// out of the turn entirely.
test('the elapsed turn waits for each regenerator', async () => {
    // pickup.c encumber_msg()'s Burdened line, which the elapsed turn itself
    // writes ahead of the regenerators when the hero's load band changes. It is
    // 56 bytes, so topl.c update_topl() cannot fit the top-up line beside it
    // and Norep() calls more() instead. With no key owed, that stops the turn
    // inside the regenerator.
    const load = 'Your movements are slowed slightly because of your load.';
    for (const [kind, arm] of [
        ['hp', armFullHealthTurn],
        // regen_pw() reaches the same interruption from one power point below
        // the maximum. Energy_regeneration is what makes allmain.c draw off the
        // role cadence, so the turn need not be a multiple of the divisor.
        ['pw', () => {
            game.u.uen = game.u.uenmax - 1;
            game.u.uprops[ENERGY_REGENERATION].intrinsic = FROMOUTSIDE;
        }],
    ]) {
        await startShortCount(SEGMENTS[3]);
        arm();
        await ttyPline(load, game);
        assert.equal(game.nhDisplay.terminal._inputQueue.length, 0, kind);
        const hunger = game.u.uhunger;

        game.context.move = 1;
        await assert.rejects(() => moveloop_core(), /Input queue empty/u, kind);
        // The interruption ran: nomul(0) precedes the line C could not finish.
        assert.equal(game.multi, 0, kind);
        // eat.c gethungry() is the first statement after both regenerators that
        // changes state a turn can be read from, and it did not run.
        assert.equal(game.u.uhunger, hunger, kind);
    }
});
