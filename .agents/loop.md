# Continuous operation

This file defines the orchestration loop: the four agent roles, the
orchestrator's steps, question triage, phase logging, scheduling under
`/loop`, and the per-iteration progress report. Only the orchestrator
follows this file. `.agents/workflow.md` defines the vocabulary this file
uses, and `.agents/review.md` states when a formal review pass is due and
how to run and record one.

The orchestrator keeps a goal active while completing small, coherent
implementation slices that follow the C source, within the limits in
`.agents/review.md`, "Review scheduling".

Implementation and review alternate inside one goal. Four agents share that
work, and each agent performs exactly one role.

- The **goal-selector** runs when no goal is in progress. It applies
  `.agents/selection.md` to propose the next goal. It writes nothing; the
  slice-selector divides the goal once it is in progress.
  `.claude/agents/goal-selector.md` is its brief (the instruction file
  loaded when the agent spawns).
- The **slice-selector** runs while a goal is in progress. It applies
  `.agents/selection.md` to identify the next slice inside that goal. It writes
  nothing. `.claude/agents/slice-selector.md` is its brief.
- The **worker** closes exactly one slice, taking it from queued to closed in
  a single run: trace it to upstream source, implement it, record a
  fresh case with the C reference program and replay it as
  `.agents/validation.md` requires, and commit the result. A worker that
  cannot reach that state commits nothing and reports what blocked it, so the
  slice stays queued. It does not run a formal review pass or check the
  review-debt gate. It records only deferrals, through
  `npm run quality -- defer`. `.claude/agents/slice-worker.md` is its brief.
- The **orchestrator** spawns the other three, measures independently what the
  worker landed, and owns every formal review pass.

The orchestrator repeats, without returning to the user between its steps:

1. When no goal is in progress, ask the goal-selector for the next one. It
   ranks every candidate by restated capped forecast (as
   `.agents/selection.md` defines), applying the same ranking to both queued
   goals and census boundaries. When two candidates have the same capped
   forecast, a queued goal whose tracing (the source analysis recorded in
   its queue entry) is already done wins the tie. That tracing grants no
   other precedence. Record an unqueued winner with `queue-goal`: the traced
   source findings go in `--detail` and the look-ahead forecast goes in
   `--forecast-steps` and `--forecast-basis`, with one
   `--forecast-witness '<session>=<C-path evidence>'` for every contributing
   session. Before opening a goal, rerun the census so the forecast reflects
   the current development score. Then `open-goal` it, which captures the
   score standing the close will be measured against, and take the goal's
   first queued slice. When the goal has no queued slice, ask the
   slice-selector and `queue-slice` the answer. Both selectors return their
   recommendation. Only you record it.
2. Spawn a worker for that slice. When it returns, establish independently
   what landed: `git log --oneline` and `git status --short` for the commits
   and the tree, and `npm run checkpoint` for the suite and the development
   score. Accept no figure from the worker that these commands measure. Add
   `git log --oneline origin/main..HEAD` for what is not pushed. Push
   whatever the worker left behind and every commit you landed yourself,
   then watch the CI run from a background task as `.agents/workflow.md`,
   "Pushing and CI", states.
3. Run `npm run quality` yourself; no worker reports it. Its single
   `Review since <frontier>` line reports how much unreviewed code has
   accumulated. `DUE` is the review-debt gate that stops implementation
   until the required pass has run, its confirmed findings are applied,
   and its entry is recorded. `WATCH` prints the current counts against
   that gate. `.agents/review.md`, "When a correctness pass is due",
   defines the gate.
4. When a slice closes, append its `SCORE.tsv` row as `.agents/scoring.md`,
   "Score evidence", requires, in the commit that records the closure in
   `GOALS.json`. The row's `sha` and figures come from step 2's measurement.
   Continue at step 1. When three consecutive slice closes leave the
   development score unchanged in `SCORE.tsv`, take no further slice from
   the goal until you rerun the census (the scan of session mismatches that
   identifies implementation candidates) and restate the goal's remaining
   capped forecast. Record in the goal entry either why the remaining
   slices outrank the census leader, or the split: close the delivered
   part, and move each remaining obligation to the deferral ledger with
   `npm run quality -- defer`. A sequence of slices whose queue entry
   records that the development score will change within the next two
   slices is exempt from the census rerun and forecast restatement. When
   the last slice of the goal closes, satisfy the readiness requirements in
   `.agents/review.md` and run the goal's full correctness pass, then
   continue at step 1.
5. When a goal closes, run the authorized holdout evaluation and record its
   result with the goal's evidence. Resolve every open deferral the goal's
   commits closed, read from `npm run quality -- deferrals --area <id>` for
   the areas the goal touched; the rest stay open, and none becomes a
   queued slice. Close the goal with `node scripts/goal-log.mjs close-goal`,
   which records delivered figures beside the forecast from the score log;
   the closed entry stays in `GOALS.json` so that forecast accuracy can be
   compared against delivered results. Continue at step 1.

A formal review pass is a step of this loop, and the orchestrator runs it.

Commits landing while a pass reviews a fixed range of code are expected.
They fall outside that range and belong to the next one. They do not block
the pass and the pass does not block them. They do constrain the readiness
requirements in `.agents/review.md`, which requires that all review debt at
a batching threshold outside the frozen range is either cleared or exempt.
Clear that debt when declaring readiness. Implementation commits may land
while the debt stands.

`AGENTS.md` lists the four cases that stop this loop for the user. Nothing else
stops it. An iteration ending at a clean committed state is a reason to start
the next iteration. End each turn with a subagent or a pass running, or with
the next step started.

Do not end a turn on a question that `AGENTS.md`, this file, or the files
they name already answer; state the decision, cite the rule, and continue.
Triage every other question by what it blocks. A question that blocks
nothing goes into `.agents/questions.md` as an appended entry recording the
provisional decision the loop took, and the loop continues. A question
that blocks only the current slice parks that slice (the worker commits
nothing and reports the blocker, so the slice stays queued), goes into
`.agents/questions.md`, fires a push notification to the user, and the
loop takes the next slice or goal. A question that blocks every next step
is the fourth stop case in `AGENTS.md` and stops the loop. Entries stay
open until the user answers them; open each progress report with the
count of open entries and the newest one.

Mark phase boundaries as they happen: `node scripts/phase-log.mjs start
<phase>` and `end <phase>`, with `--goal <id>`, around selection (`select`),
each worker run (`implement`), and each formal review pass (`review`).
`validate` rows are optional. They are the only record of validation time,
because scoring runs do not append `SCORE.tsv` rows.
`node scripts/phase-log.mjs --summary` totals the phases; commit `PHASES.tsv`
with the work that ended the phase.

Spawn a subagent only at the step that calls for one, and spawn a fresh one
each time: a worker to take the next queued slice from queued to closed, a
slice-selector when the goal in progress has no queued slice left, a
goal-selector when no goal is queued. None of them persists between steps.
Spawn each one by its agent type, such as `slice-worker`. The agent type
loads both the brief and the model that its definition file specifies.
Copying the brief text into a prompt bypasses the model selection. Run it
in the background and let its completion notification advance the loop.

When the loop runs under `/loop`, the wake signal is a worker or a pass
completing, and the scheduled wakeup is only a watchdog against a broken
notification chain. Set the wakeup to a long interval while work is in
flight and a short one when nothing is running, and advance the loop only
on the wake signal. End the loop with `ScheduleWakeup stop` only for one
of those four cases. Running low on context is not a reason to stop,
because the loop survives context-window compaction.

## The report per worker iteration

Under `/loop`, relay one report to the user for each worker iteration: the
slice that closed, the development score before and after, any bug the
worker hit, and which slice or goal the loop takes next. Every figure in
that report comes from your own measurement in step 2 of the loop. Do not
use figures the worker reports.
