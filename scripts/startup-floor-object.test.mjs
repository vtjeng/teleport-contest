import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeSession } from '../frozen/session_loader.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs } from './diff-fresh.mjs';

const recording = normalizeSession(JSON.parse(readFileSync(
    new URL('../recordings/allmain.c/startup-floor-object.session.json',
        import.meta.url),
    'utf8',
)));

test('a generated object under the starting hero follows C pickup(1)',
    async () => {
        // Seed 2021184 places a wand on the starting staircase. The recorder
        // reached allmain.c:75 pickup(1); this reuses the original saved C witness.
        const segment = recording.segments[0];
        let boundary = null;
        const replay = await runSegment({
            seed: segment.seed,
            datetime: segment.datetime,
            nethackrc: segment.nethackrc,
            moves: segment.moves,
        }, { onBoundary: (error) => { boundary = error; } });
        const output = {
            rng: replay.getRngLog(),
            screens: replay.getScreens(),
            cursors: replay.getCursors(),
            animFrames: replay.getAnimationFramesByStep(),
        };
        assert.equal(boundary, null);
        assert.equal(compareSessionOutputs(recording, output).passed, true);
        assert.equal(replay.getRngLog().length, 2848);
        assert.equal(replay.getScreens().length, 2);
        assert.equal(Boolean(game.level.objects[game.u.ux][game.u.uy]), true);
    });

test('startup without an object still reaches the first command', async () => {
    // Nearby seeded control: the starting square has an engraving, not an
    // object. The existing preamble test pins its C-derived text and RNG.
    let boundary = null;
    await runSegment({
        seed: 100778,
        datetime: '20270311094500',
        nethackrc: 'OPTIONS=name:Engraver,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen\n',
        moves: ' ',
    }, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, null);
    assert.equal(Boolean(game.level.objects[game.u.ux][game.u.uy]), false);
});
