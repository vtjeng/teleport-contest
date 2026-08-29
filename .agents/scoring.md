# Score recording

Read this file when you append a `SCORE.tsv` event row, answer a score
question from the log, or respond to a holdout evaluation where improvements
in the development score did not appear in the holdout score. Only the
orchestrator appends rows; a slice-worker states its score evidence in its
report. The holdout rules in `AGENTS.md` always apply.

## SCORE.tsv columns

| Column | What it holds |
| --- | --- |
| `utc` | ISO 8601 date and time of the snapshot. Omit `utc=` when calling `--append` so the script records the current time; a date-only value is upgraded to a full timestamp. |
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

## Score evidence

`SCORE.tsv` is the score record: one append-only, tab-separated row per event.
Append a `slice`, `window`, `goal`,
`holdout`, or `publish` row with `node scripts/score-log.mjs --append
column=value ...` when that event completes. You may also append a `candidate`
row after validating a slice-worker's results on an unclosed slice, but a
scoring run does not append a row. Take each row's figures from the working tree
at the commit the row names; a run over uncommitted work produces figures no
later run can reproduce. A later row supersedes an earlier one, so no row is
rewritten; when two events share a commit, combine them into one row recording
the more important event. The `note` column may hold a brief prediction or
anomaly. Fill the four holdout columns only on a row whose event included an
authorized holdout evaluation; an empty holdout cell means no new holdout
evidence. Longer evidence belongs in the commit message; review metrics belong
in `QUALITY.json`.

Read the log with `node scripts/score-log.mjs --latest [event]`, `--standing`,
or `--since <sha>`. `--standing` carries forward the most recent holdout figure
on every row. Do not answer a score question by scanning `SCORE.tsv` directly;
the raw rows do not reflect supersession or carry forward the last holdout
figure.

Generate the `note` column with `node scripts/score-log.mjs --generate-note
event=<event> [label=<id>] screens_matched=<n> screens_total=<n>
rng_matched=<n> rng_total=<n> [sessions_passed=<n> sessions_total=<n>]
[holdout_screens_matched=<n> ...]`. The command reads the previous standing
from SCORE.tsv, computes deltas, and prints a one-line note. Pipe the output
into the `note=` column of `--append` rather than composing the note by hand.

Prefer improvements that translate the C source faithfully over changes that
raise the score without matching the source's behavior. Run the generalization
failure protocol below when a review of the source, implementation diff, and
development evidence confirms that behavior was special-cased to a recorded
session (fixture-specific) or hardcoded. Any evidence can prompt that review. A
holdout figure that moves little or not at all is not sufficient by itself: the
holdout evaluation detects large inadvertent regressions, and a goal that leaves
the holdout figure unchanged is expected.

## Generalization failure protocol

1. Stop tuning against the aggregate holdout result.
2. Spawn a fresh subagent that identifies the fixture-specific or hardcoded
   behavior, explains why it passed development checks, and proposes a
   source-faithful replacement. Give the subagent only the code diff, relevant
   upstream source, development evidence, and aggregate holdout result. The
   subagent must not inspect the holdout sessions in `sessions/holdout/` or
   per-session holdout results. The subagent reports its analysis; the
   orchestrator carries out the remaining steps.
3. Replace the fixture-specific or hardcoded behavior with the source-faithful
   implementation the subagent proposed, and add a development test or recorded
   session that covers the broader category so similar changes are caught.
4. Add a concise, reusable rule to `AGENTS.md` that would have prevented this
   kind of fixture-specific implementation from being committed. Repeat after
   every confirmed generalization failure. Exclude incident-specific scores,
   session filenames, and progress notes.
