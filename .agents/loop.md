# Continuous operation

This file holds the loop that runs implementation: the four agent roles, the
orchestrator's steps, question triage, phase logging, the goal budget, the
wakeup discipline under `/loop`, and the report each worker iteration owes the
user. Only the orchestrator follows this file. `.agents/workflow.md` defines
the vocabulary this file uses, and `.agents/review.md` states when a formal
review pass is due and how to run and record one.

Keep a goal active while completing small, coherent, source-faithful
implementation chunks within the limits in `.agents/review.md`, "Review
scheduling".

Implementation, review, and further implementation alternate inside one goal.
Four agents run that loop, and no agent performs more than one of these jobs.

- The **goal-selector** runs when no goal is in progress. It applies
  `.agents/selection.md` to propose the next goal. It writes nothing; the
  slice-selector divides the goal once it is in progress.
  `.claude/agents/goal-selector.md` is its brief.
- The **slice-selector** runs while a goal is in progress. It applies
  `.agents/selection.md` to identify the next slice inside that goal. It writes
  nothing. `.claude/agents/slice-selector.md` is its brief.
- The **worker** closes exactly one slice, taking it from queued to closed in
  a single run: trace it to upstream source, implement it, record a
  fresh case with the C reference program and replay it as
  `.agents/validation.md` requires, and commit the result. A worker that
  cannot reach that state commits nothing and reports what blocked it, so the
  slice stays queued. It does not run a formal review pass or read a threshold.
  In the quality ledger it records deferrals only.
  `.claude/agents/slice-worker.md` is its brief.
- The **orchestrator** spawns the other three, measures independently what the
  worker landed, and owns every formal review pass.

The orchestrator repeats, without returning to the user between its steps:

1. When no goal is in progress, open the first goal
   `node scripts/goal-log.mjs --current` reports queued. When none is queued,
   ask the goal-selector for the next one and record it yourself with
   `queue-goal`: the traced source findings go in `--detail` and the
   look-ahead forecast goes in `--forecast-steps` and `--forecast-basis`, with
   one `--forecast-witness '<session>=<C-path evidence>'` for every contributing
   session. Restate a queued forecast after re-ranking; never open it with stale
   figures. Then `open-goal` it, which captures the score standing the close
   will be measured against, and take its first queued slice. When it lists
   none, ask the slice-selector and `queue-slice` the answer. Both selectors
   report; only you write.
2. Spawn a worker for that slice. When it returns, establish independently what
   landed: `git log --oneline` and `git status --short` for the commits and the
   tree, and `npm run checkpoint` for the suite and the development score.
   Accept no figure from the worker that these commands measure. Add
   `git log --oneline origin/main..HEAD` for what is not pushed. Push whatever
   the worker left behind and every commit you landed yourself, then watch the
   run from a background task as "Pushing and CI" states.
3. Run `npm run quality` yourself; no worker reports it. Its single
   `Review since <frontier>` line reports the running debt: `WATCH` prints
   the counts against the gate, and `DUE` is the gate that stops
   implementation until the required pass has run, its confirmed findings
   are applied, and its entry is recorded. `.agents/review.md`, "When a
   correctness pass is due", defines the gate.
4. When a slice closes, continue at step 1. When the last slice of the goal
   closes, satisfy the readiness requirements in `.agents/review.md` and run the
   goal's full correctness pass, then continue at step 1.
5. When a goal closes, run the authorized holdout evaluation and record its
   result with the goal's evidence. Dispose of every open deferral in the
   areas the goal touched, read from `npm run quality -- deferrals --area
   <id>`: fix a `small` one in the goal's audit-fix commit and resolve its
   entry, queue a `slice` one as a queued slice, or state in the closing
   report why it stays open. Close the goal with
   `node scripts/goal-log.mjs close-goal`, which records delivered figures
   beside the forecast from the score log; the closed entry stays in
   `GOALS.json` as the calibration record. Continue at step 1.

A formal review pass is a step of this loop, and the orchestrator runs it.

Commits landing while a pass reviews a frozen range are expected. They fall
outside that range and belong to the next one. They do not block the pass and
the pass does not block them. They do constrain the readiness requirements in
`.agents/review.md`, which requires no non-exempt review debt at a batching
threshold outside the frozen range. Clear that debt when declaring readiness.
Implementation commits may land while the debt stands.

`AGENTS.md` lists the four cases that stop this loop for the user. Nothing else
stops it. An iteration ending at a clean committed state is a reason to start
the next iteration. End each turn with a subagent or a pass running, or with
the next step started.

Do not end a turn on a question that `AGENTS.md`, this file, or the files they
name already answer; state the decision, cite the rule, and continue. Triage
every other question by what it blocks. A question that blocks nothing goes
into `.agents/questions.md` as an appended entry recording the provisional
decision the loop took, and the loop continues. A question that blocks only
the current slice parks that slice (the worker commits nothing and reports
the blocker, so the slice stays queued), goes into the queue, fires a push
notification to the user, and the loop takes the next slice or goal. A
question that blocks every next step is the fourth stop case in `AGENTS.md`
and stops the loop. Entries stay open until the user answers them; open each
progress report with the count of open entries and the newest one.

Mark phase boundaries as they happen: `node scripts/phase-log.mjs start
<phase>` and `end <phase>`, with `--goal <id>`, around selection (`select`),
each worker run (`implement`), and each formal review pass (`review`).
`validate` rows are optional and are the only record of validation time, now
that a scoring run appends no `SCORE.tsv` row.
`node scripts/phase-log.mjs --summary` totals the phases; judge the goal budget
against it, and commit `PHASES.tsv` with the work that ended the phase.

A goal carries a budget. When six hours of wall clock pass without a slice
closing on a measured development-screen gain, close the goal where it
stands with `node scripts/goal-log.mjs close-goal` and continue at step 1. A slice closing with a measured gain resets the budget.
Closing on budget is a measurement of the forecast; it needs no user
decision and does not stop the loop.

Spawn a subagent only at the step that calls for one, and spawn a fresh one
each time: a worker to take the next queued slice from queued to closed, a
slice-selector when the goal in progress has no queued slice left, a
goal-selector when no goal is queued. None of them persists between steps.
Spawn each one by its agent type, such as `slice-worker`. The type loads the
brief and the model its definition pins; copying the brief into a prompt
instead loses that. Run it in the background and let its completion
notification advance the loop.

When the loop runs under `/loop`, the wake signal is a worker or a pass
completing, and the scheduled wakeup is only a watchdog against a broken
notification chain. Set the wakeup to a long interval while work is in flight
and a short one when nothing is running, and advance the loop only on the wake
signal. End the loop with `ScheduleWakeup stop` only for one of those four
cases; running low on context is not one, because the loop survives compaction.

## The report per worker iteration

Under `/loop`, relay one report to the user for each worker iteration: the
slice that closed, the development score before and after, any bug the worker
hit, and where the port stops next. Every figure in that report comes from
your own measurement in step 2 of the loop, never from the worker's report.
