# levels-match-boundary-20261028: supported-API candidate

**Confirmed API-scoped divergence.** Off-map wildcard footprint is rejected by JS although C treats outside cells as STONE. Shipped exposure and hidden-score impact remain unknown. This supersedes the original exposure-based deferral without changing the stable case ID; original records and observations remain historical evidence.

Pattern [.w.] has odd dimensions 5x1 and valid MATCH_WALL center; it is also an existing shipped literal. l_selection_match tests every map center, including x=78. All three authored cells x=77,78,79 are valid. Only the pattern footprint extends to x=80; C explicitly supplies STONE for that position, so the query is supported rather than an invalid coordinate write.

C selects and paints absolute (78,10); JS selects no cell. Interior (40,10) matches. Interior center (40,10) selects and paints identically. Earlier 20-template/2200-point controls remain historical finite evidence, not universal equivalence.

From the repository root with Node 24 and Clang available:

```sh
node diagnostics/divergence-evidence/levels/levels-match-boundary-20261028/probe.mjs --assert-target
node diagnostics/divergence-evidence/levels/levels-match-boundary-20261028/probe.mjs --control
```

On base `034443e9246cb9fc19dfba9ba2d9c2893132e84c`, target exits **1**, controls exit **0**. The target assertion can pass after implementation; no deliberate failing test is in default CI. No arguments verifies the recorded mismatch and controls.

`setup.lua` gives equivalent public descriptor usage. The runnable probe uses exported selection constructors and consumes their results with actual production `lspo_terrain`, comparing final painted cells after frame translation. The C oracle bundles exact algorithm bodies and minimal point/map storage. It does not execute a full Lua parser or arbitrary Lua runtime. The constant frame translation and pattern construction are the documented public-wrapper operations. Painting HWALL at selected valid non-stair coordinates is unconditional, so the C selected coordinates are the expected painted coordinates.

Implementation is in the indicated constructor in `js/bigrm.js`; C provenance, hashes, exact API contract and controls are in `case.json`. `clean-base-verification.json` records independent clean-base target/control commands. No gameplay edits are included.
