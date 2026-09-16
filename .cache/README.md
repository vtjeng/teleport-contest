# .cache/

Context passed between agents and caches the tools keep. Replay caches and
current context files are replaced by their producers. Worker ledgers retain
events and delivery packets retain immutable evidence; use `worker-state.mjs`
to update them. Retained checkpoint evidence lives outside worktrees in the
shared Git directory; `.agents/validation.md`, "Routine validation", describes
its location and how to read it.

| File | Written by | Read by | Contents |
|---|---|---|---|
| `span-context.json` | `goal-log.mjs next-span` | span worker | Current span: goal, C file, functions, C line ranges, C line count, JavaScript file, sessions |
| `worker-state*.json` and their `.deliveries/` directories | `worker-state.mjs` | orchestrator and workers | Runtime ownership and delivery history; kept locally for recovery, never copied into tracked goal or investigation records |
| `scan-cache.json` | scan-sessions | scan-sessions, mismatch-queue, check-overread | Replay cache keyed by commit SHA |
| `session-results.json` | score-development | score-development | Scored session results from the last development run |
| `checkpoint-summary.json` | npm run checkpoint | orchestrator | Convenience copy of this worktree's latest completed checkpoint; shared results are authoritative |
| `compile-cache/` | Node.js | Node.js | V8 compile cache |
