# Wizard prayer repeat reuses a force-success answer

With standard `playmode:debug` and default paranoid prayer confirmation enabled, accept a prayer and answer yes to "Force the gods to be pleased?". Dismiss its single More prompt and press Ctrl-A. Both implementations ask whether to pray again, but after yes JS consumes the earlier wizard-force answer and skips the fresh force prompt C requires.

At zero-based target boundary 12, C says `You begin praying to Venus.--More--`; JS already adds shimmering light. At boundary 13, C asks `Force the gods to be pleased? [yn] (n)` while JS has completed a forced-success prayer. The supplied `n` consequently answers different input contexts, and RNG first differs later. The earlier boundaries, including the entire first prayer and repeat's ordinary confirmation, match.

C `pray.c:2233-2258` temporarily sets `in_doagain` false and calls non-recording `YN` when ParanoidPray is enabled. JS `pray.js:1835-1841` instead always calls `y_n`; its comment assumes `in_doagain` is always false. That saves the first wizard answer into CQ_REPEAT and later reuses it. This is distinct from PR #9's fixed queued-command admission failure after a declined prayer.

The control changes only the second command from Ctrl-A to a newly entered `#pray`; all 22 screens/cursors, 2,499 RNG calls and one animation frame match. No injected state, object setup, or monster interaction is needed. The scope is the wizard force-success prompt with ParanoidPray enabled, not all prayer outcomes.

From repository root:

```
node --test diagnostics/divergence-evidence/commands/wizard-prayer-repeat-confirmation/evidence.test.mjs
```

On clean Main `034443e9246cb9fc19dfba9ba2d9c2893132e84c`, control passes and target deliberately fails at boundary 12. Both should pass after a repair. This deliberate regression is outside default CI. All fixtures are included; standard repository dependencies suffice. `clean-base-check.json` verifies committed sources before and after the documented command.

For fresh recorder runs:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/wizard-prayer-repeat-confirmation/target.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/wizard-prayer-repeat-confirmation/control.recipe.json
```

Recipes pin the full input/options/seed/clock. Original C and JS outputs are compressed without modification. `case.json` pins source/tool/recorder hashes. This manual case is unbound; no scanner ID is invented. A preliminary probe with an extra space cleared recall and is excluded from qualification and yield.
