// Test support for reading back complete terminal frames.
//
// js/terminal.js is judge-owned and ships without a serialize() method, so
// jsmain.js records an empty string for every screen during local tests. The
// judge replaces that file with its official version, which does serialize.
// Tests that need the rendered frame install a serializer for the duration of
// one action and restore whatever was there before.

import { Terminal } from '../js/terminal.js';

// Run `action` with Terminal.prototype.serialize returning the complete
// character grid, including each cell's color and attribute, so that
// getScreens() yields comparable frames instead of empty strings.
export async function withSerializedGrids(action) {
    const previous = Terminal.prototype.serialize;
    Terminal.prototype.serialize = function serializeGridForTest() {
        return JSON.stringify(this.grid);
    };
    try {
        return await action();
    } finally {
        if (previous) Terminal.prototype.serialize = previous;
        else delete Terminal.prototype.serialize;
    }
}
