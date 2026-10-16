# Agent architecture and shared work queue

This is the authority for agent hierarchy, queue ownership, scheduling,
rework, worktrees, and dashboard identities. Other guides supply source,
evidence, batch-admission, and publication requirements; they do not define
additional queues or independent dispatch policies. See "Tooling transition"
below before enabling it on an existing ledger.

## Agents and authority

The verified cloud limit is seven total agents, including the conversation
root and every nesting level. A configuration setting cannot raise the host
limit. Use fewer agents if the host reports a lower limit.

```text
Coordinator
  Work lead
    Worker 1
    Worker 2
    Worker 3
  Challenge lead
  Process analyst
```

The Work lead, Challenge lead, and Process analyst are siblings and message
one another directly. The Coordinator stays available for user requests,
priorities, and decisions; it does not relay routine task traffic. The Work lead owns dispatch,
integration, validation, acceptance, admission, central records, and
publication. The dashboard uses the same role names irrespective of agent parentage.

The Challenge lead plans exploration, adds bounded investigation tasks,
evaluates returned evidence, deduplicates causes, and assembles batches for
the Work lead. It does not spawn explorers or independently assign workers.
The Process analyst continuously reviews queue and delivery friction, including
rejected deliveries, repeated failures, and recurring coordination mistakes.
This is the user's standing request for ongoing triage; no new request is needed
for each review. Keep reviews independent of worker execution. Reflect briefly
after each completed batch and periodically at safe boundaries during active
work, using saved evidence rather than interrupting workers or repeating checks.
Record observations in [friction.md](friction.md), develop small evidence-backed
changes in [proposals.md](proposals.md), and report actionable findings to the
Coordinator. Measure adopted changes against the observed friction when comparable
evidence becomes available; leave unknown benefits explicitly unmeasured.

The Process analyst drafts concise adopted-change entries in
[decisions.md](decisions.md). The Work lead integrates approved changes and their
entries together at safe task or validation boundaries, preserving all existing
validation and publication gates. The Process analyst does not change active
claims or priorities, interrupt workers, or add worker capacity.

Workers are persistent generalists and remain children of the Work lead. An assignment
can involve exploration, implementation, or rework; its type does not rename,
reparent, suspend, or restart the worker. Workers do not spawn more agents.
Read-only surveys and validation follow-ups also use these three workers;
there is no extra helper quota or permanent Prep-1..Prep-6 team.

## Models and launch

The role profiles registered in `.codex/config.toml` define model and reasoning
effort: use `work_lead`, `challenge_lead`, `process_analyst`, and `worker`.
All three general workers use the worker profile. The Coordinator uses the
user's selected conversation settings.

Apply the matching profile when launching each agent. If the host's spawn API
does not select named profiles, read the referenced role file and pass its
model and effort explicitly. Full-history forks may inherit their parent's
settings; use a fresh agent with an explicit handoff when required to apply a
different profile. Confirm the actual selection instead of assuming the
repository's generic subagent default overrides inheritance. Report an
unavailable requested model or effort rather than silently substituting it.

## One queue, two producers

Existing ledger records and command fields retain `Main` for the Work lead
and `Prep` for the Challenge lead. The ledger's `coordinatorRoot` belongs to
the Work lead's checkout, not the conversation Coordinator. These are stored
protocol identities, not extra agents. The dashboard displays the current
role names without rewriting events. Existing helper names and flags such as
`prep-handoff.mjs` and `--prep` remain supported; new profiles have no aliases.

The queue is shared state and tooling, not an agent. It stores executable
assignments; diagnostic mismatch lists are inputs, not competing schedulers.
Keep the queue, claims, and immutable result packets in a shared location
outside changing task branches. Update them through the supported atomic
commands, never by hand or by copying worker-local ledgers together.

Challenge lead produces exploration tasks and exploration follow-ups. Work lead produces
implementation tasks from admitted mismatches, validation corrections,
regression repairs, and tasks needed to unblock work. Workers return results
and may propose follow-ups; the responsible producer approves additions.
Process analyst proposals become scoped work only after Work lead approves them.

The producer that enqueues a task owns its sensibility and post-result
disposition: check the bounded question, prerequisites, known overlap, and
stopping condition before enqueueing. Challenge lead owns `Prep` exploration;
Work lead owns `Main` implementation and support. After a result or block, the
producer reviews the evidence and supplies an explicit disposition or scoped
follow-up. A duplicate, infeasible scout, or reached bounded stop is closed
with its evidence and reason preserved, rather than left indefinitely blocked;
retain a live block only for a named unresolved dependency. Work lead reviews
and executes the supported queue transitions and retains dispatch authority.
These dispositions preserve immutable history and all validation, admission,
and acceptance gates.

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
recipient directly. Work lead owns the dispatch policy even when Challenge lead receives
the result. No producer can bypass that policy by messaging an assignment.

Complete an assignment only after preserving its result and collecting or
explicitly handing off every owned command. A result may be a fix, retained
exploration evidence, a match, duplicate, bounded miss, or deferred finding.
Completion means execution finished, not that a fix or batch was accepted.
After completion, claim the next eligible item using the same policy; no
per-task user permission or manual worker-role transfer is needed.

Block work that cannot proceed and name the dependency and owner. Silence or
a timeout alone does not release a claim: Work lead checks the agent and processes
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

Challenge lead maintains one active batch plan, varying source behaviors and independent
C inputs under `.agents/selection.md`. Workers perform queued investigations
and return reproducible C evidence. Challenge lead can assemble a batch while workers
continue other assignments. Finish included recordings and preserve hashes
before submitting; unfinished investigations remain separate queue items.

Work lead accepts batch deliveries using `.agents/validation.md`. Acceptance does
not admit a batch or make every observed mismatch current. Only after
admission and a complete baseline against accepted JavaScript does Work lead add
the still-unresolved sessions to the queue. If a fix lands first, reassess
the baseline instead of dispatching obsolete work. Preserve earlier batches,
recordings, evaluation history, and the fixed workload.

## Rework and immutable deliverables

A task is an execution assignment; a deliverable has its own revision and
acceptance lifecycle. Completed tasks stay completed. A rejected deliverable
creates a new rework task linked to its exact revision, findings, affected
scope, required base/dependencies, and checks. Rework produces a new revision
and supersedes the earlier candidate without erasing commits or failed CI.

Work lead creates implementation or batch-validation rework. Challenge lead creates
corrections and follow-ups to exploration evidence. Challenge lead remains responsible
for assembling a corrected batch; scope its queued worker rework to the case
or evidence correction and name Challenge lead as result recipient. Batch assembly and
the Work lead's acceptance steps remain lead work, not extra worker queues.
Prefer the original worker's context when available, but do not wait
indefinitely or interrupt its current assignment. Another worker may claim
rework from a complete evidence packet. Freeze dependent work whose
assumptions were invalidated. Keep relevant reservations attached to the
deliverable/rework dependency until acceptance, parking, or supersession;
never release them merely because the first execution task completed.

## Worktrees and branches

Use six writable checkouts: the Work lead's existing checkout, one Challenge
lead worktree, one Process analyst worktree, and one persistent worktree for
each of the three workers.
The Coordinator needs no additional checkout and does not write
into another agent's working tree. All worktree paths stay explicit.
These are the routine checkouts. Validation or a user-requested audit may
require an additional temporary checkout pinned to its tested revision under
`.agents/validation.md` or `.agents/review.md`; it does not grant another agent
slot or a second owner for a live worker worktree.

Keep each worker in its own worktree across task types. Use a branch per
assignment and an explicit base: the accepted base for ordinary work, or the
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

Challenge lead imports only selected case files and their evidence into its batch
branch, preserving exact worker result references. Process analyst edits only its
assigned tooling/instruction scope. Work lead integrates exact submitted revisions
and retains the existing single-candidate validation/publication gates.

## Dashboard and recovery

Show stable Worker 1..3 lanes and label each assignment Exploration,
Implementation, or Rework. Show Challenge lead's planning/assembly and Work lead's delivery,
validation, admission, and publication activity separately. Show ready task
counts, the implementation-session count, blocked reasons, and the dispatch
reason. Do not infer CPU use or idleness from elapsed ownership or silence.

Preserve legacy A/B/C and Prep-1..Prep-6 history without relabeling past events.
A completed assignment must not accumulate ongoing worker utilization while
its deliverable awaits acceptance. Rework links back to the rejected revision;
it does not reopen the completed assignment. Publish no private paths,
process handles, credentials, or private reasoning in dashboard summaries.

## Tooling transition and commands

Snapshot-only reports use a separate verified `snapshot-published` observation;
they are not implementation acceptance or standalone tooling validation. The
latest observed Main can advance through these reports while the execution
queue base and live assignment bases stay unchanged. Only the verified
snapshot-only chain supplies equivalent assignment bases. See
[local exploration snapshot refresh](loop.md#local-exploration-snapshot-refresh)
for the WL-local coalescer, shared Main lease, proof and recovery rules. Other
tooling/game changes retain ordinary queue refresh and reassessment requirements.

`worker-state.mjs` remains the one atomic event ledger. Its `queue-*` events
own dispatch and execution under `state.queue.tasks`; `state.tasks` and
`state.deliveries` retain the existing submission/acceptance transport. These
are projections of the same log, not two dispatch queues. `work-queue.mjs`
is the verified CLI for enqueueing, prioritizing, claiming, and results.

For a new run, initialize the ledger with `worker-state.mjs init --run
loop-YYYYMMDD --file <absolute-shared-ledger>`. Work lead registers Challenge lead and
Worker-1..Worker-3 in their real private worktrees with the existing
`register` event (actual branch, HEAD, and agent handle). Existing connections
and observations remain supported. Use six agents below the conversation
root; no queue command itself launches an agent.

From Work lead, enable and feed the queue:

```sh
node scripts/work-queue.mjs enable --prep <absolute-challenge-lead-worktree> --file <absolute-ledger>
node scripts/work-queue.mjs refresh --queue <saved-combined-mismatch-queue.json> --file <absolute-ledger>
node scripts/work-queue.mjs next --file <absolute-ledger>
```

If a fresh ledger has no accepted baseline, observe an already validated and
published initial tooling commit with
`node scripts/initial-baseline.mjs --ledger <absolute-ledger> --commit <published-SHA> --checkpoint <archived-summary.json>`.
This requires the enabled queue, no prior accepted history or active integration,
an exact passing execution checkpoint, and matching local and remote `main`.
The publication may equal `queue.initialBase` or follow it through tooling and
bookkeeping changes only. The command hash-freezes its checkpoint beside the
ledger and emits the existing `tooling-published` event; it invents no delivery
or acceptance and leaves claims and original bases unchanged. Exact retries are
idempotent. Ordinary tooling publication and implementation bootstrap still
require an earlier accepted anchor. See `.agents/validation.md`, "Fresh-ledger
baseline", for refresh and comparison handoff.

Refresh verifies admitted-batch membership and current recorded evaluations
at accepted base HEAD. It enqueues unresolved implementation sessions,
including investigated ones, rechecks pending imported sessions, and retires
resolved unclaimed work. Known source reservations prevent dispatching
competing fixes. Missing/stale evidence blocks ordinary claims rather than
pretending there is no implementation work. Use `reassess --task <id>
--reason <new-evidence>` for a pending source-plan task whose explicit base
needs updating after a refresh. Never reassess a live claim by branch switch.

From Challenge lead, enqueue a JSON assignment file with `work-queue.mjs enqueue
--json <file> --file <absolute-ledger>`. An exploration assignment has:

```json
{
  "id": "v90-room-source", "type": "exploration", "output": "exploration",
  "producer": "Prep", "recipient": "Prep", "batch": "v90",
  "question": "Reach and trace the named C behavior.",
  "stop": "Return reproducible evidence or a bounded blocker.",
  "base": "<accepted-base-SHA>", "dependencies": [], "sessions": [],
  "reservations": ["source:mkroom.c:mkroom"],
  "allowedPaths": ["challenges/cases/v90/", ".cache/"],
  "checks": ["fresh", "comparison"],
  "artifacts": ["challenges/cases/v90/room.recipe.json", "challenges/cases/v90/room.session.json"]
}
```

The JSON is a file, not inline shell text. Use full SHA references in task
packets. Work lead may enqueue scoped implementation/rework using the same schema;
rework also needs `target` and `findings`, and exploration rework names
`targetTask` when targeting a worker result rather than a batch delivery.
Implementation transport IDs are derived, not producer-assigned. Challenge lead cannot
enqueue implementation or change worker claims through either CLI.
Producer IDs cannot use the reserved `session:`, `rework:`, or `delivery:`
prefixes. Generated branches hash the run and assignment identity, so punctuation
does not create collisions or invalid Git names. Existing transport identities
cannot be reused for unrelated work. Implementation feedback already creates
its correction: use that rework assignment rather than enqueueing a duplicate.

For a bounded survey or validation follow-up, Work lead can enqueue exploration
with `purpose: "support"`, producer/recipient `Main`, no batch, and only
`.cache/` write scope. This uses the same workers and priority policy.
Support results may retain observed nonzero check exits with outcome `failure`;
Challenge lead's C evidence checks must pass before a result completes.

From a worker's persistent worktree, `work-queue.mjs claim --worker Worker-1
--file <absolute-ledger>` atomically chooses priority and creates a clean
assignment branch. It refuses dirty files, live handles, and competing claims;
retries return the current assignment. Run worktree setup/checks for that
branch before execution. Use `processes --worker Worker-1 --json <array-file>`
to retain/clear owned command handles; finish the command before clearing it.

Exploration completes with `complete --worker Worker-1 --json <result-file>`.
The result supplies `summary`, `outcome` (failure/match/duplicate/miss/deferred),
committed `paths`, and successful `checks` with kind, command array, exitCode,
and absolute log path. The command checks scope, freezes artifact hashes and
log contents in `<ledger>.results`, and completes the execution assignment.
Use `block --worker Worker-1 --reason <dependency>` only after preserving a
clean recovery commit and collecting commands. Work lead uses `unblock` or
`supersede` with `--task` and `--reason`; silence never reassigns a worker.

For new scratch-only exploration tasks that promise self-contained evidence,
the producer can require a typed attachment:

```json
"evidenceContract": {
  "version": 1,
  "complete": ["input", "capture", "replay", "comparison"],
  "block": ["provenance"]
}
```

Then both `complete` and `block` require `--evidence <existing-envelope.json>`.
This attachment is separate from command check logs: a verifier's PASS line
cannot substitute for it. The envelope is UTF-8 JSON with `version: 1`, exact
`task` and `base`, `files` entries (`name`, `bytes`, `sha256`, canonical
`base64`), and `references`, an object mapping role names to nonempty arrays
of embedded file names. All references must resolve; each phase's declared
roles must exist. Choose block roles that can honestly be supplied when
execution stops before capture/replay. Preserve original command receipts,
including failures, in the embedded files; do not invent successful checks.
The reader validates identity, decoded lengths/hashes and references, and
freezes the exact original envelope bytes and outer hash in the result or
recovery packet. Limits are 128 MiB of JSON, 64 MiB decoded and 4096 files.

An evidence-only correction may declare `targetTask` and `targetDigest` in
the contract and envelope, binding an existing result/recovery packet. Embed
the existing original envelope bytes as a file; retaining them needs no new
gameplay. This creates a supplemental result without changing the target.
Known recovery packet identities remain linkable after supersession,
resumption or later results; they do not depend on the target's current status.
Internal byte consistency does not establish source correctness, comparison
success, or case admissibility. Completion still requires the existing
successful checks, and a blocked attachment does not create a successful
result. Legacy assignments and immutable packets retain their original
contracts. Optional `--evidence` on an untyped assignment uses the same
versioned schema with task/base binding and no declared required roles.

An unblocked attempt starts from its preserved recovery commit and keeps the
original comparison base. If accepted base changed, reassessment requires that
recovery commit to include it; retain stale recovery work rather than discard it.
Every command requires `--file <absolute-ledger>`; see `--help` for full syntax.

For implementation, the claim returns `transport`. Use that ID for existing
`implement`/`scope` events and `worker-state.mjs submit`, preserving all
source/evidence gates. Verified submission automatically completes the queue
assignment while its immutable delivery awaits acceptance. Feedback on that
delivery automatically creates a separate urgent rework assignment, which
another worker can claim; acceptance/publication helpers still consume the
transport ID. The completed original assignment and its evidence remain.

Challenge lead starts a clean batch branch with `work-queue.mjs batch --branch prep/v90
--file <absolute-ledger>` before existing batch assignment/submission commands.
For a rejected batch, pass `--base <rejected-delivery-SHA>` to resume its
transport on a new correction branch; Work lead enqueues the needed worker rework.
The branch command preserves Challenge lead's producer identity and refuses live batch
work or commands. Admission import adds unresolved new sessions as blocked
assignments. Refresh after accepted publication to make their current evidence
runnable; imported baseline evidence alone does not authorize a candidate.

For a running legacy loop, finish or explicitly preserve all execution claims
and commands before `enable`. Record the validated tooling publication under
`.agents/validation.md` so accepted base includes this protocol before workers
branch from it. Release old A/B/C handles with supported
observations; do not rename events or discard submissions. Register the new
Worker-1..3 identities only after their old owners have relinquished their
worktrees. Inactive historical rows and immutable deliverables remain readable;
the new queue can adopt those clean worktrees. Legacy `assign`/`resume` and
`prep-probe` cannot bypass unified dispatch after enable. Historical batch and
acceptance transport remains supported; its CLI IDs are not execution tasks.
