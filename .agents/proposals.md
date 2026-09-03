# Proposed changes

This file collects proposed changes to tooling and process. For unimplemented
game behavior, see `ROADMAP.md`. Agents do not select goals from this file.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Report a ported function that no production code calls

**What it changes.** A check would list every function exported from `js/` that
no other `js/` module calls, and flag those that also appear as injected
operations. `AGENTS.md`, "Port pure functions in bulk", requires deleting an
injection when a ported function replaces it, but no check detects a batch that
skipped the deletion.

**Scope.** One script beside `scripts/check-namespace-members.mjs`, which
already parses `js/` imports, plus its test and a checkpoint summary line. The
check prints a count and does not block: a pure-function batch lands ahead of
its caller and becomes a defect only when an injection stands in for the same
behavior.

**What prompted it.** `3d33c40` ported `touch_artifact()`'s monster branch with
tests but deleted none of the five injections that stand in for it. Two later
agents spent most of a slice re-implementing what was already ported.

**Cost.** Small; `check-namespace-members.mjs` already parses the import block.

**What it leaves unfixed.** The check cannot distinguish a batch correctly ahead
of its caller from one that is overdue, so the flagged set is a reading list
rather than a verdict. It does not flag an injection that stands in for an
unported function, which is the ordinary state.

## Print the remaining unenforced advisories

**What it changes.** A turn-end warning would print
`git log --oneline origin/main..HEAD` when commits sit unpushed, enforcing the
push rule in `.agents/loop.md`. Two related checks have already landed:
`goal-log.mjs calibration` and the per-goal gate in `score-holdout.mjs`.

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

## Report a deferral whose area owns none of the files it cites

**What it changes.** `npm run quality` would compare each open deferral's `area`
label against the areas that own the `js/` files its `detail` cites, and print
every entry whose label matches none of them. It prints beside the citation
line that landed at `565f700` and does not block.

**Scope.** One comparison over records the citation check already parses, plus a
suppression rule and its test. `refile-deferral --id <id> --area <id> --note
<text>` (landed at `ea2494d`) already moves an entry once identified as
mislabelled, so only the detection is missing.

**What prompted it.** The area label decides scheduling: `deferralCounts()`
totals open entries per area and prints the largest as a sweep candidate, so a
wrong label mis-schedules work. A mislabelled entry once caused selection of an
area with 0 recorded steps over one measured at 21. The citation check (already
landed) finds a wrong citation; this check finds a correct citation under a
wrong label.

**Cost.** Small to compute; the difficulty is the suppression rule. The naive
comparison flags entries that cite a helper in another area (e.g.
`pick-lock-lookalike-pile-top-has-no-fresh-case` under `commands` citing
`js/display.js`). The candidate rule: flag only when no cited file maps to the
entry's area. The flag rate needs measuring at the current deferral count.

**What it leaves unfixed.** The check reads `detail` and cannot see entries that
cite no path. Of 92 open entries at `4930664`, 33 cited none and keep whatever
label they were filed under.

## Stop the shell deleting a deferral's backticked identifiers

**What it changes.** `defer`, `note-deferral`, and `refile-deferral` would take
`--detail-file <path>` and `--note-file <path>` beside the existing `--detail`
and `--note`, reading entry text from a file instead of an argument. No shell
then sees the text. `record-pass` already has that pair: `--audit-metrics
<json>` beside `--audit-metrics-file <path>`.

**Scope.** Three verbs in `scripts/quality-status.mjs`, each reading one new
option and one file, plus the usage block at `:2078-2081` and a test per verb.
The argument forms stay, so existing uses do not change.

**What prompted it.** The correction note on `doname-refuses-any-worn-gloves`:
"Two backticked fragments in this entry were eaten by shell expansion when it
was written." A backtick inside a double-quoted argument triggers command
substitution: the shell runs the identifier as a command and puts its output in
the entry. Reproduced on 16 August 2026:

```
$ sh -c 'echo "the `Cloak_on` arm and the `Boots_on` arm"' 2>/dev/null
the  arm and the  arm
```

Both identifiers are gone, `echo` exits 0, and the only sign is a stderr line
invisible to a caller reading stdout. At the time of filing, 166 of the
ledger's 432 texts carried at least one backtick.

**Cost.** Small. One option each on three verbs that already parse a dozen
between them.

**What it leaves unfixed.** The check cannot determine how many entries are
already damaged. Substitution removes the backticks and the text between them,
so a corrupted text has an even backtick count, the same as an intact one. The
one confirmed instance is a lower bound; finding the rest means reading every
entry against its cited source.

## Shard the development scorer

**What it changes.** `scripts/score-development.mjs` would split the 33
development sessions across several workspace copies, run one
`frozen/ps_test_runner.mjs` per copy concurrently, and merge their
`__RESULTS_JSON__` bundles.

**Scope.** A shard loop in `score-development.mjs` over
`createScoringWorkspace()`, `runScorer()`, and `parseRunnerBundle()` from
`scripts/scoring-workspace.mjs`, plus a test. `frozen/` stays untouched.
`scripts/score-holdout.mjs` calls the same three helpers and could take the
sharded path later.

**What prompted it.** On a 5-core/10-thread host, `score-development.mjs` takes
19.7 s, of which
about 8 s is replay. `frozen/ps_test_runner.mjs:464` spawns one worker per
session sequentially, so 33 processes import the `js/` graph one after another.
Every slice worker pays this cost on each `npm run checkpoint`.

**Cost.** Small. Sharding adds one workspace copy per shard and a merge step;
4-way sharding is estimated at about 5 s wall (derived from the 19.7 s and 8 s
figures above, not measured).

**What it leaves unfixed.** Each shard still boots Node and imports the full
`js/` graph per session. `NODE_COMPILE_CACHE` was measured at 6% faster on the
test suite but 33% slower under high parallelism (I/O contention across ~10
parallel test processes), so it is not viable on this host.

## Run formal review passes concurrently with implementation

**What it changes.** The orchestrator would run correctness, clarity, and
simplification passes in a second worktree while the next slice worker runs in
the main checkout. Review passes read code and propose changes but do not need
the C recorder (`nethack-c/recorder`), which is the blocker that rules out
parallel implementation workers. The review worktree rebases onto main after the
pass completes. Implementation stays serial in the main checkout.

**Scope.** The orchestrator would spawn the review pass as a background agent in
a worktree alongside the next slice worker. Three prerequisites: each worktree
needs its own checkpoint log; the review branch must rebase (the coverage
frontier check fails on non-linear history); and the submodule checkout must run
in each new worktree.

**What prompted it.** The 2026-08-01 meta-analysis measured 21.59 hours of
review-agent wall time serialized behind implementation across 8 loop sessions.
Running them concurrently recovers
most of that time.

**Cost.** Medium. The worktree infrastructure exists (`audit-worktree.mjs`), but
coordinating the review branch's rebase against the moving main requires care to
avoid merge conflicts when the review pass proposes fixes to files the worker is
also editing.

**What it leaves unfixed.** Implementation slices remain serial. The 2026-07-30
probe measured that two concurrent checkpoints contend on I/O (36 s each versus
25 s solo), and the C recorder is not available in worktrees, so parallel
workers remain blocked on those two constraints.

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


