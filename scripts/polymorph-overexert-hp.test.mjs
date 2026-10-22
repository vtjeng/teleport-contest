import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';
import {overexert_hp} from '../js/hack.js';
import {PM_STONE_GOLEM, PM_VALKYRIE} from '../js/monsters.js';

test('overexertion threshold reads only the active form HP', () => {
    for (const [polymorphed, humanHp, formHp, refused] of [
        [true, 1, 20, false],
        [true, 20, 1, true],
        [false, 20, 1, false],
        [false, 1, 20, true],
    ]) {
        const state = {u: {
            umonster: PM_VALKYRIE,
            umonnum: polymorphed ? PM_STONE_GOLEM : PM_VALKYRIE,
            uhp: humanHp,
            mh: formHp,
        }, disp: {botl: false}};
        let calls = 0;
        overexert_hp(state, () => { ++calls; });
        assert.equal(calls, refused ? 1 : 0);
        assert.equal(state.u.uhp, humanHp - (!polymorphed && !refused ? 1 : 0));
        assert.equal(state.u.mh, formHp - (polymorphed && !refused ? 1 : 0));
        assert.equal(state.disp.botl, !refused);
    }
});

for (const kind of ['stone', 'iron', 'human-control']) {
    test('overexertion HP ' + kind + ' matches live C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/hack.c/polymorph-overexert-hp-' + kind + '.session.json', import.meta.url)));
            const screens = recording.segments[0].steps.map(step => step.screen);
            assert.ok(screens.some(screen => screen.includes('Strained')));
            if (kind !== 'human-control') {
                assert.ok(screens.some(screen => screen.includes(kind === 'stone'
                    ? 'HP:99(100)' : 'HP:119(120)')));
                assert.ok(screens.some(screen => screen.includes('You return to human form!')
                    && screen.includes('HP:16(16)')));
            } else {
                assert.ok(screens.some(screen => screen.includes('HP:15(16)')));
            }
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
