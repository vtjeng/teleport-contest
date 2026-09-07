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
  formatSimplificationCoverage,
  parsePerCommitNumstat,
  simplificationCoveredSet,
  excludeRelocatedLines,
  parseAuditFixCommitLog,
  parseNumstat,
  qualityGateBlocked,
  qualityGateState,
  relocationCommits,
  thresholdReached,
  validateAuditedRangeCoverage,
  validateAuditMetrics,
  collectRejections,
  renderCountsSentence,
  validateConfigShape,
    main,
    passAreas,
    passOptionNames,
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
  assert.equal(config.version, 5);
  assert.equal(config.legacyPassCount, 21);
  // evidence and auditMetrics live in QUALITY-evidence.json
  const history = JSON.parse(
    await readFile(new URL('../QUALITY-evidence.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    history.slice(config.legacyPassCount).every((pass) => pass.auditMetrics),
    true,
  );
  assert.equal(history.length, config.passes.length);
  // Reviews run on demand since 2026-09-05, so the ledger carries no cadence.
  assert.equal(config.thresholds, undefined);
  const generatedOutputs = config.areas.flatMap(
    (area) => area.generatedOutputs ?? [],
  );
  assert.deepEqual(
    generatedOutputs.map(({ path }) => path).sort(),
    [
      'js/color_data.js',
      'js/config_statement_data.js',
      'js/dungeon_data.js',
      'js/extcmdlist_data.js',
      'js/help_data.js',
      'js/monsters.js',
      'js/objects.js',
      'js/optlist_data.js',
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

test('a ledger without thresholds reports review debt on demand', () => {
  const clean = {
    files: new Set(), additions: 0, deletions: 0, binaryFiles: 0,
  };
  // Three unreviewed commits and 42 changed lines: figures large enough to
  // trip a small cadence, which the on-demand line must not do.
  const current = {
    commits: 3,
    excludedCommits: 0,
    files: new Set(['js/runtime.js']),
    additions: 40,
    deletions: 2,
    binaryFiles: 0,
  };
  assert.match(
    formatReviewDebt(current, current, clean, undefined),
    /^on demand; .*since the last recorded pass$/u,
  );
  const nothing = { ...clean, commits: 0, excludedCommits: 0 };
  assert.equal(formatReviewDebt(nothing, nothing, clean, undefined), 'clear');
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

test('deferred findings carry a summary and a category', () => {
  const metrics = {
    ...DEFERRED_TESTS_FINDING,
    deferrals: [{
      summary: 'the generated-table test imports its expected values from the '
        + 'module under test',
      category: 'tests',
    }],
  };

  assert.equal(validateAuditMetrics(metrics), metrics);
  assert.throws(
    () => validateAuditMetrics({ ...metrics, deferrals: [] }),
    /deferrals lists 0 findings but the deferred count is 1/,
  );
  // A finding without a summary has no durable record, which is the failure
  // the check exists to catch.
  assert.throws(
    () => validateAuditMetrics({ ...metrics, deferrals: [{ category: 'tests' }] }),
    /deferrals\[0\]\.summary must be nonempty/,
  );
  // Passes recorded before 2026-09-06 carry a trackedIn id from the retired
  // deferral ledger. Stored passes are revalidated on every run, so the
  // field must stay inert.
  assert.doesNotThrow(() => validateAuditMetrics({
    ...metrics,
    deferrals: [{ ...metrics.deferrals[0], trackedIn: 'a retired ledger id' }],
  }));
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
      { summary: defect, category: 'production' },
      { summary: testFinding, category: 'tests' },
    ],
  };

  assert.equal(validateAuditMetrics(metrics), metrics);
  // The misclassification: the tests finding sits in the production slot and
  // the defect is recorded only among the deferrals.
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      productionDefects: [
        { summary: testFinding, foundBy: ['tests'], resolution: 'deferred' },
      ],
    }),
    /worded differently in deferrals and productionDefects/,
  );
  // A production deferral that productionDefects never enumerates.
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      deferrals: metrics.deferrals.map((d) => ({ ...d, category: 'production' })),
    }),
    /marks 2 findings as production, but productionDefects defers 1/,
  );
  // Every deferral states which category it belongs to.
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      deferrals: [{ summary: defect }, metrics.deferrals[1]],
    }),
    /category must be one of: production, tests, clarity, simplification, other/,
  );
});

test('recording a pass requires a deferrals entry for every deferred finding', () => {
  assert.doesNotThrow(() => validateAuditMetrics(DEFERRED_TESTS_FINDING));
  assert.throws(
    () => validateAuditMetrics(DEFERRED_TESTS_FINDING, { requireDeferrals: true }),
    /deferrals must record all 1 deferred findings with a summary and category/,
  );
  // An audit that deferred nothing has nothing to record.
  assert.doesNotThrow(
    () => validateAuditMetrics(EMPTY_AUDIT_METRICS, { requireDeferrals: true }),
  );
});

test('the recorder entry point enforces both durable-record gates', () => {
  // The two tests above pin validateAuditMetrics(), which takes its options
  // from the caller. They stay green if the recorder stops passing them, so
  // this drives the one place that does.
  const withMetrics = (metrics) => auditMetricsFromOptions(
    { 'audit-metrics': JSON.stringify(metrics) },
  );

  assert.throws(
    () => withMetrics(DEFERRED_TESTS_FINDING),
    /deferrals must record all 1 deferred findings/,
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
  // A complete record resolves, so the gate is not simply refusing
  // everything. The return value is what the recorder writes into
  // QUALITY.json, so it is asserted rather than merely not throwing: the
  // entry point must hand back the metrics it parsed, deferrals intact and
  // unnormalised.
  const accepted = {
    ...DEFERRED_TESTS_FINDING,
    deferrals: [{ summary: 'a finding', category: 'tests' }],
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
    'review', OLDEST, MIDDLE, ancestorCheck));
});

// Simplification reads recently changed code rather than everything since the
// last pass, so its coverage is the union of the ranges its passes recorded.
// A pass predating `auditedRange` covered everything since the previous
// frontier, which chains to enforcementBase..head.
test('simplification coverage unions the ranges its passes recorded', () => {
  const BASE = 'e'.repeat(40);
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  const C = 'c'.repeat(40);
  // A stub commit graph: each range answers the commits an operator would see.
  const ranges = new Map([
    [`${BASE}..${A}`, ['a1', 'a2']],
    [`${B}..${C}`, ['c1', 'c2']],
    [`${A}..${B}`, ['b1']],
  ]);
  const revList = (base, head) => ranges.get(`${base}..${head}`) ?? [];

  // A legacy pass carries no auditedRange and is read as enforcementBase..head.
  // A ranged pass covers exactly what it names, wherever that sits: the B..C
  // pass starts after the legacy pass's head, which is the case the old
  // single-frontier model had to refuse.
  const covered = simplificationCoveredSet([
    { kind: 'simplification', head: A },
    { kind: 'simplification', head: C, auditedRange: `${B}..${C}` },
    // A review pass contributes nothing: the two kinds track separately.
    { kind: 'review', head: B, auditedRange: `${A}..${B}` },
  ], BASE, revList);

  assert.deepEqual([...covered].sort(), ['a1', 'a2', 'c1', 'c2']);
  // b1 falls between the two simplification passes and stays debt, which is
  // the whole point: recording the later pass marked no commit it did not read.
  assert.equal(covered.has('b1'), false);
});

// One `git log --numstat` answers every commit's own stats, so the uncovered
// set can be summed without one process per commit.
test('per-commit numstat splits one log stream into its commits', () => {
  const commits = parsePerCommitNumstat([
    '\x01aaa',
    '3\t1\tjs/options.js',
    '10\t0\tjs/display.js',
    '',
    '\x01bbb',
    '-\t-\tjs/binary.png',
    '2\t2\tjs/cmd.js',
  ].join('\n'));

  assert.deepEqual([...commits.keys()], ['aaa', 'bbb']);
  assert.deepEqual(commits.get('aaa'), { additions: 13, deletions: 1 });
  // A binary file reports '-' for both counts and contributes no lines.
  assert.deepEqual(commits.get('bbb'), { additions: 2, deletions: 2 });
});

test('simplification coverage reports the oldest commit no pass read', () => {
  assert.equal(
    formatSimplificationCoverage({
      commits: 0, additions: 0, deletions: 0, oldestUncovered: null,
    }),
    'Simplification: every commit since the enforcement base is covered.',
  );
  // 12 + 5 changed lines, and the oldest uncovered commit is where a pass that
  // wanted to reduce the debt would start.
  assert.equal(
    formatSimplificationCoverage({
      commits: 3, additions: 12, deletions: 5, oldestUncovered: 'f'.repeat(40),
    }),
    'Simplification: 3 commits uncovered, 17 changed lines; '
      + 'oldest uncovered ffffffff.',
  );
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
    version: 5,
    trackingBase,
    enforcementBase: head,
    legacyPassCount: 0,
    thresholds: {
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
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
    version: 5,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: {
      reviewCommits: 10,
      reviewChangedLines: 1000,
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

test('assign inserts a js/ file into one area and refuses every bad write', () => {
  // The same minimal-valid config shape the ownership test above uses;
  // js/aaa.js sorts before js/monmove.js so the sort outcome is observable.
  const config = () => ({
    version: 5,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: { reviewCommits: 10, reviewChangedLines: 1000 },
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

// evidence and auditMetrics live in QUALITY-evidence.json, so QUALITY.json
// passes validate without them. The recording path still requires both
// via --evidence and --audit-metrics options.
test('QUALITY.json passes validate without evidence and auditMetrics', () => {
  const sha = '1'.repeat(40);
  const pass = {
    kind: 'review',
    head: '2'.repeat(40),
    areas: ['first'],
    level: 'light',
    outcome: 'no-change',
    recordedAt: '2026-07-23T00:00:00.000Z',
  };
  const config = {
    version: 5,
    trackingBase: sha,
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: {
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
    areas: [{ id: 'first', label: 'First', paths: ['js/first.js'] }],
    passes: [pass],
  };

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
    version: 5,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: {
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
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

test('ledger queries flatten pass rejections', () => {
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
                deferrals: [{ summary: 'gap B', category: 'tests' }],
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
});

test('the recorder renders the counts sentence from the metrics', () => {
    // Counts from the 2026-08-01 pet-goal closing pass.
    const metrics = {
        counts: { raw: 17, deduplicated: 15, confirmed: 12, applied: 11,
            deferred: 1, rejected: 3, unverified: 0 },
    };
    assert.equal(renderCountsSentence(metrics),
        'Counts: 17 raw, 15 deduplicated, 12 confirmed, 11 applied, '
            + '1 deferred, 3 rejected, 0 unverified.');
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

// Every pass before this one carries area labels, and the recorder printed
// them from an identifier that was never bound: `--areas` appears in the usage
// text but nothing parsed it. The write succeeded, the field was dropped, and
// the command then exited non-zero on a ReferenceError, so the failure looked
// like the record had not been made when it had.
test('a pass derives its area labels from the paths the range changed', () => {
    const config = {
        areas: [
            { id: 'commands', paths: ['js/cmd.js', 'js/wizcmds.js'] },
            { id: 'hero', paths: ['js/attrib.js', 'js/exper.js'] },
            { id: 'display', paths: ['js/display.js'] },
        ],
    };

    // Only the areas owning a changed path are named, and they keep the
    // config's own order rather than the diff's.
    assert.deepEqual(
        passAreas(config, undefined, () => ['js/display.js', 'js/cmd.js']),
        ['commands', 'display'],
    );
    // A range touching nothing an area owns names none, rather than throwing.
    assert.deepEqual(
        passAreas(config, undefined, () => ['README.md']),
        [],
    );
    // An explicit list wins, and is not second-guessed against the diff.
    assert.deepEqual(
        passAreas(config, 'hero, display', () => ['js/cmd.js']),
        ['hero', 'display'],
    );
    // A label no area defines is a typo, not a new area.
    assert.throws(
        () => passAreas(config, 'heroes', () => []),
        /--areas names no such area: heroes/u,
    );
    // The derivation is skipped entirely when the caller named the labels.
    assert.deepEqual(
        passAreas(config, 'hero', () => assert.fail('must not be called')),
        ['hero'],
    );
});

// passAreas() shipped correct and unreachable: --areas was documented, the
// branch that reads it was tested directly, and the recorder rejected the
// option before the branch could run, because the name was missing from the
// allowed set. A test on the function alone cannot see that; this one names
// the option as the command accepts it.
// Through main(), not through passOptionNames(). The defect this replaced was
// preparePass() rejecting --areas from an inline set while the exported helper
// listed it, so a test that reads the helper passes with the command broken.
test('the recorder command accepts --areas', () => {
    const run = (extra) => {
        try {
            main(['record-review', '--range', 'HEAD~1..HEAD', '--level',
                'full', '--outcome', 'changed', '--evidence', 'x',
                '--dry-run', ...extra]);
        } catch (error) {
            return String(error?.message ?? '');
        }
        return '';
    };
    // --areas must clear option validation. Whatever the command then refuses
    // it for, the message must not be the unknown-option one.
    assert.ok(!run(['--areas', 'commands']).includes('unknown option'));
    // A name the parser really does not take still fails, so the assertion
    // above is not vacuous.
    assert.match(run(['--nosuchoption', 'x']), /unknown option: --nosuchoption/u);
});

test('the recorder accepts every option its pass record can carry', () => {
    for (const name of [
        'range', 'head', 'outcome', 'evidence',
        'audit-metrics', 'audit-metrics-file', 'areas', 'dry-run',
    ]) {
        assert.ok(passOptionNames('review').has(name), name);
        assert.ok(passOptionNames('simplification').has(name), name);
    }
    // --level is the one option only a review pass takes; a simplification
    // pass is rejected for passing it, which quality-status.mjs asserts
    // separately.
    assert.ok(passOptionNames('review').has('level'));
    assert.ok(!passOptionNames('simplification').has('level'));
});

// The two halves mean opposite things to a review pass, which is why they are
// returned separately. Review debt is what a pass clears, so it must never
// refuse one; an unassigned js/ file leaves a finding with no area to be routed
// to, so it refuses everything. Collapsing them deadlocked the pass a DUE gate
// demands, because readiness refused on the debt the pass existed to clear.
test('the quality gate reports debt and health as separate facts', () => {
    // Clean: no debt, healthy.
    assert.deepEqual(
        qualityGateState({ reviewDue: 0, unassignedCount: 0 }),
        { debt: false, health: true },
    );
    // Debt alone. A pass must still be preparable here; this is the state that
    // used to deadlock it.
    assert.deepEqual(
        qualityGateState({ reviewDue: 1, unassignedCount: 0 }),
        { debt: true, health: true },
    );
    // An unassigned file alone stops a pass too, with no debt in sight.
    assert.deepEqual(
        qualityGateState({ reviewDue: 0, unassignedCount: 1 }),
        { debt: false, health: false },
    );
    // The combined predicate keeps its meaning for a commit guard.
    assert.equal(qualityGateBlocked({ reviewDue: 1, unassignedCount: 0 }), true);
    assert.equal(qualityGateBlocked({ reviewDue: 0, unassignedCount: 1 }), true);
    assert.equal(qualityGateBlocked({ reviewDue: 0, unassignedCount: 0 }), false);
});
