import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    appendFileSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_SCRIPT = join(PROJECT_ROOT, 'scripts', 'dashboard-data.mjs');
const BUILD_SCRIPT = join(PROJECT_ROOT, 'scripts', 'build-dashboard.mjs');
const SCORE_HEADER = [
    'utc', 'sha', 'event', 'sessions_passed', 'sessions_total',
    'screens_matched', 'screens_total', 'rng_matched', 'rng_total',
    'cursors_matched', 'cursors_total', 'holdout_screens_matched',
    'holdout_screens_total', 'holdout_rng_matched', 'holdout_rng_total',
    'note',
].join('\t');

function git(cwd, args, env = {}) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...env },
    }).trim();
}

function commit(cwd, message, time) {
    appendFileSync(join(cwd, 'history.txt'), `${message}\n`);
    git(cwd, ['add', 'history.txt']);
    const env = { GIT_AUTHOR_DATE: time, GIT_COMMITTER_DATE: time };
    git(cwd, ['commit', '-m', message], env);
    return git(cwd, ['rev-parse', 'HEAD']);
}

function scoreRow({ sha, event, screens, note }) {
    const cells = Array(16).fill('');
    cells[0] = '2026-01-01T00:00:00Z';
    cells[1] = sha;
    cells[2] = event;
    cells[3] = '1';
    cells[4] = '2';
    cells[5] = String(screens);
    cells[6] = '100';
    cells[7] = '10';
    cells[8] = '1000';
    cells[15] = note;
    return cells.join('\t');
}

test('dashboard separates closed goals and labels inferred timing', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-data-'));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    commit(fixture, 'Baseline', '2026-01-01T00:00:00Z');
    commit(fixture, 'Open alpha goal', '2026-01-01T00:10:00Z');
    commit(fixture, 'Queue alpha slice', '2026-01-01T00:20:00Z');
    const alphaClose = commit(
        fixture, 'Close alpha goal', '2026-01-01T00:30:00Z',
    );
    commit(fixture, 'Queue orphan slice', '2026-01-01T00:40:00Z');
    const orphanClose = commit(
        fixture, 'Close orphan goal', '2026-01-01T00:50:00Z',
    );
    commit(fixture, 'Open beta goal', '2026-01-01T01:00:00Z');
    commit(fixture, 'Queue beta slice', '2026-01-01T01:10:00Z');

    writeFileSync(join(fixture, 'SCORE.tsv'), [
        SCORE_HEADER,
        scoreRow({
            sha: alphaClose,
            event: 'slice',
            screens: 10,
            note: 'alpha slice closes.',
        }),
        scoreRow({
            sha: alphaClose,
            event: 'goal',
            screens: 10,
            note: 'alpha closes after one slice.',
        }),
        scoreRow({
            sha: orphanClose,
            event: 'goal',
            screens: 20,
            note: 'orphan closes after one slice.',
        }),
        '',
    ].join('\n'));

    const data = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture,
        encoding: 'utf8',
    }));
    assert.equal(data.goals.length, 3);
    assert.equal(data.summary.totalGoals, 2);
    assert.equal(data.summary.inProgressGoals, 1);

    const [alpha, orphan, beta] = data.goals;
    assert.equal(alpha.openTimeSource, 'open-commit');
    assert.equal(alpha.slices[0].closeTimeSource, 'score-slice');
    assert.equal(alpha.timingObserved, true);
    assert.equal(orphan.openTimeSource, 'previous-goal-close-inferred');
    assert.equal(orphan.slices[0].closeTimeSource, 'goal-close-inferred');
    assert.equal(orphan.timingObserved, false);
    assert.equal(beta.status, 'in-progress');
    assert.equal(beta.slices[0].closeTimeSource, 'current-time-inferred');
    assert.equal(data.summary.medianImplementationMin, 10);
    assert.equal(data.summary.medianTotalMin, 20);
});

test('dashboard builder injects data into a standalone HTML file', () => {
    const output = join(
        mkdtempSync(join(tmpdir(), 'teleport-dashboard-build-')),
        'dashboard.html',
    );
    execFileSync(process.execPath, [BUILD_SCRIPT, output], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
    });
    const html = readFileSync(output, 'utf8');
    assert.match(html, /<title>NetHack Port<\/title>/u);
    assert.doesNotMatch(html, /DATA_PLACEHOLDER/u);
    assert.match(html, /"inProgressGoals"\s*:\s*\d+/u);
});
