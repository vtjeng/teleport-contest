# Vault entry cannot interrupt an active counted search

At base `cfb72d4699bfe6080b46f21894f929f35b68414f`, C completes a counted-search interruption at guard entry. JS refuses the turn because runtime creation has no `stopOccupation` continuation hook.

The supported wizard setup enters an ordinary generated vault; `30s` then leaves a search active when the guard arrives. The tested branch does not depend on wizard mode. No state is injected. The control replaces the counted search with 29 individual waits. Both fixtures stop at the initial name prompt; this case does not investigate guard AI, responses or subsequent actions.

C witness boundary 63 prints `You stop searching.` beside the arrival message; boundary 64 shows the name prompt. JS matches the first 63 screens/cursors and 6,163 RNG calls, then raises `UnsupportedTurnBoundaryError: runtime creation while an occupation lacks stopOccupation`. The control fully matches 91 screens/cursors and 6,228 RNG calls.

From repository root with the standard recorder setup:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/vault-entry-occupation-hook/witness.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/vault-entry-occupation-hook/control.recipe.json
node --test diagnostics/divergence-evidence/commands/vault-entry-occupation-hook/candidate.test.mjs
```

Expected: target exits 1, control exits 0, candidate test exits 1 with only its witness failing. The test is outside default CI. All dependencies are repository tools or Node built-ins.

Raw C and JS captures are gzip-compressed to keep this setup small. `gzip -dc <file.json.gz>` exposes their unchanged JSON. `case.json` pins compressed and uncompressed hashes, source/tool/oracle provenance, reachability and scope. `boundary.json` records the supported diagnostic hook output.

The caller in `allmain.js` and the environment passed into runtime creation in `vault.js` need source-based occupation plumbing. The later explicit stop callback also lacks its message environment, but the demonstrated earliest failure is the runtime-creation guard; those are not counted as two bugs.
