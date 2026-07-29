import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  auditMetricsFromOptions,
  countReviewCommits,
  excludeGeneratedLines,
  formatMetrics,
  formatReviewDebt,
  excludeRelocatedLines,
  parseAuditFixCommitLog,
  parseMarkdownHeadings,
  parseNumstat,
  qualityGateBlocked,
  relocationCommits,
  thresholdReached,
  validateAuditedRangeCoverage,
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
      'js/extcmdlist_data.js',
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
      trackedIn: heading,
    }],
  };
  const headings = new Set([heading]);

  assert.equal(validateAuditMetrics(metrics, { trackerHeadings: headings }), metrics);
  assert.throws(
    () => validateAuditMetrics({ ...metrics, deferrals: [] }),
    /deferrals lists 0 findings but the deferred count is 1/,
  );
  // A heading that names no section leaves the finding untracked, which is the
  // failure the check exists to catch.
  assert.throws(
    () => validateAuditMetrics(metrics, { trackerHeadings: new Set(['Unresolved: something else']) }),
    /is not a heading in ROADMAP\.md/,
  );
  // Debt belongs under an Unresolved heading, not under a roadmap section that
  // nothing schedules for clearing.
  assert.throws(
    () => validateAuditMetrics({
      ...metrics,
      deferrals: [{ summary: 'a finding', trackedIn: 'Next goals, in order' }],
    }),
    /must name an? "Unresolved:" heading/,
  );
  // Stored passes are revalidated on every run, after the heading is deleted.
  assert.doesNotThrow(() => validateAuditMetrics(metrics));
});

test('recording a pass requires a deferrals entry for every deferred finding', () => {
  assert.doesNotThrow(() => validateAuditMetrics(DEFERRED_TESTS_FINDING));
  assert.throws(
    () => validateAuditMetrics(DEFERRED_TESTS_FINDING, { requireDeferrals: true }),
    /deferrals must record all 1 deferred findings with the ROADMAP\.md heading/,
  );
  // An audit that deferred nothing has nothing to record.
  assert.doesNotThrow(
    () => validateAuditMetrics(EMPTY_AUDIT_METRICS, { requireDeferrals: true }),
  );
});

test('the recorder entry point enforces both durable-record gates', () => {
  // The two tests above pin validateAuditMetrics(), which takes its options
  // from the caller. They stay green if the recorder stops passing them, so
  // this drives the one place that does. The tracker is injected, so the case
  // does not depend on what ROADMAP.md happens to contain.
  const readTracker = () => '## Unresolved: a deferred finding\n';
  const withMetrics = (metrics) => auditMetricsFromOptions(
    { 'audit-metrics': JSON.stringify(metrics) }, { readTracker },
  );

  assert.throws(
    () => withMetrics(DEFERRED_TESTS_FINDING),
    /deferrals must record all 1 deferred findings/,
  );
  assert.throws(
    () => withMetrics({
      ...DEFERRED_TESTS_FINDING,
      deferrals: [{ summary: 'a finding', trackedIn: 'Unresolved: absent' }],
    }),
    /is not a heading in ROADMAP\.md/,
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
      summary: 'a finding', trackedIn: 'Unresolved: a deferred finding',
    }],
  };
  assert.deepEqual(withMetrics(accepted), accepted);
});

test('heading parsing strips the marker and keeps every level', () => {
  // parseMarkdownHeadings() is a pure function over text, so it is pinned
  // against a literal document rather than against ROADMAP.md. Reading the
  // live tracker would tie the suite to prose the workflow rewrites: clearing
  // every "Unresolved:" section is the deferral ledger's whole purpose, and
  // closing a goal deletes its heading, so a repository in exactly the state
  // the workflow aims for would fail a test about a parser.
  const document = [
    '# Title',
    'body text that is not a heading',
    '## Current milestone: exploration',
    '#NotAHeading',
    '### Unresolved: a deferred finding   ',
    '###### Deepest',
    '    ## Four spaces, a code block even in CommonMark',
    '  ## Two spaces, which CommonMark would accept',
    '####### Seven marks, past the deepest level',
  ].join('\n');
  const headings = parseMarkdownHeadings(document);

  assert.deepEqual([...headings].sort(), [
    'Current milestone: exploration',
    'Deepest',
    'Title',
    'Unresolved: a deferred finding',
  ]);
  // The marker is stripped, so a trackedIn value carrying one never resolves.
  assert.equal(headings.has('## Current milestone: exploration'), false);
  // A run of marks with no space after it is not a heading.
  assert.equal(headings.has('NotAHeading'), false);
  // Any leading whitespace disqualifies a line. That is stricter than
  // CommonMark, which accepts up to three spaces of indentation, so both
  // widths are probed rather than only the four-space case where the two
  // agree. The strictness is harmless here because a trackedIn value is
  // matched against ROADMAP.md headings, which are never indented.
  assert.equal(headings.has('Four spaces, a code block even in CommonMark'), false);
  assert.equal(headings.has('Two spaces, which CommonMark would accept'), false);
  // Seven marks exceed the deepest level, so the line is not a heading either.
  assert.equal(headings.has('Seven marks, past the deepest level'), false);
});

test('an audited range must start at or before every claimed frontier', () => {
  // A three-commit line of history: OLDEST is an ancestor of MIDDLE, which is
  // an ancestor of NEWEST.
  const OLDEST = '1'.repeat(40);
  const MIDDLE = '2'.repeat(40);
  const NEWEST = '3'.repeat(40);
  const order = [OLDEST, MIDDLE, NEWEST];
  const ancestorCheck = (base, head) => order.indexOf(base) <= order.indexOf(head);

  // Frontiers diverge: hero was last reviewed at OLDEST, monsters at MIDDLE.
  // One range starting at the older frontier covers both areas' debt.
  assert.doesNotThrow(() => validateAuditedRangeCoverage(
    'review',
    OLDEST,
    { hero: OLDEST, monsters: MIDDLE },
    ancestorCheck,
  ));

  // Starting at the newer frontier skips hero's OLDEST..MIDDLE commits, which
  // recording the pass would mark reviewed. The message names the area, the
  // frontier it expected, and the base it received.
  assert.throws(
    () => validateAuditedRangeCoverage(
      'review',
      MIDDLE,
      { hero: OLDEST, monsters: MIDDLE },
      ancestorCheck,
    ),
    new RegExp(
      `starts at ${MIDDLE}, after the review frontier ${OLDEST} for hero`,
    ),
  );

  // Auditing more than the frontier requires is safe: NEWEST is claimed from a
  // base older than both frontiers.
  assert.doesNotThrow(() => validateAuditedRangeCoverage(
    'simplification',
    OLDEST,
    { hero: MIDDLE, monsters: NEWEST },
    ancestorCheck,
  ));
});

test('a stored audited range must end at the pass head', () => {
  const trackingBase = '1'.repeat(40);
  const head = '2'.repeat(40);
  const pass = {
    kind: 'review',
    bases: { first: trackingBase },
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
    new RegExp(`auditedRange ends at ${'3'.repeat(40)}; expected pass head ${head}`),
  );
  pass.auditedRange = `${trackingBase}..${head}`;
  assert.doesNotThrow(() => validateConfigShape(config));
  // Passes recorded before the range was validated omit the field entirely.
  delete pass.auditedRange;
  assert.doesNotThrow(() => validateConfigShape(config));
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

test('the per-area line advisory must stay below the per-area line gate', () => {
  // The per-slice review window in `.agents/review.md` allows 1,000
  // changed lines summed across areas, while `reviewAdvisoryChangedLines` is a
  // per-area checkpoint. Raising the advisory to the window's 1,000 would
  // collapse the advisory tier into the gate, so validateConfigShape refuses
  // it. Full-length placeholder SHAs only satisfy the schema.
  const config = {
    version: 4,
    trackingBase: '1'.repeat(40),
    enforcementBase: '2'.repeat(40),
    legacyPassCount: 0,
    thresholds: {
      reviewAdvisoryCommits: 3,
      reviewAdvisoryChangedLines: 1000,
      reviewCommits: 10,
      reviewChangedLines: 1000,
    },
    legacyAreaExpansions: {},
    areas: [{ id: 'first', label: 'First', paths: ['js/first.js'] }],
    passes: [],
  };

  assert.throws(
    () => validateConfigShape(config),
    /the review line advisory must be below the review gate/,
  );
  // The repository's 500 keeps a usable advisory band below the 1,000 gate.
  config.thresholds.reviewAdvisoryChangedLines = 500;
  assert.doesNotThrow(() => validateConfigShape(config));
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
