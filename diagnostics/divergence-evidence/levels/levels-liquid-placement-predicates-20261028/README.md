# Liquid placement predicates: scoped helper delegation

C pool/lava calls are reproduced by local JS predicates in both level-placement consumers. Eight keys describe one shared predicate-delegation cause. The Juiblex exception applies to raised drawbridge moat substrate, not direct MOAT terrain.

128 raised-drawbridge comparisons:4 substrate masks (moat/lava/ice/floor) ×4 directions ×ordinary/Juiblex identity ×humidity0/WET/HOT/both. Exact C is_ok_location/occupied plus is_pool/is_moat/is_lava bodies match production JS exported consumers for eligibility and occupancy. Stored terrain/mask is unchanged. No trap, invocation position, custom predicate or water-level override is present.

Control: 72 controls:9 direct/lowered terrains ×ordinary/Juiblex identity ×4 humidity masks. Direct POOL/MOAT/WATER stay wet on Juiblex, direct lava remains hot, and stone/room/ice/lowered bridge remain nonliquid. All fixed interior-cell results match. This does not prove bridge construction/operation, arbitrary placement, object/monster/runtime effects or whole topology.

Clean-base reproduction:

1. Check out `b977a2a5f2edbfcf72a8d8d651518793fd862074` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay edits.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no installation/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-liquid-placement-predicates-20261028/probe.mjs target` (exit0;128 comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-liquid-placement-predicates-20261028/probe.mjs control` (exit0;72 comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

Each output line retains the actual terrain/mask/context/humidity and the matching eligibility/occupancy pair. This isolates the direct C is_pool/is_lava calls against the JS local helper replacements. C is_moat is included because its Juiblex exception is part of the pool result. Four underlying terrain encodings and four directions are valid drawbridge mask combinations; no bridge operation is invoked. Both consumers use empty cells without traps or an invocation position. No random draws occur.

Limits: Fixed interior coordinate11,5 and humidity0/WET/HOT/both only. Target covers the16 legal raised-bridge direction/substrate masks in ordinary and Juiblex identity; controls cover9 direct/lowered terrains. No arbitrary flags, boundary coordinates or other humidity modes. Exact C bodies use fixed-context adapters: no water-level override, no custom is_ok_location predicate, empty trap cell and non-invocation position. JS uses a fresh GameMap and absent invocation position with corresponding level identities. C sobj_at aborts if called; the chosen humidity domain never enters object lookup. This compares predicates on explicitly constructed valid terrain/mask encodings, not production bridge construction or open/close/destruction. No object/monster/runtime behavior or global dungeon-state equivalence is asserted. Only eight liquid-helper edge keys are reviewed. Invocation, coordinateEnvironment, water-level/on_level and other humidity/coordinate warnings are not suppressed. Shipped exposure and full placement/finalization remain unestablished.

Official exporter verifies8 active keys become filtered against the immutable original run. Eight edges represent one shared liquid-predicate delegation cause. Frozen counts:46 negative keys/21 causes,3 historical candidate keys,8 stale,466 without disposition. Three parked gaps and candidate routing are unchanged. Source-only inspections of unrelated room/corridor diagnostics did not establish outcomes and are not counted.
