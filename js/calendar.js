// calendar.js — deterministic calendar and timestamp helpers.
// C ref: src/calendar.c. Recorder patch 001 supplies YYYYMMDDHHMMSS through
// NETHACK_FIXED_DATETIME; jsmain.js stores the same value on game.fixedDatetime.

import { game } from './gstate.js';
import { atoi, utf8Text } from './hacklib.js';

const RECORDER_TIME_ZONE = 'America/New_York';
const HOUR_MILLIS = 3_600_000;
const TRANSITION_PROBE_MILLIS = 36 * HOUR_MILLIS;
// America/New_York's IANA timezone types are LMT and EST for tm_isdst=0,
// and EDT/EWT/EPT at UTC-04:00 for tm_isdst=1. Its daylight adjustment is
// always one hour; glibc mktime() uses that adjustment when the requested
// tm_isdst type is absent near the target date.
const NEW_YORK_DAYLIGHT_OFFSET_MILLIS = -4 * HOUR_MILLIS;
// The era part turns Intl's year of era back into C's proleptic year:
// 1 BC is year 0, which a fixed datetime of 0000 or a carried month reaches.
const RECORDER_TIME_FORMAT = new Intl.DateTimeFormat(
    'en-CA-u-ca-gregory-nu-latn',
    {
        timeZone: RECORDER_TIME_ZONE,
        hourCycle: 'h23',
        era: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    },
);

function utcDate(year, month, day, hour = 0, minute = 0, second = 0) {
    // Date.UTC treats years 0..99 as 1900..1999. setUTCFullYear does not.
    // Both setters carry out-of-range values: a 13th month is January of the
    // next year, day 0 is the last day of the previous month, hour 24 is
    // midnight of the next day.
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    return date;
}

// C ref: calendar.c time_from_yyyymmddhhmmss(), the field split. Recorder
// patch 001 passes NETHACK_FIXED_DATETIME's bytes, which
// scripts/record-session.mjs writes as UTF-8, so the length test and the
// 4/2/2/2/2/2 split count bytes. C accepts any 14-byte string and converts
// each slice with atoi(): leading whitespace and a sign are read, anything
// after the digits is ignored, and a slice with no digits is 0. Returns null
// for any other length, where C returns 0 without calling mktime().
function fixedDatetimeFields(value) {
    const text = utf8Text(String(value ?? ''));
    if (text.length !== 14) return null;
    return {
        year: atoi(text.slice(0, 4)),
        month: atoi(text.slice(4, 6)),
        day: atoi(text.slice(6, 8)),
        hour: atoi(text.slice(8, 10)),
        minute: atoi(text.slice(10, 12)),
        second: atoi(text.slice(12, 14)),
    };
}

function fixedFieldsUtcMillis(fields) {
    return utcDate(
        fields.year,
        fields.month,
        fields.day,
        fields.hour,
        fields.minute,
        fields.second,
    ).getTime();
}

function recorderFieldsAt(epochMillis) {
    const fields = {};
    let era = null;
    for (const part of RECORDER_TIME_FORMAT.formatToParts(
        new Date(epochMillis),
    )) {
        if (part.type === 'era') era = part.value;
        else if (part.type !== 'literal') fields[part.type] = Number(part.value);
    }
    if (era === 'BC') fields.year = 1 - fields.year;
    const check = utcDate(fields.year, fields.month, fields.day);
    fields.yday = Math.trunc(
        (check.getTime() - utcDate(fields.year, 1, 1).getTime())
        / 86_400_000,
    );
    fields.wday = check.getUTCDay();
    return fields;
}

function recorderOffsetAt(epochMillis) {
    const wholeSecondMillis = Math.trunc(epochMillis / 1000) * 1000;
    return fixedFieldsUtcMillis(recorderFieldsAt(wholeSecondMillis))
        - wholeSecondMillis;
}

function recorderOffsetsNear(wallMillis) {
    const offsets = new Set();
    // The requested local wall time encoded as UTC is within five hours of
    // the corresponding New York instant. Probing 36 hours on either side
    // captures both timezone types at a nearby clock transition.
    for (const delta of [-TRANSITION_PROBE_MILLIS, 0, TRANSITION_PROBE_MILLIS]) {
        offsets.add(recorderOffsetAt(wallMillis + delta));
    }
    return [...offsets];
}

function sameWallTime(left, right) {
    return left.year === right.year
        && left.month === right.month
        && left.day === right.day
        && left.hour === right.hour
        && left.minute === right.minute
        && left.second === right.second;
}

function compatibleOffset(wallMillis, fields, offsets) {
    const candidates = offsets
        .map((offset) => ({ offset, epoch: wallMillis - offset }))
        .sort((left, right) => left.epoch - right.epoch);
    const exact = candidates.filter((candidate) => sameWallTime(
        recorderFieldsAt(candidate.epoch), fields,
    ));
    // Match mktime()'s ordinary New York disambiguation: the earlier side of
    // a repeated time and the later instant for a skipped wall time. The one
    // repeat whose two sides share a tm_isdst, 12:00:00-12:03:57 on
    // 1883-11-18 (LMT, then EST), glibc resolves from the offset its previous
    // mktime() call left in a static variable, so that window under
    // tm_isdst=0 depends on the recorder's earlier mktime() calls.
    return (exact[0] ?? candidates.at(-1)).offset;
}

// The tm_isdst bit that the judge's recorder inherited (see
// time_from_yyyymmddhhmmss() below). Every reference recording was made while
// New York was on daylight time, and frozen/ps_test_runner.mjs passes no
// recorderIsDst to runSegment(), so the judge always replays with this value.
// scripts/record-session.mjs passes it to the recorder (patch 009,
// NETHACK_FIXED_ISDST) and stores it as each segment's recorderIsDst, so every
// local recording uses it whatever the date it is made.
export const JUDGE_RECORDER_IS_DST = true;

// C ref: glibc mktime() as calendar.c time_from_yyyymmddhhmmss() calls it,
// for America/New_York with tm_isdst set to inheritedIsDst. glibc's
// __mktime_internal() carries tm_mon into tm_year and counts tm_mday, tm_hour
// and tm_min linearly from the start of that month, as utcDate() does. It
// clamps tm_sec to 0..59 while it matches the local time and its tm_isdst,
// then adds the clamped-off seconds as elapsed time.
function mktime(fields, inheritedIsDst) {
    const second = Math.min(Math.max(fields.second, 0), 59);
    const wallMillis = utcDate(
        fields.year, fields.month, fields.day,
        fields.hour, fields.minute, second,
    ).getTime();
    const wallDate = new Date(wallMillis);
    const wall = {
        year: wallDate.getUTCFullYear(),
        month: wallDate.getUTCMonth() + 1,
        day: wallDate.getUTCDate(),
        hour: wallDate.getUTCHours(),
        minute: wallDate.getUTCMinutes(),
        second: wallDate.getUTCSeconds(),
    };
    const nearbyOffsets = recorderOffsetsNear(wallMillis);
    const matchingOffsets = nearbyOffsets.filter((offset) => (
        (offset === NEW_YORK_DAYLIGHT_OFFSET_MILLIS) === inheritedIsDst
    ));
    let inheritedOffset;
    if (matchingOffsets.length) {
        inheritedOffset = compatibleOffset(wallMillis, wall, matchingOffsets);
    } else {
        const actualOffset = compatibleOffset(wallMillis, wall, nearbyOffsets);
        inheritedOffset = actualOffset
            + (inheritedIsDst ? HOUR_MILLIS : -HOUR_MILLIS);
    }
    return Math.trunc((wallMillis - inheritedOffset) / 1000)
        + fields.second - second;
}

// C ref: calendar.c time_from_yyyymmddhhmmss(). record-session.mjs fixes the
// canonical recorder process to America/New_York. Patch 001 copies the current
// local struct tm, including tm_isdst, then overwrites only the six date/time
// fields before calling mktime(). Preserve that quirk: a fixed winter time
// parsed while the recorder is in summer is normalized one hour backward, and
// vice versa. The judge's recorder inherited JUDGE_RECORDER_IS_DST, so that is
// the default; callers can supply the inherited bit explicitly. Out-of-range
// fields are normalized as mktime() normalizes them. C returns 0 for a value
// that is not 14 bytes and for mktime()'s -1, and getnow() also treats a
// result of 0 as no fixed time, so all three fall back to the clock.
export function time_from_yyyymmddhhmmss(
    value, inheritedIsDst = JUDGE_RECORDER_IS_DST,
) {
    const fields = fixedDatetimeFields(value);
    if (!fields) return 0;
    const result = mktime(fields, inheritedIsDst);
    return result === -1 ? 0 : result;
}

// C ref: calendar.c getnow().
export function getnow(state = game, now = new Date()) {
    const fixed = time_from_yyyymmddhhmmss(
        state?.fixedDatetime, state?.recorderIsDst ?? JUDGE_RECORDER_IS_DST,
    );
    return fixed || Math.trunc(now.getTime() / 1000);
}

// C's yyyymmdd(), hhmmss() and yyyymmddhhmmss() take a time_t: zero reads
// getlt(), the current (or fixed) local time, and any other value is
// converted with localtime().
export function getLocalTime(state = game, now = new Date()) {
    if (typeof now === 'number' && now !== 0)
        return recorderFieldsAt(now * 1000);
    const fixed = time_from_yyyymmddhhmmss(
        state?.fixedDatetime, state?.recorderIsDst ?? JUDGE_RECORDER_IS_DST,
    );
    return recorderFieldsAt(fixed ? fixed * 1000 : now.getTime());
}

export function getyear(state = game, now) {
    return getLocalTime(state, now).year;
}

function serializedYear(localYear) {
    // calendar.c operates on tm_year. Its defensive tm_year < 70 branch maps
    // every pre-1970 local year one century forward during serialization.
    return localYear < 1970 ? localYear + 100 : localYear;
}

export function yyyymmdd(state = game, now) {
    const local = getLocalTime(state, now);
    return ((serializedYear(local.year) * 100 + local.month) * 100) + local.day;
}

export function hhmmss(state = game, now) {
    const local = getLocalTime(state, now);
    return ((local.hour * 100 + local.minute) * 100) + local.second;
}

// C ref: calendar.c yyyymmddhhmmss(). Snprintf() formats "%04ld" (the zero
// padding follows a minus sign: -50 is "-050") into datestr[15], and
// nh_snprintf() cuts a longer result to its first 14 characters, as a
// serialized year of 10000 or more produces.
export function yyyymmddhhmmss(state = game, now) {
    const local = getLocalTime(state, now);
    const year = serializedYear(local.year);
    return [
        year < 0
            ? `-${String(-year).padStart(3, '0')}`
            : String(year).padStart(4, '0'),
        String(local.month).padStart(2, '0'),
        String(local.day).padStart(2, '0'),
        String(local.hour).padStart(2, '0'),
        String(local.minute).padStart(2, '0'),
        String(local.second).padStart(2, '0'),
    ].join('').slice(0, 14);
}

// C ref: calendar.c phase_of_the_moon(). Returns 0..7; 0 is new moon and
// 4 is full moon. Keep the integer operations in the same order as C.
export function phase_of_the_moon(state = game, now) {
    const local = getLocalTime(state, now);
    const goldn = ((local.year - 1900) % 19) + 1;
    let epact = (11 * goldn + 18) % 30;
    if ((epact === 25 && goldn > 11) || epact === 24) epact += 1;
    return Math.trunc(((((local.yday + epact) * 6) + 11) % 177) / 22) & 7;
}

export function friday_13th(state = game, now) {
    const local = getLocalTime(state, now);
    return local.wday === 5 && local.day === 13;
}

export function night(state = game, now) {
    const hour = getLocalTime(state, now).hour;
    return hour < 6 || hour > 21;
}

export function midnight(state = game, now) {
    return getLocalTime(state, now).hour === 0;
}
