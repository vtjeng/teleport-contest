import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {sobj_at} from '../js/invent.js';
import {BOULDER} from '../js/objects.js';

for (const kind of ['diagonal', 'xorn', 'giant']) {
    test(`completed Sokoban releases boulder restrictions: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/hack.c/completed-sokoban-${kind}.session.json`, import.meta.url), 'utf8'));
        const segment = recipe.segments[0];
        const offset = segment.moves.lastIndexOf(kind === 'diagonal' ? 'u' : 'l');
        let boundary;
        const options = {onBoundary: error => { boundary = error; }};
        await runSegment({...segment, moves: segment.moves.slice(0, offset)}, options);
        assert.equal(boundary, undefined);
        assert.equal(game.u.uz.dnum, game.dungeon_topology.d_sokoban_dnum);
        assert.equal(game.level.flags.sokoban_rules, false);
        assert.ok(sobj_at(BOULDER, 35, 11, game));
        const result = await runSegment(segment, options);
        assert.equal(boundary, undefined);
        assert.deepEqual([game.u.ux, game.u.uy], [35, 11]);
        const feedback = result.getScreens().slice(offset).join('\n');
        if (kind === 'diagonal') {
            assert.equal(sobj_at(BOULDER, 35, 11, game), null);
            assert.ok(sobj_at(BOULDER, 36, 10, game));
            assert.match(feedback, /With great effort you move the boulder/);
        } else {
            assert.ok(sobj_at(BOULDER, 35, 11, game));
            if (kind === 'giant') assert.match(feedback, /maneuver over it and could pick it up/);
            else assert.doesNotMatch(feedback, /try to move the boulder|squeeze yourself/);
        }
    });
}
