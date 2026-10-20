import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { D_BROKEN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { in_town } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { is_watch } from '../js/mondata.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/dokick.c/dokick-town-watch-kicked-open-7003.session.json',
    import.meta.url,
), 'utf8')).segments[0];
const recorded = JSON.parse(readFileSync(new URL(
    '../recordings/dokick.c/dokick-town-watch-kicked-open-7003.session.json',
    import.meta.url,
), 'utf8')).segments[0];

test('breaking a generated Minetown door makes the watch arrest the hero', async () => {
    assert.match(recorded.steps[61].screen,
        /As you kick the door, it crashes open!  A watch captain yells:/u);
    assert.match(recorded.steps[62].screen,
        /"Halt, thief!  You're under arrest!"  An angry guard is approaching!/u);

    let boundary = null;
    await runSegment(recipe, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, null);
    assert.deepEqual([game.u.ux, game.u.uy], [27, 7]);
    assert.equal(in_town(27, 6, game), true);
    assert.equal(game.level.at(27, 6).doormask, D_BROKEN);
    assert.ok(!game.unported.has('mon.c get_iter_mons watchman_thief_arrest'));
    const guards = [];
    for (let mon = game.level.monlist; mon; mon = mon.nmon)
        if (is_watch(mon.data)) guards.push(mon);
    assert.ok(guards.length > 0);
    assert.ok(guards.every((mon) => !mon.mpeaceful));
});
