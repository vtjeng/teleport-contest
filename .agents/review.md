# Review cadence and methodology

Read this file before scheduling, running, or recording a formal review pass.
Only the orchestrator does this work. `.agents/loop.md` assigns the roles and
holds the loop these passes are steps in. `.agents/workflow.md` defines the
implementation vocabulary this file relies on: a coherent implementation
chunk, a behavior slice, a goal, and a review window.

A **formal review pass** is an independent structured review of a frozen
committed range. It comes in four kinds: correctness, clarity, simplification,
and copyediting. The orchestrator invokes the skill that this file
names for the kind it needs, which runs its reviewers as parallel subagents and
reports possible problems; the orchestrator reviews each finding and applies
only fixes for confirmed findings. All four kinds follow the process rules in
"Running formal review passes" below.

**Audit** means the same thing. That word is fixed in the skill names
`/audit-diff-correctness` and `/audit-diff-clarity`, and in the `Audit-fix-for:`
commit trailer.

An **evidence snapshot** is one `SCORE.tsv` row for the exact integrated code
state at a full commit SHA: agents append `slice`, `window`, `goal`, `holdout`,
and `publish` rows when those events complete, as `.agents/scoring.md`,
"Score evidence", states. The quality ledger is `QUALITY.json`, which records
completed correctness and simplification passes. Formal review ranges remain in
that ledger.

## Readiness for a formal review pass

While implementation is incomplete, find and fix gaps with the loop's own
instruments: trace each ported function against its upstream C or Lua
source as you port it, commit each chunk with its focused tests, run the
full suite at every checkpoint, and run a fresh differential when a slice
closes. Launch a formal review pass only when the orchestrator judges the
behavior and evidence complete. Freeze the committed range and prepare it with
`node scripts/audit-worktree.mjs prepare ... --readiness`, which runs
`npm run checkpoint`, `npm run quality -- --check --health`, and the mutation command
selected by "Mutation-test the reviewed lines" at the repository head. It
embeds each command, mutation range, report path, and result in the manifest
and refuses to prepare while any is red. A window's first correctness pass
mutates the whole frozen range. A follow-up pass over audit fixes mutates its
new delta unless the conditions below require an earlier scope to be repeated.
That is the machine half of readiness; "Mutation-test the reviewed lines"
states what a survivor proves and how the run's survivor list reaches the
review.

The hand-written half is three attestations, recorded in the pass's
`auditMetrics.readiness`:

- **boundary**: name the user-visible starting and ending events and confirm
  the real game executes the path.
- **sourceReview**: confirm that every branch and helper reachable before the
  ending event was traced against upstream C or Lua, that the trace covered
  state and PRNG order, and that stubs, explicit stops, partial
  implementations, and missing subsystems were identified.
- **completeness**: confirm that no known unsupported behavior remains inside
  the boundary, and that any reachable excluded branch stops before changing
  state, consuming randomness, or producing output.

The active implementation checklist (`.agents/implementation-checklist.json`,
created when a qualifying slice opens) supports these attestations; it does
not replace tests, differentials, source review, generated checks, quality
checks, or formal review passes. A missing attestation or a red prepared
command is `NOT READY`: launch no reviewers.

## Review scheduling

`QUALITY.json` is the executable source for quality areas and numeric
thresholds. When a threshold changes, update this policy and
`scripts/quality-status.test.mjs` in the same chunk.

Two events require every outstanding review to be complete before they
happen: an authorized holdout evaluation and publishing a result outside
this repository. This file calls those two events **review deadlines**.

Generated outputs declared in `QUALITY.json` do not count toward changed-line
thresholds. Their generators do count, and a commit touching a generator or
output counts toward the commit threshold unless it is a linked audit-fix
commit. Each declaration names the generator and regeneration check; reviews
cover both. An **evidence-only commit** changes only `SCORE.tsv`, `SCORE.md`, correctness
or simplification records, or their supporting documentation, and no
area-owned path. A **quality-ledger-only commit** is the subtype of evidence-only commit
that changes only correctness or simplification records. Evidence-only
commits do not count toward path-scoped commit totals and do not receive
their own evidence snapshots.

### When a correctness pass is due

- Run a full correctness pass no later than ten unreviewed implementation
  commits or 1,000 changed production lines since the frontier.
  `npm run quality` reports the running debt against that gate; plan each
  pass to land at a slice boundary before the gate forces one mid-slice.
- These limits count changed production lines across every area-owned path,
  measured from the one review frontier, the newest recorded review head. A
  file boundary does not affect the count: splitting a file into several
  files does not reduce review debt, and is not a reason to split one. See
  "Keep each source file's port in one place" in `AGENTS.md`.
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
- A full pass is also due after a mismatch nobody can explain, whether found
  while tracing the port against its upstream C or Lua source or by a
  differential, and before a review deadline.
- Other small cohesive fixes may batch until one of the conditions in this
  section makes a full pass due. Do not repeat the same formal review pass
  until another threshold is met or the design materially changes.

A change crosses quality areas only when it changes state ownership or
persistence, PRNG or evaluation order, lifecycle ownership, an input boundary,
or another shared behavioral interface. Imports, exports, call sites, tests,
and wiring that consume an existing contract do not cross areas by themselves.

Apply the per-chunk workflow in `.agents/workflow.md` to every commit of an
open slice. Once the running game has executed the production code path that
calls the newly ported behavior during normal play, run the fresh end-to-end
differentials that `.agents/validation.md`, "Fresh differentials",
describes.

### Which finders and other passes to run

Before recording a correctness pass, state whether the full-pass trigger, each
optional finder trigger, and each separate-pass trigger below applies.
Omitting an untriggered optional finder or separate pass is compliant and
creates no debt. Commit counts, line counts, and prior
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
- Run `/copyedit-technical-prose` before publishing changed documentation or
  reports outside this repository. Tracker-only SHA and score entries do not
  trigger it. Do not run it on unchanged prose.

### Mutation-test the reviewed lines

`scripts/mutate-sites.mjs` rewrites one operator, boolean, or integer bound at a
time in a set of `js/` lines, runs the tests that reach those modules, and
reports the mutants that no test failed on. The script calls such a mutant a
**survivor**: no test distinguishes the changed line from a wrong version of it.
Its header comment states the site set, the two waves, the target forms, and the
measured cost.

Both runs below pass `--kind relational,logical,boolean`, which leaves out
integer bounds, the largest group and the weakest signal, because most of them
are constants that no test can observe. Both stop at each mutant's first wave,
the test files that reach its module without passing through another `js/`
module. `--whole-suite` judges every first-wave survivor by every test file;
reserve it for a first wave with no covering test file or a source trace that
identifies a transitive test capable of deciding the survivor. Use
`--from-report` to run only those survivors. Classify all other survivors from
their source path, caller invariants, and declared exclusions.

**Per slice.** A behavior slice closes with a mutation run over its own lines.
The worker runs it while the work is uncommitted, which
`.claude/agents/slice-worker.md` states, and the slice's commit message
carries the `Mutants:` trailer that `--emit-trailer` prints, with the reason
no test can kill each surviving relational, logical, or boolean mutant in the
body. One recorded reason may cover several survivors that sit on the same
branch. A survivor of those three kinds with no recorded reason blocks the
slice from closing. Integer survivors are not gating.
`npm run quality -- slice-mutants --range <base>..<head>` lists the
js/-touching commits in a range that carry no `Mutants:` trailer, so the
orchestrator checks the record in place of inspecting for it.

Every first-wave run writes a JSON report. Preserve it until every survivor is
killed, classified, or selected for a whole-suite rerun. The report serializes
the verdicts the run already computed; never rerun a first wave solely to
create it.

The commit message carries that record because a slice run measures uncommitted
work, whose subject is gone once the slice is committed, and because
`QUALITY.json` holds `auditMetrics` for passes alone.

**Per window.** A window's first correctness pass mutates its complete frozen
range:

```
npm run mutate -- --range <base>..<head> --kind relational,logical,boolean
```

It names two commits, so a later reader repeats it and reaches the same target
set, while a slice run's subject no longer exists after the commit. It also
covers the `js/` lines of commits that close no slice and judges every mutant
against the integrated suite at the first review boundary.

A follow-up pass whose new range contains audit fixes or simplification commits
passes that delta to readiness explicitly:

```
node scripts/audit-worktree.mjs prepare ... --readiness \
  --mutation-range <previous-head>..<head>
```

The original window result and each later delta result compose the mutation
evidence for the final head. Adding assertions or production fixes requires
only the delta run.

Repeat an earlier mutation scope when the follow-up removes or relaxes an
existing assertion that killed one of its mutants, changes test reachability
for a previously mutated production module, changes the mutator's site
selection or verdict logic, or follows an incomplete mutation run. Limit the
repeat to the affected earlier files when the tool can express that scope.
Record the repeated scope and the reason in the readiness manifest.

Record its mutant count, survivor count, per-kind counts, and the test-quality
finder's conclusion under `mutation` in the pass's `auditMetrics`, together
with every mutation range used. Where a per-slice record and a later window or
delta run disagree about a mutant, the later run is the record.

Two limits bound what either list proves. A line holding no mutable site
produces no mutant, so a line the list omits carries no evidence either way. A
first-wave survivor may still be killed by a test that reaches its module
through another `js/` module, which is what `--whole-suite` settles.

For the first limit, delete the line and run the whole suite. One failure, and
it is the test you expect, proves that test pins the line and nothing else
does; none means the line is unpinned. Restore it, and record which line you
deleted and what failed.

A search for a message string answers less than it appears to. A refusal
comment quotes the C message it refuses, so the text appears in commentary as
often as in code, and a message assembled by interpolation matches no literal
search at all. Read the emitting site.

Hand the survivor list to the pass as a `validation` context item addressed to
the `tests` finder, which is how `/audit-diff-correctness` routes evidence to
one perspective. That finder traces each survivor against its source, so a false
survivor costs one trace.

`scripts/mutate-sites.mjs` belongs to no quality area; its header states why and
what covers it instead.

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
claim the pass covers the new implementation. Do not run another pass first.
Implement through the next observable boundary,
satisfy the readiness requirements again, and run a new full correctness
pass over the expanded range.

After applying in-scope audit fixes, inspect the fix diff and run the focused
and broad validation that `.agents/validation.md` specifies for the affected
behavior. A commit confined to confirmed findings may use
`Audit-fix-for: <full-reviewed-head-sha>`. Never use that trailer for unrelated
changes. The `npm run quality` dashboard excludes a valid linked audit-fix
commit from the commit threshold but still counts its production lines.

A pass closes over its own fixes. After the audit-fix commit lands, re-verify
its diff against the pass's confirmed findings and record the pass with
`--range <base>..<audit-fix commit>`, so the fixes leave no correctness debt
behind. A fix applied after its pass was recorded is correctness debt for the
next scheduled correctness range. Run a full pass when fixes expand scope,
change a shared contract, cause an unexplained mismatch, or independently
meet a normal full-review trigger.

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
- Record the pass's counts, findings, rejections, deferrals, unverified
  items, warnings, and validation in its `QUALITY.json` entry. That entry is
  the pass's whole durable record; no separate report file is retained.

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

- A `SCORE.tsv` evidence snapshot may reference the correctness and
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
- Pass `--manifest <path>` with the path `prepare` printed, so the pass records
  whether an implementation checklist covered the range. The recorder stores
  the answer as the pass's `checklist`, and a pass prepared with
  `--no-checklist-reason` records that reason there. Without `--manifest` the
  pass carries no such field, and a later reader cannot tell a range that had a
  covering plan from one that did not.
- The range base must be at or before the frontier, the newest recorded
  head of the pass's kind. The recorder refuses a range that starts after
  it, because recording that pass would turn the skipped commits into
  reviewed history; the refusal names the frontier and the base it received.
  A base older than the frontier re-reads reviewed commits and is harmless.
- Advance a review frontier only through the exact integrated commit that a
  recorded pass covered. An audit-fix commit recorded as its own pass's range
  head carries no debt; one applied after the pass was recorded remains debt
  until a later correctness pass covers it.
  Correctness does not create simplification debt; the dashboard may show the
  last simplification frontier for context. Separate clarity and copyedit
  passes are not ledger records.
- For every new correctness or simplification record, include elapsed wall time;
  raw, deduplicated, confirmed, applied, deferred, rejected, and unverified
  counts; confirmed totals by production, tests, clarity, simplification, and
  other categories; and each confirmed production defect with every finder that
  reported it. Preserve unique finder attribution. The recorder renders the
  counts sentence into the stored evidence from `auditMetrics`; write in
  `--evidence` only what the fields cannot hold, such as which finding
  mattered and why, and the score movement's attribution.
- Give every rejected finding a `rejections` entry in `auditMetrics`, with a
  `summary` of the claim and the `counterEvidence` that settled it. The
  recorder refuses a pass whose entry count differs from the rejected count.
  Write any condition for reopening into that text, such as "do not reopen
  without a source-reachable input and a diff-causal line", and keep the
  wording when copying it forward. The next pass reads these recorded
  rejections to avoid re-deriving a claim that was already answered. A
  working note deleted with its slice is unavailable by then.
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
- Cite a symbol in an entry's text: the file together with the function or
  constant name. Line numbers rot. Any edit above a citation moves the line it
  names, and the symbol stays findable through the same edit.
- Correct an open entry with `npm run quality -- note-deferral --id <id> --note
  <text>`. It appends a note stamped with the commit it was written at and
  leaves `detail` as first written, so a reader can separate an original claim
  from a later correction and date each one. Write a note when a later commit
  falsifies a claim the entry rests on, or closes part of what it counts. The
  ten-entry sweep threshold in `.agents/selection.md` counts entries, and an
  entry whose work is half done counts the same as a fresh one, so an entry
  that reads larger than it is schedules a sweep before one is due.
  `npm run quality -- deferrals` prints each entry's note count, and
  `--id <id>` prints the notes themselves. A closed entry takes no note;
  recording a deferral against its id reopens it first.
- Record what an entry waits on with `npm run quality -- defer --blocked-on
  <symbol>`, or `block-deferral --id <id> --blocked-on <symbol>` afterwards.
  Set it only where the entry cannot close until other work lands, and name the
  symbol the entry waits on rather than the function the missing arm sits
  inside: `js/` already holds partial ports under their C names, so a blocker
  named too loosely reads as landed the day it is written. Such an entry stops
  counting toward the sweep threshold, so an unset field costs a sweep run and
  a wrong one hides real debt.
- A full correctness record also names the exact range, enabled optional
  finders, fixes, deferrals, unverified judgments, rejections and their
  counter-evidence, warnings, and validation. Record clarity separately only
  when it ran.
- A clarity or copyedit pass leaves no ledger record. State its elapsed wall
  time and finding counts in the progress report that announces it.
- Finish each formal review pass with `npm run quality -- --check`. Resolve
  review debt at a batching threshold declared in `QUALITY.json` and assign
  every unassigned `js/` file to a `QUALITY.json` area with
  `npm run quality -- assign`. An audit-fix commit
  applied after its pass was recorded may stand as correctness debt, except
  before a review deadline.
  Resolve concrete simplification or clarity triggers, but do not invent
  a formal review pass when none exists. An area no recorded pass has covered
  appears in the dashboard's never-reviewed line, which is information but
  does not block.
