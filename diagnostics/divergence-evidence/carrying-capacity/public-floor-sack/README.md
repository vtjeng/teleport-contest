# Floor-sack capacity admission: scoped negative

JS6ea005a52da700e1cf84ba2ba3873ecec0d0ae9e; C16ff59115315917b93185d026aeefea06db9b0f4.
Seed642919 Valkyrie, capacity950, kit90. Supported staged setup: wish empty sack
and2000 ordinary arrows, stash arrows and drop loaded sack; wish760 more arrows,
then #loot/stash those into the floor sack. Public removal selects all2760.
Both engines take2759, reaching2849/Overtaxed. Drop2000 carried arrows before
reopening the sack; public Take out menu shows the one-arrow remainder.
Control wishes759 in the second stage: all2759 fit and the sack is empty.

Both132 screens/cursors match strictly. Target2488 RNG, control2487 RNG, exit0
for each; no animation mismatch. observe.mjs checks final remainder/empty state,
2759 carried arrows, burden, stable HP/no observed combat and full comparisons.
This exercises C/JS out_container -> lift_object -> carry_count with a floor
container, unlike removing weight from an already carried sack.

Setup limitations are substantive: starting overloaded prevented apply, and
reopening #loot at2849 was refused by both engines. Those attempts are retained
locally as setup-only, not negatives. Two-stage loading and dropping2000 before
reopening qualify the final witnesses; no bypass or state injection used.

Existing selected-count pickup repair is reconciled, not counted again. The
known floor-gold pickup guard is a different entry path. This package covers
only declared ordinary arrows/plain sack; no special objects, equipment effects,
consumption, rings, timers, migration, combat or denied investigations.

case.json pins source, commands, expected exits, actual normalized receipts and
raw output hashes. Fresh output paths are required. Recorder source/binary
provenance is in public-stack-cycle; independent build attestation unavailable.
Elapsed time unmeasured. No gameplay edits or CI, no exhaustive claim.
