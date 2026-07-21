import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  formatMetrics,
  parseNumstat,
  qualityGateBlocked,
  thresholdReached,
  validateConfigShape,
} from './quality-status.mjs';

test('the checked-in quality ledger has a valid schema', async () => {
  const config = JSON.parse(
    await readFile(new URL('../QUALITY.json', import.meta.url), 'utf8'),
  );

  assert.doesNotThrow(() => validateConfigShape(config));
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

test('review thresholds batch small commits but catch large or accumulated work', () => {
  // Three ten-line fixes exercise the advisory checkpoint without reaching
  // either the six-commit or 500-line blocking threshold.
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
  assert.equal(thresholdReached(threeSmallCommits, clean, 6, 500), false);

  // Six commits exercise the accumulation bound even when each commit is tiny.
  assert.equal(
    thresholdReached({ ...threeSmallCommits, commits: 6 }, clean, 6, 500),
    true,
  );
  // One 500-line change exercises the size bound without relying on commit count.
  assert.equal(
    thresholdReached(
      { ...threeSmallCommits, commits: 1, additions: 450, deletions: 50 },
      clean,
      6,
      500,
    ),
    true,
  );
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
    version: 1,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    thresholds: {
      reviewCommits: 6,
      reviewChangedLines: 500,
      simplificationCommits: 6,
      simplificationChangedLines: 500,
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
