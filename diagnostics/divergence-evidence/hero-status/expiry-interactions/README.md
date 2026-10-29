# Ordinary hero status expiry interactions

Bounded result: **one explained-negative scope**, 19 interaction fixtures, zero
confirmed semantic causes, zero scanner keys. This is not a whole-function
certification. The six existing single-property controls also pass; they are
controls, not new coverage. No gameplay code changed.

## Reproduce

From the repository root at JS base
`176bb0e38117602afab165ee6d4e363c11943fdb`, with its existing patched C recorder
and upstream gitlink `16ff59115315917b93185d026aeefea06db9b0f4`:

```
node scripts/run-hero-timeouts.mjs
node diagnostics/divergence-evidence/hero-status/expiry-interactions/run.mjs /tmp/hero-status-new-run
```

Both expect exit 0. Use an unused output directory; the differential deliberately
refuses to overwrite an earlier case. No installation or network download is
performed. The runner imports the repository's supported differential, including
isolated recorder installs and frozen judge-module overlays. It does not alter
C/JS comparison output. ANSI horizontal positioning is decoded only in the
additional assertion that reads the C public timer display.

The target command actually executed with `/tmp/hero-status-final`; its receipt
preserves that argv. `recordings.json.gz` is a gzip-compressed JSON object keyed
by original relative output path, containing recipes, complete C recordings,
JS outputs, recorder/worker receipts and results. Read it with Python gzip or
Node zlib; it is not a tar file. `results.json` also contains the JS end-state
observations. The control stdout is transcribed from the completed tool result.

## Matrix and source explanation

For each of the six unordered pairs from confusion, blindness, deafness and
displacement, set counts (1,1), (1,2), and (2,1) together through one public
`#wizintrinsic` menu. Also set all four to one together. `#timeout` verifies
initial counts in C before four wait commands, each with enough More
acknowledgements; a final `#timeout` verifies no timed properties remain.

C `timeout.c:nh_timeout` decrements properties in property-index order. Its
confusion/blindness/deafness arms temporarily restore one before calling the
respective setter with zero; displacement reports expiration after its source
check. JS `decrement_property_timeouts` follows that order and those setter
transitions, with live-state handoff where needed. The selected short inputs
exercise those ordinary elapsed-turn transitions without a timer callback.
No byte-level first divergence exists in the 19 final recordings.

Final matrix: **49,532 RNG calls, 1,325 screens, 1,325 cursors**, all matching;
zero animation frames. C timer-display preconditions and expiry assertions pass
for every case. JS timeout bits are zero and the hero has at least one movement
ration at completion. C movement allocation and internal property bits are not
directly instrumented; public timer values, screens and RNG boundaries are the
C observations. Do not interpret the JS assertions alone as C state equivalence.

Final target matrix elapsed time: **23.976 seconds**, measured from first recipe
artifact to final result write; this is elapsed wall time, not active compute or
total session time. Six existing controls: **15,898 RNG calls, 221 screens and
221 cursors**, matching. Focused tests: **18/18**, covering timeout handoff,
property data and the evidence-package validator.

## Calibration and disposition limits

The initial 19-case short-tail pass matched but some simultaneous cases ended
at More prompts. Its retained `calibration-results.json` is not negative evidence
for complete expiry. The revised recipe added public snapshots and More spaces.
Its first single-case assertion failed because ANSI cursor-right spacing separated
`blinded` from its count; this was a diagnostic parser error, not a C/JS mismatch.
After correcting only that assertion parser, all 19 final cases completed.

Overlap check: the existing `run-hero-timeouts.mjs` recipes and relevant timeout
history cover single-property expiry. Current decisions' timeout deferrals concern
other explicitly excluded setup paths; none were reopened. No existing evidence
package found for these pairwise public-menu interactions. No duplicate bug or
already-fixed bug is claimed.

Coverage gaps: one seed, one role/race, unburdened stationary interactions; no
occupations, nonzero extrinsic property sources, natural acquisition, long runs,
or direct C internal movement observation. Burdened interactions remain untested;
only existing burdened single-property controls ran. Excluded timer/equipment and
stopped investigations remain excluded. There are no unresolved observed
interaction divergences and no source-only suspicion backlog.

The package validator verifies hashes/layout and declared receipts, not semantic
correctness. Main alone decides whether to retain this negative scope or request
additional coverage. No gameplay repair or CI dispatch is proposed.
