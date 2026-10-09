// artifact.c:1934-1961 source creation/BUC/quantity/weight/acquisition order.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { invoke_create_ammo } from '../js/artifacts.js';
import { ECMD_TIME, FUMBLING, OBJ_FLOOR, OBJ_INVENT } from '../js/const.js';
import { ARROW } from '../js/objects.js';
import { mksobj, weight } from '../js/obj.js';
import { initRng, enableRngLog, getRngLog, rnd } from '../js/rng.js';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

async function hero() {
    // Directly chosen Healer has no starting arrow stack, keeping quantity
    // assertions independent of merging with an unrelated starting weapon.
    await runSegment({ seed: 16161001, datetime: '20560410154529',
        nethackrc: 'OPTIONS=name:Fay,role:Healer,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics\n', moves: '' });
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
}

for (const [label, blessed, cursed, seed, sides] of [
    // Blessed adds rnd(10), cursed adds nothing, uncursed adds rnd(5).
    ['blessed', true, false, 11, 10],
    ['cursed', false, true, 17, 0],
    ['uncursed', false, false, 23, 5],
]) {
    test(`ammunition ${label} preserves generation draws and source quantity/BUC`, async () => {
        await hero();
        // Source mksobj is already owned. Generate its baseline with the same
        // chosen RNG stream, then restore that stream for the artifact helper.
        initRng(seed); enableRngLog();
        const baseline = mksobj(ARROW, true, false, { state: game });
        const quantity = baseline.quan + (sides ? rnd(sides) : 0);
        const expectedRng = [...getRngLog()];
        const spe = blessed ? Math.max(baseline.spe, 0)
            : cursed ? Math.min(baseline.spe, 0) : baseline.spe;
        initRng(seed); enableRngLog();
        assert.equal(await invoke_create_ammo({ blessed, cursed, bknown: true }, game), ECMD_TIME);
        let arrows;
        for (let obj = game.invent; obj; obj = obj.nobj)
            if (obj.otyp === ARROW) arrows = obj;
        assert.ok(arrows);
        assert.equal(arrows.where, OBJ_INVENT);
        assert.equal(arrows.quan, quantity);
        assert.equal(arrows.spe, spe);
        assert.equal(arrows.blessed, blessed);
        assert.equal(arrows.cursed, cursed);
        assert.equal(arrows.bknown, true);
        // C resets both erosion fields before recomputing weight.
        assert.equal(arrows.oeroded, 0);
        assert.equal(arrows.oeroded2, 0);
        assert.equal(arrows.owt, weight(arrows, { state: game }));
        assert.deepEqual(getRngLog(), expectedRng);
    });
}

test('fumbling acquisition drops generated arrows through canonical dropx', async () => {
    await hero();
    // A positive intrinsic timeout makes source Fumbling true at acquisition;
    // no movement or turn countdown is needed in this isolated helper check.
    game.u.uprops[FUMBLING].intrinsic = 10;
    await invoke_create_ammo({ blessed: false, cursed: false, bknown: true }, game);
    let arrows;
    for (let obj = game.level.objects[game.u.ux][game.u.uy]; obj; obj = obj.nexthere)
        if (obj.otyp === ARROW) arrows = obj;
    assert.ok(arrows);
    assert.equal(arrows.where, OBJ_FLOOR);
    assert.equal(arrows.ox, game.u.ux);
    assert.equal(arrows.oy, game.u.uy);
    assert.match(game._pending_message, /Suddenly \d+ arrows fall out\./u);
});

test('ammunition C source preserves independent blessed/cursed/uncursed draws', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/artifact.c', import.meta.url), 'utf8');
    assert.match(c, /otmp->quan \+= rnd\(10\);[\s\S]*else if \(obj->cursed\)[\s\S]*otmp->spe = 0;[\s\S]*else\s+otmp->quan \+= rnd\(5\);/u);
});
