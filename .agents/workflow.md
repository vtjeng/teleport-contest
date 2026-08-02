# How work flows

Read this file for the vocabulary the other instruction files use, for the loop
that runs implementation, and for the sequence every implementation chunk
follows before it is committed.

Three sibling files cover the rest. `.agents/selection.md` states what to
implement next, `.agents/validation.md` states how to prove a change is right,
and `.agents/review.md` states when a formal review pass is due and how to run
and record one.

## Terms

Work is nested in four levels. A **coherent implementation chunk** is part of
a **behavior slice**; slices make up a **goal**; goals make up a **milestone**.
A slice is the unit of evidence, a goal is the unit of review, and a milestone
labels the system a goal belongs to.

A slice, a goal, or a milestone is **in progress** from the moment work starts
on it until it **closes**. Work written down but not begun is **queued**.
Closing takes more than stopping: a slice closes on the evidence stated below,
and a goal closes when its last slice does.

A **coherent implementation chunk** is one reviewable production change with
its focused tests. A chunk may be one of several commits inside a behavior
slice.

A **behavior slice** runs from a starting point in the running game to the
next boundary at which the game's output can be observed. It closes only when
its real consumer runs and a fresh end-to-end differential verifies the
boundary. The real consumer is the production game path that consumes the new
behavior; `.agents/validation.md`, "Fresh differentials", states how to run a
fresh differential. A slice is the unit of evidence.

A **goal** is one coherent unit of behavior inside the current milestone. It may
hold several ordered behavior slices. When a slice meets the conditions in
"Implementation checklist", `.agents/implementation-checklist.md` carries the
goal's state between sessions. A goal is the unit of review: when its last
slice closes, a full correctness pass covers it.

A **milestone** is a group of related game systems: exploration, combat and
creatures, item interaction, and so on. It labels the system a goal belongs to.
`scripts/scan-debt.mjs` selects each goal from every owner the development
sessions need; `.agents/selection.md` states how to run it.

A **review window** is the bounded group of related implementation chunks
covered by one scheduled correctness review. A review window completes when
that review, its required fixes, and the required post-fix validation are
finished.

An **evidence snapshot** is one `SCORE.md` row for the exact integrated code
state at a full commit SHA. Preserve a snapshot when a behavior slice or review
window completes, the score changes, or a result is published. The quality
ledger is `QUALITY.json`, which records completed correctness and
simplification passes. Formal review ranges remain in that ledger. Routine chunks collect score and validation evidence
too, and do not add a `SCORE.md` row.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`.

A **formal review pass** is an independent structured review of a frozen
committed range. It comes in four kinds: correctness, clarity, simplification,
and copyediting. The orchestrator invokes the skill that `.agents/review.md`
names for the kind it needs, which runs its reviewers as parallel subagents and
reports possible problems; the orchestrator reviews each finding and applies
only fixes for confirmed findings. All four kinds follow the process rules in
`.agents/review.md`, "Running formal review passes".

**Audit** means the same thing. That word is fixed in the skill names
`/audit-diff-correctness` and `/audit-diff-clarity`, and in the `Audit-fix-for:`
commit trailer.

## Continuous operation

Keep a goal active while completing small, coherent, source-faithful
implementation chunks within the limits in `.agents/review.md`, "Review
scheduling".

Implementation, review, and further implementation alternate inside one goal.
Four agents run that loop, and no agent performs more than one of these jobs.

- The **goal-selector** runs when no goal is in progress. It applies
  `.agents/selection.md` to propose the next goal and the ordered behavior
  slices that close it. It writes nothing.
  `.claude/agents/goal-selector.md` is its brief.
- The **slice-selector** runs while a goal is in progress. It applies
  `.agents/selection.md` to identify the next slice inside that goal. It writes
  nothing. `.claude/agents/slice-selector.md` is its brief.
- The **worker** closes exactly one slice, taking it from queued to closed in
  a single run: trace it to upstream source, implement it, record a
  fresh case with the C reference program and replay it as
  `.agents/validation.md` requires, and commit the result. A worker that
  cannot reach that state commits nothing and reports what blocked it, so the
  slice stays queued. It runs no formal review pass, reads no threshold,
  and records nothing in the quality ledger. `.claude/agents/slice-worker.md`
  is its brief.
- The **orchestrator** spawns the other three, measures independently what the
  worker landed, and owns every formal review pass.

The orchestrator repeats, without returning to the user between its steps:

1. When no goal is in progress, start the first goal queued in `ROADMAP.md`.
   When no goal is queued either, ask the goal-selector for the next one,
   write it to `ROADMAP.md` yourself with the traced source findings that
   justify it, re-pin the commit the census ran against, and start it. Then
   take the first queued slice that goal lists. When it lists no queued
   slice, ask the slice-selector for the next slice inside it. Both selectors
   report; only you write.
2. Spawn a worker for that slice. When it returns, establish independently what
   landed: `git log --oneline` and `git status --short` for the commits and the
   tree, and `npm run checkpoint` for the suite and the development score.
   Accept no figure from the worker that these commands measure. Add
   `git log --oneline origin/main..HEAD` for what is not pushed. Push whatever
   the worker left behind and every commit you landed yourself, then watch the
   run to `success` as "Pushing and CI" requires.
3. Run `npm run quality` yourself; no worker reports it. The advisory
   checkpoint and the gate are the two per-area thresholds that `QUALITY.json`
   configures and `npm run quality` measures; `.agents/review.md`,
   "When a correctness pass is due", defines them. An advisory checkpoint leaves
   implementation running: note it and continue. A fired gate stops
   implementation until the required pass has run, its confirmed findings are
   applied, and its entry is recorded. `.agents/review.md` also defines a
   per-slice shared review window; `npm run quality` measures it and prints
   it as the `Review window` line.
4. When a slice closes, continue at step 1. When the last slice of the goal
   closes, satisfy the readiness note in `.agents/review.md` and run the
   goal's full correctness pass, then continue at step 1.
5. When a goal closes, run the authorized holdout evaluation and record its
   result with the goal's evidence. Dispose of every open deferral in the
   areas the goal touched, read from `npm run quality -- deferrals --area
   <id>`: fix a `small` one in the goal's audit-fix commit and resolve its
   entry, queue a `slice` one as a queued slice, or state in the closing
   report why it stays open. Delete the goal from `ROADMAP.md` and continue
   at step 1.

A formal review pass is a step of this loop, and the orchestrator runs it.

Commits landing while a pass reviews a frozen range are expected. They fall
outside that range and belong to the next one. They do not block the pass and
the pass does not block them. They do constrain the readiness note in
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

A goal carries a budget. When six hours of wall clock pass without a slice
closing on a measured development-screen gain, close the goal where it
stands, record delivered steps against the forecast in `ROADMAP.md`, and
continue at step 1. A slice closing with a measured gain resets the budget.
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

## Per-chunk workflow

For every coherent implementation chunk:

1. Connect the production game path that consumes the new behavior (the real
   consumer), then run the checks in `.agents/validation.md`.
2. Assign every new `js/` file to exactly one `QUALITY.json` area as soon as
   the file is created. Count untracked production files toward review limits
   before the `npm run quality` scheduling dashboard can measure them. Even
   when the dashboard reports no debt, an unassigned `js/` file still needs
   its `QUALITY.json` area, and a threshold overrun you counted by hand still
   counts toward review limits.
3. Commit the implementation, then run `npm run quality` to display the
   scheduling dashboard.
4. Directly review source behavior, PRNG and evaluation order, parsing, state
   ownership, persistence, input boundaries, and rendering. Small mechanical
   or test-only changes may rely on immediate diff inspection and tests, but
   include them in the next scheduled correctness pass.
5. Collect score and validation evidence for the current behavior slice or
   review window. Publish it as specified in `.agents/validation.md`; do not
   add a routine per-chunk `SCORE.md` row.

A final integration runner, fixture, or test may remain uncommitted while it is
changing. Commit completed production behavior and focused tests as soon as
they are done. Commit each final integration artifact once it stops changing,
together with any code it validates that is not yet committed.

Close a behavior slice only after its real consumer executes and a fresh
end-to-end differential verifies the PRNG log, complete screens and attributes,
cursors, and persisted state through the next boundary. Unit tests can validate
a prerequisite but cannot close a dormant path.

## Pushing and CI

Push when a behavior slice closes, and push any other commit, an evidence-only
one included, before the turn ends. CI does not see a commit until it is
pushed, and it can fail where a local checkpoint passes, because it runs from a
fresh checkout on the Node version `.github/workflows/score.yml` pins,
currently 22.

```
gh run list --limit 1
gh run watch <id> --exit-status
```

Neither command needs a `--repo` flag: `gh repo set-default
vtjeng/teleport-contest` is set in this clone, and linked worktrees share that
config. Without it `gh` answers for `davidbau/teleport-contest`, the `upstream`
remote, whose runs belong to someone else and stopped in June 2026, so a push
looks as though it started no run at all. If `gh run list` ever shows runs you
do not recognize, run `set-default` again.

After pushing, watch the run from a background task and start the next slice
without waiting; the two runs measured on 1 August 2026 took 1 minute 47
seconds and 1 minute 41 seconds. When a watched run fails, reopen the work
that pushed it as the current slice's first item: diagnose the failure, fix
it, push, and watch the new run before the current slice closes.

## Implementation checklist

Create or replace `.agents/implementation-checklist.md` from
`.agents/implementation-checklist-template.md` when a behavior slice is
expected to:

- span sessions;
- cross subsystems; or
- reach about 500 changed production lines.

Create the checklist as soon as a smaller slice grows to meet any of these
three conditions.

The orchestrator owns the checklist. Build the checklist's candidate entries
from upstream entry points, dispatch tables, catalogs, reachable helpers, and
valid input or configuration families. Cross-check those entries against
JavaScript stops, fallbacks, no-ops, and replay code. Maintain the list
throughout implementation. Passing samples do not prove completeness. When a
fresh case exposes an omitted path, add it and inspect related branches owned
by the same upstream function or subsystem.

Remain in `Implementation` mode while any checklist entry is `missing` or
`undecided`. `.agents/implementation-checklist-template.md`, under
"Readiness", defines that mode and the alternative, `Ready for audit`. Before a
formal review pass, the checklist evidence must apply to the exact committed
head. After
the slice closes and its evidence is recorded in existing trackers, remove the
checklist or replace it for the next qualifying slice. Smaller slices may keep
equivalent information in their commit messages and in the readiness note
in `.agents/review.md`.

## Progress reports

During implementation, validation, or review work, keep updates brief, natural,
and specific. Report changed behavior, remaining work, and the next check when
useful. Do not force routine updates into fixed labels or repeat unchanged
status. Explain specialized terms on first use.

Under `/loop`, relay one report to the user for each worker iteration: the
slice that closed, the development score before and after, any bug the worker
hit, and where the port stops next. Every figure in that report comes from
your own measurement in step 2 of the loop, never from the worker's report.

State a workflow-mode change once and explain why. Formal readiness notes and
pass reports keep their required structures. Planning, process discussion,
questions, and other meta-conversation use ordinary prose.
