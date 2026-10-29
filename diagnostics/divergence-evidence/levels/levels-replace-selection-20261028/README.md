# Replacement selection traversal: bounded negative

JS uses ThemeroomSelection constructor/set/get/bounds and an inline full-map clear; these C-only selection call edges are alternate implementations in the tested replacement domain.

30 comparisons: whole map, region, explicit rectangle, sparse absolute selection and empty selection × chances 0/50/100 × two seeds. Exact C lspo_replace_terrain and seven selection helper bodies match the public JS des.replace_terrain terrain coordinates and checked shared RNG tape. Typed table, default frame, and terrain-write adapters are explicit; no mapfragment, parser, lighting/metadata, relative frame composition or finalization claim.

Control: Chance zero retains the input map but still consumes a draw per eligible floor; empty selection consumes none. Chance 100 changes all eligible floors. Region and explicit bounds agree; sparse selection filters membership.

## Clean-base reproduction

1. Check out `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be` and C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay edits.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No Lua, installation or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-replace-selection-20261028/probe.mjs target` (expected 0).
5. Run `node diagnostics/divergence-evidence/levels/levels-replace-selection-20261028/probe.mjs control` (expected 0).
6. Run `node --test scripts/test-suites.test.mjs`.

Sixteen target and fourteen control fixtures. Five initially painted absolute floors are (2,2),(3,2),(4,2),(4,3),(8,8). Region/coordinate bounds select three, sparse selection selects two, whole-map selects five, and empty selects zero. C and JS share checked draw results but construct selection membership independently. The default map frame (1,0) is a fixed C adapter; public JS paint locations assert its expected postcondition.

Limits: Typed argument readers, default frame x+1 conversion, and terrain write are fixed adapters. Full Lua parsing and terrain metadata effects are not tested. Floor-to-corridor fromterrain path only. No mapfragment, relative-selection composition, arbitrary bounds, all seeds or finalization. C shares checked JS RNG draws; not independent RNG implementation equivalence. Shipped exposure is unestablished.

Official compact projection retains original run `ea2181cadbad5793b4be` / SHA `b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8`, exact canonical keys/fingerprints, manifest and decisions. No new scan. Five edges represent one bounded selection-wrapper cause, not five independent defects.

Combined two-case batch: 571 raw / 523 permitted; 16 current negative keys, 1 candidate key, 8 stale bindings, 498 without a current disposition. Forty-four ownership overlaps remain routing notes. Numeric-string, gradient and parked state-export gaps remain unresolved. Corridor source inspection added no proved disposition.
