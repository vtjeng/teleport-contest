# Altar alignment conversion: bounded negative

JS alignment helper delegates to injected rn2 through fillEnvironment. It explicitly preserves repeated evaluation of C Align2amask(noncoalignment(...)); these edges are not omitted or extra alignment draws in the tested altar path.

12 comparisons: lawful Knight, neutral Tourist, chaotic Barbarian × two seeds × coaligned/noncoaligned public altar initialization. Exact C noncoalignment/sp_amask_to_amask plus unchanged Align2amask macro match stored JS altar masks and shared draw-tape consumption. Noncoaligned uses two or three draws; coaligned uses none. Mask 3 in one sequence is a demonstrated matching C macro result, not independently corrected behavior.

Control: Coaligned requests for all three alignments consume zero draws; target covers two- and three-draw noncoaligned sequences. No priests are constructed.

Clean-base reproduction:

1. Check out `4222eaf89f2cc3b1392273b70cc27b399418c691` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No install or Lua runtime dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-altar-alignment-rng-20261028/probe.mjs target` (expected 0; six comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-altar-alignment-rng-20261028/probe.mjs control` (expected 0; six comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

Each JS fixture starts a valid female human Knight/lawful, Tourist/neutral or Barbarian/chaotic character, uses solidfill and public des.altar with explicit coordinates, and asserts original alignment, altar terrain, and absence of priests. C starts from that asserted original alignment and runs exact noncoalignment/sp_amask_to_amask with the unmodified Align2amask macro. The random-only branch is an aborting unused adapter. This is two scanner edges for one conversion/delegation cause, not two independent discoveries.

Limits: Only coaligned/noncoaligned altar mask initialization for three valid original alignments and two seeds. No random/explicit mask, priest/shrine, monster or runtime alignment claims. Exact C converter and macro execute; full C Lua/altar allocation path does not. C replays checked JS draws; no independent RNG equivalence or all-seed claim.

Original-run compact projection verifies 2 active keys → 2 filtered for run ea2181cadbad5793b4be, SHA b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8. Both JS converter bodies are unchanged from that scan base. Shipped exposure remains unestablished.

Combined dispatch/alignment batch accounting: 19 current negative keys, 1 historical candidate key routed as accepted, 8 stale bindings, 495 without disposition (523 permitted / 571 raw). Numeric-string, gradient and state-export gaps remain unresolved. The level-message acceptance routing update does not create a discovery or refresh any unrelated stale review.
