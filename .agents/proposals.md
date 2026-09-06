# Proposed changes

This file collects proposed changes to tooling and process. For unimplemented
game behavior, see `ROADMAP.md`. Agents do not select goals from this file.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Report a ported function that no production code calls

**What it changes.** A check would list every function exported from `js/` that
no other `js/` module calls, and flag those that also appear as injected
operations. `AGENTS.md`, "Port whole files in C order", requires deleting an
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

## Land the rest of the file-port tooling

**What it changes.** The 2026-09-05 rules cite or imply five pieces of tooling
and layout that do not exist yet. The rules hold as written until these land,
and the list below is the known distance between the documents and the tree.

1. `js/unported.js`, holding `note_unported()` and the `game.unported` set,
   and a `runSegment()` diagnostics option that returns that set, so a span
   can record a gap instead of throwing an `Unsupported*Error`. Until it
   exists, a span that reaches an unported callee whose result the C discards
   has nowhere to record the gap and must port the callee.
2. An end-of-input over-read check in `npm run checkpoint`. Continuing past a
   gap raises the chance of emitting a prompt C did not, and the scorer's
   playability runner blocks on the extra read instead of throwing.
3. Retirement of the boundary census in `scripts/scan-sessions.mjs`: the
   `--by`, `--ahead`, `--ahead-all`, and `--set-cap` options, the ranking
   and reconciliation sections, and `.cache/session-frontiers.json`.
   `scripts/divergence-queue.mjs` reads only the per-session rows.
4. Mechanical audits in `npm run checkpoint`: constants under `js/` compared
   against the compiled C headers, and duplicate function definitions across
   `js/`. Both replace classes of finding the retired review cadence used to
   catch.
5. The `recordings/` directory and the `recipes/<c-file>/` layout. The 40
   recipes now sit directly under `recipes/`; move each under the C file it
   exercises when that file's port opens. Until a recording is committed, the
   checkpoint's recordings check reports `none`.

**Scope.** Items 1 and 2 touch `js/jsmain.js` and one new module; item 3 is
a deletion inside one script and its test; item 4 is two new checks beside
`scripts/check-duplicate-symbols.mjs`; item 5 is file moves.

**What prompted it.** The user approved the file-port rules on 2026-09-05;
these are the parts of that approval that did not fit in the same change.

**Cost.** Small for items 1 to 3; item 4 needs a compiled-header reader.

**What it leaves unfixed.** The 95 `Unsupported*Error` classes and their
throw sites stay until the spans that port their files remove them.
