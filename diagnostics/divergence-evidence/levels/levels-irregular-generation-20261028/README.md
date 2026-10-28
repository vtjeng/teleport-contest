# Irregular region seed and connectivity: scoped negative

C irregular `des.region` uses the first corner as a flood seed and derives its bounds from the component. Its flood visits diagonal matches; the far corner does not clip it. This differs from the cardinal default `selection.floodfill` contract reviewed previously.

The bundled exact C `flood_fill_rm` extraction and production JS `lspo_region` agree on seven layouts, each with lighting off/on: diagonal pair, cardinal pair, separated gap, narrow/enclosing far-corner variants, mixed ROOM/FOUNTAIN row, and adjacent wall. Each comparison checks all 1,680 room-number/lighting/edge tuples and flood bounds/counts. The diagonal/gap control fills two/one cells; both far-corner variants fill the four-cell row. This is a manual, scanner-unbound explained negative limited to these fixtures, not universal equivalence or a claim that each constructed layout occurs in shipped gameplay.

From the repository root with Node 24 and Clang available:

```sh
node diagnostics/divergence-evidence/levels/levels-irregular-generation-20261028/probe.mjs
node diagnostics/divergence-evidence/levels/levels-irregular-generation-20261028/replay.mjs
```

Both commands exit zero. The probe compiles its bundled C oracle in a private temporary directory. The replay verifies decompressed recording hashes, then compares RNG, screens and cursors using the existing scorer. No default CI changes are included.

Eight public wizard-load recipes and compressed C recordings are included. Wizard locate seeds 28104200–28104203 match with Lua source attribution. Valkyrie goal seeds 28104204–28104207 have matching streams but retain unresolved Lua attribution; those recordings are not proof of the hypothesized path. The isolated fixtures establish the finite comparison independently.

`case.json` pins the C/JS bases, source locations, source/tool/config/patch hashes, extracted oracle hash and timestamps. `observations.json` retains focused results; `recordings.json` retains raw adapter dispositions and recording hashes. `clean-base-verification.json` records the commands run from an otherwise clean detached checkout. The recorder batch took 12.606 seconds.
