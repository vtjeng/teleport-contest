import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {compareSessionOutputs, runJsSession} from './diff-fresh.mjs';

for (const [kind, message] of [
    ['landing', 'You float gently to the floor.'],
    ['flying-escape', 'You fly from the pit.'],
]) {
    test(`completed Sokoban uses ordinary trap rules: ${kind}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/trap.c/completed-sokoban-${kind}.session.json`, import.meta.url)));
        assert.ok(recording.segments[0].steps.some(step => step.screen.includes(message)));
        const replay = await runJsSession(recording, process.cwd());
        assert.equal(compareSessionOutputs(recording, replay).passed, true);
        assert.equal(game.u.uz.dnum, game.dungeon_topology.d_sokoban_dnum);
        assert.equal(game.level.flags.sokoban_rules, false);
        assert.equal(Boolean(game.u.utrap), kind === 'landing');
    });
}
