// termcap.js -- The recorder's shadow-screen capture rule for terminal bytes.
// C ref: win/tty/termcap.c as recorder patch 006 (nethack-c/patches/
// 006-nomux-capture.patch) changes it: nomux_putch() and the wintty.c hooks
// that call it.
//
// The scorer compares patch 006's shadow screen (nomux_buf), not the bytes a
// real terminal receives. nomux_putch() begins
//     if (!ttyDisplay || ch < 32) return;
// so a byte it ignores leaves its cell as it was, while wintty.c still
// advances the cursor past it. Every port of a wintty.c writer decides what
// such a cell shows; these two functions say which bytes reach the cell.

import { H_DEC, H_IBM, H_UTF8 } from './const.js';

// The putchar() hooks (tty_putstr(), tty_putstatusfield(), the menu and text
// window loops) pass a plain char, which is signed on the recorder's x86-64
// build: a byte with its high bit set arrives negative and is ignored with
// the control bytes. Returns the stored byte, or null for an untouched cell.
export function nomux_putch_byte(byte) {
    return byte >= 0x20 && byte < 0x80 ? byte : null;
}

// wintty.c g_putch(), which prints map glyphs and a text window's first
// byte, ends with nomux_putch((ch & 0x80) ? (ch ^ 0x80) : ch): the high bit
// is stripped first, so a high byte is stored as its low seven bits unless
// those are a control byte. Returns the stored byte, or null.
export function nomux_g_putch_byte(byte) {
    return nomux_putch_byte(byte & 0x80 ? byte ^ 0x80 : byte);
}

// wintty.c g_putch() 3748-3779: whether the byte is printed after graph_on(),
// which sets the capture's nomux_decgfx_cur (patch 006, termcap.c graph_on()),
// so the stored low seven bits are read as a DEC line-drawing character.
// A UTF8 or IBM symset prints the byte as it is, and so does eight_bit_tty
// unless the symset is DECgraphics and the low bits are 0x60 or above; of
// the rest, only a byte with its high bit set switches the character set.
// `handling` is the active symset's (sym.h SYMHANDLING()).
// C ref: termcap.c graph_on(), whose DECgraphics switch this function decides.
export function g_putch_graphics(byte, handling, eightBit) {
    if (handling === H_UTF8) return false;
    if (handling === H_IBM
        || (eightBit && (handling !== H_DEC || (byte & 0x7f) < 0x60)))
        return false;
    return (byte & 0x80) !== 0;
}

