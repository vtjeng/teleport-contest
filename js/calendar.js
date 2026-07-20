// calendar.js — deterministic calendar predicates.
// C ref: src/calendar.c. Recorder patch 001 supplies YYYYMMDDHHMMSS through
// NETHACK_FIXED_DATETIME; jsmain.js stores the same value on game.fixedDatetime.

import { game } from './gstate.js';

const FIXED_DATETIME_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

function utcDate(year, month, day, hour = 0, minute = 0, second = 0) {
    // Date.UTC treats years 0..99 as 1900..1999. setUTCFullYear does not.
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    return date;
}

function fieldsFromDate(date) {
    const startOfYear = Date.UTC(date.getFullYear(), 0, 1);
    const startOfDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        yday: Math.trunc((startOfDay - startOfYear) / 86_400_000),
        wday: date.getDay(),
    };
}

// Parse recorder patch 001's fixed local datetime without consulting the host
// timezone. Gregorian calendar properties depend on the supplied wall-clock
// fields, so constructing the check date in UTC gives the same tm_yday and
// tm_wday that C's localtime() sees in the recorder timezone.
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

export function getLocalTime(state = game, now = new Date()) {
    return parseFixedDatetime(state?.fixedDatetime) ?? fieldsFromDate(now);
}

export function getyear(state = game, now) {
    return getLocalTime(state, now).year;
}

export function yyyymmdd(state = game, now) {
    const local = getLocalTime(state, now);
    return ((local.year * 100 + local.month) * 100) + local.day;
}

export function hhmmss(state = game, now) {
    const local = getLocalTime(state, now);
    return ((local.hour * 100 + local.minute) * 100) + local.second;
}

export function yyyymmddhhmmss(state = game, now) {
    const local = getLocalTime(state, now);
    return [
        String(local.year).padStart(4, '0'),
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
