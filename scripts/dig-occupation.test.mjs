import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PICK_AXE } from '../js/objects.js';

// dig.c:341 deliberately passes the equipped object to dropx. The dropz
// source tail owns clearing its slot after inventory extraction and shipping.
test('a fumbling occupation drops the equipped pick-axe through dropz', async () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/dig.c', import.meta.url), 'utf8');
    assert.match(source, /You\("fumble and drop %s\."[\s\S]*?dropx\(uwep\);/u);
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/wield.c/setuwep-dig-fumble.recipe.session.json', import.meta.url,
    )));
    let boundary = null;
    const played = await runSegment(recipe.segments[0], {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, null);
    assert.ok(played.getScreens().some(screen => screen.includes('fumble and drop')));
    assert.equal(game.uwep, null);
    assert.equal(game.unweapon, true);
    let dropped = game.level.objlist;
    while (dropped && dropped.otyp !== PICK_AXE) dropped = dropped.nobj;
    assert.ok(dropped, 'the source drop completed its floor placement');
    assert.equal(dropped.owornmask, 0);
});
