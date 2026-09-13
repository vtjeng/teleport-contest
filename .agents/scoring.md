# Score recording

Read this file when you append a `SCORE.tsv` row or answer a score question
from the log. Only the orchestrator appends rows; a span worker states its
score evidence in its report. The local holdout is open under `AGENTS.md`.
Run `node scripts/score-holdout.mjs [--goal <id>]` for the separate historical
holdout view; repeated evaluations no longer require separate authorization.
The operational development score is the fixed 44-session workload, including
the files under `sessions/holdout/`.

## SCORE.tsv columns

`SCORE.tsv` is the score record: one append-only, tab-separated row per event.
`scripts/score-log.mjs` composes and parses every row.

| Column | What it holds |
| --- | --- |
| `utc` | ISO 8601 date and time the script appended the row. `--append` rejects a caller-supplied value. |
| `sha` | The commit the figures were measured at. |
| `event` | What prompted the row: `span` (span closure), `goal` (goal closure, of any kind), `holdout` (an authorized evaluation outside a goal close), or `divergence` (a divergence fix committed outside a goal), or `challenge` (a saved challenge evaluation). Rows before 2026-09-05 use `slice` for what is now a span, and rows before 2026-08-27 also use the retired `window` and `candidate` labels; the script no longer appends any of those. |
| `sessions_passed`, `sessions_total` | Sessions matching completely, out of the measured development workload. Historical rows before the transition describe 33 public sessions; new operational rows describe all 44 fixed sessions. |
| `screens_matched`, `screens_total` | Screens matched, out of the screens the C reference recorded. The operational development scorer measures the 44-session fixed workload. |
| `rng_matched`, `rng_total` | Development random-number values matched, out of those recorded. `frozen/ps_test_runner.mjs` compares the two logs position by position over their whole length, so a segment that stops early scores its next segment's startup calls against C's continuing log, and this count can fall while correctness rises. |
| `cursors_matched`, `cursors_total` | Development cursor positions matched, out of those recorded. |
| `holdout_screens_matched`, `holdout_screens_total`, `holdout_rng_matched`, `holdout_rng_total` | Figures from the 11-session local-holdout provenance view. New fixed-workload rows may carry both the operational 44-session figures and this separate 11-session breakdown. An empty cell means no new provenance evidence; the last stated figure carries forward. |
| `note` | The line `--generate-note` prints, optionally followed by an anomaly worth keeping; challenge imports generate their note from the saved evaluation. |
| `holdout_sessions_passed`, `holdout_sessions_total`, `holdout_cursors_matched`, `holdout_cursors_total` | Session and cursor counts from the separate local-holdout provenance evaluation. Historical rows without these counts remain empty. |
| `challenge_sessions_passed`, `challenge_sessions_total`, `challenge_screens_matched`, `challenge_screens_total`, `challenge_rng_matched`, `challenge_rng_total`, `challenge_cursors_matched`, `challenge_cursors_total` | Challenge counts only. A failed runner attempt leaves all eight empty; a measured zero is recorded as 0. |
| `challenge_manifest_sha256` | Digest of the evaluated case IDs and immutable recording hashes. |
| `challenge_evaluation` | Saved evidence under `challenges/evaluations/`, including measured commit/time, scorer identity, per-case results, and totals. |

## Appending a row

Append a row when a span or goal closes, when a divergence fix is committed
and scored outside a goal, or when the separate provenance evaluation runs
outside a goal close.
A scoring run does not append a row. Challenge evaluations use the explicit
import procedure below.

1. Commit your changes before measuring a new score. Record the measured
   commit in the row's `sha` column.
   For fixed-development figures, open the `summary.json` path printed after
   `Results:` by `npm run checkpoint`. Check that `allPassed` is `true`
   and `commit` matches the commit you are closing. Use its `score` values
   for the figures and `executionCommit` for the row's `sha`.
2. Generate the note:
   `node scripts/score-log.mjs --generate-note event=<event> [label=<id>]
   screens_matched=<n> screens_total=<n> rng_matched=<n> rng_total=<n>
   [sessions_passed=<n> sessions_total=<n>] [holdout_screens_matched=<n> ...]`.
   The command reads the previous standing, computes the deltas, and prints
   one line to pass as `note=`.
3. Append the row: `node scripts/score-log.mjs --append column=value ...`.

Never rewrite a row; a later row supersedes an earlier one. Longer evidence
belongs in the commit message, and review metrics belong in `QUALITY.json`.

## Recording synthetic local holdout

The frozen `v1` set in `challenges/manifest.json` contains valid C recordings
that may fail in JavaScript. Keep those failures outside the passing
`recordings/` regression corpus. The manifest, immutable recordings, and saved
evaluations are separate from the fixed workload and the historical local-
holdout provenance view.

After an implementation goal's checkpoint, reassess synthetic local holdout
`v1` at that committed HEAD. Save the evaluation before using its JavaScript
failures to guide a future, explicitly selected investigation:

```
node scripts/score-challenges.mjs --output challenges/evaluations/<new-name>.json
node scripts/score-challenges.mjs --record challenges/evaluations/<new-name>.json
```

The evaluator requires committed inputs, refuses to overwrite an artifact, and
records runner failures without aggregate counts. The import checks evidence
and appends one `event=challenge` row, with development and holdout fields empty.
Import in measurement order and commit the artifact and row together. Do not
use `--generate-note` for challenges or copy their counts into development
fields. Only the main orchestrator records implementation-loop measurements;
the experiment agent may import its separately authorized pilot evidence.

Preserve first results and do not add cases to the frozen manifest. A new
challenge batch gets a new versioned manifest and its own evaluation history.
Compare gains and losses only on unchanged cases with the same scorer and
denominators. Dashboard builds read saved evidence; they do not run challenge
evaluations. A failed or older measurement retains its failure status or
measured commit age. Synthetic failures never enter the fixed mismatch queue.

The dashboard shows one combined Development set measure: it sums the
historical public-development and local-holdout measurements, carrying the
latest holdout measurement forward after the holdout is first recorded. It
shows Synthetic local holdout separately. Each card includes the age of its
measured commit. Challenge details follow Work by source file; per-case
accounting remains in the saved evidence. Historical missing session/cursor
counts remain unknown. Do not show a remote-holdout score.

## Reading the log

Read the log with `node scripts/score-log.mjs --latest [event]`, `--standing`,
or `--since <sha>`. Do not answer a score question by scanning `SCORE.tsv`
directly: the raw rows do not reflect supersession or carry the last holdout
figure forward.

Two facts affect how figures compare across rows and against the leaderboard:

- Rows from `7b95457` (2026-08-29T23:15Z) onward were measured with the local
  `serialize()` fix that "Local serialize fix" in `AGENTS.md` describes, which
  raises local figures above the leaderboard's.
- Historical public rows use 33 sessions; operational fixed rows use 44. Do not
  compare their percentages without checking `sessions_total` and the screen
  denominator. The remote competition holdout remains unavailable and is never
  represented by the local or synthetic measures.

## Reporting broader coverage

A flat development score can accompany useful behavior beyond the fixed
sessions. Report newly matching recordings and movement of the relevant
first mismatch as `.agents/loop.md`, "Reports", specifies. Keep these
measurements separate from the development totals. Declaration counts are
inventory, and the mismatch queue's remaining screens are upper bounds.
A gain that restores an earlier regression is recovery, not an additional
net gain. Preserve that distinction in event notes and progress reports.

## What the historical local-holdout view measures

The entire local holdout was opened on 2026-09-12 under the generalization
experiment plan. Its separate figures measure progress and regressions on an
exposed fixed corpus and preserve pre-opening history; they are now also part
of the operational fixed-development workload. Do not describe improvements on
either exposed corpus as evidence of generalization. Neither local measure
estimates the remote holdout score.
