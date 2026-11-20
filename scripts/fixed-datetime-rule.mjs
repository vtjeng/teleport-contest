// The rule a fixed datetime written in a test or recipe must meet.
// scripts/check-fixed-datetime.mjs applies it to every test and recipe under
// scripts/, and scripts/diff-fresh.mjs validateCleanRecipe() to every recipe
// it replays, so the two cannot drift apart.
//
// Recorder patch 001 accepts any fourteen bytes and lets mktime() normalize
// an out-of-range field (js/calendar.js follows it), so 20240230010203 is
// 1 March. That makes a typo silently become a different fixed date. By
// default a datetime must therefore be fourteen digits naming a real date and
// time in year 1 or later. A recipe segment that means to exercise
// normalization opts out with `"datetimeOutOfRange": true` beside its
// datetime, and its comment says why; it is then held only to what
// calendar.c accepts. Either way the value must reach the fixed clock:
// getnow() uses the wall clock when time_from_yyyymmddhhmmss() gives 0, for
// a value that is not fourteen bytes or one mktime() maps to -1 or 0.

import { time_from_yyyymmddhhmmss } from '../js/calendar.js';

export const OUT_OF_RANGE_KEY = 'datetimeOutOfRange';

const CALENDAR_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u;

function namesRealTime(value) {
    const match = CALENDAR_PATTERN.exec(value);
    if (!match) return false;
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    if (year < 1 || hour > 23 || minute > 59 || second > 59) return false;
    // setUTCFullYear() carries an out-of-range month or day, so a value that
    // survives the round trip names a real date.
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

/**
 * Why `value` is refused as a fixed datetime, or null when it is accepted.
 * `outOfRange` is true only for a recipe segment that sets OUT_OF_RANGE_KEY.
 */
export function fixedDatetimeRefusal(value, { outOfRange = false } = {}) {
    if (typeof value !== 'string')
        return `is a ${typeof value} rather than a string`;
    if (time_from_yyyymmddhhmmss(value) === 0) {
        return 'is not fourteen bytes that mktime() maps to a nonzero time, '
            + 'so calendar.c getnow() falls back to the wall clock';
    }
    if (!outOfRange && !namesRealTime(value)) {
        return 'is not fourteen digits naming a real date and time; a '
            + `deliberate out-of-range value needs "${OUT_OF_RANGE_KEY}": true`;
    }
    return null;
}
