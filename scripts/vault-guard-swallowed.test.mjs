import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {findgd} from '../js/vault.js';

// Live C vault.c invault(): a swallowed hero cannot be interrogated. The
// unspotted guard leaves, with located speech only for a hearing hero.
for (const kind of ['hearing', 'deaf']) {
    test(`vault guard leaves a swallowed ${kind} hero`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/vault.c/guard-swallowed-${kind}.session.json`, import.meta.url), 'utf8'));
        let boundary;
        const replay = await runSegment(recipe.segments[0], {onBoundary: error => { boundary = error; }});
        assert.equal(boundary, undefined);
        assert.equal(game.u.uswallow, 1);
        assert.equal(findgd(game), null);
        assert(replay.getScreens().some(screen => screen.includes('The other presence vanishes.')));
        assert.equal(replay.getScreens().some(screen => screen.includes("What's going on here?")), kind === 'hearing');
    });
}
