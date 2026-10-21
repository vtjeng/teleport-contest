import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ART_CLEAVER } from '../js/artifacts.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/uhitm.c/cleaver-single-target-47320981.session.json',
    import.meta.url,
), 'utf8'));
const sideRecording = JSON.parse(readFileSync(new URL(
    '../recordings/uhitm.c/cleaver-side-target-47320989.session.json',
    import.meta.url,
), 'utf8'));

test('the wielded Cleaver has a hostile target before the melee command', async () => {
    const segment = recording.segments[0];
    await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
    assert.equal(game.uwep?.oartifact, ART_CLEAVER);
    const target = m_at(game.u.ux + 1, game.u.uy - 1, game);
    assert.ok(target && !target.mpeaceful);
});

test('Cleaver single-target melee follows C hitum_cleave', async () => {
    const last = recording.segments[0].steps.at(-1);
    assert.equal(last.key, 'u');
    assert.match(last.screen, /You kill the goblin!/u);
    assert.ok(last.rng.some(entry => entry.includes('hitum_cleave(uhitm.c:709)')));
    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('Cleaver starts with a side target beside the primary target', async () => {
    const segment = sideRecording.segments[0];
    await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
    assert.equal(game.uwep?.oartifact, ART_CLEAVER);
    assert.ok(m_at(game.u.ux, game.u.uy + 1, game));
    assert.ok(m_at(game.u.ux + 1, game.u.uy + 1, game));
});

test('Cleaver strikes the side target before the primary target in C order', async () => {
    const last = sideRecording.segments[0].steps.at(-1);
    assert.equal(last.key, 'n');
    assert.equal(last.rng.filter(entry => entry.includes('hitum_cleave(uhitm.c:709)')).length, 2);
    assert.equal((last.screen.match(/You kill the goblin!/gu) ?? []).length, 2);
    const js = await runJsSession(sideRecording, process.cwd());
    const result = compareSessionOutputs(sideRecording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
