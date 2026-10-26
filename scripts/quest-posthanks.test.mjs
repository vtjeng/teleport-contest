import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STRAT_WAITMASK } from '../js/const.js';
import { quest_talk } from '../js/quest.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

for (const [name, path] of [
    ['repeat audience after returning the artifact',
        '../recordings/quest.c/leader-posthanks-repeat.session.json'],
    ['first audience and artifact return control',
        '../recordings/quest.c/finish-quest-chat-wizard-neferet-cfirst-20261011.session.json'],
    ['repeat audience before quest assignment',
        '../recordings/quest.c/leader-next-repeat.session.json'],
    ['first audience before quest assignment control',
        '../recordings/quest.c/leader-next-first-audience-control.session.json'],
    ['encouragement after quest assignment',
        '../recordings/quest.c/leader-encourage-repeat.session.json'],
    ['first assignment before encouragement control',
        '../recordings/quest.c/leader-encourage-first-assignment-control.session.json'],
    ['hostile leader final speech and release from waiting',
        '../recordings/quest.c/leader-angry-final-speech.session.json'],
    ['attack before hostile leader turn control',
        '../recordings/quest.c/leader-angry-before-turn-control.session.json'],
]) {
    test(`quest leader ${name} matches the C recording`, async () => {
        const recording = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
        const output = await runJsSession(recording, new URL('..', import.meta.url).pathname);
        const comparison = compareSessionOutputs(recording, output);
        assert.equal(output.error, null);
        assert.equal(comparison.passed, true, JSON.stringify(comparison));
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
