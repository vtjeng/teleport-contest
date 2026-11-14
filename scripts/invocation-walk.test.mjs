import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {invocation_pos} from '../js/hack.js';
import {InMemoryStorage} from '../js/storage.js';
import { Flying } from '../js/youprop.js';

for (const kind of ['grounded', 'flying']) {
    test(`walking onto the invocation square gives the C clue: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/hack.c/invocation-walk-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        const offset = segment.moves.lastIndexOf('l');
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        // frozen/ps_test_runner.mjs gives every session a storage handle, and
        // the game keeps the recorder's empty record file there. Without one,
        // get_rnd_toptenentry() finds no record file and skips C's
        // rnd(tt_oname_maxrank) when the levels on the way make player statues
        // or corpses.
        await runSegment({
            ...segment, moves: segment.moves.slice(0, offset),
            storage: new InMemoryStorage(),
        }, options);
        assert.equal(boundary, undefined);
        assert.equal(invocation_pos(game.u.ux, game.u.uy, game), false);
        assert.equal(invocation_pos(game.u.ux + 1, game.u.uy, game), true);
        assert.equal(game.u.uevent.uvibrated, 0);
        assert.equal(Boolean(Flying(game.u)), kind === 'flying');
        const result = await runSegment(
            {...segment, storage: new InMemoryStorage()}, options);
        assert.equal(boundary, undefined);
        assert.equal(invocation_pos(game.u.ux, game.u.uy, game), true);
        assert.equal(game.u.uevent.uvibrated, 1);
        assert.ok(result.getScreens().some(screen => screen.includes(kind === 'flying'
            ? 'You feel a strange vibration beneath you.'
            : 'You feel a strange vibration under your feet.')));
    });
}
