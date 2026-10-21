import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { ACH_TUNE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

test('the second Castle tune hint preserves its audible message boundary',
    async () => {
        const recording = JSON.parse(readFileSync(new URL(
            '../recordings/pray.c/prayer-castle-tune-hearing.session.json',
            import.meta.url,
        ), 'utf8'));
        assert.ok(recording.segments[0].steps.some(step =>
            step.screen.includes('You hear a divine music...')),
        'ordinary C prayer reaches the acoustics-enabled second hint');

        const replay = await runJsSession(recording, process.cwd());
        const compared = compareSessionOutputs(recording, replay);
        assert.equal(compared.passed, true, JSON.stringify(compared));
    });

test('the second Castle tune hint records its C achievement', async () => {
    const source = readFileSync(new URL(
        '../nethack-c/upstream/src/pray.c', import.meta.url,
    ), 'utf8');
    assert.match(source,
        /u\.uevent\.uheard_tune\+\+;\s*record_achievement\(ACH_TUNE\);/u);
    const recording = JSON.parse(readFileSync(new URL(
        '../recordings/pray.c/prayer-castle-tune-hearing.session.json',
        import.meta.url,
    ), 'utf8'));
    assert.ok(recording.segments[0].steps.some(step =>
        step.screen.includes('It sounds like:')));
    await runSegment(recording.segments[0]);
    assert.equal(game.u.uevent.uheard_tune, 2);
    assert.ok(game.u.uachieved.includes(ACH_TUNE),
        'C records ACH_TUNE after the second hint');
});
