import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { add_quoted_engraving, do_screen_description } from '../js/pager.js';
import { cmap_to_glyph, glyph_buffer_at } from '../js/display.js';
import { lastseentyp_grid } from '../js/dungeon.js';
import { S_grave } from '../js/symbols.js';
import { GRAVE } from '../js/const.js';
import { collectLookaroundMessages, queueGlyphUpdateNotice, emitGlyphUpdateNotices } from '../js/startup_a11y.js';
import { expectTerminated } from './expect-terminated.mjs';

// pager.c do_screen_description() 1611-1613 builds the farlook suffix in the
// 256-byte temp_buf: Sprintf(" (%s", firstmatch), add_quoted_engraving(),
// which strncat()s the engraving text so that temp_buf holds at most 255
// characters, then Strcat(temp_buf, ")"). With 255 characters already there,
// the ")" and its NUL need 257 bytes. The judge's recordings come from macOS,
// whose checked strcat() (__strcat_chk) calls abort() at that point, before
// anything is printed for the key.

// Wizard mode lets the hero engrave in the dust with no other prompt; no pet
// can walk onto the engraving. The seed, date and role are arbitrary: the
// behaviour under test reads only the remembered text's length.
const RC = 'OPTIONS=name:Scribe,role:Samurai,race:human,gender:male,align:lawful\n'
    + 'OPTIONS=playmode:debug,!autopickup,!tutorial,!legacy,'
    + 'suppress_alert:3.4.3,!tips,pettype:none\n';
const SEED = 6160;
const DATETIME = '20261122093000';
const WORDS = 'the quick brown fox jumps over the lazy dog ';

// A text of exactly n characters. getlin() keeps a space at the end, but a
// visible last character makes the length easy to see in a screen.
function piece(n) {
    let text = '';
    while (text.length < n) text += WORDS;
    return text.slice(0, n).replace(/ $/u, 'z');
}

// k steps north, E - engraves with a fingertip, and each further E - y adds
// to the engraving. tty getlin() takes at most COLNO (80) characters, so a
// long text goes in 80-character parts. Then j steps back south, the look
// key opens getpos(), k moves the cursor onto the engraving, where
// getpos.c auto_describe() calls do_screen_description(), and . picks it.
// The two escapes dismiss whatever follows.
function moves(length, lookKey) {
    const parts = [];
    for (let left = length; left > 0; left -= 80)
        parts.push(Math.min(80, left));
    let keys = `kE-\n${piece(parts[0])}\n\u001b\u001b`;
    for (const n of parts.slice(1))
        keys += `E-y\n${piece(n)}\n\u001b\u001b`;
    return `${keys}j${lookKey}k.\u001b\u001b`;
}

async function play(length, lookKey) {
    const keys = moves(length, lookKey);
    const segment = await runSegment({
        seed: SEED, datetime: DATETIME, nethackrc: RC, moves: keys,
    });
    return { segment, keyCount: [...keys].length };
}

// " (engraving" is 11 characters and ` with remembered text: "` and the
// closing quote add 25, so a remembered text of 218 characters leaves
// temp_buf at 254 and the ")" fits; 219 fills it to 255.
for (const lookKey of [';', '_']) {
    test(`a 218-character engraving is described at the ${lookKey} prompt`, async () => {
        const { segment, keyCount } = await play(218, lookKey);
        // One screen for the startup boundary and one per key.
        assert.equal(segment.getScreens().length, keyCount + 1);
    });

    test(`a 219-character engraving aborts at the ${lookKey} prompt's cursor move`, async () => {
        const { segment, keyCount } = await play(219, lookKey);
        // The cursor move onto the engraving is the fourth key from the end
        // (k . ESC ESC). abort() runs while that key is handled, so the
        // screens stop at the boundary that read it: keyCount - 4 keys
        // before it, plus the startup boundary.
        assert.equal(segment.getScreens().length, keyCount - 3);
    });
}

// The engraving from a finished 218-character game, with its remembered text
// replaced, looked at directly. The hero ends the game south of it.
// engr_txt[1] is C's engr_txt[remembered_text], the text the hero read.
async function engravingAfterGame() {
    await play(218, ';');
    const engraving = game.head_engr;
    assert.ok(engraving?.eread, 'the hero read the engraving');
    return engraving;
}

test('do_screen_description() aborts exactly when temp_buf reaches 255', async () => {
    const engraving = await engravingAfterGame();
    const cc = { x: engraving.engr_x, y: engraving.engr_y };
    engraving.engr_txt[1] = piece(218);
    const fits = do_screen_description(cc, true, 0, game);
    assert.ok(!fits.aborted);
    assert.match(fits.out, /remembered text: "the quick/u);
    engraving.engr_txt[1] = piece(219);
    assert.equal(do_screen_description(cc, true, 0, game).aborted, true);
    // A text longer than temp_buf can hold is cut to 255 first, so it
    // aborts the same way.
    engraving.engr_txt[1] = piece(300);
    assert.equal(do_screen_description(cc, true, 0, game).aborted, true);
});

test('a headstone aborts from 221 characters', async () => {
    // No play gives a headstone a chosen epitaph, so turn the engraving's
    // square into a remembered grave. " (grave" is 7 characters and
    // ` with headstone reading: "` and the closing quote add 27, so 220
    // characters leave 254 and 221 fill temp_buf.
    const engraving = await engravingAfterGame();
    const { engr_x: x, engr_y: y } = engraving;
    const location = game.level.at(x, y);
    location.typ = GRAVE;
    lastseentyp_grid(game)[x][y] = GRAVE;
    glyph_buffer_at(x, y).glyphinfo = {
        ...glyph_buffer_at(x, y).glyphinfo, glyph: cmap_to_glyph(S_grave, game),
    };
    engraving.engr_txt[1] = piece(220);
    const fits = do_screen_description({ x, y }, true, 0, game);
    assert.ok(!fits.aborted);
    assert.match(fits.out, /\(grave with headstone reading: "the quick/u);
    engraving.engr_txt[1] = piece(221);
    assert.equal(do_screen_description({ x, y }, true, 0, game).aborted, true);
});

test('dolookaround() stops collecting at the aborting square', async () => {
    // cmd.c dolookaround() describes every interesting square it can see;
    // the hero stands next to the engraving, so it is one of them.
    const engraving = await engravingAfterGame();
    engraving.engr_txt[1] = piece(219);
    const messages = collectLookaroundMessages(game);
    assert.equal(messages.aborted, true);
});

test('a show_glyph() notice for the engraving ends the segment when it drains', async () => {
    // display.c show_glyph() describes a square whose glyph replaces an
    // unexplored one when the glyph_updates option is on. previous null is
    // the unexplored nul_gbuf glyph and previousGnew 0 its clear gnew bit.
    const engraving = await engravingAfterGame();
    const { engr_x: x, engr_y: y } = engraving;
    engraving.engr_txt[1] = piece(219);
    game.a11y.glyph_updates = true;
    game._glyphUpdateNotices = [];
    assert.equal(queueGlyphUpdateNotice(
        x, y, null, glyph_buffer_at(x, y).glyphinfo, 0, game,
    ), true);
    assert.equal(game._glyphUpdateNotices.at(-1).abort, true);
    await expectTerminated(() => emitGlyphUpdateNotices(game));
});

test('add_quoted_engraving() keeps buf within BUFSZ - 1 characters', () => {
    // A state holding only the engraving list that engr_at() reads; any
    // square serves, so (5, 5).
    const state = {
        head_engr: {
            engr_x: 5, engr_y: 5, eread: true,
            engr_txt: ['', piece(400), ''], nxt_engr: null,
        },
    };
    // 400 characters is past both of C's limits: the Snprintf() into its
    // own 256-byte buffer and the strncat() into buf.
    const out = add_quoted_engraving(5, 5, ' (engraving', false, state);
    assert.equal(out.length, 255);
    assert.ok(out.startsWith(' (engraving with remembered text: "the quick'));
});

// Every caller must end the segment when do_screen_description() reports the
// abort; one that forgot would print the description instead. Each call site
// in js/ must test `.aborted` within the next few lines: six lines cover the
// longest call (three lines) and the test after it.
test('every do_screen_description() call honours its abort', () => {
    const dir = new URL('../js/', import.meta.url);
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.js'));
    const sites = [];
    for (const name of files) {
        const lines = fs.readFileSync(new URL(name, dir), 'utf8').split('\n');
        lines.forEach((line, index) => {
            if (!/do_screen_description\(/u.test(line)) return;
            if (/^\s*(\/\/|\*)/u.test(line)) return;
            if (/function do_screen_description\(/u.test(line)) return;
            const after = lines.slice(index, index + 6).join('\n');
            sites.push({ site: `${name}:${index + 1}`, ok: /\.aborted/u.test(after) });
        });
    }
    // The seven callers: getpos.js auto_describe() and getpos_menu(),
    // pager.js do_look()'s typed-symbol and screen paths, and
    // startup_a11y.js's show_glyph() notice and the two dolookaround()
    // descriptions. Update the count when a caller is added or removed.
    assert.equal(sites.length, 7, JSON.stringify(sites));
    assert.deepEqual(sites.filter(({ ok }) => !ok), []);
});
