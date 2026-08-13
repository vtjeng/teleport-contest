# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Report a ported function that no production code calls

**What it changes.** A check would list every function exported from `js/` that
no other `js/` module calls, and flag the subset whose name also appears as an
injected operation. `AGENTS.md`, "Port pure functions in bulk", already requires
that "when a ported function replaces an injected operation that stood in for
it, delete the injection in the same batch"; nothing detects a batch that
skipped it.

**Scope.** One script beside `scripts/check-namespace-members.mjs`, which
already parses `js/` imports for a related purpose, plus its test and a line in
the checkpoint summary. Informational, in the pattern of the sweep-candidate
line; it prints and does not block, because a pure-function batch is allowed to
land ahead of its caller and only becomes a defect once an injection stands in
for the same behavior.

**What prompted it.** `3d33c40` on 24 July 2026 ported `artifact.c
touch_artifact()`'s monster branch into `js/artifacts.js` with tests, and
deleted none of the five injections that stand in for it
(`js/monmove.js postmov()`, four in `js/unported_monster_actions.js`). It went
unnoticed for thirteen days. On 6 August the `monsters` sweep spent most of one
slice rediscovering it: two agents in succession reasoned about a capability
the port already had, and the closing entry
`touch-artifact-ported-but-unwired` exists only to record work that the
original batch was required to finish.

**Cost.** Small. Resolving which module a symbol comes from needs the import
block parsed rather than grepped, which `check-namespace-members.mjs` already
does.

**What it leaves unfixed.** It cannot tell a batch that is correctly ahead of
its caller from one that is overdue, so the flagged subset is a reading list
rather than a verdict. It also says nothing about an injection that stands in
for a function nobody has ported yet, which is the ordinary and correct state.

## Let a review pass scope an audit-fix tail on its own

**What it changes.** `scripts/audit-worktree.mjs prepare` would accept a range
whose head is behind the active implementation checklist's `Commit checked`,
when the range holds no slice of its own.

**Scope.** One option, or a relaxation of the existing equality test, plus the
reason recorded in the manifest so a later reader knows the checklist was
deliberately ahead of the range.

**What prompted it.** Recording the `b7cc9a3..b51b1d2` correctness pass failed:
`npm run quality` refused to advance the `world-effects` and `monsters`
frontiers, because `bf96cda..b7cc9a3` is not empty. It holds `8de4b76`, the
audit-fix commit for the *previous* pass, whose twenty-five production lines
across `js/mon.js`, `js/monmove.js` and `js/trap_effects.js` no pass had read.
The refusal was correct and caught a real gap. But the natural repair -- a light
delta pass over `bf96cda..b7cc9a3` alone -- could not be prepared, because
`prepare` requires the checklist to cover the range head and the checklist
covered `b51b1d2`. `--no-checklist-reason` is rejected whenever a checklist
exists, so there is no way to say "this range predates the checklist".

The range was widened to `bf96cda..21cea25` instead, which works and is
arguably better -- it audits the applied fixes too, and a fix is not audited by
the pass that proposed it. But the widening was forced. It also mixes an
unaudited tail with a range whose findings must not be re-reported,
which the prompt then has to spend three paragraphs fencing off.

**Cost.** Small: the check already parses both SHAs. The judgement of whether a
range holds a slice is the author's, and the option records that judgement.

**What it leaves unfixed.** Nothing forces an audit-fix tail to be reviewed
before the next slice's pass, so the debt can still accumulate silently until
`record-review` refuses. A check that compares each area's frontier against the
first production commit after it would surface that earlier, and is a separate
proposal.

## Print the remaining unenforced advisories

**What it changes.** Four checks that turn prose rules into printed numbers
(`node scripts/goal-log.mjs calibration`, a fifth, landed on 2 August 2026):

- `npm run quality` warns when dirty-tree changed lines exceed 500 while no
  `.agents/implementation-checklist.json` exists, the checklist-creation
  trigger in `.agents/implementation-checklist-template.md`.
- `npm run checkpoint` runs `npm run quality -- slice-mutants` over new
  commits as an informational line, so a missing `Mutants:` trailer
  surfaces without anyone invoking the check by hand.
- A turn-end warning prints `git log --oneline origin/main..HEAD` when
  commits sit unpushed, the push rule in `.agents/workflow.md`,
  "Pushing and CI".
- `scripts/score-holdout.mjs` takes a required `--goal <id>` and refuses a
  second evaluation for the same goal without a recorded override, the
  one-evaluation-per-goal rule in `AGENTS.md`. This one needs a decision
  on where the per-goal record lives before implementation.

**Scope.** Each item is a small addition to an existing script and its test
file; the first adds one subcommand.

**What prompted it.** A survey of the instruction documents for rules that
present as limits or cadences while nothing detects a violation. Two
siblings landed the same day it ran: the review-gate refusal in
`score-holdout.mjs` and the review-gate line in the checkpoint summary.

**Cost.** Small per item. None blocks; each prints, in the pattern of the
sweep-candidate line.

**What it leaves unfixed.** Compliance stays voluntary: these make skipping
a rule visible, and the reader still decides. Rules the same survey judged
unenforceable by construction, such as report word caps, are outside this
entry; rewording fixes them.

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
assertion that explains why detail rides the summary line, which moves with
the recipe.

**What prompted it.** The reading audit of the agent briefs on 2 August
2026: every reader of `.agents/validation.md` pays about 20 lines of
redirect recipe, byte counts included, for a mechanic the script can
perform itself.

**Cost.** Small in code but it changes the one command every agent runs.
Capturing a child's stdout replaces `stdio: 'inherit'`, which streamed live
progress; the TTY case has to keep streaming, and the summary must stay at
the end of the log so a tail read stays valid while agents migrate.

**What it leaves unfixed.** The checkpoint's output volume: the log keeps
its 14,491 lines on disk, and an agent that opens it whole still drowns.

## Give the session scan a notion of partial command support

**What it changes.** `scripts/scan-sessions.mjs` would model a command the port
dispatches but refuses partway through, so such a stop earns a row in the
behavior table and can be aimed at with `--ahead=`.

**Scope.** The model that resolves recorded bytes to command names and tests
them against the port's supported-command set, plus the reconciliation section
that reports the disagreement, plus `.agents/selection.md:132-137`.

**What prompted it.** Slice 1 of `experience-level-gain`, at `984da15`, produced
the first partially supported command. It added `levelchange` to the supported
set while `adjabil()`'s gain branch stays refused, so the model names each
session's next unmet *command* while the port stops mid-command. Two
consequences, each measured:

- The behavior table carries no row for the `adjabil()` boundary, so its
  `unlocks` reads 0 and the boundary never reaches the ranking. Only the
  observed boundary census names it.
- `--ahead` cannot be aimed at it. The boundary string returns "No session stops
  first on ...", and the modeled name measures the wrong stretch:
  `--ahead=takeoff` prints `seed0361` steps 40..43, where the stretch that
  slice opens is 22..40. The 66-step ceiling for slice 2 had to be computed by
  hand from the
  reconciliation section's paired indices.

`.agents/selection.md:133-137` calls a stop with no modeled behavior at the
refused step "the serious case", says the model believes the port supports what
the port just refused, and asserts "That count is 0 today." Running
`node scripts/scan-sessions.mjs` at `984da15` prints five `UNRECONCILED` rows,
one per session in this goal, so the count is 5. The reason is benign and the
port is correct -- each stop is the welcome screen for the level whose innate
entry `adjabil()` refuses -- but the document's sentence and the scan's model
both need the third state.

**Cost.** Moderate, and it touches the instrument selection depends on. The
document's repair is a sentence; the model's is not.

**What it leaves unfixed.** The ranking still cannot put a figure on a boundary
that sits inside a supported command until the model can name it, so a goal like
this one is nominated by the observed census alone.

## Serialise mutation runs across parallel workers

**What it changes.** `.claude/agents/slice-worker.md` would state that
`npm run mutate` holds one lock for the whole host, that exit status 2 means
another run owns it, and that a refused worker finishes the rest of its slice
before escalating again. The refusal in `scripts/mutate-sites.mjs` would report
how long the incumbent has held the lock, beside the pid it already reports.
The lock stays as it is, because both resources it protects belong to the host.

`acquireMutationLock()` takes `/run/user/<uid>/teleport-mutate.lock` (lines
185-189) and writes an `owner.json` holding the pid, the process start time and
the run's systemd unit names. `runInMutationCgroup()` takes it at line 684,
ahead of every unit it creates, so every invocation pays it, including one
stopped early by `--enumerate-only`. The first resource is the host's memory
and task budget. `startMutationSlice()` caps each run's aggregate slice at
`MemoryMax=8G`, `MemorySwapMax=0` and `TasksMax=512` (lines 520-530), and each
test wave inside that slice at 1 GiB and 64 tasks (lines 1543-1545). Every unit
name carries the owner's pid, so two runs' units cannot collide; their budgets
would. The second resource is recovery: an acquirer that finds a dead owner
reads the slice name from `owner.json`, stops that slice, resets its failed wave
scopes and reverts its runtime drop-in (lines 455-461, and
`stopMutationSlice()` at 588-606). Refusing a contender before it creates a unit
is what leaves one recoverable unit set on the host at a time.

A second concurrent run would also return little. The header's 6 August
measurement (lines 111-126) puts three mutation lanes at a 40.71 s median
against two lanes at 40.68 s on a 5-core host, so the machine saturates near two
lanes and two runs at once would divide the same throughput between them.

**Scope.** Two sentences under "Mutation-test the lines you changed" in
`.claude/agents/slice-worker.md`, one `statSync()` call and one clause in the
two refusal messages at lines 424-425 and 452-453, and the assertion in
`scripts/mutate-sites.integration.mjs` that already matches
`/another mutation run owns/`. The acquisition, reclaim and teardown paths are
untouched.

**What prompted it.** `d5e382b` records the incumbent side of a collision on 12
August 2026: a whole-suite escalation over 125 survivors "was started and
abandoned at about an hour, because it runs the entire 3,477-test suite once
per mutant and was holding the shared lock against another worktree." The
waiting side left no trace in the repository. By the session's own account,
four slice workers ran in separate worktrees while one of them re-attempted the
same mutation command in a shell retry loop for about 90 minutes, with no
source edit in that period.

The refusal behaves well. Holding a lock at a private path through
`TELEPORT_MUTATION_LOCK` and running `node scripts/mutate-sites.mjs --file
js/regen.js --enumerate-only` against it exits 2, prints `mutate-sites: another
mutation run owns <path> (pid <pid>)` on stderr and writes nothing to stdout,
so a caller cannot mistake contention for a clean sweep. It reports no age, so
a contender cannot judge whether the wait is two minutes or an hour, and it
refuses `--enumerate-only`, which runs no test.

The two verdicts cost very different amounts, which is what makes a collision
expensive. A first wave runs only the test files that import the mutated module
directly, while a `--whole-suite` escalation runs the entire suite once per
surviving mutant. The script's 30 July figures put the first wave at 1.36 s
and 0.14 s per mutant on two ranges, against 12.7 s and 13.0 s per mutant
through the suite. Runs during the 12 August session measured 2.34 s per mutant
on a scoped first wave and 4.78 s per mutant amortised over a 367-mutant range
run, against a 51.7 s baseline for the suite; those three figures are recorded
nowhere in the repository.

**Cost.** Small, and mostly prose. The judgement the brief asks of a worker
cannot be enforced, so a worker that spins anyway is refused as cheaply as
before.

**What it leaves unfixed.** Nothing here reduces the price of a whole-suite
escalation. Deliberate serialisation removes the idle waiting and leaves the
hour of test time, since one full suite runs for each surviving mutant either
way. The lever that would remove the escalation sits upstream of the lock: a
module that a test file imports directly has its mutants judged in the cheap
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
<text>` landed at `ea2494d` and already moves an entry once someone knows it is
mislabelled, so only the detection is missing.

**What prompted it.** The area label decides scheduling. `deferralCounts()`
totals open entries per area and `npm run quality` prints the largest as a
sweep candidate, so a wrong label inflates one area and deflates another. A
mislabel once scheduled a sweep measured at 0 recorded steps ahead of a
boundary goal measured at 21. Correcting a single blocker on 12 August 2026
moved `commands` from 10 counted entries to 9 and dropped it out of candidacy,
which shows how little it takes to change what the loop does next.

This check and the citation check find different faults. The citation check
finds a wrong citation, which misleads a reader. The area check finds a correct
citation under a wrong label, which mis-schedules work.

**Cost.** Small to compute, and the whole difficulty sits in the suppression
rule. Measured at `4930664` over 92 open entries, the naive comparison flagged
15 of the 59 that cite a path, and most of the 15 were sound: an entry filed
under one area often cites a helper that lives in another, as
`pick-lock-lookalike-pile-top-has-no-fresh-case` does when it is filed under
`commands` and cites `js/display.js`. "Flag only when no cited file maps to the
entry's area" is the candidate rule. The ledger has since grown to 108 open
entries, so that flag rate needs measuring again before the rule is chosen.

**What it leaves unfixed.** A check that reads `detail` cannot see an entry
that cites no path at all. Of the 92 open entries measured at `4930664`, 33
cited none, and those keep whatever label they were filed under.
