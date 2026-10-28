# Random first-room placement: bounded negative

JS create_room injected RNG defaults preserve the C zero/one-based draws in tested first-room placement paths.

Ten public des.room comparisons: fully random, random position, random dimensions, random alignment and fixed control × two seeds. Exact C create_room/check_room/get_rect bodies match acceptance, returned room bounds and primitive RNG consumption. C captures room creation and checks a one-rectangle allocator handoff; no complete storage/topology/allocator mutation proof. Raw JS draw labels retained; rnd is normalized to rn2+1 and C rn1 to rn2+base.

Control: Fixed geometry uses no draws. Invalid one-dimension-random setup was discarded because both production wrappers require paired dimensions; it is not a negative case.

Clean-base reproduction:

1. Check out `4222eaf89f2cc3b1392273b70cc27b399418c691` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No Lua runtime, installation or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-random-room-placement-20261028/probe.mjs target` (expected 0; eight comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-random-room-placement-20261028/probe.mjs control` (expected 0; two comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

The C harness starts with the sole full-map free rectangle, no rooms and an all-stone grid. JS asserts that allocator postcondition after public solidfill. Both use ordinary, chance=0, lit=0, filled=0 rooms. C rnd/rn1 are explicit arithmetic adapters over a checked zero-based tape; raw JS labels remain stored. A rejected one-dimension-random prototype was invalid under both production wrappers and is not included in the proof. Related prior evidence covers fixed-coordinate obstruction only; this case does not broaden its topology claims.

Limits: Five first-room configurations/two seeds, empty stone map/one initial allocator rectangle. No repeated-room, vault, full allocator mutation, storage, topology, metadata or finalization proof. C captures add_room bounds and checks split handoff instead of executing their storage/mutation. RNG tapes are shared, normalized to zero-based primitive draws; not independent RNG or trace-label equivalence. Shipped exposure remains unestablished.

Official compact projection verifies 2 active keys become filtered against original immutable run ea2181cadbad5793b4be / SHA b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8. Exact scanner identities/fingerprints and final decisions included; no rescan or stale review revival.

Combined batch accounting: 22 current negative keys across 13 cases/causes, 1 historical candidate now fully accepted with explicit final receipt provenance, 8 stale bindings, 492 without disposition (523 permitted / 571 raw). Parked numeric-string, gradient and state-export gaps remain unresolved.
