# Selection light filtering: scoped RNG negative

Hypothesis: Random-light filtering chooses one shared lit/unlit state for the selection.

C selection_filter_mapchar draws rn2(2) independently for each terrain-matching selected cell. It does not consult the cell light bit in the -1 branch. JS matches the executed C points and RNG calls.

Explicit lit=0/1 and no-light-filter -2 consume no draws; empty input consumes none. Target selects both an unlit and a lit cell, disproving a shared global light choice.

Run from the repository root with Node 24 and Clang available:

```sh
node diagnostics/divergence-evidence/levels/levels-filter-light-rng-20261028/probe.mjs
```

Expected exit: **0** on `1c4be74beb32edbfc897de805f218e180f8c6002`. Keep both directories in this evidence batch: the percentage probe imports the shared harness and C oracle from `levels-filter-light-rng-20261028`.

The harness creates the selection/map through production APIs and supplies a deterministic bounded RNG stream. The C oracle contains exact filter function bodies, a minimal four-point selection, and map storage. Its whole-map bounds are conservative: unselected cells add no RNG calls, so the selected traversal is unchanged. The ROOM-only comparison excludes claims about wildcard matching. Full Lua parsing and shipped recording exposure are not claimed.

`observations.json` contains all selected coordinates and RNG bounds; `case.json` pins source/tool/config provenance. `clean-base-verification.json` records a run from an otherwise clean current-base checkout. The domain is only the enumerated fixtures, not universal equivalence. This is manual/unbound evidence, with no invented scanner identity and no gameplay edits.

The hypothesis comes from `doc/lua.adoc:1200`, which describes choosing all lit or all unlit locations. The implementation is authoritative for parity. Existing `scripts/themerooms-selection.test.mjs` already tests independent random-light draws; this evidence executes C as well. Inputs outside the documented lit domain are not used to claim a divergence.
