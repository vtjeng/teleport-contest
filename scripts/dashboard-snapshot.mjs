#!/usr/bin/env node

// Publish only dashboard fields from the local worker ledger and the last
// accepted development checkpoint. CI cannot read the ignored .cache files.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT_TYPES = new Set([
  'assign', 'ready', 'received', 'feedback', 'resume', 'park',
  'integrating', 'validated', 'accepted', 'published',
]);

export function activityFromLedger(ledger) {
  if (!/^loop-20\d{6}$/u.test(ledger?.runId ?? '')
      || ledger.runId < 'loop-20260925' || !Array.isArray(ledger.events)) {
    throw new Error('expected a worker ledger from loop-20260925 or later');
  }
  return {
    runId: ledger.runId,
    events: ledger.events.filter(event => EVENT_TYPES.has(event.type)).map(event => ({
      runId: ledger.runId, id: event.id, type: event.type, at: event.at,
      ...(event.task ? { task: event.task } : {}),
      ...(event.worker ? { worker: event.worker } : {}),
      ...(event.goal ? { goal: event.goal } : {}),
      ...(event.kind ? { kind: event.kind } : {}),
      ...(event.delivery ? { delivery: event.delivery } : {}),
      ...(event.integration ? { integration: event.integration } : {}),
      ...(event.commit ? { commit: event.commit } : {}),
      ...(event.passed !== undefined ? { passed: event.passed } : {}),
    })),
  };
}

export function mergeActivity(previous, current) {
  const events = new Map();
  for (const event of [...(previous?.events ?? []), ...current.events]) {
    const normalized = { ...event, runId: event.runId ?? previous?.runId };
    events.set(normalized.runId + '/' + normalized.id, normalized);
  }
  return { runId: current.runId,
    events: [...events.values()].sort((a, b) => a.at.localeCompare(b.at)) };
}

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

function main(args) {
  const option = name => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1]) throw new Error(`missing ${name}`);
    return args[index + 1];
  };
  const ledger = JSON.parse(readFileSync(option('--ledger'), 'utf8'));
  const summary = JSON.parse(readFileSync(option('--checkpoint'), 'utf8'));
  const resultBytes = readFileSync(join(summary.artifacts, 'session-results.json'));
  const results = JSON.parse(resultBytes);
  const outputPath = option('--output');
  const previous = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, 'utf8')) : null;
  const snapshot = {
    version: 1,
    capturedAt: new Date().toISOString(),
    activity: mergeActivity(previous?.activity, activityFromLedger(ledger)),
    development: developmentFromCheckpoint(summary, results, resultBytes),
  };
  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
