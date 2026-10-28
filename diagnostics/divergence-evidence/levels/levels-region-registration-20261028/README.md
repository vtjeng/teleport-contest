# Region registration: bounded explained negative

Run from the repository root (Node and Clang required):

```sh
source /workspace/.setup/activate.sh # cloud toolchain, if present
node diagnostics/divergence-evidence/levels/levels-region-registration-20261028/probe.mjs
```

Expected exit: **0**, 72 matching fixtures and 144 registered records. No default-CI test is added. The runner builds its bundled C oracle in a private temporary directory and removes it afterward.

The source-led question was whether an absent exclusion rectangle could acquire the active map offset. C explicitly forces its `exclude_islev` flag; JS does the same. Both preserve `[-1,-1,-1,-1]`. Supplied rectangles independently honor their absolute/relative flags. At map origin `(10,6)`, relative region `[1,1,4,4]` becomes `[11,7,14,10]`, while the absolute control retains its input coordinates.

Six configurations (missing exclusion with relative/absolute region; explicit exclusion with all four flag combinations) are crossed with four teleport direction forms and eight levregion type forms, including omitted defaults. Each registration runs twice to cover first allocation and append/copy. Name `air` and padding 2 are additionally checked for levregion. API setup uses production startup and the mklev loader; it stops before level finalization.

The bundled oracle contains the unchanged C bodies listed in case.json, with a fixed table adapter and minimal region types. It executes coordinate resolution and allocation/copy. The adapter supplies valid fixed tables and uses C's own option arrays; unsupported random/helper paths abort. Frame globals model the public map postcondition independently asserted in JS. Full Lua parsing is not claimed.

Clean-base verification uses `32578f23091dad34635a9b4fe0bfb45ed9840e39`; C source is `16ff59115315917b93185d026aeefea06db9b0f4`. Exact source/tool hashes, raw observations and verification receipts are adjacent. This is manual, scanner-unbound evidence. It proves only the listed registration records: no finalization, destination placement, runtime teleport behavior, invalid inputs, random or room-relative coordinates, or universal equivalence claim.
