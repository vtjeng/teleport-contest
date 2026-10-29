# Door list growth and insertion: bounded negative

C alloc_doors reserves and copies capacity; JavaScript dynamic-array insertion preserves the tested logical door list and per-room slices without that allocation helper. Capacity itself is not an observable parity claim.

Twelve targets (two boundary-door densities, ordinary/secret types, three interleaved registration sequences) and three empty-map controls compare eight stages each. Exact C alloc_doors/add_door/inside_room/maybe_add_door/add_doors_to_room match actual exported JS add_doors_to_room. Each target reaches 72 or162 logical entries, crossing four or nine allocation increments of20, while every individual room doorct remains0..127. All logical coordinates, room fdoor/doorct pairs and total counts match; repeat calls are idempotent.

Controls: Three no-door controls retain empty arrays and zero counts with no C allocations. Targets repeat earlier roots/subrooms after registration and assert no logical change. Three regular root rooms and one regular subroom provide real interleaved slice shifts; source-pinned comparison excludes irregular/shared-neighbor branches, allocation failure, byte overflow, full generation/finalization and runtime doors.

Clean-base reproduction:

1. Check out `eb3fc614b51f9bfe60313d7db27a9913e9565f97`; initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Overlay this complete evidence directory at its relative path.
3. Use Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here).
4. Run `node diagnostics/divergence-evidence/levels/levels-door-list-growth-20261029/probe.mjs target`: exit0,12 sequences/96 stages.
5. Run `node diagnostics/divergence-evidence/levels/levels-door-list-growth-20261029/probe.mjs control`: exit0,3 sequences/24 stages.
6. Run `node --test scripts/test-suites.test.mjs`.

The runner constructs three regular rooms and one contained regular subroom, paints boundary doors and calls actual exported add_doors_to_room in three orders. Parent registration recurses into the subroom; subsequent calls interleave earlier and later slices. C source bodies are copied verbatim and checked against source hashes. Each stage compares the complete logical door list and all fdoor/doorct pairs; compact output hashes preserve observation identity. No private JS helper is extracted or invoked directly.

Limits: One key and one capacity-delegation cause, bounded to12 target sequences and3 controls with8 stages each. Three regular root rooms and one regular nested subroom; two door densities and DOOR/SDOOR types. No universal layout or allocation equivalence claim. Exact C alloc_doors/add_door/inside_room/maybe_add_door/add_doors_to_room execute with successful malloc and matching typed fields. doorct/nsubrooms retain signed-char widths and every per-room count is asserted0..127; no overflow experiment. C capacity20 increments are observed separately, not compared to JS array capacity. JS actual exported add_doors_to_room runs through private maybe_add_door/add_door unchanged. Matching GameMap/room records are explicit regular construction snapshots. This is not independent C/JS room geometry generation, Lua callbacks or complete loader attribution. All candidate cells lie in each visited room expanded rectangle; regular inside_room short-circuits irregular/shared-neighbor logic. C shared_with_room aborts if unexpectedly reached. No irregular rooms, invalid/edge coordinates, subroom room-number tagging or orig_rtype claim. Compare logical door coordinates, count and all four room fdoor/doorct slices after each stage. Repeated registrations are idempotent. Unused C allocated slots, allocation failure/OOM, door state/orientation, topology reachability, finalization and runtime entities are unreviewed. Three parked gaps and cave-cap remain unresolved. All excluded investigations remain excluded; no gameplay edits or new repair candidate.

Official exporter validates one active→filtered key from the original immutable run. Reviewed JS bodies are unchanged from scan base32578f23091dad34635a9b4fe0bfb45ed9840e39. Updated accounting:70 negative keys/31 causes,4 historical/candidate keys,8 stale,441 without disposition. Manual candidates remain separate.
