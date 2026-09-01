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
    // Every canvas call lands in canvasOps, and also in the drawn element's
    // own ops, so a test can ask what one canvas drew.
    const canvasOps = [];
    const context = (ops) => new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => {
                canvasOps.push([String(key), ...args]);
                ops.push([String(key), ...args]);
            };
        },
        set(target, key, value) {
            canvasOps.push(['set', String(key), value]);
            ops.push(['set', String(key), value]);
            target[key] = value;
            return true;
        },
    });
    // Enough of an element for the template's first render. The chart's
    // pointer and keyboard handlers never fire here, so their DOM calls only
    // need to exist, not to record anything.
    const makeElement = (id) => {
        const ops = [];
        return {
            id,
            innerHTML: '',
            textContent: '',
            className: '',
            disabled: false,
            style: {},
            classList: { add() {}, remove() {} },
            children: [],
            ops,
            parentElement: { getBoundingClientRect: () => ({ width: 1000 }) },
            getBoundingClientRect: () => ({ width: 1000, left: 0, top: 0, height: 0 }),
            getContext: () => context(ops),
            addEventListener() {},
            appendChild(child) { this.children.push(child); return child; },
            replaceChildren(...nodes) { this.children = nodes; },
        };
    };
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, makeElement(id));
        return elements.get(id);
    };
    const template = readFileSync(TEMPLATE, 'utf8');
    const source = template.match(/<script>([\s\S]*?)<\/script>/u)[1]
        .replace('/*DATA_PLACEHOLDER*/null', JSON.stringify(data));
    const document = {
        documentElement: {},
        getElementById: element,
        createElement: (tag) => makeElement(tag),
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
        getComputedStyle: () => ({
            getPropertyValue: (property) => property,
        }),
    });
    elements.canvasOps = canvasOps;
    return elements;
}

function timelineRow(timeline, goalName) {
    return timeline.split('<div class="timeline-row">')
        .find((row) => row.includes(`title="${goalName}"`));
}

function timelineSegments(row) {
    return [...row.matchAll(
        /class="timeline-segment" style="left:([\d.-]+)%;width:([\d.-]+)%/gu,
    )].map((match) => ({
        left: Number(match[1]),
        width: Number(match[2]),
    }));
}

function assertTimelineSegmentsBounded(row) {
    const segments = timelineSegments(row);
    assert.ok(segments.length > 0);
    for (const { left, width } of segments) {
        assert.ok(left >= 0);
        assert.ok(left + width <= 100);
    }
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
    assert.equal(legacy.closeTimeSource, 'commit');
    assert.equal(data.progress[0].utcSource, 'commit');
    assert.equal(data.progress[1].utcSource, 'commit');
    assert.equal(alpha.openTimeSource, 'open-commit');
    assert.equal(alpha.goalSelectionMin, 5);
    assert.equal(alpha.goalSelectionObserved, true);
    assert.equal(alpha.closeTimeSource, 'commit');
    // Slice close time comes from the commit SHA (:30), not the SCORE row (:25)
    assert.equal(alpha.slices[0].closeTimeSource, 'score-slice');
    assert.equal(alpha.slices[0].closeTime, '2026-01-01T00:30:00.000Z');
    assert.equal(alpha.slices[0].durationMin, 10);
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
    // Both alpha (5m) and empty (10m) have observed goal selection now
    assert.equal(data.summary.medianGoalSelectionMin, 7.5);
    // Alpha's slice duration is 10m (commit time, not SCORE time)
    assert.equal(data.summary.medianImplementationMin, 10);
    // Alpha verification = close(:30) - lastSliceClose(:30) = 0
    assert.equal(data.summary.medianVerificationMin, 0);
    assert.equal(data.summary.medianTotalMin, 15);

    const rendered = renderDashboard(data);
    const table = rendered.get('goalTable').innerHTML;
    const orphanRow = table.split('</tr>').find((row) => row.includes('orphan'));
    const alphaRow = table.split('</tr>').find((row) => row.includes('alpha'));
    const betaRow = table.split('</tr>').find((row) => row.includes('beta'));
    // Orphan has inferred timing (†); alpha has observed timing (no †)
    assert.match(orphanRow, /10m †/u);
    assert.match(orphanRow, /Implementation: 10m †/u);
    assert.match(alphaRow, /Implementation: 10m"/u);
    assert.doesNotMatch(alphaRow, /Implementation: 10m †/u);
    assert.match(betaRow, /<td>10m<\/td><td>10m<\/td>/u);
    assert.match(betaRow, /Goal selection: 10m"/u);
    assert.match(betaRow, /Slice selection: 10m"/u);

    const timeline = rendered.get('timeline').innerHTML;
    // Alpha's goal selection is observed (previous goal has commit time)
    assert.match(timeline, /Goal selection: 5m"/u);
    assert.match(timeline, /Goal selection: 10m"/u);
    assert.match(
        timelineRow(timeline, 'orphan'),
        /First slice selection: 10m †/u,
    );
    assert.match(
        timelineRow(timeline, 'alpha'),
        /First slice selection: 10m"/u,
    );
    assert.match(
        timeline,
        /Implementation: 10m † — Queue orphan slice/u,
    );
    assert.match(timeline, /Implementation: 10m — Queue alpha slice/u);
    // All SHAs resolve, so no hollow markers
    assert.equal(
        rendered.get('progressProvenance').textContent,
        'All plotted times come from commit timestamps.',
    );
    // All SHAs resolve to commits, so no hollow markers are drawn
    assert.equal(
        rendered.canvasOps.filter(
            ([operation, , , radius]) => operation === 'arc' && radius === 3,
        ).length,
        0,
    );

    const queueLessBeta = {
        ...beta,
        slices: [],
        sliceCount: 0,
        sliceSelectionMin: 0,
        implementationMin: 0,
    };
    let endpointTimeline = renderDashboard({
        ...data,
        goals: [queueLessBeta],
    }).get('timeline').innerHTML;
    assertTimelineSegmentsBounded(timelineRow(endpointTimeline, 'beta'));

    endpointTimeline = renderDashboard({
        ...data,
        goals: [alpha],
    }).get('timeline').innerHTML;
    assertTimelineSegmentsBounded(timelineRow(endpointTimeline, 'alpha'));
});

test('in-progress phase provenance follows each recorded boundary', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-open-'));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    commit(fixture, 'Baseline', '2026-01-01T00:00:00Z');
    const closed = commit(
        fixture, 'Close prior goal', '2026-01-01T00:05:00Z',
    );
    commit(fixture, 'Open running goal', '2026-01-01T00:10:00Z');
    commit(fixture, 'Queue first running slice', '2026-01-01T00:20:00Z');
    const firstClose = commit(
        fixture, 'Close first running slice', '2026-01-01T00:30:00Z',
    );
    const rows = [
        SCORE_HEADER,
        scoreRow({
            utc: '2026-01-01T00:05:00Z', sha: closed,
            event: 'goal', screens: 10, note: 'prior closes.',
        }),
        scoreRow({
            utc: '2026-01-01T00:30:00Z', sha: firstClose,
            event: 'slice', screens: 15, note: 'first running slice closes.',
        }),
        '',
    ];
    writeFileSync(join(fixture, 'SCORE.tsv'), rows.join('\n'));
    const runData = () => JSON.parse(execFileSync(
        process.execPath, [DATA_SCRIPT], { cwd: fixture, encoding: 'utf8' },
    ));

    const completed = runData().goals.at(-1);
    assert.equal(completed.status, 'in-progress');
    assert.equal(completed.goalSelectionObserved, true);
    assert.equal(completed.sliceSelectionObserved, true);
    assert.equal(completed.implementationObserved, true);

    commit(fixture, 'Queue second running slice', '2026-01-01T00:40:00Z');
    const activeData = runData();
    const active = activeData.goals.at(-1);
    assert.equal(active.sliceSelectionMin, 20);
    assert.equal(active.sliceSelectionObserved, true);
    assert.equal(active.implementationObserved, false);
    let timeline = renderDashboard(activeData).get('timeline').innerHTML;
    assert.match(timeline, /Slice selection: 10m"/u);
    assert.doesNotMatch(timeline, /Slice selection: 10m \(inferred\)/u);
    const activeRow = timelineRow(timeline, 'running');
    assertTimelineSegmentsBounded(activeRow);

    // Date-only UTC in prior goal: its SHA still resolves, so utcSource is
    // 'commit' and goalSelectionObserved is true.
    rows[1] = scoreRow({
        utc: '2026-01-01', sha: closed,
        event: 'goal', screens: 10, note: 'prior closes.',
    });
    writeFileSync(join(fixture, 'SCORE.tsv'), rows.join('\n'));
    const inferredGoal = runData();
    assert.equal(inferredGoal.goals.at(-1).goalSelectionObserved, true);
    assert.equal(inferredGoal.goals.at(-1).sliceSelectionObserved, true);
    let mixedRow = timelineRow(
        renderDashboard(inferredGoal).get('timeline').innerHTML,
        'running',
    );
    assert.match(mixedRow, /Goal selection: 5m"/u);
    assert.match(mixedRow, /Slice selection: 10m"/u);
    let mixedTableRow = renderDashboard(inferredGoal).get('goalTable')
        .innerHTML.split('</tr>')
        .find((candidate) => candidate.includes('running'));
    assert.match(
        mixedTableRow,
        /<td>5m<\/td><td>20m<\/td>/u,
    );
    assert.match(
        mixedTableRow,
        /title="Goal selection: 5m" aria-label="Goal selection: 5m"/u,
    );
    assert.match(
        mixedTableRow,
        /title="Slice selection: 20m" aria-label="Slice selection: 20m"/u,
    );

    // Date-only UTC in slice: its SHA still resolves, so utcSource is 'commit'
    // and sliceSelectionObserved is true.
    rows[1] = scoreRow({
        utc: '2026-01-01T00:05:00Z', sha: closed,
        event: 'goal', screens: 10, note: 'prior closes.',
    });
    rows[2] = scoreRow({
        utc: '2026-01-01', sha: firstClose,
        event: 'slice', screens: 15, note: 'first running slice closes.',
    });
    writeFileSync(join(fixture, 'SCORE.tsv'), rows.join('\n'));
    const inferredSlice = runData();
    assert.equal(inferredSlice.goals.at(-1).goalSelectionObserved, true);
    assert.equal(inferredSlice.goals.at(-1).sliceSelectionObserved, true);
    mixedRow = timelineRow(
        renderDashboard(inferredSlice).get('timeline').innerHTML,
        'running',
    );
    assert.match(mixedRow, /Goal selection: 5m"/u);
    assert.match(mixedRow, /Slice selection: 10m"/u);
    mixedTableRow = renderDashboard(inferredSlice).get('goalTable')
        .innerHTML.split('</tr>')
        .find((candidate) => candidate.includes('running'));
    assert.match(
        mixedTableRow,
        /<td>5m<\/td><td>20m<\/td>/u,
    );
    assert.match(
        mixedTableRow,
        /title="Goal selection: 5m" aria-label="Goal selection: 5m"/u,
    );
    assert.match(
        mixedTableRow,
        /title="Slice selection: 20m" aria-label="Slice selection: 20m"/u,
    );

    // Both prior goal and slice have date-only UTC, but both SHAs resolve,
    // so all utcSources are 'commit' and everything is observed.
    rows[1] = scoreRow({
        utc: '2026-01-01', sha: closed,
        event: 'goal', screens: 10, note: 'prior closes.',
    });
    writeFileSync(join(fixture, 'SCORE.tsv'), rows.join('\n'));
    const inferredData = runData();
    const inferred = inferredData.goals.at(-1);
    assert.equal(inferred.goalSelectionMin, 5);
    assert.equal(inferred.goalSelectionObserved, true);
    assert.equal(inferred.sliceSelectionObserved, true);
    assert.equal(inferred.implementationObserved, false);
    const rendered = renderDashboard(inferredData);
    const row = rendered.get('goalTable').innerHTML.split('</tr>')
        .find((candidate) => candidate.includes('running'));
    assert.match(row, /5m<\/td>/u);
    timeline = rendered.get('timeline').innerHTML;
    assert.match(timeline, /Goal selection: 5m"/u);
    assert.match(timeline, /Slice selection: 10m"/u);
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

test('progress points carry what the chart readout shows', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-chart-'));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    commit(fixture, 'Baseline', '2026-01-01T00:00:00Z');
    // Three goals, ten minutes apart, so the whole range is under a day and
    // the readout has to print clock times as well as dates.
    const first = commit(fixture, 'Close alpha goal', '2026-01-01T00:10:00Z');
    const second = commit(fixture, 'Close beta goal', '2026-01-01T00:20:00Z');
    const third = commit(fixture, 'Close gamma goal', '2026-01-01T00:30:00Z');

    writeFileSync(join(fixture, 'SCORE.tsv'), [
        SCORE_HEADER,
        scoreRow({
            utc: '2026-01-01T00:10:00Z', sha: first, event: 'goal',
            screens: 40, note: 'alpha closes. Second sentence.',
        }),
        scoreRow({
            utc: '2026-01-01T00:20:00Z', sha: second, event: 'goal',
            screens: 55, note: 'beta closes. Second sentence.',
        }),
        scoreRow({
            utc: '2026-01-01T00:30:00Z', sha: third, event: 'goal',
            screens: 55, note: 'gamma closes. Second sentence.',
        }),
        '',
    ].join('\n'));

    const data = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture,
        encoding: 'utf8',
    }));

    // Each point names its goal the same way the goal table does.
    assert.deepEqual(
        data.progress.map((point) => point.name),
        data.goals.map((goal) => goal.name),
    );
    assert.deepEqual(
        data.progress.map((point) => point.name),
        ['alpha', 'beta', 'gamma'],
    );
    // The step the reader hovers: nothing before the first, +15, then flat.
    assert.deepEqual(
        data.progress.map((point) => point.screensDelta),
        [null, 15, 0],
    );
    // The whole note reaches the readout, not just its first sentence.
    assert.equal(data.progress[0].note, 'alpha closes. Second sentence.');

    const rendered = renderDashboard(data);
    // Twenty minutes of goals is less than the week the chart opens on, so it
    // shows all three and Show all has nothing left to reveal.
    assert.equal(rendered.get('progressReset').disabled, true);
    assert.equal(
        rendered.get('progressRange').textContent,
        '1 Jan 2026 00:10 – 1 Jan 2026 00:30 UTC · 3 goals',
    );

    // The minimap's window is the only rectangle it strokes. On the whole
    // range it covers the whole track: the stub canvas is 1000 wide, and the
    // chart's 56px left and 74px right margins are shared with the plot above.
    const [, x, y, width, height] = rendered.get('progressMinimap').ops
        .find(([operation]) => operation === 'strokeRect');
    assert.deepEqual([x, y, width], [56.5, 0.5, 1000 - 56 - 74]);
    // One pixel short of the 54px strip, so both edges of the outline land
    // inside it.
    assert.equal(height, 53);
});

test('the chart opens on the last week of goals', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-week-'));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    commit(fixture, 'Baseline', '2025-12-31T00:00:00Z');
    // Goals across 24 days. Only the last two fall in the week before the
    // newest one, which is what the chart opens on.
    const days = ['2026-01-01', '2026-01-10', '2026-01-20', '2026-01-25'];
    const shas = days.map(
        (day, i) => commit(fixture, `Close goal ${i} goal`, `${day}T00:00:00Z`),
    );

    writeFileSync(join(fixture, 'SCORE.tsv'), [
        SCORE_HEADER,
        ...shas.map((sha, i) => scoreRow({
            utc: `${days[i]}T00:00:00Z`,
            sha,
            event: 'goal',
            screens: 10 * (i + 1),
            note: `goal${i} closes.`,
        })),
        '',
    ].join('\n'));

    const data = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture,
        encoding: 'utf8',
    }));
    assert.equal(data.progress.length, 4);

    const rendered = renderDashboard(data);
    // 25 Jan is the newest goal, so the opening window runs back to 18 Jan and
    // holds the goals of 20 and 25 Jan.
    assert.equal(
        rendered.get('progressRange').textContent,
        '18 Jan 2026 – 25 Jan 2026 · 2 goals',
    );
    // The two older goals are off-window, so Show all has something to reveal.
    assert.equal(rendered.get('progressReset').disabled, false);

    // The minimap still covers the whole 24 days, so its window is now a
    // fraction of the track: 7 of 24 days across the 870px between the
    // chart's 56px left and 74px right margins.
    const [, x, , width] = rendered.get('progressMinimap').ops
        .find(([operation]) => operation === 'strokeRect');
    const track = 1000 - 56 - 74;
    assert.equal(width, Math.round(track * 7 / 24));
    assert.equal(x, Math.round(56 + track * 17 / 24) + 0.5);
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
