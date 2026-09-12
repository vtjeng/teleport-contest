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
import { escapeJsonForScript } from './build-dashboard.mjs';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_SCRIPT = join(PROJECT_ROOT, 'scripts', 'dashboard-data.mjs');
const BUILD_SCRIPT = join(PROJECT_ROOT, 'scripts', 'build-dashboard.mjs');
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
            style: {},
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
        scores: {
            headSha: null,
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
    data.scores.development.commitUtc = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rendered = renderDashboard(data);
    const stats = rendered.get('stats').innerHTML;
    assert.deepEqual([...stats.matchAll(/class="score-card-title">([^<]+)/gu)]
        .map(match => match[1]), ['Development', 'Local holdout', 'Challenges']);
    assert.match(stats, /Commit 1h 0m ago/u);
    assert.match(stats, />80.0%</u);
    assert.match(stats, />66.7%</u);
    assert.match(stats, />Failed</u);
    assert.match(stats, /runner failed: &lt;details&gt;/u);
    assert.doesNotMatch(stats, /Incomplete|combined only|Cases evaluated|Manifest|bbbbbbb|ccccccc|ddddddd/u);
    const table = rendered.get('challengeTable').innerHTML;
    assert.match(table, /Nested &lt;box&gt;/u);
    assert.match(table, /container/u);
    assert.match(table, /title="f{40}">fffffff/u);
    assert.match(table, /2026-01-01 00:00Z/u);
    assert.match(table, /invent\.c:12 &lt;tip&gt;/u);
    assert.doesNotMatch(table, /<th>Added<\/th>/u);
    assert.doesNotMatch(table, /<box>|<tip>/u);
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
    assert.deepEqual(data.scores.development.sessions, { matched: 3, total: 4 });
    assert.deepEqual(data.scores.localHoldout.sessions, { matched: 1, total: 2 });
    assert.deepEqual(data.scores.development.cursors, { matched: 7, total: 8 });
    assert.deepEqual(data.scores.localHoldout.cursors, { matched: 2, total: 3 });
    assert.equal(data.scores.development.commitUtc, '2026-01-01T00:10:00+00:00');
    assert.equal(data.scores.localHoldout.commitUtc, data.scores.development.commitUtc);
    assert.equal(data.scores.development.utc, '2026-01-01T00:15:00Z');

    commit(fixture, 'Later implementation change', '2026-01-01T00:20:00Z');
    const stale = JSON.parse(execFileSync(process.execPath, [DATA_SCRIPT], {
        cwd: fixture, encoding: 'utf8',
    }));
    assert.equal(stale.scores.development.status, 'stale');
    assert.equal(stale.scores.localHoldout.status, 'stale');
});

test('the unified queue renders C, Lua, and unresolved source owners in priority order', () => {
    // Synthetic remaining counts order a C blocker, Lua loader, and unknown
    // owner. The unknown step must remain unknown rather than becoming zero.
    const queue = {
        roadmapFallbackAllowed: false,
        sessions: [
            { session: 'movement', step: 2, kind: 'stop', sourceFile: 'hack.c',
                function: 'test_move', line: 42, recordedSteps: 10,
                remainingScreensUpperBound: 8 },
            { session: 'quest', step: 1, kind: 'stop', sourceFile: 'Arc-loca.lua',
                function: null, line: null, recordedSteps: 9,
                remainingScreensUpperBound: 6 },
            { session: 'unknown-owner', step: null, kind: 'unresolved', sourceFile: null,
                message: 'Find <source> & "caller"', recordedSteps: 4,
                remainingScreensUpperBound: 4 },
        ],
        candidates: [
            { sourceFile: 'hack.c', remainingScreensUpperBound: 8 },
            { sourceFile: 'Arc-loca.lua', remainingScreensUpperBound: 6 },
            { sourceFile: null, sessions: ['unknown-owner'], remainingScreensUpperBound: 4 },
        ],
    };
    const element = renderDashboard(sourceDashboardData(), queue).get('queueTable');
    const table = element.innerHTML;
    assert.match(table, /title="hack\.c:42">test_move\(\) in hack\.c</u);
    assert.match(table, /title="Arc-loca\.lua">Arc-loca\.lua</u);
    assert.match(table, /step unknown/u);
    assert.match(table, /title="Find &lt;source> &amp; &quot;caller&quot;">source investigation</u);
    assert.match(table, /<th>Screens after mismatch<\/th>/u);
    assert.match(table, /<td>8 of 10<\/td>/u);
    // Rows follow the goal order, not the step order: quest breaks at step 1
    // but its owner ranks second, so the footer no longer restates the order.
    assert.match(table, /movement[\s\S]*quest[\s\S]*unknown-owner/u);
    assert.doesNotMatch(table, /Every development session matches/u);
});

test('an unavailable mismatch queue differs from a confirmed empty queue', () => {
    // Null is the builder's failure value; absent sessions and an empty scan
    // without fallback permission also provide no evidence of completion.
    for (const queue of [null, {}, { sessions: [], roadmapFallbackAllowed: false }]) {
        const table = renderDashboard(sourceDashboardData(), queue).get('queueTable').outerHTML;
        assert.match(table, /Mismatch queue unavailable; completion is unknown/u);
        assert.doesNotMatch(table, /Every development session matches/u);
    }
    const table = renderDashboard(sourceDashboardData(), {
        sessions: [], candidates: [], roadmapFallbackAllowed: true,
    }).get('queueTable').outerHTML;
    assert.match(table, /Every development session matches/u);
    assert.doesNotMatch(table, /unavailable|unknown/u);
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

test('current work and source rows include fixes, parked goals, and unknown sources', () => {
    // A fix shares its file with a closed port and a parked goal; another
    // parked goal lacks a source owner. Status must not depend on goal kind
    // or on a corresponding Open commit in the historical timeline. The
    // summary and reason include markup to check HTML escaping.
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
    const current = rendered.get('currentWork').innerHTML;
    assert.match(current, /Fix gem discovery &lt;&amp;&gt;/u);
    assert.match(current, /fountain\.c/u);
    assert.match(current, /Fix pet movement/u);
    assert.doesNotMatch(current, /Finish fountains/u);
    assert.match(current, /<summary>2 goals in progress<\/summary>/u);
    assert.match(rendered.get('pausedWork').innerHTML, /<summary>2 paused goals<\/summary>/u);
    assert.match(rendered.get('pausedWork').innerHTML, /Waiting for &lt;caller&gt;/u);
    assert.match(rendered.get('pausedWork').innerHTML, /Source pending/u);
    const table = rendered.get('sourceWorkTable').innerHTML;
    assert.match(table, /class="in-progress"><td>fountain\.c<\/td>/u);
    assert.deepEqual(sourceFileRows(table).get('fountain.c'), ['1', '1', '1', '1', '1']);
    assert.match(table, /class="in-progress"><td>dog\.c<\/td>/u);
    assert.deepEqual(sourceFileRows(table).get('dog.c'), ['1', '', '', '0', '0']);
    assert.doesNotMatch(rendered.get('stats').innerHTML, /Source-port|Goals closed|Goal selection/u);
});

test('current work explains an idle snapshot and an empty goal register', () => {
    // Closed and queued records must not imply that work is in progress.
    for (const work of [[], [
        { id: 'finished', sourceFile: 'hack.c', status: 'closed', units: [] },
        { id: 'next', sourceFile: 'dog.c', status: 'queued', units: [] },
    ]]) {
        const rendered = renderDashboard(sourceDashboardData(work));
        assert.match(rendered.get('currentWork').innerHTML, /0 goals in progress/u);
        assert.equal(rendered.get('pausedWork').innerHTML, '');
        if (work.length) {
            assert.deepEqual(sourceFileRows(rendered.get('sourceWorkTable').innerHTML).get('dog.c'),
                ['', '', '1', '', '0', '0']); // Only the queued column counts this goal.
            assert.match(rendered.get('sourceWorkLegend').innerHTML, /Queued/u);
        }
    }
});

test('Lua source goals retain their kind in timeline lanes and history stripes', () => {
    // Two overlapping source goals exercise main's lanes with the Lua kind
    // introduced by the methodology work. Both finish before the build time.
    const goal = {
        status: 'closed', eventType: 'goal', openTimeSource: 'open-commit',
        openTime: '2026-01-01T01:00:00Z', closeTime: '2026-01-01T02:00:00Z',
        totalMin: 60, totalObserved: true, goalSelectionMin: 0,
        goalSelectionObserved: true, sliceCount: 1, audits: [], screensDelta: 0,
    };
    const data = {
        ...sourceDashboardData(),
        goals: [
            { ...goal, kind: 'file-port', name: 'port-hack' },
            { ...goal, kind: 'lua-port', name: 'port-Arc-loca' },
        ],
    };
    const rendered = renderDashboard({
        ...data, summary: { ...data.summary, generatedAt: '2026-01-01T03:00:00Z' },
    });
    const bars = timelineBars(rendered.get('timeline').innerHTML);
    assert.equal(bars.length, 2); // Both source goals have a bar in their shared day.
    assert.ok(bars[1].classes.includes('lua-port'));
    assert.ok(bars[1].top > bars[0].top); // Overlap places Lua in a separate lane.
    assert.match(rendered.get('goalTable').innerHTML,
        /class="kind-lua-port"><td title="port-Arc-loca">Arc-loca<\/td>/u);
    assert.match(rendered.get('timelineLegend').innerHTML, /source port \(C or Lua\)/u);
    assert.match(rendered.get('tableLegend').innerHTML, /source port \(C or Lua\)/u);
});

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
            {
                id: 'paused-investigation', kind: 'divergence-fix', status: 'parked',
                summary: 'Investigate the next mismatch',
                parkedReason: 'Waiting for source ownership', spans: [],
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
    assert.equal(alpha.functionsDeclared, 1);
    assert.equal(alpha.functionsTotal, 2);
    assert.equal(alpha.functionsVerified, 0); // Historical declarations are not completion evidence.
    assert.equal(orphan.kind, 'divergence-fix');
    assert.equal(beta.kind, 'file-port');
    assert.deepEqual(data.workGoals.map((port) => port.id), ['alpha', 'beta', 'orphan', 'paused-investigation']);
    assert.deepEqual(data.workGoals[0].units, [
        { name: 'one', verified: false }, { name: 'two', verified: false },
    ]); // Historical declarations do not count as verified units.
    assert.equal(data.workGoals[2].sourceFile, 'dog.c');
    assert.equal(data.workGoals[2].kind, 'divergence-fix');
    assert.equal(data.workGoals[3].status, 'parked');
    assert.equal(data.workGoals[3].parkedReason, 'Waiting for source ownership');
    assert.equal(data.workGoals[3].sourceFile, null);
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
    // Alpha's historical declaration has no completion evidence. Its one
    // goal is closed, but neither of its two units counts as verified.
    const sourceWorkTable = rendered.get('sourceWorkTable').innerHTML;
    assert.deepEqual(sourceFileRows(sourceWorkTable).get('alpha.c'), ['', '', '1', '0', '2']);
    assert.deepEqual(sourceFileRows(sourceWorkTable).get('beta.c'), ['1', '', '', '0', '1']);
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
        'Times from commits.',
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
    assert.match(stats, /Sessions<\/div><div class="score-breakdown-value">1\/2/u);
});
