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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const QUALITY_PATH = resolve(REPO_ROOT, 'QUALITY.json');
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

export function validateAuditMetrics(metrics) {
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
  return metrics;
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
    const separator = line.indexOf('\t');
    const sha = separator === -1 ? line : line.slice(0, separator);
    if (!SHA_PATTERN.test(sha)) fail(`invalid commit log row: ${line}`);
    const trailers = separator === -1 ? '' : line.slice(separator + 1);
    return {
      sha,
      auditFixFor: trailers.split(',').map((value) => value.trim()).filter(Boolean),
    };
  });
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
    '--format=%H%x09%(trailers:key=Audit-fix-for,valueonly,separator=%x2C)',
    `${base}..${head}`,
    '--',
    ...paths,
  ]);
  const commitCounts = countReviewCommits(
    parseAuditFixCommitLog(commitLog),
    validReviewHeads,
    isAncestor,
  );
  const stats = parseNumstat(
    git(['diff', '--numstat', `${base}..${head}`, '--', ...paths]),
  );
  const generatedPaths = generatedOutputPaths(area);
  const generatedStats = generatedPaths.length === 0
    ? parseNumstat('')
    : parseNumstat(
      git(['diff', '--numstat', `${base}..${head}`, '--', ...generatedPaths]),
    );
  return { ...commitCounts, ...excludeGeneratedLines(stats, generatedStats) };
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

function changedLines(metrics) {
  return metrics.additions + metrics.deletions;
}

export function thresholdReached(current, dirty, commitThreshold, lineThreshold) {
  const currentUnits = current.commits + (hasChanges(dirty) ? 1 : 0);
  const currentLines = changedLines(current) + changedLines(dirty);
  return currentUnits >= commitThreshold || currentLines >= lineThreshold;
}

export function qualityGateBlocked({ reviewDue, unassignedCount }) {
  return reviewDue > 0 || unassignedCount > 0;
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
  if (currentUnits >= thresholds.reviewAdvisoryCommits
      || currentLines >= thresholds.reviewAdvisoryChangedLines) {
    return `ADVISORY (${currentUnits}/${thresholds.reviewCommits} commits, `
      + `${currentLines}/${thresholds.reviewChangedLines} lines) — ${totalText}`;
  }
  if (currentUnits > 0 || currentLines > 0 || hasChanges(current)) {
    return `WATCH (${currentUnits}/${thresholds.reviewCommits} commits, `
      + `${currentLines}/${thresholds.reviewChangedLines} lines) — ${totalText}`;
  }
  if (total.commits >= thresholds.reviewCommits
      || changedLines(total) >= thresholds.reviewChangedLines) {
    return `BASELINE DUE — ${totalText}`;
  }
  return `BASELINE — ${totalText}`;
}

export function validateConfigShape(config) {
  if (!config || typeof config !== 'object') fail('QUALITY.json must contain an object');
  if (config.version !== 4) fail('QUALITY.json version must be 4');
  if (!SHA_PATTERN.test(config.trackingBase ?? '')) fail('trackingBase must be a full commit SHA');
  if (!SHA_PATTERN.test(config.enforcementBase ?? '')) {
    fail('enforcementBase must be a full commit SHA');
  }
  if (!Number.isInteger(config.thresholds?.reviewAdvisoryCommits)
      || config.thresholds.reviewAdvisoryCommits < 1) {
    fail('thresholds.reviewAdvisoryCommits must be a positive integer');
  }
  if (!Number.isInteger(config.thresholds?.reviewAdvisoryChangedLines)
      || config.thresholds.reviewAdvisoryChangedLines < 1) {
    fail('thresholds.reviewAdvisoryChangedLines must be a positive integer');
  }
  if (!Number.isInteger(config.thresholds?.reviewCommits)
      || config.thresholds.reviewCommits < 1) {
    fail('thresholds.reviewCommits must be a positive integer');
  }
  if (!Number.isInteger(config.thresholds?.reviewChangedLines)
      || config.thresholds.reviewChangedLines < 1) {
    fail('thresholds.reviewChangedLines must be a positive integer');
  }
  if (config.thresholds.reviewAdvisoryCommits >= config.thresholds.reviewCommits) {
    fail('the review commit advisory must be below the review gate');
  }
  if (config.thresholds.reviewAdvisoryChangedLines
      >= config.thresholds.reviewChangedLines) {
    fail('the review line advisory must be below the review gate');
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

  if (!config.legacyAreaExpansions
      || typeof config.legacyAreaExpansions !== 'object'
      || Array.isArray(config.legacyAreaExpansions)) {
    fail('legacyAreaExpansions must be an object');
  }
  const legacyAreaIds = new Set();
  const expandedTargets = new Set();
  for (const [legacyId, targets] of Object.entries(config.legacyAreaExpansions)) {
    if (!SLUG_PATTERN.test(legacyId) || areaIds.has(legacyId)) {
      fail(`invalid legacy area id: ${legacyId}`);
    }
    if (!Array.isArray(targets) || targets.length === 0) {
      fail(`legacy area ${legacyId} needs at least one current target`);
    }
    if (new Set(targets).size !== targets.length) {
      fail(`legacy area ${legacyId} cannot name a target twice`);
    }
    for (const target of targets) {
      if (!areaIds.has(target)) {
        fail(`legacy area ${legacyId} names unknown target: ${target}`);
      }
      if (expandedTargets.has(target)) {
        fail(`current area ${target} belongs to two legacy expansions`);
      }
      expandedTargets.add(target);
    }
    legacyAreaIds.add(legacyId);
  }

  for (const [passIndex, pass] of config.passes.entries()) {
    if (!PASS_KINDS.has(pass.kind)) fail(`invalid pass kind: ${pass.kind}`);
    if (!SHA_PATTERN.test(pass.head ?? '')) fail('pass head must be a full commit SHA');
    if (!Array.isArray(pass.areas) || pass.areas.length === 0) {
      fail('every pass needs at least one area');
    }
    if (new Set(pass.areas).size !== pass.areas.length) {
      fail('a pass cannot list an area twice');
    }
    if (!pass.bases || typeof pass.bases !== 'object' || Array.isArray(pass.bases)) {
      fail('every pass needs per-area bases');
    }
    if (Object.keys(pass.bases).length !== pass.areas.length) {
      fail('pass bases must match its areas exactly');
    }
    for (const areaId of pass.areas) {
      if (!areaIds.has(areaId) && !legacyAreaIds.has(areaId)) {
        fail(`pass names unknown area: ${areaId}`);
      }
      if (passIndex >= config.legacyPassCount && legacyAreaIds.has(areaId)) {
        fail(`new passes cannot name legacy area: ${areaId}`);
      }
      if (!SHA_PATTERN.test(pass.bases[areaId] ?? '')) {
        fail(`pass base for ${areaId} must be a full commit SHA`);
      }
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
    if (pass.auditMetrics !== undefined) validateAuditMetrics(pass.auditMetrics);
    if (passIndex >= config.legacyPassCount && pass.auditMetrics === undefined) {
      fail('new quality passes require structured auditMetrics');
    }
  }

  return { areaIds, claimedPaths, legacyAreaIds };
}

function loadConfig() {
  const config = JSON.parse(readFileSync(QUALITY_PATH, 'utf8'));
  validateConfigShape(config);
  return config;
}

function currentAreaIds(config, recordedAreaId) {
  return config.legacyAreaExpansions[recordedAreaId] ?? [recordedAreaId];
}

function reviewHeadsByArea(config) {
  const heads = new Map(config.areas.map(({ id }) => [id, new Set()]));
  for (const pass of config.passes) {
    if (pass.kind !== 'review') continue;
    for (const recordedAreaId of pass.areas) {
      for (const areaId of currentAreaIds(config, recordedAreaId)) {
        heads.get(areaId).add(pass.head);
      }
    }
  }
  return heads;
}

function validateHistory(config, head) {
  if (!isAncestor(config.trackingBase, config.enforcementBase)) {
    fail('trackingBase must be an ancestor of enforcementBase');
  }
  if (!isAncestor(config.enforcementBase, head)) {
    fail('enforcementBase must be an ancestor of HEAD');
  }
  const frontiers = {
    review: new Map(config.areas.map((area) => [area.id, config.trackingBase])),
    simplification: new Map(config.areas.map((area) => [area.id, config.trackingBase])),
  };

  for (const pass of config.passes) {
    if (!isAncestor(pass.head, head)) {
      fail(`pass head ${pass.head} is not an ancestor of HEAD`);
    }
    for (const recordedAreaId of pass.areas) {
      for (const areaId of currentAreaIds(config, recordedAreaId)) {
        const expectedBase = frontiers[pass.kind].get(areaId);
        if (pass.bases[recordedAreaId] !== expectedBase) {
          fail(
            `${pass.kind} pass for ${recordedAreaId} -> ${areaId} starts at `
              + `${pass.bases[recordedAreaId]}; expected ${expectedBase}`,
          );
        }
        if (!isAncestor(expectedBase, pass.head)) {
          fail(`${pass.kind} pass for ${areaId} moves its frontier backwards or sideways`);
        }
        frontiers[pass.kind].set(areaId, pass.head);
      }
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
  const reviewHeads = reviewHeadsByArea(config);
  const rows = [];

  for (const area of config.areas) {
    const dirty = workingTreeMetrics(area);
    const row = { area, dirty, kinds: {} };
    const reviewFrontier = frontiers.review.get(area.id);
    const enforcedBase = currentBase(reviewFrontier, config.enforcementBase);
    row.kinds.review = {
      frontier: reviewFrontier,
      total: committedMetrics(reviewFrontier, head, area, reviewHeads.get(area.id)),
      current: committedMetrics(enforcedBase, head, area, reviewHeads.get(area.id)),
    };
    row.kinds.simplification = {
      frontier: frontiers.simplification.get(area.id),
    };
    rows.push(row);
  }

  return { rows, unassigned: unassignedJsFiles(config) };
}

function shortSha(sha) {
  return sha.slice(0, 8);
}

function printStatus(config, head, status, verbose) {
  const hasImplementationWorktree = status.rows.some((row) => hasChanges(row.dirty));
  const worktreeSuffix = hasImplementationWorktree ? ' + implementation worktree' : '';
  console.log(`Quality coverage at ${shortSha(head)}${worktreeSuffix}`);
  console.log(
    `Baseline: ${shortSha(config.trackingBase)}; enforcement begins after `
      + shortSha(config.enforcementBase),
  );
  console.log('');

  let reviewDue = 0;
  let reviewAdvisory = 0;
  for (const row of status.rows) {
    const review = row.kinds.review;
    const areaReviewDue = thresholdReached(
      review.current,
      row.dirty,
      config.thresholds.reviewCommits,
      config.thresholds.reviewChangedLines,
    );
    const areaReviewAdvisory = !areaReviewDue && thresholdReached(
      review.current,
      row.dirty,
      config.thresholds.reviewAdvisoryCommits,
      config.thresholds.reviewAdvisoryChangedLines,
    );
    if (areaReviewDue) reviewDue += 1;
    if (areaReviewAdvisory) reviewAdvisory += 1;

    console.log(`${row.area.label} [${row.area.id}]`);
    console.log(
      `  Review:  ${formatReviewDebt(
        review.total,
        review.current,
        row.dirty,
        config.thresholds,
      )}`,
    );
    if (verbose) {
      console.log(
        `  Frontiers: review ${shortSha(review.frontier)}, `
          + `simplification ${shortSha(row.kinds.simplification.frontier)}`,
      );
    }
  }

  console.log('');
  if (status.unassigned.length > 0) {
    console.log(`Unassigned js/ files: ${status.unassigned.join(', ')}`);
  }
  console.log(
    reviewDue > 0
      ? `Review gate: BLOCKED (${plural(reviewDue, 'area')} reached the batch threshold).`
      : 'Review gate: clear.',
  );
  console.log(
    reviewAdvisory > 0
      ? `Review advisory: CHECKPOINT (${plural(reviewAdvisory, 'area')} reached `
        + 'the advisory threshold).'
      : 'Review advisory: clear.',
  );
  if (status.rows.some((row) => row.kinds.review.frontier === config.trackingBase)) {
    console.log(
      'BASELINE debt is visible but exempt from the gate until that area '
        + 'receives its first recorded pass.',
    );
  }

  return {
    blocked: qualityGateBlocked({
      reviewDue,
      unassignedCount: status.unassigned.length,
    }),
  };
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) fail(`unexpected argument: ${argument}`);
    const key = argument.slice(2);
    if (Object.hasOwn(options, key)) fail(`${argument} was provided twice`);
    if (key === 'check' || key === 'verbose' || key === 'dry-run') {
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

function selectedAreas(config, value) {
  if (!value) fail('--areas is required');
  const ids = value.split(',').map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) fail('--areas must name at least one area');
  if (new Set(ids).size !== ids.length) fail('--areas cannot name an area twice');
  const known = new Set(config.areas.map((area) => area.id));
  for (const id of ids) {
    if (!known.has(id)) fail(`unknown area: ${id}`);
  }
  return ids;
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

function auditMetricsFromOptions(options) {
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
  return validateAuditMetrics(metrics);
}

function preparePass(kind, options) {
  rejectUnknownOptions(
    options,
    new Set([
      'areas',
      'head',
      'outcome',
      'evidence',
      'audit-metrics',
      'audit-metrics-file',
      'dry-run',
      ...(kind === 'review' ? ['level'] : []),
    ]),
  );
  const config = loadConfig();
  const repositoryHead = resolveCommit('HEAD');
  const frontiers = validateHistory(config, repositoryHead);
  const areas = selectedAreas(config, options.areas);
  const head = resolveCommit(options.head ?? 'HEAD');
  if (!isAncestor(head, repositoryHead)) {
    fail(`pass head ${head} is not an ancestor of HEAD`);
  }
  if (!PASS_OUTCOMES.has(options.outcome)) {
    fail('--outcome must be changed or no-change');
  }
  if (!options.evidence?.trim()) fail('--evidence is required');
  const auditMetrics = auditMetricsFromOptions(options);
  if (kind === 'review' && !REVIEW_LEVELS.has(options.level)) {
    fail('review passes require --level light or --level full');
  }
  if (kind === 'simplification' && options.level !== undefined) {
    fail('simplification passes do not accept --level');
  }

  const areaById = new Map(config.areas.map((area) => [area.id, area]));
  const dirtyAreas = areas.filter((id) => hasChanges(workingTreeMetrics(areaById.get(id))));
  if (dirtyAreas.length > 0) {
    fail(
      'cannot record an exact committed pass while these areas have '
        + `worktree changes: ${dirtyAreas.join(', ')}`,
    );
  }

  const bases = Object.fromEntries(areas.map((id) => [id, frontiers[kind].get(id)]));
  for (const [areaId, base] of Object.entries(bases)) {
    if (!isAncestor(base, head)) {
      fail(`head ${head} does not cover the existing ${kind} frontier for ${areaId}`);
    }
  }

  const pass = {
    kind,
    bases,
    head,
    areas,
    ...(kind === 'review' ? { level: options.level } : {}),
    outcome: options.outcome,
    evidence: options.evidence.trim(),
    auditMetrics,
    recordedAt: new Date().toISOString(),
  };
  if (!options['dry-run']) {
    config.passes.push(pass);
    writeConfig(config);
  }

  console.log(`${options['dry-run'] ? 'Would record' : 'Recorded'} ${kind} pass through ${head}:`);
  for (const areaId of areas) {
    console.log(`  ${areaId}: ${bases[areaId]}..${head}`);
  }
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

function printHelp() {
  console.log(`Usage:
  npm run quality
  npm run quality -- --check
  npm run quality -- --verbose
  npm run quality -- record-review --areas <id,...> --level <light|full> \\
    --outcome <changed|no-change> --evidence <text> \\
    <--audit-metrics <json>|--audit-metrics-file <path>> \\
    [--head <commit>] [--dry-run]
  npm run quality -- record-simplification --areas <id,...> \\
    --outcome <changed|no-change> --evidence <text> \\
    <--audit-metrics <json>|--audit-metrics-file <path>> \\
    [--head <commit>] [--dry-run]

Status is derived from Git. A recorded pass advances each selected area's
frontier from its prior exact commit through --head (HEAD by default).`);
}

function main(argv) {
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

  const statusArgs = first === 'status' ? rest : argv;
  const options = parseOptions(statusArgs);
  rejectUnknownOptions(options, new Set(['check', 'verbose']));
  const config = loadConfig();
  const head = resolveCommit('HEAD');
  const status = buildStatus(config, head);
  const result = printStatus(config, head, status, options.verbose === true);
  if (options.check && result.blocked) process.exitCode = 1;
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
