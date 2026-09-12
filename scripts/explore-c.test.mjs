import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const CLI = fileURLToPath(new URL('./explore-c.mjs', import.meta.url));

async function fixture(t, control) {
    const run = await mkdtemp(join(tmpdir(), 'c-explorer-test-'));
    t.after(() => rm(run, { recursive: true, force: true }));
    // A complete startup observation with no successful player input yet.
    // A recent start avoids making these preservation checks depend on timeout.
    const state = {
        id: 'test', status: 'running', startedAt: new Date().toISOString(),
        observedAt: '2000-01-01T00:00:00.000Z', keyCount: 0, boundaries: 1,
        screenText: 'last valid C observation', actions: [],
    };
    const recipe = JSON.stringify({ version: 5, segments: [{
        seed: 1, datetime: '20000101000000', nethackrc: '', moves: '',
    }] }); // Inputs are arbitrary: these cases must never reach a C game.
    const recording = 'preserved canonical bytes\n';
    await Promise.all([
        writeFile(join(run, 'status.json'), JSON.stringify(state)),
        writeFile(join(run, 'control.json'), JSON.stringify(control)),
        writeFile(join(run, 'recipe.session.json'), recipe),
        writeFile(join(run, 'recording.session.json'), recording),
    ]);
    return { run, state, recipe, recording };
}

function act(run) {
    // Inventory is one valid key; the control or recorder failure must block it.
    return spawnSync(process.execPath, [CLI, 'act', '--run', run,
        '--keys-json', JSON.stringify('i'), '--intent', 'Inspect inventory'], { encoding: 'utf8' });
}

for (const control of [{ paused: true }, { stop: true }]) {
    test(`C explorer respects ${Object.keys(control)[0]} without replacing its observation`, async (t) => {
        const { run, state, recipe, recording } = await fixture(t, control);
        const result = act(run);
        assert.equal(result.status, 0, result.stderr);
        const after = JSON.parse(await readFile(join(run, 'status.json')));
        assert.equal(after.status, control.stop ? 'completed' : 'running');
        assert.equal(after.observedAt, state.observedAt);
        assert.equal(after.screenText, state.screenText);
        assert.equal(after.keyCount, state.keyCount);
        assert.equal(await readFile(join(run, 'recipe.session.json'), 'utf8'), recipe);
        assert.equal(await readFile(join(run, 'recording.session.json'), 'utf8'), recording);
        assert.match(after.actions.at(-1).outcome, /blocked:/);
    });
}

test('failed C replay retains the last successful recipe and recording', async (t) => {
    const { run, state, recipe, recording } = await fixture(t, {});
    // No private install exists: the actual recorder must refuse this attempt.
    const result = act(run);
    assert.equal(result.status, 1, result.stderr);
    const after = JSON.parse(await readFile(join(run, 'status.json')));
    assert.equal(after.status, 'failed');
    assert.equal(after.observedAt, state.observedAt);
    assert.equal(after.screenText, state.screenText);
    assert.equal(await readFile(join(run, 'recipe.session.json'), 'utf8'), recipe);
    assert.equal(await readFile(join(run, 'recording.session.json'), 'utf8'), recording);
    assert.match(after.actions.at(-1).outcome, /failed:/);
});
