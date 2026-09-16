# Proposed changes

This file collects proposed changes to tooling and process. For unimplemented
game behavior, run `node scripts/goal-log.mjs roadmap`. Agents do not select goals from this file.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

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
