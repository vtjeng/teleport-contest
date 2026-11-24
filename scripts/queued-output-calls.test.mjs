// An `async` function that makes a synchronous draw prints the notice queue
// right after it (scripts/queued-output-calls.mjs says how calls are found
// and what counts as printed; js/rng.js, "Queued output", says why). This
// check fails on a new unprinted draw, on a listed one that is gone, and on
// a change in the number of synchronous functions that call a draw.

import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';
import { readJsSources, scanQueuedOutputCalls, unflushedCalls } from './queued-output-calls.mjs';

// The display.js reason: js/display.js is being split from the map-location
// records by the screen-buffer work, so its own async draws (docrt(),
// tmp_at(), swallowed(), under_water(), shieldeff(), flash_glyph_at()) wait
// for that change to land. Each draws a whole screen or an animation frame
// and is followed, in every caller, by a message or delay that drains the
// queue; the run-time check (js/rng.js) records any draw that comes first.
const DISPLAY_REASON = 'js/display.js async draw; converted after the screen-buffer change lands';

// "<file> | <function> | <callee>": [count, reason].
const ALLOWED = {
    'js/display.js | docrt | see_monsters': [1, DISPLAY_REASON],
    'js/display.js | docrt | show_glyph_cell': [2, DISPLAY_REASON],
    'js/display.js | flash_glyph_at | show_glyph_cell': [1, DISPLAY_REASON],
    'js/display.js | shieldeff | newsym': [1, DISPLAY_REASON],
    'js/display.js | shieldeff | show_glyph_cell': [1, DISPLAY_REASON],
    'js/display.js | swallowed | display_self': [1, DISPLAY_REASON],
    'js/display.js | swallowed | show_glyph_cell': [9, DISPLAY_REASON],
    'js/display.js | tmp_at | newsym': [5, DISPLAY_REASON],
    'js/display.js | tmp_at | show_glyph_cell': [3, DISPLAY_REASON],
    'js/display.js | under_water | newsym': [1, DISPLAY_REASON],
    'js/display.js | under_water | show_glyph_cell': [2, DISPLAY_REASON],
    'js/mon.js | hideunder | env.redraw ?? newsym': [1,
        'hideunder() is `async` but synchronous callers drop its promise for '
        + 'the hero (scripts/discarded-promise-allowlist.json); a flush that '
        + 'waited there would run the rest of its body after the caller'],
    'js/sounds.js | dosounds | vaultSoundAllowed': [1,
        'gd_sound() reaches vault.c findgd(), whose parkguard() redraws only '
        + 'a guard with a map position; findgd() parks a migrating guard '
        + 'after setting its position to <0,0>, so nothing is drawn'],
    'js/trap.js | try_disarm | maketrap': [1,
        'the web is made on the hero\'s own square, where display.c '
        + 'show_glyph() raises no notice (startup_a11y.js '
        + 'queueGlyphUpdateNotice())'],
};

// Synchronous functions that call a draw, counted per file: such a function
// cannot wait, so its line stays queued until the waiting caller nearest it
// prints it after the call returns. That is C's order unless the function
// draws a core random number or reads a key after the draw, which js/rng.js
// records at run time; a function that does so is a candidate for a
// `*_steps` form. The counts are pinned both ways so that a new synchronous
// draw caller is seen, and a conversion lowers its file's count.
const SYNC_CALLERS = {
    'js/apply.js': 1, 'js/artifacts.js': 1, 'js/attrib.js': 1, 'js/ball.js': 22,
    'js/bury.js': 2, 'js/detect.js': 12, 'js/dig.js': 9, 'js/display.js': 48, 'js/do.js': 3,
    'js/dog.js': 2, 'js/dogmove.js': 1, 'js/eat.js': 2, 'js/engrave.js': 1,
    'js/extralev.js': 7, 'js/fountain.js': 1, 'js/hack.js': 3, 'js/invent.js': 3,
    'js/light.js': 1, 'js/makemon.js': 2, 'js/makemon_create.js': 12, 'js/mhitm.js': 5,
    'js/minion.js': 1, 'js/mklev.js': 43, 'js/mkmaze.js': 1, 'js/mkroom.js': 8,
    'js/mktrap.js': 1, 'js/mon.js': 54, 'js/monmove.js': 4, 'js/muse.js': 2,
    'js/potion.js': 1, 'js/priest.js': 10, 'js/read.js': 1, 'js/region.js': 4,
    'js/shk.js': 1, 'js/shknam.js': 15, 'js/sounds.js': 1, 'js/sp_lev_object.js': 22,
    'js/steed.js': 1, 'js/teleport.js': 17, 'js/themeroom_fill.js': 34, 'js/trap.js': 8,
    'js/trap_effects.js': 3, 'js/vault.js': 5, 'js/wizard.js': 2, 'js/worm.js': 18,
    'js/worn.js': 7, 'js/zap.js': 2,
};

// 30 listed calls under 14 entries (23 November 2026).
const ALLOWED_PINS = { entries: 14, calls: 30 };
// 405 calls in 261 synchronous functions (23 November 2026).
const SYNC_CALLER_PIN = 405;

const scan = scanQueuedOutputCalls(readJsSources());

test('every synchronous draw an async function makes prints the queue after it', () => {
    const entries = Object.keys(ALLOWED).length;
    const calls = Object.values(ALLOWED).reduce((sum, [count]) => sum + count, 0);
    const pin = 'ALLOWED_PINS in scripts/queued-output-calls.test.mjs';
    assertExceptionCount(entries, ALLOWED_PINS.entries, { what: 'entries', pin: `${pin} (entries)` });
    assertExceptionCount(calls, ALLOWED_PINS.calls, { what: 'calls', pin: `${pin} (calls)` });
    const found = unflushedCalls(scan.calls);
    const expected = Object.fromEntries(Object.entries(ALLOWED)
        .map(([key, [count]]) => [key, count]).sort(([a], [b]) => a.localeCompare(b)));
    assert.deepEqual(found, expected);
});

test('the synchronous functions that call a draw are counted per file', () => {
    const byFile = {};
    for (const [key, count] of Object.entries(scan.syncCallers)) {
        const file = key.split(' | ')[0];
        byFile[file] = (byFile[file] ?? 0) + count;
    }
    assertExceptionCount(Object.values(byFile).reduce((a, b) => a + b, 0), SYNC_CALLER_PIN,
        { what: 'synchronous draw calls', pin: 'SYNC_CALLER_PIN in scripts/queued-output-calls.test.mjs' });
    assert.deepEqual(byFile, SYNC_CALLERS);
});

test('the scan finds an unprinted draw and accepts the flush after it', () => {
    // A three-file stand-in: newsym() reaches queueGlyphUpdateNotice()
    // through show_glyph_cell(); a.js draws from async functions three ways.
    // The bare call and the one in an `if` test are unprinted; a flush after
    // the `if` does not cover a draw in its test. maybe() draws and answers
    // a promise, so a flush before that promise settles would print beside
    // the rest of the draw: early() is unprinted too, while settled(), which
    // prints after awaiting it, is printed.
    const sources = {
        'js/startup_a11y.js': 'export function queueGlyphUpdateNotice() {}\n',
        'js/display.js': "import { queueGlyphUpdateNotice } from './startup_a11y.js';\n"
            + 'export function show_glyph_cell() { queueGlyphUpdateNotice(); }\n'
            + 'export function newsym() { show_glyph_cell(); }\n',
        'js/a.js': "import { newsym } from './display.js';\n"
            + 'export async function bare() { newsym(1, 2); }\n'
            + 'export async function printed() {\n'
            + '    newsym(1, 2);\n'
            + '    if (noticesQueued()) await emitQueuedNotices();\n'
            + '}\n'
            + 'export async function tested() {\n'
            + '    if (newsym(1, 2)) rn2(3);\n'
            + '    if (noticesQueued()) await emitQueuedNotices();\n'
            + '}\n'
            + 'export function sync() { newsym(3, 4); }\n'
            + 'export function maybe() { newsym(5, 6); return later(); }\n'
            + 'async function later() {}\n'
            + 'export async function early() {\n'
            + '    const pending = maybe();\n'
            + '    if (noticesQueued()) await emitQueuedNotices();\n'
            + '    await pending;\n'
            + '}\n'
            + 'export async function settled() {\n'
            + '    const pending = maybe();\n'
            + '    if (pending) await pending;\n'
            + '    if (noticesQueued()) await emitQueuedNotices();\n'
            + '}\n',
    };
    const { calls, syncCallers } = scanQueuedOutputCalls(sources);
    assert.deepEqual(unflushedCalls(calls.filter((call) => call.file === 'js/a.js')),
        { 'js/a.js | bare | newsym': 1, 'js/a.js | early | maybe': 1,
            'js/a.js | tested | newsym': 1 });
    assert.equal(syncCallers['js/a.js | sync'], 1);
});
