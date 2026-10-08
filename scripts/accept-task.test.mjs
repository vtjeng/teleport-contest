import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { acceptTask, parseAcceptanceArgs } from './accept-task.mjs';
import { COLUMNS, readRows } from './score-log.mjs';
import { createLedger, recordEvent, summarizeLedger } from './worker-state.mjs';
import { challengeInputSnapshot, challengeState, corpusDigest, digest, totalsFor } from './challenge-results.mjs';

test('acceptance requires a task and ledger and rejects unknown options', () => {
    assert.deepEqual(parseAcceptanceArgs(['--task', 'A1', '--ledger', '.cache/ledger.json']),
        { task: 'A1', ledger: '.cache/ledger.json' });
    for (const args of [[], ['--task', 'A1'], ['--task', 'A1', '--ledger', 'x', '--force', 'yes']])
        assert.throws(() => parseAcceptanceArgs(args), /Usage/u);
});

test('acceptance imports reviewed measurements, closes once, and returns the existing worker handle', t => {
    const root = mkdtempSync(join(tmpdir(), 'accept-task-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const scripts = dirname(fileURLToPath(import.meta.url));
    mkdirSync(join(root, 'scripts'));
    // Execute the real CLI consumers. Copy implementation modules, not test fixtures or game data.
    for (const name of readdirSync(scripts).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')))
        copyFileSync(join(scripts, name), join(root, 'scripts', name));
    mkdirSync(join(root, 'frozen'));
    copyFileSync(join(scripts, '../frozen/session_loader.mjs'), join(root, 'frozen/session_loader.mjs'));
    symlinkSync(join(scripts, '../node_modules'), join(root, 'node_modules'));
    const write = (path, value) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), value);
    };
    const json = (path, value) => write(path, JSON.stringify(value));
    write('.gitignore', '.cache/\nnode_modules\nscripts/*\n!scripts/score-challenges.mjs\n');
    json('package.json', { type: 'module' });
    write('SCORE.tsv', COLUMNS.join('\t') + '\n');
    json('GOALS.json', { goals: [{ id: 'fixture-fix', kind: 'divergence-fix', status: 'open',
        summary: 'Transport fixture; no game correctness claim.', cFile: 'fixture.c',
        function: 'fixture', session: 'fixture-session', openStanding: { screens: 1, rng: 1 } }] });
    write('js/fixture.js', 'export const fixture = true;\n');
    // Two boundaries match the partial-result denominator below; no replay runs here.
    const recipe = JSON.stringify({ version: 5, segments: [{ moves: 'i' }] });
    const recording = JSON.stringify({ version: 5, segments: [{ steps: [{ screen: 'start' }, { screen: 'inventory' }] }] });
    write('challenges/cases/partial.recipe.json', recipe);
    write('challenges/cases/partial.session.json', recording);
    const entry = { id: 'partial', title: 'Partial match remains work',
        recipe: 'challenges/cases/partial.recipe.json', recipeSha256: digest(recipe),
        recording: 'challenges/cases/partial.session.json', recordingSha256: digest(recording) };
    json('challenges/manifest.json', { version: 1, cases: [entry] });
    json('challenges/manifests/v2.json', { version: 1, batch: 'v2', cases: [entry] });
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Acceptance fixture',
        '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
        '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-qb', 'main');
    git('add', '.gitignore', 'package.json', 'SCORE.tsv', 'GOALS.json', 'js/fixture.js',
        'scripts/score-challenges.mjs', 'frozen/session_loader.mjs',
        'challenges/manifest.json', 'challenges/manifests/v2.json', entry.recipe, entry.recording);
    git('commit', '-qm', 'Fixture candidate');
    const commit = git('rev-parse', 'HEAD');
    const artifacts = join(root, '.git/checkpoint-results', commit, 'fixture');
    const summary = { commit, executionCommit: commit, artifacts, allPassed: true,
        recordings: { passed: true }, score: {
            passing: 1, sessions: 1, screensMatched: 2, screensTotal: 2,
            rngMatched: 2, rngTotal: 2, cursorsMatched: 2, cursorsTotal: 2,
        } }; // Small counts distinguish the saved result from the goal's opening standing.
    json(`.git/checkpoint-results/${commit}/latest.json`, summary);
    json(`.git/checkpoint-results/${commit}/fixture/summary.json`, summary);
    json(`.git/checkpoint-results/${commit}/fixture/scan-cache.json`, { sha: commit, rows: [] });
    const metrics = { screens: { matched: 1, total: 2 }, rng: { matched: 1, total: 2 },
        cursors: { matched: 1, total: 2 } }; // A measured mismatch must remain available to selection.
    const cases = [{ id: entry.id, recordingSha256: entry.recordingSha256, passed: false, metrics, error: null }];
    const snapshot = challengeInputSnapshot(root, 'v1');
    json(`.git/checkpoint-results/${commit}/fixture/synthetic/ci-v1.json`, {
        version: 1, sha: commit, utc: '2026-10-01T00:00:00.000Z', status: 'complete',
        scorerSha256: digest('fixture scorer'), manifestSha256: corpusDigest(cases),
        inputsSha256: snapshot.sha256, inputFiles: snapshot.files.map(file => file.path),
        cases, totals: totalsFor(cases),
    });
    const second = JSON.parse(readFileSync(join(artifacts, 'synthetic/ci-v1.json'), 'utf8'));
    const secondInputs = challengeInputSnapshot(root, 'v2');
    json(`.git/checkpoint-results/${commit}/fixture/synthetic/ci-v2.json`, {
        ...second, batch: 'v2', manifestPath: 'challenges/manifests/v2.json',
        inputsSha256: secondInputs.sha256, inputFiles: secondInputs.files.map(file => file.path),
    });
    let ledger = createLedger('acceptance-fixture', root);
    let sequence = 0;
    const send = event => { ledger = recordEvent(ledger, { id: `fixture-${++sequence}`, ...event }); };
    send({ type: 'register', worker: 'A', worktree: join(root, 'worker'), branch: 'worker/a',
        base: commit, handle: 'existing-worker' });
    send({ type: 'assign', task: 'A1', worker: 'A', goal: 'fixture-fix', seed: null,
        base: commit, reservations: ['source:fixture.c:fixture'], allowedPaths: ['js/fixture.js'] });
    send({ type: 'ready', task: 'A1', delivery: commit, base: commit, commits: [commit],
        paths: ['js/fixture.js'], evidence: join(root, '.cache/evidence.json'), dependencies: [] });
    send({ type: 'integrating', task: 'A1', integration: commit });
    json('.cache/ledger.json', ledger);
    const options = { task: 'A1', ledger: '.cache/ledger.json' };
    const originalLedger = readFileSync(join(root, options.ledger), 'utf8');
    const originalGoals = readFileSync(join(root, 'GOALS.json'), 'utf8');
    // A dirty implementation must stop before any score or acceptance write.
    write('js/fixture.js', 'export const fixture = false;\n');
    assert.throws(() => acceptTask(options, root), /outside closure/u);
    assert.equal(readRows(join(root, 'SCORE.tsv')).length, 0);
    assert.equal(readFileSync(join(root, options.ledger), 'utf8'), originalLedger);
    assert.equal(readFileSync(join(root, 'GOALS.json'), 'utf8'), originalGoals);
    write('js/fixture.js', 'export const fixture = true;\n');
    // Review and dashboard records do not change the already tested execution inputs.
    for (const path of ['QUALITY.json', 'QUALITY-evidence.json', 'dashboard-snapshot.json'])
        json(path, {});
    rmSync(join(root, 'QUALITY.json'));
    symlinkSync('GOALS.json', join(root, 'QUALITY.json'));
    assert.throws(() => acceptTask(options, root), /outside closure/u);
    rmSync(join(root, 'QUALITY.json'));
    json('QUALITY.json', {}); // Only a regular report qualifies, never a redirect.
    const evaluationPath = `.git/checkpoint-results/${commit}/fixture/synthetic/ci-v1.json`;
    const evaluation = JSON.parse(readFileSync(join(root, evaluationPath), 'utf8'));
    // Each invalid identity must stop before score import, despite a passing checkpoint.
    for (const [changed, error] of [
        [{ sha: 'f'.repeat(40) }, /complete current batch/u],
        [{ manifestSha256: digest('different batch') }, /membership digest mismatch/u],
        [{ inputsSha256: undefined }, /complete current batch/u], // Legacy evidence is not fresh evidence.
        [{ inputsSha256: digest('different inputs') }, /complete current batch/u],
    ]) {
        json(evaluationPath, { ...evaluation, ...changed });
        assert.throws(() => acceptTask(options, root), error);
        assert.equal(readRows(join(root, 'SCORE.tsv')).length, 0);
        assert.equal(readFileSync(join(root, options.ledger), 'utf8'), originalLedger);
    }
    json(evaluationPath, evaluation);
    for (const batch of ['v1', 'v2']) {
        const path = join(artifacts, `synthetic/ci-${batch}.json`);
        const bytes = readFileSync(path);
        rmSync(path); // Remove only this disposable fixture artifact to simulate an incomplete download.
        assert.throws(() => acceptTask(options, root), /missing reviewed synthetic batch/u);
        assert.equal(readRows(join(root, 'SCORE.tsv')).length, 0);
        assert.equal(readFileSync(join(root, options.ledger), 'utf8'), originalLedger);
        writeFileSync(path, bytes);
    }
    // Fail the real goal command after import, then resume without duplicate scores/events.
    const brokenGoals = JSON.parse(originalGoals);
    brokenGoals.goals[0].summary = '';
    json('GOALS.json', brokenGoals);
    assert.throws(() => acceptTask(options, root), /needs a summary/u);
    assert.deepEqual(readRows(join(root, 'SCORE.tsv')).map(row => row.event), ['challenge', 'challenge']);
    assert.equal(summarizeLedger(JSON.parse(readFileSync(join(root, '.cache/ledger.json'), 'utf8')))
        .tasks.A1.status, 'validated');
    write('GOALS.json', originalGoals);
    const validatedLedger = readFileSync(join(root, options.ledger), 'utf8');
    const importedRows = readFileSync(join(root, 'SCORE.tsv'), 'utf8');
    for (const path of ['js/fixture.js', 'scripts/score-challenges.mjs']) {
        const before = readFileSync(join(root, path), 'utf8');
        write(path, before + '\n'); // A tracked game or tooling edit invalidates a validated retry too.
        assert.throws(() => acceptTask(options, root), /outside closure/u);
        assert.equal(readFileSync(join(root, options.ledger), 'utf8'), validatedLedger);
        assert.equal(readFileSync(join(root, 'SCORE.tsv'), 'utf8'), importedRows);
        assert.equal(readFileSync(join(root, 'GOALS.json'), 'utf8'), originalGoals);
        write(path, before);
    }
    for (const changed of [{ allPassed: false }, { commit: 'e'.repeat(40) }]) {
        json(`.git/checkpoint-results/${commit}/latest.json`, { ...summary, ...changed });
        assert.throws(() => acceptTask(options, root), /passing checkpoint at HEAD/u);
        assert.equal(readFileSync(join(root, options.ledger), 'utf8'), validatedLedger);
        assert.equal(readFileSync(join(root, 'SCORE.tsv'), 'utf8'), importedRows);
        assert.equal(readFileSync(join(root, 'GOALS.json'), 'utf8'), originalGoals);
    }
    json(`.git/checkpoint-results/${commit}/latest.json`, summary);
    const wrongCoordinator = JSON.parse(validatedLedger);
    wrongCoordinator.coordinatorRoot = join(root, 'other-coordinator');
    json('.cache/ledger.json', wrongCoordinator);
    const wrongLedger = readFileSync(join(root, options.ledger), 'utf8');
    assert.throws(() => acceptTask(options, root), /belong to this coordinator/u);
    assert.equal(readFileSync(join(root, options.ledger), 'utf8'), wrongLedger);
    assert.equal(readFileSync(join(root, 'SCORE.tsv'), 'utf8'), importedRows);
    assert.equal(readFileSync(join(root, 'GOALS.json'), 'utf8'), originalGoals);
    write('.cache/ledger.json', validatedLedger);
    const wrongIntegration = JSON.parse(validatedLedger);
    wrongIntegration.events.find(event => event.type === 'integrating').integration = 'd'.repeat(40);
    json('.cache/ledger.json', wrongIntegration);
    assert.throws(() => acceptTask(options, root), /integrated HEAD/u);
    assert.deepEqual(JSON.parse(readFileSync(join(root, options.ledger), 'utf8')), wrongIntegration);
    assert.equal(readFileSync(join(root, 'SCORE.tsv'), 'utf8'), importedRows);
    assert.equal(readFileSync(join(root, 'GOALS.json'), 'utf8'), originalGoals);
    write('.cache/ledger.json', validatedLedger);
    // A later run at the same HEAD must not replace the result already validated.
    json(`.git/checkpoint-results/${commit}/latest.json`, {
        ...summary, artifacts: join(artifacts, 'later-run'), score: { ...summary.score, screensMatched: 0 },
    });
    assert.throws(() => acceptTask(options, root), /checkpoint changed after validation/u);
    assert.equal(readFileSync(join(root, options.ledger), 'utf8'), validatedLedger);
    assert.equal(readFileSync(join(root, 'SCORE.tsv'), 'utf8'), importedRows);
    assert.equal(readFileSync(join(root, 'GOALS.json'), 'utf8'), originalGoals);
    json(`.git/checkpoint-results/${commit}/latest.json`, summary);
    const receipt = acceptTask(options, root);
    assert.equal(receipt.handle, 'existing-worker');
    assert.equal(receipt.commit, commit);
    const rows = readRows(join(root, 'SCORE.tsv'));
    assert.deepEqual(rows.map(row => row.event), ['challenge', 'challenge', 'goal']);
    assert.equal(rows[2].screens_matched, '2');
    assert.equal(challengeState(root, rows, commit).status, 'measured');
    const goal = JSON.parse(readFileSync(join(root, 'GOALS.json'), 'utf8')).goals[0];
    assert.equal(goal.status, 'closed');
    assert.equal(goal.closedAt, commit);
    const accepted = JSON.parse(readFileSync(join(root, '.cache/ledger.json'), 'utf8'));
    assert.equal(summarizeLedger(accepted).tasks.A1.status, 'accepted');
    assert.deepEqual(acceptTask(options, root), receipt);
    assert.deepEqual(readRows(join(root, 'SCORE.tsv')), rows);
    assert.deepEqual(JSON.parse(readFileSync(join(root, '.cache/ledger.json'), 'utf8')), accepted);
    json(`.git/checkpoint-results/${commit}/latest.json`, {
        ...summary, artifacts: join(artifacts, 'later-run'),
    });
    assert.deepEqual(acceptTask(options, root), receipt); // Recover an accepted receipt from its original checkpoint.
    assert.deepEqual(readRows(join(root, 'SCORE.tsv')), rows);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'GOALS.json'), 'utf8')).goals[0], goal);
    assert.deepEqual(JSON.parse(readFileSync(join(root, '.cache/ledger.json'), 'utf8')), accepted);

    // Reuse this disposable repository for preparation; no extra Git history is needed.
    for (const path of ['QUALITY.json', 'QUALITY-evidence.json', 'dashboard-snapshot.json'])
        rmSync(join(root, path)); // Remove this test's implementation closure reports.
    write('GOALS.json', originalGoals);
    write('SCORE.tsv', COLUMNS.join('\t') + '\n');
    for (const batch of ['v1', 'v2'])
        rmSync(join(root, `challenges/evaluations/accepted-${commit}-${batch}.json`));
    json(`.git/checkpoint-results/${commit}/latest.json`, summary);
    const preparation = JSON.parse(originalLedger);
    const assignment = preparation.events.find(event => event.type === 'assign');
    delete assignment.goal;
    assignment.kind = 'challenge-preparation';
    assignment.reservations = ['challenge-batch:v3']; // v1 and v2 are already admitted.
    assignment.allowedPaths = ['challenges/cases/v3/'];
    preparation.events.find(event => event.type === 'ready').paths = ['challenges/cases/v3/new.recipe.json'];
    json('.cache/ledger.json', preparation);
    for (const path of ['GOALS.json', 'SCORE.tsv']) {
        const before = readFileSync(join(root, path), 'utf8');
        write(path, before + '\n'); // Valid but uncheckpointed central-record edit.
        assert.throws(() => acceptTask(options, root), /outside closure/u);
        assert.deepEqual(JSON.parse(readFileSync(join(root, options.ledger), 'utf8')), preparation);
        write(path, before);
    }
    const preparationReceipt = acceptTask(options, root);
    assert.equal(preparationReceipt.handle, 'existing-worker');
    const preparationAccepted = JSON.parse(readFileSync(join(root, options.ledger), 'utf8'));
    assert.equal(summarizeLedger(preparationAccepted).tasks.A1.status, 'accepted');
    assert.deepEqual(acceptTask(options, root), preparationReceipt);
    assert.deepEqual(JSON.parse(readFileSync(join(root, options.ledger), 'utf8')), preparationAccepted);
    assert.equal(readFileSync(join(root, 'GOALS.json'), 'utf8'), originalGoals);
    assert.equal(readRows(join(root, 'SCORE.tsv')).length, 0);
});
