# Score recording

Read this file when you append a `SCORE.tsv` event row, answer a score
question from the log, or respond to an authorized holdout evaluation where
improvements in the development score did not appear in the holdout score.
Only the orchestrator appends rows. A slice-worker states its score evidence
in its report and does not append rows, as `.claude/agents/slice-worker.md`
states. The rules in `AGENTS.md` for the holdout sessions in
`sessions/holdout/` always apply.

## Score evidence

`SCORE.tsv` is the score record: one append-only, tab-separated row per event,
with the columns `SCORE.md` documents. Append a `slice`, `window`, `goal`,
`holdout`, or `publish` row with `node scripts/score-log.mjs --append
column=value ...` when that event completes. You may also append a `candidate`
row after validating a slice-worker's results on a slice that has not yet
closed. A scoring run does not append a row. Take each row's figures from a
run of the working tree at the commit that the row names, because a run over
uncommitted work produces figures that no later run of that commit can
reproduce. A later row supersedes an earlier one, so no row is rewritten. When
two events share the same commit, combine them into one row recording the more
important event. The `note` column may hold a brief prediction or anomaly.
Fill the four holdout columns (as `SCORE.md` defines them) only on a row whose
event included an authorized holdout evaluation. An empty holdout cell means
no new holdout evidence is available. Longer evidence belongs in the commit
message of the SHA that the row names, and review metrics belong in
`QUALITY.json`. `SCORE.md` explains the columns and states the current
standing; it does not contain per-event prose.

Read the log with `node scripts/score-log.mjs --latest [event]`, `--standing`,
or `--since <sha>`; `--standing` repeats the most recent holdout figure on
every row, even when that row recorded no new holdout evidence. Do not answer
a score question by scanning `SCORE.tsv` directly, because the raw rows do not
reflect supersession or carry forward the last holdout figure.

Prefer improvements that translate the C source faithfully over changes that
raise the score without matching the source's behavior. Run the generalization
failure protocol below when a review of the source, the implementation diff,
and the development evidence confirms that behavior was special-cased to a
recorded session (fixture-specific) or hardcoded, and passed the development
checks in that form. Anything can prompt that review, but a holdout figure
that moves little or not at all does not prompt such a review by itself: the
holdout evaluation detects large inadvertent regressions, and a goal that does
not change the holdout figure is expected.

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
   implementation the subagent proposed, and add a development test or newly
   recorded session that covers the broader category of bug, so similar
   fixture-specific changes are caught in the future.
4. Add a concise, reusable rule to `AGENTS.md` that would have prevented this
   kind of fixture-specific or hardcoded implementation from being committed.
   Repeat this step after every confirmed generalization failure. Exclude
   incident-specific scores, session filenames, and progress notes.
