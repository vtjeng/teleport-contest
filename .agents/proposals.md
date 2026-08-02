# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Collapse review bookkeeping to a single frontier

**What it changes.** Review debt would be measured from one repository-wide
frontier in place of eleven per-area frontiers: one `bases` value per pass,
one debt counter, one gate. Quality areas would remain as labels on findings
and deferrals, which the sweep rule and goal-close disposition key on, but
would stop partitioning review history.

**What prompted it.** The user asked what the area split buys. The per-area
machinery is the costliest part of scripts/quality-status.mjs: per-pass
`bases` maps validated against per-area frontiers, range-coverage refusals
when a range starts after a claimed frontier, the documented workaround of
reviewing from the oldest frontier, `legacyAreaExpansions`, and the
unassigned-file gate. The 2026-08-01 audit measured how the loop reviews:
passes are serial, and reviewers read the frozen range's whole diff whatever
the areas say, so areas partition bookkeeping and never the reading. The
`Review window` dashboard line already measures the single-frontier view.

**What the split still buys.** Scoped recording: a pass over display code
does not mark monsters history reviewed. Under a single frontier, recording
a pass marks the whole range reviewed even where no reviewer looked at a
subsystem, which is safe only while every pass covers the full diff since
the previous pass; the eight-commit window makes that the normal case. The
per-area BASELINE exemption is the second obstacle: collapsing frontiers to
the oldest would pull exempt pre-enforcement debt into the gate unless the
exemption is generalized first.

**Cost.** Medium: recorder and dashboard surgery in quality-status.mjs, a
QUALITY.json migration touching every recorded pass's `bases`, and a
decision on the BASELINE exemption. Take it as its own reviewed change while
the loop is stopped.

**What it leaves unfixed.** Files still need area labels for finding
attribution and deferral routing, so the taxonomy maintenance remains; only
the frontier bookkeeping goes.

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
