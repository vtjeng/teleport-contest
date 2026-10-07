# Proposed changes

This file collects proposed changes to tooling and process. For unimplemented
game behavior, run `node scripts/goal-log.mjs roadmap`. Agents do not select goals from this file.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Assess asynchronous GitHub validation

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
