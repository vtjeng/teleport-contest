# Mazewalk preserves an intermediate door that C overwrites

Confirmed supported-API divergence, one cause with two targets. Shipped-level exposure is unknown.

The production C `lspo_mazewalk` calls `walkfrom`; the scanner's JS-only call edge prompted inspection but is not itself the defect. In `walkfrom`, C unconditionally assigns the intermediate square's terrain before advancing to the next maze cell. JS adds an `IS_DOOR` guard at that step and keeps a door.

Public setup uses solidfill floor, then `des.terrain(13,11,"+")` and `des.terrain(14,11," ")`. The default x origin makes these absolute (14,11) and (15,11). `des.mazewalk({x:11,y:11,dir:"east",typ:".",stocked:0})` starts carving at (13,11), with exactly one eligible destination at (15,11). Every coordinate is interior, the start/destination are odd, and the supported terrain API creates the intermediate door; no internal JS mutation is used. A second target uses `typ:"#"`. Equivalent Lua recipes are included as contract documentation, not as executed Lua receipts.

| Case | C terrain at x13,14,15 / y11 | JS terrain | RNG |
| --- | --- | --- | --- |
| Door, ROOM carving | 25,25,25 | 25,23,25 | rn2(1)=0 |
| Door, CORR carving | 24,24,24 | 24,23,24 | rn2(1)=0 |
| Floor controls | 25,25,25 / 24,24,24 | matches C | rn2(1)=0 |

Clean-base reproduction:

1. Check out `cc5a50e4e23b33f36a39ff8826a866bb7832caca` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout; no gameplay changes are needed.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No installation or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-mazewalk-intermediate-door-20261028/probe.mjs target`: expected exit1; prints both differing targets before reporting failure by exit status.
5. Run `node diagnostics/divergence-evidence/levels/levels-mazewalk-intermediate-door-20261028/probe.mjs control`: expected exit0; both floor controls match. After repair, the unchanged target command should exit0.
6. Run `node --test scripts/test-suites.test.mjs`.

Oracle scope: One intermediate-door overwrite cause, two carving terrain targets (ROOM and CORR), each with a floor control. No stocking, finalization, runtime door behavior, player commands or hidden-score claims. Shipped exposure unknown. C executes exact lspo_mazewalk, non-MICRO walkfrom and okay bodies with upstream direction macro. Fixed typed Lua-table adapters select east, stocked=0 and positive coordinates. Fixed coordinate adapter adds default x origin1. C starts from the public JS setup postconditions asserted before walking; no full C Lua parser or level-init/terrain execution is claimed. The C oracle is built without MICRO; both upstream implementations perform the same unconditional intermediate typ write. rn2 is checked to receive only1 and returns its only valid value0; JS uses production RNG and must log exactly rn2(1)=0. No general RNG equivalence claim.

The prior `levels-maze-deadends-20261028` proof covered its 16 stone-initialized maze fixtures; it did not cover a preexisting intermediate door. This does not invalidate its finite observations. The root cause here is separate from the map metadata, property reset and selection-frame candidates.

The official projection retains the frozen run identity, key, evidenceKey and reviewFingerprint, with original-run validation. The confirmed key remains active for Main pickup, not filtered as a negative. Updated inventory:24 negative keys/15 causes,2 candidate keys (one historical fully accepted, this one ready),8 stale bindings,489 without disposition. No rescan or stale-review promotion.
