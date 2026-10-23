import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {ARROW_TRAP, LR_DOWNTELE, MAGIC_PORTAL, ROOM} from '../js/const.js';
import {GameMap} from '../js/game.js';
import {place_lregion} from '../js/mkmaze.js';
import {t_at} from '../js/trap.js';
import {enableRngLog, getRngLog, initRng} from '../js/rng.js';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

for (const refuse of [false, true]) {
    test(`forced placement planning preserves live owners when preflight ${refuse ? 'refuses' : 'accepts'}`, async () => {
        const level = new GameMap();
        level.at(10, 8).typ = ROOM;
        const trap = Object.freeze({tx: 10, ty: 8, ttyp: ARROW_TRAP});
        const monster = Object.freeze({mx: 10, my: 8, mhp: 3, mtrapped: true});
        level.traps = Object.freeze([trap]);
        level.monsters[10][8] = monster;
        const state = {level, u: Object.freeze({ux: 1, uy: 1})};
        initRng(8420134);
        enableRngLog();
        const before = [...getRngLog()];
        let checked = false;
        const refusal = new Error('pickup refused');
        const run = () => place_lregion(10, 8, 10, 8, 0, 0, 0, 0,
            LR_DOWNTELE, null, state, {
                planPositionOnly: true,
                randomOneBased: (_count, offset) => offset,
                preflightPosition(x, y, projected) {
                    checked = true;
                    assert.deepEqual([x, y], [10, 8]);
                    assert.equal(t_at(x, y, projected), null);
                    assert.equal(t_at(x, y, state), trap);
                    if (refuse) throw refusal;
                },
            });
        if (refuse) await assert.rejects(run, error => error === refusal);
        else await run();
        assert.equal(checked, true);
        assert.equal(level.monsters[10][8], monster);
        assert.equal(monster.mtrapped, true);
        assert.equal(level.traps[0], trap);
        assert.deepEqual(state.u, {ux: 1, uy: 1});
        assert.deepEqual(getRngLog(), before, 'planning consumes no live relocation RNG');
    });
}

test('forced planning cannot remove an undestroyable portal', async () => {
    const level = new GameMap();
    level.at(10, 8).typ = ROOM;
    const trap = Object.freeze({tx: 10, ty: 8, ttyp: MAGIC_PORTAL});
    level.traps = Object.freeze([trap]);
    const state = {level, u: {ux: 1, uy: 1}};
    await assert.rejects(() => place_lregion(10, 8, 10, 8, 0, 0, 0, 0,
        LR_DOWNTELE, null, state, {
            planPositionOnly: true,
            randomOneBased: (_count, offset) => offset,
            preflightPosition() { assert.fail('portal is not a viable arrival square'); },
        }), /Couldn't place lregion/);
    assert.equal(level.traps[0], trap);
});

for (const kind of ['monster', 'monster-variant', 'trap', 'control']) {
    test(`forced arrival ${kind} matches recorded C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/mkmaze.c/forced-arrival-${kind}.session.json`, import.meta.url)));
            const steps = recording.segments[0].steps;
            const arrival = steps.findLast(step => step.key === '\n');
            const calls = arrival.rng.filter(call => call.includes('place_lregion'));
            if (kind !== 'control') {
                assert.equal(calls.length, 400, 'C exhausts 200 random pairs before the sweep');
                assert.equal(arrival.rng.some(call => call.includes('@ rloc')),
                    kind.startsWith('monster'));
            } else assert.ok(calls.length < 400);
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
