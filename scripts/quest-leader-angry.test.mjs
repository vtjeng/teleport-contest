import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STRAT_WAITMASK } from '../js/const.js';
import { quest_talk } from '../js/quest.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

for (const name of ['leader-angry-before-turn-control','leader-angry-final-speech']) {
    test(`hostile quest leader ${name} matches saved native C recording`,async () => {
        const recording = JSON.parse(readFileSync(new URL(`../recordings/quest.c/${name}.session.json`,import.meta.url),'utf8'));
        const output = await runJsSession(recording,new URL('..',import.meta.url).pathname);
        const comparison = compareSessionOutputs(recording,output);
        assert.equal(output.error,null);
        assert.equal(comparison.passed,true,JSON.stringify(comparison));
    });
}
test('an angry quest leader stops waiting and gives its final speech once', async () => {
    const level = { dnum: 0, dlevel: 1 };
    const state = {
        u: { uz: level },
        qstart_level: level,
        svq: { quest_status: { leader_m_id: 77, pissed_off: false } },
    };
    const leader = { m_id: 77, mpeaceful: false, mstrategy: STRAT_WAITMASK | 1 };
    const pages = [];
    const env = {
        state,
        pager: async id => pages.push(id),
        unsupported: reason => assert.fail(`unexpected quest refusal: ${reason}`),
    };
    await quest_talk(leader, env);
    await quest_talk(leader, env);
    assert.deepEqual(pages, ['leader_last']);
    assert.equal(state.svq.quest_status.pissed_off, true);
    assert.equal(leader.mstrategy & STRAT_WAITMASK, 0);
    assert.equal(leader.mstrategy & 1, 1);
});
