# Level-coordinate eligibility and terrain lighting: bounded comparisons

31,080 targets (28,416 eligibility and2,664 lighting) and15,096 controls (14,208 Water and888 no-change-light) match exact compiled C routines against exported production JS functions. Results include eligibility/callback count and setter return,type,lit,candig,RNG count,diagnostic count and feature counts.

These are two explained-negative causes covering three scanner keys. Four related diagnostic keys remain unresolved; the passing valid-input tests do not suppress them.

Reproduce from a clean base:

1. Check out `a9a6a2e65309bd56fcf9b0d88a2f35d9a18989f7` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Overlay this complete directory at its relative path.
3. Use Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in this environment).
4. Run `node diagnostics/divergence-evidence/levels/levels-location-lighting-contracts-20261029/probe.mjs target` (exit0,31,080 cases).
5. Run `node diagnostics/divergence-evidence/levels/levels-location-lighting-contracts-20261029/probe.mjs control` (exit0,15,096 cases).
6. Run `node --test scripts/test-suites.test.mjs`.

The runner validates source hashes and exact C function bodies, compiles the tiny C oracle in a private temporary directory, and compares every observation. It emits compact deterministic input/observation hashes instead of publishing the generated rows. Fixtures are generated in the runner and need no downloads, Lua VM, extra libraries or recordings.

Controls distinguish Water shortcut from callback/ANY_LOC precedence, reject protected stairs/ladders without draws, test both random light results, bypass RNG for lava, and preserve lighting when no-change is requested except the underlying lava setter.

Three reviewed scanner keys form TWO semantic causes: location environment/Water macro delegation (two keys), and light RNG parameter delegation (one key). No independent repair or candidate is claimed.

Eligibility is tested on one valid empty construction coordinate (10,6), all37 terrain constants,all128 humidity masks, assigned Water(2,1), current(0,1)/(2,2)/(2,1), and no callback/false/true callback. Call counts establish shortcut precedence. There are no boulders, drawbridgemask is0, Juiblex is not current. No placement, random search, invalid coordinate, unassigned-level, mixed-frame or full generation claim.

Lighting covers six old terrains STONE/SDOOR/STAIRS/LADDER/FOUNTAIN/SINK,all37 new types,light -2/-1/0/1,prior0/1,shared draw0/1. Underlying C set_levltyp and JS production setter run. Old ice and raised bridge are excluded; C ice/timer hooks abort if reached. No object runtime, timer, independent RNG, debug overwrite or invalid-input claim.

C exact source bodies compile in a typed standalone fixture with successful allocation and no Lua runtime. C terrain enumeration is copied from pinned rm.h; relevant macros match source. C empty sobj_at adapter returns NULL, feature recount adapter counts the single non-STONE square, and EXTRA_SANITY_CHECKS is deliberately enabled so non-firing diagnostics are observable. Those adapters do not prove full runtime behavior.

Four missing-diagnostic scanner keys remain unresolved in unresolved-diagnostics.json: valid-input success cannot establish missing error-path equivalence or supported reachability. These keys are not in the negative projection. Earlier ten selection-caller bindings remain unresolved and were not re-run.

The comparison checkout was safely moved from89b8 to fetched Main a9a6a2e65, and both modes executed there. Main temperature repair publication is observed, but no full acceptance receipt is inferred. Cave-cap, bottomstairs and three parked prerequisites remain unresolved; all exclusions remain.

The official exporter validates three active→filtered decisions against the original immutable run ea2181cadbad5793b4be. Relevant JS callers/dependencies are body-equal to the scan base; source-fingerprints.json records exact hashes. Accounting after publication:77 negative keys across35 causes,5 candidate/historical keys,8 prior stale,433 without current qualification. The four diagnostic records are within433, not additional negative counts. This seven-key pass is smaller than the roughly-ten-key aim; it provides two complete comparison families and records the exact four remaining reachability gaps rather than padding the batch with repeated covered probes.
