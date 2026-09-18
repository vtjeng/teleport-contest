import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs as parseMismatchArgs } from './mismatch-queue.mjs';
import { parseArgs as parseDevelopmentArgs } from './score-development.mjs';
import { parseArgs as parseRecordingArgs } from './score-recordings.mjs';
import { parseEvaluationArgs } from './score-holdout.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

test('policy CLIs expose successful help without touching their workflows', () => {
    assert.deepEqual(parseMismatchArgs(['--help']), { help: true });
    assert.deepEqual(parseMismatchArgs(['--work', '--json']), {
        help: false, json: true, scanPath: null, mode: 'work',
    });
    assert.deepEqual(parseDevelopmentArgs(['--help']), { help: true });
    assert.deepEqual(parseRecordingArgs(['--help']), { help: true });
    assert.deepEqual(parseEvaluationArgs(['--help']), { help: true });
    assert.deepEqual(parseEvaluationArgs(['--check']), { check: true });

    const verifier = spawnSync(process.execPath,
        [join(SCRIPT_DIR, 'verify-rerecord.mjs'), '--help'], { encoding: 'utf8' });
    assert.equal(verifier.status, 0, verifier.stderr);
    assert.match(verifier.stdout, /Usage: node scripts\/verify-rerecord\.mjs/u);
    assert.equal(verifier.stderr, '');
});

test('policy CLIs reject arguments combined with help', () => {
    const cases = [
        ['mismatch-queue.mjs', '--help', '--json'],
        ['score-development.mjs', '--help', 'extra'],
        ['score-recordings.mjs', '--help', 'extra'],
        ['score-holdout.mjs', '--help', '--check'],
        ['record-session.mjs', '--help', 'extra'],
        ['scan-sessions.mjs', '--json', '--help'],
        ['verify-rerecord.mjs', '--help', 'extra'],
    ];
    for (const [script, ...args] of cases) {
        const result = spawnSync(process.execPath, [join(SCRIPT_DIR, script), ...args], {
            encoding: 'utf8',
        });
        assert.notEqual(result.status, 0, `${script} accepted ${args.join(' ')}`);
        assert.match(`${result.stdout}${result.stderr}`, /unexpected argument|[Uu]sage:|request --help/u, script);
    }
});
