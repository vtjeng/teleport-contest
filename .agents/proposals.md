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

**What it changes.** Three checks would turn prose rules into printed numbers.
Two related checks have landed: `node scripts/goal-log.mjs calibration` on
2 August 2026, and the per-goal gate in `scripts/score-holdout.mjs` on
12 August.

- `npm run quality` warns when dirty-tree changed lines exceed 500 while no
  `.agents/implementation-checklist.json` exists, the checklist-creation
  trigger in `.agents/implementation-checklist-template.md`.
- `npm run checkpoint` runs `npm run quality -- slice-mutants` over new
  commits as an informational line, so a missing `Mutants:` trailer
  surfaces without anyone invoking the check by hand.
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

## Serialise mutation runs across parallel workers

**What it changes.** `.claude/agents/slice-worker.md` would state that
`npm run mutate` holds one host-wide lock, that exit status 2 means another run
owns it, and that a refused worker finishes the rest of its slice before
retrying. The refusal in `scripts/mutate-sites.mjs` would report how long the
incumbent has held the lock, beside the pid it already reports.

The lock is host-scoped because both resources it protects belong to the host.
`acquireMutationLock()` takes `/run/user/<uid>/teleport-mutate.lock`
(lines 185-189) and writes an `owner.json` with the pid, start time, and
systemd unit names; `runInMutationCgroup()` takes it at line 684 ahead of every
unit it creates. The first resource is the memory and task budget:
`startMutationSlice()` caps each run at `MemoryMax=8G`, `MemorySwapMax=0`, and
`TasksMax=512` (lines 520-530), and each test wave at 1 GiB and 64 tasks
(lines 1543-1545). Unit names carry the owner's pid, so two runs' units cannot
collide, but their budgets would. The second is recovery: an acquirer that finds
a dead owner reads the slice name from `owner.json`, stops that slice, resets
its failed wave scopes, and reverts its runtime drop-in (lines 455-461 and
`stopMutationSlice()` at 588-606). Refusing a contender before it creates a
unit keeps one recoverable unit set on the host.

Throughput also plateaus at two lanes: the header comment (lines 111-126)
records a 6 August measurement of three lanes at 40.71 s median against two at
40.68 s on a 5-core host, so two concurrent runs would divide the same
throughput.

**Scope.** Two sentences under "Mutation-test the lines you changed" in
`.claude/agents/slice-worker.md`, one `statSync()` call and one clause in the
two refusal messages at lines 424-425 and 452-453, and the assertion in
`scripts/mutate-sites.integration.mjs` that already matches
`/another mutation run owns/`. The acquisition, reclaim, and teardown paths are
untouched.

**What prompted it.** `d5e382b` records the incumbent side of a collision on
12 August 2026: a whole-suite escalation over 125 survivors "was started and
abandoned at about an hour, because it runs the entire 3,477-test suite once per
mutant and was holding the shared lock against another worktree." The waiting
side left no trace. Four slice workers ran in separate worktrees while one
re-attempted the same mutation command in a retry loop for about 90 minutes.

The refusal works correctly: holding a lock via `TELEPORT_MUTATION_LOCK` and
running `node scripts/mutate-sites.mjs --file js/regen.js --enumerate-only`
exits 2, prints `mutate-sites: another mutation run owns <path> (pid <pid>)` on
stderr, and writes nothing to stdout, so a caller cannot mistake contention for
a clean sweep. It reports no age, so a contender cannot judge whether the wait
is two minutes or an hour, and it refuses `--enumerate-only`, which runs no
test.

The collision is expensive because first-wave and whole-suite runs differ by an
order of magnitude. A first wave runs only the test files that import the
mutated module; a `--whole-suite` escalation runs the full suite per surviving
mutant. The 30 July figures: 1.36 s and 0.14 s per mutant on two first-wave
ranges, against 12.7 s and 13.0 s per mutant through the suite. The 12 August
session measured 2.34 s per mutant (scoped first wave), 4.78 s per mutant
(367-mutant range), and 51.7 s (suite baseline); those three figures are
unrecorded in the repository.

**Cost.** Small, mostly prose. The judgment cannot be enforced, so a worker that
spins is refused as cheaply as before.

**What it leaves unfixed.** Serialisation removes idle waiting but not the hour
of test time, since one full suite runs per surviving mutant either way. The
change that would eliminate escalation is upstream of the lock: a module that a
test file imports directly has its mutants judged in the cheap first wave.
`d5e382b` measured the cost of the gap, with 94 of its 125 first-wave survivors
in `js/dothrow.js`, whose direct test file exercises four pure functions while
`scripts/fire-command.test.mjs` covers the command path through `js/jsmain.js`.
A refused worker gains no queue position and decides for itself when to retry.


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

## Flag the values a mutation run cannot reach

**What it changes.** `scripts/mutate-sites.mjs` would report, for the lines a
run covers, the sites it cannot generate a mutant for: table literal elements,
`switch` label sets, whole arguments at call sites, and values passed through
unchanged. The checkpoint prints the count beside the mutant figures, and the
report carries the list so the slice's author sees what the run did not measure.
It changes no verdict and does not block.

**Scope.** One traversal beside the existing site selection (which already walks
the same syntax tree to find operators), its test, and a checkpoint summary
line.

**What prompted it.** In four consecutive correctness passes, the
highest-severity defect was in a value no mutant operator in this project can
alter, and the last pass found two.

- `wizard-create-monster`, pass over `ea331c8..2d84dfa`: `js/read.js` seeds
  `name_to_monplus()` with `gender: NEUTRAL`, a whole argument. Two mutation
  runs reported the line covered, but both comments describing the seed cited a
  mechanism `js/mondata.js` does not have, and the one input class that makes
  the seed observable had no test.
- `hero-zaps-a-ray-wand` slice 1, pass over `2d84dfa..4fe4f56`: two production
  defects, neither reachable by mutation. `trap.c erode_obj()`'s per-type
  `check_grease` was a missing table field, and `zap.c adtyp_to_prop()` had
  four extra `switch` cases. The window ran 106 mutants over 3,807 tests (the
  largest run this project has made) and found neither. Five of the pass's six
  test findings had the same shape.
- `hero-zaps-a-ray-wand` slice 3, pass over `4fe4f56..ac46567`: a refusal
  placed ahead of the guards `apply.c catch_lit()` answers first (an ordering
  error, not an operator target); and `js/display.js`'s hit-point clamp, which
  the run classified as equivalent because no test distinguished it from
  unmutated code — the orchestrator then found no test covered the mutated
  behavior at all.

**Cost.** Small to medium. The traversal is mechanical, but deciding what counts
as an unreachable value is a judgment the tool must encode: an argument the
callee ignores is not worth listing, nor is a table whose every row a test
already reads. Starting narrow (array literals of more than four elements,
`switch` label sets, and arguments that are bare identifiers or literals) would
cover every instance above.

**What it leaves unfixed.** The highest-severity finding of the fourth pass
falls outside this proposal's reach. `zap.c:4572`'s dropped `type == 0 &&`
conjunct *is* an operator the run mutates, and every mutant of it died against
a test that asserted the port's reading rather than C's. A mutation run measures
whether tests notice a change; it cannot detect tests that agree with the code
against the source. The only instrument that has detected this fault is a
reviewer reading the C source.

## Reuse compiled code and shard the development scorer

**What it changes.** `scripts/run-test-suite.mjs` and `childEnvironment()` in
`scripts/mutate-sites.mjs` would set `NODE_COMPILE_CACHE` on the `node --test`
children they spawn, so each process reads compiled code from Node 22's
cross-process cache instead of recompiling the `js/` graph.
`scripts/score-development.mjs` would split the 33 development sessions across
several workspace copies, run one `frozen/ps_test_runner.mjs` per copy
concurrently, and merge their `__RESULTS_JSON__` bundles. Both changes cut
runner overhead; the tests and replay are unchanged.

**Scope.** One `env` assignment at each of the two spawn sites, and a shard loop
in `score-development.mjs` over `createScoringWorkspace()`, `runScorer()`, and
`parseRunnerBundle()` from `scripts/scoring-workspace.mjs`, plus a test each.
`frozen/` stays untouched. `scripts/score-holdout.mjs` calls the same three
helpers and could take the sharded path later.

**What prompted it.** Measured on 24 August 2026, clean worktree at `6d10947`,
5-core/10-thread host, one run per configuration: `npm test` takes 59.5 s wall
and 530 CPU-seconds over 297 test files and 4,868 tests. `node --test` keeps
about 9 of 10 logical CPUs busy, so savings come from doing less work, not more
parallelism. Each test process spends about 0.33 s booting Node and importing
the cyclic `js/` graph (165 modules, 5.3 MB) — about 98 CPU-seconds across 297
files, or 18% of the suite. A warm `NODE_COMPILE_CACHE` ran the same suite in
55.8 s, 6% faster. `scripts/score-development.mjs` takes 19.7 s, of which
about 8 s is replay: `frozen/ps_test_runner.mjs:464` spawns one worker per
session sequentially, so 33 processes import the graph one after another. Every
slice worker pays both costs on each `npm run checkpoint`, and
`mutate-sites.mjs` reruns test waves once per mutant, which its header
extrapolates to 26–52 minutes for a full review pass.

**Cost.** Small. The env var needs no other change because Node invalidates its
own entries when a source file changes. Sharding adds one workspace copy per
shard and a merge step; 4-way sharding is estimated at about 5 s wall (derived
from the 19.7 s and 8 s figures above, not measured).

**What it leaves unfixed.** The compile cache removes compilation but not module
import and execution, so part of the 0.33 s per process survives. A mutation
wave still compiles the mutated module fresh, and the 6% figure was measured on
the full suite, not on a wave. Neither change shortens a `--whole-suite`
escalation, whose cost is running tests, not starting the runner.
