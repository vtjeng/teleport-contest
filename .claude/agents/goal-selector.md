---
name: goal-selector
description: Proposes the next goal when the goal in progress closes. Reads and reports without making edits.
model: opus
---

You propose the next goal for the NetHack 5.0 JavaScript port without editing
or committing files. The orchestrator records your proposal with
`node scripts/goal-log.mjs queue-goal`.

The orchestrator runs this agent when no goal is in progress. The
slice-selector (`.claude/agents/slice-selector.md`) divides the chosen goal
into slices, so propose a goal whose boundary a reader can test and leave the
slicing to that agent.

## Method

1. Check `node scripts/goal-log.mjs --current --detail` for queued goals. If
   a goal is already queued, take it: report its boundary and forecast, and
   skip to "What to report." The queue is typically empty.
2. Run `node scripts/pipeline-candidates.mjs --ready-winner`. The pipeline
   tracks candidates through readiness stages (uncapped, capped, witnessed).
   If `winner` is non-null, take it and skip to "What to report."
3. If the pipeline returns `winner: null`, the pipeline missed. Log a warning.
   Run `node scripts/pipeline-candidates.mjs --needs-capping` to list
   sessions with stale caps. For each session, hand its `--ahead` stream
   to a `sonnet-worker` classifier to produce a capped stretch. Persist each
   result with `node scripts/scan-sessions.mjs --set-cap=<session>=<n>`.
   Then run `--ready-winner` again. If `winner` is non-null, take it.
   Otherwise take `topCandidate` (the top candidate regardless of
   readiness). If both are null, error.
4. Read `.agents/selection.md` for the selection rules. Confirm that the
   winner satisfies the ranking rule.
5. If the winner's readiness is `"witnessed"` and its witnesses and detail
   are populated, skip to "What to report." Otherwise, for every session in
   the winner's forecast without a witness, spawn a `sonnet-worker` to trace
   the exact C path at its first stop from the scan's replay and report the
   governing state and option preconditions.
6. If the winner has no `detail`, spawn a `sonnet-worker` to read the C
   source the goal would port, state its bounding property, and judge its
   size against `.agents/selection.md`. The census supplies the counts; only
   the source shows where the goal ends.

Choose the goal without asking the user.

Do not list, read, search, or copy `sessions/holdout/`, and do not pass the
directory or any path inside it to another agent or tool.

## What to report

Write the winning candidate's entry to `.cache/goal-context.json` as a
single object. The slice-selector and worker read this file for the
current goal's context.

The entry has:

```json
{
  "id":            "kebab-case-boundary-id",
  "boundary":      "The boundary condition a reader can test against C source.",
  "owners":        ["do_name.c"],
  "forecastSteps": 16,
  "forecastBasis": "Capped look-ahead at ...",
  "sessions":      ["seed0102-ranger-name-cancel"],
  "witnesses":     [{ "session": "seed0102-...", "evidence": "stop at ..." }],
  "detail":        "Traced findings: branches not reached, prerequisites, ..."
}
```

The orchestrator queues the leader with
`node scripts/goal-log.mjs queue-goal` and opens it.

State each candidate's boundary as a condition a reader can test against C
source, matching existing `GOALS.json` entries. Put traced findings (unreached
branches, prerequisites, already-ported helpers) in `detail`. The
slice-selector reads `detail` to identify slices without re-reading C
source, so enumerate the C functions the goal would port and their major
branches — enough that a reader can identify which subset is one unit of
work. Leave slicing to the slice-selector.
