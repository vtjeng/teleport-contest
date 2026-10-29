# Room-feature position search: bounded delegation proof

The JS environment and hook calls retain the C search-loop delegation to somexyspace and bydoor. They do not omit the sampler or door predicate in the tested production environment contract.

Exact C find_okay_roompos, somexyspace, somexy, somex, somey, inside_room, occupied and bydoor match exported JS find_okay_roompos and somexyspace with exact source-extracted private JS bydoor. Forty-eight targets cover four cardinal door positions, ordinary/secret doors and first success at attempts 1, 2, 50, 199, 200 or 201. Eight controls cover no-door immediate acceptance and sampler failure after 101 occupied candidates. Return values, retained coordinates and shared-tape consumption match. JS hook counters confirm the 200-attempt boundary and bydoor short circuit.

Controls: Four no-door controls accept the first coordinate with two draws. Four all-FOUNTAIN room controls return false after 202 draws inside the first sampler call and never invoke bydoor. These are matched rectangular construction snapshots with no traps, fluids, invocation square, subrooms or irregularity; C nonapplicable occupancy dependencies return false. No feature placement, independent RNG, full generation or runtime claim.

Clean-base reproduction:

1. Check out `2d4dd0537e2da96e9957b63ed5658da009f29b62`; initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Overlay this entire evidence directory at its relative path.
3. Use Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in this environment).
4. Run `node diagnostics/divergence-evidence/levels/levels-feature-position-search-20261029/probe.mjs target`: exit0,48 comparisons.
5. Run `node diagnostics/divergence-evidence/levels/levels-feature-position-search-20261029/probe.mjs control`: exit0,8 comparisons.
6. Run `node --test scripts/test-suites.test.mjs`.

The production caller in fill_ordinary_room supplies hooks {bydoor, somexyspace}; roomFeatureEnv preserves them and roomHook dispatches them. This runner calls the exported search/sampler with that interface. Since bydoor is private, its exact source body is extracted with a hash guard and bound to the same state. No modified gameplay module or Lua interpreter is used. C bodies are included verbatim and checked at runtime against the pinned source.

Targets use a door at one of four room boundaries, repeatedly draw the adjacent floor cell, then draw the center on attempt 1,2,50,199,200 or201. Attempt201 is never evaluated; the prior coordinate is retained after 200 failed door checks. Controls remove the door or fill the room with fountains; the latter stops inside the first coordinate sampler.

Limits: One cause and four scanner keys, not four behavior discoveries. Finite 48-target/8-control domain; six first-success positions, four cardinal doors and two door types. No universal RNG or layout parity claim. Exact C sampler/search/predicate bodies run over a 5x5 regular room with no subrooms. JS exported search and sampler run directly; the private bydoor body is extracted verbatim and injected through the production hooks interface with the matched state. This is a component-delegation proof, not full public Lua binding or loader execution. Shared deterministic legal rn1/rn2 draw values drive both engines; independent RNG streams and seed reachability are not established. C trap/fluid/invocation adapters represent their absence in these fixtures, not those implementations. No monster/object/runtime behavior executes. No-door controls prove immediate acceptance; all-FOUNTAIN controls prove somexyspace failure after 101 rejected draws and short-circuit before bydoor. Such terrain is a valid construction snapshot, not a claim that ordinary room generation emits it. All candidate coordinates are within room bounds. Room geometry generation, irregular rooms, subroom exclusion, feature placement/counters, full finalization, malformed hooks, diagnostics, mixed frames and runtime are outside scope. Existing coordinate-retry proofs are not enlarged beyond these composed search paths. Three parked gaps and cave-cap remain unresolved. Previously denied work is excluded. Main owns all candidate repairs.

The official projection exporter verifies original run identity, exact review fingerprints and four active→filtered transitions. All reviewed JS function bodies are unchanged from scan base32578f23091dad34635a9b4fe0bfb45ed9840e39. Updated inventory:69 negative keys/30 causes,4 historical/candidate keys,8 stale,442 without disposition. Manual candidates remain separate.
