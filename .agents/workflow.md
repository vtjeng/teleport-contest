# How work flows

This file defines the terms the other instruction files use and the
sequence every coherent implementation chunk follows before it is committed.
Four sibling files cover the rest: `.agents/loop.md` (the
continuous-operation loop), `.agents/selection.md` (what to implement
next), `.agents/validation.md` (how to prove a change is right), and
`.agents/review.md` (when a formal review pass is due and how to run one).

## Terms

A **coherent implementation chunk** is part of a **behavior slice**, and
slices make up a **goal**. `ROADMAP.md` describes the group of game systems
the current goals belong to.

A slice or a goal is **in progress** from the moment work starts
on it until it **closes**. Work written down but not begun is **queued**.
A goal closes when its last slice does.

A **coherent implementation chunk** is one reviewable production change with
its focused tests, and may be one of several commits inside a behavior slice.

A **behavior slice** runs from a starting point in the running game to the
next observable boundary. It closes only when its real consumer executes and
a fresh end-to-end differential verifies the boundary;
`.agents/validation.md`, "Fresh differentials", states how. A slice is the
unit of evidence.

A **goal** groups several ordered behavior slices. `GOALS.json` tracks each
goal's slices across sessions via `node scripts/goal-log.mjs`.
`scripts/scan-sessions.mjs` selects goals from the development sessions;
`.agents/selection.md` states how to run it.

A **review window** is the group of implementation chunks covered by one
scheduled correctness review. It completes when the review, its fixes, and
post-fix validation are finished.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`. `.agents/review.md` defines the review vocabulary: a
formal review pass, an audit, and an evidence snapshot.

## Per-chunk workflow

For every coherent implementation chunk:

1. Add the new behavior to its real consumer, then run the checks in
   `.agents/validation.md`.
2. Assign every new `js/` file to exactly one `QUALITY.json` area as soon as
   the file is created, with `npm run quality -- assign --file <path>
   --area <id>`; `npm run quality -- areas` lists the ids. Include each
   untracked production file in the review-limit tally for its area, because
   `npm run quality` cannot measure files that are not yet committed.
3. Commit the implementation, then run `npm run quality` to display the
   scheduling dashboard.
4. Collect score and validation evidence. The slice worker reports evidence;
   the orchestrator appends the `SCORE.tsv` row as `.agents/scoring.md`
   states. Do not add a routine per-chunk `SCORE.md` row.

A final integration runner, fixture, or test may remain uncommitted while it is
changing. Commit completed production behavior and focused tests as soon as
they are done, and commit each final integration artifact once it stops
changing, together with any code it validates that is not yet committed.

Close a behavior slice only after its real consumer executes and a fresh
end-to-end differential verifies the PRNG log, complete screens and attributes,
cursors, and persisted state through the next boundary. Unit tests can validate
a prerequisite but cannot close a code path whose real consumer has not
executed.

## Pushing and CI

Push when a behavior slice closes, and push every other commit (including
evidence-only commits) before the conversation turn ends. CI can fail where
a local `npm run checkpoint` passes because it runs from a fresh checkout on
the Node version `.github/workflows/score.yml` pins, currently 22.

```
gh run list --limit 1
gh run watch <id> --exit-status
```

Neither command needs `--repo`: `gh repo set-default vtjeng/teleport-contest`
is set in this clone, and linked worktrees share that config. Without it, `gh`
queries `davidbau/teleport-contest` (the `upstream` remote), which has no CI
runs after June 2026. If `gh run list` shows unrecognized runs, run
`set-default` again.

After pushing, watch the run from a background task and start the next slice
without waiting. CI runs take about 1 minute 45 seconds (measured 1 August
2026). When a run fails, diagnose, fix, push, and watch the new run before
the current slice closes.

## Progress reports

Keep updates brief and specific: report changed behavior, remaining work,
and the next check when useful. Do not repeat unchanged status. Explain
specialized terms on first use.

When switching between implementation, validation, and review, state the
switch once and explain why. Readiness checks and review-pass reports follow
`.agents/review.md`.
