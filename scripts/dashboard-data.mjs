#!/usr/bin/env node

// Parses SCORE.tsv and git log to produce a JSON blob for the progress dashboard.
// Covers the development session set only.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

// --- Parse git log ---

const gitLog = run(`git log --format="%H %aI %s" --reverse`);

const commits = gitLog.split('\n').map(line => {
  const [sha, iso, ...rest] = line.split(' ');
  return { sha, time: new Date(iso), message: rest.join(' ') };
});

const commitBySha = new Map();
for (const c of commits) {
  commitBySha.set(c.sha, c);
  commitBySha.set(c.sha.slice(0, 7), c);
}

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

const scoreLines = readFileSync('SCORE.tsv', 'utf8').split('\n').slice(1).filter(Boolean);

const scoreEvents = scoreLines.map(line => {
  const cols = line.split('\t');
  const [tsStr, sha, event] = cols;
  const note = cols[15] || '';
  const noteLower = note.toLowerCase();
  if (noteLower.includes('supersedes') || noteLower.includes('sha-correction')) return null;

  const commit = commitBySha.get(sha) || commitBySha.get(sha.slice(0, 7));
  const utc = commit?.time || (tsStr ? new Date(tsStr) : null);

  return {
    utc,
    utcSource: commit ? 'commit' : 'score-utc-fallback',
    sha, event,
    sessionsPassed: cols[3] ? parseInt(cols[3]) : null,
    sessionsTotal: cols[4] ? parseInt(cols[4]) : null,
    screensMatched: cols[5] ? parseInt(cols[5]) : null,
    screensTotal: cols[6] ? parseInt(cols[6]) : null,
    rngMatched: cols[7] ? parseInt(cols[7]) : null,
    rngTotal: cols[8] ? parseInt(cols[8]) : null,
    holdoutScreensMatched: cols[11] ? parseInt(cols[11]) : null,
    holdoutScreensTotal: cols[12] ? parseInt(cols[12]) : null,
    holdoutRngMatched: cols[13] ? parseInt(cols[13]) : null,
    holdoutRngTotal: cols[14] ? parseInt(cols[14]) : null,
    note,
  };
}).filter(Boolean);

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

const rawScoreGoals = scoreEvents.filter(e => e.event === 'goal');
const scoreGoals = rawScoreGoals.filter((sg, i) =>
  i === rawScoreGoals.length - 1 || rawScoreGoals[i + 1].note !== sg.note);
const scoreSlices = scoreEvents.filter(e => e.event === 'slice');

const goals = [];

for (let gi = 0; gi < scoreGoals.length; gi++) {
  const sg = scoreGoals[gi];

  const name = goalNameFromNote(sg.note);

  // Find close commit by SHA
  const closeCommit = commitBySha.get(sg.sha) || commitBySha.get(sg.sha.slice(0, 7));
  const closeTime = sg.utc || closeCommit?.time;
  if (!closeTime) continue;

  // Previous goal's close time (for bounding the open search)
  const prevCloseTime = gi > 0
    ? (scoreGoals[gi - 1].utc || commitBySha.get(scoreGoals[gi - 1].sha)?.time)
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

  const totalMin = (closeTime - openTime) / 60000;

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
  const totalMin = (now - openTime) / 60000;
  const goalSelectionMin = lastClosedGoal
    ? (openTime - lastCloseTime) / 60000
    : null;

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

// --- Compute per-goal screen deltas ---
for (let i = 0; i < goals.length; i++) {
  if (goals[i].screens !== null) {
    const prevScreens = i > 0 && goals[i - 1].screens !== null ? goals[i - 1].screens : 0;
    goals[i].screensDelta = goals[i].screens - prevScreens;
  } else {
    goals[i].screensDelta = null;
  }
}

// --- Build progress timeline from SCORE goal events ---

const progress = scoreEvents
  .filter(e => e.event === 'goal' && e.screensMatched !== null)
  .map(e => ({
    utc: e.utc?.toISOString() ?? null,
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
  }));

// How many screens each goal added, for the chart's hover readout. The first
// point has no predecessor to subtract, so it carries no delta.
for (let i = 1; i < progress.length; i++) {
  progress[i].screensDelta = progress[i].screens - progress[i - 1].screens;
}
if (progress.length) progress[0].screensDelta = null;

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

const output = { goals, progress, standaloneAudits, summary };

process.stdout.write(JSON.stringify(output, null, 2));
