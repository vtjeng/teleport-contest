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
import { runInNewContext } from 'node:vm';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_SCRIPT = join(PROJECT_ROOT, 'scripts', 'dashboard-data.mjs');
const BUILD_SCRIPT = join(PROJECT_ROOT, 'scripts', 'build-dashboard.mjs');
const TEMPLATE = join(PROJECT_ROOT, 'scripts', 'dashboard.template.html');
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

function scoreRow({ utc, sha, event, screens, note }) {
    const cells = Array(16).fill('');
    cells[0] = utc;
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

function renderDashboard(data) {
    const elements = new Map();
    const context2d = new Proxy({}, {
        get(target, key) {
            if (!(key in target)) target[key] = () => {};
            return target[key];
        },
        set(target, key, value) {
            target[key] = value;
            return true;
        },
    });
    const element = (id) => {
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                innerHTML: '',
                textContent: '',
                style: {},
                parentElement: { getBoundingClientRect: () => ({ width: 1000 }) },
                getBoundingClientRect: () => ({ width: 1000 }),
                getContext: () => context2d,
            });
        }
        return elements.get(id);
    };
    const template = readFileSync(TEMPLATE, 'utf8');
    const source = template.match(/<script>([\s\S]*?)<\/script>/u)[1]
        .replace('/*DATA_PLACEHOLDER*/null', JSON.stringify(data));
    const document = {
        documentElement: {},
        getElementById: element,
        querySelectorAll: () => [],
    };
    const window = {
        addEventListener: () => {},
        devicePixelRatio: 1,
        innerWidth: 1200,
    };
    runInNewContext(source, {
        document,
        window,
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
    });
    return elements;
}

test('dashboard separates closed goals and labels inferred timing', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-data-'));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    commit(fixture, 'Baseline', '2026-01-01T00:00:00Z');
    const legacyClose = commit(
        fixture, 'Close legacy goal', '2026-01-01T00:05:00Z',
    );
    commit(fixture, 'Open alpha goal', '2026-01-01T00:10:00Z');
    commit(fixture, 'Queue alpha slice', '2026-01-01T00:20:00Z');
    const alphaClose = commit(
        fixture, 'Close alpha goal', '2026-01-01T00:30:00Z',
    );
    commit(fixture, 'Queue orphan slice', '2026-01-01T00:40:00Z');
    const orphanClose = commit(
        fixture, 'Close orphan goal', '2026-01-01T00:50:00Z',
    );
    commit(fixture, 'Open empty goal', '2026-01-01T01:00:00Z');
    const emptyClose = commit(
        fixture, 'Close empty goal', '2026-01-01T01:10:00Z',
    );
    commit(fixture, 'Open beta goal', '2026-01-01T01:20:00Z');
    commit(fixture, 'Queue beta slice', '2026-01-01T01:30:00Z');

    writeFileSync(join(fixture, 'SCORE.tsv'), [
        SCORE_HEADER,
        scoreRow({
            utc: '2026-01-01',
            sha: legacyClose,
            event: 'goal',
            screens: 5,
            note: 'legacy closes without precise time.',
        }),
        scoreRow({
            utc: '2026-01-01T00:25:00Z',
            sha: alphaClose,
            event: 'slice',
            screens: 10,
            note: 'alpha slice closes.',
        }),
        scoreRow({
            utc: '2026-01-01T00:30:00Z',
            sha: alphaClose,
            event: 'goal',
            screens: 10,
            note: 'alpha closes after one slice.',
        }),
        scoreRow({
            utc: '2026-01-01T00:50:00Z',
            sha: orphanClose,
            event: 'goal',
            screens: 20,
            note: 'orphan closes after one slice.',
        }),
        scoreRow({
            utc: '2026-01-01T01:10:00Z',
            sha: emptyClose,
            event: 'goal',
            screens: 30,
            note: 'empty closes without a slice.',
        }),
        '',
    ].join('\n'));

    const data = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture,
        encoding: 'utf8',
    }));
    assert.equal(data.goals.length, 5);
    assert.equal(data.summary.totalGoals, 4);
    assert.equal(data.summary.inProgressGoals, 1);

    const [legacy, alpha, orphan, empty, beta] = data.goals;
    assert.equal(legacy.closeTimeSource, 'score-date-commit-inferred');
    assert.equal(data.progress[0].utcSource, 'score-date-commit-inferred');
    assert.equal(data.progress[1].utcSource, 'score-utc');
    assert.equal(alpha.openTimeSource, 'open-commit');
    assert.equal(alpha.goalSelectionMin, 5);
    assert.equal(alpha.goalSelectionObserved, false);
    assert.equal(alpha.closeTimeSource, 'score-utc');
    assert.equal(alpha.slices[0].closeTimeSource, 'score-slice');
    assert.equal(alpha.slices[0].closeTime, '2026-01-01T00:25:00.000Z');
    assert.equal(alpha.slices[0].durationMin, 5);
    assert.equal(alpha.timingObserved, true);
    assert.equal(orphan.openTimeSource, 'previous-goal-close-inferred');
    assert.equal(orphan.slices[0].closeTimeSource, 'goal-close-inferred');
    assert.equal(orphan.timingObserved, false);
    assert.equal(empty.sliceCount, 0);
    assert.equal(empty.timingObserved, false);
    assert.equal(beta.status, 'in-progress');
    assert.equal(beta.goalSelectionMin, 10);
    assert.equal(beta.goalSelectionObserved, true);
    assert.equal(beta.sliceSelectionMin, 10);
    assert.equal(beta.sliceSelectionObserved, true);
    assert.equal(beta.slices[0].closeTimeSource, 'current-time-inferred');
    assert.equal(data.summary.medianGoalSelectionMin, 10);
    assert.equal(data.summary.medianImplementationMin, 5);
    assert.equal(data.summary.medianVerificationMin, 5);
    assert.equal(data.summary.medianTotalMin, 15);

    const rendered = renderDashboard(data);
    const table = rendered.get('goalTable').innerHTML;
    const orphanRow = table.split('</tr>').find((row) => row.includes('orphan'));
    const alphaRow = table.split('</tr>').find((row) => row.includes('alpha'));
    const betaRow = table.split('</tr>').find((row) => row.includes('beta'));
    assert.match(orphanRow, /10m \(inferred\)/u);
    assert.match(orphanRow, /Implementation: 10m \(inferred\)/u);
    assert.match(alphaRow, /Implementation: 5m \(recorded\)/u);
    assert.doesNotMatch(alphaRow, /Implementation: 5m \(inferred\)/u);
    assert.match(betaRow, /<td>10m<\/td><td>10m<\/td>/u);
    assert.match(betaRow, /Goal selection: 10m \(recorded\)/u);
    assert.match(betaRow, /Slice selection: 10m \(recorded\)/u);

    const timeline = rendered.get('timeline').innerHTML;
    assert.match(timeline, /Goal selection: 5m \(inferred\)/u);
    assert.match(timeline, /Goal selection: 10m"/u);
    assert.match(
        timeline,
        /Implementation: 10m \(end inferred\) — Queue orphan slice/u,
    );
    assert.match(timeline, /Implementation: 5m — Queue alpha slice/u);
    assert.equal(
        rendered.get('progressProvenance').textContent,
        '1 hollow marker uses commit time where SCORE records only a date.',
    );
});

test('verification requires a recorded final slice closure', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-verif-'));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    commit(fixture, 'Baseline', '2026-01-01T00:00:00Z');
    commit(fixture, 'Open multi goal', '2026-01-01T00:05:00Z');
    commit(fixture, 'Queue first slice', '2026-01-01T00:10:00Z');
    const firstClose = commit(
        fixture, 'Close first slice', '2026-01-01T00:20:00Z',
    );
    commit(fixture, 'Queue second slice', '2026-01-01T00:30:00Z');
    const secondClose = commit(
        fixture, 'Close second slice', '2026-01-01T00:40:00Z',
    );
    const goalClose = commit(
        fixture, 'Close multi goal', '2026-01-01T01:00:00Z',
    );
    const rows = [
        SCORE_HEADER,
        scoreRow({
            utc: '2026-01-01T00:20:00Z', sha: firstClose,
            event: 'slice', screens: 10, note: 'first slice closes.',
        }),
        scoreRow({
            utc: '2026-01-01T01:00:00Z', sha: goalClose,
            event: 'goal', screens: 20, note: 'multi closes after two slices.',
        }),
        '',
    ];
    writeFileSync(join(fixture, 'SCORE.tsv'), rows.join('\n'));

    const runData = () => JSON.parse(execFileSync(
        process.execPath, [DATA_SCRIPT], { cwd: fixture, encoding: 'utf8' },
    ));
    const inferred = runData();
    assert.equal(
        inferred.goals[0].slices[1].closeTimeSource,
        'goal-close-inferred',
    );
    assert.equal(inferred.goals[0].verificationMin, null);
    assert.equal(inferred.summary.medianVerificationMin, null);

    rows.splice(-1, 0, scoreRow({
        utc: '2026-01-01T00:40:00Z', sha: secondClose,
        event: 'slice', screens: 15, note: 'second slice closes.',
    }));
    writeFileSync(join(fixture, 'SCORE.tsv'), rows.join('\n'));
    const observed = runData();
    assert.equal(observed.goals[0].verificationMin, 20);
    assert.equal(observed.goals[0].verificationObserved, true);
    assert.equal(observed.summary.medianVerificationMin, 20);
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
