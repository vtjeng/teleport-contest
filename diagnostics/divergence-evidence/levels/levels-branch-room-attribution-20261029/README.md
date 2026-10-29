# Discarded branch-room attribution

144 exact-C/production-JS explicit-coordinate cases: no rooms, regular interior, irregular interior, irregular edge ×ROOM/CORR/AIR ×both endpoints ×BR_STAIR/BR_NO_END1/BR_NO_END2 ×both directions. C lookup returns room in72 cases and null in72. All agree on made_branch, resulting terrain/direction and stair-list position/destination/traversed truth value;96 construct stairs and48 intentionally lack the current endpoint. 288 controls exercise made_branch and null-branch early returns, with no stairs.

One scoped explained-negative cause covers one frozen scanner key. The explicit-coordinate branch calls pos_to_room only for a discarded return. Its inside_room traversal has no side effects, so omitting this attribution does not change branch construction in the tested domain.

Base `2cb9a55c12a2bbee4403ca48ed22f46522076eeb`; C `16ff59115315917b93185d026aeefea06db9b0f4`. Discovered/reviewed 2026-10-29T04:22:34.240270+00:00. From an existing clean checkout of this base with pinned C, overlay this complete directory and run:

```sh
node diagnostics/divergence-evidence/levels/levels-branch-room-attribution-20261029/probe.mjs target
node diagnostics/divergence-evidence/levels/levels-branch-room-attribution-20261029/probe.mjs control
```

Both exit0. Tested Node24.19.0,Clang19.1.7 (3+b1),C11,-O2; activate existing compiler with `source /workspace/.setup/activate.sh` here. No new dependency or download. Exact C bodies and source hashes are checked. Compact observations/receipts and official projection retain original run identity without copying the complete run. Six layout tests and committed v1 validator run before publication.

Explicit coordinates12,8 on three permitted terrain typesROOM/CORR/AIR. Four attribution states:no rooms,regular room interior,irregular room interior andirregular edge. Exact C inside_room distinguishes the last two; missing attribution is not treated as universal room equivalence.

Both branch endpoints, both end1_up directions andBR_STAIR/BR_NO_END1/BR_NO_END2. 96 targets create stairs and48 intentionally omit the current endpoint. Existing made_branch and null-branch controls return without stairs. All144 targets and288 controls match on semantic stair registration/terrain/direction andmade_branch.

The returned C pointer is discarded; inside_room andpos_to_room only read room records androomno/edge. Source dependency changes to either helper or the caller require requalification. The JS caller body remains identical to frozen scan base.

C exact place_branch/stairway_add/on_level/set_levltyp operate on valid typed descriptors, maps and room records; JS uses production exported place_branch andGameMap. No full C/JS dungeon initialization or public Lua binding comparison. Fixtures use explicit coordinates, so find_branch_room aborts if called; portal constructor and runtime side effects also abort.

No random branch selection,debug_fuzzer/portal behavior,full travel,arbitrary terrain or metadata alias claim. C u_traversed0 is compared to Boolean(JS u_traversed), matching the consuming truth-value contract; raw absent-property representation is not a divergence.

The potential forced overwrite of existing stairs/ladders is not qualified: normal level-region bad_location rejects those terrain types. This test does not force that invalid caller state. Existing random no-room branch scope/gaps remain unchanged.
