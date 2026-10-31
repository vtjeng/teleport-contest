import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { developmentFromCheckpoint } from './task-verdict.mjs';

test('development sessions are bound to checkpoint artifacts and name both fixed directories', () => {
    // 44 is the fixed development workload size the function requires. Session
    // 0 carries the scorer's holdout-- prefix, which maps to holdout/<name>.
    const results = { results: Array.from({ length: 44 }, (_, index) => ({
        session: index === 0 ? 'holdout--example.session.json'
            : `example-${index}.session.json`,
        passed: true, metrics: {
            screens: { matched: 2, total: 2 },
            rngCalls: { matched: 3, total: 3 },
            cursors: { matched: 2, total: 2 },
        },
    })) };
    const bytes = Buffer.from(JSON.stringify(results));
    // Score totals are 44 sessions times the per-session matches above
    // (2 screens, 3 RNG calls, 2 cursors), so the totals check passes.
    const summary = { allPassed: true, executionCommit: 'a'.repeat(40),
        timestamp: '2026-09-25T10:00:00Z',
        artifactHashes: { 'session-results.json':
            createHash('sha256').update(bytes).digest('hex') },
        score: { screensMatched: 88, rngMatched: 132, cursorsMatched: 88 } };
    const development = developmentFromCheckpoint(summary, results, bytes);
    assert.ok(development.sessions.some(row => row.session === 'holdout/example'));
    assert.ok(development.sessions.some(row => row.session === 'example-1'));
    // A hash that does not match the result bytes rejects the artifact.
    assert.throws(() => developmentFromCheckpoint(
        { ...summary, artifactHashes: { 'session-results.json': 'bad' } }, results, bytes,
    ), /do not belong/u);
});
