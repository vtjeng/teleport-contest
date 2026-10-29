# Selection iteration: finite boundary/order negative

JS selection_iterate clamps x to1 and uses production bounds/get methods in place of C per-cell isok and selection helpers. The three edges are one bounded traversal-delegation cause.

Exact C iteration plus allocation/read/write/bounds helpers matches production JS iteration for all1680 singleton cells and64 subsets of six boundary points. Callback coordinates and order match, column0 is skipped, and JS input maps remain unchanged. Both use absolute selections and no origin conversion. This is a finite proof, not equivalence for arbitrary selections or alternate origins.

Control: All64 subsets of (0,0),(0,20),(1,0),(1,20),(79,0),(79,20), including empty and mixed valid/invalid-x cases, verify ordering and exclusion together.

Clean-base reproduction:

1. Check out `cc5a50e4e23b33f36a39ff8826a866bb7832caca` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in the managed environment); no install/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-selection-iterate-20261028/probe.mjs target` (expected0;1680 singleton comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-selection-iterate-20261028/probe.mjs control` (expected0;64 boundary-subset comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

Each output row contains fixture ID followed by observed ordered x,y callbacks. Target ID i selects (i%80,floor(i/80)); control ID is the six-bit subset mask in the point order stated above. The runner compares every callback to C and retains the C-output hash; JS selection bytes must remain unchanged. Of the singleton inputs,21 column-zero selections produce no callback and1659 produce their single valid coordinate.

Limits: All1680 singleton map coordinates plus64 subsets of six specified boundary points; finite Boolean selection domains only. No universal equivalence claim, arbitrary numeric values, corrupted bounds, null selection or throwing callback cases. Production selection_new/set/selection_iterate exports with default null origin and absolute selections. No relative/origin-conversion, Lua iterator, mixed-frame, finalization, runtime or shipped-exposure claim. Exact C selection_iterate and supporting selection storage/bounds helpers; callback captures coordinates in order. No Lua interpreter or custom JS state injection. Existing origin-conversion lead remains unreviewed.

The relativeCoordinate scanner edge is deliberately not bound to this proof. Official exporter validation against the immutable original run verifies three active keys become filtered. Source fingerprints remain unchanged from scan base.

Updated accounting:31 negative keys across17 causes,1 historical accepted candidate,1 ready candidate awaiting Main review,8 stale bindings,482 without disposition. No rescan or stale-review promotion.
