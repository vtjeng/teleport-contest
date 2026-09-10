// Exercise the real goal-log CLI against disposable Git repositories. Queue
// loading alone is replaced with fixture data; the selection guard, source
// inventory, completion validator, and all persistent state changes are real.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync }
    from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { appendRow, COLUMNS } from './score-log.mjs';

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
const QUEUE_MODULE = new URL('./mismatch-queue.mjs', import.meta.url).href;
const CORE_SCRIPTS = [
    'goal-log.mjs', 'c-functions.mjs', 'score-log.mjs', 'lua-sources.mjs',
    'port-evidence.mjs', 'check-namespace-members.mjs',
];
// These standings distinguish progress before parking, during another goal,
// and after resumption without depending on real development-session totals.
const BASELINE = { screens: 10, rng: 100 };
const BEFORE_PARK = { screens: 13, rng: 106 };
const OTHER_GOAL_END = { screens: 50, rng: 150 };
const AFTER_RESUME = { screens: 54, rng: 159 };
// Top-level statements surround a Lua helper so planning only declarations
// would omit observable work at both ends of this five-line program.
const LUA_SOURCE = 'des.level_init({});\nfunction helper()\nend\nhelper();\ndes.room({});\n';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'goal-log-cli-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const write = (path, contents) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), contents);
    };
    const json = (path, contents) => write(path, `${JSON.stringify(contents)}\n`);
    write('package.json', '{"type":"module"}\n');
    for (const name of CORE_SCRIPTS) {
        mkdirSync(join(root, 'scripts'), { recursive: true });
        copyFileSync(join(SCRIPT_ROOT, name), join(root, 'scripts', name));
    }
    write('scripts/mismatch-queue.mjs', [
        `export { assertGoalSelection } from ${JSON.stringify(QUEUE_MODULE)};`,
        "import { readFileSync } from 'node:fs';",
        'export function loadMismatchQueue() {',
        "    return JSON.parse(readFileSync(new URL('../.cache/queue.json', import.meta.url), 'utf8'));",
        '}',
    ].join('\n'));
    json('GOALS.json', { goals: [] });
    write('SCORE.tsv', `${COLUMNS.join('\t')}\n`);
    // Same-name JavaScript is deliberately present before evidence exists.
    write('nethack-c/upstream/src/widget.c', 'int\nhelper(void)\n{ return 0; }\n');
    write('nethack-c/upstream/src/unrelated.c', 'int\nother(void)\n{ return 0; }\n');
    mkdirSync(join(root, 'nethack-c/upstream/win/tty'), { recursive: true });
    write('nethack-c/upstream/dat/Arc-loca.lua', LUA_SOURCE);
    write('js/widget.js', 'export function helper() { return 0; }\n');
    write('js/driver.js', "import { helper } from './widget.js';\n"
        + 'export function run() { return helper(); }\n');
    write('js/arc_loca.js', 'export const ARC_LOCA_PROGRAM = [];\n');
    write('js/lua_driver.js', "import { ARC_LOCA_PROGRAM } from './arc_loca.js';\n"
        + 'export function load() { return ARC_LOCA_PROGRAM; }\n');
    write('scripts/widget.test.mjs', '// Fixture source-pinned helper test.\n');
    write('recordings/widget/entry.session.json', '{}\n');
    const git = (...args) => {
        const result = spawnSync('git', [
            '-c', 'user.name=Goal Log Fixture',
            '-c', 'user.email=goal-log-fixture@example.invalid',
            '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
            ...args,
        ], { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || result.error?.message);
        return result.stdout.trim();
    };
    git('init', '--quiet');
    let revision = 0;
    const commit = () => {
        // A numbered text revision produces a distinct HEAD for stale-summary
        // checks without changing any implementation under test.
        revision += 1;
        write('fixture-history.txt', `${revision}\n`);
        git('add', 'fixture-history.txt');
        git('commit', '--quiet', '-m', 'Advance disposable fixture history');
        return git('rev-parse', 'HEAD');
    };
    const head = () => git('rev-parse', 'HEAD');
    const score = ({ screens, rng }) => appendRow({
        sha: head(), event: 'span', screens_matched: screens, rng_matched: rng,
    }, join(root, 'SCORE.tsv'));
    const queue = (...sources) => {
        const candidates = sources.map((sourceFile) => ({
            sourceFile, sessions: [`fixture-${sourceFile}`],
        }));
        json('.cache/queue.json', {
            sessions: candidates.flatMap((candidate) => candidate.sessions
                .map((session) => ({ session, sourceFile: candidate.sourceFile }))),
            candidates,
            roadmapFallbackAllowed: candidates.length === 0,
        });
    };
    const run = (...args) => spawnSync(process.execPath, ['scripts/goal-log.mjs', ...args], {
        cwd: root, encoding: 'utf8',
    });
    const cli = (...args) => {
        const result = run(...args);
        assert.equal(result.status, 0, result.stderr || result.error?.message);
        return result.stdout;
    };
    const refuses = (pattern, ...args) => {
        const result = run(...args);
        assert.notEqual(result.status, 0, `unexpected success: ${args.join(' ')}`);
        assert.match(result.stderr, pattern);
    };
    const goals = () => JSON.parse(readFileSync(join(root, 'GOALS.json'), 'utf8')).goals;
    const checkpoint = (overrides = {}) => json('.cache/checkpoint-summary.json', {
        commit: head(), allPassed: true, recordings: { passed: true }, ...overrides,
    });
    const evidence = (overrides = {}) => ({
        functions: [{
            name: 'helper', implementation: 'js/widget.js',
            sourceReview: 'Reviewed the complete helper source and its caller; no branches or gaps remain.',
            callers: [{ path: 'js/driver.js', symbol: 'run', source: 'driver.c run' }],
            pure: true, tests: ['scripts/widget.test.mjs'], recordings: [],
        }],
        entryPointReview: 'This helper-only range has no independent entry point.',
        entryPoints: [], ...overrides,
    });
    const record = (goal, value = evidence()) => {
        json('.cache/evidence.json', value);
        return cli('record-evidence', '--goal', goal, '--evidence', '.cache/evidence.json');
    };
    commit();
    score(BASELINE);
    queue('widget.c');
    return { root, write, json, cli, refuses, goals, checkpoint, evidence, record,
        head, commit, score, queue };
}

function queueC(f, id = 'widget', file = 'widget.c') {
    return f.cli('queue-goal', '--id', id, '--kind', 'file-port',
        '--c-file', file, '--summary', `Port ${file}`);
}

function openC(f) {
    queueC(f);
    f.cli('open-goal', '--id', 'widget');
    return JSON.parse(f.cli('next-span', '--goal', 'widget'));
}

test('C CLI plans a same-name partial function and closes only with evidence and a current checkpoint', (t) => {
    const f = fixture(t);
    // This initial stub omits C's return value. A declaration must not make
    // the planner skip it before the review and implementation are complete.
    f.write('js/widget.js', 'export function helper() {}\n');
    const span = openC(f);
    assert.deepEqual(span.functions, ['helper']);
    assert.equal(f.goals()[0].functions[0].declared, true);
    assert.equal(f.goals()[0].functions[0].complete, false);
    f.refuses(/record completion evidence/u, 'close-span', '--goal', 'widget', '--name', 'helper');
    f.write('js/widget.js', 'export function helper() { return 0; }\n');
    f.record('widget');
    assert.equal(f.goals()[0].evidence.functions[0].checkedAt, f.head());
    f.refuses(/passing npm run checkpoint at HEAD/u,
        'close-span', '--goal', 'widget', '--name', 'helper');

    const oldHead = f.head();
    f.commit();
    f.checkpoint({ commit: oldHead });
    f.refuses(/passing npm run checkpoint at HEAD/u,
        'close-span', '--goal', 'widget', '--name', 'helper');
    f.checkpoint({ allPassed: false });
    f.refuses(/passing npm run checkpoint at HEAD/u,
        'close-span', '--goal', 'widget', '--name', 'helper');
    f.checkpoint({ recordings: { passed: false } });
    f.refuses(/passing npm run checkpoint at HEAD/u,
        'close-span', '--goal', 'widget', '--name', 'helper');
    f.checkpoint();
    f.cli('close-span', '--goal', 'widget', '--name', 'helper');
    f.score(BASELINE);
    f.checkpoint({ allPassed: false });
    f.refuses(/passing npm run checkpoint at HEAD/u, 'close-goal', '--goal', 'widget');
    f.checkpoint();
    f.cli('close-goal', '--goal', 'widget');
    const goal = f.goals()[0];
    assert.equal(goal.status, 'closed');
    assert.equal(goal.spans[0].status, 'closed');
    assert.equal(goal.closedAt, f.head());
    // No measured figure changed in this fixture's implementation interval.
    assert.deepEqual(goal.delivered, { screens: 0, rng: 0 });
});

test('a planned entry point without a recording keeps its source goal open', (t) => {
    const f = fixture(t);
    openC(f);
    const evidence = f.evidence({
        entryPointReview: 'Reviewed the driver command that reaches this helper.',
        entryPoints: [{ name: 'driver command', functions: ['helper'], recordings: [] }],
    });
    f.record('widget', evidence);
    f.checkpoint();
    f.cli('close-span', '--goal', 'widget', '--name', 'helper');
    f.refuses(/entry point driver command has no matching recording/u,
        'close-goal', '--goal', 'widget');
    assert.equal(f.goals()[0].status, 'open');
    evidence.entryPoints[0].recordings = ['recordings/widget/entry.session.json'];
    f.record('widget', evidence);
    f.cli('close-goal', '--goal', 'widget');
    assert.equal(f.goals()[0].status, 'closed');
});

test('replanning an unverified historical span preserves its closed record and uses a new name', (t) => {
    const f = fixture(t);
    openC(f);
    const goals = f.goals();
    // Older methodology could close a same-name declaration without source
    // evidence. Retain that history while planning the missing verification.
    goals[0].spans[0].status = 'closed';
    goals[0].spans[0].closedBy = f.head();
    const historicalSpan = structuredClone(goals[0].spans[0]);
    f.json('GOALS.json', { goals });
    const context = JSON.parse(f.cli('next-span', '--goal', 'widget'));
    assert.deepEqual(context.functions, ['helper']);
    // The second occurrence gets a distinct name so close-span cannot select
    // the earlier closed record instead of the pending replacement.
    assert.deepEqual(f.goals()[0].spans.map((span) => span.name), ['helper', 'helper (2)']);
    f.record('widget');
    f.checkpoint();
    f.cli('close-span', '--goal', 'widget', '--name', 'helper (2)');
    const spans = f.goals()[0].spans;
    assert.deepEqual(spans[0], historicalSpan);
    assert.deepEqual(spans[1], {
        name: 'helper (2)', status: 'closed', closedBy: f.head(), functions: ['helper'],
    });
});

test('Lua CLI plans all top-level source and requires an explicit implementation symbol', (t) => {
    const f = fixture(t);
    f.queue('Arc-loca.lua');
    f.cli('queue-goal', '--id', 'arc-loca', '--kind', 'lua-port',
        '--lua-file', 'Arc-loca.lua', '--summary', 'Port the whole Lua level program');
    f.cli('open-goal', '--id', 'arc-loca');
    const span = JSON.parse(f.cli('next-span', '--goal', 'arc-loca'));
    assert.deepEqual(span.functions, ['Arc-loca.lua']);
    assert.deepEqual(span.lineRanges, ['1-5']);
    assert.equal(span.cLines, LUA_SOURCE.trimEnd().split('\n').length);
    const evidence = f.evidence({ functions: [{
        name: 'Arc-loca.lua', implementation: 'js/arc_loca.js',
        sourceReview: 'Reviewed all top-level statements, helper calls, and level-loader wiring.',
        callers: [{ path: 'js/lua_driver.js', symbol: 'load', source: 'sp_lev.c load_special' }],
        pure: false, tests: [], recordings: ['recordings/widget/entry.session.json'],
    }],
    entryPointReview: 'The level-loader entry point reaches the complete program.',
    entryPoints: [{ name: 'Arc-loca level', functions: ['Arc-loca.lua'],
        recordings: ['recordings/widget/entry.session.json'] }],
    });
    f.json('.cache/evidence.json', evidence);
    f.refuses(/symbol/u, 'record-evidence', '--goal', 'arc-loca', '--evidence', '.cache/evidence.json');
    evidence.functions[0].symbol = 'ARC_LOCA_PROGRAM';
    f.record('arc-loca', evidence);
    f.checkpoint();
    f.cli('close-span', '--goal', 'arc-loca', '--name', 'Arc-loca.lua');
    f.cli('close-goal', '--goal', 'arc-loca');
    assert.equal(f.goals()[0].status, 'closed');
    assert.equal(f.goals()[0].functions[0].complete, true);
});

test('selection is checked when queueing, opening, and requesting either a new or existing span', (t) => {
    const f = fixture(t);
    f.refuses(/development mismatches remain/u, 'queue-goal', '--id', 'unrelated',
        '--kind', 'file-port', '--c-file', 'unrelated.c', '--summary', 'Unrelated helper work');
    assert.deepEqual(f.goals(), []);
    f.queue();
    queueC(f, 'unrelated', 'unrelated.c');
    f.queue('widget.c');
    f.refuses(/development mismatches remain/u, 'open-goal', '--id', 'unrelated');
    assert.equal(f.goals()[0].status, 'queued');
    queueC(f);
    f.cli('open-goal', '--id', 'widget');
    f.queue('unrelated.c');
    f.refuses(/development mismatches remain/u, 'next-span', '--goal', 'widget');
    assert.deepEqual(f.goals()[1].spans, []);
    f.queue('widget.c');
    f.cli('next-span', '--goal', 'widget');
    f.queue('unrelated.c');
    f.refuses(/development mismatches remain/u, 'next-span', '--goal', 'widget');
    assert.equal(f.goals()[1].spans.length, 1); // The already-queued span is preserved.
});

test('queue-span cannot bypass source planning or divergence selection checks', (t) => {
    const f = fixture(t);
    openC(f);
    const plannedSpans = structuredClone(f.goals()[0].spans);
    f.refuses(/plan source-port spans with next-span/u, 'queue-span',
        '--goal', 'widget', '--name', 'manual-helper', '--functions', 'helper');
    assert.deepEqual(f.goals()[0].spans, plannedSpans);
    f.cli('park-goal', '--goal', 'widget', '--reason', 'Exercise the divergence-span workflow.');

    f.cli('queue-goal', '--id', 'widget-fix', '--kind', 'divergence-fix',
        '--c-file', 'widget.c', '--function', 'helper', '--session', 'fixture-widget.c',
        '--summary', 'Fix the helper divergence');
    f.refuses(/queue-span requires an open goal/u, 'queue-span',
        '--goal', 'widget-fix', '--name', 'helper-fix', '--functions', 'helper');
    f.cli('open-goal', '--id', 'widget-fix');
    f.queue('unrelated.c');
    f.refuses(/development mismatches remain/u, 'queue-span',
        '--goal', 'widget-fix', '--name', 'helper-fix', '--functions', 'helper');
    assert.deepEqual(f.goals()[1].spans, []);

    f.queue('widget.c');
    f.cli('queue-span', '--goal', 'widget-fix', '--name', 'helper-fix', '--functions', 'helper');
    assert.deepEqual(f.goals()[1].spans, [{
        name: 'helper-fix', status: 'queued', closedBy: null, functions: ['helper'],
    }]);
});

test('parking preserves spans, rechecks priorities on resume, and excludes other goals from delivered gains', (t) => {
    const f = fixture(t);
    openC(f);
    const original = structuredClone(f.goals()[0]);
    f.commit();
    f.score(BEFORE_PARK);
    f.cli('park-goal', '--goal', 'widget', '--reason', 'A newly exposed gameplay blocker takes priority.');
    let goal = f.goals()[0];
    assert.equal(goal.status, 'parked');
    assert.deepEqual(goal.spans, original.spans);
    assert.deepEqual(goal.progressBeforePark, {
        screens: BEFORE_PARK.screens - BASELINE.screens,
        rng: BEFORE_PARK.rng - BASELINE.rng,
    });

    f.queue('unrelated.c');
    f.cli('queue-goal', '--id', 'other-fix', '--kind', 'divergence-fix',
        '--c-file', 'unrelated.c', '--function', 'other', '--session', 'fixture-unrelated.c',
        '--summary', 'Fix the newly exposed blocker');
    f.cli('open-goal', '--id', 'other-fix');
    f.commit();
    f.score(OTHER_GOAL_END);
    f.cli('close-goal', '--goal', 'other-fix');
    f.refuses(/development mismatches remain/u, 'open-goal', '--id', 'widget');
    assert.equal(f.goals()[0].status, 'parked');

    f.queue('widget.c');
    f.cli('open-goal', '--id', 'widget');
    goal = f.goals()[0];
    assert.equal(goal.openedAt, original.openedAt);
    assert.deepEqual(goal.openStanding, original.openStanding);
    assert.deepEqual(goal.activeStanding, { sha: f.head(), ...OTHER_GOAL_END });
    assert.deepEqual(goal.spans, original.spans);
    assert.deepEqual(JSON.parse(f.cli('next-span', '--goal', 'widget')).functions, ['helper']);
    f.record('widget');
    f.checkpoint();
    f.cli('close-span', '--goal', 'widget', '--name', 'helper');
    f.commit();
    f.score(AFTER_RESUME);
    f.checkpoint();
    f.cli('close-goal', '--goal', 'widget');
    goal = f.goals()[0];
    assert.deepEqual(goal.delivered, {
        screens: (BEFORE_PARK.screens - BASELINE.screens)
            + (AFTER_RESUME.screens - OTHER_GOAL_END.screens),
        rng: (BEFORE_PARK.rng - BASELINE.rng)
            + (AFTER_RESUME.rng - OTHER_GOAL_END.rng),
    });
    assert.equal(goal.status, 'closed');
});
