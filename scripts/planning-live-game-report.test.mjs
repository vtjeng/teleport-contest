// The two entry points' handling of a planning pass's use of `game`
// (js/gstate.js), end to end, on a workspace copy of js/ in which one planned
// call has lost its state: hack.c weight_cap()'s Is_airlevel() check, which
// every planned turn computes. Under runSegmentStrict(), as every local tool
// replays, the use throws. Under the judge's runSegment(), reached here
// through frozen/ps_test_runner.mjs as local scoring reaches it, the use goes
// through to the live game, so the replay still matches the recording, and
// runScorer() attaches the recorded use, which fails the recording.

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

// A recording whose monster turns are planned, and so reach weight_cap().
const RECORDING = 'recordings/exper.c/wraith-drain-loses-warning-planned.session.json';
const SESSION = 'planned.session.json';

function leakingWorkspace(t) {
    const root = createScoringWorkspace(PROJECT_ROOT,
        [{ source: RECORDING, target: SESSION }]);
    t.after(() => removeScoringWorkspace(root));
    const path = join(root, 'js', 'hack.js');
    const source = readFileSync(path, 'utf8');
    const from = '|| Is_airlevel(state.u.uz, state)\n        || (state.u.usteed';
    assert.equal(source.split(from).length, 2, 'hack.js holds one copy of the edited text');
    writeFileSync(path, source.replace(from, '|| Is_airlevel(state.u.uz)\n        || (state.u.usteed'));
    return root;
}

test('runSegmentStrict() throws on a planning use of the live game', async (t) => {
    const root = leakingWorkspace(t);
    const recording = JSON.parse(readFileSync(join(PROJECT_ROOT, RECORDING), 'utf8'));
    const js = await runJsSession(recording, root);
    assert.match(js.error ?? '', /^planning pass reached the live game: read game\.air_level in Is_airlevel /u);
});

test('the judge\'s runSegment() records the use, lets it through, and the scorer fails the game', (t) => {
    const root = leakingWorkspace(t);
    const child = runScorer(root);
    assert.equal(child.status, 0, child.stderr);
    const [result] = parseRunnerBundle(child.stdout).results;
    assert.equal(result.session, SESSION);
    // The use went through to the live game, so the replay matches C.
    assert.equal(result.passed, true);
    assert.equal(result.error, null);
    assert.equal(result.segmentErrors, undefined);
    assert.ok(result.planningLiveGameUses.length > 0);
    assert.ok(result.planningLiveGameUses.every(({ kind, detail, count }) => kind === 'planningLiveGame'
        && /^planning pass reached the live game: read game\.air_level in Is_airlevel .*weight_cap/u.test(detail)
        && count > 0), JSON.stringify(result.planningLiveGameUses));
    assert.match(child.stderr, /^ {2}PLANNING: planned\.session\.json \(planning pass reached the live game: /mu);
    assert.deepEqual(summarizeRecordings({ results: [result] }).failing, [SESSION]);
});
