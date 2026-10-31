// Decide from saved checkpoint artifacts, without replay or source certification.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { acceptedMain } from './worker-backlog.mjs';
import { summarizeLedger } from './worker-state.mjs';
import { git, isAncestor, validateHistoricalEvaluation, verifyToolingPublication } from './worker-delivery.mjs';
import { readCheckpointResult } from './checkpoint-results.mjs';
import { evaluationBatch, readChallengeBatches, readEvaluation } from './challenge-results.mjs';
import { loadEvaluationDirectory, compareChallengeBatches } from './compare-challenge-evaluations.mjs';
import { sessionIdentifier } from './goal-log.mjs';
import { readRows } from './score-log.mjs';

// Per-session fixed-workload metrics, bound to the checkpoint's own artifact hash.
export function developmentFromCheckpoint(summary, results, resultBytes) {
    if (!summary?.allPassed || !/^[a-f0-9]{40}$/u.test(summary.executionCommit ?? '')) {
        throw new Error('expected a passing accepted checkpoint with an execution commit');
    }
    const digest = createHash('sha256').update(resultBytes).digest('hex');
    if (summary.artifactHashes?.['session-results.json'] !== digest) {
        throw new Error('session results do not belong to the checkpoint');
    }
    if (!Array.isArray(results?.results) || results.results.length !== 44) {
        throw new Error('expected 44 development session results');
    }
    const sessions = results.results.map(entry => {
        const metrics = Object.fromEntries(['screens', 'rngCalls', 'cursors'].map(key => {
            const value = entry.metrics?.[key];
            if (!Number.isSafeInteger(value?.matched) || !Number.isSafeInteger(value?.total)) {
                throw new Error(`missing ${key} score for ${entry.session}`);
            }
            return [key === 'rngCalls' ? 'rng' : key,
                { matched: value.matched, total: value.total }];
        }));
        const session = entry.session.startsWith('holdout--')
            ? `holdout/${entry.session.slice('holdout--'.length)}` : entry.session;
        return { session: session.replace(/\.session\.json$/u, ''), passed: entry.passed,
            error: entry.error ?? null, metrics };
    });
    if (new Set(sessions.map(row => row.session)).size !== 44) {
        throw new Error('duplicate development session');
    }
    for (const [key, scoreKey] of [
        ['screens', 'screensMatched'], ['rng', 'rngMatched'], ['cursors', 'cursorsMatched'],
    ]) {
        const matched = sessions.reduce((sum, row) => sum + row.metrics[key].matched, 0);
        if (matched !== summary.score?.[scoreKey]) {
            throw new Error(`development ${key} totals do not match the checkpoint`);
        }
    }
    return { executionCommit: summary.executionCommit, measuredAt: summary.timestamp,
        sessions: sessions.sort((a, b) => a.session.localeCompare(b.session)) };
}

function development(summary) {
    const bytes = readFileSync(join(summary.artifacts, 'session-results.json'));
    const sessions = developmentFromCheckpoint(summary, JSON.parse(bytes), bytes).sessions;
    if (sessions.some(row => typeof row.passed !== 'boolean'
        || Object.values(row.metrics).some(metric => metric.matched < 0 || metric.total < metric.matched)))
        throw new Error('invalid fixed-session metrics');
    return sessions;
}

export function compareDevelopment(before, after) {
    const old = new Map(before.map(row => [row.session, row]));
    const current = new Map(after.map(row => [row.session, row]));
    const issues = [], regressions = [], changes = [];
    for (const session of new Set([...old.keys(), ...current.keys()])) {
        const a = old.get(session), b = current.get(session);
        if (!a || !b || ['screens', 'rng', 'cursors'].some(key =>
            a.metrics[key].total !== b.metrics[key].total)) {
            issues.push({ session, reason: 'missing session or changed denominators' });
            continue;
        }
        const delta = { sessions: Number(b.passed) - Number(a.passed),
            ...Object.fromEntries(['screens', 'rng', 'cursors'].map(key =>
                [key, b.metrics[key].matched - a.metrics[key].matched])) };
        const losses = Object.keys(delta).filter(key => delta[key] < 0);
        if (losses.length) regressions.push({ session, metrics: losses, delta });
        if (Object.values(delta).some(value => value !== 0) || !isDeepStrictEqual(a.error, b.error))
            changes.push({ session, delta, before: a, after: b,
                errorChanged: !isDeepStrictEqual(a.error, b.error) });
    }
    return { issues, regressions, changes };
}

export function reviewTask(options, root = process.cwd()) {
    return reviewTasks(options, [options.task], root)[0];
}

// Compare the saved corpora once, then evaluate each assigned target against
// the same accepted baseline. No member acceptance can move that baseline.
export function reviewTasks(options, taskIds, root = process.cwd()) {
    root = resolve(root);
    const state = summarizeLedger(JSON.parse(readFileSync(resolve(root, options.ledger), 'utf8')));
    const tasks = taskIds.map(id => state.tasks[id]);
    if (state.coordinatorRoot !== root || !tasks.length || tasks.some(task => !task?.deliveries.length))
        throw new Error('tasks must belong to this coordinator');
    const candidate = git(root, 'rev-parse', 'HEAD');
    if (tasks.some(task => state.deliveries[task.deliveries.at(-1)].integration !== candidate
        || !['integrating', 'validated'].includes(task.status)))
        throw new Error('review requires the current integrated candidate');
    const summary = readCheckpointResult(root, candidate);
    if (summary.commit !== candidate || summary.allPassed !== true) throw new Error('candidate checkpoint must pass at HEAD');
    const acceptCommand = task => ['node', 'scripts/task-handoff.mjs', 'accept', '--task', task.id,
        '--ledger', options.ledger, ...(options.evaluations ? ['--evaluations', options.evaluations] : [])];
    if (tasks.some(task => task.kind === 'challenge-preparation')) {
        if (tasks.some(task => task.kind !== 'challenge-preparation')) throw new Error('do not mix Prep and implementation acceptance');
        return tasks.map(task => ({task: task.id, candidate, preparation: true,
            next: {review: 'Review the saved C mission and replay evidence, then accept.', command: acceptCommand(task)}}));
    }
    const integratingAt = Math.min(...tasks.map(task => Date.parse(state.deliveries[task.deliveries.at(-1)].integratingAt)));
    const baselinePath = options.baseline ? resolve(root, options.baseline) : acceptedMain(state)?.checkpoint;
    const baselineDelivery = Object.values(state.deliveries).find(d => d.acceptedAt
        && (d.checkpoint === baselinePath || d.supplementalCheckpoint === baselinePath));
    const tooling = state.toolingPublications.find(publication => publication.checkpoint === baselinePath);
    const bootstrap = options.baselinePublication;
    if (bootstrap) {
        if (bootstrap.checkpoint !== baselinePath) throw new Error('bootstrap proof differs from the frozen checkpoint');
        verifyToolingPublication(root, state, bootstrap, {localTooling: true});
    }
    if (!baselinePath || (!baselineDelivery && !tooling && !bootstrap))
        throw new Error('baseline must identify an accepted checkpoint in the shared ledger');
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const accepted = baselineDelivery
        ? baselineDelivery.checkpoint === baselinePath ? baselineDelivery.integration === baseline.commit
            : baselineDelivery.publishedCommit && isAncestor(root, baselineDelivery.integration, baseline.commit)
                && isAncestor(root, baseline.commit, baselineDelivery.publishedCommit)
        : tooling ? tooling.tested === baseline.commit && isAncestor(root, baseline.commit, tooling.commit)
            : bootstrap.tested === baseline.commit;
    if (baseline.allPassed !== true || !isAncestor(root, baseline.commit, candidate) || !accepted)
        throw new Error('baseline checkpoint differs from its accepted integration');
    const candidateDirectory = options.evaluations ? resolve(root, options.evaluations) : join(summary.artifacts, 'synthetic');
    const admitted = readChallengeBatches(root);
    const before = loadEvaluationDirectory(join(baseline.artifacts, 'synthetic'), baseline.commit);
    const admissionBaselines = [];
    const newBatches = admitted.filter(entry => !before.has(entry.batch)
        && !git(root, 'ls-tree', baseline.commit, '--', entry.manifestPath));
    const rows = newBatches.length ? readRows(join(root, 'SCORE.tsv')) : [];
    for (const batch of newBatches) {
        for (const row of rows.filter(row => row.event === 'challenge'
            && row.challenge_manifest_sha256 === batch.manifestSha256)) {
            const evaluation = readEvaluation(root, row.challenge_evaluation);
            if (evaluationBatch(evaluation) !== batch.batch || evaluation.status !== 'complete') continue;
            if (evaluation.sha !== row.sha) throw new Error('admission baseline differs from its recorded commit');
            if (evaluation.sha === candidate || Date.parse(row.utc) > integratingAt)
                throw new Error('admission baseline must precede the current integration');
            validateHistoricalEvaluation(root, evaluation, candidate);
            before.set(batch.batch, evaluation);
            admissionBaselines.push({ batch: batch.batch, commit: evaluation.sha, evaluation: row.challenge_evaluation });
            break;
        }
    }
    const comparison = compareChallengeBatches(before, loadEvaluationDirectory(candidateDirectory, candidate), admitted);
    const fixed = compareDevelopment(development(baseline), development(summary));
    const fixedInputs = ['sessions/', 'frozen/', 'scripts/score-development.mjs',
        'scripts/scoring-workspace.mjs', 'scripts/fixed-workload.mjs'];
    if (git(root, 'ls-tree', '-r', baseline.commit, '--', ...fixedInputs)
        !== git(root, 'ls-tree', '-r', candidate, '--', ...fixedInputs))
        fixed.issues.push({ reason: 'fixed recordings or scorer changed' });
    // Removing a prior error is allowed when matches improve; a new or changed
    // non-null error needs investigation, not automatic acceptance.
    const errors = [...comparison.changes, ...fixed.changes].filter(row => row.errorChanged && row.after.error != null);
    return tasks.map(task => {
        const target = task.seed ? sessionIdentifier(task.seed) : null;
        const changed = target?.startsWith('synthetic/')
            ? comparison.changes.find(row => `synthetic/${row.batch}/${row.id}` === target)
            : fixed.changes.find(row => row.session === target);
        const targetImproved = Boolean(changed && Object.values(changed.delta).some(value => value > 0));
        const blocked = Boolean(comparison.issues.length || comparison.regressions.length
            || fixed.issues.length || fixed.regressions.length || errors.length || (target && !targetImproved));
        return { task: task.id, baseline: baseline.commit, candidate, baselineCheckpoint: baselinePath,
            candidateCheckpoint: join(summary.artifacts, 'summary.json'), admissionBaselines,
            ...comparison, fixed, target, targetImproved, reviewRequired: blocked,
            next: blocked ? { review: 'Resolve regressions, missing evidence, or lack of target improvement before acceptance.', command: null }
                : { review: target ? 'Saved results meet targeted-fix acceptance.' : 'Saved results meet non-target delivery acceptance.', command: acceptCommand(task) } };
    });
}
