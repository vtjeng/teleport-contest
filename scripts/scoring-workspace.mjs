import { spawnSync } from 'node:child_process';
import {
    cpSync,
    mkdtempSync,
    mkdirSync,
    readdirSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
export const RESULT_MARKER = '__RESULTS_JSON__';

// The official scorer overlays these files before importing contestant code.
const FROZEN_FILES = ['isaac64.js', 'terminal.js', 'storage.js'];

export function listSessionFiles(sessionDir) {
    return readdirSync(sessionDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.session.json'))
        .map(entry => entry.name)
        .sort();
}

export function createScoringWorkspace(sessionDir, files) {
    const targetRoot = mkdtempSync(join(tmpdir(), 'teleport-score-'));
    try {
        cpSync(join(PROJECT_ROOT, 'js'), join(targetRoot, 'js'), { recursive: true });
        cpSync(join(PROJECT_ROOT, 'frozen'), join(targetRoot, 'frozen'), { recursive: true });
        cpSync(join(PROJECT_ROOT, 'package.json'), join(targetRoot, 'package.json'));
        mkdirSync(join(targetRoot, 'sessions'));

        for (const file of files) {
            cpSync(join(sessionDir, file), join(targetRoot, 'sessions', file));
        }
        for (const file of FROZEN_FILES) {
            cpSync(join(targetRoot, 'frozen', file), join(targetRoot, 'js', file));
        }
        return targetRoot;
    } catch (error) {
        removeScoringWorkspace(targetRoot);
        throw error;
    }
}

export function runScorer(targetRoot) {
    const runner = join(targetRoot, 'frozen', 'ps_test_runner.mjs');
    return spawnSync(process.execPath, [runner, join(targetRoot, 'sessions')], {
        cwd: targetRoot,
        encoding: 'utf8',
        // Allow the scorer's normal per-session timeout across an entire suite.
        timeout: 10 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
    });
}

export function parseRunnerBundle(stdout) {
    const markerIndex = stdout.lastIndexOf(RESULT_MARKER);
    if (markerIndex < 0) throw new Error('runner marker missing');
    const bundle = JSON.parse(stdout.slice(markerIndex + RESULT_MARKER.length).trim());
    if (!bundle || !Array.isArray(bundle.results)) {
        throw new Error('runner bundle malformed');
    }
    return bundle;
}

export function removeScoringWorkspace(targetRoot) {
    const expectedPrefix = join(tmpdir(), 'teleport-score-');
    if (!resolve(targetRoot).startsWith(expectedPrefix)) {
        throw new Error('refusing to remove an unexpected scoring path');
    }
    rmSync(targetRoot, { recursive: true, force: true });
}
