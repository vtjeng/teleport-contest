import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {PM_DISPLACER_BEAST} from '../js/monsters.js';

function beast() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        if (monster.data.pmidx === PM_DISPLACER_BEAST) return monster;
    throw new Error('The public setup did not create a displacer beast');
}

for (const kind of ['tame', 'peaceful']) {
    test(`monster-initiated displacement follows its own swap path: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/hack.c/displacer-swap-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        const offset = segment.moves.lastIndexOf('l');
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, offset)}, options);
        assert.equal(boundary, undefined);
        const [x, y] = [game.u.ux, game.u.uy];
        assert.deepEqual([beast().mx, beast().my], [x + 1, y]);
        assert.deepEqual([beast().mux, beast().muy], [x, y]);
        assert.equal(Boolean(beast().mtame), kind === 'tame');
        assert.ok(beast().mpeaceful);
        const result = await runSegment({...segment, moves: segment.moves.slice(0, offset + 1)}, options);
        assert.equal(boundary, undefined);
        assert.deepEqual(result.getRngSlices().at(-1).slice(0, 1), ['rn2(2)=0']);
        assert.deepEqual([game.u.ux, game.u.uy], [x + 1, y]);
        assert.deepEqual([beast().mx, beast().my], [x, y]);
        assert.deepEqual([beast().mux, beast().muy], [x + 1, y]);
        assert.equal(Boolean(game.context.mon_moving), false);
        assert.match(result.getScreens().at(-1), kind === 'tame'
            ? /Your displacer beast swaps places with you\.\.\./u
            : /The displacer beast swaps places with you\.\.\./u);
        await runSegment(segment, options);
        assert.equal(boundary, undefined);
    });
}
