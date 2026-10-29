# Room obstruction: bounded constructor negative

```sh
source /workspace/.setup/activate.sh # if present
node diagnostics/divergence-evidence/levels/levels-room-obstruction-20261028/probe.mjs observe
node diagnostics/divergence-evidence/levels/levels-room-obstruction-20261028/probe.mjs target
node diagnostics/divergence-evidence/levels/levels-room-obstruction-20261028/probe.mjs control
```

All commands exit **0** on Main `d1d8ac170`. Node and Clang required; the runner builds and removes a private temporary oracle executable. It is not registered in default CI.

The frozen `check_room:rn2` edge is an injected call: JS `random` defaults to `rn2` and production room construction uses that default. Six public des.room fixtures compare acceptance, constructor bounds and every RNG bound/value consumption against exact C. Two seeds each cover an empty stone map, a northwest floor obstruction, and a central floor obstruction. The public setup asserts the initial full-map free rectangle and uses des.terrain to place the obstacle. Chance 0, lit 0, explicit size/position/alignment and filled 0 isolate obstruction handling.

The empty control creates (17,5)-(24,10) with no draws. The northwest obstacle at (14,2) shifts the handoff to (19,6)-(26,11). The central obstacle at (20,8) creates no room and consumes all 101 retry draws. Both languages preserve these behaviors.

The oracle contains unchanged C check_room, create_room and get_rect bodies. Its one initial free rectangle matches the independently asserted production setup. add_room captures the handoff; split_rects asserts its valid arguments but is not executed, because no subsequent room is requested. Random branches outside these fixed inputs abort. RNG uses the JS-generated valid draw tape with bound/value/exhaustion checks, not an independent ISAAC implementation.

This proof is limited to six constructor acceptance/parameter cases. It does not establish C room allocation, allocator mutation, terrain carving/topology, repeated room placement, all seeds or finalization. It is separate from subroom placement and the parked orig_rtype/state-export question.

The v1 case declares hashed dependencies and actual target/control receipts. Scanner origin remains frozen run `ea2181cadbad5793b4be` at `32578f230`; source functions are unchanged at the tested base. The compact projection preserves exact review identity and validates one active warning becoming one filtered warning. No rescan or stale-review import occurred. Packaging validation uses tooling pinned at `d1d8ac170` and does not certify semantic acceptance.
