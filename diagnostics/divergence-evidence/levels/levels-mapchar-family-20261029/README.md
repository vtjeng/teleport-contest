# Declarative map-character C-string family

Five additional API fields share the existing C-string-prefix cause. Thirteen targets differ; fifteen controls match. Each field has its own commands, output/receipt pair and exact source bindings in paths.json.

| Path | Witness | C result | JS result | Controls |
| --- | --- | --- | --- | --- |
| level_init.fg | solidfill, T + NUL (+ suffix) | accept; TREE13 | reject; prior ROOM25 | T; empty default ROOM; TT error |
| level_init.bg | mazegrid, T + NUL (+ suffix) | accept; TREE13 | reject; prior ROOM25 | T; empty default STONE; TT error |
| level_init.filling | solidfill, T + NUL (+ suffix) | accept; TREE13 | reject; prior ROOM25 | T; empty default ROOM; TT error |
| replace_terrain.fromterrain | one-cell ROOM→TREE, . + NUL (+ suffix) | accept; TREE13 | reject; prior ROOM25 | matching .; .. error; nonmatching T |
| replace_terrain.toterrain | one-cell ROOM→TREE, T + NUL (+ suffix) | accept; TREE13 | reject; prior ROOM25 | T; TT error; leading-NUL error |

Each initializer also tests a leading-NUL value. C's optional reader treats its prefix as empty and uses the default: ROOM25 for fg/filling, STONE0 for bg. JS rejects. This requires preserving optional-default ordering, not merely allowing a one-character C prefix inside check_mapchr. Required totterrain leading-NUL correctly rejects on both sides. Empty fromterrain would enter mapfragment matching and is deliberately outside this pass.

Clean-base handoff:

1. Check out `2f80ba5210a57819a2aaa8dbf5b8c88618b85242`, initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this complete evidence directory at its same relative path.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no install/network/Lua-library dependency.
4. For each FIELD in `fg bg filling fromterrain toterrain`, run `node diagnostics/divergence-evidence/levels/levels-mapchar-family-20261029/probe.mjs target FIELD`: expected exit1 (3 initializer or2 replacement differences).
5. Run `node diagnostics/divergence-evidence/levels/levels-mapchar-family-20261029/probe.mjs control FIELD`: expected exit0,3 controls per field. Post-fix all target commands should exit0.
6. Run `node --test scripts/test-suites.test.mjs`. All runners are manual ordinary .mjs outside default CI.

C wrapper/readers and construction writers are exact source bodies. The adapter preserves the full input allocation; real dupstr/strlen establishes C-prefix behavior. Fixtures.json declares raw hex and deterministic C outputs, which the runner verifies before comparing production JS APIs. The oracle includes all small dependencies, and paths.json pins each individual wrapper/reader path. It neither injects a pre-truncated input nor substitutes desired terrain results. C source integrity remains checked after a JS repair.

Scope and implementation handoff: required and optional readers differ on empty prefixes; inspect get_table_str_opt/get_table_mapchr_opt ordering as well as check_mapchr. Do not infer coverage of callback-valued strings, maze generation, mapfragment matching or unrelated string APIs. Earlier levels-terrain-string-prefix-20261029 tests required terrain table/positional forms; this package adds five bounded fields without rewriting that frozen evidence. Group with the message/engraving/map C-string cause, no additional independent repair IDs.

Origin: Manual bounded source-led family pass over declarative map-character fields, no exact scanner binding asserted. Nearby guard/error/selection edges stay unreviewed; manual paths do not change frozen scanner counts.

Limits: Five explicit field paths only: level_init fg/filling with solidfill, level_init bg with mazegrid, replace_terrain fromterrain/toterrain on the single interior cell14,10 at chance100. Default frame1,0 and no room. Snapshot compares acceptance and cell terrain, not complete map/lighting/metadata or all init styles. C executes exact wrappers/readers, actual dupstr/strlen, exact char2typ table, fill/terrain writers and seven selection helpers. Fixed typed Lua adapters preserve all string bytes, distinguish absent field from empty string, and emulate only supplied integer/enum fields. Coordinate adapter asserts the fixed single-cell rectangle and default frame. No new Lua runtime or general coercion/callback semantics claim. For replace_terrain, fixed legal rn2(100)=0 at chance100 preserves the always-successful decision; no independent RNG implementation/consumption claim. No mapfragment branch is invoked: empty fromterrain and missing fromterrain remain untested. Unused mapfragment, parser, selection-reader, callback and runtime-effect adapters abort. Initial ROOM state is created by actual solidfill on both sides. Thirteen targets preserve raw hex input in the C allocation. Fifteen controls separately test plain-char acceptance, empty optional default, multi-character rejection and a nonmatching fromterrain. Invalid controls are parser boundaries, not explained-negative setup claims. Leading-NUL initializer input exercises optional defaulting before map-character validation: fg/filling default ROOM25, bg defaults STONE0 in mazegrid. This does not establish all optional readers or callbacks. Required totterrain leading-NUL rejects in the control; do not globally collapse required and optional behavior. No tree, object, monster, bridge or player runtime behavior; stop before finalization. Shipped exposure and score relevance unknown. This is one existing C-string-prefix cause with five additional paths, not five new repairs or a broad equivalence proof. Deferred/unexecuted in this family: mazewalk typ downstream construction, optional fromterrain empty/mapfragment fallback, other init styles, function-valued string readers, general options/alignment/class/name strings, non-ASCII coercions. Prior Main-owned terrain/map witnesses and all parked/denied work remain untouched.

Scanner counts unchanged:56 negative keys/24 causes,4 historical/candidate keys,8 stale,455 undisposed. Three parked gaps remain. No source-only inspections were counted as negatives.
