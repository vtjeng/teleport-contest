// Immutable challenge recordings and evaluation evidence behind SCORE.tsv.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const digest = value => createHash('sha256').update(value).digest('hex');
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const ID = /^[a-z0-9][a-z0-9-]*$/u;
const METRICS = ['sessions', 'screens', 'rng', 'cursors'];

// Validate every component before opening a file. Neither traversal nor a
// symlink inside challenges/ may substitute a recording from another corpus.
export function challengePath(root, relative) {
    if (typeof relative !== 'string' || !/^challenges\/[a-zA-Z0-9._/-]+$/u.test(relative)
        || relative.split('/').some(part => !part || part === '.' || part === '..'))
        throw new Error('expected a file within challenges/');
    let path = root;
    for (const part of relative.split('/')) {
        path = join(path, part);
        if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink())
            throw new Error('challenge paths must not contain symlinks');
    }
    return path;
}

export function corpusDigest(cases) {
    return digest(JSON.stringify(cases.map(({ id, recordingSha256 }) => ({ id, recordingSha256 }))
        .sort((a, b) => a.id.localeCompare(b.id))));
}

export function readChallenges(root) {
    const path = challengePath(root, 'challenges/manifest.json');
    if (!existsSync(path)) return { version: 1, cases: [], manifestSha256: corpusDigest([]) };
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.cases))
        throw new Error('invalid challenge manifest');
    const ids = new Set();
    for (const entry of manifest.cases) {
        if (!ID.test(entry.id) || ids.has(entry.id) || typeof entry.title !== 'string')
            throw new Error('challenge IDs must be unique; each case needs a title');
        ids.add(entry.id);
        for (const field of ['recipe', 'recording']) {
            if (!entry[field]?.startsWith('challenges/cases/') || !SHA256.test(entry[`${field}Sha256`]))
                throw new Error(`invalid ${field} reference for ${entry.id}`);
            const path = challengePath(root, entry[field]);
            if (!lstatSync(path).isFile() || digest(readFileSync(path)) !== entry[`${field}Sha256`])
                throw new Error(`${entry.id} ${field} digest mismatch; preserve the original case`);
        }
    }
    return { ...manifest, manifestSha256: corpusDigest(manifest.cases) };
}

function checkCount(count) {
    return count && Number.isSafeInteger(count.matched) && Number.isSafeInteger(count.total)
        && count.matched >= 0 && count.total >= count.matched;
}

export function totalsFor(cases) {
    const totals = Object.fromEntries(METRICS.map(key => [key, { matched: 0, total: 0 }]));
    for (const entry of cases) {
        totals.sessions.total++;
        totals.sessions.matched += Number(entry.passed);
        for (const key of METRICS.slice(1)) {
            const metric = entry.metrics[key];
            if (!checkCount(metric)) throw new Error(`invalid ${key} counts for ${entry.id}`);
            totals[key].matched += metric.matched;
            totals[key].total += metric.total;
        }
    }
    return totals;
}

export function validateEvaluation(evaluation) {
    if (evaluation.version !== 1 || !SHA.test(evaluation.sha)
        || !Number.isFinite(Date.parse(evaluation.utc))
        || !SHA256.test(evaluation.manifestSha256) || !SHA256.test(evaluation.scorerSha256)
        || !Array.isArray(evaluation.cases) || !['complete', 'failed'].includes(evaluation.status))
        throw new Error('invalid challenge evaluation');
    const ids = new Set();
    for (const entry of evaluation.cases) {
        if (!ID.test(entry.id) || ids.has(entry.id) || !SHA256.test(entry.recordingSha256))
            throw new Error('invalid or duplicate evaluation case');
        ids.add(entry.id);
        if (evaluation.status === 'complete' && (typeof entry.passed !== 'boolean'
            || !['screens', 'rng', 'cursors'].every(key => checkCount(entry.metrics?.[key]))))
            throw new Error(`incomplete measurement for ${entry.id}`);
        if (evaluation.status === 'complete' && entry.passed !== Boolean(!entry.error
            && entry.metrics.screens.matched === entry.metrics.screens.total
            && entry.metrics.rng.matched === entry.metrics.rng.total))
            throw new Error(`pass flag differs from measurements for ${entry.id}`);
    }
    if (corpusDigest(evaluation.cases) !== evaluation.manifestSha256)
        throw new Error('evaluation membership digest mismatch');
    if (evaluation.status === 'complete') {
        if (JSON.stringify(totalsFor(evaluation.cases)) !== JSON.stringify(evaluation.totals))
            throw new Error('evaluation totals differ from per-case measurements');
    } else if (evaluation.totals !== null || !evaluation.error) {
        throw new Error('failed evaluations need an error and null totals');
    }
    return evaluation;
}

export function saveEvaluation(root, relative, evaluation) {
    if (!/^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/u.test(relative))
        throw new Error('evaluation path must be challenges/evaluations/<name>.json');
    validateEvaluation(evaluation);
    // Exclusive creation protects the first evaluation and every reassessment.
    writeFileSync(challengePath(root, relative), `${JSON.stringify(evaluation, null, 2)}\n`, { flag: 'wx' });
}

export function readEvaluation(root, relative) {
    return validateEvaluation(JSON.parse(readFileSync(challengePath(root, relative), 'utf8')));
}

export function evaluationFields(relative, evaluation) {
    validateEvaluation(evaluation);
    const fields = { sha: evaluation.sha, event: 'challenge',
        challenge_manifest_sha256: evaluation.manifestSha256, challenge_evaluation: relative };
    if (evaluation.status === 'complete') {
        for (const key of METRICS) {
            fields[`challenge_${key}_${key === 'sessions' ? 'passed' : 'matched'}`] = evaluation.totals[key].matched;
            fields[`challenge_${key}_total`] = evaluation.totals[key].total;
        }
    }
    return fields;
}

function evaluationFromRow(root, row) {
    const evaluation = readEvaluation(root, row.challenge_evaluation);
    for (const [key, value] of Object.entries(evaluationFields(row.challenge_evaluation, evaluation))) {
        if (String(row[key]) !== String(value)) throw new Error(`challenge evidence differs from SCORE.tsv: ${key}`);
    }
    if (evaluation.status === 'failed' && METRICS.some(key => row[`challenge_${key}_total`]))
        throw new Error('failed challenge evaluation has score counts');
    return evaluation;
}

export function compareEvaluations(previous, current) {
    const oldCases = new Map(previous?.cases.map(entry => [entry.id, entry]) ?? []);
    const changes = { added: 0, addedScreens: 0, addedScreensMatched: 0, improved: 0,
        regressed: 0, unchanged: 0, uncomparable: 0, screensGained: 0, screensLost: 0 };
    for (const entry of current.cases) {
        const old = oldCases.get(entry.id);
        if (!old) {
            changes.added++;
            changes.addedScreens += entry.metrics.screens.total;
            changes.addedScreensMatched += entry.metrics.screens.matched;
            continue;
        }
        if (entry.recordingSha256 !== old.recordingSha256 || previous.scorerSha256 !== current.scorerSha256
            || !['screens', 'rng', 'cursors'].every(key => entry.metrics[key].total === old.metrics[key].total)) {
            changes.uncomparable++;
            continue;
        }
        const delta = entry.metrics.screens.matched - old.metrics.screens.matched;
        if (delta > 0) { changes.improved++; changes.screensGained += delta; }
        else if (delta < 0) { changes.regressed++; changes.screensLost -= delta; }
        else changes.unchanged++;
    }
    return changes;
}

function caseMeasurement(evaluation, entry) {
    return { sha: evaluation.sha, utc: evaluation.utc, screens: entry.metrics.screens,
        passed: entry.passed, error: entry.error ?? null };
}

// Builds consume saved ledger evidence only. Missing/failed attempts stay
// distinct from measured zeros, and a newly added case has no current score.
export function challengeDashboard(root, rows, head) {
    const empty = { status: 'unmeasured', sha: null, utc: null, manifestSha256: null,
        totals: null, changes: null, cases: [], history: [] };
    try {
        const manifest = readChallenges(root);
        const evaluations = rows.filter(row => row.event === 'challenge').map(row => evaluationFromRow(root, row));
        const known = new Map(manifest.cases.map(entry => [entry.id, entry.recordingSha256]));
        for (const evaluation of evaluations) {
            if (evaluation.cases.some(entry => known.get(entry.id) !== entry.recordingSha256))
                throw new Error('a previously measured challenge was removed or changed; restore it and add a new case');
        }
        const latest = evaluations.at(-1);
        const complete = evaluations.filter(evaluation => evaluation.status === 'complete');
        const first = new Map();
        for (const evaluation of complete) {
            for (const entry of evaluation.cases) {
                const key = `${entry.id}:${entry.recordingSha256}`;
                if (!first.has(key)) first.set(key, { evaluation, entry });
            }
        }
        let previous = null;
        const history = evaluations.map(evaluation => {
            const point = { utc: evaluation.utc, sha: evaluation.sha,
                screens: evaluation.totals?.screens.matched ?? null,
                screensTotal: evaluation.totals?.screens.total ?? null,
                error: evaluation.error ?? null, manifestSha256: evaluation.manifestSha256,
                scorerSha256: evaluation.scorerSha256,
                changes: previous && evaluation.status === 'complete'
                    ? compareEvaluations(previous, evaluation) : null,
                breakBefore: Boolean(previous && previous.scorerSha256 !== evaluation.scorerSha256) };
            if (evaluation.status === 'complete') previous = evaluation;
            return point;
        });
        const currentById = new Map(latest?.status === 'complete' ? latest.cases.map(entry => [entry.id, entry]) : []);
        const cases = manifest.cases.map(entry => {
            const initial = first.get(`${entry.id}:${entry.recordingSha256}`);
            const current = currentById.get(entry.id);
            if (current && current.recordingSha256 !== entry.recordingSha256)
                throw new Error(`recorded challenge changed: ${entry.id}; add a new case instead`);
            const comparable = current && initial && initial.evaluation.scorerSha256 === latest.scorerSha256
                && current.metrics.screens.total === initial.entry.metrics.screens.total;
            return { id: entry.id, title: entry.title, outcome: entry.outcome ?? '',
                sourcePointers: entry.sourcePointers ?? [],
                first: initial ? caseMeasurement(initial.evaluation, initial.entry) : null,
                current: current ? caseMeasurement(latest, current) : null,
                delta: comparable ? current.metrics.screens.matched - initial.entry.metrics.screens.matched : null };
        });
        if (!latest) return { ...empty, cases };
        return { status: latest.status === 'failed' ? 'failed'
            : latest.sha === head && latest.manifestSha256 === manifest.manifestSha256 ? 'measured' : 'stale',
        sha: latest.sha, utc: latest.utc, manifestSha256: latest.manifestSha256,
        totals: latest.totals, cases, history, error: latest.error ?? null,
        changes: latest.status === 'complete' ? compareEvaluations(complete.at(-2), latest) : null };
    } catch (error) {
        return { ...empty, status: 'failed', error: error.message };
    }
}
