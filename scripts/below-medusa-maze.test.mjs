import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

// C mklev.c:1286-1289 sends a nonzero below-Medusa draw to makemaz("").
// These Wizard level-teleport recipes were recorded against the pinned C
// build. Their complete RNG/screens/cursors outputs matched this digest in
// a fresh C/JS comparison; seed 79 is the nearby zero-draw room control.
const nethackrc = 'OPTIONS=name:MazeAudit,role:Tourist,race:human,'
    + 'gender:female,align:neutral,playmode:debug,pettype:none,'
    + '!legacy,!tutorial,!splash_screen,!autopickup\n';

for (const { seed, level, medusa, maze, rngCount, outputHash } of [
    {
        seed: 79, level: 27, medusa: 26, maze: false, rngCount: 6043,
        outputHash: 'cd7a94273a248964a96ac5e4ce86a479f51b9d43972d103e0b0f23b05e9f5250',
    },
    {
        seed: 81, level: 28, medusa: 27, maze: true, rngCount: 5002,
        outputHash: '92712e0c53d60b89956c1c94eb550feaff182c254b9e859c625d72ed95897b5e',
    },
]) {
    test(`Wizard arrival below Medusa seed ${seed} uses ${maze ? 'maze' : 'rooms'}`, async () => {
        const replay = await runSegment({
            seed, datetime: '20431009123456', nethackrc,
            moves: `\x16${level}\n...`,
        });
        const output = {
            rng: replay.getRngLog(),
            screens: replay.getScreens(),
            cursors: replay.getCursors(),
            animFrames: replay.getAnimationFramesByStep(),
        };
        assert.equal(game.medusa_level.dlevel, medusa);
        assert.deepEqual(game.u.uz, { dnum: 0, dlevel: level });
        assert.equal(Boolean(game.level.flags.is_maze_lev), maze);
        assert.equal(output.rng.length, rngCount);
        assert.equal(
            createHash('sha256').update(JSON.stringify(output)).digest('hex'),
            outputHash,
        );
    });
}
