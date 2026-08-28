# .cache/

Traced context passed between agents. Each file is overwritten when its
producer runs; none is committed.

| File | Written by | Read by | Contents |
|---|---|---|---|
| `candidate-pipeline.json` | pipeline-candidates | goal-selector, orchestrator | Candidates ranked by capped forecast, with readiness stage, witnesses, and detail |
| `goal-context.json` | goal-selector | slice-selector, worker | Current goal: boundary, owners, detail, witnesses |
| `slice-context.json` | slice-selector | worker | Current slice: C file, line range, JS location, call site |
| `session-frontiers.json` | scan-sessions | goal-selector, scan-sessions | Per-session cap cache and stability tuples |
| `scan-cache.json` | scan-sessions | scan-sessions | Replay cache keyed by commit SHA |
| `session-results.json` | score-development | score-development | Scored session results from the last development run |
| `checkpoint-summary.json` | npm run checkpoint | orchestrator | Last checkpoint's commit SHA, test verdict, score |
| `compile-cache/` | Node.js | Node.js | V8 compile cache |
