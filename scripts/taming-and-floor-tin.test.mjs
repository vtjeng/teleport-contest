import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { PM_GNOME } from '../js/monsters.js';
import { TIN } from '../js/objects.js';

// Independently recorded public commands, seed 2026103107. The complete
// recordings also run in checkpoint; these assertions qualify native state.
async function replay(name) {
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/${name}.session.json`, import.meta.url,
    ), 'utf8'));
    const boundaries = [];
    await runSegment(recording.segments[0], {
        onBoundary: (error) => boundaries.push(error.message),
    });
    assert.deepEqual(boundaries, []);
}

test('read.c maybe_tame detects numeric strengthening of an existing pet', async () => {
    const c = readFileSync(new URL(
        '../nethack-c/upstream/src/read.c', import.meta.url,
    ), 'utf8');
    assert.match(c, /int was_tame = mtmp->mtame;/u);
    assert.match(c, /was_tame != mtmp->mtame/u);
    await replay('read/tame-strengthening');
    let gnome;
    for (let m = game.level.monlist; m; m = m.nmon)
        if (m.mnum === PM_GNOME) gnome = m;
    assert.ok(gnome);
    assert.equal(gnome.mtame, 7);
    assert.ok(gnome.mpeaceful);
});

test('first taming still establishes the normal initial pet tameness', async () => {
    await replay('read/first-taming-control');
    let gnome;
    for (let m = game.level.monlist; m; m = m.nmon)
        if (m.mnum === PM_GNOME) gnome = m;
    assert.ok(gnome);
    assert.equal(gnome.mtame, 5);
    assert.ok(gnome.mpeaceful);
});

for (const name of ['empty-floor-tin', 'empty-carried-tin-control']) {
    test(`eat.c use_up_tin removes ${name} and clears its occupation context`, async () => {
        await replay(`eat/${name}`);
        assert.equal(game.context.tin.tin, null);
        assert.equal(game.context.tin.o_id, 0);
        assert.ok(!game.go.occupation);
        for (let obj = game.invent; obj; obj = obj.nobj)
            assert.notEqual(obj.otyp, TIN);
        for (let obj = game.level.objlist; obj; obj = obj.nobj)
            assert.notEqual(obj.otyp, TIN);
        for (let obj = game.level.objects[game.u.ux][game.u.uy]; obj; obj = obj.nexthere)
            assert.notEqual(obj.otyp, TIN);
    });
}
