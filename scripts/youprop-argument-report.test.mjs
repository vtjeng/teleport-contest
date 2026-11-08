// The two entry points' handling of a js/youprop.js macro given the wrong
// argument, end to end, on a workspace copy of js/ in which one call passes
// the game state where the hero belongs: allmain.c moveloop_core()'s Blind
// test, in js/allmain.js moveloop_core_body(), which every turn reaches.
// Under runSegmentStrict(), as every local tool replays, the call throws. Under the judge's runSegment(), reached
// here through frozen/ps_test_runner.mjs as local scoring reaches it, the
// macro reads state.u instead, so the replay still matches the recording,
// and runScorer() attaches the recorded use, which fails the recording.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { runJsSession } from './diff-fresh.mjs';
import { summarizeRecordings } from './score-recordings.mjs';
import {
    createScoringWorkspace,
    parseRunnerBundle,
    PROJECT_ROOT,
    removeScoringWorkspace,
    runScorer,
} from './scoring-workspace.mjs';

// Any recording whose turns run moveloop_core(); this one is short.
const RECORDING = 'recordings/exper.c/wraith-drain-loses-warning-planned.session.json';
const SESSION = 'argument.session.json';

function misusingWorkspace(t) {
    const root = createScoringWorkspace(PROJECT_ROOT,
        [{ source: RECORDING, target: SESSION }]);
    t.after(() => removeScoringWorkspace(root));
    const path = join(root, 'js', 'allmain.js');
    const source = readFileSync(path, 'utf8');
    const from = '    const blind = Blind(g.u);\n';
    assert.equal(source.split(from).length, 2, 'allmain.js holds one copy of the edited text');
    writeFileSync(path, source.replace(from, '    const blind = Blind(g);\n'));
    return root;
}

test('runSegmentStrict() throws on a youprop.js macro given the game state', async (t) => {
    const root = misusingWorkspace(t);
    const recording = JSON.parse(readFileSync(join(PROJECT_ROOT, RECORDING), 'utf8'));
    const js = await runJsSession(recording, root);
    assert.match(js.error ?? '',
        /youprop\.js Blind\(\) was given the game state in place of the hero \(state\.u\), in moveloop_core_body \(allmain\.js\)/u);
});

test('the judge\'s runSegment() records the misuse, answers for state.u, and the scorer fails the game', (t) => {
    const root = misusingWorkspace(t);
    const child = runScorer(root);
    assert.equal(child.status, 0, child.stderr);
    const [result] = parseRunnerBundle(child.stdout).results;
    assert.equal(result.session, SESSION);
    // Blind() read state.u, so the replay matches C.
    assert.equal(result.passed, true);
    assert.equal(result.error, null);
    assert.equal(result.segmentErrors, undefined);
    assert.equal(result.argumentMisuses.length, 1, JSON.stringify(result.argumentMisuses));
    const [use] = result.argumentMisuses;
    assert.equal(use.kind, 'youpropArgument');
    assert.match(use.detail,
        /^youprop\.js Blind\(\) was given the game state in place of the hero \(state\.u\), in moveloop_core_body \(allmain\.js\)$/u);
    assert.ok(use.count > 0);
    assert.match(child.stderr, /^ {2}ARGUMENT MISUSE: argument\.session\.json \(youprop\.js Blind\(\) /mu);
    assert.deepEqual(summarizeRecordings({ results: [result] }).failing, [SESSION]);
});
