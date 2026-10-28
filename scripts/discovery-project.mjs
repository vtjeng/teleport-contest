#!/usr/bin/env node
// Lossless metadata projection and review validation; never repairs provenance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { activeLeadIndex, applyDecisions, reviewFingerprint, reviewTemplate, validateLeadShape } from './discovery-hub.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const nonempty = value => typeof value === 'string' && value.length > 0;
function complete(run) {
    if (!run || typeof run !== 'object') throw new Error('invalid run');
    for (const key of ['runId', 'baseSha', 'cGitlink', 'inputHashes',
        'toolHashes', 'methodConfigHashes', 'exclusionsSha256', 'methods'])
        if (!Object.hasOwn(run, key)) throw new Error(`missing run.${key}`);
    if (!nonempty(run.runId) || !/^[a-f0-9]{40}$/u.test(run.baseSha)
        || !/^[a-f0-9]{40}$/u.test(run.cGitlink) || !Array.isArray(run.leads))
        throw new Error('invalid canonical run identity/leads');
    for (const key of ['inputHashes', 'toolHashes', 'methodConfigHashes', 'methods'])
        if (!run[key] || typeof run[key] !== 'object' || Array.isArray(run[key]))
            throw new Error(`invalid run.${key}`);
    const seen = new Set();
    for (const lead of run.leads) {
        validateLeadShape(lead);
        if (seen.has(lead.key)) throw new Error(`duplicate lead: ${lead.key}`);
        seen.add(lead.key);
        if (!lead.observed) continue; // retain historical rows without promoting them
        const method = lead.method;
        if (!nonempty(run.toolHashes?.[method])) throw new Error(`missing run.toolHashes.${method}`);
        if (!nonempty(run.methodConfigHashes?.[method])) throw new Error(`missing run.methodConfigHashes.${method}`);
        if (method === 'sourceAudit' && !nonempty(run.methods?.sourceAudit?.sourceHash))
            throw new Error('missing run.methods.sourceAudit.sourceHash');
    }
}
export function validateProjection(projection, { original, decisions } = {}) {
    complete(projection);
    const keys = new Set(projection.leads.map(lead => lead.key));
    if (original) {
        complete(original);
        const metadata = run => Object.fromEntries(Object.entries(run).filter(([key]) => key !== 'leads'));
        assert.deepEqual(metadata(projection), metadata(original), 'projection changed or omitted run metadata');
        assert.deepEqual(projection.leads, original.leads.filter(lead => keys.has(lead.key)),
            'projection changed, reordered or invented a lead');
        assert.equal(projection.leads.length, keys.size);
        for (const lead of projection.leads) {
            const prior = original.leads.find(item => item.key === lead.key);
            assert.equal(reviewFingerprint(projection, lead), reviewFingerprint(original, prior));
        }
        const originalView = activeLeadIndex(original), view = activeLeadIndex(projection);
        for (const field of ['active', 'filtered', 'excluded'])
            assert.deepEqual(view[field], originalView[field].filter(item => keys.has(typeof item === 'string' ? item : item.key)),
                `projection changed ${field} membership`);
    }
    const before = activeLeadIndex(projection);
    let after = before;
    if (decisions !== undefined) {
        if (!Array.isArray(decisions)) throw new Error('decisions must be an array');
        const seen = new Set();
        for (const decision of decisions) {
            if (seen.has(decision.key)) throw new Error(`duplicate decision: ${decision.key}`);
            seen.add(decision.key);
            if (!projection.leads.find(lead => lead.key === decision.key)?.observed)
                throw new Error(`decision requires an observed selected lead: ${decision.key}`);
        }
        after = activeLeadIndex(applyDecisions(projection, decisions));
        for (const decision of decisions) {
            const field = decision.status === 'explained_negative' ? 'filtered'
                : decision.status === 'excluded' ? 'excluded' : 'active';
            if (!after[field].some(item => (typeof item === 'string' ? item : item.key) === decision.key))
                throw new Error(`decision imported but expected ${field} membership is absent: ${decision.key}; review source/tool/config freshness`);
        }
    }
    const counts = view => ({ active: view.active.length, filtered: view.filtered.length, excluded: view.excluded.length });
    return { originalComparison: original ? 'verified' : 'not-supplied',
        selected: projection.leads.length, decisionsChecked: decisions?.length ?? 0,
        before: counts(before), after: counts(after) };
}
export function projectRun(original, keys, decisions) {
    complete(original);
    if (!Array.isArray(keys) || !keys.length || keys.some(key => !nonempty(key))
        || new Set(keys).size !== keys.length) throw new Error('keys must be a nonempty unique array of lead IDs');
    const wanted = new Set(keys);
    for (const key of keys) if (!original.leads.some(lead => lead.key === key)) throw new Error(`unknown lead: ${key}`);
    const projection = structuredClone({ ...original, leads: original.leads.filter(lead => wanted.has(lead.key)) });
    const validation = validateProjection(projection, { original, decisions });
    return { projection, validation, template: reviewTemplate(projection, keys) };
}
function main(args) {
    const [command, ...rest] = args, opts = {};
    if (!['export', 'validate'].includes(command)) throw new Error('use export or validate');
    for (let i = 0; i < rest.length; i += 2) {
        const key = rest[i]?.replace(/^--/u, '');
        if (!['run', 'keys', 'out', 'projection', 'decisions'].includes(key) || !rest[i + 1] || opts[key])
            throw new Error(`invalid/repeated option: ${rest[i]}`);
        opts[key] = resolve(rest[i + 1]);
    }
    const read = path => JSON.parse(readFileSync(path, 'utf8'));
    const decisionBytes = opts.decisions ? readFileSync(opts.decisions) : undefined;
    const decisions = decisionBytes ? JSON.parse(decisionBytes) : undefined;
    if (command === 'validate') {
        if (!opts.projection || opts.keys || opts.out) throw new Error('validate requires --projection [--run ORIGINAL] [--decisions FILE]');
        console.log(JSON.stringify(validateProjection(read(opts.projection), {
            original: opts.run ? read(opts.run) : undefined, decisions }), null, 2));
        return;
    }
    if (!opts.run || !opts.keys || !opts.out || opts.projection)
        throw new Error('export requires --run ORIGINAL --keys FILE --out NEW_DIR [--decisions FILE]');
    if (existsSync(opts.out)) throw new Error('output directory must be new');
    const originalBytes = readFileSync(opts.run), original = JSON.parse(originalBytes);
    const { projection, validation, template } = projectRun(original, read(opts.keys), decisions);
    const projectionBytes = `${JSON.stringify(projection, null, 2)}\n`;
    const manifest = { version: 1, exporterSha256: hash(readFileSync(new URL(import.meta.url))),
        hubSha256: hash(readFileSync(new URL('./discovery-hub.mjs', import.meta.url))),
        originalRunSha256: hash(originalBytes), originalLeadCount: original.leads.length,
        projectionSha256: hash(projectionBytes), runId: projection.runId,
        selectedKeys: projection.leads.map(lead => lead.key),
        decisionsSha256: decisionBytes ? hash(decisionBytes) : null, validation };
    // Validate completely before producing any output, and never overwrite a run.
    mkdirSync(dirname(opts.out), { recursive: true });
    mkdirSync(opts.out);
    for (const [name, value] of [['projection.json', projection], ['manifest.json', manifest], ['review-template.json', template]])
        writeFileSync(resolve(opts.out, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify(manifest, null, 2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(`discovery projection: ${error.message}`); process.exitCode = 1; }
}
