# Unresolved: original room types on subrooms

JS finalization copies `rtype` to `orig_rtype` only for `level.rooms`. Subrooms are stored separately in `game.subrooms`. C stores both in one allocation: `decl.h:1203` declares `(MAXNROFROOMS+1)*2` rooms; `decl.c:1169` points `gs.subrooms` into its second half; `mklev.c:1572` copies original types across the complete allocation.

Six full public-input loads of shipped College Town produce 72 JS subrooms with absent `orig_rtype`, while top-level rooms have their expected original types. `probe.mjs` runs the exact bundled recipe through production `runSegment`; it does not inject a loader or modify gameplay. The probe prints the resulting room metadata.

This is **unresolved, not ready for implementation handoff**. C source supports the expected initialization, but the recorder does not expose the corresponding internal C fields. All six output recordings match and retain unresolved Lua-attribution status. Matching output is neither proof of internal equivalence nor proof that the missing field is harmless. No runtime consequence is claimed.

On base `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`, from repository root:

```sh
node diagnostics/divergence-evidence/levels/levels-subroom-finalization-20261028/probe.mjs 28104000 --assert-orig
node diagnostics/divergence-evidence/levels/levels-subroom-finalization-20261028/probe.mjs 28104000 --assert-top
node diagnostics/divergence-evidence/levels/levels-subroom-finalization-20261028/replay.mjs
```

Expected exits: **1, 0, 0**. The red original-type diagnostic is deliberately outside default CI and does not establish confirmed C/JS runtime divergence. Replay uses the six bundled hash-checked C recordings without rebuilding C. Recipes pin date/options/seeds. Regenerate via the existing private recorder using `config.json` and a fresh output directory.

Next experiment: a supported C state diagnostic after `level_finalize_topology`, on the same recipe, must capture the subroom fields. Do not infer those values solely from matching screens. The separate sibling topology negative covers only the sampled numbering/early-return conditions and does not resolve this original-type lead.

An initial reduced loader probe omitted fruit initialization and failed on its second seed. That was a setup error, not a gameplay finding; the final probe instead uses complete production startup. The invalid setup is excluded from proof.

All documented commands were verified in a separate clean checkout of the stated base with only these evidence directories overlaid. The sibling `clean-verification.json` records their expected exit codes.
