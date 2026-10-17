import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {SOURCE_TRIAL, SOURCE_TRIAL_PATHS, SOURCE_TRIAL_UNITS, completedSourceUnits} from './port-evidence.mjs';
import {assertPortComplete, recordEvidence} from './goal-log.mjs';
import {COLUMNS} from './score-log.mjs';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
function git(root, ...args) {
    const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
}
function fixture(t) {
    const parent = mkdtempSync(join(tmpdir(), 'source-trial-cli-'));
    t.after(() => rmSync(parent, {recursive: true, force: true}));
    const root = join(parent, 'Main'), worker = join(parent, 'Worker'), prep = join(parent, 'Prep');
    mkdirSync(root); git(root, 'init', '-qb', 'main');
    git(root, 'config', 'user.name', 'Source trial fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
    git(root, 'config', 'commit.gpgsign', 'false');
    const save = (where, value) => {mkdirSync(dirname(where), {recursive: true}); writeFileSync(where, JSON.stringify(value));};
    // Actual frozen blobs, not fake game implementations or a validation bypass.
    const pinned = git(project, 'ls-tree', '-r', '--name-only', SOURCE_TRIAL.reviewedBase, '--',
        'js/attrib.js', 'js/cmd.js', 'js/const.js', 'js/detect.js', 'js/display.js', 'js/hack.js',
        'js/mon.js', 'js/objnam.js', 'js/rng.js', 'js/trap.js', 'js/trap_names_data.js',
        'js/tty_menu.js', 'js/tty_message.js', 'js/vision.js', 'scripts/detect.test.mjs').split('\n');
    for (const path of pinned) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        const r = spawnSync('git', ['show', `${SOURCE_TRIAL.reviewedBase}:${path}`], {cwd: project, maxBuffer: 8 * 1024 * 1024});
        assert.equal(r.status, 0); writeFileSync(join(root, path), r.stdout);
    }
    writeFileSync(join(root, '.gitignore'), '.cache/\n');
    writeFileSync(join(root, 'SCORE.tsv'), COLUMNS.join('\t') + '\n');
    save(join(root, 'GOALS.json'), {goals: []});
    git(root, 'add', '.');
    git(root, 'update-index', '--add', '--cacheinfo', '160000,16ff59115315917b93185d026aeefea06db9b0f4,nethack-c/upstream');
    git(root, 'commit', '-qm', 'Frozen reviewed fixture source');
    const base = git(root, 'rev-parse', 'HEAD');
    git(root, 'worktree', 'add', '-qb', 'worker', worker); git(root, 'worktree', 'add', '-qb', 'prep', prep);
    const file = join(root, '.cache/ledger.json');
    const run = (script, args, cwd = root) => spawnSync(process.execPath, [join(project, 'scripts', script), ...args],
        {cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
    const ok = (script, args, cwd) => {
        const r = run(script, args, cwd); assert.equal(r.status, 0, r.stderr || r.stdout); return JSON.parse(r.stdout);
    };
    let sequence = 0;
    const event = payload => ok('worker-state.mjs', ['event', '--file', file, '--json', JSON.stringify({id: `fixture-${++sequence}`, ...payload})]);
    ok('worker-state.mjs', ['init', '--run', 'trial-fixture', '--file', file]);
    for (const [name, path, branch] of [['Prep', prep, 'prep'], ['Worker-1', worker, 'worker']])
        event({type: 'register', worker: name, worktree: path, branch, base, handle: `fixture-${name}`});
    ok('work-queue.mjs', ['enable', '--prep', prep, '--file', file]);
    save(join(root, '.cache/queue.json'), {mode: 'work', sessions: [], blockers: [], synthetic: {batches: []}});
    ok('work-queue.mjs', ['refresh', '--queue', '.cache/queue.json', '--file', file]);
    const sourceTrial = {...SOURCE_TRIAL, assignmentBase: base};
    const assignment = {id: SOURCE_TRIAL.id, goal: SOURCE_TRIAL.id, type: 'implementation', output: 'implementation',
        producer: 'Main', recipient: 'Main', question: 'Frozen production capability trial fixture, no game execution.',
        stop: 'Stop on dependency expansion or cap.', base, sessions: [], dependencies: [],
        reservations: SOURCE_TRIAL_UNITS.map(unit => `source:${unit}`), allowedPaths: [...SOURCE_TRIAL_PATHS],
        checks: ['focused', 'lint'], artifacts: [], sourceTrial};
    const enqueue = () => {save(join(root, '.cache/assignment.json'), assignment);
        return run('work-queue.mjs', ['enqueue', '--json', '.cache/assignment.json', '--file', file]);};
    return {root, worker, file, base, save, run, ok, event, sourceTrial, assignment, enqueue};
}

test('real CLI freezes the one trial through enqueue/claim/submit and received goal registration', t => {
    const f = fixture(t);
    // Every rejected enqueue must preserve both the ledger and worker branch.
    const original = structuredClone(f.assignment), before = readFileSync(f.file, 'utf8');
    for (const mutate of [a => {delete a.sourceTrial;}, a => {a.sourceTrial.reviewSha256 = 'a'.repeat(64);},
        a => {a.allowedPaths.push('js/trap.js');}, a => {a.id = 'another-source-task';},
        a => {a.sourceTrial.reviewedBase = 'b'.repeat(40);}, a => {a.reservations.pop();}]) {
        Object.assign(f.assignment, structuredClone(original)); mutate(f.assignment);
        assert.notEqual(f.enqueue().status, 0);
        assert.equal(readFileSync(f.file, 'utf8'), before);
    }
    Object.assign(f.assignment, original);
    // A real changed base cannot reuse the source review, before any enqueue.
    writeFileSync(join(f.root, 'js/detect.js'), readFileSync(join(f.root, 'js/detect.js'), 'utf8') + '\n// Changed source identity.\n');
    git(f.root, 'add', 'js/detect.js'); git(f.root, 'commit', '-qm', 'Changed source fixture');
    const changedBase = git(f.root, 'rev-parse', 'HEAD');
    f.assignment.base = changedBase; f.assignment.sourceTrial = {...f.sourceTrial, assignmentBase: changedBase};
    assert.match(f.enqueue().stderr, /reviewed identity changed: js\/detect.js/);
    assert.equal(readFileSync(f.file, 'utf8'), before);
    git(f.root, 'reset', '--hard', f.base); // Disposable fixture only.
    Object.assign(f.assignment, original);
    assert.equal(f.enqueue().status, 0);
    // Replaying a well-shaped event is not enough: claim checks Git identities
    // again. Inject an otherwise eligible changed base in this private fixture.
    const enqueued = readFileSync(f.file, 'utf8'), forged = JSON.parse(enqueued);
    for (const event of forged.events) {
        if (['queue-enable', 'queue-refresh'].includes(event.type)) event.base = changedBase;
        if (event.type === 'queue-enqueue') {
            event.assignment.base = changedBase;
            event.assignment.sourceTrial.assignmentBase = changedBase;
        }
    }
    f.save(f.file, forged);
    const branch = git(f.worker, 'branch', '--show-current'), forgedBytes = readFileSync(f.file, 'utf8');
    assert.match(f.run('work-queue.mjs', ['claim', '--worker', 'Worker-1', '--file', f.file], f.worker).stderr, /reviewed identity changed/);
    assert.equal(readFileSync(f.file, 'utf8'), forgedBytes);
    assert.equal(git(f.worker, 'branch', '--show-current'), branch);
    writeFileSync(f.file, enqueued);
    const claim = f.ok('work-queue.mjs', ['claim', '--worker', 'Worker-1', '--file', f.file], f.worker);
    assert.deepEqual(claim.sourceTrial, f.sourceTrial);
    const context = {goal: SOURCE_TRIAL.id, kind: 'file-port', cFile: 'detect.c', functions: ['find_trap'], sessions: [],
        requiredFunctions: [{sourceFile: 'detect.c', name: 'dosearch0'}, {sourceFile: 'detect.c', name: 'dosearch'}],
        sourceTrial: f.sourceTrial};
    const evidence = {evidenceBasis: SOURCE_TRIAL.evidenceBasis, entryPointReview: 'Constructed-state transport fixture only; no parity or completion proof.',
        entryPoints: [{name: 'explicit-search', functions: ['find_trap', 'dosearch0', 'dosearch'], recordings: []}],
        functions: ['find_trap', 'dosearch0', 'dosearch'].map(name => ({name, implementation: 'js/detect.js', pure: false,
            sourceReview: 'Frozen source units, no game execution in this CLI fixture.',
            callers: [{path: 'js/detect.js', symbol: name === 'find_trap' ? 'dosearch0' : 'dosearch', source: 'detect.c source caller fixture'}],
            tests: ['scripts/detect.test.mjs'], recordings: []}))};
    f.save(join(f.worker, '.cache/context.json'), context); f.save(join(f.worker, '.cache/evidence.json'), evidence);
    writeFileSync(join(f.worker, '.cache/check.log'), 'CLI transport fixture receipt; no game test was run.\n');
    f.save(join(f.worker, '.cache/checks.json'), ['focused', 'lint'].map(kind => ({kind, command: ['fixture', kind], exitCode: 0,
        log: join(f.worker, '.cache/check.log')})));
    // A real committed scoped edit, not an empty delivery; no gameplay changed.
    writeFileSync(join(f.worker, 'js/detect.js'), readFileSync(join(f.worker, 'js/detect.js'), 'utf8') + '\n// Transport fixture only.\n');
    git(f.worker, 'add', 'js/detect.js'); git(f.worker, 'commit', '-qm', 'Scoped trial transport fixture');
    // Source evidence reads the pinned C object, never executes C.
    const cGit = existsSync(join(project, 'nethack-c/upstream/.git'))
        ? git(join(project, 'nethack-c/upstream'), 'rev-parse', '--absolute-git-dir')
        : git(project, 'rev-parse', '--path-format=absolute', '--git-common-dir') + '/modules/nethack-c/upstream';
    git(f.worker, 'clone', '--shared', '--no-checkout', cGit, 'nethack-c/upstream');
    const submit = ['submit', '--task', claim.transport, '--file', f.file, '--context', '.cache/context.json',
        '--evidence', '.cache/evidence.json', '--checks', '.cache/checks.json'];
    const claimedBytes = readFileSync(f.file, 'utf8');
    const refusedScope = f.run('worker-state.mjs', ['event', '--file', f.file, '--json', JSON.stringify({id: 'bad-scope',
        type: 'scope', task: claim.transport, reservations: f.assignment.reservations,
        allowedPaths: [...SOURCE_TRIAL_PATHS, 'js/trap.js']})], f.worker);
    assert.match(refusedScope.stderr, /source trial scope is frozen/);
    assert.equal(readFileSync(f.file, 'utf8'), claimedBytes);
    for (const mutate of [e => {delete e.evidenceBasis;}, e => {e.functions[0].pure = true;},
        e => {e.functions[0].tests = [];}, e => {e.functions[0].callers = [];},
        e => {e.functions[0].inactiveReason = 'Not runtime proof';}, e => {e.entryPoints = [];},
        e => {Object.assign(e.functions[0], {implementation: 'js/display.js', symbol: 'newsym'});}]) {
        const invalid = structuredClone(evidence); mutate(invalid);
        f.save(join(f.worker, '.cache/evidence.json'), invalid);
        assert.notEqual(f.run('worker-state.mjs', submit, f.worker).status, 0);
        assert.equal(readFileSync(f.file, 'utf8'), claimedBytes);
        assert.equal(existsSync(`${f.file}.deliveries`), false);
    }
    f.save(join(f.worker, '.cache/evidence.json'), evidence);
    context.requiredFunctions.pop(); f.save(join(f.worker, '.cache/context.json'), context);
    assert.notEqual(f.run('worker-state.mjs', submit, f.worker).status, 0);
    assert.equal(readFileSync(f.file, 'utf8'), claimedBytes);
    assert.equal(existsSync(`${f.file}.deliveries`), false);
    context.requiredFunctions.push({sourceFile: 'detect.c', name: 'dosearch'});
    f.save(join(f.worker, '.cache/context.json'), context);
    const state = f.ok('worker-state.mjs', submit, f.worker), revision = git(f.worker, 'rev-parse', 'HEAD');
    assert.equal(state.queue.tasks[SOURCE_TRIAL.id].status, 'completed');
    const packet = JSON.parse(readFileSync(state.deliveries[revision].evidence));
    assert.equal(packet.evidenceBasis, SOURCE_TRIAL.evidenceBasis);
    assert.deepEqual(packet.context.sourceTrial, f.sourceTrial);
    f.event({type: 'received', task: claim.transport, delivery: revision});
    // Register with the actual goal CLI in its own disposable PROJECT_ROOT.
    for (const name of readdirSync(join(project, 'scripts')).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')))
        cpSync(join(project, 'scripts', name), join(f.root, 'scripts', name));
    cpSync(join(project, 'frozen'), join(f.root, 'frozen'), {recursive: true});
    git(f.root, 'clone', '--shared', '--no-checkout', cGit, 'nethack-c/upstream');
    mkdirSync(join(f.root, 'nethack-c/upstream/src'), {recursive: true});
    const source = spawnSync('git', ['--git-dir', cGit, 'show', '16ff59115315917b93185d026aeefea06db9b0f4:src/detect.c']);
    assert.equal(source.status, 0); writeFileSync(join(f.root, 'nethack-c/upstream/src/detect.c'), source.stdout);
    const register = spawnSync(process.execPath, [join(f.root, 'scripts/goal-log.mjs'), 'register-task-goal', '--task', claim.transport, '--ledger', f.file],
        {cwd: f.root, encoding: 'utf8'});
    assert.equal(register.status, 0, register.stderr);
    const goal = JSON.parse(readFileSync(join(f.root, 'GOALS.json'))).goals[0];
    assert.deepEqual(goal.sourceTrial, f.sourceTrial);
    const goalBytes = readFileSync(join(f.root, 'GOALS.json'), 'utf8');
    goal.sourceTrial.assignmentBase = changedBase;
    f.save(join(f.root, 'GOALS.json'), {goals: [goal]});
    const changedGoalBytes = readFileSync(join(f.root, 'GOALS.json'), 'utf8');
    const wrongGoal = spawnSync(process.execPath, [join(f.root, 'scripts/goal-log.mjs'), 'register-task-goal', '--task', claim.transport, '--ledger', f.file],
        {cwd: f.root, encoding: 'utf8'});
    assert.match(wrongGoal.stderr, /registered source trial goal differs/);
    assert.equal(readFileSync(join(f.root, 'GOALS.json'), 'utf8'), changedGoalBytes);
    writeFileSync(join(f.root, 'GOALS.json'), goalBytes);
    goal.sourceTrial = f.sourceTrial;
    assert.deepEqual(completedSourceUnits({...goal, evidence: packet}), []);
    assert.throws(() => recordEvidence(goal, packet, revision), /separate ordinary runtime certification/);
    assert.throws(() => assertPortComplete(goal), /do not certify/);
});
