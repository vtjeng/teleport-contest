# Coder guards: scoped initialization delegation

For normal successful special-level loading, C create_des_coder precedes load_lua and each selected API guard is then a no-op. JS creates the coder once before registering the public des API and shares that environment. Six missing direct guard edges are one initialization-delegation cause, not missing initialization.

Source hashes/order checks pin C load_special and six guards, plus JS constructor initialization before API registration. Exact C create_des_coder runs6 times with an initialized coder:0 initializer calls and unchanged pointer/marker. Production JS level_flags,level_init,terrain,wall_property,exclusion,teleport_region sequence preserves deliberately set rndmongen0/deathdrops0/temperature-1 after every call.

Control: C null-coder control invokes an initializer-interface adapter once and retains its pointer on repeat. Two fresh JS loader controls each observe default rndmongen1/deathdrops1/temperature0. Adapter tests guard dispatch, not C allocation or initializer contents. Scope excludes resets, finalization/reentrancy, failed allocation, direct private env injection, other APIs and general metadata equivalence.

The source argument is specific:load_special calls create_des_coder before load_lua, and the selected functions do not reset/release that coder in this no-callback sequence. Their repeated guards therefore cannot reinitialize it. JS createSpecialLevelApi creates its coder before registering methods and shares it via env. The proof is not based solely on absent call names or matching seed output.

Clean-base reproduction:

1. Check out `2f80ba5210a57819a2aaa8dbf5b8c88618b85242`, with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no installation/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-coder-guard-delegation-20261029/probe.mjs target` (exit0:source checks,C six no-op guards,JS six-method sequence).
5. Run `node diagnostics/divergence-evidence/levels/levels-coder-guard-delegation-20261029/probe.mjs control` (exit0:C null/repeat dispatch plus two fresh JS loaders).
6. Run `node --test scripts/test-suites.test.mjs`.

The JS sequence sets nomongen,nodeathdrops,cold through level_flags, then calls solidfill level_init, terrain, wall_property, exclusion and teleport_region. Each snapshot retains[0,0,-1]. Fresh loaders show[1,1,0]. The C dispatch counter is intentionally separate from those JS state snapshots; no claim is made that the compiled guard adapter executes the full C API methods or their initializers.

Limits: Normal successful special-level load with an initialized coder, the six listed methods and no reset/finalize/reentrant callback. No blanket suppression of all create_des_coder edges, other loaders or direct private environment injection. C oracle executes the exact guard only. Its initializer-interface adapter returns a sentinel and counts calls; this proves conditional dispatch, not C allocator correctness, full coder initialization contents or C execution of each API body. The source loader ordering supplies the initialized-pointer precondition. JS executes the production loader/API path. Target observes rndmongen/deathdrops/temperature across six calls; controls observe these defaults in two fresh loaders. No broad state, terrain, region enforcement, RNG, callback or finalization equivalence claim. C guard preserves an existing pointer/marker across six calls and invokes the adapter once for null on control. Successful allocation/nonreturning failure contract is assumed; OOM/error-handling parity is excluded. Whole-file source hashes deliberately invalidate the runner on changed sources; selected wrapper hashes match the frozen scanner base. The map guard key stays unreviewed because of its separate JS attribution gap. Three parked gaps are untouched.

Official exporter verifies6 active keys become filtered against the original immutable run. Six keys represent one scoped lifecycle/delegation cause. Counts:54 negative keys/23 causes,4 historical/candidate keys,8 stale,457 without disposition. Manual candidates remain separate and Main-owned. Three parked gaps unchanged. No-yield inspections of water/bubble setup, wall topology and other helpers are not classified as negatives or counted.
