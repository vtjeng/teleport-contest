# Expected leaderboard score

This file records what the JavaScript port scores and where the evidence for
each figure sits. Every measurement is one row of `SCORE.tsv`, pinned to the
commit it was taken at: the development-session result, and, on rows whose own
event ran an authorized evaluation, the reserved-holdout result. An empty cell
means the row states no such figure; it does not mean zero.

## SCORE.tsv columns

| Column | What it holds |
| --- | --- |
| `utc` | The date, or date and time, recorded for the snapshot, as written. |
| `sha` | The commit the figures were measured at, full or abbreviated as recorded. |
| `event` | What prompted the snapshot: `slice` (behavior slice closure), `window` (review window closure), `goal` (goal closure), `holdout` (standalone holdout evaluation), `publish` (published leaderboard result), `candidate` (validated handoff for an open slice). Where triggers coincide, the row records the most important one. |
| `sessions_passed`, `sessions_total` | Development sessions matching completely, out of the development set. |
| `screens_matched`, `screens_total` | Development screens matched, out of the screens the C reference recorded. |
| `rng_matched`, `rng_total` | Development random-number values matched, out of those recorded. `frozen/ps_test_runner.mjs` compares the two logs position by position over their whole length, so a segment that stops early scores its next segment's startup calls against C's continuing log, and this count can fall while correctness rises. |
| `cursors_matched`, `cursors_total` | Development cursor positions matched, out of those recorded. |
| `holdout_screens_matched`, `holdout_screens_total`, `holdout_rng_matched`, `holdout_rng_total` | Combined figures from the reserved local holdout of 11 sessions, filled only where that row's own event ran an evaluation. Empty means no new holdout evidence, so carry the last stated figure forward. |
| `note` | A brief prediction, falsified forecast, or anomaly worth keeping. |

A development figure is a conservative lower bound for the 44-session public
score and does not scale from 33 to 44 sessions. The official held-out score is
separate from the reserved local holdout; only a published leaderboard result
states it.

## Current standing

- Development, at `1225891` (2026-08-17): 1,768 of 7,765 screens and 125,937 of
  610,816 random-number values, over the development set of 33 sessions, of
  which 10 match completely.
- Reserved holdout, last evaluated at `1225891`: 273 of 3,640 screens, 35,464
  of 182,022 random-number values, and 1 of 11 sessions, with 0 replay errors.
  `option-toggle-repaints-the-map` left every one of those figures unchanged,
  which is the reading that matters for it: the goal rewrote what every
  remembered square of every level stores, and the sealed set did not regress.
  The holdout moved at three of the last six goal closes, after eleven flat
  ones: `armor-wear` took it to 234, `monster-melee-attack` to 249 and
  `pet-melee-attack` to 273.
  `docs/goal-history.md` records why a small gap is expected rather than a
  defect: goals are ranked by capped development look-ahead, so each one is
  chosen for the development session it unblocks, and carry-over to the hidden
  set is a by-product.

  Three observations now bear on what carries over, and they point the same
  way. Commonness in ordinary play does not predict it: force-fight gained 40
  development screens and moved the holdout by zero, and
  `monster-drops-equipped-gear`, chosen partly because a monster dropping what
  it wore fires on every kill of an equipped monster, gained 21 and also moved
  it by zero. Finishing a development session outright does not predict it
  either: `pet-step-onto-cursed-object` was chosen on an exactly measured 27
  and carried `seed1500-rogue-explore-move` to a complete match, the seventh of
  33, while moving the holdout by zero.

  What has moved it is a startup path and a large behavior port.
  `armor-wear` took it 224 to 234, but that goal also fixed `set_wear()`, which
  runs at startup for every session; `throw-command` was then run under a
  constraint of touching no startup path, and moved the holdout by zero on both
  screens and random-number calls, which is evidence the 10 came from the
  startup fix rather than from porting an ordinary command.
  `monster-melee-attack` is the first ordinary behavior port to move it: 234 to
  249 screens and 33,674 to 34,361 calls. Against its own development gain the
  carry-over is about a quarter as large in proportion, 1.53 per cent of the
  development total against 0.41 per cent of the holdout's, which is what a
  behavior ranked against the development set and then measured on unseen
  sessions should look like.

Per-event history lives in `SCORE.tsv`. The longer evidence behind any row
lives in that row's commit message and in `QUALITY.json`: validation runs,
mutation results, deferred findings, and review metrics. The prose rows this
file held before 2026-08-01 remain in its Git history.

`SCORE.tsv` also held a `checkpoint` row per scoring run, added on 2026-08-01
and removed the next day, and a `wall_s` column that only those rows filled.
Both are gone. A scoring run measures the working tree, so 34 of the 42 rows
written described an uncommitted tree while naming HEAD, and none of them stated
a figure an event row did not already carry. They remain in `SCORE.tsv`'s Git
history.
