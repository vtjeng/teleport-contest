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
            // measureText answers a query rather than drawing: the end label
            // asks whether it fits right of its point. 7 px per character
            // approximates the 12 px monospace label.
            if (key === 'measureText') return (text) => ({ width: text.length * 7 });
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
        // The template schedules its own reload and carries the chart window
        // across it; neither happens here.
        setTimeout() {},
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    });
    elements.canvasOps = canvasOps;
    return elements;
}

// The goal timeline draws one row per local day for the week ending at the
// build time, so a fixture pins summary.generatedAt near its goals to see
// them.
function renderTimeline(data, generatedAt) {
    return renderDashboard({
        ...data,
        summary: { ...data.summary, generatedAt },
    }).get('timeline').innerHTML;
}

function timelineBars(timeline) {
    return [...timeline.matchAll(
        /<div class="(day-bar[^"]*)" data-goal="(\d+)" style="left:([\d.e+-]+)%;width:([\d.e+-]+)%(?:;top:([\d.]+)px;height:([\d.]+)px)?"/gu,
    )].map((match) => ({
        classes: match[1].split(' '),
        goal: Number(match[2]),
        left: Number(match[3]),
        width: Number(match[4]),
        // Only a bar stacked in a lane carries its own top and height.
        top: match[5] === undefined ? null : Number(match[5]),
        height: match[6] === undefined ? null : Number(match[6]),
    }));
}

function timelineBar(data, generatedAt, goalName) {
    return timelineBars(renderTimeline(data, generatedAt))
        .find((bar) => data.goals[bar.goal].name === goalName);
}

function assertBarsBounded(bars) {
    assert.ok(bars.length > 0);
    for (const { left, width } of bars) {
        assert.ok(left >= 0);
        // A bar clipped at midnight ends at 100%, up to rounding.
        assert.ok(left + width <= 100 + 1e-9);
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

    // GOALS.json supplies each goal's kind. alpha is a closed file port with
    // one of two functions ported; beta is the open file port; orphan is a
    // divergence fix; legacy and empty have no record and stay `boundary`.
    writeFileSync(join(fixture, 'GOALS.json'), JSON.stringify({
        goals: [
            {
                id: 'alpha', kind: 'file-port', status: 'closed',
                summary: 'Port alpha.c', cFile: 'alpha.c',
                functions: [
                    { name: 'one', line: 1, endLine: 9, ported: true },
                    { name: 'two', line: 10, endLine: 20, ported: false },
                ],
                spans: [{ name: 'one', status: 'closed', closedBy: alphaClose }],
                delivered: { screens: 5, rng: 50 },
            },
            {
                id: 'beta', kind: 'file-port', status: 'open',
                summary: 'Port beta.c', cFile: 'beta.c',
                functions: [{ name: 'three', line: 1, endLine: 5, ported: false }],
                spans: [{ name: 'three', status: 'queued', closedBy: null }],
            },
            {
                id: 'orphan', kind: 'divergence-fix', status: 'closed',
                summary: 'fix', cFile: 'dog.c', function: 'dog_eat',
                session: 'seed0001-example', spans: [],
            },
        ],
    }));

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
    assert.equal(legacy.kind, 'boundary');
    assert.equal(alpha.kind, 'file-port');
    assert.equal(alpha.cFile, 'alpha.c');
    assert.equal(alpha.functionsPorted, 1);
    assert.equal(alpha.functionsTotal, 2);
    assert.equal(orphan.kind, 'divergence-fix');
    assert.equal(beta.kind, 'file-port');
    assert.deepEqual(data.filePorts.map((port) => port.id), ['alpha', 'beta']);
    assert.equal(data.filePorts[0].spansClosed, 1);
    assert.equal(data.filePorts[0].screensDelivered, 5);
    assert.equal(data.summary.filePortsClosed, 1);
    assert.equal(data.summary.filePortsTotal, 2);
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
    // totalMin now measures prevCloseTime → closeTime (includes goal selection)
    // alpha: (:30 - :05) = 25, empty: (1:10 - :50) = 20, median = 22.5
    assert.equal(data.summary.medianTotalMin, 22.5);

    const rendered = renderDashboard(data);
    const table = rendered.get('goalTable').innerHTML;
    const orphanRow = table.split('</tr>').find((row) => row.includes('orphan'));
    const alphaRow = table.split('</tr>').find((row) => row.includes('alpha'));
    const betaRow = table.split('</tr>').find((row) => row.includes('beta'));
    // The row's kind class draws its stripe; the kinds come from GOALS.json:
    // alpha is a file port, orphan a divergence fix.
    assert.match(alphaRow, /<tr class="kind-file-port/u);
    assert.match(orphanRow, /<tr class="kind-divergence-fix/u);
    // `empty` has no GOALS.json record, so it counts as a boundary stop. (The
    // legacy goal is hidden from this table: its inferred timing is zero.)
    const emptyRow = table.split('</tr>').find((row) => row.includes('empty'));
    assert.match(emptyRow, /<tr class="kind-boundary/u);
    // The file-port table lists both records with their goal and function
    // counts: alpha's one goal is closed, beta's is open.
    const filePortTable = rendered.get('filePortTable').innerHTML;
    assert.match(filePortTable, /alpha\.c<\/td><td>1 \/ 1<\/td><td>1 \/ 2</u);
    assert.match(filePortTable, /beta\.c<\/td><td>0 \/ 1<\/td><td>0 \/ 1</u);
    // Orphan has inferred timing (†); alpha has observed timing (no †)
    assert.match(orphanRow, /20m\s†/u);
    assert.match(orphanRow, /Working time: 20/u);
    assert.match(alphaRow, /Working time: 20/u);
    assert.doesNotMatch(alphaRow, /25m\s†/u);
    assert.match(betaRow, /<td>10m<\/td>/u);
    assert.match(betaRow, /Goal selection: 10/u);

    // 03:00 on the fixture's day keeps every goal, including the one still
    // open, inside the timeline's window.
    const builtAt = '2026-01-01T03:00:00Z';
    assertBarsBounded(timelineBars(renderTimeline(data, builtAt)));
    // Orphan's open time is inferred, so its bar takes the lighter fill;
    // alpha's open commit is recorded, so its bar is solid.
    assert.ok(timelineBar(data, builtAt, 'orphan').classes.includes('inferred'));
    assert.ok(!timelineBar(data, builtAt, 'alpha').classes.includes('inferred'));
    // Alpha ran from :10 to :30, 20 minutes, one 72nd of its day's row, and
    // shares its time with no other goal, so the stylesheet sizes its bar.
    assert.ok(Math.abs(timelineBar(data, builtAt, 'alpha').width - 100 / 72) < 1e-9);
    assert.equal(timelineBar(data, builtAt, 'alpha').top, null);
    // A goal that shares alpha's time stacks with it: the two split the 16 px
    // bar height into two 7 px lanes with a 2 px gap, the earlier bar on top.
    const shift = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
    const twin = { ...alpha, name: 'twin', openTime: shift(alpha.openTime, 5), closeTime: shift(alpha.closeTime, 5) };
    assert.deepEqual(
        timelineBars(renderTimeline({ ...data, goals: [alpha, twin] }, builtAt))
            .map((bar) => [bar.goal, bar.top, bar.height]),
        [[0, 7, 7], [1, 16, 7]],
    );
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
    assertBarsBounded(timelineBars(
        renderTimeline({ ...data, goals: [queueLessBeta] }, builtAt),
    ));
    assertBarsBounded(timelineBars(
        renderTimeline({ ...data, goals: [alpha] }, builtAt),
    ));
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
        // A `span` row, the label .agents/scoring.md uses since 2026-09-05.
        scoreRow({
            utc: '2026-01-01T00:30:00Z', sha: firstClose,
            event: 'span', screens: 15, note: 'first running slice closes.',
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
    // The running goal opened at :10 and is still open at the pinned build
    // time of :45, so its bar is hatched, solid, and 35 minutes wide.
    const builtAt = '2026-01-01T00:45:00Z';
    const activeBar = timelineBar(activeData, builtAt, 'running');
    assert.ok(activeBar.classes.includes('in-progress'));
    assert.ok(!activeBar.classes.includes('inferred'));
    assert.ok(Math.abs(activeBar.width - 35 / 1440 * 100) < 1e-9);
    assertBarsBounded([activeBar]);

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
    // The running goal's open commit still resolves, so its bar stays solid.
    assert.ok(!timelineBar(inferredGoal, builtAt, 'running').classes.includes('inferred'));
    let mixedTableRow = renderDashboard(inferredGoal).get('goalTable')
        .innerHTML.split('</tr>')
        .find((candidate) => candidate.includes('running'));
    assert.match(
        mixedTableRow,
        /<td>5m<\/td>/u,
    );
    assert.match(
        mixedTableRow,
        /title="Goal selection: 5m"/u,
    );

    // Date-only UTC in slice: its SHA still resolves, so utcSource is 'commit'
    // and sliceSelectionObserved is true.
    rows[1] = scoreRow({
        utc: '2026-01-01T00:05:00Z', sha: closed,
        event: 'goal', screens: 10, note: 'prior closes.',
    });
    rows[2] = scoreRow({
        utc: '2026-01-01', sha: firstClose,
        event: 'span', screens: 15, note: 'first running slice closes.',
    });
    writeFileSync(join(fixture, 'SCORE.tsv'), rows.join('\n'));
    const inferredSlice = runData();
    assert.equal(inferredSlice.goals.at(-1).goalSelectionObserved, true);
    assert.equal(inferredSlice.goals.at(-1).sliceSelectionObserved, true);
    assert.ok(!timelineBar(inferredSlice, builtAt, 'running').classes.includes('inferred'));
    mixedTableRow = renderDashboard(inferredSlice).get('goalTable')
        .innerHTML.split('</tr>')
        .find((candidate) => candidate.includes('running'));
    assert.match(
        mixedTableRow,
        /<td>5m<\/td>/u,
    );
    assert.match(
        mixedTableRow,
        /title="Goal selection: 5m"/u,
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
    assert.ok(!timelineBar(inferredData, builtAt, 'running').classes.includes('inferred'));
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
