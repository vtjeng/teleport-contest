# Selection numeric point reads: bounded negative

JS selectionPoint decodes numeric point storage in place of the C selection_getpoint calls in OR/subtraction. The four edges describe one helper-substitution cause, not four independent defects.

Exact C OR/subtraction wrappers plus selection allocation/read/write/bounds and rect_bounds helpers match production JS exports for all64 overlap value pairs0..7 under each operator (128 comparisons) and all4 disjoint boolean pairs per operator (8 controls). Entire1680-byte maps and computed bounds agree. JS outputs are fresh, absolute and leave both inputs unchanged. Fixed two-selection Lua stack adapters; shared absolute frame only.

Control: Disjoint boolean pairs distinguish overlap arithmetic from independent point retention, including empty operands/results; controls pass8 comparisons.

Clean-base reproduction:

1. Check out `cc5a50e4e23b33f36a39ff8826a866bb7832caca` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment); no install/network dependencies.
4. Run `node diagnostics/divergence-evidence/levels/levels-selection-numeric-operators-20261028/probe.mjs target` (expected0;128 comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-selection-numeric-operators-20261028/probe.mjs control` (expected0;8 comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

The C oracle emits all1680 map bytes and computed bounds. The runner compares every byte, then retains compact per-input outputs with point values, bounds and full-map hashes. JS operands are created via production selection_new/set, are both absolute, and are checked unchanged. The result must be fresh. No hidden frame manipulation is performed.

Limits: Finite numeric value domain0..7 at overlapping (3,4), plus disjoint boolean inputs at (3,4)/(7,2). One absolute map frame; no mixed/relative frame, coordinate conversion, arbitrary bounds, signed/wrapping values, Lua parser, finalization or runtime claim. Actual production JS selection_new/set and OR/subtraction exports, as used in repository tests and translated callers. Exact C functions execute with a fixed valid two-selection Lua stack adapter and actual selection storage/allocation. No custom Lua interpreter. Input maps and output bytes are inspected only, not injected. Full map bytes and computed bounds are compared, not internal cached-bound dirty flags. Existing Main-owned selection-frame candidates remain separate and unresolved by these comparisons. Shipped exposure is not attributed.

This is not a proof about the Main-owned mixed-frame compositions. Four scanner keys identify one numeric-read helper substitution cause. Official exporter validation against the immutable original run verifies four active keys become filtered; source fingerprints remain unchanged from scan base.

Updated accounting:28 negative keys across16 causes,1 historical accepted candidate,1 ready candidate,8 stale bindings,485 without disposition (523 permitted/571 raw). No rescan or stale-binding promotion.
