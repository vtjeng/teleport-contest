import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PILOT, generatedCases, buildCase, validateTarget, classify, runPilot} from './run-inventory-adjust-fuzz.mjs';
import {canonicalRecorderIsDst} from './record-session.mjs';

const base = JSON.parse(await fs.readFile(new URL(`../${PILOT.recipe}`, import.meta.url)));
const anchor = JSON.parse(await fs.readFile(new URL('../recordings/invent.c/adjust-inventory-slots.session.json', import.meta.url)));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function scratch(t) {
    const root = await fs.mkdtemp(join(tmpdir(), 'adjust-fc-test-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    return join(root, 'run');
}
function capture(built) {
    const result = structuredClone(anchor), seg = result.segments[0];
    seg.moves = built.recipe.segments[0].moves;
    for (const key of [...seg.moves].slice(base.segments[0].moves.length))
        seg.steps.push({key, rng: [], screen: '', cursor: [0, 0, 1]});
    for (const op of built.steps) {
        seg.steps[op.selectFrame].screen = 'What do you want to adjust? [abcd or ?*]';
        seg.steps[op.destinationFrame].screen = 'Adjust letter to what [a-zA-Z] (? see used letters)?';
        seg.steps[op.resultFrame].screen = `Swapping: ${op.to} - a +1 spear (weapon in right hand).`;
    }
    if (built.steps.length) seg.steps[built.inventoryFrame].screen =
        `Weapons\n ${built.finalSlot} - a +1 spear (weapon in right hand)\n (end)`;
    return result;
}
function raw(built, difference = null) {
    return {cStatus: 'static-complete', target: {valid: true}, recording: capture(built),
        recordingSha256: hash(built.recipe), comparison: difference ?? {passed: true, error: null}};
}
function different(built, channel = 'screen') {
    const location = {segmentIndex: 0, stepIndex: base.segments[0].moves.length + 2, key: 'a'};
    return {passed: false, error: null, [`${channel}Mismatch`]: channel === 'screen'
        ? {kind: 'cell', location} : {cEntry: 'rn2(2)=0', jsEntry: 'rn2(2)=1', location}};
}

test('deterministic original plan is finite; current weapon follows swaps, uppercase and collect', () => {
    assert.deepEqual(generatedCases(), generatedCases());
    assert.equal(generatedCases().length, 16);
    const built = buildCase(base, ['b', 'A', 'A']);
    assert.deepEqual(built.steps.map(({from, to}) => [from, to]), [['z', 'b'], ['b', 'A'], ['A', 'A']]);
    assert.equal(built.recipe.segments[0].moves, `${base.segments[0].moves}#adjust\nzb#adjust\nbA#adjust\nAAi\u001b`);
    assert.throws(() => buildCase(base, ['$']), /finite suffix/u);
    assert.throws(() => buildCase(base, ['a', 'b', 'c', 'd']), /finite suffix/u);
    assert.equal(canonicalRecorderIsDst(new Date('2026-01-15T12:00:00Z')), false);
    assert.equal(canonicalRecorderIsDst(new Date('2026-07-15T12:00:00Z')), true);
});

test('C observation gate rejects changed prefix, wrong prompts, slot identity and absent inventory', () => {
    const built = buildCase(base, ['b', 'Z']), recording = capture(built);
    assert.equal(validateTarget(base, built, recording, anchor).valid, true);
    const cases = [
        x => { x.segments[0].steps[0].screen = 'changed prefix'; },
        x => { x.segments[0].steps[built.steps[0].destinationFrame].screen = '--More--'; },
        x => { x.segments[0].steps[built.steps[1].resultFrame].screen = 'Moving: b - wrong item'; },
        x => { x.segments[0].steps[built.inventoryFrame].screen = 'unresolved inventory prompt'; },
    ];
    for (const mutate of cases) {
        const bad = structuredClone(recording); mutate(bad);
        assert.equal(validateTarget(base, built, bad, anchor).valid, false);
    }
});

test('classification excludes errors/invalid setup/prefix and chooses first strict divergence', () => {
    const built = buildCase(base, ['A']), end = base.segments[0].moves.length;
    assert.equal(classify(raw(built), end).classification, 'matched');
    assert.equal(classify({...raw(built), cStatus: 'time-cap'}, end).classification, 'timeout');
    assert.equal(classify({...raw(built), cStatus: 'runner-error'}, end).classification, 'runner-error');
    assert.equal(classify({...raw(built), cStatus: 'recorder-failure'}, end).classification, 'recorder-failure');
    assert.equal(classify({...raw(built), target: {valid: false}}, end).classification, 'setup-failure');
    assert.equal(classify(raw(built, {error: 'unknown failure'}), end).classification, 'js-error');
    const d = different(built); d.screenMismatch.location.stepIndex = end;
    assert.equal(classify(raw(built, d), end).classification, 'pre-suffix-difference');
    const laterScreen = different(built), earlierRng = different(built, 'rng');
    earlierRng.rngMismatch.location.stepIndex--;
    assert.equal(classify(raw(built, {...laterScreen, ...earlierRng}), end).category, 'rng:value');
});

test('calibration failure runs no generated cases; all scheduled/unrun inputs were frozen first', async t => {
    const output = await scratch(t); let calls = 0;
    const summary = await runPilot({base, output, evaluate: async () => {
        calls++; const plan = JSON.parse(await fs.readFile(join(output, 'plan.json')));
        assert.equal(plan.samples.length, 16);
        return {cStatus: 'static-complete', target: {valid: false}};
    }});
    assert.equal(calls, 1); assert.equal(summary.unrun, 16);
    assert.equal(summary.stop, 'calibration-not-parity-clean');
});

test('finite negative counts usable cases honestly without inventing discoveries', async t => {
    const output = await scratch(t);
    const summary = await runPilot({base, output, evaluate: async ({built}) => raw(built)});
    assert.equal(summary.evaluations, 17); assert.equal(summary.generatedRun, 16);
    assert.equal(summary.classifications.matched, 17); assert.equal(summary.unrun, 0);
    assert.equal(summary.reproducibleDifferenceCandidates, 0);
    assert.equal(summary.distinctSourceConfirmedCauses, null);
    assert.equal(summary.admittedCases, 0);
    await assert.rejects(runPilot({base, output, evaluate: () => assert.fail('must not run')}), /EEXIST/u);
});

test('official fast-check shrink preserves original before evaluation and rejects changed category', async t => {
    const output = await scratch(t); const categories = [];
    const summary = await runPilot({base, output, evaluate: async ({phase, built, operations}) => {
        if (phase === 'calibration') return raw(built);
        if (phase === 'shrink') {
            const original = JSON.parse(await fs.readFile(join(output, 'original-failure.json')));
            assert.equal(original.classification, 'candidate-difference');
            assert.equal(original.input.segments[0].moves.startsWith(base.segments[0].moves), true);
        }
        const channel = operations.length > 1 ? 'screen' : 'rng'; categories.push(channel);
        // Wait for a multi-operation original; singleton generated cases are controls.
        if (phase === 'generated' && operations.length === 1) return raw(built);
        return raw(built, different(built, channel));
    }});
    assert.equal(summary.originalReproduced, true);
    assert.equal(summary.bestReproduced, true);
    assert.equal(summary.reproducibleDifferenceCandidates, 1);
    assert.equal(summary.shrink.minimalityClaimed, false);
    assert.ok(summary.evaluations <= PILOT.maxEvaluations);
    assert.ok(summary.shrink.evaluations <= PILOT.maxShrinkEvaluations);
    const best = JSON.parse(await fs.readFile(join(output, `case-${summary.best}`, 'evaluation.json')));
    assert.equal(best.category, 'screen:cell'); assert.ok(best.operations.length > 1);
    assert.ok(categories.includes('rng'), 'a smaller different-category case was evaluated but not adopted');
    assert.ok(summary.unrun > 0);
});

test('nonreproduction or elapsed cap stops without more physical evaluations', async t => {
    const output = await scratch(t); let calls = 0;
    const s = await runPilot({base, output, evaluate: async ({phase, built}) => {
        calls++; return raw(built, phase === 'generated' ? different(built) : null);
    }});
    assert.equal(s.stop, 'original-not-reproduced'); assert.equal(calls, 3);
    assert.equal(s.reproducibleDifferenceCandidates, 0);
    const output2 = await scratch(t); let clock = 0, calls2 = 0;
    const capped = await runPilot({base, output: output2, now: () => clock,
        evaluate: async ({phase, built}) => {
            calls2++; if (phase === 'generated') clock = PILOT.maxMs;
            return raw(built, phase === 'generated' ? different(built) : null);
        }});
    assert.equal(calls2, 2); assert.equal(capped.stop, 'budget');
    assert.equal(capped.originalReproduced, false);
});

test('real isolated pilot worker retains full API output and rejects mismatched pinned workspace', async t => {
    // Tiny fake contestant, no NetHack/C runtime. Exercise the real CLI boundary,
    // overlay pin check, raw output artifact and canonical comparator together.
    const output = await scratch(t), root = join(output, 'repo'), workspace = join(output, 'workspace');
    await fs.mkdir(join(root, 'js'), {recursive: true}); await fs.mkdir(join(root, 'frozen'));
    await fs.writeFile(join(root, 'package.json'), '{"type":"module"}');
    await fs.writeFile(join(root, 'js/jsmain.js'), `export async function runSegment() {
        return {getScreens:()=>['A'],getCursors:()=>[[0,0,1]],getRngLog:()=>[],
            getAnimationFramesByStep:()=>[[]]};
    }`);
    for (const name of ['isaac64.js', 'terminal.js', 'storage.js']) {
        await fs.writeFile(join(root, 'frozen', name), '// frozen fixture\n');
        await fs.writeFile(join(root, 'js', name), '// frozen fixture\n');
    }
    const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();
    git('init', '-q'); git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture');
    const pin = git('rev-parse', 'HEAD');
    await fs.mkdir(workspace);
    for (const name of ['js', 'frozen', 'package.json'])
        await fs.cp(join(root, name), join(workspace, name), {recursive: true});
    const capturePath = join(output, 'capture.json'), rawPath = join(output, 'js-output.json');
    await fs.writeFile(capturePath, JSON.stringify({version: 5, segments: [{seed: 1,
        datetime: '20310405060708', nethackrc: '', moves: '',
        steps: [{key: null, screen: 'A', cursor: [0, 0, 1], rng: []}]}]}));
    const script = fileURLToPath(new URL('./run-inventory-adjust-fuzz.mjs', import.meta.url));
    const run = path => spawnSync(process.execPath, [script, '--worker', capturePath, workspace, pin, path],
        {cwd: root, encoding: 'utf8', timeout: 5000});
    const good = run(rawPath); assert.equal(good.status, 0, good.stderr);
    assert.deepEqual(JSON.parse(await fs.readFile(rawPath)).screens, ['A']);
    assert.equal(JSON.parse(good.stdout.split('__FRESH_DIFF_RESULT__\n')[1]).passed, true);
    await fs.appendFile(join(workspace, 'js/jsmain.js'), '\n// unpinned edit');
    const rejectedPath = join(output, 'must-not-exist.json'), bad = run(rejectedPath);
    assert.equal(bad.status, 2); assert.match(bad.stderr, /workspace differs/u);
    await assert.rejects(fs.access(rejectedPath), /ENOENT/u);
});
