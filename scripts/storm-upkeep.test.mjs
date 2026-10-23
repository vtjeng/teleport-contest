import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const kind of ['lightning', 'variant', 'silent', 'no-strike', 'control', 'thunder']) {
    test(`storm ${kind} match C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/timeout.c/storm-${kind}.session.json`, import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}

test('planning stops before storm rays, thunder, and RNG change', async () => {
    const root = createScoringWorkspace(process.cwd(), []);
    try {
        const recipe = JSON.parse(readFileSync(new URL(
            '../recipes/timeout.c/storm-lightning.session.json', import.meta.url)));
        const segment = recipe.segments[0];
        segment.moves = segment.moves.slice(0, segment.moves.indexOf('m.'));
        const output = await runJsSession(recipe, root);
        assert.equal(output.error, null);
        const {game} = await import(pathToFileURL(`${root}/js/gstate.js`));
        const {finishElapsedTurn} = await import(pathToFileURL(`${root}/js/allmain.js`));
        const {getRngLog} = await import(pathToFileURL(`${root}/js/rng.js`));
        const {preflightSimpleMonsterActions} = await import(
            pathToFileURL(`${root}/js/unported_monster_actions.js`));
        const snapshot = () => JSON.stringify({
            bubbles: game.air_bubbles, up: game.air_bubbles_up,
            hero: [game.u.ux, game.u.uy], terrain: game.level.locations,
            vision: game.viz_array, moves: game.moves,
            rng: getRngLog(), core: game.coreCtx, display: game.displayCtx,
            occupants: game.level.monsters.map(column => column.map(mon =>
                mon ? [mon.m_id, mon.mx, mon.my] : null)),
        }, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
        const before = snapshot();
        const plan = await preflightSimpleMonsterActions(game, {
            advanceRound: (planned, random) => finishElapsedTurn(planned, random, {planning: true}),
        });
        assert.equal(plan.beforeStorms, true);
        assert.equal(snapshot(), before);
    } finally {
        removeScoringWorkspace(root);
    }
});
