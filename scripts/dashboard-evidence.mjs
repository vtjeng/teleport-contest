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

// Completion notices are metadata assertions with explicit authority, exact SHA,
// named cases and all gates. Observation time is never an acceptance timestamp.
export function completionEvidence(value, source) {
  const sha = value.mainSha ?? value.acceptedSha;
  const authority = value.receiptAuthority ?? value.authority;
  const ids = value.caseId ? [value.caseId] : value.relatedCases;
  const stages = value.confirmedStages;
  if (value.recordedAt != null && !Number.isFinite(Date.parse(value.recordedAt))) return null;
  const complete = Array.isArray(stages)
    ? ['Checkpoint', 'archive comparison', 'Main Lint', 'Dashboard'].every(stage => stages.includes(stage))
      && stages.some(stage => /^complete \d+-evaluation receipt$/u.test(stage))
    : [value.checkpoint, value.mainLint, value.dashboard].every(id => Number.isSafeInteger(id) && id > 0)
      && value.archiveComparison === 'passed' && value.completeReceipt === 'passed';
  if ((value.routingStatus ?? value.status) !== 'fully_accepted' || !complete
      || !/^[a-f0-9]{40}$/u.test(sha ?? '') || typeof authority !== 'string' || !authority
      || !Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id)) return null;
  return { caseIds: ids, sha, authority, recordedAt: value.recordedAt ?? null,
    completedAt: null, source };
}

export function buildEvidence(config, read) {
  if (config.version !== 1) throw new Error('Unsupported evidence source version');
  const sources = [], cases = [], cohorts = [], audits = [];
  const load = (source, path = source.path) => {
    if (source.allowedDirectory && !path.startsWith(source.allowedDirectory)
        || (source.excludedPathFragments ?? []).some(fragment => path.includes(fragment)))
      throw new Error('Metadata outside allowed directory or excluded scope');
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
    if (inventory.reviewedAt != null && !Number.isFinite(Date.parse(inventory.reviewedAt)))
      throw new Error('Malformed inventory review timestamp');
    const completionRefs = [...(input.completion ? [input.completion] : []), ...(input.completions ?? [])];
    const completions = completionRefs.map(source => completionEvidence(load(source), source)).filter(Boolean);
    const unboundCases = [];
    const sourceComparisons = new Set();
    let leads = inventory.leads ?? load(input, input.keysPath).map(key => ({ key }));
    const reviews = [], projections = [];
    for (const source of input.cases) {
      const value = load(source), dir = dirname(source.path);
      if (value.reviewedAt != null && !Number.isFinite(Date.parse(value.reviewedAt)))
        throw new Error('Malformed case review timestamp');
      const manual = value.schemaVersion === 1 && value.origin?.kind === 'manual';
      const projection = manual ? null : load(source, value.origin?.projection ?? `${dir}/projection/projection.json`);
      if (projection && (typeof projection.runId !== 'string' || !projection.runId
          || !/^[a-f0-9]{40}$/u.test(projection.baseSha ?? '')
          || !/^[a-f0-9]{40}$/u.test(projection.cGitlink ?? '')
          || !Array.isArray(projection.leads) || !projection.toolHashes || !projection.methodConfigHashes))
        throw new Error('Malformed scanner projection metadata');
      let decisions = manual || value.origin?.decisions === null ? [] : load(source, value.origin?.decisions ?? `${dir}/decisions.json`);
      if (!manual && !decisions.length && ['unresolved', 'invalid_setup'].includes(value.status)) decisions = projection.leads
        .filter(lead => value.origin.keys.includes(lead.key)).map(lead => ({ key: lead.key,
          evidenceKey: lead.evidenceKey, runId: projection.runId,
          reviewFingerprint: reviewFingerprint(projection, lead), status: value.status }));
      const sameRun = projection?.runId === inventory.runId;
      if (sameRun) {
        if (projection.baseSha !== (inventory.base ?? inventory.baseSha) || projection.cGitlink !== inventory.cGitlink)
          throw new Error('Inventory source differs from bound run');
        sourceComparisons.add(JSON.stringify([projection.baseSha, projection.cGitlink, projection.toolHashes, projection.methodConfigHashes, projection.inputHashes]));
        if (sourceComparisons.size > 1) throw new Error('Incomparable source/config metadata in one run');
        projections.push(projection);
      }
      const outcome = ({ candidate: 'confirmed', 'explained negative': 'explained_negative' })[value.status ?? value.outcome]
        ?? value.status ?? value.outcome;
      const matchingCompletions = outcome === 'confirmed'
        ? completions.filter(completion => completion.caseIds.includes(value.caseId)) : [];
      const done = matchingCompletions.length > 0;
      const completion = matchingCompletions[0];
      const item = { id: value.caseId, root: value.rootCause ?? null, outcome: done ? 'accepted' : outcome,
        reportedReady: outcome === 'confirmed' && (value.readiness === 'review_ready' || value.ready === true),
        reviewedAt: value.reviewedAt ?? null, keys: value.origin?.keys ?? decisions.map(decision => decision.key), prs: [source.pr],
        category: manual ? 'manual' : sameRun ? 'scanner' : 'other-run',
        ref: source.ref, url: `https://github.com/vtjeng/teleport-contest/blob/${source.ref}/${source.path}`,
        events: value.workflow?.events ?? [],
        completion: done ? { verified: true, sha: completion.sha, completedAt: null,
          recordedAt: completion.recordedAt, authority: completion.authority, references: matchingCompletions } : null };
      cases.push(item);
      if (!sameRun) {
        unboundCases.push({ id: item.id, outcome: item.outcome, category: item.category, url: item.url,
          reason: manual ? 'Manual evidence; no scanner denominator' : 'Different frozen run; not pooled into this inventory' });
        continue;
      }
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
    if (!sample) throw new Error('No comparable scanner projection; inventory coverage unknown');
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
    cohorts.push({ refresh: input.refreshStatus ?? null, unboundCases,
      skippedMetadata: input.skippedMetadata ?? [],
      completionCoverage: { references: completionRefs.length, verified: completions.length,
        unsupported: completionRefs.length - completions.length },
      id: input.id, ref: input.ref, pr: input.pr, runId: inventory.runId,
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
