# Authored corridor: caller-scoped environment-helper negative

The extra JS environment helper is behind nxcor && !rn2(50). The tested explicit des.corridor→create_corridor path passes nxcor=false in both C/JS, so this helper is inactive in this caller domain. This is not a global dead-call or nxcor=true parity proof; keep that branch active for investigation.

Eight offset-room targets and eight straight-room controls: four source directions and two seeds at D:1, two valid authored five-by-five rooms with one facing door each. Actual public JS des.corridor and exact C create_corridor/search_door/dig_corridor/maybe_sdoor compare all1680 terrain cells and consume the same bounded RNG tape. Targets carve18/19 cells, controls3/13. C unexpected random-corridor/object/diagnostic paths assert if reached.

Controls: Straight aligned room endpoints exercise cardinal carving without turn-choice RNG. Offset endpoints require turns and RNG. C begins from asserted public JS room bounds/terrain, not an independently executed C room-building pipeline. Full metadata, room/door registration, independent RNG, secret corridors at deeper levels, random walls/rooms, nxcor=true, object creation and runtime remain outside scope.

Clean-base reproduction:

1. Check out `176bb0e38117602afab165ee6d4e363c11943fdb` and initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Overlay this complete evidence directory at the same relative path.
3. Use Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no downloads or extra libraries.
4. Run `node diagnostics/divergence-evidence/levels/levels-authored-corridor-carving-20261029/probe.mjs target`: expected exit0,eight offset cases.
5. Run `node diagnostics/divergence-evidence/levels/levels-authored-corridor-carving-20261029/probe.mjs control`: expected exit0,eight straight cases.
6. Run `node --test scripts/test-suites.test.mjs`.

The runner compares all1680 terrain cells and exact RNG consumption, outputting map hashes, changed-cell counts, room bounds and the small tape. Targets carve18 or19 cells with turn-choice RNG; straight controls carve3 or13 cells without random draws. This demonstrates real carving, not merely a call-name match. It does not establish independent generator parity: C consumes the valid public setup postconditions and shared random tape.

Invalidation: if create_corridor changes its false nxcor argument, or the environment-helper guard changes, this inactive-helper proof no longer applies. Other dig_corridor callers and nxcor=true must remain visible for investigation; do not import this as a global dead-call rule. Random-wall and bad-coordinate diagnostic leads are not reviewed here.

Limits: Caller-scoped inactive-helper proof only: explicit des.corridor with two valid five-by-five authored rooms, first facing door on each, four source directions, D:1, seeds24301/24302. Eight offset targets and eight aligned controls compare all1680 terrain cells. Both create_corridor bodies pass nxcor=false. The extra JS levelObjectEnv call is guarded by nxcor and therefore not evaluated in this path. nxcor=true remains unreviewed, not globally dead or equivalent; do not generalize this key decision beyond the pinned caller condition. C executes exact create_corridor, search_door, dig_corridor and maybe_sdoor. The C initial room bounds/terrain come from asserted public JS setup, not an independently executed C room/region pipeline. Known dimensions and valid doors are checked before carving. No Lua parsing or room/door registration equivalence claim. RNG replay checks every bound/value and total consumption against the JS-generated tape, including EOF. It is a coupled deterministic comparison, not an independent RNG implementation proof. Depth adapter is fixed1, so deeper-level secret-corridor RNG is outside scope. Unexpected C random-corridor generation, object creation, panic and impossible calls assert. No object construction/runtime is investigated or executed. No arbitrary internal JS mutation: setup uses level_init, terrain and region; operation uses public des.corridor. Only terrain types are compared. Other metadata, all seeds/layouts, full corridor reachability/geometry, level finalization, runtime traversal, random rooms/walls, invalid-input diagnostics and nxcor=true are not established. Existing search-door order proof is related but remains separate. Cave cap-exit and three parked gaps remain unresolved; no new divergence or Main-owned repair is duplicated.

Official exporter compares original immutable run and verifies one active→filtered key under the scoped decision. Updated accounting:64 negative keys/28 causes,4 historical/candidate keys,8 stale,447 without disposition. Manual candidates remain separate.
