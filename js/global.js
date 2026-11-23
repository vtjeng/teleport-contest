// C ref: include/global.h (64-84), the integer typedefs.
//
// `boolean` is `schar`, a signed 8-bit integer, on every host the recorder
// runs on. C therefore keeps only the low byte when a wider value is stored
// in a `boolean` variable or passed to a `boolean` parameter:
// detect.c do_mapping() calls show_map_spot(zx, zy, Confusion), and an
// HConfusion whose timeout is 256 or 512 arrives as 0, so the map is drawn
// as if the hero were not confused. The port holds the wide value, so a site
// where C narrows one calls schar() and tests the result.
// scripts/boolean-narrowing.test.mjs lists those sites.

// The value C stores when `value` is converted to schar: the low eight bits,
// sign-extended. A JavaScript true or false counts as 1 or 0.
export function schar(value) {
    return (Number(value) << 24) >> 24;
}

// C's plain `char` is signed on both hosts the recorder runs on, x86-64
// Linux and macOS, so a byte above 0x7F is negative wherever C holds it in a
// char or reads one into an int: cmd.c readchar_core() ends with
// `return (char) sym`, and pager.c do_look() reads `sym = out_str[0]`. The
// port holds a key or a text byte as the byte, 0 to 255, which agrees with C
// under `==` against another char, under a mask and under a test against
// both ends of a range inside 0 to 0x7F. Where C instead compares the char
// with an unsigned value, orders it, or does arithmetic on it, the port
// calls signed_char() and uses the result. scripts/key-char-type.test.mjs
// lists those sites and fails on a conversion written out by hand.
export function signed_char(byte) {
    return (Number(byte) << 24) >> 24;
}
