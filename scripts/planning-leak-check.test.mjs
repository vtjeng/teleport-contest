// scripts/planning-leak-check.mjs replays recordings in an instrumented
// workspace and fails when a planning pass reaches the live game. These tests
// replay a few recordings whose turns are planned, first as the port stands
// (no leak), then with a leak injected into the workspace copy, which the
// check must report.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { GUARD_ERROR, runPlanningLeakCheck } from './planning-leak-check.mjs';
import { PROJECT_ROOT } from './scoring-workspace.mjs';

// Monster turns are planned in both recordings. The meal one also plans a
// finished floor meal, whose delobj() repaints the square (eat.c
// done_eating() -> invent.c delobj_core() -> newsym()), and both plan
// weight_cap() for the hero's capacity on every turn.
const RECORDINGS = [
    'recordings/exper.c/wraith-drain-loses-warning-planned.session.json',
    'recordings/eat.c/dochugw-finishes-floor-meal.session.json',
].map((path) => join(PROJECT_ROOT, path));

// Where planSimpleMonsterTurn() starts, with the clone in scope as `planned`.
const PLAN_START = '    let somebodyCanMove;\n';

function edit(root, file, from, to) {
    const path = join(root, 'js', file);
    const source = readFileSync(path, 'utf8');
    assert.equal(source.split(from).length, 2, `${file} holds one copy of the edited text`);
    writeFileSync(path, source.replace(from, to));
}

const findingsOf = (failing) => failing.flatMap(({ findings }) => findings);

test('the recordings plan without leaking', async () => {
    const { rows, failing } = await runPlanningLeakCheck(RECORDINGS);
    assert.equal(rows.length, RECORDINGS.length);
    assert.deepEqual(failing, []);
    for (const row of rows) assert.equal(row.jsError, null, row.file);
});

test('a planned write to the shared message state is reported', async () => {
    const { failing } = await runPlanningLeakCheck(RECORDINGS, {
        prepare: (root) => edit(root, 'unported_monster_actions.js', PLAN_START,
            `${PLAN_START.trimEnd()} planned.nhDisplay.topMessage = 'planning leak';\n`),
    });
    assert.equal(failing.length, RECORDINGS.length);
    assert.ok(findingsOf(failing).every((f) => f.startsWith('displayMessageState at ')), JSON.stringify(failing));
});

test('a planned draw from the live core stream is reported', async () => {
    // The clone keeps the live state's coreCtx; only the context the planner
    // installs is its own copy.
    const { failing } = await runPlanningLeakCheck(RECORDINGS, {
        prepare: (root) => edit(root, 'unported_monster_actions.js', PLAN_START,
            `${PLAN_START.trimEnd()} createCoreRandom(planned.coreCtx, planned).rn2(2);\n`),
    });
    assert.equal(failing.length, RECORDINGS.length);
    assert.ok(findingsOf(failing).some((f) => f.startsWith('coreRng at ')), JSON.stringify(failing));
});

test('a planned call that forgets its state is reported through the guard', async () => {
    const { failing } = await runPlanningLeakCheck(RECORDINGS, {
        prepare: (root) => edit(root, 'hack.js',
            '|| Is_airlevel(state.u.uz, state)\n        || (state.u.usteed',
            '|| Is_airlevel(state.u.uz)\n        || (state.u.usteed'),
    });
    assert.equal(failing.length, RECORDINGS.length);
    assert.ok(findingsOf(failing).every((f) => f.includes(GUARD_ERROR) && f.includes('Is_airlevel')), JSON.stringify(failing));
});

test('a planned repaint is reported when newsym() stops dropping it', async () => {
    const { failing } = await runPlanningLeakCheck(RECORDINGS.slice(1), {
        prepare: (root) => edit(root, 'display.js',
            '    if (planningContextInstalled()) return; globalThis.__leakNewsym?.(x, y);\n',
            '    globalThis.__leakNewsym?.(x, y);\n'),
    });
    assert.ok(findingsOf(failing).some((f) => f.startsWith('newsym at invent.js:')), JSON.stringify(failing));
});
