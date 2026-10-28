# Random flip dispatch: bounded negative

JS random.rn2 defaults to the production rn2 helper; this C-only call edge is an interface alias.

Exact C flip_level_rnd dispatch body and public JS generation-mode flip_level_rnd agree across all nine flp 0..3/draw-bit combinations plus two default JS RNG seeds. C captures outgoing mask and draw count; JS exposes selected axes using one corridor marker on an otherwise empty full-floor map. No full C flip execution or independent RNG equivalence claim.

Control: All-zero choices across masks 0,1,2,3 leave the marker fixed; disabled axes consume no draws. Enabled axes each draw rn2(2) in vertical-then-horizontal order.

Clean-base reproduction:

1. Check out `4222eaf89f2cc3b1392273b70cc27b399418c691` and C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No installation or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-flip-dispatch-20261028/probe.mjs target` (expected 0, seven comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-flip-dispatch-20261028/probe.mjs control` (expected 0, four comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

The public startup/solidfill/terrain setup has no floor objects, monsters or traps; marker is absolute (11,7). With full-floor map extents the horizontal/vertical mirrors place it at x=69/y=13. The C oracle reports the dispatch mask, not a C-produced map; these coordinate expectations expose JS routing only. C checks each supplied draw bound/value and tape exhaustion. No entity/runtime or extras=true path is investigated.

Limits: Dispatch mask/draw order only; full C flip_level is replaced by a checked callback. One empty-level marker observation does not prove arbitrary map metadata, entities, regions, finalization or live-command behavior. extras is always false. Default RNG seed values are shared with C; not independent RNG equivalence.

Official compact projection verifies 1 active key → 1 filtered on original run ea2181cadbad5793b4be (SHA b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8). Specific JS dispatch function is unchanged from scan base. Shipped exposure is unestablished.

Frozen accounting after the dispatch/alignment batch: 571 raw / 523 permitted; 19 current negative keys, 1 historical candidate key now routed as accepted, 8 stale bindings, 495 without disposition. The routing receipt for the level-message case records accepted Main 4222eaf89 without changing its original receipts or inflating discovery counts. Numeric-string, gradient and state-export gaps remain unresolved.
