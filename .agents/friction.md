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

### 2026-10-10 — accepted dependency verification exceeded the Git patch buffer

- Context: B rolling-boulder integration at
  `ddf5412d0452339261cff3b0fb162fba10f0b5a5`, while recording the
  `integrating` ledger event.
- Friction: the delivery inherited more than 120 accepted dependencies from a
  long-lived worker branch. `checkCandidate()` rehashed every accepted task,
  and a historical large commit exceeded its 32 MiB `git show` buffer. Two
  ledger attempts each spent about two minutes before failing.
- Evidence: the verifier failed in `contextFreePatchId()` with
  `spawnSync git ENOBUFS`; `git cherry` independently reported both B delivery
  patches as present in the candidate.
- Reason: `.agents/loop.md`, "Integration and publication", requires the exact
  delivery and dependency check before checkpoint validation.
- Outcome: `checkCandidate()` now returns immediately when the accepted
  integration is an ancestor of the candidate. Diverged histories still use
  the existing patch comparison, including repaired dependency branches.

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

### 2026-10-12 — preparation integration and ledger inspection retries

- Context: Prep13/v49 integration at `952e284d1885ab4da3be6155484a96bf2a955a1d`.
- Friction: `git merge --trailer` is unsupported; the first attempt exited 129 without changing the checkout. The attributed merge used `--no-commit`, followed by `git commit --trailer`.
- Evidence: the merge error was `unknown option trailer`; the successful candidate contains exactly 198 v49 case paths.
- Reason: integration preserves the submitted commit and requires the Codex attribution trailer.
- Outcome: the corrected merge and preflight passed; hosted checkpoint 38206234389 passed.

- Friction: B interpreted a transient ledger lock with an absent PID as potentially stale while the coordinator command handle remained live.
- Evidence: coordinator session 78133 completed its integration/preflight write; the lock then disappeared naturally. No lock was deleted.
- Reason: worker claims and coordinator transitions share the ledger lock.
- Outcome: B retried its claim after the writer completed. A PID check alone did not establish a stopped writer.

- Friction: Prep13 stores `missionPlan` as serialized JSON text. Enumerating it before checking its type generated hundreds of thousands of character-index keys in tool output.
- Reason: the coordinator verifies mission and overlap evidence before acceptance.
- Outcome: parsing the field as JSON allowed bounded summaries of its actual fields; all 57 independent replay hashes and 198 preserved attempt-file hashes passed.

### 2026-10-12 — dashboard browser module lookup

- Context: excluded-case dashboard validation at `452b6825c2f1cddb188e4df073c788211e080c87`.
- Friction: `NODE_PATH=$(npm root -g)` could not load Playwright.
- Evidence: the browser command reported `Cannot find module playwright`; an existing installation was found in the npm execution cache.
- Reason: frontend-rigor requires browser interaction checks for a changed filter.
- Outcome: the existing cached installation passed pointer, keyboard, exclusion disclosure, activity selection and responsive checks; no dependency was installed.
