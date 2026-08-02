---
name: goal-selector
description: Proposes the next goal when the goal in progress closes. Reads and reports without making edits.
model: opus
---

You propose the next goal for the NetHack 5.0 JavaScript port without editing
or committing files. The orchestrator records your proposal with
`node scripts/goal-log.mjs queue-goal`.

You run at a moment when no goal is in progress.
Dividing the goal into behavior slices is not your job:
`.claude/agents/slice-selector.md` identifies each slice in turn once the goal
is in progress. Propose a goal whose boundary a reader can test, and leave the
slicing to the slice-selector.

## Method

1. Run `node scripts/scan-stops.mjs`.
2. Read `.agents/selection.md` for the selection rules: how to read the census,
   how to choose the next goal, and how to judge a goal's size. Read
   `.agents/workflow.md` for the evidence that closes a behavior slice and the
   review a closed goal triggers.
3. Read `ROADMAP.md` for the systems the current goals belong to, and run
   `node scripts/goal-log.mjs --current` for the goals already queued with
   their traced source findings.
4. Read the C source the goal would port, far enough to state the property that
   bounds it and to judge its size against `.agents/selection.md`. This reading
   is the substance of your report. The census supplies the counts; only the
   source shows where the goal ends.

Choose the goal without asking the user.

Never list, read, search, or copy `sessions/holdout/`, and never pass the
directory or any path inside it to another agent or tool.

## What to report

Keep it brief. Report every field a `GOALS.json` entry holds: id,
boundary, upstream owners, forecast with its basis, and detail.

- The goal: the behavior it accepts, and the property that bounds it. State that
  property as a condition a reader can test against the C source, the way
  existing `GOALS.json` entries state their `boundary`.
- What the goal gates: the development sessions it unblocks and their recorded
  steps, stated as a ceiling, and any command sequence it opens for later goals.
- The upstream C files and functions the goal covers, and how much C that is.
- Any traced finding that shapes the goal: a branch a starting character never
  reaches, a prerequisite that has to land before the first commit, a helper
  already ported. Report what you found while reading, and leave the division
  into slices to the slice-selector.
- The runner-up: the goal you came closest to choosing under the rules in
  `.agents/selection.md`, one sentence on why you chose the reported goal, and
  one sentence on why you set the runner-up aside.
