import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { return_from_mtoss } from '../js/mthrowu.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { PM_GOBLIN } from '../js/monsters.js';
import { AKLYS } from '../js/objects.js';
import { ART_FIRE_BRAND } from '../js/artifacts.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

async function init() {
    await runSegment({ seed: 8432160, datetime: '20261112120000',
        nethackrc: 'OPTIONS=name:ReturnOwner,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
}
async function invoke(state, lines) {
    const monster = newMonster({ data: state.mons[PM_GOBLIN], mnum: PM_GOBLIN,
        mx: 1, my: 1, mhp: 20, mhpmax: 20, mcansee: true });
    const object = newObject({ otyp: AKLYS, oclass: state.objects[AKLYS].oc_class, quan: 1 });
    state.gb.bhitpos = { x: 1, y: 1 };
    const coreBefore = structuredClone(game.coreCtx);
    let draws = 0;
    await return_from_mtoss(monster, object, true, state, { rn2: bound => {
        assert.equal(bound, 100); ++draws; return 1;
    } }, {
        message: async text => { lines.push(text); },
        temporaryDisplay: async () => {}, newsym: () => {},
    });
    assert.equal(draws, 2);
    assert.deepEqual(game.coreCtx, coreBefore);
    assert.equal(monster.mw, object);
}

test('aklys return claims the message throttle', async () => {
    await init(); game.moves = 10;
    const liveLines = [];
    await invoke(game, liveLines);
    assert.equal(liveLines.length, 1);
    assert.match(liveLines[0], /returns to/);
    assert.equal(game._returnDoNotAnnoy, 10);
});
test('return message is suppressed at exactly500 turns and allowed at501', async () => {
    await init(); const lines = [];
    game.moves = 100; await invoke(game, lines);
    assert.equal(lines.length, 1);
    game.moves = 600; await invoke(game, lines);
    assert.equal(lines.length, 1);
    game.moves = 601; await invoke(game, lines);
    assert.equal(lines.length, 2);
    assert.equal(game._returnDoNotAnnoy, 601);
});
test('a new game has its own returning-weapon throttle', async () => {
    await init(); const lines = [];
    game.moves = 1000; await invoke(game, lines);
    await init(); game.moves = 20; await invoke(game, lines);
    assert.equal(lines.length, 2);
    assert.equal(game._returnDoNotAnnoy, 20);
});
test('zero remains the C uninitialized sentinel', async () => {
    await init(); const lines = [];
    game.moves = 0; await invoke(game, lines); await invoke(game, lines);
    assert.equal(lines.length, 2);
    assert.equal(game._returnDoNotAnnoy, 0);
});
test('an artifact that returns and hits its thrower runs artifact_hit', async () => {
    // mthrowu.c:935-937. Only an aklys returns (weapon.c:514-517) and no
    // artifact is an aklys, so the artifact here is constructed: Fire Brand's
    // attack has no damage die (artilist.h), so spec_dbon() doubles the
    // goblin's damage when artifact_hit() runs.
    await init(); game.moves = 10;
    const monster = newMonster({ data: game.mons[PM_GOBLIN], mnum: PM_GOBLIN,
        mx: 1, my: 1, mhp: 20, mhpmax: 20, mcansee: true });
    const object = newObject({ otyp: AKLYS, oclass: game.objects[AKLYS].oc_class,
        quan: 1, oartifact: ART_FIRE_BRAND });
    game.gb.bhitpos = { x: 1, y: 1 };
    // rn2(100) twice: 1 makes it back, then 0 misses the catch
    // (mthrowu.c:881); rn2(2) = 1 hits the thrower; rnd(3) = 1. Every later
    // draw returns bound - 1, so artifact_hit()'s rn2(4)/rn2(7) item and
    // armor burns stay off.
    const queue = [1, 0, 1];
    const random = {
        rn2: (bound) => (queue.length ? queue.shift() : bound - 1),
        rnd: () => 1,
        rnl: (bound) => bound - 1,
    };
    await return_from_mtoss(monster, object, true, game, random, {
        message: async () => {}, temporaryDisplay: async () => {}, newsym: () => {},
    });
    // dmg = 1 + rnd(3) = 2, doubled to 4 by spec_dbon().
    assert.equal(monster.mhp, 16);
    assert.equal(game.unported?.has('artifact.c artifact_hit'), false);
});
for (const name of ['return', 'monochrome', 'before-control']) {
    test('aklys return throttle ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mthrowu.c/aklys-return-throttle-' + name + '.session.json', import.meta.url)));
            const r = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(r.passed, true, formatReport(r));
        } finally { removeScoringWorkspace(root); }
    });
}
