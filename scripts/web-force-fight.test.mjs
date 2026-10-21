import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const quarterstaff = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/web-force-quarterstaff-9701149.session.json',
    import.meta.url,
), 'utf8'));
const sting = JSON.parse(readFileSync(new URL(
    '../recordings/hack.c/web-force-sting-9701150.session.json',
    import.meta.url,
), 'utf8'));

test('force-fighting a seen web with a quarterstaff refuses the cut', async () => {
    assert.match(quarterstaff.segments[0].steps.at(-1).screen,
        /You can't cut a web with a quarterstaff!/u);
    const js = await runJsSession(quarterstaff, process.cwd());
    const result = compareSessionOutputs(quarterstaff, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});

test('force-fighting a seen web with Sting cuts it', async () => {
    assert.match(sting.segments[0].steps.at(-1).screen,
        /Sting cuts through the web!/u);
    const js = await runJsSession(sting, process.cwd());
    const result = compareSessionOutputs(sting, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
