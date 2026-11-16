// windows.c getlin() 1873-1895: queued keys answer the prompt before the
// window port is asked. recipes/windows.c/getlin-repeat-queued-key-answer
// records the key arm through #repeat; these constructed games pin the arms
// no short recording isolates: the newline that ends the answer and leaves
// later entries queued, and a non-key entry, which is popped and discarded
// whether or not keys came before it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { cmdq_add_int, cmdq_add_key, cmdq_clear, cmdq_pop } from '../js/cmd.js';
import { CMDQ_INT, CMDQ_KEY, CQ_CANNED, CQ_REPEAT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { getlin } from '../js/windows.js';

async function settledGame() {
    // An independent normal game; ^R redraws, so no message waits for
    // --More-- when the prompt is written.
    await runSegment({
        seed: 6150823,
        datetime: '20420813194037',
        nethackrc: 'OPTIONS=name:Quill,role:Monk,race:human,gender:male,'
            + 'align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,'
            + '!autopickup\n',
        moves: '\u0012',
    });
    // ^R left itself in CQ_REPEAT for #repeat; start each case empty.
    cmdq_clear(CQ_CANNED, game);
    cmdq_clear(CQ_REPEAT, game);
    return game;
}

const topLine = (state) => state.nhDisplay.serialize().split('\n')[0];
const code = (ch) => ch.charCodeAt(0);

test('queued keys up to a newline answer getlin and are echoed', async () => {
    const state = await settledGame();
    // 'a' and 'b' form the answer, the newline ends it, and 'c' stays queued
    // for whatever reads next.
    for (const ch of 'ab\nc') cmdq_add_key(CQ_CANNED, code(ch), state);
    assert.equal(await getlin('Name it what?', state), 'ab');
    assert.equal(topLine(state), 'Name it what? ab');
    assert.deepEqual(cmdq_pop(state), { typ: CMDQ_KEY, key: code('c') });
    assert.equal(cmdq_pop(state), null);
});

test('a non-key entry after queued keys ends the answer and is dropped',
    async () => {
        const state = await settledGame();
        // The count after 'z' ends the answer and is dropped; the key after
        // it stays queued.
        cmdq_add_key(CQ_CANNED, code('z'), state);
        cmdq_add_int(CQ_CANNED, 7, state);
        cmdq_add_key(CQ_CANNED, code('q'), state);
        assert.equal(await getlin('Name it what?', state), 'z');
        assert.equal(topLine(state), 'Name it what? z');
        assert.deepEqual(cmdq_pop(state), { typ: CMDQ_KEY, key: code('q') });
        assert.equal(cmdq_pop(state), null);
    });

test('a non-key entry at the head is dropped and the prompt reads the keyboard',
    async () => {
        const state = await settledGame();
        // No key came from the queue, so the window port prompts and reads
        // the typed 'w' and Return; the queued 'q' behind the count is left.
        cmdq_add_int(CQ_CANNED, 3, state);
        cmdq_add_key(CQ_CANNED, code('q'), state);
        state.nhDisplay.pushKey(code('w'));
        state.nhDisplay.pushKey(13);
        assert.equal(await getlin('Name it what?', state), 'w');
        assert.deepEqual(cmdq_pop(state), { typ: CMDQ_KEY, key: code('q') });
        assert.equal(cmdq_pop(state), null);
        assert.equal(CMDQ_INT, 4); // include/cmd.h CMDQ_INT, the count entry.
    });

test('during #repeat getlin reads CQ_REPEAT, not CQ_CANNED', async () => {
    const state = await settledGame();
    // cmd.c cmdq_pop() picks CQ_REPEAT while gi.in_doagain is set.
    cmdq_add_key(CQ_REPEAT, code('n'), state);
    cmdq_add_key(CQ_CANNED, code('x'), state);
    state.in_doagain = true;
    try {
        assert.equal(await getlin('What do you want to write here?', state), 'n');
    } finally {
        state.in_doagain = false;
    }
    assert.deepEqual(cmdq_pop(state), { typ: CMDQ_KEY, key: code('x') });
});
