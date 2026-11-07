// C's You_feel() (pline.c:388-400) prints "You dream that you feel ..."
// while the hero is Unaware (youprop.h:399: multi < 0 and asleep, knocked
// out or fainted). Each test below reaches one C file's You_feel() call
// from a path that can run while the hero sleeps, and checks that the port
// dreams the feeling. Two other files have recordings instead:
// recordings/mhitu.c/gulpmu-cold-resistant-asleep and
// recordings/do.c/revive-corpse-backpack-asleep.

import assert from 'node:assert/strict';
import test from 'node:test';

import { pluslvl } from '../js/exper.js';

// Marks `state` as C's fall_asleep() leaves it: multi negative and usleep
// set, so trap.c unconscious() and youprop.h Unaware are true. Ten turns
// is any sleep length; only the sign of multi matters.
function asleep(state) {
    state.multi = -10;
    state.u.usleep = 1;
    return state;
}

// Thrown by a message callback to stop a function after its first line,
// so a test needs only the state that line reads.
const STOP = new Error('stop after the first message');

function firstLine() {
    const lines = [];
    return {
        lines,
        message: async (line) => {
            lines.push(line);
            throw STOP;
        },
    };
}

test('exper.c pluslvl(FALSE) dreams the experience of a sleeping hero', async () => {
    // mhitu.c:2249 doseduce() calls pluslvl(FALSE) for a hero a foocubus
    // seduces in her sleep; exper.c:315 opens with You_feel().
    const state = asleep({ u: {} });
    const { lines, message } = firstLine();
    await assert.rejects(pluslvl(false, state, { message }), STOP);
    assert.deepEqual(lines, ['You dream that you feel more experienced.']);
});
