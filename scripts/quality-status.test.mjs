import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assignPathToArea,
  auditMetricsFromOptions,
  countReviewCommits,
  excludeGeneratedLines,
  formatMetrics,
  formatReviewDebt,
  excludeRelocatedLines,
  parseAuditFixCommitLog,
  parseNumstat,
  qualityGateBlocked,
  relocationCommits,
  thresholdReached,
  validateAuditedRangeCoverage,
  validateAuditMetrics,
  validateAuditMutation,
  openDeferrals,
  sweepCandidates,
  collectRejections,
  missingMutantTrailers,
  renderCountsSentence,
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
    reviewCommits: 10,
    reviewChangedLines: 1000,
  });
  const generatedOutputs = config.areas.flatMap(
    (area) => area.generatedOutputs ?? [],
  );
  assert.deepEqual(
    generatedOutputs.map(({ path }) => path).sort(),
    [
      'js/dungeon_data.js',
      'js/extcmdlist_data.js',
      'js/monsters.js',
      'js/objects.js',
      'js/random_text_data.js',
      'js/shtypes_data.js',
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

test('only relocation commits naming an ancestor are excluded', () => {
    const baseline = '1'.repeat(40);
    const ordinary = '2'.repeat(40);
    const relocation = '3'.repeat(40);
    // Names a commit that is not an ancestor, so it stays in the gate.
    const unlinked = '4'.repeat(40);
    const rows = parseAuditFixCommitLog([
        `${ordinary}\t\t`,
        `${relocation}\t\t${baseline}`,
        `${unlinked}\t\t${'5'.repeat(40)}`,
    ].join('\n'));

    const excluded = relocationCommits(
        rows,
        (base, head) => base === baseline && head === relocation,
    );
    assert.deepEqual(excluded.map((row) => row.sha), [relocation]);
});

test('a relocation trailer coexists with an audit-fix trailer', () => {
    const [row] = parseAuditFixCommitLog(
        `${'6'.repeat(40)}\t${'7'.repeat(40)}\t${'8'.repeat(40)}`,
    );
    assert.deepEqual(row.auditFixFor, ['7'.repeat(40)]);
    assert.deepEqual(row.scoreIdenticalWith, ['8'.repeat(40)]);
});

test('relocated lines leave the gate but stay named in the report', () => {
    const metrics = {
        commits: 2,
        files: new Set(['js/monmove.js', 'js/dogmove.js']),
        additions: 1000,
        deletions: 900,
        binaryFiles: 0,
    };
    // 950 of the 1,900 changed lines came from the relocation commit.
    const reduced = excludeRelocatedLines(metrics, {
        files: new Set(), additions: 500, deletions: 450, binaryFiles: 0,
    });
    assert.equal(reduced.additions + reduced.deletions, 950);
    assert.equal(reduced.excludedRelocatedLines, 950);
    assert.equal(
        formatMetrics(reduced),
        '2 commits, 2 files, 950 changed lines, 950 relocated lines excluded',
    );
});

test('relocated line totals clamp to the range they are subtracted from', () => {
    // A later commit rewrote relocated lines, so the per-commit sum exceeds
    // the range total. The remainder floors at zero instead of going negative.
    const reduced = excludeRelocatedLines(
        { files: new Set(), additions: 10, deletions: 4, binaryFiles: 0 },
        { files: new Set(), additions: 25, deletions: 9, binaryFiles: 0 },
    );
    assert.equal(reduced.additions, 0);
    assert.equal(reduced.deletions, 0);
    assert.equal(reduced.excludedRelocatedLines, 14);
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

test('a pass records what the mutation run reported and what the finder made of it',
  () => {
    // The numbers a pass attaches under `.agents/review.md`, "Mutation-test the
    // reviewed lines": what ran, what survived, the per-kind split, and the
    // test-quality finder's conclusion about the survivors.
    const mutation = {
      mutants: 119,
      survivors: 49,
      byKind: {
        relational: { ran: 30, killed: 12 },
        logical: { ran: 60, killed: 40 },
        boolean: { ran: 29, killed: 18 },
      },
      finderConclusion: 'traced all 49 survivors; two became test findings',
    };

    assert.equal(validateAuditMutation(mutation), mutation);
    assert.equal(
      validateAuditMetrics({ ...EMPTY_AUDIT_METRICS, mutation }).mutation,
      mutation,
    );
    // The ledger has to reject it too, so a broken record cannot reach
    // QUALITY.json through the metrics validator that writes it.
    assert.throws(
      () => validateAuditMetrics({
        ...EMPTY_AUDIT_METRICS,
        mutation: { ...mutation, survivors: 48 },
      }),
      /byKind must leave the survivor count unkilled/,
    );

    // The per-kind split is the record's own arithmetic check: 30 + 60 + 29 is
    // 119 mutants, and 119 less the 70 killed is 49 survivors. A record whose
    // headline disagrees with its breakdown states a rate it cannot support.
    assert.throws(
      () => validateAuditMutation({ ...mutation, mutants: 120 }),
      /byKind must total the mutant count/,
    );
    assert.throws(
      () => validateAuditMutation({ ...mutation, survivors: 48 }),
      /byKind must leave the survivor count unkilled/,
    );
    assert.throws(
      () => validateAuditMutation({ ...mutation, survivors: 200 }),
      /more survivors than mutants/,
    );
    assert.throws(
      () => validateAuditMutation({
        ...mutation,
        byKind: { ...mutation.byKind, statement: { ran: 0, killed: 0 } },
      }),
      /is not a mutation kind/,
    );
    assert.throws(
      () => validateAuditMutation({
        ...mutation,
        byKind: { relational: { ran: 30, killed: 31 }, logical: { ran: 60, killed: 40 },
          boolean: { ran: 29, killed: 18 } },
      }),
      /cannot kill more mutants than it ran/,
    );
    // A run that names no kind measured nothing, and an unexplained survivor
    // list is what this record exists to prevent.
    assert.throws(
      () => validateAuditMutation({ ...mutation, byKind: {} }),
      /must name the kinds the run covered/,
    );
    assert.throws(
      () => validateAuditMutation({ ...mutation, finderConclusion: '   ' }),
      /finderConclusion must be nonempty/,
    );
  });

test('rejected findings are stored with their counter-evidence verbatim', () => {
  // One rejected finding, so a rejections list of any other length is wrong.
  const metrics = {
    ...EMPTY_AUDIT_METRICS,
    counts: { ...EMPTY_AUDIT_METRICS.counts, raw: 1, deduplicated: 1, rejected: 1 },
    rejections: [{
      summary: 'add an elapsed-time preflight before the turn loop',
      // Conditional wording an operator writes so a later change that makes the
      // input reachable can reopen the finding. It must survive unaltered.
      counterEvidence: 'no source-reachable input reaches it; do not reopen '
        + 'without a source-reachable input and a diff-causal line',
    }],
  };

  assert.equal(validateAuditMetrics(metrics), metrics);
  assert.match(
    metrics.rejections[0].counterEvidence,
    /do not reopen without a source-reachable input and a diff-causal line$/,
  );
  assert.throws(
    () => validateAuditMetrics({ ...metrics, rejections: [] }),
    /rejections lists 0 findings but the rejected count is 1/,
  );
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      rejections: [{ summary: 'add an elapsed-time preflight', counterEvidence: '  ' }],
    }),
    /rejections\[0\]\.counterEvidence must be nonempty/,
  );
});

test('recording a pass requires a rejections entry for every rejected finding', () => {
  // Two rejected findings with no rejections list: valid for a pass already in
  // the ledger, refused when recording a new one.
  const metrics = {
    ...EMPTY_AUDIT_METRICS,
    counts: { ...EMPTY_AUDIT_METRICS.counts, raw: 2, deduplicated: 2, rejected: 2 },
  };

  assert.doesNotThrow(() => validateAuditMetrics(metrics));
  assert.throws(
    () => validateAuditMetrics(metrics, { requireRejections: true }),
    /rejections must record all 2 rejected findings/,
  );
  // An audit that rejected nothing has nothing to record.
  assert.doesNotThrow(
    () => validateAuditMetrics(EMPTY_AUDIT_METRICS, { requireRejections: true }),
  );
});

// One deferred finding in the tests category: the case productionDefects cannot
// hold, so the deferrals entry is its only durable record.
const DEFERRED_TESTS_FINDING = Object.freeze({
  ...EMPTY_AUDIT_METRICS,
  counts: {
    ...EMPTY_AUDIT_METRICS.counts,
    raw: 1,
    deduplicated: 1,
    confirmed: 1,
    deferred: 1,
  },
  categories: { ...EMPTY_AUDIT_METRICS.categories, tests: 1 },
});

test('deferred findings name an existing tracker heading', () => {
  const heading = 'Unresolved: six deferred test-coverage findings';
  const metrics = {
    ...DEFERRED_TESTS_FINDING,
    deferrals: [{
      summary: 'the generated-table test imports its expected values from the '
        + 'module under test',
      category: 'tests',
      trackedIn: heading,
    }],
  };
  const headings = new Set([heading]);

  assert.equal(validateAuditMetrics(metrics, { trackerHeadings: headings }), metrics);
  assert.throws(
    () => validateAuditMetrics({ ...metrics, deferrals: [] }),
    /deferrals lists 0 findings but the deferred count is 1/,
  );
  // An id absent from the ledger leaves the finding untracked, which is the
  // failure the check exists to catch.
  assert.throws(
    () => validateAuditMetrics(metrics, { trackerHeadings: new Set(['Unresolved: something else']) }),
    /is no id in the deferred ledger/,
  );
  // An unopened id would strand the finding where nothing clears it.
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      deferrals: [{ summary: 'a finding', category: 'tests', trackedIn: 'Next goals, in order' }],
    }, { trackerHeadings: headings }),
    /is no id in the deferred ledger/,
  );
  // Stored passes are revalidated on every run, after the entry closes.
  assert.doesNotThrow(() => validateAuditMetrics(metrics));
});

test('the two enumerations of a deferred production finding must agree', () => {
  // The shape that slipped through at the extended-command pass: one deferred
  // production defect, with a tests finding occupying the production slot and
  // the real defect left out. Both counts balanced, so nothing caught it.
  const defect = 'clearMessageWindow() blanks map rows that C repaints '
    + 'through docorner()';
  const testFinding = 'the two ttyGetlinSearch call sites are untested';
  const metrics = {
    ...EMPTY_AUDIT_METRICS,
    counts: {
      ...EMPTY_AUDIT_METRICS.counts, raw: 2, deduplicated: 2, confirmed: 2, deferred: 2,
    },
    categories: { ...EMPTY_AUDIT_METRICS.categories, production: 1, tests: 1 },
    productionDefects: [
      { summary: defect, foundBy: ['correctness'], resolution: 'deferred' },
    ],
    deferrals: [
      { summary: defect, category: 'production', trackedIn: 'Unresolved: x' },
      { summary: testFinding, category: 'tests', trackedIn: 'Unresolved: x' },
    ],
  };
  const headings = new Set(['Unresolved: x']);

  assert.equal(validateAuditMetrics(metrics, { trackerHeadings: headings }), metrics);
  // The misclassification: the tests finding sits in the production slot and
  // the defect is recorded only among the deferrals.
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      productionDefects: [
        { summary: testFinding, foundBy: ['tests'], resolution: 'deferred' },
      ],
    }, { trackerHeadings: headings }),
    /worded differently in deferrals and productionDefects/,
  );
  // A production deferral that productionDefects never enumerates.
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      deferrals: metrics.deferrals.map((d) => ({ ...d, category: 'production' })),
    }, { trackerHeadings: headings }),
    /marks 2 findings as production, but productionDefects defers 1/,
  );
  // Every deferral states which category it belongs to.
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      deferrals: [{ summary: defect, trackedIn: 'Unresolved: x' }, metrics.deferrals[1]],
    }, { trackerHeadings: headings }),
    /category must be one of: production, tests, clarity, simplification, other/,
  );
});

test('recording a pass requires a deferrals entry for every deferred finding', () => {
  assert.doesNotThrow(() => validateAuditMetrics(DEFERRED_TESTS_FINDING));
  assert.throws(
    () => validateAuditMetrics(DEFERRED_TESTS_FINDING, { requireDeferrals: true }),
    /deferrals must record all 1 deferred findings with the deferred-ledger id/,
  );
  // An audit that deferred nothing has nothing to record.
  assert.doesNotThrow(
    () => validateAuditMetrics(EMPTY_AUDIT_METRICS, { requireDeferrals: true }),
  );
});

test('the recorder entry point enforces both durable-record gates', () => {
  // The two tests above pin validateAuditMetrics(), which takes its options
  // from the caller. They stay green if the recorder stops passing them, so
  // this drives the one place that does. The id set is injected, so the case
  // does not depend on what QUALITY.json happens to contain.
  const deferredIds = new Set(['a deferred finding']);
  const withMetrics = (metrics) => auditMetricsFromOptions(
    { 'audit-metrics': JSON.stringify(metrics) }, { deferredIds },
  );

  assert.throws(
    () => withMetrics(DEFERRED_TESTS_FINDING),
    /deferrals must record all 1 deferred findings/,
  );
  assert.throws(
    () => withMetrics({
      ...DEFERRED_TESTS_FINDING,
      deferrals: [{ summary: 'a finding', category: 'tests', trackedIn: 'absent' }],
    }),
    /is no id in the deferred ledger/,
  );
  // A rejected finding needs its counter-evidence through the same entry point.
  assert.throws(
    () => withMetrics({
      ...EMPTY_AUDIT_METRICS,
      counts: {
        ...EMPTY_AUDIT_METRICS.counts,
        raw: 1, deduplicated: 1, rejected: 1,
      },
    }),
    /rejections must record all 1 rejected/,
  );
  // The heading the tracker does carry resolves, so the gate is not simply
  // refusing everything. The return value is what the recorder writes into
  // QUALITY.json, so it is asserted rather than merely not throwing: the
  // entry point must hand back the metrics it parsed, deferrals intact and
  // unnormalised.
  const accepted = {
    ...DEFERRED_TESTS_FINDING,
    deferrals: [{
      summary: 'a finding', category: 'tests', trackedIn: 'a deferred finding',
    }],
  };
  assert.deepEqual(withMetrics(accepted), accepted);
});

test('an audited range must start at or before the frontier', () => {
  // A three-commit line of history: OLDEST is an ancestor of MIDDLE, which is
  // an ancestor of NEWEST.
  const OLDEST = '1'.repeat(40);
  const MIDDLE = '2'.repeat(40);
  const NEWEST = '3'.repeat(40);
  const order = [OLDEST, MIDDLE, NEWEST];
  const ancestorCheck = (base, head) => order.indexOf(base) <= order.indexOf(head);

  // Starting exactly at the frontier covers the debt with nothing skipped.
  assert.doesNotThrow(() => validateAuditedRangeCoverage(
    'review', MIDDLE, MIDDLE, ancestorCheck));

  // Starting after the frontier skips MIDDLE..NEWEST, which recording the
  // pass would mark reviewed. The message names the frontier and the base.
  assert.throws(
    () => validateAuditedRangeCoverage('review', NEWEST, MIDDLE, ancestorCheck),
    new RegExp(`starts at ${NEWEST}, after the review frontier ${MIDDLE}`),
  );

  // Auditing more than the frontier requires is safe: a base older than the
  // frontier re-reads reviewed commits and skips nothing.
  assert.doesNotThrow(() => validateAuditedRangeCoverage(
    'simplification', OLDEST, MIDDLE, ancestorCheck));
});

test('a stored audited range must end at the pass head', () => {
  const trackingBase = '1'.repeat(40);
  const head = '2'.repeat(40);
  const pass = {
    kind: 'review',
    head,
    // The range ends one commit short of the pass head, so the recorded pass
    // would advance the frontier past commits the audit never read.
    auditedRange: `${trackingBase}..${'3'.repeat(40)}`,
    areas: ['first'],
    level: 'light',
    outcome: 'no-change',
    evidence: 'No findings.',
    auditMetrics: EMPTY_AUDIT_METRICS,
    recordedAt: '2026-07-27T00:00:00.000Z',
  };
  const config = {
    version: 4,
    trackingBase,
    enforcementBase: head,
    legacyPassCount: 0,
    thresholds: {
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
    deferred: [],
    areas: [{ id: 'first', label: 'First', paths: ['js/first.js'] }],
    passes: [pass],
  };

  assert.throws(
    () => validateConfigShape(config),
    new RegExp(`auditedRange ends at ${'3'.repeat(40)}; expected pass head ${head}`),
  );
  pass.auditedRange = `${trackingBase}..${head}`;
  assert.doesNotThrow(() => validateConfigShape(config));
  // Passes recorded before the range was validated omit the field entirely.
  delete pass.auditedRange;
  assert.doesNotThrow(() => validateConfigShape(config));
});

test('the review gate counts commits and changed lines since the frontier', () => {
  // Three ten-line fixes stay below both the ten-commit and 1,000-line gate.
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
  assert.equal(thresholdReached(threeSmallCommits, clean, 10, 1000), false);

  // Ten commits exercise the accumulation bound even when each is tiny.
  assert.equal(
    thresholdReached({ ...threeSmallCommits, commits: 10 }, clean, 10, 1000),
    true,
  );
  // One 1,000-line change reaches the size bound without ten commits.
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
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
    deferred: [],
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

test('assign inserts a js/ file into one area and refuses every bad write', () => {
  // The same minimal-valid config shape the ownership test above uses;
  // js/aaa.js sorts before js/monmove.js so the sort outcome is observable.
  const config = () => ({
    version: 4,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: { reviewCommits: 10, reviewChangedLines: 1000 },
    deferred: [],
    areas: [
      { id: 'monsters', label: 'Monsters', paths: ['js/monmove.js'] },
      { id: 'world', label: 'World', paths: ['js/dungeon.js'] },
    ],
    passes: [],
  });

  const assigned = config();
  assignPathToArea(assigned, 'js/aaa.js', 'monsters');
  assert.deepEqual(
    assigned.areas[0].paths,
    ['js/aaa.js', 'js/monmove.js'],
  );

  // An unknown area, a file another area owns, and a path outside js/ (which
  // validateConfigShape rejects) must each refuse before a write.
  assert.throws(
    () => assignPathToArea(config(), 'js/aaa.js', 'nope'),
    /no area has id: nope/,
  );
  assert.throws(
    () => assignPathToArea(config(), 'js/dungeon.js', 'monsters'),
    /js\/dungeon\.js already belongs to area world/,
  );
  assert.throws(
    () => assignPathToArea(config(), 'scripts/foo.mjs', 'monsters'),
    /invalid path in area monsters/,
  );
});

test('new ledger passes require structured audit metrics', () => {
  const sha = '1'.repeat(40);
  const pass = {
    kind: 'review',
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
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
    deferred: [],
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

test('pass area labels are inert history', () => {
  const pass = {
    kind: 'review',
    head: '2'.repeat(40),
    level: 'light',
    outcome: 'no-change',
    evidence: 'No findings.',
    recordedAt: '2026-07-23T00:00:00.000Z',
    auditMetrics: EMPTY_AUDIT_METRICS,
  };
  const config = {
    version: 4,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: {
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
    deferred: [],
    areas: [{ id: 'first', label: 'First', paths: ['js/first.js'] }],
    passes: [pass],
  };

  // A new pass records no areas at all.
  assert.doesNotThrow(() => validateConfigShape(config));
  // A historical label survives uninterpreted: 'gone' matches no area.
  pass.areas = ['gone'];
  assert.doesNotThrow(() => validateConfigShape(config));
  // Anything but an array of strings is a malformed record.
  pass.areas = [1];
  assert.throws(
    () => validateConfigShape(config),
    /pass areas, when present, must be an array of strings/,
  );
});

test('ledger queries flatten pass rejections and filter deferrals', () => {
    // Two passes; the first carries one rejection and one deferral, and its
    // historical area labels ride along uninterpreted. The second records no
    // areas at all, the shape every new pass takes.
    const passes = [
        {
            head: 'a'.repeat(40),
            kind: 'review',
            areas: ['monsters', 'world'],
            auditMetrics: {
                rejections: [{ summary: 'claim A', counterEvidence: 'trace A' }],
                deferrals: [{ summary: 'gap B', trackedIn: 'Unresolved: B',
                    category: 'tests' }],
            },
        },
        {
            head: 'b'.repeat(40),
            kind: 'review',
            auditMetrics: {
                rejections: [{ summary: 'claim C', counterEvidence: 'trace C' }],
            },
        },
    ];
    const rejections = collectRejections(passes);
    assert.deepEqual(rejections.map(({ summary }) => summary),
        ['claim A', 'claim C']);
    // The deferred ledger: two open entries in monsters, one closed, one open
    // without an area. Defaults return open entries only; the closed entry
    // needs status 'closed' or 'all'; the area filter excludes the null-area
    // entry; and the sweep threshold of 2 fires for monsters alone, because
    // closed and area-less entries never count toward a sweep.
    const ledger = [
        { id: 'A', area: 'monsters', status: 'open' },
        { id: 'B', area: 'monsters', status: 'open' },
        { id: 'C', area: 'monsters', status: 'closed' },
        { id: 'D', area: null, status: 'open' },
    ];
    assert.deepEqual(openDeferrals(ledger).map(({ id }) => id),
        ['A', 'B', 'D']);
    assert.deepEqual(openDeferrals(ledger, { area: 'monsters' })
        .map(({ id }) => id), ['A', 'B']);
    assert.deepEqual(openDeferrals(ledger, { status: 'closed' })
        .map(({ id }) => id), ['C']);
    assert.deepEqual(openDeferrals(ledger, { status: 'all' }).length, 4);
    assert.deepEqual(sweepCandidates(ledger, 2), [['monsters', 2]]);
    assert.deepEqual(sweepCandidates(ledger, 3), []);
});

test('the recorder renders the counts sentence from the metrics', () => {
    // Counts from the 2026-08-01 pet-goal closing pass, whose hand-written
    // evidence duplicated exactly these values; the mutation clause appends
    // only when the metrics carry a mutation record.
    const metrics = {
        counts: { raw: 17, deduplicated: 15, confirmed: 12, applied: 11,
            deferred: 1, rejected: 3, unverified: 0 },
        mutation: { mutants: 361, survivors: 63 },
    };
    assert.equal(renderCountsSentence(metrics),
        'Counts: 17 raw, 15 deduplicated, 12 confirmed, 11 applied, '
            + '1 deferred, 3 rejected, 0 unverified; mutation: 63 survivors '
            + 'of 361 mutants.');
    assert.equal(renderCountsSentence({ counts: metrics.counts }),
        'Counts: 17 raw, 15 deduplicated, 12 confirmed, 11 applied, '
            + '1 deferred, 3 rejected, 0 unverified.');
});

test('slice-mutants parsing separates trailered from bare commits', () => {
    // Two js commits: the first carries the trailer mutate-sites emits, the
    // second has an empty trailer column, the shape git prints for a commit
    // without one. Only the second is missing.
    const output = [
        `${'a'.repeat(40)}\tMutants: 36/36 kind=relational,logical,boolean`,
        `${'b'.repeat(40)}\t`,
    ].join('\n');
    assert.deepEqual(missingMutantTrailers(output),
        { commits: 2, missing: ['b'.repeat(40)] });
    // An empty log means an empty range, never a failure.
    assert.deepEqual(missingMutantTrailers(''),
        { commits: 0, missing: [] });
});

test('recorded readiness attestations must carry all three statements', () => {
    // The three keys review.md defines; whitespace-only text is as absent as
    // a missing key, so a blank attestation cannot pass as recorded.
    const readiness = {
        boundary: 'from the e keypress to the "You finish eating" message',
        sourceReview: 'traced eat.c branches against the port',
        completeness: 'no unsupported behavior inside the boundary',
    };
    assert.doesNotThrow(() => validateAuditMetrics(
        { ...EMPTY_AUDIT_METRICS, readiness }));
    assert.throws(
        () => validateAuditMetrics({ ...EMPTY_AUDIT_METRICS,
            readiness: { ...readiness, sourceReview: '  ' } }),
        /readiness.sourceReview must be nonempty/u,
    );
    assert.throws(
        () => validateAuditMetrics({ ...EMPTY_AUDIT_METRICS, readiness: [] }),
        /readiness must be an object/u,
    );
});
