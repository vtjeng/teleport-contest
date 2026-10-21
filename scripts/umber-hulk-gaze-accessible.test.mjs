import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CONFUSION } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_UMBER_HULK } from '../js/monsters.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mhitu.c/umber-hulk-gaze-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('umber hulk gaze locates its caster after confusion and prompt timing', async () => {
    const segment = recording.segments[0];
    const steps = segment.steps;
    assert.ok(steps[43].rng.includes('d(3,4)=5 @ gazemu(mhitu.c:1765)'));
    assert.ok(steps[43].rng.includes('rn2(6)=2 @ gazemu(mhitu.c:1767)'));
    assert.match(steps[46].screen,
        /^\(east\): The umber hulk's gaze confuses you!/u);
    assert.match(steps[43].screen, /^OK, so you don't die\./u);

    await runSegment({ ...segment, moves: segment.moves.slice(0, 46) });
    const confusion = game.u.uprops[CONFUSION]?.intrinsic ?? 0;
    const hulk = (() => {
        for (let mon = game.level.monlist; mon; mon = mon.nmon) {
            if (mon.mnum === PM_UMBER_HULK) return mon;
        }
        return null;
    })();
    assert.ok(confusion > 0, 'the gaze confuses the hero');
    assert.ok(hulk?.mspec_used > 0, 'the gaze sets caster cooldown');

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
