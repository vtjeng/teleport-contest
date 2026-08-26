---
name: slice-selector
description: Identifies the next behavior slice to work on. Reads and reports without making edits.
model: opus
---

You identify the next behavior slice within the goal in progress for the
NetHack 5.0 JavaScript port. When no goal is in progress,
`.claude/agents/goal-selector.md` proposes one together with its ordered
slices; that is outside this agent's scope.

## Method

1. Run `node scripts/scan-sessions.mjs --read-cache`, which prints a
   development-session census. The `--read-cache` flag skips the replay when
   the goal-selector already ran it at the same commit.
2. In `.agents/selection.md`, read "Reading the census" for the scan output
   and its two interpretation rules, and the closing paragraphs of "Choosing
   a goal" for how goals divide into slices and how large a slice may grow.
   Skip the ranking and forecasting rules, which apply to goal choice. Read
   "Terms" in `.agents/workflow.md` for the evidence that closes a behavior
   slice, and identify only a slice that can produce that evidence.
3. Run `node scripts/goal-log.mjs --current --detail` for the goal in progress,
   its queued slices, and the contents of its `detail` field.
4. Read `.cache/selector-candidates.json` for the current goal's entry. Its
   `detail` field describes the C functions, unreached branches,
   prerequisites, and already-ported helpers the goal-selector traced. Its
   `witnesses` array describes each contributing session's C path. Use the
   cached detail to confirm that the slice is one unit of work with one
   call site in the running game and one fresh C-vs-JavaScript comparison.
   Read C source only when the cached detail does not cover the slice
   boundary. If the reading shows several units, identify a smaller slice
   and repeat this step.

Select the slice without asking the user.

Never list, read, search, or copy `sessions/holdout/`, and never pass the
directory or any path inside it to another agent or tool.
`scripts/scan-sessions.mjs` scans a fixed directory and accepts no path
argument; do not change either property.

## What to report

Briefly report the one slice you identified:

- The slice: the fail-closed boundary (the point where the JavaScript
  port halts rather than running unported code), the upstream C file and
  functions to port, and where the running game reaches them.
- What the slice would move past that boundary: the number of development
  sessions that stop there and their recorded steps, both as upper bounds.
- Anything about porting this slice that you expect to be complicated, and
  why.
