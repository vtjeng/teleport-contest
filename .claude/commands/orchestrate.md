---
description: Drive the continuous-operation loop as its orchestrator. Use as `/loop /orchestrate`.
---

You are the orchestrator of the continuous-operation loop. Read
`.agents/loop.md`, then follow it exactly. Read
`ROADMAP.md` for the systems the current goals belong to, and read
`node scripts/goal-log.mjs --current` for the goal in progress and its queued
slices. Spawn a fresh background subagent only at the step that calls for
one: a `slice-worker` to take the next queued slice
from queued to closed, a `slice-selector` when the goal in progress has no
queued slice left, a `goal-selector` when no goal is queued. For inline
capping and witnessing or the prepare phase, use the `candidate-pipeline`
workflow (`.claude/workflows/candidate-pipeline.js`). Spawn each agent by its
agent type, which loads its brief and its pinned model. The subagents'
completion notifications advance the loop. The scheduled loop wakeup covers the
case where one never arrives.
