// js/rng.js, "Queued output": a line the port queues from synchronous code
// must print before the game's next core random-number draw or key read,
// the points where C's order shows. checkQueuedOutput() records each draw
// and key read that finds a line still queued; runSegmentStrict() fails on
// them and runSegment() reports them, and scripts/score-recordings.mjs fails
// a recording that has any. These checks show that the detector fires on
// exactly that case, so a replay that passes did not pass by not looking.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import {
    checkQueuedOutput, enableRngLog, initRng, queuedOutputViolations, resetQueuedOutput, rn2, rnd,
} from '../js/rng.js';
import { noticesQueued } from '../js/tty_message.js';

function withQueue(notices, body) {
    const saved = {
        notices: game._glyphUpdateNotices,
        emitting: game._emittingGlyphUpdateNotices,
    };
    game._glyphUpdateNotices = notices;
    try {
        body();
    } finally {
        game._glyphUpdateNotices = saved.notices;
        game._emittingGlyphUpdateNotices = saved.emitting;
    }
}

test('a core draw with a line queued is recorded', () => {
    // Seed 7 is arbitrary; the check reads only the queue, not the values.
    initRng(7);
    enableRngLog();
    resetQueuedOutput();
    // An empty queue records nothing.
    withQueue([], () => rn2(10));
    assert.equal(queuedOutputViolations().count, 0);
    // Two draws with one notice queued (the shape of a mention_map line
    // queued by a synchronous newsym()) record two violations.
    withQueue([{ message: 'A fountain.' }], () => {
        rn2(10);
        rnd(6);
    });
    const found = queuedOutputViolations();
    assert.equal(found.count, 2);
    assert.equal(found.kept[0].kind, 'rng');
    assert.match(found.kept[0].detail, /^rn2\(10\)=\d+ with 1 queued$/u);
    assert.match(found.kept[1].detail, /^rnd\(6\)=\d+ with 1 queued$/u);
    resetQueuedOutput();
});

test('a draw made while the queue drains is recorded; a key read is not', () => {
    // emitGlyphUpdateNotices() takes the lines off the queue before it
    // prints them, and the printed lines draw no core random number, so a
    // draw then comes from a chain running beside the drain. The key read is
    // the line's own --More--.
    initRng(7);
    enableRngLog();
    resetQueuedOutput();
    withQueue([], () => {
        game._emittingGlyphUpdateNotices = true;
        rn2(3);
        checkQueuedOutput('key', 'a key read');
    });
    const found = queuedOutputViolations();
    assert.equal(found.count, 1);
    assert.match(found.kept[0].detail, /^rn2\(3\)=\d+ during a drain$/u);
    resetQueuedOutput();
});

test('only the first 20 violations are kept, but all are counted', () => {
    // 25 draws exceed the 20 the check keeps for the report.
    initRng(7);
    enableRngLog();
    resetQueuedOutput();
    withQueue([{ message: 'x', impossible: true }], () => {
        for (let i = 0; i < 25; i++) rn2(2);
    });
    const found = queuedOutputViolations();
    assert.equal(found.count, 25);
    assert.equal(found.kept.length, 20);
    resetQueuedOutput();
});

test('noticesQueued() is true only for a queued line outside a drain', () => {
    // The flush after a synchronous draw awaits only when this is true.
    withQueue([], () => assert.equal(noticesQueued(), false));
    withQueue(undefined, () => assert.equal(noticesQueued(), false));
    withQueue([{ message: 'A sink.' }], () => {
        assert.equal(noticesQueued(), true);
        game._emittingGlyphUpdateNotices = true;
        assert.equal(noticesQueued(), false);
    });
});
