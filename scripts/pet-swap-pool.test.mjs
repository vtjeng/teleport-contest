import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { POOL } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/pet-swap-pool-68119365.session.json',
    import.meta.url,
), 'utf8'));

test('a tame water elemental occupies the pool before displacement', async () => {
    const segment = recording.segments[0];
    await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
    const x = game.u.ux - 1;
    const y = game.u.uy;
    assert.equal(game.level.at(x, y).typ, POOL);
    assert.ok(m_at(x, y, game)?.mtame);
});

test('C pool displacement matches through the complete turn', async () => {
    const last = recording.segments[0].steps.at(-1);
    assert.equal(last.key, 'h');
    assert.match(last.screen, /You swap places with your water elemental\./u);
    assert.match(last.rng[0], /rn2\(7\)=4 @ do_attack/u);
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('default swim warning follows the C safe-monster draw', async () => {
    const warning = JSON.parse(readFileSync(new URL(
        '../recordings/hack.c/pet-swap-pool-warning-68119365.session.json',
        import.meta.url,
    ), 'utf8'));
    const last = warning.segments[0].steps.at(-1);
    assert.match(last.screen, /You avoid stepping into the pool of water\./u);
    assert.match(last.rng[0], /rn2\(7\)=4 @ do_attack/u);
    const js = await runJsSession(warning, process.cwd());
    const result = compareSessionOutputs(warning, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
