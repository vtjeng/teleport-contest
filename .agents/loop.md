# Continuous operation

This guide is for the main orchestrator. Use it when the user asks for
continuous implementation, within the limits they set. Worker procedures are
in `.claude/agents/span-worker.md`.

## Operating mode

Complete source behavior exposed by synthetic local holdout mismatches while
preserving accepted fixed-workload and regression-recording matches. Prepare a
new versioned batch before workers run out of independent next tasks. Admit
and baseline prepared batches under `.agents/selection.md`, "Generating the
next synthetic batch". Follow
`.agents/selection.md` for task choice, batch generation, and required tooling
support; `.agents/scoring.md` owns measurement and historical comparisons.
An empty fixed-workload queue does not mean there is no implementation work.

Run up to four persistent workers, each in its own Git worktree: A, B, and C
implement source tasks; Prep prepares synthetic batches. Keep Prep dedicated
to preparation. Finish an existing preparation assignment before transferring
that role to Prep. Use fewer workers when work or resources cannot support
four; ask before adding a fifth. Run workers on `gpt-6-luna`, as the project
`.codex/config.toml` specifies for subagents. Workers test and submit commits;
you integrate them into local `main`, run combined checks, accept, and
publish. A worker may start independent work after submitting a task without
waiting for a merge or for another worker.

## Worker scheduling

When starting or resuming, find existing workers and validation processes.
Reuse live work and keep each worker's worktree across deliveries. Replace a
worker only for recovery or an explicit handoff, after checking its processes.
Reuse unfinished code only when its purpose, scope, and remaining checks are
clear. Otherwise preserve a recoverable copy, remove the abandoned task from
the queue, and start from validated main.

Give each worker a session to investigate and implement, a known source task,
or one challenge preparation task. For a C file port, choose whole functions in a
selected C-order range under `.agents/selection.md`; it needs no separate span.
For a known source task, after queuing the goal in the coordinator checkout, run
`node scripts/goal-log.mjs task-context --goal <id>` there and copy its
untracked `.cache/task-context.json` into the assigned worktree. Record the
task ID, absolute worktree path, branch, base commit,
allowed edits, dependencies, and reserved functions or shared interfaces in
the ledger assignment. A preparation task instead names its future batch and
allowed `challenges/cases/<batch>/` paths. Implementation
workers can claim independent work under `.agents/selection.md`, “Seed continuation”,
without waiting for you to create a goal. You create the goal during integration.
For an unresolved session, provide its saved queue entry and findings instead
of a source task context.
The worker claims the session, investigates it, then claims its source scope
before editing code, following its guide.

Check each new worktree before dispatch:

1. Run `node scripts/worker-worktree.mjs prepare --branch <assigned-branch>`.
   Fix setup failures, including a missing worktree-local recorder.
2. Give the worker the absolute path to the shared `.cache/worker-state.json`.
   Have it record `connect` from its worktree. Acknowledge the connection
   yourself.
3. Confirm that it has claimed its task by recording an `assign` event
   through `worker-state.mjs event --json` before it edits. Workers follow the
   claim and directory checks in their guide.

Use `scripts/worker-state.mjs` to record changes as they happen. This shared
task ledger records who owns work, submitted commits, and acceptance. Use
`--help` for its commands; do not edit the JSON by hand. Workers record their
connections, turns, tasks, scope changes, and submissions. You record receipt,
integration, validation, acceptance, and publication. Keep accepted
task outcomes and worker source claims in `GOALS.json`.

Record coordinator work before it starts with an `activity` event containing
`task`, `phase` (`review`, `admission`, `baseline`, or `waiting`), and a short
public `reason`. Use `review` for pre-merge review and correction verification,
not `received`: receipt alone does not mean work has begun. Start a new phase
when the work changes; use `phase: done` when it ends without a normal task
transition. Integration, feedback, validation, acceptance, publication, and
parking close that task's activity interval automatically. These observations
do not change ownership or satisfy validation gates.

On an idle or blocked `turn`, workers include a public `summary` explaining
the missing dependency or next action and its owner. Keep private paths,
process handles, and internal notes in `reason`, which is not published.
Update the turn when work resumes. The dashboard distinguishes these reported
waits from unrecorded time; neither assignment nor a blank interval measures
CPU use. Include Prep in the shared ledger and snapshot like the other workers.

Use `next` for routine coordination, including pending deliveries, parked
tasks, and ready batches awaiting admission. Use `status` when the full ownership
state is needed. At evaluation and handoff boundaries, run
`next --queue <latest-saved-combined-queue.json>`. Check source independence
and parked blockers before starting or resuming work.

Event and submission commands currently print the full
state: capture stdout in one reusable worktree-local `.cache/` file, keep
stderr visible, and inspect the exit status and affected task or delivery.
Keep recording required transitions and process handles; avoid copying the
returned state into tracked records or progress messages.

You own `main`, `GOALS.json`, `SCORE.tsv`, quality and review records, aggregate
checks, batch admission, and publication. Implementation workers own their
code, claimed investigation reports, focused tests, recipes, and recordings.
A preparation worker owns its case
recipes, C recordings, and prepared manifest in delivery evidence. Apply
workers' proposed `QUALITY.json` changes yourself. Do not merge worker copies
of central records.

Keep Prep working continuously on one batch at a time under
`.agents/selection.md`. It starts the next batch after submission without
waiting for acceptance or admission. Reserve each batch identity in the
ledger and retain each prepared manifest in immutable delivery evidence.
Handle corrections and parked preparation before starting a later batch.
At a clean task boundary, merge accepted main without changing submitted
commits. Claim the next batch at that HEAD so its delivery contains only the
new case paths; submission records dependencies on pending ancestor deliveries.

Apply the integration and admission priority in `.agents/selection.md` at each
safe integration boundary. Preserve validation and baseline requirements.
Continue assigning fixes from older batches.
The preparation worker does not monitor implementation assignments. If it
reports that it cannot find 12 locally mismatching sessions with distinct
source-traced first mismatch behaviors after switching to other plausible
behaviors, review its valid recordings, search attempts, and source-based
blockers. Decide whether to accept a smaller batch with that reason or direct
the worker toward other targets. Keep missed and deferred targets in the
handoff; the orchestrator owns the scheduling decision.

Before waiting and after a completion, run `worker-state.mjs next`. Handle
unread deliveries, batch wakeups, and finished worker turns first. Refresh the
saved queue when a wakeup has `queueReady: false`, then ask the listed workers
to recheck without replacing current tasks or processes. Record a finished turn
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

Take ready deliveries one at a time, after their dependencies are accepted.
Integrate deliveries that unblock other tasks first, then the oldest ready
delivery. Do not make an independent delivery wait for an unfinished goal.
Integrate exact submitted commits rather than a moving branch tip. Merge
only when every included commit belongs in the delivery; otherwise
cherry-pick the required commits.

While the current candidate's checkpoint runs, inspect the next queued
delivery's immutable packet, diff, reservations, and likely conflicts. This
read-only preview can identify concrete integration problems or missing evidence
before the validation slot frees up. Keep the checkpoint process handle and
collect its result promptly. Do not change `main`, start another aggregate
check, or begin the next integration until the current candidate's evaluation and
acceptance finish. Recheck the preview against the newly accepted `main` before
integrating that delivery.

Ask for corrections with `CHANGES_REQUIRED` and specific findings. Let the
worker finish or deliberately park its current task before starting the
correction. Corrections use new commits; submitted commits remain unchanged.
Recheck later work affected by a correction. Other workers continue.

Keep a task's reservations until it is accepted or parked. If a worker has
already started a second task, accepting its first task releases only the
first task's reservations. Workers read the latest accepted Main commit with
`worker-state.mjs accepted-main --file <shared-ledger>` and merge it at a clean
task boundary before selecting new work. Do not broadcast each acceptance or
request routine HEAD reports. Notify the submitting worker and workers whose
blockers cleared; notify idle or blocked workers when a new batch opens work.
Preserve pending work and submitted commits. Reuse accepted validation after a
clean merge; run focused checks only for conflict resolutions or pending changes
combined with accepted code that have not been tested together. Never rebase
or amend submitted delivery commits.

## Integration and publication

Work directly on local `main`; push only accepted work. Handle one candidate
at a time. Workers own source review. Main integrates, runs exact-commit hosted
CI, accepts, and publishes.

Acceptance checks saved results: an assigned target must improve, and no fixed
or synthetic case may regress. Deliveries without a target need no regressions,
not a target gain. Preparation retains its independent C-evidence checks.

Do not repeat source review, certify whole functions, or refresh historical
investigation counts for acceptance. Preserve worker findings. Whole-source
certification is outside the normal loop; do not start a background audit
unless requested.

CI runs the full test suite, lint, generated/static checks, and all session
evaluations for each candidate. Main runs focused tests or replays locally only
to test a merge-conflict resolution or integration edit, investigate a failed
check, or verify a specific result it suspects is wrong. Do not repeat
successful CI checks locally.

1. Check the shared ledger. Finish or park the current integration before
   starting another. Preserve queued deliveries.
2. Check the delivery's task, reserved scope, selection reason, and dependencies.
   Register its implementation goal from the preserved worker context if needed;
   leave it queued. Do not run `open-goal` or repeat task selection for submitted
   work. Preserve the worker's investigation commit and its original measurement.
   If importing it replaces a newer diagnosis, retain the newer diagnosis too.
   Do not rewrite historical counts to describe the current candidate.
   For preparation, verify the saved source-based mission plan, hashes, and
   independent C replays without opening a goal.
3. Integrate the submitted commits and preserve worker source findings and
   evidence. Do not independently certify their functions. For preparation,
   integrate only the case recipes and C recordings. Retain the prepared
   manifest in immutable delivery evidence, outside admitted manifests.
   Commit the combined candidate.
4. Run `worker-state.mjs preflight --task <id>` and resolve its omissions.
   Its `focusedTests` list identifies affected tests, not a mandatory second
   local test run. Use local checks only for the specific problems above.
   Preflight checks quality-area ownership; CI runs lint and reports review debt.
   For preparation-only deliveries, verify
   the saved independent C replay results and committed manifest hashes.
   Rerun the C replay only when its inputs changed or the saved result is missing
   or suspect. Follow `.agents/review.md` to decide whether
   review is needed. For a retry, pass the failed summary with
   `--previous-checkpoint` and address every failure. If corrections change
   the candidate, commit them and rerun preflight before testing it.
   Obtain a passing checkpoint for the committed candidate from the complete
   hosted checkpoint workflow under `.agents/validation.md` by default. Use
   `npm run checkpoint` only when hosted validation is unavailable or blocked,
   and state the concrete reason. Import the hosted run's saved evidence; do
   not repeat its checks locally. Give each hosted checkpoint one monitoring
   owner. Once its run ID is known, start one watch and retain its process
   handle through completion. While it runs, preview the next delivery.
   Do not issue additional status queries for that run unless the watch
   fails or the user requests details. After completion, import the result
   through the existing exact-commit checks.
   Keep one full-validation owner for local
   runs and retain its process handle until completion. Do not change main's HEAD during the
   run. Use its running time for the read-only next-delivery preview above
   when a delivery is queued. If it fails, preserve the results and wait for
   the run to finish before integrating a correction and testing the new
   candidate.
5. After importing a passing implementation checkpoint, run
   `node scripts/task-handoff.mjs accept --task <id> --ledger <shared-ledger>`
   while HEAD still names the tested commit. The helper compares saved fixed
   and synthetic results with accepted evidence, requires improvement on an
   assigned target, and rejects per-case regressions, new or changed non-null
   errors, and missing or incomparable evidence. Newly admitted batches use
   their saved first complete baseline. Do not remove a task's target to bypass
   a rejected verdict. `task-handoff.mjs review` is optional diagnostic output,
   not a separate acceptance step. The helper imports evaluations, records the
   task outcome and worker claims without source certification, appends its
   score, and records acceptance. It does not run `record-evidence`,
   `close-goal`, or another aggregate evaluation.
   If it fails, diagnose the error and retry at the same tested commit.
   After acceptance, resume the idle worker as step 6 specifies, then
   publish the closure records, investigation updates, and new challenge reports
   together. Keep code and test-input changes in a separately validated delivery.
   Follow `.agents/validation.md` for new evidence when later commits change inputs
   to the checkpoint. After a challenge preparation task passes, leave its
   case files unadmitted and record no challenge score or mismatch-queue entry.
   Run the same acceptance helper; preparation tasks skip goal closure and
   synthetic import.
   For preparation, review the saved C mission and replay evidence; skip
   implementation-only synthetic regression comparison.
   If acceptance cannot proceed, record the blocker.
   When the batch-admission gate in `.agents/selection.md` later passes, recheck
   every included case against unresolved admitted cases and earlier submitted
   unadmitted batches using current evaluations and the packet's C behavior, state,
   and action-history comparisons. Require a corrected delivery for overlap.
   Then admit the oldest prepared manifest with the next version number, commit
   it, and save its first evaluation at that committed implementation before
   selecting failures. Do not admit a batch merely because its worker has finished.
6. Send `ACCEPTED` with the helper's tested commit and checkpoint
   result. Its receipt includes the submitting worker's recorded task and turn;
   reconcile any newer activity. If it is idle, use `followup_task` on the same worker
   immediately: merge accepted main at the clean boundary, then select and
   claim the next independent task under "Seed continuation". Send this
   continuation before dashboard generation, publication, or another
   integration; do not wait for the delivery queue to drain. If the worker
   already has a task, send the acceptance without replacing its assignment.
   If continuation is blocked, record the specific dependency and its owner
   in the existing ledger and assign independent work when available.
   Keep local `main` at the tested commit through acceptance. Skip `sync-main`
   in this publication path; it is for fast-forwarding a different local main.
   Refresh the saved combined queue after score import, before publication.
   Run `node scripts/task-handoff.mjs publish --task <id> --ledger <shared-ledger> --queue <latest-saved-combined-queue.json>`.
   It generates the dashboard snapshot, commits closure reports by name,
   verifies their contents, pushes the exact report commit, records
   publication, checks CI once, and returns the next-work summary. Retry after
   an interruption; a committed report packet is reused rather than regenerated.
   It sends no worker messages and does not admit batches. The snapshot captures
   activity through acceptance; publication enters the next snapshot.
   Pending CI stays in `.cache/loop-ci-pending.json` until all relevant runs pass.
   The helper checks pending CI before another push and stops on known failures.
   Do not block the next
   delivery with `gh run watch`. Reconcile the pending list after a restart
   against published commits in the worker-state ledger and their CI runs. If
   CI fails, finish an active checkpoint, then investigate and validate a
   correction before further publication. Report CI success only after the
   relevant runs finish successfully.
   If a separately checkpointed descendant changes execution inputs between
   the accepted integration and its report commit, include that passing
   summary as `supplementalCheckpoint` in the publication event. The later
   checkpoint must cover those inputs; subsequent changes may only be checked
   reports.

Use the publication helper's next-work summary, or `worker-state.mjs next`
after a manual publication. Check batch admission priority under
`.agents/selection.md` before starting the next dependency-ready delivery.
Handle worker handoffs promptly, but do not defer a ready integration for
optional investigations or housekeeping. If integration cannot proceed,
record the blocker in the existing ledger and resolve it or take another
independent ready delivery under the goal-parking rules.

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
a task, park that task without a worker commit and send a push notification.
Keep questions open until answered. Ask the user when no authorized next
step remains.

## Investigation findings

The worker assigned a session owns its investigation through implementation.
Reuse valid cached findings and group known related causes before assignment;
do not make an independent task wait for a grouping investigation. Use separate
helpers only for bounded questions under "Worker support".

Validate returned reports with `readInvestigation(root, queueEntry)` from
`scripts/investigation-cache.mjs` and the count/provenance rules in
`.agents/selection.md`, "Investigation cache". Collect completed and partial
findings at the next safe record boundary. A parked investigation may hand off
its report without an implementation delivery; the next owner reuses its
evidence. Do not let a late result overwrite a newer diagnosis. Worker activity
alone does not require an investigation edit or publication commit.
Treat a successful `Dashboard` workflow run as confirmation of deployment.
Inspect the live page only for a reported problem or a change to its presentation.

## Workflow friction

Log special-purpose workflow scripts, suspected flaky tests, manual
bookkeeping, avoidable waits, apparently redundant checks, or any other
source of inefficiency in `.agents/friction.md`, including first occurrences
and required steps. Follow current instructions even when flagging them as
unnecessary.

Capture enough context for later triage without delaying dispatch or
validation; commit entries at the next safe record boundary. Logging does
not require investigation or a fix. Triage waits for the user's request.

## Reports

Report once per worker iteration under `/loop`: the completed task, synthetic
batch and before/after matched screens, first mismatch, fixed-development
regression results, newly verified synthetic ranges or matching recordings,
problems, and next work.
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
Exhausting the current synthetic mismatches triggers batch admission or
preparation, not roadmap-only implementation or a request for another goal. A progress report
or low context is not a reason to stop.
