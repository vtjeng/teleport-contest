# Proposed changes

This file collects proposed changes to tooling and process; for unimplemented
game behavior, see `ROADMAP.md`. Agents do not select goals from it.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Report a ported function that no production code calls

**What it changes.** A check would list every function exported from `js/` that
no other `js/` module calls, and flag the subset whose name also appears as an
injected operation. `AGENTS.md`, "Port pure functions in bulk", already requires
deleting an injection when a ported function replaces it, but no check detects
a batch that skipped the deletion.

**Scope.** One script beside `scripts/check-namespace-members.mjs`, which
already parses `js/` imports for a related purpose, plus its test and a line in
the checkpoint summary. Like the sweep-candidate line, the check prints a count
and does not block: a pure-function batch is allowed to land ahead of its
caller and only becomes a defect once an injection stands in for the same
behavior.

**What prompted it.** `3d33c40` on 24 July 2026 ported `artifact.c
touch_artifact()`'s monster branch into `js/artifacts.js` with tests, and
deleted none of the five injections that stand in for it
(`js/monmove.js postmov()`, four in `js/unported_monster_actions.js`). It went
unnoticed for thirteen days. On 6 August, two consecutive agents in the
`monsters` sweep used most of one slice on a capability the port already had,
and the closing entry `touch-artifact-ported-but-unwired` exists only to
record work that the original batch was required to finish.

**Cost.** Small. Resolving which module a symbol comes from requires the import
block parsed rather than grepped, which `check-namespace-members.mjs` already
does.

**What it leaves unfixed.** The check cannot distinguish a batch that is
correctly ahead of its caller from one that is overdue, so the flagged subset
is a reading list rather than a verdict. It also does not flag an injection
that stands in for an unported function, which is the ordinary and correct
state.

## Print the remaining unenforced advisories

**What it changes.** Three checks would turn prose rules into printed numbers.
Two others have landed: `node scripts/goal-log.mjs calibration` on 2 August
2026, and the per-goal gate in `scripts/score-holdout.mjs` on 12 August.

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
that present as limits or cadences with no automated detection. Two related
checks landed the same day the survey ran: the review-gate refusal in
`score-holdout.mjs` and the review-gate line in the checkpoint summary.

**Cost.** Small per item. Each prints without blocking, following the
sweep-candidate pattern.

**What it leaves unfixed.** Compliance stays voluntary: these make skipping
a rule visible, and the reader still decides. Rules that the survey judged
unenforceable by construction, such as report word caps, fall outside this
entry and need rewording instead.

## Let `npm run checkpoint` write its own log

**What it changes.** `scripts/checkpoint-checks.mjs` would capture each
check's output into a run log itself, keep streaming to the terminal when
stdout is a TTY, and print the per-check summary, each failing test's
location, and the log path. The redirect-and-tail recipe in
`.agents/validation.md`, "Routine validation", then shrinks to the command
and the printed log path, and the `--test-reporter=dot` warning moves to a
code comment beside the reporter choice.

**Scope.** Output capture in `runCheckpointChecks()`, the recipe cut in
`.agents/validation.md`, and the `scripts/checkpoint-checks.test.mjs`
assertion that explains why per-check detail is appended to the summary line
rather than printed separately, which moves with the recipe.

**What prompted it.** The reading audit of the agent briefs on 2 August
2026: every reader of `.agents/validation.md` pays about 20 lines of
redirect recipe, byte counts included, for a mechanic the script can
perform itself.

**Cost.** Small in code, but it changes the one command every agent runs.
Capturing a child's stdout replaces `stdio: 'inherit'`, which streamed live
progress. The TTY case must keep streaming, and the summary must stay at
the end of the log so a tail read stays valid while agents adopt the new
command.

**What it leaves unfixed.** The log still keeps its 14,491 lines on disk, and
an agent that opens it whole must still work through most of them to find the
summary and the failing test's location.

## Serialise mutation runs across parallel workers

**What it changes.** `.claude/agents/slice-worker.md` would state that
`npm run mutate` holds one lock for the whole host, that exit status 2 means
another run owns it, and that a refused worker finishes the rest of its slice
before retrying. The refusal in `scripts/mutate-sites.mjs` would report
how long the incumbent has held the lock, beside the pid it already reports.

The lock stays host-scoped because both resources it protects (the host's
memory and task budget, and its single-owner recovery) belong to the host. `acquireMutationLock()` takes `/run/user/<uid>/teleport-mutate.lock`
(lines 185-189) and writes an `owner.json` holding the pid, the process start
time, and the run's systemd unit names; `runInMutationCgroup()` takes it at
line 684, ahead of every unit it creates, so every invocation pays it,
including one stopped early by `--enumerate-only`. The first resource is the
host's memory and task budget:
`startMutationSlice()` caps each run's aggregate slice at `MemoryMax=8G`,
`MemorySwapMax=0`, and `TasksMax=512` (lines 520-530), and each test wave
inside that slice at 1 GiB and 64 tasks (lines 1543-1545). Every unit name
carries the owner's pid, so two runs' units cannot collide, but their budgets
would. The second is recovery: an acquirer that finds a dead owner reads the
slice name from `owner.json`, stops that slice, resets its failed wave scopes,
and reverts its runtime drop-in (lines 455-461 and `stopMutationSlice()` at
588-606). Refusing a contender before it creates a unit keeps one recoverable
unit set on the host at a time.

Throughput also plateaus at two lanes: the header comment in
`scripts/mutate-sites.mjs` (lines 111-126) records a 6 August measurement of
three mutation lanes at a 40.71 s median against two lanes at 40.68 s on a
5-core host, so two runs at once would divide the same throughput.

**Scope.** Two sentences under "Mutation-test the lines you changed" in
`.claude/agents/slice-worker.md`, one `statSync()` call and one clause in the
two refusal messages at lines 424-425 and 452-453, and the assertion in
`scripts/mutate-sites.integration.mjs` that already matches
`/another mutation run owns/`. The acquisition, reclaim, and teardown paths are
untouched.

**What prompted it.** `d5e382b` records the incumbent side of a collision on 12
August 2026: a whole-suite escalation over 125 survivors "was started and
abandoned at about an hour, because it runs the entire 3,477-test suite once
per mutant and was holding the shared lock against another worktree." The
waiting side left no trace in the repository. By the session's own account,
four slice workers ran in separate worktrees while one of them re-attempted the
same mutation command in a shell retry loop for about 90 minutes with no
source edit.

The refusal behaves correctly: holding a lock at a private path through
`TELEPORT_MUTATION_LOCK` and running `node scripts/mutate-sites.mjs --file
js/regen.js --enumerate-only` against it exits 2, prints `mutate-sites: another
mutation run owns <path> (pid <pid>)` on stderr and does not write to stdout,
so a caller cannot mistake contention for a clean sweep. It reports no age,
however, so a contender cannot judge whether the wait is two minutes or an
hour, and it refuses `--enumerate-only`, which runs no test.

The collision is expensive because the two kinds of mutation result have very
different costs. A first wave runs only the test files that import the mutated
module directly, while a `--whole-suite` escalation runs the entire suite once
per surviving mutant. The script's 30 July figures put the first wave at
1.36 s and 0.14 s per mutant on two ranges, against 12.7 s and 13.0 s per
mutant through the suite. Runs during the 12 August session measured 2.34 s per
mutant on a scoped first wave and 4.78 s per mutant amortised over a 367-mutant
range run, against a 51.7 s baseline for the suite; those three figures are
recorded nowhere in the repository.

**Cost.** Small, and mostly prose. The judgment the brief asks of a worker
cannot be enforced, so a worker that spins anyway is refused as cheaply as
before.

**What it leaves unfixed.** Deliberate serialisation removes idle waiting but
not the hour of test time, since one full suite runs for each surviving mutant
either way. The change that would eliminate escalation is upstream of the lock:
a module that a test file imports directly has its mutants judged in the cheap
first wave. `d5e382b` measured what its absence costs, with 94 of its 125
first-wave survivors in `js/dothrow.js`, whose direct test file exercises four
pure functions while `scripts/fire-command.test.mjs` covers the command path
through `js/jsmain.js`.
A refused worker also gains no queue position here, and still decides for
itself when to come back.


## Report a deferral whose area owns none of the files it cites

**What it changes.** `npm run quality` would compare each open deferral's
`area` label against the areas that `areas[].paths` assign to the `js/` files
its `detail` cites, and print every entry whose label matches none of them. It
would print beside the citation line that landed at `565f700`, and would not
block.

**Scope.** One comparison over records the citation check already parses, plus
a suppression rule and its test. `refile-deferral --id <id> --area <id> --note
<text>` landed at `ea2494d` and already moves an entry once someone identifies
it as mislabelled, so only the detection is missing.

**What prompted it.** The area label decides scheduling. `deferralCounts()`
totals open entries per area and `npm run quality` prints the largest as a
sweep candidate, so a wrong label increases one area's entry count and
decreases another's. A mislabelled entry once caused `deferralCounts()` to
select the wrong area as sweep candidate. The selected area had 0 recorded
steps, yet it ranked ahead of a boundary goal measured at 21. Correcting a
single entry on 12 August 2026 moved `commands` from 10 counted entries to 9
and dropped it out of candidacy, showing how little it takes to change what the
loop does next.

This check and the citation check find different faults. The citation check
finds a wrong citation, which misleads a reader. The area check finds a correct
citation under a wrong label, which mis-schedules work.

**Cost.** Small to compute; the difficulty is the suppression rule. Measured at
`4930664` over 92 open entries, the naive comparison flagged 15 of the 59 that
cite a path, and most of the 15 were sound: an entry filed under one area often
cites a helper in another, as `pick-lock-lookalike-pile-top-has-no-fresh-case`
does when filed under `commands` and citing `js/display.js`. "Flag only when no
cited file maps to the entry's area" is the candidate rule. The number of open
deferrals has since grown to 108, so that flag rate needs measuring again
before the rule is chosen.

**What it leaves unfixed.** A check that reads `detail` cannot see an entry
that cites no path at all. Of the 92 open entries measured at `4930664`, 33
cited none, and those keep whatever label they were filed under.

## Guard cursors in the score ratchet

**What it changes.** `RATCHET_METRICS` in `scripts/score-baseline.mjs` holds
`screens` and `rngCalls`. Adding `cursors` would make `npm run checkpoint` fail
on a session that lost cursor matches while keeping its screens. `cursors` is
one of the four columns `SCORE.tsv` records and `SCORE.md` reports, so a drop
is a scored regression that no gate currently catches. It moves independently
of `screens`: measured at `16ab32d` over the 33 development sessions, 4
disagree, and `seed0006-wizard-water-demon` disagrees by 8, at 56 screens
against 64 cursors. The comment above `RATCHET_METRICS` explains why `rngCalls`
was added beside `screens` (a session can keep its screens while the state
behind them drifts), and the same argument covers the cursor.

**Scope.** `raiseBaseline()` and `lowerBaseline()` already iterate
`RATCHET_METRICS` and skip a metric a caller omits, so neither needs a change.
The one edit is `main()`'s `lower` verb at `scripts/score-baseline.mjs:164-172`,
which hardcodes `{ screens: Number(screens), rngCalls: Number(rngCalls) }` from
two positional arguments. Adding a third positional changes a documented CLI
signature; the alternative is a `--cursors <n>` flag, which leaves the existing
form working. The baseline then needs one `raise` from a clean tree to capture
the cursor figures, after which the guard is live.

**Cost.** Small. One CLI arm, its usage string, and a test for each of the two
verbs. `lower` has been used once in the file's history, so the signature
question has almost no practical effect.

**What it leaves unfixed.** `animFrames` stays unguarded. It is not a
`SCORE.tsv` column, but three open deferrals use animation-frame mismatches as
their differential evidence, so a regression there is invisible to every gate.
Whether it belongs in the ratchet or in a separate check is undecided.

**What prompted it.** The agent surveying whether the 50 production deferrals
can be worked in parallel found this gap while establishing what the fleet's
safety check would rest on. The same survey found the ratchet 981 screens
behind, raised at `af15a30`.

## Stop the shell deleting a deferral's backticked identifiers

**What it changes.** `defer`, `note-deferral`, and `refile-deferral` would take
`--detail-file <path>` and `--note-file <path>` beside the existing `--detail`
and `--note`, reading the entry text from a file rather than from an argument.
No shell then sees the text. `record-pass` already carries that pair, as
`--audit-metrics <json>` beside `--audit-metrics-file <path>`.

**Scope.** Three verbs in `scripts/quality-status.mjs`, each reading one new
option and one file, plus the usage block at `:2078-2081` and a test per verb.
The argument forms stay, so existing uses do not change.

**What prompted it.** The correction note on `doname-refuses-any-worn-gloves`:
"Two backticked fragments in this entry were eaten by shell expansion when it
was written." A backtick inside a double-quoted argument is command
substitution, so the shell runs the identifier as a command and puts its output
in the entry. Reproduced on 16 August 2026:

```
$ sh -c 'echo "the `Cloak_on` arm and the `Boots_on` arm"' 2>/dev/null
the  arm and the  arm
```

Both identifiers are gone, `echo` exits 0, and the only sign is a stderr line
that a caller reading stdout does not see. Of the 432 texts the ledger holds at
`15c2269` (281 details and 151 notes), 166 carry at least one backtick.

**Cost.** Small. One option each on three verbs that already parse a dozen
between them.

**What it leaves unfixed.** The check cannot determine how many entries are
already damaged. Substitution removes the backticks together with the text
between them, so a corrupted text has an even backtick count exactly as an
intact one does, and no text in the ledger has an unbalanced backtick. The one
confirmed instance is a lower bound rather than a count, and finding the rest means reading every
entry against the source it cites.

## Flag the values a mutation run cannot reach

**What it changes.** `scripts/mutate-sites.mjs` would gain a reporting mode
that lists, for the lines a run covers, the sites it generated no mutant for
and could not: a table literal's elements, a `switch` label set, a whole
argument at a call site, and a value passed through unchanged. The checkpoint
would print the count beside the mutant figures, and `npm run mutate`'s report
would carry the list, so a slice's author sees what the run did not measure. It changes no verdict
and does not block.

**Scope.** One traversal beside the existing site selection, which already
walks the same syntax tree to find operators; its test; and a line in the
checkpoint summary, following the sweep-candidate pattern.

**What prompted it.** In four consecutive closing correctness passes, the
highest-severity defect was in a value that no mutant operator in this
project can alter, and the last pass found two.

- `wizard-create-monster`, pass over `ea331c8..2d84dfa`: `js/read.js` seeds
  `name_to_monplus()` with `gender: NEUTRAL`, a whole argument. Two mutation
  runs reported the line covered while both comments explaining the seed
  described a mechanism `js/mondata.js` does not have, and the one input class
  that makes the seed observable had no test.
- `hero-zaps-a-ray-wand` slice 1, pass over `2d84dfa..4fe4f56`: two production
  defects, neither reachable by mutation. `trap.c erode_obj()`'s per-type
  `check_grease` was a missing table field, and `zap.c adtyp_to_prop()` had
  four extra `switch` cases. The window ran 106 mutants over a baseline of
  3,807 tests (the largest run this project has made) and found neither. Five
  of the same pass's six test findings had the same shape.
- `hero-zaps-a-ray-wand` slice 3, pass over `4fe4f56..ac46567`: a refusal
  placed ahead of the guards `apply.c catch_lit()` answers first, an ordering
  error rather than an operator target; and `js/display.js`'s hit-point clamp,
  which the run classified as equivalent to the original because no test
  distinguished it from unmutated code, and which the orchestrator then found
  had no test covering the mutated behavior at all.

**Cost.** Small to medium. The traversal is mechanical, but deciding what
counts as a value no mutant can reach is a judgment the tool must encode: an
argument the callee ignores is not worth listing, and a table whose every row a
test already reads is not either. Starting narrow (array literals of more than
four elements, `switch` label sets, and arguments that are bare identifiers or
literals) would cover every instance above.

**What it leaves unfixed.** The highest-severity finding of the fourth pass
falls entirely outside its reach. `zap.c:4572`'s dropped `type == 0 &&`
conjunct *is* an operator the run mutates, and every mutant of it died against
a test that asserted the port's reading rather than C's. A mutation run
measures whether the tests notice a change; it cannot notice that the tests
agree with the code against the source. This proposal does not detect that
fault, and the only instrument that has detected it is a reviewer reading the C
source.

## Reuse compiled code and shard the development scorer

**What it changes.** `scripts/run-test-suite.mjs` and `childEnvironment()` in
`scripts/mutate-sites.mjs` would set `NODE_COMPILE_CACHE` on the `node --test`
children they spawn, so each process reads compiled code from Node 22's
cross-process cache instead of compiling the `js/` graph again.
`scripts/score-development.mjs` would split the 33 development sessions across
several workspace copies, run one `frozen/ps_test_runner.mjs` per copy
concurrently, and merge their `__RESULTS_JSON__` bundles. Both cut runner
overhead and leave the tests and the replay themselves unchanged.

**Scope.** One `env` assignment at each of the two spawn sites, and a shard loop
in `score-development.mjs` over `createScoringWorkspace()`, `runScorer()`, and
`parseRunnerBundle()` from `scripts/scoring-workspace.mjs`, plus a test for
each. `frozen/` stays untouched because the scorer owns it.
`scripts/score-holdout.mjs` calls the same three helpers and could take the
sharded path later.

**What prompted it.** A measurement on 24 August 2026, on a clean worktree at
`6d10947` and this project's 5-core/10-thread host, one run per configuration:
`npm test` takes 59.5 s wall and 530 CPU-seconds over 297 test files and 4,868
tests, and `node --test` keeps about 9 of 10 logical CPUs busy, so savings must
come from doing less work rather than from more parallelism. Each test process
spends about 0.33 s booting Node and importing the cyclic `js/` graph (165
modules, 5.3 MB), which is about 98 CPU-seconds across the 297 files, or 18% of
the suite. A warm `NODE_COMPILE_CACHE` ran the same suite in 55.8 s, 6% under
that baseline. `scripts/score-development.mjs` takes 19.7 s, of which about 8 s
is replay: `frozen/ps_test_runner.mjs:464` spawns one worker per session and
waits for it before the next, so 33 processes import the graph one after
another. Every slice worker pays both costs on each `npm run checkpoint`, and
`mutate-sites.mjs` reruns test waves once per mutant, which its header
extrapolates to 26 to 52 minutes for a full review pass.

**Cost.** Small. The env var needs no other change, because Node invalidates its
own entries when a source file changes. Sharding adds one workspace copy per
shard and a merge step; 4-way sharding is estimated at about 5 s wall, derived
from the 19.7 s and 8 s figures above rather than measured.

**What it leaves unfixed.** The compile cache removes compilation but not module
import and execution, so part of the 0.33 s per process survives it. A mutation
wave still compiles the mutated module fresh, and the 6% figure was measured on
the full suite rather than on a wave. Neither change shortens a `--whole-suite`
escalation, whose cost is the tests running rather than the runner starting.
