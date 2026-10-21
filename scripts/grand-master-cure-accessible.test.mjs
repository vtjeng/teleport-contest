import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GRAND_MASTER } from '../js/monsters.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/mcastu.c/grand-master-cure-accessible.session.json',
    import.meta.url,
), 'utf8'));

function grandMaster() {
    for (let mon = game.level.monlist; mon; mon = mon.nmon) {
        if (mon.mnum === PM_GRAND_MASTER) return mon;
    }
    return null;
}

test('injured Grand Master heals and locates its cure message', async () => {
    const segment = recording.segments[0];
    const steps = segment.steps;
    assert.match(steps[82].screen, /You hit the Grand Master!/u);
    assert.match(steps[156].screen,
        /^\(west\): The Grand Master looks better\./u);
    assert.ok(steps[156].rng.some(entry =>
        entry === 'd(3,6)=6 @ m_cure_self(mcastu.c:314)'));

    await runSegment({ ...segment, moves: segment.moves.slice(0, 155) });
    const before = grandMaster();
    assert.ok(before && before.mhp < before.mhpmax);
    const hpBefore = before.mhp;
    await runSegment({ ...segment, moves: segment.moves.slice(0, 156) });
    const after = grandMaster();
    assert.equal(after.mhp, hpBefore + 6);
    assert.equal(game.u.uhp, 20, 'self-healing does not damage the hero');

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
