// Pins js/termcap.js's capture rule to recorder patch 006's termcap.c
// nomux_putch() (`if (!ttyDisplay || ch < 32) return;`) and its two kinds of
// caller, and checks that the wintty.c writers ported in js/ apply it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { nomux_g_putch_byte, nomux_putch_byte } from '../js/termcap.js';

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
