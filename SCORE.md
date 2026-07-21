# Expected leaderboard score

This tracker is newest first. Each row describes the code at the exact commit
shown, not a later tracker-only commit. Hidden estimates remain conservative
unless an authorized aggregate evaluation or published leaderboard result
provides evidence for a higher value.

| Code commit | Date | Expected screen score | Evidence and uncertainty |
| --- | --- | --- | --- |
| `ccb4f56274140b9a54829662cc9d6bca565bf0c7` | 2026-07-20 | `103 shown + 0 hidden = 103 total` | `node scripts/score-development.mjs` matched 103 screens across the fixed 33-session development set; all 346 tests committed at this SHA, both generated-catalog checks, and three strict fresh pre-level differentials passed. The sealed holdout was not run, so 0 hidden is an unmeasured conservative estimate. |
| `e143b964e1e12f458cbccab0c14521cef42ca259` | 2026-07-20 | `103 shown + 0 hidden = 103 total` | `node scripts/score-development.mjs` matched 103 screens across the fixed 33-session development set; 286 tests and both generated-catalog checks passed. The sealed holdout was not run, so 0 hidden is an unmeasured conservative estimate. |
