import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runJsSession, compareSessionOutputs, formatReport } from './diff-fresh.mjs';
import { get_count } from '../js/cmd.js';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';

for (const [name, file] of [
    ['safe-integer control', 'safe-count-split'],
    ['64-bit long count', 'long-count-split'],
]) {
    test(`split count matches C: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/cmd.c/${file}.session.json`, import.meta.url), 'utf8'));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}

test('get_count preserves exact 64-bit input and source overflow reset', async () => {
    for (const [input, expected] of [
        ['9007199254740991x', 9007199254740991],
        ['9007199254740992x', 9007199254740992n],
        ['9007199254740993x', 9007199254740993n],
        ['9007199254740993\bx', 900719925474099],
        ['9223372036854775807x', 9223372036854775807n],
        ['9223372036854775808x', 0],
    ]) {
        resetGame();
        game.nhDisplay = new GameDisplay(null);
        game.iflags = {};
        game.flags = {};
        game.program_state = { input_state: 'command' };
        for (const key of input) game.nhDisplay.pushKey(key.charCodeAt(0));
        const result = await get_count(null, 0, 0, null, 0, game);
        assert.equal(result.count, expected);
        assert.equal(result.key, 'x'.charCodeAt(0));
    }
});
