// zap.c bhit()'s web arm driven end to end through js/jsmain.js runSegment(),
// over the same recipe scripts/run-bhit-web.mjs records against the C
// reference. The differential compares screens and random-number calls; this
// file asserts the game state behind those screens, so a change that keeps the
// screens and moves an arrow, the hero or a turn fails here.
//
// scripts/bhit.test.mjs pins the same arm over a hand-built corridor, with all
// three values of the draw injected. What it cannot show is that a running
// game reaches the arm at all, which is what these two segments add.
//
// The recipe assertions come first. They read the recipe rather than the
// recording, so a silent re-recording that stopped covering the arm fails here
// instead of passing a differential against a weaker case.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BHIT_WEB_CASES,
    FIRING_SPOT,
    SEED,
    START,
    WEBS,
    loadBhitWebRecipe,
} from './run-bhit-web.mjs';
import { ARROW } from '../js/objects.js';
import { WEB, ZAP_POS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { t_at } from '../js/trap.js';

function segmentFor(label) {
    const index = BHIT_WEB_CASES.findIndex((entry) => entry.label === label);
    assert.ok(index >= 0, `no case labelled ${label}`);
    return loadBhitWebRecipe().segments[index];
}

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The arrows lying on each of the matrix's three webs, and whether the web has
// been found. `[]` is a web no arrow reached.
function websState() {
    return WEBS.map(({ x, y }) => {
        const trap = t_at(x, y, game);
        const arrows = [];
        for (let obj = game.level.objects[x]?.[y]; obj; obj = obj.nexthere)
            if (obj.otyp === ARROW) arrows.push(obj.quan);
        return { tseen: trap.tseen, arrows };
    });
}

// How many animation frames each input boundary produced, which is the same
// per-step series scripts/diff-fresh.mjs compares against the C recording.
function framesPerStep(replay) {
    return replay.getAnimationFramesByStep().map((frames) => frames.length);
}

test('the web matrix is two shots one keystroke apart', () => {
    const recipe = loadBhitWebRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    assert.deepEqual(BHIT_WEB_CASES.map(({ label }) => label),
        ['caught', 'through']);
    assert.deepEqual(BHIT_WEB_CASES.map(({ moves }) => moves),
        ['.lllllf  l .', '.lllll.f  l .']);
    // The extra wait is the only difference, so whatever separates the two
    // outcomes came out of the random-number stream rather than out of the
    // inputs.
    assert.equal(
        BHIT_WEB_CASES[1].moves.replace('.f', 'f'), BHIT_WEB_CASES[0].moves,
    );
    assert.ok(recipe.segments.every(({ seed }) => seed === SEED));
    // A pet in the firing line would reach thitmonst() instead of the web.
    assert.ok(recipe.segments.every(
        ({ nethackrc }) => nethackrc.includes('pettype:none'),
    ));
});

test('the shot crosses clear floor to three unseen webs', async () => {
    const segment = segmentFor('caught');
    await runSegment({ ...segment, moves: '.' });
    assert.deepEqual({ x: game.u.ux, y: game.u.uy }, { x: START.x, y: START.y });

    await runSegment({ ...segment, moves: '.lllll' });
    assert.deepEqual({ x: game.u.ux, y: game.u.uy },
        { x: FIRING_SPOT.x, y: FIRING_SPOT.y });
    // Everything between the hero and the third web is floor with no trap on
    // it, so the first web the arrows meet is WEBS[0] and nothing else can
    // stop them short of it.
    for (let x = FIRING_SPOT.x + 1; x < WEBS[0].x; ++x) {
        assert.ok(ZAP_POS(game.level.at(x, FIRING_SPOT.y).typ), `floor ${x}`);
        assert.equal(t_at(x, FIRING_SPOT.y, game), null, `trap ${x}`);
    }
    for (const { x, y } of WEBS)
        assert.equal(t_at(x, y, game).ttyp, WEB, `web ${x},${y}`);
    assert.deepEqual(websState(), [
        { tseen: false, arrows: [] },
        { tseen: false, arrows: [] },
        { tseen: false, arrows: [] },
    ]);
    // The volley is two arrows out of the quivered stack of 50.
    assert.equal(game.uquiver.otyp, ARROW);
    assert.equal(game.uquiver.quan, 50);
});

test('a draw of zero stops the arrow on the web it reached', async () => {
    const segment = segmentFor('caught');
    await runSegment({ ...segment, moves: '.lllll' });
    const beforeMoves = game.moves;

    // zap.c:3934-3936 prints the line, marks the trap seen and repaints the
    // square, then breaks out of the walk.
    await runSegment({ ...segment, moves: '.lllllf  l' });
    assert.equal(
        topLine(),
        'You shoot 2 arrows.  The arrow gets stuck in a web!--More--',
    );

    const replay = await runSegment({ ...segment, moves: segment.moves });
    // Both arrows drew 0 at the first web, so both stopped on it and neither
    // reached the second. The third web is the control: no arrow of either
    // segment gets that far, so it stays unseen and bare in both.
    assert.deepEqual(websState(), [
        { tseen: true, arrows: [2] },
        { tseen: false, arrows: [] },
        { tseen: false, arrows: [] },
    ]);
    assert.equal(game.uquiver.quan, 48);
    // The swap turn, the shot's turn and the settling wait.
    assert.equal(game.moves, beforeMoves + 3);
    // bhit() flashes the missile once per square it enters and calls
    // nh_delay_output() there, so the frame count is how far the two arrows
    // flew: seven squares of floor each, then the web square for the first.
    assert.deepEqual(framesPerStep(replay).at(-3), 14);
});

test('a nonzero draw carries the arrow through the web', async () => {
    const segment = segmentFor('through');
    await runSegment({ ...segment, moves: '.lllll.' });
    const beforeMoves = game.moves;

    const replay = await runSegment({ ...segment, moves: segment.moves });
    // One wait earlier in the stream and the second arrow's draw at the first
    // web is no longer 0: zap.c leaves the trap alone and the walk carries on,
    // so that arrow stops on the second web instead. The first arrow is
    // unchanged, which is what shows the two draws are separate.
    assert.deepEqual(websState(), [
        { tseen: true, arrows: [1] },
        { tseen: true, arrows: [1] },
        { tseen: false, arrows: [] },
    ]);
    assert.equal(game.uquiver.quan, 48);
    assert.equal(game.moves, beforeMoves + 3);
    // One more square than the `caught` segment, which is the square the
    // second arrow crossed after the web let it through.
    assert.deepEqual(framesPerStep(replay).at(-3), 15);
});
