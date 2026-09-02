import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ok_to_quest } from '../js/quest.js';
import { A_CURRENT, A_ORIGINAL, MIN_QUEST_ALIGN } from '../js/const.js';

// Build a minimal mock state that satisfies ok_to_quest()'s path through
// quest_status fields and is_pure().  C ref: quest.c ok_to_quest() (139-144)
// and is_pure() (152-177).
function makeState(overrides = {}) {
    const qs = {
        got_quest: false,
        got_thanks: false,
        killed_leader: false,
        ...overrides,
    };
    return {
        svq: { quest_status: qs },
        // is_pure(false) reads u.ualign and u.ualignbase but never prompts,
        // so these values control the purity result without async I/O.
        wizard: false,
        u: {
            ualign: { type: 0, record: MIN_QUEST_ALIGN },
            // A_ORIGINAL=1, A_CURRENT=0; both set to 0 (the same alignment
            // type) so that is_pure() returns 1.
            ualignbase: [0, 0],
        },
    };
}

describe('ok_to_quest', () => {
    // C: (got_quest && is_pure(FALSE) > 0) evaluates true.
    test('returns true when got_quest and hero is pure', async () => {
        const state = makeState({ got_quest: true });
        assert.equal(await ok_to_quest(state), true);
    });

    // C: (got_thanks && is_pure(FALSE) > 0) evaluates true.
    test('returns true when got_thanks and hero is pure', async () => {
        const state = makeState({ got_thanks: true });
        assert.equal(await ok_to_quest(state), true);
    });

    // C: killed_leader short-circuits to true regardless of purity.
    test('returns true when leader is killed, even if impure', async () => {
        const state = makeState({ killed_leader: true });
        // Make hero impure: alignment record below MIN_QUEST_ALIGN.
        state.u.ualign.record = 0;
        assert.equal(await ok_to_quest(state), true);
    });

    // C: none of the conditions met -> false.
    test('returns false when no quest progress', async () => {
        const state = makeState();
        assert.equal(await ok_to_quest(state), false);
    });

    // C: got_quest is true but is_pure(FALSE) returns 0 (alignment record
    // too low) -> the conjunction is false and killed_leader is false.
    test('returns false when got_quest but hero is impure', async () => {
        const state = makeState({ got_quest: true });
        // Alignment record below MIN_QUEST_ALIGN makes is_pure() return 0.
        state.u.ualign.record = MIN_QUEST_ALIGN - 1;
        assert.equal(await ok_to_quest(state), false);
    });

    // C: got_quest is true but alignment type differs from original ->
    // is_pure() returns -1 -> conjunction false.
    test('returns false when got_quest but hero has wrong alignment type', async () => {
        const state = makeState({ got_quest: true });
        // Original alignment (ualignbase[A_ORIGINAL]=1) differs from current
        // ualign.type=0, so is_pure() returns -1.
        state.u.ualignbase[A_ORIGINAL] = 1;
        assert.equal(await ok_to_quest(state), false);
    });

    // C: got_quest is true but hero converted (ualignbase[A_CURRENT] differs
    // from ualignbase[A_ORIGINAL]) -> is_pure() returns -1.
    test('returns false when got_quest but hero has converted', async () => {
        const state = makeState({ got_quest: true });
        // A_CURRENT (index 0) differs from A_ORIGINAL (index 1).
        state.u.ualignbase[A_CURRENT] = 1;
        state.u.ualignbase[A_ORIGINAL] = 0;
        state.u.ualign.type = 0;
        assert.equal(await ok_to_quest(state), false);
    });
});
