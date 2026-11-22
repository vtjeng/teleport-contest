// A level program that #wizloadlua runs (wizcmds.c wiz_load_lua() ->
// nhlua.c load_lua()) runs each des.* call to completion before the next
// statement, as Lua calls the sp_lev.c lspo_*() functions. In the recording
// below, des.monster()'s appearance message for the wolf raises --More--
// in the middle of dat/tut-1.lua, so C draws the later des.object() calls'
// random numbers only after the key that dismisses it. The judge compares
// the random numbers as one flat sequence, which kept the same order when
// js/tutorial_level.js did not wait for des.monster(); the per-step slices
// show where each call falls relative to the input wait.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { normalizeSession } from '../frozen/session_loader.mjs';

const SESSION = new URL(
    '../recordings/sp_lev.c/wizloadlua-tut1-appearance-more.session.json',
    import.meta.url,
);

test('#wizloadlua tut-1 draws each step\'s random numbers where C does', async () => {
    const recorded = normalizeSession(JSON.parse(readFileSync(SESSION, 'utf8')));
    const segment = recorded.segments[0];
    const replay = await runSegment(segment);
    const slices = replay.getRngSlices();
    const expected = segment.steps.map((step) => (step.rng ?? []).length);
    assert.deepEqual(slices.map((slice) => slice.length), expected);
    // Step 35 is the Return that loads tut-1: 69 draws, from nhlib.lua's
    // shuffle through the wolf's creation, before the wolf's appearance
    // message, which does not fit beside "A lichen suddenly appears!  A
    // yellow mold suddenly appears!", raises --More--. Step 36 is the space
    // that dismisses it; the wolf's message and the program's remaining 80
    // draws follow.
    assert.equal(segment.steps[35].key, '\n');
    assert.deepEqual([expected[35], expected[36]], [69, 80]);
});
