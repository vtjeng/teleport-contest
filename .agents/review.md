# Review cadence and methodology

`.agents/workflow.md` defines a formal review pass, states that audit means the
same thing, and holds the loop these passes are steps in.

Read this file before scheduling, running, or recording a formal review pass.
Only the orchestrator does this work. "Continuous operation" in
`.agents/workflow.md` assigns the roles.

## Readiness for a formal review pass

While implementation is incomplete, find and fix gaps with source review,
focused tests, the full test suite, and fresh differentials. Launch a formal
review pass only when the orchestrator judges the behavior and evidence
complete. Freeze the committed range and include this readiness note:

- **Boundary and live path:** Name the user-visible starting and ending events
  and confirm the real game executes the path.
- **Source review:** Confirm that every branch and helper reachable before
  the ending event was traced against upstream C or Lua. Confirm that
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
  batching threshold declared in `QUALITY.json`, outside the frozen range.
- **Mutation survivors:** Run
  `npm run mutate -- --range <base>..<head> --full` over the frozen range and
  attach its survivor list, its mutant count, and its survivor count to this
  note. `--full` is what makes a survivor trustworthy, and
  "Mutation-test the reviewed lines" states why, what it costs, and how to pass
  the list to the review. The run reports `the unmutated tests do not pass` and
  exits 2 when the head is red, which means the head is not ready for review.

The active implementation checklist (`.agents/implementation-checklist.md`,
created when a qualifying slice opens) supports this note; it does not replace
tests, differentials, source review, generated checks, quality checks, or
formal review passes. If the note or evidence is incomplete, stay in
Implementation mode.
The orchestrator that receives an incomplete note reports `NOT READY` and
launches no reviewers.

## Review scheduling

`QUALITY.json` is the executable source for quality areas and numeric
thresholds. When a threshold changes, update this policy and
`scripts/quality-status.test.mjs` in the same chunk.

Three events require every outstanding review to be complete before they happen:
an authorized holdout evaluation, closure of the current milestone named in
`ROADMAP.md`, and publishing a result outside this repository. This file calls
those three events **review deadlines**.

Generated outputs declared in `QUALITY.json` do not count toward changed-line
thresholds. Their generators do count, and a commit touching a generator or
output counts toward the commit threshold unless it is a linked audit-fix
commit. Each declaration names the generator and regeneration check; reviews
cover both. An **evidence-only commit** changes only `SCORE.md`, correctness or
simplification records, or their supporting documentation, and no area-owned
path. A **quality-ledger-only commit** is the subtype of evidence-only commit
that changes only correctness or simplification records. Evidence-only
commits do not count toward path-scoped commit totals and do not receive
their own evidence snapshots.

### When a correctness pass is due

- Treat three unreviewed implementation commits or 500 changed production
  lines in an affected area as an advisory checkpoint. Neither trigger
  requires a full correctness pass by itself; `QUALITY.json` configures this
  checkpoint and `npm run quality` measures it.
- Run a full correctness pass no later than ten unreviewed implementation
  commits or 1,000 changed production lines in an affected area. That
  full-pass limit is the gate; the three-commit/500-line checkpoint is
  advisory only.
- These limits count changed lines per quality area. A file boundary does not
  affect the count: splitting a file into several files does not reduce
  review debt, and is not a reason to split one. See "Keep each source file's
  port in one place" in `AGENTS.md`.
- Two kinds of commit are counted but reviewed differently, because an
  identical development score already shows they changed no behavior the
  scored sessions exercise.
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
- A full pass is also due after an unexplained source-review or differential
  mismatch, and before a review deadline.
- Other small cohesive fixes may batch until one of the conditions in this
  section makes a full pass due. Do not repeat the same formal review pass
  until another threshold is met or the design materially changes.

A change crosses quality areas only when it changes state ownership or
persistence, PRNG or evaluation order, lifecycle ownership, an input boundary,
or another shared behavioral interface. Imports, exports, call sites, tests,
and wiring that consume an existing contract do not cross areas by themselves.

Related shared-contract changes within one named behavior slice and roadmap
item may share a review window through the next observable boundary. The window
may contain at most three unreviewed implementation commits and 1,000 changed
production lines summed across affected areas. Apply the per-chunk workflow
throughout and run fresh end-to-end differentials once the real consumer
executes.

This window is a per-slice rule that agents apply by inspection. It is separate
from the per-area advisory checkpoint and gate above, which `QUALITY.json`
configures and `npm run quality` measures. No threshold key encodes this window.

Run a formal review pass over the exact window before:

- adding a fourth implementation commit;
- accepting a change that would exceed 1,000 changed production lines;
- starting another behavior slice or roadmap item; or
- reaching a review deadline.

An unexplained source-review or differential mismatch ends the window and makes
the pass due immediately.

### Which finders and other passes to run

Before recording a correctness pass, state whether the full-pass trigger, each
optional finder trigger, and each separate-pass trigger below applies.
Omitting an untriggered optional finder or separate pass is compliant and
creates no debt. Commit counts, line counts, milestones, and prior
correctness passes do not trigger an optional finder or separate pass by
themselves.

- Whenever a full correctness pass is due, run it as a `full`
  `/audit-diff-correctness` pass. Its behavior, readability-risk, test-quality,
  and variable-flow finders are mandatory. "When a correctness pass is due"
  states when a full pass falls due.
- Enable the performance finder only when the range plausibly adds a material
  resource regression beyond required source behavior: unbounded or amplified
  work, worse complexity, avoidable repeated hot-path traversal, material
  allocation or serialization, startup cost, or conflict with a measured
  budget. Source-required iteration or replacing replay with the required
  traversal does not by itself justify enabling the performance finder.
- Enable the concurrency finder when the range changes shared mutable state,
  asynchronous or reentrant control flow, parallel work, cancellation, retries,
  cleanup, or lifecycle behavior that can overlap. State the risk in the pass
  scope.
- Run `/simplify-codebase` when inspection or a correctness finding identifies
  duplicated behavior or state, competing ownership, scattered configuration,
  unnecessary indirection, dead declarations, or obsolete transitional
  scaffolding. Scope it to the implicated committed range and consumers.
- Run `/audit-diff-clarity` for a concrete reviewer-facing explanation problem:
  a new or changed shared contract, non-obvious source correspondence, complex
  state ownership or control flow, unclear test intent, misleading names or
  comments, or conflicting documentation. Scope it to implicated code, tests,
  and prose.
- Before a review deadline or an external review, inspect for simplification
  and clarity triggers. Run a formal review pass only when inspection
  identifies one,
  and record its outcome with the evidence the "Readiness for a formal review
  pass" note lists
  for that pass's boundary.
- Run `/copyedit-technical-prose` after every third scheduled correctness pass
  when published prose has changed since the previous copyedit, and before
  publishing changed documentation or reports outside this repository.
  Tracker-only SHA and score entries do not trigger it. Do not run it on
  unchanged prose.

### Mutation-test the reviewed lines

`scripts/mutate-sites.mjs` rewrites one relational operator, `&&`, `||`, boolean
literal, or integer bound at a time in the lines under review, runs the tests,
and prints every mutant that no test failed on. The script calls such a mutant a
**survivor**: a reviewed line whose behavior the tests do not distinguish from a
wrong version of that line. Its header comment states the site set, the four
contexts where an integer is skipped, which test files each wave runs, and the
measured cost per mutant.

Run both commands over the frozen range before requesting a full correctness
pass:

```
npm run mutate -- --range <base>..<head> --enumerate-only
npm run mutate -- --range <base>..<head> --full
```

The first prints the lines in scope, the mutable sites, the mutants, and the
first-wave test files for each file in the range, then stops before running any
test. Read its mutant count to know what the second command will cost. The
second runs the mutants and prints the survivors. Both exit 0 whatever they
find, because a survivor is a finding to read. A missing argument, a path
outside `js/`, or a red baseline exits 2.

`--full` is required for a pass. Without it the tool stops at each mutant's
first wave, which is fast and reports survivors that a wider test file kills:
over `ce9c59f~1..ce9c59f` the first wave reported five survivors and the rest of
the suite killed four of them. The report names the verdict it applied, so a
list produced without `--full` is recognizable. Use the default for a quick
local check, and `--full` for anything a pass or another reader relies on.

Cost has two parts. Each mutant first runs the test files that reach its module
without passing through another `js/` module, and a failure there kills it and
stops. Under `--full`, a mutant that passes that first wave then runs the rest
of the suite, which costs about the same for every mutant. The total therefore
depends on how many mutants the first wave kills, and a module whose own tests
are weak pays the suite for nearly every mutant: one measured range cost 75
times as much under `--full` and reached the same verdict. The script's header
comment records the measured figures for both modes.

Hand the survivor list to the correctness pass as a `validation` context item
addressed to the `tests` finder, which is how `/audit-diff-correctness` routes
evidence to one perspective. Quote the relational, logical, and boolean
survivors in full, and give the integer survivors as a count. A surviving `<=`
weakened to `<`, or a `true` flipped to `false`, marks a branch that no test
distinguishes. An integer moved by one is often a constant that no observable
behavior depends on, and a range near the full-pass gate can hold enough of
those to spend the finder's whole finding budget.

One limit bounds what a survivor proves under `--full`: a line holding no
mutable site produces no mutant, so a line the list omits has no evidence
either way. The verdict comes from every test file that imports a `js/` module,
so a survivor is a mutant the whole suite passed. The ten test files that import
no `js/` module are left out, and the report names them; no mutation of a `js/`
line can reach them.

The pass report states how many mutants ran, how many survived, and what the
test-quality finder concluded about the survivors it examined. A survivor the
finder did not reach stays in the report as an unexamined item.

Two forms apply outside a pass. `--file js/<module>.js` puts every line of one
module in scope and needs no commit range, which answers whether that module's
tests pin its behavior at all. `--limit <n>` stops after n mutants in path
order, and the report then states how many of the target set's mutants went
unmeasured.

## Findings and scope changes

During a formal review pass, an **audit fix** is limited to corrections to
changes in the
reviewed range: a condition, order, constant, state update, test, name, or
comment.

Return to **Implementation** when a finding:

- requires a new upstream function family or branch;
- changes a state or lifecycle owner, PRNG or rendering behavior, or an input
  or persistence boundary; or
- requires new end-to-end cases because supported behavior has grown.

Stop audit-fix work, record the requirement in the pass report, and do not
claim the pass covers the new implementation. Do not run a light delta review
or another pass first. Implement through the next observable boundary,
satisfy the readiness requirements again, and run a new full correctness
pass over the expanded range.

After applying in-scope audit fixes, inspect the fix diff and run the focused
and broad validation that `.agents/validation.md` specifies for the affected
behavior. A commit confined to confirmed findings may use
`Audit-fix-for: <full-reviewed-head-sha>`. Never use that trailer for unrelated
changes. The `npm run quality` dashboard excludes a valid linked audit-fix
commit from the commit threshold but still counts its production lines.

Audit-fix commits constitute correctness debt until a correctness pass reviews
them. Include them in the next scheduled correctness range. Before a review
deadline, fixes confined to confirmed findings may instead receive a `light`
delta review covering source fidelity, end-to-end state and PRNG effects, test
adequacy, and collateral changes. A clean review of that kind
clears the correctness debt for the reviewed audit-fix commits. Run a full
pass if fixes expand scope, change a shared contract, cause an unexplained
mismatch, or independently meet a normal full-review trigger.

## Running formal review passes

The following rules apply to correctness, clarity, simplification, and
copyediting passes:

- These instructions authorize the orchestrator to launch a required pass
  without separate confirmation. They authorize neither holdout access nor
  sharing repository material outside that pass.
- Launch each pass by invoking its named skill with the Skill tool, from the
  orchestrator only. The skill runs its own reviewers as parallel subagents. Do
  not override the model or reasoning effort the skill selects unless the user
  asks for it.
- Give reviewers only the exact committed range or document snapshots, affected
  areas, relevant sources or artifacts, compact prior validation, decided
  non-issues, and applicable constraints. Require them to read `AGENTS.md`.
  Explicitly prohibit access to `sessions/holdout/`.
- For a declared generated output, include its generator and regeneration
  check in the reviewers' materials.
- For `/audit-diff-correctness`, use default skill context routing. Add finder
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

### Launching a formal review pass

- Put the scratch root on a local filesystem. `audit-worktree.mjs prepare`
  creates its temporary root under `os.tmpdir()`, which resolves to the Windows
  `/mnt/c` DrvFS mount when `TMPDIR` is unset and `TEMP` and `TMP` are inherited
  from Windows. Export `TMPDIR=/tmp` for `prepare` and for the pass. DrvFS is 15
  to 77 times slower than a local filesystem for the pass's many small file
  reads and writes.
- A pass runs as a background task and returns through a task notification. Do
  not relaunch one that is still running: a second launch restarts the pass at
  zero and produces a duplicate pass over the same head. When a pass returns a
  result that looks wrong, read its transcript before relaunching it. The
  finding work is usually intact and only the final assembly failed, which a
  re-run of that step alone repairs.

## Recording formal review passes

A review frontier is the latest integrated commit covered by a recorded pass.

- A `SCORE.md` evidence snapshot may reference the correctness and
  simplification records described in this section, and the retained pass
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
  frontier, because recording that pass would turn the skipped commits into
  reviewed history. The refusal names the area, the frontier it expected, and
  the base it received. Frontiers diverge per area, and one range cannot start at
  two commits. Either review from the oldest frontier among the areas you claim,
  which re-reads commits already covered and is harmless, or review and record
  each frontier group separately.
- Advance a review frontier only through the exact integrated commit that a
  recorded pass covered. Audit-fix commits remain debt until a later
  correctness pass covers them.
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
  wording when copying it forward. The next pass reads these recorded
  rejections to avoid re-deriving a claim that was already answered. A
  working note deleted with its slice is unavailable by then.
- Write every deferred finding into `ROADMAP.md` under an `## Unresolved:`
  heading before recording the pass, and give each one a `deferrals` entry in
  `auditMetrics` naming that heading and its category. `productionDefects`
  covers the production category alone, so a deferred test, clarity, or
  simplification finding has no other durable record. The recorder refuses a
  pass whose entry count differs from the deferred count, one whose entry names
  a heading `ROADMAP.md` does not have, and one whose production-category
  deferrals disagree with the deferred `productionDefects` entries.
- A full correctness record also names the exact range, enabled optional
  finders, fixes, deferrals, unverified judgments, rejections and their
  counter-evidence, warnings, and validation. Record clarity separately only
  when it ran.
- For non-ledger clarity and copyedit passes, include elapsed wall time and
  finding counts in the complete formal-pass report required under Running
  formal review passes. Retain that report as part of the related review or
  publication evidence.
- Finish each formal review pass with `npm run quality -- --check`. Resolve
  review debt at a batching threshold declared in `QUALITY.json` and assign
  every unassigned `js/` file to a `QUALITY.json` area. Audit-fix commits may
  stand as correctness debt, except before a review deadline.
  Resolve concrete simplification or clarity triggers, but do not invent
  a formal review pass when none exists. Historical `BASELINE` debt remains
  exempt
  until the first recorded pass for the area that holds it.
