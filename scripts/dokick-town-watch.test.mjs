import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { D_LOCKED, D_WARNED } from '../js/const.js';
import { game } from '../js/gstate.js';
import { in_town } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { is_watch } from '../js/mondata.js';
import { couldsee } from '../js/vision.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/dokick.c/dokick-town-watch-door-7003.session.json',
    import.meta.url,
), 'utf8')).segments[0];
const recorded = JSON.parse(readFileSync(new URL(
    '../recordings/dokick.c/dokick-town-watch-door-7003.session.json',
    import.meta.url,
), 'utf8')).segments[0];
const firstKick = recipe.moves.slice(0, recipe.moves.indexOf('\x04k') + 2);

async function replay(moves) {
    let boundary = null;
    await runSegment({ ...recipe, moves }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, null);
    assert.deepEqual([game.u.ux, game.u.uy], [27, 7]);
    assert.equal(in_town(27, 6, game), true);
    return game.level.at(27, 6);
}

test('generated Minetown door kick warns, then arrests on repeat', async () => {
    assert.match(recorded.steps[36].screen,
        /Whammm!!  A watch captain yells:  "Hey, stop damaging that door!"/u);
    assert.match(recorded.steps[39].screen,
        /"Halt, vandal!  You're under arrest!"  The guard gets angry!/u);

    const door = await replay(firstKick);
    assert.match(game._ttyToplines, /Hey, stop damaging that door!/u);
    assert.ok((door.doormask & D_LOCKED) !== 0);
    assert.ok((door.looted & D_WARNED) !== 0);
    assert.ok([...function* () {
        for (let mon = game.level.monlist; mon; mon = mon.nmon)
            if (is_watch(mon.data) && couldsee(mon.mx, mon.my, game)) yield mon;
    }()].some((mon) => mon.mpeaceful));

    await replay(recipe.moves);
    assert.ok([...function* () {
        for (let mon = game.level.monlist; mon; mon = mon.nmon)
            if (is_watch(mon.data)) yield mon;
    }()].every((mon) => !mon.mpeaceful));
});
