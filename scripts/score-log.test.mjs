import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

// Three rows, one per event, in the shape SCORE.tsv holds after the 2026-08-01
// conversion. The goal row carries holdout figures because its own event ran an
// evaluation (139/3640 screens and 30048/182022 rng are the recorded fifth-zero
// values); the two later rows leave the holdout cells empty, the encoding for
// "no new holdout evidence", so standing() must reach back past both of them.
const fixture = [
    COLUMNS.join('\t'),
    ['2026-08-01', 'aaaa111', 'goal', '', '', '496', '7765', '106505',
        '610816', '', '', '139', '3640', '30048', '182022', 'goal row']
        .join('\t'),
    ['2026-08-01', 'bbbb222', 'slice', '', '', '520', '7765', '107227',
        '610816', '', '', '', '', '', '', 'slice row'].join('\t'),
    ['2026-08-02', 'cccc333', 'window', '', '', '520', '7765', '107227',
        '610816', '', '', '', '', '', '', ''].join('\t'),
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
    // A row with 15 fields is a hand-edit gone wrong; 16 is the shape.
    const short = `${COLUMNS.join('\t')}\n2026-08-01\taaaa111\tgoal`;
    assert.throws(() => readRows(writeFixture('short.tsv', short)),
        /3 fields/u);
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
    assert.throws(() => appendRow({ event: 'goal' }, path), /needs a sha/u);
    assert.throws(() => appendRow({ sha: 'e', event: 'victory' }, path),
        /event must be/u);
    // `checkpoint` was an event until the scoring run stopped appending a row
    // of its own. Every row now names a commit an agent chose to record, so the
    // retired name must not start working again.
    assert.throws(() => appendRow({ sha: 'e', event: 'checkpoint' }, path),
        /event must be/u);
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
});

test('latestRow returns the last row, or the last of one event', () => {
    const rows = readRows(writeFixture('latest.tsv'));
    assert.equal(latestRow(rows).sha, 'cccc333');
    assert.equal(latestRow(rows, 'goal').sha, 'aaaa111');
    assert.equal(latestRow(rows, 'publish'), null);
});

test('standing carries the last stated holdout figure forward', () => {
    const { development, holdout, publish } =
        standing(readRows(writeFixture('standing.tsv')));
    // Development comes from the newest row stating screens (the window row);
    // the holdout comes from the goal row two rows earlier, because the rows
    // between state no holdout figure.
    assert.equal(development.sha, 'cccc333');
    assert.equal(holdout.sha, 'aaaa111');
    assert.equal(holdout.holdout_screens_matched, '139');
    assert.equal(publish, null);
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

test('rowsSince slices from the matched sha, inclusive', () => {
    const rows = readRows(writeFixture('since.tsv'));
    // Inclusive slice: a goal's delivered delta is last row minus first row of
    // exactly this return value.
    const since = rowsSince(rows, 'bbbb');
    assert.deepEqual(since.map(({ sha }) => sha), ['bbbb222', 'cccc333']);
    assert.throws(() => rowsSince(rows, 'ffff'), /no SCORE.tsv row/u);
});
