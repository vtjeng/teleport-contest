import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CLOUD, DOOR, D_BROKEN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const cases = [
    {
        file: 'pet-swap-broken-door-9800563.session.json',
        terrain: DOOR,
        message: /You swap places with your little dog\./u,
        doorMask: D_BROKEN,
        setupStep: 10,
        setupMessage: /As you kick the door, it crashes open!/u,
    },
    {
        file: 'pet-swap-cloud-52093325.session.json',
        terrain: CLOUD,
        message: /You swap places with your saddled pony\./u,
        setupStep: 9,
        setupMessage: /A cloud\./u,
    },
];

for (const { file, terrain, message, doorMask, setupStep, setupMessage } of cases) {
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/hack.c/${file}`, import.meta.url,
    ), 'utf8'));

    test(`a pet occupies ${file} terrain before displacement`, async () => {
        const segment = recording.segments[0];
        await runSegment({ ...segment, moves: segment.moves.slice(0, -1) });
        const x = game.u.ux + 1;
        const y = game.u.uy;
        const square = game.level.at(x, y);
        assert.equal(square.typ, terrain);
        if (doorMask !== undefined) assert.equal(square.flags, doorMask);
        assert.ok(m_at(x, y, game)?.mtame);
    });

    test(`C pet displacement matches at ${file}`, async () => {
        const steps = recording.segments[0].steps;
        assert.match(steps[setupStep].screen, setupMessage);
        const last = steps.at(-1);
        assert.equal(last.key, 'l');
        assert.match(last.screen, message);
        const js = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, js);
        assert.equal(result.passed, true, JSON.stringify(result));
    });
}
