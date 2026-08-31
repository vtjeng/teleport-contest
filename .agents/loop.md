# Continuous operation

This file defines the orchestrator's loop: goal selection, slice iteration,
measurement, and review scheduling.

`.agents/workflow.md` defines the terms this file uses, and
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
   b. Check the pipeline: run
      `node scripts/pipeline-candidates.mjs --ready-winner` and parse
      its JSON output. If `winner` is non-null, continue to step 1d.
   c. If `winner` is null, run the `candidate-pipeline` workflow
      (`.claude/workflows/candidate-pipeline.js`) and wait for it to
      finish. If the Workflow tool is not available, spawn the
      candidate-pipeline agent
      (`.claude/agents/candidate-pipeline.md`) instead.
      When preparation finishes, rerun
      `node scripts/pipeline-candidates.mjs --ready-winner`. If `winner`
      is now non-null, continue to step 1d. If `winner` is still null
      after preparation, all candidates are exhausted — stop the loop
      and notify the user.
   d. Write `.cache/goal-context.json` from the winner's data:

      ```json
      {
        "id":            "<winner.id>",
        "boundary":      "<winner.boundary>",
        "owners":        ["<winner.owners>"],
        "forecastSteps": "<winner.cappedForecast>",
        "forecastBasis": "Capped look-ahead at <winner.member>",
        "sessions":      ["<winner.sessions[].session>"],
        "witnesses":     [{"session": "...", "evidence": "..."}],
        "detail":        "<winner.detail>"
      }
      ```

      Map `cappedForecast` to `forecastSteps`. Summarize the capping
      basis as `forecastBasis`. Extract session names from the sessions
      array. Copy `witnesses` and `detail` from the winner's metadata.
      Queue the proposed goal with
      `node scripts/goal-log.mjs queue-goal`.
   e. Open the goal with `node scripts/goal-log.mjs open-goal` (which
      captures the score the close will be measured against).
2. Spawn a non-blocking background agent to run the
   `candidate-pipeline` workflow
   (`.claude/workflows/candidate-pipeline.js`). Do not wait for it to
   finish.
3. Spawn the slice-selector (`.claude/agents/slice-selector.md`) to
   identify the next slice, queue it with
   `node scripts/goal-log.mjs queue-slice`, and write
   `.cache/slice-context.json` for the worker.

   Before spawning the slice-selector, verify that
   `.cache/goal-context.json` describes the current goal. The
   candidate-pipeline writes this file; update it only when it is missing or
   describes a different goal.
4. Spawn a worker for that slice. When the worker returns, establish
   what landed:
   `git log --oneline origin/main..HEAD` and `git status --short` for the
   unpushed commits and tree. The worker runs `npm run checkpoint` after
   committing, so `.cache/checkpoint-summary.json` describes the committed
   state. Read that file and use its figures. Re-run checkpoint only if
   the file is missing or its `commit` does not match
   `git rev-parse HEAD`. Push whatever the worker left behind and every
   commit you landed, then watch the CI run from a background task as
   `.agents/workflow.md`, "Pushing and CI", states.

5. Run `npm run quality` yourself; no worker reports it. If the output
   shows `DUE`, run the required review pass before continuing
   implementation. `.agents/review.md`, "When a correctness pass is due",
   defines the gate and the output format.
6. When a slice closes, append its `SCORE.tsv` row as `.agents/scoring.md`
   requires, in the commit that records the closure in
   `GOALS.json`. The row's `sha` and figures come from step 4's measurement.
   Continue at step 3. When the last slice of the goal closes,
   continue at step 7.
7. When a goal closes, run the authorized holdout evaluation and record its
   result with the goal's evidence. Resolve every open deferral the goal's
   commits closed, read from `npm run quality -- deferrals --area <id>` for
   the areas the goal touched; the rest stay open, and none becomes a
   queued slice. Close the goal with `node scripts/goal-log.mjs close-goal`.
   Continue at step 1.

A formal review pass is a step of this loop, and the orchestrator runs it.

Commits may land while a formal review pass reviews its fixed range. They
belong to the next pass, and neither the pass nor the commits block the
other. `.agents/review.md` states the readiness constraint.

`AGENTS.md`, "When to stop and ask the user", lists the cases that stop
this loop. Nothing else stops
it; an iteration ending at a clean committed state is a reason to start the
next. End each turn with a subagent or a pass running, or with the next
step started.

When a question arises that `AGENTS.md`, this file, or their references
already answer, state the decision, cite the rule, and continue. Triage
every other question by what it blocks:

- If it does not block anything, append it to `.agents/questions.md` with the
  provisional decision the loop took and continue.
- If it blocks only the current slice, park the slice (the worker reports
  what blocked it without committing, so it stays queued), append the entry
  to `.agents/questions.md`, fire a push notification to the user, and take
  the next slice or goal.
- If it blocks every next step, it falls under `AGENTS.md`'s stop cases
  and stops the loop.

Entries stay open until the user answers them. Open each progress report
with the count of open entries and the newest one.

Spawn a subagent only at the step that calls for one, fresh each time.
Spawn by agent type (such as `slice-worker`), not by copying its
instructions into a prompt.

When the loop runs under `/loop`, set a long wakeup interval while work is
in flight and a short one when idle. End the loop with `ScheduleWakeup stop`
only for the stop cases `AGENTS.md` lists; running low on context is not a
reason to stop.

## The report per worker iteration

Under `/loop`, relay one report per worker iteration: the slice that
closed, the development score before and after, any bug the worker hit, and
which slice or goal the loop takes next. Every figure comes from your own
measurement in step 4. Do not use figures the worker reports.
