import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const recording = JSON.parse(readFileSync(new URL(
    '../recordings/polyself.c/protected-vampire-shift-9701143.session.json',
    import.meta.url,
), 'utf8'));

test('shapechanger protection clears a polymorphed vampire’s shift form',
    async () => {
        const final = recording.segments[0].steps.at(-1);
        assert.match(final.screen,
            /Any special ability you may have is purely reflexive\./u);
        const js = await runJsSession(recording, process.cwd());
        const result = compareSessionOutputs(recording, js);
        assert.equal(result.passed, true, JSON.stringify(result));
        assert.equal(game.youmonst.cham, -1);
    });
