# Expected leaderboard score

This tracker is newest first. Each row describes the code at the exact commit
shown, not a later tracker-only commit. Hidden estimates remain conservative
unless an authorized aggregate evaluation or published leaderboard result
provides evidence for a higher value.

| Code commit | Date | Expected screen score | Evidence and uncertainty |
| --- | --- | --- | --- |
| `88ccb28d900bfc81e76f092f7b34218dbcbabba9` | 2026-07-21 | `103 shown + 0 hidden = 103 total` | `node scripts/score-development.mjs` still matched 103 screens across the fixed 33-session development set after the reviewed vault-realization fixes and verified simplification; all 392 tests passed. An arbitrary fresh differential still first diverges at PRNG call 1468 in the next unported ordinary-room population work, with matching cursor output. The sealed holdout was not run, so 0 hidden remains an unmeasured conservative estimate. |
| `71e40ad128009c7959c361aaa7946f10a18528fe` | 2026-07-20 | `103 shown + 0 hidden = 103 total` | `node scripts/score-development.mjs` matched 103 screens across the fixed 33-session development set; all 374 tests and the themed-room generated-data check passed, and both quality gates are clear. An arbitrary fresh differential matches C through PRNG call 1436 and first diverges at the known next unported `fill_special_room` boundary at call 1437. The sealed holdout was not run, so 0 hidden is an unmeasured conservative estimate. |
| `db2ab36938751e3d49b9385a014a3074784669bb` | 2026-07-20 | `103 shown + 0 hidden = 103 total` | `node scripts/score-development.mjs` matched 103 screens across the fixed 33-session development set; all 370 tests and the object, monster, and dungeon generated-data checks passed. Full review and simplification gates are clear. An arbitrary fresh differential reaches a known unported special-level generation boundary, so the sealed holdout remains unrun and 0 hidden is an unmeasured conservative estimate. |
| `ccb4f56274140b9a54829662cc9d6bca565bf0c7` | 2026-07-20 | `103 shown + 0 hidden = 103 total` | `node scripts/score-development.mjs` matched 103 screens across the fixed 33-session development set; all 346 tests committed at this SHA, both generated-catalog checks, and three strict fresh pre-level differentials passed. The sealed holdout was not run, so 0 hidden is an unmeasured conservative estimate. |
| `e143b964e1e12f458cbccab0c14521cef42ca259` | 2026-07-20 | `103 shown + 0 hidden = 103 total` | `node scripts/score-development.mjs` matched 103 screens across the fixed 33-session development set; 286 tests and both generated-catalog checks passed. The sealed holdout was not run, so 0 hidden is an unmeasured conservative estimate. |
