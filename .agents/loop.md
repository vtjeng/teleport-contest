# Continuous operation

This guide is for the work lead (the dashboard's Main coordinator). Use it when the user asks for
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

Allocate workers from the shared agent pool below, each editing role in its
own Git worktree. A/B/C implement source tasks; an allocated Prep lead owns
synthetic batches. Use the role configurations in `.codex/config.toml`;
implementation and exploration workers default to `gpt-6-luna`, while the
Prep lead uses its configured Sol role. Workers test and submit commits;
you integrate them into local `main`, run combined checks, accept, and
publish. A worker may start independent work after submitting a task without
waiting for a merge or for another worker, unless its slot is being reassigned.

## Shared agent pool

The verified cloud limit is seven total agents, including the conversation
root and every nested agent. The root stays available for user conversation
and delegates this loop to the work lead. A sibling process agent observes
progress and prepares process proposals in its own worktree. It reports to
the root; it does not change live assignments, central records, or main.
The work lead alone owns integration and applies approved process changes
between tasks or validation runs. Keep these coordination agents out of the
implementation-worker ledger; the work lead is its sole coordinator.

Reserve the root, work lead, and process agent, leaving four shared execution
slots. Count a Prep lead, each explorer, implementation worker, reviewer, and
survey helper against the same pool regardless of parent. Prep has historically
been the bottleneck: when fewer than five eligible sessions remain unstarted,
prefer a Prep lead and three explorers as slots become available. When useful fixes are
available, use A/B plus Prep and one explorer, or A plus Prep and two explorers.
A/B/C plus Prep with no explorer is also valid when implementation dominates.
An allocated Prep lead can record probes itself when no explorer is available.
Do not spawn explorers in addition to a full implementation allocation.
If the process agent is explicitly released, its slot can join the pool;
restore the reservation before restarting it. A lower reported host limit
always takes precedence. Configuration does not override the host limit.
The ledger still permits at most four live registered workers; any extra
granted slot is for a probe or helper, not a fifth registered worker.

The work lead grants slots before any spawn, including nested spawns. Prep
requests a specific explorer allocation and never expands it independently.
Record the current allocation and intended next roles in the work lead's
handoff notes. Keep the ledger's existing A/B/C, Prep, and Prep-1..Prep-6
role identities; they describe task ownership, not permanently reserved
threads. The dashboard continues to show those roles; the conversation and
process agents do not acquire worker rows merely to reserve slots.

Rebalance at deliveries, completed probes, validation boundaries, or concrete
blockers. Before granting a newly available slot, count distinct eligible,
unstarted sessions in the current saved combined queue using its corpus/batch
identities and the shared ledger. A session already claimed for investigation
or implementation is started, including parked work and submitted deliveries;
an existing valid investigation also means work has started. Exclude blocked
or reserved sessions. Count sessions, not source groups, goals, or workers.
Missing or stale queue evidence makes the count unknown, not zero; refresh it
before using the threshold.

While this count is below five (zero through four), prefer assigning free or
yielded slots to Prep rather than starting another implementation worker:
allocate the Prep lead first, then explorers. Apply this to spawning and
retasking existing threads. Tell a finishing A/B worker to yield before it
claims another task when its slot is needed for Prep. Five or more unstarted
sessions permits additional implementation workers, subject to source
independence and existing admission priorities; it does not require them.
This allocation preference does not interrupt active tasks or commands,
remove correction ownership, or supersede regression repairs. Record the
count and allocation reason in the handoff notes and public yield summary
(for example, "Prep priority: 3 unstarted sessions; threshold 5"). Prep uses
Main's allocation and does not inspect implementation assignments itself.
Announce a pending reallocation before the worker selects another task.
In particular, A/B can yield their slots to Prep explorers after submitting
or deliberately parking their current tasks, then resume implementation when
the batch backlog supplies useful independent work. Prep cannot reclaim a
slot from an implementation worker itself; the work lead schedules the handoff.
Workers continue independently within their current allocation, but yield
at the next clean boundary when requested; do not interrupt a live command
or a claimed task just to change the mix.

Before releasing a slot, collect owned command results and save the delivery
or an explicit parked handoff. Finish Prep probes before releasing their
lead. Preserve worktrees, submitted commits, evidence, reservations, and
correction ownership. For a registered worker, use supported `turn` and
`observe` events to record no live processes and a null handle once release
is confirmed. Do not rewrite ledger history or reuse its role worktree for
another role. End/release the old agent through the available harness and
confirm capacity before starting its replacement; an idle turn alone is not
proof of a free slot. Alternatively, explicitly retask a finished agent within
its existing slot: end the old assignment and give it a fresh role packet and
the new role's worktree. Do not let two parents dispatch that slot; Main owns
implementation assignments, and Prep owns probes only while its grant applies.
Resume a retained role worktree through setup and the normal connection
handshake. Give either a reused agent or replacement fresh role instructions,
scope, base, evidence, and process ownership. Outstanding deliveries
remain valid and correction requests must be routed to a resumed owner.
When retasking a nested explorer as an implementation worker, name the work
lead as its message recipient explicitly; native completion may still notify
the original Prep parent. Prep forwards such a notification to Main and does
not dispatch the reassigned thread.

Dashboard rows follow roles, not physical threads. Keep A/B/C history when
their slots move to Prep-1..Prep-6. Record an idle turn with a public reason
such as "Slot reassigned to Prep exploration", then `observe` with a null
handle and no processes; start the explorer with a new `prep-probe` event in
its separate role worktree. Mark a probe done before returning its thread to
an implementation role and reconnect that role through `observe` and the
normal handshake. Do not rename old events, keep released workers apparently
live, or publish private handles. Parked tasks and queued deliveries remain in
task history, while released roles stop accumulating agent utilization. The
host limit is enforced by the harness; the ledger is not a global slot allocator.

## Worker scheduling

When starting or resuming, find existing workers and validation processes.
Reuse live work and keep each role's worktree across deliveries. Replace a
worker for recovery or a shared-pool handoff only after checking its processes.
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

While Prep has an allocation, keep it working on one batch at a time under
`.agents/selection.md`. Unless its slot is being reassigned, it starts the next batch after submission without
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
reports a search blocker, use its saved attempts and source findings to redirect
the search. Follow `.agents/selection.md` for delivery size and retained cases,
and `.claude/agents/challenge-prep-worker.md` for exploration lanes. Keep missed
and deferred targets in the handoff; the orchestrator owns admission.

Handle worker messages and finished turns under "Notifications" below.
Do not create routine nested implementation workers.

If a worker is blocked, assign a worker to remove the obstacle unless someone
already owns that work. Resolve merge conflicts and shared-code ownership
yourself. Keep each shared dependency with one owner. When waiting is
unavoidable, record what is needed and who will provide it. Follow
"Notifications" when the blocker clears.

## Notifications

Workers send one `READY_TO_MERGE` message after saving a submission, with its
packet reference and next task or blocker. Main records receipt and acceptance
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

Send `CHANGES_REQUIRED` with specific findings to the responsible worker.
Corrections wait until it finishes or deliberately parks its current task.
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
first task's reservations. Workers read the latest accepted Main commit with
`worker-state.mjs accepted-main --file <shared-ledger>` and merge it at a clean
task boundary before selecting new work. Follow "Notifications" for wakeups.
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

Prep's exploration lanes are a separate exception to the read-only helper
rules below. Follow `.claude/agents/challenge-prep-worker.md`,
"Exploration lanes".

Use read-only helpers when they can answer a specific question while an
implementation worker continues. Use one for a cross-file survey, or up to
two to test different explanations of a difficult mismatch, only within
granted shared-pool slots. No helper has an extra capacity allowance. Give each a
narrow source or artifact scope and a stopping condition. Helpers do not
edit, enumerate session corpora, record games, or run full validation or
scoring. Forward useful findings promptly; the worker verifies them and
keeps implementation ownership. Stop an investigation when its explanation
is falsified or the cause is resolved.

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
