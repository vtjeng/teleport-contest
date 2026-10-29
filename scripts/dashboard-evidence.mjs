#!/usr/bin/env node
// Rebuild a compact projection from explicitly pinned metadata only. Offline by
// default: fetch the listed PR refs separately. Never execute evidence runners.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { reviewFingerprint } from './discovery-hub.mjs';
import { discoverySummary } from './dashboard-workflow.mjs';

export function buildEvidence(config, read) {
  if (config.version !== 1) throw new Error('Unsupported evidence source version');
  const sources = [], cases = [], cohorts = [], audits = [];
  const load = (source, path = source.path) => {
    if (!/^[a-f0-9]{40}$/u.test(source.ref) || !/^diagnostics\/[\w/.-]+\.json$/u.test(path)
        || path.split('/').includes('..')) throw new Error('Expected pinned metadata path');
    const bytes = read(source.ref, path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const url = `https://github.com/vtjeng/teleport-contest/blob/${source.ref}/${path}`;
    if (!sources.some(item => item.url === url)) sources.push({ ref: source.ref, path, sha256, url });
    return JSON.parse(bytes);
  };
  for (const input of config.inventories) {
    const inventory = load(input);
    const completion = input.completion ? load(input.completion) : null;
    let leads = inventory.leads ?? load(input, input.keysPath).map(key => ({ key }));
    const reviews = [], projections = [];
    for (const source of input.cases) {
      const value = load(source), dir = dirname(source.path);
      const projection = load(source, value.origin?.projection ?? `${dir}/projection/projection.json`);
      let decisions = load(source, value.origin?.decisions ?? `${dir}/decisions.json`);
      if (!decisions.length && value.status === 'unresolved') decisions = projection.leads
        .filter(lead => value.origin.keys.includes(lead.key)).map(lead => ({ key: lead.key,
          evidenceKey: lead.evidenceKey, runId: projection.runId,
          reviewFingerprint: reviewFingerprint(projection, lead), status: 'unresolved' }));
      if (projection.runId !== inventory.runId) throw new Error('Cross-run review');
      projections.push(projection);
      const outcome = ({ candidate: 'confirmed', 'explained negative': 'explained_negative' })[value.status ?? value.outcome]
        ?? value.status ?? value.outcome;
      const done = completion?.caseId === value.caseId && completion.routingStatus === 'fully_accepted'
        && ['Checkpoint', 'archive comparison', 'Main Lint', 'Dashboard']
          .every(stage => completion.confirmedStages?.includes(stage))
        && completion.confirmedStages.some(stage => /^complete \d+-evaluation receipt$/u.test(stage));
      const item = { id: value.caseId, root: value.rootCause ?? null, outcome: done ? 'accepted' : outcome,
        reportedReady: outcome === 'confirmed' && (value.readiness === 'review_ready' || value.ready === true),
        reviewedAt: value.reviewedAt ?? null, keys: decisions.map(decision => decision.key), prs: [source.pr],
        ref: source.ref, url: `https://github.com/vtjeng/teleport-contest/blob/${source.ref}/${source.path}`,
        events: value.workflow?.events ?? [],
        completion: done ? { verified: true, sha: completion.mainSha, completedAt: null,
          recordedAt: completion.recordedAt, authority: completion.receiptAuthority } : null };
      cases.push(item);
      for (const decision of decisions) {
        const lead = projection.leads.find(row => row.key === decision.key);
        if (!lead || decision.runId !== projection.runId || decision.evidenceKey !== lead.evidenceKey
            || decision.reviewFingerprint !== reviewFingerprint(projection, lead)) throw new Error('Stale decision binding');
        const methods = lead.methods.filter(method => method.run_id === projection.runId);
        reviews.push({ ...decision, root: item.root, methods,
          status: done ? 'accepted' : decision.status,
          filter: decision.status === 'explained_negative' ? 'exact-bound-decision' : null });
        // The Monsters key inventory has no fingerprints; bind only selected
        // records against their original projection, never another run's summary.
        leads = leads.map(row => row.key === lead.key && !row.evidenceKey
          ? { ...row, evidenceKey: lead.evidenceKey, reviewFingerprint: reviewFingerprint(projection, lead) } : row);
      }
    }
    const sample = projections[0];
    const summary = discoverySummary({ runId: inventory.runId, leads, reviews });
    const methodsForLead = lead => {
      const recorded = projections.flatMap(run => run.leads).find(row => row.key === lead.key);
      if (recorded) return recorded.methods.filter(method => method.run_id === inventory.runId);
      if (!lead.key.startsWith('source-audit:')) return [];
      return [{ kind: lead.key.startsWith('source-audit:message:') ? 'missing_message' : 'call_graph',
        version: `sha256:${sample.toolHashes.sourceAudit}`, run_id: inventory.runId }];
    };
    const identity = method => JSON.stringify(method);
    const methods = [...new Map(leads.flatMap(methodsForLead).map(method => [identity(method), method])).values()];
    const strata = methods.map(method => ({ method,
      ...discoverySummary({ runId: inventory.runId,
        leads: leads.filter(lead => methodsForLead(lead).some(ref => identity(ref) === identity(method))),
        reviews: reviews.filter(review => review.methods.some(ref => identity(ref) === identity(method))) }) }));
    const techniqueCoverageUnknown = leads.filter(lead => !methodsForLead(lead).length).length;
    cohorts.push({ id: input.id, ref: input.ref, pr: input.pr, runId: inventory.runId,
      scanBase: inventory.base ?? inventory.baseSha, cGitlink: inventory.cGitlink,
      runSha256: inventory.runSha256, scanCompletedAt: sample.completedAt,
      reviewAsOf: inventory.reviewedAt ?? cases.filter(item => item.prs.includes(input.pr))
        .map(item => item.reviewedAt).filter(Boolean).sort().at(-1) ?? null,
      configHashes: sample.methodConfigHashes, toolHashes: sample.toolHashes,
      sourceHash: sample.methods?.sourceAudit?.sourceHash ?? inventory.sourceAuditSourceHash,
      rawFileScoped: inventory.counts?.rawFileScoped ?? inventory.totalKeys,
      scope: inventory.scope?.limits ?? inventory.countSemantics,
      summary, strata, techniqueCoverageUnknown });
  }
  for (const source of config.audits) {
    const value = load(source);
    audits.push({ id: value.caseId, pr: source.pr, ref: source.ref,
      url: `https://github.com/vtjeng/teleport-contest/blob/${source.ref}/${source.path}`,
      outcome: value.status ?? value.outcome,
      scope: value.witness?.scope ?? value.scope ?? 'Finite source declaration comparison',
      limitations: value.witness?.limitations ?? value.limitations ?? [] });
  }
  return { version: 1, sources, cohorts, cases, audits };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const config = JSON.parse(readFileSync('trial-monitor/evidence-sources.json', 'utf8'));
  const result = buildEvidence(config, (ref, path) => execFileSync('git', ['show', `${ref}:${path}`],
    { maxBuffer: 16 * 1024 * 1024 }));
  const text = JSON.stringify(result, null, 2) + '\n';
  if (process.argv[2] === '--check') {
    if (readFileSync('trial-monitor/evidence.json', 'utf8') !== text) throw new Error('Evidence projection differs');
  } else if (process.argv.length === 2) writeFileSync('trial-monitor/evidence.json', text);
  else throw new Error('Usage: node scripts/dashboard-evidence.mjs [--check]');
}
