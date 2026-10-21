import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/monmove.c/held-minotaur-escape-accessible.session.json',
    import.meta.url,
), 'utf8'));

test('a frightened held minotaur locates its failed escape and stays held', async () => {
    const segment = recording.segments[0];
    const steps = segment.steps;
    assert.match(steps[99].screen, /Your barbs stick to the minotaur!/u);
    assert.match(steps[109].screen,
        /^As you read the scroll, it disappears.--More--/u);
    assert.match(steps[110].screen,
        /^\(west\): The minotaur cannot escape from you!/u);
    assert.match(steps[119].screen,
        /^\(west\): The minotaur cannot escape from you!--More--/u);

    await runSegment({ ...segment, moves: segment.moves.slice(0, 99) });
    assert.ok(game.u.ustuck, 'the sticky claw holds the minotaur');
    assert.equal(game.u.ustuck.mflee, false);
    await runSegment(segment);
    assert.ok(game.u.ustuck, 'the frightened minotaur stays held');
    assert.equal(game.u.ustuck.mflee, true);
    assert.equal(game.u.uswallow, false);
    assert.deepEqual([game.u.ustuck.mx, game.u.ustuck.my], [9, 3]);

    const js = await runJsSession(recording, process.cwd());
    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
