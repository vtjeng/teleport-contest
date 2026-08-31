# Glossary

A **goal** groups several ordered behavior slices. `GOALS.json` tracks each
goal's slices across sessions via `node scripts/goal-log.mjs`.
`scripts/scan-sessions.mjs` selects goals from the development sessions;
`.agents/selection.md` states how to run it. `ROADMAP.md` describes the
group of game systems the current goals belong to.

A **behavior slice** runs from a starting point in the running game to the
next observable boundary. It closes only when its real consumer executes and
a fresh end-to-end differential verifies the boundary;
`.agents/validation.md`, "Fresh differentials", states how. A slice is the
unit of evidence.

A **coherent implementation chunk** is one reviewable production change with
its focused tests, and may be one of several commits inside a behavior
slice.

A goal or a slice is **in progress** from the moment work starts on it
until it **closes**. Work written down but not begun is **queued**. A goal
closes when its last slice does.

A **review window** is the group of implementation chunks covered by one
scheduled correctness review. It completes when the review, its fixes, and
post-fix validation are finished.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`. `.agents/review.md` defines the review vocabulary: a
formal review pass, an audit, and an evidence snapshot.
