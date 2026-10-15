# Agent architecture and shared work queue

This is the authority for agent hierarchy, queue ownership, scheduling,
rework, worktrees, and dashboard identities. Other guides supply source,
evidence, batch-admission, and publication requirements; they do not define
additional queues or independent dispatch policies. See "Tooling transition"
below before attempting to run this architecture with the existing scripts.

## Agents and authority

The verified cloud limit is seven total agents, including the conversation
root and every nesting level. A configuration setting cannot raise the host
limit. Use fewer agents if the host reports a lower limit.

```text
Conversation coordinator
  Main (work lead)
    Worker 1
    Worker 2
    Worker 3
  Prep lead
  Process agent
```

Main, Prep, and Process are siblings and message one another directly.
The conversation coordinator stays available for user requests, priorities,
and decisions; it does not relay routine task traffic. Main owns dispatch,
integration, validation, acceptance, admission, central records, and
publication. It is the dashboard's Main, irrespective of agent parentage.

Prep plans exploration, adds bounded investigation tasks, evaluates returned
evidence, deduplicates causes, and assembles batches for Main. Prep does not
spawn explorers or independently assign workers. The Process agent observes
the queue and deliveries, develops process proposals, and reports to the
conversation coordinator. Main integrates approved changes at safe task or
validation boundaries. Process does not change active claims or priorities.

Workers are persistent generalists and remain children of Main. An assignment
can involve exploration, implementation, or rework; its type does not rename,
reparent, suspend, or restart the worker. Workers do not spawn more agents.
Read-only surveys and validation follow-ups also use these three workers;
there is no extra helper quota or permanent Prep-1..Prep-6 team.

## One queue, two producers

The queue is shared state and tooling, not an agent. It stores executable
assignments; diagnostic mismatch lists are inputs, not competing schedulers.
Keep the queue, claims, and immutable result packets in a shared location
outside changing task branches. Update them through the supported atomic
commands, never by hand or by copying worker-local ledgers together.

Prep produces exploration tasks and exploration follow-ups. Main produces
implementation tasks from admitted mismatches, validation corrections,
regression repairs, and tasks needed to unblock work. Workers return results
and may propose follow-ups; the responsible producer approves additions.
Process proposals become scoped work only after Main approves them.

Every task identifies its immutable ID, type, producer/result recipient,
batch or target deliverable when applicable, question or desired result,
stopping condition, base commit, dependencies, source/session reservations,
allowed edits, required checks, and expected artifacts. Use canonical session
IDs including corpus and batch. Explicit dependencies determine readiness.
One task may cover several sessions with a common source cause.

Tasks are ready, claimed, blocked, completed, or superseded. A worker claims
one ready task atomically; source and session reservations prevent competing
claims. A successful claim supplies the worker's branch, worktree, context,
and result recipient. Workers report through shared state and message the
recipient directly. Main owns the dispatch policy even when Prep receives
the result. No producer can bypass that policy by messaging an assignment.

Complete an assignment only after preserving its result and collecting or
explicitly handing off every owned command. A result may be a fix, retained
exploration evidence, a match, duplicate, bounded miss, or deferred finding.
Completion means execution finished, not that a fix or batch was accepted.
After completion, claim the next eligible item using the same policy; no
per-task user permission or manual worker-role transfer is needed.

Block work that cannot proceed and name the dependency and owner. Silence or
a timeout alone does not release a claim: Main checks the agent and processes
and preserves a recovery packet before reassignment. Do not duplicate live
work. Deduplicate related causes and retire tasks made obsolete by accepted
changes. Reassess stale evidence before dispatch, retaining earlier results.

## Priority at claim time

Recompute priority from current queue contents when a worker becomes free.
Do not preempt active assignments or commands when the count changes.

First address regressions, acceptance-blocking rework, and concrete tasks
that unblock other work. For ordinary tasks, count distinct ready, unclaimed
implementation sessions. Include investigated sessions still awaiting a fix;
exclude claimed, blocked, superseded, already resolved, and submitted work
awaiting acceptance. Count sessions rather than goals, workers, exploration
probes, or source groups. Respect shared-cause reservations when dispatching.

- With zero through four ready sessions, prefer exploration.
- With five or more, prefer independently assignable implementation work.
- If the preferred type has no ready task, take useful work of another type.

Dependencies and oldest-ready time order otherwise comparable tasks. Preserve
the original ready time through retries and reassess older tasks at handoff
boundaries so lower-priority work does not disappear indefinitely. Unknown or
stale queue evidence is not a count of zero. Refresh it before applying the
threshold. Record the count and selection reason for dashboard explanations.
Seed continuation is only a tie-breaker within this policy.

## Batches and admission

Prep maintains one active batch plan, varying source behaviors and independent
C inputs under `.agents/selection.md`. Workers perform queued investigations
and return reproducible C evidence. Prep can assemble a batch while workers
continue other assignments. Finish included recordings and preserve hashes
before submitting; unfinished investigations remain separate queue items.

Main accepts batch deliveries using `.agents/validation.md`. Acceptance does
not admit a batch or make every observed mismatch current. Only after
admission and a complete baseline against accepted JavaScript does Main add
the still-unresolved sessions to the queue. If a fix lands first, reassess
the baseline instead of dispatching obsolete work. Preserve earlier batches,
recordings, evaluation history, and the fixed workload.

## Rework and immutable deliverables

A task is an execution assignment; a deliverable has its own revision and
acceptance lifecycle. Completed tasks stay completed. A rejected deliverable
creates a new rework task linked to its exact revision, findings, affected
scope, required base/dependencies, and checks. Rework produces a new revision
and supersedes the earlier candidate without erasing commits or failed CI.

Main creates implementation or batch-validation rework. Prep creates
corrections and follow-ups to exploration evidence. Prep remains responsible
for assembling a corrected batch; scope its queued worker rework to the case
or evidence correction and name Prep as result recipient. Batch assembly and
Main's acceptance steps remain coordinator work, not extra worker queues.
Prefer the original worker's context when available, but do not wait
indefinitely or interrupt its current assignment. Another worker may claim
rework from a complete evidence packet. Freeze dependent work whose
assumptions were invalidated. Keep relevant reservations attached to the
deliverable/rework dependency until acceptance, parking, or supersession;
never release them merely because the first execution task completed.

## Worktrees and branches

Use six writable checkouts: Main's existing checkout, one Prep worktree, one
Process worktree, and one persistent worktree for each of the three workers.
The conversation coordinator needs no additional checkout and does not write
into another agent's working tree. All worktree paths stay explicit.
These are the routine checkouts. Validation or a user-requested audit may
require an additional temporary checkout pinned to its tested revision under
`.agents/validation.md` or `.agents/review.md`; it does not grant another agent
slot or a second owner for a live worker worktree.

Keep each worker in its own worktree across task types. Use a branch per
assignment and an explicit base: accepted Main for ordinary work, or the
specified deliverable revision plus required accepted dependencies for rework.
Before switching assignments, finish owned processes, commit/preserve changes,
freeze submission packets and logs outside the moving worktree state, and
verify the tree is clean. Never stash, reset, rebase, amend, or delete another
agent's work or an immutable submitted revision just to make a switch easy.

Verify checkout root, branch, task context, and reservations before edits.
Use `worker-worktree.mjs prepare --branch <assigned-branch>` for supported
setup, then its check command as appropriate. A branch switch may invalidate
generated data, dependencies, the C submodule, or recorder patches; inspect
and refresh those prerequisites before relying on retained outputs.
Each worktree that records C games needs a private recorder installation,
including its mutable saves and lock files. Do not share live recorder state.

Prep imports only selected case files and their evidence into its batch
branch, preserving exact worker result references. Process edits only its
assigned tooling/instruction scope. Main integrates exact submitted revisions
and retains the existing single-candidate validation/publication gates.

## Dashboard and recovery

Show stable Worker 1..3 lanes and label each assignment Exploration,
Implementation, or Rework. Show Prep's planning/assembly and Main's delivery,
validation, admission, and publication activity separately. Show ready task
counts, the implementation-session count, blocked reasons, and the dispatch
reason. Do not infer CPU use or idleness from elapsed ownership or silence.

Preserve legacy A/B/C and Prep-1..Prep-6 history without relabeling past events.
A completed assignment must not accumulate ongoing worker utilization while
its deliverable awaits acceptance. Rework links back to the rejected revision;
it does not reopen the completed assignment. Publish no private paths,
process handles, credentials, or private reasoning in dashboard summaries.

## Tooling transition

This file defines the approved architecture, not a claim that its queue
implementation exists. The current `worker-state.mjs` protocol still models
implementation tasks through acceptance, Prep probes with fixed role names,
and worktree/branch ownership per legacy worker. `workerWork.unstartedSessions`
excludes investigated sessions and is not the ready-session count above.
Current dashboards also group those legacy roles.

Before starting the unified loop, implement and test persistent-worker claims
across task types and assignment branches, two-producer enqueue permissions,
separate task/deliverable/rework identities, admission-based enqueueing,
ready-session priority, safe recovery/reservations, and stable-worker dashboard
history. Use one authoritative queue; do not bolt a second dispatch queue onto
the existing scheduler or invent commands that its CLI does not expose.
Existing submission, CI, acceptance, and admission helpers remain evidence
gates; migrate their identities without weakening those gates.

For a running legacy loop, preserve claims, processes, submissions, and
history, and migrate at a clean boundary using supported commands. Do not
rename ledger entries or convert partial work by hand. Until migration is
implemented, legacy command examples in other guides describe the old
protocol only and do not authorize starting a purported unified queue loop.
