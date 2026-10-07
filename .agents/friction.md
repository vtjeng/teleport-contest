# Workflow friction log

Observations for later triage, not confirmed defects or approved changes.
The main orchestrator records its own friction and relevant worker reports.
Append short entries; add recurrences to an existing entry when recognized.

For each entry, record:

- Context: date, task, commit, and command or step.
- Friction: what happened and its impact—retries, blocked work, or time.
  Label estimates; leave unknowns explicit.
- Evidence: error excerpts and log, artifact, or run references. Preserve
  enough detail to understand the issue if temporary files disappear,
  including a special script's purpose and key operations.
- Reason: why the work was needed. Cite any instruction requiring it or
  earlier evidence that appeared to make a check redundant.
- Outcome: workaround, result, and remaining concern.

No solution or priority is required. Preserve entries and append later
triage decisions or fix references.

## Observations

### 2026-10-07 — failed hosted shard did not retain its test log

- Context: B136, `f9932445178a37fcbe5df051c1b9bb88a8b8e0c0`, hosted
  checkpoint run `37678802930`, test shard 1.
- Friction: the shard reported one failure among 2,158 tests, but neither the
  job log nor the uploaded `stage-tests-1` artifact retained the failed
  assertion. Diagnosis required two local shard runs and about four minutes;
  the first run also exhausted the focused runner's two-minute limit.
- Evidence: the artifact contained only `stage.json` with an ephemeral runner
  path `/tmp/teleport-checkpoint-cqGAP9/test-shard-1-4.log`.
  `gh run view --log-failed` printed only the checkpoint tail. Local bounded
  runs `run-L0i0LX` and `run-EFeecV` finally identified
  `scripts/detect.test.mjs:1474`.
- Reason: `.agents/loop.md`, "Integration and validation", requires diagnosing
  a completed checkpoint failure before integrating a correction.
- Outcome: the local full-profile reproduction exposed the stale trap redraw
  expectation. The corrected descendant passed hosted run `37680146646`.
  A future hosted failure can incur the same rerun when the failing assertion
  is outside the checkpoint tail.

### 2026-10-07 — ordered sync-main step cannot run around acceptance writes

- Context: B136 acceptance at
  `66b552d0bb2c158b1501eb551a9fc97b3fa47afc`; publication record commit
  `ea95cf8538fefc7bf235fb2a0b67b6f6b7f56705`.
- Friction: the ordered `sync-main --commit <accepted-commit>` step refused the
  dirty tree after `accept-task` wrote `GOALS.json`, `SCORE.tsv`, and accepted
  evaluations. After those required records were committed, the same command
  refused because local main was already a descendant and could not be
  fast-forwarded backward to the accepted commit.
- Evidence: the two errors were `main worktree has changes; preserve them
  before synchronization` and `local main cannot be fast-forwarded to this
  commit`.
- Reason: `.agents/loop.md`, "Integration and validation", orders source
  evidence and `accept-task`, worker continuation, then `sync-main`, dashboard
  generation, and the publication-record commit.
- Outcome: local and remote main were compared directly at
  `ea95cf8538fefc7bf235fb2a0b67b6f6b7f56705`, and the publication event passed.
  The documented sync step remains unusable at its ordered position.
