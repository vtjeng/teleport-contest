# Default flood connectivity: scoped negative

The hypothesis that the quest helper loses diagonal connections is false for the shipped two-argument Lua calls: `nhlsel.c` defaults `diagonals` to FALSE. This is a source-backed default-argument proof, not a claim that all flood-fill behavior is equivalent.

`oracle.c` embeds the unmodified `sel_flood_havepoint` and `selection_floodfill` bodies from C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`, src/selvar.c:377–453. Its small wrapper supplies allocation, point access, bounds and terrain equality. `probe.mjs` compares the production JS helper against the compiled C on all 256 floor-centered 3×3 binary neighborhoods at origins (1,0) and (2,0). All 512 bitmaps match. A corner-only control selects one cell with cardinal connectivity and two with diagonals enabled.

These are finite unit inputs, not claimed reachable gameplay fixtures. Coordinate-frame edge cases, column zero, larger components, prefilled selections and arbitrary Lua remain outside the proof. No scanner ID is invented for this manual case.

From repository root, with Node and Clang available:

```sh
node diagnostics/divergence-evidence/levels/levels-flood-topology-20261028/probe.mjs
node diagnostics/divergence-evidence/levels/levels-flood-topology-20261028/replay.mjs
```

Both commands should exit 0 on base `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`. The first compiles the bundled extraction in a private temporary directory; the second needs no C checkout or recorder and verifies each recording hash before replay.

Eight fresh public-input wizard loads cover two seeds each of Rog-strt, Pri-strt, Mon-strt and minetn-1. All RNG/screen/cursor streams match. Rog-strt and minetn-1 have Lua source attribution; Priest/Monk lack it and retain raw unresolved coverage status. Their matching streams do not establish source coverage. Exact observations, raw hashes and attribution records are preserved in `recordings.json`; compressed C recordings and recipes are bundled. None of these finite recordings proves universal equivalence.

To regenerate using the existing private recorder adapter, run `node scripts/lua-discovery.mjs diagnostics/divergence-evidence/levels/levels-flood-topology-20261028/config.json /absolute/new-output-directory`. Re-review the negative when Lua signatures, coordinate conversion or neighbor dispatch changes.

Clean-base verification completed in a separate detached checkout of the stated base, with only evidence overlaid: the 512-case probe and all eight recording replays passed.
