# levels-match-boundary-20261028

**unresolved.** Demonstrated helper difference only, NOT a ready gameplay divergence. The fixture is a valid constructed map but no supported registered-level route to it has been established. Finite bigrm-3 controls do not establish universal equivalence.

C selects the constructed right-edge center (78,10), treating the outside wildcard position as STONE. JS omits (78,10). Interior (40,10) matches. Shipped bigrm-3 template matches all 20 fitting placements, totaling 2200 selected points.

Run `node diagnostics/divergence-evidence/levels/levels-match-boundary-20261028/probe.mjs` from the repository root with Node and clang on PATH. The diagnostic exits zero when the recorded findings reproduce, including the explicitly unresolved helper mismatch. No deliberately failing test enters default CI. C source/enum extraction and all small inputs are bundled in the probe. Raw compact output is in `observations.json`.

This differs from the deferred line-tie cause: it concerns out-of-map pattern cells, not line rasterization. Current call inspection found one wildcard-edge template, bigrm-3; other inspected patterns are single-cell or require ROOM/LAVAPOOL at outside positions (which C treats as STONE). No new arbitrary-Lua runtime was built. The 20 template placements are finite controls, not a universal reachability proof.
