import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { potionbreathe } from '../js/potion.js';
import { newObject } from '../js/obj.js';
import { POT_SLEEPING, POT_CONFUSION, POT_BOOZE } from '../js/objects.js';
import { FREE_ACTION, SLEEP_RES, CONFUSION, FAINTED, NOT_HUNGRY, A_DEX } from '../js/const.js';

for (const type of [POT_SLEEPING, POT_CONFUSION, POT_BOOZE]) {
    for (const awareness of ['awake', 'paralyzed', 'sleeping', 'fainted']) {
        test(`vapor sensation type=${type} awareness=${awareness}`, async () => {
            for (const planning of [true, false]) {
                await runSegment({ seed: 8432207, datetime: '20261225120000',
                    nethackrc: 'OPTIONS=name:VaporFeel,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: ' ' });
                for (const property of [FREE_ACTION, SLEEP_RES, CONFUSION]) {
                    game.u.uprops[property].intrinsic = 0; game.u.uprops[property].extrinsic = 0;
                }
                game.multi = awareness === 'awake' ? 0 : -4;
                game.u.usleep = awareness === 'sleeping' ? 1 : 0;
                game.u.uhs = awareness === 'fainted' ? FAINTED : NOT_HUNGRY;
                game.nomovemsg = awareness === 'sleeping' ? 'You wake up.' : 'You can move again.';
                const state = planning ? planningState(game) : game;
                const liveMulti = game.multi, liveConfusion = game.u.uprops[CONFUSION].intrinsic;
                const core = structuredClone(game.coreCtx), display = structuredClone(game.displayCtx);
                const beforeDex = state.u.aexe[A_DEX];
                const lines = [], draws = [];
                const obj = newObject({ otyp: type, oclass: state.objects[type].oc_class,
                    material: state.objects[type].oc_material, quan: 1, dknown: false, in_use: true });
                await potionbreathe(obj, state, {
                    planning,
                    message: async line => lines.push(line),
                    random: {
                        rnd: n => { draws.push(['rnd', n]); return 2; },
                        rn2: n => { draws.push(['rn2', n]); return 1; },
                    },
                });
                const dreaming = awareness === 'sleeping' || awareness === 'fainted';
                assert.deepEqual(lines, [`You ${dreaming ? 'dream that you feel' : 'feel'} ${type === POT_SLEEPING ? 'rather tired.' : 'somewhat dizzy.'}`]);
                assert.deepEqual(draws, type === POT_SLEEPING ? [['rnd', 5], ['rn2', 2]] : [['rnd', 5]]);
                assert.equal(obj.in_use, true);
                if (type === POT_SLEEPING) {
                    assert.equal(state.multi, awareness === 'awake' ? -2 : -4);
                    assert.equal(state.nomovemsg, 'You can move again.');
                    assert.equal(state.u.aexe[A_DEX], beforeDex - 1);
                } else assert.equal(state.u.uprops[CONFUSION].intrinsic, 2);
                assert.deepEqual(game.coreCtx, core); assert.deepEqual(game.displayCtx, display);
                if (planning) {
                    assert.equal(game.multi, liveMulti);
                    assert.equal(game.u.uprops[CONFUSION].intrinsic, liveConfusion);
                }
            }
        });
    }
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('vapor sensation ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/potion.c/vapor-feel-prefix-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
