import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { projected_capacity } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadFullHealthInterruptRecipe,
} from './run-full-health-interrupt.mjs';

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
