# Declined prayer cannot be repeated

At JavaScript base `128fba220b25c44e18c5907c15bab10b0e8ac918`, ordinary play with `#pray\nn\x01n` reaches C's second prayer confirmation, but JavaScript ends at the queued `pray` command. C produces 10 screens/cursors; JS produces the first 8, then raises `UnsupportedHeroCommandBoundaryError`. Both consume 3,046 RNG calls. A second fresh recording reproduces the same result. `confirmation.json` records the hashes.

The nearby control replaces Ctrl-A with a second explicit `#pray\n`. All 15 screens/cursors and 3,046 RNG calls match. No wizard setup or state injection is needed.

C's `do_repeat` re-enters `rhack` with the retained command row. JS extracts that row but has no `pray` dispatch arm, so it reaches the fallback refusal. The named `doextcmd` switch already invokes `dopray`. This is an observable unsupported command path, not a claim inferred from a missing call alone.

From repository root:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/cmd-pray-repeat-decline/witness.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/cmd-pray-repeat-decline/control.recipe.json
node --test diagnostics/divergence-evidence/commands/cmd-pray-repeat-decline/candidate.test.mjs
```

The final command intentionally fails its witness assertion at this base; its control passes. The file is outside default CI. Fresh differential tools create private recorder installations and overlay the protected scorer files. The small focused candidate test uses the checkout's JS files; frozen-overlay confirmation is retained in the differential outputs.

`case.json` carries source locations, fingerprints, reachability, limits, timestamps and follow-up. The sibling records explain two independent scanner observations: an inactive `#if 0` repeat-reset call and occupation messages passed through a callback. Neither negative establishes command equivalence generally.
