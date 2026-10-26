#!/usr/bin/env node
// Bounded evidence capture around the existing differential, not a gameplay loop.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDifferential, validateCleanRecipe } from './diff-fresh.mjs';
import { decodeScreen } from '../frozen/screen-decode.mjs';
import { normalizeSession } from '../frozen/session_loader.mjs';
import { PROJECT_ROOT } from './c-functions.mjs';
import { diagnosticEnvironment, executionContext, assertExecutionContext } from './structural-context.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
export const plainScreen = screen => decodeScreen(screen).map(row => row.map(cell => cell.ch).join('').trimEnd()).join('\n');
export function validateSpec(spec) {
    if (spec.version !== 1 || !Array.isArray(spec.cases) || !spec.cases.length || spec.cases.length > 32)
        throw new Error('spec requires 1..32 explicit cases and version 1');
    const ids = new Set();
    for (const entry of spec.cases) {
        if (!/^[a-z0-9][a-z0-9-]*$/u.test(entry.id) || ids.has(entry.id)) throw new Error('invalid or duplicate case id');
        ids.add(entry.id);
        validateCleanRecipe(entry.recipe, entry.id);
        if (entry.recipe.segments.length !== 1 || entry.recipe.segments[0].moves.length > 2000)
            throw new Error('each diagnostic case requires one segment and at most 2000 input characters');
        if (!Array.isArray(entry.expectC) || entry.expectC.some(text => typeof text !== 'string' || !text.length))
            throw new Error('expectC must explicitly list C setup/target observations (empty is allowed for a control)');
    }
    return spec;
}

export function observations(recording, needles) {
    const steps = normalizeSession(recording).segments[0].steps;
    const screens = steps.map(step => plainScreen(step.screen));
    return needles.map(text => ({ text, steps: screens.flatMap((screen, step) => screen.includes(text) ? [step] : []),
        onsets: screens.flatMap((screen, step) => screen.includes(text) && !screens[step - 1]?.includes(text) ? [step] : []) }));
}

export function orderedObservations(seen, lastStep = Infinity) {
    let previous = 0;
    return seen.every(item => {
        const step = (item.onsets ?? item.steps).find(s => s >= previous && s <= lastStep);
        if (step === undefined) return false;
        previous = step;
        return true;
    });
}

export async function evaluateCase(entry, output, run = runDifferential, environment = diagnosticEnvironment()) {
    const startedAt = new Date().toISOString(), start = performance.now();
    save(join(output, `${entry.id}.recipe.json`), entry.recipe);
    let recording = null, result = null, error = null;
    try {
        result = await run(entry.recipe, environment, { transformRecording: data => {
            recording = data;
            save(join(output, `${entry.id}.session.json`), data);
            return data; // exact C bytes semantically; no normalization/substitution
        } });
    } catch (failure) { error = failure.message; }
    // The shared comparator can return a caught JS exception without throwing.
    // Preserve that result, but never count it as a behavioral divergence.
    error ??= result?.error ?? null;
    const seen = recording ? observations(recording, entry.expectC) : [];
    const setupPassed = Boolean(recording) && orderedObservations(seen);
    const status = error ? 'runner-error' : !setupPassed ? 'setup-failed' : result.passed ? 'parity' : 'divergence';
    const evidence = { id: entry.id, startedAt, wallMs: performance.now() - start, status, source: entry.source ?? null,
        controlFor: entry.controlFor ?? null, recipeSha256: digest(readFileSync(join(output, `${entry.id}.recipe.json`))),
        recordingSha256: recording ? digest(readFileSync(join(output, `${entry.id}.session.json`))) : null,
        observations: seen, setupPassed, environment, result, error,
        state: 'C recorder has no private state trace. Screens/RNG/cursors/animation are strict; do not infer earlier hidden-state equality.' };
    save(join(output, `${entry.id}.result.json`), evidence);
    return evidence;
}

export async function evaluateSpec(spec, output) {
    validateSpec(spec);
    if (existsSync(output)) throw new Error('output already exists; preserve earlier evidence and choose a new directory');
    mkdirSync(output, { recursive: true });
    const start = performance.now();
    const environment = diagnosticEnvironment();
    const context = executionContext(PROJECT_ROOT, environment);
    const provenance = { ...context, startedAt: new Date().toISOString() };
    save(join(output, 'spec.json'), spec);
    save(join(output, 'provenance.json'), provenance);
    const cases = [];
    for (const entry of spec.cases) {
        const evidence = await evaluateCase(entry, output, runDifferential, environment);
        cases.push(evidence);
        console.log(`${entry.id}: ${evidence.status} (${Math.round(evidence.wallMs)} ms)`);
    }
    assertExecutionContext(context);
    const summary = { ...provenance, wallMs: performance.now() - start, cases,
        counts: cases.reduce((counts, c) => ({ ...counts, [c.status]: (counts[c.status] ?? 0) + 1 }), {}) };
    save(join(output, 'summary.json'), summary);
    return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [specPath, output, ...rest] = process.argv.slice(2);
    if (specPath === '--help') console.log('node scripts/structural-cases.mjs <spec.json> <new-output-directory>\nExplicit bounded fresh C/JS cases; preserves every recipe, recording, result and source identity.');
    else if (!specPath || !output || rest.length) throw new Error('use --help');
    else evaluateSpec(JSON.parse(readFileSync(resolve(specPath), 'utf8')), resolve(output)).catch(error => {
        console.error(error.message); process.exitCode = 2;
    });
}
