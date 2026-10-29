# Stair room selection: bounded candidate-array proof

The C temporary candidate-index allocation is represented by a JS array. The tested selector retains phase ordering, candidate indices and random-choice bounds; absence of alloc is not a missing selector operation.

Thirteen target choices across six regular-room configurations plus four controls compare exact C selector/eligibility/stair-membership functions to exact private JS selector extraction and actual exported eligibility with real dependencies. Strict ordinary-room, relaxed themed-room, occupied-room and fallback choices match selected index, random-call count and bound. Empty-room control returns null with no allocation or random call.

Controls: Three single-room controls cover ordinary, themed and occupied rooms; empty-room control avoids all draws. Every nonempty case consumes one legal shared-tape choice. This is component-level selection evidence, not full stair creation, RNG implementation, irregular membership, allocation failure or generation dispatch.

Clean-base reproduction:

1. Check out `eb3fc614b51f9bfe60313d7db27a9913e9565f97`; initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Overlay this entire evidence directory at its relative path.
3. Use Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here).
4. Run `node diagnostics/divergence-evidence/levels/levels-stair-room-selection-20261029/probe.mjs target`: exit0,13 comparisons.
5. Run `node diagnostics/divergence-evidence/levels/levels-stair-room-selection-20261029/probe.mjs control`: exit0,4 comparisons.
6. Run `node --test scripts/test-suites.test.mjs`.

Each fixture independently declares expected candidate indices. The runner compares selected room, RNG call count and draw bound; C temporary allocation is counted separately. Empty rooms return null before either allocation or RNG. Exact source checks guard the copied C functions and private JS selector extraction.

Limits: Thirteen target choices across six configurations and four controls, all regular rooms; one candidate-array allocation key/cause. No universal room-selector parity claim. C five exact functions execute with successful allocation. JS private selector body is extracted verbatim and bound to actual exported generate_stairs_room_good and its real stair-membership dependencies. This is a component proof, not a public Lua or full generation witness. One shared legal random choice per nonempty setup, no random choice for empty rooms. Independent RNG and seed exposure are unproved. Fixtures cover ordinary/themed/other room types, joined/unjoined rooms and existing up/down stair records; not irregular/subroom membership, malformed records or OOM. No stair construction, placement, topology/finalization or runtime claims. In particular generate_stairs:Is_botlevel remains unresolved; the candidate-list proof does not resolve that separate control-flow difference. Cave-cap and the three parked gaps remain unresolved. No denied work, install, gameplay edit or Main-owned repair is revisited.

A separate source-only bottom-level down-stair guard discrepancy is recorded in unresolved-followup.json. No supported ordinary-bottom production setup or runtime C/JS witness is established; its scanner key remains active, is not a ready candidate and is not part of this negative projection. Special-level base=-1 observations are not universal unreachability proof.

Official original-run projection validates one active→filtered key. Reviewed JS function bodies are unchanged from frozen scan base32578f23091dad34635a9b4fe0bfb45ed9840e39. Updated accounting:71 negative keys/32 causes,4 historical/candidate keys,8 stale,440 without disposition (including the source-only follow-up). Manual candidates remain separate.
