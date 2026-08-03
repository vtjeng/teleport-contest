# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Split the quality gate's two signals, which mean opposite things to a pass

**What it changes.** `qualityGateBlocked()` (`scripts/quality-status.mjs:647`)
returns `reviewDue > 0 || unassignedCount > 0`. That would become two facts a
caller reads separately, because the two conditions imply opposite actions for a
review pass. Review debt means implementation should stop and a pass should run,
so it must not stop one. An unassigned `js/` file means a pass cannot attribute
its findings to an area, so it must stop one. `prepare --readiness` would then
require the second and ignore the first.

**Scope.** Three parts. Return the two states separately and let each caller
choose; teach `prepare --readiness` to read the health half alone; and give
`prepare` the range-coverage check `record-review` already performs through
`validateAuditedRangeCoverage()`, so a pass cannot be prepared over a range
whose base sits after the frontier.

The third part is what makes the first two safe. Today the blunt gate is a proxy
for "you have reviewed everything", and `prepare` checks range coverage nowhere:
`grep -n "frontier\|isAncestor\|coverage" scripts/audit-worktree.mjs` returns
nothing. `record-review` catches an under-covering range, but only after the
whole pass has run. Moving that check into `prepare` catches it in a second
rather than an hour, and replaces the protection the proxy was accidentally
providing.

**What prompted it.** The wish goal's correctness pass on 2 August 2026. The
gate reached `DUE` at 1,912 of 1,000 changed lines, so
`npm run quality -- --check` printed `Review gate: BLOCKED` and
`prepare --readiness` refused. The gate blocks because a pass is due, and
readiness refuses because the gate blocks, so the pass that clears it cannot be
prepared. The two passes earlier that day prepared cleanly only because their
gate stood at `WATCH`, which is why the circularity had not appeared before.

The pass was prepared without `--readiness`, and its three readiness commands
supplied by hand: `npm run checkpoint` passed at the range head with the review
gate its only failing check, and the mutation run over
`3b2dde88..a00741d` was run separately.

**Cost.** Small for the first two parts; the third reuses
`validateAuditedRangeCoverage()`, which already exists and is already tested.

**What it leaves unfixed.** Nothing re-runs the mutation half when an
implementer's own run was partial. This pass's was interrupted once by a
background job exiting 144, which is why the orchestrator re-ran it rather than
carrying the implementer's figures.

## Let the ledger amend an open deferral

**What it changes.** `npm run quality` would gain a mode that rewrites an open
deferral's `detail`, leaving its id, area, category and `from` commit alone.

**Scope.** One mode beside `defer`, a status guard so a closed entry stays
closed, and its test.

**What prompted it.** The `commands` sweep on 2 August 2026. Reading the ten
entries produced findings none of them recorded: that `earth_sense()`'s branch
is dormant because every burial site on a reachable level is a GRAVE or STONE
square, and that the `m` prefix entry rests on a reproduction nobody repeated.
`deferEntry()` refuses an id that already exists
(`scripts/quality-status.mjs:1316`), so neither finding could go back into the
entry that prompted it. `.agents/selection.md` now routes them to the closing
report, so the sweep carries the finding and the entry keeps its original text.

**Cost.** Small. The judgement of when a detail is stale stays the caller's.

**What it leaves unfixed.** The `from` commit still dates the entry to its
first writing, so an amended entry reads as older than its newest finding.

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

**What it changes.** Five checks that turn prose rules into printed numbers
(`node scripts/goal-log.mjs calibration`, a sixth, landed on 2 August 2026):

- `scripts/phase-log.mjs --summary --goal <id>` prints elapsed wall time
  since the last slice close that improved the development score, so the
  six-hour goal budget in `.agents/loop.md` becomes a printed figure.
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

**What it leaves unfixed.** The ranking still cannot price a boundary that sits
inside a supported command until the model can name it, so a goal like this one
is nominated by the observed census alone.

## Let `goal-log.mjs` restate a queued goal's forecast

**What it changes.** `node scripts/goal-log.mjs` would gain a mode that
overwrites the `forecast` of a goal still queued -- its steps, basis and
sessions -- leaving an opened or closed goal alone, so the calibration record
cannot be edited after the fact.

**Scope.** One mode beside `queue-goal`, a status guard, and its test.
`queue-goal` already parses all three fields; today it builds them only when it
creates the entry, and finding an existing goal makes the call a no-op.

**What prompted it.** The re-rank on 2 August 2026 before opening
`experience-level-gain`. `object-pile-window` stays queued behind it with a
recorded forecast of 61 steps, which the capped look-ahead measured at **1**:
its one session, `seed0004-feeding-pony`, replays a single step past the pile
window before `A bear trap closes on your foot!--More--` puts it on trap
activation at `js/hack.js:658`. That drops it from third of six candidates to
last, behind pet ranged targeting (33), door or special terrain movement (31),
`#twoweapon` (21) and movement while riding (10). Two further findings belong
with it: trap activation gates it, and a trap goal would collect both this
stretch and `seed0015`'s 16 steps, so the trap boundary deserves a look at the
next selection. Nothing can hold any of that in `GOALS.json`, so it is recorded
here instead.

**Cost.** Small. The judgement of when a forecast is stale stays the caller's.

**What it leaves unfixed.** Nothing prompts a re-rank. A queued goal's forecast
goes stale silently as the port gains behavior, and only an agent reading the
entry before opening it notices -- which is why `object-pile-window` carries the
instruction to re-rank in its own forecast text.
