import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

async function assertSessionMatches(path) {
    const recording = JSON.parse(
        readFileSync(new URL(path, import.meta.url), 'utf8'),
    );
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
}

test('apply.c doapply reaches the broken-wand no-effect arm', async () => {
    await assertSessionMatches(
        '../challenges/cases/v10/apply-breaks-exhausted-wand-of-nothing.session.json',
    );
});

test('apply.c do_break_wand reaches WAN_LIGHT explosion and litroom', async () => {
    await assertSessionMatches(
        '../recordings/apply.c/broken-light-wand-independent-b45.session.json',
    );
});

test('apply.c do_break_wand sends undead-turning floor objects through bhito', async () => {
    await assertSessionMatches(
        '../challenges/cases/v38/v38-broken-undead-wand-revives-floor-newt.session.json',
    );
});
