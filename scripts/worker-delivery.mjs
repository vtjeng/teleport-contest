// Git-backed delivery snapshots and cheap integration checks. None of these
// functions merges, pushes, replays a game or claims to prove source equivalence.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync,
    readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { validatePortEvidence } from './port-evidence.mjs';
import { BOOKKEEPING_FILES, executionTree } from './checkpoint-reuse.mjs';
import { validInvestigation } from './investigation-cache.mjs';
import { corpusDigest, validateEvaluation } from './challenge-results.mjs';

function check(value, message) {
    if (!value) throw new Error(message);
}

export function git(root, ...args) {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024, timeout: 30_000 });
    check(result.status === 0, result.error?.message || result.stderr || `git ${args[0]} failed`);
    return result.stdout.trimEnd();
}

export function resolveCommit(root, revision) {
    check(typeof revision === 'string' && revision.length > 0, 'commit revision is required');
    return git(root, 'rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`);
}

export function isAncestor(root, base, head) {
    const result = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', base, head],
        { encoding: 'utf8', timeout: 30_000 });
    check(result.status === 0 || result.status === 1, result.error?.message || result.stderr || 'ancestry check failed');
    return result.status === 0;
}

function lines(text) { return text ? text.split('\n') : []; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function json(root, commit, path) { return JSON.parse(git(root, 'show', `${commit}:${path}`)); }

export function deliveryGit(root, base, head) {
    base = resolveCommit(root, base); head = resolveCommit(root, head);
    check(base !== head && isAncestor(root, base, head), 'delivery must descend from a distinct base');
    const commits = lines(git(root, 'rev-list', '--reverse', '--topo-order', `${base}..${head}`));
    const parents = Object.fromEntries(commits.map(commit => [commit,
        lines(git(root, 'show', '-s', '--format=%P', commit).replaceAll(' ', '\n'))]));
    const paths = lines(git(root, 'diff', '--name-only', base, head)).sort();
    return { base, head, commits, parents, paths };
}

function checkScope(task, paths) {
    for (const path of paths) check(task.allowedPaths.some(allowed => path === allowed
        || (allowed.endsWith('/') && path.startsWith(allowed))), `delivery path is outside assigned scope: ${path}`);
}

function readChecks(path) {
    const checks = JSON.parse(readFileSync(path, 'utf8'));
    check(Array.isArray(checks), 'checks file must contain an array');
    const result = checks.map(item => {
        check(['focused', 'lint', 'fresh'].includes(item.kind), 'check kind must be focused, lint or fresh');
        check(Array.isArray(item.command) && item.command.length > 0
            && item.command.every(arg => typeof arg === 'string' && arg.length), 'check command must be an argument array');
        check(item.exitCode === 0, 'only successful completed checks qualify for submission');
        check(typeof item.log === 'string' && isAbsolute(item.log), 'check log must be an absolute path');
        const output = readFileSync(item.log, 'utf8');
        check(output.trim(), 'check log is empty');
        return { kind: item.kind, command: item.command, exitCode: item.exitCode,
            log: item.log, logSha256: digest(output), output };
    });
    for (const kind of ['focused', 'lint']) check(result.some(item => item.kind === kind), `missing ${kind} check result`);
    return result;
}

function scopeEvidence(root, commit, task, packet) {
    const context = packet.context;
    check(context?.goal === task.goal, 'span context names a different goal');
    check(Array.isArray(context.functions) && context.functions.length > 0
        && context.functions.every(name => typeof name === 'string'), 'context needs planned source functions');
    check(typeof packet.entryPointReview === 'string' && packet.entryPointReview.trim(), 'missing entryPointReview');
    check(Array.isArray(packet.entryPoints), 'missing entryPoints array');
    const lua = context.kind === 'lua-port';
    check(['lua-port', 'file-port', 'divergence-fix'].includes(context.kind), 'unsupported context kind');
    const file = lua ? context.luaFile : context.cFile;
    for (const name of context.functions) check(task.reservations.includes(lua
        ? `source:${file}` : `source:${file}:${name}`), `unreserved source function: ${file}:${name}`);
    const goal = { kind: lua ? 'lua-port' : 'file-port', cFile: context.cFile,
        luaFile: context.luaFile, functions: context.functions.map(name => ({ name })) };
    const evidence = validatePortEvidence(goal, packet, { root, commit });
    check(isDeepStrictEqual([...context.functions].sort(), evidence.functions.map(f => f.name).sort()),
        'evidence must cover exactly the planned source functions');
    return evidence;
}

export function submitDelivery({ root, file, state, taskId, contextPath, evidencePath, checksPath,
    base, head = 'HEAD', dependencies }) {
    const task = state.tasks[taskId];
    check(task, 'submission requires a known task');
    const worker = state.workers[task.worker];
    check(worker.worktree === root, 'submit from the assigned worker worktree');
    const source = deliveryGit(root, base ?? task.base, head);
    check(task.status === 'working' || state.deliveries[source.head]?.task === taskId,
        'submission requires a working task or an exact ready retry');
    check(isAncestor(root, task.base, source.base), 'delivery base precedes or diverges from assignment base');
    checkScope(task, source.paths);
    // A retry keeps the dependency decision made at first submission, even
    // when the coordinator has since accepted one of those dependencies.
    dependencies = dependencies ? dependencies.map(sha => resolveCommit(root, sha))
        : state.deliveries[source.head]?.dependencies ?? Object.values(state.deliveries).filter(delivery => delivery.task !== taskId
            && !delivery.acceptedAt && isAncestor(root, delivery.delivery, source.head)).map(d => d.delivery);
    const packet = { ...JSON.parse(readFileSync(evidencePath, 'utf8')),
        context: JSON.parse(readFileSync(contextPath, 'utf8')), checks: readChecks(checksPath), git: source };
    if (source.paths.some(path => path.startsWith('recordings/')))
        check(packet.checks.some(item => item.kind === 'fresh'), 'new or changed recordings need fresh check results');
    scopeEvidence(root, source.head, task, packet);
    const contents = JSON.stringify(packet, null, 2) + '\n';
    const evidence = join(`${file}.deliveries`, `${digest(contents)}.json`);
    mkdirSync(dirname(evidence), { recursive: true });
    if (existsSync(evidence)) check(readFileSync(evidence, 'utf8') === contents, 'immutable delivery evidence differs');
    else {
        const temp = `${evidence}.${randomUUID()}.tmp`;
        const fd = openSync(temp, 'wx', 0o444);
        try {
            writeFileSync(fd, contents); fsyncSync(fd);
            renameSync(temp, evidence);
            const directory = openSync(dirname(evidence), 'r');
            try { fsyncSync(directory); } finally { closeSync(directory); }
        } finally {
            closeSync(fd);
            if (existsSync(temp)) unlinkSync(temp);
        }
    }
    return { id: `ready-${source.head}`, type: 'ready', task: taskId, delivery: source.head,
        base: source.base, commits: source.commits, paths: source.paths, evidence, dependencies };
}

export function readDelivery(delivery) {
    const contents = readFileSync(delivery.evidence, 'utf8');
    check(basename(delivery.evidence) === `${digest(contents)}.json`, 'delivery evidence hash differs; preserve and investigate it');
    const packet = JSON.parse(contents);
    check(packet.git?.head === delivery.delivery && packet.git?.base === delivery.base,
        'evidence belongs to another delivery');
    return packet;
}

// Git's usual patch identity includes unchanged context. A conflict resolution
// can preserve every delivered edit while retaining newer surrounding code.
function contextFreePatchId(root, commit, cache) {
    if (!cache.has(commit)) {
        const patch = git(root, 'show', '--format=', '--no-ext-diff', '--no-textconv',
            '--no-renames', '--binary', '--unified=0', commit);
        const result = spawnSync('git', ['patch-id', '--stable'], {
            input: patch, encoding: 'utf8', timeout: 30_000,
        });
        check(result.status === 0, result.error?.message || result.stderr || 'patch-id failed');
        cache.set(commit, result.stdout.trim().split(' ')[0] || null);
    }
    return cache.get(commit);
}

function checkCandidate(root, state, task, commit, visited = new Set(), patchIds = new Map()) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    // A correction can be cherry-picked independently of a worker's later task.
    // The combined candidate must still include the original submission too.
    for (const sha of task.deliveries) {
        const delivery = state.deliveries[sha];
        const packet = readDelivery(delivery);
        check(isDeepStrictEqual(deliveryGit(root, delivery.base, delivery.delivery), packet.git), 'delivery Git metadata changed');
        const missing = lines(git(root, 'cherry', commit, delivery.delivery, delivery.base))
            .filter(line => line.startsWith('+'));
        if (missing.length) {
            const candidates = lines(git(root, 'rev-list', '--no-merges', `${delivery.base}..${commit}`));
            const integrated = new Set(candidates.map(sha => contextFreePatchId(root, sha, patchIds)));
            for (const row of missing) {
                const patch = contextFreePatchId(root, row.slice(2), patchIds);
                check(patch && integrated.has(patch), `candidate is missing delivered patches from ${sha}`);
            }
        }
        for (const dependency of delivery.dependencies) {
            const required = state.tasks[state.deliveries[dependency]?.task];
            check(required && state.deliveries[required.deliveries.at(-1)]?.acceptedAt,
                `dependency is not accepted: ${dependency}`);
            // Acceptance of a repair is not enough: this candidate must also
            // contain the repair, including a selectively cherry-picked one.
            checkCandidate(root, state, required, commit, visited, patchIds);
        }
    }
}

export function resolveEventCommits(root, input) {
    const event = structuredClone(input);
    for (const field of ['base', 'delivery', 'integration', 'commit']) {
        if (event[field] !== undefined) event[field] = resolveCommit(root, event[field]);
    }
    return event;
}

function verifyPublicationChanges(root, tested, published) {
    // Keep checkpoint reuse conservative. Publication alone permits checked
    // reports written after closure; the original tested commit stays intact.
    if (executionTree(root, tested) === executionTree(root, published)) return;
    const paths = git(root, 'diff', '--name-only', '--no-renames', '-z', tested, published)
        .split('\0').filter(Boolean);
    for (const path of paths) {
        if (BOOKKEEPING_FILES.includes(path)) continue; // executionTree already checked modes.
        const investigation = /^investigations\/((?:synthetic\/v[1-9][0-9]*\/[a-z0-9][a-z0-9-]*|(?:holdout\/)?[A-Za-z0-9][A-Za-z0-9_.-]*))\.json$/u.exec(path);
        const evaluation = /^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/u.test(path);
        check(investigation || evaluation, `published commit has unvalidated changes: ${path}`);
        const entry = git(root, 'ls-tree', '-z', published, '--', path);
        check(entry.startsWith('100644 blob '), `publication report must be a regular non-executable file: ${path}`);
        const report = json(root, published, path);
        if (investigation) {
            check(validInvestigation(report, investigation[1]), `invalid investigation report: ${path}`);
            check(isAncestor(root, report.commit, tested), `investigation source commit is outside tested history: ${path}`);
            if (investigation[1].startsWith('synthetic/')) {
                const [, batch, caseId] = investigation[1].split('/');
                const manifestPath = batch === 'v1' ? 'challenges/manifest.json' : `challenges/manifests/${batch}.json`;
                const manifest = json(root, tested, manifestPath);
                const entry = manifest.cases.find(entry => entry.id === caseId);
                check(report.manifestPath === manifestPath
                    && report.manifestSha256 === corpusDigest(manifest.cases)
                    && entry && report.recordingSha256 === entry.recordingSha256,
                `synthetic investigation differs from the tested manifest: ${path}`);
                check(/^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/u.test(report.evaluationPath),
                    `synthetic investigation needs saved evaluation evidence: ${path}`);
                const evidence = validateEvaluation(json(root, published, report.evaluationPath));
                const measured = evidence.cases.find(item => item.id === caseId);
                check(evidence.status === 'complete' && evidence.sha === report.evaluationCommit
                    && isAncestor(root, evidence.sha, tested)
                    && (evidence.batch ?? 'v1') === batch
                    && evidence.manifestSha256 === report.manifestSha256
                    && measured?.recordingSha256 === report.recordingSha256
                    && measured.metrics.screens.total === report.recordedSteps
                    && measured.metrics.screens.total - measured.metrics.screens.matched === report.remainingScreens,
                `synthetic investigation differs from its saved evaluation: ${path}`);
            }
        } else {
            check(!git(root, 'ls-tree', '-z', tested, '--', path), `challenge evaluations are immutable: ${path}`);
            validateEvaluation(report);
            check(report.sha === tested, `challenge evaluation must identify the tested integration: ${path}`);
            const batch = report.batch ?? 'v1';
            check(/^v[1-9][0-9]*$/u.test(batch), `invalid challenge batch: ${path}`);
            const manifestPath = batch === 'v1' ? 'challenges/manifest.json' : `challenges/manifests/${batch}.json`;
            check((report.manifestPath ?? 'challenges/manifest.json') === manifestPath,
                `challenge evaluation path differs from its batch: ${path}`);
            const manifest = json(root, tested, manifestPath);
            check(corpusDigest(manifest.cases) === report.manifestSha256,
                `challenge evaluation membership differs from the tested manifest: ${path}`);
        }
    }
}

export function verifyEvent(root, state, input) {
    const event = resolveEventCommits(root, input);
    const task = state.tasks[event.task];
    const delivery = task && state.deliveries[task.deliveries.at(-1)];
    if (event.type === 'register') {
        check(git(event.worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir')
            === git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'worker must belong to the same Git repository');
        check(git(event.worktree, 'branch', '--show-current') === event.branch, 'registered branch does not match worker checkout');
        check(resolveCommit(event.worktree, 'HEAD') === event.base, 'registered base does not match worker HEAD');
    }
    if (event.type === 'assign') {
        const worker = state.workers[event.worker];
        check(worker && resolveCommit(worker.worktree, 'HEAD') === event.base, 'assignment base must be the worker HEAD');
    }
    if (event.type === 'integrating') {
        check(event.integration === resolveCommit(root, 'HEAD'), 'integration SHA must be the current combined HEAD');
        check(delivery?.receivedAt, 'acknowledge receipt before integrating');
        readDelivery(delivery);
        checkCandidate(root, state, task, event.integration);
    }
    if (event.type === 'validated') {
        check(delivery, 'task has no delivery');
        const summary = JSON.parse(readFileSync(event.checkpoint, 'utf8'));
        check(summary.commit === delivery.integration, 'checkpoint belongs to a different integration SHA');
        check(typeof summary.allPassed === 'boolean' && summary.allPassed === event.passed,
            'validation result disagrees with checkpoint summary');
    }
    if (event.type === 'published') {
        check(delivery && isAncestor(root, delivery.integration, event.commit), 'published commit must contain accepted integration');
        verifyPublicationChanges(root, delivery.integration, event.commit);
        check(resolveCommit(root, 'refs/heads/main') === event.commit, 'local main differs; run sync-main first');
        const remote = git(root, 'ls-remote', '--exit-code', 'origin', 'refs/heads/main').split(/\s/u)[0];
        check(remote === event.commit, 'remote main does not match; publish successfully before recording publication');
    }
    return event;
}

export function syncMain(root, revision) {
    const commit = resolveCommit(root, revision);
    const previous = resolveCommit(root, 'refs/heads/main');
    check(isAncestor(root, previous, commit), 'local main cannot be fast-forwarded to this commit');
    const entries = git(root, 'worktree', 'list', '--porcelain').split('\n\n');
    const entry = entries.find(entry => entry.split('\n').includes('branch refs/heads/main'));
    if (entry) {
        const path = entry.split('\n')[0].slice('worktree '.length);
        check(git(path, 'status', '--porcelain') === '', 'main worktree has changes; preserve them before synchronization');
        git(path, 'merge', '--ff-only', commit);
    } else git(root, 'update-ref', 'refs/heads/main', commit, previous);
    check(resolveCommit(root, 'refs/heads/main') === commit, 'main changed during synchronization');
    return { commit, previous, pushed: false };
}

function recipeSegments(value) {
    // Recipes use input-only segments. Legacy fixed recordings may put inputs
    // directly on the root; no recorded answers are needed for this comparison.
    return Array.isArray(value.segments) ? value.segments : [value];
}

export function copiedRecipe(recipe, fixed) {
    const a = recipeSegments(recipe); const b = recipeSegments(fixed);
    return a.some(segment => b.some(reference => segment.seed === reference.seed
        && typeof segment.moves === 'string' && segment.moves.length > 0
        && segment.moves === reference.moves));
}

export function preflightDelivery({ root, state, taskId, commit = 'HEAD', previousCheckpoint }) {
    commit = resolveCommit(root, commit);
    const task = state.tasks[taskId];
    check(task?.deliveries.length, 'task has no delivery');
    const delivery = state.deliveries[task.deliveries.at(-1)];
    const packet = readDelivery(delivery);
    const deliveryPaths = [...new Set(task.deliveries.flatMap(sha => state.deliveries[sha].paths))];
    const issues = [];
    const inspect = (label, fn) => { try { fn(); } catch (error) { issues.push(`${label}: ${error.message}`); } };
    inspect('Git identity', () => {
        check(isDeepStrictEqual(deliveryGit(root, delivery.base, delivery.delivery), packet.git), 'delivery Git metadata changed');
        checkScope(task, deliveryPaths);
        checkCandidate(root, state, task, commit);
    });
    let evidence;
    inspect('source evidence', () => { evidence = scopeEvidence(root, commit, task, packet); });
    inspect('quality assignments', () => {
        const config = json(root, commit, 'QUALITY.json');
        const assigned = new Set(config.areas.flatMap(area => area.paths));
        const missing = deliveryPaths.filter(path => path.startsWith('js/') && path.endsWith('.js')
            && git(root, 'ls-tree', commit, '--', path) && !assigned.has(path));
        check(missing.length === 0, `unassigned files: ${missing.join(', ')}`);
    });
    const recipes = deliveryPaths.filter(path => path.startsWith('recipes/') && path.endsWith('.session.json'));
    inspect('independent recipes', () => {
        if (recipes.length === 0) return;
        const fixedPaths = lines(git(root, 'ls-tree', '-r', '--name-only', commit, '--', 'sessions'))
            .filter(path => /^sessions\/(?:holdout\/)?[^/]+\.session\.json$/u.test(path));
        const fixed = fixedPaths.map(path => ({ path, recipe: {
            segments: recipeSegments(json(root, commit, path)).map(({ seed, moves }) => ({ seed, moves })),
        } }));
        const copies = [];
        for (const path of recipes) {
            if (!git(root, 'ls-tree', commit, '--', path)) continue;
            const recipe = json(root, commit, path);
            for (const reference of fixed) if (copiedRecipe(recipe, reference.recipe))
                copies.push(`${path} copies seed and moves from ${reference.path}`);
        }
        check(copies.length === 0, copies.join('; '));
    });
    const focused = new Set(deliveryPaths.filter(path => /^scripts\/.*\.test\.mjs$/u.test(path)
        && git(root, 'ls-tree', commit, '--', path)));
    for (const fn of evidence?.functions ?? []) for (const path of fn.tests) focused.add(path);
    // Direct importer tests catch stale callers without launching the full suite.
    const changedJs = deliveryPaths.filter(path => path.startsWith('js/'));
    if (changedJs.length) {
        const result = spawnSync('git', ['-C', root, 'grep', '-l', '-F',
            ...changedJs.flatMap(path => ['-e', `../${path}`]), commit, '--', 'scripts/*.test.mjs'],
        { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
        check(result.status === 0 || result.status === 1, result.error?.message || result.stderr || 'test discovery failed');
        for (const row of lines(result.stdout.trimEnd())) focused.add(row.slice(commit.length + 1));
    }
    let previousFailures = [];
    if (previousCheckpoint) inspect('previous checkpoint', () => {
        const summary = JSON.parse(readFileSync(previousCheckpoint, 'utf8'));
        check(Array.isArray(summary.results), 'checkpoint summary has no check results');
        previousFailures = summary.results.filter(result => !result.passed && !result.skipped)
            .map(result => ({ label: result.label, logPath: result.logPath ?? null,
                informational: Boolean(result.informational), detail: result.detail ?? null }));
        if (summary.error) previousFailures.push({ label: 'checkpoint runner', detail: summary.error });
    });
    return { task: taskId, delivery: delivery.delivery, commit, passed: issues.length === 0,
        issues, focusedTests: [...focused].sort(), previousFailures,
        manualReview: ['Compare whole source and production caller paths.',
            'Verify recordings reach the claimed entry points and inputs were independently chosen.',
            'Address every previous failure, then run affected focused tests and lint before checkpoint.'] };
}
