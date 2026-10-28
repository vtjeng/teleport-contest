# Map string prefix: related C-string API candidate

**Confirmed API difference, shipped exposure unknown.** One related C-string cause affects table and centered row-array map compositions. It extends the accepted message/engraving family; do not count two repairs or a new independent root.

Input is `"...\n...\n\0.."` (hex `2e2e2e0a2e2e2e0a002e2e`). The prefix before NUL is a valid3x2 floor map. The full JS row-array has three equal-width3 rows.

| Form | Expected C frame | Observed JS frame | C/JS selected floor cells |
|---|---|---|---|
| Table at10,6 |10,6,3,2|10,6,3,3|6 /8|
| Centered C string /JS row-array |39,11,3,2|39,9,3,3|6 /8|

Four controls (plain3x2 and3x3 maps in both forms) match dimensions, placement and every selected floor coordinate. Target output records both actual mismatches before deliberate assertion failure. `observe` is an optional exit0 report mode; target is the parity test.

Clean-base handoff:

1. Check out `b977a2a5f2edbfcf72a8d8d651518793fd862074`, with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this complete evidence directory into that checkout. No gameplay changes are needed.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no install/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-map-string-prefix-20261028/probe.mjs target`: expected exit1, two mismatches above.
5. Run `node diagnostics/divergence-evidence/levels/levels-map-string-prefix-20261028/probe.mjs control`: expected exit0, all four controls. After Main repair, target should exit0 too.
6. Run `node --test scripts/test-suites.test.mjs`. The manual parity runner has an ordinary `.mjs` suffix and is outside default CI.

C table readers and luaL_checkstring expose the original decoded bytes to actual lspo_map and dupstr. The actual parser computes width/height from copied storage; the exact wrapper positions and iterates cells. The checked terrain adapter only accepts dot→ROOM. JS executes des.map through the production mklev special-loader callback, stops with a sentinel after recording its returned frame/selection, and does not run finalization. Array form is explicitly documented in production map() as the counterpart of C string form. Early scratch scalar-string and unequal-width-array attempts were unsupported and are not evidence; only the corrected supported forms and equal-width input are retained in the witness.

Limits: API-scoped map construction only. Shipped levels containing embedded NUL are not attributed; no hidden-score or gameplay exposure claim. This is related to the accepted level-message/engraving C-string prefix cause, not a new independent repair identity. C executes exact lspo_map, mapfrag_fromstr/get/free, stripdigits, str_lines_maxlen and dupstr. Typed reader adapters supply exact string/table inputs; bytes are hex-decoded without truncation. The source dupstr/strlen execution, not a precomputed expected prefix, causes truncation. No full Lua interpreter is executed. Floor terrain conversion/writes and selection storage are checked adapters. They assert only dot terrain, lit0, in-bounds coordinates and selected cells; no metadata, lighting, arbitrary characters, room/themeroom placement, callback, finalization or RNG parity claim. JS des.map row-array form is the production documented counterpart of C string form. Plain JS scalar string is not its supported invocation. The final array has equal-width3 rows and the C prefix is a valid3x2 map; no invalid row-length setup supports the claim. Only mapfrag_fromstr:dupstr is scanner-bound. The C lspo_map scanner edge maps to a different exported JS helper, so it is left unreviewed; actual public wrapper source is cited separately.

Current frozen inventory:46 negative keys/21 causes,4 historical/candidate keys,8 stale,465 without disposition. This adds one candidate key and one related API path; no independent cause inflation. Three parked gaps unchanged.
