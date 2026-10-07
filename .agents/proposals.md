# Proposed changes

This file collects proposed changes to tooling and process. For unimplemented
game behavior, run `node scripts/goal-log.mjs roadmap`. Agents do not select goals from this file.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Assess asynchronous GitHub validation

**Integration-speed worklist.** The user requested completion of the whole
list, with measured improvements sent to the main agent for integration:

- Immediate worker continuation after acceptance: integrated as `37b4aff3`.
- Prune redundant test setup and reassess obsolete workflow support:
  `36993385` and `9f76d280` sent for integration. Historical span records and
  delivery provenance remain necessary; do not delete their guards as Git tests.
- Reuse unrelated tooling tests: experimental `6e9557d7`, not ready for
  integration. Benchmark after pruning; the remaining goal CLI suite may
  still determine the test phase's duration.
- Automate routine acceptance: unfinished prototype, not committed. Keep
  source review, regression decisions, worker dispatch, and publication with
  the orchestrator; exercise deterministic closure against existing commands.
- Reuse successful checks on retries: `c692427d` supports earlier successful
  attempts of the same hosted run and commit. Nine focused tests pass; a real
  hosted retry remains to be exercised before integration.
- Parallel hosted checkpoint and deferred-check alternatives: trial
  `37584894987` at `6d4c0bf7` passed both serial baselines and all eleven
  parallel groups. All fixed-workload counts, recording totals and check
  verdicts agree. Four recording groups replace the initial single long job.
  Native Node sharding replaces the initial custom test partitioner.
- Synthetic CI: `b5c0080e` groups consecutive cases in numeric batch order,
  100 per job, at most four jobs concurrently. Trial `37586240132` covers 675
  cases across 25 admitted batches; complete hosted results remain pending.
  The user's Free account has 20 concurrent jobs; serial benchmark jobs are
  opt-in rather than part of ordinary trials.
- Flaky resource limits: `237ad770` separates regex correctness from explicit
  CPU/RSS measurements, preserving adversarial cases and hang watchdogs.
  `4f9d5ee0` clears and relaxes the nurse event watchdog. Both were sent for
  integration after focused validation. Retain local memory limits, replay
  hang watchdogs and CI job timeouts; they protect execution rather than
  assert performance. The five-second corpse-worker watchdog is retained
  pending evidence that it causes failures.

**Question.** Could independent checkpoint jobs on GitHub Actions replace
the serial local checkpoint, returning exact-commit acceptance evidence?
Alternatively, could selected checks run after publication with failures
repaired later? Compare saved local time with coordination and recovery cost.

**Investigation tasks.** Compare local checkpoint categories with the Score,
Coverage, and Lint workflows; measure hosted queue and execution times; identify
which checks depend on the candidate's game behavior and which exercise only
tooling fixtures. Design a parallel job split, including sharded tests,
generated/static checks, fixed-workload scoring, recordings, and the scan
followed by its over-read check. Compare deferred tooling checks with a remote
acceptance gate. Account for failed-run ownership, dependent work, pending-run
recovery, artifact import, and exact-commit evidence before proposing a gate
change. Keep synthetic batch evaluation in scope as a separate parallelizable
acceptance requirement.

**Initial evidence.** The 12 latest completed Score runs inspected on
2026-10-07 all passed; creation-to-completion time averaged 405 seconds
(range 287–452). This is not a benchmark of the proposed split. In the two
latest runs, jobs started after 3 and 4 seconds and checkout took 34 and
30 seconds. Score already runs the full test suite, but does not replace the
local checkpoint's recordings, all generated/static checks, scan/over-read
checks, or per-session baseline verdict. Coverage runs the suite again for
reporting; keep that outside a proposed acceptance gate.

**Candidate design to test.** Run the same committed candidate on independent
jobs, with one shared check registry used locally and remotely. Keep scan and
over-read together. Shard tests by file without omissions or duplication;
large individual files still limit the longest shard. Aggregate only complete
results for the expected commit and successful workflow attempt, then import
the summary, development standing, scan, and synthetic evaluations needed by
closure. Keep the actual measured commit and runtime provenance; do not
pretend a hosted result used the local execution environment. Compare paired
local and hosted runs before changing acceptance instructions. A candidate
branch can preserve pre-acceptance validation without publishing unaccepted
work to main; the orchestrator remains the only acceptance and score writer.

**Current boundary.** This is an investigation, not permission to skip checks.
The loop already tracks asynchronous CI and stops further publication after
a detected failure. The local checkpoint remains required for acceptance.

## Maintain the existing score baseline

**What it changes.** Advance `score-baseline.json` from saved, accepted
fixed-workload results as part of acceptance. Reuse `raiseBaseline()` and the
existing per-session regression check. Verify the result's commit and complete
44-session coverage before updating; rejected candidates must not raise the
baseline. Keep deliberate lowering explicit and source-backed, including
legitimate positional RNG shifts across segments under `.agents/scoring.md`.

**What prompted it.** Candidate `49ad63ae` passed checkpoint against an older
baseline while reducing Development screens from 10,346 to 9,250. The
orchestrator caught the loss manually and parked the flee fix pending
`display.c feel_location()`. The existing baseline-raising command is not
part of the acceptance path.

**Scope and cost.** Connect acceptance to the existing baseline command and
reconcile its update with checkpoint/publication validation. Test accepted
versus rejected results, stale or incomplete artifacts, and a per-session
loss hidden by another session's gain. This needs a targeted tooling change;
it does not need a second baseline or another scoring run.

**What it leaves unfixed.** The baseline catches regressions in the fixed
workload. It does not repair dependencies or establish broader correctness.

## Corrected-delivery ancestry

**What it changes.** Allow a corrected delivery to replace rejected patches
when the correction contains the complete intended change. Preserve both
submissions and their results, and keep checking required dependencies and
patch identity. Ordinary incremental corrections must still include the
original patches they depend on.

**What prompted it.** `div-check-caitiff-seed4500-20260915` records validated,
published code whose corrected packet remains blocked by the rejected
original delivery's ancestry. `checkCandidate()` currently requires patches
from every submission for the task. Running the existing preflight earlier,
as `.agents/loop.md` now requires, exposes this problem before broad testing
but cannot repair it.

**Scope and cost.** Repair the specific replacement case in
`scripts/worker-delivery.mjs` and its existing task records. Test a complete
replacement, an incremental correction missing required patches, and an
unaccepted dependency before choosing whether any record change is needed.
Keep one preflight command.

**What it leaves unfixed.** Passing preflight does not establish source
correctness or replace validation of the integrated candidate.

## Compact goal mismatch snapshots

**What it changes.** Make `goal-log.mjs scopedMismatches()` retain compact
before/after mismatch facts and provenance without embedding investigation
reports. The current command still copies whole queue entries; instruction
changes alone do not stop that generated duplication. Do not add manual
cleanup after each goal command. Remove existing embedded copies in one
reviewed migration, preserving useful history in Git and the tracked
investigations.

**Scope and cost.** A targeted writer change and migration, with checks that
goal lifecycle, completion evidence, and dashboard data remain unchanged.
At `9ac68b8a`, omitting embedded investigations saves 712,997 bytes (22.2% of
`GOALS.json`); the generated dashboard data and template rendering are
identical. The dashboard continues to read current tracked investigations.

**What it leaves unfixed.** Investigation prose still needs the writing rules
in `.agents/selection.md`. Record size alone does not justify discarding
source evidence or historical outcomes.

## Concise worker-state write responses

**What it changes.** Return the changed event, task, or delivery after a
successful write. Keep `status` for the full state and `next` for coordination.
Until this lands, follow `.agents/loop.md` to capture verbose command output.

**Scope and cost.** A CLI output change with focused response and error tests.
The sampled runtime ledger with 577 events produced about 125 KB of state
after each write, while `next` returned 915 bytes. Check existing callers
before changing the response shape.

**What it leaves unfixed.** Ownership, reservations, validation, and recovery
still require their existing events and immutable delivery evidence.
