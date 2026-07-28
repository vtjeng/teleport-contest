import assert from 'node:assert/strict';
import test from 'node:test';

import { encumber_msg } from '../js/pickup.js';
import { SACK, TOOL_CLASS } from '../js/objects.js';

function burdenState() {
    return {
        disp: {},
        go: { oldcap: 0 },
        gw: {},
        invent: {
            oclass: TOOL_CLASS,
            otyp: SACK,
            owt: 530,
            nobj: null,
        },
        u: {
            abon: [0, 0, 0, 0, 0, 0],
            acurr: { a: [10, 10, 10, 10, 10, 10] },
            atemp: [0, 0, 0, 0, 0, 0],
        },
    };
}

test('encumber_msg reports the live weakness capacity transition once',
    async () => {
        const state = burdenState();
        const messages = [];
        const env = { message: (text) => messages.push(text) };

        assert.equal(await encumber_msg(state, env), 0);
        state.u.atemp[0] = -1;
        assert.equal(await encumber_msg(state, env), 1);
        assert.equal(await encumber_msg(state, env), 1);

        assert.deepEqual(messages, [
            'Your movements are slowed slightly because of your load.',
        ]);
        assert.equal(state.go.oldcap, 1);
        assert.equal(state.disp.botl, true);
    });
