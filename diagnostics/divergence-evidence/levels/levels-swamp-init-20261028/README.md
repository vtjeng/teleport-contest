# Scoped explained negative

C fills through column 78, leaving 79 stone; at x=78 the three-neighbor background predicate fails, suppressing the optional draw. Actual JS lspo_level_init matches extracted C lvlfill_solid/lvlfill_swamp on four seed/lighting cases, with 380 rn2(3) calls each.

Two seeds and lit 0/1; all map terrain and lighting compared. Two public wizard-des recordings match all streams; raw adapter Lua-attribution status remains unresolved.

Run `node diagnostics/divergence-evidence/levels/levels-swamp-init-20261028/probe.mjs` from the repository root. Swamp probes need Node and clang on PATH (activate `/workspace/.setup/activate.sh` in the saved environment). No gameplay source changes or custom Lua runtime.

The shared `levels-swamp-init-20261028` directory contains two compressed C recordings and `replay.mjs`. Run `node diagnostics/divergence-evidence/levels/levels-swamp-init-20261028/replay.mjs 28103301` (or `28103302`) with Node; no C recorder build is required. The saved raw adapter status is unresolved because it lacks a Lua attribution marker, despite full stream matches. C RNG annotations explicitly show 380 `lvlfill_swamp` calls at the final input step in each recording. Neither matching recording establishes universal level equivalence.
