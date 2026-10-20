import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/quest.c/goal-alt-wished-orb-9701141.session.json',
    import.meta.url,
), 'utf8'));

test('returning to an empty quest goal uses the C alternate message', async () => {
    const segment = recording.segments[0];
    assert.match(segment.steps.at(-1).screen,
        /You have returned to the Minion of Huhetotl's lair\./u);

    // The hero wished for the unique Orb before Arc-goal was generated.
    // It is carried by the hero, so quest.c:on_goal excludes it from the
    // floor, monster inventory, and buried-object search on the return trip.
    const js = await runJsSession(recording, process.cwd());
    assert.equal(game.svq.quest_status.made_goal, 2);
    let carried = false;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.oartifact === game.urole.questarti) carried = true;
    assert.equal(carried, true);

    const result = compareSessionOutputs(recording, js);
    assert.equal(result.passed, true, JSON.stringify(result));
});
