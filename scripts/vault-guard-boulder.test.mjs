import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {sobj_at} from '../js/invent.js';
import {runSegment} from '../js/jsmain.js';
import {BOULDER} from '../js/objects.js';
import {findgd} from '../js/vault.js';

// C vault.c invault destroys every boulder at the entry before announcing
// the guard. A dug entrance avoids the unrelated solid-rock drop refusal.
for (const kind of ['single', 'multiple', 'blind']) {
    test(`guard fractures entry boulders: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/vault.c/guard-boulder-${kind}.session.json`, import.meta.url), 'utf8'));
        let boundary;
        const replay = await runSegment(recipe.segments[0], {onBoundary: error => { boundary = error; }});
        assert.equal(boundary, undefined);
        assert.equal(sobj_at(BOULDER, 74, 15, game), null, 'C-qualified entry has no remaining boulder');
        assert.equal(findgd(game), null, 'guard accepted the name and left after clearing the entry');
        const screens = replay.getScreens().join('\n');
        assert.match(screens, kind === 'blind' ? /You hear a boulder shatter\./u
            : kind === 'multiple' ? /You see boulders shatter\./u : /You see a boulder shatter\./u);
    });
}
