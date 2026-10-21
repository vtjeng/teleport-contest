import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const blocked = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/lookaround-blocked-path-7000042.session.json',
    import.meta.url,
), 'utf8'));
const saddled = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/lookaround-blocked-path-7000045.session.json',
    import.meta.url,
), 'utf8'));

test('a visible named monster stops a room run with mention_walls', async () => {
    assert.match(blocked.segments[0].steps.at(-1).screen,
        /Idefix blocks your path\./u);
    const js = await runJsSession(blocked, process.cwd());
    const result = compareSessionOutputs(blocked, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('lookaround names a saddled pony after the Knight runs past it', async () => {
    assert.match(saddled.segments[0].steps.at(-1).screen,
        /A saddled pony blocks your path\./u);
    const js = await runJsSession(saddled, process.cwd());
    const result = compareSessionOutputs(saddled, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
