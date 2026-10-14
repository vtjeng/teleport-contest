import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

test('steed.c poly_steed adjusts the rider after a controlled horse polymorph', async () => {
    // This admitted v64 recording polymorphs a saddled pony into a horse while
    // the hero rides it, reaching mon.c:newcham()'s poly_steed() call.
    const path = new URL(
        '../challenges/cases/v64/v64-mounted-controlled-horse-action4.session.json',
        import.meta.url,
    );
    const recording = JSON.parse(readFileSync(path, 'utf8'));
    const replay = await runJsSession(recording, process.cwd());
    assert.equal(compareSessionOutputs(recording, replay).passed, true);
});
