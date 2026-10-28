# Missed-attack waterwall predicate: scoped explained negative

The C-only `wildmiss -> is_waterwall` edge is expanded inline in JS as a level
lookup plus `IS_WATERWALL`. The C helper tests the same terrain constant for
valid coordinates. Pool terrain is deliberately not a waterwall.

```
node --test diagnostics/divergence-evidence/monsters/wildmiss-waterwall-inline-negative/probe.test.mjs
```

Requires Node and a C99 compiler (`cc`, or `CC`). The focused C oracle compiles
the unmodified upstream `is_waterwall` with the pinned rm.h WATER constant and
its macro, in a minimal level-array wrapper. It is **not a full C combat
recording**. Source pinning retains C's corresponding `empty water`/`thin air`
message choice. JS runs production `set_apparxy` then `wildmiss`, with real
vision and naming, and only random/message seams supplied.

A blind xorn has a valid alternative target on a visible square beside the
hero. `set_apparxy` consumes legal rn2(3) values [1,1,2] and selects it. A xorn's
wall-passing trait allows this non-floor target; the hero has no gold that
would let it smell the true location. The message's rn2(3)=2 selects the medium
feedback. The target WATER gives `The xorn strikes at empty water!`; POOL,
ROOM and DRAWBRIDGE_UP controls give `The xorn strikes at thin air!`. All four
agree with the C predicate. The fixture uses an initialized hero and native
xorn data; generated monsters are cleared to isolate the local state. A first
attempt hit an occupied-square setup error, retained in `initial-attempt.txt`,
and supplied no evidence about gameplay parity.

Scope: valid integer target coordinates selected by this ordinary target path.
C `is_waterwall` explicitly checks `isok`, while the JS inline implementation
uses `GameMap.at`; do not suppress boundary/invalid-coordinate leads based on
this proof. Do not infer complete missed-attack, visibility, water-level or
message-order equivalence. No artificial invalid target was used as a negative.

`case.json` contains the exact scanner key/evidenceKey/reviewFingerprint and
references the original durable archive from PR #12 without duplicating it.
Relevant gameplay sources remain unchanged from that scanner run. No gameplay
changes or default-CI tests are included.
