# Drawbridge portcullis → ordinary door: retained mask

A closed drawbridge writes W_NONDIGGABLE (8) to its portcullis wall. In C this is the shared rm.flags word; painting the wall as an ordinary door preserves that word, so its door mask is D_LOCKED (8). JS retains wall_info8 separately and leaves doormask0 (D_NODOOR). All four cardinal targets demonstrate this difference. Before-state terrain/wall property/orientation match.

Eight controls match: open bridge → ordinary door retains mask0, and closed bridge → secret door explicitly assigns mask4. Every fixture finally paints the former bridge span as floor, leaving an ordinary or secret door and no orphan drawbridge. No bridge or door runtime action occurs.

Clean-base handoff:

1. Check out `2f80ba5210a57819a2aaa8dbf5b8c88618b85242`, initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this complete evidence directory at the same relative path.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here). No install or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-drawbridge-door-mask-20261029/probe.mjs target`: expected exit1, four Cmask8/JSmask0 differences.
5. Run `node diagnostics/divergence-evidence/levels/levels-drawbridge-door-mask-20261029/probe.mjs control`: expected exit0, eight matches. After repair target must exit0; the runner permits JS changes while checking pinned C source/body integrity.
6. Run `node --test scripts/test-suites.test.mjs`. Runner is ordinary `.mjs`, manual and outside default CI.

Equivalent public sequence is floor level_init; terrain moat and adjacent wall; drawbridge with explicit cardinal direction/closed state; terrain ordinary door at portcullis; terrain floor at span. Coordinates supplied to API use the pinned default frame offset x+1. C executes the complete corresponding wrappers with checked fixed typed readers and explicit-coordinate adapter; exact writers and actual flag aliases determine results. No internal state is assigned to invent a locked door.

Implementation handoff: inspect create_drawbridge writes to loc2.wall_info/doormask and ordinary-door terrain retention in sel_set_ter. C doormask, wall_info and drawbridgemask alias rm.flags; JS fields are independent. Avoid treating this as only a cosmetic discrepancy in raw flags: the compared field is the resulting ordinary door's actual doormask. These observations do not prescribe a gameplay patch.

Origin: Manual source-led construction composition, no exact frozen scanner lead binds the cross-writer alias behavior. Nearby drawbridge diagnostic/guard leads remain unreviewed; no synthetic scanner identity or negative suppression.

Limits: Construction-only API sequence: default frame1,0, floor solidfill, explicit MOAT span14,10 and HWALL adjacent in each cardinal direction, explicit open/closed drawbridge, ordinary/secret door paint, then replace span with floor. Final fixture has no remaining drawbridge; no bridge/door operations, entities, object effects or gameplay commands execute. C executes exact lspo_level_init, lspo_drawbridge and lspo_terrain wrappers and exact construction/terrain writers. Typed table readers accept only the fixed supplied enum/integer inputs; coordinate adapter asserts default frame1,0, nonrandom interior coordinates and no room. This is not a full Lua VM or parser/coercion test. C rm.h aliases doormask/wall_info/drawbridgemask to flags. Minimal fixed structs preserve the used fields; coordinates are small in-range integers. Unused selection/parser and runtime-effect adapters abort if reached; exact is_ice executes, with no ice-removal path. Observed portcullis terrain, wall_info and orientation agree before painting. Four targets compare resulting ordinary-door type/mask/orientation. Eight controls cover initially-open bridges and secret-door replacement; they do not prove arbitrary bridge topology, metadata or runtime parity. Related to existing shared terrain-flag alias cases, but retention across drawbridge-to-door construction differs from earlier clearing/reset paths. Main must deduplicate repair identity; no additional independent-root or score-impact claim. Shipped exposure unknown.

Related evidence: levels-map-wall-reset-20261028, levels-solidfill-wall-reset-20261028 and levels-solidfill-ice-reset-20261029. Keep this retention path distinct during deduplication; no new independent repair ID asserted. Frozen scanner counts unchanged:56 negative keys/24 causes,4 historical/candidate keys,8 stale,455 undisposed. Three parked gaps and prior Main-owned cases untouched.
