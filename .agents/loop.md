# Continuous operation

This guide is for the main orchestrator. Use it when the user asks for
continuous implementation, within the limits they set. Worker procedures are
in `.claude/agents/span-worker.md`.

## Operating mode

Climb the synthetic local holdout by fixing its source-traced mismatches while
preserving accepted fixed-workload and regression-recording matches. When a
current, complete evaluation contains no unmatched synthetic screens, generate
and baseline a new versioned batch, then continue on its failures. Follow
`.agents/selection.md` for priority, batch generation, and required tooling
support; `.agents/scoring.md` owns measurement and historical comparisons.
An empty fixed-workload queue does not mean there is no implementation work.

Run two persistent workers, each in its own Git worktree. They implement
changes, test them, and submit commits. You review those commits, merge them
into local `main`, run combined checks, and push accepted work. Workers can
start independent work as soon as they submit; they do not wait for a merge
or for each other. Use one worker when work or resources cannot support two.
Ask before adding more than two implementation workers.

## Worker scheduling

When starting or resuming, find existing workers and validation processes.
Reuse live work and keep each worker's worktree across deliveries. Replace a
worker only for recovery or an explicit handoff, after checking its processes.
Reuse unfinished code only when its purpose, scope, and remaining checks are
clear. Otherwise preserve a recoverable copy, remove the abandoned task from
the queue, and start from validated main.

Give each worker a task: a specific piece of implementation to complete,
test, and submit. The source planner calls this piece a *span*; its size and
source-order rules are defined in `.agents/glossary.md` and
`.agents/selection.md`. Prepare each worker's first `.cache/span-context.json` in its worktree using
`nextSpan()` and `spanContext()` in `scripts/goal-log.mjs`. Include the task ID,
absolute worktree path, branch, base commit, allowed edits, dependencies, and
reserved functions or shared interfaces. Workers prepare later tasks under
`.agents/selection.md`, “Seed continuation”, without waiting for you to open
the central goal.

Check each new worktree before dispatch:

1. Run `node scripts/worker-worktree.mjs prepare --branch <assigned-branch>`.
   Fix setup failures, including a missing worktree-local recorder.
2. Give the worker the absolute path to the shared `.cache/worker-state.json`.
   Have it record `connect` from its worktree. Acknowledge the connection
   yourself.
3. Confirm that it has claimed its task by recording an `assign` event
   through `worker-state.mjs event --json` before it edits. Workers follow the claim and directory checks in their guide.

Use `scripts/worker-state.mjs` to record changes as they happen. This shared
task ledger records who owns work, submitted commits, and acceptance. Use
`--help` for its commands; do not edit the JSON by hand. Workers record their
connections, turns, tasks, scope changes, and submissions. You record receipt,
integration, validation, acceptance, and publication. Keep accepted
source-completion evidence in `GOALS.json`.

Use `next` for routine coordination and `status` when the full ownership
state is needed. Event and submission commands currently print the full
state: capture stdout in one reusable worktree-local `.cache/` file, keep
stderr visible, and inspect the exit status and affected task or delivery.
Keep recording required transitions and process handles; avoid copying the
returned state into tracked records or progress messages.

You own `main`, `GOALS.json`, `SCORE.tsv`, quality and review records, aggregate
checks, and publication. Workers own their code, focused tests, recipes, and
recordings. Apply their proposed `QUALITY.json` changes yourself. Do not merge
worker copies of central records.

Before waiting and after a completion, run `worker-state.mjs next`. Handle
unread deliveries and finished worker turns first. Record a finished turn
with `turn`, then use `followup_task` on the same worker if work remains. Do
not create routine nested implementation workers.

If a worker is blocked, assign a worker to remove the obstacle unless someone
already owns that work. Resolve merge conflicts and shared-code ownership
yourself. Keep each shared dependency with one owner. When waiting is
unavoidable, record what is needed and who will provide it, then resume the
blocked worker when ready. Do not send it back to an unchanged queue.

## Merge requests

When a worker submits `READY_TO_MERGE`, inspect its saved submission. The
worker's guide defines the required checks and evidence. Record `received`
for the exact commit and reply `QUEUED_FOR_MERGE`. A saved submission remains
valid even if its notification fails.

Take ready deliveries one at a time: dependencies first, then oldest ready
first. Do not make an independent delivery wait for an unfinished goal.
Integrate exact submitted commits rather than a moving branch tip. Merge
only when every included commit belongs in the delivery; otherwise
cherry-pick the required commits.

Ask for corrections with `CHANGES_REQUIRED` and specific findings. Let the
worker finish or deliberately park its current task before starting the
correction. Corrections use new commits; submitted commits remain unchanged.
Recheck later work affected by a correction. Other workers continue.

Keep a task's reservations until it is accepted or parked. If a worker has
already started a second task, accepting its first task releases only the
first task's reservations. After an integration passes combined validation, notify every implementation worker of the accepted main SHA and have each merge it into its worktree at the next clean task boundary, before selecting new work, preserving pending work and submitted commits.
Workers report the resulting HEAD and rerun focused checks affected by the merge; never rebase or amend submitted delivery commits.

## Integration and publication

Work directly on local `main`; push only accepted work. Handle one goal's
integration, measurement, and closure at a time so its results are recorded
separately from other goals.

1. Run `node scripts/goal-log.mjs --current --detail` and read its output. Finish or park the
   current integration before opening another. Preserve queued deliveries.
2. Check the delivery's task, reserved scope, selection reason, and existing
   completion evidence. Open and plan its goal under `.agents/selection.md`
   or `.agents/divergence.md`, then commit those records. Reconcile work
   already completed; do not close unrelated source units.
3. Integrate the submitted commits. Check whole-source coverage, production
   callers, and entry-point recordings under `.agents/validation.md`. Record
   verified source evidence and commit the combined candidate.
4. Run `worker-state.mjs preflight --task <id>` before broad focused testing.
   Resolve its omissions, then run its listed checks, affected focused tests,
   `npm run lint`, and `npm run quality`. Follow `.agents/review.md` to decide
   whether review is needed. For a retry, pass the failed summary with
   `--previous-checkpoint` and address every failure. If corrections change
   the candidate, commit them and rerun preflight before testing it.
   Run `npm run checkpoint`
   under `.agents/validation.md`. Keep one full-validation owner and retain
   its process handle until completion. Do not change main's HEAD during the
   run. If it fails, preserve the results and reap the run before integrating
   a correction and testing the new candidate.
5. After a pass, refresh the fixed-workload mismatch queue and evaluate all
   admitted synthetic batches under `.agents/scoring.md`. Refresh the
   synthetic work queue from those saved results. Finish
   evidence, scores, and span closure under `.agents/scoring.md` before
   integrating unrelated work. Close a source goal only after its entry
   points are verified, its required challenge evaluation is complete, and
   its saved development scan is current. Finish closure commands while HEAD
   still names the tested commit. Then commit the closure records,
   investigation updates, and new challenge reports together. The publication
   check verifies these report-only changes; keep code and test-input changes
   in a separately validated delivery. Record only the goal's active
   intervals; park it before measuring another goal. Follow
   `.agents/validation.md` for new evidence when later commits change inputs
   to the checkpoint.
6. Record acceptance and send `ACCEPTED` with the tested commit and checkpoint
   result. Run `worker-state.mjs sync-main --commit <accepted-commit>` to
   verify local main. Push accepted work to main without asking again, then
   record `published` after the push succeeds. Watch each relevant CI run
   once, identified by commit and run ID. Investigate failures and validate
   corrections; report CI success only after it finishes successfully.

Before treating an old test failure as an ongoing blocker, check whether
current main and saved results already establish the fix. If they do,
complete the acceptance checks and update the task record using those
results. Preserve the failed result as history. A failed tracker update is
a bookkeeping problem: report its command and error. Do not repeat
completed tests solely to change a task's status. Changed code still needs
the checks required by `.agents/validation.md`.

## Worker support

Use read-only helpers when they can answer a specific question while an
implementation worker continues. Use one for a cross-file survey, or up to
two to test different explanations of a difficult mismatch. Give each a
narrow source or artifact scope and a stopping condition. Helpers do not
edit, enumerate session corpora, record games, or run full validation or
scoring. Forward useful findings promptly; the worker verifies them and
keeps implementation ownership. Stop an investigation when its explanation
is falsified or the cause is resolved.

When there is no other work for you, wait for a completion notification.
Check a worker's transcript and process handles after ten minutes without
an update. New activity or an active operation renews that window. If both
are absent, wait 60 seconds to confirm. If they remain absent and the worker
is idle, follow up on the same worker. If it still reports running without
activity or an operation, interrupt it once and follow up on the same handle. A stored “active” flag does not prove
progress. Use an available scheduler for these ten-minute checks and stop
it when the user's run ends. Respect the environment's wait limits without
rechecking worker status after every short wait.

When existing instructions answer a question, state the decision, cite the
rule, and continue. Otherwise record the question and a provisional decision
in `.agents/questions.md`. Continue independent work. If the question blocks
a span, park that span without a worker commit and send a push notification.
Keep questions open until answered. Ask the user when no authorized next
step remains.

## Background investigations

Whenever an investigator finishes or capacity becomes available, start the
next eligible investigation from the saved queue. Check that queue before
leaving a worker idle and during each ten-minute recovery check. These
checks do not require a new scan.

At loop entry and after refreshing either corpus's work queue, identify sessions
whose investigation is missing, partial, invalid, or stale. You are
responsible for scheduling their investigation and publishing the results.
Use `.agents/selection.md` order, exclude sessions already owned by workers
or pending deliveries, and keep one investigator per session. Reserve
capacity for implementation and its helpers; fill remaining investigator
slots and refill them as results arrive. Reuse partial findings and begin
eligible implementation without waiting for the whole batch.

Give each investigator its session, remaining-screen count, examined commit,
queue entry, and saved findings. Require it to follow the schema in `.agents/selection.md`, “Investigation
cache”. Have it write its result to a temporary file beside its assigned
cache file, then rename it into place before sending its completion message.
It may read source at that commit, replay its assigned session under
`.agents/validation.md`, and write its assigned
`investigations/<session>.json` and session-specific `.cache/` artifacts.
It must not edit game code or central records, commit, push, scan other
sessions, record C games, or run full validation or scoring.

Validate each returned file with `readInvestigation(root, queueEntry)` from
`scripts/investigation-cache.mjs`; require `complete` or `partial`. Repair
malformed files from existing findings. Require the remaining-screen count
and cache path in the completion message. When the count changes, stop or
finish the old investigation before replacing it so an old result cannot
overwrite a newer one. Collect changed source findings into main's
investigation files under `.agents/selection.md`, "Investigation cache".
Keep the deployed dashboard current with completed and partial findings and
the latest validated score. Publish changed findings at the next safe commit
boundary without waiting for an implementation delivery. Worker activity
alone does not require an investigation edit or publication commit.
After each push, verify the dashboard deployment and its displayed mismatch
queue against the published records.

## Reports

Report once per worker iteration under `/loop`: the closed span, synthetic
batch and before/after matched screens, first mismatch, fixed-development
regression results, newly matching recordings, problems, and next work.
Separate gains on unchanged cases from screens added by a new batch; report
per-case losses even when the aggregate improves. Include each free worker's
next task, dependency waits, and merge rework. Mention open questions when they change.

Use exact combined checkpoint results and saved synthetic evaluations. Keep
recovered regressions separate
from new gains. Do not present worker-branch totals or queue upper bounds
as delivered gains. Distinguish ready, integrating, validated, published,
and CI-complete work. A worker coding during validation is working. Keep
updates brief, omit unchanged status, and announce a switch to validation
or review with its reason once. Follow `.agents/review.md` for review reports.

## Pausing and recovery

At a time limit or stop request, stop new tasks and investigations. Preserve
unfinished branches, commits, and dirty paths, list them in the local task
scratch file, and report processes still owned. Do not label unfinished work
complete. Skip new investigations when current work completes a bounded goal.

During an unbounded run, stop only under `AGENTS.md`'s stop conditions.
Exhausting the current synthetic mismatches triggers batch generation, not
roadmap-only implementation or a request for another goal. A progress report
or low context is not a reason to stop.
