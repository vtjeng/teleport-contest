# Proposed changes

This file collects proposed changes to tooling and process. For unimplemented
game behavior, run `node scripts/goal-log.mjs roadmap`. Agents do not select goals from this file.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Goal resumption records

**What it changes.** Extend a parked goal's record with a reason category
(`priority`, `dependency`, `recording`, `validation`, or `bookkeeping`) and
specific remaining work. Each item would identify the source function or
entry point, its recipe when one exists, the next action, and the condition
for reconsideration. A dependency would refer to a goal or source function;
the runtime worker ledger would supply its current owner. An unassigned
dependency would be shown as unassigned, rather than implying that someone
is working on it.

After an integration is accepted, the orchestrator would reconsider parked
items whose named dependencies changed. At loop startup it would also check
for obsolete reasons and goals whose spans and active entry points are
already verified. These checks would use saved records first. They would
report readiness without reopening goals, changing score attribution, or
repeating completed tests. Selection would still follow the fixed mismatch
queue and the user's run bounds. The dashboard would distinguish accepted
spans awaiting recordings from candidates awaiting implementation or repair.

**Scope.** `goal-log.mjs`, `worker-state.mjs`, dashboard data and presentation,
and the parking/resumption instructions in `.agents/selection.md`. Existing
parked records would need a one-time source-backed classification; unknown
next actions would remain explicit.

**What prompted it.** At `8e39b4e8`, six recent parked goals have closed spans
but incomplete entry recordings. `mhitm_ad_blnd` names `hmonas` as a missing
caller, while several other entries only have an empty recording list. The
`known_hitum` flee fix is a useful model: its `feel_location` dependency has
an assigned task. The older `mon_adjust_speed` reason still referred to the
holdout permission gate retired on 2026-09-12.

**Cost.** Moderate: schema, command, scheduler, dashboard, and fixture changes,
plus manual classification. Acceptance tests should show that a dependency
completion requests one reconsideration, unrelated acceptances do not, and
reconsideration cannot claim completion or credit another goal's gains.

**What it leaves unfixed.** A named dependency still needs implementation, and
a recording still needs a reachable independent recipe. This proposal does
not reserve implementation capacity for coverage work ahead of the user's
screen target.

## Reference-build entry points

**What it changes.** Enumerate entry points against the recorder's actual
compile-time configuration before planning recordings. Record inactive caller
branches separately, with the build condition, source call site, and a
source-pinned test. Extend entry-point evidence with this information so a
conditional branch can be inactive even when the containing function also
has active callers. Every active entry would still require a matching
production recording; missing JavaScript code or a difficult setup would not
qualify as inactive.

**Scope.** `port-evidence.mjs`, `goal-log.mjs` completion checks, and
`.agents/validation.md`. Preserve the existing function-level `inactiveReason`
and make the entry-point check use the same reference-build distinction.
The worker would enumerate this coverage before editing; the orchestrator
would verify it before accepting a delivery.

**What prompted it.** The Chronicle goal at `34bd5e88` requires a final Major
window recording. Its only C caller is `end.c dump_everything()` inside
`#ifdef DUMPLOG`. The recorder uses `linux-minimal` or `macosx-minimal`;
neither enables `DUMPLOG`. Preprocessing the local recorder's `hack.h`
confirms `CHRONICLE` and `DUMPLOG_CORE`, but no `DUMPLOG`. The final branch
already has a source-pinned test in `scripts/insight.test.mjs`. The cleanup
removes this inactive caller from Chronicle's required runtime entries while
retaining the source explanation and its other outstanding coverage.

**Cost.** Small to moderate: evidence validation and completion tests, plus
an explicit check of build flags during source review. Test a function with
both active and inactive callers, rejection of undocumented exemptions, and
continued rejection of an active entry with no recording.

**What it leaves unfixed.** Build evidence does not establish production
wiring or correct output for active callers. Chronicle's remaining producer
coverage and Conduct's ordinary final-disclosure path still require work.

## Delivery preflight

**What it changes.** Split preflight into two checks. On receipt, check the
immutable delivery's task, reserved scope, dependency acceptance, and commit
ancestry or patch identity before integration and broad focused testing.
Keep the existing final preflight after integration to verify the actual
candidate and its evidence. A rejected delivery would carry an explicit
replacement link so the corrected packet is checked instead of requiring
the rejected packet's ancestry; preserve both packets and their results.

**Scope.** `worker-state.mjs` receipt/preflight handling and `.agents/loop.md`
integration order. This should reuse the current identity checks, not create
a second definition of an acceptable delivery.

**What prompted it.** Conduct's first integration attempt passed 1,397
focused tests before preflight rejected its patch identity after excluding
unaccepted Chronicle history. Its retry could proceed once Chronicle was
accepted. The parked `div-check-caitiff-seed4500-20260915` separately records
validated, published code whose corrected packet remains blocked by the
rejected original delivery's ancestry.

**Cost.** Moderate: split checks that currently assume an integrated
candidate, and test rejected, replaced, and dependency-blocked deliveries.
The early check must allow unrelated work to proceed and must not treat
patch identity as proof of source correctness.

**What it leaves unfixed.** Integration can still introduce conflicts or
expose missing behavior. The final candidate needs its existing checks; a
successful early preflight cannot replace them.

## Accepted-result regression checks

**What it changes.** Compare each candidate's fixed-workload results with the
last accepted checkpoint's per-session screen and cursor counts, as well as
the committed baseline. A loss would fail acceptance and identify the
session, previous accepted commit, and candidate commit. Preserve RNG
comparisons as diagnostics under the existing guidance about positional
shifts across segments. Keep any deliberate baseline-lowering procedure
explicit and source-backed.

**Scope.** The orchestrator's acceptance check in `worker-state.mjs`, using
saved checkpoint artifacts. Record the baseline commit when integration
starts and verify that it is still the accepted main before acceptance.
Do not rerun the scorer merely to fetch the previous result.

**What prompted it.** Candidate `49ad63ae` passed checkpoint against an older
ratchet while reducing accepted Development screens from 10,346 to 9,250.
The orchestrator caught the loss manually and parked the flee fix until
`display.c feel_location()` is ported. An unhandled exception discarded the
segment despite a longer matching prefix in focused diagnostics.

**Cost.** Small to moderate: compare the two saved per-session result sets
and test a loss hidden by another session's gain, a stale baseline, and
missing artifacts. Missing evidence should request the normal validation
step rather than report a pass.

**What it leaves unfixed.** This catches a delivered regression but does not
repair the exposed dependency. It also cannot establish correctness beyond
the fixed workload and existing recordings.

## Report a ported function that no production code calls

**What it changes.** A check would list every function exported from `js/` that
no other `js/` module calls, and flag those that also appear as injected
operations. `AGENTS.md`, "Port whole source units and wire their callers", requires deleting an
injection when a ported function replaces it, but no check detects a span that
skipped the deletion.

**Scope.** One script beside `scripts/check-namespace-members.mjs`, which
already parses `js/` imports, plus its test and a checkpoint summary line. The
check prints a count and does not block: a pure-function batch lands ahead of
its caller and becomes a defect only when an injection stands in for the same
behavior.

**What prompted it.** `3d33c40` ported `touch_artifact()`'s monster branch with
tests but deleted none of the five injections that stand in for it. Two later
agents spent most of a span re-implementing what was already ported.

**Cost.** Small; `check-namespace-members.mjs` already parses the import block.

**What it leaves unfixed.** The check cannot distinguish a batch correctly ahead
of its caller from one that is overdue, so the flagged set is a reading list
rather than a verdict. It does not flag an injection that stands in for an
unported function, which is the ordinary state.

## Print the remaining unenforced advisories

**What it changes.** A turn-end warning would print
`git log --oneline origin/main..HEAD` when commits sit unpushed, enforcing the
push rule in `.agents/loop.md`. The current `npm run quality` command reports
quality advisories but does not check whether commits have been pushed. The
former per-goal holdout permission gate was retired when the local corpus was
opened.

**Scope.** A small addition to an existing script and its test file.

**Cost.** Small; prints without blocking, following the sweep-candidate pattern.

**What it leaves unfixed.** Compliance stays voluntary: the check makes skipping
the rule visible, and the reader decides.

## Let `npm run checkpoint` write its own log

**What it changes.** `scripts/checkpoint-checks.mjs` would capture each check's
output into a run log, keep streaming when stdout is a TTY, and print the
per-check summary, each failing test's location, and the log path. The
redirect-and-tail recipe in `.agents/validation.md`, "Routine validation", then
shrinks to the command and the log path, and the `--test-reporter=dot` warning
moves to a code comment beside the reporter choice.

**Scope.** Output capture in `runCheckpointChecks()`, the recipe cut in
`.agents/validation.md`, and a `scripts/checkpoint-checks.test.mjs` assertion
for why per-check detail is appended to the summary line rather than printed
separately.

**What prompted it.** Every reader of `.agents/validation.md` pays a redirect
recipe for output capture the script can perform itself.

**Cost.** Small in code, but it changes the command every agent runs. Capturing
stdout replaces `stdio: 'inherit'`, which streamed live progress. The TTY case
must keep streaming, and the summary must stay at the end of the log so a tail
read stays valid.

**What it leaves unfixed.** The log is large. An agent that opens it whole must
work through most of it to find the summary and the failing test's location.

## Shard the development scorer

**What it changes.** `scripts/score-development.mjs` would split the 44 fixed
workload sessions across several workspace copies, run one
`frozen/ps_test_runner.mjs` per copy concurrently, and merge their
`__RESULTS_JSON__` bundles.

**Scope.** A shard loop in `score-development.mjs` over
`createScoringWorkspace()`, `runScorer()`, and `parseRunnerBundle()` from
`scripts/scoring-workspace.mjs`, plus a test. `frozen/` stays untouched.
`scripts/score-holdout.mjs` calls the same three helpers and could take the
sharded path later.

**What prompted it.** On a 5-core/10-thread host, the pre-opening
33-session measurement of `score-development.mjs` took 19.7 s, of which about
8 s was replay. These figures describe the earlier workload; the current
fixed workload has 44 sessions. `frozen/ps_test_runner.mjs:464` spawns one
worker per session sequentially, so each run imports the `js/` graph one
process at a time.
Every span worker pays this cost on each `npm run checkpoint`.

**Cost.** Small. Sharding adds one workspace copy per shard and a merge step;
4-way sharding is estimated at about 5 s wall (derived from the 19.7 s and 8 s
figures above, not measured).

**What it leaves unfixed.** Each shard still boots Node and imports the full
`js/` graph per session. `NODE_COMPILE_CACHE` was measured at 6% faster on the
test suite but 33% slower under high parallelism (I/O contention across ~10
parallel test processes), so it is not viable on this host.

## Build a per-boundary C state-dump divergence oracle

**What it changes.** A C recorder patch would dump hero and monster state
(position, HP, tameness, flee/frozen/sleeping flags) at each input boundary, and
a matching JS dump (gated by an environment variable, no-op during scoring)
would enable a diff tool to report the first boundary where game state diverges,
whether the RNG stream is still aligned there, and which entity and field
diverged. This is the one diagnostic signal the port lacks: "state diverged
while the RNG stream is still aligned."

**Scope.** A C recorder patch (hero + monster fields only, not full game state),
a JS state dump behind an env gate in `js/jsmain.js`, and a diff script under
`scripts/`. The C patch requires maintaining our own recorder addition alongside
the existing patches in `nethack-c/patches/`.

**What prompted it.** The lockwo competitor has this capability and uses it to
localize divergences to a specific C function and field. The port localizes
divergences from RNG logs and screens only, which cannot distinguish
state drift from RNG drift.

**Cost.** One goal's budget. The C patch is small (hero + monster fields), but
maintaining it across upstream changes and ensuring the JS dump stays in sync
with the C dump is ongoing work.

**What it leaves unfixed.** The oracle covers hero and monster state only, not
items, traps, level geometry, or other game objects. Extending it to full game
state would require substantially more C instrumentation.
