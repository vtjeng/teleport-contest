# Reset registration lists: bounded logical cleanup proof

Replacing GameMap and nulling stair/exclusion heads provides the tested logical cleanup performed by three explicit C cleanup calls. This is not a claim about JS garbage collection or all clear-level state.

Twenty-one populated cases (seven nonempty combinations of region/stair/exclusion registrations × counts1,2,5) and three empty controls compare two resets each. Actual public JS level_init/gas_cloud/ladder/exclusion/reset_level APIs match exact compiled C reset/clear and region/stair/exclusion free functions on zero region count/capacity, no active region array entries and null stair/exclusion heads. Both resets match in all48 stages.

Controls: Three empty cases perform two resets without acquiring resources. Populated setups assert every requested list count before reset; second reset verifies idempotent empty state. Gas clouds have damage0,ttl10, no monsters and no turns advanced. C uses valid allocated metadata fixtures and successful allocation, not independent constructor or full pre-reset behavior.

Clean-base reproduction:

1. Check out `89b8b37ad4ea952f25d2c8059411f21b2688f91c`; initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Overlay this complete evidence directory at its relative path.
3. Use Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here).
4. Run `node diagnostics/divergence-evidence/levels/levels-reset-registration-lists-20261029/probe.mjs target`: exit0,21 cases/42 resets.
5. Run `node diagnostics/divergence-evidence/levels/levels-reset-registration-lists-20261029/probe.mjs control`: exit0,3 cases/6 resets.
6. Run `node --test scripts/test-suites.test.mjs`.

Public setup registers count1,2,5 clouds, down ladders and/or teleport exclusions in seven combinations. Before reset the runner asserts each actual list length. Two public resets then compare logical list emptiness and region capacity to compiled C. C source bodies are exact and source-pinned; the metadata fixtures own allocations consumed by the real cleanup functions. No copied private JS function or new Lua runtime is used.

Limits: Three scanner edges grouped as one logical list-reset delegation cause. Twenty-one populated cases and three empty controls, two resets each. Counts1,2,5 and all seven nonempty combinations are finite coverage, not a universal reset proof. JS executes supported public special-loader level_init, gas_cloud, ladder, exclusion and reset_level APIs; no private JS extraction or mutation of resource heads. Initial list lengths are asserted. C exact reset/clear and all three cleanup routines plus free_region execute over owned, valid allocated metadata. C fixture construction is a typed allocation adapter, not independent C descriptor constructors. C region records own a rect allocation; messages and monster arrays are null. Stair/exclusion records carry only fields used by cleanup. Geometry/metadata content is not compared. Absent-resource reset preparation and unrelated helpers are adapters; only final logical cleanup is proven. C malloc/free success is assumed; no OOM, allocator-size, resource ownership outside the fixture or JS GC/reclamation timing claim. Region comparison maps C count/capacity/null array to JS empty active list/capacity0; this is logical absence, not pointer representation equality. Stair/exclusion linked heads are null after both resets. Other resource types, flags, frames, topology and reset effects are not included. Gas clouds are created with damage0 and ttl10 on empty construction levels; no turns advance and no monsters are present. No cloud damage, aging, enter/leave callbacks, runtime stair traversal or exclusion enforcement is tested. The separately Main-owned reset hellish-temperature candidate is neither fixed nor negated. This proof uses non-hellish D1 only. Cave-cap, bottom-level stair search and three parked gaps remain unresolved; all denied investigations stay excluded.

The official projection exporter verifies the original immutable run and exactly three active→filtered transitions. Reviewed JS bodies are unchanged from scan base32578f23091dad34635a9b4fe0bfb45ed9840e39. Updated accounting:74 negative keys/33 causes,5 historical/candidate keys,8 stale,436 without disposition. Manual candidates and unresolved gaps remain separate.
