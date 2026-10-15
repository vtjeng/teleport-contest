import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    COULD_SEE,
    IN_SIGHT,
    STRAT_CLOSE,
    STRAT_WAITMASK,
} from '../js/const.js';
import { monst_globals_init, MS_DJINNI, PM_PRISONER } from '../js/monsters.js';
import { quest_talk } from '../js/quest.js';

const QUEST_C = readFileSync('nethack-c/upstream/src/quest.c', 'utf8');
const MONMOVE_C = readFileSync('nethack-c/upstream/src/monmove.c', 'utf8');

function prisonerState() {
    const state = {
        moves: 0,
        u: {
            ux: 2,
            uy: 2,
            uprops: [],
            ualign: { record: 0, abuse: 0 },
        },
        svq: { quest_status: { leader_m_id: 77 } },
        context: { warntype: {} },
        viz_array: Array.from({ length: 21 }, () => new Uint8Array(80)),
        level: { worms: [], monlist: null },
    };
    monst_globals_init(state);
    const prisoner = {
        m_id: 12,
        data: state.mons[PM_PRISONER],
        mx: 3,
        my: 2,
        mstrategy: STRAT_CLOSE,
        mpeaceful: true,
        mcanmove: true,
        msleeping: false,
        minvis: false,
        mundetected: false,
    };
    state.viz_array[prisoner.my][prisoner.mx] = IN_SIGHT | COULD_SEE;
    return { state, prisoner };
}

function conversationOps(state, messages) {
    return {
        state,
        unsupported(reason) {
            assert.fail(`unexpected unsupported quest path: ${reason}`);
        },
        async message(line) {
            messages.push(line);
        },
    };
}

test('quest.c prisoner_speaks releases a waiting prisoner after speaking',
    async () => {
        const { state, prisoner } = prisonerState();
        const messages = [];

        await quest_talk(prisoner, conversationOps(state, messages));

        assert.match(messages[0], /prisoner speaks:/u);
        assert.equal(messages[1], '"I\'m finally free!"');
        assert.equal(prisoner.mstrategy & STRAT_WAITMASK, 0);
        assert.equal(prisoner.mpeaceful, true);
        assert.equal(state.u.ualign.record, 3);
    });

test('quest.c prisoner_speaks ignores non-prisoners and non-waiting prisoners',
    async () => {
        for (const { species, strategy } of [
            { species: false, strategy: STRAT_CLOSE },
            { species: true, strategy: 0 },
        ]) {
            const { state, prisoner } = prisonerState();
            if (!species) prisoner.data = { ...prisoner.data, msound: MS_DJINNI };
            prisoner.mstrategy = strategy;
            const messages = [];

            await quest_talk(prisoner, conversationOps(state, messages));

            assert.deepEqual(messages, []);
            assert.equal(state.u.ualign.record, 0);
        }
    });

test('prisoner speech source gates and active dochug callers match C', () => {
    const start = QUEST_C.indexOf('prisoner_speaks(struct monst *mtmp)');
    const end = QUEST_C.indexOf('\nvoid\nquest_chat', start);
    assert.ok(start >= 0 && end > start);
    const source = QUEST_C.slice(start, end);
    assert.match(source,
        /mtmp->data == &mons\[PM_PRISONER\][\s\S]*?mtmp->mstrategy & STRAT_WAITMASK/u);
    assert.match(source,
        /if \(canseemon\(mtmp\)\)[\s\S]*?Monnam\(mtmp\)[\s\S]*?verbalize\("I'm finally free!"\)[\s\S]*?mtmp->mstrategy &= ~STRAT_WAITMASK;[\s\S]*?mtmp->mpeaceful = 1;[\s\S]*?adjalign\(3\);[\s\S]*?angry_guards\(FALSE\)/u);
    assert.match(QUEST_C,
        /case MS_DJINNI:\s*prisoner_speaks\(mtmp\);\s*break;/u);
    assert.match(MONMOVE_C,
        /if \(mtmp->mcanmove && \(mtmp->mstrategy & STRAT_CLOSE\)[\s\S]*?quest_talk\(mtmp\);/u);
});
