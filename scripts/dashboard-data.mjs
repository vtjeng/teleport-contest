#!/usr/bin/env node

// Parses SCORE.tsv and git log to produce a JSON blob for the progress dashboard.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { completedFunctionNames } from './port-evidence.mjs';
import { readRows, standing } from './score-log.mjs';
import { challengeDashboard } from './challenge-results.mjs';
import { activityTimeline, syntheticGainByCommit } from './dashboard-activity.mjs';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

function ensureFullHistory() {
  const shallow = run('git rev-parse --is-shallow-repository');
  if (shallow === 'false') return;

  console.error('Shallow clone detected — running git fetch --unshallow');
  try {
    execSync('git fetch --unshallow', { stdio: 'inherit' });
  } catch {
    console.error('git fetch --unshallow failed; cannot produce accurate dashboard data');
    process.exit(1);
  }

  const stillShallow = run('git rev-parse --is-shallow-repository');
  if (stillShallow !== 'false') {
    console.error('Repository is still shallow after unshallow attempt; aborting');
    process.exit(1);
  }
}

// --- Parse git log ---

ensureFullHistory();
const gitLog = run(`git log --format="%H %aI %cI %s" --reverse`);

const commits = gitLog.split('\n').map(line => {
  const [sha, iso, committedAt, ...rest] = line.split(' ');
  return { sha, time: new Date(iso), committedAt, message: rest.join(' ') };
});

const commitBySha = new Map();
for (const c of commits) {
  commitBySha.set(c.sha, c);
  commitBySha.set(c.sha.slice(0, 7), c);
}

const headFullSha = run('git rev-parse HEAD');

// --- Parse SCORE.tsv ---

// score-log owns the append-only schema. Read named fields so adding columns
// after `note` cannot silently shift the dashboard's existing measures.
const scoreRows = readRows(join(process.cwd(), 'SCORE.tsv'));

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fullShaFor(row) {
  if (!row?.sha) return null;
  const sha = row.sha.toLowerCase();
  if (/^[\da-f]{40}$/u.test(sha)) return sha;
  if (!/^[\da-f]+$/u.test(sha)) return null;
  const matches = commits.filter(commit => commit.sha.startsWith(sha));
  return matches.length === 1 ? matches[0].sha : null;
}

const scoreEvents = scoreRows.map(row => {
  const note = row.note || '';
  const noteLower = note.toLowerCase();
  if (noteLower.includes('supersedes') || noteLower.includes('sha-correction')) return null;

  const commit = commitBySha.get(fullShaFor(row));
  const utc = commit?.time || (row.utc ? new Date(row.utc) : null);

  return {
    utc,
    recordedUtc: row.utc,
    utcSource: commit ? 'commit' : 'score-utc-fallback',
    sha: row.sha, event: row.event,
    sessionsPassed: numberOrNull(row.sessions_passed),
    sessionsTotal: numberOrNull(row.sessions_total),
    screensMatched: numberOrNull(row.screens_matched),
    screensTotal: numberOrNull(row.screens_total),
    rngMatched: numberOrNull(row.rng_matched),
    rngTotal: numberOrNull(row.rng_total),
    cursorsMatched: numberOrNull(row.cursors_matched),
    cursorsTotal: numberOrNull(row.cursors_total),
    holdoutSessionsPassed: numberOrNull(row.holdout_sessions_passed),
    holdoutSessionsTotal: numberOrNull(row.holdout_sessions_total),
    holdoutScreensMatched: numberOrNull(row.holdout_screens_matched),
    holdoutScreensTotal: numberOrNull(row.holdout_screens_total),
    holdoutRngMatched: numberOrNull(row.holdout_rng_matched),
    holdoutRngTotal: numberOrNull(row.holdout_rng_total),
    holdoutCursorsMatched: numberOrNull(row.holdout_cursors_matched),
    holdoutCursorsTotal: numberOrNull(row.holdout_cursors_total),
    challengeSessionsPassed: numberOrNull(row.challenge_sessions_passed),
    challengeSessionsTotal: numberOrNull(row.challenge_sessions_total),
    challengeScreensMatched: numberOrNull(row.challenge_screens_matched),
    challengeScreensTotal: numberOrNull(row.challenge_screens_total),
    challengeRngMatched: numberOrNull(row.challenge_rng_matched),
    challengeRngTotal: numberOrNull(row.challenge_rng_total),
    challengeCursorsMatched: numberOrNull(row.challenge_cursors_matched),
    challengeCursorsTotal: numberOrNull(row.challenge_cursors_total),
    challengeManifestSha256: row.challenge_manifest_sha256 || null,
    challengeEvaluation: row.challenge_evaluation || null,
    note,
  };
}).filter(Boolean);

function metricFromRow(row, prefix, matchedColumn = `${prefix}_matched`) {
  if (!row) return null;
  const matched = numberOrNull(row[matchedColumn]);
  const total = numberOrNull(row[`${prefix}_total`]);
  if (matched === null || total === null) return null;
  return { matched, total };
}

function scoreFromRow(row, prefixes) {
  const score = {
    status: row ? 'measured' : 'unmeasured',
    sha: fullShaFor(row),
    utc: row?.utc || null,
    commitUtc: commitBySha.get(fullShaFor(row))?.committedAt || null,
    sessions: metricFromRow(row, prefixes.sessions),
    screens: metricFromRow(row, prefixes.screens),
    rng: metricFromRow(row, prefixes.rng),
    cursors: metricFromRow(row, prefixes.cursors),
  };
  return score;
}

function addMetric(left, right) {
  if (!left || !right) return null;
  return { matched: left.matched + right.matched, total: left.total + right.total };
}

// Before the policy transition, SCORE.tsv stores public development and local
// holdout measurements in separate column families. After it, a development
// row may carry the 44-session fixed score directly. Accept both forms so the
// dashboard can show one continuous operational measure without rewriting the
// append-only historical ledger.
function fixedScoreFromStanding(development, holdout) {
  if (development?.sessions_total === '44') {
    const score = scoreFromRow(development, {
      sessions: 'sessions', screens: 'screens', rng: 'rng', cursors: 'cursors',
    });
    score.sessions = metricFromRow(development, 'sessions', 'sessions_passed');
    return score;
  }
  if (!development || !holdout) {
    return {
      status: 'unmeasured', sha: null, utc: null, commitUtc: null,
      sessions: null, screens: null, rng: null, cursors: null,
    };
  }
  const sameCommit = development.sha === holdout.sha;
  const score = {
    status: sameCommit ? 'measured' : 'stale',
    sha: sameCommit ? fullShaFor(development) : fullShaFor(development),
    utc: development.utc || holdout.utc || null,
    commitUtc: commitBySha.get(fullShaFor(development))?.committedAt || null,
    sessions: addMetric(
      metricFromRow(development, 'sessions', 'sessions_passed'),
      metricFromRow(holdout, 'holdout_sessions', 'holdout_sessions_passed'),
    ),
    screens: addMetric(
      metricFromRow(development, 'screens'),
      metricFromRow(holdout, 'holdout_screens'),
    ),
    rng: addMetric(
      metricFromRow(development, 'rng'),
      metricFromRow(holdout, 'holdout_rng'),
    ),
    cursors: addMetric(
      metricFromRow(development, 'cursors'),
      metricFromRow(holdout, 'holdout_cursors'),
    ),
  };
  score.freshForCommit = Boolean(score.sha && score.sha === headFullSha);
  return score;
}

const scoreStanding = standing(scoreRows);
const developmentScore = scoreFromRow(scoreStanding.development, {
  sessions: 'sessions', screens: 'screens', rng: 'rng', cursors: 'cursors',
});
const localHoldoutScore = scoreFromRow(scoreStanding.holdout, {
  sessions: 'holdout_sessions', screens: 'holdout_screens',
  rng: 'holdout_rng', cursors: 'holdout_cursors',
});
const fixedDevelopmentScore = fixedScoreFromStanding(
  scoreStanding.development, scoreStanding.holdout,
);
if (fixedDevelopmentScore.sha && fixedDevelopmentScore.sha !== headFullSha) {
  fixedDevelopmentScore.status = 'stale';
}
fixedDevelopmentScore.freshForCommit = Boolean(
  fixedDevelopmentScore.sha && fixedDevelopmentScore.sha === headFullSha,
);

developmentScore.sessions = metricFromRow(
  scoreStanding.development, 'sessions', 'sessions_passed',
);
localHoldoutScore.sessions = metricFromRow(
  scoreStanding.holdout, 'holdout_sessions', 'holdout_sessions_passed',
);
if (developmentScore.sha && developmentScore.sha !== headFullSha) {
  developmentScore.status = 'stale';
}
developmentScore.freshForCommit = Boolean(
  developmentScore.sha && developmentScore.sha === headFullSha,
);
if (localHoldoutScore.sha && localHoldoutScore.sha !== headFullSha) {
  localHoldoutScore.status = 'stale';
}
localHoldoutScore.freshForCommit = Boolean(
  localHoldoutScore.sha && localHoldoutScore.sha === headFullSha,
);

const scores = {
  headSha: headFullSha,
  development: developmentScore,
  localHoldout: localHoldoutScore,
  fixedDevelopment: fixedDevelopmentScore,
};

const challenges = challengeDashboard(process.cwd(), scoreRows, headFullSha);
challenges.commitUtc = commitBySha.get(challenges.sha)?.committedAt || null;
challenges.role = 'synthetic-local-holdout';
for (const batch of challenges.batches || []) {
  batch.commitUtc = commitBySha.get(batch.sha)?.committedAt || null;
}
if (challenges.batches?.length > 1) {
  challenges.commitUtc = challenges.batches.every(batch => batch.commitUtc)
    ? challenges.batches.map(batch => batch.commitUtc).sort()[0] : null;
  challenges.commitAgeLabel = 'Oldest measured commit';
}

const snapshot = existsSync('dashboard-snapshot.json')
  ? JSON.parse(readFileSync('dashboard-snapshot.json', 'utf8')) : null;
const activity = activityTimeline(snapshot?.activity, snapshot?.capturedAt);
const developmentSessions = snapshot?.development ?? null;

// Extracts a label from a SCORE note for score-history points and the
// pre-register timeline fallback.
function goalNameFromNote(note) {
  const closesMatch = note.match(/^(.+?)\s+closes\b/i);
  const closesTheGoal = note.match(/^Closes\s+(?:the\s+(?:goal\s+(?:for\s+)?)?)?(.+?)(?:\s+at\b|\s+with\b|\s+having\b|;|\.)/i);
  const colonMatch = note.match(/^([a-z0-9_-]+(?:-[a-z0-9_]+)*):/i);
  const milestoneMatch = note.match(/^(.+?milestone)\b/i);
  if (closesMatch && !closesMatch[1].match(/^(Closes|The|Per|First|Second|Third|Above|Dart|Fifth|Largest)/i))
    return closesMatch[1];
  if (closesTheGoal) return closesTheGoal[1];
  if (colonMatch) return colonMatch[1];
  if (milestoneMatch) return milestoneMatch[1];
  return note.split(/[.;]/)[0].slice(0, 50);
}

// GOALS.json remains the source for scope and completion evidence. Worker
// activity comes only from the published ledger snapshot.
const goalRecords = new Map();
if (existsSync('GOALS.json')) {
  for (const record of JSON.parse(readFileSync('GOALS.json', 'utf8')).goals) {
    goalRecords.set(record.id, record);
  }
}

function completionCounts(record) {
  const functions = record?.functions ?? [];
  const verified = completedFunctionNames(record);
  return {
    functionsDeclared: functions.filter((entry) => entry.declared ?? entry.ported).length,
    functionsVerified: verified.size,
    functionsTotal: functions.length,
    units: functions.map((entry) => ({ name: entry.name, verified: verified.has(entry.name) })),
  };
}

// Current work follows the register, independently of historical commit names.
const workGoals = [...goalRecords.values()]
  .map((record) => ({
    id: record.id,
    kind: record.kind ?? null,
    status: record.status,
    sourceFile: record.luaFile ?? record.cFile ?? null,
    summary: record.summary,
    parkedReason: record.parkedReason ?? null,
    supersededBy: record.supersededBy ?? null,
    supersededReason: record.supersededReason ?? null,
    units: completionCounts(record).units,
  }));

// --- Saved screen measurements, including spans and divergence fixes ---

const progress = scoreEvents
  .filter(e => e.screensMatched !== null && e.screensTotal !== null
    && e.sessionsTotal !== 44)
  .map(e => ({
    utc: Number.isFinite(Date.parse(e.recordedUtc)) ? new Date(e.recordedUtc).toISOString() : e.utc?.toISOString() ?? null,
    utcSource: e.utcSource,
    sha: e.sha,
    name: goalNameFromNote(e.note),
    screens: e.screensMatched,
    screensTotal: e.screensTotal,
    rng: e.rngMatched,
    rngTotal: e.rngTotal,
    sessions: e.sessionsPassed,
    sessionsTotal: e.sessionsTotal,
    note: e.note,
  }))
  .filter(point => point.utc)
  .sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));

// How many screens each measurement added. The first
// point has no predecessor to subtract, so it carries no delta.
for (let i = 1; i < progress.length; i++) {
  progress[i].screensDelta = progress[i].screens - progress[i - 1].screens;
}
if (progress.length) progress[0].screensDelta = null;

function historyUtc(event) {
  if (Number.isFinite(Date.parse(event.recordedUtc)))
    return new Date(event.recordedUtc).toISOString();
  return event.utc && Number.isFinite(event.utc.getTime()) ? event.utc.toISOString() : null;
}

function eventMetric(event, matchedKey, totalKey) {
  return event[matchedKey] !== null && event[totalKey] !== null
    ? { matched: event[matchedKey], total: event[totalKey] } : null;
}

function historyPoint(event, metrics) {
  const utc = historyUtc(event);
  return utc ? { utc, sha: event.sha, ...metrics, note: event.note } : null;
}

// The operational chart starts when both historical corpora can be measured.
// After that first paired row, carry the last holdout measurement forward and
// add it to each later public-development row. This gives one honest history
// for the combined development set without rewriting the append-only ledger.
let latestHoldout = null;
const fixedDevelopmentHistory = [];
for (const event of scoreEvents) {
  if (event.holdoutScreensMatched !== null && event.holdoutScreensTotal !== null) {
    latestHoldout = {
      sessions: eventMetric(event, 'holdoutSessionsPassed', 'holdoutSessionsTotal'),
      screens: eventMetric(event, 'holdoutScreensMatched', 'holdoutScreensTotal'),
      rng: eventMetric(event, 'holdoutRngMatched', 'holdoutRngTotal'),
      cursors: eventMetric(event, 'holdoutCursorsMatched', 'holdoutCursorsTotal'),
    };
  }

  const publicMetrics = {
    sessions: eventMetric(event, 'sessionsPassed', 'sessionsTotal'),
    screens: eventMetric(event, 'screensMatched', 'screensTotal'),
    rng: eventMetric(event, 'rngMatched', 'rngTotal'),
    cursors: eventMetric(event, 'cursorsMatched', 'cursorsTotal'),
  };
  let metrics;
  if (event.sessionsTotal === 44) {
    metrics = publicMetrics;
  } else if (latestHoldout && publicMetrics.screens) {
    metrics = {
      sessions: addMetric(publicMetrics.sessions, latestHoldout.sessions),
      screens: addMetric(publicMetrics.screens, latestHoldout.screens),
      rng: addMetric(publicMetrics.rng, latestHoldout.rng),
      cursors: addMetric(publicMetrics.cursors, latestHoldout.cursors),
    };
  } else {
    continue;
  }
  if (metrics.screens) {
    const point = historyPoint(event, {
      screens: metrics.screens.matched,
      screensTotal: metrics.screens.total,
      rng: metrics.rng?.matched ?? null,
      rngTotal: metrics.rng?.total ?? null,
      cursors: metrics.cursors?.matched ?? null,
      cursorsTotal: metrics.cursors?.total ?? null,
      sessions: metrics.sessions?.matched ?? null,
      sessionsTotal: metrics.sessions?.total ?? null,
    });
    if (point) fixedDevelopmentHistory.push(point);
  }
}
fixedDevelopmentHistory.sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));

// The transition can be rendered before the first new 44-session SCORE row:
// combine the latest paired historical measurements as its initial point.
if (fixedDevelopmentHistory.length === 0 && fixedDevelopmentScore.screens
  && fixedDevelopmentScore.utc) {
  fixedDevelopmentHistory.push({
    utc: fixedDevelopmentScore.utc,
    sha: fixedDevelopmentScore.sha,
    screens: fixedDevelopmentScore.screens.matched,
    screensTotal: fixedDevelopmentScore.screens.total,
    rng: fixedDevelopmentScore.rng?.matched ?? null,
    rngTotal: fixedDevelopmentScore.rng?.total ?? null,
    sessions: fixedDevelopmentScore.sessions?.matched ?? null,
    sessionsTotal: fixedDevelopmentScore.sessions?.total ?? null,
    note: 'Fixed development workload baseline.',
  });
}

const scoreHistory = [
  { id: 'developmentSet', title: 'Development set', points: fixedDevelopmentHistory },
  ...(challenges.batches?.length ? [...challenges.batches]
    .sort((a, b) => Number(a.batch.slice(1)) - Number(b.batch.slice(1)))
    .map(batch => ({
      id: `syntheticHoldout-${batch.batch}`, title: `Synthetic local holdout · ${batch.batch}`,
      points: batch.history, error: batch.status === 'failed' ? batch.error : null,
    })) : [{ id: 'syntheticHoldout', title: 'Synthetic local holdout', points: challenges.history,
    error: challenges.status === 'failed' ? challenges.error : null }]),
];

// The historical chart retains its score measurements. Its timestamps are
// measurement milestones, not worker activity intervals.
const latest = progress[progress.length - 1];
const summary = {
  dataset: 'development',
  generatedAt: new Date().toISOString(),
  totalGoals: [...goalRecords.values()].filter(goal => goal.status === 'closed').length,
  screens: latest?.screens,
  screensTotal: latest?.screensTotal,
  rng: latest?.rng,
  rngTotal: latest?.rngTotal,
  sessions: latest?.sessions,
  sessionsTotal: latest?.sessionsTotal,
};

const evaluationCache = new Map();
const syntheticByCommit = syntheticGainByCommit(scoreRows, path => {
  if (!path.startsWith('challenges/evaluations/') || !path.endsWith('.json')) return null;
  if (!evaluationCache.has(path)) {
    evaluationCache.set(path, existsSync(path)
      ? JSON.parse(readFileSync(path, 'utf8')) : null);
  }
  return evaluationCache.get(path);
});
const activityGoals = new Map();
for (const task of activity.tasks) {
  if (!task.goal) continue;
  const record = goalRecords.get(task.goal);
  const row = activityGoals.get(task.goal) ?? {
    id: task.goal, kind: record?.kind ?? null,
    sourceFile: record?.luaFile ?? record?.cFile ?? null,
    status: record?.status ?? task.status,
    assignedAt: task.assignedAt, publishedAt: null, workers: [],
    developmentDelta: record?.delivered?.screens
      ?? record?.progressBeforePark?.screens ?? null,
    syntheticGained: 0, syntheticLost: 0, syntheticMeasured: false,
  };
  if (!row.workers.includes(task.worker)) row.workers.push(task.worker);
  if (task.assignedAt < row.assignedAt) row.assignedAt = task.assignedAt;
  if (task.publishedAt && (!row.publishedAt || task.publishedAt > row.publishedAt)) {
    row.publishedAt = task.publishedAt;
  }
  const gain = syntheticByCommit.get(task.integration);
  if (gain && task.publishedAt) {
    row.syntheticGained += gain.gained;
    row.syntheticLost += gain.lost;
    row.syntheticMeasured = true;
  }
  activityGoals.set(task.goal, row);
}

const output = {
  progress, scoreHistory, workGoals, summary, scores, challenges,
  activity, activityGoals: [...activityGoals.values()],
  developmentSessions,
};

process.stdout.write(JSON.stringify(output, null, 2));
