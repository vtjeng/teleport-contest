# Quality and formal review workflow

Read this file when planning a qualifying behavior slice, meaning one
expected to span sessions, cross subsystems, or approach the shared
review-window limit; when committing implementation or checking review debt;
or when running or recording a formal pass.

## Terms

A **coherent implementation chunk** is one reviewable production change with
its focused tests. A chunk may be one of several commits inside a behavior
slice.

A **behavior slice** is a live source-to-observable boundary. It closes only
when its real consumer runs and a fresh end-to-end differential verifies the
boundary.

A **review window** is the bounded group of related implementation chunks
covered by one scheduled correctness review. A review window completes when
that review, its required fixes, and the required post-fix validation are
finished.

An **evidence snapshot** is one `SCORE.md` row for the exact integrated code
state at a full commit SHA. Preserve a snapshot when a behavior slice or review
window completes, the score changes, or a result is published. Formal review
ranges remain in the quality ledger and retained pass reports. Routine chunks
collect the same validation evidence without publishing another row.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`.

An **audit** is an independent structured review of a fixed committed change.
A fresh top-level Codex process runs a named audit skill and reports possible
problems; the primary agent reviews each finding and applies only fixes for
confirmed findings. Correctness and clarity reviews are audits. Simplification
and copyediting are separate formal passes. When either named skill is
required, follow the same process rules in the Running formal passes section.

A long-running goal or roadmap milestone can contain several implementation
and review slices. Keep the goal active while completing small, coherent
source-faithful implementation chunks within the limits below.

## Per-chunk workflow

For every coherent implementation chunk:

1. Connect the production game path that consumes the new behavior (the real
   consumer), then run the checks in `.agents/validation.md`.
2. Assign every new `js/` file to exactly one `QUALITY.json` area as soon as
   the file is created. Count untracked production files toward review limits
   before the dashboard can measure them. A clear dashboard does not override
   unassigned files or a manually evident threshold overrun.
3. Commit the implementation, then run `npm run quality` to display the
   scheduling dashboard.
4. Directly review source behavior, PRNG and evaluation order, parsing, state
   ownership, persistence, input boundaries, and rendering. Small mechanical
   or test-only changes may rely on immediate diff inspection and tests, but
   include them in the next scheduled correctness pass.
5. Collect score and validation evidence for the current behavior slice or
   review window. Publish it as specified in `.agents/validation.md`; do not
   add a routine per-chunk `SCORE.md` row.

A final integration runner, fixture, or test may remain uncommitted while it is
changing. Commit completed production behavior and focused tests earlier; then
commit final integration artifacts with the code they validate.

Close a behavior slice only after its real consumer executes and a fresh
end-to-end differential verifies the PRNG log, complete screens and attributes,
cursors, and persisted state through the next boundary. Unit tests can validate
a prerequisite but cannot close a dormant path.

## Implementation checklist

Create or replace `.agents/implementation-checklist.md` from
`.agents/implementation-checklist-template.md` when a behavior slice is
expected to:

- span sessions;
- cross subsystems; or
- approach the 500-line shared review-window limit.

Create it as soon as a smaller slice grows to meet any condition.

The main agent owns the checklist. Build the checklist's candidate entries from
upstream entry points, dispatch tables, catalogs, reachable helpers, and valid
input or configuration families. Cross-check those entries against JavaScript
stops, fallbacks, no-ops, and replay code. Maintain the list throughout
implementation. Passing samples do not prove completeness. When a fresh case
exposes an omitted path, add it and inspect related branches owned by the same
upstream function or subsystem.

Remain in **Implementation** mode while any checklist entry is `missing` or
`undecided`. Before an audit, the checklist evidence must apply to the exact
committed head. After the slice closes and its evidence is recorded in existing
trackers, remove the checklist or replace it for the next qualifying slice.
Smaller slices may keep equivalent information in the working plan and
readiness note.

## Audit readiness

While implementation is incomplete, use source review, focused tests, the full
test suite, and fresh differentials to find and fix gaps. Launch an audit only
when the main agent believes the behavior and evidence are complete. Freeze the
committed range and include this readiness note:

- **Boundary and live path:** Name the user-visible starting and ending events
  and confirm the real game executes the path.
- **Source review:** Confirm that the main agent traced every branch and helper
  reachable before the ending event against upstream C or Lua. Confirm that
  this source review covered state and PRNG order and identified stubs,
  explicit stops, partial implementations, and missing subsystems.
- **Differential evidence:** List reproducible fresh differentials that vary
  relevant inputs and compare PRNG, complete screens and attributes, cursors,
  and persisted state.
- **Completeness:** Confirm that no known unsupported behavior remains inside
  the boundary. Any reachable excluded branch must stop before changing state,
  consuming randomness, or producing output.
- **Checks:** Confirm that focused tests, the full test suite, relevant
  generated checks, and `npm run quality -- --check` pass for the exact head.
  There must be no unassigned `js/` files or non-exempt review debt at a
  batching threshold outside the frozen range.

The checklist supports this note; it does not replace tests, differentials,
source review, generated checks, quality checks, or audits. If the note or
evidence is incomplete, stay in Implementation mode. An auditor that receives
an incomplete note reports `NOT READY` without launching review agents.

## Review scheduling

`QUALITY.json` is the executable source for quality areas and numeric
thresholds. When a threshold changes, update this policy and the quality-status
tests in the same chunk.

Generated outputs declared in `QUALITY.json` do not count toward changed-line
thresholds. Their generators do count, and a commit touching a generator or
output counts toward the commit threshold unless it is a linked audit-fix
commit. Each declaration names the generator and regeneration check; reviews
cover both. An **evidence-only commit** changes only `SCORE.md`, correctness or
simplification records, or their supporting documentation, and no area-owned
path. A **quality-ledger-only commit** is the correctness or simplification
subtype. Evidence-only commits do not count toward path-scoped commit totals
and do not receive their own evidence snapshots.

### Correctness thresholds

- Treat three unreviewed implementation commits or 500 changed production
  lines in an affected area as an advisory checkpoint; this threshold does not
  require a full correctness pass by itself.
- Run a full correctness pass no later than ten unreviewed implementation
  commits or 1,000 changed production lines under `js/` in an affected area.
- These limits count changed lines per area, not per file. Splitting a file
  into several files does not reduce review debt, and is not a reason to split
  one. See "Keep each source file's port in one place" in `AGENTS.md`.
- Two kinds of commit are counted but reviewed differently, because an
  identical development score already proves they changed no live behavior.
  Review each against its C source and its own tests, and do not let either
  trigger a full pass on its own:
  - a bulk batch of pure functions, as defined in `AGENTS.md`;
  - a behavior-preserving move that relocates or renames code without
    changing it.
  Record which C file a batch covers and that its score was identical. Any
  other change in the same commit is counted and reviewed normally.
- To keep a behavior-preserving move out of the gate, add a
  `Score-identical-with: <full SHA>` trailer naming the ancestor commit whose
  development score the move reproduced exactly. `npm run quality` then
  subtracts that commit's lines from the area's gate total and reports them as
  relocated lines, so the remaining debt is the work that still needs review.
  Add the trailer only after scoring both commits and confirming every session
  matched, call for call and screen for screen. Put nothing else in that
  commit.
- A full pass is also due after an unexplained direct-review or differential
  mismatch, and before a release, pull request, authorized holdout evaluation,
  or closure of the first-command milestone.
- Other small cohesive fixes may batch until a required condition applies.
  Do not repeat the same formal pass until another threshold is met or the
  design materially changes.

A change crosses quality areas only when it changes state ownership or
persistence, PRNG or evaluation order, lifecycle ownership, an input boundary,
or another shared behavioral interface. Imports, exports, call sites, tests,
and wiring that consume an existing contract do not cross areas by themselves.

Related shared-contract changes within one named behavior slice and roadmap
item may share a review window through the next observable boundary. The window
may contain at most three unreviewed implementation commits and 500 changed
production lines across affected areas. Apply the per-chunk workflow throughout
and run fresh end-to-end differentials once the real consumer executes.

Audit the exact window before:

- adding a fourth implementation commit;
- accepting a change that would exceed 500 changed production lines;
- starting another behavior slice or roadmap item; or
- reaching a pull request, release, authorized holdout evaluation, or
  first-command closure.

An unexplained source-review or differential mismatch ends the window and makes
the pass due immediately.

### Evidence-triggered passes

Before recording a correctness pass, state whether the formal-milestone
trigger, each optional finder trigger, and each separate-pass trigger below
applies. Omitting an untriggered optional finder or separate pass is compliant
and creates no debt. Commit counts, line counts, milestones, and prior
correctness passes do not trigger an optional finder or separate pass by
themselves.

- At a formal milestone, run a `full` `$audit-diff-correctness` pass. Its
  behavior, readability-risk, test-quality, and variable-flow finders are
  mandatory.
- Enable the performance finder only when the range plausibly adds a material
  resource regression beyond required source behavior: unbounded or amplified
  work, worse complexity, avoidable repeated hot-path traversal, material
  allocation or serialization, startup cost, or conflict with a measured
  budget. Source-required iteration or replacing replay with the required
  traversal is insufficient by itself.
- Enable the concurrency finder when the range changes shared mutable state,
  asynchronous or reentrant control flow, parallel work, cancellation, retries,
  cleanup, or lifecycle behavior that can overlap. State the risk in the audit
  scope.
- Run `$simplify-codebase` when inspection or a correctness finding identifies
  duplicated behavior or state, competing ownership, scattered configuration,
  unnecessary indirection, dead declarations, or obsolete transitional
  scaffolding. Scope it to the implicated committed range and consumers.
- Run `$audit-diff-clarity` for a concrete reviewer-facing explanation problem:
  a new or changed shared contract, non-obvious source correspondence, complex
  state ownership or control flow, unclear test intent, misleading names or
  comments, or conflicting documentation. Scope it to implicated code, tests,
  and prose.
- Before a pull request, release, or external review, inspect for simplification
  and clarity triggers. Run a formal pass only when inspection identifies one,
  and record its outcome with the boundary evidence.
- Run `$copyedit-technical-prose` after every third scheduled correctness pass
  when published prose has changed since the previous copyedit, and before
  externally publishing changed documentation, reports, or a pull request
  description. Tracker-only SHA and score entries do not trigger it. Do not run
  it on unchanged prose.

## Audit findings and scope changes

During an audit, **Audit fix** is limited to corrections to changes in the
reviewed range: a condition, order, constant, state update, test, name, or
comment.

Return to **Implementation** when a finding:

- requires a new upstream function family or branch;
- changes a state or lifecycle owner, PRNG or rendering behavior, or an input
  or persistence boundary; or
- requires new end-to-end cases because supported behavior has grown.

Stop audit-fix work, record the requirement in the audit report, and do not
claim the audit covers the new implementation. Do not run a light delta review
or another audit first. Implement through the next observable boundary,
satisfy the audit-readiness requirements again, and run a new full correctness
pass over the expanded range.

After applying in-scope audit fixes, inspect the fix diff and run the focused
and broad validation specified in the validation instructions for the affected
behavior. A commit confined to confirmed findings may use
`Audit-fix-for: <full-reviewed-head-sha>`. Never use that trailer for unrelated
changes. The dashboard excludes a valid linked audit-fix commit from the commit
threshold but still counts its production lines.

Audit-fix commits remain correctness debt. Away from a no-tail boundary, include
them in the next scheduled correctness range. Before a pull request, release,
authorized holdout evaluation, or first-command closure, fixes confined to
confirmed findings may instead receive a `light` delta review covering source
fidelity, end-to-end state and PRNG effects, test adequacy, and collateral
changes. A clean review of that kind clears the correctness debt for the
reviewed audit-fix commits. Run a full pass if fixes expand
scope, change a shared contract, cause an unexplained mismatch, or independently
meet a normal full-review trigger.

## Running formal passes

The following rules apply to correctness, clarity, simplification, and
copyediting passes:

- These instructions authorize required fresh top-level Codex processes without
  separate confirmation. They do not authorize holdout access or sharing
  repository material outside those processes.
- Start each pass in a fresh top-level process and use native subagents inside
  that process for the named skill's workflow. Do not use `--ephemeral`.
- Launch with `codex exec --profile audit-high`. Do not set a conflicting model
  or reasoning override unless the user explicitly requests one. Run with
  `--json`; preserve the session identifier and `turn.completed.usage`.
- The profile selects `gpt-5.6-sol` with `high` reasoning for the top-level
  process and subagents. Before accepting the pass, verify the selected model
  and reasoning setting in the retained top-level `turn_context` and one child
  rollout (subagent transcript).
- Give reviewers only the exact committed range or document snapshots, affected
  areas, relevant sources or artifacts, compact prior validation, decided
  non-issues, and applicable constraints. Require them to read `AGENTS.md`.
  Explicitly prohibit access to `sessions/holdout/`.
- For a declared generated output, include its generator and regeneration
  check in the reviewers' materials.
- For `$audit-diff-correctness`, use default skill context routing. Add finder
  `audiences` only for exceptions or unusually large context; use `all` only
  for universal constraints.
- Run the pass in an isolated worktree pinned to the reviewed commit. Reviewers
  may propose changes but must not push.
- Use `node scripts/audit-worktree.mjs prepare ...`, then `check` immediately
  before launch. After preserving the report and proposed changes, run
  `cleanup`; it refuses to discard a changed worktree.
- Freeze the assigned scope. Later commits remain outside the pass and normally
  need review only as a later delta.
- Capture the complete report: counts, findings, rejections, unverified items,
  warnings, validation, proposed changes, session identifier, and token usage.

Preserve source-shaped code, planned dependency seams, generated data, and
temporary scaffolding until a source-faithful replacement owns the behavior and
state. Simplification must preserve PRNG and evaluation order.

## Recording formal passes

- A `SCORE.md` evidence snapshot may reference these records and retained
  reports, but it does not replace them or advance a review frontier.
- Record correctness with
  `npm run quality -- record-review --range <base>..<head> ...`. Record
  simplification with
  `npm run quality -- record-simplification --range <base>..<head> ...`.
  `--range` is the commit range the audit actually read, in the same form
  `scripts/audit-worktree.mjs prepare` takes. The recorder stores it as the
  pass's `auditedRange`. Pass `--head` only to restate the range head; it must
  name the same commit.
- The range base must be at or before the current frontier of every area named
  in `--areas`. The recorder refuses a range that starts after a claimed
  frontier and names the area, the frontier it expected, and the base it
  received, because recording that pass would turn the skipped commits into
  reviewed history. Frontiers diverge per area, and one range cannot start at
  two commits. Either audit from the oldest frontier among the areas you claim,
  which re-reads commits already covered and is harmless, or audit and record
  each frontier group separately.
- A review frontier is the latest integrated commit covered by a recorded pass.
  Advance it only through the exact integrated commit covered by that pass.
  Audit-fix commits remain debt until a later correctness pass covers them.
  Correctness does not create simplification debt; the dashboard may show the
  last simplification frontier for context. Separate clarity and copyedit
  passes are not ledger records.
- For every new correctness or simplification record, include elapsed wall time;
  raw, deduplicated, confirmed, applied, deferred, rejected, and unverified
  counts; confirmed totals by production, tests, clarity, simplification, and
  other categories; and each confirmed production defect with every finder that
  reported it. Preserve unique finder attribution.
- Give every rejected finding a `rejections` entry in `auditMetrics`, with a
  `summary` of the claim and the `counterEvidence` that settled it. The
  recorder refuses a pass whose entry count differs from the rejected count.
  Write any condition for reopening into that text, such as "do not reopen
  without a source-reachable input and a diff-causal line", and keep the
  wording when copying it forward. The ledger is where the next audit looks to
  avoid re-deriving a claim that was already answered; a working note that is
  deleted with its slice is not.
- A full correctness record also names the exact range, enabled optional
  finders, fixes, deferrals, unverified judgments, notable rejections and
  counter-evidence, warnings, and validation. Record clarity separately only
  when it ran.
- For non-ledger clarity and copyedit passes, include elapsed time and finding
  counts in the complete formal-pass report required under Running formal
  passes. Retain that report as part of the related review or publication
  evidence.
- Finish each formal milestone with `npm run quality -- --check`. Resolve
  review debt at a batching threshold and all unassigned `js/` files. A smaller
  set of audit-fix commits may remain as correctness debt except before a pull
  request, release, authorized holdout evaluation, or first-command closure.
  Resolve concrete simplification or clarity triggers, but do not invent
  a formal pass when none exists. Historical `BASELINE` debt remains exempt
  until that area's first recorded pass.

## Progress reports

During implementation, validation, or audit work, keep updates brief, natural,
and specific. Report changed behavior, remaining work, and the next check when
useful. Do not force routine updates into fixed labels or repeat unchanged
status. Explain specialized terms on first use.

State a workflow-mode change once and explain why. Formal readiness notes and
audit reports keep their required structures. Planning, process discussion,
questions, and other meta-conversation use ordinary prose.
