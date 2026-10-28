# Large status thresholds select the wrong color

Ordinary OPTIONS input provides two valid LP64 thresholds. Starting gold satisfies both. C chooses the closer numeric threshold (red); JS compares stored decimal strings lexically and selects blue. The 900/1000 control matches. Neither setup needs unusual game state.

Run from the repository root:

```sh
node --test diagnostics/divergence-evidence/commands/large-status-threshold-order/evidence-check.mjs
```

The control passes and target deliberately fails outside default CI. Compressed C recordings include every input; no recorder build is required to reproduce JS parity failure. Recipe and raw comparison results are included. See case.json for exact source/tool provenance. No gameplay changes.
