# Digging boundary: scoped Earth macro negative

C Is_earthlevel expands through Lcheck/Lassigned to on_level; the explicit JS on_level call is not an extra boundary effect. The proof is limited to assigned Earth/current level records and the tested nonempty map fixtures.

Twenty-four non-Earth targets and12 Earth controls: six nonempty floor/walled-room layouts × maze flag0/1, with different dungeon/same floor and same dungeon/different floor targets. Exact compiled C bound_digging/get_level_extends/on_level and upstream Earth macros match the real exported JS routines on all1680 wall_info bytes and four boundary coordinates. Earth controls leave all masks0; non-Earth cases set nondiggable8/nonpasswall16 at the expected boundaries.

Controls: Earth coordinates equal current coordinates, so the boundary operation leaves the entire map unrestricted. Non-Earth targets separately distinguish dnum and dlevel equality. Terrain remains unchanged in all cases. Typed GameMap/C-grid fixtures are explicit lower-level construction states, not full public loader, shipped recording or runtime proofs. Empty/all-STONE maps, unassigned/invalid level records, preexisting property flags, other layouts and runtime digging/phasing remain outside scope.

Clean-base reproduction:

1. Check out `929c5cf7c8755af07b98456c3f76b05f9434dccd` and initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Overlay this complete evidence directory at the same relative path.
3. Use Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no downloads/additional libraries.
4. Run `node diagnostics/divergence-evidence/levels/levels-bound-digging-earth-20261029/probe.mjs target`: expected exit0,24 cases.
5. Run `node diagnostics/divergence-evidence/levels/levels-bound-digging-earth-20261029/probe.mjs control`: expected exit0,12 Earth cases.
6. Run `node --test scripts/test-suites.test.mjs`.

The exact C macro chain calls on_level for assigned Earth records, just as the explicit JS expression does. The targets isolate each equality component; the controls prove the early return leaves all property masks0. Non-Earth cases compare the actual full-map boundary result and require cells with both property bits24. Six fixtures include interior floors, wall-ring rooms and opposite edge floors; no all-STONE map is passed to the C scanner.

This is exported boundary-routine evidence over matched valid map snapshots, not a shipped recording or full Lua API witness. C/JS source functions are pinned; the runner compares full arrays while saving compact hashes and bounds.

Limits: Twenty-four non-Earth targets and12 Earth controls: six explicit nonempty floor/walled-room maps, maze flag0/1, two mismatching current/Earth record relationships and one equal relationship. All1680 wall_info bytes plus xmin/ymin/xmax/ymax compare; terrain is unchanged. C executes exact bound_digging/get_level_extends/on_level with the upstream Is_earthlevel→Lcheck→Lassigned macro definitions. Typed struct/grid adapters provide the same fields as GameMap fixtures; these are lower-level valid construction snapshots, not independent full level generation or public Lua loader executions. All Earth records are assigned(2,1). Current records are(0,1),(2,2) or(2,1), separating dungeon and floor equality. Unassigned/missing/invalid topology records are not tested; no broad claim about JS nullable values or all macro users. Every map contains ROOM cells before the boundary scan. Empty/all-STONE maps are excluded, avoiding the known unqualified scan-boundary concern. Edge fixtures include playable x1/78 and y0/20; wall-ring fixtures retain interior ROOM. No invalid setup is counted as a negative. Starting wall_info is0. Existing properties, other metadata/aliases, arbitrary layouts, complete level finalization, runtime digging/phasing and hero state behavior are unreviewed. No runtime entity/object operations are invoked. This is one macro-expansion/delegation cause for bound_digging:on_level. The earlier wall-property eligibility proof is not expanded into a universal boundary/topology result. Cave cap-exit, three parked gaps, Main-owned candidates and all safety exclusions remain unchanged.

Original immutable run/projection verified by official exporter:one active→filtered key. JS functions unchanged from frozen scan base. Updated accounting:65 negative keys/29 causes,4 historical/candidate keys,8 stale,446 without disposition. Manual option-string and other candidates remain separate.

Prepublication source check: Main `2d4dd0537e2da96e9957b63ed5658da009f29b62` leaves the tested C gitlink/patches, JS mkmaze/dungeon/GameMap sources and package/projection tools unchanged. Execution receipts remain pinned to `929c5cf7c8755af07b98456c3f76b05f9434dccd`; this is not a claim of execution at the newer SHA.
