# Selection constructor composition: API-scoped candidate

The production union/subtraction operators combine raw coordinates from two supported constructor representations. `selection_area` stores relative coordinates; `selection_match` stores absolute coordinates. C has one map-coordinate convention. The JS operators retain the left operand's frame without reconciling the right operand.

With the default whole-level origin x=1, paint one ROOM at relative (10,10). Area(10,10,10,10) and match('.') each independently paint only absolute (11,10) when passed to production terrain; the probe asserts this precondition for every composition. Combining the operands is therefore valid API usage, not marker tampering or invalid state.

C union yields only (11,10), but JS paints an extra (12,10) or (10,10), depending on operand order. C subtraction is empty; JS retains (11,10). The four relative/relative and absolute/absolute controls match. These are manifestations of one frame-normalization cause.

Run from the repository root with Node 24 and Clang:

```sh
node diagnostics/divergence-evidence/levels/levels-selection-frames-20261028/probe.mjs --assert-target
node diagnostics/divergence-evidence/levels/levels-selection-frames-20261028/probe.mjs --control
```

On `1c4be74beb32edbfc897de805f218e180f8c6002`, target exits **1**, controls exit **0**. The target assertion can pass after implementation. No tests enter default CI.

`oracle.c` executes exact C l_selection_or/sub bodies using a fixed argument adapter and minimal point storage. Both input points are the valid C constructor postconditions at (11,10): area translates its literal relative coordinates, and match reads the sole floor cell in map coordinates. Full C constructor execution and a Lua parser are not claimed; the source contract is pinned and both JS operands are independently consumed to verify their semantic coordinates. C selected points are the expected painted points, since all are valid non-stair cells.

`setup.lua` describes public API composition. `case.json` pins revisions, source/body/tool hashes and limits. `observations.json` and `clean-base-verification.json` preserve results. This candidate makes no shipped-exposure or hidden-score claim. No gameplay edits are included; implementation belongs to Main.
