import assert from 'node:assert/strict';
import test from 'node:test';

import {
    friday_13th,
    getLocalTime,
    getnow,
    getyear,
    hhmmss,
    midnight,
    night,
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

// Each row is [NETHACK_FIXED_DATETIME, NETHACK_FIXED_ISDST, the time_t
// getnow() returns, and calendar.c's yyyymmddhhmmss((time_t) 0) of it].
// The values come from a glibc 2.39 driver that runs patch 001's
// time_from_yyyymmddhhmmss() and patch 009's fixed_isdst() verbatim under
// TZ=America/New_York; a time_t of 0 means getnow() falls back to the clock.
const MKTIME_CASES = [
    // Month 13 carries into January 2058, the shape of the challenge v19
    // datetimes. Under tm_isdst=1 the winter time is an hour earlier.
    ['20571311091011', true, 2777980211, '20580111081011'],
    ['20571311091011', false, 2777983811, '20580111091011'],
    // Month 16 and hour 25 together, the challenge v47 datetime: April 2112,
    // then one hour into the next day.
    ['21111610253000', true, 4489795800, '21120411013000'],
    // February 30 is 1 March in a leap year.
    ['20240230010203', false, 1709272923, '20240301010203'],
    // Day 0 is the last day of the previous month, across the year end.
    ['20260100120000', false, 1767200400, '20251231120000'],
    // Hour 24 is midnight of the next day, here into the next year.
    ['20261231240000', false, 1798779600, '20270101000000'],
    // Minute 60 carries into the hour.
    ['20260615126000', true, 1781542800, '20260615130000'],
    // Seconds 60 and 99 carry into the minute: glibc clamps tm_sec to 59
    // while matching the local time and adds the rest afterwards.
    ['20260615120060', true, 1781539260, '20260615120100'],
    ['20260615120099', true, 1781539299, '20260615120139'],
    // Hour 26 of 7 March is 02:30 on the spring-forward day, the same
    // nonexistent wall time as 20260308023000, so both give 01:30 EST.
    ['20260307263000', true, 1772951400, '20260308013000'],
    // Hour 25 of 31 October is the repeated 01:30 of 1 November; the
    // inherited tm_isdst=0 picks the standard-time side.
    ['20261031253000', false, 1793514600, '20261101013000'],
    // atoi() reads each slice up to its first non-digit: "-0" is month 0
    // (December 2025), "3-" is day 3, " 1" is minute 1, "0:" is second 0.
    ['2026-03-04 10:', false, 1764752460, '20251203040100'],
    // C counts bytes: U+00E9 is two UTF-8 bytes, so twelve digits and it
    // make fourteen, and atoi() of its bytes is second 0.
    ['202606151200\u00e9', false, 1781542800, '20260615130000'],
    // Thirteen digits and U+00E9 are fifteen bytes, which C does not parse.
    ['2026061512000\u00e9', false, 0, null],
    // Year 0 (1 BC) serializes through the tm_year < 70 branch as 0100.
    ['00000601120000', false, -62154025438, '01000601120000'],
    // Year 9999 month 99 is year 10007; datestr[15] keeps 14 characters.
    ['99999999999999', true, 253637167239, '10007061104403'],
    // A year of -150 serializes as -50, and "%04ld" pads after the sign.
    ['-1500101120000', false, -66900668638, '-0500101120000'],
    // Under tm_isdst=1 these are time_t -1, mktime()'s error value, and
    // time_t 0, which getnow() treats as unset; both use the clock. Under
    // tm_isdst=0 the same strings are 3599 and 3600.
    ['19691231195959', true, 0, null],
    ['19691231200000', true, 0, null],
    ['19691231195959', false, 3599, '20691231195959'],
];

test('fixed datetimes follow patch 001 and glibc mktime() for any 14 bytes', () => {
    // An arbitrary real-clock time, far from every case, that getnow()
    // returns when the fixed datetime gives 0.
    const clock = new Date('2030-01-02T03:04:05.000Z');
    for (const [value, isDst, time, local] of MKTIME_CASES) {
        const label = `${value} tm_isdst=${Number(isDst)}`;
        assert.equal(time_from_yyyymmddhhmmss(value, isDst), time, label);
        const state = fixed(value, isDst);
        assert.equal(getnow(state, clock), time || clock.getTime() / 1000, label);
        if (local) assert.equal(yyyymmddhhmmss(state), local, label);
    }
    // Any width other than fourteen bytes is not parsed.
    assert.equal(time_from_yyyymmddhhmmss('202402290102', false), 0);
    assert.equal(time_from_yyyymmddhhmmss('', false), 0);
    assert.equal(time_from_yyyymmddhhmmss(null, false), 0);
});

test('local time fields keep proleptic years at and before year 0', () => {
    // Intl reports 1 BC as year 1 of its era; C's localtime() reports
    // tm_year -1900. glibc: 0000-06-01 11:00:00 under tm_isdst=1, a Thursday.
    assert.deepEqual(getLocalTime(fixed('00000601120000', true)), {
        year: 0,
        month: 6,
        day: 1,
        hour: 11,
        minute: 0,
        second: 0,
        yday: 152,
        wday: 4,
    });
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

test('date serializers preserve the pre-1970 tm_year quirk', () => {
    const old = fixed('19650720123456', false);
    assert.equal(getyear(old), 1965);
    assert.equal(yyyymmdd(old), 20650720);
    assert.equal(yyyymmddhhmmss(old), '20650720133456');

    // Inheriting a daylight bit for a winter time normalizes this instant
    // across the year boundary before calendar.c applies its tm_year test.
    const crossed = fixed('19700101003000', true);
    assert.equal(getyear(crossed), 1969);
    assert.equal(yyyymmdd(crossed), 20691231);
    assert.equal(yyyymmddhhmmss(crossed), '20691231233000');
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

test('date serializers convert a nonzero time_t with localtime()', () => {
    // calendar.c yyyymmddhhmmss(date) reads getlt() only for date 0. A
    // January instant at 16:34:56 UTC is 11:34:56 EST in the recorder's
    // zone, whatever fixed datetime the state carries; save.c writes
    // ubirthday this way.
    const state = fixed('20260720123456');
    const winterInstant = Date.UTC(2026, 0, 20, 16, 34, 56) / 1000;
    assert.equal(yyyymmddhhmmss(state, winterInstant), '20260120113456');
    assert.equal(yyyymmdd(state, winterInstant), 20260120);
    assert.equal(hhmmss(state, winterInstant), 113456);
    // restore.c converts that string back under tm_isdst=1, which lands
    // an hour earlier (10:34:56 EST, 15:34:56 UTC).
    assert.equal(
        time_from_yyyymmddhhmmss('20260120113456', true),
        Date.UTC(2026, 0, 20, 15, 34, 56) / 1000,
    );
    // Zero keeps the getlt() arm: the fixed summer datetime itself.
    assert.equal(yyyymmddhhmmss(state, 0), '20260720123456');
});
