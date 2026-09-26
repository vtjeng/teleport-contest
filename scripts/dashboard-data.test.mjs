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
import { COLUMNS } from './score-log.mjs';
import { escapeJsonForScript, injectDashboardData } from './build-dashboard.mjs';

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

function renderDashboard(data, queue = null) {
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
            outerHTML: '',
            textContent: '',
            className: '',
            disabled: false,
            checked: false,
            hidden: false,
            style: {},
            listeners: {},
            classList: { add() {}, remove() {} },
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
            getBoundingClientRect: () => ({ width: 1000, left: 0, top: 0, height: 0 }),
            getContext: () => context(ops),
            addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
            setAttribute() {},
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
        .replace('/*DATA_PLACEHOLDER*/null', JSON.stringify(data))
        .replace('/*QUEUE_PLACEHOLDER*/null', JSON.stringify(queue));
    const document = {
        documentElement: {},
        getElementById: element,
        createElement: (tag) => makeElement(tag),
        querySelectorAll: () => [],
    };
    const window = {
        addEventListener: () => {},
        matchMedia: () => ({ addEventListener() {} }),
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

function sourceDashboardData(workGoals = []) {
    // No score or timing history is needed to render the queue and source
    // tables. Unit totals keep the unrelated percentage tiles well-defined.
    return {
        summary: {
            generatedAt: '2026-01-01T00:00:00Z',
            screens: 0, screensTotal: 1, rng: 0, rngTotal: 1,
            sessions: 0, sessionsTotal: 1, totalGoals: 0,
            medianTotalMin: null, medianGoalSelectionMin: null,
        },
        goals: [], progress: [], workGoals,
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
    assert.match(rendered.get('sessionSummary').textContent, /2 of 3 synthetic sessions remaining/u);
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
        /2 of 2 synthetic sessions remaining/u);
    assert.match(rendered.get('challengeTable').innerHTML, /Pending evaluation/u);
    assert.match(rendered.get('challengeTable').innerHTML, /Incomplete metrics/u);
});

test('score rows expose named development and local holdout measures', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-scores-'));
    git(fixture, ['init', '--quiet']);
    git(fixture, ['config', 'user.name', 'Dashboard Test']);
    git(fixture, ['config', 'user.email', 'dashboard@example.invalid']);
    commit(fixture, 'Baseline', '2026-01-01T00:00:00Z');
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

test('primary dashboard sections put sessions before activity and historical detail', () => {
    const template = readFileSync(TEMPLATE, 'utf8');
    const positions = ['id="stats"', 'id="scoreHistoryTitle"', 'id="challengeTitle"',
        'class="diagnostics"', 'id="sourceWorkDisclosure"', 'id="timeline"',
        'id="goalTable"', 'id="remainingWorkDisclosure"']
        .map(marker => template.indexOf(marker));
    assert.ok(positions.every(position => position >= 0));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    assert.doesNotMatch(template, /id="queueDisclosure"|Known mismatches|<h2[^>]*>Challenges<\/h2>/u);
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
    assert.match(rendered.get('sessionSummary').textContent,
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
});

function sourceFileRows(table) {
    return new Map([...table.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gsu)].map(([, row]) => {
        const cells = [...row.matchAll(/<td\b[^>]*>(.*?)<\/td>/gsu)].map(([, cell]) => cell);
        return [cells[0], cells.slice(1)];
    }).filter(([file]) => file !== undefined));
}

test('source ports deduplicate overlapping C units and include whole Lua programs', () => {
    // The two C goals overlap on test_move. Its older verified evidence must
    // remain counted when the later goal lists it without new verification.
    const ports = [
        { id: 'movement-first', sourceFile: 'hack.c', status: 'closed',
            units: [{ name: 'test_move', verified: true }, { name: 'moverock', verified: true }],
            spansClosed: 1, spansTotal: 1, screensDelivered: 0 },
        { id: 'movement-rest', sourceFile: 'hack.c', status: 'open',
            units: [{ name: 'test_move', verified: false }, { name: 'domove', verified: false }],
            spansClosed: 0, spansTotal: 1, screensDelivered: null },
        // Lua uses its source basename as one program, not a C function count.
        { id: 'quest-level', sourceFile: 'Arc-loca.lua', status: 'closed',
            units: [{ name: 'Arc-loca.lua', verified: true }],
            spansClosed: 1, spansTotal: 1, screensDelivered: 0 },
        // A parked source goal remains inventory without appearing closed or
        // in progress. Its declaration has no verified evidence.
        { id: 'parked-options', sourceFile: 'options.c', status: 'parked',
            units: [{ name: 'parseoptions', verified: false }],
            spansClosed: 0, spansTotal: 0, screensDelivered: null },
    ];
    const table = renderDashboard(sourceDashboardData(ports)).get('sourceWorkTable').innerHTML;
    // Three distinct C units, two verified, across two goals; summing the
    // goals' unit counts would incorrectly report four units.
    assert.deepEqual(sourceFileRows(table).get('hack.c'), ['1', '', '1', '2', '3']);
    assert.deepEqual(sourceFileRows(table).get('Arc-loca.lua'), ['', '', '1', '1', '1']);
    assert.deepEqual(sourceFileRows(table).get('options.c'), ['', '1', '', '0', '1']);
    assert.match(table, /<summary>Functions \/ programs<\/summary>/u);
    assert.match(table, /<strong>Listed:<\/strong> distinct C functions or whole Lua programs/u);
});

test('source inventory includes fixes and parked goals without a live-work panel', () => {
    // A fix shares its file with a closed port and a parked goal; another
    // parked goal lacks a source owner. Status must not depend on goal kind
    // or on a corresponding Open commit in the historical timeline.
    const work = [
        { id: 'old-port', kind: 'file-port', sourceFile: 'fountain.c', status: 'closed',
            summary: 'Implement fountains', units: [{ name: 'drinkfountain', verified: true }] },
        { id: 'gem-fix', kind: 'divergence-fix', sourceFile: 'fountain.c', status: 'open',
            summary: 'Fix gem discovery <&>', units: [] },
        { id: 'paused-fountain', sourceFile: 'fountain.c', status: 'parked',
            summary: 'Finish fountains', parkedReason: 'Waiting for <caller>', units: [] },
        { id: 'unknown', sourceFile: null, status: 'parked',
            summary: 'Investigate a mismatch', parkedReason: 'Find its source', units: [] },
        { id: 'new-file', sourceFile: 'dog.c', status: 'open',
            summary: 'Fix pet movement', units: [] },
    ];
    const rendered = renderDashboard(sourceDashboardData(work));
    const table = rendered.get('sourceWorkTable').innerHTML;
    assert.match(table, /class="in-progress"><td>fountain\.c<\/td>/u);
    assert.deepEqual(sourceFileRows(table).get('fountain.c'), ['1', '1', '1', '1', '1']);
    assert.match(table, /class="in-progress"><td>dog\.c<\/td>/u);
    assert.deepEqual(sourceFileRows(table).get('dog.c'), ['1', '', '', '0', '0']);
    assert.doesNotMatch(rendered.get('stats').innerHTML, /Source-port|Goals closed|Goal selection/u);
});

test('queued goals remain visible in the source inventory', () => {
    for (const work of [[], [
        { id: 'finished', sourceFile: 'hack.c', status: 'closed', units: [] },
        { id: 'next', sourceFile: 'dog.c', status: 'queued', units: [] },
    ]]) {
        const rendered = renderDashboard(sourceDashboardData(work));
        if (work.length) {
            assert.deepEqual(sourceFileRows(rendered.get('sourceWorkTable').innerHTML).get('dog.c'),
                ['', '', '1', '', '0', '0']); // Only the queued column counts this goal.
            assert.match(rendered.get('sourceWorkLegend').innerHTML, /Queued/u);
        }
    }
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
            screens: 40, holdoutScreens: 0, holdoutScreensTotal: 10,
            note: 'alpha closes. Second sentence.',
        }),
        scoreRow({
            utc: '2026-01-01T00:20:00Z', sha: second, event: 'goal',
            screens: 55, holdoutScreens: 0, holdoutScreensTotal: 10,
            note: 'beta closes. Second sentence.',
        }),
        scoreRow({
            utc: '2026-01-01T00:30:00Z', sha: third, event: 'goal',
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
    // Twenty minutes of goals is less than the week the chart opens on, so it
    // shows all measurements and the range control shows All.
    assert.equal(rendered.get('progressWindow').value, 'all');
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

test('score history sums public and holdout progress into one development set', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'teleport-dashboard-history-'));
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
            holdoutScreens: 0,
            holdoutScreensTotal: 10,
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
