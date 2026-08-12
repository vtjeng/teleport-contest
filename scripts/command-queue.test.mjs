// cmd.c's command queue: cmdq_add_ec(), cmdq_pop(), cmdq_peek(),
// cmdq_clear(), the reset_cmd_vars() flag that decides whether a finished
// command discards the rest of a canned sequence, and the two functions
// outside cmd.c that clear the queue when the hero is interrupted.
//
// dothrow.c dofire() is the port's only producer. It queues [doswapweapon,
// dofire] and returns ECMD_OK, so the queue has to survive that return and
// then hand rhack() one command per call, in the order it was pushed.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CQ_CANNED, CQ_REPEAT, CMDQ_EXTCMD } from '../js/const.js';
import {
    cmdq_add_ec,
    cmdq_peek,
    cmdq_pop,
    extcmdRow,
    resetCommandVars,
} from '../js/cmd.js';
import { nomul } from '../js/hack.js';
import { stop_occupation } from '../js/allmain.js';

function makeState() {
    return {
        context: {},
        iflags: {},
        u: { uinvulnerable: false, usleep: 0 },
        disp: {},
        multi: 0,
        flags: {},
    };
}

test('cmdq_add_ec() appends at the tail and cmdq_pop() takes the head', () => {
    // cmd.c:263-269 walks to the end of the list before linking the new node,
    // and cmd.c:413-418 unlinks the head, so a canned sequence runs in the
    // order dofire() pushed it: swap first, fire second.
    const state = makeState();
    assert.equal(cmdq_pop(state), null);
    cmdq_add_ec(CQ_CANNED, extcmdRow('swap'), state);
    cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
    assert.equal(cmdq_peek(CQ_CANNED, state).ec_entry.ef_txt, 'swap');
    const first = cmdq_pop(state);
    assert.equal(first.typ, CMDQ_EXTCMD);
    assert.equal(first.ec_entry.ef_txt, 'swap');
    assert.equal(cmdq_pop(state).ec_entry.ef_txt, 'fire');
    assert.equal(cmdq_pop(state), null);
});

test('cmdq_pop() reads CQ_CANNED and never CQ_REPEAT', () => {
    // cmd.c:412 chooses CQ_REPEAT only while gi.in_doagain is set, and
    // do_repeat() is the only writer of that flag. #repeat is unported, so
    // the selector is constant and a node parked in CQ_REPEAT is unreachable.
    const state = makeState();
    cmdq_add_ec(CQ_REPEAT, extcmdRow('fire'), state);
    assert.equal(cmdq_pop(state), null);
    assert.equal(cmdq_peek(CQ_REPEAT, state).ec_entry.ef_txt, 'fire');
});

test('cmdq_add_ec() refuses anything that is not an extcmdlist row', () => {
    // cmdq_add_ec() stores ext_func_tab_from_func(fn), a table row; rhack()
    // then reads ef_txt off it to pick the handler.
    const state = makeState();
    assert.throws(() => cmdq_add_ec(CQ_CANNED, null, state), TypeError);
    assert.throws(() => cmdq_add_ec(CQ_CANNED, { ef_txt: 3 }, state),
        TypeError);
    assert.throws(() => extcmdRow('nosuchcommand'), /no extcmdlist row/u);
});

test('resetCommandVars() keeps the queue only for a plain ECMD_OK', () => {
    // cmd.c:3814-3815 calls reset_cmd_vars(gm.multi < 0) for a command that
    // answered ECMD_OK and did not take time, and reset_cmd_vars(TRUE)
    // everywhere else. dofire()'s swap-and-retry arm returns exactly that
    // ECMD_OK, so this flag is what lets the queued dofire() survive.
    const state = makeState();
    cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
    resetCommandVars(state, false);
    assert.equal(cmdq_peek(CQ_CANNED, state).ec_entry.ef_txt, 'fire');
    // The reset still clears the command variables it always clears.
    assert.equal(state.context.move, 0);
    assert.equal(state.multi, 0);
    resetCommandVars(state, true);
    assert.equal(cmdq_peek(CQ_CANNED, state), null);
    // The default is C's TRUE: every other rhack() arm passes it.
    cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
    resetCommandVars(state);
    assert.equal(cmdq_peek(CQ_CANNED, state), null);
});

test('nomul() discards a canned sequence whatever value it is given', () => {
    // hack.c:4172. The clear is the last statement of the function, outside
    // every guard above it, which is why wield.c doswapweapon() zeroes
    // gm.multi by assignment instead of calling this.
    const state = makeState();
    cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
    nomul(0, state);
    assert.equal(cmdq_peek(CQ_CANNED, state), null);
    // hack.c:4163-4164 returns early when the current multi is below nval,
    // and that early return keeps the queue.
    state.multi = 0;
    cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
    nomul(1, state);
    assert.equal(cmdq_peek(CQ_CANNED, state).ec_entry.ef_txt, 'fire');
});

test('stop_occupation() discards a canned sequence on its own',
    async () => {
        // allmain.c:695 sits after both arms of the `if (go.occupation)`
        // test, so an interruption clears the queue even when there was
        // nothing to stop. A helpless hero -- gm.multi below zero, with no
        // occupation -- is the state that reaches neither nomul() call
        // above it, so this clear is the only one that can run.
        const state = makeState();
        state.go = {};
        state.multi = -1;
        cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
        await stop_occupation(state, { message: async () => {} });
        assert.equal(cmdq_peek(CQ_CANNED, state), null);
        assert.equal(state.multi, -1, 'nomul() ran after all');
    });
