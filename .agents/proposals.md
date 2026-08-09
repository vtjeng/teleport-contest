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

## Break the checklist's readiness circularity

**What it changes.** `scripts/audit-worktree.mjs prepare --readiness` would
accept a checklist whose `commitChecked` names the range head's ancestor when
every commit between them touches no area-owned path.

**Scope.** One relaxation of the `commitChecked === head` test in
`validateChecklist()`, plus the reason recorded in the manifest.

**What prompted it.** Preparing the correctness pass over `5168910..ea1f65a`
was impossible with a checklist present. `validateChecklist()` requires
`commitChecked` to equal the range head, and `--readiness` requires the range
head to equal `HEAD`. A checklist cannot name the commit that contains it, so
the two conditions can only both hold if the checklist file is committed in the
same commit whose SHA it already names -- which no sequence of commits produces.
The previous pass at `e8e6ccb` satisfied `prepare` only because no checklist
existed and `--no-checklist-reason` applied.

The workaround is to retire the checklist before every gate-forced pass, which
the template independently prescribes once the qualifying slice closes, so
nothing was lost this time. But it means a checklist can never ride along with
the pass that reviews its slice, and the reviewer loses the plan and the
explicit refusal list exactly when they are most useful.

**Cost.** Small: the check already resolves both SHAs, and
`changedPathsIn()` already exists for the area-label computation.

**What it leaves unfixed.** A checklist whose evidence genuinely predates the
range head still passes if the intervening commits are tracker-only, so the
relaxation trades a provably-stale check for a narrower one. It also does not
help a range whose head is an implementation commit made after the checklist
was written; that case should still refuse.
