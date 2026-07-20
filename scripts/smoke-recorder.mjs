#!/usr/bin/env node

// Post-build smoke check for the deterministic C recorder. This deliberately
// creates a fresh one-boundary recipe instead of reading a contest recording.

import { spawnSync } from 'node:child_process';
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const RECORD_SCRIPT = join(SCRIPT_DIR, 'record-session.mjs');
const workDir = mkdtempSync(join(tmpdir(), 'teleport-recorder-smoke-'));

try {
    const recipePath = join(workDir, 'recipe.json');
    const outputPath = join(workDir, 'recording.json');
    const recipe = {
        version: 5,
        segments: [{
            // These arbitrary inputs are intentionally unrelated to the
            // development recordings and exercise a fully configured newgame.
            seed: 271828,
            datetime: '20260720123456',
            nethackrc: 'OPTIONS=name:RecorderSmoke,role:Healer,race:human,gender:male,align:neutral\n',
            moves: '',
        }],
    };
    writeFileSync(recipePath, JSON.stringify(recipe));

    const child = spawnSync(
        process.execPath,
        [RECORD_SCRIPT, recipePath, outputPath],
        {
            encoding: 'utf8',
            env: process.env,
            // Fresh startup normally finishes in a few seconds; this cap
            // leaves room for slower CI hosts without hiding a hung recorder.
            timeout: 30_000,
        },
    );
    if (child.error || child.status !== 0) {
        if (child.stderr) process.stderr.write(child.stderr);
        throw child.error ?? new Error(`record-session exited ${child.status}`);
    }

    const recording = JSON.parse(readFileSync(outputPath, 'utf8'));
    const step = recording.segments?.[0]?.steps?.[0];
    // Every fresh game initializes the object catalog before its first input
    // boundary. The pinned source makes 199 core draws in that subsystem, so
    // fewer calls means startup stopped at a configuration/error screen.
    if (!step || !Array.isArray(step.rng) || step.rng.length < 199) {
        throw new Error('recorder did not reach fresh-game object initialization');
    }
    if (typeof step.screen !== 'string' || step.screen.length === 0) {
        throw new Error('recorder did not capture a nonempty startup screen');
    }
    process.stdout.write(`[ok] recorder smoke: ${step.rng.length} core RNG calls\n`);
} finally {
    rmSync(workDir, { recursive: true, force: true });
}
