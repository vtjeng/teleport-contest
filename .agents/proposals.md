# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Reconcile the checklist template with the gate that reads it

**What it changes.** `.agents/implementation-checklist-template.md` and
`scripts/audit-worktree.mjs` would agree on the two lines the gate parses.

**What prompted it.** Preparing the search pass on 29 July 2026 failed three
times in a row on the checklist a previous step had written from the template:

- the gate at `scripts/audit-worktree.mjs:206` requires the exact line
  `Current mode: Ready for audit`, while the template prompts for
  `Current readiness: [`Implementation` or `Ready for audit`]`;
- the gate at `scripts/audit-worktree.mjs:211` anchors `Commit checked:` to the
  end of the line, so a SHA followed by any prose does not match, which the
  template's `[full commit SHA]` prompt does not say.

Both forms appear in this file's history, so the two drifted apart rather than
one being new. `4b1b3f7` and later checklists use the template's wording;
`afd468f` and earlier use the gate's.

**Scope.** Either relax the two patterns to accept both forms, or change the
template's prompts to the exact lines the gate parses and say why the shape is
fixed. The second is smaller and keeps one spelling in the repository.

**Cost.** Under an hour, plus a check that no other tool reads either line. The
template is an instruction document, so its wording needs the user's approval
before it changes.

**What it leaves unfixed.** Nothing else in the checklist is machine-read, so a
row whose status or evidence is wrong still passes the gate. The gate rejects
`missing` and `undecided` rows by pattern alone.

## Re-run only the survivors a previous mutation run reported

**What it changes.** `scripts/mutate-sites.mjs` would accept a previous run's
report and mutate only the survivors it named, so escalating a survivor list to
`--whole-suite` costs the survivors alone.

**Scope.** One option that reads the report's `survived` lines, which already
carry the file, line, column, and substitution that identify a mutant, and
filters the target set to those. The enumerator, the applier, and the report
need no change.

**Cost.** Escalating today re-runs every mutant's first wave to reach the
survivors. Over the two review windows `005ea20..06a5629` and
`06a5629..2776192`, that is 69 first-wave mutants re-run to escalate 24
survivors, about 150 seconds of repetition; at slice scale it is nearer a
minute. Building it is perhaps 30 lines and a test.

**What prompted it.** `.claude/agents/slice-worker.md` tells a worker to kill
what it can and then escalate once, so every slice that reaches an escalation
pays the repetition.

**What it leaves unfixed.** The report becomes an input as well as an output,
so its `survived` line format acquires a compatibility obligation that the same
file already documents as a hazard for the test reporter's format. `--file
js/<module>.js --whole-suite` narrows an escalation today whenever the
remaining survivors sit in one module, which covers most slice-scale cases and
none at window scale.
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
