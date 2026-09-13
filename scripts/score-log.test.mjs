import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    appendRow,
    COLUMNS,
    generateNote,
    latestRow,
    readRows,
    rowsSince,
    standing,
} from './score-log.mjs';

const dir = mkdtempSync(join(tmpdir(), 'score-log-'));

// Three rows in the current SCORE.tsv shape. The
// first goal row carries holdout figures because its own event ran an
// evaluation (139/3640 screens and 30048/182022 rng are the recorded fifth-zero
// values); the two later rows leave the holdout cells empty, the encoding for
// "no new holdout evidence", so standing() must reach back past both of them.
function scoreRow(fields) {
    return COLUMNS.map((column) => fields[column] ?? '').join('\t');
}

const fixture = [
    COLUMNS.join('\t'),
    scoreRow({
        utc: '2026-08-01', sha: 'aaaa111', event: 'goal',
        screens_matched: '496', screens_total: '7765',
        rng_matched: '106505', rng_total: '610816',
        holdout_screens_matched: '139', holdout_screens_total: '3640',
        holdout_rng_matched: '30048', holdout_rng_total: '182022',
        note: 'goal row',
    }),
    scoreRow({
        utc: '2026-08-01', sha: 'bbbb222', event: 'slice',
        screens_matched: '520', screens_total: '7765',
        rng_matched: '107227', rng_total: '610816', note: 'slice row',
    }),
    scoreRow({
        utc: '2026-08-02', sha: 'cccc333', event: 'goal',
        screens_matched: '520', screens_total: '7765',
        rng_matched: '107227', rng_total: '610816',
    }),
].join('\n');

function writeFixture(name, text = fixture) {
    const path = join(dir, name);
    writeFileSync(path, `${text}\n`);
    return path;
}

test('readRows parses rows keyed by column and rejects drifted shapes', () => {
    const rows = readRows(writeFixture('read.tsv'));
    assert.equal(rows.length, 3);
    // Spot-check the two ends of the column list and one middle column, so a
    // reordering of COLUMNS misassigns at least one of them.
    assert.equal(rows[0].utc, '2026-08-01');
    assert.equal(rows[0].holdout_rng_total, '182022');
    assert.equal(rows[2].note, '');
    // A header from before a column rename must be rejected, so the file and
    // the code cannot drift apart silently.
    const renamed = fixture.replace('holdout_rng_total', 'holdout_rngs');
    assert.throws(() => readRows(writeFixture('renamed.tsv', renamed)),
        /header differs/u);
    // A row with too few fields is a hand-edit gone wrong; the current shape
    // has one field for every column.
    const short = `${COLUMNS.join('\t')}\n2026-08-01\taaaa111\tgoal`;
    assert.throws(() => readRows(writeFixture('short.tsv', short)),
        /3 fields/u);
    // The old 16-column header is deliberately not accepted at runtime. The
    // checked-in ledger is widened by the schema migration instead.
    const oldHeader = COLUMNS.slice(0, 16).join('\t');
    assert.throws(() => readRows(writeFixture('legacy.tsv', oldHeader)),
        /header differs/u);
});

test('appendRow composes a full row and refuses malformed input', () => {
    const path = writeFixture('append.tsv');
    const row = appendRow(
        { sha: 'dddd444', event: 'slice', screens_matched: '521' }, path);
    // The utc column is filled by the writer; an ISO timestamp contains a 'T'.
    assert.match(row.utc, /T/u);
    const rows = readRows(path);
    assert.equal(rows.length, 4);
    assert.equal(rows[3].screens_matched, '521');
    assert.equal(rows[3].note, '');
    assert.equal(rows[3].challenge_screens_matched, '');
    // A caller-supplied utc used to be accepted (and a date-only one upgraded
    // to a timestamp); every row's utc is now the moment the script wrote it.
    assert.throws(() => appendRow(
        { utc: '2026-08-01', sha: 'e', event: 'goal' }, path), /omit utc=/u);
    assert.throws(() => appendRow({ event: 'goal' }, path), /needs a sha/u);
    assert.throws(() => appendRow({ sha: 'e', event: 'victory' }, path),
        /event must be/u);
    // `checkpoint`, `window`, `candidate`, and `publish` were events until the
    // scoring run stopped appending a row of its own, review windows moved to
    // QUALITY.json, and the other two went unused. Historical rows keep the
    // names, but the retired names must not start working again.
    for (const retired of ['checkpoint', 'window', 'candidate', 'publish']) {
        assert.throws(() => appendRow({ sha: 'e', event: retired }, path),
            /event must be/u);
    }
    assert.throws(() => appendRow({ sha: 'e', event: 'goal', bogus: '1' },
        path), /unknown SCORE.tsv column/u);
    // A tab inside a value would shift every later column of the row.
    assert.throws(() => appendRow(
        { sha: 'e', event: 'goal', note: 'a\tb' }, path), /tab, newline, or double quote/u);
    // A double quote breaks GitHub's TSV renderer, which treats it as a
    // field delimiter (the TSV spec inherits CSV quoting rules).
    assert.throws(() => appendRow(
        { sha: 'e', event: 'goal', note: 'the "?" path' }, path),
        /double quote/u);
    const stalePath = join(dir, 'stale-append.tsv');
    writeFileSync(stalePath, `${COLUMNS.slice(0, 16).join('\t')}\n`);
    assert.throws(() => appendRow({ sha: 'e', event: 'goal' }, stalePath),
        /header differs/u);
});

test('challenge rows require a complete identity and isolated metrics', () => {
    const path = writeFixture('challenge.tsv');
    const fields = {
        sha: 'eeee555', event: 'challenge',
        challenge_sessions_passed: '2', challenge_sessions_total: '3',
        challenge_screens_matched: '8', challenge_screens_total: '10',
        challenge_rng_matched: '80', challenge_rng_total: '100',
        challenge_cursors_matched: '9', challenge_cursors_total: '10',
        challenge_manifest_sha256: 'a'.repeat(64),
        challenge_evaluation: 'challenges/evaluations/batch-1.json',
    };
    const row = appendRow(fields, path);
    assert.equal(row.event, 'challenge');
    assert.equal(row.challenge_screens_matched, '8');
    assert.equal(readRows(path).at(-1).challenge_evaluation,
        'challenges/evaluations/batch-1.json');

    assert.throws(() => appendRow({
        ...fields, sha: 'eeee556', challenge_sessions_total: '1',
    }, path), /challenge_sessions_passed must be no greater/u);
    assert.throws(() => appendRow({
        ...fields, sha: 'eeee557', challenge_rng_total: '',
    }, path), /all present or all blank/u);
    assert.throws(() => appendRow({
        ...fields, sha: 'eeee558', challenge_manifest_sha256: 'bad',
    }, path), /64 hexadecimal/u);
    assert.throws(() => appendRow({
        ...fields, sha: 'eeee559', challenge_evaluation: 'tmp/eval.json',
    }, path), /challenges\/evaluations/u);
    assert.throws(() => appendRow({
        ...fields, sha: 'eeee560', screens_matched: '1',
    }, path), /cannot include development or holdout/u);
    assert.throws(() => appendRow({
        sha: 'eeee561', event: 'goal', challenge_evaluation: fields.challenge_evaluation,
    }, path), /only valid for event=challenge/u);
});

test('failed challenge rows retain a challenge standing with blank counts', () => {
    const path = writeFixture('challenge-failed.tsv');
    const row = appendRow({
        sha: 'ffff555', event: 'challenge',
        challenge_sessions_passed: '', challenge_sessions_total: '',
        challenge_screens_matched: '', challenge_screens_total: '',
        challenge_rng_matched: '', challenge_rng_total: '',
        challenge_cursors_matched: '', challenge_cursors_total: '',
        challenge_manifest_sha256: 'b'.repeat(64),
        challenge_evaluation: 'challenges/evaluations/failed.json',
    }, path);
    assert.equal(row.challenge_screens_matched, '');
    assert.equal(standing(readRows(path)).challenges.sha, 'ffff555');
});

test('latestRow returns the last row, or the last of one event', () => {
    const rows = readRows(writeFixture('latest.tsv'));
    assert.equal(latestRow(rows).sha, 'cccc333');
    assert.equal(latestRow(rows, 'slice').sha, 'bbbb222');
    assert.equal(latestRow(rows, 'holdout'), null);
});

test('standing carries the last stated holdout figure forward', () => {
    const { development, holdout } =
        standing(readRows(writeFixture('standing.tsv')));
    // Development comes from the newest row stating screens (the last goal
    // row); the holdout comes from the first goal row, because the rows after
    // it state no holdout figure.
    assert.equal(development.sha, 'cccc333');
    assert.equal(holdout.sha, 'aaaa111');
    assert.equal(holdout.holdout_screens_matched, '139');
});

test('standing exposes a combined fixed workload for paired measurements', () => {
    const row = scoreRow({
        utc: '2026-08-04', sha: 'dddd444', event: 'goal',
        sessions_passed: '24', sessions_total: '33',
        screens_matched: '7355', screens_total: '7765',
        rng_matched: '500000', rng_total: '610816',
        cursors_matched: '7355', cursors_total: '7765',
        holdout_sessions_passed: '2', holdout_sessions_total: '11',
        holdout_screens_matched: '328', holdout_screens_total: '3640',
        holdout_rng_matched: '39048', holdout_rng_total: '182022',
        holdout_cursors_matched: '334', holdout_cursors_total: '3640',
    });
    const { fixedDevelopment } = standing(readRows(writeFixture(
        'standing-fixed.tsv', `${COLUMNS.join('\t')}\n${row}`,
    )));
    assert.equal(fixedDevelopment.sessions_passed, '26');
    assert.equal(fixedDevelopment.sessions_total, '44');
    assert.equal(fixedDevelopment.screens_matched, '7683');
    assert.equal(fixedDevelopment.screens_total, '11405');
});

test('challenge rows cannot replace development or holdout standings', () => {
    const challenge = scoreRow({
        utc: '2026-08-03', sha: 'dddd444', event: 'challenge',
        challenge_sessions_passed: '1', challenge_sessions_total: '1',
        challenge_screens_matched: '12', challenge_screens_total: '12',
        challenge_rng_matched: '50', challenge_rng_total: '50',
        challenge_cursors_matched: '4', challenge_cursors_total: '4',
        challenge_manifest_sha256: 'c'.repeat(64),
        challenge_evaluation: 'challenges/evaluations/batch-2.json',
    });
    const rows = readRows(writeFixture('standing-challenge.tsv',
        `${fixture}\n${challenge}`));
    const current = standing(rows);
    assert.equal(current.development.sha, 'cccc333');
    assert.equal(current.holdout.sha, 'aaaa111');
    assert.equal(current.challenges.sha, 'dddd444');
});

test('generateNote composes a delta summary from current and previous', () => {
    // screens_matched changed 496→520; rng_matched changed 106505→107227.
    // The note shows both deltas, the totals, and the label.
    const note = generateNote({
        event: 'slice',
        label: 'pickup-autopickup',
        current: {
            screens_matched: '520', screens_total: '7765',
            rng_matched: '107227', rng_total: '610816',
            sessions_passed: '8', sessions_total: '10',
        },
        previous: {
            screens_matched: '496', rng_matched: '106505',
        },
        holdout: null,
    });
    assert.match(note, /pickup-autopickup closes\./u);
    assert.match(note, /496→520 of 7765 screens/u);
    assert.match(note, /106505→107227 of 610816 rng/u);
    assert.match(note, /8 of 10 sessions/u);
});

test('generateNote omits delta arrows when figures are unchanged', () => {
    // When screens_matched and rng_matched are the same as previous, the
    // note prints the value once rather than "520→520".
    const note = generateNote({
        event: 'slice',
        label: null,
        current: {
            screens_matched: '520', screens_total: '7765',
            rng_matched: '107227', rng_total: '610816',
        },
        previous: {
            screens_matched: '520', rng_matched: '107227',
        },
        holdout: null,
    });
    assert.doesNotMatch(note, /→/u);
    assert.match(note, /520 of 7765/u);
});

test('generateNote includes holdout figures when provided', () => {
    const note = generateNote({
        event: 'goal',
        label: 'zap-command',
        current: {
            screens_matched: '520', screens_total: '7765',
            rng_matched: '107227', rng_total: '610816',
        },
        previous: null,
        holdout: {
            holdout_screens_matched: '139', holdout_screens_total: '3640',
            holdout_rng_matched: '30048', holdout_rng_total: '182022',
        },
    });
    assert.match(note, /Holdout 139\/3640 screens, 30048\/182022 rng/u);
});

test('generateNote works with no previous standing', () => {
    // The first row ever has no previous to compare against.
    const note = generateNote({
        event: 'slice',
        label: 'first-slice',
        current: {
            screens_matched: '10', screens_total: '100',
            rng_matched: '50', rng_total: '500',
        },
        previous: null,
        holdout: null,
    });
    assert.match(note, /first-slice closes\./u);
    assert.match(note, /Development 10 of 100 screens, 50 of 500 rng/u);
    assert.doesNotMatch(note, /→/u);
});

test('generateNote refuses challenge events', () => {
    assert.throws(() => generateNote({ event: 'challenge' }),
        /score-challenges --record/u);
});

test('rowsSince slices from the matched sha, inclusive', () => {
    const rows = readRows(writeFixture('since.tsv'));
    // Inclusive slice: a goal's delivered delta is last row minus first row of
    // exactly this return value.
    const since = rowsSince(rows, 'bbbb');
    assert.deepEqual(since.map(({ sha }) => sha), ['bbbb222', 'cccc333']);
    assert.throws(() => rowsSince(rows, 'ffff'), /no SCORE.tsv row/u);
});
