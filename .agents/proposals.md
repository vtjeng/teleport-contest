# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Rank goals by the screens they would unblock, not by the screens behind them

**Approved on 30 July 2026 and scheduled next**, after the object-pile window
slice closes. It stays in this file until it lands.

**What it changes.** A script under `scripts/` would report, per development
session, the whole remaining debt rather than the first blocker: the set of
commands the session issues that the port does not support, alongside the
behavioral blocker `scripts/scan-stops.mjs` already names. Goals would then be
ranked by the screens in sessions whose *entire* debt a candidate clears.
`.agents/selection.md`, `AGENTS.md` and `.agents/workflow.md` would follow,
demoting the milestone from a fixed order to a label and making expected
screens the selection rule. **The demotion is approved in principle; the exact
wording is not yet.** All three are instruction documents. The wording lands
with the script rather than before it, so the rule never names an instrument
that does not exist.

**What prompted it.** The census reports the boundary each session reaches
first and is silent about the rest, so nothing measures how far a session is
from completing. Ranking by screens standing behind a boundary has
overestimated by one to two orders of magnitude: the trap goal was selected on
a row of that shape and delivered 8 development screens. Measured at `34949fa`,
23 of 33 sessions stop on a hero command and 4,618 of the 7,298 unmatched
screens sit behind one, while every one of the 467 screens the port emits
matches C. The deficit is entirely reach, and reach is a chain.

**Scope.** The keystroke-to-command resolution exists already:
`scripts/scan-stops.mjs` reports a refused keystroke's command under the
session's own bindings. What is new is applying it to a session's whole input
stream and differencing against the supported set. Before the output may choose
anything, it must retrodict the gains already observed — +21, +17, +1, 0 and +8
development screens — as `ROADMAP.md` requires of its own proposed second
column.

**Cost.** About half a day, plus the retrodiction check.

**What it leaves unfixed.** The keystroke stream does not distinguish a command
byte from a prompt answer, so the inventory carries an ambiguity margin and
remains an estimator; only re-running the scan after the work measures the real
gain. The more direct instrument — bypassing a refusal and re-scanning to read
the next one — was considered and rejected: it works for behavioral boundaries
but not for command boundaries, where skipping the command leaves the following
prompt answers misinterpreted and the reported chain is fiction, and command
boundaries are where the screens are.

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
