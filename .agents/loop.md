# Continuous operation

This file defines the orchestrator's implementation loop. Use it when the
user starts or resumes continuous implementation, not merely to answer a
question, prepare a proposal, or run a bounded task. Respect an explicit
time limit, stop request, or narrower task scope.

`.agents/glossary.md` defines the work units; `.agents/selection.md` governs
selection. `.agents/review.md` governs formal reviews.

## Worker scheduling

Run one main orchestrator and two persistent implementation workers, each
in a separate Git worktree. Each worker implements and validates its own
spans, periodically notifying the orchestrator that a completed span is
ready to merge. Only the orchestrator merges into the integration branch,
runs combined validation, and publishes to main. Use one worker when only
one independent goal is ready or resources permit only one. Do not add
implementation workers above two without user approval. Read-only helpers
do not own implementation.

The orchestrator owns the integration branch, main, `GOALS.json`,
`SCORE.tsv`, review records, aggregate scoring, and publication. Workers own
only their assigned source, focused tests, recipes, recordings, and local
handoff files. Do not merge worker copies of the central ledgers. A worker
proposes any new `QUALITY.json` area assignment; the orchestrator applies it.

Use `scripts/worker-state.mjs` to update `.cache/worker-state.json`.
Give each worker the absolute ledger path. Workers may record their own
connection, turn state, assignments, scope expansions and deliveries.
Only the orchestrator records integration, acceptance and publication.
Do not edit the JSON by hand.
Run it with `--help` for the commands and required fields. Record each
assignment, delivery, integration, validation, acceptance, publication,
and pause when it happens. The command adds timestamps and tracks reservations
for each task. Release only the reservations for the task being accepted or
parked.
This is recoverable local coordination state, not source-completion evidence.
Commit accepted source evidence to `GOALS.json` as usual.

The initial assignment and standing continuation permission below authorize
implementation even when that worker's `GOALS.json` does not list the goal as
open. Keep central opening, measurement, and closure serialized so another
worker's gains are not attributed to the wrong goal. Before initial dispatch,
the orchestrator prepares a worker-local `.cache/span-context.json` using the
fields and source-order/line-cap rules of `nextSpan()` and `spanContext()` in
`scripts/goal-log.mjs`. Workers prepare subsequent contexts by those same
rules, without mutating `GOALS.json` or waiting for a central goal to open.
Record queued goals at a safe central commit boundary, without changing an
in-flight checkpoint's inputs.

Before starting work in a new worker or integration worktree, run
`node scripts/worker-worktree.mjs prepare --branch <assigned-branch>`
from that worktree. Use `--help` for recorder setup options. The command
checks out the pinned C source and starts a fresh game with the worktree's
private recorder. If it fails, fix the setup before starting work. Before any
write, the worker verifies `pwd`, `git rev-parse --show-toplevel`, and its
branch against the assignment. Every command, edit, and descendant agent
uses that absolute worktree path. Never share a recorder installation.

Keep the same worker and worktree across deliveries; a span is a delivery
boundary, not a worker-lifetime boundary. Use a fresh worker only for recovery
or an explicit handoff, after establishing the previous worker's process
ownership. Do not make routine nested implementation workers another layer
of coordination.

Give each worker an initial span and standing permission to select subsequent
independent work within the user's task bounds. After sending an immutable
delivery, the worker selects its next scope under
`.agents/selection.md`, "Seed continuation", and claims it with a worker-state
`assign` event before editing. The command checks and reserves the scope
in one locked update. If another worker owns it, choose independent work.
After a successful claim, proceed without waiting for acknowledgement,
merge, combined validation, CI, or the other worker.

Reserve functions and shared-state contracts, not whole files indefinitely.
A dependency shared by workers has one owner. Keep reservations for pending
deliveries; release or revise them when a delivery is integrated, reassigned,
or deliberately parked. Ask the orchestrator before editing another worker's
reserved function or changing a shared contract. Continue independent work
while that ownership decision is pending.

## Merge requests

Before initial dispatch or replacement, have the worker record a `connect`
event from its assigned worktree. The orchestrator reads and acknowledges
that connection before dispatching implementation.

At each completed span, the worker sends `READY_TO_MERGE` to the main
orchestrator. A message containing the fields below is the merge request;
the worker does not perform the central merge itself. Send it when the span
has focused tests, lint, source evidence and required matching independent
recordings, not after waiting for a timer or for another worker. Long-running
spans send progress or blocker updates without claiming that incomplete work
is ready.

Each request identifies the worker and worktree, base and delivery SHAs,
exact commits to accept, dependencies on earlier deliveries, changed
paths/functions, commands and results, a delivery-specific copy of the source
evidence, matching recordings and the entry points they reach, and unresolved
work. Do not overwrite a prior delivery's evidence with the next span. Ready
means ready for integration, not accepted or measured progress. Corrections
are new commits, not amendments
to a submitted snapshot. The message also identifies the next scope or
investigation the worker is taking, or the concrete blocker if none is
available. Do not wait for a next-scope decision to submit a ready delivery.

First submit the delivery with `worker-state.mjs submit`; `--help` describes
the context, evidence and check-result files. The command derives commits
and paths from Git and saves an immutable evidence copy in the shared inbox.
Then send `READY_TO_MERGE` through the callable collaboration tool. In Codex,
collaboration tools are separate from `functions.ALL_TOOLS`.
An unavailable notification does not undo submission or block independent work.

The orchestrator records receipt of the exact SHA with a `received` event,
acknowledges it as `QUEUED_FOR_MERGE`,
and integrates requests individually. It sends `ACCEPTED` with the tested
integration SHA and checkpoint result after validation, or
`CHANGES_REQUIRED` with concrete findings. Publication and CI completion are
reported separately. Acknowledgement is not acceptance and is not required
before the worker continues independent work. Never require both workers to
be ready before accepting one worker's request.

Refresh a worker from validated main at a clean boundary using a
history-preserving merge. Preserve pending commits and dirty work; do not
reset or discard them to synchronize. The orchestrator accepts exact delivery
commits, preferring a merge when the history contains only intended work and
selective cherry-picks when needed to exclude unfinished work. Do not merge a
moving branch tip. Revalidate dependent work after an earlier correction.

Before starting or resuming, check for live workers and validation processes.
Do not duplicate or disrupt work that is still running.
For stopped workers, reuse unfinished changes only when their purpose,
scope, and remaining validation are clear. Otherwise abandon those changes
and start from validated main. Keep abandoned changes recoverable. Do not
treat them as pending work or automatically revisit them in future sessions.

If a bounded run ends, stop new spans including worker-selected continuations,
preserve unfinished work and its branch/commit/dirty paths in the local task
scratch file, and report remaining process ownership. Do not mark unfinished
work complete.

## Integration

Drain ready deliveries individually in dependency order. Among independent
ready deliveries, prefer the earliest ready one. An unready higher-ranked
goal does not block integration of a ready independent goal.

Before each wait and after each completion, run `worker-state.mjs next`.
Process unread deliveries and completed worker turns before waiting again.
Record observed turn completion with a `turn` event, then use `followup_task`
on the same worker when independent work remains. Accepting a worker's
finished task does not end its next task.

If a worker cannot find a task it can start, find out what is stopping it.
Give it the task of removing that obstacle, unless someone is already
doing so. The orchestrator handles merge problems and decides who may
edit shared code.
If the worker must wait, record what it is waiting for and who will
resolve it. Resume the worker when the obstacle is gone. Do not keep
asking it to search the same unchanged queue.

1. Recover any central open goal and its queued span with
   `node scripts/goal-log.mjs --current --detail`. Establish which exact
   delivery and checkpoint belong to it; do not infer the worker assignment
   from this command alone. Finish or deliberately park that integration
   before opening another. Preserve existing queued and parked work.
2. Check the delivery against its assignment, current completion evidence,
   source reservations, and selection reason. Queue/open its goal and plan
   its span with the existing `goal-log.mjs` commands in
   `.agents/selection.md` or `.agents/divergence.md`. Commit those central
   boundaries. Reconcile the planned source units with the delivery; do not
   close unrelated units or count a declaration as verification.
3. Integrate the immutable commits. Inspect the actual combined diff, whole
   source coverage, callers and entry-point recordings; run affected focused
   checks and `npm run lint`. Run `npm run quality` as the orchestrator and
   use `.agents/review.md` to decide review eligibility. Record verified
   source evidence, then commit the exact combined candidate.
4. Run `worker-state.mjs preflight --task <id>` on the committed candidate.
   Resolve every reported omission and run its listed focused checks before
   the full checkpoint. When retrying a failed checkpoint, supply its summary
   with `--previous-checkpoint` and address every failure it reports.
   Then run one `npm run checkpoint` on that candidate under
   `.agents/validation.md`. The orchestrator owns it through completion;
   workers continue independently. Freeze integration HEAD until evidence,
   score recording and closure are complete.
   When tests fail after a merge, assign a worker to find and fix the cause,
   then test the corrected code. Other workers continue their tasks.
   Before keeping work on hold because of an earlier failure, check
   current main and its saved test results: is the problem already fixed?
   If so, complete the usual acceptance checks and update the task records.
   Keep the original failed test result unchanged.
   Use saved test results to record tests that already finished.
   If the task tracker rejects the update, report the command and error
   rather than repeating those tests.
   A merge without conflicts still needs the required tests.
5. After a passing checkpoint, start `node scripts/mismatch-queue.mjs --json`.
   Use the saved summary for scores, close the span, and append its
   `SCORE.tsv` row following `.agents/scoring.md`. Before closing a source
   goal, verify every entry point, evaluate frozen challenge set v1, append
   the goal score, and close with the current saved development scan.
   Commit closure and investigation updates together without an intervening
   change to checkpoint inputs. Record a multi-span goal's active intervals
   so another delivery's gains are not credited to it. If the goal needs more
   spans, keep it open only while integrating that goal; otherwise park it
   before another goal's measurement. Its worker can continue independently.
6. Fast-forward main and push accepted work, subject to publication
   permissions. If permission is missing, retain the validated local commit
   and ask; do not retry a denied publication without new authorization.
   Use `worker-state.mjs sync-main --commit <accepted-commit>` for the local
   fast-forward. Record `published` only after the push succeeds; the command
   verifies both local main and the remote main commit.
   Watch each relevant CI run once by its exact commit/run ID. CI failure
   requires diagnosis and a corrected validated commit; workers continue
   independent work meanwhile. Do not claim CI passed before its run ends.

Keep background investigations running and reconsider reservations when the
queue returns. An assignment on a worker branch does not overwrite the
integration branch's count-keyed investigation cache. Skip new investigations
when the current work completes the user's bounded objective. When all 44
sessions match and `goal-log.mjs roadmap` lists no unverified C or Lua units,
stop and report the complete port.

A warranted correctness review is a loop step on a frozen committed range.
Later commits remain outside it. Stop or ask only under the user's bounds,
publication restrictions, and AGENTS.md's stop conditions; do not end a
continuous loop merely to report progress.

## Worker support

When the handoff leaves a broad, unresolved cross-file caller or dependency
question, start one read-only survey helper at substantially the same time as
the span worker. Tell both agents the split: the worker owns the complete
source comparison, implementation, focused tests, recordings, and commits;
the helper owns only the named survey and returns concise file and function
pointers plus the contracts they preserve. The helper does not edit files or
run a recorder, full suite, checkpoint, or scorer. Forward its findings while
the worker can still use them, and have the worker verify each pointer before
relying on it. Skip the helper when the symbol and callers are local or already
known, a prior investigation settled them, or implementation cannot proceed
independently. Record the agents' start and finish times, which findings the
worker used, duplication or rework, and handoff overhead.

When a confirmed difficult mismatch has two concrete, falsifiable
explanations, start at most two read-only investigators concurrently, one
for each explanation, while the span worker keeps implementation and
focused-validation ownership. This also applies when one focused
investigation has not resolved the mismatch after two source-backed probes and the
orchestrator can then state two distinct explanations. Give each
investigator a narrow source and artifact allowlist and tell it what would
falsify its explanation. It must stop when falsified and return concise
source pointers and evidence. It must not edit files, enumerate session
corpora, record a session, or run a full suite, checkpoint, or scorer.
Forward each verified result as soon as the worker can use it, and stop the
remaining investigation if the worker resolves the mismatch first. Skip
this overlap when the cause is already source-local, the explanations are
not distinct, or implementation cannot proceed independently. Record the
investigators' start and finish times, overlap with implementation, the
accepted and rejected explanations, findings used by the worker,
duplication or rework, and handoff overhead.

While the worker runs, follow the waiting rules in the shared
instructions' "Operational Workflow" section. Wait with
notification-aware waits of at most 60 seconds; process any ready delivery
or free worker slot before waiting again. Track elapsed time across waits.

After ten minutes without an update, inspect the worker transcript. Evidence
of liveness—new transcript events, an active tool call, or a retained process
handle—starts another ten-minute liveness window using the same bounded
waits. A stationary transcript with no active tool call or retained process
handle starts a 60-second
confirmation wait. If the transcript remains stationary, call
`followup_task` with the existing worker path when it is idle. When
collaboration still reports it as running, call `interrupt_agent` once and
then call `followup_task` with that same path.

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

Start the two persistent workers at loop entry or resume them after recovery.
Spawn other subagents only at the support or investigation step that calls
for them. A ready-to-merge message does not require replacing its worker.

When the loop runs under `/loop`, completion notifications advance work in
flight. When `ScheduleWakeup` is available, set it to ten minutes as a
recovery watchdog and use a short interval when idle. End the loop with
`ScheduleWakeup stop` only for `AGENTS.md`'s stop cases; running low on
context is not a reason to stop.

## Background investigations

At loop entry and after each queue refresh, use the per-session order and
cache rules in `.agents/selection.md`. For every mismatching session without
a valid completed investigation, start or continue a source investigation in a
subagent. Exclude sessions owned by active workers or pending deliveries.
Launch investigators concurrently up to the available capacity, reserving
both implementation slots and any helper required by their current work. When
capacity is exhausted, queue the remaining sessions in the same order and
start the next as a slot becomes available. Keep only one investigator per
session; reuse partial findings when continuing an investigation.

Give each investigator its session, remaining-screen count, examined commit,
queue entry, existing artifacts, and any partial cache entry. Require it to read
`.agents/selection.md`, "Investigation cache", for the exact field names and
types; do not substitute an abbreviated schema in the handoff. It reads source
and artifacts and may replay its assigned session under `.agents/validation.md`.
Read source at the examined commit with `git show` or an existing worktree;
do not mix findings from a changing working tree into that commit's evidence.
It identifies the source owner, branch and preconditions, callers, dependencies,
and goal scope. Its only writes are its assigned
`investigations/<session>.json` file and session-specific diagnostic artifacts
under `.cache/`; it does not edit game code, instructions, `GOALS.json`, or
score records. Leave commits and pushes to the orchestrator. It does not scan
other sessions, record C runs, or run a full suite, checkpoint, or aggregate
scorer.

Have each investigator write its result in the schema in `.agents/selection.md`
to a temporary file beside its assigned cache file, then rename it into place
before sending its completion message. Call `readInvestigation(root, queueEntry)`
from `scripts/investigation-cache.mjs` with the assigned session and count and
require a `complete` or `partial` status. Repair a malformed result from its
existing findings without repeating the investigation. Include the assigned count and cache
path in the message; the orchestrator publishes results as `.agents/selection.md`
specifies. If a scan changes the count during investigation, stop or finish
the old assignment before starting its replacement; do not accept its old
result for the new count or let it overwrite a newer result.

Use completion notifications to collect results and refill available slots.
When implementation can proceed from a valid completed investigation, proceed
without waiting for other investigators. When none is ready, wait for a
completion, check the cache and current session order, and begin implementation
as soon as one qualifies. A partial result stays queued for continued
investigation. Do not wait for the whole investigation batch before choosing
work. Pass reused source findings to the worker and verify them as the normal
source review requires.

## Reports

Under `/loop`, relay one report per worker iteration: the span that
closed, the development score before and after, newly matching recordings,
the relevant first mismatch before and after, any bug the worker hit, and
which span or goal the loop takes next. Use `git diff --name-only
--diff-filter=A <span-start>..HEAD -- recordings` to identify new recordings;
a passing checkpoint confirms they match. A repeated score can accompany
new coverage. Report recovered regressions separately from newly earned
screens, and never describe queue upper bounds as delivered or expected gains.
Every aggregate figure comes from the exact combined checkpoint; do not use
worker-branch totals as delivered progress. Report ready, integrating,
validated, published and CI-complete states separately. Include the next
assignment for each free worker slot and any dependency wait or integration
rework; do not count validation queue time as idle time when a worker is
coding. A parked goal's delivered count includes only its active
intervals; gains while another goal runs belong to that goal.

Keep updates brief and specific: report changed behavior, remaining
work, and the next check when useful. Do not repeat unchanged status.
When switching between implementation, validation, and review, state the
switch and the reason once. Review reports follow `.agents/review.md`.
