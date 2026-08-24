# Review cadence and methodology

Read this file before scheduling, running, or recording a formal review pass.
Only the orchestrator does this work. `.agents/loop.md` defines the loop that
includes these passes. `.agents/workflow.md` defines the terms this file uses:
coherent implementation chunk, behavior slice, goal, and review window.

A **formal review pass** reviews a frozen committed range for one of four
concerns: correctness, clarity, simplification, or copyediting. The
orchestrator invokes the skill, reviews each reported finding, and applies
only confirmed fixes. All four kinds follow "Running formal review passes"
below.

**Audit** means a formal review pass. The word appears in the skill names
`/audit-diff-correctness` and `/audit-diff-clarity`, and in the
`Audit-fix-for:` commit trailer.

An **evidence snapshot** is one `SCORE.tsv` row at a full commit SHA.
Agents append `slice`, `window`, `goal`, `holdout`, and `publish` rows
following `.agents/scoring.md`, "Score evidence".

`QUALITY.json` records completed correctness and simplification passes and
their ranges. A **review frontier** is the latest commit a recorded
correctness pass covered.

## Readiness for a formal review pass

While implementation is incomplete, find and fix gaps through the loop's
existing checks: trace each ported function against its C or Lua source, commit
each chunk with its focused tests, run the full suite at every checkpoint, and
run a fresh differential when a slice closes.

Launch a formal review pass only when the orchestrator judges the behavior and
evidence complete. Freeze the committed range and prepare it with
`node scripts/audit-worktree.mjs prepare ... --readiness`, which runs
`npm run checkpoint` and `npm run quality -- --check --health` at the
repository head. It embeds each command and result in the manifest and refuses
to prepare while any command fails (reports red).

Three manual attestations, recorded in the pass's `auditMetrics.readiness`,
are also required:

- **boundary**: name the user-visible starting and ending events and confirm
  the real game executes the path.
- **sourceReview**: confirm that every branch and helper reachable before the
  ending event was traced against upstream C or Lua, that the trace covered
  state and PRNG order, and that stubs, explicit stops, partial
  implementations, and missing subsystems were identified.
- **completeness**: confirm that no known unsupported behavior remains inside
  the boundary, and that any reachable excluded branch stops before changing
  state, consuming randomness, or producing output.

The implementation checklist (`.agents/implementation-checklist.json`) supports
these attestations; it does not replace tests, differentials, or source review.
A missing attestation or a red prepared command is `NOT READY`: launch no
reviewers.

## Review scheduling

`QUALITY.json` defines quality areas and their thresholds. When a threshold
changes, update this policy and `scripts/quality-status.test.mjs` in the same
chunk.

Generated outputs declared in `QUALITY.json` do not count toward changed-line
thresholds. Their generators do count, and a commit touching a generator or
output counts toward the commit threshold unless it is a linked audit-fix
commit. Each declaration names the generator and regeneration check; reviews
cover both. An **evidence-only commit** changes only `SCORE.tsv`, `SCORE.md`,
correctness or simplification records, or their supporting documentation,
and no area-owned path. A **quality-ledger-only commit** changes only
correctness or simplification records. Evidence-only commits do not count
toward path-scoped commit totals and do not receive their own evidence
snapshots.

### When a correctness pass is due

- Run a full correctness pass no later than twenty unreviewed implementation
  commits or 2,000 changed production lines since the frontier.
  `npm run quality` reports the running debt against that gate; plan each
  pass to land at a slice boundary before the gate forces one mid-slice.
- These limits count changed production lines across every area-owned path,
  measured from the review frontier. Splitting a file does not reduce review
  debt. See "Keep each source file's port in one place" in `AGENTS.md`.
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
  `Score-identical-with: <full SHA>` trailer naming a commit whose development
  score matches exactly. `npm run quality` then
  subtracts that commit's lines from the area's gate total and reports them as
  relocated lines, so the remaining debt is the work that still needs review.
  Add the trailer only after scoring both commits and confirming every session
  matched, call for call and screen for screen. Do not add anything else
  to that commit.
- A full pass is also due after an unexplained mismatch found by source
  tracing or a differential.
- Other small cohesive fixes may batch until one of the conditions in this
  section makes a full pass due. Do not repeat the same formal review pass
  until another threshold is met or the design materially changes.

A change crosses quality areas only when it changes state ownership or
persistence, PRNG or evaluation order, lifecycle ownership, an input boundary,
or another shared behavioral interface. Imports, exports, call sites, tests,
and wiring that consume an existing contract do not cross areas by themselves.

Apply the per-chunk workflow in `.agents/workflow.md` to every commit of an
open slice. Once the game executes the newly ported behavior during normal
play, run the fresh differentials in `.agents/validation.md`, "Fresh
differentials".

### Which finders and other passes to run

Before recording a correctness pass, state whether the full-pass trigger, each
optional finder trigger, and each separate-pass trigger below applies.
Omitting an untriggered optional finder or separate pass creates no debt.
Commit counts, line counts, and prior correctness passes do not trigger an
optional finder or separate pass by themselves.

- Whenever a full correctness pass is due, run it as a `full`
  `/audit-diff-correctness` pass. Its behavior, readability-risk, test-quality,
  and variable-flow finders are mandatory.
- Enable the performance finder only when the range adds work beyond what the
  C source requires: unbounded or amplified work, worse complexity, avoidable
  repeated hot-path traversal, material allocation or serialization, startup
  cost, or conflict with a measured budget. Source-required iteration does not
  by itself justify enabling the performance finder.
- Enable the concurrency finder when the range changes shared mutable state,
  asynchronous or reentrant control flow, parallel work, cancellation, retries,
  cleanup, or lifecycle behavior that can overlap. State the risk in the pass
  scope.
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
  reports outside this repository. Tracker-only SHA and score entries do not
  trigger it. Do not run it on unchanged prose.

## Findings and scope changes

During a formal review pass, an **audit fix** corrects only code within the
reviewed range: a condition, order, constant, state update, test, name, or
comment.

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

After applying in-scope audit fixes, inspect the fix diff and run the
validation that `.agents/validation.md` specifies for the affected behavior.
A commit confined to confirmed findings may use
`Audit-fix-for: <full-reviewed-head-sha>`. Never use that trailer for unrelated
changes. The `npm run quality` dashboard excludes a valid linked audit-fix
commit from the commit threshold but still counts its production lines.

After the audit-fix commit lands, re-verify its diff against the pass's
confirmed findings and record the pass with `--range <base>..<audit-fix
commit>`, so the fixes leave no correctness debt behind. A fix applied after
its pass was recorded is correctness debt for the next range. Run a full pass
when fixes expand scope, change a shared contract, cause an unexplained
mismatch, or independently meet a full-review trigger.

## Running formal review passes

These rules apply to all four pass kinds:

- These instructions authorize the orchestrator to launch a required pass
  without separate confirmation, but not holdout access or sharing repository
  material outside the pass.
- Launch each pass by invoking its skill from the orchestrator only. Do not
  override the model or reasoning effort the skill selects unless the user
  asks for it.
- Give reviewers the committed range or document snapshots, affected areas,
  relevant sources, prior validation, decided non-issues, and applicable
  constraints. Require them to read `AGENTS.md`. Prohibit access to
  `sessions/holdout/`.
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
- Record the pass's counts, findings, rejections, deferrals, unverified
  items, warnings, and validation in its `QUALITY.json` entry. That entry is
  the pass's durable record; no separate report file is retained.

Preserve code whose structure mirrors the C source, interfaces reserved for
future dependencies, generated data, and temporary scaffolding until a
source-faithful replacement owns the behavior and state. Simplification must
preserve PRNG and evaluation order.

### Launching a formal review pass

- Do not relaunch a pass that is still running — a second launch restarts at
  zero and produces a duplicate over the same head. When a pass returns a
  result that looks wrong, read its transcript before relaunching it. The
  individual reviewer results are usually intact, and only the combination
  step failed; rerunning that step alone repairs the result.

## Recording formal review passes

- A `SCORE.tsv` evidence snapshot may reference correctness and simplification
  records but does not replace them or advance a review frontier.
- Record correctness with
  `npm run quality -- record-review --range <base>..<head> ...`. Record
  simplification with
  `npm run quality -- record-simplification --range <base>..<head> ...`.
  `--range` is the commit range the audit actually read, in the same form
  `scripts/audit-worktree.mjs prepare` takes. The recorder stores it as the
  pass's `auditedRange`. Pass `--head` only to restate the range head; it must
  name the same commit.
- Pass `--manifest <path>` with the path `prepare` printed, so the pass records
  whether an implementation checklist covered the range. The recorder stores
  the answer as the pass's `checklist`, and a pass prepared with
  `--no-checklist-reason` records that reason there. Without `--manifest` the
  pass carries no such field, and a later reader cannot distinguish a range that
  had a covering plan from one that did not.
- A correctness range's base must be at or before the review frontier. The
  recorder refuses a range that starts after it, because recording that pass
  would mark the skipped commits as reviewed. A base older than the frontier
  re-reads reviewed commits and is harmless. A simplification pass records the
  range it read: its coverage is the union of every recorded range, and the
  commits outside that union are its debt. A scoped pass is recordable wherever
  it sits. Correctness keeps the single frontier because its gate asserts
  gapless coverage; simplification has no gate and asserts only what it read.
- Advance a review frontier only through the exact integrated commit that a
  recorded pass covered. An audit-fix commit recorded as its own pass's range
  head carries no debt; one applied after the pass was recorded remains debt
  until a later correctness pass covers it.
  Correctness does not create simplification debt; the dashboard shows
  simplification coverage for context. Clarity and copyedit passes are not
  ledger records.
- For every new correctness or simplification record, include elapsed wall time;
  raw, deduplicated, confirmed, applied, deferred, rejected, and unverified
  counts; confirmed totals by production, tests, clarity, simplification, and
  other categories; and each confirmed production defect with every finder that
  reported it. Preserve unique finder attribution. The recorder renders the
  counts from `auditMetrics`; write in `--evidence` only what the fields cannot
  hold, such as which finding mattered and the score movement's attribution.
- Give every rejected finding a `rejections` entry in `auditMetrics`, with a
  `summary` of the claim and the `counterEvidence` that settled it. The
  recorder refuses a pass whose entry count differs from the rejected count.
  Write any condition for reopening into that text, such as "do not reopen
  without a source-reachable input and a diff-causal line", and keep the
  wording when copying it forward. The next pass reads these rejections to
  avoid re-deriving a settled claim.
- Open a ledger entry for every deferred finding with `npm run quality --
  defer --id <id> --area <area> --category <c> --effort <small|slice>
  --detail <text>` before recording the pass, and give each one a `deferrals`
  entry in `auditMetrics` naming that id and its category. `small` fits a
  later audit-fix commit; `slice` needs its own slice. Close an entry with
  `npm run quality -- resolve-deferral --id <id>` when its fix lands;
  recording a deferral against a closed id reopens it. `productionDefects`
  covers the production category alone, so a deferred test, clarity, or
  simplification finding has no other durable record. The recorder refuses a
  pass whose entry count differs from the deferred count, one whose entry
  names an id the ledger does not hold, and one whose production-category
  deferrals disagree with the deferred `productionDefects` entries.
- Cite a symbol in an entry's text as file and function or constant name.
  Avoid line numbers; they shift when code above them changes.
- Correct an open entry with `npm run quality -- note-deferral --id <id> --note
  <text>`. The note is stamped with the current commit and appended alongside
  the original `detail`. Write a note when a later commit falsifies a claim the
  entry rests on, or closes part of what it counts. `npm run quality --
  deferrals` prints each entry's note count, and `--id <id>` prints them. A
  closed entry does not accept a note; recording a deferral against its id
  reopens it first.
- Record what an entry waits on with `npm run quality -- defer --blocked-on
  <symbol>`, or `block-deferral --id <id> --blocked-on <symbol>` afterwards.
  Set it only where the entry cannot close until other work lands. Name the
  missing symbol, not the containing function; `js/` already holds a partial
  port under most C function names, so a blocker that names the function
  appears resolved.
- A full correctness record also names the exact range, enabled optional
  finders, fixes, deferrals, unverified judgments, rejections and their
  counter-evidence, warnings, and validation. Record clarity separately only
  when it ran.
- A clarity or copyedit pass leaves no ledger record. State its elapsed wall
  time and finding counts in the progress report that announces it.
- Finish each formal review pass with `npm run quality -- --check`. Resolve
  review debt at a batching threshold declared in `QUALITY.json` and assign
  every unassigned `js/` file with `npm run quality -- assign`. An audit-fix
  commit applied after its pass was recorded may stand as correctness debt.
  Resolve concrete simplification or clarity triggers, but do not create a
  formal review pass when none is due. The dashboard's never-reviewed line is
  informational and does not require action.
