# Extended-command menu groups retain descriptions that C removes

An ordinary Ranger with `OPTIONS=extmenu` sees this after pressing `#`:

- C: `a - adjust or annotate`
- JS: `a - adjust [adjust inventory letters] or annotate [name current level]`

The first difference is at zero-based boundary 1, row 3, column 12. Longer JS groups are clipped. Both sides have two screens/cursors and 2,289 RNG calls. The identical recipe with `!extmenu` passes completely. This is one menu-label construction defect; other narrowing/wrapping branches have not been counted as additional bugs.

Run from repository root with the standard recorder:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/extmenu-group-labels/witness.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/extmenu-group-labels/control.recipe.json
node --test diagnostics/divergence-evidence/commands/extmenu-group-labels/candidate.test.mjs
node --test diagnostics/divergence-evidence/commands/extmenu-choice-bound/evidence.test.mjs
node scripts/generate-extcmds.mjs --check
```

Expected exits: 1, 0, 1, 0, 0. Only the witness deliberately fails, outside default CI. Clean-base commands and exact results are in `pickup-check.json`; the base is `58ad57cea2dcd8b94b8d1f7644e9e21fc02c7cd1`. Raw captures are gzip JSON. `provenance.json` is shared by the three scoped cases in this batch.

The sibling `extmenu-choice-bound` and `extmenu-prefix-bound` cases explain two scanner diagnostics using source bounds: the complete configured table has 170 rows versus a 200-choice limit, and names are at most 14 characters versus a prefix guard above 126. The table bound includes all rows, so autocomplete and wizard filtering only strengthen it. These proofs do not suppress the live display mismatch or assert general menu equivalence.

The two import decisions reuse the small projection published in PR #30, not a copy of its large original run. Extract that immutable file from its pinned commit, then classify:

```
git show b2eb6dd2b9c0700c3b4e0bebc8fc48dc57d0a026:diagnostics/divergence-evidence/commands/turn-loop-platform-adapter/discovery-run.projection.json > /tmp/commands-projection.json
node scripts/discovery-hub.mjs classify --run /tmp/commands-projection.json --decisions diagnostics/divergence-evidence/commands/extmenu-group-labels/negative-decisions.json --out /tmp/commands-extmenu-reviewed.json
```

`projection-reference.json` pins the projection SHA-256, original run identity/hash, repository and commit. If that evidence commit is not in the local clone, fetch its published `analysis/commands/20261028-turn-loop-negatives` branch first. Clean-checkout import of both original-fingerprint decisions is recorded in `pickup-check.json`. No rescan, guessed canonical ID, or private environment access is required.
