import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLedger, recordEvent, summarizeLedger} from '../worker-state.mjs';
import {challengeInputSnapshot, corpusDigest, digest, totalsFor} from '../challenge-results.mjs';
import {COLUMNS} from '../score-log.mjs';

export function handoffFixture(t, { preparation = false, acceptance = false, fixedTarget = false,
    scriptsRoot = dirname(dirname(fileURLToPath(import.meta.url))) } = {}) {
    const parent = mkdtempSync(join(tmpdir(), 'task-handoff-'));
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'main');
    mkdirSync(root);
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const write = (path, bytes) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), bytes);
    };
    const json = (path, value) => write(path, JSON.stringify(value));
    if (acceptance) {
        const scripts = scriptsRoot;
        mkdirSync(join(root, 'scripts'));
        for (const name of readdirSync(scripts).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')))
            copyFileSync(join(scripts, name), join(root, 'scripts', name));
        mkdirSync(join(root, 'frozen'));
        copyFileSync(join(scripts, '../frozen/session_loader.mjs'), join(root, 'frozen/session_loader.mjs'));
        symlinkSync(join(scripts, '../node_modules'), join(root, 'node_modules'));
        json('package.json', { type: 'module' });
        json('GOALS.json', { goals: [{ id: 'A1', kind: fixedTarget ? 'divergence-fix' : 'file-port',
            status: fixedTarget ? 'open' : 'queued',
            summary: 'Improve the target; this fixture makes no source-completeness claim.',
            cFile: 'fixture.c', functions: [{ name: 'fixture' }],
            ...(fixedTarget ? { function: 'fixture', session: 'fixture-0' } : {}) }] });
        json('.cache/evidence.json', { functions: [{ name: 'fixture', sourceReview: 'Worker claim only.' }],
            entryPointReview: 'Fixture delivery claim.', entryPoints: [] });
    }
    git('init', '-qb', 'main');
    git('config', 'user.name', 'Handoff fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    write('.gitignore', '.cache/\nnode_modules\nscripts/\nfrozen/\n');
    write('js/fixture.js', 'export const fixture = true;\n');
    write('SCORE.tsv', COLUMNS.join('\t') + '\n');
    const recipe = JSON.stringify({ version: 5, segments: [{ moves: 'i' }] });
    // Two screens permit a partial baseline and a full candidate without replay.
    const recording = JSON.stringify({ version: 5, segments: [{ steps: [{ screen: 'start' }, { screen: 'inventory' }] }] });
    const entry = { id: 'case', title: 'Independent transport fixture',
        recipe: 'challenges/cases/case.recipe.json', recipeSha256: digest(recipe),
        recording: 'challenges/cases/case.session.json', recordingSha256: digest(recording) };
    write(entry.recipe, recipe); write(entry.recording, recording);
    json('challenges/manifest.json', { version: 1, cases: [entry] });
    git('add', '.gitignore', 'js/fixture.js', 'SCORE.tsv', entry.recipe, entry.recording, 'challenges/manifest.json');
    if (acceptance) git('add', 'package.json', 'GOALS.json');
    git('commit', '-qm', 'Fixture baseline');
    const baseline = git('rev-parse', 'HEAD');
    const candidatePath = preparation ? 'challenges/cases/v2/pending.recipe.json' : 'js/fixture.js';
    write(candidatePath, preparation ? recipe : 'export const fixture = false;\n');
    git('add', candidatePath); git('commit', '-qm', 'Fixture candidate');
    const candidate = git('rev-parse', 'HEAD');
    git('init', '--bare', '-q', join(parent, 'remote.git'));
    git('remote', 'add', 'origin', join(parent, 'remote.git'));
    git('push', '-q', 'origin', `${baseline}:refs/heads/main`); // This is only a disposable filesystem remote.
    function checkpoint(commit, matched) {
        const relative = `.git/checkpoint-results/${commit}/fixture`;
        const artifacts = join(root, relative);
        const cases = [{ id: entry.id, recordingSha256: entry.recordingSha256,
            passed: matched === 2, error: null, metrics: Object.fromEntries(['screens', 'rng', 'cursors']
                .map(key => [key, { matched, total: 2 }])) }];
        json(`${relative}/synthetic/v1.json`, { version: 1, sha: commit, utc: '2026-10-01T00:00:00Z',
            status: 'complete', scorerSha256: digest('same fixture scorer'),
            manifestSha256: corpusDigest(cases), inputsSha256: challengeInputSnapshot(root, 'v1').sha256,
            cases, totals: totalsFor(cases) });
        // task-verdict requires the actual 44-session shape and matching hash,
        // not just aggregate counts. Each fixture session has one of two matches.
        const results = { results: Array.from({ length: 44 }, (_, index) => ({ session: `fixture-${index}.session.json`,
            passed: fixedTarget && index === 0 && matched === 2,
            metrics: Object.fromEntries(['screens', 'rngCalls', 'cursors']
                .map(key => [key, { matched: fixedTarget && index === 0 ? matched : 1, total: 2 }])) })) };
        const bytes = JSON.stringify(results);
        write(`${relative}/session-results.json`, bytes);
        const summary = { commit, executionCommit: commit, artifacts, allPassed: true, recordings: { passed: true },
            timestamp: '2026-10-01T00:00:00Z', artifactHashes: { 'session-results.json': digest(bytes) },
            score: { sessions: 44, passing: fixedTarget && matched === 2 ? 1 : 0,
                screensMatched: fixedTarget ? 43 + matched : 44, screensTotal: 88,
                rngMatched: fixedTarget ? 43 + matched : 44, rngTotal: 88,
                cursorsMatched: fixedTarget ? 43 + matched : 44, cursorsTotal: 88 } };
        json(`${relative}/summary.json`, summary);
        json(`.git/checkpoint-results/${commit}/latest.json`, summary);
        json(`${relative}/scan-cache.json`, { sha: commit, rows: [] });
        return join(artifacts, 'summary.json');
    }
    const baselineCheckpoint = checkpoint(baseline, 1), candidateCheckpoint = checkpoint(candidate, 2);
    let ledger = createLedger('loop-20261009', root), sequence = 0;
    const send = event => {
        ledger = recordEvent(ledger, { id: `fixture-${++sequence}`, ...event });
        json('.cache/ledger.json', ledger);
    };
    send({ type: 'register', worker: 'A', worktree: join(parent, 'worker'), branch: 'worker/a', base: baseline, handle: 'existing-A' });
    for (const [task, commit, summary] of [['A0', baseline, baselineCheckpoint], ['A1', candidate, candidateCheckpoint]]) {
        const prep = preparation && task === 'A1';
        let evidence = join(root, '.cache/evidence.json');
        if (acceptance) {
            const packet = { ...JSON.parse(readFileSync(evidence, 'utf8')), git: { head: commit, base: baseline } };
            evidence = join(root, `.cache/${digest(JSON.stringify(packet))}.json`);
            writeFileSync(evidence, JSON.stringify(packet));
        }
        send({ type: 'assign', task, worker: 'A', ...(prep ? { kind: 'challenge-preparation' } : { goal: task }),
            seed: prep || task === 'A0' ? null : fixedTarget ? 'fixture-0' : 'synthetic/v1/case', base: baseline,
            reservations: [prep ? 'challenge-batch:v2' : `source:fixture.c:${task}`],
            allowedPaths: [prep ? 'challenges/cases/v2/' : 'js/fixture.js'] });
        send({ type: 'ready', task, base: baseline, delivery: commit, commits: [commit],
            paths: [task === 'A1' ? candidatePath : 'js/fixture.js'],
            evidence, dependencies: [] });
        send({ type: 'integrating', task, integration: commit });
        if (task === 'A0') {
            send({ type: 'validated', task, checkpoint: summary, passed: true });
            send({ type: 'accepted', task });
        }
    }
    send({ type: 'turn', worker: 'A', state: 'idle', reason: 'Submitted.', processes: [] });
    const options = { task: 'A1', ledger: '.cache/ledger.json' };
    const accept = () => {
        send({ type: 'validated', task: 'A1', passed: true, checkpoint: candidateCheckpoint });
        send({ type: 'accepted', task: 'A1' });
    };
    const calls = [];
    const checkCI = args => { calls.push(args); return { checked: 0, pending: [], completed: [], failed: false }; };
    return { root, parent, git, write, json, options, baseline, candidate, baselineCheckpoint, candidateCheckpoint,
        accept, send, calls, checkCI, state: () => summarizeLedger(JSON.parse(readFileSync(join(root, options.ledger), 'utf8'))) };
}
