// Pins js/termcap.js's capture rule to recorder patch 006's termcap.c
// nomux_putch() (`if (!ttyDisplay || ch < 32) return;`) and its two kinds of
// caller, and checks that the wintty.c writers ported in js/ apply it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { H_DEC, H_IBM, H_UNK, H_UTF8 } from '../js/const.js';
import {
    g_putch_graphics, nomux_g_putch_byte, nomux_putch_byte,
} from '../js/termcap.js';

test('putchar() hooks store printable ASCII and DEL only', () => {
    // 0x20 is the first byte nomux_putch() keeps (ch < 32 returns).
    assert.equal(nomux_putch_byte(0x20), 0x20);
    // 0x7f (DEL) is 127, not below 32, so the shadow cell stores it.
    assert.equal(nomux_putch_byte(0x7f), 0x7f);
    // 0x1f is the last control byte; Blank-set style \032 parses to 0x20.
    assert.equal(nomux_putch_byte(0x1f), null);
    // ^A, as SYMBOLS=...:^A yields.
    assert.equal(nomux_putch_byte(0x01), null);
    // 0x80 and 0xff are negative as a signed char, so below 32 too.
    assert.equal(nomux_putch_byte(0x80), null);
    assert.equal(nomux_putch_byte(0xff), null);
});

test('g_putch() strips the high bit before the same test', () => {
    // An ASCII byte passes through unchanged.
    assert.equal(nomux_g_putch_byte(0x2d), 0x2d);
    // AmigaFont's S_hwall \xc1 is stored as 'A' (0x41).
    assert.equal(nomux_g_putch_byte(0xc1), 0x41);
    // AmigaFont's S_vcdoor \x93 strips to 0x13, a control byte: untouched.
    assert.equal(nomux_g_putch_byte(0x93), null);
    // \xff strips to 0x7f, which nomux_putch() stores.
    assert.equal(nomux_g_putch_byte(0xff), 0x7f);
    // \xa0 strips to a space, the first stored byte.
    assert.equal(nomux_g_putch_byte(0xa0), 0x20);
    // A plain control byte (\x1b from SYMBOLS=...:\x1b) is untouched.
    assert.equal(nomux_g_putch_byte(0x1b), null);
});

test('g_putch() switches to DEC graphics as wintty.c 3748-3779 does', () => {
    // 0xE1 is the lead byte of a three-byte UTF-8 character and DECgraphics'
    // S_corr; its low seven bits are 'a' (0x61), at or above 0x60.
    // 0xC2 is a two-byte UTF-8 lead byte whose low bits, 'B' (0x42), are
    // below 0x60. 0x61 is plain ASCII.
    // SYMHANDLING(H_UTF8), line 3748: putchar(ch), never graph_on().
    assert.equal(g_putch_graphics(0xE1, H_UTF8, false), false);
    // SYMHANDLING(H_IBM), line 3750: putchar(ch) with or without
    // eight_bit_tty.
    assert.equal(g_putch_graphics(0xE1, H_IBM, false), false);
    assert.equal(g_putch_graphics(0xE1, H_IBM, true), false);
    // Lines 3758-3763: any other symset without eight_bit_tty prints a high
    // byte after graph_on(), whatever its low bits.
    assert.equal(g_putch_graphics(0xE1, H_UNK, false), true);
    assert.equal(g_putch_graphics(0xC2, H_UNK, false), true);
    assert.equal(g_putch_graphics(0xE1, H_DEC, false), true);
    // Line 3764: a byte without the high bit is printed as it is.
    assert.equal(g_putch_graphics(0x61, H_DEC, false), false);
    // Lines 3754-3755: eight_bit_tty prints the byte itself unless the symset
    // is DECgraphics and the low bits are 0x60 or above.
    assert.equal(g_putch_graphics(0xE1, H_UNK, true), false);
    assert.equal(g_putch_graphics(0xC2, H_DEC, true), false);
    assert.equal(g_putch_graphics(0xE1, H_DEC, true), true);
    // 0xE0 strips to 0x60, the boundary `(in_ch & 0x7f) < 0x60` excludes;
    // 0xDF strips to 0x5F, the last byte it includes.
    assert.equal(g_putch_graphics(0xE0, H_DEC, true), true);
    assert.equal(g_putch_graphics(0xDF, H_DEC, true), false);
});

test('a map symbol whose capture is ignored leaves the cell untouched', async () => {
    const { symbol_at } = await import('../js/symbols.js');
    const { SYM_OFF_P } = await import('../js/symbol_data.js');
    const showsyms = Array(200).fill(0x2e);
    // S_stone (SYM_OFF_P + 0) as ^A, as SYMBOLS=S_stone:^A sets it.
    showsyms[SYM_OFF_P] = 0x01;
    // S_vwall (SYM_OFF_P + 1) as AmigaFont's \xc0, stored as '@'.
    showsyms[SYM_OFF_P + 1] = 0xc0;
    // S_hwall (SYM_OFF_P + 2) as \x93, whose low bits are a control byte.
    showsyms[SYM_OFF_P + 2] = 0x93;
    const state = {
        gc: { currentgraphics: 0 },
        gs: { showsyms, symset: [{ handling: 0 }, { handling: 0 }] },
        iflags: {},
    };
    assert.equal(symbol_at(SYM_OFF_P, state).ch, null);
    assert.equal(symbol_at(SYM_OFF_P + 1, state).ch, '@');
    assert.equal(symbol_at(SYM_OFF_P + 2, state).ch, null);
    // The glyph's own byte is unchanged for callers that need it.
    assert.equal(symbol_at(SYM_OFF_P + 2, state).ttychar, 0x93);
});
