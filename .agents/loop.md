# Continuous operation

This file defines the orchestrator's loop: goal selection, span iteration,
measurement, and the reviews it may call for.

`.agents/glossary.md` defines the terms this file uses.
`.agents/review.md` states when a correctness review is warranted and how to
run one.

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
   b. Run `node scripts/mismatch-queue.mjs`. When every development session
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
   A declaration without evidence stays in scope. If selection now favors
   another blocker, park the open goal with `park-goal --goal <id> --reason
   "<source-based reason>"` and return to step 1. When every source unit has
   evidence, the goal has no span left: go to step 6. Otherwise
   commit `GOALS.json` with a message that starts `Queue <span name> span`.
   For a divergence fix, name the span yourself with `queue-span` and write
   the context file from `.agents/divergence.md`, step 2.
3. Spawn a span worker (`.claude/agents/span-worker.md`) for that span.
   Include the selected mismatch entry, the commit it describes, relevant
   source ranges, and paths to existing evidence in the handoff.
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
4. Run `npm run quality` yourself; no worker reports it. It prints the
   unreviewed debt for information, and nothing in that output forces a
   review. Decide whether a correctness review is warranted by
   `.agents/review.md`, "When a correctness review is warranted".
5. For a C or Lua source port, verify the worker's `.cache/span-evidence.json`
   against the source, production callers, and execution artifacts. Record
   it with `goal-log.mjs record-evidence` as `.agents/validation.md` specifies.
   Close the span with `goal-log.mjs close-span` and append its
   `SCORE.tsv` row in the commit that records closure in `GOALS.json`. The
   row's SHA and figures come from step 3. Refresh the mismatch queue and
   report first-mismatch movement and newly matching recordings alongside
   the development score. Continue at step 2.
6. Before closing a source port, verify its `entryPointReview` and every
   entry point's matching recording. A blocked recipe leaves that entry
   point unfinished. Run checkpoint if its summary does not describe HEAD.
   Then run the local-holdout evaluation and append the goal's score
   row at the measured commit before `goal-log.mjs close-goal`. Commit the
   closure and continue at step 1.

When a goal's final span worker hands off a passing checkpoint, start
`node scripts/mismatch-queue.mjs` before steps 4 through 6. Run that queue refresh
while the orchestrator verifies quality and evidence, scores, closes the goal,
commits, and pushes. If the next candidate still needs source tracing, start one
read-only investigator as soon as the queue returns; do not wait for `close-span`,
`close-goal`, the closure commit, push, or CI. Give it the tested commit, selected
development mismatch, and existing artifacts; require a short report identifying
the source owner, callers, and dependencies. It must not edit files or run a
competing full suite or scorer. Finish closing the current goal and recheck
selection before opening the next one. Skip this overlap when the current goal
completes the user's active objective. Use actual checkpoint-handoff, queue,
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
