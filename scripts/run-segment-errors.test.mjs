// js/jsmain.js runSegment(), the judge's entry point, ends a segment on a
// crash and keeps what it captured; runSegmentStrict(), which every other
// local caller imports, rethrows. This is the one file
// scripts/run-segment-imports.test.mjs lets import runSegment itself.
import assert from 'node:assert/strict';
import test from 'node:test';

import { runSegment, runSegmentStrict } from '../js/jsmain.js';

// Any fixed character and clock serve; !legacy and !tutorial remove the two
// startup prompts so that the first moves byte is read as a command.
const START = {
    seed: 4,
    datetime: '20260414173108',
    nethackrc: 'OPTIONS=name:Tetra,role:Valkyrie,race:human,gender:female,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial\n',
};
// Four searches give the segment four input boundaries, and RNG calls, before
// the 0377 command byte, which cmd.js admitParsedCommand() refuses with an
// UnsupportedHeroCommandBoundaryError because nhbell() is not ported. The
// recorder sends each key as UTF-8, so no key is the byte 0377 itself; with
// altmeta, cmd.c readchar_core() makes Escape then DEL (0177) into 0377. The
// trailing search is input the segment never reaches.
const MID_GAME = {
    ...START,
    nethackrc: `${START.nethackrc}OPTIONS=altmeta\n`,
    moves: 'ssss\x1b\x7fs',
};
// options.c parseoptions() accepts a unique prefix of a menu command option;
// js/options.js applyOption() has not ported that match and throws a plain
// Error while start() reads the rc, before any capture.
const START_CRASH = { ...START, nethackrc: `${START.nethackrc}OPTIONS=menu_first_pa:x\n` };

function captured(game) {
    return {
        screens: [...game.getScreens()],
        cursors: game.getCursors().map((cursor) => [...cursor]),
        rng: [...game.getRngLog()],
        animationFrames: [...game.getAnimationFramesByStep()],
    };
}

async function boundaryReference() {
    let boundary = null;
    const game = await runSegmentStrict(MID_GAME, { onBoundary: (error) => { boundary = error; } });
    // If nhbell() is ported, this byte stops being a refusal; choose another
    // input that reaches an Unsupported*Error boundary.
    assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError');
    return captured(game);
}

test('runSegment() ends a segment that crashes partway and keeps its capture', async () => {
    const reference = await boundaryReference();
    // Startup, the four searches and the Escape that altmeta pairs with DEL
    // each wait for input; zero would mean the crash hid every boundary.
    assert.equal(reference.screens.length, 6);
    assert.ok(reference.rng.length > 0);

    // An onBoundary observer that fails is a crash at the boundary: the error
    // leaves playSegment() as any game-code error would.
    const failure = new Error('observer failed');
    const reported = [];
    const game = await runSegment(MID_GAME, {
        onBoundary: () => { throw failure; },
        onError: (error) => reported.push(error),
    });

    assert.deepEqual(captured(game), reference);
    assert.equal(game.segmentError.name, 'Error');
    assert.equal(game.segmentError.message, 'observer failed');
    assert.match(game.segmentError.stack, /observer failed/u);
    assert.deepEqual(reported, [failure]);
});

test('runSegmentStrict() rejects the same crash', async () => {
    await assert.rejects(
        runSegmentStrict(MID_GAME, { onBoundary: () => { throw new Error('observer failed'); } }),
        /observer failed/u,
    );
});

test('runSegment() returns a game that crashed during start()', async () => {
    // A finished segment first, so that a getter still reading process-wide
    // state would return that segment's output.
    const before = await runSegmentStrict({ ...START, moves: 's' });
    assert.ok(before.getScreens().length > 0);

    const game = await runSegment(START_CRASH);
    assert.equal(game.segmentError.message,
        "nethackrc line 3: menu command option 'menu_first_pa' requires its full canonical name");
    assert.deepEqual(game.getScreens(), []);
    assert.deepEqual(game.getCursors(), []);
    assert.deepEqual(game.getAnimationFramesByStep(), []);
    // start() seeds the RNG before it reads the rc and draws nothing in
    // between, so this segment has logged no call.
    assert.deepEqual(game.getRngLog(), []);

    await assert.rejects(runSegmentStrict(START_CRASH), /menu command option 'menu_first_pa'/u);
});

test('runSegment() leaves segmentError null when nothing crashed', async () => {
    const game = await runSegment(MID_GAME);
    assert.equal(game.segmentError, null);
    assert.deepEqual(captured(game), await boundaryReference());
});
