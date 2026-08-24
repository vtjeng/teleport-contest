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

**What prompted it.** `3d33c40` on 24 July 2026 ported `artifact.c
touch_artifact()`'s monster branch into `js/artifacts.js` with tests but
deleted none of the five injections that stand in for it (`js/monmove.js
postmov()`, four in `js/unported_monster_actions.js`). Thirteen days later, two
consecutive agents in the `monsters` sweep spent most of one slice on a
capability the port already had. The closing entry
`touch-artifact-ported-but-unwired` records work the original batch was required
to finish.

**Cost.** Small. Resolving a symbol's module requires parsing the import block,
which `check-namespace-members.mjs` already does.

**What it leaves unfixed.** The check cannot distinguish a batch correctly ahead
of its caller from one that is overdue, so the flagged set is a reading list
rather than a verdict. It does not flag an injection that stands in for an
unported function, which is the ordinary state.

## Print the remaining unenforced advisories

**What it changes.** Two checks would turn prose rules into printed numbers.
Two related checks have landed: `node scripts/goal-log.mjs calibration` on
2 August 2026, and the per-goal gate in `scripts/score-holdout.mjs` on
12 August.

- `npm run quality` warns when dirty-tree changed lines exceed 500 while no
  `.agents/implementation-checklist.json` exists, the checklist-creation
  trigger in `.agents/implementation-checklist-template.md`.
- A turn-end warning prints `git log --oneline origin/main..HEAD` when
  commits sit unpushed, the push rule in `.agents/workflow.md`,
  "Pushing and CI".

**Scope.** Each item is a small addition to an existing script and its test
file; the first adds one subcommand.

**What prompted it.** A survey of the instruction documents identified rules
with no automated detection. Two related checks landed the same day: the
review-gate refusal in `score-holdout.mjs` and the review-gate line in the
checkpoint summary.

**Cost.** Small per item. Each prints without blocking, following the
sweep-candidate pattern.

**What it leaves unfixed.** Compliance stays voluntary: the checks make skipping
a rule visible, and the reader decides. Rules the survey judged unenforceable by
construction, such as report word caps, need rewording instead.

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

**What prompted it.** The reading audit of the agent instructions on 2 August
2026: every reader of `.agents/validation.md` pays about 20 lines of redirect
recipe for output capture the script can perform itself.

**Cost.** Small in code, but it changes the command every agent runs. Capturing
stdout replaces `stdio: 'inherit'`, which streamed live progress. The TTY case
must keep streaming, and the summary must stay at the end of the log so a tail
read stays valid.

**What it leaves unfixed.** The log keeps its 14,491 lines on disk. An agent
that opens it whole must work through most of them to find the summary and the
failing test's location.

## Report a deferral whose area owns none of the files it cites

**What it changes.** `npm run quality` would compare each open deferral's `area`
label against the areas that own the `js/` files its `detail` cites, and print
every entry whose label matches none of them. It prints beside the citation
line that landed at `565f700` and does not block.

**Scope.** One comparison over records the citation check already parses, plus a
suppression rule and its test. `refile-deferral --id <id> --area <id> --note
<text>` (landed at `ea2494d`) already moves an entry once identified as
mislabelled, so only the detection is missing.

**What prompted it.** The area label decides scheduling. `deferralCounts()`
totals open entries per area and `npm run quality` prints the largest as a sweep
candidate, so a wrong label shifts an entry from one area's count to another's.
A mislabelled entry once caused `deferralCounts()` to select the wrong area as
sweep candidate: the selected area had 0 recorded steps yet ranked ahead of a
boundary goal measured at 21. Correcting one entry on 12 August 2026 moved
`commands` from 10 entries to 9 and dropped it out of candidacy.

The two checks find different faults. The citation check finds a wrong citation,
which misleads a reader. The area check finds a correct citation under a wrong
label, which mis-schedules work.

**Cost.** Small to compute; the difficulty is the suppression rule. At
`4930664`, the naive comparison flagged 15 of 59 path-citing entries across 92
open total, and most of the 15 were sound: an entry filed under one area often
cites a helper in another (e.g. `pick-lock-lookalike-pile-top-has-no-fresh-case`
under `commands` citing `js/display.js`). The candidate rule: flag only when no
cited file maps to the entry's area. Open deferrals have since grown to 108, so
the flag rate needs measuring again.

**What it leaves unfixed.** The check reads `detail` and cannot see entries that
cite no path. Of 92 open entries at `4930664`, 33 cited none and keep whatever
label they were filed under.

## Guard cursors in the score ratchet

**What it changes.** `RATCHET_METRICS` in `scripts/score-baseline.mjs` holds
`screens` and `rngCalls`. Adding `cursors` would make `npm run checkpoint` fail
on a session that lost cursor matches while keeping its screens. `cursors` is
one of the four `SCORE.tsv` columns, so a drop is a scored regression that no
gate catches. It moves independently of `screens`: at `16ab32d` over the 33
development sessions, 4 disagree, and `seed0006-wizard-water-demon` disagrees
by 8 (56 screens, 64 cursors). The comment above `RATCHET_METRICS` explains why
`rngCalls` was added beside `screens` (a session can keep its screens while the
state behind them drifts); the same argument covers the cursor.

**Scope.** `raiseBaseline()` and `lowerBaseline()` already iterate
`RATCHET_METRICS` and skip a metric the caller omits, so neither needs a change.
The one edit is `main()`'s `lower` verb at `scripts/score-baseline.mjs:164-172`,
which hardcodes two positional arguments. Adding a third changes the CLI
signature; the alternative is a `--cursors <n>` flag, which leaves the existing
form working. One `raise` from a clean tree then captures the cursor figures.

**Cost.** Small. One CLI arm, its usage string, and a test per verb. `lower` has
been used once, so the signature question has little practical effect.

**What it leaves unfixed.** `animFrames` stays unguarded. It is not a
`SCORE.tsv` column, but three open deferrals cite animation-frame mismatches as
evidence, so a regression is invisible to every gate. Whether it belongs in the
ratchet or a separate check is undecided.

**What prompted it.** A survey of whether the 50 production deferrals can be
worked in parallel found this gap while establishing the fleet's safety check.
The same survey found the ratchet 981 screens behind, raised at `af15a30`.

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
invisible to a caller reading stdout. At `15c2269`, 166 of the ledger's 432
texts (281 details and 151 notes) carry at least one backtick.

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

**What prompted it.** Measured on 24 August 2026, clean worktree at `6d10947`,
5-core/10-thread host: `scripts/score-development.mjs` takes 19.7 s, of which
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
