import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  formatMetrics,
  parseNumstat,
  qualityGateBlocked,
  reviewsSinceLastSimplification,
  simplificationReviewDue,
  thresholdReached,
  validateConfigShape,
} from './quality-status.mjs';

test('the checked-in quality ledger has a valid schema', async () => {
  const config = JSON.parse(
    await readFile(new URL('../QUALITY.json', import.meta.url), 'utf8'),
  );

  assert.doesNotThrow(() => validateConfigShape(config));
  assert.deepEqual(config.thresholds, {
    reviewAdvisoryCommits: 3,
    reviewAdvisoryChangedLines: 500,
    reviewCommits: 10,
    reviewChangedLines: 1000,
    simplificationReviewInterval: 2,
  });
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

test('simplification cadence resets and becomes due before a second review', () => {
  const area = 'world';
  const passes = [
    { kind: 'review', areas: [area] },
    { kind: 'review', areas: ['runtime'] },
    { kind: 'simplification', areas: [area] },
    { kind: 'review', areas: [area] },
  ];
  assert.equal(reviewsSinceLastSimplification(passes, area), 1);

  const clean = {
    files: new Set(), additions: 0, deletions: 0, binaryFiles: 0,
  };
  const reviewedCode = {
    commits: 1,
    files: new Set(['js/rooms.js']),
    additions: 8,
    deletions: 2,
    binaryFiles: 0,
  };
  const noUnreviewedCode = { ...clean, commits: 0 };
  assert.equal(simplificationReviewDue({
    completedReviews: 1,
    interval: 2,
    reviewCurrent: noUnreviewedCode,
    simplificationTotal: reviewedCode,
    dirty: clean,
  }), false);

  // One new dirty file represents the work that will receive review number two.
  const dirty = {
    files: new Set(['js/region.js']), additions: 4, deletions: 1, binaryFiles: 0,
  };
  assert.equal(simplificationReviewDue({
    completedReviews: 1,
    interval: 2,
    reviewCurrent: noUnreviewedCode,
    simplificationTotal: reviewedCode,
    dirty,
  }), true);
  assert.equal(simplificationReviewDue({
    completedReviews: 2,
    interval: 2,
    reviewCurrent: noUnreviewedCode,
    simplificationTotal: reviewedCode,
    dirty: clean,
  }), true);
});

test('simplification debt is advisory while review and path ownership block', () => {
  // Five due simplification areas exercise the advisory path without review
  // debt or unassigned implementation files.
  assert.equal(qualityGateBlocked({
    reviewDue: 0,
    simplificationDue: 5,
    unassignedCount: 0,
  }), false);
  // One due review area and one unassigned file exercise the two blocking inputs.
  assert.equal(qualityGateBlocked({ reviewDue: 1, unassignedCount: 0 }), true);
  assert.equal(qualityGateBlocked({ reviewDue: 0, unassignedCount: 1 }), true);
});

test('an implementation path cannot belong to two quality areas', () => {
  // Full-length placeholder SHAs satisfy the schema while the configured
  // thresholds mirror repository policy; this test isolates path ownership.
  const config = {
    version: 2,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    simplificationCadenceBase: '3'.repeat(40),
    thresholds: {
      reviewAdvisoryCommits: 3,
      reviewAdvisoryChangedLines: 500,
      reviewCommits: 10,
      reviewChangedLines: 1000,
      simplificationReviewInterval: 2,
    },
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
