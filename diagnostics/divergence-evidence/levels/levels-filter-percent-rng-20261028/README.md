# Selection percent filtering: scoped RNG negative

Hypothesis: Percentage filtering can skip RNG when the requested percentage is 0 or 100.

C selection_filter_percent calls rn2(100) for each selected cell before comparing with the percentage, even at 0 and 100. JS matches executed C points and RNG calls.

50-percent boundary comparisons use draws 49,50,0,99 and select only draws 49 and 0; empty input consumes no draws. Both percentage extremes consume four draws.

Run from the repository root with Node 24 and Clang available:

```sh
node diagnostics/divergence-evidence/levels/levels-filter-percent-rng-20261028/probe.mjs
```

Expected exit: **0** on `1c4be74beb32edbfc897de805f218e180f8c6002`. Keep both directories in this evidence batch: the percentage probe imports the shared harness and C oracle from `levels-filter-light-rng-20261028`.

The harness creates the selection/map through production APIs and supplies a deterministic bounded RNG stream. The C oracle contains exact filter function bodies, a minimal four-point selection, and map storage. Its whole-map bounds are conservative: unselected cells add no RNG calls, so the selected traversal is unchanged. The ROOM-only comparison excludes claims about wildcard matching. Full Lua parsing and shipped recording exposure are not claimed.

`observations.json` contains all selected coordinates and RNG bounds; `case.json` pins source/tool/config provenance. `clean-base-verification.json` records a run from an otherwise clean current-base checkout. The domain is only the enumerated fixtures, not universal equivalence. This is manual/unbound evidence, with no invented scanner identity and no gameplay edits.
