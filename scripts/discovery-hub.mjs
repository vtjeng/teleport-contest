#!/usr/bin/env node
// One opt-in entry point for existing diagnostics. It records evidence and
// review decisions; it neither accepts repairs nor changes publication gates.
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
const digest = path => existsSync(path) ? sha(readFileSync(path)) : null;
const FULL_SHA = /^[0-9a-f]{40}$/u;
const LEAD_STATUSES = new Set(['unreviewed', 'investigating', 'unresolved',
    'confirmed', 'explained_negative', 'excluded', 'fixed']);
const METHOD_KINDS = new Set(['missing_message', 'call_graph',
    'constant_compare', 'replay_compare', 'source_review',
    'lua-level-generation']);
const relativePath = value => typeof value === 'string' && value.length > 0
    && !value.startsWith('/') && !value.split('/').includes('..');
const methodKind = item => item.method === 'sourceAudit'
    ? item.kind === 'message' ? 'missing_message' : 'call_graph'
    : item.method === 'compiledConstants' ? 'constant_compare'
        : item.method === 'luaDiscovery' ? 'lua-level-generation'
            : 'replay_compare';
const sourceLocation = (ref, provenance) => {
    const match = /^(.*?)(?::(\d+))?$/u.exec(ref);
    const path = match[1], side = path.startsWith('nethack-c/')
        || path.startsWith('include/') || path.startsWith('src/') ? 'C' : 'JS';
    return { side, path, symbol: null,
        start_line: match[2] ? Number(match[2]) : null,
        end_line: match[2] ? Number(match[2]) : null,
        commit_sha: side === 'C' ? provenance.cGitlink : provenance.jsSha };
};

export function runCommand(command, args, cwd, env = process.env) {
    const start = Date.now();
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024 });
    return { status: result.error || result.status !== 0 ? 'failed' : 'complete',
        elapsedMs: Date.now() - start, exitCode: result.status,
        error: result.error?.message ?? (result.status === 0 ? null
            : (result.stderr || result.stdout).trim().slice(0, 3000)),
        stdout: result.stdout ?? '' };
}

export function replaySelectionStatus(queue, commandStatus) {
    if (commandStatus !== 'complete') return commandStatus;
    return (queue.sessions.length + queue.candidates.length)
        ? 'selected-inputs' : 'empty-input';
}

export function validateLeadShape(lead) {
    if (!lead || typeof lead.key !== 'string' || !lead.key
        || typeof lead.title !== 'string'
        || !LEAD_STATUSES.has(lead.status)
        || (lead.priority !== null && lead.priority !== undefined
            && (!Number.isInteger(lead.priority) || lead.priority < 0
                || lead.priority > 3))
        || !FULL_SHA.test(lead.provenance?.jsSha)
        || !FULL_SHA.test(lead.provenance?.cGitlink)
        || !Array.isArray(lead.methods)
        || lead.methods.some(ref => !METHOD_KINDS.has(ref.kind)
            || typeof ref.version !== 'string' || !ref.version
            || typeof ref.run_id !== 'string' || !ref.run_id)
        || !Array.isArray(lead.source_locations)
        || lead.source_locations.some(loc => !['C', 'JS'].includes(loc.side)
            || !relativePath(loc.path)
            || (loc.symbol !== null && typeof loc.symbol !== 'string')
            || ((loc.start_line === null) !== (loc.end_line === null))
            || (loc.start_line !== null && (!Number.isInteger(loc.start_line)
                || loc.start_line < 1))
            || (loc.end_line !== null && (!Number.isInteger(loc.end_line)
                || loc.end_line < (loc.start_line ?? 1)))
            || !FULL_SHA.test(loc.commit_sha)))
        throw new Error(`invalid canonical lead: ${lead?.key ?? '(missing)'}`);
}

function canonicalizeLead(lead, run) {
    const provenance = { cGitlink: run.cGitlink, jsSha: run.baseSha,
        ...lead.provenance };
    return { ...lead, provenance,
        methods: (lead.methods ?? []).map(ref => typeof ref === 'string'
            ? { kind: methodKind({ method: ref, kind: lead.kind }),
                version: provenance.methodVersions?.[ref] ?? 'legacy',
                run_id: provenance.runId ?? run.runId ?? 'legacy' } : ref),
        source_locations: lead.source_locations ?? (lead.sourceRefs ?? [])
            .map(ref => ({ ...sourceLocation(ref, provenance),
                symbol: lead.symbol ?? null })) };
}

export function reviewFingerprint(run, lead) {
    return sha(JSON.stringify({ runId: run.runId, baseSha: run.baseSha,
        cGitlink: run.cGitlink, key: lead.key,
        evidenceKey: lead.evidenceKey, method: lead.method,
        methodVersion: lead.provenance?.methodVersions?.[lead.method],
        methodConfigHash: lead.provenance?.methodConfigHashes?.[lead.method],
        sourceAuditSourceHash: lead.provenance?.sourceAuditSourceHash,
        inputHashes: run.inputHashes, toolHashes: run.toolHashes,
        exclusionsSha256: run.exclusionsSha256 }));
}

export function reviewTemplate(run, keys) {
    const leads = new Map(run.leads.map(lead => [lead.key, lead]));
    return keys.map(key => {
        const lead = leads.get(key);
        if (!lead) throw new Error(`unknown lead key: ${key}`);
        return { key, evidenceKey: lead.evidenceKey, runId: run.runId,
            reviewFingerprint: reviewFingerprint(run, lead), status: null };
    });
}

export function normalizeSource(item) {
    return { key: `source-audit:${item.id}`, sourceKey: item.id,
        evidenceKey: item.evidenceKey, kind: item.kind,
        sourceRefs: (item.sites ?? []).map(site =>
            `${site.file}:${site.line}`).sort(),
        summary: item.details?.fragment ?? `${item.owner} -> ${item.target}`,
        method: 'sourceAudit', symbol: item.owner ?? null,
        sourceAuditReviews: item.reviews ?? [],
        sourceAuditClassification: item.classification ?? null,
        rank: item.rank ?? null };
}

export function normalizeConstant(item) {
    return { key: `compiled-constants:${item.fingerprint.key}`,
        sourceKey: item.fingerprint.key, evidenceKey: item.evidenceSha256,
        kind: item.kind, sourceRefs: [item.cPath, item.jsPath],
        summary: `${item.cSymbol}: C=${item.cValue}, JS=${item.jsValue}`,
        method: 'compiledConstants', symbol: item.cSymbol,
        rank: null };
}

export function normalizeMismatch(item) {
    const identity = item.session ?? `${item.batch ?? 'fixed'}/${item.caseId ?? 'unknown'}`;
    return { key: `replay:${identity}`, sourceKey: identity,
        evidenceKey: sha(JSON.stringify({ input: item.replayInputSha256,
            mismatch: item.firstMismatch, metrics: item.metrics })),
        kind: 'recorded-replay', sourceRefs: item.sourceFile
            ? [item.sourceFile] : [],
        summary: `${identity}: ${item.kind ?? 'mismatch'} at step ${item.step ?? '?'}`,
        method: 'mismatchQueue', rank: null };
}

export function normalizeLua(item, sourceCase) {
    if (!item?.id || !sourceCase?.recipeSha256
        || sourceCase.id !== item.id)
        throw new Error('Lua ledger and summary case identity disagree');
    const program = sourceCase.program;
    const outcome = sourceCase.outcome?.status;
    if (!['matching', 'mismatch', 'unresolved', 'unreachable',
        'infrastructure-failed', 'uncovered'].includes(outcome))
        throw new Error('Lua case has no recognized aggregate outcome');
    const source = `nethack-c/upstream/dat/${program}`;
    if (!/^[-\w]+\.lua$/u.test(program)
        || item.source_locations?.length !== 1
        || item.source_locations[0] !== source)
        throw new Error('Lua ledger has invalid source attribution');
    return { key: `lua:${program}:${sourceCase.recipeSha256}`,
        sourceKey: `${program}:${sourceCase.recipeSha256}`,
        evidenceKey: sha(JSON.stringify({ item, sourceCase })),
        kind: 'lua-level-generation', sourceRefs: [source],
        summary: `${program}: ${outcome}; ${item.evidence_summary}`,
        method: 'luaDiscovery', rawOutcome: outcome,
        rawOutcomeCounts: sourceCase.outcome.counts,
        rawDetails: item.details_path, rank: null };
}

export function mergeLeads(incoming, previous = [], excludedKeys = new Set(),
    checkedAt = new Date().toISOString(), provenance = {}) {
    const canonicalPrevious = previous.map(item => canonicalizeLead(item, {
        baseSha: item.provenance?.jsSha, cGitlink: item.provenance?.cGitlink,
        runId: item.provenance?.runId }));
    const prior = new Map(canonicalPrevious.map(item => [item.key, item]));
    const output = new Map();
    for (const item of incoming) {
        const earlier = prior.get(item.key);
        const history = earlier?.history ?? [];
        const sameEvidence = earlier?.evidenceKey === item.evidenceKey
            && earlier?.provenance?.jsSha === provenance.jsSha
            && earlier?.provenance?.cGitlink === provenance.cGitlink
            && earlier?.provenance?.methodVersions?.[item.method]
                === provenance.methodVersions?.[item.method]
            && earlier?.provenance?.methodConfigHashes?.[item.method]
                === provenance.methodConfigHashes?.[item.method]
            && (item.method !== 'sourceAudit'
                || earlier?.provenance?.sourceAuditSourceHash
                    === provenance.sourceAuditSourceHash);
        const current = earlier?.status === 'excluded' ? 'excluded'
            : sameEvidence || earlier?.status === 'unresolved'
            ? earlier.status : 'unreviewed';
        const status = excludedKeys.has(item.key) ? 'excluded' : current;
        const sourceAuditReviews = [...new Map([
            ...(earlier?.sourceAuditReviews ?? []), ...(item.sourceAuditReviews ?? []),
        ].map(review => [JSON.stringify(review), review])).values()];
        const merged = { ...item, title: earlier?.title ?? item.summary,
            discoveredBy: [...new Set([...(earlier?.discoveredBy ?? []),
                item.method])].sort(), status, history,
            firstSeen: earlier?.firstSeen ?? checkedAt, lastChecked: checkedAt,
            observed: true,
            provenance: { ...provenance, evidenceKey: item.evidenceKey },
            sourceAuditReviews,
            sourceAuditClassification: item.sourceAuditClassification
                ?? earlier?.sourceAuditClassification ?? null,
            source_locations: item.sourceRefs.map(ref => ({
                ...sourceLocation(ref, provenance), symbol: item.symbol ?? null })),
            claim: earlier?.claim ?? null, priority: earlier?.priority ?? null,
            attempts: earlier?.attempts ?? [],
            validation: sameEvidence ? earlier?.validation ?? null : null,
            resolution: sameEvidence ? earlier?.resolution ?? null : null,
            nextStep: earlier?.nextStep ?? null,
            handoff: earlier?.handoff ?? null,
            reviewFreshness: sameEvidence ? 'current' : earlier ? 'needs-review' : 'new' };
        const duplicate = output.get(item.key);
        if (duplicate) {
            if (duplicate.evidenceKey !== item.evidenceKey)
                throw new Error(`conflicting evidence for ${item.key}`);
            if (!duplicate.methods.some(ref => ref.kind === methodKind(item)
                && ref.run_id === provenance.runId))
                duplicate.methods.push({ kind: methodKind(item),
                    version: provenance.methodVersions?.[item.method] ?? 'unknown',
                    run_id: provenance.runId });
        } else output.set(item.key, { ...merged, methods: [
            ...(earlier?.methods ?? []).filter(ref => typeof ref === 'object'),
            { kind: methodKind(item),
                version: provenance.methodVersions?.[item.method] ?? 'unknown',
                run_id: provenance.runId }] });
    }
    for (const item of canonicalPrevious) {
        if (!output.has(item.key)) output.set(item.key, {
            ...item, observed: false,
            status: excludedKeys.has(item.key) ? 'excluded' : item.status });
    }
    return [...output.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function validateDecision(decision) {
    if (!decision?.key || !decision.evidenceKey)
        throw new Error('decision needs key and exact evidenceKey');
    if (decision.priority !== undefined && decision.priority !== null
        && (!Number.isInteger(decision.priority) || decision.priority < 0
            || decision.priority > 3))
        throw new Error('priority must be an integer 0..3 or null');
    if (decision.status === 'confirmed') {
        const w = decision.witness;
        if (!w?.setup || !w?.failingCommand || !w?.observed
            || !w?.expected || !w?.control?.command || !w?.control?.result
            || !['C-source', 'C-executed'].includes(w.evidenceBasis)
            || !w.sourceRefs?.some(ref => ref.startsWith('nethack-c/')))
            throw new Error('confirmed needs reachable failing witness, control and grounded C oracle');
    } else if (decision.status === 'explained_negative') {
        if (!['equivalent-implementation', 'unreachable',
            'scanner-assumption-invalid'].includes(decision.reason)
            || !decision.evidence?.explanation || !decision.evidence?.proof
            || !decision.evidence?.sourceRefs?.length)
            throw new Error('negative needs a supported source explanation');
    } else if (decision.status === 'unresolved') {
        if (!decision.plausibleDifference || !decision.attempts?.length
            || decision.attempts.some(attempt => !attempt.setup || !attempt.outcome)
            || !decision.nextExperiment)
            throw new Error('unresolved needs attempts and a discriminating next experiment');
    } else if (decision.status === 'investigating') {
        if (!decision.claim?.expected && !decision.claim?.suspectedDifference)
            throw new Error('investigating needs a concrete claim');
    } else if (decision.status === 'fixed') {
        if (!decision.resolution?.explanation || !decision.resolution?.evidence
            || !decision.handoff?.acceptedSha || !decision.handoff?.receipt)
            throw new Error('fixed needs explanation, evidence, accepted SHA and receipt');
    } else if (decision.status === 'excluded') {
        if (!decision.opaqueScopeId) throw new Error('excluded needs an opaque scope ID');
    } else throw new Error(`invalid decision status: ${decision.status}`);
}

export function applyDecisions(run, decisions, at = new Date().toISOString()) {
    if (!FULL_SHA.test(run.baseSha) || !FULL_SHA.test(run.cGitlink)
        || typeof run.runId !== 'string' || !run.runId)
        throw new Error('invalid canonical run identity');
    const leads = new Map(run.leads.map(raw => {
        const lead = canonicalizeLead(raw, run);
        validateLeadShape(lead);
        return [lead.key, lead];
    }));
    for (const decision of decisions) {
        validateDecision(decision);
        const lead = leads.get(decision.key);
        if (!lead || lead.evidenceKey !== decision.evidenceKey)
            throw new Error(`absent or stale decision: ${decision.key}`);
        if (decision.runId !== run.runId
            || decision.reviewFingerprint !== reviewFingerprint(run, lead))
            throw new Error(`stale review provenance: ${decision.key}`);
        if (lead.status === 'excluded' && decision.status !== 'excluded')
            throw new Error(`excluded lead cannot be reassigned: ${decision.key}`);
        lead.history = [...lead.history, { ...decision, reviewedAt: at }];
        lead.status = decision.status;
        lead.reviewFreshness = 'current';
        for (const field of ['title', 'claim', 'priority', 'validation',
            'resolution', 'nextStep', 'handoff'])
            if (decision[field] !== undefined) lead[field] = decision[field];
        if (decision.attempts) lead.attempts = [...lead.attempts,
            ...decision.attempts.map(attempt => ({ ...attempt,
                baseSha: run.baseSha, recordedAt: at }))];
        if (decision.status === 'unresolved') lead.nextStep = {
            experiment: decision.nextExperiment,
            revisitTrigger: decision.revisitTrigger ?? null };
        if (decision.status === 'confirmed') lead.validation = decision.witness;
        if (decision.status === 'explained_negative') lead.resolution = {
            reason: decision.reason, ...decision.evidence };
        validateLeadShape(lead);
    }
    return { ...run, reviewedAt: at,
        leads: [...leads.values()].sort((a, b) => a.key.localeCompare(b.key)) };
}

// A disposable, exactly twelve-column index. The JSON run owns the evidence.
export const CSV_COLUMNS = ['id', 'title', 'methods', 'source_locations',
    'status', 'priority', 'expected_behavior', 'observed_difference',
    'evidence_summary', 'next_experiment', 'last_checked_sha', 'details_path'];

// A disposable triage view, never a detector or a replacement for raw leads.
// Only an evidence-complete negative for this exact run can leave the active
// list. In particular, a failed fixture, unresolved case, or old review does
// not become a generic suppression rule.
export function activeLeadIndex(run) {
    const active = [], filtered = [], excluded = [];
    for (const lead of run.leads) {
        if (!lead.observed) continue;
        if (lead.status === 'excluded') {
            excluded.push({ key: lead.key, reason: 'explicit exclusion' });
            continue;
        }
        const provenance = lead.provenance ?? {};
        const methodConfig = run.methodConfigHashes?.[lead.method];
        const reviewedConfig = provenance.methodConfigHashes?.[lead.method];
        const toolHash = run.toolHashes?.[lead.method];
        const current = lead.reviewFreshness === 'current'
            && provenance.jsSha === run.baseSha
            && provenance.cGitlink === run.cGitlink
            && typeof toolHash === 'string' && toolHash.length > 0
            && provenance.methodVersions?.[lead.method]
                === `sha256:${toolHash}`
            && typeof methodConfig === 'string' && methodConfig.length > 0
            && reviewedConfig === methodConfig
            && (lead.method !== 'sourceAudit'
                || (typeof run.methods?.sourceAudit?.sourceHash === 'string'
                    && run.methods.sourceAudit.sourceHash.length > 0
                    && provenance.sourceAuditSourceHash
                        === run.methods.sourceAudit.sourceHash));
        const explanation = lead.resolution?.reason
            ?? lead.resolution?.explanation;
        if (lead.status === 'explained_negative' && current && explanation) {
            filtered.push({ key: lead.key, evidenceKey: lead.evidenceKey,
                explanation, jsSha: run.baseSha, cGitlink: run.cGitlink,
                method: lead.method,
                methodVersion: provenance.methodVersions[lead.method],
                methodConfigHash: reviewedConfig });
        } else active.push(lead.key);
    }
    return { runId: run.runId, baseSha: run.baseSha,
        active, filtered, excluded };
}

export function leadIndexCsv(run, detailFile = 'run.json') {
    const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = run.leads.map((lead, index) => {
        const evidence = lead.status === 'explained_negative'
            ? `Supported negative: ${lead.resolution?.explanation ?? ''}`
            : lead.status === 'unresolved'
                ? `Unresolved: ${lead.attempts?.at(-1)?.outcome ?? lead.summary}`
                : lead.status === 'unreviewed'
                    ? `Raw observation only: ${lead.summary}`
                    : lead.resolution?.explanation ?? lead.summary;
        return [lead.key, lead.title, JSON.stringify(lead.methods ?? []),
            JSON.stringify(lead.source_locations ?? []), lead.status,
            lead.priority, lead.claim?.expected,
            lead.claim?.observed ?? lead.claim?.suspectedDifference,
            evidence, lead.nextStep?.experiment,
            lead.provenance?.jsSha ?? run.baseSha,
            `${detailFile}#/leads/${index}`].map(cell).join(',');
    });
    return `${[CSV_COLUMNS.map(cell).join(','), ...rows].join('\n')}\n`;
}

function options(args) {
    const [command, ...rest] = args;
    const result = { command };
    for (let i = 0; i < rest.length; i += 2) {
        const key = rest[i], value = rest[i + 1];
        if (!['--out', '--previous', '--history', '--source-previous',
            '--game-root', '--constants-script', '--plan', '--exclusions',
            '--lua-config', '--run', '--decisions', '--keys'].includes(key) || !value)
            throw new Error(`invalid option ${key ?? '(missing)'}`);
        result[key.slice(2).replace(/-([a-z])/gu, (_, letter) =>
            letter.toUpperCase())] = resolve(value);
    }
    if (!['scan', 'classify', 'template'].includes(command) || !result.out)
        throw new Error('usage: discovery-hub.mjs scan --out NEW_DIR [--previous run.json] [--game-root dir] [--constants-script script.mjs] [--lua-config config.json] [--plan plan.json] [--exclusions keys.json]; template --run run.json --keys keys.json --out NEW_FILE; classify --run run.json --decisions decisions.json --out NEW_FILE');
    return result;
}

function recordedMethod(command, args, cwd, output) {
    const result = runCommand(command, args, cwd);
    return { status: result.status, elapsedMs: result.elapsedMs,
        error: result.error, output, sha256: digest(output),
        stdout: result.stdout.trim().slice(0, 1000) };
}

function scan(opts) {
    if (existsSync(opts.out)) throw new Error('output directory must be new');
    const start = new Date().toISOString();
    const previous = opts.previous ? read(opts.previous) : null;
    const exclusions = opts.exclusions ? read(opts.exclusions) : [];
    if (!Array.isArray(exclusions) || exclusions.some(key => typeof key !== 'string'))
        throw new Error('exclusions must be an array of opaque lead keys');
    mkdirSync(opts.out, { recursive: true });
    const gameRoot = opts.gameRoot ?? ROOT;
    const baseSha = execFileSync('git', ['-C', gameRoot, 'rev-parse', 'HEAD'],
        { encoding: 'utf8' }).trim();
    const cGitlink = execFileSync('git', ['-C', gameRoot, 'rev-parse',
        'HEAD:nethack-c/upstream'], { encoding: 'utf8' }).trim();
    const runId = sha(`${baseSha}:${start}:${opts.out}`).slice(0, 20);
    const methods = {}, leads = [];

    const sourcePath = join(gameRoot, 'scripts/source-audit.mjs');
    const mapping = join(gameRoot, 'diagnostics/examples/structural/mappings.json');
    const sourceOut = join(opts.out, 'source-audit');
    if (!existsSync(sourcePath) || !existsSync(mapping)) {
        methods.sourceAudit = { status: 'unavailable',
            reason: 'source audit or mapping file is absent' };
    } else {
        const args = [sourcePath, 'scan', '--out', sourceOut,
            '--mappings', mapping];
        const sourcePrevious = opts.sourcePrevious
            ?? previous?.methods?.sourceAudit?.backlog;
        if (sourcePrevious && existsSync(sourcePrevious))
            args.push('--previous', sourcePrevious);
        const result = recordedMethod(process.execPath, args, gameRoot,
            join(sourceOut, 'backlog.json'));
        methods.sourceAudit = { ...result, backlog: result.output,
            report: join(sourceOut, 'report.json') };
        if (result.status === 'complete') {
            try {
                const backlog = read(result.output);
                const report = read(join(sourceOut, 'report.json'));
                methods.sourceAudit.coverage = {
                    eligibleCFiles: report.scope?.eligibleCFiles ?? null,
                    itemKinds: report.totals?.itemKinds ?? null,
                    messageFilters: report.totals?.messageFilters ?? null,
                    carriedUnobserved: backlog.entries.filter(item => !item.observed).length };
                methods.sourceAudit.sourceHash = report.sourceHash ?? null;
                leads.push(...backlog.entries.filter(item => item.observed)
                    .map(normalizeSource));
            } catch (error) {
                methods.sourceAudit.status = 'failed';
                methods.sourceAudit.error = `invalid adapter output: ${error.message}`;
            }
        }
    }

    const queueScript = join(gameRoot, 'scripts/mismatch-queue.mjs');
    if (!existsSync(queueScript)) methods.mismatchQueue = {
        status: 'unavailable', reason: 'mismatch queue script is absent' };
    else {
        const result = runCommand(process.execPath,
            [queueScript, '--work', '--json'], gameRoot);
        const output = join(opts.out, 'mismatch-queue.json');
        let queue;
        if (result.status === 'complete') {
            try {
                queue = JSON.parse(result.stdout);
                if (!Array.isArray(queue.sessions)
                    || !Array.isArray(queue.candidates)
                    || typeof queue.status !== 'string')
                    throw new Error('missing queue status/sessions/candidates');
                save(output, queue);
            }
            catch (error) { result.status = 'failed'; result.error = error.message; }
        }
        const selectedInputs = (queue?.sessions?.length ?? 0)
            + (queue?.candidates?.length ?? 0);
        methods.mismatchQueue = { status: replaySelectionStatus(queue, result.status),
        selectionStatus: result.status, selectedInputs, replayedCases: 0,
            elapsedMs: result.elapsedMs, error: result.error,
            output: result.status === 'complete' ? output : null,
            sha256: digest(output), coverage: queue ? {
                status: queue.status, availability: queue.availability,
                sessions: queue.sessions?.length ?? 0,
                candidates: queue.candidates?.length ?? 0,
                excluded: queue.excluded?.length ?? 0,
                blockers: queue.blockers?.length ?? 0 } : null };
        if (result.status === 'complete')
            leads.push(...[...(queue.sessions ?? []),
                ...(queue.candidates ?? [])].map(normalizeMismatch));
    }

    const constantScript = opts.constantsScript
        ?? join(ROOT, 'scripts/discover-constants.mjs');
    if (!existsSync(constantScript)) methods.compiledConstants = {
        status: 'unavailable', reason: 'compiled constants script is absent' };
    else {
        const output = join(opts.out, 'compiled-constants.json');
        const result = recordedMethod(process.execPath,
            [constantScript, '--report', output], dirname(dirname(constantScript)),
            output);
        let data = null;
        if (result.status === 'complete') {
            try {
                data = read(output);
                if (data.status === 'complete' && !Array.isArray(data.candidates))
                    throw new Error('missing constants candidate array');
            }
            catch (error) {
                result.status = 'failed';
                result.error = `invalid adapter output: ${error.message}`;
            }
        }
        methods.compiledConstants = data?.status === 'blocked'
            ? { ...result, status: 'unavailable', reason: data.blocked }
            : result;
        if (data) {
            methods.compiledConstants.profileSha256 = sha(JSON.stringify(data.profile));
            methods.compiledConstants.compilerToolHashes = data.toolHashes ?? null;
        }
        if (data?.status === 'complete')
            leads.push(...data.candidates.map(normalizeConstant));
    }

    const luaScript = join(gameRoot, 'scripts/lua-discovery.mjs');
    if (!opts.luaConfig) methods.luaDiscovery = { status: 'unavailable',
        reason: 'no explicitly selected Lua case config supplied' };
    else if (!existsSync(luaScript) || !existsSync(opts.luaConfig))
        methods.luaDiscovery = { status: 'unavailable',
            reason: 'Lua adapter or case config is absent' };
    else {
        const output = join(opts.out, 'lua-discovery');
        const result = recordedMethod(process.execPath,
            [luaScript, opts.luaConfig, output], gameRoot,
            join(output, 'summary.json'));
        methods.luaDiscovery = { ...result,
            method: 'lua-level-generation/v1', ledger: join(output, 'ledger.json'),
            provenance: join(output, 'provenance.json'),
            evidenceDirectory: output };
        if (result.status === 'complete') {
            try {
                const summary = read(result.output);
                const ledger = read(methods.luaDiscovery.ledger);
                if (summary.method !== 'lua-level-generation/v1'
                    || summary.commit !== baseSha
                    || !Array.isArray(summary.cases) || !Array.isArray(ledger)
                    || ledger.length !== summary.cases.length)
                    throw new Error('Lua summary/ledger shape or commit mismatch');
                const cases = new Map(summary.cases.map(item => [item.id, item]));
                if (cases.size !== ledger.length)
                    throw new Error('duplicate Lua case identity');
                leads.push(...ledger.map(item => normalizeLua(item, cases.get(item.id))));
                methods.luaDiscovery.coverage = {
                    cases: summary.candidates, attempts: Object.values(summary.counts)
                        .reduce((sum, count) => sum + count, 0),
                    outcomes: summary.counts,
                    comparableGates: summary.gateOutcomes,
                    cOnlyGates: summary.cOnlyGateOutcomes,
                    cGates: summary.cGateOutcomes,
                };
                methods.luaDiscovery.ledgerSha256 = digest(methods.luaDiscovery.ledger);
                methods.luaDiscovery.provenanceSha256 = digest(methods.luaDiscovery.provenance);
            } catch (error) {
                methods.luaDiscovery.status = 'failed';
                methods.luaDiscovery.error = `invalid adapter output: ${error.message}`;
            }
        }
    }

    if (!opts.plan) methods.structuralPipeline = { status: 'unavailable',
        reason: 'no explicitly reviewed scenario plan supplied' };
    else if (!existsSync(opts.plan)) methods.structuralPipeline = {
        status: 'unavailable', reason: 'scenario plan is absent' };
    else {
        const output = join(opts.out, 'structural-pipeline');
        const result = recordedMethod(process.execPath,
            [join(gameRoot, 'scripts/run-structural-pipeline.mjs'), opts.plan, output],
            gameRoot, join(output, 'summary.json'));
        methods.structuralPipeline = result;
    }

    const checkedAt = new Date().toISOString();
    const sourceAuditDependencies = Object.fromEntries([
        sourcePath,
        join(gameRoot, 'scripts/c-functions.mjs'),
        join(gameRoot, 'scripts/structural-signals.mjs'),
        join(gameRoot, 'scripts/check-namespace-members.mjs'),
        join(gameRoot, 'js/extcmdlist_data.js'), mapping,
    ].map(path => [path.slice(gameRoot.length + 1), digest(path)]));
    const luaDependencies = [luaScript,
        join(gameRoot, 'scripts/diff-fresh.mjs'),
        join(gameRoot, 'scripts/diff-fresh-worker.mjs'),
        join(gameRoot, 'scripts/fresh-matrix.mjs'),
        join(gameRoot, 'scripts/lua-sources.mjs'),
        join(gameRoot, 'scripts/record-session.mjs'),
    ].map(path => [path.slice(gameRoot.length + 1), digest(path)]);
    const toolHashes = { sourceAudit: sha(JSON.stringify(sourceAuditDependencies)),
        mismatchQueue: digest(queueScript), compiledConstants: digest(constantScript),
        luaDiscovery: sha(JSON.stringify(luaDependencies)),
        structuralPipeline: digest(join(gameRoot,
            'scripts/run-structural-pipeline.mjs')) };
    const sourcePreviousPath = opts.sourcePrevious
        ?? previous?.methods?.sourceAudit?.backlog;
    const inputHashes = { sourcePrevious: sourcePreviousPath
        ? digest(sourcePreviousPath) : null,
    plan: opts.plan ? digest(opts.plan) : null,
    luaConfig: opts.luaConfig ? digest(opts.luaConfig) : null };
    const methodConfigHashes = {
        sourceAudit: sha(JSON.stringify({ sourceHash: methods.sourceAudit.sourceHash,
            mapping: digest(mapping) })),
        mismatchQueue: sha(JSON.stringify({ mode: 'work',
            output: methods.mismatchQueue.sha256 ?? null })),
        compiledConstants: sha(JSON.stringify({
            profile: methods.compiledConstants.profileSha256 ?? null,
            compilerTools: methods.compiledConstants.compilerToolHashes ?? null })),
        luaDiscovery: sha(JSON.stringify({ config: inputHashes.luaConfig,
            ledger: methods.luaDiscovery.ledgerSha256 ?? null,
            provenance: methods.luaDiscovery.provenanceSha256 ?? null })),
        structuralPipeline: sha(JSON.stringify({ plan: inputHashes.plan })) };
    const normalized = mergeLeads(leads, previous?.leads,
        new Set(exclusions), checkedAt, { cGitlink, jsSha: baseSha, runId,
            sourceAuditSourceHash: methods.sourceAudit.sourceHash ?? null,
            methodConfigHashes,
            methodVersions: Object.fromEntries(Object.entries(toolHashes)
                .map(([name, value]) => [name, `sha256:${value ?? 'unavailable'}`])),
            sourceAuditToolSha256: digest(sourcePath),
            constantsToolSha256: digest(constantScript),
            mappingSha256: digest(mapping) });
    const priorKeys = new Set(previous?.leads?.map(lead => lead.key) ?? []);
    for (const [name, method] of Object.entries(methods)) {
        const selected = normalized.filter(lead => lead.observed
            && lead.method === name);
        method.leadCounts = { observed: selected.length,
            new: selected.filter(lead => !priorKeys.has(lead.key)).length,
            duplicate: selected.filter(lead => priorKeys.has(lead.key)).length };
    }
    const run = { schemaVersion: 1, runId, baseSha, cGitlink, gameRoot, startedAt: start,
        completedAt: new Date().toISOString(), previous: opts.previous ?? null,
        exclusionsSha256: opts.exclusions ? digest(opts.exclusions) : null,
        toolHashes, sourceAuditDependencies, luaDependencies,
        methodConfigHashes, inputHashes,
        methods, leads: normalized };
    for (const lead of run.leads) validateLeadShape(lead);
    save(join(opts.out, 'run.json'), run);
    writeFileSync(join(opts.out, 'leads.csv'), leadIndexCsv(run));
    save(join(opts.out, 'active-leads.json'), activeLeadIndex(run));
    return run;
}

function main(args) {
    const opts = options(args);
    if (opts.command === 'template') {
        if (!opts.run || !opts.keys) throw new Error('template needs --run and --keys');
        if (existsSync(opts.out)) throw new Error('template output must be new');
        const keys = read(opts.keys);
        if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string'))
            throw new Error('keys must be an array of lead IDs');
        save(opts.out, reviewTemplate(read(opts.run), keys));
        console.log(`discovery hub: prepared ${keys.length} bound review rows; ${opts.out}`);
    } else if (opts.command === 'classify') {
        if (!opts.run || !opts.decisions) throw new Error('classify needs --run and --decisions');
        if (existsSync(opts.out)) throw new Error('classification output must be new');
        const result = applyDecisions(read(opts.run), read(opts.decisions));
        save(opts.out, result);
        writeFileSync(`${opts.out}.csv`, leadIndexCsv(result, basename(opts.out)));
        save(`${opts.out}.active.json`, activeLeadIndex(result));
        console.log(`discovery hub: classified ${read(opts.decisions).length} leads; ${opts.out}`);
    } else {
        const result = scan(opts);
        console.log(`discovery hub: ${result.leads.length} source-keyed leads; `
            + `${Object.entries(result.methods).map(([name, value]) =>
                `${name}=${value.status}`).join(', ')}; ${opts.out}/run.json`);
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(`discovery hub: ${error.message}`); process.exitCode = 1; }
}
