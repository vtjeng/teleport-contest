# Fixed ladder descriptors: bounded negative

JS isLuaTable dispatch corresponds to C LUA_TTABLE classification for the tested supported ladder descriptors.

Eight public down-ladder calls on D:1: x/y table, coord table, direction+two integers, two integers with default direction × two frames. Exact C l_create_stairway/nhl_get_xy_params with fixed typed readers and coordinate adapter match stairway-add arguments, terrain/ladder fields and SpLev_Map marker. No full C linked-list, random coordinate, up-stair/dungeon-end, trap removal, parser-generalization or movement claim.

Control: The two positional forms independently reach the non-table branch and agree with table forms at both positions.

Clean-base reproduction:

1. Check out `b95445f519c19c3cbce5be6252c18e03e77275a7` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No installation, Lua runtime or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-ladder-descriptors-20261028/probe.mjs target` (expected 0; four comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-ladder-descriptors-20261028/probe.mjs control` (expected 0; four comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

Table x/y, table coord, direction+integers and default-direction integers all request (2,2) in default (1,0) or placed-map (10,6) frames. JS asserts D:1, no existing stairs/traps, exactly one new node, destination D:2, ladder terrain/orientation and the descriptor map marker. C constructor executes its actual branch, terrain and marker writes, with a checked capture of the registration call. This tests typed valid inputs, not arbitrary objects/classification or Lua parsing.

Limits: Eight fixed down-ladder forms on D:1 only. No random coordinates, up-ladder, dungeon-end stairs, existing trap removal, runtime traversal or full metadata proof. C uses typed argument readers and fixed coordinate conversion, and captures stairway_add arguments; its complete list allocator and Lua interpreter are not executed. Shipped exposure remains unestablished.

Official compact projection verifies one active key becomes filtered on original run ea2181cadbad5793b4be / SHA b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8. Current JS function is unchanged from scan base; stale bindings are not revived.

Combined batch accounting: 24 negative keys across 15 cases/causes, 1 historical accepted candidate, 8 stale bindings, 490 without disposition (523 permitted / 571 raw). Parked prerequisites and all exclusions remain unchanged.
