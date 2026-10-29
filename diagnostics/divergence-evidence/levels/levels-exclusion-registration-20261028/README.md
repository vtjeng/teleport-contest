# Exclusion-zone registration: bounded negative

JS constructs a fresh exclusion-zone object where C allocates a record; the missing allocation edge does not omit registration in the tested paths.

15 public exclusion cases with two inserts each: default/four explicit types × default map frame, placed map frame and room frame. Exact C exclusion registration and coordinate functions match ordered zonetype/bounds records; distinct nodes and last-in-first-out insertion are checked. Fixed typed table readers and asserted frame/room postconditions; no teleportation, generation enforcement or finalization.

Control: Default type produces teleport zones in each frame; explicit types and two distinct rectangles verify mapping, frame conversion and list order.

Clean-base reproduction:

1. Check out `b95445f519c19c3cbce5be6252c18e03e77275a7` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No installation, Lua runtime or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-exclusion-registration-20261028/probe.mjs target` (expected 0; 12 comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-exclusion-registration-20261028/probe.mjs control` (expected 0; three comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

C executes actual allocation, prepending, coordinate unpacking and fixed-positive get_location conversion. The default frame is (1,0), the placed map frame (10,6), and the asserted room lower corner (11,5). Each call pair uses regions [1,1,3,2] then [0,0,2,1]. JS asserts two distinct nodes with no tail beyond them. The record type named monster-generation is tested only as a registration enum; no monster generation is exercised.

Limits: 15 valid positive-coordinate fixtures with two records each. No arbitrary bounds, random coordinates, allocation failure, teleport/runtime enforcement or finalization. C frame/room initial conditions are fixed to asserted public JS postconditions; Lua table readers are fixed typed adapters. Shipped exposure remains unestablished.

Official compact projection verifies one active key becomes filtered on original run ea2181cadbad5793b4be / SHA b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8. Current JS function is unchanged from scan base; stale bindings are not revived.

Combined batch accounting: 24 negative keys across 15 cases/causes, 1 historical accepted candidate, 8 stale bindings, 490 without disposition (523 permitted / 571 raw). Parked prerequisites and all exclusions remain unchanged.
