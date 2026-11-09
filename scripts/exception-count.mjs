// Pins a source check's count of tolerated exceptions in both directions.
//
// AGENTS.md, "Fix a repeated defect at its source": a check that allows
// exceptions records their count in its test and fails when the count
// changes either way. A rise means a new exception arrived without anyone
// deciding to accept it; a fall means exceptions were removed and the pin
// must come down with them, so a later change cannot quietly use the room.
// The message names the number to write, and where.

import assert from 'node:assert/strict';

// Fails unless `count` equals `pinned`. `what` names the counted thing in the
// plural ("allow-list entries"); `pin` names the constant that holds
// `pinned` and the file it is in ("ALLOWED_PINS.entries in
// scripts/x.test.mjs").
export function assertExceptionCount(count, pinned, { what, pin }) {
    assert.ok(count <= pinned,
        `${count} ${what}, above the pinned ${pinned}: remove the new ones, or give `
        + `each a reason and raise ${pin} from ${pinned} to ${count}`);
    assert.ok(count >= pinned,
        `${count} ${what}, below the pinned ${pinned}: lower ${pin} from ${pinned} to ${count}`);
}
