import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

test('potion.c dodrink removes a singly worn potion before polymorph effects', async () => {
    // This admitted v64 recording quaffs a wielded polymorph potion; C clears
    // its worn slot before the transformation, so drop_weapon() adds no prompt.
    const path = new URL(
        '../challenges/cases/v64/v64-wielded-polymorph-potion-action3.session.json',
        import.meta.url,
    );
    const recording = JSON.parse(readFileSync(path, 'utf8'));
    const replay = await runJsSession(recording, process.cwd());
    assert.equal(compareSessionOutputs(recording, replay).passed, true);
});
