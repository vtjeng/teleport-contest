#!/usr/bin/env node

// Parses SCORE.tsv and git log to produce a JSON blob for the progress dashboard.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { completedFunctionNames } from './port-evidence.mjs';
import { readRows, standing } from './score-log.mjs';
import { challengeDashboard } from './challenge-results.mjs';

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

// Classify commits
const openCommits = commits.filter(c => /^(Open|Register)\b/i.test(c.message));
const queueCommits = commits.filter(c => /^Queue\b/i.test(c.message));
const auditCommits = commits.filter(c =>
  /audit|review/i.test(c.message) && !/^Open|^Queue/i.test(c.message)
);

// Some Open/Register commits also queue a slice — synthesize queue events
for (const c of openCommits) {
  if (/queue/i.test(c.message)
    || (/^Register\b/i.test(c.message) && /\bslice\b/i.test(c.message))) {
    queueCommits.push(c);
  }
}
queueCommits.sort((a, b) => a.time - b.time);

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

const scoreStanding = standing(scoreRows);
const developmentScore = scoreFromRow(scoreStanding.development, {
  sessions: 'sessions', screens: 'screens', rng: 'rng', cursors: 'cursors',
});
const localHoldoutScore = scoreFromRow(scoreStanding.holdout, {
  sessions: 'holdout_sessions', screens: 'holdout_screens',
  rng: 'holdout_rng', cursors: 'holdout_cursors',
});

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
};

const challenges = challengeDashboard(process.cwd(), scoreRows, headFullSha);
challenges.commitUtc = commitBySha.get(challenges.sha)?.committedAt || null;

// Extracts the goal name from a SCORE note. Both the goal timeline and the
// progress chart label their entries with it.
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

// --- Build goal timeline from SCORE goal events ---

const rawScoreGoals = scoreEvents.filter(e => e.event === 'goal' || e.event === 'divergence');
const scoreGoals = rawScoreGoals.filter((sg, i) =>
  i === rawScoreGoals.length - 1 || rawScoreGoals[i + 1].note !== sg.note);
// `slice` rows predate 2026-09-05; `span` rows follow .agents/scoring.md since.
const scoreSlices = scoreEvents.filter(e => e.event === 'slice' || e.event === 'span');

const goals = [];

for (let gi = 0; gi < scoreGoals.length; gi++) {
  const sg = scoreGoals[gi];

  const name = goalNameFromNote(sg.note);

  // Find close commit by SHA
  const closeCommit = commitBySha.get(fullShaFor({ sha: sg.sha }));
  const closeTime = sg.utc || closeCommit?.time;
  if (!closeTime) continue;

  // Previous goal's close time (for bounding the open search)
  const prevCloseTime = gi > 0
    ? (scoreGoals[gi - 1].utc
      || commitBySha.get(fullShaFor({ sha: scoreGoals[gi - 1].sha }))?.time)
    : null;

  // Find the Open commit: most recent Open before this close, after previous close
  const openCommit = openCommits.filter(c =>
    c.time <= closeTime && (!prevCloseTime || c.time > prevCloseTime)
  ).pop();

  const openTime = openCommit?.time || prevCloseTime || closeTime;
  const openTimeSource = openCommit
    ? 'open-commit'
    : prevCloseTime
      ? 'previous-goal-close-inferred'
      : 'goal-close-inferred';

  // Goal selection: previous close → this open
  const goalSelectionMin = (openCommit && prevCloseTime)
    ? (openCommit.time - prevCloseTime) / 60000
    : null;

  // Find SCORE slice events within this goal's time range
  const goalSliceEvents = scoreSlices.filter(e =>
    e.utc && e.utc > openTime && e.utc <= closeTime
  );

  // Find Queue commits within this goal's time range
  const goalQueues = queueCommits.filter(q =>
    q.time >= openTime && q.time <= closeTime
  );

  // Build slice records: pair each Queue with the next SCORE slice event
  const slices = [];
  for (let qi = 0; qi < goalQueues.length; qi++) {
    const queue = goalQueues[qi];
    const nextQueue = goalQueues[qi + 1];

    const sliceScore = goalSliceEvents.find(e =>
      e.utc > queue.time &&
      (!nextQueue || e.utc <= nextQueue.time)
    );

    const sliceCloseTime = sliceScore?.utc
      ?? (nextQueue ? new Date(nextQueue.time - 1) : closeTime);
    const closeTimeSource = sliceScore
      ? (sliceScore.utcSource === 'commit'
        ? 'score-slice'
        : 'score-slice-fallback')
      : nextQueue
        ? 'next-queue-inferred'
        : 'goal-close-inferred';

    let sliceSelectionMin = null;
    if (qi > 0 && slices[qi - 1]?.closeTime) {
      sliceSelectionMin = (queue.time - new Date(slices[qi - 1].closeTime)) / 60000;
    }

    slices.push({
      queueTime: queue.time.toISOString(),
      closeTime: sliceCloseTime.toISOString(),
      closeTimeSource,
      durationMin: Math.round((sliceCloseTime - queue.time) / 60000 * 10) / 10,
      sliceSelectionMin: sliceSelectionMin !== null ? Math.round(sliceSelectionMin * 10) / 10 : null,
      message: queue.message,
    });
  }

  // First slice selection: open → first queue
  const firstSliceSelMin = (goalQueues.length > 0)
    ? (goalQueues[0].time - openTime) / 60000
    : null;

  const totalSliceSelectionMin = (firstSliceSelMin || 0) + slices.reduce((sum, s) => sum + (s.sliceSelectionMin || 0), 0);
  const totalSliceDurationMin = slices.reduce((sum, s) => sum + (s.durationMin || 0), 0);

  // Verification: last slice close → goal close
  const lastSlice = slices[slices.length - 1];
  const lastSliceClose = lastSlice?.closeTimeSource === 'score-slice'
    ? new Date(lastSlice.closeTime)
    : null;
  const verificationMin = lastSliceClose && sg.utcSource === 'commit'
    ? (closeTime - lastSliceClose) / 60000
    : null;

  const totalMin = (closeTime - (prevCloseTime || openTime)) / 60000;

  // Audit events within this goal
  const goalAudits = auditCommits.filter(c =>
    c.time >= openTime && c.time <= closeTime
  ).map(c => ({
    time: c.time.toISOString(),
    message: c.message,
  }));

  goals.push({
    name,
    openTime: openTime.toISOString(),
    openTimeSource,
    closeTime: closeTime.toISOString(),
    closeTimeSource: sg.utcSource,
    totalMin: Math.round(totalMin * 10) / 10,
    goalSelectionMin: goalSelectionMin !== null ? Math.round(goalSelectionMin * 10) / 10 : null,
    sliceSelectionMin: Math.round(totalSliceSelectionMin * 10) / 10,
    implementationMin: Math.round(totalSliceDurationMin * 10) / 10,
    verificationMin: verificationMin !== null ? Math.round(verificationMin * 10) / 10 : null,
    sliceCount: slices.length,
    slices,
    goalSelectionObserved: goalSelectionMin !== null
      && scoreGoals[gi - 1]?.utcSource === 'commit',
    sliceSelectionObserved: slices.length > 0
      && openTimeSource === 'open-commit'
      && slices.slice(0, -1).every(
        (slice) => slice.closeTimeSource === 'score-slice',
      ),
    implementationObserved: slices.length > 0
      && slices.every((slice) => slice.closeTimeSource === 'score-slice'),
    verificationObserved: verificationMin !== null,
    totalObserved: openTimeSource === 'open-commit'
      && sg.utcSource === 'commit',
    timingObserved: openTimeSource === 'open-commit'
      && slices.length > 0
      && slices.every((slice) => slice.closeTimeSource === 'score-slice')
      && sg.utcSource === 'commit',
    eventType: sg.event,
    audits: goalAudits,
    screens: sg.screensMatched,
    screensTotal: sg.screensTotal,
    rng: sg.rngMatched,
    rngTotal: sg.rngTotal,
    sessions: sg.sessionsPassed,
    sessionsTotal: sg.sessionsTotal,
  });
}

// --- Detect in-progress goals (opened after last closed goal) ---

const lastCloseTime = goals.length > 0
  ? new Date(goals[goals.length - 1].closeTime)
  : new Date(0);

const inProgressOpens = openCommits.filter(c => c.time > lastCloseTime);
const lastClosedGoal = goals[goals.length - 1] ?? null;

for (const open of inProgressOpens) {
  let name = open.message;
  const goalMatch = name.match(/^Open\s+(?:the\s+)?(.+?)(?:\s+goal)?$/i);
  if (goalMatch) name = goalMatch[1];
  name = name.replace(/\s*\(.*$/, '').replace(/,.*$/, '').trim();

  const now = new Date();
  const openTime = open.time;
  const goalSelectionMin = lastClosedGoal
    ? (openTime - lastCloseTime) / 60000
    : null;
  const totalMin = (now - (lastClosedGoal ? lastCloseTime : openTime)) / 60000;

  const goalQueues = queueCommits.filter(q => q.time >= openTime);
  const slices = [];
  for (let qi = 0; qi < goalQueues.length; qi++) {
    const queue = goalQueues[qi];
    const nextQueue = goalQueues[qi + 1];
    const sliceScore = scoreSlices.find(e =>
      e.utc && e.utc > queue.time && (!nextQueue || e.utc <= nextQueue.time)
    );
    const sliceCloseTime = sliceScore?.utc ?? now;
    const closeTimeSource = sliceScore
      ? (sliceScore.utcSource === 'commit'
        ? 'score-slice'
        : 'score-slice-fallback')
      : 'current-time-inferred';
    let sliceSelectionMin = null;
    if (qi > 0 && slices[qi - 1]?.closeTime) {
      sliceSelectionMin = (queue.time - new Date(slices[qi - 1].closeTime)) / 60000;
    }
    slices.push({
      queueTime: queue.time.toISOString(),
      closeTime: sliceCloseTime.toISOString(),
      closeTimeSource,
      durationMin: Math.round((sliceCloseTime - queue.time) / 60000 * 10) / 10,
      sliceSelectionMin: sliceSelectionMin !== null ? Math.round(sliceSelectionMin * 10) / 10 : null,
      message: queue.message,
    });
  }

  const firstSliceSelMin = goalQueues.length > 0 ? (goalQueues[0].time - openTime) / 60000 : null;
  const totalSliceSelectionMin = (firstSliceSelMin || 0) + slices.reduce((sum, s) => sum + (s.sliceSelectionMin || 0), 0);
  const totalSliceDurationMin = slices.reduce((sum, s) => sum + (s.durationMin || 0), 0);

  const goalAudits = auditCommits.filter(c => c.time >= openTime).map(c => ({
    time: c.time.toISOString(),
    message: c.message,
  }));

  goals.push({
    name,
    status: 'in-progress',
    openTime: openTime.toISOString(),
    openTimeSource: 'open-commit',
    closeTime: null,
    closeTimeSource: 'current-time-inferred',
    totalMin: Math.round(totalMin * 10) / 10,
    goalSelectionMin: goalSelectionMin !== null
      ? Math.round(goalSelectionMin * 10) / 10
      : null,
    sliceSelectionMin: Math.round(totalSliceSelectionMin * 10) / 10,
    implementationMin: Math.round(totalSliceDurationMin * 10) / 10,
    verificationMin: null,
    sliceCount: slices.length,
    slices,
    goalSelectionObserved: goalSelectionMin !== null
      && lastClosedGoal?.closeTimeSource === 'commit',
    sliceSelectionObserved: slices.length > 0
      && slices.slice(0, -1).every(
        (slice) => slice.closeTimeSource === 'score-slice',
      ),
    implementationObserved: slices.length > 0
      && slices.every((slice) => slice.closeTimeSource === 'score-slice'),
    verificationObserved: false,
    totalObserved: false,
    timingObserved: false,
    audits: goalAudits,
    screens: null,
    screensTotal: null,
    rng: null,
    rngTotal: null,
    sessions: null,
    sessionsTotal: null,
  });
}

// --- Goal records ---
// The score note names a goal by its id, and GOALS.json carries the id's kind
// and, for a file port, its function list. A goal closed before 2026-09-05 has
// no kind and is labelled `boundary`; a divergence row without a record is a
// divergence fix.

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

for (const goal of goals) {
  const record = goalRecords.get(goal.name);
  goal.kind = record?.kind
    ?? (goal.eventType === 'divergence' ? 'divergence-fix' : 'boundary');
  goal.cFile = record?.cFile ?? null;
  goal.sourceFile = record?.luaFile ?? record?.cFile ?? null;
  Object.assign(goal, completionCounts(record));
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
    units: completionCounts(record).units,
  }));

// --- Compute per-goal screen deltas ---
for (let i = 0; i < goals.length; i++) {
  if (goals[i].screens !== null) {
    const prevScreens = i > 0 && goals[i - 1].screens !== null ? goals[i - 1].screens : 0;
    goals[i].screensDelta = goals[i].screens - prevScreens;
  } else {
    goals[i].screensDelta = null;
  }
}

// --- Saved screen measurements, including spans and divergence fixes ---

const progress = scoreEvents
  .filter(e => e.screensMatched !== null && e.screensTotal !== null)
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

const localHoldoutHistory = scoreEvents
  .filter(event => event.holdoutScreensMatched !== null && event.holdoutScreensTotal !== null)
  .map(event => ({
    utc: Number.isFinite(Date.parse(event.recordedUtc))
      ? new Date(event.recordedUtc).toISOString() : event.utc?.toISOString() ?? null,
    sha: event.sha, screens: event.holdoutScreensMatched,
    screensTotal: event.holdoutScreensTotal, note: event.note,
  }))
  .filter(point => point.utc)
  .sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));
const scoreHistory = [
  { id: 'development', title: 'Development', points: progress },
  { id: 'localHoldout', title: 'Local holdout', points: localHoldoutHistory },
  { id: 'challenges', title: 'Challenges', points: challenges.history,
    error: challenges.status === 'failed' ? challenges.error : null },
];

// --- Standalone audit events (outside goals) ---

const goalTimeRanges = goals.map(g => [new Date(g.openTime), new Date(g.closeTime)]);
const standaloneAudits = auditCommits
  .filter(c => !goalTimeRanges.some(([o, cl]) => c.time >= o && c.time <= cl))
  .map(c => ({ time: c.time.toISOString(), message: c.message }));

// --- Summary ---

const latest = progress[progress.length - 1];
const closedGoals = goals.filter((goal) => goal.status !== 'in-progress');
const recentGoals = closedGoals.slice(-20);
const recentObservedGoals = recentGoals.filter(
  (goal) => goal.implementationObserved,
);

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const recentWithGoalSel = recentGoals.filter(
  g => g.goalSelectionObserved
    && g.goalSelectionMin !== null
    && g.goalSelectionMin < 120,
);
const recentWithVerif = recentGoals.filter(
  g => g.verificationObserved && g.verificationMin !== null,
);

const summary = {
  dataset: 'development',
  generatedAt: new Date().toISOString(),
  totalGoals: closedGoals.length,
  inProgressGoals: goals.length - closedGoals.length,
  screens: latest?.screens,
  screensTotal: latest?.screensTotal,
  screensPct: latest ? (latest.screens / latest.screensTotal * 100).toFixed(1) : null,
  rng: latest?.rng,
  rngTotal: latest?.rngTotal,
  rngPct: latest ? (latest.rng / latest.rngTotal * 100).toFixed(1) : null,
  sessions: latest?.sessions,
  sessionsTotal: latest?.sessionsTotal,
  medianGoalSelectionMin: median(recentWithGoalSel.map(g => g.goalSelectionMin)),
  medianImplementationMin: median(recentObservedGoals.filter(g => g.sliceCount > 0 && g.implementationMin < 600).map(g => g.implementationMin)),
  medianVerificationMin: median(recentWithVerif.map(g => g.verificationMin)),
  medianTotalMin: median(recentGoals.filter(g => g.totalObserved && g.totalMin < 600).map(g => g.totalMin)),
};

const output = {
  goals, progress, scoreHistory, standaloneAudits, workGoals, summary, scores, challenges,
};

process.stdout.write(JSON.stringify(output, null, 2));
