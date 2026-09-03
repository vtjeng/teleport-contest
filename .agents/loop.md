# Continuous operation

This file defines the orchestrator's loop: goal selection, slice iteration,
measurement, and review scheduling.

`.agents/glossary.md` defines the terms this file uses.
`.agents/review.md` states when a formal review pass is due and how to run
one.

The orchestrator repeats without returning to the user between steps:

   On entry (or after a restart), check
   `node scripts/goal-log.mjs --current` for the current state:

   - No goal in progress: start at step 1.
   - Goal in progress, a slice is in-progress: the worker may have been
     interrupted. Run `git log --oneline` and check
     `.cache/checkpoint-summary.json` to establish what it landed, then
     continue from step 4's post-worker logic (measurement and push).
   - Goal in progress, a queued slice exists: verify that
     `.cache/slice-context.json` describes the queued slice. If it
     matches, start at step 4. If it is missing or describes a
     different slice, start at step 3.
   - Goal in progress, no queued or in-progress slices: start at step 3.

1. When no goal is in progress, select the next goal.

   a. Check the queue: run `node scripts/goal-log.mjs --current --detail`.
      If a goal is already queued, take it and skip to step 1e.
   b. Run `node scripts/pipeline-candidates.mjs --ready-winner`. If
      `winner` is non-null, continue to step 1d.
   c. If `winner` is null, run the `candidate-pipeline` workflow
      (`.claude/workflows/candidate-pipeline.js`); if the Workflow tool
      is unavailable, spawn the candidate-pipeline agent
      (`.claude/agents/candidate-pipeline.md`). When preparation
      finishes, rerun `--ready-winner`. If `winner` is still null, all
      candidates are exhausted — stop the loop and notify the user.
   d. Write `.cache/goal-context.json` from the winner's data: map
      `cappedForecast` to `forecastSteps`, summarize the capping basis
      as `forecastBasis`, extract session names from the sessions array,
      and copy `witnesses` and `detail`. Queue the goal with
      `node scripts/goal-log.mjs queue-goal`.
   e. Open the goal with `node scripts/goal-log.mjs open-goal` (captures
      the baseline score).
2. Spawn a non-blocking background agent to run the
   `candidate-pipeline` workflow
   (`.claude/workflows/candidate-pipeline.js`). Do not wait for it.
3. Spawn the slice-selector (`.claude/agents/slice-selector.md`) to
   identify the next slice, queue it with
   `node scripts/goal-log.mjs queue-slice`, and write
   `.cache/slice-context.json` for the worker. Before spawning, verify
   that `.cache/goal-context.json` describes the current goal; update it
   only when it is missing or describes a different goal.
4. Spawn a worker for that slice. When the worker returns, establish
   what landed: `git log --oneline origin/main..HEAD` and
   `git status --short`. The worker runs `npm run checkpoint` after
   committing, so `.cache/checkpoint-summary.json` describes the
   committed state. Read that file and use its figures. Rerun checkpoint
   only if the file is missing or its `commit` does not match
   `git rev-parse HEAD`. Push before the turn ends.

   Watch the CI run from a background task (`gh run list --limit 1`,
   then `gh run watch <id> --exit-status`). CI can fail where a local
   checkpoint passes because CI runs from a fresh checkout; start the
   next step without waiting. When a run fails, diagnose, fix, push,
   and watch the new run before the current slice closes. The `gh`
   commands require `gh repo set-default vtjeng/teleport-contest`; run
   it if `gh run list` shows unfamiliar runs.
5. Run `npm run quality` yourself; no worker reports it. If the output
   shows `DUE`, run the required review pass before continuing.
   `.agents/review.md`, "When a correctness pass is due", defines the
   gate and the output format.
6. When a slice closes, append its `SCORE.tsv` row as `.agents/scoring.md`
   requires, in the commit that records the closure in `GOALS.json`. The
   row's `sha` and figures come from step 4's measurement. Continue at
   step 3.
7. When a goal closes, run the authorized holdout evaluation and record
   its result with the goal's evidence. Resolve every open deferral the
   goal's commits closed
   (`npm run quality -- deferrals --area <id>` for the areas the goal
   touched); the rest stay open and none becomes a queued slice. Close
   the goal with `node scripts/goal-log.mjs close-goal`. Continue at
   step 1.

Formal review passes are steps of this loop. Commits may land while a
pass reviews its fixed range; they belong to the next pass, and neither
blocks the other. `.agents/review.md` states the readiness constraint.

`AGENTS.md`, "When to stop and ask the user", lists the cases that stop
this loop. Nothing else stops it. End each turn with a subagent or a
pass running, or with the next step started.

When a question arises that `AGENTS.md`, this file, or their references
already answer, state the decision, cite the rule, and continue. Triage
every other question by what it blocks:

- Does not block anything: append to `.agents/questions.md` with the
  provisional decision and continue.
- Blocks only the current slice: park the slice (the worker reports what
  blocked it without committing), append to `.agents/questions.md`,
  send a push notification, and take the next slice or goal.
- Blocks every next step: falls under `AGENTS.md`'s stop cases.

Entries stay open until the user answers. Open each progress report with
the count of open entries and the newest one.

Spawn a subagent only at the step that calls for one, fresh each time.
Spawn by agent type (such as `slice-worker`), not by copying its
instructions into a prompt.

When the loop runs under `/loop`, set a long wakeup interval while work
is in flight and a short one when idle. End the loop with
`ScheduleWakeup stop` only for `AGENTS.md`'s stop cases; running low on
context is not a reason to stop.

## Reports

Under `/loop`, relay one report per worker iteration: the slice that
closed, the development score before and after, any bug the worker hit,
and which slice or goal the loop takes next. Every figure comes from
your measurement in step 4; do not use figures the worker reports.

Keep updates brief and specific: report changed behavior, remaining
work, and the next check when useful. Do not repeat unchanged status.
Explain specialized terms on first use. When switching between
implementation, validation, and review, state the switch and the reason
once. Review-pass reports follow `.agents/review.md`.
