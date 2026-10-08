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

The quality commands record pass ranges in `QUALITY.json` and detailed
evidence in `QUALITY-evidence.json`. This ledger carries no review cadence:
`npm run quality` prints the unreviewed debt for information, and
`npm run quality -- --check` blocks only on a `js/` file that no quality area
owns.

## When a correctness review is warranted

Use one independent, read-only reviewer for a specific unresolved correctness
concern. Give it the affected functions, authoritative source, existing
evidence, and question to answer. This targeted check is not a formal audit.
Neither targeted checks nor formal audits replace required runtime evidence.

Run a formal multi-agent audit only with the user's explicit approval for
that audit. Cross-subsystem scope, asynchronous callers, shared state, delivery
count, and changed lines do not authorize one. Give a single reviewer the
specific concern first; if it remains unresolved, explain it when requesting
approval. Do not delay acceptance for optional test or comment improvements.

Copyedit prose inline using the technical-writing rules. Run a multi-agent
copyedit only when the user explicitly requests one. This project rule also
applies when a copyediting skill would otherwise launch multiple agents.

Simplify code for a specific maintenance problem, scoped to the affected
code. Do not schedule a whole-codebase simplification for the phase freeze.
Run `/audit-diff-clarity` only for a concrete readability problem a reader
hit, scoped to that code.

## Readiness for a formal review pass

Launch a formal review pass when the code is committed and its focused
validation evidence is available. Prepare with
`node scripts/audit-worktree.mjs prepare ... --readiness`, which runs
`npm run quality -- --check --health`, not a full checkpoint.
Use existing checkpoint evidence when available; a full checkpoint is not
a prerequisite for reviewing code.

Give reviewers the existing source-completion and validation evidence.
Reviewers inspect the relevant C or Lua source and report concrete gaps;
do not require separate attestations or duplicate evidence summaries.

## Which finders to run

Run every formal correctness audit as a `full` `/audit-diff-correctness` pass, whose
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
- requires a new recipe because an entry point lacks matching synthetic or
  recording evidence.

Record a finding in the quality ledger when fixing it would extend the review
beyond its agreed scope. Use `.agents/selection.md` to decide when a worker
takes that follow-up work as a new implementation task.

After applying in-scope audit fixes, run the validation that
`.agents/validation.md` specifies for the affected behavior.
A commit confined to confirmed findings may use
`Audit-fix-for: <full-reviewed-head-sha>`. Never use that trailer for unrelated
changes.

After the audit-fix commit lands, re-verify its diff against the pass's
confirmed findings and record the pass with `--range <base>..<audit-fix
commit>`, so the fixes are inside the recorded range.

Use one targeted verifier to review all corrections and report all remaining
problems together. Do not restart general discovery or full readiness after
each edit. Optional test improvements do not block
acceptance; concrete correctness defects still require resolution.

Finish corrections and focused checks before requesting the hosted checkpoint
for the final commit. Reuse a passing result only when it names that exact
commit. Changed execution inputs require new validation under
`.agents/validation.md`; recording a review does not itself require another
checkpoint.

## Running formal review passes

- Obtain the user's explicit approval before launching a multi-agent pass.
- Launch each pass by invoking its skill from the orchestrator only. Do not
  override the model or reasoning effort the skill selects unless the user
  asks.
- Give reviewers the committed range or the function list, the affected
  areas, relevant sources, prior validation, decided non-issues, and
  applicable constraints. Require them to read `AGENTS.md`. The local holdout
  is open and may be used when relevant to the reviewed behavior.
- For `/audit-diff-correctness`, use default skill context routing. Add finder
  `audiences` only for exceptions or unusually large context; use `all` only
  for universal constraints.
- Run the pass in an isolated worktree pinned to the reviewed commit. Use
  `node scripts/audit-worktree.mjs prepare ...`, then `check` before launch.
  After preserving the report and proposed changes, run `cleanup`.
- Freeze the assigned scope. Later commits remain outside the pass and need
  review only as a later delta.
- Record the pass's counts, findings, rejections, unverified items, warnings,
  and validation through the quality commands below. The quality ledger is
  the durable record; no separate report file is retained.

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
- Keep `--evidence` to conclusions and context missing from the structured
  findings. The command adds the counts sentence; do not restate counts,
  findings, or validation totals in a second narrative. Preserve existing
  review history and useful rejection counter-evidence.
- Cite symbols by file and function name, not line numbers.
- A clarity or copyedit pass leaves no ledger record. State its elapsed wall
  time and finding counts in the progress report that announces it.
- Finish each formal review pass with `npm run quality -- --check`. Assign
  every unassigned `js/` file with `npm run quality -- assign`.
