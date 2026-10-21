import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FIRE_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/trap.c/mounted-fire-trap-73905113.session.json',
    import.meta.url,
), 'utf8'));

test('the hero remains mounted before reentering the wished fire trap',
    async () => {
        const segment = recording.segments[0];
        await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
        assert.ok(game.u.usteed);
        assert.ok(game.level.traps.some(trap => trap.ttyp === FIRE_TRAP
            && trap.tx === game.u.ux && trap.ty === game.u.uy - 1));
    });

test('a mounted hero enters a fire trap through C’s ordinary hero branch',
    async () => {
        const segment = recording.segments[0];
        assert.equal(segment.steps.at(-1).key, 'k');
        assert.match(segment.steps.at(-1).screen,
            /tower of flame erupts from the floor/u);
        const js = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, js);
        assert.equal(result.passed, true, JSON.stringify(result));
    });
