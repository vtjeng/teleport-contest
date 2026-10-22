import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {M_AP_NOTHING, M_AP_OBJECT, M_AP_TYPE} from '../js/const.js';

for (const kind of ['giant', 'large', 'wait']) {
    test(`movement reveals an object disguise, waiting preserves it: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/hack.c/mimic-movement-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        const offset = kind === 'wait' ? segment.moves.indexOf('.') : segment.moves.length - 1;
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, offset)}, options);
        assert.equal(boundary, undefined);
        assert.equal(M_AP_TYPE(game.youmonst), M_AP_OBJECT);
        const start = [game.u.ux, game.u.uy];
        await runSegment({...segment, moves: segment.moves.slice(0, offset + 1)}, options);
        assert.equal(boundary, undefined);
        assert.deepEqual([game.u.ux, game.u.uy], kind === 'wait'
            ? start : [start[0] - 1, start[1]]);
        assert.equal(M_AP_TYPE(game.youmonst), kind === 'wait' ? M_AP_OBJECT : M_AP_NOTHING);
        if (kind === 'wait') {
            await runSegment(segment, options);
            assert.equal(boundary, undefined);
            assert.equal(M_AP_TYPE(game.youmonst), M_AP_OBJECT);
        }
    });
}
