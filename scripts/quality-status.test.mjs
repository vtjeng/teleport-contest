import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  countReviewCommits,
  excludeGeneratedLines,
  formatMetrics,
  formatReviewDebt,
  parseAuditFixCommitLog,
  parseNumstat,
  qualityGateBlocked,
  thresholdReached,
  validateAuditMetrics,
  validateConfigShape,
} from './quality-status.mjs';

const EMPTY_AUDIT_METRICS = Object.freeze({
  wallTimeSeconds: 1,
  counts: {
    raw: 0,
    deduplicated: 0,
    confirmed: 0,
    applied: 0,
    deferred: 0,
    rejected: 0,
    unverified: 0,
  },
  categories: {
    production: 0,
    tests: 0,
    clarity: 0,
    simplification: 0,
    other: 0,
  },
  productionDefects: [],
});

test('the checked-in quality ledger has a valid schema', async () => {
  const config = JSON.parse(
    await readFile(new URL('../QUALITY.json', import.meta.url), 'utf8'),
  );

  assert.doesNotThrow(() => validateConfigShape(config));
  assert.equal(config.version, 4);
  assert.equal(config.legacyPassCount, 21);
  assert.equal(
    config.passes.slice(config.legacyPassCount).every((pass) => pass.auditMetrics),
    true,
  );
  assert.deepEqual(config.thresholds, {
    reviewAdvisoryCommits: 3,
    reviewAdvisoryChangedLines: 500,
    reviewCommits: 10,
    reviewChangedLines: 1000,
  });
  assert.deepEqual(config.legacyAreaExpansions, {
    world: ['generation', 'monsters', 'world-effects'],
    interaction: ['commands', 'display'],
  });
  const generatedOutputs = config.areas.flatMap(
    (area) => area.generatedOutputs ?? [],
  );
  assert.deepEqual(
    generatedOutputs.map(({ path }) => path).sort(),
    [
      'js/dungeon_data.js',
      'js/monsters.js',
      'js/objects.js',
      'js/random_text_data.js',
      'js/symbol_data.js',
      'js/themeroom_data.js',
    ],
  );
});

test('numstat parsing totals text changes and identifies binary files', () => {
  // The small, distinct counts make additions and deletions easy to distinguish.
  const metrics = parseNumstat('7\t2\tjs/obj.js\n3\t1\tjs/invent.js\n-\t-\tjs/data.bin');

  assert.deepEqual([...metrics.files], [
    'js/obj.js',
    'js/invent.js',
    'js/data.bin',
  ]);
  assert.equal(metrics.additions, 10);
  assert.equal(metrics.deletions, 3);
  assert.equal(metrics.binaryFiles, 1);
});

test('metric formatting separates commits, files, and changed lines', () => {
  // These values exercise singular and plural labels in one compact fixture.
  const text = formatMetrics({
    commits: 1,
    files: new Set(['js/obj.js', 'js/invent.js']),
    additions: 20,
    deletions: 4,
    binaryFiles: 0,
  });

  assert.equal(text, '1 commit, 2 files, 24 changed lines');
});

test('generated lines are excluded without hiding files or generator work', () => {
  // The generated output contributes 900 lines; the other 100 lines represent
  // its generator and ordinary production changes which remain thresholded.
  const weighted = excludeGeneratedLines({
    commits: 2,
    files: new Set(['js/generated.js', 'scripts/generate.mjs', 'js/runtime.js']),
    additions: 900,
    deletions: 100,
    binaryFiles: 0,
  }, {
    files: new Set(['js/generated.js']),
    additions: 800,
    deletions: 100,
    binaryFiles: 0,
  });

  assert.equal(weighted.additions, 100);
  assert.equal(weighted.deletions, 0);
  assert.equal(weighted.excludedGeneratedLines, 900);
  assert.equal(
    formatMetrics(weighted),
    '2 commits, 3 files, 100 changed lines, 900 generated lines excluded',
  );
});

test('only audit-fix commits linked to a recorded ancestor are excluded', () => {
  const reviewHead = '1'.repeat(40);
  const ordinary = '2'.repeat(40);
  const linkedFix = '3'.repeat(40);
  const invalidFix = '4'.repeat(40);
  const rows = parseAuditFixCommitLog([
    `${ordinary}\t`,
    `${linkedFix}\t${reviewHead}`,
    `${invalidFix}\t${'5'.repeat(40)}`,
  ].join('\n'));

  const counts = countReviewCommits(
    rows,
    new Set([reviewHead]),
    (base, head) => base === reviewHead && head === linkedFix,
  );
  assert.deepEqual(counts, { commits: 2, excludedCommits: 1 });
  assert.equal(
    formatMetrics({
      ...counts,
      files: new Set(['js/runtime.js']),
      additions: 4,
      deletions: 1,
      binaryFiles: 0,
    }),
    '2 commits, 1 file, 5 changed lines, 1 audit-fix commit excluded',
  );
});

test('excluded audit-fix commits retain visible line-based review debt', () => {
  const current = {
    commits: 0,
    excludedCommits: 1,
    files: new Set(['js/runtime.js']),
    additions: 4,
    deletions: 1,
    binaryFiles: 0,
  };
  const clean = {
    files: new Set(), additions: 0, deletions: 0, binaryFiles: 0,
  };
  assert.match(
    formatReviewDebt(current, current, clean, {
      reviewAdvisoryCommits: 3,
      reviewAdvisoryChangedLines: 500,
      reviewCommits: 10,
      reviewChangedLines: 1000,
    }),
    /^WATCH \(0\/10 commits, 5\/1000 lines\)/,
  );
});

test('structured audit metrics preserve categories and finder attribution', () => {
  const metrics = {
    wallTimeSeconds: 75,
    counts: {
      raw: 4,
      deduplicated: 3,
      confirmed: 2,
      applied: 1,
      deferred: 1,
      rejected: 1,
      unverified: 0,
    },
    categories: {
      production: 1,
      tests: 1,
      clarity: 0,
      simplification: 0,
      other: 0,
    },
    productionDefects: [{
      summary: 'preserve source mutation order',
      foundBy: ['variable-trace'],
      resolution: 'applied',
    }],
  };

  assert.equal(validateAuditMetrics(metrics), metrics);
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      categories: { ...metrics.categories, production: 0 },
    }),
    /categories must total the confirmed count/,
  );
});

test('review thresholds separate the advisory checkpoint from the gate', () => {
  // Three ten-line fixes reach the commit advisory while remaining below both
  // the ten-commit and 1,000-line blocking thresholds.
  const threeSmallCommits = {
    commits: 3,
    files: new Set(['js/obj.js']),
    additions: 20,
    deletions: 10,
    binaryFiles: 0,
  };
  const clean = {
    files: new Set(), additions: 0, deletions: 0, binaryFiles: 0,
  };
  assert.equal(thresholdReached(threeSmallCommits, clean, 3, 500), true);
  assert.equal(thresholdReached(threeSmallCommits, clean, 10, 1000), false);

  // Ten commits exercise the hard accumulation bound even when each is tiny.
  assert.equal(
    thresholdReached({ ...threeSmallCommits, commits: 10 }, clean, 10, 1000),
    true,
  );
  // Five hundred lines reach only the size advisory.
  const advisoryLines = {
    ...threeSmallCommits,
    commits: 1,
    additions: 450,
    deletions: 50,
  };
  assert.equal(thresholdReached(advisoryLines, clean, 3, 500), true);
  assert.equal(thresholdReached(advisoryLines, clean, 10, 1000), false);

  // One 1,000-line change reaches the hard size bound without ten commits.
  assert.equal(
    thresholdReached(
      { ...threeSmallCommits, commits: 1, additions: 900, deletions: 100 },
      clean,
      10,
      1000,
    ),
    true,
  );
});

test('review debt and path ownership block the quality gate', () => {
  assert.equal(qualityGateBlocked({ reviewDue: 0, unassignedCount: 0 }), false);
  // One due review area and one unassigned file exercise the two blocking inputs.
  assert.equal(qualityGateBlocked({ reviewDue: 1, unassignedCount: 0 }), true);
  assert.equal(qualityGateBlocked({ reviewDue: 0, unassignedCount: 1 }), true);
});

test('an implementation path cannot belong to two quality areas', () => {
  // Full-length placeholder SHAs satisfy the schema while the configured
  // thresholds mirror repository policy; this test isolates path ownership.
  const config = {
    version: 4,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: {
      reviewAdvisoryCommits: 3,
      reviewAdvisoryChangedLines: 500,
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
    legacyAreaExpansions: {},
    areas: [
      { id: 'first', label: 'First', paths: ['js/shared.js'] },
      { id: 'second', label: 'Second', paths: ['js/shared.js'] },
    ],
    passes: [],
  };

  assert.throws(
    () => validateConfigShape(config),
    /js\/shared\.js belongs to both first and second/,
  );
});

test('new ledger passes require structured audit metrics', () => {
  const sha = '1'.repeat(40);
  const pass = {
    kind: 'review',
    bases: { first: sha },
    head: '2'.repeat(40),
    areas: ['first'],
    level: 'light',
    outcome: 'no-change',
    evidence: 'No findings.',
    recordedAt: '2026-07-23T00:00:00.000Z',
  };
  const config = {
    version: 4,
    trackingBase: sha,
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: {
      reviewAdvisoryCommits: 3,
      reviewAdvisoryChangedLines: 500,
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
    legacyAreaExpansions: {},
    areas: [{ id: 'first', label: 'First', paths: ['js/first.js'] }],
    passes: [pass],
  };

  assert.throws(
    () => validateConfigShape(config),
    /new quality passes require structured auditMetrics/,
  );
  pass.auditMetrics = EMPTY_AUDIT_METRICS;
  assert.doesNotThrow(() => validateConfigShape(config));
});
