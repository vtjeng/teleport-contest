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
