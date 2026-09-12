import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectRuns, monitorServer, snapshotHtml } from './monitor-c-explorers.mjs';

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'c-monitor-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const runs = join(root, 'runs');
    await mkdir(join(runs, 'scout'), { recursive: true });
    // A screen-like string that would execute if embedded as raw HTML.
    const mission = '</script><script>globalThis.leaked = true</script>';
    await writeFile(join(runs, 'scout', 'status.json'), JSON.stringify({
        id: 'scout', mission, screenText: '@', actions: [],
        // Private installation paths must never be included in the feed.
        paths: { install: '/private/install' },
    }));
    const recipe = JSON.stringify({ version: 5, segments: [] });
    await writeFile(join(runs, 'scout', 'recipe.session.json'), recipe);
    return { root, runs, mission, recipe };
}

test('monitor exposes selected artifacts and rejects writes and symlink escapes', async (t) => {
    const { root, runs, recipe } = await fixture(t);
    const outside = join(root, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'actions.jsonl'), 'private');
    await symlink(outside, join(runs, 'linked-run'));
    await symlink(join(outside, 'actions.jsonl'), join(runs, 'scout', 'actions.jsonl'));
    const data = await collectRuns(runs);
    assert.deepEqual(data.runs.map((run) => run.directory), ['scout']);
    assert.equal(data.runs[0].paths, undefined);
    assert.deepEqual(Object.keys(data.runs[0].artifacts), ['recipe.session.json']);

    const server = monitorServer(runs);
    server.listen(0, '127.0.0.1'); // An ephemeral loopback port isolates concurrent tests.
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal(await (await fetch(url + '/runs/scout/recipe.session.json')).text(), recipe);
    for (const path of ['/runs/linked-run/actions.jsonl', '/runs/scout/actions.jsonl', '/runs/scout/status.json', '/runs/scout/install/nethack']) {
        assert.equal((await fetch(url + path)).ok, false, path);
    }
    // The monitor cannot act on a game or mutate its control file.
    assert.equal((await fetch(url + '/api/runs', { method: 'POST', body: '{}' })).status, 405);
    assert.equal(await readFile(join(runs, 'scout', 'recipe.session.json'), 'utf8'), recipe);
});

test('standalone snapshots preserve text without embedding executable markup', async (t) => {
    const { runs, mission } = await fixture(t);
    const html = await snapshotHtml(runs);
    assert.equal(html.includes(mission), false);
    const embedded = html.match(/<script id="snapshot" type="application\/json">(.*?)<\/script>/su);
    const data = JSON.parse(embedded[1]);
    assert.equal(data.runs[0].mission, mission);
    assert.ok(Number.isFinite(Date.parse(data.capturedAt)));
});

test('empty roots and damaged status files remain visible without discarding valid runs', async (t) => {
    const { root, runs } = await fixture(t);
    assert.deepEqual(await collectRuns(join(root, 'not-started')), { runs: [], errors: [] });
    await mkdir(join(runs, 'damaged'));
    await writeFile(join(runs, 'damaged', 'status.json'), '{'); // Interrupted or invalid producer output.
    const data = await collectRuns(runs);
    assert.equal(data.runs.length, 1); // The valid scout remains visible.
    assert.deepEqual(data.errors.map((error) => error.run), ['damaged']);
});
