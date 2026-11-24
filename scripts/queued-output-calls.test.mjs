// An `async` function that makes a synchronous draw prints the notice queue
// right after it (scripts/queued-output-calls.mjs says how calls are found
// and what counts as printed; js/rng.js, "Queued output", says why). It
// awaits the draw's `_async` form or printQueued(); the two-statement form
// remains only where neither fits. This check fails on a new unprinted draw,
// on a listed one that is gone, on a two-statement flush that one awaited
// call could replace, on a change in the number of two-statement flushes
// left, on an awaited form in an async function that a caller drops, and on
// a change in the number of synchronous functions that call a draw.

import assert from 'node:assert/strict';
import test from 'node:test';

import { scanDiscardedPromises } from './discarded-promises.mjs';
import { assertExceptionCount } from './exception-count.mjs';
import { readJsSources, scanQueuedOutputCalls, unflushedCalls } from './queued-output-calls.mjs';

// The display.js reason: js/display.js's own async draws (docrt(),
// swallowed(), under_water(), shieldeff(), flash_glyph_at()) waited for the
// screen-buffer work, which has landed, and are not converted yet. A
// conversion prints lines these draws now leave queued, so it changes output
// and needs its own recordings. tmp_at() was converted after batch games
// b11 g00166 and g00528 and b12 g00514 drew a core random number before its
// newsym()'s notice; the run-time check (js/rng.js) records any of these
// that does the same.
const DISPLAY_REASON = 'js/display.js async draw; prints nothing yet, and printing changes output';

// "<file> | <function> | <callee>": [count, reason].
const ALLOWED = {
    'js/display.js | docrt | see_monsters': [1, DISPLAY_REASON],
    'js/display.js | docrt | show_glyph_cell': [2, DISPLAY_REASON],
    'js/display.js | flash_glyph_at | show_glyph_cell': [1, DISPLAY_REASON],
    'js/display.js | shieldeff | newsym': [1, DISPLAY_REASON],
    'js/display.js | shieldeff | show_glyph_cell': [1, DISPLAY_REASON],
    'js/display.js | swallowed | display_self': [1, DISPLAY_REASON],
    'js/display.js | swallowed | show_glyph_cell': [9, DISPLAY_REASON],
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
    'js/bury.js': 2, 'js/detect.js': 15, 'js/dig.js': 9, 'js/display.js': 45, 'js/do.js': 3,
    'js/dog.js': 2, 'js/dogmove.js': 1, 'js/eat.js': 2, 'js/engrave.js': 1,
    'js/extralev.js': 7, 'js/fountain.js': 1, 'js/hack.js': 3, 'js/invent.js': 3,
    'js/light.js': 1, 'js/makemon_create.js': 10, 'js/makemon.js': 2, 'js/mhitm.js': 5,
    'js/minion.js': 1, 'js/mklev.js': 36, 'js/mkmaze.js': 1, 'js/mkroom.js': 8,
    'js/mktrap.js': 1, 'js/mon.js': 52, 'js/monmove.js': 3, 'js/muse.js': 2,
    'js/potion.js': 1, 'js/priest.js': 10, 'js/read.js': 1, 'js/region.js': 4, 'js/shk.js': 1,
    'js/shknam.js': 15, 'js/sounds.js': 1, 'js/sp_lev_object.js': 22, 'js/steed.js': 1,
    'js/teleport.js': 17, 'js/themeroom_fill.js': 34, 'js/trap_effects.js': 3,
    'js/trap.js': 8, 'js/vault.js': 5, 'js/wizard.js': 2, 'js/worm.js': 18, 'js/worn.js': 7,
    'js/zap.js': 2,
};

// 22 listed calls under 12 entries (24 November 2026).
const ALLOWED_PINS = { entries: 12, calls: 22 };
// 400 calls; a printing form, which hands its print to the caller that
// awaits it, is not counted. 397 until the scan stopped an object property
// such as detect.js's `{ newsym: ... }` from shadowing an import, which hid
// three synchronous draw callers in js/detect.js (24 November 2026). 393
// since mklev.c fill_ordinary_room() is a step generator (branch
// small-leftovers-2): its seven draws run during level creation, where
// display.c suppress_map_output() keeps show_glyph() from raising a notice.
const SYNC_CALLER_PIN = 393;
// Two-statement flushes left where no awaited call fits (24 November 2026):
// draws inside a larger expression, such as a conditional between two draws
// or a step generator that finish_steps() drives, and flushes after
// statements that draw nothing the scan resolves. 22 since mklev.c
// makeniche() drives dosdoor_steps() for its two doors (branch
// small-leftovers-2).
const TWO_STATEMENT_PIN = 22;

const sources = readJsSources();
const scan = scanQueuedOutputCalls(sources);

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

test('a two-statement flush remains only where no awaited call fits', () => {
    const foldable = scan.flushes.filter((flush) => flush.foldable)
        .map((flush) => `${flush.file}:${flush.line}`);
    // Each of these follows one draw that `await <draw>_async(...)` or
    // `await printQueued(<draw>)` prints in a single call.
    assert.deepEqual(foldable, []);
    assertExceptionCount(scan.flushes.length, TWO_STATEMENT_PIN,
        { what: 'two-statement flushes', pin: 'TWO_STATEMENT_PIN in scripts/queued-output-calls.test.mjs' });
});

test('an async function a caller drops prints without waiting a turn', () => {
    // `await` waits a turn even when nothing printed, and the rest of a
    // dropped function's body would then run after its caller
    // (js/tty_message.js printQueued()); only the two-statement flush, which
    // waits just when a line is queued, keeps C's order there.
    const dropped = new Set();
    for (const key of Object.keys(scanDiscardedPromises(sources))) {
        const [file, caller, callee] = key.split(' | ');
        for (const fn of scan.graph.fns) {
            if (fn.file !== file || fn.name !== caller) continue;
            for (const call of fn.calls) {
                for (const to of call.targets ?? []) {
                    if (to.async && to.node && to.name === callee) dropped.add(to.node);
                }
            }
        }
    }
    // js/mon.js hideunder(), js/worn.js mon_adjust_speed() and
    // js/region.js create_gas_cloud() are dropped on 24 November 2026; an
    // empty set would mean the lookup has stopped finding them.
    assert.ok(dropped.size > 0);
    const waiting = scan.calls.filter((call) => call.form === 'flushed'
        && call.via !== 'statement' && dropped.has(call.fn?.node))
        .map((call) => `${call.file}:${call.line}`);
    assert.deepEqual(waiting, []);
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

test('the scan finds an unprinted draw and accepts the printing forms', () => {
    // A four-file stand-in: newsym() reaches queueGlyphUpdateNotice()
    // through show_glyph_cell(), newsym_async() is its printing form, and
    // a.js draws from async functions in each way. The bare call, the one in
    // an `if` test and an unawaited newsym_async() are unprinted; a flush
    // after the `if` does not cover a draw in its test. maybe() draws and
    // answers a promise, so a flush before that promise settles would print
    // beside the rest of the draw: early() is unprinted too, while
    // settled(), which prints after awaiting it, is printed. The
    // two-statement flushes in printed() and early() follow a statement
    // whose value is the draw alone, so they are foldable; those after a
    // draw inside an expression, a draw in an `if` test, and a statement
    // that draws nothing are not.
    const sources = {
        'js/startup_a11y.js': 'export function queueGlyphUpdateNotice() {}\n',
        'js/tty_message.js': 'export function printQueued(r) { return Promise.resolve(r); }\n',
        'js/display.js': "import { queueGlyphUpdateNotice } from './startup_a11y.js';\n"
            + "import { printQueued } from './tty_message.js';\n"
            + 'export function show_glyph_cell() { queueGlyphUpdateNotice(); }\n'
            + 'export function newsym() { show_glyph_cell(); }\n'
            + 'export function newsym_async(...args) { return printQueued(newsym(...args)); }\n',
        'js/a.js': "import { newsym, newsym_async } from './display.js';\n"
            + "import { printQueued } from './tty_message.js';\n"
            + 'export async function bare() { newsym(1, 2); }\n'
            + 'export async function wrapped() { await newsym_async(1, 2); }\n'
            + 'export async function passed() { await printQueued(newsym(1, 2)); }\n'
            + 'export async function dropped() { newsym_async(1, 2); }\n'
            + 'export async function printed() {\n'
            + '    newsym(1, 2);\n'
            + '    if (noticesQueued()) await emitQueuedNotices();\n'
            + '}\n'
            + 'export async function nested() {\n'
            + '    rn2(newsym(1, 2));\n'
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
            + '}\n'
            // An object property named like the import must not shadow it.
            + 'export const hooks = { newsym: (x, y) => x + y };\n',
    };
    const { calls, syncCallers, flushes } = scanQueuedOutputCalls(sources);
    assert.deepEqual(unflushedCalls(calls.filter((call) => call.file === 'js/a.js')),
        { 'js/a.js | bare | newsym': 1, 'js/a.js | dropped | newsym_async': 1,
            'js/a.js | early | maybe': 1, 'js/a.js | tested | newsym': 1 });
    const via = Object.fromEntries(calls.filter((call) => call.form === 'flushed')
        .map((call) => [call.key, call.via]));
    assert.deepEqual(via, {
        'js/a.js | nested | newsym': 'statement',
        'js/a.js | passed | newsym': 'printQueued',
        'js/a.js | printed | newsym': 'statement',
        'js/a.js | settled | maybe': 'statement',
        'js/a.js | wrapped | newsym_async': 'printing form',
    });
    // a.js lines 9, 13, 17, 24 and 30 hold the flushes in printed(),
    // nested(), tested(), early() and settled().
    assert.deepEqual(flushes.map((flush) => [flush.line, flush.foldable]),
        [[9, true], [13, false], [17, false], [24, true], [30, false]]);
    assert.equal(syncCallers['js/a.js | sync'], 1);
    // The printing form's own call of newsym() is not a synchronous caller.
    assert.equal(syncCallers['js/display.js | newsym_async'], undefined);
});
