# Continuous operation

This guide is for Main, the work lead. Use it when the user asks for
continuous implementation, within the limits they set. Common worker
procedures are in `.claude/agents/queue-worker.md`.

## Operating mode

Complete source behavior exposed by synthetic local holdout mismatches while
preserving accepted fixed-workload and regression-recording matches. Prepare a
new versioned batch before workers run out of independent next tasks. Admit
and baseline prepared batches under `.agents/selection.md`, "Generating the
next synthetic batch". Follow
`.agents/selection.md` for task choice, batch generation, and required tooling
support; `.agents/scoring.md` owns measurement and historical comparisons.
An empty fixed-workload queue does not mean there is no implementation work.

Agent hierarchy, the single queue, claim-time priority, rework, worktrees,
and dashboard identities are defined once in `.agents/architecture.md`.
Read its tooling transition before starting or migrating a loop. Workers
follow `.claude/agents/queue-worker.md` plus the guide for their assignment.

## Queue coordination

Main dispatches the three persistent workers. Prep is Main's sibling and
adds exploration tasks; it does not own an explorer team. Main adds admitted
implementation work and validation rework. Workers take the next eligible
assignment from the shared policy instead of selecting a private next goal.
Source-selection criteria remain in `.agents/selection.md`; batch acceptance
and admission remain in `.agents/validation.md`. Process improvements reach
Main as approved changes, not instructions to interrupt active workers.

## Worker scheduling

When starting or resuming, find existing agents, claims, and validation
processes. Reuse the three workers and their worktrees across assignment
types; replacements are for recovery. Preserve unfinished work, evidence,
and exact submitted revisions before a recovery or branch switch.

A queue claim provides the worker's assignment branch, base, dependencies,
write set, reservations, and result recipient. Prepare a source context for
implementation or a bounded probe plan for exploration; rework also names
its rejected deliverable revision. Workers still investigate unresolved
sessions and claim source scope before editing, but do not bypass queue
priority to start their next assignment. Main records implementation goals
centrally as required at integration.

Use `worker-worktree.mjs prepare --branch <assigned-branch>` for supported
worktree setup and `check` to validate retained state. Missing prerequisites,
including a worktree-local recorder, must be fixed before execution.
Register and connect the persistent workers through `worker-state.mjs`, then
use `work-queue.mjs claim` for dispatch and branch switching. The claim's
transport ID connects source-scope and evidence commands to the existing
acceptance helpers. `assign` is not a second dispatch path in unified mode.

Use `scripts/worker-state.mjs` for transport/acceptance events and
`scripts/work-queue.mjs` for execution. The architecture documents enabling
and migrating the single shared ledger. This event log records who owns work, submitted commits, and acceptance. Use
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
CPU use. Track Prep planning and assembly separately from worker execution;
legacy snapshots retain their existing role records.

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
Exploration workers own their case evidence; Prep owns the assembled batch
and prepared manifest in delivery evidence. Apply
workers' proposed `QUALITY.json` changes yourself. Do not merge worker copies
of central records.

Prep plans and assembles one active batch at a time under
`.agents/selection.md`. It can start the next plan after submission without
waiting for acceptance or admission. Reserve each batch identity in the
ledger and retain each prepared manifest in immutable delivery evidence.
Prioritize corrections through the shared queue. Start each batch branch from
its specified accepted base so its delivery contains only the new case paths;
retain dependencies on any pending ancestor results without modifying them.

Apply the integration and admission priority in `.agents/selection.md` at each
safe integration boundary. Preserve validation and baseline requirements.
Continue assigning fixes from older batches.
The preparation worker does not monitor implementation assignments. If it
reports a search blocker, use its saved attempts and source findings to redirect
the search. Follow `.agents/selection.md` for delivery size and retained cases,
and `.claude/agents/challenge-prep-worker.md` for queued exploration. Keep missed
and deferred targets in the handoff; the orchestrator owns admission.

Handle worker messages and finished turns under "Notifications" below.
Do not create routine nested implementation workers.

If a worker is blocked, enqueue a scoped task to remove the obstacle unless
someone already owns that work; use normal priority and dependency checks. Resolve merge conflicts and shared-code ownership
yourself. Keep each shared dependency with one owner. When waiting is
unavoidable, record what is needed and who will provide it. Follow
"Notifications" when the blocker clears.

## Notifications

Workers notify the assignment's recipient after saving a result. Exploration
results go to Prep; implementation results and batch submissions reach Main
as `READY_TO_MERGE` with their immutable packet reference. Main records receipt and acceptance
in the ledger; it does not send routine `QUEUED_FOR_MERGE` or `ACCEPTED`
messages. Workers read `accepted-main` at clean task boundaries.

At startup and after a delivery, correction, acceptance, or batch baseline,
use `worker-state.mjs next` or the publication helper's next-work summary.
Handle unread deliveries and record finished turns. Before waiting, handle
any outstanding actions; otherwise wait for a completion notification.

Wake an idle or blocked worker only when new independent work is available,
its recorded blocker has cleared, or corrections are requested. Combine
pending changes into one notification per affected worker. Use `followup_task`
on the existing worker without replacing a current task or process. Send an
actionable wakeup before publication or the next integration; do not wait for
the delivery queue to drain. Refresh the saved queue when a batch wakeup has
`queueReady: false` before asking the listed workers to recheck.

When a deliverable needs correction, enqueue a rework task with the exact
revision and findings under `.agents/architecture.md`. Prefer the original
worker when available; another worker can claim it from the saved packet.
Do not interrupt its current assignment. `CHANGES_REQUIRED` may notify the
producer, but it is not a private correction assignment outside the queue.
Do not broadcast acceptance or request routine HEAD reports. When no eligible
work remains, workers record an idle or blocked turn with the dependency and
owner, then end the turn rather than rechecking an unchanged queue. Recover
unexpectedly silent active workers under "Worker support", not by waking
deliberately idle or blocked workers on a timer.

## Merge requests

When a worker submits `READY_TO_MERGE`, inspect its saved submission. The
worker's guide defines the required checks and evidence. Record `received`
for the exact commit. Follow "Notifications"; a saved submission remains valid
even if its notification fails.

Group all compatible, received implementation deliveries under
`.agents/validation.md`, "Implementation acceptance groups".
Group consecutive ready Prep submissions under "Prep acceptance groups".
Dependencies must be accepted or included earlier in the group.
Choose preparation or implementation using `.agents/selection.md`, "Generating
the next synthetic batch". Within that choice, integrate deliveries that unblock
other tasks first, then the oldest ready delivery. Do not make an independent
delivery wait for an unfinished goal.
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

Request corrections under "Notifications". Corrections use new commits;
submitted commits remain unchanged.
Recheck later work affected by a correction. Other workers continue.

Keep a task's reservations until it is accepted or parked. If a worker has
already started a second task, accepting its first task releases only the
first task's reservations. Workers use the accepted Main reference returned by
`worker-state.mjs accepted-main --file <shared-ledger>` as an ordinary task's
base. Switch cleanly to its assignment branch under the architecture's
worktree rules; do not merge into or amend an immutable submitted branch. Follow "Notifications" for wakeups.
Preserve pending work and submitted commits. Reuse accepted validation after a
clean merge; run focused checks only for conflict resolutions or pending changes
combined with accepted code that have not been tested together. Never rebase
or amend submitted delivery commits.

## Integration and publication

Build implementation groups on candidate branches; keep local `main` at its
accepted commit until the group passes. Handle one candidate at a time and
push only accepted work to `main`. Workers own source review. Main integrates, runs exact-commit hosted
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
2. Check each delivery's task, reserved scope, selection reason, and dependencies.
   Register each implementation goal from the preserved worker context if needed;
   leave it queued. Do not run `open-goal` or repeat task selection for submitted
   work. Preserve the worker's investigation commit and its original measurement.
   If importing it replaces a newer diagnosis, retain the newer diagnosis too.
   Do not rewrite historical counts to describe the current candidate.
   For preparation, verify the saved source-based mission plan, hashes, and
   independent C replays without opening a goal.
3. For implementation, follow `.agents/validation.md`, "Implementation acceptance
   groups", for integration, acceptance and publication commands.
   Integrate the submitted commits and preserve worker source findings and
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
5. After importing a passing implementation checkpoint, run the group acceptance
   command under `.agents/validation.md`, "Implementation acceptance groups",
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
   After acceptance, follow step 6, then publish the closure records,
   investigation updates, and new challenge reports
   together. Keep code and test-input changes in a separately validated delivery.
   Follow `.agents/validation.md` for new evidence when later commits change inputs
   to the checkpoint. After a challenge preparation task passes, leave its
   case files unadmitted and record no challenge score or mismatch-queue entry.
   Use the Prep group procedure under `.agents/validation.md`; preparation
   tasks skip goal closure and synthetic import.
   For preparation, review the saved C mission and replay evidence; skip
   implementation-only synthetic regression comparison.
   If acceptance cannot proceed, record the blocker.
   Before admission under `.agents/selection.md`, recheck
   every included case against unresolved admitted cases and earlier submitted
   unadmitted batches using current evaluations and the packet's C behavior, state,
   and action-history comparisons. Require a corrected delivery for overlap.
   Admit all accepted batches at the safe boundary under
   `.agents/validation.md`, "Hosted admission baselines". Use GitHub's saved
   baselines, not a local replay or a supplemental full checkpoint. A completed
   worker turn alone does not establish acceptance.
6. Reconcile the receipt's recorded task and turn with newer worker activity.
   Apply "Notifications" using the updated queue below.
   Keep HEAD at the tested candidate through acceptance. The implementation
   group publisher fast-forwards local `main`. When admission
   adds manifests afterward, pass its hosted receipt to publication as the
   admission procedure specifies. Skip `sync-main`
   in this publication path; it is for fast-forwarding a different local main.
   Refresh the saved combined queue after score import, before publication.
   Use the group's publication command under `.agents/validation.md`;
   `task-handoff.mjs publish` remains available for other accepted deliveries.
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

Bounded source surveys, exploration, and validation follow-ups are tasks
for the same persistent workers under `.agents/architecture.md`. They have
no additional agent quota. Forward useful findings to the assignment's
recipient; the implementation worker still verifies source pointers and owns
its fix. Do not start nested helpers or bypass claim priority for a survey.

For a worker expected to be active, check its transcript and process handles
after ten minutes without an update. New activity or an active operation
renews that window. If both are absent, wait 60 seconds to confirm. If they
remain absent and the worker is idle, follow up on the same worker. If it
still reports running without
activity or an operation, interrupt it once and follow up on the same handle. A stored “active” flag does not prove
progress. Use an available scheduler for these ten-minute checks and stop
it when the user's run ends. Apply "Notifications" to deliberately idle or
blocked workers. Respect the environment's wait limits without rechecking
worker status after every short wait.

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
