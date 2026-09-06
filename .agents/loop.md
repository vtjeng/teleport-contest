# Continuous operation

This file defines the orchestrator's loop: goal selection, span iteration,
measurement, and the reviews it may call for.

`.agents/glossary.md` defines the terms this file uses.
`.agents/review.md` states when a correctness review is warranted and how to
run one.

The orchestrator repeats without returning to the user between steps:

   On entry (or after a restart), check
   `node scripts/goal-log.mjs --current` for the current state:

   - No goal in progress: start at step 1.
   - Goal in progress, a span is queued: the worker may have been interrupted.
     Run `git log --oneline` and check `.cache/checkpoint-summary.json` to
     establish what it landed. If the span's commits landed, skip the worker
     and continue with step 3's measurement and push; otherwise start at
     step 3 and spawn the worker.
   - Goal in progress, no queued span: start at step 2.

1. When no goal is in progress, select the next goal.

   a. Check the queue: run `node scripts/goal-log.mjs --current --detail`.
      If a goal is already queued, take it and skip to step 1c.
   b. Run `node scripts/divergence-queue.mjs`. When every development session
      matches and `ROADMAP.md` lists no unported function, the port is
      complete: stop the loop and notify the user. Otherwise choose the goal
      by the order in `.agents/selection.md`, "Choosing a goal", and queue it
      with `node scripts/goal-log.mjs queue-goal`.
   c. Open the goal with `node scripts/goal-log.mjs open-goal --id <id>`,
      which captures the development standing, and commit `GOALS.json` with
      a message that starts `Open <id> goal`.
2. Plan the next span with `node scripts/goal-log.mjs next-span --goal <id>`.
   It re-reads `js/`, queues the span in `GOALS.json`, and writes
   `.cache/span-context.json` for the worker. When it reports that every
   function is ported, the goal has no span left: go to step 6. Otherwise
   commit `GOALS.json` with a message that starts `Queue <span name> span`.
   For a divergence fix, name the span yourself with `queue-span` and write
   the context file from `.agents/divergence.md`, step 2.
3. Spawn a span worker (`.claude/agents/span-worker.md`) for that span. When
   the worker returns, establish what landed with
   `git log --oneline origin/main..HEAD` and `git status --short`. The worker
   runs `npm run checkpoint` after committing, so
   `.cache/checkpoint-summary.json` describes the committed state: read that
   file and use its figures. Rerun checkpoint only when the file is missing or
   its `commit` does not match `git rev-parse HEAD`. Push before the turn ends.

   Watch the CI run from a background task (`gh run list --limit 1`,
   then `gh run watch <id> --exit-status`). CI can fail where a local
   checkpoint passes because CI runs from a fresh checkout; start the
   next step without waiting. When a run fails, diagnose, fix, push,
   and watch the new run before the current span closes. The `gh`
   commands require `gh repo set-default vtjeng/teleport-contest`; run
   it if `gh run list` shows unfamiliar runs.
4. Run `npm run quality` yourself; no worker reports it. It prints the
   unreviewed debt for information, and nothing in that output forces a
   review. Decide whether a correctness review is warranted by
   `.agents/review.md`, "When a correctness review is warranted".
5. When a span closes, close it with `node scripts/goal-log.mjs close-span`,
   regenerate `ROADMAP.md` with `node scripts/goal-log.mjs roadmap`, and
   append the span's `SCORE.tsv` row as `.agents/scoring.md` requires, in the
   commit that records the closure in `GOALS.json`. The row's `sha` and
   figures come from step 3's measurement. Continue at step 2.
6. When a goal closes, for a file port confirm that its recipes reach each
   entry point of the file (`AGENTS.md`, "Validate completed work"). Then run
   the authorized holdout evaluation and record its result with the goal's
   evidence. Resolve every open deferral the goal's commits closed, using
   `npm run quality -- deferrals --area <id>` for the areas the goal touched;
   the rest stay open, and none becomes a queued span. Close the goal with
   `node scripts/goal-log.mjs close-goal`, regenerate `ROADMAP.md`, and
   continue at step 1.

A correctness review, when one is warranted, is a loop step between spans.
Commits that land while a review reads its fixed range belong to the next
review.

`AGENTS.md`, "When to stop and ask the user", lists the cases that stop
this loop. Nothing else stops it. End each turn with a subagent or a
review running, or with the next step started.

When a question arises that `AGENTS.md`, this file, or their references
already answer, state the decision, cite the rule, and continue. Triage
every other question by what it blocks:

- Does not block anything: append to `.agents/questions.md` with the
  provisional decision and continue.
- Blocks only the current span: park the span (the worker reports what
  blocked it without committing), append to `.agents/questions.md`,
  send a push notification, and take the next span or goal.
- Blocks every next step: falls under `AGENTS.md`'s stop cases.

Entries stay open until the user answers. Open each progress report with
the count of open entries and the newest one.

Spawn a fresh subagent by agent type (such as `span-worker`) only at
the step that calls for one.

When the loop runs under `/loop`, set a long wakeup interval while work
is in flight and a short one when idle. End the loop with
`ScheduleWakeup stop` only for `AGENTS.md`'s stop cases; running low on
context is not a reason to stop.

## Reports

Under `/loop`, relay one report per worker iteration: the span that
closed, the development score and recordings result before and after, any
bug the worker hit, and which span or goal the loop takes next. Every figure
comes from your measurement in step 3; do not use figures the worker reports.

Keep updates brief and specific: report changed behavior, remaining
work, and the next check when useful. Do not repeat unchanged status.
When switching between implementation, validation, and review, state the
switch and the reason once. Review reports follow `.agents/review.md`.
