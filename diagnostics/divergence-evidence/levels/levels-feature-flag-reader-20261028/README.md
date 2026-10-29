# Feature optional-boolean reachability: bounded negative

Through this optional reader with default -2, the val == -1 RNG branch cannot be reached by a successful public feature argument read.

get_table_boolean_opt returns -2 for absent fields or calls get_table_boolean. Successful boolean/integer reads return 0/1, recognized strings return option index 0..3; all other reads raise a nonreturning Lua error. None returns -1. Exact C reader and flag-helper bodies plus 27 public JS initializations (fountain/throne/tree × nine valid representations) confirm mask writes and zero draws. This is a reader-local reachability proof, not universal boolean or runtime feature equivalence.

Control: Boolean true/false controls demonstrate the feature flag write path executes. Absent, numeric 0/1 and four recognized strings are targets. No forced internal -1 injection is used.

Clean-base reproduction:

1. Check out `4222eaf89f2cc3b1392273b70cc27b399418c691` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No Lua runtime, installation or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-feature-flag-reader-20261028/probe.mjs target` (expected 0; 21 comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-feature-flag-reader-20261028/probe.mjs control` (expected 0; six comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

Fresh features have zero initial flags. The exact C helper is fed by exact C get_table_boolean[_opt], with typed field/option adapters for absent, booleans, numeric 0/1, and strings true/false/yes/no. The test preserves current string option-index semantics rather than assuming English truth values. C rn2 is an aborting adapter, proving none of the tested valid reads invokes it. Source proof covers the remaining read outcomes: failures cannot return -1. No forced internal -1 state was used.

Limits: Fresh fountain/throne/tree initialization only, nine valid optional-value forms. No arbitrary preexisting metadata, other feature flags, or runtime behavior proof. Fixed typed Lua field adapters implement tested input types/options; no Lua interpreter. Unreachable claim is confined to this helper call through get_table_boolean_opt with default -2; no generic suppression of other RNG branches. Shipped exposure remains unestablished.

Official compact projection verifies 1 active keys become filtered against original immutable run ea2181cadbad5793b4be / SHA b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8. Exact scanner identities/fingerprints and final decisions included; no rescan or stale review revival.

Combined batch accounting: 22 current negative keys across 13 cases/causes, 1 historical candidate now fully accepted with explicit final receipt provenance, 8 stale bindings, 492 without disposition (523 permitted / 571 raw). Parked numeric-string, gradient and state-export gaps remain unresolved.
