// js/gstate.js recordLiveGameUse() records a use under the judge's entry
// points and throws under the unit suite. js/youprop.js's argument check
// relies on it. The dry-run guard this file once tested has gone; this case
// stays until that mechanism changes.

import assert from 'node:assert/strict';
import test from 'node:test';

// The judge's entry points must not stop on live-game access during a dry run:
// runSegment() and the browser play path that frozen/playability_runner.mjs
// drives through NethackGame and moveloop_core() directly. js/gstate.js
// therefore records by default. This file runs with throwing selected
// (scripts/strict-live-game-uses.mjs), so the default is checked in a fresh
// process that loads js/gstate.js without that preload.
test('without a selection, live-game access during a dry run is recorded, not thrown', async () => {
    const { spawnSync } = await import('node:child_process');
    const gstate = new URL('../js/gstate.js', import.meta.url).href;
    const script = `
        const g = await import(${JSON.stringify(gstate)});
        // Any kind and detail: the check is only that the call returns.
        g.recordLiveGameUse('planningLiveGame', 'probe', (detail) => new Error(detail));
        process.stdout.write(JSON.stringify(g.planningLiveGameUses()));
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), [{ kind: 'planningLiveGame', detail: 'probe', count: 1 }]);
});
