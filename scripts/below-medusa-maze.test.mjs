import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';

// C mklev.c:1286-1289 sends a nonzero below-Medusa draw to makemaz("").
// These Wizard level-teleport recipes were recorded against the pinned C
// build. Their complete RNG/screens/cursors outputs matched this digest in
// a fresh C/JS comparison; seed 79 is the nearby zero-draw room control.
// The digests cover GameDisplay.serialize() text, so they changed when it
// began writing runs of five or more spaces as cursor movement, as
// record-session.mjs does; both recipes still matched fresh C recordings
// under diff-fresh after that change.
const nethackrc = 'OPTIONS=name:MazeAudit,role:Tourist,race:human,'
    + 'gender:female,align:neutral,playmode:debug,pettype:none,'
    + '!legacy,!tutorial,!splash_screen,!autopickup\n';

for (const { seed, level, medusa, maze, rngCount, outputHash } of [
    {
        seed: 79, level: 27, medusa: 26, maze: false, rngCount: 6043,
        outputHash: 'fc4b482bbde4210eda8627f6f0c7f66b2a6b945b926dff72972b8f0b8f322ff4',
    },
    {
        seed: 81, level: 28, medusa: 27, maze: true, rngCount: 5002,
        outputHash: '09dbf18e4ea11dd63fcab771f67e30d844031e164223ef29733be132b04b563e',
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
