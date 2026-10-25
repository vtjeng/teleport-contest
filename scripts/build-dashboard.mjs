#!/usr/bin/env node

// Generates a self-contained HTML dashboard by injecting data into the template.

import { execFile, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { activityUtilization, integrationDurations } from './dashboard-activity.mjs';
import { workerWork } from './worker-backlog.mjs';
import { createDashboardTime } from './dashboard-local-time.mjs';
import { createChartTimeRange } from './dashboard-time-range.mjs';
import { singleWorkerActivity } from './single-worker-activity.mjs';
import { syntheticPublicationStatus } from './published-synthetic.mjs';
import { createTrialMonitor } from './trial-monitor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The history and per-case challenge data can exceed execSync's 1 MiB default.
const DASHBOARD_DATA_MAX_BYTES = 64 * 1024 * 1024;
const execFileAsync = promisify(execFile);

// JSON is placed inside a classic script element. Escape characters that can
// be interpreted as markup or JavaScript line terminators at that boundary.
export function escapeJsonForScript(json) {
  return String(json)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function injectDashboardData(template, data, queueData, commit, trialData = 'null') {
  const reservations = JSON.parse(data)?.workerReservations, queue = JSON.parse(queueData);
  if (reservations && queue) {
    queue.workerWork = workerWork(reservations, queue);
    queueData = JSON.stringify(queue);
  }
  // Use replacer callbacks because JSON can contain `$'`, `$&`, and other
  // replacement-pattern sequences that String.replace() would interpret.
  const html = template
    .replace('/*DATA_PLACEHOLDER*/null', () => escapeJsonForScript(data))
    .replace('/*QUEUE_PLACEHOLDER*/null', () => escapeJsonForScript(queueData))
    .replace('/*TRIAL_PLACEHOLDER*/null', () => escapeJsonForScript(trialData))
    .replace('/*SYNTHETIC_STATUS_PLACEHOLDER*/null', () => syntheticPublicationStatus.toString())
    .replace('/*TRIAL_MODEL_PLACEHOLDER*/null', () => createTrialMonitor.toString())
    .replace('/*SINGLE_WORKER_PLACEHOLDER*/null', () => singleWorkerActivity.toString())
    .replace('/*UTILIZATION_PLACEHOLDER*/null', () => activityUtilization.toString())
    .replace('/*LOCAL_TIME_PLACEHOLDER*/null', () => createDashboardTime.toString())
    .replace('/*TIME_RANGE_PLACEHOLDER*/null', () => createChartTimeRange.toString())
    .replace('/*INTEGRATION_DURATION_PLACEHOLDER*/null', () => integrationDurations.toString());
  if (commit === undefined) return html;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full dashboard commit SHA');
  // The template omits explicit head/body tags. Prefix metadata rather than
  // depending on a closing head tag that is not present.
  return `<meta name="dashboard-commit" content="${commit}">\n${html}`;
}

async function main() {
  // Fixed regressions and synthetic diagnostics share the work queue. Synthetic
  // counts come from saved evaluations; building does not record a new score.
  // These independent derivations can run together. Preserve the
  // queue's existing unavailable fallback and the data command's hard failure.
  const [dataResult, queueResult] = await Promise.allSettled([
    execFileAsync(process.execPath, ['scripts/dashboard-data.mjs'], {
      encoding: 'utf8', maxBuffer: DASHBOARD_DATA_MAX_BYTES,
    }),
    execFileAsync(process.execPath, ['scripts/mismatch-queue.mjs', '--work', '--json'], {
      encoding: 'utf8', timeout: 600000, maxBuffer: DASHBOARD_DATA_MAX_BYTES,
    }),
  ]);
  if (dataResult.status === 'rejected') throw dataResult.reason;
  const data = dataResult.value.stdout;
  let queueData = 'null';
  if (queueResult.status === 'fulfilled') queueData = queueResult.value.stdout;
  else {
    console.error('Warning: mismatch queue unavailable; completion is unknown');
  }

  const template = readFileSync(join(__dirname, 'dashboard.template.html'), 'utf8');

  const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  // Retain deterministic build metadata; recorded activity has its own timestamp.
  const builtAt = execSync('git show -s --format=%cI HEAD', { encoding: 'utf8' }).trim();
  const trialData = JSON.stringify({
    builtAt, buildSha: commit,
    manifest: JSON.parse(readFileSync(join(__dirname, '../trial-monitor/manifest.json'), 'utf8')),
    register: JSON.parse(readFileSync(join(__dirname, '../trial-monitor/repairs.json'), 'utf8')),
  });
  const html = injectDashboardData(template, data, queueData.trim(), commit, trialData);

  const outPath = process.argv[2] || 'dashboard.html';
  writeFileSync(outPath, html);
  console.error('Dashboard written to ' + outPath);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
