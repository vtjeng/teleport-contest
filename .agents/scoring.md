# Score recording

Read this file when appending a `SCORE.tsv` event row, answering a score
question from the log, or responding to an authorized holdout evaluation
whose development gains did not carry over. Only the orchestrator does this
work: a slice-worker states its score evidence in its report and appends
nothing, as `.claude/agents/slice-worker.md` states. The rules in `AGENTS.md`
for `sessions/holdout/`, the sealed holdout, always apply.

## Score evidence

`SCORE.tsv` is the score record: one append-only, tab-separated row per event,
with the columns `SCORE.md` documents. Append a `slice`, `window`, `goal`,
`holdout`, or `publish` row with `node scripts/score-log.mjs --append
column=value ...` when that event completes, and an optional `candidate` row
for a validated handoff on an open slice. A scoring run appends nothing itself.
Take a row's figures from a run of the tree the named commit holds: a run over
uncommitted work states a figure that no later run of that commit reproduces.
A later row supersedes an earlier one by position, so no row is rewritten.
Combine coincident events into one row recording the most important one. The
`note` column holds a brief prediction, an anomaly, or nothing. Fill the four
holdout columns only on a row whose own event ran an authorized evaluation; an
empty cell means no new holdout evidence. Longer evidence lives in the commit
message of the SHA the row names, and review metrics stay in `QUALITY.json`.
`SCORE.md` explains the columns and states the current standing; it holds no
per-event prose.

Read the log with `node scripts/score-log.mjs --latest [event]`, `--standing`,
or `--since <sha>`; `--standing` carries the last stated holdout figure
forward. Do not answer a score question by scanning `SCORE.tsv` itself.

Prefer source-faithful subsystem improvements to isolated score gains. Run the
protocol below when a review of the source, implementation diff, and
development evidence confirms that behavior was special-cased to a recorded
session (fixture-specific) or hardcoded, and passed the development checks that
way. Anything may prompt that review. A holdout figure that moves little or not
at all does not prompt one by itself: the holdout guards against a large
inadvertent regression, and a goal that does not move it is ordinary.

## Generalization failure protocol

1. Stop tuning against the aggregate holdout result.
2. Spawn a fresh subagent to analyze the fixture-specific or hardcoded
   behavior, why it passed development checks, and which source-faithful
   implementation should replace that behavior. Give the subagent only the
   code diff, relevant upstream source, development evidence, and aggregate
   holdout result. It must not inspect the sealed holdout or per-session
   results.
3. Replace the fixture-specific or hardcoded behavior and add a development or
   newly recorded test for the general failure class.
4. Add a concise, reusable rule to `AGENTS.md` that would have prevented the
   failure. Repeat this step after every confirmed generalization failure.
   Exclude incident-specific scores, session filenames, and progress notes.
