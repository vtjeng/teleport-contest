The fixed-input C oracle retains five exact pinned C function bodies. Its Lua table,
3x3 ICE fragment, bitmap, timer/error and global-state adapters are disclosed in
oracle.c. It does not execute full Lua parsing, native level initialization or
finalization. Initialization flag postconditions are source-derived. All six
cases were freshly executed with provisioned Debian Clang19.1.7.

Reproduce: compile `oracle.c` with `clang -std=c99 -O2 -o /tmp/ice-oracle` and run
`/tmp/ice-oracle <init:0|1> <icedpools:0|1> <map|terrain>`. The six argument sets and
raw output rows are retained in expected.json. Function bodies and oracle bytes
are hash-bound by provenance.json and the default regression test.

INVALID_TYPE was corrected from the published harness's -1 to pinned rm.h 127;
fixed ICE input cannot reach that sentinel. Storage aliases icedpool to C flags;
JS stores the same ICE-only metadata separately. The dependent51f568 correction
is preserved by not introducing an unconditional icedpool reset for non-ICE.
