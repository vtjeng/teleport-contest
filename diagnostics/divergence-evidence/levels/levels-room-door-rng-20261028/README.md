# Room-wall door RNG: finite negative

JS create_door uses its injected random argument, defaulting to rn2 and supplied by the production des.door environment, in place of direct C rn2 calls.

48 public room-wall door cases in a fixed five-by-five room with open exterior: four walls, fixed/random position, two seeds, random/closed/secret states. Exact C create_door/rnddoor/okdoor/bydoor replay the production JS draw tape with requested bounds and full consumption checked; resulting door coordinates/type/five-bit mask agree. The C caller prelude reproduces the random-state discarded rnddoor draw. No independent RNG or arbitrary-room proof.

Control: 32 explicit closed/secret cases skip the random-state resolution draws while retaining random wall-choice retries and optional position draws;16 random-state targets match.

Clean-base reproduction:

1. Check out `27c8ae6e0fed4ae144a1a194541e5d6ce31a1036` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in this environment); no installation/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-room-door-rng-20261028/probe.mjs target` (expected0;16 comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-room-door-rng-20261028/probe.mjs control` (expected0;32 comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

Setup creates floor, then four walls through terrain(), then region(...contents) with asserted bounds11,5..15,9. The production door() call omits x/y and specifies wall/position/state, selecting its room-wall branch. C mirrors the valid map postconditions and exact door primitives. The random-state caller prelude deliberately executes the discarded rnddoor() call before create_door(), as lspo_door does. Each saved observation retains the actual production draw tape and matching C door fields. The secret pseudo-mask32 is assigned through a five-bit C flags field and yields the same stored0 as JS.

Limits: 48 cases only: room bounds11,5..15,9, all four five-cell walls and open exterior, positions-1/random or2, seeds28105401/28105402, closed/secret/random states. No arbitrary room geometry, blocked exterior, nearby doors, exhausted100-attempt search, invalid placement, finalization, linkage or runtime-door claim. Production JS startup, floor/wall terrain, region callback and des.door use the default RNG. C uses the asserted room/map postconditions, exact create_door/rnddoor/bydoor/okdoor bodies, fixed caller prelude and checked terrain-write adapter restricted to wall-to-door changes. Full C Lua parser/room allocation and set_levltyp side effects are not exercised. C rn2 consumes the production JS tape with bounds/range/full-consumption assertions. This proves coupled-input RNG order and writes for these fixtures, not independent ISAAC equivalence or all seeds. Earlier orientation/descriptor proofs excluded room-wall placement and are not broadened. Shipped exposure remains unknown.

Official exporter validation against the immutable original run verifies one active key becomes filtered. Source fingerprints remain current. No-binding inspection notes: get_table_int_or_random belongs to object construction; nhl_abs_coord currently has no nh table binding. Neither was forced into a witness or classified negative.

Latest frozen counts:32 negative keys/18 causes,3 candidate keys,8 stale,480 undisposed. Mazewalk publication is observed but final receipt remains unverified here; engraving is reported-ready and message accepted. Manual solidfill remains outside scanner counts. Three parked gaps unchanged.
