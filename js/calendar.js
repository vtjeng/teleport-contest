// calendar.js — deterministic calendar and timestamp helpers.
// C ref: src/calendar.c. Recorder patch 001 supplies YYYYMMDDHHMMSS through
// NETHACK_FIXED_DATETIME; jsmain.js stores the same value on game.fixedDatetime.

import { game } from './gstate.js';

const FIXED_DATETIME_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const RECORDER_TIME_ZONE = 'America/New_York';
const HOUR_MILLIS = 3_600_000;
const TRANSITION_PROBE_MILLIS = 36 * HOUR_MILLIS;
// America/New_York's IANA timezone types are LMT and EST for tm_isdst=0,
// and EDT/EWT/EPT at UTC-04:00 for tm_isdst=1. Its daylight adjustment is
// always one hour; glibc mktime() uses that adjustment when the requested
// tm_isdst type is absent near the target date.
const NEW_YORK_DAYLIGHT_OFFSET_MILLIS = -4 * HOUR_MILLIS;
const RECORDER_TIME_FORMAT = new Intl.DateTimeFormat(
    'en-CA-u-ca-gregory-nu-latn',
    {
        timeZone: RECORDER_TIME_ZONE,
        hourCycle: 'h23',
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
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    return date;
}

// Parse recorder patch 001's fixed local datetime without consulting the host
// timezone. This validates the wall-clock input; getLocalTime() below applies
// the recorder patch's mktime() normalization before exposing calendar fields.
export function parseFixedDatetime(value) {
    const match = FIXED_DATETIME_PATTERN.exec(value ?? '');
    if (!match) return null;

    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const check = utcDate(year, month, day, hour, minute, second);

    // The contest supplies valid datetimes. Reject normalization here so an
    // invalid recipe cannot silently become a different deterministic date.
    if (check.getUTCFullYear() !== year
        || check.getUTCMonth() !== month - 1
        || check.getUTCDate() !== day
        || check.getUTCHours() !== hour
        || check.getUTCMinutes() !== minute
        || check.getUTCSeconds() !== second) {
        return null;
    }

    const startOfYear = utcDate(year, 1, 1).getTime();
    const startOfDay = utcDate(year, month, day).getTime();
    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        yday: Math.trunc((startOfDay - startOfYear) / 86_400_000),
        wday: check.getUTCDay(),
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
    for (const part of RECORDER_TIME_FORMAT.formatToParts(
        new Date(epochMillis),
    )) {
        if (part.type !== 'literal') fields[part.type] = Number(part.value);
    }
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
    // a repeated time and the later instant for a skipped wall time.
    return (exact[0] ?? candidates.at(-1)).offset;
}

// C ref: calendar.c time_from_yyyymmddhhmmss(). record-session.mjs fixes the
// canonical recorder process to America/New_York. Patch 001 copies the current
// local struct tm, including tm_isdst, then overwrites only the six date/time
// fields before calling mktime(). Preserve that quirk: a fixed winter time
// parsed while the recorder is in summer is normalized one hour backward, and
// vice versa. Existing canonical recordings were made while tm_isdst was 1,
// so that is the default; callers can supply the inherited bit explicitly.
export function time_from_yyyymmddhhmmss(value, inheritedIsDst = true) {
    const fields = parseFixedDatetime(value);
    if (!fields) return 0;

    const wallMillis = fixedFieldsUtcMillis(fields);
    const nearbyOffsets = recorderOffsetsNear(wallMillis);
    const matchingOffsets = nearbyOffsets.filter((offset) => (
        (offset === NEW_YORK_DAYLIGHT_OFFSET_MILLIS) === inheritedIsDst
    ));
    let inheritedOffset;
    if (matchingOffsets.length) {
        inheritedOffset = compatibleOffset(wallMillis, fields, matchingOffsets);
    } else {
        const actualOffset = compatibleOffset(wallMillis, fields, nearbyOffsets);
        inheritedOffset = actualOffset
            + (inheritedIsDst ? HOUR_MILLIS : -HOUR_MILLIS);
    }
    const result = Math.trunc((wallMillis - inheritedOffset) / 1000);
    return result === -1 ? 0 : result;
}

// C ref: calendar.c getnow().
export function getnow(state = game, now = new Date()) {
    const fixed = time_from_yyyymmddhhmmss(
        state?.fixedDatetime, state?.recorderIsDst ?? true,
    );
    return fixed || Math.trunc(now.getTime() / 1000);
}

export function getLocalTime(state = game, now = new Date()) {
    const fixed = time_from_yyyymmddhhmmss(
        state?.fixedDatetime, state?.recorderIsDst ?? true,
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

export function yyyymmddhhmmss(state = game, now) {
    const local = getLocalTime(state, now);
    return [
        String(serializedYear(local.year)).padStart(4, '0'),
        String(local.month).padStart(2, '0'),
        String(local.day).padStart(2, '0'),
        String(local.hour).padStart(2, '0'),
        String(local.minute).padStart(2, '0'),
        String(local.second).padStart(2, '0'),
    ].join('');
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
