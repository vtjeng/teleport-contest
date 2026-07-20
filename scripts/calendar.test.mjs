import assert from 'node:assert/strict';
import test from 'node:test';

import {
    friday_13th,
    getLocalTime,
    getnow,
    hhmmss,
    midnight,
    night,
    parseFixedDatetime,
    phase_of_the_moon,
    time_from_yyyymmddhhmmss,
    yyyymmdd,
    yyyymmddhhmmss,
} from '../js/calendar.js';

function fixed(value, recorderIsDst) {
    const state = { fixedDatetime: value };
    if (recorderIsDst !== undefined) state.recorderIsDst = recorderIsDst;
    return state;
}

const SUMMER_RECORDING_TIME = new Date('2026-07-20T19:34:56.000Z');

test('fixed datetimes retain recorder wall-clock fields when DST agrees', () => {
    // A summer date in a leap year exercises Gregorian day-of-year
    // calculation; the late time catches truncation of the HHMMSS suffix.
    const state = fixed('20240729235958');
    assert.deepEqual(getLocalTime(state), {
        year: 2024,
        month: 7,
        day: 29,
        hour: 23,
        minute: 59,
        second: 58,
        yday: 210,
        wday: 1,
    });
    assert.equal(yyyymmdd(state), 20240729);
    assert.equal(hhmmss(state), 235958);
    assert.equal(
        yyyymmddhhmmss(state),
        '20240729235958',
    );
});

test('invalid fixed datetimes are rejected instead of normalized', () => {
    // February 30 and a missing seconds field exercise calendar validation
    // separately from the fixed-width format check.
    assert.equal(parseFixedDatetime('20240230010203'), null);
    assert.equal(parseFixedDatetime('202402290102'), null);
    assert.equal(parseFixedDatetime('00990228010203')?.year, 99);
});

test('fixed timestamps inherit the recorder patch current DST bit', () => {
    // During a summer recording, patched C leaves tm_isdst=1. July is
    // unchanged, while January is interpreted with the daylight offset and
    // normalizes to 11:34:56 EST.
    assert.equal(
        time_from_yyyymmddhhmmss(
            '20260720123456', true,
        ),
        Date.UTC(2026, 6, 20, 16, 34, 56) / 1000,
    );
    assert.equal(
        time_from_yyyymmddhhmmss(
            '20260120123456', true,
        ),
        Date.UTC(2026, 0, 20, 16, 34, 56) / 1000,
    );
    assert.equal(
        yyyymmddhhmmss(
            fixed('20260120123456'),
        ),
        '20260120113456',
    );

    // The inherited bit also selects the daylight side of a repeated hour
    // and normalizes a nonexistent spring hour backward.
    assert.equal(
        time_from_yyyymmddhhmmss(
            '20261101013000', true,
        ),
        Date.UTC(2026, 10, 1, 5, 30, 0) / 1000,
    );
    assert.equal(
        time_from_yyyymmddhhmmss(
            '20260308023000', true,
        ),
        Date.UTC(2026, 2, 8, 6, 30, 0) / 1000,
    );

    // A winter recording inherits tm_isdst=0, shifting a July target forward
    // and selecting the standard side of the repeated hour.
    assert.equal(
        time_from_yyyymmddhhmmss(
            '20260720123456', false,
        ),
        Date.UTC(2026, 6, 20, 17, 34, 56) / 1000,
    );
    assert.equal(
        time_from_yyyymmddhhmmss(
            '20261101013000', false,
        ),
        Date.UTC(2026, 10, 1, 6, 30, 0) / 1000,
    );

    // An invalid override follows getnow()'s ordinary clock fallback.
    const fallback = SUMMER_RECORDING_TIME;
    assert.equal(getnow(fixed('invalid'), fallback), fallback.getTime() / 1000);

    // calendar.c also collapses mktime()'s -1 error sentinel to parse failure.
    assert.equal(
        time_from_yyyymmddhhmmss(
            '19691231185959', false,
        ),
        0,
    );

    // Before New York first observed daylight time, glibc still applies its
    // one-hour tm_isdst fallback. Before standardization in 1883, tm_isdst=0
    // retains New York's local-mean-time offset of UTC-04:56:02.
    assert.equal(
        time_from_yyyymmddhhmmss('19000120123456', true),
        -2207287504,
    );
    assert.equal(
        time_from_yyyymmddhhmmss('18830120123456', false),
        -2743741742,
    );
});

test('moon phase preserves the NetHack integer epact formula', () => {
    // These dates exercise both named phases used by moveloop_preamble.
    // Expected values come from src/calendar.c phase_of_the_moon(), where
    // phase 0 is new and phase 4 is full.
    assert.equal(
        phase_of_the_moon(fixed('20260118000000', false)),
        0,
    );
    assert.equal(
        phase_of_the_moon(fixed('20260202000000', false)),
        4,
    );
});

test('Friday the 13th and time-of-day boundaries use fixed local time', () => {
    // 2026-02-13 is a Friday. Hours 6 and 21 are daytime in calendar.c;
    // hours 5 and 22 exercise the two night boundaries.
    assert.equal(
        friday_13th(fixed('20260213120000', false)),
        true,
    );
    assert.equal(
        friday_13th(fixed('20260214120000', false)),
        false,
    );
    assert.equal(night(fixed('20260213050000', false)), true);
    assert.equal(night(fixed('20260213060000', false)), false);
    assert.equal(night(fixed('20260213210000', false)), false);
    assert.equal(night(fixed('20260213220000', false)), true);
    assert.equal(midnight(
        fixed('20260213000000', false),
    ), true);
    assert.equal(midnight(
        fixed('20260213010000', false),
    ), false);
});
