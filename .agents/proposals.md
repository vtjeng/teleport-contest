# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

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
the pass that proposed it. But widening was forced rather than chosen, and it
mixes an unaudited tail with a range whose findings must not be re-reported,
which the prompt then has to spend three paragraphs fencing off.

**Cost.** Small: the check already parses both SHAs. The judgement of whether a
range holds a slice is the author's, so the option is a declaration rather than
an inference.

**What it leaves unfixed.** Nothing forces an audit-fix tail to be reviewed
before the next slice's pass, so the debt can still accumulate silently until
`record-review` refuses. A check that compares each area's frontier against the
first production commit after it would surface that earlier, and is a separate
proposal.

## Print the remaining unenforced advisories

**What it changes.** Six checks that turn prose rules into printed numbers:

- `scripts/phase-log.mjs --summary --goal <id>` prints elapsed wall time
  since the last slice close that improved the development score, so the
  six-hour goal budget in `.agents/loop.md` becomes a printed figure.
- `node scripts/goal-log.mjs calibration` prints delivered-versus-forecast
  ratios for the last three closed goals, the condition
  `.agents/selection.md` states for retiring a ranking statistic.
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
file; the first two add one subcommand each.

**What prompted it.** A survey of the instruction documents for rules that
present as limits or cadences while nothing detects a violation. Two
siblings landed the same day it ran: the review-gate refusal in
`score-holdout.mjs` and the review-gate line in the checkpoint summary.

**Cost.** Small per item. None blocks; each prints, in the pattern of the
sweep-candidate line.

**What it leaves unfixed.** Compliance stays voluntary: these make skipping
a rule visible, and the reader still decides. Rules the same survey judged
unenforceable by construction, such as report word caps, are handled by
rewording rather than tooling and are outside this entry.
