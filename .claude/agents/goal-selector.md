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
2. Run `node scripts/scan-sessions.mjs --winner`. The script replays the
   development sessions (or uses a cached replay when HEAD has not moved),
   applies cached caps from `.cache/session-frontiers.json`, and returns the
   top cap-stable candidate as the winner. If no cap-stable candidate has
   forecast > 0, it returns `winner: null`.
3. Take the cap-stable candidate with the highest capped forecast. Break
   ties by session count. A cap-stable candidate is one whose sessions all
   have `capStable: true` or `divergenceZeroed: true`. Tentative candidates
   (sessions with null `cappedStretch`) are not eligible.

   If no cap-stable candidate has forecast > 0, run
   `node scripts/scan-sessions.mjs --needs-capping` to list the sessions
   that need capping. For each session, hand its `--ahead` stream to a
   `sonnet-worker` classifier to produce a capped stretch. Persist each
   result with `node scripts/scan-sessions.mjs --set-cap=<session>=<n>`.
   Then rerun `node scripts/scan-sessions.mjs --winner` and take
   the winner.
4. Read `.agents/selection.md` for the selection rules. Confirm that the
   winner satisfies the ranking rule.
5. For every session in the winner's forecast, confirm that a C-path witness
   exists. Read `.cache/goal-context.json`: if its `boundary` and `sessions`
   match the winner, reuse its cached witnesses verbatim. For each session
   without a cached witness, spawn a `sonnet-worker` to trace the exact C
   path at its first stop from the scan's replay and report the governing
   state and option preconditions.
6. Determine the winning candidate's bounding property and size. If
   `.cache/goal-context.json` matches the winner's `boundary` and
   `sessions`, reuse its cached `detail`. Otherwise spawn a `sonnet-worker`
   to read the C source the goal would port, state its bounding property,
   and judge its size against `.agents/selection.md`. The census supplies
   the counts; only the source shows where the goal ends.

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
