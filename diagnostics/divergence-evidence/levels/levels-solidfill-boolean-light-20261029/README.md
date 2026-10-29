# Solidfill boolean-string light storage

Candidate: one API cause, three terrain targets. Manual/unbound. Discovered and reviewed 2026-10-29T04:06:10.750674+00:00.
JS base `f3e2e6d638383a5f77f153057d0af6684ca64cfb`; C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`. Tooling/validator base is the same JS SHA.

`des.level_init({style:'solidfill',fg:'.',lit:'yes'})` is accepted by both production APIs. C's exact boolean reader recognizes `yes` and returns its option index 2, which `lspo_level_init` passes through `splev_initlev` and `lvlfill_solid`. `set_levltyp_lit` assigns 2 to `struct rm.lit`, an unsigned one-bit field: stored value 0. JS's corresponding setter uses `Boolean(lit)`, storing true. Floor, corridor and ice targets each disagree on all 1,617 filled cells (x=2..78, y=0..20). This is one cause, not three repairs.

All 29 storage controls match: the other seven admitted values (`"true"`, `"false"`, `"no"`, false, true, 0, 1) on each terrain, plus all eight values on lava. C's surprising string indices are preserved: true→0, false→1, yes→2, no→3. Changing the reader to conventional truth meanings would break these controls. Lava remains lit by its explicit override.

## Reproduce from the pinned clean base

1. Use an existing isolated checkout at `f3e2e6d638383a5f77f153057d0af6684ca64cfb` and initialize its pinned C submodule (no newer C source).
2. Copy only this evidence directory from this PR into that checkout at the same relative path. No sibling evidence dependency is required.
3. From the checkout root, activate the existing compiler if necessary: `source /workspace/.setup/activate.sh`. Tested Node 24.19.0, Clang 19.1.7 (3+b1), Linux, C11, `-O2`. No installs or network downloads.
4. Run `node diagnostics/divergence-evidence/levels/levels-solidfill-boolean-light-20261029/probe.mjs target`. Expected pre-fix exit **1**, three target failures, 4,851 differing cells. Saved target receipt/output contain the actual run.
5. Run `node diagnostics/divergence-evidence/levels/levels-solidfill-boolean-light-20261029/probe.mjs control`. Expected exit **0**, 29 controls, zero differing cells.
6. After a gameplay repair, rerun both commands expecting exit **0**. The runner enforces pinned C hashes and exact C function bodies but permits changed JS; old JS hashes remain provenance.

## Oracle and supported-input contract

The oracle executes the exact registered C API handler `lspo_level_init`, its exact argument readers, level-init dispatcher, solid-fill loop and terrain setters. A tiny typed Lua table facade supplies only ordinary string/boolean/integer/nil values, with the actual Lua 5.4.8 `luaL_checkoption` function included and licensed here. It does not substitute a hard-coded boolean index. The facade has no parser, script engine, metatables or callbacks. Unsupported callbacks abort. `lua-string-contract.txt` pins upstream matcher provenance; no Lua library is required at runtime.

The exact `lev_init` and `struct rm` declarations and terrain enum are retained. C config.h enables BITFIELDS; global.h maps Bitfield to unsigned bitfields. `lit` width is 1; this difference does not depend on signed-char wrapping. Both `EXTRA_SANITY_CHECKS` configurations are compiled and their entire cell results compared. The checked config enables extra sanity checks for development builds. With them, the accepted string's index 2 produces 1,617 impossible calls before assignment (also index 3, and lava index 2/3 before its override). The oracle captures these calls and returns; ordinary nonnested, non-panic-fuzzer `impossible` returns in C pline.c. This is a storage witness, **not a diagnostic delivery/UI parity claim**. Diagnostic interaction and reporting are not run.

Fresh zeroed STONE map, normal maze bounds, no rooms, traps, actors, objects or timers. Other initialization branches and all runtime side-effect hooks abort if reached. C RNG aborts if called; these admitted values require no draws. JS invokes the public loader through normal startup and `mklev`, then captures state and stops before finalization. No internal-only JS invocation or invented light value is used.

This supplies a supported C caller for the two prior light-diagnostic reachability gaps in `levels-location-lighting-contracts-20261029`, but does not resolve those scanner claims: their full diagnostic comparison remains unexecuted. No scanner key is reassigned to this different storage cause. Existing finite -2/-1/0/1 lighting proofs remain valid within their domain. No shipped-route or score-impact claim, no broader boolean-storage or arbitrary level-finalization claim. All parked prerequisites remain parked.

Prepublication checks: target/control from reused clean comparison checkout with gameplay tree pinned to the stated base; six test-layout guard checks; v1 packaging and committed-layout check. These checks are not gameplay acceptance.
