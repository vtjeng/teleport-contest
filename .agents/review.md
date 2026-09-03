# Review cadence and methodology

Read this file before scheduling, running, or recording a formal review pass.
Only the orchestrator does this work. `.agents/loop.md` defines the loop that
includes these passes. `.agents/glossary.md` defines the terms this file uses.

A **formal review pass** reviews a frozen committed range for one of four
concerns: correctness, clarity, simplification, or copyediting. The
orchestrator invokes the skill, reviews each reported finding, and applies
only confirmed fixes. All four kinds follow "Running formal review passes"
below. **Audit** is a synonym; it appears in the skill names and the
`Audit-fix-for:` commit trailer.

An **evidence snapshot** is one `SCORE.tsv` row at a full commit SHA.

`QUALITY.json` records completed correctness and simplification passes and
their ranges. A **review frontier** is the latest commit a recorded
correctness pass covered.

## Readiness for a formal review pass

Launch a formal review pass only when the orchestrator judges the behavior and
evidence complete. Prepare with
`node scripts/audit-worktree.mjs prepare ... --readiness`, which runs
`npm run checkpoint` and `npm run quality -- --check --health` at the
repository head and refuses to prepare while any command fails.

Three manual attestations, recorded in `auditMetrics.readiness`, are also
required:

- **boundary**: name the user-visible starting and ending events and confirm
  the real game executes the path.
- **sourceReview**: confirm that every branch and helper reachable before the
  ending event was traced against upstream C or Lua, covering state and PRNG
  order, and that stubs, stops, partial implementations, and missing
  subsystems were identified.
- **completeness**: confirm that no known unsupported behavior remains inside
  the boundary, and that any reachable excluded branch stops before changing
  state, consuming randomness, or producing output.

A missing attestation or a red prepared command is `NOT READY`: launch no
reviewers.

## Review scheduling

`QUALITY.json` defines quality areas and their thresholds. When a threshold
changes, update this policy and `scripts/quality-status.test.mjs` in the same
chunk.

Generated outputs declared in `QUALITY.json` do not count toward changed-line
thresholds; their generators do count. A commit touching a generator or output
counts toward the commit threshold unless it is a linked audit-fix commit. An
**evidence-only commit** changes only `SCORE.tsv`, correctness or
simplification records, or their supporting documentation, and no area-owned
path. Evidence-only commits do not count toward path-scoped commit totals and
do not receive their own evidence snapshots.

### When a correctness pass is due

- Run a full correctness pass no later than twenty unreviewed implementation
  commits or 2,000 changed production lines since the frontier.
  `npm run quality` reports the running debt; plan each pass to land at a
  slice boundary before the gate forces one mid-slice.
- Changed production lines are measured across every area-owned path from the
  review frontier. Splitting a file does not reduce review debt.
- Two kinds of commit are counted but reviewed differently, because an
  identical development score shows they changed no behavior the scored
  sessions exercise. Review each against its C source and its own tests; do
  not let either trigger a full pass on its own:
  - a bulk batch of pure functions, as defined in `AGENTS.md`;
  - a behavior-preserving move that relocates or renames code without
    changing it.
  Record which C file a batch covers and that its score was identical.
- To keep a behavior-preserving move out of the gate, add a
  `Score-identical-with: <full SHA>` trailer naming a commit whose development
  score matches exactly. `npm run quality` then subtracts that commit's lines
  from the area's gate total. Add the trailer only after scoring both commits
  and confirming every session matched call for call and screen for screen. Do
  not add anything else to that commit.
- A full pass is also due after an unexplained mismatch found by source
  tracing or a differential.
- Other small cohesive fixes may batch until one of the conditions in this
  section makes a full pass due. Do not repeat a formal review pass until
  another threshold is met or the design materially changes.

A change crosses quality areas only when it changes state ownership or
persistence, PRNG or evaluation order, lifecycle ownership, an input boundary,
or another shared behavioral interface.

### Which finders and other passes to run

Before recording a correctness pass, state whether the full-pass trigger, each
optional finder trigger, and each separate-pass trigger below applies.
Omitting an untriggered optional finder or separate pass creates no debt.

- Whenever a full correctness pass is due, run it as a `full`
  `/audit-diff-correctness` pass. Its behavior, readability-risk, test-quality,
  and variable-flow finders are mandatory.
- Enable the performance finder only when the range adds work beyond what the
  C source requires: unbounded or amplified work, worse complexity, avoidable
  repeated hot-path traversal, material allocation or serialization, startup
  cost, or conflict with a measured budget.
- Enable the concurrency finder when the range changes shared mutable state,
  asynchronous or reentrant control flow, parallel work, cancellation, retries,
  cleanup, or lifecycle behavior that can overlap.
- Run `/simplify-codebase` when inspection or a correctness finding identifies
  duplicated behavior or state, competing ownership, scattered configuration,
  unnecessary indirection, dead declarations, or obsolete transitional
  scaffolding. Scope it to the implicated committed range and consumers.
- Run `/audit-diff-clarity` for a concrete readability problem: a new or
  changed shared contract, non-obvious source correspondence, complex state
  ownership or control flow, unclear test intent, misleading names or
  comments, or conflicting documentation. Scope it to implicated code, tests,
  and prose.
- Inspect for simplification and clarity triggers when a goal closes. Run a
  formal review pass only when inspection identifies one, and record its
  outcome as "Readiness for a formal review pass" requires.
- Run `/copyedit-technical-prose` before publishing changed documentation or
  reports outside this repository. Do not run it on unchanged prose.

## Findings and scope changes

An **audit fix** corrects only code within the reviewed range: a condition,
order, constant, state update, test, name, or comment.

Return to implementation when a finding:

- requires a new upstream function family or branch;
- changes a state or lifecycle owner, PRNG or rendering behavior, or an input
  or persistence boundary; or
- requires new end-to-end cases because supported behavior has grown.

Before returning, check whether any development session reaches the finding's
behavior. When none does and already-scoring behavior stays correct, record the
finding with `npm run quality -- defer` instead of returning to implementation.
Otherwise stop audit-fix work, record the requirement in the pass report, and
implement through the next observable boundary. Then satisfy the readiness
requirements again and run a new full correctness pass over the expanded range.

After applying in-scope audit fixes, run the validation that
`.agents/validation.md` specifies for the affected behavior.
A commit confined to confirmed findings may use
`Audit-fix-for: <full-reviewed-head-sha>`. Never use that trailer for unrelated
changes. `npm run quality` excludes a valid linked audit-fix commit from the
commit threshold but still counts its production lines.

After the audit-fix commit lands, re-verify its diff against the pass's
confirmed findings and record the pass with `--range <base>..<audit-fix
commit>`, so the fixes leave no correctness debt behind. A fix applied after
its pass was recorded is correctness debt for the next range. Run a full pass
when fixes expand scope, change a shared contract, cause an unexplained
mismatch, or independently meet a full-review trigger.

## Running formal review passes

- The orchestrator may launch a required pass without separate confirmation.
- Launch each pass by invoking its skill from the orchestrator only. Do not
  override the model or reasoning effort the skill selects unless the user
  asks.
- Give reviewers the committed range or document snapshots, affected areas,
  relevant sources, prior validation, decided non-issues, and applicable
  constraints. Require them to read `AGENTS.md`. Prohibit access to
  `sessions/holdout/`.
- For `/audit-diff-correctness`, use default skill context routing. Add finder
  `audiences` only for exceptions or unusually large context; use `all` only
  for universal constraints.
- Run the pass in an isolated worktree pinned to the reviewed commit. Use
  `node scripts/audit-worktree.mjs prepare ...`, then `check` before launch.
  After preserving the report and proposed changes, run `cleanup`.
- Freeze the assigned scope. Later commits remain outside the pass and need
  review only as a later delta.
- Record the pass's counts, findings, rejections, deferrals, unverified
  items, warnings, and validation in its `QUALITY.json` entry. That entry is
  the pass's durable record; no separate report file is retained.

Preserve code whose structure mirrors the C source, and temporary scaffolding
until a source-faithful replacement owns the behavior. Simplification must
preserve PRNG and evaluation order.

Do not relaunch a pass that is still running — a second launch restarts at
zero and produces a duplicate. When a pass returns a suspect result, read its
transcript before relaunching; the individual reviewer results are usually
intact, and rerunning the combination step alone repairs the result.

## Recording formal review passes

- A `SCORE.tsv` evidence snapshot does not advance a review frontier.
- Record correctness with
  `npm run quality -- record-review --range <base>..<head> ...`. Record
  simplification with
  `npm run quality -- record-simplification --range <base>..<head> ...`.
  `--range` is the commit range the audit read, in the form
  `scripts/audit-worktree.mjs prepare` takes.
- A correctness range's base must be at or before the review frontier, because
  a range that starts after it would mark skipped commits as reviewed. A
  simplification pass records the range it read: its coverage is the union of
  every recorded range, and the commits outside that union are its debt.
  Correctness keeps the single frontier because its gate asserts gapless
  coverage; simplification has no gate.
- Advance a review frontier only through the exact integrated commit that a
  recorded pass covered. An audit-fix commit recorded as its own pass's range
  head carries no debt; one applied after the pass was recorded remains debt
  until a later correctness pass covers it. Correctness does not create
  simplification debt.
- For every new correctness or simplification record, include elapsed wall
  time; raw, deduplicated, confirmed, applied, deferred, rejected, and
  unverified counts; confirmed totals by production, tests, clarity,
  simplification, and other categories; and each confirmed production defect
  with every finder that reported it.
- Give every rejected finding a `rejections` entry in `auditMetrics`, with a
  `summary` and `counterEvidence`. Write any condition for reopening into that
  text, and keep the wording when copying it forward. The next pass reads
  these rejections to avoid re-deriving a settled claim.
- Open a ledger entry for every deferred finding with
  `npm run quality -- defer --id <id> --area <area> --category <c>
  --effort <small|slice> --detail <text>` before recording the pass, and give
  each one a `deferrals` entry in `auditMetrics`. `small` fits a later
  audit-fix commit; `slice` needs its own slice. Close an entry with
  `npm run quality -- resolve-deferral --id <id>` when its fix lands.
  `productionDefects` covers the production category alone, so a deferred
  test, clarity, or simplification finding has no other durable record.
- Cite symbols by file and function name, not line numbers.
- Correct an open entry with `npm run quality -- note-deferral --id <id>
  --note <text>`. Write a note when a later commit falsifies a claim the entry
  rests on, or closes part of what it counts.
- Record what an entry waits on with `npm run quality -- defer --blocked-on
  <symbol>`, or `block-deferral --id <id> --blocked-on <symbol>` afterwards.
  Name the missing symbol, not the containing function; `js/` already holds a
  partial port under most C function names, so a blocker that names the
  function appears resolved.
- A clarity or copyedit pass leaves no ledger record. State its elapsed wall
  time and finding counts in the progress report that announces it.
- Finish each formal review pass with `npm run quality -- --check`. Assign
  every unassigned `js/` file with `npm run quality -- assign`. Resolve
  concrete simplification or clarity triggers, but do not create a formal
  review pass when none is due.
