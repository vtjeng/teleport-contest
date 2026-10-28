// Packaging checks only: never executes evidence commands or certifies semantics.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateProjection } from './discovery-project.mjs';
import { checkTestLayout } from './checkpoint-preflight.mjs';

const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const text = value => typeof value === 'string' && value.trim().length > 0;
const check = (ok, message) => { if (!ok) throw new Error(message); };
const relative = path => text(path) && !path.includes('\\') && !path.startsWith('/')
    && !path.split('/').some(part => !part || part === '.' || part === '..');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const exitCode = value => Number.isInteger(value) && value >= 0 && value <= 255;
const statuses = ['candidate', 'explained_negative', 'unresolved', 'invalid_setup'];

export function caseTemplate(caseId, shard) {
    return {
        schemaVersion: 1, caseId, shard, status: 'unresolved', readiness: 'incomplete',
        rootCause: null, relatedCases: [],
        provenance: { jsSha: null, cGitlink: null }, source_locations: [],
        hypothesis: '', expectedBehavior: '', observedBehavior: '',
        witness: { kind: 'source', scope: '', limitations: [] },
        exposure: { route: 'unestablished', attribution: 'unresolved', evidence: [], reason: '' },
        origin: { kind: 'manual', reason: '', keys: [], projection: null, manifest: null, decisions: null },
        commands: [], artifacts: [], dependencies: [],
    };
}

export function validatePackage(c, { root = process.cwd() } = {}) {
    if (c.schemaVersion === undefined) return { format: 'legacy', validated: false,
        reason: 'No schemaVersion; retained without promotion. Convert explicitly using the v1 template.' };
    check(c.schemaVersion === 1, 'unsupported case schemaVersion');
    check(Object.keys(c).every(key => Object.hasOwn(caseTemplate('', ''), key)), 'unknown v1 case field');
    check(/^[a-z0-9][a-z0-9-]*$/u.test(c.caseId ?? '') && text(c.shard), 'invalid case identity');
    check(statuses.includes(c.status), 'invalid status');
    check(['incomplete', 'review_ready'].includes(c.readiness), 'invalid readiness');
    check(c.rootCause === null || text(c.rootCause), 'rootCause must be null or a semantic identifier');
    check(Array.isArray(c.relatedCases) && c.relatedCases.every(text)
        && new Set(c.relatedCases).size === c.relatedCases.length, 'invalid relatedCases');
    check(sha(c.provenance?.jsSha) && sha(c.provenance?.cGitlink), 'exact C/JS bases required');
    for (const field of ['hypothesis', 'expectedBehavior', 'observedBehavior']) check(text(c[field]), `missing ${field}`);
    check(Array.isArray(c.source_locations) && c.source_locations.length > 0, 'source_locations required');
    for (const loc of c.source_locations) {
        check(['C', 'JS'].includes(loc.side) && relative(loc.path)
            && (loc.symbol === null || text(loc.symbol)) && sha(loc.commit_sha)
            && loc.commit_sha === (loc.side === 'C' ? c.provenance.cGitlink : c.provenance.jsSha)
            && ((loc.start_line === null && loc.end_line === null)
                || (Number.isInteger(loc.start_line) && loc.start_line > 0
                    && Number.isInteger(loc.end_line) && loc.end_line >= loc.start_line)), 'invalid source location/base');
    }
    check(['source', 'compiled_oracle', 'production_api', 'public_recording'].includes(c.witness?.kind)
        && text(c.witness.scope) && Array.isArray(c.witness.limitations)
        && c.witness.limitations.every(text), 'invalid witness scope');
    check(['unestablished', 'api', 'shipped'].includes(c.exposure?.route)
        && ['unresolved', 'attributed', 'not_applicable'].includes(c.exposure.attribution)
        && Array.isArray(c.exposure.evidence) && c.exposure.evidence.every(text)
        && text(c.exposure.reason), 'invalid exposure');
    check(c.exposure.attribution !== 'attributed' || (c.exposure.route !== 'unestablished'
        && c.exposure.evidence.length > 0), 'attribution requires route and evidence');
    check(c.exposure.route !== 'shipped' || c.exposure.evidence.length > 0, 'shipped exposure requires evidence');
    check(!['unresolved', 'invalid_setup'].includes(c.status) || c.readiness === 'incomplete',
        'unresolved/invalid setup cannot be review_ready');

    const files = new Map();
    const rootPath = realpathSync(root);
    for (const field of ['artifacts', 'dependencies']) {
        check(Array.isArray(c[field]), `missing ${field}`);
        for (const entry of c[field]) {
            check(relative(entry.path) && hash(entry.sha256) && text(entry.role), `invalid ${field} entry`);
            check(!files.has(entry.path), `duplicate file: ${entry.path}`);
            const path = realpathSync(resolve(rootPath, entry.path));
            check(path.startsWith(rootPath + sep), `file escapes package root: ${entry.path}`);
            const bytes = readFileSync(path);
            check(digest(bytes) === entry.sha256, `hash mismatch: ${entry.path}`);
            files.set(entry.path, bytes);
        }
    }
    const file = path => { check(files.has(path), `unlisted reference: ${path}`); return files.get(path); };
    const json = path => JSON.parse(file(path));
    c.exposure.evidence.forEach(file);
    const pending = [];
    check(Array.isArray(c.commands), 'commands must be an array');
    const commandIds = new Set(), roles = new Set();
    for (const command of c.commands) {
        check(text(command.id) && !commandIds.has(command.id), 'invalid/duplicate command id');
        commandIds.add(command.id);
        check(['target', 'control', 'post_fix'].includes(command.role), 'invalid command role');
        roles.add(command.role);
        check(Array.isArray(command.argv) && command.argv.length > 0 && command.argv.every(text)
            && command.argv.includes(command.runner) && command.cwd === '.' && exitCode(command.expectedExit), 'invalid command argv/cwd/expectedExit');
        check(relative(command.runner) && ['manual', 'default'].includes(command.ci), 'invalid runner/CI inclusion');
        file(command.runner);
        check(Array.isArray(command.inputs) && command.inputs.every(relative), 'command inputs required');
        command.inputs.forEach(file);
        check(command.ci !== 'default' || /^scripts\/[^/]+\.test\.mjs$/u.test(command.runner),
            'default CI runner must be a directly discovered scripts/*.test.mjs file');
        check(command.ci !== 'default' || command.expectedExit === 0,
            'expected failing witnesses cannot be default CI tests');
        check(command.ci !== 'manual' || !command.runner.endsWith('.test.mjs'),
            'manual runner must use .mjs, not an undiscovered .test.mjs name');
        if (command.receipt === null) {
            if (command.role !== 'post_fix') pending.push(`missing receipt: ${command.id}`);
            continue;
        }
        const receipt = json(command.receipt);
        check(receipt.schemaVersion === 1 && receipt.commandId === command.id
            && receipt.cwd === command.cwd && receipt.jsSha === c.provenance.jsSha
            && receipt.cGitlink === c.provenance.cGitlink && text(receipt.recordedAt)
            && Number.isFinite(Date.parse(receipt.recordedAt)), `invalid receipt identity: ${command.id}`);
        check(receipt.toolVersions && typeof receipt.toolVersions === 'object'
            && !Array.isArray(receipt.toolVersions) && Object.keys(receipt.toolVersions).length > 0
            && Object.values(receipt.toolVersions).every(text), `receipt toolVersions required: ${command.id}`);
        assert.deepEqual(receipt.argv, command.argv, `receipt command mismatch: ${command.id}`);
        check(receipt.exitCode === command.expectedExit, `unexpected exit: ${command.id}`);
        assert.deepEqual(receipt.inputHashes, Object.fromEntries(command.inputs.map(path => [path, digest(file(path))])),
            `receipt inputs changed: ${command.id}`);
        check(receipt.runnerSha256 === digest(file(command.runner)), `receipt runner changed: ${command.id}`);
        check(Array.isArray(receipt.outputs) && receipt.outputs.length > 0, `receipt outputs required: ${command.id}`);
        receipt.outputs.forEach(file);
    }
    if (!roles.has('target')) pending.push('missing target command');
    if (!roles.has('control')) pending.push('missing control command');
    if (c.status === 'candidate' && !roles.has('post_fix')) pending.push('missing post_fix check');
    check(c.readiness !== 'review_ready' || pending.length === 0, pending.join('; '));

    const origin = c.origin;
    check(['manual', 'scanner'].includes(origin?.kind) && Array.isArray(origin.keys), 'invalid origin');
    let discovery = null;
    if (origin.kind === 'manual') {
        check(text(origin.reason) && origin.keys.length === 0 && origin.projection === null
            && origin.manifest === null && origin.decisions === null, 'manual origin cannot invent scanner bindings');
    } else {
        check(origin.keys.length > 0 && origin.keys.every(text)
            && new Set(origin.keys).size === origin.keys.length, 'scanner keys required');
        const projection = json(origin.projection), manifest = json(origin.manifest);
        check(manifest.projectionSha256 === digest(file(origin.projection)), 'projection manifest hash mismatch');
        check(manifest.runId === projection.runId && hash(manifest.originalRunSha256)
            && hash(manifest.exporterSha256) && hash(manifest.hubSha256), 'invalid projection manifest provenance');
        assert.deepEqual(manifest.selectedKeys, projection.leads.map(lead => lead.key), 'projection manifest keys mismatch');
        for (const key of origin.keys) check(projection.leads.some(lead => lead.key === key), `unknown scanner key: ${key}`);
        const decisions = origin.decisions === null ? undefined : json(origin.decisions);
        if (decisions) {
            check(manifest.decisionsSha256 === digest(file(origin.decisions)), 'decision manifest hash mismatch; re-export with final decisions');
            check(decisions.every(d => origin.keys.includes(d.key)), 'unrelated decision in case');
            const expected = { explained_negative: 'explained_negative', unresolved: 'unresolved', candidate: 'confirmed' }[c.status];
            check(expected && decisions.every(d => d.status === expected), 'case/decision status contradiction');
        }
        if (c.status === 'explained_negative') check(decisions?.length === origin.keys.length,
            'scanner negative needs exact decisions for every case key');
        discovery = validateProjection(projection, { decisions });
    }
    return { format: 'v1', validated: true, caseId: c.caseId, status: c.status,
        readiness: c.readiness, pending, filesChecked: files.size, discovery,
        tools: Object.fromEntries(['evidence-package.mjs', 'discovery-project.mjs', 'checkpoint-preflight.mjs']
            .map(name => [name, digest(readFileSync(new URL(name, import.meta.url)))])),
        semanticCorrectness: 'not-assessed', exposure: c.exposure };
}

function main(args) {
    if (args[0] === 'template' && args.length === 3) {
        console.log(JSON.stringify(caseTemplate(args[1], args[2]), null, 2)); return;
    }
    if (args[0] !== 'validate' || ![2, 4].includes(args.length)
        || (args.length === 4 && args[2] !== '--commit'))
        throw new Error('usage: evidence-package.mjs template ID SHARD | validate CASE.json [--commit SHA]');
    const result = validatePackage(JSON.parse(readFileSync(args[1], 'utf8')));
    if (result.validated) {
        result.layout = checkTestLayout(process.cwd(), args[3] ?? 'HEAD');
        check(result.layout.passed, `committed test layout failed: ${result.layout.stray.join(', ')}`);
    }
    console.log(JSON.stringify(result, null, 2));
    if (!result.validated) process.exitCode = 2;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(`evidence package: ${error.message}`); process.exitCode = 1; }
}
