import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CHA,
    A_CHAOTIC,
    A_LAWFUL,
    A_NEUTRAL,
    A_NONE,
    A_STR,
} from '../js/const.js';
import { getnow } from '../js/calendar.js';
import { align_str, attrval, fmt_elapsed_time } from '../js/insight.js';

test('align_str names the four alignments insight.c switches on', () => {
    // insight.c align_str(); the default arm covers every other value.
    assert.equal(align_str(A_CHAOTIC), 'chaotic');
    assert.equal(align_str(A_NEUTRAL), 'neutral');
    assert.equal(align_str(A_LAWFUL), 'lawful');
    assert.equal(align_str(A_NONE), 'unaligned');
    assert.equal(align_str(7), 'unknown');
});

test('attrval renders Strength on its own scale', () => {
    // insight.c attrval(). 18 is the last value printed plainly; 19 through
    // 118 are the "18/xx" percentile band, where 118 is STR18(100); above
    // that, 119 through 125 print as 19 through 25.
    assert.equal(attrval(A_STR, 3), '3');
    assert.equal(attrval(A_STR, 18), '18');
    assert.equal(attrval(A_STR, 19), '18/01');
    assert.equal(attrval(A_STR, 68), '18/50');
    assert.equal(attrval(A_STR, 118), '18/100');
    assert.equal(attrval(A_STR, 119), '19');
    assert.equal(attrval(A_STR, 125), '25');
    // Every other characteristic prints its value unchanged, including one
    // above 18, which the Strength band would otherwise reformat.
    assert.equal(attrval(A_CHA, 18), '18');
    assert.equal(attrval(A_CHA, 19), '19');
});

function elapsedState(realtime) {
    // The recorder's fixed clock makes getnow() constant, so setting
    // start_timing to it leaves fmt_elapsed_time() reporting realtime alone.
    const state = {
        fixedDatetime: '20310203040506',
        recorderIsDst: false,
        urealtime: { realtime, start_timing: 0 },
    };
    state.urealtime.start_timing = getnow(state);
    return state;
}

test('fmt_elapsed_time formats the cases insight.c documents', () => {
    // The six examples in insight.c fmt_elapsed_time()'s own comment, given
    // as D-HH:MM:SS, plus the " none" fallback for a game that has just
    // started. ENL_GAMEINPROGRESS is 0, the value doattributes() passes.
    for (const [seconds, expected] of [
        [0, ' none'], /* 0-00:00:00 */
        [20, ' 20 seconds'], /* 0-00:00:20 */
        [15 * 60 + 5, ' 15 minutes and 5 seconds'], /* 0-00:15:05 */
        [16 * 60, ' 16 minutes'], /* 0-00:16:00 */
        [3600 + 15 * 60 + 10,
            ' 1 hour, 15 minutes and 10 seconds'], /* 0-01:15:10 */
        [2 * 3600 + 1, ' 2 hours and 1 second'], /* 0-02:00:01 */
        [3 * 86400 + 25 * 60 + 40,
            ' 3 days, 25 minutes and 40 seconds'], /* 3-00:25:40 */
    ]) {
        assert.equal(
            fmt_elapsed_time(0, elapsedState(seconds)),
            expected,
            `${seconds} seconds`,
        );
    }
});

test('fmt_elapsed_time counts time elapsed since start_timing', () => {
    // C adds timet_delta(getnow(), start_timing) whenever the game is still
    // in progress, so a start_timing 90 seconds in the past reads as 1
    // minute and 30 seconds even with realtime at zero.
    const state = elapsedState(0);
    state.urealtime.start_timing -= 90;
    assert.equal(fmt_elapsed_time(0, state), ' 1 minute and 30 seconds');
});
