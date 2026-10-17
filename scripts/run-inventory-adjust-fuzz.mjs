#!/usr/bin/env node
// ONE finite fast-check pilot; no automatic discovery/admission or game edits.
// C invent.c:4981 doorganize -> 5068 doorganize_core accepts alphabetic slots;
// a nonmergeable occupied destination swaps, same slot collects. The unique
// starting wielded spear follows the declared destination after each operation.
// Existing runDifferential/runFreshMatrix delete scratch or stop at one miss.
// Reuse their recorder, official overlay and worker here, retaining each attempt.
import fc from 'fast-check';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {decodeScreen} from '../frozen/screen-decode.mjs';
import {recordSegment, canonicalRecorderIsDst} from './record-session.mjs';
import {assertRecordingMatchesRecipe, validateCleanRecipe, runJsSession, compareSessionOutputs} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace, PROJECT_ROOT} from './scoring-workspace.mjs';
import {verifyComparisonWorkspace} from './prep-comparison.mjs';

export const PILOT = Object.freeze({
    id: 'inventory-adjust-fast-check-20261017', seed: 971017, samples: 16,
    maxEvaluations: 27, maxShrinkEvaluations: 9, maxMs: 600000, caseMs: 10000,
    reviewedGameBase: '5957d0cefd7a25c2dc857a3cfbbb0b1220c818f6',
    recipe: 'recipes/invent.c/adjust-inventory-slots.session.json',
    recipeSha256: '65c9590067c0430d24912e8d7103ab83b727b99fa9d394450f721066ca7e1a0c',
    prior: ['v91-inventory-adjust-occupied-letter-swap-cfirst-20261016',
        'v96-empty-inventory-adjust-feedback-cfirst-20261016'],
});
export const SLOTS = Object.freeze(['a', 'b', 'c', 'd', 'y', 'z', 'A', 'Z']);
const domain = () => fc.array(fc.constantFrom(...SLOTS), {minLength: 1, maxLength: 3});
const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const frozen = (path, value) => fs.writeFile(path, json(value), {flag: 'wx'});
const rows = step => decodeScreen(step?.screen ?? '').map(row => row.map(c => c.ch).join('').trimEnd());

export function generatedCases() {
    return fc.sample(domain(), {seed: PILOT.seed, numRuns: PILOT.samples});
}

export function buildCase(base, destinations = []) {
    validateCleanRecipe(base, 'inventory-adjust base');
    if (base.segments.length !== 1 || base.segments[0].moves !== '.#adjust\naz')
        throw new Error('pilot requires the exact reviewed setup prefix');
    if (!Array.isArray(destinations) || destinations.length > 3
        || destinations.some(s => !SLOTS.includes(s))) throw new Error('invalid finite suffix');
    const recipe = structuredClone(base), steps = [];
    const seg = recipe.segments[0];
    let current = 'z';
    for (const to of destinations) {
        const offset = seg.moves.length;
        steps.push({from: current, to, selectFrame: offset + 8,
            destinationFrame: offset + 9, resultFrame: offset + 10});
        seg.moves += `#adjust\n${current}${to}`;
        current = to;
    }
    const inventoryFrame = seg.moves.length + 1;
    if (destinations.length) seg.moves += 'i\u001b';
    return {recipe, steps, finalSlot: current, inventoryFrame};
}

// C-side public observations only; a target miss is never a differential bug.
export function validateTarget(base, built, recording, calibration = null) {
    try { assertRecordingMatchesRecipe(recording, built.recipe); }
    catch (error) { return {valid: false, reason: error.message}; }
    const frames = recording.segments[0].steps;
    const prefixEnd = base.segments[0].moves.length;
    const setup = rows(frames[prefixEnd])[0];
    if (!/^Moving: z - .+ spear \(weapon in right hand\)\.$/u.test(setup))
        return {valid: false, reason: 'wielded spear not observed at frozen setup slot z'};
    if (frames.length !== built.recipe.segments[0].moves.length + 1)
        return {valid: false, reason: 'missing input boundary'};
    if (calibration && !isDeepStrictEqual(frames.slice(0, prefixEnd + 1),
        calibration.segments[0].steps)) return {valid: false, reason: 'C setup prefix changed'};
    for (const op of built.steps) {
        if (!rows(frames[op.selectFrame])[0].startsWith('What do you want to adjust?')
            || !rows(frames[op.destinationFrame])[0].startsWith('Adjust letter to what ['))
            return {valid: false, reason: 'unknown or unresolved adjustment prompt'};
        const line = rows(frames[op.resultFrame])[0];
        if (!new RegExp(`^(Moving|Swapping|Collecting): ${op.to} - .+ spear \\(weapon in right hand\\)\\.$`, 'u').test(line))
            return {valid: false, reason: 'tracked weapon destination not observed'};
    }
    const inventory = built.steps.length ? rows(frames[built.inventoryFrame]) : [];
    if (built.steps.length && !inventory.some(line => new RegExp(
        `^\\s*${built.finalSlot} [-+] .+ spear \\(weapon in right hand\\)\\.?$`, 'u').test(line)))
        return {valid: false, reason: 'final public inventory observer absent'};
    return {valid: true, setup, finalSlot: built.finalSlot, inventory};
}

export function classify(result, prefixEnd) {
    if (result.cStatus === 'runner-error') return {classification: 'runner-error'};
    if (result.cStatus !== 'static-complete') return {classification: result.cStatus === 'time-cap'
        ? 'timeout' : 'recorder-failure'};
    if (!result.target?.valid) return {classification: 'setup-failure'};
    const c = result.comparison;
    if (!c || c.error) return {classification: 'js-error'};
    if (c.passed) return {classification: 'matched'};
    const first = [['rng', c.rngMismatch], ['screen', c.screenMismatch], ['cursor', c.cursorMismatch]]
        .filter(([, d]) => d).sort((a, b) =>
            (a[1].location?.stepIndex ?? -1) - (b[1].location?.stepIndex ?? -1))[0];
    if (!first) return {classification: 'supplemental-or-unlocated-difference'};
    const [channel, diff] = first;
    if (diff.location?.segmentIndex !== 0 || !Number.isInteger(diff.location?.stepIndex))
        return {classification: 'supplemental-or-unlocated-difference'};
    if (diff.location.stepIndex <= prefixEnd) return {classification: 'pre-suffix-difference'};
    const kind = diff.kind ?? (channel === 'rng'
        ? (diff.jsEntry === undefined ? 'js-missing' : diff.cEntry === undefined ? 'c-missing' : 'value')
        : diff.jsCursor === undefined ? 'js-missing' : 'value');
    return {classification: 'candidate-difference', category: `${channel}:${kind}`,
        location: diff.location};
}

export async function runPilot({base, output, evaluate, now = Date.now, onlyCase = null}) {
    if (onlyCase !== null && (!Number.isInteger(onlyCase) || onlyCase < 0 || onlyCase >= PILOT.samples))
        throw new Error('case must be an original sample index 0..15');
    await fs.mkdir(output, {recursive: false});
    const started = now(), deadline = started + PILOT.maxMs, samples = generatedCases();
    const plan = {...PILOT, startedAt: new Date(started).toISOString(), activeEffort: 'unknown',
        base, samples: samples.map((operations, index) => ({index, operations,
            recipe: buildCase(base, operations).recipe})), onlyCase,
        caps: '1 calibration + <=16 generated + <=9 shrink/reproduction (includes original replay) + <=1 best replay = <=27 C runs',
        shrink: 'official fc.check examples shrink; require C setup/target and original first-divergence category; original saved first',
        stop: 'first eligible difference; calibration miss; any timeout/runner failure; total cap; no prompt repair/replacement'};
    await frozen(join(output, 'plan.json'), plan);
    const results = [], classifications = {}, samplesStatus = samples.map(() => 'unrun');
    let calibration, original, best, originalReproduced = false, bestReproduced = false;
    let shrinkEvaluations = 0, shrinkBudgetDeferred = false, stop = null;
    async function perform(phase, operations, sampleIndex = null) {
        if (results.length >= PILOT.maxEvaluations || now() >= deadline) { stop = 'budget'; return null; }
        const id = String(results.length).padStart(2, '0');
        const directory = join(output, `case-${id}`); await fs.mkdir(directory);
        const built = buildCase(base, operations);
        await frozen(join(directory, 'input.session.json'), built.recipe);
        const began = now(); let raw;
        try { raw = await evaluate({phase, operations, built, directory, deadline,
            calibration: calibration?.raw.recording, perProcessMs: PILOT.caseMs}); }
        catch (error) { raw = {cStatus: 'runner-error', error: error.message}; }
        const result = {...classify(raw, base.segments[0].moves.length), id, phase, operations,
            sampleIndex, elapsedMs: now() - began, raw: {...raw}};
        delete result.raw.recording; // full bytes retained once in engine's capture file
        await frozen(join(directory, 'evaluation.json'), result);
        results.push(result); classifications[result.classification] = (classifications[result.classification] ?? 0) + 1;
        return {...result, raw};
    }
    calibration = await perform('calibration', []);
    if (calibration?.classification !== 'matched') stop = 'calibration-not-parity-clean';
    for (const [index, operations] of samples.entries()) {
        if (stop || (onlyCase !== null && index !== onlyCase)) continue;
        const result = await perform('generated', operations, index);
        if (!result) break;
        samplesStatus[index] = result.classification;
        if (result.classification === 'candidate-difference') {
            original = best = result;
            await frozen(join(output, 'original-failure.json'), {...result,
                raw: undefined, input: buildCase(base, operations).recipe});
            break;
        }
        if (result.classification !== 'matched') stop = result.classification;
    }
    let shrink = null;
    if (original && !stop) {
        const details = await fc.check(fc.asyncProperty(domain(), async operations => {
            if (stop) return true;
            if (shrinkEvaluations >= PILOT.maxShrinkEvaluations || now() >= deadline) {
                if (now() >= deadline) stop = 'budget';
                shrinkBudgetDeferred = true; return true;
            }
            shrinkEvaluations++;
            const result = await perform('shrink', operations);
            if (!result) { shrinkBudgetDeferred = true; return true; }
            const same = result.classification === 'candidate-difference' && result.category === original.category;
            if (shrinkEvaluations === 1) {
                originalReproduced = same && result.raw.recordingSha256 === original.raw.recordingSha256
                    && isDeepStrictEqual(result.raw.comparison, original.raw.comparison);
                if (!originalReproduced) stop = 'original-not-reproduced';
            }
            if (!['matched', 'candidate-difference'].includes(result.classification)) stop = result.classification;
            if (stop) return true;
            if (same) best = result;
            return !same;
        }), {seed: PILOT.seed, numRuns: 1, examples: [[original.operations]], endOnFailure: false});
        shrink = {seed: details.seed, path: details.counterexamplePath, counterexample: details.counterexample,
            numShrinks: details.numShrinks, evaluations: shrinkEvaluations,
            budgetDeferred: shrinkBudgetDeferred, minimalityClaimed: false};
        if (originalReproduced && !stop) {
            const replay = await perform('best-independent-replay', best.operations);
            bestReproduced = Boolean(replay && replay.classification === 'candidate-difference'
                && replay.category === original.category && replay.raw.recordingSha256 === best.raw.recordingSha256
                && isDeepStrictEqual(replay.raw.comparison, best.raw.comparison));
        }
    }
    const summary = {pilot: PILOT.id, seed: PILOT.seed, startedAt: plan.startedAt,
        endedAt: new Date(now()).toISOString(), elapsedMs: now() - started, activeEffort: 'unknown',
        evaluations: results.length, classifications, samplesStatus,
        physicalCStarts: results.filter(r => r.raw.cLaunched === true).length,
        unknownCLaunches: results.filter(r => r.raw.cLaunched === undefined).length,
        physicalJsStarts: results.filter(r => r.raw.jsLaunched === true).length,
        generatedRun: samplesStatus.filter(s => s !== 'unrun').length,
        unrun: samplesStatus.filter(s => s === 'unrun').length,
        stop: stop ?? (original ? 'first-candidate' : 'finite-sample-complete'),
        original: original?.id ?? null, best: best?.id ?? null, originalReproduced, bestReproduced, shrink,
        reproducibleDifferenceCandidates: originalReproduced && bestReproduced ? 1 : 0,
        distinctSourceConfirmedCauses: null, admittedCases: 0,
        next: original ? 'Independent owner reviews original/minimized evidence against named priors and source; normal admission only. No auto discovery/fix.'
            : 'Useful bounded negative if calibration and all scheduled cases matched; unrun/invalid/timeout remain explicit.'};
    await frozen(join(output, 'summary.json'), summary);
    return summary;
}

export async function createEvaluator({root = PROJECT_ROOT, comparison, binary, install}) {
    const git = (...args) => execFileSync('git', ['-C', root, ...args]);
    comparison = git('rev-parse', '--verify', `${comparison}^{commit}`).toString().trim();
    if (git('rev-parse', 'HEAD').toString().trim() !== comparison)
        throw new Error('run from the exact accepted comparison checkout');
    git('diff', '--exit-code', comparison, '--', 'js', 'frozen', 'package.json',
        'scripts/run-inventory-adjust-fuzz.mjs', 'scripts/record-session.mjs',
        'scripts/diff-fresh.mjs', 'scripts/scoring-workspace.mjs', 'scripts/prep-comparison.mjs');
    // Tooling publication may advance Main, but reviewed game/C identities may not.
    git('diff', '--exit-code', PILOT.reviewedGameBase, comparison, '--', 'js', 'frozen', 'nethack-c/upstream', PILOT.recipe);
    const baseBytes = await fs.readFile(join(root, PILOT.recipe));
    if (digest(baseBytes) !== PILOT.recipeSha256) throw new Error('reviewed setup recipe changed');
    const base = JSON.parse(baseBytes);
    const provenance = {comparison, binary: resolve(binary), binarySha256: digest(await fs.readFile(binary)),
        cGitlink: git('rev-parse', `${comparison}:nethack-c/upstream`).toString().trim(),
        packageVersion: fc.__version, packageLockSha256: digest(await fs.readFile(join(root, 'package-lock.json'))),
        runtime: {node: process.version, platform: process.platform, arch: process.arch},
        rawTerminalBytesRetained: false};
    return async ({built, directory, deadline, calibration, perProcessMs}) => {
        await frozen(join(directory, 'provenance.json'), provenance);
        if (Date.now() >= deadline) return {cStatus: 'time-cap', cLaunched: false, jsLaunched: false};
        const scratch = await fs.mkdtemp(join(tmpdir(), 'nh-adjust-fc-'));
        const privateInstall = join(scratch, 'install');
        let workspace;
        try {
            await fs.cp(install, privateInstall, {recursive: true});
            const seg = built.recipe.segments[0];
            const cStarted = Date.now();
            const result = await recordSegment({seg, isFirstSegment: true, binary: resolve(binary),
                installDir: privateInstall, rngLogPath: join(directory, 'core-rng.log'),
                homeDir: join(directory, 'home'), tz: 'America/New_York',
                preserveFailure: true, deadline: Math.min(deadline, Date.now() + perProcessMs),
                onReceipt: e => fs.appendFile(join(directory, 'c-receipts.jsonl'),
                    `${JSON.stringify({at: new Date().toISOString(), ...e})}\n`, {flush: true})});
            await frozen(join(directory, 'c-outcome.json'), {...result, steps: undefined,
                startedAt: new Date(cStarted).toISOString(), endedAt: new Date().toISOString(),
                elapsedMs: Date.now() - cStarted});
            // preserveFailure's static result.moves is empty; retain it honestly
            // above, and use the immutable recipe verified against actual keys.
            const recording = {...built.recipe, segments: [{...seg,
                recorderIsDst: canonicalRecorderIsDst(), steps: result.steps}]};
            const bytes = json(recording), recordingSha256 = digest(bytes);
            await fs.writeFile(join(directory, 'capture.session.json'), bytes, {flag: 'wx'});
            const target = validateTarget(base, built, recording, calibration);
            const command = result.promptResult?.command;
            const timeout = ['deadline-exhausted', 'time-cap'].includes(result.promptResult?.status)
                || command?.error?.includes('total time cap')
                || command?.error?.startsWith('recorder timeout:');
            const raw = {cStatus: timeout ? 'time-cap' : result.promptResult?.status,
                cLaunched: command?.launched, jsLaunched: false, target, recording, recordingSha256};
            if (!isDeepStrictEqual(result.steps.map(s => s.key), [null, ...seg.moves]))
                return {...raw, cStatus: timeout ? 'time-cap' : 'recorder-failure', reason: 'actual keys differ from recipe'};
            if (raw.cStatus !== 'static-complete' || !target.valid) return raw;
            const remaining = deadline - Date.now();
            if (remaining <= 0) return {...raw, cStatus: 'time-cap'};
            workspace = createScoringWorkspace(directory, ['capture.session.json']);
            // Verify the official overlay against the actual immutable pin before/after.
            verifyComparisonWorkspace(root, workspace, comparison);
            const argv = [fileURLToPath(import.meta.url), '--worker', join(directory, 'capture.session.json'), workspace,
                comparison, join(directory, 'js-output.json')];
            const began = Date.now();
            await frozen(join(directory, 'js-command.json'), {executable: process.execPath, argv,
                startedAt: new Date(began).toISOString(), timeoutMs: Math.min(perProcessMs, remaining)});
            // Copying/verifying the scorer and writing metadata consume budget.
            const launchRemaining = deadline - Date.now();
            if (launchRemaining <= 0) {
                await frozen(join(directory, 'js-outcome.json'), {launched: false, status: 'time-cap'});
                return {...raw, cStatus: 'time-cap'};
            }
            const child = spawnSync(process.execPath, argv, {cwd: root, encoding: 'utf8',
                timeout: Math.min(perProcessMs, launchRemaining), maxBuffer: 16 * 1024 * 1024});
            raw.jsLaunched = !['ENOENT', 'EACCES'].includes(child.error?.code);
            await fs.writeFile(join(directory, 'js-stdout.log'), child.stdout ?? '', {flag: 'wx'});
            await fs.writeFile(join(directory, 'js-stderr.log'), child.stderr ?? '', {flag: 'wx'});
            await frozen(join(directory, 'js-outcome.json'), {launched: !['ENOENT', 'EACCES'].includes(child.error?.code),
                timeoutMs: Math.min(perProcessMs, launchRemaining), exitCode: child.status, signal: child.signal,
                error: child.error?.message ?? null, endedAt: new Date().toISOString(), elapsedMs: Date.now() - began});
            if (child.error || child.status !== 0) return {...raw,
                cStatus: child.error?.code === 'ETIMEDOUT' ? 'time-cap' : 'runner-error'};
            const marker = '__FRESH_DIFF_RESULT__\n', at = child.stdout.lastIndexOf(marker);
            if (at < 0) throw new Error('missing canonical JS comparison result');
            raw.comparison = JSON.parse(child.stdout.slice(at + marker.length));
            verifyComparisonWorkspace(root, workspace, comparison);
            await frozen(join(directory, 'comparison.json'), raw.comparison);
            const jsOutput = JSON.parse(await fs.readFile(join(directory, 'js-output.json'), 'utf8'));
            const jsInventoryScreen = jsOutput.screens[built.inventoryFrame];
            raw.observable = {basis: 'public rendered inventory; no hidden state',
                trackedSlot: built.finalSlot, cInventory: target.inventory,
                jsInventory: jsInventoryScreen ? rows({screen: jsInventoryScreen}) : null};
            await frozen(join(directory, 'observable-state.json'), raw.observable);
            return raw;
        } finally {
            if (workspace) removeScoringWorkspace(workspace);
            await fs.rm(scratch, {recursive: true, force: true});
        }
    };
}

const HELP = 'Usage: node scripts/run-inventory-adjust-fuzz.mjs --run NEW_OUTPUT --comparison ACCEPTED_SHA --binary RECORDER --install DATA [--case 0..15]\nFrozen domain/caps in PILOT; first failure stops, bounded category-preserving shrink; no admission. Exit0 means receipt written; inspect summary, not a parity/admission verdict.\n';
async function main() {
    // Pilot-specific isolated worker. Reuse the exact public replay/comparator
    // exports, retaining complete JS streams which the ordinary worker discards.
    if (process.argv[2] === '--worker') {
        const [capture, workspace, pin, output] = process.argv.slice(3);
        if (!capture || !workspace || !pin || !output || process.argv.length !== 7) throw new Error('invalid pilot worker arguments');
        const bytes = await fs.readFile(capture);
        verifyComparisonWorkspace(process.cwd(), workspace, pin);
        const recording = JSON.parse(bytes), jsOutput = await runJsSession(recording, workspace);
        await frozen(output, jsOutput);
        verifyComparisonWorkspace(process.cwd(), workspace, pin);
        if (!bytes.equals(await fs.readFile(capture))) throw new Error('C capture changed during comparison');
        const comparison = compareSessionOutputs(recording, jsOutput);
        comparison.provenance = {commit: pin, recordingSha256: digest(bytes)};
        process.stdout.write(`__FRESH_DIFF_RESULT__\n${JSON.stringify(comparison)}\n`);
        return;
    }
    if (process.argv.includes('--help')) { process.stdout.write(HELP); return; }
    const flags = {};
    for (let i = 2; i < process.argv.length; i += 2) {
        const name = process.argv[i], value = process.argv[i + 1];
        if (!['--run', '--comparison', '--binary', '--install', '--case'].includes(name)
            || !value || flags[name]) throw new Error(HELP);
        flags[name] = value;
    }
    if (['--run', '--comparison', '--binary', '--install'].some(k => !flags[k])) throw new Error(HELP);
    const base = JSON.parse(await fs.readFile(join(PROJECT_ROOT, PILOT.recipe), 'utf8'));
    const evaluate = await createEvaluator({comparison: flags['--comparison'],
        binary: flags['--binary'], install: flags['--install']});
    const summary = await runPilot({base, output: resolve(flags['--run']), evaluate,
        onlyCase: flags['--case'] === undefined ? null : Number(flags['--case'])});
    process.stdout.write(json(summary));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });
