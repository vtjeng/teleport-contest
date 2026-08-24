# How work flows

This file defines the vocabulary the other instruction files use and the
sequence every coherent implementation chunk follows before it is committed.
Four sibling files cover the rest: `.agents/loop.md` holds the
continuous-operation loop, `.agents/selection.md` states what to implement
next, `.agents/validation.md` states how to prove a change is right, and
`.agents/review.md` states when a formal review pass is due and how to run
one.

## Terms

Work is nested in three levels: a **coherent implementation chunk** is part
of a **behavior slice**, and slices make up a **goal**. `ROADMAP.md`
describes the group of game systems the current goals belong to.

A slice or a goal is **in progress** from the moment work starts
on it until it **closes**. Work written down but not begun is **queued**.
A goal closes when its last slice does.

A **coherent implementation chunk** is one reviewable production change with
its focused tests, and may be one of several commits inside a behavior slice.

A **behavior slice** runs from a starting point in the running game to the
next boundary at which the game's output can be observed. It closes only when
its real consumer (the production game path that consumes the new behavior)
executes and a fresh end-to-end differential verifies the boundary;
`.agents/validation.md`, "Fresh differentials", states how to run one. A
slice is the unit of evidence.

A **goal** is one coherent unit of behavior that may hold several ordered
behavior slices. When a goal is large enough to need a checklist (the
template in `.agents/implementation-checklist-template.md` states the
threshold), record the goal's state in
`.agents/implementation-checklist.json` so that later sessions can resume the
work. A goal is the unit of review: when its last slice closes, a full
correctness pass covers it. `scripts/scan-sessions.mjs` selects goals from
the development sessions; `.agents/selection.md` states how to run it.

A **review window** is the bounded group of related implementation chunks
covered by one scheduled correctness review. It completes when that review,
its required fixes, and the required post-fix validation are finished.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`. `.agents/review.md` defines the review vocabulary: a
formal review pass, an audit, and an evidence snapshot.

## Per-chunk workflow

For every coherent implementation chunk:

1. Add the new behavior to the production game path that consumes it (the real
   consumer), then run the checks in `.agents/validation.md`.
2. Assign every new `js/` file to exactly one `QUALITY.json` area as soon as
   the file is created, with `npm run quality -- assign --file <path>
   --area <id>`; `npm run quality -- areas` lists the ids. Include each
   untracked production file in the review-limit tally for its area, because
   `npm run quality` cannot measure files that are not yet committed.
3. Commit the implementation, then run `npm run quality` to display the
   scheduling dashboard.
4. Directly review source behavior, PRNG and evaluation order, parsing, state
   ownership, persistence, input boundaries, and rendering. Small mechanical
   or test-only changes may rely on immediate diff inspection and tests, but
   include them in the next scheduled correctness pass.
5. Collect score and validation evidence for the current behavior slice or
   review window. The slice-worker subagent (`.claude/agents/slice-worker.md`)
   reports the score and validation evidence; the orchestrator then appends
   the `SCORE.tsv` row as `.agents/scoring.md` states. Do not
   add a routine per-chunk `SCORE.md` row.

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
evidence-only commits) before the conversation turn ends. CI does not see a
commit until it is pushed, and it can fail where a local `npm run checkpoint`
passes because it runs from a fresh checkout on the Node version
`.github/workflows/score.yml` pins, currently 22.

```
gh run list --limit 1
gh run watch <id> --exit-status
```

Neither command needs a `--repo` flag: `gh repo set-default
vtjeng/teleport-contest` is set in this clone, and linked worktrees share that
config. Without `set-default`, `gh` queries `davidbau/teleport-contest` (the
`upstream` remote), which has no CI runs after June 2026, so `gh run list`
returns no matching run after a push. If `gh run list` ever shows runs you do
not recognize, run `set-default` again.

After pushing, watch the run from a background task and start the next slice
without waiting. CI runs are short (the two measured on 1 August 2026 took 1
minute 47 seconds and 1 minute 41 seconds). When a watched run fails, treat the
failure as the current slice's first item: diagnose the failure, fix it, push,
and watch the new run before the current slice closes.

## Progress reports

During implementation, validation, or review work, keep updates brief and
specific: report changed behavior, remaining work, and the next check when
useful, but do not force routine updates into a rigid template or repeat
unchanged status. Explain specialized terms on first use.

When switching between implementation, validation, and review, state the
switch once and explain why. Readiness checks and review-pass reports follow
the structures defined in `.agents/review.md`. Planning, process discussion,
questions, and other conversation about the workflow itself use ordinary
prose.
