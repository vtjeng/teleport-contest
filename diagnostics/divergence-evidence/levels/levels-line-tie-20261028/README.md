# levels-line-tie-20261028: supported-API candidate

**Confirmed API-scoped divergence.** Bresenham equality ties choose different cells. Shipped exposure and hidden-score impact remain unknown. This supersedes the original exposure-based deferral without changing the stable case ID; original records and observations remain historical evidence.

Four integer endpoints are accepted by params_sel_2coords; l_selection_line translates them with ANY_LOC and calls selection_do_line without an axis-alignment restriction. The default frame adds one to x. JS relative selection is translated by production lspo_terrain before painting.

For relative (10,10)->(12,11), C paints absolute (12,11), JS paints (12,10). Three tie directions differ. Horizontal, vertical and 45-degree controls match.

From the repository root with Node 24 and Clang available:

```sh
node diagnostics/divergence-evidence/levels/levels-line-tie-20261028/probe.mjs --assert-target
node diagnostics/divergence-evidence/levels/levels-line-tie-20261028/probe.mjs --control
```

On base `034443e9246cb9fc19dfba9ba2d9c2893132e84c`, target exits **1**, controls exit **0**. The target assertion can pass after implementation; no deliberate failing test is in default CI. No arguments verifies the recorded mismatch and controls.

`setup.lua` gives equivalent public descriptor usage. The runnable probe uses exported selection constructors and consumes their results with actual production `lspo_terrain`, comparing final painted cells after frame translation. The C oracle bundles exact algorithm bodies and minimal point/map storage. It does not execute a full Lua parser or arbitrary Lua runtime. The constant frame translation and pattern construction are the documented public-wrapper operations. Painting HWALL at selected valid non-stair coordinates is unconditional, so the C selected coordinates are the expected painted coordinates.

Implementation is in the indicated constructor in `js/bigrm.js`; C provenance, hashes, exact API contract and controls are in `case.json`. `clean-base-verification.json` records independent clean-base target/control commands. No gameplay edits are included.
