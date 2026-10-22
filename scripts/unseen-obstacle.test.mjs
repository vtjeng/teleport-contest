import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {STAIRS} from '../js/const.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {heroIsBlind} from '../js/startup_a11y.js';

for (const kind of ['blindfold', 'towel']) {
    test(`blind force-fight does not identify unseen stairs: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/hack.c/unseen-obstacle-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        const offset = segment.moves.lastIndexOf('Fj');
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, offset)}, options);
        assert.equal(boundary, undefined);
        assert.ok(heroIsBlind(game));
        const [x, y] = [game.u.ux, game.u.uy];
        const target = () => game.level.at(x, y + 1);
        assert.equal(target().typ, STAIRS);
        assert.equal(target().seenv, 0);
        const result = await runSegment({...segment, moves: segment.moves.slice(0, offset + 2)}, options);
        assert.equal(boundary, undefined);
        assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
        assert.equal(target().seenv, 0);
        assert.match(result.getScreens().at(-1), /You harmlessly attack an unknown obstacle\./u);
        await runSegment(segment, options);
        assert.equal(boundary, undefined);
    });
}
