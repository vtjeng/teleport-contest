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

function fail(message) {
  throw new Error(message);
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

function committedMetrics(base, head, paths) {
  const commits = Number.parseInt(
    git(['rev-list', '--count', `${base}..${head}`, '--', ...paths]),
    10,
  );
  const stats = parseNumstat(
    git(['diff', '--numstat', `${base}..${head}`, '--', ...paths]),
  );
  return { commits, ...stats };
}

function workingTreeMetrics(paths) {
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

function hasImplementationWork(current, dirty) {
  return current.commits > 0
    || changedLines(current) > 0
    || hasChanges(dirty);
}

// The ledger is append-only recording chronology. Reordering otherwise valid
// entries changes this cadence even when each kind's frontier stays monotonic.
export function reviewsSinceLastSimplification(passes, areaId) {
  let reviews = 0;
  for (const pass of passes) {
    if (!pass.areas.includes(areaId)) continue;
    if (pass.kind === 'simplification') reviews = 0;
    else if (pass.kind === 'review') reviews += 1;
  }
  return reviews;
}

export function simplificationReviewDue({
  completedReviews,
  interval,
  reviewCurrent,
  simplificationTotal,
  dirty,
}) {
  if (!hasImplementationWork(simplificationTotal, dirty)) return false;
  if (completedReviews >= interval) return true;
  return completedReviews === interval - 1
    && hasImplementationWork(reviewCurrent, dirty);
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
  if (metrics.binaryFiles > 0) {
    parts.push(plural(metrics.binaryFiles, 'binary file'));
  }
  return parts.join(', ');
}

function formatReviewDebt(total, current, dirty, thresholds) {
  const dirtySuffix = hasChanges(dirty)
    ? ` + worktree (${formatMetrics(dirty, false)})`
    : '';
  const totalText = `${formatMetrics(total)}${dirtySuffix}`;
  const currentUnits = current.commits + (hasChanges(dirty) ? 1 : 0);
  const totalUnits = total.commits + (hasChanges(dirty) ? 1 : 0);
  const currentLines = changedLines(current) + changedLines(dirty);

  if (totalUnits === 0) return 'clear';
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
  if (currentUnits > 0) {
    return `WATCH (${currentUnits}/${thresholds.reviewCommits} commits, `
      + `${currentLines}/${thresholds.reviewChangedLines} lines) — ${totalText}`;
  }
  if (total.commits >= thresholds.reviewCommits
      || changedLines(total) >= thresholds.reviewChangedLines) {
    return `BASELINE DUE — ${totalText}`;
  }
  return `BASELINE — ${totalText}`;
}

function formatSimplificationDebt(
  total,
  current,
  dirty,
  completedReviews,
  interval,
  due,
) {
  const dirtySuffix = hasChanges(dirty)
    ? ` + worktree (${formatMetrics(dirty, false)})`
    : '';
  const totalText = `${formatMetrics(total)}${dirtySuffix}`;
  const totalUnits = total.commits + (hasChanges(dirty) ? 1 : 0);
  const cadence = `${completedReviews}/${interval} correctness passes`;

  if (totalUnits === 0) return 'clear';
  if (due) return `DUE (${cadence}) — ${totalText}`;
  if (completedReviews > 0 || hasImplementationWork(current, dirty)) {
    return `WATCH (${cadence}) — ${totalText}`;
  }
  return `BASELINE — ${totalText}`;
}

export function validateConfigShape(config) {
  if (!config || typeof config !== 'object') fail('QUALITY.json must contain an object');
  if (config.version !== 2) fail('QUALITY.json version must be 2');
  if (!SHA_PATTERN.test(config.trackingBase ?? '')) fail('trackingBase must be a full commit SHA');
  if (!SHA_PATTERN.test(config.enforcementBase ?? '')) {
    fail('enforcementBase must be a full commit SHA');
  }
  if (!SHA_PATTERN.test(config.simplificationCadenceBase ?? '')) {
    fail('simplificationCadenceBase must be a full commit SHA');
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
  if (!Number.isInteger(config.thresholds?.simplificationReviewInterval)
      || config.thresholds.simplificationReviewInterval < 1) {
    fail('thresholds.simplificationReviewInterval must be a positive integer');
  }
  if (!Array.isArray(config.areas) || config.areas.length === 0) {
    fail('areas must be a non-empty array');
  }
  if (!Array.isArray(config.passes)) fail('passes must be an array');

  const areaIds = new Set();
  const claimedPaths = new Map();
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
  }

  for (const pass of config.passes) {
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
      if (!areaIds.has(areaId)) fail(`pass names unknown area: ${areaId}`);
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
  }

  return { areaIds, claimedPaths };
}

function loadConfig() {
  const config = JSON.parse(readFileSync(QUALITY_PATH, 'utf8'));
  validateConfigShape(config);
  return config;
}

function validateHistory(config, head) {
  if (!isAncestor(config.trackingBase, config.enforcementBase)) {
    fail('trackingBase must be an ancestor of enforcementBase');
  }
  if (!isAncestor(config.enforcementBase, head)) {
    fail('enforcementBase must be an ancestor of HEAD');
  }
  if (!isAncestor(config.simplificationCadenceBase, head)) {
    fail('simplificationCadenceBase must be an ancestor of HEAD');
  }

  const frontiers = {
    review: new Map(config.areas.map((area) => [area.id, config.trackingBase])),
    simplification: new Map(config.areas.map((area) => [area.id, config.trackingBase])),
  };

  for (const pass of config.passes) {
    if (!isAncestor(pass.head, head)) {
      fail(`pass head ${pass.head} is not an ancestor of HEAD`);
    }
    for (const areaId of pass.areas) {
      const expectedBase = frontiers[pass.kind].get(areaId);
      if (pass.bases[areaId] !== expectedBase) {
        fail(
          `${pass.kind} pass for ${areaId} starts at ${pass.bases[areaId]}; `
            + `expected ${expectedBase}`,
        );
      }
      if (!isAncestor(expectedBase, pass.head)) {
        fail(`${pass.kind} pass for ${areaId} moves its frontier backwards or sideways`);
      }
      frontiers[pass.kind].set(areaId, pass.head);
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
  const cadencePasses = config.passes.filter((pass) => (
    pass.head !== config.simplificationCadenceBase
      && isAncestor(config.simplificationCadenceBase, pass.head)
  ));
  const rows = [];

  for (const area of config.areas) {
    const dirty = workingTreeMetrics(area.paths);
    const row = { area, dirty, kinds: {} };
    for (const kind of PASS_KINDS) {
      const frontier = frontiers[kind].get(area.id);
      const enforcedBase = currentBase(frontier, config.enforcementBase);
      row.kinds[kind] = {
        frontier,
        total: committedMetrics(frontier, head, area.paths),
        current: committedMetrics(enforcedBase, head, area.paths),
      };
    }
    row.simplificationReviewCount = reviewsSinceLastSimplification(
      cadencePasses,
      area.id,
    );
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
  let simplificationDue = 0;
  for (const row of status.rows) {
    const review = row.kinds.review;
    const simplification = row.kinds.simplification;
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
    const areaSimplificationDue = simplificationReviewDue({
      completedReviews: row.simplificationReviewCount,
      interval: config.thresholds.simplificationReviewInterval,
      reviewCurrent: review.current,
      simplificationTotal: simplification.total,
      dirty: row.dirty,
    });
    if (areaReviewDue) reviewDue += 1;
    if (areaReviewAdvisory) reviewAdvisory += 1;
    if (areaSimplificationDue) simplificationDue += 1;

    console.log(`${row.area.label} [${row.area.id}]`);
    console.log(
      `  Review:  ${formatReviewDebt(
        review.total,
        review.current,
        row.dirty,
        config.thresholds,
      )}`,
    );
    console.log(
      `  Simplify: ${formatSimplificationDebt(
        simplification.total,
        simplification.current,
        row.dirty,
        row.simplificationReviewCount,
        config.thresholds.simplificationReviewInterval,
        areaSimplificationDue,
      )}`,
    );
    if (verbose) {
      console.log(
        `  Frontiers: review ${shortSha(review.frontier)}, `
          + `simplification ${shortSha(simplification.frontier)}`,
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
  console.log(
    simplificationDue > 0
      ? `Simplification advisory: DUE (${plural(simplificationDue, 'area')} `
        + 'reached a batch threshold).'
      : 'Simplification advisory: clear.',
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

function preparePass(kind, options) {
  rejectUnknownOptions(
    options,
    new Set([
      'areas',
      'head',
      'outcome',
      'evidence',
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
  if (kind === 'review' && !REVIEW_LEVELS.has(options.level)) {
    fail('review passes require --level light or --level full');
  }
  if (kind === 'simplification' && options.level !== undefined) {
    fail('simplification passes do not accept --level');
  }

  const areaById = new Map(config.areas.map((area) => [area.id, area]));
  const dirtyAreas = areas.filter((id) => hasChanges(workingTreeMetrics(areaById.get(id).paths)));
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
    --outcome <changed|no-change> --evidence <text> [--head <commit>] [--dry-run]
  npm run quality -- record-simplification --areas <id,...> \\
    --outcome <changed|no-change> --evidence <text> [--head <commit>] [--dry-run]

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
