# Continuous operation

This file defines the orchestrator's loop: goal selection, span iteration,
measurement, and the reviews it may call for.

`.agents/glossary.md` defines the terms this file uses.
`.agents/review.md` states when a correctness review is warranted and how to
run one.

Maintain "Background investigations" throughout the loop, including while
waiting for an active implementation worker or its checkpoint.

The orchestrator repeats without returning to the user between steps:

   On entry (or after a restart), check
   `node scripts/goal-log.mjs --current` for the current state:

   - No goal in progress: start at step 1.
   - Goal in progress, a span is queued: the worker may have been interrupted.
     Run `git log --oneline` and check the shared checkpoint results described
     in `.agents/validation.md`, "Routine validation", to
     establish what it landed. If the span's commits landed, skip the worker
     and continue with step 3's measurement and push; otherwise start at
     step 3 and spawn the worker.
   - Goal in progress, no queued span: start at step 2.
   - A parked goal retains its evidence and spans. Resume it only when the
     current mismatch queue permits it; it does not outrank a new blocker.

1. When no goal is in progress, select the next goal.

   a. Read `node scripts/goal-log.mjs --current --detail`. Existing queued
      or parked work still needs to satisfy the current mismatch queue.
   b. Run `node scripts/mismatch-queue.mjs --json` and maintain the background
      investigations described below. When every fixed-workload session
      matches and `node scripts/goal-log.mjs roadmap` lists no unverified
      C function or Lua program, the port is complete: stop the loop and
      notify the user. Otherwise choose the goal by the order in
      `.agents/selection.md`, "Choosing a goal", and queue it with
      `node scripts/goal-log.mjs queue-goal`.
   c. Open the goal with `node scripts/goal-log.mjs open-goal --id <id>`,
      which captures the development standing, and commit `GOALS.json` with
      a message that starts `Open <id> goal`.
2. Plan the next span with `node scripts/goal-log.mjs next-span --goal <id>`.
   It combines declaration inventory with recorded completion evidence,
   rechecks selection, queues a span, and writes `.cache/span-context.json`.
   Before planning, apply `.agents/selection.md` to the refreshed queue and
   investigation cache. A declaration without evidence stays in scope. If
   selection now favors another blocker, park the open goal with
   `park-goal --goal <id> --reason "<source-based reason>"` and return to step 1.
   When every source unit has evidence, the goal has no span left: go to
   step 6. Otherwise
   commit `GOALS.json` with a message that starts `Queue <span name> span`.
   For a divergence fix, name the span yourself with `queue-span` and write
   the context file from `.agents/divergence.md`, step 2.
3. Spawn a span worker (`.claude/agents/span-worker.md`) for that span.
   Include the selected mismatch entry, the commit it describes, the valid
   investigation cache path, relevant source ranges, and paths to existing
   evidence in the handoff. Keep background investigations running while the
   span worker implements and validates.
   The worker owns implementation validation through checkpoint completion
   and handoff, following `.agents/validation.md`, "Routine validation". Do not
   launch a competing full suite, checkpoint, or development scorer while
   it performs that validation.

   When the handoff leaves a broad, unresolved cross-file caller or dependency
   question, start one read-only survey helper at substantially the same time as
   the span worker. Tell both agents the split: the worker owns the complete
   source comparison, implementation, tests, recordings, commit, and checkpoint;
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
   checkpoint ownership. This also applies when one focused investigation has
   not resolved the mismatch after two source-backed probes and the
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
   `wait_agent({timeout_ms: 600000})`; the wait returns early when an agent
   sends an update or completes.

   At timeout, inspect the worker transcript. Evidence of liveness—new
   transcript events, an active tool call, or a retained process handle—starts
   another ten-minute notification-aware wait. A stationary transcript with
   no active tool call or retained process handle starts a 60-second
   confirmation wait. If the transcript remains stationary, call
   `followup_task` with the existing worker path when it is idle. When
   collaboration still reports it as running, call `interrupt_agent` once and
   then call `followup_task` with that same path.

   Use the worker's completion message to trigger handoff checks. When it
   returns, establish what landed with
   `git log --oneline origin/main..HEAD` and `git status --short`. The worker
   runs `npm run checkpoint` after committing, so
   its shared summary describes the tested commit. Apply
   `.agents/validation.md`, "Routine validation", to find and reuse its
   results or handle a failure. Push before the turn ends.

   Watch the CI run from a background task (`gh run list --limit 1`,
   then `gh run watch <id> --exit-status`). Retain one watcher for that run;
   do not also poll run lists or CI logs for its completion. CI can fail
   where a local checkpoint passes; start the next step without waiting.
   When a run fails, diagnose, fix, push,
   and watch the new run before the current span closes. The `gh`
   commands require `gh repo set-default vtjeng/teleport-contest`; run
   it if `gh run list` shows unfamiliar runs.
4. Run `npm run quality` yourself as the orchestrator check. Its output is
   informational; decide review eligibility using `.agents/review.md`,
   "When a correctness review is warranted".
5. For a C or Lua source port, verify the worker's `.cache/span-evidence.json`
   against the source, production callers, and execution artifacts. Record
   it with `goal-log.mjs record-evidence` as `.agents/validation.md` specifies.
   Close the span with `goal-log.mjs close-span` and append its
   `SCORE.tsv` row in the commit that records closure in `GOALS.json`. The
   row's SHA and figures come from step 3. Refresh the fixed-workload mismatch
   queue and report first-mismatch movement and newly matching recordings
   alongside the fixed development score. Continue at step 2.
6. Before closing a source port, verify its `entryPointReview` and every
   entry point's matching recording. A blocked recipe leaves that entry
   point unfinished. Run checkpoint if its summary does not describe HEAD.
   Then evaluate synthetic local challenge set `v1`, retain its saved artifact, and
   append the goal's fixed-development score row at the measured commit before
   `goal-log.mjs close-goal`. Commit the closure and continue at step 1.

After each span worker hands off a passing checkpoint, start
`node scripts/mismatch-queue.mjs --json` while the orchestrator verifies quality
and evidence, scores, closes the span or goal, commits, and pushes. As soon as
the queue returns, compare investigation-cache counts and replenish background
investigations. Finish closing the current work and recheck selection before
opening the next goal. Skip new investigations when the current goal completes
the user's active objective. Use actual checkpoint-handoff, queue,
investigator, closure, and push timestamps when reporting overlap, including any
remaining wait or rework.

A correctness review, when one is warranted, is a loop step between spans.
Commits that land while a review reads its fixed range belong to the next
review.

`AGENTS.md`, "When to stop and ask the user", lists the cases that stop
this loop. Nothing else stops it. End each turn with a subagent or a
review running, or with the next step started.

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

Spawn a fresh subagent by agent type (such as `span-worker`) only at
the step that calls for one.

When the loop runs under `/loop`, completion notifications advance work in
flight. When `ScheduleWakeup` is available, set it to ten minutes as a
recovery watchdog and use a short interval when idle. End the loop with
`ScheduleWakeup stop` only for `AGENTS.md`'s stop cases; running low on
context is not a reason to stop.

## Background investigations

At loop entry and after each queue refresh, use the per-session order and
cache rules in `.agents/selection.md`. For every mismatching session without
a valid completed investigation, start or continue a source investigation in a
subagent. Exclude the session owned by the active implementation worker.
Launch investigators concurrently up to the available capacity, reserving a
slot for the span worker and any helper required by its current work. When
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
Every figure comes from your measurement in step 3; do not use figures the
worker reports. A parked goal's delivered count includes only its active
intervals; gains while another goal runs belong to that goal.

Keep updates brief and specific: report changed behavior, remaining
work, and the next check when useful. Do not repeat unchanged status.
When switching between implementation, validation, and review, state the
switch and the reason once. Review reports follow `.agents/review.md`.
