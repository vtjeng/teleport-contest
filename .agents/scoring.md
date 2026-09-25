# Score recording

Read this file when you append a `SCORE.tsv` row or answer a score question
from the log. Only the orchestrator appends rows; an implementation worker
states its score evidence in its report. The local-holdout recordings are open under
`AGENTS.md` and are included in the operational fixed workload.
Run `node scripts/score-holdout.mjs [--goal <id>]` for the separate historical
11-session local provenance view; the optional goal is an output label, not a
permission gate. It supplies context alongside ordinary development work.
The operational development score is the fixed 44-session workload, including
the files under `sessions/holdout/`.

## SCORE.tsv columns

`SCORE.tsv` is the score record: one append-only, tab-separated row per event.
`scripts/score-log.mjs` composes and parses every row.

| Column | What it holds |
| --- | --- |
| `utc` | ISO 8601 date and time the script appended the row. `--append` rejects a caller-supplied value. |
| `sha` | The commit the figures were measured at. |
| `event` | What prompted the row: `goal` (implementation task closure), `holdout` (a separate local-holdout provenance evaluation), `divergence` (a divergence fix committed outside a goal), or `challenge` (a saved challenge evaluation). Historical `span`, `slice`, `window`, and `candidate` events remain readable but are not written for new tasks. |
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

Append a row when an implementation task's goal closes, when a divergence fix
is committed and scored outside a goal, or when the separate provenance
evaluation runs outside a goal close.
A challenge preparation delivery does not append a score row. A scoring run
does not append a row. Challenge evaluations use the explicit
import procedure below.

1. Commit your changes before measuring a new score. Record the commit whose
   game and scoring inputs produced the figures in the row's `sha` column.
   For fixed-development figures, open the `summary.json` path printed after
   `Results:` by `npm run checkpoint`. Check that `allPassed` is `true` and
   `commit` matches the commit you are closing. Use its `score` values for the
   figures and `executionCommit` for the row's `sha`: they are normally equal,
   but a reused checkpoint may validate a newer bookkeeping commit against
   evidence executed at an earlier commit.
2. Generate the note:
   `node scripts/score-log.mjs --generate-note event=<event> [label=<id>]
   screens_matched=<n> screens_total=<n> rng_matched=<n> rng_total=<n>
   [sessions_passed=<n> sessions_total=<n>] [holdout_screens_matched=<n> ...]`.
   The command reads the previous standing, computes the deltas, and prints
   one line to pass as `note=`.
3. Append the row: `node scripts/score-log.mjs --append column=value ...`.

Never rewrite a row; a later row supersedes an earlier one. Longer evidence
belongs in the commit message, and review metrics belong in `QUALITY.json`.

## Recording the synthetic local challenge set

The frozen `v1` set in `challenges/manifest.json` contains valid C recordings
that may fail in JavaScript. Keep those failures outside the passing
`recordings/` regression corpus. The manifest, immutable recordings, and saved
evaluations are separate from the fixed workload and the historical local-
holdout provenance view.

At loop entry, obtain complete saved evaluations for every admitted synthetic
batch. Reuse an evaluation only when its game, scorer, and manifest inputs are
unchanged. After each implementation goal's checkpoint, reassess every batch
at the committed candidate before acceptance. Compare each unchanged case's
screens, cursors, RNG calls, and errors with accepted evidence; resolve lost
screen matches before accepting gains elsewhere.

Synthetic failures now drive goal selection under `.agents/selection.md`.
Save each new batch’s first evaluation before using its JavaScript failures to
guide fixes. Evaluate one batch explicitly, or all admitted batches together:

```
node scripts/score-challenges.mjs --batch v1 --output challenges/evaluations/<new-name>.json
node scripts/score-challenges.mjs --all --output-dir challenges/evaluations
node scripts/score-challenges.mjs --record challenges/evaluations/<new-name>.json
```

The evaluator requires committed inputs, refuses to overwrite an artifact, and
records runner failures without aggregate counts. The all-batch command prints
one artifact path per batch; import each separately. New evaluations include
a replay-input digest: report-only commits leave them current, while changed
game, scorer, or manifest inputs require reassessment. Legacy artifacts remain
in history and need a new evaluation before they can authorize selection.
The import checks evidence and appends one `event=challenge` row, with development and holdout fields empty.
Import in measurement order and commit the artifact and row together. Do not
use `--generate-note` for challenges or copy their counts into development
fields. Only the main orchestrator records implementation-loop measurements;
the experiment agent may import its separately authorized pilot evidence.

Preserve first results and do not add cases to the frozen manifest. A new
challenge batch gets a new versioned manifest and its own evaluation history.
Compare gains and losses only on unchanged cases with the same scorer and
denominators. Dashboard builds read saved evidence; they do not run challenge
evaluations. A failed or older measurement retains its failure status or
measured commit age. Synthetic failures have their own implementation queue;
they never enter the fixed mismatch queue or its score denominator. Publish
batch identity, current investigations, and remaining synthetic screens on the
dashboard so an empty fixed queue does not imply that the loop is finished.
Keep earlier batch results visible after admitting another batch.

The dashboard shows one combined Development set measure: it sums the
historical public-development and local-holdout measurements, carrying the
latest holdout measurement forward after the holdout is first recorded. It
shows the synthetic local challenge set separately (the historical display
label is Synthetic local holdout). Each card includes the age of its
measured commit. Challenge details follow Work by source file; per-case
accounting remains in the saved evidence. Historical missing session/cursor
counts remain unknown. Dashboard metrics cover the local measures; the remote
competition score is external to this workspace.

## Reading the log

Answer score questions with `node scripts/score-log.mjs --latest [event]`,
`--standing`, or `--since <sha>`; these views apply supersession and carry the
last holdout figure forward. The raw `SCORE.tsv` rows remain the append-only
source record.

Two facts affect how figures compare across rows and against the leaderboard:

- Rows from `7b95457` (2026-08-29T23:15Z) up to `b3bba28f` were measured with
  a local edit to `frozen/terminal.js` that the judge does not apply. At
  `150ab469` the edit added 59 screens to the local figure. From `b3bba28f`
  on, `GameDisplay.serialize()` recovers those screens under the judge's
  code, so local and leaderboard figures agree.
- Historical public rows use 33 sessions; operational fixed rows use 44. Do not
  compare their percentages without checking `sessions_total` and the screen
  denominator. The remote competition holdout remains unavailable and is never
  represented by the local or synthetic measures.

## Reporting broader coverage

A flat development score can accompany useful behavior beyond the fixed
sessions. Report newly matching recordings and movement of the relevant
first mismatch as `.agents/loop.md`, "Reports", specifies. Keep these
measurements separate from the development totals. Declaration counts are
inventory. Fixed-queue remaining screens are upper bounds; synthetic counts
are exact unmatched screens from saved evaluations.
A gain that restores an earlier regression is recovery, not an additional
net gain. Preserve that distinction in event notes and progress reports.

## What the historical local-holdout view measures

The entire local holdout was opened on 2026-09-12 under the generalization
experiment plan. Its separate figures measure progress and regressions on an
exposed fixed corpus and preserve pre-opening history; they are now also part
of the operational fixed-development workload. Do not describe improvements on
either exposed corpus as evidence of generalization. Neither local measure
estimates the remote holdout score.
