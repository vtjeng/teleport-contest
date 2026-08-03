#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `record-review --range` and `audit-worktree.mjs prepare --range` name the
// same audited range, so they share one parser and accept one syntax.
import { parseRange } from './audit-worktree.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const QUALITY_PATH = resolve(REPO_ROOT, 'QUALITY.json');
// ROADMAP.md holds each deferred finding as prose. The ledger stores a
// pointer to the heading that carries it.
const DEFERRAL_EFFORTS = Object.freeze(['small', 'slice', 'undecided']);
const DEFERRAL_STATUSES = Object.freeze(['open', 'closed']);
const QUALITY_LOCK_PATH = resolve(REPO_ROOT, '.quality-status.lock');
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const PASS_KINDS = new Set(['review', 'simplification']);
const PASS_OUTCOMES = new Set(['changed', 'no-change']);
const REVIEW_LEVELS = new Set(['light', 'full']);
const AUDIT_COUNT_FIELDS = Object.freeze([
  'raw',
  'deduplicated',
  'confirmed',
  'applied',
  'deferred',
  'rejected',
  'unverified',
]);
const AUDIT_CATEGORY_FIELDS = Object.freeze([
  'production',
  'tests',
  'clarity',
  'simplification',
  'other',
]);
const AUDIT_RESOLUTIONS = new Set(['applied', 'deferred']);
// The mutation kinds scripts/mutate-sites.mjs tags a site with. A pass records
// only the kinds it ran, so a run under `--kind` names a subset.
const MUTATION_KINDS = Object.freeze([
  'boolean',
  'integer',
  'logical',
  'relational',
]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message) {
  throw new Error(message);
}

function validateExactNonnegativeCounts(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length
      || actual.some((field, index) => field !== expected[index])) {
    fail(`${label} must contain exactly: ${fields.join(', ')}`);
  }
  for (const field of fields) {
    if (!Number.isInteger(value[field]) || value[field] < 0) {
      fail(`${label}.${field} must be a nonnegative integer`);
    }
  }
}

// An audit's rejections are the only record of why a proposed finding was
// turned down. Without them the next audit re-derives the same claim and the
// operator has to reconstruct the counter-evidence. Store each rejection with
// its wording intact, including any condition for reopening it.
function validateAuditRejections(rejections, rejectedCount) {
  if (!Array.isArray(rejections)) fail('auditMetrics.rejections must be an array');
  if (rejections.length !== rejectedCount) {
    fail(
      `auditMetrics.rejections lists ${rejections.length} findings but the `
        + `rejected count is ${rejectedCount}`,
    );
  }
  for (const [index, rejection] of rejections.entries()) {
    const label = `auditMetrics.rejections[${index}]`;
    if (!rejection || typeof rejection !== 'object' || Array.isArray(rejection)) {
      fail(`${label} must be an object`);
    }
    if (typeof rejection.summary !== 'string' || rejection.summary.trim().length === 0) {
      fail(`${label}.summary must be nonempty`);
    }
    if (typeof rejection.counterEvidence !== 'string'
        || rejection.counterEvidence.trim().length === 0) {
      fail(`${label}.counterEvidence must be nonempty`);
    }
  }
}

// A deferred finding is confirmed work the pass chose not to do, so it has to
// outlive the session that found it. The pass output sits under the session's
// temporary directory and goes with it, and productionDefects enumerates the
// production category alone, so a deferred test, clarity, or simplification
// finding has no other durable record. Require each one to name the heading
// that carries it, and check that the heading is really there.
function validateAuditDeferrals(deferrals, deferredCount, trackerHeadings) {
  if (!Array.isArray(deferrals)) fail('auditMetrics.deferrals must be an array');
  if (deferrals.length !== deferredCount) {
    fail(
      `auditMetrics.deferrals lists ${deferrals.length} findings but the `
        + `deferred count is ${deferredCount}`,
    );
  }
  for (const [index, deferral] of deferrals.entries()) {
    const label = `auditMetrics.deferrals[${index}]`;
    if (!deferral || typeof deferral !== 'object' || Array.isArray(deferral)) {
      fail(`${label} must be an object`);
    }
    if (typeof deferral.summary !== 'string' || deferral.summary.trim().length === 0) {
      fail(`${label}.summary must be nonempty`);
    }
    if (typeof deferral.trackedIn !== 'string' || deferral.trackedIn.trim().length === 0) {
      fail(
        `${label}.trackedIn must name the deferred-ledger id that carries `
          + 'this finding',
      );
    }
    if (!AUDIT_CATEGORY_FIELDS.includes(deferral.category)) {
      fail(
        `${label}.category must be one of: ${AUDIT_CATEGORY_FIELDS.join(', ')}`,
      );
    }
    const id = deferral.trackedIn.trim();
    // Only the recorder passes ids. Stored passes are revalidated on every
    // run, long after their debt is cleared and its entry closed or renamed.
    if (trackerHeadings && !trackerHeadings.has(id)) {
      fail(
        `${label}.trackedIn names "${id}", which is no id in the deferred `
          + 'ledger. Add the entry with npm run quality -- defer before '
          + 'recording the pass.',
      );
    }
  }
}

// A deferred production finding is recorded twice: once in productionDefects,
// which enumerates the production category, and once in deferrals, which
// enumerates everything the pass deferred. The recorder checks each array
// against its own count, so an operator can put a tests finding in a
// production slot and leave a real defect out while both counts still balance.
// That happened at the extended-command pass, where productionDefects[4] reads
// as a tests finding by its own foundBy and the clearMessageWindow() defect is
// absent. Require the two enumerations to agree.
function validateDeferredProductionAgreement(deferrals, productionDefects) {
  const fromDeferrals = deferrals
    .filter((deferral) => deferral.category === 'production')
    .map((deferral) => deferral.summary.trim())
    .sort();
  const fromDefects = productionDefects
    .filter((defect) => defect.resolution === 'deferred')
    .map((defect) => defect.summary.trim())
    .sort();
  if (fromDeferrals.length !== fromDefects.length) {
    fail(
      `auditMetrics.deferrals marks ${fromDeferrals.length} findings as `
        + `production, but productionDefects defers ${fromDefects.length}`,
    );
  }
  for (const [index, summary] of fromDeferrals.entries()) {
    if (summary !== fromDefects[index]) {
      fail(
        'a deferred production finding is worded differently in deferrals and '
          + `productionDefects: "${summary.slice(0, 60)}"`,
      );
    }
  }
}


/**
 * Check one pass's mutation record: what `scripts/mutate-sites.mjs` reported
 * over the frozen range and what the test-quality finder concluded about it.
 *
 * `.agents/review.md`, under "Mutation-test the reviewed lines", states the
 * command a pass runs. The per-kind counts have to total the mutants and the
 * survivors, so a record cannot claim a rate its own breakdown contradicts.
 */
export function validateAuditMutation(mutation) {
  if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) {
    fail('auditMetrics.mutation must be an object');
  }
  for (const field of ['mutants', 'survivors']) {
    if (!Number.isInteger(mutation[field]) || mutation[field] < 0) {
      fail(`auditMetrics.mutation.${field} must be a nonnegative integer`);
    }
  }
  if (mutation.survivors > mutation.mutants) {
    fail('auditMetrics.mutation cannot report more survivors than mutants');
  }
  const { byKind } = mutation;
  if (!byKind || typeof byKind !== 'object' || Array.isArray(byKind)) {
    fail('auditMetrics.mutation.byKind must be an object');
  }
  const kinds = Object.keys(byKind);
  if (kinds.length === 0) {
    fail('auditMetrics.mutation.byKind must name the kinds the run covered');
  }
  let ran = 0;
  let killed = 0;
  for (const kind of kinds) {
    const label = `auditMetrics.mutation.byKind.${kind}`;
    if (!MUTATION_KINDS.includes(kind)) {
      fail(`${label} is not a mutation kind: ${MUTATION_KINDS.join(', ')}`);
    }
    const tally = byKind[kind];
    if (!tally || typeof tally !== 'object' || Array.isArray(tally)) {
      fail(`${label} must be an object`);
    }
    for (const field of ['ran', 'killed']) {
      if (!Number.isInteger(tally[field]) || tally[field] < 0) {
        fail(`${label}.${field} must be a nonnegative integer`);
      }
    }
    if (tally.killed > tally.ran) {
      fail(`${label} cannot kill more mutants than it ran`);
    }
    ran += tally.ran;
    killed += tally.killed;
  }
  if (ran !== mutation.mutants) {
    fail('auditMetrics.mutation.byKind must total the mutant count');
  }
  if (ran - killed !== mutation.survivors) {
    fail('auditMetrics.mutation.byKind must leave the survivor count unkilled');
  }
  if (typeof mutation.finderConclusion !== 'string'
      || mutation.finderConclusion.trim().length === 0) {
    fail('auditMetrics.mutation.finderConclusion must be nonempty');
  }
  return mutation;
}

export function validateAuditMetrics(metrics, {
  requireRejections = false,
  requireDeferrals = false,
  trackerHeadings = null,
} = {}) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    fail('auditMetrics must be an object');
  }
  if (!Number.isInteger(metrics.wallTimeSeconds) || metrics.wallTimeSeconds < 1) {
    fail('auditMetrics.wallTimeSeconds must be a positive integer');
  }
  validateExactNonnegativeCounts(
    metrics.counts,
    AUDIT_COUNT_FIELDS,
    'auditMetrics.counts',
  );
  validateExactNonnegativeCounts(
    metrics.categories,
    AUDIT_CATEGORY_FIELDS,
    'auditMetrics.categories',
  );

  const { counts, categories } = metrics;
  if (counts.raw < counts.deduplicated) {
    fail('auditMetrics raw count cannot be below the deduplicated count');
  }
  if (counts.deduplicated
      !== counts.confirmed + counts.rejected + counts.unverified) {
    fail('auditMetrics deduplicated count must resolve to confirmed, rejected, or unverified');
  }
  if (counts.confirmed !== counts.applied + counts.deferred) {
    fail('auditMetrics confirmed count must resolve to applied or deferred');
  }
  const categorized = AUDIT_CATEGORY_FIELDS.reduce(
    (total, field) => total + categories[field],
    0,
  );
  if (categorized !== counts.confirmed) {
    fail('auditMetrics categories must total the confirmed count');
  }

  if (!Array.isArray(metrics.productionDefects)) {
    fail('auditMetrics.productionDefects must be an array');
  }
  if (metrics.productionDefects.length !== categories.production) {
    fail('auditMetrics.productionDefects must enumerate every production finding');
  }
  let appliedProduction = 0;
  let deferredProduction = 0;
  for (const [index, defect] of metrics.productionDefects.entries()) {
    const label = `auditMetrics.productionDefects[${index}]`;
    if (!defect || typeof defect !== 'object' || Array.isArray(defect)) {
      fail(`${label} must be an object`);
    }
    if (typeof defect.summary !== 'string' || defect.summary.trim().length === 0) {
      fail(`${label}.summary must be nonempty`);
    }
    if (!Array.isArray(defect.foundBy) || defect.foundBy.length === 0) {
      fail(`${label}.foundBy must name at least one finder`);
    }
    if (new Set(defect.foundBy).size !== defect.foundBy.length) {
      fail(`${label}.foundBy cannot name a finder twice`);
    }
    for (const finder of defect.foundBy) {
      if (typeof finder !== 'string' || !SLUG_PATTERN.test(finder)) {
        fail(`${label}.foundBy has invalid finder id: ${finder}`);
      }
    }
    if (!AUDIT_RESOLUTIONS.has(defect.resolution)) {
      fail(`${label}.resolution must be applied or deferred`);
    }
    if (defect.resolution === 'applied') appliedProduction += 1;
    else deferredProduction += 1;
  }
  if (appliedProduction > counts.applied || deferredProduction > counts.deferred) {
    fail('auditMetrics production resolutions exceed the overall resolution counts');
  }

  if (metrics.mutation !== undefined) validateAuditMutation(metrics.mutation);

  // The hand-written half of readiness: three attestations recorded with the
  // pass. .agents/review.md defines them; prepare --readiness supplies the
  // machine half.
  if (metrics.readiness !== undefined) {
    if (!metrics.readiness || typeof metrics.readiness !== 'object'
        || Array.isArray(metrics.readiness)) {
      fail('auditMetrics.readiness must be an object');
    }
    for (const key of ['boundary', 'sourceReview', 'completeness']) {
      if (typeof metrics.readiness[key] !== 'string'
          || metrics.readiness[key].trim().length === 0) {
        fail(`auditMetrics.readiness.${key} must be nonempty`);
      }
    }
  }

  if (metrics.rejections !== undefined) {
    validateAuditRejections(metrics.rejections, counts.rejected);
  } else if (requireRejections && counts.rejected > 0) {
    fail(
      `auditMetrics.rejections must record all ${counts.rejected} rejected `
        + 'findings with their counter-evidence',
    );
  }

  if (metrics.deferrals !== undefined) {
    validateAuditDeferrals(metrics.deferrals, counts.deferred, trackerHeadings);
    validateDeferredProductionAgreement(metrics.deferrals, metrics.productionDefects);
  } else if (requireDeferrals && counts.deferred > 0) {
    fail(
      `auditMetrics.deferrals must record all ${counts.deferred} deferred `
        + 'findings with the deferred-ledger id that carries each one',
    );
  }
  return metrics;
}

// The frontier is where unreviewed debt starts. An audit that begins after
// it never read the commits in between, yet recording it would mark them
// reviewed forever. Require the range to begin at or before the frontier.
// Auditing extra already reviewed commits is harmless; skipping unreviewed
// ones is not.
export function validateAuditedRangeCoverage(kind, base, frontier, ancestorCheck) {
  if (ancestorCheck(base, frontier)) return;
  fail(
    `the audited range starts at ${base}, after the ${kind} frontier `
      + `${frontier}. Those commits would become reviewed history without `
      + `being audited. Re-run the audit from ${frontier}.`,
  );
}

function git(args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    fail(`git ${args.join(' ')} failed: ${detail}`);
  }
}

function resolveCommit(revision) {
  return git(['rev-parse', '--verify', `${revision}^{commit}`]);
}

function isAncestor(base, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', base, head], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    fail(`could not compare commits ${base} and ${head}: ${error.message}`);
  }
}

export function parseNumstat(output) {
  const files = new Set();
  let additions = 0;
  let deletions = 0;
  let binaryFiles = 0;

  for (const line of output.split('\n')) {
    if (!line) continue;
    const [added, deleted, ...pathParts] = line.split('\t');
    const file = pathParts.join('\t');
    if (!file) fail(`invalid numstat line: ${line}`);
    files.add(file);
    if (added === '-' || deleted === '-') {
      binaryFiles += 1;
      continue;
    }
    const addedCount = Number.parseInt(added, 10);
    const deletedCount = Number.parseInt(deleted, 10);
    if (!Number.isInteger(addedCount) || !Number.isInteger(deletedCount)) {
      fail(`invalid numstat counts: ${line}`);
    }
    additions += addedCount;
    deletions += deletedCount;
  }

  return { files, additions, deletions, binaryFiles };
}

function lineCount(contents) {
  if (contents.length === 0) return 0;
  const newlineCount = contents.match(/\n/g)?.length ?? 0;
  return newlineCount + (contents.endsWith('\n') ? 0 : 1);
}

function areaMetricPaths(area) {
  return [
    ...area.paths,
    ...(area.generatedOutputs ?? []).map(({ generator }) => generator),
  ];
}

function generatedOutputPaths(area) {
  return (area.generatedOutputs ?? []).map(({ path }) => path);
}

export function excludeGeneratedLines(metrics, generatedMetrics) {
  if (generatedMetrics.additions > metrics.additions
      || generatedMetrics.deletions > metrics.deletions) {
    fail('generated line totals exceed their enclosing quality metrics');
  }
  return {
    ...metrics,
    additions: metrics.additions - generatedMetrics.additions,
    deletions: metrics.deletions - generatedMetrics.deletions,
    excludedGeneratedLines: generatedMetrics.additions + generatedMetrics.deletions,
  };
}

export function parseAuditFixCommitLog(output) {
  if (!output) return [];
  return output.split('\n').filter(Boolean).map((line) => {
    const [sha, auditTrailers = '', relocationTrailers = ''] = line.split('\t');
    if (!SHA_PATTERN.test(sha)) fail(`invalid commit log row: ${line}`);
    const list = (value) => value.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return {
      sha,
      auditFixFor: list(auditTrailers),
      scoreIdenticalWith: list(relocationTrailers),
    };
  });
}

// A commit that only relocates or renames code, proven by a development score
// identical to the named ancestor, carries review debt against its C source
// rather than against a full pass. Its lines stay out of the gate; the report
// still names them. See "Keep each source file's port in one place" in
// AGENTS.md and the review-limit rules in .agents/review.md.
export function relocationCommits(rows, ancestorCheck = () => true) {
  return rows.filter((row) => row.scoreIdenticalWith.some(
    (baseline) => SHA_PATTERN.test(baseline) && ancestorCheck(baseline, row.sha),
  ));
}

export function excludeRelocatedLines(metrics, relocatedMetrics) {
  // Later commits can rewrite relocated lines, so a per-commit sum may exceed
  // the range total. Clamp rather than fail; the gate only needs the remainder.
  const additions = Math.min(metrics.additions, relocatedMetrics.additions);
  const deletions = Math.min(metrics.deletions, relocatedMetrics.deletions);
  if (additions + deletions === 0) return metrics;
  return {
    ...metrics,
    additions: metrics.additions - additions,
    deletions: metrics.deletions - deletions,
    excludedRelocatedLines: additions + deletions,
  };
}

export function countReviewCommits(
  rows,
  validReviewHeads,
  ancestorCheck = () => true,
) {
  let excludedCommits = 0;
  for (const row of rows) {
    const linked = row.auditFixFor.some((reviewHead) => (
      validReviewHeads.has(reviewHead)
      && ancestorCheck(reviewHead, row.sha)
    ));
    if (linked) excludedCommits += 1;
  }
  return { commits: rows.length - excludedCommits, excludedCommits };
}

function committedMetrics(base, head, area, validReviewHeads) {
  const paths = areaMetricPaths(area);
  const commitLog = git([
    'log',
    '--format=%H%x09%(trailers:key=Audit-fix-for,valueonly,separator=%x2C)'
      + '%x09%(trailers:key=Score-identical-with,valueonly,separator=%x2C)',
    `${base}..${head}`,
    '--',
    ...paths,
  ]);
  const rows = parseAuditFixCommitLog(commitLog);
  const commitCounts = countReviewCommits(rows, validReviewHeads, isAncestor);
  const stats = parseNumstat(
    git(['diff', '--numstat', `${base}..${head}`, '--', ...paths]),
  );
  const generatedPaths = generatedOutputPaths(area);
  const generatedStats = generatedPaths.length === 0
    ? parseNumstat('')
    : parseNumstat(
      git(['diff', '--numstat', `${base}..${head}`, '--', ...generatedPaths]),
    );
  const relocated = parseNumstat('');
  for (const row of relocationCommits(rows, isAncestor)) {
    const commitStats = parseNumstat(
      git(['diff', '--numstat', `${row.sha}^`, row.sha, '--', ...paths]),
    );
    relocated.additions += commitStats.additions;
    relocated.deletions += commitStats.deletions;
  }
  return {
    ...commitCounts,
    ...excludeRelocatedLines(
      excludeGeneratedLines(stats, generatedStats),
      relocated,
    ),
  };
}

function rawWorkingTreeMetrics(paths) {
  const tracked = parseNumstat(
    git(['diff', '--numstat', 'HEAD', '--', ...paths]),
  );
  const untrackedOutput = git([
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    ...paths,
  ]);
  const untracked = untrackedOutput ? untrackedOutput.split('\n') : [];

  for (const file of untracked) {
    tracked.files.add(file);
    const absolutePath = resolve(REPO_ROOT, file);
    if (existsSync(absolutePath)) {
      tracked.additions += lineCount(readFileSync(absolutePath, 'utf8'));
    }
  }

  return tracked;
}

function workingTreeMetrics(area) {
  const paths = areaMetricPaths(area);
  const metrics = rawWorkingTreeMetrics(paths);
  const generatedPaths = generatedOutputPaths(area);
  const generatedMetrics = generatedPaths.length === 0
    ? parseNumstat('')
    : rawWorkingTreeMetrics(generatedPaths);
  return excludeGeneratedLines(metrics, generatedMetrics);
}

function hasChanges(metrics) {
  return metrics.files.size > 0;
}

// The repository-relative paths a committed range touched. record-review and
// record-simplification derive a pass's area labels from these when the caller
// names none.
function changedPathsIn(base, head) {
  const output = git(['diff', '--name-only', `${base}..${head}`]);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * The area labels a pass records. `--areas` names them as a comma-separated
 * list; with no option they are derived from the paths the range changed,
 * which is what a caller would otherwise write out by hand. `changedPaths` is
 * a thunk so the derivation costs nothing when the caller named the labels.
 *
 * Labels attribute findings and route deferrals. They carry no frontier of
 * their own, so an area missing here loses no coverage; it only makes the
 * record less useful to the pass that reads it next.
 */
export function passAreas(config, option, changedPaths) {
  if (option === undefined) {
    const paths = new Set(changedPaths());
    return config.areas
      .filter((area) => area.paths.some((path) => paths.has(path)))
      .map((area) => area.id);
  }
  const labels = option.split(',').map((label) => label.trim())
    .filter(Boolean);
  const known = new Set(config.areas.map((area) => area.id));
  for (const label of labels) {
    if (!known.has(label)) fail(`--areas names no such area: ${label}`);
  }
  return labels;
}

function changedLines(metrics) {
  return metrics.additions + metrics.deletions;
}

export function thresholdReached(current, dirty, commitThreshold, lineThreshold) {
  const currentUnits = current.commits + (hasChanges(dirty) ? 1 : 0);
  const currentLines = changedLines(current) + changedLines(dirty);
  return currentUnits >= commitThreshold || currentLines >= lineThreshold;
}

/**
 * The gate's two states, which mean opposite things to a review pass.
 *
 * `debt` is review debt: implementation stops until a pass runs. A pass is the
 * remedy, so `debt` must never stop one.
 *
 * `health` is whether the ledger can attribute a finding at all. An unassigned
 * `js/` file has no area to route a finding to, so it stops everything,
 * including a pass.
 *
 * Callers read whichever applies. `--check` guards a commit and reads both;
 * `scripts/audit-worktree.mjs prepare --readiness` guards a pass and reads
 * `health` alone. Collapsing the two into one boolean deadlocked the pass a
 * `DUE` gate demands, because readiness refused on the debt the pass existed to
 * clear.
 */
export function qualityGateState({ reviewDue, unassignedCount }) {
  return {
    debt: reviewDue > 0,
    health: unassignedCount === 0,
  };
}

export function qualityGateBlocked({ reviewDue, unassignedCount }) {
  const { debt, health } = qualityGateState({ reviewDue, unassignedCount });
  return debt || !health;
}


function plural(count, singular) {
  return `${count.toLocaleString('en-US')} ${singular}${count === 1 ? '' : 's'}`;
}

export function formatMetrics(metrics, includeCommits = true) {
  const parts = [];
  if (includeCommits) parts.push(plural(metrics.commits, 'commit'));
  parts.push(plural(metrics.files.size, 'file'));
  parts.push(plural(changedLines(metrics), 'changed line'));
  if ((metrics.excludedCommits ?? 0) > 0) {
    parts.push(`${plural(metrics.excludedCommits, 'audit-fix commit')} excluded`);
  }
  if ((metrics.excludedGeneratedLines ?? 0) > 0) {
    parts.push(`${plural(metrics.excludedGeneratedLines, 'generated line')} excluded`);
  }
  if ((metrics.excludedRelocatedLines ?? 0) > 0) {
    parts.push(`${plural(metrics.excludedRelocatedLines, 'relocated line')} excluded`);
  }
  if (metrics.binaryFiles > 0) {
    parts.push(plural(metrics.binaryFiles, 'binary file'));
  }
  return parts.join(', ');
}

export function formatReviewDebt(total, current, dirty, thresholds) {
  const dirtySuffix = hasChanges(dirty)
    ? ` + worktree (${formatMetrics(dirty, false)})`
    : '';
  const totalText = `${formatMetrics(total)}${dirtySuffix}`;
  const currentUnits = current.commits + (hasChanges(dirty) ? 1 : 0);
  const totalUnits = total.commits + (hasChanges(dirty) ? 1 : 0);
  const currentLines = changedLines(current) + changedLines(dirty);

  if (totalUnits === 0 && !hasChanges(total)) return 'clear';
  if (currentUnits >= thresholds.reviewCommits
      || currentLines >= thresholds.reviewChangedLines) {
    return `DUE (${currentUnits}/${thresholds.reviewCommits} commits, `
      + `${currentLines}/${thresholds.reviewChangedLines} lines) — ${totalText}`;
  }
  return `WATCH (${currentUnits}/${thresholds.reviewCommits} commits, `
    + `${currentLines}/${thresholds.reviewChangedLines} lines) — ${totalText}`;
}

export function validateConfigShape(config) {
  if (!config || typeof config !== 'object') fail('QUALITY.json must contain an object');
  if (config.version !== 4) fail('QUALITY.json version must be 4');
  if (!SHA_PATTERN.test(config.trackingBase ?? '')) fail('trackingBase must be a full commit SHA');
  if (!SHA_PATTERN.test(config.enforcementBase ?? '')) {
    fail('enforcementBase must be a full commit SHA');
  }
  if (!Number.isInteger(config.thresholds?.reviewCommits)
      || config.thresholds.reviewCommits < 1) {
    fail('thresholds.reviewCommits must be a positive integer');
  }
  if (!Number.isInteger(config.thresholds?.reviewChangedLines)
      || config.thresholds.reviewChangedLines < 1) {
    fail('thresholds.reviewChangedLines must be a positive integer');
  }
  if (!Array.isArray(config.areas) || config.areas.length === 0) {
    fail('areas must be a non-empty array');
  }
  if (!Array.isArray(config.passes)) fail('passes must be an array');
  if (!Number.isInteger(config.legacyPassCount)
      || config.legacyPassCount < 0
      || config.legacyPassCount > config.passes.length) {
    fail('legacyPassCount must identify the unstructured prefix of passes');
  }

  const areaIds = new Set();
  const claimedPaths = new Map();
  const claimedGenerators = new Map();
  for (const area of config.areas) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(area.id ?? '')) {
      fail(`invalid area id: ${area.id}`);
    }
    if (areaIds.has(area.id)) fail(`duplicate area id: ${area.id}`);
    areaIds.add(area.id);
    if (typeof area.label !== 'string' || area.label.length === 0) {
      fail(`area ${area.id} needs a label`);
    }
    if (!Array.isArray(area.paths) || area.paths.length === 0) {
      fail(`area ${area.id} needs at least one path`);
    }
    for (const path of area.paths) {
      if (typeof path !== 'string' || !path.startsWith('js/') || path.includes('..')) {
        fail(`invalid path in area ${area.id}: ${path}`);
      }
      if (claimedPaths.has(path)) {
        fail(`${path} belongs to both ${claimedPaths.get(path)} and ${area.id}`);
      }
      claimedPaths.set(path, area.id);
    }
    if (area.generatedOutputs !== undefined && !Array.isArray(area.generatedOutputs)) {
      fail(`area ${area.id} generatedOutputs must be an array`);
    }
    const generatedPaths = new Set();
    for (const generated of area.generatedOutputs ?? []) {
      if (!generated || typeof generated !== 'object' || Array.isArray(generated)) {
        fail(`area ${area.id} has an invalid generated output declaration`);
      }
      if (!area.paths.includes(generated.path)) {
        fail(`generated output ${generated.path} is not owned by area ${area.id}`);
      }
      if (generatedPaths.has(generated.path)) {
        fail(`area ${area.id} declares generated output ${generated.path} twice`);
      }
      generatedPaths.add(generated.path);
      if (typeof generated.generator !== 'string'
          || !generated.generator.startsWith('scripts/')
          || generated.generator.includes('..')) {
        fail(`generated output ${generated.path} needs a scripts/ generator path`);
      }
      if (claimedGenerators.has(generated.generator)) {
        fail(
          `${generated.generator} generates outputs in both `
            + `${claimedGenerators.get(generated.generator)} and ${area.id}`,
        );
      }
      claimedGenerators.set(generated.generator, area.id);
      if (typeof generated.check !== 'string' || generated.check.trim().length === 0) {
        fail(`generated output ${generated.path} needs a regeneration check`);
      }
    }
  }

  if (!Array.isArray(config.deferred)) fail('deferred must be an array');
  const deferredIds = new Set();
  for (const [index, entry] of config.deferred.entries()) {
    const label = `deferred[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`${label} must be an object`);
    }
    if (typeof entry.id !== 'string' || entry.id.trim().length === 0) {
      fail(`${label}.id must be nonempty`);
    }
    if (deferredIds.has(entry.id)) fail(`deferred ids must be unique: ${entry.id}`);
    deferredIds.add(entry.id);
    if (entry.area !== null && !areaIds.has(entry.area)) {
      fail(`${label}.area must be null or a known area id`);
    }
    if (!AUDIT_CATEGORY_FIELDS.includes(entry.category) && entry.category !== 'scope') {
      fail(`${label}.category must be scope or one of: `
        + AUDIT_CATEGORY_FIELDS.join(', '));
    }
    if (!DEFERRAL_EFFORTS.includes(entry.effort)) {
      fail(`${label}.effort must be one of: ${DEFERRAL_EFFORTS.join(', ')}`);
    }
    if (!DEFERRAL_STATUSES.includes(entry.status)) {
      fail(`${label}.status must be one of: ${DEFERRAL_STATUSES.join(', ')}`);
    }
    if (typeof entry.from !== 'string' || entry.from.trim().length === 0) {
      fail(`${label}.from must name the recording pass head or origin`);
    }
    if (typeof entry.detail !== 'string' || entry.detail.trim().length === 0) {
      fail(`${label}.detail must be nonempty`);
    }
  }

  for (const [passIndex, pass] of config.passes.entries()) {
    if (!PASS_KINDS.has(pass.kind)) fail(`invalid pass kind: ${pass.kind}`);
    if (!SHA_PATTERN.test(pass.head ?? '')) fail('pass head must be a full commit SHA');
    // Passes recorded while areas labeled findings keep those labels as
    // inert history; nothing interprets them and new passes record none.
    if (pass.areas !== undefined
        && (!Array.isArray(pass.areas)
          || pass.areas.some((areaId) => typeof areaId !== 'string'))) {
      fail('pass areas, when present, must be an array of strings');
    }
    if (pass.bases !== undefined) {
      fail('passes no longer carry per-area bases; the frontier is the '
        + 'newest recorded head');
    }
    if (!PASS_OUTCOMES.has(pass.outcome)) fail(`invalid pass outcome: ${pass.outcome}`);
    if (pass.kind === 'review' && !REVIEW_LEVELS.has(pass.level)) {
      fail(`invalid review level: ${pass.level}`);
    }
    if (pass.kind === 'simplification' && pass.level !== undefined) {
      fail('simplification passes do not have a review level');
    }
    if (typeof pass.evidence !== 'string' || pass.evidence.trim().length === 0) {
      fail('every pass needs evidence');
    }
    if (typeof pass.recordedAt !== 'string' || Number.isNaN(Date.parse(pass.recordedAt))) {
      fail('every pass needs an ISO recordedAt timestamp');
    }
    // Passes recorded before record-review validated the audited range have no
    // auditedRange. Their bases stay authoritative; only the recorded range is
    // missing, and the ledger is append-only, so it cannot be reconstructed.
    if (pass.auditedRange !== undefined) {
      const { base, head: rangeHead } = parseRange(pass.auditedRange);
      if (!SHA_PATTERN.test(base) || !SHA_PATTERN.test(rangeHead)) {
        fail('pass auditedRange must name two full commit SHAs');
      }
      if (rangeHead !== pass.head) {
        fail(`pass auditedRange ends at ${rangeHead}; expected pass head ${pass.head}`);
      }
    }
    if (pass.auditMetrics !== undefined) validateAuditMetrics(pass.auditMetrics);
    if (passIndex >= config.legacyPassCount && pass.auditMetrics === undefined) {
      fail('new quality passes require structured auditMetrics');
    }
  }

}

function loadConfig() {
  const config = JSON.parse(readFileSync(QUALITY_PATH, 'utf8'));
  validateConfigShape(config);
  return config;
}

function allReviewHeads(config) {
  return new Set(config.passes
    .filter((pass) => pass.kind === 'review')
    .map((pass) => pass.head));
}

// One frontier per pass kind: the newest recorded head, floored at the
// enforcement base. Every pass covers the whole diff since the previous one
// and reviewers read the range's full diff either way. Deferrals carry their
// own area labels; passes recorded before 2026-08-01 keep per-area `bases`
// maps and `areas` lists as inert history.
function validateHistory(config, head) {
  if (!isAncestor(config.trackingBase, config.enforcementBase)) {
    fail('trackingBase must be an ancestor of enforcementBase');
  }
  if (!isAncestor(config.enforcementBase, head)) {
    fail('enforcementBase must be an ancestor of HEAD');
  }
  const frontiers = {
    review: config.enforcementBase,
    simplification: config.enforcementBase,
  };

  for (const pass of config.passes) {
    if (!isAncestor(pass.head, head)) {
      fail(`pass head ${pass.head} is not an ancestor of HEAD`);
    }
    if (pass.auditedRange !== undefined) {
      const { base } = parseRange(pass.auditedRange);
      validateAuditedRangeCoverage(pass.kind, base, frontiers[pass.kind],
        isAncestor);
    }
    if (isAncestor(frontiers[pass.kind], pass.head)) {
      frontiers[pass.kind] = pass.head;
    }
  }

  return frontiers;
}

function currentBase(frontier, enforcementBase) {
  if (isAncestor(frontier, enforcementBase)) return enforcementBase;
  if (isAncestor(enforcementBase, frontier)) return frontier;
  fail(`coverage frontier ${frontier} diverges from enforcement base ${enforcementBase}`);
}

function allCurrentJsFiles() {
  const output = git([
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    'js',
  ]);
  return output ? output.split('\n') : [];
}

function unassignedJsFiles(config) {
  const assigned = new Set(config.areas.flatMap((area) => area.paths));
  return allCurrentJsFiles().filter((file) => !assigned.has(file));
}

function buildStatus(config, head) {
  const frontiers = validateHistory(config, head);
  const reviewHeads = allReviewHeads(config);

  // A pseudo-area spanning every owned path, so committedMetrics counts each
  // commit once however many areas it touches, while its changed lines
  // still sum across those areas' paths.
  const union = {
    id: 'all',
    label: 'All production paths',
    paths: config.areas.flatMap((area) => area.paths),
    generatedOutputs: config.areas.flatMap((area) => area.generatedOutputs ?? []),
  };
  const enforcedBase = currentBase(frontiers.review, config.enforcementBase);
  const review = {
    frontier: frontiers.review,
    total: committedMetrics(frontiers.review, head, union, reviewHeads),
    current: committedMetrics(enforcedBase, head, union, reviewHeads),
  };

  return {
    review,
    dirty: workingTreeMetrics(union),
    simplificationFrontier: frontiers.simplification,
    unassigned: unassignedJsFiles(config),
  };
}

function shortSha(sha) {
  return sha.slice(0, 8);
}

function printStatus(config, head, status, verbose) {
  const worktreeSuffix = hasChanges(status.dirty)
    ? ' + implementation worktree' : '';
  console.log(`Quality coverage at ${shortSha(head)}${worktreeSuffix}`);
  console.log(
    `Baseline: ${shortSha(config.trackingBase)}; enforcement begins after `
      + shortSha(config.enforcementBase),
  );
  console.log('');

  const { review } = status;
  console.log(`Review since ${shortSha(review.frontier)}: ${formatReviewDebt(
    review.total, review.current, status.dirty, config.thresholds)}`);
  if (verbose) {
    console.log(`Simplification frontier: ${
      shortSha(status.simplificationFrontier)}`);
  }
  if (status.unassigned.length > 0) {
    console.log(`Unassigned js/ files: ${status.unassigned.join(', ')}`);
  }
  // The open backlog prints on every run so deferred findings stay visible;
  // .agents/loop.md disposes of them at goal close and .agents/selection.md
  // requires one entry resolved once an area reaches ten.
  const openEntries = openDeferrals(config.deferred);
  const homeless = openEntries.filter((entry) => !entry.area).length;
  console.log(`Open deferrals: ${openEntries.length}`
    + (homeless > 0 ? ` (${homeless} without an area)` : '') + '.');
  for (const [area, count] of sweepCandidates(config.deferred)) {
    console.log(`Sweep candidate: ${area} holds ${count} open deferrals.`);
  }
  const reviewDue = thresholdReached(
    review.current,
    status.dirty,
    config.thresholds.reviewCommits,
    config.thresholds.reviewChangedLines,
  ) ? 1 : 0;
  console.log(
    reviewDue
      ? 'Review gate: BLOCKED (the batch threshold is reached).'
      : 'Review gate: clear.',
  );

  const gate = qualityGateState({
    reviewDue,
    unassignedCount: status.unassigned.length,
  });
  return { blocked: gate.debt || !gate.health, gate };
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) fail(`unexpected argument: ${argument}`);
    const key = argument.slice(2);
    if (Object.hasOwn(options, key)) fail(`${argument} was provided twice`);
    if (key === 'check' || key === 'verbose' || key === 'dry-run'
        || key === 'health') {
      options[key] = true;
      continue;
    }
    if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
      fail(`${argument} needs a value`);
    }
    options[key] = args[index + 1];
    index += 1;
  }
  return options;
}

function rejectUnknownOptions(options, allowed) {
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) fail(`unknown option: --${key}`);
  }
}

function writeConfig(config) {
  const temporaryPath = `${QUALITY_PATH}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, QUALITY_PATH);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function withLedgerLock(callback) {
  let descriptor;
  try {
    descriptor = openSync(QUALITY_LOCK_PATH, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      fail(
        'another quality pass is being recorded; if no recorder is running, '
          + 'remove the stale .quality-status.lock file',
      );
    }
    throw error;
  }

  try {
    writeFileSync(descriptor, `${process.pid}\n`, 'utf8');
    return callback();
  } finally {
    closeSync(descriptor);
    if (existsSync(QUALITY_LOCK_PATH)) unlinkSync(QUALITY_LOCK_PATH);
  }
}

// deferredIds is injectable so a test can drive this wiring against a
// literal id set instead of the repository's QUALITY.json.
export function auditMetricsFromOptions(options, {
  deferredIds = null,
} = {}) {
  if (options['audit-metrics'] && options['audit-metrics-file']) {
    fail('provide only one of --audit-metrics or --audit-metrics-file');
  }
  let serialized = options['audit-metrics'];
  if (options['audit-metrics-file']) {
    const path = resolve(REPO_ROOT, options['audit-metrics-file']);
    try {
      serialized = readFileSync(path, 'utf8');
    } catch (error) {
      fail(`could not read audit metrics file ${path}: ${error.message}`);
    }
  }
  if (!serialized) {
    fail('--audit-metrics or --audit-metrics-file is required');
  }
  let metrics;
  try {
    metrics = JSON.parse(serialized);
  } catch (error) {
    fail(`audit metrics must be valid JSON: ${error.message}`);
  }
  return validateAuditMetrics(metrics, {
    requireRejections: true,
    requireDeferrals: true,
    trackerHeadings: deferredIds,
  });
}

// Exported so a test can pin the options the recorder accepts, not just the
// functions behind them. Testing passAreas() alone let --areas ship dead: the
// branch was correct and unreachable, because the name was never in this set.
export function passOptionNames(kind) {
  return new Set([
    'range',
    'head',
    'outcome',
    'evidence',
    'audit-metrics',
    'audit-metrics-file',
    'areas',
    'dry-run',
    ...(kind === 'review' ? ['level'] : []),
  ]);
}

function preparePass(kind, options) {
  rejectUnknownOptions(options, passOptionNames(kind));
  const config = loadConfig();
  const repositoryHead = resolveCommit('HEAD');
  const frontiers = validateHistory(config, repositoryHead);
  if (!options.range?.trim()) fail('--range <base>..<head> is required');
  const revisions = parseRange(options.range.trim());
  const rangeBase = resolveCommit(revisions.base);
  const head = resolveCommit(revisions.head);
  // --head is an optional restatement of the range head. It cannot select a
  // different commit; a disagreement means the operator recorded a pass for
  // something other than the range that was audited.
  if (options.head !== undefined && resolveCommit(options.head) !== head) {
    fail(`--head ${resolveCommit(options.head)} does not match the --range head ${head}`);
  }
  if (rangeBase === head) fail('--range covers no commits');
  if (!isAncestor(rangeBase, head)) {
    fail(`--range base ${rangeBase} is not an ancestor of its head ${head}`);
  }
  if (!isAncestor(head, repositoryHead)) {
    fail(`pass head ${head} is not an ancestor of HEAD`);
  }
  if (!PASS_OUTCOMES.has(options.outcome)) {
    fail('--outcome must be changed or no-change');
  }
  if (!options.evidence?.trim()) fail('--evidence is required');
  const auditMetrics = auditMetricsFromOptions(options, {
    deferredIds: new Set(config.deferred.map((entry) => entry.id)),
  });
  if (kind === 'review' && !REVIEW_LEVELS.has(options.level)) {
    fail('review passes require --level light or --level full');
  }
  if (kind === 'simplification' && options.level !== undefined) {
    fail('simplification passes do not accept --level');
  }

  // A pass covers the whole diff since the frontier, so any production
  // worktree change disqualifies recording.
  const union = {
    id: 'all',
    label: 'All production paths',
    paths: config.areas.flatMap((area) => area.paths),
    generatedOutputs: config.areas.flatMap((area) => area.generatedOutputs ?? []),
  };
  if (hasChanges(workingTreeMetrics(union))) {
    fail('cannot record an exact committed pass while production paths have '
      + 'worktree changes');
  }

  const frontier = frontiers[kind];
  if (!isAncestor(frontier, head)) {
    fail(`head ${head} does not cover the existing ${kind} frontier ${frontier}`);
  }
  validateAuditedRangeCoverage(kind, rangeBase, frontier, isAncestor);

  const areas = passAreas(
    config,
    options.areas,
    () => changedPathsIn(rangeBase, head),
  );

  const pass = {
    kind,
    head,
    auditedRange: `${rangeBase}..${head}`,
    ...(kind === 'review' ? { level: options.level } : {}),
    areas,
    outcome: options.outcome,
    evidence: `${renderCountsSentence(auditMetrics)} ${options.evidence.trim()}`,
    auditMetrics,
    recordedAt: new Date().toISOString(),
  };
  if (!options['dry-run']) {
    config.passes.push(pass);
    // A recorded deferral reopens its ledger entry: deferring a finding a
    // second time means its earlier closure did not hold.
    for (const { trackedIn } of auditMetrics.deferrals ?? []) {
      const entry = config.deferred.find((d) => d.id === trackedIn.trim());
      if (entry) entry.status = 'open';
    }
    writeConfig(config);
  }

  console.log(`${options['dry-run'] ? 'Would record' : 'Recorded'} ${kind} pass through ${head}:`);
  console.log(`  audited range: ${rangeBase}..${head}`);
  console.log(`  ${kind} frontier: ${frontier} -> ${head}`);
  console.log(`  area labels: ${areas.join(', ')}`);
  if (options['dry-run']) {
    console.log('Dry run: QUALITY.json was not changed.');
  } else {
    console.log('Commit QUALITY.json as tracker metadata after checking the dashboard.');
  }
}

function recordPass(kind, options) {
  if (options['dry-run']) {
    preparePass(kind, options);
    return;
  }
  withLedgerLock(() => preparePass(kind, options));
}

// Ledger queries. Agents read recorded passes through these subcommands
// rather than by opening QUALITY.json, whose passes array is an archive.
// Rendered into the stored evidence so the prose never restates the
// structured fields: 56 of the first 82 recorded passes duplicated every
// nonzero count into --evidence by hand.
export function renderCountsSentence(metrics) {
  const { counts } = metrics;
  const mutation = metrics.mutation
    ? `; mutation: ${metrics.mutation.survivors} survivors of `
      + `${metrics.mutation.mutants} mutants`
    : '';
  return `Counts: ${counts.raw} raw, ${counts.deduplicated} deduplicated, `
    + `${counts.confirmed} confirmed, ${counts.applied} applied, `
    + `${counts.deferred} deferred, ${counts.rejected} rejected, `
    + `${counts.unverified} unverified${mutation}.`;
}

export function collectRejections(passes) {
  const rows = [];
  for (const pass of passes) {
    for (const rejection of pass.auditMetrics?.rejections ?? []) {
      rows.push({ head: pass.head, kind: pass.kind, ...rejection });
    }
  }
  return rows;
}

export function openDeferrals(deferred, { area = null, status = 'open' } = {}) {
  return deferred.filter((entry) => (status === 'all' || entry.status === status)
    && (!area || entry.area === area));
}

// A scope entry names unported territory a boundary goal attacks, so counting
// it here would schedule the rest of the port as sweeps. Only debt a sweep can
// resolve counts toward the ten .agents/selection.md holds every area under.
export function sweepCandidates(deferred, threshold = 10) {
  const counts = new Map();
  for (const entry of deferred) {
    if (entry.status !== 'open' || !entry.area) continue;
    if (entry.category === 'scope') continue;
    counts.set(entry.area, (counts.get(entry.area) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= threshold);
}

function queryLedger(command, options, config) {
  if (command === 'pass') {
    rejectUnknownOptions(options, new Set(['head']));
    if (!options.head) fail('pass needs --head <sha or prefix>');
    const matches = config.passes.filter(
      (pass) => pass.head.startsWith(options.head),
    );
    if (matches.length === 0) fail(`no recorded pass has head ${options.head}`);
    for (const pass of matches) console.log(JSON.stringify(pass, null, 2));
    return;
  }
  if (command === 'rejections') {
    rejectUnknownOptions(options, new Set());
    const rows = collectRejections(config.passes);
    for (const row of rows) {
      console.log(`${shortSha(row.head)} ${row.summary}`);
      console.log(`    counter: ${row.counterEvidence}`);
    }
    console.log(`${plural(rows.length, 'recorded rejection')}.`);
    return;
  }
  rejectUnknownOptions(options, new Set(['area', 'status', 'id']));
  if (options.id) {
    const entry = config.deferred.find((d) => d.id === options.id);
    if (!entry) fail(`no deferred entry has id: ${options.id}`);
    console.log(JSON.stringify(entry, null, 2));
    return;
  }
  const status = options.status ?? 'open';
  if (status !== 'all' && !DEFERRAL_STATUSES.includes(status)) {
    fail('--status must be open, closed, or all');
  }
  const rows = openDeferrals(config.deferred,
    { area: options.area ?? null, status });
  for (const row of rows) {
    console.log(`[${row.area ?? '-'}] (${row.category}, ${row.effort}) ${row.id}`);
  }
  console.log(`${plural(rows.length, 'deferral')} (${status}`
    + `${options.area ? `, ${options.area}` : ''}).`);
  for (const [area, count] of sweepCandidates(config.deferred)) {
    console.log(`Sweep candidate: ${area} holds ${count} open deferrals.`);
  }
}

function deferEntry(options) {
  rejectUnknownOptions(options,
    new Set(['id', 'area', 'category', 'effort', 'detail']));
  for (const key of ['id', 'category', 'effort', 'detail']) {
    if (!options[key]?.trim()) fail(`--${key} is required`);
  }
  withLedgerLock(() => {
    const config = loadConfig();
    if (config.deferred.some((entry) => entry.id === options.id.trim())) {
      fail(`deferred id already exists: ${options.id.trim()}`);
    }
    config.deferred.push({
      id: options.id.trim(),
      area: options.area ?? null,
      category: options.category,
      effort: options.effort,
      status: 'open',
      from: resolveCommit('HEAD'),
      detail: options.detail.trim(),
    });
    // Full-shape validation rejects a bad area, category, or effort before
    // anything is written.
    validateConfigShape(config);
    writeConfig(config);
    console.log(`Deferred: ${options.id.trim()}`);
  });
}

// The one QUALITY.json write the per-chunk workflow asks of a worker:
// assigning each new js/ file to an area as soon as the file is created.
// A subcommand makes that write without hand-editing the ledger. Validation
// runs on the mutated config before anything is written, so an unknown
// area, a duplicate assignment, and a path outside js/ are all refused.
export function assignPathToArea(config, file, areaId) {
  const area = config.areas.find((entry) => entry.id === areaId);
  if (!area) fail(`no area has id: ${areaId}`);
  const owner = config.areas.find((entry) => entry.paths.includes(file));
  if (owner) fail(`${file} already belongs to area ${owner.id}`);
  area.paths.push(file);
  area.paths.sort();
  validateConfigShape(config);
  return area;
}

function listAreas() {
  const config = loadConfig();
  for (const area of config.areas) {
    console.log(`${area.id}: ${area.label} `
      + `(${plural(area.paths.length, 'file')})`);
  }
}

function assignEntry(options) {
  rejectUnknownOptions(options, new Set(['file', 'area']));
  for (const key of ['file', 'area']) {
    if (!options[key]?.trim()) fail(`--${key} is required`);
  }
  withLedgerLock(() => {
    const config = loadConfig();
    const area = assignPathToArea(
      config, options.file.trim(), options.area.trim());
    writeConfig(config);
    console.log(`Assigned ${options.file.trim()} to ${area.id}.`);
  });
}

/** Parse `git log --format=%H%x09<Mutants trailer>` rows for the check. */
export function missingMutantTrailers(logOutput) {
  if (!logOutput) return { commits: 0, missing: [] };
  const rows = logOutput.split('\n').filter(Boolean).map((line) => {
    const [sha, trailer = ''] = line.split('\t');
    return { sha, trailer: trailer.trim() };
  });
  return {
    commits: rows.length,
    missing: rows.filter((row) => !row.trailer).map((row) => row.sha),
  };
}

// Turns .agents/review.md's per-slice mutation record from an inspection
// into a check: every js/-touching commit in the range must carry the
// `Mutants:` trailer that `mutate-sites --emit-trailer` prints.
function sliceMutants(options) {
  rejectUnknownOptions(options, new Set(['range']));
  if (!options.range?.trim()) fail('--range <base>..<head> is required');
  const revisions = parseRange(options.range.trim());
  const output = git([
    'log',
    '--format=%H%x09%(trailers:key=Mutants,valueonly,separator=%x2C)',
    `${resolveCommit(revisions.base)}..${resolveCommit(revisions.head)}`,
    '--',
    'js',
  ]);
  const { commits, missing } = missingMutantTrailers(output);
  for (const sha of missing) console.log(`no Mutants trailer: ${sha}`);
  console.log(`${plural(commits, 'js commit')} in range, `
    + `${missing.length} without a Mutants trailer.`);
  if (missing.length > 0) process.exitCode = 1;
}

function resolveDeferral(options) {
  rejectUnknownOptions(options, new Set(['id']));
  if (!options.id?.trim()) fail('--id is required');
  withLedgerLock(() => {
    const config = loadConfig();
    const entry = config.deferred.find((d) => d.id === options.id.trim());
    if (!entry) fail(`no deferred entry has id: ${options.id.trim()}`);
    if (entry.status === 'closed') fail(`already closed: ${entry.id}`);
    entry.status = 'closed';
    writeConfig(config);
    console.log(`Closed: ${entry.id}`);
  });
}

function printHelp() {
  console.log(`Usage:
  npm run quality
  npm run quality -- --check
  npm run quality -- --verbose
  npm run quality -- record-review --range <base>..<head> \\
    --level <light|full> --outcome <changed|no-change> --evidence <text> \\
    <--audit-metrics <json>|--audit-metrics-file <path>> \\
    [--head <commit>] [--dry-run]
  npm run quality -- record-simplification \\
    --range <base>..<head> --outcome <changed|no-change> --evidence <text> \\
    <--audit-metrics <json>|--audit-metrics-file <path>> \\
    [--head <commit>] [--dry-run]
  npm run quality -- rejections
  npm run quality -- deferrals [--area <id>] [--status open|closed|all] [--id <id>]
  npm run quality -- pass --head <sha or prefix>
  npm run quality -- areas
  npm run quality -- assign --file js/<name>.js --area <id>
  npm run quality -- defer --id <id> --category <c> --effort <small|slice> \\
    --detail <text> [--area <id>]
  npm run quality -- resolve-deferral --id <id>
  npm run quality -- slice-mutants --range <base>..<head>

The query subcommands read the ledger, so a later pass consults prior
rejections and open deferrals without opening QUALITY.json. defer opens a
ledger entry and resolve-deferral closes one when its fix lands. areas lists
the quality areas, and assign inserts a new js/ file into one, the write the
per-chunk workflow requires as soon as the file is created.

Status is derived from Git. The review frontier is the newest recorded
review head, and recording a pass advances it through the --range head.
--areas names the areas the range touched, as labels for finding attribution
and deferral routing; areas carry no frontiers of their own.

--range is the commit range the audit actually read. Its base must be at or
before the frontier, so no unaudited commit becomes reviewed history.
--head, when given, must name the same commit as the range head.

Audit metrics must list one rejections entry, with summary and counterEvidence,
for every rejected finding, and one deferrals entry, with summary and a
trackedIn naming an id in the deferred ledger, for every deferred finding.
Create the ledger entry with defer before recording the pass.`);
}

export function main(argv) {
  const [first, ...rest] = argv;
  if (first === '--help' || first === '-h' || first === 'help') {
    printHelp();
    return;
  }
  if (first === 'record-review' || first === 'record-simplification') {
    const kind = first === 'record-review' ? 'review' : 'simplification';
    recordPass(kind, parseOptions(rest));
    return;
  }
  if (first === 'rejections' || first === 'deferrals' || first === 'pass') {
    queryLedger(first, parseOptions(rest), loadConfig());
    return;
  }
  if (first === 'areas') {
    rejectUnknownOptions(parseOptions(rest), new Set());
    listAreas();
    return;
  }
  if (first === 'assign') {
    assignEntry(parseOptions(rest));
    return;
  }
  if (first === 'defer') {
    deferEntry(parseOptions(rest));
    return;
  }
  if (first === 'resolve-deferral') {
    resolveDeferral(parseOptions(rest));
    return;
  }
  if (first === 'slice-mutants') {
    sliceMutants(parseOptions(rest));
    return;
  }

  const statusArgs = first === 'status' ? rest : argv;
  const options = parseOptions(statusArgs);
  rejectUnknownOptions(options, new Set(['check', 'verbose', 'health']));
  const config = loadConfig();
  const head = resolveCommit('HEAD');
  const status = buildStatus(config, head);
  const result = printStatus(config, head, status, options.verbose === true);
  // --health narrows --check to the half a review pass must satisfy. A pass is
  // the remedy for review debt, so debt cannot be a reason to refuse one; an
  // unassigned js/ file still is, because a finding in it has no area to go to.
  if (options.check) {
    const failed = options.health ? !result.gate.health : result.blocked;
    if (failed) process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`quality-status: ${error.message}`);
    process.exitCode = 2;
  }
}
