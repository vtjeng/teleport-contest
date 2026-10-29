# finddpos diagnostic: caller-restricted negative

The missing illegal-direction diagnostic is unreachable from the pinned repository finddpos callers:all10 calls in C and corresponding JS pass a cardinal DIR_N/E/S/W constant. This reviews the diagnostic only, not placement/search equivalence.

The portable runner hash-verifies current C/JS mklev sources, checks every finddpos identifier/reference after removing comments/strings, verifies10 calls with matching direction sequence and checks tracked C/header references occur only in src/mklev.c. Exact C finddpos executes all4 cardinal values with no diagnostic. Its default arm is bypassed before room search; a first-success shift adapter isolates that control flow.

Control: Eight explicit noncardinal integer controls (-1,1,3,5,7,8,9,10) each trigger the exact illegal-direction diagnostic once, return false, leave output coordinates unchanged and make no RNG/shift call. These counterfactual calls are oracle-positive controls, not reachable gameplay setups or divergence candidates. Source scope excludes external/instrumented callers, configuration changes and memory corruption.

The static direction switch runs before the shift/search loops. Every production call argument is one of the four switch cases, so the default diagnostic cannot be reached from those callers, independent of which room is searched. This source proof supplies reachability evidence; the test does not infer unreachability from sampled room layouts. The counterfactual controls confirm that the diagnostic still exists and fires when the contract is violated.

Clean-base reproduction:

1. Check out `e2cd8ea2fa298c9b3a7c062c70d21999b91f06fc`, with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout.
3. Use existing Node24.19.0, git and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no new dependencies.
4. Run `node diagnostics/divergence-evidence/levels/levels-finddpos-direction-20261028/probe.mjs target` (exit0:source closure and4 cardinal values).
5. Run `node diagnostics/divergence-evidence/levels/levels-finddpos-direction-20261028/probe.mjs control` (exit0:source closure and8 diagnostic-positive controls).
6. Run `node --test scripts/test-suites.test.mjs`.

Source file hashes in caller-contract.json deliberately invalidate the witness if the pinned files change. The source files are supplied by the stated repository/C gitlink, not external downloads. The fixed oracle contains the exact function and enum bodies; other source/configuration assumptions are explicit.

Limits: Unreachable only from the pinned repository C/JS call sites. External callers, instrumented calls, memory corruption, changed configuration/visibility and future source changes are excluded. No general suppression of illegal-direction diagnostics. The source audit strips comments/string literals, verifies all identifier occurrences and each fixed call argument, and rejects changed source hashes. It also checks tracked C/header references for the symbol. This is a source closure proof, not an assumption that a small random sample failed to reach the diagnostic. Exact C finddpos uses deterministic rn1 and first-success finddpos_shift adapters to isolate switch dispatch. No room geometry, irregular-room search, retry/fallback order, RNG generator, corridor placement or runtime parity claim. Invalid-direction controls deliberately bypass production callers only to establish that the oracle catches the diagnostic; they are not classified as supported gameplay setups or divergences. JS runtime calls are not forced through a private export.

Official projection export verifies2 active keys become filtered against the original frozen run. Two keys represent one caller-direction cause. Inventory:48 negative keys/22 causes,4 historical/candidate keys,8 stale,463 without disposition. The new map-prefix candidate remains Main-owned; three parked gaps unchanged.
