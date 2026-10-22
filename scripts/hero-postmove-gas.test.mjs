import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {PM_HEZROU, PM_STEAM_VORTEX} from '../js/monsters.js';
import {inside_region} from '../js/region.js';

for (const [kind, form, damage] of [['hezrou', PM_HEZROU, 8], ['steam-vortex', PM_STEAM_VORTEX, 0]]) {
    test(`polymorphed hero leaves its gas at the previous square: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/hack.c/hero-postmove-gas-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        const offset = segment.moves.lastIndexOf('h');
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, offset)}, options);
        assert.equal(boundary, undefined);
        assert.equal(game.youmonst.data.pmidx, form);
        assert.equal(Boolean(game.youmonst.mcan), false);
        assert.deepEqual(game.level.regions ?? [], []);
        const [x, y] = [game.u.ux, game.u.uy];
        await runSegment(segment, options);
        assert.equal(boundary, undefined);
        assert.deepEqual([game.u.ux, game.u.uy], [x - 1, y]);
        assert.equal(game.level.regions.length, 1);
        const cloud = game.level.regions[0];
        assert.equal(cloud.arg, damage);
        assert.deepEqual(cloud.rects, [{lx: x, ly: y, hx: x, hy: y}]);
        assert.equal(inside_region(cloud, game.u.ux, game.u.uy), false);
        assert.equal(cloud.hero_inside, false);
        assert.equal(cloud.heros_fault, true);
        assert.ok(cloud.ttl > 0);
    });
}
