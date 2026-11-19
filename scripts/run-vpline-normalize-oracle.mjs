#!/usr/bin/env node

// Compare the port with the exact pline.c vpline() modest-overflow byte
// rewrite, compiled from scripts/fixtures/vpline-normalize-oracle.c. The
// running game cannot emit every 256-byte pline on demand, so this direct C
// oracle covers it. (The regex comparisons this file once made against the
// local glibc are gone: the port follows macOS's regex, which
// scripts/posixregex.test.mjs checks against macOS's own answers.)

import assert from 'node:assert/strict';
import {
    mkdtempSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { textBytes } from '../js/hacklib.js';
import { ttyPline } from '../js/tty_message.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = resolve(SCRIPT_PATH, '..');
const FIXTURE_DIR = join(SCRIPT_DIR, 'fixtures');

function run(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `${command} exited ${result.status}: ${result.stderr.trim()}`,
        );
    }
    return result.stdout;
}

function runBuffer(command, args) {
    const result = spawnSync(command, args);
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `${command} exited ${result.status}: ${result.stderr.toString().trim()}`,
        );
    }
    return result.stdout;
}

function compile(source, output) {
    run('clang', [
        '-std=c11', '-Wall', '-Wextra', '-Werror',
        join(FIXTURE_DIR, source), '-o', output,
    ]);
}

async function checkVplineOracle(executable) {
    const cases = [
        'a'.repeat(253) + 'XYZ',
        'a'.repeat(249) + 'REMOVED' + 'b'.repeat(41) + 'XYZ',
        'q'.repeat(508) + 'END',
        'a'.repeat(248) + 'é' + 'removed' + 'XYZ',
        'b'.repeat(253) + 'é',
    ];
    for (const input of cases) {
        resetGame();
        game.nhDisplay = new GameDisplay(null);
        game.iflags = { cbreak: true };
        game.program_state = {};
        game.u = { ux: 0, uy: 0 };
        game.gp = { plinemsg_types: null };
        game._ttyPreviousMessage = '';
        for (let index = 0; index < 8; ++index)
            game.nhDisplay.pushKey(' '.charCodeAt(0));
        await ttyPline(input, game);
        assert.deepEqual(
            textBytes(game._ttyPreviousMessage),
            Array.from(runBuffer(executable, [input])),
            String(input.length),
        );
    }
    return cases.length;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const directory = mkdtempSync(join(tmpdir(), 'vpline-normalize-'));
    try {
        const vplineOracle = join(directory, 'vpline-normalize-oracle');
        compile('vpline-normalize-oracle.c', vplineOracle);
        const vplineComparisons = await checkVplineOracle(vplineOracle);
        process.stdout.write(
            `VPLINE C ORACLE: ${vplineComparisons} comparisons passed\n`,
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch((error) => {
        process.stderr.write(
            `vpline C oracle: ${error.message || error}\n`,
        );
        process.exitCode = 1;
    });
}
