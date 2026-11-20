// Fixture for scripts/check-fixed-datetime.test.mjs: the rejected shapes.
// Nothing imports this file; the check reads it as text.

// The literal scripts/insight.test.mjs carried until this check existed.
const DATETIME = '2026-03-04 10:00:00';

export function segments() {
    return [
        // The same value as a direct literal.
        { seed: 1, datetime: '2026-03-04 10:00:00', moves: '' },
        // Fourteen digits, but under tm_isdst=1 mktime() maps it to time_t
        // -1, which calendar.c cannot tell from mktime()'s error result.
        { seed: 2, datetime: '19691231195959', moves: '' },
        // Reached through the constant above.
        { seed: 3, datetime: DATETIME, moves: '' },
    ];
}

// The assignment form, here with a date but no time.
export function applyTo(game) {
    game.fixedDatetime = '20260304';
}
