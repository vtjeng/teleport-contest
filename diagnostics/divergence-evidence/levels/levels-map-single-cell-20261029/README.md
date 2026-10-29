# One-cell row-array map misses the frame-reset branch

**Confirmed supported API divergence; shipped exposure unknown.** C `des.map(".")` takes the width<=1 AND height<=1 branch: reset frame to `[1,0,79,21]`, return an empty selection, and write no terrain. Its documented JS counterpart `des.map(["."])` writes ROOM at `(39,11)` and returns frame `[39,11,1,1]`. The JS table form already matches C for a one-cell map.

Seven controls pass: singleton table form plus1x2,2x1,2x2 fragments in both table and centered array/string forms. The adjacent-size controls preserve the conjunctive boundary: a narrow map with either dimension greater than1 should still place cells.

Clean-base handoff:

1. Check out `e2cd8ea2fa298c9b3a7c062c70d21999b91f06fc`, with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this complete evidence directory into that checkout without gameplay edits.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no installation/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-map-single-cell-20261029/probe.mjs target`: expected exit1, C empty selection/full frame versus JS one floor cell/singleton frame.
5. Run `node diagnostics/divergence-evidence/levels/levels-map-single-cell-20261029/probe.mjs control`: expected exit0 for all seven controls. After Main repair, target should also exit0.
6. Run `node --test scripts/test-suites.test.mjs`. The manual parity runner remains an ordinary `.mjs` outside default CI.

The C oracle executes the full production wrapper and frame-reset function. Fixed typed readers feed a valid map string/table, not a precomputed dimension or reset result. Actual mapfrag parsing supplies width/height. Selection and floor writes are checked adapters; all source bodies are fingerprinted. The JS witness goes through the production mklev special-loader API, observes its return and stops via a sentinel before finalization. Source documents the row-array/string correspondence in createSpecialLevelApi.map.

This missing singleton branch differs from the Main-owned map NUL-prefix case (no NUL here) and none-alignment case (centered array path here). Related cases are listed for triage, not automatic cause merging.

Origin: Manual source/API qualification. The nearby frozen source-audit:edge-c-only:src/sp_lev.c:lspo_map:reset_xystart_size lead maps its JS side to exported themed-map lspo_map, not the actual public mapFromRows branch exercised here. That key is retained unreviewed; no canonical ID is invented or assigned to a nearby helper.

Limits: API-scoped map construction using one valid floor-character row. Shipped exposure is unknown; no score or finalization claim. C executes exact lspo_map/parser/dupstr/reset_xystart_size bodies with typed string/table readers and checked floor-terrain/selection adapters. No full Lua interpreter is executed. The actual singleton branch and exact reset function determine the oracle result. JS row-array form is the production documented counterpart of the C string form. Both are nonempty rectangular maps; the singleton table control demonstrates C and JS accept the same value. No internal-only invocation or invalid map state supports the claim. The test observes returned frame and selected floor cells only, before finalization. It does not claim lighting/metadata parity, callback behavior, room clipping, random placement or subsequent coordinate-user behavior. Separate from embedded-NUL prefix handling and explicit none-alignment fixes: the target contains no NUL and uses the centered row-array path. Root-cause grouping remains for Main review; no accepted repair ID is created.

Frozen scanner counts remain48 negative keys/22 causes,4 historical/candidate keys,8 stale,463 without disposition. This is an additional manual/unbound API candidate, outside those key counts. Three parked gaps unchanged.
