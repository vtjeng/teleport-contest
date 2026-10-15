---
name: span-worker
description: Source implementation and evidence procedure for a general worker assigned an implementation or implementation-rework task.
---

This is an assignment-specific guide, not a permanent worker role. Start at
`.claude/agents/queue-worker.md` and `.agents/architecture.md`. Their queue,
worktree, and rework rules govern execution. A queue claim returns a
`transport` ID for existing source-scope and submission commands below;
never use legacy `assign` to select a private next task.

## Read before you start

Read these sources:

- `.cache/task-context.json`, once source scope is known: the current task's
  goal ID, C or Lua source file, source units,
  source line ranges, line count, JavaScript file, and the sessions whose
  first mismatch the goal addresses. The orchestrator prepares the initial
  context; you prepare subsequent contexts using the `goal-log.mjs` planner's
  schema and source-order rules under `.agents/selection.md`
- The orchestrator's initial assignment and your subsequent scope
  announcements: absolute worktree, branch and base SHA, source reservations,
  allowed paths, dependencies and task ID. Preserve each delivery's context.
  `GOALS.json` supplies existing completion evidence, but its current open
  goal belongs to central integration and may differ from your assignment
- `.agents/validation.md`: what validating this task requires
- `.agents/glossary.md`: the work vocabulary
- `.agents/loop.md`: the orchestrator's scheduling and acceptance procedures
- `.agents/selection.md`: source scope, reservations and seed continuation

For an unresolved session, start from its saved queue entry and findings;
prepare the source context after diagnosis. Use the claimed mismatch entry
and `.agents/selection.md` to define source scope within this assignment;
subsequent tasks come from the same shared queue.
Do not refresh the global queue or roadmap merely to rediscover the
assignment. Before any write, verify `pwd`, `git rev-parse --show-toplevel`,
and the branch against the assignment. Use its absolute worktree path for
commands, edits and descendants. Refresh relevant evidence when implementation
changes its inputs or when the handoff is stale.

Before writing, read the complete C functions or Lua program in the task,
including Lua top-level statements. A task can pass over verified functions,
so C ranges need not be adjacent. List direct callees and inspect their
implementations and completion evidence. A matching name can still hide a
partial branch, obsolete guard, or injected substitute. Trace the production
callers and dispatchers as well as the callees; tests that call a function
directly do not establish runtime wiring. Port
a missing callee in this task when the C uses its return value; when the C
discards the result, call `note_unported()` and skip the call, as `AGENTS.md`,
"Port whole source units and wire their callers", states.

Finish this assignment and preserve its immutable result, then claim the next
eligible queue task. Keep the same agent and private worktree across task
types; use the assignment branch/base and stopping condition. Leave central
goal records, integration, acceptance, and publication to Main.
Do not open `.agents/review.md`; formal reviews belong to the orchestrator.
This restriction overrides the AGENTS.md reading row that names it.

## Scope

You are a persistent worker in one assigned worktree. Own one implementation
task at a time, including its investigation: the source it ports, the code and
tests it changes, the recipes and recordings it adds, and its immutable delivery commits. Run
focused tests, `npm run lint`, and required fresh differentials before
handoff. Do not push or perform a central merge. Run a full checkpoint only
if the orchestrator explicitly grants that validation slot. The orchestrator
integrates and validates the combined candidate, closes the goal record, records
scores and publishes. A submitted task is ready for integration, not yet
accepted.

Beyond code and tests:

- Propose the `QUALITY.json` area for each new `js/` file; the orchestrator
  applies the assignment before combined validation.
- Leave central `GOALS.json`, `SCORE.tsv`, quality/review records, instructions,
  aggregate scans and scoring to the orchestrator. Never merge worker copies
  of those records into main.

Do not run formal review passes or launch reviewer skills. If the task
needs one, say so in your report.

The local-holdout recordings are open and are part of the 44-session fixed
workload under `AGENTS.md`. Inspect and replay them when the task needs them;
default fixed scans and checkpoint scoring include all 44. Synthetic local
holdout failures now drive new work under `.agents/selection.md`; preserve
the assigned batch identity, recording hashes, and source investigation.
The orchestrator owns admitting new batches and their aggregate evaluations.
Leave `scripts/score-holdout.mjs` and aggregate score bookkeeping to the
orchestrator; implement behavior from the C source. The remote competition
holdout is outside this workspace.

Kill only a process you started; other agents may be active in this tree
and `ps` cannot distinguish their processes from yours. Wait for owned
commands using the harness's process handles and the ownership rules in
`.agents/architecture.md`. Use a result file for
completion only when no process handle or notification is available.

Never amend or force-push a commit that is already on `origin/main`, including
with `--force-with-lease`. To correct a commit message or a trailer after
pushing, add a follow-up commit that states the correction.

## Implementation evidence and legacy transport

The commands in this section operate on the claim's implementation
`transport`, not its execution task ID. They preserve existing evidence and
acceptance gates within the one ledger; they are not a separate scheduler.

Use the orchestrator's absolute shared-ledger path with
`scripts/worker-state.mjs --file`. Read `--help` for event fields and command
syntax. Record your connection, turn state, task, scope changes, and delivery
as they happen; do not edit the ledger JSON by hand.
When unassigned, idle or blocked turns include a public `summary` naming the dependency
or next action and its owner. Keep private details in `reason`; the dashboard
publishes only `summary`. Record an active turn when work resumes.
For a blocked claimed assignment, preserve its recovery commit and use
`work-queue.mjs block` before reporting an unassigned turn.

Claim through `work-queue.mjs` before investigating. Imported unresolved
sessions start an investigation transport with their canonical session ID,
session reservation, and report/cache write scope. Use the saved entry and
any valid cached investigation; avoid repeating an already established diagnosis.
Verify its source claims;
write the investigation using `.agents/selection.md`, "Investigation cache".
Do not edit game code while the task is an investigation.

Once the cause is source-traced, write `.cache/task-context.json` using the
schema of the exported `taskContext()` in `scripts/goal-log.mjs` and its
source-order rules. Choose a new goal ID and include the selected sessions
and their saved provenance. Do not run the `task-context` CLI for an unqueued
goal or edit `GOALS.json`; central goal creation happens at integration. Then
record an `implement` event with its goal ID, complete source reservations,
and allowed paths, retaining the session reservation and investigation paths.
This atomically claims source scope without waiting for a central goal or an
acknowledgement. If another worker owns the cause, send it the findings and
report path and block this assignment with the reason; Main may supersede it.
Use the
shared claim policy for another eligible task. Ask the orchestrator only when ownership or a shared contract needs a
decision. Commit the investigation separately before the code so the
orchestrator can preserve the diagnosis separately from the fix; include both in the delivery.

For an already diagnosed task, the queue claim still controls ownership.
Use its source context and transport ID; if it begins as an investigation,
claim implementation scope through `implement` before edits. A scope conflict
is a dependency to report to Main, not permission to bypass queue priority. Reserve the selected session,
functions and shared-state contracts you need; do not reserve whole files
indefinitely.
Ask the orchestrator before changing another worker's reserved function or
a shared contract. Update your allowed paths and reservations with a `scope`
event before expanding your edits.

After the completion conditions below are met, run `worker-state.mjs submit`.
Submission checks committed investigation reports before saving the delivery.
Fix a rejected report and submit a new commit.
Preserve each delivery's context and evidence separately. Include exact base
and delivery commits, dependencies, changed scope, check results, source
evidence, recordings and entry points, and unfinished work. Follow
`.agents/loop.md`, "Notifications". Save the result before claiming another task.
If notification fails, the saved submission still stands. Report an unfinished
task's progress or blocker without calling it ready.

When source code is ready but an entry point cannot yet produce matching
runtime evidence, keep the full planned function list in the task context.
Omit each unverified function from `evidence.functions` and put it in
`evidence.incompleteFunctions` with `name`, a source-based `reason`, and the
path to a committed `blockedRecipe` under `recipes/<source-file>/`. The
delivery needs either a verified function or a replay-verified entry point
for one of the incomplete functions. Acceptance preserves the worker's claims
and blockers without certifying whole functions or requiring a second source
review by the orchestrator.

Receipt, acceptance, and wakeups follow `.agents/loop.md`, "Notifications".
Completing the execution task does not accept its deliverable or release
pending-delivery source reservations. Corrections are new queued rework tasks
linked to the rejected revision under `.agents/architecture.md`; another
worker can own them. Preserve original commits and failed evidence. A new
claim supplies the required base and assignment branch; never amend or merge
over an immutable submitted revision to prepare for unrelated work.

## Source assistance

Workers do not spawn subagents. Propose a bounded survey or follow-up through
Main or Prep using the same queue. Continue source comparison within your
current scope and verify returned pointers by reading the source yourself;
a summary is not a substitute for the complete C functions being ported.

## Completion conditions

- Every source unit in the task is complete and wired where the C or Lua
  source calls it. Read existing implementations instead of assuming that
  their declarations establish completion. Remove their obsolete guards,
  injected substitutes, and swallowed refusals in the same task.
- For every removed gap or refusal, search all `scripts/*.test.mjs` files for
  its source marker, `note_unported`, `game.unported`, `Unsupported*Error`, and
  assertions about its old prompt or callback. Include tests that reach the
  behavior through indirect callers. Replace stale expectations with the C
  behavior and run the affected focused tests before submission. If the newly
  reached path reads another input, supply that input in the test fixture and
  assert the resulting behavior rather than stopping at the former gap.
- For a C or Lua source port, write `.cache/task-evidence.json` in the schema defined by
  `.agents/validation.md`, "Source completion evidence". Identify source
  coverage, production callers, pure-function tests, impure-function
  recordings or synthetic ranges, and the entry-point coverage plan. The
  orchestrator preserves these claims without independently certifying them;
  do not edit `GOALS.json` yourself.
- Before handoff, reconcile each source unit in `.cache/task-context.json`
  against `evidence.functions` or `evidence.incompleteFunctions`, including
  required callees and production callers. For each active impure entry point,
  cite a matching admitted synthetic range or independent C recording. Name
  the concrete source or recorder blocker for any entry point still lacking
  matching runtime evidence; do not claim that function complete.
- Focused tests and lint pass, and each cited synthetic case matches through
  its cited steps. Fresh C/JavaScript cases needed for coverage match completely
  and reach the claimed entries. State blockers honestly;
  the orchestrator's combined checkpoint establishes aggregate non-regression.
- When a matching admitted synthetic range covers an entry point, cite its
  batch, case, segment, steps, and source path in the evidence. Run
  `node scripts/synthetic-range-evidence.mjs .cache/task-evidence.json` before
  submission and include the result among focused checks. For coverage gaps,
  commit a new recipe under `recipes/<source-file>/` and its completely matching recording under
  `recordings/<source-file>/`, per "Validate completed work" in `AGENTS.md`.
- The work is committed, the delivery-specific evidence is preserved, and
  every command you started has finished or has been handed off with its handle.
  Include the exact base and delivery SHAs; never amend a submitted snapshot.

Notify Main with the saved implementation result packet, or report a concrete
blocker. Complete the execution assignment only after preserving evidence and
owned process outcomes; the deliverable still awaits acceptance. Claim the
next eligible shared task without waiting for acceptance or another worker.
Any correction is a linked rework task producing a new immutable revision.

A final integration runner, fixture, or test may remain uncommitted while
changing. Commit production behavior and focused tests as soon as they are
done, and commit integration artifacts once they stabilize.

## What to report

Follow `.agents/loop.md`, "Notifications", and the implementation evidence
procedure above for delivery messages. Cover:

- Base and delivery commits, exact delivery commit list, dependency SHAs,
  changed paths/functions, focused/lint/fresh-case commands and results,
  delivery-specific evidence path, and any running process handle. Include a
  checkpoint result only if the orchestrator assigned that run.
- What you ported, from which C functions or Lua program, and every gap you recorded with
  the C callee it stands for.
- Every bug and surprise you hit, and what you did about it.
- Each decision the C source did not settle immediately, and the evidence
  you used to resolve it.
- Each cited synthetic range or new matching recording and the caller path it
  exercises; identify blocked recipes and their source dependencies separately.
- What you expect the next task to encounter as a problem.
- Whether the task matched its plan. Say so when landing it meant tracing far
  more C source, or touching more files, than the task context implied.

The orchestrator verifies the shared summary and artifacts directly; do not
repeat their score totals in prose or run another checkpoint for the handoff.
