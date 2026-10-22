import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {OBJ_FLOOR, STONE, VWALL} from '../js/const.js';
import {game} from '../js/gstate.js';
import {sobj_at} from '../js/invent.js';
import {runSegment} from '../js/jsmain.js';
import {BOULDER, QUARTERSTAFF} from '../js/objects.js';

// C do.c dropx/dropz/flooreffects leaves ordinary objects on stone or walls.
// Public xorn movement reaches those squares without changing the map fixture.
for (const kind of ['boulder', 'staff', 'stone']) {
    test(`drop on solid rock: ${kind}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/do.c/drop-solid-rock-${kind}.session.json`, import.meta.url), 'utf8'));
        let boundary;
        const replay = await runSegment(recipe.segments[0], {onBoundary: error => { boundary = error; }});
        assert.equal(boundary, undefined);
        const {ux, uy} = game.u;
        assert.equal(game.level.at(ux, uy).typ, kind === 'stone' ? STONE : VWALL);
        const obj = sobj_at(kind === 'staff' ? QUARTERSTAFF : BOULDER, ux, uy, game);
        assert.ok(obj, 'dropped object remains on the hero square');
        assert.equal(obj.where, OBJ_FLOOR);
        if (kind === 'staff') assert.equal(game.uwep, null);
        assert.match(replay.getScreens().join('\n'), kind === 'staff'
            ? /You drop a blessed \+1 quarterstaff\./u
            : /Oops!  The boulder drops away from you!/u);
    });
}
