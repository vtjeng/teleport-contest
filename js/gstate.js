// gstate.js — Global game state reference.
// All game modules import `game` from here.

// C decl.c:417 initializes gi.item_action_in_progress to FALSE for a new game.
function initialGameState() {
    return {
        item_action_in_progress: false,
        // C decl.c:init_svn initializes the saved NHUUID buffer to zero.
        // Native get_nhuuid() is inactive in the reference recorder build.
        svn: { nhuuid: '' },
    };
}

export let game = initialGameState();

export function resetGame() {
    game = initialGameState();
    return game;
}

// js/youprop.js reports a property macro given the game state in place of the
// hero, or the reverse, through recordArgumentMisuse(). What happens to a
// report depends on the entry point. By default it is recorded and the caller
// carries on, so a path no test reached cannot stop a game the judge drives:
// runSegment(), and the browser play path that its playability runner
// (frozen/playability_runner.mjs) drives through NethackGame and
// moveloop_core() directly. runSegment() reports what was recorded to the
// local scorers, which fail that game. runSegmentStrict(), which every local
// replay tool uses, and the unit suite (scripts/strict-argument-misuses.mjs,
// preloaded by scripts/run-test-suite.mjs) select throwing instead, so a
// report fails there at the line that made it.
let recordingArgumentMisuses = true;
// One entry per distinct message, in first-use order: { kind, detail, count }.
// `kind` is 'youpropArgument' for js/youprop.js.
const misuseLog = new Map();

// Select recording (true) or throwing (false); returns the previous mode.
// Recording is the default; see the comment above.
export function setArgumentMisuseRecording(record) {
    const previous = recordingArgumentMisuses;
    recordingArgumentMisuses = Boolean(record);
    return previous;
}

// The uses recorded since the last reset, as { kind, detail, count }.
export function recordedArgumentMisuses() {
    return [...misuseLog.values()].map((use) => ({ ...use }));
}

export function resetArgumentMisuses() {
    misuseLog.clear();
}

// When throwing is selected, throw makeError(detail); otherwise record one
// use of `kind`, so that runSegment() reports it, and return so that the
// caller can carry on.
export function recordArgumentMisuse(kind, detail, makeError) {
    if (!recordingArgumentMisuses) throw makeError(detail);
    const use = misuseLog.get(detail);
    if (use) use.count++;
    else misuseLog.set(detail, { kind, detail, count: 1 });
}
