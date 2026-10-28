# Direct parameter-default ranking hint

Extends `default-import-delegation-v2` to direct calls through identifier
parameters defaulting to named relative imports. This is a -10 priority hint,
not suppression, status change, equivalence or reachability evidence. Factory
alias handling remains available. Unknown, reassigned, shadowed, destructured,
loop-assigned and otherwise ambiguous bindings receive no new hint. Overrides,
argument defects and call ordering remain unproved and visible.

Evidence motivating the extension: PR #89 at
`917f46bb47a3c3939283a4d50769f6bb09c0ed19`, specifically `rnd_rect:rn2` and
`check_room:rn2`. Their finite C/JS witnesses justify their existing exact
source-bound decisions, not a general RNG filter. The changed tool hash and
version invalidate affected scan provenance through the existing hub; this
change imports no decisions and does not revive the eight stale bindings.

From the repository root:

```sh
node diagnostics/reviews/default-parameter-ranking/measure.mjs
node --test scripts/delegation-ranking.test.mjs scripts/source-audit.test.mjs scripts/discovery-hub.test.mjs scripts/test-suites.test.mjs
```

The measurement reads only two pinned source files at scan base
`32578f23091dad34635a9b4fe0bfb45ed9840e39` and compares the accepted implementation
at `d1d8ac170b75dca71abe29819b5daa9972301221` with the working implementation.
It reports source/tool hashes and reasons. Missing Git objects fail the command.
On these same two inputs: old delegation hints **0**, new hints **2**, filtered
**0**, candidates retained **2**. No macro hint changes or corpus-wide count
claim; this is a bounded ranking evaluation, not another discovery scan or
runtime probe. No compute savings are claimed.

Regression controls retain incorrect RNG bounds/order as raw, unreviewed,
active warnings through the real audit and hub. Manual runner uses `.mjs`;
CI tests remain in `scripts/*.test.mjs`, with committed-tree preflight required
before publication.

Other assessed evidence: PR #93's non-hero wrapping and PR #86's paralysis
forwarding remain manual scoped negatives, without canonical suppression.
PR #95 command declarations and PR #68 object declarations are finite static
field audits, not runtime filters. No broader rule follows from those receipts.
