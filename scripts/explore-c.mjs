#!/usr/bin/env node
// explore-c.mjs — an adaptive driver for the patched C NetHack recorder.
//
// Each act replays the complete deterministic prefix with
// scripts/record-session.mjs. This keeps the pilot stateless between CLI
// invocations while retaining the canonical v5 recording for each action.

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeScreen, renderCell } from '../frozen/screen-decode.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const RECORDER_SCRIPT = path.join(SCRIPT_DIR, 'record-session.mjs');
const DEFAULT_INSTALL = process.env.NETHACK_SOURCE_INSTALL
    || path.join(ROOT, 'nethack-c', 'recorder', 'install');
const DEFAULT_DATETIME = '20000110090000';
const DEFAULT_MISSION = 'Explore D:1, use inventory, find stairs and attempt a return journey';
const MAX_KEYS = 250;
const MAX_PLAY_MS = 15 * 60 * 1000;

function usage() {
    return [
        'Usage:',
        '  node scripts/explore-c.mjs start --run <dir> [options]',
        '  node scripts/explore-c.mjs act --run <dir> --keys-json <json-string> --intent <description>',
        '  node scripts/explore-c.mjs status --run <dir>',
        '  node scripts/explore-c.mjs finish --run <dir> --summary <description>',
        '',
        'start options (defaults shown):',
        '  --run <dir>             Required private run directory.',
        '  --id <id>               scout',
        '  --seed <number>         0',
        '  --datetime <YYYY...>    ' + DEFAULT_DATETIME,
        '  --role <role>           Valkyrie',
        '  --race <race>           human',
        '  --gender <gender>       female',
        '  --align <alignment>     neutral',
        '  --mission <text>        ' + DEFAULT_MISSION,
        '  --playmode <mode>       ordinary (debug is available for setup pilots)',
        '  --source-install <dir>  recorder install to clone (or set NETHACK_SOURCE_INSTALL)',
        '',
        'The run directory contains install/ (private HACKDIR), recipe.session.json',
        '(the last successful input recipe), recording.session.json (the last',
        'complete canonical v5 C recording), status.json, actions.jsonl, and',
        'control.json. Each act accepts JSON such as ' + JSON.stringify('jj.') +
        ' (an array of one-character strings is also accepted), appends it to',
        'the recipe, and re-records the whole prefix. Failed attempts are kept',
        'as attempt-*.session.json and never replace the last valid files. The',
        'pilot stops at 250 successful keys or 15 minutes from start.',
    ].join('\n');
}

function parseArgs(argv) {
    const command = argv[0];
    const values = new Map();
    if (command === '-h' || command === '--help') values.set('help', true);
    for (let i = 1; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') {
            values.set('help', true);
            continue;
        }
        if (!arg.startsWith('--')) throw new Error('unexpected argument: ' + arg);
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next == null || next.startsWith('--')) values.set(key, true);
        else {
            values.set(key, next);
            i++;
        }
    }
    return { command, values };
}

function value(values, key, fallback) {
    return values.has(key) ? values.get(key) : fallback;
}

function required(values, key) {
    const v = value(values, key);
    if (v == null || v === true || v === '') throw new Error('--' + key + ' is required');
    return v;
}

function parseSeed(raw) {
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid --seed: ' + raw);
    return n;
}

function parsePlaymode(raw) {
    const mode = String(raw).toLowerCase();
    if (mode !== 'ordinary' && mode !== 'debug') {
        throw new Error('invalid --playmode: ' + raw + ' (use ordinary or debug)');
    }
    return mode;
}

function safeId(raw) {
    const id = String(raw).trim();
    if (!id || id === '.' || id === '..' || !/^[A-Za-z0-9_-]+$/u.test(id)) {
        throw new Error('invalid --id: ' + raw + ' (use letters, numbers, _ or -)');
    }
    return id;
}

function displayName(id) {
    return ('Scout' + id.slice(0, 20)).slice(0, 30);
}

function buildNethackrc(meta) {
    const mode = meta.playmode === 'debug' ? ',playmode:debug' : '';
    return 'OPTIONS=name:' + displayName(meta.id)
        + ',role:' + meta.role
        + ',race:' + meta.race
        + ',gender:' + meta.gender
        + ',align:' + meta.align
        + mode
        + ',!legacy,!tutorial,!splash_screen,showexp,time\n';
}

async function exists(file) {
    try {
        await fs.access(file);
        return true;
    } catch {
        return false;
    }
}

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJsonAtomic(file, value) {
    const parent = path.dirname(file);
    await fs.mkdir(parent, { recursive: true });
    const temp = path.join(
        parent,
        '.' + path.basename(file) + '.' + process.pid + '.' + Date.now() + '.tmp',
    );
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    await fs.rename(temp, file);
}

async function appendJsonl(file, value) {
    await fs.appendFile(file, JSON.stringify(value) + '\n', 'utf8');
}

function screenText(screen) {
    const grid = decodeScreen(screen || '');
    return grid.map((row) => row.map((cell) => {
        const ch = renderCell(cell);
        return /^[\u0020-\u007e\u00a0-\uffff]$/u.test(ch) ? ch : ' ';
    }).join('')).join('\n');
}

function lastStep(recording) {
    const segments = recording && recording.segments;
    const segment = Array.isArray(segments) ? segments[segments.length - 1] : null;
    const steps = segment && segment.steps;
    return Array.isArray(steps) && steps.length ? steps[steps.length - 1] : null;
}

function pathsFor(run) {
    return {
        session: path.join(run, 'recording.session.json'),
        recipe: path.join(run, 'recipe.session.json'),
        actions: path.join(run, 'actions.jsonl'),
    };
}

function statusFrom(meta, paths, status, startedAt, updatedAt, keyCount, boundaries, step, latestIntent, actions, error, observedAt) {
    const out = {
        id: meta.id,
        mission: meta.mission,
        status,
        model: 'gpt-5.6-luna',
        reasoningEffort: 'xhigh',
        seed: meta.seed,
        datetime: meta.datetime,
        role: meta.role,
        race: meta.race,
        gender: meta.gender,
        align: meta.align,
        playmode: meta.playmode,
        startedAt,
        updatedAt,
        ...(observedAt ? { observedAt } : {}),
        keyCount,
        boundaries,
        screenText: screenText(step && step.screen),
        screen: (step && step.screen) || '',
        cursor: (step && step.cursor) || [0, 0, 1],
        latestIntent: latestIntent || '',
        actions,
        paths,
    };
    if (error) out.error = error;
    return out;
}

async function runRecorder(recipePath, outputPath, run) {
    const installDir = path.join(run, 'install', 'games', 'lib', 'nethackdir');
    const binary = path.join(installDir, 'nethack');
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [RECORDER_SCRIPT, recipePath, outputPath], {
            cwd: ROOT,
            env: {
                ...process.env,
                NETHACK_BINARY: binary,
                NETHACK_INSTALL: installDir,
                RERECORD_TZ: 'America/New_York',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        let stdout = '';
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', (code, signal) => {
            if (code === 0) resolve();
            else {
                const detail = stderr.trim() || stdout.trim() || ('signal ' + (signal || 'unknown'));
                reject(new Error('record-session failed (' + (code == null ? signal : code) + '): ' + detail.slice(-1200)));
            }
        });
    });
}

async function cloneInstall(source, destination) {
    const binary = path.join(source, 'games', 'lib', 'nethackdir', 'nethack');
    if (!(await exists(binary))) throw new Error('recorder binary not found under source install: ' + source);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true, errorOnExist: true });
}

function parseKeys(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error('--keys-json must be valid JSON: ' + err.message);
    }
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed) && parsed.every((key) => typeof key === 'string' && key.length > 0)) {
        return parsed.join('');
    }
    throw new Error('--keys-json must decode to a string or an array of non-empty strings');
}

async function loadStatus(run) {
    const file = path.join(run, 'status.json');
    if (!(await exists(file))) throw new Error('run not found: ' + run);
    return readJson(file);
}

async function start(values) {
    const run = path.resolve(required(values, 'run'));
    const id = safeId(value(values, 'id', path.basename(run) || 'scout'));
    const seed = parseSeed(value(values, 'seed', '0'));
    const datetime = String(value(values, 'datetime', DEFAULT_DATETIME));
    if (!/^\d{14}$/u.test(datetime)) throw new Error('invalid --datetime: ' + datetime);
    const meta = {
        id,
        mission: String(value(values, 'mission', DEFAULT_MISSION)),
        seed,
        datetime,
        role: String(value(values, 'role', 'Valkyrie')),
        race: String(value(values, 'race', 'human')),
        gender: String(value(values, 'gender', 'female')),
        align: String(value(values, 'align', 'neutral')),
        playmode: parsePlaymode(value(values, 'playmode', 'ordinary')),
    };
    const source = path.resolve(String(value(values, 'source-install', DEFAULT_INSTALL)));
    const paths = pathsFor(run);
    if (await exists(path.join(run, 'status.json'))) throw new Error('run already exists: ' + run);
    await fs.mkdir(run, { recursive: true });
    await cloneInstall(source, path.join(run, 'install'));
    const recipe = {
        version: 5,
        segments: [{ seed, datetime, nethackrc: buildNethackrc(meta), moves: '' }],
    };
    const stamp = Date.now();
    const attemptRecipe = path.join(run, '.attempt-start-' + stamp + '.session.json');
    const attemptRecording = path.join(run, '.attempt-start-' + stamp + '.recording.session.json');
    await fs.writeFile(paths.actions, '', 'utf8');
    await writeJsonAtomic(attemptRecipe, recipe);
    const startedAt = new Date().toISOString();
    const actions = [];
    await writeJsonAtomic(path.join(run, 'control.json'), { paused: false, stop: false });
    await writeJsonAtomic(path.join(run, 'status.json'), statusFrom(
        meta, paths, 'starting', startedAt, new Date().toISOString(), 0, 0, null, '', actions,
    ));
    try {
        await runRecorder(attemptRecipe, attemptRecording, run);
        await fs.rename(attemptRecipe, paths.recipe);
        await fs.rename(attemptRecording, paths.session);
        const recording = await readJson(paths.session);
        const step = lastStep(recording);
        const observedAt = new Date().toISOString();
        const status = statusFrom(
            meta, paths, 'running', startedAt, new Date().toISOString(), 0,
            recording.segments[0].steps.length, step, '', actions, undefined, observedAt,
        );
        await writeJsonAtomic(path.join(run, 'status.json'), status);
        console.log(JSON.stringify(status, null, 2));
    } catch (err) {
        const status = statusFrom(meta, paths, 'failed', startedAt, new Date().toISOString(), 0, 0, null, '', actions, err.message);
        await writeJsonAtomic(path.join(run, 'status.json'), status);
        throw err;
    }
}

async function act(values) {
    const run = path.resolve(required(values, 'run'));
    const keys = parseKeys(required(values, 'keys-json'));
    const intent = String(required(values, 'intent'));
    if (!keys.length) throw new Error('--keys-json must contain at least one key');
    const current = await loadStatus(run);
    if (current.status !== 'running') throw new Error('run is ' + current.status + '; act is unavailable');
    const controlPath = path.join(run, 'control.json');
    const control = await exists(controlPath) ? await readJson(controlPath) : {};
    const now = new Date().toISOString();
    const actions = Array.isArray(current.actions) ? current.actions.slice() : [];
    if (control.stop || control.paused) {
        const outcome = control.stop ? 'blocked: stop requested in control.json' : 'blocked: paused in control.json';
        const action = { time: now, keys, intent, outcome };
        actions.push(action);
        await appendJsonl(path.join(run, 'actions.jsonl'), action);
        await writeJsonAtomic(path.join(run, 'status.json'), {
            ...current,
            status: control.stop ? 'completed' : current.status,
            updatedAt: now,
            latestIntent: intent,
            actions,
        });
        console.log(JSON.stringify(await loadStatus(run), null, 2));
        return;
    }
    if (Date.now() - Date.parse(current.startedAt) >= MAX_PLAY_MS) {
        const outcome = 'blocked: pilot time limit reached (15 minutes)';
        const action = { time: now, keys, intent, outcome };
        actions.push(action);
        await appendJsonl(path.join(run, 'actions.jsonl'), action);
        await writeJsonAtomic(path.join(run, 'status.json'), { ...current, status: 'completed', updatedAt: now, latestIntent: intent, actions });
        console.log(JSON.stringify(await loadStatus(run), null, 2));
        return;
    }
    if (current.keyCount + keys.length > MAX_KEYS) {
        throw new Error('action exceeds pilot key limit: ' + current.keyCount + '+' + keys.length + ' > ' + MAX_KEYS);
    }
    const recipePath = path.join(run, 'recipe.session.json');
    const recipe = await readJson(recipePath);
    if (!Array.isArray(recipe.segments) || !recipe.segments.length) throw new Error('recipe has no segment');
    const attempted = structuredClone(recipe);
    const segment = attempted.segments[attempted.segments.length - 1];
    segment.moves = String(segment.moves || '') + keys;
    const stamp = Date.now() + '-' + process.pid;
    const attemptRecipe = path.join(run, 'attempt-' + stamp + '.session.json');
    const attemptRecording = path.join(run, 'attempt-' + stamp + '.recording.session.json');
    await writeJsonAtomic(attemptRecipe, attempted);
    await writeJsonAtomic(path.join(run, 'status.json'), {
        ...current,
        updatedAt: new Date().toISOString(),
        latestIntent: intent,
    });
    let recording;
    try {
        await runRecorder(attemptRecipe, attemptRecording, run);
        recording = await readJson(attemptRecording);
    } catch (err) {
        const action = { time: now, keys, intent, outcome: 'failed: ' + err.message };
        actions.push(action);
        await appendJsonl(path.join(run, 'actions.jsonl'), action);
        await writeJsonAtomic(path.join(run, 'status.json'), {
            ...current, status: 'failed', updatedAt: new Date().toISOString(),
            latestIntent: intent, actions, error: err.message,
        });
        throw err;
    }
    await fs.rename(attemptRecipe, recipePath);
    await fs.rename(attemptRecording, pathsFor(run).session);
    const step = lastStep(recording);
    const firstText = screenText(step && step.screen).split('\n').find((line) => line.trim()) || '';
    const action = {
        time: now,
        keys,
        intent,
        outcome: 'recorded ' + keys.length + ' keys; first visible line: ' + firstText.trim().slice(0, 160),
    };
    actions.push(action);
    await appendJsonl(path.join(run, 'actions.jsonl'), action);
    const paths = pathsFor(run);
    const meta = {
        id: current.id,
        mission: current.mission,
        seed: current.seed,
        datetime: current.datetime,
        role: current.role,
        race: current.race,
        gender: current.gender,
        align: current.align,
        playmode: current.playmode || 'ordinary',
    };
    const next = statusFrom(
        meta, paths, 'running', current.startedAt, new Date().toISOString(),
        current.keyCount + keys.length,
        recording.segments[recording.segments.length - 1].steps.length,
        step, intent, actions, undefined, new Date().toISOString(),
    );
    await writeJsonAtomic(path.join(run, 'status.json'), next);
    console.log(JSON.stringify(next, null, 2));
}

async function finish(values) {
    const run = path.resolve(required(values, 'run'));
    const summary = String(required(values, 'summary'));
    const current = await loadStatus(run);
    const next = { ...current, status: 'completed', updatedAt: new Date().toISOString(), summary };
    await writeJsonAtomic(path.join(run, 'status.json'), next);
    console.log(JSON.stringify(next, null, 2));
}

async function main() {
    const parsed = parseArgs(process.argv.slice(2));
    if (!parsed.command || parsed.values.has('help')) {
        console.log(usage());
        return;
    }
    if (parsed.command === 'start') await start(parsed.values);
    else if (parsed.command === 'act') await act(parsed.values);
    else if (parsed.command === 'status') console.log(JSON.stringify(await loadStatus(path.resolve(required(parsed.values, 'run'))), null, 2));
    else if (parsed.command === 'finish') await finish(parsed.values);
    else throw new Error('unknown command: ' + parsed.command);
}

main().catch((err) => {
    console.error('[fail] ' + (err.message || String(err)));
    process.exitCode = 1;
});
