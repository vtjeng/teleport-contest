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
| `event` | What prompted the snapshot: `slice` (behavior slice closure), `window` (review window closure), `goal` (goal closure), `holdout` (standalone holdout evaluation), `publish` (published leaderboard result), `candidate` (validated handoff for an open slice). Where triggers coincide, the row records the most significant one. |
| `sessions_passed`, `sessions_total` | Development sessions matching completely, out of the development set. |
| `screens_matched`, `screens_total` | Development screens matched, out of the screens the C reference recorded. |
| `rng_matched`, `rng_total` | Development random-number values matched, out of those recorded. `frozen/ps_test_runner.mjs` compares the two logs position by position over their whole length, so a segment that stops early scores its next segment's startup calls against C's continuing log, and this count can fall while correctness rises. |
| `cursors_matched`, `cursors_total` | Development cursor positions matched, out of those recorded. |
| `holdout_screens_matched`, `holdout_screens_total`, `holdout_rng_matched`, `holdout_rng_total` | Combined figures from the reserved local holdout of 11 sessions, filled only where that row's own event ran an evaluation. Empty means no new holdout evidence, so carry the last stated figure forward. |
| `wall_s` | Run duration in seconds, where a row states one. |
| `note` | A brief prediction, falsified forecast, or anomaly worth keeping. |

A development figure is a conservative lower bound for the 44-session public
score and does not scale from 33 to 44 sessions. The official held-out score is
separate from the reserved local holdout; only a published leaderboard result
states it.

## Current standing

- Development, at `b669b88` (2026-08-02): 676 of 7,765 screens and 108,261 of
  610,816 random-number values, over the development set of 33 sessions.
- Reserved holdout, at the same commit: 162 of 3,640 screens, 30,089 of
  182,022 random-number values, and 1 of 11 sessions, with 0 replay errors.
  The 23-screen gain that reached 162 came from `experience-level-gain` and is
  the largest a single close has produced; `furniture-square-entry` then closed
  without moving any of the three figures.

Per-event history lives in `SCORE.tsv`. The longer evidence behind any row
lives in that row's commit message and in `QUALITY.json`: validation runs,
mutation results, deferred findings, and review metrics. The prose rows this
file held before 2026-08-01 remain in its Git history.
