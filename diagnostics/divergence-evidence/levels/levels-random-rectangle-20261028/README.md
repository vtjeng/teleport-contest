# Random free-rectangle choice: scoped negative

Case `levels-random-rectangle-20261028`. One scanner cause: the JS injected `random` parameter defaults to `rn2`; it does not omit the C random choice. Shipped exposure is not attributed.

Clean-base reproduction:

1. Check out Main `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be` and its C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without changing gameplay files.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment); no Lua or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-random-rectangle-20261028/probe.mjs target` (expected 0).
5. Run `node diagnostics/divergence-evidence/levels/levels-random-rectangle-20261028/probe.mjs control` (expected 0).
6. Run `node --test scripts/test-suites.test.mjs`.

Thirteen comparisons: initial singleton, one legal split, two legal splits, and removal of the initial rectangle to empty the pool. Counts are 1, 1, 2, 0. Enumerate every legal selected index (empty control requests no RNG) and test two default JS RNG seeds per state. Both implementations return equal rectangles without changing the count; empty uses zero draws and nonempty exactly one. Target covers the two split states (7 checks); control covers singleton/empty (6 checks).

C executes unchanged rect.c bodies with storage/type/allocation adapters and a checked RNG-result adapter. The JS default RNG draw is replayed into C for seeded checks. This proves neither independent RNG equivalence nor every geometry/seed, and does not extend the older rectangle-order proof to finalization. Related case: `levels-rect-order-20261028`.

Original immutable scan: run `ea2181cadbad5793b4be`, SHA `b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8`. Exact official projection verifies one active key becomes filtered. Source bytes for js/rect.js are unchanged from that scan base; eight unrelated stale reviews remain stale. The full run is preserved locally and need not be copied per case. Projection, manifest, final decision and receipts are included.

This batch adds one reviewed negative key. Reconciled frozen inventory: 571 raw, 523 permitted; cumulative 8 current negative keys + 1 candidate key + 8 stale bindings + 506 keys without a current disposition. The last group includes the separately unresolved numeric-string and gradient leads; no new broad scan occurred. Forty-four Main-owned overlaps remain routing notes, not exclusions.
