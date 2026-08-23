import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const RUNNER = resolve('scripts/run-startup-regex-resource.mjs');

test('regex adversaries satisfy exact resource and fixed-point bounds', () => {
    const result = spawnSync(process.execPath, [RUNNER], {
        encoding: 'utf8',
        timeout: 12_000,
        maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
        assert.fail(result.error?.message || result.stderr.trim()
            || `resource runner exited ${result.status}`);
    }
    for (const name of [
        'correlated-reference',
        'unanchored-direct',
        'unanchored-reference',
        'adjacent-repeat-fixed-point',
    ]) {
        assert.match(result.stdout, new RegExp(`^${name}:`, 'mu'));
    }
});
