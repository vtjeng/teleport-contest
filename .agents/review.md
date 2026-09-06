# Review methodology

Read this file before deciding whether a correctness review is warranted, and
before running or recording one. Only the orchestrator does this work.
`.agents/loop.md` defines the loop that may call for a review.
`.agents/glossary.md` defines the terms this file uses.

A **formal review pass** reviews a frozen committed range, or a named set of
functions at a frozen commit, for one of four concerns: correctness, clarity,
simplification, or copyediting. The orchestrator invokes the skill, reviews
each reported finding, and applies only confirmed fixes. All four kinds follow
"Running formal review passes" below. **Audit** is a synonym; it appears in
the skill names and the `Audit-fix-for:` commit trailer.

An **evidence snapshot** is one `SCORE.tsv` row at a full commit SHA.

`QUALITY.json` records completed correctness and simplification passes and
their ranges. It carries no review cadence: `npm run quality` prints the
unreviewed debt for information, and `npm run quality -- --check` blocks only
on a `js/` file that no quality area owns.

## When a correctness review is warranted

Recorded play is the port's oracle: the development sessions and the
recordings under `recordings/` replay on every checkpoint, and a mismatch they
find goes to the divergence queue, not to a review. A review reads code the
oracle does not reach. Run one in these three cases:

- A file port is closing and an entry point of its file has no recipe that
  reaches it (`AGENTS.md`, "Validate completed work"). Scope the review to
  the functions no recording executes, and compare each against its C
  source.
- A divergence fix took more than one span. Scope the review to the functions
  the fix touched.
- The user asks for one.

Do not schedule a review by elapsed commits or changed lines, and do not run
one for a span that neither the development sessions nor the recordings
contradicted.

Three other passes have their own occasions. Run one `/simplify-codebase` pass over
the whole of `js/` before the Phase 1 freeze on 2026-11-29, because Phase 2
divides parity by the size of the diff to NetHack 5.1. Run
`/copyedit-technical-prose` before publishing changed documentation or reports
outside this repository. Run `/audit-diff-clarity` only for a concrete
readability problem a reader hit, scoped to that code.

## Readiness for a formal review pass

Launch a formal review pass only when the code under review is committed and
its evidence is complete. Prepare with
`node scripts/audit-worktree.mjs prepare ... --readiness`, which runs
`npm run checkpoint` and `npm run quality -- --check --health` at the
repository head and refuses to prepare while any command fails.

Three manual attestations, recorded in `auditMetrics.readiness`, are also
required:

- **boundary** (the field keeps its historical name): name the functions or
  the committed range under review, and state which recording, development
  session, or source-pinned test executes each function, or that none does.
- **sourceReview**: confirm that every function in scope was traced against
  upstream C or Lua, covering state and PRNG order, and that every
  `note_unported()` call and every remaining `Unsupported*Error` throw in
  scope was listed.
- **completeness**: confirm that no `note_unported()` call in scope stands in
  for a value the C uses (`AGENTS.md`, "Port whole files in C order").

A missing attestation or a red prepared command is `NOT READY`: launch no
reviewers.

## Which finders to run

Run every correctness review as a `full` `/audit-diff-correctness` pass, whose
behavior, readability-risk, test-quality, and variable-flow finders always run.
The two finders below are optional; before recording the pass, state which of
their triggers applied.

- Enable the performance finder only when the range adds work beyond what the
  C source requires: unbounded or amplified work, worse complexity, avoidable
  repeated hot-path traversal, material allocation or serialization, startup
  cost, or conflict with a measured budget.
- Enable the concurrency finder when the range changes shared mutable state,
  asynchronous or reentrant control flow, parallel work, cancellation, retries,
  cleanup, or lifecycle behavior that can overlap.

## Findings and scope changes

An **audit fix** corrects only code within the reviewed scope: a condition,
order, constant, state update, test, name, or comment.

Return to implementation when a finding:

- requires a new upstream function family or branch;
- changes a state or lifecycle owner, PRNG or rendering behavior, or an input
  or persistence boundary; or
- requires a new recipe because an entry point the file implements has none.

A finding outside the scope, or one that needs a span of its own, goes in the
pass's `QUALITY.json` entry and becomes the goal's next span. The deferral
ledger has accepted no new entries since 2026-09-05. Close its existing entries
with `npm run quality -- resolve-deferral --id <id>` as the file ports that
cover them land.

After applying in-scope audit fixes, run the validation that
`.agents/validation.md` specifies for the affected behavior.
A commit confined to confirmed findings may use
`Audit-fix-for: <full-reviewed-head-sha>`. Never use that trailer for unrelated
changes.

After the audit-fix commit lands, re-verify its diff against the pass's
confirmed findings and record the pass with `--range <base>..<audit-fix
commit>`, so the fixes are inside the recorded range.

## Running formal review passes

- The orchestrator may launch a warranted pass without separate confirmation.
- Launch each pass by invoking its skill from the orchestrator only. Do not
  override the model or reasoning effort the skill selects unless the user
  asks.
- Give reviewers the committed range or the function list, the affected
  areas, relevant sources, prior validation, decided non-issues, and
  applicable constraints. Require them to read `AGENTS.md`. Prohibit access
  to `sessions/holdout/`.
- For `/audit-diff-correctness`, use default skill context routing. Add finder
  `audiences` only for exceptions or unusually large context; use `all` only
  for universal constraints.
- Run the pass in an isolated worktree pinned to the reviewed commit. Use
  `node scripts/audit-worktree.mjs prepare ...`, then `check` before launch.
  After preserving the report and proposed changes, run `cleanup`.
- Freeze the assigned scope. Later commits remain outside the pass and need
  review only as a later delta.
- Record the pass's counts, findings, rejections, unverified items, warnings,
  and validation in its `QUALITY.json` entry. That entry is the pass's
  durable record; no separate report file is retained.

Preserve code whose structure mirrors the C source. Simplification must
preserve PRNG and evaluation order.

Do not relaunch a running pass; a second launch restarts at zero. When a pass
returns a suspect result, read its transcript first; rerunning the combination
step alone usually repairs it.

## Recording formal review passes

- A `SCORE.tsv` evidence snapshot is not a review record.
- Record correctness with
  `npm run quality -- record-review --range <base>..<head> ...`. Record
  simplification with
  `npm run quality -- record-simplification --range <base>..<head> ...`.
  `--range` is the commit range the audit read, in the form
  `scripts/audit-worktree.mjs prepare` takes. A pass records the range it
  read; the ledger keeps no frontier and requires no gapless coverage.
- For every new correctness or simplification record, include elapsed wall
  time; raw, deduplicated, confirmed, applied, rejected, and unverified
  counts; confirmed totals by production, tests, clarity, simplification, and
  other categories; and each confirmed production defect with every finder
  that reported it.
- Give every rejected finding a `rejections` entry in `auditMetrics`, with a
  `summary` and `counterEvidence`. Write any condition for reopening into that
  text, and keep the wording when copying it forward. The next pass reads
  these rejections to avoid re-deriving a settled claim.
- Cite symbols by file and function name, not line numbers.
- When a later commit falsifies a claim an open deferral entry rests on, or
  closes part of what it counts, write the correction to a file and pass it
  with `npm run quality -- note-deferral --id <id> --note-file <path>`.
- A clarity or copyedit pass leaves no ledger record. State its elapsed wall
  time and finding counts in the progress report that announces it.
- Finish each formal review pass with `npm run quality -- --check`. Assign
  every unassigned `js/` file with `npm run quality -- assign`.
