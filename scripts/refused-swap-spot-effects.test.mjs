import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {findgd} from '../js/vault.js';

for (const kind of ['xorn', 'human']) {
    test(`refused swap leaves movement and floor-pile effects untouched: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/hack.c/refused-swap-spot-effects-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        const offset = segment.moves.lastIndexOf('hh');
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, offset)}, options);
        assert.equal(boundary, undefined);
        const start = [game.u.ux, game.u.uy];
        const guard = findgd(game);
        assert.ok(guard);
        assert.equal(guard.mpeaceful, 1);
        assert.deepEqual([guard.mx, guard.my], [start[0] - 1, start[1]]);
        assert.ok(game.level.objects[start[0]][start[1]],
            'the unchanged square has objects that must not be redescribed');
        if (kind === 'xorn') assert.ok(game.level.objects[start[0]][start[1]].nexthere,
            'the xorn variation has a pile that would otherwise open a menu');
        const replay = await runSegment({...segment, moves: segment.moves.slice(0, offset + 2)}, options);
        assert.equal(boundary, undefined);
        assert.deepEqual([game.u.ux, game.u.uy], start);
        assert.equal(game.u.umoved, false);
        assert.equal(game.domoveSucceeded, 0);
        assert.match(replay.getScreens().at(-1), /You stop\.  The guard doesn't want to swap places\./u);
        assert.doesNotMatch(replay.getScreens().at(-1), /--More--/u);
        await runSegment(segment, options);
        assert.equal(boundary, undefined);
    });
}
