# Scoped negative: College Town child numbering

The absent recursive call in JS `topologize` does not leave the sampled College Town child room numbers unset. Both C and JS `build_room` topologize each newly constructed child. In all six tested full public-input layouts, the parent low-corner number already satisfies C's early-return guard before recursion, and every child's low-corner number equals its index plus `ROOMOFFSET` (72 children total).

This proof is limited to those six recipes and low-corner numbering/early-return conditions. It says nothing about entire interior/edge grids, arbitrary layouts, changed numbering or a parent requiring retopology. It must not suppress the missing recursive call globally.

Bundle both sibling evidence directories. From repository root:

```sh
node diagnostics/divergence-evidence/levels/levels-subroom-topology-20261028/focused.mjs
```

Expected exit 0 on base `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`. The test invokes the sibling full public-input state probe for six seeds and checks the scoped invariant. Its detector control changes one copied child number to zero and verifies rejection; that mutation is not claimed to be a reachable game setup.

`observations.json` preserves all sampled numbers. The sibling directory bundles recipes, full output recordings and replay. Their unresolved Lua-attribution status is preserved. This manual case has no invented scanner binding. The separate missing-original-type case remains unresolved.

All documented commands were verified in a separate clean checkout of the stated base with only these evidence directories overlaid. The sibling `clean-verification.json` records their expected exit codes.
