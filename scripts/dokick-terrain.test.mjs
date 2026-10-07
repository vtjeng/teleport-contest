import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CORR, D_CLOSED, D_ISOPEN, D_LOCKED, DOOR, DUST, ECMD_TIME, GRAVE,
    ROOM, SCORR, SDOOR } from '../js/const.js';
import { SCATTER_MAY_HIT } from '../js/explode.js';
import { kick_nondoor } from '../js/dokick.js';
import { make_engr_at, engr_at } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ROCK } from '../js/objects.js';
import { initRng } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { compareSessionOutputs, formatReport } from './diff-fresh.mjs';
import { KICK_TERRAIN_CASES } from './run-dokick-terrain.mjs';

const source = readFileSync(new URL('../nethack-c/upstream/src/dokick.c',
    import.meta.url), 'utf8');
const rm = readFileSync(new URL('../nethack-c/upstream/include/rm.h',
    import.meta.url), 'utf8');
const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/dokick.c/kick-tree-independent.session.json', import.meta.url), 'utf8'));
async function target(typ, flags = 0) {
    await runSegment({ ...recipe.segments[0], moves: '' });
    clearTtyMessageWindow(game);
    const x = game.u.ux + 1;
    const y = game.u.uy;
    const location = game.level.at(x, y);
    location.typ = typ;
    location.flags = location.doormask = flags;
    for (let i = 0; i < 20; i++) game.nhDisplay.pushKey(32); // Dismiss source More boundaries.
    return { x, y, location };
}

test('tree scattering uses the C monster and hero hit bits', () => {
    const hack = readFileSync(new URL('../nethack-c/upstream/include/hack.h',
        import.meta.url), 'utf8');
    assert.match(hack, /#define MAY_HITMON 0x02/u);
    assert.match(hack, /#define MAY_HITYOU 0x04/u);
    assert.match(hack, /#define MAY_HIT \(MAY_HITMON \| MAY_HITYOU\)/u);
    assert.equal(SCATTER_MAY_HIT, 0x02 | 0x04); // Both source scatter targets.
});

test('secret door and corridor success preserve locked doors and reveal passages', async () => {
    for (const [typ, flags, expectedType, expectedFlags] of [
        [SDOOR, D_CLOSED, DOOR, D_ISOPEN],
        [SDOOR, D_LOCKED, DOOR, D_LOCKED],
        [SCORR, 0, CORR, 0],
    ]) {
        const { x, y, location } = await target(typ, flags);
        // rn2(30) returns at most 29; this source parameter forces success.
        assert.equal(await kick_nondoor(x, y, 30, game), ECMD_TIME);
        assert.equal(location.typ, expectedType);
        assert.equal(location.flags, expectedFlags);
    }
});

test('a disturbed headstone uses canonical horizontal and clears grave state', async () => {
    assert.match(rm, /#define disturbed\s+horizontal/u);
    assert.match(rm, /#define emptygrave flags/u);
    assert.match(source, /!gm\.maploc->disturbed && !rn2\(2\)/u);
    const { x, y, location } = await target(GRAVE, 1); // C emptygrave bit.
    location.horizontal = true; // C wished disturbed grave, not an extra state field.
    make_engr_at(x, y, 'Test headstone', null, game.moves, DUST, { state: game });
    initRng(5); // The first rn2(4)==0 chooses the headstone destruction arm.
    assert.equal(await kick_nondoor(x, y, 30, game), ECMD_TIME);
    assert.equal(location.typ, ROOM);
    assert.equal(location.flags, 0);
    assert.equal(location.horizontal, false);
    assert.equal(engr_at(x, y, game), null);
    assert.equal(game.level.objects[x][y].otyp, ROCK);
});

for (const name of KICK_TERRAIN_CASES) {
    test(`independent ${name} reaches the C kick terrain owner and matches`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/dokick.c/kick-${name}-independent.session.json`,
            import.meta.url), 'utf8'));
        assert.ok(recording.segments[0].steps.some(step => step.rng.some(
            draw => /kick_nondoor\(dokick\.c:/u.test(draw))),
        'recorded C must reach the selected terrain function, not only match startup');
        let boundary;
        const replay = await runSegment(recording.segments[0], {
            onBoundary(error) { boundary = error; },
        });
        assert.equal(boundary, undefined, boundary?.message);
        const result = compareSessionOutputs(recording, {
            rng: replay.getRngLog(), screens: replay.getScreens(),
            cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
        });
        assert.equal(result.passed, true, formatReport(result));
    });
}

for (const name of ['throne-fall-through-independent',
    'altar-wrath-kick-independent-b24',
    'disturb-grave-kick-valkyrie-c60-second-kick-continuation']) {
    test(`existing ${name} preserves the complete terrain caller replay`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/dokick.c/${name}.session.json`, import.meta.url), 'utf8'));
        const replay = await runSegment(recording.segments[0]);
        const result = compareSessionOutputs(recording, {
            rng: replay.getRngLog(), screens: replay.getScreens(),
            cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
        });
        assert.equal(result.passed, true, formatReport(result));
    });
}
