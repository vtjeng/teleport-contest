// Fixture for scripts/check-fixed-datetime.test.mjs: the accepted shapes.
// Nothing imports this file; the check reads it as text.

// A file-local constant, the form most tests under scripts/ use.
const DATETIME = '20260304100000';

// A datetime written inside a comment does not register: datetime: '10:00'
const NOTE = "and neither does one inside a string: datetime: '10:00'";

export function segments() {
    return [
        // The runSegment input key, named directly and through the constant.
        { seed: 1, datetime: '20401231235958', moves: '' },
        { seed: 2, datetime: DATETIME, moves: '' },
        // A hand-built state object, and an assignment to the same field.
        { fixedDatetime: '20240729235958', note: NOTE },
    ];
}

export function applyTo(game) {
    game.fixedDatetime = DATETIME;
}
