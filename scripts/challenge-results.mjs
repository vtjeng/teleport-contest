// Immutable challenge recordings and evaluation evidence behind SCORE.tsv.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRows } from './score-log.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const ID = /^[a-z0-9][a-z0-9-]*$/u;
const BATCH = /^v(?:[1-9]\d*)$/u;
const FUTURE_BATCH = /^v(?:[2-9]|[1-9]\d+)$/u;
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

function validateCaseFiles(root, entry) {
    for (const field of ['recipe', 'recording']) {
        if (!entry[field]?.startsWith('challenges/cases/')
            || !SHA256.test(entry[field + 'Sha256']))
            throw new Error('invalid ' + field + ' reference for ' + entry.id);
        const path = challengePath(root, entry[field]);
        if (!lstatSync(path).isFile() || digest(readFileSync(path)) !== entry[field + 'Sha256'])
            throw new Error(entry.id + ' ' + field + ' digest mismatch; preserve the original case');
    }
    const recipe = JSON.parse(readFileSync(challengePath(root, entry.recipe), 'utf8'));
    if (!Array.isArray(recipe.segments)
        || recipe.segments.some(segment => !segment || Array.isArray(segment.steps)))
        throw new Error(entry.id + ' recipe must contain replay inputs without recorded steps');
    const recording = JSON.parse(readFileSync(challengePath(root, entry.recording), 'utf8'));
    if (!Array.isArray(recording.segments))
        throw new Error(entry.id + ' recording has no segments');
}

function validateCases(root, cases) {
    if (!Array.isArray(cases)) throw new Error('challenge manifest needs a cases array');
    const ids = new Set();
    for (const entry of cases) {
        if (!ID.test(entry.id) || ids.has(entry.id) || typeof entry.title !== 'string')
            throw new Error('challenge IDs must be unique; each case needs a title');
        ids.add(entry.id);
        validateCaseFiles(root, entry);
    }
    return cases;
}

function readManifest(root, manifestPath, batch, parsed = null) {
    const path = challengePath(root, manifestPath);
    const manifest = parsed ?? JSON.parse(readFileSync(path, 'utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.cases))
        throw new Error('invalid ' + batch + ' challenge manifest');
    if (batch !== 'v1' && manifest.batch !== batch)
        throw new Error(manifestPath + ' must identify batch ' + batch);
    const cases = validateCases(root, manifest.cases);
    const metadata = Object.fromEntries(Object.entries(manifest)
        .filter(([key]) => !['version', 'batch', 'cases'].includes(key)));
    return {
        batch,
        manifestPath,
        manifestSha256: corpusDigest(cases),
        manifestFileSha256: parsed ? null : digest(readFileSync(path)),
        version: manifest.version,
        metadata,
        cases,
    };
}

export function readChallengeBatches(root) {
    const batches = existsSync(challengePath(root, 'challenges/manifest.json'))
        ? [readManifest(root, 'challenges/manifest.json', 'v1')] : [];
    const directory = join(root, 'challenges', 'manifests');
    if (!existsSync(directory)) return batches;
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name))) {
        if (!entry.name.endsWith('.json') || !FUTURE_BATCH.test(entry.name.slice(0, -5))) continue;
        if (!entry.isFile()) throw new Error('challenge manifest must be a regular file: ' + entry.name);
        const batch = entry.name.slice(0, -5);
        batches.push(readManifest(root, 'challenges/manifests/' + entry.name, batch));
    }
    return batches;
}

export function validatePreparedBatch(root, manifest, batch) {
    if (!FUTURE_BATCH.test(batch)) throw new Error('new challenge batches must be v2 or later');
    if (!manifest || typeof manifest !== 'object' || manifest.batch !== batch)
        throw new Error('prepared manifest must contain batch ' + batch);
    return readManifest(root, 'challenges/manifests/' + batch + '.json', batch, manifest);
}
export function readChallenges(root) {
    return readChallengeBatches(root).find(batch => batch.batch === 'v1')
        ?? { batch: 'v1', version: 1, manifestPath: 'challenges/manifest.json',
            manifestSha256: corpusDigest([]), manifestFileSha256: null,
            metadata: {}, cases: [] };
}

export function evaluationBatch(evaluation) {
    return evaluation.batch ?? 'v1';
}

export function evaluationManifestPath(evaluation) {
    return evaluation.manifestPath
        ?? (evaluationBatch(evaluation) === 'v1'
            ? 'challenges/manifest.json'
            : 'challenges/manifests/' + evaluationBatch(evaluation) + '.json');
}

function inputFiles(root, path, result) {
    const absolute = join(root, path);
    const stat = lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error('challenge input paths must not contain symlinks');
    if (stat.isDirectory()) {
        for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
            a.name.localeCompare(b.name)))
            inputFiles(root, join(path, entry.name), result);
        return;
    }
    if (!stat.isFile()) throw new Error('challenge input is not a regular file: ' + path);
    result.push({ path: path.replaceAll('\\', '/'), sha256: digest(readFileSync(absolute)) });
}

// The digest follows the replay inputs used by the scorer, not repository HEAD.
// Report-only commits therefore leave a saved evaluation fresh.
export function challengeInputSnapshot(root, batch) {
    const selected = typeof batch === 'string'
        ? readChallengeBatches(root).find(entry => entry.batch === batch)
        : batch;
    if (!selected) throw new Error('unknown challenge batch: ' + batch);
    const paths = [
        'package.json',
        'package-lock.json',
        'js',
        'frozen',
        'scripts/challenge-results.mjs',
        'scripts/score-challenges.mjs',
        'scripts/scoring-workspace.mjs',
        selected.manifestPath,
        ...selected.cases.flatMap(entry => [entry.recipe, entry.recording]),
    ];
    const files = [];
    for (const path of [...new Set(paths)].sort()) inputFiles(root, path, files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files, sha256: digest(JSON.stringify(files)) };
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
    const batch = evaluationBatch(evaluation);
    const manifestPath = evaluationManifestPath(evaluation);
    const expectedManifestPath = batch === 'v1'
        ? 'challenges/manifest.json' : 'challenges/manifests/' + batch + '.json';
    if (evaluation.version !== 1 || !SHA.test(evaluation.sha)
        || !Number.isFinite(Date.parse(evaluation.utc))
        || !SHA256.test(evaluation.manifestSha256) || !SHA256.test(evaluation.scorerSha256)
        || !Array.isArray(evaluation.cases) || !['complete', 'failed'].includes(evaluation.status)
        || !BATCH.test(batch) || manifestPath !== expectedManifestPath)
        throw new Error('invalid challenge evaluation');
    if (evaluation.inputsSha256 !== undefined && !SHA256.test(evaluation.inputsSha256))
        throw new Error('invalid challenge input digest');
    if (evaluation.inputFiles !== undefined
        && (!Array.isArray(evaluation.inputFiles)
            || evaluation.inputFiles.some(file => typeof file !== 'string')))
        throw new Error('invalid challenge input file list');
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
        rng: entry.metrics.rng, cursors: entry.metrics.cursors,
        passed: entry.passed, error: entry.error ?? null };
}

function emptyBatch(batch) {
    return { batch: batch.batch, manifestPath: batch.manifestPath,
        manifestSha256: batch.manifestSha256, manifestFileSha256: batch.manifestFileSha256,
        metadata: batch.metadata, status: 'unmeasured', freshness: { status: 'unknown' },
        sha: null, utc: null, totals: null, baseline: null, latest: null,
        evaluation: null, evaluationPath: null, previous: null,
        cases: batch.cases.map(entry => ({ batch: batch.batch, id: entry.id,
            title: entry.title, outcome: entry.outcome ?? '', sourcePointers: entry.sourcePointers ?? [],
            screenCount: null, recordingSha256: entry.recordingSha256,
            first: null, current: null, delta: null })),
        history: [], changes: null, error: null, generationReady: false };
}

function loadChallengeEvaluations(root, rows) {
    const values = [];
    const errors = [];
    for (const row of rows.filter(entry => entry.event === 'challenge')) {
        try {
            values.push({ row, evaluation: evaluationFromRow(root, row) });
        } catch (error) {
            errors.push(error.message);
        }
    }
    return { values, errors };
}

function batchHistory(values) {
    let previous = null;
    return values.map(({ evaluation }) => {
        const point = { batch: evaluationBatch(evaluation), utc: evaluation.utc, sha: evaluation.sha,
            screens: evaluation.totals?.screens.matched ?? null,
            screensTotal: evaluation.totals?.screens.total ?? null,
            error: evaluation.error ?? null, manifestSha256: evaluation.manifestSha256,
            scorerSha256: evaluation.scorerSha256, inputsSha256: evaluation.inputsSha256 ?? null,
            freshness: evaluation.inputsSha256 ? 'recorded' : 'legacy',
            changes: previous && evaluation.status === 'complete'
                ? compareEvaluations(previous, evaluation) : null,
            breakBefore: Boolean(previous && previous.scorerSha256 !== evaluation.scorerSha256) };
        if (evaluation.status === 'complete') previous = evaluation;
        return point;
    });
}

function stateForBatch(root, batch, allValues, errors) {
    const result = emptyBatch(batch);
    const values = allValues.filter(({ evaluation }) => evaluationBatch(evaluation) === batch.batch);
    result.history = batchHistory(values);
    const historyCompleted = values.filter(({ evaluation }) => evaluation.status === 'complete');
    const latestRecord = values.at(-1);
    const latest = latestRecord?.evaluation;
    if (!latest) {
        result.error = errors.length ? errors.join('; ') : null;
        result.status = errors.length ? 'failed' : 'unmeasured';
        return result;
    }
    result.latest = latest;
    result.evaluation = latest;
    result.evaluationPath = latestRecord.row.challenge_evaluation;
    result.previous = historyCompleted.at(-1)?.evaluation ?? null;
    if (latest.status === 'complete' && result.previous?.sha === latest.sha)
        result.previous = historyCompleted.at(-2)?.evaluation ?? null;
    result.sha = latest.sha;
    result.utc = latest.utc;
    result.totals = latest.totals;
    const manifestMatches = latest.manifestSha256 === batch.manifestSha256;
    const known = new Map(batch.cases.map(entry => [entry.id, entry.recordingSha256]));
    const completeCases = new Map(latest.status === 'complete'
        ? latest.cases.map(entry => [entry.id, entry]) : []);
    const complete = latest.cases.length === batch.cases.length
        && batch.cases.every(entry => completeCases.get(entry.id)?.recordingSha256 === known.get(entry.id));
    const changedHistory = latest.cases.some(entry =>
        !known.has(entry.id) || known.get(entry.id) !== entry.recordingSha256);
    const historicalChanged = values.some(({ evaluation }) => evaluation.cases.some(entry =>
        !known.has(entry.id) || known.get(entry.id) !== entry.recordingSha256));
    let snapshot = null;
    try {
        snapshot = challengeInputSnapshot(root, batch);
    } catch (error) {
        result.error = error.message;
    }
    const fresh = Boolean(manifestMatches && latest.status === 'complete'
        && latest.inputsSha256 && snapshot && latest.inputsSha256 === snapshot.sha256);
    result.freshness = { status: fresh ? 'fresh' : 'stale',
        expected: snapshot?.sha256 ?? null, actual: latest.inputsSha256 ?? null };
    if (latest.status === 'failed') {
        result.status = 'failed';
        result.error = latest.error ?? 'challenge evaluation failed';
    } else if (!manifestMatches || !complete || !fresh) {
        result.status = !manifestMatches && changedHistory ? 'failed' : 'stale';
        if (!manifestMatches) result.error = result.error
            ?? (changedHistory
                ? 'a previously measured challenge was removed or changed; restore it and add a new case'
                : 'evaluation uses an older challenge manifest');
        else if (!complete) result.error = result.error ?? 'evaluation does not cover every case in the batch';
        else if (!latest.inputsSha256) result.error = result.error ?? 'legacy evaluation has no replay-input digest';
        else if (snapshot && latest.inputsSha256 !== snapshot.sha256)
            result.error = result.error ?? 'replay inputs changed since evaluation';
    } else {
        result.status = 'measured';
    }
    if (historicalChanged) {
        result.status = 'failed';
        result.error = 'a previously measured challenge was removed or changed; restore it and add a new case';
    }
    const first = new Map();
    for (const { evaluation } of historyCompleted) {
        for (const entry of evaluation.cases) {
            if (!known.has(entry.id) || known.get(entry.id) !== entry.recordingSha256) continue;
            if (!first.has(entry.id)) first.set(entry.id, { evaluation, entry });
        }
    }
    result.baseline = historyCompleted[0]?.evaluation ?? null;
    result.cases = batch.cases.map(entry => {
        const initial = first.get(entry.id);
        const current = completeCases.get(entry.id);
        const comparable = current && initial
            && initial.evaluation.scorerSha256 === latest.scorerSha256
            && current.metrics.screens.total === initial.entry.metrics.screens.total;
        return { ...entry, batch: batch.batch,
            screenCount: current?.metrics.screens.total ?? null,
            first: initial ? caseMeasurement(initial.evaluation, initial.entry) : null,
            current: current ? caseMeasurement(latest, current) : null,
            delta: comparable
                ? current.metrics.screens.matched - initial.entry.metrics.screens.matched : null };
    });
    const totals = result.totals;
    result.generationReady = result.status === 'measured' && Boolean(totals
        && totals.screens.matched === totals.screens.total);
    result.changes = latest.status === 'complete'
        ? compareEvaluations(historyCompleted.at(-2)?.evaluation, latest) : null;
    return result;
}

export function challengeState(root, rows = null, head = null) {
    const inputRows = rows ?? (existsSync(join(root, 'SCORE.tsv'))
        ? readRows(join(root, 'SCORE.tsv')) : []);
    const batches = readChallengeBatches(root);
    const loaded = loadChallengeEvaluations(root, inputRows);
    const states = batches.map(batch => stateForBatch(root, batch, loaded.values, loaded.errors));
    const knownBatches = new Set(batches.map(batch => batch.batch));
    const unknown = loaded.values.filter(({ evaluation }) => !knownBatches.has(evaluationBatch(evaluation)));
    const invalidLedger = unknown.length > 0 || loaded.errors.length > 0;
    if (invalidLedger) {
        const detail = loaded.errors.concat(unknown.map(({ evaluation }) =>
            'evaluation references unadmitted challenge batch ' + evaluationBatch(evaluation))).join('; ');
        for (const state of states) {
            state.status = 'failed';
            state.generationReady = false;
            state.error = state.error ? state.error + '; ' + detail : detail;
        }
    }
    const ready = states.length > 0 && states.every(state => state.generationReady);
    const measured = states.length > 0 && states.every(state => state.status === 'measured');
    const totals = measured ? Object.fromEntries(METRICS.map(key => ({
        key, value: states.reduce((sum, state) => sum + state.totals[key].matched, 0),
        total: states.reduce((sum, state) => sum + state.totals[key].total, 0),
    })).map(({ key, value, total }) => [key, { matched: value, total }])) : null;
    const batchFailure = states.some(state => state.status === 'failed');
    const status = invalidLedger || batchFailure ? 'failed'
        : ready ? 'ready' : measured ? 'measured' : 'incomplete';
    const errors = states.map(state => state.error).filter(Boolean);
    return { status, batches: states,
        aggregate: { status,
            generationReady: ready, totals, head, error: errors.length ? errors.join('; ') : null },
        generationReady: ready };
}

// Builds consume saved ledger evidence only. Missing/failed attempts stay
// distinct from measured zeros, and a newly added case has no current score.
export function challengeDashboard(root, rows = null, head = null) {
    const empty = { status: 'unmeasured', sha: null, utc: null, manifestSha256: null,
        totals: null, changes: null, cases: [], history: [], batches: [],
        aggregate: { status: 'incomplete', generationReady: false, totals: null, head, error: null },
        generationReady: false };
    try {
        const state = challengeState(root, rows, head);
        const current = state.batches.find(batch => batch.batch === 'v1') ?? empty;
        const status = state.batches.length === 0 ? 'unmeasured'
            : state.batches.length === 1 ? current.status : state.status;
        return { status, legacyStatus: current.status, sha: current.sha, utc: current.utc,
            manifestSha256: current.manifestSha256, totals: state.aggregate.totals,
            v1Totals: current.totals, changes: current.changes,
            cases: state.batches.flatMap(batch => batch.cases), history: current.history,
            error: state.aggregate.error ?? current.error, freshness: current.freshness, baseline: current.baseline,
            evaluation: current.evaluation, evaluationPath: current.evaluationPath,
            batches: state.batches, aggregate: state.aggregate,
            generationReady: state.generationReady };
    } catch (error) {
        return { ...empty, status: 'failed', error: error.message };
    }
}
