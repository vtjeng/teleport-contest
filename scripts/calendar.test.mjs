import assert from 'node:assert/strict';
import test from 'node:test';

import {
    friday_13th,
    getLocalTime,
    hhmmss,
    midnight,
    night,
    parseFixedDatetime,
    phase_of_the_moon,
    yyyymmdd,
    yyyymmddhhmmss,
} from '../js/calendar.js';

function fixed(value) {
    return { fixedDatetime: value };
}

test('fixed datetimes retain recorder wall-clock fields', () => {
    // Leap day exercises Gregorian day-of-year calculation; the late time
    // catches accidental truncation of the HHMMSS suffix.
    const state = fixed('20240229235958');
    assert.deepEqual(getLocalTime(state), {
        year: 2024,
        month: 2,
        day: 29,
        hour: 23,
        minute: 59,
        second: 58,
        yday: 59,
        wday: 4,
    });
    assert.equal(yyyymmdd(state), 20240229);
    assert.equal(hhmmss(state), 235958);
    assert.equal(yyyymmddhhmmss(state), '20240229235958');
});

test('invalid fixed datetimes are rejected instead of normalized', () => {
    // February 30 and a missing seconds field exercise calendar validation
    // separately from the fixed-width format check.
    assert.equal(parseFixedDatetime('20240230010203'), null);
    assert.equal(parseFixedDatetime('202402290102'), null);
    assert.equal(parseFixedDatetime('00990228010203')?.year, 99);
});

test('moon phase preserves the NetHack integer epact formula', () => {
    // These dates exercise both named phases used by moveloop_preamble.
    // Expected values come from src/calendar.c phase_of_the_moon(), where
    // phase 0 is new and phase 4 is full.
    assert.equal(phase_of_the_moon(fixed('20260118000000')), 0);
    assert.equal(phase_of_the_moon(fixed('20260202000000')), 4);
});

test('Friday the 13th and time-of-day boundaries use fixed local time', () => {
    // 2026-02-13 is a Friday. Hours 6 and 21 are daytime in calendar.c;
    // hours 5 and 22 exercise the two night boundaries.
    assert.equal(friday_13th(fixed('20260213120000')), true);
    assert.equal(friday_13th(fixed('20260214120000')), false);
    assert.equal(night(fixed('20260213050000')), true);
    assert.equal(night(fixed('20260213060000')), false);
    assert.equal(night(fixed('20260213210000')), false);
    assert.equal(night(fixed('20260213220000')), true);
    assert.equal(midnight(fixed('20260213000000')), true);
    assert.equal(midnight(fixed('20260213010000')), false);
});
