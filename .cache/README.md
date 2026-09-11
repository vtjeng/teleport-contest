# .cache/

Context passed between agents and caches the tools keep. Each file is
overwritten when its producer runs. Retained checkpoint evidence lives outside
worktrees in the shared Git directory; `.agents/validation.md`, "Routine
validation", describes its location and how to read it.

| File | Written by | Read by | Contents |
|---|---|---|---|
| `span-context.json` | `goal-log.mjs next-span` | span worker | Current span: goal, C file, functions, C line ranges, C line count, JavaScript file, sessions |
| `scan-cache.json` | scan-sessions | scan-sessions, divergence-queue | Replay cache keyed by commit SHA |
| `session-frontiers.json` | scan-sessions | scan-sessions | Per-session cap cache from the retired boundary census; selection no longer reads it |
| `session-results.json` | score-development | score-development | Scored session results from the last development run |
| `checkpoint-summary.json` | npm run checkpoint | orchestrator | Convenience copy of this worktree's latest completed checkpoint; shared results are authoritative |
| `compile-cache/` | Node.js | Node.js | V8 compile cache |
