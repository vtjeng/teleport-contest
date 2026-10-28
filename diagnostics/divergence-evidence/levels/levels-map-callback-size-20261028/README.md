# Map callback dimensions: bounded negative

The JS des.map wrapper invokes l_push_wid_hei_table; the C-only call-site edge does not mean callback dimensions are omitted.

Six public JS map callbacks match exact C mapfrag_fromstr/stripdigits/str_lines_maxlen and l_push_wid_hei_table output. Three 3x2 floor representations (plain, trailing newline, ASCII digit labels), two interior positions; one callback with exactly width/height and unchanged painted extent. Fixed C typed table capture and fragment-to-descriptor handoff, not full C lspo_map execution.

Control: Plain 3x2 maps at (10,5) and (20,8); trailing newline and numeric-label forms preserve width 3 / height 2.

## Clean-base reproduction

1. Check out `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be` and C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay edits.
3. Use existing Node 24.19.0 and Clang 19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment). No Lua, installation or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-map-callback-size-20261028/probe.mjs target` (expected 0).
5. Run `node diagnostics/divergence-evidence/levels/levels-map-callback-size-20261028/probe.mjs control` (expected 0).
6. Run `node --test scripts/test-suites.test.mjs`.

Four target and two control fixtures. C parses the exact string, then hands the resulting dimensions to the exact serializer. For these top-level, interior, nondegenerate maps the C lspo_map source passes those fragment dimensions directly; no room clip or bounds/reset branch applies. JS callback count, exact field names, values, and the six painted floor positions are asserted.

Limits: Only three 3x2 rectangular floor representations at two interior positions. No room clipping, single-cell reset, alignment, arbitrary Unicode, metadata or finalization. C executes fragment parsing and table serialization with a fixed direct handoff, not the complete lspo_map wrapper or Lua interpreter. Shipped exposure is unestablished.

Official compact projection retains original run `ea2181cadbad5793b4be` / SHA `b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8`, exact canonical keys/fingerprints, manifest and decisions. No new scan. One callback serialization edge; no inference about other map-wrapper warnings.

Combined two-case batch: 571 raw / 523 permitted; 16 current negative keys, 1 candidate key, 8 stale bindings, 498 without a current disposition. Forty-four ownership overlaps remain routing notes. Numeric-string, gradient and parked state-export gaps remain unresolved. Corridor source inspection added no proved disposition.
