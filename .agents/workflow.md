# How work flows

Read this file for the vocabulary the other instruction files use and for the
sequence every implementation chunk follows before it is committed.

Four sibling files cover the rest. `.agents/loop.md` holds the
continuous-operation loop, `.agents/selection.md` states what to implement
next, `.agents/validation.md` states how to prove a change is right, and
`.agents/review.md` states when a formal review pass is due and how to run
and record one.

## Terms

Work is nested in three levels. A **coherent implementation chunk** is part
of a **behavior slice**; slices make up a **goal**. A slice is the unit of
evidence and a goal is the unit of review. `ROADMAP.md` describes the group
of game systems the current goals belong to.

A slice or a goal is **in progress** from the moment work starts
on it until it **closes**. Work written down but not begun is **queued**.
Closing takes more than stopping: a slice closes on the evidence stated below,
and a goal closes when its last slice does.

A **coherent implementation chunk** is one reviewable production change with
its focused tests. A chunk may be one of several commits inside a behavior
slice.

A **behavior slice** runs from a starting point in the running game to the
next boundary at which the game's output can be observed. It closes only when
its real consumer runs and a fresh end-to-end differential verifies the
boundary. The real consumer is the production game path that consumes the new
behavior; `.agents/validation.md`, "Fresh differentials", states how to run a
fresh differential. A slice is the unit of evidence.

A **goal** is one coherent unit of behavior. It may
hold several ordered behavior slices. When a slice meets the conditions in
"Implementation checklist", `.agents/implementation-checklist.json` carries the
goal's state between sessions. A goal is the unit of review: when its last
slice closes, a full correctness pass covers it.

`scripts/scan-debt.mjs` selects each goal from every owner the development
sessions need; `.agents/selection.md` states how to run it.

A **review window** is the bounded group of related implementation chunks
covered by one scheduled correctness review. A review window completes when
that review, its required fixes, and the required post-fix validation are
finished.

An **evidence snapshot** is one `SCORE.tsv` row for the exact integrated code
state at a full commit SHA: `npm run checkpoint` appends a `checkpoint` row
after each scoring run, and agents append `slice`, `window`, `goal`,
`holdout`, and `publish` rows when those events complete, as
`.agents/validation.md`, "Score evidence", states. The quality ledger is
`QUALITY.json`, which records completed correctness and simplification
passes. Formal review ranges remain in that ledger.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`.

A **formal review pass** is an independent structured review of a frozen
committed range. It comes in four kinds: correctness, clarity, simplification,
and copyediting. The orchestrator invokes the skill that `.agents/review.md`
names for the kind it needs, which runs its reviewers as parallel subagents and
reports possible problems; the orchestrator reviews each finding and applies
only fixes for confirmed findings. All four kinds follow the process rules in
`.agents/review.md`, "Running formal review passes".

**Audit** means the same thing. That word is fixed in the skill names
`/audit-diff-correctness` and `/audit-diff-clarity`, and in the `Audit-fix-for:`
commit trailer.

## Per-chunk workflow

For every coherent implementation chunk:

1. Connect the production game path that consumes the new behavior (the real
   consumer), then run the checks in `.agents/validation.md`.
2. Assign every new `js/` file to exactly one `QUALITY.json` area as soon as
   the file is created. Count untracked production files toward review limits
   before the `npm run quality` scheduling dashboard can measure them. Even
   when the dashboard reports no debt, an unassigned `js/` file still needs
   its `QUALITY.json` area, and a threshold overrun you counted by hand still
   counts toward review limits.
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
changing. Commit completed production behavior and focused tests as soon as
they are done. Commit each final integration artifact once it stops changing,
together with any code it validates that is not yet committed.

Close a behavior slice only after its real consumer executes and a fresh
end-to-end differential verifies the PRNG log, complete screens and attributes,
cursors, and persisted state through the next boundary. Unit tests can validate
a prerequisite but cannot close a dormant path.

## Pushing and CI

Push when a behavior slice closes, and push any other commit, an evidence-only
one included, before the turn ends. CI does not see a commit until it is
pushed, and it can fail where a local checkpoint passes, because it runs from a
fresh checkout on the Node version `.github/workflows/score.yml` pins,
currently 22.

```
gh run list --limit 1
gh run watch <id> --exit-status
```

Neither command needs a `--repo` flag: `gh repo set-default
vtjeng/teleport-contest` is set in this clone, and linked worktrees share that
config. Without it `gh` answers for `davidbau/teleport-contest`, the `upstream`
remote, whose runs belong to someone else and stopped in June 2026, so a push
looks as though it started no run at all. If `gh run list` ever shows runs you
do not recognize, run `set-default` again.

After pushing, watch the run from a background task and start the next slice
without waiting; the two runs measured on 1 August 2026 took 1 minute 47
seconds and 1 minute 41 seconds. When a watched run fails, reopen the work
that pushed it as the current slice's first item: diagnose the failure, fix
it, push, and watch the new run before the current slice closes.

## Implementation checklist

Create or replace `.agents/implementation-checklist.json`, following the
schema in `.agents/implementation-checklist-template.md`, when a behavior
slice is expected to:

- span sessions;
- cross subsystems; or
- reach about 500 changed production lines.

Create the checklist as soon as a smaller slice grows to meet any of these
three conditions.

The orchestrator owns the checklist. Build the checklist's candidate entries
from upstream entry points, dispatch tables, catalogs, reachable helpers, and
valid input or configuration families. Cross-check those entries against
JavaScript stops, fallbacks, no-ops, and replay code. Maintain the list
throughout implementation. Passing samples do not prove completeness. When a
fresh case exposes an omitted path, add it and inspect related branches owned
by the same upstream function or subsystem.

Keep `mode` at `implementation` while any checklist entry is `missing` or
`undecided`. `.agents/implementation-checklist-template.md`, under
"Readiness", defines that mode and the alternative, `ready-for-audit`;
`scripts/audit-worktree.mjs prepare` enforces both and the `commitChecked`
match as data. Commit a checklist update in the same commit as the work it
describes; a checklist-only commit is for opening or retiring the file. Before
a formal review pass, the checklist evidence must apply to the exact committed
head. After
the slice closes and its evidence is recorded in existing trackers, remove the
checklist or replace it for the next qualifying slice. Smaller slices may keep
equivalent information in their commit messages and in the readiness
attestations
in `.agents/review.md`.

## Progress reports

During implementation, validation, or review work, keep updates brief, natural,
and specific. Report changed behavior, remaining work, and the next check when
useful. Do not force routine updates into fixed labels or repeat unchanged
status. Explain specialized terms on first use.

State a workflow-mode change once and explain why. Formal readiness
attestations and
pass reports keep their required structures. Planning, process discussion,
questions, and other meta-conversation use ordinary prose.
