import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    appendFileSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { COLUMNS } from './score-log.mjs';
import { escapeJsonForScript, injectDashboardData } from './build-dashboard.mjs';
import { activityTimeline } from './dashboard-activity.mjs';
import { singleWorkerActivity } from './single-worker-activity.mjs';
import { createDashboardTime } from './dashboard-local-time.mjs';
import { createTrialMonitor } from './trial-monitor.mjs';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_SCRIPT = join(PROJECT_ROOT, 'scripts', 'dashboard-data.mjs');
const TEMPLATE = join(PROJECT_ROOT, 'scripts', 'dashboard.template.html');
const SCORE_HEADER = COLUMNS.join('\t');

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

function scoreRow(fields) {
    const aliases = {
        utc: 'utc', sha: 'sha', event: 'event', note: 'note',
        sessions: 'sessions_passed', sessionsTotal: 'sessions_total',
        screens: 'screens_matched', screensTotal: 'screens_total',
        rng: 'rng_matched', rngTotal: 'rng_total',
        cursors: 'cursors_matched', cursorsTotal: 'cursors_total',
        holdoutSessions: 'holdout_sessions_passed',
        holdoutSessionsTotal: 'holdout_sessions_total',
        holdoutScreens: 'holdout_screens_matched',
        holdoutScreensTotal: 'holdout_screens_total',
        holdoutRng: 'holdout_rng_matched', holdoutRngTotal: 'holdout_rng_total',
        holdoutCursors: 'holdout_cursors_matched',
        holdoutCursorsTotal: 'holdout_cursors_total',
        challengeSessions: 'challenge_sessions_passed',
        challengeSessionsTotal: 'challenge_sessions_total',
        challengeScreens: 'challenge_screens_matched',
        challengeScreensTotal: 'challenge_screens_total',
        challengeRng: 'challenge_rng_matched',
        challengeRngTotal: 'challenge_rng_total',
        challengeCursors: 'challenge_cursors_matched',
        challengeCursorsTotal: 'challenge_cursors_total',
        challengeManifestSha256: 'challenge_manifest_sha256',
        challengeEvaluation: 'challenge_evaluation',
    };
    const row = Object.fromEntries(COLUMNS.map((column) => [column, '']));
    for (const [name, column] of Object.entries(aliases)) {
        if (fields[name] !== undefined && column in row) row[column] = String(fields[name]);
    }
    for (const column of COLUMNS) {
        if (fields[column] !== undefined) row[column] = String(fields[column]);
    }
    // Preserve the compact defaults used by the timeline fixtures while
    // allowing a test to override any named score column above.
    if (!row.sessions_passed) row.sessions_passed = '1';
    if (!row.sessions_total) row.sessions_total = '2';
    if (!row.screens_matched) row.screens_matched = '0';
    if (!row.screens_total) row.screens_total = '100';
    if (!row.rng_matched) row.rng_matched = '10';
    if (!row.rng_total) row.rng_total = '1000';
    return COLUMNS.map((column) => row[column]).join('\t');
}

// Historical fixtures opt in so their existing interaction coverage remains useful.
function renderDashboard(data, queue = null, {showHistorical = true, singleWorkerData = null, fetchPublic = async () => { throw new Error('Offline fixture'); }} = {}) {
    const elements = new Map();
    const template = readFileSync(TEMPLATE, 'utf8');
    // A browser returns null for removed controls. Do not manufacture them:
    // doing so masked the retired yieldRangePicker startup exception.
    // Chart canvases created by innerHTML become available only on insertion.
    const ids = new Set([...template.split('<script>')[0].matchAll(/\bid="([^"]+)"/gu)].map(match => match[1]));
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
        let markup = '', text = '';
        return {
            id,
            get innerHTML() { return markup; },
            set innerHTML(value) {
                markup = String(value); text = markup.replace(/<[^>]*>/gu, '');
                for (const match of markup.matchAll(/\bid="([^"]+)"/gu)) ids.add(match[1]);
            },
            outerHTML: '',
            get textContent() { return text; },
            set textContent(value) { text = String(value); markup = text; },
            className: '',
            disabled: false,
            checked: id === 'activityHistorical' && showHistorical,
            hidden: false,
            style: {},
            listeners: {},
            classList: { add() {}, remove() {}, contains() { return false; } },
            children: [],
            ops,
            parentElement: {
                getBoundingClientRect: () => ({ width: 1000 }),
                afterHTML: '',
                insertAdjacentHTML(position, html) {
                    assert.equal(position, 'afterend');
                    this.afterHTML += html;
                },
            },
            // Match the fixed integration frame; other charts own their heights.
            getBoundingClientRect: () => ({ width: 1000, left: 0, top: 0, height: id === 'integrationDurationChart' ? 320 : 0 }),
            getContext: () => context(ops),
            addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
            setAttribute() {},
            setPointerCapture() { this.pointerCaptured = true; },
            hasPointerCapture() { return Boolean(this.pointerCaptured); },
            releasePointerCapture() { this.pointerCaptured = false; },
            append(...nodes) { this.children.push(...nodes); },
            appendChild(child) { this.children.push(child); return child; },
            replaceChildren(...nodes) { this.children = nodes; },
        };
    };
    const element = (id) => {
        if (!ids.has(id)) return null;
        if (!elements.has(id)) elements.set(id, makeElement(id));
        return elements.get(id);
    };
    const source = injectDashboardData(template, JSON.stringify(data), JSON.stringify(queue), undefined, JSON.stringify(singleWorkerData))
        .match(/<script>([\s\S]*?)<\/script>/u)[1];
    const document = {
        documentElement: {},
        getElementById: element,
        createElement: (tag) => makeElement(tag),
        querySelectorAll: () => [],
    };
    const window = {
        listeners: {},
        addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
        removeEventListener(type, handler) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== handler); },
        dispatchEvent(event) { for (const handler of [...(this.listeners[event.type] || [])]) handler(event); },
        matchMedia: () => ({ addEventListener() {} }),
        devicePixelRatio: 1,
        innerWidth: 1200,
    };
    const sandbox = {
        document,
        window, Event,
        fetch: fetchPublic, AbortSignal, atob, TextDecoder, Uint8Array,
        getComputedStyle: () => ({
            getPropertyValue: (property) => property,
        }),
        // The template schedules its own reload and carries the chart window
        // across it; neither happens here.
        setTimeout() {},
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    };
    runInNewContext(source + '\nglobalThis.refreshFixture = value => { singleWorkerSnapshot = singleWorkerActivity(createTrialMonitor(value).summarize()); window.dispatchEvent(new Event("single-worker-status")); };', sandbox);
    elements.refreshSnapshot = sandbox.refreshFixture;
    elements.canvasOps = canvasOps;
    return elements;
}

function sourceDashboardData() {
    // No score or timing history is needed to render the queue and source
    // tables. Unit totals keep the unrelated percentage tiles well-defined.
    return {
        summary: {
            generatedAt: '2026-01-01T00:00:00Z',
            screens: 0, screensTotal: 1, rng: 0, rngTotal: 1,
            sessions: 0, sessionsTotal: 1, totalGoals: 0,
        },
        goals: [], progress: [],
        developmentSessions: { executionCommit: 'a'.repeat(40), sessions: [] },
        scoreHistory: ['Development set', 'Synthetic local holdout'].map((title, index) => ({
            id: ['developmentSet', 'syntheticHoldout'][index],
            title, points: [],
        })),
        scores: {
            headSha: null,
            fixedDevelopment: { status: 'unmeasured', sha: null, utc: null,
                sessions: null, screens: null, rng: null, cursors: null },
            development: { status: 'unmeasured', sha: null, utc: null,
                sessions: null, screens: null, rng: null, cursors: null },
            localHoldout: { status: 'unmeasured', sha: null, utc: null,
                sessions: null, screens: null, rng: null, cursors: null },
        },
        challenges: {
            status: 'unmeasured', sha: null, utc: null, manifestSha256: null,
            totals: null, changes: null, cases: [],
        },
    };
}

test('missing integration history is unavailable, not a zero-time average', () => {
    const rendered = renderDashboard(sourceDashboardData());
    for (const prefix of ['integrationDuration', 'prepIntegrationDuration']) {
        assert.equal(rendered.get(prefix + 'Summary').textContent, 'No completed attempts');
        assert.doesNotMatch(rendered.get(prefix + 'Summary').textContent, /0\.0 min/u);
    }
    assert.match(rendered.get('integrationDurationReadout').textContent, /unavailable/u);
});

test('outdated exploration and shared queue panels are absent without changing historical data', () => {
    const data = sourceDashboardData();
    data.explorationYield = {records: [{id: 'historical'}]};
    data.assignmentQueue = {tasks: [{id: 'historical'}]};
    const before = JSON.stringify(data);
    const rendered = renderDashboard(data);
    const template = readFileSync(TEMPLATE, 'utf8');
    assert.doesNotMatch(template, /Exploration yield|Shared work queue|id="yieldChart"|id="assignmentQueue"/u);
    assert.equal(rendered.has('yieldChart'), false);
    assert.equal(rendered.has('assignmentQueue'), false);
    assert.equal(JSON.stringify(data), before);
    assert.match(template, /Work lead backlog/u);
});

test('removed freshness disclosure leaves no DOM nodes or rendering dependencies', () => {
    const template = readFileSync(TEMPLATE, 'utf8');
    assert.doesNotMatch(template, /Freshness and evidence|workerEvidence|activitySnapshotTime|workerSnapshotText|id="updated"/u);
    const data = sourceDashboardData();
    for (const capturedAt of [undefined, 'invalid', '2026-10-23T01:30:00Z']) {
        data.activity = {capturedAt, tasks: [], segments: []};
        const rendered = renderDashboard(data);
        for (const id of ['updated', 'activitySnapshotTime', 'workerEvidence'])
            assert.equal(rendered.has(id), false);
        assert.match(rendered.get('stats').innerHTML, /Development set/);
        assert.ok(rendered.get('goalTable').innerHTML, 'startup reaches the final section');
        assert.equal(rendered.get('displayTimezone').textContent, 'Times in ' + createDashboardTime().zone);
    }
});

test('integration series share a chart but keep independent medians and pin the original task', () => {
    const data = sourceDashboardData();
    const at = minute => new Date(Date.UTC(2026, 9, 12, 10) + minute * 60000).toISOString();
    const row = (task, kind, start, end) => ({ task, kind, lane: 'Main', phase: 'integrating',
        start: at(start), end: at(end) });
    data.activity = { capturedAt: at(150), segments: [
        row('A1', 'implementation', 0, 5), row('Prep1', 'challenge-preparation', 5, 105),
        row('A2', 'implementation', 105, 120),
    ], tasks: ['A1', 'Prep1', 'A2'].map(id => ({ id, label: id, worker: id === 'Prep1' ? 'Prep' : 'A',
        assignedAt: at(0), status: 'integrating' })) };
    const rendered = renderDashboard(data);
    assert.equal(rendered.get('integrationDurationSummary').textContent, 'Median 10.0 min · 2 attempts');
    assert.equal(rendered.get('prepIntegrationDurationSummary').textContent, 'Median 100.0 min · 1 attempt');
    const chart = rendered.get('integrationDurationChart');
    chart.listeners.keydown[0]({ key: 'End', preventDefault() {} });
    assert.match(rendered.get('integrationDurationReadout').innerHTML, /A2[\s\S]*Rolling median 10\.0 min \(2 attempts\)/u);
    chart.listeners.keydown[0]({ key: 'ArrowLeft', preventDefault() {} });
    const selected = rendered.get('integrationDurationReadout').innerHTML;
    assert.match(selected, /Prep1[\s\S]*100\.0 min[\s\S]*Rolling median 100\.0 min \(1 attempt\)/u);
    assert.match(rendered.get('timelineReadout').innerHTML, /Prep1/u);
    chart.listeners.pointermove[0]({ clientX: 950, clientY: 82 });
    assert.equal(rendered.get('integrationDurationReadout').innerHTML, selected,
        'hovering another series cannot replace the pinned Prep attempt');
    chart.listeners.keydown[0]({ key: 'End', preventDefault() {} });
    assert.match(rendered.get('integrationDurationReadout').innerHTML, /A2[\s\S]*Rolling median 10\.0 min \(2 attempts\)/u);
    assert.match(rendered.get('timelineReadout').innerHTML, /A2/u);
    const ops = chart.ops;
    assert.ok(ops.some(([call, dash]) => call === 'setLineDash' && dash.length === 2), 'Prep rolling median is dashed');
    assert.ok(ops.some(([call]) => call === 'closePath'), 'the outlying Prep attempt has a triangle mark');
    assert.ok(ops.some(([call, , , radius]) => call === 'arc' && radius === 3.5), 'implementation attempts have circular marks');
    const blueStart = ops.findIndex(([call, key, value]) => call === 'set' && key === 'strokeStyle' && value === '--integration-blue');
    assert.ok(ops.slice(blueStart).find(([call]) => call === 'moveTo')[1] > 44,
        'without older history, the mean starts at the first completion, not the left padding');
});

test('rolling lines carry pre-window medians and step only at completed attempts', () => {
    const data = sourceDashboardData();
    const at = minute => new Date(Date.UTC(2026, 9, 12) + minute * 60000).toISOString();
    const row = (task, start, end, extra = {}) => ({ task, lane: 'Main', phase: 'integrating',
        start: at(start), end: at(end), ...extra });
    // The six-hour view is minutes 240–600. Both series have older samples;
    // only implementation has a completion in the view (20 min, mean 15 min).
    data.activity = { capturedAt: at(600), tasks: [], segments: [
        row('old-implementation', 0, 10),
        row('old-prep', 10, 110, { kind: 'challenge-preparation' }),
        row('new-implementation', 480, 500), row('gap', 500, 600, { phase: 'idle' }),
    ] };
    const rendered = renderDashboard(data);
    const ops = rendered.get('integrationDurationChart').ops;
    const meanPath = color => {
        let strokeStyle, path = [];
        for (const [call, ...args] of ops) {
            if (call === 'set' && args[0] === 'strokeStyle') strokeStyle = args[1];
            if (call === 'beginPath') path = [];
            if (call === 'moveTo' || call === 'lineTo') path.push(args);
            if (call === 'stroke' && strokeStyle === color) return path;
        }
        return [];
    };
    // The default axis spans 30 minutes in a 320 px frame with 12/28 px
    // vertical padding. The old Prep median is clipped visibly at the top.
    const completionX = 44 + (500 - 240) / 360 * 944;
    assert.deepEqual(meanPath('--integration-blue'), [
        [44, 292 - 10 / 30 * 280], [completionX, 292 - 10 / 30 * 280],
        [completionX, 292 - 15 / 30 * 280], [988, 292 - 15 / 30 * 280],
    ], 'carry the old median to the left edge, hold, jump at completion, then hold to the right edge');
    assert.deepEqual(meanPath('--integration-orange'), [[44, 12], [988, 12]],
        'Prep retains its pre-window 100 minute median even without a completion in view');
    assert.equal(rendered.get('integrationDurationSummary').textContent, 'Median 20.0 min · 1 attempt');
    assert.match(rendered.get('prepIntegrationDurationSummary').textContent, /No completed attempts/u);
    assert.equal(ops.filter(([call]) => call === 'arc').length, 1,
        'pre-window medians must not create fake attempt markers');
});

test('integration axis marks overflow and can reveal its full duration', () => {
    const data = sourceDashboardData();
    // The 74-minute attempt exceeds the 30-minute default; full range fits it
    // at 75 minutes. Neither view changes the recorded 74-minute duration.
    data.activity = { capturedAt: '2026-10-12T10:14:00Z', tasks: [], segments: [{
        task: 'long-attempt', lane: 'Main', phase: 'integrating',
        start: '2026-10-12T09:00:00Z', end: '2026-10-12T10:14:00Z',
    }] };
    const rendered = renderDashboard(data), chart = rendered.get('integrationDurationChart');
    const ticks = () => chart.ops.filter(([call, value]) => call === 'fillText' && /^\d+$/u.test(value))
        .map(([, value]) => Number(value));
    assert.deepEqual(ticks(), [0, 10, 20, 30]);
    const gridPositions = () => chart.ops.filter(([call, value]) => call === 'fillText' && /^\d+$/u.test(value)).map(([, , , y]) => y);
    const initialGrid = gridPositions();
    assert.match(rendered.get('integrationOverflow').textContent, /1 attempt above 30 min · longest 74.0 min/u);
    chart.listeners.keydown[0]({key: 'End', preventDefault() {}});
    assert.match(rendered.get('integrationDurationReadout').innerHTML, /74\.0 min/u);
    chart.ops.length = 0;
    rendered.get('integrationFullRange').listeners.click[0]();
    assert.deepEqual(ticks(), [0, 25, 50, 75]);
    assert.deepEqual(gridPositions(), initialGrid, 'the scale changes labels without moving gridlines');
    chart.ops.length = 0;
    rendered.get('integrationFullRange').listeners.click[0]();
    assert.deepEqual(ticks(), [0, 25, 50, 75], 'selecting All durations twice keeps that scale');
    chart.ops.length = 0;
    rendered.get('integrationTypicalRange').listeners.click[0]();
    assert.deepEqual(ticks(), [0, 10, 20, 30], 'the 0–30 min option restores the clipped scale');
    assert.match(rendered.get('integrationDurationReadout').innerHTML, /74\.0 min/u);
});

test('score cards share one format and show commit ages without hashes', () => {
    const data = sourceDashboardData();
    data.scores = {
        headSha: 'a'.repeat(40),
        fixedDevelopment: {
            status: 'measured', sha: 'b'.repeat(40), utc: '2026-01-01T00:00:00Z',
            sessions: { matched: 4, total: 6 },
            screens: { matched: 12, total: 16 },
            rng: { matched: 14, total: 16 },
            cursors: { matched: 3, total: 4 },
        },
        development: {
            status: 'measured', sha: 'b'.repeat(40), utc: '2026-01-01T00:00:00Z',
            sessions: { matched: 3, total: 4 },
            screens: { matched: 8, total: 10 },
            rng: { matched: 9, total: 10 },
            cursors: { matched: 2, total: 2 },
        },
        localHoldout: {
            status: 'stale', sha: 'c'.repeat(40), utc: '2025-12-01T00:00:00Z',
            sessions: { matched: 1, total: 2 },
            screens: { matched: 4, total: 6 },
            rng: { matched: 5, total: 6 },
            cursors: { matched: 1, total: 2 },
        },
    };
    data.challenges = {
        status: 'failed', sha: 'd'.repeat(40), utc: '2026-01-02T00:00:00Z',
        manifestSha256: 'e'.repeat(64), totals: null,
        changes: null, error: 'runner failed: <details>',
        cases: [{
            id: 'nested-box', title: 'Nested <box>', outcome: 'container',
            sourcePointers: ['invent.c:12 <tip>'],
            first: {
                sha: 'f'.repeat(40), utc: '2026-01-01T00:00:00Z',
                screens: { matched: 2, total: 3 }, passed: false, error: null,
            },
            current: null, delta: null,
        }],
    };
    // The measured commit is one hour old even though its ledger row is older.
    data.scores.fixedDevelopment.commitUtc = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rendered = renderDashboard(data);
    const stats = rendered.get('stats').innerHTML;
    assert.deepEqual([...stats.matchAll(/class="score-card-title">([^<]+)/gu)]
        .map(match => match[1]), [
            'Development set', 'Synthetic local holdout',
        ]);
    assert.match(stats, /Commit 1h 0m ago/u);
    assert.match(stats, />75.0%</u);
    assert.match(stats, />87.5%</u);
    assert.match(stats, />Failed</u);
    assert.match(stats, /runner failed: &lt;details&gt;/u);
    assert.doesNotMatch(stats, /Incomplete|combined only|Cases evaluated|Manifest|bbbbbbb|ccccccc|ddddddd/u);
    const table = rendered.get('challengeTable').innerHTML;
    assert.match(table, /Nested &lt;box&gt;/u);
    assert.match(table, /container/u);
    assert.match(table, /<th>Initial<\/th><th>Current<\/th><th>Total<\/th><th>Change<\/th>/u);
    assert.match(table, /<td>2<\/td><td>-<\/td><td>3<\/td><td>—<\/td>/u);
    assert.doesNotMatch(table, /f{40}|2026-01-01 00:00Z|<time\b/u);
    assert.doesNotMatch(table + rendered.get('challengeCards').innerHTML,
        /Source pointers|invent\.c:12|&lt;tip&gt;/u);
    assert.doesNotMatch(table, /<th>Added<\/th>/u);
    assert.doesNotMatch(table, /<box>|<tip>/u);
});

test('challenge rows and cards show compact counts and comparable change', () => {
    const data = sourceDashboardData();
    data.challenges.cases = [
        { id: 'gain', title: 'Gain', first: { sha: 'a'.repeat(40), utc: '2026-01-01T00:00:00Z',
            screens: { matched: 2, total: 7 } },
        current: { sha: 'b'.repeat(40), utc: '2026-01-02T00:00:00Z',
            screens: { matched: 5, total: 7 } }, delta: 3, sourcePointers: ['hack.c:12'] },
        { id: 'incomparable', title: 'Incomparable',
            first: { screens: { matched: 1, total: 7 } },
            current: { screens: { matched: 4, total: 8 } }, delta: null },
    ];
    const rendered = renderDashboard(data);
    const table = rendered.get('challengeTable').innerHTML;
    const cards = rendered.get('challengeCards').innerHTML;
    assert.match(table, /Gain[\s\S]*<td>2<\/td><td>5<\/td><td>7<\/td><td>\+3<\/td>/u);
    assert.match(table, /Incomparable[\s\S]*<td>1<\/td><td>4<\/td><td>8<\/td><td>—<\/td>/u);
    assert.match(cards, /<dt>Initial<\/dt><dd>2<\/dd>[\s\S]*<dt>Current<\/dt><dd>5<\/dd>[\s\S]*<dt>Total<\/dt><dd>7<\/dd>[\s\S]*<dt>Change<\/dt><dd>\+3<\/dd>/u);
    assert.doesNotMatch(table + cards,
        /2026-01-0|a{40}|b{40}|<time\b|challenge-result-source|Source pointers|hack\.c:12/u);
});

test('remaining challenge filter includes screen and trace mismatches', () => {
    const data = sourceDashboardData();
    const screens = { matched: 3, total: 3 };
    const rng = { matched: 10, total: 10 };
    const cursors = { matched: 3, total: 3 };
    data.challenges.cases = [
        { batch: 'v1', id: 'fixed', title: 'Fixed', current: { passed: true, screens, rng, cursors } },
        { batch: 'v1', id: 'screen', title: 'Screen mismatch',
            current: { passed: false, screens: { matched: 2, total: 3 }, rng, cursors } },
        { batch: 'v2', id: 'trace', title: 'Trace mismatch',
            current: { passed: false, screens, rng: { matched: 9, total: 10 }, cursors } },
    ];
    const queue = { mode: 'work', blockers: [], generationReady: false, sessions: [
        { corpus: 'synthetic', batch: 'v1', caseId: 'screen', session: 'synthetic/v1/screen',
            remainingScreens: 1, recordedSteps: 3, kind: 'screen' },
        { corpus: 'synthetic', batch: 'v2', caseId: 'trace', session: 'synthetic/v2/trace',
            remainingScreens: 0, recordedSteps: 3, kind: 'rng' },
    ] };
    const rendered = renderDashboard(data, queue);
    assert.match(rendered.get('sessionMeasurementInfo').textContent, /2 of 3 synthetic sessions remaining/u);
    const filter = rendered.get('sessionShowAll');
    assert.doesNotMatch(rendered.get('challengeTable').innerHTML, /<td>Fixed<\/td>/u);
    assert.match(rendered.get('challengeTable').innerHTML, /Screen mismatch[\s\S]*Trace mismatch/u);
    filter.checked = true;
    filter.listeners.change[0]();
    assert.match(rendered.get('challengeTable').innerHTML, /Fixed/u);
    filter.checked = false;
    filter.listeners.change[0]();
    assert.doesNotMatch(rendered.get('challengeTable').innerHTML, /<td>Fixed<\/td>/u);
});

test('session rows distinguish submitted targets and shared-source reservations without changing scores', () => {
    const data = sourceDashboardData();
    // Three unmatched one-boundary cases: a submitted target, its shared source,
    // and an unclaimed investigation. All remain in the score/remaining counts.
    data.challenges.cases = ['target', 'related', 'free'].map(id => ({batch: 'v1', id, title: id,
        first: {screens: {matched: 0, total: 1}},
        current: {passed: false, screens: {matched: 0, total: 1}}}));
    const task = {id: 'A-task', worker: 'A2', status: 'ready', seed: 'synthetic/v1/target',
        reservations: ['session:synthetic/v1/target', 'source:spell.c:cast_protection']};
    data.workerReservations = {tasks: {[task.id]: task}, reservations: Object.fromEntries(
        task.reservations.map(key => [key, {tasks: [task.id]}]))};
    const queue = {mode: 'work', sessions: data.challenges.cases.map(item => ({
        session: 'synthetic/v1/' + item.id, kind: 'screen', remainingScreens: 1,
        ...(item.id === 'related' ? {investigation: {status: 'complete', result: {
            source: {file: 'spell.c', functions: ['cast_protection']}}}} : {}),
    }))};
    const rendered = renderDashboard(data, queue);
    const html = rendered.get('challengeTable').innerHTML;
    assert.match(html, /Submitted—awaiting Work lead/u);
    assert.match(html, /Reserved by submitted work/u);
    assert.match(html, /Task A-task · Worker A · Submitted—awaiting Work lead/u);
    assert.match(html, /<td>0<\/td><td>0<\/td><td>1<\/td>/u);
    assert.match(rendered.get('sessionSummary').textContent, /3 sessions need work/u);
    for (const [state, label] of [['working', 'In progress'], ['integrating', 'Integration and checks'],
        ['validated', 'Awaiting acceptance'], ['changes-required', 'Needs correction']]) {
        task.status = state;
        assert.ok(renderDashboard(data, queue).get('challengeCards').innerHTML.includes(label), state);
    }
    data.workerReservations = null;
    assert.doesNotMatch(renderDashboard(data, queue).get('challengeTable').innerHTML, /Submitted—awaiting Work lead|Not available for assignment/u,
        'an older snapshot does not invent current ownership');
});

test('unmeasured challenge cases remain visible in the remaining filter', () => {
    const data = sourceDashboardData();
    data.challenges.cases = [
        { batch: 'v3', id: 'pending', title: 'Pending evaluation',
            first: null, current: null, delta: null },
        { batch: 'v3', id: 'partial', title: 'Incomplete metrics',
            current: { passed: true, screens: { matched: 1, total: 1 }, rng: {},
                cursors: { matched: 1, total: 1 } } },
    ];
    const rendered = renderDashboard(data, { mode: 'work', sessions: [],
        generationReady: false, blockers: ['v3 evaluation missing'] });
    assert.match(rendered.get('sessionSummary').textContent,
        /2 sessions need work/u);
    assert.match(rendered.get('challengeTable').innerHTML, /Pending evaluation/u);
    assert.match(rendered.get('challengeTable').innerHTML, /Incomplete metrics/u);
});

test('excluded cases leave pending work but retain raw scores and reasons in all sessions', () => {
    const data = sourceDashboardData();
    // One unmatched screen represents build provenance; a cursor-only loss
    // represents the damaged recorder. The third case still needs source work.
    const full = { matched: 3, total: 3 };
    const screenLoss = { passed: false, screens: { matched: 2, total: 3 }, rng: full, cursors: full };
    data.challenges.cases = [
        { batch: 'v32', id: 'version', title: 'Version identity', current: screenLoss },
        { batch: 'v35', id: 'recorder', title: 'Damaged recorder',
            current: { passed: false, screens: full, rng: full, cursors: { matched: 2, total: 3 } } },
        { batch: 'v35', id: 'work', title: 'Portable behavior', current: screenLoss },
    ];
    const before = JSON.stringify(data.challenges);
    const queue = { sessions: [], excluded: [
        { session: 'synthetic/v32/version', resolution: { reason: 'Different <platform> labels.' } },
        { session: 'synthetic/v35/recorder', resolution: { reason: 'Corrupted cursor evidence.' } },
    ] };
    const rendered = renderDashboard(data, queue);
    assert.match(rendered.get('sessionMeasurementInfo').textContent, /1 of 1 synthetic sessions remaining · 2 excluded/u);
    assert.doesNotMatch(rendered.get('challengeTable').innerHTML, /Version identity|Damaged recorder/u);
    assert.match(rendered.get('challengeTable').innerHTML, /Portable behavior/u);
    const showAll = rendered.get('sessionShowAll');
    showAll.checked = true;
    showAll.listeners.change[0]();
    assert.match(rendered.get('challengeTable').innerHTML,
        /Version identity[\s\S]*Different &lt;platform&gt; labels\.[\s\S]*<td>2<\/td><td>3<\/td>[\s\S]*Excluded/u);
    assert.match(rendered.get('challengeCards').innerHTML, /Corrupted cursor evidence\.[\s\S]*Excluded|Excluded[\s\S]*Corrupted cursor evidence\./u);
    showAll.checked = false;
    showAll.listeners.change[0]();
    assert.doesNotMatch(rendered.get('challengeTable').innerHTML, /Version identity|Damaged recorder/u);
    assert.equal(JSON.stringify(data.challenges), before, 'filtering never changes scores');
    data.challenges.cases.pop();
    const onlyExcluded = renderDashboard(data, queue);
    assert.match(onlyExcluded.get('challengeTable').innerHTML, /No remaining sessions/u);
    assert.doesNotMatch(onlyExcluded.get('challengeTable').innerHTML, /All sessions match/u);
    assert.match(onlyExcluded.get('sessionMeasurementInfo').textContent, /0 of 0 synthetic sessions remaining · 2 excluded/u);
});

test('batches with only excluded mismatches default off without claiming a full match', () => {
    const data = sourceDashboardData();
    // Equal case IDs across batches ensure exclusions use full session identity.
    const full = { matched: 3, total: 3 };
    const result = { passed: false, screens: { matched: 2, total: 3 }, rng: full, cursors: full };
    data.challenges.batches = ['v32', 'v35'].map(batch => ({ batch, status: 'measured' }));
    data.challenges.cases = ['v32', 'v35'].map(batch => ({ batch, id: 'version', current: result }));
    data.scoreHistory = [data.scoreHistory[0], ...['v32', 'v35'].map(batch => ({
        id: 'syntheticHoldout-' + batch, title: batch,
        // A single recorded point is sufficient to exercise chart visibility.
        points: [{ utc: '2026-01-01T00:00:00Z', screens: 2, screensTotal: 3 }],
    }))];
    const rendered = renderDashboard(data, { sessions: [], excluded: [
        { session: 'synthetic/v32/version', resolution: { reason: 'Build identity.' } },
    ] });
    assert.equal(rendered.get('challengePlot1').hidden, true);
    assert.equal(rendered.get('challengePlot2').hidden, false);
    assert.match(rendered.get('historyBatchOptions').innerHTML, /v32<\/span><small>No pending work/u);
    assert.match(rendered.get('historyBatchOptions').innerHTML, /v35<\/span><small>Unresolved/u);
    rendered.get('historyBatchOptions').listeners.change[0]({
        target: { dataset: { series: 'syntheticHoldout-v32' }, checked: true },
    });
    assert.equal(rendered.get('challengePlot1').hidden, false, 'raw history remains available');
    // Missing authoritative exclusions must not silently suppress strict losses.
    assert.equal(renderDashboard(data).get('challengePlot1').hidden, false);
    data.challenges.batches[0].status = 'stale';
    assert.equal(renderDashboard(data, { sessions: [], excluded: [
        { session: 'synthetic/v32/version', resolution: { reason: 'Build identity.' } },
    ] }).get('challengePlot1').hidden, false, 'an exclusion does not hide stale evidence');
});

test('score rows expose named development and local holdout measures', t => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-scores-'));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    const measured = commit(fixture, 'Record development and holdout', '2026-01-01T00:10:00Z');
    writeFileSync(join(fixture, 'SCORE.tsv'), [
        SCORE_HEADER,
        scoreRow({
            // The ledger is appended later than the measured commit.
            utc: '2026-01-01T00:15:00Z', sha: measured, event: 'holdout',
            screens: 8, screensTotal: 10, rng: 9, rngTotal: 10,
            cursors: 7, cursorsTotal: 8,
            sessions: 3, sessionsTotal: 4,
            holdoutScreens: 4, holdoutScreensTotal: 6,
            holdoutRng: 5, holdoutRngTotal: 6,
            holdoutCursors: 2, holdoutCursorsTotal: 3,
            holdoutSessions: 1, holdoutSessionsTotal: 2,
            note: 'scores',
        }),
        '',
    ].join('\n'));
    const data = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture, encoding: 'utf8',
    }));
    assert.deepEqual(data.scores.development.screens, { matched: 8, total: 10 });
    assert.deepEqual(data.scores.localHoldout.screens, { matched: 4, total: 6 });
    assert.deepEqual(data.scores.fixedDevelopment.screens, { matched: 12, total: 16 });
    assert.deepEqual(data.scores.fixedDevelopment.rng, { matched: 14, total: 16 });
    assert.deepEqual(data.scores.fixedDevelopment.sessions, { matched: 4, total: 6 });
    assert.deepEqual(data.scores.development.sessions, { matched: 3, total: 4 });
    assert.deepEqual(data.scores.localHoldout.sessions, { matched: 1, total: 2 });
    assert.deepEqual(data.scores.development.cursors, { matched: 7, total: 8 });
    assert.deepEqual(data.scores.localHoldout.cursors, { matched: 2, total: 3 });
    assert.equal(
        new Date(data.scores.development.commitUtc).toISOString(),
        '2026-01-01T00:10:00.000Z',
    );
    assert.equal(data.scores.localHoldout.commitUtc, data.scores.development.commitUtc);
    assert.equal(data.scores.development.utc, '2026-01-01T00:15:00Z');

    commit(fixture, 'Later implementation change', '2026-01-01T00:20:00Z');
    const stale = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture, encoding: 'utf8',
    }));
    assert.equal(stale.scores.development.status, 'stale');
    assert.equal(stale.scores.localHoldout.status, 'stale');
});

test('synthetic batch histories and duplicate case IDs remain separate in the dashboard', () => {
    const data = sourceDashboardData();
    const count = { matched: 2, total: 3 };
    data.challenges = {
        status: 'stale', totals: { screens: count },
        batches: [
            { batch: 'v1', status: 'stale', totals: { screens: count } },
            { batch: 'v2', status: 'unmeasured', totals: null },
        ],
        cases: ['v1', 'v2'].map(batch => ({ batch, id: 'same-case', title: 'Shared title',
            first: null, current: null, delta: null })),
    };
    data.scoreHistory = [data.scoreHistory[0], ...['v1', 'v2'].map((batch, index) => ({
        id: 'syntheticHoldout-' + batch, title: 'Synthetic local holdout · ' + batch,
        points: [{ utc: '2026-01-01T00:00:00Z', screens: index + 1, screensTotal: 3 }],
    }))];
    const rendered = renderDashboard(data);
    assert.match(rendered.get('challengeTable').innerHTML,
        /Shared title<\/td><td>Synthetic · v1[\s\S]*Shared title<\/td><td>Synthetic · v2/u);
    assert.match(rendered.get('challengeBatches').innerHTML,
        /v1: stale[\s\S]*v2: unmeasured/u);
    assert.match(rendered.get('stats').innerHTML, /Earlier measurement; reassessment required/u);
    assert.match(rendered.get('challengeHistoryPlots').innerHTML, /v1[\s\S]*challengeChart[\s\S]*v2[\s\S]*challengeChart2/u);
    assert.ok(rendered.get('challengeChart').ops.length);
    assert.ok(rendered.get('challengeChart2').ops.length);
    assert.equal(rendered.get('progressMinimap').style.height, '152px');
});

test('batch picker defaults to unresolved cases and fits each percent axis', () => {
    const data = sourceDashboardData();
    const result = (matched, total) => ({ passed: true, screens: { matched, total },
        rng: { matched: total, total }, cursors: { matched: total, total } });
    data.challenges.batches = ['v1', 'v2'].map(batch => ({ batch, status: 'measured' }));
    data.challenges.cases = [
        { batch: 'v1', id: 'done', current: result(100, 100) },
        { batch: 'v2', id: 'open', current: result(45, 100) },
    ];
    data.scoreHistory = [data.scoreHistory[0], ...[
        { batch: 'v1', scores: [80, 100] }, { batch: 'v2', scores: [40, 45] },
    ].map(({ batch, scores }) => ({
        id: 'syntheticHoldout-' + batch, title: 'Synthetic local holdout · ' + batch,
        points: scores.map((screens, index) => ({
            utc: `2026-01-0${index + 1}T00:00:00Z`, screens, screensTotal: 100,
        })),
    }))];
    const rendered = renderDashboard(data);
    assert.equal(rendered.get('challengePlot1').hidden, true);
    assert.equal(rendered.get('challengePlot2').hidden, false);
    assert.equal(rendered.get('historyBatchSummary').textContent, 'Batches · 1/2');
    assert.match(rendered.get('historyBatchOptions').innerHTML, /v1<\/span><small>Resolved/u);
    assert.match(rendered.get('historyBatchOptions').innerHTML, /v2<\/span><small>Unresolved/u);
    assert.equal(rendered.get('progressMinimap').style.height, '108px');
    assert.doesNotMatch(rendered.get('progressReadout').innerHTML, /· v1/u);
    rendered.get('historyBatchOptions').listeners.change[0]({
        target: { dataset: { series: 'syntheticHoldout-v1' }, checked: true },
    });
    assert.equal(rendered.get('challengePlot1').hidden, false);
    assert.equal(rendered.get('progressMinimap').style.height, '152px');
    assert.match(rendered.get('progressReadout').innerHTML, /· v1/u);
    rendered.get('progressMode-percent').listeners.click[0]();
    const v1Labels = rendered.get('challengeChart').ops.filter(([op]) => op === 'fillText')
        .map(([, value]) => value);
    const v2Labels = rendered.get('challengeChart2').ops.filter(([op]) => op === 'fillText')
        .map(([, value]) => value);
    assert.ok(v1Labels.includes('78%'), 'the first batch keeps its own admission range');
    assert.ok(v2Labels.includes('35%'), 'the second batch keeps its own admission range');
});

test('healthy batch measurements do not repeat above the challenge cases', () => {
    const data = sourceDashboardData();
    data.challenges.batches = [
        { batch: 'v1', status: 'measured', totals: { screens: { matched: 8, total: 10 } } },
        { batch: 'v2', status: 'measured', totals: { screens: { matched: 4, total: 5 } } },
    ];
    assert.equal(renderDashboard(data, { sessions: [], blockers: [] })
        .get('challengeBatches').innerHTML, '');
});

test('batch notices group repeated errors without repeating them in the score card', () => {
    const data = sourceDashboardData();
    data.challenges.status = 'incomplete';
    data.challenges.batches = ['v1', 'v2'].map(batch => ({
        batch, status: 'stale', error: 'replay inputs changed since evaluation',
    }));
    data.challenges.error = data.challenges.batches.map(batch => batch.error).join('; ');
    const grouped = renderDashboard(data);
    assert.match(grouped.get('challengeBatches').innerHTML,
        /v1, v2: stale · replay inputs changed since evaluation/u);
    assert.equal((grouped.get('challengeBatches').innerHTML.match(/replay inputs changed/gu) || []).length, 1);
    assert.doesNotMatch(grouped.get('stats').innerHTML, /replay inputs changed/u);
    data.challenges.error = 'aggregate evaluation failed';
    assert.match(renderDashboard(data).get('stats').innerHTML, /aggregate evaluation failed/u);
});

test('legacy queue identities display current role names without changing stored activity', () => {
    const data = sourceDashboardData();
    const at = minute => new Date(Date.UTC(2026, 9, 15, 10, minute)).toISOString();
    data.activity = activityTimeline({events: [
        {type: 'assign', task: 'batch', worker: 'Prep', kind: 'challenge-preparation', batch: 'v90', at: at(0)},
        {type: 'ready', task: 'batch', at: at(1)},
        {type: 'integrating', task: 'batch', at: at(2)},
    ]}, at(3));
    data.assignmentQueue = {readySessions: 1, threshold: 5, reason: 'Prefer exploration.',
        workers: [{worker: 'Worker-1', state: 'idle', assignment: null}], blocked: [],
        tasks: [
            {id: 'explore', type: 'exploration', output: 'exploration', status: 'ready',
                producer: 'Prep', recipient: 'Prep', batch: 'v91', sessions: []},
            {id: 'fix', type: 'implementation', output: 'implementation', status: 'ready',
                producer: 'Main', recipient: 'Main', sessions: ['synthetic/v90/case']},
        ]};
    const before = JSON.stringify(data), rendered = renderDashboard(data);
    assert.match(rendered.get('timeline').innerHTML, /activity-label">Challenge lead/u);
    assert.match(rendered.get('timeline').innerHTML, /activity-label">Work lead/u);
    assert.match(rendered.get('activityMetrics').innerHTML, /Challenge lead[\s\S]*Work lead/u);
    assert.equal(JSON.stringify(data), before, 'display names must not rewrite historical identities');
});

test('worker activity hides historical lanes and their utilization until requested', () => {
    const data = sourceDashboardData();
    const at = minute => new Date(Date.UTC(2026, 9, 16, 4, minute)).toISOString();
    data.activity = {capturedAt: at(20), tasks: [], segments: [
        {lane: 'A', phase: 'working', start: at(0), end: at(20)},
        {lane: 'Prep-1', phase: 'working', start: at(0), end: at(20)},
        {lane: 'Worker-1', phase: 'working', start: at(0), end: at(10)},
        {lane: 'Worker-1', phase: 'idle', start: at(10), end: at(20)},
        {lane: 'Main', phase: 'review', start: at(0), end: at(20)},
    ]};
    const rendered = renderDashboard(data, null, {showHistorical: false});
    assert.doesNotMatch(rendered.get('timeline').innerHTML, /activity-label">(?:A|P1)</u);
    assert.doesNotMatch(rendered.get('timeline').innerHTML, /activity-label">Worker 1</u);
    assert.doesNotMatch(rendered.get('timeline').innerHTML, /activity-label">Work lead</u);
    assert.match(rendered.get('timeline').innerHTML, /activity-label">Standard engineer</u);
    assert.doesNotMatch(rendered.get('activityMetrics').innerHTML, /A\/B\/C|Prep lanes/u);
    assert.equal(rendered.get('activityMetrics').hidden, true);
    const toggle = rendered.get('activityHistorical');
    toggle.checked = true;
    toggle.listeners.change[0]();
    assert.match(rendered.get('timeline').innerHTML, /activity-label">A</u);
    assert.match(rendered.get('timeline').innerHTML, /activity-label">P1</u);
    assert.match(rendered.get('activityMetrics').innerHTML, /A\/B\/C|Prep lanes/u);
});

test('Work lead backlog distinguishes unmerged deliveries, accepted reserve batches, and parked records', () => {
    const template = readFileSync(TEMPLATE, 'utf8');
    assert.ok(template.includes('<details class="section dashboard-disclosure" id="legacyBacklog">'),
        'historical backlog is collapsed by default');
    assert.ok(template.includes('<h3 class="section-title" id="pendingMainWorkTitle">Work lead backlog</h3>'),
        'pending work uses the same heading level and style as Worker activity');
    // Keep the original compact summary size; only the section title is a heading.
    assert.ok(template.includes('.activity-backlog { font-size: 12px;'), 'summary text is not enlarged');
    const data = sourceDashboardData();
    // Snapshot ages, not the viewer's clock, determine the waits shown here.
    data.activity = { capturedAt: '2026-10-08T12:00:00Z', segments: [], tasks: [] };
    const row = { task: 'A1', worker: 'A', kind: 'implementation', status: 'ready',
        since: '2026-10-08T11:00:00Z', blockedBy: ['B1'], delivery: 'a'.repeat(40) };
    data.pendingMainWork = { deliveries: [row], preparedBatches: [{ ...row, task: 'Prep1',
        batch: 'v34', status: 'awaiting-admission', blockedBy: [] }],
        parkedTasks: [{ ...row, task: 'C1', status: 'parked', reason: 'Await <source> owner.' }] };
    const rendered = renderDashboard(data);
    const html = rendered.get('pendingMainWork').innerHTML;
    assert.doesNotMatch(html, /<strong>Pending Main work<\/strong>/u, 'the summary does not repeat the section heading');
    assert.match(html, /Waiting for dependencies · 1/u);
    assert.match(html, /Batches to admit · 1[\s\S]*Challenge batch v34/u);
    assert.doesNotMatch(html, /Submitted batches awaiting Main/u);
    assert.match(html, /1h 0m/u);
    assert.doesNotMatch(html, /Await &lt;source&gt; owner|C1/u);
    assert.match(rendered.get('parkedTasks').innerHTML, /Await &lt;source&gt; owner\./u);
    data.pendingMainWork = { deliveries: [], preparedBatches: [], parkedTasks: [] };
    assert.match(renderDashboard(data).get('pendingMainWork').innerHTML, /0 implementation tasks[\s\S]*0 challenge batches/u);
    data.pendingMainWork = null;
    assert.match(renderDashboard(data).get('pendingMainWork').textContent, /snapshot is refreshed/u);
});

test('prepared submissions remain visible separately from accepted batches awaiting admission', () => {
    const data = sourceDashboardData();
    data.activity = { capturedAt: '2026-10-12T20:00:00Z', segments: [], tasks: [] };
    // Reproduce v53 accepted while four newer batches are submitted in order.
    const rows = [54, 55, 56, 57].map((version, index) => ({
        task: 'Prep' + (18 + index), worker: 'Prep', kind: 'challenge-preparation',
        batch: 'v' + version, status: 'ready', since: '2026-10-12T19:00:00Z',
        blockedBy: Array.from({ length: index }, (_, earlier) => 'Prep' + (18 + earlier)),
        delivery: String(index + 1).repeat(40),
    }));
    data.pendingMainWork = { deliveries: rows, preparedBatches: [{ ...rows[0],
        task: 'Prep17', batch: 'v53', status: 'awaiting-admission', blockedBy: [] }], parkedTasks: [] };
    const html = renderDashboard(data).get('pendingMainWork').innerHTML;
    assert.match(html, /Ready to integrate · 1[\s\S]*Challenge batch v54/u);
    assert.match(html, /Waiting for dependencies · 3/u);
    for (const batch of ['v55', 'v56', 'v57']) assert.ok(html.includes('Challenge batch ' + batch));
    assert.match(html, /Batches to admit · 1[\s\S]*Challenge batch v53/u);
    assert.match(html, /v55[\s\S]*Waiting on Challenge batch v54/u,
        'batch dependencies use batch names rather than opaque preparation task IDs');
    assert.doesNotMatch(html, /Ready batches awaiting admission/u);
});

test('primary dashboard prioritizes current status, scores and distinct repairs over diagnostics', () => {
    const template = readFileSync(TEMPLATE, 'utf8');
    const positions = ['id="currentStatusTitle"', 'id="stats"', 'id="recentRepairsTitle"', 'id="workerActivityTitle"',
        'id="timeline"', 'id="integrationDisclosure"', 'id="challengeTitle"', 'id="scoreHistoryTitle"',
        'class="diagnostics dashboard-disclosure"', 'id="pendingMainWorkTitle"', 'id="goalTable"']
        .map(marker => template.indexOf(marker));
    assert.ok(positions.every(position => position >= 0));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    assert.doesNotMatch(template, /id="sourceWorkDisclosure"|id="remainingWorkDisclosure"|id="queueDisclosure"|Known mismatches|<h2[^>]*>Challenges<\/h2>/u);
});

test('one sessions table includes both sets with exact scores and distinct mismatch counts', () => {
    const data = sourceDashboardData();
    const full = { matched: 4, total: 4 };
    data.developmentSessions.sessions = [
        { session: 'matched', passed: true, error: null,
            metrics: { screens: full, rng: full, cursors: full } },
        { session: 'holdout/remaining', passed: false, error: null,
            metrics: { screens: { matched: 2, total: 4 }, rng: full, cursors: full } },
    ];
    data.challenges.cases = [
        { batch: 'v2', id: 'matched', title: 'Synthetic matched',
            first: { screens: { matched: 1, total: 4 } },
            current: { passed: true, screens: full, rng: full, cursors: full }, delta: 3 },
        { batch: 'v2', id: 'remaining', title: 'Synthetic remaining',
            first: { screens: { matched: 1, total: 4 } },
            current: { passed: false, screens: { matched: 2, total: 4 },
                rng: full, cursors: full }, delta: 1 },
    ];
    const queue = { sessions: [
        { corpus: 'fixed', session: 'holdout/remaining', step: 2, kind: 'screen',
            remainingScreensUpperBound: 2 },
        { corpus: 'synthetic', session: 'synthetic/v2/remaining', step: 3,
            kind: 'screen', remainingScreens: 2 },
    ], blockers: [] };
    const rendered = renderDashboard(data, queue);
    const table = rendered.get('challengeTable');
    assert.match(rendered.get('sessionMeasurementInfo').textContent,
        /1 of 2 development sessions remaining · 1 of 2 synthetic sessions remaining/u);
    assert.match(table.innerHTML, /holdout\/remaining[\s\S]*Development[\s\S]*<td>0<\/td><td>2<\/td><td>4<\/td><td>\+2<\/td>/u);
    assert.match(table.innerHTML, /At most 2 later screens may be affected/u);
    assert.match(table.innerHTML, /Synthetic remaining[\s\S]*2 screens currently unmatched/u);
    assert.doesNotMatch(table.innerHTML, /Synthetic matched|<summary>matched<\/summary>/u);
    const showAll = rendered.get('sessionShowAll');
    showAll.checked = true;
    showAll.listeners.change[0]();
    assert.match(table.innerHTML, /Synthetic matched/u);
    assert.match(table.innerHTML, /<td>matched<\/td><td>Development/u);
    assert.match(table.innerHTML, /<td><span role="img" aria-label="Matched">✅<\/span><\/td>/u);
    assert.match(table.innerHTML, /<td><span role="img" aria-label="Remaining">🔧<\/span><\/td>/u);
    assert.doesNotMatch(table.innerHTML, /✅ Matched|🔧 Remaining/u);
});

test('activity distinguishes pending deliveries from reported waits and shows utilization instead of pills', () => {
    const data = sourceDashboardData();
    const at = time => `2026-09-25T${time}:00Z`;
    const events = [
        ['assign', '01:00', 'B0', 'B'], ['ready', '02:00', 'B0'],
        ['integrating', '02:30', 'B0'], ['validated', '03:00', 'B0'],
        ['accepted', '03:05', 'B0'], ['published', '03:06', 'B0'],
        ['assign', '09:00', 'B1', 'B'], ['ready', '09:50', 'B1'],
        ['assign', '10:00', 'A1', 'A'], ['ready', '10:10', 'A1'],
        ['assign', '10:12', 'A2', 'A'], ['integrating', '10:15', 'B1'],
        ['validated', '10:25', 'B1'], ['accepted', '10:26', 'B1'],
        ['published', '10:27', 'B1'], ['integrating', '10:40', 'A1'],
        ['validated', '11:00', 'A1'], ['accepted', '11:02', 'A1'],
        ['published', '11:03', 'A1'], ['ready', '11:10', 'A2'],
    ].map(([type, time, task, worker], index) => ({
        id: String(index), type, at: at(time), task,
        ...(worker ? { worker, goal: task } : {}),
    }));
    data.activity = activityTimeline({ runId: 'loop-20260925', events }, at('11:15'));
    const rendered = renderDashboard(data);
    // The visible six-hour window has ten- and twenty-minute attempts. The
    // older thirty-minute attempt affects the rolling mean, not this window mean.
    assert.equal(rendered.get('integrationDurationSummary').textContent, 'Median 15.0 min · 2 attempts');
    const durationChart = rendered.get('integrationDurationChart');
    durationChart.listeners.keydown[0]({ key: 'End', preventDefault() {} });
    const pinnedDuration = rendered.get('integrationDurationReadout').innerHTML;
    assert.match(pinnedDuration, /A1[\s\S]*20\.0 min[\s\S]*Rolling median 20\.0 min \(3 attempts\)/u);
    durationChart.listeners.pointermove[0]({ clientX: 857, clientY: 82 });
    assert.equal(rendered.get('integrationDurationReadout').innerHTML, pinnedDuration,
        'hover cannot replace a deliberately selected attempt');
    assert.match(rendered.get('timelineReadout').innerHTML, /A1/u, 'duration selection selects the same stage in task history');
    assert.match(rendered.get('activityMetrics').innerHTML, /A\/B\/C[\s\S]*Challenge lead[\s\S]*Work lead/u);
    assert.doesNotMatch(rendered.get('activityMetrics').innerHTML, /Ready → integration|activity-metric|Longest block/u);
    assert.match(rendered.get('timeline').innerHTML, /activity-row main/u);
    // Standard lane remains alongside retired A, B and Main history.
    assert.equal((rendered.get('timeline').innerHTML.match(/activity-row(?: main)?" style="height:48px"/gu) || []).length, 4);
    const firstBarTop = lane => rendered.get('timeline').innerHTML.match(new RegExp(
        `activity-label">${lane}<\\/div><div class="activity-track"><div class="activity-bar[^>]*top:([^;]+);`, 'u'))?.[1];
    assert.equal(firstBarTop('A'), '13px');
    assert.equal(firstBarTop('B'), '13px');
    // Pending delivery remains in A1's history, never in the worker row.
    assert.ok(data.activity.stages.every(row => row.phase !== 'pending' && row.phase !== 'queued'));
    const waitIndex = data.activity.stages.findIndex(row => row.task === 'A1' && row.phase === 'working');
    rendered.get('timeline').listeners.pointerdown[0]({ button: 0, clientX: 100, pointerId: 2,
        target: { classList: { contains: name => name === 'activity-bar' },
            dataset: { segment: String(waitIndex) } } });
    rendered.get('timeline').listeners.pointerup[0]({ type: 'pointerup', pointerId: 2,
        target: rendered.get('timeline') });
    assert.match(rendered.get('timelineReadout').innerHTML, /Delivery pending/u);
    assert.match(rendered.get('timelineReadout').innerHTML, /Task lifespan/u);
    // Group worker stages separately from Main's ordered acceptance lifecycle.
    assert.match(rendered.get('timelineLegend').innerHTML, /Retired workers[\s\S]*phase-working[\s\S]*phase-rework[\s\S]*phase-parked[\s\S]*Work lead[\s\S]*phase-review[\s\S]*phase-integrating[\s\S]*phase-acceptance[\s\S]*phase-publication[\s\S]*Availability[\s\S]*phase-blocked[\s\S]*phase-idle[\s\S]*phase-unrecorded/u);
    const mainIndex = data.activity.stages.findIndex(row => row.task === 'B1'
        && row.phase === 'integrating');
    const timeline = rendered.get('timeline');
    timeline.listeners.pointerdown[0]({ button: 0, clientX: 100, pointerId: 2,
        target: { classList: { contains: name => name === 'activity-bar' },
            dataset: { segment: String(mainIndex) } } });
    timeline.listeners.pointerup[0]({ type: 'pointerup', pointerId: 2, target: timeline });
    assert.doesNotMatch(rendered.get('timelineReadout').innerHTML, /overlapped this stage|Overlap alone/u);
    // The selected integration stage appears once, highlighted within the lifespan.
    assert.match(rendered.get('timelineReadout').innerHTML, /class="selected"><button[^>]*aria-current="step"[^>]*>Work lead · Integration/u);
    assert.match(rendered.get('timelineReadout').innerHTML, /<time>[^<]+<\/time> → <time>[^<]+<\/time>/u);
    assert.doesNotMatch(rendered.get('timelineReadout').innerHTML, /Selected stage/u);
    // Selecting a history stage outside the current window must not pan or rebuild the plot.
    const beforeSelection = { window: rendered.get('activityWindowLabel').textContent, plot: timeline.innerHTML };
    const sourceIndex = data.activity.segments.findIndex(row => row.task === 'B1' && row.phase === 'working');
    rendered.get('timelineReadout').listeners.click[0]({ target: { closest: () => ({
        dataset: { history: String(sourceIndex) },
    }) } });
    assert.equal(rendered.get('activityWindowLabel').textContent, beforeSelection.window);
    assert.equal(timeline.innerHTML, beforeSelection.plot);
    assert.match(rendered.get('timelineReadout').innerHTML, /aria-current="step"[^>]*>B · Assigned task/u);
    const shortWindow = rendered.get('activityWindowLabel').textContent;
    const shortUtilization = rendered.get('activityMetrics').innerHTML;
    timeline.listeners.pointerdown[0]({ button: 0, clientX: 0, pointerId: 1, target: timeline });
    timeline.listeners.pointermove[0]({ clientX: 700, pointerId: 1 });
    timeline.listeners.pointerup[0]({ pointerId: 1 });
    assert.notEqual(rendered.get('activityWindowLabel').textContent, shortWindow);
    assert.notEqual(rendered.get('activityMetrics').innerHTML, shortUtilization,
        'percentage shares follow the panned window, not whole-history stage durations');
    assert.match(rendered.get('timeline').innerHTML, /B0/u);
    assert.equal((rendered.get('timeline').innerHTML.match(/activity-row(?: main)?" style="height:48px"/gu) || []).length, 4);
    timeline.listeners.keydown[0]({key: 'End', target: timeline, preventDefault() {}});
    assert.equal(rendered.get('activityWindowLabel').textContent, shortWindow);
    const select = rendered.get('activityWindow');
    select.value = '24';
    select.listeners.change[0]();
    assert.notEqual(rendered.get('activityWindowLabel').textContent, shortWindow);
});

test('activity view labels preparation and escapes public wait reasons', () => {
    const data = sourceDashboardData();
    // One preparation task supplies all new coordinator phases in a short window.
    const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
    data.activity = activityTimeline({ events: [
        { type: 'assign', task: 'P1', worker: 'Prep', kind: 'challenge-preparation', batch: 'v40', at: at(0) },
        { type: 'ready', task: 'P1', at: at(5) },
        { type: 'activity', task: 'P1', phase: 'review', reason: 'Check C witnesses.', at: at(6) },
        { type: 'integrating', task: 'P1', at: at(8) },
        { type: 'validated', task: 'P1', passed: true, at: at(9) },
        { type: 'accepted', task: 'P1', at: at(10) },
        { type: 'published', task: 'P1', at: at(11) },
        { type: 'turn', worker: 'Prep', state: 'blocked', reason: 'Await main <admission>.', at: at(12) },
        { type: 'activity', task: 'P1', phase: 'admission', reason: 'Check hashes.', at: at(13) },
        { type: 'activity', task: 'P1', phase: 'baseline', reason: 'First evaluation.', at: at(15) },
    ] }, at(20));
    const rendered = renderDashboard(data);
    const html = rendered.get('timeline').innerHTML;
    for (const phase of ['review', 'admission', 'baseline', 'blocked'])
        assert.match(html, new RegExp(`phase-${phase}`, 'u'));
    assert.match(html, /activity-label">Challenge lead/u);
    assert.match(rendered.get('timelineReadout').innerHTML, /Await main &lt;admission&gt;/u);
    assert.match(rendered.get('activityMetrics').innerHTML, /Challenge lead[\s\S]*25%[\s\S]*40%/u);
    const index = data.activity.stages.findIndex(row => row.task === 'P1' && row.phase === 'admission');
    rendered.get('timeline').listeners.click[0]({ target: { classList: { contains: value => value === 'activity-bar' },
        dataset: { segment: String(index) } } });
    assert.match(rendered.get('timelineReadout').innerHTML, /<dt>Batch<\/dt><dd>Synthetic local holdout v40<\/dd>/u);
    assert.match(html, /Batch admission for P1 · v40/u);
});

test('activity keeps selected-stage details without a separate Inspect list', () => {
    const template = readFileSync(TEMPLATE, 'utf8');
    assert.match(template, /id="timelineReadout"/u);
    assert.doesNotMatch(template, /activityListMode|activityWaitList/u);
});

test('Prep exploration has separate agent rows, pooled lane utilization and batch-linked results', () => {
    const data = sourceDashboardData();
    const at = minute => new Date(Date.UTC(2026, 9, 15, 10, minute)).toISOString();
    const probe = (n, minute, state = 'active', outcome) => ({type: 'prep-probe', task: 'Prep47',
        probe: `v83-probe-${n}`, worker: `Prep-${n}`, source: `fixture.c:target${n}`,
        reason: state === 'blocked' ? 'Waiting for a recorder slot.' : 'Explore C behavior.',
        state, ...(outcome ? {outcome} : {}), at: at(minute)});
    data.activity = activityTimeline({events: [
        {type: 'assign', task: 'Prep47', worker: 'Prep', kind: 'challenge-preparation', batch: 'v83', at: at(0)},
        ...Array.from({length: 6}, (_, index) => probe(index + 1, 1)), // Six dedicated Prep lanes.
        probe(2, 2, 'blocked'), probe(2, 4), probe(1, 5, 'done', 'failure'), probe(3, 5, 'done', 'match'),
    ]}, at(6));
    const rendered = renderDashboard(data), timeline = rendered.get('timeline');
    assert.match(timeline.innerHTML, /activity-label">Challenge lead/u);
    for (let n = 1; n <= 6; n++) assert.match(timeline.innerHTML, new RegExp(`activity-label">P${n}<`, 'u'));
    assert.equal((timeline.innerHTML.match(/class="activity-row(?: main)?"/gu) || []).length, 9,
        'current Standard lane plus one retired lead, six explorers and Main');
    assert.match(rendered.get('activityMetrics').innerHTML, /Challenge lead[\s\S]*Prep lanes/u);
    const index = data.activity.stages.findIndex(row => row.lane === 'Prep-1');
    timeline.listeners.click[0]({target: {classList: {contains: value => value === 'activity-bar'}, dataset: {segment: String(index)}}});
    const details = rendered.get('timelineReadout').innerHTML;
    assert.match(details, /<dt>Worker<\/dt><dd>P1<\/dd>/u);
    assert.match(details, /<dt>Batch task<\/dt><dd>Prep47<\/dd>/u);
    assert.match(details, /Synthetic local holdout v83/u);
    assert.match(details, /<dt>C target<\/dt><dd>fixture.c:target1<\/dd>/u);
    assert.match(details, /<dt>Probe result<\/dt><dd>failure<\/dd>/u);
    assert.doesNotMatch(details, /Integration and checks|Publication/u);
    timeline.listeners.pointerover[0]({target: {classList: {contains: value => value === 'activity-bar'},
        dataset: {segment: String(data.activity.stages.findIndex(row => row.lane === 'Prep-2'))}}});
    assert.equal(rendered.get('timelineReadout').innerHTML, details, 'hover cannot replace the selected probe');
});

test('selected stage details stay pinned across hover, focus and time range changes', () => {
    const data = sourceDashboardData();
    // Separate tasks let hover and explicit selection be distinguished.
    data.activity = activityTimeline({ events: [
        { type: 'assign', task: 'A1', worker: 'A', at: '2026-09-25T10:00:00Z' },
        { type: 'assign', task: 'B1', worker: 'B', at: '2026-09-25T10:00:00Z' },
    ] }, '2026-09-25T10:10:00Z');
    const rendered = renderDashboard(data);
    const timeline = rendered.get('timeline');
    const stages = data.activity.stages;
    const target = task => ({ classList: { contains: value => value === 'activity-bar' },
        dataset: { segment: String(stages.findIndex(row => row.task === task)) } });
    timeline.listeners.pointerover[0]({ target: target('B1') });
    assert.match(rendered.get('timelineReadout').innerHTML, /<strong>B1<\/strong>/u);
    timeline.listeners.click[0]({ target: target('A1') });
    const pinned = rendered.get('timelineReadout').innerHTML;
    timeline.listeners.pointerover[0]({ target: target('B1') });
    timeline.listeners.focusin[0]({ target: target('B1') });
    assert.equal(rendered.get('timelineReadout').innerHTML, pinned);
    rendered.get('activityWindow').value = '24';
    rendered.get('activityWindow').listeners.change[0]();
    assert.equal(rendered.get('timelineReadout').innerHTML, pinned);
    timeline.listeners.click[0]({ target: target('B1') });
    assert.match(rendered.get('timelineReadout').innerHTML, /<strong>B1<\/strong>/u);
});

test('recovered publication details show the upper bound and never a fabricated elapsed time', () => {
    const data = sourceDashboardData();
    // The recorded observation is later than the known-public bound. Neither
    // timestamp establishes a first-publication duration from acceptance.
    const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
    data.activity = activityTimeline({ events: [
        { type: 'assign', task: 'C1', worker: 'C', at: at(0) },
        { type: 'ready', task: 'C1', at: at(1) },
        { type: 'integrating', task: 'C1', at: at(2) },
        { type: 'accepted', task: 'C1', at: at(3) },
        { type: 'publication-confirmed', task: 'C1', knownBy: at(8), at: at(9) },
    ] }, at(10));
    const rendered = renderDashboard(data);
    const index = data.activity.stages.findIndex(row => row.task === 'C1' && row.phase === 'working');
    rendered.get('timeline').listeners.click[0]({ target: { classList: { contains: value => value === 'activity-bar' },
        dataset: { segment: String(index) } } });
    const html = rendered.get('timelineReadout').innerHTML;
    assert.match(html, /<dt>Published by<\/dt>/u);
    assert.match(html, /exact time unknown/u);
    assert.match(html, /Publication · duration unknown/u);
    assert.doesNotMatch(html, /Publication · 5m|open at snapshot/u);
    const sourceIndex = data.activity.segments.findIndex(row => row.durationUnknown);
    const plot = rendered.get('timeline').innerHTML;
    rendered.get('timelineReadout').listeners.click[0]({ target: { closest: () => ({
        dataset: { history: String(sourceIndex) },
    }) } });
    assert.equal(rendered.get('timeline').innerHTML, plot);
    assert.match(rendered.get('timelineReadout').innerHTML, /Publication · duration unknown · selected/u);
});

test('activity keeps one row per agent across panning and zooming', () => {
    const data = sourceDashboardData();
    // B1 remains pending while B2 and B3 are assigned. Queue history must
    // not create extra worker rows, including when B2 resumes after feedback.
    // A2 is a worker ID, distinct from the historical A worker.
    const at = time => `2026-09-25T${time}:00Z`;
    const events = [
        // Earlier history permits panning without clipping the B assignments.
        ['assign', '00:00', 'B0', 'B'], ['park', '00:30', 'B0'],
        ['assign', '09:00', 'B1', 'B'], ['ready', '10:00', 'B1'],
        ['assign', '10:10', 'B2', 'B'], ['assign', '10:12', 'B3', 'B'],
        ['integrating', '10:15', 'B1'], ['ready', '10:20', 'B2'],
        ['ready', '10:30', 'B3'], ['feedback', '10:40', 'B2'],
        ['resume', '10:45', 'B2'], ['ready', '10:50', 'B2'],
        ['integrating', '11:00', 'B2'],
        ['integrating', '11:30', 'B3'],
        ['assign', '09:00', 'old-A', 'A'], ['ready', '09:30', 'old-A'],
        ['integrating', '10:00', 'old-A'],
        ['assign', '10:00', 'replacement-A', 'A2'],
        ['ready', '11:45', 'replacement-A'],
    ].map(([type, time, task, worker], index) => ({
        id: String(index), type, at: at(time), task, ...(worker ? { worker } : {}),
    }));
    data.activity = activityTimeline({ events }, at('12:00'));
    const rendered = renderDashboard(data);
    const timeline = rendered.get('timeline');
    assert.match(timeline.innerHTML, /activity-label">A<\/div>/u);
    assert.doesNotMatch(timeline.innerHTML, /activity-label">A2<\/div>/u);
    assert.match(timeline.innerHTML, /Assigned task for replacement-A/u);
    const replacementIndex = data.activity.stages.findIndex(row => row.task === 'replacement-A');
    timeline.listeners.click[0]({ target: { classList: { contains: value => value === 'activity-bar' },
        dataset: { segment: String(replacementIndex) } } });
    assert.match(rendered.get('timelineReadout').innerHTML, /<dt>Task<\/dt><dd><strong>replacement-A<\/strong><\/dd>/u);
    assert.match(rendered.get('timelineReadout').innerHTML, /<dt>Worker<\/dt><dd>A<\/dd>/u);
    assert.doesNotMatch(rendered.get('timelineReadout').innerHTML, /A2/u);
    assert.doesNotMatch(timeline.innerHTML, /Delivery pending for replacement-A/u);
    const barPosition = index => {
        const bar = timeline.innerHTML.match(new RegExp(
            `<div class="activity-bar[^>]*data-segment="${index}"[^>]*>`, 'u'))?.[0];
        assert.ok(bar, `segment ${index} is rendered`);
        return bar.match(/top:([^;]+);[^>]*height:([^;"]+)/u)?.slice(1);
    };
    const taskPositions = new Map();
    for (const task of ['B1', 'B2', 'B3']) {
        const indices = data.activity.stages.flatMap((segment, index) =>
            segment.task === task && segment.lane === 'B' ? [index] : []);
        const positions = indices.map(barPosition);
        for (const position of positions) {
            assert.deepEqual(position, positions[0], `${task} assignments and waits align`);
        }
        taskPositions.set(task, { index: indices[0], position: positions[0] });
    }
    // Queue history can overlap, but an agent's displayed activity cannot.
    assert.equal(new Set([...taskPositions.values()].map(row => row.position[0])).size, 1);
    assert.equal((timeline.innerHTML.match(/activity-row(?: main)?" style="height:48px"/gu) || []).length, 4);
    const initialWindow = rendered.get('activityWindowLabel').textContent;
    // A short drag shifts the window while keeping all three assignments visible.
    timeline.listeners.pointerdown[0]({ button: 0, clientX: 0, pointerId: 1, target: timeline });
    timeline.listeners.pointermove[0]({ clientX: 100, pointerId: 1 });
    timeline.listeners.pointerup[0]({ pointerId: 1 });
    assert.notEqual(rendered.get('activityWindowLabel').textContent, initialWindow);
    for (const { index, position } of taskPositions.values()) {
        assert.deepEqual(barPosition(index), position, 'panning preserves task rows');
    }
    timeline.listeners.keydown[0]({key: 'End', target: timeline, preventDefault() {}});
    const select = rendered.get('activityWindow');
    for (const hours of ['24', '168', '6']) {
        select.value = hours;
        select.listeners.change[0]();
        for (const { index, position } of taskPositions.values()) {
            assert.deepEqual(barPosition(index), position, 'zoom preserves task rows');
        }
    }
});

test('activity details distinguish idle workers from tasks and Main stages from task ownership', () => {
    const data = sourceDashboardData();
    // A2 is the replacement worker; a delivery creates an idle gap before Main integrates it.
    // Escaping the goal and report also prevents metadata from becoming markup.
    const at = minute => `2026-09-25T10:${minute}:00Z`;
    data.activity = activityTimeline({ events: [
        { type: 'assign', task: 'A177', worker: 'A2', goal: 'source <port>', at: at('00') },
        { type: 'ready', task: 'A177', at: at('05') },
        { type: 'turn', worker: 'A2', state: 'idle', reason: 'Await <caller>.', at: at('05') },
        { type: 'integrating', task: 'A177', at: at('10') },
    ] }, at('15'));
    const rendered = renderDashboard(data);
    const select = phase => rendered.get('timeline').listeners.click[0]({ target: {
        classList: { contains: value => value === 'activity-bar' },
        dataset: { segment: String(data.activity.stages.findIndex(row => row.phase === phase)) },
    } });
    select('idle');
    let html = rendered.get('timelineReadout').innerHTML;
    assert.match(html, /<dt>Task<\/dt><dd>None<\/dd>/u);
    assert.match(html, /<dt>Worker<\/dt><dd>A<\/dd>/u);
    assert.match(html, /<dt>Stage<\/dt><dd>Idle \(worker report\)<\/dd>/u);
    assert.match(html, /Await &lt;caller&gt;\./u);
    assert.doesNotMatch(html, /<strong>A2?<\/strong>|A2/u);
    assert.doesNotMatch(rendered.get('timeline').innerHTML, /for A2|>A2<\/div>/u);
    select('integrating');
    html = rendered.get('timelineReadout').innerHTML;
    assert.match(html, /<dt>Task<\/dt><dd><strong>A177<\/strong><\/dd>/u);
    assert.match(html, /<dt>Worker<\/dt><dd>A<\/dd>/u);
    assert.match(html, /<dt>Stage<\/dt><dd>Work lead · Integration and checks<\/dd>/u);
    assert.match(html, /<dt>Status<\/dt><dd>integrating<\/dd>/u);
    assert.match(html, /<dt>Goal<\/dt><dd>source &lt;port&gt;<\/dd>/u);
});

test('progress points carry what the chart readout shows', t => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-chart-'));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    // Measurements ten minutes apart share one commit. Their recorded times
    // must set the chart range, independent of Git's single commit time.
    const measured = commit(fixture, 'Implementation', '2026-01-01T00:00:00Z');

    writeFileSync(join(fixture, 'SCORE.tsv'), [
        SCORE_HEADER,
        scoreRow({
            utc: '2026-01-01T00:10:00Z', sha: measured, event: 'goal',
            screens: 40, holdoutScreens: 0, holdoutScreensTotal: 10,
            note: 'alpha closes. Second sentence.',
        }),
        scoreRow({
            utc: '2026-01-01T00:20:00Z', sha: measured, event: 'goal',
            screens: 55, holdoutScreens: 0, holdoutScreensTotal: 10,
            note: 'beta closes. Second sentence.',
        }),
        scoreRow({
            utc: '2026-01-01T00:30:00Z', sha: measured, event: 'goal',
            screens: 55, holdoutScreens: 0, holdoutScreensTotal: 10,
            note: 'gamma closes. Second sentence.',
        }),
        '',
    ].join('\n'));

    const data = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture,
        encoding: 'utf8',
    }));

    // Historical score points retain their original goal labels.
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
    // The requested week is clamped to twenty minutes of available data;
    // keep the requested duration distinct from the actual plotted bounds.
    assert.equal(rendered.get('progressWindow').value, '7');
    assert.equal(
        rendered.get('progressRange').textContent,
        ['2026-01-01T00:10:00Z', '2026-01-01T00:30:00Z'].map(iso => {
            const time = new Date(iso);
            return time.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                + ' ' + time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        }).join(' – '),
    );

    // The minimap's window is the only rectangle it strokes. On the whole
    // range it covers the whole track: the stub canvas is 1000 wide, and the
    // chart's 52px left and 16px right margins are shared with the plot above.
    const [, x, y, width, height] = rendered.get('progressMinimap').ops
        .find(([operation]) => operation === 'strokeRect');
    assert.deepEqual([x, y, width], [52.5, 0.5, 1000 - 52 - 16]);
    // The single selection spans two 44px traces and excludes their date labels.
    assert.equal(height, 2 * 44 - 1);
});

test('score history sums public and holdout progress into one development set', t => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-history-'));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    // Three kinds of score event share a commit but have separate measurement
    // times. The holdout was measured only on the first event, with zero hits.
    const sha = commit(fixture, 'Implementation', '2026-01-01T00:00:00Z');
    const events = ['goal', 'span', 'divergence'];
    const dates = ['2026-01-01T00:10:00Z', '2026-01-01T00:20:00Z', '2026-01-01T00:30:00Z'];
    const hits = [0, 40, 55]; // A measured zero, a gain, then a later gain.
    writeFileSync(join(fixture, 'SCORE.tsv'), [
        SCORE_HEADER,
        ...events.map((event, i) => scoreRow({
            utc: dates[i], sha, event, screens: hits[i],
            holdoutScreens: i === 0 ? 0 : undefined,
            holdoutScreensTotal: i === 0 ? 100 : undefined, // Same fixed corpus size as development.
            note: `alpha ${event}.`,
        })),
        '',
    ].join('\n'));
    const data = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture, encoding: 'utf8',
    }));
    const [development, challenges] = data.scoreHistory;
    assert.equal(development.title, 'Development set');
    assert.deepEqual(development.points.map(point => point.screens), hits);
    assert.deepEqual(development.points.map(point => point.screensTotal), [200, 200, 200]);
    assert.deepEqual(development.points.map(point => point.utc), dates.map(date => new Date(date).toISOString()));
    assert.deepEqual(challenges.points, []);
    const rendered = renderDashboard(data);
    const readout = rendered.get('progressReadout').innerHTML.replace(/<[^>]*>/gu, '');
    assert.match(readout, /55\/200·27.5%/);
    assert.match(readout, /ago/);
    assert.doesNotMatch(readout, /earlier/);
});

test('the chart opens on the last week of measurements', () => {
    // Rendering depends on measured points, not a Git repository. The CLI
    // tests above cover conversion from SCORE.tsv into this shape.
    const data = sourceDashboardData();
    // Four measurements span 24 days; only the last two are in the last week.
    const days = ['2026-01-01', '2026-01-10', '2026-01-20', '2026-01-25'];
    data.scoreHistory[0].points = days.map((day, index) => ({
        utc: `${day}T00:00:00Z`, screens: 10 * (index + 1), screensTotal: 110,
        note: `goal${index} closes.`, // Increasing scores keep all points visible.
    }));

    const rendered = renderDashboard(data);
    // 25 Jan is the newest goal, so the opening window runs back to 18 Jan and
    // holds the goals of 20 and 25 Jan.
    assert.equal(
        rendered.get('progressRange').textContent,
        ['2026-01-18T00:00:00Z', '2026-01-25T00:00:00Z'].map(time => new Date(time)
            .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })).join(' – '),
    );
    // The two older goals are off-window, so the range control shows 7d.
    assert.equal(rendered.get('progressWindow').value, '7');

    // The minimap still covers the whole 24 days, so its window is now a
    // fraction of the track: 7 of 24 days across the 932px between the
    // chart's 52px left and 16px right margins.
    const [, x, , width] = rendered.get('progressMinimap').ops
        .find(([operation]) => operation === 'strokeRect');
    const track = 1000 - 52 - 16;
    assert.equal(width, Math.round(track * 7 / 24));
    assert.equal(x, Math.round(52 + track * 17 / 24) + 0.5);
});

test('dashboard builder preserves replacement-pattern text in injected JSON', () => {
    const html = injectDashboardData(
        '<script>const DATA = /*DATA_PLACEHOLDER*/null; '
            + 'const QUEUE = /*QUEUE_PLACEHOLDER*/null;</script>',
        '{"branch":"\'$\'; otherwise !fixinv"}',
        '{"branch":"\'$\'; otherwise !fixinv"}',
    );
    assert.equal((html.match(/<script>/gu) || []).length, 1);
    assert.equal((html.match(/<\/script>/gu) || []).length, 1);
    assert.match(html, /"branch":"'\$'; otherwise !fixinv"/u);
});

test('dashboard JSON escapes script closing markup', () => {
    const escaped = escapeJsonForScript('{"title":"</script><script>owned"}');
    assert.equal(escaped, '{"title":"\\u003c/script\\u003e\\u003cscript\\u003eowned"}');
});

test('challenge session counts describe measured cases when the catalog has grown', () => {
    const data = sourceDashboardData();
    // Two measured cases among three admitted cases; only one passes.
    const result = { sha: 'a'.repeat(40), utc: '2026-01-01T00:00:00Z',
        screens: { matched: 1, total: 2 }, passed: false };
    data.challenges = { status: 'stale', sha: result.sha, utc: result.utc,
        manifestSha256: 'b'.repeat(64), changes: null,
        totals: { sessions: { matched: 1, total: 2 }, screens: { matched: 3, total: 4 } },
        cases: [
            { id: 'one', title: 'One', first: result, current: result },
            { id: 'two', title: 'Two', first: result, current: { ...result, passed: true } },
            { id: 'new', title: 'New', first: null, current: null },
        ] };
    const stats = renderDashboard(data).get('stats').innerHTML;
    assert.doesNotMatch(stats, /Cases evaluated|Manifest/u);
    assert.match(stats.replace(/<[^>]*>/gu, ''), /Sessions1 \/ 2/u);
});


test('incomplete screen scores cannot round to a displayed 100 percent', () => {
    const data = sourceDashboardData();
    // One missing screen in ten thousand used to round to a false 100.0%.
    data.challenges.totals = {screens: {matched: 9999, total: 10000}};
    const partial = renderDashboard(data).get('stats').innerHTML;
    assert.match(partial, /stat-value">>99\.9%/u);
    assert.match(partial, /1 screen unmatched/u);
    data.challenges.totals.screens.matched = 10000;
    assert.match(renderDashboard(data).get('stats').innerHTML, /stat-value">100%/u);
});

test('goal history prints a shared score once and escapes member details', () => {
    const data = sourceDashboardData();
    // Two goals share a measured integration with both gains and losses.
    data.goalHistory = [{commit: 'a'.repeat(40), publishedAt: '2026-10-14T10:00:00Z',
        assignedAt: '2026-10-14T09:00:00Z', synthetic: {gained: 346, lost: 2},
        goals: ['first', 'second'].map(id => ({id, summary: 'Fix <caller>', sourceFile: 'hack.c',
            workers: ['A2'], assignedAt: '2026-10-14T09:00:00Z', status: 'closed', developmentDelta: null}))}];
    const html = renderDashboard(data).get('goalTable').innerHTML;
    assert.equal((html.match(/\+346 \/ −2/gu) || []).length, 1);
    assert.match(html, /2 goals · shared result/u);
    assert.equal((html.match(/class="goal-title">Fix &lt;caller&gt;/gu) || []).length, 2);
    assert.match(html, /Worker A/u);
    assert.doesNotMatch(html, /<th>Worker/u);
    assert.doesNotMatch(html, /<th>Assigned|<th>Development/u);
});


test('integration backlog counts submitted implementation and Prep work separately', () => {
    const data = sourceDashboardData();
    // Two ready implementations (one blocked) and one ready Prep batch wait
    // for integration. Running checks, corrections and accepted batches do not.
    const row = {worker: 'B', kind: 'implementation', status: 'ready', since: '2026-10-14T10:00:00Z', blockedBy: []};
    data.activity = {capturedAt: '2026-10-14T11:00:00Z', segments: [], tasks: []};
    data.pendingMainWork = {deliveries: [
        {...row, task: 'ready'}, {...row, task: 'blocked', blockedBy: ['ready']},
        {...row, task: 'prep', kind: 'challenge-preparation', batch: 'v1'},
        {...row, task: 'checks', status: 'integrating'}, {...row, task: 'rework', status: 'changes-required'},
    ], preparedBatches: [{...row, task: 'accepted', kind: 'challenge-preparation', batch: 'v2', status: 'awaiting-admission'}], parkedTasks: []};
    const html = renderDashboard(data).get('pendingMainWork').innerHTML;
    assert.match(html, /Awaiting integration: <strong>2 implementation tasks<\/strong> · <strong>1 challenge batch<\/strong>/u);
    assert.match(html, /Batches to admit · 1/u);
});

test('session heading keeps pending work and moves counts and provenance into details', () => {
    const data = sourceDashboardData();
    // One incomplete case keeps the heading singular; its initial/total data
    // and saved execution commit remain available outside the heading.
    data.challenges.cases = [{id: 'pending', current: {passed: false}}];
    const rendered = renderDashboard(data);
    assert.equal(rendered.get('sessionSummary').textContent, '1 session needs work');
    assert.doesNotMatch(rendered.get('sessionSummary').textContent, /measured|excluded|candidate|development/u);
    assert.match(rendered.get('sessionMeasurementInfo').textContent, /1 of 1 synthetic sessions remaining/u);
    assert.match(rendered.get('sessionMeasurementInfo').textContent, /development measured at aaaaaaaa/u);
});

test('integration headers prefer exact group publication over recovered bounds', () => {
    const data = sourceDashboardData();
    // A shared group's exact event and its sibling's recovered bound agree.
    // A second historical group has only a confirmation, which stays explicit.
    const group = {commit: 'a'.repeat(40), assignedAt: '2026-10-14T09:00:00Z',
        publishedAt: '2026-10-14T10:00:00Z', publicationKnownBy: '2026-10-14T10:00:00Z', goals: []};
    data.goalHistory = [group];
    let html = renderDashboard(data).get('goalTable').innerHTML;
    assert.doesNotMatch(html, /By |Confirmed /u);
    data.goalHistory = [{...group, publishedAt: null}];
    html = renderDashboard(data).get('goalTable').innerHTML;
    assert.match(html, /Confirmed /u);
});


test('activity navigator draws only Main stages using their stage colors', () => {
    const data = sourceDashboardData();
    // A worker assignment overlaps Main's checks; the overview must draw the
    // Main band once rather than stack both agents into a gray silhouette.
    const at = minute => new Date(Date.UTC(2026, 9, 14, 10, minute)).toISOString();
    data.activity = {capturedAt: at(20), tasks: [], segments: [
        {task: 'checks', lane: 'Main', phase: 'integrating', start: at(0), end: at(10)},
        {task: 'work', lane: 'A', phase: 'working', start: at(0), end: at(20)},
    ]};
    const ops = renderDashboard(data).get('activityMinimap').ops;
    assert.equal(ops.filter(([call, , y, , height]) => call === 'fillRect' && y === 12 && height === 18).length, 1);
    assert.ok(ops.some(([call, key, value]) => call === 'set' && key === 'fillStyle' && value === '--stage-integrating'));
});

test('batch browsing is newest first, searchable, and preserves visibility choices',()=>{
    const data=sourceDashboardData();
    data.scoreHistory=[data.scoreHistory[0],...[1,9,95].map(n=>({id:'syntheticHoldout-v'+n,title:'Batch v'+n,points:[]}))];
    const rendered=renderDashboard(data),options=rendered.get('historyBatchOptions'),search=rendered.get('historyBatchSearch');
    const order=options.innerHTML;
    assert.ok(order.indexOf('v95</span>')<order.indexOf('v9</span>'));
    assert.ok(order.indexOf('v9</span>')<order.indexOf('v1</span>'));
    search.value='v9';search.listeners.input[0]();
    assert.match(options.innerHTML,/v95<\/span>/);assert.match(options.innerHTML,/v9<\/span>/);
    assert.doesNotMatch(options.innerHTML,/v1<\/span>/);
    options.listeners.change[0]({target:{dataset:{series:'syntheticHoldout-v95'},checked:false}});
    search.value='';search.listeners.input[0]();
    assert.match(options.innerHTML,/data-series="syntheticHoldout-v95"><span>v95/);
    rendered.get('historyBatchLatest').listeners.click[0]();
    assert.equal(search.value,'v95');assert.match(rendered.get('historyBatchCount').textContent,/1 of 3/);
    const picker=rendered.get('historyBatchPicker');picker.open=true;
    picker.listeners.keydown[0]({key:'Escape',preventDefault(){}});assert.equal(picker.open,false);
    picker.open=true;const date=rendered.get('progressRangePicker');date.open=true;
    for(const fn of date.listeners.toggle)fn();assert.equal(picker.open,false);
});

test('recorded preparation waits have explicit stage and lifespan labels',()=>{
    const data=sourceDashboardData();
    data.activity=activityTimeline({events:[
        {type:'assign',task:'prep-v96-source',worker:'Prep',kind:'challenge-preparation',batch:'v96',at:'2026-10-16T12:00:00Z'},
        {type:'activity',task:'prep-v96-source',phase:'waiting',reason:'Await source findings.',at:'2026-10-16T13:00:00Z'},
    ]},'2026-10-16T14:00:00Z');
    const rendered=renderDashboard(data),index=data.activity.stages.findIndex(r=>r.phase==='waiting');
    rendered.get('timeline').listeners.click[0]({target:{classList:{contains:v=>v==='activity-bar'},dataset:{segment:String(index)}}});
    const html=rendered.get('timelineReadout').innerHTML;
    assert.match(html,/<dt>Stage<\/dt><dd>Work lead · Waiting \(reported\)<\/dd>/);
    assert.match(html,/Reported wait: /);assert.match(html,/prep-v96-source/);
    assert.doesNotMatch(html,/undefined|<dt>Stage<\/dt><dd><\/dd>/);
});


test('single engineer renders and refreshes in the existing timeline without enabling retired lanes', () => {
    const load = file => JSON.parse(readFileSync(join(PROJECT_ROOT, 'trial-monitor', file), 'utf8'));
    const snapshot = {manifest: load('manifest.json'), register: load('repairs.json'),
        buildSha: 'f'.repeat(40), builtAt: '2026-10-22T03:00:00Z'};
    const rendered = renderDashboard(sourceDashboardData(), null, {showHistorical: false, singleWorkerData: snapshot});
    const timeline = rendered.get('timeline');
    // Historical assertions must not depend on the latest six-hour window.
    rendered.get('activityWindow').value = 'all';
    rendered.get('activityWindow').listeners.change[0]();
    assert.match(timeline.innerHTML, /CI validation for Dismiss/);
    assert.doesNotMatch(timeline.innerHTML, /activity-label">Work lead/);
    // The visible range advances as real repairs are recorded. Select this
    // exact historical run instead of assuming it remains the initial selection.
    const stages = singleWorkerActivity(createTrialMonitor(snapshot).summarize()).stages;
    const index = stages.findIndex(stage => stage.links?.some(link => link.url.includes('/39705972360/')));
    assert.ok(index >= 0);
    timeline.listeners.click[0]({target: {classList: {contains: name => name === 'activity-bar'}, dataset: {segment: String(index)}}});
    assert.match(rendered.get('timelineReadout').innerHTML, /Investigation timestamps unknown/);
    assert.match(rendered.get('timelineReadout').innerHTML, /actions\/runs\/39705972360\/attempts\/1/);
    assert.equal(rendered.get('activityMetrics').hidden, true);
    snapshot.register.repairs.find(repair => repair.id === 'vault-silent-guard').investigations = [{start: '2026-10-22T02:10:00Z', end: '2026-10-22T02:15:00Z', note: 'C witness'}];
    rendered.refreshSnapshot(snapshot);
    assert.match(timeline.innerHTML, /Recorded investigation for Dismiss/);
    assert.equal((timeline.innerHTML.match(/activity-row/g) || []).length, 1);
    assert.equal(timeline.listeners.click.length, 1, 'refresh does not duplicate handlers');
});

test('full startup renders scores, charts, recent repairs and final history with only real DOM IDs', () => {
    const load = file => JSON.parse(readFileSync(join(PROJECT_ROOT, 'trial-monitor', file), 'utf8'));
    const snapshot = {manifest: load('manifest.json'), register: load('repairs.json'),
        buildSha: 'f'.repeat(40), builtAt: '2026-10-22T03:00:00Z'};
    const data = sourceDashboardData();
    data.scoreHistory[0].points = [{utc: '2026-10-22T03:00:00Z', screens: 44, screensTotal: 44}];
    const rendered = renderDashboard(data, null, {singleWorkerData: snapshot, showHistorical: false});
    assert.equal(rendered.has('yieldRangePicker'), false);
    assert.match(rendered.get('stats').innerHTML, /Development set/);
    assert.match(rendered.get('progressReadout').textContent, /44\/44/);
    assert.ok(rendered.get('developmentChart').ops.some(([operation]) => operation === 'stroke'));
    assert.match(rendered.get('timeline').innerHTML, /Standard engineer/);
    for (const id of ['updated', 'activitySnapshotTime', 'workerEvidence'])
        assert.equal(rendered.has(id), false, 'removed disclosure is not required during startup');
    const accepted = singleWorkerActivity(createTrialMonitor(snapshot).summarize()).tasks
        .filter(task => task.publishedAt).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    const rows = rendered.get('recentRepairs').children;
    assert.equal(rows.length, Math.min(5, accepted.length));
    assert.deepEqual(rows.map(row => row.children[0].textContent), accepted.slice(0, 5).map(task => task.label));
    assert.match(rendered.get('repairCount').textContent, new RegExp('^' + accepted.length + ' registered'));
    assert.match(rendered.get('trialFreshness').textContent, /CI: last-known snapshot/);
    assert.match(rendered.get('goalTable').innerHTML, /Synthetic Δ/);
    for (const id of ['activityRangePicker', 'progressRangePicker']) {
        const picker = rendered.get(id), batches = rendered.get('historyBatchPicker');
        picker.open = true;
        batches.open = true;
        for (const listener of picker.listeners.toggle) listener();
        assert.equal(batches.open, false, `${id} closes the batch selector`);
    }
});

function refreshTestSnapshot() {
    const manifest = JSON.parse(readFileSync(join(PROJECT_ROOT, 'trial-monitor/manifest.json'), 'utf8'));
    const sha = 'a'.repeat(40);
    manifest.operations.currentCandidate = {repairId: 'refresh-evidence', sha};
    return {manifest, buildSha: 'f'.repeat(40), builtAt: '2026-01-01T00:00:00Z',
        register: {version: 1, asOf: '2026-01-01T00:00:00Z', repairs: [{
            id: 'refresh-evidence', title: 'Refresh evidence', kind: 'parity-repair', window: 'single-worker',
            evidence: {source: ['source'], witness: ['witness'], test: ['test']},
            candidates: [{sha, runs: []}],
        }]}};
}

function refreshTestResponse(url, snapshot) {
    const encode = value => ({encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64')});
    const payload = url.includes('/manifest.json?') ? encode(snapshot.manifest)
        : url.includes('/repairs.json?') ? encode(snapshot.register)
            : {workflow_runs: [{id: 900, name: 'Checkpoint', head_sha: 'a'.repeat(40),
                run_attempt: 1, event: 'push', head_branch: 'integration-checkpoint/test',
                status: 'queued', conclusion: null, created_at: '2026-01-01T00:00:00Z'}]};
    return {ok: true, json: async () => payload};
}
const finishRefresh = () => new Promise(resolve => setImmediate(resolve));

test('real refresh handler fetches, applies, reports unchanged, and ignores repeated clicks', async () => {
    const snapshot = refreshTestSnapshot();
    const calls = [];
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const rendered = renderDashboard(sourceDashboardData(), null, {
        showHistorical: false, singleWorkerData: snapshot,
        fetchPublic: async (url, init) => {
            calls.push({url, init});
            await held;
            return refreshTestResponse(url, snapshot);
        },
    });
    const button = rendered.get('trialRefresh');
    const click = button.listeners.click[0];
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, 'Refreshing…');
    assert.match(rendered.get('trialRefreshStatus').textContent, /Checking/u);
    await click();
    await click();
    assert.equal(calls.length, 3, 'repeated clicks do not duplicate the page-open transaction');
    release();
    await finishRefresh();
    assert.equal(button.disabled, false);
    assert.equal(rendered.get('trialRefreshStatus').textContent, 'Status updated.');
    assert.match(rendered.get('timeline').innerHTML, /CI validation for Refresh evidence/u);
    assert.match(rendered.get('trialFreshness').textContent, /stale/u, 'successful fetch does not freshen old activity');
    assert.doesNotMatch(rendered.get('trialFreshness').textContent, /last-known/u);
    await click();
    assert.equal(calls.length, 6);
    assert.equal(rendered.get('trialRefreshStatus').textContent, 'Already up to date.');
    assert.equal(button.listeners.click.length, 1);
    assert.ok(calls.every(({init}) => init.cache === 'no-store' && !('Authorization' in init.headers)));
    assert.equal(rendered.has('trialApiFresh'), false);
    assert.equal(rendered.has('trialBuildFresh'), false);
    assert.equal(rendered.has('trialManifestFresh'), false);
});

test('refresh retains rendered evidence when any required source fails and permits recovery', async () => {
    for (const failedPath of ['/manifest.json?', '/repairs.json?', '/actions/runs?']) {
        const snapshot = refreshTestSnapshot();
        let failed = false;
        const rendered = renderDashboard(sourceDashboardData(), null, {
            showHistorical: false, singleWorkerData: snapshot,
            fetchPublic: async url => failed && url.includes(failedPath)
                ? {ok: false, status: 503} : refreshTestResponse(url, snapshot),
        });
        await finishRefresh();
        const before = rendered.get('timeline').innerHTML;
        snapshot.register.repairs[0].title = 'Must not partially apply';
        failed = true;
        await rendered.get('trialRefresh').listeners.click[0]();
        assert.equal(rendered.get('timeline').innerHTML, before);
        assert.match(rendered.get('trialFreshness').textContent, /stale.*last-known snapshot/u);
        assert.match(rendered.get('trialRefreshStatus').textContent, /Could not refresh.*Try again or reload/u);
        assert.equal(rendered.get('trialRefresh').disabled, false);
        failed = false;
        await rendered.get('trialRefresh').listeners.click[0]();
        assert.match(rendered.get('timeline').innerHTML, /Must not partially apply/u);
        assert.equal(rendered.get('trialRefreshStatus').textContent, 'Status updated.');
    }
});

test('unknown activity dates stay unknown and missing register disables misleading refresh', async () => {
    const snapshot = refreshTestSnapshot();
    snapshot.register.asOf = null;
    const rendered = renderDashboard(sourceDashboardData(), null, {singleWorkerData: snapshot});
    await finishRefresh();
    assert.match(rendered.get('trialFreshness').textContent, /Recorded activity: unknown/u);
    const missing = renderDashboard(sourceDashboardData());
    assert.equal(missing.get('trialRefresh').disabled, true);
    assert.match(missing.get('trialRefreshStatus').textContent, /unavailable.*Reload/u);
});

test('full startup keeps the published synthetic aggregate visible with measurement provenance', () => {
    const data = sourceDashboardData();
    data.challenges = { ...data.challenges, status: 'stale', totals: {
        screens: { matched: 301862, total: 301874 }, sessions: { matched: 2051, total: 2055 },
        rng: { matched: 7200426, total: 7200426 }, cursors: { matched: 301865, total: 301874 },
    }, publication: { sha: 'b'.repeat(40), measuredThrough: '2026-10-22T07:00:00Z',
        checkpoint: { id: 123 }, fresh: false, datasetMatches: true, batches: 98 } };
    const rendered = renderDashboard(data), html = rendered.get('stats').innerHTML;
    assert.match(html, /301,862\/301,874 screens matched/);
    assert.ok(html.includes('Measured ' + createDashboardTime().stamp(data.challenges.publication.measuredThrough)));
    assert.match(html, /Revision bbbbbbbb/);
    assert.match(html, /actions\/runs\/123/);
    assert.match(html, /Earlier measurement — newer evaluation status unknown/);
    assert.doesNotMatch(html, /Needs evaluation|Oldest measured commit/);
    assert.ok(rendered.get('goalTable').innerHTML, 'initialization reaches final history');
});
