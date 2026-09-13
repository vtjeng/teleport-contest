// Exercise the real goal-log CLI against disposable Git repositories. Queue
// loading and game replay use fixture data; the selection guard, source
// inventory, completion validator, scoring cache, and persistent changes are real.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync }
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
    'score-development.mjs', 'scoring-workspace.mjs', 'local-tmpdir.mjs',
    'development-standing.mjs', 'checkpoint-results.mjs',
];
// These standings distinguish progress before parking, during another goal,
// and after resumption without depending on real development-session totals.
const BASELINE = { screens: 10, rng: 100 };
const BEFORE_PARK = { screens: 81, rng: 1639 }; // An unfinished span adds 71 screens and 1539 RNG matches.
const OTHER_GOAL_END = { screens: 85, rng: 1647 }; // The following goal adds only four screens and eight RNG matches.
const AFTER_RESUME = { screens: 89, rng: 1656 }; // Resumed work adds four screens and nine RNG matches.
// Top-level statements surround a Lua helper so planning only declarations
// would omit observable work at both ends of this five-line program.
const LUA_SOURCE = 'des.level_init({});\nfunction helper()\nend\nhelper();\ndes.room({});\n';

// A scripts-only checkout has no goal store, Git repository, C checkout, or
// sessions. The preload also refuses state I/O and subprocesses so accidentally
// swallowed failures cannot make a help request look harmless.
function helpFixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'goal-log-help-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
    for (const name of CORE_SCRIPTS)
        copyFileSync(join(SCRIPT_ROOT, name), join(root, 'scripts', name));
    const guard = join(root, 'guard.cjs');
    writeFileSync(guard, `
const fs = require('node:fs');
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const readFileSync = fs.readFileSync;
const forbidden = () => {
    process.stderr.write('Help attempted repository I/O or a subprocess\\n');
    process.exit(97); // Distinct from the CLI's ordinary invalid-input exit.
};
fs.readFileSync = function(path, ...args) {
    if (!/\\.(?:mjs|cjs|js)$/.test(String(path)) && !String(path).endsWith('/package.json'))
        forbidden();
    return readFileSync.call(this, path, ...args);
};
for (const name of ['writeFileSync', 'mkdirSync', 'readdirSync', 'lstatSync'])
    fs[name] = forbidden;
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
    childProcess[name] = forbidden;
syncBuiltinESMExports();
`);
    return {
        root,
        run: (...args) => spawnSync(process.execPath,
            ['--require', guard, 'scripts/goal-log.mjs', ...args],
            { cwd: root, encoding: 'utf8' }),
    };
}

// Explicit expectations pin each supported command and its useful syntax;
// reading a list from the implementation would miss accidentally omitted help.
const HELP_COMMANDS = {
    '--current': ['--detail', 'default'],
    roadmap: ['C', 'Lua'],
    'queue-goal': ['--id', '--kind', '--summary', '--c-file', '--lua-file',
        '--from-function', '--to-function', '--function', '--session', '--sessions',
        '--step', '--selection-reason', '--detail', '--development-scan'],
    'open-goal': ['--id', '--selection-reason', '--development-scan', 'queued', 'parked'],
    'next-span': ['--goal', '--development-scan', 'source', '.cache/span-context.json'],
    'queue-span': ['--goal', '--name', '--functions', '--development-scan', 'divergence'],
    'record-evidence': ['--goal', '--evidence', 'open'],
    'close-span': ['--goal', '--name', 'checkpoint'],
    'park-goal': ['--goal', '--reason', 'open'],
    'discard-goal': ['--id', '--reason', 'queued'],
    'close-goal': ['--goal', '--development-scan', 'SCORE.tsv', 'checkpoint'],
};

test('CLI help lists every command without repository access or side effects', (t) => {
    const f = helpFixture(t);
    const before = readdirSync(f.root, { recursive: true }).sort();
    const result = f.run('--help');
    assert.equal(result.status, 0, result.stderr); // Help is a successful invocation.
    assert.equal(result.stderr, ''); // The guard must not have observed forbidden work.
    for (const command of Object.keys(HELP_COMMANDS)) assert.ok(result.stdout.includes(command), command);
    assert.match(result.stdout, /Usage: node scripts\/goal-log\.mjs/u);
    assert.deepEqual(readdirSync(f.root, { recursive: true }).sort(), before);
});

test('each CLI command has useful help without its normal required arguments', async (t) => {
    const f = helpFixture(t);
    for (const [command, expected] of Object.entries(HELP_COMMANDS)) {
        await t.test(command, () => {
            const result = f.run(command, '--help');
            assert.equal(result.status, 0, result.stderr); // Missing operation arguments do not block help.
            assert.equal(result.stderr, '');
            assert.ok(result.stdout.includes(`Usage: node scripts/goal-log.mjs ${command}`));
            for (const token of expected) assert.ok(result.stdout.includes(token), token);
        });
    }
});

test('invalid CLI invocations fail and point to relevant help before accessing state', (t) => {
    const f = helpFixture(t);
    const cases = [
        // Unknown modes must not be mistaken for known commands or object properties.
        { args: ['missing-command'], help: '--help' },
        { args: ['constructor', '--help'], help: '--help' },
        // Malformed help must not turn an invalid invocation into success.
        { args: ['--help', 'extra'], help: '--help' },
        { args: ['queue-goal', '--help', '--typo'], help: 'queue-goal --help' },
        // Existing option validation still applies outside the help path.
        { args: ['queue-goal', '--id'], help: 'queue-goal --help' },
        { args: ['open-goal', '--id', 'first', '--id', 'second'], help: 'open-goal --help' },
        { args: ['--current', '--typo'], help: '--current --help' },
        { args: ['roadmap', '--typo'], help: 'roadmap --help' },
    ];
    for (const { args, help } of cases) {
        const result = f.run(...args);
        assert.equal(result.status, 1, result.stderr); // CLI failure, not the preload guard's exit.
        assert.equal(result.stdout, '');
        assert.ok(result.stderr.includes(`node scripts/goal-log.mjs ${help}`), result.stderr);
    }
});

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
    write('.gitignore', '.cache/\n');
    json('js/score-fixture.json', BASELINE);
    // The production scorer wrapper runs this tiny runner in its real isolated
    // workspace. Its result changes only when a committed game input changes.
    write('frozen/ps_test_runner.mjs', `
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
const score = JSON.parse(readFileSync('js/score-fixture.json', 'utf8'));
appendFileSync(process.env.GOAL_SCORE_RUN_LOG, 'replay\\n');
if (process.env.GOAL_SCORE_EDIT_PATH)
    appendFileSync(process.env.GOAL_SCORE_EDIT_PATH, '\\n');
const results = readdirSync('sessions').map((session, index) => ({
    session,
    metrics: {
        screens: { matched: index === 0 ? score.screens : 0 },
        rngCalls: { matched: index === 0 ? score.rng : 0 },
    },
}));
console.log('__RESULTS_JSON__');
console.log(JSON.stringify({ results }));
`);
    for (const file of ['isaac64.js', 'terminal.js', 'storage.js'])
        write(`frozen/${file}`, '// Scorer overlay fixture.\n');
    // Match the fixed direct development set without any real session data.
    const sessionPaths = Array.from({ length: 33 }, (_, index) =>
        `sessions/fixture-${index}.session.json`);
    for (const file of sessionPaths) json(file, {});
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
    const commit = (...paths) => {
        // A numbered text revision produces a distinct HEAD for stale-summary
        // checks without changing any implementation under test.
        revision += 1;
        write('fixture-history.txt', `${revision}\n`);
        git('add', 'fixture-history.txt', ...paths);
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
    const env = { ...process.env, GOAL_SCORE_RUN_LOG: join(root, '.cache', 'replays') };
    const run = (...args) => spawnSync(process.execPath, ['scripts/goal-log.mjs', ...args], {
        cwd: root, encoding: 'utf8', env,
    });
    const measuredScore = (value) => {
        json('js/score-fixture.json', value);
        return commit('js/score-fixture.json');
    };
    const development = () => {
        const result = spawnSync(process.execPath, ['scripts/score-development.mjs'], {
            cwd: root, encoding: 'utf8', env,
        });
        assert.equal(result.status, 0, result.stderr);
    };
    const replays = () => {
        try { return readFileSync(env.GOAL_SCORE_RUN_LOG, 'utf8').trim().split('\n').length; }
        catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
    };
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
    const checkpoint = (overrides = {}) => {
        // Simulate checkpoint's complete result for this fixture's game input.
        const measured = JSON.parse(readFileSync(join(root, 'js/score-fixture.json')));
        json(`.git/checkpoint-results/${head()}/latest.json`, {
            commit: head(), executionCommit: head(), allPassed: true,
            recordings: { passed: true },
            score: { screensMatched: measured.screens, rngMatched: measured.rng }, ...overrides,
        });
    };
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
    commit('package.json', '.gitignore', 'scripts', 'js', 'frozen', ...sessionPaths);
    score(BASELINE);
    queue('widget.c');
    return { root, write, json, cli, refuses, goals, checkpoint, evidence, record,
        head, commit, score, queue, git, measuredScore, development, replays, env };
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
    f.commit('js/widget.js');
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
    // An older overlapping run can complete last and own the global summary.
    // Closure must read this HEAD's result, not whichever run completed last.
    f.json('.cache/checkpoint-summary.json', { commit: oldHead, allPassed: false });
    f.cli('close-span', '--goal', 'widget', '--name', 'helper');
    f.score(BASELINE);
    f.checkpoint({ allPassed: false });
    f.refuses(/passing npm run checkpoint at HEAD/u, 'close-goal', '--goal', 'widget');
    f.checkpoint();
    f.json('.cache/development-scan.json', { rows: [] });
    f.cli('close-goal', '--goal', 'widget',
        '--development-scan', '.cache/development-scan.json');
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

test('a source goal closes after bookkeeping reuse without relabeling its score', (t) => {
    const f = fixture(t);
    openC(f);
    const measuredAt = f.measuredScore(BEFORE_PARK);
    f.record('widget');
    f.checkpoint();
    f.cli('close-span', '--goal', 'widget', '--name', 'helper');
    // Record only goal bookkeeping after the execution commit. SCORE still
    // holds the opening figure and must not determine delivered progress.
    f.git('add', 'GOALS.json');
    f.git('commit', '--quiet', '-m', 'Record completed span');
    assert.notEqual(f.head(), measuredAt);
    f.checkpoint({ executionCommit: measuredAt });
    const logBefore = readFileSync(join(f.root, 'SCORE.tsv'), 'utf8');
    f.cli('close-goal', '--goal', 'widget');
    const goal = f.goals()[0];
    assert.equal(goal.closedAt, f.head());
    assert.deepEqual(goal.closeStanding, { sha: measuredAt, ...BEFORE_PARK });
    assert.deepEqual(goal.delivered, {
        screens: BEFORE_PARK.screens - BASELINE.screens,
        rng: BEFORE_PARK.rng - BASELINE.rng,
    });
    assert.equal(readFileSync(join(f.root, 'SCORE.tsv'), 'utf8'), logBefore);
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
    f.refuses(/fixed-corpus mismatches remain/u, 'queue-goal', '--id', 'unrelated',
        '--kind', 'file-port', '--c-file', 'unrelated.c', '--summary', 'Unrelated helper work');
    assert.deepEqual(f.goals(), []);
    f.queue();
    queueC(f, 'unrelated', 'unrelated.c');
    f.queue('widget.c');
    f.refuses(/fixed-corpus mismatches remain/u, 'open-goal', '--id', 'unrelated');
    assert.equal(f.goals()[0].status, 'queued');
    queueC(f);
    f.cli('open-goal', '--id', 'widget');
    f.queue('unrelated.c');
    f.refuses(/fixed-corpus mismatches remain/u, 'next-span', '--goal', 'widget');
    assert.deepEqual(f.goals()[1].spans, []);
    f.queue('widget.c');
    f.cli('next-span', '--goal', 'widget');
    f.queue('unrelated.c');
    f.refuses(/fixed-corpus mismatches remain/u, 'next-span', '--goal', 'widget');
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
    f.refuses(/fixed-corpus mismatches remain/u, 'queue-span',
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
    f.checkpoint({ score: {
        screensMatched: OTHER_GOAL_END.screens, rngMatched: OTHER_GOAL_END.rng,
    } }); // The following goal's closing measurement excludes the parked goal.
    f.cli('close-goal', '--goal', 'other-fix');
    f.refuses(/fixed-corpus mismatches remain/u, 'open-goal', '--id', 'widget');
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
    f.checkpoint({ score: {
        screensMatched: AFTER_RESUME.screens, rngMatched: AFTER_RESUME.rng,
    } }); // Only progress after resumption belongs to this active interval.
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


test('an unfinished parked span owns its gain even when no SCORE event was allowed', (t) => {
    const f = fixture(t);
    openC(f);
    const scoreLog = readFileSync(join(f.root, 'SCORE.tsv'), 'utf8');
    const measuredAt = f.measuredScore(BEFORE_PARK);
    f.cli('park-goal', '--goal', 'widget', '--reason', 'The span has an unfinished caller.');
    const parked = f.goals()[0];
    assert.equal(parked.spans[0].status, 'queued');
    assert.deepEqual(parked.progressBeforePark, {
        screens: BEFORE_PARK.screens - BASELINE.screens,
        rng: BEFORE_PARK.rng - BASELINE.rng,
    });
    assert.deepEqual(parked.parkedStanding, { sha: measuredAt, ...BEFORE_PARK });
    assert.equal(readFileSync(join(f.root, 'SCORE.tsv'), 'utf8'), scoreLog);
    assert.equal(f.replays(), 1); // Parking had no current measurement to reuse.

    f.commit(); // Goal metadata advances HEAD while the scored inputs stay identical.
    f.queue('unrelated.c');
    f.cli('queue-goal', '--id', 'other-fix', '--kind', 'divergence-fix',
        '--c-file', 'unrelated.c', '--function', 'other', '--session', 'fixture-unrelated.c',
        '--summary', 'Fix the following blocker');
    f.cli('open-goal', '--id', 'other-fix');
    assert.deepEqual(f.goals()[1].openStanding, parked.parkedStanding);
    assert.equal(f.replays(), 1); // Opening reuses the proven equivalent park measurement.
    f.measuredScore(OTHER_GOAL_END);
    f.score(OTHER_GOAL_END);
    f.checkpoint();
    f.cli('close-goal', '--goal', 'other-fix');
    assert.deepEqual(f.goals()[1].delivered, {
        screens: OTHER_GOAL_END.screens - BEFORE_PARK.screens,
        rng: OTHER_GOAL_END.rng - BEFORE_PARK.rng,
    });
});

test('a successful development run survives an unrelated checkpoint failure and metadata commits', (t) => {
    const f = fixture(t);
    const measuredAt = f.measuredScore(BEFORE_PARK);
    f.development();
    f.checkpoint({ allPassed: false }); // A failing non-score check cannot erase score evidence.
    f.commit();
    openC(f);
    assert.deepEqual(f.goals()[0].openStanding, { sha: measuredAt, ...BEFORE_PARK });
    assert.equal(f.replays(), 1); // The scorer already measured these exact inputs.
});

test('metadata-only commits reuse an equivalent SCORE event without scoring', (t) => {
    const f = fixture(t);
    const measuredAt = f.head();
    f.commit();
    openC(f);
    assert.deepEqual(f.goals()[0].openStanding, { sha: measuredAt, ...BASELINE });
    assert.equal(f.replays(), 0); // No scored input changed after the event row.
});

test('committed scoring inputs invalidate a cached measurement and an earlier SCORE row', async (t) => {
    // Each path belongs to a different dependency copied or executed by the scorer.
    for (const path of ['js/widget.js', 'frozen/terminal.js',
        'scripts/scoring-workspace.mjs', 'scripts/score-development.mjs',
        'scripts/local-tmpdir.mjs', 'package.json', 'sessions/fixture-0.session.json']) {
        await t.test(path, (subtest) => {
            const f = fixture(subtest);
            f.development();
            f.write(path, `${readFileSync(join(f.root, path), 'utf8')}\n`);
            const measuredAt = f.commit(path);
            openC(f);
            assert.deepEqual(f.goals()[0].openStanding, { sha: measuredAt, ...BASELINE });
            assert.equal(f.replays(), 2); // The earlier cache and event both predate this input.
        });
    }
});

test('dirty scoring inputs leave queued and open goals unchanged', async (t) => {
    for (const change of ['tracked', 'staged', 'untracked', 'ignored']) {
        await t.test(change, (subtest) => {
            const f = fixture(subtest);
            openC(f);
            const original = f.goals();
            const path = change === 'tracked' || change === 'staged'
                ? 'js/widget.js' : 'js/new.js';
            f.write(path, '// An uncommitted replay input.\n');
            if (change === 'staged') f.git('add', path);
            if (change === 'ignored') f.write('.gitignore', '.cache/\njs/new.js\n');
            f.refuses(/commit scoring inputs/u, 'park-goal', '--goal', 'widget',
                '--reason', 'Exercise the dirty-input guard.');
            assert.deepEqual(f.goals(), original);
            original[0].status = 'queued';
            f.json('GOALS.json', { goals: original });
            f.refuses(/commit scoring inputs/u, 'open-goal', '--id', 'widget');
            assert.deepEqual(f.goals(), original);
            assert.equal(f.replays(), 0); // Dirty work must not be attributed to HEAD.
        });
    }
});

test('a changed direct session count prevents boundary mutation even with a cached score', (t) => {
    const f = fixture(t);
    f.development();
    queueC(f);
    rmSync(join(f.root, 'sessions/fixture-0.session.json')); // One missing direct recording breaks the fixed set.
    const original = f.goals();
    f.refuses(/development count changed/u, 'open-goal', '--id', 'widget');
    assert.deepEqual(f.goals(), original);
});

test('legacy checkpoint totals cannot substitute for a verified current measurement', (t) => {
    const f = fixture(t);
    const measuredAt = f.measuredScore(BEFORE_PARK);
    f.checkpoint({ score: { screensMatched: BASELINE.screens, rngMatched: BASELINE.rng } });
    openC(f);
    assert.deepEqual(f.goals()[0].openStanding, { sha: measuredAt, ...BEFORE_PARK });
    assert.equal(f.replays(), 1); // A summary without scorer provenance needs replay.
});

test('failed replay and mid-replay edits publish no measurement or goal boundary', async (t) => {
    for (const failure of ['runner failure', 'input edit']) {
        await t.test(failure, (subtest) => {
            const f = fixture(subtest);
            f.measuredScore(BEFORE_PARK);
            if (failure === 'runner failure') {
                const path = 'frozen/ps_test_runner.mjs';
                f.write(path, `${readFileSync(join(f.root, path), 'utf8')}\nprocess.exitCode = 1;\n`);
                f.commit(path); // Failure after emitting results must still invalidate them.
            } else {
                f.env.GOAL_SCORE_EDIT_PATH = join(f.root, 'js/widget.js');
            }
            queueC(f);
            const original = f.goals();
            f.refuses(/Development scoring failed|inputs changed/u, 'open-goal', '--id', 'widget');
            assert.deepEqual(f.goals(), original);
            assert.equal(existsSync(join(f.root, '.cache/development-standing.json')), false);
        });
    }
});
