import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {PM_CROESUS} from '../js/monsters.js';
import {findgd} from '../js/vault.js';

// C vault.c invault: claiming the dead Croesus's name angers the guard and
// arms it immediately. The unique-monster confirmation is essential: a named
// doppelganger does not set Croesus's death record and is rejected setup.
for (const kind of ['hearing', 'deaf']) {
    test(`dead Croesus name angers and arms the guard for a ${kind} hero`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/vault.c/croesus-dead-guard-${kind}.session.json`, import.meta.url), 'utf8'));
        let boundary;
        const replay = await runSegment(recipe.segments[0], {onBoundary: error => { boundary = error; }});
        assert.equal(boundary, undefined);
        assert(game.mvitals[PM_CROESUS].died > 0, 'actual Croesus was killed');
        const guard = findgd(game);
        assert(guard);
        assert.equal(guard.mpeaceful, 0);
        assert(guard.mw, 'guard equips its weapon before its next turn');
        const screens = replay.getScreens().join('\n');
        assert.match(screens, kind === 'hearing' ? /Back from the dead, are you\?/u
            : /mouths something and looks very angry!/u);
    });
}
