// Test support for reading back complete terminal frames.
//
// jsmain.js records each screen through GameDisplay.serialize(), which writes
// the wire format the judge decodes. Tests that inspect every cell's
// character, color, and attribute install a JSON serializer for the duration
// of one action and restore the real one afterwards.

import { GameDisplay } from '../js/game_display.js';

// Run `action` with GameDisplay.prototype.serialize returning the complete
// character grid, including each cell's color and attribute, so that
// getScreens() yields frames a test can parse cell by cell.
export async function withSerializedGrids(action) {
    const previous = GameDisplay.prototype.serialize;
    GameDisplay.prototype.serialize = function serializeGridForTest() {
        return JSON.stringify(this.grid);
    };
    try {
        return await action();
    } finally {
        GameDisplay.prototype.serialize = previous;
    }
}
