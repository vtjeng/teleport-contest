# Score recording

Read this file when you append a `SCORE.tsv` row or answer a score question
from the log. Only the orchestrator appends rows; a span worker states its
score evidence in its report. The holdout rules in `AGENTS.md` always apply.

## SCORE.tsv columns

`SCORE.tsv` is the score record: one append-only, tab-separated row per event.
`scripts/score-log.mjs` composes and parses every row.

| Column | What it holds |
| --- | --- |
| `utc` | ISO 8601 date and time the script appended the row. `--append` rejects a caller-supplied value. |
| `sha` | The commit the figures were measured at. |
| `event` | What prompted the row: `span` (span closure), `goal` (goal closure, of either kind), `holdout` (an authorized evaluation outside a goal close), or `divergence` (a divergence fix committed outside a goal). Rows before 2026-09-05 use `slice` for what is now a span, and rows before 2026-08-27 also use the retired `window` and `candidate` labels; the script no longer appends any of those. |
| `sessions_passed`, `sessions_total` | Development sessions matching completely, out of the development set. |
| `screens_matched`, `screens_total` | Development screens matched, out of the screens the C reference recorded. |
| `rng_matched`, `rng_total` | Development random-number values matched, out of those recorded. `frozen/ps_test_runner.mjs` compares the two logs position by position over their whole length, so a segment that stops early scores its next segment's startup calls against C's continuing log, and this count can fall while correctness rises. |
| `cursors_matched`, `cursors_total` | Development cursor positions matched, out of those recorded. |
| `holdout_screens_matched`, `holdout_screens_total`, `holdout_rng_matched`, `holdout_rng_total` | Combined figures from the 11-session local holdout. Fill them only on a row whose own event ran an authorized evaluation. An empty cell means no new holdout evidence; the last stated figure carries forward. |
| `note` | The line `--generate-note` prints, optionally followed by an anomaly worth keeping. |

## Appending a row

Append a row when a span or goal closes, when a divergence fix is committed
and scored outside a goal, or when an authorized holdout evaluation runs
outside a goal close.
A scoring run does not append a row.

1. Measure the figures at the commit the row names. A run over uncommitted
   work produces figures no later run can reproduce.
2. Generate the note:
   `node scripts/score-log.mjs --generate-note event=<event> [label=<id>]
   screens_matched=<n> screens_total=<n> rng_matched=<n> rng_total=<n>
   [sessions_passed=<n> sessions_total=<n>] [holdout_screens_matched=<n> ...]`.
   The command reads the previous standing, computes the deltas, and prints
   one line to pass as `note=`.
3. Append the row: `node scripts/score-log.mjs --append column=value ...`.

Never rewrite a row; a later row supersedes an earlier one. Longer evidence
belongs in the commit message, and review metrics belong in `QUALITY.json`.

## Reading the log

Read the log with `node scripts/score-log.mjs --latest [event]`, `--standing`,
or `--since <sha>`. Do not answer a score question by scanning `SCORE.tsv`
directly: the raw rows do not reflect supersession or carry the last holdout
figure forward.

Two facts affect how figures compare across rows and against the leaderboard:

- Rows from `7b95457` (2026-08-29T23:15Z) onward were measured with the local
  `serialize()` fix that "Local serialize fix" in `AGENTS.md` describes, which
  raises local figures above the leaderboard's.
- A development figure is a lower bound for the 44-session public score and
  does not scale from 33 to 44 sessions. The official held-out sessions are
  separate from the local holdout, and only the leaderboard states that score.

## What the holdout measures

The holdout evaluation detects large inadvertent regressions. A goal that
leaves the holdout figure unchanged is expected, and a holdout figure that
moves little is not by itself evidence that a change was fitted to a
development session. Prefer changes that translate the C source faithfully
over changes that raise the score without matching the source's behavior.
