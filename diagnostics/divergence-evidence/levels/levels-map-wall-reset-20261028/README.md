# Map overwrite retains wall properties that C clears

One supported-API cause with two flag witnesses. C `lspo_map` clears `levl[x][y].flags` before writing each nontransparent cell. `rm.h` aliases `wall_info` to those bits. JS's map writer clears `flags` and `doormask`, but leaves its separate `wall_info` field unchanged.

A production loader initializes floor, authors nine HWALL cells through `des.terrain`, and flags them through `des.wall_property`. Both preconditions are asserted. A table map then redraws the same walls at (10,6): C clears wall_info to zero; JS keeps nondiggable (8) or nonpasswall (16). All 18 target cells differ. Four controls match: for each flag, a transparent xxx map skips the cells and a terrain() redraw retains the prior flag.

## Clean-base pickup

1. Check out Main `52d1911e5e9e8ad6a185e2561caaf5fd92edc703`.
2. Overlay this entire evidence directory at its repository-relative path, or apply its evidence-only commit.
3. Use Node24 and Clang19 (`source /workspace/.setup/activate.sh` in the supplied environment).
4. Run `node diagnostics/divergence-evidence/levels/levels-map-wall-reset-20261028/probe.mjs target`: expected **exit1**, assertion `nondiggable map`, C0 versus JS8.
5. Run the same command with `control`: expected **exit0**, four matches.
6. Run it with `observe` for six raw results (exit0). After implementation, target and control should both exit0.

All dependencies are bundled; no C checkout, recorder or Lua interpreter is needed. Private temporary C builds are cleaned up. The ordinary `.mjs` runner is deliberately outside default CI; the suite-discovery preflight receipt is included.

## Oracle, setup and limits

JS uses full `newgame_pre_mklev` and production `mklev({specialLevelLoader})`, following the established sentinel pattern in `scripts/special-level.test.mjs` to inspect placement before finalization. All terrain/property setup uses public des methods, without internal metadata mutation.

The C oracle contains unchanged `lspo_map`, `sel_set_ter`, `sel_set_wall_property`, `lvlfill_solid`, `set_levltyp` and `set_levltyp_lit` bodies from gitlink `16ff59115315917b93185d026aeefea06db9b0f4`. Fixed table/fragment adapters represent the stated 3x3 walls/transparent maps; actual map-loop resets execute. Minimal rm storage aliases flags exactly for the compared property. Setup follows the explicit `level_init` initialization-flag contract and executes exact fill/terrain/property callbacks at the translated valid coordinates; those setup Lua parsers are not executed. Unexpected effects abort.

Scope is HWALL overwrite and its two property flags, not all split terrain metadata, runtime wall interactions or finalization. Shipped exposure/score impact is unknown. PR72 remains a valid eligibility-only negative; this later reset behavior was outside its scope. This cause is distinct from PR77's missing ICE origin assignment even though both pass through the JS map writer. Manual/scanner-unbound. Main owns implementation; save-export/orig_rtype remains parked.
