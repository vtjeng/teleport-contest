import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HOLE, TRAPDOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

for (const [name, trapType, tail] of [
    ['hole', HOLE, 3],
    ['trapdoor', TRAPDOOR, 2],
]) {
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/trap.c/mounted-${name}-73905113.session.json`,
        import.meta.url,
    ), 'utf8'));

    test(`the mounted hero approaches the wished ${name}`, async () => {
        const segment = recording.segments[0];
        await runSegment({ ...segment, moves: segment.moves.slice(0, -tail) });
        assert.ok(game.u.usteed);
        assert.ok(game.level.traps.some(trap => trap.ttyp === trapType
            && trap.tx === game.u.ux && trap.ty === game.u.uy - 1));
    });

    test(`the mounted hero descends through the C ${name} hero effect`,
        async () => {
            const segment = recording.segments[0];
            assert.equal(segment.steps.at(-tail).key, 'k');
            assert.match(segment.steps.at(-1).screen, /Dlvl:2/u);
            const js = await runJsSession(recording, process.cwd());
            const result = compareSessionOutputs(recording, js);
            assert.equal(result.passed, true, JSON.stringify(result));
            assert.equal(game.u.uz.dlevel, 2);
            assert.ok(game.u.usteed);
        });
}
