#!/usr/bin/env node

// Publish only dashboard fields from the local worker ledger and the last
// accepted development checkpoint. CI cannot read the ignored .cache files.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeLedger } from './worker-state.mjs';
import { pendingMainWork } from './worker-backlog.mjs';
import { admittedBatchIds } from './challenge-results.mjs';
import {publicQueue} from './assignment-queue.mjs';
import {buildExplorationYieldPayload} from './exploration-yield.mjs';

const EVENT_TYPES = new Set([
  'assign', 'implement', 'ready', 'received', 'feedback', 'resume', 'park',
  'integrating', 'validated', 'accepted', 'published', 'publication-confirmed', 'activity', 'turn', 'register', 'observe',
  'prep-integrating', 'implementation-integrating', 'implementation-released',
  'prep-probe',
]);

// Free-text summaries can contain old command references even when all raw
// ownership fields were excluded. Sanitize both new and inherited public text;
// leave immutable event IDs, timestamps, outcomes and the private ledger intact.
function publicTextFields(value, key = '') {
  if (typeof value === 'string' && ['reason', 'summary', 'selectionReason'].includes(key)) {
    return value.replace(/\s*\((?:functions\.exec\s+)?(?:session_id|exec-session)[\s:="'#-]*\d+\)/giu, '')
      .replace(/\b(?:session_id|exec-session)[\s:="'#-]*\d+\b/giu, '[internal command reference]')
      .replace(/\bprocess handles?\b/giu, 'command ownership');
  }
  if (Array.isArray(value)) return value.map(item => publicTextFields(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([name, item]) => [name, publicTextFields(item, name)]));
  return value;
}

function legacyActivityFromLedger(ledger) {
  const run = /^loop-(20\d{6})(?:-[A-Za-z0-9][A-Za-z0-9_.:-]{0,79})?$/u.exec(ledger?.runId ?? '');
  if (!run || run[1] < '20260925' || !Array.isArray(ledger.events)) {
    throw new Error('expected a worker ledger from loop-20260925 or later');
  }
  return {
    runId: ledger.runId,
    events: ledger.events.filter(event => EVENT_TYPES.has(event.type)).flatMap(event =>
      ['prep-integrating', 'implementation-integrating'].includes(event.type) ? event.tasks.map(task => ({...event,
        id: `${event.id}-${task}`, type: 'integrating', task, validationGroup: event.tasks,
        ...(event.type === 'prep-integrating' ? {prepGroup: event.tasks} : {})}))
        : event.type === 'implementation-released' ? event.tasks.flatMap(task => [
          {...event, id: `${event.id}-${task}`, type: 'feedback', task},
          {...event, id: `${event.id}-${task}-released`, type: 'ready', task},
        ]) : event.type === 'feedback' && (event.prepGroup || event.implementationGroup)
          ? (event.prepGroup ?? event.implementationGroup).flatMap(task => [
          {...event, id: `${event.id}-${task}`, task},
          ...(task !== event.task ? [{...event, id: `${event.id}-${task}-released`, type: 'ready', task}] : []),
        ]) : [event]).map(event => ({
      runId: ledger.runId, id: event.id, type: event.type, at: event.at,
      ...(event.task ? { task: event.task } : {}),
      ...(event.worker ? { worker: event.worker } : {}),
      ...(event.goal ? { goal: event.goal } : {}),
      ...(event.kind ? { kind: event.kind } : {}),
      ...(event.type === 'assign' && event.kind === 'challenge-preparation'
        && event.reservations?.some(key => /^challenge-batch:v[1-9]\d*$/u.test(key))
        ? { batch: event.reservations.find(key => /^challenge-batch:v[1-9]\d*$/u.test(key)).split(':')[1] } : {}),
      ...(event.delivery ? { delivery: event.delivery } : {}),
      ...(event.integration ? { integration: event.integration } : {}),
      ...(event.prepGroup ? { prepGroup: event.prepGroup } : {}),
      ...(event.validationGroup ? { validationGroup: event.validationGroup } : {}),
      ...(event.commit ? { commit: event.commit } : {}),
      ...(event.knownBy ? { knownBy: event.knownBy } : {}),
      ...(event.passed !== undefined ? { passed: event.passed } : {}),
      ...(event.phase ? { phase: event.phase } : {}),
      ...(event.state ? { state: event.state } : {}),
      ...(event.type === 'prep-probe' ? {probe: event.probe, reason: event.summary,
        ...(event.source ? {source: event.source} : {}),
        ...(event.outcome ? {outcome: event.outcome} : {})} : {}),
      ...(['activity', 'park'].includes(event.type) ? { reason: event.reason } : {}),
      ...(event.type === 'turn' && event.summary ? { reason: event.summary } : {}),
      ...(['register', 'observe'].includes(event.type)
        ? { live: event.handle !== null || Boolean(event.processes?.length) } : {}),
    })),
  };
}

export function activityFromLedger(ledger) {
  const activity = publicTextFields(legacyActivityFromLedger(ledger));
  if (!ledger.events.some(event => event.type === 'queue-enable')) return activity;
  const state = summarizeLedger(ledger);
  if (!state.queue) return activity;
  const seen = new Set(), transports = new Set();
  const events = [...activity.events];
  const emit = (event, patch) => events.push({runId: ledger.runId, at: event.at, ...patch});
  for (const event of ledger.events) {
    const task = state.queue.tasks[event.task];
    if (event.type === 'queue-claim') {
      emit(event, {id: event.id, type: seen.has(task.id) ? 'resume' : 'assign', task: task.id,
        worker: event.worker, kind: 'queue-execution', assignmentType: task.type,
        output: task.output, ...(task.batch ? {batch: task.batch} : {}), target: task.target ?? null,
        selectionReason: event.selectionReason ?? 'Assigned under the shared queue policy.'});
      seen.add(task.id);
    } else if (['queue-result', 'queue-block'].includes(event.type)) {
      emit(event, {id: event.id, type: event.type === 'queue-result' ? 'queue-complete' : 'queue-block',
        task: event.task, worker: event.worker});
      emit(event, {id: `${event.id}:idle`, type: 'turn', worker: event.worker, state: 'idle',
        reason: event.type === 'queue-result' ? 'Result saved; available for another task.' : 'Assignment blocked; available for independent work.'});
    } else if (event.type === 'ready') {
      const execution = Object.values(state.queue.tasks).find(item => item.result?.commit === event.delivery);
      if (!execution) continue;
      // Acceptance retains its transport ID, but owns no duplicate worker time.
      if (!transports.has(event.task)) {
        emit(event, {id: `${event.id}:transport`, type: 'assign', task: event.task, worker: execution.worker,
          kind: 'implementation', goal: state.tasks[event.task]?.goal});
        transports.add(event.task);
      }
      emit(event, {id: `${event.id}:complete`, type: 'queue-complete', task: execution.id, worker: execution.worker});
      emit(event, {id: `${event.id}:idle`, type: 'turn', worker: execution.worker, state: 'idle',
        reason: 'Delivery saved; available for another task.'});
    }
  }
  // A synthesized transport assignment must precede its same-time ready event.
  const order = row => row.id.endsWith(':transport') ? -1 : 0;
  activity.events = events.sort((a, b) => a.at.localeCompare(b.at) || order(a) - order(b));
  return activity;
}

export function mergeActivity(previous, current) {
  const events = new Map();
  for (const event of [...(previous?.events ?? []), ...current.events]) {
    const normalized = publicTextFields({ ...event, runId: event.runId ?? previous?.runId });
    events.set(normalized.runId + '/' + normalized.id, normalized);
  }
  return { runId: current.runId,
    events: [...events.values()].sort((a, b) => a.at.localeCompare(b.at)) };
}

// Only public ownership fields; no handles, worktree paths or delivery packets.
export function reservationSnapshot(state) {
  const tasks = Object.fromEntries(Object.values(state.tasks)
    .filter(task => task.kind !== 'challenge-preparation' && task.status !== 'accepted')
    .map(task => [task.id, {id: task.id, worker: task.worker, status: task.status,
      seed: task.seed, reservations: task.reservations,
      ...(task.status === 'parked' ? {reason: task.reason} : {})}]));
  const reservations = Object.fromEntries(Object.entries(state.reservations)
    .map(([key, row]) => [key, {tasks: row.tasks.filter(id => tasks[id])}])
    .filter(([, row]) => row.tasks.length));
  return {tasks, reservations};
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

export function writeDashboardSnapshot({ ledger: ledgerPath, checkpoint, output }, root = process.cwd()) {
  const ledger = JSON.parse(readFileSync(resolve(root, ledgerPath), 'utf8'));
  const state = summarizeLedger(ledger);
  const summary = JSON.parse(readFileSync(resolve(root, checkpoint), 'utf8'));
  const resultBytes = readFileSync(join(summary.artifacts, 'session-results.json'));
  const results = JSON.parse(resultBytes);
  const outputPath = resolve(root, output);
  const previous = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, 'utf8')) : null;
  const capturedAt = new Date().toISOString();
  const auditPath = join(root, 'scripts/exploration-yield-audit.json');
  const auditIndex = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, 'utf8')) : undefined;
  const snapshot = {
    version: 1,
    capturedAt,
    explorationYield: buildExplorationYieldPayload(ledger, {asOf:capturedAt,auditIndex}),
    activity: mergeActivity(previous?.activity, activityFromLedger(ledger)),
    pendingMainWork: pendingMainWork(state, admittedBatchIds(root)),
    workerReservations: reservationSnapshot(state),
    ...(state.queue ? {assignmentQueue: publicQueue(state)} : {}),
    development: developmentFromCheckpoint(summary, results, resultBytes),
  };
  const published = publicTextFields(snapshot);
  writeFileSync(outputPath, JSON.stringify(published, null, 2) + '\n');
  return published;
}

function main(args) {
  const option = name => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1]) throw new Error(`missing ${name}`);
    return args[index + 1];
  };
  writeDashboardSnapshot({ ledger: option('--ledger'), checkpoint: option('--checkpoint'), output: option('--output') });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
